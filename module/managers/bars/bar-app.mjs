/**
 * SBE — BARRES DE JETONS : les fenêtres
 *
 * SBETokenBarsApp : « Tous les personnages » + un onglet par modèle de
 *   personnage ; liste des barres, éditeur de la barre choisie.
 * SBETokenBarDialog : une barre d'un jeton (ou du prototype) — enregistre
 *   seulement les différences avec la barre du modèle.
 * tokenBarsBoxHTML / wireTokenBarsBox : l'encart de la configuration du jeton.
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { walkElements } from "../../builder/element-renderer.mjs";
import { wireKeyLists } from "../../helpers/key-list.mjs";
import {
  cleanBar, cleanAllSet, cleanTplSet, cleanTokenSet, isEmptyTokenSet, allSet, tplSet,
  tokenSetOf, baseBarsFor, diffBar, newBarId, SET_MODES
} from "./bar-model.mjs";
import { barEditorHTML, wireBarEditor, editorTabOf } from "./bar-editor.mjs";
import { sweepBarPreviews } from "./bar-render.mjs";

/** Image de jeton pour l'aperçu : un personnage de ce modèle (ou n'importe lequel). */
function previewImg(tpl = null) {
  const list = game.actors?.filter(a => a.type === "personnage" && (!tpl || a.system?.templateId === tpl.id)) ?? [];
  const a = list[0];
  return a?.prototypeToken?.texture?.src || a?.img || "";
}

const { ApplicationV2 } = foundry.applications.api;
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

const actorTemplates = () => (game.actors?.filter(a => a.type === "template") ?? []).sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));

/** Clés proposées : celles du modèle, ou de tous les modèles. */
function keyOptions(tpl = null) {
  const out = new Map();
  for (const t of tpl ? [tpl] : actorTemplates()) {
    for (const el of walkElements(t.system?.elements ?? [])) {
      if (!el?.key || !["gauge", "number", "checkbox", "select", "text"].includes(el.kind) || out.has(el.key)) continue;
      out.set(el.key, `${el.label || el.key}${tpl ? "" : ` — ${t.name}`}`);
    }
  }
  return [...out.entries()].map(([value, label]) => ({ value, label }));
}

export function brawlActive() {
  return !!game.modules?.get("barbrawl")?.active;
}

function barSummary(b) {
  const where = `${L(`SBE.Bars.Side_.${b.side}`)} · ${L(b.inside ? "SBE.Bars.Inside" : "SBE.Bars.Outside")}${b.row ? ` · ${L("SBE.Bars.Row")} ${b.row}` : ""}`;
  return `<span class="sbe-bars-swatch" style="background:linear-gradient(90deg, ${esc(b.colorEmpty)}, ${esc(b.colorFull)})"></span>
    <span class="sbe-bars-name">${esc(b.label || b.value || L("SBE.Bars.Unnamed"))}</span>
    <span class="sbe-bars-meta">${esc(b.value || "—")} · ${esc(where)}${b.steps.length ? ` · ${esc(L("SBE.Bars.StepsN", { n: b.steps.length }))}` : ""}</span>`;
}

/* ============================================================ */
/*  Fenêtre principale                                           */
/* ============================================================ */

export class SBETokenBarsApp extends ApplicationV2 {

  static _instance = null;

  constructor(options = {}) {
    super(options);
    this._scope = options.scope ?? "all";
    this._work = new Map();
    this._sel = new Map();
    this._tab = "value";
    this._dirty = new Set();
  }

  static DEFAULT_OPTIONS = {
    id: "sbe-token-bars",
    tag: "div",
    classes: ["sbe-token-bars", "sbe-condense"],
    window: { title: "SBE.Bars.Title", icon: "fa-solid fa-bars-progress", resizable: true },
    position: { width: 1120, height: 780 }
  };

  static open(scope = "all") {
    if (!game.user.isGM) return null;
    if (this._instance?.rendered) {
      this._instance._scope = scope;
      this._instance.render();
      this._instance.bringToFront?.();
      return this._instance;
    }
    this._instance = new SBETokenBarsApp({ scope });
    this._instance.render({ force: true });
    return this._instance;
  }

  #tpl(scope = this._scope) { return scope === "all" ? null : game.actors.get(scope) ?? null; }

  /** Copie de travail d'un onglet. */
  #set(scope = this._scope) {
    if (!this._work.has(scope)) {
      const tpl = this.#tpl(scope);
      this._work.set(scope, scope === "all" ? allSet() : tplSet(tpl));
    }
    return this._work.get(scope);
  }

  #bars() { return this.#set().bars; }

  #selected() {
    const bars = this.#bars();
    const id = this._sel.get(this._scope);
    return bars.find(b => b.id === id) ?? bars[0] ?? null;
  }

  async _renderHTML() {
    if (this._scope !== "all" && !this.#tpl()) this._scope = "all";
    const set = this.#set();
    const tpl = this.#tpl();
    const scopes = [{ id: "all", name: L("SBE.Bars.ScopeAll"), icon: "fa-solid fa-users" },
      ...actorTemplates().map(t => ({ id: t.id, name: t.name, img: t.img, mode: (this._work.get(t.id) ?? tplSet(t)).mode }))];
    const side = scopes.map(s => `<a class="sbe-bars-scope ${s.id === this._scope ? "is-on" : ""}" data-scope="${esc(s.id)}">
        ${s.img ? `<img src="${esc(s.img)}" alt="">` : `<i class="${s.icon}"></i>`}
        <span>${esc(s.name)}</span>
        ${s.mode && s.mode !== "all" ? `<em>${esc(L(`SBE.Bars.Mode_.${s.mode}`))}</em>` : ""}
        ${this._dirty.has(s.id) ? `<b class="sbe-bars-dirty">●</b>` : ""}
      </a>`).join("");

    let opts;
    if (!tpl) {
      opts = `<div class="sbe-bars-opts">
        <label class="sbe-bar-check"><input type="checkbox" data-opt="keepNative" ${set.keepNative ? "checked" : ""}> ${esc(L("SBE.Bars.KeepNative"))}</label>
        <label class="sbe-bar-check"><input type="checkbox" data-opt="hideHostile" ${set.hideHostile ? "checked" : ""}> ${esc(L("SBE.Bars.HideHostile"))}</label>
        <label class="sbe-bars-num">${esc(L("SBE.Bars.HeightMul"))} <input type="number" data-opt="heightMul" value="${set.heightMul}" min="0.5" max="4" step="0.1"></label>
      </div>
      <p class="notes">${esc(L("SBE.Bars.AllHint"))}</p>`;
    } else {
      opts = `<div class="sbe-bars-opts">
        <label class="sbe-bars-num">${esc(L("SBE.Bars.Mode"))}
          <select data-opt="mode">${SET_MODES.map(m => `<option value="${m}" ${set.mode === m ? "selected" : ""}>${esc(L(`SBE.Bars.Mode_.${m}`))}</option>`).join("")}</select></label>
        ${set.mode !== "all" ? `<label class="sbe-bars-num">${esc(L("SBE.Bars.KeepNative"))}
          <select data-opt="keepNative">
            <option value="" ${set.keepNative === null ? "selected" : ""}>${esc(L("SBE.Bars.KeepInherit"))}</option>
            <option value="1" ${set.keepNative === true ? "selected" : ""}>${esc(L("SBE.Bars.Yes"))}</option>
            <option value="0" ${set.keepNative === false ? "selected" : ""}>${esc(L("SBE.Bars.No"))}</option>
          </select></label>` : ""}
      </div>
      <p class="notes">${esc(L("SBE.Bars.TplHint"))}</p>`;
    }

    const showBars = !tpl || set.mode !== "all";
    const sel = showBars ? this.#selected() : null;
    const list = showBars ? (set.bars.map((b, i) => `<div class="sbe-bars-item ${sel?.id === b.id ? "is-on" : ""}" data-bar="${esc(b.id)}">
        <a class="sbe-bars-pick" data-do="select" data-bar="${esc(b.id)}">${barSummary(b)}</a>
        <span class="sbe-bars-tools">
          <button type="button" data-do="up" data-bar="${esc(b.id)}" ${i ? "" : "disabled"} data-tooltip-text="${esc(L("SBE.Bars.Up"))}"><i class="fa-solid fa-arrow-up"></i></button>
          <button type="button" data-do="down" data-bar="${esc(b.id)}" ${i < set.bars.length - 1 ? "" : "disabled"} data-tooltip-text="${esc(L("SBE.Bars.Down"))}"><i class="fa-solid fa-arrow-down"></i></button>
          <button type="button" data-do="exportOne" data-bar="${esc(b.id)}" data-tooltip-text="${esc(L("SBE.Bars.ExportOne"))}"><i class="fa-solid fa-file-export"></i></button>
          <button type="button" data-do="importOne" data-bar="${esc(b.id)}" data-tooltip-text="${esc(L("SBE.Bars.ImportOne"))}"><i class="fa-solid fa-file-import"></i></button>
          <button type="button" data-do="dup" data-bar="${esc(b.id)}" data-tooltip-text="${esc(L("SBE.Bars.Duplicate"))}"><i class="fa-solid fa-copy"></i></button>
          <button type="button" data-do="del" data-bar="${esc(b.id)}" data-tooltip-text="${esc(L("SBE.Bars.Delete"))}"><i class="fa-solid fa-trash"></i></button>
        </span>
      </div>`).join("") || `<p class="sbe-bar-empty">${esc(L("SBE.Bars.Empty"))}</p>`)
      + `<button type="button" class="sbe-bars-add" data-do="add"><i class="fa-solid fa-plus"></i> ${esc(L("SBE.Bars.Add"))}</button>`
      : `<p class="sbe-bar-empty">${esc(L("SBE.Bars.FollowsAll"))}</p>`;

    const editor = sel ? barEditorHTML(sel, { tab: this._tab, keys: keyOptions(tpl) })
      : `<p class="notes">${esc(L(showBars ? "SBE.Bars.PickOrAdd" : "SBE.Bars.FollowsAll"))}</p>`;

    const brawl = brawlActive() ? `<div class="sbe-bars-warn sbe-help-keep"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(L("SBE.Bars.BrawlWarn"))}</div>` : "";

    return `${brawl}
      <div class="sbe-bars-root">
        <aside class="sbe-bars-scopes">${side}</aside>
        <section class="sbe-bars-mid">
          <h3>${esc(tpl ? tpl.name : L("SBE.Bars.ScopeAll"))}</h3>
          ${opts}
          <div class="sbe-bars-list">${list}</div>
        </section>
        <section class="sbe-bars-edit">${editor}</section>
      </div>
      <footer class="sbe-bars-foot">
        ${showBars ? `<button type="button" data-do="import"><i class="fa-solid fa-file-import"></i> ${esc(L("SBE.Bars.Import"))}</button>
        <button type="button" data-do="export" ${set.bars.length ? "" : "disabled"}><i class="fa-solid fa-file-export"></i> ${esc(L("SBE.Bars.Export"))}</button>` : ""}
        <button type="button" data-do="save" class="sbe-bars-save"><i class="fa-solid fa-floppy-disk"></i> ${esc(L("SBE.Bars.Save"))}</button>
      </footer>`;
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
  }

  /** Export : les barres de l'onglet (ou une seule), dans un fichier. */
  #export(list = this.#bars(), label = null) {
    const name = label ?? this.#tpl()?.name ?? L("SBE.Bars.ScopeAll");
    const data = JSON.stringify({ sbe: "tokenBars", format: 1, bars: list.map(cleanBar) }, null, 2);
    foundry.utils.saveDataToFile(data, "application/json", `sbe-barres-${name.slugify?.() ?? "export"}.json`);
  }

  /**
   * Import. Sans cible : les barres du fichier s'AJOUTENT à l'onglet
   * (nouveaux identifiants). Sur une barre : la première barre du
   * fichier la REMPLACE (elle garde sa place et son identifiant, donc
   * les réglages des jetons qui la modifient restent liés).
   */
  #import(targetId = null) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      let json = null;
      try { json = JSON.parse(await file.text()); } catch (_e) { json = null; }
      const list = Array.isArray(json?.bars) ? json.bars : null;
      if (json?.sbe !== "tokenBars" || !list?.length) { ui.notifications.error(L("SBE.Bars.ImportBad")); return; }
      const bars = this.#bars();
      const at = targetId ? bars.findIndex(b => b.id === targetId) : -1;
      if (at >= 0) {
        bars[at] = cleanBar({ ...list[0], id: targetId });
        this._sel.set(this._scope, targetId);
        ui.notifications.info(L("SBE.Bars.ImportReplaced", { name: bars[at].label || bars[at].value }));
      } else {
        for (const raw of list) bars.push(cleanBar({ ...raw, id: newBarId() }));
        this._sel.set(this._scope, bars[bars.length - 1].id);
        ui.notifications.info(L("SBE.Bars.ImportDone", { n: list.length }));
      }
      this.#touch();
      this.render();
    });
    input.click();
  }

  #touch() {
    this._dirty.add(this._scope);
    const a = this.element?.querySelector(`.sbe-bars-scope[data-scope="${CSS.escape(this._scope)}"]`);
    if (a && !a.querySelector(".sbe-bars-dirty")) a.insertAdjacentHTML("beforeend", `<b class="sbe-bars-dirty">●</b>`);
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element;
    wireKeyLists(root);
    for (const a of root.querySelectorAll("[data-scope]")) {
      a.addEventListener("click", () => { this._scope = a.dataset.scope; this.render(); });
    }
    for (const inp of root.querySelectorAll("[data-opt]")) {
      inp.addEventListener("change", () => {
        const set = this.#set();
        const k = inp.dataset.opt;
        if (inp.type === "checkbox") set[k] = inp.checked;
        else if (inp.type === "number") set[k] = Number(inp.value);
        else if (k === "keepNative") set[k] = inp.value === "" ? null : inp.value === "1";
        else set[k] = inp.value;
        this._work.set(this._scope, this._scope === "all" ? cleanAllSet(set) : cleanTplSet(set));
        this.#touch();
        if (k === "mode") this.render();
      });
    }
    for (const b of root.querySelectorAll("[data-do]")) b.addEventListener("click", (ev) => this.#act(ev, b));
    const sel = this.#selected();
    if (sel) {
      wireBarEditor(root, () => this.#selected() ?? {}, (bar, { rerender }) => {
        const bars = this.#bars();
        const i = bars.findIndex(b => b.id === bar.id);
        if (i >= 0) bars[i] = bar;
        this.#touch();
        const card = root.querySelector(`.sbe-bars-item[data-bar="${CSS.escape(bar.id)}"] .sbe-bars-pick`);
        if (card) card.innerHTML = barSummary(bar);
        if (rerender) { this._tab = editorTabOf(root); this.render(); }
      }, { img: previewImg(this.#tpl()) });
    }
  }

  async #act(ev, btn) {
    const set = this.#set();
    const bars = set.bars;
    const id = btn.dataset.bar;
    const i = bars.findIndex(b => b.id === id);
    this._tab = editorTabOf(this.element);
    switch (btn.dataset.do) {
      case "select": this._sel.set(this._scope, id); break;
      case "add": {
        const b = cleanBar({ id: newBarId(), row: bars.length ? Math.max(...bars.map(x => x.row)) + 1 : 0 });
        bars.push(b); this._sel.set(this._scope, b.id); this._tab = "value"; this.#touch(); break;
      }
      case "dup": if (i >= 0) { const c = cleanBar({ ...foundry.utils.deepClone(bars[i]), id: newBarId(), label: `${bars[i].label} (${L("SBE.Bars.Copy")})` }); bars.splice(i + 1, 0, c); this._sel.set(this._scope, c.id); this.#touch(); } break;
      case "del": if (i >= 0) { bars.splice(i, 1); this.#touch(); } break;
      case "up": if (i > 0) { [bars[i - 1], bars[i]] = [bars[i], bars[i - 1]]; this.#touch(); } break;
      case "down": if (i >= 0 && i < bars.length - 1) { [bars[i + 1], bars[i]] = [bars[i], bars[i + 1]]; this.#touch(); } break;
      case "save": await this.#save(); return;
      case "export": this.#export(); return;
      case "import": this.#import(); return;
      case "exportOne": if (i >= 0) this.#export([bars[i]], bars[i].label || bars[i].value); return;
      case "importOne": if (i >= 0) this.#import(id); return;
      default: return;
    }
    this.render();
  }

  async #save() {
    const Rep = foundry.data.operators.ForcedReplacement;
    for (const scope of this._dirty) {
      const set = this._work.get(scope);
      if (!set) continue;
      if (scope === "all") await game.settings.set(SYSTEM_ID, "tokenBars", cleanAllSet(set));
      else await this.#tpl(scope)?.update({ "system.tokenBars": Rep.create(cleanTplSet(set)) });
    }
    this._dirty.clear();
    ui.notifications.info(L("SBE.Bars.Saved"));
    this.render();
  }

  _onClose(options) {
    if (SBETokenBarsApp._instance === this) SBETokenBarsApp._instance = null;
    setTimeout(sweepBarPreviews, 50);
    return super._onClose?.(options);
  }
}

/* ============================================================ */
/*  Jeton / prototype                                            */
/* ============================================================ */

const isProto = (doc) => !(doc?.documentName === "Token");
const actorOfDoc = (doc) => (isProto(doc) ? doc?.parent ?? doc?.actor : doc?.actor);
/* Le prototype est relu sur l'acteur (il change après chaque écriture). */
const fresh = (doc) => (isProto(doc) ? (actorOfDoc(doc)?.prototypeToken ?? doc) : doc);

export async function writeTokenSet(doc, set) {
  const clean = cleanTokenSet(set);
  const ops = foundry.data.operators;
  const data = isEmptyTokenSet(clean) ? ops.ForcedDeletion.create() : ops.ForcedReplacement.create(clean);
  if (isProto(doc)) {
    const actor = actorOfDoc(doc);
    if (actor) await actor.update({ [`prototypeToken.flags.${SYSTEM_ID}.bars`]: data });
  } else await doc.update({ [`flags.${SYSTEM_ID}.bars`]: data });
}

/** Une barre d'un jeton : différences avec le modèle, ou barre propre. */
export class SBETokenBarDialog extends ApplicationV2 {
  constructor(options = {}) {
    super(options);
    this.doc = options.doc;
    this.barId = options.barId;
    this.onDone = options.onDone;
    this._tab = "value";
    const ts = tokenSetOf(fresh(this.doc));
    const extra = ts.extra.find(b => b.id === this.barId);
    if (extra) { this._extra = true; this._bar = cleanBar(extra); }
    else {
      const base = baseBarsFor(actorOfDoc(this.doc)).bars.find(x => x.bar.id === this.barId)?.bar ?? cleanBar({ id: this.barId });
      this._base = base;
      const p = ts.patch[this.barId];
      this._bar = p ? cleanBar({ ...foundry.utils.mergeObject(foundry.utils.deepClone(base), p, { inplace: false }), id: base.id }) : cleanBar(base);
    }
  }

  static DEFAULT_OPTIONS = {
    tag: "div",
    classes: ["sbe-token-bars", "sbe-token-bar-dialog", "sbe-condense"],
    window: { title: "SBE.Bars.TokenTitle", icon: "fa-solid fa-bars-progress", resizable: true },
    position: { width: 640, height: 640 }
  };

  async _renderHTML() {
    const actor = actorOfDoc(this.doc);
    return `<p class="notes">${esc(L(this._extra ? "SBE.Bars.TokenExtraHint" : "SBE.Bars.TokenPatchHint"))}</p>
      <section class="sbe-bars-edit">${barEditorHTML(this._bar, { tab: this._tab, keys: keyOptions(actor?.system?.template ?? null) })}</section>
      <footer class="sbe-bars-foot">
        <button type="button" data-do="save" class="sbe-bars-save"><i class="fa-solid fa-floppy-disk"></i> ${esc(L("SBE.Bars.Save"))}</button>
      </footer>`;
  }

  _replaceHTML(result, content) { content.innerHTML = result; }

  _onClose(options) {
    setTimeout(sweepBarPreviews, 50);
    return super._onClose?.(options);
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element;
    wireKeyLists(root);
    const actor = actorOfDoc(this.doc);
    wireBarEditor(root, () => this._bar, (bar, { rerender }) => {
      this._bar = bar;
      if (rerender) { this._tab = editorTabOf(root); this.render(); }
    }, { img: this.doc?.texture?.src || actor?.img || "" });
    root.querySelector("[data-do='save']")?.addEventListener("click", async () => {
      const ts = tokenSetOf(fresh(this.doc));
      if (this._extra) {
        const i = ts.extra.findIndex(b => b.id === this._bar.id);
        if (i >= 0) ts.extra[i] = this._bar; else ts.extra.push(this._bar);
      } else {
        const d = diffBar(this._base, this._bar);
        if (Object.keys(d).length) ts.patch[this._bar.id] = d;
        else delete ts.patch[this._bar.id];
      }
      await writeTokenSet(this.doc, ts);
      this.onDone?.();
      this.close();
    });
  }
}

/** Encart « Barres SBE » de la configuration du jeton. */
export function tokenBarsBoxHTML(doc) {
  const actor = actorOfDoc(doc);
  if (!actor || actor.type !== "personnage") return "";
  const ts = tokenSetOf(fresh(doc));
  const base = baseBarsFor(actor).bars;
  const chip = (o) => `<span class="sbe-bars-chip">${esc(L(`SBE.Bars.Origin.${o}`))}</span>`;
  const rows = [
    ...base.map(({ bar, origin }) => {
      const off = ts.off.includes(bar.id), patched = !!ts.patch[bar.id];
      return `<div class="sbe-bars-trow ${off ? "is-off" : ""}">
        ${barSummary(bar)} ${chip(origin)} ${patched ? `<span class="sbe-bars-chip is-mod">${esc(L("SBE.Bars.Modified"))}</span>` : ""}
        <span class="sbe-bars-tools">
          <button type="button" data-tb="edit" data-bar="${esc(bar.id)}" data-tooltip-text="${esc(L("SBE.Bars.Edit"))}"><i class="fa-solid fa-pen"></i></button>
          <button type="button" data-tb="toggle" data-bar="${esc(bar.id)}" data-tooltip-text="${esc(L(off ? "SBE.Bars.Show" : "SBE.Bars.Hide"))}"><i class="fa-solid ${off ? "fa-eye-slash" : "fa-eye"}"></i></button>
          ${patched || off ? `<button type="button" data-tb="reset" data-bar="${esc(bar.id)}" data-tooltip-text="${esc(L("SBE.Bars.Reset"))}"><i class="fa-solid fa-rotate-left"></i></button>` : ""}
        </span></div>`;
    }),
    ...ts.extra.map(bar => `<div class="sbe-bars-trow">
        ${barSummary(bar)} ${chip("token")}
        <span class="sbe-bars-tools">
          <button type="button" data-tb="edit" data-bar="${esc(bar.id)}" data-tooltip-text="${esc(L("SBE.Bars.Edit"))}"><i class="fa-solid fa-pen"></i></button>
          <button type="button" data-tb="del" data-bar="${esc(bar.id)}" data-tooltip-text="${esc(L("SBE.Bars.Delete"))}"><i class="fa-solid fa-trash"></i></button>
        </span></div>`)
  ].join("");
  return `<fieldset class="sbe-bars-tokenbox">
    <legend>${esc(L("SBE.Bars.TokenBox"))}</legend>
    <p class="notes">${esc(L("SBE.Bars.TokenBoxHint"))}</p>
    ${brawlActive() ? `<div class="sbe-bars-warn sbe-help-keep"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(L("SBE.Bars.BrawlWarn"))}</div>` : ""}
    <div class="sbe-bars-tlist">${rows || `<p class="sbe-bar-empty">${esc(L("SBE.Bars.TokenNone"))}</p>`}</div>
    <div class="sbe-bars-tfoot">
      <button type="button" data-tb="add"><i class="fa-solid fa-plus"></i> ${esc(L("SBE.Bars.TokenAdd"))}</button>
      ${game.user.isGM ? `<button type="button" data-tb="open"><i class="fa-solid fa-bars-progress"></i> ${esc(L("SBE.Bars.OpenManager"))}</button>` : ""}
    </div>
  </fieldset>`;
}

export function wireTokenBarsBox(box, doc) {
  const redraw = () => {
    const html = tokenBarsBoxHTML(doc);
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    const next = tmp.firstElementChild;
    if (next) { box.replaceWith(next); wireTokenBarsBox(next, doc); }
  };
  box.addEventListener("click", async (ev) => {
    const b = ev.target.closest("[data-tb]");
    if (!b) return;
    ev.preventDefault();
    ev.stopPropagation();
    const id = b.dataset.bar;
    const ts = tokenSetOf(fresh(doc));
    switch (b.dataset.tb) {
      case "edit": new SBETokenBarDialog({ doc, barId: id, onDone: () => setTimeout(redraw, 50) }).render({ force: true }); return;
      case "toggle": ts.off = ts.off.includes(id) ? ts.off.filter(x => x !== id) : [...ts.off, id]; break;
      case "reset": ts.off = ts.off.filter(x => x !== id); delete ts.patch[id]; break;
      case "del": ts.extra = ts.extra.filter(x => x.id !== id); break;
      case "add": {
        const bar = cleanBar({ id: newBarId(), label: L("SBE.Bars.TokenNew") });
        ts.extra.push(bar);
        await writeTokenSet(doc, ts);
        new SBETokenBarDialog({ doc, barId: bar.id, onDone: () => setTimeout(redraw, 50) }).render({ force: true });
        setTimeout(redraw, 50);
        return;
      }
      case "open": {
        const tpl = actorOfDoc(doc)?.system?.template;
        SBETokenBarsApp.open(tpl?.id ?? "all");
        return;
      }
      default: return;
    }
    await writeTokenSet(doc, ts);
    setTimeout(redraw, 50);
  });
}
