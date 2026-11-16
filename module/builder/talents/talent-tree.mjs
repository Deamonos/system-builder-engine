/**
 * SBE — COMPOSANT ARBRE (données et dessin)
 *
 * Un arbre de nœuds reliés par des liens, construit par le MJ dans
 * l'atelier (modèle de personnage ou d'objet). La FORME de l'arbre vit
 * dans le modèle (`config.tree`) ; ce qui est débloqué vivra dans la
 * valeur du composant, sur chaque fiche.
 *
 *   tree = {
 *     nodes: [{ id, x, y, name, icon, desc, ranks, shape, size,
 *               cost, parents, cond, group }],
 *       cost    : formule du coût d'UN rang (« rank » = rang acheté) ; vide = 1
 *       parents : "all" (tous les parents débloqués) | "any" (au moins un)
 *       cond    : condition libre sur la fiche (formule) ; vide = aucune
 *       group   : groupe exclusif (un seul nœud débloqué par groupe)
 *       bonus   : [{ key, mode, value, to }]  apports aux valeurs (« rank » = rang
 *                 débloqué) ; to : "carrier" (porteur) | "item" (l'objet), arbre d'objet
 *       items   : [{ id, qty, each }]  objets du monde donnés (each : à chaque rang)
 *       effects : [{ key, each }]      effets posés (each : un cumul par rang)
 *       button  : clé d'un bouton du modèle, lancé à chaque déblocage
 *     links: [{ a, b }],          a = parent, b = enfant
 *     grid, snap,                 éditeur : pas de la grille, aimant
 *     shape, size                 apparence par défaut des nœuds
 *     look: {                     apparence de l'arbre
 *       colors: { état: couleur }   vide = la couleur de SBE
 *       link, width, anim           liens : droit / coudé / courbe, épaisseur, animation
 *       bg, bgMode                  image de fond et sa disposition
 *     }
 *   }
 *
 * x / y : CENTRE du nœud, en pixels, jamais négatifs.
 */

export const TREE_SHAPES = ["circle", "square", "diamond", "hexagon"];
export const TREE_DISPLAYS = ["inline", "window"];
export const TREE_WHO = ["player", "approve", "gm"];
export const TREE_PARENTS = ["all", "any"];
export const TREE_DEFAULT_SIZE = 56;
export const TREE_DEFAULT_GRID = 40;
export const TREE_DEFAULT_HEIGHT = 360;

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const num = (v, d) => (Number.isFinite(Number(v)) && v !== "" && v !== null ? Number(v) : d);
const clampSize = (v) => Math.min(160, Math.max(24, Math.round(v)));

/** Arbre propre (rien d'inconnu, liens valides, sans cycle). */
export function cleanTree(raw) {
  const t = raw && typeof raw === "object" ? raw : {};
  const ids = new Set();
  const nodes = [];
  for (const n of Array.isArray(t.nodes) ? t.nodes : []) {
    const id = String(n?.id ?? "").trim();
    if (!id || ids.has(id)) continue;
    ids.add(id);
    const out = {
      id,
      x: Math.max(0, Math.round(num(n.x, 0))),
      y: Math.max(0, Math.round(num(n.y, 0))),
      name: String(n.name ?? ""),
      icon: String(n.icon ?? ""),
      desc: String(n.desc ?? ""),
      ranks: Math.min(99, Math.max(1, Math.floor(num(n.ranks, 1))))
    };
    if (TREE_SHAPES.includes(n.shape)) out.shape = n.shape;
    if (num(n.size, 0) > 0) out.size = clampSize(n.size);
    for (const f of ["cost", "cond", "group"]) {
      const v = String(n[f] ?? "").trim();
      if (v) out[f] = v;
    }
    if (n.parents === "any") out.parents = "any";
    const bonus = (Array.isArray(n.bonus) ? n.bonus : [])
      .map(b => ({ key: String(b?.key ?? "").trim(), mode: TREE_BONUS_MODES.includes(b?.mode) ? b.mode : "add",
        value: String(b?.value ?? "").trim(), to: b?.to === "item" ? "item" : "carrier" }))
      .filter(b => b.key && b.value);
    if (bonus.length) out.bonus = bonus;
    const items = (Array.isArray(n.items) ? n.items : [])
      .map(i => ({ id: String(i?.id ?? "").trim(), qty: Math.max(1, Math.floor(num(i?.qty, 1))), each: !!i?.each }))
      .filter(i => i.id);
    if (items.length) out.items = items;
    const effects = (Array.isArray(n.effects) ? n.effects : [])
      .map(e => ({ key: String(e?.key ?? "").trim(), each: !!e?.each }))
      .filter(e => e.key);
    if (effects.length) out.effects = effects;
    const button = String(n.button ?? "").trim();
    if (button) out.button = button;
    nodes.push(out);
  }
  const links = [];
  const seen = new Set();
  for (const l of Array.isArray(t.links) ? t.links : []) {
    const a = String(l?.a ?? ""), b = String(l?.b ?? "");
    if (!ids.has(a) || !ids.has(b) || a === b) continue;
    if (seen.has(`${a}>${b}`) || seen.has(`${b}>${a}`)) continue;
    if (reaches(links, b, a)) continue;
    seen.add(`${a}>${b}`);
    links.push({ a, b });
  }
  return {
    nodes, links,
    grid: Math.min(200, Math.max(10, Math.round(num(t.grid, TREE_DEFAULT_GRID)))),
    snap: t.snap !== false,
    shape: TREE_SHAPES.includes(t.shape) ? t.shape : "circle",
    size: clampSize(num(t.size, TREE_DEFAULT_SIZE)),
    look: cleanLook(t.look)
  };
}

const cssVal = (s) => String(s ?? "").replace(/[;{}<>"'()\\]/g, "").trim();

/** Apparence propre (seules les valeurs réglées sont gardées). */
function cleanLook(raw) {
  const l = raw && typeof raw === "object" ? raw : {};
  const out = {};
  const colors = {};
  for (const k of TREE_COLOR_KEYS) {
    const raw = l.colors?.[k];
    const c = cssVal(raw && typeof raw === "object" ? (raw.dark || raw.light) : raw);
    if (c) colors[k] = c;
  }
  if (Object.keys(colors).length) out.colors = colors;
  if (TREE_LINK_STYLES.includes(l.link) && l.link !== "straight") out.link = l.link;
  if (num(l.width, 0) > 0) out.width = Math.min(12, Math.max(1, Math.round(num(l.width, 3))));
  if (TREE_LINK_ANIMS.includes(l.anim) && l.anim !== "none") out.anim = l.anim;
  const bg = String(l.bg ?? "").trim();
  if (bg) out.bg = bg;
  if (TREE_BG_MODES.includes(l.bgMode) && l.bgMode !== "cover") out.bgMode = l.bgMode;
  return out;
}

/**
 * Variables CSS de l'apparence : couleurs, épaisseur des liens, image de
 * fond. À poser sur l'élément qui contient l'arbre.
 */
export function treeStyleVars(tree) {
  const look = tree?.look ?? {};
  const out = [];
  for (const [k, c] of Object.entries(look.colors ?? {})) if (c) out.push(`--tal-${k}:${c}`);
  if (look.width) out.push(`--tal-lw:${look.width}px`);
  if (look.bg) {
    const size = { cover: "cover", contain: "contain", repeat: "auto", center: "auto" }[look.bgMode ?? "cover"];
    /* Chemin absolu : une url relative serait lue depuis le fichier CSS du système. */
    const src = /^(https?:|data:|\/)/.test(look.bg) ? look.bg : (foundry.utils.getRoute?.(look.bg) ?? `/${look.bg}`);
    out.push(`--tal-bg-img:url("${encodeURI(src).replace(/"/g, "%22")}")`, `--tal-bg-size:${size}`,
      `--tal-bg-rep:${look.bgMode === "repeat" ? "repeat" : "no-repeat"}`);
  }
  return out.join(";");
}

/** Tracé d'un lien selon le style de l'arbre. */
function linkPath(style, x1, y1, x2, y2) {
  if (style === "elbow") {
    const my = Math.round((y1 + y2) / 2);
    return `M${x1},${y1} V${my} H${x2} V${y2}`;
  }
  if (style === "curve") {
    const my = (y1 + y2) / 2;
    return `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
  }
  return `M${x1},${y1} L${x2},${y2}`;
}

export const TREE_REFUNDS = ["none", "node", "tree", "both"];
export const TREE_LINK_STYLES = ["straight", "elbow", "curve"];
export const TREE_LINK_ANIMS = ["none", "flow", "glow"];
export const TREE_BG_MODES = ["cover", "contain", "repeat", "center"];
export const TREE_COLOR_KEYS = ["locked", "open", "owned", "max", "pending", "link", "linkLit", "name", "bg"];
export const TREE_BONUS_MODES = ["add", "multiply", "upgrade", "downgrade", "override"];
export const TREE_REWARDS_BACK = ["remove", "keep"];

/** « Réinitialiser l'arbre » est-il proposé à cet utilisateur ? (le MJ : toujours) */
export function treeResetVisible(el, isGM, isOwner) {
  if (isGM) return true;
  const c = el?.config ?? {};
  return !!isOwner && ["tree", "both"].includes(c.refund ?? "none") && (c.refundWho ?? "player") !== "gm";
}

/** Vrai si `to` est atteignable depuis `from` en suivant les liens (a → b). */
export function reaches(links, from, to) {
  const seen = new Set([from]);
  const todo = [from];
  while (todo.length) {
    const cur = todo.pop();
    if (cur === to) return true;
    for (const l of links) {
      if (l.a === cur && !seen.has(l.b)) { seen.add(l.b); todo.push(l.b); }
    }
  }
  return false;
}

export const nodeSize = (tree, n) => n?.size ?? tree.size ?? TREE_DEFAULT_SIZE;
export const nodeShape = (tree, n) => n?.shape ?? tree.shape ?? "circle";

/** Rectangle occupé par les nœuds (nom sous le nœud compris). */
export function treeBounds(tree) {
  if (!tree.nodes.length) return { x: 0, y: 0, w: 0, h: 0 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of tree.nodes) {
    const h = nodeSize(tree, n) / 2;
    x0 = Math.min(x0, n.x - Math.max(h, 60)); x1 = Math.max(x1, n.x + Math.max(h, 60));
    y0 = Math.min(y0, n.y - h); y1 = Math.max(y1, n.y + h + 22);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * Le dessin de l'arbre (liens + nœuds), dans un plan de `w` × `h` px.
 * @param {object} tree     arbre propre
 * @param {object} [o]
 * @param {number} [o.dx]   décalage ajouté aux positions
 * @param {number} [o.dy]
 * @param {number} [o.w]    taille du plan (défaut : l'arbre + marge)
 * @param {number} [o.h]
 * @param {Function} [o.stateOf]  (node) → "locked" | "open" | "owned" | "max"
 * @param {Function} [o.rankOf]   (node) → rang débloqué
 * @param {Function} [o.tipOf]    (node) → texte d'info-bulle
 * @param {string} [o.selected]   id du nœud ou du lien (« a>b ») choisi (éditeur)
 * @param {boolean} [o.edit]      poignées de lien (éditeur)
 */
export function treeStageHTML(tree, o = {}) {
  const pad = 24;
  const b = treeBounds(tree);
  const dx = o.dx ?? (pad - b.x), dy = o.dy ?? (pad - b.y);
  const w = o.w ?? Math.max(1, b.w + pad * 2), h = o.h ?? Math.max(1, b.h + pad * 2);
  const byId = new Map(tree.nodes.map(n => [n.id, n]));
  const stateOf = o.stateOf ?? (() => "open");
  const rankOf = o.rankOf ?? (() => 0);
  const paths = tree.links.map(l => {
    const A = byId.get(l.a), B = byId.get(l.b);
    if (!A || !B) return "";
    const d = linkPath(tree.look?.link, A.x + dx, A.y + dy, B.x + dx, B.y + dy);
    const base = (n) => String(stateOf(n)).split(" ")[0];
    const lit = ["owned", "max"].includes(base(A)) && base(B) !== "locked";
    const sel = o.selected === `${l.a}>${l.b}` ? " is-sel" : "";
    return `<g class="sbe-tal-link${lit ? " is-lit" : ""}${sel}" data-link="${esc(l.a)}>${esc(l.b)}">`
      + (o.edit ? `<path class="sbe-tal-hit" d="${d}"/>` : "")
      + `<path class="sbe-tal-line" d="${d}"/></g>`;
  }).join("");
  const nodes = tree.nodes.map(n => {
    const s = nodeSize(tree, n);
    const st = stateOf(n);
    const r = rankOf(n);
    const sel = o.selected === n.id ? " is-sel" : "";
    const tip = o.tipOf ? o.tipOf(n) : "";
    const face = n.icon
      ? `<img src="${esc(n.icon)}" alt="" draggable="false">`
      : `<i class="fa-solid fa-star"></i>`;
    const rank = n.ranks > 1 ? `<span class="sbe-tal-rank">${r}/${n.ranks}</span>` : "";
    return `<div class="sbe-tal-node is-${nodeShape(tree, n)} is-${st}${sel}" data-node="${esc(n.id)}"${tip ? ` data-tooltip-text="${esc(tip)}"` : ""}
        style="left:${n.x + dx}px;top:${n.y + dy}px;--tal-s:${s}px">
      <span class="sbe-tal-face"><span class="sbe-tal-in">${face}</span></span>${rank}
      ${n.name ? `<span class="sbe-tal-name">${esc(n.name)}</span>` : ""}
      ${o.edit ? `<span class="sbe-tal-handle" data-handle="${esc(n.id)}"></span>` : ""}
    </div>`;
  }).join("");
  const anim = tree.look?.anim ? ` is-anim-${tree.look.anim}` : "";
  return `<div class="sbe-tal-stage${anim}" style="width:${w}px;height:${h}px;${esc(treeStyleVars(tree))}">
    <svg class="sbe-tal-links" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${paths}</svg>${nodes}
  </div>`;
}

/*
 * ÉTAT d'un arbre sur une fiche (rangs, nœuds disponibles…) : fourni par
 * la partie « table » (talent-sheet.mjs), qui s'inscrit ici — le dessin
 * ne dépend pas des règles.
 *   provider(doc, el, tree) → { stateOf, rankOf, tipOf, tools }   (tools : HTML au-dessus de l'arbre)
 */
let STATE_PROVIDER = null;
export function setTreeStateProvider(fn) { STATE_PROVIDER = typeof fn === "function" ? fn : null; }

/**
 * L'arbre dans une fenêtre qui défile (fiche, aperçu de l'atelier).
 * @param {object} el  le composant
 * @param {object} [o] options de treeStageHTML + height
 */
export function treeViewHTML(el, o = {}) {
  const tree = cleanTree(el?.config?.tree);
  const height = Math.max(120, num(o.height ?? el?.config?.height, TREE_DEFAULT_HEIGHT));
  if (!tree.nodes.length) {
    return `<div class="sbe-tal-view is-empty" style="height:${Math.min(height, 140)}px"><span>${esc(game.i18n.localize("SBE.Talents.Empty"))}</span></div>`;
  }
  /* Aperçu de l'atelier : l'arbre réduit pour tenir en entier (voir fitTreePreviews). */
  if (o.fit) return `<div class="sbe-tal-view is-fit" data-tal-fit="${height}">${treeStageHTML(tree, o)}</div>`;
  /* Sur une fiche : l'état de chaque nœud, et le clic ouvre sa fiche. */
  const live = o.doc && STATE_PROVIDER ? STATE_PROVIDER(o.doc, el, tree) : null;
  const h = o.fill ? "" : ` style="height:${height}px"`;
  /* Sur une fiche : zoom et déplacement (boutons, Ctrl + molette, glisser le fond). */
  if (o.doc) {
    const T = (k) => esc(game.i18n.localize(k));
    const bar = `<div class="sbe-tal-zoombar">
      <a data-tal-zoom="out" data-tooltip-text="${T("SBE.Talents.ZoomOut")}"><i class="fa-solid fa-magnifying-glass-minus"></i></a>
      <span data-tal-zoomval>100 %</span>
      <a data-tal-zoom="in" data-tooltip-text="${T("SBE.Talents.ZoomIn")}"><i class="fa-solid fa-magnifying-glass-plus"></i></a>
      <a data-tal-zoom="fit" data-tooltip-text="${T("SBE.Talents.ZoomFit")}"><i class="fa-solid fa-expand"></i></a>
    </div>`;
    return `${live?.tools ?? ""}<div class="sbe-tal-frame${o.fill ? " is-fill" : ""}"><div class="sbe-tal-view${live ? " is-live" : ""}${o.fill ? " is-fill" : ""}" data-tal-view data-tal-el="${esc(el.id)}"${h}>${treeStageHTML(tree, { ...o, ...(live ?? {}) })}</div>${bar}</div>`;
  }
  return `${live?.tools ?? ""}<div class="sbe-tal-view${live ? " is-live" : ""}${o.fill ? " is-fill" : ""}" data-tal-view${o.doc ? ` data-tal-el="${esc(el.id)}"` : ""}${h}>${treeStageHTML(tree, { ...o, ...(live ?? {}) })}</div>`;
}

/** Réduit chaque aperçu « is-fit » de `root` à la largeur de sa zone et à sa hauteur maximale. */
export function fitTreePreviews(root) {
  for (const view of root?.querySelectorAll?.(".sbe-tal-view.is-fit") ?? []) {
    const stage = view.firstElementChild;
    if (!stage || view.clientWidth < 10) continue;     /* zone cachée (autre onglet) */
    const w = parseFloat(stage.style.width) || 1, h = parseFloat(stage.style.height) || 1;
    const maxH = Number(view.dataset.talFit) || 320;
    const s = Math.min(1, Math.max(0.05, (view.clientWidth - 2) / w), maxH / h);
    stage.style.transform = `scale(${s})`;
    view.style.height = `${Math.ceil(h * s) + 2}px`;
  }
}
