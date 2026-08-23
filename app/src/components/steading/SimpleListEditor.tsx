import { useState, type ReactNode } from 'react';
import { Plus, X } from 'lucide-react';
import { useT } from '@/i18n';
import { useCanEdit } from '@/hooks/useRole';

interface SimpleListEditorProps {
  title: string;
  hint?: string;
  items: string[];
  onChange: (items: string[]) => void;
  /** Contenu additionnel rendu au pied de la carte (ex. trésor sous Ressources). */
  children?: ReactNode;
}

/**
 * Liste toujours éditable, comme les pistes de stats : ajout direct via la
 * ligne pointillée (Entrée valide), retrait au survol de l'élément. Pas de
 * mode édition — le crayon de l'en-tête ne concerne que l'identité du lieu.
 */
export function SimpleListEditor({ title, hint, items, onChange, children }: SimpleListEditorProps) {
  const t = useT();
  const canEdit = useCanEdit();
  const [draft, setDraft] = useState('');

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...items, v]);
    setDraft('');
  };

  return (
    // flex-col : le pied optionnel (children) se cale en bas de la carte,
    // les cartes d'une même rangée de grille étant étirées à hauteur égale.
    <div className="card-paper p-4 flex flex-col">
      <h4 className="label-overline">{title}</h4>
      {hint && <p className="text-[11px] font-body text-[var(--text-muted)] mt-0.5">{hint}</p>}
      <ul className="mt-2 space-y-1">
        {items.map((item, i) => (
          <li
            key={i}
            className="group flex items-start justify-between gap-2 text-sm font-body text-[var(--text-secondary)]"
          >
            <span>· {item}</span>
            {canEdit && (
              <button
                type="button"
                aria-label={`${t('common.delete')} ${item}`}
                onClick={() => onChange(items.filter((_, j) => j !== i))}
                className="p-2 -m-1.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 text-[var(--text-muted)] hover:text-[var(--danger)] transition-opacity flex-shrink-0"
              >
                <X size={13} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <div className="relative mt-2">
          <Plus
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none"
          />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            onBlur={add}
            placeholder={t('steading.addItemPlaceholder')}
            aria-label={`${t('common.add')} — ${title}`}
            className="w-full bg-transparent border border-dashed border-[var(--border-field)] rounded-md pl-7 pr-2.5 py-1.5 text-sm font-body text-[var(--text-primary)] placeholder:text-[var(--text-muted)] placeholder:italic outline-none transition-colors hover:border-[var(--text-muted)] focus:border-solid focus:border-[var(--border-focus)]"
          />
        </div>
      )}
      {children && <div className="mt-auto">{children}</div>}
    </div>
  );
}
