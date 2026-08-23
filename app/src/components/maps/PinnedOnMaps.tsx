import { useNavigate } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useEntityPins, useMapsData } from '@/hooks/useMaps';
import { pinPosition } from '@/lib/campaign/traverse';
import { GmBadge } from '@/components/shared/GmBadge';

/**
 * « Épinglé sur » — liens vers les cartes où cette fiche est épinglée, avec la
 * position en mots (« north-west ») plutôt qu'en coordonnées. Rendu nul sans
 * épingle ; `label` (optionnel) coiffe la rangée d'un intitulé de section.
 */
export function PinnedOnMaps({
  characterId,
  locationId,
  label,
}: {
  characterId?: string;
  locationId?: string;
  label?: string;
}) {
  const navigate = useNavigate();
  const spaceId = useAppStore((s) => s.session?.space.id);
  // Charge la liste des cartes pour les fiches qui ne la montent pas déjà —
  // la variante SANS balayage offline : une fiche n'a aucune raison de
  // déclencher le téléchargement des images de toutes les cartes.
  useMapsData(spaceId);
  const hits = useEntityPins(spaceId, { characterId, locationId });
  if (hits.length === 0) return null;
  const row = (
    <div className="flex flex-wrap gap-2">
      {hits.map(({ pin, map }) => (
        <button
          key={pin.id}
          className="btn-outline text-sm"
          title={pin.note || map.name}
          onClick={() => navigate(`/map/${map.id}`)}
        >
          <MapPin size={14} />
          {map.name} · {pinPosition(pin.x, pin.y)}
          {(pin.gm_only || map.gm_only) && <GmBadge />}
        </button>
      ))}
    </div>
  );
  if (!label) return row;
  return (
    <div className="mt-5">
      <h4 className="label-overline mb-2">{label}</h4>
      {row}
    </div>
  );
}
