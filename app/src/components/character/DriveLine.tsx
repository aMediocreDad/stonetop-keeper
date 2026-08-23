import type { ReactNode } from 'react';
import { StampIcon } from '@/components/shared/StampIcon';

/**
 * La ligne de MOBILE d'une carte : ce que l'entrée veut (instinct d'un PJ) ou
 * ce qui vient (fatalité d'une menace). C'est une phrase, pas un attribut —
 * d'où la voix de LECTURE (serif italique) là où le rôle et les traits
 * gardent la voix d'interface. Sans ça les trois faits d'une carte pesaient
 * pareil et se lisaient comme un seul bloc indistinct.
 *
 * Le tampon est OPTIONNEL, et c'est délibéré (principe 3 : l'ornement porte
 * du sens ou il n'apparaît pas). Un instinct s'ouvre déjà sur « to » — il se
 * distingue tout seul de la ligne de rôle au-dessus. Une fatalité, elle,
 * suit la ligne de type qui est DÉJÀ en italique : là le tampon prune est ce
 * qui sépare les deux, et il vaut son encre.
 *
 * Plafonné à deux lignes : une fatalité est du texte riche libre, et les
 * cartes d'une grille doivent garder la même hauteur de lecture.
 *
 * Le LIBELLÉ (`label`) nomme la fente. Sans lui, « to kill » ne dit pas au
 * lecteur qu'il lit un instinct : le préfixe « to » faisait à la fois la
 * grammaire et l'étiquette, et un élément ne fait qu'un seul travail. Le
 * libellé reprend le motif de la ligne de correspondance (.label-overline puis
 * la valeur) plutôt qu'un tampon — aucun glyphe du pack ne dit « ce que ça
 * veut », et lui en assigner le sens serait arbitraire.
 */
export function DriveLine({
  children,
  label,
  icon,
  iconColor,
  className = '',
}: {
  children: ReactNode;
  label?: string;
  icon?: string;
  iconColor?: string;
  className?: string;
}) {
  return (
    <p
      className={`flex items-start gap-1.5 text-[0.8125rem] italic text-[var(--text-secondary)] leading-snug ${className}`}
    >
      {icon && (
        <StampIcon
          src={icon}
          size={14}
          className="flex-shrink-0 mt-[0.2em]"
          style={{ color: iconColor ?? 'var(--text-muted)' }}
        />
      )}
      <span className="line-clamp-2">
        {label && <span className="label-overline not-italic mr-1.5">{label}</span>}
        {children}
      </span>
    </p>
  );
}
