interface PipTrackProps {
  label: string;
  max: number;
  marked: number;
  onChange: (marked: number) => void;
  readOnly?: boolean;
}

/**
 * A markable pip row: an arcanum's charges or its progress track.
 * Sibling of steading/StatTrack — same keyboard contract, different
 * cell: StatTrack prints a signed numeral per step, this fills or empties a
 * pip. Not folded into one component on purpose; the cells differ, and a
 * shared base for two of them would abstract nothing.
 *
 * Clicking the LAST FILLED pip erases it. The book's wording is "you may erase
 * 1 charge", so a track that only ever went up would model half the rule.
 *
 * The wrapper is `role="group"`, NOT `role="radiogroup"` like StatTrack's —
 * that's a real semantic difference, not a copy-paste miss. A radiogroup
 * promises "exactly one selected, and clicking the selected one does not
 * deselect it"; a pip's own erase rule breaks that promise on purpose, so
 * `aria-checked` would describe it falsely. `aria-pressed` on a toggle button
 * is the honest role for that. The arrow-key stepping is non-standard on a
 * plain group, but it is harmless and a real convenience, so it stays.
 */
export function PipTrack({ label, max, marked, onChange, readOnly = false }: PipTrackProps) {
  if (max <= 0) return null;
  const steps = Array.from({ length: max }, (_, i) => i + 1);

  const set = (step: number) => {
    if (readOnly) return;
    onChange(step === marked ? step - 1 : step);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="label-overline">{label}</span>
      <div
        className="flex items-center gap-0.5"
        role="group"
        aria-label={label}
        onKeyDown={(e) => {
          if (readOnly) return;
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (marked < max) onChange(marked + 1);
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault();
            if (marked > 0) onChange(marked - 1);
          }
        }}
      >
        {steps.map((step) => (
          <button
            key={step}
            type="button"
            aria-pressed={step <= marked}
            aria-label={`${label} ${step}`}
            tabIndex={step === Math.max(1, marked) ? 0 : -1}
            disabled={readOnly}
            onClick={() => set(step)}
            // The HIT AREA (36px, StatTrack's own tap-target size) is decoupled
            // from the ORNAMENT (the 20px dot below): a phone-at-the-table tap
            // on a 20px target with a 24px pitch is not reliable, but the card
            // ornament looks right at 20px and stays that size. No `p-2 -m-2`
            // trick — that overflowed a short row elsewhere in this app and lit
            // up a neighbour's hit area; this is a real box, not a negative
            // margin, so adjacent buttons cannot overlap regardless of gap.
            className="w-9 h-9 rounded-full flex items-center justify-center disabled:cursor-not-allowed"
          >
            <span
              aria-hidden="true"
              className={`w-5 h-5 rounded-full border transition-colors ${
                step <= marked
                  ? 'bg-[var(--text-primary)] border-[var(--text-primary)]'
                  : 'bg-transparent border-[var(--border-field)]'
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
