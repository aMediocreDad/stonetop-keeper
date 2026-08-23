import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MovesEditor } from '../MovesEditor';
import { LanguageProvider } from '@/i18n';
import type { ArcMove } from '@/types';

// `LanguageProvider` is not optional: `useT()` throws outside it —
// PromotedRelationsList's harness wraps the same way.
const show = (value: ArcMove[], onChange = vi.fn(), showGained = false) => {
  render(
    <LanguageProvider>
      <MovesEditor
        value={value}
        onChange={onChange}
        label="Moves"
        addLabel="Add a move"
        showGained={showGained}
      />
    </LanguageProvider>,
  );
  return onChange;
};

// This repo has neither @testing-library/user-event nor jest-dom: fireEvent
// + .toBeTruthy()/.toBeNull() is the local idiom (see PromotedRelationsList's
// and CharacterSheetPage's suites).
describe('MovesEditor', () => {
  it('renders one row per move, name and body editable', () => {
    show([{ name: 'Inflame', tags: 'near, magical', text: 'When you...' }]);
    expect(screen.getByDisplayValue('Inflame')).toBeTruthy();
    expect(screen.getByDisplayValue('near, magical')).toBeTruthy();
    expect(screen.getByDisplayValue('When you...')).toBeTruthy();
  });

  it('appends an empty move', () => {
    const onChange = show([]);
    fireEvent.click(screen.getByRole('button', { name: 'Add a move' }));
    expect(onChange).toHaveBeenCalledWith([{ name: '', text: '' }]);
  });

  it('edits a name without disturbing the others', () => {
    const onChange = show([
      { name: 'A', text: 'a' },
      { name: 'B', text: 'b' },
    ]);
    fireEvent.change(screen.getByDisplayValue('B'), { target: { value: 'B!' } });
    expect(onChange).toHaveBeenLastCalledWith([
      { name: 'A', text: 'a' },
      { name: 'B!', text: 'b' },
    ]);
  });

  // `common.delete` reads 'Delete' in this codebase, not 'Remove' — matching
  // the existing icon-only-X convention used throughout (TagEditor,
  // SimpleListEditor, StatBlockCard, ThreatSheetCard, ImprovementCard, and
  // CharacterSheetPage's own trait delete), all of which compose
  // `${t('common.delete')} ${name}`. Reusing that key here keeps this button
  // consistent with every sibling remove-from-a-list control in the app,
  // rather than inventing a one-off `removeMove` key.
  it('removes a move', () => {
    const onChange = show([{ name: 'A', text: 'a' }, { name: 'B', text: 'b' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete A 1' }));
    expect(onChange).toHaveBeenCalledWith([{ name: 'B', text: 'b' }]);
  });

  it('drops the tags key when the field is emptied', () => {
    const onChange = show([{ name: 'A', tags: 'x', text: 'a' }]);
    fireEvent.change(screen.getByDisplayValue('x'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith([{ name: 'A', text: 'a' }]);
  });

  it('names its remove button after an unnamed move without crashing', () => {
    show([{ name: '', text: 'a' }]);
    expect(screen.getByRole('button', { name: 'Delete move 1' })).toBeTruthy();
  });

  // Regression guard for the indexing at MovesEditor.tsx:59,66,74. Without
  // the `${index + 1}` suffix both rows answer to "Move name" and a screen
  // reader cannot tell them apart — and every other test here queries by
  // display value or by the remove button, so nothing else would notice.
  it('gives each row its own accessible name, so two moves are distinguishable', () => {
    show([
      { name: 'Inflame', text: 'a' },
      { name: 'Burning Hatred', text: 'b' },
    ]);
    expect((screen.getByLabelText('Move name 1') as HTMLInputElement).value).toBe('Inflame');
    expect((screen.getByLabelText('Move name 2') as HTMLInputElement).value).toBe('Burning Hatred');
  });

  // FINAL REVIEW, finding 2. Tags require a NAME: `normalizeMove` drops them
  // from an unnamed move at the read boundary, because `writeMoves` can only
  // emit them inside a `### Name (tags)` heading. An enabled field here would
  // collect text the next read throws away, so the shape is refused at the
  // point of entry as well as at the boundary.
  it('disables the tags field while the row has no name, and says why', () => {
    show([{ name: '', text: 'It hums.' }]);
    const tags = screen.getByLabelText('Move tags 1') as HTMLInputElement;
    expect(tags.disabled).toBe(true);
    expect(tags.title).toBe('Name the move to give it tags');
  });

  it('enables the tags field as soon as the row is named', () => {
    show([{ name: 'Inflame', text: 'It hums.' }]);
    const tags = screen.getByLabelText('Move tags 1') as HTMLInputElement;
    expect(tags.disabled).toBe(false);
    expect(tags.title).toBe('');
  });

  // FINAL REVIEW, finding 3: the fifth ARIA defect, in the file whose three
  // FIELDS were already indexed. The delete button and the gained checkbox were
  // named `${verb} ${move.name || 'move'}`, so two unnamed rows produced two
  // controls with one name each — and an unnamed row is the default state of
  // every freshly added move, so this was the common case, not the edge one.
  it('gives two unnamed rows distinct delete buttons', () => {
    show([{ name: '', text: 'a' }, { name: '', text: 'b' }]);
    expect(screen.getByRole('button', { name: 'Delete move 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete move 2' })).toBeTruthy();
  });

  // The names must also ADDRESS the right row, not merely differ: a label that
  // says "2" while deleting row 1 is the same defect wearing a disguise.
  it('deletes the row its button is named for', () => {
    const onChange = show([{ name: '', text: 'a' }, { name: '', text: 'b' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete move 2' }));
    expect(onChange).toHaveBeenCalledWith([{ name: '', text: 'a' }]);
  });

  // Two moves a GM happened to name the SAME collide just as badly, which is
  // why the index is unconditional rather than a fallback-only suffix.
  it('keeps two identically named rows distinguishable', () => {
    show([{ name: 'Ward', text: 'a' }, { name: 'Ward', text: 'b' }]);
    expect(screen.getByRole('button', { name: 'Delete Ward 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete Ward 2' })).toBeTruthy();
  });

  it('gives two unnamed rows distinct gained checkboxes', () => {
    show([{ name: '', text: 'a' }, { name: '', text: 'b' }], undefined, true);
    expect(screen.getByRole('button', { name: 'Gained move 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Gained move 2' })).toBeTruthy();
  });

  it('ticks the gained box its label names', () => {
    const onChange = show([{ name: '', text: 'a' }, { name: '', text: 'b' }], undefined, true);
    fireEvent.click(screen.getByRole('button', { name: 'Gained move 2' }));
    expect(onChange).toHaveBeenCalledWith([
      { name: '', text: 'a' },
      { name: '', text: 'b', gained: true },
    ]);
  });

  // `showGained` is the back's own affordance — the book's ☐ beside a
  // mystery's name. Unticking DELETES the key rather than storing `false`:
  // `normalizeDiscovery` only ever stores `true`, and the vault has no way
  // to write `false`, so a stored `false` would never round-trip back out.
  it('offers a gained checkbox only when asked', () => {
    const onChange = show([{ name: 'Burning Hatred', text: 'x' }], undefined, true);
    fireEvent.click(screen.getByRole('button', { name: /gained/i }));
    expect(onChange).toHaveBeenCalledWith([{ name: 'Burning Hatred', text: 'x', gained: true }]);
  });

  // The other half of the same rule: unticking must DELETE the key, not set
  // it to `false` — `normalizeDiscovery` only ever stores `true`, and the
  // vault has no way to write `false`, so a stored `false` would never
  // round-trip back out. `toHaveBeenCalledWith` is a deep-equality check, so
  // an object carrying an extra `gained: false` fails it.
  it('deletes the gained key on untick rather than storing false', () => {
    const onChange = show([{ name: 'X', text: 'y', gained: true }], undefined, true);
    fireEvent.click(screen.getByRole('button', { name: /gained/i }));
    expect(onChange).toHaveBeenCalledWith([{ name: 'X', text: 'y' }]);
  });

  it('has no gained control on the front', () => {
    show([{ name: 'A', text: 'x' }]);
    expect(screen.queryByRole('button', { name: /gained/i })).toBeNull();
  });
});
