import { Minus, Plus } from 'lucide-react';
import { clampCount } from '@/lib/steading/steading';
import { useCanEdit } from '@/hooks/useRole';
import { StampIcon } from '@/components/shared/StampIcon';
import suppliesStamp from '@/assets/stonetop/steading-supplies.png';

interface SurplusCounterProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
}

export function SurplusCounter({ label, value, onChange }: SurplusCounterProps) {
  const canEdit = useCanEdit();
  return (
    <div className="relative overflow-hidden flex flex-col items-center gap-1.5 px-3 py-2.5 card-paper">
      {/* Tampon « réserves » du livret de bourgade en filigrane (Jason Lutes,
          CC BY 4.0). Dégradé radial : fond le bord de rognage dans la carte. */}
      <span
        aria-hidden="true"
        className="absolute -top-2 -right-2 pointer-events-none"
        style={{
          maskImage: 'radial-gradient(110% 110% at 100% 0%, black 40%, transparent 95%)',
          WebkitMaskImage: 'radial-gradient(110% 110% at 100% 0%, black 40%, transparent 95%)',
        }}
      >
        <StampIcon src={suppliesStamp} size={64} style={{ color: 'var(--text-primary)', opacity: 0.1 }} />
      </span>
      <span className="label-overline">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`${label} -1`}
          disabled={!canEdit}
          onClick={() => onChange(clampCount(value - 1))}
          className="w-9 h-9 rounded-full border border-[var(--border-paper)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-alt)] disabled:hover:bg-[var(--bg-card)] disabled:cursor-not-allowed disabled:opacity-50 inline-flex items-center justify-center transition-colors"
        >
          <Minus size={13} />
        </button>
        <span className="font-display text-2xl font-bold min-w-[2ch] text-center text-[var(--text-primary)]">
          {value}
        </span>
        <button
          type="button"
          aria-label={`${label} +1`}
          disabled={!canEdit}
          onClick={() => onChange(clampCount(value + 1))}
          className="w-9 h-9 rounded-full border border-[var(--border-paper)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-alt)] disabled:hover:bg-[var(--bg-card)] disabled:cursor-not-allowed disabled:opacity-50 inline-flex items-center justify-center transition-colors"
        >
          <Plus size={13} />
        </button>
      </div>
    </div>
  );
}
