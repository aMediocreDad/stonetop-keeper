import { describe, expect, it } from 'vitest';
import { toSeasonHtml } from '../seasonHtml';

describe('toSeasonHtml', () => {
  it('returns empty input unchanged', () => {
    expect(toSeasonHtml('')).toBe('');
  });

  it('wraps legacy plain text in a paragraph', () => {
    expect(toSeasonHtml('The raid came at harvest.')).toBe('<p>The raid came at harvest.</p>');
  });

  it('splits legacy multi-line text into paragraphs', () => {
    expect(toSeasonHtml('First.\n\nSecond.\nThird.')).toBe(
      '<p>First.</p><p>Second.</p><p>Third.</p>',
    );
  });

  it('drops whitespace-only lines', () => {
    expect(toSeasonHtml('A.\n   \nB.')).toBe('<p>A.</p><p>B.</p>');
  });

  it('escapes HTML-significant characters in legacy text', () => {
    expect(toSeasonHtml('Bread & salt, 2 < 3')).toBe('<p>Bread &amp; salt, 2 &lt; 3</p>');
  });

  it('passes TipTap HTML through unchanged', () => {
    expect(toSeasonHtml('<p>Already <strong>rich</strong>.</p>')).toBe(
      '<p>Already <strong>rich</strong>.</p>',
    );
  });

  it('passes list HTML through unchanged', () => {
    expect(toSeasonHtml('<ul><li>a</li></ul>')).toBe('<ul><li>a</li></ul>');
  });
});
