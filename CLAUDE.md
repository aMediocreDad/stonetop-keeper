# CLAUDE.md — Ink & Stone

A self-hosted campaign journal for a **Stonetop** table: a React/Vite SPA on
Cloudflare Workers, Supabase (Postgres + Realtime) for data, and an MCP server
that exposes the campaign to Claude Code. Live at
<https://stonetop.amediocre.dad>.

```
app/        <- the React/Vite application
mcp/        <- the campaign MCP server (a Cloudflare Worker, scoped to /mcp)
supabase/   <- schema migrations + the local stack used as the test DB
docs/       <- mcp-server.md
```

`app/` and `mcp/` are siblings on purpose: `mcp/src` imports the shared core as
`../../app/src/lib/shared` and `mcp/tsconfig.json` maps `@/*` → `../app/src/*`.
Don't move either directory independently.

## Stack

React 19 + TypeScript + Vite 7 + Tailwind 3 + shadcn/ui. TipTap editor,
Sigma.js/graphology + d3-force graph, Zustand, React Router 7, Supabase
(anon-auth invite-code spaces, RLS-heavy), Vitest, Playwright.

## Commands (non-standard on purpose)

The app's scripts call node binaries directly rather than via `.cmd` shims —
defensive against a checkout path containing `&`, which breaks those shims on
Windows. Use the npm scripts; don't "simplify" them back to bare CLI names.

From `app/`:

- `npm run dev` — Vite dev server
- `npm run build` — `tsc -b` + vite build
- `npm run test` / `npm run test:watch` — Vitest
- `npm run test:e2e` — Playwright
- `npm run lint` — ESLint
- `npm run preview` — preview built app

From `mcp/`: `npm run test`, `npm run typecheck` (both tsconfigs).

From the repo root: `npm run deploy`, `npm run deploy:dry`.

## Deployment

- `npm run deploy` from the repo root builds `app/` (Supabase creds baked from
  `app/.env.local`), then `wrangler deploy` uploads `app/dist` as assets and
  the MCP Worker as `main`. `run_worker_first` scopes the Worker to `/mcp`;
  every other path is served asset-first with SPA fallback.
- `npm run deploy:dry` validates without deploying. First-time setup:
  `npx wrangler login`.
- **Deploy order matters.** `mcp/src/fetch.ts`'s `readAll` issues every read as
  one `Promise.all` and throws on any error, and every MCP tool routes through
  `loadCampaign`. A Worker deployed against a database missing a function the
  read layer expects breaks *every* MCP tool call, not just the new one. Apply
  the migration first, then deploy.
- Renaming the Worker in `wrangler.jsonc` creates a *new* Worker and orphans the
  custom-domain binding. The DNS record and certificate for
  `stonetop.amediocre.dad` belong to the existing one.

## Database

- The Supabase project is **production** — the real campaign lives in it. Treat
  it that way; it is not a scratch instance.
- The **test DB is a local Supabase stack** (`npx supabase start`), so no test
  can reach production even by accident. `npx supabase db reset` rebuilds it
  from `supabase/migrations/` on every run, which keeps the schema file
  continuously exercised instead of merely trusted.
- Schema changes go in a **new** timestamped migration under
  `supabase/migrations/`. Apply locally first, confirm it runs clean, then apply
  to production.
- Never hand-transcribe a PL/pgSQL body between environments, and remember that
  a clean apply proves nothing about a function body — assert behaviour.
- `pg_dump` emits ACL *state*, not the operations that produced it. Any
  revocation of a default-granted privilege silently fails to survive a
  dump/restore round trip, so re-check the `anon`/`authenticated` posture after
  one. The init migration ends with explicit `revoke`s for exactly this reason —
  leave them last.

## Licensing (enforced — see NOTICE.md)

- Code: MIT. Stonetop-derived text: **CC BY-SA 4.0** (ShareAlike applies to our
  modifications).
- The Stonetop **artwork is © Lucie Arnoux, all rights reserved — never copy art
  into the repo.** The Jason Lutes graphic-elements pack in
  `app/src/assets/stonetop/` is a separate, explicitly CC BY 4.0 collection.
- Attribution is a *condition of use*: `NOTICE.md`, `LICENSES/`, the
  `Jason Lutes, CC BY 4.0` comments beside each asset, and the in-app credit
  strings stay. Removing them makes the repo non-compliant, not safer.
- Copyright line name: **Filip Ambrosius**.
- Do not cite page numbers from the books. Describe the rule in prose instead;
  the citation is what turns a mechanic into a quotation.

## Conventions

- `.gitattributes` pins `* text=auto eol=lf`. Keep it — the data layer
  (`db.ts`, `types/index.ts`, `App.tsx`) is where EOL churn hurts most.
- No campaign content, invite codes, passwords, or personal filesystem paths in
  the tree. Fixtures use neutral names and `xx-xxx`-shaped invite codes.
- Some test/lint failures pre-date current work — before fixing "your" failure,
  check whether it exists on the base branch.
- Headless Chromium crashes on the TipTap sheets, so a green Playwright run is
  not evidence a sheet renders. Verify sheets headed or in jsdom. The app uses
  HashRouter, so deep links are `#/...`.

## Design Context

### Users

A tabletop group sharing one campaign wiki: players and a GM who join a space
with an invite code, then read and write character sheets, relationships,
locations, timelines, and maps — often mid-session at the table, sometimes on
a phone. The job to be done is *remembering the campaign*: "who was that NPC,
how do they relate to us, what happened last time." Reading dominates writing.

### Brand Personality

Handcrafted, literary, quiet. The app should feel like a well-kept campaign
journal — ink on aged paper — evoking calm and immersion, never urgency or
"productivity tool" energy. The GM's hidden layer (plum accent) feels like
notes in the margin only they can see.

### Aesthetic Direction

The **"Encre & Pierre"** design system in `app/src/index.css` is the single
source of truth — aged-paper backgrounds with SVG-noise grain, near-black ink
(`#1B1B1B`), grunge-stamp buttons (`.btn-ink`), seal dividers, and the
Stonetop CC-BY graphic assets (Jason Lutes) used as `mask-image` alpha stamps
tinted via `currentColor`. Three typographic voices, on purpose: Playfair
Display for display headings, Source Serif 4 for reading (the body default),
Alegreya Sans for UI chrome (buttons, fields, labels — `.font-body`,
`.label-overline`). Accents are scarce and semantic: gold `--graph-accent-pc`
for PCs, plum `--gm-accent` for GM-only, muted red for destructive.

**Light-only, by design.** The parchment look *is* the product identity; never
add a dark theme or dark-mode conditionals.

**Anti-references** — this must never look like: generic SaaS/shadcn defaults
(sterile grays leaking through the paper skin — restyle shadcn primitives via
the CSS variables, don't accept their stock look); fantasy kitsch (blackletter
fonts, medieval clipart, over-torn parchment edges); dense data-tool UI
(Notion/Airtable density — it's a journal, not a database front-end);
playful/cartoonish (bubbly shapes, emoji, saturated brights).

### Design Principles

1. **Ink on paper, always** — new UI uses the existing tokens
   (`--bg-card`, `--text-*`, `--border-*`) and paper/ink components
   (`.bg-paper-card`, `.btn-ink`, `.seal-divider`); never introduce ad-hoc
   colors or raw Tailwind grays.
2. **Two voices: read vs. manipulate** — long-form content stays serif
   (reading voice); interactive chrome stays Alegreya Sans. Don't mix them.
3. **Restraint over spectacle** — color and ornament carry meaning (PC gold,
   GM plum) or they don't appear; whitespace and typography do the hierarchy
   work.
4. **WCAG AA on parchment** — text colors are AA-checked against the paper
   backgrounds (`--text-faint` is decor-only, never load-bearing text;
   `--border-paper` is decorative, `--border-field` is the token for a control
   whose border is its sole delimiter); keep the unified ink focus ring and
   `prefers-reduced-motion` handling intact.
5. **Quietly alive** — motion is small, brief (~0.2s ease), and physical
   (a button lifting, a stamp pressing), never bouncy or attention-seeking.
