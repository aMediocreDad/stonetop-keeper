import { useState } from 'react';
import { X } from 'lucide-react';
import { useT } from '@/i18n';

/**
 * Saisie de tags — pastilles + champ, partagée par ses DEUX maisons possibles :
 * le bloc de stats (le cas normal, les tags y sont des stats de jeu) et la
 * carte Informations pour les fiches statless que le MCP ou une
 * restauration de révision produisent. Une seule des deux s'affiche à la fois,
 * mais elles doivent se comporter et se ressembler à l'identique — d'où
 * l'extraction plutôt qu'un copier-coller entre les deux fichiers.
 *
 * En lecture, les tags ne passent pas par ici : ils remontent sous le nom de la
 * fiche, dans la ligne de descripteurs.
 */
export function TagEditor({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const t = useT();
  const [input, setInput] = useState('');

  const add = () => {
    const label = input.trim();
    if (!label) return;
    if (!value.includes(label)) onChange([...value, label]);
    setInput('');
  };

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {value.map((tag) => (
        <span key={tag} className="tag-pill">
          {tag}
          <button
            type="button"
            onClick={() => onChange(value.filter((x) => x !== tag))}
            aria-label={`${t('common.delete')} ${tag}`}
            className="p-2 -my-2 -ml-1 -mr-3 text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors"
          >
            <X size={10} />
          </button>
        </span>
      ))}
      {/* La pastille EST le champ : bordure --border-field (AA 1.4.11) et
          focus-within reprenant .field-paper:focus — l'input intérieur est en
          outline-none, sans ça le focus clavier n'a plus d'indicateur. */}
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[var(--border-field)] text-[0.8125rem] transition-[border-color,box-shadow] duration-150 focus-within:border-[var(--border-focus)] focus-within:shadow-[0_0_0_3px_var(--paper-shadow)]">
        <input
          value={input}
          aria-label={t('character.tags')}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={t('character.tagPlaceholder')}
          className="bg-transparent outline-none w-20 text-[0.8125rem] placeholder:text-[var(--text-muted)]"
        />
      </span>
    </div>
  );
}
