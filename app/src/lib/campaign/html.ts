/**
 * TipTap HTML → plain text, for renderers that emit prose rather than markup.
 *
 * Deliberately not `sanitizeHtml.ts`: that uses DOMPurify, which needs a DOM
 * and therefore cannot run in a Worker. This is a pure string transform over
 * markup whose shape we control (StarterKit h2/h3 + our Mention extension).
 */
const MENTION_SPAN = /<span[^>]*data-label="([^"]*)"[^>]*>.*?<\/span>/gi;
const BLOCK_CLOSE = /<\/(?:p|li|h2|h3|ul|ol|blockquote)>/gi;

/**
 * Plain text → the minimal TipTap-compatible HTML the app stores: blank-line
 * separated paragraphs become `<p>`, single newlines become `<br>`. The
 * inverse direction of `htmlToText`, for writers (the MCP write tools).
 */
export function textToHtml(text: string | null | undefined): string {
  if (!text) return '';
  const escaped = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return escaped
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${block.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export function htmlToText(html: string | null | undefined): string {
  if (!html) return '';
  let out = String(html);

  out = out.replace(MENTION_SPAN, '$1');
  out = out.replace(/<li[^>]*>/gi, '- ');
  out = out.replace(/<br\s*\/?>/gi, '\n');
  out = out.replace(BLOCK_CLOSE, '\n');
  out = out.replace(/<[^>]+>/g, '');

  // `&amp;` last, so `&amp;lt;` decodes to `&lt;` and not to `<`.
  out = out
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

  return out
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n+ */g, '\n')
    .trim();
}
