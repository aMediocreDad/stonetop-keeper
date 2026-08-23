import { describe, expect, it } from 'vitest';
import type { CampaignMap, GmJournal, MapPin, TimelineEntry } from '../../../../../types';
import { chronicleFileName, parseChronicleYear, writeChronicleYear } from '../chronicle';
import { parseMap, writeMap } from '../map';
import { parseJournal, writeJournal } from '../journal';
import type { VaultContext } from '../../context';

const ctx: VaultContext = {
  nameById: new Map([
    ['c1', 'Ana'],
    ['loc-1', 'Stonetop'],
  ]),
  idByName: new Map([
    ['Ana', 'c1'],
    ['Stonetop', 'loc-1'],
  ]),
  characterIds: new Set(['c1']),
  locationIds: new Set(['loc-1']),
};

describe('chronicle year notes', () => {
  const ENTRY: TimelineEntry = {
    spring: { title: 'The thaw', body: '<p>The ice broke <em>early</em>.</p>' },
    autumn: { title: '', body: '<p>Harvest came in short.</p>' },
  };

  it('round-trips a year with titled and untitled seasons', () => {
    const md = writeChronicleYear(847, 'player', ENTRY, ctx);
    expect(parseChronicleYear(md)).toEqual({ year: 847, strand: 'player', entry: ENTRY });
  });

  it('is byte-idempotent', () => {
    const once = writeChronicleYear(847, 'player', ENTRY, ctx);
    expect(writeChronicleYear(847, 'player', parseChronicleYear(once).entry, ctx)).toBe(once);
  });

  it('round-trips the gm strand', () => {
    const md = writeChronicleYear(847, 'gm', { winter: { title: '', body: '<p>Plotting.</p>' } }, ctx);
    expect(parseChronicleYear(md).strand).toBe('gm');
  });

  it('zero-pads the filename but keeps the real year in frontmatter', () => {
    expect(chronicleFileName(847, 'player')).toBe('0847');
    expect(chronicleFileName(847, 'gm')).toBe('0847 (GM)');
    expect(parseChronicleYear(writeChronicleYear(847, 'player', ENTRY, ctx)).year).toBe(847);
  });

  it('normalises a legacy raw-string season into a titleless entry', () => {
    const legacy = { spring: '<p>Old shape.</p>' } as unknown as TimelineEntry;
    expect(parseChronicleYear(writeChronicleYear(847, 'player', legacy, ctx)).entry).toEqual({
      spring: { title: '', body: '<p>Old shape.</p>' },
    });
  });
});

describe('map notes', () => {
  const MAP: CampaignMap = {
    id: 'm1', space_id: '', name: 'The Marsh', description: 'wet and wide',
    location_id: 'loc-1', image_path: 'spaces/x/m1.jpg', image_width: 1200,
    image_height: 800, thumb: null, gm_only: false,
    created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-02T00:00:00Z',
  };
  const PINS: MapPin[] = [
    { id: 'p1', map_id: 'm1', space_id: '', x: 0.2, y: 0.1, character_id: 'c1',
      location_id: null, label: null, note: 'last seen here', gm_only: false,
      created_at: '', updated_at: '' },
    { id: 'p2', map_id: 'm1', space_id: '', x: 0.5, y: 0.5, character_id: null,
      location_id: 'loc-1', label: null, note: null, gm_only: false,
      created_at: '', updated_at: '' },
    { id: 'p3', map_id: 'm1', space_id: '', x: 0.9, y: 0.8, character_id: null,
      location_id: null, label: 'A drowned shrine', note: null, gm_only: true,
      created_at: '', updated_at: '' },
  ];

  it('round-trips all three pin flavours', () => {
    const md = writeMap(MAP, PINS, 'the-marsh.jpg', ctx);
    const back = parseMap(md, ctx);
    expect(back.map).toEqual(MAP);
    expect(back.pins).toEqual(PINS);
    expect(back.imageFile).toBe('the-marsh.jpg');
  });

  it('is byte-idempotent', () => {
    const once = writeMap(MAP, PINS, 'the-marsh.jpg', ctx);
    const back = parseMap(once, ctx);
    expect(writeMap(back.map, back.pins, back.imageFile, ctx)).toBe(once);
  });

  it('writes a leaflet block alongside the table, never instead of it', () => {
    const md = writeMap(MAP, PINS, 'the-marsh.jpg', ctx);
    expect(md).toContain('```leaflet');
    expect(md).toContain('| Pin | Position | Note | GM | x | y | id |');
  });

  it('omits the leaflet block when there is no image', () => {
    const md = writeMap({ ...MAP, image_path: null }, PINS, '', ctx);
    expect(md).not.toContain('```leaflet');
    expect(md).toContain('## Pins');
  });
});

describe('gm journal note', () => {
  const JOURNAL: GmJournal = {
    id: 'j1', space_id: '', updated_at: '2026-08-01T00:00:00Z',
    notes: '<p>The crows are <strong>watching</strong>.</p>',
    wonders: [
      { id: 'w1', text: 'Who opened the crypt?', resolved: false, created_at: '2026-07-01T00:00:00Z' },
      { id: 'w2', text: 'Why did the well fail?', resolved: true,
        resolution: 'It was the crows', created_at: '2026-07-02T00:00:00Z' },
    ],
  };

  it('round-trips notes and wonders', () => {
    expect(parseJournal(writeJournal(JOURNAL, ctx))).toEqual(JOURNAL);
  });

  it('is byte-idempotent', () => {
    const once = writeJournal(JOURNAL, ctx);
    expect(writeJournal(parseJournal(once), ctx)).toBe(once);
  });

  it('renders wonders as a tickable list', () => {
    expect(writeJournal(JOURNAL, ctx)).toContain('- [x] Why did the well fail?');
  });
});
