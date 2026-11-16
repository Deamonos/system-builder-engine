/**
 * SBE — CALENDRIER, HORLOGE ET MÉTÉO : les DONNÉES
 *
 * Le temps de jeu reste celui de Foundry (game.time.worldTime, en
 * secondes). SBE y pose un CALENDRIER : celui de Foundry (CalendarData,
 * qui découpe les secondes en années, mois, jours, heures) nourri par
 * la description du MJ, plus ce que Foundry n'a pas : saisons avec
 * lever et coucher du soleil, lunes, météo, événements, affichage.
 *
 *   calendars (réglage monde) = {
 *     active: id,                 le calendrier en service (un seul)
 *     list: [calendrier…],        ceux du MJ (un grégorien est fourni)
 *     weather: [type…],           les types de météo (communs)
 *     display: { date, hour, temp, weekStart },   formats par défaut
 *     options: { players, autoWeather, weatherEvery, sceneWeather,
 *                sceneDarkness }
 *   }
 *   calendrier = { id, name, yearZero, hoursPerDay, minutesPerHour,
 *     secondsPerMinute, firstWeekday, leap: { start, every } | null,
 *     months: [{ name, abbr, days, leapDays }], days: [{ name, abbr }],
 *     seasons: [{ id, name, key, icon, month, day, temp: [min, max],
 *                 sunrise, sunset, weather: [{ type, weight }] }],
 *     moons: [{ id, name, key, color, cycle, offset, phases: [{ id, name, key, icon, color, length, effect, replaces, every, chance }] }],
 *     events: [{ id, name, icon, color, repeat, year, month, day,
 *                hour, minute, note, players, link }] }
 *   type de météo = { id, name, key, category, icon, layers: [couche…], sky: { day:
 *     [c1, c2], night: [c1, c2] } | null, colors: {…}, tempMod,
 *     effect, scene: [{ kind, color, color2, amount }],
 *     sounds: [{ src, mode, volume, min, max }] }
 *
 * La MÉTÉO d'un moment est TIRÉE AU SORT de façon reproductible (graine
 * = calendrier + jour + créneau) parmi les types de la saison, pondérés :
 * rien à enregistrer, le futur est connu (prévisions) et le passé ne
 * change pas. Le MJ peut l'imposer (calendarState.override).
 *
 *   calendarState (réglage monde) = { override: { type, temp, until } | null,
 *                                     season: { key, until } | null,
 *                                     moons: { <clé de lune>: { phase, until } } }
 *   (season : une saison IMPOSÉE, par un sort ou un objet : « hiver éternel » ;
 *    moons : une phase IMPOSÉE à une lune, « lune de sang »)
 *
 * CLÉS : chaque type de météo, chaque saison, chaque lune et chaque phase a une clé fixe (par défaut
 * tirée du nom) ; formules (weather(), season()) et étapes d'action les
 * utilisent : renommer ne casse rien.
 *
 * Tous les noms traduits (mois, jours, saisons du calendrier fourni,
 * types de météo) sont traduits À LA CRÉATION : les données du MJ sont
 * ensuite les siennes.
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";

export const CAL_SETTING = "calendars";
export const STATE_SETTING = "calendarState";
export const DISPLAY_SETTING = "calendarDisplay";   /* client : préférences d'un joueur */

const str = (v) => String(v ?? "").trim();
const num = (v, d, { min = -Infinity, max = Infinity, int = false } = {}) => {
  const n = Number(v);
  if (!Number.isFinite(n) || str(v) === "") return d;
  const k = Math.min(max, Math.max(min, n));
  return int ? Math.round(k) : k;
};
const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(str(v)) ? str(v).toLowerCase() : d);
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));

export const DATE_FORMATS = ["dmy", "mdy", "ymd"];
export const HOUR_FORMATS = ["24", "12"];
export const TEMP_UNITS = ["c", "f"];
export const EVENT_REPEATS = ["once", "yearly", "monthly"];
export const MOON_PHASES = ["new", "waxingCrescent", "firstQuarter", "waxingGibbous", "full", "waningGibbous", "lastQuarter", "waningCrescent"];
export const MOON_ICONS = ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"];
/* Clés anglaises des phases fournies (même ordre que MOON_PHASES). */
export const PHASE_KEYS = ["new_moon", "waxing_crescent", "first_quarter", "waxing_gibbous", "full_moon", "waning_gibbous", "last_quarter", "waning_crescent"];
/** Version de la forme du réglage (2 : éléments fournis à clé anglaise ;
    3 : noms fournis de mois, jours, calendrier et catégories marqués). */
export const CAL_SCHEMA = 3;
export const BASE_MOON_ID = "base-moon";

/* ============================================================ */
/*  ÉLÉMENTS FOURNIS                                             */
/* ------------------------------------------------------------ */
/*  Météos, saisons, lune et phases livrées avec SBE, reconnues  */
/*  à leur id : leur NOM (traduit à la volée), leur ICÔNE et leur */
/*  CLÉ (en anglais, la même dans toutes les langues) sont ceux  */
/*  de SBE ; le reste se règle. Pour une version à soi : en créer */
/*  une, ou dupliquer une météo.                                 */
/* ============================================================ */
const snake = (k) => k.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
let PROVIDED = null;
function provided() {
  if (PROVIDED) return PROVIDED;
  PROVIDED = new Map();
  for (const [k, icon] of Object.values(BASE_WEATHER).flat()) PROVIDED.set(`base-${k.toLowerCase()}`, { name: `SBE.Cal.Wx.${k}`, icon, key: snake(k) });
  for (const [k, icon] of BASE_SEASONS) PROVIDED.set(`base-${k.toLowerCase()}`, { name: `SBE.Cal.Season.${k}`, icon, key: k.toLowerCase() });
  MOON_PHASES.forEach((k, i) => PROVIDED.set(k, { name: `SBE.Cal.Moon.${k}`, icon: MOON_ICONS[i], key: PHASE_KEYS[i] }));
  PROVIDED.set(BASE_MOON_ID, { name: "SBE.Cal.MoonName", icon: "", key: "moon" });
  return PROVIDED;
}

/* ------------------------------------------------------------ */
/*  NOMS FOURNIS mais modifiables : mois, jours, nom du calendrier */
/*  fourni, catégories des météos fournies. Tant que le MJ ne les  */
/*  change pas, ils portent une marque (base, baseName, catBase) et */
/*  s'affichent dans la langue de chacun ; un nom changé à la main  */
/*  perd sa marque et reste tel quel.                              */
/* ------------------------------------------------------------ */
const monthKey = (n, abbr = false) => `SBE.Cal.Month${abbr ? "Abbr" : ""}.${n}`;
const dayKey = (n, abbr = false) => `SBE.Cal.Day${abbr ? "Abbr" : ""}.${n}`;
const BASE_NAME_KEY = "SBE.Cal.BaseName";
const catKey = (id) => (BASE_CAT[id] ? `SBE.Cal.Cat.${BASE_CAT[id]}` : "");

/** Ce texte est-il le texte fourni dans l'une des langues données ? */
function isDefaultText(value, key, dicts) {
  const v = str(value);
  if (!v || !key) return false;
  return dicts.some(t => t && foundry.utils.getProperty(t, key) === v);
}

/**
 * MIGRATION (forme 2 → 3) : les noms fournis encore inchangés reçoivent
 * leur marque (reconnus dans n'importe quelle langue du système).
 * @param {object} raw     le réglage tel qu'enregistré (modifié sur place)
 * @param {object[]} dicts les traductions de chaque langue du système
 */
export function markProvidedNames(raw, dicts) {
  for (const c of raw?.list ?? []) {
    if (!c) continue;
    if (!c.baseName && isDefaultText(c.name, BASE_NAME_KEY, dicts)) c.baseName = true;
    (c.months ?? []).forEach((m, i) => { if (m && !m.base && i < 12 && isDefaultText(m.name, monthKey(i + 1), dicts)) m.base = i + 1; });
    (c.days ?? []).forEach((d, i) => { if (d && !d.base && i < 7 && isDefaultText(d.name, dayKey(i + 1), dicts)) d.base = i + 1; });
  }
  for (const w of raw?.weather ?? []) {
    if (w && !w.catBase && isDefaultText(w.category, catKey(str(w.id)), dicts)) w.catBase = true;
  }
  return raw;
}

/**
 * Un champ vient d'être saisi dans l'éditeur : un nom fourni changé à la
 * main perd sa marque (il ne sera plus traduit).
 * @param {object} t   ce qui est modifié (calendrier, mois, jour, météo)
 * @param {string} f   le champ
 * @param {*} v        la valeur saisie
 */
export function unmarkEdited(t, f, v) {
  if (!t) return;
  if (t.base && (f === "name" || f === "abbr")) {
    const key = "leapDays" in t ? monthKey(t.base, f === "abbr") : dayKey(t.base, f === "abbr");
    if (str(v) !== L(key)) t.base = null;
  }
  if (f === "name" && t.baseName && str(v) !== L(BASE_NAME_KEY)) t.baseName = false;
  if (f === "category" && t.catBase && str(v) !== L(catKey(str(t.id)))) t.catBase = false;
}

/** Est-ce un élément fourni (nom, icône et clé non modifiables) ? */
export function isProvided(id) { return provided().has(String(id ?? "")); }

/** Impose à un élément fourni son nom, son icône et sa clé. */
function asProvided(o) {
  const p = provided().get(o.id);
  if (!p) return o;
  o.name = L(p.name);
  o.key = p.key;
  if (p.icon && "icon" in o) o.icon = p.icon;
  return o;
}

/**
 * LUNES : chaque lune a ses PHASES, réglées par le MJ (par défaut les 8
 * classiques, à parts égales). Une phase = { id, name, key, icon, color,
 * length (sa part du cycle), effect (effet SBE posé tant qu'elle dure) }.
 * Une phase RARE (`replaces` = id d'une phase normale) prend la place de
 * celle-ci certains cycles : tous les `every` cycles et/ou avec `chance` %
 * (tirage reproductible, comme la météo).
 */
export function defaultMoonPhases() {
  return MOON_PHASES.map((k, i) => {
    const name = game.i18n?.localize?.(`SBE.Cal.Moon.${k}`) ?? k;
    return { id: k, name, key: PHASE_KEYS[i], icon: MOON_ICONS[i], color: "", length: 1, effect: "", replaces: "", every: 0, chance: 0 };
  });
}

function cleanPhase(p) {
  const name = str(p?.name);
  return asProvided({
    id: str(p?.id) || foundry.utils.randomID(8), name, key: calSlug(p?.key) || calSlug(name),
    icon: str(p?.icon), color: str(p?.color), length: num(p?.length, 1, { min: 0 }), effect: str(p?.effect),
    replaces: str(p?.replaces), every: num(p?.every, 0, { min: 0, int: true }), chance: num(p?.chance, 0, { min: 0, max: 100 })
  });
}

export function cleanMoon(m) {
  const id = str(m?.id) || foundry.utils.randomID(8);
  const name = id === BASE_MOON_ID ? L(provided().get(BASE_MOON_ID).name) : str(m?.name);
  const phases = (Array.isArray(m?.phases) ? m.phases : []).map(cleanPhase).filter(p => p.name);
  const normal = phases.filter(p => !p.replaces);
  /* Une phase rare remplace une phase normale de la même lune, jamais une autre rare. */
  for (const p of phases) if (p.replaces && !normal.some(n => n.id === p.replaces)) p.replaces = "";
  return {
    id, name, key: id === BASE_MOON_ID ? provided().get(BASE_MOON_ID).key : (calSlug(m?.key) || calSlug(name)), color: str(m?.color),
    cycle: num(m?.cycle, 29.5, { min: 1 }), offset: num(m?.offset, 0),
    phases: normal.length ? phases : defaultMoonPhases()
  };
}
/* Étapes d'action « Temps », « Météo », « Saison ». */
export const TIME_ACTIONS = ["advance", "back", "next", "prev", "set"];
export const TIME_UNITS = ["minute", "hour", "day"];
export const TIME_PARTS = ["dawn", "noon", "dusk", "midnight"];
export const IMPOSE_MODES = ["decided", "natural"];
export const DAY_PARTS = ["night", "dawn", "morning", "noon", "afternoon", "dusk"];

/** Couches d'un ciel (ce que le MJ coche sur un type de météo). */
export const WEATHER_LAYERS = ["clouds", "dark", "fog", "rain", "acid", "fall", "fast", "slow", "wind", "sand", "flash", "bolts",
  "red", "em", "haze", "dust", "float", "meteor", "aurora", "spark", "heat", "eclipse", "dim"];
/** Couleurs réglables d'un ciel (par couche). */
export const WEATHER_COLORS = { cloud: "#ffffff", rain: "#c8dcf5", fall: "#ffffff", wind: "#e8d8a0", fog: "#f0f3f6", dust: "#e6ff8a",
  float: "#8df0b5", meteor: "#ffffff", aurora1: "#7d4dff", aurora2: "#44ffd2", spark: "#f0dcff" };
/** Quelle couleur sert à quelle couche (l'éditeur ne montre que celles utiles). */
export const LAYER_COLORS = { clouds: ["cloud"], rain: ["rain"], fall: ["fall"], wind: ["wind"], sand: ["wind"], fog: ["fog"], dust: ["dust"],
  float: ["float"], meteor: ["meteor"], aurora: ["aurora1", "aurora2"], spark: ["spark"] };

/**
 * Effets sur la SCÈNE (vus de tous) : ceux de Foundry recolorés
 * (« fx:<id> » : pluie, averse, neige, blizzard, brouillard, feuilles…)
 * et ceux de SBE (scene-weather.mjs). Chaque couche : une couleur, une
 * quantité (0,25 à 3), une seconde couleur pour les aurores.
 */
export const SCENE_KINDS = ["tint", "pulse", "flash", "sparks", "aurora", "meteors", "floaters", "dust", "arcs", "heat"];
export const SCENE_TWO_COLORS = ["aurora"];
const SCENE_DEFAULT_COLOR = { tint: "#20283a", pulse: "#8a9a20", flash: "#dfe8ff", sparks: "#f0dcff", aurora: "#7d4dff", meteors: "#ffffff",
  floaters: "#8df0b5", dust: "#e6ff8a", arcs: "#9fd0ff", heat: "#ffd9a0" };

function cleanSceneLayer(l) {
  const kind = str(l?.kind);
  if (!SCENE_KINDS.includes(kind) && !/^fx:[\w-]+$/.test(kind)) return null;
  return {
    kind,
    color: hex(l?.color, SCENE_DEFAULT_COLOR[kind] ?? "#ffffff"),
    color2: hex(l?.color2, "#44ffd2"),
    amount: num(l?.amount, 1, { min: 0.1, max: 3 })
  };
}

/** Les couches de scène d'un type : les siennes ; à défaut, celles du type fourni. */
function sceneOf(w) {
  if (Array.isArray(w?.scene)) return w.scene.map(cleanSceneLayer).filter(Boolean);
  const base = BASE_SCENE_BY_ID[str(w?.id)];
  return (base ?? []).map(([kind, color, amount, color2]) => cleanSceneLayer({ kind, color, amount, color2 })).filter(Boolean);
}

/**
 * SONS d'un type de météo, joués chez tous sur la scène active (hors
 * intérieur). Chaque ligne : un son de la bibliothèque fournie
 * (« lib:<clé> ») ou un fichier audio de Foundry, un mode, un volume.
 *   loop    joue en continu (fondu à l'entrée et à la sortie)
 *   random  revient de temps en temps (entre min et max secondes)
 *   flash   part avec l'éclair de la scène (tirage parmi ces lignes)
 * Une entrée de la bibliothèque peut porter plusieurs fichiers : l'un
 * d'eux est tiré à chaque fois.
 */
export const SOUND_MODES = ["loop", "random", "flash"];
/* « Sur l'éclair » : la distance de chaque éclair est tirée (même tirage chez tous) ;
   au loin, le son arrive en retard (jusqu'à `delay` s) et plus faible (jusqu'à −`fade` %).
   `dist` : la ligne joue pour tous les éclairs, les proches seulement, ou les lointains. */
export const SOUND_DISTANCES = ["all", "near", "far"];
export const SOUND_DIR = `systems/${SYSTEM_ID}/assets/sounds/weather`;
const series = (name, n) => Array.from({ length: n }, (_, i) => `${name}-${i + 1}`);
export const SOUND_LIBRARY = {
  rain: ["pluie"], lightRain: ["pluie-legere"], stormRain: ["pluie-orage"], hail: ["grele"],
  strongWind: ["vent-fort"], blizzardWind: ["vent-blizzard"], snowWind: ["vent-neige"], hurricaneWind: ["vent-ouragan"], desertWind: ["vent-desert"],
  sandstorm: ["tempete-sable"], manaStorm: ["tempete-mana"], emission: ["emission"], cursedMist: ["brume-maudite"], toxicMist: ["brume-toxique"],
  radiation: ["radiations"], electricity: ["electricite"], gravity: ["anomalie-gravitationnelle"],
  fire: ["feu"], explosions: ["explosions-lointaines"],
  thunder: series("tonnerre", 4), thunderNear: series("tonnerre-proche", 4), thunderFar: series("tonnerre-lointain", 4),
  meteor: ["meteore"]
};

/** Les fichiers d'une ligne de son (ceux de la bibliothèque, ou le fichier choisi). */
export function soundFiles(src) {
  const s = str(src);
  if (s.startsWith("lib:")) return (SOUND_LIBRARY[s.slice(4)] ?? []).map(f => `${SOUND_DIR}/${f}.ogg`);
  return s ? [s] : [];
}

function cleanSoundRow(r) {
  const src = str(r?.src);
  if (!src || (src.startsWith("lib:") && !SOUND_LIBRARY[src.slice(4)])) return null;
  const min = num(r?.min, 10, { min: 1, max: 3600 });
  return {
    src,
    mode: SOUND_MODES.includes(str(r?.mode)) ? str(r.mode) : "loop",
    volume: num(r?.volume, 0.5, { min: 0, max: 1 }),
    min,
    max: Math.max(min, num(r?.max, 30, { min: 1, max: 3600 })),
    dist: SOUND_DISTANCES.includes(str(r?.dist)) ? str(r.dist) : "all",
    delay: num(r?.delay, 4, { min: 0, max: 30 }),
    fade: num(r?.fade, 60, { min: 0, max: 100 })
  };
}

/** Les sons d'un type : les siens ; à défaut, ceux du type fourni. */
function soundsOf(w) {
  if (Array.isArray(w?.sounds)) return w.sounds.map(cleanSoundRow).filter(Boolean);
  const base = BASE_SOUNDS_BY_ID[str(w?.id)];
  return (base ?? []).map(([key, mode, volume, min, max, more]) => cleanSoundRow({ src: `lib:${key}`, mode, volume, min, max, ...more })).filter(Boolean);
}

/** « Pluie acide » → « pluie_acide » (ce que lisent les formules). */
export function calSlug(name) {
  return String(name ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

/* ============================================================ */
/*  Nettoyage                                                    */
/* ============================================================ */

export function cleanWeatherType(w = {}) {
  const colors = {};
  for (const [k, d] of Object.entries(WEATHER_COLORS)) colors[k] = hex(w?.colors?.[k], d);
  const pair = (p, d) => (Array.isArray(p) ? [hex(p[0], d[0]), hex(p[1], d[1])] : null);
  const sky = w?.sky && (w.sky.day || w.sky.night)
    ? { day: pair(w.sky.day, ["#3f6aa8", "#8fc1e8"]) ?? ["#3f6aa8", "#8fc1e8"], night: pair(w.sky.night, ["#03050f", "#1b2347"]) ?? ["#03050f", "#1b2347"] }
    : null;
  return asProvided({
    id: str(w?.id) || foundry.utils.randomID(8),
    name: str(w?.name),
    key: calSlug(w?.key) || calSlug(w?.name),
    category: (w?.catBase && catKey(str(w?.id))) ? L(catKey(str(w.id))) : (str(w?.category) || (catKey(str(w?.id)) ? L(catKey(str(w.id))) : "")),
    catBase: !!(w?.catBase && catKey(str(w?.id))),
    icon: str(w?.icon) || "☁️",
    layers: (Array.isArray(w?.layers) ? w.layers : str(w?.layers).split(/\s+/)).map(str).filter(l => WEATHER_LAYERS.includes(l)),
    sky,
    colors,
    tempMod: num(w?.tempMod, 0, { min: -100, max: 100 }),
    effect: str(w?.effect),
    scene: sceneOf(w),
    sounds: soundsOf(w)
  });
}

export function cleanEvent(e = {}) {
  return {
    id: str(e?.id) || foundry.utils.randomID(8),
    name: str(e?.name),
    icon: str(e?.icon),
    color: hex(e?.color, "#c9a227"),
    repeat: EVENT_REPEATS.includes(e?.repeat) ? e.repeat : "once",
    year: num(e?.year, 0, { int: true }),
    month: num(e?.month, 1, { min: 1, int: true }),
    day: num(e?.day, 1, { min: 1, int: true }),
    hour: e?.hour === null || str(e?.hour) === "" ? null : num(e.hour, 0, { min: 0, int: true }),
    minute: num(e?.minute, 0, { min: 0, int: true }),
    note: str(e?.note),
    players: e?.players !== false,
    link: str(e?.link)
  };
}

export function cleanCalendar(c = {}) {
  const baseOf = (b, max) => { const n = num(b, 0, { min: 0, int: true }); return n >= 1 && n <= max ? n : null; };
  const months = (Array.isArray(c?.months) ? c.months : []).map(m => {
    const base = baseOf(m?.base, 12);
    return {
      name: base ? L(monthKey(base)) : str(m?.name), abbr: base ? L(monthKey(base, true)) : str(m?.abbr), base,
      days: num(m?.days, 30, { min: 1, int: true }),
      leapDays: m?.leapDays === null || str(m?.leapDays) === "" ? null : num(m.leapDays, 30, { min: 1, int: true })
    };
  }).filter(m => m.name);
  const days = (Array.isArray(c?.days) ? c.days : []).map(d => {
    const base = baseOf(d?.base, 7);
    return { name: base ? L(dayKey(base)) : str(d?.name), abbr: base ? L(dayKey(base, true)) : str(d?.abbr), base };
  }).filter(d => d.name);
  const seasons = (Array.isArray(c?.seasons) ? c.seasons : []).map(s => asProvided({
    id: str(s?.id) || foundry.utils.randomID(8),
    name: str(s?.name), key: calSlug(s?.key) || calSlug(s?.name), icon: str(s?.icon),
    month: num(s?.month, 1, { min: 1, int: true }), day: num(s?.day, 1, { min: 1, int: true }),
    temp: [num(s?.temp?.[0], 5, { min: -273 }), num(s?.temp?.[1], 20, { min: -273 })],
    sunrise: num(s?.sunrise, 6, { min: 0 }), sunset: num(s?.sunset, 18, { min: 0 }),
    weather: (Array.isArray(s?.weather) ? s.weather : []).map(w => ({ type: str(w?.type), weight: num(w?.weight, 1, { min: 0 }) })).filter(w => w.type && w.weight > 0)
  })).filter(s => s.name);
  const moons = (Array.isArray(c?.moons) ? c.moons : []).map(cleanMoon).filter(m => m.name);
  const leap = c?.leap && num(c.leap.every, 0, { min: 0, int: true }) > 0
    ? { start: num(c.leap.start, 0, { int: true }), every: num(c.leap.every, 4, { min: 1, int: true }) } : null;
  return {
    id: str(c?.id) || foundry.utils.randomID(8),
    name: c?.baseName ? L(BASE_NAME_KEY) : str(c?.name),
    baseName: !!c?.baseName,
    yearZero: num(c?.yearZero, 0, { int: true }),
    hoursPerDay: num(c?.hoursPerDay, 24, { min: 1, int: true }),
    minutesPerHour: num(c?.minutesPerHour, 60, { min: 1, int: true }),
    secondsPerMinute: num(c?.secondsPerMinute, 60, { min: 1, int: true }),
    firstWeekday: num(c?.firstWeekday, 0, { min: 0, int: true }),
    leap,
    months: months.length ? months : [{ name: "—", abbr: "", base: null, days: 30, leapDays: null }],
    days: days.length ? days : [{ name: "—", abbr: "", base: null }],
    seasons, moons,
    events: (Array.isArray(c?.events) ? c.events : []).map(cleanEvent).filter(e => e.name)
  };
}

export function cleanDisplay(d = {}) {
  return {
    date: DATE_FORMATS.includes(d?.date) ? d.date : "dmy",
    hour: HOUR_FORMATS.includes(d?.hour) ? d.hour : "24",
    temp: TEMP_UNITS.includes(d?.temp) ? d.temp : "c",
    weekStart: d?.weekStart === null || str(d?.weekStart) === "" ? null : num(d.weekStart, 0, { min: 0, int: true })
  };
}

export function cleanConfig(cfg = {}) {
  const list = (Array.isArray(cfg?.list) ? cfg.list : []).map(cleanCalendar).filter(c => c.name);
  const weather = (Array.isArray(cfg?.weather) ? cfg.weather : []).map(cleanWeatherType).filter(w => w.name);
  const o = cfg?.options ?? {};
  return {
    schema: CAL_SCHEMA,
    active: list.some(c => c.id === str(cfg?.active)) ? str(cfg.active) : (list[0]?.id ?? ""),
    list, weather,
    display: cleanDisplay(cfg?.display),
    options: {
      players: o.players !== false,
      autoWeather: o.autoWeather !== false,
      weatherEvery: num(o.weatherEvery, 6, { min: 1, int: true }),
      sceneWeather: !!o.sceneWeather,
      sceneDarkness: !!o.sceneDarkness,
      /* Catégories absentes du menu de météo de l'horloge (le menu reste
         court) ; par défaut, seule « Nature » des catégories fournies y est. */
      wxMenuHidden: Array.isArray(o.wxMenuHidden)
        ? [...new Set(o.wxMenuHidden.map(str))]
        : ["Fantasy", "Horror", "Apocalyptic", "SciFi"].map(k => L(`SBE.Cal.Cat.${k}`))
    }
  };
}

/* ============================================================ */
/*  Ce qui est fourni                                            */
/* ============================================================ */

/* Types de météo de base, rangés par catégorie :
   [clé de nom, icône, couches, ciel jour, ciel nuit, couleurs, écart de °C] */
const BASE_WEATHER = {
  Nature: [
    ["Clear", "☀️", "", null, null, {}, 3],
    ["Cloudy", "⛅", "clouds", null, null, {}, 0],
    ["Overcast", "☁️", "clouds dim", ["#6b7480", "#9aa3ae"], ["#06080d", "#1b212b"], { cloud: "#c9cfd6" }, -2],
    ["Mist", "🌫️", "fog dim", ["#8e9aa6", "#b9c2ca"], ["#0a0d14", "#2a313c"], {}, -3],
    ["Rain", "🌧️", "clouds dark rain dim", ["#4f5864", "#7f8a97"], ["#05070c", "#191e28"], {}, -4],
    ["Storm", "⛈️", "clouds dark rain flash bolts dim", ["#262b36", "#4d5562"], ["#020306", "#10141c"], {}, -3],
    ["Snow", "❄️", "clouds fall dim", ["#5d6672", "#8d97a3"], ["#05070c", "#191e28"], {}, -10],
    ["Blizzard", "🌨️", "clouds dark fall wind dim", ["#3f4752", "#6b7480"], ["#04060a", "#141920"], { wind: "#ffffff" }, -18],
    ["Hail", "🌩️", "clouds dark fall fast dim", ["#3a414c", "#636c78"], ["#04060a", "#141920"], { fall: "#e9f1fb" }, -6],
    ["Wind", "💨", "clouds wind", null, null, { wind: "#c48a3a" }, -1],
    ["Heatwave", "🥵", "heat", ["#e0b25a", "#f6e3a8"], ["#0b0a12", "#2a1f2e"], {}, 12],
    ["Sandstorm", "🏜️", "wind sand fog dim", ["#a87a3c", "#d9b377"], ["#1a1208", "#3f2d14"], { wind: "#f1cf8a", fog: "#d6aa64" }, 6]
  ],
  Fantasy: [
    ["ManaStorm", "✨", "spark aurora", ["#12082a", "#8a4bb0"], ["#12082a", "#8a4bb0"], {}, 0],
    ["FaeAurora", "🧚", "aurora spark", null, null, { aurora1: "#58e0a0", aurora2: "#f08ad8", spark: "#ffe9a8" }, 0],
    ["StarRain", "🌠", "meteor", ["#0a1030", "#1b2347"], ["#03050f", "#1b2347"], {}, -2],
    ["Eclipse", "🌑", "eclipse", ["#0d0f1c", "#2a2440"], ["#03050f", "#1b2347"], {}, -6],
    ["EternalSnow", "🧊", "fall float dim", ["#6f86a8", "#b8cde6"], ["#070a14", "#1b2740"], { fall: "#eaf6ff", float: "#bfeaff" }, -25],
    ["AshRain", "🌋", "clouds dark fall slow dim", ["#4a3a36", "#8a6e62"], ["#0c0806", "#2a1a14"], { cloud: "#8d7d78", fall: "#bdb4ae" }, 8]
  ],
  Horror: [
    ["CursedMist", "💀", "fog dim float", ["#2f3a35", "#4c5c52"], ["#040806", "#111c16"], { fog: "#78aa82", float: "#8df0b5" }, -5],
    ["BloodRain", "🩸", "clouds dark rain dim", ["#4a2626", "#7a3a3a"], ["#0b0304", "#2a0c0e"], { rain: "#e63c3c", cloud: "#9a7474" }, 0]
  ],
  Apocalyptic: [
    ["AcidRain", "🧪", "clouds dark acid rain dim", ["#3a4a3a", "#6d7f5a"], ["#060a06", "#182416"], { rain: "#aaff78", cloud: "#a8b598" }, -2],
    ["Radiation", "☢️", "haze dust dim", ["#6f7a3a", "#b9b85c"], ["#0a0d05", "#2b3312"], {}, 4],
    ["Emission", "🔥", "flash bolts red dust dim", ["#2a0707", "#c94a18"], ["#2a0707", "#c94a18"], { dust: "#ffb37a" }, 10],
    ["NuclearAsh", "🌫️", "fall slow fog dim haze", ["#4a4d4a", "#7a7d7a"], ["#050605", "#1a1c1a"], { fall: "#cfd3cf", fog: "#8c918c" }, -12],
    ["Smog", "😷", "fog dim dust", ["#5a5a3c", "#8a8a5a"], ["#0a0a06", "#242416"], { fog: "#aaa05a", dust: "#d8d070" }, 2]
  ],
  SciFi: [
    ["EmStorm", "⚡", "clouds dark em dim", ["#1b2340", "#3a4a7a"], ["#05070f", "#141c33"], { cloud: "#8c97b4" }, -2],
    ["MeteorRain", "☄️", "meteor flash red", ["#1a0f0a", "#3a2014"], ["#0a0504", "#1a0c08"], { meteor: "#ffb070" }, 2],
    ["Spores", "🍄", "float fog dim", ["#3f3a4a", "#6a5a7a"], ["#0a0810", "#20182a"], { fog: "#9678aa", float: "#d8a8ff" }, 3],
    ["Gravity", "🌀", "float dim spark", ["#101828", "#243a5a"], ["#05080f", "#101828"], { float: "#a8c8ff", spark: "#c8e0ff" }, -4]
  ]
};
/* Effet sur la scène de chaque type fourni : [genre, couleur, quantité, 2e couleur]. */
const BASE_SCENE = {
  Clear: [], Cloudy: [["tint", "#8a96a8", 0.4]],
  Overcast: [["tint", "#50586a", 1]],
  Mist: [["fx:fog", "#ffffff", 1]],
  Rain: [["fx:rain", "#b4cdeb", 1]],
  Storm: [["fx:rainStorm", "#b4cdeb", 1], ["flash", "#dfe8ff", 1], ["tint", "#202838", 1.2]],
  Snow: [["fx:snow", "#ffffff", 1]],
  Blizzard: [["fx:blizzard", "#ffffff", 1], ["tint", "#a8b8c8", 0.6]],
  Hail: [["fx:rainStorm", "#e9f1fb", 0.8], ["tint", "#3a414c", 0.8]],
  Wind: [["fx:leaves", "#c48a3a", 1]],
  Heatwave: [["heat", "#ffd9a0", 1], ["tint", "#ffb040", 0.6]],
  Sandstorm: [["fx:fog", "#d6aa64", 1.2], ["dust", "#f1cf8a", 1.5], ["tint", "#a87a3c", 1]],
  ManaStorm: [["sparks", "#d9b3ff", 1.2], ["aurora", "#7d4dff", 1, "#44ffd2"], ["tint", "#3f1868", 0.8]],
  FaeAurora: [["aurora", "#58e0a0", 1, "#f08ad8"], ["sparks", "#ffe9a8", 0.8]],
  StarRain: [["meteors", "#ffffff", 1], ["tint", "#0a1030", 1]],
  Eclipse: [["tint", "#0d0f1c", 2.5]],
  EternalSnow: [["fx:snow", "#eaf6ff", 1], ["floaters", "#bfeaff", 0.6]],
  AshRain: [["fx:snow", "#9a8f8a", 1], ["tint", "#4a3a36", 1]],
  CursedMist: [["fx:fog", "#78aa82", 1], ["floaters", "#8df0b5", 0.8], ["tint", "#1a2a20", 1]],
  BloodRain: [["fx:rain", "#e63c3c", 1], ["tint", "#5a1010", 0.8]],
  AcidRain: [["fx:rain", "#aaff78", 1], ["tint", "#304a20", 0.8]],
  Radiation: [["dust", "#d8ff60", 1], ["pulse", "#8a9a20", 1]],
  Emission: [["flash", "#ff5a28", 1.2], ["dust", "#ffb37a", 1], ["pulse", "#a02008", 1.5]],
  NuclearAsh: [["fx:snow", "#cfd3cf", 0.8], ["fx:fog", "#8c918c", 0.6], ["tint", "#3a3d3a", 1]],
  Smog: [["fx:fog", "#aaa05a", 1.2], ["tint", "#5a5a3c", 1]],
  EmStorm: [["arcs", "#9fd0ff", 1], ["flash", "#9fd0ff", 0.5], ["tint", "#1b2340", 1]],
  MeteorRain: [["meteors", "#ffb070", 1.5], ["flash", "#ff7a30", 0.4]],
  Spores: [["floaters", "#d8a8ff", 1.2], ["fx:fog", "#9678aa", 0.6]],
  Gravity: [["floaters", "#a8c8ff", 1], ["sparks", "#c8e0ff", 0.5], ["tint", "#101828", 0.8]]
};
const BASE_SCENE_BY_ID = Object.fromEntries(Object.entries(BASE_SCENE).map(([k, v]) => [`base-${k.toLowerCase()}`, v]));

/* Les sons de chaque type fourni : [clé de bibliothèque, mode, volume, min, max]. */
const THUNDERS = [
  ["thunder", "flash", 0.5, 10, 30, { dist: "near" }],
  ["thunderNear", "flash", 0.5, 10, 30, { dist: "near" }],
  ["thunderFar", "flash", 0.5, 10, 30, { dist: "far" }]
];
const BASE_SOUNDS = {
  Rain: [["rain", "loop", 0.5]], BloodRain: [["rain", "loop", 0.5]], AcidRain: [["rain", "loop", 0.5]],
  Storm: [["stormRain", "loop", 0.5], ...THUNDERS],
  Hail: [["hail", "loop", 0.5]],
  Wind: [["strongWind", "loop", 0.5]],
  Blizzard: [["blizzardWind", "loop", 0.5]],
  Sandstorm: [["sandstorm", "loop", 0.5], ["desertWind", "loop", 0.5]],
  ManaStorm: [["manaStorm", "loop", 0.5]],
  CursedMist: [["cursedMist", "loop", 0.5]],
  Smog: [["toxicMist", "loop", 0.5]],
  Radiation: [["radiation", "loop", 0.5]], NuclearAsh: [["radiation", "loop", 0.5]], AshRain: [["snowWind", "loop", 0.5]],
  Snow: [["snowWind", "loop", 0.5]], EternalSnow: [["snowWind", "loop", 0.5]],
  Emission: [["emission", "loop", 0.5], ...THUNDERS],
  EmStorm: [["electricity", "loop", 0.5]],
  MeteorRain: [["meteor", "random", 0.5, 8, 25]],
  Gravity: [["gravity", "loop", 0.5]]
};
const BASE_SOUNDS_BY_ID = Object.fromEntries(Object.entries(BASE_SOUNDS).map(([k, v]) => [`base-${k.toLowerCase()}`, v]));

/* Catégorie de chaque type fourni (par son id) : sert aussi aux types
   enregistrés avant l'arrivée des catégories. */
const BASE_CAT = Object.fromEntries(Object.entries(BASE_WEATHER).flatMap(([cat, list]) => list.map(w => [`base-${w[0].toLowerCase()}`, cat])));

/** Les types de météo fournis (traduits à la création). */
export function baseWeatherTypes() {
  return Object.entries(BASE_WEATHER).flatMap(([cat, list]) => list.map(([key, icon, layers, day, night, colors, tempMod]) => cleanWeatherType({
    id: `base-${key.toLowerCase()}`, name: L(`SBE.Cal.Wx.${key}`), category: L(`SBE.Cal.Cat.${cat}`), catBase: true, icon, layers, sky: day ? { day, night } : null, colors, tempMod
  })));
}

/**
 * Les types rangés par catégorie, dans l'ordre où chaque catégorie
 * apparaît ; les types sans catégorie à la fin (« Autres »).
 * @returns {{ name: string, types: object[] }[]}
 */
export function groupWeather(types) {
  const groups = new Map();
  for (const t of types) {
    const k = t.category || "";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  const out = [...groups].filter(([k]) => k).map(([name, list]) => ({ name, cat: name, types: list }));
  if (groups.has("")) out.push({ name: L("SBE.Cal.Cat.Other"), cat: "", types: groups.get("") });
  return out;
}

/* Saisons du calendrier fourni : [clé, icône, mois, jour, °C min, °C max, lever, coucher, météos pondérées] */
const BASE_SEASONS = [
  ["Spring", "🌱", 3, 20, 6, 18, 6.5, 20, { clear: 4, cloudy: 4, overcast: 2, mist: 1, rain: 3, storm: 1, wind: 2 }],
  ["Summer", "☀️", 6, 21, 15, 30, 5.5, 21.5, { clear: 7, cloudy: 3, overcast: 1, storm: 2, heatwave: 1, wind: 1 }],
  ["Autumn", "🍂", 9, 22, 4, 16, 7, 19, { clear: 3, cloudy: 4, overcast: 3, mist: 2, rain: 4, storm: 1, wind: 3 }],
  ["Winter", "❄️", 12, 21, -6, 6, 8.5, 17, { clear: 2, cloudy: 3, overcast: 3, mist: 2, rain: 2, snow: 3, blizzard: 1, hail: 1 }]
];

/** Le calendrier fourni (grégorien simple, un an = 365 jours, bissextile tous les 4 ans). */
export function baseCalendar(name) {
  const months = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31].map((d, i) => ({ base: i + 1, days: d, leapDays: i === 1 ? 29 : null }));
  const days = [1, 2, 3, 4, 5, 6, 7].map(i => ({ base: i }));
  return cleanCalendar({
    name: name || "", baseName: !name,
    yearZero: 0, hoursPerDay: 24, minutesPerHour: 60, secondsPerMinute: 60,
    /* Le temps 0 (1er janvier de l'an 0 du calendrier simple) tombe un samedi. */
    firstWeekday: 5, leap: { start: 0, every: 4 },
    months, days,
    seasons: BASE_SEASONS.map(([k, icon, month, day, lo, hi, sunrise, sunset, w]) => ({
      id: `base-${k.toLowerCase()}`, name: L(`SBE.Cal.Season.${k}`), icon, month, day, temp: [lo, hi], sunrise, sunset,
      weather: Object.entries(w).map(([t, weight]) => ({ type: `base-${t}`, weight }))
    })),
    moons: [{ id: BASE_MOON_ID, name: L("SBE.Cal.MoonName"), cycle: 29.53, offset: 5 }],
    events: []
  });
}

/* ============================================================ */
/*  Lecture du réglage                                           */
/* ============================================================ */

export function readConfig() {
  let raw = null;
  try { raw = game.settings.get(SYSTEM_ID, CAL_SETTING); } catch (_e) { /* pas encore inscrit */ }
  return cleanConfig(raw ?? {});
}

export function readState() {
  let raw = null;
  try { raw = game.settings.get(SYSTEM_ID, STATE_SETTING); } catch (_e) { /* pas encore inscrit */ }
  const o = raw?.override, se = raw?.season;
  const until = (v) => (v === null || v === undefined ? null : num(v, 0));
  return {
    override: o?.type ? { type: str(o.type), temp: o.temp === null || o.temp === undefined ? null : num(o.temp, 0), until: until(o.until) } : null,
    season: se?.key ? { key: str(se.key), until: until(se.until) } : null,
    /* Phases imposées : clé de la lune → { phase (clé), until }. */
    moons: Object.fromEntries(Object.entries(raw?.moons ?? {})
      .filter(([k, v]) => k && v?.phase).map(([k, v]) => [k, { phase: str(v.phase), until: until(v.until) }]))
  };
}

/** Les préférences d'affichage de CE poste : celles du monde, surchargées par le joueur. */
export function readDisplay(cfg = readConfig()) {
  let mine = {};
  try { mine = game.settings.get(SYSTEM_ID, DISPLAY_SETTING) ?? {}; } catch (_e) { /* pas encore inscrit */ }
  const d = { ...cfg.display };
  for (const k of Object.keys(d)) if (mine[k] !== undefined && mine[k] !== "") d[k] = mine[k];
  return cleanDisplay(d);
}

/** La description Foundry (CalendarData) d'un calendrier SBE. */
export function foundryConfig(c) {
  return {
    name: c.name, description: "",
    years: { yearZero: c.yearZero, firstWeekday: c.firstWeekday, leapYear: c.leap ? { leapStart: c.leap.start, leapInterval: c.leap.every } : null },
    months: { values: c.months.map((m, i) => ({ name: m.name, abbreviation: m.abbr || m.name.slice(0, 3), ordinal: i + 1, days: m.days, leapDays: m.leapDays ?? m.days })) },
    days: {
      values: c.days.map((d, i) => ({ name: d.name, abbreviation: d.abbr || d.name.slice(0, 3), ordinal: i + 1 })),
      daysPerYear: c.months.reduce((t, m) => t + m.days, 0),
      hoursPerDay: c.hoursPerDay, minutesPerHour: c.minutesPerHour, secondsPerMinute: c.secondsPerMinute
    },
    /* Foundry exige des saisons : une seule, sur toute l'année (SBE calcule les siennes). */
    seasons: { values: [{ name: c.seasons[0]?.name || c.name, monthStart: 1, monthEnd: c.months.length, dayStart: 1, dayEnd: c.months.reduce((t, m) => t + m.days, 0) }] }
  };
}

/* ============================================================ */
/*  Hasard reproductible                                         */
/* ============================================================ */

/** Un nombre 0..1 toujours le même pour la même graine (texte). */
export function seeded(seed) {
  let h = 1779033703 ^ String(seed).length;
  for (const ch of String(seed)) { h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
