import { useId } from 'react';
import { useCanEdit } from '@/hooks/useRole';
import { useT } from '@/i18n';
import { LOYALTY_MAX, clampLoyalty } from '@/lib/character/statblock';
import type { FollowerBlock } from '@/types';
import { FieldLine, inputCls, selectCls } from './statLines';

interface FollowerCardProps {
  value: FollowerBlock;
  onChange: (next: FollowerBlock) => void;
  /**
   * Mode édition de la fiche (champs texte). La piste de loyauté fonctionne
   * HORS édition — c'est un acte de jeu, pas une modification de fiche (même
   * modèle à deux axes que StatBlockCard/ThreatSheetCard : `editable` gouverne
   * les champs texte, `useCanEdit()` les contrôles de jeu).
   */
  editable: boolean;
  leaderOptions: Array<{ id: string; name: string }>;
}

/**
 * Couche follower d'une fiche : coût, loyauté, meneur.
 *
 * Carte à part du stat block, parce que ce sont deux colonnes indépendantes :
 * la couche follower décrit un lien (ce qu'il coûte, à qui il obéit), le bloc
 * décrit des stats. Cocher « Follower » fait naître les deux — un follower du
 * livre a des PV et une armure — mais une ligne sans stats reste
 * lisible : le worker MCP ou la restauration d'une révision peuvent en
 * produire, et cette carte n'en dépend pas.
 *
 * La bascule qui crée/retire ce bloc vit sur la carte Informations — pas ici,
 * pour qu'il n'y ait qu'un seul endroit qui classe la fiche.
 */
export function FollowerCard({ value, onChange, editable, leaderOptions }: FollowerCardProps) {
  const t = useT();
  const canEdit = useCanEdit();
  const uid = useId();

  const setLoyalty = (n: number) => {
    if (!canEdit) return;
    onChange({ ...value, loyalty: clampLoyalty(n) });
  };

  const showCost = editable || value.cost !== '';

  const leaderName = value.leaderId
    ? leaderOptions.find((opt) => opt.id === value.leaderId)?.name
    : null;
  // Meneur non résolu (PJ supprimé depuis) : on masque la ligne plutôt que
  // d'afficher une référence cassée — « la partie » ne s'affiche que quand
  // leaderId est explicitement null.
  const showFollows = value.leaderId == null || leaderName != null;

  return (
    <div className="card-paper p-6">
      <h3 className="label-overline mb-4">{t('statblock.follower')}</h3>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-2">
        {showCost &&
          (editable ? (
            <FieldLine label={t('statblock.cost')} htmlFor={`${uid}-cost`}>
              <input
                id={`${uid}-cost`}
                type="text"
                value={value.cost}
                onChange={(e) => onChange({ ...value, cost: e.target.value })}
                className={inputCls}
              />
            </FieldLine>
          ) : (
            <span className="inline-flex items-center gap-2 text-sm font-body">
              <span className="font-semibold text-[var(--text-primary)]">{t('statblock.cost')}</span>
              <span className="text-[var(--text-secondary)]">{value.cost}</span>
            </span>
          ))}

        {/* Libellé visible : dans la carte de stats, les pastilles nues
            passaient pour une suite de la ligne Coût. Seules dans leur propre
            carte, elles avaient besoin de dire ce qu'elles comptent. */}
        <span className="inline-flex items-center gap-2 text-sm font-body">
          <span className="font-semibold text-[var(--text-primary)]">{t('statblock.loyalty')}</span>
          <span className="inline-flex items-center gap-1.5" role="group" aria-label={t('statblock.loyalty')}>
          {Array.from({ length: LOYALTY_MAX }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              role="checkbox"
              aria-checked={value.loyalty >= n}
              aria-label={`${t('statblock.loyalty')} ${n}`}
              aria-disabled={!canEdit}
              onClick={() => setLoyalty(value.loyalty >= n ? n - 1 : n)}
              className={`w-3.5 h-3.5 rounded-full border transition-colors ${
                value.loyalty >= n
                  ? 'bg-[var(--accent-primary)] border-[var(--accent-primary)]'
                  : 'border-[var(--border-paper)]'
              } ${canEdit ? 'cursor-pointer' : 'cursor-default'}`}
            />
          ))}
          </span>
        </span>
      </div>

      {editable ? (
        <FieldLine label={t('statblock.follows')} htmlFor={`${uid}-leader`}>
          <select
            id={`${uid}-leader`}
            value={value.leaderId ?? ''}
            onChange={(e) => onChange({ ...value, leaderId: e.target.value || null })}
            className={selectCls}
          >
            <option value="">{t('statblock.party')}</option>
            {leaderOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.name}
              </option>
            ))}
          </select>
        </FieldLine>
      ) : (
        showFollows && (
          <div className="text-sm font-body text-[var(--text-secondary)]">
            <span className="font-semibold text-[var(--text-primary)]">{t('statblock.follows')}</span>{' '}
            {value.leaderId == null ? t('statblock.party') : leaderName}
          </div>
        )
      )}
    </div>
  );
}
