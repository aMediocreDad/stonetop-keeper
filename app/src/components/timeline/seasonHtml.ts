/** Détecte une vraie balise (`<p>`, `</ul>`…) — pas un simple « 2 < 3 ». */
const TAG_RE = /<\/?[a-z][^>]*>/i;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Normalize une valeur de saison pour Tiptap : les anciennes saisies en
 * texte brut (pas de balise) deviennent des paragraphes échappés ; le HTML
 * produit par Tiptap passe tel quel.
 */
export function toSeasonHtml(value: string): string {
  if (!value || TAG_RE.test(value)) return value;
  return value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('');
}
