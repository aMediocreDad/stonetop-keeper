import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { StatTrack } from '@/components/steading/StatTrack';

describe('StatTrack', () => {
  it('renders 5 pips from -1 to +3 and marks the current value', () => {
    const { getAllByRole, getByRole } = render(
      <StatTrack label="Fortunes" value={1} onChange={() => {}} />,
    );
    expect(getAllByRole('radio')).toHaveLength(5);
    expect(getByRole('radio', { name: 'Fortunes +1' }).getAttribute('aria-checked')).toBe('true');
    expect(getByRole('radio', { name: 'Fortunes -1' }).getAttribute('aria-checked')).toBe('false');
  });

  it('tap a pip → onChange with that value (including -1 edge)', () => {
    const onChange = vi.fn();
    const { getByRole } = render(<StatTrack label="Defenses" value={0} onChange={onChange} />);
    fireEvent.click(getByRole('radio', { name: 'Defenses +2' }));
    expect(onChange).toHaveBeenCalledWith(2);
    fireEvent.click(getByRole('radio', { name: 'Defenses -1' }));
    expect(onChange).toHaveBeenCalledWith(-1);
  });
});
