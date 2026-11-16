/**
 * SBE — GESTIONNAIRE « MODES DE VISION » (MJ)
 *
 * La liste des modes à gauche, le mode choisi à droite. Les trois modes
 * de départ se renomment, se règlent et se réinitialisent ; ceux du MJ
 * se créent, se dupliquent et se suppriment. Chaque changement est
 * enregistré (et la scène suit aussitôt).
 */

import { VisionModes, builtinDefaults, cleanMode, DARK_LEVELS, COND_MODES, TARGET_KINDS } from "./vision-modes.mjs";
import { validateFormula } from "../../builder/formula-engine.mjs";
import { labelIconHTML } from "../../builder/element-renderer.mjs";
import { cfCell, cfGrid, cfTip } from "../../helpers/compact-form.mjs";

const { ApplicationV2 } = foundry.applications.api;
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

export class SBEVisionModesApp extends ApplicationV2 {

  static DEFAULT_OPTIONS = {
    id: "sbe-vision-modes",
    tag: "div",
    classes: ["sbe-vmodes"],
    window: { title: "SBE.VisionModes.Title", icon: "fa-solid fa-eye", resizable: true },
    position: { width: 820, height: 640 }
  };

  constructor(options = {}) {
    super(options);
    this.modes = foundry.utils.deepClone(VisionModes.all());
    this.sel = this.modes[0]?.id ?? null;
    this.#save = foundry.utils.debounce(() => VisionModes.save(this.modes), 300);
  }

  #save;
  #mode() { return this.modes.find(m => m.id === this.sel) ?? null; }

  async _renderHTML() {
    const list = this.modes.map(m => `<li class="${m.id === this.sel ? "is-sel" : ""}" data-pick="${esc(m.id)}">
        <span class="sbe-vmodes-ic">${labelIconHTML({ config: { labelIcon: m.icon || "fa-solid fa-eye" } })}</span>
        <span class="sbe-vmodes-name">${esc(VisionModes.nameOf(m))}</span>
        ${m.builtin ? `<i class="fa-solid fa-lock sbe-vmodes-lock" data-tooltip-text="${esc(L("SBE.VisionModes.Builtin"))}"></i>` : ""}
      </li>`).join("");
    return `<div class="sbe-vmodes-body">
      <aside class="sbe-vmodes-list">
        <ol>${list}</ol>
        <button type="button" data-act="new"><i class="fa-solid fa-plus"></i> ${esc(L("SBE.VisionModes.New"))}</button>
        <div class="sbe-vmodes-io">
          <button type="button" data-act="export"><i class="fa-solid fa-file-export"></i> ${esc(L("SBE.VisionModes.Export"))}</button>
          <button type="button" data-act="import"><i class="fa-solid fa-file-import"></i> ${esc(L("SBE.VisionModes.Import"))}</button>
        </div>
      </aside>
      <section class="sbe-vmodes-edit">${this.#editHTML()}</section>
    </div>`;
  }

  #editHTML() {
    const m = this.#mode();
    if (!m) return `<p class="notes">${esc(L("SBE.VisionModes.Pick"))}</p>`;
    const r = m.render;
    const p = m.perception;
    /* Mise en page condensée (règle des fenêtres SBE) : deux champs par
       ligne, chaque aide en « ? » au bout de son libellé. */
    const cell = (label, inner, hint = "", o = {}) => cfCell(L(label), inner, { hint: hint ? L(hint) : "", ...o });
    const check = (attr, on, label, hint = "") => cfCell(L(label), `<input type="checkbox" ${attr} ${on ? "checked" : ""}>`, { hint: hint ? L(hint) : "", check: true });
    const slider = (f, v, min = -1, max = 1) => `<div class="sbe-vmodes-range"><input type="range" data-r="${f}" min="${min}" max="${max}" step="0.05" value="${v}"><span>${v}</span></div>`;
    const ph = m.builtin ? L(`SBE.Vision.Mode.${m.id}`) : "";
    return `
      <div class="sbe-vmodes-tools">
        <button type="button" data-act="dup"><i class="fa-solid fa-copy"></i> ${esc(L("SBE.VisionModes.Duplicate"))}</button>
        ${m.builtin
          ? `<button type="button" data-act="reset"><i class="fa-solid fa-rotate-left"></i> ${esc(L("SBE.VisionModes.Reset"))}</button>`
          : `<button type="button" class="sbe-vmodes-del" data-act="del"><i class="fa-solid fa-trash"></i> ${esc(L("SBE.VisionModes.Delete"))}</button>`}
      </div>
      <h3>${esc(L("SBE.VisionModes.General"))}</h3>
      ${cfGrid([
        cell("SBE.VisionModes.Name", `<input type="text" data-f="name" value="${esc(m.name)}" placeholder="${esc(ph)}">`),
        cell("SBE.VisionModes.Icon", `<input type="text" data-f="icon" value="${esc(m.icon)}" placeholder="fa-solid fa-eye">`),
        cell("SBE.VisionModes.Priority", `<input type="number" data-f="priority" step="1" value="${m.priority}">`, "SBE.VisionModes.PriorityHint")
      ])}
      <h3>${esc(L("SBE.VisionModes.Render"))}</h3>
      ${cfGrid([
        cell("SBE.VisionModes.Tint", `<color-picker data-r="tint" value="${esc(r.tint)}"></color-picker>`, "SBE.VisionModes.TintHint"),
        cell("SBE.VisionModes.Dark", `<select data-r="dark">${DARK_LEVELS.map(d => `<option value="${d}" ${r.dark === d ? "selected" : ""}>${esc(L(`SBE.VisionModes.Dark_${d}`))}</option>`).join("")}</select>`, "SBE.VisionModes.DarkHint"),
        cell("SBE.VisionModes.Brightness", slider("brightness", r.brightness)),
        cell("SBE.VisionModes.Saturation", slider("saturation", r.saturation), "SBE.VisionModes.SaturationHint"),
        cell("SBE.VisionModes.Contrast", slider("contrast", r.contrast)),
        cell("SBE.VisionModes.Grain", slider("grain", r.grain, 0, 1), "SBE.VisionModes.GrainHint"),
        check(`data-r="heat"`, r.heat, "SBE.VisionModes.Heat", "SBE.VisionModes.HeatHint")
      ])}
      <h3>${esc(L("SBE.VisionModes.Perception"))}</h3>
      ${cfGrid([
        check(`data-p="invisible"`, p.invisible, "SBE.VisionModes.Invisible"),
        check(`data-p="through"`, p.through, "SBE.VisionModes.Through"),
        cell("SBE.VisionModes.ThroughRange", `<input type="text" data-p="throughRange" value="${esc(p.throughRange)}" placeholder="10">`, "SBE.VisionModes.ThroughHint")
      ])}
      <h4 class="sbe-vmodes-h4">${esc(L("SBE.VisionModes.Targets"))}${cfTip(L("SBE.VisionModes.TargetsHint"))}</h4>
      ${cfGrid(TARGET_KINDS.map(k => check(`data-p="targets.${k}"`, p.targets[k], `SBE.VisionModes.Target_${k}`)))}
      ${cfGrid([
        cell("SBE.VisionModes.CondMode", `<select data-p="condMode">${COND_MODES.map(c => `<option value="${c}" ${p.condMode === c ? "selected" : ""}>${esc(L(`SBE.VisionModes.Cond_${c}`))}</option>`).join("")}</select>`),
        cell("SBE.VisionModes.Cond", `<input type="text" data-p="cond" value="${esc(p.cond)}" placeholder='hasEffect("camouflage")'>`, "SBE.VisionModes.CondHint")
      ])}
      <p class="notes sbe-vmodes-id">${esc(L("SBE.VisionModes.Id", { id: m.id }))}</p>`;
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
    if (!content.sbeWired) {
      content.sbeWired = true;
      content.addEventListener("click", (ev) => this.#onClick(ev));
    }
    for (const inp of content.querySelectorAll("[data-f], [data-r], [data-p]")) {
      const live = inp.type === "range";
      inp.addEventListener(live ? "input" : "change", () => this.#set(inp));
    }
  }

  #changed(render = false) {
    this.#save();
    if (render) this.render();
  }

  #set(inp) {
    const m = this.#mode();
    if (!m) return;
    const v = inp.type === "checkbox" ? inp.checked : inp.value;
    if (inp.dataset.f) {
      m[inp.dataset.f] = inp.dataset.f === "priority" ? Math.round(Number(v) || 0) : String(v ?? "").trim();
      Object.assign(m, cleanMode(m));
      /* Le nom et l'icône changent la liste. */
      this.#changed(inp.dataset.f !== "priority");
      return;
    }
    if (inp.dataset.p) {
      const f = inp.dataset.p;
      /* Formules : refusées si elles ne se lisent pas (rien n'est gardé). */
      if ((f === "cond" || f === "throughRange") && String(v).trim() && !Number.isFinite(Number(v))) {
        const err = validateFormula(String(v));
        if (err) { ui.notifications.error(err); return; }
      }
      if (f.startsWith("targets.")) m.perception.targets[f.slice(8)] = !!v;
      else m.perception[f] = v;
      Object.assign(m, cleanMode(m));
      this.#changed();
      return;
    }
    m.render[inp.dataset.r] = v;
    Object.assign(m, cleanMode(m));
    if (inp.type === "range") { const out = inp.parentElement?.querySelector("span"); if (out) out.textContent = String(m.render[inp.dataset.r]); }
    this.#changed();
  }

  /** Tous les modes (ceux de départ compris, avec leurs réglages). */
  #export() {
    const data = JSON.stringify({ sbe: "visionModes", format: 1, modes: this.modes.map(cleanMode) }, null, 2);
    foundry.utils.saveDataToFile(data, "application/json", "sbe-modes-de-vision.json");
  }

  /** Import : un mode de même identifiant est remplacé, les autres s'ajoutent. */
  #import() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      let json = null;
      try { json = JSON.parse(await file.text()); } catch (_e) { /* illisible */ }
      const incoming = json?.sbe === "visionModes" && Array.isArray(json.modes)
        ? json.modes.map(cleanMode).filter(m => /^[A-Za-z][A-Za-z0-9_-]*$/.test(m.id)) : null;
      if (!incoming?.length) { ui.notifications.error(L("SBE.VisionModes.ImportBad")); return; }
      for (const m of incoming) {
        const i = this.modes.findIndex(x => x.id === m.id);
        if (i >= 0) this.modes[i] = m; else this.modes.push(m);
      }
      this.sel = incoming[0].id;
      this.#changed(true);
      ui.notifications.info(L("SBE.VisionModes.ImportDone", { n: incoming.length }));
    });
    input.click();
  }

  #onClick(ev) {
    const pick = ev.target.closest("[data-pick]");
    if (pick) { this.sel = pick.dataset.pick; this.render(); return; }
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const m = this.#mode();
    const act = b.dataset.act;
    if (act === "export") { this.#export(); return; }
    if (act === "import") { this.#import(); return; }
    if (act === "new" || act === "dup") {
      const base = act === "dup" && m ? foundry.utils.deepClone(m) : builtinDefaults("");
      const copy = cleanMode({ ...base, id: `sbeV${foundry.utils.randomID(8)}`,
        name: act === "dup" ? L("SBE.VisionModes.CopyOf", { name: VisionModes.nameOf(m) }) : L("SBE.VisionModes.NewName") });
      this.modes.push(copy);
      this.sel = copy.id;
      this.#changed(true);
    } else if (act === "reset" && m?.builtin) {
      Object.assign(m, builtinDefaults(m.id));
      this.#changed(true);
    } else if (act === "del" && m && !m.builtin) {
      /* Double clic pour confirmer (rien ne s'efface au premier). */
      if (!b.dataset.armed) { b.dataset.armed = "1"; b.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${esc(L("SBE.VisionModes.DeleteConfirm"))}`; return; }
      this.modes = this.modes.filter(x => x !== m);
      this.sel = this.modes[0]?.id ?? null;
      this.#changed(true);
    }
  }
}
