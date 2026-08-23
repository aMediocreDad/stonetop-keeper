import { useState } from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import { useT } from '@/i18n';
import { useCanEdit } from '@/hooks/useRole';
import { improvementProgress, requirementCount } from '@/lib/steading/steading';
import { ImprovementCard } from './ImprovementCard';
import type { Steading, SteadingImprovement } from '@/types';

interface ImprovementsSectionProps {
  steading: Steading;
  onMutate: (producer: (cur: Steading) => Steading) => void;
}

export function ImprovementsSection({ steading, onMutate }: ImprovementsSectionProps) {
  const t = useT();
  const canEdit = useCanEdit();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', summary: '', requirements: '', effects: '' });
  // « En cours » reste toujours déplié ; les listes longues sont repliées par défaut.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const groups: { key: string; label: string; collapsible: boolean; items: SteadingImprovement[] }[] = [
    {
      key: 'inProgress',
      label: t('steading.groupInProgress'),
      collapsible: false,
      items: steading.improvements.filter((i) => !i.completed && improvementProgress(i).done > 0),
    },
    {
      key: 'available',
      label: t('steading.groupAvailable'),
      collapsible: true,
      items: steading.improvements.filter((i) => !i.completed && improvementProgress(i).done === 0),
    },
    {
      key: 'built',
      label: t('steading.groupBuilt'),
      collapsible: true,
      items: steading.improvements.filter((i) => i.completed),
    },
  ];

  const patchImprovement = (id: string, patch: (imp: SteadingImprovement) => SteadingImprovement) =>
    onMutate((s) => ({
      ...s,
      improvements: s.improvements.map((i) => (i.id === id ? patch(i) : i)),
    }));

  const addCustom = () => {
    const name = form.name.trim();
    if (!name) return;
    const imp: SteadingImprovement = {
      id: `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      summary: form.summary.trim(),
      requirements: form.requirements
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((text) => ({ text, done: false })),
      effects: form.effects.trim(),
      completed: false,
      custom: true,
    };
    onMutate((s) => ({ ...s, improvements: [...s.improvements, imp] }));
    setForm({ name: '', summary: '', requirements: '', effects: '' });
    setShowForm(false);
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-xl font-semibold text-[var(--text-primary)]">
          {t('steading.improvements')}
        </h3>
        {canEdit && (
          <button type="button" onClick={() => setShowForm((v) => !v)} className="btn-outline text-sm">
            <Plus size={14} />
            {t('steading.addCustom')}
          </button>
        )}
      </div>

      {canEdit && showForm && (
        <div className="card-paper p-4 mb-4 space-y-2">
          <input
            className="field-paper text-sm"
            placeholder={t('steading.customName')}
            aria-label={t('steading.customName')}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            className="field-paper text-sm"
            placeholder={t('steading.customSummary')}
            aria-label={t('steading.customSummary')}
            value={form.summary}
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
          />
          <textarea
            className="field-paper text-sm min-h-[80px]"
            placeholder={t('steading.customRequirements')}
            aria-label={t('steading.customRequirements')}
            value={form.requirements}
            onChange={(e) => setForm({ ...form, requirements: e.target.value })}
          />
          <input
            className="field-paper text-sm"
            placeholder={t('steading.customEffects')}
            aria-label={t('steading.customEffects')}
            value={form.effects}
            onChange={(e) => setForm({ ...form, effects: e.target.value })}
          />
          <div className="flex gap-2">
            <button type="button" onClick={addCustom} className="btn-ink text-sm">{t('common.add')}</button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-outline text-sm">{t('common.cancel')}</button>
          </div>
        </div>
      )}

      {groups.map((g) => {
        if (g.items.length === 0) return null;
        const open = !g.collapsible || (openGroups[g.key] ?? false);
        return (
          <div key={g.key} className="mb-5">
            {g.collapsible ? (
              <button
                type="button"
                onClick={() => setOpenGroups((o) => ({ ...o, [g.key]: !open }))}
                aria-expanded={open}
                className="flex items-center gap-1.5 mb-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                <ChevronRight
                  size={13}
                  className={`transition-transform ${open ? 'rotate-90' : ''}`}
                />
                <span className="label-overline">
                  {g.label} ({g.items.length})
                </span>
              </button>
            ) : (
              <p className="label-overline mb-2">{g.label}</p>
            )}
            {open && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {g.items.map((imp) => (
                  <ImprovementCard
                    key={imp.id}
                    improvement={imp}
                    onSetRequirementTicks={(idx, ticks) =>
                      patchImprovement(imp.id, (i) => ({
                        ...i,
                        requirements: i.requirements.map((r, j) => {
                          if (j !== idx) return r;
                          const count = requirementCount(r);
                          const p = Math.max(0, Math.min(count, ticks));
                          return { ...r, progress: p, done: p >= count };
                        }),
                      }))
                    }
                    onMarkBuilt={() => patchImprovement(imp.id, (i) => ({ ...i, completed: true }))}
                    onDelete={
                      imp.custom
                        ? () =>
                            onMutate((s) => ({
                              ...s,
                              improvements: s.improvements.filter((i) => i.id !== imp.id),
                            }))
                        : undefined
                    }
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
