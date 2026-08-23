import { describe, expect, it } from 'vitest';

/**
 * `shared.ts`'s header (rule 2, its lines 15-24) claims this file checks
 * that its own transitive import graph (a) never touches the DOM and
 * (b) never carries a runtime *value* in across the `@/` alias — because
 * the `mcp/` Worker that consumes `shared.ts` by relative path has neither
 * `document`/`window` nor a resolver for `@/`. This is that test.
 *
 * STATIC, NOT DYNAMIC. Importing these modules at runtime and inspecting
 * them would prove nothing: this package's own vitest resolves `@/` just
 * fine, so a runtime import would either succeed (telling us nothing about
 * the Worker) or fail for an unrelated reason. Instead we read every file's
 * source text and resolve import/export specifiers ourselves — exactly what
 * mcp/'s bundler would have to do — starting at `shared.ts` and walking the
 * graph it actually reaches.
 *
 * `?raw`, not `node:fs`: `tsconfig.app.json` pins `types: ["vite/client"]`
 * across all of `src/` (tests included, this one too), so `node:fs`/
 * `node:path` don't typecheck here (confirmed empirically: a throwaway
 * `import { readFileSync } from 'node:fs'` under `src/lib/__tests__/` fails
 * `tsc -b` with TS2307). Vite's `import.meta.glob` sidesteps that — the same
 * trick already used one directory over for a narrower version of this same
 * check; see `campaign/__tests__/html.test.ts`'s "campaign core purity"
 * block. That one only globs `campaign/**` and checks every file it finds,
 * with no graph-following. `shared.ts`'s actual graph reaches well outside
 * `campaign/` (into `character/`, `timeline/`, `steading/`, `types/`), so
 * this test resolves real specifiers instead of assuming a subtree.
 */
const GLOB_SOURCES = import.meta.glob(['../../**/*.ts', '../../**/*.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function dirnameOf(key: string): string {
  const idx = key.lastIndexOf('/');
  return idx === -1 ? '.' : key.slice(0, idx);
}

/** Collapses `.`/`..` segments in a POSIX-style path. */
function normalize(p: string): string {
  const out: string[] = [];
  for (const part of p.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..' && out.length > 0 && out[out.length - 1] !== '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

/**
 * `import.meta.glob` keys are relative to *this test file's own directory*,
 * not to any fixed root — so the same file can legally be spelled two
 * different ways depending on which path arithmetic produced it (e.g.
 * `../constants.ts` vs `../../lib/constants.ts` both name
 * `src/lib/constants.ts`). Looking those up in the raw key-keyed map would
 * silently miss real files. Re-keying everything onto one canonical,
 * repo-rooted path — computed the same way regardless of which specifier
 * produced it — makes every spelling of the same file collide on purpose.
 */
const SOURCES = new Map<string, string>(
  Object.entries(GLOB_SOURCES).map(([key, src]) => [normalize(`src/lib/__tests__/${key}`), src]),
);

const ENTRY = 'src/lib/shared.ts';

/**
 * Resolves one import/export specifier written inside the file at
 * `fromCanonicalPath` to another file's canonical (repo-rooted) path.
 * Handles the extensionless `./foo` -> `foo.ts` form and the `./foo` ->
 * `foo/index.ts` form. Returns `null` only for a real npm package (no
 * leading `.` or `@/`) — that is outside `shared.ts`'s own graph and not
 * this test's concern. A `.`/`@/` specifier that resolves to nothing on
 * disk is a bug (in this resolver, or a real dangling import), not a
 * "skip" — so that case throws instead of silently shrinking the graph.
 */
function resolveSpecifier(fromCanonicalPath: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) {
    base = normalize(`src/${spec.slice(2)}`);
  } else if (spec.startsWith('.')) {
    base = normalize(`${dirnameOf(fromCanonicalPath)}/${spec}`);
  } else {
    return null; // a real npm package
  }
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (SOURCES.has(candidate)) return candidate;
  }
  throw new Error(
    `shared.test.ts: cannot resolve "${spec}" imported from ${fromCanonicalPath}. ` +
      `Either the glob pattern above needs widening, or this is a real dangling import.`,
  );
}

interface Stmt {
  kind: 'import' | 'export' | 'bare-import';
  spec: string;
  text: string;
  line: number;
}

/**
 * Strips comments while preserving every character offset that matters for
 * line-number reporting: block comments are blanked out character-for-
 * character (newlines inside them survive), and line comments are truncated
 * at end-of-line without touching the newline itself — so every remaining
 * `\n` is still exactly where it was in the original file. `(^|[^:])//` (not
 * bare `//`) keeps a `https://...` inside an actual `//` comment from ending
 * the strip one character early; it doesn't need to be bulletproof against
 * a `//` sitting inside a *string literal* mid-statement — the two rules
 * below only look at import/export statements and DOM-global identifiers,
 * neither of which this codebase writes containing a raw `//`.
 */
function stripComments(src: string): string {
  const noBlocks = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  return noBlocks.replace(/(^|[^:])\/\/.*$/gm, (_m, before: string) => before);
}

function lineOf(strippedText: string, index: number): number {
  return strippedText.slice(0, index).split('\n').length;
}

const IMPORT_FROM_RE = /^[ \t]*import\s[^;]*?from\s*['"]([^'"]+)['"]/gm;
const EXPORT_FROM_RE = /^[ \t]*export\s[^;]*?from\s*['"]([^'"]+)['"]/gm;
const BARE_IMPORT_RE = /^[ \t]*import\s*['"]([^'"]+)['"]/gm;

function parseStatements(stripped: string): Stmt[] {
  const stmts: Stmt[] = [];
  for (const { re, kind } of [
    { re: IMPORT_FROM_RE, kind: 'import' as const },
    { re: EXPORT_FROM_RE, kind: 'export' as const },
    { re: BARE_IMPORT_RE, kind: 'bare-import' as const },
  ]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(stripped))) {
      stmts.push({ kind, spec: m[1], text: m[0], line: lineOf(stripped, m.index) });
    }
  }
  return stmts;
}

/**
 * True if an `import ... from '...'` statement carries no runtime value —
 * the only shape shared.ts's graph may use for a `@/` specifier, since it's
 * the only shape `verbatimModuleSyntax` fully erases:
 *   - `import type X from '@/y'` / `import type { X } from '@/y'` — allowed.
 *   - `import { type X, type Y } from '@/y'` — allowed (every named binding
 *     individually marked `type`).
 *   - `import { type X, Y } from '@/y'`, `import X from '@/y'`,
 *     `import * as ns from '@/y'`, `import X, { type Y } from '@/y'` —
 *     forbidden: each carries at least one real runtime binding.
 */
function isErasableImport(statementText: string): boolean {
  if (/^\s*import\s+type\b/.test(statementText)) return true; // whole-clause `import type`

  const clauseMatch = /^\s*import\s+([\s\S]*?)\s+from\s*['"]/.exec(statementText);
  const clause = clauseMatch?.[1] ?? '';
  if (/^\*\s*as\s+/.test(clause)) return false; // `import * as ns` — a value

  const braced = /^([^{]*)\{([^}]*)\}\s*$/.exec(clause);
  if (!braced) return false; // bare default import, e.g. `import Foo from '...'`

  const [, before, inside] = braced;
  if (before.replace(/,/g, '').trim() !== '') return false; // `import Foo, { ... }`

  const names = inside
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return names.length > 0 && names.every((n) => /^type\s+/.test(n));
}

/**
 * DOM globals this codebase would plausibly reach for. Kept short and
 * concrete rather than exhaustive — generic-sounding names (`Node`,
 * `Element`) are left out because they collide with ordinary vocabulary
 * (a graph "Node", a campaign "Element") and would false-positive on this
 * codebase's own domain types, not on real DOM usage.
 */
const DOM_GLOBALS = [
  'document',
  'window',
  'DOMParser',
  'HTMLElement',
  'MutationObserver',
  'localStorage',
  'sessionStorage',
  'navigator',
];
const DOM_RE = new RegExp(`\\b(${DOM_GLOBALS.join('|')})\\b`, 'g');

interface Violation {
  file: string;
  line: number;
  detail: string;
}

function buildGraph(): {
  files: Map<string, string>;
  aliasViolations: Violation[];
  domViolations: Violation[];
} {
  const files = new Map<string, string>(); // canonical path -> comment-stripped source
  const aliasViolations: Violation[] = [];
  const domViolations: Violation[] = [];
  const queue: string[] = [ENTRY];

  while (queue.length > 0) {
    const key = queue.shift()!;
    if (files.has(key)) continue;
    const raw = SOURCES.get(key);
    if (raw === undefined) {
      throw new Error(`shared.test.ts: canonical path "${key}" vanished from SOURCES — resolver bug.`);
    }
    const stripped = stripComments(raw);
    files.set(key, stripped);

    DOM_RE.lastIndex = 0;
    let dm: RegExpExecArray | null;
    while ((dm = DOM_RE.exec(stripped))) {
      domViolations.push({
        file: key,
        line: lineOf(stripped, dm.index),
        detail: `references DOM global \`${dm[1]}\` — the mcp/ Worker has no document/window`,
      });
    }

    for (const stmt of parseStatements(stripped)) {
      if (stmt.spec.startsWith('@/')) {
        // `export ... from '@/...'` is always a violation, `type` keyword or
        // not: shared.ts's rule 2 draws the erasability line at `import
        // type`/inline `type` specifiers only (see isErasableImport) and this
        // test holds every other alias re-export shape to the same
        // conservative bar, matching the file header's own wording.
        const erasable = stmt.kind === 'import' && isErasableImport(stmt.text);
        if (!erasable) {
          aliasViolations.push({
            file: key,
            line: stmt.line,
            detail: `\`${stmt.text.trim()}\` carries a runtime value across '@/' — mcp/'s vitest cannot resolve the alias`,
          });
        }
      }
      const next = resolveSpecifier(key, stmt.spec);
      if (next && !files.has(next)) queue.push(next);
    }
  }

  return { files, aliasViolations, domViolations };
}

const { files, aliasViolations, domViolations } = buildGraph();

describe('shared.ts import-graph purity (mcp/ Worker seam)', () => {
  it('resolved a real graph, not a vacuous one', () => {
    // A resolver bug that quietly returned only the entry file would make
    // both purity checks below pass for the wrong reason. Pin down that the
    // walk actually left shared.ts and reached files in every directory its
    // own imports name.
    const reached = new Set(files.keys());
    const expectedFiles = [
      'src/lib/shared.ts',
      'src/lib/campaign/traverse.ts',
      'src/lib/campaign/render/prose.ts',
      'src/lib/campaign/html.ts',
      'src/lib/campaign/markdown.ts',
      'src/lib/campaign/types.ts',
      'src/lib/character/threatSheet.ts',
      'src/lib/character/groupMembers.ts',
      'src/lib/character/playbooks.ts',
      'src/lib/character/instinct.ts',
      'src/lib/timeline/seasonEntry.ts',
      'src/lib/steading/steading.ts',
      'src/lib/constants.ts',
      'src/types/index.ts',
    ];
    for (const expected of expectedFiles) {
      expect(reached.has(expected), `expected shared.ts's graph to reach ${expected}`).toBe(true);
    }
  });

  it("carries no runtime value across the '@/' alias anywhere in the graph", () => {
    if (aliasViolations.length > 0) {
      throw new Error(
        [
          `shared.ts's transitive graph (${files.size} files) may only cross '@/' as an ` +
            `erased type — mcp/'s vitest cannot resolve the alias. Violations:`,
          ...aliasViolations.map((v) => `  ${v.file}:${v.line} — ${v.detail}`),
        ].join('\n'),
      );
    }
    expect(aliasViolations).toEqual([]);
  });

  it('never references a DOM global anywhere in the graph', () => {
    if (domViolations.length > 0) {
      throw new Error(
        [
          `shared.ts's transitive graph (${files.size} files) must stay DOM-free — the mcp/ ` +
            `Worker has no document/window. Violations:`,
          ...domViolations.map((v) => `  ${v.file}:${v.line} — ${v.detail}`),
        ].join('\n'),
      );
    }
    expect(domViolations).toEqual([]);
  });
});
