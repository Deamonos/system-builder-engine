/**
 * SBE — ÉDITEUR DES RÈGLES D'UN NIVEAU (atelier, MJ)
 *
 * Trois parties, enregistrées dans le composant Niveau du modèle :
 *   - les règles de montée (jouées pour le niveau atteint) ;
 *   - la descente : qui peut descendre, défaire le dernier passage,
 *     et les règles de descente (jouées pour le niveau quitté) ;
 *   - l'historique : visible ou non par les joueurs.
 */

import { cleanRules, RULE_WHEN, DOWN_WHO } from "./level-model.mjs";
import { findById, walkElements } from "../element-renderer.mjs";
import { validateFormula } from "../formula-engine.mjs";
import { EffectManager } from "../../managers/effects/effect-manager.mjs";

const { ApplicationV2 } = foundry.applications.api;
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const opt = (v, cur, label) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(label)}</option>`;

const NEW_ACTION = {
  value: () => ({ type: "value", key: "", op: "add", value: "1" }),
  effect: () => ({ type: "effect", key: EffectManager.effectOptions()[0]?.key ?? "", op: "apply" }),
  button: () => ({ type: "button", key: "" })
};

export class SBELevelRulesEditor extends ApplicationV2 {

  static #open = new Map();

  static open(doc, elId) {
    if (!game.user.isGM || !doc || !elId) return null;
    const k = `${doc.uuid}|${elId}`;
    const cur = this.#open.get(k);
    if (cur?.rendered) { cur.bringToFront?.(); return cur; }
    const app = new SBELevelRulesEditor({ doc, elId, id: `sbe-lvlrules-${doc.id}-${elId}` });
    this.#open.set(k, app);
    app.render({ force: true });
    return app;
  }

  constructor(options = {}) {
    super(options);
    this.doc = options.doc;
    this.elId = options.elId;
    this.cfg = this.#load();
    this.#save = foundry.utils.debounce(() => this.#write(), 300);
  }

  static DEFAULT_OPTIONS = {
    tag: "div",
    classes: ["sbe-lvlrules"],
    window: { title: "SBE.Level.RulesTitle", icon: "fa-solid fa-list-check", resizable: true },
    position: { width: 640, height: 700 }
  };

  #save;
  #hook = null;

  get title() {
    const el = this.#el();
    return `${L("SBE.Level.RulesTitle")} — ${el?.label || el?.key || ""}`;
  }

  #el() { return findById(this.doc?.system?.elements ?? [], this.elId); }

  #load() {
    const c = this.#el()?.config ?? {};
    return {
      rules: cleanRules(c.rules),
      down: { who: DOWN_WHO.includes(c.down?.who) ? c.down.who : "none", undo: c.down?.undo !== false, rules: cleanRules(c.down?.rules) },
      history: { players: !!c.history?.players }
    };
  }

  #list(which) { return which === "down" ? this.cfg.down.rules : this.cfg.rules; }

  async #write() {
    const elements = foundry.utils.deepClone(this.doc.system.elements ?? []);
    const el = findById(elements, this.elId);
    if (!el) return;
    el.config = el.config ?? {};
    el.config.rules = cleanRules(this.cfg.rules);
    el.config.down = { who: this.cfg.down.who, undo: this.cfg.down.undo, rules: cleanRules(this.cfg.down.rules) };
    el.config.history = { players: this.cfg.history.players };
    await this.doc.update({
      "system.elements": elements,
      "system.structVersion": (this.doc.system.structVersion ?? 0) + 1
    }, { sbeLevelRules: this.id });
  }

  /* ---------------------------------------------------------- */
  /*  Rendu                                                      */
  /* ---------------------------------------------------------- */

  async _renderHTML() {
    const d = this.cfg.down;
    return `<div class="sbe-lvlrules-body">
      <section>
        <h3><i class="fa-solid fa-angles-up"></i> ${esc(L("SBE.Level.RulesUp"))}</h3>
        <p class="notes">${esc(L("SBE.Level.RulesUpHint"))}</p>
        ${this.#rulesHTML("up")}
      </section>
      <section>
        <h3><i class="fa-solid fa-angles-down"></i> ${esc(L("SBE.Level.Down"))}</h3>
        <div class="form-group">
          <label>${esc(L("SBE.Level.DownWho"))}</label>
          <select data-g="downWho">${DOWN_WHO.map(w => opt(w, d.who, L(`SBE.Level.DownWho_${w}`))).join("")}</select>
        </div>
        <label class="sbe-lvlrules-check"><input type="checkbox" data-g="downUndo" ${d.undo ? "checked" : ""}> ${esc(L("SBE.Level.DownUndo"))}</label>
        <p class="notes">${esc(L("SBE.Level.DownUndoHint"))}</p>
        <h4>${esc(L("SBE.Level.RulesDown"))}</h4>
        <p class="notes">${esc(L("SBE.Level.RulesDownHint"))}</p>
        ${this.#rulesHTML("down")}
      </section>
      <section>
        <h3><i class="fa-solid fa-clock-rotate-left"></i> ${esc(L("SBE.Level.History"))}</h3>
        <label class="sbe-lvlrules-check"><input type="checkbox" data-g="histPlayers" ${this.cfg.history.players ? "checked" : ""}> ${esc(L("SBE.Level.HistoryPlayers"))}</label>
      </section>
    </div>`;
  }

  #rulesHTML(which) {
    const list = this.#list(which);
    const cards = list.map((r, i) => this.#ruleHTML(which, r, i)).join("");
    return `<div class="sbe-lvlrules-list">${cards || `<p class="notes">${esc(L("SBE.Level.RulesNone"))}</p>`}</div>
      <button type="button" data-act="addRule" data-list="${which}"><i class="fa-solid fa-plus"></i> ${esc(L("SBE.Level.RuleAdd"))}</button>`;
  }

  #ruleHTML(which, r, i) {
    const at = `data-list="${which}" data-r="${i}"`;
    const whenSel = `<select ${at} data-f="when">${RULE_WHEN.map(w => opt(w, r.when, L(`SBE.Level.When_${w}`))).join("")}</select>`;
    let nums = "";
    if (r.when === "at") nums = `<div class="form-group"><label>${esc(L("SBE.Level.RuleLevel"))}</label><input type="number" min="1" step="1" ${at} data-f="n" value="${r.n}"></div>`;
    else if (r.when === "every") {
      nums = `<div class="form-group"><label>${esc(L("SBE.Level.RuleEvery"))}</label><input type="number" min="1" step="1" ${at} data-f="n" value="${r.n}"></div>
        <div class="form-group"><label>${esc(L("SBE.Level.RuleFrom"))}</label><input type="number" min="0" step="1" ${at} data-f="from" value="${r.from}"></div>`;
    }
    const acts = r.actions.map((a, k) => this.#actionHTML(which, i, a, k)).join("");
    return `<div class="sbe-lvlrules-rule">
      <div class="sbe-lvlrules-when">
        <div class="form-group"><label>${esc(L("SBE.Level.RuleWhen"))}</label>${whenSel}</div>${nums}
        <button type="button" class="sbe-lvlrules-del" data-act="delRule" ${at} data-tooltip-text="${esc(L("SBE.Level.RuleDelete"))}" aria-label="${esc(L("SBE.Level.RuleDelete"))}"><i class="fa-solid fa-trash"></i></button>
      </div>
      <div class="sbe-lvlrules-acts">${acts || `<p class="notes">${esc(L("SBE.Level.ActionsNone"))}</p>`}</div>
      <div class="sbe-lvlrules-add">
        <button type="button" data-act="addAction" data-type="value" ${at}><i class="fa-solid fa-hashtag"></i> ${esc(L("SBE.Level.ActValue"))}</button>
        <button type="button" data-act="addAction" data-type="effect" ${at} ${EffectManager.effectOptions().length ? "" : "disabled"}><i class="fa-solid fa-wand-magic-sparkles"></i> ${esc(L("SBE.Level.ActEffect"))}</button>
        <button type="button" data-act="addAction" data-type="button" ${at}><i class="fa-solid fa-hand-pointer"></i> ${esc(L("SBE.Level.ActButton"))}</button>
        <div class="sbe-lvlrules-drop" data-item-drop ${at}><i class="fa-solid fa-box"></i> ${esc(L("SBE.Level.ActItemDrop"))}</div>
      </div>
    </div>`;
  }

  #actionHTML(which, i, a, k) {
    const at = `data-list="${which}" data-r="${i}" data-a="${k}"`;
    let body = "";
    if (a.type === "value") {
      const keys = this.#keys();
      body = `<div class="form-group"><label>${esc(L("SBE.Level.ActKey"))}</label>
          <select ${at} data-f="key"><option value="">—</option>${keys.map(o => opt(o.key, a.key, o.label)).join("")}${a.key && !keys.some(o => o.key === a.key) ? opt(a.key, a.key, a.key) : ""}</select></div>
        <div class="form-group"><label>${esc(L("SBE.Level.ActOp"))}</label>
          <select ${at} data-f="op">${opt("add", a.op, L("SBE.Level.Op_add"))}${opt("set", a.op, L("SBE.Level.Op_set"))}</select></div>
        <div class="form-group"><label>${esc(L("SBE.Level.ActAmount"))}</label>
          <input type="text" ${at} data-f="value" value="${esc(a.value)}" placeholder="2 — level * 5"></div>`;
    } else if (a.type === "item") {
      const w = game.items?.get(a.id);
      body = `<div class="form-group"><label>${esc(L("SBE.Level.ActItem"))}</label><span class="sbe-lvlrules-item">${w?.img ? `<img src="${esc(w.img)}" alt="">` : `<i class="fa-solid fa-box"></i>`}<span>${esc(w?.name ?? L("SBE.Level.ItemGone"))}</span></span></div>
        <div class="form-group"><label>${esc(L("SBE.Level.ActOp"))}</label>
          <select ${at} data-f="op">${opt("give", a.op, L("SBE.Level.Op_give"))}${opt("take", a.op, L("SBE.Level.Op_take"))}</select></div>
        <div class="form-group"><label>${esc(L("SBE.Level.ActQty"))}</label><input type="number" min="1" step="1" ${at} data-f="qty" value="${a.qty}"></div>`;
    } else if (a.type === "effect") {
      const fx = EffectManager.effectOptions();
      body = `<div class="form-group"><label>${esc(L("SBE.Level.ActEffect"))}</label>
          <select ${at} data-f="key">${fx.map(o => opt(o.key, a.key, o.label)).join("")}${fx.some(o => o.key === a.key) ? "" : opt(a.key, a.key, a.key)}</select></div>
        <div class="form-group"><label>${esc(L("SBE.Level.ActOp"))}</label>
          <select ${at} data-f="op">${opt("apply", a.op, L("SBE.Level.Op_apply"))}${opt("remove", a.op, L("SBE.Level.Op_remove"))}</select></div>`;
    } else {
      const btns = [...walkElements(this.doc.system?.elements ?? [])].filter(e => e?.kind === "button" && e.key);
      body = `<div class="form-group"><label>${esc(L("SBE.Level.ActButton"))}</label>
          <select ${at} data-f="key"><option value="">—</option>${btns.map(b => opt(b.key, a.key, b.label || b.key)).join("")}</select></div>`;
    }
    return `<div class="sbe-lvlrules-act" data-type="${a.type}">${body}
      <button type="button" class="sbe-lvlrules-del" data-act="delAction" ${at} data-tooltip-text="${esc(L("SBE.Level.ActDelete"))}" aria-label="${esc(L("SBE.Level.ActDelete"))}"><i class="fa-solid fa-xmark"></i></button></div>`;
  }

  /** Les clés de valeurs du modèle (pour « Modifier une valeur »). */
  #keys() {
    const out = [];
    const VALUE = new Set(["number", "text", "level", "gauge", "select", "checkbox", "quantity"]);
    for (const e of walkElements(this.doc.system?.elements ?? [])) {
      if (e?.key && VALUE.has(e.kind) && e.id !== this.elId) out.push({ key: e.key, label: `${e.label || e.key} (${e.key})` });
    }
    return out;
  }

  _replaceHTML(result, content) {
    const keep = content.scrollTop;
    content.innerHTML = result;
    content.scrollTop = keep;
  }

  #ac = null;

  _onRender(context, options) {
    super._onRender?.(context, options);
    const content = this.element.querySelector(".window-content");
    this.#ac?.abort();
    this.#ac = new AbortController();
    const sig = { signal: this.#ac.signal };
    content.addEventListener("change", (ev) => this.#onChange(ev), sig);
    content.addEventListener("click", (ev) => this.#onClick(ev), sig);
    for (const z of content.querySelectorAll("[data-item-drop]")) {
      z.addEventListener("dragover", (ev) => { ev.preventDefault(); z.classList.add("is-over"); }, sig);
      z.addEventListener("dragleave", () => z.classList.remove("is-over"), sig);
      z.addEventListener("drop", (ev) => this.#onItemDrop(ev, z), sig);
    }
    if (this.#hook === null) {
      const name = `update${this.doc.documentName}`;
      const id = Hooks.on(name, (doc, changes, opts) => {
        if (doc !== this.doc || opts?.sbeLevelRules === this.id) return;
        if (!foundry.utils.hasProperty(changes, "system.elements")) return;
        if (!this.#el()) { this.close(); return; }
        this.cfg = this.#load();
        this.render();
      });
      this.#hook = { name, id };
    }
  }

  #target(ds) {
    const list = this.#list(ds.list);
    const r = list?.[Number(ds.r)];
    const a = ds.a !== undefined ? r?.actions?.[Number(ds.a)] : null;
    return { list, r, a };
  }

  #onChange(ev) {
    const t = ev.target;
    if (!t?.dataset) return;
    const g = t.dataset.g;
    if (g) {
      if (g === "downWho") this.cfg.down.who = DOWN_WHO.includes(t.value) ? t.value : "none";
      else if (g === "downUndo") this.cfg.down.undo = t.checked;
      else if (g === "histPlayers") this.cfg.history.players = t.checked;
      this.#save();
      return;
    }
    const f = t.dataset.f;
    if (!f || t.dataset.r === undefined) return;
    const { r, a } = this.#target(t.dataset);
    if (!r) return;
    if (a) {
      if (f === "qty") a.qty = Math.max(1, Math.floor(Number(t.value)) || 1);
      else if (f === "value") {
        const v = t.value.trim();
        if (v && !Number.isFinite(Number(v))) { const err = validateFormula(v); if (err) { ui.notifications.error(err); return; } }
        a.value = v;
      } else a[f] = t.value;
      this.#save();
      return;
    }
    if (f === "when") { r.when = RULE_WHEN.includes(t.value) ? t.value : "at"; this.#save(); this.render(); return; }
    const n = Math.floor(Number(t.value));
    if (f === "n") r.n = Math.max(1, Number.isFinite(n) ? n : 1);
    if (f === "from") r.from = Math.max(0, Number.isFinite(n) ? n : 0);
    this.#save();
  }

  #onClick(ev) {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "addRule") {
      this.#list(b.dataset.list).push({ id: foundry.utils.randomID(), when: "at", n: 2, from: 1, actions: [] });
    } else {
      const { list, r } = this.#target(b.dataset);
      if (!r) return;
      if (act === "delRule") list.splice(Number(b.dataset.r), 1);
      else if (act === "addAction") { const mk = NEW_ACTION[b.dataset.type]; if (mk) r.actions.push(mk()); }
      else if (act === "delAction") r.actions.splice(Number(b.dataset.a), 1);
      else return;
    }
    this.#save();
    this.render();
  }

  async #onItemDrop(ev, zone) {
    ev.preventDefault();
    zone.classList.remove("is-over");
    let data = null;
    try { data = foundry.applications.ux.TextEditor.implementation.getDragEventData(ev); } catch (_e) { data = null; }
    const it = data?.type === "Item" && data.uuid ? await fromUuid(data.uuid).catch(() => null) : null;
    const { r } = this.#target(zone.dataset);
    if (!r) return;
    if (!it || it.parent || it.pack || it.type !== "objet") { ui.notifications.warn(L("SBE.Talents.ItemWorldOnly")); return; }
    r.actions.push({ type: "item", id: it.id, qty: 1, op: "give" });
    this.#save();
    this.render();
  }

  async _onClose(options) {
    this.#ac?.abort(); this.#ac = null;
    if (this.#hook !== null) { Hooks.off(this.#hook.name, this.#hook.id); this.#hook = null; }
    SBELevelRulesEditor.#open.delete(`${this.doc?.uuid}|${this.elId}`);
    return super._onClose?.(options);
  }
}
