/**
 * The declared surface the `mcp/` Worker may consume from the app.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `mcp/` is a separately deployed Cloudflare Worker that reaches into this
 * package by relative path (`../../app/src/lib/…`). It is NOT part of this
 * package's `tsc -b`, so nothing here fails when a module it imports moves —
 * the breakage only shows up at the Worker's own typecheck, or in production.
 *
 * Before this barrel, mcp reached into nine separate deep paths. Now it
 * imports this one file, so reorganising `lib/` is safe as long as this file
 * keeps re-exporting the same names.
 *
 * TWO RULES FOR ANYTHING ADDED HERE
 * ---------------------------------
 * 1. **No DOM.** The Worker has no `document`/`window`. This is why
 *    `campaign/html.ts` hand-rolls its conversion instead of using
 *    `sanitizeHtml.ts` (DOMPurify).
 * 2. **No `@/` VALUE imports** anywhere in the transitive graph. mcp's vitest
 *    cannot resolve the alias — `@/` survives only in `import type`, which the
 *    transform erases. Use relative imports for anything with a runtime value.
 *
 * Both rules are checked in `__tests__/shared.test.ts`.
 */

// --- Campaign graph: raw rows -> traversable graph -----------------------
export { traverse } from './campaign/traverse';
export type { CampaignGraph, RawCampaignData } from './campaign/types';

// --- Prose rendering (the MCP read tools' output format) -----------------
export {
  DEFAULT_SECTIONS,
  proseRenderer,
  renderChronicle,
  renderEntity,
} from './campaign/render/prose';
export type { BriefSection } from './campaign/render/prose';

// --- HTML <-> text, DOM-free (the MCP write tools' input format) ---------
export { htmlToText, textToHtml } from './campaign/html';

// --- HTML <-> Markdown, DOM-free and REVERSIBLE --------------------------
// What the MCP reads notes through (lists/headings/emphasis survive to the
// model) and what the vault export's fidelity contract rests on.
export { SUPPORTED_TAGS, htmlToMarkdown, markdownToHtml } from './campaign/markdown';

// --- Domain vocabulary and normalizers shared with the write tools -------
export { CHARACTER_TYPES } from '../types';
export { RELATION_TYPES } from './constants';
export { normalizeSeason, storedRev } from './timeline/seasonEntry';
export { normalizeThreatSheet } from './character/threatSheet';

// --- Row types -----------------------------------------------------------
export type {
  GmJournal,
  Season,
  Steading,
  ThreatSheet,
  Timeline,
  Wonder,
} from '../types';
