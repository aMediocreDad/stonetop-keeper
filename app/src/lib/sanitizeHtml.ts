import DOMPurify from 'dompurify';

/**
 * Assainit le HTML riche partagé entre joueurs avant un rendu statique
 * (`dangerouslySetInnerHTML`). Liste blanche alignée sur le schéma Tiptap
 * réellement actif : StarterKit v3 COMPLET — gras/italique, mais aussi Link
 * (autolink), Strike, Underline, Code, CodeBlock, Blockquote, HorizontalRule
 * — plus les titres h2/h3 (seuls niveaux configurés) et Mention. Une liste
 * plus étroite que le schéma ne « protège » rien : elle efface en lecture du
 * balisage que l'éditeur a légitimement produit (barré inversé de sens,
 * liens morts). DOMPurify neutralise de lui-même les URI javascript:.
 */
export const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'strike',
  'code', 'pre', 'blockquote', 'hr', 'a',
  'ul', 'ol', 'li', 'h2', 'h3', 'span',
];
const ALLOWED_ATTR = ['class', 'data-type', 'data-id', 'data-label', 'href', 'target', 'rel'];

export function sanitizeRichHtml(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
}
