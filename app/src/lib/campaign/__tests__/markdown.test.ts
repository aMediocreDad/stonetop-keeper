import { describe, expect, it } from 'vitest';
import { SUPPORTED_TAGS, htmlToMarkdown, markdownToHtml } from '../markdown';
import { ALLOWED_TAGS } from '../../sanitizeHtml';

/**
 * The vault export's fidelity contract lives here. Stored notes are TipTap HTML
 * over a CLOSED tag set (`sanitizeHtml.ts` — StarterKit v3 with h2/h3 plus our
 * Mention extension), which is what makes a Markdown round-trip provable rather
 * than hopeful.
 *
 * `htmlToText` is the lossy one-way flattening the MCP used to read notes with;
 * this is the reversible pair that replaced it.
 *
 * CASES are written in the CANONICAL form — the markup `markdownToHtml` emits,
 * which is also what the editor stores. Where the editor decorates that form
 * with extra attributes (mentions carry `data-mention-suggestion-char`), a
 * separate test below feeds the real stored shape in.
 */

const MENTION =
  '<span data-type="mention" class="mention" data-id="pc:1" data-label="Ana">@Ana</span>';

const CASES: Array<[tag: string, html: string]> = [
  ['p', '<p>plain</p>'],
  ['p×2', '<p>First.</p><p>Second.</p>'],
  ['strong', '<p><strong>bold</strong></p>'],
  ['em', '<p><em>it</em></p>'],
  ['s', '<p><s>gone</s></p>'],
  ['u', '<p><u>under</u></p>'],
  ['code', '<p><code>x</code></p>'],
  ['pre', '<pre><code>a block</code></pre>'],
  ['blockquote', '<blockquote><p>quoted</p></blockquote>'],
  ['hr', '<p>a</p><hr><p>b</p>'],
  ['a', '<p><a href="https://x.test">link</a></p>'],
  ['ul', '<ul><li>one</li><li>two</li></ul>'],
  ['ol', '<ol><li>one</li><li>two</li></ol>'],
  ['nested ul', '<ul><li>a<ul><li>b</li></ul></li></ul>'],
  ['nested ol in ul', '<ul><li>a<ol><li>b</li><li>c</li></ol></li><li>d</li></ul>'],
  ['three-deep list', '<ul><li>a<ul><li>b<ul><li>c</li></ul></li></ul></li></ul>'],
  ['h2', '<h2>Head</h2>'],
  ['h3', '<h3>Sub</h3>'],
  ['br', '<p>a<br>b</p>'],
  ['mention', `<p>${MENTION}</p>`],
  ['nested marks', '<p><strong><em>both</em></strong></p>'],
  ['mixed', '<h2>Title</h2><p>Lead <strong>bold</strong>.</p><ul><li>a</li></ul>'],
  ['dash-leading paragraph', '<p>- not a list</p>'],
  ['number-leading paragraph', '<p>1. not a list</p>'],
  ['quote-leading paragraph', '<p>&gt; not a quote</p>'],
  ['hash-leading paragraph', '<p># not a heading</p>'],
  ['rule-leading paragraph', '<p>---</p>'],
  ['tag-shaped text', '<p>&lt;u&gt;not underline&lt;/u&gt;</p>'],
];

describe('markdown round-trip', () => {
  it.each(CASES)('%s survives html → md → html', (_tag, html) => {
    expect(markdownToHtml(htmlToMarkdown(html))).toBe(html);
  });

  it.each(CASES)('%s is idempotent in markdown form', (_tag, html) => {
    const md = htmlToMarkdown(html);
    expect(htmlToMarkdown(markdownToHtml(md))).toBe(md);
  });

  it('supports exactly the tags the sanitizer allows', () => {
    // The guard against silent drift: adding a TipTap extension widens
    // ALLOWED_TAGS, and this fails until the converter learns the tag — rather
    // than the export quietly dropping it.
    expect([...SUPPORTED_TAGS].sort()).toEqual([...ALLOWED_TAGS].sort());
  });
});

describe('htmlToMarkdown', () => {
  it('returns empty string for empty input', () => {
    expect(htmlToMarkdown('')).toBe('');
    expect(htmlToMarkdown(null)).toBe('');
    expect(htmlToMarkdown(undefined)).toBe('');
  });

  // Regression: the mention matcher required an EMPTY span, but the editor
  // writes the visible `@Label` inside it and adds its own attributes. Every
  // real mention therefore fell through and leaked its whole span into the
  // note — in the vault AND in what the MCP hands a model.
  it('renders a mention as a wikilink carrying its id', () => {
    const stored =
      '<p>Spoke to <span data-type="mention" class="mention" data-id="char:abc" ' +
      'data-label="Bhael" data-mention-suggestion-char="@">@Bhael</span> at dusk.</p>';
    expect(htmlToMarkdown(stored)).toBe('Spoke to [[Bhael|char:abc]] at dusk.');
  });

  it('escapes Markdown-significant characters in prose', () => {
    expect(htmlToMarkdown('<p>2 * 3 _really_ [x]</p>')).toBe('2 \\* 3 \\_really\\_ \\[x\\]');
  });

  it('decodes entities, leaving &amp; for last', () => {
    expect(htmlToMarkdown('<p>Ink &amp; Stone</p>')).toBe('Ink & Stone');
    expect(htmlToMarkdown('<p>&amp;lt; stays literal</p>')).toBe('&lt; stays literal');
  });

  it('writes editor headings at levels 5–6, below the vault structure', () => {
    expect(htmlToMarkdown('<h2>Rumours</h2>')).toBe('##### Rumours');
    expect(htmlToMarkdown('<h3>Deeper</h3>')).toBe('###### Deeper');
  });

  // Regression: the scanner collected only what was INSIDE a recognised block,
  // so anything between blocks vanished. The flattener it replaced kept it.
  it('keeps text that sits outside a block', () => {
    expect(htmlToMarkdown('hello <p>world</p>')).toBe('hello\n\nworld');
    expect(htmlToMarkdown('<p>a</p>tail')).toBe('a\n\ntail');
    expect(htmlToMarkdown('bare fragment')).toBe('bare fragment');
  });

  // Regression: a lazy `</ul>` closed the OUTER list at the INNER close tag, so
  // the nesting leaked into the note as raw markup and the tail was dropped.
  it('reads a list item that wraps its text in a paragraph', () => {
    expect(htmlToMarkdown('<ul><li><p>a</p></li><li><p>b</p></li></ul>')).toBe('- a\n- b');
  });

  it('drops a tag it does not know, keeping the text', () => {
    expect(htmlToMarkdown('<p>keep <span class="x">this</span> text</p>')).toBe('keep this text');
    expect(htmlToMarkdown('<p>and <mark>this</mark></p>')).toBe('and this');
  });

  // An empty non-mention span used to fall through to the `<br>` branch and
  // inject a hard line break where there had been markup.
  it('does not turn an empty span into a line break', () => {
    expect(htmlToMarkdown('<p>a<span class="x"></span>b</p>')).toBe('ab');
  });
});

describe('markdownToHtml', () => {
  it('returns empty string for empty input', () => {
    expect(markdownToHtml('')).toBe('');
    expect(markdownToHtml(null)).toBe('');
    expect(markdownToHtml(undefined)).toBe('');
  });

  it('escapes markup so authored text cannot inject tags', () => {
    expect(markdownToHtml('Ink & Stone <img src=x>')).toBe(
      '<p>Ink &amp; Stone &lt;img src=x&gt;</p>',
    );
  });

  it('accepts a bare wikilink with no id', () => {
    expect(markdownToHtml('[[Ana]]')).toBe(
      '<p><span data-type="mention" class="mention" data-id="" data-label="Ana">@Ana</span></p>',
    );
  });

  it('reads a hand-authored ## heading as a heading too', () => {
    expect(markdownToHtml('## Typed by hand')).toBe('<h2>Typed by hand</h2>');
    expect(markdownToHtml('### Typed by hand')).toBe('<h3>Typed by hand</h3>');
  });

  it('does not swallow a heading into the paragraph above it', () => {
    expect(markdownToHtml('text\n##### Head')).toBe('<p>text</p><h2>Head</h2>');
  });
});
