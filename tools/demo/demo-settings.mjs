/**
 * SBE — Démo « Brumeval » : RÉGLAGES DU MONDE
 *
 * Ce que la démo pose dans les réglages des managers (effets, combat,
 * gabarits, corps, monnaies, marchands, échanges, langues, calendrier,
 * nouvelle journée, traces, bannière de pause). Chaque réglage est passé
 * par la fonction de nettoyage de son manager.
 *
 * @param L    langue de la démo (demoLang)
 * @param ids  { tpl: { adventurer, creature, beast, weapon… } } : ids des modèles
 */

const SYS = "system-builder-engine";
const mod = (p) => import(`/systems/${SYS}/module/${p}`);

export async function demoSettings(L, ids) {
  const { T, K, V } = L;
  const tpl = ids.tpl;

  /* ---------------- Effets ---------------- */
  const { cleanDef } = await mod("managers/effects/effect-manager.mjs");
  const effects = [
    { key: K.empoisonne, label: T("Empoisonné", "Poisoned"), icon: "icons/svg/poison.svg", category: T("Poison", "Poison"),
      description: T("Perd 1d4 PV à chaque round. Un jet de constitution à chaque round peut le chasser ; la résistance au poison réduit les pertes.",
        "Loses 1d4 HP each round. A constitution roll each round can shake it off; poison resistance reduces the loss."),
      duration: { rounds: 4, seconds: 120 },
      periodic: { enabled: true, timing: "round", key: K.pv, amount: "-1d4", reduceKey: K.res_poison, chat: true },
      resist: { enabled: true, key: K.constitution, difficulty: "2", onApply: true, onRound: true, result: "cancel" } },
    { key: K.beni, label: T("Béni", "Blessed"), icon: "icons/svg/angel.svg",
      description: T("+2 en attaque et +1 en défense, pendant 10 rounds (10 minutes hors combat).", "+2 attack and +1 defense, for 10 rounds (10 minutes out of combat)."),
      duration: { rounds: 10, seconds: 600 },
      changes: [{ key: K.attaque, mode: "add", value: "2" }, { key: K.defense, mode: "add", value: "1" }] },
    { key: K.en_feu, label: T("En feu", "Burning"), icon: "icons/svg/fire.svg",
      description: T("Perd 1d6 PV à chaque round, moins sa résistance au feu.", "Loses 1d6 HP each round, minus fire resistance."),
      duration: { rounds: 3, seconds: 30 },
      periodic: { enabled: true, timing: "round", key: K.pv, amount: "-1d6", reduceKey: K.res_feu, chat: true } },
    { key: K.rage, label: T("Rage", "Rage"), icon: "icons/svg/terror.svg",
      description: T("Phase 1 : +4 en force, −2 en défense (3 rounds). Phase 2, le contrecoup : −2 en agilité (2 rounds).",
        "Phase 1: +4 strength, −2 defense (3 rounds). Phase 2, the backlash: −2 agility (2 rounds)."),
      duration: { rounds: 3, seconds: 60 },
      changes: [{ key: K.force, mode: "add", value: "4" }, { key: K.defense, mode: "add", value: "-2" }],
      phases: [{ label: T("Épuisé", "Exhausted"), icon: "icons/svg/downgrade.svg", rounds: 2, seconds: 120, changes: [{ key: K.agilite, mode: "add", value: "-2" }] }] },
    { key: K.etourdi, label: T("Étourdi", "Stunned"), icon: "icons/svg/daze.svg",
      description: T("Ne peut plus se défendre pendant 1 round.", "Cannot defend for 1 round."),
      duration: { rounds: 1, seconds: 6 }, noDefense: true },
    { key: K.saignement, label: T("Saignement", "Bleeding"), icon: "icons/svg/blood.svg",
      description: T("Cumulable jusqu'à 5 : perd 1 PV par cumul à chaque round.", "Stacks up to 5: loses 1 HP per stack each round."),
      duration: { rounds: 5, seconds: 60 }, stack: { enabled: true, max: 5, scale: true },
      periodic: { enabled: true, timing: "round", key: K.pv, amount: "-1", chat: true } },
    { key: K.invisible, label: T("Dissimulé", "Concealed"), icon: "icons/svg/invisible.svg",
      description: T("Agit comme le statut « Invisible » de Foundry, et +5 en discrétion.", "Acts as Foundry's \"Invisible\" status, and +5 stealth."),
      duration: { rounds: 10, seconds: 600 }, foundryStatus: "invisible",
      changes: [{ key: K.discretion, mode: "add", value: "5" }] }
  ].map(d => cleanDef(d));

  /* ---------------- Combat ---------------- */
  const { CombatManager } = await mod("managers/combat/combat-manager.mjs");
  const combat = CombatManager.normalize({
    damageKey: K.pv, critMult: 2,
    types: [
      ...V.dmgTypes.slice(0, 3).map(name => ({ name, reduceKey: "" })),
      { name: V.dmgTypes[3], reduceKey: K.res_feu },
      { name: V.dmgTypes[4], reduceKey: K.res_poison },
      { name: V.schools[1], reduceKey: "" },
      { name: V.dmgTypes[5], reduceKey: "" }
    ],
    cover: 50, measure: "cells", walls: "move",
    init: { key: K.initiative, auto: true, ask: true, tieOrder: "players" },
    profiles: [
      { name: T("Mêlée", "Melee"), defense: K.defense, dmgType: K.type_degats, loc: "roll", locAim: "no" },
      { name: T("Distance", "Ranged"), defense: K.defense, dmgType: K.type_degats, loc: "roll", locAim: "no" },
      { name: T("Sort de zone", "Area spell"), defense: K.defense, dmgType: K.ecole, save: K.agilite, saveMode: T("moitié", "half"), saveVs: "field", loc: "none", traverse: "all" }
    ]
  });

  /* ---------------- Gabarits ---------------- */
  const { ZoneShapes } = await mod("managers/zones/zone-shapes.mjs");
  const { circleShape, coneShape, lineShape } = await mod("managers/zones/zone-geom.mjs");
  const blast = circleShape(2);
  blast.pieces = [{ kind: "ellipse", x: 0, y: 0, rx: 2, ry: 2, intensity: 50 }, { kind: "ellipse", x: 0, y: 0, rx: 1, ry: 1, intensity: 100 }];
  const zoneShapes = [
    ZoneShapes.clean({ name: V.shapes[0], ...blast, color: "#e0662a" }),
    ZoneShapes.clean({ name: V.shapes[1], ...lineShape(8, 1), color: "#4f8fe8" }),
    ZoneShapes.clean({ name: V.shapes[2], ...coneShape(4, 60), color: "#d9a21c" })
  ];

  /* ---------------- Corps (localisation des coups) ---------------- */
  const { HitLocations } = await mod("managers/combat/hit-locations.mjs");
  /* Noms des zones dans la langue de la démo (pas celle du poste qui construit). */
  const ZN = { head: ["Tête", "Head"], torso: ["Torse", "Torso"], rarm: ["Bras droit", "Right arm"], larm: ["Bras gauche", "Left arm"],
    rleg: ["Jambe droite", "Right leg"], lleg: ["Jambe gauche", "Left leg"], body: ["Corps", "Body"],
    front: ["Pattes avant", "Front legs"], back: ["Pattes arrière", "Hind legs"], tail: ["Queue", "Tail"] };
  const zn = (k) => (ZN[k] ? T(ZN[k][0], ZN[k][1]) : "");
  const human = HitLocations.create("humanoid", T("Humanoïde", "Humanoid"), zn);
  human.models = [tpl.adventurer, tpl.creature];
  const beast = HitLocations.create("quadruped", T("Quadrupède", "Quadruped"), zn);
  beast.models = [tpl.beast];
  const bodies = [HitLocations.clean(human), HitLocations.clean(beast)];

  /* ---------------- Monnaies, marchands, échanges ---------------- */
  const { cleanCurrency } = await mod("managers/money/money.mjs");
  const currencies = [
    { id: "demoOr", name: T("Or", "Gold"), key: K.or, rate: 100, icon: "icons/commodities/currency/coins-plain-stack-gold-yellow.webp" },
    { id: "demoArgent", name: T("Argent", "Silver"), key: K.argent, rate: 10, icon: "icons/commodities/currency/coins-plain-stack-silver.webp" },
    { id: "demoCuivre", name: T("Cuivre", "Copper"), key: K.cuivre, rate: 1, icon: "icons/commodities/currency/coins-assorted-mix-copper.webp" }
  ].map(c => cleanCurrency(c));
  const goods = [tpl.weapon, tpl.armor, tpl.shield, tpl.consumable, tpl.ammo, tpl.tool, tpl.misc];
  const { cleanMerchantSettings } = await mod("managers/merchant/merchant-model.mjs");
  const merchants = cleanMerchantSettings({ priceKey: K.prix, sell: { templates: goods, exclude: [] }, buy: { templates: goods, exclude: [] }, shop: "" });
  const tradeConfig = { templates: goods, exclude: [], distance: 3,
    sounds: { request: { sound: "", volume: 80 }, done: { sound: "", volume: 80 }, cancel: { sound: "", volume: 80 } } };

  /* ---------------- Langues ---------------- */
  const { cleanLanguage } = await mod("managers/languages/language-model.mjs");
  const languages = { list: [
    cleanLanguage({ id: "demo-elfique", name: T("Elfique", "Elvish"), color: "#3f9c6a", mode: "symbols", alphabet: "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ",
      key: K.elfique, showName: true, chat: true, decipher: { on: true, key: K.arcanes, difficulty: "5", once: true } }),
    cleanLanguage({ id: "demo-nain", name: T("Nain", "Dwarvish"), color: "#a36a2c", mode: "letters", key: K.nain, showName: true, chat: true })
  ] };

  /* ---------------- Calendrier ---------------- */
  const CM = await mod("managers/calendar/calendar-model.mjs");
  const base = CM.baseCalendar(T("Calendrier de Brumeval", "Brumeval calendar"));
  const monthNames = T(
    ["Givrelune", "Brumaire", "Germelune", "Fleurmai", "Herbefeu", "Solstice", "Moissonne", "Ambrebois", "Vendange", "Feuillemort", "Brumenuit", "Longnuit"],
    ["Frostmoon", "Mistmonth", "Seedmoon", "Bloomtide", "Grassfire", "Highsun", "Reaping", "Amberwood", "Vintage", "Leaffall", "Mistnight", "Longnight"]);
  const dayNames = T(["Lunedi", "Ferdi", "Eaudi", "Boisdi", "Ordi", "Ventdi", "Soldi"], ["Moonday", "Ironday", "Waterday", "Woodday", "Goldday", "Windday", "Sunday"]);
  const calendar = CM.cleanCalendar({
    ...base, baseName: false, name: T("Calendrier de Brumeval", "Brumeval calendar"), yearZero: 1200,
    months: monthNames.map((name) => ({ name, abbr: name.slice(0, 3), days: 30, leapDays: null })),
    days: dayNames.map(name => ({ name, abbr: name.slice(0, 3) })),
    leap: null,
    moons: [
      { id: "demo-selene", name: T("Séléné", "Selene"), key: "selene", cycle: 28, offset: 3, color: "#d8dde6" },
      { id: "demo-rouge", name: T("La Rouge", "The Red"), key: T("la_rouge", "the_red"), cycle: 41, offset: 11, color: "#c0392b" }
    ],
    events: [
      { name: T("Foire de Brumeval", "Brumeval fair"), icon: "🎪", color: "#d4a017", month: 4, day: 12, repeat: "yearly", players: true,
        note: T("Les marchands vendent 10 % moins cher.", "Merchants sell 10% cheaper.") }
    ]
  });
  const calendars = CM.cleanConfig({
    active: calendar.id, list: [calendar], weather: CM.baseWeatherTypes(),
    options: { players: true, autoWeather: true, weatherEvery: 6, sceneWeather: true, sceneDarkness: true }
  });

  /* ---------------- Nouvelle journée ---------------- */
  const newDay = { mode: "tiers", nightHours: 8, rate: [],
    common: [{ key: K.mana, amount: `maxOf("${K.mana}")` }],
    tiers: [
      { id: "demo-bonne", name: T("Bonne nuit", "Good night"), lines: [{ key: K.pv, amount: `ceil(maxOf("${K.pv}") / 2)` }] },
      { id: "demo-courte", name: T("Nuit agitée", "Restless night"), lines: [{ key: K.pv, amount: `ceil(maxOf("${K.pv}") / 4)` }] }
    ] };

  /* ---------------- Traces au sol ---------------- */
  const { TraceManager } = await mod("managers/traces/trace-manager.mjs");
  const blood = TraceManager.bloodType();
  blood.impact.key = K.pv;
  blood.trail.key = K.pv;
  /* La traînée suit aussi l'effet « Saignement », même en pleine santé. */
  blood.trail.effects = [K.saignement];
  blood.trail.effMode = "or";
  const wolf = TraceManager.defaultType({ id: "demo-loup", name: T("Traces de loup", "Wolf tracks"),
    impact: { on: false, count: 1, size: 1, byLoss: false, shapes: ["splat"], key: "", op: "any", value: 0, unit: "value" },
    trail: { on: true, spacing: 1, size: 0.5, grow: false, shapes: ["drops"], key: "", op: "any", value: 0, unit: "value" },
    footprint: "canine", color: { key: "", value: "#4a3a28", alpha: 0.8 }, hidden: true, templates: [tpl.beast] });
  const traceTypes = { types: [blood, wolf] };
  const traceOptions = { maxPerScene: 400, hoverAge: true, track: { key: K.pistage, radius: 6, minutes: 10 } };

  /* ---------------- Bannière de pause ---------------- */
  const pauseBanner = {
    schemaVersion: 1, configured: true,
    media: { enabled: true, path: `systems/${SYS}/assets/sbe-logo.svg`, size: 180 },
    text: { enabled: true, content: T("Le temps s'arrête sur Brumeval…", "Time stands still over Brumeval…"), font: "", size: 2.2, color: "#f1e2c3", position: "below", posX: 50, posY: 60 },
    band: { enabled: true, color: "#1b120c", opacity: 70, width: 100, height: 260 },
    layout: { verticalPos: 50, horizontalPos: 50, darken: 20 },
    anim: { appear: "fade", appearDuration: 0.8, idle: "float", disappear: "fade" },
    sound: { enabled: false, path: "", resumePath: "", volume: 80 }
  };

  /* ---------------- Coffres (pose en série) ---------------- */
  const chestDefaults = { moneyKey: K.or, weightKey: K.poids, lockRollTarget: K.crochetage, digiRollTarget: K.arcanes,
    sounds: { open: { sound: "", volume: 80 }, close: { sound: "", volume: 80 } } };

  return { effects, combat, zoneShapes, bodies, currencies, merchants, tradeConfig, languages, calendars, newDay, traceTypes, traceOptions, pauseBanner, chestDefaults };
}
