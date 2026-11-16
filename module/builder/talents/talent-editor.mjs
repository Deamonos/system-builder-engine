/**
 * SBE — ÉDITEUR D'ARBRE (atelier, MJ)
 *
 * Le plan de l'arbre d'un composant Arbre : on pose les nœuds où l'on
 * veut (grille aimantée, désactivable), on tire un lien depuis le point
 * d'un nœud jusqu'à un autre, on règle le nœud choisi dans le panneau.
 * Chaque changement est enregistré dans le modèle (l'annulation de
 * l'atelier le reprend).
 */

import { cleanTree, treeStageHTML, reaches, TREE_SHAPES, TREE_DEFAULT_SIZE, TREE_PARENTS, TREE_BONUS_MODES,
  TREE_LINK_STYLES, TREE_LINK_ANIMS, TREE_BG_MODES, TREE_COLOR_KEYS } from "./talent-tree.mjs";
import { validateFormula } from "../formula-engine.mjs";
import { walkElements } from "../element-renderer.mjs";
import { getKeyRefChoices } from "../../helpers/key-refs.mjs";
import { EffectManager } from "../../managers/effects/effect-manager.mjs";
import { findById } from "../element-renderer.mjs";

const { ApplicationV2 } = foundry.applications.api;
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const FP = () => foundry.applications.apps.FilePicker.implementation;
const ZOOMS = [0.25, 0.33, 0.5, 0.67, 0.8, 1, 1.25, 1.5, 2];

export class SBETalentEditor extends ApplicationV2 {

  static #open = new Map();

  /** Ouvre (ou ramène devant) l'éditeur de l'arbre `elId` du modèle `doc`. */
  static open(doc, elId) {
    if (!game.user.isGM || !doc || !elId) return null;
    const k = `${doc.uuid}|${elId}`;
    const cur = this.#open.get(k);
    if (cur?.rendered) { cur.bringToFront?.(); return cur; }
    const app = new SBETalentEditor({ doc, elId, id: `sbe-tal-ed-${doc.id}-${elId}` });
    this.#open.set(k, app);
    app.render({ force: true });
    return app;
  }

  constructor(options = {}) {
    super(options);
    this.doc = options.doc;
    this.elId = options.elId;
    this.tree = this.#load();
    this.sel = null;          /* id d'un nœud, ou « a>b » pour un lien */
    this.zoom = 1;
    this.#save = foundry.utils.debounce(() => this.#write(), 300);
  }

  static DEFAULT_OPTIONS = {
    tag: "div",
    classes: ["sbe-tal-editor"],
    window: { title: "SBE.Talents.EditorTitle", icon: "fa-solid fa-sitemap", resizable: true },
    position: { width: 1040, height: 720 }
  };

  get title() {
    const el = this.#el();
    return `${L("SBE.Talents.EditorTitle")} — ${el?.label || el?.key || ""}`;
  }

  #save;
  #hook = null;

  #el() { return findById(this.doc?.system?.elements ?? [], this.elId); }
  #load() { return cleanTree(this.#el()?.config?.tree); }
  #node(id = this.sel) { return this.tree.nodes.find(n => n.id === id) ?? null; }

  /* ---------------------------------------------------------- */
  /*  Enregistrement                                             */
  /* ---------------------------------------------------------- */

  #changed({ stage = true, side = false } = {}) {
    if (stage) this.#drawStage();
    if (side) this.#drawSide();
    this.#save();
  }

  async #write() {
    const elements = foundry.utils.deepClone(this.doc.system.elements ?? []);
    const el = findById(elements, this.elId);
    if (!el) return;
    el.config = el.config ?? {};
    el.config.tree = cleanTree(this.tree);
    await this.doc.update({
      "system.elements": elements,
      "system.structVersion": (this.doc.system.structVersion ?? 0) + 1
    }, { sbeTalentEditor: this.id });
  }

  /** Le modèle a changé ailleurs (annulation de l'atelier…) : on relit. */
  #onDocUpdate(doc, changes, options) {
    if (doc !== this.doc || options?.sbeTalentEditor === this.id) return;
    if (!foundry.utils.hasProperty(changes, "system.elements")) return;
    if (!this.#el()) { this.close(); return; }
    this.tree = this.#load();
    if (this.sel && !this.#node() && !this.#linkOf(this.sel)) this.sel = null;
    this.#drawStage();
    this.#drawSide();
  }

  /* ---------------------------------------------------------- */
  /*  Rendu                                                      */
  /* ---------------------------------------------------------- */

  async _renderHTML() {
    return `
      <div class="sbe-tale-bar">
        <button type="button" data-act="add"><i class="fa-solid fa-plus"></i> ${esc(L("SBE.Talents.AddNode"))}</button>
        <span class="sbe-tale-sep"></span>
        <button type="button" data-act="zoomOut" data-tooltip-text="${esc(L("SBE.Talents.ZoomOut"))}"><i class="fa-solid fa-magnifying-glass-minus"></i></button>
        <span class="sbe-tale-zoomval" data-zoomval></span>
        <button type="button" data-act="zoomIn" data-tooltip-text="${esc(L("SBE.Talents.ZoomIn"))}"><i class="fa-solid fa-magnifying-glass-plus"></i></button>
        <button type="button" data-act="zoomReset" data-tooltip-text="${esc(L("SBE.Talents.ZoomReset"))}"><i class="fa-solid fa-expand"></i></button>
        <p class="notes">${esc(L("SBE.Talents.EditorHint"))}</p>
      </div>
      <div class="sbe-tale-main">
        <div class="sbe-tale-view" data-view tabindex="0"><div class="sbe-tale-zoom" data-zoom></div></div>
        <aside class="sbe-tale-side" data-side></aside>
      </div>`;
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
    this.#wire(content);
    this.#drawStage();
    this.#drawSide();
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    if (!this.#hook) {
      const name = `update${this.doc.documentName}`;
      const id = Hooks.on(name, (d, c, o) => this.#onDocUpdate(d, c, o));
      this.#hook = { name, id };
    }
  }

  async _onClose(options) {
    if (this.#hook) { Hooks.off(this.#hook.name, this.#hook.id); this.#hook = null; }
    SBETalentEditor.#open.delete(`${this.doc?.uuid}|${this.elId}`);
    return super._onClose?.(options);
  }

  /** Taille du plan : les nœuds + de la place pour en poser d'autres. */
  #planSize() {
    let w = 0, h = 0;
    for (const n of this.tree.nodes) { w = Math.max(w, n.x); h = Math.max(h, n.y); }
    return { w: Math.max(1400, w + 600), h: Math.max(900, h + 400) };
  }

  #drawStage() {
    const box = this.element?.querySelector("[data-zoom]");
    if (!box) return;
    const { w, h } = this.#planSize();
    box.style.width = `${w * this.zoom}px`;
    box.style.height = `${h * this.zoom}px`;
    box.style.setProperty("--tal-grid", `${this.tree.grid}px`);
    box.innerHTML = treeStageHTML(this.tree, { dx: 0, dy: 0, w, h, edit: true, selected: this.sel });
    const stage = box.firstElementChild;
    stage.style.transform = `scale(${this.zoom})`;
    stage.classList.toggle("is-grid", this.tree.snap);
    const zv = this.element.querySelector("[data-zoomval]");
    if (zv) zv.textContent = `${Math.round(this.zoom * 100)} %`;
  }

  #linkOf(sel) {
    const [a, b] = String(sel ?? "").split(">");
    return b ? this.tree.links.find(l => l.a === a && l.b === b) ?? null : null;
  }

  #drawSide() {
    const side = this.element?.querySelector("[data-side]");
    if (!side) return;
    const field = (label, inner) => `<div class="form-group stacked"><label>${esc(L(label))}</label>${inner}</div>`;
    const shapeOpts = (cur, withDefault) => (withDefault ? `<option value="">${esc(L("SBE.Talents.ShapeDefault"))}</option>` : "")
      + TREE_SHAPES.map(s => `<option value="${s}" ${cur === s ? "selected" : ""}>${esc(L(`SBE.Talents.Shape.${s}`))}</option>`).join("");
    const n = this.#node();
    const link = n ? null : this.#linkOf(this.sel);
    if (n) {
      side.innerHTML = `
        <h3><i class="fa-solid fa-circle-dot"></i> ${esc(L("SBE.Talents.Node"))}</h3>
        ${field("SBE.Talents.Name", `<input type="text" data-f="name" value="${esc(n.name)}">`)}
        ${field("SBE.Talents.Icon", `<div class="sbe-tale-row"><input type="text" data-f="icon" value="${esc(n.icon)}"><button type="button" data-act="pickIcon" data-tooltip-text="${esc(L("SBE.Talents.PickIcon"))}"><i class="fa-solid fa-file-image"></i></button></div>`)}
        ${field("SBE.Talents.Desc", `<textarea data-f="desc" rows="4">${esc(n.desc)}</textarea>`)}
        ${field("SBE.Talents.Ranks", `<input type="number" data-f="ranks" min="1" max="99" step="1" value="${n.ranks}">`)}
        <p class="notes">${esc(L("SBE.Talents.RanksHint"))}</p>
        <h4>${esc(L("SBE.Talents.Rules"))}</h4>
        ${field("SBE.Talents.Cost", `<input type="text" data-f="cost" data-lazy value="${esc(n.cost ?? "")}" placeholder="1">`)}
        <p class="notes">${esc(L("SBE.Talents.CostHint"))}</p>
        ${field("SBE.Talents.Parents", `<select data-f="parents">${TREE_PARENTS.map(p => `<option value="${p}" ${(n.parents ?? "all") === p ? "selected" : ""}>${esc(L(`SBE.Talents.Parents_${p}`))}</option>`).join("")}</select>`)}
        ${field("SBE.Talents.Cond", `<input type="text" data-f="cond" data-lazy value="${esc(n.cond ?? "")}" placeholder="${esc(L("SBE.Talents.CondPh"))}">`)}
        <p class="notes">${esc(L("SBE.Talents.CondHint"))}</p>
        ${field("SBE.Talents.Group", `<input type="text" data-f="group" data-lazy value="${esc(n.group ?? "")}">`)}
        <p class="notes">${esc(L("SBE.Talents.GroupHint"))}</p>
        ${this.#rewardsHTML(n)}
        <h4>${esc(L("SBE.Talents.Look"))}</h4>
        <div class="sbe-tale-row">
          ${field("SBE.Talents.ShapeNode", `<select data-f="shape">${shapeOpts(n.shape ?? "", true)}</select>`)}
          ${field("SBE.Talents.SizeNode", `<input type="number" data-f="size" min="24" max="160" step="2" value="${n.size ?? ""}" placeholder="${this.tree.size}">`)}
        </div>
        <button type="button" class="sbe-tale-del" data-act="delete"><i class="fa-solid fa-trash"></i> ${esc(L("SBE.Talents.DeleteNode"))}</button>`;
    } else if (link) {
      const nm = (id) => { const x = this.#node(id); return x?.name || L("SBE.Talents.Unnamed"); };
      side.innerHTML = `
        <h3><i class="fa-solid fa-arrow-right-long"></i> ${esc(L("SBE.Talents.Link"))}</h3>
        <p>${esc(L("SBE.Talents.LinkText", { a: nm(link.a), b: nm(link.b) }))}</p>
        <button type="button" data-act="flip"><i class="fa-solid fa-right-left"></i> ${esc(L("SBE.Talents.FlipLink"))}</button>
        <button type="button" class="sbe-tale-del" data-act="delete"><i class="fa-solid fa-trash"></i> ${esc(L("SBE.Talents.DeleteLink"))}</button>`;
    } else {
      side.innerHTML = `
        <h3><i class="fa-solid fa-sitemap"></i> ${esc(L("SBE.Talents.Tree"))}</h3>
        <p class="notes">${esc(L("SBE.Talents.TreeCount", { n: this.tree.nodes.length, l: this.tree.links.length }))}</p>
        <label class="sbe-tale-check"><input type="checkbox" data-t="snap" ${this.tree.snap ? "checked" : ""}> ${esc(L("SBE.Talents.Snap"))}</label>
        ${field("SBE.Talents.Grid", `<input type="number" data-t="grid" min="10" max="200" step="5" value="${this.tree.grid}">`)}
        <div class="sbe-tale-row">
          ${field("SBE.Talents.ShapeTree", `<select data-t="shape">${shapeOpts(this.tree.shape, false)}</select>`)}
          ${field("SBE.Talents.SizeTree", `<input type="number" data-t="size" min="24" max="160" step="2" value="${this.tree.size}">`)}
        </div>
        ${this.#lookHTML()}
        <p class="notes">${esc(L("SBE.Talents.SelectHint"))}</p>`;
    }
    for (const inp of side.querySelectorAll("[data-f]:not([data-rw])")) {
      const lazy = inp.tagName === "SELECT" || inp.type === "number" || "lazy" in inp.dataset;
      inp.addEventListener(lazy ? "change" : "input", () => this.#setNode(inp.dataset.f, inp.value));
    }
    for (const inp of side.querySelectorAll("[data-rw]")) {
      inp.addEventListener("change", () => this.#setReward(inp.dataset.rw, Number(inp.dataset.i), inp.dataset.f, inp.type === "checkbox" ? inp.checked : inp.value));
    }
    const drop = side.querySelector("[data-item-drop]");
    drop?.addEventListener("dragover", (ev) => { ev.preventDefault(); drop.classList.add("is-over"); });
    drop?.addEventListener("dragleave", () => drop.classList.remove("is-over"));
    drop?.addEventListener("drop", (ev) => this.#onItemDrop(ev, drop));
    for (const inp of side.querySelectorAll("[data-look]")) {
      inp.addEventListener("change", () => this.#setLook(inp.dataset.look, inp.value));
    }
    for (const inp of side.querySelectorAll("[data-t]")) {
      inp.addEventListener("change", () => this.#setTree(inp.dataset.t, inp.type === "checkbox" ? inp.checked : inp.value));
    }
  }

  #setNode(f, v) {
    const n = this.#node();
    if (!n) return;
    if (f === "ranks") n.ranks = Math.min(99, Math.max(1, Math.floor(Number(v) || 1)));
    else if (f === "size") { if (Number(v) > 0) n.size = Math.min(160, Math.max(24, Math.round(Number(v)))); else delete n.size; }
    else if (f === "shape") { if (TREE_SHAPES.includes(v)) n.shape = v; else delete n.shape; }
    else if (f === "parents") { if (v === "any") n.parents = "any"; else delete n.parents; }
    else if (f === "button") { if (v) n.button = String(v); else delete n.button; this.#changed({ stage: false }); return; }
    else if (["cost", "cond", "group"].includes(f)) {
      const t = String(v ?? "").trim();
      /* Formule refusée : on prévient, rien n'est gardé. */
      const err = t && f !== "group" ? validateFormula(t) : null;
      if (err) { ui.notifications.error(err); return; }
      if (t) n[f] = t; else delete n[f];
      this.#changed({ stage: false });
      return;
    }
    else n[f] = String(v ?? "");
    this.#changed();
  }

  /** Récompenses d'un nœud : bonus de valeurs, objets, effets, bouton. */
  #rewardsHTML(n) {
    const isItem = this.doc.documentName === "Item";
    const own = [...walkElements(this.doc.system.elements ?? [])];
    const keys = new Map(getKeyRefChoices("actor").map(k => [k.key, k.label ?? k.key]));
    for (const e of own) if (e?.key && ["number", "gauge"].includes(e.kind) && !keys.has(e.key)) keys.set(e.key, e.label || e.key);
    const opt = (v, cur, label) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(label)}</option>`;
    const bonus = (n.bonus ?? []).map((b, i) => `<div class="sbe-tale-rw">
        <input type="text" list="sbe-tale-keys" data-rw="bonus" data-i="${i}" data-f="key" value="${esc(b.key)}" placeholder="${esc(L("SBE.Talents.BonusKey"))}">
        <select data-rw="bonus" data-i="${i}" data-f="mode">${TREE_BONUS_MODES.map(m => opt(m, b.mode, L(`SBE.Talents.Mode_${m}`))).join("")}</select>
        <input type="text" data-rw="bonus" data-i="${i}" data-f="value" value="${esc(b.value)}" placeholder="${esc(L("SBE.Talents.BonusValue"))}">
        ${isItem ? `<select data-rw="bonus" data-i="${i}" data-f="to">${opt("carrier", b.to, L("SBE.Talents.To_carrier"))}${opt("item", b.to, L("SBE.Talents.To_item"))}</select>` : ""}
        <a data-act="delReward" data-rw="bonus" data-i="${i}" data-tooltip-text="${esc(L("SBE.Talents.Remove"))}"><i class="fa-solid fa-trash"></i></a>
      </div>`).join("");
    const items = (n.items ?? []).map((it, i) => {
      const w = game.items?.get(it.id);
      return `<div class="sbe-tale-rw">
        <img src="${esc(w?.img || "icons/svg/item-bag.svg")}" alt=""><span class="sbe-tale-rwname">${esc(w?.name ?? L("SBE.Talents.ItemMissing"))}</span>
        <input type="number" min="1" step="1" data-rw="items" data-i="${i}" data-f="qty" value="${it.qty}" data-tooltip-text="${esc(L("SBE.Talents.Qty"))}">
        <label class="sbe-tale-check"><input type="checkbox" data-rw="items" data-i="${i}" data-f="each" ${it.each ? "checked" : ""}> ${esc(L("SBE.Talents.Each"))}</label>
        <a data-act="delReward" data-rw="items" data-i="${i}" data-tooltip-text="${esc(L("SBE.Talents.Remove"))}"><i class="fa-solid fa-trash"></i></a>
      </div>`;
    }).join("");
    const fxOpts = EffectManager.effectOptions();
    const effects = (n.effects ?? []).map((e, i) => `<div class="sbe-tale-rw">
        <select data-rw="effects" data-i="${i}" data-f="key">${fxOpts.map(o => opt(o.key, e.key, o.label)).join("")}${fxOpts.some(o => o.key === e.key) ? "" : opt(e.key, e.key, e.key)}</select>
        <label class="sbe-tale-check"><input type="checkbox" data-rw="effects" data-i="${i}" data-f="each" ${e.each ? "checked" : ""}> ${esc(L("SBE.Talents.EachStack"))}</label>
        <a data-act="delReward" data-rw="effects" data-i="${i}" data-tooltip-text="${esc(L("SBE.Talents.Remove"))}"><i class="fa-solid fa-trash"></i></a>
      </div>`).join("");
    const buttons = own.filter(e => e?.kind === "button" && e.key);
    return `<h4>${esc(L("SBE.Talents.Rewards"))}</h4>
      <datalist id="sbe-tale-keys">${[...keys].map(([k, l]) => `<option value="${esc(k)}">${esc(l)}</option>`).join("")}</datalist>
      <div class="sbe-tale-rwbox"><label>${esc(L("SBE.Talents.Bonus"))}</label>${bonus}
        <button type="button" data-act="addReward" data-rw="bonus"><i class="fa-solid fa-plus"></i> ${esc(L("SBE.Talents.AddBonus"))}</button>
        <p class="notes">${esc(L(isItem ? "SBE.Talents.BonusHintItem" : "SBE.Talents.BonusHint"))}</p></div>
      <div class="sbe-tale-rwbox"><label>${esc(L("SBE.Talents.Items"))}</label>${items}
        <div class="sbe-tale-drop" data-item-drop><i class="fa-solid fa-hand-holding"></i> ${esc(L("SBE.Talents.ItemDrop"))}</div></div>
      <div class="sbe-tale-rwbox"><label>${esc(L("SBE.Talents.Effects"))}</label>${effects}
        <button type="button" data-act="addReward" data-rw="effects" ${fxOpts.length ? "" : "disabled"}><i class="fa-solid fa-plus"></i> ${esc(L("SBE.Talents.AddEffect"))}</button></div>
      <div class="form-group stacked"><label>${esc(L("SBE.Talents.Button"))}</label>
        <select data-f="button"><option value="">—</option>${buttons.map(b => opt(b.key, n.button ?? "", b.label || b.key)).join("")}</select>
        <p class="notes">${esc(L("SBE.Talents.ButtonHint"))}</p></div>`;
  }

  #setReward(list, i, f, v) {
    const n = this.#node();
    const row = n?.[list]?.[i];
    if (!row) return;
    if (f === "each") row.each = !!v;
    else if (f === "qty") row.qty = Math.max(1, Math.floor(Number(v) || 1));
    else if (f === "value") {
      const t = String(v ?? "").trim();
      const err = t ? validateFormula(t) : null;
      if (err) { ui.notifications.error(err); return; }
      row.value = t;
    } else row[f] = String(v ?? "").trim();
    this.#changed({ stage: false });
  }

  async #onItemDrop(ev, zone) {
    ev.preventDefault();
    zone.classList.remove("is-over");
    let data = null;
    try { data = foundry.applications.ux.TextEditor.implementation.getDragEventData(ev); } catch (_e) { data = null; }
    const it = data?.type === "Item" && data.uuid ? await fromUuid(data.uuid).catch(() => null) : null;
    const n = this.#node();
    if (!n) return;
    /* Seuls les objets du monde se donnent (pas un objet porté, ni un modèle). */
    if (!it || it.parent || it.pack || it.type !== "objet") { ui.notifications.warn(L("SBE.Talents.ItemWorldOnly")); return; }
    (n.items ??= []).push({ id: it.id, qty: 1, each: false });
    this.#changed({ stage: false, side: true });
  }

  /** Apparence de l'arbre : liens, fond, couleurs (thèmes sombre et clair). */
  #lookHTML() {
    const look = this.tree.look ?? {};
    const opt = (v, cur, label) => `<option value="${v}" ${v === cur ? "selected" : ""}>${esc(label)}</option>`;
    const field = (label, inner) => `<div class="form-group stacked"><label>${esc(L(label))}</label>${inner}</div>`;
    const colors = TREE_COLOR_KEYS.map(k => `<div class="sbe-tale-color"><span>${esc(L(`SBE.Talents.Color_${k}`))}</span>
        <color-picker data-look="color.${k}" value="${esc(look.colors?.[k] ?? "")}"></color-picker></div>`).join("");
    return `<h4>${esc(L("SBE.Talents.LookTree"))}</h4>
      <div class="sbe-tale-row">
        ${field("SBE.Talents.LinkStyle", `<select data-look="link">${TREE_LINK_STYLES.map(x => opt(x, look.link ?? "straight", L(`SBE.Talents.Link_${x}`))).join("")}</select>`)}
        ${field("SBE.Talents.LinkWidth", `<input type="number" data-look="width" min="1" max="12" step="1" value="${look.width ?? 3}">`)}
      </div>
      ${field("SBE.Talents.LinkAnim", `<select data-look="anim">${TREE_LINK_ANIMS.map(x => opt(x, look.anim ?? "none", L(`SBE.Talents.Anim_${x}`))).join("")}</select>`)}
      ${field("SBE.Talents.Bg", `<div class="sbe-tale-row"><input type="text" data-look="bg" value="${esc(look.bg ?? "")}"><button type="button" data-act="pickBg" data-tooltip-text="${esc(L("SBE.Talents.PickIcon"))}"><i class="fa-solid fa-file-image"></i></button></div>`)}
      ${field("SBE.Talents.BgMode", `<select data-look="bgMode">${TREE_BG_MODES.map(x => opt(x, look.bgMode ?? "cover", L(`SBE.Talents.BgMode_${x}`))).join("")}</select>`)}
      <div class="sbe-tale-colors"><div class="sbe-tale-color is-head"><span>${esc(L("SBE.Talents.Colors"))}</span></div>${colors}</div>
      <p class="notes">${esc(L("SBE.Talents.ColorsHint"))}</p>`;
  }

  #setLook(f, v) {
    const look = (this.tree.look ??= {});
    if (f.startsWith("color.")) {
      const k = f.slice(6);
      const c = String(v ?? "").trim();
      if (c) (look.colors ??= {})[k] = c;
      else if (look.colors) delete look.colors[k];
    } else if (f === "width") look.width = Math.min(12, Math.max(1, Math.round(Number(v) || 3)));
    else look[f] = String(v ?? "").trim();
    this.#changed();
  }

  #setTree(f, v) {
    if (f === "snap") this.tree.snap = !!v;
    else if (f === "grid") this.tree.grid = Math.min(200, Math.max(10, Math.round(Number(v) || 40)));
    else if (f === "shape") this.tree.shape = TREE_SHAPES.includes(v) ? v : "circle";
    else if (f === "size") this.tree.size = Math.min(160, Math.max(24, Math.round(Number(v) || TREE_DEFAULT_SIZE)));
    this.#changed({ side: true });
  }

  /* ---------------------------------------------------------- */
  /*  Actions                                                    */
  /* ---------------------------------------------------------- */

  #snap(v) { return this.tree.snap ? Math.round(v / this.tree.grid) * this.tree.grid : Math.round(v); }

  /** Point de l'écran → point du plan. */
  #toPlan(ev) {
    const stage = this.element.querySelector(".sbe-tal-stage");
    const r = stage.getBoundingClientRect();
    return { x: (ev.clientX - r.left) / this.zoom, y: (ev.clientY - r.top) / this.zoom };
  }

  #addNode(at = null) {
    let p = at;
    if (!p) {
      const view = this.element.querySelector("[data-view]");
      p = { x: (view.scrollLeft + view.clientWidth / 2) / this.zoom, y: (view.scrollTop + view.clientHeight / 2) / this.zoom };
    }
    let x = Math.max(this.tree.size, this.#snap(p.x)), y = Math.max(this.tree.size, this.#snap(p.y));
    const taken = (px, py) => this.tree.nodes.some(n => Math.abs(n.x - px) < 8 && Math.abs(n.y - py) < 8);
    for (let i = 0; i < 30 && taken(x, y); i++) { x += this.tree.grid; }
    const n = { id: foundry.utils.randomID(), x, y, name: "", icon: "", desc: "", ranks: 1 };
    this.tree.nodes.push(n);
    this.sel = n.id;
    this.#changed({ side: true });
  }

  #addLink(a, b) {
    if (!a || !b || a === b) return;
    if (this.tree.links.some(l => (l.a === a && l.b === b) || (l.a === b && l.b === a))) return;
    if (reaches(this.tree.links, b, a)) { ui.notifications.warn(L("SBE.Talents.LoopRefused")); return; }
    this.tree.links.push({ a, b });
    this.sel = `${a}>${b}`;
    this.#changed({ side: true });
  }

  #delete() {
    const n = this.#node();
    if (n) {
      this.tree.nodes = this.tree.nodes.filter(x => x.id !== n.id);
      this.tree.links = this.tree.links.filter(l => l.a !== n.id && l.b !== n.id);
    } else {
      const l = this.#linkOf(this.sel);
      if (!l) return;
      this.tree.links = this.tree.links.filter(x => x !== l);
    }
    this.sel = null;
    this.#changed({ side: true });
  }

  #setZoom(z, anchor = null) {
    const view = this.element.querySelector("[data-view]");
    const old = this.zoom;
    this.zoom = Math.min(2, Math.max(0.25, z));
    if (old === this.zoom) return;
    const ax = anchor?.x ?? view.clientWidth / 2, ay = anchor?.y ?? view.clientHeight / 2;
    const px = (view.scrollLeft + ax) / old, py = (view.scrollTop + ay) / old;
    this.#drawStage();
    view.scrollLeft = px * this.zoom - ax;
    view.scrollTop = py * this.zoom - ay;
  }

  #stepZoom(dir) {
    const i = ZOOMS.findIndex(z => z >= this.zoom - 1e-6);
    const next = dir > 0 ? ZOOMS[Math.min(ZOOMS.length - 1, (ZOOMS[i] > this.zoom + 1e-6 ? i : i + 1))] : ZOOMS[Math.max(0, i - 1)];
    this.#setZoom(next ?? this.zoom);
  }

  #wire(root) {
    /* Le contenu de la fenêtre reste le même d'un rendu à l'autre : un seul écouteur de clics. */
    if (!root.sbeTalWired) root.addEventListener("click", (ev) => this.#onClick(ev));
    root.sbeTalWired = true;
    this.#wireView(root);
  }

  #onClick(ev) {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "add") this.#addNode();
    else if (act === "zoomIn") this.#stepZoom(1);
    else if (act === "zoomOut") this.#stepZoom(-1);
    else if (act === "zoomReset") this.#setZoom(1);
    else if (act === "delete") this.#delete();
    else if (act === "flip") {
      const l = this.#linkOf(this.sel);
      if (!l) return;
      const back = { a: l.b, b: l.a };
      this.tree.links = this.tree.links.filter(x => x !== l);
      if (reaches(this.tree.links, back.b, back.a)) { this.tree.links.push(l); ui.notifications.warn(L("SBE.Talents.LoopRefused")); return; }
      this.tree.links.push(back);
      this.sel = `${back.a}>${back.b}`;
      this.#changed({ side: true });
    } else if (act === "addReward" || act === "delReward") {
      const n = this.#node();
      const list = b.dataset.rw;
      if (!n || !["bonus", "effects", "items"].includes(list)) return;
      if (act === "delReward") (n[list] ?? []).splice(Number(b.dataset.i), 1);
      else if (list === "bonus") (n.bonus ??= []).push({ key: "", mode: "add", value: "", to: "carrier" });
      else if (list === "effects") (n.effects ??= []).push({ key: EffectManager.effectOptions()[0]?.key ?? "", each: false });
      this.#changed({ stage: false, side: true });
    } else if (act === "pickBg") {
      new (FP())({ type: "image", current: this.tree.look?.bg ?? "", callback: (path) => { this.#setLook("bg", path); this.#drawSide(); } }).render(true);
    } else if (act === "pickIcon") {
      const n = this.#node();
      if (!n) return;
      new (FP())({ type: "image", current: n.icon, callback: (path) => { n.icon = path; this.#changed({ side: true }); } }).render(true);
    }
  }

  #wireView(root) {
    const view = root.querySelector("[data-view]");
    view.addEventListener("pointerdown", (ev) => this.#onDown(ev, view));
    view.addEventListener("dblclick", (ev) => {
      if (ev.target.closest(".sbe-tal-node, .sbe-tal-link")) return;
      this.#addNode(this.#toPlan(ev));
    });
    view.addEventListener("wheel", (ev) => {
      if (!ev.ctrlKey) return;
      ev.preventDefault();
      const r = view.getBoundingClientRect();
      this.#setZoom(this.zoom * (ev.deltaY < 0 ? 1.1 : 1 / 1.1), { x: ev.clientX - r.left, y: ev.clientY - r.top });
    }, { passive: false });
    view.addEventListener("keydown", (ev) => {
      if (!["Delete", "Backspace"].includes(ev.key) || !this.sel) return;
      ev.preventDefault();
      this.#delete();
    });
  }

  #select(id) {
    if (this.sel === id) return;
    this.sel = id;
    this.#drawStage();
    this.#drawSide();
  }

  #onDown(ev, view) {
    if (ev.button !== 0) return;
    view.focus({ preventScroll: true });
    const handle = ev.target.closest("[data-handle]");
    const nodeEl = ev.target.closest(".sbe-tal-node");
    const linkEl = ev.target.closest(".sbe-tal-link");
    ev.preventDefault();

    /* Tirer un lien depuis le point d'un nœud. */
    if (handle) {
      const from = this.#node(handle.dataset.handle);
      const svg = view.querySelector(".sbe-tal-links");
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("class", "sbe-tal-temp");
      line.setAttribute("x1", from.x); line.setAttribute("y1", from.y);
      line.setAttribute("x2", from.x); line.setAttribute("y2", from.y);
      svg.appendChild(line);
      const move = (e) => { const p = this.#toPlan(e); line.setAttribute("x2", p.x); line.setAttribute("y2", p.y); };
      const up = (e) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        line.remove();
        const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest?.(".sbe-tal-node");
        if (hit && view.contains(hit)) this.#addLink(from.id, hit.dataset.node);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      return;
    }

    /* Déplacer un nœud. */
    if (nodeEl) {
      const n = this.#node(nodeEl.dataset.node);
      if (!n) return;
      this.#select(n.id);
      const start = this.#toPlan(ev);
      const ox = n.x, oy = n.y;
      let moved = false;
      const move = (e) => {
        const p = this.#toPlan(e);
        /* Jamais hors du plan : le nœud reste entier en haut et à gauche. */
        const half = Math.ceil((n.size ?? this.tree.size) / 2);
        const nx = Math.max(half, this.#snap(ox + p.x - start.x)), ny = Math.max(half, this.#snap(oy + p.y - start.y));
        if (nx === n.x && ny === n.y) return;
        moved = true;
        n.x = nx; n.y = ny;
        this.#drawStage();
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        if (moved) this.#changed();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      return;
    }

    if (linkEl) { this.#select(linkEl.dataset.link); return; }

    /* Fond : rien de choisi, et on fait glisser la vue. */
    this.#select(null);
    const sx = ev.clientX, sy = ev.clientY, sl = view.scrollLeft, stp = view.scrollTop;
    const move = (e) => { view.scrollLeft = sl - (e.clientX - sx); view.scrollTop = stp - (e.clientY - sy); };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
}
