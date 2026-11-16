/**
 * SBE — CARROUSEL DE COMBAT : thème
 *
 * Par défaut, le carrousel prend les couleurs du thème SBE (variables
 * --sbe-*). Le MJ peut lui donner un thème propre : des couleurs pour le
 * sombre et pour le clair, l'arrondi et l'épaisseur des cadres. Ce thème
 * est injecté en variables --car-* (une balise <style>), lues par
 * styles/managers/carousel.css ; il s'exporte et s'importe en JSON.
 *
 * Mode avancé (`adv`, partie du thème propre) :
 *   css    CSS libre du MJ, limité au carrousel et à son info-bulle (relu
 *          règle par règle et remis dans `:is(#sbe-carousel,
 *          #tooltip.sbe-car-tipbox)` ; @keyframes et @font-face permis)
 *   svgs   bibliothèque [{ name, code (SVG collé) | file (fichier du monde) }]
 *          ; chaque SVG devient la variable CSS `--svg-<nom>`
 *   slots  { frame (par-dessus chaque portrait), band (fond de la bande),
 *          round (fond de la pastille du round), defeat (icône des vaincus),
 *          next (icône de la languette « Suivant ») } : noms de la
 *          bibliothèque
 */

const STYLE_ID = "sbe-carousel-theme";
const HEX = /^#[0-9a-f]{6}$/i;

/** Les couleurs réglables, et la variable SBE qui les donne par défaut. */
export const THEME_TOKENS = {
  panel: "--sbe-surf-2", panelBorder: "--sbe-surf-4", text: "--sbe-text-strong",
  accent: "--sbe-accent", accent2: "--sbe-accent-light", frame: "--sbe-surf-5", card: "--sbe-surf-1",
  hostile: "--sbe-fail", friendly: "--sbe-ok", neutral: "--sbe-warn"
};
const CSS_VAR = {
  panel: "--car-panel", panelBorder: "--car-panel-border", text: "--car-text", accent: "--car-accent", accent2: "--car-accent-2",
  frame: "--car-frame", card: "--car-card", hostile: "--car-hostile", friendly: "--car-friendly", neutral: "--car-neutral"
};
export const THEME_MODES = ["sbe", "own"];
export const SVG_SLOTS = ["frame", "band", "round", "defeat", "next"];
const SVG_MAX = 30;
const SVG_SIZE = 100000;
const CSS_SIZE = 50000;
const SVG_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;
const SCOPE = ":is(#sbe-carousel, #tooltip.sbe-car-tipbox)";
const int = (v, min, max, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };

/** Les couleurs du thème SBE en ce moment, pour « sombre » ou « clair ». */
export function sbeColors(scheme) {
  const probe = document.createElement("div");
  probe.className = `themed theme-${scheme === "light" ? "light" : "dark"}`;
  probe.hidden = true;
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const out = {};
  for (const [k, v] of Object.entries(THEME_TOKENS)) out[k] = toHex(cs.getPropertyValue(v).trim()) || "#808080";
  probe.remove();
  return out;
}

/** Une couleur CSS → #rrggbb (via le navigateur). */
function toHex(c) {
  if (HEX.test(c)) return c.toLowerCase();
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx || !c) return "";
  ctx.fillStyle = "#000000";
  ctx.fillStyle = c;
  const v = ctx.fillStyle;
  return HEX.test(v) ? v.toLowerCase() : "";
}

export function cleanTheme(o = {}) {
  const colors = (x) => Object.fromEntries(Object.keys(THEME_TOKENS)
    .map(k => [k, HEX.test(String(x?.[k] ?? "")) ? String(x[k]).toLowerCase() : ""]));
  return {
    mode: THEME_MODES.includes(o.mode) ? o.mode : "sbe",
    radius: int(o.radius, 0, 40, 8),
    border: int(o.border, 0, 8, 2),
    dark: colors(o.dark),
    light: colors(o.light),
    adv: cleanAdv(o.adv)
  };
}

/** Le mode avancé : CSS libre, bibliothèque de SVG et leurs emplacements. */
function cleanAdv(a = {}) {
  const seen = new Set();
  const svgs = (Array.isArray(a?.svgs) ? a.svgs : []).map(x => ({
    name: String(x?.name ?? "").trim().toLowerCase(),
    code: String(x?.code ?? "").trim().slice(0, SVG_SIZE),
    file: String(x?.file ?? "").trim().slice(0, 500)
  })).filter(x => {
    if (!SVG_NAME.test(x.name) || seen.has(x.name)) return false;
    seen.add(x.name);
    return true;
  }).slice(0, SVG_MAX);
  const slots = Object.fromEntries(SVG_SLOTS.map(k => [k, seen.has(String(a?.slots?.[k] ?? "")) ? String(a.slots[k]) : ""]));
  return { css: String(a?.css ?? "").slice(0, CSS_SIZE), svgs, slots };
}

/** Un SVG de la bibliothèque → valeur CSS url(...) (code collé ou fichier), "" s'il est vide. */
function svgUrl(x) {
  if (x.code.includes("<svg")) return `url("data:image/svg+xml,${encodeURIComponent(x.code)}")`;
  if (!x.file) return "";
  const path = /^(https?:|data:|\/)/i.test(x.file) ? x.file : `/${x.file}`;
  return `url("${path.replace(/["\\\n\r]/g, "")}")`;
}

/**
 * Le CSS du MJ, limité au carrousel et à son info-bulle ; null s'il ne se lit pas.
 * Il est relu par le navigateur règle par règle : les animations (@keyframes)
 * et polices (@font-face) restent au premier niveau, tout le reste est
 * remis dans le carrousel — rien ne peut en sortir.
 */
function scopedCSS(css) {
  if (!css.trim()) return "";
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    const top = [], inner = [];
    for (const r of sheet.cssRules) {
      if (r instanceof CSSKeyframesRule || r instanceof CSSFontFaceRule) top.push(r.cssText);
      else inner.push(r.cssText);
    }
    if (!top.length && !inner.length) return null;
    let scoped = "";
    if (inner.length) {
      const check = new CSSStyleSheet();
      check.replaceSync(`${SCOPE} {\n${inner.join("\n")}\n}`);
      if (check.cssRules.length !== 1) return null;
      scoped = check.cssRules[0].cssText;
    }
    return `${top.join("\n")}\n${scoped}`;
  } catch (_e) { return null; }
}

/** Le CSS libre du MJ est-il accepté (il ne sort pas du carrousel) ? */
export function carouselCssOk(css) { return scopedCSS(String(css ?? "")) !== null;
}

/** Injecte (ou retire) le thème propre du carrousel. */
export function applyCarouselTheme(theme) {
  document.getElementById(STYLE_ID)?.remove();
  const t = cleanTheme(theme);
  if (t.mode !== "own") return;
  const block = (scheme) => {
    const vars = Object.entries(t[scheme]).filter(([, v]) => v).map(([k, v]) => `  ${CSS_VAR[k]}: ${v};`);
    vars.push(`  --car-radius: ${t.radius}px;`, `  --car-bw: ${t.border}px;`);
    return `#sbe-carousel.theme-${scheme} .sbe-car-wrap {\n${vars.join("\n")}\n}\n`;
  };
  const style = document.createElement("style");
  style.id = STYLE_ID;
  /* Mode avancé : les SVG en variables, leurs emplacements, puis le CSS du MJ. */
  const adv = t.adv;
  const lib = adv.svgs.map(x => [x.name, svgUrl(x)]).filter(([, u]) => u);
  const has = new Set(lib.map(([n]) => n));
  const vars = [...lib.map(([n, u]) => `  --svg-${n}: ${u};`),
    ...SVG_SLOTS.filter(k => has.has(adv.slots[k])).map(k => `  --car-svg-${k}: var(--svg-${adv.slots[k]});`)];
  /* Une icône en SVG remplace l'icône choisie (vaincu) ou s'ajoute au texte (« Suivant »). */
  const icons = [["defeat", ".sbe-car-defmark"], ["next", ".sbe-car-nexttag"]].filter(([k]) => has.has(adv.slots[k]))
    .map(([k, sel]) => `${SCOPE} ${sel} > .sbe-car-svgic { display: inline-block; }\n${k === "defeat" ? `${SCOPE} ${sel} > :not(.sbe-car-svgic) { display: none; }\n` : ""}`).join("");
  const advCss = (vars.length ? `${SCOPE} {\n${vars.join("\n")}\n}\n` : "") + icons + (scopedCSS(adv.css) ?? "");
  style.textContent = `/* SBE — thème propre du carrousel */\n${block("dark")}${block("light")}${advCss}`;
  document.head.appendChild(style);
}
