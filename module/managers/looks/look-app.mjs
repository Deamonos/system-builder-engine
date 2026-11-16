/**
 * SBE — APPARENCES DU JETON : la fenêtre du MJ (une par personnage)
 *
 * Dossier des images (lu par le MJ, la liste est gardée), verrou des
 * joueurs, vrai visage pour le propriétaire, transition (celles de
 * Foundry) et son ; une carte par image (libellé, taille, échelle, nom,
 * déguisement) ; les apparences automatiques. Chaque champ s'enregistre
 * dès qu'il change.
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { COND_OPS, OP_LABEL } from "../../helpers/key-condition.mjs";
import { listImages } from "../../helpers/image-folder.mjs";
import { wireKeyLists } from "../../helpers/key-list.mjs";
import { walkElements } from "../../builder/element-renderer.mjs";
import { EffectManager } from "../effects/effect-manager.mjs";
import {
  LOOK_FLAG, RULE_KINDS, cleanLooks, cleanLook, cleanRule, looksOf, lookFor, labelOf, fileLabel,
  defaultSrcOf, transitionTypes
} from "./look-model.mjs";

const { ApplicationV2 } = foundry.applications.api;
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const FP = () => foundry.applications.apps.FilePicker.implementation;

export class SBELooksApp extends ApplicationV2 {

  static #open = new Map();

  static open(actor) {
    if (!game.user.isGM || !actor) return null;
    const cur = this.#open.get(actor.id);
    if (cur?.rendered) { cur.render(); cur.bringToFront?.(); return cur; }
    const app = new SBELooksApp({ actor, id: `sbe-looks-${actor.id}` });
    this.#open.set(actor.id, app);
    app.render({ force: true });
    return app;
  }

  constructor(options = {}) {
    super(options);
    this.actor = options.actor;
  }

  static DEFAULT_OPTIONS = {
    tag: "div",
    classes: ["sbe-looks-app", "sbe-condense"],
    window: { title: "SBE.Looks.Title", icon: "fa-solid fa-masks-theater", resizable: true },
    position: { width: 760, height: 720 }
  };

  get title() { return `${L("SBE.Looks.Title")} — ${this.actor?.name ?? ""}`; }

  #looks() { return looksOf(this.actor); }

  async #save(mutate) {
    const looks = this.#looks();
    mutate(looks);
    await this.actor.update({ [`flags.${SYSTEM_ID}.${LOOK_FLAG}`]: cleanLooks(looks) });
    this.render();
  }

  /** Clés numériques des modèles (pour les règles). */
  #keys() {
    const out = new Map();
    for (const t of game.actors?.filter(a => a.type === "template") ?? []) {
      for (const el of walkElements(t.system?.elements ?? [])) {
        if (el?.key && ["gauge", "number"].includes(el.kind) && !out.has(el.key)) out.set(el.key, el.label || el.key);
      }
    }
    return [...out.entries()];
  }

  async _renderHTML() {
    const looks = this.#looks();
    const def = defaultSrcOf(this.actor);
    const field = (label, inner, cls = "") => `<div class="sbe-looks-field ${cls}"><label>${esc(L(label))}</label>${inner}</div>`;
    const check = (k, on, label) => `<label class="sbe-looks-check"><input type="checkbox" data-k="${k}" ${on ? "checked" : ""}> ${esc(L(label))}</label>`;

    const fx = looks.fx;
    const fxOpts = transitionTypes().map(t => `<option value="${t}" ${fx.type === t ? "selected" : ""}>${esc(L(`SBE.Looks.Fx.${t}`))}</option>`).join("");

    const cards = looks.files.map((src, i) => {
      const l = lookFor(looks, src);
      const isDef = src === def;
      return `<div class="sbe-looks-card ${isDef ? "is-def" : ""}" data-src="${esc(src)}">
        <div class="sbe-looks-thumb"><img src="${esc(src)}" alt="" loading="lazy">
          ${isDef ? `<i class="fa-solid fa-star" data-tooltip-text="${esc(L("SBE.Looks.IsDefault"))}"></i>` : ""}
          ${l.disguise ? `<i class="fa-solid fa-mask sbe-looks-mask"></i>` : ""}</div>
        <div class="sbe-looks-cardf">
          ${field("SBE.Looks.Label", `<input type="text" data-look="${i}" data-f="label" value="${esc(l.label)}" placeholder="${esc(fileLabel(src))}">`, "is-wide")}
          <div class="sbe-looks-row">
            ${field("SBE.Looks.W", `<input type="number" data-look="${i}" data-f="w" value="${l.w ?? ""}" min="0.25" step="0.25" placeholder="—">`)}
            ${field("SBE.Looks.H", `<input type="number" data-look="${i}" data-f="h" value="${l.h ?? ""}" min="0.25" step="0.25" placeholder="—">`)}
            ${field("SBE.Looks.Scale", `<input type="number" data-look="${i}" data-f="scale" value="${l.scale ?? ""}" min="0.1" step="0.05" placeholder="—">`)}
          </div>
          ${field("SBE.Looks.Name", `<input type="text" data-look="${i}" data-f="name" value="${esc(l.name)}" placeholder="—">`, "is-wide")}
          <label class="sbe-looks-check"><input type="checkbox" data-look="${i}" data-f="disguise" ${l.disguise ? "checked" : ""}> ${esc(L("SBE.Looks.Disguise"))}</label>
          ${isDef ? "" : `<button type="button" data-act="default" data-src="${esc(src)}"><i class="fa-regular fa-star"></i> ${esc(L("SBE.Looks.MakeDefault"))}</button>`}
        </div>
      </div>`;
    }).join("");

    const lookOpts = (sel) => `<option value="">—</option>` + looks.files.map(src => `<option value="${esc(src)}" ${src === sel ? "selected" : ""}>${esc(labelOf(looks, src))}</option>`).join("");
    const ops = (sel) => COND_OPS.filter(o => o !== "any").map(o => `<option value="${esc(o)}" ${o === sel ? "selected" : ""}>${esc(L(`SBE.Traces.Ops.${OP_LABEL[o]}`))}</option>`).join("");
    const effects = EffectManager.effectOptions();
    const rules = looks.rules.map((r, i) => {
      const cond = r.kind === "shop"
        ? field("SBE.Looks.Shop", `<select data-rule="${i}" data-f="shop">${["open", "closed"].map(v => `<option value="${v}" ${r.shop === v ? "selected" : ""}>${esc(L(`SBE.Looks.Shop_${v}`))}</option>`).join("")}</select>`, "is-grow")
        : r.kind === "effect"
        ? field("SBE.Looks.Effect", `<select data-rule="${i}" data-f="effect"><option value="">—</option>${effects.map(e => `<option value="${esc(e.key)}" ${e.key === r.effect ? "selected" : ""}>${esc(e.label)}</option>`).join("")}</select>`, "is-grow")
        : `${field("SBE.Traces.WatchKey", `<input type="text" list="sbe-looks-keys" data-rule="${i}" data-f="key" value="${esc(r.key)}" placeholder="${esc(L("SBE.Ph.WatchKey"))}">`, "is-grow")}
           ${field("SBE.Traces.Op", `<select data-rule="${i}" data-f="op">${ops(r.op)}</select>`)}
           ${field("SBE.Traces.Value", `<input type="number" step="any" data-rule="${i}" data-f="value" value="${r.value}">`)}
           ${field("SBE.Traces.Unit", `<select data-rule="${i}" data-f="unit"><option value="value" ${r.unit === "value" ? "selected" : ""}>${esc(L("SBE.Traces.UnitValue"))}</option><option value="pct" ${r.unit === "pct" ? "selected" : ""}>${esc(L("SBE.Traces.UnitPct"))}</option></select>`)}`;
      return `<div class="sbe-looks-rule">
        ${field("SBE.Looks.RuleKind", `<select data-rule="${i}" data-f="kind">${RULE_KINDS.map(k => `<option value="${k}" ${k === r.kind ? "selected" : ""}>${esc(L(`SBE.Looks.Kind.${k}`))}</option>`).join("")}</select>`)}
        ${cond}
        ${field("SBE.Looks.Then", `<select data-rule="${i}" data-f="src">${lookOpts(r.src)}</select>`, "is-grow")}
        <span class="sbe-looks-tools">
          <a data-act="up" data-i="${i}" ${i === 0 ? "class=\"is-off\"" : ""} data-tooltip-text="${esc(L("SBE.Looks.Up"))}"><i class="fa-solid fa-arrow-up"></i></a>
          <a data-act="down" data-i="${i}" ${i === looks.rules.length - 1 ? "class=\"is-off\"" : ""} data-tooltip-text="${esc(L("SBE.Looks.Down"))}"><i class="fa-solid fa-arrow-down"></i></a>
          <a data-act="del" data-i="${i}" data-tooltip-text="${esc(L("SBE.Looks.Delete"))}"><i class="fa-solid fa-trash"></i></a>
        </span>
      </div>`;
    }).join("");

    return `<div class="sbe-looks-body">
      <section>
        <h3><i class="fa-solid fa-folder-open"></i> ${esc(L("SBE.Looks.Folder"))}</h3>
        <div class="sbe-looks-row">
          ${field("SBE.Looks.Folder", `<input type="text" data-k="folder" value="${esc(looks.folder)}" placeholder="${esc(L("SBE.Looks.FolderNone"))}">`, "is-grow")}
          <button type="button" data-act="pick"><i class="fa-solid fa-folder-open"></i> ${esc(L("SBE.Looks.Pick"))}</button>
          <button type="button" data-act="reload" ${looks.folder ? "" : "disabled"} data-tooltip-text="${esc(L("SBE.Looks.ReloadHint"))}"><i class="fa-solid fa-rotate"></i> ${esc(L("SBE.Looks.Reload"))}</button>
        </div>
        <p class="notes">${esc(looks.folder ? L("SBE.Looks.Count", { n: looks.files.length }) : L("SBE.Looks.FolderHint"))}</p>
        <div class="sbe-looks-row">
          ${check("lock", looks.lock, "SBE.Looks.Lock")}
          ${check("ownerSees", looks.ownerSees, "SBE.Looks.OwnerSees")}
        </div>
      </section>
      <section>
        <h3><i class="fa-solid fa-wand-sparkles"></i> ${esc(L("SBE.Looks.Transition"))}</h3>
        <div class="sbe-looks-row">
          ${field("SBE.Looks.FxType", `<select data-k="fx.type">${fxOpts}</select>`)}
          ${field("SBE.Looks.FxMs", `<input type="number" data-k="fx.ms" value="${fx.ms}" min="0" step="100">`)}
          ${field("SBE.Looks.Sound", `<input type="text" data-k="fx.sound" value="${esc(fx.sound)}" placeholder="—">`, "is-grow")}
          <button type="button" data-act="sound"><i class="fa-solid fa-music"></i></button>
          ${field("SBE.Looks.Volume", `<input type="number" data-k="fx.volume" value="${fx.volume}" min="0" max="1" step="0.05">`)}
        </div>
      </section>
      <section>
        <h3><i class="fa-solid fa-images"></i> ${esc(L("SBE.Looks.Images"))}</h3>
        <p class="notes">${esc(L("SBE.Looks.ImagesHint"))}</p>
        <div class="sbe-looks-cards">${cards || `<p class="notes">${esc(L("SBE.Looks.NoImages"))}</p>`}</div>
      </section>
      <section>
        <h3><i class="fa-solid fa-wand-magic-sparkles"></i> ${esc(L("SBE.Looks.Rules"))}</h3>
        <p class="notes">${esc(L("SBE.Looks.RulesHint"))}</p>
        <div class="sbe-looks-rules">${rules}</div>
        <button type="button" data-act="add" ${looks.files.length ? "" : "disabled"}><i class="fa-solid fa-plus"></i> ${esc(L("SBE.Looks.AddRule"))}</button>
      </section>
      <datalist id="sbe-looks-keys">${this.#keys().map(([k, l]) => `<option value="${esc(k)}" label="${esc(l)}"></option>`).join("")}</datalist>
    </div>`;
  }

  _replaceHTML(result, content) { content.innerHTML = result; }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element;
    try { wireKeyLists(root); } catch (_e) { /* liste simple */ }

    root.querySelectorAll("[data-k]").forEach(el => el.addEventListener("change", async () => {
      const k = el.dataset.k;
      const v = el.type === "checkbox" ? el.checked : el.value;
      if (k === "folder") return this.#readFolder(String(v).trim());
      await this.#save(l => foundry.utils.setProperty(l, k, v));
    }));

    root.querySelectorAll("[data-look]").forEach(el => el.addEventListener("change", async () => {
      const src = this.#looks().files[Number(el.dataset.look)];
      if (!src) return;
      const v = el.type === "checkbox" ? el.checked : el.value;
      await this.#save(l => {
        let entry = l.per.find(p => p.src === src);
        if (!entry) { entry = cleanLook({ src }); l.per.push(entry); }
        entry[el.dataset.f] = v;
        /* Une image sans réglage n'est pas gardée. */
        l.per = l.per.map(cleanLook).filter(p => p.label || p.w !== null || p.h !== null || p.scale !== null || p.name || p.disguise);
      });
    }));

    root.querySelectorAll("[data-rule]").forEach(el => el.addEventListener("change", async () => {
      const i = Number(el.dataset.rule);
      await this.#save(l => { if (l.rules[i]) l.rules[i][el.dataset.f] = el.value; });
    }));

    root.querySelectorAll("[data-act]").forEach(el => el.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const i = Number(el.dataset.i);
      switch (el.dataset.act) {
        case "pick":
          new (FP())({ type: "folder", current: this.#looks().folder, callback: (path) => this.#readFolder(String(path ?? "").replace(/\/+$/, "")) }).render(true);
          return;
        case "reload": return this.#readFolder(this.#looks().folder);
        case "sound":
          new (FP())({ type: "audio", current: this.#looks().fx.sound, callback: (path) => this.#save(l => { l.fx.sound = path; }) }).render(true);
          return;
        case "default": {
          const { LookManager } = await import("./look-manager.mjs");
          await LookManager.setDefault(this.actor, el.dataset.src);
          this.render();
          return;
        }
        case "add": return this.#save(l => { l.rules.push(cleanRule({ src: l.files[0] ?? "" })); });
        case "del": return this.#save(l => { l.rules.splice(i, 1); });
        case "up": case "down": {
          const j = i + (el.dataset.act === "up" ? -1 : 1);
          return this.#save(l => { if (j >= 0 && j < l.rules.length) [l.rules[i], l.rules[j]] = [l.rules[j], l.rules[i]]; });
        }
      }
    }));
  }

  /** Lit le dossier (MJ) et garde la liste des images pour tout le monde. */
  async #readFolder(folder) {
    let files = [];
    if (folder) {
      try { files = await listImages(folder); }
      catch (err) {
        console.warn(`SBE | Apparences : dossier illisible (${folder})`, err);
        ui.notifications.warn(L("SBE.Looks.FolderError", { folder }));
      }
    }
    await this.#save(l => {
      l.folder = folder;
      l.files = files;
      /* Les réglages et règles d'images disparues tombent. */
      l.per = l.per.filter(p => files.includes(p.src));
      l.rules = l.rules.map(r => (files.includes(r.src) ? r : { ...r, src: "" }));
    });
  }

  async _onClose(options) {
    SBELooksApp.#open.delete(this.actor?.id);
    return super._onClose?.(options);
  }
}
