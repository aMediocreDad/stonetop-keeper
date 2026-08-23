import { useT } from '@/i18n';
import { clampTrack, clampCount } from '@/lib/steading/steading';
import { StatTrack } from './StatTrack';
import { SurplusCounter } from './SurplusCounter';
import { DebilityToggles } from './DebilityToggles';
import fortunesStamp from '@/assets/stonetop/steading-fortunes.png';
import type { Steading } from '@/types';

interface SteadingQuickStatsProps {
  steading: Steading;
  onMutate: (producer: (cur: Steading) => Steading) => void;
}

export function SteadingQuickStats({ steading, onMutate }: SteadingQuickStatsProps) {
  const t = useT();
  const setStat = (key: 'fortunes' | 'population' | 'prosperity' | 'defenses') => (v: number) =>
    onMutate((s) => ({ ...s, stats: { ...s.stats, [key]: clampTrack(v) } }));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <StatTrack
          label={t('steading.fortunes')}
          value={steading.stats.fortunes}
          onChange={setStat('fortunes')}
          stamp={fortunesStamp}
        />
        <SurplusCounter
          label={t('steading.surplus')}
          value={steading.stats.surplus}
          onChange={(v) => onMutate((s) => ({ ...s, stats: { ...s.stats, surplus: clampCount(v) } }))}
        />
        <StatTrack label={t('steading.population')} value={steading.stats.population} onChange={setStat('population')} />
        <StatTrack label={t('steading.prosperity')} value={steading.stats.prosperity} onChange={setStat('prosperity')} />
        <StatTrack label={t('steading.defenses')} value={steading.stats.defenses} onChange={setStat('defenses')} />
      </div>
      <DebilityToggles
        value={steading.debilities}
        onChange={(deb) => onMutate((s) => ({ ...s, debilities: deb }))}
      />
    </div>
  );
}
