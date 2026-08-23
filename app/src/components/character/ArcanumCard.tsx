import type { ReactNode } from 'react';
import { RichText } from '@/components/shared/RichText';
import { StampIcon } from '@/components/shared/StampIcon';
import { PipTrack } from '@/components/character/PipTrack';
import { parseMoveBody } from '@/lib/character/discoveryBlock';
import { hasRichText } from '@/lib/character/threatSheet';
import { useCanEdit } from '@/hooks/useRole';
import { useT } from '@/i18n';
import { CheckBox } from '@/pages/CharacterSheetPage';
import type { ArcMove, DiscoveryBlock, Trait } from '@/types';

interface ArcanumCardProps {
  name: string;
  kind: 'artifact' | 'arcanum';
  tags: string[];
  block: DiscoveryBlock;
  requirements: Trait[];
  /** The glance description — TipTap HTML from `notes`. */
  notesHtml: string;
  /** The kind stamp, as a watermark. Stonetop ARTWORK is never in this repo
   *  (© Lucie Arnoux); this is the Jason Lutes CC BY 4.0 pack. */
  stamp: string;
  /**
   * Marking a charge/progress pip is play, not editing — it saves immediately
   * from THIS read-mode card (see CharacterSheetPage's `markTrack`), the same
   * way a requirement's tick already does. `index` into `block.tracks`.
   */
  onTrackChange: (index: number, marked: number) => void;
  /**
   * Ticking a consequence is play too, and saves immediately from THIS
   * read-mode card (see CharacterSheetPage's `toggleConsequence`) — unlike a
   * mystery's read-only ☐, which is gained through the sheet's editor rather
   * than tapped here. `index` into `block.consequences`.
   */
  onToggleConsequence: (index: number) => void;
}

/**
 * One face of the card. Same anatomy as `StatTrack`'s filigrane and the
 * sheet's own identity watermark: a full-bleed stamp in the top-right corner,
 * faded to 14% ink and feathered by a radial mask so its crop edge dissolves
 * into the paper rather than ending on a straight line.
 *
 * `overflow-hidden` sits on the face itself (and not on a dedicated layer, as
 * CharacterSheetPage needs for its location dropdown): this card holds no
 * popover, so there is nothing here that has to escape the box.
 *
 * NO 9-slice frame, on either face, and there is deliberately no prop to turn
 * one on — see the component doc.
 */
function CardFace({ stamp, children }: { stamp: string; children: ReactNode }) {
  return (
    <div data-card-face className="relative overflow-hidden card-paper p-6">
      <span
        aria-hidden="true"
        className="absolute -top-3 -right-3 pointer-events-none"
        style={{
          maskImage: 'radial-gradient(110% 110% at 100% 0%, black 40%, transparent 95%)',
          WebkitMaskImage: 'radial-gradient(110% 110% at 100% 0%, black 40%, transparent 95%)',
        }}
      >
        {/* 0.14, not 0.08. Measured during the Phase-1 gate: at 8% over paper
            whose own SVG grain has comparable amplitude the stamp sits below
            the noise floor and is undetectable unless you know which corner to
            look in. It stands in for the book card's illustration, which
            cannot be reproduced (Stonetop art is © Lucie Arnoux), so at 8% it
            was failing the only job it has. */}
        <StampIcon src={stamp} size={96} style={{ color: 'var(--text-primary)', opacity: 0.14 }} />
      </span>
      {children}
    </div>
  );
}

/**
 * The requirements for unlocking an arcanum's mysteries —
 * read-only here on purpose. The tickable copy is the `tag-pill` row on the
 * identity card, where a tick saves immediately because it is an act of play;
 * this face is the handout, and a handout is read, not operated.
 *
 * They print on the FRONT — the only face there is in Phase 1, but the rule
 * holds once there are two: "the front of an arcanum describes
 * what the PC can tell at a glance, PLUS the requirements for unlocking its
 * mysteries. The back shows those mysteries." (verbatim.)
 */
function Requirements({ items, label }: { items: Trait[]; label: string }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-4">
      <h4 className="label-overline mb-2">{label}</h4>
      <ul className="space-y-1 font-reading text-[0.95rem]">
        {items.map((requirement, index) => (
          <li key={index} className="flex gap-2">
            <span aria-hidden="true" className="text-[var(--text-muted)]">
              {requirement.checked ? '☑' : '☐'}
            </span>
            <span
              className={
                requirement.checked
                  ? 'line-through text-[var(--text-muted)]'
                  : 'text-[var(--text-primary)]'
              }
            >
              {requirement.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The book's card, in this app's hand. Sibling of ThreatSheetCard — same
 * mechanism (a paper card and a stamp watermark), different content.
 *
 * ONE FACE for an ARTIFACT, always. An arcanum earns a second when it has a
 * body for it (see below). The two faces do not share a title — the front of
 * the Red Scepter is "Red Scepter" and the back "Burning Hatred", the MOVE's
 * name. No flip either way: this design system does not do
 * spectacle.
 *
 * `tier` drives PROMINENCE rather than printing a badge — a minor arcanum is a
 * small card and a major one a half-page insert, so the minor
 * renders narrow and the major full-width. An artifact has no tier and takes
 * the width it is given.
 *
 * WHAT IS ON WHICH FACE is the book's own division, verbatim:
 * "The front of an arcanum describes what the PC can tell at a glance, plus
 * the requirements for unlocking its mysteries. The back shows those
 * mysteries, which can include custom moves, new options, followers, and
 * consequences." That generic rule never mentions tracks — Task 10 read it as
 * covering them and was wrong to. The Red Scepter's actual printed card
 * settles it: its charge row and its progress row both sit on the
 * FRONT, next to the moves that fill them, because a track is bookkeeping for
 * a front-of-card move rather than a reward unlocked by one. So front matter
 * is the glance description, the tags, the pre-unlock moves, the tracks AND
 * the requirements; the back stays mysteries and consequences only.
 *
 * THE BACK EXISTS NOW (Task 15, joined by consequences in Task 16) — for an
 * ARCANUM only, and then only when it has a body. It renders when
 * `kind === 'arcanum' AND (mysteries.length > 0 OR consequences.length > 0)`:
 * a panel with nothing under it would be worse than no panel at all, and
 * gating on either key merely being present was the near miss — both are
 * reachable through an MCP write or a restored revision with no real content
 * behind them.
 *
 * The `isArcanum` half is not decoration: both EDITORS for these two arrays
 * mount on `discoveryKind === 'arcanum'` alone (CharacterSheetPage), so
 * without it an arcanum re-typed to `artifact` kept a second face, a
 * "Mysteries of X" heading, and live consequence checkboxes writing into a
 * block no editor could reach. The orphaned keys are deliberately NOT
 * normalised away — re-type the row back to arcanum and its mysteries are
 * still there, which is this codebase's standing tolerate-the-stored-shape
 * rule (cf. an inert `follower` block on a MENACE).
 *
 * The "Mysteries of X" heading is narrower still, gated on `mysteries.length`
 * alone, so a back opened by consequences ALONE never prints that heading
 * over nothing (see ArcanumCard.test.tsx).
 *
 * `DiscoveryBlock.mysteries` is no longer write-only: the back reuses the
 * FRONT's own `moveBlock` renderer, so the two faces cannot drift, plus the
 * book's read-only ☐ beside each name (`ArcMove.gained`) — read-only because
 * a mystery is gained through the sheet's editor, not by tapping the card,
 * unlike a track or a consequence (Task 16), both of which change
 * mid-session and so tick from THIS read-mode card instead.
 *
 * NEITHER FACE IS FRAMED, and that is a decision rather than an omission.
 * Both 9-slice assets bake `--gm-accent` (#6b4d7a is the darkest opaque pixel
 * of `frame-box.png` AND of `frame-arcana.png`), and in this app that plum
 * means exactly one thing: only the GM can see this. An arcanum's back is the
 * opposite — its moves are PLAYER-FACING by design, which is the whole reason
 * they live in the `discovery` block instead of `gm_notes` — so any plum frame
 * there tells the reader something false, and swapping which ornament tells
 * the lie does not fix it. Tinting is not on the table either: `border-image`
 * shows the file's RGB, `mask-border` is not interoperable, and a CSS filter
 * over the pseudo-element would be a stacked override, not a fix.
 *
 * So the face is plain `.card-paper`, and the back is too — told apart by the
 * `.seal-divider` between them and by its own section headings (not always
 * "Mysteries of X" any more — a consequences-only back has none), not by a
 * border. That is also closest to the book, where the two faces are ONE
 * object seen from two sides rather than two differently-dressed things.
 */
export function ArcanumCard({
  name,
  kind,
  tags,
  block,
  requirements,
  notesHtml,
  stamp,
  onTrackChange,
  onToggleConsequence,
}: ArcanumCardProps) {
  const t = useT();
  // Same call StatTrack makes for itself rather than taking a prop: the card
  // is only ever mounted outside edit mode (CharacterSheetPage's
  // `discoveryCard` is null while editing), so this is the one gate a pip
  // needs — a viewer's tap is a no-op, same as a requirement's tick above.
  const canEdit = useCanEdit();
  const isArcanum = kind === 'arcanum';
  // Only a MINOR arcanum narrows: an artifact has no tier and takes the width
  // it is given, a major arcanum is a playbook insert.
  // An absent tier READS as minor, here and in the sheet's select, so the two
  // never disagree. The picker no longer offers "Unset" (owner's call), and a
  // block written by the MCP or restored from a revision can still lack the
  // key — treating that as minor is the same neutral-default rule
  // `kindWithDefault` uses for a category-less NPC.
  const narrow = isArcanum && (block.tier ?? 'minor') === 'minor';
  const moves = block.moves ?? [];
  // The back's own moves — a separate array from the front's, with its own
  // existence condition (see the component doc's "earned by having a body").
  const mysteries = block.mysteries ?? [];
  // The back's OTHER body, from Task 16 — a separate array again, this time
  // from `requirements`/`traits` (an arcanum has both requirements and
  // consequences), sharing `Trait`'s {label, checked} shape purely by
  // coincidence.
  const consequences = block.consequences ?? [];
  // Paired with the ORIGINAL index (not the filtered position) because
  // `onTrackChange` addresses `block.tracks` by its real index — dropping a
  // max-0 row ahead of a real one must not shift which track a later click
  // patches. A track with `max: 0` (the freshly-added, not-yet-sized row) is
  // filtered out rather than left to PipTrack's own `max <= 0` guard: that
  // guard returns null for the PIP ROW, but the wrapping `mt-4 space-y-2` div
  // below would still print, an empty gap on the face — exactly the "heading
  // with nothing under it" this file's own doc argues is worse than no
  // section at all.
  const tracks = (block.tracks ?? [])
    .map((track, index) => ({ track, index }))
    .filter(({ track }) => track.max > 0);

  const moveBlock = (move: ArcMove, index: number) => {
    const { intro, options, outro } = parseMoveBody(move.text);
    return (
      <div key={index} className="space-y-1.5 font-reading text-[0.95rem] leading-relaxed">
        {/* An unnamed move gets NO heading rather than an empty one: the front
            of the Red Scepter carries three unnamed trigger lines. */}
        {move.name !== '' && (
          <h4 className="label-overline text-[var(--text-primary)]">
            {move.name}
            {move.tags && (
              <span className="ml-2 normal-case italic tracking-normal text-[var(--text-muted)]">
                ({move.tags})
              </span>
            )}
          </h4>
        )}
        {intro !== '' && <p className="whitespace-pre-line">{intro}</p>}
        {options.length > 0 && (
          <ul className="list-none space-y-1 pl-4">
            {options.map((option, i) => (
              <li key={i} className="before:content-['◈'] before:mr-2 before:text-[var(--text-muted)]">
                {option}
              </li>
            ))}
          </ul>
        )}
        {/* BELOW the list, because that is what it resolves: "On a 6-, the GM
            says what the scepter wants instead" answers the choices, it does
            not announce them. */}
        {outro !== '' && <p className="whitespace-pre-line">{outro}</p>}
      </div>
    );
  };

  return (
    <div className={`space-y-4 ${narrow ? 'max-w-sm mx-auto' : ''}`}>
      <CardFace stamp={stamp}>
        {/* The frieze at the head of the book's arcana pages. Ink and not
            `--border-paper`: at 12px of solid fill a hairline token reads as a
            grey bar, where the frieze belongs in the same ink layer as
            `.logo-mark`. */}
        <div className="band-knot text-[var(--text-muted)] mb-4" aria-hidden="true" />
        {isArcanum && (
          <p className="label-overline text-center mb-2">
            {/* The card's RULE, not the select's label: lower-case "minor
                arcanum" because the book sets it that way (". minor arcanum .").
                The select says just "Minor" — the row there is
                already called Tier, so repeating the noun was noise. */}
            {t(block.tier === 'major' ? 'character.tierMajorRule' : 'character.tierMinorRule')}
          </p>
        )}
        <h3 className="text-2xl text-center mb-1">{name}</h3>
        {/* A comma LINE and not pills: pills are UI chrome, and this face is a
            handout. The pills live in edit mode — reading voice vs.
            manipulating voice. */}
        {tags.length > 0 && (
          <p className="text-center text-sm italic font-reading text-[var(--text-secondary)] mb-4">
            {tags.join(', ')}
          </p>
        )}
        {/* The sheet's single read path for TipTap output — no second
            dangerouslySetInnerHTML: RichText's ReadView sanitises, keeps @
            mentions navigable and reuses the .ProseMirror typography. */}
        {hasRichText(notesHtml) && (
          <div className="mb-4">
            <RichText content={notesHtml} editable={false} />
          </div>
        )}
        {moves.length > 0 && (
          <div className="space-y-4">
            {/* The seal glyph is not decoration: `.seal-divider` alone draws two
                hairlines with an empty gap between them, which reads as a broken
                rule. Every other divider in the app carries it. */}
            <div className="seal-divider text-xs" aria-hidden>
              ✦
            </div>
            {moves.map(moveBlock)}
          </div>
        )}
        {/* Charges and progress — front matter too (see the
            component doc for why this isn't where Book I's generic rule would
            put it). No seal-divider of its own: these rows are bookkeeping for
            the moves just above, not a new section of the card. */}
        {tracks.length > 0 && (
          <div className="mt-4 space-y-2">
            {tracks.map(({ track, index }) => (
              <PipTrack
                key={index}
                label={track.label}
                max={track.max}
                marked={track.marked}
                onChange={(marked) => onTrackChange(index, marked)}
                readOnly={!canEdit}
              />
            ))}
          </div>
        )}
        {/* Front matter for BOTH kinds — the book's own division. */}
        <Requirements items={requirements} label={t('character.requirements')} />
      </CardFace>
      {/* The back — earned by having a body (mysteries OR consequences, as of
          Task 16), not by a row in a column. A block carrying neither still
          renders as exactly ONE face (see ArcanumCard.test.tsx). The
          seal-divider sits BETWEEN the two faces, outside either `CardFace`,
          because it is what tells them apart in place of a border neither is
          allowed to have. An ARTIFACT never gets one, whatever its block
          holds — see the component doc. */}
      {isArcanum && (mysteries.length > 0 || consequences.length > 0) && (
        <>
          <div className="seal-divider text-xs" aria-hidden>
            ✦
          </div>
          <CardFace stamp={stamp}>
            {/* The "Mysteries of X" heading is the mysteries SECTION's own —
                gated on `mysteries.length`, not on the back's existence, so a
                back opened by consequences alone (no mysteries recorded yet)
                never prints a heading over nothing. Same "earned by having a
                body" rule as the panel itself. */}
            {mysteries.length > 0 && (
              <h3 className="text-2xl text-center mb-4">
                {t('character.mysteriesOf', { name })}
              </h3>
            )}
            {mysteries.length > 0 && (
              <div className="space-y-4">
                {mysteries.map((move, index) => (
                  <div key={index} className="flex gap-2">
                    {/* The book's ☐ beside the name. Read-only here: a
                        mystery is gained through the sheet's editor, not
                        by tapping the card — unlike a track or a
                        consequence, which change mid-session. */}
                    <span
                      // NO `aria-pressed` here, deliberately: this is a
                      // `role="img"`, and `aria-pressed` is a `role="button"`
                      // state — an `aria-allowed-attr` violation that assistive
                      // tech discards anyway. State-DEPENDENT label text is the
                      // channel that carries it instead; a fixed "Gained X"
                      // would misreport every ungained mystery as gained.
                      aria-label={`${move.gained ? t('character.gained') : t('character.notGained')} ${move.name}`}
                      role="img"
                      className={`mt-1 w-3.5 h-3.5 shrink-0 border ${
                        move.gained
                          ? 'bg-[var(--text-primary)] border-[var(--text-primary)]'
                          : 'border-[var(--border-field)]'
                      }`}
                    />
                    <div className="min-w-0 flex-1">{moveBlock(move, index)}</div>
                  </div>
                ))}
              </div>
            )}
            {/* Task 16's own section — tickable, unlike the mysteries' ☐
                above: a consequence is exacted mid-session (the arcanum
                taking its due), the same "it's play" argument that already
                makes a track's pip and a requirement's tick save immediately.
                `mt-6` only when mysteries printed above it — otherwise this
                is the first (and only) thing on the face. */}
            {consequences.length > 0 && (
              <div className={mysteries.length > 0 ? 'mt-6' : ''}>
                <h4 className="label-overline mb-2">{t('character.consequences')}</h4>
                <ul className="space-y-1.5 font-reading text-[0.95rem]">
                  {consequences.map((consequence, index) => (
                    <li key={index} className="flex items-center gap-2">
                      <CheckBox
                        checked={consequence.checked}
                        label={consequence.label}
                        onToggle={() => onToggleConsequence(index)}
                      />
                      <span
                        className={
                          consequence.checked
                            ? 'line-through text-[var(--text-muted)]'
                            : 'text-[var(--text-primary)]'
                        }
                      >
                        {consequence.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardFace>
        </>
      )}
    </div>
  );
}
