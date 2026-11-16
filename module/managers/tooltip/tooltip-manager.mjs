/**
 * SBE — Manager de TOOLTIPS
 *
 * Habille les info-bulles configurées des éléments (contenu défini
 * dans le crayon → onglet Info-bulle). Le manager pilote le LOOK
 * global de la bulle : fond, texte, cadre, coins, ombre, police,
 * image/SVG de fond, CSS avancé (@bulle).
 *
 * Ciblage : UNIQUEMENT les bulles SBE (#tooltip contenant .sbe-tt) —
 * les tooltips natifs de Foundry ne sont jamais touchés.
 */

import { TemplateTheme } from "../theme/template-theme.mjs";
import { colorPair } from "../chat/chat-cards.mjs";
import { ThemeLibrary } from "../theme/theme-library.mjs";

/* La bulle Foundry qui contient NOTRE contenu — et l'aperçu de la
 * fenêtre de configuration (même feuille de style, rendu identique). */
const BULLE = `:is(#tooltip:has(.sbe-tt), .sbe-tt-preview)`;

export class TooltipManager {

  static DEFAULTS = {
    schemaVersion: 2,
    /* COULEURS : une paire { dark, light } par couleur — Foundry a un
       thème sombre et un thème clair. Une moitié vide reprend l'autre ;
       les deux vides = Foundry décide. (Ancien format « une chaîne »
       accepté : il vaut pour les deux thèmes.) */
    bg: { dark: "", light: "" },            /* fond */
    text: { dark: "", light: "" },          /* couleur du texte par défaut */
    borderColor: { dark: "", light: "" },
    borderWidth: 1,
    radius: 6,
    padding: 0,        /* 0 = padding Foundry */
    font: "",
    size: 0,           /* 0 = taille Foundry */
    maxWidth: 0,       /* 0 = largeur Foundry */
    shadow: "",        /* "" = ombre Foundry ; "none" ; "soft" ; "strong" */
    bgPath: "",        /* image/SVG de fond par chemin */
    bgCode: "",        /* code SVG collé (assaini) */
    customCss: ""
  };

  /** Config d'un thème (par défaut : le thème actif de ce client). */
  static getConfig(themeId = null) {
    const stored = ThemeLibrary.raw("tooltip", themeId ?? ThemeLibrary.activeId()) ?? {};
    return foundry.utils.mergeObject(
      foundry.utils.deepClone(this.DEFAULTS), stored, { inplace: false });
  }

  /** Construit la feuille CSS de la bulle depuis une config. */
  static buildCss(cfg) {
    const c = cfg ?? this.getConfig();
    const rules = [];
    /* Paires de couleurs → variables posées sur les deux thèmes ; la
       plus proche (page, fenêtre, aperçu) gagne. */
    const dark = [], light = [];
    const clean = (v) => String(v ?? "").replace(/[;{}<>]/g, "").trim();
    const col = (name, v) => {
      const p = colorPair(v);
      if (!p.dark && !p.light) return "";
      dark.push(`--sbe-tt-${name}: ${clean(p.dark || p.light)}`);
      light.push(`--sbe-tt-${name}: ${clean(p.light || p.dark)}`);
      return `var(--sbe-tt-${name})`;
    };
    /* Couleur non choisie = celle du THÈME (palette SBE) : les bulles
       suivent le thème actif, Sombre, Clair ou un thème nommé. */
    const bg = col("bg", c.bg) || "var(--sbe-ctx-bg, var(--sbe-surf-2))";
    const text = col("text", c.text) || "var(--sbe-text)";
    const border = col("border", c.borderColor) || "var(--sbe-surf-4)";
    rules.push(`background: ${bg} !important`);
    rules.push(`color: ${text} !important`);
    rules.push(`border: ${Number(c.borderWidth || 1)}px solid ${border} !important`);
    if (c.radius !== "" && c.radius != null) rules.push(`border-radius: ${Number(c.radius)}px !important`);
    if (Number(c.padding) > 0) rules.push(`padding: ${Number(c.padding)}px !important`);
    if (c.font) rules.push(`font-family: '${String(c.font).replace(/['"<>()]/g, "")}' !important`);
    if (Number(c.size) > 0) rules.push(`font-size: ${Number(c.size)}px !important`);
    if (Number(c.maxWidth) > 0) rules.push(`max-width: ${Number(c.maxWidth)}px !important`);
    if (c.shadow === "none") rules.push(`box-shadow: none !important`);
    else if (c.shadow === "soft") rules.push(`box-shadow: 0 3px 10px rgba(0,0,0,0.35) !important`);
    else if (c.shadow === "strong") rules.push(`box-shadow: 0 6px 22px rgba(0,0,0,0.6) !important`);

    /* Fond image/SVG : code collé (assaini) prioritaire sur le chemin. */
    let bgImg = "";
    const svg = TemplateTheme.sanitizeSvg(c.bgCode ?? "");
    if (svg) bgImg = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    else if (c.bgPath) bgImg = `url('${String(c.bgPath).replace(/['"<>()]/g, "")}')`;
    if (bgImg) {
      rules.push(`background-image: ${bgImg} !important`);
      rules.push(`background-size: cover !important`);
      rules.push(`background-position: center !important`);
    }

    let css = "";
    if (dark.length) css += `:root, .theme-dark {\n  ${dark.join(";\n  ")};\n}\n.theme-light {\n  ${light.join(";\n  ")};\n}\n`;
    if (rules.length) css += `${BULLE} {\n  ${rules.join(";\n  ")};\n}\n`;
    /* Raccourci : « @bulle » = le sélecteur de la bulle SBE. */
    /* Raccourci du CSS avancé : « @bulle » (FR) et « @tooltip » (EN)
       désignent la même bulle — les deux acceptés partout. */
    const custom = String(c.customCss ?? "").trim().replace(/@(?:bulle|tooltip)\b/g, BULLE);
    if (custom) css += `\n/* --- CSS avancé des tooltips --- */\n${custom}\n`;
    return css;
  }

  /** Injecte (ou remplace) la feuille de style de la bulle. */
  static apply(cfg = null) {
    const id = "sbe-tooltip-css";
    document.getElementById(id)?.remove();
    const css = this.buildCss(cfg);
    if (!css) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
  }
}
