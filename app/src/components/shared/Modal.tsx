import { useRef, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import { useScrollLock } from '@/hooks/useScrollLock';
import { useT } from '@/i18n';

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
  // Surface d'écriture, pas un formulaire : cale sur les 920px du panneau
  // plein écran des Chroniques, le précédent maison pour « écrire au calme ».
  '2xl': 'max-w-4xl',
} as const;

interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** id du titre rendu dans les enfants — relie `aria-labelledby`. */
  labelledBy?: string;
  /** id de la description rendue dans les enfants — relie `aria-describedby`. */
  describedBy?: string;
  role?: 'dialog' | 'alertdialog';
  size?: keyof typeof SIZES;
  /** Croix en haut à droite (défaut : oui). */
  showClose?: boolean;
  /** Libellé accessible de la croix (défaut : `common.close`). */
  closeLabel?: string;
  /** Classes supplémentaires sur le panneau (ex. `border-2 [border-color:var(--danger)]`). */
  panelClassName?: string;
  /** Faux pendant une requête : voile, Échap et croix ne ferment plus. */
  dismissible?: boolean;
  /**
   * Plafonne le panneau à la hauteur de l'écran et en fait une colonne flex :
   * c'est alors au CONTENU de défiler (un enfant en `flex-1 min-h-0
   * overflow-y-auto`), pas à la modale de s'allonger sous le voile. Pour les
   * longues surfaces d'écriture ; les formulaires courts n'en ont pas besoin.
   */
  fillHeight?: boolean;
  children: ReactNode;
}

/**
 * Coque de modale « Encre & Pierre » — voile encre, panneau papier, animation
 * framer-motion, et l'accessibilité qui manquait aux modales maison : rôle
 * `dialog`, piège à focus, retour du focus, Échap, et conteneur scrollable
 * (`overflow-y-auto` + `min-h-full items-center`) pour que rien ne soit rogné
 * sur un petit écran clavier ouvert. Généralise l'ancien `ConfirmDialog`.
 */
export function Modal({
  open,
  onClose,
  labelledBy,
  describedBy,
  role = 'dialog',
  size = 'md',
  showClose = true,
  closeLabel,
  panelClassName = '',
  dismissible = true,
  fillHeight = false,
  children,
}: ModalProps) {
  const t = useT();
  const panelRef = useRef<HTMLDivElement>(null);
  const requestClose = () => {
    if (dismissible) onClose();
  };
  useDialogFocus(open, requestClose, panelRef);
  useScrollLock(open);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 overflow-y-auto"
          style={{ backgroundColor: 'var(--scrim)' }}
          onClick={requestClose}
        >
          {/* Plein cadre sur téléphone quand le panneau est une surface de
              travail : la marge du voile (16px) plus celle du panneau (20px)
              coûtaient 72 des 390px d'un écran courant — 18 % de la largeur
              utile pour une bordure décorative. Au-delà de `sm`, la modale
              redevient une carte posée sur le voile. */}
          <div
            className={`flex min-h-full items-center justify-center ${
              fillHeight ? 'p-0 sm:p-4' : 'p-4'
            }`}
          >
            <motion.div
              ref={panelRef}
              role={role}
              aria-modal="true"
              aria-labelledby={labelledBy}
              aria-describedby={describedBy}
              tabIndex={-1}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              // p-5 en mobile : p-8 constant dépensait 64 des 328px de
              // panneau disponibles à 360px — c'était le multiplicateur
              // derrière les débordements de rangées dans les modales.
              //
              // `fillHeight` : plein écran sous `sm` (bords francs, hauteur
              // entière, marge basse au ras de la safe-area iOS façon Toast),
              // puis carte centrée et plafonnée au-delà. `100dvh` et non
              // `100vh` : la barre d'URL rétractable d'iOS fait mentir vh et
              // le bas du panneau passait dessous. Le `2rem` retranché reprend
              // le p-4 que le conteneur retrouve à partir de `sm`.
              className={`relative w-full ${SIZES[size]} card-paper p-5 sm:p-8 focus:outline-none ${
                fillHeight
                  ? 'flex flex-col h-[100dvh] max-h-[100dvh] rounded-none pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:rounded-xl sm:pb-8'
                  : ''
              } ${panelClassName}`}
              onClick={(e) => e.stopPropagation()}
            >
              {showClose && (
                <button
                  type="button"
                  onClick={onClose}
                  disabled={!dismissible}
                  aria-label={closeLabel ?? t('common.close')}
                  // p-2.5 : l'icône seule faisait une cible de ~20px — la
                  // croix de TOUTES les modales, tapée au pouce en pleine
                  // séance. Le padding porte la zone à 40px sans bouger
                  // l'icône (position compensée).
                  className="absolute top-1.5 right-1.5 p-2.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-40"
                >
                  <X size={20} />
                </button>
              )}
              {children}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
