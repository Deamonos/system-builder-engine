/**
 * SBE — Fenêtre de configuration de la bannière de pause
 *
 * Ouverte depuis le bouton « Bannière de pause » des paramètres du
 * système (MJ uniquement). Toutes les options du manager y sont
 * regroupées en sections repliables ; boutons Aperçu (rendu en direct
 * sans sauvegarder), Enregistrer et Réinitialiser.
 */

import { SYSTEM_ID, SYSTEM_PATH, getFontFamilies } from "../../helpers/constants.mjs";
import {
  PauseBanner, AUDIO_EXTENSIONS, IMAGE_EXTENSIONS, VIDEO_EXTENSIONS
} from "./pause-banner.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class SBEPauseConfig extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "sbe-pause-config",
    tag: "form",
    classes: ["sbe-pause-config", "sbe-condense"],
    window: {
      title: "SBE.PauseBanner.Title",
      icon: "fa-solid fa-pause",
      contentClasses: ["standard-form"],
      resizable: true
    },
    position: { width: 560, height: 620 },
    form: {
      handler: SBEPauseConfig.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: false
    },
    actions: {
      preview: SBEPauseConfig.#onPreview,
      previewStop: SBEPauseConfig.#onPreviewStop,
      reset: SBEPauseConfig.#onReset
    }
  };

  static PARTS = {
    body: { template: `${SYSTEM_PATH}/templates/managers/pause-config.hbs` }
  };

  /* -------------------------------------------- */
  /*  Contexte                                    */
  /* -------------------------------------------- */

  async _prepareContext(_options) {
    return {
      config: PauseBanner.getConfig(),
      fontFamilies: getFontFamilies(),
      positionChoices: {
        below: "SBE.PauseBanner.Text.PositionBelow",
        above: "SBE.PauseBanner.Text.PositionAbove",
        free: "SBE.PauseBanner.Text.PositionFree"
      },
      appearChoices: {
        none: "SBE.PauseBanner.Anim.None",
        fade: "SBE.PauseBanner.Anim.Fade",
        "slide-down": "SBE.PauseBanner.Anim.SlideDown",
        "slide-up": "SBE.PauseBanner.Anim.SlideUp",
        "slide-right": "SBE.PauseBanner.Anim.SlideRight",
        "slide-left": "SBE.PauseBanner.Anim.SlideLeft",
        "zoom-in": "SBE.PauseBanner.Anim.ZoomIn",
        "zoom-out": "SBE.PauseBanner.Anim.ZoomOut",
        bounce: "SBE.PauseBanner.Anim.Bounce",
        tilt: "SBE.PauseBanner.Anim.Tilt",
        blur: "SBE.PauseBanner.Anim.Blur",
        typewriter: "SBE.PauseBanner.Anim.Typewriter"
      },
      idleChoices: {
        none: "SBE.PauseBanner.Anim.None",
        pulse: "SBE.PauseBanner.Anim.Pulse",
        float: "SBE.PauseBanner.Anim.Float",
        sway: "SBE.PauseBanner.Anim.Sway",
        neon: "SBE.PauseBanner.Anim.Neon",
        heartbeat: "SBE.PauseBanner.Anim.Heartbeat"
      },
      disappearChoices: {
        none: "SBE.PauseBanner.Anim.None",
        fade: "SBE.PauseBanner.Anim.Fade",
        reverse: "SBE.PauseBanner.Anim.Reverse"
      }
    };
  }

  /* -------------------------------------------- */
  /*  Rendu                                       */
  /* -------------------------------------------- */

  _onRender(context, options) {
    super._onRender(context, options);
    /* Les cases à cocher dans les <summary> ne doivent pas plier la section. */
    for (const input of this.element.querySelectorAll("summary input[type=checkbox]")) {
      input.addEventListener("click", (event) => event.stopPropagation());
    }

    /* Les curseurs X/Y du texte ne s'affichent qu'en position « Libre ». */
    const positionSelect = this.element.querySelector('[name="text.position"]');
    const syncFreeFields = () => {
      const isFree = positionSelect?.value === "free";
      for (const group of this.element.querySelectorAll(".sbe-free-only")) {
        group.style.display = isFree ? "" : "none";
      }
    };
    positionSelect?.addEventListener("change", syncFreeFields);
    syncFreeFields();
  }

  _onClose(options) {
    super._onClose(options);
    PauseBanner.endPreview();
  }

  /* -------------------------------------------- */
  /*  Lecture / validation du formulaire          */
  /* -------------------------------------------- */

  /** Lit l'état courant du formulaire et le fusionne avec les défauts. */
  _collectConfig() {
    const formData = new foundry.applications.ux.FormDataExtended(this.element);
    const data = foundry.utils.expandObject(formData.object);
    const cfg = foundry.utils.mergeObject(
      foundry.utils.deepClone(PauseBanner.DEFAULTS), data, { inplace: false }
    );
    cfg.schemaVersion = PauseBanner.DEFAULTS.schemaVersion;
    return cfg;
  }

  /**
   * Vérifie les formats de fichiers : média = image/vidéo uniquement,
   * son = audio uniquement. Retourne true si tout est valide.
   */
  _validate(cfg) {
    if (cfg.media.path && !PauseBanner.isMediaPath(cfg.media.path)) {
      ui.notifications.error(game.i18n.format("SBE.PauseBanner.Errors.InvalidMedia", {
        formats: [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS].join(", ")
      }));
      return false;
    }
    for (const soundPath of [cfg.sound.path, cfg.sound.resumePath]) {
      if (soundPath && !PauseBanner.isAudioPath(soundPath)) {
        ui.notifications.error(game.i18n.format("SBE.PauseBanner.Errors.InvalidSound", {
          formats: AUDIO_EXTENSIONS.join(", ")
        }));
        return false;
      }
    }
    return true;
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  /** Enregistrer (submit du formulaire). */
  static async #onSubmit(_event, _form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const cfg = foundry.utils.mergeObject(
      foundry.utils.deepClone(PauseBanner.DEFAULTS), data, { inplace: false }
    );
    cfg.schemaVersion = PauseBanner.DEFAULTS.schemaVersion;
    if (!this._validate(cfg)) return;

    PauseBanner.endPreview();
    cfg.configured = true; /* le MJ a enregistré : la bannière SBE prend la main */
    await game.settings.set(SYSTEM_ID, "pauseBanner", cfg);
    ui.notifications.info(game.i18n.localize("SBE.PauseBanner.Notifications.Saved"));
  }

  /**
   * Aperçu : (re)joue la bannière avec les valeurs courantes du
   * formulaire — chaque clic redémarre l'animation d'apparition.
   */
  static #onPreview(_event, _target) {
    const cfg = this._collectConfig();
    if (!this._validate(cfg)) return;
    PauseBanner.preview(cfg);
  }

  /** Arrête l'aperçu et revient à l'état réel (pause ou non). */
  static #onPreviewStop(_event, _target) {
    PauseBanner.endPreview();
  }

  /** Réinitialisation aux valeurs par défaut (avec confirmation). */
  static async #onReset(_event, _target) {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("SBE.PauseBanner.Reset.Title") },
      content: `<p>${game.i18n.localize("SBE.PauseBanner.Reset.Content")}</p>`
    });
    if (!confirmed) return;

    PauseBanner.endPreview();
    await game.settings.set(
      SYSTEM_ID, "pauseBanner", foundry.utils.deepClone(PauseBanner.DEFAULTS)
    );
    ui.notifications.info(game.i18n.localize("SBE.PauseBanner.Notifications.Reset"));
    this.render();
  }
}
