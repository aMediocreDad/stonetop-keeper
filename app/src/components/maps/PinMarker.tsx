import { MapPin as MapPinIcon, EyeOff } from 'lucide-react';
import { CharacterStamp, GroupStamp } from '@/components/shared/entityIcons';
import { StampIcon } from '@/components/shared/StampIcon';
import { playbookIcon } from '@/components/character/playbookIcons';
import steadingCover from '@/assets/stonetop/steading-cover.png';
import type { MapPin, Character, Location } from '@/types';

export type PinKind = 'character' | 'group' | 'location' | 'note';

// eslint-disable-next-line react-refresh/only-export-components -- petit helper colocalisé avec le composant qui le consomme (voir PinPopover/MapViewerPage).
export function pinKind(pin: MapPin, characters: Character[]): PinKind {
  if (pin.character_id) {
    const c = characters.find((ch) => ch.id === pin.character_id);
    return c?.type === 'GROUPE' ? 'group' : 'character';
  }
  if (pin.location_id) return 'location';
  return 'note';
}

/** Masque tampon spécifique de l'épingle (livret d'un PJ, couverture de la bourgade) ; null → icône du kind. */
// eslint-disable-next-line react-refresh/only-export-components -- même helper colocalisé que pinKind.
export function pinIcon(pin: MapPin, characters: Character[], locations: Location[]): string | null {
  if (pin.character_id) {
    const c = characters.find((ch) => ch.id === pin.character_id);
    return c ? playbookIcon(c) : null;
  }
  if (pin.location_id) {
    const l = locations.find((loc) => loc.id === pin.location_id);
    return l?.steading ? steadingCover : null;
  }
  return null;
}

// Classes de la puce de légende — commune aux deux formes de marqueur.
// `absolute` (pas dans le flux) : n'affecte jamais la boîte du bouton, donc
// n'affecte jamais le point d'ancrage (translate -1/2 du bouton) ni le calcul
// `top-full` du popover (PinPopover), que la puce soit visible ou non.
const LABEL_CHIP_CLASS =
  // Fond OPAQUE + 11px medium : sur une illustration chargée, un fond
  // translucide laissait les traits de la carte brouiller le texte.
  'absolute top-full left-1/2 -translate-x-1/2 mt-1 text-[11px] leading-tight font-body font-medium px-2 py-0.5 rounded border border-[var(--border-paper)] bg-[var(--bg-card)] text-[var(--text-primary)] whitespace-nowrap max-w-[180px] truncate shadow-sm';

/**
 * Marqueur d'épingle — taille écran constante (rendu sous le contre-scale de
 * MapCanvas, voir `PinScaleGuard`). Deux formes distinctes selon `kind`
 * (demande utilisateur : l'ancien rendu — pastille + goutte sous CHAQUE
 * épingle — était jugé encombrant) :
 * - goutte (`isDrop`) : une goutte classique unique (lucide `MapPin`), pointe
 *   ancrée exactement sur x/y (`-translate-y-full`). Épingles `note`, mais
 *   aussi les lieux « simples » (sans tampon de bourgade, non masqués MJ) —
 *   même rendu au pixel près, demande utilisateur.
 * - `character`/`group`/bourgade : le glyphe SEUL fait office de marqueur
 *   (tampon de livret pour un PJ, tampon d'entité sinon), CENTRÉ sur x/y
 *   (`-translate-y-1/2`), teinté par l'accent et détaché du dessin de la
 *   carte par un halo papier (drop-shadow) plutôt qu'une pastille.
 *
 * La légende (`pin.label`), quand définie, est TOUJOURS visible sous les
 * marqueurs d'entité — atténuée (70 %) au repos pour ne pas concurrencer la
 * carte, pleine au survol/focus/sélection. Les gouttes `note` n'affichent la
 * leur qu'au survol/sélection (demande utilisateur), comme le nom d'entité
 * des épingles sans légende (voir `entityName`).
 */
export function PinMarker({
  pin,
  kind,
  icon,
  selected,
  onClick,
  entityName,
}: {
  pin: MapPin;
  kind: PinKind;
  /** Masque tampon spécifique (livret d'un PJ, voir `pinIcon`) ; prime sur l'icône du `kind`, mais pas sur l'œil gm_only. */
  icon?: string | null;
  selected: boolean;
  onClick: () => void;
  /** Nom (ou repli de type) de l'entité liée — repli d'aria-label ET contenu de la puce affichée au survol quand l'épingle n'a pas de légende (voir PinPopover/MapViewerPage). */
  entityName?: string;
}) {
  const accentColor = pin.gm_only ? 'var(--gm-accent)' : 'var(--accent-primary)';
  const label = pin.label || undefined;
  // Lieu « simple » rendu en goutte, identique aux notes ; la bourgade garde
  // son tampon (`icon`) et les épingles masquées MJ leur œil (branche centrée).
  const isDrop = kind === 'note' || (kind === 'location' && !icon && !pin.gm_only);
  // Repli sur `entityName` seulement pour les épingles SANS légende — la
  // puce n'est alors montrée qu'au survol (`hoverOnly`), jamais en continu.
  // Les gouttes `note` suivent le même régime même avec une légende.
  const hoverOnly = !label || kind === 'note';
  const chipText = label ?? entityName;

  // Le glyphe grossit avec le zoom (facteur `--pin-zoom`, publié par
  // PinScaleGuard) ; la puce, elle, reste à taille constante — pour les
  // marqueurs centrés, elle doit donc s'écarter du débord bas du glyphe
  // scalé : (zoom - 1) × demi-hauteur du glyphe (26px/2). Les gouttes
  // grossissent depuis leur pointe (vers le haut), rien à décaler.
  const chipStyle = isDrop
    ? undefined
    : { top: 'calc(100% + (var(--pin-zoom, 1) - 1) * 13px)' };

  // Puce atténuée au repos (demande utilisateur : la légende permanente
  // écrasait la carte) ; pleine opacité dès que l'épingle intéresse.
  const labelChip = chipText && (
    <span
      style={chipStyle}
      className={`${LABEL_CHIP_CLASS} transition-opacity ${
        hoverOnly
          ? selected
            ? 'opacity-100'
            : 'opacity-0 pointer-events-none group-hover:opacity-100 group-focus-visible:opacity-100'
          : selected
            ? 'opacity-100'
            : 'opacity-70 group-hover:opacity-100 group-focus-visible:opacity-100'
      }`}
    >
      {chipText}
    </span>
  );

  if (isDrop) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        aria-label={pin.label || entityName}
        className={`group relative inline-block -translate-x-1/2 -translate-y-full drop-shadow transition-transform ${
          selected ? 'z-20 scale-110' : 'z-10'
        }`}
      >
        <MapPinIcon
          size={30}
          strokeWidth={2}
          // Glyphe atténué au repos (demande utilisateur : les épingles
          // pleines écrasaient la carte) ; opacité pleine dès l'intérêt.
          className={`transition-opacity ${
            selected
              ? 'opacity-100'
              : 'opacity-75 group-hover:opacity-100 group-focus-visible:opacity-100'
          }`}
          style={{
            color: accentColor,
            fill: 'var(--bg-card)',
            // Grossit depuis la POINTE (ancrée sur x/y) : le point visé ne
            // bouge pas, la goutte s'étend vers le haut.
            transform: 'scale(var(--pin-zoom, 1))',
            transformOrigin: '50% 100%',
          }}
        />
        {labelChip}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-label={pin.label || entityName}
      className={`group relative inline-block -translate-x-1/2 -translate-y-1/2 p-1 transition-transform ${
        selected ? 'z-20 scale-110' : 'z-10'
      }`}
    >
      <span
        // Même atténuation au repos que la goutte `note` (voir plus haut).
        className={`grid place-items-center transition-opacity ${
          selected
            ? 'opacity-100'
            : 'opacity-75 group-hover:opacity-100 group-focus-visible:opacity-100'
        }`}
        style={{
          color: accentColor,
          // Grossit depuis le centre (= le point d'ancrage du marqueur).
          transform: 'scale(var(--pin-zoom, 1))',
          // Halo papier multicouche : détache le glyphe du trait de la carte
          // sans pastille. Sur le wrapper (pas le masque) : un drop-shadow
          // posé sur l'élément masqué serait rogné par son propre masque.
          filter:
            'drop-shadow(0 0 1px var(--bg-card)) drop-shadow(0 0 1px var(--bg-card)) drop-shadow(0 0 4px var(--bg-card))',
        }}
      >
        {pin.gm_only ? (
          <EyeOff size={22} />
        ) : icon ? (
          <StampIcon src={icon} size={26} />
        ) : kind === 'location' ? (
          // Défensif : un lieu sans tampon ni masque MJ passe par `isDrop`.
          <MapPinIcon size={22} />
        ) : kind === 'group' ? (
          <GroupStamp size={26} />
        ) : (
          <CharacterStamp size={26} />
        )}
      </span>
      {labelChip}
    </button>
  );
}
