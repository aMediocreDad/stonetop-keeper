import { FOLDERS } from './layout';

/**
 * Obsidian **Bases** views, shipped inside the vault.
 *
 * Bases is a CORE plugin backed directly by frontmatter properties — nothing to
 * install, works on mobile — which is why the frontmatter was designed to be
 * filterable in the first place. These four reproduce the app's Dashboard
 * filters offline.
 *
 * Syntax per Obsidian's Bases docs: top-level `filters` / `views`, a view is
 * `{type, name, order, filters}`, and conditions are expressions like
 * `file.inFolder("Characters")` and `note.type == "MENACE"`.
 */

interface BaseView {
  file: string;
  name: string;
  folder: string;
  extra?: string[];
  order: string[];
}

const VIEWS: BaseView[] = [
  {
    file: 'Cast.base',
    name: 'The whole cast',
    folder: FOLDERS.characters,
    order: ['file.name', 'note.type', 'note.role', 'note.location', 'note.tags', 'note.dead'],
  },
  {
    file: 'Threats.base',
    name: 'Threats',
    folder: FOLDERS.characters,
    extra: ['note.type == "MENACE"'],
    order: ['file.name', 'note.threat_type', 'note.instinct', 'note.location'],
  },
  {
    file: 'Discoveries.base',
    name: 'The prep bench',
    folder: FOLDERS.discoveries,
    // No `extra` type condition: the folder IS the filter here, unlike
    // Threats.base which has to sift MENACE rows out of Characters/.
    order: ['file.name', 'note.role', 'note.tier', 'note.location', 'note.gm_only'],
  },
  {
    file: 'Dead.base',
    name: 'Out of play',
    folder: FOLDERS.characters,
    extra: ['note.dead == true'],
    order: ['file.name', 'note.type', 'note.role', 'note.location'],
  },
  {
    file: 'Places.base',
    name: 'Places',
    folder: FOLDERS.locations,
    order: ['file.name', 'note.steading_size', 'note.description', 'note.tags'],
  },
];

function render(view: BaseView): string {
  const conditions = [`file.inFolder("${view.folder}")`, ...(view.extra ?? [])];
  return [
    'filters:',
    '  and:',
    ...conditions.map((c) => `    - '${c}'`),
    'views:',
    '  - type: table',
    `    name: "${view.name}"`,
    '    order:',
    ...view.order.map((o) => `      - ${o}`),
    '',
  ].join('\n');
}

export function baseViews(): Array<{ path: string; content: string }> {
  return VIEWS.map((v) => ({ path: `${FOLDERS.views}/${v.file}`, content: render(v) }));
}
