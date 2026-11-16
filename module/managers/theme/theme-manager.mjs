/**
 * SBE — Manager de thème (runtime)
 *
 * Le MJ repeint tout le système et l'interface Foundry sans coder :
 * - la palette centrale = 28 jetons CSS (--sbe-*) déclinés SOMBRE et
 *   CLAIR (styles/theme/dark.css & light.css, mappés vers les variables
 *   natives de Foundry par styles/theme/foundry-ui.css) ;
 * - polices : principale et titres, avec styles (graisse, italique,
 *   souligné, espacement, casse) et taille de base ;
 * - interface : comportement de la barre de titre des fenêtres ;
 * - CSS libre avancé.
 *
 * Stockage : un unique setting monde (objet versionné). Seuls les
 * ÉCARTS aux défauts sont stockés pour la palette → les évolutions
 * futures des défauts du système restent héritées.
 * Injection : balise <style> replacée en fin de <head> à chaque
 * application → surcharge les feuilles du système sans les modifier.
 * Le mode sombre/clair actif suit la préférence NATIVE de chaque
 * utilisateur (classes theme-dark / theme-light de Foundry).
 */

import { ThemeLibrary } from "./theme-library.mjs";
import { SYSTEM_ID, getFontFamilies } from "../../helpers/constants.mjs";
export { isImagePath } from "../../helpers/constants.mjs";
import { TemplateTheme } from "./template-theme.mjs";
import { sanitizeHtml } from "../../builder/element-renderer.mjs";
import { UiSound, uiSoundOf, sheetSoundsOf } from "../media/ui-sound.mjs";

const STYLE_ID = "sbe-theme-overrides";

/* ------------------------------------------------------------ */
/* PALETTE PAR DÉFAUT — miroir exact de dark.css / light.css     */
/* Toute modification des CSS doit être répercutée ici pour que  */
/* « Réinitialiser » revienne au bon thème.                      */
/* ------------------------------------------------------------ */

export const THEME_PALETTE_DEFAULTS = {
  dark: {
    "sbe-surf-1": "#141519",
    "sbe-surf-2": "#1c1f24",
    "sbe-surf-3": "#25282d",
    "sbe-surf-4": "#3b3f45",
    "sbe-surf-5": "#4a4e55",
    "sbe-surf-6": "#5e636a",
    "sbe-raised": "#2f3338",
    "sbe-ctx-bg": "#25282d",
    "sbe-tone-1": "#e7e4dd",
    "sbe-tone-2": "#d0cdc6",
    "sbe-tone-3": "#b8b4ab",
    "sbe-tone-4": "#9c988f",
    "sbe-tone-5": "#7e7a72",
    "sbe-tone-6": "#6a665f",
    "sbe-text": "#e7e4dd",
    "sbe-text-2": "#b8b4ab",
    "sbe-text-dim": "#9c988f",
    "sbe-text-strong": "#f3f0e9",
    "sbe-text-max": "#ffffff",
    "sbe-accent": "#b5471f",
    "sbe-accent-dark": "#8a3517",
    "sbe-accent-light": "#d2622c",
    "sbe-accent-text": "#d2622c",
    "sbe-content-link": "#e7e4dd",
    "sbe-scrollbar": "#8a3517",
    "sbe-scroll-hover": "#4a4e55",
    "sbe-fail": "#8b0000",
    "sbe-ok": "#5a8f4e",
    "sbe-warn": "#c9a227"
  },
  light: {
    "sbe-surf-1": "#eef0f2",
    "sbe-surf-2": "#d8dbde",
    "sbe-surf-3": "#c7cace",
    "sbe-surf-4": "#aab0b6",
    "sbe-surf-5": "#888d93",
    "sbe-surf-6": "#6c7177",
    "sbe-raised": "#bdc1c6",
    "sbe-ctx-bg": "#d8dbde",
    "sbe-tone-1": "#e6e8ea",
    "sbe-tone-2": "#d8dbde",
    "sbe-tone-3": "#c7cace",
    "sbe-tone-4": "#aab0b6",
    "sbe-tone-5": "#888d93",
    "sbe-tone-6": "#6c7177",
    "sbe-text": "#1e2024",
    "sbe-text-2": "#3a3d42",
    "sbe-text-dim": "#5a5d63",
    "sbe-text-strong": "#101216",
    "sbe-text-max": "#000000",
    "sbe-accent": "#b5471f",
    "sbe-accent-dark": "#a13c17",
    "sbe-accent-light": "#c95a28",
    "sbe-accent-text": "#b5471f",
    "sbe-content-link": "#1e2024",
    "sbe-scrollbar": "#8a3517",
    "sbe-scroll-hover": "#7c8087",
    "sbe-fail": "#8b0000",
    "sbe-ok": "#37602f",
    "sbe-warn": "#7a5d0c"
  }
};

/* ------------------------------------------------------------ */
/* INTERFACE DE FOUNDRY (barre latérale, barre de macros, icônes) */
/* Facultatif : une couleur non choisie = l'apparence de Foundry. */
/* Les défauts ci-dessous ne servent qu'à l'aperçu et aux pastilles. */
/* ------------------------------------------------------------ */
export const UI_TOKENS = ["sidebar", "panel", "iconBg", "iconBorder", "icon", "iconActive"];
export const UI_FOUNDRY_LOOK = {
  dark: { sidebar: "#0b0a13", panel: "#0b0a13", iconBg: "#0b0a13", iconBorder: "#302831", icon: "#efe6d8", iconActive: "#c9593f" },
  light: { sidebar: "#e8e1d3", panel: "#0b0a13", iconBg: "#f2f2f2", iconBorder: "#ffffff", icon: "#222222", iconActive: "#c9593f" }
};

/* Regroupement des jetons pour l'affichage (libellés i18n). */
export const THEME_GROUPS = [
  { key: "surfaces", tokens: ["sbe-surf-1", "sbe-surf-2", "sbe-surf-3", "sbe-surf-4", "sbe-surf-5", "sbe-surf-6", "sbe-raised", "sbe-ctx-bg"] },
  { key: "tones", tokens: ["sbe-tone-1", "sbe-tone-2", "sbe-tone-3", "sbe-tone-4", "sbe-tone-5", "sbe-tone-6"] },
  { key: "texts", tokens: ["sbe-text", "sbe-text-2", "sbe-text-dim", "sbe-text-strong", "sbe-text-max"] },
  { key: "accents", tokens: ["sbe-accent", "sbe-accent-dark", "sbe-accent-light", "sbe-accent-text", "sbe-content-link", "sbe-scrollbar", "sbe-scroll-hover"] },
  { key: "states", tokens: ["sbe-fail", "sbe-ok", "sbe-warn"] }
];

export class ThemeManager {

  /** Configuration par défaut complète (versionnée dès le premier jour). */
  static DEFAULTS = {
    schemaVersion: 1,
    palette: { dark: {}, light: {} },          /* diff-only vs THEME_PALETTE_DEFAULTS */
    fonts: {
      primary: { family: "", weight: "400", italic: false, underline: false },
      heading: { family: "", bold: false, italic: false, underline: false, spacing: 0, caseMode: "none" },
      baseSize: 100
    },
    interface: {
      titlebar: "visible",                     /* visible | hover | hidden */
      /* Translucidité des fenêtres : opacité (%), pleine au survol,
         portée « all » (toutes les fenêtres) ou « widgets » (petites
         fenêtres flottantes SBE, classe sbe-widget). 100 = opaque. */
      opacity: 100, opacityHover: true, opacityScope: "widgets"
    },
    dressing: {
      texture: { path: "", code: "", mode: "tile", opacity: 100 },          /* tile | cover ; code = SVG collé */
      header: { path: "", code: "", height: 120, opacity: 100, fade: true, fadeStart: 40 }
    },
    /* HTML libre (assaini — jamais de code exécutable) :
       windows = décor posé DERRIÈRE le contenu des fenêtres ;
       overlay = calque posé sur l'interface entière (#sbe-theme-overlay). */
    htmlDecor: { windows: "", overlay: "" },
    /* Interface de Foundry : { dark: {clé: "#hex"}, light: {…} } —
       une clé absente garde l'apparence de Foundry. */
    ui: { dark: {}, light: {} },
    /* Sons d'interface de TOUTES les fenêtres (onglet Médias) :
       ouverture, fermeture, changement d'onglet. Un modèle de
       personnage qui a ses propres sons garde les siens. */
    sounds: {
      open: { sound: "", volume: 80 },
      close: { sound: "", volume: 80 },
      tab: { sound: "", volume: 80 }
    },
    customCss: ""
  };

  /* -------------------------------------------- */
  /*  Configuration                               */
  /* -------------------------------------------- */

  /** Config d'un thème (par défaut : le thème actif de ce client). */
  static getConfig(themeId = null) {
    const stored = ThemeLibrary.raw("theme", themeId ?? ThemeLibrary.activeId()) ?? {};
    const cfg = foundry.utils.mergeObject(
      foundry.utils.deepClone(this.DEFAULTS), stored, { inplace: false }
    );
    return this._migrate(cfg);
  }

  /** Migration de schéma (compatibilité descendante). */
  static _migrate(cfg) {
    if ((cfg.schemaVersion ?? 0) >= 1) return cfg;
    cfg.schemaVersion = 1;
    return cfg;
  }

  /** Palette effective = défauts + surcharges du MJ. */
  static getPalette(config = null) {
    const cfg = config ?? this.getConfig();
    const out = { dark: {}, light: {} };
    for (const mode of ["dark", "light"]) {
      out[mode] = foundry.utils.mergeObject(
        foundry.utils.deepClone(THEME_PALETTE_DEFAULTS[mode]),
        cfg.palette?.[mode] ?? {},
        { inplace: false }
      );
    }
    return out;
  }

  /** Liste des polices disponibles dans Foundry (natives + ajoutées). */
  static getFontFamilies() {
    return getFontFamilies();
  }

  /* -------------------------------------------- */
  /*  Construction + injection du CSS             */
  /* -------------------------------------------- */

  /** Construit la feuille de surcharge complète depuis une config. */
  static buildCss(config) {
    const palette = this.getPalette(config);
    const block = (selector, vars) =>
      `${selector} {\n` +
      Object.entries(vars).map(([k, v]) => `  --${k}: ${v};`).join("\n") +
      `\n}\n`;

    let css = "/* SBE — surcharges de thème (réglages MJ) */\n";
    css += block(":root, html, body, .theme-dark, body.theme-dark, .application.theme-dark", palette.dark);
    css += block("html.theme-light, body.theme-light, .theme-light, .application.theme-light", palette.light);
    css += this._buildUiCss(config.ui);
    css += this._buildFontCss(config.fonts);
    css += this._buildDressingCss(config.dressing);
    css += this._buildOpacityCss(config.interface);

    /* Raccourcis du CSS avancé : « @fenetre » = les fenêtres habillées,
       « @overlay » = le calque HTML d'interface. */
    const custom = String(config.customCss ?? "").trim()
      .replace(/@(?:fenetres?|windows?)\b/g, ".application:not(.sbe-window):not(.faded-ui)")
      .replace(/@overlay\b/g, "#sbe-theme-overlay");
    if (custom) css += `\n/* --- CSS avancé du MJ --- */\n${custom}\n`;
    return css;
  }

  /**
   * Interface de Foundry : seulement les couleurs choisies par le MJ.
   * Foundry pose ses variables sur les éléments eux-mêmes → !important.
   */
  static _buildUiCss(ui) {
    const HEX = /^#[0-9a-f]{6}$/i;
    const mix = (c, w) => `color-mix(in srgb, ${c}, white ${w}%)`;
    const alpha = (c, a) => `color-mix(in srgb, ${c} ${a}%, transparent)`;
    let css = "";
    for (const mode of ["dark", "light"]) {
      const u = {};
      for (const k of UI_TOKENS) {
        const v = String(ui?.[mode]?.[k] ?? "").trim();
        if (HEX.test(v)) u[k] = v;
      }
      if (!Object.keys(u).length) continue;
      /* Foundry pose la classe de thème sur des éléments différents
         selon les versions (body, #interface, la barre elle-même) :
         on vise la classe où qu'elle soit. */
      /* …sauf les fiches qui ont LEUR thème (.sbe-window). */
      const T = `.theme-${mode}:not(.sbe-window):not(.sbe-window *)`;
      const decl = (pairs) => pairs.filter(([, v]) => v).map(([n, v]) => `  ${n}: ${v} !important;`).join("\n");
      css += `\n/* --- Interface de Foundry (${mode}) --- */\n`;
      if (u.sidebar) {
        css += `${T} {\n${decl([["--sidebar-background", u.sidebar], ["--sidebar-entry-hover-bg", mix(u.sidebar, 10)]])}\n}\n`;
        css += [
          `${T} #sidebar .window-content`, `#sidebar${T} .window-content`,
          `${T} #sidebar .sidebar-tab`, `#sidebar${T} .sidebar-tab`, `${T}.sidebar-tab`,
          `${T} #sidebar .directory`, `#sidebar${T} .directory`, `${T} .sidebar-popout .window-content`
        ].join(", ") + ` {\n  background: ${u.sidebar} !important;\n  background-image: none !important;\n}\n`;
        /* Champs et boutons de la barre (recherche, « Créer un objet ») :
           Foundry les met en blanc cassé, en dur. */
        css += `${T} #sidebar, #sidebar${T}, ${T} .sidebar-popout {\n  --input-background: ${mix(u.sidebar, 6)} !important;\n}\n`;
        css += `${T} #sidebar .action-buttons button, #sidebar${T} .action-buttons button, ${T} .sidebar-popout .action-buttons button {\n  --button-background-color: ${mix(u.sidebar, 12)} !important;\n}\n`;
      }
      if (u.panel) {
        css += `${T}, ${T} .ui-control {\n${decl([
          ["--color-cool-5", u.panel], ["--color-cool-4", mix(u.panel, 15)], ["--color-cool-3", mix(u.panel, 25)],
          ["--color-cool-5-25", alpha(u.panel, 25)], ["--color-cool-5-50", alpha(u.panel, 50)],
          ["--color-cool-5-75", alpha(u.panel, 75)], ["--color-cool-5-90", alpha(u.panel, 90)]
        ])}\n}\n`;
      }
      const ctrl = decl([
        ["--control-bg-color", u.iconBg && alpha(u.iconBg, 85)],
        ["--control-hover-bg-color", u.iconBg && mix(u.iconBg, 12)],
        ["--control-active-bg-color", u.iconBg],
        ["--control-border-color", u.iconBorder],
        ["--control-hover-border-color", u.iconBorder && mix(u.iconBorder, 25)],
        ["--control-icon-color", u.icon],
        ["--control-hover-icon-color", u.icon && mix(u.icon, 50)],
        ["--control-active-icon-color", u.icon && mix(u.icon, 70)],
        ["--control-active-border-color", u.iconActive],
        ["--control-button-border-color", u.iconActive],
        ["--control-button-hover-bg-color", u.iconActive]
      ]);
      if (ctrl) css += `${T} .ui-control, .ui-control${T}, ${T} .placeable-hud {\n${ctrl}\n}\n`;
    }
    return css;
  }

  /** URL CSS d'un habillage : code SVG collé (assaini) prioritaire
      sur le chemin — même logique que le manager de tooltips. */
  static _decorImgUrl(entry) {
    const svg = TemplateTheme.sanitizeSvg(entry?.code ?? "");
    if (svg && /^<svg[\s>]/i.test(svg)) {
      return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    }
    const p = String(entry?.path ?? "").trim();
    return p ? `url("${p.replace(/"/g, "%22")}")` : null;
  }

  static _fontStack(family) {
    return `"${String(family).replace(/"/g, "")}", var(--font-primary, "Signika", sans-serif)`;
  }

  static _buildFontCss(fonts) {
    const f = foundry.utils.mergeObject(
      foundry.utils.deepClone(this.DEFAULTS.fonts), fonts ?? {}, { inplace: false }
    );
    let css = "\n/* --- Polices --- */\n";

    /* Variables (consommées par tout le CSS SBE). */
    const vars = [];
    if (f.primary.family) vars.push(`  --sbe-font-primary: ${this._fontStack(f.primary.family)};`);
    if (f.heading.family) vars.push(`  --sbe-font-heading: ${this._fontStack(f.heading.family)};`);
    else if (f.primary.family) vars.push(`  --sbe-font-heading: ${this._fontStack(f.primary.family)};`);
    if (vars.length) css += `:root {\n${vars.join("\n")}\n}\n`;

    /* Taille de base (les tailles rem de Foundry en découlent). */
    const size = Number(f.baseSize) || 100;
    if (size !== 100) css += `html { font-size: ${size}%; }\n`;

    /* Police principale : corps + fenêtres. */
    const primaryRules = [];
    if (f.primary.family) primaryRules.push(`font-family: var(--sbe-font-primary);`);
    if (f.primary.weight && f.primary.weight !== "400") primaryRules.push(`font-weight: ${f.primary.weight};`);
    if (f.primary.italic) primaryRules.push(`font-style: italic;`);
    if (f.primary.underline) primaryRules.push(`text-decoration: underline;`);
    if (primaryRules.length) {
      css += `body, .application {\n  ${primaryRules.join("\n  ")}\n}\n`;
    }

    /* Police des titres : en-têtes + titres de fenêtres. */
    const headingRules = [];
    if (f.heading.family || f.primary.family) headingRules.push(`font-family: var(--sbe-font-heading);`);
    if (f.heading.bold) headingRules.push(`font-weight: 700;`);
    if (f.heading.italic) headingRules.push(`font-style: italic;`);
    if (f.heading.underline) headingRules.push(`text-decoration: underline;`);
    const spacing = Number(f.heading.spacing) || 0;
    if (spacing > 0) headingRules.push(`letter-spacing: ${spacing}px;`);
    if (f.heading.caseMode === "uppercase") headingRules.push(`text-transform: uppercase;`);
    else if (f.heading.caseMode === "small-caps") headingRules.push(`font-variant: small-caps;`);
    if (headingRules.length) {
      css += `.application h1, .application h2, .application h3, .application h4, ` +
        `.application h5, .application h6, .window-header .window-title {\n  ${headingRules.join("\n  ")}\n}\n`;
    }
    return css;
  }

  /**
   * Interface : le masquage du cadre de la barre de titre est défini
   * statiquement en FIN de foundry-ui.css (donc toujours gagnant sur
   * les règles de barre de cette même feuille — même spécificité,
   * même !important, ordre décisif) et simplement activé/désactivé
   * par une classe sur <body>. "hover" = ancien mode, traité pareil.
   */
  static _applyInterface(iface) {
    const mode = iface?.titlebar ?? "visible";
    document.body.classList.toggle(
      "sbe-titlebar-hidden", mode === "hidden" || mode === "hover"
    );
  }

  /** Translucidité des fenêtres (voir DEFAULTS.interface). */
  static _buildOpacityCss(iface) {
    const pct = Math.max(20, Math.min(100, Number(iface?.opacity ?? 100) || 100));
    if (pct >= 100) return "";
    /* Une fenêtre qui a son propre thème (modèle de personnage) n'est jamais touchée. */
    const sel = iface?.opacityScope === "all" ? ".application:not(.faded-ui):not(.sbe-window)" : ".application.sbe-widget:not(.sbe-window)";
    /* filter: opacity() plutôt que opacity : la fenêtre est estompée
       d'un bloc (Firefox laissait parfois l'intérieur plein, après un
       nouveau rendu ou un défilement). */
    let css = `\n/* --- Translucidité des fenêtres --- */\n${sel} {\n  filter: opacity(${pct}%);\n  transition: filter 150ms;\n}\n`;
    /* Notre transition (filter) REMPLACE celle de Foundry : sans ces deux
       règles, une fenêtre qui se ferme ou se réduit perdait son repli
       animé — elle tombait d'un coup à 0 de haut et restait affichée en
       trait (bordure + ombre) le temps que Foundry abandonne l'attente. */
    css += `${sel}.minimizing {\n  transition: filter 150ms, max-height 0.25s ease-out, max-width 0.25s ease-out;\n}\n`;
    css += `${sel}.maximizing {\n  transition: filter 150ms, max-height 0.25s ease-in, max-width 0.25s ease-in;\n}\n`;
    /* Pleine au survol, ou pendant qu'on tape dans un de ses champs —
       pas après un simple clic (le focus resterait et la garderait pleine). */
    /* Pleine sous le curseur (classe posée par _watchHover, plus fiable
       que :hover qui peut rester « collé » après un déplacement ou un
       nouveau rendu), ou pendant qu'on tape dans un de ses champs. */
    /* Firefox n'applique pas l'opacité d'une fenêtre à ce qui porte un
       flou d'arrière-plan (backdrop-filter, utilisé par Foundry) : le
       contenu restait plein. Sans flou, tout s'estompe partout. */
    css += `${sel}, ${sel} * {\n  backdrop-filter: none !important;\n}\n`;
    if (iface?.opacityHover !== false) css += `${sel}.sbe-hover, ${sel}:has(:is(input, textarea, select):focus) {\n  filter: none;\n}\n`;
    return css;
  }

  /** Pose « sbe-hover » sur la seule fenêtre sous le curseur ; retirée dès qu'il la quitte ou sort de l'écran. */
  static _watchHover() {
    if (this._hoverWatched) return;
    this._hoverWatched = true;
    let frame = 0, x = -1, y = -1, last = null;
    const update = () => {
      frame = 0;
      const top = x < 0 ? null : document.elementFromPoint(x, y)?.closest?.(".application");
      /* Même fenêtre qu'à l'image d'avant : rien à faire (la souris bouge
         souvent sur la scène, sans fenêtre). */
      if (top === last && (!top || top.classList.contains("sbe-hover"))) return;
      last = top;
      for (const el of document.querySelectorAll(".application.sbe-hover")) if (el !== top) el.classList.remove("sbe-hover");
      top?.classList.add("sbe-hover");
    };
    const at = (nx, ny) => { x = nx; y = ny; frame ||= requestAnimationFrame(update); };
    document.addEventListener("pointermove", (e) => at(e.clientX, e.clientY), { passive: true, capture: true });
    document.addEventListener("pointerdown", (e) => at(e.clientX, e.clientY), { passive: true, capture: true });
    document.documentElement.addEventListener("pointerleave", () => at(-1, -1));
    window.addEventListener("blur", () => at(-1, -1));
  }

  /**
   * Habillage des fenêtres : texture de fond et image d'en-tête.
   *
   * Technique : le contenu de fenêtre est rendu transparent et les
   * images vivent dans des pseudo-éléments EN DESSOUS du contenu
   * (contexte d'empilement local + z-index négatif), donc jamais
   * par-dessus le texte. Le fondu de l'en-tête est un mask-image
   * en dégradé vertical. Même périmètre d'exclusion que foundry-ui.css.
   */
  static _buildDressingCss(dressing) {
    const d = foundry.utils.mergeObject(
      foundry.utils.deepClone(this.DEFAULTS.dressing), dressing ?? {}, { inplace: false }
    );
    const textureUrl = this._decorImgUrl(d.texture);
    const headerUrl = this._decorImgUrl(d.header);
    const texture = textureUrl ? d.texture : null;
    const header = headerUrl ? d.header : null;
    if (!texture && !header) return "";

    const APP = ".application:not(.sbe-window):not(.faded-ui)";
    const clamp01 = (v) => Math.clamp(Number(v) || 0, 0, 100) / 100;

    let css = "\n/* --- Habillage des fenêtres --- */\n";

    /* Le fond opaque du contenu laisse place aux décors situés derrière.
       Les pseudo-éléments sont enfants de la fenêtre (.application, qui
       possède toujours un z-index inline → contexte d'empilement) : avec
       z-index -1, ils se peignent AU-DESSUS du fond de la fenêtre mais
       SOUS la barre de titre et le contenu — jamais par-dessus le texte. */
    css += `${APP} .window-content {\n  background: transparent !important;\n}\n`;

    if (texture) {
      const repeat = texture.mode === "cover"
        ? "background-repeat: no-repeat;\n  background-size: cover;\n  background-position: center;"
        : "background-repeat: repeat;\n  background-size: auto;";
      css += `${APP}::before {\n` +
        `  content: "";\n  position: absolute;\n  inset: 0;\n  z-index: -1;\n` +
        `  pointer-events: none;\n  border-radius: inherit;\n` +
        `  background-image: ${textureUrl};\n  ${repeat}\n` +
        `  opacity: ${clamp01(texture.opacity).toFixed(2)};\n}\n`;
    }

    if (header) {
      const height = Math.clamp(Number(header.height) || 120, 20, 600);
      const fadeStart = Math.clamp(Number(header.fadeStart) || 40, 0, 95);
      const mask = header.fade
        ? `  -webkit-mask-image: linear-gradient(to bottom, black ${fadeStart}%, transparent 100%);\n` +
          `  mask-image: linear-gradient(to bottom, black ${fadeStart}%, transparent 100%);\n`
        : "";
      css += `${APP}::after {\n` +
        `  content: "";\n  position: absolute;\n  top: 0;\n  left: 0;\n  right: 0;\n` +
        `  height: ${height}px;\n  z-index: -1;\n  pointer-events: none;\n` +
        `  border-radius: inherit;\n` +
        `  background-image: ${headerUrl};\n` +
        `  background-repeat: no-repeat;\n  background-size: cover;\n` +
        `  background-position: top center;\n` +
        `  opacity: ${clamp01(header.opacity).toFixed(2)};\n${mask}}\n`;
      /* L'en-tête décore aussi la zone de la barre de titre. */
      css += `${APP} > .window-header {\n  background: transparent;\n  border-bottom: none;\n}\n`;
    }

    return css;
  }

  /* -------------------------------------------- */
  /*  Décors HTML (fenêtres + overlay)            */
  /* -------------------------------------------- */

  /** HTML assaini du décor de fenêtres actuellement actif. */
  static _decorHtml = "";
  static _hooked = false;

  /** Pose (ou retire) le décor HTML derrière le contenu d'une fenêtre.
      Même périmètre que l'habillage image : fenêtres non SBE. */
  static _decorateWindow(el) {
    if (!el || !el.classList?.contains("application")) return;
    el.querySelectorAll(":scope > .sbe-theme-decor").forEach(n => n.remove());
    if (!this._decorHtml) return;
    if (el.classList.contains("sbe-window") || el.classList.contains("faded-ui")) return;
    const div = document.createElement("div");
    div.className = "sbe-theme-decor";
    div.innerHTML = this._decorHtml;
    el.appendChild(div);
  }

  /** Enregistre (une seule fois) le hook qui décore chaque fenêtre. */
  static _ensureHooks() {
    if (this._hooked) return;
    this._hooked = true;
    Hooks.on("renderApplicationV2", (app) => {
      try { this._decorateWindow(app.element); }
      catch (err) { console.warn("SBE | Thème : décor de fenêtre", err); }
    });
  }

  /** Calque HTML posé sur l'interface entière (assaini). */
  static _applyOverlay(html) {
    document.getElementById("sbe-theme-overlay")?.remove();
    const clean = sanitizeHtml(html ?? "").trim();
    if (!clean) return;
    const div = document.createElement("div");
    div.id = "sbe-theme-overlay";
    div.innerHTML = clean;
    document.body.appendChild(div);
  }

  /* -------------------------------------------- */
  /*  Sons des fenêtres (onglet Médias)           */
  /* -------------------------------------------- */

  static _soundsHooked = false;

  /** Les sons réglés (défauts compris). */
  static sounds() {
    const s = this.getConfig().sounds ?? {};
    return { open: uiSoundOf(s.open), close: uiSoundOf(s.close), tab: uiSoundOf(s.tab) };
  }

  /** Une vraie FENÊTRE (cadre, barre de titre) — pas la barre latérale,
      la barre de macros, le HUD ou le chat. */
  static _isWindow(app) {
    try { return !!app?.hasFrame && !!app.element?.classList?.contains("application"); }
    catch (_e) { return false; }
  }

  /** Une fiche dont le MODÈLE a ses propres sons : ceux-ci priment. */
  static _ownSounds(app, which) {
    const d = app?.document;
    const tpl = d?.type === "personnage" ? d.system?.template : (d?.type === "template" && d.documentName === "Actor" ? d : null);
    if (!tpl) return false;
    return !!sheetSoundsOf(tpl)[which]?.sound;
  }

  static _hookSounds() {
    if (this._soundsHooked) return;
    this._soundsHooked = true;
    Hooks.on("renderApplicationV2", (app, _el, _ctx, options) => {
      if (!options?.isFirstRender || !this._isWindow(app) || this._ownSounds(app, "open")) return;
      UiSound.play(this.sounds().open);
    });
    Hooks.on("closeApplicationV2", (app) => {
      if (!this._isWindow(app) || this._ownSounds(app, "close")) return;
      UiSound.play(this.sounds().close);
    });
    /* Changement d'onglet dans n'importe quelle fenêtre. Les onglets
       des fiches SBE passent par leur propre son (élément Onglet),
       puis par celui-ci s'ils n'en ont pas. */
    document.addEventListener("click", (ev) => {
      const t = ev.target?.closest?.(".application [data-tab]");
      if (!t || t.dataset.action === "switchNavTab") return;
      if (!t.closest("nav, .tabs, [role=tablist]")) return;
      if (t.classList.contains("active") || t.getAttribute("aria-selected") === "true") return;
      UiSound.play(this.sounds().tab, "theme-tab");
    }, true);
  }

  /** (Ré)injecte la feuille de surcharge et applique l'interface. */
  static apply(config = null) {
    try {
      const cfg = config ?? this.getConfig();
      const css = this.buildCss(cfg);
      let tag = document.getElementById(STYLE_ID);
      if (!tag) {
        tag = document.createElement("style");
        tag.id = STYLE_ID;
      }
      /* Toujours replacée en fin de <head> pour rester prioritaire. */
      document.head.appendChild(tag);
      tag.textContent = css;
      this._applyInterface(cfg.interface);
      this._watchHover();

      /* Décors HTML : fenêtres déjà ouvertes + toutes les futures. */
      this._ensureHooks();
      this._decorHtml = sanitizeHtml(cfg.htmlDecor?.windows ?? "").trim();
      for (const app of foundry.applications.instances.values()) {
        this._decorateWindow(app.element);
      }
      this._applyOverlay(cfg.htmlDecor?.overlay ?? "");
      this._hookSounds();
    } catch (err) {
      console.warn("SBE | Thème : échec d'injection", err);
    }
  }

  /* -------------------------------------------- */
  /*  Sauvegarde                                  */
  /* -------------------------------------------- */

  /**
   * Réduit une palette complète au diff vs défauts, puis enregistre
   * la configuration entière (l'onChange du setting ré-applique).
   */
  static async save(config, themeId = null) {
    /* Thème NOMMÉ : palette complète, une seule (miroir). */
    if (themeId && !ThemeLibrary.isBuiltin(themeId)) {
      const full = foundry.utils.deepClone(config);
      full.palette = this.getPalette(config);
      full.schemaVersion = this.DEFAULTS.schemaVersion;
      await ThemeLibrary.write("theme", themeId, full);
      return;
    }
    const diff = { dark: {}, light: {} };
    for (const mode of ["dark", "light"]) {
      for (const [token, value] of Object.entries(config.palette?.[mode] ?? {})) {
        const def = String(THEME_PALETTE_DEFAULTS[mode][token] ?? "").toLowerCase();
        if (value && String(value).toLowerCase() !== def) diff[mode][token] = value;
      }
    }
    const stored = foundry.utils.deepClone(config);
    stored.palette = diff;
    stored.schemaVersion = this.DEFAULTS.schemaVersion;
    await game.settings.set(SYSTEM_ID, "theme", stored);
  }

  /** Réinitialise : un thème de base revient au système ; un thème
      nommé revient à la copie du Clair de base. */
  static async reset(themeId = null) {
    if (themeId && !ThemeLibrary.isBuiltin(themeId)) {
      const full = foundry.utils.deepClone(this.DEFAULTS);
      full.palette = { dark: { ...THEME_PALETTE_DEFAULTS.light }, light: { ...THEME_PALETTE_DEFAULTS.light } };
      await ThemeLibrary.write("theme", themeId, full);
      return;
    }
    await game.settings.set(SYSTEM_ID, "theme", foundry.utils.deepClone(this.DEFAULTS));
  }
}
