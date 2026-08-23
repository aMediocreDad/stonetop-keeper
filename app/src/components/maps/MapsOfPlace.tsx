import { useNavigate } from 'react-router-dom';
import { Map as MapIcon } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useMapsData } from '@/hooks/useMaps';
import { GmBadge } from '@/components/shared/GmBadge';
import { useT } from '@/i18n';

/** « Cartes de ce lieu » — liens vers les cartes liées à cette Location. */
export function MapsOfPlace({ locationId }: { locationId: string }) {
  const t = useT();
  const navigate = useNavigate();
  const spaceId = useAppStore((s) => s.session?.space.id);
  const { maps } = useMapsData(spaceId);
  const linked = maps.filter((m) => m.location_id === locationId);
  if (linked.length === 0) return null;
  // Rangée nue (pas de carte) : une seule carte s'affiche « Carte » (le nom
  // reste en infobulle) ; plusieurs cartes gardent leurs noms pour se distinguer.
  return (
    <div className="flex flex-wrap gap-2">
      {linked.map((m) => (
        <button
          key={m.id}
          className="btn-outline text-sm"
          title={m.name}
          onClick={() => navigate(`/map/${m.id}`)}
        >
          <MapIcon size={14} />
          {linked.length === 1 ? t('maps.mapButton') : m.name}
          {m.gm_only && <GmBadge />}
        </button>
      ))}
    </div>
  );
}
