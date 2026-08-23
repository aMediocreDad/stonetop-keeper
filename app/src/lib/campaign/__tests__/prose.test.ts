import { describe, it, expect } from 'vitest';
import { traverse } from '../traverse';
import { DEFAULT_SECTIONS, proseRenderer, renderChronicle, renderEntity } from '../render/prose';
import type { RawCampaignData } from '../types';
import type { Character, Location, Relation, Timeline } from '../../../types';

function char(over: Partial<Character> & Pick<Character, 'id' | 'name' | 'type'>): Character {
  return {
    space_id: 's1',
    role: '',
    notes: '',
    traits: [],
    tags: [],
    gm_only: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  } as Character;
}

function rel(
  over: Partial<Relation> &
    Pick<Relation, 'id' | 'from_character_id' | 'to_character_id' | 'relation_type'>,
): Relation {
  return { space_id: 's1', gm_only: false, created_at: '2026-01-01T00:00:00Z', ...over } as Relation;
}

function loc(over: Partial<Location> & Pick<Location, 'id' | 'name'>): Location {
  return {
    space_id: 's1',
    color: '#7AA177',
    gm_only: false,
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  } as Location;
}

const timeline: Timeline = {
  id: 't1',
  space_id: 's1',
  entries: { '0': { autumn: { title: 'The Ambush', body: '<p>They came at dusk.</p>' } } },
  gm_entries: { '0': { autumn: '<p>The cult moved first.</p>' } },
  current_year: 0,
  current_season: 'autumn',
  updated_at: '2026-01-01T00:00:00Z',
};

const raw: RawCampaignData = {
  characters: [
    char({
      id: 'c1',
      name: 'Bhael',
      type: 'PJ',
      role: 'Blessed · initiate of Danu',
      location: 'l1',
    }),
    char({
      id: 'c2',
      name: 'Rula',
      type: 'PNJ',
      role: 'innkeeper',
      notes: '<p>Keeps the inn.</p>',
      instinct: 'complain but get the job done',
    }),
    char({ id: 'g1', name: 'The Watch', type: 'GROUPE' }),
    char({
      id: 'm1',
      name: 'Things Below',
      type: 'MENACE',
      role: 'Undead · restless dead',
      // Forme LEGACY à dessein (enjeux en HTML, fatalité en texte nu) :
      // prouve que traverse() normalize à la lecture.
      threat: {
        instinct: 'reclaim',
        portents: [{ text: 'lights in the barrow', done: false }],
        impendingDoom: { text: 'the barrow opens', done: false },
        stakes: '<p>Who dies first?</p>',
        gmMoves: ['Whisper at night'],
      } as unknown as Character['threat'],
    }),
  ],
  locations: [
    loc({ id: 'l1', name: 'Stonetop', description: 'hill town', gm_notes: '<p>Ruin beneath.</p>' }),
  ],
  relations: [
    rel({
      id: 'r1',
      from_character_id: 'c1',
      to_character_id: 'c2',
      relation_type: 'ami',
      relation_detail: 'since the boar hunt',
    }),
    rel({ id: 'r2', from_character_id: 'g1', to_character_id: 'c1', relation_type: 'membre' }),
  ],
  timeline,
  maps: [
    {
      id: 'map1',
      space_id: 's1',
      name: 'The Vale',
      description: 'hand-drawn survey',
      location_id: 'l1',
      gm_only: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ],
  mapPins: [
    {
      id: 'p1',
      map_id: 'map1',
      space_id: 's1',
      x: 0.1,
      y: 0.2,
      character_id: 'c1',
      gm_only: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'p2',
      map_id: 'map1',
      space_id: 's1',
      x: 0.5,
      y: 0.9,
      label: 'Buried shrine',
      note: 'Only Bhael suspects.',
      gm_only: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ],
};

const graph = traverse(raw);

const emptyRaw: RawCampaignData = { characters: [], locations: [], relations: [], timeline: null };

const graphWithJournal = traverse({
  ...emptyRaw,
  gmJournal: {
    id: 'j1',
    space_id: 's1',
    notes: '<p>secret <b>plans</b></p>',
    updated_at: '',
    wonders: [
      { id: 'w1', text: 'I wonder A', resolved: false, created_at: '' },
      { id: 'w2', text: 'I wonder B', resolved: true, resolution: 'It was the crows', created_at: '' },
    ],
  },
});

const graphWithTone = traverse({
  ...emptyRaw,
  toneAndContent: {
    id: 'tc1',
    space_id: 's1',
    notes: '<p>Grim tone; no on-screen harm to <b>children</b>.</p>',
    updated_at: '',
  },
});

const graphWithEmptyTone = traverse({
  ...emptyRaw,
  // A row exists (the table opened the page and saved) but the body was
  // cleared back out — distinct from never having saved one at all.
  toneAndContent: { id: 'tc2', space_id: 's1', notes: '<p></p>', updated_at: '' },
});

describe('proseRenderer — defaults', () => {
  it('has a stable id and default section set', () => {
    expect(proseRenderer.id).toBe('prose');
    expect(DEFAULT_SECTIONS).toEqual([
      'toneAndContent',
      'now',
      'party',
      'places',
      'maps',
      'recent',
      'threats',
      'groups',
      'discoveries',
      'hooks',
      'wonders',
    ]);
  });

  it('renders maps with pins in words, not coordinates', () => {
    const out = proseRenderer.render(graph);
    expect(out).toContain('## Maps');
    expect(out).toContain('The Vale — hand-drawn survey (of Stonetop)');
    expect(out).toContain('Bhael (north-west)');
    expect(out).toContain('Buried shrine (south) [GM] — Only Bhael suspects.');
    expect(out).not.toContain('0.1');
  });

  it('includes the current season, party, places, threats and groups by default', () => {
    const out = proseRenderer.render(graph);
    expect(out).toContain('autumn');
    expect(out).toContain('Bhael');
    expect(out).toContain('Blessed');
    expect(out).toContain('Stonetop');
    expect(out).toContain('Things Below');
    expect(out).toContain('The Watch');
  });

  it('omits the full cast and relation web by default, and says how to get them', () => {
    const out = proseRenderer.render(graph);
    expect(out).not.toContain('Keeps the inn.');
    expect(out).toMatch(/cast/i);
    expect(out).toMatch(/get_campaign_brief|search_campaign/);
  });

  it('includes the cast when asked', () => {
    const out = proseRenderer.render(graph, { sections: ['cast'] });
    expect(out).toContain('Rula');
    expect(out).toContain('Keeps the inn.');
  });

  it('prints the instinct line for any character that has one', () => {
    const out = proseRenderer.render(graph, { sections: ['cast'] });
    expect(out).toContain('Instinct: to complain but get the job done');
  });

  it('renders the relation web as sentences, excluding membership edges', () => {
    const out = proseRenderer.render(graph, { sections: ['web'] });
    expect(out).toContain('Bhael');
    expect(out).toContain('Rula');
    expect(out).toContain('since the boar hunt');
    expect(out).not.toContain('The Watch');
  });

  it('surfaces GM material in hooks', () => {
    const out = proseRenderer.render(graph, { sections: ['hooks'] });
    expect(out).toContain('Ruin beneath.');
    expect(out).toContain('The cult moved first.');
  });

  it('lists group members by name', () => {
    const out = proseRenderer.render(graph, { sections: ['groups'] });
    expect(out).toContain('The Watch');
    expect(out).toContain('Bhael');
  });

  it('holds locations at description level — no steading block', () => {
    const withSteading = traverse({
      ...raw,
      locations: [
        loc({
          id: 'l1',
          name: 'Stonetop',
          description: 'hill town',
          steading: {
            size: 'village',
            stats: { fortunes: 1, population: 2, prosperity: 1, defenses: 0, surplus: 3 },
            debilities: { diminished: false, lacking: false, malcontent: false },
            resources: ['Grain'],
            fortifications: [],
            assets: [],
            treasury: {
              silver: { purses: 0, handfuls: 2, coins: 0 },
              gold: { purses: 0, handfuls: 0, coins: 0 },
            },
            improvements: [],
          },
        }),
      ],
    });
    const out = proseRenderer.render(withSteading, { sections: ['places'] });
    expect(out).toContain('Stonetop');
    expect(out).not.toContain('Grain');
    expect(out).toMatch(/get_entity/);
  });

  it('stays well under the 25k-token budget on a default call', () => {
    // ~4 chars/token; the spec's budget is 25,000 tokens, target well under 10,000.
    expect(proseRenderer.render(graph).length).toBeLessThan(40_000);
  });

  it('renders open wonderings before resolved ones, with resolutions', () => {
    const out = proseRenderer.render(graphWithJournal, { sections: ['wonders'] });
    expect(out).toContain('## I wonder…');
    expect(out.indexOf('I wonder A')).toBeLessThan(out.indexOf('I wonder B'));
    expect(out).toContain('[answered] I wonder B — It was the crows');
  });

  it('renders the journal notes only when asked', () => {
    const brief = proseRenderer.render(graphWithJournal); // DEFAULT_SECTIONS
    expect(brief).not.toContain('## GM journal');
    // Omitted-sections hint: journal beside cast/web, counted 1 when notes exist.
    expect(brief).toContain('journal (1 entries)');
    const full = proseRenderer.render(graphWithJournal, { sections: ['journal'] });
    expect(full).toContain('## GM journal');
    // Markdown, not flattened text — emphasis reaches the model intact.
    expect(full).toContain('secret **plans**');
  });

  it('counts the omitted journal as 0 when the producer supplied none', () => {
    const out = proseRenderer.render(graph); // no gmJournal on this fixture
    expect(out).toContain('journal (0 entries)');
  });

  it('includes the tone & content agreement in the default brief, ahead of everything else', () => {
    const out = proseRenderer.render(graphWithTone); // DEFAULT_SECTIONS, no explicit ask
    expect(out).toContain('## Tone & content');
    // Markdown, not flattened text — same guarantee as the journal section.
    expect(out).toContain('Grim tone; no on-screen harm to **children**.');
    // Frames the fiction, so it comes before the fiction: ahead of "Now".
    expect(out.indexOf('## Tone & content')).toBeLessThan(out.indexOf('## Now'));
  });

  it('is not GM-gated: renders the same for a producer with no journal access at all', () => {
    // graphWithTone's raw data carries no gmJournal — the shape a non-GM
    // token's fetch produces — yet the tone & content record still renders,
    // unlike the journal (which needs an explicit section AND GM access).
    const out = proseRenderer.render(graphWithTone);
    expect(out).toContain('## Tone & content');
    expect(out).not.toContain('[GM]');
  });

  it('says so when the table never saved a tone & content record', () => {
    const out = proseRenderer.render(graph); // no toneAndContent on this fixture
    expect(out).toContain('## Tone & content');
    expect(out).toContain('No tone & content agreement recorded.');
  });

  it('falls back to the same placeholder when a record exists but its body was cleared', () => {
    const out = proseRenderer.render(graphWithEmptyTone);
    expect(out).toContain('## Tone & content');
    expect(out).toContain('No tone & content agreement recorded.');
  });
});

describe('renderEntity', () => {
  it('renders one character with relations as sentences and its GM notes', () => {
    const out = renderEntity(graph, 'c1');
    expect(out).toContain('Bhael');
    expect(out).toContain('Blessed');
    expect(out).toContain('Stonetop');
    expect(out).toContain('Rula');
    expect(out).toContain('The Watch');
  });

  it('prints the instinct line in the entity card for a non-threat character too', () => {
    expect(renderEntity(graph, 'c2')).toContain('Instinct: to complain but get the job done');
  });

  it('renders a threat with its full sheet (legacy shape normalized)', () => {
    const out = renderEntity(graph, 'm1');
    expect(out).toContain('Instinct: to reclaim');
    expect(out).toContain('lights in the barrow');
    // Fatalité legacy en texte nu : re-livrée en texte (HTML dépouillé).
    expect(out).toContain('Impending doom: the barrow opens');
    expect(out).toContain('Who dies first?');
    expect(out).toContain('Whisper at night');
    // Guarded against renderEntity's generic instinct line AND renderThreat's
    // own line both firing for a threat — exactly one, not two.
    expect(out.match(/Instinct:/g)).toHaveLength(1);
  });

  it('prints the instinct line for a threat with no threat sheet at all', () => {
    const g = traverse({
      ...raw,
      characters: [
        char({
          id: 'm3',
          name: 'Something in the Dark',
          type: 'MENACE',
          instinct: 'wait in the dark',
          // No `threat` key at all — SQL NULL, e.g. a MENACE created via
          // create_character with instinct but no threat sheet yet.
        }),
      ],
    });
    const out = renderEntity(g, 'm3');
    expect(out).toContain('Instinct: to wait in the dark');
    expect(out.match(/Instinct:/g)).toHaveLength(1);
  });

  it('marks answered stakes and a doom come to pass', () => {
    const g = traverse({
      ...raw,
      characters: [
        char({
          id: 'm2',
          name: 'The Hunger',
          type: 'MENACE',
          threat: {
            instinct: 'feed',
            portents: [],
            impendingDoom: { text: '<p>Famine</p>', done: true },
            stakes: [{ text: 'Who starves?', done: true }],
            gmMoves: [],
          },
        }),
      ],
    });
    const out = renderEntity(g, 'm2');
    expect(out).toContain('Impending doom: Famine (come to pass)');
    expect(out).toContain('Who starves? (answered)');
  });

  it('renders a location with its full steading block and inhabitants', () => {
    const out = renderEntity(graph, 'l1');
    expect(out).toContain('Stonetop');
    expect(out).toContain('Bhael');
    expect(out).toContain('Ruin beneath.');
  });

  it('returns an explicit miss for an unknown id', () => {
    expect(renderEntity(graph, 'nope')).toMatch(/not found/i);
  });

  it('says where a character is pinned', () => {
    expect(renderEntity(graph, 'c1')).toContain('Pinned on The Vale (north-west)');
  });

  it('separates built, started and untouched steading improvements', () => {
    const steadingGraph = traverse({
      ...raw,
      locations: [
        loc({
          id: 'l2',
          name: 'Stonetop',
          steading: {
            size: 'village',
            stats: { fortunes: 1, population: 0, prosperity: 0, defenses: 0, surplus: 1 },
            debilities: { diminished: false, lacking: false, malcontent: false },
            resources: [],
            fortifications: [],
            assets: [],
            treasury: {
              silver: { purses: 0, handfuls: 0, coins: 0 },
              gold: { purses: 0, handfuls: 0, coins: 0 },
            },
            improvements: [
              {
                id: 'mill', name: 'Mill', summary: '', effects: '', custom: false,
                completed: true,
                requirements: [{ text: 'Build it', done: true }],
              },
              {
                id: 'wall', name: 'Repaired Wall', summary: '', effects: '', custom: false,
                completed: false,
                requirements: [{ text: 'Pull Together ×5', done: false, progress: 2 }],
              },
              {
                id: 'forge', name: 'Forge', summary: '', effects: '', custom: false,
                completed: false,
                requirements: [{ text: 'Find a smith', done: false }],
              },
              {
                id: 'well', name: 'New Well', summary: '', effects: '', custom: false,
                completed: false,
                requirements: [{ text: 'Dig', done: false }],
              },
            ],
          },
        }),
      ],
    });
    const out = renderEntity(steadingGraph, 'l2');
    expect(out).toContain('Improvements built: Mill');
    // Only the improvement with ticked requirements counts as in progress…
    expect(out).toContain('Improvements in progress: Repaired Wall (2/5)');
    // …the untouched rest of the menu is a count, not a list.
    expect(out).toContain('Improvements not yet begun: 2 on the menu.');
    expect(out).not.toContain('in progress: Repaired Wall (2/5), Forge');
  });
});

describe('renderChronicle', () => {
  it('renders both strands for the range', () => {
    const out = renderChronicle(graph);
    expect(out).toContain('The Ambush');
    expect(out).toContain('They came at dusk.');
    expect(out).toContain('The cult moved first.');
  });

  it('filters by year range', () => {
    expect(renderChronicle(graph, { from: 5, to: 9 })).toMatch(/no entries/i);
  });
});

describe('the discoveries brief section', () => {
  const bench: RawCampaignData = {
    characters: [
      char({
        id: 'd1', name: 'The bronze plate', type: 'DISCOVERY', role: 'arcanum',
        location: 'l1',
        // Markdown-sensitive on purpose (bold, a bullet list, a mention in
        // the editor's stored shape): ResolvedCharacter.notes is ALREADY
        // Markdown by the time a renderer sees it (traverse.ts converts once
        // at graph-build time), so a renderer that converts it AGAIN escapes
        // every one of these markers into visible `\*\*`/`\-`/`\[\[` garbage.
        // The plain-prose fixture this replaced had zero characters a second
        // pass could corrupt, so it could not have caught that bug.
        notes:
          '<p>A green disc, half-buried by the ford. <strong>Do not touch it bare-handed.</strong></p>' +
          '<ul><li>dig it up</li>' +
          '<li>ask <span data-type="mention" class="mention" data-id="m1" data-label="The Drowned">@The Drowned</span> about it</li></ul>',
        gm_notes: '<p>Maker-runes.</p>', gm_only: true,
        traits: [
          { label: 'dig it up & clean the plate', checked: true },
          { label: 'decipher the Maker-runes', checked: false },
        ],
      }),
      char({ id: 'm1', name: 'The Drowned', type: 'MENACE' }),
    ],
    locations: [loc({ id: 'l1', name: 'Stonetop' })],
    relations: [rel({
      // 'held-by', not 'leads-to': d1's role is 'arcanum', which promotes
      // possession, and the promoted-relation filter is now keyed off the
      // kind's own config rather than a hard-coded 'leads-to' literal.
      id: 'r1', from_character_id: 'd1', to_character_id: 'm1', relation_type: 'held-by',
    })],
    timeline: null,
  };

  it('names each discovery by its kind, with its place and its requirements', () => {
    const out = proseRenderer.render(traverse(bench), { sections: ['discoveries'] });
    expect(out).toContain('## Discoveries');
    expect(out).toContain('The bronze plate');
    expect(out).toContain('Arcanum');   // the label, not the stored id
    expect(out).toContain('Stonetop');
    expect(out).toContain('- [x] dig it up & clean the plate');
    expect(out).toContain('- [ ] decipher the Maker-runes');
    expect(out).toContain('possessed by The Drowned');
    // Threats keep their own section — the bench does not absorb them.
    expect(out).not.toContain('The Drowned (');
  });

  it('does not re-convert notes that are already Markdown', () => {
    const out = proseRenderer.render(traverse(bench), { sections: ['discoveries'] });
    // Intact: bold survives, the bullet is a real bullet, and the mention
    // resolved to its wikilink form.
    expect(out).toContain('**Do not touch it bare-handed.**');
    expect(out).toContain('- dig it up');
    expect(out).toContain('[[The Drowned|m1]]');
    // The discriminating half: a second htmlToMarkdown pass would escape
    // every one of the markers above into `\*\*`, `\-` and `\[\[`.
    expect(out).not.toContain('\\*');
    expect(out).not.toContain('\\-');
    expect(out).not.toContain('\\[');
  });

  it('says so when there are none, like every other section', () => {
    const out = proseRenderer.render(
      traverse({ characters: [], locations: [], relations: [], timeline: null }),
      { sections: ['discoveries'] },
    );
    expect(out).toContain('No discoveries recorded.');
  });

  it('is in the default brief', () => {
    expect(DEFAULT_SECTIONS).toContain('discoveries');
  });
});

describe('renderDiscovery with a block', () => {
  /** One DISCOVERY character, alone in its graph, with `sections: ['discoveries']`. */
  function discoveryBrief(over: Partial<Character> & Pick<Character, 'id' | 'name' | 'type'>) {
    const g = traverse({
      characters: [char(over)],
      locations: [],
      relations: [],
      timeline: null,
    });
    return proseRenderer.render(g, { sections: ['discoveries'] });
  }

  it('names the tier beside the kind', () => {
    const md = discoveryBrief({
      id: 'd1', name: 'The bronze mirror', type: 'DISCOVERY', role: 'arcanum',
      discovery: { tier: 'major' },
    });
    expect(md).toContain('(Arcanum, major)');
  });

  it('lists move names, not bodies — a brief is an index', () => {
    const md = discoveryBrief({
      id: 'd1', name: 'The bronze mirror', type: 'DISCOVERY', role: 'arcanum',
      discovery: { moves: [{ name: 'Inflame', text: 'When you wield…' }] },
    });
    expect(md).toContain('Inflame');
    expect(md).not.toContain('When you wield');
  });

  it('carries the GM-held pair, because the brief is GM-facing', () => {
    const md = discoveryBrief({
      id: 'd1', name: 'A maker sigil', type: 'DISCOVERY', role: 'clue',
      discovery: { interesting: 'a maker sigil', useful: 'the device is near' },
    });
    expect(md).toContain('a maker sigil');
    expect(md).toContain('the device is near');
  });

  it('renders a promoted relation under the right verb for the kind', () => {
    const g = traverse({
      characters: [
        char({ id: 'd1', name: 'A muddy footprint', type: 'DISCOVERY', role: 'clue' }),
        char({ id: 'd2', name: 'The miller lies', type: 'DISCOVERY', role: 'revelation' }),
        char({ id: 'd3', name: 'The bronze mirror', type: 'DISCOVERY', role: 'artifact' }),
        char({ id: 'c9', name: 'Vahid', type: 'PNJ' }),
      ],
      locations: [],
      relations: [
        rel({ id: 'r1', from_character_id: 'd1', to_character_id: 'd2', relation_type: 'leads-to' }),
        rel({ id: 'r2', from_character_id: 'd3', to_character_id: 'c9', relation_type: 'held-by' }),
      ],
      timeline: null,
    });
    const md = proseRenderer.render(g, { sections: ['discoveries'] });
    expect(md).toContain('points to The miller lies');
    expect(md).toContain('possessed by Vahid');
  });

  // FINAL REVIEW, finding 4: the block's fifth consumer dropped a key. The
  // sheet, the card, the vault writer and the vault reader all carry
  // `consequences`; this renderer did not, so a GM asking the agent "what does
  // the Red Scepter cost me" got nothing back.
  it('lists the consequences under their own prefix, not as more requirements', () => {
    const md = discoveryBrief({
      id: 'd1', name: 'The Red Scepter', type: 'DISCOVERY', role: 'arcanum',
      traits: [{ label: 'attuned under a full moon', checked: true }],
      discovery: {
        consequences: [
          { label: 'Your skin becomes feverish', checked: true },
          { label: 'You dream of the forge', checked: false },
        ],
      },
    });
    // A REQUIREMENT keeps the checklist shape…
    expect(md).toContain('- [x] attuned under a full moon');
    // …and the consequences get their own named line. The two are opposites —
    // what must happen before the mysteries unlock vs. what the arcanum takes
    // once they have — so printing both as `- [x] label` would leave a GM
    // unable to tell them apart.
    expect(md).toContain(
      '- consequences: Your skin becomes feverish (exacted); You dream of the forge',
    );
    expect(md).not.toContain('- [x] Your skin becomes feverish');
  });

  it('says nothing extra for a discovery with no block', () => {
    const md = discoveryBrief({ id: 'd1', name: 'A plain clue', type: 'DISCOVERY', role: 'clue' });
    expect(md).not.toContain('undefined');
    expect(md).not.toContain('()');
  });
});
