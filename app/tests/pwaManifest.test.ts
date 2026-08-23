import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pwaManifest } from '../src/pwaManifest';

const PUBLIC = join(process.cwd(), 'public');
const INDEX_HTML = join(process.cwd(), 'index.html');

/**
 * Reads width/height out of a PNG's IHDR chunk: 8-byte signature, then a
 * 4-byte length and the 4-byte type "IHDR", then width and height as
 * big-endian uint32s at offsets 16 and 20.
 */
function pngSize(path: string): { width: number; height: number } {
  const buf = readFileSync(path);
  expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe('web app manifest', () => {
  // The bug: `apple-touch-icon.png` was declared 180x180 and is actually
  // 512x512. Nothing in the build checks this — Chrome only complains at
  // runtime, in a console most people never open on their own site.
  it.each(pwaManifest.icons)('$src exists and really is $sizes', (icon) => {
    const path = join(PUBLIC, icon.src.replace(/^\//, ''));
    expect(existsSync(path), `${icon.src} is missing from public/`).toBe(true);

    const { width, height } = pngSize(path);
    expect(`${width}x${height}`).toBe(icon.sizes);
  });

  // Installability floor: Chrome wants at least one 512x512 icon.
  it('offers an icon large enough to be installable', () => {
    const big = pwaManifest.icons.some((i) => {
      const [w] = i.sizes.split('x').map(Number);
      return w >= 512;
    });
    expect(big).toBe(true);
  });

  // The regression that produced the reported error. vite-plugin-pwa injects
  // its own <link rel="manifest"> at build time; a hand-written one duplicates
  // it in production AND, in dev, points at a file the plugin never generates —
  // so Vite's SPA fallback answers with index.html and the browser reports
  // "Manifest: Line: 1, column: 1, Syntax error."
  it('does not hand-write a manifest link — the plugin owns it', () => {
    // Comments are stripped first: the note explaining WHY there is no manifest
    // link necessarily contains the words it is asserting about.
    const markup = readFileSync(INDEX_HTML, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    expect(markup).not.toMatch(/<link[^>]*rel=["']manifest["']/);
  });
});
