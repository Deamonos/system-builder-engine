/**
 * SBE — Manager du HUD d'UN modèle de personnage
 *
 * Deux onglets, un aperçu toujours visible en bas :
 *  - Configuration : à gauche les SOURCES du modèle (valeurs, boutons,
 *    slots, listes) et l'organisation (menu, séparateur) ; à droite
 *    l'ARBRE du HUD. On glisse une source dans l'arbre, on déplace une
 *    entrée où l'on veut (avant, après, DANS un menu). Un objet du
 *    monde se glisse aussi depuis la barre latérale.
 *  - Apparence : couleurs (sombre / clair), mesures, décorations SVG,
 *    CSS libre (« @hud » = ce HUD).
 * L'aperçu montre le HUD avec un personnage de ce modèle (ou sans) ;
 * « Aperçu à l'écran » l'applique au vrai HUD sans enregistrer.
 */

import { walkElements, isRefList } from "../../builder/element-renderer.mjs";
import { pickIcon } from "../../helpers/icon-picker.mjs";
import {
  normalizeHud, cleanNode, cleanDecoration, cleanMini, injectHudCss, paletteOf,
  HUD_TOKENS, HUD_PALETTE_DEFAULTS, splitColor, joinColor, OPEN_ON, ORIENTATIONS, LABEL_MODES, DECO_ANCHORS, HEAD_SIDES, CHROME_SIDES
} from "./hud-model.mjs";
import { HudView, SBEHud, hudIcon, hudChrome } from "./hud.mjs";
import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { interfaceScheme } from "../../helpers/ui-theme.mjs";

const { ApplicationV2 } = foundry.applications.api;
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const DND = "application/x-sbe-hud";
const VALUE_KINDS = ["number", "gauge", "text", "select", "checkbox"];
const TYPE_ICON = { menu: "fa-folder", separator: "fa-grip-lines", value: "fa-hashtag", button: "fa-hand-pointer", slot: "fa-square", list: "fa-list", model: "fa-cube" };
const DECO_ANCHOR_KEY = { "top-left": "TL", "top-center": "TC", "top-right": "TR", "middle-left": "ML", "center": "C", "middle-right": "MR", "bottom-left": "BL", "bottom-center": "BC", "bottom-right": "BR" };

/** Cherche une entrée dans l'arbre : { node, list, index }. */
function locate(list, id) {
  for (let i = 0; i < (list ?? []).length; i++) {
    const n = list[i];
    if (n.id === id) return { node: n, list, index: i };
    if (n.type === "menu") {
      const r = locate(n.children, id);
      if (r) return r;
    }
  }
  return null;
}
const contains = (node, id) => node.type === "menu" && (node.children ?? []).some(c => c.id === id || contains(c, id));

export class SBEHudConfig extends ApplicationV2 {

  constructor(options = {}) {
    super(options);
    this.document = options.document;
    this._w = normalizeHud(this.document?.system?.hud);
    this._tab = "config";
    this._edit = null;
    this._live = false;
    this._actorId = this.#actors()[0]?.id ?? "";
  }

  static DEFAULT_OPTIONS = {
    tag: "div",
    classes: ["sbe-hud-config", "sbe-condense"],
    window: { title: "SBE.Hud.Title", icon: "fa-solid fa-gamepad", resizable: true },
    position: { width: 940, height: 820 }
  };

  get title() { return L("SBE.Hud.TitleName", { name: this.document?.name ?? "" }); }

  /** Thème de l'aperçu : celui de Foundry, sauf choix dans la liste. */
  #mode() {
    return this._mode || interfaceScheme();
  }

  #actors() {
    return game.actors.filter(a => a.type === "personnage" && a.system?.templateId === this.document?.id && a.isOwner);
  }

  #els() { return [...walkElements(this.document?.system?.elements ?? [])].filter(e => e?.key); }

  /** Champs des modèles d'objets pour « Ranger par ». */
  #itemKeys() {
    const seen = new Map();
    for (const tpl of game.items.filter(i => i.type === "template")) {
      for (const el of walkElements(tpl.system.elements ?? [])) {
        if (!el?.key || seen.has(el.key) || !["select", "text", "number", "checkbox"].includes(el.kind)) continue;
        seen.set(el.key, `${el.label || el.key} — ${tpl.name}`);
      }
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1], game.i18n.lang));
  }

  /** Nom affiché d'une entrée (son libellé, sinon sa source). */
  #nameOf(n) {
    if (n.label) return n.label;
    const el = n.key ? this.#els().find(e => e.key === n.key) : null;
    switch (n.type) {
      case "menu": return L("SBE.Hud.MenuUnnamed");
      case "separator": return L("SBE.Hud.T_separator");
      case "list": return n.key ? (el?.label || n.key) : L("SBE.Hud.ListAll");
      case "model": return n.modelName || n.modelId;
      default: return el ? (el.label || el.key) : `⚠ ${n.key}`;
    }
  }

  /* ============================================================ */
  /*  Rendu                                                        */
  /* ============================================================ */

  async _renderHTML() {
    const body = this._tab === "look" ? this.#lookHtml() : this.#configHtml();
    const actors = this.#actors();
    return `
      <nav class="sbe-hudc-tabs">
        <a data-tab="config" class="${this._tab === "config" ? "is-on" : ""}"><i class="fa-solid fa-sitemap"></i> ${L("SBE.Hud.TabConfig")}</a>
        <a data-tab="look" class="${this._tab === "look" ? "is-on" : ""}"><i class="fa-solid fa-palette"></i> ${L("SBE.Hud.TabLook")}</a>
      </nav>
      <div class="sbe-hudc-main">
        <div class="sbe-hudc-body sbe-hudc-body--${this._tab}">${body}</div>
        <section class="sbe-hudc-preview${this._open?.preview === false ? " is-folded" : ""}">
          <div class="sbe-hudc-previewbar">
            <label><span>${L("SBE.Hud.PreviewWith")}</span>
              <select class="sbe-hudc-pactor">
                <option value="">${L("SBE.Hud.PreviewNone")}</option>
                ${actors.map(a => `<option value="${a.id}" ${a.id === this._actorId ? "selected" : ""}>${esc(a.name)}</option>`).join("")}
              </select></label>
            <label><span>${L("SBE.Hud.PreviewMode")}</span>
              <select class="sbe-hudc-pmode">
                ${["dark", "light"].map(m => `<option value="${m}" ${this.#mode() === m ? "selected" : ""}>${L(`SBE.Hud.Mode_${m}`)}</option>`).join("")}
              </select></label>
            <button type="button" class="sbe-hudc-live${this._live ? " is-on" : ""}"><i class="fa-solid fa-display"></i> ${L(this._live ? "SBE.Hud.LiveOff" : "SBE.Hud.LiveOn")}</button>
            <button type="button" class="sbe-hudc-pfold" data-tooltip-text="${esc(L(this._open?.preview === false ? "SBE.Hud.PreviewUnfold" : "SBE.Hud.PreviewFold"))}"><i class="fa-solid fa-chevron-down"></i></button>
          </div>
          <div class="sbe-hudc-stage"><div class="sbe-hudc-hud"></div></div>
        </section>
      </div>
      <footer class="sbe-hudc-foot">
        <button type="button" data-do="export"><i class="fa-solid fa-file-export"></i> ${L("SBE.Common.Export")}</button>
        <button type="button" data-do="import"><i class="fa-solid fa-file-import"></i> ${L("SBE.Common.Import")}</button>
        <button type="button" data-do="pos"><i class="fa-solid fa-arrows-to-dot"></i> ${L("SBE.Hud.ResetPos")}</button>
        <button type="button" data-do="save"><i class="fa-solid fa-floppy-disk"></i> ${L("SBE.Common.Save")}</button>
      </footer>`;
  }

  /** Petits boutons libres (à côté du cadenas). */
  #minisHtml() {
    const minis = this._w.minis ?? [];
    /* Clés proposées : boutons des modèles d'OBJETS, boutons de la fiche. */
    const itemKeys = new Map();
    for (const t of game.items ?? []) {
      if (t.type !== "template") continue;
      for (const e of walkElements(t.system?.elements ?? [])) if (e?.kind === "button" && e.key && !itemKeys.has(e.key)) itemKeys.set(e.key, `${e.label || e.key} (${t.name})`);
    }
    const sheetKeys = this.#els().filter(e => e.kind === "button" && e.key);
    const rows = minis.map((m, i) => `
      <div class="sbe-hudc-mini" data-mini="${i}">
        <button type="button" class="sbe-hudc-mini-ic" data-mini-icon="${i}" data-tooltip-text="${esc(L("SBE.Hud.MiniIcon"))}">${hudIcon(m.icon)}</button>
        <label class="sbe-hudc-f"><span>${L("SBE.Hud.MiniLabel")}</span><input type="text" data-mf="label" value="${esc(m.label)}"></label>
        <label class="sbe-hudc-f"><span>${L("SBE.Hud.MiniKind")}</span><select data-mf="kind">
          <option value="item" ${m.kind === "item" ? "selected" : ""}>${L("SBE.Hud.MiniKind_item")}</option>
          <option value="sheet" ${m.kind === "sheet" ? "selected" : ""}>${L("SBE.Hud.MiniKind_sheet")}</option></select></label>
        <label class="sbe-hudc-f"><span>${L("SBE.Hud.MiniKey")}</span><input type="text" data-mf="key" value="${esc(m.key)}"
          list="${m.kind === "sheet" ? "sbe-hudc-mini-skeys" : "sbe-hudc-mini-ikeys"}"></label>
        <label class="sbe-hudc-f" ${m.kind === "sheet" ? "hidden" : ""}><span>${L("SBE.Hud.MiniOnIf")}</span><input type="text" data-mf="onIf" value="${esc(m.onIf)}" placeholder="${esc(L("SBE.Ph.OnIf"))}"></label>
        <button type="button" class="sbe-hudc-deco-del" data-mini-del="${i}" data-tooltip-text="${esc(L("SBE.Common.Delete"))}"><i class="fa-solid fa-trash"></i></button>
      </div>`).join("");
    return `<fieldset class="sbe-hudc-minis">
      <legend><i class="fa-solid fa-lock"></i> ${L("SBE.Hud.Minis")}</legend>
      <p class="notes">${L("SBE.Hud.MinisHint")}</p>
      <datalist id="sbe-hudc-mini-ikeys">${[...itemKeys].map(([k, l]) => `<option value="${esc(k)}">${esc(l)}</option>`).join("")}</datalist>
      <datalist id="sbe-hudc-mini-skeys">${sheetKeys.map(e => `<option value="${esc(e.key)}">${esc(e.label || e.key)}</option>`).join("")}</datalist>
      ${rows}
      <button type="button" data-do="miniadd"><i class="fa-solid fa-plus"></i> ${L("SBE.Hud.MiniAdd")}</button>
    </fieldset>`;
  }

  /** Section repliable : icône, titre, aide, chevron (pli gardé à l'écran). */
  #sec(key, icon, title, hint, body) {
    return `
      <details class="sbe-hudc-sec" data-sec="${key}" ${this._open?.[key] === false ? "" : "open"}>
        <summary><i class="${icon} sbe-hudc-sec-ic"></i><span class="sbe-hudc-sec-t">${L(title)}</span><i class="fa-solid fa-chevron-down sbe-hudc-sec-car"></i></summary>
        <div class="sbe-hudc-sec-body">${hint ? `<p class="notes">${L(hint)}</p>` : ""}${body}</div>
      </details>`;
  }

  #configHtml() {
    const w = this._w;
    const s = w.settings;
    const els = this.#els();
    const chip = (type, key, label, extra = "") =>
      `<div class="sbe-hudc-chip" draggable="true" data-new-type="${type}" data-new-key="${esc(key)}">${hudIcon(TYPE_ICON[type])} <span>${esc(label)}</span>${extra}</div>`;
    const group = (title, chips, empty = "") => `<h4>${L(title)}</h4><div class="sbe-hudc-chips">${chips.join("") || `<span class="sbe-hudc-hint">${L(empty || "SBE.Hud.SrcNone")}</span>`}</div>`;
    const values = els.filter(e => VALUE_KINDS.includes(e.kind))
      .map(e => chip("value", e.key, e.label || e.key, `<small>${e.config?.roll?.on ? "🎲 " : ""}${esc(e.key)}</small>`));
    const buttons = els.filter(e => e.kind === "button").map(e => chip("button", e.key, e.label || e.key, `<small>${esc(e.key)}</small>`));
    const slots = els.filter(e => e.kind === "slot").map(e => chip("slot", e.key, e.label || e.key, `<small>${esc(e.key)}</small>`));
    const lists = [chip("list", "", L("SBE.Hud.ListAll")),
      ...els.filter(e => e.kind === "container" && !isRefList(e)).map(e => chip("list", e.key, e.label || e.key, `<small>${esc(e.key)}</small>`))];
    const sel = (name, list, cur, pre) => `<select data-set="${name}">${list.map(v => `<option value="${v}" ${cur === v ? "selected" : ""}>${L(`${pre}${v}`)}</option>`).join("")}</select>`;
    /* Les réglages généraux se replient : l'organisation gagne la place. */
    return this.#sec("general", "fa-solid fa-sliders", "SBE.Hud.SecGeneral", "", `
      <label class="sbe-hudc-check"><input type="checkbox" data-set="enabled" ${w.enabled ? "checked" : ""}> <b>${L("SBE.Hud.Enabled")}</b></label>
      <p class="notes">${L("SBE.Hud.EnabledHint")}</p>
      <div class="sbe-hudc-grid">
        <label class="sbe-hudc-f"><span>${L("SBE.Hud.OpenOn")}</span>${sel("settings.openOn", OPEN_ON, s.openOn, "SBE.Hud.OpenOn_")}</label>
        <label class="sbe-hudc-f"><span>${L("SBE.Hud.EmptySlots")}</span>${sel("settings.emptySlots", ["hide", "show"], s.emptySlots, "SBE.Hud.EmptySlots_")}</label>
        <label class="sbe-hudc-check"><input type="checkbox" data-set="settings.directRun" ${s.directRun ? "checked" : ""}> ${L("SBE.Hud.DirectRun")}</label>
        <label class="sbe-hudc-check"><input type="checkbox" data-set="settings.hotbarButton" ${s.hotbarButton ? "checked" : ""}> ${L("SBE.Hud.HotbarButton")}</label>
        <label class="sbe-hudc-check"><input type="checkbox" data-set="settings.effectsButton" ${s.effectsButton ? "checked" : ""}> ${L("SBE.Hud.EffectsButton")}</label>
      </div>
      ${this.#minisHtml()}`) + `
      <div class="sbe-hudc-cols">
        <aside class="sbe-hudc-src">
          <p class="notes">${L("SBE.Hud.SrcHint")}</p>
          ${group("SBE.Hud.SrcLayout", [chip("menu", "", L("SBE.Hud.T_menu")), chip("separator", "", L("SBE.Hud.T_separator"))])}
          ${group("SBE.Hud.SrcValues", values)}
          ${group("SBE.Hud.SrcButtons", buttons)}
          ${group("SBE.Hud.SrcSlots", slots)}
          ${group("SBE.Hud.SrcLists", lists)}
          <h4>${L("SBE.Hud.SrcModels")}</h4><p class="notes">${L("SBE.Hud.SrcModelsHint")}</p>
        </aside>
        <div class="sbe-hudc-tree" data-drop-root="1">
          ${w.nodes.length ? this.#treeHtml(w.nodes) : `<p class="sbe-hudc-hint">${L("SBE.Hud.TreeEmpty")}</p>`}
        </div>
      </div>`;
  }

  #treeHtml(list) {
    return list.map(n => {
      const style = n.color ? ` style="--hud-node:${esc(n.color)}"` : "";
      const icon = n.icon ? hudIcon(n.icon) : hudIcon(TYPE_ICON[n.type]);
      const badge = `${L(`SBE.Hud.T_${n.type}`)}${n.key ? ` · ${esc(n.key)}` : ""}${n.groupBy ? ` · ↳ ${esc(n.groupBy)}` : ""}`;
      return `
        <div class="sbe-hudc-node" data-id="${n.id}">
          <div class="sbe-hudc-row" draggable="true"${style}>
            <span class="sbe-hudc-grab">⠿</span>
            <span class="sbe-hudc-ic">${icon}</span>
            <span>${esc(this.#nameOf(n))}${n.playerVisible === false ? ` <i class="fa-solid fa-eye-slash" title="${esc(L("SBE.Hud.GmOnly"))}"></i>` : ""}</span>
            <span class="sbe-hudc-type">${badge}</span>
            ${n.type !== "separator" ? `<a data-node="edit" title="${esc(L("SBE.Hud.EditNode"))}"><i class="fa-solid fa-pen"></i></a>` : ""}
            <a data-node="dup" title="${esc(L("SBE.Hud.DupNode"))}"><i class="fa-solid fa-clone"></i></a>
            <a data-node="del" title="${esc(L("SBE.Hud.DelNode"))}"><i class="fa-solid fa-trash"></i></a>
          </div>
          ${this._edit === n.id ? this.#editHtml(n) : ""}
          ${n.type === "menu" ? `<div class="sbe-hudc-kids" data-drop-into="${n.id}">${this.#treeHtml(n.children ?? [])}</div>` : ""}
        </div>`;
    }).join("");
  }

  #editHtml(n) {
    const els = this.#els();
    const f = (label, inner) => `<label class="sbe-hudc-f"><span>${L(label)}</span>${inner}</label>`;
    const keySel = (kinds, refs = false) => `<select data-nf="key">${els
      .filter(e => kinds.includes(e.kind) && (!refs || !isRefList(e)))
      .map(e => `<option value="${esc(e.key)}" ${e.key === n.key ? "selected" : ""}>${esc(e.label || e.key)} (${esc(e.key)})</option>`).join("")}
      ${n.key && !els.some(e => e.key === n.key) ? `<option value="${esc(n.key)}" selected>⚠ ${esc(n.key)}</option>` : ""}</select>`;
    let typed = "";
    if (n.type === "value") typed = f("SBE.Hud.Source", keySel(VALUE_KINDS));
    else if (n.type === "button") typed = f("SBE.Hud.Source", keySel(["button"]));
    else if (n.type === "slot") typed = f("SBE.Hud.Source", keySel(["slot"]));
    else if (n.type === "list") {
      const lists = els.filter(e => e.kind === "container" && !isRefList(e));
      typed = f("SBE.Hud.Source", `<select data-nf="key"><option value="" ${!n.key ? "selected" : ""}>${L("SBE.Hud.ListAll")}</option>${lists
        .map(e => `<option value="${esc(e.key)}" ${e.key === n.key ? "selected" : ""}>${esc(e.label || e.key)} (${esc(e.key)})</option>`).join("")}</select>`) +
        f("SBE.Hud.Tags", `<input type="text" data-nf="tags" value="${esc(n.tags ?? "")}" placeholder="${esc(L("SBE.Hud.TagsPh"))}">`) +
        f("SBE.Hud.GroupBy", `<select data-nf="groupBy"><option value="">${L("SBE.Hud.GroupNone")}</option>${this.#itemKeys()
          .map(([k, lbl]) => `<option value="${esc(k)}" ${k === n.groupBy ? "selected" : ""}>${esc(lbl)}</option>`).join("")}</select>`) +
        `<p class="notes" style="grid-column:1/-1">${L("SBE.Hud.ListHint")}</p>`;
    } else if (n.type === "menu") {
      typed = `<label class="sbe-hudc-check"><input type="checkbox" data-nf="keepEmpty" ${n.keepEmpty ? "checked" : ""}> ${L("SBE.Hud.KeepEmpty")}</label>`;
    } else if (n.type === "model") typed = `<p class="notes" style="grid-column:1/-1">${L("SBE.Hud.ModelHint", { name: esc(n.modelName) })}</p>`;
    return `
      <div class="sbe-hudc-edit" data-edit="${n.id}">
        ${f("SBE.Hud.Label", `<input type="text" data-nf="label" value="${esc(n.label ?? "")}" placeholder="${esc(this.#nameOf({ ...n, label: "" }))}">`)}
        ${f("SBE.Hud.Icon", `<span class="sbe-hudc-icrow"><input type="text" data-nf="icon" value="${esc(n.icon ?? "")}" placeholder="${esc(L("SBE.Hud.IconPh"))}">
          <button type="button" data-pick="icon" title="${esc(L("SBE.Hud.PickIcon"))}"><i class="fa-solid fa-icons"></i></button>
          <button type="button" data-pick="file" title="${esc(L("SBE.Common.Browse"))}"><i class="fa-solid fa-file-image"></i></button></span>`)}
        ${f("SBE.Hud.Color", `<span class="sbe-hudc-icrow"><input type="color" data-nf="color" value="${esc(n.color || "#b5471f")}" ${n.color ? "" : 'data-unset="1"'}>
          <button type="button" data-pick="nocolor" title="${esc(L("SBE.Hud.NoColor"))}"><i class="fa-solid fa-xmark"></i></button></span>`)}
        <label class="sbe-hudc-check"><input type="checkbox" data-nf="playerVisible" ${n.playerVisible !== false ? "checked" : ""}> ${L("SBE.Hud.PlayerVisible")}</label>
        ${typed}
      </div>`;
  }

  #lookHtml() {
    const lk = this._w.look;
    const ly = lk.layout;
    const pal = paletteOf(this._w);
    const numF = (name, label, min, max, step = 1) =>
      `<label class="sbe-hudc-f"><span>${L(label)}</span><input type="number" data-set="look.layout.${name}" value="${ly[name]}" min="${min}" max="${max}" step="${step}"></label>`;
    const sel = (name, list, pre) => `<label class="sbe-hudc-f"><span>${L(`${pre}`)}</span><select data-set="look.layout.${name}">${list
      .map(v => `<option value="${v}" ${ly[name] === v ? "selected" : ""}>${L(`${pre}_${v}`)}</option>`).join("")}</select></label>`;
    const sec = (...a) => this.#sec(...a);
    const group = (icon, title, body) => `
      <fieldset class="sbe-hudc-grp"><legend><i class="${icon}"></i> ${L(title)}</legend><div class="sbe-hudc-grid">${body}</div></fieldset>`;
    const decos = lk.decorations.map((d, i) => `
      <div class="sbe-hudc-deco" data-deco="${i}">
        <header class="sbe-hudc-deco-head">
          <span><i class="fa-solid fa-shapes"></i> ${L("SBE.Hud.DecoN")} ${i + 1}</span>
          <button type="button" class="sbe-hudc-deco-del" data-deco-del="${i}" data-tooltip-text="${esc(L("SBE.Common.Delete"))}"><i class="fa-solid fa-trash"></i></button>
        </header>
        <div class="sbe-hudc-grid">
          <label class="sbe-hudc-f"><span>${L("SBE.TplTheme.Deco.Source")}</span><select data-df="source">
            <option value="code" ${d.source === "code" ? "selected" : ""}>${L("SBE.TplTheme.Deco.SourceCode")}</option>
            <option value="file" ${d.source === "file" ? "selected" : ""}>${L("SBE.TplTheme.Deco.SourceFile")}</option></select></label>
          <label class="sbe-hudc-f"><span>${L("SBE.TplTheme.Deco.Anchor")}</span><select data-df="anchor">${DECO_ANCHORS
            .map(a => `<option value="${a}" ${d.anchor === a ? "selected" : ""}>${L(`SBE.TplTheme.Deco.Anchor${DECO_ANCHOR_KEY[a]}`)}</option>`).join("")}</select></label>
          <label class="sbe-hudc-f"><span>${L("SBE.TplTheme.Deco.Offset")} X</span><input type="number" data-df="dx" value="${d.dx}"></label>
          <label class="sbe-hudc-f"><span>${L("SBE.TplTheme.Deco.Offset")} Y</span><input type="number" data-df="dy" value="${d.dy}"></label>
          <label class="sbe-hudc-f"><span>${L("SBE.TplTheme.Deco.Size")} ${L("SBE.TplTheme.Deco.W")}</span><input type="number" data-df="width" value="${d.width}" min="4"></label>
          <label class="sbe-hudc-f"><span>${L("SBE.TplTheme.Deco.Size")} ${L("SBE.TplTheme.Deco.H")}</span><input type="number" data-df="height" value="${d.height}" min="4"></label>
          <label class="sbe-hudc-f"><span>${L("SBE.TplTheme.Deco.Layer")}</span><select data-df="layer">
            <option value="above" ${d.layer !== "below" ? "selected" : ""}>${L("SBE.TplTheme.Deco.LayerAbove")}</option>
            <option value="below" ${d.layer === "below" ? "selected" : ""}>${L("SBE.TplTheme.Deco.LayerBelow")}</option></select></label>
          <label class="sbe-hudc-f"><span>${L("SBE.TplTheme.Deco.Opacity")}</span><input type="number" data-df="opacity" value="${d.opacity}" min="0" max="100"></label>
        </div>
        ${d.source === "file"
          ? `<label class="sbe-hudc-f"><span>${L("SBE.TplTheme.Deco.Path")}</span><span class="sbe-hudc-icrow"><input type="text" data-df="path" value="${esc(d.path)}"><button type="button" data-deco-file="${i}"><i class="fa-solid fa-file-image"></i></button></span></label>`
          : `<label class="sbe-hudc-f"><span>${L("SBE.TplTheme.Deco.Code")}</span><textarea data-df="code" placeholder="${esc(L("SBE.TplTheme.Deco.CodePh"))}">${esc(d.code)}</textarea></label>`}
      </div>`).join("");
    const pal3 = `
        <div class="sbe-hudc-pal">
          <span></span><span class="sbe-hudc-palhead">${L("SBE.Hud.Mode_dark")}</span><span class="sbe-hudc-palhead">${L("SBE.Hud.Mode_light")}</span>
          ${HUD_TOKENS.map(t => `<span>${L(`SBE.Hud.Tok_${t}`)}</span>${["dark", "light"].map(m => {
            const c = splitColor(pal[m][t]);
            return `<span class="sbe-hudc-palcell" data-pal="${m}.${t}">
              <input type="color" class="sbe-hudc-palc" value="${c.hex}">
              <input type="number" class="sbe-hudc-pala" value="${c.alpha}" min="0" max="100" step="1" title="${esc(L("SBE.Hud.Alpha"))}"><small>%</small></span>`;
          }).join("")}`).join("")}
        </div>
        <p class="notes">${L("SBE.Hud.AlphaHint")}</p>
        <p class="notes">${L("SBE.Hud.LookColorsOrder")}</p>
        <button type="button" data-do="palreset"><i class="fa-solid fa-rotate-left"></i> ${L("SBE.Hud.PalReset")}</button>`;
    /* POSITION DE DÉPART : un petit écran cliquable + X / Y en %. */
    const presets = [["50,80", "PosBottom"], ["50,12", "PosTop"], ["8,50", "PosLeft"], ["92,50", "PosRight"], ["50,50", "PosCenter"]];
    const position = `
      <fieldset class="sbe-hudc-grp sbe-hudc-posgrp"><legend><i class="fa-solid fa-crosshairs"></i> ${L("SBE.Hud.StartPos")}</legend>
        <div class="sbe-hudc-pos">
          <div class="sbe-hudc-screen" data-tooltip-text="${esc(L("SBE.Hud.ScreenTip"))}">
            <span class="sbe-hudc-screen-bar ${ly.orientation === "column" ? "is-col" : ""}" style="left:${ly.posX}%;top:${ly.posY}%"></span>
          </div>
          <div class="sbe-hudc-posf">
            <div class="sbe-hudc-posxy">
            <label class="sbe-hudc-f"><span>${L("SBE.Hud.PosX")}</span><input type="number" data-set="look.layout.posX" value="${ly.posX}" min="0" max="100" step="1"></label>
            <label class="sbe-hudc-f"><span>${L("SBE.Hud.PosY")}</span><input type="number" data-set="look.layout.posY" value="${ly.posY}" min="0" max="100" step="1"></label>
            </div>
            <div class="sbe-hudc-presets">${presets.map(([v, k]) => `<button type="button" data-pos="${v}">${L(`SBE.Hud.${k}`)}</button>`).join("")}</div>
          </div>
        </div>
        <p class="notes">${L("SBE.Hud.StartPosHint")}</p>
      </fieldset>`;
    const layout = position
      + group("fa-solid fa-grip", "SBE.Hud.GrpBar", `
          ${sel("orientation", ORIENTATIONS, "SBE.Hud.Orientation")}
          ${sel("labels", LABEL_MODES, "SBE.Hud.Labels")}
          <label class="sbe-hudc-check"><input type="checkbox" data-set="look.layout.iconTop" ${ly.iconTop ? "checked" : ""}> ${L("SBE.Hud.IconTop")}</label>`)
      + group("fa-solid fa-id-badge", "SBE.Hud.GrpHead", `
          <label class="sbe-hudc-check"><input type="checkbox" data-set="look.layout.showPortrait" ${ly.showPortrait ? "checked" : ""}> ${L("SBE.Hud.ShowPortrait")}</label>
          <label class="sbe-hudc-check"><input type="checkbox" data-set="look.layout.showName" ${ly.showName ? "checked" : ""}> ${L("SBE.Hud.ShowName")}</label>
          ${sel("headerPos", HEAD_SIDES, "SBE.Hud.HeadPos")}
          ${sel("chromePos", CHROME_SIDES, "SBE.Hud.ChromePos")}
          ${numF("portraitSize", "SBE.Hud.PortraitSize", 12, 200)}
          ${numF("nameSize", "SBE.Hud.NameSize", 8, 48)}
          <p class="notes sbe-hudc-full">${L("SBE.Hud.HeadHint")}</p>`)
      + group("fa-solid fa-up-right-and-down-left-from-center", "SBE.Hud.GrpBtnBar", `
          ${numF("hudWidth", "SBE.Hud.HudWidth", 0, 2000)}
          ${numF("btnWidth", "SBE.Hud.BtnWidth", 0, 600)}
          ${numF("size", "SBE.Hud.Size", 24, 160)}
          <p class="notes sbe-hudc-full">${L("SBE.Hud.BtnWidthHint")}</p>`)
      + group("fa-solid fa-bars", "SBE.Hud.GrpBtnMenu", `
          ${numF("panelWidth", "SBE.Hud.PanelWidth", 120, 600)}
          ${numF("itemHeight", "SBE.Hud.ItemHeight", 0, 200)}
          <p class="notes sbe-hudc-full">${L("SBE.Hud.ItemHeightHint")}</p>`)
      + group("fa-solid fa-text-height", "SBE.Hud.GrpSizes", `
          ${numF("iconSize", "SBE.Hud.IconSize", 8, 128)}
          ${numF("itemSize", "SBE.Hud.ItemSize", 8, 128)}
          ${numF("fontSize", "SBE.Hud.FontSize", 8, 32)}`)
      + group("fa-solid fa-droplet", "SBE.Hud.GrpLook", `
          ${numF("gap", "SBE.Hud.Gap", 0, 40)}
          ${numF("radius", "SBE.Hud.Radius", 0, 80)}
          ${numF("opacity", "SBE.Hud.Opacity", 10, 100)}
          ${numF("blur", "SBE.Hud.Blur", 0, 20)}`);
    return sec("colors", "fa-solid fa-palette", "SBE.Hud.LookColors", "SBE.Hud.LookColorsHint", pal3)
      + sec("layout", "fa-solid fa-table-cells-large", "SBE.Hud.LookLayout", "", layout)
      + sec("deco", "fa-solid fa-shapes", "SBE.TplTheme.Deco.Title", "SBE.Hud.DecoHint", `${decos}
        <button type="button" data-do="decoadd"><i class="fa-solid fa-plus"></i> ${L("SBE.TplTheme.Deco.Add")}</button>`)
      + sec("css", "fa-solid fa-code", "SBE.Hud.LookCss", "SBE.Hud.LookCssHint", `
        <textarea class="sbe-hudc-css" data-set="look.customCss" spellcheck="false">${esc(lk.customCss)}</textarea>`);
  }

  /** Position de départ : clic / glisser sur le petit écran, préréglages. */
  #wirePosition(root) {
    const screen = root.querySelector(".sbe-hudc-screen");
    if (!screen) return;
    const set = (x, y) => {
      x = Math.round(Math.min(100, Math.max(0, x)));
      y = Math.round(Math.min(100, Math.max(0, y)));
      this._w.look.layout.posX = x;
      this._w.look.layout.posY = y;
      const bar = screen.querySelector(".sbe-hudc-screen-bar");
      if (bar) { bar.style.left = `${x}%`; bar.style.top = `${y}%`; }
      const ix = root.querySelector('[data-set="look.layout.posX"]');
      const iy = root.querySelector('[data-set="look.layout.posY"]');
      if (ix) ix.value = x;
      if (iy) iy.value = y;
      this.#preview();
    };
    const fromEv = (ev) => {
      const r = screen.getBoundingClientRect();
      set((ev.clientX - r.left) / r.width * 100, (ev.clientY - r.top) / r.height * 100);
    };
    screen.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      fromEv(ev);
      const move = (e) => fromEv(e);
      const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });
    for (const b of root.querySelectorAll("[data-pos]")) {
      b.addEventListener("click", () => { const [x, y] = b.dataset.pos.split(",").map(Number); set(x, y); });
    }
    /* Saisie au clavier : le repère suit. */
    for (const k of ["posX", "posY"]) {
      root.querySelector(`[data-set="look.layout.${k}"]`)?.addEventListener("change", () => {
        const ly = this._w.look.layout;
        set(Number(ly.posX) || 0, Number(ly.posY) || 0);
      });
    }
  }

  /* Le défilement est gardé pour toutes les fenêtres (helpers/keep-scroll.mjs). */
  _replaceHTML(result, content) {
    content.innerHTML = result;
  }

  /* ============================================================ */
  /*  Interactions                                                 */
  /* ============================================================ */

  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element;
    for (const a of root.querySelectorAll("[data-tab]")) {
      a.addEventListener("click", () => { this._tab = a.dataset.tab; this.render(); });
    }
    /* Réglages simples : écrits dans la copie de travail. */
    for (const inp of root.querySelectorAll("[data-set]")) {
      const ev = inp.tagName === "TEXTAREA" || inp.type === "text" ? "input" : "change";
      inp.addEventListener(ev, () => {
        const v = inp.type === "checkbox" ? inp.checked : (inp.type === "number" ? Number(inp.value) : inp.value);
        foundry.utils.setProperty(this._w, inp.dataset.set, v);
        this.#preview();
      });
    }
    /* Couleur + opacité (%) → « #rrggbb » ou « #rrggbbaa ». */
    for (const cell of root.querySelectorAll("[data-pal]")) {
      const [mode, t] = cell.dataset.pal.split(".");
      const write = () => {
        this._w.look.palette[mode][t] = joinColor(cell.querySelector(".sbe-hudc-palc").value, cell.querySelector(".sbe-hudc-pala").value);
        this.#preview();
      };
      for (const inp of cell.querySelectorAll("input")) inp.addEventListener("input", write);
    }
    for (const b of root.querySelectorAll("[data-do]")) b.addEventListener("click", () => this.#do(b.dataset.do));
    /* Sections : le pli tenu à la main survit aux rafraîchissements. */
    for (const d of root.querySelectorAll("details.sbe-hudc-sec")) {
      d.addEventListener("toggle", () => { (this._open ??= {})[d.dataset.sec] = d.open; });
    }
    this.#wirePosition(root);
    root.querySelector(".sbe-hudc-pmode")?.addEventListener("change", (e) => { this._mode = e.target.value; this.#preview(); });
    root.querySelector(".sbe-hudc-pactor")?.addEventListener("change", (e) => { this._actorId = e.target.value; this.#preview(); });
    /* Aperçu repliable : l'organisation gagne la place. */
    root.querySelector(".sbe-hudc-pfold")?.addEventListener("click", (ev) => {
      const box = root.querySelector(".sbe-hudc-preview");
      const folded = box.classList.toggle("is-folded");
      (this._open ??= {}).preview = !folded;
      ev.currentTarget.dataset.tooltipText = L(folded ? "SBE.Hud.PreviewUnfold" : "SBE.Hud.PreviewFold");
    });
    root.querySelector(".sbe-hudc-live")?.addEventListener("click", () => {
      this._live = !this._live;
      if (!this._live) SBEHud.preview(null);
      this.render();
    });
    this.#wireTree(root);
    this.#wireDecos(root);
    this.#wireMinis(root);
    this.#preview();
  }

  async #do(what) {
    if (what === "save") return this.#save();
    if (what === "export") return this.#export();
    if (what === "import") return this.#import();
    if (what === "pos") { await SBEHud.resetPosition(); return; }
    if (what === "palreset") { this._w.look.palette = { dark: {}, light: {} }; return this.render(); }
    if (what === "decoadd") { this._w.look.decorations.push(cleanDecoration({})); return this.render(); }
    if (what === "miniadd") { (this._w.minis ??= []).push(cleanMini({})); return this.render(); }
  }

  /* --- Arbre --- */

  #wireTree(root) {
    const tree = root.querySelector(".sbe-hudc-tree");
    if (!tree) return;
    for (const c of root.querySelectorAll(".sbe-hudc-chip")) {
      c.addEventListener("dragstart", (ev) => {
        ev.dataTransfer.setData(DND, JSON.stringify({ add: { type: c.dataset.newType, key: c.dataset.newKey } }));
        ev.dataTransfer.effectAllowed = "copy";
      });
      /* Double-clic : ajout en fin de barre (sans glisser). */
      c.addEventListener("dblclick", () => this.#insert(this.#fresh(c.dataset.newType, c.dataset.newKey), null, "end"));
    }
    for (const row of tree.querySelectorAll(".sbe-hudc-row")) {
      const id = row.closest(".sbe-hudc-node").dataset.id;
      row.addEventListener("dragstart", (ev) => {
        ev.stopPropagation();
        ev.dataTransfer.setData(DND, JSON.stringify({ move: id }));
        ev.dataTransfer.effectAllowed = "move";
      });
      for (const a of row.querySelectorAll("[data-node]")) {
        a.addEventListener("click", (ev) => { ev.stopPropagation(); this.#nodeAction(a.dataset.node, id); });
      }
    }
    const clear = () => tree.querySelectorAll(".drop-before,.drop-after,.drop-into,.drop-end").forEach(n => n.classList.remove("drop-before", "drop-after", "drop-into", "drop-end"));
    const where = (ev) => {
      const node = ev.target.closest(".sbe-hudc-node");
      if (!node) return { id: null, pos: "end" };
      const row = node.querySelector(":scope > .sbe-hudc-row");
      const r = row.getBoundingClientRect();
      const y = (ev.clientY - r.top) / r.height;
      const isMenu = !!node.querySelector(":scope > .sbe-hudc-kids");
      /* Sous la ligne d'un menu, dans ses enfants : avant/après eux. */
      if (ev.clientY > r.bottom) return { id: node.dataset.id, pos: isMenu ? "into" : "after", node };
      const pos = isMenu && y > 0.3 && y < 0.7 ? "into" : (y < 0.5 ? "before" : "after");
      return { id: node.dataset.id, pos, node };
    };
    tree.addEventListener("dragover", (ev) => {
      ev.preventDefault();
      clear();
      const w = where(ev);
      if (!w.id) tree.classList.add("drop-end");
      else w.node.classList.add(`drop-${w.pos}`);
    });
    tree.addEventListener("dragleave", (ev) => { if (!tree.contains(ev.relatedTarget)) clear(); });
    tree.addEventListener("drop", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      clear();
      const w = where(ev);
      let data = null;
      try { data = JSON.parse(ev.dataTransfer.getData(DND) || "null"); } catch (_e) { /* */ }
      if (data?.add) return this.#insert(this.#fresh(data.add.type, data.add.key), w.id, w.pos);
      if (data?.move) return this.#move(data.move, w.id, w.pos);
      /* Un objet du monde glissé depuis la barre latérale. */
      let fd = null;
      try { fd = foundry.applications.ux.TextEditor.implementation.getDragEventData(ev); } catch (_e) { /* */ }
      if (fd?.type === "Item" && fd.uuid) {
        const it = await fromUuid(fd.uuid).catch(() => null);
        if (!it || it.type !== "objet") { ui.notifications.warn(L("SBE.Hud.DropNotObject")); return; }
        const modelId = it.system?.modelId || it.id;
        return this.#insert(cleanNode({ type: "model", modelId, modelName: it.name }), w.id, w.pos);
      }
    });
    /* Édition d'une entrée : écrite à chaque frappe, sans re-rendu. */
    for (const box of tree.querySelectorAll(".sbe-hudc-edit")) {
      const found = locate(this._w.nodes, box.dataset.edit);
      if (!found) continue;
      const n = found.node;
      for (const inp of box.querySelectorAll("[data-nf]")) {
        const ev = inp.type === "text" ? "input" : "change";
        inp.addEventListener(ev, () => {
          const f = inp.dataset.nf;
          if (f === "playerVisible") { if (inp.checked) delete n.playerVisible; else n.playerVisible = false; }
          else if (f === "keepEmpty") { if (inp.checked) n.keepEmpty = true; else delete n.keepEmpty; }
          else if (f === "color") { n.color = inp.value; delete inp.dataset.unset; }
          else if (inp.value.trim()) n[f] = inp.value.trim();
          else if (f === "key" && n.type !== "list") return;
          else delete n[f];
          if (ev === "change") this.render();
          else this.#preview();
        });
      }
      box.querySelector('[data-pick="icon"]')?.addEventListener("click", async () => {
        const ic = await pickIcon();
        if (!ic) return;
        n.icon = ic;
        this.render();
      });
      box.querySelector('[data-pick="file"]')?.addEventListener("click", () => {
        const FP = foundry.applications.apps.FilePicker.implementation;
        new FP({ type: "image", current: n.icon ?? "", callback: (p) => { n.icon = p; this.render(); } }).render(true);
      });
      box.querySelector('[data-pick="nocolor"]')?.addEventListener("click", () => { delete n.color; this.render(); });
    }
  }

  #fresh(type, key) {
    const n = { id: foundry.utils.randomID(), type };
    if (type === "menu") n.children = [];
    if (["value", "button", "slot", "list"].includes(type)) n.key = key ?? "";
    return n;
  }

  #insert(node, targetId, pos) {
    if (!node) return;
    const nodes = this._w.nodes;
    const t = targetId ? locate(nodes, targetId) : null;
    if (!t) nodes.push(node);
    else if (pos === "into") (t.node.children ??= []).push(node);
    else t.list.splice(t.index + (pos === "after" ? 1 : 0), 0, node);
    if (node.type === "menu" || node.type === "list") this._edit = node.id;
    this.render();
  }

  #move(id, targetId, pos) {
    if (id === targetId) return;
    const src = locate(this._w.nodes, id);
    if (!src) return;
    /* Un menu ne se range pas dans l'un de ses propres sous-menus. */
    if (targetId && contains(src.node, targetId)) { ui.notifications.warn(L("SBE.Hud.MoveIntoSelf")); return; }
    src.list.splice(src.index, 1);
    this.#insert(src.node, targetId, pos);
  }

  async #nodeAction(what, id) {
    const f = locate(this._w.nodes, id);
    if (!f) return;
    if (what === "edit") { this._edit = this._edit === id ? null : id; return this.render(); }
    if (what === "dup") {
      const copy = foundry.utils.deepClone(f.node);
      for (const n of [copy, ...(function* w(l) { for (const x of l ?? []) { yield x; yield* w(x.children); } })(copy.children)]) n.id = foundry.utils.randomID();
      f.list.splice(f.index + 1, 0, copy);
      return this.render();
    }
    if (what === "del") {
      /* Jamais bloqué : un menu plein est signalé avant d'être retiré. */
      const kids = f.node.type === "menu" ? (f.node.children ?? []).length : 0;
      if (kids) {
        const ok = await foundry.applications.api.DialogV2.confirm({
          window: { title: L("SBE.Hud.DelNode") },
          content: `<p>${L("SBE.Hud.DelMenuWarn", { name: esc(this.#nameOf(f.node)), n: kids })}</p>`
        });
        if (!ok) return;
      }
      f.list.splice(f.index, 1);
      if (this._edit === id) this._edit = null;
      return this.render();
    }
  }

  /* --- Petits boutons --- */

  #wireMinis(root) {
    const list = this._w.minis ?? [];
    for (const box of root.querySelectorAll(".sbe-hudc-mini")) {
      const m = list[Number(box.dataset.mini)];
      if (!m) continue;
      for (const inp of box.querySelectorAll("[data-mf]")) {
        const ev = inp.tagName === "SELECT" ? "change" : "input";
        inp.addEventListener(ev, () => {
          m[inp.dataset.mf] = inp.value.trim();
          if (inp.dataset.mf === "kind") return this.render();
          this.#preview();
        });
      }
    }
    for (const b of root.querySelectorAll("[data-mini-icon]")) {
      b.addEventListener("click", async () => {
        const m = list[Number(b.dataset.miniIcon)];
        const ic = await pickIcon();
        if (!m || !ic) return;
        m.icon = ic;
        this.render();
      });
    }
    for (const b of root.querySelectorAll("[data-mini-del]")) {
      b.addEventListener("click", () => { list.splice(Number(b.dataset.miniDel), 1); this.render(); });
    }
  }

  /* --- Décorations --- */

  #wireDecos(root) {
    for (const box of root.querySelectorAll(".sbe-hudc-deco")) {
      const d = this._w.look.decorations[Number(box.dataset.deco)];
      if (!d) continue;
      for (const inp of box.querySelectorAll("[data-df]")) {
        const ev = inp.tagName === "TEXTAREA" || inp.type === "text" || inp.type === "number" ? "input" : "change";
        inp.addEventListener(ev, () => {
          d[inp.dataset.df] = inp.type === "number" ? Number(inp.value) : inp.value;
          if (inp.dataset.df === "source") return this.render();
          this.#preview();
        });
      }
    }
    for (const b of root.querySelectorAll("[data-deco-del]")) {
      b.addEventListener("click", () => { this._w.look.decorations.splice(Number(b.dataset.decoDel), 1); this.render(); });
    }
    for (const b of root.querySelectorAll("[data-deco-file]")) {
      b.addEventListener("click", () => {
        const d = this._w.look.decorations[Number(b.dataset.decoFile)];
        const FP = foundry.applications.apps.FilePicker.implementation;
        new FP({ type: "image", current: d.path ?? "", callback: (p) => { d.path = p; this.render(); } }).render(true);
      });
    }
  }

  /* --- Aperçu --- */

  #preview() {
    clearTimeout(this._pt);
    this._pt = setTimeout(() => this.#drawPreview(), 80);
  }

  #drawPreview() {
    const host = this.element?.querySelector(".sbe-hudc-hud");
    if (!host) return;
    /* Copie nettoyée pour l'aperçu : la copie de travail garde ses
       objets (les champs ouverts écrivent dedans). */
    const cfg = normalizeHud(this._w);
    const scope = `prev-${this.document.id}`;
    injectHudCss(scope, cfg);
    const actor = this._actorId ? game.actors.get(this._actorId) : null;
    const box = this.element;
    this._view?.closeAll();
    this._view = new HudView({
      root: host, baseClass: "sbe-hudc-hud", scope, cfg, tpl: this.document, actor, preview: true, mode: this.#mode(),
      chrome: hudChrome(cfg, { locked: !!game.user.getFlag?.(SYSTEM_ID, "hudLocked"), hideBar: !!game.settings.get(SYSTEM_ID, "hudHideHotbar"), actor, preview: true }),
      bounds: () => {
        const r = box.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      }
    });
    this._view.render();
    host.style.opacity = String(cfg.look.layout.opacity / 100);
    if (this._live) SBEHud.preview(this.document.id, cfg);
  }

  /* --- Enregistrer, exporter, importer --- */

  async #save() {
    const cfg = normalizeHud(this._w);
    await this.document.update({ "system.hud": foundry.data.operators.ForcedReplacement.create(cfg) });
    this._w = cfg;
    ui.notifications.info(L("SBE.Hud.Saved"));
    SBEHud.refresh();
    this.render();
  }

  #export() {
    const data = JSON.stringify({ sbe: "hud", format: 1, hud: normalizeHud(this._w) }, null, 2);
    const safe = String(this.document.name ?? "hud").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
    foundry.utils.saveDataToFile(data, "application/json", `sbe-hud-${safe || "modele"}.json`);
  }

  /** Import : remplace ce qui est affiché ; rien n'est écrit avant
      Enregistrer. Les clés absentes de ce modèle restent, signalées ⚠. */
  #import() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      let json = null;
      try { json = JSON.parse(await file.text()); } catch (_e) { /* illisible */ }
      if (json?.sbe !== "hud" || typeof json.hud !== "object") { ui.notifications.error(L("SBE.Hud.ImportBad")); return; }
      this._w = normalizeHud(json.hud);
      const keys = new Set(this.#els().map(e => e.key));
      const missing = [];
      for (const n of (function* w(l) { for (const x of l ?? []) { yield x; yield* w(x.children); } })(this._w.nodes)) {
        if (n.key && !keys.has(n.key)) missing.push(n.key);
      }
      await this.render();
      if (missing.length) ui.notifications.warn(L("SBE.Hud.ImportMissing", { keys: [...new Set(missing)].join(", ") }));
      ui.notifications.info(L("SBE.Hud.ImportDone"));
    });
    input.click();
  }

  async close(options) {
    if (this._live) SBEHud.preview(null);
    this._view?.closeAll();
    document.getElementById(`sbe-hud-css-prev-${this.document?.id}`)?.remove();
    return super.close(options);
  }
}

/** Choix du modèle (menu des réglages) → son manager de HUD. */
export class SBEHudPicker extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "sbe-hud-picker",
    tag: "div",
    window: { title: "SBE.Hud.MenuName", icon: "fa-solid fa-gamepad" },
    position: { width: 380 }
  };

  async _renderHTML() {
    /* Modèles de personnage seulement (une boutique n'a pas de HUD). */
    const tpls = game.actors.filter(a => a.type === "template" && a.system?.genre !== "shop");
    return `<div style="padding:8px;display:flex;flex-direction:column;gap:6px">
      <p class="notes">${L("SBE.Hud.PickerHint")}</p>
      ${tpls.map(t => `<button type="button" data-tpl="${t.id}"><i class="fa-solid fa-gamepad"></i> ${esc(t.name)}${t.system?.hud?.enabled ? " ✔" : ""}</button>`).join("")
        || `<p class="sbe-hudc-hint">${L("SBE.Hud.PickerNone")}</p>`}
    </div>`;
  }

  _replaceHTML(result, content) { content.innerHTML = result; }

  _onRender() {
    for (const b of this.element.querySelectorAll("[data-tpl]")) {
      b.addEventListener("click", () => {
        const doc = game.actors.get(b.dataset.tpl);
        if (doc) openHudConfig(doc);
        this.close();
      });
    }
  }
}

export function openHudConfig(doc) {
  const id = `sbe-hud-config-${doc.id}`;
  const open = foundry.applications.instances.get(id);
  if (open) return open.bringToFront?.() ?? open.render(true);
  new SBEHudConfig({ id, document: doc }).render(true);
}

export { HUD_PALETTE_DEFAULTS };
