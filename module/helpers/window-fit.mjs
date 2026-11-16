/**
 * SBE — Fenêtres toujours à la taille de l'écran
 *
 * RÈGLE DU SYSTÈME : aucune fenêtre SBE ne dépasse l'écran du joueur.
 * Une fenêtre plus haute (ou plus large) que l'écran est ramenée à sa
 * taille à l'ouverture, et son contenu défile (barre de défilement).
 *
 * Automatique pour TOUTES les fenêtres du système (gestionnaires,
 * fiches, ateliers, petites fenêtres de dialogue) : une nouvelle
 * fenêtre n'a rien à faire. Sont reconnues comme SBE : une classe
 * « sbe-… » sur la fenêtre, ou du contenu « sbe-… » à l'intérieur.
 * Côté CSS : styles/theme/window-fit.css (classe « sbe-fit »).
 *
 * Toute fenêtre SBE est aussi REDIMENSIONNABLE à la main : celles qui
 * ne l'étaient pas reçoivent une poignée dans le coin bas-droit. Dès
 * que la hauteur choisie est plus petite que le contenu, il défile.
 * Une fenêtre à hauteur automatique GRANDIT avec son contenu (une liste
 * qui s'allonge, une section dépliée) jusqu'à la hauteur de l'écran ;
 * la barre de défilement n'apparaît qu'au-delà. Si elle déborde en bas
 * en grandissant, elle remonte. Redimensionnée à la main, elle garde
 * la hauteur choisie.
 */

const MARGIN = 8;

function isSbe(app) {
  const el = app?.element;
  if (!el) return false;
  if ([...(app.options?.classes ?? [])].some(c => String(c).startsWith("sbe-"))) return true;
  if ([...el.classList].some(c => c.startsWith("sbe-"))) return true;
  return !!el.querySelector(".window-content [class*='sbe-']");
}

/** Ramène la fenêtre dans l'écran (taille et position). */
export function fitToScreen(app) {
  const el = app?.element;
  if (!el || !el.classList?.contains("application") || app.options?.window?.frame === false) return;
  el.classList.add("sbe-fit");
  const pos = app.position ?? {};
  const maxH = window.innerHeight - MARGIN * 2;
  const maxW = window.innerWidth - MARGIN * 2;
  const rect = el.getBoundingClientRect();
  const h = Number.isFinite(pos.height) ? pos.height : rect.height;
  const w = Number.isFinite(pos.width) ? pos.width : rect.width;
  const next = {};
  if (h > maxH) { next.height = maxH; next.top = MARGIN; }
  if (w > maxW) { next.width = maxW; next.left = MARGIN; }
  /* Pas trop haute, mais posée trop bas : on la remonte. */
  if (!("top" in next) && Number.isFinite(pos.top) && pos.top + Math.min(h, maxH) > window.innerHeight - MARGIN) {
    next.top = Math.max(MARGIN, window.innerHeight - MARGIN - Math.min(h, maxH));
  }
  if (Object.keys(next).length) {
    try { app.setPosition(next); } catch (err) { console.warn("SBE | Ajustement de fenêtre en échec", err); }
  }
}

const MIN_W = 220;
const MIN_H = 120;

/** Poignée de redimensionnement pour une fenêtre qui n'en a pas. */
function addResizeHandle(app) {
  const el = app?.element;
  if (!el || app.options?.window?.resizable || app.options?.window?.frame === false) return;
  if (el.querySelector(":scope > .window-resize-handle, :scope > .sbe-resize-handle")) return;
  const h = document.createElement("div");
  h.className = "sbe-resize-handle";
  h.innerHTML = '<i class="fa-solid fa-up-right-and-down-left-from-center fa-rotate-90"></i>';
  h.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0 || app.minimized) return;
    ev.preventDefault();
    ev.stopPropagation();
    const r = el.getBoundingClientRect();
    const sx = ev.clientX, sy = ev.clientY;
    h.setPointerCapture(ev.pointerId);
    const move = (e) => {
      const width = Math.min(window.innerWidth - r.left - MARGIN, Math.max(MIN_W, r.width + e.clientX - sx));
      const height = Math.min(window.innerHeight - r.top - MARGIN, Math.max(MIN_H, r.height + e.clientY - sy));
      try { app.setPosition({ width, height }); } catch (_e) { /* fenêtre fermée */ }
    };
    const up = () => {
      h.removeEventListener("pointermove", move);
      h.removeEventListener("pointerup", up);
      h.removeEventListener("pointercancel", up);
    };
    h.addEventListener("pointermove", move);
    h.addEventListener("pointerup", up);
    h.addEventListener("pointercancel", up);
  });
  el.append(h);
}

/* Fenêtre à hauteur automatique qui grandit : si son bas sort de
   l'écran, elle remonte (la hauteur reste plafonnée par le CSS). */
const watched = new WeakSet();
function watchGrowth(app) {
  const el = app?.element;
  if (!el || watched.has(el) || typeof ResizeObserver === "undefined") return;
  watched.add(el);
  const ro = new ResizeObserver(() => {
    if (!el.isConnected) { ro.disconnect(); return; }
    if (app.minimized || Number.isFinite(app.position?.height)) return;
    const r = el.getBoundingClientRect();
    if (r.bottom > window.innerHeight - MARGIN) {
      const top = Math.max(MARGIN, window.innerHeight - MARGIN - r.height);
      if (Math.abs(top - r.top) > 1) { try { app.setPosition({ top }); } catch (_e) { /* fenêtre fermée */ } }
    }
  });
  ro.observe(el);
}

export function initWindowFit() {
  Hooks.on("renderApplicationV2", (app, _el, _ctx, options) => {
    if (!options?.isFirstRender && app.element?.classList.contains("sbe-fit")) return;
    if (!isSbe(app)) return;
    addResizeHandle(app);
    /* Après la mise en page (hauteur « auto » mesurée). */
    requestAnimationFrame(() => { fitToScreen(app); watchGrowth(app); });
  });
  /* Écran redimensionné : les fenêtres ouvertes suivent. */
  let t = null;
  window.addEventListener("resize", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      for (const app of foundry.applications.instances.values()) {
        if (app.rendered && app.element?.classList.contains("sbe-fit")) fitToScreen(app);
      }
    }, 200);
  });
}
