import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '@/i18n';
import { useCharacters } from '@/hooks/useCharacters';
import { useLocations } from '@/hooks/useLocations';
import { useTimeline } from '@/hooks/useTimeline';
import { useCanEdit } from '@/hooks/useRole';
import { useChroniclePresence } from '@/hooks/useChroniclePresence';
import { normalizeSeason } from '@/lib/timeline/seasonEntry';
import { hasEntryContent, hasSeasonText, listContentYears, nextSlot } from '@/lib/timeline/timelineRange';
import {
  buildMentionItems,
  type MentionItem,
} from '@/components/editor/mentionItems';
import type { Season } from '@/types';
import { SeasonField } from './SeasonField';
import { SeasonFocusModal } from './SeasonFocusModal';
import { SEASON_COLOR, SEASON_MARKS, SEASONS } from './seasons';
import './chronicles.css';

interface ChronicleAnnalsProps {
  spaceId: string | undefined;
  /** Année ciblée par le lien profond `?year=` : on y défile à l'arrivée. */
  initialYear?: number;
}

/**
 * Annales : lecture chronologique continue de la frise. Toutes les années
 * consignées en ordre croissant, chaque saison rendue par la même carte de
 * lecture que la roue (`SeasonField`) ; l'édition passe par la même modale
 * plein écran. Complément de lecture de la roue — la roue reste la vue
 * d'écriture par défaut.
 */
export function ChronicleAnnals({ spaceId, initialYear }: ChronicleAnnalsProps) {
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

  // `listContentYears` renvoie [0] sur frise vide (affordance de la roue) :
  // on re-filtre sur le contenu réel pour que l'état vide reste vide.
  const years = useMemo(
    () =>
      listContentYears(timeline.entries).filter((y) =>
        hasEntryContent(timeline.entries[String(y)]),
      ),
    [timeline.entries],
  );

  // Contrairement à la roue (année sélectionnée + saison), toutes les années
  // sont à l'écran : le focus porte le couple année/saison.
  const [focus, setFocus] = useState<{ year: number; season: Season } | null>(null);
  const focusEntry = focus
    ? normalizeSeason(timeline.entries[String(focus.year)]?.[focus.season])
    : { body: '' };
  const focusGmEntry = focus
    ? normalizeSeason(timeline.gm_entries?.[String(focus.year)]?.[focus.season])
    : { body: '' };

  // Annonce de présence : ouverte avec l'éditeur plein écran, retirée avec lui.
  useEffect(() => {
    setEditing(focus ? { ...focus, strand: 'player' } : null);
  }, [focus, setEditing]);

  // Lien profond `?year=` : défile une seule fois vers l'ancre de l'année.
  const scrolledRef = useRef(false);
  useEffect(() => {
    if (!loaded || initialYear == null || scrolledRef.current) return;
    scrolledRef.current = true;
    document.getElementById(`annals-year-${initialYear}`)?.scrollIntoView({ block: 'start' });
  }, [loaded, initialYear]);

  // Déplacement depuis l'éditeur : si la cible est libre, on re-classe
  // l'entrée et le focus la suit ; sinon `moveEntry` refuse (toast).
  const moveFocus = (toYear: number, toSeason: Season): boolean => {
    if (!focus) return false;
    const ok = moveEntry(
      { year: focus.year, season: focus.season },
      { year: toYear, season: toSeason },
    );
    if (ok) setFocus({ year: toYear, season: toSeason });
    return ok;
  };

  // Évite le flash de l'état vide avant le fetch
  if (!loaded) return <div className="chronicles-root annals-root" aria-busy="true" />;

  return (
    <div className="chronicles-root annals-root">
      {years.length === 0 ? (
        <div className="annals-empty">
          <p>{t('chronicles.annalsEmpty')}</p>
          {canEdit && (
            <button
              type="button"
              className="record-btn"
              onClick={() => setFocus(nextSlot(timeline.entries))}
            >
              {t('chronicles.recordEntry')}
            </button>
          )}
        </div>
      ) : (
        years.map((y) => {
          const entry = timeline.entries[String(y)] || {};
          const gmEntry = timeline.gm_entries?.[String(y)] || {};
          return (
            <section key={y} id={`annals-year-${y}`} className="annals-year">
              <h2 className="annals-year-head">
                {/* Années négatives = avant la campagne, même voix que la roue. */}
                {y < 0
                  ? `${-y} ${t(y === -1 ? 'chronicles.yearAgo' : 'chronicles.yearsAgo')}`
                  : `${t('chronicles.year')} ${y}`}
              </h2>
              <div className="annals-seasons">
                {SEASONS.filter((s) => hasSeasonText(entry[s])).map((s) => {
                  const isCurrent =
                    timeline.current_year === y && timeline.current_season === s;
                  return (
                    <div key={s} className="annals-entry">
                      <SeasonField
                        season={s}
                        value={entry[s]}
                        gmValue={gmEntry[s]}
                        onOpen={(season) => setFocus({ year: y, season })}
                        peerEditing={peersAt(y, s)[0]}
                      />
                      {isCurrent && (
                        <span
                          className="annals-current-seal"
                          style={{ color: SEASON_COLOR[s] }}
                          title={t('chronicles.jumpToCurrent')}
                          aria-label={t('chronicles.jumpToCurrent')}
                        >
                          {SEASON_MARKS[s]}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })
      )}

      <SeasonFocusModal
        season={focus?.season ?? null}
        year={focus?.year ?? 0}
        title={focusEntry.title ?? ''}
        body={focusEntry.body}
        onChangeTitle={(v) => {
          if (!focus) return;
          setEditing({ ...focus, strand: 'player' });
          updateEntry(focus.year, focus.season, { title: v });
        }}
        onChangeBody={(v) => {
          if (!focus) return;
          setEditing({ ...focus, strand: 'player' });
          updateEntry(focus.year, focus.season, { body: v });
        }}
        onMove={moveFocus}
        onClose={() => setFocus(null)}
        mentionItems={mentionItems}
        gmBody={focusGmEntry.body}
        peers={focus ? peersAt(focus.year, focus.season) : []}
        onChangeGmBody={(v) => {
          if (!focus) return;
          setEditing({ ...focus, strand: 'gm' });
          updateGmEntry(focus.year, focus.season, { body: v });
        }}
        conflict={focus ? conflictFor(focus.year, focus.season, 'player') : null}
        gmConflict={focus ? conflictFor(focus.year, focus.season, 'gm') : null}
        onResolveConflict={(strand, res) =>
          focus && resolveConflict(focus.year, focus.season, strand, res)
        }
      />
    </div>
  );
}
