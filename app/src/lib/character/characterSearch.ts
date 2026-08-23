/**
 * Recherche du grimoire — ce qu'une requête regarde, et pourquoi une carte
 * sort.
 *
 * Le filtre d'avant ne lisait que des ATTRIBUTS (nom, rôle, lieu, tags,
 * traits) : « qui était ce PNJ qui devait quelque chose à la table » ne
 * trouvait rien, alors que la phrase est écrite dans les notes. On lit donc
 * aussi la PROSE de la fiche — notes, notes de MJ, fiche de menace, stat
 * block.
 *
 * SUR LA CONFIDENTIALITÉ, il n'y a rien à garder ici : le serveur a déjà
 * filtré la ligne pour le rôle qui l'a demandée. C'est
 * `app_character_row_for_role` (supabase-statblock.sql), appliquée sur le
 * CHEMIN DE LECTURE lui-même (`get_characters`, cross join lateral) autant
 * qu'aux retours d'écriture :
 *   * `v_row.gm_notes := null` pour tout rôle qui n'est pas 'gm' —
 *     inconditionnel, avant même le test des mécaniques ;
 *   * instinct / statblock / threat->'instinct' blanchis quand les mécaniques
 *     ne sont pas ouvertes (app_character_mechanics_open) ;
 *   * et une ligne gm_only n'arrive pas du tout (RLS).
 * « Chercher tout ce qu'on tient » est donc exactement « chercher ce qu'on a
 * le droit de voir » : une garde de plus ici ne protégerait rien et dériverait
 * de celle du serveur. Ce qui, en revanche, DOIT rester vrai : le jour où un
 * champ n'est plus blanchi côté serveur mais seulement masqué côté client, il
 * n'a pas sa place dans cette botte de foin — l'extrait de la carte le
 * peindrait.
 */
// Imports relatifs, comme les modules voisins de lib/ (cf. lib/statblock).
import type { Character } from '../../types';
import { htmlToText } from '../campaign/html';
import { instinctOf } from './instinct';
import { normalizeStatBlock } from './statblock';
import { normalizeThreatSheet } from './threatSheet';

/**
 * Champs lisibles. Les cinq derniers sont de la PROSE : rien ne garantit
 * qu'ils soient peints sur la carte, donc c'est ceux-là qu'il faut EXPLIQUER
 * quand ils sont la raison du match (cf. `explain`).
 */
export type MatchField =
  | 'name'
  | 'role'
  | 'instinct'
  | 'location'
  | 'tag'
  | 'trait'
  | 'notes'
  | 'gmNotes'
  | 'threat'
  | 'stats';

export type ProseField = Extract<MatchField, 'notes' | 'gmNotes' | 'threat' | 'stats'>;

/**
 * Rang d'un champ = à quel point la raison du match est ÉVIDENTE sur la
 * carte. Il sert deux fois : à trier (0 d'abord — taper un nom doit le
 * remonter au-dessus d'une fiche qui ne le mentionne que dans ses notes), et
 * à décider si la carte doit dire pourquoi elle est là (rang 2 seulement).
 */
const RANK: Record<MatchField, 0 | 1 | 2> = {
  name: 0,
  role: 1,
  instinct: 1,
  location: 1,
  tag: 1,
  trait: 1,
  notes: 2,
  gmNotes: 2,
  threat: 2,
  stats: 2,
};

const PROSE_FIELDS: ReadonlySet<MatchField> = new Set<MatchField>([
  'notes',
  'gmNotes',
  'threat',
  'stats',
]);

/** Un extrait de prose, sans le champ dont il vient (cf. MatchExplanation). */
export interface Snippet {
  /** Une ligne, tronquée aux mots, « … » quand elle est rognée. */
  snippet: string;
  /** Bornes du terme trouvé DANS `snippet` (pour l'appuyer à l'encre). */
  start: number;
  end: number;
}

export interface MatchExplanation extends Snippet {
  field: ProseField;
}

export interface CharacterMatch {
  /** Le meilleur rang trouvé — c'est la clé de tri. */
  rank: number;
  /** Champ du meilleur rang (`name` en tête), pour les tests et le débogage. */
  field: MatchField;
  /** Présent seulement quand la raison la plus obscure est de la prose. */
  explain?: MatchExplanation;
}

// ----------------------------------------------------------------------
// Pliage — casse ET accents, pour que « ovna » trouve « Övna » (les noms de
// Stonetop sont pleins de diacritiques, et personne ne les tape au téléphone
// en pleine partie). Même intention que compareNames (lib/sortByName), qui
// s'appuie sur localeCompare `sensitivity: 'base'` : ici il faut un `indexOf`
// sur du texte libre, donc on plie la chaîne au lieu de comparer.
// ----------------------------------------------------------------------
const DIACRITICS = /\p{Diacritic}/gu;

export function fold(source: string): string {
  return source.normalize('NFD').replace(DIACRITICS, '').toLowerCase();
}

/**
 * Pliage qui garde le chemin du retour : `map[i]` est l'index SOURCE du
 * caractère plié `i`. Un pliage change les longueurs (« Ö » se décompose en
 * deux unités puis en une, « İ » en donne deux) — sans cette table, les
 * bornes trouvées dans le texte plié désignent le mauvais endroit du texte
 * original, et l'extrait souligne à côté.
 *
 * Ne sert QUE sur le champ gagnant d'une fiche qui sort : c'est trop cher
 * pour la botte de foin entière (cf. `searchFields`).
 */
function foldWithMap(source: string): { text: string; map: number[] } {
  let text = '';
  const map: number[] = [];
  let at = 0;
  for (const point of source) {
    const folded = fold(point);
    for (let i = 0; i < folded.length; i++) map.push(at);
    text += folded;
    at += point.length;
  }
  return { text, map };
}

// ----------------------------------------------------------------------
// Botte de foin
// ----------------------------------------------------------------------
export interface SearchField {
  field: MatchField;
  /** Texte original (pour l'extrait). */
  text: string;
  /** Texte plié (pour le `includes`). */
  folded: string;
}

function push(into: SearchField[], field: MatchField, text: string | null | undefined): void {
  const value = (text ?? '').trim();
  if (value) into.push({ field, text: value, folded: fold(value) });
}

/**
 * Les champs DÉRIVÉS DE LA FICHE SEULE, mis en cache par objet `Character` :
 * dépiauter le HTML des notes à chaque frappe, sur chaque fiche, c'était le
 * seul vrai coût de l'élargissement. Un refetch produit de nouveaux objets,
 * donc l'entrée périmée s'en va avec eux — d'où la WeakMap plutôt qu'une clé
 * `id + updated_at` à maintenir.
 *
 * Le nom du LIEU n'est pas là : il ne vient pas de la fiche (renommer un lieu
 * ne touche pas les personnages qui y vivent), il serait donc périmé sans
 * qu'on le sache. Il est plié à l'appel — une chaîne courte, gratuite.
 */
const CACHE = new WeakMap<Character, SearchField[]>();

export function searchFields(c: Character): SearchField[] {
  const cached = CACHE.get(c);
  if (cached) return cached;

  const out: SearchField[] = [];
  push(out, 'name', c.name);
  // Le rôle porte son préfixe de livret en clair (« Lightbearer · … », cf.
  // lib/rolePrefix) : le texte brut suffit, pas besoin de le décoder.
  push(out, 'role', c.role);
  // instinctOf et pas la colonne : une révision restaurée peut encore porter
  // la forme threat.instinct, et la fiche la LIT — donc elle est cherchable.
  push(out, 'instinct', instinctOf(c));
  for (const tag of c.tags ?? []) push(out, 'tag', tag);
  for (const trait of c.traits ?? []) push(out, 'trait', trait.label);
  push(out, 'notes', htmlToText(c.notes));
  push(out, 'gmNotes', htmlToText(c.gm_notes));

  // normalizeThreatSheet / normalizeStatBlock, jamais le bloc brut : les
  // fiches d'avant la refonte 2026-07 et les révisions restaurées arrivent
  // avec des clés entières manquantes (même frontière de lecture que la
  // fiche et que la carte).
  if (c.threat) {
    const threat = normalizeThreatSheet(c.threat);
    push(out, 'threat', htmlToText(threat.impendingDoom.text));
    for (const portent of threat.portents) push(out, 'threat', htmlToText(portent.text));
    for (const stake of threat.stakes) push(out, 'threat', htmlToText(stake.text));
    for (const move of threat.gmMoves) push(out, 'threat', move);
  }

  const stats = normalizeStatBlock(c.statblock);
  if (stats) {
    push(out, 'stats', stats.damage);
    push(out, 'stats', stats.armorNote);
    push(out, 'stats', stats.specialQualities);
    for (const move of stats.moves) push(out, 'stats', move);
  }

  CACHE.set(c, out);
  return out;
}

// ----------------------------------------------------------------------
// Requête
// ----------------------------------------------------------------------
/**
 * Termes pliés et dédoublonnés. Découper sur les blancs rend « miller widow »
 * utile : les deux mots doivent apparaître, chacun n'importe où dans la fiche
 * (ET entre les termes, OU entre les champs). Avant, la requête entière était
 * cherchée d'un bloc et une phrase tapée de mémoire ne trouvait rien.
 */
export function searchTerms(query: string): string[] {
  const folded = fold(query).trim();
  if (!folded) return [];
  return [...new Set(folded.split(/\s+/).filter(Boolean))];
}

// ----------------------------------------------------------------------
// Extrait
// ----------------------------------------------------------------------
const SNIPPET_BEFORE = 34;
const SNIPPET_AFTER = 56;

/** Recule/avance jusqu'à une frontière de mot proche, pour ne pas couper un mot. */
function snapStart(text: string, at: number): number {
  if (at <= 0) return 0;
  const space = text.lastIndexOf(' ', at);
  return space > at - 12 && space >= 0 ? space + 1 : at;
}

function snapEnd(text: string, at: number): number {
  if (at >= text.length) return text.length;
  const space = text.indexOf(' ', at);
  return space !== -1 && space < at + 12 ? space : at;
}

/**
 * Une ligne de prose autour de la première occurrence, avec les bornes du
 * terme pour l'appuyer. La prose est repliée sur une seule ligne : les notes
 * sont multi-paragraphes et une carte de grille tient une ligne.
 */
export function snippetAround(source: string, term: string): Snippet | null {
  const flat = source.replace(/\s+/g, ' ').trim();
  const { text: folded, map } = foldWithMap(flat);
  const hit = folded.indexOf(term);
  if (hit === -1) return null;

  // Bornes du terme dans le texte ORIGINAL, via la table de pliage. La fin
  // vise le caractère suivant : `map` n'a pas d'entrée pour l'après-dernier.
  const from = map[hit] ?? 0;
  const to = hit + term.length < map.length ? (map[hit + term.length] ?? flat.length) : flat.length;

  const start = snapStart(flat, Math.max(0, from - SNIPPET_BEFORE));
  const end = snapEnd(flat, Math.min(flat.length, to + SNIPPET_AFTER));
  const head = start > 0 ? '…' : '';
  const tail = end < flat.length ? '…' : '';

  return {
    snippet: `${head}${flat.slice(start, end)}${tail}`,
    start: head.length + (from - start),
    end: head.length + (to - start),
  };
}

// ----------------------------------------------------------------------
// Le match
// ----------------------------------------------------------------------
/**
 * `null` quand la fiche ne répond pas à TOUS les termes.
 *
 * `locationName` est le nom résolu du lieu de la fiche (chaîne vide s'il n'y
 * en a pas) — l'appelant le tient déjà dans une Map, et le résoudre ici
 * coûterait un `find` par fiche et par frappe.
 */
export function matchCharacter(
  c: Character,
  locationName: string,
  terms: string[],
): CharacterMatch | null {
  if (terms.length === 0) return null;

  const own = searchFields(c);
  const place = locationName.trim();
  const haystack: SearchField[] = place
    ? [...own, { field: 'location', text: place, folded: fold(place) }]
    : own;

  let best: SearchField | null = null;
  // La raison la MOINS évidente de toute la requête : c'est elle qui mérite
  // d'être expliquée. Taper « cadmor forge » n'a pas à commenter le nom.
  let obscure: { hit: SearchField; term: string } | null = null;

  for (const term of terms) {
    let found: SearchField | null = null;
    for (const candidate of haystack) {
      if (!candidate.folded.includes(term)) continue;
      // Meilleur champ POUR CE TERME : le rang le plus fort d'abord.
      if (!found || RANK[candidate.field] < RANK[found.field]) found = candidate;
      if (RANK[found.field] === 0) break;
    }
    // Un seul terme manquant et la fiche sort : ET entre les termes.
    if (!found) return null;
    if (!best || RANK[found.field] < RANK[best.field]) best = found;
    if (!obscure || RANK[found.field] > RANK[obscure.hit.field]) obscure = { hit: found, term };
  }

  if (!best || !obscure) return null;

  const match: CharacterMatch = { rank: RANK[best.field], field: best.field };
  if (PROSE_FIELDS.has(obscure.hit.field)) {
    const explanation = snippetAround(obscure.hit.text, obscure.term);
    if (explanation) match.explain = { ...explanation, field: obscure.hit.field as ProseField };
  }
  return match;
}
