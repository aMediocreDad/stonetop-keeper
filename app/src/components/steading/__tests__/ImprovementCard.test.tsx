import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { LanguageProvider } from '@/i18n';
import { ImprovementCard } from '@/components/steading/ImprovementCard';
import type { SteadingImprovement } from '@/types';

const wrap = (ui: ReactNode) => render(<LanguageProvider>{ui}</LanguageProvider>);

const base: SteadingImprovement = {
  id: 'mill',
  name: 'Mill',
  summary: 'Better bread.',
  requirements: [
    { text: 'Engineer', done: true },
    { text: 'Miller', done: false },
  ],
  effects: '+1 Fortunes.',
  completed: false,
  custom: false,
};

describe('ImprovementCard', () => {
  it('toggles a requirement', () => {
    const onTicks = vi.fn();
    const { getByLabelText } = wrap(
      <ImprovementCard improvement={base} onSetRequirementTicks={onTicks} onMarkBuilt={() => {}} />,
    );
    fireEvent.click(getByLabelText('Miller'));
    expect(onTicks).toHaveBeenCalledWith(1, 1);
    fireEvent.click(getByLabelText('Engineer'));
    expect(onTicks).toHaveBeenCalledWith(0, 0);
  });

  it('offers "mark as built" only when all requirements are done', () => {
    const allDone = {
      ...base,
      requirements: base.requirements.map((r) => ({ ...r, done: true })),
    };
    const onBuilt = vi.fn();
    const partial = wrap(
      <ImprovementCard improvement={base} onSetRequirementTicks={() => {}} onMarkBuilt={onBuilt} />,
    );
    expect(partial.queryByRole('button', { name: 'Mark as built' })).toBeNull();
    partial.unmount();

    const ready = wrap(
      <ImprovementCard improvement={allDone} onSetRequirementTicks={() => {}} onMarkBuilt={onBuilt} />,
    );
    fireEvent.click(ready.getByRole('button', { name: 'Mark as built' }));
    expect(onBuilt).toHaveBeenCalled();
  });

  it('renders one checkbox per occurrence of a repeatable requirement', () => {
    const multi: SteadingImprovement = {
      ...base,
      requirements: [{ text: 'Pull Together ×3 — each requires 1 season', done: false, progress: 1 }],
    };
    const onTicks = vi.fn();
    const { getByLabelText } = wrap(
      <ImprovementCard improvement={multi} onSetRequirementTicks={onTicks} onMarkBuilt={() => {}} />,
    );
    const label = (n: number) => `Pull Together ×3 — each requires 1 season (${n}/3)`;
    expect((getByLabelText(label(1)) as HTMLInputElement).checked).toBe(true);
    expect((getByLabelText(label(2)) as HTMLInputElement).checked).toBe(false);

    // Cocher la 3e case remplit jusqu'à 3 ; décocher la 1re redescend à 0.
    fireEvent.click(getByLabelText(label(3)));
    expect(onTicks).toHaveBeenCalledWith(0, 3);
    fireEvent.click(getByLabelText(label(1)));
    expect(onTicks).toHaveBeenCalledWith(0, 0);
  });
});
