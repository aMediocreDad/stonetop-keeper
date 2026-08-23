import { ArrowUpRight, Pencil, Trash2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { GmBadge } from '@/components/shared/GmBadge';
import { useT } from '@/i18n';
import type { Character, Location, MapPin } from '@/types';
import { pinKind } from './PinMarker';

interface PinPopoverProps {
  pin: MapPin;
  characters: Character[];
  locations: Location[];
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

/**
 * Carte flottante sous l'épingle sélectionnée — rendue par MapCanvas dans le
 * même <KeepScale/> que le marqueur, donc à taille écran constante quel que
 * soit le zoom. `onClick` du conteneur stoppe la propagation pour ne pas
 * désélectionner (le clic sur l'image referme la sélection) ni déclencher le
 * pan de la carte. `onPointerDown` stoppe aussi la propagation : le popover
 * est rendu DANS le wrapper de drag de l'épingle (même <KeepScale/>), donc
 * sans ce stop, un pointerdown sur un bouton du popover serait vu par le
 * tracker de drag de MapCanvas (voir rapport Task 10, round 2).
 *
 * Offset vertical (`mt-5`, 20px) : ce popover et la puce de légende toujours
 * visible (`LABEL_CHIP_CLASS`, PinMarker) sont TOUS DEUX ancrés en
 * `top-full` sur des boîtes de même hauteur (28px, le badge rond centré —
 * pire cas d'une épingle entité AVEC légende). La puce, ENFANT du bouton du
 * marqueur, hérite du `translate(-50%,-50%)` de celui-ci (les transforms
 * CSS s'appliquent à tout le sous-arbre rendu), alors que ce popover est un
 * SIBLING du bouton (pas un enfant) dont le bloc englobant n'est PAS
 * transformé — les deux "top-full" ne partent donc pas du même point visuel,
 * d'où le chevauchement avec l'ancien `mt-2` (8px) : mesuré en Playwright à
 * −1px de marge (bas de la puce à 1px SOUS le haut du popover) avec une puce
 * d'environ 19px de haut. Cette hauteur de puce varie toutefois avec les
 * métriques réelles de la police (`font-body`) : mesurée à ~20.9px en
 * Chromium headless, ce qui ramenait la marge d'un premier correctif
 * (`mt-3.5`, 14px) à seulement 1.3px au lieu des 5px visés — mesuré, pas
 * supposé (voir rapport). `mt-5` (20px, +12px vs `mt-2`) redonne ~7px de
 * marge dans ce même test, avec un peu de jeu supplémentaire pour absorber
 * la variance de métriques de police entre environnements. Les épingles
 * "note" (bouton ancré par la pointe, `-translate-y-full`) ou sans légende
 * persistante ont une marge encore plus grande — sans risque, juste un
 * espace visuellement un peu plus généreux.
 */
export function PinPopover({
  pin,
  characters,
  locations,
  canEdit,
  onEdit,
  onDelete,
  onClose,
}: PinPopoverProps) {
  const t = useT();
  const navigate = useNavigate();
  const kind = pinKind(pin, characters);

  const entity =
    kind === 'location'
      ? locations.find((l) => l.id === pin.location_id)
      : characters.find((c) => c.id === pin.character_id);

  const sheetPath =
    kind === 'location' ? `/location/${pin.location_id}` : `/character/${pin.character_id}`;

  // Ancrage dérivé des coordonnées de l'épingle elle-même (0..1) : la boîte
  // fixe de 224px, toujours centrée et ouverte vers le bas, se faisait
  // rogner par l'`overflow-hidden` du viewer dès que l'épingle approchait un
  // bord — et ce popover est le SEUL chemin épingle → fiche. Près d'un bord
  // latéral on aligne le côté correspondant ; dans le tiers bas on ouvre vers
  // le haut. Pas de mesure DOM : pin.x/pin.y suffisent.
  const openUp = pin.y > 0.7;
  const xClass =
    pin.x < 0.25
      ? 'left-1/2 -translate-x-6'
      : pin.x > 0.75
        ? 'left-1/2 -translate-x-[calc(100%-1.5rem)]'
        : 'left-1/2 -translate-x-1/2';
  // Goutte "note" ancrée par la pointe : le glyphe monte AU-DESSUS du point —
  // ouvrir vers le haut demande donc une marge plus grande (mb-9) pour ne pas
  // recouvrir la goutte.
  const yClass = openUp ? (kind === 'note' ? 'bottom-full mb-9' : 'bottom-full mb-5') : 'top-full mt-5';

  return (
    <div
      className={`absolute ${yClass} ${xClass} card-paper p-3 w-56 text-left cursor-auto`}
      // Même écart que la puce de PinMarker : le glyphe des marqueurs centrés
      // grossit avec le zoom (`--pin-zoom`, voir PinScaleGuard) et déborde
      // sous la boîte du bouton — le popover s'écarte d'autant, du côté où il
      // s'ouvre. Les gouttes "note" grossissent vers le haut : rien à décaler.
      style={
        kind === 'note'
          ? undefined
          : openUp
            ? { bottom: 'calc(100% + (var(--pin-zoom, 1) - 1) * 13px)' }
            : { top: 'calc(100% + (var(--pin-zoom, 1) - 1) * 13px)' }
      }
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="min-w-0 flex-1">
          {kind === 'note' ? (
            <p className="font-display font-bold text-sm text-[var(--text-primary)] break-words">
              {pin.label}
            </p>
          ) : (
            <>
              <p className="font-display font-bold text-sm text-[var(--text-primary)] truncate">
                {entity?.name ?? '—'}
              </p>
              {pin.label && (
                <p className="text-xs text-[var(--text-muted)] font-body italic truncate">
                  {pin.label}
                </p>
              )}
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex-shrink-0 p-2 -m-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          aria-label={t('common.close')}
        >
          <X size={14} />
        </button>
      </div>

      {pin.gm_only && (
        <div className="mb-2">
          <GmBadge />
        </div>
      )}

      {kind === 'note' && pin.note && (
        <p className="text-xs text-[var(--text-secondary)] font-body whitespace-pre-wrap mb-2 max-h-32 overflow-y-auto">
          {pin.note}
        </p>
      )}

      {kind !== 'note' && (
        <button
          type="button"
          onClick={() => navigate(sheetPath)}
          className="btn-outline w-full text-xs py-1.5 mb-2"
        >
          {t('maps.openSheet')}
          <ArrowUpRight size={13} />
        </button>
      )}

      {canEdit && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="btn-outline flex-1 text-xs py-2"
            title={t('maps.editPin')}
            aria-label={t('maps.editPin')}
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="btn-outline flex-1 text-xs py-2 hover:text-[var(--danger)]"
            title={t('maps.deletePin')}
            aria-label={t('maps.deletePin')}
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
