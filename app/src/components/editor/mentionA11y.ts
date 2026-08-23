/** Identifiants DOM partagés entre la liste de suggestions et l'éditeur
 *  (câblage combobox ARIA : aria-controls / aria-activedescendant). */

export const MENTION_LISTBOX_ID = 'mention-listbox';

/** Id DOM d'une option — référencé par aria-activedescendant sur l'éditeur. */
export const mentionOptionDomId = (itemId: string) =>
  `mention-option-${itemId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
