import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import {
  TransformComponent,
  TransformWrapper,
  useTransformContext,
  useTransformEffect,
  type ReactZoomPanPinchContentRef,
} from 'react-zoom-pan-pinch';
import { useT } from '@/i18n';
import type { CampaignMap, MapPin } from '@/types';

// Les deux curseurs du ressenti « tampon » des glyphes d'épingle (voir
// PinScaleGuard) : taille de départ en vue "contain" (fraction de la taille
// de composant) et vitesse de croissance avec le zoom relatif (exposant ;
// 1 = solidaire de la carte, plus petit = plus lent).
const PIN_ZOOM_BASE = 0.6;
const PIN_ZOOM_EXPONENT = 0.8;

/**
 * Remplace <KeepScale> (react-zoom-pan-pinch@4.0.3, node_modules/
 * react-zoom-pan-pinch/dist/index.cjs.js ~L2109) : cette dernière ne fixe
 * son contre-scale (`style.transform = scale(1/s)`) que DANS son abonnement
 * `instance.onChange(...)`, posé dans un `useEffect` — abonnement qui n'est
 * appelé que lors d'un PROCHAIN changement de transform (pan/zoom), jamais
 * immédiatement à l'initialisation. Une épingle montée APRÈS le dernier
 * événement de transform (cas exact d'une création via le dialogue, sans
 * pan/zoom qui suit) hérite donc d'un `transform` "identité" (aucun
 * contre-scale) au lieu de `scale(1/s)` : elle s'affiche à la taille
 * AMBIANTE du contenu zoomé (donc microscopique en vue "contain", où `s`
 * est petit) jusqu'à ce que l'utilisateur interagisse avec la carte et
 * déclenche enfin `onChange` — d'où le "pop-in" au premier pan/zoom (voir
 * rapport Task F6 pour la preuve Playwright).
 *
 * Le correctif lit le scale courant de façon SYNCHRONE dès le montage
 * (`useTransformContext().state.scale` — pas `.transformState`, qui
 * n'existe pas sur cette classe ; vérifié dans index.d.ts) au lieu d'attendre
 * un premier `onChange`, puis suit ses changements via `useTransformEffect`.
 *
 * `transformOrigin: '0 0'` (coin haut-gauche) plutôt que le centre par
 * défaut : le marqueur (PinMarker) s'ancre déjà sur x/y via SON PROPRE
 * `translate` (`-translate-x-1/2 -translate-y-full` ou `-1/2`), qui place
 * son point d'ancrage exactement à l'origine (0,0) de CE wrapper (wrapper
 * non transformé, dimensionné pile sur la boîte du marqueur — flux normal,
 * enfant unique, sans marge). Avec l'origine de scale par défaut (50% 50%,
 * le CENTRE de cette même boîte), le contre-scale ferait dériver ce point
 * d'ancrage de `(1 - 1/s) × (moitié de la taille du marqueur)` — un décalage
 * non négligeable dès que `s` s'écarte de 1 (donc quasiment toujours), et
 * d'autant plus grand que la carte est dézoomée (`s` petit → `1/s` grand).
 * Ancrer le scale en (0,0) — le MÊME point que l'ancrage du marqueur —
 * élimine cette dérive.
 *
 * Écriture DOM impérative plutôt qu'un state React (`ref.current.style.
 * transform`, pas `setState`) : avec UNE garde par épingle, un state React
 * ferait planifier N réconciliations par frame de pan/zoom (60fps × N
 * épingles) pour un simple changement de style purement visuel — même
 * stratégie que le `<KeepScale>` d'origine (son abonnement `onChange` écrit
 * déjà `style.transform` directement, jamais via `setState`), PLUS
 * l'amorçage synchrone au montage qui lui manquait (cause du bug de
 * « pop-in » documenté ci-dessus).
 */
function PinScaleGuard({ children, minScale }: { children: ReactNode; minScale: number }) {
  const instance = useTransformContext();
  const ref = useRef<HTMLDivElement>(null);
  // Écriture DOM impérative (pas de setState) : N épingles × 60fps ne doivent
  // pas déclencher N réconciliations React par frame — même stratégie que le
  // <KeepScale> d'origine, PLUS l'amorçage synchrone au montage qui lui
  // manquait (cause du bug de « pop-in », voir ci-dessus).
  //
  // En plus du contre-scale, publie `--pin-zoom` : facteur consommé par
  // PinMarker/PinPopover pour faire grossir le SEUL glyphe — la puce de
  // légende et le popover restent à taille écran constante. Modèle « encre
  // tamponnée SUR la carte » (demande utilisateur) : discret en vue
  // "contain" (`PIN_ZOOM_BASE` × la taille de composant, `scale/minScale`
  // ne descendant jamais sous 1 — le plancher de zoom EST minScale), puis
  // croissance CONTINUE avec le zoom, sous-linéaire (exposant < 1) et SANS
  // plafond — le glyphe accompagne toujours le mouvement, il ne « décroche »
  // jamais en cours de zoom.
  const applyScale = useCallback(
    (scale: number) => {
      if (!ref.current) return;
      ref.current.style.transform = `scale(${1 / scale})`;
      ref.current.style.setProperty(
        '--pin-zoom',
        String(PIN_ZOOM_BASE * Math.max(1, scale / minScale) ** PIN_ZOOM_EXPONENT),
      );
    },
    [minScale],
  );
  useLayoutEffect(() => {
    applyScale(instance.state.scale);
  }, [instance, applyScale]);
  useTransformEffect(({ state }) => {
    applyScale(state.scale);
  });
  return (
    <div ref={ref} style={{ transformOrigin: '0 0' }}>
      {children}
    </div>
  );
}

interface MapCanvasProps {
  map: CampaignMap;
  imageUrl: string;
  pins: MapPin[];
  placing: boolean;
  canEdit: boolean;
  selectedPinId: string | null;
  onSelectPin: (id: string | null) => void;
  onPlacePin: (x: number, y: number) => void;
  onMovePin: (id: string, x: number, y: number) => void;
  renderMarker: (pin: MapPin) => ReactNode;
  renderPopover: (pin: MapPin) => ReactNode;
}

// En-deçà de ce déplacement (px écran), un pointerdown+pointerup reste un
// simple clic — pas un drag. Sans seuil, la moindre dérive du curseur
// (trackpad !) activait le drag dès le premier pointermove, démontant le
// popover en cours d'interaction (son garde de rendu est `drag === null`) et
// committant `onMovePin` là où le curseur avait dérivé (voir rapport Task
// 10, round 2 — finding critique).
const DRAG_THRESHOLD_PX = 4;

/**
 * Vue pan/zoom de la carte. Les épingles vivent DANS le calque transformé
 * en % (coordonnées normalisées) mais gardent une taille écran quasi
 * constante via <PinScaleGuard> (contre-scale maison, voir plus haut —
 * remplace <KeepScale> de la librairie) ; seul le glyphe du marqueur suit
 * le zoom via `--pin-zoom` (discret en vue "contain", croissance
 * sous-linéaire sans plafond ensuite — voir PIN_ZOOM_*). Le drag d'épingle
 * coupe le pan
 * (stopPropagation) et se commit en coordonnées normalisées au relâchement.
 */
export function MapCanvas({
  map, imageUrl, pins, placing, canEdit, selectedPinId,
  onSelectPin, onPlacePin, onMovePin, renderMarker, renderPopover,
}: MapCanvasProps) {
  const t = useT();
  const imgRef = useRef<HTMLImageElement>(null);
  const transformRef = useRef<ReactZoomPanPinchContentRef>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);

  // `minScale` dérive du scale "contain" à chaque (re)calcul — pas besoin de
  // retenir ce dernier ailleurs : le bouton Reset rappelle `applyFitView`,
  // qui le recalcule à la volée depuis les tailles DOM actuelles.
  const [minScale, setMinScale] = useState(0.1);
  // Whether the view has been fitted. Until it has, the transform still holds
  // its default scale, so anything painted is painted at the wrong size.
  const [fitted, setFitted] = useState(false);

  // Centre la vue au scale "contain" — c'est aussi le plancher de zoom
  // arrière (`minScale = fitScale` exactement, pas de marge en-dessous) :
  // dézoomer au-delà de la vue "contain" ne fait qu'exposer le fond du
  // conteneur autour de l'image, et donne aux épingles un ressenti imprécis
  // (elles semblent "flotter" loin de leur point d'ancrage réel une fois
  // l'image entière minuscule au centre — demande utilisateur n°4).
  // `animationTime` : 0 au premier chargement (pas d'à-coup visible), 200ms
  // pour le bouton Reset (retour perceptible).
  //
  // Mesuré sur `contentComponent.offsetWidth/Height` plutôt que sur
  // `img.naturalWidth/Height` : ce sont EXACTEMENT les dimensions que
  // `centerView`/`getCenterPosition` (react-zoom-pan-pinch) utilisent en
  // interne pour centrer, donc toujours cohérent avec le rendu réel — y
  // compris dans le repli localStorage où l'aperçu affiché (`image_data`,
  // redimensionné ≤2048px par `prepareMapImage`) peut avoir une résolution
  // différente des attributs HTML `width`/`height` posés depuis
  // `map.image_width/height` (dimensions d'origine). Ces attributs pilotant
  // la boîte de mise en page réelle de l'`<img>`, s'aligner sur
  // `naturalWidth/Height` aurait désynchronisé notre calcul de celui de
  // `centerView`.
  const applyFitView = useCallback((animationTime: number) => {
    const wrapper = transformRef.current?.instance.wrapperComponent;
    const content = transformRef.current?.instance.contentComponent;
    if (!wrapper || !content) return false;
    const wrapperRect = wrapper.getBoundingClientRect();
    const contentWidth = content.offsetWidth;
    const contentHeight = content.offsetHeight;
    if (wrapperRect.width === 0 || wrapperRect.height === 0 || contentWidth === 0 || contentHeight === 0) {
      return false;
    }
    const fitScale = Math.min(1, wrapperRect.width / contentWidth, wrapperRect.height / contentHeight);
    setMinScale(fitScale);
    transformRef.current?.centerView(fitScale, animationTime);
    setFitted(true);
    return true;
  }, []);

  /**
   * Fit BEFORE the first paint, not on the image's `load` event.
   *
   * The `<img>` lays out from `map.image_width/height` — row data we already
   * have — so its box is final as soon as the element exists, long before any
   * bytes arrive. Waiting for `load` meant the first painted frame was always
   * the transform's default `scale: 1`: the map appeared at full natural size
   * (measured at 4000px for a 458px slot), then snapped. Doing the same work
   * in a layout effect lands it in the same frame the element is created in.
   *
   * `useLayoutEffect` specifically: it runs after the DOM mutation and before
   * the browser paints, which is the entire point. An ordinary effect would
   * paint the unfitted frame first.
   */
  useLayoutEffect(() => {
    applyFitView(0);
  }, [applyFitView, map.id, map.image_width, map.image_height]);

  // Re-fit once the bytes are in. Normally a no-op — the layout effect above
  // already settled it — but it is the fallback for rows with no stored
  // dimensions, where the box only becomes real once the image decodes.
  const handleImageLoad = useCallback(() => {
    applyFitView(0);
  }, [applyFitView]);

  const handleResetView = useCallback(() => {
    applyFitView(200);
  }, [applyFitView]);

  // Filet de sécurité pour les images quasi synchrones (data-URL du repli
  // localStorage) : si `complete` est déjà vrai quand cet effet tourne, le
  // `load` natif a pu se déclencher avant que React ait fini de committer/
  // attacher son listener sur ce montage — sans ce filet, la vue resterait
  // bloquée au scale par défaut. Redéclenché à chaque changement d'image.
  useEffect(() => {
    const img = imgRef.current;
    if (!img || !img.complete || !img.naturalWidth) return;
    applyFitView(0);
  }, [imageUrl, applyFitView]);

  const toNormalized = useCallback((clientX: number, clientY: number) => {
    const rect = imgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y };
  }, []);

  // Toujours à jour pour que les listeners `window` (identité stable, posés
  // une seule fois par drag) appellent la dernière version de la prop —
  // celle-ci est une nouvelle closure à chaque rendu côté MapViewerPage.
  // L'assignation vit dans un effet : écrire un ref pendant le rendu est
  // interdit (règle `react-hooks/refs`).
  const onMovePinRef = useRef(onMovePin);
  useEffect(() => {
    onMovePinRef.current = onMovePin;
  }, [onMovePin]);

  // Point de départ du drag en cours, hors du state React tant qu'il n'est
  // pas activé : `onPointerDown` se contente d'enregistrer la position de
  // départ (pas de setDrag, pas de setPointerCapture — un simple clic sur un
  // bouton du popover ne doit jamais être requalifié en drag). Le drag ne
  // s'active (et ne fait donc apparaître le state `drag`) qu'après un
  // déplacement > DRAG_THRESHOLD_PX.
  const dragStateRef = useRef<{
    pinId: string;
    startX: number;
    startY: number;
    pointerId: number;
    active: boolean;
  } | null>(null);

  // Ref vers handlePointerUp lui-même : évite l'auto-référence directe dans
  // son propre corps (référencer `handlePointerUp` avant sa déclaration
  // complète empêche l'analyse statique de la règle `react-hooks` de suivre
  // ses mises à jour). handlePointerUp étant stable (deps toujours
  // identiques), ce ref est synchronisé une seule fois, bien avant le
  // premier pointerup possible.
  const handlePointerUpRef = useRef<(e: PointerEvent) => void>(() => {});

  // Écouteurs posés sur `window` (pas sur le wrapper de l'épingle) : plus de
  // setPointerCapture, donc le curseur peut sortir du petit hit-box de
  // l'épingle pendant un drag sans perdre les events.
  const handlePointerMove = useCallback((e: PointerEvent) => {
    const start = dragStateRef.current;
    if (!start || e.pointerId !== start.pointerId) return;
    if (!start.active) {
      const dx = e.clientX - start.startX;
      const dy = e.clientY - start.startY;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      start.active = true;
    }
    const p = toNormalized(e.clientX, e.clientY);
    if (p) setDrag({ id: start.pinId, ...p });
  }, [toNormalized]);

  const handlePointerUp = useCallback((e: PointerEvent) => {
    const start = dragStateRef.current;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUpRef.current);
    dragStateRef.current = null;
    setDrag(null);
    if (!start || e.pointerId !== start.pointerId || !start.active) return;
    // Étouffe le `click` synthétique qui suit ce pointerup : le marqueur
    // SUIVANT le curseur pendant le drag, le relâchement a toujours lieu
    // au-dessus de lui — sans ceci, le navigateur émet un click sur le
    // bouton du marqueur et le popover s'ouvrait à chaque fin de drag.
    // Capture + once : n'avale QUE ce click-là ; le setTimeout retire le
    // garde si aucun click n'est émis (relâchement hors document, etc.).
    const squelch = (ce: MouseEvent) => {
      ce.stopPropagation();
      ce.preventDefault();
    };
    window.addEventListener('click', squelch, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', squelch, { capture: true }), 0);
    const p = toNormalized(e.clientX, e.clientY);
    if (p) onMovePinRef.current(start.pinId, p.x, p.y);
  }, [handlePointerMove, toNormalized]);

  useEffect(() => {
    handlePointerUpRef.current = handlePointerUp;
  }, [handlePointerUp]);

  // Démontage pendant un drag (changement de carte, navigation…) : les
  // listeners `window` ne doivent pas survivre au composant.
  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  // Garde-fou : si l'épingle en cours de drag disparaît (suppression
  // concurrente par un autre client pendant le drag), `drag` resterait actif
  // pour toujours et `panning={{ disabled: drag !== null }}` bloquerait le
  // pan indéfiniment (Important finding 2). On ne détache pas les listeners
  // `window` ici : le pointeur physique de l'utilisateur est encore
  // enfoncé, donc le futur `pointerup` réel les nettoiera lui-même (son
  // premier geste est justement ce removeEventListener) ; vider
  // `dragStateRef` suffit à empêcher handlePointerMove/Up de ressusciter le
  // drag ou de committer un déplacement sur une épingle supprimée.
  useEffect(() => {
    if (!drag || pins.some((p) => p.id === drag.id)) return;
    dragStateRef.current = null;
    // Synchronise un état local avec un signal externe (suppression
    // concurrente reçue via Realtime), pas une dérivation pure du rendu :
    // c'est le rôle d'un effet. Le re-rendu en cascade que la règle signale
    // est ici rarissime (suppression pendant un drag actif d'un autre
    // utilisateur) et sans coût perceptible.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDrag(null);
  }, [pins, drag]);

  return (
    <>
      <TransformWrapper
        ref={transformRef}
        minScale={minScale}
        maxScale={12}
        limitToBounds={false}
        doubleClick={{ disabled: true }}
        // Zoom adouci : ~quart des pas par défaut de la lib (molette 0.015,
        // pincement 5) — à ajuster ici si la sensation ne convient pas.
        wheel={{ step: 0.004 }}
        pinch={{ step: 1.5 }}
        // `excluded` est indispensable en PLUS de `disabled` : la lib pose son
        // pointerdown en natif sur le wrapper, qui court AVANT la délégation
        // synthétique de React — le stopPropagation du pin ne l'atteint donc
        // jamais, et le pan démarrait avec le drag d'épingle (dérives de
        // carte accidentelles). `isExcludedNode` couvre l'élément marqué ET
        // tous ses descendants (icônes SVG comprises).
        panning={{ disabled: drag !== null, excluded: ['map-pin-node'] }}
      >
        <TransformComponent
          wrapperStyle={{ width: '100%', height: '100%' }}
          contentStyle={{
            position: 'relative',
            // Nothing is shown at the wrong scale. With dimensions on the row
            // the fit lands in the first frame, so this is imperceptible; it
            // only becomes a visible (brief) blank for rows with no stored
            // dimensions, where the alternative is watching the map snap.
            opacity: fitted ? 1 : 0,
            transition: 'opacity 160ms ease',
          }}
        >
          <img
            ref={imgRef}
            src={imageUrl}
            alt={map.name}
            width={map.image_width ?? undefined}
            height={map.image_height ?? undefined}
            // This IS the page's LCP element, and it arrives late: its URL is
            // the end of a JS chain (boot → session → fetch maps → IndexedDB
            // bytes or a signed URL), so the browser cannot discover it in the
            // document however the markup is written. All that is left is to
            // stop it queueing behind everything else once it IS known.
            fetchPriority="high"
            draggable={false}
            className="max-w-none select-none"
            // `pointerEvents: 'auto'` : react-zoom-pan-pinch@4.0.3 embarque
            // `.transform-component-module_content img { pointer-events: none }`
            // (anti-drag-fantôme natif du navigateur) — sans ce surcroît, ce
            // onClick ne reçoit jamais aucun clic réel (souris/tactile), même si
            // les tests unitaires/JSDOM ne le détectent pas (pas de vraie
            // cascade CSS). Vérifié en Playwright headless (voir rapport Task 10).
            style={{ pointerEvents: 'auto', ...(placing ? { cursor: 'crosshair' } : {}) }}
            onLoad={handleImageLoad}
            onClick={(e) => {
              if (!placing) { onSelectPin(null); return; }
              const p = toNormalized(e.clientX, e.clientY);
              if (p) onPlacePin(p.x, p.y);
            }}
          />
          {/*
            Pins are held back until the view is fitted. They counter-scale
            against the CURRENT transform, so one painted beforehand is sized
            against the default scale and then jumps — measured at 30px
            settling to 3px. They arrive on their own fetch, so this is not
            hypothetical: with a warm cache they routinely beat the image.
          */}
          {fitted && pins.map((pin) => {
            const pos = drag?.id === pin.id ? drag : pin;
            return (
              <div
                key={pin.id}
                // z-30 sur le WRAPPER sélectionné/déplacé (pas seulement le
                // bouton) : le popover vit dans ce wrapper, et les wrappers
                // sont des frères absolus sans z-index — sans ceci, toute
                // épingle plus tardive dans le DOM peignait PAR-DESSUS le
                // popover ouvert d'une autre.
                className={`absolute map-pin-node ${
                  selectedPinId === pin.id || drag?.id === pin.id ? 'z-30' : ''
                }`}
                style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }}
                onPointerDown={(e) => {
                  if (!canEdit || placing) return;
                  e.stopPropagation();
                  dragStateRef.current = {
                    pinId: pin.id,
                    startX: e.clientX,
                    startY: e.clientY,
                    pointerId: e.pointerId,
                    active: false,
                  };
                  window.addEventListener('pointermove', handlePointerMove);
                  window.addEventListener('pointerup', handlePointerUp);
                }}
              >
                <PinScaleGuard minScale={minScale}>
                  {renderMarker(pin)}
                  {selectedPinId === pin.id && drag === null && renderPopover(pin)}
                </PinScaleGuard>
              </div>
            );
          })}
        </TransformComponent>
      </TransformWrapper>

      {/*
        Sibling du TransformWrapper (pas un enfant) : se positionne par
        rapport au conteneur `relative overflow-hidden` du parent
        (MapViewerPage), exactement comme les boutons flottants de
        GraphViewPage. Masqué pendant le placement d'épingle : ce mode
        n'utilise QUE le coin top-3 right-3 pour son indice textuel
        (`placePinHint`), les deux se superposeraient sinon.
      */}
      {!placing && (
        <button
          type="button"
          onClick={handleResetView}
          title={t('maps.resetView')}
          aria-label={t('maps.resetView')}
          className="absolute top-3 right-3 z-10 inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-[var(--bg-card)] border border-[var(--border-paper)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-alt)] transition-colors shadow-sm text-xs font-body"
        >
          <RotateCcw size={16} />
          <span className="hidden sm:inline">{t('maps.resetView')}</span>
        </button>
      )}
    </>
  );
}
