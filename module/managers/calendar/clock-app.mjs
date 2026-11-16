/**
 * SBE — L'HORLOGE (fenêtre flottante, sans cadre)
 *
 * Un dôme de ciel vivant (heure, soleil ou lune, météo animée), l'heure,
 * la date, la saison, la lune, la météo et la température. Deux
 * tailles : normale et compacte (bouton ⇄), position gardée par poste.
 *
 * MJ : au survol, les commandes — aube / midi / crépuscule / minuit,
 * reculer / avancer d'un pas, temps réel (vitesse), régler la date,
 * imposer une météo (menu), ouvrir le calendrier. Les joueurs ne font
 * que regarder (si le MJ les laisse voir l'horloge).
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { CalendarManager as CM } from "./calendar-manager.mjs";
import { skyHtml, paintSky } from "./weather-sky.mjs";
import { groupWeather } from "./calendar-model.mjs";
import { uiRect } from "../../helpers/ui-rect.mjs";
import { followInterfaceTheme } from "../../helpers/ui-theme.mjs";

const { ApplicationV2, DialogV2 } = foundry.applications.api;
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const SPEEDS = [1, 2, 6, 60, 360];
const TICK_MS = 5000;

/* ============================================================ */
/*  Emplacements : l'horloge s'y glisse quand on la lâche près   */
/*  d'eux ; on peut toujours la reprendre et la poser ailleurs.  */
/* ============================================================ */

const SNAP = 70;       /* distance (px) sous laquelle l'horloge s'y glisse */
const GAP = 8;

/** Chaque emplacement donne la place de l'horloge (ou null s'il est absent). */
const SLOTS = {
  /* Au-dessus de la liste des joueurs, en bas à gauche : le bas est fixé. */
  players: () => {
    const r = uiRect("#players");
    return r ? { left: r.left, bottom: window.innerHeight - r.top + GAP } : null;
  },
  /* À droite de la navigation des scènes, en haut à gauche. */
  scenes: () => {
    const r = uiRect("#scene-navigation");
    return r ? { left: r.right + GAP * 2, top: r.top } : null;
  }
};

/** Le haut-gauche d'un emplacement pour une horloge de cette taille. */
function slotCorner(at, box) {
  return at.bottom !== undefined && at.bottom !== null ? { left: at.left, top: window.innerHeight - at.bottom - box.height } : at;
}

/** L'emplacement le plus proche de l'horloge posée en (left, top), s'il est assez près. */
function nearSlot(left, top, box) {
  let best = null;
  for (const [id, fn] of Object.entries(SLOTS)) {
    const at = fn(box);
    if (!at) continue;
    const c = slotCorner(at, box);
    const d = Math.hypot(c.left - left, c.top - top);
    if (d < SNAP && (!best || d < best.d)) best = { id, at, d };
  }
  return best;
}

/**
 * Les emplacements, dessinés pendant le glisser : tous en pointillés,
 * celui où l'horloge va se glisser allumé. `null` : on les retire.
 */
let ghosts = [];
function showSlots(box, nearId = null) {
  if (!box) { ghosts.forEach(g => g.remove()); ghosts = []; return; }
  const list = Object.entries(SLOTS).map(([id, fn]) => [id, fn(box)]).filter(([, at]) => at);
  while (ghosts.length < list.length) ghosts.push(document.body.appendChild(Object.assign(document.createElement("div"), { className: "sbe-ck-slot" })));
  ghosts.forEach((g, i) => {
    const e = list[i];
    g.hidden = !e;
    if (!e) return;
    const c = slotCorner(e[1], box);
    Object.assign(g.style, { left: `${c.left}px`, top: `${c.top}px`, width: `${box.width}px`, height: `${box.height}px` });
    g.classList.toggle("is-near", e[0] === nearId);
  });
}

export class SBEClock extends ApplicationV2 {

  static DEFAULT_OPTIONS = {
    id: "sbe-clock",
    tag: "div",
    classes: ["sbe-clock"],
    window: { frame: false, positioned: false }
  };

  static instance = null;
  _speed = 6;
  _timer = null;
  _pop = null;      /* menu de météo ouvert */

  /* ------------------------------------------------------------ */
  /*  Ouverture                                                    */
  /* ------------------------------------------------------------ */

  static isOpen() { return !!this.instance?.rendered; }

  /** L'horloge, toujours affichée quand le composant est activé. Position gardée par poste ; sinon l'emplacement du haut. */
  static async show() {
    this.instance ??= new SBEClock();
    await this.instance.render({ force: true });
  }

  /** Retour à la place de départ : l'emplacement du haut. */
  async resetPosition() {
    await game.settings.set(SYSTEM_ID, "clockPos", {});
    this.place();
  }

  /** Garde la place de l'horloge pour ce poste. */
  #savePos(pos) {
    game.settings.set(SYSTEM_ID, "clockPos", { left: Math.round(pos.left), top: Math.round(pos.top) })
      .catch(err => console.warn("SBE | Horloge : position non enregistrée", err));
  }

  /** La place de l'horloge : celle gardée, sinon l'emplacement du haut
      (à droite de la navigation des scènes) ; sans lui, centrée, à 5 %
      du haut de l'écran. */
  place() {
    const el = this.element;
    if (!el) return;
    /* D'abord la forme (fixe, taille naturelle), ensuite la mesure : la
       taille lue est celle de l'horloge, pas celle d'une fenêtre vide. */
    Object.assign(el.style, { position: "fixed", right: "auto", width: "auto", height: "auto", maxHeight: "none", margin: "0" });
    const box = this.#box();
    const pos = game.settings.get(SYSTEM_ID, "clockPos");
    /* Rangée dans un emplacement : la place se recalcule sur l'interface du moment. */
    const kept = Number.isFinite(pos?.left) && Number.isFinite(pos?.top);
    const slotId = pos?.slot ?? (kept ? null : "scenes");
    const slot = slotId ? SLOTS[slotId]?.(box) : null;
    if (slot) return this.#apply(slot);
    let left = Number.isFinite(pos?.left) ? pos.left : Math.round((window.innerWidth - box.width) / 2);
    let top = Number.isFinite(pos?.top) ? pos.top : Math.round(window.innerHeight * 0.05);
    /* Toujours dans l'écran (au moins le haut de l'horloge visible). */
    left = Math.max(0, Math.min(window.innerWidth - Math.min(box.width, window.innerWidth), left));
    top = Math.max(0, Math.min(window.innerHeight - Math.min(box.height, 60), top));
    this.#apply({ left, top });
  }

  /** Taille de l'horloge (le bloc visible, menu replié). */
  #box() {
    const r = (this.element?.querySelector(".sbe-ck") ?? this.element)?.getBoundingClientRect();
    return { width: r?.width || 280, height: r?.height || 120 };
  }

  /**
   * Pose l'horloge. `top` : le haut fixé (le menu s'ouvre vers le bas) ;
   * `bottom` : le bas fixé (emplacement du bas : le menu s'ouvre vers le haut).
   */
  #apply({ left, top = null, bottom = null }) {
    const st = this.element.style;
    st.setProperty("left", `${Math.round(left)}px`, "important");
    if (bottom !== null) { st.setProperty("bottom", `${Math.round(bottom)}px`, "important"); st.setProperty("top", "auto", "important"); }
    else { st.setProperty("top", `${Math.round(top)}px`, "important"); st.setProperty("bottom", "auto", "important"); }
  }



  static refresh() { if (this.isOpen()) this.instance.render(); }

  /* ------------------------------------------------------------ */
  /*  Contenu                                                      */
  /* ------------------------------------------------------------ */

  async _renderHTML() {
    const isGM = game.user.isGM;
    const mini = game.settings.get(SYSTEM_ID, "clockMini");
    const c = CM.calendar();
    const steps = [
      [c ? c.secondsPerMinute : 60, L("SBE.Cal.StepMin")],
      [c ? c.secondsPerMinute * 10 : 600, L("SBE.Cal.Step10Min")],
      [CM.secondsPerHour(c), L("SBE.Cal.StepHour")],
      [CM.secondsPerDay(c), L("SBE.Cal.StepDay")]
    ];
    const ctl = isGM ? `
      <div class="sbe-ck-ctl">
        <div class="sbe-ck-row">
          <button type="button" data-act="dawn" data-tooltip="${esc(L("SBE.Cal.Dawn"))}">🌅</button>
          <button type="button" data-act="noon" data-tooltip="${esc(L("SBE.Cal.Noon"))}">☀️</button>
          <button type="button" data-act="dusk" data-tooltip="${esc(L("SBE.Cal.Dusk"))}">🌇</button>
          <button type="button" data-act="midnight" data-tooltip="${esc(L("SBE.Cal.Midnight"))}">🌙</button>
          <span class="sbe-ck-sep"></span>
          <button type="button" data-act="setdate" data-tooltip="${esc(L("SBE.Cal.SetDate"))}"><i class="fa-solid fa-pen-to-square"></i></button>
          <button type="button" data-act="calendar" data-tooltip="${esc(L("SBE.Cal.Title"))}"><i class="fa-solid fa-calendar-days"></i></button>
          <button type="button" data-act="settings" data-tooltip="${esc(L("SBE.Cal.MenuLabel"))}"><i class="fa-solid fa-gear"></i></button>
          <button type="button" data-act="resetpos" data-tooltip="${esc(L("SBE.Cal.ResetPos"))}"><i class="fa-solid fa-arrows-to-dot"></i></button>
        </div>
        <div class="sbe-ck-row">
          <button type="button" data-act="back" data-tooltip="${esc(L("SBE.Cal.Back"))}"><i class="fa-solid fa-caret-left"></i></button>
          <select class="sbe-ck-step" aria-label="${esc(L("SBE.Cal.Step"))}">${steps.map(([v, l], i) => `<option value="${v}" ${i === 2 ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>
          <button type="button" data-act="fwd" data-tooltip="${esc(L("SBE.Cal.Forward"))}"><i class="fa-solid fa-caret-right"></i></button>
          <span class="sbe-ck-sep"></span>
          <button type="button" data-act="play" class="sbe-ck-play ${this._timer ? "on" : ""}" data-tooltip="${esc(L("SBE.Cal.Play"))}"><i class="fa-solid ${this._timer ? "fa-pause" : "fa-play"}"></i></button>
          <select class="sbe-ck-speed" aria-label="${esc(L("SBE.Cal.Speed"))}">${SPEEDS.map(sp => `<option value="${sp}" ${sp === this._speed ? "selected" : ""}>×${sp}</option>`).join("")}</select>
        </div>
      </div>` : `
      <div class="sbe-ck-ctl">
        <div class="sbe-ck-row">
          <button type="button" data-act="resetpos" data-tooltip="${esc(L("SBE.Cal.ResetPos"))}"><i class="fa-solid fa-arrows-to-dot"></i></button>
        </div>
      </div>`;
    /* Joueur : le menu ne sert qu'à remettre l'horloge à sa place. */
    return `<div class="sbe-ck ${mini ? "is-mini" : ""}">
      <div class="sbe-ck-full">
        ${skyHtml("ck")}
        ${isGM
          ? `<button type="button" class="sbe-ck-wx" data-act="weather" data-tooltip="${esc(L("SBE.Cal.ChangeWeather"))}"><span data-ck="wxicon"></span><small data-ck="wxname"></small></button>`
          : `<span class="sbe-ck-wx"><span data-ck="wxicon"></span><small data-ck="wxname"></small></span>`}
        <div class="sbe-ck-info">
          <div class="sbe-ck-time"><span data-ck="time"></span><small data-ck="part"></small></div>
          <div class="sbe-ck-date">
            <div class="sbe-ck-dline"><b data-ck="date"></b><span data-ck="season"></span></div>
            <div class="sbe-ck-last">
              <span data-ck="sub"></span>
              <small class="sbe-ck-temp" data-ck="temp"></small>
            </div>
          </div>
        </div>
        ${ctl}
      </div>
      <div class="sbe-ck-mini">
        <span class="sbe-ck-mini-sky"><i></i></span><b data-ck="time2"></b><span data-ck="date2"></span><span data-ck="wxicon2"></span><span data-ck="temp2"></span>
        ${isGM ? `<button type="button" class="sbe-ck-play ${this._timer ? "on" : ""}" data-act="play" data-tooltip="${esc(L("SBE.Cal.Play"))}"><i class="fa-solid ${this._timer ? "fa-pause" : "fa-play"}"></i></button>` : ""}
      </div>
      <button type="button" class="sbe-ck-toggle" data-act="toggle" data-tooltip="${esc(L("SBE.Cal.ToggleSize"))}">⇄</button>
    </div>`;
  }

  _replaceHTML(result, content) { content.innerHTML = result; }

  /** Met à jour textes et ciel sans reconstruire la fenêtre. */
  paint(snap = CM.snapshot()) {
    const root = this.element;
    if (!root) return;
    const q = (k) => root.querySelector(`[data-ck="${k}"]`);
    const set = (k, v) => { const el = q(k); if (el) el.textContent = v; };
    const disp = CM.display();
    const time = CM.fmtTime(snap.comp, disp);
    set("time", time); set("time2", time);
    /* La saison d'abord (à côté de la date), puis la date en grand, sur une
       ligne : abrégée seulement si elle ne tient pas. */
    set("season", snap.season ? `${snap.season.icon ? snap.season.icon + " " : ""}${snap.season.name}` : "");
    const dateEl = q("date");
    if (dateEl) {
      for (const short of [0, 1, 2]) {
        dateEl.textContent = CM.fmtLongDate(snap.comp, disp, snap.c, { short });
        if (dateEl.scrollWidth <= dateEl.clientWidth + 1) break;
      }
    }
    set("date2", CM.fmtDate(snap.comp, disp, snap.c));
    /* Sous l'heure : le moment de la journée. Sous la date : la lune (et la météo au bout). */
    set("part", CM.dayPartLabel(snap.part));
    /* Toutes les lunes, une par ligne, chacune à la couleur de sa phase (sinon
       de la lune) ; plusieurs lunes : leur nom devant. Trop longue, la ligne
       s'arrête sur « … » (texte entier au survol). */
    const sub = q("sub");
    if (sub) {
      const esc = foundry.utils.escapeHTML;
      const many = snap.moons.length > 1;
      sub.innerHTML = snap.moons.map(m => {
        const txt = esc(`${m.icon} ${many ? `${m.name} · ` : ""}${m.phaseName}`);
        return `<span class="sbe-ck-moon"${m.color ? ` style="color:${esc(m.color)}"` : ""} data-tooltip="${txt}">${txt}</span>`;
      }).join("");
    }

    const wx = snap.wx;
    set("wxicon", wx?.type?.icon ?? "—"); set("wxicon2", wx?.type?.icon ?? "");
    set("wxname", wx?.type?.name ?? L("SBE.Cal.NoWeather"));
    const temp = wx ? CM.fmtTemp(wx.temp, disp) : "";
    set("temp", temp); set("temp2", temp);
    const sky = root.querySelector(".sbe-sky");
    paintSky(sky, snap, { hour: CM.hourOf(snap.t, snap.c), hoursPerDay: snap.c?.hoursPerDay ?? 24 });
    /* Pastille compacte : même ciel, astre qui monte et descend. */
    const mini = root.querySelector(".sbe-ck-mini-sky");
    if (mini && sky) {
      mini.style.setProperty("--sbe-sky", sky.style.getPropertyValue("--sbe-sky"));
      const orb = sky.querySelector(snap.night ? ".sbe-sky-moon" : ".sbe-sky-sun");
      mini.style.setProperty("--y", orb?.style.top || "50%");
      mini.classList.toggle("is-night", snap.night);
    }
  }

  /* ------------------------------------------------------------ */
  /*  Câblage                                                      */
  /* ------------------------------------------------------------ */

  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element;
    followInterfaceTheme(root);
    this.place();
    this.paint();
    if (!this._hook) {
      this._hook = Hooks.on("sbeCalendarChange", (snap) => {
        if (!this.rendered) return;
        /* Un autre calendrier ou d'autres types : tout reconstruire. */
        if (snap.c?.id !== this._calId) { this._calId = snap.c?.id; this.render(); return; }
        this.paint(snap);
      });
      this._calId = CM.calendar()?.id;
    }
    /* L'élément de la fenêtre survit aux rendus : un seul écouteur. */
    if (!this._wired) root.addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-act]");
      if (!btn || !root.contains(btn)) return;
      /* Un bouton cliqué ne garde pas le focus : le menu au survol se
         referme dès que la souris s'en va. */
      if (btn.tagName === "BUTTON") btn.blur();
      this.#act(btn.dataset.act, btn);
    });
    this._wired = true;
    /* Rangée au-dessus des joueurs : elle suit la liste quand elle se déplie ou se replie. */
    if (!this._follow && typeof ResizeObserver !== "undefined") {
      this._follow = new ResizeObserver(() => { if (game.settings.get(SYSTEM_ID, "clockPos")?.slot === "players") this.place(); });
      const pl = document.querySelector("#players");
      if (pl) this._follow.observe(pl);
    }
    /* Écran redimensionné : l'horloge reste dans l'écran (et dans son emplacement). */
    if (!this._resize) {
      this._resize = () => { clearTimeout(this._rt); this._rt = setTimeout(() => this.place(), 150); };
      window.addEventListener("resize", this._resize);
    }
    /* Clic ailleurs : le menu de météo se ferme. */
    if (!this._outside) {
      this._outside = (ev) => {
        const pop = this._pop;
        if (pop && !pop.hidden && !pop.contains(ev.target) && !ev.target.closest?.(".sbe-ck-wx")) pop.hidden = true;
      };
      document.addEventListener("pointerdown", this._outside, true);
    }
    root.querySelector(".sbe-ck-speed")?.addEventListener("change", (ev) => {
      this._speed = Number(ev.target.value) || 1;
      if (this._timer) { this.#stop(); this.#start(); }
    });
    /* Glisser depuis le ciel ou la pastille. */
    for (const h of root.querySelectorAll(".sbe-sky, .sbe-ck-mini")) this.#wireDrag(h);
  }

  async #act(act, btn) {
    const c = CM.calendar();
    switch (act) {
      case "toggle": {
        const mini = !game.settings.get(SYSTEM_ID, "clockMini");
        await game.settings.set(SYSTEM_ID, "clockMini", mini);
        this.element.querySelector(".sbe-ck")?.classList.toggle("is-mini", mini);
        this.place();
        return;
      }
      case "dawn": case "noon": case "dusk": case "midnight": {
        const snap = CM.snapshot();
        const h = act === "dawn" ? snap.sun.sunrise : act === "dusk" ? snap.sun.sunset : act === "noon" ? (c?.hoursPerDay ?? 24) / 2 : 0;
        const total = Math.round(h * (c?.minutesPerHour ?? 60));
        return CM.setDate({ hour: Math.floor(total / (c?.minutesPerHour ?? 60)), minute: total % (c?.minutesPerHour ?? 60) });
      }
      case "back": case "fwd": {
        const step = Number(this.element.querySelector(".sbe-ck-step")?.value) || CM.secondsPerHour(c);
        return CM.advance(act === "back" ? -step : step);
      }
      case "play": return this._timer ? this.#stop() : this.#start();
      case "setdate": return this.#askDate();
      /* Un deuxième clic referme le calendrier. */
      case "calendar": return (await import("./calendar-app.mjs")).SBECalendarApp.toggle();
      case "settings": return CM.openEditor();
      case "resetpos": return this.resetPosition();
      case "weather": return this.#weatherMenu(btn);
      case "wxpick": {
        const pop = this._pop;
        const hold = pop.querySelector("[data-hold]")?.checked;
        const raw = pop.querySelector("[data-temp]")?.value ?? "";
        /* La température est saisie dans l'unité affichée, rangée en °C. */
        const temp = raw === "" ? null : CM.display().temp === "f" ? (Number(raw) - 32) * 5 / 9 : Number(raw);
        const id = btn.dataset.id || null;
        pop.hidden = true;
        await CM.setWeather(id, { temp, until: hold || !CM.config().options.autoWeather ? null : "day" });
        return;
      }
      default:
    }
  }

  /** Menu du MJ : imposer une météo, ou la laisser au tirage. */
  #weatherMenu(anchor) {
    /* Le menu vit dans la page (pas dans l'horloge) : rien ne le coupe. */
    if (!this._pop) {
      this._pop = document.createElement("div");
      this._pop.className = "sbe-ck-pop";
      this._pop.hidden = true;
      this._pop.addEventListener("click", (ev) => {
        const b = ev.target.closest("[data-act]");
        if (b) this.#act(b.dataset.act, b);
      });
      document.body.append(this._pop);
      followInterfaceTheme(this._pop);
    }
    const pop = this._pop;
    if (!pop.hidden) { pop.hidden = true; return; }
    const wx = CM.weatherAt();
    const disp = CM.display();
    const types = CM.weatherTypes();
    const o = CM.state().override;
    /* Les catégories que le MJ a retirées du menu (réglage du calendrier). */
    const hidden = new Set(CM.config().options.wxMenuHidden ?? []);
    pop.innerHTML = `
      <div class="sbe-ck-pop-head">${L("SBE.Cal.ChangeWeather")}</div>
      <div class="sbe-ck-pop-body">
        <div class="sbe-ck-pop-list">
          <button type="button" data-act="wxpick" data-id="" class="${o ? "" : "on"}"><span>🎲</span>${L("SBE.Cal.WeatherAuto")}</button>
        </div>
        ${groupWeather(types).filter(g => !hidden.has(g.cat) || g.types.some(t => t.id === o?.type)).map(g => `
          <div class="sbe-ck-pop-cat">${esc(g.name)}</div>
          <div class="sbe-ck-pop-list">${g.types.map(t => `<button type="button" data-act="wxpick" data-id="${esc(t.id)}" class="${o?.type === t.id ? "on" : ""}"><span>${esc(t.icon)}</span>${esc(t.name)}</button>`).join("")}</div>`).join("")}
      </div>
      <div class="sbe-ck-pop-foot">
        <label><span>${L("SBE.Cal.TempOverride")} (${disp.temp === "f" ? "°F" : "°C"})</span><input type="number" data-temp placeholder="${esc(wx ? CM.fmtTemp(wx.temp, disp) : "")}"></label>
        <label class="sbe-ck-pop-check"><input type="checkbox" data-hold ${o && o.until === null ? "checked" : ""}> <span>${L("SBE.Cal.WeatherHold")}</span></label>
      </div>`;
    /* Entrée dans la température : l'impose sur la météo du moment (la
       météo imposée, sinon celle tirée), sans avoir à recliquer un type. */
    pop.querySelector("[data-temp]")?.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      this.#act("wxpick", { dataset: { id: o?.type ?? wx?.type?.id ?? "" } });
    });
    pop.hidden = false;
    this.#placePop(pop, anchor);
  }

  /**
   * Le menu de météo reste dans l'écran : sous le bouton s'il y a la
   * place, sinon au-dessus (le côté le plus grand), aligné sur le bouton
   * et repoussé des bords ; trop haut, il défile.
   */
  #placePop(pop, anchor) {
    const M = 8, GAP = 6;
    const a = (anchor ?? this.element).getBoundingClientRect();
    Object.assign(pop.style, { maxHeight: "", left: "0px", top: "0px" });
    const w = pop.offsetWidth;
    let h = pop.offsetHeight;
    const below = window.innerHeight - a.bottom - GAP - M;
    const above = a.top - GAP - M;
    let top;
    if (h <= below) top = a.bottom + GAP;
    else if (above > below) { h = Math.min(h, above); top = a.top - GAP - h; }
    else { h = Math.min(h, below); top = a.bottom + GAP; }
    pop.style.maxHeight = `${Math.max(120, h)}px`;
    const left = Math.max(M, Math.min(window.innerWidth - w - M, a.right - w));
    Object.assign(pop.style, { left: `${Math.round(left)}px`, top: `${Math.round(Math.max(M, top))}px` });
  }

  /** Régler la date et l'heure. */
  async #askDate() {
    const c = CM.calendar();
    if (!c) return;
    const comp = CM.components();
    const months = c.months.map((m, i) => `<option value="${i + 1}" ${i === comp.month ? "selected" : ""}>${esc(m.name)}</option>`).join("");
    const content = `<div class="sbe-cal-setdate">
      <label><span>${L("SBE.Cal.Year")}</span><input type="number" name="year" value="${CM.yearShown(comp, c)}"></label>
      <label><span>${L("SBE.Cal.MonthL")}</span><select name="month">${months}</select></label>
      <label><span>${L("SBE.Cal.DayL")}</span><input type="number" name="day" min="1" value="${comp.dayOfMonth + 1}"></label>
      <label><span>${L("SBE.Cal.Hour")}</span><input type="number" name="hour" min="0" max="${c.hoursPerDay - 1}" value="${comp.hour}"></label>
      <label><span>${L("SBE.Cal.Minute")}</span><input type="number" name="minute" min="0" max="${c.minutesPerHour - 1}" value="${comp.minute}"></label>
    </div>`;
    const res = await DialogV2.prompt({
      window: { title: L("SBE.Cal.SetDate") }, content, rejectClose: false,
      ok: { label: L("SBE.Common.Validate"), callback: (_e, b) => Object.fromEntries(new FormData(b.form).entries()) }
    });
    if (!res) return;
    await CM.setDate({ year: res.year, month: res.month, day: res.day, hour: res.hour, minute: res.minute });
  }

  /* ---------------- Temps réel ---------------- */

  #start() {
    if (!game.user.isGM) return;
    this.#stop();
    this._timer = setInterval(() => { if (!game.paused) CM.advance(this._speed * TICK_MS / 1000); }, TICK_MS);
    this.#playButtons(true);
  }

  #stop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    this.#playButtons(false);
  }

  #playButtons(on) {
    for (const b of this.element?.querySelectorAll(".sbe-ck-play") ?? []) {
      b.classList.toggle("on", on);
      b.querySelector("i")?.classList.toggle("fa-pause", on);
      b.querySelector("i")?.classList.toggle("fa-play", !on);
    }
  }

  /* ---------------- Position ---------------- */

  /** Réglage du système : l'horloge et le calendrier de CE poste reprennent leur place de départ. */
  static async resetAll() {
    await game.settings.set(SYSTEM_ID, "clockPos", {});
    await game.settings.set(SYSTEM_ID, "calendarPos", {});
    this.instance?.place();
    ui.notifications.info(L("SBE.Cal.ResetDone"));
  }

  #wireDrag(handle) {
    handle.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0 || ev.target.closest("button, select, input")) return;
      ev.preventDefault();
      const r = this.element.getBoundingClientRect();
      const start = { x: ev.clientX, y: ev.clientY, left: r.left, top: r.top };
      let last = null;
      /* Le pointeur reste capturé par la poignée : le canevas ne voit
         pas le glisser, et le relâchement arrive toujours ici. */
      handle.setPointerCapture(ev.pointerId);
      const box = this.#box();
      let near = null;
      showSlots(box);
      const move = (e) => {
        const left = Math.max(0, Math.min(window.innerWidth - r.width, start.left + e.clientX - start.x));
        const top = Math.max(0, Math.min(window.innerHeight - r.height, start.top + e.clientY - start.y));
        last = { left, top };
        this.#apply({ left, top });
        /* Près d'un emplacement : il s'allume, l'horloge s'y glissera au relâchement. */
        near = nearSlot(left, top, box);
        showSlots(box, near?.id ?? null);
      };
      let done = false;
      const up = () => {
        if (done) return;
        done = true;
        handle.removeEventListener("pointermove", move);
        for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) handle.removeEventListener(t, up);
        try { handle.releasePointerCapture(ev.pointerId); } catch (_e) { /* déjà relâché */ }
        showSlots(null);
        if (near) { this.#apply(near.at); game.settings.set(SYSTEM_ID, "clockPos", { slot: near.id }); }
        else if (last) this.#savePos(last);
      };
      handle.addEventListener("pointermove", move);
      /* La fin du glisser, quoi qu'il arrive (relâché, annulé, capture perdue). */
      for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) handle.addEventListener(t, up);
    });
  }

  async close(options = {}) {
    this.#stop();
    if (this._outside) { document.removeEventListener("pointerdown", this._outside, true); this._outside = null; }
    this._pop?.remove(); this._pop = null;
    if (this._resize) { window.removeEventListener("resize", this._resize); this._resize = null; }
    this._follow?.disconnect(); this._follow = null;
    this._wired = false;
    if (this._hook) { Hooks.off("sbeCalendarChange", this._hook); this._hook = null; }
    return super.close({ ...options, animate: false });
  }
}
