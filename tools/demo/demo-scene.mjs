/**
 * SBE — Démo « Brumeval » : LA SCÈNE ET SES DOCUMENTS
 *
 * Construit, dans le monde ouvert, la carte du village et tout ce qui s'y
 * pose : murs et portes (serrure, porte de cave commandée par un levier),
 * lumières, jetons des personnages, objets de scène (coffre, levier, piège,
 * étal marchand), journaux (guide, lettre, quêtes), groupe et table de butin.
 * À lancer APRÈS les modèles, les objets, les fiches et les réglages.
 *
 *   const S = await import("/systems/system-builder-engine/tools/demo/demo-scene.mjs");
 *   await S.buildScene("fr");
 */

const SYS = "system-builder-engine";
const DEMO = "demo";
const A = `systems/${SYS}/assets/demo`;
const GS = 100;
const mod = (p) => import(`/systems/${SYS}/module/${p}`);

/* ------------------------------------------------------------ */
/*  Plan du village (en cases ; 1 case = 1 personne)              */
/* ------------------------------------------------------------ */

/** Murs pleins par bâtiment (les ouvertures des portes sont déjà retirées). */
const WALLS = [
  /* Forge */
  [4, 3, 10, 3], [10, 3, 10, 7], [4, 7, 7, 7], [8, 7, 10, 7], [4, 3, 4, 7], [8, 3, 8, 4], [8, 5, 8, 7],
  /* Auberge */
  [14, 2, 21, 2], [21, 2, 21, 7], [14, 7, 16, 7], [17, 7, 21, 7], [14, 2, 14, 7], [19, 2, 19, 3], [19, 4, 19, 7],
  /* Maison */
  [1, 12, 5, 12], [6, 12, 9, 12], [9, 12, 9, 18], [1, 18, 9, 18], [1, 12, 1, 18],
  [1, 15, 2, 15], [3, 15, 7, 15], [8, 15, 9, 15], [5, 15, 5, 18],
  /* Crypte */
  [25, 13, 27, 13], [28, 13, 31, 13], [31, 13, 31, 18], [25, 18, 31, 18], [25, 13, 25, 18], [25, 15, 27, 15], [28, 15, 31, 15]
];

/** Portes (une case de large) : id interne → segment. */
const DOORS = {
  forge: [7, 7, 8, 7], forgeIn: [8, 4, 8, 5],
  inn: [16, 7, 17, 7], innIn: [19, 3, 19, 4],
  house: [5, 12, 6, 12], houseRoom: [2, 15, 3, 15], cellar: [7, 15, 8, 15],
  crypt: [27, 13, 28, 13], cryptIn: [27, 15, 28, 15]
};

/** Centre d'une case (coordonnées en cases, .5 = milieu). */
const px = (x, y) => ({ x: Math.round(x * GS), y: Math.round(y * GS) });

/* ------------------------------------------------------------ */
/*  Outils                                                        */
/* ------------------------------------------------------------ */

const flags = (extra = {}) => ({ [SYS]: { [DEMO]: true, ...extra } });

async function folderOf(type, name) {
  const f = game.folders.find(x => x.type === type && x.getFlag(SYS, DEMO) && x.name === name);
  return f ?? Folder.create({ type, name, color: "#6b4a2c", flags: flags() });
}

const itemOf = (id) => game.items.find(i => i.getFlag(SYS, "demoId") === id) ?? null;
const actorOf = (id) => game.actors.find(a => a.getFlag(SYS, "demoId") === id && a.type !== "template") ?? null;

/** Un jeton de personnage, posé sur une case (coin haut-gauche). */
async function placeActor(scene, actor, x, y, extra = {}) {
  const td = await actor.getTokenDocument({ x: Math.round(x * GS), y: Math.round(y * GS), ...extra });
  const data = td.toObject();
  const [doc] = await scene.createEmbeddedDocuments("Token", [data]);
  return doc;
}

/* ------------------------------------------------------------ */
/*  La scène                                                      */
/* ------------------------------------------------------------ */

export async function buildScene(lang = game.i18n.lang) {
  const { demoLang } = await import(`./demo-templates.mjs?v=${Date.now()}`);
  const L = demoLang(lang);
  const { T, K } = L;
  const out = { report: [] };

  /* --- Carte --- */
  const sFolder = await folderOf("Scene", T("Démo", "Demo"));
  const scene = await Scene.create({
    name: "Brumeval", folder: sFolder.id, navigation: true, navName: "Brumeval",
    /* Fond de la carte : porté par le niveau de la scène. */
    levels: [{ _id: "defaultLevel0000", name: "Brumeval", background: { src: `${A}/brumeval.webp`, color: "#2f4a24" } }],
    width: 32 * GS, height: 20 * GS, padding: 0,
    grid: { type: CONST.GRID_TYPES.SQUARE, size: GS, distance: 1.5, units: "m" },
    tokenVision: true, fog: { exploration: true },
    environment: { darknessLevel: 0.15, globalLight: { enabled: true } },
    initial: { x: 16 * GS, y: 10 * GS, scale: 0.6 },
    flags: flags()
  });
  out.scene = scene;

  /* --- Murs et portes --- */
  const D = CONST.WALL_DOOR_TYPES, DS = CONST.WALL_DOOR_STATES;
  const walls = WALLS.map(c => ({ c: c.map(v => v * GS) }));
  const doorIds = {};
  const doorList = Object.entries(DOORS).map(([id, c]) => {
    doorIds[id] = foundry.utils.randomID();
    return { _id: doorIds[id], c: c.map(v => v * GS), door: D.DOOR, ds: id === "cellar" ? DS.LOCKED : DS.CLOSED };
  });
  await scene.createEmbeddedDocuments("Wall", [...walls, ...doorList], { keepId: true });
  out.doors = doorIds;

  /* Porte d'entrée de la maison : serrure (clé, outils ou crochetage). */
  const key = itemOf("cle"), picks = itemOf("crochets");
  await scene.walls.get(doorIds.house).setFlag(SYS, "config", {
    lockType: "pick", armored: false,
    lockRollTarget: K.crochetage, lockMaxAttempts: 0, lockAttempts: 0, lockBroken: false, pickedOpen: false,
    lockKeys: key ? [key.id] : [], lockTools: picks ? [picks.id] : [],
    lockToolRequired: false, lockRollWithTool: true, lockDiffMode: "mod", lockDiff: "2",
    digiLength: 4, digiCode: "", digiHackable: false, digiRollTarget: "", digiMaxAttempts: 0, digiRemember: false,
    digiAlarm: false, digiSound: "", lockRollMod: "", digiRollMod: "",
    digiAttempts: 0, digiBroken: false, digiUnlockedBy: []
  });

  /* --- Lumières --- */
  const light = (x, y, dim, bright, color, anim = "torch") => ({ x, y,
    config: { dim, bright, color, alpha: 0.45, animation: { type: anim, speed: 3, intensity: 4 } }, flags: flags() });
  await scene.createEmbeddedDocuments("AmbientLight", [
    light(500, 390, 4, 1.5, "#ff8a2a"),             /* four de la forge */
    light(2000, 240, 3, 1, "#ff9c3a"),              /* cuisine de l'auberge */
    light(800, 1237, 3, 1, "#ff9c3a"),              /* âtre de la maison */
    light(2540, 1540, 2, 0.5, "#ffd27a", "flame"),  /* bougies de la crypte */
    light(3060, 1540, 2, 0.5, "#ffd27a", "flame"),
    light(2725, 1730, 2, 0.5, "#ffd27a", "flame"),
    light(2875, 1730, 2, 0.5, "#ffd27a", "flame")
  ]);

  /* --- Personnages --- */
  const tokens = [
    ["elara", 15, 7], ["brann", 16, 7], ["lys", 17, 7], ["aldric", 16, 8],
    ["bertrand", 7, 5], ["grisonne", 19, 4],
    ["loup", 12, 16], ["gobelin", 29, 14], ["squelette", 27, 16]
  ];
  for (const [id, x, y] of tokens) {
    const a = actorOf(id);
    if (!a) { out.report.push(`jeton : ${id} absent`); continue; }
    await placeActor(scene, a, x, y);
  }

  /* --- Objets de scène --- */
  await scene.view();
  await new Promise(r => setTimeout(r, 800));
  const { PropManager } = await mod("managers/props/prop-manager.mjs");
  const placeItem = async (item, cx, cy, rotation = 0) => {
    const d = item.toObject();
    d._id = foundry.utils.randomID();
    d.system.modelId = item.id;
    foundry.utils.setProperty(d, "system.carry", { host: "", where: "", x: 0, y: 0, cell: -1 });
    foundry.utils.setProperty(d, "system.values.quantity", 1);
    const cfg = PropManager.cfgOf(d);
    const img = PropManager.imageOf(d, cfg);
    let tflags;
    if (cfg.trOn) {
      const { TrapManager, TRAP_FLAG } = await mod("managers/traps/trap-manager.mjs");
      tflags = { [TRAP_FLAG]: TrapManager.initialFlag(cfg, null) };
    }
    const O = CONST.DOCUMENT_OWNERSHIP_LEVELS;
    return PropManager.createToken({
      scene, center: px(cx, cy), rotation, name: d.name, img, cfg, flags: tflags, items: [d],
      ownership: { default: cfg.use === "all" ? O.OWNER : O.LIMITED },
      prop: { item: d._id, owner: "", actor: "", user: "" }
    });
  };

  /* Levier : il ouvre la porte de la cave (lien de scène). */
  const lever = itemOf("levier");
  if (lever) {
    const td = await placeItem(lever, 4.5, 11.5);
    if (td) {
      const { PropScene } = await mod("managers/props/prop-scene.mjs");
      const wall = scene.walls.get(doorIds.cellar);
      await PropScene.setLinks(td, [{ uuid: wall.uuid, type: "Wall", label: T("porte de la cave", "cellar door") }]);
    } else out.report.push("levier non posé");
  }

  /* Piège à pointes, caché sur le chemin de la crypte. */
  const trap = itemOf("piege");
  if (trap && !(await placeItem(trap, 26.5, 11.5))) out.report.push("piège non posé");

  /* Coffre de la cave : la lettre, deux potions, une bourse. */
  const { ChestManager } = await mod("managers/chest/chest-manager.mjs");
  const chest = await ChestManager._createChestTile({
    name: T("Coffre de la cave", "Cellar chest"), view: "grid", cellSize: 48, gridCols: 5, gridRows: 2,
    purse: { demoOr: 5, demoArgent: 12 }, lockMode: "none", openDistance: 1
  }, `${A}/tokens/coffre.webp`, { w: 1, h: 1 }, { ...px(8.5, 17.5), rotation: 0 });
  if (chest) {
    for (const [id, n] of [["lettre", 1], ["potion_soin", 2], ["antidote", 1]]) {
      const it = itemOf(id);
      if (it) await ChestManager._depositItem(chest, it, n, null, game.user.id);
    }
  } else out.report.push("coffre non posé");

  /* Étal de la place : un marchand de scène (ce que vend le village). */
  const { cleanMerchant, MERCHANT_FLAG } = await mod("managers/merchant/merchant-model.mjs");
  const stock = (list) => list.map(([id, qty, unlimited = false]) => ({ model: itemOf(id)?.id ?? "", qty, unlimited,
    restock: unlimited ? { mode: "none" } : { mode: "newday", to: qty } })).filter(e => e.model);
  const stall = await PropManager.createToken({
    scene, center: px(13.5, 10), rotation: 0, name: T("Étal du marché", "Market stall"), img: `${A}/tokens/etal.webp`,
    size: { w: 1, h: 2 }, cfg: { showName: true }, items: [], prop: { kind: "merchant" }, flags: { showName: true }
  });
  if (stall?.actor) {
    await stall.actor.setFlag(SYS, MERCHANT_FLAG, cleanMerchant({ enabled: true, open: true, markup: 0,
      stock: stock([["potion_soin", 5], ["potion_mana", 3], ["antidote", 2], ["fleches", 0, true], ["fleches_feu", 10], ["torche", 0, true]]) }));
  } else out.report.push("étal non posé");

  /* Bertrand, le forgeron : un marchand qui est aussi un personnage. */
  const bertrand = actorOf("bertrand");
  if (bertrand) {
    await bertrand.setFlag(SYS, MERCHANT_FLAG, cleanMerchant({ enabled: true, open: true, markup: 10, cash: "own",
      purse: { demoOr: 20, demoArgent: 10, demoCuivre: 50 },
      stock: stock([["epee", 2], ["dague", 3], ["hache", 1], ["masse", 2], ["arc", 1], ["cuir", 2], ["mailles", 1], ["bouclier_bois", 2], ["bouclier_fer", 1]]) }));
  }

  /* --- Groupe, journaux, table --- */
  const pcs = ["elara", "brann", "lys", "aldric"].map(actorOf).filter(Boolean);
  const aFolder = game.folders.find(f => f.type === "Actor" && f.getFlag(SYS, DEMO) && f.name === T("Démo — Héros", "Demo — Heroes"));
  const group = await Actor.create({ name: T("Les Compagnons", "The Companions"), type: "groupe", img: "icons/environment/people/group.webp",
    folder: aFolder?.id ?? null, system: { members: pcs.map(a => a.uuid) }, flags: flags({ demoId: "groupe" }) });
  out.group = group;

  const jFolder = await folderOf("JournalEntry", T("Démo", "Demo"));
  out.guide = await JournalEntry.create({ name: T("Brumeval — Guide de la démo", "Brumeval — Demo guide"), folder: jFolder.id,
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER }, flags: flags({ demoId: "guide" }),
    pages: guidePages(L) });
  out.letter = await JournalEntry.create({ name: T("Lettre scellée", "Sealed letter"), folder: jFolder.id, flags: flags({ demoId: "lettre" }),
    pages: [{ name: T("Lettre", "Letter"), type: "text", text: { format: 1, content: letterHtml(L) } }] });

  /* Journal de quêtes : une section pour le groupe, une quête donnée par Mère Grisonne. */
  const { QuestManager, QUEST_SHEET_ID } = await mod("managers/quest/quest-manager.mjs");
  const qcfg = QuestManager.defaultConfig();
  /* Libellés de base dans la langue de la démo (pas celle du poste qui construit). */
  const QL = { active: ["En cours", "In progress"], success: ["Réussie", "Completed"], fail: ["Échouée", "Failed"], cancel: ["Annulée", "Cancelled"],
    main: ["Principale", "Main"], side: ["Secondaire", "Side"] };
  for (const x of [...qcfg.statuses, ...qcfg.categories]) if (QL[x.id]) x.label = T(QL[x.id][0], QL[x.id][1]);
  qcfg.stats = [{ key: K.xp, label: T("Expérience", "Experience"), icon: "fa-solid fa-star", op: "add" }];
  qcfg.sections = [{ id: "compagnons", name: group.name, groupUuid: group.uuid, members: [] }];
  qcfg.autoComplete = true;
  const grisonne = actorOf("grisonne");
  const gem = itemOf("gemme");
  out.quests = await JournalEntry.create({ name: T("Journal de quêtes", "Quest log"), folder: jFolder.id,
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER },
    flags: { [SYS]: { [DEMO]: true, demoId: "quetes", questConfig: qcfg }, core: { sheetClass: QUEST_SHEET_ID } },
    pages: [{ name: T("Les morts sans repos", "The restless dead"), type: "quete", system: {
      sectionId: "compagnons", category: "main", status: "active",
      img: "icons/magic/death/skull-horned-goat-pentagram-red.webp",
      description: T("Mère Grisonne entend des grattements sous la crypte depuis trois nuits. Elle demande aux compagnons d'aller voir ce qui trouble le repos des morts.", "Mother Greyhair has heard scratching under the crypt for three nights. She asks the companions to find out what disturbs the rest of the dead."),
      giver: grisonne ? { mode: "actor", uuid: grisonne.uuid, name: "" } : { mode: "name", uuid: "", name: T("Mère Grisonne", "Mother Greyhair") },
      place: { uuid: scene.uuid, text: T("La crypte, à l'est du pont", "The crypt, east of the bridge") },
      objectives: [
        { id: "cave", label: T("Trouver la lettre cachée dans la cave", "Find the letter hidden in the cellar"), kind: "check" },
        { id: "gardiens", label: T("Vaincre les gardiens de la crypte", "Defeat the crypt guardians"), kind: "count", target: 2 },
        { id: "loup", label: T("Chasser le loup qui rôde près du champ", "Drive off the wolf prowling by the field"), kind: "check", optional: true }
      ],
      rewards: { values: [{ key: K.xp, amount: 50, mode: "each" }], items: gem ? [{ uuid: gem.uuid, qty: 1, mode: "total" }] : [] }
    } }] });
  await QuestManager.syncOwnership?.(out.quests);

  const tFolder = await folderOf("RollTable", T("Démo", "Demo"));
  const loot = ["gemme", "os", "potion_soin", "fleches_feu", "antidote"].map(itemOf).filter(Boolean);
  out.table = await RollTable.create({ name: T("Butin de la crypte", "Crypt loot"), folder: tFolder.id, formula: `1d${loot.length}`,
    img: "icons/containers/chest/chest-reinforced-steel-brown.webp", flags: flags({ demoId: "butin" }),
    results: loot.map((it, i) => ({ type: "document", documentUuid: it.uuid, name: it.name, img: it.img, range: [i + 1, i + 1], weight: 1 })) });

  return out;
}

/* ------------------------------------------------------------ */
/*  Textes                                                        */
/* ------------------------------------------------------------ */

function letterHtml(L) {
  const { T } = L;
  return `<p>${T("Mère Grisonne,", "Mother Greyhair,")}</p>
<p>${T("Ce qui dort sous la crypte ne doit pas se réveiller. Si je ne reviens pas, ne laissez personne y descendre seul.", "What sleeps beneath the crypt must not wake. If I do not come back, let no one go down there alone.")}</p>
<p><span class="sbe-lang" data-sbe-lang="demo-elfique" data-sbe-lang-id="demolettre1">${T("Les gardiens ne craignent ni l'acier ni le feu, seulement la lumière de l'Aube.", "The guardians fear neither steel nor fire, only the light of Dawn.")}</span></p>
<p>— ${T("Un ami du temple", "A friend from the temple")}</p>`;
}

function guidePages(L) {
  const { T } = L;
  const page = (name, html, sort) => ({ name, type: "text", sort, text: { format: 1, content: html } });
  const li = (items) => `<ul>${items.map(i => `<li>${i}</li>`).join("")}</ul>`;
  const station = (n, title, intro, items) => `<h2>${n}. ${title}</h2><p>${intro}</p>${li(items)}`;
  return [
    page(T("Bienvenue", "Welcome"), `<h1>${T("Bienvenue à Brumeval", "Welcome to Brumeval")}</h1>
<p>${T("Brumeval est un petit village construit entièrement avec le système : chaque fiche, chaque objet, chaque règle de combat a été réglé dans les écrans du système, sans une ligne de code. Ouvrez n'importe quel modèle d'atelier pour voir comment il est fait.", "Brumeval is a small village built entirely with the system: every sheet, every item, every combat rule was set up in the system's screens, without a line of code. Open any template to see how it is made.")}</p>
<p>${T("Survolez les composants des fiches : leur info-bulle explique ce qu'ils montrent et comment ils sont réglés.", "Hover over sheet components: their tooltip explains what they show and how they are set up.")}</p>
<h2>${T("Les héros", "The heroes")}</h2>
${li([
  T("<strong>Elara</strong>, mage elfe : sorts, mana, langue elfique.", "<strong>Elara</strong>, elf mage: spells, mana, Elvish language."),
  T("<strong>Brann</strong>, guerrier nain : armes, armure et bouclier dans leurs emplacements.", "<strong>Brann</strong>, dwarf warrior: weapons, armor and shield in their slots."),
  T("<strong>Lys</strong>, voleuse : arc et flèches, outils de crochetage, discrétion.", "<strong>Lys</strong>, rogue: bow and arrows, thieves' tools, stealth."),
  T("<strong>Aldric</strong>, clerc : soins, bénédiction, lumière sacrée.", "<strong>Aldric</strong>, cleric: healing, blessing, holy light.")
])}
<p>${T("Donnez un héros à chaque joueur (droits de la fiche), puis suivez le parcours de la page suivante.", "Give a hero to each player (sheet permissions), then follow the tour on the next page.")}</p>`, 100000),

    page(T("Le parcours", "The tour"), `<h1>${T("Le parcours du village", "The village tour")}</h1>
${station(1, T("L'auberge", "The inn"), T("Les héros partent de la porte de l'auberge. Mère Grisonne est dans la cuisine.", "The heroes start at the inn door. Mother Greyhair is in the kitchen."), [
  T("Ouvrez une fiche : onglets, jauges, jets au clic sur les libellés, graphique des attributs.", "Open a sheet: tabs, gauges, rolls by clicking labels, attribute chart."),
  T("Clic droit sur un jeton : le menu rapide (valeurs, boutons, objets portés).", "Right-click a token: the quick menu (values, buttons, carried items)."),
  T("Onglet Inventaire : le sac est une grille spatiale, chaque objet y prend sa taille et pivote d'un quart de tour. Le coffre de la cave, lui, est une grille simple.", "Inventory tab: the backpack is a spatial grid, each item takes up its size and turns a quarter. The cellar chest is a simple grid."),
  T("Le <strong>Journal de quêtes</strong> : Mère Grisonne confie « Les morts sans repos ».", "The <strong>Quest log</strong>: Mother Greyhair gives \"The restless dead\".")
])}
${station(2, T("La place", "The square"), T("L'étal rayé, près du puits, est un marchand posé sur la carte.", "The striped stall, by the well, is a merchant placed on the map."), [
  T("Achetez et vendez : la bourse se paie en or, argent et cuivre, la monnaie est rendue.", "Buy and sell: the purse pays in gold, silver and copper, change is given."),
  T("Le stock se renouvelle à chaque nouvelle journée.", "The stock refills on each new day.")
])}
${station(3, T("La forge", "The forge"), T("Bertrand le forgeron est un personnage qui fait aussi marchand.", "Bertrand the smith is a character who is also a merchant."), [
  T("Marchandez : un jet décide de la remise.", "Haggle: a roll decides the discount."),
  T("Équipez une arme ou une armure : la défense et l'attaque de la fiche suivent ce qui est porté.", "Equip a weapon or armor: the sheet's defense and attack follow what is worn.")
])}
${station(4, T("La maison du bas", "The lower house"), T("La porte d'entrée est fermée à clé.", "The front door is locked."), [
  T("Mère Grisonne a la clé : elle ouvre sans jet. Sinon, les outils de crochetage de Lys donnent un bonus au jet.", "Mother Greyhair has the key: it opens without a roll. Otherwise, Lys's thieves' tools give a bonus to the roll."),
  T("Le <strong>levier</strong>, dehors, ouvre la porte de la cave : un objet posé relié à une porte.", "The <strong>lever</strong>, outside, opens the cellar door: a placed object linked to a door."),
  T("Le <strong>coffre</strong> de la cave garde une lettre, des potions et une bourse.", "The cellar <strong>chest</strong> holds a letter, potions and a purse.")
])}
${station(5, T("Le champ", "The field"), T("Un loup rôde à l'ouest du champ ; ses traces ne se voient qu'en cherchant.", "A wolf prowls west of the field; its tracks only show when searched for."), [
  T("Lancez le combat : initiative, attaques contre la défense, dégâts appliqués aux points de vie.", "Start combat: initiative, attacks against defense, damage applied to hit points."),
  T("Le sang laisse des traces sur la carte : des taches à chaque blessure, et une traînée quand les PV passent sous 80 % ou que le personnage a l'effet « Saignement » (le piège le donne).", "Blood leaves traces on the map: splatters on each wound, and a trail when HP drops below 80% or the character has the \"Bleeding\" effect (the trap gives it).")
])}
${station(6, T("Le pont et le chemin", "The bridge and the path"), T("Un piège à pointes est caché sur le chemin de la crypte.", "A spike trap is hidden on the path to the crypt."), [
  T("La perception peut le révéler ; sinon, il se déclenche quand on marche dessus.", "Perception can reveal it; otherwise it goes off when stepped on.")
])}
${station(7, T("La crypte", "The crypt"), T("Un gobelin et un squelette gardent les tombes.", "A goblin and a skeleton guard the tombs."), [
  T("Sorts à gabarit : boule de feu (explosion), éclair (ligne).", "Area spells: fireball (burst), lightning bolt (line)."),
  T("La lumière sacrée d'Aldric ne vise que les morts-vivants : elle lit la case « Mort-vivant » de leur fiche.", "Aldric's holy light only targets the undead: it reads the \"Undead\" box on their sheet."),
  T("La table <strong>Butin de la crypte</strong> tire la récompense.", "The <strong>Crypt loot</strong> table draws the reward.")
])}`, 200000),

    page(T("Pour le MJ", "For the GM"), `<h1>${T("Pour le MJ", "For the GM")}</h1>
${li([
  T("<strong>Nouvelle journée</strong> : les héros récupèrent selon la nuit choisie, les marchands se réapprovisionnent.", "<strong>New day</strong>: heroes recover according to the chosen night, merchants restock."),
  T("<strong>Calendrier</strong> : deux lunes et la foire de Brumeval.", "<strong>Calendar</strong>: two moons and the Brumeval fair."),
  T("<strong>Niveaux et talents</strong> : l'expérience fait monter de niveau, chaque niveau gagné donne un point de talent.", "<strong>Levels and talents</strong>: experience raises the level, every level gained grants a talent point."),
  T("<strong>Langues</strong> : un passage en elfique se brouille pour qui ne parle pas la langue.", "<strong>Languages</strong>: an Elvish passage scrambles for whoever doesn't speak it.")
])}
<p>${T("Pour tout retirer : Paramètres du système → <strong>Retirer la démo</strong>. Les réglages remplacés à l'installation sont remis comme avant.", "To remove everything: System settings → <strong>Remove the demo</strong>. Settings replaced at install are put back as they were.")}</p>`, 300000)
  ];
}
