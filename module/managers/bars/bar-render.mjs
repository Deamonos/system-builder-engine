/**
 * SBE — BARRES DE JETONS : le dessin (PIXI) et les animations
 *
 * Chaque jeton reçoit un conteneur `sbeBars` (à côté des barres natives)
 * et, si un palier le demande, un halo `sbeHalo`. Une barre = une « vue »
 * qui garde son état : pourcentage affiché (il GLISSE vers la nouvelle
 * valeur), palier en cours, flash de perte / de gain, particules.
 *
 * Une vue = ombre, CORPS découpé par la forme (fond, remplissage,
 * temporaires, motif, relief, effets, flash), contour, cadre (image
 * étirée à bords fixes), particules, texte. La forme est tracée par le
 * code (arrondie, biseautée, chevron…) ou donnée par une image (SVG/PNG).
 *
 * Le MÊME code dessine l'aperçu de l'éditeur (`createBarPreview`).
 * Une seule boucle d'animation (ticker du canevas) pour la scène.
 */

import { evalExpression } from "../../builder/formula-engine.mjs";
import { walkElements, valueBounds } from "../../builder/element-renderer.mjs";
import { docScope } from "../../builder/doc-context.mjs";
import { resolveBars, plainKeyOf, cleanBar } from "./bar-model.mjs";

const TAU = Math.PI * 2;
const ANIMATED = new Set();
let tickerOn = false;
/* Effets du palier redessinés à chaque image. */
const LIVE_FX = new Set(["wave", "liquid", "scan", "electric", "embers", "ecg"]);

/* ============================================================ */
/*  Valeurs                                                      */
/* ============================================================ */

function numOf(expr, scope) {
  const s = String(expr ?? "").trim();
  if (s === "") return null;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (/^[a-z][a-z0-9_]*$/.test(s) && s in scope) {
    const n = Number(scope[s]);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(evalExpression(s, scope));
  return Number.isFinite(n) ? n : null;
}

function elementOf(actor, key) {
  if (!key) return null;
  const els = actor?.system?.template?.system?.elements ?? [];
  for (const e of walkElements(els)) if (e?.key === key && ["gauge", "number"].includes(e.kind)) return e;
  return null;
}

/**
 * Valeur, bornes, pourcentage et temporaires d'une barre.
 * @returns {null|{value,min,max,pct,temp,key}}
 */
export function barValues(bar, actor, scope) {
  const key = plainKeyOf(bar);
  const value = numOf(bar.value, scope);
  if (value === null) return null;
  const el = elementOf(actor, key);
  const bounds = el ? valueBounds(el, scope) : { min: -Infinity, max: Infinity };
  let max = numOf(bar.max, scope);
  if (max === null && Number.isFinite(bounds.max)) max = bounds.max;
  if (max === null) return null;
  let min = numOf(bar.min, scope);
  if (min === null) min = Number.isFinite(bounds.min) ? bounds.min : 0;
  const range = max - min;
  if (!(range > 0)) return null;
  const pct = Math.max(0, Math.min(1, (value - min) / range));
  const temp = el?.kind === "gauge" && el.config?.temp?.on && !el.config?.computed
    ? Math.max(0, Number(actor?.system?.values?.[`${key}_temp`]) || 0) : 0;
  return { value, min, max, pct, temp, key: el && !el.config?.computed ? key : "" };
}

/** Le premier palier qui correspond (index), ou -1. */
export function stepIndexOf(bar, vals, scope) {
  for (let i = 0; i < bar.steps.length; i++) {
    const st = bar.steps[i];
    let ok = false;
    if (st.when === "formula") {
      if (st.formula) ok = !!evalExpression(st.formula, { ...scope, value: vals.value, max: vals.max, min: vals.min, pct: vals.pct * 100 });
    } else {
      const a = st.when === "pct" ? vals.pct * 100 : vals.value;
      const b = Number(st.amount);
      ok = st.op === "<=" ? a <= b : st.op === "<" ? a < b : st.op === ">=" ? a >= b : st.op === ">" ? a > b : Math.abs(a - b) < 1e-9;
    }
    if (ok) return i;
  }
  return -1;
}

/* ============================================================ */
/*  Qui regarde                                                  */
/* ============================================================ */

export function viewerOf(token) {
  if (game.user.isGM) return "gm";
  return token?.isOwner ? "owner" : "others";
}

function modeOk(mode, token) {
  const hover = !!(token.hover || token.layer?.highlightObjects);
  const control = !!token.controlled;
  switch (mode) {
    case "always": return true;
    case "hover": return hover;
    case "control": return control;
    case "hoverOrControl": return hover || control;
    default: return false;
  }
}

/** Visibilité des barres SBE d'un jeton (survol, sélection…). */
export function refreshBarsVisibility(token) {
  const box = token?.sbeBars;
  if (!box || box.destroyed) return;
  const secret = !!token.document?.isSecret;
  const viewer = viewerOf(token);
  for (const view of box.children) {
    const v = view.sbe;
    if (!v) continue;
    view.visible = !secret && v.dataVisible && modeOk(v.bar.vis[viewer], token);
  }
  const h = token.sbeHalo;
  if (h && !h.destroyed) {
    const hs = h.sbe;
    let ok = !secret && !!hs?.active;
    if (ok && hs.step?.haloLikeBar) ok = !!box.children.find(c => c.sbeId === hs.barId)?.visible;
    else if (ok) ok = !!hs.step?.haloFor?.[viewer];
    h.visible = ok;
  }
}

/**
 * Ce que les barres posées DEHORS dépassent du jeton (haut, bas), en
 * unités de scène : la barre, son cadre et son texte placé à côté.
 * Les barres masquées par leurs conditions ne comptent pas ; celles qui
 * n'apparaissent qu'au survol comptent (rien ne saute au survol).
 */
export function outsideExtents(token) {
  const out = { top: 0, bottom: 0 };
  for (const view of token?.sbeBars?.children ?? []) {
    const v = view.sbe, g = v?.geo;
    if (!g || !v.dataVisible) continue;
    const b = v.bar;
    const fr = b.frameImage ? b.frameOut * g.s : 0;
    let top = g.y - fr, bottom = g.y + g.h + fr;
    const t = view.sbeParts?.text;
    if (t?.visible && t.text) {
      top = Math.min(top, g.y + t.y - t.anchor.y * t.height);
      bottom = Math.max(bottom, g.y + t.y + (1 - t.anchor.y) * t.height);
    }
    out.top = Math.max(out.top, -top);
    out.bottom = Math.max(out.bottom, bottom - token.h);
  }
  return out;
}

/** Le nom du jeton passe sous les barres posées dehors en bas. */
export function placeNameplate(token) {
  const np = token?.nameplate;
  if (!np || np.destroyed) return;
  const { width, height } = token.document.getSize();
  const offset = CONFIG.Canvas.objectBorderThickness * 0.75 * (canvas.dimensions.uiScale ?? 1);
  np.position.set(width / 2, height + offset + outsideExtents(token).bottom);
}

/* ============================================================ */
/*  Géométrie                                                    */
/* ============================================================ */

const colorNum = (hex) => Number(`0x${String(hex || "#ffffff").slice(1)}`);

/* Longueur et épaisseur de la barre. */
const lenOf = (geo) => (geo.vertical ? geo.h : geo.w);
const thkOf = (geo) => (geo.vertical ? geo.w : geo.h);

/**
 * Point (a le long de la barre, b dans l'épaisseur) → coordonnées locales.
 * Horizontale : de gauche à droite ; verticale : de bas en haut ;
 * `reverse` inverse le sens de remplissage.
 */
function pt(geo, a, b, reverse = false) {
  const L = lenOf(geo);
  const aa = reverse ? L - a : a;
  return geo.vertical ? [b, L - aa] : [aa, b];
}

/** Rectangle [a0, a1] × [b0, b1] (le long × épaisseur) en polygone. */
function bandPoly(geo, a0, a1, b0, b1, reverse) {
  return [...pt(geo, a0, b0, reverse), ...pt(geo, a1, b0, reverse), ...pt(geo, a1, b1, reverse), ...pt(geo, a0, b1, reverse)];
}

/** Contour complet de la forme (polygone), rétréci de `inset`. */
function outlinePoly(bar, geo, inset = 0) {
  const L = lenOf(geo), T = thkOf(geo);
  const i = inset;
  const a0 = i, a1 = L - i, b0 = i, b1 = T - i;
  const t = Math.max(0, b1 - b0);
  let P;
  switch (bar.shape) {
    case "bevel": {
      const c = Math.min(t / 2, (a1 - a0) / 4);
      P = [[a0 + c, b0], [a1 - c, b0], [a1, b0 + c], [a1, b1 - c], [a1 - c, b1], [a0 + c, b1], [a0, b1 - c], [a0, b0 + c]];
      break;
    }
    case "chevron": {
      const c = Math.min(t / 2, (a1 - a0) / 4);
      P = [[a0, b0], [a1 - c, b0], [a1, b0 + t / 2], [a1 - c, b1], [a0, b1], [a0 + c, b0 + t / 2]];
      break;
    }
    case "slant": {
      const c = Math.min(t * 0.7, (a1 - a0) / 4);
      P = [[a0 + c, b0], [a1, b0], [a1 - c, b1], [a0, b1]];
      break;
    }
    default: return null;
  }
  return P.flatMap(([a, b]) => pt(geo, a, b));
}

/** Trace la forme complète (remplie ou contour selon le style en cours). */
function shapePath(g, bar, geo, inset = 0) {
  if (bar.shape === "segments") {
    const n = bar.segments, L = lenOf(geo), T = thkOf(geo);
    const gap = Math.max(1, 0.12 * L / n);
    for (let k = 0; k < n; k++) {
      const a0 = (L / n) * k + (k ? gap / 2 : 0) + inset, a1 = (L / n) * (k + 1) - (k < n - 1 ? gap / 2 : 0) - inset;
      if (a1 <= a0) continue;
      const [x0, y0] = pt(geo, a0, inset), [x1, y1] = pt(geo, a1, T - inset);
      const x = Math.min(x0, x1), y = Math.min(y0, y1), w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
      g.drawRoundedRect(x, y, w, h, Math.min(1.5 * geo.s, w / 2, h / 2));
    }
    return;
  }
  const poly = outlinePoly(bar, geo, inset);
  if (poly) { g.drawPolygon(poly); return; }
  const w = geo.w - 2 * inset, h = geo.h - 2 * inset;
  if (w <= 0 || h <= 0) return;
  const t = Math.min(w, h);
  const r = bar.shape === "square" ? 0 : bar.shape === "pill" ? t / 2 : Math.min(t / 2, 3 * geo.s);
  g.drawRoundedRect(inset, inset, w, h, r);
}

/* ============================================================ */
/*  Dégradés                                                     */
/* ============================================================ */

const GRADIENTS = new Map();
function gradientTexture(from, to) {
  const k = `${from}|${to}`;
  if (GRADIENTS.has(k)) return GRADIENTS.get(k);
  const c = document.createElement("canvas");
  c.width = 256; c.height = 1;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0, from); g.addColorStop(1, to);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 1);
  const tex = PIXI.Texture.from(c);
  GRADIENTS.set(k, tex);
  return tex;
}

/** Matrice qui étire la texture de dégradé le long de la barre. */
function gradientMatrix(geo, reverse) {
  const L = lenOf(geo), T = thkOf(geo);
  const m = new PIXI.Matrix().scale(L / 256, T);
  if (!geo.vertical) {
    if (reverse) m.scale(-1, 1).translate(geo.w, 0);
    return m;
  }
  /* (u, v) → (v·T, L − u·L/256) : vide en bas, plein en haut. */
  if (!reverse) return new PIXI.Matrix(0, -L / 256, T, 0, 0, L);
  return new PIXI.Matrix(0, L / 256, T, 0, 0, 0);
}

/* ============================================================ */
/*  Motifs                                                       */
/* ============================================================ */

function drawPattern(g, kind, color, geo, offset) {
  g.clear();
  if (kind === "none") return;
  const { w, h, s } = geo;
  const c = colorNum(color);
  const p = Math.max(4, 6 * s);
  const o = offset % (p * 2);
  if (kind === "stripes" || kind === "hatch") {
    g.lineStyle(Math.max(1, 1.6 * s), c, 0.45);
    const D = Math.max(w, h);
    for (let x = -D - p * 2 + o; x < w + D; x += p) { g.moveTo(x, h); g.lineTo(x + D, h - D); }
    if (kind === "hatch") for (let x = -D - p * 2 - o; x < w + D; x += p) { g.moveTo(x, 0); g.lineTo(x + D, D); }
    g.lineStyle(0);
  } else if (kind === "dots") {
    g.beginFill(c, 0.45);
    for (let y = p / 2; y < h + p; y += p) for (let x = (o % p) - p; x < w + p; x += p) g.drawCircle(x, y, Math.max(0.8, p * 0.18));
    g.endFill();
  } else if (kind === "checker") {
    g.beginFill(c, 0.3);
    let row = 0;
    for (let y = 0; y < h; y += p / 2, row++) {
      for (let x = (row % 2 ? p / 2 : 0) + (o % p) - p; x < w + p; x += p) g.drawRect(x, y, p / 2, p / 2);
    }
    g.endFill();
  } else if (kind === "segments") {
    g.lineStyle(Math.max(1, s), 0x000000, 0.55);
    const n = 10;
    for (let i = 1; i < n; i++) {
      if (geo.vertical) { const y = (h / n) * i; g.moveTo(0, y); g.lineTo(w, y); }
      else { const x = (w / n) * i; g.moveTo(x, 0); g.lineTo(x, h); }
    }
    g.lineStyle(0);
  }
}

/* ============================================================ */
/*  Disposition                                                  */
/* ============================================================ */

/**
 * Place les barres autour d'un jeton : côté, dedans / dehors, lignes.
 * @param {{w,h,big}} box  taille du jeton ; big = grand jeton (×1.5)
 */
function layout(box, entries, heightMul, s) {
  const { w: W, h: H } = box;
  const big = box.big ? 1.5 : 1;
  const groups = new Map();
  for (const e of entries) {
    const k = `${e.bar.side}|${e.bar.inside ? 1 : 0}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  }
  for (const list of groups.values()) {
    const rows = [...new Set(list.map(e => e.bar.row))].sort((a, b) => a - b);
    let off = 0;
    for (const row of rows) {
      const inRow = list.filter(e => e.bar.row === row);
      const thick = Math.max(...inRow.map(e => e.bar.height * s * big * heightMul));
      inRow.forEach((e, j) => {
        const b = e.bar;
        const vertical = b.side === "left" || b.side === "right";
        const len = vertical ? H : W;
        const slot = len / inRow.length;
        const gap = inRow.length > 1 ? 2 * s : 0;
        const a = slot * j + (b.indentStart / 100) * slot + (j ? gap / 2 : 0);
        const z = slot * (j + 1) - (b.indentEnd / 100) * slot - (j < inRow.length - 1 ? gap / 2 : 0);
        const t = b.height * s * big * heightMul;
        const l = Math.max(2 * s, z - a);
        let x, y;
        if (b.side === "top") { x = a; y = b.inside ? off : -off - t; }
        else if (b.side === "bottom") { x = a; y = b.inside ? H - off - t : H + off; }
        else if (b.side === "left") { y = a; x = b.inside ? off : -off - t; }
        else { y = a; x = b.inside ? W - off - t : W + off; }
        const o = (b.offset ?? 0) * s;
        if (b.side === "top") y -= o; else if (b.side === "bottom") y += o; else if (b.side === "left") x -= o; else x += o;
        e.geo = { x, y, w: vertical ? t : l, h: vertical ? l : t, vertical, s };
      });
      off += thick + Math.max(1, s);
    }
  }
}

/* ============================================================ */
/*  Une vue (une barre)                                          */
/* ============================================================ */

function blur(n) {
  try { return [new PIXI.BlurFilter(n)]; } catch (_e) { return null; }
}

function makeView() {
  const view = new PIXI.Container();
  const P = {};
  P.shadow = view.addChild(new PIXI.Graphics());
  P.shadow.filters = blur(3);
  P.glow = view.addChild(new PIXI.Graphics());
  P.glow.filters = blur(4);
  P.body = view.addChild(new PIXI.Container());
  P.clip = view.addChild(new PIXI.Graphics());
  P.body.mask = P.clip;
  P.bg = P.body.addChild(new PIXI.Graphics());
  P.fill = P.body.addChild(new PIXI.Graphics());
  P.temp = P.body.addChild(new PIXI.Graphics());
  P.pattern = P.body.addChild(new PIXI.Graphics());
  P.patternMask = P.body.addChild(new PIXI.Graphics());
  P.pattern.mask = P.patternMask;
  P.fx = P.body.addChild(new PIXI.Graphics());
  P.relief = P.body.addChild(new PIXI.Graphics());
  P.inner = P.body.addChild(new PIXI.Graphics());
  P.inner.filters = blur(3);
  P.shine = P.body.addChild(new PIXI.Graphics());
  P.flash = P.body.addChild(new PIXI.Graphics());
  P.borderGlow = view.addChild(new PIXI.Graphics());
  P.borderGlow.filters = blur(3);
  P.border = view.addChild(new PIXI.Graphics());
  P.frameSlot = view.addChild(new PIXI.Container());
  P.sparks = view.addChild(new PIXI.Graphics());
  const TextCls = foundry.canvas?.containers?.PreciseText ?? PIXI.Text;
  P.text = view.addChild(new TextCls("", { fontFamily: CONFIG.canvasTextStyle?.fontFamily ?? "Signika, sans-serif", fill: 0xffffff }));
  P.text.anchor.set(0.5);
  view.sbeParts = P;
  return view;
}

async function textureOf(src) {
  if (!src) return null;
  try { return await foundry.canvas.loadTexture(src); } catch (_e) { return null; }
}

/** Images de la barre (fond, remplissage, forme, cadre) : chargées une fois. */
async function syncImages(view) {
  const P = view.sbeParts, b = view.sbe.bar;
  const want = `${b.bgImage}|${b.fgImage}|${b.maskImage}|${b.frameImage}|${b.frameSlice}|${b.frameSliceEnd}|${b.frameSliceV}`;
  if (P.imgKey === want) return;
  P.imgKey = want;
  const [bgT, fgT, mkT, frT] = await Promise.all([textureOf(b.bgImage), textureOf(b.fgImage), textureOf(b.maskImage), textureOf(b.frameImage)]);
  if (view.destroyed || P.imgKey !== want) return;
  for (const k of ["bgSprite", "fgSprite", "maskSprite", "frame"]) { if (P[k]) { P[k].destroy(); P[k] = null; } }
  if (bgT) P.bgSprite = P.body.addChildAt(new PIXI.Sprite(bgT), P.body.getChildIndex(P.bg) + 1);
  if (fgT) { P.fgSprite = P.body.addChildAt(new PIXI.Sprite(fgT), P.body.getChildIndex(P.fill) + 1); P.fgSprite.mask = P.fill; }
  if (mkT) { P.maskSprite = view.addChildAt(new PIXI.Sprite(mkT), view.getChildIndex(P.clip) + 1); P.body.mask = P.maskSprite; P.clip.visible = false; }
  else { P.body.mask = P.clip; P.clip.visible = true; }
  if (frT) {
    const n = b.frameSlice, e = b.frameSliceEnd || n, v = b.frameSliceV || n;
    P.frame = P.frameSlot.addChild(new PIXI.NineSlicePlane(frT, n, v, e, v));
  }
  if (view.sbe) drawStatic(view);
}

/** Libellé visible pour ce spectateur. */
const fmt = (n) => (Math.abs(n - Math.round(n)) < 1e-6 ? String(Math.round(n)) : String(Math.round(n * 10) / 10));

function textOf(bar, vals, step, viewer) {
  const parts = [];
  if (bar.prefix) parts.push(bar.prefix);
  if (bar.numbersFor[viewer] && bar.text !== "none") {
    if (bar.text === "fraction") parts.push(`${fmt(vals.value)} / ${fmt(vals.max)}${vals.temp ? ` (+${fmt(vals.temp)})` : ""}`);
    else if (bar.text === "value") parts.push(fmt(vals.value));
    else if (bar.text === "percent") parts.push(`${Math.round(vals.pct * 100)} %`);
  }
  if (step?.term && bar.termFor[viewer]) parts.push(step.term);
  return parts.join(" · ");
}

/** Ce qui ne bouge qu'au changement de valeur : fond, forme, contour, cadre, texte. */
function drawStatic(view) {
  const v = view.sbe, P = view.sbeParts, b = v.bar, geo = v.geo;
  const s = geo.s;
  view.position.set(geo.x, geo.y);
  view.pivot.set(0, 0);
  P.body.alpha = b.opacity;
  /* Forme (découpe du corps) */
  P.clip.clear(); P.clip.beginFill(0xffffff, 1); shapePath(P.clip, b, geo); P.clip.endFill();
  if (P.maskSprite) { P.maskSprite.width = geo.w; P.maskSprite.height = geo.h; P.maskSprite.position.set(0, 0); }
  /* Ombre portée */
  P.shadow.clear();
  if (b.shadow === "outer") {
    P.shadow.beginFill(colorNum(b.shadowColor), 0.6);
    P.shadow.drawRect(2 * s, 2 * s, geo.w, geo.h);
    P.shadow.endFill();
  }
  /* Fond */
  P.bg.clear();
  if (!b.hideBg) { P.bg.beginFill(colorNum(b.bgColor), b.bgAlpha); P.bg.drawRect(0, 0, geo.w, geo.h); P.bg.endFill(); }
  if (P.bgSprite) { P.bgSprite.width = geo.w; P.bgSprite.height = geo.h; P.bgSprite.visible = !b.hideBg; }
  if (P.fgSprite) { P.fgSprite.width = geo.w; P.fgSprite.height = geo.h; }
  /* Relief */
  drawRelief(P.relief, b, geo);
  /* Ombre intérieure */
  P.inner.clear();
  if (b.shadow === "inner") {
    P.inner.lineStyle(4 * s, colorNum(b.shadowColor), 0.75);
    P.inner.drawRect(0, 0, geo.w, geo.h);
    P.inner.lineStyle(0);
  }
  /* Contour */
  P.border.clear(); P.borderGlow.clear();
  if (b.borderWidth > 0) {
    const bw = b.borderWidth * s, col = colorNum(b.borderColor);
    P.border.lineStyle({ width: bw, color: col, alpha: 1, alignment: 1 });
    shapePath(P.border, b, geo);
    if (b.borderStyle === "double") {
      P.border.lineStyle({ width: Math.max(1, bw * 0.6), color: col, alpha: 0.9, alignment: 0 });
      shapePath(P.border, b, geo, bw * 1.6);
    }
    if (b.borderStyle === "glow") {
      P.borderGlow.lineStyle({ width: bw * 3, color: col, alpha: 0.9, alignment: 0.5 });
      shapePath(P.borderGlow, b, geo);
    }
    P.border.lineStyle(0);
  }
  /* Cadre (image étirée, bords fixes) */
  if (P.frame) {
    /* Barre verticale : le début est en bas. */
    /* Le cadre suit l'échelle de l'interface (bords fixes compris). */
    const o = b.frameOut * s, os = b.frameOutStart * s, oe = b.frameOutEnd * s;
    P.frame.scale.set(s);
    if (!geo.vertical) {
      P.frame.position.set(-o - (b.reverse ? oe : os), -o);
      P.frame.width = (geo.w + 2 * o + os + oe) / s;
      P.frame.height = (geo.h + 2 * o) / s;
    } else {
      P.frame.position.set(-o, -o - (b.reverse ? os : oe));
      P.frame.width = (geo.w + 2 * o) / s;
      P.frame.height = (geo.h + 2 * o + os + oe) / s;
    }
  }
  /* Texte */
  const t = P.text;
  t.text = v.label;
  t.visible = !!v.label;
  if (t.visible) {
    const size = b.textSize ? b.textSize * s : Math.min(16 * s, Math.max(9 * s, thkOf(geo) * 0.95));
    t.style.fontSize = size;
    /* Couleur du palier : sa couleur d'effet (plus vive, lisible sur le
       remplissage), sinon sa couleur. */
    const stepCol = v.step?.glowColor || v.step?.color;
    t.style.fill = colorNum(b.textStepColor && stepCol ? stepCol : b.textColor);
    t.style.stroke = 0x000000;
    t.style.strokeThickness = Math.max(2, size / 5);
    t.style.fontWeight = "600";
    const cx = geo.w / 2, cy = geo.h / 2;
    if (b.textPos === "inside") {
      t.anchor.set(0.5); t.position.set(cx, cy);
      /* Dans la barre : le texte rétrécit pour tenir dans sa longueur. */
      const room = lenOf(geo) * 0.94;
      if (!geo.vertical && t.width > room) {
        const k = room / t.width;
        t.style.fontSize = size * k;
        t.style.strokeThickness = Math.max(2, (size * k) / 5);
      }
    }
    else if (b.side === "top") { t.anchor.set(0.5, 1); t.position.set(cx, -s); }
    else if (b.side === "bottom") { t.anchor.set(0.5, 0); t.position.set(cx, geo.h + s); }
    else if (b.side === "left") { t.anchor.set(1, 0.5); t.position.set(-2 * s, cy); }
    else { t.anchor.set(0, 0.5); t.position.set(geo.w + 2 * s, cy); }
  }
  drawFill(view, performance.now());
}

/** Reflet / relief, sur toute la barre (dans la forme). */
function drawRelief(g, b, geo) {
  g.clear();
  if (b.relief === "none") return;
  const L = lenOf(geo), T = thkOf(geo), s = geo.s;
  /* L'épaisseur « haute » d'une barre verticale est sa gauche. */
  const band = (b0, b1, color, a) => { g.beginFill(color, a); g.drawPolygon(bandPoly(geo, 0, L, b0, b1)); g.endFill(); };
  if (b.relief === "gloss" || b.relief === "glass") {
    band(0, T * 0.45, 0xffffff, 0.22);
    band(0, Math.max(1, s), 0xffffff, 0.45);
  }
  if (b.relief === "glass") {
    band(T * 0.45, T * 0.55, 0xffffff, 0.08);
    band(T - Math.max(1, s), T, 0x000000, 0.35);
  }
  if (b.relief === "bevel") {
    band(0, Math.max(1, 1.2 * s), 0xffffff, 0.4);
    band(T - Math.max(1, 1.2 * s), T, 0x000000, 0.5);
    band(T * 0.5, T, 0x000000, 0.12);
  }
}

/** Couleur du remplissage (palier, unie, selon la valeur), ou null (dégradé). */
function fillColorOf(v) {
  const b = v.bar;
  if (v.step?.color) return v.step.color;
  if (b.colorMode === "solid") return b.colorFull;
  if (b.colorMode === "mix") return foundry.utils.Color.mix(foundry.utils.Color.from(b.colorEmpty), foundry.utils.Color.from(b.colorFull), v.pct).css;
  return null;
}

/** Le remplissage (et ce qui le suit) au pourcentage AFFICHÉ. */
function drawFill(view, now) {
  const v = view.sbe, P = view.sbeParts, b = v.bar, geo = v.geo;
  const step = v.step;
  const L = lenOf(geo), T = thkOf(geo), s = geo.s;
  const shown = Math.max(0, Math.min(1, v.shown));
  const scale = v.tempRatio > 0 ? 1 / (1 + v.tempRatio) : 1;
  const f1 = shown * scale;
  const front = f1 * L;
  const anim = step?.anim ?? "none";
  const t = (now / 1000) * (step?.speed ?? 1);
  const I = step?.intensity ?? 0.7;
  const color = fillColorOf(v);

  /* Front du remplissage : droit, ou en VAGUE (vague, liquide). */
  const wavy = (anim === "wave" || anim === "liquid") && front > 0 && front < L;
  const amp = wavy ? Math.min(T * 0.6, 4 * s) * I : 0;
  const fillPoly = (g) => {
    if (front <= 0) return;
    if (!wavy) { g.drawPolygon(bandPoly(geo, 0, front, 0, T, b.reverse)); return; }
    const pts = [...pt(geo, 0, 0, b.reverse)];
    const n = 10;
    for (let k = 0; k <= n; k++) {
      const bb = (T / n) * k;
      const a = front - amp + amp * Math.sin(bb / T * TAU + t * TAU);
      pts.push(...pt(geo, Math.max(0, a), bb, b.reverse));
    }
    pts.push(...pt(geo, 0, T, b.reverse));
    g.drawPolygon(pts);
  };

  P.fill.clear();
  if (P.fgSprite) P.fill.beginFill(0xffffff, 1);
  else if (color) P.fill.beginFill(colorNum(color), b.fillAlpha);
  else P.fill.beginTextureFill({ texture: gradientTexture(b.colorEmpty, b.colorFull), matrix: gradientMatrix(geo, b.reverse), alpha: b.fillAlpha });
  fillPoly(P.fill);
  P.fill.endFill();

  /* Temporaires */
  P.temp.clear();
  if (v.tempRatio > 0) {
    P.temp.beginFill(0x5aa9e6, 0.95);
    P.temp.drawPolygon(bandPoly(geo, front, Math.min(L, front + v.tempRatio * scale * L), 0, T, b.reverse));
    P.temp.endFill();
  }
  /* Motif : sur le remplissage seulement */
  P.patternMask.clear(); P.patternMask.beginFill(0xffffff, 1); fillPoly(P.patternMask); P.patternMask.endFill();
  drawPattern(P.pattern, step?.pattern ?? "none", step?.patternColor ?? "#ffffff", geo, v.patternOffset ?? 0);

  /* Effets vivants du palier */
  drawFx(view, anim, t, I, front, L, T, color);

  /* Flash de perte / de gain */
  P.flash.clear();
  if (v.flashA > 0.01 && v.flash) {
    const a = Math.min(v.flash.from, v.flash.to) * scale * L, z = Math.max(v.flash.from, v.flash.to) * scale * L;
    P.flash.beginFill(colorNum(v.flash.color), v.flashA);
    if (z - a > 0.5) P.flash.drawPolygon(bandPoly(geo, a, z, 0, T, b.reverse));
    else P.flash.drawRect(0, 0, geo.w, geo.h);
    P.flash.endFill();
  }
}

/* Petites particules pseudo-aléatoires mais stables. */
const rnd = (k) => { const x = Math.sin(k * 12.9898) * 43758.5453; return x - Math.floor(x); };

function drawFx(view, anim, t, I, front, L, T, color) {
  const v = view.sbe, P = view.sbeParts, geo = v.geo, b = v.bar, s = geo.s;
  P.fx.clear();
  P.sparks.clear();
  const glowCol = colorNum(v.step?.glowColor || v.step?.color || b.colorFull);
  if (anim === "liquid" && front > 0) {
    /* Bulles qui montent dans le liquide. */
    P.fx.beginFill(0xffffff, 0.35 * I + 0.1);
    for (let k = 0; k < 7; k++) {
      const a = rnd(k + 1) * front;
      const life = (t * (0.4 + rnd(k + 9) * 0.5) + rnd(k + 3)) % 1;
      const bb = T * (1 - life);
      const [x, y] = pt(geo, a, bb, b.reverse);
      P.fx.drawCircle(x, y, Math.max(0.6, T * 0.12 * (0.5 + rnd(k + 5))));
    }
    P.fx.endFill();
  }
  if (anim === "scan") {
    /* Lignes d'écran fixes + bande lumineuse qui balaie. */
    P.fx.beginFill(0x000000, 0.18);
    for (let bb = 0; bb < T; bb += Math.max(2, 2 * s)) P.fx.drawPolygon(bandPoly(geo, 0, L, bb, bb + Math.max(0.6, 0.6 * s)));
    P.fx.endFill();
    const pos = (t % 1) * (L * 1.3) - L * 0.15;
    P.fx.beginFill(0xffffff, 0.45 * I);
    P.fx.drawPolygon(bandPoly(geo, Math.max(0, pos), Math.min(L, pos + L * 0.08), 0, T));
    P.fx.endFill();
  }
  if (anim === "electric") {
    /* Arcs qui crépitent le long du remplissage (redessinés ~20 fois/s). */
    const tick = Math.floor(t * 20);
    const reach = Math.max(front, L * 0.15);
    for (let arc = 0; arc < 2; arc++) {
      if (rnd(tick * 7 + arc) > 0.85) continue;
      P.fx.lineStyle(Math.max(1, (arc ? 0.8 : 1.4) * s), arc ? 0xffffff : glowCol, 0.6 + 0.4 * I);
      const n = 12;
      for (let k = 0; k <= n; k++) {
        const a = (reach / n) * k;
        const bb = T / 2 + (rnd(tick * 31 + k * 3 + arc) - 0.5) * T * 0.9;
        const [x, y] = pt(geo, a, bb, b.reverse);
        if (k) P.fx.lineTo(x, y); else P.fx.moveTo(x, y);
      }
    }
    P.fx.lineStyle(0);
  }
  if (anim === "embers" && front > 0) {
    /* Braises qui montent de la barre (au-dessus, hors de la forme). */
    const col = colorNum(v.step?.glowColor || "#ff8a30");
    for (let k = 0; k < 14; k++) {
      const life = (t * (0.5 + rnd(k + 2) * 0.6) + rnd(k + 11)) % 1;
      const a = rnd(k + 5) * front;
      const [x0, y0] = pt(geo, a, 0, b.reverse);
      const x = x0 + Math.sin(life * TAU + k) * 2 * s;
      const y = y0 - life * 18 * s * (0.6 + I);
      P.sparks.beginFill(col, (1 - life) * (0.5 + 0.5 * I));
      P.sparks.drawCircle(x, y, Math.max(0.6, (1.6 - life) * s));
      P.sparks.endFill();
    }
  }
  if (anim === "ecg") {
    /* Tracé d'électrocardiogramme qui défile le long de la barre. */
    const beat = (ph) => {
      const g = (c, w) => Math.exp(-((ph - c) ** 2) / w);
      return 0.15 * g(0.1, 0.002) - 0.25 * g(0.175, 0.0002) + 1 * g(0.2, 0.0002) - 0.35 * g(0.225, 0.0002) + 0.25 * g(0.42, 0.004);
    };
    const cycles = Math.max(1, Math.round(L / (40 * s)));
    const col = colorNum(v.step?.glowColor || "#ffffff");
    /* Points posés sur les phases CLÉS de chaque battement (et non à pas
       fixe) : le pic est toujours tracé à sa vraie hauteur, sans scintiller. */
    const KEYS = [0, 0.04, 0.07, 0.1, 0.13, 0.16, 0.175, 0.185, 0.2, 0.215, 0.225, 0.235, 0.25, 0.3, 0.36, 0.42, 0.48, 0.55, 0.7, 0.85];
    const tf = ((t % 1) + 1) % 1;
    const yOf = (ph) => T / 2 - beat(ph) * T * 0.45 * I;
    const pts = [[0, yOf((((0 - t) % 1) + 1) % 1)], [L, yOf((((cycles - t) % 1) + 1) % 1)]];
    for (let c = -1; c <= cycles; c++) {
      for (const ph of KEYS) {
        const a = ((c + ph + tf) / cycles) * L;
        if (a > 0 && a < L) pts.push([a, yOf(ph)]);
      }
    }
    pts.sort((p, q) => p[0] - q[0]);
    /* Trois passes : un liseré sombre (lisible sur tout fond), une lueur
       large, puis le trait — épaisseur selon l'épaisseur de la barre. */
    const lw = Math.max(1.1 * s, T * 0.08);
    for (const [w, c, al] of [[lw + 1.4 * s, 0x000000, 0.45], [lw * 2.4, col, 0.22], [lw, col, 1]]) {
      P.fx.lineStyle({ width: w, color: c, alpha: al, join: PIXI.LINE_JOIN.ROUND, cap: PIXI.LINE_CAP.ROUND });
      pts.forEach(([a, bb], k) => {
        const [x, y] = pt(geo, a, bb);
        if (k) P.fx.lineTo(x, y); else P.fx.moveTo(x, y);
      });
    }
    P.fx.lineStyle(0);
  }
  /* Éclat du front de vague (liquide). */
  if ((anim === "wave" || anim === "liquid") && color && front > 0 && front < L) {
    P.fx.lineStyle(Math.max(1, s), 0xffffff, 0.35);
    const [x0, y0] = pt(geo, front, 0, b.reverse), [x1, y1] = pt(geo, front, T, b.reverse);
    P.fx.moveTo(x0, y0); P.fx.lineTo(x1, y1);
    P.fx.lineStyle(0);
  }
}

/* ============================================================ */
/*  Halo du jeton                                                */
/* ============================================================ */

function drawHaloShape(h, w, hh, round, color, s) {
  h.clear();
  h.lineStyle(7 * s, colorNum(color), 1);
  if (round) h.drawEllipse(w / 2, hh / 2, w / 2 + 2 * s, hh / 2 + 2 * s);
  else h.drawRoundedRect(-2 * s, -2 * s, w + 4 * s, hh + 4 * s, 8 * s);
}

function haloOf(token) {
  let h = token.sbeHalo;
  if (!h || h.destroyed) {
    h = token.sbeHalo = token.addChildAt(new PIXI.Graphics(), 0);
    h.filters = blur(8);
    h.sbe = { active: false };
  }
  return h;
}

/* ============================================================ */
/*  Animation                                                    */
/* ============================================================ */

/* Courbes 0..1 de chaque animation (t en secondes × vitesse). */
function curve(anim, t) {
  const ph = t % 1;
  switch (anim) {
    case "pulse": case "glow": return 0.5 + 0.5 * Math.sin(t * TAU);
    case "blink": return ph < 0.5 ? 1 : 0;
    case "heartbeat": {
      const g = (c) => Math.exp(-((ph - c) ** 2) / 0.0025);
      return Math.min(1, g(0.12) + 0.7 * g(0.32));
    }
    case "shake": return 0.5 + 0.5 * Math.sin(t * TAU * 6);
    case "shine": return ph;
    default: return 0;
  }
}

function needsTick(v) {
  return Math.abs(v.shown - v.target) > 0.001 || v.flashA > 0.01
    || (v.step && (v.step.anim !== "none" || v.step.barGlow !== "none" || (v.step.pattern !== "none" && v.step.patternMove)));
}

/** Une image d'animation d'une vue. Renvoie : faut-il continuer ? */
export function animateView(view, now, dt) {
  const v = view.sbe, P = view.sbeParts;
  if (!v || view.destroyed) return false;
  let dirty = false;
  if (Math.abs(v.shown - v.target) > 0.001) {
    v.shown += (v.target - v.shown) * Math.min(1, dt * 7);
    if (Math.abs(v.shown - v.target) <= 0.001) v.shown = v.target;
    dirty = true;
  }
  if (v.flashA > 0.01) { v.flashA = Math.max(0, v.flashA - dt * 1.6); dirty = true; }
  const st = v.step;
  const t = (now / 1000) * (st?.speed ?? 1);
  if (st?.pattern !== "none" && st?.patternMove) { v.patternOffset = (v.patternOffset ?? 0) + dt * 18 * (st.speed ?? 1) * v.geo.s; dirty = true; }
  const anim = st?.anim ?? "none";
  if (LIVE_FX.has(anim)) dirty = true;
  if (dirty) drawFill(view, now);
  const k = anim !== "none" ? curve(anim, t) : 0;
  const I = st?.intensity ?? 0;
  P.body.alpha = v.bar.opacity * (anim === "pulse" ? 1 - 0.55 * I * k : anim === "blink" ? 1 - I * (1 - k) : 1);
  P.glow.clear();
  if (["glow", "heartbeat", "pulse"].includes(anim)) {
    const c = colorNum(st.glowColor || st.color || v.bar.colorFull);
    P.glow.lineStyle(3 * v.geo.s, c, I * (anim === "pulse" ? 0.5 * k : k));
    shapePath(P.glow, v.bar, v.geo);
  }
  /* Halo de la barre (indépendant de son animation). */
  if (st && st.barGlow !== "none") {
    const kb = st.barGlow === "blink" ? curve("blink", t) : curve(st.barGlow, t);
    const c = colorNum(st.haloColor || st.color || v.bar.colorFull);
    /* Autour du cadre s'il y en a un (sinon caché dessous). */
    const out = (v.bar.frameImage ? v.bar.frameOut * v.geo.s : 0) + 1.5 * v.geo.s;
    P.glow.lineStyle(7 * v.geo.s, c, Math.max(0.3, I || 0.8) * (0.15 + 0.85 * kb));
    P.glow.drawRoundedRect(-out, -out, v.geo.w + 2 * out, v.geo.h + 2 * out, 4 * v.geo.s);
  }
  if (anim === "heartbeat") {
    const sc = 1 + 0.08 * I * k;
    view.pivot.set(v.geo.w / 2, v.geo.h / 2);
    view.position.set(v.geo.x + v.geo.w / 2, v.geo.y + v.geo.h / 2);
    view.scale.set(sc);
  } else {
    view.pivot.set(0, 0);
    view.scale.set(1);
    view.position.set(v.geo.x + (anim === "shake" ? (k - 0.5) * 3 * I * v.geo.s : 0), v.geo.y);
  }
  P.shine.clear();
  if (anim === "shine") {
    const L = lenOf(v.geo), T = thkOf(v.geo);
    const pos = -0.3 * L + k * 1.6 * L;
    P.shine.beginFill(0xffffff, 0.45 * I);
    P.shine.drawPolygon(bandPoly(v.geo, Math.max(0, pos), Math.min(L, pos + 0.15 * L), 0, T));
    P.shine.endFill();
  }
  return needsTick(v);
}

function animateHalo(h, now) {
  if (!h || h.destroyed || !h.sbe?.active) return false;
  const st = h.sbe.step;
  const t = (now / 1000) * (st.speed ?? 1);
  const anim = st.halo;
  h.alpha = (st.intensity ?? 0.7) * (anim === "blink" ? curve("blink", t) : 0.25 + 0.75 * curve(anim, t));
  return true;
}

function tick() {
  const now = performance.now();
  const dt = Math.min(0.1, (canvas?.app?.ticker?.deltaMS ?? 16) / 1000);
  for (const item of [...ANIMATED]) {
    if (item.destroyed || !item.parent) { ANIMATED.delete(item); continue; }
    const keep = item.sbeHalo ? animateHalo(item, now) : animateView(item, now, dt);
    if (!keep) ANIMATED.delete(item);
  }
  if (!ANIMATED.size) stopTicker();
}

function startTicker() {
  if (tickerOn || !canvas?.app?.ticker) return;
  canvas.app.ticker.add(tick);
  tickerOn = true;
}

function stopTicker() {
  if (!tickerOn) return;
  try { canvas.app.ticker.remove(tick); } catch (_e) { /* canevas fermé */ }
  tickerOn = false;
}

function wake(item) {
  ANIMATED.add(item);
  startTicker();
}

export function resetBarsTicker() {
  ANIMATED.clear();
  stopTicker();
}

/* ============================================================ */
/*  État d'une vue (scène et aperçu)                             */
/* ============================================================ */

/**
 * Met à jour l'état d'une vue avec de nouvelles valeurs : glisse, flash,
 * palier, texte. Renvoie le palier s'il vient de changer (pour le son).
 */
function applyState(view, bar, vals, geo, ctx) {
  const prev = view.sbe;
  const first = !prev;
  const stepIdx = stepIndexOf(bar, vals, ctx.scope);
  const step = stepIdx >= 0 ? bar.steps[stepIdx] : null;
  let pct = vals.pct;
  if (bar.approx && !bar.numbersFor[ctx.viewer] && pct > 0 && pct < 1) pct = Math.ceil(pct * bar.approx) / bar.approx;
  const target = bar.invert ? 1 - pct : pct;
  const v = view.sbe = {
    bar, geo, pct: vals.pct, target, step, stepIdx,
    shown: first || !bar.smooth ? target : (prev?.shown ?? target),
    tempRatio: vals.temp > 0 ? vals.temp / (vals.max - vals.min) : 0,
    label: textOf(bar, vals, step, ctx.viewer),
    value: vals.value,
    dataVisible: ctx.dataVisible ?? true,
    flash: prev?.flash ?? null, flashA: prev?.flashA ?? 0,
    patternOffset: prev?.patternOffset ?? 0
  };
  v.delta = !first ? vals.value - prev.value : 0;
  if (!first && bar.flash && Math.abs(prev.value - vals.value) > 1e-9) {
    const lost = vals.value < prev.value;
    const vis = (p) => (bar.invert ? 1 - p : p);
    v.flash = { from: vis(prev.pct), to: vis(vals.pct), color: lost ? bar.flashLoss : bar.flashGain };
    v.flashA = 0.85;
  }
  syncImages(view);
  drawStatic(view);
  return !first && prev.stepIdx !== stepIdx && step ? step : null;
}

const signed = (d) => `${d > 0 ? "+" : "−"}${fmt(Math.abs(d))}`;

function floatText(token, d, bar, s) {
  try {
    canvas.interface.createScrollingText(token.center, signed(d), {
      anchor: CONST.TEXT_ANCHOR_POINTS.TOP,
      direction: CONST.TEXT_ANCHOR_POINTS.TOP,
      fontSize: bar.floatSize * s,
      fill: colorNum(d < 0 ? bar.flashLoss : bar.flashGain),
      stroke: 0x000000,
      strokeThickness: Math.max(3, bar.floatSize * s / 6),
      jitter: 0.25
    });
  } catch (err) { console.warn("SBE | Barres de jetons : valeur volante en échec", err); }
}

/* ============================================================ */
/*  Dessin d'un jeton                                            */
/* ============================================================ */

/**
 * Dessine (ou met à jour) les barres SBE d'un jeton.
 * @param {object} hooks  { onStep(token, bar, step) } — sons des paliers
 * @returns {{keepNative:boolean, count:number}}
 */
export function drawTokenBars(token, hooks = {}) {
  const actor = token.actor;
  let box = token.sbeBars;
  const res = actor ? resolveBars(token.document, actor) : { bars: [], keepNative: true, all: { heightMul: 1, hideHostile: false } };
  if (!res.bars.length) {
    if (box && !box.destroyed) { box.destroy({ children: true }); token.sbeBars = null; }
    if (token.sbeHalo && !token.sbeHalo.destroyed) { token.sbeHalo.destroy(); token.sbeHalo = null; }
    return { keepNative: true, count: 0 };
  }
  if (!box || box.destroyed) box = token.sbeBars = token.addChild(new PIXI.Container());
  box.zIndex = token.bars?.zIndex ?? 0;
  let scope = {};
  try { scope = docScope(actor); } catch (_e) { scope = { ...(actor.system?.values ?? {}) }; }
  const viewer = viewerOf(token);
  const hostile = token.document.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE;
  const inCombat = !!token.inCombat;
  const entries = [];
  for (const { bar } of res.bars) {
    let vals = null;
    try { vals = barValues(bar, actor, scope); } catch (_e) { vals = null; }
    if (vals) entries.push({ bar, vals });
  }
  const s = canvas.dimensions.uiScale ?? 1;
  layout({ w: token.w, h: token.h, big: (token.document.height ?? 1) >= 2 }, entries, res.all.heightMul ?? 1, s);
  const keep = new Set();
  const floated = new Set();
  let haloStep = null, haloBar = null;
  for (const e of entries) {
    const { bar, vals } = e;
    keep.add(bar.id);
    let view = box.children.find(c => c.sbeId === bar.id);
    if (!view) { view = box.addChild(makeView()); view.sbeId = bar.id; }
    let dataVisible = true;
    if (bar.hideIf.full && vals.pct >= 1) dataVisible = false;
    if (bar.hideIf.empty && vals.pct <= 0) dataVisible = false;
    if (bar.hideIf.combat && inCombat) dataVisible = false;
    if (bar.hideIf.noCombat && !inCombat) dataVisible = false;
    if (res.all.hideHostile && hostile && viewer === "others") dataVisible = false;
    if (dataVisible && bar.visibleIf) {
      try { dataVisible = !!evalExpression(bar.visibleIf, { ...scope, value: vals.value, max: vals.max, min: vals.min, pct: vals.pct * 100 }); }
      catch (_e) { dataVisible = true; }
    }
    const changed = applyState(view, bar, vals, e.geo, { scope, viewer, dataVisible });
    if (changed) hooks.onStep?.(token, bar, changed);
    /* Valeur volante : le texte défilant natif de Foundry (une fois par clé). */
    const d = view.sbe.delta;
    const fkey = plainKeyOf(bar) || bar.id;
    if (d && bar.floatOn && bar.floatFor[viewer] && token.visible && !floated.has(fkey)) {
      floated.add(fkey);
      floatText(token, d, bar, s);
    }
    const step = view.sbe.step;
    if (step && step.halo !== "none" && !haloStep) { haloStep = step; haloBar = bar.id; }
    if (needsTick(view.sbe)) wake(view);
    else animateView(view, performance.now(), 0);
  }
  for (const c of [...box.children]) if (!keep.has(c.sbeId)) c.destroy({ children: true });
  /* Halo autour du jeton */
  if (haloStep) {
    const h = haloOf(token);
    const shape = token.document?.shape;
    const round = shape === CONST.TOKEN_SHAPES?.ELLIPSE_1 || shape === CONST.TOKEN_SHAPES?.ELLIPSE_2;
    drawHaloShape(h, token.w, token.h, round, haloStep.haloColor || haloStep.color || haloStep.glowColor || "#ff3030", s);
    h.sbe = { active: true, step: haloStep, barId: haloBar };
    h.sbeHalo = true;
    wake(h);
  } else if (token.sbeHalo && !token.sbeHalo.destroyed) {
    token.sbeHalo.clear();
    token.sbeHalo.sbe = { active: false };
  }
  refreshBarsVisibility(token);
  return { keepNative: res.keepNative, count: entries.length };
}

/* ============================================================ */
/*  Aperçu de l'éditeur                                          */
/* ============================================================ */

const PREVIEWS = new Set();

/** Ferme les aperçus dont la fenêtre a disparu (contextes WebGL). */
export function sweepBarPreviews() {
  for (const p of [...PREVIEWS]) if (!p.host.isConnected) p.destroy();
}

/**
 * Aperçu vivant d'une barre sur un faux jeton : même dessin, mêmes
 * animations que sur la scène. Le curseur simule la valeur.
 * @returns {{update(bar), setPct(p), setViewer(v), destroy()}}
 */
export function createBarPreview(host, bar, { pct = 0.6, viewer = "gm", img = "" } = {}) {
  sweepBarPreviews();
  const W = Math.max(220, host.clientWidth || 260), H = 190;
  let app;
  try {
    app = new PIXI.Application({ width: W, height: H, backgroundAlpha: 0, antialias: true, resolution: window.devicePixelRatio || 1, autoDensity: true });
  } catch (err) {
    console.warn("SBE | Barres de jetons : aperçu indisponible", err);
    return null;
  }
  host.replaceChildren(app.view);
  const T = 110, s = 1.4;
  const stage = new PIXI.Container();
  stage.position.set((W - T) / 2, (H - T) / 2);
  app.stage.addChild(stage);
  const tok = stage.addChild(new PIXI.Graphics());
  tok.beginFill(0x55595f, 1).lineStyle(2, 0x2a2c30, 1).drawRoundedRect(0, 0, T, T, 6).endFill();
  if (img) {
    textureOf(img).then(tex => {
      if (!tex || stage.destroyed) return;
      const sp = stage.addChildAt(new PIXI.Sprite(tex), 1);
      const k = Math.min(T / tex.width, T / tex.height);
      sp.scale.set(k); sp.position.set((T - tex.width * k) / 2, (T - tex.height * k) / 2);
    });
  }
  const halo = stage.addChildAt(new PIXI.Graphics(), 0);
  halo.filters = blur(8);
  halo.sbe = { active: false };
  const view = stage.addChild(makeView());
  const state = { bar: cleanBar(bar), pct, viewer };

  const redraw = () => {
    const b = state.bar;
    const vals = { value: Math.round(state.pct * 100), min: 0, max: 100, pct: state.pct, temp: 0 };
    const e = { bar: b, vals };
    layout({ w: T, h: T, big: false }, [e], 1, s);
    applyState(view, b, vals, e.geo, { scope: {}, viewer: state.viewer, dataVisible: true });
    view.visible = b.vis[state.viewer] !== "none";
    const d = view.sbe.delta;
    if (d && b.floatOn && b.floatFor[state.viewer]) {
      const TextCls = foundry.canvas?.containers?.PreciseText ?? PIXI.Text;
      const tx = stage.addChild(new TextCls(signed(d), { fontFamily: CONFIG.canvasTextStyle?.fontFamily ?? "sans-serif", fontSize: b.floatSize * 0.9, fontWeight: "700",
        fill: colorNum(d < 0 ? b.flashLoss : b.flashGain), stroke: 0x000000, strokeThickness: 4 }));
      tx.anchor.set(0.5); tx.position.set(T / 2 + (Math.random() - 0.5) * 20, T * 0.35);
      floats.push({ tx, life: 0 });
    }
    const st = view.sbe.step;
    if (st && st.halo !== "none") {
      drawHaloShape(halo, T, T, false, st.haloColor || st.color || st.glowColor || "#ff3030", s);
      halo.sbe = { active: true, step: st };
      halo.visible = true;
    } else { halo.clear(); halo.sbe = { active: false }; halo.visible = false; }
  };
  const floats = [];
  const loop = () => {
    const now = performance.now();
    const dt = Math.min(0.1, app.ticker.deltaMS / 1000);
    animateView(view, now, dt);
    animateHalo(halo, now);
    for (const f of [...floats]) {
      f.life += dt / 1.4;
      f.tx.y -= dt * 40;
      f.tx.alpha = Math.max(0, 1 - f.life);
      if (f.life >= 1) { f.tx.destroy(); floats.splice(floats.indexOf(f), 1); }
    }
  };
  app.ticker.add(loop);
  redraw();
  const ctl = {
    host,
    update(b) { state.bar = cleanBar(b); redraw(); },
    setPct(p) { state.pct = Math.max(0, Math.min(1, p)); redraw(); },
    setViewer(v) { state.viewer = v; redraw(); },
    destroy() {
      PREVIEWS.delete(ctl);
      try { app.ticker.remove(loop); app.destroy(true, { children: true, texture: false, baseTexture: false }); } catch (_e) { /* déjà fermé */ }
    }
  };
  PREVIEWS.add(ctl);
  return ctl;
}
