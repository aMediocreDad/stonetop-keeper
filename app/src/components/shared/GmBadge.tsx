import { EyeOff } from 'lucide-react';
import { useT } from '@/i18n';

/**
 * Pastille « réservé au MJ » — même langage visuel partout.
 *
 * `tone="ink"` pour les surfaces d'encre (tampons de relation) : le prune
 * nominal y est illisible (~2,2:1), la variante éclaircie tient ≈6:1.
 */
export function GmBadge({ label, tone = 'paper' }: { label?: string; tone?: 'paper' | 'ink' }) {
  const t = useT();
  const onInk = tone === 'ink';
  return (
    <span
      className="inline-flex items-center gap-1 font-body text-[10px] uppercase tracking-[0.18em] font-semibold px-2 py-0.5 rounded border"
      style={{
        color: onInk ? 'var(--gm-accent-ink)' : 'var(--gm-accent)',
        borderColor: onInk ? 'var(--gm-accent-ink)' : 'var(--gm-accent)',
        backgroundColor: onInk ? 'var(--gm-accent-ink-soft)' : 'var(--gm-accent-soft)',
      }}
    >
      <EyeOff size={10} />
      {label ?? t('gm.badge')}
    </span>
  );
}
