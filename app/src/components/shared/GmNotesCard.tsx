import { Pencil } from 'lucide-react';
import { RichText } from '@/components/shared/RichText';
import { GmBadge } from '@/components/shared/GmBadge';
import { useIsGm } from '@/hooks/useRole';
import { useT } from '@/i18n';
import type { MentionItem } from '@/components/editor/mentionItems';

interface GmNotesCardProps {
  value: string;
  /** Édition en place (fiches) — inutile en mode `onOpen`. */
  onChange?: (html: string) => void;
  editable?: boolean;
  mentionItems?: MentionItem[];
  /** Override the card heading/hint (defaults: gm.notesTitle / gm.notesHint). */
  title?: string;
  hint?: string;
  /**
   * Mode « lecture puis focus » (motif des Chroniques) : la carte rend la
   * prose, le clic ouvre une modale d'édition. Les fiches, elles, gardent
   * l'édition en place — leur crayon d'en-tête pilote déjà tout le formulaire.
   */
  onOpen?: () => void;
}

/**
 * Bloc de notes MJ — carte papier teintée de l'accent MJ (filet gauche +
 * fond légèrement lavé). Se masque elle-même si l'utilisateur n'est pas MJ :
 * le serveur ne renvoie de toute façon jamais `gm_notes` aux non-MJ, mais
 * l'auto-gating garde les points d'appel (fiches perso/lieu) propres, sans
 * répéter `useIsGm()` à chaque callsite.
 */
export function GmNotesCard({
  value,
  onChange,
  editable = false,
  mentionItems,
  title,
  hint,
  onOpen,
}: GmNotesCardProps) {
  const t = useT();
  const isGm = useIsGm();

  if (!isGm) return null;

  // Clic = raccourci pointeur ; l'accès clavier/lecteur d'écran passe par le
  // bouton « Éditer » de l'en-tête. Une mention cliquée navigue (la ReadView
  // de RichText stoppe la propagation), et une sélection de texte en cours
  // (copie) ne doit pas ouvrir la modale. Même contrat que SeasonField.
  const openOnClick = () => {
    if (window.getSelection()?.isCollapsed === false) return;
    onOpen?.();
  };

  return (
    <div
      className="card-paper card-frame card-frame-arcana p-6"
      style={{ backgroundColor: 'var(--gm-accent-soft)' }}
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="label-overline">{title ?? t('gm.notesTitle')}</h3>
            <GmBadge />
          </div>
          <p className="text-xs text-[var(--text-muted)] font-body">{hint ?? t('gm.notesHint')}</p>
        </div>
        {onOpen && (
          // Toujours visible, jamais révélé au survol : c'est le seul point
          // d'entrée quand la note est VIDE (il n'y a alors pas de prose à
          // cliquer) et le seul chemin clavier vers l'éditeur. Même contrôle
          // que le crayon des fiches — on n'invente pas un geste par surface.
          <button
            type="button"
            onClick={onOpen}
            className="btn-outline text-sm shrink-0"
            aria-label={t('gm.notesEdit')}
          >
            <Pencil size={14} />
            {t('common.edit')}
          </button>
        )}
      </div>
      {onOpen ? (
        <div onClick={openOnClick} className="cursor-pointer">
          {value ? (
            <RichText content={value} editable={false} mentionItems={mentionItems} />
          ) : (
            <p className="font-reading italic text-[var(--text-muted)] text-[0.95rem]">
              {t('gm.notesEmpty')}
            </p>
          )}
        </div>
      ) : (
        <RichText
          content={value}
          onChange={onChange}
          editable={editable}
          mentionItems={mentionItems}
        />
      )}
    </div>
  );
}
