/**
 * SBE — Manager COMBAT (MJ)
 *
 * Les règles de combat de la table, sur les clés du MJ :
 * - la clé qui encaisse les dégâts (une jauge de la fiche) ;
 * - le multiplicateur des dégâts en critique ;
 * - les TYPES de dégâts, chacun avec la clé de réduction lue sur la
 *   fiche de la cible (armure, résistance…).
 */

import { buildKeyRefOptions, getKeyRefChoices } from "../../helpers/key-refs.mjs";
import { CombatManager } from "./combat-manager.mjs";
import { profileFieldsHtml, readProfileFields, wireOptionsEditor } from "./attack-options.mjs";
import { validateFormula } from "../../builder/formula-engine.mjs";
import { visPolicyHTML, readVisPolicy } from "../../builder/roll-visibility.mjs";
import { walkElements } from "../../builder/element-renderer.mjs";
import { TIE_ORDERS, ROUND_MODES } from "./initiative.mjs";
import { SBEBodyEditor } from "./body-editor.mjs";
import { EffectManager } from "../effects/effect-manager.mjs";

const { ApplicationV2 } = foundry.applications.api;
const L = (k) => game.i18n.localize(k);
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/* Liste des clés de personnage. Une clé venue d'un IMPORT qui n'existe
   pas (encore) dans ce monde reste affichée et conservée, signalée :
   l'enregistrement ne la perd jamais en silence. */
function keyOptions(value) {
  let html = buildKeyRefOptions("actor", value);
  const v = String(value ?? "");
  if (v && !getKeyRefChoices("actor").some(c => c.key === v)) {
    html += `<option value="${esc(v)}" selected>⚠ ${esc(v)} — ${esc(L("SBE.Combat.KeyMissing"))}</option>`;
  }
  return html;
}

/** Clés des champs qui donnent un score : nombres, jauges, champs à jet. */
function rollKeys() {
  const map = new Map();
  for (const tpl of (game.actors?.contents ?? []).filter(a => a.type === "template")) {
    for (const el of walkElements(tpl.system?.elements ?? [])) {
      if (!el?.key || map.has(el.key)) continue;
      if (el.config?.roll?.on || el.kind === "number" || el.kind === "gauge") map.set(el.key, el.label || el.key);
    }
  }
  return [...map.entries()].map(([key, label]) => `<option value="${esc(key)}">${esc(label)}</option>`).join("");
}

/** Les modèles de personnage, pour une ligne « par modèle ». */
function modelOptions(sel) {
  return (game.actors?.contents ?? []).filter(a => a.type === "template")
    .map(t => `<option value="${esc(t.id)}" ${t.id === sel ? "selected" : ""}>${esc(t.name)}</option>`).join("");
}

/** Section « Initiative ». */
function initHTML(i) {
  const models = i.models.map((m, n) => `
    <div class="sbe-cbt-init-model" data-i="${n}">
      <div class="sbe-chatc-field"><label>${L("SBE.Init.Model")}</label>
        <select name="imTpl"><option value=""></option>${modelOptions(m.tpl)}</select></div>
      <div class="sbe-chatc-field"><label>${L("SBE.Init.Key")}</label>
        <input type="text" name="imKey" list="sbe-init-rkeys" value="${esc(m.key)}"></div>
      <div class="sbe-chatc-field"><label>${L("SBE.Init.Formula")}</label>
        <input type="text" name="imFormula" value="${esc(m.formula)}" placeholder="1d20"></div>
      <a class="sbe-cbt-init-del" data-tooltip-text="${esc(L("SBE.Init.ModelDel"))}"><i class="fa-solid fa-trash"></i></a>
    </div>`).join("");
  return `
    <details class="sbe-chatc-sec" open><summary>${L("SBE.Init.Title")}</summary>
      <datalist id="sbe-init-rkeys">${rollKeys()}</datalist>
      <p class="notes">${L("SBE.Init.Hint")}</p>
      <div class="sbe-cbt-grid">
        <div class="sbe-chatc-field"><label>${L("SBE.Init.Key")}</label>
          <input type="text" name="initKey" list="sbe-init-rkeys" value="${esc(i.key)}" placeholder="${esc(L("SBE.Ph.InitKey"))}">
          <p class="notes">${L("SBE.Init.KeyHint")}</p></div>
        <div class="sbe-chatc-field"><label>${L("SBE.Init.Formula")}</label>
          <input type="text" name="initFormula" value="${esc(i.formula)}" placeholder="${esc(L("SBE.Ph.InitFormula"))}">
          <p class="notes">${L("SBE.Init.FormulaHint")}</p></div>
      </div>
      <h4 class="sbe-cf-h">${L("SBE.Init.Models")}</h4>
      <p class="notes">${L("SBE.Init.ModelsHint")}</p>
      <div class="sbe-cbt-init-models">${models}</div>
      <button type="button" class="sbe-cbt-init-add"><i class="fa-solid fa-plus"></i> ${L("SBE.Init.ModelAdd")}</button>

      <label class="sbe-cbt-check"><input type="checkbox" name="initAuto" ${i.auto ? "checked" : ""}> ${L("SBE.Init.Auto")}</label>
      <p class="notes">${L("SBE.Init.AutoHint")}</p>
      <h4 class="sbe-cf-h">${L("SBE.Init.Window")}</h4>
      <label class="sbe-cbt-check"><input type="checkbox" name="initAsk" ${i.ask ? "checked" : ""}> ${L("SBE.Init.Ask")}</label>
      <p class="notes">${L("SBE.Init.AskHint")}</p>
      <div class="sbe-cbt-grid">
        <label class="sbe-cbt-check"><input type="checkbox" name="initAdv" ${i.adv ? "checked" : ""}> ${L("SBE.Init.Adv")}</label>
        <div class="sbe-chatc-field"><label>${L("SBE.Init.AdvCount")}</label>
          <input type="number" name="initAdvCount" value="${i.advCount}" min="2" max="10" step="1"></div>
        <label class="sbe-cbt-check"><input type="checkbox" name="initMod" ${i.mod ? "checked" : ""}> ${L("SBE.Init.Mod")}</label>
      </div>
      <p class="notes">${L("SBE.Init.WindowHint")}</p>
      ${visPolicyHTML("ivis", i.vis)}

      <h4 class="sbe-cf-h">${L("SBE.Init.Ties")}</h4>
      <div class="sbe-cbt-grid">
        <div class="sbe-chatc-field"><label>${L("SBE.Init.Tie")}</label>
          <input type="text" name="initTie" value="${esc(i.tie)}" placeholder="${esc(L("SBE.Ph.InitTie"))}">
          <p class="notes">${L("SBE.Init.TieHint")}</p></div>
        <div class="sbe-chatc-field"><label>${L("SBE.Init.TieOrder")}</label>
          <select name="initTieOrder">${TIE_ORDERS.map(o => `<option value="${o}" ${i.tieOrder === o ? "selected" : ""}>${L(`SBE.Init.TieOrder_${o}`)}</option>`).join("")}</select></div>
      </div>

      <h4 class="sbe-cf-h">${L("SBE.Init.Rounds")}</h4>
      <div class="sbe-chatc-field"><label>${L("SBE.Init.Round")}</label>
        <select name="initRound">${ROUND_MODES.map(o => `<option value="${o}" ${i.round === o ? "selected" : ""}>${L(`SBE.Init.Round_${o}`)}</option>`).join("")}</select></div>
      <label class="sbe-cbt-check"><input type="checkbox" name="initPasses" ${i.passes.on ? "checked" : ""}> ${L("SBE.Init.Passes")}</label>
      <p class="notes">${L("SBE.Init.PassesHint")}</p>
      <div class="sbe-cbt-grid">
        <div class="sbe-chatc-field"><label>${L("SBE.Init.Step")}</label>
          <input type="text" name="initStep" value="${esc(i.passes.step)}" placeholder="10"></div>
        <div class="sbe-chatc-field"><label>${L("SBE.Init.Min")}</label>
          <input type="text" name="initMin" value="${esc(i.passes.min)}" placeholder="0"></div>
      </div>
    </details>`;
}

export class SBECombatConfig extends ApplicationV2 {

  static DEFAULT_OPTIONS = {
    id: "sbe-combat-config",
    tag: "form",
    classes: ["sbe-combat-config", "sbe-condense"],
    window: { title: "SBE.Combat.ConfigTitle", icon: "fa-solid fa-crosshairs", resizable: true },
    position: { width: 560, height: 640 },
    form: { handler: SBECombatConfig.#onSubmit, submitOnChange: false, closeOnSubmit: false }
  };

  async _renderHTML() {
    const c = this._working ?? CombatManager.getConfig();
    const rows = (c.types.length ? c.types : [{ name: "", reduceKey: "" }]).map((t, i) => `
      <div class="sbe-cbt-type" data-i="${i}">
        <div class="sbe-chatc-field"><label>${L("SBE.Combat.TypeName")}</label>
          <input type="text" name="typeName" value="${esc(t.name)}" placeholder="${esc(L("SBE.Combat.TypeNamePh"))}"></div>
        <div class="sbe-chatc-field"><label>${L("SBE.Combat.TypeReduce")}</label>
          <select name="typeReduce">${keyOptions(t.reduceKey)}</select></div>
        <a class="sbe-cbt-del" title="${esc(L("SBE.Combat.TypeDelete"))}"><i class="fa-solid fa-trash"></i></a>
      </div>`).join("");
    const profs = c.profiles.map((p, i) => `
      <details class="sbe-cbt-prof" data-i="${i}" ${this._openProf === i ? "open" : ""}>
        <summary><i class="fa-solid fa-crosshairs"></i> ${esc(p.name || L("SBE.Combat.ProfileUnnamed"))}
          <a class="sbe-cbt-profdel" title="${esc(L("SBE.Combat.ProfileDelete"))}"><i class="fa-solid fa-trash"></i></a></summary>
        <div class="sbe-chatc-field"><label>${L("SBE.Combat.ProfileName")}</label>
          <input type="text" class="sbe-cbt-profname" value="${esc(p.name)}" placeholder="${esc(L("SBE.Combat.ProfileNamePh"))}"></div>
        ${profileFieldsHtml(p)}
      </details>`).join("");
    return `
      <div class="sbe-cbt-body">
        <details class="sbe-chatc-sec" open><summary>${L("SBE.Combat.Profiles")}</summary>
          <datalist id="sbe-stepfx">${EffectManager.effectOptions().map(d => `<option value="${esc(d.key)}">${esc(d.label)}</option>`).join("")}</datalist>
          <p class="notes">${L("SBE.Combat.ProfilesHint")}</p>
          <div class="sbe-cbt-profs">${profs}</div>
          <button type="button" class="sbe-cbt-profadd"><i class="fa-solid fa-plus"></i> ${L("SBE.Combat.ProfileAdd")}</button>
        </details>
        <details class="sbe-chatc-sec" open><summary>${L("SBE.Combat.Rules")}</summary>
          <div class="sbe-chatc-field"><label>${L("SBE.Combat.DamageKey")}</label>
            <select name="damageKey">${keyOptions(c.damageKey)}</select>
            <p class="notes">${L("SBE.Combat.DamageKeyHint")}</p></div>
          <div class="sbe-chatc-field"><label>${L("SBE.Combat.CritMult")}</label>
            <input type="number" name="critMult" value="${Number(c.critMult) || 1}" min="1" step="0.5">
            <p class="notes">${L("SBE.Combat.CritMultHint")}</p></div>
        </details>
        <details class="sbe-chatc-sec" open><summary>${L("SBE.Loc.Section")}</summary>
          <p class="notes">${L("SBE.Loc.SectionHint")}</p>
          <button type="button" class="sbe-cbt-bodies"><i class="fa-solid fa-person"></i> ${L("SBE.Loc.Open")}</button>
        </details>
        ${initHTML(c.init)}
        <details class="sbe-chatc-sec" open><summary>${L("SBE.Combat.Messages")}</summary>
          <p class="notes">${L("SBE.Combat.MessagesHint")}</p>
          ${visPolicyHTML("vis", c.vis, { targets: true })}
          <label class="sbe-cbt-check"><input type="checkbox" name="gmDetails" ${c.gmDetails ? "checked" : ""}> ${L("SBE.Combat.GmDetails")}</label>
          <p class="notes">${L("SBE.Combat.GmDetailsHint")}</p>
        </details>
        <details class="sbe-chatc-sec" open><summary>${L("SBE.Combat.Types")}</summary>
          <p class="notes">${L("SBE.Combat.TypesHint")}</p>
          <div class="sbe-cbt-types">${rows}</div>
          <button type="button" class="sbe-cbt-add"><i class="fa-solid fa-plus"></i> ${L("SBE.Combat.TypeAdd")}</button>
        </details>
        <details class="sbe-chatc-sec" open><summary>${L("SBE.Combat.Zones")}</summary>
          <p class="notes">${L("SBE.Combat.ZonesHint")}</p>
          <div class="sbe-chatc-field"><label>${L("SBE.Combat.Cover")}</label>
            <input type="number" name="cover" value="${Number(c.cover) || 50}" min="1" max="100" step="1">
            <p class="notes">${L("SBE.Combat.CoverHint")}</p></div>
          <div class="sbe-chatc-field"><label>${L("SBE.Combat.Measure")}</label>
            <select name="measure">
              <option value="cells" ${c.measure !== "token" ? "selected" : ""}>${L("SBE.Combat.MeasureCells")}</option>
              <option value="token" ${c.measure === "token" ? "selected" : ""}>${L("SBE.Combat.MeasureToken")}</option>
            </select>
            <p class="notes">${L("SBE.Combat.MeasureHint")}</p></div>
          <div class="sbe-chatc-field"><label>${L("SBE.Combat.Walls")}</label>
            <select name="walls">${["none", "move", "sight"].map(w => `<option value="${w}" ${c.walls === w ? "selected" : ""}>${L(`SBE.Combat.Walls_${w}`)}</option>`).join("")}</select>
            <p class="notes">${L("SBE.Combat.WallsHint")}</p></div>
        </details>
        <details class="sbe-chatc-sec" open><summary>${L("SBE.Combat.Ground")}</summary>
          <label class="sbe-cbt-check"><input type="checkbox" name="groundOn" ${c.ground.on ? "checked" : ""}> ${L("SBE.Combat.GroundOn")}</label>
          <p class="notes">${L("SBE.Combat.GroundHint")}</p>
          <div class="sbe-cbt-grid">
            <div class="sbe-chatc-field"><label>${L("SBE.Combat.GroundBase")}</label>
              <input type="number" name="groundBase" value="${Number(c.ground.base) || 0}" step="1"></div>
            <div class="sbe-chatc-field"><label>${L("SBE.Combat.GroundRange")}</label>
              <input type="number" name="groundRange" value="${Number(c.ground.byRange) || 0}" step="1"></div>
            <div class="sbe-chatc-field"><label>${L("SBE.Combat.ScatterMin")}</label>
              <input type="number" name="scatterMin" value="${Number(c.scatter.min) || 0}" min="0" step="0.5"></div>
            <div class="sbe-chatc-field"><label>${L("SBE.Combat.ScatterMax")}</label>
              <input type="number" name="scatterMax" value="${Number(c.scatter.max) || 0}" min="0" step="0.5"></div>
          </div>
          <p class="notes">${L("SBE.Combat.ScatterHint")}</p>
        </details>
      </div>
      <footer class="sbe-chatc-foot">
        <button type="button" class="sbe-cbt-export"><i class="fa-solid fa-file-export"></i> ${L("SBE.Common.Export")}</button>
        <button type="button" class="sbe-cbt-import"><i class="fa-solid fa-file-import"></i> ${L("SBE.Common.Import")}</button>
        <button type="submit"><i class="fa-solid fa-floppy-disk"></i> ${L("SBE.Common.Save")}</button>
      </footer>`;
  }

  /* Le défilement est gardé pour toutes les fenêtres (helpers/keep-scroll.mjs). */
  _replaceHTML(result, content) {
    content.innerHTML = result;
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    this.element.querySelector(".sbe-cbt-add")?.addEventListener("click", () => {
      const w = this.#read();
      if (!w) return;
      w.types.push({ name: "", reduceKey: "" });
      this._working = w;
      this.render();
    });
    for (const box of this.element.querySelectorAll(".sbe-aopt, .sbe-apv")) wireOptionsEditor(box);
    this.element.querySelector(".sbe-cbt-profadd")?.addEventListener("click", () => {
      const w = this.#read(true);
      if (!w) return;
      w.profiles.push({ name: "" });
      this._openProf = w.profiles.length - 1;
      this._working = w;
      this.render();
    });
    for (const a of this.element.querySelectorAll(".sbe-cbt-profdel")) {
      a.addEventListener("click", (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        const i = Number(a.closest(".sbe-cbt-prof")?.dataset.i);
        const w = this.#read(true);
        if (!w) return;
        w.profiles.splice(i, 1);
        this._working = w;
        this.render();
      });
    }
    for (const n of this.element.querySelectorAll(".sbe-cbt-profname")) {
      n.addEventListener("change", () => {
        const sum = n.closest(".sbe-cbt-prof")?.querySelector("summary");
        if (sum?.firstChild?.nextSibling) sum.firstChild.nextSibling.textContent = ` ${n.value || L("SBE.Combat.ProfileUnnamed")}`;
      });
    }
    /* Initiative : une ligne par modèle. */
    this.element.querySelector(".sbe-cbt-init-add")?.addEventListener("click", () => {
      const w = this.#read(true);
      if (!w) return;
      w.init.models.push({ tpl: "", key: "", formula: "" });
      this._working = w;
      this.render();
    });
    for (const a of this.element.querySelectorAll(".sbe-cbt-init-del")) {
      a.addEventListener("click", () => {
        const i = Number(a.closest(".sbe-cbt-init-model")?.dataset.i);
        const w = this.#read(true);
        if (!w) return;
        w.init.models.splice(i, 1);
        this._working = w;
        this.render();
      });
    }
    this.element.querySelector(".sbe-cbt-bodies")?.addEventListener("click", () => (foundry.applications.instances.get("sbe-body-editor") ?? new SBEBodyEditor()).render(true));
    this.element.querySelector(".sbe-cbt-export")?.addEventListener("click", () => this.#export());
    this.element.querySelector(".sbe-cbt-import")?.addEventListener("click", () => this.#import());
    for (const a of this.element.querySelectorAll(".sbe-cbt-del")) {
      a.addEventListener("click", () => {
        const i = Number(a.closest(".sbe-cbt-type")?.dataset.i);
        const w = this.#read(true);
        if (!w) return;
        w.types.splice(i, 1);
        this._working = w;
        this.render();
      });
    }
  }

  /** Export : ce qui est affiché (enregistré ou non), en JSON. */
  #export() {
    const cfg = this.#read(false);
    if (!cfg) return;
    const data = JSON.stringify({ sbe: "combat", format: 1, combat: cfg }, null, 2);
    foundry.utils.saveDataToFile(data, "application/json", "sbe-regles-combat.json");
  }

  /** Import : REMPLACE les réglages affichés ; rien n'est écrit tant
      qu'on ne clique pas Enregistrer. Les clés absentes de ce monde
      sont gardées et signalées. */
  #import() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      let json = null;
      try { json = JSON.parse(await file.text()); } catch (_e) { /* illisible */ }
      const raw = json?.sbe === "combat" ? json.combat : null;
      if (!raw || typeof raw !== "object") {
        ui.notifications.error(L("SBE.Combat.ImportBad"));
        return;
      }
      const cfg = CombatManager.normalize(raw);
      const known = new Set(getKeyRefChoices("actor").map(c => c.key));
      const missing = [cfg.damageKey, ...cfg.types.map(t => t.reduceKey)].filter(k => k && !known.has(k));
      this._working = cfg;
      await this.render();
      if (missing.length) ui.notifications.warn(game.i18n.format("SBE.Combat.ImportMissing", { n: missing.length, keys: [...new Set(missing)].join(", ") }));
      ui.notifications.info(L("SBE.Combat.ImportDone"));
    });
    input.click();
  }

  /** @param {boolean} keepEmpty garder les lignes vides (édition en cours) */
  #read(keepEmpty = true) {
    const root = this.element;
    const types = [...root.querySelectorAll(".sbe-cbt-type")].map(r => ({
      name: r.querySelector('[name="typeName"]')?.value.trim() ?? "",
      reduceKey: r.querySelector('[name="typeReduce"]')?.value ?? ""
    }));
    const val = (n) => root.querySelector(`[name="${n}"]`)?.value ?? "";
    /* Profils d'attaque. */
    const profiles = [];
    for (const box of root.querySelectorAll(".sbe-cbt-prof")) {
      const name = box.querySelector(".sbe-cbt-profname")?.value.trim() ?? "";
      const r = readProfileFields(box, (f) => (/^-?\d+(\.\d+)?$/.test(f) ? null : validateFormula(f)));
      if (r.error) { ui.notifications.error(`${name || L("SBE.Combat.ProfileUnnamed")} — ${r.error}`); return null; }
      if (!name && !keepEmpty) continue;
      profiles.push({ name, ...r.values });
    }
    return {
      profiles,
      damageKey: val("damageKey"),
      critMult: Math.max(1, Number(val("critMult")) || 1),
      types: keepEmpty ? types : types.filter(t => t.name),
      cover: Math.max(1, Math.min(100, Number(val("cover")) || 50)),
      measure: val("measure") === "token" ? "token" : "cells",
      walls: val("walls") || "move",
      ground: { on: !!root.querySelector('[name="groundOn"]')?.checked, base: Number(val("groundBase")) || 0, byRange: Number(val("groundRange")) || 0 },
      scatter: { min: Math.max(0, Number(val("scatterMin")) || 0), max: Math.max(0, Number(val("scatterMax")) || 0) },
      vis: (() => { const v = readVisPolicy(root, "vis", { targets: true }); return { def: v.def, allowed: v.allowed }; })(),
      gmDetails: !!root.querySelector('[name="gmDetails"]')?.checked,
      init: {
        key: val("initKey").trim(),
        formula: val("initFormula").trim(),
        models: [...root.querySelectorAll(".sbe-cbt-init-model")].map(r => ({
          tpl: r.querySelector('[name="imTpl"]')?.value ?? "",
          key: r.querySelector('[name="imKey"]')?.value.trim() ?? "",
          formula: r.querySelector('[name="imFormula"]')?.value.trim() ?? ""
        })).filter(m => keepEmpty || (m.tpl && (m.key || m.formula))),
        ask: !!root.querySelector('[name="initAsk"]')?.checked,
        auto: !!root.querySelector('[name="initAuto"]')?.checked,
        adv: !!root.querySelector('[name="initAdv"]')?.checked,
        advCount: Number(val("initAdvCount")) || 2,
        mod: !!root.querySelector('[name="initMod"]')?.checked,
        vis: (() => { const v = readVisPolicy(root, "ivis"); return { def: v.def, allowed: v.allowed }; })(),
        tie: val("initTie").trim(),
        tieOrder: val("initTieOrder") || "random",
        round: val("initRound") || "keep",
        passes: { on: !!root.querySelector('[name="initPasses"]')?.checked, step: val("initStep").trim(), min: val("initMin").trim() }
      }
    };
  }

  static async #onSubmit() {
    const cfg = this.#read(false);
    if (!cfg) return;
    const pn = new Set();
    for (const p of cfg.profiles) {
      const k = p.name.toLowerCase();
      if (pn.has(k)) { ui.notifications.error(game.i18n.format("SBE.Combat.ProfileDup", { name: p.name })); return; }
      pn.add(k);
    }
    const seen = new Set();
    for (const t of cfg.types) {
      const k = t.name.toLowerCase();
      if (seen.has(k)) { ui.notifications.error(game.i18n.format("SBE.Combat.TypeDup", { name: t.name })); return; }
      seen.add(k);
    }
    /* Initiative : formules lisibles (les dés sont vérifiés au jet). */
    const ini = cfg.init;
    for (const f of [ini.tie, ini.passes.step, ini.passes.min]) {
      if (!f || /^-?\d+(\.\d+)?$/.test(f)) continue;
      const err = validateFormula(f);
      if (err) { ui.notifications.error(`${L("SBE.Init.Title")} — ${f} : ${err}`); return; }
    }
    await CombatManager.setConfig(cfg);
    this._working = null;
    ui.notifications.info(L("SBE.Combat.Saved"));
    this.render();
  }
}
