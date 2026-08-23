import { describe, expect, it } from 'vitest';
import { describeRevision } from '../describeRevision';
import { en } from '@/i18n/en';
import type { RevisionEvent, RevisionRow, RevisionTable } from '@/types';

const ev = (rows: RevisionRow[]): RevisionEvent => ({
  event_id: 'e1',
  at: '2026-07-25T18:00:00Z',
  actor_role: 'gm',
  last_id: 10,
  rows,
});

const row = (over: Partial<RevisionRow>): RevisionRow => ({
  table_name: 'characters',
  row_id: 'r1',
  op: 'UPDATE',
  changed: [],
  label: 'Ereth',
  ...over,
});

describe('describeRevision headlines', () => {
  it('names the edited field on a single-field update', () => {
    const d = describeRevision(ev([row({ changed: ['notes'] })]));
    expect(d.headline).toEqual({
      key: 'ledger.headline.characterUpdatedField',
      vars: { name: 'Ereth', field: 'ledger.field.notes' },
    });
  });

  it('counts fields when several changed at once', () => {
    const d = describeRevision(ev([row({ changed: ['name', 'role', 'tags'] })]));
    expect(d.headline).toEqual({
      key: 'ledger.headline.characterUpdated',
      vars: { name: 'Ereth', n: 3 },
    });
  });

  it('leads with the parent on a cascading delete', () => {
    const d = describeRevision(
      ev([
        row({ table_name: 'locations', op: 'DELETE', label: "Gordin's Delve" }),
        row({ table_name: 'characters', op: 'UPDATE', changed: ['location'], label: 'Ereth' }),
        row({ table_name: 'characters', op: 'UPDATE', changed: ['location'], label: 'Vahalla' }),
        row({ table_name: 'map_pins', op: 'DELETE', label: 'The Delve' }),
      ]),
    );
    expect(d.headline).toEqual({
      key: 'ledger.headline.locationDeleted',
      vars: { name: "Gordin's Delve" },
    });
    expect(d.lines).toEqual([
      { key: 'ledger.line.charactersUnlinked', vars: { n: 2 } },
      { key: 'ledger.line.pinsRemoved', vars: { n: 1 } },
    ]);
  });

  it('describes a chronicle edit by its seasons', () => {
    const d = describeRevision(
      ev([row({ table_name: 'timelines', op: 'UPDATE', changed: ['entries'], label: '2:autumn' })]),
    );
    expect(d.headline).toEqual({
      key: 'ledger.headline.chronicleUpdated',
      vars: { seasons: '2:autumn' },
    });
  });

  it('falls back to a count when the row has no label', () => {
    const d = describeRevision(ev([row({ op: 'DELETE', label: null })]));
    expect(d.headline).toEqual({ key: 'ledger.headline.rowsChanged', vars: { n: 1 } });
  });

  it('falls back to a count, not a dangling "—", when the timelines label is empty (the INSERT half of a space\'s first chronicle save, before any season differs)', () => {
    const d = describeRevision(
      ev([row({ table_name: 'timelines', op: 'INSERT', changed: [], label: '' })]),
    );
    expect(d.headline).toEqual({ key: 'ledger.headline.rowsChanged', vars: { n: 1 } });
  });

  it('treats a whitespace-only label the same as an empty one', () => {
    const d = describeRevision(ev([row({ label: '   ' })]));
    expect(d.headline).toEqual({ key: 'ledger.headline.rowsChanged', vars: { n: 1 } });
  });

  it('falls back to a zero count when the event carries no rows', () => {
    const d = describeRevision(ev([]));
    expect(d).toEqual({ headline: { key: 'ledger.headline.rowsChanged', vars: { n: 0 } }, lines: [] });
  });

  it('reports relationsRemoved on the most common cascade: a character delete taking its bonds with it', () => {
    const d = describeRevision(
      ev([
        row({ table_name: 'characters', op: 'DELETE', label: 'Ereth' }),
        row({ table_name: 'relations', op: 'DELETE', label: 'Ereth → Vahalla' }),
        row({ table_name: 'relations', op: 'DELETE', label: 'Ereth → Bryn' }),
      ]),
    );
    expect(d.headline).toEqual({
      key: 'ledger.headline.characterDeleted',
      vars: { name: 'Ereth' },
    });
    expect(d.lines).toEqual([{ key: 'ledger.line.relationsRemoved', vars: { n: 2 } }]);
  });

  it('names location_id as the changed field on a map location edit (regression: must resolve to a real dictionary key)', () => {
    const d = describeRevision(
      ev([
        row({ table_name: 'maps', op: 'UPDATE', changed: ['location_id'], label: 'Overworld' }),
      ]),
    );
    expect(d.headline).toEqual({
      key: 'ledger.headline.mapUpdatedField',
      vars: { name: 'Overworld', field: 'ledger.field.location_id' },
    });
    // The regression this guards against: a field key that describeRevision
    // can build but the dictionary has no entry for, so it renders as raw
    // key text instead of copy. tsc cannot catch this (vars.field is plain
    // string), so check it resolves for real.
    expect(typeof en.ledger.field.location_id).toBe('string');
  });

  it('describes a gm_journal update with the changed parts', () => {
    const event: RevisionEvent = {
      event_id: 'e1',
      at: '2026-07-30T00:00:00Z',
      actor_role: 'gm',
      last_id: 1,
      rows: [
        {
          table_name: 'gm_journal',
          row_id: 'r1',
          op: 'UPDATE',
          changed: ['notes'],
          label: 'notes',
        },
      ],
    };
    expect(describeRevision(event)).toEqual({
      headline: { key: 'ledger.headline.journalUpdated', vars: { parts: 'notes' } },
      lines: [],
    });
  });

  it('names the tone & content page rather than counting its fields', () => {
    const d = describeRevision({
      event_id: 'e-tac',
      at: '2026-08-22T10:00:00Z',
      actor_role: 'player',
      last_id: 42,
      rows: [{
        table_name: 'tone_and_content',
        row_id: 'tac-1',
        op: 'UPDATE',
        changed: ['notes'],
        label: 'notes',
      }],
    });
    expect(d.headline).toEqual({ key: 'ledger.headline.toneAndContentUpdated' });
    expect(d.lines).toEqual([]);
  });
});

describe('ledger.field dictionary completeness', () => {
  // `revision_changed_keys` (db/11_revisions.sql) diffs the WHOLE row
  // (to_jsonb(old) vs to_jsonb(new), minus updated_at) on every UPDATE —
  // not just the columns one particular RPC's SET list touches. So a column
  // is reachable in `changed` if ANY write path can leave it changed on a
  // row that still exists afterwards:
  //   - an update_*/create_* RPC's SET list (db/06, db/08, db/09), or
  //   - a service-role write outside any RPC (maps.image_path/image_width/
  //     image_height, set together by the map-image Edge Function's
  //     post-upload UPDATE — still fires the generic capture trigger), or
  //   - an ON DELETE SET NULL foreign key firing an UPDATE on the child row
  //     (characters.location, maps.location_id — nulled by Postgres itself
  //     when the referenced location is deleted; already covered here via
  //     update_character/update_map, so no separate entry needed, but this
  //     is a second path to the SAME column, not just the RPC).
  //
  // Deliberately excluded — because no write path ever leaves them CHANGED
  // on a surviving row, so they can never appear in `changed`:
  //   - relations.from_character_id / to_character_id
  //   - map_pins.character_id / location_id
  // These are immutable after creation (delete + recreate to relink) —
  // confirmed in the SQL RPC bodies (update_relation / update_map_pin omit
  // them from their SET lists) and the TS wrappers in lib/db.ts (whose
  // `updates` parameter types structurally exclude them) — AND their
  // foreign keys are ON DELETE CASCADE, not SET NULL (db/01_schema.sql,
  // db/09_maps.sql), so when the parent goes, the row is DELETEd wholesale
  // rather than UPDATEd with the link nulled. Contrast characters.location
  // and maps.location_id above, whose FKs are SET NULL — that's exactly
  // the mechanism that makes them reachable by a path other than the RPC.
  const REACHABLE: Record<RevisionTable, string[]> = {
    characters: [
      'name', 'role', 'type', 'location', 'notes', 'traits', 'tags',
      'gm_only', 'gm_notes', 'threat',
    ],
    relations: ['relation_type', 'relation_detail', 'gm_only'],
    locations: [
      'name', 'color', 'description', 'notes', 'tags', 'steading',
      'gm_only', 'gm_notes',
    ],
    maps: ['name', 'description', 'location_id', 'gm_only', 'image_path', 'image_width', 'image_height'],
    map_pins: ['x', 'y', 'label', 'note', 'gm_only'],
    timelines: ['entries', 'gm_entries', 'current_year', 'current_season'],
    gm_journal: ['notes', 'wonders'],
    // id/space_id are immutable after insert (save_tone_and_content never
    // touches them), so notes is the row's only mutable column.
    tone_and_content: ['notes'],
  };

  it('gives every reachable column a ledger.field.* entry', () => {
    const field: Record<string, string> = en.ledger.field;
    const missing: string[] = [];
    for (const [table, fields] of Object.entries(REACHABLE)) {
      for (const key of fields) {
        if (typeof field[key] !== 'string') missing.push(`${table}.${key}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('ledger.reason dictionary completeness', () => {
  // Same failure mode the field dictionary guards against above, one layer
  // over: `preview_undo_event` / `revision_undo_check` / `undo_event`
  // (db/11_revisions.sql) emit these six fixed `reason` codes on an
  // UndoPlanRow/UndoResultRow. UndoConfirmModal.tsx maps each through
  // `ledger.reason.*` rather than ever interpolating the raw code — a
  // database enum has no place in a hand-crafted campaign journal. The
  // `constraint_<sqlstate>` family has a variable suffix and cannot be
  // enumerated; it — and anything else unrecognised — falls back to
  // `ledger.reason.generic`, checked separately below.
  const REASON_CODE_TO_KEY = {
    character_missing: 'characterMissing',
    map_missing: 'mapMissing',
    location_missing: 'locationMissing',
    exists: 'exists',
    row_missing: 'rowMissing',
    already_gone: 'alreadyGone',
  } as const;

  it('gives every fixed server reason code a translated ledger.reason.* entry', () => {
    const reason: Record<string, string> = en.ledger.reason;
    const missing: string[] = [];
    for (const [code, key] of Object.entries(REASON_CODE_TO_KEY)) {
      if (typeof reason[key] !== 'string') missing.push(code);
    }
    expect(missing).toEqual([]);
  });

  it('never falls back to printing the raw code itself', () => {
    const reason: Record<string, string> = en.ledger.reason;
    for (const [code, key] of Object.entries(REASON_CODE_TO_KEY)) {
      expect(reason[key]).not.toBe(code);
    }
  });

  it('has a generic fallback string for unrecognised codes (including constraint_<sqlstate>)', () => {
    expect(typeof en.ledger.reason.generic).toBe('string');
    expect(en.ledger.reason.generic.length).toBeGreaterThan(0);
  });
});
