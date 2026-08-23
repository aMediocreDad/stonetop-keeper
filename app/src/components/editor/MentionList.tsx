import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { MapPin } from 'lucide-react';
import { CharacterStamp, GroupStamp } from '@/components/shared/entityIcons';
import { StampIcon } from '@/components/shared/StampIcon';
import { MENTION_LISTBOX_ID, mentionOptionDomId } from './mentionA11y';
import type { MentionItem } from './mentionItems';

export interface MentionListProps {
  items: MentionItem[];
  command: (attrs: { id: string; label: string }) => void;
  /** Notifie l'option active (pour aria-activedescendant côté éditeur). */
  onActiveChange?: (optionDomId: string | null) => void;
}

export interface MentionListRef {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

/** Menu de suggestion des mentions @ : navigable aux flèches, Entrée valide. */
export const MentionList = forwardRef<MentionListRef, MentionListProps>(function MentionList(
  { items, command, onActiveChange },
  ref,
) {
  const [rawIndex, setRawIndex] = useState(0);
  // Clamp plutôt que reset-en-effet : la liste peut rétrécir pendant la frappe.
  const index = Math.min(rawIndex, Math.max(items.length - 1, 0));

  // Tient l'éditeur informé de l'option active (lecteurs d'écran).
  const activeId = items[index] ? mentionOptionDomId(items[index].id) : null;
  useEffect(() => {
    onActiveChange?.(activeId);
  }, [activeId, onActiveChange]);

  const select = (i: number) => {
    const item = items[i];
    if (item) command({ id: item.id, label: item.label });
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      if (!items.length) return false;
      if (event.key === 'ArrowDown') {
        setRawIndex((index + 1) % items.length);
        return true;
      }
      if (event.key === 'ArrowUp') {
        setRawIndex((index - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === 'Enter') {
        select(index);
        return true;
      }
      return false;
    },
  }));

  if (!items.length) return null;

  return (
    <div className="mention-popup" role="listbox" id={MENTION_LISTBOX_ID}>
      {items.map((item, i) => (
        <button
          key={item.id}
          type="button"
          role="option"
          id={mentionOptionDomId(item.id)}
          aria-selected={i === index}
          className={`mention-option ${i === index ? 'is-active' : ''}`}
          onMouseDown={(e) => e.preventDefault() /* garde le focus dans l'éditeur */}
          onClick={() => select(i)}
          onMouseEnter={() => setRawIndex(i)}
        >
          {item.icon ? (
            <StampIcon src={item.icon} size={12} />
          ) : item.kind === 'location' ? (
            <MapPin size={12} aria-hidden="true" />
          ) : item.kind === 'group' ? (
            <GroupStamp size={12} />
          ) : (
            <CharacterStamp size={12} />
          )}
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
});
