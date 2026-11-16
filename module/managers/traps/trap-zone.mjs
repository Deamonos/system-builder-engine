/**
 * SBE — PIÈGES : zone de déclenchement
 *
 * Zone d'un piège posé (drapeau du pion `trap.zone`) :
 *   { shape: self|radius|rect|circle, w, h, r, arc, ox, oy, rot }
 * ox / oy : décalage (px) du centre de la zone par rapport au centre du
 * pion ; rot : rotation propre (degrés), qui s'ajoute à celle du pion.
 * Rotation 0 = vers le haut de l'image (comme Foundry).
 *
 * - polygonOf(td) : la zone en polygone (coordonnées de la scène) ;
 * - placeZone(cfg, at, size) : la phase de pose (après l'orientation) ;
 * - draw(gfx, td) : la dessine (survol, pose).
 */

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const RAD = Math.PI / 180;

/** Zone par défaut d'un réglage (centrée sur l'objet, sans rotation propre). */
export function zoneFromCfg(cfg) {
  return { shape: cfg.trZone, w: cfg.trW, h: cfg.trH, r: cfg.trR, arc: cfg.trArc, ox: 0, oy: 0, rot: 0 };
}

/**
 * Polygone (liste plate x, y) d'une zone, autour du centre c, pion de
 * taille tw × th (px) tourné de tokRot degrés.
 */
export function zonePoints(zone, c, tw, th, tokRot, gs) {
  const shape = zone?.shape ?? "self";
  const cx = c.x + (Number(zone?.ox) || 0), cy = c.y + (Number(zone?.oy) || 0);
  const rot = ((Number(tokRot) || 0) + (Number(zone?.rot) || 0)) * RAD;
  const turn = (x, y, a) => [cx + x * Math.cos(a) - y * Math.sin(a), cy + x * Math.sin(a) + y * Math.cos(a)];
  const rect = (w, h, a) => [turn(-w / 2, -h / 2, a), turn(w / 2, -h / 2, a), turn(w / 2, h / 2, a), turn(-w / 2, h / 2, a)].flat();
  if (shape === "self") return rect(tw, th, (Number(tokRot) || 0) * RAD).map((v, i) => v - (i % 2 ? cy - c.y : cx - c.x));
  if (shape === "rect") return rect((Number(zone.w) || 1) * gs, (Number(zone.h) || 1) * gs, rot);
  const n = 48;
  if (shape === "radius") {
    /* Rayon compté depuis le bord de l'objet. */
    const R = (Number(zone.r) || 0) * gs + Math.max(tw, th) / 2;
    const out = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; out.push(c.x + Math.cos(a) * R, c.y + Math.sin(a) * R); }
    return out;
  }
  /* Cercle ou cône : sommet au centre de la zone, tourné vers le haut de l'objet. */
  const R = (Number(zone.r) || 1) * gs;
  const arc = Math.max(1, Math.min(360, Number(zone.arc) || 360)) * RAD;
  const out = [];
  if (arc >= Math.PI * 2 - 1e-6) {
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; out.push(cx + Math.cos(a) * R, cy + Math.sin(a) * R); }
    return out;
  }
  const dir = rot - Math.PI / 2;
  out.push(cx, cy);
  const k = Math.max(4, Math.ceil(n * arc / (Math.PI * 2)));
  for (let i = 0; i <= k; i++) { const a = dir - arc / 2 + (i / k) * arc; out.push(cx + Math.cos(a) * R, cy + Math.sin(a) * R); }
  return out;
}

/** Polygone de la zone d'un pion de piège posé. */
export function polygonOf(td, zone) {
  const gs = td.parent?.grid?.size || canvas?.grid?.size || 100;
  const w = (td.width ?? 1) * gs, h = (td.height ?? 1) * gs;
  const c = { x: td.x + w / 2, y: td.y + h / 2 };
  return zonePoints(zone, c, w, h, td.rotation, gs);
}

/**
 * La zone de déclenchement d'un piège posé : ses polygones (pour la
 * dessiner) et son test. Un piège accroché à une RÉGION prend la forme
 * de la région (polygones quelconques, plusieurs formes, élévation).
 */
export function triggerZoneOf(td, zone, region = null) {
  if (region) {
    return {
      polys: (region.polygons ?? []).map(p => p.points),
      has: (p, elevation = 0) => region.testPoint({ x: p.x, y: p.y, elevation })
    };
  }
  const pts = polygonOf(td, zone);
  return { polys: [pts], has: (p) => contains(pts, p) };
}

/** Distance (px) d'un point à des polygones (0 dedans). */
export function distanceTo(polys, p) {
  let best = Infinity;
  for (const pts of polys ?? []) {
    if (contains(pts, p)) return 0;
    for (let i = 0; i < pts.length; i += 2) {
      const ax = pts[i], ay = pts[i + 1], bx = pts[(i + 2) % pts.length], by = pts[(i + 3) % pts.length];
      const dx = bx - ax, dy = by - ay;
      const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / ((dx * dx + dy * dy) || 1)));
      best = Math.min(best, Math.hypot(p.x - (ax + t * dx), p.y - (ay + t * dy)));
    }
  }
  return best;
}

export function contains(pts, p) {
  if (!pts?.length) return false;
  return new PIXI.Polygon(pts).contains(p.x, p.y);
}

/** Dessine une zone (contour et fond jaunes, comme une alerte). */
export function drawZone(gfx, pts, color = 0xffc400) {
  if (!pts?.length) return;
  gfx.lineStyle(2, color, 0.9).beginFill(color, 0.18).drawPolygon(pts).endFill();
}

/* ============================================================ */
/*  Pose                                                         */
/* ============================================================ */

/** Fenêtre « taille de la zone » (le poseur peut la régler). */
async function askSize(z) {
  const DialogV2 = foundry.applications.api.DialogV2;
  const rect = z.shape === "rect";
  const f = (name, v, step) => `<div class="form-group"><label>${L(`SBE.Trap.Z.${name}`)}</label><input type="number" name="${name}" value="${v}" min="0.25" step="${step}"></div>`;
  const content = rect ? f("w", z.w, 0.5) + f("h", z.h, 0.5) : f("r", z.r, 0.5) + f("arc", z.arc, 5);
  const res = await DialogV2.wait({
    window: { title: L("SBE.Trap.Z.Title"), icon: "fa-solid fa-crosshairs" },
    content,
    buttons: [{
      action: "ok", label: L("SBE.Common.Validate"), icon: "fa-solid fa-check", default: true,
      callback: (_ev, btn) => Object.fromEntries([...btn.form.elements].filter(e => e.name).map(e => [e.name, Number(e.value)]))
    }, { action: "cancel", label: L("SBE.Common.Cancel"), icon: "fa-solid fa-xmark" }],
    rejectClose: false
  }).catch(() => null);
  if (!res || res === "cancel") return null;
  const out = { ...z };
  for (const [k, v] of Object.entries(res)) if (Number.isFinite(v) && v > 0) out[k] = k === "arc" ? Math.min(360, v) : v;
  return out;
}

/**
 * Phase de pose de la zone, une fois l'objet posé et orienté.
 * @param cfg   réglages effectifs du piège
 * @param at    { x, y, rotation } de l'objet
 * @param size  { w, h } en cases
 * @returns {Promise<object|null>} la zone, ou null (annulé)
 */
export async function placeZone(cfg, at, size) {
  let zone = zoneFromCfg(cfg);
  if (!["rect", "circle"].includes(zone.shape) || !cfg.trPlace) return zone;
  /* Un rectangle réglable se dessine en deux clics (ses coins) : la
     fenêtre de taille ne sert qu'au cercle / cône (rayon, angle). */
  if (cfg.trResize && zone.shape !== "rect") {
    zone = await askSize(zone);
    if (!zone) return null;
  }
  const gs = canvas.grid?.size || 100;
  const tw = size.w * gs, th = size.h * gs;
  const center = { x: at.x, y: at.y };
  /* Rectangle réglable : deux coins. Sinon : la zone suit la souris. */
  const twoClicks = zone.shape === "rect" && cfg.trResize;
  return new Promise((resolve) => {
    const gfx = new PIXI.Graphics();
    gfx.eventMode = "none";
    canvas.controls.addChild(gfx);
    const body = new PIXI.Graphics();
    body.eventMode = "none";
    body.lineStyle(2, 0xffffff, 0.7).drawRect(center.x - tw / 2, center.y - th / 2, tw, th);
    canvas.controls.addChild(body);
    let corner = null;
    let rot = 0;
    const pos = () => canvas.mousePosition ?? center;
    const snap = (p) => {
      try { return canvas.grid.getSnappedPoint(p, { mode: CONST.GRID_SNAPPING_MODES.VERTEX }); } catch (_e) { return p; }
    };
    const current = () => {
      const p = pos();
      if (twoClicks) {
        if (!corner) return null;
        const q = snap(p);
        const w = Math.max(gs * 0.25, Math.abs(q.x - corner.x)), h = Math.max(gs * 0.25, Math.abs(q.y - corner.y));
        const mid = { x: (q.x + corner.x) / 2, y: (q.y + corner.y) / 2 };
        return { ...zone, w: w / gs, h: h / gs, ox: mid.x - center.x, oy: mid.y - center.y, rot: -(at.rotation || 0) };
      }
      return { ...zone, ox: p.x - center.x, oy: p.y - center.y, rot };
    };
    const redraw = () => {
      gfx.clear();
      const z = current();
      if (!z) {
        const p = snap(pos());
        gfx.beginFill(0xffc400, 0.9).drawCircle(p.x, p.y, Math.max(3, gs * 0.06)).endFill();
        return;
      }
      drawZone(gfx, zonePoints(z, center, tw, th, at.rotation, gs));
    };
    const wheel = (ev) => {
      if (twoClicks) return;
      ev.preventDefault(); ev.stopPropagation();
      rot = (rot + (ev.deltaY > 0 ? 15 : -15) * (ev.shiftKey ? 1 / 15 : 1) + 360) % 360;
      redraw();
    };
    const done = (val) => {
      canvas.stage.off("pointermove", redraw);
      canvas.stage.off("pointerdown", down);
      window.removeEventListener("wheel", wheel, { capture: true });
      window.removeEventListener("keydown", key, { capture: true });
      gfx.destroy(); body.destroy();
      resolve(val);
    };
    const down = (ev) => {
      const b = ev?.button ?? ev?.data?.button ?? 0;
      if (b === 2) return done(null);
      if (b !== 0) return;
      ev.stopPropagation?.();
      if (twoClicks && !corner) {
        corner = snap(pos());
        ui.notifications.info(L("SBE.Trap.Z.Corner2"));
        return;
      }
      const z = current();
      done(z ? { ...z, ox: Math.round(z.ox), oy: Math.round(z.oy), rot: Math.round(z.rot) } : null);
    };
    const key = (ev) => { if (ev.key === "Escape") { ev.preventDefault(); done(null); } };
    canvas.stage.on("pointermove", redraw);
    canvas.stage.on("pointerdown", down);
    window.addEventListener("wheel", wheel, { capture: true, passive: false });
    window.addEventListener("keydown", key, { capture: true });
    ui.notifications.info(L(twoClicks ? "SBE.Trap.Z.Corner1" : "SBE.Trap.Z.Place"));
    redraw();
  });
}
