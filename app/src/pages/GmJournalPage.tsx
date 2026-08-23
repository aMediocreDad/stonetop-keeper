import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Feather, Plus, RotateCcw, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { Header } from '@/components/layout/Header';
import { GmBadge } from '@/components/shared/GmBadge';
import { GmNotesCard } from '@/components/shared/GmNotesCard';
import { Modal } from '@/components/shared/Modal';
import { RichText } from '@/components/shared/RichText';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Toast } from '@/components/shared/Toast';
import { buildMentionItems, type MentionItem } from '@/components/editor/mentionItems';
import { useAppStore } from '@/stores/appStore';
import { useCharacters } from '@/hooks/useCharacters';
import { useLocations } from '@/hooks/useLocations';
import { useGmJournal } from '@/hooks/useGmJournal';
import { useIsGm } from '@/hooks/useRole';
import { useT } from '@/i18n';
import type { Wonder } from '@/types';

/**
 * Préférence d'affichage retenue par navigateur (même geste que l'aide de la
 * roue des Chroniques) : replier « I wonder… » ou déplier « Answered » est un
 * choix de lecture qu'on ne veut pas refaire à chaque visite de la page.
 */
function useStickyFlag(key: string, fallback: boolean) {
  const [value, setValue] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : raw === '1';
    } catch {
      // stockage bloqué (navigation privée) → on garde le défaut
      return fallback;
    }
  });
  const set = (next: boolean) => {
    setValue(next);
    try {
      localStorage.setItem(key, next ? '1' : '0');
    } catch {
      // ignore
    }
  };
  return [value, set] as const;
}

/** Chevron + intitulé + compte : la commande de repli des deux listes. */
function SectionToggle({
  open,
  onToggle,
  label,
  count,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex items-center gap-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
    >
      <ChevronRight
        size={13}
        className={`transition-transform ${open ? 'rotate-90' : ''}`}
        aria-hidden
      />
      <span className="label-overline">
        {label} ({count})
      </span>
    </button>
  );
}

export default function GmJournalPage() {
  const t = useT();
  const navigate = useNavigate();
  const isGm = useIsGm();
  const session = useAppStore((s) => s.session);
  const spaceId = session?.space.id;
  const { journal, loaded, updateNotes, addWonder, toggleWonder, setResolution, deleteWonder } =
    useGmJournal(spaceId);
  const { characters } = useCharacters(spaceId);
  const { locations } = useLocations(spaceId);
  const mentionItems = useMemo<MentionItem[]>(
    () => buildMentionItems(characters, locations),
    [characters, locations],
  );

  const [draft, setDraft] = useState('');
  const [toDelete, setToDelete] = useState<Wonder | null>(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [wondersOpen, setWondersOpen] = useStickyFlag('inkstone:gm:wonders-open', true);
  // Fermé par défaut : la liste des questions répondues ne fait que grandir et
  // c'est la partie la moins relue — c'est elle qui allongeait la page.
  const [answeredOpen, setAnsweredOpen] = useStickyFlag('inkstone:gm:answered-open', false);

  // Le serveur refuse déjà les non-MJ ; l'UI ne doit pas proposer la page
  // (même garde que LedgerPage).
  useEffect(() => {
    if (!session) navigate('/');
    else if (!isGm) navigate('/dashboard');
  }, [session, isGm, navigate]);

  if (!session || !isGm) return null;

  const open = journal.wonders.filter((w) => !w.resolved);
  const resolved = journal.wonders.filter((w) => w.resolved);

  const submitDraft = () => {
    addWonder(draft);
    setDraft('');
  };

  return (
    <div className="min-h-screen">
      <Header />
      {/* Deux colonnes à partir de `lg` seulement : en dessous, la page reste
          une colonne de lecture à 3xl (la mesure du texte des notes ne doit
          pas s'étirer sur un portable) et les deux cartes s'empilent. */}
      <main className="max-w-3xl lg:max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="mb-10"
        >
          <div className="flex items-start gap-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="p-2 -ml-2 sm:mt-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors flex-shrink-0"
              title={t('character.backToGrimoire')}
            >
              <ArrowLeft size={20} />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="font-display text-4xl sm:text-5xl font-bold text-[var(--text-primary)] leading-none">
                  {t('gmJournal.title')}
                </h1>
                <GmBadge />
              </div>
              <p className="label-overline mt-4" style={{ color: 'var(--gm-accent)' }}>
                {t('gmJournal.overline')}
              </p>
            </div>
          </div>
        </motion.div>

        {/* `items-start` : sans lui, la carte « I wonder… » s'étirerait à la
            hauteur des notes et son cadre flotterait autour du vide. */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8 lg:items-start">
          {/* « I wonder… » */}
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="card-paper card-frame card-frame-arcana p-6 lg:col-span-2"
            style={{ backgroundColor: 'var(--gm-accent-soft)' }}
          >
            {/* Le titre EST la commande de repli — pas un second bouton posé à
                côté d'un `h2` inerte (motif accordéon de l'APG, déjà utilisé
                par ImprovementsSection). Le compte survit au repli : c'est
                tout l'intérêt — « il reste 3 questions ouvertes ». */}
            <h2 className={wondersOpen ? 'mb-1' : undefined}>
              <SectionToggle
                open={wondersOpen}
                onToggle={() => setWondersOpen(!wondersOpen)}
                label={t('gmJournal.wondersTitle')}
                count={open.length}
              />
            </h2>

            {wondersOpen && (
              <>
                <p className="text-xs text-[var(--text-muted)] font-body mb-4">
                  {t('gmJournal.wondersHint')}
                </p>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitDraft();
                  }}
                  className="flex flex-wrap gap-2 mb-5"
                >
                  <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={t('gmJournal.addPlaceholder')}
                    aria-label={t('gmJournal.addWonderLabel')}
                    className="field-paper flex-1 min-w-0 basis-40"
                  />
                  <button type="submit" className="btn-ink" disabled={!draft.trim()}>
                    <Plus size={16} />
                    {t('gmJournal.addLabel')}
                  </button>
                </form>

                {loaded && journal.wonders.length === 0 ? (
                  <p className="text-[var(--text-muted)] font-body text-sm">
                    {t('gmJournal.empty')}
                  </p>
                ) : (
                  <>
                    <ul className="space-y-2">
                      {open.map((w) => (
                        <WonderRow
                          key={w.id}
                          wonder={w}
                          onToggle={() => toggleWonder(w.id)}
                          onDelete={() => setToDelete(w)}
                          onResolution={(text) => setResolution(w.id, text)}
                        />
                      ))}
                    </ul>

                    {resolved.length > 0 && (
                      <>
                        <h3 className="mt-6 mb-2">
                          <SectionToggle
                            open={answeredOpen}
                            onToggle={() => setAnsweredOpen(!answeredOpen)}
                            label={t('gmJournal.resolvedHeading')}
                            count={resolved.length}
                          />
                        </h3>
                        {answeredOpen && (
                          <ul className="space-y-2">
                            {resolved.map((w) => (
                              <WonderRow
                                key={w.id}
                                wonder={w}
                                onToggle={() => toggleWonder(w.id)}
                                onDelete={() => setToDelete(w)}
                                onResolution={(text) => setResolution(w.id, text)}
                              />
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </motion.section>

          {/* Le sceau sépare deux blocs EMPILÉS ; entre deux colonnes il ne
              sépare plus rien. */}
          <div className="seal-divider my-4 text-xs lg:hidden" aria-hidden>
            ✦
          </div>

          {/* Notes MJ libres */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="lg:col-span-3"
          >
            <GmNotesCard
              value={journal.notes}
              onOpen={() => setEditingNotes(true)}
              mentionItems={mentionItems}
            />
          </motion.div>
        </div>
      </main>

      {/* Édition en plein cadre, comme une saison des Chroniques : la page
          reste une page de LECTURE (aucune instance ProseMirror montée tant
          qu'on n'a pas cliqué), et l'écriture se fait dans une surface dédiée.
          `updateNotes` reste débouncé dans `useGmJournal`, dont le timer
          survit à la fermeture — fermer n'annule donc pas la dernière frappe. */}
      <Modal
        open={editingNotes}
        onClose={() => setEditingNotes(false)}
        size="2xl"
        fillHeight
        labelledBy="gm-notes-modal-title"
        // Le prune est sémantique dans ce système : une surface d'écriture
        // MJ qui s'ouvre en papier neutre ne dit plus « seul toi vois ça ».
        panelClassName="card-frame card-frame-arcana bg-paper-gm"
      >
        {/* `shrink-0` : en colonne flex, l'en-tête céderait sa hauteur avant
            que l'éditeur ne consente à défiler. */}
        <div className="flex items-center gap-2 mb-1 flex-wrap pr-10 shrink-0">
          <h2 id="gm-notes-modal-title" className="label-overline">
            {t('gm.notesTitle')}
          </h2>
          <GmBadge />
        </div>
        <p className="text-xs text-[var(--text-muted)] font-body mb-4 shrink-0">
          {t('gm.notesHint')}
        </p>
        {/* `fill` fait de l'éditeur l'enfant flex extensible de la modale : il
            prend la hauteur qui reste et fait défiler sa prose. Pas de div
            intermédiaire — une de plus et il faudrait lui répéter
            `flex-1 min-h-0`, faute de quoi la chaîne se casse en silence. */}
        <RichText
          content={journal.notes}
          onChange={updateNotes}
          editable
          autofocus
          fill
          mentionItems={mentionItems}
        />
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(next) => !next && setToDelete(null)}
        title={t('gmJournal.deleteTitle')}
        description={t('gmJournal.deleteText')}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={() => {
          if (toDelete) deleteWonder(toDelete.id);
        }}
      />
      <Toast />
    </div>
  );
}

function WonderRow({
  wonder,
  onToggle,
  onDelete,
  onResolution,
}: {
  wonder: Wonder;
  onToggle: () => void;
  onDelete: () => void;
  onResolution: (text: string) => void;
}) {
  const t = useT();
  const [editingNote, setEditingNote] = useState(false);
  // Seeded fresh each time edit mode OPENS (not once at mount): WonderRow
  // stays mounted persistently in the list and just toggles this affordance,
  // so a mount-time-only seed would go stale the moment a realtime update
  // (the same GM editing from a second tab/phone) changes wonder.resolution
  // while this row sits closed — the next open would silently overwrite the
  // newer value with the stale copy.
  const [note, setNote] = useState('');
  const startEditing = () => {
    setNote(wonder.resolution ?? '');
    setEditingNote(true);
  };

  return (
    // Bande cliquable plutôt qu'une ligne de texte nue : le bouton de retrait
    // fait 30px de haut (cible tactile) pour une ligne de 20px. Sans ce
    // rembourrage, sa boîte débordait la rangée de 8px — et `:hover` remontant
    // aux ancêtres, le pointeur posé dans la marge VIDE de la carte gardait la
    // croix allumée. Invariant : une commande révélée au survol ne doit jamais
    // être plus grande que l'élément qui porte le survol (cf. e2e/gm-journal-hover).
    <li className="group flex flex-col gap-1 -mx-2 px-2 py-1.5 rounded-md">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={onToggle}
          title={t(wonder.resolved ? 'gmJournal.reopen' : 'gmJournal.resolve')}
          className="mt-1 shrink-0 text-[var(--gm-accent)] hover:opacity-70 transition-opacity"
        >
          {wonder.resolved ? <RotateCcw size={14} /> : <Feather size={14} />}
        </button>
        <span
          className={`flex-1 text-[15px] leading-snug ${
            wonder.resolved
              ? 'line-through text-[var(--text-muted)]'
              : 'text-[var(--text-primary)]'
          }`}
        >
          {wonder.text}
        </span>
        {/* Croix, comme partout ailleurs où l'on retire une ligne d'une liste
            (TagEditor, SimpleListEditor, RelationsList) : la corbeille est le
            registre des suppressions de FICHES, pas des lignes. Les marges
            négatives ne cancellent que ce que la bande de la rangée rend :
            la boîte du bouton reste inscrite dans le `li`. */}
        <button
          type="button"
          onClick={onDelete}
          title={t('common.delete')}
          aria-label={`${t('common.delete')} — ${wonder.text}`}
          className="shrink-0 p-2 -my-1.5 -mr-2 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 hover:text-[var(--danger)] transition-opacity"
        >
          <X size={14} />
        </button>
      </div>
      {wonder.resolved &&
        (editingNote ? (
          <form
            className="ml-6 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              onResolution(note);
              setEditingNote(false);
            }}
          >
            <input
              autoFocus
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => {
                onResolution(note);
                setEditingNote(false);
              }}
              placeholder={t('gmJournal.resolutionPlaceholder')}
              aria-label={t('gmJournal.addResolution')}
              className="field-paper flex-1 text-sm"
            />
          </form>
        ) : wonder.resolution ? (
          <button
            type="button"
            onClick={startEditing}
            className="ml-6 text-left text-sm text-[var(--text-muted)] font-body italic hover:underline"
          >
            {wonder.resolution}
          </button>
        ) : (
          <button
            type="button"
            onClick={startEditing}
            // [@media(hover:none)]:opacity-100 : seul point d'entrée du champ
            // résolution — invisible au tap, la fonctionnalité n'existait pas
            // sur téléphone (cf. RelationsList pour le motif d'origine).
            className="ml-6 py-1.5 text-left text-xs text-[var(--text-muted)] font-body opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 hover:underline transition-opacity"
          >
            {t('gmJournal.addResolution')}
          </button>
        ))}
    </li>
  );
}
