import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { CharacterCard } from '../CharacterCard';
import { LanguageProvider } from '@/i18n';
import { useAppStore } from '@/stores/appStore';
import { DISCOVERY_KIND_ICONS } from '@/components/character/discoveryKindIcons';
import { MONSTER_KIND_ICONS } from '@/components/character/monsterKindIcons';
import type { Character } from '@/types';

const base: Character = {
  id: 'c-1', space_id: 'space-1', name: 'Eurwen', role: "the miller's widow",
  type: 'PNJ', notes: '', instinct: '', traits: [], tags: [], gm_only: false, dead: false,
  gm_notes: null, created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z',
};

/**
 * `useRole` retombe sur 'gm' sans session (repli local/legacy), donc une carte
 * rendue nue est vue PAR LE MJ. Les cas joueur posent la session explicitement.
 */
function renderCard(character: Character, role: 'gm' | 'player' | 'viewer' = 'gm') {
  useAppStore.setState({
    locations: [],
    session: { space: { id: 'space-1', name: 'Toa', invite_code: 'X', created_at: '' },
      isAdmin: role === 'gm', token: 'tok', role },
  } as never);
  return render(
    <LanguageProvider>
      <MemoryRouter>
        <CharacterCard character={character} />
      </MemoryRouter>
    </LanguageProvider>,
  );
}

afterEach(() => cleanup());

/**
 * La carte se lit comme une entrée de bestiaire du livre : nom, puis la ligne
 * italique de descripteurs, puis rôle et traits en libellés gras.
 */
describe('CharacterCard descriptor line', () => {
  // Les tags rejoignent maintenant le rôle sur la même ligne de DÉFINITION
  // (Task 4) : un seul nœud de texte porte « rôle, tags », pas deux lignes
  // séparées — d'où la chaîne jointe plutôt que le seul mot du tag.
  it('shows tags for a monster', () => {
    renderCard({ ...base, kind: 'beast', tags: ['organized', 'skilled'] });
    expect(screen.getByText("the miller's widow, organized, skilled")).toBeTruthy();
  });

  it('shows tags for a follower', () => {
    renderCard({ ...base, tags: ['archer'], follower: { cost: '', loyalty: 0, leaderId: null } });
    expect(screen.getByText("the miller's widow, archer")).toBeTruthy();
  });

  // Les tags sont des stats de jeu : sur un PNJ ordinaire ou
  // un PJ, la ligne n'a rien à dire. Les valeurs stockées ne sont pas
  // supprimées pour autant — elles ne sont simplement plus affichées ici.
  it('drops them for a plain NPC and for a PC', () => {
    renderCard({ ...base, tags: ['Marshedge'] });
    expect(screen.queryByText('Marshedge')).toBeNull();

    cleanup();
    renderCard({ ...base, type: 'PJ', role: 'Blessed · Initiate', tags: ['Stonetop'] });
    expect(screen.queryByText('Stonetop')).toBeNull();
  });

  // Le type de menace y vit aussi : c'est ce qui l'a sorti de la file de
  // pastilles à côté du nom.
  it('leads with the threat type, and keeps a monster threat’s tags after it', () => {
    renderCard({ ...base, type: 'MENACE', kind: 'undead', tags: ['ancient'],
      threat: { instinct: '', portents: [], stakes: [], gmMoves: [],
        impendingDoom: { text: '', done: false }, type: 'villain' } });
    expect(screen.getByText('Villain, ancient')).toBeTruthy();
  });

  // EntityDescriptor a quitté la carte : le type de menace et les tags vivent
  // maintenant dans la ligne de DÉFINITION, avec le rôle. La seule ligne
  // italique restante est le mobile.
  it('leaves no drive line when there is nothing to describe', () => {
    const { container } = renderCard(base);
    expect(container.querySelector('.label-overline')).toBeNull();
  });

  // Rôle et traits, tous deux nus : le libellé « Traits » revenait en gras et
  // en encre pleine sur chaque carte, plus lourd que la valeur unique qu'il
  // annonçait. La liste se lit d'elle-même.
  it('reads role and traits plainly, with no label', () => {
    renderCard({ ...base, traits: [
      { label: 'sharp-tongued', checked: false }, { label: 'grieving', checked: false },
    ] });
    expect(screen.getByText("the miller's widow")).toBeTruthy();
    expect(screen.queryByText('Traits')).toBeNull();
    expect(screen.getByText('sharp-tongued, grieving')).toBeTruthy();
  });
});

/**
 * Le type a quitté la file de pastilles pour le tampon de gauche : « NPC »
 * revenait sur la majorité des cartes sans rien distinguer, et comme le nom
 * était le seul élément rétractable de la ligne, c'est lui qui payait.
 */
describe('CharacterCard name row', () => {
  it('shows no type badge for any type', () => {
    for (const [type, label] of [
      ['PNJ', 'NPC'], ['PJ', 'PC'], ['GROUPE', 'Group'], ['MENACE', 'Threat'],
    ] as const) {
      renderCard({ ...base, type, role: type === 'PJ' ? 'Blessed · Initiate' : base.role });
      expect(screen.queryByText(label)).toBeNull();
      cleanup();
    }
  });

  it('stamps a PC even when the role carries no known playbook', () => {
    const { container } = renderCard({ ...base, type: 'PJ', role: 'village blacksmith' });
    const stamp = container.querySelector('.stamp-icon');
    expect(stamp).toBeTruthy();
    // OCRE pour un PJ, et son propre jeton (--pc-accent). Pas
    // --graph-accent-pc : cet or est calibré pour le remplissage d'un nœud du
    // graphe et sur du parchemin il lit comme du métal — écarté deux fois, à
    // raison. Pas --warning non plus, même si la valeur est la même :
    // « avertissement » et « personnage joueur » n'ont rien à voir, et un nom
    // qui ment survit à la raison qui l'a fait mentir.
    expect((stamp as HTMLElement).style.color).toBe('var(--pc-accent)');
  });

  // TOUTE entrée porte un tampon, PNJ ordinaire compris. Le retirer pour la
  // catégorie neutre (« 8 bustes identiques sont du papier peint ») laissait une
  // gouttière vide qui lit comme une carte inachevée, pas comme de la retenue —
  // et le livre tamponne bel et bien ses « human individual ».
  it('stamps every entry, including a plain NPC', () => {
    for (const c of [base, { ...base, kind: 'npc' as const }]) {
      const { container } = renderCard(c);
      const stamp = container.querySelector('.stamp-icon') as HTMLElement;
      expect(stamp).toBeTruthy();
      expect(stamp.style.color).toBe('var(--text-secondary)');
      cleanup();
    }
  });

  it('keeps a softened stamp for a real monster kind and for a group', () => {
    for (const c of [
      { ...base, kind: 'beast' as const },
      { ...base, type: 'GROUPE' as const },
    ]) {
      const { container } = renderCard(c);
      const stamp = container.querySelector('.stamp-icon') as HTMLElement;
      expect(stamp).toBeTruthy();
      expect(stamp.style.color).toBe('var(--text-secondary)');
      cleanup();
    }
  });

  // Le prune de la menace est la SEULE teinte du jeu de tampons, et c'est la
  // convention existante de l'app (la pastille de type de la fiche l'emploie
  // encore). L'avoir passée à l'encre pleine laissait la colonne d'icônes en
  // deux gris, où le type ne se lisait plus d'un coup d'œil. Pas --danger non
  // plus : il est déjà pris par la fatalité tombée sur cette même carte.
  it('tints a threat stamp plum, the one hue in the stamp set', () => {
    const { container } = renderCard({ ...base, type: 'MENACE' });
    expect((container.querySelector('.stamp-icon') as HTMLElement).style.color)
      .toBe('var(--gm-accent)');
  });

  // Une teinte par famille — OCRE / PRUNE / encre adoucie, toutes trois dans le
  // même registre d'encre sourde. Trois signaux DISTINCTS, donc le type se lit
  // sans avoir à lire le glyphe. Ce test existe pour qu'un aplatissement futur
  // échoue bruyamment : je les avais réduits à deux gris, et la colonne
  // d'icônes ne disait alors plus rien.
  it('keeps three distinct stamp inks across the types', () => {
    const inks = new Set<string>();
    for (const c of [
      { ...base, type: 'PJ' as const, role: 'Blessed · Initiate' },
      { ...base, type: 'PNJ' as const },
      { ...base, type: 'MENACE' as const },
    ]) {
      const { container } = renderCard(c);
      inks.add((container.querySelector('.stamp-icon') as HTMLElement).style.color);
      cleanup();
    }
    expect(inks).toEqual(new Set(['var(--pc-accent)', 'var(--text-secondary)', 'var(--gm-accent)']));
  });

  // Les marques du nom sont des GLYPHES, pas des pastilles de texte : retirer
  // le cadre de l'ancienne pastille ne l'avait pas sortie du vocabulaire du
  // badge (capitales + tracking large + sans minuscule), et « GM » en capitales
  // espacées retombait sur sa propre ligne, gonflant la hauteur de la rangée.
  // Le mot reste accessible (sr-only + title) sans être peint en capitales.
  it('marks a dead entry with a seal, not a lettered chip', () => {
    const { container } = renderCard({ ...base, dead: true });
    // Le sceau EN PLUS du tampon de type : deux glyphes, pas de texte en capitales.
    expect(container.querySelectorAll('.stamp-icon').length).toBe(2);
    expect(screen.getByText('Deceased').className).toContain('sr-only');
    expect(container.querySelector('[title="Deceased"]')).toBeTruthy();
  });

  it('marks gm-only with an icon carrying an accessible name', () => {
    renderCard({ ...base, gm_only: true });
    expect(screen.getByText('GM').className).toContain('sr-only');
  });
});

/**
 * La pastille d'état — ce qui a CHANGÉ pour l'entrée, à la place que le type
 * occupait.
 */
describe('CharacterCard state chip', () => {
  it('marks a dead NPC deceased and a dead group disbanded', () => {
    renderCard({ ...base, dead: true });
    expect(screen.getByText('Deceased')).toBeTruthy();

    cleanup();
    renderCard({ ...base, type: 'GROUPE', dead: true });
    expect(screen.getByText('Disbanded')).toBeTruthy();
  });

  it('says nothing when the character is alive', () => {
    renderCard(base);
    expect(screen.queryByText('Deceased')).toBeNull();
  });

  // La case n'est pas offerte sur une menace ; une révision restaurée peut
  // malgré tout ressusciter la colonne, et elle doit rester muette.
  it('ignores a dead flag stored on a threat', () => {
    renderCard({ ...base, type: 'MENACE', dead: true,
      threat: { instinct: '', portents: [], stakes: [], gmMoves: [],
        impendingDoom: { text: '', done: false }, type: null } });
    expect(screen.queryByText('Deceased')).toBeNull();
  });

  // Une fiche de menace partielle est une forme VIVANTE, pas une hypothèse :
  // des lignes réelles portent un `threat` objet sans portents/impendingDoom
  // (fiches d'avant la refonte 2026-07, ou révisions restaurées). Lire le
  // bloc brut faisait planter la carte — d'où le passage par
  // normalizeThreatSheet, la frontière de lecture permanente du bloc.
  it('survives a threat sheet missing portents and doom entirely', () => {
    renderCard({ ...base, type: 'MENACE',
      threat: { type: 'villain' } as unknown as NonNullable<Character['threat']> });
    expect(screen.getByRole('heading', { name: 'Eurwen' })).toBeTruthy();
    expect(screen.getByText('Villain')).toBeTruthy();
  });

  // « 1/2 » nu ne disait pas de quoi c'était la fraction : il fallait
  // l'infobulle, qui n'existe pas au doigt. Un libellé en toutes lettres et des
  // pastilles pleines/vides — le vocabulaire de progression des pistes de
  // bourgade. La fatalité tombée les remplit toutes, en rouge : c'est son sens.
  it('names the portents and counts them in pips', () => {
    const threat = { instinct: '', stakes: [], gmMoves: [], type: null,
      portents: [
        { text: 'the well runs foul', done: true },
        { text: 'the herds sicken', done: false },
      ],
      impendingDoom: { text: '<p>the vale drowns</p>', done: false } };
    const { container } = renderCard({ ...base, type: 'MENACE', threat });
    expect(screen.getByText('Grim portents')).toBeTruthy();
    const pips = [...container.querySelectorAll('span.rounded-full')];
    expect(pips.length).toBe(2);
    expect(pips[0].getAttribute('style')).toContain('var(--text-muted)');
    expect(pips[1].getAttribute('style')).toContain('transparent');

    // Fatalité tombée : toutes remplies, et en rouge.
    cleanup();
    const doomed = renderCard({ ...base, type: 'MENACE',
      threat: { ...threat, impendingDoom: { ...threat.impendingDoom, done: true } } });
    const red = [...doomed.container.querySelectorAll('span.rounded-full')];
    expect(red.length).toBe(2);
    for (const pip of red) expect(pip.getAttribute('style')).toContain('var(--danger)');
    for (const pip of red) expect(pip.getAttribute('style')).not.toContain('transparent');
  });
});

/**
 * La ligne de mobile : ce que l'entrée VEUT. Sa visibilité suit
 * `instinctVisible` (lib/instinct), la règle que la fiche applique déjà — MJ,
 * ou PJ, ou follower.
 */
describe('CharacterCard drive line', () => {
  it('gives a PC its instinct, with the "to" prefix, even to a player', () => {
    renderCard({ ...base, type: 'PJ', role: 'Blessed · Initiate',
      instinct: 'rekindle the old flame' }, 'player');
    expect(screen.getByText(/to rekindle the old flame/)).toBeTruthy();
  });

  it('gives the GM an instinct on an NPC, a group and a threat alike', () => {
    for (const type of ['PNJ', 'GROUPE', 'MENACE'] as const) {
      renderCard({ ...base, type, instinct: 'protect the mill' }, 'gm');
      expect(screen.getByText(/to protect the mill/)).toBeTruthy();
      cleanup();
    }
  });

  // C'est de la prep de MJ : le serveur la strippe déjà pour un joueur
  // (app_character_mechanics_open), la carte ne doit pas la rendre non plus.
  it('hides an NPC instinct from a player', () => {
    renderCard({ ...base, instinct: 'protect the mill' }, 'player');
    expect(screen.queryByText(/protect the mill/)).toBeNull();
  });

  // Un follower appartient à son joueur : sa fiche s'ouvre, la carte suit.
  it('shows a follower’s instinct to a player', () => {
    renderCard({ ...base, instinct: 'protect the mill',
      follower: { cost: '', loyalty: 0, leaderId: null } }, 'player');
    expect(screen.getByText(/to protect the mill/)).toBeTruthy();
  });

  // La fatalité a quitté la carte : un paragraphe de prep tronqué hors du
  // contexte de ses présages ne disait rien. La fiche reste son lieu.
  it('never renders the impending doom', () => {
    renderCard({ ...base, type: 'MENACE',
      threat: { instinct: '', portents: [], stakes: [], gmMoves: [], type: null,
        impendingDoom: { text: '<p>the vale drowns</p>', done: false } } });
    expect(screen.queryByText(/the vale drowns/)).toBeNull();
  });
});

/**
 * La ligne de DÉFINITION — ce que l'entrée EST. Taille de lecture (16px) et
 * encre pleine : c'est le deuxième palier que la carte n'avait pas.
 */
describe('CharacterCard definition line', () => {
  it('joins the role and a statted NPC’s tags', () => {
    renderCard({ ...base, kind: 'beast', tags: ['organized', 'skilled'] });
    expect(screen.getByText("the miller's widow, organized, skilled")).toBeTruthy();
  });

  it('gives a threat its type and no role text', () => {
    renderCard({ ...base, type: 'MENACE', role: 'stale prep text',
      threat: { instinct: '', portents: [], stakes: [], gmMoves: [],
        impendingDoom: { text: '', done: false }, type: 'villain' } });
    expect(screen.getByText('Villain')).toBeTruthy();
    expect(screen.queryByText(/stale prep text/)).toBeNull();
  });
});

/**
 * Le LIEU vit dans le coin haut-droit : la flèche ↗ qu'il remplace était
 * redondante (toute la carte est un lien) et c'était le tell générique. Le
 * coin lui donne en prime une ordonnée fixe d'une carte à l'autre.
 */
describe('CharacterCard place', () => {
  // Rendu direct plutôt que via `renderCard` : ce dernier réinitialise
  // toujours `locations: []` (repli délibéré pour tous les autres cas de ce
  // fichier), ce qui écraserait le lieu posé juste au-dessus. Même schéma que
  // le test « can be suppressed » qui suit.
  it('links to the location from the name row', () => {
    useAppStore.setState({
      locations: [{ id: 'l-1', space_id: 'space-1', name: 'Marshedge', color: '#4A6E8C',
        created_at: '', updated_at: '' }],
    } as never);
    render(
      <LanguageProvider>
        <MemoryRouter>
          <CharacterCard character={{ ...base, location: 'l-1' }} />
        </MemoryRouter>
      </LanguageProvider>,
    );
    expect(screen.getByRole('link', { name: /Marshedge/ }).getAttribute('href'))
      .toBe('/location/l-1');
  });

  // Sur la fiche d'un lieu, tous les résidents y sont par définition : le coin
  // répéterait le même mot sur chaque carte.
  it('can be suppressed', () => {
    useAppStore.setState({
      locations: [{ id: 'l-1', space_id: 'space-1', name: 'Marshedge', color: '#4A6E8C',
        created_at: '', updated_at: '' }],
    } as never);
    render(
      <LanguageProvider>
        <MemoryRouter>
          <CharacterCard character={{ ...base, location: 'l-1' }} showPlace={false} />
        </MemoryRouter>
      </LanguageProvider>,
    );
    expect(screen.queryByText('Marshedge')).toBeNull();
  });
});

describe('a discovery card', () => {
  const discovery: Character = {
    id: 'd-1', space_id: 's1', name: 'The bronze plate', type: 'DISCOVERY',
    role: 'arcanum', instinct: '', notes: '', gm_notes: null,
    traits: [{ label: 'decipher the Maker-runes', checked: false }],
    tags: [], gm_only: false, dead: false, kind: null, threat: null,
    statblock: null, follower: null,
    created_at: '2026-08-17T00:00:00Z', updated_at: '2026-08-17T00:00:00Z',
  };

  it('names the subtype instead of printing the raw role id', () => {
    renderCard(discovery);
    expect(screen.getByText('Arcanum')).toBeTruthy();
    expect(screen.queryByText('arcanum')).toBeNull();
  });

  it('says "Discovery" when unfiled rather than guessing a kind', () => {
    renderCard({ ...discovery, role: '' });
    expect(screen.getByText('Discovery')).toBeTruthy();
  });

  it('presses no left-play seal, even on a row that carries dead', () => {
    // A restored revision can resurrect the column on any row; the seal is
    // also the unfiled stamp, so two of them on one card would be unreadable.
    renderCard({ ...discovery, dead: true });
    expect(screen.queryByText('Deceased')).toBeNull();
    expect(screen.queryByText('Disbanded')).toBeNull();
  });

  // Pins the stamp ternary's ORDERING. `kindIcon = monsterKindIcon(character)`
  // is computed unconditionally — `kindOf` is a shape-reader that returns
  // whatever `kind` holds regardless of type — so if the DISCOVERY arm were
  // not FIRST in the chain, a discovery carrying a stale `kind` (a restored
  // revision, an MCP write, a row re-typed from a monster NPC) would render
  // the bestiary stamp instead of its own subtype. `clue` and `maker` map to
  // different glyphs, so a reordering fails this loudly.
  it('stamps its own subtype and never a stale monster kind, even when one is stored', () => {
    const { container } = renderCard({ ...discovery, role: 'clue', kind: 'maker' });
    const stamp = container.querySelector('.stamp-icon') as HTMLElement;
    expect(stamp.style.maskImage).toContain(DISCOVERY_KIND_ICONS.clue);
    expect(stamp.style.maskImage).not.toContain(MONSTER_KIND_ICONS.maker);
  });

  // Task 7: the book writes an artifact’s game elements AS tags, so they
  // now join the subtype label on the same definition line
  // as a monster's or a follower's — same anatomy as the tests at the top of
  // this file.
  it('joins an arcanum’s tags after its subtype label', () => {
    renderCard({ ...discovery, tags: ['magical', 'Value 2'] });
    expect(screen.getByText('Arcanum, magical, Value 2')).toBeTruthy();
  });

  // A clue has no game elements: the same tags stored on a non-artifact,
  // non-arcanum kind stay dormant, exactly as every other discovery kind did
  // before this task.
  it('drops the same tags for a clue', () => {
    renderCard({ ...discovery, role: 'clue', tags: ['magical', 'Value 2'] });
    expect(screen.getByText('Clue')).toBeTruthy();
    expect(screen.queryByText(/magical/)).toBeNull();
  });
});
