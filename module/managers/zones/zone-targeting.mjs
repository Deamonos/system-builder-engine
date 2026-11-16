/**
 * SBE — FORMES DE ZONE : visée sur la carte et cibles touchées
 *
 * - aim()      : la forme suit la souris (molette = rotation, Maj = pas
 *                de 15°), les jetons qui seront touchés s'allument selon
 *                leur intensité. Clic = valider, Échap / clic droit =
 *                annuler (rien n'est dépensé).
 * - affected() : qui est touché par une forme posée, selon le % de
 *                couverture, la mesure (cases ou jeton) et les murs.
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { placeShape, snapAngle, coverageOf, tokenArea } from "./zone-geom.mjs";
import { createCancelHandle, setAimCursor } from "../../helpers/canvas-utils.mjs";
import { PropManager } from "../props/prop-manager.mjs";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const hexNum = (c) => { const n = parseInt(String(c ?? "").replace("#", ""), 16); return Number.isFinite(n) ? n : 0xff6a00; };

/** Ce point de collision ne touche-t-il QUE des portes fines (fermées, non blindées) ? */
function onlyThinDoors(vertex) {
  const edges = vertex?.edges ? [...vertex.edges] : [];
  if (!edges.length) return false;
  return edges.every(e => {
    const w = e?.object?.document ?? (e?.object?.documentName === "Wall" ? e.object : null);
    if (!w || !(Number(w.door) > 0)) return false;
    return !w.flags?.[SYSTEM_ID]?.config?.armored;
  });
}

export class ZoneTargeting {

  static cellSize() { return canvas?.dimensions?.size || 100; }

  static distCases(a, b) {
    const unit = Number(canvas.dimensions?.distance) || 1;
    try { return (Number(canvas.grid.measurePath([a, b]).distance) || 0) / unit; }
    catch (_e) { return Math.hypot(a.x - b.x, a.y - b.y) / this.cellSize(); }
  }

  static isGridless() {
    try { return canvas.grid?.type === CONST.GRID_TYPES.GRIDLESS || !!canvas.grid?.isGridless; }
    catch (_e) { return true; }
  }

  /** Les surfaces d'un jeton à mesurer : ses cases, ou lui-même. */
  static #areasOf(token, measure) {
    const d = token.document;
    if (measure === "cells" && !this.isGridless() && typeof d.getOccupiedGridSpaceOffsets === "function") {
      try {
        const out = d.getOccupiedGridSpaceOffsets().map(o => canvas.grid.getVertices(o).map(p => [p.x, p.y]))
          .filter(a => a.length >= 3);
        if (out.length) return out;
      } catch (_e) { /* repli : le jeton */ }
    }
    const b = token.bounds;
    const shp = d.shape;
    const T = CONST.TOKEN_SHAPES ?? {};
    const ellipse = shp !== undefined && [T.ELLIPSE_1, T.ELLIPSE_2].includes(shp);
    return [tokenArea(b.x, b.y, b.width, b.height, ellipse)];
  }

  /** Un mur coupe-t-il le chemin de l'ancrage à ce point ? */
  static #blocker(origin, walls) {
    if (!walls || walls === "none") return null;
    const backend = CONFIG.Canvas?.polygonBackends?.[walls];
    if (!backend?.testCollision) return null;
    return (x, y) => {
      try {
        const hits = backend.testCollision(origin, { x, y }, { type: walls, mode: "all" });
        if (!Array.isArray(hits)) return !!hits;
        /* Une porte FERMÉE normale est fine : le souffle la traverse.
           Seules les portes blindées (et les vrais murs) l'arrêtent. */
        return hits.some(v => !onlyThinDoors(v));
      }
      catch (_e) { return false; }
    };
  }

  /**
   * Jetons touchés par une forme posée.
   * @returns {{token, intensity:number, cover:number, dist:number}[]}
   */
  static affected(placed, { origin, threshold = 50, measure = "cells", walls = "move", exclude = null, reach = null } = {}) {
    const wall = this.#blocker(origin, walls);
    /* PORTÉE MAX (zone qui part du tireur) : rien ne compte au-delà —
       un gabarit plus long que la portée de l'arme est coupé net. */
    const lim = reach?.center && reach.cases > 0 ? reach.cases * this.cellSize() : 0;
    const blocked = (wall || lim) ? (x, y) => (lim && Math.hypot(x - reach.center.x, y - reach.center.y) > lim) || (wall ? wall(x, y) : false) : null;
    const out = [];
    for (const t of canvas.tokens?.placeables ?? []) {
      if (!t.actor || t === exclude || t.document.hidden && !game.user.isGM) continue;
      /* Objet posé ignoré en combat : la zone ne le touche pas. */
      if (PropManager.isIgnored(t)) continue;
      let best = null;
      for (const area of this.#areasOf(t, measure)) {
        const c = coverageOf(area, placed, threshold, blocked);
        if (c && (!best || c.intensity > best.intensity || (c.intensity === best.intensity && c.cover > best.cover))) best = c;
      }
      if (best) out.push({ token: t, intensity: best.intensity, cover: best.cover, dist: this.distCases(origin, t.center) });
    }
    return out.sort((a, b) => a.dist - b.dist);
  }

  /**
   * Visée imposée (piège) : une zone qui part du tireur est tournée vers
   * la cible ; une zone d'impact tombe sur elle.
   * @returns {{origin, angle, point, token}|null}
   */
  static autoAim({ shape, attacker, target, at = null }) {
    if (!target?.center) return null;
    const self = shape.anchor === "self";
    if (self && !attacker) return null;
    /* `at` : centre lu sur le document (le pion peut être en pleine animation). */
    const p = { ...(at ?? target.center) };
    const from = attacker?.center ?? p;
    const angle = from === p || (from.x === p.x && from.y === p.y) ? 0 : Math.atan2(p.y - from.y, p.x - from.x);
    return { origin: self ? { ...attacker.center } : p, angle, point: p, token: self ? null : target };
  }

  /**
   * Visée interactive.
   * @param opt { shape, scale, attacker (Token|null), range (cases, impact),
   *              threshold, measure, walls }
   * @returns {Promise<{origin, angle, point, token}|null>}
   */
  static aim(opt) {
    return new Promise((resolve) => {
      const stage = canvas.stage;
      if (!stage || !canvas.ready) { resolve(null); return; }
      const { shape, attacker } = opt;
      const self = shape.anchor === "self";
      if (self && !attacker) { ui.notifications.warn(L("SBE.Zone.NeedToken")); resolve(null); return; }
      const cell = this.cellSize();
      const gfx = new PIXI.Graphics();
      canvas.interface.addChild(gfx);
      let wheel = 0;
      let last = 0;
      let state = null;
      ui.notifications.info(L(self ? "SBE.Zone.AimSelf" : "SBE.Zone.AimImpact"));

      const mouse = () => {
        const m = canvas.mousePosition;
        return m && Number.isFinite(m.x) ? { x: m.x, y: m.y } : null;
      };
      const compute = (p) => {
        const origin = self ? { ...attacker.center } : p;
        const from = self ? attacker.center : (attacker?.center ?? p);
        let ang = Math.atan2(p.y - from.y, p.x - from.x);
        if (!self && !attacker) ang = 0;
        ang = snapAngle(ang + wheel, shape.rotate ?? "free");
        const out = !self && opt.range > 0 && attacker && this.distCases(attacker.center, p) > opt.range + 1e-6;
        const placed = placeShape(shape, origin, ang, cell, opt.scale);
        const hits = this.affected(placed, { origin, threshold: opt.threshold, measure: opt.measure, walls: opt.walls,
          exclude: self ? attacker : null, reach: self && opt.range > 0 ? { center: attacker.center, cases: opt.range } : null });
        return { origin, angle: ang, placed, hits, out, point: p };
      };
      const draw = (s) => {
        gfx.clear();
        if (opt.range > 0 && attacker) {
          gfx.lineStyle(2, 0xffffff, 0.6).drawCircle(attacker.center.x, attacker.center.y, opt.range * cell);
        }
        /* Couleur du MJ ; grise hors de portée. */
        for (const pc of [...s.placed].sort((a, b) => a.intensity - b.intensity)) {
          const col = s.out ? 0x888888 : hexNum(pc.color);
          const a = 0.12 + 0.3 * Math.min(1, pc.intensity / 100);
          gfx.lineStyle(2, col, 0.9).beginFill(col, a).drawPolygon(pc.pts.flat()).endFill();
        }
        for (const h of s.hits) {
          const b = h.token.bounds;
          gfx.lineStyle(3, 0xff2020, 0.5 + 0.5 * Math.min(1, h.intensity / 100)).drawRect(b.x, b.y, b.width, b.height);
        }
        gfx.lineStyle(0).beginFill(0xffffff, 0.9).drawCircle(s.origin.x, s.origin.y, Math.max(3, cell * 0.06)).endFill();
      };
      const refresh = (force = false) => {
        const now = Date.now();
        if (!force && now - last < 50) return;
        last = now;
        const p = mouse();
        if (!p) return;
        state = compute(p);
        draw(state);
      };

      const cancel = createCancelHandle();
      const cleanup = () => {
        stage.off("mousemove", onMove);
        stage.off("mousedown", onClick);
        const board = canvas.app?.view;
        board?.removeEventListener("wheel", onWheel, true);
        cancel.dispose();
        setAimCursor(false);
        try { gfx.destroy(); } catch (_e) { /* */ }
      };
      cancel.setOnAbort(() => { cleanup(); resolve(null); });
      const onMove = () => refresh();
      const onWheel = (ev) => {
        if ((shape.rotate ?? "free") === "none") return;
        ev.preventDefault(); ev.stopPropagation();
        const step = shape.rotate === "4" ? 90 : shape.rotate === "8" ? 45 : (ev.shiftKey ? 15 : 5);
        wheel += (ev.deltaY > 0 ? 1 : -1) * step * Math.PI / 180;
        refresh(true);
      };
      const onClick = (event) => {
        const b = event?.data?.originalEvent?.button ?? event?.data?.button ?? event?.button ?? 0;
        if (b !== 0) return;
        refresh(true);
        if (!state) return;
        if (state.out) { ui.notifications.warn(L("SBE.Zone.OutOfRange")); return; }
        const p = state.point;
        const token = self ? null : (canvas.tokens.placeables
          .filter(t => t.visible && t !== attacker && t.bounds?.contains(p.x, p.y) && !PropManager.isIgnored(t))
          .sort((a, b2) => (b2.document.sort ?? 0) - (a.document.sort ?? 0))[0] ?? null);
        const res = { origin: state.origin, angle: state.angle, point: p, token };
        cleanup();
        resolve(res);
      };
      stage.on("mousemove", onMove);
      stage.on("mousedown", onClick);
      setAimCursor(true);
      canvas.app?.view?.addEventListener("wheel", onWheel, { capture: true, passive: false });
      refresh(true);
    });
  }

  /** Bref éclat de la zone finale (après déviation), pour tous. */
  static flash(placed, ms = 1600) {
    if (!canvas?.interface) return;
    const g = new PIXI.Graphics();
    for (const pc of placed) {
      const col = hexNum(pc.color);
      g.lineStyle(2, col, 1).beginFill(col, 0.25 + 0.3 * Math.min(1, pc.intensity / 100)).drawPolygon(pc.pts.flat()).endFill();
    }
    canvas.interface.addChild(g);
    setTimeout(() => { try { g.destroy(); } catch (_e) { /* */ } }, ms);
  }
}
