import { Suspense, lazy, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bold, Heading2, Italic, List, ListOrdered } from 'lucide-react';
import { sanitizeRichHtml } from '@/lib/sanitizeHtml';
import { mentionSheetPath, type MentionItem } from '@/components/editor/mentionItems';

/**
 * Porte d'entrée unique du texte riche. En LECTURE : du HTML statique
 * assaini — pas d'éditeur. En ÉDITION : le vrai TiptapEditor, chargé
 * paresseusement à ce moment-là.
 *
 * Avant, chaque fiche montait jusqu'à quatre instances ProseMirror complètes
 * pour AFFICHER de la prose, et le chunk tiptap (~130 KiB gzip) était une
 * dépendance statique de quatre chunks de route — payé avant le premier
 * clic sur « Éditer ». Ce module n'importe RIEN de tiptap : le chunk ne se
 * charge que quand un éditeur est réellement demandé. (Même discipline que
 * mentionItems.ts, qui garde le vocabulaire des mentions hors du chunk.)
 *
 * Le rendu statique réutilise la classe .ProseMirror pour une typographie
 * identique — précédent : SeasonFocusModal rend le HTML du conflit ainsi.
 */
const TiptapEditor = lazy(() =>
  import('@/components/character/TiptapEditor').then((m) => ({ default: m.TiptapEditor })),
);

export interface RichTextProps {
  content: string;
  /** Optionnel : les appelants lecture seule (editable={false}) n'en ont pas. */
  onChange?: (html: string) => void;
  editable?: boolean;
  placeholder?: string;
  bare?: boolean;
  autofocus?: boolean;
  mentionItems?: MentionItem[];
  /**
   * L'éditeur devient un ENFANT FLEX extensible : il prend la hauteur restante
   * de son parent et fait défiler SA prose, barre d'outils fixée en tête. À
   * n'utiliser que dans une colonne flex bornée en hauteur (`Modal fillHeight`).
   */
  fill?: boolean;
}

const noop = () => {};

/** Mentions lisibles au clavier : mêmes attributs que ceux que posait l'effet
    de lecture de l'ancien TiptapEditor, appliqués au HTML statique. */
function withMentionA11y(html: string): string {
  if (!html.includes('mention')) return html;
  const div = document.createElement('div');
  div.innerHTML = html; // déjà assaini par sanitizeRichHtml
  div.querySelectorAll('.mention').forEach((el) => {
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'link');
  });
  return div.innerHTML;
}

function ReadView({ content, bare }: Pick<RichTextProps, 'content' | 'bare'>) {
  const navigate = useNavigate();
  const html = useMemo(() => withMentionA11y(sanitizeRichHtml(content || '')), [content]);

  const openMention = (target: EventTarget | null) => {
    const path = mentionSheetPath(target as HTMLElement);
    if (path) navigate(path);
    return path !== null;
  };

  return (
    <div
      className={
        bare
          ? 'tiptap-bare'
          : 'tiptap-read text-[var(--text-primary)] font-reading text-[0.95rem] leading-relaxed'
      }
      onClick={(e) => {
        // stopPropagation : ne pas déclencher le clic du parent (ex. carte de
        // saison → modale plein écran) quand on suit une mention.
        if (mentionSheetPath(e.target as HTMLElement)) e.stopPropagation();
        openMention(e.target);
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        if (!mentionSheetPath(e.target as HTMLElement)) return;
        e.preventDefault();
        e.stopPropagation();
        openMention(e.target);
      }}
    >
      {/* contentEditable={false} : la CSS d'affordance des mentions en lecture
          est clé sur .ProseMirror[contenteditable='false'] (curseur pointeur,
          soulignement au survol) — prosemirror-view posait cet attribut,
          le rendu statique doit le poser aussi. */}
      <div
        className="ProseMirror"
        contentEditable={false}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

/**
 * Pendant que le chunk éditeur arrive : même prose, même chrome (cadre,
 * barre d'outils fantôme, hauteur réservée) — mais INERTE. Surtout pas la
 * ReadView interactive : un clic sur une mention ici partirait en navigation
 * alors que l'utilisateur voulait poser son curseur — et via la route
 * /character/:id non re-clée, pouvait écraser une autre fiche en sauvant.
 */
function EditFallback({ content, bare, fill }: Pick<RichTextProps, 'content' | 'bare' | 'fill'>) {
  const html = useMemo(() => sanitizeRichHtml(content || ''), [content]);
  // Pas de withMentionA11y ni de contenteditable : mentions inertes, sans
  // affordance de lien — rien n'est cliquable tant que l'éditeur n'est pas là.
  const toolbar = (
    <div
      aria-hidden="true"
      className="tiptap-toolbar flex items-center gap-1 px-3 py-2 bg-[var(--bg-card-alt)] border-b border-[var(--border-subtle)]"
    >
      {[Heading2, Bold, Italic, List, ListOrdered].map((Icon, i) => (
        <span key={i} className="p-1.5 rounded flex items-center text-[var(--text-muted)] opacity-50">
          <Icon size={14} />
        </span>
      ))}
    </div>
  );
  const prose = <div className="ProseMirror" dangerouslySetInnerHTML={{ __html: html }} />;

  if (bare) {
    return (
      <div className="tiptap-bare" aria-busy="true">
        {toolbar}
        {prose}
      </div>
    );
  }
  return (
    <div
      aria-busy="true"
      className={`border border-[var(--border-field)] rounded-lg overflow-hidden ${
        fill ? 'flex flex-col flex-1 min-h-0' : ''
      }`}
    >
      {toolbar}
      <div className={`bg-[var(--bg-card)] ${fill ? 'flex-1 min-h-0 overflow-y-auto' : ''}`}>
        <div className="px-4 py-3 min-h-[150px] text-[var(--text-primary)] font-reading text-[0.95rem] leading-relaxed">
          {prose}
        </div>
      </div>
    </div>
  );
}

export function RichText(props: RichTextProps) {
  const { editable = true, onChange = noop, ...editorProps } = props;
  if (!editable) return <ReadView content={props.content} bare={props.bare} />;
  return (
    <Suspense
      fallback={<EditFallback content={props.content} bare={props.bare} fill={props.fill} />}
    >
      <TiptapEditor {...editorProps} onChange={onChange} />
    </Suspense>
  );
}
