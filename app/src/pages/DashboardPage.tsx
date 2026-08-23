import { useState, useMemo, useEffect, useRef, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  GitGraph,
  ScrollText,
  Plus,
  Copy,
  MapPin,
  Map as MapIcon,
  Settings,
  Feather,
  Scale,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Header } from '@/components/layout/Header';
import { CharacterCard } from '@/components/character/CharacterCard';
import { CharacterForm } from '@/components/character/CharacterForm';
import { LocationsManagerModal } from '@/components/locations/LocationsManagerModal';
import { WhatsNewModal } from '@/components/modals/WhatsNewModal';
import { Toast } from '@/components/shared/Toast';
import { useAppStore } from '@/stores/appStore';
import { useCharacters } from '@/hooks/useCharacters';
import { useLocations } from '@/hooks/useLocations';
import { useCanEdit, useIsGm } from '@/hooks/useRole';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { FALLBACK_LOCATION_COLOR } from '@/lib/constants';
import { byName, compareNames } from '@/lib/sortByName';
import { matchCharacter, searchTerms, type MatchExplanation } from '@/lib/character/characterSearch';
import { DISCOVERY_KINDS, getDiscoveryKind, type DiscoveryKind } from '@/lib/character/discoveryKinds';
import { CHARACTER_TYPES, type Character, type CharacterType } from '@/types';
import { useT, type TKey } from '@/i18n';
import { LocationBanner } from '@/components/locations/LocationBanner';
import { StampIcon } from '@/components/shared/StampIcon';
import emptyAdventurer from '@/assets/stonetop/empty-adventurer.png';


// Annonce « Quoi de neuf » — affichée une seule fois par navigateur.
// Clé versionnée : la bumper ré-affiche le tour à ceux qui ont fermé l'ancien.
const WHATS_NEW_KEY = 'inkstone:whatsnew:maps-claude-v2';

/** Chip label per entity type. A lookup rather than a ternary chain: at five
 *  arms the chain no longer reads, and the exhaustive Record is what makes a
 *  sixth type a compile error instead of a chip labelled "Threats". */
const DASHBOARD_TYPE_LABELS: Record<CharacterType, TKey> = {
  PJ: 'dashboard.typePC',
  PNJ: 'dashboard.typeNPC',
  GROUPE: 'dashboard.typeGroup',
  MENACE: 'dashboard.typeThreat',
  DISCOVERY: 'dashboard.typeDiscovery',
};

export default function DashboardPage() {
  const t = useT();
  const navigate = useNavigate();
  const canEdit = useCanEdit();
  const isGm = useIsGm();
  // Selectors, not the bare store: a no-selector subscription re-renders the
  // whole page on ANY store write (a toast, a collection refetch elsewhere).
  const session = useAppStore((s) => s.session);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const filterType = useAppStore((s) => s.filterType);
  const setFilterType = useAppStore((s) => s.setFilterType);
  const filterLocationId = useAppStore((s) => s.filterLocationId);
  const setFilterLocationId = useAppStore((s) => s.setFilterLocationId);
  const showToast = useAppStore((s) => s.showToast);

  // Subtype sub-filter, local on purpose: it is meaningless unless the
  // Discoveries chip is active, and the store is persisted — a remembered
  // subtype would silently narrow tomorrow's grimoire with nothing on screen
  // to explain it. Reset whenever the type filter moves.
  const [filterKind, setFilterKind] = useState<DiscoveryKind | 'all'>('all');
  // Render-time correction, NOT a `useEffect` that calls setState: this repo
  // enables `react-hooks/set-state-in-effect`, so the effect form fails lint.
  // Same idiom as MapViewerPage.tsx:80-86 — hold the previous value, and when
  // it changes, correct during render. It is also more correct than an effect
  // here: an effect would let one frame paint the stale narrowing first.
  const [prevFilterType, setPrevFilterType] = useState(filterType);
  if (filterType !== prevFilterType) {
    setPrevFilterType(filterType);
    setFilterKind('all');
  }

  // The input is controlled locally and the store only sees the debounced
  // value: each store write used to fan out to every whole-store subscriber
  // on every keystroke, and the filter pipeline below re-ran with it.
  const [searchInput, setSearchInput] = useState(searchQuery);
  const debouncedSearch = useDebouncedValue(searchInput, 200);
  useEffect(() => {
    setSearchQuery(debouncedSearch);
  }, [debouncedSearch, setSearchQuery]);
  const searchRef = useRef<HTMLInputElement>(null);
  // La touche « / » n'est proposée qu'au repos : le champ vide et sans le
  // focus. Une fois dedans, la touche s'écrit — l'indice mentirait.
  const [searchFocused, setSearchFocused] = useState(false);
  const clearSearch = () => {
    setSearchInput('');
    searchRef.current?.focus();
  };
  const { characters, status, retry } = useCharacters(session?.space.id);
  const { locations } = useLocations(session?.space.id);

  const [showForm, setShowForm] = useState(false);
  const [showLocations, setShowLocations] = useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(() => {
    try {
      return !localStorage.getItem(WHATS_NEW_KEY);
    } catch {
      // stockage bloqué (mode privé) → considéré comme jamais vu
      return true;
    }
  });
  const dismissWhatsNew = () => {
    setShowWhatsNew(false);
    try {
      localStorage.setItem(WHATS_NEW_KEY, '1');
    } catch {
      // ignore
    }
  };


  useEffect(() => {
    if (!session) navigate('/');
  }, [session, navigate]);

  // « / » met le curseur dans la recherche, de n'importe où sur la page. Pas
  // de palette en surimpression (⌘K) : le grimoire est un livre, on tourne ses
  // pages, on n'ouvre pas une console par-dessus.
  //
  // Trois gardes, toutes nécessaires : la touche est un CARACTÈRE (donc on
  // sort dès qu'un champ a le focus, sinon taper « / » dans une note vole le
  // focus), un modificateur en fait un raccourci du navigateur (⌘/ ), et une
  // modale ouverte a son propre piège à focus — le lui prendre par-dessous
  // laisserait l'utilisateur à taper dans un champ qu'il ne voit pas.
  useEffect(() => {
    if (showForm || showLocations || showWhatsNew) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.isContentEditable ||
          el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.tagName === 'SELECT')
      ) {
        return;
      }
      e.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showForm, showLocations, showWhatsNew]);

  const terms = useMemo(() => searchTerms(searchQuery), [searchQuery]);

  // Ce que la grille montre : la fiche ET, quand la recherche a répondu sur de
  // la prose, de quoi le dire sur la carte (cf. CharacterCard.match).
  const filteredCharacters = useMemo<{ character: Character; match?: MatchExplanation }[]>(() => {
    let filtered = characters;

    if (filterType !== 'all') {
      filtered = filtered.filter((c) => c.type === filterType);
    }
    if (filterType === 'DISCOVERY' && filterKind !== 'all') {
      filtered = filtered.filter((c) => getDiscoveryKind(c.role) === filterKind);
    }
    if (filterLocationId !== 'all') {
      if (filterLocationId === 'no-location') {
        filtered = filtered.filter((c) => !c.location);
      } else {
        filtered = filtered.filter((c) => c.location === filterLocationId);
      }
    }

    if (terms.length === 0) {
      return [...filtered].sort(byName).map((character) => ({ character }));
    }

    // Map, not a per-character `locations.find` — that was O(chars × locs)
    // per recompute. Ce que la requête regarde vit dans lib/characterSearch
    // (prose comprise) ; ici on ne fait que fournir le nom du lieu résolu.
    const locNames = new Map(locations.map((l) => [l.id, l.name ?? '']));
    const hits: { character: Character; match?: MatchExplanation; rank: number }[] = [];
    for (const character of filtered) {
      const found = matchCharacter(
        character,
        (character.location ? locNames.get(character.location) : '') ?? '',
        terms
      );
      if (found) hits.push({ character, match: found.explain, rank: found.rank });
    }
    // Le rang d'abord : taper un nom doit le remonter au-dessus des fiches qui
    // ne le mentionnent que dans leurs notes. Alphabétique à rang égal — c'est
    // l'ordre que la grille garde le reste du temps.
    hits.sort((a, b) => a.rank - b.rank || compareNames(a.character.name, b.character.name));
    return hits;
  }, [characters, filterType, filterKind, filterLocationId, terms, locations]);

  const filtersActive =
    terms.length > 0 || filterType !== 'all' || filterLocationId !== 'all';

  const handleCopyCode = () => {
    if (session?.space.invite_code) {
      // HashRouter: the `?join=` query must live inside the hash fragment.
      const url = `${window.location.origin}${window.location.pathname}#/?join=${session.space.invite_code}`;
      navigator.clipboard.writeText(url);
      showToast(t('header.inviteCopied'));
    }
  };

  const sansLieuCount = useMemo(
    () => characters.filter((c) => !c.location).length,
    [characters]
  );


  if (!session) return null;

  return (
    <div className="min-h-screen">
      <Header />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        {/* Titre du grimoire */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="mb-10"
        >
          <div className="flex items-center gap-4 flex-wrap">
            <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-bold text-[var(--text-primary)] leading-none">
              {session.space.name}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-[var(--text-secondary)] font-body mt-5">
            <span>
              {t(characters.length === 1 ? 'dashboard.countOne' : 'dashboard.countOther', { n: characters.length })}
            </span>
            <span className="text-[var(--text-muted)]">·</span>
            <span>{t('dashboard.inviteCode')}</span>
            <button
              onClick={handleCopyCode}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[var(--bg-card)] border border-[var(--border-paper)] rounded text-xs font-mono hover:bg-[var(--bg-card-alt)] transition-colors"
            >
              {session.space.invite_code}
              <Copy size={12} />
            </button>
          </div>
        </motion.div>

        {/* Actions principales */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="flex flex-wrap gap-3 mb-8"
        >
          {canEdit && (
            <button onClick={() => setShowForm(true)} className="btn-ink">
              <Plus size={16} />
              {t('dashboard.addCharacter')}
            </button>
          )}
          <button onClick={() => navigate('/graph')} className="btn-outline">
            <GitGraph size={16} />
            {t('dashboard.graphView')}
          </button>
          <button onClick={() => navigate('/chronicles')} className="btn-outline">
            <ScrollText size={16} />
            {t('dashboard.chroniclesView')}
          </button>
          <button onClick={() => navigate('/maps')} className="btn-outline">
            <MapIcon size={16} />
            {t('maps.dashboardButton')}
          </button>
          <button onClick={() => navigate('/tone-and-content')} className="btn-outline">
            <Scale size={16} />
            {t('dashboard.toneAndContent')}
          </button>
          {isGm && (
            <button
              onClick={() => navigate('/gm')}
              className="btn-outline"
              style={{ color: 'var(--gm-accent)', borderColor: 'var(--gm-accent)' }}
            >
              <Feather size={16} />
              {t('gmJournal.dashboardButton')}
            </button>
          )}
        </motion.div>

        {/* Toolbar : recherche + filtres */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="space-y-4 mb-8"
        >
          {/* Ligne 1 : recherche + filtre type */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
              />
              {/* `type="search"` pour les indices de clavier mobile (la table
                  cherche au téléphone en pleine séance) ; la croix native de
                  WebKit est retirée dans index.css, la nôtre est en dessous et
                  parle la même encre. Correction/complétion coupées : un nom
                  de Stonetop n'est pas dans le dictionnaire du téléphone. */}
              <input
                ref={searchRef}
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                onKeyDown={(e) => {
                  if (e.key !== 'Escape') return;
                  // Échap vide le champ, puis (déjà vide) rend le focus à la
                  // page. Deux temps : vider est le geste attendu, mais rester
                  // piégé dans un champ vide n'en est pas un.
                  if (searchInput) {
                    e.preventDefault();
                    setSearchInput('');
                  } else {
                    e.currentTarget.blur();
                  }
                }}
                placeholder={t('dashboard.searchPlaceholder')}
                aria-label={t('dashboard.searchLabel')}
                enterKeyHint="search"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                className="field-paper pl-11 pr-10"
              />
              {searchInput ? (
                <button
                  type="button"
                  onClick={clearSearch}
                  aria-label={t('dashboard.searchClear')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-alt)] transition-colors"
                >
                  <X size={16} />
                </button>
              ) : (
                !searchFocused && (
                  <kbd
                    aria-hidden
                    title={t('dashboard.searchShortcutHint')}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded border border-[var(--border-field)] bg-[var(--bg-card-alt)] font-body text-[11px] leading-none text-[var(--text-muted)]"
                  >
                    /
                  </kbd>
                )
              )}
            </div>

            {/* `overflow-x-auto`, PAS `overflow-hidden` : à 360px les six
                boutons dépassent la largeur disponible, et l'ancien clip
                coupait « Threats » en deux — intouchable sur téléphone. Le
                padding réduit fait tenir les six jusqu'à ~360px ; en dessous,
                on défile au lieu d'amputer.

                `flex-1` (et non `shrink-0`) sur les onglets : dimensionnés par
                leur seul contenu, les six libellés de longueurs inégales
                laissaient un vide après « Threats » et un rythme irrégulier
                d'un onglet à l'autre. `flex: 1 1 0%` répartit la largeur en
                parts égales quand il y a de la place ; `min-width: auto` (par
                défaut sur un flex item) empêche de descendre sous le
                min-content, donc à l'étroit on retombe sur le défilement
                ci-dessus au lieu d'écraser le texte. */}
            <div className="flex rounded-lg overflow-x-auto border border-[var(--border-paper)] bg-[var(--bg-card)]">
              {(['all', ...CHARACTER_TYPES] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`flex-1 whitespace-nowrap px-3 sm:px-5 py-2.5 text-sm font-medium font-body capitalize transition-colors ${
                    filterType === type
                      ? 'bg-[var(--accent-primary)] text-[var(--text-inverse)]'
                      : 'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-card-alt)]'
                  }`}
                >
                  {type === 'all' ? t('dashboard.typeAll') : t(DASHBOARD_TYPE_LABELS[type])}
                </button>
              ))}
            </div>

          </div>

          {/* Ligne 2 : chips de location */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="label-overline mr-1 inline-flex items-center gap-1.5">
              <MapPin size={12} />
              {t('dashboard.locationsLabel')}
            </span>
            <LocationChip
              label={t('dashboard.allLocations')}
              active={filterLocationId === 'all'}
              onClick={() => setFilterLocationId('all')}
              color="var(--text-muted)"
            />
            {sansLieuCount > 0 && (
              <LocationChip
                label={t('dashboard.noLocation')}
                active={filterLocationId === 'no-location'}
                onClick={() => setFilterLocationId('no-location')}
                color={FALLBACK_LOCATION_COLOR}
              />
            )}


            {[...locations].sort(byName).map((loc) => (
              <LocationChip
                key={loc.id}
                label={loc.name}
                active={filterLocationId === loc.id}
                onClick={() => setFilterLocationId(loc.id)}
                color={loc.color}
              />
            ))}
            {canEdit && (
              <ActionChip
                label={t('dashboard.manageLocations')}
                title={t('dashboard.manageLocationsTitle')}
                icon={<Settings size={12} />}
                onClick={() => setShowLocations(true)}
              />
            )}
          </div>

          {/* Row 3: subtype chips — only while the Discoveries chip is active.
              Inactive, nothing about the page changes. This is what keeps the
              bench inside the grimoire instead of earning a route of its own. */}
          {filterType === 'DISCOVERY' && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="label-overline mr-1 inline-flex items-center gap-1.5">
                <Feather size={12} />
                {t('dashboard.kindsLabel')}
              </span>
              <LocationChip
                label={t('dashboard.allKinds')}
                active={filterKind === 'all'}
                onClick={() => setFilterKind('all')}
                color="var(--text-muted)"
              />
              {DISCOVERY_KINDS.map((k) => (
                <LocationChip
                  key={k.id}
                  label={t(k.labelKey as TKey)}
                  active={filterKind === k.id}
                  onClick={() => setFilterKind(k.id)}
                  color="var(--text-secondary)"
                />
              ))}
            </div>
          )}
        </motion.div>

        {/* Combien la grille en montre — la barre latérale du graphe le disait
            déjà (graph.visibleCount) et le grimoire, lui, ne disait rien avant
            d'être vide. Région live TOUJOURS montée et remplie ensuite, même
            motif que Toast et pour la même raison : une région insérée en même
            temps que son contenu est annoncée au hasard, et c'est justement à
            la première frappe qu'il faut l'entendre. Vide, elle est de hauteur
            nulle et se glisse dans la marge de la barre d'outils plutôt que
            d'en décaler le repos. */}
        <div role="status" aria-live="polite">
          {filtersActive && characters.length > 0 && (
            <p className="-mt-4 mb-6 text-xs font-body text-[var(--text-muted)]">
              {t('dashboard.resultCount', {
                visible: filteredCharacters.length,
                total: characters.length,
              })}
            </p>
          )}
        </div>

        {/* Bannière contextuelle du lieu (Stonetop quand filtre = tous) */}
        <LocationBanner spaceId={session.space.id} />

        {/* Grille de personnages. Store vide ≠ grimoire vide : tant que le
            premier fetch n'a pas abouti (refresh, lien partagé), on ne montre
            ni « grimoire vide » ni la grille — et un échec offre un retry. */}
        {characters.length === 0 && status === 'loading' ? (
          <div className="card-paper border-dashed p-16 text-center" aria-busy="true">
            <p className="text-[var(--text-muted)] font-body">{t('common.loading')}</p>
          </div>
        ) : characters.length === 0 && status === 'error' ? (
          <div className="card-paper border-dashed p-16 text-center">
            <p className="text-[var(--text-muted)] font-body mb-4">{t('common.loadError')}</p>
            <button type="button" onClick={retry} className="btn-outline text-sm">
              {t('common.retry')}
            </button>
          </div>
        ) : filteredCharacters.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* Hauteurs ALIGNÉES (l'étirement par défaut de la grille). J'avais
                mis items-start pour supprimer le vide sous les cartes courtes :
                le résultat lisait comme une grille en désordre. Une rangée qui
                s'aligne est plus calme, et c'est ce qui rend utile le `mt-auto`
                du lieu au pied de la carte — une ligne à la même ordonnée sur
                toute la rangée, où l'œil se pose en balayant. Le vide résiduel
                est le prix de ce calme, et il est bien moindre qu'avant puisque
                la carte ne fait plus que 2 à 4 lignes de corps. */}
            {filteredCharacters.map(({ character, match }) => (
              <CharacterCard key={character.id} character={character} match={match} />
            ))}
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={canEdit ? () => setShowForm(true) : undefined}
            className={`card-paper border-dashed p-16 text-center transition-colors ${
              canEdit ? 'cursor-pointer hover:bg-[var(--bg-card-alt)]' : ''
            }`}
          >
            {/* Petit aventurier du livre (Jason Lutes, CC BY 4.0). */}
            <StampIcon
              src={emptyAdventurer}
              size={56}
              className="mx-auto mb-4"
              style={{ color: 'var(--text-muted)', opacity: 0.5 }}
            />
            <p className="text-[var(--text-muted)] font-body">
              {filtersActive ? t('dashboard.emptySearch') : t('dashboard.emptyAll')}
            </p>

          </motion.div>
        )}

      </main>

      <AnimatePresence>
        {showForm && <CharacterForm onClose={() => setShowForm(false)} />}
        {showLocations && session && (
          <LocationsManagerModal
            spaceId={session.space.id}
            onClose={() => setShowLocations(false)}
          />
        )}
      </AnimatePresence>

      <WhatsNewModal isOpen={showWhatsNew} onClose={dismissWhatsNew} />


      <Toast />
    </div>
  );
}

function LocationChip({
  label,
  active,
  onClick,
  color,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium font-body border transition-colors ${
        active
          ? 'bg-[var(--accent-primary)] text-[var(--text-inverse)] border-[var(--accent-primary)]'
          : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-paper)] hover:bg-[var(--bg-card-alt)]'
      }`}
    >
      <span
        aria-hidden
        className="w-2 h-2 rounded-full"
        style={{ backgroundColor: active ? 'var(--text-inverse)' : color }}
      />
      {label}
    </button>
  );
}

/**
 * A chip that DOES something rather than filtering. Dashed border and no
 * colour dot, so it never reads as a seventh location, and it has no `active`
 * state to take — same dotted add-affordance the steading's SimpleListEditor
 * uses.
 */
function ActionChip({
  label,
  icon,
  onClick,
  title,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium font-body border border-dashed border-[var(--border-field)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-alt)] transition-colors"
    >
      {icon}
      {label}
    </button>
  );
}
