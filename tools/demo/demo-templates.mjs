/**
 * SBE — Démo « Brumeval » : les MODÈLES D'ATELIER
 *
 * Chaque modèle est écrit au format d'export de l'atelier (template-io) :
 * le constructeur le passe par l'import du système, qui le valide comme un
 * fichier du MJ. Une seule source pour le français et l'anglais : `T(fr, en)`
 * choisit le texte, `K` donne les clés (en français ou en anglais, pour que
 * les formules se lisent dans la langue du MJ).
 *
 * Chaque composant qui montre une mécanique porte une info-bulle (`tt`) qui
 * explique ce qu'il fait et comment il est réglé.
 */

/* ------------------------------------------------------------ */
/*  Langue, clés                                                  */
/* ------------------------------------------------------------ */

export function demoLang(lang) {
  const fr = lang === "fr";
  const T = (a, b) => (fr ? a : b);
  const K = fr ? {
    force: "force", agilite: "agilite", constitution: "constitution", intelligence: "intelligence", sagesse: "sagesse", charisme: "charisme",
    mod_force: "mod_force", mod_agilite: "mod_agilite", mod_constitution: "mod_constitution", mod_intelligence: "mod_intelligence", mod_sagesse: "mod_sagesse", mod_charisme: "mod_charisme",
    pv: "pv", mana: "mana", niveau: "niveau", xp: "xp", points_talent: "points_talent",
    defense: "defense", initiative: "initiative", attaque: "attaque", tir: "tir",
    res_feu: "res_feu", res_poison: "res_poison", pv_maximum: "pv_maximum", duree: "duree",
    elfique: "elfique", nain: "nain",
    or: "or", argent: "argent", cuivre: "cuivre", charge: "charge",
    race: "race", classe: "classe", main_droite: "main_droite", main_gauche: "main_gauche", armure: "armure", sac: "sac", grimoire: "grimoire", talents: "talents",
    crochetage: "crochetage", discretion: "discretion", perception: "perception", pistage: "pistage", persuasion: "persuasion", survie: "survie", athletisme: "athletisme", arcanes: "arcanes",
    mort_vivant: "mort_vivant", degats_naturels: "degats_naturels", score: "score",
    poids: "poids", prix: "prix", rarete: "rarete", etat: "etat",
    degats: "degats", type_degats: "type_degats", portee: "portee", bonus_toucher: "bonus_toucher", categorie: "categorie", munitions: "munitions",
    bonus_defense: "bonus_defense", type_armure: "type_armure",
    effet_conso: "effet_conso", soin: "soin", mana_rendue: "mana_rendue",
    cout_mana: "cout_mana", ecole: "ecole", niveau_sort: "niveau_sort", nature: "nature", gabarit: "gabarit",
    bonus_pv: "bonus_pv", bonus_mana: "bonus_mana", bonus_attaque: "bonus_attaque",
    allume: "allume", autonomie: "autonomie", notes: "notes", histoire: "histoire", age: "age", origine: "origine", ideal: "ideal", apparence: "apparence",
    abaisse: "abaisse", empoisonne: "empoisonne", beni: "beni", en_feu: "en_feu", rage: "rage", etourdi: "etourdi", saignement: "saignement", invisible: "dissimule"
  } : {
    force: "strength", agilite: "agility", constitution: "constitution", intelligence: "intelligence", sagesse: "wisdom", charisme: "charisma",
    mod_force: "str_mod", mod_agilite: "agi_mod", mod_constitution: "con_mod", mod_intelligence: "int_mod", mod_sagesse: "wis_mod", mod_charisme: "cha_mod",
    pv: "hp", mana: "mana", niveau: "level", xp: "xp", points_talent: "talent_points",
    defense: "defense", initiative: "initiative", attaque: "attack", tir: "ranged",
    res_feu: "fire_res", res_poison: "poison_res", pv_maximum: "hp_maximum", duree: "duration",
    elfique: "elvish", nain: "dwarvish",
    or: "gold", argent: "silver", cuivre: "copper", charge: "load",
    race: "race", classe: "char_class", main_droite: "main_hand", main_gauche: "off_hand", armure: "armor", sac: "backpack", grimoire: "spellbook", talents: "talents",
    crochetage: "lockpicking", discretion: "stealth", perception: "perception", pistage: "tracking", persuasion: "persuasion", survie: "survival", athletisme: "athletics", arcanes: "arcana",
    mort_vivant: "undead", degats_naturels: "natural_damage", score: "score",
    poids: "weight", prix: "price", rarete: "rarity", etat: "condition",
    degats: "damage", type_degats: "damage_type", portee: "range", bonus_toucher: "hit_bonus", categorie: "category", munitions: "ammo",
    bonus_defense: "defense_bonus", type_armure: "armor_type",
    effet_conso: "use_effect", soin: "healing", mana_rendue: "mana_restored",
    cout_mana: "mana_cost", ecole: "school", niveau_sort: "spell_level", nature: "nature", gabarit: "area_shape",
    bonus_pv: "hp_bonus", bonus_mana: "mana_bonus", bonus_attaque: "attack_bonus",
    allume: "lit", autonomie: "fuel", notes: "notes", histoire: "story", age: "age", origine: "origin", ideal: "ideal", apparence: "looks",
    abaisse: "pulled", empoisonne: "poisoned", beni: "blessed", en_feu: "on_fire", rage: "rage", etourdi: "stunned", saignement: "bleed", invisible: "concealed"
  };
  /* Valeurs de listes (affichées et lues par les formules). */
  const V = {
    races: T(["Humain", "Elfe", "Nain", "Halfelin"], ["Human", "Elf", "Dwarf", "Halfling"]),
    rarities: T(["Commun", "Peu commun", "Rare", "Légendaire"], ["Common", "Uncommon", "Rare", "Legendary"]),
    rarityColors: T({ "Peu commun": "#2d9d3a", "Rare": "#2c6dd1", "Légendaire": "#d4a017" }, { "Uncommon": "#2d9d3a", "Rare": "#2c6dd1", "Legendary": "#d4a017" }),
    states: T(["Neuf", "Usé", "Brisé"], ["New", "Worn", "Broken"]),
    stateColors: T({ "Usé": "#d98a1c", "Brisé": "#c62828" }, { "Worn": "#d98a1c", "Broken": "#c62828" }),
    dmgTypes: T(["Tranchant", "Perforant", "Contondant", "Feu", "Poison", "Sacré"], ["Slashing", "Piercing", "Bludgeoning", "Fire", "Poison", "Holy"]),
    weaponCats: T(["Mêlée", "Distance"], ["Melee", "Ranged"]),
    armorTypes: T(["Légère", "Intermédiaire", "Lourde", "Bouclier"], ["Light", "Medium", "Heavy", "Shield"]),
    consoEffects: T(["Soin", "Mana", "Antidote", "Lumière"], ["Healing", "Mana", "Antidote", "Light"]),
    schools: T(["Feu", "Foudre", "Lumière", "Protection"], ["Fire", "Lightning", "Light", "Protection"]),
    schoolColors: T({ "Feu": "#d9481c", "Foudre": "#3f8fd9", "Lumière": "#d4a017", "Protection": "#2d9d3a" }, { "Fire": "#d9481c", "Lightning": "#3f8fd9", "Light": "#d4a017", "Protection": "#2d9d3a" }),
    shapes: T(["Explosion", "Éclair", "Souffle"], ["Blast", "Bolt", "Breath"])
  };
  return { fr, T, K, V };
}

/* ------------------------------------------------------------ */
/*  Briques                                                       */
/* ------------------------------------------------------------ */

const E = (kind, key, label, config = {}, extra = {}) => ({ kind, key, label, config, style: {}, ...extra });
const tt = (text, formula = false) => ({ on: true, text, ...(formula ? { formula: true } : {}) });
const frame = (key, label, children, config = {}, extra = {}) =>
  E("frame", key, label, { titlePos: "above", noCollapse: true, ...config }, { style: { corners: "soft" }, children, ...extra });
/** Ajoute du style à des composants désignés par leur clé (tout l'arbre). */
function restyle(list, styles) {
  for (const e of list ?? []) {
    if (e?.key && styles[e.key]) e.style = { ...(e.style ?? {}), ...styles[e.key] };
    restyle(e?.children, styles);
    for (const c of e?.cols ?? []) restyle(c, styles);
  }
  return list;
}
const cols = (key, columns, config = {}, extra = {}) =>
  E("columns", key, "", { count: columns.length, ...config }, { cols: columns, ...extra });

/* ------------------------------------------------------------ */
/*  Modèle de personnage : AVENTURIER                             */
/* ------------------------------------------------------------ */

export function adventurerTemplate(L) {
  const { T, K, V } = L;
  const attrs = [
    ["force", T("Force", "Strength"), "fa-solid fa-hand-fist"],
    ["agilite", T("Agilité", "Agility"), "fa-solid fa-person-running"],
    ["constitution", T("Constitution", "Constitution"), "fa-solid fa-heart"],
    ["intelligence", T("Intelligence", "Intelligence"), "fa-solid fa-brain"],
    ["sagesse", T("Sagesse", "Wisdom"), "fa-solid fa-eye"],
    ["charisme", T("Charisme", "Charisma"), "fa-solid fa-comments"]
  ];
  const attrTip = T(
    "Valeur de 1 à 20. Cliquez le libellé : jet de 1d20 + modificateur, contre une difficulté choisie dans la fenêtre de jet (avantage possible).",
    "Value from 1 to 20. Click the label: 1d20 + modifier, against a difficulty set in the roll window (advantage available).");
  const attrEls = attrs.map(([k, label, icon]) => E("number", K[k], label, {
    integer: true, default: 10, min: 1, max: 20, width: 56, labelIcon: icon,
    roll: { on: true, formula: `1d20 + ${K["mod_" + k]}`, label, compare: "targetOver", target: "10",
      critS: { mode: "value", expr: "20" }, critF: { mode: "value", expr: "1" }, critDie: true,
      dialog: { adv: true, advCount: 2, mod: true, target: true } },
    tt: tt(attrTip)
  }));
  /* Les modificateurs : calculés, montrés dans le radar (Profil). */
  const modEls = attrs.map(([k, label]) => E("number", K["mod_" + k], label.slice(0, 3).toUpperCase(), {
    computed: true, integer: true, formula: `floor((${K[k]} - 10) / 2)`,
    tt: tt(T("Modificateur : (valeur − 10) ÷ 2, arrondi en dessous. Il nourrit les jets et les scores.", "Modifier: (value − 10) ÷ 2, rounded down. It feeds rolls and scores."), true)
  }));
  /* Seules les compétences qu'un objet peut améliorer lisent les objets portés. */
  const GEAR = new Set(["crochetage"]);
  const skill = (k, label, attr, icon) => E("number", K[k], label, {
    integer: true, default: 0, min: 0, max: 10, width: 56, labelIcon: icon,
    bonusFormula: GEAR.has(k) ? `${K["mod_" + attr]} + carried("${K[k]}")` : K["mod_" + attr],
    roll: { on: true, formula: `1d20 + ${K[k]}`, label, compare: "targetOver", target: "12",
      critS: { mode: "value", expr: "20" }, critF: { mode: "value", expr: "1" }, critDie: true,
      dialog: { adv: true, advCount: 2, mod: true, target: true } },
    tt: tt(GEAR.has(k)
      ? T(`Champ « 2 en 1 » : les rangs saisis, plus le modificateur et ce qu'apportent les objets portés (un outil ou une classe de la même clé). Jet au clic : 1d20 + total.`,
        `"2 in 1" field: the ranks you enter, plus the modifier and what carried items bring (a tool or class with the same key). Click to roll: 1d20 + total.`)
      : T(`Champ « 2 en 1 » : les rangs saisis, plus le modificateur de l'attribut. Jet au clic : 1d20 + total.`,
        `"2 in 1" field: the ranks you enter, plus the attribute modifier. Click to roll: 1d20 + total.`))
  });

  const header = frame("entete", "", [
    cols("entete_cols", [
      [E("actorImg", "", "", {})],
      [
        E("actorName", "", "", {}),
        cols("identite", [
          [E("select", K.race, T("Race", "Race"), { choices: V.races, default: V.races[0], width: 120,
            tt: tt(T("Liste déroulante. Elle change la vision (clé « sight ») : les elfes et les nains voient dans le noir.", "Drop-down list. It changes vision (\"sight\" key): elves and dwarves see in the dark.")) })],
          [E("slot", K.classe, T("Classe", "Class"), { mode: "instance", size: 34, showName: true, filterType: "tag", filterTag: T("classe", "class"), askReplace: true,
            emptyText: T("Glisser une classe", "Drop a class"),
            tt: tt(T("Un slot qui accepte un objet « Classe ». La classe apporte ses bonus (PV, mana, attaque) tant qu'elle est rangée ici.", "A slot that accepts a \"Class\" item. The class brings its bonuses (HP, mana, attack) while it sits here.")) })],
          [E("level", K.niveau, T("Niveau", "Level"), { default: 1, max: "5", mode: "xp", xpKey: K.xp, thresholds: "100, 300, 600, 1000",
            showMax: true, gauge: "xp", button: true, who: "player", commit: "validate",
            rules: [{ id: "talentpt", when: "each", n: 1, from: 1, actions: [{ type: "value", key: K.points_talent, op: "add", value: "1" }] }],
            tt: tt(T("Le niveau monte avec l'expérience (100, 300, 600, 1000). Chaque niveau donne 1 point de talent.", "The level rises with experience (100, 300, 600, 1000). Each level grants 1 talent point.")) }),
            E("number", K.xp, T("Expérience", "Experience"), { integer: true, default: 0, min: 0, width: 70,
              tt: tt(T("La clé que lit le niveau. Les récompenses de quête l'augmentent.", "The key the level reads. Quest rewards raise it.")) }, { style: { labelPos: "side-left" } })]
        ], { widths: [28, 42, 30] }),
        cols("ressources", [
          [E("gauge", K.pv, T("Points de vie", "Hit points"), { min: 0, max: 10, default: 20, maxFormula: `10 + ${K.constitution} + (${K.niveau} - 1) * 6 + carried("${K.bonus_pv}")`,
            text: "valueMax", low: 30, high: 75, temp: { on: true, stack: "max", endCombat: true },
            tt: tt(T("Jauge. Maximum calculé : 10 + constitution + 6 par niveau + bonus de la classe. Accepte des points temporaires (la case « + »).", "Gauge. Computed maximum: 10 + constitution + 6 per level + class bonus. Accepts temporary points (the \"+\" box)."), true) },
            { style: { labelPos: "above-left", gFill: "#b8322a", gLow: "#7a1d17", gHigh: "#3f9c35" } })],
          [E("gauge", K.mana, T("Mana", "Mana"), { min: 0, max: 10, default: 10, maxFormula: `${K.intelligence} + ${K.niveau} * 2 + carried("${K.bonus_mana}")`, text: "valueMax", low: 25, high: 80,
            tt: tt(T("Jauge de mana : les sorts la dépensent. Maximum : intelligence + 2 par niveau + bonus de la classe.", "Mana gauge: spells spend it. Maximum: intelligence + 2 per level + class bonus."), true) },
            { style: { labelPos: "above-left", gFill: "#2f63c4", gLow: "#1d3a75", gHigh: "#4f86e8" } })]
        ])
      ]
    ], { widths: [20, 80] })
  ], { bare: true });

  const tabCarac = E("tab", "onglet_carac", T("Aptitudes", "Abilities"), { icon: "fa-solid fa-dice-d20" }, { children: [
    cols("carac_cols", [
      [frame("cadre_attributs", T("Attributs", "Attributes"), attrEls)],
      [frame("cadre_profil", T("Profil", "Profile"), [
        E("chart", "profil", "", { type: "radar", min: -3, max: 5, auto: false, step: 1,
          tt: tt(T("Graphique radar : les modificateurs glissés dedans en deviennent les données. Il se met à jour en direct.", "Radar chart: the modifiers dragged into it become its data. It updates live.")) },
          { children: modEls })
      ])]
    ], { widths: [48, 52], equalHeight: true }),
    frame("cadre_competences", T("Compétences", "Skills"), [
      cols("comp_cols", [
        [skill("athletisme", T("Athlétisme", "Athletics"), "force", "fa-solid fa-dumbbell"),
          skill("crochetage", T("Crochetage", "Lockpicking"), "agilite", "fa-solid fa-key"),
          skill("discretion", T("Discrétion", "Stealth"), "agilite", "fa-solid fa-user-ninja")],
        [skill("perception", T("Perception", "Perception"), "sagesse", "fa-solid fa-magnifying-glass"),
          skill("pistage", T("Pistage", "Tracking"), "sagesse", "fa-solid fa-paw"),
          skill("survie", T("Survie", "Survival"), "sagesse", "fa-solid fa-campground")],
        [skill("arcanes", T("Arcanes", "Arcana"), "intelligence", "fa-solid fa-hat-wizard"),
          skill("persuasion", T("Persuasion", "Persuasion"), "charisme", "fa-solid fa-handshake")]
      ])
    ]),
    cols("sens_cols", [
      [frame("cadre_langues", T("Langues", "Languages"), [
        E("number", K.elfique, T("Elfique (%)", "Elvish (%)"), { integer: true, default: 0, min: 0, max: 100, width: 64, labelIcon: "fa-solid fa-leaf",
          tt: tt(T("Même clé qu'une langue du manager des langues : 100 = lit tout, 40 = lit 40 % des mots, 0 = rien.", "Same key as a language in the language manager: 100 = reads everything, 40 = reads 40% of the words, 0 = nothing.")) }),
        E("checkbox", K.nain, T("Parle le nain", "Speaks Dwarvish"), { default: false, labelIcon: "fa-solid fa-hammer",
          tt: tt(T("Une case cochée donne la langue à 100 %.", "A checked box grants the language at 100%.")) })
      ])],
      [frame("cadre_sens", T("Sens", "Senses"), [
        E("number", "sight", T("Vision (cases)", "Sight (squares)"), { computed: true, integer: true, width: 64, labelIcon: "fa-solid fa-eye",
          formula: T(`race == "Elfe" || race == "Nain" ? 12 : 6`, `race == "Elf" || race == "Dwarf" ? 12 : 6`),
          tt: tt(T("Clé fixe « sight » : la portée de vue du jeton. Calculée selon la race.", "Fixed key \"sight\": the token's sight range. Computed from the race."), true) })
      ])]
    ], { equalHeight: true })
  ] });

  const tabCombat = E("tab", "onglet_combat", T("Combat", "Combat"), { icon: "fa-solid fa-shield-halved" }, { children: [
    cols("combat_cols", [
      [frame("cadre_scores", T("Scores", "Scores"), [
        E("number", K.defense, T("Défense", "Defense"), { computed: true, integer: true, width: 64, labelIcon: "fa-solid fa-shield",
          formula: `10 + ${K.mod_agilite} + carried("${K.bonus_defense}", "${K.armure}") + carried("${K.bonus_defense}", "${K.main_gauche}")`,
          tt: tt(T("10 + agilité + l'armure et le bouclier équipés. C'est ce que l'attaquant doit égaler.", "10 + agility + the equipped armor and shield. The attacker must match it."), true) }),
        E("number", K.attaque, T("Attaque", "Attack"), { computed: true, integer: true, width: 64, labelIcon: "fa-solid fa-khanda",
          formula: `${K.mod_force} + floor(${K.niveau} / 2) + carried("${K.bonus_attaque}", "${K.classe}")`,
          tt: tt(T("Score de mêlée : force + moitié du niveau + bonus de classe. Les armes l'ajoutent à leur jet.", "Melee score: strength + half the level + class bonus. Weapons add it to their roll."), true) }),
        E("number", K.tir, T("Tir", "Ranged"), { computed: true, integer: true, width: 64, labelIcon: "fa-solid fa-bullseye",
          formula: `${K.mod_agilite} + floor(${K.niveau} / 2)`,
          tt: tt(T("Score à distance : agilité + moitié du niveau.", "Ranged score: agility + half the level."), true) }),
        E("number", K.initiative, T("Initiative", "Initiative"), { computed: true, integer: true, width: 64, labelIcon: "fa-solid fa-bolt",
          formula: `${K.mod_agilite} + ${K.mod_sagesse}`,
          roll: { on: true, formula: `1d20 + ${K.initiative}`, label: T("Initiative", "Initiative") },
          tt: tt(T("Lue par les règles de combat pour l'ordre des tours (1d20 + score).", "Read by the combat rules for turn order (1d20 + score)."), true) })
      ]),
        frame("cadre_resist", T("Résistances", "Resistances"), [
          E("number", K.res_feu, T("Feu", "Fire"), { integer: true, default: 0, width: 56, labelIcon: "🔥", bonusFormula: `carried("${K.res_feu}")`,
            tt: tt(T("Retirée des dégâts de feu (règles de combat → types de dégâts).", "Subtracted from fire damage (combat rules → damage types).")) }),
          E("number", K.res_poison, T("Poison", "Poison"), { integer: true, default: 0, width: 56, labelIcon: "🧪",
            tt: tt(T("Retirée des dégâts de poison, et ajoutée au jet de résistance de l'effet « Empoisonné ».", "Subtracted from poison damage, and added to the resistance roll of the \"Poisoned\" effect.")) })
        ])],
      [frame("cadre_equipement", T("Équipement", "Equipment"), [
        cols("slots_cols", [
          [E("slot", K.main_droite, T("Main droite", "Main hand"), { mode: "instance", size: 64, filterType: "tag", filterTag: T("arme", "weapon"), askReplace: true, 
            tt: tt(T("Slot filtré par étiquette « arme ». Une arme rangée ici est « équipée » : ses actions vont dans le HUD.", "Slot filtered by the \"weapon\" tag. A weapon stored here is \"equipped\": its actions go to the HUD.")) })],
          [E("slot", K.main_gauche, T("Main gauche", "Off hand"), { mode: "instance", size: 64, filterType: "tag", filterTag: T("bouclier", "shield"), askReplace: true, 
            tt: tt(T("N'accepte que l'étiquette « bouclier ».", "Only accepts the \"shield\" tag.")) })],
          [E("slot", K.armure, T("Armure", "Armor"), { mode: "instance", size: 64, filterType: "tag", filterTag: T("armure", "armor"), askReplace: true, 
            tt: tt(T("Le bonus de défense de l'armure rangée ici entre dans la Défense.", "The defense bonus of the armor stored here goes into Defense.")) })]
        ])
      ]),
        frame("cadre_effets", T("Effets actifs", "Active effects"), [
          E("effects", "effets_actifs", "", { tt: tt(T("Les effets posés (manager des effets) : nom, cumuls, ce qu'ils font, temps restant. La croix les retire.", "Effects on the character (effects manager): name, stacks, what they do, time left. The cross removes them.")) })
        ])]
    ], { widths: [45, 55] })
  ] });

  const tabInv = E("tab", "onglet_inventaire", T("Inventaire", "Inventory"), { icon: "fa-solid fa-sack-xmark" }, { children: [
    cols("bourse_cols", [
      [frame("cadre_bourse", T("Bourse", "Purse"), [
        cols("bourse_in", [
          [E("number", K.or, T("Or", "Gold"), { integer: true, default: 0, min: 0, width: 64, labelIcon: "🟡", tt: tt(T("Monnaie déclarée dans « Marchands et monnaies » (1 or = 100 cuivre).", "Currency declared in \"Merchants and currencies\" (1 gold = 100 copper).")) }, { style: { labelPos: "above-center" } })],
          [E("number", K.argent, T("Argent", "Silver"), { integer: true, default: 0, min: 0, width: 64, labelIcon: "⚪", tt: tt(T("1 argent = 10 cuivre. La monnaie est rendue automatiquement chez le marchand.", "1 silver = 10 copper. Change is given back automatically at the merchant.")) }, { style: { labelPos: "above-center" } })],
          [E("number", K.cuivre, T("Cuivre", "Copper"), { integer: true, default: 0, min: 0, width: 64, labelIcon: "🟤", tt: tt(T("L'unité de base : les prix sont écrits en cuivre.", "The base unit: prices are written in copper.")) }, { style: { labelPos: "above-center" } })]
        ])
      ])],
      [frame("cadre_charge", T("Charge", "Load"), [
        E("gauge", K.charge, T("Poids porté", "Carried weight"), { computed: true, formula: `carried("${K.poids}")`, decimals: true, maxFormula: `${K.force} * 3`, min: 0, max: 30, text: "valueMax", low: 0, high: 85,
          blockMax: true, blockMsg: T("{nom} est trop chargé pour {objet} ({apres}/{max}).", "{nom} is carrying too much for {objet} ({apres}/{max})."), blockGm: false,
          tt: tt(T("Jauge calculée : la somme des poids portés. Maximum : force × 3. « Ne jamais dépasser » refuse un objet de trop.", "Computed gauge: the sum of carried weights. Maximum: strength × 3. \"Never exceed\" refuses one item too many."), true) },
          { style: { gFill: "#8a6a2c", gHigh: "#c62828" } })
      ])]
    ], { widths: [50, 50], equalHeight: true }),
    frame("cadre_sac", T("Sac à dos", "Backpack"), [
      E("container", K.sac, "", { mode: "instance", display: "spatial", gridCols: 12, gridRows: 5, cellSize: 50, gridName: false, excludeTag: T("sort, classe", "spell, class"),
        tt: tt(T("Grille spatiale de 12 × 5 cases : chaque objet y occupe sa taille (une épée 1 × 3, une cotte de mailles 2 × 3) et peut pivoter d'un quart de tour. Elle refuse les sorts et les classes (étiquettes refusées). Clic droit sur un objet : ses actions.", "12 × 5 spatial grid: each item takes up its own size (a sword 1 × 3, chain mail 2 × 3) and can turn a quarter. It refuses spells and classes (refused tags). Right-click an item: its actions.")) })
    ])
  ] });

  const tabSorts = E("tab", "onglet_sorts", T("Sorts", "Spells"), { icon: "fa-solid fa-wand-sparkles" }, { children: [
    frame("cadre_grimoire", T("Grimoire", "Spellbook"), [
      E("container", K.grimoire, "", { mode: "instance", display: "cards", filterType: "tag", filterTag: T("sort", "spell"), unique: true, emptyText: T("Aucun sort appris. Glissez un sort ici.", "No spell learned yet. Drop a spell here."),
        catMode: "key", catKey: K.ecole,
        cols: [
          { key: K.cout_mana, label: T("Mana", "Mana"), place: "chip", text: `-{{${K.cout_mana}}} ${T("mana", "mana")}`, tone: "cost" },
          { key: K.niveau_sort, label: T("Cercle", "Circle"), place: "box", text: `{{${K.niveau_sort}}}` }
        ],
        tt: tt(T("Conteneur en « fiches », classé par école. Chaque sort montre son coût et ses boutons ; un sort ne peut être appris qu'une fois.", "Container shown as \"cards\", sorted by school. Each spell shows its cost and its buttons; a spell can only be learned once.")) })
    ])
  ] });

  const tabTalents = E("tab", "onglet_talents", T("Talents", "Talents"), { icon: "fa-solid fa-sitemap" }, { children: [
    E("number", K.points_talent, T("Points de talent", "Talent points"), { integer: true, default: 1, min: 0, width: 56, labelIcon: "fa-solid fa-star",
      tt: tt(T("Gagnés à chaque niveau, dépensés dans l'arbre ci-dessous.", "Earned each level, spent in the tree below.")) }, { style: { labelPos: "above-left" } }),
    E("talents", K.talents, "", { pointsKey: K.points_talent, who: "player", refund: "node", refundWho: "gm", height: 400,
      tree: talentTree(L),
      tt: tt(T("Arbre de talents : un nœud se débloque quand ses parents le sont et qu'il reste des points. Ses bonus s'ajoutent à la fiche.", "Talent tree: a node unlocks when its parents are and points remain. Its bonuses add to the sheet.")) })
  ] });

  const tabBio = E("tab", "onglet_bio", T("Biographie", "Biography"), { icon: "fa-solid fa-feather" }, { children: [
    cols("bio_cols", [
      [frame("cadre_identite", T("Identité", "Identity"), [
        cols("identite_cols", [
          [E("text", K.age, T("Âge", "Age"), { default: "" }, { style: { labelPos: "above-left" } })],
          [E("text", K.origine, T("Origine", "Origin"), { default: "" }, { style: { labelPos: "above-left" } })]
        ], { widths: [35, 65] }),
        E("text", K.ideal, T("Idéal", "Ideal"), { default: "" }, { style: { labelPos: "above-left" } }),
        E("text", K.apparence, T("Apparence", "Looks"), { default: "" }, { style: { labelPos: "above-left" } })
      ])],
      [frame("cadre_notes", T("Notes", "Notes"), [
        E("richtext", K.notes, "", { paper: "lined", minHeight: 150, tt: tt(T("Texte riche sur papier ligné. Marquez un passage avec une langue : il se brouille pour qui ne la connaît pas.", "Rich text on lined paper. Mark a passage with a language: it scrambles for whoever doesn't know it.")) })
      ])]
    ], { widths: [50, 50], equalHeight: true }),
    frame("cadre_histoire", T("Histoire", "Story"), [E("richtext", K.histoire, "", { minHeight: 120 })])
  ] });

  return {
    sbe: "template", format: 1, for: "actor", name: T("Aventurier", "Adventurer"),
    tabs: [], media: [], hud: adventurerHud(L), tokenBars: templateBars(L, { mana: true }),
    theme: { interface: { sheetW: 720, sheetH: 780 } },
    nativeUi: { img: { config: { width: 120, height: 120 }, style: {} }, name: { config: { subLabel: T("Aventurier", "Adventurer") }, style: {} } },
    elements: restyle([
      header,
      E("nav", "onglets", "", { orient: "h", align: "left" }, { children: [tabCarac, tabCombat, tabInv, tabSorts, tabTalents, tabBio] })
    ], { [K.race]: { labelPos: "above-left" }, [K.niveau]: { labelPos: "above-left" } })
  };
}

/** Arbre de talents de l'aventurier. */
function talentTree(L) {
  const { T, K } = L;
  const n = (id, x, y, name, icon, desc, bonus = [], extra = {}) => ({ id, x, y, name, icon, desc, ranks: 1, bonus, ...extra });
  return {
    grid: 40, snap: true, shape: "circle", size: 56,
    nodes: [
      n("robuste", 130, 60, T("Robuste", "Sturdy"), "icons/svg/heal.svg", T("+5 PV maximum.", "+5 maximum HP."), [{ key: `${K.pv}_max`, mode: "add", value: "5" }]),
      n("arme", 130, 190, T("Maîtrise des armes", "Weapon mastery"), "icons/svg/sword.svg", T("+1 en attaque.", "+1 attack."), [{ key: K.attaque, mode: "add", value: "1" }]),
      n("colosse", 130, 320, T("Colosse", "Juggernaut"), "icons/svg/holy-shield.svg", T("+2 en défense. Coûte 2 points.", "+2 defense. Costs 2 points."), [{ key: K.defense, mode: "add", value: "2" }], { cost: "2" }),
      n("esprit", 350, 60, T("Esprit vif", "Quick mind"), "icons/svg/aura.svg", T("+4 mana maximum.", "+4 maximum mana."), [{ key: `${K.mana}_max`, mode: "add", value: "4" }]),
      n("arcane", 350, 190, T("Initié des arcanes", "Arcane adept"), "icons/svg/book.svg", T("+2 en arcanes.", "+2 arcana."), [{ key: K.arcanes, mode: "add", value: "2" }]),
      n("ombre", 570, 60, T("Pas de loup", "Light step"), "icons/svg/invisible.svg", T("+2 en discrétion.", "+2 stealth."), [{ key: K.discretion, mode: "add", value: "2" }]),
      n("doigts", 570, 190, T("Doigts de fée", "Nimble fingers"), "icons/svg/padlock.svg", T("+2 en crochetage.", "+2 lockpicking."), [{ key: K.crochetage, mode: "add", value: "2" }]),
      n("aventurier", 350, 320, T("Vétéran", "Veteran"), "icons/svg/upgrade.svg", T("+1 en initiative. Il suffit d'un des trois talents du dessus.", "+1 initiative. Any one of the three talents above is enough."), [{ key: K.initiative, mode: "add", value: "1" }], { parents: "any", cost: "2" })
    ],
    links: [
      { a: "robuste", b: "arme" }, { a: "arme", b: "colosse" },
      { a: "esprit", b: "arcane" }, { a: "ombre", b: "doigts" },
      { a: "arme", b: "aventurier" }, { a: "arcane", b: "aventurier" }, { a: "doigts", b: "aventurier" }
    ],
    look: { link: "curve" }
  };
}

/* ------------------------------------------------------------ */
/*  Modèle de personnage : CRÉATURE (et Bête, même structure)      */
/* ------------------------------------------------------------ */

export function creatureTemplate(L, { beast = false } = {}) {
  const { T, K } = L;
  const name = beast ? T("Bête", "Beast") : T("Créature", "Creature");
  return {
    sbe: "template", format: 1, for: "actor", name, tabs: [], media: [], hud: creatureHud(L), tokenBars: templateBars(L, { foe: true }),
    theme: { interface: { sheetW: 600, sheetH: 680 } },
    nativeUi: { img: { config: { width: 96, height: 96 }, style: {} }, name: { config: { subLabel: name }, style: {} } },
    elements: [
      frame("entete", "", [
        cols("entete_cols", [
          [E("actorImg", "", "", {})],
          [
            E("actorName", "", "", {}),
            E("gauge", K.pv, T("Points de vie", "Hit points"), { min: 0, max: 12, default: 12, maxFormula: K.pv_maximum, text: "valueMax", low: 30, high: 75,
              tt: tt(T("La clé qui encaisse les dégâts (règles de combat). À 0, la créature est vaincue dans le carrousel.", "The key that takes damage (combat rules). At 0, the creature is defeated in the carousel.")) },
              { style: { gFill: "#b8322a", gLow: "#7a1d17", gHigh: "#3f9c35" } }),
            cols("crea_scores", [
              [E("number", K.defense, T("Défense", "Defense"), { integer: true, default: 11, min: 0, width: 56, labelIcon: "fa-solid fa-shield",
                tt: tt(T("Valeur fixe que l'attaquant doit égaler.", "Fixed value the attacker must match.")) })],
              [E("number", K.attaque, T("Attaque", "Attack"), { integer: true, default: 3, width: 56, labelIcon: "fa-solid fa-khanda",
                tt: tt(T("Ajoutée au d20 de ses attaques.", "Added to the d20 of its attacks.")) })],
              [E("number", K.initiative, T("Initiative", "Initiative"), { integer: true, default: 1, width: 56, labelIcon: "fa-solid fa-bolt",
                roll: { on: true, formula: `1d20 + ${K.initiative}`, label: T("Initiative", "Initiative") } })]
            ])
          ]
        ], { widths: [22, 78] })
      ], { bare: true }),
      cols("crea_cols", [
        [
          frame("cadre_attaques", T("Attaques", "Attacks"), [
          E("text", K.degats_naturels, T("Dégâts", "Damage"), { default: "1d6", width: 90,
            tt: tt(T("Un jet écrit en texte : il est lancé par l'étape « Attaquer ».", "A roll written as text: the \"Attack\" step rolls it.")) }),
          E("number", K.score, T("Score de frappe", "Strike score"), { computed: true, integer: true, formula: K.attaque,
            roll: { on: true, formula: `1d20 + ${K.score}`, label: T("Frappe", "Strike"), compare: "targetOver", target: "10",
              critS: { mode: "value", expr: "20" }, critF: { mode: "value", expr: "1" }, critDie: true } }, { sheetHidden: true }),
          E("button", "frapper", beast ? T("Mordre", "Bite") : T("Frapper", "Strike"), { action: "steps", steps: [
            { type: "attack", key: K.score, damage: K.degats_naturels, profile: T("Mêlée", "Melee"), range: "1" }
          ], tt: tt(T("Bouton à étapes : « Attaquer » vise un jeton, lance la défense puis la frappe et applique les dégâts.", "Step button: \"Attack\" targets a token, rolls the defense then the strike, and applies the damage.")) })
        ]),
          frame("cadre_resist", T("Résistances", "Resistances"), [
            E("number", K.res_feu, T("Feu", "Fire"), { integer: true, default: 0, width: 56, labelIcon: "🔥",
              tt: tt(T("Retirée des dégâts de feu reçus (type de dégâts des règles de combat).", "Subtracted from fire damage taken (combat rules damage type).")) }),
            E("number", K.res_poison, T("Poison", "Poison"), { integer: true, default: 0, width: 56, labelIcon: "🧪",
              tt: tt(T("Retirée des dégâts de poison reçus.", "Subtracted from poison damage taken.")) })
          ])
        ],
        [frame("cadre_traits", T("Traits", "Traits"), [
          E("number", K.pv_maximum, T("PV maximum", "Max HP"), { integer: true, default: 12, min: 1, width: 56, labelIcon: "fa-solid fa-heart",
            tt: tt(T("Le maximum de la jauge de points de vie : chaque créature a le sien.", "The hit point gauge's maximum: each creature has its own.")) }),
          E("checkbox", K.mort_vivant, T("Mort-vivant", "Undead"), { default: false, labelIcon: "fa-solid fa-skull",
            tt: tt(T("Lu par le sort « Lumière sacrée » : il ne peut viser qu'un mort-vivant.", "Read by the \"Holy light\" spell: it can only target the undead.")) }),
          E("number", K.perception, T("Perception", "Perception"), { integer: true, default: 1, width: 56, labelIcon: "fa-solid fa-magnifying-glass",
            roll: { on: true, formula: `1d20 + ${K.perception}`, label: T("Perception", "Perception"), compare: "targetOver", target: "12" } }),
          E("number", "sight", T("Vision (cases)", "Sight (squares)"), { integer: true, default: 10, width: 56, labelIcon: "fa-solid fa-eye" })
        ])]
      ], { widths: [50, 50] }),
      frame("cadre_effets", T("Effets actifs", "Active effects"), [E("effects", "effets_actifs", "", {})]),
      frame("cadre_butin", T("Butin", "Loot"), [
        E("container", K.sac, "", { mode: "instance", display: "grid", cellSize: 48, gridName: false,
          tt: tt(T("Ce qu'elle porte : à récupérer sur sa dépouille.", "What it carries: to take from its remains.")) })
      ]),
      frame("cadre_notes", T("Notes du MJ", "GM notes"), [E("richtext", K.notes, "", { minHeight: 80 })], {}, { playerVisible: false })
    ]
  };
}

/* ------------------------------------------------------------ */
/*  Modèles d'objets                                              */
/* ------------------------------------------------------------ */

/** Le bloc commun « Poids et prix » (+ rareté, état). */
function tradeFrame(L, { state = true } = {}) {
  const { T, K, V } = L;
  return frame("cadre_commerce", T("Poids et prix", "Weight and price"), [
    cols("commerce_cols", [
      [E("number", K.poids, T("Poids", "Weight"), { integer: false, decimals: 2, default: 1, min: 0, width: 64, labelIcon: "fa-solid fa-weight-hanging",
        tt: tt(T("Additionné par la jauge « Poids porté » du personnage (carried).", "Added up by the character's \"Carried weight\" gauge (carried).")) }, { itemTip: true }),
        E("number", K.prix, T("Prix (cuivre)", "Price (copper)"), { integer: true, default: 10, min: 0, width: 64, labelIcon: "fa-solid fa-coins",
          tt: tt(T("La clé de prix lue par les marchands, en pièces de cuivre (affiché en or / argent / cuivre).", "The price key read by merchants, in copper coins (shown as gold / silver / copper).")) }, { itemTip: true })],
      [E("select", K.rarete, T("Rareté", "Rarity"), { choices: V.rarities, default: V.rarities[0], choiceColors: V.rarityColors, headerColor: true,
        tt: tt(T("Liste à couleurs : la rareté s'affiche en tête de l'info-bulle de l'objet, dans sa couleur.", "Colored list: the rarity shows at the top of the item tooltip, in its color.")) }),
        ...(state ? [E("select", K.etat, T("État", "Condition"), { choices: V.states, default: V.states[0], choiceColors: V.stateColors,
          tt: tt(T("Non propagé : chaque exemplaire garde son propre état (une épée usée reste usée quand le modèle change).", "Not propagated: each copy keeps its own condition (a worn sword stays worn when the world item changes).")) }, { propagate: false, itemTip: true })] : [])]
    ])
  ]);
}

export function weaponTemplate(L) {
  const { T, K, V } = L;
  const ranged = T(`${K.categorie} == "Distance"`, `${K.categorie} == "Ranged"`);
  const melee = T(`${K.categorie} != "Distance"`, `${K.categorie} != "Ranged"`);
  const broken = T(`${K.etat} != "Brisé"`, `${K.etat} != "Broken"`);
  return {
    sbe: "template", format: 1, for: "item", name: T("Arme", "Weapon"),
    tabs: [], media: [{ name: "frappe", hint: T("Au moment de frapper ou de tirer", "When striking or shooting") }, { name: "impact", hint: T("Le coup porte", "The blow lands") }],
    opts: { stackable: false, droppable: true, playerVisible: true },
    elements: [
      E("tags", "etiquettes", T("Étiquettes", "Tags"), { entries: [T("Arme", "Weapon"), `@${K.categorie}`], highlight: "first", place: "header",
        tt: tt(T("Les étiquettes servent aux filtres : le slot « Main droite » n'accepte que l'étiquette « arme ».", "Tags drive the filters: the \"Main hand\" slot only accepts the \"weapon\" tag.")) }),
      frame("cadre_actions", T("Actions", "Actions"), [
        cols("actions_cols", [
          [E("button", "attaquer", T("Attaquer", "Attack"), { action: "steps", steps: [
            { type: "condition", formula: broken, message: T("L'arme est brisée.", "The weapon is broken.") },
            { type: "attack", key: K.score, damage: `${K.degats} + carrier("${K.mod_force}")`, profile: T("Mêlée", "Melee"), range: K.portee, mediaShot: "frappe", mediaHit: "impact" }
          ], tt: tt(T("Bouton à étapes : Condition (pas brisée), puis Attaquer avec le profil « Mêlée » des règles de combat.", "Step button: Condition (not broken), then Attack with the \"Melee\" profile from the combat rules.")) },
          { visibleIf: melee }),
          E("button", "tirer", T("Tirer", "Shoot"), { action: "steps", steps: [
            { type: "condition", formula: broken, message: T("L'arme est brisée.", "The weapon is broken.") },
            { type: "condition", formula: `carriedCount("${K.munitions}") > 0`, message: T("Plus de flèches : rechargez.", "No arrows left: reload.") },
            { type: "attack", key: K.score, damage: `${K.degats} + carriedValue("${K.degats}", "${K.munitions}")`, profile: T("Distance", "Ranged"), range: K.portee, mediaShot: "frappe", mediaHit: "impact" },
            { type: "consume", from: "slot", slot: K.munitions, amount: "1" }
          ], tt: tt(T("Condition, Attaquer (profil « Distance »), puis Consommer une flèche du slot « Flèches ». Annuler la visée ne coûte rien.", "Condition, Attack (\"Ranged\" profile), then Consume one arrow from the \"Arrows\" slot. Cancelling the aim costs nothing.")) },
          { visibleIf: ranged })],
          [E("button", "recharger", T("Recharger", "Reload"), { action: "steps", steps: [
            { type: "fill", slot: K.munitions }
          ], tt: tt(T("Étape « Remplir un slot » : prend des flèches dans l'inventaire du porteur.", "\"Fill a slot\" step: takes arrows from the carrier's inventory.")) },
          { visibleIf: ranged })]
        ])
      ]),
      frame("cadre_combat", T("Combat", "Combat"), [
        cols("combat_cols", [
          [E("select", K.categorie, T("Catégorie", "Category"), { choices: V.weaponCats, default: V.weaponCats[0],
            tt: tt(T("Montre les boutons et les champs qui vont avec (« Visible si »).", "Shows the buttons and fields that go with it (\"Visible if\").")) }),
            E("text", K.degats, T("Dégâts", "Damage"), { default: "1d6", width: 90,
              tt: tt(T("Un jet en texte (1d8, 2d6…). L'attaque y ajoute le modificateur de force du porteur.", "A roll as text (1d8, 2d6…). The attack adds the carrier's strength modifier.")) }, { itemTip: true }),
            E("select", K.type_degats, T("Type de dégâts", "Damage type"), { choices: V.dmgTypes, default: V.dmgTypes[0] }, { itemTip: true })],
          [E("number", K.bonus_toucher, T("Précision", "Accuracy"), { integer: true, default: 0, width: 56,
            tt: tt(T("Ajoutée au score d'attaque du porteur.", "Added to the carrier's attack score.")) }, { itemTip: true }),
            E("number", K.portee, T("Portée (cases)", "Range (squares)"), { integer: true, default: 1, min: 1, width: 56 }, { itemTip: true }),
            E("number", K.score, T("Score", "Score"), { computed: true, integer: true, width: 64,
              formula: `(${ranged} ? carrier("${K.tir}") : carrier("${K.attaque}")) + ${K.bonus_toucher}`,
              roll: { on: true, formula: `1d20 + ${K.score}`, label: T("Attaque", "Attack"), compare: "targetOver", target: "10",
                critS: { mode: "value", expr: "20" }, critF: { mode: "value", expr: "1" }, critDie: true,
                dialog: { adv: true, advCount: 2, mod: true } },
              tt: tt(T("Calculé : le score d'attaque (ou de tir) du porteur, lu avec carrier(), + la précision. Jet : 1d20 + score contre la défense de la cible.", "Computed: the carrier's attack (or ranged) score, read with carrier(), + accuracy. Roll: 1d20 + score against the target's defense."), true) })]
        ]),
        E("slot", K.munitions, T("Flèches", "Arrows"), { mode: "instance", size: 48, filterType: "tag", filterTag: T("flèche", "arrow"), acceptStacks: true, qtyMax: "20", askReplace: true,
          tt: tt(T("Slot qui accepte une pile (20 au plus) : les flèches chargées sont de vrais objets, consommés au tir.", "Slot that accepts a stack (20 at most): loaded arrows are real items, consumed when shooting.")) },
          { visibleIf: ranged })
      ]),
      tradeFrame(L)
    ]
  };
}

export function armorTemplate(L, { shield = false } = {}) {
  const { T, K, V } = L;
  const types = V.armorTypes.slice(0, 3);
  return {
    sbe: "template", format: 1, for: "item", name: shield ? T("Bouclier", "Shield") : T("Armure", "Armor"),
    tabs: [], media: [],
    opts: { stackable: false, droppable: true, playerVisible: true },
    elements: [
      E("tags", "etiquettes", T("Étiquettes", "Tags"), { entries: shield ? [T("Bouclier", "Shield")] : [T("Armure", "Armor"), `@${K.type_armure}`], highlight: "first", place: "header" }),
      frame("cadre_protection", T("Protection", "Protection"), [
        cols("protection_cols", [
          [...(shield ? [] : [E("select", K.type_armure, T("Type", "Type"), { choices: types, default: types[0] })]),
            E("number", K.bonus_defense, T("Défense", "Defense"), { integer: true, default: shield ? 1 : 2, min: 0, width: 56, labelIcon: "fa-solid fa-shield",
              tt: tt(T("Lu par la Défense du personnage, seulement si l'objet est dans le bon slot : carried(\"clé\", \"slot\").", "Read by the character's Defense, only when the item is in the right slot: carried(\"key\", \"slot\").")) }, { itemTip: true })],
          [E("number", K.res_feu, T("Feu", "Fire"), { integer: true, default: 0, width: 56, labelIcon: "🔥",
            tt: tt(T("Ajoutée à la résistance du porteur par sa formule de bonus.", "Added to the carrier's resistance through its bonus formula.")) }, { itemTip: true })]
        ])
      ]),
      tradeFrame(L)
    ]
  };
}

export function consumableTemplate(L) {
  const { T, K, V } = L;
  const is = (i) => `${K.effet_conso} == "${V.consoEffects[i]}"`;
  return {
    sbe: "template", format: 1, for: "item", name: T("Consommable", "Consumable"),
    tabs: [], media: [{ name: T("boire", "drink"), hint: T("À l'utilisation", "On use") }],
    opts: { stackable: true, stackMax: 10, droppable: true, playerVisible: true },
    elements: [
      E("tags", "etiquettes", T("Étiquettes", "Tags"), { entries: [T("Consommable", "Consumable"), `@${K.effet_conso}`], highlight: "first", place: "header" }),
      frame("cadre_actions", T("Actions", "Actions"), [
        cols("actions_cols", [
          [E("button", "boire", T("Boire", "Drink"), { action: "steps", announce: true, steps: [
            { type: "consume", from: "self", amount: "1" },
            { type: "set", key: K.pv, formula: K.soin, mode: "add", target: "carrier", onlyIf: is(0) },
            { type: "set", key: K.mana, formula: K.mana_rendue, mode: "add", target: "carrier", onlyIf: is(1) },
            { type: "effect", key: K.empoisonne, action: "remove", target: "self", onlyIf: is(2) }
          ], tt: tt(T("Consommer (la pile baisse), puis Modifier un champ du porteur selon l'effet. « Annoncer dans le chat » montre ce qui a changé.", "Consume (the stack goes down), then Modify a field of the carrier depending on the effect. \"Announce in chat\" shows what changed.")) })],
          [E("button", "faire_boire", T("Faire boire…", "Give to drink…"), { action: "steps", announce: true, steps: [
            { type: "target", range: "1", who: "allies", targetMsg: T("Seulement un allié à côté de vous.", "Only an ally next to you.") },
            { type: "consume", from: "self", amount: "1" },
            { type: "set", key: K.pv, formula: K.soin, mode: "add", target: "targets", onlyIf: is(0) },
            { type: "set", key: K.mana, formula: K.mana_rendue, mode: "add", target: "targets", onlyIf: is(1) },
            { type: "effect", key: K.empoisonne, action: "remove", target: "targets", onlyIf: is(2) }
          ], tt: tt(T("« Choisir une cible » (un allié à 1 case), puis les mêmes étapes sur la cible.", "\"Choose a target\" (an ally within 1 square), then the same steps on the target.")) })]
        ])
      ]),
      frame("cadre_effet", T("Effet", "Effect"), [
        cols("effet_cols", [
          [E("select", K.effet_conso, T("Effet", "Effect"), { choices: V.consoEffects.slice(0, 3), default: V.consoEffects[0] }, { itemTip: true }),
            E("quantity", "quantity", T("Quantité", "Quantity"), { default: 1 })],
          [E("text", K.soin, T("Soin", "Healing"), { default: "2d4 + 2", width: 90,
            tt: tt(T("Un jet : lancé quand on boit.", "A roll: rolled when drinking.")) }, { visibleIf: is(0), itemTip: true }),
            E("text", K.mana_rendue, T("Mana rendue", "Mana restored"), { default: "1d6 + 2", width: 90 }, { visibleIf: is(1), itemTip: true })]
        ])
      ]),
      tradeFrame(L, { state: false })
    ]
  };
}

export function spellTemplate(L) {
  const { T, K, V } = L;
  const nat = T(["Dégâts", "Soin", "Bénédiction", "Bouclier", "Lumière sacrée"], ["Damage", "Healing", "Blessing", "Shield", "Holy light"]);
  const is = (i) => `${K.nature} == "${nat[i]}"`;
  const mana = { type: "condition", formula: `carrier("${K.mana}") >= ${K.cout_mana}`, message: T("Pas assez de mana.", "Not enough mana.") };
  const pay = { type: "consume", from: "carrier", key: K.mana, amount: K.cout_mana };
  return {
    sbe: "template", format: 1, for: "item", name: T("Sort", "Spell"),
    tabs: [], media: [{ name: "incantation", hint: T("Le sort part", "The spell is cast") }],
    opts: { stackable: false, droppable: false, playerVisible: true },
    elements: [
      E("tags", "etiquettes", T("Étiquettes", "Tags"), { entries: [T("Sort", "Spell"), `@${K.ecole}`], highlight: "all", place: "header" }),
      frame("cadre_actions", T("Lancer", "Cast"), [
        E("button", "lancer_degats", T("Lancer", "Cast"), { action: "steps", steps: [
          mana,
          { type: "attack", key: K.score, damage: K.degats, profile: T("Sort de zone", "Area spell"), range: K.portee, zone: K.gabarit, mediaShot: "incantation" },
          pay
        ], tt: tt(T("Condition (assez de mana), Attaquer avec le profil « Sort de zone » (gabarit, sauvegarde des cibles), puis Consommer la mana du porteur.", "Condition (enough mana), Attack with the \"Area spell\" profile (template, targets' save), then Consume the carrier's mana.")) },
        { visibleIf: is(0) }),
        E("button", "lancer_soin", T("Soigner", "Heal"), { action: "steps", announce: true, steps: [
          mana,
          { type: "target", range: K.portee, who: "allies" },
          pay,
          { type: "set", key: K.pv, formula: K.degats, mode: "add", target: "targets" }
        ], tt: tt(T("Choisir une cible alliée à portée, payer la mana, puis ajouter le jet aux PV de la cible (sans dépasser son maximum).", "Choose an ally in range, pay the mana, then add the roll to the target's HP (never above its maximum).")) },
        { visibleIf: is(1) }),
        E("button", "lancer_benir", T("Bénir", "Bless"), { action: "steps", announce: true, steps: [
          mana,
          { type: "target", range: K.portee, who: "allies" },
          pay,
          { type: "effect", key: K.beni, action: "apply", target: "targets" }
        ], tt: tt(T("Étape « Effet » : pose l'effet « Béni » (manager des effets) sur la cible.", "\"Effect\" step: applies the \"Blessed\" effect (effects manager) to the target.")) },
        { visibleIf: is(2) }),
        E("button", "lancer_bouclier", T("Protéger", "Protect"), { action: "steps", announce: true, steps: [
          mana, pay,
          { type: "set", key: K.pv, formula: K.degats, mode: "temp", target: "carrier" }
        ], tt: tt(T("Donne des points de vie temporaires : ils partent en premier quand on est blessé.", "Grants temporary hit points: they go first when hurt.")) },
        { visibleIf: is(3) }),
        E("button", "lancer_lumiere", T("Illuminer", "Shine"), { action: "steps", announce: true, steps: [
          mana,
          { type: "target", range: K.portee, who: "enemies", targetIf: K.mort_vivant,
            targetMsg: T("La lumière sacrée ne brûle que les morts-vivants.", "Holy light only burns the undead.") },
          pay,
          { type: "set", key: K.pv, formula: K.degats, mode: "sub", target: "targets" }
        ], tt: tt(T("Cible : « Seulement si » lit la case « Mort-vivant » sur la fiche de la cible. Puis retirer le jet à ses PV.", "Target: \"Only if\" reads the \"Undead\" box on the target's sheet. Then subtract the roll from its HP.")) },
        { visibleIf: is(4) })
      ]),
      frame("cadre_sort", T("Sort", "Spell"), [
        cols("sort_cols", [
          [E("select", K.ecole, T("École", "School"), { choices: V.schools, default: V.schools[0], choiceColors: V.schoolColors, headerColor: true,
            tt: tt(T("Le grimoire range les sorts par école, dans l'ordre et la couleur de cette liste.", "The spellbook sorts spells by school, in the order and color of this list.")) }),
            E("select", K.nature, T("Nature", "Nature"), { choices: nat, default: nat[0],
              tt: tt(T("Montre le bouton qui va avec (« Visible si »).", "Shows the matching button (\"Visible if\").")) }),
            E("number", K.niveau_sort, T("Cercle", "Circle"), { integer: true, default: 1, min: 1, max: 5, width: 56 }, { itemTip: true })],
          [E("number", K.cout_mana, T("Coût en mana", "Mana cost"), { integer: true, default: 3, min: 0, width: 56, labelIcon: "fa-solid fa-droplet" }, { itemTip: true, hudTip: true }),
            E("text", K.degats, T("Puissance", "Power"), { default: "2d6", width: 90,
              tt: tt(T("Le jet du sort : dégâts, soin ou points temporaires selon sa nature.", "The spell's roll: damage, healing or temporary points depending on its nature.")) }, { itemTip: true }),
            E("number", K.portee, T("Portée (cases)", "Range (squares)"), { integer: true, default: 6, min: 0, width: 56 }, { itemTip: true }),
            E("select", K.gabarit, T("Gabarit", "Template"), { choices: V.shapes, default: V.shapes[0],
              tt: tt(T("Le nom d'un gabarit dessiné (Paramètres → Gabarits) : la forme de la zone touchée.", "The name of a drawn template (Settings → Templates): the shape of the area hit.")) }, { visibleIf: is(0), itemTip: true }),
            E("number", K.score, T("Score", "Score"), { computed: true, integer: true, width: 64, formula: `carrier("${K.arcanes}")`,
              roll: { on: true, formula: `1d20 + ${K.score}`, label: T("Incantation", "Spellcasting"), compare: "targetOver", target: "10",
                critS: { mode: "value", expr: "20" }, critF: { mode: "value", expr: "1" }, critDie: true },
              tt: tt(T("Les arcanes du porteur : le jet d'incantation.", "The carrier's arcana: the spellcasting roll."), true) }, { visibleIf: is(0) })]
        ])
      ])
    ]
  };
}

export function ammoTemplate(L) {
  const { T, K } = L;
  return {
    sbe: "template", format: 1, for: "item", name: T("Munition", "Ammunition"),
    tabs: [], media: [],
    opts: { stackable: true, stackMax: 20, droppable: true, playerVisible: true },
    elements: [
      E("tags", "etiquettes", T("Étiquettes", "Tags"), { entries: [T("Munition", "Ammunition"), T("Flèche", "Arrow")], highlight: "first", place: "header" }),
      frame("cadre_munition", T("Munition", "Ammunition"), [
        cols("munition_cols", [
          [E("quantity", "quantity", T("Quantité", "Quantity"), { default: 20 })],
          [E("number", K.degats, T("Bonus de dégâts", "Damage bonus"), { integer: true, default: 0, width: 56,
            tt: tt(T("Lu par l'arc avec carriedValue(\"dégâts\", \"flèches\") : la flèche chargée change les dégâts.", "Read by the bow with carriedValue(\"damage\", \"arrows\"): the loaded arrow changes the damage.")) }, { itemTip: true })]
        ])
      ]),
      tradeFrame(L, { state: false })
    ]
  };
}

export function classTemplate(L) {
  const { T, K } = L;
  return {
    sbe: "template", format: 1, for: "item", name: T("Classe", "Class"),
    tabs: [], media: [],
    opts: { stackable: false, droppable: false, playerVisible: true },
    elements: [
      E("tags", "etiquettes", T("Étiquettes", "Tags"), { entries: [T("Classe", "Class")], highlight: "first", place: "header" }),
      frame("cadre_bonus", T("Ce que donne la classe", "What the class grants"), [
        cols("bonus_cols", [
          [E("number", K.bonus_pv, T("PV maximum", "Maximum HP"), { integer: true, default: 0, width: 56, labelIcon: "fa-solid fa-heart",
            tt: tt(T("Lu par la jauge de PV du personnage : carried(\"bonus_pv\").", "Read by the character's HP gauge: carried(\"hp_bonus\").")) }, { itemTip: true }),
            E("number", K.bonus_mana, T("Mana maximum", "Maximum mana"), { integer: true, default: 0, width: 56, labelIcon: "fa-solid fa-droplet" }, { itemTip: true })],
          [E("number", K.bonus_attaque, T("Attaque", "Attack"), { integer: true, default: 0, width: 56, labelIcon: "fa-solid fa-khanda" }, { itemTip: true }),
            E("number", K.crochetage, T("Crochetage", "Lockpicking"), { integer: true, default: 0, width: 56, labelIcon: "fa-solid fa-key",
              tt: tt(T("Même clé que la compétence : s'ajoute au crochetage du personnage tant que la classe est portée.", "Same key as the skill: adds to the character's lockpicking while the class is carried.")) }, { itemTip: true })]
        ])
      ])
    ]
  };
}

export function toolTemplate(L) {
  const { T, K } = L;
  const torch = `${K.duree} > 0`;
  return {
    sbe: "template", format: 1, for: "item", name: T("Outil", "Tool"),
    tabs: [], media: [],
    opts: { stackable: false, droppable: true, playerVisible: true },
    elements: [
      E("tags", "etiquettes", T("Étiquettes", "Tags"), { entries: [T("Outil", "Tool")], highlight: "first", place: "header" }),
      frame("cadre_outil", T("Utilisation", "Use"), [
        cols("outil_cols", [
          [E("number", K.crochetage, T("Crochetage", "Lockpicking"), { integer: true, default: 0, width: 56, labelIcon: "fa-solid fa-key",
            tt: tt(T("Un outil de serrure : ce bonus s'ajoute au jet de crochetage (même clé que le jet).", "A lock tool: this bonus adds to the lockpicking roll (same key as the roll).")) }, { itemTip: true, visibleIf: `!(${torch})` }),
            E("checkbox", K.allume, T("Allumée", "Lit"), { default: false,
              tt: tt(T("Lue par l'onglet Lumière de l'objet : allumée et portée, la torche éclaire.", "Read by the item's Light tab: lit and carried, the torch gives light.")) }, { propagate: false, visibleIf: torch, itemTip: true })],
          [E("button", "allumer", T("Allumer / Éteindre", "Light / Put out"), { action: "steps", steps: [
            { type: "condition", formula: `${K.allume} || ${K.autonomie} > 0`, message: T("La torche est consumée.", "The torch has burned out.") },
            { type: "set", key: K.allume, formula: `${K.allume} ? 0 : 1`, mode: "set", target: "self" }
          ], tt: tt(T("Bascule la case « Allumée ».", "Toggles the \"Lit\" box.")) }, { visibleIf: torch }),
            E("number", K.duree, T("Durée (minutes)", "Duration (minutes)"), { integer: true, default: 0, min: 0, width: 56 }, { sheetHidden: true }),
            E("gauge", K.autonomie, T("Reste à brûler", "Burn time left"), { min: 0, max: 60, maxFormula: K.duree, default: 60, text: "valueMax",
              tt: tt(T("Baisse avec le temps de jeu tant qu'elle éclaire (autonomie de l'onglet Lumière).", "Goes down with game time while it gives light (autonomy in the Light tab).")) },
            { propagate: false, visibleIf: torch, style: { gFill: "#e0902c", labelPos: "above-left" } })]
        ])
      ]),
      tradeFrame(L, { state: false })
    ]
  };
}

export function miscTemplate(L) {
  const { T } = L;
  return {
    sbe: "template", format: 1, for: "item", name: T("Objet divers", "Miscellaneous item"),
    tabs: [], media: [],
    opts: { stackable: true, stackMax: 0, droppable: true, playerVisible: true },
    elements: [
      E("tags", "etiquettes", T("Étiquettes", "Tags"), { entries: [T("Objet", "Item")], highlight: "first", place: "header" }),
      frame("cadre_objet", T("Objet", "Item"), [E("quantity", "quantity", T("Quantité", "Quantity"), { default: 1 })]),
      tradeFrame(L, { state: false })
    ]
  };
}

/* ------------------------------------------------------------ */
/*  Objets de scène : levier, piège                               */
/* ------------------------------------------------------------ */

const DEMO_IMG = "systems/system-builder-engine/assets/demo/tokens";

export function mechanismTemplate(L) {
  const { T, K } = L;
  return {
    sbe: "template", format: 1, for: "item", name: T("Mécanisme", "Mechanism"),
    tabs: [], media: [],
    opts: { stackable: false, droppable: true, playerVisible: true, prop: true },
    propCfg: { sizeMode: "cells", w: 1, h: 1, rotate: true, range: 1, use: "all", take: "none", visibility: "all",
      stateKey: K.abaisse, states: [{ value: "true", img: `${DEMO_IMG}/levier-bas.webp` }], showName: true, panelMode: "bubble", panelHead: true },
    elements: [
      E("tags", "etiquettes", T("Étiquettes", "Tags"), { entries: [T("Mécanisme", "Mechanism")], highlight: "first", place: "header" }),
      frame("cadre_actions", T("Actions", "Actions"), [
        E("button", "actionner", T("Actionner", "Pull"), { action: "steps", where: "placed", announce: true, steps: [
          { type: "set", key: K.abaisse, formula: `${K.abaisse} ? false : true`, mode: "set", target: "self" },
          { type: "scene", action: "door", op: "open", group: "", onlyIf: K.abaisse },
          { type: "scene", action: "door", op: "lock", group: "", onlyIf: `!${K.abaisse}` }
        ], tt: tt(T("Modifier un champ (le levier bascule, son image suit la clé), puis deux étapes « Scène » avec « Seulement si » : abaissé, la porte liée s'ouvre même verrouillée ; relevé, elle se referme à clé.", "Modify a field (the lever flips, its picture follows the key), then two \"Scene\" steps with \"Only if\": pulled, the linked door opens even when locked; pushed back, it locks again.")) })
      ]),
      frame("cadre_etat", T("État", "State"), [
        E("checkbox", K.abaisse, T("Abaissé", "Pulled"), { default: false,
          tt: tt(T("L'image de l'objet posé suit cette clé (réglage « Image selon une clé »).", "The placed object's picture follows this key (\"Picture by key\" setting).")) }, { propagate: false })
      ])
    ]
  };
}

export function trapTemplate(L) {
  const { T, K } = L;
  return {
    sbe: "template", format: 1, for: "item", name: T("Piège", "Trap"),
    tabs: [], media: [],
    opts: { stackable: false, droppable: true, playerVisible: true, prop: true },
    propCfg: { sizeMode: "cells", w: 1, h: 1, rotate: false, range: 1, use: "all", take: "none", visibility: "all", showName: false,
      trOn: true, trZone: "radius", trR: 0.5, trPlace: false, trWhen: "both", trWho: "all", trHidden: true,
      trDetKey: K.perception, trDetDc: "2", trDetRange: 2, trLast: true, trAvoid: true,
      trDodgeKey: K.agilite, trDodgeDc: "", trDodgeSeen: true, trDodgeAct: "back", trBack: "cell",
      trBtn: "declencher", trCenter: "trap", trAfter: "manual", trReveal: 3,
      trDisarmKey: K.crochetage, trDisarmDc: "2" },
    elements: [
      E("tags", "etiquettes", T("Étiquettes", "Tags"), { entries: [T("Piège", "Trap")], highlight: "first", place: "header" }),
      frame("cadre_actions", T("Effet", "Effect"), [
        E("button", "declencher", T("Déclencher", "Trigger"), { action: "steps", where: "placed", announce: true, steps: [
          { type: "target" },
          { type: "set", key: K.pv, formula: K.degats, mode: "sub", target: "targets" },
          { type: "effect", key: K.saignement, action: "apply", target: "targets" }
        ], tt: tt(T("Le bouton de l'effet du piège : la cible est celui qui le déclenche. Il perd des PV et saigne.", "The trap's effect button: the target is whoever triggers it. They lose HP and bleed.")) })
      ]),
      frame("cadre_piege", T("Piège", "Trap"), [
        E("text", K.degats, T("Dégâts", "Damage"), { default: "2d6", width: 90 }, { itemTip: true })
      ])
    ]
  };
}

/* ------------------------------------------------------------ */
/*  HUD et barres des modèles de personnage                       */
/* ------------------------------------------------------------ */

const nid = () => foundry.utils.randomID();

export function adventurerHud(L) {
  const { T, K } = L;
  const val = (k) => ({ id: nid(), type: "value", key: K[k] });
  return {
    enabled: true,
    nodes: [
      { id: nid(), type: "menu", label: T("Attaquer", "Attack"), icon: "fa-solid fa-hand-fist", children: [
        { id: nid(), type: "slot", key: K.main_droite },
        { id: nid(), type: "list", key: K.sac, tags: T("arme", "weapon") }
      ] },
      { id: nid(), type: "menu", label: T("Sorts", "Spells"), icon: "fa-solid fa-wand-magic-sparkles", children: [
        { id: nid(), type: "list", key: K.grimoire, groupBy: K.ecole }
      ] },
      { id: nid(), type: "menu", label: T("Objets", "Items"), icon: "fa-solid fa-flask", children: [
        { id: nid(), type: "list", key: K.sac, tags: T("consommable", "consumable") },
        { id: nid(), type: "list", key: K.sac, tags: T("outil", "tool") }
      ] },
      { id: nid(), type: "menu", label: T("Jets", "Rolls"), icon: "fa-solid fa-dice-d20", children: [
        val("force"), val("agilite"), val("constitution"), val("intelligence"), val("sagesse"), val("charisme"),
        { id: nid(), type: "separator" },
        val("perception"), val("discretion"), val("crochetage"), val("pistage"), val("arcanes")
      ] },
      { id: nid(), type: "separator" },
      val("pv"), val("mana")
    ]
  };
}

export function creatureHud(L) {
  const { T, K } = L;
  return {
    enabled: true,
    nodes: [
      { id: nid(), type: "button", key: "frapper" },
      { id: nid(), type: "value", key: K.perception },
      { id: nid(), type: "separator" },
      { id: nid(), type: "value", key: K.pv }
    ]
  };
}

/** Barres de jetons d'un modèle : PV (et mana pour les aventuriers). */
export function templateBars(L, { mana = false, foe = false } = {}) {
  const { T, K } = L;
  const bars = [{ id: "demo-pv", label: T("PV", "HP"), value: K.pv, side: "bottom", inside: false, row: 0, height: 8, shape: "rounded",
    colorMode: "mix", colorFull: "#3cb44b", colorEmpty: "#d23c3c", text: "none",
    vis: foe ? { gm: "always", owner: "always", others: "hover" } : { gm: "always", owner: "always", others: "always" },
    numbersFor: { gm: true, owner: true, others: !foe }, floatOn: true, flash: true,
    steps: [{ when: "pct", op: "<=", amount: 25, term: T("Grave", "Critical"), color: "#d23c3c", anim: "heartbeat" }] }];
  if (mana) bars.push({ id: "demo-mana", label: T("Mana", "Mana"), value: K.mana, side: "bottom", inside: false, row: 1, height: 6, shape: "rounded",
    colorMode: "solid", colorFull: "#3f7fe0", text: "none", vis: { gm: "always", owner: "always", others: "hover" } });
  return { mode: "own", bars };
}

/* ------------------------------------------------------------ */
/*  Clés de structure dans la langue de la démo                   */
/* ------------------------------------------------------------ */

/** Cadres, colonnes, onglets, boutons et médias : leur clé (vue dans
 *  l'atelier) suit la langue de la démo, comme les clés de valeur. */
const STRUCT_EN = {
  entete: "header", entete_cols: "header_cols", identite: "identity", ressources: "resources", onglets: "tabs",
  onglet_carac: "tab_abilities", carac_cols: "abilities_cols", cadre_attributs: "frame_attributes", cadre_profil: "frame_profile",
  profil: "profile", cadre_competences: "frame_skills", comp_cols: "skills_cols", sens_cols: "senses_cols",
  cadre_langues: "frame_languages", cadre_sens: "frame_senses", onglet_combat: "tab_combat", combat_cols: "combat_cols",
  cadre_scores: "frame_scores", cadre_resist: "frame_resist", cadre_equipement: "frame_equipment", slots_cols: "slots_cols",
  cadre_effets: "frame_effects", effets_actifs: "active_effects", onglet_inventaire: "tab_inventory", bourse_cols: "purse_cols",
  cadre_bourse: "frame_purse", bourse_in: "purse_in", cadre_charge: "frame_load", cadre_sac: "frame_backpack",
  onglet_sorts: "tab_spells", cadre_grimoire: "frame_spellbook", onglet_talents: "tab_talents", onglet_bio: "tab_bio",
  bio_cols: "bio_cols", cadre_identite: "frame_identity", identite_cols: "identity_cols", cadre_notes: "frame_notes",
  cadre_histoire: "frame_story", crea_scores: "creature_scores", crea_cols: "creature_cols", cadre_attaques: "frame_attacks",
  frapper: "strike", cadre_traits: "frame_traits", cadre_butin: "frame_loot", etiquettes: "tags", cadre_actions: "frame_actions",
  actions_cols: "actions_cols", attaquer: "melee_attack", tirer: "shoot", recharger: "reload", cadre_combat: "frame_combat",
  cadre_commerce: "frame_trade", commerce_cols: "trade_cols", cadre_protection: "frame_protection", protection_cols: "protection_cols",
  boire: "drink", faire_boire: "give_drink", cadre_effet: "frame_effect", effet_cols: "effect_cols",
  lancer_degats: "cast_damage", lancer_soin: "cast_heal", lancer_benir: "cast_bless", lancer_bouclier: "cast_shield",
  lancer_lumiere: "cast_light", cadre_sort: "frame_spell", sort_cols: "spell_cols", cadre_munition: "frame_ammo",
  munition_cols: "ammo_cols", cadre_bonus: "frame_bonus", bonus_cols: "bonus_cols", cadre_outil: "frame_tool",
  outil_cols: "tool_cols", allumer: "light_toggle", cadre_objet: "frame_item", actionner: "pull", cadre_etat: "frame_state",
  declencher: "trigger", cadre_piege: "frame_trap",
  /* Médias déclarés et leurs appels. */
  frappe: "swing", impact: "impact", incantation: "casting"
};
const STRUCT_PROPS = new Set(["key", "trBtn", "mediaShot", "mediaHit"]);

/** Le modèle avec ses clés de structure traduites (rien en français). */
export function localizeKeys(json, L) {
  if (L.fr) return json;
  const map = (v) => (typeof v === "string" && STRUCT_EN[v]) ? STRUCT_EN[v] : v;
  const walk = (o, inMedia = false) => {
    if (Array.isArray(o)) return o.map(x => walk(x, inMedia));
    if (!o || typeof o !== "object") return o;
    const out = {};
    for (const [k, v] of Object.entries(o)) {
      if (STRUCT_PROPS.has(k) || (inMedia && k === "name")) out[k] = map(v);
      else out[k] = walk(v, k === "media");
    }
    return out;
  };
  return walk(json);
}
