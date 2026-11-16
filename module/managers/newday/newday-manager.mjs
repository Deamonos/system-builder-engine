/**
 * SBE — NOUVELLE JOURNÉE (outil MJ)
 *
 * Le passage d'une nuit, en quelques clics, pour les personnages
 * choisis. RIEN n'est écrit en dur : ce que la nuit fait (faim qui
 * baisse, points de vie rendus…) se règle dans la fenêtre, sur les
 * CLÉS des modèles de personnage du MJ.
 *
 *   - CHANGEMENTS COMMUNS : lignes « clé + montant (formule signée) »,
 *     appliquées à tous les personnages cochés ; chaque montant est une
 *     VALEUR, ou un POURCENTAGE du maximum du champ ;
 *   - la RÉCUPÉRATION, selon le mode choisi par le MJ :
 *     · PALIERS : un nom + ses lignes, choisi PAR personnage
 *       (« Nuit correcte : pv + 25 % du maximum ») ;
 *     · AU TEMPS : lignes « clé + montant toutes les N minutes »
 *       (« pv : 10 % du maximum toutes les 30 min »), multipliées par la
 *       durée de repos de CHAQUE personnage (8 h → 16 fois) ;
 *   - DURÉE de la nuit (heures et minutes, rangée en heures : 4 h 30 =
 *     4,5 ; au temps : durée par défaut, modifiable par personnage) :
 *     avance le temps de jeu (la plus longue) — les durées d'effets et
 *     tout ce qui suit le temps tournent d'eux-mêmes.
 *
 * La fenêtre a deux onglets : REPOS (les personnages, appliquer) et
 * RÉGLAGES (ce que fait le repos, enregistré).
 *
 * Chaque valeur reste dans les bornes de son champ (celles que la
 * fiche applique : valueBounds). Une ligne dont la clé n'existe pas
 * sur un personnage est ignorée pour lui.
 *
 * Après chaque personnage : carte « Nuit passée » chuchotée au MJ et
 * aux propriétaires, puis le signal `sbeNewDay` (Hooks.callAll) — les
 * autres modules (guérison au repos des effets, recharges…) s'y
 * branchent au lieu d'être appelés d'ici. À la fin : `sbeNewDayDone`.
 *
 * Dans les formules : les clés du personnage, plus maxOf("clé") et
 * minOf("clé") — les bornes du champ.
 */

import { SYSTEM_ID, SYSTEM_PATH } from "../../helpers/constants.mjs";
import { walkElements, valueBounds } from "../../builder/element-renderer.mjs";
import { evalExpression, validateFormula } from "../../builder/formula-engine.mjs";
import { docScope } from "../../builder/doc-context.mjs";
import { ChatCards } from "../chat/chat-cards.mjs";

const SETTING = "newDay";

/** Fonctions propres aux formules de la nouvelle journée. */
export const NEWDAY_FUNCS = ["maxOf", "minOf"];

/** Réglages par défaut : vides — chaque MJ décrit SA nuit. */
export const NEWDAY_DEFAULTS = { mode: "tiers", common: [], tiers: [], rate: [], nightHours: 8 };
export const NEWDAY_MODES = ["tiers", "time"];
/* Un montant : une valeur, ou un pourcentage du maximum du champ. */
export const NEWDAY_UNITS = ["flat", "pct"];
const unitOf = (u) => (NEWDAY_UNITS.includes(u) ? u : "flat");

/** Une durée en heures (4,5) en heures + minutes. */
export function splitHours(hours) {
  const total = Math.max(0, Math.round((Number(hours) || 0) * 60));
  return { h: Math.floor(total / 60), m: total % 60 };
}

/** Une durée en heures, lisible : « 8 h », « 4 h 30 », « 20 min ». */
export function durationText(hours) {
  const { h, m } = splitHours(hours);
  if (!h) return game.i18n.format("SBE.NewDay.DurM", { m });
  return m ? game.i18n.format("SBE.NewDay.DurHM", { h, m: String(m).padStart(2, "0") }) : game.i18n.format("SBE.NewDay.DurH", { h });
}

/** Champs qu'une nuit peut modifier : nombres et jauges saisis. */
function isWritable(el) {
  if (!el?.key) return false;
  if (el.kind === "gauge") return true;
  return el.kind === "number" && !el.config?.computed;
}

function cleanLines(list) {
  return (Array.isArray(list) ? list : [])
    .map(l => ({ key: String(l?.key ?? "").trim(), amount: String(l?.amount ?? "").trim(), unit: unitOf(l?.unit) }))
    .filter(l => l.key || l.amount);
}

/** Lignes « au temps » : + la période en minutes (au moins 1). */
function cleanRate(list) {
  return (Array.isArray(list) ? list : [])
    .map(l => ({
      key: String(l?.key ?? "").trim(),
      amount: String(l?.amount ?? "").trim(),
      unit: unitOf(l?.unit),
      every: Math.max(1, Math.round(Number(l?.every) || 60))
    }))
    .filter(l => l.key || l.amount);
}

export class NewDayManager {

  /** Réglages, toujours propres. */
  static getConfig() {
    let raw = {};
    try { raw = game.settings.get(SYSTEM_ID, SETTING) ?? {}; } catch (_e) { raw = {}; }
    return {
      mode: NEWDAY_MODES.includes(raw.mode) ? raw.mode : "tiers",
      common: cleanLines(raw.common),
      tiers: (Array.isArray(raw.tiers) ? raw.tiers : []).map(t => ({
        id: String(t?.id || foundry.utils.randomID()),
        name: String(t?.name ?? ""),
        lines: cleanLines(t?.lines)
      })),
      rate: cleanRate(raw.rate),
      nightHours: Math.max(0, Number(raw.nightHours ?? 8) || 0)
    };
  }

  static async setConfig(cfg) {
    await game.settings.set(SYSTEM_ID, SETTING, {
      mode: NEWDAY_MODES.includes(cfg.mode) ? cfg.mode : "tiers",
      common: cleanLines(cfg.common),
      tiers: (cfg.tiers ?? []).map(t => ({ id: t.id, name: String(t.name ?? "").trim(), lines: cleanLines(t.lines) })),
      rate: cleanRate(cfg.rate),
      nightHours: Math.max(0, Number(cfg.nightHours) || 0)
    });
  }

  /** Formules invalides d'une configuration (messages prêts). */
  static formulaErrors(cfg) {
    const out = [];
    const check = (l) => {
      if (!l.amount || Number.isFinite(Number(l.amount))) return;
      const err = validateFormula(l.amount);
      if (err) out.push(`${l.key || "?"} : ${err}`);
    };
    cfg.common.forEach(check);
    cfg.tiers.forEach(t => t.lines.forEach(check));
    (cfg.rate ?? []).forEach(check);
    return out;
  }

  /** Les personnages concernés par défaut : ceux d'un joueur. */
  static candidates() {
    return (game.actors?.contents ?? []).filter(a => a.type === "personnage" && a.hasPlayerOwner)
      .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
  }

  /** Clés modifiables de tous les modèles de personnage (autocomplétion). */
  static keyOptions() {
    const map = new Map();
    for (const tpl of (game.actors?.contents ?? []).filter(a => a.type === "template")) {
      for (const el of walkElements(tpl.system.elements ?? [])) {
        if (isWritable(el) && !map.has(el.key)) map.set(el.key, el.label || el.key);
      }
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], game.i18n.lang))
      .map(([key, label]) => ({ key, label }));
  }

  /**
   * La nuit d'UN personnage : calcule et écrit les changements.
   * @returns {Promise<Array<{key,label,from,to,src}>>}
   */
  static async applyTo(actor, cfg, tier = null, hours = null) {
    const tpl = actor.system?.template;
    const els = [...walkElements(tpl?.system?.elements ?? [])];
    const byKey = new Map(els.filter(isWritable).map(e => [e.key, e]));
    const values = foundry.utils.deepClone(actor.system?.values ?? {});

    /* Même fiche que celle affichée (apports, maxOf/minOf, effets…),
       relue sur les valeurs EN COURS de modification. */
    const scopeNow = () => docScope(actor, values);

    /* Au temps : chaque ligne s'applique autant de fois que sa période
       tient dans la durée de repos (8 h, toutes les 30 min → 16 fois). */
    const restMin = Math.round(Math.max(0, Number(hours ?? cfg.nightHours) || 0) * 60);
    const restLabel = game.i18n.format("SBE.NewDay.RestSrc", { t: durationText(restMin / 60) });
    const timed = cfg.mode === "time"
      ? (cfg.rate ?? []).map(l => ({ ...l, times: Math.floor(restMin / Math.max(1, l.every)), src: restLabel }))
        .filter(l => l.times > 0)
      : [];
    const lines = [
      ...cfg.common.map(l => ({ ...l, src: "" })),
      ...(cfg.mode === "time" ? [] : (tier?.lines ?? []).map(l => ({ ...l, src: tier.name }))),
      ...timed
    ];
    const changes = [];
    const update = {};
    for (const l of lines) {
      const el = byKey.get(l.key);
      if (!el || !l.amount) continue;
      /* Portée relue à chaque ligne : deux lignes sur la même clé
         s'enchaînent, et une formule voit l'état déjà modifié. */
      const from = Number(values[l.key] ?? el.config?.default ?? 0) || 0;
      /* Une ligne « au temps » se répète : la formule est relue à
         chaque période (elle voit la valeur déjà remontée) et la
         répétition s'arrête dès que la borne est atteinte. */
      const times = Math.min(10000, Math.max(1, Number(l.times) || 1));
      let cur = from;
      for (let i = 0; i < times; i++) {
        values[l.key] = cur;
        const sc = scopeNow();
        const { min, max } = valueBounds(el, { ...values, ...sc });
        let raw = Number.isFinite(Number(l.amount)) ? Number(l.amount) : Number(evalExpression(l.amount, sc));
        /* Pourcentage : du maximum du champ (25 % de 30 PV = 7,5 → 8). */
        if (l.unit === "pct") raw = Number.isFinite(max) ? (raw * max) / 100 : NaN;
        if (!Number.isFinite(raw) || raw === 0) break;
        /* Arrondi du champ : jauge et nombre entier → entier (25 % de 30
           PV rendent 8, pas 7,5). */
        const whole = el.kind === "gauge" || !!el.config?.integer;
        const dec = Math.max(0, Math.min(6, Number(el.config?.decimals ?? 3) || 0));
        const rounded = whole ? Math.round(cur + raw) : Math.round((cur + raw) * 10 ** dec) / 10 ** dec;
        const next = Math.max(min, Math.min(max, rounded));
        if (next === cur) break;
        cur = next;
      }
      values[l.key] = cur;
      if (cur === from) continue;
      update[`system.values.${l.key}`] = cur;
      changes.push({ key: l.key, label: el.label || l.key, from, to: cur, src: l.src });
    }
    if (Object.keys(update).length) await actor.update(update);
    return changes;
  }

  /** Carte « Nuit passée », chuchotée au MJ et aux propriétaires. */
  static async sendCard(actor, changes, tier, hours = null) {
    const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
    const L = (k) => game.i18n.localize(k);
    const whisper = game.users.filter(u => u.isGM || actor.testUserPermission(u, "OWNER")).map(u => u.id);
    const rows = changes.map(c => {
      const d = Math.round((c.to - c.from) * 1000) / 1000;
      const cls = d > 0 ? "is-up" : "is-down";
      return `<div class="sbe-card-line ${cls}"><span class="sbe-card-l">${esc(c.label)}</span>
        <span class="sbe-card-delta">${d > 0 ? "+" : "−"}${Math.abs(d)}</span>
        <span class="sbe-card-val">${c.from} → ${c.to}</span>
        ${c.src ? `<span class="sbe-card-src">${esc(c.src)}</span>` : ""}</div>`;
    }).join("");
    await ChatCards.post({
      type: "newday",
      icon: actor.img || "icons/svg/mystery-man.svg",
      title: actor.name,
      subtitle: `${L("SBE.NewDay.CardTitle")}${tier ? ` — ${tier.name}` : ""}${hours !== null ? ` — ${game.i18n.format("SBE.NewDay.RestSrc", { t: durationText(hours) })}` : ""}`,
      body: rows || `<p class="sbe-card-none">${L("SBE.NewDay.CardNothing")}</p>`,
      speaker: { alias: actor.name },
      whisper
    });
  }

  /**
   * La nouvelle journée complète.
   * @param {Array<{actor, tierId, hours}>} picks  (hours : durée de
   *        repos de ce personnage, mode « au temps »)
   * @param {number} [night]  paliers : durée de cette nuit (heures),
   *        sinon celle des réglages
   */
  static async run(picks, cfg, night = null) {
    if (!game.user.isGM) return 0;
    const timeMode = cfg.mode === "time";
    let done = 0;
    let longest = 0;
    const actors = [];
    for (const { actor, tierId, hours } of picks) {
      const tier = timeMode ? null : (cfg.tiers.find(t => t.id === tierId) ?? null);
      const nightH = night ?? cfg.nightHours;
      const h = timeMode ? Math.max(0, Number(hours ?? cfg.nightHours) || 0) : nightH;
      longest = Math.max(longest, h);
      try {
        const changes = await this.applyTo(actor, cfg, tier, h);
        await this.sendCard(actor, changes, tier, timeMode ? h : null);
        Hooks.callAll("sbeNewDay", actor, { tier, changes, nightHours: h });
        actors.push(actor);
        done++;
      } catch (err) {
        console.warn(`SBE | Nouvelle journée en échec pour ${actor?.name}`, err);
      }
    }
    /* Le temps de jeu avance de la nuit (au temps : du plus long repos). */
    const advance = timeMode ? longest : Math.max(0, Number(night ?? cfg.nightHours) || 0);
    if (advance > 0) {
      try { await game.time.advance(Math.round(advance * 3600)); }
      catch (err) { console.warn("SBE | Nouvelle journée : avance du temps en échec", err); }
    }
    Hooks.callAll("sbeNewDayDone", { actors, nightHours: advance });
    return done;
  }
}

/* ============================================================ */
/*  FENÊTRE MJ                                                   */
/* ============================================================ */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Heures + minutes lues dans deux cases (null si les deux sont vides). */
function readDuration(box, hSel, mSel) {
  const hv = box?.querySelector(hSel)?.value ?? "";
  const mv = box?.querySelector(mSel)?.value ?? "";
  if (hv === "" && mv === "") return null;
  return Math.max(0, (Number(hv) || 0) + (Number(mv) || 0) / 60);
}

export class SBENewDayApp extends HandlebarsApplicationMixin(ApplicationV2) {

  static _instance = null;

  static DEFAULT_OPTIONS = {
    id: "sbe-newday",
    tag: "div",
    classes: ["sbe-newday"],
    window: { title: "SBE.NewDay.Title", icon: "fa-solid fa-bed", resizable: true },
    position: { width: 600, height: 640 },
    actions: {
      /* « tab » est réservé par Foundry (onglets natifs). */
      ndTab: SBENewDayApp.#onTab,
      addCommon: SBENewDayApp.#onAddCommon,
      addTier: SBENewDayApp.#onAddTier,
      addTierLine: SBENewDayApp.#onAddTierLine,
      addRate: SBENewDayApp.#onAddRate,
      delLine: SBENewDayApp.#onDelLine,
      delTier: SBENewDayApp.#onDelTier,
      save: SBENewDayApp.#onSave,
      apply: SBENewDayApp.#onApply
    }
  };

  static PARTS = {
    body: { template: `${SYSTEM_PATH}/templates/managers/newday.hbs`, scrollable: [".sbe-nd-scroll"] }
  };

  /** Ouvre (ou ramène) la fenêtre — MJ uniquement. */
  static open() {
    if (!game.user.isGM) return null;
    if (this._instance?.rendered) { this._instance.bringToFront?.(); return this._instance; }
    this._instance = new SBENewDayApp();
    this._instance.render({ force: true });
    return this._instance;
  }

  /** Copie de travail : rien n'est écrit avant Enregistrer / Appliquer. */
  get cfg() {
    this._cfg ??= NewDayManager.getConfig();
    return this._cfg;
  }

  async _prepareContext() {
    const cfg = this.cfg;
    this._tab ??= "rest";
    const keys = NewDayManager.keyOptions();
    const label = new Map(keys.map(k => [k.key, k.label]));
    const shownKeys = [...new Set([...cfg.common, ...(cfg.mode === "time" ? cfg.rate : cfg.tiers.flatMap(t => t.lines))].map(l => l.key))]
      .filter(k => label.has(k));
    this._picks ??= {};
    const actors = NewDayManager.candidates().map(a => {
      const pick = this._picks[a.id] ?? { on: true, tierId: "", hours: null };
      const vals = a.system?.values ?? {};
      const els = new Map([...walkElements(a.system?.template?.system?.elements ?? [])].filter(isWritable).map(e => [e.key, e]));
      const stats = shownKeys.filter(k => els.has(k)).map(k => {
        const e = els.get(k);
        let sc = vals;
        try { sc = { ...vals, ...docScope(a) }; } catch (_e) { /* fiche incomplète */ }
        const { max } = valueBounds(e, sc);
        const v = Number(vals[k] ?? e.config?.default ?? 0) || 0;
        return { label: label.get(k), text: Number.isFinite(max) ? `${v}/${max}` : String(v) };
      });
      return { id: a.id, name: a.name, img: a.img || "icons/svg/mystery-man.svg", on: pick.on, tierId: pick.tierId,
        rest: splitHours(pick.hours ?? cfg.nightHours), stats };
    });
    const unitChoices = NEWDAY_UNITS.map(u => ({ value: u, label: game.i18n.localize(`SBE.NewDay.Unit_${u}`) }));
    return {
      cfg,
      tab: this._tab,
      keys,
      actors,
      unitChoices,
      tierChoices: cfg.tiers.map(t => ({ id: t.id, name: t.name || game.i18n.localize("SBE.NewDay.TierUnnamed") })),
      timeMode: cfg.mode === "time",
      actorsHint: cfg.mode === "time" ? "SBE.NewDay.ActorsHintTime" : "SBE.NewDay.ActorsHintTiers",
      durHint: cfg.mode === "time" ? "SBE.NewDay.RestDefaultHint" : "SBE.NewDay.NightHint",
      night: splitHours(this._night ?? cfg.nightHours),
      nightDefault: splitHours(cfg.nightHours),
      /* Période affichée : en heures si elle tombe juste, sinon en minutes. */
      rate: cfg.rate.map(l => ({ ...l, n: l.every % 60 === 0 ? l.every / 60 : l.every, per: l.every % 60 === 0 ? "h" : "min" }))
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element;
    /* Mode de récupération : l'autre bloc se cache aussitôt. */
    root.querySelector(".sbe-nd-mode")?.addEventListener("change", () => { this.#readForm(); this.render(); });
    /* Choix par personnage : mémorisés pendant que la fenêtre vit ; le
       temps qui avancera (le plus long repos) suit. */
    const advance = () => {
      const out = root.querySelector(".sbe-nd-advance");
      if (!out) return;
      let longest = 0;
      for (const row of root.querySelectorAll("[data-actor-row]")) {
        if (!row.querySelector(".sbe-nd-on")?.checked) continue;
        longest = Math.max(longest, readDuration(row, ".sbe-nd-rest-h", ".sbe-nd-rest-m") ?? this.cfg.nightHours);
      }
      out.textContent = durationText(longest);
    };
    root.querySelectorAll("[data-actor-row]").forEach(row => {
      const id = row.dataset.actorRow;
      const sync = () => {
        this._picks[id] = {
          on: !!row.querySelector(".sbe-nd-on")?.checked,
          tierId: row.querySelector(".sbe-nd-tier")?.value ?? "",
          hours: readDuration(row, ".sbe-nd-rest-h", ".sbe-nd-rest-m")
        };
        advance();
      };
      row.addEventListener("change", sync);
      row.addEventListener("input", sync);
    });
    /* Paliers : la durée de CETTE nuit (le réglage reste celui par défaut). */
    const nightBox = root.querySelector(".sbe-nd-night");
    nightBox?.addEventListener("change", () => { this._night = readDuration(nightBox, ".sbe-nd-night-h", ".sbe-nd-night-m"); });
    advance();
  }

  /** Relit l'onglet Réglages (s'il est affiché) dans la copie de travail. */
  #readForm() {
    const root = this.element;
    const set = root?.querySelector(".sbe-nd-settingsbox");
    if (!set) return this.cfg;
    const line = (r) => ({
      key: r.querySelector(".sbe-nd-key")?.value ?? "",
      amount: r.querySelector(".sbe-nd-amount")?.value ?? "",
      unit: r.querySelector(".sbe-nd-unit")?.value ?? "flat"
    });
    const readLines = (box) => [...(box?.querySelectorAll(":scope > .sbe-nd-line") ?? [])].map(line);
    const modeSel = set.querySelector(".sbe-nd-mode");
    /* Le bloc de l'AUTRE mode n'est pas affiché : ses lignes sont
       gardées telles quelles (changer de mode ne perd rien). */
    const prev = this.cfg;
    const rateBox = set.querySelector(".sbe-nd-rate");
    const hasTiers = !!set.querySelector(".sbe-nd-tiers-block");
    this._cfg = {
      mode: NEWDAY_MODES.includes(modeSel?.value) ? modeSel.value : prev.mode,
      rate: !rateBox ? prev.rate : [...rateBox.querySelectorAll(":scope > .sbe-nd-line")].map(r => ({
        ...line(r),
        every: (Number(r.querySelector(".sbe-nd-every")?.value) || 1) * (r.querySelector(".sbe-nd-per")?.value === "h" ? 60 : 1)
      })),
      common: readLines(set.querySelector(".sbe-nd-common")),
      tiers: !hasTiers ? prev.tiers : [...set.querySelectorAll(".sbe-nd-tierbox")].map(box => ({
        id: box.dataset.tierId,
        name: box.querySelector(".sbe-nd-tiername")?.value ?? "",
        lines: readLines(box.querySelector(".sbe-nd-lines"))
      })),
      nightHours: readDuration(set, ".sbe-nd-def-h", ".sbe-nd-def-m") ?? 0
    };
    return this._cfg;
  }

  static #onTab(_ev, target) {
    this.#readForm();
    this._tab = target.dataset.ndTab === "settings" ? "settings" : "rest";
    this.render();
  }

  static #onAddCommon() {
    const cfg = this.#readForm();
    cfg.common.push({ key: "", amount: "", unit: "flat" });
    this.render();
  }

  static #onAddRate() {
    const cfg = this.#readForm();
    cfg.rate.push({ key: "", amount: "", unit: "flat", every: 60 });
    this.render();
  }

  static #onAddTier() {
    const cfg = this.#readForm();
    cfg.tiers.push({ id: foundry.utils.randomID(), name: "", lines: [{ key: "", amount: "", unit: "flat" }] });
    this.render();
  }

  static #onAddTierLine(_ev, target) {
    const cfg = this.#readForm();
    cfg.tiers.find(t => t.id === target.dataset.tierId)?.lines.push({ key: "", amount: "", unit: "flat" });
    this.render();
  }

  static #onDelLine(_ev, target) {
    target.closest(".sbe-nd-line")?.remove();
    this.#readForm();
    this.render();
  }

  static #onDelTier(_ev, target) {
    target.closest(".sbe-nd-tierbox")?.remove();
    this.#readForm();
    this.render();
  }

  /** Enregistre les réglages (après vérification des formules). */
  async #save() {
    const cfg = this.#readForm();
    const errs = NewDayManager.formulaErrors({
      common: cleanLines(cfg.common),
      tiers: cfg.tiers.map(t => ({ ...t, lines: cleanLines(t.lines) })),
      rate: cleanRate(cfg.rate)
    });
    if (errs.length) { ui.notifications.error(errs.join(" · ")); return false; }
    await NewDayManager.setConfig(cfg);
    this._cfg = NewDayManager.getConfig();
    return true;
  }

  static async #onSave() {
    if (await this.#save()) {
      ui.notifications.info(game.i18n.localize("SBE.NewDay.Saved"));
      this.render();
    }
  }

  static async #onApply() {
    /* Les réglages modifiés (même pas encore enregistrés) valent pour cette nuit. */
    if (!(await this.#save())) return;
    const cfg = this.cfg;
    const picks = [];
    for (const row of this.element.querySelectorAll("[data-actor-row]")) {
      if (!row.querySelector(".sbe-nd-on")?.checked) continue;
      const actor = game.actors.get(row.dataset.actorRow);
      if (actor) picks.push({ actor, tierId: row.querySelector(".sbe-nd-tier")?.value ?? "",
        hours: readDuration(row, ".sbe-nd-rest-h", ".sbe-nd-rest-m") });
    }
    if (!picks.length) { ui.notifications.warn(game.i18n.localize("SBE.NewDay.NoneChecked")); return; }
    const night = readDuration(this.element.querySelector(".sbe-nd-night"), ".sbe-nd-night-h", ".sbe-nd-night-m");
    const n = await NewDayManager.run(picks, cfg, night);
    ui.notifications.info(game.i18n.format("SBE.NewDay.Applied", { n }));
    this.close();
  }

  _onClose(options) {
    if (SBENewDayApp._instance === this) SBENewDayApp._instance = null;
    return super._onClose?.(options);
  }
}

/* ============================================================ */
/*  BOUTON DE CONTRÔLE DE SCÈNE (niveau module)                  */
/* ============================================================ */
/* getSceneControlButtons se déclenche avant « ready » : le hook est
   posé dès l'import du module. */
Hooks.on("getSceneControlButtons", (controls) => {
  try {
    const group = controls?.tokens;
    if (!group?.tools) return;
    group.tools.sbeNewDay = {
      name: "sbeNewDay",
      title: game.i18n.localize("SBE.NewDay.ButtonTitle"),
      icon: "fa-solid fa-bed",
      order: Object.keys(group.tools).length,
      button: true,
      visible: game.user.isGM,
      onChange: () => { SBENewDayApp.open(); }
    };
  } catch (err) {
    console.warn("SBE | Nouvelle journée : bouton de contrôle en échec", err);
  }
});
