import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as shared from '../../../app/src/lib/shared';

const MCP_SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP_SRC = resolve(MCP_SRC, '../../app/src');
const SHARED = join(APP_SRC, 'lib/shared.ts');

/**
 * This Worker reaches into a package it is not built with: `app/` runs its own
 * `tsc -b` and knows nothing about us, so an app-side refactor can break this
 * deployment with every app check still green.
 *
 * `app/src/lib/shared.ts` is the declared seam. These tests are what make it a
 * contract rather than a comment.
 */
describe('the app seam', () => {
  it('is the ONLY app path this Worker imports', () => {
    const offenders: string[] = [];
    for (const f of readdirSync(MCP_SRC).filter((n) => n.endsWith('.ts'))) {
      for (const line of readFileSync(join(MCP_SRC, f), 'utf8').split('\n')) {
        const m = line.match(/from\s+'([^']*app\/src\/[^']+)'/);
        if (m && !m[1].endsWith('app/src/lib/shared')) offenders.push(`${f}: ${m[1]}`);
      }
    }
    // One seam, not nine. Point the new import at lib/shared and, if the name
    // isn't re-exported there yet, add it.
    expect(offenders).toEqual([]);
  });

  it('re-exports everything this Worker pulls at runtime', () => {
    for (const name of [
      'traverse',
      'DEFAULT_SECTIONS',
      'proseRenderer',
      'renderChronicle',
      'renderEntity',
      'htmlToText',
      'textToHtml',
      'CHARACTER_TYPES',
      'RELATION_TYPES',
      'normalizeSeason',
      'storedRev',
      'normalizeThreatSheet',
    ]) {
      expect(shared, `lib/shared.ts must export ${name}`).toHaveProperty(name);
    }
  });

  /** Every app module reachable from the seam, followed through relative imports. */
  function reachable(): string[] {
    const seen = new Set<string>();
    const queue = [SHARED];
    while (queue.length) {
      const file = queue.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      for (const m of readFileSync(file, 'utf8').matchAll(/from\s+'(\.[^']+)'/g)) {
        const base = resolve(dirname(file), m[1]);
        const hit = [base, `${base}.ts`, join(base, 'index.ts')].find((p) => {
          try { return statSync(p).isFile(); } catch { return false; }
        });
        if (hit) queue.push(hit);
      }
    }
    return [...seen];
  }

  it('reaches no DOM-dependent app module', () => {
    // Workers have no document/window. This is why app/src/lib/campaign/html.ts
    // hand-rolls its conversion instead of using sanitizeHtml.ts (DOMPurify).
    const offenders = reachable()
      .filter((f) => /\b(document|window|localStorage|navigator)\s*\./.test(readFileSync(f, 'utf8')))
      .map((f) => f.replace(`${APP_SRC}/`, ''));
    expect(offenders).toEqual([]);
  });

  it('reaches no `@/` VALUE import', () => {
    // Our vitest cannot resolve the app's `@` alias. `import type` is erased by
    // the transform and so is harmless; a runtime value is not.
    const offenders: string[] = [];
    for (const f of reachable()) {
      for (const line of readFileSync(f, 'utf8').split('\n')) {
        if (/^import\s/.test(line) && line.includes("'@/") && !/^import\s+type\s/.test(line)) {
          offenders.push(`${f.replace(`${APP_SRC}/`, '')}: ${line.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
