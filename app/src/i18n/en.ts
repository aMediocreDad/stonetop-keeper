// English strings — default language.
// Keys are dot-namespaced. Keep them stable; values are free to evolve.
// Voice and terminology: see README.md in this directory.

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
    loadError: 'Could not load. Check your connection and try again.',
    saveError: 'Could not save. Check your connection and try again.',
  },

  app: {
    name: 'Ink & Stone',
  },

  offline: {
    banner: 'No connection. Showing saved data where available. Changes cannot reach the server yet.',
    restored: 'Connection restored.',
    saveBlocked: 'No connection. This edit is kept here and will be retried when you reconnect.',
    mapUnavailable: 'This map has not been saved for offline use yet.',
    mapsSaved: '{saved} of {total} map images available offline',
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
    overline: 'A shared journal for Stonetop',
    description1:
      'Keep track of your campaign’s characters and places, and write down what happened each session.',
    description2:
      'Share an invite code with your group. No account needed.',
    create: {
      title: 'Start a journal',
      subtitle: 'For a new or ongoing campaign',
      cta: 'Create',
    },
    join: {
      title: 'Join your group',
      subtitle: 'Use the invite code from your group',
      cta: 'Enter invite code',
    },
    footer: {
      basedOn: 'Based on Ink & Stone by Zephyr-jdr',
      assetCredit: 'Graphic elements by Jason Lutes · CC BY 4.0',
    },
  },

  spaceCreated: {
    overline: 'New journal',
    title: 'Your journal is ready',
    nameLabel: 'Name',
    loginCodeLabel: 'Invite code',
    copyCode: 'Copy',
    copied: 'Copied',
    warningTitle: 'Save your invite code',
    warningText: 'Share this code with your group so they can join. Keep it to sign in on another device. You can also find it beneath the journal title.',
    // Closing this dialog opens the newly created journal.
    gotIt: 'Open the journal',
  },

  header: {
    home: 'Ink & Stone — home',
    space: 'Journal',
    copyInvite: 'Copy invite link',
    inviteCopied: 'Invite link copied',
    leave: 'Sign out of this journal',
  },

  createSpace: {
    overline: 'New journal',
    title: 'Create a campaign journal',
    nameLabel: 'Group name',
    namePlaceholder: 'e.g. Thursday group',
    gmPasswordLabel: 'GM password',
    gmPasswordHint: 'Allows access to GM notes and settings, including deleting the journal.',
    playerPasswordLabel: 'Player password (optional)',
    playerPasswordHint: 'Allows players to edit shared campaign content, but not GM-only content or journal settings.',
    submit: 'Create journal',
    submitting: 'Creating…',
    errorRequired: 'Enter a group name and GM password.',
    errorGeneric: 'Could not create the journal. Try again.',
  },

  joinSpace: {
    overline: 'Existing journal',
    title: 'Join a campaign journal',
    codeLabel: 'Invite code or URL',
    codePlaceholder: 'e.g. xx-xxx',
    passwordLabel: 'Password',
    passwordPlaceholder: 'GM or player password',
    passwordOptionalHint: 'Leave blank for read-only access, if the GM has enabled it.',
    submit: 'Join the journal',
    submitting: 'Connecting…',
    errorRequired: 'Enter an invite code.',
    errorInvalid: 'No journal found with that code. Check it and try again.',
    errorWrongPassword: 'That password doesn\'t match.',
    errorGeneric: 'Could not join the journal. Try again.',
  },

  dashboard: {
    countOne: '{n} entry',
    countOther: '{n} entries',
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
    searchLabel: 'Search the journal',
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
    emptySearch: 'No entries match these filters.',
    emptyAll: 'No entries yet. Add a character, group, threat, or discovery.',
  },

  deleteSpace: {
    overline: 'Delete journal',
    title: 'Delete this journal',
    button: 'Delete this journal',
    warning: 'You are about to delete "{name}".',
    warningCounts:
      'All journal content will be deleted, including {characters} entries, {relations} bonds, and {locations} locations.',
    warningIrreversible: 'This cannot be undone.',
    passwordLabel: 'GM password',
    passwordPlaceholder: 'Re-enter the GM password',
    confirmNameLabel: 'Type "{name}" to confirm',
    submit: 'Permanently delete journal',
    submitting: 'Deleting…',
    deleted: 'Journal "{name}" has been deleted',
    errorWrongPassword: 'That password doesn\'t match.',
    errorGeneric: 'Could not delete the journal. Try again.',
  },

  spaceSettings: {
    overline: 'Journal',
    title: 'Settings',
    currentPasswordLabel: 'Current GM password',
    gmPasswordLabel: 'New GM password',
    gmPasswordPlaceholder: 'Leave blank to keep the current one',
    playerPasswordLabel: 'Player password',
    playerPasswordPlaceholder: 'Leave blank to turn off',
    publicReadLabel: 'Read-only access with the invite code alone',
    publicReadHint: 'Anyone with the code can read the journal without a password. They cannot edit or see GM-only content.',
    save: 'Save',
    saving: 'Saving…',
    saved: 'Settings saved',
    errorWrongPassword: 'That password doesn\'t match.',
    errorGeneric: 'Could not save settings. Try again.',
    menuLabel: 'Journal settings',
  },

  location: {
    sheetOverline: 'Location',
    notFound: 'Location not found.',
    backToGrimoire: 'Back to the journal',
    residents: 'Residents',
    residentCountOne: '{n} resident',
    residentCountOther: '{n} residents',
    noResidents: 'No characters assigned to this location. Choose it in a character\'s sheet to add them here.',
    descriptionLabel: 'Description',
    descriptionPlaceholder: 'e.g. A market town on the river',
    notes: 'Notes',
    notesPlaceholder: 'What does the group know about this place?',
    tags: 'Tags',
    tagPlaceholder: 'Add a tag…',
    promote: 'Add steading sheet…',
    promoteConfirm: 'Add a steading sheet to this location? Use this for your home steading to track its stats, improvements, and assets.',
    deleteSteadingWarning: 'Delete this location and its steading sheet, including stats, improvements, and assets? This cannot be undone.',
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
    notFound: 'Character not found.',
    saveError: 'Could not save the sheet. Check your connection and try again. Your changes are still on the page.',
    backToGrimoire: 'Back to the journal',
    delete: 'Delete',
    deleteConfirm: 'Permanently delete this character?',
    typePC: 'PC',
    typeNPC: 'NPC',
    typePCFull: 'Player character',
    typeNPCFull: 'Non-player character',
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
    instinctGmOnlyHint: 'Hidden from players unless this NPC is a follower.',
    // Une seule colonne (`dead`), lue selon le type — comme `role`. Ces deux
    // libellés servent DEUX FOIS : la case de la fiche et la pastille de la
    // carte. Un libellé neutre au-dessus des deux (« Gone from play ») disait
    // la colonne, pas la chose — et personne à la table ne dit ça.
    deceased: 'Deceased',
    disbanded: 'Disbanded',
    deadHint: 'This status does not delete the entry or its bonds.',
    rolePlaceholder: 'e.g. smith, innkeeper, someone\'s brother',
    locationPlaceholder: 'Choose a location…',
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
    interestingPlaceholder: 'What can they learn?',
    usefulPlaceholder: 'How can they use it?',
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
    trackMax: 'Track maximum',
    // Same shape as moveFallbackName: the remove button's accessible name
    // must never read as a bare "Delete" for a fresh, unlabelled row.
    trackFallbackName: 'track',
    notes: 'Description & notes',
    noteEditorPlaceholder: 'Add notes…',
    // « Bond » partout côté utilisateur : la page graphe (« Web of bonds »),
    // son panneau et la prose du Ledger le disaient déjà — la fiche disait
    // « Relations » et le bouton du tableau de bord « Relationships ». Un
    // concept, un nom. (Le modèle de données garde `relation`.)
    relations: 'Bonds',
    noRelation: 'No bonds recorded yet.',
    addRelation: 'Add a bond',
    pickCharacter: 'Choose a character…',
    detailPlaceholder: 'e.g. son of, childhood friend (optional)',
    // Nom accessible des champs « détail » (ajout ET édition) : les deux
    // placeholders ci-dessus/dessous sont des exemples, pas des noms — un
    // lecteur d'écran annonçait la phrase d'exemple entière comme libellé.
    relationDetail: 'Bond detail',
    editRelation: 'Edit bond',
    deleteRelation: 'Delete bond',
    deleteRelationConfirm: 'Delete this bond?',
    relationPrecisionPlaceholder: 'e.g. son of, cousin',
    relationCountOne: '{n} bond',
    relationCountOther: '{n} bonds',
    members: 'Members',
    noMembers: 'No members yet.',
    addMember: 'Add a member',
    pickMember: 'Choose a character…',
    removeMember: 'Remove member',
    removeMemberConfirm: 'Remove this character from the group? Their sheet will be kept.',
    leadsTo: 'Leads to',
    leadsHere: 'What leads here',
    noLeads: 'No linked entries yet.',
    // The promoted slot, per discovery kind (lib/character/promotedRelations).
    // The `*Here` strings are what the sheet at the OTHER end reads.
    pointsTo: 'Points to',
    cluesHere: 'Clues pointing here',
    noCluesHere: 'No clues point here yet.',
    // Empty outgoing slot, per kind — `noLeads` above still serves site and
    // opportunity, whose heading is the plain "Leads to".
    noPointsTo: 'No linked entries yet.',
    noHolder: 'No holder recorded.',
    noEncounterWith: 'No participants linked yet.',
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
    hint: 'Choose a name and type. You can fill in the details on the sheet.',
    nameLabel: 'Name',
    namePlaceholder: 'e.g. Bryn',
    typeLabel: 'Type',
    playbookNone: 'No playbook',
    submit: 'Create character',
    submitting: 'Creating…',
    groupNamePlaceholder: 'e.g. Town militia',
    groupRolePlaceholder: 'e.g. Local traders, village council',
    groupSubmit: 'Create group',
    threatSubmit: 'Create threat',
    discoverySubmit: 'Create discovery',
  },

  locations: {
    overline: 'Locations',
    title: 'Manage locations',
    empty: 'No locations yet. Create one below.',
    addOverline: 'Add a location',
    addPlaceholder: 'Location name',
    create: 'Create',
    rename: 'Rename / change color',
    delete: 'Delete',
    cancel: 'Cancel',
    save: 'Save',
    pickerPlaceholder: 'Choose a location…',
    pickerNone: 'No location',
    pickerCreateNew: 'Create a new location…',
    customColor: 'Custom',
    pickColor: 'Pick a color',
    createAndSelect: 'Create & select',
    deleteConfirm: 'Delete the location "{name}"?',
    deleteConfirmWithChars:
      'Delete the location "{name}"?\n\nEntries assigned here: {n}. Their location will be cleared, but their sheets will be kept.',
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
    error: 'Could not display the bonds.',
    empty: 'No entries to show. Add characters to the journal to see them here.',
    searchPlaceholder: 'Search…',
    visibleCount: '{visible} / {total} entries · {rels} bonds',
    sectionLocations: 'Locations',
    sectionType: 'Type',
    sectionRelationTypes: 'Bond types',
    sectionForces: 'Forces',
    selectAll: 'all',
    selectNone: 'none',
    noLocation: 'No location',
    noLocationDefined: 'No locations yet.',
    typePC: 'Player characters',
    typeNPC: 'Non-player characters',
    typeGroup: 'Groups',
    typeThreat: 'Threats',
    typeDiscovery: 'Discoveries',
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
    legendNode: 'Colors & symbols',
    legendText:
      'Color shows location. Gold rings mark PCs; outlines enclose group members. Drag entries to rearrange them.',
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
    locationLabel: 'Linked location',
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
    pinTypeNote: 'Note',
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
    saveError: 'Could not save the chronicle. Check your connection and try again. Keep this tab open to preserve your latest changes.',
    backlinksTitle: 'In the chronicle',
    viewWheel: 'Wheel',
    viewAnnals: 'Entries',
    annalsTitle: 'Chronicle entries',
    annalsEmpty: 'No entries yet. Add one to record what happened.',
    gmStrand: 'GM notes',
    gmStrandHint: 'Hidden from players and visitors.',
    gmSaveError: 'Could not save the GM chronicle notes.',
    presenceGm: 'The GM is writing here',
    presencePlayer: 'Another player is writing here',
    conflictText: 'Someone else changed this entry while you were editing. Choose which version to keep.',
    conflictTheirs: 'Their version',
    conflictTakeTheirs: 'Use their version',
    conflictKeepMine: 'Keep my version',
  },

  relation: {
    friend: 'Friend / ally',
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
    overline: 'Getting started',
    title: 'Your campaign notes',
    chroniclesTitle: 'Chronicle',
    chroniclesText: 'Add session notes under the season when they happened.',
    graphTitle: 'Bonds',
    graphText: 'Select a character to see their relationships and open the linked sheets.',
    mapsTitle: 'Maps',
    mapsText: 'Map pins link to locations, character sheets, or notes.',
    claudeTitle: 'Connect to Claude',
    claudeText: 'If you use Claude Code, you can connect it from the journal menu. It will be able to read and edit campaign content.',
    gotIt: 'Back to the journal',
  },
  gm: {
    badge: 'GM',
    onlyLabel: 'GM only',
    onlyHint: 'Hidden from players and visitors.',
    notesTitle: 'GM notes',
    notesHint: 'Hidden from players and visitors.',
    notesEmpty: 'No GM notes yet.',
    notesEdit: 'Edit the GM notes',
    relationOnly: 'GM-only bond',
  },
  gmJournal: {
    dashboardButton: 'GM journal',
    title: 'GM journal',
    overline: 'Hidden from players and visitors',
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
    deleteTitle: 'Delete this question?',
    deleteText: 'The question will be removed. The change will be recorded in the Ledger.',
    empty: 'No open questions yet.',
    saveError: 'Could not save the GM journal. Check your connection and try again.',
  },
  toneAndContent: {
    title: 'Tone & content',
    overline: 'Your group’s agreements about the game',
    // The CATS headings, as a prompt rather than seeded content: the editor
    // offers h2/h3 and the table writes its own.
    hint: 'Concept · Aim · Tone · Subject matter. Add a heading for each. Anyone in the group can ask to leave something out, keep it off-screen, or handle it differently, at any time and without giving a reason.',
    empty: 'No agreements recorded yet.',
    readOnly: 'You have read-only access.',
    saveError: 'Could not save tone & content. Check your connection and try again.',
  },
  ledger: {
    menuLabel: 'The Ledger',
    title: 'The Ledger',
    overline: 'Every change to the wiki is recorded here',
    empty: 'No changes recorded yet.',
    loadMore: 'Earlier entries',
    undo: 'Revert',
    editCount: '{n} edits',
    actorGm: 'GM',
    actorPlayer: 'A player',
    actorUnknown: 'Unattributed',
    headline: {
      characterCreated: '{name} was added',
      characterUpdated: '{name} was edited ({n} fields)',
      characterUpdatedField: 'Changed {field} for {name}',
      characterDeleted: '{name} was deleted',
      locationCreated: '{name} was added',
      locationUpdated: '{name} was edited ({n} fields)',
      locationUpdatedField: 'Changed {field} for {name}',
      locationDeleted: '{name} was deleted',
      mapCreated: 'The map "{name}" was added',
      mapUpdated: 'The map "{name}" was edited ({n} fields)',
      mapUpdatedField: 'Changed {field} for the map "{name}"',
      mapDeleted: 'The map "{name}" was deleted',
      relationCreated: 'A bond was added: {name}',
      relationUpdated: 'The bond {name} was edited ({n} fields)',
      relationUpdatedField: 'Changed {field} for the bond {name}',
      relationDeleted: 'The bond {name} was deleted',
      pinCreated: 'The pin "{name}" was placed',
      pinUpdated: 'The pin "{name}" was edited ({n} fields)',
      pinUpdatedField: 'Changed {field} for the pin "{name}"',
      pinDeleted: 'The pin "{name}" was removed',
      chronicleUpdated: 'The chronicle was edited: {seasons}',
      journalUpdated: 'The GM journal was edited: {parts}',
      toneAndContentUpdated: 'Tone & content was edited',
      rowsChanged: '{n} entries were changed',
    },
    line: {
      charactersUnlinked: '{n} characters unlinked',
      relationsRemoved: '{n} bonds removed',
      pinsRemoved: '{n} pins removed',
    },
    field: {
      name: 'name', role: 'role', type: 'type', notes: 'notes', traits: 'traits',
      tags: 'tags', location: 'location', location_id: 'linked location', color: 'color', description: 'description',
      steading: 'steading sheet', threat: 'threat sheet', statblock: 'stat block', gm_only: 'visibility',
      gm_notes: 'GM notes', entries: 'chronicle', gm_entries: 'GM chronicle',
      relation_type: 'kind of bond', relation_detail: 'detail', label: 'label',
      note: 'note', x: 'position', y: 'position', image_path: 'image',
      image_width: 'image size', image_height: 'image size',
      current_year: 'current season', current_season: 'current season',
      wonders: 'questions',
    },
    reason: {
      characterMissing: 'the linked character no longer exists',
      mapMissing: 'the map it belonged to no longer exists',
      locationMissing: 'the linked location no longer exists',
      exists: 'it already exists',
      rowMissing: 'it no longer exists',
      alreadyGone: 'it was already deleted',
      generic: 'an unexpected error occurred',
    },
    confirm: {
      title: 'Revert this change?',
      intro: 'This restores the items below to their previous state. Reverting is also recorded in the Ledger and can be undone.',
      changedSince: 'Edited since this change. Reverting will overwrite the later edit.',
      groupNote: 'This change is part of a set of {n} edits. Reverting will undo all {n}.',
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
      'Adds a bestiary type, icon, and tags. A monster can also be a follower.',
    cost: 'Cost', loyalty: 'Loyalty',
    follows: 'Follows', party: 'The party',
    follower: 'Follower',
    followerHint:
      'Adds cost, loyalty, and a leader. Players can see a follower’s sheet.',
    gmOnlyHint: 'Hidden from players unless this NPC is a follower.',
  },
  errors: {
    boundaryTitle: 'Something went wrong',
    boundaryDefault: 'This page could not be displayed. Try reloading.',
    forbidden: 'You don\'t have permission to do that.',
  },
  connectLlm: {
    menuLabel: 'Connect to Claude',
    overline: 'Journal',
    title: 'Connect to Claude',
    intro:
      'Run this command in your terminal to connect Claude Code to the journal. It can read campaign content and make edits, such as adding recaps or updating character sheets. Its changes are recorded in the Ledger, where you can review and revert them.',
    roleGm: 'This command gives Claude GM access, including permission to read and edit GM-only content.',
    rolePlayer: 'This command gives Claude player access. It cannot see GM-only content. For GM access, sign in as GM and copy a new command.',
    commandLabel: 'Command',
    copy: 'Copy command',
    copied: 'Command copied',
    warning:
      'This command contains your access token. Anyone with it can read and edit the same content you can. Do not share it in messages or screenshots.',
    close: 'Done',
  },
  exportVault: {
    menuLabel: 'Export the journal',
    overline: 'Journal',
    title: 'Export the journal',
    intro:
      'Download a ZIP of campaign notes to read offline in Obsidian or another Markdown app. Map images are included when available. This is not a full backup: it does not include the Ledger, passwords, or access settings.',
    roleGm:
      'Includes GM-only content, such as GM notes and chronicle entries.',
    rolePlayer:
      'Includes only content visible to players. GM-only content is excluded.',
    contents: 'Entries & locations',
    countCharacters: 'Entries',
    countLocations: 'Locations',
    obsidian:
      'The notes use Markdown. In Obsidian, table views work without plugins. For formatted stat blocks and interactive maps, install Fantasy Statblocks and Leaflet.',
    stageReading: 'Reading journal content…',
    stageImages: 'Downloading map images ({done} of {total})…',
    stageWriting: 'Preparing ZIP file…',
    action: 'Download',
    working: 'Preparing…',
    error: 'Could not export the journal. Try again.',
    close: 'Close',
  },
};
