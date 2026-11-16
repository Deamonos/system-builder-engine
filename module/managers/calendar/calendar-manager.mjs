/**
 * SBE — CALENDRIER, HORLOGE ET MÉTÉO : le MOTEUR
 *
 * Une seule source : game.time.worldTime (les secondes de Foundry) et le
 * calendrier actif (calendar-model). D'ici partent :
 *   - le calendrier Foundry (CONFIG.time.worldCalendarConfig) nourri par
 *     celui du MJ : tout ce qui, ailleurs, formate une date, suit ;
 *   - les LECTURES : composantes, saison, soleil, lunes, météo du
 *     moment (tirée de façon reproductible, ou imposée), température,
 *     événements du jour, textes formatés selon les préférences ;
 *   - les ÉCRITURES du MJ : avancer / régler l'heure, imposer une météo,
 *     gérer les événements ;
 *   - les SUITES d'un changement (chez le MJ principal) : moments « Se
 *     lance tout seul » (heure, jour, aube, crépuscule, météo, saison,
 *     événement), effets liés à la météo sur les jetons de la scène
 *     active, météo et obscurité de la scène, signal sbeCalendarChange
 *     pour les fenêtres.
 *
 * Fonctions de fiche offertes aux formules : hour(), minute(), day(),
 * month(), year(), weekday(), dayOfYear(), season(), weather(),
 * temperature(), moon(), isNight(), dayPart(), hasEvent("nom").
 * Saison et météo rendent leur CLÉ (fixée par le MJ) ; lune et moment, un slug.
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { isPrimaryGM, onSocketMessage, requestGM, gmQueue } from "../../helpers/socket.mjs";
import { registerScopeFunctions } from "../../builder/doc-scope.mjs";
import { registerKeyFamily } from "../checker/ref-engine.mjs";
import { SceneWeather, registerSceneEffects, FX_PREFIX } from "./scene-weather.mjs";
import { WeatherSound, SOUND_SETTING } from "./weather-sound.mjs";
import { registerPreview } from "../tours/tour-previews.mjs";
import {
  CAL_SETTING, STATE_SETTING, DISPLAY_SETTING, DAY_PARTS,
  readConfig, readState, readDisplay, cleanConfig, cleanEvent, baseCalendar, baseWeatherTypes, foundryConfig, seeded, calSlug,
  CAL_SCHEMA, BASE_MOON_ID, markProvidedNames,
  TIME_ACTIONS, TIME_PARTS
} from "./calendar-model.mjs";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));


export class CalendarManager {

  static #last = null;      /* MJ principal : dernier instantané (changements) */
  static #cfg = null;       /* cache du réglage nettoyé */
  static #preview = null;   /* visites guidées : calendrier de base montré, jamais enregistré */
  static #previewShown = false;

  /* ============================================================ */
  /*  Mise en route                                                */
  /* ============================================================ */

  static init() {
    /* Visites guidées : l'horloge en aperçu (calendrier de base si le module est désactivé). */
    registerPreview("clock", { show: () => this.preview(true), hide: () => this.preview(false) });
    game.settings.register(SYSTEM_ID, CAL_SETTING, {
      scope: "world", config: false, type: Object, default: {},
      onChange: () => { this.#cfg = null; this.applyToFoundry(); if (this.enabled()) { SceneWeather.refresh(); WeatherSound.refresh(); } this.#changed({ config: true }); }
    });
    game.settings.register(SYSTEM_ID, STATE_SETTING, {
      scope: "world", config: false, type: Object, default: {},
      onChange: () => this.#changed({})
    });
    /* Le composant s'active dans les réglages du système (décoché : rien ne s'affiche). */
    game.settings.register(SYSTEM_ID, "calendarEnabled", {
      name: "SBE.Cal.SettingEnabled", hint: "SBE.Cal.SettingEnabledHint", scope: "world", config: true, type: Boolean, default: false,
      requiresReload: true,
      /* À l'activation, l'horloge repart à sa place de départ (l'emplacement du haut). */
      onChange: (v) => { if (v) game.settings.set(SYSTEM_ID, "clockPos", {}); }
    });
    if (this.enabled()) this.registerResetMenu();
    /* Chaque joueur peut couper les sons météo (le volume se règle sur le canal Environnement). */
    game.settings.register(SYSTEM_ID, SOUND_SETTING, {
      name: "SBE.Cal.SettingSounds", hint: "SBE.Cal.SettingSoundsHint", scope: "client", config: this.enabled(), type: Boolean, default: true,
      onChange: () => WeatherSound.refresh(true)
    });
    game.settings.register(SYSTEM_ID, DISPLAY_SETTING, { scope: "client", config: false, type: Object, default: {}, onChange: () => this.#refresh() });
    for (const k of ["clockMini", "calendarMini"]) game.settings.register(SYSTEM_ID, k, { scope: "client", config: false, type: Boolean, default: false });
    for (const k of ["clockPos", "calendarPos"]) game.settings.register(SYSTEM_ID, k, { scope: "client", config: false, type: Object, default: {} });

    this.applyToFoundry();
    /* Les traductions arrivent après « init » : les noms traduits à la
       volée (catégories des types fournis) sont relus à ce moment-là. */
    Hooks.once("i18nInit", () => {
      this.#cfg = null; this.applyToFoundry();
      /* La météo sur la scène : une entrée Foundry par type, et les couches SBE. */
      if (this.enabled()) { registerSceneEffects(this.weatherTypes()); SceneWeather.init(); WeatherSound.init(); }
    });

    registerScopeFunctions("calendar", () => ({
      hour: () => this.components().hour,
      minute: () => this.components().minute,
      day: () => this.components().dayOfMonth + 1,
      month: () => this.components().month + 1,
      year: () => this.yearShown(this.components()),
      weekday: () => this.components().dayOfWeek + 1,
      dayOfYear: () => this.components().day + 1,
      season: () => this.seasonAt()?.key ?? "",
      weather: () => this.weatherAt()?.type?.key ?? "",
      temperature: () => this.weatherAt()?.temp ?? 0,
      /* moon() : phase de la première lune ; moon("lune_rouge") : d'une lune précise. */
      moon: (moonKey = "") => this.moonOf(moonKey)?.phaseKey ?? "",
      moonPhase: (phaseKey = "", moonKey = "") => (this.moonOf(moonKey)?.phaseKey === calSlug(phaseKey) ? 1 : 0),
      isNight: () => (this.isNight() ? 1 : 0),
      dayPart: () => this.dayPart(),
      hasEvent: (name = "") => (this.eventsOn(this.components()).some(e => !name || calSlug(e.name) === calSlug(name)) ? 1 : 0)
    }));

    /* Le vérificateur connaît les clés de météo et de saison (étapes d'action). */
    registerKeyFamily("calWeather", { label: "SBE.Checker.FamCalWeather", keys: () => (this.enabled() ? this.weatherTypes().map(w => w.key) : []) });
    registerKeyFamily("calSeason", { label: "SBE.Checker.FamCalSeason", keys: () => (this.enabled() ? (this.calendar()?.seasons ?? []).map(x => x.key) : []) });
    registerKeyFamily("calMoon", { label: "SBE.Checker.FamCalMoon", keys: () => (this.enabled() ? (this.calendar()?.moons ?? []).map(m => m.key) : []) });
    registerKeyFamily("calMoonPhase", { label: "SBE.Checker.FamCalMoonPhase", keys: () => (this.enabled() ? (this.calendar()?.moons ?? []).flatMap(m => m.phases.map(p => p.key)) : []) });

    Hooks.on("updateWorldTime", () => this.#changed({}));
    /* Étapes d'action d'un joueur (temps, météo, saison) : faites par le MJ principal. */
    onSocketMessage((p) => { if (p?.type === "sbeCalStep" && isPrimaryGM()) this.#queued(p.step ?? {}); });
    Hooks.on("canvasReady", () => { if (isPrimaryGM()) this.#applyScene(this.snapshot(), { force: true }); });
    Hooks.once("ready", async () => {
      if (!this.enabled()) return;
      if (isPrimaryGM()) { await this.#migrateProvided(); await this.ensureBase(); }
      this.#last = this.snapshot();
      if (isPrimaryGM()) this.#applyScene(this.#last, { force: true });
      if (!this.canSee()) return;
      /* L'horloge est toujours là ; le calendrier s'ouvre à chaque lancement (on peut le fermer). */
      (await import("./clock-app.mjs")).SBEClock.show();
      (await import("./calendar-app.mjs")).SBECalendarApp.toggle(true);
    });

    Hooks.on("getSceneControlButtons", (controls) => {
      const group = controls?.tokens;
      if (!group?.tools || !this.enabled() || !this.canSee()) return;
      group.tools.sbeCalendar = {
        name: "sbeCalendar", order: 92, title: "SBE.Cal.Title", icon: "fa-solid fa-calendar-days", toggle: true,
        active: !!foundry.applications.instances.get("sbe-calendar")?.rendered,
        onChange: async (_e, active) => (await import("./calendar-app.mjs")).SBECalendarApp.toggle(active)
      };
    });
  }

  /** Réglages du système : bouton « Remettre l'horloge à sa place » (chaque poste, joueurs compris). */
  static registerResetMenu() {
    const { ApplicationV2 } = foundry.applications.api;
    class SBEClockReset extends ApplicationV2 {
      async render() { (await import("./clock-app.mjs")).SBEClock.resetAll(); return this; }
    }
    game.settings.registerMenu(SYSTEM_ID, "clockResetMenu", {
      name: "SBE.Cal.ResetMenuName", label: "SBE.Cal.ResetMenuLabel", hint: "SBE.Cal.ResetMenuHint",
      icon: "fa-solid fa-arrows-to-dot", type: SBEClockReset, restricted: false
    });
  }

  /** Le composant est-il activé dans les réglages du système ? */
  static enabled() {
    try { return !!game.settings.get(SYSTEM_ID, "calendarEnabled"); } catch (_e) { return false; }
  }

  /** Ce poste peut-il voir l'horloge et le calendrier ? */
  static canSee() { return game.user.isGM || this.config().options.players; }

  /**
   * MIGRATION (forme 1 → 2) : les éléments fournis prennent leur clé
   * anglaise. Saisons et lune fournies d'un ancien monde, sans id fixe,
   * sont reconnues à leur ancienne clé (nom traduit). Les anciennes clés
   * sont renommées partout où le vérificateur les suit (étapes Météo,
   * Saison, Lune) et dans l'état du calendrier (saison et phases
   * imposées). Une seule fois, par le MJ principal.
   */
  static async #migrateProvided() {
    let raw = null;
    try { raw = foundry.utils.deepClone(game.settings.get(SYSTEM_ID, CAL_SETTING)); } catch (_e) { return; }
    if (!raw || (Number(raw.schema) || 1) >= CAL_SCHEMA) return;
    if (!(raw.list?.length || raw.weather?.length)) return;
    /* Forme 3 : noms fournis (mois, jours, calendrier, catégories) marqués,
       reconnus dans toutes les langues du système (le monde a pu être
       créé dans une autre langue que celle de ce MJ). */
    const dicts = [game.i18n.translations, game.i18n._fallback];
    for (const lang of game.system.languages ?? []) {
      try { dicts.push(await foundry.utils.fetchJsonWithTimeout(foundry.utils.getRoute(lang.path))); }
      catch (err) { console.warn(`SBE | Calendrier : langue ${lang.lang} illisible`, err); }
    }
    markProvidedNames(raw, dicts);
    if ((Number(raw.schema) || 1) >= 2) { await this.saveConfig(cleanConfig(raw)); return; }
    const slugOf = (x) => calSlug(x?.key) || calSlug(x?.name);
    /* Saisons et lune fournies : reconnues à leur ancienne clé. */
    const baseSeasons = baseCalendar().seasons;
    for (const c of raw.list ?? []) {
      for (const b of baseSeasons) {
        if ((c.seasons ?? []).some(x => x?.id === b.id)) continue;
        const hit = (c.seasons ?? []).find(x => x && !String(x.id ?? "").startsWith("base-") && [calSlug(b.name), b.key].includes(slugOf(x)));
        if (hit) hit.id = b.id;
      }
      if (!(c.moons ?? []).some(m => m?.id === BASE_MOON_ID)) {
        const hit = (c.moons ?? []).find(m => [calSlug(L("SBE.Cal.MoonName")), "moon"].includes(slugOf(m)));
        if (hit) hit.id = BASE_MOON_ID;
      }
    }
    const cfg = cleanConfig(raw);
    /* Anciennes clés → nouvelles, par famille. */
    const pairs = new Map();
    const pair = (fam, old, nw) => { if (old && nw && old !== nw) pairs.set(`${fam}|${old}`, [old, nw, fam]); };
    for (const w of cfg.weather) pair("calWeather", slugOf((raw.weather ?? []).find(x => x?.id === w.id)), w.key);
    for (const c of cfg.list) {
      const rc = (raw.list ?? []).find(x => x?.id === c.id) ?? {};
      for (const x of c.seasons) pair("calSeason", slugOf((rc.seasons ?? []).find(y => y?.id === x.id)), x.key);
      for (const m of c.moons) {
        const rm = (rc.moons ?? []).find(y => y?.id === m.id);
        if (!rm) continue;
        pair("calMoon", slugOf(rm), m.key);
        for (const ph of m.phases) pair("calMoonPhase", slugOf((rm.phases ?? []).find(y => y?.id === ph.id)), ph.key);
      }
    }
    await this.saveConfig(cfg);
    if (!pairs.size) return;
    const to = (fam, k) => pairs.get(`${fam}|${k}`)?.[1] ?? k;
    /* L'état : saison imposée, lunes et phases imposées. */
    const st = this.state();
    if (st.season) st.season.key = to("calSeason", st.season.key);
    st.moons = Object.fromEntries(Object.entries(st.moons ?? {}).map(([k, v]) => [to("calMoon", k), { ...v, phase: to("calMoonPhase", v.phase) }]));
    await game.settings.set(SYSTEM_ID, STATE_SETTING, st);
    const { rename } = await import("../checker/ref-engine.mjs");
    let changed = 0;
    for (const [old, nw, fam] of pairs.values()) changed += (await rename(old, nw, fam, [])).changed;
    ui.notifications.info(L("SBE.Cal.KeysMigrated", { n: pairs.size, docs: changed }), { permanent: true });
  }

  /** Premier lancement : le calendrier et les météos de base, s'il n'y a rien. */
  static async ensureBase() {
    const cfg = this.config();
    if (cfg.list.length && cfg.weather.length) return;
    if (!cfg.weather.length) cfg.weather = baseWeatherTypes();
    if (!cfg.list.length) { const c = baseCalendar(); cfg.list.push(c); cfg.active = c.id; }
    await this.saveConfig(cfg);
  }

  /** Le calendrier du MJ devient celui de Foundry (dates partout pareilles). */
  static applyToFoundry() {
    const c = this.calendar();
    if (!c) return;
    try {
      CONFIG.time.worldCalendarConfig = foundryConfig(c);
      game.time?.initializeCalendar?.();
    } catch (err) {
      console.warn("SBE | Calendrier : description refusée par Foundry, calendrier précédent conservé", err);
    }
  }

  /* ============================================================ */
  /*  Lecture                                                      */
  /* ============================================================ */

  static config() { return this.#preview ?? (this.#cfg ??= readConfig()); }

  /**
   * APERÇU (visites guidées) : l'horloge montrée même module désactivé,
   * sur le calendrier et la météo de base tenus en mémoire (rien n'est
   * enregistré). Module activé : la vraie horloge, rouverte si besoin.
   * @param {boolean} on
   */
  static async preview(on) {
    const { SBEClock } = await import("./clock-app.mjs");
    if (on) {
      if (!this.enabled()) {
        const cfg = cleanConfig({});
        cfg.weather = baseWeatherTypes();
        const c = baseCalendar();
        cfg.list.push(c);
        cfg.active = c.id;
        this.#preview = cfg;
      }
      this.#previewShown = !SBEClock.isOpen();
      if (this.#previewShown) await SBEClock.show();
      return;
    }
    if (this.#previewShown) await SBEClock.instance?.close({ animate: false });
    this.#previewShown = false;
    this.#preview = null;
  }
  static state() { return readState(); }
  static display() { return readDisplay(this.config()); }
  static calendar() { const cfg = this.config(); return cfg.list.find(c => c.id === cfg.active) ?? cfg.list[0] ?? null; }
  static weatherTypes() { return this.config().weather; }
  static weatherType(id) { return this.weatherTypes().find(w => w.id === id) ?? null; }
  static weatherByKey(key) { return this.weatherTypes().find(w => w.key === key) ?? null; }
  static now() { return game.time?.worldTime ?? 0; }

  static secondsPerDay(c = this.calendar()) { return c ? c.hoursPerDay * c.minutesPerHour * c.secondsPerMinute : 86400; }
  static secondsPerHour(c = this.calendar()) { return c ? c.minutesPerHour * c.secondsPerMinute : 3600; }
  static daysPerYear(c = this.calendar()) { return c ? c.months.reduce((t, m) => t + m.days, 0) : 365; }
  /** Numéro absolu du jour (depuis le temps 0). */
  static dayIndex(t = this.now(), c = this.calendar()) { return Math.floor(t / this.secondsPerDay(c)); }
  /** Heure décimale dans la journée (14,5 = 14 h 30). */
  static hourOf(t = this.now(), c = this.calendar()) { return ((t % this.secondsPerDay(c)) + this.secondsPerDay(c)) % this.secondsPerDay(c) / this.secondsPerHour(c); }

  /**
   * Composantes d'un instant : year, month, dayOfMonth (à partir de 0),
   * hour, minute, second (Foundry), plus day (jour de l'année, 0..) et
   * dayOfWeek (0..) calculés ici sur le calendrier du MJ.
   */
  static components(t = this.now()) {
    const c = this.calendar();
    let comp;
    try { comp = { ...game.time.calendar.timeToComponents(t) }; }
    catch (_e) { comp = { year: 0, month: 0, dayOfMonth: 0, hour: 0, minute: 0, second: 0 }; }
    let day = comp.dayOfMonth ?? 0;
    for (let i = 0; i < (comp.month ?? 0); i++) day += this.monthDays(i, comp.year ?? 0, c);
    comp.day = day;
    const n = c?.days.length || 7;
    comp.dayOfWeek = ((((c?.firstWeekday ?? 0) + this.dayIndex(t, c)) % n) + n) % n;
    return comp;
  }
  static toTime(comp) {
    try { return game.time.calendar.componentsToTime(comp); } catch (_e) { return 0; }
  }
  static yearShown(comp, c = this.calendar()) { return (comp?.year ?? 0) + (c?.yearZero ?? 0); }
  static isLeap(year) { try { return !!game.time.calendar.isLeapYear(year); } catch (_e) { return false; } }
  /** Jours d'un mois (index 0..) une année donnée (comptée depuis zéro). */
  static monthDays(month, year, c = this.calendar()) {
    const m = c?.months[month];
    if (!m) return 30;
    return this.isLeap(year) && m.leapDays !== null ? m.leapDays : m.days;
  }
  /** Le temps (secondes) du début d'un jour : année depuis zéro, mois 0.., jour du mois 0.. */
  static timeOf(year, month, dom, c = this.calendar()) {
    let day = dom;
    for (let i = 0; i < month; i++) day += this.monthDays(i, year, c);
    return this.toTime({ year, month, dayOfMonth: dom, day, hour: 0, minute: 0, second: 0 });
  }

  /** La saison d'une date (saisons rangées par leur début ; la dernière enjambe l'an). */
  static seasonAt(comp = this.components(), c = this.calendar()) {
    if (!c?.seasons.length) return null;
    /* Une saison imposée (sort, objet) l'emporte, jusqu'à sa fin. */
    const o = this.state().season;
    if (o && (o.until === null || this.toTime(comp) < o.until)) {
      const i = c.seasons.findIndex(s => s.key === o.key);
      if (i >= 0) return { ...c.seasons[i], index: i, forced: true };
    }
    const startOf = (s) => c.months.slice(0, Math.max(0, s.month - 1)).reduce((t, m) => t + m.days, 0) + (s.day - 1);
    const list = c.seasons.map((s, i) => ({ s, i, start: startOf(s) })).sort((a, b) => a.start - b.start);
    const d = comp.day ?? 0;
    let cur = list[list.length - 1];
    for (const x of list) if (d >= x.start) cur = x;
    return { ...cur.s, index: cur.i };
  }

  /** Lever et coucher (heures décimales) de la saison du moment. */
  static sunAt(comp = this.components(), c = this.calendar()) {
    const s = this.seasonAt(comp, c);
    const h = c?.hoursPerDay ?? 24;
    return { sunrise: s ? Math.min(h, s.sunrise) : h / 4, sunset: s ? Math.min(h, s.sunset) : (h * 3) / 4 };
  }

  static isNight(t = this.now(), c = this.calendar()) {
    const { sunrise, sunset } = this.sunAt(this.components(t), c);
    const h = this.hourOf(t, c);
    return h < sunrise || h >= sunset;
  }

  /** Le moment de la journée (slug : night, dawn, morning, noon, afternoon, dusk). */
  static dayPart(t = this.now(), c = this.calendar()) {
    const { sunrise, sunset } = this.sunAt(this.components(t), c);
    const h = this.hourOf(t, c);
    const hpd = c?.hoursPerDay ?? 24;
    const step = hpd / 24;
    /* Mêmes heures que la lumière de la scène (darknessAt) : l'aube autour
       du lever, le crépuscule dès l'heure et demie avant le coucher. */
    if (h < sunrise - step || h >= sunset + step) return "night";
    if (h < sunrise + step * 0.5) return "dawn";
    if (h >= sunset - step * 1.5) return "dusk";
    const mid = (sunrise + sunset) / 2;
    if (h < mid - step) return "morning";
    if (h < mid + step) return "noon";
    return "afternoon";
  }
  static dayPartLabel(part) { return DAY_PARTS.includes(part) ? L(`SBE.Cal.Part.${part}`) : ""; }

  /**
   * Les lunes d'un jour (phase 0..7, nom, icône, éclairement) : la phase de chacune (par sa part du cycle), une
   * phase rare qui la remplace ce cycle-là, ou la phase imposée (étape
   * « Lune »). `t` : l'instant (pour une phase imposée qui a une fin).
   */
  static moonsAt(dayIdx = this.dayIndex(), c = this.calendar(), t = null) {
    const spd = this.secondsPerDay(c);
    const at = t ?? (dayIdx === this.dayIndex() ? this.now() : (dayIdx + 0.5) * spd);
    const forced = this.state().moons ?? {};
    return (c?.moons ?? []).map((m, mi) => {
      const pos = dayIdx - m.offset;
      const f = (((pos % m.cycle) + m.cycle) % m.cycle) / m.cycle;
      const cycleNum = Math.floor(pos / m.cycle);
      const normal = m.phases.filter(p => !p.replaces);
      /* Parts du cycle ; toutes à 0 : parts égales. */
      const sum = normal.reduce((a, p) => a + p.length, 0);
      const part = (p) => (sum > 0 ? p.length : 1);
      const total = sum > 0 ? sum : Math.max(1, normal.length);
      /* La première phase est centrée sur le début du cycle (la nouvelle lune encadre 0). */
      const g = (f + (normal[0] ? part(normal[0]) / total : 0) / 2) % 1;
      let acc = 0, ph = normal[normal.length - 1];
      for (const p of normal) { acc += part(p) / total; if (g < acc) { ph = p; break; } }
      const rare = m.phases.find(p => p.replaces === ph?.id && (
        (p.every > 0 && (((cycleNum % p.every) + p.every) % p.every) === p.every - 1)
        || (p.chance > 0 && seeded(`${c.id}:moon:${m.id}:${p.id}:${cycleNum}`) * 100 < p.chance)));
      if (rare) ph = rare;
      let isForced = false;
      const o = forced[m.key];
      if (o && (o.until === null || at < o.until)) {
        const op = m.phases.find(p => p.key === o.phase);
        if (op) { ph = op; isForced = true; }
      }
      return {
        /* Lune sans nom : « Lune 2 » (son rang), comme à sa création. */
        ...m, name: m.name || L("SBE.Cal.NewMoon", { n: mi + 1 }), frac: f, cycleNum, phaseId: ph?.id ?? "", phaseKey: ph?.key ?? "", phaseName: ph?.name ?? "",
        icon: ph?.icon || "🌙", color: ph?.color || m.color, effect: ph?.effect ?? "", rare: !!rare, forced: isForced,
        illum: (1 - Math.cos(f * 2 * Math.PI)) / 2
      };
    });
  }

  /** Une lune du moment par sa clé (vide = la première). */
  static moonOf(moonKey = "", t = this.now()) {
    const list = this.moonsAt(this.dayIndex(t), this.calendar(), t);
    const k = calSlug(moonKey);
    return k ? list.find(m => m.key === k) ?? null : list[0] ?? null;
  }


  /* ---------------- Météo ---------------- */

  /** Le créneau de météo d'un instant : numéro de jour et rang dans le jour. */
  static slotOf(t = this.now(), c = this.calendar()) {
    const every = Math.max(1, this.config().options.weatherEvery);
    return { day: this.dayIndex(t, c), slot: Math.floor(this.hourOf(t, c) / every) };
  }

  /** La météo TIRÉE (sans l'ordre du MJ) d'un instant. */
  static rolledWeather(t = this.now(), c = this.calendar()) {
    const types = this.weatherTypes();
    if (!types.length) return null;
    const comp = this.components(t);
    const s = this.seasonAt(comp, c);
    const pool = (s?.weather ?? []).map(w => ({ type: types.find(x => x.id === w.type), weight: w.weight })).filter(w => w.type);
    if (!pool.length) return types[0];
    const { day, slot } = this.slotOf(t, c);
    let r = seeded(`${c?.id}:w:${day}:${slot}`) * pool.reduce((a, w) => a + w.weight, 0);
    for (const w of pool) { r -= w.weight; if (r < 0) return w.type; }
    return pool[pool.length - 1].type;
  }

  /** Température (°C) d'un instant pour un type donné : saison, heure, écart du type. */
  static tempAt(t, type, c = this.calendar()) {
    const comp = this.components(t);
    const s = this.seasonAt(comp, c);
    const [lo, hi] = s?.temp ?? [5, 20];
    const base = lo + seeded(`${c?.id}:t:${this.dayIndex(t, c)}`) * (hi - lo);
    const { sunrise, sunset } = this.sunAt(comp, c);
    const hpd = c?.hoursPerDay ?? 24;
    /* Le plus chaud aux deux tiers du jour, le plus froid à l'opposé. */
    const peak = sunrise + (sunset - sunrise) * 0.65;
    const diurnal = Math.cos(((this.hourOf(t, c) - peak) / hpd) * 2 * Math.PI) * (hi - lo) / 4;
    return Math.round(base + diurnal + (type?.tempMod ?? 0));
  }

  /** La météo du moment : { type, temp, forced }. */
  static weatherAt(t = this.now(), c = this.calendar()) {
    const o = this.state().override;
    const forced = o && (o.until === null || t < o.until) ? this.weatherType(o.type) : null;
    const type = forced ?? (this.config().options.autoWeather ? this.rolledWeather(t, c) : this.weatherTypes()[0] ?? null);
    if (!type) return null;
    const temp = forced && o.temp !== null ? Math.round(o.temp) : this.tempAt(t, type, c);
    return { type, temp, forced: !!forced };
  }

  /** Prévision d'un jour (au milieu du jour) : { type, temp }. */
  static forecast(dayIdx, c = this.calendar()) {
    const t = dayIdx * this.secondsPerDay(c) + this.secondsPerDay(c) / 2;
    return this.weatherAt(t, c);
  }

  /* ---------------- Événements ---------------- */

  /** Les événements d'une date (composantes). */
  static eventsOn(comp, c = this.calendar()) {
    if (!c) return [];
    const y = this.yearShown(comp, c), m = comp.month + 1, d = comp.dayOfMonth + 1;
    return c.events.filter(e =>
      e.day === d && (e.repeat === "monthly" || e.month === m) && (e.repeat !== "once" || e.year === y))
      .filter(e => game.user.isGM || e.players)
      .sort((a, b) => (a.hour ?? -1) - (b.hour ?? -1) || a.name.localeCompare(b.name));
  }

  /* ---------------- Textes ---------------- */

  static pad(n) { return String(n).padStart(2, "0"); }

  static fmtTime(comp = this.components(), disp = this.display()) {
    const h = comp.hour ?? 0, m = comp.minute ?? 0;
    if (disp.hour === "12" && (this.calendar()?.hoursPerDay ?? 24) === 24) {
      const hh = h % 12 || 12;
      return `${hh}:${this.pad(m)} ${h < 12 ? "AM" : "PM"}`;
    }
    return `${this.pad(h)}:${this.pad(m)}`;
  }

  static fmtDate(comp = this.components(), disp = this.display(), c = this.calendar()) {
    const d = this.pad(comp.dayOfMonth + 1), m = this.pad(comp.month + 1), y = String(this.yearShown(comp, c));
    return disp.date === "mdy" ? `${m}/${d}/${y}` : disp.date === "ymd" ? `${y}-${m}-${d}` : `${d}/${m}/${y}`;
  }

  /** Date en toutes lettres ; `short` 1 : jour de la semaine abrégé, 2 : le mois aussi. */
  static fmtLongDate(comp = this.components(), disp = this.display(), c = this.calendar(), { short = 0 } = {}) {
    const day = c?.days[comp.dayOfWeek], month = c?.months[comp.month];
    const wd = (short >= 1 ? day?.abbr : "") || day?.name || "";
    const mo = (short >= 2 ? month?.abbr : "") || month?.name || "";
    const d = comp.dayOfMonth + 1, y = this.yearShown(comp, c);
    return disp.date === "mdy" ? `${wd}, ${mo} ${d} ${y}` : disp.date === "ymd" ? `${y} ${mo} ${d}, ${wd}` : `${wd} ${d} ${mo} ${y}`;
  }

  static fmtTemp(celsius, disp = this.display()) {
    if (celsius === null || celsius === undefined) return "—";
    return disp.temp === "f" ? `${Math.round(celsius * 9 / 5 + 32)} °F` : `${Math.round(celsius)} °C`;
  }

  static fmtHourDec(h) {
    const total = Math.round(h * 60);
    return `${this.pad(Math.floor(total / 60))}:${this.pad(total % 60)}`;
  }

  /* ============================================================ */
  /*  Instantané et suites d'un changement                         */
  /* ============================================================ */

  /** Tout ce qui se lit sur le moment présent (fenêtres, détection). */
  static snapshot(t = this.now()) {
    const c = this.calendar();
    const comp = this.components(t);
    const wx = this.weatherAt(t, c);
    const season = this.seasonAt(comp, c);
    return {
      t, comp, c, season, wx,
      day: this.dayIndex(t, c), hour: comp.hour, night: this.isNight(t, c), part: this.dayPart(t, c),
      sun: this.sunAt(comp, c), moons: this.moonsAt(this.dayIndex(t, c), c, t), events: this.eventsOn(comp, c)
    };
  }

  static #refresh() { Hooks.callAll("sbeCalendarChange", this.snapshot()); }

  /** Après un changement de temps, de réglage ou d'ordre de météo. */
  static #changed({ config = false }) {
    const snap = this.snapshot();
    if (isPrimaryGM()) {
      const prev = this.#last;
      if (prev) this.#fireMoments(prev, snap);
      const moonMoved = !prev || snap.moons.some(m => prev.moons?.find(x => x.id === m.id)?.phaseId !== m.phaseId);
      this.#applyScene(snap, { force: config || !prev || prev.wx?.type?.id !== snap.wx?.type?.id, effects: moonMoved, prev });
      this.#last = snap;
    }
    Hooks.callAll("sbeCalendarChange", snap);
  }

  /** Moments « Se lance tout seul » (MJ principal), pour tous les personnages. */
  static async #fireMoments(prev, snap) {
    const fired = [];
    if (prev.day !== snap.day) fired.push(["calDay", { eventName: this.fmtDate(snap.comp) }]);
    if (prev.hour !== snap.hour || prev.day !== snap.day) fired.push(["calHour", { eventName: String(snap.hour), eventValue: snap.hour }]);
    if (prev.night && !snap.night) fired.push(["calDawn", {}]);
    if (!prev.night && snap.night) fired.push(["calDusk", {}]);
    if (prev.wx?.type?.id !== snap.wx?.type?.id) fired.push(["calWeather", { eventName: snap.wx?.type?.key ?? "", eventValue: snap.wx?.temp ?? 0 }]);
    if (prev.season?.id !== snap.season?.id) fired.push(["calSeason", { eventName: snap.season?.key ?? "" }]);
    for (const m of snap.moons) {
      const before = prev.moons?.find(x => x.id === m.id);
      if (before && before.phaseId !== m.phaseId) fired.push(["calMoon", { eventName: m.phaseKey, eventSource: m.key }]);
    }
    const before = new Set(prev.events.map(e => e.id));
    for (const e of snap.events) if (!before.has(e.id)) fired.push(["calEvent", { eventName: e.name }]);
    if (!fired.length) return;
    const { ActionTriggers } = await import("../triggers/action-triggers.mjs");
    const { EffectManager } = await import("../effects/effect-manager.mjs");
    for (const a of EffectManager.allActors()) for (const [ev, data] of fired) ActionTriggers.fire(a, ev, data);
  }

  /** Scène active : effet météo de Foundry, obscurité, effets SBE sur les jetons (MJ principal). */
  static async #applyScene(snap, { force = false, effects = false, prev = null } = {}) {
    const scene = game.scenes?.active;
    const o = this.config().options;
    const indoor = !scene || !!scene.getFlag(SYSTEM_ID, "indoor");
    const type = snap.wx?.type ?? null;
    try {
      /* Scène intérieure : la météo posée par SBE s'en va. */
      if (scene && indoor && String(scene.weather ?? "").startsWith(FX_PREFIX)) await scene.update({ weather: "" });
      if (scene && !indoor) {
        const upd = {};
        const want = o.sceneWeather && type ? `${FX_PREFIX}${type.id}` : "";
        const cur = String(scene.weather ?? "");
        /* Option cochée : la météo du moment ; décochée : on retire seulement celle que SBE avait posée. */
        if (force && (o.sceneWeather ? cur !== want : cur.startsWith(FX_PREFIX))) upd.weather = want;
        if (o.sceneDarkness) {
          const dark = this.darknessAt(snap);
          if (Math.abs((scene.environment?.darknessLevel ?? 0) - dark) >= 0.02) upd["environment.darknessLevel"] = dark;
        }
        if (Object.keys(upd).length) await scene.update(upd);
      }
      if (force || effects) await this.#applyCalEffects(snap, prev, scene, indoor);
    } catch (err) { console.warn("SBE | Calendrier : scène non mise à jour", err); }
  }

  /** Obscurité (0..1) selon le soleil : nuit noire, jour clair, une heure de transition. */
  static darknessAt(snap = this.snapshot()) {
    const h = this.hourOf(snap.t, snap.c);
    const step = (snap.c?.hoursPerDay ?? 24) / 24;          /* une heure du calendrier */
    const { sunrise, sunset } = snap.sun;
    /* Fondu doux (pas de cassure) entre deux heures. */
    const smooth = (x) => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };
    /* L'aube éclaire déjà une heure avant le lever, la lumière est pleine
       une heure et demie après ; le crépuscule assombrit une heure et
       demie avant le coucher, la nuit est noire une heure après. */
    const dawnStart = sunrise - step, dawnEnd = sunrise + step * 1.5;
    const duskStart = sunset - step * 1.5, duskEnd = sunset + step;
    if (h >= dawnEnd && h <= duskStart) return 0;
    if (h > dawnStart && h < dawnEnd) return 1 - smooth((h - dawnStart) / (dawnEnd - dawnStart));
    if (h > duskStart && h < duskEnd) return smooth((h - duskStart) / (duskEnd - duskStart));
    return 1;
  }


  /**
   * Les effets SBE du moment : celui de la météo et ceux des phases de lune.
   * Posés sur les personnages des jetons de la scène active (hors intérieur) ;
   * ceux qui ne valent plus sont retirés partout.
   */
  static async #applyCalEffects(snap, prev, scene, indoor) {
    const { EffectManager } = await import("../effects/effect-manager.mjs");
    const keysOf = (sn) => [sn?.wx?.type?.effect, ...(sn?.moons ?? []).map(m => m.effect)].filter(Boolean);
    const keep = new Set(keysOf(snap));
    for (const k of new Set(keysOf(prev))) {
      if (keep.has(k)) continue;
      for (const { actor } of EffectManager.instancesOf(k)) await EffectManager.act(actor, k, "remove", { quiet: true });
    }
    if (!keep.size) return;
    if (indoor || !scene) {
      for (const k of keep) for (const { actor } of EffectManager.instancesOf(k)) await EffectManager.act(actor, k, "remove", { quiet: true });
      return;
    }
    const seen = new Set();
    for (const tok of scene.tokens?.contents ?? []) {
      const a = tok.actor;
      if (!a || a.type !== "personnage" || seen.has(a.uuid)) continue;
      seen.add(a.uuid);
      for (const k of keep) if (!EffectManager.findEffect(a, k)) await EffectManager.act(a, k, "apply", { quiet: true });
    }
  }


  /* ============================================================ */
  /*  Écritures du MJ                                              */
  /* ============================================================ */

  static async saveConfig(cfg) {
    this.#cfg = null;
    await game.settings.set(SYSTEM_ID, CAL_SETTING, cleanConfig(cfg));
  }

  static async setActive(id) {
    const cfg = this.config();
    if (!cfg.list.some(c => c.id === id)) return;
    cfg.active = id;
    await this.saveConfig(cfg);
  }

  /** Avancer (ou reculer) de N secondes. */
  static async advance(seconds) {
    if (!game.user.isGM) return;
    await game.time.advance(Math.round(seconds));
  }

  /** Régler l'instant : composantes partielles (année affichée, mois 1.., jour 1.., heure, minute). */
  static async setDate({ year, month, day, hour, minute } = {}) {
    if (!game.user.isGM) return;
    const c = this.calendar();
    const cur = this.components();
    const comp = {
      year: year === undefined ? cur.year : Number(year) - (c?.yearZero ?? 0),
      month: month === undefined ? cur.month : Math.max(0, Number(month) - 1),
      dayOfMonth: day === undefined ? cur.dayOfMonth : Math.max(0, Number(day) - 1),
      hour: hour === undefined ? cur.hour : Number(hour),
      minute: minute === undefined ? cur.minute : Number(minute),
      second: 0
    };
    const base = this.timeOf(comp.year, comp.month, comp.dayOfMonth, c);
    await game.time.set(base + comp.hour * this.secondsPerHour(c) + comp.minute * (c?.secondsPerMinute ?? 60));
  }

  /** Les réglages du calendrier (fenêtre du MJ). */
  static async openEditor() {
    if (!game.user.isGM) return;
    (await import("./calendar-editor.mjs")).SBECalendarEditor.open();
  }

  /** Imposer une météo (null = retour au tirage). `until` : secondes de jeu, null = jusqu'à nouvel ordre, "day" = jusqu'au lendemain. */
  static async setWeather(typeId, { temp = null, until = "day" } = {}) {
    if (!game.user.isGM) return;
    let u = until;
    if (until === "day") u = (this.dayIndex() + 1) * this.secondsPerDay();
    await this.#writeState({ override: typeId ? { type: typeId, temp, until: u } : null });
  }

  /** Imposer une saison (par sa clé ; null = retour à la date). `until` : secondes de jeu, null = jusqu'à nouvel ordre. */
  static async setSeason(key, { until = null } = {}) {
    if (!game.user.isGM) return;
    await this.#writeState({ season: key ? { key, until } : null });
  }

  /** L'état (météo et saison imposées) : on ne change que ce qui est donné. */
  static async #writeState(patch) {
    await game.settings.set(SYSTEM_ID, STATE_SETTING, { ...this.state(), ...patch });
  }

  /* ============================================================ */
  /*  Étapes d'action : Temps, Météo, Saison                       */
  /* ============================================================ */

  /**
   * Lancée par un objet ou un sort (nombres déjà calculés). Le MJ
   * principal l'exécute ; un joueur la lui envoie.
   *   { kind: "time", action, amount, unit, part, hour, minute, day, month, year, keepWeather }
   *   { kind: "weather", mode, key, amount, unit }   (amount 0 : sans fin)
   *   { kind: "season", mode, key, amount, unit }
   *   { kind: "moon", mode, moon, key, amount, unit }   (moon : clé de la lune ; key : clé de la phase)
   */
  static async runStep(step) {
    if (!this.enabled()) return;
    if (isPrimaryGM()) return this.#queued(step);
    requestGM({ type: "sbeCalStep", step });
  }

  /* Les étapes passent une à une : deux « +1 heure » lancés ensemble
     font bien deux heures (chacune part de l'heure déjà avancée). */
  static #queued(step) {
    return gmQueue("calendar:step", () => this.applyStep(step));
  }

  static #unitSeconds(unit, c = this.calendar()) {
    return { minute: c?.secondsPerMinute ?? 60, hour: this.secondsPerHour(c), day: this.secondsPerDay(c) }[unit] ?? this.secondsPerHour(c);
  }

  /** L'heure (décimale) d'un moment de la journée, le jour de l'instant t. */
  static #partHour(part, t, c = this.calendar()) {
    const { sunrise, sunset } = this.sunAt(this.components(t), c);
    return { dawn: sunrise, noon: (sunrise + sunset) / 2, dusk: sunset, midnight: 0 }[part] ?? 0;
  }

  /** Le prochain (dir 1) ou le précédent (dir -1) moment de la journée, à partir de t. */
  static #partTime(part, t, dir, c = this.calendar()) {
    const day = this.secondsPerDay(c), hour = this.secondsPerHour(c);
    for (let k = 0; k <= 2; k++) {
      const d = this.dayIndex(t, c) + dir * k;
      const at = Math.round(d * day + this.#partHour(part, d * day, c) * hour);
      if (dir > 0 ? at > t : at < t) return at;
    }
    return t;
  }

  static async applyStep(st = {}) {
    if (!game.user.isGM) return;
    const c = this.calendar();
    const now = this.now();
    const span = (n) => Math.max(0, Number(n) || 0) * this.#unitSeconds(st.unit, c);
    if (st.kind === "time") {
      if (!TIME_ACTIONS.includes(st.action)) return;
      let to = now;
      if (st.action === "advance") to = now + span(st.amount);
      else if (st.action === "back") to = now - span(st.amount);
      else if (st.action === "next" || st.action === "prev") to = this.#partTime(TIME_PARTS.includes(st.part) ? st.part : "dawn", now, st.action === "next" ? 1 : -1, c);
      else {
        const cur = this.components(now);
        const has = (v) => v !== undefined && v !== null && v !== "";
        const year = has(st.year) ? Number(st.year) - (c?.yearZero ?? 0) : cur.year;
        const month = has(st.month) ? Math.max(0, Number(st.month) - 1) : cur.month;
        const dom = has(st.day) ? Math.max(0, Number(st.day) - 1) : cur.dayOfMonth;
        to = this.timeOf(year, month, dom, c) + (has(st.hour) ? Number(st.hour) : cur.hour) * this.secondsPerHour(c)
          + (has(st.minute) ? Number(st.minute) : cur.minute) * (c?.secondsPerMinute ?? 60);
      }
      to = Math.round(to);
      if (to === now) return;
      /* « Garder la météo » : celle d'avant reste imposée jusqu'à la prochaine relève. */
      if (st.keepWeather) {
        const before = this.weatherAt(now, c);
        if (before?.type) {
          const every = Math.max(1, this.config().options.weatherEvery) * this.secondsPerHour(c);
          const relief = this.dayIndex(to, c) * this.secondsPerDay(c) + (this.slotOf(to, c).slot + 1) * every;
          await this.#writeState({ override: { type: before.type.id, temp: before.temp, until: relief } });
        }
      }
      await game.time.set(to);
      return;
    }
    const until = Number(st.amount) > 0 ? now + span(st.amount) : null;
    if (st.kind === "weather") {
      if (st.mode === "natural") return this.#writeState({ override: null });
      const type = this.weatherByKey(st.key);
      if (type) await this.#writeState({ override: { type: type.id, temp: null, until } });
      return;
    }
    if (st.kind === "season") {
      if (st.mode === "natural") return this.#writeState({ season: null });
      if (c?.seasons.some(s => s.key === st.key)) await this.#writeState({ season: { key: st.key, until } });
      return;
    }
    if (st.kind === "moon") {
      const moon = c?.moons.find(m => m.key === st.moon);
      if (!moon) return;
      const moons = { ...this.state().moons };
      if (st.mode === "natural") delete moons[moon.key];
      else if (moon.phases.some(p => p.key === st.key)) moons[moon.key] = { phase: st.key, until };
      else return;
      await this.#writeState({ moons });
    }
  }

  static async saveEvent(ev) {
    if (!game.user.isGM) return;
    const cfg = this.config();
    const c = cfg.list.find(x => x.id === cfg.active);
    if (!c) return;
    const e = cleanEvent(ev);
    const i = c.events.findIndex(x => x.id === e.id);
    if (i >= 0) c.events[i] = e; else c.events.push(e);
    await this.saveConfig(cfg);
  }

  static async deleteEvent(id) {
    if (!game.user.isGM) return;
    const cfg = this.config();
    const c = cfg.list.find(x => x.id === cfg.active);
    if (!c) return;
    c.events = c.events.filter(e => e.id !== id);
    await this.saveConfig(cfg);
  }

  /** Les préférences d'affichage de ce poste (partielles : ce que le joueur a changé). */
  static async setMyDisplay(patch) {
    const cur = game.settings.get(SYSTEM_ID, DISPLAY_SETTING) ?? {};
    await game.settings.set(SYSTEM_ID, DISPLAY_SETTING, { ...cur, ...patch });
  }
}
