import type { CSSProperties } from 'react';

/**
 * Pictogramme « tampon » Stonetop — éléments graphiques de Jason Lutes
 * (CC BY 4.0, voir NOTICE.md). Les PNG de src/assets/stonetop sont des
 * masques alpha (encre → opaque) : rendus via mask-image + fond
 * currentColor, ils se teintent comme n'importe quel glyphe.
 *
 * Sans `size`, la taille vient du CSS (`.stamp-icon`, 28px par défaut) —
 * même contrat que les anciens SVG inline dont les consommateurs (ex.
 * chronicles.css) redimensionnent le pictogramme par sélecteur.
 */
export function StampIcon({
  src,
  size,
  className,
  style,
}: {
  /** URL du masque (import Vite d'un PNG de src/assets/stonetop). */
  src: string;
  /** Taille en px ; omise, le CSS décide. */
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const mask: CSSProperties = {
    maskImage: `url(${src})`,
    WebkitMaskImage: `url(${src})`,
    ...(size != null ? { width: size, height: size } : null),
    ...style,
  };
  return <span aria-hidden="true" className={`stamp-icon ${className ?? ''}`} style={mask} />;
}
