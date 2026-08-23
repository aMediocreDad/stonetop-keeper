import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Header } from '@/components/layout/Header';
import { SigmaGraph } from '@/components/graph/SigmaGraph';
import { DEFAULT_FORCE_SETTINGS, type ForceSettings } from '@/components/graph/forceSettings';
import { GraphFiltersSidebar } from '@/components/graph/GraphFiltersSidebar';
import { GraphNodePanel } from '@/components/graph/GraphNodePanel';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { useAppStore } from '@/stores/appStore';
import { useCharacters } from '@/hooks/useCharacters';
import { useRelations } from '@/hooks/useRelations';
import { useLocations } from '@/hooks/useLocations';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import { RELATION_TYPES } from '@/lib/constants';
import { useT } from '@/i18n';



export default function GraphViewPage() {
  const t = useT();
  const navigate = useNavigate();
  const session = useAppStore((s) => s.session);

  const { characters } = useCharacters(session?.space.id);
  const { relations } = useRelations(session?.space.id);
  const { locations } = useLocations(session?.space.id);

  useEffect(() => {
    if (!session) navigate('/');
  }, [session, navigate]);

  
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : true
  );
  const [sidebarOpen, setSidebarOpen] = useState(isDesktop);
  // Le tiroir mobile est un vrai dialogue : scrim + contenu au-dessus de la
  // page. Sans piège de focus ni Échap, Tab se promenait derrière le scrim.
  const drawerRef = useRef<HTMLElement>(null);
  useDialogFocus(!isDesktop && sidebarOpen, () => setSidebarOpen(false), drawerRef);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const handler = (e: MediaQueryListEvent) => {
      setIsDesktop(e.matches);
      if (!e.matches) setSidebarOpen(false);
      else setSidebarOpen(true);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  
  const [search, setSearch] = useState('');
  // Le champ reste réactif (`search`), mais le filtrage du graphe consomme la
  // valeur débouncée : sans ça, chaque frappe recalcule `visibleCharacterIds`
  // (nouveau Set) et le gros useEffect de SigmaGraph détruit puis reconstruit
  // tout le rendu WebGL + relance la simulation. On ne reconstruit qu'une fois
  // la frappe finie.
  const debouncedSearch = useDebouncedValue(search, 250);
  const [showPJ, setShowPJ] = useState(true);
  const [showPNJ, setShowPNJ] = useState(true);
  const [showGroups, setShowGroups] = useState(true);
  const [showThreats, setShowThreats] = useState(true);
  // OFF by default, unlike every other type. A campaign with sixty
  // discoveries would turn the relationship web into a hairball, and the
  // answer is the sidebar that already exists rather than a second view. If
  // it proves messy at the table, a dedicated view is a later and separable
  // change.
  const [showDiscoveries, setShowDiscoveries] = useState(false);
  const [showSansLieu, setShowSansLieu] = useState(true);
  // `null` = tous les lieux visibles (état initial). Évite le flash où les
  // personnages localisés disparaissent tant que les lieux ne sont pas
  // arrivés du réseau, et garde les nouveaux lieux visibles par défaut.
  const [visibleLocationIds, setVisibleLocationIds] = useState<Set<string> | null>(null);
  const [visibleRelationTypeIds, setVisibleRelationTypeIds] = useState<Set<string>>(
    () => new Set(RELATION_TYPES.map((r) => r.id))
  );

  // Set concret pour l'affichage (checkboxes de la sidebar) et le filtrage.
  const effectiveLocationIds = useMemo(
    () => visibleLocationIds ?? new Set(locations.map((l) => l.id)),
    [visibleLocationIds, locations]
  );

  const [forces, setForces] = useState<ForceSettings>(DEFAULT_FORCE_SETTINGS);
  const [reseedToken, setReseedToken] = useState(0);

  // Nœud sélectionné au tap (mobile) → ouvre le panneau des liens.
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  
  const visibleCharacterIds = useMemo(() => {
    const q = debouncedSearch.toLowerCase().trim();
    return new Set(
      characters
        .filter((c) => {
          if (c.type === 'PJ' && !showPJ) return false;
          if (c.type === 'PNJ' && !showPNJ) return false;
          if (c.type === 'GROUPE' && !showGroups) return false;
          if (c.type === 'MENACE' && !showThreats) return false;
          if (c.type === 'DISCOVERY' && !showDiscoveries) return false;
          if (c.location) {
            if (visibleLocationIds && !visibleLocationIds.has(c.location)) return false;
          } else {
            if (!showSansLieu) return false;
          }
          if (q) {
            const matches =
              c.name.toLowerCase().includes(q) ||
              c.role?.toLowerCase().includes(q) ||
              c.tags?.some((t) => t.toLowerCase().includes(q));
            if (!matches) return false;
          }
          return true;
        })
        .map((c) => c.id)
    );
  }, [characters, showPJ, showPNJ, showGroups, showThreats, showDiscoveries, visibleLocationIds, showSansLieu, debouncedSearch]);

  const visibleRelCount = useMemo(
    () =>
      relations.filter(
        (r) =>
          visibleCharacterIds.has(r.from_character_id) &&
          visibleCharacterIds.has(r.to_character_id) &&
          visibleRelationTypeIds.has(r.relation_type)
      ).length,
    [relations, visibleCharacterIds, visibleRelationTypeIds]
  );

  // --- Handlers ---------------------------------------------------
  const toggleLocation = (id: string) => {
    setVisibleLocationIds((prev) => {
      const next = new Set(prev ?? locations.map((l) => l.id));
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleRelationType = (id: string) => {
    setVisibleRelationTypeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Personnage sélectionné (pour le panneau mobile). Dérivé plutôt que
  // synchronisé : la sélection est ignorée tant que le nœud n'est pas visible
  // (filtre) ou qu'on est en desktop.
  const selectedCharacter = useMemo(() => {
    if (!selectedNodeId || isDesktop || !visibleCharacterIds.has(selectedNodeId)) {
      return null;
    }
    return characters.find((c) => c.id === selectedNodeId) ?? null;
  }, [selectedNodeId, characters, isDesktop, visibleCharacterIds]);

  if (!session) return null;


  const sidebarContent = (
    <GraphFiltersSidebar
      search={search}
      onSearchChange={setSearch}
      locations={locations}
      visibleLocationIds={effectiveLocationIds}
      showSansLieu={showSansLieu}
      onToggleLocation={toggleLocation}
      onToggleSansLieu={() => setShowSansLieu((v) => !v)}
      onSelectAllLocations={() => setVisibleLocationIds(null)}
      onClearLocations={() => setVisibleLocationIds(new Set())}
      showPJ={showPJ}
      showPNJ={showPNJ}
      onTogglePJ={() => setShowPJ((v) => !v)}
      onTogglePNJ={() => setShowPNJ((v) => !v)}
      showGroups={showGroups}
      onToggleGroups={() => setShowGroups((v) => !v)}
      showThreats={showThreats}
      onToggleThreats={() => setShowThreats((v) => !v)}
      showDiscoveries={showDiscoveries}
      onToggleDiscoveries={() => setShowDiscoveries((v) => !v)}
      visibleRelationTypeIds={visibleRelationTypeIds}
      onToggleRelationType={toggleRelationType}
      forces={forces}
      onForcesChange={setForces}
      onReseed={() => setReseedToken((t) => t + 1)}
      visibleCharCount={visibleCharacterIds.size}
      totalCharCount={characters.length}
      visibleRelCount={visibleRelCount}
    />
  );

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 w-full max-w-[1600px] mx-auto px-3 sm:px-6 pt-4 sm:pt-6 pb-4 sm:pb-6 flex flex-col">
        {/* Titre */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-3 sm:mb-4 flex items-center gap-3"
        >
          <button
            onClick={() => navigate('/dashboard')}
            className="p-2 -ml-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors flex-shrink-0"
            title={t('character.backToGrimoire')}
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <p className="label-overline">{t('graph.overline')}</p>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[var(--text-primary)] leading-none truncate">
              {t('graph.title')}
            </h1>

          </div>
        </motion.div>

        {/* Layout sidebar + canvas */}
        <div className="flex-1 flex gap-0 md:gap-4 min-h-[calc(100dvh-180px)] relative">
          {/* Sidebar desktop : inline, animée en width */}
          <motion.aside
            initial={false}
            animate={{
              width: isDesktop && sidebarOpen ? 288 : 0,
              opacity: isDesktop && sidebarOpen ? 1 : 0,
              marginRight: isDesktop && sidebarOpen ? 0 : -16,
            }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="hidden md:block overflow-hidden flex-shrink-0"
            aria-hidden={!isDesktop || !sidebarOpen}
            // `inert` retire aussi les champs/boutons du parcours clavier quand
            // le panneau est replié (width:0) — `aria-hidden` seul les laissait
            // tabbables (violation aria-hidden-focus).
            inert={!isDesktop || !sidebarOpen}
          >
            <div className="w-72 h-full">{sidebarContent}</div>
          </motion.aside>

          {/* Canvas */}
          {/* min(500px, 78dvh) : le plancher fixe dépassait un viewport
              paysage de téléphone (~390px de haut) — la toile devenait plus
              haute que l'écran entier, avec touch-action:none qui avale le
              défilement par-dessus le marché. */}
          <div className="flex-1 card-paper overflow-hidden relative min-h-[min(500px,78dvh)]">
            {/* Bouton toggle sidebar : flottant top-left */}
            <button
              type="button"
              onClick={() => setSidebarOpen((v) => !v)}
              className="absolute top-3 left-3 z-10 inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-[var(--bg-card)] border border-[var(--border-paper)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-alt)] transition-colors shadow-sm text-xs font-body"
              aria-label={sidebarOpen ? t('graph.closePanel') : t('graph.openPanel')}
              title={sidebarOpen ? t('graph.closePanel') : t('graph.openPanel')}

            >
              {sidebarOpen ? (
                <PanelLeftClose size={16} />
              ) : (
                <PanelLeftOpen size={16} />
              )}
              <span className="hidden sm:inline">
                {t('graph.filters')}
              </span>

            </button>

            {/* Compteur flottant top-right */}
            <div className="absolute top-3 right-3 z-10 px-2.5 py-1.5 rounded-md bg-[var(--bg-card)]/80 backdrop-blur border border-[var(--border-paper)] text-xs font-body text-[var(--text-muted)] pointer-events-none">
              <span className="text-[var(--text-secondary)] font-medium">
                {visibleCharacterIds.size}
              </span>
              <span> / {characters.length}</span>
              <span className="hidden sm:inline">
                {' '}· {t('graph.summaryRels', { n: visibleRelCount })}
              </span>

            </div>

            <ErrorBoundary
              fallbackTitle={t('graph.error')}
              fallbackMessage={t('errors.boundaryDefault')}
              resetLabel={t('common.retry')}
              onReset={() => setReseedToken((t) => t + 1)}
            >
              <SigmaGraph
                characters={characters}
                relations={relations}
                locations={locations}
                visibleCharacterIds={visibleCharacterIds}
                visibleRelationTypes={visibleRelationTypeIds}
                forces={forces}
                reseedToken={reseedToken}
                selectedNodeId={isDesktop ? undefined : selectedCharacter?.id ?? null}
                onSelectNode={isDesktop ? undefined : setSelectedNodeId}
              />
            </ErrorBoundary>

            {/* Panneau des liens au tap d'un nœud — mobile uniquement */}
            <AnimatePresence>
              {!isDesktop && selectedCharacter && (
                <GraphNodePanel
                  key={selectedCharacter.id}
                  character={selectedCharacter}
                  characters={characters}
                  relations={relations}
                  locations={locations}
                  visibleCharacterIds={visibleCharacterIds}
                  visibleRelationTypeIds={visibleRelationTypeIds}
                  onClose={() => setSelectedNodeId(null)}
                  onOpenCharacter={(id) => navigate(`/character/${id}`)}
                />
              )}
            </AnimatePresence>
          </div>

          {/* Drawer mobile (overlay) */}
          <AnimatePresence>
            {!isDesktop && sidebarOpen && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="md:hidden fixed inset-0 z-40"
                  style={{ backgroundColor: 'var(--scrim)' }}
                  onClick={() => setSidebarOpen(false)}
                />
                <motion.aside
                  ref={drawerRef}
                  initial={{ x: '-100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '-100%' }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className="md:hidden fixed top-0 left-0 bottom-0 z-50 w-[85vw] max-w-[320px] bg-[var(--bg-card)] shadow-[0_18px_40px_-22px_rgba(28,22,14,0.45)]"
                  role="dialog"
                  aria-modal="true"
                  aria-label={t('graph.openPanel')}
                  tabIndex={-1}
                >
                  <div className="h-full overflow-hidden">{sidebarContent}</div>
                </motion.aside>
              </>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
