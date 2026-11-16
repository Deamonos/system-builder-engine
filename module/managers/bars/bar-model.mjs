/**
 * SBE — BARRES DE JETONS : les données
 *
 * Trois niveaux, du plus large au plus précis (le plus précis gagne) :
 *   1. « Tous les personnages » : réglage du monde `tokenBars` ;
 *   2. le MODÈLE de personnage : `system.tokenBars` (voyage avec
 *      l'export du modèle) — mode « all » (suit Tous), « own » (ses
 *      barres seulement), « both » (Tous + les siennes) ;
 *   3. le JETON (ou le prototype de l'acteur) : `flags.<sbe>.bars` —
 *      seulement les DIFFÉRENCES : { patch: {idBarre: champs changés},
 *      off: [idBarre masquées], extra: [barres propres au jeton] }.
 *
 * Rien n'est recopié : le dessin lit ces réglages en direct.
 *
 *   barre = { id, label, value, max, min,          valeur (clé ou formule)
 *             side, inside, row, indentStart, indentEnd, height,
 *             shape, segments, invert, reverse,
 *             colorMode, colorFull, colorEmpty, bgColor, bgAlpha,
 *             borderColor, borderWidth, borderStyle, shadow, shadowColor,
 *             relief, frameImage, frameSlice, frameOut, maskImage,
 *             opacity, fgImage, bgImage, hideBg,
 *             text, prefix, textPos, textSize, textColor,
 *             numbersFor{gm,owner,others}, termFor{…}, approx,
 *             vis{gm,owner,others}, hideIf{full,empty,combat,noCombat},
 *             visibleIf, hudEdit, hudPos, hudGap, smooth, flash, flashLoss, flashGain,
 *             floatOn, floatFor, floatSize,
 *             steps: [palier] }
 *   palier = { when (pct|value|formula), op, amount, formula,
 *              color, pattern, patternMove, patternColor,
 *              anim (barre), halo (jeton), barGlow (halo de la barre), haloColor,
 *              speed, intensity, glowColor,
 *              term, sound, soundWho, volume }
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";

export const SIDES = ["top", "bottom", "left", "right"];
export const SHAPES = ["rounded", "square", "pill", "bevel", "chevron", "slant", "segments"];
export const BORDER_STYLES = ["solid", "double", "glow"];
export const SHADOWS = ["none", "outer", "inner"];
export const RELIEFS = ["none", "gloss", "bevel", "glass"];
export const HUD_POS = ["below", "above"];
export const COLOR_MODES = ["mix", "gradient", "solid"];
export const TEXT_MODES = ["none", "fraction", "value", "percent"];
export const TEXT_POS = ["inside", "outside"];
export const VIS_MODES = ["always", "hover", "control", "hoverOrControl", "none"];
export const VIEWERS = ["gm", "owner", "others"];
export const STEP_WHEN = ["pct", "value", "formula"];
export const STEP_OPS = ["<=", "<", ">=", ">", "=="];
export const PATTERNS = ["none", "stripes", "hatch", "dots", "checker", "segments"];
export const ANIMS = ["none", "pulse", "glow", "blink", "heartbeat", "shake", "shine", "wave", "liquid", "scan", "electric", "embers", "ecg"];
export const HALOS = ["none", "pulse", "glow", "blink", "heartbeat"];
export const SET_MODES = ["all", "own", "both"];
export const SOUND_WHO = ["owner", "all"];
export const HUD_EDIT = ["none", "gm", "owner"];

const HEX = /^#[0-9a-f]{6}$/i;
const str = (v) => String(v ?? "").trim();
const hex = (v, d) => (HEX.test(str(v)) ? str(v).toLowerCase() : d);
const pick = (v, list, d) => (list.includes(v) ? v : d);
const num = (v, d, lo = -Infinity, hi = Infinity) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
const bool = (v, d = false) => (v === undefined ? d : !!v);

/** Un identifiant court et stable. */
export function newBarId() {
  return foundry.utils.randomID(8);
}

export function cleanStep(s) {
  const x = s && typeof s === "object" ? s : {};
  return {
    when: pick(x.when, STEP_WHEN, "pct"),
    op: pick(x.op, STEP_OPS, "<="),
    amount: num(x.amount, 25),
    formula: str(x.formula),
    color: hex(x.color, ""),
    pattern: pick(x.pattern, PATTERNS, "none"),
    patternMove: bool(x.patternMove),
    patternColor: hex(x.patternColor, "#ffffff"),
    anim: pick(x.anim, ANIMS, "none"),
    halo: pick(x.halo, HALOS, "none"),
    /* Halo autour de la BARRE (en plus de son animation), et couleur des
       deux halos ("" = couleur du palier). */
    barGlow: pick(x.barGlow, HALOS, "none"),
    haloColor: hex(x.haloColor, ""),
    /* Qui voit le halo du jeton : comme la barre (défaut), ou au choix. */
    haloLikeBar: bool(x.haloLikeBar, true),
    haloFor: Object.fromEntries(VIEWERS.map(k => [k, bool(x.haloFor?.[k], true)])),
    speed: num(x.speed, 1, 0.1, 5),
    intensity: num(x.intensity, 0.7, 0, 1),
    glowColor: hex(x.glowColor, ""),
    term: str(x.term),
    sound: str(x.sound),
    soundWho: pick(x.soundWho, SOUND_WHO, "owner"),
    volume: num(x.volume, 0.8, 0, 1)
  };
}

const viewers = (v, d) => Object.fromEntries(VIEWERS.map(k => [k, bool(v?.[k], d[k])]));

export function cleanBar(b) {
  const x = b && typeof b === "object" ? b : {};
  const vis = x.vis ?? {};
  return {
    id: str(x.id) || newBarId(),
    label: str(x.label),
    value: str(x.value),
    max: str(x.max),
    min: str(x.min),
    side: pick(x.side, SIDES, "bottom"),
    inside: bool(x.inside, true),
    row: Math.round(num(x.row, 0, 0, 9)),
    /* Décalage par rapport au jeton (px) : positif = vers l'extérieur. */
    offset: num(x.offset, 0, -200, 200),
    indentStart: num(x.indentStart, 0, 0, 45),
    indentEnd: num(x.indentEnd, 0, 0, 45),
    height: num(x.height, 8, 2, 40),
    shape: pick(x.shape, SHAPES, "rounded"),
    segments: Math.round(num(x.segments, 5, 2, 30)),
    invert: bool(x.invert),
    reverse: bool(x.reverse),
    colorMode: pick(x.colorMode, COLOR_MODES, "mix"),
    colorFull: hex(x.colorFull, "#3cb44b"),
    colorEmpty: hex(x.colorEmpty, "#d23c3c"),
    bgColor: hex(x.bgColor, "#000000"),
    bgAlpha: num(x.bgAlpha, 0.5, 0, 1),
    borderColor: hex(x.borderColor, "#000000"),
    borderWidth: num(x.borderWidth, 1, 0, 6),
    borderStyle: pick(x.borderStyle, BORDER_STYLES, "solid"),
    shadow: pick(x.shadow, SHADOWS, "none"),
    shadowColor: hex(x.shadowColor, "#000000"),
    relief: pick(x.relief, RELIEFS, "none"),
    frameImage: str(x.frameImage),
    frameSlice: Math.round(num(x.frameSlice, 8, 0, 200)),
    frameOut: num(x.frameOut, 2, 0, 40),
    /* Bords fixes du bout et du haut/bas (0 = comme le début), débords
       en plus aux deux bouts (embouts du cadre : icône, capuchon…). */
    frameSliceEnd: Math.round(num(x.frameSliceEnd, 0, 0, 200)),
    frameSliceV: Math.round(num(x.frameSliceV, 0, 0, 200)),
    frameOutStart: num(x.frameOutStart, 0, -200, 200),
    frameOutEnd: num(x.frameOutEnd, 0, -200, 200),
    maskImage: str(x.maskImage),
    opacity: num(x.opacity, 1, 0.05, 1),
    fillAlpha: num(x.fillAlpha, 1, 0.05, 1),
    fgImage: str(x.fgImage),
    bgImage: str(x.bgImage),
    hideBg: bool(x.hideBg),
    text: pick(x.text, TEXT_MODES, "none"),
    prefix: str(x.prefix),
    textPos: pick(x.textPos, TEXT_POS, "inside"),
    textSize: num(x.textSize, 0, 0, 48),
    textColor: hex(x.textColor, "#ffffff"),
    textStepColor: bool(x.textStepColor),
    numbersFor: viewers(x.numbersFor, { gm: true, owner: true, others: true }),
    termFor: viewers(x.termFor, { gm: true, owner: true, others: true }),
    approx: Math.round(num(x.approx, 0, 0, 20)),
    vis: Object.fromEntries(VIEWERS.map(k => [k, pick(vis[k], VIS_MODES, k === "others" ? "hover" : "always")])),
    hideIf: {
      full: bool(x.hideIf?.full), empty: bool(x.hideIf?.empty),
      combat: bool(x.hideIf?.combat), noCombat: bool(x.hideIf?.noCombat)
    },
    visibleIf: str(x.visibleIf),
    hudEdit: pick(x.hudEdit, HUD_EDIT, "none"),
    hudPos: pick(x.hudPos, HUD_POS, "below"),
    hudGap: num(x.hudGap, 4, -40, 200),
    smooth: bool(x.smooth, true),
    flash: bool(x.flash, true),
    flashLoss: hex(x.flashLoss, "#ff3b3b"),
    flashGain: hex(x.flashGain, "#4cff7a"),
    /* Valeurs volantes (-12 / +5) au-dessus du jeton quand la valeur change. */
    floatOn: bool(x.floatOn, true),
    floatFor: viewers(x.floatFor, { gm: true, owner: true, others: true }),
    floatSize: num(x.floatSize, 24, 10, 72),
    steps: (Array.isArray(x.steps) ? x.steps : []).map(cleanStep)
  };
}

function cleanBars(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : []).map(cleanBar).filter(b => {
    if (seen.has(b.id)) b.id = newBarId();
    seen.add(b.id);
    return true;
  });
}

/** Réglage « Tous les personnages » (+ options générales). */
export function cleanAllSet(s) {
  const x = s && typeof s === "object" ? s : {};
  return {
    bars: cleanBars(x.bars),
    keepNative: bool(x.keepNative),
    hideHostile: bool(x.hideHostile),
    heightMul: num(x.heightMul, 1, 0.5, 4),
    brawlIgnore: bool(x.brawlIgnore)
  };
}

/** Réglage d'un modèle de personnage. */
export function cleanTplSet(s) {
  const x = s && typeof s === "object" ? s : {};
  return {
    mode: pick(x.mode, SET_MODES, "all"),
    bars: cleanBars(x.bars),
    keepNative: x.keepNative === undefined || x.keepNative === null ? null : !!x.keepNative
  };
}

/** Différences propres à un jeton (ou au prototype d'un acteur). */
export function cleanTokenSet(s) {
  const x = s && typeof s === "object" ? s : {};
  const patch = {};
  for (const [id, p] of Object.entries(x.patch ?? {})) {
    if (p && typeof p === "object" && Object.keys(p).length) patch[id] = foundry.utils.deepClone(p);
  }
  return {
    patch,
    off: (Array.isArray(x.off) ? x.off : []).map(str).filter(Boolean),
    extra: cleanBars(x.extra)
  };
}

export function isEmptyTokenSet(t) {
  return !Object.keys(t.patch).length && !t.off.length && !t.extra.length;
}

/* ============================================================ */
/*  Lecture                                                      */
/* ============================================================ */

export function allSet() {
  try { return cleanAllSet(game.settings.get(SYSTEM_ID, "tokenBars")); }
  catch (_e) { return cleanAllSet({}); }
}

export function tplSet(tpl) {
  return cleanTplSet(tpl?.system?.tokenBars);
}

/** Le réglage de jeton d'un document (jeton placé ou prototype). */
export function tokenSetOf(doc) {
  const raw = doc?.flags?.[SYSTEM_ID]?.bars ?? (typeof doc?.getFlag === "function" ? doc.getFlag(SYSTEM_ID, "bars") : null);
  return cleanTokenSet(raw);
}

/** Les barres héritées (sans le niveau jeton), avec leur origine. */
export function baseBarsFor(actor) {
  const all = allSet();
  /* Seuls les personnages ont des barres SBE (pas les objets de scène, ni les groupes). */
  if (actor?.type !== "personnage") return { bars: [], keepNative: true, all };
  const tpl = actor.system?.template ?? null;
  const t = tpl ? tplSet(tpl) : null;
  const from = (list, origin) => list.map(b => ({ bar: b, origin }));
  let bars;
  if (!t || t.mode === "all") bars = from(all.bars, "all");
  else if (t.mode === "own") bars = from(t.bars, "tpl");
  else bars = [...from(all.bars, "all"), ...from(t.bars, "tpl")];
  const keepNative = t && t.mode !== "all" && t.keepNative !== null ? t.keepNative : all.keepNative;
  return { bars, keepNative, all };
}

/**
 * Les barres d'un jeton, résolues : jeton > modèle > tous.
 * @returns {{bars: Array<{bar, origin, patched}>, keepNative, all}}
 */
/* APERÇU (visites guidées) : des barres d'exemple sur UN jeton, tenues en
   mémoire et jamais enregistrées. { tokenId, bars } ou null. */
let PREVIEW = null;
export function setBarsPreview(p) { PREVIEW = p?.tokenId ? { tokenId: p.tokenId, bars: (p.bars ?? []).map(cleanBar) } : null; }

export function resolveBars(tokenDoc, actor = tokenDoc?.actor) {
  const base = baseBarsFor(actor);
  if (PREVIEW && tokenDoc?.id === PREVIEW.tokenId) {
    return { bars: PREVIEW.bars.map(bar => ({ bar, origin: "all", patched: false })), keepNative: false, all: base.all };
  }
  const ts = tokenSetOf(tokenDoc);
  const out = [];
  for (const { bar, origin } of base.bars) {
    if (ts.off.includes(bar.id)) continue;
    const p = ts.patch[bar.id];
    out.push(p ? { bar: cleanBar({ ...foundry.utils.mergeObject(foundry.utils.deepClone(bar), p, { inplace: false }), id: bar.id }), origin, patched: true }
      : { bar, origin, patched: false });
  }
  for (const bar of ts.extra) out.push({ bar, origin: "token", patched: false });
  return { bars: out, keepNative: base.keepNative, all: base.all };
}

/** Champs d'une barre qui diffèrent de sa base (pour le jeton). */
export function diffBar(base, edited) {
  const a = cleanBar(base), b = cleanBar({ ...edited, id: a.id });
  const out = {};
  for (const k of Object.keys(b)) {
    if (k === "id") continue;
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out[k] = foundry.utils.deepClone(b[k]);
  }
  return out;
}

/** Y a-t-il des barres SBE définies quelque part dans le monde ? */
export function anyBarsDefined() {
  if (allSet().bars.length) return true;
  return (game.actors ?? []).some(a => a.type === "template" && tplSet(a).mode !== "all" && tplSet(a).bars.length);
}

/** Clé simple derrière la valeur d'une barre (« pv »), ou "". */
export function plainKeyOf(bar) {
  const v = str(bar?.value);
  return /^[a-z][a-z0-9_]*$/.test(v) ? v : "";
}
