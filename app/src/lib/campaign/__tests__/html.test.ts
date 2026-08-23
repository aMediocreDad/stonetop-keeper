import { describe, it, expect } from 'vitest';
import { htmlToText, textToHtml } from '../html';

describe('textToHtml', () => {
  it('returns empty string for empty input', () => {
    expect(textToHtml('')).toBe('');
    expect(textToHtml(null)).toBe('');
    expect(textToHtml(undefined)).toBe('');
  });

  it('wraps blank-line separated blocks in paragraphs', () => {
    expect(textToHtml('First.\n\nSecond.')).toBe('<p>First.</p><p>Second.</p>');
  });

  it('turns single newlines into <br>', () => {
    expect(textToHtml('a\nb')).toBe('<p>a<br>b</p>');
  });

  it('escapes markup so written text cannot inject tags', () => {
    expect(textToHtml('Ink & Stone <img src=x>')).toBe(
      '<p>Ink &amp; Stone &lt;img src=x&gt;</p>',
    );
  });

  it('round-trips through htmlToText', () => {
    expect(htmlToText(textToHtml('First.\n\nSecond.'))).toBe('First.\nSecond.');
  });
});

describe('htmlToText', () => {
  it('returns empty string for empty input', () => {
    expect(htmlToText('')).toBe('');
    expect(htmlToText(null)).toBe('');
    expect(htmlToText(undefined)).toBe('');
  });

  it('strips tags and joins blocks with newlines', () => {
    expect(htmlToText('<p>First.</p><p>Second.</p>')).toBe('First.\nSecond.');
  });

  it('renders mention spans as their data-label', () => {
    const html =
      '<p>Spoke to <span data-type="mention" data-id="char:abc" data-label="Bhael">@Bhael</span> at dusk.</p>';
    expect(htmlToText(html)).toBe('Spoke to Bhael at dusk.');
  });

  it('marks list items with a dash', () => {
    expect(htmlToText('<ul><li>Grain</li><li>Timber</li></ul>')).toBe('- Grain\n- Timber');
  });

  it('turns <br> into a newline', () => {
    expect(htmlToText('<p>a<br />b</p>')).toBe('a\nb');
  });

  it('decodes entities, leaving &amp; for last', () => {
    expect(htmlToText('<p>Ink &amp; Stone</p>')).toBe('Ink & Stone');
    expect(htmlToText('<p>&amp;lt; stays literal</p>')).toBe('&lt; stays literal');
    expect(htmlToText('<p>a&nbsp;b</p>')).toBe('a b');
  });

  it('collapses runs of whitespace and blank lines', () => {
    expect(htmlToText('<p>a   b</p>\n\n<p>  c  </p>')).toBe('a b\nc');
  });
});

// --- Purity guard: this is what keeps the export seam (spec §6) from rotting.
//
// Reads the core's own sources via Vite's `?raw` glob rather than node:fs,
// because `tsconfig.app.json` pins `types: ["vite/client"]` on purpose — Node
// APIs are kept out of browser code, tests included.
describe('campaign core purity', () => {
  const SOURCES = import.meta.glob('../**/*.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;

  const FORBIDDEN = [
    { pattern: /from\s+['"]@\//, why: "the '@/' alias — the Worker bundler cannot resolve it" },
    { pattern: /from\s+['"]dompurify['"]/, why: 'dompurify is browser-only' },
    { pattern: /from\s+['"]zustand/, why: 'the store is browser-only' },
    { pattern: /\bimport\.meta\.env\b/, why: 'Vite env is not available in the Worker' },
    { pattern: /\bdocument\.|\bwindow\./, why: 'the DOM is not available in the Worker' },
    { pattern: /\bfetch\s*\(/, why: 'the core must do no I/O' },
    { pattern: /from\s+['"][^'"]*\/db['"]/, why: 'db.ts does I/O and is browser-only' },
  ];

  it('imports nothing browser-only and does no I/O', () => {
    const files = Object.entries(SOURCES).filter(([file]) => !file.includes('__tests__'));
    expect(files.length).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const [file, src] of files) {
      for (const { pattern, why } of FORBIDDEN) {
        if (pattern.test(src)) violations.push(`${file}: ${why}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
