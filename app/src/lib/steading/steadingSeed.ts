import type { Lang } from '@/i18n';
import type { Steading, SteadingImprovement } from '@/types';

// =====================================================================
// LICENSE: The game content in this file is adapted from Stonetop,
// by Jeremy Strandberg (Lampblack & Brimstone), whose text is released
// under CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/).
// This adaptation (incl. the French translation) is likewise CC BY-SA 4.0
// — NOT the repo's MIT license. See NOTICE.md at the repo root.
// =====================================================================

// =====================================================================
// Contenu par défaut de la fiche de bourgade — playbook Steading officiel.
// Seedé À LA CRÉATION dans la langue de l'UI ; ensuite c'est de la donnée
// utilisateur libre (les éditions ne se battent jamais avec les traductions).
// =====================================================================

export const STONETOP_DESCRIPTION: Record<Lang, string> = {
  en: 'A village of some 200 souls in the shadow of the Stone, at the edge of the Great Wood.',
  fr: "Un village d'environ 200 âmes à l'ombre de la Pierre, en lisière du Grand Bois.",
};

/**
 * Le lieu-bourgade par défaut que le CTA « créer la fiche » cherche puis crée.
 * Une seule définition, à côté du seed qu'elle accompagne — le reste de l'app
 * retrouve la bourgade par sa fiche (`findSteadingLocation`), jamais par nom.
 */
export const STONETOP_NAME = 'Stonetop';
export const STONETOP_COLOR = '#7AA177';

interface SeedContent {
  resources: string[];
  fortifications: string[];
  assets: string[];
  improvements: Omit<SteadingImprovement, 'completed' | 'custom'>[];
}

const EN: SeedContent = {
  resources: [
    'Farming (beans, potatoes, oats, barley)',
    'Hunting/trapping (fur, meat, hides)',
    'Distilling (whisky)',
    'Stone (collected from the Old Wall)',
    'Cistern (filled with rain, snow)',
    'Tradesfolk (midwife, potter, publican, smith, tanner)',
    "Trade: Gordin's Delve (metal, tools)",
    'Trade: Marshedge (textiles, herbs, glass)',
  ],
  fortifications: [
    'Village militia',
    'The Ringwall (low, stone)',
    '3 watchtowers',
    'Spears & shields in every home',
    'Some bows',
  ],
  assets: [
    'A pair of hardy draft horses (followers: HP 10 each, d6+3 damage; cost: care & grooming)',
    'A pair of horse-drawn plows, iron',
    'A pair of carts (plus horse harness)',
    'A wagon (plus horse harness)',
  ],
  improvements: [
    {
      id: 'additional-housing',
      name: 'Additional Housing',
      summary: "It's getting crowded! We need more room to live.",
      requirements: [
        { text: 'Either: an exceptional engineer/foreman, to design much roomier houses on the current land', done: false },
        { text: 'Or: building on parts of the fields (−1 Surplus generated with each autumn harvest)', done: false },
        { text: 'Pull Together ×5 — each requires 1 season, 1 Surplus, and a wagonload of timber & supplies (Value 2)', done: false },
      ],
      effects: 'Increase Fortunes by 1 and add the new homes to the map. Henceforth, when you consume Surplus in winter, treat Population as 1 lower than it is.',
    },
    {
      id: 'aurochs-hunting',
      name: 'Aurochs Hunting',
      summary: 'Large herds form on the Flats in spring. Stonetop has never learned to hunt them.',
      requirements: [
        { text: '2 of: a Herd of Horses (and hunters to ride them) / cooperating with the Hillfolk / a cunning plan', done: false },
        { text: 'A successful first hunt (played out in detail)', done: false },
      ],
      effects: 'Add "Aurochs hunting (meat, hide, horn)" to Resources. Henceforth, when you lead the spring hunt, roll +Defenses: 1d4 Surplus, with complications on a 9 or less.',
    },
    {
      id: 'expanded-trades',
      name: 'Expanded Trades',
      summary: 'Specialization is the key to prosperity!',
      requirements: [
        { text: 'One of these improvements: Harnessing the Stream / Raincatching / Mill', done: false },
        { text: 'At least 3 exceptional tradesfolk established (chandler, glassblower, weaver, potter, smith… with tools & supplies, Value 2-3)', done: false },
      ],
      effects: 'Increase Prosperity by 1 while the requirements are met; decrease it by 1 if you cease to meet them.',
    },
    {
      id: 'greater-harvest',
      name: 'Greater Harvest',
      summary: 'Beyond the Old Wall, the prairie grass of the Flats chokes out any crops we try to grow.',
      requirements: [
        { text: 'One of: doubling the yield of crops inside the Old Wall / clearing & taming new fields beyond it', done: false },
      ],
      effects: 'Increase Fortunes by 1. Henceforth, when the autumn harvest is complete, gain +1d4 Surplus.',
    },
    {
      id: 'harnessing-the-stream',
      name: 'Harnessing the Stream',
      summary: 'A shallow creek flows just below the town. If only it could be harnessed!',
      requirements: [
        { text: 'A reservoir for the Stream to pool in, and some way for water to flow uphill', done: false },
        { text: "A series of aqueducts, from the Stream's source to Stonetop", done: false },
      ],
      effects: 'Increase Fortunes by 1 and add it to Resources. Henceforth, when spring breaks forth and you roll 7+ with Fortunes, the steading generates 1 Surplus.',
    },
    {
      id: 'herd-of-horses',
      name: 'Herd of Horses',
      summary: 'Imagine what we could do with a dozen fine steeds.',
      requirements: [
        { text: 'A site for a proper stable and corral', done: false },
        { text: 'Pull Together to build them (a month + a wagonload of timber, Value 2)', done: false },
        { text: 'Someone skilled in riding and training horses', done: false },
        { text: 'Acquiring a small herd, about a dozen (trade, or catching wild ones)', done: false },
        { text: 'Training/breaking them to the saddle and plow', done: false },
        { text: 'Additional saddles, harness, plows, etc. (Value 2)', done: false },
        { text: 'Pull Together to teach a couple dozen villagers to ride (a season + 1 Surplus)', done: false },
        { text: 'Someone to mind the herd and stable, full time', done: false },
      ],
      effects: 'Increase Fortunes by 1; replace the draft horses with the herd on Assets. Pull Together with horses takes half as long and costs half as much; Requisitioning half the herd or less treats a 6− as a 7-9. The herd grows each summer and consumes Surplus each winter (1 per 6 grown/yearling horses).',
    },
    {
      id: 'heroic-reputation',
      name: 'Heroic Reputation',
      summary: "Few have heard of Stonetop's heroes. Yet.",
      requirements: [
        { text: "Any 3 of: impressing a band of Hillfolk / braving a lake and returning with proof / saving many Marshedge lives / saving many Gordin's Delve lives / saving someone from beyond Marshedge / hiring a minstrel to tell your tales (Value 2)", done: false },
      ],
      effects: "Gain the move: when you first meet someone from beyond Stonetop, roll +Fortunes — on a hit, say what they've heard about you or Stonetop (10+: also gain advantage on your next move against them).",
    },
    {
      id: 'inn',
      name: 'Inn',
      summary: "The public house offers a common room and shelter for a few horses, but it's hardly a proper inn.",
      requirements: [
        { text: 'A designated building site', done: false },
        { text: 'A competent engineer/foreman', done: false },
        { text: 'Furnishings, equipment, and material (Value 3)', done: false },
        { text: 'Pull Together ×2 — each requires 1 season, 1 Surplus, and timber/supplies (Value 2)', done: false },
        { text: 'A small, devoted staff (innkeep, cook, ostler…)', done: false },
      ],
      effects: 'Increase Fortunes by 1; name the inn, add it to Resources and the map. Each season change, whoever is friendliest rolls +Fortunes to ask the GM about the wider world. Once per season, spend 1 Surplus to bring folks together at the inn and clear one debility.',
    },
    {
      id: 'market',
      name: 'Market',
      summary: 'Stonetop is at most an afterthought for traders in the region. We need to change that.',
      requirements: [
        { text: 'A compelling good/service exclusive to Stonetop, or another reason to visit (place of pilgrimage…)', done: false },
        { text: 'A dedicated market site (add it to the map)', done: false },
        { text: 'A trusted arbiter, able to enforce their own rulings on matters of trade', done: false },
        { text: 'Four seasons in operation without notable incidents of violence, banditry, theft…', done: false },
      ],
      effects: 'Increase Prosperity by 1 while the requirements are met (−1 if lost). When the seasons change to spring, summer, or autumn with the market active and Population +1 or better, the Market generates 1 Surplus.',
    },
    {
      id: 'mill',
      name: 'Mill',
      summary: "We've got our pick of millstones. With a mill, we'd have better bread and more time for other crafts.",
      requirements: [
        { text: 'An exceptional engineer/foreman', done: false },
        { text: 'A convenient, consistent power source (wind, waterwheel, Herd of Horses, magic…)', done: false },
        { text: 'A building site able to harness that power source', done: false },
        { text: 'Pull Together ×2 — each requires a season, 1 Surplus, a wagonload of timber (Value 2), and rope & supplies (Value 2)', done: false },
        { text: 'A full-time miller', done: false },
      ],
      effects: 'Increase Fortunes by 1; add "Mill" to Resources and the map. Henceforth, the autumn harvest generates +1 Surplus, and supplies Outfitted from Stonetop have 1 extra use.',
    },
    {
      id: 'palisade',
      name: 'Palisade',
      summary: "A wall of sharpened logs, 10' tall, to keep evil at bay.",
      requirements: [
        { text: 'Lots of timber (~20-25 wagonloads, Value 3)', done: false },
        { text: 'A competent engineer/foreman', done: false },
        { text: 'Lots of rope, nails, pitch, etc. (Value 2)', done: false },
        { text: 'Pull Together, costing a month and 1 Surplus', done: false },
      ],
      effects: 'Increase Fortunes by 1; add "Palisade" to Fortifications and the map. When you take advantage of the palisade, you have advantage to Deploy.',
    },
    {
      id: 'raincatching',
      name: 'Raincatching',
      summary: 'Filling the cistern takes so much work. Surely, we can do better!',
      requirements: [
        { text: 'An exceptional engineer/foreman, to design a cunning system of roofs, gutters, and conduits', done: false },
        { text: 'Enough slate/terracotta to roof all the buildings and build the gutters and conduits (Value 3)', done: false },
        { text: 'Pull Together ×3 — each requires 1 season and 1 Surplus', done: false },
      ],
      effects: 'Increase Fortunes by 1; add "Raincatching" to Resources. Henceforth, when summer comes and you roll 7+ with Fortunes, the steading generates 1 Surplus.',
    },
    {
      id: 'standing-watch',
      name: 'Standing Watch',
      summary: 'Some full-time warriors would make us all safer, no?',
      requirements: [
        { text: 'A veteran warrior, able to command a crowd', done: false },
        { text: 'At least 6 warriors, well-equipped and willing', done: false },
        { text: 'The village leaders agreeing to support warriors who train and keep watch full-time', done: false },
      ],
      effects: 'Add "standing watch" to Fortifications. At the start of each season the watch consumes 1 Surplus or disbands. When you specifically involve the watch in a move, treat Defenses as 1 higher.',
    },
    {
      id: 'stone-wall',
      name: 'Stone Wall',
      summary: 'No mere palisade of wood, but a mighty rampart. We have the stone, after all…',
      requirements: [
        { text: 'An exceptional engineer/foreman', done: false },
        { text: 'A stonecutter with an able crew', done: false },
        { text: 'Equipment, tools, and material (Value 3)', done: false },
        { text: 'Pull Together ×4 — each costs 1 season, 1 Surplus, and supplies (Value 2)', done: false },
      ],
      effects: 'Add "Stone Wall" to Fortifications (erase "Palisade" if you had it) and the map. Advantage to Deploy when you take advantage of it; when winter grips the land, the steading consumes 1 less Surplus.',
    },
    {
      id: 'township',
      name: 'Township',
      summary: 'Will this ever be more than a backwater village?',
      requirements: [
        { text: 'Population +3 for 4 consecutive seasons', done: false },
        { text: 'Additional Housing', done: false },
        { text: 'Raincatching OR Harnessing the Stream', done: false },
        { text: 'At least 4 other improvements', done: false },
        { text: 'A formal government of some sort', done: false },
      ],
      effects: 'Change Size to town and Population to +0. Advantage to Muster, Pull Together, and Trade & Barter; spring and summer generate Surplus equal to Population+1; but winter consumes 2d6+Population Surplus instead of 1d4+Population.',
    },
    {
      id: 'weapons-of-war',
      name: 'Weapons of War',
      summary: 'Spears are great, but how about axes, picks, swords?',
      requirements: [
        { text: 'Either: acquiring a few dozen good swords, battleaxes, maces, flails, warhammers… (Value 3)', done: false },
        { text: 'Or: a smith with full staff and upgraded tools (Value 2), a cartload of good iron ore (Value 2), and 4 seasons of work', done: false },
        { text: 'A veteran warrior, able to command a crowd', done: false },
        { text: 'Pull Together to train the militia with the new weapons (a season + 1 Surplus)', done: false },
      ],
      effects: 'Increase Defenses by 1; add "Weapons of War" to Fortifications. Each spring the village must spend 1 Surplus on upkeep. When Outfitting from Stonetop, war weapons count as common items; battleaxes and swords get piercing equal to current Prosperity.',
    },
    {
      id: 'well-trained-militia',
      name: 'Well-Trained Militia',
      summary: 'Everyone can use a spear and shield, but some hard drilling could make us a force to be reckoned with.',
      requirements: [
        { text: 'A veteran warrior, able to command a crowd', done: false },
        { text: 'Tactic — Archery: barrages, ranged ambushes, sniping (Pull Together: a season of drills + 1 Surplus)', done: false },
        { text: 'Tactic — Cavalry (requires a Herd of Horses): fighting from horseback, charges (Pull Together: a season + 1 Surplus)', done: false },
        { text: 'Tactic — Formations: shield walls, wedges, phalanx (Pull Together: a season + 1 Surplus)', done: false },
        { text: 'Tactic — Readiness: patrolling, reacting quickly to alarms (Pull Together: a season + 1 Surplus)', done: false },
        { text: 'Tactic — Skirmishing: ambushes, harassing, hit-and-run (Pull Together: a season + 1 Surplus)', done: false },
      ],
      effects: 'When you Deploy using a trained tactic, you act from a position of strength (you pick the 7-9 consequence). With 2+ tactics trained, increase Defenses by 1. Each summer the militia spends 1 Surplus and a week practicing or loses a tactic.',
    },
  ],
};

const FR: SeedContent = {
  resources: [
    'Agriculture (haricots, pommes de terre, avoine, orge)',
    'Chasse/piégeage (fourrures, viande, peaux)',
    'Distillation (whisky)',
    'Pierre (collectée sur le Vieux Mur)',
    'Citerne (remplie de pluie et de neige)',
    'Artisans (sage-femme, potier, aubergiste, forgeron, tanneur)',
    "Commerce : Gordin's Delve (métal, outils)",
    'Commerce : Marshedge (textiles, herbes, verre)',
  ],
  fortifications: [
    'Milice villageoise',
    'Le Mur circulaire (bas, en pierre)',
    '3 tours de guet',
    'Lances et boucliers dans chaque foyer',
    'Quelques arcs',
  ],
  assets: [
    "Une paire de robustes chevaux de trait (suivants : 10 PV chacun, d6+3 dégâts ; coût : soins et toilettage)",
    'Une paire de charrues tirées par des chevaux, en fer',
    'Une paire de charrettes (plus harnais)',
    'Un chariot (plus harnais)',
  ],
  improvements: [
    {
      id: 'additional-housing',
      name: 'Logements supplémentaires',
      summary: "Ça commence à être à l'étroit ! Nous avons besoin de plus de place pour vivre.",
      requirements: [
        { text: "Soit : un ingénieur/contremaître exceptionnel, pour concevoir des maisons bien plus spacieuses sur le terrain actuel", done: false },
        { text: "Ou : construire sur une partie des champs (−1 Surplus généré à chaque récolte d'automne)", done: false },
        { text: "Se serrer les coudes ×5 — chaque fois nécessite 1 saison, 1 Surplus, et une charretée de bois d'œuvre et fournitures (Valeur 2)", done: false },
      ],
      effects: "Augmenter la Fortune de 1 et ajouter les nouvelles maisons sur la carte. Désormais, quand vous consommez du Surplus en hiver, traitez la Population comme si elle était 1 de moins qu'elle ne l'est.",
    },
    {
      id: 'aurochs-hunting',
      name: 'Chasse aux aurochs',
      summary: "De grands troupeaux se forment sur les Plaines au printemps. Stonetop n'a jamais appris à les chasser.",
      requirements: [
        { text: "2 parmi : une Harde de chevaux (et des chasseurs pour les monter) / coopérer avec le Peuple des collines / un plan astucieux", done: false },
        { text: "Une première chasse réussie (jouée en détail)", done: false },
      ],
      effects: 'Ajouter « Chasse aux aurochs (viande, cuir, corne) » aux Ressources. Désormais, quand vous menez la chasse de printemps, lancez +Défenses : 1d4 Surplus, avec complications sur 9 ou moins.',
    },
    {
      id: 'expanded-trades',
      name: 'Artisanat développé',
      summary: 'La spécialisation est la clé de la prospérité !',
      requirements: [
        { text: "L'une de ces améliorations : Domestiquer le ruisseau / Récupération des pluies / Moulin", done: false },
        { text: "Au moins 3 artisans exceptionnels établis (chandeliers, souffleurs de verre, tisserands, potiers, forgerons… avec outils et fournitures, Valeur 2-3)", done: false },
      ],
      effects: "Augmenter la Prospérité de 1 tant que les conditions sont remplies ; la diminuer de 1 si vous cessez de les remplir.",
    },
    {
      id: 'greater-harvest',
      name: 'Grandes récoltes',
      summary: "Au-delà du Vieux Mur, les herbes des Plaines étouffent toutes les cultures que nous tentons d'y faire pousser.",
      requirements: [
        { text: "L'un ou l'autre : doubler le rendement des cultures à l'intérieur du Vieux Mur / défricher et apprivoiser de nouveaux champs au-delà", done: false },
      ],
      effects: "Augmenter la Fortune de 1. Désormais, quand la récolte d'automne est terminée, gagnez +1d4 Surplus.",
    },
    {
      id: 'harnessing-the-stream',
      name: 'Domestiquer le ruisseau',
      summary: "Un ruisseau peu profond coule juste en contrebas du village. Si seulement on pouvait le dompter !",
      requirements: [
        { text: "Un réservoir où le ruisseau peut s'accumuler, et un moyen de faire monter l'eau", done: false },
        { text: "Une série d'aqueducs, depuis la source du ruisseau jusqu'à Stonetop", done: false },
      ],
      effects: "Augmenter la Fortune de 1 et l'ajouter aux Ressources. Désormais, quand le printemps arrive et que vous obtenez 7+ avec la Fortune, la bourgade génère 1 Surplus.",
    },
    {
      id: 'herd-of-horses',
      name: 'Harde de chevaux',
      summary: "Imaginez ce que nous pourrions faire avec une douzaine de beaux chevaux.",
      requirements: [
        { text: "Un emplacement pour une véritable écurie et un corral", done: false },
        { text: "Se serrer les coudes pour les construire (un mois + une charretée de bois d'œuvre, Valeur 2)", done: false },
        { text: "Quelqu'un de compétent pour monter et dresser les chevaux", done: false },
        { text: "Acquérir un petit troupeau, une douzaine environ (par le commerce ou en capturant des chevaux sauvages)", done: false },
        { text: "Les dresser à la selle et à la charrue", done: false },
        { text: "Selles supplémentaires, harnais, charrues, etc. (Valeur 2)", done: false },
        { text: "Se serrer les coudes pour apprendre à quelques dizaines de villageois à monter (une saison + 1 Surplus)", done: false },
        { text: "Quelqu'un pour s'occuper du troupeau et de l'écurie, à plein temps", done: false },
      ],
      effects: "Augmenter la Fortune de 1 ; remplacer les chevaux de trait par le troupeau dans les Atouts. Se serrer les coudes avec des chevaux prend deux fois moins de temps et coûte deux fois moins cher ; Réquisitionner la moitié du troupeau ou moins traite un 6− comme un 7-9. Le troupeau grandit chaque été et consomme du Surplus chaque hiver (1 par tranche de 6 chevaux adultes/yearlings).",
    },
    {
      id: 'heroic-reputation',
      name: 'Réputation héroïque',
      summary: "Peu de gens ont entendu parler des héros de Stonetop. Pas encore.",
      requirements: [
        { text: "3 parmi : impressionner une bande du Peuple des collines / braver un lac et en revenir avec une preuve / sauver de nombreuses vies à Marshedge / sauver de nombreuses vies à Gordin's Delve / sauver quelqu'un venu d'au-delà de Marshedge / engager un ménestrel pour raconter vos exploits (Valeur 2)", done: false },
      ],
      effects: "Gagnez l'action : quand vous rencontrez pour la première fois quelqu'un venant de l'extérieur de Stonetop, lancez +Fortune — en cas de succès, dites ce qu'ils ont entendu sur vous ou Stonetop (10+ : obtenez aussi un avantage à votre prochain jet contre eux).",
    },
    {
      id: 'inn',
      name: 'Auberge',
      summary: "La taverne offre une salle commune et un abri pour quelques chevaux, mais ce n'est guère une vraie auberge.",
      requirements: [
        { text: "Un emplacement désigné pour la construction", done: false },
        { text: "Un ingénieur/contremaître compétent", done: false },
        { text: "Ameublement, équipement et matériaux (Valeur 3)", done: false },
        { text: "Se serrer les coudes ×2 — chaque fois nécessite 1 saison, 1 Surplus, et du bois d'œuvre/fournitures (Valeur 2)", done: false },
        { text: "Un petit personnel dévoué (aubergiste, cuisinier, palefrenier…)", done: false },
      ],
      effects: "Augmenter la Fortune de 1 ; nommez l'auberge, ajoutez-la aux Ressources et à la carte. À chaque changement de saison, la personne la plus amicale lance +Fortune pour poser une question au MJ sur le monde extérieur. Une fois par saison, dépensez 1 Surplus pour rassembler les gens à l'auberge et effacer une débilité.",
    },
    {
      id: 'market',
      name: 'Marché',
      summary: "Stonetop n'est au mieux qu'une arrière-pensée pour les commerçants de la région. Nous devons changer cela.",
      requirements: [
        { text: "Un bien/service convaincant exclusif à Stonetop, ou une autre raison de venir (lieu de pèlerinage…)", done: false },
        { text: "Un emplacement dédié au marché (l'ajouter à la carte)", done: false },
        { text: "Un arbitre de confiance, capable de faire appliquer ses propres décisions en matière de commerce", done: false },
        { text: "Quatre saisons de fonctionnement sans incident notable de violence, brigandage, vol…", done: false },
      ],
      effects: "Augmenter la Prospérité de 1 tant que les conditions sont remplies (−1 si perdues). Quand les saisons changent vers le printemps, l'été ou l'automne avec le marché actif et une Population de +1 ou plus, le Marché génère 1 Surplus.",
    },
    {
      id: 'mill',
      name: 'Moulin',
      summary: "Nous avons l'embarras du choix en meules. Avec un moulin, nous aurions de meilleur pain et plus de temps pour d'autres activités.",
      requirements: [
        { text: "Un ingénieur/contremaître exceptionnel", done: false },
        { text: "Une source d'énergie pratique et constante (vent, roue hydraulique, Harde de chevaux, magie…)", done: false },
        { text: "Un emplacement de construction capable d'exploiter cette source d'énergie", done: false },
        { text: "Se serrer les coudes ×2 — chaque fois nécessite une saison, 1 Surplus, une charretée de bois d'œuvre (Valeur 2), et des cordes et fournitures (Valeur 2)", done: false },
        { text: "Un meunier à plein temps", done: false },
      ],
      effects: "Augmenter la Fortune de 1 ; ajouter « Moulin » aux Ressources et à la carte. Désormais, la récolte d'automne génère +1 Surplus, et les fournitures obtenues en s'équipant à Stonetop ont 1 utilisation supplémentaire.",
    },
    {
      id: 'palisade',
      name: 'Palissade',
      summary: "Un mur de rondins aiguisés de 3 m de haut, pour tenir le mal à distance.",
      requirements: [
        { text: "Beaucoup de bois d'œuvre (~20-25 charretées, Valeur 3)", done: false },
        { text: "Un ingénieur/contremaître compétent", done: false },
        { text: "Beaucoup de cordes, clous, poix, etc. (Valeur 2)", done: false },
        { text: "Se serrer les coudes, coûtant un mois et 1 Surplus", done: false },
      ],
      effects: "Augmenter la Fortune de 1 ; ajouter « Palissade » aux Fortifications et à la carte. Quand vous profitez de la palissade, vous avez un avantage pour Déployer.",
    },
    {
      id: 'raincatching',
      name: 'Récupération des pluies',
      summary: "Remplir la citerne demande tellement de travail. Sûrement, on peut faire mieux !",
      requirements: [
        { text: "Un ingénieur/contremaître exceptionnel, pour concevoir un système astucieux de toits, gouttières et conduits", done: false },
        { text: "Assez d'ardoise/terre cuite pour couvrir tous les bâtiments et construire les gouttières et conduits (Valeur 3)", done: false },
        { text: "Se serrer les coudes ×3 — chaque fois nécessite 1 saison et 1 Surplus", done: false },
      ],
      effects: "Augmenter la Fortune de 1 ; ajouter « Récupération des pluies » aux Ressources. Désormais, quand l'été arrive et que vous obtenez 7+ avec la Fortune, la bourgade génère 1 Surplus.",
    },
    {
      id: 'standing-watch',
      name: 'Guet permanent',
      summary: "Quelques guerriers à plein temps nous rendraient tous plus sûrs, non ?",
      requirements: [
        { text: "Un guerrier vétéran, capable de commander une foule", done: false },
        { text: "Au moins 6 guerriers, bien équipés et volontaires", done: false },
        { text: "Les dirigeants du village acceptant de soutenir des guerriers qui s'entraînent et montent la garde à plein temps", done: false },
      ],
      effects: "Ajouter « guet permanent » aux Fortifications. Au début de chaque saison, le guet consomme 1 Surplus ou se dissout. Quand vous impliquez spécifiquement le guet dans une action, traitez les Défenses comme si elles étaient 1 de plus.",
    },
    {
      id: 'stone-wall',
      name: 'Muraille de pierre',
      summary: "Pas une simple palissade de bois, mais un puissant rempart. Nous avons la pierre, après tout…",
      requirements: [
        { text: "Un ingénieur/contremaître exceptionnel", done: false },
        { text: "Un tailleur de pierre avec une équipe compétente", done: false },
        { text: "Équipement, outils et matériaux (Valeur 3)", done: false },
        { text: "Se serrer les coudes ×4 — chaque fois coûte 1 saison, 1 Surplus, et des fournitures (Valeur 2)", done: false },
      ],
      effects: "Ajouter « Muraille de pierre » aux Fortifications (effacer « Palissade » si vous l'aviez) et à la carte. Avantage pour Déployer quand vous en profitez ; quand l'hiver s'empare des terres, la bourgade consomme 1 Surplus de moins.",
    },
    {
      id: 'township',
      name: 'Bourg',
      summary: "Ce village sera-t-il jamais autre chose qu'un bled perdu ?",
      requirements: [
        { text: "Population +3 pendant 4 saisons consécutives", done: false },
        { text: "Logements supplémentaires", done: false },
        { text: "Récupération des pluies OU Domestiquer le ruisseau", done: false },
        { text: "Au moins 4 autres améliorations", done: false },
        { text: "Un gouvernement formel quelconque", done: false },
      ],
      effects: "Changer la Taille en bourg et la Population à +0. Avantage pour Mobiliser, Se serrer les coudes, et Commercer et troquer ; le printemps et l'été génèrent un Surplus égal à Population+1 ; mais l'hiver consomme 2d6+Population Surplus au lieu de 1d4+Population.",
    },
    {
      id: 'weapons-of-war',
      name: 'Armes de guerre',
      summary: "Les lances, c'est bien, mais que diriez-vous de haches, pics, épées ?",
      requirements: [
        { text: "Soit : acquérir quelques dizaines de bonnes épées, haches de bataille, masses, fléaux, marteaux de guerre… (Valeur 3)", done: false },
        { text: "Ou : un forgeron avec personnel complet et outils améliorés (Valeur 2), une charretée de bon minerai de fer (Valeur 2), et 4 saisons de travail", done: false },
        { text: "Un guerrier vétéran, capable de commander une foule", done: false },
        { text: "Se serrer les coudes pour entraîner la milice avec les nouvelles armes (une saison + 1 Surplus)", done: false },
      ],
      effects: "Augmenter les Défenses de 1 ; ajouter « Armes de guerre » aux Fortifications. Chaque printemps, le village doit dépenser 1 Surplus pour l'entretien. Quand on s'équipe à Stonetop, les armes de guerre comptent comme des objets courants ; les haches de bataille et les épées obtiennent un indice de perforant égal à la Prospérité actuelle.",
    },
    {
      id: 'well-trained-militia',
      name: 'Milice aguerrie',
      summary: "Tout le monde peut manier une lance et un bouclier, mais un vrai entraînement pourrait faire de nous une force redoutable.",
      requirements: [
        { text: "Un guerrier vétéran, capable de commander une foule", done: false },
        { text: "Tactique — Tir à l'arc : tirs de barrage, embuscades à distance, tir de précision (Se serrer les coudes : une saison d'exercices + 1 Surplus)", done: false },
        { text: "Tactique — Cavalerie (nécessite une Harde de chevaux) : combat à cheval, charges (Se serrer les coudes : une saison + 1 Surplus)", done: false },
        { text: "Tactique — Formations : murs de boucliers, coins, phalanges (Se serrer les coudes : une saison + 1 Surplus)", done: false },
        { text: "Tactique — Vigilance : patrouilles, réaction rapide aux alarmes (Se serrer les coudes : une saison + 1 Surplus)", done: false },
        { text: "Tactique — Escarmouche : embuscades, harcèlement, frappe et retraite (Se serrer les coudes : une saison + 1 Surplus)", done: false },
      ],
      effects: "Quand vous Déployez en utilisant une tactique entraînée, vous agissez depuis une position de force (vous choisissez la conséquence sur 7-9). Avec 2+ tactiques entraînées, augmentez les Défenses de 1. Chaque été, la milice dépense 1 Surplus et une semaine d'entraînement ou perd une tactique.",
    },
  ],
};

const SEED: Record<Lang, SeedContent> = { en: EN, fr: FR };

/** Fiche Stonetop par défaut (clonée profondément à chaque appel). */
export function createDefaultSteading(lang: Lang): Steading {
  const c = SEED[lang];
  return {
    size: 'village',
    stats: { fortunes: 1, surplus: 1, population: 0, prosperity: 0, defenses: 0 },
    debilities: { diminished: false, lacking: false, malcontent: false },
    resources: [...c.resources],
    fortifications: [...c.fortifications],
    assets: [...c.assets],
    treasury: {
      silver: { purses: 0, handfuls: 0, coins: 0 },
      gold: { purses: 0, handfuls: 0, coins: 0 },
    },
    improvements: c.improvements.map((i) => ({
      ...i,
      requirements: i.requirements.map((r) => ({ ...r })),
      completed: false,
      custom: false,
    })),
  };
}
