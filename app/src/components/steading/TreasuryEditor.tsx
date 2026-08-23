import { Fragment } from 'react';
import { useT } from '@/i18n';
import { clampCount } from '@/lib/steading/steading';
import { useCanEdit } from '@/hooks/useRole';
import type { SteadingTreasury, TreasuryPile } from '@/types';

interface TreasuryEditorProps {
  value: SteadingTreasury;
  onChange: (next: SteadingTreasury) => void;
}

export function TreasuryEditor({ value, onChange }: TreasuryEditorProps) {
  const t = useT();
  const canEdit = useCanEdit();
  const piles = [
    { key: 'silver' as const, label: t('steading.silver') },
    { key: 'gold' as const, label: t('steading.gold') },
  ];
  const cols = [
    { key: 'purses' as const, label: t('steading.purses') },
    { key: 'handfuls' as const, label: t('steading.handfuls') },
    { key: 'coins' as const, label: t('steading.coins') },
  ];

  const setPile = (pile: 'silver' | 'gold', col: keyof TreasuryPile, v: number) =>
    onChange({ ...value, [pile]: { ...value[pile], [col]: clampCount(v) } });

  return (
    // Grille nue : rendue au pied de la carte Ressources exceptionnelles,
    // qui fournit déjà conteneur et contexte.
    <div className="grid grid-cols-[auto_repeat(3,minmax(3rem,1fr))] gap-x-3 gap-y-1.5 mt-4 items-center text-sm font-body">
        <span />
        {cols.map((c) => (
          <span key={c.key} className="font-body text-xs uppercase tracking-wider text-[var(--text-muted)] text-center">
            {c.label}
          </span>
        ))}
        {piles.map((p) => (
          <Fragment key={p.key}>
            <span className="text-[var(--text-secondary)] font-medium">{p.label}</span>
            {cols.map((c) => (
              <input
                key={c.key}
                type="number"
                min={0}
                value={value[p.key][c.key]}
                aria-label={`${p.label} ${c.label}`}
                disabled={!canEdit}
                onChange={(e) => {
                  // Champ vidé pour resaisir : ne pas écraser avec 0 pendant la frappe.
                  if (e.target.value === '') return;
                  setPile(p.key, c.key, Number(e.target.value));
                }}
                className="field-paper text-center px-1 py-1 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
              />
            ))}
          </Fragment>
        ))}
    </div>
  );
}
