// English strings — default language.
// Keys are dot-namespaced. Keep them stable; values are free to evolve.

export type Dict = {
  common: Record<
    | 'cancel' | 'save' | 'delete' | 'edit' | 'back' | 'close'
    | 'create' | 'add' | 'loading'
    | 'retry' | 'optional'
    | 'loadError' | 'saveError',
    string
  >;
  app: Record<'name', string>;
  offline: Record<'banner' | 'restored' | 'saveBlocked' | 'mapUnavailable' | 'mapsSaved', string>;
  editorToolbar: Record<'heading' | 'bold' | 'italic' | 'bulletList' | 'orderedList', string>;
  a11y: Record<'skipToContent', string>;
  titles: Record<
    | 'home' | 'dashboard' | 'character' | 'location' | 'graph'
    | 'chronicles' | 'maps' | 'map' | 'ledger' | 'gm' | 'toneAndContent',
    string
  >;
  home: {
    overline: string;
    description1: string;
    description2: string;
    create: { title: string; subtitle: string; cta: string };
    join: { title: string; subtitle: string; cta: string };
    footer: { basedOn: string; assetCredit: string };
  };
  spaceCreated: Record<
    | 'overline' | 'title' | 'nameLabel' | 'loginCodeLabel' | 'copyCode'
    | 'copied' | 'warningTitle' | 'warningText' | 'gotIt',
    string
  >;
  header: Record<'home' | 'space' | 'copyInvite' | 'inviteCopied' | 'leave', string>;
  createSpace: Record<
    | 'overline' | 'title' | 'nameLabel' | 'namePlaceholder'
    | 'gmPasswordLabel' | 'gmPasswordHint'
    | 'playerPasswordLabel' | 'playerPasswordHint'
    | 'submit' | 'submitting'
    | 'errorRequired' | 'errorGeneric',
    string
  >;
  joinSpace: Record<
    | 'overline' | 'title' | 'codeLabel' | 'codePlaceholder'
    | 'passwordLabel' | 'passwordPlaceholder' | 'passwordOptionalHint'
    | 'submit' | 'submitting'
    | 'errorRequired' | 'errorInvalid' | 'errorWrongPassword' | 'errorGeneric',
    string
  >;
  dashboard: Record<
    | 'countOne' | 'countOther' | 'inviteCode' | 'addCharacter' | 'graphView' | 'chroniclesView'
    | 'manageLocations' | 'manageLocationsTitle' | 'searchPlaceholder' | 'searchLabel'
    | 'searchClear' | 'searchShortcutHint' | 'resultCount'
    | 'matchNotes' | 'matchGmNotes' | 'matchThreat' | 'matchStats'
    | 'typeAll' | 'typePC' | 'typeNPC' | 'typeGroup' | 'typeThreat'
    | 'typeDiscovery' | 'toneAndContent'
    | 'locationsLabel' | 'allLocations' | 'noLocation'
    | 'kindsLabel' | 'allKinds'
    | 'emptySearch' | 'emptyAll',
    string
  >;
  deleteSpace: Record<
    | 'overline' | 'title' | 'button'
    | 'warning' | 'warningCounts' | 'warningIrreversible'
    | 'passwordLabel' | 'passwordPlaceholder' | 'confirmNameLabel'
    | 'submit' | 'submitting' | 'deleted'
    | 'errorWrongPassword' | 'errorGeneric',
    string
  >;
  spaceSettings: Record<
    | 'overline' | 'title'
    | 'currentPasswordLabel'
    | 'gmPasswordLabel' | 'gmPasswordPlaceholder'
    | 'playerPasswordLabel' | 'playerPasswordPlaceholder'
    | 'publicReadLabel' | 'publicReadHint'
    | 'save' | 'saving' | 'saved'
    | 'errorWrongPassword' | 'errorGeneric'
    | 'menuLabel',
    string
  >;

  character: Record<
    | 'sheetOverline' | 'notFound' | 'backToGrimoire' | 'delete' | 'deleteConfirm'
    | 'saveError'
    | 'typePC' | 'typeNPC' | 'typePCFull' | 'typeNPCFull' | 'typeGroup' | 'typeGroupFull'
    | 'typeThreat' | 'typeThreatFull'
    | 'typeDiscovery' | 'typeDiscoveryFull'
    | 'groupRole' | 'background' | 'occupation'
    | 'informations' | 'playbook' | 'threatType' | 'threatTypeNone' | 'location'
    | 'instinct' | 'instinctPrefix' | 'instinctGmOnlyHint'
    | 'deceased' | 'disbanded' | 'deadHint'
    | 'rolePlaceholder' | 'locationPlaceholder'
    | 'tags' | 'tagPlaceholder'
    | 'traits' | 'traitPlaceholder'
    | 'discoveryKind' | 'requirements' | 'requirementPlaceholder'
    | 'tier' | 'tier_minor' | 'tier_major'
    | 'tierMinorRule' | 'tierMajorRule' | 'mysteriesOf'
    | 'interesting' | 'useful' | 'interestingPlaceholder' | 'usefulPlaceholder'
    | 'moves' | 'addMove' | 'moveName' | 'moveNamePlaceholder'
    | 'moveTags' | 'moveTagsPlaceholder' | 'moveTagsNeedName'
    | 'moveText' | 'moveTextPlaceholder'
    | 'moveFallbackName'
    | 'mysteries' | 'addMystery' | 'gained' | 'notGained'
    | 'consequences' | 'consequencePlaceholder'
    | 'tracks' | 'addTrack' | 'trackLabel' | 'trackLabelPlaceholder' | 'trackMax'
    | 'trackFallbackName'
    | 'notes' | 'noteEditorPlaceholder'
    | 'relations' | 'noRelation' | 'addRelation' | 'pickCharacter' | 'detailPlaceholder' | 'relationDetail'
    | 'editRelation' | 'deleteRelation' | 'deleteRelationConfirm'
    | 'relationPrecisionPlaceholder' | 'save'
    | 'relationCountOne' | 'relationCountOther'
    | 'members' | 'noMembers' | 'addMember' | 'pickMember' | 'removeMember' | 'removeMemberConfirm'
    | 'leadsTo' | 'leadsHere' | 'noLeads'
    | 'pointsTo' | 'cluesHere' | 'noCluesHere' | 'noPointsTo'
    | 'noHolder' | 'noEncounterWith'
    | 'possessedBy' | 'possesses' | 'encounterWith' | 'encounters'
    | 'newRevelation' | 'newRevelationName'
    | 'addPromoted' | 'pickPromoted' | 'removePromoted' | 'removePromotedConfirm',
    string
  >;
  location: Record<
    | 'sheetOverline' | 'notFound' | 'backToGrimoire'
    | 'residents' | 'residentCountOne' | 'residentCountOther' | 'noResidents'
    | 'descriptionLabel' | 'descriptionPlaceholder'
    | 'notes' | 'notesPlaceholder'
    | 'tags' | 'tagPlaceholder'
    | 'promote' | 'promoteConfirm'
    | 'deleteSteadingWarning'
    | 'openFullSheet' | 'expand' | 'collapse',
    string
  >;
  steading: Record<
    | 'fortunes' | 'surplus' | 'population' | 'prosperity' | 'defenses'
    | 'size' | 'sizeHamlet' | 'sizeVillage' | 'sizeTown' | 'sizeCity'
    | 'debilities' | 'diminished' | 'diminishedHint'
    | 'lacking' | 'lackingHint' | 'malcontent' | 'malcontentHint'
    | 'resources' | 'resourcesHint' | 'fortifications' | 'fortificationsHint'
    | 'assets' | 'treasury' | 'silver' | 'gold' | 'purses' | 'handfuls' | 'coins'
    | 'improvements' | 'groupInProgress' | 'groupAvailable' | 'groupBuilt'
    | 'addCustom' | 'customName' | 'customSummary' | 'customRequirements' | 'customEffects'
    | 'requirementsLabel' | 'effectsLabel' | 'markBuilt' | 'builtBadge'
    | 'setupCta' | 'setupDone' | 'saveError'
    | 'yearLabel'
    | 'addItemPlaceholder'
    | 'attribution',
    string
  >;

  // Le formulaire ne demande plus qu'un nom et un type (le reste se remplit
  // sur la fiche) — mais `nameLabel`, `playbookNone` et `groupRolePlaceholder`
  // servent AUSSI de libellés sur les fiches : ils restent.
  characterForm: Record<
    | 'overline' | 'title' | 'hint' | 'nameLabel' | 'namePlaceholder'
    | 'typeLabel' | 'playbookNone'
    | 'submit' | 'submitting'
    | 'groupNamePlaceholder' | 'groupRolePlaceholder'
    | 'groupSubmit' | 'threatSubmit'
    | 'discoverySubmit',
    string
  >;
  locations: Record<
    | 'overline' | 'title' | 'empty'
    | 'addOverline' | 'addPlaceholder'
    | 'create' | 'rename' | 'delete' | 'cancel' | 'save'
    | 'pickerPlaceholder' | 'pickerNone' | 'pickerCreateNew'
    | 'customColor' | 'pickColor' | 'createAndSelect'
    | 'deleteConfirm' | 'deleteConfirmWithChars' | 'deleted' | 'countLabel',
    string
  >;
  graph: Record<
    | 'overline' | 'title' | 'closePanel' | 'openPanel' | 'filters'
    | 'summary' | 'summaryRels' | 'error' | 'empty' | 'searchPlaceholder'
    | 'visibleCount'
    | 'sectionLocations' | 'sectionType' | 'sectionRelationTypes' | 'sectionForces'
    | 'selectAll' | 'selectNone' | 'noLocation' | 'noLocationDefined'
    | 'typePC' | 'typeNPC' | 'typeGroup' | 'typeThreat'
    | 'typeDiscovery'
    | 'centerForce' | 'repelForce' | 'linkForce' | 'linkDistance'
    | 'freeze' | 'resume' | 'reorganize'
    | 'legendNode' | 'legendText'
    | 'panelRelations' | 'panelNoRelations' | 'panelClose' | 'panelTapHint'
    | 'follows',
    string
  >;
  maps: Record<
    | 'overline' | 'title' | 'dashboardButton' | 'empty' | 'addMap' | 'editMap'
    | 'deleteMap' | 'deleteConfirm' | 'deleteFailed' | 'nameLabel' | 'namePlaceholder'
    | 'descriptionLabel' | 'locationLabel' | 'imageLabel' | 'imageHint'
    | 'imageRequired' | 'imageBadType' | 'imageTooLarge' | 'uploading'
    | 'uploadFailed' | 'saveFailed' | 'gmOnlyLabel' | 'addPin' | 'placePinHint' | 'editPin'
    | 'deletePin' | 'deletePinConfirm' | 'pinTypeEntity' | 'pinTypeNote'
    | 'pinEntityLabel' | 'pinEntityPlaceholder' | 'pinLabelLabel'
    | 'pinNoteLabel' | 'openSheet' | 'mapsOfPlace' | 'mapButton' | 'sheetButton' | 'noImage' | 'viewError'
    | 'resetView' | 'pinFallbackName' | 'pinnedOn',
    string
  >;
  chronicles: Record<
    | 'overline' | 'title' | 'year'
    | 'scrollHint' | 'jumpToYear' | 'jumpToCurrent' | 'addSeason'
    | 'yearAgo' | 'yearsAgo'
    | 'recordEntry' | 'seasonLabel' | 'entryTitle' | 'titlePlaceholder' | 'moveOccupied'
    | 'spring' | 'summer' | 'autumn' | 'winter'
    | 'seasonPlaceholder' | 'focus' | 'fullscreen' | 'focusHint' | 'close'
    | 'saveError' | 'backlinksTitle'
    | 'viewWheel' | 'viewAnnals' | 'annalsTitle' | 'annalsEmpty'
    | 'gmStrand' | 'gmStrandHint' | 'gmSaveError'
    | 'presenceGm' | 'presencePlayer'
    | 'conflictText' | 'conflictTheirs' | 'conflictTakeTheirs' | 'conflictKeepMine',
    string
  >;
  relation: Record<
    | 'friend' | 'family' | 'mentor' | 'companion' | 'rival' | 'enemy'
    | 'romance' | 'acquaintance' | 'member' | 'other'
    | 'leadsTo' | 'foundWith' | 'concerns' | 'heldBy' | 'encounterWith'
    | 'closeFriend' | 'distrust' | 'swornEnemy' | 'ally',
    string
  >;
  discovery: Record<
    | 'clue' | 'revelation' | 'site' | 'encounter' | 'opportunity' | 'artifact' | 'arcanum'
    | 'unfiled',
    string
  >;
  whatsNew: Record<
    | 'overline' | 'title'
    | 'chroniclesTitle' | 'chroniclesText'
    | 'graphTitle' | 'graphText'
    | 'mapsTitle' | 'mapsText'
    | 'claudeTitle' | 'claudeText'
    | 'gotIt',
    string
  >;
  gm: Record<
    | 'badge' | 'onlyLabel' | 'onlyHint'
    | 'notesTitle' | 'notesHint' | 'notesEmpty' | 'notesEdit'
    | 'relationOnly',
    string
  >;
  gmJournal: Record<
    | 'dashboardButton' | 'title' | 'overline'
    | 'wondersTitle' | 'wondersHint' | 'addPlaceholder' | 'addLabel' | 'addWonderLabel'
    | 'resolvedHeading' | 'resolve' | 'reopen'
    | 'addResolution' | 'resolutionPlaceholder'
    | 'deleteTitle' | 'deleteText' | 'empty' | 'saveError',
    string
  >;
  toneAndContent: Record<
    | 'title' | 'overline' | 'hint' | 'empty' | 'readOnly' | 'saveError',
    string
  >;
  ledger: {
    menuLabel: string;
    title: string;
    overline: string;
    empty: string;
    loadMore: string;
    undo: string;
    /** Metadata line on a collapsed card: "{n} edits" alongside the actor. */
    editCount: string;
    actorGm: string;
    actorPlayer: string;
    actorUnknown: string;
    headline: Record<
      | 'characterCreated' | 'characterUpdated' | 'characterUpdatedField' | 'characterDeleted'
      | 'locationCreated' | 'locationUpdated' | 'locationUpdatedField' | 'locationDeleted'
      | 'mapCreated' | 'mapUpdated' | 'mapUpdatedField' | 'mapDeleted'
      | 'relationCreated' | 'relationUpdated' | 'relationUpdatedField' | 'relationDeleted'
      | 'pinCreated' | 'pinUpdated' | 'pinUpdatedField' | 'pinDeleted'
      | 'chronicleUpdated' | 'journalUpdated' | 'toneAndContentUpdated' | 'rowsChanged',
      string
    >;
    line: Record<'charactersUnlinked' | 'relationsRemoved' | 'pinsRemoved', string>;
    field: Record<
      | 'name' | 'role' | 'type' | 'notes' | 'traits' | 'tags' | 'location' | 'location_id' | 'color'
      | 'description' | 'steading' | 'threat' | 'statblock' | 'gm_only' | 'gm_notes' | 'entries'
      | 'gm_entries' | 'relation_type' | 'relation_detail' | 'label' | 'note'
      | 'x' | 'y' | 'image_path' | 'image_width' | 'image_height' | 'current_year' | 'current_season'
      | 'wonders',
      string
    >;
    /** Server `reason` codes (revision_undo_check / preview_undo_event / undo_event),
     * translated so none of them ever prints raw to a GM. `generic` also
     * covers the `constraint_<sqlstate>` family, whose suffix varies and so
     * cannot be enumerated. */
    reason: Record<
      | 'characterMissing' | 'mapMissing' | 'locationMissing' | 'exists' | 'rowMissing' | 'alreadyGone' | 'generic',
      string
    >;
    confirm: {
      title: string;
      intro: string;
      changedSince: string;
      /** Shown once, in place of the per-row `changedSince` warning, when the
       * event being reverted is the oldest of a collapsed group: every other
       * row difference is one of the group's own edits, not a hazard. */
      groupNote: string;
      unrestorable: string;
      note: string;
      thumbNote: string;
      submit: string;
      submitting: string;
    };
    result: { done: string; partial: string; none: string };
  };
  threat: Record<
    | 'portents' | 'addPortent'
    | 'impendingDoom' | 'doomAtHand' | 'stakes' | 'addStake' | 'gmMoves' | 'addMove',
    string
  >;
  statblock: Record<
    // Ni 'add' ni 'remove' : l'existence du bloc appartient aux cases
    // Monstre/Follower, pas à un bouton propre (cf. StatBlockCard).
    | 'title'
    | 'hp' | 'armor' | 'armorNote' | 'damage' | 'special'
    | 'moves' | 'addMove'
    | 'kind' | 'kindType'
    | 'cost' | 'loyalty' | 'follows' | 'party'
    | 'monster' | 'monsterHint'
    | 'follower' | 'followerHint' | 'gmOnlyHint',
    string
  >;
  errors: Record<'boundaryTitle' | 'boundaryDefault' | 'forbidden', string>;
  connectLlm: {
    menuLabel: string;
    overline: string;
    title: string;
    intro: string;
    roleGm: string;
    rolePlayer: string;
    roleViewer: string;
    commandLabel: string;
    copy: string;
    copied: string;
    warning: string;
    close: string;
  };
  exportVault: {
    menuLabel: string;
    overline: string;
    title: string;
    intro: string;
    roleGm: string;
    rolePlayer: string;
    roleViewer: string;
    contents: string;
    countCharacters: string;
    countLocations: string;
    obsidian: string;
    stageReading: string;
    stageImages: string;
    stageWriting: string;
    action: string;
    working: string;
    error: string;
    close: string;
  };
};

export const en: Dict = {
  common: {
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    edit: 'Edit',
    back: 'Back',
    close: 'Close',
    create: 'Create',
    add: 'Add',
    loading: 'Loading…',
    retry: 'Retry',
    optional: 'optional',
    loadError: 'Loading failed — check your connection.',
    saveError: 'Saving failed — check your connection and try again.',
  },

  app: {
    name: 'Ink & Stone',
  },

  offline: {
    banner: 'No connection — showing your last visit. Changes will not save yet.',
    restored: 'Connection restored.',
    saveBlocked: 'No connection — this could not be saved. It is kept here and will go up when you reconnect.',
    mapUnavailable: 'This map has not been saved for offline use yet.',
    mapsSaved: '{saved} of {total} maps saved for offline',
  },
  editorToolbar: {
    heading: 'Section heading',
    bold: 'Bold',
    italic: 'Italic',
    bulletList: 'Bulleted list',
    orderedList: 'Numbered list',
  },
  a11y: {
    skipToContent: 'Skip to content',
  },
  // Browser-tab titles: page first, brand after, so ten open tabs stay
  // tellable apart. Terminology matches the in-app headings.
  titles: {
    home: 'Ink & Stone',
    dashboard: 'Characters · Ink & Stone',
    character: 'Character sheet · Ink & Stone',
    location: 'Location · Ink & Stone',
    graph: 'Web of bonds · Ink & Stone',
    chronicles: 'Chronicles · Ink & Stone',
    maps: 'Maps · Ink & Stone',
    map: 'Map · Ink & Stone',
    ledger: 'Ledger · Ink & Stone',
    gm: 'GM journal · Ink & Stone',
    toneAndContent: 'Tone & content · Ink & Stone',
  },

  home: {
    overline: 'A Stonetop campaign wiki · No account needed',
    description1:
      'A living wiki for your Stonetop game — the folk of the steading, their bonds and grudges, the places and the turning seasons — kept together and shared with your whole table, from any device.',
    description2:
      'For everything your table will have forgotten by next session.',
    create: {
      title: 'Create a shared grimoire',
      subtitle: 'Start a new grimoire for your campaign',
      cta: 'Open the grimoire',
    },
    join: {
      title: 'Join an existing grimoire',
      subtitle: 'Enter with your invite code',
      cta: 'Turn the page',
    },
    footer: {
      basedOn: 'Based on Ink & Stone by Zephyr-jdr',
      assetCredit: 'Graphic elements by Jason Lutes · CC BY 4.0',
    },
  },

  spaceCreated: {
    overline: 'A new grimoire',
    title: 'Your grimoire is ready',
    nameLabel: 'Name',
    loginCodeLabel: 'Invite code',
    copyCode: 'Copy',
    copied: 'Copied!',
    warningTitle: 'Keep this safe',
    warningText: 'You and your players will need this code to return to the grimoire. You\'ll also find it beneath your grimoire\'s title.',
    // La modale s'ouvre sur un grimoire fraîchement créé : la sortie EST
    // l'entrée dans le grimoire.
    gotIt: 'Enter the grimoire',
  },

  header: {
    home: 'Ink & Stone — home',
    space: 'Grimoire',
    copyInvite: 'Copy invite link',
    inviteCopied: 'Invite link copied',
    leave: 'Leave this grimoire',
  },

  createSpace: {
    overline: 'New grimoire',
    title: 'Begin a new grimoire',
    nameLabel: 'Group name',
    namePlaceholder: 'The Heroes of Stonetop',
    gmPasswordLabel: 'GM password',
    gmPasswordHint: 'Full control — hidden notes, settings, and deletion.',
    playerPasswordLabel: 'Player password (optional)',
    playerPasswordHint: 'Players can edit everything except GM-only content.',
    submit: 'Create and enter',
    submitting: 'Creating…',
    errorRequired: 'All fields are required',
    errorGeneric: 'The grimoire could not be created — please try again.',
  },

  joinSpace: {
    overline: 'Join a grimoire',
    title: 'Open the pages',
    codeLabel: 'Invite code or URL',
    codePlaceholder: 'e.g. gg-bdz',
    passwordLabel: 'Password',
    passwordPlaceholder: 'Group password',
    passwordOptionalHint: 'No password? If the grimoire allows it, you can look around as a read-only visitor.',
    submit: 'Enter the grimoire',
    submitting: 'Connecting…',
    errorRequired: 'All fields are required',
    errorInvalid: 'We couldn\'t find a grimoire with that code. Check it and try again.',
    errorWrongPassword: 'That password doesn\'t match.',
    errorGeneric: 'Could not join the grimoire — please try again.',
  },

  dashboard: {
    countOne: '{n} character',
    countOther: '{n} characters',
    inviteCode: 'Invite code',
    addCharacter: 'Add',
    graphView: 'Bonds',
    chroniclesView: 'Chronicle',
    manageLocations: 'Manage locations',
    manageLocationsTitle: 'Manage the list of locations',
    // La prose est cherchée depuis qu'elle est dans la botte de foin
    // (lib/characterSearch) : le placeholder le dit, sinon personne n'essaie.
    searchPlaceholder: 'Search names, roles, tags, notes…',
    // Nom accessible du champ de recherche : le placeholder est une AIDE
    // (il disparaît à la frappe et sa copie peut changer), pas un NOM.
    searchLabel: 'Search the grimoire',
    searchClear: 'Clear the search',
    // Info-bulle de la touche « / » — la touche elle-même s'écrit toute seule.
    searchShortcutHint: 'Press / to search',
    resultCount: '{visible} of {total} shown',
    // Étiquettes du « pourquoi cette carte » : la prose qui a répondu. Voix
    // d'interface (label-overline), l'extrait garde la voix de lecture.
    matchNotes: 'notes',
    matchGmNotes: 'GM notes',
    matchThreat: 'threat',
    matchStats: 'stats',
    typeAll: 'all',
    typePC: 'PC',
    typeNPC: 'NPC',
    typeGroup: 'Groups',
    typeThreat: 'Threats',
    typeDiscovery: 'Discoveries',
    toneAndContent: 'Tone & content',
    locationsLabel: 'Locations',
    allLocations: 'All',
    noLocation: 'No location',
    kindsLabel: 'Kinds',
    allKinds: 'All kinds',
    emptySearch: 'No one matches that search.',
    emptyAll: 'Your grimoire is empty. Add your first character to begin.',
  },

  deleteSpace: {
    overline: 'Point of no return',
    title: 'Delete this grimoire',
    button: 'Delete this grimoire',
    warning: 'You are about to delete "{name}".',
    warningCounts:
      'Everything in it will be erased — {characters} characters, {relations} relations, and {locations} locations.',
    warningIrreversible: 'This cannot be undone.',
    passwordLabel: 'Grimoire password',
    passwordPlaceholder: 'Re-enter the password',
    confirmNameLabel: 'Type "{name}" to confirm',
    submit: 'Delete forever',
    submitting: 'Deleting…',
    deleted: 'Grimoire "{name}" has been deleted',
    errorWrongPassword: 'That password doesn\'t match.',
    errorGeneric: 'The grimoire could not be deleted — please try again.',
  },

  spaceSettings: {
    overline: 'Grimoire',
    title: 'Settings',
    currentPasswordLabel: 'Current GM password',
    gmPasswordLabel: 'New GM password',
    gmPasswordPlaceholder: 'Leave blank to keep the current one',
    playerPasswordLabel: 'Player password',
    playerPasswordPlaceholder: 'Leave blank to turn off',
    publicReadLabel: 'Read-only access with the invite code alone',
    publicReadHint: 'Anyone with the code can view — but not edit — this grimoire.',
    save: 'Save',
    saving: 'Saving…',
    saved: 'Settings saved',
    errorWrongPassword: 'That password doesn\'t match.',
    errorGeneric: 'The settings could not be saved — please try again.',
    menuLabel: 'Grimoire settings',
  },

  location: {
    sheetOverline: 'Location',
    notFound: 'We couldn\'t find that location.',
    backToGrimoire: 'Back to the grimoire',
    residents: 'Residents',
    residentCountOne: '{n} resident',
    residentCountOther: '{n} residents',
    noResidents: 'No one calls this place home yet. Assign characters to it from their sheets.',
    descriptionLabel: 'Description',
    descriptionPlaceholder: 'A short tagline — "fenland trade town"…',
    notes: 'Notes',
    notesPlaceholder: 'Lore, rumors, what the table knows about this place…',
    tags: 'Tags',
    tagPlaceholder: 'Add a tag…',
    promote: 'Promote to steading…',
    promoteConfirm: 'Give this location a full steading sheet (stats, improvements, assets)? This is meant for the home steading.',
    deleteSteadingWarning: 'This location holds the steading sheet — deleting it deletes the whole sheet (stats, improvements, assets). This cannot be undone. Delete anyway?',
    openFullSheet: 'Open full sheet',
    expand: 'Expand',
    collapse: 'Collapse',
  },

  steading: {
    fortunes: 'Fortunes',
    surplus: 'Surplus',
    population: 'Population',
    prosperity: 'Prosperity',
    defenses: 'Defenses',
    size: 'Size',
    sizeHamlet: 'hamlet (<50)',
    sizeVillage: 'village (150–350)',
    sizeTown: 'town (300–1,500)',
    sizeCity: 'city (2,500+)',
    debilities: 'Debilities',
    diminished: 'Diminished',
    diminishedHint: 'Disadvantage to Deploy, Muster, or Pull Together',
    lacking: 'Lacking',
    lackingHint: 'Treat Prosperity as 1 lower',
    malcontent: 'Malcontent',
    malcontentHint: 'Fortunes reset to +0 each season; folks need more Persuading',
    resources: 'Resources',
    resourcesHint: 'What justifies Prosperity',
    fortifications: 'Fortifications',
    fortificationsHint: 'What justifies Defenses',
    assets: 'Assets',
    treasury: 'Treasury',
    silver: 'Silver',
    gold: 'Gold',
    purses: 'Purses',
    handfuls: 'Handfuls',
    coins: 'Coins',
    improvements: 'Improvements',
    groupInProgress: 'In progress',
    groupAvailable: 'Available',
    groupBuilt: 'Built',
    addCustom: 'Add custom improvement',
    customName: 'Name',
    customSummary: 'Summary',
    customRequirements: 'Requirements (one per line)',
    customEffects: 'Effects',
    requirementsLabel: 'Requirements',
    effectsLabel: 'Effects',
    markBuilt: 'Mark as built',
    builtBadge: 'Built',
    setupCta: 'Set up the Stonetop sheet',
    setupDone: 'Stonetop steading sheet created.',
    saveError: 'Could not save the steading sheet. Check your connection.',
    yearLabel: 'Year',
    addItemPlaceholder: 'Add an entry…',
    attribution:
      'Steading content from Stonetop by Jeremy Strandberg (Lampblack & Brimstone), licensed under',
  },

  character: {

    sheetOverline: 'Character sheet',
    notFound: 'We couldn\'t find that character.',
    saveError: 'Saving the sheet failed — check your connection and retry. Your changes are still on the page.',
    backToGrimoire: 'Back to the grimoire',
    delete: 'Delete',
    deleteConfirm: 'Permanently delete this character?',
    typePC: 'PC',
    typeNPC: 'NPC',
    typePCFull: 'Player Character',
    typeNPCFull: 'Non-Player Character',
    typeGroup: 'Group',
    typeGroupFull: 'Group',
    typeThreat: 'Threat',
    typeThreatFull: 'Threat',
    typeDiscovery: 'Discovery',
    typeDiscoveryFull: 'Discovery',
    groupRole: 'Description',
    background: 'Background',
    // « Role », pas « Occupation » : le livre parle du rôle d'un PNJ, et la
    // moitié des entrées utiles n'est pas un métier (« her brother »,
    // « the miller's widow »).
    occupation: 'Role',
    informations: 'Information',
    // `role` (le libellé nu) est parti avec le champ Rôle des menaces : les
    // trois autres types ont chacun le leur (background/occupation/groupRole).
    playbook: 'Playbook',
    threatType: 'Type',
    threatTypeNone: 'No type',
    location: 'Location',
    instinct: 'Instinct',
    // « to », sans points de suspension : en lecture la valeur suit sur la
    // même ligne (« Instinct: to protect her family ») — l'ellipse coupait la
    // phrase en deux. En édition, le champ vide qui suit suffit comme invite.
    instinctPrefix: 'to',
    instinctGmOnlyHint: 'Only you can see this instinct — players see it once the NPC is a follower.',
    // Une seule colonne (`dead`), lue selon le type — comme `role`. Ces deux
    // libellés servent DEUX FOIS : la case de la fiche et la pastille de la
    // carte. Un libellé neutre au-dessus des deux (« Gone from play ») disait
    // la colonne, pas la chose — et personne à la table ne dit ça.
    deceased: 'Deceased',
    disbanded: 'Disbanded',
    deadHint: 'They stay in the grimoire and keep every bond — this only records that they are gone.',
    rolePlaceholder: 'e.g. Smith, Innkeeper…',
    locationPlaceholder: 'No location / pick one…',
    tags: 'Tags',
    tagPlaceholder: '+ tag',
    traits: 'Traits',
    traitPlaceholder: 'e.g. humorless, just married…',
    discoveryKind: 'Kind',
    requirements: 'Requirements',
    requirementPlaceholder: 'Add a requirement…',
    tier: 'Tier',
    // Two voices for one datum, deliberately. `tier_*` labels the SELECT, where
    // the row is already called "Tier" so repeating "arcanum" is noise.
    // `*Rule` is the card's centred rule, lower-case because the book sets it
    // that way (". minor arcanum .").
    tier_minor: 'Minor',
    tier_major: 'Major',
    tierMinorRule: 'minor arcanum',
    tierMajorRule: 'major arcanum',
    // The BACK of an arcanum's card. The book gives the two faces different
    // titles (the Red Scepter's back is "Burning Hatred"); until a mystery is
    // recorded to name it, the back is titled after the front.
    mysteriesOf: 'Mysteries of {name}',
    interesting: 'Something interesting',
    useful: 'Something useful',
    interestingPlaceholder: 'What a good roll reveals…',
    usefulPlaceholder: 'What it gets them…',
    moves: 'Moves',
    addMove: 'Add a move',
    moveName: 'Move name',
    moveNamePlaceholder: 'Inflame',
    moveTags: 'Move tags',
    moveTagsPlaceholder: 'near, magical',
    // Why the tags field is disabled on an unnamed row. `normalizeMove` drops
    // tags without a name (the book never prints a tags line except under a
    // move's name), so an enabled field here would collect text the next read
    // throws away.
    moveTagsNeedName: 'Name the move to give it tags',
    moveText: 'Move text',
    moveTextPlaceholder: 'When you… On a 10+, …\n- an option\n- another option',
    // The remove button's accessible name falls back to this NOUN when the
    // move itself has none yet (a fresh row) — `${delete} ${name || this}`
    // must always read as "Delete <something>", never bare "Delete".
    moveFallbackName: 'move',
    // The back's own moves — same shape as `moves` above, plus the book's ☐.
    mysteries: 'Mysteries',
    addMystery: 'Add a mystery',
    // The book's ☐ beside a mystery's name. In the editor this labels a real
    // toggle `<button aria-pressed>` — a fixed name with state carried by
    // `aria-pressed`, same idiom as the Monster/Follower checkboxes, so it
    // never changes with the state. The read-only glyph on the card's back is
    // NOT a real button (role="img", so `aria-pressed` there isn't honoured by
    // assistive tech) — `notGained` exists so THAT label stays correct by
    // switching text instead.
    gained: 'Gained',
    notGained: 'Not gained',
    // The back's other checkbox list — {label, checked}, same shape as
    // `traits`/requirements but a SEPARATE array: an arcanum has both. Real
    // buttons (`aria-pressed`), unlike a mystery's read-only glyph, because a
    // consequence is exacted mid-session, the same "it's play" argument as a
    // track's pip.
    consequences: 'Consequences',
    consequencePlaceholder: 'Add a consequence…',
    tracks: 'Tracks',
    addTrack: 'Add a track',
    trackLabel: 'Track label',
    trackLabelPlaceholder: 'Charges',
    trackMax: 'Track max',
    // Same shape as moveFallbackName: the remove button's accessible name
    // must never read as a bare "Delete" for a fresh, unlabelled row.
    trackFallbackName: 'track',
    notes: 'Description / Notes',
    noteEditorPlaceholder: 'Write your notes here…',
    // « Bond » partout côté utilisateur : la page graphe (« Web of bonds »),
    // son panneau et la prose du Ledger le disaient déjà — la fiche disait
    // « Relations » et le bouton du tableau de bord « Relationships ». Un
    // concept, un nom. (Le modèle de données garde `relation`.)
    relations: 'Bonds',
    noRelation: 'No bonds recorded yet.',
    addRelation: 'Add a bond',
    pickCharacter: 'Pick a character…',
    detailPlaceholder: 'Detail (optional) — e.g. "son of", "childhood friend"',
    // Nom accessible des champs « détail » (ajout ET édition) : les deux
    // placeholders ci-dessus/dessous sont des exemples, pas des noms — un
    // lecteur d'écran annonçait la phrase d'exemple entière comme libellé.
    relationDetail: 'Bond detail',
    editRelation: 'Edit bond',
    deleteRelation: 'Delete bond',
    deleteRelationConfirm: 'Delete this bond?',
    relationPrecisionPlaceholder: 'Detail (e.g. "son of", "cousin"…)',
    relationCountOne: '{n} bond',
    relationCountOther: '{n} bonds',
    members: 'Members',
    noMembers: 'No members yet.',
    addMember: 'Add a member',
    pickMember: 'Choose a character…',
    removeMember: 'Remove member',
    removeMemberConfirm: 'Remove this character from the group? The character itself is not deleted.',
    leadsTo: 'Leads to',
    leadsHere: 'What leads here',
    noLeads: 'Leads nowhere yet.',
    // The promoted slot, per discovery kind (lib/character/promotedRelations).
    // The `*Here` strings are what the sheet at the OTHER end reads.
    pointsTo: 'Points to',
    cluesHere: 'Clues pointing here',
    noCluesHere: 'No clues point here yet.',
    // Empty outgoing slot, per kind — `noLeads` above still serves site and
    // opportunity, whose heading is the plain "Leads to".
    noPointsTo: 'Points to nothing yet.',
    noHolder: 'No one holds this yet.',
    noEncounterWith: 'No one yet.',
    possessedBy: 'Possessed by',
    possesses: 'Possesses',
    encounterWith: 'Encounter with',
    encounters: 'Encounters',
    newRevelation: 'New revelation…',
    newRevelationName: 'What do they learn?',
    addPromoted: 'Add',
    // Ellipsis to match its siblings (`pickMember`, `pickCharacter`).
    pickPromoted: 'Choose an entry…',
    // A NOUN, not a bare verb: this is the accessible name of an icon-only X,
    // so "Remove" alone tells a screen-reader user nothing about what goes.
    removePromoted: 'Remove link',
    removePromotedConfirm: 'Remove this link? The entries themselves are kept.',
    save: 'Save',
  },


  characterForm: {
    overline: 'New entry',
    title: 'Add an entry',
    hint: 'A name and a type to start with — the sheet opens ready to fill in.',
    nameLabel: 'Name',
    namePlaceholder: 'e.g. Bryn',
    typeLabel: 'Type',
    playbookNone: 'No playbook',
    submit: 'Create character',
    submitting: 'Creating…',
    groupNamePlaceholder: 'e.g. Town militia',
    groupRolePlaceholder: 'e.g. Merchant guild, nomad tribe…',
    groupSubmit: 'Create group',
    threatSubmit: 'Create threat',
    discoverySubmit: 'Create discovery',
  },

  locations: {
    overline: 'World map',
    title: 'Manage locations',
    empty: 'No locations yet. Create one below.',
    addOverline: 'Add a location',
    addPlaceholder: 'Location name',
    create: 'Create',
    rename: 'Rename / change color',
    delete: 'Delete',
    cancel: 'Cancel',
    save: 'Save',
    pickerPlaceholder: 'Pick a location…',
    pickerNone: 'No location',
    pickerCreateNew: 'Create a new location…',
    customColor: 'Custom',
    pickColor: 'Pick a color',
    createAndSelect: 'Create & select',
    deleteConfirm: 'Delete the location "{name}"?',
    deleteConfirmWithChars:
      'Delete the location "{name}"?\n\n{n} character(s) will lose their location (they remain in the grimoire).',
    deleted: 'Location "{name}" deleted',
    countLabel: '{n} here',
  },

  graph: {
    overline: 'Overview',
    title: 'Web of bonds',
    closePanel: 'Close panel',
    openPanel: 'Open panel',
    filters: 'Filters',
    summary: '{visible} / {total} shown',
    summaryRels: '· {n} bonds',
    error: 'The web couldn\'t be drawn.',
    empty: 'Nothing to map yet — add characters and link them with relations.',
    searchPlaceholder: 'Search…',
    visibleCount: '{visible} / {total} characters · {rels} relations',
    sectionLocations: 'Locations',
    sectionType: 'Type',
    sectionRelationTypes: 'Relation types',
    sectionForces: 'Forces',
    selectAll: 'all',
    selectNone: 'none',
    noLocation: 'No location',
    noLocationDefined: 'No location defined.',
    typePC: 'Player Character',
    typeNPC: 'Non-Player Character',
    typeGroup: 'Groups',
    typeThreat: 'Threat',
    typeDiscovery: 'Discovery',
    centerForce: 'Center force',
    repelForce: 'Repel force',
    linkForce: 'Link force',
    linkDistance: 'Link distance',
    freeze: 'Freeze',
    resume: 'Resume',
    reorganize: 'Reorganize',
    panelRelations: 'Bonds',
    panelNoRelations: 'No visible bonds.',
    panelClose: 'Close',
    panelTapHint: 'Tap a name to open the sheet',
    // Hover label on a derived follower → leader edge (statblock.follower.leaderId).
    follows: 'follows',
    legendNode: 'Node = location',
    legendText:
      'Nodes take their location\'s color; PCs wear a gold ring, and group bubbles gather their members. Drag anything — the web settles on its own.',
  },

  maps: {
    overline: 'Atlas',
    title: 'Maps',
    dashboardButton: 'Maps',
    empty: 'No maps yet. The GM can add one.',
    addMap: 'Add a map',
    editMap: 'Edit map',
    deleteMap: 'Delete map',
    deleteConfirm: 'Delete this map and all its pins? The image will be removed too.',
    deleteFailed: 'Could not delete the map. Please try again.',
    nameLabel: 'Name',
    namePlaceholder: 'The region, a city, a dungeon level…',
    descriptionLabel: 'Description',
    locationLabel: 'Linked place',
    imageLabel: 'Map image',
    imageHint: 'PNG, JPEG or WebP — up to 20 MB.',
    imageRequired: 'Choose an image file.',
    imageBadType: 'This file is not a supported image (PNG, JPEG, WebP).',
    imageTooLarge: 'Image is too large even after compression (20 MB max).',
    uploading: 'Uploading…',
    uploadFailed: 'Upload failed. Please try again.',
    saveFailed: 'Could not save the map. Please try again.',
    gmOnlyLabel: 'GM only (hidden from players)',
    addPin: 'Add pin',
    placePinHint: 'Click the map to place the pin',
    editPin: 'Edit pin',
    deletePin: 'Delete pin',
    deletePinConfirm: 'Delete this pin?',
    pinTypeEntity: 'Link a sheet',
    pinTypeNote: 'Free note',
    pinEntityLabel: 'Character, group or place',
    pinEntityPlaceholder: 'Search…',
    pinLabelLabel: 'Label',
    pinNoteLabel: 'Note',
    openSheet: 'Open sheet',
    mapsOfPlace: 'Maps of this place',
    mapButton: 'Map',
    pinnedOn: 'On the maps',
    sheetButton: 'Sheet',
    noImage: 'No image uploaded yet.',
    viewError: 'Could not load the map image.',
    resetView: 'Reset view',
    pinFallbackName: 'Pin',
  },

  chronicles: {
    overline: 'Chronicle',
    title: 'Wheel of seasons',
    year: 'Year',
    yearAgo: 'year ago',
    yearsAgo: 'years ago',
    scrollHint: 'Scroll, swipe or use arrow keys · tap a year',
    jumpToYear: 'Jump to year',
    jumpToCurrent: 'Current season',
    addSeason: 'Add {season}',
    recordEntry: 'Record entry',
    seasonLabel: 'Season',
    entryTitle: 'Entry title',
    titlePlaceholder: 'Untitled entry',
    moveOccupied: 'That season already has an entry.',
    spring: 'Spring',
    summer: 'Summer',
    autumn: 'Autumn',
    winter: 'Winter',
    seasonPlaceholder: 'Write what happened in {season}…',
    focus: 'Open',
    fullscreen: 'Open {season} fullscreen',
    focusHint: 'Esc to close · your text is saved automatically',
    close: 'Close',
    saveError: 'Saving the chronicle failed — check your connection and retry. Keep this tab open so your latest text isn\'t lost.',
    backlinksTitle: 'In the chronicle',
    viewWheel: 'Wheel',
    viewAnnals: 'Annals',
    annalsTitle: 'Annals',
    annalsEmpty: 'Nothing is recorded yet — record an entry to begin the annals.',
    gmStrand: 'GM annals',
    gmStrandHint: 'Visible only to you.',
    gmSaveError: 'Couldn\'t save the GM annals.',
    presenceGm: 'The GM is writing here',
    presencePlayer: 'Another player is writing here',
    conflictText: 'Someone else wrote in this season while you were editing.',
    conflictTheirs: 'Their version',
    conflictTakeTheirs: 'Take theirs',
    conflictKeepMine: 'Keep mine',
  },

  relation: {
    friend: 'Friend / Ally',
    family: 'Family',
    mentor: 'Mentor',
    companion: 'Companion',
    rival: 'Rival',
    enemy: 'Enemy',
    romance: 'Romance',
    acquaintance: 'Acquaintance',
    member: 'Member',
    other: 'Other',
    leadsTo: 'Leads to',
    foundWith: 'Found with',
    concerns: 'Concerns',
    heldBy: 'Possessed by',
    encounterWith: 'Encounter with',
    closeFriend: 'Close friend',
    distrust: 'Distrust',
    swornEnemy: 'Sworn enemy',
    ally: 'Ally',
  },

  discovery: {
    clue: 'Clue',
    revelation: 'Revelation',
    site: 'Site',
    encounter: 'Encounter',
    opportunity: 'Opportunity',
    artifact: 'Artifact',
    arcanum: 'Arcanum',
    unfiled: 'Unfiled',
  },

  whatsNew: {
    overline: 'Welcome',
    title: 'Corners of the grimoire your table might miss',
    chroniclesTitle: 'The chronicle',
    chroniclesText: 'A wheel of seasons — note what happens each spring, summer, autumn, and winter, and your whole table sees it.',
    graphTitle: 'The web of bonds',
    graphText: 'See everyone at once. Tap a character to trace their bonds and step through to any sheet.',
    mapsTitle: 'Maps',
    mapsText: 'Pin characters, places, and notes onto your hand-drawn maps — sheets link back to where they\'re pinned.',
    claudeTitle: 'Connect to Claude',
    claudeText: 'From the grimoire menu, let Claude Code read the campaign while you plan — and write back recaps and updates you dictate.',
    // Un verbe, dans la voix du grimoire — « Got it » était hors registre à
    // côté de « Turn the page » / « Enter the grimoire ».
    gotIt: 'Back to the grimoire',
  },
  gm: {
    badge: 'GM',
    onlyLabel: 'GM only',
    onlyHint: 'Hidden from players and visitors.',
    notesTitle: 'GM notes',
    notesHint: 'Only you can see this.',
    notesEmpty: 'Nothing written down yet.',
    notesEdit: 'Edit the GM notes',
    relationOnly: 'GM-only relation',
  },
  gmJournal: {
    dashboardButton: 'GM journal',
    title: 'GM journal',
    overline: 'Only you can see this page',
    wondersTitle: 'I wonder…',
    wondersHint: 'Open questions about the campaign. Strike one through when play answers it.',
    addPlaceholder: 'I wonder…',
    addLabel: 'Add',
    // Nom accessible du champ (le placeholder « I wonder… » est le registre
    // du journal, pas un nom de champ).
    addWonderLabel: 'Add an open question',
    resolvedHeading: 'Answered',
    resolve: 'Mark as answered',
    reopen: 'Reopen',
    addResolution: 'Add a note',
    resolutionPlaceholder: 'How it turned out…',
    deleteTitle: 'Delete this wondering?',
    deleteText: 'It will be removed from the journal (the Ledger keeps a trace).',
    empty: 'Nothing wondered yet. What are you curious about?',
    saveError: 'Saving the GM journal failed — check your connection and retry.',
  },
  toneAndContent: {
    title: 'Tone & content',
    overline: 'What we agreed, together — everyone can read and write this',
    // The CATS headings, as a prompt rather than seeded content: the editor
    // offers h2/h3 and the table writes its own.
    hint: 'Concept · Aim · Tone · Subject matter. Add a heading for each. Anyone can add something to exclude, veil, or handle differently — at any time, without giving a reason.',
    empty: 'Nothing agreed here yet.',
    readOnly: 'You are reading as a viewer.',
    saveError: 'Saving the tone & content page failed — check your connection and retry.',
  },
  ledger: {
    menuLabel: 'The Ledger',
    title: 'The Ledger',
    overline: 'Every change to the wiki is recorded here',
    empty: 'Nothing has been written down yet.',
    loadMore: 'Earlier entries',
    undo: 'Revert',
    editCount: '{n} edits',
    actorGm: 'GM',
    actorPlayer: 'A player',
    actorUnknown: 'Unattributed',
    headline: {
      characterCreated: '{name} was added',
      characterUpdated: '{name} was edited ({n} fields)',
      characterUpdatedField: "{name}'s {field} was changed",
      characterDeleted: '{name} was deleted',
      locationCreated: '{name} was added',
      locationUpdated: '{name} was edited ({n} fields)',
      locationUpdatedField: "{name}'s {field} was changed",
      locationDeleted: '{name} was deleted',
      mapCreated: 'The map "{name}" was added',
      mapUpdated: 'The map "{name}" was edited ({n} fields)',
      mapUpdatedField: 'The map "{name}" — {field} was changed',
      mapDeleted: 'The map "{name}" was deleted',
      relationCreated: 'A bond was drawn: {name}',
      relationUpdated: 'The bond {name} was edited ({n} fields)',
      relationUpdatedField: 'The bond {name} — {field} was changed',
      relationDeleted: 'The bond {name} was cut',
      pinCreated: 'The pin "{name}" was placed',
      pinUpdated: 'The pin "{name}" was edited ({n} fields)',
      pinUpdatedField: 'The pin "{name}" — {field} was changed',
      pinDeleted: 'The pin "{name}" was removed',
      chronicleUpdated: 'The chronicle was written in — {seasons}',
      journalUpdated: 'Wrote in the GM journal — {parts}',
      toneAndContentUpdated: 'Wrote in the tone & content',
      rowsChanged: '{n} entries were changed',
    },
    line: {
      charactersUnlinked: '{n} characters unlinked',
      relationsRemoved: '{n} bonds cut',
      pinsRemoved: '{n} pins removed',
    },
    field: {
      name: 'name', role: 'role', type: 'type', notes: 'notes', traits: 'traits',
      tags: 'tags', location: 'location', location_id: 'linked place', color: 'colour', description: 'description',
      steading: 'steading sheet', threat: 'threat sheet', statblock: 'stat block', gm_only: 'visibility',
      gm_notes: 'GM notes', entries: 'chronicle', gm_entries: 'GM chronicle',
      relation_type: 'kind of bond', relation_detail: 'detail', label: 'label',
      note: 'note', x: 'position', y: 'position', image_path: 'image',
      image_width: 'image size', image_height: 'image size',
      current_year: 'current season', current_season: 'current season',
      wonders: 'wonderings',
    },
    reason: {
      characterMissing: 'the character it was linked to is gone',
      mapMissing: 'the map it belonged to is gone',
      locationMissing: 'the place it was linked to is gone',
      exists: 'it already exists',
      rowMissing: 'it no longer exists',
      alreadyGone: 'it was already gone',
      generic: 'something unexpected is in the way',
    },
    confirm: {
      title: 'Revert this change?',
      intro: 'This restores the following as they were. The reversion is written to the Ledger too, so it can be reverted in turn.',
      changedSince: 'Changed since — reverting will overwrite the later edit',
      groupNote: 'This is one of {n} edits made in the same run — reverting undoes all {n} together.',
      unrestorable: "Can't be restored: {reason}",
      note: 'Restored, but {reason}',
      thumbNote: 'A restored map has no preview thumbnail until it is regenerated; the image itself is intact.',
      submit: 'Revert',
      submitting: 'Restoring…',
    },
    result: {
      done: 'Reverted.',
      partial: 'Reverted — but {n} items could not be restored.',
      none: 'Nothing could be restored.',
    },
  },
  threat: {
    portents: 'Grim portents',
    addPortent: 'Add portent',
    impendingDoom: 'Impending doom',
    doomAtHand: 'at hand',
    stakes: 'Stakes',
    addStake: 'Add stake',
    gmMoves: 'GM moves',
    addMove: 'Add move',
  },
  statblock: {
    title: 'Stat block',
    hp: 'HP',
    armor: 'Armor', armorNote: 'Armor note',
    damage: 'Damage',
    special: 'Special quality',
    moves: 'Moves', addMove: 'Add move',
    // Deux libellés pour un même champ : sur une MENACE la ligne « Type » est
    // déjà prise par le type de menace, la catégorie de
    // bestiaire n'y est donc que le tampon — « Icon ». Ailleurs elle EST le
    // type de la créature. Pas d'option vide dans les deux cas : le sélecteur
    // n'apparaît que sous la case « Monster », qui EST le « aucun ».
    kind: 'Icon',
    kindType: 'Type',
    monster: 'Monster',
    monsterHint:
      'Monsters get a bestiary type (which sets their stamp) and tags. Independent of Follower — a tamed beast is both.',
    cost: 'Cost', loyalty: 'Loyalty',
    follows: 'Follows', party: 'The party',
    follower: 'Follower',
    followerHint:
      'Followers get a cost, loyalty and a leader — and their sheet becomes visible to players.',
    gmOnlyHint: 'Only you can see this stat block — players see it once the NPC is a follower.',
  },
  errors: {
    boundaryTitle: 'Something went wrong',
    boundaryDefault: 'Something broke while drawing this page. Try reloading.',
    forbidden: 'You don\'t have permission to do that.',
  },
  connectLlm: {
    menuLabel: 'Connect to Claude',
    overline: 'Grimoire',
    title: 'Connect to Claude',
    intro:
      'Run this once in your terminal to let Claude Code read this grimoire while you plan — the party, places, maps, recent seasons, and (if you are the GM) the margin notes. It can also write back what you tell it to: recaps, character updates, steading numbers. Every write lands in the Ledger and can be undone.',
    roleGm: 'This command carries your GM access — Claude will see the margin notes and can write to the GM strand.',
    rolePlayer: 'This command carries player access — Claude sees what players see, with no GM layer. Sign in with the GM password first if you want the margins.',
    roleViewer: 'This command carries read-only viewer access — Claude sees what visitors see, with no GM layer and no writing.',
    commandLabel: 'Command',
    copy: 'Copy command',
    copied: 'Command copied',
    warning:
      'The command contains your own access to this grimoire. Anyone who gets it can read and edit everything you can, so keep it out of shared channels and screenshots.',
    close: 'Done',
  },
  exportVault: {
    menuLabel: 'Export the grimoire',
    overline: 'Grimoire',
    title: 'Export the grimoire',
    intro:
      'Download the whole grimoire as a folder of Markdown notes — readable anywhere, and a complete backup. Open it in Obsidian and you have the campaign offline: sheets, places, the chronicle, maps and the relation web.',
    roleGm:
      'You are the GM, so this carries everything, the margin notes and GM strand included.',
    rolePlayer:
      'This carries what players see. The GM layer was never visible to this export, so it will not be in the file.',
    roleViewer:
      'This carries what visitors see. The GM layer was never visible to this export, so it will not be in the file.',
    contents: 'What it will contain',
    countCharacters: 'Characters',
    countLocations: 'Locations',
    obsidian:
      'Everything works as plain Markdown. Obsidian adds a little on top: the included table views need nothing installed, while the statblocks and maps read best with the Fantasy Statblocks and Leaflet plugins.',
    stageReading: 'Reading the grimoire…',
    stageImages: 'Fetching map images ({done} of {total})…',
    stageWriting: 'Writing the vault…',
    action: 'Download',
    working: 'Preparing…',
    error: 'The export could not be built — please try again.',
    close: 'Close',
  },
};
