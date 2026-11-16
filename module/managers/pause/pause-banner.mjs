/**
 * SBE — Manager de bannière de pause (runtime)
 *
 * Remplace l'affichage de pause natif de Foundry par une bannière
 * entièrement configurable : média (image / gif / vidéo), texte,
 * bande dégradée, animations d'apparition / continue / disparition,
 * assombrissement d'écran et son de mise en pause.
 *
 * La configuration vit dans un unique setting monde (objet), édité
 * par la fenêtre SBEPauseConfig (bouton dans les paramètres, MJ).
 *
 * Structure DOM créée dans <body> :
 *   #sbe-pause                    (overlay plein écran, pointer-events none)
 *     .sbe-pause-darken           (assombrissement optionnel de tout l'écran)
 *     .sbe-pause-band             (bande horizontale dégradée)
 *     .sbe-pause-content          (positionnement vertical, centrage)
 *       .sbe-pause-anim           (porte l'animation d'apparition/disparition)
 *         .sbe-pause-idle         (porte l'animation continue)
 *           <img|video> + .sbe-pause-text
 */

import {
  SYSTEM_ID, SYSTEM_PATH, AUDIO_EXTENSIONS, IMAGE_EXTENSIONS, VIDEO_EXTENSIONS, soundGain
} from "../../helpers/constants.mjs";

import { registerPreview } from "../tours/tour-previews.mjs";

/* Ré-export : les listes vivent dans helpers/constants.mjs. */
export { AUDIO_EXTENSIONS, IMAGE_EXTENSIONS, VIDEO_EXTENSIONS };

/** Correspondance animation d'apparition → nom de keyframe CSS. */
const APPEAR_KEYFRAMES = {
  fade: "sbePauseFadeIn",
  "slide-down": "sbePauseSlideDown",
  "slide-up": "sbePauseSlideUp",
  "slide-right": "sbePauseSlideRight",
  "slide-left": "sbePauseSlideLeft",
  "zoom-in": "sbePauseZoomIn",
  "zoom-out": "sbePauseZoomOut",
  bounce: "sbePauseBounce",
  tilt: "sbePauseTilt",
  blur: "sbePauseBlurIn",
  typewriter: "sbePauseFadeIn"
};

/** Correspondance animation continue → nom de keyframe CSS. */
const IDLE_KEYFRAMES = {
  pulse: "sbePausePulse",
  float: "sbePauseFloat",
  sway: "sbePauseSway",
  neon: "sbePauseNeon",
  heartbeat: "sbePauseHeartbeat"
};

export class PauseBanner {

  /** Configuration par défaut (versionnée dès le premier jour). */
  static DEFAULTS = {
    schemaVersion: 1,
    /* Tant que le MJ n'a pas enregistré sa config, la bannière NATIVE
       de Foundry reste affichée (état neuf du système). */
    configured: false,
    media: { enabled: true, path: "", size: 200 },
    text: {
      enabled: true, content: "", font: "", size: 2.2, color: "#ffffff",
      position: "below", posX: 50, posY: 60
    },
    band: { enabled: true, color: "#000000", opacity: 60, width: 100, height: 250 },
    layout: { verticalPos: 50, horizontalPos: 50, darken: 0 },
    anim: { appear: "fade", appearDuration: 0.6, idle: "none", disappear: "fade" },
    sound: { enabled: false, path: "", resumePath: "", volume: 80 }
  };

  static _overlay = null;
  static _previewConfig = null;
  static _hideTimeout = null;
  static _typeInterval = null;
  static _wasPaused = false;

  /* -------------------------------------------- */
  /*  Installation                                */
  /* -------------------------------------------- */

  static install() {
    /* Visites guidées : la bannière montrée sans mettre le jeu en pause
       (réglage du MJ, sinon un exemple au logo de SBE). */
    registerPreview("pause", {
      /* Au-dessus des fenêtres ouvertes, sous le voile de la visite. */
      show: () => { this.preview(this._tourConfig()); this._overlay.style.zIndex = "9990"; },
      hide: () => { this.endPreview(); if (this._overlay) this._overlay.style.zIndex = ""; }
    });
    this._ensureOverlay();
    this._wasPaused = !!game.paused;
    Hooks.on("pauseGame", (paused) => this.onPause(paused));
    this.refresh();
  }

  /**
   * Masque le pause natif le plus tôt possible (dès `setup`) via un
   * <style> injecté, pour éviter le flash de la bande native pendant
   * le chargement. N'agit que si un média est configuré.
   */
  static hideNativeEarly() {
    let hasContent = false;
    try {
      const cfg = this.getConfig();
      hasContent = this._hasContent(cfg);
    } catch (_e) { /* settings pas encore prêts */ }

    const existing = document.getElementById("sbe-pause-early-style");
    if (!hasContent) { existing?.remove(); return; }
    if (existing) return;

    const style = document.createElement("style");
    style.id = "sbe-pause-early-style";
    style.textContent = "#pause{ opacity:0 !important; visibility:hidden !important; }";
    (document.head || document.documentElement).appendChild(style);
  }

  /* -------------------------------------------- */
  /*  Configuration                               */
  /* -------------------------------------------- */

  /** Lit la config du setting, fusionnée avec les défauts et migrée. */
  static getConfig() {
    const stored = game.settings.get(SYSTEM_ID, "pauseBanner") ?? {};
    const cfg = foundry.utils.mergeObject(
      foundry.utils.deepClone(this.DEFAULTS), stored, { inplace: false }
    );
    return this._migrate(cfg);
  }

  /**
   * Migration de schéma (compatibilité descendante : les configs
   * anciennes doivent toujours produire le comportement d'origine).
   */
  static _migrate(cfg) {
    if ((cfg.schemaVersion ?? 0) >= 1) return cfg;
    /* Versions futures : transformations ici, jamais de suppression de champ. */
    cfg.schemaVersion = 1;
    return cfg;
  }

  /* -------------------------------------------- */
  /*  Validation des formats                      */
  /* -------------------------------------------- */

  static _extension(path) {
    return String(path ?? "").split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  }

  static isAudioPath(path) { return AUDIO_EXTENSIONS.includes(this._extension(path)); }
  static isImagePath(path) { return IMAGE_EXTENSIONS.includes(this._extension(path)); }
  static isVideoPath(path) { return VIDEO_EXTENSIONS.includes(this._extension(path)); }
  static isMediaPath(path) { return this.isImagePath(path) || this.isVideoPath(path); }

  /* -------------------------------------------- */
  /*  Aperçu (depuis la fenêtre de config)        */
  /* -------------------------------------------- */

  static get previewActive() { return this._previewConfig !== null; }

  /**
   * La bannière SBE REMPLACE la bannière native : dès qu'elle a
   * quelque chose à afficher, la native est masquée.
   */
  static _hasContent(cfg) {
    if (!this._isConfigured(cfg)) return false;
    return !!(
      (cfg.media.enabled && cfg.media.path) ||
      (cfg.text.enabled && cfg.text.content) ||
      cfg.band.enabled
    );
  }

  /**
   * Le MJ a-t-il déjà configuré la bannière ? Compatibilité : les
   * configs enregistrées avant ce drapeau sont reconnues par leur
   * contenu réel (média ou texte renseigné).
   */
  static _isConfigured(cfg) {
    return cfg.configured === true
      || !!(cfg.media?.path)
      || !!(cfg.text?.content);
  }

  static preview(config) {
    this._previewConfig = config;
    /* Redémarrage forcé : masquer d'abord garantit que l'animation
       d'apparition rejoue à chaque clic sur Aperçu. */
    if (this._overlay) {
      this._overlay.style.display = "none";
      void this._overlay.offsetWidth;
    }
    this.refresh();
  }

  /** La bannière d'une visite : celle du MJ, sinon un exemple (jamais enregistré). */
  static _tourConfig() {
    const cfg = this.getConfig();
    if (this._hasContent(cfg)) return cfg;
    return foundry.utils.mergeObject(foundry.utils.deepClone(this.DEFAULTS), {
      configured: true,
      media: { enabled: true, path: `${SYSTEM_PATH}/assets/sbe-logo.svg`, size: 160 },
      text: { enabled: true, content: game.i18n.localize("SBE.Tour.Sample.Paused") }
    }, { inplace: false });
  }

  static endPreview() {
    if (!this.previewActive) return;
    this._previewConfig = null;
    this.refresh();
  }

  /* -------------------------------------------- */
  /*  Cycle pause / reprise                       */
  /* -------------------------------------------- */

  static onPause(paused) {
    if (paused && !this._wasPaused) this._playSound("path");
    else if (!paused && this._wasPaused) this._playSound("resumePath");
    this._wasPaused = paused;
    this.refresh();
  }

  /** Joue le son de mise en pause ("path") ou de reprise ("resumePath"). */
  static _playSound(key) {
    const cfg = this.getConfig();
    const src = cfg.sound[key];
    if (!cfg.sound.enabled || !src) return;
    if (!this.isAudioPath(src)) return;
    const volume = soundGain(cfg.sound.volume);
    foundry.audio.AudioHelper.play({ src, volume, loop: false }, false);
  }

  /* -------------------------------------------- */
  /*  Rendu                                       */
  /* -------------------------------------------- */

  static refresh() {
    this._ensureOverlay();
    this.hideNativeEarly();

    const overlay = this._overlay;
    const cfg = this._previewConfig ?? this.getConfig();
    const shown = this.previewActive || game?.paused;

    clearTimeout(this._hideTimeout);
    this._hideTimeout = null;
    clearInterval(this._typeInterval);
    this._typeInterval = null;

    if (!shown) {
      this._hideWithDisappear(cfg);
      return;
    }
    this._render(overlay, cfg);
  }

  /**
   * Masque l'overlay avec l'animation de disparition configurée.
   * Le fondu s'applique à l'OVERLAY ENTIER (bande, assombrissement,
   * média et texte disparaissent ensemble) ; le mode « inverse »
   * rejoue en plus l'animation d'apparition à l'envers sur le bloc
   * média+texte.
   */
  static _hideWithDisappear(cfg) {
    const overlay = this._overlay;
    if (overlay.style.display === "none") { this._toggleNativePause(true); return; }

    const animWraps = overlay.querySelectorAll(".sbe-pause-anim");
    const mode = cfg.anim?.disappear ?? "fade";
    const duration = Math.clamp(Number(cfg.anim?.appearDuration) || 0.6, 0.1, 3);
    const finish = () => {
      overlay.style.display = "none";
      overlay.style.animation = "";
      const contentIdle = overlay.querySelector(".sbe-pause-content .sbe-pause-idle");
      if (contentIdle) contentIdle.innerHTML = "";
      overlay.querySelector(".sbe-pause-free")?.remove();
      for (const wrap of animWraps) wrap.style.animation = "";
      this._toggleNativePause(true);
    };

    if (mode === "none") { finish(); return; }
    /* Purge + reflow obligatoires : une animation d'apparition TERMINÉE
       (gelée par fill: forwards) empêche sinon le démarrage de la
       nouvelle animation — c'est pourquoi la disparition ne marchait
       qu'en interrompant l'apparition en cours. */
    overlay.style.animation = "none";
    for (const wrap of animWraps) wrap.style.animation = "none";
    void overlay.offsetWidth;
    overlay.style.animation = `sbePauseFadeOut ${duration}s ease forwards`;
    if (mode === "reverse") {
      const keyframe = APPEAR_KEYFRAMES[cfg.anim?.appear];
      if (keyframe) {
        for (const wrap of animWraps) {
          wrap.style.animation = `${keyframe} ${duration}s ease reverse forwards`;
        }
      }
    }
    this._hideTimeout = setTimeout(finish, duration * 1000 + 50);
  }

  /** Construit et affiche la bannière selon la config. */
  static _render(overlay, cfg) {
    const darken = overlay.querySelector(".sbe-pause-darken");
    const band = overlay.querySelector(".sbe-pause-band");
    const content = overlay.querySelector(".sbe-pause-content");
    const idleWrap = overlay.querySelector(".sbe-pause-idle");

    /* --- Assombrissement plein écran --- */
    const darkenPct = Math.clamp(Number(cfg.layout.darken) || 0, 0, 90);
    darken.style.background = `rgba(0, 0, 0, ${(darkenPct / 100).toFixed(3)})`;
    darken.style.display = darkenPct > 0 ? "block" : "none";

    /* --- Position du bloc média+texte ---
       La bande reste centrée sur la largeur de l'écran ; seul le bloc
       média+texte suit la position horizontale choisie. */
    const verticalCss = `${Math.clamp(Number(cfg.layout.verticalPos) || 50, 0, 100)}%`;
    const horizontalCss = `${Math.clamp(Number(cfg.layout.horizontalPos ?? 50), 0, 100)}%`;
    band.style.top = verticalCss;
    content.style.top = verticalCss;
    content.style.left = horizontalCss;

    /* --- Bande dégradée --- */
    if (cfg.band.enabled) {
      const rgb = this._hexToRgb(cfg.band.color);
      const alpha = (Math.clamp(Number(cfg.band.opacity) || 0, 0, 100) / 100).toFixed(3);
      band.style.display = "block";
      band.style.width = `${cfg.band.width}%`;
      band.style.height = `${cfg.band.height}px`;
      band.style.background =
        `linear-gradient(to right, rgba(${rgb.r},${rgb.g},${rgb.b},0) 0%,` +
        ` rgba(${rgb.r},${rgb.g},${rgb.b},${alpha}) 50%,` +
        ` rgba(${rgb.r},${rgb.g},${rgb.b},0) 100%)`;
    } else {
      band.style.display = "none";
    }

    /* --- Média + texte --- */
    overlay.style.animation = "";
    overlay.querySelector(".sbe-pause-free")?.remove();
    idleWrap.innerHTML = "";
    idleWrap.style.flexDirection = cfg.text.position === "above" ? "column-reverse" : "column";

    const hasMedia = cfg.media.enabled && cfg.media.path && this.isMediaPath(cfg.media.path);
    if (hasMedia) idleWrap.appendChild(this._buildMediaElement(cfg));

    const hasText = cfg.text.enabled && cfg.text.content;
    if (hasText) {
      const txt = this._buildTextElement(cfg);
      if (cfg.text.position === "free") {
        /* Placement libre : le texte se pose n'importe où sur l'écran,
           indépendamment du média — mais il embarque sa propre pile
           d'animation (mêmes classes que le bloc média) pour jouer
           l'apparition, l'animation continue et la disparition. */
        const free = document.createElement("div");
        free.classList.add("sbe-pause-free");
        free.style.cssText =
          `position: absolute;` +
          ` left: ${Math.clamp(Number(cfg.text.posX ?? 50), 0, 100)}%;` +
          ` top: ${Math.clamp(Number(cfg.text.posY ?? 60), 0, 100)}%;` +
          ` transform: translate(-50%, -50%);` +
          ` max-width: 90vw; text-align: center;`;
        const freeAnim = document.createElement("div");
        freeAnim.classList.add("sbe-pause-anim");
        const freeIdle = document.createElement("div");
        freeIdle.classList.add("sbe-pause-idle");
        freeIdle.appendChild(txt);
        freeAnim.appendChild(freeIdle);
        free.appendChild(freeAnim);
        overlay.appendChild(free);
      } else {
        idleWrap.appendChild(txt);
      }
    }

    /* --- Animations (appliquées à toutes les piles : bloc média+texte
           ET texte libre) --- */
    this._applyAppear(overlay, cfg);
    this._applyIdle(overlay, cfg);
    if (cfg.anim.appear === "typewriter" && hasText) this._startTypewriter(overlay, cfg);

    const shownAnything = this._isConfigured(cfg) && (hasMedia || hasText || cfg.band.enabled);
    overlay.style.display = shownAnything ? "block" : "none";

    /* La bannière SBE remplace la native : masquée dès qu'on affiche
       quelque chose, restaurée seulement si tout est désactivé. */
    this._toggleNativePause(!shownAnything);
  }

  static _buildMediaElement(cfg) {
    const size = Math.clamp(Number(cfg.media.size) || 200, 20, 2000);
    let el;
    if (this.isVideoPath(cfg.media.path)) {
      el = document.createElement("video");
      el.src = cfg.media.path;
      el.autoplay = true;
      el.loop = true;
      el.muted = true;
      el.playsInline = true;
    } else {
      el = document.createElement("img");
      el.src = cfg.media.path;
      el.alt = "";
    }
    el.classList.add("sbe-pause-media");
    el.style.height = `${size}px`;
    return el;
  }

  static _buildTextElement(cfg) {
    const txt = document.createElement("div");
    txt.classList.add("sbe-pause-text");
    txt.textContent = cfg.text.content;
    const fontFamily = cfg.text.font
      ? `"${cfg.text.font}", var(--font-primary, "Signika", sans-serif)`
      : `var(--font-primary, "Signika", sans-serif)`;
    txt.style.fontFamily = fontFamily;
    txt.style.fontSize = `${Math.clamp(Number(cfg.text.size) || 2.2, 0.5, 10)}em`;
    txt.style.color = this._normalizeHex(cfg.text.color);
    return txt;
  }

  /**
   * Apparition : le fondu s'applique à l'OVERLAY ENTIER (bande et
   * assombrissement compris) ; les animations de mouvement (glissement,
   * zoom, rebond…) s'appliquent en plus au bloc média+texte.
   */
  static _applyAppear(overlay, cfg) {
    const duration = Math.clamp(Number(cfg.anim.appearDuration) || 0.6, 0.1, 3);
    const mode = cfg.anim.appear;
    const animWraps = overlay.querySelectorAll(".sbe-pause-anim");
    for (const wrap of animWraps) wrap.style.animation = "";
    if (mode === "none") return;
    /* Force le redémarrage des animations à chaque affichage. */
    void overlay.offsetWidth;
    overlay.style.animation = `sbePauseFadeIn ${duration}s ease forwards`;
    const keyframe = APPEAR_KEYFRAMES[mode];
    if (keyframe && keyframe !== "sbePauseFadeIn") {
      for (const wrap of animWraps) {
        wrap.style.animation = `${keyframe} ${duration}s ease forwards`;
      }
    }
  }

  static _applyIdle(overlay, cfg) {
    const keyframe = IDLE_KEYFRAMES[cfg.anim.idle];
    for (const wrap of overlay.querySelectorAll(".sbe-pause-idle")) {
      wrap.style.animation = keyframe
        ? `${keyframe} 2.4s ease-in-out infinite`
        : "";
    }
  }

  /** Effet machine à écrire sur le texte (lettre par lettre). */
  static _startTypewriter(root, cfg) {
    const txt = root.querySelector(".sbe-pause-text");
    if (!txt) return;
    const full = txt.textContent;
    const totalMs = Math.max(400, (Number(cfg.anim.appearDuration) || 0.6) * 1000);
    const delay = Math.clamp(Math.floor(totalMs / Math.max(full.length, 1)), 15, 120);
    txt.textContent = "";
    let i = 0;
    this._typeInterval = setInterval(() => {
      i += 1;
      txt.textContent = full.slice(0, i);
      if (i >= full.length) { clearInterval(this._typeInterval); this._typeInterval = null; }
    }, delay);
  }

  /* -------------------------------------------- */
  /*  DOM & helpers                               */
  /* -------------------------------------------- */

  static _ensureOverlay() {
    if (this._overlay && document.body.contains(this._overlay)) return;

    const overlay = document.createElement("div");
    overlay.id = "sbe-pause";
    overlay.style.display = "none";

    const darken = document.createElement("div");
    darken.classList.add("sbe-pause-darken");
    overlay.appendChild(darken);

    const band = document.createElement("div");
    band.classList.add("sbe-pause-band");
    overlay.appendChild(band);

    const content = document.createElement("div");
    content.classList.add("sbe-pause-content");
    const animWrap = document.createElement("div");
    animWrap.classList.add("sbe-pause-anim");
    const idleWrap = document.createElement("div");
    idleWrap.classList.add("sbe-pause-idle");
    animWrap.appendChild(idleWrap);
    content.appendChild(animWrap);
    overlay.appendChild(content);

    document.body.appendChild(overlay);
    this._overlay = overlay;
  }

  /** Affiche ou masque l'animation de pause native Foundry (#pause). */
  static _toggleNativePause(show) {
    const native = document.getElementById("pause");
    if (!native) return;
    if (show) {
      native.style.removeProperty("opacity");
      native.style.removeProperty("visibility");
    } else {
      native.style.opacity = "0";
      native.style.visibility = "hidden";
    }
  }

  static _normalizeHex(hex) {
    if (!hex || typeof hex !== "string") return "#000000";
    let h = hex.trim();
    if (!h.startsWith("#")) h = `#${h}`;
    if (h.length === 4) h = `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
    if (!/^#[0-9a-f]{6}$/i.test(h)) return "#000000";
    return h;
  }

  static _hexToRgb(hex) {
    const h = this._normalizeHex(hex);
    return {
      r: parseInt(h.slice(1, 3), 16),
      g: parseInt(h.slice(3, 5), 16),
      b: parseInt(h.slice(5, 7), 16)
    };
  }
}
