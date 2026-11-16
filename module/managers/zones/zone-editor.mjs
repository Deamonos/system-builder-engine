/**
 * SBE — Manager « FORMES DE ZONE » (MJ)
 *
 * Le MJ dessine ses formes librement sur une feuille quadrillée
 * (carrée ou hexagonale, pour l'aperçu seulement) :
 *   - Sélection : cliquer un morceau le choisit, le glisser le déplace ;
 *   - Polygone  : un clic par point, double-clic (ou clic sur le premier
 *                 point) pour fermer ;
 *   - Ellipse   : glisser depuis le centre (Maj = cercle) ;
 *   - Rectangle : glisser d'un coin à l'autre.
 * Chaque morceau a son INTENSITÉ (% des dégâts). L'ancrage est le
 * point blanc (0, 0), la flèche montre l'avant de la forme.
 * Les formes se mesurent en cases : elles gardent leurs proportions
 * sur toutes les cartes.
 */

import { ZoneShapes, ANCHORS, ROTATES, WALLS } from "./zone-shapes.mjs";
import { piecePolygon, DEFAULT_COLOR } from "./zone-geom.mjs";
import { draftSvg, wireShapeBoard } from "../../helpers/shape-board.mjs";

const { ApplicationV2 } = foundry.applications.api;
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

const HALF = 8;          /* la feuille va de −8 à +8 cases */
const TOOLS = [["select", "fa-arrow-pointer"], ["poly", "fa-draw-polygon"], ["ellipse", "fa-circle"], ["rect", "fa-square"]];

export class SBEZoneEditor extends ApplicationV2 {

  static DEFAULT_OPTIONS = {
    id: "sbe-zone-editor",
    tag: "div",
    classes: ["sbe-zone-editor", "sbe-condense"],
    window: { title: "SBE.Zone.EditorTitle", icon: "fa-solid fa-draw-polygon", resizable: true },
    position: { width: 960, height: 820 }
  };

  _shapes = null;      /* copie de travail */
  _cur = null;         /* id de la forme ouverte */
  _bs = { sel: -1, draft: null };   /* planche : morceau choisi, tracé en cours */
  _tool = "select";
  _intensity = 100;
  _grid = "square";
  _snap = true;

  #shape() { return this._shapes.find(s => s.id === this._cur) ?? null; }

  async _renderHTML() {
    this._shapes ??= foundry.utils.deepClone(ZoneShapes.list());
    if (!this._shapes.some(s => s.id === this._cur)) this._cur = this._shapes[0]?.id ?? null;
    const s = this.#shape();
    const list = this._shapes.map(x => `
      <li class="${x.id === this._cur ? "active" : ""}" data-id="${esc(x.id)}">
        <i class="fa-solid ${x.anchor === "self" ? "fa-person-rifle" : "fa-bullseye"}"></i> ${esc(x.name || L("SBE.Zone.Unnamed"))}
      </li>`).join("") || `<li class="sbe-zed-empty">${L("SBE.Zone.NoShapes")}</li>`;

    const opt = (vals, cur, pref) => vals.map(v => `<option value="${v}" ${v === cur ? "selected" : ""}>${L(`${pref}${v || "inherit"}`)}</option>`).join("");
    const props = s ? `
      <div class="sbe-zed-props">
        <label class="sbe-zed-f"><span>${L("SBE.Zone.Name")}</span>
          <input type="text" data-prop="name" value="${esc(s.name)}" placeholder="${esc(L("SBE.Zone.NamePh"))}"></label>
        <label class="sbe-zed-f"><span>${L("SBE.Zone.Anchor")}</span>
          <select data-prop="anchor">${opt(ANCHORS, s.anchor, "SBE.Zone.Anchor_")}</select></label>
        <label class="sbe-zed-f"><span>${L("SBE.Zone.Rotate")}</span>
          <select data-prop="rotate">${opt(ROTATES, s.rotate, "SBE.Zone.Rotate_")}</select></label>
        <label class="sbe-zed-f"><span>${L("SBE.Zone.Cover")}</span>
          <input type="number" data-prop="cover" min="1" max="100" step="1" value="${s.cover ?? ""}" placeholder="${esc(L("SBE.Zone.CoverPh"))}"></label>
        <label class="sbe-zed-f"><span>${L("SBE.Zone.Walls")}</span>
          <select data-prop="walls">${opt(["", ...WALLS], s.walls, "SBE.Zone.Walls_")}</select></label>
        <label class="sbe-zed-f"><span>${L("SBE.Zone.Color")}</span>
          <input type="color" data-prop="color" value="${esc(s.color || DEFAULT_COLOR)}"></label>
      </div>
      <p class="notes">${L("SBE.Zone.PropsHint")}</p>
      <div class="sbe-zed-tools">
        ${TOOLS.map(([t, ic]) => `<button type="button" class="sbe-zed-tool ${this._tool === t ? "active" : ""}" data-tool="${t}" data-tooltip="${esc(L(`SBE.Zone.Tool_${t}`))}"><i class="fa-solid ${ic}"></i></button>`).join("")}
        <label class="sbe-zed-int"><span>${L("SBE.Zone.Intensity")}</span>
          <span class="sbe-zed-introw"><input type="number" class="sbe-zed-intensity" min="0" max="1000" step="5" value="${this.#selIntensity()}"> %</span></label>
        <button type="button" class="sbe-zed-delpiece" data-tooltip="${esc(L("SBE.Zone.DeletePiece"))}"><i class="fa-solid fa-eraser"></i></button>
        <select class="sbe-zed-grid">
          <option value="square" ${this._grid === "square" ? "selected" : ""}>${L("SBE.Zone.GridSquare")}</option>
          <option value="hex" ${this._grid === "hex" ? "selected" : ""}>${L("SBE.Zone.GridHex")}</option>
        </select>
        <label class="sbe-zed-snap"><input type="checkbox" class="sbe-zed-snapbox" ${this._snap ? "checked" : ""}> ${L("SBE.Zone.Snap")}</label>
      </div>
      <p class="notes sbe-zed-toolhint">${L(`SBE.Zone.ToolHint_${this._tool}`)}</p>
      <div class="sbe-zed-board"><svg class="sbe-zed-svg" viewBox="${-HALF} ${-HALF} ${HALF * 2} ${HALF * 2}"></svg></div>`
      : `<p class="notes">${L("SBE.Zone.PickOrCreate")}</p>`;

    return `
      <div class="sbe-zed">
        <aside class="sbe-zed-side">
          <ul class="sbe-zed-list">${list}</ul>
          <div class="sbe-zed-sidebtns">
            <button type="button" class="sbe-zed-new"><i class="fa-solid fa-plus"></i> ${L("SBE.Zone.New")}</button>
            <button type="button" class="sbe-zed-dup" ${s ? "" : "disabled"}><i class="fa-solid fa-copy"></i> ${L("SBE.Zone.Duplicate")}</button>
            <button type="button" class="sbe-zed-del" ${s ? "" : "disabled"}><i class="fa-solid fa-trash"></i> ${L("SBE.Zone.Delete")}</button>
          </div>
        </aside>
        <section class="sbe-zed-main">${props}</section>
      </div>
      <footer class="sbe-chatc-foot">
        <button type="button" class="sbe-zed-export"><i class="fa-solid fa-file-export"></i> ${L("SBE.Common.Export")}</button>
        <button type="button" class="sbe-zed-import"><i class="fa-solid fa-file-import"></i> ${L("SBE.Common.Import")}</button>
        <button type="button" class="sbe-zed-save"><i class="fa-solid fa-floppy-disk"></i> ${L("SBE.Common.Save")}</button>
      </footer>`;
  }

  _replaceHTML(result, content) { content.innerHTML = result; }

  #selIntensity() {
    const p = this.#shape()?.pieces?.[this._bs.sel];
    return p ? p.intensity : this._intensity;
  }

  /* ------------------------------------------------------------ */
  /*  Dessin de la feuille                                         */
  /* ------------------------------------------------------------ */

  #gridSvg() {
    let g = "";
    if (this._grid === "hex") {
      /* Hexagones « pointe en haut », largeur 1 case. */
      const w = 1, r = w / Math.sqrt(3), h = r * 2;
      for (let row = -HALF - 1; row <= HALF + 1; row++) {
        for (let col = -HALF - 1; col <= HALF + 1; col++) {
          const cx = col * w + (row % 2 ? w / 2 : 0), cy = row * h * 0.75;
          const pts = [0, 1, 2, 3, 4, 5].map(i => { const a = Math.PI / 180 * (60 * i - 90); return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`; }).join(" ");
          g += `<polygon points="${pts}" class="sbe-zed-gridline"/>`;
        }
      }
    } else {
      for (let i = -HALF; i <= HALF; i++) {
        g += `<line x1="${i}" y1="${-HALF}" x2="${i}" y2="${HALF}" class="sbe-zed-gridline"/>`;
        g += `<line x1="${-HALF}" y1="${i}" x2="${HALF}" y2="${i}" class="sbe-zed-gridline"/>`;
      }
    }
    return g;
  }

  #drawSvg() {
    const svg = this.element?.querySelector(".sbe-zed-svg");
    const s = this.#shape();
    if (!svg || !s) return;
    const pcs = s.pieces.map((p, i) => ({ p, i })).sort((a, b) => a.p.intensity - b.p.intensity);
    const col = /^#[0-9a-f]{6}$/i.test(s.color ?? "") ? s.color : DEFAULT_COLOR;
    let html = `<g>${this.#gridSvg()}</g>`;
    for (const { p, i } of pcs) {
      const pts = piecePolygon(p).map(([x, y]) => `${x},${y}`).join(" ");
      const a = (0.15 + 0.45 * Math.min(1, p.intensity / 100)).toFixed(2);
      html += `<polygon points="${pts}" data-i="${i}" class="sbe-zed-piece ${i === this._bs.sel ? "is-sel" : ""}" style="fill:${col};stroke:${col};fill-opacity:${a}"/>`;
    }
    html += draftSvg(this._bs.draft, { cls: "sbe-zed-draft", dot: "sbe-zed-dot" });
    html += `<line x1="0" y1="0" x2="1.4" y2="0" class="sbe-zed-fwd"/><polygon points="1.4,-0.22 1.8,0 1.4,0.22" class="sbe-zed-fwdhead"/>`;
    html += `<circle cx="0" cy="0" r="0.16" class="sbe-zed-anchor"/>`;
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
      const s = ZoneShapes.clean({ name: L("SBE.Zone.NewName", { n: this._shapes.length + 1 }), pieces: [] });
      this._shapes.push(s); this._cur = s.id; this._bs.sel = -1; this.render();
    });
    on(".sbe-zed-dup", "click", () => {
      const s = this.#shape(); if (!s) return;
      const c = ZoneShapes.clean({ ...foundry.utils.deepClone(s), id: null, name: `${s.name} (2)` });
      this._shapes.push(c); this._cur = c.id; this._bs.sel = -1; this.render();
    });
    on(".sbe-zed-del", "click", async () => {
      const s = this.#shape(); if (!s) return;
      const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: L("SBE.Zone.Delete") }, content: `<p>${esc(L("SBE.Zone.DeleteConfirm", { name: s.name }))}</p>` });
      if (!ok) return;
      this._shapes = this._shapes.filter(x => x !== s); this._cur = null; this._bs.sel = -1; this.render();
    });
    on(".sbe-zed-save", "click", () => this.#save());
    on(".sbe-zed-export", "click", () => this.#export());
    on(".sbe-zed-import", "click", () => this.#import());

    const s = this.#shape();
    if (!s) return;
    for (const inp of root.querySelectorAll("[data-prop]")) {
      inp.addEventListener("change", () => {
        const k = inp.dataset.prop;
        let v = inp.value;
        if (k === "cover") v = v === "" ? null : Math.max(1, Math.min(100, Number(v) || 50));
        s[k] = v;
        if (k === "name" || k === "anchor") this.render();
        else if (k === "color") this.#drawSvg();
      });
    }
    for (const b of root.querySelectorAll(".sbe-zed-tool")) {
      b.addEventListener("click", () => {
        /* Outil de dessin : l'intensité affichée est celle du PROCHAIN
           morceau ; seul l'outil Sélection modifie un morceau existant. */
        this._tool = b.dataset.tool; this._bs.draft = null;
        if (this._tool !== "select") this._bs.sel = -1;
        this.render();
      });
    }
    on(".sbe-zed-intensity", "change", (ev) => {
      const v = Math.max(0, Math.min(1000, Number(ev.target.value) || 0));
      this._intensity = v;
      const p = s.pieces[this._bs.sel];
      if (p) { p.intensity = v; this.#drawSvg(); }
    });
    on(".sbe-zed-delpiece", "click", () => this.#deletePiece());
    on(".sbe-zed-grid", "change", (ev) => { this._grid = ev.target.value; this.#drawSvg(); });
    on(".sbe-zed-snapbox", "change", (ev) => { this._snap = ev.target.checked; });

    const svg = root.querySelector(".sbe-zed-svg");
    if (svg) wireShapeBoard(svg, {
      state: this._bs, pieces: () => s.pieces, tool: () => this._tool, step: () => (this._snap ? 0.5 : 0),
      pieceClass: "sbe-zed-piece",
      make: (g) => ({ ...g, intensity: this._intensity }),
      onSelect: () => { const inp = this.element.querySelector(".sbe-zed-intensity"); if (inp) inp.value = this.#selIntensity(); },
      redraw: () => this.#drawSvg()
    });
    this.#drawSvg();
    root.addEventListener("keydown", (ev) => {
      if (ev.target.closest("input, select, textarea")) return;
      if (ev.key === "Delete" || ev.key === "Backspace") { ev.preventDefault(); this.#deletePiece(); }
      if (ev.key === "Escape" && this._bs.draft) { ev.preventDefault(); ev.stopPropagation(); this._bs.draft = null; this.#drawSvg(); }
    });
  }

  #deletePiece() {
    const s = this.#shape();
    if (!s || this._bs.sel < 0) return;
    s.pieces.splice(this._bs.sel, 1);
    this._bs.sel = -1;
    this.#drawSvg();
  }

  /* ------------------------------------------------------------ */
  /*  Enregistrer, exporter, importer                              */
  /* ------------------------------------------------------------ */

  async #save() {
    const names = new Set();
    for (const s of this._shapes) {
      const n = s.name.trim().toLowerCase();
      if (!n) { ui.notifications.error(L("SBE.Zone.NeedName")); return; }
      if (names.has(n)) { ui.notifications.error(L("SBE.Zone.DupName", { name: s.name })); return; }
      names.add(n);
      if (!s.pieces.length) { ui.notifications.error(L("SBE.Zone.Empty", { name: s.name })); return; }
    }
    await ZoneShapes.save(this._shapes);
    this._shapes = foundry.utils.deepClone(ZoneShapes.list());
    ui.notifications.info(L("SBE.Zone.Saved"));
    this.render();
  }

  #export() {
    const data = JSON.stringify({ sbe: "zones", format: 1, shapes: this._shapes.map(s => ZoneShapes.clean(s)) }, null, 2);
    foundry.utils.saveDataToFile(data, "application/json", "sbe-formes-de-zone.json");
  }

  /** Import : les formes du fichier rejoignent la liste (même nom =
      remplacée). Rien n'est écrit avant « Enregistrer ». */
  #import() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      let json = null;
      try { json = JSON.parse(await file.text()); } catch (_e) { /* illisible */ }
      const raw = json?.sbe === "zones" && Array.isArray(json.shapes) ? json.shapes : null;
      if (!raw) { ui.notifications.error(L("SBE.Zone.ImportBad")); return; }
      let added = 0, replaced = 0;
      for (const r of raw) {
        const s = ZoneShapes.clean({ ...r, id: null });
        if (!s.name) continue;
        const i = this._shapes.findIndex(x => x.name.trim().toLowerCase() === s.name.toLowerCase());
        if (i >= 0) { s.id = this._shapes[i].id; this._shapes[i] = s; replaced++; }
        else { this._shapes.push(s); added++; }
      }
      this.render();
      ui.notifications.info(L("SBE.Zone.ImportDone", { added, replaced }));
    });
    input.click();
  }
}
