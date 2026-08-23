import { describe, expect, it } from 'vitest';
import { sanitizeRichHtml } from '../sanitizeHtml';

/**
 * La liste blanche doit couvrir le schéma Tiptap RÉEL (StarterKit v3 complet
 * + Mention) : une liste plus étroite efface en lecture du balisage que
 * l'éditeur a légitimement produit — régression silencieuse, le HTML stocké
 * restant intact (l'édition « ré-affiche » ce que la lecture perdait).
 */
describe('sanitizeRichHtml', () => {
  it('preserves every mark StarterKit can produce', () => {
    const html =
      '<p><s>barré</s> <u>souligné</u> <code>code</code> ' +
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow">lien</a></p>' +
      '<blockquote><p>citation</p></blockquote>' +
      '<pre><code>bloc</code></pre>' +
      '<hr>' +
      '<h2>titre</h2><ul><li>item</li></ul>';
    const out = sanitizeRichHtml(html);
    for (const fragment of [
      '<s>',
      '<u>',
      '<code>',
      '<a href="https://example.com"',
      '<blockquote>',
      '<pre>',
      '<hr>',
      '<h2>',
      '<li>',
    ]) {
      expect(out).toContain(fragment);
    }
  });

  it('keeps mention spans with their data attributes', () => {
    const html =
      '<p><span class="mention" data-type="mention" data-id="char:1" data-label="Vahid">@Vahid</span></p>';
    expect(sanitizeRichHtml(html)).toBe(html);
  });

  it('strips scripts, event handlers and javascript: URIs', () => {
    expect(sanitizeRichHtml('<p>ok</p><script>alert(1)</script>')).toBe('<p>ok</p>');
    expect(sanitizeRichHtml('<p onclick="alert(1)">ok</p>')).toBe('<p>ok</p>');
    expect(sanitizeRichHtml('<a href="javascript:alert(1)">x</a>')).not.toContain('javascript:');
    expect(sanitizeRichHtml('<img src="x" onerror="alert(1)">')).not.toContain('<img');
  });
});
