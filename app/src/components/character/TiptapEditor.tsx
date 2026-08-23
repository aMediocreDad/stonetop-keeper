import { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Bold, Heading2, Italic, List, ListOrdered } from 'lucide-react';
import { useT } from '@/i18n';
import { buildMentionExtension } from '@/components/editor/mentions';
import type { MentionItem } from '@/components/editor/mentionItems';

interface TiptapEditorProps {
  content: string;
  onChange: (html: string) => void;
  /** Placeholder affiché quand le document est vide. */
  placeholder?: string;
  /** Sans habillage (bordure/fond) : le parent style le contenu lui-même. */
  bare?: boolean;
  /** Donne le focus (curseur en fin de texte) au montage. */
  autofocus?: boolean;
  /**
   * Cibles proposées en tapant `@` (personnages, lieux). Le nœud mention est
   * toujours dans le schéma — sans cette prop, les mentions existantes se
   * rendent quand même, on ne peut juste pas en insérer de nouvelles.
   */
  mentionItems?: MentionItem[];
  /** Remplit la hauteur donnée et fait défiler la prose, barre d'outils fixe. */
  fill?: boolean;
}

/**
 * Éditeur Tiptap — ÉDITION seulement. La lecture est rendue statiquement par
 * RichText (seul importeur autorisé de ce module : il le charge en lazy pour
 * garder le chunk tiptap ~130 KiB hors du chemin critique — un import
 * statique d'ici annulerait ce découpage, l'ESLint no-restricted-imports le
 * bloque). Toute la mécanique lecture (mentions cliquables/focalisables,
 * setEditable) vit dans la ReadView de RichText.
 *
 * On synchronise `content` quand il change depuis l'extérieur (par exemple
 * au chargement d'une nouvelle fiche), pour que l'éditeur reflète bien la
 * nouvelle valeur.
 */
export function TiptapEditor({
  content,
  onChange,
  placeholder,
  bare = false,
  autofocus = false,
  mentionItems,
  fill = false,
}: TiptapEditorProps) {
  const t = useT();

  // Ref lue à chaque frappe (jamais pendant le rendu) : la liste de
  // personnages peut changer (temps réel) sans que l'éditeur — configuré une
  // seule fois — soit recréé. Mise à jour après commit, dans un effet.
  const mentionItemsRef = useRef<MentionItem[]>([]);
  useEffect(() => {
    mentionItemsRef.current = mentionItems ?? [];
  }, [mentionItems]);

  const editor = useEditor({
    extensions: [
      // Titres limités à h2/h3 : titres d'événements dans les chroniques et
      // sections de notes — h1 reste réservé aux titres de page de l'app.
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Placeholder.configure({
        // Repli localisé : le défaut codé en dur (français) fuyait chez les
        // utilisateurs EN quand l'appelant ne passait pas de placeholder.
        placeholder: placeholder ?? t('character.noteEditorPlaceholder'),
      }),
      // Faux positif : la fermeture n'est invoquée que par le plugin de
      // suggestion au moment de la frappe, jamais pendant le rendu.
      // eslint-disable-next-line react-hooks/refs
      buildMentionExtension(() => mentionItemsRef.current),
    ],
    content,
    autofocus: autofocus ? 'end' : false,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // Synchroniser le contenu si la prop change depuis l'extérieur (changement
  // de fiche, annulation d'édition, etc.). On ne le fait que si la valeur
  // diffère vraiment de l'état actuel pour ne pas casser le curseur de
  // l'utilisateur en train de taper.
  useEffect(() => {
    // isDestroyed : useEditor crée l'éditeur pendant le rendu et programme sa
    // destruction à 1 ms, annulée seulement par l'effet de montage. Monté en
    // lazy (reprise Suspense, rendu concurrent + StrictMode), ce délai peut
    // expirer avant le flush des effets : l'instantané commité est alors un
    // éditeur détruit (schema null → getHTML() plante sur `schema.cached`).
    // Le gestionnaire en recrée un vivant dans le même flush et re-rend —
    // on laisse simplement passer ce tour-là.
    if (!editor || editor.isDestroyed) return;
    const current = editor.getHTML();
    if (content !== current) {
      // `emitUpdate: false` : ne déclenche pas onUpdate (pas de boucle).
      editor.commands.setContent(content || '', { emitUpdate: false });
    }
  }, [content, editor]);

  if (!editor) return null;

  const tools = [
    {
      key: 'heading',
      Icon: Heading2,
      label: t('editorToolbar.heading'),
      active: editor.isActive('heading', { level: 2 }),
      run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      key: 'bold',
      Icon: Bold,
      label: t('editorToolbar.bold'),
      active: editor.isActive('bold'),
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      key: 'italic',
      Icon: Italic,
      label: t('editorToolbar.italic'),
      active: editor.isActive('italic'),
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      key: 'bulletList',
      Icon: List,
      label: t('editorToolbar.bulletList'),
      active: editor.isActive('bulletList'),
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      key: 'orderedList',
      Icon: ListOrdered,
      label: t('editorToolbar.orderedList'),
      active: editor.isActive('orderedList'),
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
  ] as const;

  // `aria-label` + `aria-pressed` : cinq boutons icône-seulement, à bascule —
  // sans nom ni état annoncés, un lecteur d'écran entendait « bouton » ×5.
  const toolbar = (
    <div className="tiptap-toolbar flex items-center gap-1 px-3 py-2 bg-[var(--bg-card-alt)] border-b border-[var(--border-subtle)]">
      {tools.map(({ key, Icon, label, active, run }) => (
        <button
          key={key}
          type="button"
          onClick={run}
          aria-label={label}
          aria-pressed={active}
          className={`p-1.5 rounded transition-colors ${
            active
              ? 'bg-[var(--accent-primary)] text-[var(--text-inverse)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
          }`}
        >
          <Icon size={14} />
        </button>
      ))}
    </div>
  );

  if (bare) {
    return (
      <div className="tiptap-bare">
        {toolbar}
        <EditorContent editor={editor} />
      </div>
    );
  }

  return (
    // Bordure --border-field : même frontière AA (WCAG 1.4.11) que les
    // .field-paper voisins — le plus grand champ de la fiche ne peut pas être
    // le seul sans liseré perceptible. focus-within reprend le langage de
    // .field-paper:focus (bordure encre + halo), puisque .ProseMirror
    // lui-même est en outline:none.
    <div
      className={`border border-[var(--border-field)] rounded-lg overflow-hidden transition-[border-color,box-shadow] duration-150 focus-within:border-[var(--border-focus)] focus-within:shadow-[0_0_0_3px_var(--paper-shadow)] ${
        // `flex-1 min-h-0` et NON `h-full` : la modale se dimensionne en
        // `max-height`, donc sa hauteur est indéfinie et un pourcentage n'a
        // rien contre quoi se résoudre — mesuré, le panneau débordait de
        // 93px vers le haut de l'écran. En flex pur, aucun pourcentage.
        fill ? 'flex flex-col flex-1 min-h-0' : ''
      }`}
    >
      {toolbar}
      {/* En mode `fill`, c'est CE bloc qui défile — la barre d'outils reste
          en tête. Faire défiler la boîte entière l'emporterait hors de vue,
          au moment précis où on met le texte en forme. */}
      <div
        className={`bg-[var(--bg-card)] ${fill ? 'tiptap-fill flex-1 min-h-0 overflow-y-auto' : ''}`}
      >
        <EditorContent
          editor={editor}
          className="px-4 py-3 min-h-[150px] text-[var(--text-primary)] font-reading text-[0.95rem] leading-relaxed"
        />
      </div>
    </div>
  );
}
