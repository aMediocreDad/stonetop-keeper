import { Suspense, lazy, useEffect, useRef, type ReactNode } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { LanguageProvider, useT } from './i18n';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { OfflineNotice } from './components/shared/OfflineNotice';

// Pages chargées à la demande : le graphe (Sigma) et l'éditeur (Tiptap) ne
// pèsent plus sur le premier rendu — leurs chunks arrivent à la navigation.
const HomePage = lazy(() => import('./pages/HomePage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const CharacterSheetPage = lazy(() => import('./pages/CharacterSheetPage'));
const GraphViewPage = lazy(() => import('./pages/GraphViewPage'));
const ChroniclesPage = lazy(() => import('./pages/ChroniclesPage'));
const LocationSheetPage = lazy(() => import('./pages/LocationSheetPage'));
const MapsPage = lazy(() => import('./pages/MapsPage'));
const MapViewerPage = lazy(() => import('./pages/MapViewerPage'));
const LedgerPage = lazy(() => import('./pages/LedgerPage'));
const GmJournalPage = lazy(() => import('./pages/GmJournalPage'));
const ToneAndContentPage = lazy(() => import('./pages/ToneAndContentPage'));

/**
 * Garde-fou racine : un crash de rendu dans n'importe quelle page affichait
 * une page blanche (seul le graphe avait sa boundary). Wrapper fonctionnel
 * pour brancher les chaînes i18n sur la classe ErrorBoundary.
 */
function RootBoundary({ children }: { children: ReactNode }) {
  const t = useT();
  return (
    <ErrorBoundary
      className="min-h-screen"
      fallbackTitle={t('errors.boundaryTitle')}
      fallbackMessage={t('errors.boundaryDefault')}
      resetLabel={t('common.retry')}
    >
      {children}
    </ErrorBoundary>
  );
}

/**
 * Lien d'évitement. HashRouter s'approprie les ancres natives (#main-content
 * serait lu comme une route), donc le saut est programmatique : on focalise
 * le conteneur des pages directement.
 */
function SkipLink() {
  const t = useT();
  return (
    <a
      href="#main-content"
      className="skip-link font-body"
      onClick={(e) => {
        e.preventDefault();
        document.getElementById('main-content')?.focus();
      }}
    >
      {t('a11y.skipToContent')}
    </a>
  );
}

const PAGE_TITLES = [
  [/^\/dashboard/, 'dashboard'],
  [/^\/character\//, 'character'],
  [/^\/location\//, 'location'],
  [/^\/graph/, 'graph'],
  [/^\/chronicles/, 'chronicles'],
  [/^\/maps/, 'maps'],
  [/^\/map\//, 'map'],
  [/^\/ledger/, 'ledger'],
  [/^\/gm/, 'gm'],
  [/^\/tone-and-content/, 'toneAndContent'],
] as const;

/**
 * Un changement de route SPA est silencieux par défaut : ni titre d'onglet,
 * ni déplacement de focus — un lecteur d'écran n'entend rien et le focus
 * reste sur le lien cliqué d'une page démontée. Ce wrapper (toujours monté,
 * donc focalisable même pendant qu'un chunk lazy charge) règle les deux.
 */
function RouteChrome({ children }: { children: ReactNode }) {
  const t = useT();
  const { pathname } = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    const key = PAGE_TITLES.find(([re]) => re.test(pathname))?.[1] ?? 'home';
    document.title = t(`titles.${key}`);
    // Pas de vol de focus au chargement initial — seulement aux navigations.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    containerRef.current?.focus();
  }, [pathname, t]);

  return (
    <div id="main-content" ref={containerRef} tabIndex={-1} className="outline-none">
      {children}
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      {/* `reducedMotion="user"` : Framer Motion suit la préférence OS
          (les transforms d'entrée deviennent de simples fondus). */}
      <MotionConfig reducedMotion="user">
        <HashRouter>
          {/* Repli vide sur fond parchemin (body) : pas de spinner-flash,
              pas de décalage de mise en page. */}
          <RootBoundary>
          <SkipLink />
          {/* Hors ligne : une seule ligne discrète, au-dessus des pages.
              Rien ne s'affiche tant que la connexion tient. Sous la
              boundary, pour qu'un plantage ici ne blanchisse pas l'app. */}
          <OfflineNotice />
          <RouteChrome>
          <Suspense fallback={<div className="min-h-screen" aria-busy="true" />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/character/:id" element={<CharacterSheetPage />} />
              <Route path="/location/:id" element={<LocationSheetPage />} />
              <Route path="/graph" element={<GraphViewPage />} />
              <Route path="/chronicles" element={<ChroniclesPage />} />
              <Route path="/maps" element={<MapsPage />} />
              <Route path="/map/:id" element={<MapViewerPage />} />
              <Route path="/ledger" element={<LedgerPage />} />
              <Route path="/gm" element={<GmJournalPage />} />
              <Route path="/tone-and-content" element={<ToneAndContentPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
          </RouteChrome>
          </RootBoundary>
        </HashRouter>
      </MotionConfig>
    </LanguageProvider>
  );
}
