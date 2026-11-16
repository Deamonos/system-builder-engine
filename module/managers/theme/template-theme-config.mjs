/**
 * SBE — Fenêtre de configuration du thème d'UN modèle de personnage
 *
 * Ouverte depuis le menu ⋮ de l'atelier du modèle. Reprise du manager
 * de thème général, exclusivement pour ce modèle : l'utilisateur peut
 * donner à ses fiches une apparence différente du reste des fenêtres.
 *
 * En tête : « Utiliser le thème général sur ce modèle » (coché par
 * défaut). Décoché, les sections apparaissent : palette (Sombre/Clair,
 * base = apparence native de Foundry), habillage (texture + image
 * d'en-tête) et CSS avancé. Aperçu sans sauvegarde, Enregistrer,
 * Réinitialiser.
 */

import { SYSTEM_PATH, isImagePath, IMAGE_EXTENSIONS } from "../../helpers/constants.mjs";
import { THEME_GROUPS } from "./theme-manager.mjs";
import { TemplateTheme } from "./template-theme.mjs";
import { UiSound } from "../media/ui-sound.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class SBETemplateThemeConfig extends HandlebarsApplicationMixin(ApplicationV2) {

  constructor(options = {}) {
    super(options);
    this.document = options.document;
  }

  static DEFAULT_OPTIONS = {
    tag: "div",
    classes: ["sbe-theme-config", "sbe-tpltheme-config", "sbe-condense"],
    window: {
      title: "SBE.TplTheme.Title",
      icon: "fa-solid fa-palette",
      resizable: true
    },
    position: { width: 680, height: 640 },
    actions: {
      preview: SBETemplateThemeConfig.#onPreview,
      save: SBETemplateThemeConfig.#onSave,
      reset: SBETemplateThemeConfig.#onReset,
      exportTheme: SBETemplateThemeConfig.#onExport,
      importTheme: SBETemplateThemeConfig.#onImport,
      addDeco: SBETemplateThemeConfig.#onAddDeco,
      deleteDeco: SBETemplateThemeConfig.#onDeleteDeco
    }
  };

  static PARTS = {
    main: {
      template: `${SYSTEM_PATH}/templates/managers/template-theme-config.hbs`,
      scrollable: [".sbe-theme-body"]
    }
  };

  get title() {
    return game.i18n.format("SBE.TplTheme.TitleName", { name: this.document?.name ?? "" });
  }

  /* -------------------------------------------- */
  /*  Contexte                                    */
  /* -------------------------------------------- */

  async _prepareContext(_options) {
    /* Copie de travail : survit aux re-rendus (ajout/retrait de
       décoration) pour ne pas perdre les modifications non
       sauvegardées ; rechargée depuis le document après Réinitialiser. */
    this._working ??= TemplateTheme.getConfig(this.document);
    const config = this._working;
    const palette = TemplateTheme.getPalette(config);

    const groups = THEME_GROUPS.map((group) => ({
      key: group.key,
      label: game.i18n.localize(`SBE.Theme.Group.${group.key}`),
      rows: group.tokens
        .filter((token) => palette.dark[token] !== undefined)
        .map((token) => ({
          token,
          label: game.i18n.localize(`SBE.Theme.Token.${token}`),
          dark: palette.dark[token],
          light: palette.light[token]
        }))
    }));

    return {
      config,
      soundsHtml: UiSound.sheetBlockHtml(config.sounds),
      useGlobal: config.useGlobal !== false,
      groups,
      decorations: (config.decorations ?? []).map((d, i) => ({
        ...d,
        index: i + 1,
        isCode: d.source !== "file"
      })),
      textureModeChoices: {
        tile: "SBE.Theme.Dressing.ModeTile",
        cover: "SBE.Theme.Dressing.ModeCover"
      },
      titlebarChoices: {
        visible: "SBE.Theme.Interface.TitlebarVisible",
        hidden: "SBE.Theme.Interface.TitlebarHidden"
      },
      decoSourceChoices: {
        code: "SBE.TplTheme.Deco.SourceCode",
        file: "SBE.TplTheme.Deco.SourceFile"
      },
      decoAnchorChoices: {
        "top-left": "SBE.TplTheme.Deco.AnchorTL",
        "top-center": "SBE.TplTheme.Deco.AnchorTC",
        "top-right": "SBE.TplTheme.Deco.AnchorTR",
        "middle-left": "SBE.TplTheme.Deco.AnchorML",
        "center": "SBE.TplTheme.Deco.AnchorC",
        "middle-right": "SBE.TplTheme.Deco.AnchorMR",
        "bottom-left": "SBE.TplTheme.Deco.AnchorBL",
        "bottom-center": "SBE.TplTheme.Deco.AnchorBC",
        "bottom-right": "SBE.TplTheme.Deco.AnchorBR"
      },
      decoLayerChoices: {
        above: "SBE.TplTheme.Deco.LayerAbove",
        below: "SBE.TplTheme.Deco.LayerBelow"
      }
    };
  }

  /** Affiche/masque les sections selon la case « thème général ». */
  _onRender(context, options) {
    super._onRender(context, options);
    const box = this.element.querySelector('input[name="useGlobal"]');
    const sync = () => this.element.classList.toggle("sbe-tplthc--global", !!box?.checked);
    box?.addEventListener("change", sync);
    sync();
    UiSound.wire(this.element);
    /* Fichier ↔ code SVG : bascule des champs de chaque décoration. */
    for (const select of this.element.querySelectorAll(".sbe-deco-source")) {
      select.addEventListener("change", () => {
        this._working = this._readForm();
        this.render();
      });
    }
    /* APERÇU EN DIRECT : chaque modification s'applique immédiatement
       aux fenêtres du modèle, sans bouton ni F5. Rien n'est enregistré
       tant que l'on ne clique pas Enregistrer (fermer = tout annuler). */
    const live = foundry.utils.debounce(() => this.#livePreview(), 250);
    this.element.addEventListener("change", live);
    this.element.addEventListener("input", live);
  }

  /** Applique la config du formulaire sans notification ni sauvegarde. */
  #livePreview() {
    if (!this.rendered) return;
    const cfg = this._readForm();
    this._working = cfg;
    TemplateTheme.apply(this.document, cfg);
    TemplateTheme.refreshSheets(this.document, cfg);
  }

  _onClose(options) {
    super._onClose(options);
    /* Annule un éventuel aperçu non sauvegardé. */
    if (this.document) {
      TemplateTheme.apply(this.document);
      TemplateTheme.refreshSheets(this.document);
    }
  }

  /* -------------------------------------------- */
  /*  Lecture du formulaire                       */
  /* -------------------------------------------- */

  _readForm() {
    const root = this.element;
    const cfg = foundry.utils.deepClone(TemplateTheme.DEFAULTS);
    const read = (name) => root.querySelector(`[name="${name}"]`);

    cfg.useGlobal = !!read("useGlobal")?.checked;

    cfg.palette = { dark: {}, light: {} };
    for (const input of root.querySelectorAll("input.sbe-swatch[data-token][data-mode]")) {
      const { token, mode } = input.dataset;
      if (!token || (mode !== "dark" && mode !== "light")) continue;
      cfg.palette[mode][token] = String(input.value || "").trim().toLowerCase();
    }

    cfg.interface.titlebar = read("interface.titlebar")?.value === "hidden" ? "hidden" : "visible";
    cfg.interface.sheetW = Math.max(0, Number(read("interface.sheetW")?.value ?? 0) || 0);
    cfg.interface.sheetH = Math.max(0, Number(read("interface.sheetH")?.value ?? 0) || 0);
    cfg.interface.hideTitle = !!read("interface.hideTitle")?.checked;
    cfg.interface.mode = ["light", "dark"].includes(read("interface.mode")?.value) ? read("interface.mode").value : "auto";
    cfg.dressing.texture.path = read("dressing.texture.path")?.value ?? "";
    cfg.dressing.texture.mode = read("dressing.texture.mode")?.value ?? "tile";
    cfg.dressing.texture.opacity = Number(read("dressing.texture.opacity")?.value ?? 100);
    cfg.dressing.header.path = read("dressing.header.path")?.value ?? "";
    cfg.dressing.header.height = Number(read("dressing.header.height")?.value ?? 120);
    cfg.dressing.header.opacity = Number(read("dressing.header.opacity")?.value ?? 100);
    cfg.dressing.header.fade = !!read("dressing.header.fade")?.checked;
    cfg.dressing.header.fadeStart = Number(read("dressing.header.fadeStart")?.value ?? 40);
    cfg.sounds = UiSound.readSheet(root);
    cfg.customCss = String(read("customCss")?.value ?? "");

    /* Décorations SVG : une ligne = un bloc [data-deco-id]. */
    cfg.decorations = [];
    for (const row of root.querySelectorAll("[data-deco-id]")) {
      const q = (sel) => row.querySelector(sel);
      cfg.decorations.push({
        id: row.dataset.decoId,
        source: q(".sbe-deco-source")?.value === "file" ? "file" : "code",
        code: String(q(".sbe-deco-code")?.value ?? ""),
        path: String(q(".sbe-deco-path")?.value ?? ""),
        anchor: q(".sbe-deco-anchor")?.value ?? "top-center",
        dx: Number(q(".sbe-deco-dx")?.value ?? 0),
        dy: Number(q(".sbe-deco-dy")?.value ?? 0),
        width: Number(q(".sbe-deco-width")?.value ?? 200),
        height: Number(q(".sbe-deco-height")?.value ?? 80),
        layer: q(".sbe-deco-layer")?.value === "below" ? "below" : "above",
        opacity: Number(q(".sbe-deco-opacity")?.value ?? 100)
      });
    }

    return cfg;
  }

  _validate(cfg) {
    for (const path of [cfg.dressing.texture.path, cfg.dressing.header.path]) {
      if (path && !isImagePath(path)) {
        ui.notifications.error(game.i18n.format("SBE.Theme.Errors.InvalidImage", {
          formats: IMAGE_EXTENSIONS.join(", ")
        }));
        return false;
      }
    }
    return true;
  }

  /** Payload d'update qui REMPLACE une clé objet (opérateur v14). */
  static replacePayload(path, value) {
    return { [path]: foundry.data.operators.ForcedReplacement.create(value) };
  }

  /** Config → forme stockée (palette réduite aux écarts). */
  _toStored(cfg) {
    const stored = foundry.utils.deepClone(cfg);
    stored.palette = TemplateTheme.diffPalette(cfg.palette);
    return stored;
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static #onPreview(_event, _target) {
    const cfg = this._readForm();
    if (!this._validate(cfg)) return;
    this._working = cfg;
    TemplateTheme.apply(this.document, cfg);
    TemplateTheme.refreshSheets(this.document, cfg);
    ui.notifications.info(game.i18n.localize("SBE.Theme.Notifications.Previewed"));
  }

  static async #onSave(_event, _target) {
    const cfg = this._readForm();
    if (!this._validate(cfg)) return;
    this._working = cfg;
    /* REMPLACEMENT FORCÉ de l'objet stocké (un simple merge garderait
       les anciennes couleurs/décorations supprimées) — syntaxe v14. */
    await this.document.update(SBETemplateThemeConfig.replacePayload("system.theme", this._toStored(cfg)));
    /* Le hook updateActor applique feuille + classes sur tous les clients.
       PAS de re-render : il refermait les sections et perdait le scroll. */
    ui.notifications.info(game.i18n.localize("SBE.Theme.Notifications.Saved"));
  }

  /** Export : le thème affiché (enregistré ou non), en fichier JSON. */
  static #onExport() {
    TemplateTheme.exportFile(this.document, this._readForm());
  }

  /** Import : remplace ce qui est affiché ; rien n'est écrit avant
      « Enregistrer » (« Aperçu » permet d'essayer). */
  static async #onImport() {
    const theme = await TemplateTheme.pickFile();
    if (!theme) return;
    this._working = foundry.utils.mergeObject(foundry.utils.deepClone(TemplateTheme.DEFAULTS), theme, { inplace: false });
    await this.render();
    ui.notifications.info(game.i18n.localize("SBE.TplTheme.ImportDone"));
  }

  static async #onReset(_event, _target) {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("SBE.TplTheme.ResetTitle") },
      content: `<p>${game.i18n.localize("SBE.TplTheme.ResetContent")}</p>`,
      rejectClose: false
    }).catch(() => false);
    if (!confirmed) return;
    await this.document.update(
      SBETemplateThemeConfig.replacePayload("system.theme", foundry.utils.deepClone(TemplateTheme.DEFAULTS))
    );
    this._working = null; /* recharge la config stockée */
    ui.notifications.info(game.i18n.localize("SBE.Theme.Notifications.Reset"));
    this.render();
  }

  static #onAddDeco(_event, _target) {
    this._working = this._readForm();
    this._working.decorations.push(TemplateTheme.newDecoration());
    this.render();
  }

  static #onDeleteDeco(_event, target) {
    this._working = this._readForm();
    const id = target.closest("[data-deco-id]")?.dataset.decoId;
    this._working.decorations = this._working.decorations.filter(d => d.id !== id);
    this.render();
  }
}
