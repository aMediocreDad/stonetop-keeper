import type { TKey } from '@/i18n';
import type { RevisionEvent, RevisionRow, RevisionTable } from '@/types';

export interface RevisionPhrase {
  key: TKey;
  vars?: Record<string, string | number>;
}

export interface RevisionDescription {
  headline: RevisionPhrase;
  lines: RevisionPhrase[];
}

// The row a reader cares about: the parent of a cascade. Deletes and
// inserts outrank updates, and shallower tables outrank deeper ones, so
// "location deleted" wins over the character links it nulled.
const RANK: Record<RevisionTable, number> = {
  locations: 1,
  characters: 2,
  maps: 3,
  relations: 4,
  map_pins: 5,
  timelines: 6,
  gm_journal: 7,
  tone_and_content: 8,
};

const SUBJECT: Record<RevisionTable, string> = {
  characters: 'character',
  locations: 'location',
  maps: 'map',
  relations: 'relation',
  map_pins: 'pin',
  timelines: 'chronicle',
  gm_journal: 'journal',
  // Never reached via headlineKey — Task 4 adds a branch that short-circuits
  // first, like timelines and gm_journal. Present because the Record is
  // exhaustive.
  tone_and_content: 'toneAndContent',
};

const VERB = { INSERT: 'Created', UPDATE: 'Updated', DELETE: 'Deleted' } as const;

/** `characters` + `DELETE` -> `ledger.headline.characterDeleted`. */
function headlineKey(table: RevisionTable, op: RevisionRow['op']): TKey {
  return `ledger.headline.${SUBJECT[table]}${VERB[op]}` as TKey;
}

function principal(rows: RevisionRow[]): RevisionRow {
  return [...rows].sort((a, b) => {
    const opWeight = (r: RevisionRow) => (r.op === 'UPDATE' ? 1 : 0);
    return opWeight(a) - opWeight(b) || RANK[a.table_name] - RANK[b.table_name];
  })[0];
}

/** Cascade fallout, in a stable order, excluding the principal row itself. */
function cascadeLines(rows: RevisionRow[], lead: RevisionRow): RevisionPhrase[] {
  const rest = rows.filter((r) => r !== lead);
  const unlinked = rest.filter(
    (r) => r.table_name === 'characters' && r.op === 'UPDATE' && r.changed.includes('location'),
  ).length;
  const relations = rest.filter((r) => r.table_name === 'relations' && r.op === 'DELETE').length;
  const pins = rest.filter((r) => r.table_name === 'map_pins' && r.op === 'DELETE').length;

  const lines: RevisionPhrase[] = [];
  if (unlinked) lines.push({ key: 'ledger.line.charactersUnlinked', vars: { n: unlinked } });
  if (relations) lines.push({ key: 'ledger.line.relationsRemoved', vars: { n: relations } });
  if (pins) lines.push({ key: 'ledger.line.pinsRemoved', vars: { n: pins } });
  return lines;
}

/**
 * One event -> one sentence plus its fallout. Pure: takes only what
 * `get_revisions` returns, so it needs no database and no payloads.
 */
export function describeRevision(event: RevisionEvent): RevisionDescription {
  const rows = event.rows ?? [];
  if (rows.length === 0) {
    return { headline: { key: 'ledger.headline.rowsChanged', vars: { n: 0 } }, lines: [] };
  }

  const lead = principal(rows);
  const lines = cascadeLines(rows, lead);

  // '' is a real value revision_label can return -- e.g. the INSERT half of
  // a space's first chronicle save, before any season yet differs between
  // before/after -- and it is truthy-adjacent enough to slip past a bare
  // `=== null` check. Treat it, like whitespace-only text, as no label at
  // all so it never renders as a dangling "— " with nothing after it.
  const label = lead.label && lead.label.trim() !== '' ? lead.label : null;

  if (label === null) {
    return { headline: { key: 'ledger.headline.rowsChanged', vars: { n: rows.length } }, lines };
  }

  if (lead.table_name === 'timelines') {
    return {
      headline: { key: 'ledger.headline.chronicleUpdated', vars: { seasons: label } },
      lines,
    };
  }

  if (lead.table_name === 'gm_journal') {
    return {
      headline: { key: 'ledger.headline.journalUpdated', vars: { parts: label } },
      lines,
    };
  }

  if (lead.table_name === 'tone_and_content') {
    // One column, so there is nothing to name: the label exists only to pass
    // the non-empty guard above.
    return { headline: { key: 'ledger.headline.toneAndContentUpdated' }, lines };
  }

  // A single changed field reads better named than counted.
  if (lead.op === 'UPDATE' && lead.changed.length === 1) {
    return {
      headline: {
        key: `${headlineKey(lead.table_name, 'UPDATE')}Field` as TKey,
        vars: { name: label, field: `ledger.field.${lead.changed[0]}` },
      },
      lines,
    };
  }

  return {
    headline: {
      key: headlineKey(lead.table_name, lead.op),
      vars:
        lead.op === 'UPDATE'
          ? { name: label, n: lead.changed.length }
          : { name: label },
    },
    lines,
  };
}
