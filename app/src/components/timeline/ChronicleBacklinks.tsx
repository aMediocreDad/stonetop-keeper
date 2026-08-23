import { useNavigate } from 'react-router-dom';
import { useT } from '@/i18n';
import { useTimeline } from '@/hooks/useTimeline';
import { findChronicleMentions } from '@/lib/timeline/chronicleMentions';
import type { Timeline } from '@/types';
import { SEASON_NAME_KEY } from './seasons';

interface ChronicleBacklinksProps {
  spaceId: string | undefined;
  /** Id de mention préfixé (`char:`/`loc:`) de la fiche affichée. */
  mentionId: string;
  /** Frise déjà chargée par la page hôte — évite un second abonnement temps réel. */
  timeline?: Timeline;
}

/**
 * Rétroliens « Dans la chronique » : saisons où la fiche est citée via
 * `@mention`. Chaque pastille ouvre la roue positionnée sur l'année.
 * Ne rend rien si la fiche n'est citée nulle part.
 */
export function ChronicleBacklinks({
  spaceId,
  mentionId,
  timeline: injected,
}: ChronicleBacklinksProps) {
  const t = useT();
  const navigate = useNavigate();
  // spaceId `undefined` désactive le hook (pas de fetch ni d'abonnement)
  // quand la page hôte fournit déjà sa frise.
  const { timeline: own, loaded } = useTimeline(injected ? undefined : spaceId);
  const timeline = injected ?? own;

  if (!injected && !loaded) return null;
  const mentions = findChronicleMentions(timeline.entries, mentionId);
  if (!mentions.length) return null;

  return (
    <div className="mt-5">
      <h4 className="label-overline mb-2">{t('chronicles.backlinksTitle')}</h4>
      <div className="flex flex-wrap gap-1.5">
        {mentions.map((m) => (
          <button
            key={`${m.year}-${m.season}`}
            type="button"
            onClick={() => navigate(`/chronicles?year=${m.year}`)}
            // These chips are LINKS, so they keep the capsule the bare .tag-pill just
            // dropped — without it the hover border would appear out of nothing.
            className="tag-pill px-2.5 py-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--text-muted)] hover:bg-[var(--bg-card-alt)] transition-colors"
          >
            {t(SEASON_NAME_KEY[m.season])} · {m.year}
          </button>
        ))}
      </div>
    </div>
  );
}
