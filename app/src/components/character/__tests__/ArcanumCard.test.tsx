import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ArcanumCard } from '../ArcanumCard';
import { LanguageProvider } from '@/i18n';
import { useAppStore } from '@/stores/appStore';
import type { DiscoveryBlock, SpaceRole, SpaceSession, Trait } from '@/types';

// This repo has neither @testing-library/user-event nor jest-dom: `.toBeTruthy()`
// / `.toBeNull()` is the local idiom (see MovesEditor's suite).
//
// `LanguageProvider` is not optional (`useT()` throws outside it) and neither is
// the router: the card renders its description through `RichText`, whose read
// view calls `useNavigate` so a @mention stays clickable.
const base = {
  name: 'A half-buried plaque',
  tags: ['cumbersome', 'magical'],
  notesHtml: '<p>A bronze plate poking out of the soil.</p>',
  requirements: [{ label: 'decipher the Maker-runes', checked: true }] as Trait[],
  stamp: 'stamp.png',
  onTrackChange: vi.fn(),
  onToggleConsequence: vi.fn(),
};

// Same helper as followerCard.test.tsx: `useCanEdit`/`useRole` read the
// Zustand session directly, so a track's `readOnly` wiring needs a real role
// in the store rather than a prop override.
function makeSession(role: SpaceRole): SpaceSession {
  return {
    space: {
      id: 'space-1',
      name: 'S',
      invite_code: 'xx-xxx',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    isAdmin: role === 'gm',
    token: 't',
    role,
  };
}

function show(
  kind: 'artifact' | 'arcanum',
  block: DiscoveryBlock,
  overrides: Partial<typeof base> = {},
) {
  return render(
    <MemoryRouter>
      <LanguageProvider>
        <ArcanumCard {...base} {...overrides} kind={kind} block={block} />
      </LanguageProvider>
    </MemoryRouter>,
  );
}

const faces = (container: HTMLElement) => [...container.querySelectorAll('[data-card-face]')];

describe('ArcanumCard', () => {
  afterEach(() => useAppStore.setState({ session: null }));

  it('renders an artifact as ONE panel with no tier overline', () => {
    const { container } = show('artifact', { moves: [{ name: 'Flare', text: 'When you...' }] });
    expect(screen.getByText('A half-buried plaque')).toBeTruthy();
    expect(screen.getByText('Flare')).toBeTruthy();
    expect(screen.queryByText(/arcanum/i)).toBeNull();
    expect(faces(container)).toHaveLength(1);
  });

  // A fully populated arcanum — tags, description, requirements and a front
  // move, but NO mysteries and NO consequences — is still ONE face: both are
  // the back's own body (mysteries since Task 15, consequences since Task 16)
  // and this fixture carries neither, so no panel opens here. (Tracks are
  // Task 14's own front-matter addition — see the tests below — and were
  // never back-face content to begin with, so they don't belong in this list
  // any more.) Counting the faces is the assertion: `queryByText('Mysteries
  // of…')` would also pass if the heading were merely renamed, and gating on
  // either KEY merely being present (the earlier near miss) would let an
  // MCP-written empty `mysteries`/`consequences` open a panel onto nothing.
  it('renders a fully populated Phase-1 arcanum as exactly ONE face', () => {
    const { container } = show('arcanum', {
      tier: 'minor',
      moves: [{ name: 'Burning Hatred', tags: 'near', text: 'When you level it, roll +CHA.' }],
    });
    expect(faces(container)).toHaveLength(1);
    // `character.tier_minor`, the key the sheet's own Tier row already uses —
    // `.label-overline` uppercases it, so the book's lower-case rule is a CSS
    // concern and not a second string.
    expect(screen.getByText('minor arcanum')).toBeTruthy();
    expect(screen.getByText('Burning Hatred')).toBeTruthy();
  });

  // FINAL REVIEW, finding 1. The back's gate carried no `isArcanum` half while
  // BOTH editors for these arrays mount on `discoveryKind === 'arcanum'` alone
  // (CharacterSheetPage:1422,:1446). Reproduction: kind `arcanum`, add a
  // mystery and a consequence, save, change kind to `artifact`, save — the card
  // still drew a second face, a "Mysteries of X" heading, and a live
  // `onToggleConsequence` writing into a block no editor could reach.
  it('never gives an ARTIFACT a back, however much its block carries', () => {
    const onToggleConsequence = vi.fn();
    const { container } = show('artifact', {
      mysteries: [{ name: 'Burning Hatred', text: 'When you...' }],
      consequences: [{ label: 'Your skin becomes feverish', checked: false }],
    }, { onToggleConsequence });
    expect(faces(container)).toHaveLength(1);
    expect(screen.queryByText(/Mysteries of/)).toBeNull();
    expect(screen.queryByText('Consequences')).toBeNull();
    // The point of the finding: no reachable control writes into the orphaned
    // keys. The keys themselves are deliberately still STORED — nothing
    // normalises them away, so re-typing the row back to arcanum finds its
    // mysteries intact (the standing tolerate-the-stored-shape rule).
    expect(container.querySelector('button')).toBeNull();
    expect(onToggleConsequence).not.toHaveBeenCalled();
  });

  // Task 16 gives consequences their own back-face body: a block that
  // carries only `consequences` now earns a second face, the same "earned by
  // having a body" rule mysteries already follow (Task 15). Before this task
  // this was the near-miss case — a heading with nothing under it — so the
  // gate was "mysteries only"; now it is "mysteries OR consequences".
  it('opens the back for a block that carries only consequences', () => {
    const { container } = show('arcanum', {
      tier: 'minor',
      consequences: [{ label: 'Your skin becomes feverish', checked: false }],
    });
    expect(faces(container)).toHaveLength(2);
  });

  // The invariant the gate must still keep: NO body at all (no mysteries, no
  // consequences) stays exactly ONE face. Counting faces, not the absence of
  // a heading string — `queryByText('Mysteries of…')` would also pass if the
  // heading were merely renamed (Task 10's own near miss, see the doc above).
  it('stays one face when the block has no back-face body at all', () => {
    const { container } = show('arcanum', { tier: 'minor' });
    expect(faces(container)).toHaveLength(1);
  });

  // The exact near miss the component doc warns about: gating on the KEY
  // merely being present (`'consequences' in block`) rather than on it
  // carrying entries. `consequences: []` is reachable through an MCP write or
  // a restored revision with nothing behind it, same as an empty `mysteries`.
  it('stays one face for an explicit but empty consequences array', () => {
    const { container } = show('arcanum', { tier: 'minor', consequences: [] });
    expect(faces(container)).toHaveLength(1);
  });

  it('narrows a minor arcanum', () => {
    const { container } = show('arcanum', { tier: 'minor' });
    expect(container.firstElementChild?.className).toContain('max-w-sm');
  });

  it('widens a major arcanum', () => {
    const { container } = show('arcanum', { tier: 'major' });
    expect(container.firstElementChild?.className).not.toContain('max-w-sm');
  });

  // A re-kinded row can carry another kind's leftovers. An artifact has no
  // tier: it must neither narrow nor print an arcanum's rule.
  it('ignores a tier left on an artifact', () => {
    const { container } = show('artifact', { tier: 'minor' });
    expect(container.firstElementChild?.className).not.toContain('max-w-sm');
    expect(screen.queryByText('minor arcanum')).toBeNull();
  });

  // NO frame on EITHER face. Both 9-slice assets bake `--gm-accent` — #6b4d7a
  // is the darkest opaque pixel of `frame-box.png` as well as of
  // `frame-arcana.png` — and that plum means "GM-only" everywhere else in this
  // app, while an arcanum's back is player-facing by design. So the property is
  // "no `card-frame*` anywhere", not "the right frame on the right face":
  // re-adding EITHER asset to EITHER face has to fail this.
  it('frames no face — the plum accent must not appear on a player`s handout', () => {
    const { container } = show('arcanum', { tier: 'minor' });
    expect(faces(container)).toHaveLength(1);
    for (const face of faces(container)) expect(face.className).not.toContain('card-frame');
    // The sweep, not just the face element: it catches a frame added to any
    // descendant, and it is what Task 15's back face has to keep passing.
    expect(container.querySelector('[class*="card-frame"]')).toBeNull();
  });

  it('renders tags as a comma line, not as pills', () => {
    const { container } = show('artifact', {});
    expect(screen.getByText('cumbersome, magical')).toBeTruthy();
    expect(container.querySelector('.tag-pill')).toBeNull();
  });

  // The description goes through `RichText` in read mode — the sheet's single
  // path for TipTap output (sanitised, mentions navigable, .ProseMirror
  // typography). `.tiptap-read` is that path's own wrapper: no second
  // dangerouslySetInnerHTML can produce it.
  it('renders the description through the sheet`s rich-text read view', () => {
    const { container } = show('artifact', {});
    const prose = container.querySelector('.tiptap-read .ProseMirror');
    expect(prose?.textContent).toContain('A bronze plate poking out of the soil.');
  });

  // No requirements: theirs is a list too, and `getAllByRole('listitem')` would
  // otherwise sweep both — the exact-equality check below has to see the move's
  // options and nothing else.
  it('renders a move body`s option lines as a list and prints the trailing prose BELOW it', () => {
    const { container } = show('artifact', {
      moves: [{
        name: 'Inflame',
        tags: 'near',
        text: 'Pick 1:\n- Act as suggested\n- Resist\nOn a 6-, the GM says.',
      }],
    }, { requirements: [] });
    expect(screen.getByText('(near)')).toBeTruthy();
    // EXACTLY two options: `arrayContaining` would still pass if the trailing
    // "On a 6-" line were promoted to a third bullet, which is the very thing
    // this test exists to deny.
    expect(screen.getAllByRole('listitem').map((li) => li.textContent))
      .toEqual(['Act as suggested', 'Resist']);
    // ORDER, not presence. `getByText(/On a 6-/)` passed while the line printed
    // ABOVE the choices it resolves — that was the bug on the card, and the
    // reason `parseMoveBody` now returns an `outro`. Reading order is what is
    // wrong or right here, so the assertion has to be about position.
    const read = faces(container)[0].textContent ?? '';
    expect(read.indexOf('On a 6-, the GM says.')).toBeGreaterThan(read.indexOf('Resist'));
    expect(read.indexOf('Pick 1:')).toBeLessThan(read.indexOf('Act as suggested'));
  });

  // No requirements here: their own heading is an `h4` too, and this test is
  // about the move's heading being absent rather than empty.
  it('renders an unnamed move without an empty heading', () => {
    const { container } = show('artifact', { moves: [{ name: '', text: 'It howls.' }] }, {
      requirements: [],
    });
    expect(screen.getByText('It howls.')).toBeTruthy();
    expect(container.querySelectorAll('h4')).toHaveLength(0);
  });

  // The book, verbatim: "The front of an arcanum describes what the PC can
  // tell at a glance, PLUS the requirements for unlocking its mysteries. The
  // back shows those mysteries." Now that Task 15 gives the back a body, the
  // negative half is assertable too — requirements are front matter and must
  // NOT bleed onto the back. (The tickable copy stays on the identity card,
  // where a tick is an act of play that saves immediately.)
  it('prints the requirements on the FRONT of an arcanum, not the back', () => {
    const { container } = show('arcanum', {
      tier: 'minor',
      mysteries: [{ name: 'The Fist Unclenched', text: 'When you...' }],
    });
    const [front, back] = faces(container);
    expect(front.textContent).toContain('decipher the Maker-runes');
    expect(back.textContent).not.toContain('decipher the Maker-runes');
  });

  // Same face for an artifact — it has only the one, and the rule is the same.
  it('prints the requirements on an artifact`s single face', () => {
    const { container } = show('artifact', {});
    expect(faces(container)[0].textContent).toContain('decipher the Maker-runes');
  });

  it('renders with an empty block without crashing', () => {
    show('arcanum', {});
    expect(screen.getByText('A half-buried plaque')).toBeTruthy();
  });

  // The Red Scepter's printed card: its charge row and progress row both print
  // on the FRONT, beside the moves that fill them — not on the back with the
  // mysteries (see the component doc for why the generic Book I rule doesn't
  // cover tracks). One face throughout Phase 1, so this stays inside it.
  it('renders tracks through PipTrack on the front face', () => {
    const { container } = show('arcanum', {
      tier: 'minor',
      tracks: [{ label: 'Charges', max: 3, marked: 2 }],
    });
    expect(faces(container)).toHaveLength(1);
    const pips = screen.getAllByRole('button', { name: /Charges/ });
    expect(pips).toHaveLength(3);
    expect(pips[0].getAttribute('aria-pressed')).toBe('true');
    expect(pips[1].getAttribute('aria-pressed')).toBe('true');
    expect(pips[2].getAttribute('aria-pressed')).toBe('false');
  });

  // Marking a charge is play, not an edit — it must save from THIS read-mode
  // card. `onTrackChange` is called with the TRACK'S OWN INDEX, not the pip's
  // step, because CharacterSheetPage's `markTrack` looks the row up by index.
  it('marking a pip calls onTrackChange with the track`s index and the new value', () => {
    const onTrackChange = vi.fn();
    show('arcanum', {
      tier: 'minor',
      tracks: [
        { label: 'Charges', max: 3, marked: 0 },
        { label: 'Progress', max: 4, marked: 0 },
      ],
    }, { onTrackChange });
    fireEvent.click(screen.getAllByRole('button', { name: /^Progress 2$/ })[0]);
    expect(onTrackChange).toHaveBeenCalledWith(1, 2);
  });

  // Same split as FollowerCard's loyalty pips and the sheet's requirement
  // tick: the control stays visible to a viewer so they can still read
  // progress, but the toggle itself is a no-op for them.
  it('a viewer cannot mark a track — the pip stays visible but inert', () => {
    useAppStore.setState({ session: makeSession('viewer') });
    const onTrackChange = vi.fn();
    show('arcanum', {
      tier: 'minor',
      tracks: [{ label: 'Charges', max: 3, marked: 1 }],
    }, { onTrackChange });
    const pip = screen.getAllByRole('button', { name: /^Charges 2$/ })[0];
    expect(pip).toHaveProperty('disabled', true);
    fireEvent.click(pip);
    expect(onTrackChange).not.toHaveBeenCalled();
  });

  // An unlabelled track (`label: ''`) is legal — `normalizeTrack` permits it
  // and the vault reader round-trips it — so the card must render its pips
  // without inventing a label or crashing on the empty accessible name.
  it('renders an unlabelled track without crashing', () => {
    show('arcanum', { tier: 'minor', tracks: [{ label: '', max: 2, marked: 0 }] });
    // The accessible name is whitespace-trimmed ("" + " " + step → "1"/"2"),
    // so this also confirms no placeholder label ("Track", "Untitled"…) crept
    // in ahead of the step number.
    expect(screen.getAllByRole('button', { name: '1' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: '2' })).toHaveLength(1);
  });

  it('does not render a track section when there are no tracks', () => {
    const { container } = show('arcanum', { tier: 'minor' });
    expect(container.querySelector('[role="radiogroup"]')).toBeNull();
    // The wrapper itself, not just its (necessarily absent) PipTrack content —
    // an empty `tracks.map` would already leave no radiogroup behind even if
    // the section's own `tracks.length > 0` gate were removed.
    expect(container.querySelector('.mt-4.space-y-2')).toBeNull();
  });

  // The reachable-in-one-click gap: a GM adds a track and saves before typing
  // a max. `PipTrack` itself returns null for `max <= 0`, but that alone would
  // leave an EMPTY `mt-4 space-y-2` spacer on the face — the same "heading
  // with nothing under it" this file's own doc argues is worse than no
  // section (see the Task 15 discussion above). The section must not open at
  // all for a track that has nothing to show yet.
  it('does not open the track section for a max-0 track (nothing to show yet)', () => {
    const { container } = show('arcanum', {
      tier: 'minor',
      tracks: [{ label: 'Charges', max: 0, marked: 0 }],
    });
    expect(container.querySelector('.mt-4.space-y-2')).toBeNull();
  });

  // A max-0 row ahead of a real one must not shift which track a click
  // patches — `onTrackChange`'s index addresses the STORED array, not the
  // filtered/rendered position.
  it('a max-0 track ahead of a real one does not shift the real one`s index', () => {
    const onTrackChange = vi.fn();
    show('arcanum', {
      tier: 'minor',
      tracks: [
        { label: 'Not sized yet', max: 0, marked: 0 },
        { label: 'Charges', max: 3, marked: 0 },
      ],
    }, { onTrackChange });
    fireEvent.click(screen.getAllByRole('button', { name: /^Charges 1$/ })[0]);
    expect(onTrackChange).toHaveBeenCalledWith(1, 1);
  });

  // The back's own content — Task 15. `moveBlock` is the SAME renderer the
  // front uses (see the component doc), so the tags-parenthesis and heading
  // behaviour need no separate coverage here; what's new is the panel itself
  // and the book's read-only ☐ beside each mystery's name.
  it('renders the mysteries on the back with the book`s checkbox', () => {
    const { container } = show('arcanum', {
      tier: 'major',
      mysteries: [
        {
          name: 'Burning Hatred', tags: 'near, magical, reload', text: 'When you...', gained: true,
        },
        // An ungained mystery alongside a gained one: the box must say NO,
        // not just omit a "yes" — a fixed "Gained X" label regardless of
        // state would misreport this one.
        { name: 'The Fist Unclenched', text: 'When you...' },
      ],
    });
    const back = faces(container)[1];
    expect(back.textContent).toContain('Burning Hatred');
    expect(back.textContent).toContain('(near, magical, reload)');
    // NO `aria-pressed` anywhere on this face. It used to sit on the ☐ and
    // was an `aria-allowed-attr` violation: the box is a `role="img"`, and
    // `aria-pressed` is a `role="button"` state, so assistive tech discarded
    // it. The state-dependent LABEL is the channel that actually says which,
    // and it must switch text with the state rather than reading "Gained X"
    // for both — which would misreport the ungained one.
    expect(back.querySelector('[aria-pressed]')).toBeNull();
    expect(screen.getByLabelText('Gained Burning Hatred')).toBeTruthy();
    expect(screen.getByLabelText('Not gained The Fist Unclenched')).toBeTruthy();
    // Read-only: a mystery is gained through the sheet's editor, not by
    // tapping the card — unlike a track's pip (or, from Task 16, a
    // consequence's tick), which change mid-session. Asserting on `button`
    // rather than the old `button[aria-pressed]`, which went vacuous the
    // moment the attribute was deleted.
    expect(back.querySelector('button')).toBeNull();
  });

  // Front moves and back mysteries are different arrays with different
  // existence conditions — a front move must never leak onto the back just
  // because the back panel is now open, and vice versa.
  it('keeps front moves off the back', () => {
    const { container } = show('arcanum', {
      tier: 'minor',
      moves: [{ name: 'Inflame', text: 'a' }],
      mysteries: [{ name: 'Hatred', text: 'b' }],
    });
    const [front, back] = faces(container);
    expect(front.textContent).toContain('Inflame');
    expect(front.textContent).not.toContain('Hatred');
    expect(back.textContent).toContain('Hatred');
  });

  // Task 16: the back's own checkbox list — {label, checked}[], the exact
  // shape `traits`/requirements already use, but a SEPARATE array (an arcanum
  // has requirements AND consequences). Tickable here, unlike a mystery's
  // read-only ☐: a consequence is exacted mid-session, the same "it's play"
  // argument as a track's pip.
  it('renders consequences on the back as a checkbox list', () => {
    const { container } = show('arcanum', {
      tier: 'major',
      consequences: [
        { label: 'Your skin becomes feverish', checked: true },
        { label: 'Your eyes change, glowing like fiery embers', checked: false },
      ],
    });
    const back = faces(container)[1];
    expect(back.textContent).toContain('Your skin becomes feverish');
    expect(back.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1);
  });

  it('renders no Consequences heading when the list is empty', () => {
    show('arcanum', { tier: 'major' });
    expect(screen.queryByText('Consequences')).toBeNull();
  });

  // The "Mysteries of X" heading belongs to the mysteries SECTION, not to the
  // back face in general: a back opened by consequences alone (no mysteries
  // recorded yet) must not print a heading about mysteries over nothing —
  // the same "heading over an empty section" rule the doc comment argues
  // against for the panel itself.
  it('omits the Mysteries heading when the back holds only consequences', () => {
    const { container } = show('arcanum', {
      tier: 'major',
      consequences: [{ label: 'Your skin becomes feverish', checked: false }],
    });
    const back = faces(container)[1];
    expect(back.textContent).not.toContain('Mysteries of');
    expect(screen.getByText('Consequences')).toBeTruthy();
  });

  // A CheckBox's accessible name is its label alone (state rides on
  // `aria-pressed`, which IS honoured for `role="button"` — unlike a
  // mystery's read-only `role="img"` glyph, which has to fold the state into
  // the label text itself). Two consequences sharing one fixed string (e.g.
  // a name of "Consequence" for all rows) would collapse them to the same
  // accessible name; asserting each label resolves to exactly one button is
  // what would catch that.
  it('gives each consequence its own accessible name', () => {
    show('arcanum', {
      tier: 'major',
      consequences: [
        { label: 'Your skin becomes feverish', checked: false },
        { label: 'Your eyes change, glowing like fiery embers', checked: false },
      ],
    });
    expect(screen.getAllByRole('button', { name: 'Your skin becomes feverish' })).toHaveLength(1);
    expect(screen.getAllByRole('button', {
      name: 'Your eyes change, glowing like fiery embers',
    })).toHaveLength(1);
  });

  // Ticking is play, not editing (same contract as a track's pip): the tap
  // must reach the callback with the STORED index, not the rendered position.
  it('ticking a consequence calls onToggleConsequence with its index', () => {
    const onToggleConsequence = vi.fn();
    show('arcanum', {
      tier: 'major',
      consequences: [
        { label: 'Your skin becomes feverish', checked: false },
        { label: 'Your eyes change, glowing like fiery embers', checked: false },
      ],
    }, { onToggleConsequence });
    fireEvent.click(screen.getByRole('button', { name: 'Your eyes change, glowing like fiery embers' }));
    expect(onToggleConsequence).toHaveBeenCalledWith(1);
  });

  // The book's actual Red Scepter carries BOTH bodies on its
  // back at once — every test above exercises mysteries or consequences
  // alone, so this is the shape the whole feature was designed against and
  // the only fixture that takes the `mt-6` spacing branch (only applied when
  // mysteries print ABOVE the consequences section).
  it('renders mysteries and consequences together on the same back face', () => {
    const { container } = show('arcanum', {
      tier: 'major',
      mysteries: [{ name: 'Burning Hatred', text: 'When you...' }],
      consequences: [{ label: 'Your skin becomes feverish', checked: false }],
    });
    expect(faces(container)).toHaveLength(2);
    const back = faces(container)[1];
    expect(back.textContent).toContain('Burning Hatred');
    expect(back.textContent).toContain('Your skin becomes feverish');
    // The spacing branch itself: `mt-6` only applies to the consequences
    // wrapper when mysteries rendered above it.
    const consequencesHeading = screen.getByText('Consequences');
    expect(consequencesHeading.parentElement?.className).toContain('mt-6');
  });
});
