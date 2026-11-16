/**
 * SBE — PLANCHE À DESSIN commune (formes de zone, corps de localisation)
 *
 * Le même outil partout où le MJ dessine des morceaux sur un SVG :
 *   - Sélection : cliquer un morceau le choisit, le glisser le déplace ;
 *   - Polygone  : un clic par point, double-clic (ou clic sur le premier
 *                 point) pour fermer ;
 *   - Ellipse   : glisser depuis le centre (Maj = cercle) ;
 *   - Rectangle : glisser d'un coin à l'autre.
 *
 * L'appelant garde l'ÉTAT ({ sel, draft }) d'un rendu à l'autre, dessine
 * lui-même ses morceaux (chaque morceau porte `data-i` et la classe
 * donnée par `pieceClass`) et ajoute le tracé en cours avec draftSvg().
 */

import { piecePolygon } from "../managers/zones/zone-geom.mjs";

/** Le tracé en cours, en SVG (classes de l'appelant). */
export function draftSvg(d, { cls = "sbe-board-draft", dot = "sbe-board-dot", r = 0.08 } = {}) {
  if (!d) return "";
  if (d.kind === "poly") {
    const pts = [...d.pts, ...(d.hover ? [d.hover] : [])].map(([x, y]) => `${x},${y}`).join(" ");
    return `<polyline points="${pts}" class="${cls}"/>` + d.pts.map(([x, y], k) => `<circle cx="${x}" cy="${y}" r="${k ? r : r * 1.75}" class="${dot}"/>`).join("");
  }
  const pts = piecePolygon(d).map(([x, y]) => `${x},${y}`).join(" ");
  return `<polygon points="${pts}" class="${cls}"/>`;
}

/**
 * Branche la planche.
 * @param {SVGSVGElement} svg
 * @param {object} o
 *   state      { sel, draft }        (gardé par l'appelant)
 *   pieces()   la liste modifiable des morceaux
 *   tool()     "select" | "poly" | "ellipse" | "rect"
 *   step()     pas d'aimantation (0 = libre, au centième)
 *   pieceClass classe CSS des morceaux cliquables
 *   closeDist  distance qui referme un polygone sur son premier point
 *   minSize    taille minimale d'une ellipse ou d'un rectangle
 *   make(geom) le morceau à ajouter (null = refusé)
 *   onSelect() après un choix à l'outil Sélection
 *   redraw()   redessine la planche
 */
export function wireShapeBoard(svg, o) {
  const st = o.state;
  const minSize = o.minSize ?? 0.05;
  const closeDist = o.closeDist ?? 0.3;
  let drag = null;

  const pt = (ev) => {
    const m = svg.getScreenCTM();
    if (!m) return [0, 0];
    const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse());
    const k = Number(o.step?.()) || 0;
    const r = (v) => (k > 0 ? Math.round(v / k) * k : Math.round(v * 100) / 100);
    return [r(p.x), r(p.y)];
  };
  const add = (geom) => {
    const piece = o.make(geom);
    if (piece) o.pieces().push(piece);
  };
  const closePoly = () => {
    const d = st.draft;
    /* Le double-clic ajoute deux points identiques : on les retire. */
    const pts = d.pts.filter((q, i, a) => i === 0 || q[0] !== a[i - 1][0] || q[1] !== a[i - 1][1]);
    if (pts.length >= 3) add({ kind: "poly", pts });
    st.draft = null;
    o.redraw();
  };

  svg.tabIndex = 0;
  svg.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0) return;
    svg.focus();
    const p = pt(ev);
    const tool = o.tool();
    if (tool === "select") {
      const hit = ev.target.closest?.(`.${o.pieceClass}`);
      st.sel = hit ? Number(hit.dataset.i) : -1;
      o.onSelect?.();
      if (hit) { drag = { from: p, orig: foundry.utils.deepClone(o.pieces()[st.sel]) }; svg.setPointerCapture(ev.pointerId); }
      o.redraw();
      return;
    }
    if (tool === "poly") {
      const d = st.draft ?? (st.draft = { kind: "poly", pts: [] });
      const first = d.pts[0];
      if (first && d.pts.length >= 3 && Math.hypot(p[0] - first[0], p[1] - first[1]) < closeDist) return closePoly();
      d.pts.push(p);
      o.redraw();
      return;
    }
    /* Ellipse / rectangle : glisser. */
    st.draft = tool === "ellipse"
      ? { kind: "ellipse", x: p[0], y: p[1], rx: 0, ry: 0, from: p }
      : { kind: "rect", x: p[0], y: p[1], w: 0, h: 0, from: p };
    svg.setPointerCapture(ev.pointerId);
  });
  svg.addEventListener("pointermove", (ev) => {
    const p = pt(ev);
    if (drag) {
      const dx = p[0] - drag.from[0], dy = p[1] - drag.from[1];
      const g = drag.orig, piece = o.pieces()[st.sel];
      if (!piece) return;
      if (g.kind === "poly") piece.pts = g.pts.map(([x, y]) => [x + dx, y + dy]);
      else { piece.x = g.x + dx; piece.y = g.y + dy; }
      o.redraw();
      return;
    }
    const d = st.draft;
    if (!d) return;
    if (d.kind === "poly") { d.hover = p; o.redraw(); return; }
    if (d.kind === "ellipse") {
      d.rx = Math.abs(p[0] - d.from[0]); d.ry = Math.abs(p[1] - d.from[1]);
      if (ev.shiftKey) d.rx = d.ry = Math.max(d.rx, d.ry);
    } else {
      d.x = Math.min(p[0], d.from[0]); d.y = Math.min(p[1], d.from[1]);
      d.w = Math.abs(p[0] - d.from[0]); d.h = Math.abs(p[1] - d.from[1]);
    }
    o.redraw();
  });
  svg.addEventListener("pointerup", () => {
    if (drag) { drag = null; return; }
    const d = st.draft;
    if (!d || d.kind === "poly") return;
    const big = d.kind === "ellipse" ? d.rx > minSize && d.ry > minSize : d.w > minSize && d.h > minSize;
    if (big) {
      const geom = { ...d, rot: 0 };
      delete geom.from;
      add(geom);
    }
    st.draft = null;
    o.redraw();
  });
  svg.addEventListener("dblclick", (ev) => {
    if (o.tool() === "poly" && st.draft) { ev.preventDefault(); closePoly(); }
  });
}
