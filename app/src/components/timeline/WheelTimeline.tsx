import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useT } from '@/i18n';
import { useCharacters } from '@/hooks/useCharacters';
import { useLocations } from '@/hooks/useLocations';
import { useTimeline } from '@/hooks/useTimeline';
import { useCanEdit } from '@/hooks/useRole';
import { useChroniclePresence } from '@/hooks/useChroniclePresence';
import { normalizeSeason } from '@/lib/timeline/seasonEntry';
import { deriveYearRange, hasSeasonText, listContentYears, nextSlot } from '@/lib/timeline/timelineRange';
import {
  buildMentionItems,
  type MentionItem,
} from '@/components/editor/mentionItems';
import type { Season } from '@/types';
import { StampIcon } from '@/components/shared/StampIcon';
import chapterCircle from '@/assets/stonetop/chapter-circle.png';
import { CurrentSeasonSeal } from './CurrentSeasonSeal';
import { SeasonAddCard } from './SeasonAddCard';
import { SeasonField } from './SeasonField';
import { SeasonFocusModal } from './SeasonFocusModal';
import { SEASONS } from './seasons';
import './chronicles.css';

const DESKTOP_BREAKPOINT = 1280;
const TABLET_BREAKPOINT = 768;
const WHEEL_THROTTLE_MS = 180;
const SCROLL_HINT_FADE_MS = 400;
const HINT_SEEN_KEY = 'inkstone:chronicles:hint-seen';

// Doit rester aligné avec les media queries `--rotation-step` de chronicles.css
function getStepDeg(): number {
  if (typeof window === 'undefined') return 10;
  const w = window.innerWidth;
  if (w >= DESKTOP_BREAKPOINT) return 6;
  if (w >= TABLET_BREAKPOINT) return 8;
  if (w <= 640) return 12;
  return 10;
}

interface WheelTimelineProps {
  spaceId: string | undefined;
  /** Année de départ explicite (lien profond `?year=`) — prime sur la saison actuelle. */
  initialYear?: number;
}

export function WheelTimeline({ spaceId, initialYear }: WheelTimelineProps) {
  const t = useT();
  const canEdit = useCanEdit();
  const { timeline, loaded, updateEntry, moveEntry, updateGmEntry, conflictFor, resolveConflict } =
    useTimeline(spaceId);
  const { characters } = useCharacters(spaceId);
  const { locations } = useLocations(spaceId);
  const { peers, setEditing } = useChroniclePresence(spaceId);
  const peersAt = (year: number, season: Season) =>
    peers.filter((p) => p.year === year && p.season === season);

  // Cibles des mentions @ dans l'éditeur de saison (personnages puis lieux).
  const mentionItems = useMemo<MentionItem[]>(
    () => buildMentionItems(characters, locations),
    [characters, locations],
  );

  // Sélection par ANNÉE (pas par index) : les angles ne dépendent que de
  // `année - sélection`, donc la roue reste stable quand la plage bouge.
  const [selectedYear, setSelectedYear] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const [focusSeason, setFocusSeason] = useState<Season | null>(null);

  const [stepDeg, setStepDeg] = useState(getStepDeg);

  // Aide à l'usage de la roue : visible tant que l'utilisateur n'a jamais
  // interagi avec succès ; disparaît ensuite définitivement (par navigateur).
  const [hintState, setHintState] = useState<'visible' | 'fading' | 'hidden'>(() => {
    try {
      return localStorage.getItem(HINT_SEEN_KEY) ? 'hidden' : 'visible';
    } catch {
      // stockage bloqué (mode privé) → considéré comme jamais vu
      return 'visible';
    }
  });
  const hintSeenRef = useRef(false);
  const dismissHint = useCallback(() => {
    if (hintSeenRef.current) return;
    hintSeenRef.current = true;
    try {
      localStorage.setItem(HINT_SEEN_KEY, '1');
    } catch {
      // ignore
    }
    // Fondu plutôt que retrait : pas de saut de layout pendant l'interaction.
    setHintState((s) => (s === 'visible' ? 'fading' : s));
  }, []);

  const wheelStageRef = useRef<HTMLDivElement | null>(null);
  const wheelLockRef = useRef(0);
  const scrollDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Plage « réelle » : années avec du texte + marqueur saison actuelle.
  const baseRange = useMemo(
    () => deriveYearRange(timeline.entries, timeline.current_year),
    [timeline.entries, timeline.current_year],
  );

  // La roue n'affiche QUE les années où quelque chose est consigné, plus
  // l'année visitée (cible de « Consigner » / saut), même vide. Les années
  // vides intermédiaires sont masquées : positionnement par index, pas par
  // valeur d'année — les écarts de temps se referment.
  const years = useMemo(
    () => listContentYears(timeline.entries, selectedYear),
    [timeline.entries, selectedYear],
  );
  const currentIndex = Math.max(0, years.indexOf(selectedYear));

  // Réf pour éviter les fermetures périmées dans les écouteurs (deps: [loaded]).
  const yearsRef = useRef(years);
  useEffect(() => {
    yearsRef.current = years;
  }, [years]);

  // Le défilement saute d'une année consignée à la suivante (les années vides
  // ne sont pas sur la roue) : on étend la frise via « Consigner une entrée »
  // ou « Aller à l'année », pas en faisant tourner la roue.
  const stepSelectedYear = useCallback((dir: number) => {
    setSelectedYear((y) => {
      const list = yearsRef.current;
      const idx = list.indexOf(y);
      if (idx === -1) return y;
      const nextIdx = Math.min(Math.max(idx + dir, 0), list.length - 1);
      return list[nextIdx];
    });
  }, []);

  // Position initiale : lien profond `?year=` s'il existe, sinon saison
  // actuelle, sinon début de plage. Suivi par grimoire : si `spaceId` change
  // sans démontage, on repositionne.
  const initSpaceRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!loaded || initSpaceRef.current === spaceId) return;
    initSpaceRef.current = spaceId;
    setSelectedYear(initialYear ?? timeline.current_year ?? baseRange.start);
  }, [loaded, spaceId, initialYear, timeline.current_year, baseRange.start]);

  // Le pas de rotation CSS change avec les media queries : il faut suivre les
  // resize/rotations d'écran, sinon l'aiguille pointe la mauvaise année.
  useEffect(() => {
    const onResize = () => setStepDeg(getStepDeg());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Molette + tactile : la roue tourne à la molette ou au swipe horizontal.
  // Le défilement s'arrête au fantôme : y écrire étend la plage d'un an.
  useEffect(() => {
    const stage = wheelStageRef.current;
    if (!stage) return;

    const triggerScrollHint = () => {
      setIsScrolling(true);
      if (scrollDebounceRef.current) clearTimeout(scrollDebounceRef.current);
      scrollDebounceRef.current = setTimeout(() => setIsScrolling(false), SCROLL_HINT_FADE_MS);
    };

    const step = (dir: number) => {
      const now = Date.now();
      if (now - wheelLockRef.current < WHEEL_THROTTLE_MS) return;
      wheelLockRef.current = now;
      stepSelectedYear(dir);
      dismissHint();
      triggerScrollHint();
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dir = e.deltaY > 0 || e.deltaX > 0 ? 1 : -1;
      step(dir);
    };

    let touchStartX = 0;
    let touchStartY = 0;
    let touchLastFireX = 0;
    let touchAxis: 'x' | 'y' | null = null;
    const SWIPE_PIXELS_PER_STEP = 40;
    const AXIS_DECIDE_THRESHOLD = 8;

    const onTouchStart = (e: TouchEvent) => {
      const tch = e.touches[0];
      touchStartX = tch.clientX;
      touchStartY = tch.clientY;
      touchLastFireX = tch.clientX;
      touchAxis = null;
    };

    const onTouchMove = (e: TouchEvent) => {
      const tch = e.touches[0];
      const dx = tch.clientX - touchStartX;
      const dy = tch.clientY - touchStartY;

      if (touchAxis === null) {
        if (Math.abs(dx) < AXIS_DECIDE_THRESHOLD && Math.abs(dy) < AXIS_DECIDE_THRESHOLD) return;
        touchAxis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        if (touchAxis === 'y') return;
      }
      if (touchAxis !== 'x') return;
      e.preventDefault();

      const dxFromLast = tch.clientX - touchLastFireX;
      if (Math.abs(dxFromLast) >= SWIPE_PIXELS_PER_STEP) {
        step(dxFromLast < 0 ? 1 : -1);
        touchLastFireX = tch.clientX;
      }
    };

    const onTouchEnd = () => {
      touchAxis = null;
    };

    stage.addEventListener('wheel', onWheel, { passive: false });
    stage.addEventListener('touchstart', onTouchStart, { passive: true });
    stage.addEventListener('touchmove', onTouchMove, { passive: false });
    stage.addEventListener('touchend', onTouchEnd, { passive: true });
    stage.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      stage.removeEventListener('wheel', onWheel);
      stage.removeEventListener('touchstart', onTouchStart);
      stage.removeEventListener('touchmove', onTouchMove);
      stage.removeEventListener('touchend', onTouchEnd);
      stage.removeEventListener('touchcancel', onTouchEnd);
    };
    // `loaded` : la scène n'existe qu'après le chargement (early return),
    // il faut rebrancher les listeners quand elle apparaît.
  }, [loaded, stepSelectedYear, dismissHint]);

  // Navigation clavier
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      // `isContentEditable` : l'éditeur Tiptap est une div éditable — sans ce
      // garde, déplacer le curseur ferait tourner la roue derrière la modale.
      // BUTTON/SELECT : un contrôle focalisé garde ses flèches (sélecteurs de
      // saison, boutons de la barre) — la roue ne doit pas tourner en dessous.
      if (
        tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT' || tag === 'BUTTON' ||
        target?.isContentEditable
      ) return;
      // Haut/Bas restent au navigateur (scroll de page) — la roue est
      // horizontale, seules les flèches gauche/droite la pilotent.
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        stepSelectedYear(1);
        dismissHint();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepSelectedYear(-1);
        dismissHint();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stepSelectedYear, dismissHint]);

  // « Aller à l'année » : saisie en brouillon local, validée au blur/Entrée
  // (années négatives = avant la campagne). Remplace l'ancien panneau de
  // contrôle : sauter sur une année lointaine permet d'y écrire directement.
  const [jumpOpen, setJumpOpen] = useState(false);
  const [jumpDraft, setJumpDraft] = useState('');
  const jumpCancelRef = useRef(false);

  const commitJump = () => {
    setJumpOpen(false);
    const raw = jumpDraft;
    setJumpDraft('');
    if (jumpCancelRef.current) {
      jumpCancelRef.current = false;
      return;
    }
    const parsed = parseInt(raw.trim(), 10);
    if (!Number.isNaN(parsed)) setSelectedYear(parsed);
  };

  // « Consigner une entrée » : ouvre l'éditeur sur la saison qui suit l'entrée
  // la plus avancée. Le choix d'une autre saison / année (« autre chose ») se
  // fait dans l'éditeur lui-même (sélecteurs d'en-tête) : un seul bouton ici.
  const recordNext = () => {
    const slot = nextSlot(timeline.entries);
    setSelectedYear(slot.year);
    setFocusSeason(slot.season);
    dismissHint();
  };

  const currentYear = selectedYear;
  const entry = timeline.entries[String(currentYear)] || {};
  const focusEntry = focusSeason ? normalizeSeason(entry[focusSeason]) : { body: '' };
  const gmEntry = timeline.gm_entries?.[String(currentYear)] || {};
  const focusGmEntry = focusSeason ? normalizeSeason(gmEntry[focusSeason]) : { body: '' };

  // Annonce de présence : ouverte avec l'éditeur plein écran, retirée avec lui.
  useEffect(() => {
    setEditing(focusSeason ? { year: currentYear, season: focusSeason, strand: 'player' } : null);
  }, [focusSeason, currentYear, setEditing]);

  const closeFocus = useCallback(() => setFocusSeason(null), []);

  // Déplacement depuis l'éditeur : si la cible est libre, on re-classe l'entrée
  // et on suit la roue jusqu'à elle ; sinon `moveEntry` refuse (toast).
  const moveFocus = (toYear: number, toSeason: Season): boolean => {
    if (focusSeason == null) return false;
    const ok = moveEntry({ year: currentYear, season: focusSeason }, { year: toYear, season: toSeason });
    if (ok) {
      setSelectedYear(toYear);
      setFocusSeason(toSeason);
    }
    return ok;
  };

  // Rotation : place l'année courante en haut
  const baseRotation = -stepDeg * currentIndex;
  const itemsCount = years.length;

  // Évite le flash de la roue par défaut avant le fetch
  if (!loaded) return <div className="chronicles-root" aria-busy="true" />;

  return (
    <div className="chronicles-root">
      <header className="wheel-sticky">
        <div className="jump-bar">
          {jumpOpen ? (
            <input
              type="text"
              inputMode="numeric"
              pattern="-?[0-9]*"
              className="jump-input"
              value={jumpDraft}
              autoFocus
              onChange={(e) => setJumpDraft(e.target.value.replace(/[^0-9-]/g, ''))}
              onBlur={commitJump}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                else if (e.key === 'Escape') {
                  jumpCancelRef.current = true;
                  e.currentTarget.blur();
                }
              }}
              aria-label={t('chronicles.jumpToYear')}
            />
          ) : (
            <button
              type="button"
              className="jump-toggle"
              onClick={() => setJumpOpen(true)}
              title={t('chronicles.jumpToYear')}
            >
              <Search size={12} aria-hidden="true" />
              <span>{t('chronicles.jumpToYear')}</span>
            </button>
          )}
          <CurrentSeasonSeal timeline={timeline} onJump={setSelectedYear} />

          {canEdit && (
            <button type="button" className="record-btn" onClick={recordNext}>
              {t('chronicles.recordEntry')}
            </button>
          )}
        </div>

        <div
          className={`wheel-stage ${isScrolling ? 'is-scrolling' : ''}`}
          ref={wheelStageRef}
        >
          <div className="wheel-pointer" aria-hidden="true">
            <div className="dot" />
            <div className="needle" />
          </div>

          <div
            className="cards-container"
            style={
              {
                '--items': itemsCount,
                '--base-rotation': `${baseRotation}deg`,
              } as React.CSSProperties
            }
          >
            <div className="wheel-rim" />
            <ul className="cards">
              {years.map((y, i) => {
                const distance = Math.abs(i - currentIndex);
                const cls = [
                  y === selectedYear ? 'is-current' : '',
                  distance > 0 && distance <= 2 ? 'is-near' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <li key={y} style={{ '--i': i } as React.CSSProperties} className={cls}>
                    <button
                      type="button"
                      className="year-label"
                      onClick={() => {
                        dismissHint();
                        setSelectedYear(y);
                      }}
                    >
                      {/* Années négatives = avant la campagne : on montre la
                          magnitude (« 10 ») ; « years ago » se glisse sous le
                          grand chiffre quand l'année est sélectionnée. */}
                      <span className="year-value">{y < 0 ? -y : y}</span>
                      {y === selectedYear && y < 0 && (
                        <span className="year-caption">
                          {t(y === -1 ? 'chronicles.yearAgo' : 'chronicles.yearsAgo')}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="wheel-veil" />
        </div>
        {hintState !== 'hidden' && (
          <div className={`scroll-hint ${hintState === 'fading' ? 'is-dismissed' : ''}`}>
            {t('chronicles.scrollHint')}
          </div>
        )}
      </header>

      {/* <section> et non <main> : ChroniclesPage fournit déjà le <main> de la
          page — un <main> imbriqué casse la navigation par points de repère. */}
      <section className="seasons-wrap">
        {/* L'année héroïne vit sur la roue (libellé is-current) : ici, seule
            une transition ornementale sépare la roue des saisons. */}
        <section className="seasons-head" aria-hidden="true">
          <div className="ornament">
            <span className="line" />
            {/* Rond de chapitre du livre (Jason Lutes, CC BY 4.0). */}
            <StampIcon src={chapterCircle} size={26} />
            <span className="line" />
          </div>
        </section>

        <div className="seasons-grid">
          {SEASONS.map((season) =>
            hasSeasonText(entry[season]) ? (
              <SeasonField
                key={season}
                season={season}
                value={entry[season]}
                gmValue={gmEntry[season]}
                onOpen={setFocusSeason}
                peerEditing={peersAt(currentYear, season)[0]}
              />
            ) : (
              <SeasonAddCard key={season} season={season} onExpand={setFocusSeason} />
            ),
          )}
        </div>
      </section>

      <SeasonFocusModal
        season={focusSeason}
        year={currentYear}
        title={focusEntry.title ?? ''}
        body={focusEntry.body}
        onChangeTitle={(v) => {
          if (!focusSeason) return;
          setEditing({ year: currentYear, season: focusSeason, strand: 'player' });
          updateEntry(currentYear, focusSeason, { title: v });
        }}
        onChangeBody={(v) => {
          if (!focusSeason) return;
          setEditing({ year: currentYear, season: focusSeason, strand: 'player' });
          updateEntry(currentYear, focusSeason, { body: v });
        }}
        onMove={moveFocus}
        onClose={closeFocus}
        mentionItems={mentionItems}
        gmBody={focusGmEntry.body}
        peers={focusSeason ? peersAt(currentYear, focusSeason) : []}
        onChangeGmBody={(v) => {
          if (!focusSeason) return;
          setEditing({ year: currentYear, season: focusSeason, strand: 'gm' });
          updateGmEntry(currentYear, focusSeason, { body: v });
        }}
        conflict={focusSeason ? conflictFor(currentYear, focusSeason, 'player') : null}
        gmConflict={focusSeason ? conflictFor(currentYear, focusSeason, 'gm') : null}
        onResolveConflict={(strand, res) =>
          focusSeason && resolveConflict(currentYear, focusSeason, strand, res)
        }
      />
    </div>
  );
}
