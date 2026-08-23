import { useT } from '@/i18n';
import { useCanEdit } from '@/hooks/useRole';
import type { SteadingDebilities } from '@/types';

interface DebilityTogglesProps {
  value: SteadingDebilities;
  onChange: (next: SteadingDebilities) => void;
}

const KEYS = ['diminished', 'lacking', 'malcontent'] as const;

export function DebilityToggles({ value, onChange }: DebilityTogglesProps) {
  const t = useT();
  const canEdit = useCanEdit();
  // Lookups explicites : un template literal `steading.${k}` ne satisfait pas TKey.
  const labels: Record<(typeof KEYS)[number], { name: string; hint: string }> = {
    diminished: { name: t('steading.diminished'), hint: t('steading.diminishedHint') },
    lacking: { name: t('steading.lacking'), hint: t('steading.lackingHint') },
    malcontent: { name: t('steading.malcontent'), hint: t('steading.malcontentHint') },
  };
  return (
    <div className="card-paper px-4 py-3">
      <span className="label-overline">{t('steading.debilities')}</span>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-2 mt-2">
        {KEYS.map((k) => (
          <label key={k} className="flex items-start gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={value[k]}
              disabled={!canEdit}
              onChange={(e) => onChange({ ...value, [k]: e.target.checked })}
              className="mt-1 accent-[var(--accent-primary)]"
            />
            <span className="font-body">
              <span
                className={`block text-sm font-bold ${
                  value[k] ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                }`}
              >
                {labels[k].name}
              </span>
              <span className="block text-xs text-[var(--text-muted)]">{labels[k].hint}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
