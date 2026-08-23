import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  // Un éditeur TipTap dans une modale : son hôte est focusable au clavier
  // mais n'est ni input ni textarea. (SeasonFocusModal's own trap already
  // included it — the two traps must agree.)
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

// Pile des modales ouvertes : seule celle du sommet piège le focus et réagit à
// Échap. Sans ça, une modale imbriquée (ex. le ConfirmDialog de suppression
// dans LocationsManagerModal) verrait DEUX pièges actifs se disputer le Tab et
// Échap fermerait les deux d'un coup.
let dialogStack: symbol[] = [];

/**
 * Accessibilité d'une modale maison (le projet n'utilise pas Radix) :
 *  - piège le focus au clavier dans `panelRef` (Tab / Maj+Tab bouclent),
 *  - ferme sur Échap,
 *  - rend le focus à l'élément déclencheur à la fermeture.
 *
 * À monter tant que la modale est ouverte. Le focus initial respecte un
 * `autoFocus` déjà posé par un enfant ; sinon il vise le premier élément
 * focusable, à défaut le panneau lui-même (d'où `tabIndex={-1}` sur celui-ci).
 */
export function useDialogFocus(
  open: boolean,
  onClose: () => void,
  panelRef: RefObject<HTMLElement | null>,
) {
  // `onClose` change souvent d'identité (flèches inline) : on le lit via une
  // ref pour que l'effet ne se relance qu'à l'ouverture/fermeture réelle.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const id = Symbol('dialog');
    dialogStack.push(id);

    const raf = requestAnimationFrame(() => {
      if (!panel || panel.contains(document.activeElement)) return;
      const first = panel.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel).focus();
    });

    const onKeyDown = (e: KeyboardEvent) => {
      // Seule la modale au sommet de la pile agit (gère l'imbrication).
      if (dialogStack[dialogStack.length - 1] !== id) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusables.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };

    // Capture : Échap ferme la modale avant d'atteindre d'autres écouteurs.
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown, true);
      dialogStack = dialogStack.filter((x) => x !== id);
      // Le déclencheur peut avoir disparu pendant que la modale était ouverte
      // (ex. supprimer une ligne puis fermer) : rendre le focus à un nœud
      // détaché est un no-op qui laisse le focus sur <body>. Replier sur
      // <main> (focusable via tabIndex={-1}) pour rester dans le contenu.
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus?.();
      } else {
        document.querySelector<HTMLElement>('main')?.focus();
      }
    };
  }, [open, panelRef]);
}
