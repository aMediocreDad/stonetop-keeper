import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PipTrack } from '../PipTrack';

// The brief for this test pictures `@testing-library/user-event`,
// `.toHaveAttribute()` and `.toBeEmptyDOMElement()` (jest-dom matchers); none
// of the three exist here (see ArcanumCard.test.tsx / MovesEditor.test.tsx /
// CharacterSheetPage.test.tsx's own note on the same substitution — this repo
// has neither package). Adapted to the harness actually in this repo:
// `fireEvent.click` (synchronous, no `await`), `.getAttribute(...)` read
// directly (StatTrack.test.tsx's own idiom for the same aria check), and
// `container.firstChild` for "rendered nothing". Same assertions, same test
// names, same intent.
describe('PipTrack', () => {
  it('renders one pip per max and marks the filled ones', () => {
    render(<PipTrack label="Charges" max={3} marked={2} onChange={vi.fn()} />);
    const pips = screen.getAllByRole('button', { name: /Charges/ });
    expect(pips).toHaveLength(3);
    expect(pips[0].getAttribute('aria-pressed')).toBe('true');
    expect(pips[1].getAttribute('aria-pressed')).toBe('true');
    expect(pips[2].getAttribute('aria-pressed')).toBe('false');
  });

  it('marks up to the pip clicked', () => {
    const onChange = vi.fn();
    render(<PipTrack label="Charges" max={3} marked={0} onChange={onChange} />);
    fireEvent.click(screen.getAllByRole('button', { name: /Charges/ })[1]);
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('erases when the last filled pip is clicked — the book says erase', () => {
    const onChange = vi.fn();
    render(<PipTrack label="Charges" max={3} marked={2} onChange={onChange} />);
    fireEvent.click(screen.getAllByRole('button', { name: /Charges/ })[1]);
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('is inert and unfocusable when read-only', () => {
    const onChange = vi.fn();
    render(<PipTrack label="Charges" max={3} marked={1} onChange={onChange} readOnly />);
    const pip = screen.getAllByRole('button', { name: /Charges/ })[2];
    // The `disabled` attribute is what makes it UNFOCUSABLE (a native button
    // drops out of tab order on its own once disabled) — the brief's test name
    // promises this, but its body only checked the click outcome below, which
    // the `set()` guard alone would also satisfy even with a live, focusable
    // button. Pinning the attribute closes that gap.
    expect(pip).toHaveProperty('disabled', true);
    fireEvent.click(pip);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders nothing for a zero max rather than an empty row', () => {
    const { container } = render(<PipTrack label="Charges" max={0} marked={0} onChange={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  // Fix round 1: the wrapper must be a plain `group`, not a `radiogroup` — a
  // radiogroup promises "exactly one selected, and the selected one cannot be
  // deselected by clicking it again," which is exactly the promise this
  // track's own erase rule breaks on purpose. `aria-pressed` on a toggle
  // button is the honest role for that; `aria-checked` on a `radio` would
  // describe the interaction falsely. Nothing else pins this: every other
  // test here queries `role: 'button'`, which passes under either wrapper
  // role, so this fix would rot silently without its own assertion.
  it('wraps the pips in a group, not a radiogroup — clicking the last one erases it', () => {
    const { container } = render(<PipTrack label="Charges" max={3} marked={2} onChange={vi.fn()} />);
    const wrapper = container.querySelector('[aria-label="Charges"]');
    expect(wrapper?.getAttribute('role')).toBe('group');
    const pip = screen.getAllByRole('button', { name: /Charges/ })[0];
    expect(pip.getAttribute('aria-pressed')).toBe('true');
  });

  // Fix round 2: the arrow-key handling had ZERO coverage — a reviewer
  // deleted the whole `onKeyDown` block and every existing test still
  // passed. This is deliberately-kept behaviour (the owner told us to keep
  // it even though it's non-standard on a plain `group`), so it needs its
  // own pins, not a click-only suite that happens not to notice its absence.
  it('ArrowRight/ArrowUp on the group increments the mark', () => {
    const onChange = vi.fn();
    render(<PipTrack label="Charges" max={3} marked={1} onChange={onChange} />);
    const group = screen.getByRole('group', { name: 'Charges' });
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith(2);
    onChange.mockClear();
    fireEvent.keyDown(group, { key: 'ArrowUp' });
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('ArrowLeft/ArrowDown on the group decrements the mark', () => {
    const onChange = vi.fn();
    render(<PipTrack label="Charges" max={3} marked={1} onChange={onChange} />);
    const group = screen.getByRole('group', { name: 'Charges' });
    fireEvent.keyDown(group, { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenCalledWith(0);
    onChange.mockClear();
    fireEvent.keyDown(group, { key: 'ArrowDown' });
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it('does not step above max', () => {
    const onChange = vi.fn();
    render(<PipTrack label="Charges" max={3} marked={3} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('group', { name: 'Charges' }), { key: 'ArrowRight' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not step below 0', () => {
    const onChange = vi.fn();
    render(<PipTrack label="Charges" max={3} marked={0} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('group', { name: 'Charges' }), { key: 'ArrowLeft' });
    expect(onChange).not.toHaveBeenCalled();
  });
});
