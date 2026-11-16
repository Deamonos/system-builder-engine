/**
 * SBE — Explications repliées en « ? »
 *
 * Dans toutes les fenêtres SBE, une explication (.notes, .hint, *-hint)
 * LONGUE (plus d'environ deux lignes) est masquée et remplacée par un
 * « ? » qui pulse, au bout du libellé qu'elle explique ; le texte s'affiche
 * en info-bulle au survol. Une explication courte reste affichée. Le choix
 * se fait sur la LONGUEUR du texte, pas sur la largeur de la fenêtre :
 * étirer une fenêtre ne fait rien apparaître ni bouger. Rien à faire
 * fenêtre par fenêtre, les futures fenêtres en profitent d'office.
 *
 * Fenêtre condensée (classe sbe-condense, helpers/compact-form) : toutes
 * ses explications passent en « ? », même courtes, et même dans une
 * fenêtre de dialogue. Une explication sans libellé au-dessus d'elle
 * (texte d'en-tête ou de pied) reste toujours affichée.
 *
 * Restent toujours visibles : les messages d'état ou d'alerte (classes
 * *-empty, *-warn, *-err, *-full, *-max, .sbe-help-keep), les textes qui
 * contiennent un contrôle, et tout ce qui est dans le chat.
 */

const HINTS = ".notes, .hint, [class*='-hint']";
const KEEP = "li, .sbe-help-keep, [class*='-empty'], [class*='-warn'], [class*='-err'], [class*='-full'], [class*='-max']";
const CONTROLS = "input, select, textarea, button, a[data-action], [data-action]";
const OUTSIDE = ".chat-message, #chat, .chat-log, .chat-popout, #chat-notifications";
/* Au-delà de ce nombre de caractères (environ deux lignes d'une colonne
   de réglages), l'explication passe en « ? ». */
const MAX_CHARS = 100;
const TITLES = new Set(["LABEL", "LEGEND", "H1", "H2", "H3", "H4", "H5", "SUMMARY"]);
/* Un bloc titre écrit en <div> (classe « …-title », « …-subtitle »). */
const TITLE_CLASS = /(^|[\s-])(sub)?title(\s|$)/;
/* Fenêtre condensée : tout passe en « ? ». */
const CONDENSED = ".sbe-condense";

const icons = new WeakMap();      /* explication → son « ? » */
/* « ? » → ce qu'il montre : le texte qu'il portait déjà (bulle posée par
   la fenêtre) et les explications repliées dedans. Un libellé n'a qu'un
   « ? », même quand plusieurs explications s'y rattachent. */
const merged = new WeakMap();
let started = false;
let pending = new Set();
let frame = 0;

/** Cette explication se replie-t-elle ? */
function eligible(el) {
  if (!(el instanceof HTMLElement) || icons.has(el)) return false;
  if (el.matches(KEEP) || el.closest(OUTSIDE)) return false;
  /* Fenêtre SBE (ou bloc SBE ajouté dans une fenêtre de Foundry) : la
     marque « sbe » est cherchée entre l'explication et sa fenêtre
     seulement — le <body> porte lui aussi des classes sbe-*. */
  const app = el.closest(".application, .app, .window-app");
  if (!app) return false;
  /* Les petites fenêtres de dialogue (import, confirmation…) gardent
     leur texte : le « ? » est fait pour les grandes fenêtres. */
  if (app.matches(".dialog, dialog, .dialog-app") && !app.matches(CONDENSED)) return false;
  let ok = false;
  for (let n = el; n && !ok; n = n === app ? null : n.parentElement) {
    ok = [...n.classList].some(c => c.startsWith("sbe"));
  }
  if (!ok) return false;
  if (el.querySelector(CONTROLS)) return false;
  return !!el.textContent.trim();
}

/** Le libellé ou titre que l'explication décrit : le plus proche
 *  au-dessus d'elle (frères précédents, puis ceux de ses parents, sur
 *  deux niveaux au plus, sans sortir de la fenêtre). Un frère qui ne
 *  contient qu'un seul libellé (case à cocher et son champ…) compte comme
 *  ce libellé. */
function anchorOf(el) {
  const stop = el.closest(".window-content, .application, .app") ?? document.body;
  let node = el;
  for (let depth = 0; depth < 3 && node && node !== stop; depth++) {
    for (let s = node.previousElementSibling; s; s = s.previousElementSibling) {
      if (TITLES.has(s.tagName) || TITLE_CLASS.test(s.className)) return s;
      const inner = s.querySelectorAll("label, legend, summary, h1, h2, h3, h4, h5");
      if (inner.length === 1) return inner[0];
    }
    node = node.parentElement;
  }
  return null;
}

const textOf = (el) => el.textContent.replace(/\s+/g, " ").trim();

/** Le « ? » de l'explication : celui du libellé s'il en a déjà un, sinon un nouveau. */
function makeIcon(el) {
  const anchor = anchorOf(el);
  let icon = anchor?.querySelector(":scope > .sbe-help") ?? null;
  if (!icon) {
    icon = document.createElement("i");
    icon.className = "fa-solid fa-circle-question sbe-help";
    icon.hidden = true;
    if (anchor) anchor.append(" ", icon);
    else el.before(icon);
    merged.set(icon, { base: "", hints: new Set(), lone: !anchor });
  } else if (!merged.has(icon)) {
    merged.set(icon, { base: icon.dataset.tooltipText ?? icon.getAttribute("aria-label") ?? "", hints: new Set(), lone: false });
  }
  merged.get(icon).hints.add(el);
  return icon;
}

/** Met à jour la bulle et la présence du « ? » d'après ce qu'il porte. */
function refresh(icon) {
  const m = merged.get(icon);
  if (!m) return;
  const texts = [m.base, ...[...m.hints].filter(h => h.isConnected && h.classList.contains("sbe-help-folded")).map(textOf)].filter(Boolean);
  const esc = foundry.utils.escapeHTML;
  delete icon.dataset.tooltipText;
  icon.dataset.tooltipHtml = texts.map(t => `<p>${esc(t)}</p>`).join("");
  icon.setAttribute("aria-label", texts.join(" "));
  icon.hidden = !texts.length;
}

/** Plie ou déplie selon la longueur du texte. */
function evaluate(el) {
  const icon = icons.get(el);
  if (!icon || !el.isConnected) return;
  /* Sans libellé où se poser (texte en tête ou en pied de page), une
     explication reste TOUJOURS affichée, courte ou longue : un « ? » seul
     sur sa ligne, loin de ce qu'il explique, ne dit rien à personne. */
  const lone = !!merged.get(icon)?.lone;
  const fold = !lone && (!!el.closest(CONDENSED) || textOf(el).length > MAX_CHARS);
  el.classList.toggle("sbe-help-folded", fold);
  refresh(icon);
}

function register(el) {
  if (!eligible(el)) return;
  icons.set(el, makeIcon(el));
  evaluate(el);
}

function flush() {
  frame = 0;
  const roots = pending; pending = new Set();
  for (const root of roots) {
    if (!root.isConnected) continue;
    if (root.matches?.(HINTS)) register(root);
    root.querySelectorAll?.(HINTS).forEach(register);
  }
}

function schedule(node) {
  if (!(node instanceof HTMLElement) || node.classList.contains("sbe-help")) return;
  pending.add(node);
  frame ||= requestAnimationFrame(flush);
}

export function initHelpTips() {
  if (started) return;
  started = true;
  /* Un « ? » dans un libellé de case à cocher : survoler oui, cocher non
     (tous les « ? », y compris ceux écrits par helpers/compact-form). */
  document.addEventListener("click", (ev) => {
    if (!ev.target.closest?.(".sbe-help")) return;
    ev.preventDefault();
    ev.stopPropagation();
  }, true);
  new MutationObserver((muts) => {
    for (const m of muts) {
      m.addedNodes.forEach(schedule);
      /* Texte d'une explication changé par le code : info-bulle et pliage suivent. */
      const h = m.target instanceof Element ? m.target.closest(HINTS) : null;
      /* Explication vide au rendu, remplie ensuite par le code : à prendre. */
      if (h && !icons.has(h)) schedule(h);
      else if (h) evaluate(h);
    }
  }).observe(document.body, { childList: true, subtree: true });
  schedule(document.body);
}
