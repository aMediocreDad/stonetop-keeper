import type { VaultMeta } from './write';
import { EXCLUSIONS } from './fields';

/** The orientation note at the root of the vault. It is the first thing anyone
 *  opens, so it says what round-trips, what does not, and where the authority
 *  for each kind of data lives. */
export function readmeText(meta: VaultMeta): string {
  const roleLine =
    meta.role === 'gm'
      ? 'This export was taken as **GM**, so it carries the GM layer: GM-only sheets, GM notes, the GM chronicle strand and the journal.'
      : `This export was taken as **${meta.role}**, so it carries no GM layer — GM-only sheets and notes were never visible to it. Nothing was deleted; it simply was not there to export.`;

  return `# ${meta.space.name}

An export of a grimoire from **Ink & Stone**, taken ${meta.exportedAt}.

This folder is an Obsidian vault. Open it with *Open folder as vault* and it
works offline: sheets, places, the chronicle, maps and the relation web.

${roleLine}

## How to read it

- **Characters/** and **Locations/** — one note per sheet. Everything that
  identifies or classifies a sheet is a frontmatter property, so Obsidian's
  **Bases** views in **Views/** can filter on it. Nothing to install: Bases is
  a core plugin.
- **Discoveries/** — clues, sites, encounters, opportunities, artifacts and
  arcana. Same note format as a character (they are the same table); the \`role\`
  property is the *kind*, and **Requirements** is a task list you can tick.
- **Relations.md** — the whole relation web, as one table. It is the **source of
  truth**. Each character note also shows a *Relations* section, but that one is
  generated and ignored when re-importing.
- **Tone & content.md** — what the table agreed about how the game feels and
  what content is in or out of it. Everyone at the table can read and edit it,
  in the app and here.
- **Chronicle/** — one note per year. \`(GM)\` files are the GM's margin strand.
- **Maps/** — a pin table per map, plus a Leaflet block for anyone who has the
  [Leaflet](https://github.com/javalent/obsidian-leaflet) plugin. The **table is
  the source of truth**; the map is generated from it.
- The relation web is also just wikilinks, so Obsidian's own **graph view**
  works with no setup.

## Optional plugins

Neither is required — without them every note is still plain readable Markdown.

- **Fantasy Statblocks** renders the \`statblock\` blocks on monster and
  follower sheets. They use a custom layout named \`Stonetop\`; define one in the
  plugin's settings with the fields hp, armor, armorNote, damage,
  specialQualities and moves. Without the plugin the block reads as YAML.
- **Leaflet** renders the map blocks. If pins appear mirrored top-to-bottom,
  the plugin's latitude direction for image maps runs the other way than
  assumed here — the pin table's \`x\`/\`y\` columns are correct regardless.

## Editing offline

Edit freely. On re-import:

- The \`id\` property is what matches a note to its existing sheet. **A note with
  no \`id\` is treated as new** — so you can write an NPC on a plane and import
  it when you are back.
- Renaming a note is safe: Obsidian rewrites the wikilinks, and the \`id\`
  property still anchors the sheet.
- **Headings you write inside a note belong at \`#####\` or deeper.** The levels
  \`##\` to \`####\` are the sheet's own sections — *Notes*, *Traits* (a
  discovery's *Requirements*), *Threat*, a steading improvement — which is how
  each field knows where it ends. Write a
  \`## Rumours\` of your own and it is folded back into the section it sits in,
  so nothing is lost; write a \`## GM Notes\` of your own and it will be read as
  the real one. The app already writes its own headings this way.
- Import **only ever adds and updates — it never deletes.** Removing a note here
  will not remove the sheet from the grimoire.

## What is deliberately not in this file

${EXCLUSIONS.map((e) => `- ${e}`).join('\n')}

---

Ink & Stone. Stonetop is © Jeremy Strandberg; campaign text is yours.
`;
}
