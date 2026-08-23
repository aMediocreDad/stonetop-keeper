import { useEffect } from 'react';

// Compteur de verrous, pas un booléen : les modales s'imbriquent (le
// ConfirmDialog de suppression DANS LocationsManagerModal), et un simple
// `overflow = ''` au démontage de l'intérieure rendrait le défilement à la
// page alors que l'extérieure est toujours ouverte. Même discipline que la
// pile `dialogStack` de `useDialogFocus` — ces deux-là décrivent la même
// notion de « modale au-dessus des autres ».
let locks = 0;
let restore = '';

/**
 * Gèle le défilement de la page tant que `active`. Sans ça, la molette passée
 * sur le voile d'une modale ne trouve rien à faire défiler dans la couche
 * fixe et se propage à la page DERRIÈRE : ouvrir les notes MJ puis écrire
 * emportait le journal 1200px plus bas.
 *
 * Le verrou porte sur `body` (et non `html`) : tant que `html` reste en
 * `overflow: visible`, sa valeur est propagée à la zone d'affichage. C'est ce
 * que faisait déjà SeasonFocusModal à la main, vérifié à l'œuvre sur les deux
 * modales — inutile de verrouiller aussi la racine.
 *
 * `html { scrollbar-gutter: stable }` (index.css) est le prérequis : la
 * gouttière étant déjà réservée, masquer le débordement ne décale rien
 * latéralement là où les barres ne sont pas en surimpression (Windows/Linux).
 */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return undefined;
    if (locks === 0) {
      restore = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    locks += 1;
    return () => {
      locks -= 1;
      if (locks === 0) document.body.style.overflow = restore;
    };
  }, [active]);
}
