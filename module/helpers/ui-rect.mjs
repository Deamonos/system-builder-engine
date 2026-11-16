/**
 * SBE — Le rectangle visible d'un élément de l'interface de Foundry
 * (lui et ses enfants affichés), pour placer nos fenêtres sans les
 * poser dessus (horloge, carrousel de combat…).
 */

/** @returns {{left, top, right, bottom}|null} null si l'élément est absent ou masqué */
export function uiRect(sel) {
  const el = typeof sel === "string" ? document.querySelector(sel) : sel;
  if (!el || !el.offsetParent) return null;
  const rects = [el, ...el.children].map(x => x.getBoundingClientRect()).filter(r => r.width && r.height);
  if (!rects.length) return null;
  return {
    left: Math.min(...rects.map(r => r.left)), top: Math.min(...rects.map(r => r.top)),
    right: Math.max(...rects.map(r => r.right)), bottom: Math.max(...rects.map(r => r.bottom))
  };
}
