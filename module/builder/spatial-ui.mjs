/**
 * SBE — GRILLE SPATIALE : glisser-déposer (DOM)
 *
 * Partagé par les fiches et les coffres :
 * - ce qu'on glisse (taille, prise) est retenu au départ du geste —
 *   pendant le survol, le navigateur ne laisse pas lire les données ;
 * - au survol d'une grille, un rectangle vert (ça tient) ou rouge (ça
 *   ne tient pas) montre où l'objet tombera ;
 * - au lâcher, la case visée = la case sous le pointeur, moins
 *   l'endroit où l'objet a été saisi (on le pose comme on le tient).
 *
 * Rien n'est écrit ici : la décision finale revient toujours au moteur
 * (inventaire ou coffre), qui revérifie sur les données réelles.
 */

import { spatialOf, footprint, normRot } from "./spatial.mjs";

/** Ce qui est en train d'être glissé : { id, fw, fh, offX, offY } ou null. */
let current = null;
let watching = false;

export function spatialDragState() { return current; }

/** Note ce qui part (appelé par les éléments qui coupent la propagation). */
export function beginSpatialDrag(info) { current = info ?? null; }

/** Départ d'un objet hors d'une grille (ligne de liste, case, slot). */
export function beginDragFromUuid(uuid) { current = infoFromData({ type: "Item", uuid }); }

/**
 * Objet glissé depuis n'importe où (barre latérale, autre fiche…) :
 * sa taille est lue sur le modèle, et on le tient par son milieu.
 */
function infoFromData(data) {
  if (data?.type !== "Item" || !data.uuid) return null;
  let item = null;
  /* Objet d'un pion posé (sol, coffre) : le pion, puis l'objet. */
  try { item = data.sbeToken ? fromUuidSync(data.sbeToken)?.actor?.items?.get(data.sbeItem) ?? null : null; } catch (_e) { item = null; }
  if (!item) { try { item = fromUuidSync(data.uuid); } catch (_e) { item = null; } }
  if (!item || item.type !== "objet") return null;
  const sp = spatialOf(item);
  const { fw, fh } = footprint(sp.w, sp.h, normRot(item.system?.carry?.rot));
  return { id: item.id, fw, fh, offX: Math.floor((fw - 1) / 2), offY: Math.floor((fh - 1) / 2) };
}

/** Écoute globale, posée une fois : départ et fin de tout glisser. */
export function installSpatialDragWatch() {
  if (watching) return;
  watching = true;
  document.addEventListener("dragstart", (ev) => {
    if (ev.defaultPrevented) return;
    let data = null;
    try { data = JSON.parse(ev.dataTransfer?.getData("text/plain") || "null"); } catch (_e) { data = null; }
    const info = infoFromData(data);
    if (info) current = info;
  });
  document.addEventListener("dragend", () => {
    current = null;
    for (const g of document.querySelectorAll(".sbe-sp-ghost")) g.remove();
  });
  document.addEventListener("drop", () => {
    setTimeout(() => { for (const g of document.querySelectorAll(".sbe-sp-ghost")) g.remove(); }, 0);
  });
}

/**
 * Départ d'un objet posé DANS une grille : on retient la case par
 * laquelle il a été saisi.
 */
export function startPieceDrag(ev, node, extra = {}) {
  const fw = Number(node.dataset.fw) || 1;
  const fh = Number(node.dataset.fh) || 1;
  let offX = 0;
  let offY = 0;
  if (node.classList.contains("sbe-sp-item")) {
    const r = node.getBoundingClientRect();
    offX = Math.max(0, Math.min(fw - 1, Math.floor((ev.clientX - r.left) / (r.width / fw))));
    offY = Math.max(0, Math.min(fh - 1, Math.floor((ev.clientY - r.top) / (r.height / fh))));
  }
  current = { id: node.dataset.pieceId, fw, fh, offX, offY, ...extra };
}

/** Case de la grille sous le pointeur (peut sortir de la grille). */
export function cellUnder(board, ev) {
  const first = board.querySelector(".sbe-sp-cell");
  if (!first) return null;
  const r = first.getBoundingClientRect();
  const cw = r.width || 1;
  const ch = r.height || 1;
  return { cx: Math.floor((ev.clientX - r.left) / cw), cy: Math.floor((ev.clientY - r.top) / ch) };
}

/** Coin haut gauche visé pour ce qui est glissé (null si inconnu). */
export function anchorUnder(board, ev) {
  const c = cellUnder(board, ev);
  if (!c) return null;
  const info = current;
  return { x: c.cx - (info?.offX ?? 0), y: c.cy - (info?.offY ?? 0) };
}

/** Le rectangle tient-il, d'après ce que la grille affiche ? */
function fitsShown(board, x, y, fw, fh, ignoreId) {
  const cols = Number(board.dataset.cols) || 0;
  const rows = Number(board.dataset.rows) || 0;
  if (x < 0 || y < 0 || x + fw > cols || y + fh > rows) return false;
  for (const p of board.querySelectorAll(".sbe-sp-item[data-sx]")) {
    if (ignoreId && p.dataset.pieceId === ignoreId) continue;
    const px = Number(p.dataset.sx), py = Number(p.dataset.sy);
    const pw = Number(p.dataset.fw), ph = Number(p.dataset.fh);
    if (x < px + pw && x + fw > px && y < py + ph && y + fh > py) return false;
  }
  return true;
}

/** Aperçu vert / rouge pendant le survol d'une grille. */
export function wireSpatialBoards(root) {
  for (const board of root.querySelectorAll(".sbe-sp:not(.is-preview)")) {
    if (board.dataset.sbeSpWired) continue;
    board.dataset.sbeSpWired = "1";
    const clear = () => board.querySelector(".sbe-sp-ghost")?.remove();
    board.addEventListener("dragover", (ev) => {
      const info = current;
      if (!info) return;
      const a = anchorUnder(board, ev);
      if (!a) return;
      let g = board.querySelector(".sbe-sp-ghost");
      if (!g) {
        g = document.createElement("div");
        g.className = "sbe-sp-ghost";
        board.appendChild(g);
      }
      const cols = Number(board.dataset.cols) || 1;
      const rows = Number(board.dataset.rows) || 1;
      /* Le rectangle affiché reste dans la grille ; il est rouge s'il
         en dépasse ou s'il chevauche un objet. */
      const gx = Math.max(0, Math.min(cols - 1, a.x));
      const gy = Math.max(0, Math.min(rows - 1, a.y));
      g.style.gridColumn = `${gx + 1} / span ${Math.max(1, Math.min(info.fw, cols - gx))}`;
      g.style.gridRow = `${gy + 1} / span ${Math.max(1, Math.min(info.fh, rows - gy))}`;
      g.classList.toggle("is-bad", !fitsShown(board, a.x, a.y, info.fw, info.fh, info.id));
    });
    board.addEventListener("dragleave", (ev) => {
      if (!board.contains(ev.relatedTarget)) clear();
    });
    board.addEventListener("drop", () => setTimeout(clear, 0));
  }
}
