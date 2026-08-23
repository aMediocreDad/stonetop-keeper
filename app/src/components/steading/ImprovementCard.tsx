import { Trash2 } from 'lucide-react';
import { useT } from '@/i18n';
import { useCanEdit } from '@/hooks/useRole';
import { improvementProgress, requirementCount, requirementTicks } from '@/lib/steading/steading';
import type { SteadingImprovement } from '@/types';

interface ImprovementCardProps {
  improvement: SteadingImprovement;
  /** Fixe le nombre de coches faites sur un prérequis (1 pour les simples). */
  onSetRequirementTicks: (index: number, ticks: number) => void;
  onMarkBuilt: () => void;
  /** Présent seulement pour les améliorations custom. */
  onDelete?: () => void;
}

export function ImprovementCard({
  improvement,
  onSetRequirementTicks,
  onMarkBuilt,
  onDelete,
}: ImprovementCardProps) {
  const t = useT();
  const canEdit = useCanEdit();
  const { done, total } = improvementProgress(improvement);
  const allDone = total > 0 && done === total;

  return (
    <div className="card-paper p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-display text-lg font-semibold text-[var(--text-primary)] leading-tight">
          {improvement.name}
        </h4>
        <div className="flex items-center gap-2 flex-shrink-0">
          {improvement.completed ? (
            <span className="font-body text-[10px] uppercase tracking-[0.15em] font-semibold px-1.5 py-0.5 rounded border bg-[var(--accent-primary)] text-[var(--text-inverse)] border-[var(--accent-primary)]">
              {t('steading.builtBadge')}
            </span>
          ) : (
            <span className="text-xs font-mono text-[var(--text-muted)]">{done}/{total}</span>
          )}
          {onDelete && canEdit && (
            <button
              type="button"
              onClick={onDelete}
              aria-label={`${t('common.delete')} ${improvement.name}`}
              className="text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {improvement.summary && (
        <p className="text-sm font-body italic text-[var(--text-secondary)]">{improvement.summary}</p>
      )}

      {!improvement.completed && (
        <>
          {/* Barre de progression */}
          <div className="h-1.5 rounded-full bg-[var(--bg-secondary)] overflow-hidden">
            <div
              className="h-full bg-[var(--accent-primary)] transition-[width]"
              style={{ width: total ? `${(done / total) * 100}%` : '0%' }}
            />
          </div>
          <ul className="space-y-1">
            {improvement.requirements.map((req, i) => {
              const count = requirementCount(req);
              const ticks = requirementTicks(req);
              const reqDone = ticks >= count;

              if (count === 1) {
                return (
                  <li key={i}>
                    <label className="flex items-start gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={reqDone}
                        aria-label={req.text}
                        disabled={!canEdit}
                        onChange={() => onSetRequirementTicks(i, reqDone ? 0 : 1)}
                        className="mt-1 accent-[var(--accent-primary)]"
                      />
                      <span
                        className={`text-sm font-body ${
                          reqDone ? 'line-through text-[var(--text-muted)]' : 'text-[var(--text-secondary)]'
                        }`}
                      >
                        {req.text}
                      </span>
                    </label>
                  </li>
                );
              }

              // Prérequis répétable (« Pull Together ×5 ») : une coche par
              // occurrence — cocher la case k remplit jusqu'à k, la décocher
              // redescend à k-1. Chaque « move » se suit individuellement.
              return (
                <li key={i}>
                  <div className="flex items-start gap-2 select-none">
                    <span className="flex gap-1 mt-1 flex-shrink-0">
                      {Array.from({ length: count }, (_, j) => (
                        <input
                          key={j}
                          type="checkbox"
                          checked={j < ticks}
                          aria-label={`${req.text} (${j + 1}/${count})`}
                          disabled={!canEdit}
                          onChange={() => onSetRequirementTicks(i, j < ticks ? j : j + 1)}
                          className="accent-[var(--accent-primary)] cursor-pointer disabled:cursor-not-allowed"
                        />
                      ))}
                    </span>
                    <span
                      className={`text-sm font-body ${
                        reqDone ? 'line-through text-[var(--text-muted)]' : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      {req.text}
                      {!reqDone && ticks > 0 && (
                        <span className="ml-1.5 text-xs font-mono text-[var(--text-muted)]">
                          {ticks}/{count}
                        </span>
                      )}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {improvement.effects && (
        <p className="text-xs font-body text-[var(--text-muted)]">
          <span className="font-body uppercase tracking-wider">{t('steading.effectsLabel')}:</span>{' '}
          {improvement.effects}
        </p>
      )}

      {allDone && !improvement.completed && canEdit && (
        <button type="button" onClick={onMarkBuilt} className="btn-ink self-start text-sm">
          {t('steading.markBuilt')}
        </button>
      )}
    </div>
  );
}
