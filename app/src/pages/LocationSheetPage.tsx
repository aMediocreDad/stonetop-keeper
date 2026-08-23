import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Mountain, Pencil, X } from 'lucide-react';
import { StampIcon } from '@/components/shared/StampIcon';
import steadingCover from '@/assets/stonetop/steading-cover.png';
import emptyAdventurer from '@/assets/stonetop/empty-adventurer.png';
import { motion } from 'framer-motion';
import { Header } from '@/components/layout/Header';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { CharacterCard } from '@/components/character/CharacterCard';
import { RichText } from '@/components/shared/RichText';
import { SteadingQuickStats } from '@/components/steading/SteadingQuickStats';
import { ChronicleBacklinks } from '@/components/timeline/ChronicleBacklinks';
import {
  buildMentionItems,
  locationMentionId,
  type MentionItem,
} from '@/components/editor/mentionItems';
import { SimpleListEditor } from '@/components/steading/SimpleListEditor';
import { ImprovementsSection } from '@/components/steading/ImprovementsSection';
import { Toast } from '@/components/shared/Toast';
import { useAppStore } from '@/stores/appStore';
import { useCharacters } from '@/hooks/useCharacters';
import { useLocations } from '@/hooks/useLocations';
import { useSteading } from '@/hooks/useSteading';
import { useTimeline } from '@/hooks/useTimeline';
import { useCanEdit, useIsGm } from '@/hooks/useRole';
import { byName } from '@/lib/sortByName';
import { useT } from '@/i18n';
import { GmBadge } from '@/components/shared/GmBadge';
import { GmNotesCard } from '@/components/shared/GmNotesCard';
import { MapsOfPlace } from '@/components/maps/MapsOfPlace';
import { PinnedOnMaps } from '@/components/maps/PinnedOnMaps';
import { TreasuryEditor } from '@/components/steading/TreasuryEditor';
import type { Location, Season, SteadingSize } from '@/types';
import { changedKeys } from '@/lib/patch';

export default function LocationSheetPage() {
  const t = useT();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const canEdit = useCanEdit();
  const isGm = useIsGm();
  const session = useAppStore((s) => s.session);
  const showToast = useAppStore((s) => s.showToast);
  const spaceId = session?.space.id;
  const { characters } = useCharacters(spaceId);
  const { locations, status, retry, updateLocation } = useLocations(spaceId);
  const { mutateSteading, promoteLocation } = useSteading(spaceId);
  const { timeline } = useTimeline(spaceId);

  const location = locations.find((l) => l.id === id);
  // The row the draft was seeded from (set in startEdit), so the save writes
  // only what changed. Not the live `location`: a realtime ping mid-edit
  // replaces it, and diffing against a newer value would overwrite whoever
  // wrote it.
  const editBaselineRef = useRef<Location | null>(null);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    name: '',
    description: '',
    notes: '',
    tags: '',
    gmOnly: false,
    gmNotes: '',
  });
  const [confirmingPromote, setConfirmingPromote] = useState(false);

  // Les hooks doivent être appelés inconditionnellement avant tout return anticipé.
  const residents = useMemo(
    () => characters.filter((c) => c.location === id).sort(byName),
    [characters, id],
  );

  // Cibles des mentions @ dans les notes (personnages puis lieux).
  const mentionItems = useMemo<MentionItem[]>(
    () => buildMentionItems(characters, locations),
    [characters, locations],
  );

  // Libellés des saisons — réutilise les clés déjà définies dans chronicles.
  const seasonLabel: Record<Season, string> = {
    spring: t('chronicles.spring'),
    summer: t('chronicles.summer'),
    autumn: t('chronicles.autumn'),
    winter: t('chronicles.winter'),
  };

  const seasonMarker =
    timeline.current_season && timeline.current_year != null
      ? `${seasonLabel[timeline.current_season]} · ${t('steading.yearLabel')} ${timeline.current_year}`
      : null;

  // Redirection si pas de session — pattern du codebase (ChroniclesPage.tsx).
  useEffect(() => {
    if (!session) navigate('/');
  }, [session, navigate]);

  if (!session) return null;

  if (!location) {
    // Tant que le premier fetch n'a pas abouti, un lien profond ou un refresh
    // arrive ici avec un store vide : afficher notFound serait un mensonge.
    return (
      <div className="min-h-screen">
        <Header />
        <main
          className="max-w-4xl mx-auto px-4 sm:px-6 py-16 text-center font-body text-[var(--text-muted)]"
          aria-busy={status === 'loading'}
        >
          {status === 'loading' ? (
            t('common.loading')
          ) : status === 'error' ? (
            <span className="flex flex-col items-center gap-4">
              {t('common.loadError')}
              <button type="button" onClick={retry} className="btn-outline text-sm">
                {t('common.retry')}
              </button>
            </span>
          ) : (
            t('location.notFound')
          )}
        </main>
      </div>
    );
  }

  const startEdit = () => {
    setDraft({
      name: location.name,
      description: location.description ?? '',
      notes: location.notes ?? '',
      tags: (location.tags ?? []).join(', '),
      gmOnly: location.gm_only,
      gmNotes: location.gm_notes ?? '',
    });
    editBaselineRef.current = location;
    setEditing(true);
  };

  const saveEdit = async () => {
    try {
      const payload: Partial<Location> = {
        name: draft.name.trim() || location.name,
        description: draft.description.trim(),
        notes: draft.notes,
        tags: draft.tags.split(',').map((s) => s.trim()).filter(Boolean),
        // Le serveur rejette gm_only/gm_notes venant d'un non-MJ dès que la
        // clé est présente : on ne les envoie donc que pour le MJ.
        ...(isGm && { gm_only: draft.gmOnly, gm_notes: draft.gmNotes }),
      };
      // Seules les colonnes modifiées : le RPC écrit une colonne dès que sa
      // clé est présente, donc envoyer les autres écrase l'édition d'un tiers.
      const patch = changedKeys(editBaselineRef.current, payload);
      if (Object.keys(patch).length > 0) await updateLocation(location.id, patch);
      setEditing(false);
    } catch (err) {
      console.error('[Location] save failed:', err);
      showToast(t('steading.saveError'));
    }
  };

  const steading = location.steading;

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* En-tête */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => navigate('/dashboard')}
              className="p-2 -ml-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              title={t('location.backToGrimoire')}
            >
              <ArrowLeft size={20} />
            </button>
            <span aria-hidden className="w-3 h-3 rounded-full" style={{ backgroundColor: location.color }} />
            <div className="min-w-0 flex-1">
              <p className="label-overline">{t('location.sheetOverline')}</p>
              {editing ? (
                <input
                  className="field-paper font-display text-2xl font-bold"
                  aria-label={t('characterForm.nameLabel')}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Rond de couverture du livret de bourgade (Jason Lutes, CC BY 4.0). */}
                  {location.steading && <StampIcon src={steadingCover} size={36} />}
                  <h1 className="font-display text-3xl sm:text-4xl font-bold text-[var(--text-primary)] leading-tight">
                    {location.name}
                  </h1>
                  {location.gm_only && <GmBadge />}
                </div>
              )}
            </div>
            {/* Cartes liées à ce lieu — boutons nus à côté d'Éditer, masqués si vide. */}
            <MapsOfPlace locationId={location.id} />
            {/* Cartes où ce lieu est épinglé (position en mots), même rangée. */}
            <PinnedOnMaps locationId={location.id} />
            {editing ? (
              <div className="flex gap-2">
                <button onClick={saveEdit} className="btn-ink text-sm"><Check size={14} />{t('common.save')}</button>
                <button onClick={() => setEditing(false)} className="btn-outline text-sm"><X size={14} />{t('common.cancel')}</button>
              </div>
            ) : (
              canEdit && (
                <button onClick={startEdit} className="btn-outline text-sm"><Pencil size={14} />{t('common.edit')}</button>
              )
            )}
          </div>

          {/* Description + tags */}
          {editing ? (
            <div className="mt-3 space-y-2">
              <input
                className="field-paper text-sm"
                placeholder={t('location.descriptionPlaceholder')}
                aria-label={t('location.descriptionLabel')}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
              <input
                className="field-paper text-sm"
                placeholder={t('location.tagPlaceholder')}
                aria-label={t('location.tags')}
                value={draft.tags}
                onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
              />
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              {location.description && (
                <p className="text-sm font-reading italic text-[var(--text-secondary)]">{location.description}</p>
              )}
              {(location.tags ?? []).map((tag) => (
                <span key={tag} className="px-2 py-0.5 rounded-full text-xs font-body bg-[var(--tag-bg)] text-[var(--tag-text)]">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* GM only : hors édition, le badge à côté du titre suffit. */}
          {isGm && editing && (
            <label
              className="inline-flex items-center gap-2 mt-3 cursor-pointer select-none"
              title={t('gm.onlyHint')}
            >
              <button
                type="button"
                onClick={() => setDraft((d) => ({ ...d, gmOnly: !d.gmOnly }))}
                aria-pressed={draft.gmOnly}
                className={`w-4 h-4 rounded-sm border flex items-center justify-center flex-shrink-0 transition-colors cursor-pointer ${
                  draft.gmOnly
                    ? 'bg-[var(--gm-accent)] border-[var(--gm-accent)]'
                    : 'border-[var(--border-paper)]'
                }`}
              >
                {draft.gmOnly && <Check size={10} className="text-[var(--text-inverse)]" strokeWidth={3} />}
              </button>
              <span className="font-semibold text-sm text-[var(--text-primary)]">
                {t('gm.onlyLabel')}
              </span>
            </label>
          )}

        </motion.div>

        {/* Fiche bourgade (stats toujours actives, pas de mode édition) */}
        {steading && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 mb-8">
            <div className="flex items-center gap-3 flex-wrap">
              <label className="inline-flex items-center gap-2 text-sm font-body text-[var(--text-secondary)]">
                <span className="label-overline">{t('steading.size')}</span>
                <select
                  value={steading.size}
                  disabled={!canEdit}
                  onChange={(e) =>
                    mutateSteading(location.id, (s) => ({ ...s, size: e.target.value as SteadingSize }))
                  }
                  className="field-paper text-sm h-8 pl-2.5 w-auto disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <option value="hamlet">{t('steading.sizeHamlet')}</option>
                  <option value="village">{t('steading.sizeVillage')}</option>
                  <option value="town">{t('steading.sizeTown')}</option>
                  <option value="city">{t('steading.sizeCity')}</option>
                </select>
              </label>
              {seasonMarker && (
                <span className="font-body text-xs uppercase tracking-[0.15em] text-[var(--text-muted)] ml-auto">
                  {seasonMarker}
                </span>
              )}
            </div>
            <SteadingQuickStats
              steading={steading}
              onMutate={(producer) => mutateSteading(location.id, producer)}
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <SimpleListEditor
                title={t('steading.resources')}
                hint={t('steading.resourcesHint')}
                items={steading.resources}
                onChange={(items) => mutateSteading(location.id, (s) => ({ ...s, resources: items }))}
              />
              <SimpleListEditor
                title={t('steading.fortifications')}
                hint={t('steading.fortificationsHint')}
                items={steading.fortifications}
                onChange={(items) => mutateSteading(location.id, (s) => ({ ...s, fortifications: items }))}
              />
              <SimpleListEditor
                title={t('steading.assets')}
                items={steading.assets}
                onChange={(items) => mutateSteading(location.id, (s) => ({ ...s, assets: items }))}
              >
                {/* Le trésor est un avoir parmi d'autres : il vit au pied des Ressources. */}
                <TreasuryEditor
                  value={steading.treasury}
                  onChange={(tr) => mutateSteading(location.id, (s) => ({ ...s, treasury: tr }))}
                />
              </SimpleListEditor>
            </div>
            <ImprovementsSection
              steading={steading}
              onMutate={(producer) => mutateSteading(location.id, producer)}
            />
            <p className="text-xs font-body text-[var(--text-muted)]">
              {t('steading.attribution')}{' '}
              <a
                href="https://creativecommons.org/licenses/by-sa/4.0/"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-[var(--text-secondary)]"
              >
                CC BY-SA 4.0
              </a>
              .
            </p>
          </motion.div>
        )}

        {/* Notes */}
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h3 className="font-display text-xl font-semibold text-[var(--text-primary)] mb-2">
            {t('location.notes')}
          </h3>
          <div className="card-paper p-4">
            <RichText
              content={editing ? draft.notes : location.notes ?? ''}
              onChange={(html) => editing && setDraft((d) => ({ ...d, notes: html }))}
              editable={canEdit && editing}
              mentionItems={mentionItems}
            />
            {/* Rétroliens : saisons de la chronique citant ce lieu — réutilise
                la frise déjà chargée par la page (marqueur de saison). */}
            <ChronicleBacklinks
              spaceId={spaceId}
              mentionId={locationMentionId(location.id)}
              timeline={timeline}
            />
          </div>
        </motion.section>

        {/* Notes MJ — la carte se masque elle-même si non-MJ. */}
        {isGm && (
          <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <GmNotesCard
              value={editing ? draft.gmNotes : location.gm_notes ?? ''}
              onChange={(html) => editing && setDraft((d) => ({ ...d, gmNotes: html }))}
              editable={canEdit && editing}
              mentionItems={mentionItems}
            />
          </motion.section>
        )}

        {/* Résidents */}
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
          <h3 className="font-display text-xl font-semibold text-[var(--text-primary)] mb-3">
            {t('location.residents')}{' '}
            <span className="text-sm font-body font-normal text-[var(--text-muted)]">
              {t(residents.length === 1 ? 'location.residentCountOne' : 'location.residentCountOther', { n: residents.length })}
            </span>
          </h3>
          {residents.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {/* showPlace={false} : tous ces personnages sont dans CE lieu par
                  définition — le coin de chaque carte répéterait le même mot. */}
              {residents.map((c) => (
                <CharacterCard key={c.id} character={c} showPlace={false} />
              ))}
            </div>
          ) : (
            <div className="card-paper border-dashed p-8 text-center">
              {/* Petit aventurier du livre (Jason Lutes, CC BY 4.0). */}
              <StampIcon
                src={emptyAdventurer}
                size={48}
                className="mx-auto mb-3"
                style={{ color: 'var(--text-muted)', opacity: 0.5 }}
              />
              <p className="text-sm font-body text-[var(--text-muted)]">
                {t('location.noResidents')}
              </p>
            </div>
          )}
        </motion.section>

        {/* Promotion en bourgade (lieux simples uniquement) */}
        {!steading && canEdit && (
          <>
            <button
              onClick={() => setConfirmingPromote(true)}
              className="inline-flex items-center gap-1.5 text-xs font-body text-[var(--text-muted)] hover:text-[var(--text-primary)] underline underline-offset-2 transition-colors"
            >
              <Mountain size={12} />
              {t('location.promote')}
            </button>
            <ConfirmDialog
              open={confirmingPromote}
              onOpenChange={setConfirmingPromote}
              title={location.name}
              description={t('location.promoteConfirm')}
              confirmLabel={t('location.promote')}
              onConfirm={() => {
                setConfirmingPromote(false);
                promoteLocation(location.id);
              }}
            />
          </>
        )}
      </main>
      <Toast />
    </div>
  );
}
