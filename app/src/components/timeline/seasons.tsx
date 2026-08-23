import type { ReactNode } from 'react';
import type { Season } from '@/types';
import type { TKey } from '@/i18n';
import { StampIcon } from '@/components/shared/StampIcon';
import springStamp from '@/assets/stonetop/season-spring.png';
import summerStamp from '@/assets/stonetop/season-summer.png';
import autumnStamp from '@/assets/stonetop/season-autumn.png';
import winterStamp from '@/assets/stonetop/season-winter.png';

export const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];

/** Couleur d'accent par saison (définie dans chronicles.css). */
export const SEASON_COLOR: Record<Season, string> = {
  spring: 'var(--accent-spring)',
  summer: 'var(--accent-summer)',
  autumn: 'var(--accent-autumn)',
  winter: 'var(--accent-winter)',
};

/** Clés i18n du nom de chaque saison. */
export const SEASON_NAME_KEY: Record<Season, TKey> = {
  spring: 'chronicles.spring',
  summer: 'chronicles.summer',
  autumn: 'chronicles.autumn',
  winter: 'chronicles.winter',
};

/** Tampons officiels des saisons (Jason Lutes, CC BY 4.0 — voir NOTICE.md). */
export const SEASON_MARKS: Record<Season, ReactNode> = {
  spring: <StampIcon src={springStamp} />,
  summer: <StampIcon src={summerStamp} />,
  autumn: <StampIcon src={autumnStamp} />,
  winter: <StampIcon src={winterStamp} />,
};
