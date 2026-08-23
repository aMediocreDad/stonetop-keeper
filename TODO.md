# TODO — Ink & Stone backlog

Findings from an agent-driven session that restructured a campaign's whole threat
picture over MCP: ~20 writes across threats, characters, wonderings and the GM
journal. Everything below is something that actually bit during that run, not a
speculative wishlist. Ordered by how much it cost.

Kept deliberately free of campaign content — this repo is public.

## Where each fix lands

MCP server code is `mcp/src/`; app code is `app/`; a schema change is a new
timestamped migration under `supabase/migrations/`. Most of the list is
**MCP surface**.

Design constraint to respect throughout (`docs/mcp-server.md`): *write tools add and
amend only — no tool deletes anything, and undo stays in the app's Ledger.* Nothing
below asks for a delete.

---

## Blocked real work

### 1. Threat countdowns can be ticked but never authored

`ThreatSheet` carries `portents: {text, done}[]`, `impendingDoom: {text, done}`,
stakes and GM moves. `tick_portent` flips `done`. **No write tool sets any of that
text.** `create_character` / `update_character` expose only `instinct`.

So a threat created over MCP can never have a countdown. Both threats authored in
that session had to carry their portent ladders as Markdown inside `notes` — which
means the live threats are the ones that *can't* be ticked, while a retired one
still can.

The general rule worth adopting: **every field the read surface renders should have
a writer.** It catches this and most of what follows.

- [ ] Add portent/doom/stakes/GM-move writers to `mcp/src/writes.ts` + `tools.ts`
- [ ] Decide the shape: `set_threat_sheet` (whole-sheet replace) vs `add_portent` /
      `update_portent` (incremental). Incremental composes better with `tick_portent`
      and matches the amend-only posture

### 2. Threats have a lifecycle the schema doesn't model

Threats move foreshadowed → active → retired/resolved. There's no field for it, so
retiring one meant overwriting `role`, prepending a banner to `notes`, and finally
putting `⚠ RETIRED — DO NOT RUN THIS SHEET` in `instinct` — because the render order
is `instinct → portents → doom → stakes → GM moves → notes`, and a GM pulling the
brief mid-session would read five live portents before reaching any prose warning.

This is a status field, not a delete: the sheet stays, the Ledger stays, the history
stays.

- [ ] `status` enum on threats (`foreshadowed | active | retired | resolved`)
- [ ] Surface it **above** the countdown in `ThreatSheetCard` and in the MCP brief's
      threat rendering
- [ ] Filter or visually demote non-active threats in `get_campaign_brief`

### 3. No `create_location`

Only `update_location` exists. A place central to the campaign simply wasn't an
entity, and there was no way to make one — so two new threats couldn't be given a
`location` or pinned to a map at all.

- [ ] `create_location` in `mcp/src/writes.ts`, mirroring `create_character`'s
      name-collision behaviour

---

## Forced workarounds

### 4. `resolve_wonder` can't express "superseded"

Two wonderings were reframed rather than answered. The only available verb is
"resolved", so the truth had to be smuggled into the `resolution` string — and the
tool's own confirmation came back reading `marked answered — Superseded, not
answered`, which contradicts itself in one line.

- [ ] Either a status enum (`answered | superseded | dropped`) or a `superseded_by`
      pointer to the replacement wondering

### 5. Relations can't express how threats connect

`create_relation`'s type enum is social — `ami / famille / mentor / compagnon /
rival / ennemi / romance / connaissance / membre / autre`. Nothing covers "is the
discarded work of", "is caused by", "is the domestic face of". Threats are the
entities whose links most need traversing, and they're the ones the web can't hold.

Every cross-reference ended up as prose in a `Related:` line — invisible to the
relation graph.

- [ ] Add structural relation types (`causes`, `caused_by`, `manifestation_of`,
      `related_to`) or allow a free-text label alongside the enum

### 6. Replace-without-read is unguarded

`update_character(notes=…)` overwrites destructively. There's no dry-run, and no
requirement to have fetched the entity first. One sheet's `gm_notes` was
reconstructible only because the full prior text happened to still be in the agent's
context from an earlier read.

Claude Code's own `Edit` refuses to touch a file that hasn't been read in-session.
This has the same hazard with none of the guard.

- [ ] Return the **prior value** in the write response so it's always recoverable
- [ ] Consider requiring a prior fetch (or an `expected_version`) for whole-field
      replaces; `*_append` can stay unguarded

---

## Papercuts

### 7. French enum values on an English tool surface

`PJ / PNJ / GROUPE / MENACE` and `ami / famille / …`. Guessable, but `create_character`'s
description says *"type defaults to NPC"* while the actual value is `PNJ`.

- [ ] Accept English aliases, or at minimum spell the mapping out in the docstrings

### 8. No write grouping for undo

One coherent restructure produced ~20 independent Ledger entries. Backing it out
means 20 undos. The revisions layer in the init migration already groups by event, so
the substrate may be there.

- [ ] Optional `revision_id` / batch handle on writes, surfaced as one Ledger row

### 9. `append_gm_journal` is append-only with no handle

Reasonable for a log, but the journal reads as a working document. An earlier entry
describing a now-retired situation can never be corrected — the new entry just sits
below it, and both are equally authoritative to a reader.

- [ ] Return an entry id; allow amend or supersede (not delete)

### 10. `search_campaign` doesn't cover the GM journal

Its `types` are `pc, npc, group, threat, location, chronicle`. The free-form journal
scratchpad isn't searchable — its contents were only discoverable because
`get_campaign_brief` bundles them.

- [ ] Add `journal` (and `wonder`) to the search types

---

## Working well — don't regress these

- **`get_campaign_brief` with `sections`** is the standout. One call oriented an
  agent with zero prior knowledge on an entire campaign. The section filter is what
  makes it affordable.
- **`*_append` variants** are the right default and got used everywhere they existed.
  Item 6 is really a request for more of this posture, not less.
- **The Ledger line on every write** is good ambient reassurance during a long
  unattended run.
- **Guidance embedded in tool descriptions** — traits vs tags, *"a chronicle hit is
  drilled into with `get_chronicle`, not `get_entity`"* — prevented mistakes before
  they happened. Worth extending to `type` (see item 7).
