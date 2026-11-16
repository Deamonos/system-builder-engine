/**
 * SBE — Les fenêtres gardent leur défilement
 *
 * RÈGLE DU SYSTÈME : un nouveau rendu d'une fenêtre SBE (une valeur
 * changée, une ligne ajoutée, un rafraîchissement venu d'un autre
 * joueur) ne fait jamais remonter ses listes. Avant chaque rendu, la
 * position de TOUT ce qui défile dans la fenêtre est notée ; après, elle
 * est remise. Automatique pour toutes les fenêtres du système
 * (gestionnaires, fiches, ateliers, fenêtres de dialogue) : rien à faire
 * dans une nouvelle fenêtre. Vaut aussi pour le HUD des jetons (liste des
 * statuts et des effets).
 *
 * Un élément défilant est retrouvé par son chemin dans la fenêtre (rang
 * de chaque enfant depuis la fenêtre) et par ses classes. Une zone
 * marquée data-keep-scroll="off" gère elle-même son défilement.
 */

const SNAP = new WeakMap();

/** HUD d'un élément de la scène (jeton, tuile…) : sa liste des statuts
    se redessine à chaque clic (poser un effet, un cumul) et remontait. */
function isHud(app) {
  const Base = foundry.applications?.hud?.BasePlaceableHUD;
  return !!Base && app instanceof Base;
}

/** Fenêtre du système : une classe « sbe-… », ou du contenu « sbe-… ». */
function isSbe(app) {
  if (isHud(app)) return true;
  if ([...(app?.options?.classes ?? [])].some(c => String(c).startsWith("sbe-"))) return true;
  const el = app?.element;
  if (!el) return false;
  if ([...el.classList].some(c => c.startsWith("sbe-"))) return true;
  return !!el.querySelector(".window-content [class*='sbe-']");
}

function pathOf(root, el) {
  const out = [];
  for (let n = el; n && n !== root; n = n.parentElement) {
    const p = n.parentElement;
    if (!p) return null;
    out.unshift(Array.prototype.indexOf.call(p.children, n));
  }
  return out;
}

function nodeAt(root, path) {
  let n = root;
  for (const i of path) {
    n = n?.children?.[i];
    if (!n) return null;
  }
  return n;
}

function snapshot(root) {
  const list = [];
  for (const el of [root, ...root.querySelectorAll("*")]) {
    if (!el.scrollTop && !el.scrollLeft) continue;
    /* Une zone qui gère elle-même son défilement (la page de la
       documentation remonte en haut à chaque nouvelle page). */
    if (el.dataset?.keepScroll === "off") continue;
    const path = pathOf(root, el);
    if (path) list.push({ path, cls: el.className, top: el.scrollTop, left: el.scrollLeft });
  }
  return list;
}

function restore(root, list) {
  for (const s of list) {
    let el = nodeAt(root, s.path);
    /* Le chemin a bougé (une ligne de plus au-dessus) : la même classe. */
    if (!el || el.className !== s.cls) {
      const cls = String(s.cls ?? "").trim().split(/\s+/).filter(Boolean);
      el = cls.length ? root.querySelector(cls.map(c => `.${CSS.escape(c)}`).join("")) : null;
    }
    if (!el) continue;
    if (el.scrollTop !== s.top) el.scrollTop = s.top;
    if (el.scrollLeft !== s.left) el.scrollLeft = s.left;
  }
}

export function initKeepScroll() {
  Hooks.on("preRenderApplicationV2", (app) => {
    const root = app?.element;
    if (!root || !app.rendered || !isSbe(app)) return;
    const list = snapshot(root);
    if (list.length) SNAP.set(app, list);
    else SNAP.delete(app);
  });
  Hooks.on("renderApplicationV2", (app) => {
    const list = SNAP.get(app);
    const root = app?.element;
    if (!list || !root) return;
    restore(root, list);
    /* Ce que la fenêtre ajoute juste après son rendu (listes remplies
       à part) : une seconde passe à l'image suivante. */
    requestAnimationFrame(() => { if (app.element) restore(app.element, list); });
  });
}
