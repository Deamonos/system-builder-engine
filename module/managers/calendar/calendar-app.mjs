/**
 * SBE — LE CALENDRIER (fenêtre)
 *
 * Le mois en grille : chaque jour montre sa météo prévue (MJ ; les
 * joueurs voient celle du jour) et ses événements. Un clic sur un jour
 * ouvre sa fiche : date, météo et température, lunes, lever et coucher
 * du soleil, événements. Version compacte (⇄) : un petit mois avec des
 * points pour les événements.
 *
 * MJ : « + Événement », modifier, supprimer. Un événement a un nom, une
 * icône, une couleur, une date (une fois, chaque année, chaque mois),
 * une heure facultative, une note, « visible des joueurs », et un lien
 * vers un document (une quête, un journal…) déposé dessus.
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { CalendarManager as CM } from "./calendar-manager.mjs";
import { EVENT_REPEATS } from "./calendar-model.mjs";
import { pickIcon } from "../../helpers/icon-picker.mjs";

const { ApplicationV2, DialogV2 } = foundry.applications.api;
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

export class SBECalendarApp extends ApplicationV2 {

  static DEFAULT_OPTIONS = {
    id: "sbe-calendar",
    tag: "div",
    classes: ["sbe-calendar-app"],
    window: { title: "SBE.Cal.Title", icon: "fa-solid fa-calendar-days", resizable: true, minimizable: true },
    position: { width: 760, height: "auto", top: 90, left: 200 }
  };

  static instance = null;
  _view = null;     /* { year, month } affichés (année depuis zéro, mois 0..) */
  _sel = null;      /* jour du mois choisi (0..) */

  /* ------------------------------------------------------------ */
  /*  Ouverture                                                    */
  /* ------------------------------------------------------------ */

  static isOpen() { return !!this.instance?.rendered; }

  static async toggle(force) {
    const open = force ?? !this.isOpen();
    if (open && !CM.canSee()) return;
    if (open) {
      this.instance ??= new SBECalendarApp();
      const pos = game.settings.get(SYSTEM_ID, "calendarPos");
      await this.instance.render({ force: true, position: pos?.left !== undefined ? pos : undefined });
    } else if (this.instance?.rendered) await this.instance.close({ sbeKeep: true });
    this.syncButton(open);
  }

  static syncButton(open) {
    const tool = ui.controls?.controls?.tokens?.tools?.sbeCalendar;
    if (tool) tool.active = open;
    ui.controls?.render?.();
  }

  static refresh() { if (this.isOpen()) this.instance.render(); }

  /* ------------------------------------------------------------ */
  /*  Contenu                                                      */
  /* ------------------------------------------------------------ */

  #today() { return CM.components(); }

  /** Les jours du mois affiché : { dom, t, comp, today, past, events, wx }. */
  #days(c) {
    const { year, month } = this._view;
    const n = CM.monthDays(month, year, c);
    const now = CM.now();
    const today = this.#today();
    const out = [];
    for (let d = 0; d < n; d++) {
      const t = CM.timeOf(year, month, d, c);
      const comp = CM.components(t);
      const isToday = today.year === year && today.month === month && today.dayOfMonth === d;
      out.push({
        dom: d, t, comp, today: isToday, past: t + CM.secondsPerDay(c) <= now,
        events: CM.eventsOn(comp, c),
        wx: game.user.isGM || isToday ? CM.forecast(CM.dayIndex(t, c), c) : null
      });
    }
    return out;
  }

  async _renderHTML() {
    const c = CM.calendar();
    if (!c) return `<p class="sbe-cal-empty">${L("SBE.Cal.NoCalendar")}</p>`;
    const today = this.#today();
    if (!this._view || this._view.month >= c.months.length) this._view = { year: today.year, month: today.month };
    const disp = CM.display();
    const mini = game.settings.get(SYSTEM_ID, "calendarMini");
    const isGM = game.user.isGM;
    const days = this.#days(c);
    if (this._sel === null || this._sel >= days.length) this._sel = days.find(d => d.today)?.dom ?? 0;
    const sel = days[this._sel] ?? days[0];

    /* Semaine : premier jour selon la préférence, sinon l'ordre du calendrier. */
    const nDays = c.days.length;
    const start = disp.weekStart === null ? 0 : disp.weekStart % nDays;
    const heads = Array.from({ length: nDays }, (_, i) => c.days[(start + i) % nDays]);
    const lead = ((days[0].comp.dayOfWeek - start) % nDays + nDays) % nDays;
    const headHtml = heads.map(d => `<span class="sbe-cal-dh" title="${esc(d.name)}">${esc(d.abbr || d.name.slice(0, 3))}</span>`).join("");
    const lead1 = Array.from({ length: lead }, () => `<span class="sbe-cal-cd off"></span>`).join("");

    const chip = (e) => `<span class="sbe-cal-ev" style="--ec:${esc(e.color)}" title="${esc(e.name)}">${esc(e.icon)} ${esc(e.name)}</span>`;
    const cells = days.map(d => `
      <button type="button" class="sbe-cal-cd ${d.today ? "today" : ""} ${d.past ? "past" : ""} ${d.dom === sel.dom ? "sel" : ""}" data-dom="${d.dom}">
        <span class="sbe-cal-top"><b>${d.dom + 1}</b><i title="${esc(d.wx?.type?.name ?? "")}">${esc(d.wx?.type?.icon ?? "")}</i></span>
        ${d.events.slice(0, 2).map(chip).join("")}${d.events.length > 2 ? `<small class="sbe-cal-more">+${d.events.length - 2}</small>` : ""}
      </button>`).join("");
    const miniCells = days.map(d => `
      <button type="button" class="sbe-cal-cd ${d.today ? "today" : ""} ${d.past ? "past" : ""} ${d.dom === sel.dom ? "sel" : ""}" data-dom="${d.dom}">
        <b>${d.dom + 1}</b>${d.events.length ? `<em style="--ec:${esc(d.events[0].color)}"></em>` : ""}</button>`).join("");

    /* En-tête : saison et prochaine pleine lune du mois. */
    const season = CM.seasonAt(days[Math.min(14, days.length - 1)].comp, c);
    /* La prochaine lune pleine du mois (première lune : le milieu de son cycle). */
    const lit = (d) => CM.moonsAt(CM.dayIndex(d.t, c), c)[0];
    const fullDay = days.find((d, i) => {
      if (d.t < CM.now() || !c.moons.length) return false;
      const m = lit(d), b = i ? lit(days[i - 1]) : CM.moonsAt(CM.dayIndex(d.t, c) - 1, c)[0];
      return m && b && b.frac < 0.5 && m.frac >= 0.5;
    });
    const full = fullDay ? { dom: fullDay.dom, moon: lit(fullDay) } : null;
    const heroBits = [];
    if (season) heroBits.push(`${season.icon ? season.icon + " " : ""}${esc(season.name)}`);
    if (full) heroBits.push(`${esc(full.moon.icon)} ${L("SBE.Cal.FullMoonOn", { day: full.dom + 1 })}`);

    /* Fiche du jour choisi. */
    const moons = CM.moonsAt(CM.dayIndex(sel.t, c), c);
    const sun = CM.sunAt(sel.comp, c);
    const evHtml = sel.events.length ? sel.events.map(e => `
      <div class="sbe-cal-evrow" style="--ec:${esc(e.color)}">
        <b>${esc(e.icon)} ${esc(e.name)}</b>
        <small>${e.hour === null ? L("SBE.Cal.AllDay") : `${CM.pad(e.hour)}:${CM.pad(e.minute)}`}${e.repeat !== "once" ? ` · ${L(`SBE.Cal.Repeat_${e.repeat}`)}` : ""}${isGM && !e.players ? ` · ${L("SBE.Cal.GmOnly")}` : ""}</small>
        ${e.note ? `<p>${esc(e.note)}</p>` : ""}
        <span class="sbe-cal-evact">
          ${e.link ? `<button type="button" data-act="open" data-uuid="${esc(e.link)}" data-tooltip="${esc(L("SBE.Cal.OpenLink"))}"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>` : ""}
          ${isGM ? `<button type="button" data-act="edit" data-id="${esc(e.id)}" data-tooltip="${esc(L("SBE.Cal.EditEvent"))}"><i class="fa-solid fa-pen"></i></button>
          <button type="button" data-act="del" data-id="${esc(e.id)}" data-tooltip="${esc(L("SBE.Common.Delete"))}"><i class="fa-solid fa-trash"></i></button>` : ""}
        </span>
      </div>`).join("") : `<p class="sbe-cal-none">${L("SBE.Cal.NoEvent")}</p>`;
    const panel = `
      <aside class="sbe-cal-day">
        <div class="sbe-cal-dayhead"><b>${sel.dom + 1}</b><div><span>${esc(c.days[sel.comp.dayOfWeek]?.name ?? "")}</span><small>${esc(CM.fmtDate(sel.comp, disp, c))}</small></div></div>
        <div class="sbe-cal-facts">
          ${sel.wx ? `<span>${esc(sel.wx.type.icon)} ${esc(sel.wx.type.name)} <b>${esc(CM.fmtTemp(sel.wx.temp, disp))}</b></span>` : ""}
          ${moons.map(m => `<span${m.color ? ` style="color:${esc(m.color)}"` : ""}>${esc(m.icon)} ${moons.length > 1 ? esc(m.name) + " · " : ""}${esc(m.phaseName)}</span>`).join("")}
          <span>🌅 ${CM.fmtHourDec(sun.sunrise)}</span><span>🌇 ${CM.fmtHourDec(sun.sunset)}</span>
        </div>
        <div class="sbe-cal-list">${evHtml}</div>
        ${isGM ? `<button type="button" class="sbe-cal-add" data-act="add"><i class="fa-solid fa-plus"></i> ${L("SBE.Cal.AddEvent")}</button>` : ""}
      </aside>`;

    const monthName = c.months[this._view.month]?.name ?? "";
    const yearShown = this._view.year + c.yearZero;
    const nav = `<div class="sbe-cal-nav">
        <button type="button" data-act="py" data-tooltip="${esc(L("SBE.Cal.PrevYear"))}">«</button><button type="button" data-act="pm" data-tooltip="${esc(L("SBE.Cal.PrevMonth"))}">‹</button>
        <button type="button" class="sbe-cal-today" data-act="today">${L("SBE.Cal.Today")}</button>
        <button type="button" data-act="nm" data-tooltip="${esc(L("SBE.Cal.NextMonth"))}">›</button><button type="button" data-act="ny" data-tooltip="${esc(L("SBE.Cal.NextYear"))}">»</button>
        ${isGM ? `<button type="button" data-act="settings" data-tooltip="${esc(L("SBE.Cal.MenuLabel"))}"><i class="fa-solid fa-gear"></i></button>` : ""}</div>`;
    const todayWx = CM.weatherAt();
    return `<div class="sbe-cal ${mini ? "is-mini" : ""}">
      <div class="sbe-cal-full">
        <div class="sbe-cal-hero"><div><span class="sbe-cal-year">${yearShown}</span><h3>${esc(monthName)}</h3><small>${heroBits.join(" · ")}</small></div>${nav}</div>
        <div class="sbe-cal-body">
          <div class="sbe-cal-grid" style="--n:${nDays}">${headHtml}${lead1}${cells}</div>
          ${panel}
        </div>
      </div>
      <div class="sbe-cal-mini">
        <div class="sbe-cal-mh"><button type="button" data-act="pm">‹</button><div><b>${esc(monthName)}</b><small>${yearShown}</small></div><button type="button" data-act="nm">›</button></div>
        <div class="sbe-cal-grid sbe-cal-grid-mini" style="--n:${nDays}">${headHtml}${lead1}${miniCells}</div>
        <div class="sbe-cal-mfoot">${todayWx ? `${esc(todayWx.type.icon)} ${esc(CM.fmtTemp(todayWx.temp, disp))} · ` : ""}${esc(CM.fmtDate(today, disp, c))}</div>
      </div>
      <button type="button" class="sbe-ck-toggle" data-act="toggle" data-tooltip="${esc(L("SBE.Cal.ToggleSize"))}">⇄</button>
    </div>`;
  }

  _replaceHTML(result, content) { content.innerHTML = result; }

  /* ------------------------------------------------------------ */
  /*  Câblage                                                      */
  /* ------------------------------------------------------------ */

  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element;
    if (!this._hook) this._hook = Hooks.on("sbeCalendarChange", () => { if (this.rendered) this.render(); });
    /* L'élément de la fenêtre survit aux rendus : un seul écouteur. */
    if (this._wired) return;
    this._wired = true;
    root.addEventListener("click", (ev) => {
      const cd = ev.target.closest(".sbe-cal-cd[data-dom]");
      if (cd) { this._sel = Number(cd.dataset.dom); this.render(); return; }
      const btn = ev.target.closest("[data-act]");
      if (btn) this.#act(btn.dataset.act, btn);
    });
  }

  #move(dm, dy = 0) {
    const c = CM.calendar();
    let { year, month } = this._view;
    year += dy; month += dm;
    while (month < 0) { month += c.months.length; year--; }
    while (month >= c.months.length) { month -= c.months.length; year++; }
    this._view = { year, month };
    this._sel = 0;
    this.render();
  }

  async #act(act, btn) {
    switch (act) {
      case "toggle": {
        const mini = !game.settings.get(SYSTEM_ID, "calendarMini");
        await game.settings.set(SYSTEM_ID, "calendarMini", mini);
        this.element.querySelector(".sbe-cal")?.classList.toggle("is-mini", mini);
        this.setPosition({ width: mini ? 260 : 760, height: "auto" });
        return;
      }
      case "pm": return this.#move(-1);
      case "nm": return this.#move(1);
      case "py": return this.#move(0, -1);
      case "ny": return this.#move(0, 1);
      case "settings": return CM.openEditor();
      case "today": { const t = this.#today(); this._view = { year: t.year, month: t.month }; this._sel = t.dayOfMonth; return this.render(); }
      case "open": { const doc = await fromUuid(btn.dataset.uuid); return doc?.sheet?.render(true) ?? ui.notifications.warn(L("SBE.Cal.LinkGone")); }
      case "add": return this.#editEvent(null);
      case "edit": return this.#editEvent(CM.calendar()?.events.find(e => e.id === btn.dataset.id) ?? null);
      case "del": {
        const e = CM.calendar()?.events.find(x => x.id === btn.dataset.id);
        if (!e) return;
        const ok = await DialogV2.confirm({ window: { title: L("SBE.Cal.DeleteEvent") }, content: `<p>${esc(L("SBE.Cal.DeleteEventConfirm", { name: e.name }))}</p>` });
        if (ok) await CM.deleteEvent(e.id);
        return;
      }
      default:
    }
  }

  /** Créer ou modifier un événement (MJ). */
  async #editEvent(ev) {
    const c = CM.calendar();
    if (!c) return;
    const sel = this.#days(c)[this._sel] ?? null;
    const e = ev ?? { id: "", name: "", icon: "📌", color: "#c9a227", repeat: "once", year: this._view.year + c.yearZero, month: this._view.month + 1, day: (sel?.dom ?? 0) + 1, hour: null, minute: 0, note: "", players: true, link: "" };
    const months = c.months.map((m, i) => `<option value="${i + 1}" ${i + 1 === e.month ? "selected" : ""}>${esc(m.name)}</option>`).join("");
    const content = `<div class="sbe-cal-evform sbe-condense">
      <label class="wide"><span>${L("SBE.Cal.EvName")}</span><input type="text" name="name" value="${esc(e.name)}" placeholder="${esc(L("SBE.Ph.CalEvent"))}" required></label>
      <label><span>${L("SBE.Cal.EvIcon")}</span><span class="sbe-cal-iconf"><input type="text" name="icon" value="${esc(e.icon)}"><button type="button" class="sbe-cal-pick" data-tooltip="${esc(L("SBE.Cal.PickIcon"))}"><i class="fa-solid fa-icons"></i></button></span></label>
      <label><span>${L("SBE.Cal.EvColor")}</span><input type="color" name="color" value="${esc(e.color)}"></label>
      <label><span>${L("SBE.Cal.EvRepeat")}</span><select name="repeat">${EVENT_REPEATS.map(r => `<option value="${r}" ${e.repeat === r ? "selected" : ""}>${L(`SBE.Cal.Repeat_${r}`)}</option>`).join("")}</select></label>
      <label><span>${L("SBE.Cal.Year")}</span><input type="number" name="year" value="${e.year}"></label>
      <label><span>${L("SBE.Cal.MonthL")}</span><select name="month">${months}</select></label>
      <label><span>${L("SBE.Cal.DayL")}</span><input type="number" name="day" min="1" value="${e.day}"></label>
      <label><span>${L("SBE.Cal.EvHour")}</span><input type="text" name="time" value="${e.hour === null ? "" : `${CM.pad(e.hour)}:${CM.pad(e.minute)}`}" placeholder="${esc(L("SBE.Ph.CalTime"))}"></label>
      <label class="wide"><span>${L("SBE.Cal.EvNote")}</span><textarea name="note" rows="2">${esc(e.note)}</textarea></label>
      <label class="wide"><span>${L("SBE.Cal.EvLink")}</span><input type="text" name="link" class="sbe-cal-link" value="${esc(e.link)}" placeholder="${esc(L("SBE.Cal.EvLinkPh"))}"></label>
      <label class="wide sbe-cal-check"><input type="checkbox" name="players" ${e.players ? "checked" : ""}> <span>${L("SBE.Cal.EvPlayers")}</span></label>
    </div>`;
    const res = await DialogV2.wait({
      window: { title: ev ? L("SBE.Cal.EditEvent") : L("SBE.Cal.AddEvent") }, content, rejectClose: false,
      buttons: [
        { action: "ok", label: L("SBE.Common.Save"), icon: "fa-solid fa-check", default: true, callback: (_e, b) => {
          const fd = new FormData(b.form);
          const o = Object.fromEntries(fd.entries());
          o.players = fd.has("players");
          return o;
        } },
        { action: "cancel", label: L("SBE.Common.Cancel"), icon: "fa-solid fa-xmark" }
      ],
      render: (_e, dlg) => {
        const root = dlg.element;
        root.querySelector(".sbe-cal-pick")?.addEventListener("click", async () => {
          const ic = await pickIcon();
          if (ic) root.querySelector("[name=icon]").value = ic;
        });
        /* Déposer un document (quête, journal, scène…) : son lien. */
        const link = root.querySelector(".sbe-cal-link");
        link?.addEventListener("dragover", (d) => d.preventDefault());
        link?.addEventListener("drop", (d) => {
          d.preventDefault();
          try { const data = JSON.parse(d.dataTransfer.getData("text/plain")); if (data?.uuid) link.value = data.uuid; } catch (_err) { /* pas un document */ }
        });
      }
    });
    if (!res || res === "cancel" || !String(res.name ?? "").trim()) return;
    const m = /^(\d{1,2})[:h](\d{1,2})?$/.exec(String(res.time ?? "").trim());
    await CM.saveEvent({
      id: e.id || undefined, name: res.name, icon: res.icon, color: res.color, repeat: res.repeat,
      year: res.year, month: res.month, day: res.day,
      hour: m ? Number(m[1]) : null, minute: m ? Number(m[2] ?? 0) : 0,
      note: res.note, players: res.players, link: res.link
    });
  }

  /* ---------------- Position ---------------- */

  setPosition(pos) {
    const out = super.setPosition(pos);
    if (this.rendered) {
      clearTimeout(this._posT);
      this._posT = setTimeout(() => {
        const { left, top, width } = this.position;
        game.settings.set(SYSTEM_ID, "calendarPos", { left, top, width });
      }, 400);
    }
    return out;
  }

  async close(options = {}) {
    if (this._hook) { Hooks.off("sbeCalendarChange", this._hook); this._hook = null; }
    this._wired = false;
    const r = await super.close({ ...options, animate: false });
    if (!options.sbeKeep) SBECalendarApp.syncButton(false);
    return r;
  }
}
