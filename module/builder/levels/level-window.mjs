/**
 * SBE — FENÊTRE DE PASSAGE DE NIVEAU
 *
 * Elle montre les composants posés DANS le composant Niveau (atelier),
 * reliés à la fiche : chaque champ s'écrit sur le document. Au-dessus,
 * le budget de points à répartir ; en bas, « Valider » / « Annuler ».
 *
 * Moment de l'écriture (réglage du composant) :
 *   - « à Valider » : fermer ou annuler remet la fiche comme à l'ouverture ;
 *   - « tout de suite » : le niveau monte à l'ouverture, les choix restent.
 */

import { renderSheet, walkElements } from "../element-renderer.mjs";
import { computeAll, evalExpression } from "../formula-engine.mjs";
import { docContext } from "../doc-context.mjs";
import { wireTalentViews } from "../talents/talent-sheet.mjs";
import { budgetOf } from "./level-model.mjs";

const { ApplicationV2 } = foundry.applications.api;
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

export class SBELevelUpApp extends ApplicationV2 {

  static #open = new Map();

  /**
   * @param {object} o
   * @param {Document} o.doc
   * @param {object} o.el        le composant Niveau
   * @param {number} o.to        le niveau visé
   * @param {object} o.snapshot  les valeurs à l'ouverture
   * @param {Function} o.onDone  (result) → Promise : "validate" | "cancel"
   */
  static open(o) {
    const k = `${o.doc.uuid}|${o.el.id}`;
    const cur = this.#open.get(k);
    if (cur?.rendered) { cur.bringToFront?.(); return cur; }
    const app = new SBELevelUpApp({ ...o, id: `sbe-lvlup-${o.doc.id}-${o.el.id}` });
    this.#open.set(k, app);
    app.render({ force: true });
    return app;
  }

  constructor(options = {}) {
    super(options);
    this.doc = options.doc;
    this.el = options.el;
    this.to = options.to;
    this.snapshot = options.snapshot ?? {};
    this.onDone = options.onDone;
    this.done = false;
  }

  static DEFAULT_OPTIONS = {
    tag: "div",
    classes: ["sbe-lvlup"],
    window: { title: "SBE.Level.WindowTitle", icon: "fa-solid fa-angles-up", resizable: true },
    position: { width: 520, height: "auto" }
  };

  #unwatch = null;

  get title() { return L("SBE.Level.WindowTitleOf", { name: this.doc?.name ?? "", label: this.el?.label || this.el?.key, n: this.to }); }

  /** Le budget de points (ou null). */
  budget() {
    const values = this.doc.system?.values ?? {};
    return budgetOf(this.el, this.to, values, this.snapshot, this.scope ?? {}, evalExpression);
  }

  async _renderHTML() {
    const els = this.doc.system?.template?.system?.elements ?? [];
    const values = this.doc.system?.values ?? {};
    let results = {}, breakdown = {};
    try { ({ results, breakdown } = computeAll(els, values, docContext(this.doc))); } catch (_e) { /* formules en échec */ }
    this.scope = { ...values, ...results };
    const opts = {
      values, isGM: game.user.isGM, computedResults: results, breakdown, elements: els, live: true,
      hostDoc: this.doc, hostId: String(this.doc.system?.modelId || this.doc.id || ""), richEnriched: {}, inventory: {}
    };
    const b = this.budget();
    const bud = b ? `<div class="sbe-lvlup-budget${b.left < 0 ? " is-over" : (b.left === 0 ? " is-done" : "")}">
        <b>${esc(L("SBE.Level.BudgetLeft", { left: b.left, total: b.total }))}</b>
        <small>${b.fields.map(f => esc(L("SBE.Level.BudgetField", { name: f.label, cost: f.cost }))).join(" · ")}</small></div>` : "";
    const body = (this.el.children ?? []).length
      ? renderSheet(this.el.children, opts)
      : `<p class="notes">${esc(L("SBE.Level.WindowEmpty"))}</p>`;
    const why = this.blocker();
    return `<div class="sbe-lvlup-body">
      ${bud}
      <div class="sbe-lvlup-fields">${body}</div>
      <footer class="sbe-lvlup-foot">
        ${why ? `<span class="sbe-lvlup-why">${esc(why)}</span>` : ""}
        <button type="button" data-act="cancel"><i class="fa-solid fa-xmark"></i> ${esc(L("SBE.Level.Cancel"))}</button>
        <button type="button" data-act="ok" ${why ? "disabled" : ""}><i class="fa-solid fa-check"></i> ${esc(L("SBE.Level.Validate"))}</button>
      </footer></div>`;
  }

  /** Ce qui empêche de valider (ou ""). */
  blocker() {
    const b = this.budget();
    if (!b) return "";
    if (b.left < 0) return L("SBE.Level.BudgetOver");
    if (b.mustSpend && b.left > 0) return L("SBE.Level.BudgetMust");
    return "";
  }

  _replaceHTML(result, content) {
    const box = content.querySelector(".sbe-lvlup-fields");
    const keep = box ? box.scrollTop : 0;
    content.innerHTML = result;
    const fresh = content.querySelector(".sbe-lvlup-fields");
    if (fresh) fresh.scrollTop = keep;
    /* Les champs s'écrivent sur la fiche (un à un, comme sur la fiche). */
    for (const inp of content.querySelectorAll("[name^='system.values.']")) {
      inp.addEventListener("change", () => this.#write(inp));
    }
    this.#steppers(content);
    wireTalentViews(content, this.doc);
    content.querySelector('[data-act="ok"]')?.addEventListener("click", () => this.#finish("validate"));
    content.querySelector('[data-act="cancel"]')?.addEventListener("click", () => this.#finish("cancel"));
  }

  /** Le champ du budget lié à une clé (ou null). */
  #budgetField(key) {
    return this.budget()?.fields.find(f => f.key === key) ?? null;
  }

  /** La valeur la plus basse permise pour un champ du budget. */
  #floor(key) {
    if (this.budget()?.sell) return -Infinity;
    const n = Number(this.snapshot?.[key]);
    return Number.isFinite(n) ? n : 0;
  }

  /** Boutons − / + à côté de chaque champ du budget. */
  #steppers(content) {
    const b = this.budget();
    if (!b) return;
    for (const f of b.fields) {
      const inp = content.querySelector(`[name="system.values.${f.key}"]`);
      if (!inp || inp.closest(".sbe-lvlup-step")) continue;
      const cur = Number(inp.value) || 0;
      const box = document.createElement("div");
      box.className = "sbe-lvlup-step";
      const btn = (d, icon, tip, off) => {
        const x = document.createElement("button");
        x.type = "button"; x.dataset.step = String(d); x.disabled = off;
        x.dataset.tooltip = tip; x.setAttribute("aria-label", tip);
        x.innerHTML = `<i class="fa-solid ${icon}"></i>`;
        x.addEventListener("click", () => { inp.value = String((Number(inp.value) || 0) + d); this.#write(inp); });
        return x;
      };
      inp.replaceWith(box);
      box.append(btn(-1, "fa-minus", L("SBE.Level.StepDown"), cur - 1 < this.#floor(f.key)), inp, btn(1, "fa-plus", L("SBE.Level.StepUp"), b.left < f.cost));
    }
  }

  async #write(inp) {
    let v;
    const key = inp.name.slice("system.values.".length);
    if (this.#budgetField(key)) {
      const n = Number(inp.value);
      v = Number.isFinite(n) ? n : 0;
      const floor = this.#floor(key);
      if (v < floor) { v = floor; inp.value = String(v); ui.notifications.warn(L("SBE.Level.BudgetFloor")); }
    } else if (inp.type === "checkbox") v = inp.checked;
    else if (inp.type === "number" || inp.type === "range") { const n = Number(inp.value); v = Number.isFinite(n) ? n : 0; }
    else v = inp.value;
    await this.doc.update({ [inp.name]: v });
  }

  async #finish(how) {
    if (this.done) return;
    if (how === "validate" && this.blocker()) { ui.notifications.warn(this.blocker()); return; }
    this.done = true;
    try { await this.onDone?.(how, this); } catch (err) { console.error("SBE | Niveau : fin du passage en échec", err); }
    this.close();
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    if (!this.#unwatch) {
      const ids = [];
      const hit = (d) => d === this.doc || (d?.documentName === "Item" && d.parent === this.doc);
      for (const name of ["updateActor", "updateItem"]) ids.push([name, Hooks.on(name, (d) => { if (hit(d) && this.rendered && !this.done) this.render(); })]);
      this.#unwatch = () => { for (const [n, id] of ids) Hooks.off(n, id); };
    }
  }

  async _onClose(options) {
    this.#unwatch?.(); this.#unwatch = null;
    SBELevelUpApp.#open.delete(`${this.doc?.uuid}|${this.el?.id}`);
    /* Fermée par la croix : comme « Annuler ». */
    if (!this.done) {
      this.done = true;
      try { await this.onDone?.("cancel", this); } catch (err) { console.error("SBE | Niveau : annulation en échec", err); }
    }
    return super._onClose?.(options);
  }
}

/** Les clés de valeurs que la fenêtre peut changer (pour défaire). */
export function windowKeys(el) {
  const out = new Set();
  for (const e of walkElements(el.children ?? [])) if (e?.key) out.add(e.key);
  return out;
}
