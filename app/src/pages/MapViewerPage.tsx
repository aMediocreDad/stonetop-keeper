import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MapPin as MapPinIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { Header } from '@/components/layout/Header';
import { MapCanvas } from '@/components/maps/MapCanvas';
import { PinMarker, pinIcon, pinKind } from '@/components/maps/PinMarker';
import { PinPopover } from '@/components/maps/PinPopover';
import { PinFormDialog, type PinFormSubmitData } from '@/components/maps/PinFormDialog';
import { GmBadge } from '@/components/shared/GmBadge';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { useAppStore } from '@/stores/appStore';
import { Toast } from '@/components/shared/Toast';
import { useMaps, useMapPins } from '@/hooks/useMaps';
import { useCharacters } from '@/hooks/useCharacters';
import { useLocations } from '@/hooks/useLocations';
import { useCanEdit } from '@/hooks/useRole';
import { db } from '@/lib/db';
import { useT } from '@/i18n';
import type { CampaignMap, MapPin } from '@/types';

export default function MapViewerPage() {
  const t = useT();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const canEdit = useCanEdit();
  const session = useAppStore((s) => s.session);
  const showToast = useAppStore((s) => s.showToast);
  const spaceId = session?.space.id;

  const { maps, fetchMaps } = useMaps(spaceId);
  const map = maps.find((m) => m.id === id);
  const { pins, pinsError, createPin, updatePin, deletePin } = useMapPins(spaceId, id);
  const { characters } = useCharacters(spaceId);
  const { locations } = useLocations(spaceId);

  useEffect(() => {
    if (!session) navigate('/');
  }, [session, navigate]);

  // Sait si le premier chargement des cartes du space est arrivé — permet de
  // distinguer "id inconnu" (redirection vers /maps) de "chargement en
  // cours" (arrivée directe sur l'URL, avant que le store soit peuplé).
  const [mapsLoaded, setMapsLoaded] = useState(false);
  // Panne réseau transitoire sur CE fetch initial : on l'affiche au lieu de
  // rediriger silencieusement vers /maps (mapsLoaded passerait à true avec
  // `map` toujours indéfini — voir rapport, finding review).
  const [mapsError, setMapsError] = useState(false);
  useEffect(() => {
    if (!spaceId) return;
    let cancelled = false;
    fetchMaps()
      .then(() => {
        if (!cancelled) setMapsError(false);
      })
      .catch((err) => {
        console.error('[Maps] fetchMaps failed:', err);
        if (!cancelled) setMapsError(true);
      })
      .finally(() => {
        if (!cancelled) setMapsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [spaceId, fetchMaps]);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);

  // Remise à zéro pendant le rendu quand l'image change (même pattern que
  // useMapPins) — pas dans l'effet (lint react-hooks/set-state-in-effect),
  // et sans flash : l'ancienne URL n'est jamais affichée pour la nouvelle image.
  // `updated_at` est inclus : un remplacement d'image EN PLACE (même
  // `image_path`) ne change ni id ni image_path/image_data côté client tant
  // que la nouvelle URL signée n'est pas revenue — sans lui, un onglet déjà
  // ouvert sur la carte ne redéclencherait jamais le refetch et garderait
  // les anciens octets affichés indéfiniment (voir effet ci-dessous).
  const imageIdentity = `${map?.id ?? ''}:${map?.image_path ?? ''}:${map?.image_data ?? ''}:${map?.updated_at ?? ''}`;
  const [prevImageIdentity, setPrevImageIdentity] = useState(imageIdentity);
  if (imageIdentity !== prevImageIdentity) {
    setPrevImageIdentity(imageIdentity);
    setImageUrl(null);
    setImageError(false);
  }

  // Deps réduites aux champs qui font réellement varier l'image (id + les
  // deux sources possibles + updated_at) plutôt que l'objet `map` entier —
  // une maj d'un autre champ (nom, description…) ne doit pas redéclencher un
  // fetch/re-signature d'URL. `updated_at` est transmis à `getMapImageUrl` :
  // c'est la clé de version du cache d'URL signée côté db.ts (voir son
  // commentaire) — sans lui ce cache ne verrait jamais qu'une image a été
  // remplacée en place et resservirait l'ancienne URL jusqu'à son TTL.
  const {
    id: mapId,
    space_id: mapSpaceId,
    image_path: mapImagePath,
    image_data: mapImageData,
    updated_at: mapUpdatedAt,
  } = map ?? {};
  useEffect(() => {
    if (!mapId || (!mapImagePath && !mapImageData)) return;
    let cancelled = false;
    // `space_id` is load-bearing even though it never changes for a given
    // map: it is half the key of the offline blob cache. Leaving it out made
    // every offline lookup miss and fall back to a signed URL that cannot
    // load without a connection.
    db.getMapImageUrl({
      id: mapId,
      space_id: mapSpaceId,
      image_path: mapImagePath,
      image_data: mapImageData,
      updated_at: mapUpdatedAt,
    } as CampaignMap)
      .then((url) => {
        if (!cancelled) setImageUrl(url);
      })
      .catch((err) => {
        console.error('[Maps] image load failed:', err);
        if (!cancelled) setImageError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [mapId, mapSpaceId, mapImagePath, mapImageData, mapUpdatedAt]);

  const [placing, setPlacing] = useState(false);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [pendingCoords, setPendingCoords] = useState<{ x: number; y: number } | null>(null);
  const [editingPin, setEditingPin] = useState<MapPin | null>(null);
  const [pendingDeletePin, setPendingDeletePin] = useState<MapPin | null>(null);

  if (!session) return null;

  if (!map) {
    // Échec réseau sur le fetch initial : on l'affiche plutôt que de
    // rediriger — `mapsLoaded` serait aussi passé à true (le `finally`
    // s'exécute dans tous les cas) et sans ce garde-fou on quitterait
    // silencieusement vers /maps sur une simple panne transitoire.
    if (mapsError) {
      return (
        <div className="min-h-screen flex flex-col">
          <Header />
          <main className="flex-1 flex items-center justify-center text-[var(--danger)] font-body text-sm px-4 text-center">
            {t('maps.viewError')}
          </main>
        </div>
      );
    }
    if (mapsLoaded) return <Navigate to="/maps" replace />;
    return (
      <div className="min-h-screen">
        <Header />
      </div>
    );
  }

  // La carte a disparu en cours de session (masquée/supprimée par le MJ) :
  // même traitement qu'un id inconnu — retour à la liste plutôt qu'un
  // viewer bloqué sur des épingles introuvables.
  if (pinsError === 'NOT_FOUND') return <Navigate to="/maps" replace />;

  const closePinForm = () => {
    setPendingCoords(null);
    setEditingPin(null);
  };

  // `data.gm_only` est absent pour les non-MJ (voir PinFormDialog) : on ne
  // le transmet à create/updatePin QUE quand la clé est présente, jamais en
  // reconstruisant un `false` — la simple présence de la clé venant d'un
  // joueur fait rejeter l'appel côté serveur.
  const handlePinSubmit = async (data: PinFormSubmitData) => {
    if (editingPin) {
      await updatePin(editingPin.id, {
        label: data.label,
        note: data.note,
        ...(data.gm_only !== undefined ? { gm_only: data.gm_only } : {}),
      });
    } else if (pendingCoords) {
      await createPin({
        x: data.x,
        y: data.y,
        character_id: data.character_id ?? null,
        location_id: data.location_id ?? null,
        label: data.label ?? null,
        note: data.note ?? null,
        ...(data.gm_only !== undefined ? { gm_only: data.gm_only } : {}),
        // Cast délibéré : le type de créatePin exige `gm_only: boolean`
        // (repris de MapPin), mais on omet volontairement la clé pour les
        // non-MJ (voir commentaire ci-dessus / CLAUDE.md du submodule).
      } as Omit<MapPin, 'id' | 'space_id' | 'map_id' | 'created_at' | 'updated_at'>);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 w-full max-w-[1600px] mx-auto px-3 sm:px-6 pt-4 sm:pt-6 pb-4 sm:pb-6 flex flex-col">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-3 sm:mb-4 flex items-center gap-3"
        >
          <button
            onClick={() => navigate('/maps')}
            className="p-2 -ml-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors flex-shrink-0"
            title={t('character.backToGrimoire')}
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="label-overline">{t('maps.overline')}</p>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[var(--text-primary)] leading-none truncate inline-flex items-center gap-2">
              {map.name}
              {map.gm_only && <GmBadge />}
            </h1>
          </div>
          {/* Lieu associé — navigation retour vers la fiche (pendant de
              MapsOfPlace côté fiche de lieu). */}
          {(() => {
            const linked = map.location_id
              ? locations.find((l) => l.id === map.location_id)
              : undefined;
            if (!linked) return null;
            return (
              <button
                onClick={() => navigate(`/location/${linked.id}`)}
                className="btn-outline text-sm flex-shrink-0"
                title={linked.name}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: linked.color }}
                />
                {t('maps.sheetButton')}
              </button>
            );
          })()}
        </motion.div>

        {/*
          Hauteur BORNÉE (pas seulement `min-h`) : l'image de la carte, en
          layout normal sous le `transform: scale()` de react-zoom-pan-pinch,
          contribue sa taille NATURELLE (ex. 3000×2000) à ses ancêtres tant
          qu'aucun d'eux n'a de hauteur définie — contrairement au canvas de
          SigmaGraph (GraphViewPage) qui se dimensionne lui-même sur son
          conteneur et n'exerce jamais cette pression ascendante. Un simple
          `min-h-[500px]` (comme GraphViewPage) ne suffit donc PAS ici : sans
          hauteur définie quelque part, `overflow-hidden` n'a rien de concret
          contre quoi clipper et toute la page grandit/scrolle. `h-[calc(...)]`
          fixe cette hauteur indépendamment du contenu.

          PAS de `flex-1` sur ce même élément : `flex-1` = `flex-basis: 0%`,
          qui fait ignorer `height` par l'algorithme flex (le flex-basis
          prévaut sur `height` dès qu'il n'est pas `auto`) — la hauteur
          explicite était donc silencieusement neutralisée et la boîte
          regrandissait quand même au contenu (vérifié en Playwright : la
          page scrollait encore avec `flex-1 h-[calc(...)]` combinés).

          -260px (pas -200px) : mesuré en Playwright sur plusieurs largeurs de
          viewport (375 → 2560px, nom de space/titre courts, état par défaut
          du Header), le chrome au-dessus/en-dessous de cette boîte (Header +
          ligne de titre + paddings de `main`) culmine à 246px aux largeurs
          ≥1024px — 260px laisse une marge de 14px. Un Header/titre
          significativement plus haut que dans ces mesures (nom de space très
          long qui wrap, future ligne d'état ajoutée au Header…) resterait à
          revérifier — même magic-constant fragile que `-180px` sur
          GraphViewPage, pas une garantie mathématique.
        */}
        <div
          className="card-paper overflow-hidden relative h-[calc(100dvh-260px)] min-h-[min(400px,78dvh)]"
          // Pas de menu contextuel natif sur la zone carte : un clic droit en
          // plein pan (ou un appui long tactile) ouvrait « Enregistrer
          // l'image »/« Retour » par-dessus la carte — parasite en pleine
          // partie et sans utilité ici. Couvre l'image, les épingles et le
          // fond du canvas.
          onContextMenu={(e) => e.preventDefault()}
        >
          {canEdit && (
            <button
              type="button"
              onClick={() => setPlacing((v) => !v)}
              aria-pressed={placing}
              className={`absolute top-3 left-3 z-10 inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-[var(--border-paper)] transition-colors shadow-sm text-xs font-body ${
                placing
                  ? 'bg-[var(--bg-card-alt)] text-[var(--text-primary)]'
                  : 'bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-alt)]'
              }`}
            >
              <MapPinIcon size={16} />
              <span className="hidden sm:inline">{t('maps.addPin')}</span>
            </button>
          )}

          {placing && (
            <div className="absolute top-3 right-3 z-10 px-2.5 py-1.5 rounded-md bg-[var(--bg-card)]/80 backdrop-blur border border-[var(--border-paper)] text-xs font-body text-[var(--text-muted)] pointer-events-none">
              {t('maps.placePinHint')}
            </div>
          )}

          {pinsError || imageError ? (
            <div className="absolute inset-0 flex items-center justify-center text-[var(--danger)] font-body text-sm px-4 text-center">
              {t('maps.viewError')}
            </div>
          ) : !map.image_path && !map.image_data ? (
            <div className="absolute inset-0 flex items-center justify-center text-[var(--text-muted)] font-body text-sm px-4 text-center">
              {t('maps.noImage')}
            </div>
          ) : imageUrl ? (
            <MapCanvas
              map={map}
              imageUrl={imageUrl}
              pins={pins}
              placing={placing}
              canEdit={canEdit}
              selectedPinId={selectedPinId}
              onSelectPin={setSelectedPinId}
              onPlacePin={(x, y) => {
                setPendingCoords({ x, y });
                setPlacing(false);
              }}
              onMovePin={(pinId, x, y) => {
                // L'optimiste de useMapPins re-fetch déjà en cas d'échec
                // (l'épingle revient à sa place) — sans message, ce snap-back
                // ressemble à un bug muet.
                updatePin(pinId, { x, y }).catch((err) => {
                  console.error('[Maps] move pin failed:', err);
                  showToast(t('common.saveError'));
                });
              }}
              renderMarker={(pin) => {
                const kind = pinKind(pin, characters);
                // Même lookup que PinPopover : nom de l'entité liée, utilisé
                // comme repli d'aria-label ET comme contenu de la puce
                // affichée au survol des épingles sans légende (voir
                // PinMarker). À défaut de nom (fiche supprimée, ou nom vide
                // malgré le schéma), repli sur un libellé générique — TOUJOURS
                // une chaîne (jamais undefined) pour garantir un aria-label
                // sur les épingles entité/groupe sans légende ET sans fiche
                // résolue. `maps.pinFallbackName` (singulier, "Pin"/"Épingle")
                // plutôt que les clés `dashboard.type*` (PLURIELLES — "NPCs",
                // "Groups" — grammaticalement fausses pour désigner UNE
                // épingle) : un seul repli universel, pas de distinction par
                // type de fiche.
                const entityName =
                  kind === 'location'
                    ? locations.find((l) => l.id === pin.location_id)?.name || t('character.location')
                    : kind === 'note'
                      ? undefined
                      : (characters.find((ch) => ch.id === pin.character_id)?.name ||
                        t('maps.pinFallbackName'));
                return (
                  <PinMarker
                    pin={pin}
                    kind={kind}
                    icon={pinIcon(pin, characters, locations)}
                    selected={selectedPinId === pin.id}
                    onClick={() => setSelectedPinId((prev) => (prev === pin.id ? null : pin.id))}
                    entityName={entityName}
                  />
                );
              }}
              renderPopover={(pin) => (
                <PinPopover
                  pin={pin}
                  characters={characters}
                  locations={locations}
                  canEdit={canEdit}
                  onEdit={() => setEditingPin(pin)}
                  onDelete={() => setPendingDeletePin(pin)}
                  onClose={() => setSelectedPinId(null)}
                />
              )}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[var(--text-muted)] font-body text-sm">
              {t('common.loading')}
            </div>
          )}
        </div>
      </main>

      {(pendingCoords || editingPin) && (
        <PinFormDialog
          characters={characters}
          locations={locations}
          pending={pendingCoords}
          editing={editingPin}
          onSubmit={handlePinSubmit}
          onClose={closePinForm}
        />
      )}

      <ConfirmDialog
        open={!!pendingDeletePin}
        onOpenChange={(open) => !open && setPendingDeletePin(null)}
        title={pendingDeletePin?.label || t('maps.deletePin')}
        description={t('maps.deletePinConfirm')}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={() => {
          if (pendingDeletePin) {
            const pinId = pendingDeletePin.id;
            if (selectedPinId === pinId) setSelectedPinId(null);
            deletePin(pinId).catch((err) => {
              console.error('[Maps] delete pin failed:', err);
              showToast(t('common.saveError'));
            });
          }
          setPendingDeletePin(null);
        }}
      />

      <Toast />
    </div>
  );
}
