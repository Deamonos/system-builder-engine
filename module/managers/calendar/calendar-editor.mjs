/**
 * SBE — CALENDRIER : la fenêtre de RÉGLAGE du MJ
 *
 * À gauche, ses calendriers (un seul actif, étoile). À droite, des
 * onglets : Général (nom, année zéro, longueur des heures et des
 * jours, années bissextiles), Mois, Jours de la semaine, Saisons (début,
 * températures, soleil, météos pondérées), Lunes ; puis, communs à tous
 * les calendriers : Météo (les types, avec un aperçu vivant) et
 * Affichage et options.
 *
 * Copie de travail : rien n'est écrit avant « Enregistrer ». Export /
 * import en JSON ({ sbe: "calendars" }).
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { cfTip } from "../../helpers/compact-form.mjs";
import { pickIcon } from "../../helpers/icon-picker.mjs";
import { CalendarManager as CM } from "./calendar-manager.mjs";
import { skyHtml, paintSky } from "./weather-sky.mjs";
import { foundryWeatherChoices } from "./scene-weather.mjs";
import {
  cleanConfig, cleanCalendar, cleanWeatherType, baseCalendar, baseWeatherTypes, groupWeather,
  WEATHER_LAYERS, WEATHER_COLORS, LAYER_COLORS, DATE_FORMATS, HOUR_FORMATS, TEMP_UNITS, SCENE_KINDS, SCENE_TWO_COLORS,
  SOUND_MODES, SOUND_LIBRARY, SOUND_DISTANCES, soundFiles, calSlug, cleanMoon, defaultMoonPhases, isProvided, BASE_MOON_ID, unmarkEdited
} from "./calendar-model.mjs";

const { ApplicationV2, DialogV2 } = foundry.applications.api;
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const TABS = ["general", "months", "days", "seasons", "moons", "weather", "display"];
const WORLD_TABS = ["weather", "display"];

export class SBECalendarEditor extends ApplicationV2 {

  static DEFAULT_OPTIONS = {
    id: "sbe-calendar-editor",
    tag: "div",
    classes: ["sbe-zone-editor", "sbe-calendar-editor", "sbe-condense"],
    window: { title: "SBE.Cal.EditorTitle", icon: "fa-solid fa-calendar-days", resizable: true },
    position: { width: 980, height: 760 }
  };

  _cfg = null;        /* copie de travail du réglage */
  _cur = null;        /* id du calendrier ouvert */
  _tab = "general";
  _wx = null;         /* id du type de météo ouvert */
  _indoor = null;     /* Set : scènes intérieures (drapeaux, écrits à l'enregistrement) */
  _preview = null;    /* son en écoute */

  static open() {
    const app = foundry.applications.instances.get("sbe-calendar-editor") ?? new SBECalendarEditor();
    return app.render({ force: true });
  }

  #cal() { return this._cfg.list.find(c => c.id === this._cur) ?? null; }
  #wx() { return this._cfg.weather.find(w => w.id === this._wx) ?? null; }

  /* ============================================================ */
  /*  Contenu                                                      */
  /* ============================================================ */

  async _renderHTML() {
    this._cfg ??= foundry.utils.deepClone(CM.config());
    this._indoor ??= new Set((game.scenes?.contents ?? []).filter(s => s.getFlag(SYSTEM_ID, "indoor")).map(s => s.id));
    if (!this._cfg.list.some(c => c.id === this._cur)) this._cur = this._cfg.active || this._cfg.list[0]?.id || null;
    if (!this._cfg.weather.some(w => w.id === this._wx)) this._wx = this._cfg.weather[0]?.id ?? null;
    const c = this.#cal();
    if (!c && !WORLD_TABS.includes(this._tab)) this._tab = "weather";

    const list = this._cfg.list.map(x => `
      <li class="${x.id === this._cur ? "active" : ""}" data-id="${esc(x.id)}">
        <i class="fa-solid ${x.id === this._cfg.active ? "fa-star" : "fa-calendar"}"></i> ${esc(x.name || L("SBE.Cal.Unnamed"))}
      </li>`).join("") || `<li class="sbe-zed-empty">${L("SBE.Cal.NoCalendar")}</li>`;

    const tabs = TABS.map(t => `<button type="button" class="sbe-cal-tab ${t === this._tab ? "on" : ""} ${WORLD_TABS.includes(t) ? "world" : ""}" data-tab="${t}" ${!c && !WORLD_TABS.includes(t) ? "disabled" : ""}>${L(`SBE.Cal.Tab_${t}`)}</button>`).join("");
    const body = this[`_tab_${this._tab}`](c);

    return `<div class="sbe-zed sbe-cal-ed">
      <aside class="sbe-zed-side">
        <ul class="sbe-zed-list">${list}</ul>
        <div class="sbe-zed-sidebtns">
          <button type="button" class="sbe-zed-new"><i class="fa-solid fa-plus"></i> ${L("SBE.Cal.NewCalendar")}</button>
          <button type="button" class="sbe-cal-newbase" data-tooltip="${esc(L("SBE.Cal.NewBaseHint"))}"><i class="fa-solid fa-wand-magic-sparkles"></i> ${L("SBE.Cal.NewBase")}</button>
          <button type="button" class="sbe-zed-dup" ${c ? "" : "disabled"}><i class="fa-solid fa-copy"></i> ${L("SBE.Cal.Duplicate")}</button>
          <button type="button" class="sbe-cal-activate" ${!c || c.id === this._cfg.active ? "disabled" : ""}><i class="fa-solid fa-star"></i> ${L("SBE.Cal.Activate")}</button>
          <button type="button" class="sbe-zed-del" ${c ? "" : "disabled"}><i class="fa-solid fa-trash"></i> ${L("SBE.Common.Delete")}</button>
        </div>
      </aside>
      <section class="sbe-zed-main">
        <nav class="sbe-cal-tabs">${tabs}</nav>
        <div class="sbe-cal-tabbody">${body}</div>
        <footer class="sbe-chatc-foot">
          <button type="button" class="sbe-zed-export"><i class="fa-solid fa-file-export"></i> ${L("SBE.Common.Export")}</button>
          <button type="button" class="sbe-zed-import"><i class="fa-solid fa-file-import"></i> ${L("SBE.Common.Import")}</button>
          <span class="sbe-chatc-spacer"></span>
          <button type="button" class="sbe-zed-save"><i class="fa-solid fa-floppy-disk"></i> ${L("SBE.Common.Save")}</button>
        </footer>
      </section>
    </div>`;
  }

  _replaceHTML(result, content) { content.innerHTML = result; }

  /* ---------- champs ---------- */

  #f(label, inner, { wide = false, tip = "" } = {}) {
    return `<label class="sbe-zed-f ${wide ? "sbe-cal-wide" : ""}"><span>${label}${tip ? cfTip(tip) : ""}</span>${inner}</label>`;
  }
  #num(o, f, v, { min, max, step = 1 } = {}) {
    return `<input type="number" data-o="${o}" data-f="${f}" value="${v ?? ""}" ${min !== undefined ? `min="${min}"` : ""} ${max !== undefined ? `max="${max}"` : ""} step="${step}">`;
  }
  /* `lock` : élément fourni par SBE — nom, icône et clé ne se changent pas. */
  #txt(o, f, v, ph = "", lock = false) {
    return `<input type="text" data-o="${o}" data-f="${f}" value="${esc(v)}" ${ph ? `placeholder="${esc(ph)}"` : ""} ${lock ? `disabled data-tooltip="${esc(L("SBE.Cal.ProvidedHint"))}"` : ""}>`;
  }
  #iconField(o, f, v, lock = false) {
    return `<span class="sbe-cal-iconf"><input type="text" data-o="${o}" data-f="${f}" value="${esc(v)}" ${lock ? "disabled" : ""}><button type="button" class="sbe-cal-pick" data-for="${o}|${f}" ${lock ? `disabled data-tooltip="${esc(L("SBE.Cal.ProvidedHint"))}"` : `data-tooltip="${esc(L("SBE.Cal.PickIcon"))}"`}><i class="fa-solid fa-icons"></i></button></span>`;
  }
  /** Repère d'un élément fourni (à côté de son nom). */
  #lockMark(id) { return isProvided(id) ? ` <i class="fa-solid fa-lock sbe-cal-lock" data-tooltip="${esc(L("SBE.Cal.ProvidedHint"))}"></i>` : ""; }
  #time(o, f, v) { return `<input type="text" class="sbe-cal-time" data-o="${o}" data-f="${f}" data-kind="time" value="${CM.fmtHourDec(v)}" placeholder="${esc(L("SBE.Ph.CalTime"))}">`; }
  #h3(key, tip = "") { return `<h3 class="sbe-bed-h">${L(key)}${tip ? cfTip(L(tip)) : ""}</h3>`; }

  /* ---------- onglets ---------- */

  _tab_general(c) {
    const days = c.days.map((d, i) => `<option value="${i}" ${c.firstWeekday === i ? "selected" : ""}>${esc(d.name)}</option>`).join("");
    return `${this.#h3("SBE.Cal.Tab_general", "SBE.Cal.GeneralHint")}
      <div class="sbe-zed-props sbe-cal-props">
        ${this.#f(L("SBE.Cal.Name"), this.#txt("cal", "name", c.name, L("SBE.Ph.CalName")), { wide: true })}
        ${this.#f(L("SBE.Cal.YearZero"), this.#num("cal", "yearZero", c.yearZero), { tip: L("SBE.Cal.YearZeroHint") })}
        ${this.#f(L("SBE.Cal.HoursPerDay"), this.#num("cal", "hoursPerDay", c.hoursPerDay, { min: 1 }))}
        ${this.#f(L("SBE.Cal.MinutesPerHour"), this.#num("cal", "minutesPerHour", c.minutesPerHour, { min: 1 }))}
        ${this.#f(L("SBE.Cal.SecondsPerMinute"), this.#num("cal", "secondsPerMinute", c.secondsPerMinute, { min: 1 }))}
        ${this.#f(L("SBE.Cal.FirstWeekday"), `<select data-o="cal" data-f="firstWeekday" data-kind="int">${days}</select>`, { tip: L("SBE.Cal.FirstWeekdayHint") })}
        ${this.#f(L("SBE.Cal.LeapEvery"), this.#num("cal", "leap.every", c.leap?.every ?? 0, { min: 0 }), { tip: L("SBE.Cal.LeapEveryHint") })}
        ${this.#f(L("SBE.Cal.LeapStart"), this.#num("cal", "leap.start", c.leap?.start ?? 0))}
      </div>
      <p class="sbe-cal-sum">${L("SBE.Cal.YearSummary", { days: c.months.reduce((t, m) => t + m.days, 0), months: c.months.length, week: c.days.length })}</p>`;
  }

  _tab_months(c) {
    const rows = c.months.map((m, i) => `
      <div class="sbe-cal-row" data-i="${i}">
        <b>${i + 1}</b>
        ${this.#txt(`m:${i}`, "name", m.name, L("SBE.Ph.CalMonth"))}
        ${this.#txt(`m:${i}`, "abbr", m.abbr, L("SBE.Ph.CalAbbr"))}
        ${this.#num(`m:${i}`, "days", m.days, { min: 1 })}
        <input type="number" data-o="m:${i}" data-f="leapDays" data-kind="intnull" value="${m.leapDays ?? ""}" min="1" placeholder="—">
        <span class="sbe-cal-rowbtns">
          <button type="button" data-act="up" data-list="months" data-i="${i}" ${i ? "" : "disabled"}><i class="fa-solid fa-arrow-up"></i></button>
          <button type="button" data-act="down" data-list="months" data-i="${i}" ${i < c.months.length - 1 ? "" : "disabled"}><i class="fa-solid fa-arrow-down"></i></button>
          <button type="button" data-act="del" data-list="months" data-i="${i}" ${c.months.length > 1 ? "" : "disabled"}><i class="fa-solid fa-trash"></i></button>
        </span>
      </div>`).join("");
    return `${this.#h3("SBE.Cal.Tab_months", "SBE.Cal.MonthsHint")}
      <div class="sbe-cal-table sbe-cal-months">
        <div class="sbe-cal-row sbe-cal-head"><span></span><b>${L("SBE.Cal.Name")}</b><b>${L("SBE.Cal.Abbr")}</b><b>${L("SBE.Cal.Days")}</b><b>${L("SBE.Cal.LeapDays")}</b><span></span></div>
        ${rows}
      </div>
      <button type="button" class="sbe-cal-addrow" data-act="add" data-list="months"><i class="fa-solid fa-plus"></i> ${L("SBE.Cal.AddMonth")}</button>`;
  }

  _tab_days(c) {
    const rows = c.days.map((d, i) => `
      <div class="sbe-cal-row" data-i="${i}">
        <b>${i + 1}</b>
        ${this.#txt(`d:${i}`, "name", d.name, L("SBE.Ph.CalDay"))}
        ${this.#txt(`d:${i}`, "abbr", d.abbr, L("SBE.Ph.CalAbbr"))}
        <span class="sbe-cal-rowbtns">
          <button type="button" data-act="up" data-list="days" data-i="${i}" ${i ? "" : "disabled"}><i class="fa-solid fa-arrow-up"></i></button>
          <button type="button" data-act="down" data-list="days" data-i="${i}" ${i < c.days.length - 1 ? "" : "disabled"}><i class="fa-solid fa-arrow-down"></i></button>
          <button type="button" data-act="del" data-list="days" data-i="${i}" ${c.days.length > 1 ? "" : "disabled"}><i class="fa-solid fa-trash"></i></button>
        </span>
      </div>`).join("");
    return `${this.#h3("SBE.Cal.Tab_days", "SBE.Cal.DaysHint")}
      <div class="sbe-cal-table sbe-cal-days">
        <div class="sbe-cal-row sbe-cal-head"><span></span><b>${L("SBE.Cal.Name")}</b><b>${L("SBE.Cal.Abbr")}</b><span></span></div>
        ${rows}
      </div>
      <button type="button" class="sbe-cal-addrow" data-act="add" data-list="days"><i class="fa-solid fa-plus"></i> ${L("SBE.Cal.AddDay")}</button>`;
  }

  _tab_seasons(c) {
    const types = this._cfg.weather;
    const months = (sel) => c.months.map((m, i) => `<option value="${i + 1}" ${sel === i + 1 ? "selected" : ""}>${esc(m.name)}</option>`).join("");
    const cards = c.seasons.map(s => {
      const o = `s:${s.id}`;
      const wrows = s.weather.map((w, i) => `
        <div class="sbe-cal-wrow">
          <select data-o="w:${s.id}:${i}" data-f="type">${types.map(t => `<option value="${esc(t.id)}" ${w.type === t.id ? "selected" : ""}>${esc(t.icon)} ${esc(t.name)}</option>`).join("")}</select>
          ${this.#num(`w:${s.id}:${i}`, "weight", w.weight, { min: 0, step: 0.5 })}
          <button type="button" data-act="wdel" data-season="${esc(s.id)}" data-i="${i}"><i class="fa-solid fa-xmark"></i></button>
        </div>`).join("");
      return `<details class="sbe-cal-card" open>
        <summary><span>${esc(s.icon)} ${esc(s.name || L("SBE.Cal.Unnamed"))}${this.#lockMark(s.id)}</span>
          <button type="button" class="sbe-cal-cardel" data-act="sdel" data-season="${esc(s.id)}" data-tooltip="${esc(L("SBE.Common.Delete"))}"><i class="fa-solid fa-trash"></i></button></summary>
        <div class="sbe-zed-props sbe-cal-props">
          ${this.#f(L("SBE.Cal.Name"), this.#txt(o, "name", s.name, L("SBE.Ph.CalSeason"), isProvided(s.id)))}
          ${this.#f(L("SBE.Cal.Key"), this.#txt(o, "key", s.key, calSlug(s.name), isProvided(s.id)), { tip: L("SBE.Cal.KeySeasonHint") })}
          ${this.#f(L("SBE.Cal.Icon"), this.#iconField(o, "icon", s.icon, isProvided(s.id)))}
          ${this.#f(L("SBE.Cal.StartsOn"), `<span class="sbe-cal-pair"><select data-o="${o}" data-f="month" data-kind="int">${months(s.month)}</select>${this.#num(o, "day", s.day, { min: 1 })}</span>`)}
          ${this.#f(L("SBE.Cal.TempRange"), `<span class="sbe-cal-pair">${this.#num(o, "temp.0", s.temp[0])}${this.#num(o, "temp.1", s.temp[1])}</span>`, { tip: L("SBE.Cal.TempRangeHint") })}
          ${this.#f(L("SBE.Cal.Sunrise"), this.#time(o, "sunrise", s.sunrise))}
          ${this.#f(L("SBE.Cal.Sunset"), this.#time(o, "sunset", s.sunset))}
        </div>
        <h4 class="sbe-cal-h4">${L("SBE.Cal.SeasonWeather")}${cfTip(L("SBE.Cal.SeasonWeatherHint"))}</h4>
        <div class="sbe-cal-wlist">${wrows || `<p class="sbe-cal-none">${L("SBE.Cal.NoSeasonWeather")}</p>`}</div>
        <button type="button" class="sbe-cal-addrow" data-act="wadd" data-season="${esc(s.id)}" ${types.length ? "" : "disabled"}><i class="fa-solid fa-plus"></i> ${L("SBE.Cal.AddWeather")}</button>
      </details>`;
    }).join("");
    return `${this.#h3("SBE.Cal.Tab_seasons", "SBE.Cal.SeasonsHint")}
      ${cards || `<p class="sbe-cal-none">${L("SBE.Cal.NoSeasons")}</p>`}
      <div class="sbe-cal-wxbtns">
        <button type="button" class="sbe-cal-addrow" data-act="sadd"><i class="fa-solid fa-plus"></i> ${L("SBE.Cal.AddSeason")}</button>
        <button type="button" class="sbe-cal-addrow" data-act="sbase" ${baseCalendar().seasons.every(b => c.seasons.some(x => x.id === b.id)) ? "disabled" : ""} data-tooltip="${esc(L("SBE.Cal.AddBaseSeasonsHint"))}"><i class="fa-solid fa-wand-magic-sparkles"></i> ${L("SBE.Cal.AddBaseSeasons")}</button>
      </div>`;
  }

  _tab_moons(c) {
    const effects = (sel) => `<option value="">—</option>${this.#effectOptions(sel)}`;
    const colorIn = (o, v) => `<span class="sbe-cal-colopt"><input type="color" data-o="${o}" data-f="color" value="${esc(v || "#d8d4c8")}">${v ? `<button type="button" data-act="colclear" data-o="${o}" data-tooltip="${esc(L("SBE.Cal.ColorClear"))}"><i class="fa-solid fa-xmark"></i></button>` : `<small>${L("SBE.Cal.ColorNone")}</small>`}</span>`;
    const cards = c.moons.map((m, mi) => {
      const o = `moon:${m.id}`;
      const normal = m.phases.filter(p => !p.replaces);
      const row = (p, pi) => {
        const po = `ph:${m.id}:${p.id}`;
        return `
        <div class="sbe-cal-phrow ${p.replaces ? "is-rare" : ""}">
          ${this.#iconField(po, "icon", p.icon, isProvided(p.id))}
          ${this.#txt(po, "name", p.name, L("SBE.Ph.CalPhase"), isProvided(p.id))}
          ${this.#txt(po, "key", p.key, calSlug(p.name), isProvided(p.id))}
          ${colorIn(po, p.color)}
          ${p.replaces
            ? `<span class="sbe-cal-rare">
                <select data-o="${po}" data-f="replaces" data-tooltip="${esc(L("SBE.Cal.PhaseReplacesHint"))}">${normal.map(n => `<option value="${esc(n.id)}" ${n.id === p.replaces ? "selected" : ""}>${esc(L("SBE.Cal.PhaseReplaces", { name: n.name }))}</option>`).join("")}</select>
                <label data-tooltip="${esc(L("SBE.Cal.PhaseEveryHint"))}">${L("SBE.Cal.PhaseEvery")} ${this.#num(po, "every", p.every, { min: 0 })}</label>
                <label data-tooltip="${esc(L("SBE.Cal.PhaseChanceHint"))}">${this.#num(po, "chance", p.chance, { min: 0, max: 100 })} %</label>
              </span>`
            : `<label class="sbe-cal-phlen" data-tooltip="${esc(L("SBE.Cal.PhaseLengthHint"))}">${this.#num(po, "length", p.length, { min: 0, step: 0.5 })}</label>`}
          <select data-o="${po}" data-f="effect" data-tooltip="${esc(L("SBE.Cal.PhaseEffectHint"))}">${effects(p.effect)}</select>
          <span class="sbe-cal-rowbtns">
            <button type="button" data-act="phup" data-moon="${esc(m.id)}" data-i="${pi}" ${pi ? "" : "disabled"}><i class="fa-solid fa-arrow-up"></i></button>
            <button type="button" data-act="phdel" data-moon="${esc(m.id)}" data-i="${pi}" ${!p.replaces && normal.length < 2 ? "disabled" : ""} data-tooltip="${esc(L("SBE.Common.Delete"))}"><i class="fa-solid fa-trash"></i></button>
          </span>
        </div>`;
      };
      return `<details class="sbe-cal-card" ${mi === 0 ? "open" : ""}>
        <summary><span>🌙 ${esc(m.name || L("SBE.Cal.Unnamed"))}${this.#lockMark(m.id)}</span>
          <button type="button" class="sbe-cal-cardel" data-act="del" data-list="moons" data-i="${mi}" data-tooltip="${esc(L("SBE.Common.Delete"))}"><i class="fa-solid fa-trash"></i></button></summary>
        <div class="sbe-zed-props sbe-cal-props">
          ${this.#f(L("SBE.Cal.Name"), this.#txt(o, "name", m.name, L("SBE.Ph.CalMoon"), isProvided(m.id)))}
          ${this.#f(L("SBE.Cal.Key"), this.#txt(o, "key", m.key, calSlug(m.name), isProvided(m.id)), { tip: L("SBE.Cal.KeyMoonHint") })}
          ${this.#f(L("SBE.Cal.MoonCycle"), this.#num(o, "cycle", m.cycle, { min: 1, step: 0.01 }), { tip: L("SBE.Cal.MoonCycleHint") })}
          ${this.#f(L("SBE.Cal.MoonOffset"), this.#num(o, "offset", m.offset, { step: 0.5 }), { tip: L("SBE.Cal.MoonOffsetHint") })}
          ${this.#f(L("SBE.Cal.MoonColor"), colorIn(o, m.color), { tip: L("SBE.Cal.MoonColorHint") })}
        </div>
        <h4 class="sbe-cal-h4">${L("SBE.Cal.Phases")}${cfTip(L("SBE.Cal.PhasesHint"))}</h4>
        <div class="sbe-cal-phlist">
          <div class="sbe-cal-phrow sbe-cal-head"><b>${L("SBE.Cal.Icon")}</b><b>${L("SBE.Cal.Name")}</b><b>${L("SBE.Cal.Key")}</b><b>${L("SBE.Cal.Color")}</b><b>${L("SBE.Cal.PhaseLength")}</b><b>${L("SBE.Cal.WxEffect")}</b><span></span></div>
          ${m.phases.map(row).join("")}
        </div>
        <div class="sbe-cal-wxbtns">
          <button type="button" class="sbe-cal-addrow" data-act="phadd" data-moon="${esc(m.id)}"><i class="fa-solid fa-plus"></i> ${L("SBE.Cal.AddPhase")}</button>
          <button type="button" class="sbe-cal-addrow" data-act="phrare" data-moon="${esc(m.id)}"><i class="fa-solid fa-star"></i> ${L("SBE.Cal.AddRarePhase")}</button>
          <button type="button" class="sbe-cal-addrow" data-act="phreset" data-moon="${esc(m.id)}"><i class="fa-solid fa-rotate-left"></i> ${L("SBE.Cal.ResetPhases")}</button>
        </div>
      </details>`;
    }).join("");
    return `${this.#h3("SBE.Cal.Tab_moons", "SBE.Cal.MoonsHint")}
      ${cards || `<p class="sbe-cal-none">${L("SBE.Cal.NoMoons")}</p>`}
      <div class="sbe-cal-wxbtns">
        <button type="button" class="sbe-cal-addrow" data-act="add" data-list="moons"><i class="fa-solid fa-plus"></i> ${L("SBE.Cal.AddMoon")}</button>
        <button type="button" class="sbe-cal-addrow" data-act="moonbase" ${c.moons.some(m => m.id === BASE_MOON_ID) ? "disabled" : ""} data-tooltip="${esc(L("SBE.Cal.AddBaseMoonHint"))}"><i class="fa-solid fa-wand-magic-sparkles"></i> ${L("SBE.Cal.AddBaseMoon")}</button>
      </div>`;
  }


  _tab_weather() {
    const w = this.#wx();
    const hidden = new Set(this._cfg.options?.wxMenuHidden ?? []);
    const list = groupWeather(this._cfg.weather).map(g => `<li class="sbe-cal-wxcat${hidden.has(g.cat) ? " is-off" : ""}"><span>${esc(g.name)}</span>
        <button type="button" data-act="wxcatvis" data-cat="${esc(g.cat)}" data-tooltip="${esc(L(hidden.has(g.cat) ? "SBE.Cal.CatMenuShow" : "SBE.Cal.CatMenuHide"))}"><i class="fa-solid ${hidden.has(g.cat) ? "fa-eye-slash" : "fa-eye"}"></i></button></li>`
      + g.types.map(t => `<li class="${t.id === this._wx ? "active" : ""}" data-wx="${esc(t.id)}"><span>${esc(t.icon)}</span> ${esc(t.name || L("SBE.Cal.Unnamed"))}${this.#lockMark(t.id)}</li>`).join("")).join("");
    const cats = [...new Set(this._cfg.weather.map(t => t.category).filter(Boolean))];
    let main = `<p class="sbe-cal-none">${L("SBE.Cal.NoWeatherTypes")}</p>`;
    if (w) {
      const o = "wx";
      const effects = this.#effectOptions(w.effect);
      const layers = WEATHER_LAYERS.map(l => `<label class="sbe-cal-layer"><input type="checkbox" data-layer="${l}" ${w.layers.includes(l) ? "checked" : ""}> ${L(`SBE.Cal.Layer_${l}`)}</label>`).join("");
      const colorKeys = [...new Set(w.layers.flatMap(l => LAYER_COLORS[l] ?? []))];
      const colors = colorKeys.map(k => this.#f(L(`SBE.Cal.Color_${k}`), `<input type="color" data-o="${o}" data-f="colors.${k}" value="${esc(w.colors[k] ?? WEATHER_COLORS[k])}">`)).join("");
      main = `
        ${skyHtml("ed")}
        <div class="sbe-zed-props sbe-cal-props">
          ${this.#f(L("SBE.Cal.Name"), this.#txt(o, "name", w.name, L("SBE.Ph.CalWeather"), isProvided(w.id)))}
          ${this.#f(L("SBE.Cal.Key"), this.#txt(o, "key", w.key, calSlug(w.name), isProvided(w.id)), { tip: L("SBE.Cal.KeyWeatherHint") })}
          ${this.#f(L("SBE.Cal.Category"), `<input type="text" data-o="${o}" data-f="category" list="sbe-cal-cats" value="${esc(w.category)}" placeholder="${esc(L("SBE.Ph.CalCategory"))}"><datalist id="sbe-cal-cats">${cats.map(c => `<option value="${esc(c)}">`).join("")}</datalist>`, { tip: L("SBE.Cal.CategoryHint") })}
          ${this.#f(L("SBE.Cal.Icon"), this.#iconField(o, "icon", w.icon, isProvided(w.id)))}
          ${this.#f(L("SBE.Cal.TempMod"), this.#num(o, "tempMod", w.tempMod), { tip: L("SBE.Cal.TempModHint") })}
          ${this.#f(L("SBE.Cal.WxEffect"), `<select data-o="${o}" data-f="effect"><option value="">—</option>${effects}</select>`, { tip: L("SBE.Cal.WxEffectHint") })}
        </div>
        <h4 class="sbe-cal-h4">${L("SBE.Cal.Sky")}${cfTip(L("SBE.Cal.SkyHint"))}</h4>
        <div class="sbe-zed-props sbe-cal-props">
          <label class="sbe-zed-f sbe-cal-check"><input type="checkbox" data-skyown ${w.sky ? "checked" : ""}> <span>${L("SBE.Cal.SkyOwn")}</span></label>
          ${w.sky ? `
            ${this.#f(L("SBE.Cal.SkyDay"), `<span class="sbe-cal-pair"><input type="color" data-o="${o}" data-f="sky.day.0" value="${esc(w.sky.day[0])}"><input type="color" data-o="${o}" data-f="sky.day.1" value="${esc(w.sky.day[1])}"></span>`)}
            ${this.#f(L("SBE.Cal.SkyNight"), `<span class="sbe-cal-pair"><input type="color" data-o="${o}" data-f="sky.night.0" value="${esc(w.sky.night[0])}"><input type="color" data-o="${o}" data-f="sky.night.1" value="${esc(w.sky.night[1])}"></span>`)}` : ""}
        </div>
        <h4 class="sbe-cal-h4">${L("SBE.Cal.Layers")}${cfTip(L("SBE.Cal.LayersHint"))}</h4>
        <div class="sbe-cal-layers">${layers}</div>
        ${colors ? `<div class="sbe-zed-props sbe-cal-props sbe-cal-colors">${colors}</div>` : ""}
        <h4 class="sbe-cal-h4">${L("SBE.Cal.SceneFx")}${cfTip(L("SBE.Cal.SceneFxHint"))}</h4>
        ${this.#sceneRows(w)}
        <h4 class="sbe-cal-h4">${L("SBE.Cal.Sounds")}${cfTip(L("SBE.Cal.SoundsHint"))}</h4>
        ${this.#soundRows(w)}
        <div class="sbe-cal-wxbtns">
          <button type="button" data-act="wxdup"><i class="fa-solid fa-copy"></i> ${L("SBE.Cal.Duplicate")}</button>
          <button type="button" data-act="wxdel"><i class="fa-solid fa-trash"></i> ${L("SBE.Common.Delete")}</button>
        </div>`;
    }
    return `${this.#h3("SBE.Cal.Tab_weather", "SBE.Cal.WeatherHint")}
      <div class="sbe-cal-wxwrap">
        <aside class="sbe-cal-wxaside">
          <ul class="sbe-zed-list sbe-cal-wxlist">${list}</ul>
          <button type="button" class="sbe-cal-addrow" data-act="wxadd"><i class="fa-solid fa-plus"></i> ${L("SBE.Cal.AddType")}</button>
          <button type="button" class="sbe-cal-addrow" data-act="wxbase" data-tooltip="${esc(L("SBE.Cal.AddBaseHint"))}"><i class="fa-solid fa-wand-magic-sparkles"></i> ${L("SBE.Cal.AddBase")}</button>
        </aside>
        <div class="sbe-cal-wxmain">${main}</div>
      </div>`;
  }

  _tab_display() {
    const d = this._cfg.display, o = this._cfg.options;
    const seg = (f, values, labels, cur, kind = "") => `<div class="sbe-cal-seg">${values.map((v, i) => `<button type="button" class="${String(cur) === String(v) ? "on" : ""}" data-seg="${f}" data-v="${v}" data-kind="${kind}">${labels[i]}</button>`).join("")}</div>`;
    const c = this.#cal() ?? this._cfg.list[0];
    const sample = (fmt) => (fmt === "mdy" ? "11/14/2026" : fmt === "ymd" ? "2026-11-14" : "14/11/2026");
    const weekLabels = [L("SBE.Cal.WeekStartCal"), ...(c?.days ?? []).map(x => x.name)];
    const weekValues = ["", ...(c?.days ?? []).map((_, i) => i)];
    const scenes = (game.scenes?.contents ?? []).map(s => `<label class="sbe-cal-layer"><input type="checkbox" data-indoor="${esc(s.id)}" ${this._indoor.has(s.id) ? "checked" : ""}> ${esc(s.name)}</label>`).join("");
    const check = (f, label, tip = "") => `<label class="sbe-zed-f sbe-cal-check sbe-cal-wide"><input type="checkbox" data-o="cfg" data-f="options.${f}" ${o[f] ? "checked" : ""}> <span>${label}${tip ? cfTip(tip) : ""}</span></label>`;
    return `${this.#h3("SBE.Cal.DisplayTitle", "SBE.Cal.DisplayHint")}
      <div class="sbe-zed-props sbe-cal-props">
        ${this.#f(L("SBE.Cal.DateFormat"), seg("display.date", DATE_FORMATS, DATE_FORMATS.map(sample), d.date))}
        ${this.#f(L("SBE.Cal.HourFormat"), seg("display.hour", HOUR_FORMATS, [L("SBE.Cal.H24"), L("SBE.Cal.H12")], d.hour))}
        ${this.#f(L("SBE.Cal.TempUnit"), seg("display.temp", TEMP_UNITS, ["°C", "°F"], d.temp))}
        ${this.#f(L("SBE.Cal.WeekStart"), seg("display.weekStart", weekValues, weekLabels, d.weekStart ?? "", "intnull"), { wide: true })}
      </div>
      ${this.#h3("SBE.Cal.OptionsTitle")}
      <div class="sbe-zed-props sbe-cal-props">
        ${check("players", L("SBE.Cal.OptPlayers"))}
        ${check("autoWeather", L("SBE.Cal.OptAutoWeather"), L("SBE.Cal.OptAutoWeatherHint"))}
        ${this.#f(L("SBE.Cal.WeatherEvery"), this.#num("cfg", "options.weatherEvery", o.weatherEvery, { min: 1 }))}
        ${check("sceneWeather", L("SBE.Cal.OptSceneWeather"), L("SBE.Cal.OptSceneWeatherHint"))}
        ${check("sceneDarkness", L("SBE.Cal.OptSceneDarkness"), L("SBE.Cal.OptSceneDarknessHint"))}
      </div>
      <h4 class="sbe-cal-h4">${L("SBE.Cal.IndoorScenes")}${cfTip(L("SBE.Cal.IndoorScenesHint"))}</h4>
      <div class="sbe-cal-layers">${scenes || `<p class="sbe-cal-none">—</p>`}</div>`;
  }

  /** Les couches de l'effet sur la scène d'un type : genre, couleur(s), quantité. */
  #sceneRows(w) {
    const fx = foundryWeatherChoices();
    const opts = (cur) => `<optgroup label="${esc(L("SBE.Cal.SceneGroupFoundry"))}">${Object.entries(fx).map(([id, label]) => `<option value="fx:${esc(id)}" ${cur === `fx:${id}` ? "selected" : ""}>${esc(label)}</option>`).join("")}</optgroup>`
      + `<optgroup label="${esc(L("SBE.Cal.SceneGroupSbe"))}">${SCENE_KINDS.map(k => `<option value="${k}" ${cur === k ? "selected" : ""}>${L(`SBE.Cal.Scene_${k}`)}</option>`).join("")}</optgroup>`;
    const rows = w.scene.map((l, i) => `
      <div class="sbe-cal-scrow">
        <select data-o="sc:${i}" data-f="kind" data-rerender="1">${opts(l.kind)}</select>
        <input type="color" data-o="sc:${i}" data-f="color" value="${esc(l.color)}" data-tooltip="${esc(L("SBE.Cal.SceneColor"))}">
        ${SCENE_TWO_COLORS.includes(l.kind) ? `<input type="color" data-o="sc:${i}" data-f="color2" value="${esc(l.color2)}" data-tooltip="${esc(L("SBE.Cal.SceneColor2"))}">` : "<span></span>"}
        <label class="sbe-cal-scamt"><span>${L("SBE.Cal.SceneAmount")}</span><input type="range" min="0.1" max="3" step="0.1" data-o="sc:${i}" data-f="amount" value="${l.amount}"><b>${l.amount}</b></label>
        <button type="button" data-act="scdel" data-i="${i}" data-tooltip="${esc(L("SBE.Common.Delete"))}"><i class="fa-solid fa-trash"></i></button>
      </div>`).join("");
    return `<div class="sbe-cal-sclist">${rows || `<p class="sbe-cal-none">${L("SBE.Cal.SceneNone")}</p>`}</div>
      <button type="button" class="sbe-cal-addrow" data-act="scadd"><i class="fa-solid fa-plus"></i> ${L("SBE.Cal.SceneAdd")}</button>`;
  }

  /** Les sons d'un type : bibliothèque ou fichier, mode, volume, intervalle (aléatoire). */
  #soundRows(w) {
    const lib = Object.keys(SOUND_LIBRARY);
    const opts = (cur) => `<optgroup label="${esc(L("SBE.Cal.SoundLibrary"))}">${lib.map(k => `<option value="lib:${k}" ${cur === `lib:${k}` ? "selected" : ""}>${esc(L(`SBE.Cal.Snd_${k}`))}</option>`).join("")}</optgroup>`
      + (cur.startsWith("lib:") ? "" : `<optgroup label="${esc(L("SBE.Cal.SoundFile"))}"><option value="${esc(cur)}" selected>${esc(cur.split("/").pop())}</option></optgroup>`);
    const rows = w.sounds.map((r, i) => `
      <div class="sbe-cal-sdrow">
        <select data-o="sd:${i}" data-f="src">${opts(r.src)}</select>
        <button type="button" data-act="sdfile" data-i="${i}" data-tooltip="${esc(L("SBE.Cal.SoundPick"))}"><i class="fa-solid fa-folder-open"></i></button>
        <select data-o="sd:${i}" data-f="mode" data-rerender="1">${SOUND_MODES.map(m => `<option value="${m}" ${r.mode === m ? "selected" : ""}>${L(`SBE.Cal.SndMode_${m}`)}</option>`).join("")}</select>
        <label class="sbe-cal-scamt"><span>${L("SBE.Cal.SoundVolume")}</span><input type="range" min="0" max="1" step="0.05" data-o="sd:${i}" data-f="volume" value="${r.volume}"><b>${Math.round(r.volume * 100)}%</b></label>
        ${r.mode === "random" ? `<span class="sbe-cal-sdgap" data-tooltip="${esc(L("SBE.Cal.SoundGapHint"))}"><input type="number" min="1" data-o="sd:${i}" data-f="min" value="${r.min}"> – <input type="number" min="1" data-o="sd:${i}" data-f="max" value="${r.max}"> s</span>`
          : r.mode === "flash" ? `<span class="sbe-cal-sdgap sbe-cal-sdfar">
            <select data-o="sd:${i}" data-f="dist" data-tooltip="${esc(L("SBE.Cal.SoundDistHint"))}">${SOUND_DISTANCES.map(x => `<option value="${x}" ${r.dist === x ? "selected" : ""}>${L(`SBE.Cal.SndDist_${x}`)}</option>`).join("")}</select>
            <input type="number" min="0" max="30" step="0.5" data-o="sd:${i}" data-f="delay" value="${r.delay}" data-tooltip="${esc(L("SBE.Cal.SoundDelayHint"))}"> s
            <input type="number" min="0" max="100" step="5" data-o="sd:${i}" data-f="fade" value="${r.fade}" data-tooltip="${esc(L("SBE.Cal.SoundFadeHint"))}"> %</span>` : "<span></span>"}
        <button type="button" data-act="sdplay" data-i="${i}" data-tooltip="${esc(L("SBE.Cal.SoundPlay"))}"><i class="fa-solid fa-play"></i></button>
        <button type="button" data-act="sddel" data-i="${i}" data-tooltip="${esc(L("SBE.Common.Delete"))}"><i class="fa-solid fa-trash"></i></button>
      </div>`).join("");
    return `<div class="sbe-cal-sclist">${rows || `<p class="sbe-cal-none">${L("SBE.Cal.SoundNone")}</p>`}</div>
      <button type="button" class="sbe-cal-addrow" data-act="sdadd"><i class="fa-solid fa-plus"></i> ${L("SBE.Cal.SoundAdd")}</button>`;
  }

  /** Écoute d'un son dans l'éditeur (un à la fois). */
  async #preview(r) {
    this._preview?.stop?.();
    this._preview = null;
    const files = soundFiles(r?.src);
    if (!files.length) return;
    try {
      this._preview = await game.audio.play(files[Math.floor(Math.random() * files.length)], { volume: r.volume, context: game.audio.environment });
    } catch (_e) { ui.notifications.warn(L("SBE.Cal.SoundBad")); }
  }

  async close(options) {
    this._preview?.stop?.();
    this._preview = null;
    return super.close(options);
  }

  #effectOptions(selected) {
    let defs = [];
    try { defs = game.settings.get(SYSTEM_ID, "effects") ?? []; } catch (_e) { /* pas d'effets */ }
    return (Array.isArray(defs) ? defs : []).filter(d => d?.key).map(d => `<option value="${esc(d.key)}" ${d.key === selected ? "selected" : ""}>${esc(d.label || d.key)}</option>`).join("");
  }

  /* ============================================================ */
  /*  Câblage                                                      */
  /* ============================================================ */

  #target(o) {
    const c = this.#cal();
    if (o === "cal") return c;
    if (o === "cfg") return this._cfg;
    if (o === "wx") return this.#wx();
    const [kind, a, b] = o.split(":");
    if (kind === "m") return c?.months[Number(a)];
    if (kind === "d") return c?.days[Number(a)];
    if (kind === "s") return c?.seasons.find(s => s.id === a);
    if (kind === "moon") return c?.moons.find(m => m.id === a);
    if (kind === "ph") return c?.moons.find(m => m.id === a)?.phases.find(p => p.id === b);
    if (kind === "w") return c?.seasons.find(s => s.id === a)?.weather[Number(b)];
    if (kind === "sc") return this.#wx()?.scene[Number(a)];
    if (kind === "sd") return this.#wx()?.sounds[Number(a)];
    return null;
  }

  #paintPreview() {
    const sky = this.element?.querySelector(".sbe-cal-wxmain .sbe-sky");
    const w = this.#wx();
    if (!sky || !w) return;
    const snap = CM.snapshot();
    paintSky(sky, { ...snap, wx: { type: cleanWeatherType(w), temp: 0 } }, { hour: CM.hourOf(snap.t, snap.c), hoursPerDay: snap.c?.hoursPerDay ?? 24 });
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element;
    const on = (sel, ev, fn) => root.querySelector(sel)?.addEventListener(ev, fn);
    this.#paintPreview();

    for (const li of root.querySelectorAll(".sbe-zed-side .sbe-zed-list li[data-id]")) li.addEventListener("click", () => { this._cur = li.dataset.id; this.render(); });
    for (const li of root.querySelectorAll(".sbe-cal-wxlist li[data-wx]")) li.addEventListener("click", () => { this._wx = li.dataset.wx; this.render(); });
    for (const b of root.querySelectorAll(".sbe-cal-tab[data-tab]")) b.addEventListener("click", () => { this._tab = b.dataset.tab; this.render(); });

    on(".sbe-zed-new", "click", () => {
      const c = cleanCalendar({ name: L("SBE.Cal.NewName", { n: this._cfg.list.length + 1 }), months: [{ name: L("SBE.Cal.Month.1"), days: 30 }], days: [1, 2, 3, 4, 5, 6, 7].map(i => ({ name: L(`SBE.Cal.Day.${i}`), abbr: L(`SBE.Cal.DayAbbr.${i}`) })) });
      this._cfg.list.push(c); this._cur = c.id; this._tab = "general"; this.render();
    });
    on(".sbe-cal-newbase", "click", () => {
      const c = baseCalendar(L("SBE.Cal.NewName", { n: this._cfg.list.length + 1 }));
      this._cfg.list.push(c); this._cur = c.id; this._tab = "general"; this.render();
    });
    on(".sbe-zed-dup", "click", () => {
      const c = this.#cal(); if (!c) return;
      const d = cleanCalendar({ ...foundry.utils.deepClone(c), id: "", name: `${c.name} (2)`, baseName: false });
      d.seasons.forEach(s => { s.id = foundry.utils.randomID(8); }); d.moons.forEach(m => { m.id = foundry.utils.randomID(8); }); d.events.forEach(e => { e.id = foundry.utils.randomID(8); });
      this._cfg.list.push(d); this._cur = d.id; this.render();
    });
    on(".sbe-cal-activate", "click", () => { if (this.#cal()) { this._cfg.active = this._cur; this.render(); } });
    on(".sbe-zed-del", "click", async () => {
      const c = this.#cal(); if (!c) return;
      const ok = await DialogV2.confirm({ window: { title: L("SBE.Common.Delete") }, content: `<p>${esc(L("SBE.Cal.DeleteConfirm", { name: c.name }))}</p>` });
      if (!ok) return;
      this._cfg.list = this._cfg.list.filter(x => x !== c);
      if (this._cfg.active === c.id) this._cfg.active = this._cfg.list[0]?.id ?? "";
      this._cur = null; this.render();
    });
    on(".sbe-zed-save", "click", () => this.#save());
    on(".sbe-zed-export", "click", () => this.#export());
    on(".sbe-zed-import", "click", () => this.#import());

    /* Champs : data-o (objet) + data-f (chemin). */
    for (const inp of root.querySelectorAll("[data-o][data-f]")) {
      inp.addEventListener("change", () => {
        const t = this.#target(inp.dataset.o);
        if (!t) return;
        let v;
        const kind = inp.dataset.kind ?? "";
        if (inp.type === "checkbox") v = inp.checked;
        else if (kind === "time") { const m = /^(\d{1,2})[:h](\d{1,2})?$/.exec(inp.value.trim()); v = m ? Number(m[1]) + Number(m[2] ?? 0) / 60 : Number(inp.value) || 0; }
        else if (kind === "intnull") v = inp.value === "" ? null : Math.round(Number(inp.value));
        else if (kind === "int") v = Math.round(Number(inp.value));
        else if (inp.type === "number" || inp.type === "range") v = Number(inp.value);
        else v = inp.value.trim();
        /* Une clé : minuscules, sans accents ni espaces (ce que lisent les formules). */
        if (inp.dataset.f === "key") { v = calSlug(v); inp.value = v; }
        if (inp.dataset.f === "leap.every" || inp.dataset.f === "leap.start") {
          t.leap ??= { start: 0, every: 0 };
          t.leap[inp.dataset.f.split(".")[1]] = v;
          if (!t.leap.every) t.leap = null;
          return;
        }
        foundry.utils.setProperty(t, inp.dataset.f, v);
        unmarkEdited(t, inp.dataset.f, v);
        if (inp.dataset.o === "wx") this.#paintPreview();
        if (["name", "icon", "firstWeekday", "category"].includes(inp.dataset.f) || inp.dataset.rerender) this.render();
      });
    }
    for (const r of root.querySelectorAll(".sbe-cal-scamt input[type=range]")) {
      const pct = r.dataset.f === "volume";
      r.addEventListener("input", () => { r.nextElementSibling.textContent = pct ? `${Math.round(Number(r.value) * 100)}%` : r.value; });
    }
    for (const b of root.querySelectorAll(".sbe-cal-pick[data-for]")) {
      b.addEventListener("click", async () => {
        const [o, f] = b.dataset.for.split("|");
        const ic = await pickIcon();
        const t = this.#target(o);
        if (ic && t) { foundry.utils.setProperty(t, f, ic); this.render(); }
      });
    }
    for (const b of root.querySelectorAll("[data-seg]")) {
      b.addEventListener("click", () => {
        const v = b.dataset.kind === "intnull" ? (b.dataset.v === "" ? null : Number(b.dataset.v)) : b.dataset.v;
        foundry.utils.setProperty(this._cfg, b.dataset.seg, v);
        this.render();
      });
    }
    for (const cb of root.querySelectorAll("[data-layer]")) {
      cb.addEventListener("change", () => {
        const w = this.#wx(); if (!w) return;
        w.layers = WEATHER_LAYERS.filter(l => root.querySelector(`[data-layer="${l}"]`)?.checked);
        this.render();
      });
    }
    on("[data-skyown]", "change", (ev) => {
      const w = this.#wx(); if (!w) return;
      w.sky = ev.target.checked ? { day: ["#3f6aa8", "#8fc1e8"], night: ["#03050f", "#1b2347"] } : null;
      this.render();
    });
    for (const cb of root.querySelectorAll("[data-indoor]")) {
      cb.addEventListener("change", () => { if (cb.checked) this._indoor.add(cb.dataset.indoor); else this._indoor.delete(cb.dataset.indoor); });
    }
    root.querySelector(".sbe-cal-tabbody")?.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-act]");
      if (b) this.#act(b);
    });
  }

  #act(b) {
    const c = this.#cal();
    const act = b.dataset.act;
    const list = b.dataset.list;
    const i = Number(b.dataset.i);
    switch (act) {
      case "add":
        if (list === "months") c.months.push({ name: L("SBE.Cal.NewMonth", { n: c.months.length + 1 }), abbr: "", days: 30, leapDays: null });
        if (list === "days") c.days.push({ name: L("SBE.Cal.NewDay", { n: c.days.length + 1 }), abbr: "" });
        if (list === "moons") c.moons.push(cleanMoon({ name: L("SBE.Cal.NewMoon", { n: c.moons.length + 1 }), cycle: 29.5, offset: 0 }));
        break;
      case "del": c[list].splice(i, 1); break;
      case "up": if (i > 0) c[list].splice(i - 1, 0, c[list].splice(i, 1)[0]); break;
      case "down": if (i < c[list].length - 1) c[list].splice(i + 1, 0, c[list].splice(i, 1)[0]); break;
      case "sadd": c.seasons.push({ id: foundry.utils.randomID(8), name: L("SBE.Cal.NewSeason", { n: c.seasons.length + 1 }), icon: "🌿", month: 1, day: 1, temp: [5, 20], sunrise: 6, sunset: 18, weather: [] }); break;
      case "sdel": c.seasons = c.seasons.filter(s => s.id !== b.dataset.season); break;
      /* Remise des éléments fournis supprimés. */
      case "sbase": for (const x of baseCalendar().seasons) if (!c.seasons.some(y => y.id === x.id)) c.seasons.push(x); break;
      case "moonbase": if (!c.moons.some(m => m.id === BASE_MOON_ID)) c.moons.push(baseCalendar().moons[0]); break;
      case "phadd": case "phrare": case "phup": case "phdel": case "phreset": {
        const m = c.moons.find(x => x.id === b.dataset.moon);
        if (!m) return;
        const normal = m.phases.filter(p => !p.replaces);
        if (act === "phadd") m.phases.push({ id: foundry.utils.randomID(8), name: L("SBE.Cal.NewPhase", { n: normal.length + 1 }), key: "", icon: "🌙", color: "", length: 1, effect: "", replaces: "", every: 0, chance: 0 });
        if (act === "phrare") {
          /* Par défaut, elle remplace la phase du milieu du cycle (la pleine lune des phases classiques). */
          const mid = normal[Math.floor(normal.length / 2)] ?? normal[0];
          m.phases.push({ id: foundry.utils.randomID(8), name: L("SBE.Cal.NewRarePhase"), key: "", icon: "🔴", color: "#c0392b", length: 1, effect: "", replaces: mid?.id ?? "", every: 0, chance: 10 });
        }
        if (act === "phup" && i > 0) m.phases.splice(i - 1, 0, m.phases.splice(i, 1)[0]);
        if (act === "phdel") {
          const gone = m.phases.splice(i, 1)[0];
          if (gone && !gone.replaces) m.phases = m.phases.filter(p => p.replaces !== gone.id);
        }
        if (act === "phreset") m.phases = defaultMoonPhases();
        break;
      }
      case "colclear": { const t = this.#target(b.dataset.o); if (t) t.color = ""; break; }
      case "wadd": { const s = c.seasons.find(x => x.id === b.dataset.season); if (s) s.weather.push({ type: this._cfg.weather[0]?.id ?? "", weight: 1 }); break; }
      case "wdel": { const s = c.seasons.find(x => x.id === b.dataset.season); if (s) s.weather.splice(i, 1); break; }
      case "wxadd": { const w = cleanWeatherType({ name: L("SBE.Cal.NewType", { n: this._cfg.weather.length + 1 }), layers: ["clouds"] }); this._cfg.weather.push(w); this._wx = w.id; break; }
      case "wxdup": { const w = this.#wx(); if (!w) return; const d = cleanWeatherType({ ...foundry.utils.deepClone(w), id: "", key: "", name: `${w.name} (2)` }); this._cfg.weather.push(d); this._wx = d.id; break; }
      case "scadd": { const w = this.#wx(); if (w) w.scene.push({ kind: "tint", color: "#20283a", color2: "#44ffd2", amount: 1 }); break; }
      case "scdel": { const w = this.#wx(); if (w) w.scene.splice(i, 1); break; }
      case "sdadd": { const w = this.#wx(); if (w) w.sounds.push({ src: `lib:${Object.keys(SOUND_LIBRARY)[0]}`, mode: "loop", volume: 0.5, min: 10, max: 30, dist: "all", delay: 4, fade: 60 }); break; }
      case "sddel": { const w = this.#wx(); if (w) w.sounds.splice(i, 1); break; }
      case "sdplay": this.#preview(this.#wx()?.sounds[i]); return;
      case "sdfile": {
        const r = this.#wx()?.sounds[i];
        if (!r) return;
        new foundry.applications.apps.FilePicker.implementation({
          type: "audio", current: r.src.startsWith("lib:") ? "" : r.src,
          callback: (path) => { r.src = path; this.render(); }
        }).render(true);
        return;
      }
      case "wxdel": { const w = this.#wx(); if (!w) return; this._cfg.weather = this._cfg.weather.filter(x => x !== w); this._wx = null; break; }
      /* Catégorie proposée ou non dans le menu de météo de l'horloge. */
      case "wxcatvis": {
        const o = this._cfg.options ??= {};
        const h = new Set(o.wxMenuHidden ?? []);
        if (h.has(b.dataset.cat)) h.delete(b.dataset.cat); else h.add(b.dataset.cat);
        o.wxMenuHidden = [...h];
        break;
      }
      case "wxbase": {
        const have = new Set(this._cfg.weather.map(w => w.id));
        for (const w of baseWeatherTypes()) if (!have.has(w.id)) this._cfg.weather.push(w);
        break;
      }
      default: return;
    }
    this.render();
  }

  /* ============================================================ */
  /*  Enregistrer, exporter, importer                              */
  /* ============================================================ */

  async #save() {
    const cfg = cleanConfig(this._cfg);
    const bad = cfg.list.find(c => !c.name);
    if (bad) { ui.notifications.warn(L("SBE.Cal.NeedName")); return; }
    /* Deux types (ou deux saisons d'un calendrier) ne partagent pas une clé. */
    const twice = (keys) => keys.find((k, i) => keys.indexOf(k) !== i);
    const dup = twice(cfg.weather.map(w => w.key))
      ?? cfg.list.map(c => twice(c.seasons.map(x => x.key)) ?? twice(c.moons.map(m => m.key))
        ?? c.moons.map(m => twice(m.phases.map(p => p.key))).find(Boolean)).find(Boolean);
    if (dup) { ui.notifications.warn(L("SBE.Cal.KeyTwice", { key: dup })); return; }
    const before = CM.config();
    await CM.saveConfig(cfg);
    await this.#renameKeys(before, cleanConfig(cfg));
    /* Scènes intérieures : un drapeau sur la scène. */
    for (const s of game.scenes?.contents ?? []) {
      const want = this._indoor.has(s.id), has = !!s.getFlag(SYSTEM_ID, "indoor");
      if (want !== has) await (want ? s.setFlag(SYSTEM_ID, "indoor", true) : s.unsetFlag(SYSTEM_ID, "indoor"));
    }
    this._cfg = null;
    ui.notifications.info(L("SBE.Cal.Saved"));
    this.render();
  }

  /**
   * Une clé changée (même type, même saison) : les étapes d'action qui
   * lisaient l'ancienne suivent. Saisons : celles du calendrier en service
   * (celui que lisent les étapes).
   */
  async #renameKeys(before, after) {
    const pairs = [];
    for (const w of after.weather) {
      const old = before.weather.find(x => x.id === w.id)?.key;
      if (old && old !== w.key) pairs.push([old, w.key, "calWeather"]);
    }
    const cal = (cfg) => cfg.list.find(c => c.id === cfg.active);
    const was = cal(before), now = cal(after);
    if (was && now && was.id === now.id) {
      for (const x of now.seasons) {
        const old = was.seasons.find(y => y.id === x.id)?.key;
        if (old && old !== x.key) pairs.push([old, x.key, "calSeason"]);
      }
      for (const m of now.moons) {
        const before = was.moons.find(y => y.id === m.id);
        if (!before) continue;
        if (before.key !== m.key) pairs.push([before.key, m.key, "calMoon"]);
        for (const p of m.phases) {
          const old = before.phases.find(y => y.id === p.id)?.key;
          if (old && old !== p.key) pairs.push([old, p.key, "calMoonPhase"]);
        }
      }
    }
    if (!pairs.length) return;
    const { rename } = await import("../checker/ref-engine.mjs");
    let changed = 0;
    for (const [old, nw, fam] of pairs) changed += (await rename(old, nw, fam, [])).changed;
    if (changed) ui.notifications.info(L("SBE.Cal.KeysRenamed", { n: changed }));
  }

  #export() {
    const cfg = cleanConfig(this._cfg);
    foundry.utils.saveDataToFile(JSON.stringify({ sbe: "calendars", format: 1, ...cfg }, null, 2), "application/json", "sbe-calendriers.json");
  }

  #import() {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".json,application/json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const json = JSON.parse(await file.text());
        if (json?.sbe !== "calendars") throw new Error("format");
        const inc = cleanConfig(json);
        /* Fusion par id : ce qui arrive remplace ce qui porte le même id. */
        for (const c of inc.list) { const i = this._cfg.list.findIndex(x => x.id === c.id); if (i >= 0) this._cfg.list[i] = c; else this._cfg.list.push(c); }
        for (const w of inc.weather) { const i = this._cfg.weather.findIndex(x => x.id === w.id); if (i >= 0) this._cfg.weather[i] = w; else this._cfg.weather.push(w); }
        this._cfg.display = inc.display; this._cfg.options = inc.options;
        if (inc.active) this._cfg.active = inc.active;
        ui.notifications.info(L("SBE.Cal.ImportDone", { n: inc.list.length }));
        this.render();
      } catch (_e) { ui.notifications.error(L("SBE.Cal.ImportBad")); }
    });
    input.click();
  }
}
