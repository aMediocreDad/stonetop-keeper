import { Plus, X } from 'lucide-react';
import { CheckBox } from '@/pages/CharacterSheetPage';
import { useT } from '@/i18n';
import type { ArcMove } from '@/types';

interface MovesEditorProps {
  value: ArcMove[];
  onChange: (moves: ArcMove[]) => void;
  /** Section heading — "Moves" on the front, "Mysteries" on the back. */
  label: string;
  addLabel: string;
  /** Render the book's ☐ beside each name — the back of the card only. */
  showGained?: boolean;
}

/**
 * Edit-mode list editor for a card's moves. Read view renders them through
 * ArcanumCard; this is the manipulating voice, so it stays Inter and plain
 * fields rather than trying to look like the card.
 *
 * A textarea and not TipTap on purpose: a move body's only structure is its
 * option list, which `parseMoveBody` derives from `-` lines, and N rich-text
 * instances in one sheet is machinery for three sentences. Plain text is also
 * what makes the vault export a no-op — `- ` is already Markdown.
 */
export function MovesEditor({ value, onChange, label, addLabel, showGained }: MovesEditorProps) {
  const t = useT();

  const patch = (index: number, key: 'name' | 'tags' | 'text', next: string) => {
    const moves = value.map((m, i) => {
      if (i !== index) return m;
      const out: ArcMove = { ...m };
      // `tags` is optional: an emptied field drops the key rather than storing
      // '', so the card never renders an empty parenthesis.
      if (key === 'tags' && next === '') delete out.tags;
      else out[key] = next;
      return out;
    });
    onChange(moves);
  };

  const toggleGained = (index: number) => {
    onChange(value.map((m, i) => {
      if (i !== index) return m;
      const out: ArcMove = { ...m };
      // Unticking DELETES the key rather than storing `false`: the block stays
      // minimal, and normalizeDiscovery treats absence as not-gained anyway.
      if (m.gained) delete out.gained;
      else out.gained = true;
      return out;
    }));
  };

  return (
    <div className="space-y-3">
      {/* `block`: a bare inline <span> flowed onto the same line as the add
          button below it, so the overline and a normal-weight control shared a
          baseline — the reading voice and the manipulating voice in one row.
          No `col-span-2` either: this renders below the label/field grid now,
          not inside it. */}
      <span className="label-overline block">{label}</span>

      {value.map((move, index) => (
        <div key={index} className="relative card-paper p-4 space-y-2">
          <div className="flex gap-2 items-center">
            {showGained && (
              <CheckBox
                checked={move.gained === true}
                // Indexed like the three fields below it. The noun stays —
                // "Gained Burning Hatred" is worth more to a screen-reader user
                // than "Gained mystery 2" — but the index is UNCONDITIONAL:
                // without it two unnamed rows (the default state of every
                // freshly added move) both answer to "Gained move", and so do
                // two rows a GM happened to name the same.
                label={`${t('character.gained')} ${move.name || t('character.moveFallbackName')} ${index + 1}`}
                onToggle={() => toggleGained(index)}
              />
            )}
            <input
              value={move.name}
              onChange={(e) => patch(index, 'name', e.target.value)}
              placeholder={t('character.moveNamePlaceholder')}
              // Indexed like StatBlockCard's and ThreatSheetCard's repeated
              // rows: a bare "Move name" is fine for one move, but a card with
              // several would give N controls the identical accessible name.
              aria-label={`${t('character.moveName')} ${index + 1}`}
              className="field-paper text-sm flex-1"
            />
            <input
              value={move.tags ?? ''}
              onChange={(e) => patch(index, 'tags', e.target.value)}
              placeholder={t('character.moveTagsPlaceholder')}
              aria-label={`${t('character.moveTags')} ${index + 1}`}
              // TAGS REQUIRE A NAME — the same rule `normalizeMove` enforces at
              // the read boundary, held here so the shape cannot be created in
              // the first place rather than typed and then silently dropped.
              // In the book a tags line always sits under a move's name
              // ("BURNING HATRED (near, magical, reload)"); the
              // unnamed entries are flavour triggers and carry none.
              disabled={move.name === ''}
              title={move.name === '' ? t('character.moveTagsNeedName') : undefined}
              className="field-paper text-sm w-40 disabled:opacity-40"
            />
          </div>
          <textarea
            value={move.text}
            onChange={(e) => patch(index, 'text', e.target.value)}
            placeholder={t('character.moveTextPlaceholder')}
            aria-label={`${t('character.moveText')} ${index + 1}`}
            rows={4}
            className="field-paper text-sm w-full font-body"
          />
          <button
            type="button"
            onClick={() => onChange(value.filter((_, i) => i !== index))}
            // A NOUN, not a bare verb: the accessible name of an icon-only X
            // must say what goes. It composes `${delete} ${name} ${n}` —
            // falling back to `moveFallbackName` ('move') for a fresh, unnamed
            // row so the label is never a bare "Delete", and carrying the
            // UNCONDITIONAL index for the same reason the three fields above
            // do. Two unnamed rows both named "Delete move" was the common
            // case, not the edge one: every freshly added move starts unnamed.
            aria-label={`${t('common.delete')} ${move.name || t('character.moveFallbackName')} ${index + 1}`}
            className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-[var(--bg-card)] border border-[var(--border-paper)] text-[var(--text-muted)] hover:text-[var(--danger)] hover:border-[var(--danger-border)] flex items-center justify-center"
          >
            <X size={12} />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...value, { name: '', text: '' }])}
        className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors font-body"
      >
        <Plus size={14} />
        {addLabel}
      </button>
    </div>
  );
}
