import type { CampaignMap, MapPin } from '../../../../types';
import { MAP_FIELDS } from '../fields';
import { emitFrontmatter, parseFrontmatter } from '../frontmatter';
import type { VaultContext } from '../context';
import { linkOrId, resolveRef } from '../context';

/**
 * A map note: its frontmatter, a Leaflet block for anyone who has the plugin,
 * and a pin table.
 *
 * The PIN TABLE IS THE AUTHORITY; the Leaflet block is generated from it and
 * ignored on read. That ordering is deliberate — Leaflet is an optional
 * community plugin, and a vault must stay complete and legible without it.
 */

/**
 * obsidian-leaflet documents image-map marker coordinates as "a percentage from
 * the top left corner", which makes latitude a distance DOWNWARD — the opposite
 * of geographic latitude. The docs do not state the direction explicitly, so
 * this conversion is isolated here: if pins land mirrored vertically in
 * Obsidian, flipping this one function is the entire fix.
 *
 * Our pins are already normalised 0..1 from the top-left (`MapPin.x`/`y`).
 */
function toLeaflet(x: number, y: number): { lat: number; long: number } {
  return { lat: Number((y * 100).toFixed(2)), long: Number((x * 100).toFixed(2)) };
}

function cell(v: string): string {
  return String(v ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
}
function uncell(v: string): string {
  return String(v ?? '').replace(/\\\|/g, '|').trim();
}

/** Rough position in words, matching how the MCP describes a pin. */
function positionWords(x: number, y: number): string {
  const ns = y < 1 / 3 ? 'north' : y > 2 / 3 ? 'south' : '';
  const we = x < 1 / 3 ? 'west' : x > 2 / 3 ? 'east' : '';
  if (ns && we) return `${ns}-${we}`;
  return ns || we || 'center';
}

const PIN_HEADER = '| Pin | Position | Note | GM | x | y | id |';
const PIN_RULE = '|---|---|---|---|---|---|---|';

function pinLabel(p: MapPin, ctx: VaultContext): string {
  if (p.character_id) return linkOrId(ctx, p.character_id);
  if (p.location_id) return linkOrId(ctx, p.location_id);
  return cell(p.label ?? '');
}

function writeLeaflet(m: CampaignMap, pins: MapPin[], imageFile: string, ctx: VaultContext): string {
  if (!imageFile) return '';
  const markers = pins.map((p) => {
    const { lat, long } = toLeaflet(p.x, p.y);
    const link = p.character_id || p.location_id ? pinLabel(p, ctx) : '';
    return `marker: default, ${lat}, ${long}${link ? `, ${link}` : ''}`;
  });
  return [
    '```leaflet',
    `id: map-${m.id}`,
    `image: [[${imageFile}]]`,
    'height: 500px',
    'lat: 50',
    'long: 50',
    'minZoom: -2',
    'maxZoom: 4',
    'defaultZoom: 0',
    ...markers,
    '```',
  ].join('\n');
}

function unmapped(m: CampaignMap): Record<string, unknown> {
  const known = new Set(Object.keys(MAP_FIELDS));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(m)) if (!known.has(k)) out[k] = v;
  return out;
}

export function writeMap(
  m: CampaignMap,
  pins: MapPin[],
  imageFile: string,
  ctx: VaultContext,
): string {
  const extra = unmapped(m);
  const front = emitFrontmatter({
    id: m.id,
    name: m.name,
    description: m.description ?? '',
    location: m.location_id ? linkOrId(ctx, m.location_id) : '',
    image: imageFile,
    image_width: m.image_width ?? '',
    image_height: m.image_height ?? '',
    image_path: m.image_path ?? '',
    gm_only: m.gm_only || '',
    created: m.created_at,
    updated: m.updated_at,
    ...(Object.keys(extra).length ? { x_unmapped: extra } : {}),
  });

  const rows = pins.map((p) =>
    [
      pinLabel(p, ctx),
      positionWords(p.x, p.y),
      cell(p.note ?? ''),
      p.gm_only ? 'yes' : '',
      p.x,
      p.y,
      cell(p.id),
    ].join(' | '),
  );

  const table = [
    '## Pins',
    '',
    'This table is the source of truth; the map above is generated from it.',
    '',
    PIN_HEADER,
    PIN_RULE,
    ...rows.map((r) => `| ${r} |`),
  ].join('\n');

  const leaflet = writeLeaflet(m, pins, imageFile, ctx);
  return `${front}\n${leaflet ? `${leaflet}\n\n` : ''}${table}\n`;
}

export interface ParsedMap {
  map: CampaignMap;
  pins: MapPin[];
  /** Vault-relative image file recorded in frontmatter, if any. */
  imageFile: string;
}

export function parseMap(md: string, ctx: VaultContext): ParsedMap {
  const { data, body } = parseFrontmatter(md);
  const id = String(data.id ?? '');

  const pins: MapPin[] = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const cells = trimmed
      .replace(/^\||\|$/g, '')
      .split(/(?<!\\)\|/)
      .map((c) => c.trim());
    if (cells.length < 7) continue;
    if (cells.every((c) => /^-{2,}$/.test(c) || c === '')) continue;
    if (cells[0].toLowerCase() === 'pin') continue;

    const label = uncell(cells[0]);
    const ref = /^\[\[/.test(label) ? resolveRef(ctx, label) : '';
    // A wikilink resolves to whichever kind of sheet it names; a bare label is a
    // free pin. `nameById` covers characters and locations alike, so the pin's
    // flavour is decided by which map the id is found in.
    const isCharacter = ref ? ctx.characterIds?.has(ref) ?? false : false;
    const isLocation = ref ? ctx.locationIds?.has(ref) ?? false : false;
    // A link naming a note that is not in this vault — deleted, or renamed
    // outside Obsidian so the links were never rewritten. `resolveRef` hands
    // back the NAME when it cannot resolve, and a name in `character_id` is a
    // foreign key that does not exist. It degrades to a labelled free pin: the
    // position and the human-readable name are what the row still has.
    const resolved = isCharacter || isLocation;

    pins.push({
      id: uncell(cells[6]),
      map_id: id,
      space_id: '',
      x: Number(cells[4] ?? 0),
      y: Number(cells[5] ?? 0),
      character_id: resolved && isCharacter ? ref : null,
      location_id: resolved && isLocation ? ref : null,
      label: resolved ? null : ref || label || null,
      note: uncell(cells[2]) || null,
      gm_only: /^(yes|true|x)$/i.test(cells[3]),
      created_at: '',
      updated_at: '',
    });
  }

  return {
    map: {
      id,
      space_id: '',
      name: String(data.name ?? ''),
      description: data.description ? String(data.description) : null,
      location_id: data.location ? resolveRef(ctx, String(data.location)) : null,
      image_path: data.image_path ? String(data.image_path) : null,
      image_width: data.image_width ? Number(data.image_width) : null,
      image_height: data.image_height ? Number(data.image_height) : null,
      thumb: null,
      gm_only: data.gm_only === true,
      created_at: String(data.created ?? ''),
      updated_at: String(data.updated ?? ''),
      ...((data.x_unmapped as Record<string, unknown>) ?? {}),
    },
    pins,
    imageFile: String(data.image ?? ''),
  };
}
