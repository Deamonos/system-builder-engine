/**
 * SBE — Thème PAR MODÈLE de personnage (runtime)
 *
 * Reprise du manager de thème général, mais exclusivement pour UN
 * modèle de fiche de personnage : l'utilisateur peut donner à ses
 * fiches une apparence différente du reste des fenêtres.
 *
 * Principe :
 * - `useGlobal: true` (défaut) → la fiche suit le thème général SBE ;
 * - `useGlobal: false` → la fiche porte .sbe-window (exclue de la
 *   recoloration générale, base = apparence NATIVE de Foundry,
 *   neutralisée dans item.css) + une classe dédiée
 *   .sbe-tpltheme-<idModèle> ciblée par une feuille <style> injectée
 *   qui ne contient QUE les écarts choisis par l'utilisateur.
 *
 * Stockage : system.theme sur le document du modèle (diff-only pour
 * la palette, comme le thème général). S'applique au modèle ET à
 * toutes ses fiches de personnage, sur tous les clients (hook
 * updateActor).
 */

import { isImagePath } from "../../helpers/constants.mjs";

/* ------------------------------------------------------------ */
/* Palette NATIVE par défaut (base quand le thème général est    */
/* décoché) — miroir hex du bloc de neutralisation d'item.css.   */
/* Les couleurs enregistrées ne stockent que les écarts à ceci.  */
/* ------------------------------------------------------------ */

export const TPL_THEME_PALETTE_DEFAULTS = {
  dark: {
    "sbe-surf-1": "#1f1f1f",
    "sbe-surf-2": "#2a2a2a",
    "sbe-surf-3": "#333333",
    "sbe-surf-4": "#4b4b4b",
    "sbe-surf-5": "#5a5a5a",
    "sbe-surf-6": "#6a6a6a",
    "sbe-raised": "#3d3d3d",
    "sbe-ctx-bg": "#2a2a2a",
    "sbe-tone-1": "#eeeeee",
    "sbe-tone-2": "#dddddd",
    "sbe-tone-3": "#bbbbbb",
    "sbe-tone-4": "#999999",
    "sbe-tone-5": "#777777",
    "sbe-tone-6": "#666666",
    "sbe-text": "#c8c8c8",
    "sbe-text-2": "#a0a0a0",
    "sbe-text-dim": "#888888",
    "sbe-text-strong": "#e0e0e0",
    "sbe-text-max": "#ffffff",
    "sbe-accent": "#7a7f85",
    "sbe-accent-dark": "#5f6368",
    "sbe-accent-light": "#9aa0a6",
    "sbe-accent-text": "#b0b4b9",
    "sbe-content-link": "#c8c8c8",
    "sbe-scrollbar": "#666666",
    "sbe-scroll-hover": "#7a7a7a",
    "sbe-fail": "#8b0000",
    "sbe-ok": "#5a8f4e",
    "sbe-warn": "#c9a227"
  },
  light: {
    "sbe-surf-1": "#e8e8e8",
    "sbe-surf-2": "#f2f2f2",
    "sbe-surf-3": "#dcdcdc",
    "sbe-surf-4": "#999999",
    "sbe-surf-5": "#888888",
    "sbe-surf-6": "#777777",
    "sbe-raised": "#d5d5d5",
    "sbe-ctx-bg": "#f0f0f0",
    "sbe-tone-1": "#1a1a1a",
    "sbe-tone-2": "#333333",
    "sbe-tone-3": "#4d4d4d",
    "sbe-tone-4": "#666666",
    "sbe-tone-5": "#808080",
    "sbe-tone-6": "#999999",
    "sbe-text": "#191813",
    "sbe-text-2": "#3a3a35",
    "sbe-text-dim": "#5c5c55",
    "sbe-text-strong": "#000000",
    "sbe-text-max": "#000000",
    "sbe-accent": "#6a6f75",
    "sbe-accent-dark": "#55585c",
    "sbe-accent-light": "#8a8f95",
    "sbe-accent-text": "#55585c",
    "sbe-content-link": "#191813",
    "sbe-scrollbar": "#999999",
    "sbe-scroll-hover": "#808080",
    "sbe-fail": "#8b0000",
    "sbe-ok": "#37602f",
    "sbe-warn": "#7a5d0c"
  }
};

/* ------------------------------------------------------------ */
/* NEUTRALISATION NATIVE (fiches .sbe-window) : les jetons --sbe-*  */
/* que nos composants consomment, aux valeurs de l'apparence de     */
/* Foundry. Posée dans la feuille INJECTÉE du modèle (et non dans   */
/* item.css) : les feuilles du système passent avant celles qu'on   */
/* injecte, et le thème général injecté recolorait sinon les fiches */
/* (son accent rouge sur une fiche « sans thème général »).          */
/* ------------------------------------------------------------ */
export const NATIVE_TOKENS = {
  dark: {
    "sbe-surf-1": "rgba(0, 0, 0, 0.35)",
    "sbe-surf-2": "transparent",
    "sbe-surf-3": "rgba(255, 255, 255, 0.05)",
    "sbe-surf-4": "#4b4b4b",
    "sbe-surf-5": "#5a5a5a",
    "sbe-surf-6": "#6a6a6a",
    "sbe-raised": "rgba(255, 255, 255, 0.10)",
    "sbe-ctx-bg": "#25282d",
    "sbe-tone-1": "#eeeeee",
    "sbe-tone-2": "#dddddd",
    "sbe-tone-3": "#bbbbbb",
    "sbe-tone-4": "#999999",
    "sbe-tone-5": "#777777",
    "sbe-tone-6": "#666666",
    "sbe-text": "#c8c8c8",
    "sbe-text-2": "#a0a0a0",
    "sbe-text-dim": "#888888",
    "sbe-text-strong": "#e0e0e0",
    "sbe-text-max": "#ffffff",
    "sbe-accent": "#7a7f85",
    "sbe-accent-dark": "#5f6368",
    "sbe-accent-light": "#9aa0a6",
    "sbe-accent-text": "#b0b4b9",
    "sbe-content-link": "#c8c8c8",
    "sbe-header-grad": "none",
    "sbe-shadow": "0 0 10px rgba(0, 0, 0, 0.5)",
    "sbe-edge-soft": "rgba(255, 255, 255, 0.08)",
    "sbe-overlay": "rgba(255, 255, 255, 0.04)",
    "sbe-overlay-2": "rgba(255, 255, 255, 0.07)"
  },
  light: {
    "sbe-surf-1": "rgba(0, 0, 0, 0.08)",
    "sbe-surf-2": "transparent",
    "sbe-surf-3": "rgba(0, 0, 0, 0.05)",
    "sbe-surf-4": "#999999",
    "sbe-surf-5": "#888888",
    "sbe-surf-6": "#777777",
    "sbe-raised": "rgba(0, 0, 0, 0.08)",
    "sbe-ctx-bg": "#f0f0f0",
    "sbe-tone-1": "#1a1a1a",
    "sbe-tone-2": "#333333",
    "sbe-tone-3": "#4d4d4d",
    "sbe-tone-4": "#666666",
    "sbe-tone-5": "#808080",
    "sbe-tone-6": "#999999",
    "sbe-text": "#191813",
    "sbe-text-2": "#3a3a35",
    "sbe-text-dim": "#5c5c55",
    "sbe-text-strong": "#000000",
    "sbe-text-max": "#000000",
    "sbe-accent": "#6a6f75",
    "sbe-accent-dark": "#55585c",
    "sbe-accent-light": "#8a8f95",
    "sbe-accent-text": "#55585c",
    "sbe-content-link": "#191813",
    "sbe-header-grad": "none",
    "sbe-shadow": "0 0 8px rgba(0, 0, 0, 0.25)",
    "sbe-edge-soft": "rgba(0, 0, 0, 0.08)",
    "sbe-overlay": "rgba(0, 0, 0, 0.03)",
    "sbe-overlay-2": "rgba(0, 0, 0, 0.06)"
  }
};

export class TemplateTheme {

  /** Configuration par défaut du thème d'un modèle. */
  static DEFAULTS = {
    useGlobal: true,
    palette: { dark: {}, light: {} },          /* diff-only vs TPL_THEME_PALETTE_DEFAULTS */
    dressing: {
      texture: { path: "", mode: "tile", opacity: 100 },
      header: { path: "", height: 120, opacity: 100, fade: true, fadeStart: 40 }
    },
    /* Décorations SVG : [{ id, source: "code"|"file", code, path,
       anchor, dx, dy, width, height, layer: "above"|"below", opacity }] */
    decorations: [],
    /* Interface : barre de titre des fenêtres de ce modèle
       ("hidden" = cadre masqué : plus de fond ni de bordure, le titre et les boutons de
       droite flottent) + taille des fiches à L'OUVERTURE (0 = auto ;
       la fenêtre reste redimensionnable, rien n'est figé). */
    interface: { titlebar: "visible", sheetW: 0, sheetH: 0, hideTitle: false, mode: "auto" },
    /* Sons de la fiche (ouverture / fermeture) — indépendants du
       thème général, comme la taille. Même ligne que les médias. */
    sounds: { open: { sound: "", volume: 80 }, close: { sound: "", volume: 80 } },
    customCss: ""
  };

  /** Gabarit d'une décoration neuve. */
  static newDecoration() {
    return {
      id: foundry.utils.randomID(),
      source: "code", code: "", path: "",
      anchor: "top-center", dx: 0, dy: 0,
      width: 200, height: 80,
      layer: "above", opacity: 100
    };
  }

  /* -------------------------------------------- */
  /*  Configuration                               */
  /* -------------------------------------------- */

  /** Config complète du modèle (défauts + stocké). */
  static getConfig(doc) {
    return foundry.utils.mergeObject(
      foundry.utils.deepClone(this.DEFAULTS),
      doc.system.theme ?? {},
      { inplace: false }
    );
  }

  /** Palette effective = défauts natifs + écarts de l'utilisateur. */
  static getPalette(cfg) {
    const out = { dark: {}, light: {} };
    for (const mode of ["dark", "light"]) {
      out[mode] = foundry.utils.mergeObject(
        foundry.utils.deepClone(TPL_THEME_PALETTE_DEFAULTS[mode]),
        cfg.palette?.[mode] ?? {},
        { inplace: false }
      );
    }
    return out;
  }

  /** Réduit une palette complète au diff vs défauts natifs. */
  static diffPalette(palette) {
    const diff = { dark: {}, light: {} };
    for (const mode of ["dark", "light"]) {
      for (const [token, value] of Object.entries(palette?.[mode] ?? {})) {
        const def = String(TPL_THEME_PALETTE_DEFAULTS[mode][token] ?? "").toLowerCase();
        if (value && String(value).toLowerCase() !== def) diff[mode][token] = value;
      }
    }
    return diff;
  }

  /* -------------------------------------------- */
  /*  Construction + injection du CSS             */
  /* -------------------------------------------- */

  static #styleId(docId) {
    return `sbe-tpltheme-css-${docId}`;
  }

  /** Classe portée par les fenêtres de ce modèle (atelier + fiches). */
  static sheetClass(docId) {
    return `sbe-tpltheme-${docId}`;
  }

  /**
   * Feuille de ce modèle : la palette native (NATIVE_TOKENS) plus les
   * écarts choisis, puis l'habillage, la barre de titre et le CSS avancé.
   */
  static buildCss(doc, cfg) {
    const cls = this.sheetClass(doc.id);
    const APP = `.application.${cls}`;
    const diff = this.diffPalette(this.getPalette(cfg));

    const block = (selector, vars) => {
      const entries = Object.entries(vars);
      if (!entries.length) return "";
      return `${selector} {\n` +
        entries.map(([k, v]) => `  --${k}: ${v};`).join("\n") +
        `\n}\n`;
    };

    let css = `/* SBE — thème du modèle « ${String(doc.name ?? "").replace(/\*\//g, "* /")} » */\n`;
    /* Palette COMPLÈTE de la fiche : neutralisation native + écarts du
       modèle, sur des sélecteurs plus forts que ceux du thème général
       (.application.theme-*) — les deux feuilles sont injectées, la
       spécificité tranche, plus l'ordre.
       - sombre : par défaut, ou corps sombre, ou fiche forcée sombre ;
       - clair  : corps clair (sauf fiche forcée sombre), ou fiche forcée
         claire (« Mode de la fiche »). */
    /* Spécificité FIXE (0,3,0) grâce à :where() : plus forte que le
       thème général, et le clair (écrit après) l'emporte sur le sombre
       quand il s'applique. Le CSS avancé (@modele) vise le même
       sélecteur, écrit plus bas : c'est lui qui a le dernier mot. */
    const W = `${APP}.sbe-window`;
    css += block(W, { ...NATIVE_TOKENS.dark, ...diff.dark });
    css += block(`${W}:where(.theme-light), :where(body.theme-light) ${W}:where(:not(.theme-dark))`, { ...NATIVE_TOKENS.light, ...diff.light });
    css += this.#buildDressingCss(APP, cfg.dressing);

    /* Cadre de la barre de titre masqué (fiches d'un modèle) : la
       barre ne réserve plus d'espace — le papier, l'habillage et les
       décorations montent jusqu'en haut de la fenêtre ; le titre (s'il
       n'est pas masqué) et les boutons flottent par-dessus, et la zone
       haute reste saisissable pour déplacer la fenêtre. Les fiches
       sont dessinées en conséquence (pince, trombone…) : ce mode-ci
       reste celui des modèles, distinct du thème général (où la barre
       garde sa place pour ne pas couvrir les onglets de Foundry). */
    if (cfg.interface?.titlebar === "hidden") {
      css += `\n/* --- Cadre de la barre de titre masqué --- */\n` +
        `${APP} > .window-header {\n` +
        `  position: absolute !important;\n` +
        `  top: 0 !important;\n  left: 0 !important;\n  right: 0 !important;\n` +
        `  z-index: 60 !important;\n` +
        `  background: none !important;\n` +
        `  border-bottom: none !important;\n` +
        `  box-shadow: none !important;\n` +
        `}\n`;
    }

    /* Raccourci : « @modele » = le sélecteur des fenêtres de CE modèle. */
    const custom = String(cfg.customCss ?? "").trim().replace(/@modele/g, W);
    if (custom) css += `\n/* --- CSS avancé du modèle --- */\n${custom}\n`;
    return css;
  }

  /** Habillage : même technique que le thème général, ciblé sur le modèle. */
  static #buildDressingCss(APP, dressing) {
    const d = foundry.utils.mergeObject(
      foundry.utils.deepClone(this.DEFAULTS.dressing), dressing ?? {}, { inplace: false }
    );
    const texture = (d.texture.path && isImagePath(d.texture.path)) ? d.texture : null;
    const header = (d.header.path && isImagePath(d.header.path)) ? d.header : null;
    if (!texture && !header) return "";

    const url = (p) => `url("${String(p).replace(/"/g, "%22")}")`;
    const clamp01 = (v) => Math.clamp(Number(v) || 0, 0, 100) / 100;

    let css = "\n/* --- Habillage du modèle --- */\n";
    css += `${APP} .window-content {\n  background: transparent !important;\n}\n`;

    if (texture) {
      const repeat = texture.mode === "cover"
        ? "background-repeat: no-repeat;\n  background-size: cover;\n  background-position: center;"
        : "background-repeat: repeat;\n  background-size: auto;";
      css += `${APP}::before {\n` +
        `  content: "";\n  position: absolute;\n  inset: 0;\n  z-index: -1;\n` +
        `  pointer-events: none;\n  border-radius: inherit;\n` +
        `  background-image: ${url(texture.path)};\n  ${repeat}\n` +
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
        `  background-image: ${url(header.path)};\n` +
        `  background-repeat: no-repeat;\n  background-size: cover;\n` +
        `  background-position: top center;\n` +
        `  opacity: ${clamp01(header.opacity).toFixed(2)};\n${mask}}\n`;
      css += `${APP} > .window-header {\n  background: transparent;\n  border-bottom: none;\n}\n`;
    }

    return css;
  }

  /**
   * (Ré)injecte la feuille du modèle — ou la retire si le modèle suit
   * le thème général. `config` permet un aperçu sans sauvegarde.
   */
  static apply(doc, config = null) {
    try {
      const cfg = config ?? this.getConfig(doc);
      const id = this.#styleId(doc.id);
      let tag = document.getElementById(id);
      if (cfg.useGlobal !== false) {
        tag?.remove();
        return;
      }
      if (!tag) {
        tag = document.createElement("style");
        tag.id = id;
      }
      /* Fin de <head> : après item.css ET après le thème général. */
      document.head.appendChild(tag);
      tag.textContent = this.buildCss(doc, cfg);
    } catch (err) {
      console.warn("SBE | Thème de modèle : échec d'injection", err);
    }
  }

  /* -------------------------------------------- */
  /*  Décorations SVG                             */
  /* -------------------------------------------- */

  /** Assainit un code SVG collé (pas de scripts ni de handlers). */
  static sanitizeSvg(code) {
    let s = String(code ?? "");
    s = s.replace(/<script[\s\S]*?<\/script\s*>/gi, "");
    s = s.replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, "");
    s = s.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "");
    s = s.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "");
    s = s.replace(/javascript:/gi, "");
    return s.trim();
  }

  /** URL CSS d'une décoration (data-URI pour le code, chemin sinon). */
  static #decoUrl(deco) {
    if (deco.source === "code") {
      const svg = this.sanitizeSvg(deco.code);
      if (!svg || !/^<svg[\s>]/i.test(svg)) return null;
      return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    }
    const p = String(deco.path ?? "").trim();
    if (!p || !isImagePath(p)) return null;
    return `url("${p.replace(/"/g, "%22")}")`;
  }

  /**
   * Pose les décorations SVG d'un modèle sur une fenêtre ouverte
   * (atelier ou fiche). Éléments DOM absolus, pointer-events none ;
   * dx/dy négatifs autorisés → une décoration peut déborder de la
   * fenêtre (ex. : pince de porte-bloc au-dessus du bord haut).
   */
  static applyDecorations(app, tplDoc, config = null) {
    const el = app.element;
    if (!el) return;
    el.querySelectorAll(":scope > .sbe-tpldeco").forEach(n => n.remove());
    if (!tplDoc) return;
    const cfg = config ?? this.getConfig(tplDoc);
    if (cfg.useGlobal !== false) return;

    for (const [i, deco] of (cfg.decorations ?? []).entries()) {
      const url = this.#decoUrl(deco);
      if (!url) continue;
      const anchor = String(deco.anchor ?? "top-center");
      const [v, h] = anchor === "center" ? ["middle", "center"] : anchor.split("-");
      const topPct = v === "top" ? "0%" : (v === "middle" ? "50%" : "100%");
      const leftPct = h === "left" ? "0%" : (h === "center" ? "50%" : "100%");
      const tx = h === "left" ? "0%" : (h === "center" ? "-50%" : "-100%");
      const ty = v === "top" ? "0%" : (v === "middle" ? "-50%" : "-100%");
      const dx = Number(deco.dx) || 0;
      const dy = Number(deco.dy) || 0;

      const below = deco.layer === "below";
      const d = document.createElement("div");
      d.className = below ? "sbe-tpldeco sbe-tpldeco--below" : "sbe-tpldeco";
      /* Numéro affiché dans le manager (« Décoration N ») → ciblable en
         CSS avancé : .sbe-tpldeco[data-deco="N"]. */
      d.dataset.deco = String(i + 1);
      d.style.left = `calc(${leftPct} + ${dx}px)`;
      d.style.top = `calc(${topPct} + ${dy}px)`;
      d.style.transform = `translate(${tx}, ${ty})`;
      d.style.width = `${Math.max(4, Number(deco.width) || 200)}px`;
      d.style.height = `${Math.max(4, Number(deco.height) || 80)}px`;
      /* « Sous le contenu » : PAS de z-index négatif (la déco passerait
         DERRIÈRE le fond de la fenêtre et deviendrait invisible — piège
         connu). z-index 0 + en-tête/contenu relevés à 1 via item.css :
         la déco est peinte sur le fond, sous le papier. */
      d.style.zIndex = below ? "0" : "50";
      d.style.opacity = String(Math.clamp(Number(deco.opacity ?? 100), 0, 100) / 100);
      d.style.backgroundImage = url;
      if (below) el.prepend(d);
      else el.appendChild(d);
    }
  }

  /** Dernière taille appliquée par modèle — évite de re-forcer la
      taille à chaque frappe de l'aperçu en direct (l'utilisateur doit
      pouvoir redimensionner à la main sans être contredit). */
  static #lastSize = new Map();

  /**
   * Met à jour les classes ET les décorations des fenêtres déjà
   * ouvertes de ce modèle (atelier + fiches), sans re-render.
   * Applique aussi la taille d'ouverture EN DIRECT quand elle change.
   */
  static refreshSheets(doc, config = null) {
    const cfg = config ?? this.getConfig(doc);
    const off = cfg.useGlobal === false;
    const cls = this.sheetClass(doc.id);
    const w = Number(cfg.interface?.sheetW) || 0;
    const h = Number(cfg.interface?.sheetH) || 0;
    const sizeKey = `${w}x${h}`;
    const sizeChanged = (w || h) && this.#lastSize.get(doc.id) !== sizeKey;
    this.#lastSize.set(doc.id, sizeKey);
    for (const app of foundry.applications.instances.values()) {
      /* Uniquement les FEUILLES (atelier + fiches) — pas la fenêtre de
         config du thème, qui porte aussi le document du modèle. */
      if (!(app instanceof foundry.applications.api.DocumentSheetV2)) continue;
      const d = app.document;
      if (!d || d.documentName !== "Actor") continue;
      const isSelf = d.id === doc.id;
      const isChild = d.type === "personnage" && d.system?.templateId === doc.id;
      if (!isSelf && !isChild) continue;
      app.element?.classList.toggle("sbe-window", off);
      app.element?.classList.toggle(cls, off);
      this.applyDecorations(app, doc, cfg);
      if (sizeChanged) {
        app.setPosition({
          ...(w ? { width: Math.max(200, w) } : {}),
          ...(h ? { height: Math.max(200, h) } : {})
        });
      }
    }
  }

  /* -------------------------------------------- */
  /*  Branchement                                 */
  /* -------------------------------------------- */

  /* ---------------- Export / import (même fichier pour les modèles
     de personnage et d'objet ; un modèle d'objet n'en lit que le
     titre et les sons) ---------------- */

  static exportFile(doc, theme) {
    const safe = String(doc?.name ?? "modele").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
    const data = JSON.stringify({ sbe: "template-theme", format: 1, theme }, null, 2);
    foundry.utils.saveDataToFile(data, "application/json", `sbe-theme-modele-${safe || "modele"}.json`);
  }

  /** Choisit un fichier de thème de modèle → l'objet thème, ou null. */
  static pickFile() {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) return resolve(null);
        let json = null;
        try { json = JSON.parse(await file.text()); } catch (_e) { /* illisible */ }
        if (json?.sbe !== "template-theme" || typeof json.theme !== "object") {
          ui.notifications.error(game.i18n.localize("SBE.TplTheme.ImportBad"));
          return resolve(null);
        }
        resolve(json.theme);
      });
      input.addEventListener("cancel", () => resolve(null));
      input.click();
    });
  }

  /**
   * « Masquer le titre » d'un modèle (personnage OU objet) : le titre
   * et son icône disparaissent de la barre des fiches ET de l'atelier ;
   * les boutons restent à leur place. Indépendant du thème général.
   */
  static hidesTitle(tplDoc) {
    return !!tplDoc?.system?.theme?.interface?.hideTitle;
  }

  static applyTitle(app, tplDoc) {
    app?.element?.classList.toggle("sbe-notitle", this.hidesTitle(tplDoc));
    this.applyMode(app, tplDoc);
  }

  /**
   * MODE DE LA FICHE (option du modèle) : « auto » suit Foundry ;
   * « light » / « dark » imposent ce mode à la fenêtre, quel que soit
   * celui de Foundry — une fiche papier reste claire en mode sombre.
   * Foundry lit le mode sur la classe theme-* de la fenêtre : on la pose.
   */
  static applyMode(app, tplDoc) {
    const el = app?.element;
    if (!el) return;
    const mode = tplDoc?.system?.theme?.interface?.mode;
    if (mode === "light" || mode === "dark") {
      el.classList.remove("theme-light", "theme-dark");
      el.classList.add("themed", `theme-${mode}`);
      el.dataset.sbeMode = mode;
    } else if (el.dataset.sbeMode) {
      /* Retour au mode de Foundry (réglage « Applications », sinon
         celui de l'interface). */
      delete el.dataset.sbeMode;
      let scheme = "";
      try { scheme = game.settings.get("core", "uiConfig")?.colorScheme?.applications ?? ""; } catch (_e) { /* */ }
      if (scheme !== "light" && scheme !== "dark") scheme = document.body.classList.contains("theme-light") ? "light" : "dark";
      el.classList.remove("theme-light", "theme-dark");
      el.classList.add(`theme-${scheme}`);
    }
  }

  /** Fenêtres ouvertes d'un modèle (atelier + fiches) : titre à jour. */
  static refreshTitles(tplDoc) {
    for (const app of foundry.applications.instances.values()) {
      const d = app.document;
      if (!d) continue;
      if (d === tplDoc || d.system?.templateId === tplDoc.id) this.applyTitle(app, tplDoc);
    }
  }

  /** À l'init : suit les modifications de thème sur tous les clients. */
  static init() {
    Hooks.on("updateItem", (doc, changes) => {
      if (doc.type !== "template") return;
      if (changes.system && "theme" in changes.system) this.refreshTitles(doc);
    });
    Hooks.on("updateActor", (doc, changes) => {
      if (doc.type !== "template") return;
      const sys = changes.system ?? {};
      if (!("theme" in sys)) return;
      this.apply(doc);
      this.refreshSheets(doc);
      this.refreshTitles(doc);
    });
    Hooks.on("deleteActor", (doc) => {
      if (doc.type !== "template") return;
      document.getElementById(this.#styleId(doc.id))?.remove();
    });
  }

  /** Au ready : injecte les feuilles des modèles déjà personnalisés. */
  static applyAll() {
    for (const tpl of game.actors.filter(a => a.type === "template")) {
      if (tpl.system.theme?.useGlobal === false) this.apply(tpl);
    }
  }
}
