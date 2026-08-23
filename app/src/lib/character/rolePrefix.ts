/**
 * Codec « préfixe nommé · texte libre » partagé par les livrets (PJ) et les
 * archétypes de menace : le champ `role` reste la seule source de vérité
 * (« Blessed · initiate of Danu », « Undead · restless dead »), l'UI le
 * décompose en menu + texte libre et le recompose à la saisie. Zéro colonne
 * dédiée, zéro migration — les fiches saisies à la main se parsent telles
 * quelles.
 */

const SEPARATOR = ' · ';

/** « The Would-Be Hero » → « wouldbehero » : insensible à la casse, au
 *  « The » d'usage et à la ponctuation (tirets, espaces). */
function normalize(segment: string): string {
  return segment
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^a-z]/g, '');
}

export interface ParsedPrefix<K extends string> {
  prefix: K | null;
  /** Reste du rôle (texte libre), sans le nom reconnu ni le séparateur. */
  rest: string;
}

export function createRolePrefixCodec<K extends string>(
  entries: ReadonlyArray<{ key: K; name: string; aliases?: readonly string[] }>,
) {
  // `aliases` : anciens libellés qui doivent continuer à SE LIRE sans plus
  // s'écrire. Renommer un `name` casserait sinon en silence le parse des
  // fiches saisies sous l'ancien nom — elles garderaient leur préfixe visible
  // dans `role` pour toujours, sans jamais être promues.
  const byNormalized = new Map<string, K>();
  for (const e of entries) {
    for (const label of [e.name, ...(e.aliases ?? [])]) {
      const norm = normalize(label);
      if (!byNormalized.has(norm)) byNormalized.set(norm, e.key);
    }
  }
  const nameOf = new Map(entries.map((e) => [e.key, e.name]));

  function parse(role: string): ParsedPrefix<K> {
    const text = role.trim();
    if (!text) return { prefix: null, rest: '' };

    const dot = text.indexOf('·');
    if (dot >= 0) {
      const prefix = byNormalized.get(normalize(text.slice(0, dot)));
      if (prefix) return { prefix, rest: text.slice(dot + 1).trim() };
      return { prefix: null, rest: text };
    }
    const prefix = byNormalized.get(normalize(text));
    if (prefix) return { prefix, rest: '' };
    return { prefix: null, rest: text };
  }

  function compose(prefix: K | null, rest: string): string {
    const name = prefix ? nameOf.get(prefix)! : '';
    const tail = rest.trim();
    if (name && tail) return `${name}${SEPARATOR}${tail}`;
    return name || tail;
  }

  return { parse, compose };
}
