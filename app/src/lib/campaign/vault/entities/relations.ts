import type { Relation } from '../../../../types';
import type { VaultContext } from '../context';
import { linkOrId, resolveRef } from '../context';

/**
 * `Relations.md` — one table, the single authority for the whole relation graph.
 *
 * Why one file rather than relations on each sheet: an edge belongs to two
 * entities, so writing it into both endpoints' notes would need a
 * dedup-and-reconcile pass on import that a lenient importer cannot do safely.
 * Character notes instead carry a GENERATED relations section, labelled as such
 * and ignored when reading.
 *
 * Membership (`membre`) is an ordinary row here — the group-membership meaning
 * is derived downstream, not stored differently.
 *
 * `id` and `created` are bookkeeping: leave them blank when adding a row by hand
 * in Obsidian and the importer fills them in.
 */

const HEADER = '| From | Type | To | Detail | GM | id | created |';
const RULE = '|---|---|---|---|---|---|---|';

/** A cell must not break the table, and a pipe inside free text would. */
function cell(value: string): string {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\n+/g, ' ')
    .trim();
}

function uncell(value: string): string {
  return String(value ?? '')
    .replace(/\\\|/g, '|')
    .trim();
}

export function writeRelations(relations: Relation[], ctx: VaultContext): string {
  const rows = relations.map((r) =>
    [
      cell(linkOrId(ctx, r.from_character_id)),
      cell(r.relation_type),
      cell(linkOrId(ctx, r.to_character_id)),
      cell(r.relation_detail ?? ''),
      r.gm_only ? 'yes' : '',
      cell(r.id),
      cell(r.created_at),
    ].join(' | '),
  );

  const intro =
    'Every relationship in the grimoire. This table is the source of truth — ' +
    'the Relations section on each character note is generated from it and is ' +
    'ignored on import. Add a row by hand and leave `id` and `created` blank.';

  return [
    '# Relations',
    '',
    intro,
    '',
    HEADER,
    RULE,
    ...rows.map((r) => `| ${r} |`),
    '',
  ].join('\n');
}

export function parseRelations(md: string, ctx: VaultContext): Relation[] {
  const out: Relation[] = [];
  for (const line of String(md ?? '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;

    // Split on unescaped pipes only, so a detail containing `\|` survives.
    const cells = trimmed
      .replace(/^\||\|$/g, '')
      .split(/(?<!\\)\|/)
      .map((c) => c.trim());
    if (cells.length < 7) continue;
    if (cells.every((c) => /^-{2,}$/.test(c) || c === '')) continue;
    if (cells[0].toLowerCase() === 'from') continue; // header

    const from = resolveRef(ctx, uncell(cells[0]));
    const to = resolveRef(ctx, uncell(cells[2]));
    if (!from || !to) continue; // a row with no endpoints is not a relation

    out.push({
      id: uncell(cells[5]),
      space_id: '',
      from_character_id: from,
      to_character_id: to,
      relation_type: uncell(cells[1]),
      relation_detail: uncell(cells[3]) || undefined,
      gm_only: /^(yes|true|x)$/i.test(cells[4]),
      created_at: uncell(cells[6]),
    });
  }
  return out;
}
