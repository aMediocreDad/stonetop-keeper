import Mention from '@tiptap/extension-mention';
import { ReactRenderer, mergeAttributes, type Editor } from '@tiptap/react';
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
import { compareNames } from '@/lib/sortByName';
import { MENTION_LISTBOX_ID } from './mentionA11y';
import { MentionList, type MentionListProps, type MentionListRef } from './MentionList';
import type { MentionItem } from './mentionItems';

/**
 * @ mentions in the editors: the Tiptap wiring (extension + suggestion
 * popup). Importing this module pulls the editor chunk, so only import it
 * from behind an editor that is actually mounted.
 *
 * The shared vocabulary (items, prefixed ids, `mentionSheetPath`) lives in
 * `./mentionItems` and stays Tiptap-free — that is what screens without an
 * editor import. Do NOT re-export it from here: one convenience import would
 * put the whole chunk back on those pages.
 */

/* Câblage combobox ARIA sur l'élément éditable : annonce l'ouverture de la
   liste et l'option active aux lecteurs d'écran. */
function setComboboxState(editor: Editor, expanded: boolean) {
  const dom = editor.view.dom as HTMLElement;
  if (expanded) {
    dom.setAttribute('aria-expanded', 'true');
    dom.setAttribute('aria-controls', MENTION_LISTBOX_ID);
    dom.setAttribute('aria-haspopup', 'listbox');
  } else {
    dom.removeAttribute('aria-expanded');
    dom.removeAttribute('aria-controls');
    dom.removeAttribute('aria-haspopup');
    dom.removeAttribute('aria-activedescendant');
  }
}

/** Popup positionnée au caret, sans dépendance externe (pas de tippy). */
function createSuggestionRenderer() {
  let component: ReactRenderer<MentionListRef, MentionListProps> | null = null;
  let activeEditor: Editor | null = null;

  const place = (rect: DOMRect | null | undefined) => {
    const el = component?.element as HTMLElement | undefined;
    if (!el || !rect) return;
    el.style.position = 'fixed';
    el.style.zIndex = '90';
    // Mesurer la VRAIE boîte plutôt que supposer 240px : .mention-popup va de
    // 200 à 280px selon la longueur des noms, et l'ancien clamp laissait
    // jusqu'à 40px hors écran à droite.
    const width = el.offsetWidth || 240;
    const height = el.offsetHeight || 200;
    el.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
    // Caret dans la moitié basse (clavier virtuel levé, typiquement) : la
    // liste s'ouvrait dessous, derrière le clavier. On bascule au-dessus du
    // caret quand la place manque en bas.
    const below = rect.bottom + 6;
    el.style.top =
      below + height > window.innerHeight - 8
        ? `${Math.max(8, rect.top - height - 6)}px`
        : `${below}px`;
  };

  const onActiveChange = (optionDomId: string | null) => {
    const dom = activeEditor?.view.dom as HTMLElement | undefined;
    if (!dom) return;
    if (optionDomId) dom.setAttribute('aria-activedescendant', optionDomId);
    else dom.removeAttribute('aria-activedescendant');
  };

  const destroy = () => {
    if (activeEditor) setComboboxState(activeEditor, false);
    activeEditor = null;
    (component?.element as HTMLElement | undefined)?.remove();
    component?.destroy();
    component = null;
  };

  return {
    onStart: (props: SuggestionProps<MentionItem>) => {
      activeEditor = props.editor;
      component = new ReactRenderer(MentionList, {
        props: { ...props, onActiveChange },
        editor: props.editor,
      });
      document.body.appendChild(component.element);
      setComboboxState(props.editor, true);
      place(props.clientRect?.());
    },
    onUpdate: (props: SuggestionProps<MentionItem>) => {
      component?.updateProps({ ...props, onActiveChange });
      place(props.clientRect?.());
    },
    onKeyDown: (props: SuggestionKeyDownProps) => {
      if (props.event.key === 'Escape' && component) {
        // Ne ferme que la popup — pas la modale plein écran au-dessus.
        props.event.stopPropagation();
        destroy();
        return true;
      }
      return component?.ref?.onKeyDown(props.event) ?? false;
    },
    onExit: destroy,
  };
}

/**
 * Extension Mention configurée. `getItems` est lu à chaque frappe : passer
 * une fonction adossée à un conteneur mutable pour suivre les personnages
 * en temps réel.
 */
export function buildMentionExtension(getItems: () => MentionItem[]) {
  return Mention.configure({
    deleteTriggerWithBackspace: true,
    renderText({ node }) {
      return `@${node.attrs.label ?? node.attrs.id}`;
    },
    renderHTML({ node, options }) {
      return [
        'span',
        mergeAttributes(
          { 'data-type': 'mention', class: 'mention' },
          options.HTMLAttributes,
          { 'data-id': node.attrs.id, 'data-label': node.attrs.label },
        ),
        `@${node.attrs.label ?? node.attrs.id}`,
      ];
    },
    suggestion: {
      items: ({ query }: { query: string }) => {
        const q = query.toLowerCase().trim();
        // Préfixes d'abord (taper « or » classe « Orin » avant « Gorg »),
        // puis alphabétique.
        return getItems()
          .filter((i) => i.label.toLowerCase().includes(q))
          .sort((a, b) => {
            const ap = a.label.toLowerCase().startsWith(q) ? 0 : 1;
            const bp = b.label.toLowerCase().startsWith(q) ? 0 : 1;
            return ap - bp || compareNames(a.label, b.label);
          })
          .slice(0, 8);
      },
      render: createSuggestionRenderer,
    },
  });
}
