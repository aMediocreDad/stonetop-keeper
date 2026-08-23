# CI/CD — Ink & Stone

Three systems, one job each. The division is deliberate: each vendor does the
thing it is good at, and GitHub Actions does nothing but prove the merge is
safe.

| System | Owns | Trigger |
|---|---|---|
| Cloudflare Workers Builds | build + deploy (app assets and the MCP Worker) | push to `main`, and PRs as previews |
| Supabase GitHub integration | applying migrations, deploying the declared edge function | merge to `main`, `supabase/` changes only |
| GitHub Actions (`ci.yml`) | lint, tests, schema behaviour | every PR and push to `main` |

The design goal is that **merging to `main` is safe**, rather than that a human
approves each migration afterwards. The proof moves left, into the pull
request. Which means the whole scheme rests on one setting.

## Branch protection is the load-bearing part

`ci.yml` does not make anything safe by existing. `main` must **require** the
`app`, `mcp`, `e2e` and `schema` checks. Without that, a direct push or an
auto-merged Dependabot PR reaches Supabase's integration with unproven schema,
and CI is decoration.

This is a repository setting (Settings → Branches), not something in the tree.
If it is ever switched off, this document is describing a system that no longer
exists.

## Why not the vendors' own CI for verification

Both Cloudflare and Supabase will happily build and migrate on merge, and both
are used for exactly that. Neither can express "run the SQL behavioural tests
against a throwaway database and refuse the merge if they fail" — so the gate
lives in Actions, and the vendors are left to do the deploying.

## `ci.yml`

**It needs no secrets.** The verification build runs without Supabase
credentials; Cloudflare does the credentialled build. So nothing here can leak
one, and a pull request from a fork still runs the full gate.

Four jobs, plus a path filter:

- **`app`** — `npm ci`, `lint`, `test`, `build`. `build` is `tsc -b` then vite,
  so it is the typecheck as well as the bundle.
- **`mcp`** — `npm ci`, `test`, `typecheck` (both tsconfigs).
- **`e2e`** — installs **branded Chrome**, not bundled Chromium, because
  `playwright.config.ts` pins `channel: 'chrome'`: headless Chromium crashes on
  the TipTap sheets, so a Chromium-green run would be worthless. The config's
  `webServer` builds `dist-e2e` and serves it, so there is no separate build
  step.
- **`schema`** — conditional; see below.

### The path filter is a job, not a trigger

`schema` only needs to run when `supabase/` changed, but the filtering is done
in a `changes` job whose output gates it with `if:` — *not* with `paths:` on the
trigger.

The reason is a GitHub footgun: a required check that never runs leaves the pull
request stuck on "expected — waiting for status" indefinitely. A **skipped job**
satisfies a required check; a **workflow that never started** does not. So the
workflow always runs, and the job decides for itself.

On `main` the filter always returns true. Main is the branch that migrates, and
`github.event.before` is unreliable — all-zeros on a new branch, wrong after a
force-push — so there is nothing to gain from being clever.

### `schema` is the job that matters

It is the gate on the half that cannot be rolled back. `supabase db reset`
rebuilds from `supabase/migrations/` alone, proving the migration applies from
nothing rather than merely having applied once, locally, months ago. Then every
scenario in `supabase/tests/` runs.

A clean apply proves only that the SQL parses. These scenarios assert
behaviour — which is the difference that matters for a function body.

## `supabase/tests/`

Six scenarios, restored from the pre-consolidation `db/tests/`:
`gm_journal`, `revisions`, `statblock`, `discoveries`, `discovery_block`,
`tone_and_content`.

Each is a plain `do $$ … raise exception 'FAIL …' $$` block that creates and
drops its own throwaway space, so they are order-independent and re-runnable.
There is no pgTAP and no framework: `psql -v ON_ERROR_STOP=1 -f` turns a raise
into a non-zero exit, and that is the entire assertion mechanism.

Run one by hand against the local stack:

```
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -v ON_ERROR_STOP=1 -f supabase/tests/gm_journal_verify.sql
```

**`character_instinct_verify.sql` was deliberately not restored.** It asserts
that a player writing `instinct` reads it back, which the mechanics gating
introduced in the old `15_statblock.sql` invalidated — it was written against
the schema as of `14`. It fails against the pre-consolidation files too, so it
is a stale test rather than a regression, and restoring it would have made the
new `schema` job red on day one. It remains in the archive if the intent behind
it is ever worth re-expressing.

## Cloudflare Workers Builds

Connect the repo to the existing `stonetop-keeper` Worker. Renaming it would
create a *new* Worker and orphan the custom-domain binding for
`stonetop.amediocre.dad`, so the name stays.

| Setting | Value |
|---|---|
| Root directory | `.` |
| Build command | `npm run build:app` |
| Deploy command | `npx wrangler deploy` |
| Non-production branches | **enable explicitly** — off by default |
| Build variables | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |

Two things worth knowing:

- **The build variables are not optional.** Vite inlines them at build time, so
  without them the build *succeeds* and ships an app that points nowhere. They
  belong in Workers Builds' build variables, which are build-time only — this is
  the one place where that limitation is exactly what is wanted.
- **Workers Builds ignores Custom Builds in `wrangler.jsonc`**, so the build
  command has to live in the dashboard rather than the repo. That is a genuine
  split-brain; this table is the record of it.

On a PR the deploy command becomes `wrangler versions upload`, which uploads a
preview version without promoting it to the active deployment.

## Supabase GitHub integration

Connect with working directory `.` (the repo root, where `supabase/` lives).

It watches `supabase/` only, so unrelated commits do not trigger it. On merge to
`main` it applies new migrations and deploys edge functions and storage buckets
**declared in `config.toml`** — and only those.

`[functions.map-image]` is now declared, with `verify_jwt = true`. That value
mirrors the live project, verified against it rather than inferred: it reads as
wrong beside the function's own header ("the app has no Supabase Auth users"),
but the two do not conflict. `supabase-js` sends the anon key as the
`Authorization` bearer and the anon key is itself a signed JWT, so the gateway
check passes; real authorisation is the per-space `x-space-token` header,
validated in SQL by `map_image_access`. Setting it to `false` would loosen
production on the next deploy.

Before this declaration existed the function was never redeployed on merge — it
sat at whatever version was last pushed by hand.

## The one race worth knowing about

Two independent integrations fire on the same merge, so nothing orders the
Supabase migration against the Cloudflare deploy. If the Worker lands first,
`mcp/src/fetch.ts`'s `readAll` issues every read in one `Promise.all` and throws
on any error, so **every** MCP tool fails — not just the one touching the new
column — until the migration catches up.

That is a transient outage of a minute or two which heals itself, not data loss.
Writing migrations additively (add before removing, never rename in place) makes
it a non-event, which is good practice regardless. It is documented rather than
engineered around; if it ever bites during a session, this is why.

## Running the schema gate locally

Needs Docker. If the Supabase CLI fails with a `gcloud` credential error, the
Docker credential helper is refusing to refresh — `gcloud auth login`, then
retry. Nothing on a GitHub runner is affected by this, since no such helper is
configured there.

```
npx supabase start
npx supabase db reset
for f in supabase/tests/*.sql; do
  psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
    -v ON_ERROR_STOP=1 -q -f "$f" || break
done
```
