import { Search, RotateCcw, Pause, Play, MapPin } from 'lucide-react';
import type { Location } from '@/types';
import { RELATION_TYPES } from '@/lib/constants';
import { FALLBACK_LOCATION_COLOR } from '@/lib/constants';
import { DISCOVERY_NODE_COLOR, MENACE_NODE_COLOR } from '@/lib/graphPalette';
import { byName } from '@/lib/sortByName';
import { useT } from '@/i18n';
import type { ForceSettings } from './forceSettings';
import { FORCE_BOUNDS } from './forceSettings';

interface Props {
  search: string;
  onSearchChange: (s: string) => void;


  locations: Location[];
  visibleLocationIds: Set<string>;
  showSansLieu: boolean;
  onToggleLocation: (id: string) => void;
  onToggleSansLieu: () => void;
  onSelectAllLocations: () => void;
  onClearLocations: () => void;


  showPJ: boolean;
  showPNJ: boolean;
  onTogglePJ: () => void;
  onTogglePNJ: () => void;
  showGroups: boolean;
  onToggleGroups: () => void;
  showThreats: boolean;
  onToggleThreats: () => void;
  showDiscoveries: boolean;
  onToggleDiscoveries: () => void;


  visibleRelationTypeIds: Set<string>;
  onToggleRelationType: (id: string) => void;

  
  forces: ForceSettings;
  onForcesChange: (f: ForceSettings) => void;
  onReseed: () => void;

  
  visibleCharCount: number;
  totalCharCount: number;
  visibleRelCount: number;
}


export function GraphFiltersSidebar({
  search,
  onSearchChange,
  locations,
  visibleLocationIds,
  showSansLieu,
  onToggleLocation,
  onToggleSansLieu,
  onSelectAllLocations,
  onClearLocations,
  showPJ,
  showPNJ,
  onTogglePJ,
  onTogglePNJ,
  showGroups,
  onToggleGroups,
  showThreats,
  onToggleThreats,
  showDiscoveries,
  onToggleDiscoveries,
  visibleRelationTypeIds,
  onToggleRelationType,
  forces,
  onForcesChange,
  onReseed,
  visibleCharCount,
  totalCharCount,
  visibleRelCount,
}: Props) {
  const t = useT();
  const tx = t as (k: string, params?: Record<string, string | number>) => string;
  return (
    <aside className="w-full h-full card-paper p-5 overflow-y-auto">
      {/* Search */}
      <div className="relative mb-5">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('graph.searchPlaceholder')}
          aria-label={t('graph.searchPlaceholder')}
          className="field-paper text-sm pl-9 h-9"
        />
      </div>

      {/* Compteur */}
      <p className="text-xs font-body text-[var(--text-muted)] mb-5">
        {t('graph.visibleCount', {
          visible: visibleCharCount,
          total: totalCharCount,
          rels: visibleRelCount,
        })}
      </p>

      {/* Lieux */}
      <Section
        title={t('graph.sectionLocations')}
        actions={
          <>
            <SubAction onClick={onSelectAllLocations}>{t('graph.selectAll')}</SubAction>
            <SubAction onClick={onClearLocations}>{t('graph.selectNone')}</SubAction>
          </>
        }
      >
        <FilterRow
          color={FALLBACK_LOCATION_COLOR}
          label={t('graph.noLocation')}
          checked={showSansLieu}
          onClick={onToggleSansLieu}
        />
        {locations.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] italic font-body py-1 pl-1">
            {t('graph.noLocationDefined')}
          </p>
        ) : (
          [...locations].sort(byName).map((loc) => (
            <FilterRow
              key={loc.id}
              color={loc.color}
              label={loc.name}
              checked={visibleLocationIds.has(loc.id)}
              onClick={() => onToggleLocation(loc.id)}
            />
          ))
        )}
      </Section>

      {/* Type — swatches sur les MÊMES tokens que le canvas (SigmaGraph les
          résout au runtime) : les hex figés ici ne correspondaient déjà plus
          aux couleurs réelles et désynchroniseraient au premier retune. Le
          remplissage PJ/PNJ est identique (couleur de lieu ou défaut) — seul
          le liseré doré distingue les PJ, ce que `ring` montre. */}
      <Section title={t('graph.sectionType')}>
        <FilterRow
          color="var(--graph-node-default)"
          label={t('graph.typePC')}
          checked={showPJ}
          onClick={onTogglePJ}
          ring
        />
        <FilterRow
          color="var(--graph-node-default)"
          label={t('graph.typeNPC')}
          checked={showPNJ}
          onClick={onTogglePNJ}
        />
        <FilterRow
          color="var(--graph-accent-group)"
          label={t('graph.typeGroup')}
          checked={showGroups}
          onClick={onToggleGroups}
        />
        <FilterRow
          color={MENACE_NODE_COLOR}
          label={t('graph.typeThreat')}
          checked={showThreats}
          onClick={onToggleThreats}
        />
        <FilterRow
          color={DISCOVERY_NODE_COLOR}
          label={t('graph.typeDiscovery')}
          checked={showDiscoveries}
          onClick={onToggleDiscoveries}
        />
      </Section>

      {/* Relations */}
      <Section title={t('graph.sectionRelationTypes')}>
        {RELATION_TYPES.map((rt) => (
          <FilterRow
            key={rt.id}
            color={rt.color}
            label={rt.labelKey ? tx(rt.labelKey) : rt.label}
            checked={visibleRelationTypeIds.has(rt.id)}
            onClick={() => onToggleRelationType(rt.id)}
          />
        ))}
      </Section>

      {/* Forces — sliders Obsidian (1:1) */}
      <Section title={t('graph.sectionForces')}>
        <Slider
          label={t('graph.centerForce')}
          value={forces.centerForce}
          {...FORCE_BOUNDS.centerForce}
          onChange={(v) => onForcesChange({ ...forces, centerForce: v })}
        />
        <Slider
          label={t('graph.repelForce')}
          value={forces.repelForce}
          {...FORCE_BOUNDS.repelForce}
          onChange={(v) => onForcesChange({ ...forces, repelForce: v })}
        />
        <Slider
          label={t('graph.linkForce')}
          value={forces.linkForce}
          {...FORCE_BOUNDS.linkForce}
          onChange={(v) => onForcesChange({ ...forces, linkForce: v })}
        />
        <Slider
          label={t('graph.linkDistance')}
          value={forces.linkDistance}
          {...FORCE_BOUNDS.linkDistance}
          onChange={(v) => onForcesChange({ ...forces, linkDistance: v })}
        />
      </Section>

      {/* Actions */}
      <div className="flex gap-2 mt-6">
        <button
          onClick={() => onForcesChange({ ...forces, frozen: !forces.frozen })}
          className="flex-1 btn-outline h-9 text-xs"
          title={forces.frozen ? t('graph.resume') : t('graph.freeze')}
        >
          {forces.frozen ? (
            <>
              <Play size={13} /> {t('graph.resume')}
            </>
          ) : (
            <>
              <Pause size={13} /> {t('graph.freeze')}
            </>
          )}
        </button>
        <button
          onClick={onReseed}
          className="flex-1 btn-outline h-9 text-xs"
          title={t('graph.reorganize')}
        >
          <RotateCcw size={13} /> {t('graph.reorganize')}
        </button>
      </div>

      {/* Légende couleurs nœuds */}
      <div className="mt-6 pt-4 border-t border-[var(--border-subtle)]">
        <p className="label-overline mb-2 inline-flex items-center gap-1.5">
          <MapPin size={11} /> {t('graph.legendNode')}
        </p>
        <p className="text-xs font-body text-[var(--text-muted)] leading-snug">
          {t('graph.legendText')}
        </p>
      </div>
    </aside>
  );
}



function Section({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5">
      <div className="flex items-center justify-between mb-1.5">
        <h4 className="label-overline">{title}</h4>
        {actions && <div className="flex gap-1">{actions}</div>}
      </div>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

function SubAction({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-body text-xs uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors px-1"
    >
      {children}
    </button>
  );
}

function FilterRow({
  color,
  label,
  checked,
  onClick,
  ring,
}: {
  color: string;
  label: string;
  checked: boolean;
  onClick: () => void;
  ring?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm font-body text-left transition-colors ${
        checked
          ? 'text-[var(--text-primary)] bg-[var(--bg-card-alt)]/60'
          : 'text-[var(--text-muted)] opacity-60 hover:opacity-100'
      }`}
    >
      <span
        aria-hidden
        className={`w-3 h-3 rounded flex-shrink-0 ${
          ring ? 'ring-2 ring-offset-1 ring-[var(--graph-accent-pc)]' : ''
        }`}
        style={{ backgroundColor: color }}
      />
      <span className="flex-1 truncate">{label}</span>
      <span
        className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center flex-shrink-0 ${
          checked
            ? 'bg-[var(--accent-primary)] border-[var(--accent-primary)]'
            : 'border-[var(--border-paper)]'
        }`}
      >
        {checked && (
          <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
            <path
              d="M2 5L4 7L8 3"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
    </button>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  // Précision d'affichage : 2 décimales si step < 0.1, 1 si < 1, 0 sinon
  const decimals = step < 0.1 ? 2 : step < 1 ? 1 : 0;
  return (
    // <label> englobant : le range était annoncé « slider, 1.5 » sans nom.
    <label className="block mb-2">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-xs font-body text-[var(--text-secondary)]">{label}</span>
        <span className="text-xs font-mono text-[var(--text-muted)]">
          {value.toFixed(decimals)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-[var(--accent-primary)]"
      />
    </label>
  );
}
