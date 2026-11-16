/**
 * SBE — Manager « CORPS » (localisation des coups, MJ)
 *
 * À gauche les corps ; à droite le corps ouvert : son nom, son image
 * de fond, son cadre, ses chances (plages ou surface), les modèles de
 * personnage qui l'utilisent, le tableau de ses ZONES et le DESSIN.
 * Chaque morceau dessiné appartient à une zone : la zone choisie dans
 * le tableau reçoit les nouveaux morceaux ; un morceau choisi (outil
 * Sélection) passe dans la zone cliquée ensuite.
 * Même planche à dessin que les formes de zone (helpers/shape-board.mjs).
 */

import { HitLocations, FRAMES, ODDS, PRESET_KEYS, zoneColor } from "./hit-locations.mjs";
import { piecePolygon } from "../zones/zone-geom.mjs";
import { draftSvg, wireShapeBoard } from "../../helpers/shape-board.mjs";
import { getKeyRefChoices } from "../../helpers/key-refs.mjs";
import { validateFormula } from "../../builder/formula-engine.mjs";
import { cfTip } from "../../helpers/compact-form.mjs";

const { ApplicationV2 } = foundry.applications.api;
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const TOOLS = [["select", "fa-arrow-pointer"], ["poly", "fa-draw-polygon"], ["ellipse", "fa-circle"], ["rect", "fa-square"]];
const isNum = (v) => /^-?\d+([.,]\d+)?$/.test(String(v ?? "").trim());

export class SBEBodyEditor extends ApplicationV2 {

  static DEFAULT_OPTIONS = {
    id: "sbe-body-editor",
    tag: "div",
    classes: ["sbe-zone-editor", "sbe-body-editor", "sbe-condense"],
    window: { title: "SBE.Loc.EditorTitle", icon: "fa-solid fa-person", resizable: true },
    position: { width: 1000, height: 820 }
  };

  _bodies = null;      /* copie de travail */
  _cur = null;         /* id du corps ouvert */
  _zone = null;        /* zone qui reçoit les nouveaux morceaux */
  _bs = { sel: -1, draft: null };
  _tool = "select";
  _snap = true;

  #body() { return this._bodies.find(b => b.id === this._cur) ?? null; }

  async _renderHTML() {
    this._bodies ??= foundry.utils.deepClone(HitLocations.list());
    if (!this._bodies.some(b => b.id === this._cur)) this._cur = this._bodies[0]?.id ?? null;
    const b = this.#body();
    if (b && !b.zones.some(z => z.id === this._zone)) this._zone = b.zones[0]?.id ?? null;
    const list = this._bodies.map(x => `
      <li class="${x.id === this._cur ? "active" : ""}" data-id="${esc(x.id)}">
        <i class="fa-solid fa-person"></i> ${esc(x.name || L("SBE.Loc.Unnamed"))}
        ${x.models.length ? "" : `<small class="sbe-bed-def">${L("SBE.Loc.Default")}</small>`}
      </li>`).join("") || `<li class="sbe-zed-empty">${L("SBE.Loc.NoBodies")}</li>`;

    const keys = getKeyRefChoices("actor").map(c => `<option value="${esc(c.key)}">${esc(c.label ?? c.key)}</option>`).join("");
    const models = (game.actors?.contents ?? []).filter(a => a.type === "template");
    const main = b ? `
      <datalist id="sbe-bed-keys">${keys}</datalist>
      <div class="sbe-zed-props">
        <label class="sbe-zed-f"><span>${L("SBE.Loc.Name")}</span>
          <input type="text" data-prop="name" value="${esc(b.name)}" placeholder="${esc(L("SBE.Ph.LocBody"))}"></label>
        <label class="sbe-zed-f"><span>${L("SBE.Loc.Frame")}</span>
          <select data-prop="frame">${Object.keys(FRAMES).map(f => `<option value="${f}" ${b.frame === f ? "selected" : ""}>${L(`SBE.Loc.Frame_${f}`)}</option>`).join("")}</select></label>
        <label class="sbe-zed-f"><span>${L("SBE.Loc.Odds")}</span>
          <select data-prop="odds">${ODDS.map(o => `<option value="${o}" ${b.odds === o ? "selected" : ""}>${L(`SBE.Loc.Odds_${o}`)}</option>`).join("")}</select></label>
        <div class="sbe-zed-f sbe-bed-imgf"><span>${L("SBE.Loc.Image")}</span>
          <span class="sbe-bed-img"><input type="text" data-prop="img" value="${esc(b.img)}" placeholder="${esc(L("SBE.Loc.ImagePh"))}">
          <button type="button" class="sbe-bed-pick" data-tooltip="${esc(L("SBE.Loc.ImagePick"))}"><i class="fa-solid fa-file-image"></i></button></span></div>
      </div>
      <h3 class="sbe-bed-h">${L("SBE.Loc.Models")}${cfTip(L("SBE.Loc.ModelsHint"))}</h3>
      <div class="sbe-bed-models">${models.map(t => `<label class="sbe-bed-model"><input type="checkbox" value="${esc(t.id)}" ${b.models.includes(t.id) ? "checked" : ""}> ${esc(t.name)}</label>`).join("") || `<span class="sbe-bed-none">${L("SBE.Loc.NoModels")}</span>`}</div>

      <h3 class="sbe-bed-h">${L("SBE.Loc.Zones")}${cfTip(L("SBE.Loc.ZonesHint"))}</h3>
      <div class="sbe-bed-zones">
        <div class="sbe-bed-zrow sbe-bed-zhead"><span></span><b>${L("SBE.Loc.ZName")}</b>
          ${b.odds === "ranges" ? `<b>${L("SBE.Loc.From")}</b><b>${L("SBE.Loc.To")}</b>` : `<b class="sbe-bed-wide">${L("SBE.Loc.Share")}</b>`}
          <b>${L("SBE.Loc.DmgKey")}</b><b>${L("SBE.Loc.ProtKey")}</b><b>${L("SBE.Loc.Mult")}</b><b>${L("SBE.Loc.Aim")}</b><span></span></div>
        ${this.#zoneRows(b)}
      </div>
      <button type="button" class="sbe-bed-zadd"><i class="fa-solid fa-plus"></i> ${L("SBE.Loc.ZoneAdd")}</button>

      <h3 class="sbe-bed-h">${L("SBE.Loc.Drawing")}${cfTip(L("SBE.Loc.DrawingHint"))}</h3>
      <div class="sbe-zed-tools">
        ${TOOLS.map(([t, ic]) => `<button type="button" class="sbe-zed-tool ${this._tool === t ? "active" : ""}" data-tool="${t}" data-tooltip="${esc(L(`SBE.Zone.Tool_${t}`))}"><i class="fa-solid ${ic}"></i></button>`).join("")}
        <button type="button" class="sbe-zed-delpiece" data-tooltip="${esc(L("SBE.Zone.DeletePiece"))}"><i class="fa-solid fa-eraser"></i></button>
        <label class="sbe-zed-snap"><input type="checkbox" class="sbe-zed-snapbox" ${this._snap ? "checked" : ""}> ${L("SBE.Zone.Snap")}</label>
        <span class="sbe-bed-cur">${L("SBE.Loc.CurZone")} <b>${esc(b.zones.find(z => z.id === this._zone)?.name ?? "—")}</b></span>
      </div>
      <p class="sbe-bed-tooltext">${L(`SBE.Zone.ToolHint_${this._tool}`)}</p>
      <div class="sbe-zed-board sbe-bed-board"><svg class="sbe-zed-svg sbe-bed-svg" viewBox="0 0 ${FRAMES[b.frame].join(" ")}" style="aspect-ratio:${FRAMES[b.frame][0]} / ${FRAMES[b.frame][1]}"></svg></div>`
      : `<p class="notes">${L("SBE.Loc.PickOrCreate")}</p>`;

    return `
      <div class="sbe-zed">
        <aside class="sbe-zed-side">
          <ul class="sbe-zed-list">${list}</ul>
          <div class="sbe-zed-sidebtns">
            <select class="sbe-bed-preset">${PRESET_KEYS.map(k => `<option value="${k}">${L(`SBE.Loc.Preset_${k}`)}</option>`).join("")}</select>
            <button type="button" class="sbe-zed-new"><i class="fa-solid fa-plus"></i> ${L("SBE.Loc.New")}</button>
            <button type="button" class="sbe-zed-dup" ${b ? "" : "disabled"}><i class="fa-solid fa-copy"></i> ${L("SBE.Zone.Duplicate")}</button>
            <button type="button" class="sbe-zed-del" ${b ? "" : "disabled"}><i class="fa-solid fa-trash"></i> ${L("SBE.Zone.Delete")}</button>
          </div>
        </aside>
        <section class="sbe-zed-main">${main}</section>
      </div>
      <footer class="sbe-chatc-foot">
        <button type="button" class="sbe-zed-export"><i class="fa-solid fa-file-export"></i> ${L("SBE.Common.Export")}</button>
        <button type="button" class="sbe-zed-import"><i class="fa-solid fa-file-import"></i> ${L("SBE.Common.Import")}</button>
        <button type="button" class="sbe-zed-save"><i class="fa-solid fa-floppy-disk"></i> ${L("SBE.Common.Save")}</button>
      </footer>`;
  }

  #zoneRows(b) {
    const areas = HitLocations.areas(b);
    const total = [...areas.values()].reduce((t, a) => t + a, 0);
    return b.zones.map(z => {
      const share = total > 0 ? `${Math.round((areas.get(z.id) ?? 0) * 100 / total)} %` : "—";
      return `
      <div class="sbe-bed-zrow ${z.id === this._zone ? "is-cur" : ""}" data-zone="${esc(z.id)}">
        <a class="sbe-bed-zpick" data-tooltip="${esc(L("SBE.Loc.ZonePick"))}"><span class="sbe-bed-dot" style="background:${zoneColor(b, z.id)}"></span></a>
        <input type="text" data-z="name" value="${esc(z.name)}" placeholder="${esc(L("SBE.Ph.LocZone"))}">
        ${b.odds === "ranges" ? `<input type="number" data-z="from" value="${z.from ?? ""}" step="1"><input type="number" data-z="to" value="${z.to ?? ""}" step="1">`
          : `<span class="sbe-bed-share sbe-bed-wide">${share}</span>`}
        <input type="text" data-z="dmgKey" list="sbe-bed-keys" value="${esc(z.dmgKey)}" placeholder="${esc(L("SBE.Loc.Normal"))}">
        <input type="text" data-z="protKey" list="sbe-bed-keys" value="${esc(z.protKey)}" placeholder="—">
        <input type="text" data-z="mult" value="${esc(z.mult)}" placeholder="1">
        <input type="text" data-z="aim" value="${esc(z.aim)}" placeholder="0">
        <a class="sbe-bed-zdel" data-tooltip="${esc(L("SBE.Loc.ZoneDel"))}"><i class="fa-solid fa-trash"></i></a>
      </div>`;
    }).join("");
  }

  _replaceHTML(result, content) { content.innerHTML = result; }

  /* ------------------------------------------------------------ */
  /*  Dessin                                                       */
  /* ------------------------------------------------------------ */

  #drawSvg() {
    const svg = this.element?.querySelector(".sbe-bed-svg");
    const b = this.#body();
    if (!svg || !b) return;
    const [w, h] = FRAMES[b.frame];
    let html = b.img ? `<image href="${esc(b.img)}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet" pointer-events="none"/>` : "";
    b.pieces.forEach((p, i) => {
      const pts = piecePolygon(p).map(([x, y]) => `${x},${y}`).join(" ");
      const c = zoneColor(b, p.zone);
      html += `<polygon points="${pts}" data-i="${i}" class="sbe-bed-piece ${i === this._bs.sel ? "is-sel" : ""}" style="fill:${c};stroke:${c}"/>`;
    });
    html += draftSvg(this._bs.draft, { cls: "sbe-bed-draft", dot: "sbe-zed-dot", r: 0.8 });
    svg.innerHTML = html;
  }

  /* ------------------------------------------------------------ */
  /*  Câblage                                                      */
  /* ------------------------------------------------------------ */

  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element;
    const on = (sel, ev, fn) => root.querySelector(sel)?.addEventListener(ev, fn);

    for (const li of root.querySelectorAll(".sbe-zed-list li[data-id]")) {
      li.addEventListener("click", () => { this._cur = li.dataset.id; this._bs.sel = -1; this._bs.draft = null; this.render(); });
    }
    on(".sbe-zed-new", "click", () => {
      const preset = root.querySelector(".sbe-bed-preset")?.value ?? "empty";
      const name = preset === "empty" ? L("SBE.Loc.NewName", { n: this._bodies.length + 1 }) : L(`SBE.Loc.Preset_${preset}`);
      const b = HitLocations.create(preset, name);
      this._bodies.push(b); this._cur = b.id; this._bs.sel = -1; this.render();
    });
    on(".sbe-zed-dup", "click", () => {
      const b = this.#body(); if (!b) return;
      const c = foundry.utils.deepClone(b);
      const ids = new Map(c.zones.map(z => [z.id, foundry.utils.randomID()]));
      c.id = foundry.utils.randomID();
      c.name = `${b.name} (2)`;
      c.models = [];
      c.zones = c.zones.map(z => ({ ...z, id: ids.get(z.id) }));
      c.pieces = c.pieces.map(p => ({ ...p, zone: ids.get(p.zone) }));
      this._bodies.push(c); this._cur = c.id; this._bs.sel = -1; this.render();
    });
    on(".sbe-zed-del", "click", async () => {
      const b = this.#body(); if (!b) return;
      const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: L("SBE.Zone.Delete") }, content: `<p>${esc(L("SBE.Loc.DeleteConfirm", { name: b.name }))}</p>` });
      if (!ok) return;
      this._bodies = this._bodies.filter(x => x !== b); this._cur = null; this._bs.sel = -1; this.render();
    });
    on(".sbe-zed-save", "click", () => this.#save());
    on(".sbe-zed-export", "click", () => this.#export());
    on(".sbe-zed-import", "click", () => this.#import());

    const b = this.#body();
    if (!b) return;
    for (const inp of root.querySelectorAll("[data-prop]")) {
      inp.addEventListener("change", () => {
        const k = inp.dataset.prop;
        b[k] = inp.value.trim();
        if (k === "name" || k === "frame" || k === "odds") this.render();
        else this.#drawSvg();
      });
    }
    on(".sbe-bed-pick", "click", () => {
      const FP = foundry.applications.apps.FilePicker.implementation;
      new FP({ type: "image", current: b.img, callback: (path) => { b.img = path; this.render(); } }).render(true);
    });
    for (const c of root.querySelectorAll(".sbe-bed-model input")) {
      c.addEventListener("change", () => {
        b.models = [...root.querySelectorAll(".sbe-bed-model input:checked")].map(x => x.value);
        root.querySelector(`.sbe-zed-list li[data-id="${CSS.escape(b.id)}"] .sbe-bed-def`)?.remove();
      });
    }
    /* Tableau des zones. */
    for (const row of root.querySelectorAll(".sbe-bed-zrow[data-zone]")) {
      const z = b.zones.find(x => x.id === row.dataset.zone);
      if (!z) continue;
      for (const inp of row.querySelectorAll("[data-z]")) {
        inp.addEventListener("change", () => {
          const k = inp.dataset.z;
          z[k] = k === "from" || k === "to" ? (inp.value === "" ? null : Math.round(Number(inp.value))) : inp.value.trim();
          if (k === "name") root.querySelector(".sbe-bed-cur b").textContent = b.zones.find(x => x.id === this._zone)?.name ?? "—";
        });
      }
      row.querySelector(".sbe-bed-zpick")?.addEventListener("click", () => {
        this._zone = z.id;
        /* Un morceau choisi passe dans cette zone. */
        const p = b.pieces[this._bs.sel];
        if (p) p.zone = z.id;
        this.render();
      });
      row.querySelector(".sbe-bed-zdel")?.addEventListener("click", () => {
        b.zones = b.zones.filter(x => x !== z);
        b.pieces = b.pieces.filter(p => p.zone !== z.id);
        this._bs.sel = -1;
        this.render();
      });
    }
    on(".sbe-bed-zadd", "click", () => {
      const z = { id: foundry.utils.randomID(), name: L("SBE.Loc.NewZone", { n: b.zones.length + 1 }), from: null, to: null, dmgKey: "", protKey: "", mult: "", aim: "" };
      b.zones.push(z);
      this._zone = z.id;
      this.render();
    });
    for (const btn of root.querySelectorAll(".sbe-zed-tool")) {
      btn.addEventListener("click", () => {
        this._tool = btn.dataset.tool; this._bs.draft = null;
        if (this._tool !== "select") this._bs.sel = -1;
        this.render();
      });
    }
    on(".sbe-zed-delpiece", "click", () => this.#deletePiece());
    on(".sbe-zed-snapbox", "change", (ev) => { this._snap = ev.target.checked; });

    const svg = root.querySelector(".sbe-bed-svg");
    if (svg) wireShapeBoard(svg, {
      state: this._bs, pieces: () => b.pieces, tool: () => this._tool, step: () => (this._snap ? 1 : 0),
      pieceClass: "sbe-bed-piece", closeDist: 3, minSize: 1,
      make: (g) => {
        if (!this._zone) { ui.notifications.warn(L("SBE.Loc.NeedZone")); return null; }
        return { ...g, zone: this._zone };
      },
      onSelect: () => {
        const p = b.pieces[this._bs.sel];
        if (p && p.zone !== this._zone) { this._zone = p.zone; this.#markZone(b); }
      },
      redraw: () => this.#drawSvg()
    });
    this.#drawSvg();
    root.addEventListener("keydown", (ev) => {
      if (ev.target.closest("input, select, textarea")) return;
      if (ev.key === "Delete" || ev.key === "Backspace") { ev.preventDefault(); this.#deletePiece(); }
      if (ev.key === "Escape" && this._bs.draft) { ev.preventDefault(); ev.stopPropagation(); this._bs.draft = null; this.#drawSvg(); }
    });
  }

  /** La zone courante, marquée sans tout redessiner (le glisser continue). */
  #markZone(b) {
    for (const r of this.element.querySelectorAll(".sbe-bed-zrow[data-zone]")) r.classList.toggle("is-cur", r.dataset.zone === this._zone);
    const cur = this.element.querySelector(".sbe-bed-cur b");
    if (cur) cur.textContent = b.zones.find(z => z.id === this._zone)?.name ?? "—";
  }

  #deletePiece() {
    const b = this.#body();
    if (!b || this._bs.sel < 0) return;
    b.pieces.splice(this._bs.sel, 1);
    this._bs.sel = -1;
    this.#drawSvg();
  }

  /* ------------------------------------------------------------ */
  /*  Enregistrer, exporter, importer                              */
  /* ------------------------------------------------------------ */

  async #save() {
    const names = new Set();
    for (const b of this._bodies) {
      const n = b.name.trim().toLowerCase();
      if (!n) { ui.notifications.error(L("SBE.Loc.NeedName")); return; }
      if (names.has(n)) { ui.notifications.error(L("SBE.Loc.DupName", { name: b.name })); return; }
      names.add(n);
      const zn = new Set();
      for (const z of b.zones) {
        const k = z.name.trim().toLowerCase();
        if (!k) { ui.notifications.error(L("SBE.Loc.NeedZoneName", { body: b.name })); return; }
        if (zn.has(k)) { ui.notifications.error(L("SBE.Loc.DupZone", { body: b.name, name: z.name })); return; }
        zn.add(k);
        if (b.odds === "ranges" && (z.from === null || z.to === null)) { ui.notifications.error(L("SBE.Loc.NeedRange", { body: b.name, name: z.name })); return; }
        for (const f of ["mult", "aim"]) {
          if (!z[f] || isNum(z[f])) continue;
          const err = validateFormula(z[f]);
          if (err) { ui.notifications.error(`${b.name} — ${z.name} : ${z[f]} : ${err}`); return; }
        }
      }
      if (b.odds === "area" && b.zones.some(z => !b.pieces.some(p => p.zone === z.id))) {
        ui.notifications.error(L("SBE.Loc.NeedDrawing", { body: b.name })); return;
      }
    }
    /* Un modèle ne peut avoir qu'un corps. */
    const seen = new Map();
    for (const b of this._bodies) for (const m of b.models) {
      if (seen.has(m)) { ui.notifications.error(L("SBE.Loc.DupModel", { model: game.actors.get(m)?.name ?? m, a: seen.get(m), b: b.name })); return; }
      seen.set(m, b.name);
    }
    if (this._bodies.filter(b => !b.models.length).length > 1) { ui.notifications.error(L("SBE.Loc.TwoDefaults")); return; }
    await HitLocations.save(this._bodies);
    this._bodies = foundry.utils.deepClone(HitLocations.list());
    ui.notifications.info(L("SBE.Loc.Saved"));
    this.render();
  }

  #export() {
    const data = JSON.stringify({ sbe: "bodies", format: 1, bodies: this._bodies.map(b => HitLocations.clean(b)) }, null, 2);
    foundry.utils.saveDataToFile(data, "application/json", "sbe-corps.json");
  }

  /** Import : les corps du fichier rejoignent la liste (même nom =
      remplacé). Les modèles d'un autre monde ne sont pas repris.
      Rien n'est écrit avant « Enregistrer ». */
  #import() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      let json = null;
      try { json = JSON.parse(await file.text()); } catch (_e) { /* illisible */ }
      const raw = json?.sbe === "bodies" && Array.isArray(json.bodies) ? json.bodies : null;
      if (!raw) { ui.notifications.error(L("SBE.Loc.ImportBad")); return; }
      let added = 0, replaced = 0;
      for (const r of raw) {
        const b = HitLocations.clean({ ...r, id: null });
        if (!b.name) continue;
        b.models = b.models.filter(m => game.actors?.get(m)?.type === "template");
        const i = this._bodies.findIndex(x => x.name.trim().toLowerCase() === b.name.toLowerCase());
        if (i >= 0) { b.id = this._bodies[i].id; this._bodies[i] = b; replaced++; }
        else { this._bodies.push(b); added++; }
      }
      this.render();
      ui.notifications.info(L("SBE.Loc.ImportDone", { added, replaced }));
    });
    input.click();
  }
}
