import type { CampaignGraph } from '../../app/src/lib/shared';

export const KINDS = ['pc', 'npc', 'group', 'threat', 'discovery', 'location', 'chronicle'] as const;
export type SearchKind = (typeof KINDS)[number];

export interface Hit {
  kind: SearchKind;
  name: string;
  id: string;
  snippet: string;
}

/**
 * Notes reach us as Markdown now, so the raw text carries `**`, `~~`, backticks
 * and `[[wikilinks]]`. Matching against those would fail a search for a word the
 * GM emphasised, and snippets would start mid-delimiter. Marks are removed for
 * BOTH the haystack and the snippet — the model wants the sentence, not the
 * formatting.
 *
 * Positions must stay aligned between the two, so every replacement keeps the
 * text it wraps and only drops the delimiter characters.
 */
function stripMarks(s: string): string {
  return s
    .replace(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // One pass, not two: the writer ESCAPES a delimiter that is really text
    // (`snake\_case`, `2 \* 3`), so a bare `[*_~\`]` sweep would leave the
    // backslash behind and a search for the word the GM typed would miss it.
    // An escaped character survives without its backslash; an unescaped
    // delimiter is markup and goes.
    .replace(/\\([\s\S])|[*_~`]/g, (_all, escaped?: string) => escaped ?? '')
    // Headings reach here at 5–6 (`markdown.ts` keeps 2–4 for vault structure),
    // but a hand-authored `##` is a heading too.
    .replace(/^#{2,6}\s+/gm, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/^>\s?/gm, '');
}

/** Case-insensitive substring search with a short surrounding snippet. */
export function searchGraph(graph: CampaignGraph, query: string, kinds?: SearchKind[]): Hit[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const want = (k: SearchKind) => !kinds?.length || kinds.includes(k);
  const hits: Hit[] = [];

  const snippetOf = (haystack: string): string => {
    const at = haystack.toLowerCase().indexOf(needle);
    if (at < 0) return '';
    const start = Math.max(0, at - 60);
    return `${start > 0 ? '…' : ''}${haystack.slice(start, at + needle.length + 60).trim()}…`;
  };

  for (const c of graph.characters) {
    if (!want(c.kind)) continue;
    const haystack = stripMarks(
      [c.name, c.role, c.instinct, c.notes, c.gmNotes, c.tags.join(' ')].join('\n'),
    );
    if (haystack.toLowerCase().includes(needle)) {
      hits.push({ kind: c.kind, name: c.name, id: c.id, snippet: snippetOf(haystack) });
    }
  }
  if (want('location')) {
    for (const l of graph.locations) {
      const haystack = stripMarks(
        [l.name, l.description, l.notes, l.gmNotes, l.tags.join(' ')].join('\n'),
      );
      if (haystack.toLowerCase().includes(needle)) {
        hits.push({ kind: 'location', name: l.name, id: l.id, snippet: snippetOf(haystack) });
      }
    }
  }
  if (want('chronicle')) {
    for (const e of graph.chronicle) {
      const haystack = stripMarks([e.title, e.body].join('\n'));
      if (haystack.toLowerCase().includes(needle)) {
        hits.push({
          kind: 'chronicle',
          name: `Year ${e.year}, ${e.season}${e.strand === 'gm' ? ' [GM]' : ''}`,
          id: `${e.year}:${e.season}:${e.strand}`,
          snippet: snippetOf(haystack),
        });
      }
    }
  }
  return hits;
}

export type ResolvePool = 'characters' | 'locations' | 'both';

/** Resolve a name or id to a single entity id, or report the ambiguity. */
export function resolveEntityId(
  graph: CampaignGraph,
  nameOrId: string,
  pool: ResolvePool = 'both',
): { id: string } | { candidates: string[] } {
  const needle = nameOrId.trim().toLowerCase();
  const all = [
    ...(pool === 'locations' ? [] : graph.characters.map((c) => ({ id: c.id, name: c.name }))),
    ...(pool === 'characters' ? [] : graph.locations.map((l) => ({ id: l.id, name: l.name }))),
  ];
  const byId = all.find((e) => e.id === nameOrId.trim());
  if (byId) return { id: byId.id };
  const exact = all.filter((e) => e.name.toLowerCase() === needle);
  if (exact.length === 1) return { id: exact[0].id };
  const partial = exact.length ? exact : all.filter((e) => e.name.toLowerCase().includes(needle));
  if (partial.length === 1) return { id: partial[0].id };
  // Name + id: two entities can share a name, and then only the id can pick one.
  return { candidates: partial.map((e) => `${e.name} (id: ${e.id})`) };
}

/** Format search hits for a tool result. */
export function formatHits(hits: Hit[], query: string): string {
  if (!hits.length) return `No matches for "${query}".`;
  return hits.map((h) => `- [${h.kind}] ${h.name} (id: ${h.id})\n  ${h.snippet}`).join('\n');
}
