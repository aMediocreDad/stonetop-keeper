# Ink & Stone

> A campaign journal for your **Stonetop** table — characters, chronicle,
> maps, and the GM's margin notes. No accounts. Ink on paper.

A self-hosted campaign wiki for one long-running Stonetop game. Your group
joins a shared space with an invite code and password; everyone reads and
writes the same grimoire, live. It began as a fork of
[Zephyr-jdr/Ink-Stone](https://github.com/Zephyr-jdr/Ink-Stone) and has since
gone its own way — see [Upstream](#upstream).

---

## Features

- **Shared spaces** — join with an invite code + password, no account
  required. The GM password unlocks a hidden layer of the same wiki.
- **Character sheets** — role/playbook, location, traits, tags, rich notes;
  groups with derived membership; threats with full Stonetop threat sheets
  (instinct, grim portents, impending doom); discoveries, from a rumour to a
  full arcanum card.
- **Typed relationships** — friend, family, rival, enemy… each with free-text
  detail, drawn as an interactive graph (Sigma.js) you can filter by location,
  type, and relation.
- **Locations & the steading** — every place gets a sheet; one carries the
  full Steading Playbook (fortunes, surplus, debilities, improvements).
- **The chronicle** — a wheel of seasons for campaign history, with a shared
  strand and a GM-only strand, per-season conflict-safe saves, and presence.
- **Maps** — upload hand-drawn maps, pin characters, places, and free notes;
  sheets link back to where they're pinned.
- **Tone & content** — the table's shared concept, aim, tone and
  subject-matter agreement, readable by everyone and writable by players too.
- **GM layer** — GM-only notes, entities, relations, pins, and chronicle
  entries, invisible to players, plum in the margins for the GM.
- **Revision ledger** — every change captured, grouped by action, undoable
  from the Ledger page (GM).
- **Vault export** — the whole grimoire as an Obsidian-shaped Markdown vault,
  and back again.
- **Connect to Claude** — an MCP server exposes the campaign to Claude Code:
  read tools for session planning, write tools for post-session
  reconciliation (recap → chronicle, NPC updates, steading numbers, portent
  ticks), all covered by the ledger. See [docs/mcp-server.md](docs/mcp-server.md).

## Stack

React 19 · TypeScript · Vite 7 · Tailwind 3 · shadcn/ui · Framer Motion ·
TipTap · Sigma.js + graphology · Zustand · React Router 7 ·
**Supabase** (Postgres + Realtime) · **Cloudflare Workers** (hosting + the
MCP server).

## Layout

```
app/         the React/Vite application
mcp/         the campaign MCP server (a Worker, scoped to /mcp)
supabase/    schema migrations, and the local stack used as the test DB
docs/        mcp-server.md
```

---

## 1. Local development

```bash
cd app
npm install
npm run dev
```

The dev server starts at <http://localhost:5173>.

> Without `.env.local`, the app falls back to **localStorage** (handy for
> offline work). No demo data is seeded — you start with an empty grimoire
> and create one via the home page.

## 2. Database

The schema is one migration under `supabase/migrations/`, applied with the
[Supabase CLI](https://supabase.com/docs/guides/local-development):

```bash
npx supabase start      # local stack — this is the test database
npx supabase db reset   # rebuild it from the migration
```

Point the app at a project by setting `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` in `app/.env.local`.

## 3. Deploy

```bash
npm run deploy:dry      # validate
npm run deploy          # build app/ + upload the Worker
```

Hosting is Cloudflare Workers: `app/dist` is served as static assets with SPA
fallback, and the MCP Worker answers `/mcp`.

## Upstream

The original Ink & Stone is by [Zephyr-jdr](https://github.com/Zephyr-jdr) —
try it at [inkandstone.space](https://inkandstone.space/) and support them on
[Ko-fi](https://ko-fi.com/zephyrjdr). This project keeps their MIT licence and
credit; it is no longer a fork in any practical sense and sends nothing
upstream.

## Licensing

- **Code** — MIT, see [LICENSE](LICENSE).
- **Stonetop game content** — files such as
  `app/src/lib/steading/steadingSeed.ts` adapt text from *Stonetop*, by Jeremy
  Strandberg (published by
  [Lampblack & Brimstone](https://lampblackandbrimstone.com)), released under
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
  That content (including our changes and the French translation) is shared
  under the same license. See [NOTICE.md](NOTICE.md) for details.
- The books' artwork is © Lucie Arnoux, all rights reserved, and is not
  included in this repo. This project is unofficial and not affiliated with
  Lampblack & Brimstone.
