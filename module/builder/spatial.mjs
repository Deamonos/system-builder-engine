/**
 * SBE — GRILLE SPATIALE (moteur : aucun DOM)
 *
 * Un contenant en grille spatiale a un nombre FIXE de colonnes et de
 * lignes. Chaque objet y occupe un rectangle de L × H cases (1 × 1 par
 * défaut), réglé sur l'OBJET DU MONDE avec son image : tous ses
 * exemplaires suivent leur modèle. Le joueur pivote un objet d'un quart
 * de tour (sens horaire ou anti-horaire) : le rectangle passe de L × H
 * à H × L.
 *
 * Position d'un objet porté (system.carry) :
 *   x / y = case en haut à gauche, rot = 0 / 90 / 180 / 270,
 *   cell >= 0 = objet PLACÉ (cell = y × colonnes + x, gardé pour
 *   relire les anciennes données), cell = -1 = pas encore placé.
 * Une ligne de coffre porte les mêmes x / y / rot et `placed`.
 *
 * Mise en place (une seule règle, partout) : les objets placés
 * reprennent leur rectangle ; ceux qui n'ont pas de place enregistrée
 * (ou dont le rectangle chevauche ou dépasse) vont dans le premier
 * emplacement libre en partant d'en haut à gauche ; ce qui ne rentre
 * pas reste « hors de la grille », à replacer à la main. Rien n'est
 * jamais escamoté.
 *
 * Ce module ne dépend que des constantes : le rendu et l'inventaire
 * l'importent, jamais l'inverse.
 */

import { SYSTEM_ID } from "../helpers/constants.mjs";

/** Côté maximal d'un objet, en cases. */
export const SPATIAL_MAX_SIDE = 20;
/** Grille proposée tant que le créateur n'a rien saisi. */
export const SPATIAL_DEFAULT_COLS = 10;
export const SPATIAL_DEFAULT_ROWS = 6;
/** Taille des cases par défaut (la même que la grille simple). */
export const SPATIAL_CELL_DEFAULT = 56;

const intIn = (v, lo, hi, dflt) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= lo ? Math.min(hi, n) : dflt;
};

/** Le contenant est-il une grille spatiale ? (conteneur de fiche) */
export function isSpatialEl(el) {
  return el?.kind === "container" && el?.config?.display === "spatial";
}

/** Colonnes, lignes (obligatoires) et taille des cases. */
export function spatialDims(config = {}) {
  return {
    cols: intIn(config.gridCols, 1, 50, SPATIAL_DEFAULT_COLS),
    rows: intIn(config.gridRows, 1, 100, SPATIAL_DEFAULT_ROWS),
    size: intIn(config.cellSize, 24, 256, SPATIAL_CELL_DEFAULT)
  };
}

/** L'objet du monde qui porte le réglage (un exemplaire suit son modèle). */
export function spatialHolder(item) {
  if (!item) return null;
  const mid = String(item.system?.modelId ?? "");
  return (mid && game.items?.get(mid)) || item;
}

/** Réglage nettoyé (valeurs par défaut comprises). */
export function cleanSpatial(raw = {}) {
  return {
    w: intIn(raw?.w, 1, SPATIAL_MAX_SIDE, 1),
    h: intIn(raw?.h, 1, SPATIAL_MAX_SIDE, 1),
    img: String(raw?.img ?? "").trim(),
    fit: raw?.fit === "fill" ? "fill" : "contain"
  };
}

/**
 * Taille, image et affichage d'un objet dans la grille spatiale.
 * Sans réglage : 1 × 1, l'icône de l'objet, image entière.
 */
export function spatialOf(item) {
  return cleanSpatial(spatialHolder(item)?.flags?.[SYSTEM_ID]?.spatial);
}

/** Quart de tour ramené à 0 / 90 / 180 / 270. */
export function normRot(r) {
  const q = Math.round((Number(r) || 0) / 90);
  return (((q % 4) + 4) % 4) * 90;
}

/** Rectangle occupé une fois pivoté. */
export function footprint(w, h, rot) {
  return normRot(rot) % 180 ? { fw: h, fh: w } : { fw: w, fh: h };
}

/** Index de case enregistré pour un objet placé. */
export function cellIndex(x, y, cols) {
  return y * cols + x;
}

/* ------------------------------------------------------------ */
/*  Occupation                                                   */
/* ------------------------------------------------------------ */

export function makeBoard(d) {
  return { d, occ: new Array(d.cols * d.rows).fill(null) };
}

/** Le rectangle tient-il ici ? (dans la grille, sans chevauchement) */
export function fits(board, x, y, fw, fh, ignore = null) {
  const { cols, rows } = board.d;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  if (x < 0 || y < 0 || x + fw > cols || y + fh > rows) return false;
  for (let j = y; j < y + fh; j++) {
    for (let i = x; i < x + fw; i++) {
      const o = board.occ[j * cols + i];
      if (o !== null && o !== ignore) return false;
    }
  }
  return true;
}

export function mark(board, x, y, fw, fh, id) {
  const { cols } = board.d;
  for (let j = y; j < y + fh; j++) for (let i = x; i < x + fw; i++) board.occ[j * cols + i] = id;
}

/** Premier emplacement libre, rangée par rangée depuis le coin haut gauche. */
export function findSpot(board, fw, fh) {
  const { cols, rows } = board.d;
  for (let y = 0; y + fh <= rows; y++) {
    for (let x = 0; x + fw <= cols; x++) {
      if (fits(board, x, y, fw, fh)) return { x, y };
    }
  }
  return null;
}

/**
 * Met en place une liste de pièces.
 * @param {Array<{id, name, w, h, rot, x, y, placed}>} pieces
 * @returns {{placed: Array, out: Array, board: Object}}
 *   placed : pièces dans la grille (+ x, y, fw, fh, auto = placée ici
 *            faute de place enregistrée valable) ;
 *   out    : pièces hors de la grille (pas assez de place).
 */
export function spatialLayout(pieces, d) {
  const board = makeBoard(d);
  const placed = [];
  const out = [];
  const byId = (a, b) => String(a.id).localeCompare(String(b.id));
  const byName = (a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), game.i18n?.lang) || byId(a, b);
  const stored = pieces.filter(p => p.placed)
    .sort((a, b) => (a.y - b.y) || (a.x - b.x) || byId(a, b));
  const later = [];
  for (const p of stored) {
    const { fw, fh } = footprint(p.w, p.h, p.rot);
    if (fits(board, p.x, p.y, fw, fh)) {
      mark(board, p.x, p.y, fw, fh, p.id);
      placed.push({ ...p, fw, fh, auto: false });
    } else later.push(p);
  }
  for (const p of [...later, ...pieces.filter(q => !q.placed).sort(byName)]) {
    const { fw, fh } = footprint(p.w, p.h, p.rot);
    const s = findSpot(board, fw, fh);
    if (s) {
      mark(board, s.x, s.y, fw, fh, p.id);
      placed.push({ ...p, x: s.x, y: s.y, fw, fh, auto: true });
    } else out.push({ ...p, fw, fh });
  }
  return { placed, out, board };
}

/** Grille occupée par les pièces placées, sauf certaines (celle qu'on déplace). */
export function boardWithout(layout, d, skipIds = []) {
  const skip = new Set(skipIds);
  const board = makeBoard(d);
  for (const p of layout.placed) if (!skip.has(p.id)) mark(board, p.x, p.y, p.fw, p.fh, p.id);
  return board;
}

/**
 * Plateau HTML (cases de fond + pièces). Le contenu d'une pièce est
 * fourni par l'appelant : la fiche et le coffre n'affichent pas tout à
 * fait la même chose, mais la grille est la même.
 * @param {Object} p
 * @param {Object} p.d        dimensions
 * @param {Array}  p.placed   pièces placées (spatialLayout)
 * @param {Function} p.piece  (pièce) => { attrs, inner, cls }
 * @param {boolean} p.live    fiche (vrai) ou aperçu de l'atelier
 */
export function spatialBoardHTML({ d, placed, piece, live = true, extraCls = "" }) {
  let bg = "";
  for (let y = 0; y < d.rows; y++) {
    for (let x = 0; x < d.cols; x++) {
      bg += `<div class="sbe-sp-cell" style="grid-column:${x + 1};grid-row:${y + 1}"></div>`;
    }
  }
  const items = placed.map(p => {
    const v = piece(p);
    return `<div class="sbe-sp-item ${v.cls ?? ""}" data-piece-id="${p.id}" data-sx="${p.x}" data-sy="${p.y}" data-fw="${p.fw}" data-fh="${p.fh}" style="grid-column:${p.x + 1} / span ${p.fw};grid-row:${p.y + 1} / span ${p.fh}" ${v.attrs ?? ""}>${v.inner ?? ""}</div>`;
  }).join("");
  return `<div class="sbe-sp-wrap"><div class="sbe-sp${live ? "" : " is-preview"} ${extraCls}" data-cols="${d.cols}" data-rows="${d.rows}" style="--sbe-sp-cols:${d.cols};--sbe-sp-rows:${d.rows};--sbe-sp-cell:${d.size}px">${bg}${items}</div></div>`;
}

/** Image d'une pièce, à sa taille d'origine, tournée dans son rectangle. */
export function spatialArtHTML({ img, w, h, rot, fit }) {
  const src = String(img || "icons/svg/item-bag.svg").replace(/"/g, "&quot;");
  return `<div class="sbe-sp-art" style="--sp-w:${w};--sp-h:${h};--sp-rot:${normRot(rot)}deg"><img src="${src}" alt="" style="object-fit:${fit === "fill" ? "fill" : "contain"}"></div>`;
}
