interface LogoProps {
  /** Taille relative. La taille réelle (carrée) est gérée en CSS (responsive). */
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Logo Ink & Stone (tampon encré). Rendu comme masque alpha teinté
 * `currentColor` (encre `--text-primary` / #1B1B1B) via la classe `.logo-mark`
 * — même couche d'encre que `.band-knot` / `.stamp-icon`, au lieu d'un PNG noir
 * plat posé sur le papier. Tailles volontairement discrètes (« quiet ») :
 *
 *   - sm  : marque du header (Header.tsx), 72 px sur desktop ; réduite en
 *           dessous pour ne pas chevaucher la frise du header mobile (80 px).
 *   - md  : version intermédiaire.
 *   - lg  : marque « héro » (HomePage centré), grande — c'est l'identité,
 *           l'encre teintée porte la taille sans être « trop ».
 */
export function Logo({ size = 'md' }: LogoProps) {
  // Pictogramme carré (512×512) : on fixe hauteur = largeur.
  const sizeClass =
    size === 'sm'
      ? 'w-14 h-14 sm:w-16 sm:h-16 md:w-[72px] md:h-[72px]'
      : size === 'lg'
        ? 'w-28 h-28 sm:w-32 sm:h-32 md:w-36 md:h-36'
        : 'w-[72px] h-[72px] sm:w-20 sm:h-20 md:w-[88px] md:h-[88px]';

  return (
    <span
      role="img"
      aria-label="Ink & Stone"
      className={`logo-mark ${sizeClass} select-none`}
    />
  );
}
