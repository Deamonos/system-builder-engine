/**
 * SBE — FORMES DE ZONE : géométrie pure (sans Foundry)
 *
 * Une FORME est un ensemble de MORCEAUX dessinés, mesurés en CASES,
 * dans le repère de son ancrage : l'ancrage est en (0, 0), l'avant
 * pointe vers +x (l'est), y vers le bas comme sur la carte.
 *
 *   piece = { kind: "poly",    pts: [[x, y], …],          intensity }
 *         | { kind: "ellipse", x, y, rx, ry, rot?,        intensity }
 *         | { kind: "rect",    x, y, w, h, rot?,          intensity }
 *
 * Intensité en % (100 = dégâts pleins). La COULEUR est celle du
 * gabarit entier (« #rrggbb ») : un code couleur du MJ (rouge = feu,
 * vert = gaz…), indépendant des dégâts. Tout ici est du calcul : le
 * même code sert à l'éditeur, à l'aperçu sur la carte et aux tests.
 */

/** Couleur d'une forme sans couleur choisie. */
export const DEFAULT_COLOR = "#ff6a00";

/** Ellipse → polygone (assez de côtés pour un bord qui paraît lisse). */
function ellipsePts(cx, cy, rx, ry, rot = 0, n = 48) {
  const out = [];
  const c = Math.cos(rot), s = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    out.push([cx + x * c - y * s, cy + x * s + y * c]);
  }
  return out;
}

function rectPts(x, y, w, h, rot = 0) {
  /* (x, y) = coin haut-gauche ; rotation autour du centre. */
  const cx = x + w / 2, cy = y + h / 2;
  const c = Math.cos(rot), s = Math.sin(rot);
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]
    .map(([px, py]) => [cx + px * c - py * s, cy + px * s + py * c]);
}

/** Un morceau → son contour (en cases, repère de l'ancrage). */
export function piecePolygon(p) {
  if (!p) return [];
  if (p.kind === "ellipse") return ellipsePts(+p.x || 0, +p.y || 0, Math.abs(+p.rx || 0), Math.abs(+p.ry || 0), +p.rot || 0);
  if (p.kind === "rect") return rectPts(+p.x || 0, +p.y || 0, Math.abs(+p.w || 0), Math.abs(+p.h || 0), +p.rot || 0);
  return (Array.isArray(p.pts) ? p.pts : []).map(([x, y]) => [+x || 0, +y || 0]);
}

/**
 * Un morceau nettoyé (géométrie seule) : ses propriétés propres
 * (intensité d'un gabarit, zone d'un corps…) sont ajoutées par
 * l'appelant. null = inutilisable.
 */
export function cleanPiece(p) {
  const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
  if (p?.kind === "ellipse") return { kind: "ellipse", x: num(p.x), y: num(p.y), rx: Math.abs(num(p.rx, 1)), ry: Math.abs(num(p.ry, 1)), rot: num(p.rot) };
  if (p?.kind === "rect") return { kind: "rect", x: num(p.x), y: num(p.y), w: Math.abs(num(p.w, 1)), h: Math.abs(num(p.h, 1)), rot: num(p.rot) };
  const pts = (Array.isArray(p?.pts) ? p.pts : []).map(q => [num(q?.[0]), num(q?.[1])]);
  return pts.length >= 3 ? { kind: "poly", pts } : null;
}

/** Surface d'un morceau (unités du dessin²). */
export function pieceArea(p) {
  const pts = piecePolygon(p);
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  return Math.abs(a) / 2;
}

/* ------------------------------------------------------------ */
/*  Formes simples, réglées par des tailles (en cases)           */
/* ------------------------------------------------------------ */

/** Cercle : rayon r, posé sur le point d'impact. */
export function circleShape(r) {
  return { anchor: "impact", rotate: "none",
    pieces: [{ kind: "ellipse", x: 0, y: 0, rx: r, ry: r, intensity: 100 }] };
}

/** Cône : part du tireur, longueur L, ouverture en degrés. */
export function coneShape(L, angleDeg) {
  const half = Math.max(1, Math.min(179, Number(angleDeg) || 90)) * Math.PI / 360;
  const pts = [[0, 0]];
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const a = -half + (2 * half * i) / n;
    pts.push([Math.cos(a) * L, Math.sin(a) * L]);
  }
  return { anchor: "self", rotate: "free", pieces: [{ kind: "poly", pts, intensity: 100 }] };
}

/** Ligne : part du tireur, longueur L, largeur w. */
export function lineShape(L, w) {
  const h = Math.max(0.1, Number(w) || 1) / 2;
  return { anchor: "self", rotate: "free",
    pieces: [{ kind: "poly", pts: [[0, -h], [L, -h], [L, h], [0, h]], intensity: 100 }] };
}

/* ------------------------------------------------------------ */
/*  Placement sur la carte                                       */
/* ------------------------------------------------------------ */

/**
 * Pose la forme : chaque morceau devient un polygone en PIXELS.
 * @param shape   forme (morceaux en cases)
 * @param origin  {x, y} position de l'ancrage, en pixels
 * @param angle   orientation en radians (0 = vers l'est)
 * @param cell    taille d'une case en pixels
 * @param scale   agrandissement (1 = tel que dessiné)
 * @returns {{pts:number[][], intensity:number}[]}
 */
export function placeShape(shape, origin, angle, cell, scale = 1) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const k = cell * (Number(scale) > 0 ? Number(scale) : 1);
  return (shape?.pieces ?? []).map(p => ({
    intensity: Math.max(0, Math.min(1000, Number(p.intensity ?? 100))),
    color: shape?.color || DEFAULT_COLOR,
    pts: piecePolygon(p).map(([x, y]) => [origin.x + (x * c - y * s) * k, origin.y + (x * s + y * c) * k])
  })).filter(pl => pl.pts.length >= 3);
}

/** Orientation imposée par le réglage de rotation. */
export function snapAngle(angle, mode) {
  if (mode === "none") return 0;
  const step = mode === "4" ? Math.PI / 2 : mode === "8" ? Math.PI / 4 : 0;
  return step ? Math.round(angle / step) * step : angle;
}

/* ------------------------------------------------------------ */
/*  Couverture                                                   */
/* ------------------------------------------------------------ */

export function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi)) inside = !inside;
  }
  return inside;
}

function bbox(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
}

/** Points d'échantillon répartis dans une surface (case, jeton). */
export function samplePoints(area, n = 8) {
  const b = bbox(area);
  const out = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = b.x0 + ((i + 0.5) / n) * (b.x1 - b.x0);
      const y = b.y0 + ((j + 0.5) / n) * (b.y1 - b.y0);
      if (pointInPoly(x, y, area)) out.push([x, y]);
    }
  }
  return out;
}

/**
 * INTENSITÉ reçue par une surface (une case ou un jeton) :
 * on parcourt les intensités de la plus forte à la plus faible ; la
 * surface prend la première dont les morceaux (≥ cette intensité)
 * couvrent au moins `threshold` % d'elle. Les points cachés par un
 * mur (blocked) ne comptent pas comme couverts.
 * @returns {{intensity:number, cover:number}|null}  null = pas touchée
 */
export function coverageOf(area, placed, threshold = 50, blocked = null, n = 8) {
  const pts = samplePoints(area, n);
  if (!pts.length || !placed.length) return null;
  const levels = [...new Set(placed.map(p => p.intensity))].sort((a, b) => b - a);
  const need = Math.max(0.01, Math.min(100, Number(threshold) || 50)) / 100;
  /* Points visibles et dans la forme : calculés une fois. */
  const inside = pts.map(([x, y]) => {
    const lv = placed.filter(p => pointInPoly(x, y, p.pts)).map(p => p.intensity);
    if (!lv.length) return -1;
    if (blocked && blocked(x, y)) return -1;
    return Math.max(...lv);
  });
  for (const L of levels) {
    const cover = inside.filter(v => v >= L).length / pts.length;
    if (cover + 1e-9 >= need) return { intensity: L, cover: Math.round(cover * 100) };
  }
  return null;
}

/** Contour d'un jeton (rectangle ou ellipse), en pixels. */
export function tokenArea(x, y, w, h, ellipse = false) {
  if (ellipse) return ellipsePts(x + w / 2, y + h / 2, w / 2, h / 2, 0, 32);
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
}

/* ------------------------------------------------------------ */
/*  Visée au sol                                                 */
/* ------------------------------------------------------------ */

/** DD de la visée au sol : base + part liée à la distance. */
export function groundDD(base, byRange, dist, range) {
  const ratio = range > 0 ? Math.min(1, Math.max(0, dist / range)) : 0;
  return Math.round((Number(base) || 0) + ratio * (Number(byRange) || 0));
}

/** Déviation : écart de min à (min + part de la distance), direction au hasard. */
export function scatter(point, min, max, dist, range, cell, rnd = Math.random) {
  const lo = Math.min(min, max), hi = Math.max(min, max);
  const ratio = range > 0 ? Math.min(1, Math.max(0, dist / range)) : 0;
  const cap = lo + ratio * (hi - lo);
  const cases = Math.min(hi, Math.max(lo, lo + rnd() * (cap - lo)));
  const a = rnd() * Math.PI * 2;
  return { x: point.x + Math.cos(a) * cases * cell, y: point.y + Math.sin(a) * cases * cell, cases: Math.round(cases * 10) / 10 };
}
