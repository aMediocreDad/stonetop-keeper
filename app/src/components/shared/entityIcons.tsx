import type { CSSProperties } from 'react';
import { StampIcon } from './StampIcon';
import entityCharacterStamp from '@/assets/stonetop/entity-character.png';
import entityGroupStamp from '@/assets/stonetop/entity-group.png';

interface EntityIconProps {
  size?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Tampons officiels par type d'entité (Jason Lutes, CC BY 4.0 — voir
 * NOTICE.md). Même contrat de props que les icônes lucide (`size`,
 * `className`) : interchangeables dans les tables kind → icône
 * (PinMarker, PinFormDialog, MentionList).
 */
export function CharacterStamp({ size = 28, className, style }: EntityIconProps) {
  return <StampIcon src={entityCharacterStamp} size={size} className={className} style={style} />;
}

export function GroupStamp({ size = 28, className, style }: EntityIconProps) {
  return <StampIcon src={entityGroupStamp} size={size} className={className} style={style} />;
}
