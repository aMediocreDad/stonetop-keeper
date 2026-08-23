import { TRACK_MIN, TRACK_MAX } from '@/lib/steading/steading';
import { useCanEdit } from '@/hooks/useRole';
import { StampIcon } from '@/components/shared/StampIcon';

interface StatTrackProps {
  label: string;
  value: number; // -1..+3
  onChange: (v: number) => void;
  /** Tampon officiel en filigrane (import PNG de assets/stonetop), optionnel. */
  stamp?: string;
}

const fmt = (v: number) => (v >= 0 ? `+${v}` : `${v}`);

/**
 * Piste -1..+3 façon playbook : tap direct sur la case, pas de mode édition.
 * Viewer : la valeur reste lisible, les cases sont désactivées (pas de mode
 * édition séparé à masquer ici).
 */
export function StatTrack({ label, value, onChange, stamp }: StatTrackProps) {
  const canEdit = useCanEdit();
  const steps: number[] = [];
  for (let v = TRACK_MIN; v <= TRACK_MAX; v++) steps.push(v);

  return (
    <div className="relative overflow-hidden flex flex-col items-center gap-1.5 px-3 py-2.5 card-paper">
      {/* Filigrane façon ThreatSheetCard (Jason Lutes, CC BY 4.0). Le dégradé
          radial fond le bord de rognage du tampon (plein cadre) dans la carte. */}
      {stamp && (
        <span
          aria-hidden="true"
          className="absolute -top-2 -right-2 pointer-events-none"
          style={{
            maskImage: 'radial-gradient(110% 110% at 100% 0%, black 40%, transparent 95%)',
            WebkitMaskImage: 'radial-gradient(110% 110% at 100% 0%, black 40%, transparent 95%)',
          }}
        >
          <StampIcon src={stamp} size={64} style={{ color: 'var(--text-primary)', opacity: 0.1 }} />
        </span>
      )}
      <span className="label-overline">{label}</span>
      <div
        className="flex items-center gap-1"
        role="radiogroup"
        aria-label={label}
        onKeyDown={(e) => {
          if (!canEdit) return;
          // Contrat clavier ARIA du pattern radiogroup : flèches = naviguer/sélectionner.
          const idx = steps.indexOf(value);
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (idx < steps.length - 1) onChange(steps[idx + 1]);
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault();
            if (idx > 0) onChange(steps[idx - 1]);
          }
        }}
      >
        {steps.map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            aria-label={`${label} ${fmt(v)}`}
            tabIndex={value === v ? 0 : -1}
            disabled={!canEdit}
            onClick={() => onChange(v)}
            className={`w-9 h-9 rounded-full border text-[11px] font-medium font-body transition-[color,background-color,border-color,transform] disabled:cursor-not-allowed ${
              value === v
                ? 'bg-[var(--accent-primary)] text-[var(--text-inverse)] border-[var(--accent-primary)] scale-110'
                : 'bg-[var(--bg-card)] text-[var(--text-muted)] border-[var(--border-paper)] disabled:hover:bg-[var(--bg-card)] hover:bg-[var(--bg-card-alt)]'
            }`}
          >
            {fmt(v)}
          </button>
        ))}
      </div>
    </div>
  );
}
