# Campaign MCP server — operator notes

An MCP server that exposes a campaign wiki to an LLM: read tools for session
planning, write tools for post-session reconciliation.
Design: `docs/superpowers/specs/2026-07-29-mcp-campaign-server-design.md` (reads)
and `docs/superpowers/specs/2026-07-30-mcp-write-tools-design.md` (writes + maps).
Plans: `docs/superpowers/plans/2026-07-29-mcp-campaign-server.md` (original build),
`docs/superpowers/plans/2026-07-30-mcp-per-request-credential.md` (the auth rework
described here).

## What it is

- Endpoint: `https://stonetop.amediocre.dad/mcp` — **one URL for every space**.
  No secret in the URL.
- Four read tools: `get_campaign_brief`, `search_campaign`, `get_entity`,
  `get_chronicle` — now including maps and their pins, rendered as prose
  ("Bhael (north-west)"), never the images (those stay behind the Edge
  Function). GM tokens also get the journal: open *I wonder…* questions ride
  in the default brief; the free-form GM notes are the opt-in `journal`
  section.
- Ten write tools: `save_chronicle_entry`, `create_character`,
  `update_character`, `create_relation`, `update_location`, `update_steading`,
  `tick_portent`, `add_wonder`, `resolve_wonder`, `append_gm_journal`. They add
  and amend only — **no tool deletes anything, and undo stays in the app's
  Ledger.**
- Runs as a Worker script on the **existing** deployment. `wrangler.jsonc` sets
  `main` plus `assets.run_worker_first: ["/mcp", "/mcp/*"]`, so only those paths
  reach the Worker; the SPA keeps being served straight from static assets.
- **The deployment holds no campaign credential.** No invite code, no GM
  password, no shared secret. Callers present the space token the app already
  issued them, and `app_space_from_token` resolves it to a space *and* a role.

## Auth — the caller's own space token

```
Authorization: Bearer <space token>
```

The token is the credential and the space selector at once. Because the read
RPCs filter GM content server-side by the session's `role`, whoever connects
sees exactly what they see in the app: a GM's token surfaces `gm_notes` and
`gm_entries`, a player's token cannot reach them.

The Worker checks only the header's *shape*. Validity is Postgres's call, and it
is first asked on a read RPC — inside a tool call, after `initialize` and
`tools/list` have already been answered.

| Case | Response |
|---|---|
| No `Authorization` header, or not a bearer | `404`, plain text |
| A bearer Postgres rejects (`INVALID_TOKEN`, errcode `28000`) | MCP tool error: "This campaign link is no longer valid…" |

**This server never returns `401`** — that is the response that makes MCP
clients start an OAuth discovery handshake we do not implement, and the SPA
answers `/.well-known/*` with `index.html` (see the gotcha below). A `404` for a
credential-less request keeps that whole path dormant. The consequence to know:
a garbled token still *connects* — `claude mcp add` and `/mcp` report the server
healthy, and the failure shows up on the first question asked of it.

## Connecting a client

Open the grimoire menu (the space name in the header) → **Connect to Claude**,
and copy the command. It is offered to every signed-in member, not just the GM.

```bash
claude mcp add --transport http stonetop https://stonetop.amediocre.dad/mcp \
  --header "Authorization: Bearer <token from the app>"
```

Then check `/mcp` in Claude Code for connection status.

**Header-capable clients only, for now.** Claude Code's `--header` is GA.
claude.ai and Claude Desktop custom connectors cannot send headers without the
beta, org-admin `static_headers` mode, and the alternative — putting the
credential in the URL — is precisely what this design rejects. See the spec's
"Out of scope" for what supporting them would take.

## The two secrets

Set from the repo root. These are interactive — run them yourself:

```bash
npx wrangler secret put SUPABASE_URL        # same as app/.env.local
npx wrangler secret put SUPABASE_ANON_KEY   # same as app/.env.local
```

`INK_INVITE_CODE`, `INK_GM_PASSWORD` and `MCP_SECRET` are **gone**. If they were
ever set on the account, delete them:

```bash
npx wrangler secret delete MCP_SECRET
npx wrangler secret delete INK_INVITE_CODE
npx wrangler secret delete INK_GM_PASSWORD
```

Both survivors already ship inside the SPA bundle, so they are not secret in any
strong sense — they stay `wrangler secret` entries rather than `vars` only to
keep a project URL and anon key out of the committed config and its git history.

## Security posture

The endpoint is public and unauthenticated requests get a `404`. What protects a
campaign is the token: `gen_random_bytes(24)` (192 bits), sha256-hashed at rest
in `space_sessions.token_hash`, so the plaintext exists only in the client that
joined.

**The command copied out of the app *is* a credential.** Anyone holding a GM's
command can read **and edit** that GM's whole layer. It belongs in a private
client config, not a shared channel, an issue tracker, or a screenshot.

Writes go through exactly the same `p_token` RPCs the app calls, so nothing is
reachable via MCP that the same token could not do in the app: role checks run
server-side (viewer tokens are read-only, GM fields and the GM strand need a GM
token), every write is captured by the revision-ledger triggers (`db/11`) and
is undoable from the app, and chronicle writes ride the per-season
compare-and-swap (`db/10`) — a conflict comes back as instructions carrying the
other side's text, never a silent overwrite. The Worker's write surface is a
closed list (`WRITES` in `fetch.ts`) with no `delete_*` or `undo_event` on it,
and a test asserts the tool list stays free of destructive names.

## Revoking access — a real limitation

**There is no per-token revocation today.** Specifically:

- Changing a space's GM or player password stops *new* joins with the old
  password but does **not** invalidate tokens already issued.
- App logout is local-only — it clears Zustand state and leaves the server
  session row intact.
- The 90-day `last_seen` cleanup described in `db/04` and `db/05` is **commented
  out** in both, and every read touches `last_seen` anyway.
- The only lever that invalidates tokens is `delete_space`, which purges the
  space.

So treat a leaked command as leaked until the space is deleted. Fixing this
properly means a purpose-minted token plus a targeted revoke RPC — two RPCs,
tracked in the spec's "Out of scope" alongside claude.ai support, because the
same work unlocks both.

## Caching

Each isolate caches a campaign snapshot **per token** (bounded at 8, oldest
evicted). Keyed by token rather than by space on purpose: one space can hold
several tokens with different roles, and a space-keyed cache would serve a
player the GM-filtered snapshot a GM's request populated.

There is no TTL. A deleted space can keep answering from a quiet isolate until
its entry is evicted — acceptable for a wiki being read for planning, where the
app itself is equally stale between refreshes.

Writes cut through the staleness where it matters: every write tool drops the
caller's snapshot **before** it runs (name resolution and read-modify-write
patches are computed off live state) and again after the RPC succeeds, so the
writing token always reads its own writes. Other tokens keep their snapshots
until eviction, same as before.

## Local development

```bash
cd app && npm run build     # the Worker serves assets from dist/
cd ../.. && npx wrangler dev
```

`wrangler dev` reads the two values from a `.dev.vars` file at the repo root
(`KEY=value` per line); that path is already git-ignored (`.gitignore:5-6`).

Smoke-test the routing without any credentials — this is the one failure mode
the test suites cannot catch, since they call `worker.fetch` directly:

```bash
curl -i http://localhost:8787/mcp          # expect: 404, text/plain, "Not found"
curl -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:8787/   # expect: 200 text/html
```

A `200 text/html` on `/mcp` means `run_worker_first` did not match and the SPA
answered instead. Then point MCP Inspector
(`npx @modelcontextprotocol/inspector`) at `http://localhost:8787/mcp` with the
bearer header, or add it to Claude Code the same way as production.

## Tests

```bash
cd app && npm run test   # shared core + app
cd mcp && npm run test   # worker + protocol
```

The Worker suite drives the real MCP handler end-to-end over JSON-RPC
(`initialize` → `tools/list` → `tools/call`) against a Supabase mock keyed on
`p_token`, so protocol conformance, the read-only invariant, role scoping, and
cache isolation between two tokens are all covered without deploying.

## Gotcha: `/.well-known/*` returns HTML, not 404

With `not_found_handling: single-page-application` and the Worker scoped to
`/mcp` and `/mcp/*`, a request to `/.well-known/…` is answered by the SPA's
`index.html` with a `200`. Anthropic's connector docs flag this exact situation
for "Cloudflare Workers without a `/.well-known/*` route". It stays harmless
**only because this server never returns `401`** — that is the response that
makes clients probe those paths. Respect that if the status codes are ever
revisited. If a connector handshake misbehaves, check here first; the fix is
adding `/.well-known/*` to `run_worker_first` and serving proper
protected-resource metadata.

## Where the code lives

| Path | What |
|---|---|
| `app/src/lib/campaign/` | shared pure core: `traverse()` + renderers + `textToHtml`. No I/O, relative imports only, nothing browser-only (a test enforces this). |
| `mcp/src/` | the Worker: `auth.ts` (bearer extraction), `fetch.ts` (RPCs, per-token cache, the closed `WRITES` list), `query.ts` (search/resolve), `result.ts` (tool-result plumbing), `tools.ts` (read tools), `writes.ts` (write tools), `index.ts`. Owns no campaign rendering logic. |
| `app/src/components/modals/ConnectLlmModal.tsx` | the copy affordance, reached from `SpaceSwitcher` |
| `wrangler.jsonc` | `main` + `run_worker_first` |

A future campaign **export** is meant to be an add-on: a second renderer in
`campaign/render/` plus a download button, with no change to `traverse.ts` or
`types.ts`. If an export ever requires editing those, the seam was drawn wrong.
