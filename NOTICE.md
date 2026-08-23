# Licensing Notice

This repository contains material under two different licenses.

## Application code — MIT

All source code in this repository (the application, build configuration,
database schema, and tests) is licensed under the MIT License. See
[LICENSE](LICENSE).

## Stonetop game content — CC BY-SA 4.0

Some files reproduce or adapt text from the tabletop role-playing game
**Stonetop**, written by Jeremy Strandberg and published by
[Lampblack & Brimstone](https://lampblackandbrimstone.com). The text of
*Stonetop Book I* and *Book II: The Wider World and Other Wonders* is
released under the
[Creative Commons Attribution-ShareAlike 4.0 International license](https://creativecommons.org/licenses/by-sa/4.0/)
(CC BY-SA 4.0). Some concepts and procedures therein are derived from
*Dungeon World*, by Sage LaTorra & Adam Koebel, released under a CC BY
license.

The Stonetop-derived content in this repository — including any
modifications and the French translation, which are themselves shared under
the same license as required by the ShareAlike clause — is licensed under
**CC BY-SA 4.0**. See [LICENSES/CC-BY-SA-4.0.txt](LICENSES/CC-BY-SA-4.0.txt)
for the full license text.

Files containing Stonetop-derived content:

- `app/src/lib/steading/steadingSeed.ts` — the Steading playbook's default
  sheet content (resources, fortifications, assets, improvements), translated
  to French and lightly adapted for this app

If you redistribute or adapt this content, you must credit *Stonetop* by
Jeremy Strandberg (Lampblack & Brimstone), link to the CC BY-SA 4.0 license,
indicate your changes, and share your adaptations under the same license.

## Stonetop graphic elements — CC BY 4.0

The stamp-style icons in `app/src/assets/stonetop/` (season marks, entity
stamps, danger stamp) are derived from the official *Stonetop* graphical
assets pack: **graphic elements by Jason Lutes, licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)**. Changes made:
converted to alpha masks (ink → opacity), trimmed, and downscaled for use
as tintable UI icons.

## Typefaces — SIL Open Font License 1.1

The woff2 files in `app/public/fonts/` (latin and latin-ext subsets only) are
vendored so the app carries its own type instead of fetching it from the
Google CDN on every load:

- **Playfair Display** — Claus Eggers Sørensen
- **Source Serif 4** — Frank Grießhammer, Adobe
- **Alegreya Sans** — Juan Pablo del Peral, Huerta Tipográfica

All three are released under the
[SIL Open Font License 1.1](https://scripts.sil.org/OFL), which permits
bundling and redistribution with the software. The files are unmodified
subsets as served by the Google Fonts CSS2 API.

## Artwork

The artwork in the Stonetop books is **© Lucie Arnoux, all rights
reserved** — it is *not* covered by the CC BY-SA license and none of it is
included in this repository. Do not add scans or crops of the books' art.
(The graphic-elements pack above is a separate, explicitly CC BY-licensed
collection and does not include her illustrations.)

*Stonetop* and *Lampblack & Brimstone* names are used for attribution only;
this project is unofficial and is not affiliated with or endorsed by
Lampblack & Brimstone.
