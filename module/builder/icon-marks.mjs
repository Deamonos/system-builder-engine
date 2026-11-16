/**
 * SBE — REPÈRES SUR L'ICÔNE d'un objet
 *
 * Option du MODÈLE d'objet (case « Repères sur l'icône » + molette).
 * Le MJ empile librement des repères, calculés pour CHAQUE objet avec
 * ses propres valeurs (et ce qu'il contient : un chargeur dans l'arme) :
 *
 *   - text  : un texte à formules — « {balles}/{magSize} » → 12/15 ;
 *   - icon  : une petite icône dans un coin — Font Awesome OU image du
 *             MJ (chemin d'un fichier), à la taille choisie ;
 *   - bar   : une fine jauge valeur / max (usure, munitions) ;
 *   - pips  : des pastilles, N pleines sur M (charges) ;
 *   - dim   : l'icône s'assombrit (arme vide, objet cassé).
 *
 * Chaque repère a une CONDITION facultative (formule) : vide = toujours.
 * Le HALO suit des règles lues dans l'ordre — la première vraie gagne —
 * chacune avec sa couleur et son effet (contour, lueur, pulsation).
 *
 * Affichés partout où un objet PORTÉ montre son icône (grilles, listes,
 * slots, HUD) ; jamais sur les objets du monde ni des compendiums.
 *
 * Stockage : system.opts.marks (case) + system.iconMarks { marks, halo }
 * sur le modèle. Une seule vérité : l'objet lit le modèle en direct.
 */

import { evalExpression, computeAll } from "./formula-engine.mjs";
import { withCarried } from "./carried.mjs";

export const MARK_TYPES = ["text", "icon", "bar", "pips", "dim"];
export const MARK_POS = ["tl", "tr", "bl", "br", "c"];
export const BAR_POS = ["bottom", "top"];
export const HALO_STYLES = ["border", "glow", "pulse"];

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/** Configuration nettoyée (ou null si l'option est décochée). */
export function marksConfigOf(tplDoc) {
  const sys = tplDoc?.system;
  if (!sys?.opts?.marks) return null;
  const c = sys.iconMarks ?? {};
  const marks = Array.isArray(c.marks) ? c.marks.filter(m => MARK_TYPES.includes(m?.type)) : [];
  const halo = Array.isArray(c.halo) ? c.halo.filter(h => h && String(h.when ?? "").trim()) : [];
  return (marks.length || halo.length) ? { marks, halo } : null;
}

/** Portée de formule d'un objet : ses valeurs, ses champs calculés, et
    ce qu'il contient (carried, carriedCount, carriedValue). */
export function marksScope(vals, inner = []) {
  const scope = {};
  for (const [k, v] of Object.entries(vals ?? {})) scope[k] = v;
  return withCarried(scope, { all: inner });
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const truthy = (expr, scope) => {
  const e = String(expr ?? "").trim();
  if (!e) return true;
  return !!evalExpression(e, scope);
};
const fmt = (v) => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "✔" : "—";
  const n = Number(v);
  if (Number.isFinite(n) && String(v).trim() !== "") return String(Math.round(n * 100) / 100);
  return String(v);
};
/** « {a}/{b} » : chaque {formule} remplacée par sa valeur. */
function fillText(tpl, scope) {
  return String(tpl ?? "").replace(/\{([^{}]+)\}/g, (_m, expr) => fmt(evalExpression(expr.trim(), scope)));
}

/**
 * Repères RÉSOLUS pour un objet.
 * @returns {{marks:Array, halo:{color,style}|null, dim:boolean}|null}
 */
export function resolveMarks(cfg, scope) {
  if (!cfg) return null;
  const out = { marks: [], halo: null, dim: false };
  for (const m of cfg.marks) {
    if (!truthy(m.when, scope)) continue;
    const color = String(m.color ?? "").trim();
    switch (m.type) {
      case "dim": out.dim = true; break;
      case "text": {
        const t = fillText(m.text, scope);
        if (t.trim()) out.marks.push({ type: "text", pos: MARK_POS.includes(m.pos) ? m.pos : "br", text: t, color, bg: String(m.bg ?? "").trim() });
        break;
      }
      case "icon": {
        const ic = String(m.icon ?? "").trim();
        const size = Math.max(5, Math.min(100, Number(m.size) || 30));
        if (ic) out.marks.push({ type: "icon", pos: MARK_POS.includes(m.pos) ? m.pos : "tl", icon: ic, color, size });
        break;
      }
      case "bar": case "pips": {
        const max = num(evalExpression(String(m.max ?? "").trim() || "0", scope));
        if (max <= 0) break;
        const val = Math.max(0, Math.min(max, num(evalExpression(String(m.value ?? "").trim() || "0", scope))));
        out.marks.push({ type: m.type, pos: BAR_POS.includes(m.pos) ? m.pos : "bottom", val, max, color });
        break;
      }
    }
  }
  for (const h of cfg.halo) {
    if (!truthy(h.when, scope)) continue;
    out.halo = { color: String(h.color ?? "").trim() || "#ffcc00", style: HALO_STYLES.includes(h.style) ? h.style : "glow" };
    break;
  }
  return (out.marks.length || out.halo || out.dim) ? out : null;
}

/** Repères d'un objet porté (inner = ce qu'il contient, déjà lu). */
export function marksForItem(item, vals, inner = []) {
  const cfg = marksConfigOf(item?.system?.template);
  if (!cfg) return null;
  return resolveMarks(cfg, marksScope(vals, inner));
}

/** Un chemin d'image (fichier du MJ) plutôt qu'une classe d'icône ? */
export function isImagePath(v) {
  const s = String(v ?? "").trim();
  return s.includes("/") || /\.(png|jpe?g|webp|svg|gif|avif)$/i.test(s);
}

/** Les surcouches HTML (sans l'hôte). */
function overlays(res) {
  let html = "";
  for (const m of res.marks) {
    const c = m.color ? `--mk-c:${esc(m.color)};` : "";
    if (m.type === "text") {
      html += `<span class="sbe-mk sbe-mk--text sbe-mk--${m.pos}" style="${c}${m.bg ? `--mk-bg:${esc(m.bg)};` : ""}">${esc(m.text)}</span>`;
    } else if (m.type === "icon") {
      const sz = `--mk-s:${m.size ?? 30};`;
      if (isImagePath(m.icon)) {
        html += `<img class="sbe-mk sbe-mk--img sbe-mk--${m.pos}" src="${esc(m.icon)}" alt="" style="${sz}">`;
      } else {
        const cls = /fa-(solid|regular|brands)/.test(m.icon) ? m.icon : `fa-solid ${m.icon}`;
        html += `<i class="sbe-mk sbe-mk--icon sbe-mk--${m.pos} ${esc(cls)}" style="${c}${sz}"></i>`;
      }
    } else if (m.type === "bar") {
      html += `<span class="sbe-mk sbe-mk--bar sbe-mk--${m.pos}" style="${c}"><span style="width:${Math.round(m.val / m.max * 100)}%"></span></span>`;
    } else if (m.type === "pips") {
      const n = Math.min(12, Math.round(m.max));
      const on = Math.round(m.val / m.max * n);
      html += `<span class="sbe-mk sbe-mk--pips sbe-mk--${m.pos}" style="${c}">${Array.from({ length: n }, (_, i) => `<span class="${i < on ? "on" : ""}"></span>`).join("")}</span>`;
    }
  }
  return html;
}

/** Classes et style de l'hôte (halo, assombri). */
export function marksHostAttrs(res) {
  if (!res) return { cls: "", style: "" };
  const cls = [];
  let style = "";
  if (res.dim) cls.push("sbe-mk-dim");
  if (res.halo) { cls.push("sbe-mk-halo", `sbe-mk-halo--${res.halo.style}`); style = `--mk-halo:${esc(res.halo.color)};`; }
  return { cls: cls.join(" "), style };
}

/** L'icône enveloppée de ses repères (rien à envelopper : telle quelle). */
export function withMarks(iconHtml, res, extraCls = "") {
  if (!res) return iconHtml;
  const h = marksHostAttrs(res);
  return `<span class="sbe-mk-host ${extraCls} ${h.cls}" style="${h.style}">${iconHtml}${overlays(res)}</span>`;
}

/** Surcouches seules, pour un hôte qui existe déjà (case de grille). */
export function marksOverlays(res) { return res ? overlays(res) : ""; }

/* ============================================================ */
/*  Export / import                                              */
/* ============================================================ */

export function exportMarks(tplDoc, cfg) {
  const safe = String(tplDoc?.name ?? "modele").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
  const data = JSON.stringify({ sbe: "icon-marks", format: 1, marks: cfg.marks ?? [], halo: cfg.halo ?? [] }, null, 2);
  foundry.utils.saveDataToFile(data, "application/json", `sbe-reperes-${safe || "modele"}.json`);
}

export function pickMarksFile() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      let json = null;
      try { json = JSON.parse(await file.text()); } catch (_e) { /* illisible */ }
      if (json?.sbe !== "icon-marks" || !Array.isArray(json.marks)) {
        ui.notifications.error(game.i18n.localize("SBE.Marks.ImportBad"));
        return resolve(null);
      }
      resolve({ marks: json.marks, halo: Array.isArray(json.halo) ? json.halo : [] });
    });
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

/* ============================================================ */
/*  Fenêtre de réglage (molette de l'option)                      */
/* ============================================================ */

const { ApplicationV2 } = foundry.applications.api;
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const uid = () => foundry.utils.randomID(8);

export class SBEIconMarksConfig extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    tag: "div",
    classes: ["sbe-marks-cfg", "sbe-condense"],
    window: { title: "SBE.Marks.Title", icon: "fa-solid fa-tags", resizable: true },
    position: { width: 760, height: 720 }
  };

  constructor(tplDoc, options = {}) {
    super({ id: `sbe-marks-${tplDoc.id}`, ...options });
    this.doc = tplDoc;
    const c = tplDoc.system.iconMarks ?? {};
    this._cfg = {
      marks: foundry.utils.deepClone(Array.isArray(c.marks) ? c.marks : []).map(m => ({ id: uid(), ...m })),
      halo: foundry.utils.deepClone(Array.isArray(c.halo) ? c.halo : []).map(h => ({ id: uid(), ...h }))
    };
    this._sample = "";
  }

  get title() { return `${L("SBE.Marks.Title")} — ${this.doc.name}`; }

  /** Objets de ce modèle (monde et portés) pour l'aperçu. */
  #samples() {
    const out = [];
    for (const it of game.items) if (it.type === "objet" && it.system?.templateId === this.doc.id) out.push(it);
    for (const a of game.actors) for (const it of a.items) {
      if (it.type === "objet" && it.system?.templateId === this.doc.id) out.push(it);
    }
    return out;
  }

  #previewScope() {
    const els = this.doc.system.elements ?? [];
    const it = this._sample ? this.#samples().find(i => i.uuid === this._sample) : null;
    const values = it?.system?.values ?? {};
    let inner = [];
    if (it?.parent) {
      const seen = new Set([it.id]);
      const walk = (host) => {
        for (const c of it.parent.items) {
          if (c.type !== "objet" || seen.has(c.id) || String(c.system?.carry?.host ?? "") !== host) continue;
          seen.add(c.id);
          const q = c.system?.template?.system?.opts?.stackable ? (Number(c.system?.values?.quantity) || 1) : 1;
          inner.push({ id: c.id, where: String(c.system?.carry?.where ?? ""), qty: q, vals: { ...(c.system?.values ?? {}) } });
          walk(c.id);
        }
      };
      walk(it.id);
    }
    let vals = { ...values };
    try { vals = { ...vals, ...computeAll(els, values, { inventory: { all: inner } }).results }; } catch (_e) { /* */ }
    /* Valeurs par défaut des champs absents. */
    for (const el of foundry.utils.deepClone(els).flatMap(function f(e) { return [e, ...(e.children ?? []).flatMap(f)]; })) {
      if (el?.key && vals[el.key] === undefined && el.config?.default !== undefined) vals[el.key] = el.config.default;
    }
    return { scope: marksScope(vals, inner), img: it?.img || this.doc.img || "icons/svg/item-bag.svg" };
  }

  #previewHtml() {
    const { scope, img } = this.#previewScope();
    const res = resolveMarks({ marks: this._cfg.marks.filter(m => MARK_TYPES.includes(m.type)), halo: this._cfg.halo.filter(h => String(h.when ?? "").trim()) }, scope);
    const big = withMarks(`<img src="${esc(img)}" alt="">`, res);
    return `<div class="sbe-marks-prev-row">
      <div class="sbe-marks-prev-cell" style="--sbe-grid-cell:96px">${big}</div>
      <div class="sbe-marks-prev-cell is-small" style="--sbe-grid-cell:48px">${withMarks(`<img src="${esc(img)}" alt="">`, res)}</div>
      <div class="sbe-marks-prev-cell is-tiny">${withMarks(`<img src="${esc(img)}" alt="">`, res)}</div>
    </div>`;
  }

  #rowHtml(m, i) {
    const opt = (vals, cur, pref) => vals.map(v => `<option value="${v}" ${v === cur ? "selected" : ""}>${L(pref + v)}</option>`).join("");
    const f = (k, label, ph = "", w = "") => `<label class="sbe-mk-f${w}"><span>${L(label)}</span><input type="text" data-f="${k}" value="${esc(m[k] ?? "")}" placeholder="${esc(ph)}"></label>`;
    const color = `<label class="sbe-mk-f sbe-mk-f--color"><span>${L("SBE.Marks.Color")}</span><input type="color" data-f="color" value="${esc(m.color || "#ffffff")}"></label>`;
    let body = "";
    switch (m.type) {
      case "text":
        body = f("text", "SBE.Marks.Text", `{${L("SBE.Ph.MarkValue")}}/{${L("SBE.Ph.MarkMax")}}`, " sbe-mk-f--wide")
          + `<label class="sbe-mk-f"><span>${L("SBE.Marks.Pos")}</span><select data-f="pos">${opt(MARK_POS, m.pos || "br", "SBE.Marks.Pos_")}</select></label>`
          + color
          + `<label class="sbe-mk-f sbe-mk-f--color"><span>${L("SBE.Marks.Bg")}</span><input type="color" data-f="bg" value="${esc(m.bg || "#000000")}"></label>`;
        break;
      case "icon":
        body = `<label class="sbe-mk-f sbe-mk-f--wide"><span>${L("SBE.Marks.Icon")}</span><span class="sbe-mk-iconrow"><input type="text" data-f="icon" value="${esc(m.icon ?? "")}" placeholder="${esc(L("SBE.Marks.IconPh"))}"><button type="button" class="sbe-iconpick" data-tooltip="${esc(L("SBE.Marks.PickIcon"))}"><i class="fa-solid fa-icons"></i></button><button type="button" class="sbe-mk-imgpick" data-tooltip="${esc(L("SBE.Marks.PickImage"))}"><i class="fa-solid fa-image"></i></button></span></label>`
          + `<label class="sbe-mk-f"><span>${L("SBE.Marks.Pos")}</span><select data-f="pos">${opt(MARK_POS, m.pos || "tl", "SBE.Marks.Pos_")}</select></label>`
          + `<label class="sbe-mk-f sbe-mk-f--num"><span>${L("SBE.Marks.Size")}</span><input type="number" data-f="size" min="5" max="100" step="1" value="${esc(m.size ?? 30)}"></label>`
          + (isImagePath(m.icon) ? "" : color);
        break;
      case "bar": case "pips":
        body = f("value", "SBE.Marks.Value", L("SBE.Ph.MarkValue")) + f("max", "SBE.Marks.Max", L("SBE.Ph.MarkMax"))
          + `<label class="sbe-mk-f"><span>${L("SBE.Marks.Pos")}</span><select data-f="pos">${opt(BAR_POS, m.pos || "bottom", "SBE.Marks.Pos_")}</select></label>`
          + color;
        break;
      case "dim":
        body = `<p class="notes">${L("SBE.Marks.DimHint")}</p>`;
        break;
    }
    return `<div class="sbe-mk-row" data-i="${i}">
      <div class="sbe-mk-row-head">
        <span class="sbe-mk-type"><i class="fa-solid ${TYPE_ICON[m.type]}"></i> ${L("SBE.Marks.Type_" + m.type)}</span>
        <span class="sbe-mk-moves">
          <a data-mk="up" data-i="${i}" data-tooltip="${esc(L("SBE.Marks.Up"))}"><i class="fa-solid fa-arrow-up"></i></a>
          <a data-mk="del" data-i="${i}" data-tooltip="${esc(L("SBE.Common.Delete"))}"><i class="fa-solid fa-trash"></i></a>
        </span>
      </div>
      <div class="sbe-mk-row-body">${body}
        <label class="sbe-mk-f sbe-mk-f--wide"><span>${L("SBE.Marks.When")}</span><input type="text" data-f="when" value="${esc(m.when ?? "")}" placeholder="${esc(L("SBE.Marks.WhenPh"))}"></label>
      </div>
    </div>`;
  }

  #haloHtml(h, i) {
    const opt = HALO_STYLES.map(v => `<option value="${v}" ${v === (h.style || "glow") ? "selected" : ""}>${L("SBE.Marks.Halo_" + v)}</option>`).join("");
    return `<div class="sbe-mk-row sbe-mk-halo-row" data-h="${i}">
      <span class="sbe-mk-n">${i + 1}</span>
      <label class="sbe-mk-f sbe-mk-f--wide"><span>${L("SBE.Marks.HaloWhen")}</span><input type="text" data-f="when" value="${esc(h.when ?? "")}" placeholder="${esc(L("SBE.Ph.HaloWhen"))}"></label>
      <label class="sbe-mk-f sbe-mk-f--color"><span>${L("SBE.Marks.Color")}</span><input type="color" data-f="color" value="${esc(h.color || "#ff3030")}"></label>
      <label class="sbe-mk-f"><span>${L("SBE.Marks.HaloStyle")}</span><select data-f="style">${opt}</select></label>
      <span class="sbe-mk-moves">
        <a data-hl="up" data-i="${i}" data-tooltip="${esc(L("SBE.Marks.Up"))}"><i class="fa-solid fa-arrow-up"></i></a>
        <a data-hl="del" data-i="${i}" data-tooltip="${esc(L("SBE.Common.Delete"))}"><i class="fa-solid fa-trash"></i></a>
      </span>
    </div>`;
  }

  async _renderHTML() {
    const samples = this.#samples();
    return `
      <div class="sbe-marks-top">
        <div class="sbe-marks-prev">${this.#previewHtml()}</div>
        <div class="sbe-marks-side">
          <label class="sbe-mk-f"><span>${L("SBE.Marks.PreviewWith")}</span>
            <select class="sbe-mk-sample">
              <option value="">${L("SBE.Marks.PreviewDefaults")}</option>
              ${samples.map(it => `<option value="${esc(it.uuid)}" ${it.uuid === this._sample ? "selected" : ""}>${esc(it.name)}${it.parent ? ` (${esc(it.parent.name)})` : ""}</option>`).join("")}
            </select></label>
          <p class="notes">${L("SBE.Marks.Hint")}</p>
          <div class="sbe-mk-io">
            <button type="button" data-io="export"><i class="fa-solid fa-file-export"></i> ${L("SBE.Marks.Export")}</button>
            <button type="button" data-io="import"><i class="fa-solid fa-file-import"></i> ${L("SBE.Marks.Import")}</button>
          </div>
        </div>
      </div>
      <div class="sbe-marks-scroll">
        <h3>${L("SBE.Marks.ListTitle")}</h3>
        <div class="sbe-mkc-list">${this._cfg.marks.map((m, i) => this.#rowHtml(m, i)).join("") || `<p class="notes">${L("SBE.Marks.Empty")}</p>`}</div>
        <div class="sbe-mk-add">${MARK_TYPES.map(t => `<button type="button" data-add="${t}"><i class="fa-solid ${TYPE_ICON[t]}"></i> ${L("SBE.Marks.Type_" + t)}</button>`).join("")}</div>
        <h3>${L("SBE.Marks.HaloTitle")}</h3>
        <p class="notes">${L("SBE.Marks.HaloHint")}</p>
        <div class="sbe-mkc-list">${this._cfg.halo.map((h, i) => this.#haloHtml(h, i)).join("")}</div>
        <div class="sbe-mk-add"><button type="button" data-add-halo="1"><i class="fa-solid fa-sun"></i> ${L("SBE.Marks.HaloAdd")}</button></div>
      </div>
      <footer class="sbe-mk-foot">
        <button type="button" data-save="1"><i class="fa-solid fa-floppy-disk"></i> ${L("SBE.Common.Save")}</button>
      </footer>`;
  }

  _replaceHTML(result, content) { content.innerHTML = result; }

  /** Lit les champs dans la copie de travail. */
  #read() {
    const root = this.element;
    for (const row of root.querySelectorAll(".sbe-mk-row[data-i]")) {
      const m = this._cfg.marks[Number(row.dataset.i)];
      if (!m) continue;
      for (const inp of row.querySelectorAll("[data-f]")) m[inp.dataset.f] = inp.value;
    }
    for (const row of root.querySelectorAll(".sbe-mk-row[data-h]")) {
      const h = this._cfg.halo[Number(row.dataset.h)];
      if (!h) continue;
      for (const inp of row.querySelectorAll("[data-f]")) h[inp.dataset.f] = inp.value;
    }
  }

  #refreshPreview() {
    const box = this.element.querySelector(".sbe-marks-prev");
    if (box) box.innerHTML = this.#previewHtml();
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element;
    /* La racine survit aux re-rendus : écoutée une seule fois. */
    if (!this._wired) {
      this._wired = true;
      root.addEventListener("input", (ev) => {
        if (!ev.target.closest("[data-f]")) return;
        this.#read(); this.#refreshPreview();
      });
    }
    root.querySelector(".sbe-mk-sample")?.addEventListener("change", (ev) => { this._sample = ev.target.value; this.#refreshPreview(); });
    for (const b of root.querySelectorAll("[data-add]")) b.addEventListener("click", () => {
      this.#read();
      const t = b.dataset.add;
      this._cfg.marks.push({ id: uid(), type: t, pos: t === "bar" || t === "pips" ? "bottom" : (t === "icon" ? "tl" : "br"), color: t === "dim" ? "" : "#ffffff" });
      this.render();
    });
    root.querySelector("[data-add-halo]")?.addEventListener("click", () => {
      this.#read();
      this._cfg.halo.push({ id: uid(), when: "", color: "#ff3030", style: "glow" });
      this.render();
    });
    const move = (list, i, act) => {
      if (act === "del") list.splice(i, 1);
      else if (act === "up" && i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
    };
    for (const a of root.querySelectorAll("[data-mk]")) a.addEventListener("click", () => { this.#read(); move(this._cfg.marks, Number(a.dataset.i), a.dataset.mk); this.render(); });
    for (const a of root.querySelectorAll("[data-hl]")) a.addEventListener("click", () => { this.#read(); move(this._cfg.halo, Number(a.dataset.i), a.dataset.hl); this.render(); });
    /* Sélecteur d'icônes du système. */
    for (const btn of root.querySelectorAll(".sbe-iconpick")) btn.addEventListener("click", async () => {
      const inp = btn.closest(".sbe-mk-iconrow")?.querySelector("input");
      const { pickIcon } = await import("../helpers/icon-picker.mjs");
      const v = await pickIcon();
      if (!v || !inp) return;
      inp.value = v; this.#read(); this.#refreshPreview();
    });
    /* Image du MJ : le sélecteur de fichiers de Foundry. */
    for (const btn of root.querySelectorAll(".sbe-mk-imgpick")) btn.addEventListener("click", () => {
      const inp = btn.closest(".sbe-mk-iconrow")?.querySelector("input");
      const FilePicker = foundry.applications.apps.FilePicker.implementation;
      new FilePicker({
        type: "image",
        current: isImagePath(inp?.value) ? inp.value : "",
        callback: (path) => { if (!inp) return; inp.value = path; this.#read(); this.render(); }
      }).render(true);
    });
    root.querySelector('[data-io="export"]')?.addEventListener("click", () => {
      this.#read();
      exportMarks(this.doc, this.#clean());
    });
    root.querySelector('[data-io="import"]')?.addEventListener("click", async () => {
      const got = await pickMarksFile();
      if (!got) return;
      this._cfg = { marks: got.marks.map(m => ({ id: uid(), ...m })), halo: got.halo.map(h => ({ id: uid(), ...h })) };
      ui.notifications.info(L("SBE.Marks.Imported"));
      this.render();
    });
    root.querySelector("[data-save]")?.addEventListener("click", async () => {
      this.#read();
      await this.doc.update({ "system.iconMarks": this.#clean(), "system.opts.marks": true });
      ui.notifications.info(L("SBE.Marks.Saved"));
      this.close();
    });
  }

  #clean() {
    const strip = ({ id: _id, ...rest }) => rest;
    return {
      marks: this._cfg.marks.filter(m => MARK_TYPES.includes(m.type)).map(strip),
      halo: this._cfg.halo.filter(h => String(h.when ?? "").trim()).map(strip)
    };
  }
}

const TYPE_ICON = { text: "fa-font", icon: "fa-icons", bar: "fa-battery-half", pips: "fa-ellipsis", dim: "fa-moon" };
