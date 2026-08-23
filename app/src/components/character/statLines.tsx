import type React from 'react';

/**
 * L'idiome typographique des stat blocks du livre :
 * « **Damage** bronze mace d8 (close, forceful) » — libellé en gras, valeur
 * à la suite sur la même ligne. Partagé par la carte de stats, la carte de
 * follower et les cartes du tableau de bord, pour qu'un PNJ se lise pareil
 * partout.
 */

/**
 * Ligne libellé+champ du mode édition — langage `border-b` de
 * ThreatSheetCard, un champ par ligne. Pas de deux-points final : le libellé
 * est le nom accessible du champ via `htmlFor`, et les requêtes
 * `getByLabelText` veulent la chaîne i18n nue.
 */
export function FieldLine({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 text-sm font-body mb-2">
      <label htmlFor={htmlFor} className="font-semibold text-[var(--text-primary)] shrink-0">
        {label}
      </label>
      {children}
    </div>
  );
}

/** Pendant en lecture seule de `FieldLine` — masqué par l'appelant si vide. */
export function ReadLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 text-sm font-body mb-2">
      <span className="font-semibold text-[var(--text-primary)] shrink-0">{label}</span>
      <span className="text-[var(--text-secondary)]">{children}</span>
    </div>
  );
}

export const inputCls =
  'flex-1 bg-transparent border-b border-[var(--border-field)] focus:border-[var(--border-focus)] focus:outline-none pb-0.5 text-sm font-body';
export const selectCls = 'field-paper text-sm h-8 pl-2.5 w-auto';
