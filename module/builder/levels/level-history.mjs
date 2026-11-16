/**
 * SBE — HISTORIQUE D'UN NIVEAU
 *
 * La liste des passages (montées et descentes) d'un composant Niveau :
 * qui, quand, les valeurs changées, les objets et effets donnés ou
 * repris. Le MJ la voit toujours ; les joueurs, si le composant le permet.
 */

import { findById } from "../element-renderer.mjs";
import { levelConfig } from "./level-model.mjs";
import { SYSTEM_ID } from "../../helpers/constants.mjs";

const { ApplicationV2 } = foundry.applications.api;
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

export class SBELevelHistoryApp extends ApplicationV2 {

  static #open = new Map();

  static open(doc, elId) {
    const el = findById(doc?.system?.template?.system?.elements ?? [], elId);
    if (!el || el.kind !== "level") return null;
    if (!game.user.isGM && !levelConfig(el).historyPlayers) return null;
    const k = `${doc.uuid}|${elId}`;
    const cur = this.#open.get(k);
    if (cur?.rendered) { cur.bringToFront?.(); return cur; }
    const app = new SBELevelHistoryApp({ doc, elId, id: `sbe-lvlhist-${doc.id}-${elId}` });
    this.#open.set(k, app);
    app.render({ force: true });
    return app;
  }

  constructor(options = {}) {
    super(options);
    this.doc = options.doc;
    this.elId = options.elId;
  }

  static DEFAULT_OPTIONS = {
    tag: "div",
    classes: ["sbe-lvlhist"],
    window: { title: "SBE.Level.History", icon: "fa-solid fa-clock-rotate-left", resizable: true },
    position: { width: 460, height: 480 }
  };

  #hook = null;

  #el() { return findById(this.doc?.system?.template?.system?.elements ?? [], this.elId); }

  get title() {
    const el = this.#el();
    return `${L("SBE.Level.History")} — ${this.doc?.name ?? ""} · ${el?.label || el?.key || ""}`;
  }

  /** Les libellés des clés du modèle. */
  #labels() {
    const out = new Map();
    const walk = (list) => { for (const e of list ?? []) { if (e?.key) out.set(e.key, e.label || e.key); walk(e?.children); } };
    walk(this.doc?.system?.template?.system?.elements);
    return out;
  }

  async _renderHTML() {
    const el = this.#el();
    const log = el ? (this.doc.flags?.[SYSTEM_ID]?.levelLog?.[el.key] ?? []) : [];
    if (!log.length) return `<p class="notes sbe-lvlhist-empty">${esc(L("SBE.Level.HistoryEmpty"))}</p>`;
    const labels = this.#labels();
    const show = (v) => (v === null || v === undefined || v === "" ? "—" : (typeof v === "object" ? JSON.stringify(v) : String(v)));
    const rows = [...log].reverse().map(e => {
      const who = game.users.get(e.u)?.name ?? "?";
      const when = new Date(e.t || 0).toLocaleString(game.i18n.lang);
      const head = e.down
        ? `<i class="fa-solid fa-angles-down"></i> ${esc(L("SBE.Level.HistDown", { from: e.from, to: e.to }))}${e.undo ? ` <small>${esc(L("SBE.Level.HistUndo"))}</small>` : ""}`
        : `<i class="fa-solid fa-angles-up"></i> ${esc(L("SBE.Level.HistUp", { from: e.from, to: e.to }))}${e.undone ? ` <small class="is-undone">${esc(L("SBE.Level.HistUndone"))}</small>` : ""}`;
      const changes = Object.keys(e.after ?? {})
        .filter(k => !foundry.utils.equals(e.before?.[k] ?? null, e.after?.[k] ?? null))
        .map(k => `<li>${esc(labels.get(k) ?? k)} : ${esc(show(e.before?.[k]))} → ${esc(show(e.after[k]))}</li>`);
      for (const it of e.journal?.items ?? []) {
        changes.push(`<li><i class="fa-solid fa-box"></i> ${esc(L(it.op === "take" ? "SBE.Level.HistTook" : "SBE.Level.HistGave", { name: game.items?.get(it.id)?.name ?? "?", qty: it.qty }))}</li>`);
      }
      for (const fx of e.journal?.effects ?? []) {
        changes.push(`<li><i class="fa-solid fa-wand-magic-sparkles"></i> ${esc(L(fx.op === "remove" ? "SBE.Level.HistFxOff" : "SBE.Level.HistFxOn", { name: fx.key }))}</li>`);
      }
      return `<li class="sbe-lvlhist-row${e.down ? " is-down" : ""}">
        <div class="sbe-lvlhist-head"><b>${head}</b><span>${esc(who)} · ${esc(when)}</span></div>
        ${changes.length ? `<ul class="sbe-lvlhist-ch">${changes.join("")}</ul>` : ""}</li>`;
    });
    return `<ol class="sbe-lvlhist-list">${rows.join("")}</ol>`;
  }

  _replaceHTML(result, content) { content.innerHTML = result; }

  _onRender(context, options) {
    super._onRender?.(context, options);
    if (this.#hook === null) {
      const fn = (d) => { if (d === this.doc && this.rendered) this.render(); };
      this.#hook = [Hooks.on(this.doc.documentName === "Item" ? "updateItem" : "updateActor", fn), this.doc.documentName === "Item" ? "updateItem" : "updateActor"];
    }
  }

  async _onClose(options) {
    if (this.#hook) { Hooks.off(this.#hook[1], this.#hook[0]); this.#hook = null; }
    SBELevelHistoryApp.#open.delete(`${this.doc?.uuid}|${this.elId}`);
    return super._onClose?.(options);
  }
}
