import { memo, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, EyeOff } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAppStore } from '@/stores/appStore';
import { FALLBACK_LOCATION_COLOR } from '@/lib/constants';
import { useT, type TKey } from '@/i18n';
import { StampIcon } from '@/components/shared/StampIcon';
import { PLAYBOOK_ICONS } from '@/components/character/playbookIcons';
import { monsterKindIcon } from '@/components/character/monsterKindIcons';
import { DISCOVERY_KINDS, getDiscoveryKind } from '@/lib/character/discoveryKinds';
import { DISCOVERY_KIND_ICONS, DISCOVERY_UNFILED_ICON } from '@/components/character/discoveryKindIcons';
import { parseRole } from '@/lib/character/playbooks';
import { threatTypeName, threatTypeOf } from '@/lib/character/threatTypes';
import { tagsApply } from '@/lib/character/statblock';
import { normalizeThreatSheet } from '@/lib/character/threatSheet';
import { instinctOf, instinctVisible } from '@/lib/character/instinct';
import { useIsGm } from '@/hooks/useRole';
import { DriveLine } from '@/components/character/DriveLine';
import closedStamp from '@/assets/stonetop/chapter-circle.png';
import entityCharacterStamp from '@/assets/stonetop/entity-character.png';
import entityGroupStamp from '@/assets/stonetop/entity-group.png';
import menaceStamp from '@/assets/stonetop/menace.png';
import type { Character } from '@/types';
import type { MatchExplanation } from '@/lib/character/characterSearch';


interface CharacterCardProps {
  character: Character;
  /**
   * Why this card is here, when the search matched on PROSE (notes, GM notes,
   * threat sheet, stats) — that is, on something the card does not paint.
   * Absent the rest of the time: a match on the name or the role is visible by
   * itself, and commenting on it would be noise.
   */
  match?: MatchExplanation;
  /**
   * The location, in the corner by the name. `false` on a location's own
   * sheet: all its residents are there by definition, and the corner would
   * repeat the same word on every card in the grid.
   */
  showPlace?: boolean;
}


const animatedIds = new Set<string>();

const MATCH_LABELS: Record<MatchExplanation['field'], TKey> = {
  notes: 'dashboard.matchNotes',
  gmNotes: 'dashboard.matchGmNotes',
  threat: 'dashboard.matchThreat',
  stats: 'dashboard.matchStats',
};

function CharacterCardBase({ character, match, showPlace = true }: CharacterCardProps) {
  const t = useT();
  // A targeted selector: the card only re-renders when the locations change,
  // not on every store mutation (toast, search…). Combined with the memo below,
  // typing in the grimoire's search no longer re-renders all 50 cards.
  const locations = useAppStore((s) => s.locations);
  const isGm = useIsGm();

  const loc = character.location
    ? locations.find((l) => l.id === character.location)
    : undefined;
  const locationColor = loc?.color ?? FALLBACK_LOCATION_COLOR;
  const locationName = loc?.name;

  const alreadyAnimated = animatedIds.has(character.id);
  if (!alreadyAnimated) animatedIds.add(character.id);

  // Stamp by type: playbook (PC) via `role`; bestiary category
  // (statblock.kind) for a character that is genuinely a MONSTER; otherwise the
  // exclamation (MENACE) or the group stamp. The neutral category gets nothing.
  //
  // THIS is what carries the type now that the PJ/PNJ/GROUPE/MENACE chips have
  // left the name line: a PC whose `role` does not start with a known playbook
  // (free text) fell through every branch and came out with NO stamp — at which
  // point the card said nothing at all about its type. It falls back to the
  // entity stamp.
  //
  // What separates a PC from the rest is the INK, not a colour: full ink
  // (`--text-primary`) for a PC, softened ink (`--text-secondary`) for the
  // rest. That is already what the old "PC" chip said, the only one of the set
  // to be a slab of black ink — and a difference in value holds up on parchment
  // where gold (`--graph-accent-pc`, borrowed from the graph) clashed with the
  // page and read as decoration.
  //
  // (There was a paragraph here saying "the threats' plum stays". It does not:
  // a MENACE moved to full ink — see why under the derivation. The comment had
  // outlived its code and asserted the opposite, which is worse than no comment
  // at all.)
  // A discovery's stamp is its SUBTYPE. Softened ink like every ordinary
  // entry: the tints are spent — ochre for a PC, plum for a threat — and
  // spending a third on discoveries would leave the grid with no neutral to
  // read the accents against.
  const discoveryKind = character.type === 'DISCOVERY'
    ? getDiscoveryKind(character.role)
    : null;
  const playbook = character.type === 'PJ' ? parseRole(character.role).playbook : null;
  const kindIcon = monsterKindIcon(character);
  const stamp = character.type === 'DISCOVERY'
    ? {
        src: discoveryKind ? DISCOVERY_KIND_ICONS[discoveryKind] : DISCOVERY_UNFILED_ICON,
        color: 'var(--text-secondary)',
      }
    : character.type === 'PJ'
    ? { src: playbook ? PLAYBOOK_ICONS[playbook] : entityCharacterStamp, color: 'var(--pc-accent)' }
    : character.type === 'MENACE'
      ? { src: kindIcon ?? menaceStamp, color: 'var(--gm-accent)' }
      : kindIcon
        ? { src: kindIcon, color: 'var(--text-secondary)' }
        : character.type === 'GROUPE'
          ? { src: entityGroupStamp, color: 'var(--text-secondary)' }
          : { src: entityCharacterStamp, color: 'var(--text-secondary)' };

  // EVERY entry carries a stamp, an ordinary NPC included. I had removed the
  // NPC's on the grounds that 8 identical busts out of 12 were wallpaper —
  // that was a misjudgement: on screen an empty gutter does not read as
  // restraint, it reads as an unfinished card, and the book does stamp its
  // "human individual". The grid needs to be COMPLETE before it
  // is frugal.
  //
  // The TINTS carry the type, one per family: OCHRE for a PC (--pc-accent),
  // PLUM for a threat (--gm-accent), softened ink for everything ordinary.
  // Three signals, readable without reading the glyph.
  //
  // Not the graph's gold (--graph-accent-pc): tried, rejected twice, and
  // rightly so — it is calibrated to sit on a node's fill, and on parchment it
  // reads as metal. The ochre is that same gold taken to ink, so it joins the
  // family of accents instead of glinting beside it.
  //
  // I had moved the threat to full ink, on the grounds that two plums touched
  // on a gm_only threat. That was wrong on three counts, and it removed the
  // ONLY tint from the stamp set: the icon column became two greys, and the
  // type no longer read at a glance.
  //   1. Plum for a threat is the app's EXISTING convention — the sheet's type
  //      chip still uses it. The card should align with the sheet, not the
  //      other way round.
  //   2. The GM mark became an eye GLYPH, no longer a text chip: an eye and an
  //      exclamation cannot be confused, so the shape disambiguates where two
  //      slabs of plum text did not.
  //   3. --danger is not the fallback: it is already spent on this card by the
  //      fallen doom (red chips). Spending it on EVERY threat would dilute the
  //      card's only real alarm.

  // State — what has CHANGED for the entry, in the place the type chips used
  // to occupy. A threat carries its sheet's progress (ticked portents, or the
  // fallen doom); everything else carries its exit from play.
  // normalizeThreatSheet and NOT the raw block: `character.threat` can be an
  // object missing whole keys (sheets from before the 2026-07 rework, restored
  // revisions) — a `threat?.portents.filter(...)` dies on those, the optional
  // only covering `threat`. This is the block's permanent read boundary, the
  // same one the sheet uses (seedThreat).
  const threat = character.type === 'MENACE' && character.threat
    ? normalizeThreatSheet(character.threat)
    : null;
  const portentsDone = threat?.portents.filter((p) => p.done).length ?? 0;
  const portentsTotal = threat?.portents.length ?? 0;
  const instinct = instinctVisible(character, isGm) ? instinctOf(character) : '';
  const doomFallen = !!threat?.impendingDoom.done;

  // "3/4" beside a name did not say WHAT the fraction was of — it was
  // unreadable without its tooltip, and a tooltip does not exist under a
  // finger. Two changes: a label spelled out, and filled/empty PIPS instead of
  // the quotient. Pips are already the app's progress vocabulary (the steading
  // tracks: "Pull Together ×5 ☑☐☐☐☐"), so we invent nothing — we reuse what the
  // reader already knows how to read.
  const portents = portentsTotal > 0
    ? { done: doomFallen ? portentsTotal : portentsDone, total: portentsTotal, doomFallen }
    : null;

  // Left play. Never on a MENACE, even if the column carries it: the checkbox
  // is not offered for that type (a restored revision can still resurrect the
  // value — we let it sleep rather than read it).
  // Never on a DISCOVERY either: the checkbox is not offered for that type,
  // AND `chapter-circle` is the unfiled-discovery stamp — two of them on one
  // card would say nothing twice.
  //
  // A pressed STAMP, no longer a chip. Removing the old chip's frame had fixed
  // nothing: the "corporate" tell was not the box but the VOICE — caps + wide
  // tracking + tiny sans-serif IS the badge vocabulary, frame or no frame. The
  // seal (chapter-circle, Jason Lutes) speaks the product's language and says
  // nothing in capitals.
  //
  // The word survives for anyone without the image: `title` on hover and an
  // `sr-only` text for screen readers, because StampIcon is aria-hidden.
  const gone = character.dead && character.type !== 'MENACE' && character.type !== 'DISCOVERY'
    ? (character.type === 'GROUPE' ? t('character.disbanded') : t('character.deceased'))
    : null;

  // The definition line: the threat type takes the role's place (a MENACE has
  // none), a discovery's SUBTYPE takes it in the reader's words rather than
  // the stored id ("arcanum" is a column value, "Arcanum" is a label), and
  // otherwise the role and then the tags when those are stats.
  const definition = [
    character.type === 'MENACE'
      ? threatTypeName(threatTypeOf(character))
      : character.type === 'DISCOVERY'
        ? (discoveryKind
            ? t(DISCOVERY_KINDS.find((k) => k.id === discoveryKind)!.labelKey as TKey)
            : t('character.typeDiscovery'))
        : character.role,
    ...(tagsApply(character) ? (character.tags ?? []) : []),
  ]
    .filter((it): it is string => !!it && it.trim() !== '')
    .join(', ');

  return (
    <motion.div
      initial={alreadyAnimated ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      // One short fade, all together: the indexed cascade (0.04s × rank)
      // stretched the grid's arrival and broke the system's ~0.2s rule — and
      // the `index` prop it required made every following card miss the memo on
      // the slightest filter change.
      transition={{ duration: alreadyAnimated ? 0 : 0.2, ease: 'easeOut' }}
      // Hover lifts, as everywhere else in the app (HomePage, LocationBanner).
      // I had replaced that with a darkening rule invoking "paper does not
      // levitate" — but a grimoire card must not behave differently from the
      // product's other cards, and the app's consistency comes before my
      // metaphor.
      className="group relative flex flex-col overflow-hidden card-paper card-accent-left p-5 transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-[0_18px_40px_-22px_rgba(28,22,14,0.3)] focus-within:ring-2 focus-within:ring-[var(--border-focus)] focus-within:ring-inset"
      // --ripple-span: how far the ripple CARRIES, not the size of its rings
      // (that is fixed, cf. index.css — enlarging them gave three big circles,
      // which is no longer a ripple).
      // 260px on a ~355 card: the motif reaches well past the original left
      // third (170) but dies out BEFORE the right edge. At 420 it covered
      // everything, and a ripple that covers everything is no longer an accent,
      // it is a background. It must keep a bank of bare paper to end on.
      // Bonus: the mask's seam in x falls at 200px, where the gradient is down
      // to ~23% instead of ~52% — so it fades out with it.
      // Local to the card: the other bearers of .card-accent-left are far
      // smaller and have nothing more to cover.
      style={{ '--card-accent': locationColor, '--ripple-span': '260px' } as CSSProperties}
    >
      {/* Full-card link to the sheet — a real <a> (keyboard + screen reader).
          The focus outline is carried by the card's `focus-within` border
          (otherwise clipped by overflow-hidden), not by the link itself. */}
      <Link
        to={`/character/${character.id}`}
        aria-label={character.name}
        className="absolute inset-0 z-[1] rounded-[inherit] focus:outline-none"
      />

      {/* Header: type stamp · name · marks (exit seal, GM eye) · arrow. The ↗
          arrow returns to its corner: I had removed it as a "generic tell", but
          the location banner and the sheet keep it, so the app ended up using it
          in exactly one place — a dissonance worse than either extreme.
          The marks are GLYPHS and no longer text chips: a 12px eye cannot wrap
          onto its own line the way spaced-caps "GM" did, which inflated the
          height of the whole row on 6 threat cards out of 9. */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* Stamp and name NEVER separate: in a shrinkable row the stamp went
              off alone on its line as soon as the name wrapped to the next — a
              pictogram orphaned above the thing it marks. */}
          <StampIcon src={stamp.src} size={24} className="flex-shrink-0" style={{ color: stamp.color }} />
          {/* 20px on phones, 24px from sm up: at 390px a 24px name broke into
              "The" / "Foreigner", an orphaned article, and every failing case
              came down to 3-8px — so it is the type scale that decides them. */}
          <h3 className="font-display text-xl sm:text-2xl font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-hover)] transition-colors leading-tight line-clamp-2 min-w-0">
            {character.name}
          </h3>
          {gone && (
            <span title={gone} className="flex-shrink-0 inline-flex items-center">
              {/* 15px and --text-secondary, not 13px muted: at 13px the seal set
                  beside a 24px name read as a stray dot, not as a mark. "This
                  person is dead" is campaign information; it is entitled to its
                  presence. */}
              <StampIcon src={closedStamp} size={15} style={{ color: 'var(--text-secondary)' }} />
              <span className="sr-only">{gone}</span>
            </span>
          )}
          {character.gm_only && (
            <span title={t('gm.badge')} className="flex-shrink-0 inline-flex items-center">
              <EyeOff size={13} style={{ color: 'var(--gm-accent)' }} aria-hidden="true" />
              <span className="sr-only">{t('gm.badge')}</span>
            </span>
          )}
        </div>
        <ArrowUpRight
          size={18}
          className="text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors flex-shrink-0 mt-1.5"
        />
      </div>

      {/* DEFINITION — what the entry IS: the role, then the tags when those are
          game stats (cf. tagsApply: monsters and followers). A MENACE has no
          role, its archetype IS its type; older sheets still carry text in the
          column, and we no longer display it.
          14px and FULL ink. The step is no longer made by size but by INK:
          definition in --text-primary, impressions a notch below in
          --text-secondary. That is enough, and it lets the card sit inside the
          dashboard's scale — search at 14px, tabs at 14px, chips at 12px. Tried
          at 16 and then 15, the card each time weighed more than the chrome
          around it: an index card is not a document, it has to fit into the
          page. */}
      {definition && (
        <p className="text-sm text-[var(--text-primary)] leading-snug mb-1.5 line-clamp-2">
          {definition}
        </p>
      )}

      {/* PORTENTS — the threat's progress, named and counted in pips. A bare
          "3/4" beside the name did not say what the fraction was of: it needed
          the tooltip, which does not exist under a finger. The label says it,
          and filled/empty pips read at a glance — that is already the steading
          tracks' progress vocabulary. Red once the doom has fallen: the only
          state on these cards that is an alarm, and it then fills every pip,
          which IS its meaning. */}
      {portents && (
        <p className="flex items-center gap-1.5 mb-1.5" title={`${portents.done}/${portents.total}`}>
          <span className="label-overline">{t('threat.portents')}</span>
          <span className="inline-flex items-center gap-[3px]" aria-hidden="true">
            {Array.from({ length: portents.total }, (_, i) => (
              <span
                key={i}
                className="w-[7px] h-[7px] rounded-full border"
                style={{
                  borderColor: portents.doomFallen ? 'var(--danger)' : 'var(--text-muted)',
                  backgroundColor: i < portents.done
                    ? (portents.doomFallen ? 'var(--danger)' : 'var(--text-muted)')
                    : 'transparent',
                }}
              />
            ))}
          </span>
          <span className="sr-only">{portents.done} / {portents.total}</span>
        </p>
      )}

      {/* IMPRESSIONS — "give up to 3 impressions about them" (Creating
          NPCs). It is the third step of NPC creation in the book,
          BEFORE the instinct, which is only an "as needed" detail: these traits
          are how you remember someone ("wears a wolf pelt"). They used to be
          the palest and lowest line on the card. They move up, and go from
          --text-muted to --text-secondary: muted fell to ~4.3:1 where the
          ripple is densest (left edge, the start of each line), below the AA
          threshold — see index.css:470. */}
      {character.type !== 'PJ' && character.traits && character.traits.length > 0 && (
        <p className="text-[0.8125rem] text-[var(--text-secondary)] leading-snug mb-1.5">
          {character.traits.slice(0, 3).map((tr) => tr.label).join(', ')}
          {character.traits.length > 3 && ` +${character.traits.length - 3}`}
        </p>
      )}

      {/* DRIVE — what the entry WANTS. Italic (the reading voice: this is a
          sentence, not an attribute) AND a label, which are the two axes
          separating it from the impressions just above. The label is what
          relieves the "to" prefix of doing double duty as grammar AND label:
          "to kill" alone did not tell the reader what they were reading.
          Who sees it: `instinctVisible` (lib/instinct), the SAME rule as the
          sheet — GM, or PC, or follower. No local guard: duplicated, it would
          drift. */}
      {instinct && (
        <DriveLine label={t('character.instinct')} className="mb-1.5">
          {t('character.instinctPrefix')} {instinct}
        </DriveLine>
      )}

      {/* Why this card — the snippet of prose that answered the search. Without
          it, widening the search to notes surfaces cards where the typed word is
          visible NOWHERE: the grid looks like it is lying. It moves to
          --text-secondary and to two lines: it was the palest line on the card
          when it is the one justifying the card's presence in the results —
          exactly the opposite of what is needed. */}
      {match && (
        <p className="text-sm italic text-[var(--text-secondary)] leading-snug line-clamp-2">
          <span className="label-overline not-italic mr-1.5">{t(MATCH_LABELS[match.field])}</span>
          {match.snippet.slice(0, match.start)}
          <strong className="font-semibold text-[var(--text-primary)]">
            {match.snippet.slice(match.start, match.end)}
          </strong>
          {match.snippet.slice(match.end)}
        </p>
      )}

      {/* LOCATION — a chip, exactly the one from the LOCATIONS filter row just
          above the grid (cf. DashboardPage:545): colour dot + label in legible
          ink, on an alternate background with a hairline border.
          Painting the LABEL in the location's colour was my mistake: those
          colours are chosen by the user as a landmark, not to carry text — the
          Stonetop grey (#9C9385) on parchment falls to ~2.6:1, unreadable. The
          chip keeps the colour coding (the dot carries it) and makes the word
          legible (--text-secondary, ~8.9:1).
          Nor is this a "corporate" badge: the state chip's fault was its VOICE
          (spaced caps in tiny sans), not its box. Here we are in normal case,
          and this is the location vocabulary the page already uses ten times
          just above.
          `mt-auto`: the slots above are all conditional while the grid aligns
          the heights — without it the location lands at a different y on every
          card and the eye has no line to settle on when scanning a row. This is
          what aligning the heights makes useful.
          z-[2] pour rester cliquable au-dessus du lien pleine carte. */}
      {showPlace && loc && locationName && (
        <div className="mt-auto pt-2">
          <Link
            to={`/location/${loc.id}`}
            className="relative z-[2] inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium font-body bg-[var(--bg-card-alt)] text-[var(--text-secondary)] border border-[var(--border-paper)] hover:border-[var(--border-field)] transition-colors"
          >
            <span
              aria-hidden
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: locationColor }}
            />
            {locationName}
          </Link>
        </div>
      )}
    </motion.div>
  );
}

export const CharacterCard = memo(CharacterCardBase);
