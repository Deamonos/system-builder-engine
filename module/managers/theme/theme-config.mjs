/**
 * SBE — Fenêtre de configuration du thème
 *
 * Ouverte depuis le bouton « Thème » des paramètres du système (MJ).
 * Onglets : Couleurs, Polices, Interface et habillage, Médias, CSS
 * avancé (le thème général), puis Info-bulles et Messages du chat —
 * tout ce qui est purement visuel au même endroit. L'aperçu en haut
 * suit l'onglet ouvert.
 * Boutons : Exporter (tout le thème, ou seulement la partie ouverte),
 * Importer (un thème complet ou une partie : rangée au bon onglet),
 * Enregistrer (les trois parties), Réinitialiser (la partie ouverte,
 * ou tout).
 */

import { SYSTEM_PATH, isImagePath, IMAGE_EXTENSIONS } from "../../helpers/constants.mjs";
import { ThemeManager, THEME_GROUPS, UI_TOKENS, UI_FOUNDRY_LOOK } from "./theme-manager.mjs";
import { UiSound } from "../media/ui-sound.mjs";
import { TooltipPanel } from "../tooltip/tooltip-config.mjs";
import { ChatPanel } from "../chat/chat-config.mjs";
import { openContextMenu } from "../../helpers/context-menu.mjs";
import { ThemeLibrary } from "./theme-library.mjs";
import { TooltipManager } from "../tooltip/tooltip-manager.mjs";
import { ChatCards } from "../chat/chat-cards.mjs";

/* Les trois parties d'un thème (onglets du haut). Le thème général a
   ses propres onglets (Couleurs → CSS avancé). */
const PARTS = ["theme", "tooltip", "chat"];

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class SBEThemeConfig extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "sbe-theme-config",
    tag: "div",
    classes: ["sbe-theme-config", "sbe-condense"],
    window: {
      title: "SBE.Theme.Title",
      icon: "fa-solid fa-palette",
      resizable: true
    },
    position: { width: 760, height: 860 },
    actions: {
      preview: SBEThemeConfig.#onPreview,
      save: SBEThemeConfig.#onSave,
      reset: SBEThemeConfig.#onReset,
      exportTheme: SBEThemeConfig.#onExport,
      importTheme: SBEThemeConfig.#onImport
    }
  };

  static PARTS = {
    main: {
      template: `${SYSTEM_PATH}/templates/managers/theme-config.hbs`,
      scrollable: [".sbe-theme-body"]
    }
  };

  /* -------------------------------------------- */
  /*  Contexte                                    */
  /* -------------------------------------------- */

  async _prepareContext(_options) {
    /* Copie de travail : un import (ou un changement d'onglet) ne perd
       rien de ce qui est saisi tant qu'on n'a pas enregistré. */
    /* Le thème réglé dans la fenêtre (le thème actif à l'ouverture). */
    if (!this._editId || !ThemeLibrary.get(this._editId)) this._editId = ThemeLibrary.activeId();
    const editId = this._editId;
    const base = ThemeLibrary.baseOf(editId);
    const lib = ThemeLibrary.lib();
    const config = this._working ?? ThemeManager.getConfig(editId);
    const palette = ThemeManager.getPalette(config);

    const groups = THEME_GROUPS.map((group) => ({
      key: group.key,
      label: game.i18n.localize(`SBE.Theme.Group.${group.key}`),
      hint: group.key === "states" ? game.i18n.localize("SBE.Theme.StatesHint") : "",
      rows: group.tokens.map((token) => ({
        token,
        label: game.i18n.localize(`SBE.Theme.Token.${token}`),
        dark: palette.dark[token],
        light: palette.light[token]
      }))
    }));

    const fontFamilies = ThemeManager.getFontFamilies();

    this._tab ??= "colors";
    this._part ??= "theme";
    /* Un thème = une palette : l'aperçu et les couleurs affichées sont
       celles de SON style (clair ou sombre). */
    this._mode = base;
    /* Interface de Foundry : case cochée = couleur choisie par le MJ. */
    const uiRows = UI_TOKENS.map((k) => ({
      key: k,
      label: game.i18n.localize(`SBE.Theme.Ui.${k}`),
      dark: { on: !!config.ui?.dark?.[k], value: config.ui?.dark?.[k] || UI_FOUNDRY_LOOK.dark[k] },
      light: { on: !!config.ui?.light?.[k], value: config.ui?.light?.[k] || UI_FOUNDRY_LOOK.light[k] }
    }));
    return {
      config,
      lib: {
        themes: ThemeLibrary.themes().map(t => ({
          id: t.id, selected: t.id === editId,
          label: `${t.name}${lib.imposed === t.id ? ` — ${game.i18n.localize("SBE.Theme.Lib.ImposedTag")}` : ""}${lib.hidden.includes(t.id) ? ` (${game.i18n.localize("SBE.Theme.Lib.HiddenTag")})` : ""}`
        })),
        builtin: ThemeLibrary.isBuiltin(editId),
        base,
        offered: !lib.hidden.includes(editId),
        imposed: lib.imposed === editId
      },
      uiRows,
      tab: this._tab,
      part: this._part,
      previewMode: this._mode,
      soundsHtml: `<div class="sbe-uisound-block">
        <p class="hint notes">${game.i18n.localize("SBE.Theme.SoundsHint")}</p>
        ${UiSound.fieldsHtml("sounds.open", config.sounds?.open, "SBE.Theme.SoundOpen")}
        ${UiSound.fieldsHtml("sounds.close", config.sounds?.close, "SBE.Theme.SoundClose")}
        ${UiSound.fieldsHtml("sounds.tab", config.sounds?.tab, "SBE.Theme.SoundTab", "SBE.Theme.SoundTabHint")}
      </div>`,
      groups,
      fontFamilies,
      weightChoices: {
        "300": "SBE.Theme.Fonts.WeightLight",
        "400": "SBE.Theme.Fonts.WeightNormal",
        "600": "SBE.Theme.Fonts.WeightSemi",
        "700": "SBE.Theme.Fonts.WeightBold"
      },
      caseChoices: {
        none: "SBE.Theme.Fonts.CaseNone",
        uppercase: "SBE.Theme.Fonts.CaseUpper",
        "small-caps": "SBE.Theme.Fonts.CaseSmallCaps"
      },
      sizeChoices: {
        90: "SBE.Theme.Fonts.SizeSmall",
        100: "SBE.Theme.Fonts.SizeNormal",
        110: "SBE.Theme.Fonts.SizeLarge",
        120: "SBE.Theme.Fonts.SizeXLarge"
      },
      textureModeChoices: {
        tile: "SBE.Theme.Dressing.ModeTile",
        cover: "SBE.Theme.Dressing.ModeCover"
      },
      opacityScopeChoices: {
        widgets: "SBE.Theme.Interface.OpacityWidgets",
        all: "SBE.Theme.Interface.OpacityAll"
      },
      titlebarChoices: {
        visible: "SBE.Theme.Interface.TitlebarVisible",
        hidden: "SBE.Theme.Interface.TitlebarHidden"
      }
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element;
    /* Panneaux Info-bulles et Messages du chat : leur copie de travail
       survit aux rendus de la fenêtre. */
    this._tt ??= new TooltipPanel();
    this._chat ??= new ChatPanel();
    /* Les panneaux règlent le même thème, avec sa seule palette. */
    const base = ThemeLibrary.baseOf(this._editId);
    this._tt.themeId = this._editId;
    this._chat.themeId = this._editId;
    this._tt.pTheme = base;
    this._chat.pTheme = base;
    root.classList.remove("sbe-thm-only-dark", "sbe-thm-only-light");
    root.classList.add(`sbe-thm-only-${base}`);
    this.#wireLibrary(root);
    /* Modifié et pas encore enregistré ? (changer de thème prévient) */
    const dirty = () => { this._dirty = true; };
    root.querySelector(".sbe-theme-body")?.addEventListener("input", dirty);
    root.querySelector(".sbe-theme-body")?.addEventListener("change", dirty);
    const alt = (k) => root.querySelector(`.sbe-thp-alt[data-alt="${k}"]`);
    const pane = (k) => root.querySelector(`.sbe-thpane[data-pane="${k}"]`);
    this._tt.render(alt("tooltip"), pane("tooltip")).catch(err => console.warn("SBE | Thème : info-bulles", err));
    this._chat.render(alt("chat"), pane("chat"));
    /* Onglets : affichage seulement, tout reste dans le formulaire.
       En haut, les trois parties (Général, Info-bulles, Messages du
       chat) ; l'aperçu suit la partie. Les onglets Couleurs → CSS
       avancé n'existent que pour le Général. */
    const show = () => {
      const part = this._part;
      const pane = part === "theme" ? this._tab : part;
      for (const p of root.querySelectorAll(".sbe-thpane")) p.hidden = p.dataset.pane !== pane;
      for (const a of root.querySelectorAll("[data-thtab]")) a.classList.toggle("is-on", a.dataset.thtab === this._tab);
      for (const a of root.querySelectorAll("[data-thpart]")) a.classList.toggle("is-on", a.dataset.thpart === part);
      const tabs = root.querySelector(".sbe-thtabs");
      if (tabs) tabs.hidden = part !== "theme";
      const main = root.querySelector(".sbe-thp-main");
      if (main) main.hidden = part !== "theme";
      for (const a of root.querySelectorAll(".sbe-thp-alt")) a.hidden = a.dataset.alt !== part;
    };
    for (const a of root.querySelectorAll("[data-thtab]")) {
      a.addEventListener("click", () => { this._tab = a.dataset.thtab; show(); });
    }
    for (const a of root.querySelectorAll("[data-thpart]")) {
      a.addEventListener("click", () => { this._part = PARTS.includes(a.dataset.thpart) ? a.dataset.thpart : "theme"; show(); });
    }
    show();
    root.querySelector(".sbe-thp-modesel")?.addEventListener("change", (e) => { this._mode = e.target.value; this.#drawPreview(); });
    /* Aperçu en direct : chaque saisie le redessine. */
    const redraw = (ev) => {
      if (ev?.target?.closest?.(".sbe-thpanel, .sbe-thp-alt")) return;   /* saisie d'un panneau */
      clearTimeout(this._pt); this._pt = setTimeout(() => this.#drawPreview(), 60);
    };
    root.addEventListener("input", redraw);
    root.addEventListener("change", redraw);
    /* Choisir une couleur d'interface la coche ; décochée = Foundry. */
    for (const cell of root.querySelectorAll(".sbe-uicell")) {
      cell.querySelector("input[type=color]")?.addEventListener("input", () => {
        const box = cell.querySelector("input[type=checkbox]");
        if (box) box.checked = true;
      });
    }
    UiSound.wire(root);
    this.#drawPreview();
  }

  /* -------------------------------------------- */
  /*  Aperçu : une fausse fenêtre aux couleurs     */
  /*  saisies (sombre ou clair), sans rien         */
  /*  appliquer au reste de Foundry.               */
  /* -------------------------------------------- */

  #drawPreview() {
    const stage = this.element?.querySelector(".sbe-thp-stage");
    if (!stage) return;
    const cfg = this._readForm();
    const pal = ThemeManager.getPalette(cfg)[this._mode === "light" ? "light" : "dark"];
    const vars = Object.entries(pal).map(([k, v]) => `--${k}:${v}`).join(";");
    const f = cfg.fonts ?? {};
    const stack = (fam) => `"${String(fam).replace(/"/g, "")}", var(--font-primary, "Signika", sans-serif)`;
    const body = [
      f.primary?.family ? `font-family:${stack(f.primary.family)}` : "",
      f.primary?.weight && f.primary.weight !== "400" ? `font-weight:${f.primary.weight}` : "",
      f.primary?.italic ? "font-style:italic" : "",
      f.primary?.underline ? "text-decoration:underline" : ""
    ].filter(Boolean).join(";");
    const hfam = f.heading?.family || f.primary?.family;
    const head = [
      hfam ? `font-family:${stack(hfam)}` : "",
      f.heading?.bold ? "font-weight:700" : "",
      f.heading?.italic ? "font-style:italic" : "",
      f.heading?.underline ? "text-decoration:underline" : "",
      Number(f.heading?.spacing) > 0 ? `letter-spacing:${Number(f.heading.spacing)}px` : "",
      f.heading?.caseMode === "uppercase" ? "text-transform:uppercase" : "",
      f.heading?.caseMode === "small-caps" ? "font-variant:small-caps" : ""
    ].filter(Boolean).join(";");
    const url = (e) => ThemeManager._decorImgUrl(e);
    const tex = url(cfg.dressing?.texture);
    const hdr = url(cfg.dressing?.header);
    const texCss = tex ? `background-image:${tex};${cfg.dressing.texture.mode === "cover" ? "background-size:cover;background-position:center" : "background-repeat:repeat"};opacity:${(Number(cfg.dressing.texture.opacity) || 100) / 100}` : "display:none";
    const fade = Number(cfg.dressing?.header?.fadeStart) || 40;
    const hdrCss = hdr ? `background-image:${hdr};height:${Number(cfg.dressing.header.height) || 120}px;opacity:${(Number(cfg.dressing.header.opacity) || 100) / 100};${cfg.dressing.header.fade ? `-webkit-mask-image:linear-gradient(to bottom,black ${fade}%,transparent);mask-image:linear-gradient(to bottom,black ${fade}%,transparent)` : ""}` : "display:none";
    const hidden = cfg.interface?.titlebar === "hidden" || cfg.interface?.titlebar === "hover";
    const L = (k) => game.i18n.localize(k);
    const size = (Number(f.baseSize) || 100) / 100;
    stage.innerHTML = `
      <div class="sbe-thp-scene" style="${vars};font-size:${(14 * size).toFixed(1)}px;${body}">
        <div class="sbe-thp-win">
          <div class="sbe-thp-tex" style="${foundry.utils.escapeHTML(texCss)}"></div>
          <div class="sbe-thp-hdr" style="${foundry.utils.escapeHTML(hdrCss)}"></div>
          <header class="sbe-thp-title${hidden ? " is-hidden" : ""}${hdr ? " is-dressed" : ""}">
            <i class="fa-solid fa-user"></i><span style="${head}">${L("SBE.Theme.Pv.Window")}</span>
            <i class="fa-solid fa-ellipsis-vertical"></i><i class="fa-solid fa-xmark"></i>
          </header>
          <nav class="sbe-thp-tabs"><a class="is-on">${L("SBE.Theme.Pv.Tab1")}</a><a>${L("SBE.Theme.Pv.Tab2")}</a><a>${L("SBE.Theme.Pv.Tab3")}</a></nav>
          <div class="sbe-thp-content">
            <h3 style="${head}">${L("SBE.Theme.Pv.Heading")}</h3>
            <div class="sbe-thp-grid">
              <label>${L("SBE.Theme.Pv.Name")}<input type="text" value="${L("SBE.Theme.Pv.NameValue")}" readonly></label>
              <label>${L("SBE.Theme.Pv.Class")}<select disabled><option>${L("SBE.Theme.Pv.Option")}</option></select></label>
            </div>
            <div class="sbe-thp-gauge"><span>${L("SBE.Theme.Pv.Hp")}</span><div><b style="width:72%"></b></div><em>22 / 30</em></div>
            <div class="sbe-thp-gauge is-low"><span>${L("SBE.Theme.Pv.Low")}</span><div><b style="width:18%"></b></div><em>3 / 20</em></div>
            <p class="sbe-thp-text">${L("SBE.Theme.Pv.Text")} <a>${L("SBE.Theme.Pv.Link")}</a>.
              <span class="is-dim">${L("SBE.Theme.Pv.Dim")}</span></p>
            <div class="sbe-thp-states"><span class="is-ok">+2 ${L("SBE.Theme.Pv.Bonus")}</span><span class="is-fail">−1 ${L("SBE.Theme.Pv.Malus")}</span><span class="is-warn"><i class="fa-solid fa-triangle-exclamation"></i> ${L("SBE.Theme.Pv.Warn")}</span></div>
            <div class="sbe-thp-btns"><button type="button" tabindex="-1">${L("SBE.Theme.Pv.Button")}</button><button type="button" tabindex="-1" class="is-hover">${L("SBE.Theme.Pv.Hover")}</button></div>
          </div>
        </div>
        <div class="sbe-thp-ui" style="${this.#uiVars(cfg)}">
          <div class="sbe-thp-ctrls"><i class="fa-solid fa-user"></i><i class="fa-solid fa-ruler is-on"></i><i class="fa-solid fa-lightbulb"></i></div>
          <div class="sbe-thp-hotbar"><span>1</span><span><i class="fa-solid fa-dice-d20"></i></span><span>3</span><span>4</span></div>
          <div class="sbe-thp-sidebar"><div class="sbe-thp-sbtabs"><i class="fa-solid fa-comments is-on"></i><i class="fa-solid fa-user"></i><i class="fa-solid fa-suitcase"></i></div>
            <p>${L("SBE.Theme.Pv.Sidebar")}</p></div>
        </div>
        <div class="sbe-thp-side">
          <div class="sbe-thp-ctx"><div><i class="fa-solid fa-dice-d20"></i> ${L("SBE.Theme.Pv.Ctx1")}</div><div class="is-on"><i class="fa-solid fa-up-right-from-square"></i> ${L("SBE.Theme.Pv.Ctx2")}</div><div><i class="fa-solid fa-trash"></i> ${L("SBE.Theme.Pv.Ctx3")}</div></div>
          <div class="sbe-thp-scroll"><p>${L("SBE.Theme.Pv.Scroll")}</p><b></b></div>
        </div>
      </div>`;
  }

  /** Couleurs de l'interface de Foundry pour l'aperçu (choisies, sinon
      l'apparence de Foundry). */
  #uiVars(cfg) {
    const mode = this._mode === "light" ? "light" : "dark";
    return UI_TOKENS.map(k => `--ui-${k}:${cfg.ui?.[mode]?.[k] || UI_FOUNDRY_LOOK[mode][k]}`).join(";");
  }

  /** Demande un nom (avec un message au-dessus si besoin). "" = annulé. */
  async #askName(title, value = "", message = "") {
    const L = (k) => game.i18n.localize(k);
    const esc = foundry.utils.escapeHTML;
    const r = await foundry.applications.api.DialogV2.prompt({
      window: { title },
      content: `${message ? `<p class="sbe-thlib-warn"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(message)}</p>` : ""}
        <div class="form-group stacked"><label>${L("SBE.Theme.Lib.Name")}</label><input type="text" name="name" value="${esc(value)}" autofocus></div>`,
      ok: { label: L("SBE.Common.Validate"), callback: (_e, b) => b.form.elements.name.value },
      rejectClose: false
    }).catch(() => null);
    return String(r ?? "").trim();
  }

  /** Barre de la bibliothèque : choisir, créer, renommer, imposer… */
  #wireLibrary(root) {
    const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
    const lost = async () => {
      if (!this._dirty) return true;
      return foundry.applications.api.DialogV2.confirm({
        window: { title: L("SBE.Theme.Lib.UnsavedTitle") },
        content: `<p>${L("SBE.Theme.Lib.Unsaved")}</p>`, rejectClose: false
      }).catch(() => false);
    };
    const open = async (id) => {
      this._editId = id;
      this._working = null;
      if (this._tt) this._tt.working = null;
      if (this._chat) this._chat.working = null;
      this._dirty = false;
      ThemeLibrary.activate();          /* retire un aperçu non enregistré */
      await this.render();
    };
    /* Un nom libre, jamais celui d'un autre thème. */
    const askName = async (title, value = "", exceptId = null) => {
      let name = await this.#askName(title, value);
      while (name && ThemeLibrary.nameTaken(name, exceptId)) {
        name = await this.#askName(title, ThemeLibrary.uniqueName(name), L("SBE.Theme.Lib.NameTakenAsk", { name }));
      }
      return name;
    };
    root.querySelector(".sbe-thlib-sel")?.addEventListener("change", async (ev) => {
      const id = ev.target.value;
      if (!(await lost())) { ev.target.value = this._editId; return; }
      open(id);
    });
    for (const b of root.querySelectorAll("[data-lib]")) {
      b.addEventListener("click", async () => {
        const act = b.dataset.lib;
        const cur = ThemeLibrary.get(this._editId);
        if (act === "new" || act === "dup") {
          if (!(await lost())) return;
          const name = await askName(L(act === "new" ? "SBE.Theme.Lib.New" : "SBE.Theme.Lib.Dup"),
            act === "dup" ? L("SBE.Theme.Lib.CopyOf", { name: cur?.name ?? "" }) : "");
          if (!name) return;
          const id = await ThemeLibrary.create(name, act === "new" ? "light" : this._editId);
          ui.notifications.info(L("SBE.Theme.Lib.Created", { name }));
          return open(id);
        }
        if (act === "rename") {
          const name = await askName(L("SBE.Theme.Lib.Rename"), cur?.name ?? "", this._editId);
          if (!name) return;
          await ThemeLibrary.rename(this._editId, name);
          return this.render();
        }
        if (act === "delete") {
          const ok = await foundry.applications.api.DialogV2.confirm({
            window: { title: L("SBE.Theme.Lib.Delete") },
            content: `<p>${foundry.utils.escapeHTML(L("SBE.Theme.Lib.DeleteAsk", { name: cur?.name ?? "" }))}</p>`,
            rejectClose: false
          }).catch(() => false);
          if (!ok) return;
          await ThemeLibrary.remove(this._editId);
          return open(ThemeLibrary.activeId());
        }
      });
    }
    root.querySelector(".sbe-thlib-base")?.addEventListener("change", async (ev) => {
      /* Ce qui est saisi est gardé : on l'enregistre d'abord. */
      await SBEThemeConfig.#saveAll.call(this, { quiet: true });
      await ThemeLibrary.setBase(this._editId, ev.target.value);
      this.render();
    });
    root.querySelector(".sbe-thlib-offer")?.addEventListener("change", async (ev) => {
      await ThemeLibrary.setOffered(this._editId, ev.target.checked);
      this.render();
    });
    root.querySelector(".sbe-thlib-impose")?.addEventListener("change", async (ev) => {
      await ThemeLibrary.setImposed(ev.target.checked ? this._editId : "");
      this.render();
    });
  }

  _onClose(options) {
    super._onClose(options);
    /* Annule un éventuel aperçu non sauvegardé (les trois parties). */
    ThemeManager.apply();
    this._tt?.cancel();
    this._chat?.cancel();
  }


  /* -------------------------------------------- */
  /*  Lecture du formulaire                       */
  /* -------------------------------------------- */

  /** Reconstruit une config complète depuis les champs de la fenêtre. */
  _readForm() {
    const root = this.element;
    const cfg = foundry.utils.deepClone(ThemeManager.DEFAULTS);

    /* Palette : chaque pastille porte data-token / data-mode. */
    cfg.palette = { dark: {}, light: {} };
    for (const input of root.querySelectorAll(".sbe-thpane:not(.sbe-thpanel) input.sbe-swatch[data-token][data-mode]")) {
      const { token, mode } = input.dataset;
      if (!token || (mode !== "dark" && mode !== "light")) continue;
      cfg.palette[mode][token] = String(input.value || "").trim().toLowerCase();
    }

    /* Champs nommés (polices, interface, CSS libre). */
    /* Champs du thème général seulement : les panneaux Info-bulles et
       Chat ont leurs propres champs (parfois du même nom). */
    const read = (name) => root.querySelector(`.sbe-thpane:not(.sbe-thpanel) [name="${name}"]`);
    cfg.fonts.primary.family = read("fonts.primary.family")?.value ?? "";
    cfg.fonts.primary.weight = read("fonts.primary.weight")?.value ?? "400";
    cfg.fonts.primary.italic = !!read("fonts.primary.italic")?.checked;
    cfg.fonts.primary.underline = !!read("fonts.primary.underline")?.checked;
    cfg.fonts.heading.family = read("fonts.heading.family")?.value ?? "";
    cfg.fonts.heading.bold = !!read("fonts.heading.bold")?.checked;
    cfg.fonts.heading.italic = !!read("fonts.heading.italic")?.checked;
    cfg.fonts.heading.underline = !!read("fonts.heading.underline")?.checked;
    cfg.fonts.heading.spacing = Number(read("fonts.heading.spacing")?.value ?? 0);
    cfg.fonts.heading.caseMode = read("fonts.heading.caseMode")?.value ?? "none";
    cfg.fonts.baseSize = Number(read("fonts.baseSize")?.value ?? 100);
    cfg.interface.titlebar = read("interface.titlebar")?.value ?? "visible";
    cfg.interface.opacity = Number(read("interface.opacity")?.value ?? 100) || 100;
    cfg.interface.opacityHover = !!read("interface.opacityHover")?.checked;
    cfg.interface.opacityScope = read("interface.opacityScope")?.value === "all" ? "all" : "widgets";
    cfg.dressing.texture.path = read("dressing.texture.path")?.value ?? "";
    cfg.dressing.texture.code = read("dressing.texture.code")?.value ?? "";
    cfg.dressing.texture.mode = read("dressing.texture.mode")?.value ?? "tile";
    cfg.dressing.texture.opacity = Number(read("dressing.texture.opacity")?.value ?? 100);
    cfg.dressing.header.path = read("dressing.header.path")?.value ?? "";
    cfg.dressing.header.code = read("dressing.header.code")?.value ?? "";
    cfg.dressing.header.height = Number(read("dressing.header.height")?.value ?? 120);
    cfg.dressing.header.opacity = Number(read("dressing.header.opacity")?.value ?? 100);
    cfg.dressing.header.fade = !!read("dressing.header.fade")?.checked;
    cfg.dressing.header.fadeStart = Number(read("dressing.header.fadeStart")?.value ?? 40);
    cfg.htmlDecor.windows = String(read("htmlDecor.windows")?.value ?? "");
    cfg.htmlDecor.overlay = String(read("htmlDecor.overlay")?.value ?? "");
    cfg.customCss = String(read("customCss")?.value ?? "");
    cfg.ui = { dark: {}, light: {} };
    for (const cell of root.querySelectorAll(".sbe-uicell[data-ui][data-mode]")) {
      if (!cell.querySelector("input[type=checkbox]")?.checked) continue;
      cfg.ui[cell.dataset.mode][cell.dataset.ui] = String(cell.querySelector("input[type=color]")?.value ?? "").toLowerCase();
    }
    cfg.sounds = {
      open: UiSound.read(root, "sounds.open"),
      close: UiSound.read(root, "sounds.close"),
      tab: UiSound.read(root, "sounds.tab")
    };

    return cfg;
  }

  /** Vérifie que les images d'habillage sont bien des images. */
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

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  /** Aperçu : injecte la config de la fenêtre sans l'enregistrer. */
  static #onPreview(_event, _target) {
    const cfg = this._readForm();
    if (!this._validate(cfg)) return;
    ThemeManager.apply(cfg);
    ui.notifications.info(game.i18n.localize("SBE.Theme.Notifications.Previewed"));
  }

  /** Ce qui est affiché pour une partie (enregistré ou non). */
  #partData(part) {
    if (part === "tooltip") return this._tt.sync() ?? this._tt.current();
    if (part === "chat") return this._chat.sync();
    return this._readForm();
  }

  static #fileOf(part, data) {
    const KEY = { theme: "theme", tooltip: "tooltip", chat: "chat" };
    const NAME = { theme: "sbe-theme.json", tooltip: "sbe-info-bulles.json", chat: "sbe-messages-chat.json" };
    return { json: { sbe: KEY[part], format: 1, [KEY[part]]: data }, name: NAME[part] };
  }

  /** Export : tout le thème d'un coup, ou seulement la partie ouverte. */
  static #onExport(event) {
    const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
    const part = this._part ?? "theme";
    const save = (json, name) => foundry.utils.saveDataToFile(JSON.stringify(json, null, 2), "application/json", name);
    const slug = (n) => String(n ?? "theme").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "theme";
    /* Les trois parties d'un thème : celui qu'on règle avec ce qui est
       saisi (même non enregistré), les autres tels qu'enregistrés. */
    const packOf = (id) => {
      const t = ThemeLibrary.get(id);
      let theme, tooltip, chat;
      if (id === this._editId) {
        theme = this.#partData("theme"); tooltip = this.#partData("tooltip"); chat = this.#partData("chat");
      } else {
        theme = ThemeManager.getConfig(id);
        theme.palette = ThemeManager.getPalette(theme);
        tooltip = TooltipManager.getConfig(id);
        chat = ChatCards.getConfig(id);
      }
      return { sbe: "theme-pack", format: 1, name: t?.name ?? "", base: ThemeLibrary.baseOf(id), theme, tooltip, chat };
    };
    const items = ThemeLibrary.themes().map(t => ({
      label: L("SBE.Theme.Lib.ExportOne", { name: t.name }) + (t.id === this._editId ? ` (${L("SBE.Theme.Lib.EditedTag")})` : ""),
      icon: "fa-solid fa-box-archive",
      onClick: () => save(packOf(t.id), `sbe-theme-${slug(t.name)}.json`)
    }));
    items.push({ label: L("SBE.Theme.ExportPart", { part: L(`SBE.Theme.Part.${part}`) }), icon: "fa-solid fa-file-export",
      onClick: () => { const f = SBEThemeConfig.#fileOf(part, this.#partData(part)); save(f.json, f.name); } });
    openContextMenu(event, items);
  }

  /** Import : un thème complet (les trois parties) ou une seule partie,
      rangée dans son onglet. Rien n'est écrit avant « Enregistrer ». */
  static #onImport() {
    const L = (k) => game.i18n.localize(k);
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      let json = null;
      try { json = JSON.parse(await file.text()); } catch (_e) { /* illisible */ }
      const isObj = (o) => o && typeof o === "object";
      const parts = [];
      if (json?.sbe === "theme-pack") {
        if (isObj(json.theme)) parts.push(["theme", json.theme]);
        if (isObj(json.tooltip)) parts.push(["tooltip", json.tooltip]);
        if (isObj(json.chat)) parts.push(["chat", json.chat]);
      } else if (json?.sbe === "theme" && isObj(json.theme)) parts.push(["theme", json.theme]);
      else if (json?.sbe === "tooltip" && isObj(json.tooltip)) parts.push(["tooltip", json.tooltip]);
      else if (json?.sbe === "chat" && isObj(json.chat)) parts.push(["chat", json.chat]);
      if (!parts.length) { ui.notifications.error(L("SBE.Theme.ImportBad")); return; }
      /* Thème complet : le ranger dans un NOUVEAU thème nommé, ou
         remplacer celui qu'on règle. */
      if (json.sbe === "theme-pack") {
        const name = String(json.name ?? "").trim() || file.name.replace(/\.json$/i, "");
        const choice = await foundry.applications.api.DialogV2.wait({
          window: { title: L("SBE.Theme.Lib.ImportTitle") },
          content: `<p>${foundry.utils.escapeHTML(game.i18n.format("SBE.Theme.Lib.ImportAsk", { name }))}</p>`,
          buttons: [
            { action: "new", label: game.i18n.format("SBE.Theme.Lib.ImportNew", { name }), icon: "fa-solid fa-plus", default: true },
            { action: "replace", label: L("SBE.Theme.Lib.ImportReplace"), icon: "fa-solid fa-file-import" }
          ],
          rejectClose: false
        }).catch(() => null);
        if (!choice) return;
        if (choice === "new") {
          /* Deux thèmes ne portent jamais le même nom : on propose d'en
             changer tant qu'il est pris. */
          let finalName = name;
          while (ThemeLibrary.nameTaken(finalName)) {
            finalName = await this.#askName(L("SBE.Theme.Lib.ImportTitle"), ThemeLibrary.uniqueName(finalName),
              game.i18n.format("SBE.Theme.Lib.NameTakenAsk", { name: finalName }));
            if (!finalName) return;
          }
          const data = Object.fromEntries(parts);
          const id = await ThemeLibrary.create(finalName, "light", data, json.base);
          this._editId = id;
          this._working = null;
          this._tt.working = null;
          this._chat.working = null;
          this._dirty = false;
          await this.render();
          ui.notifications.info(game.i18n.format("SBE.Theme.Lib.Created", { name: finalName }));
          return;
        }
      }
      /* Ce qui est saisi dans les AUTRES parties est gardé. */
      this._working = this._readForm();
      this._tt.sync();
      this._chat.sync();
      for (const [part, data] of parts) {
        if (part === "theme") this._working = foundry.utils.mergeObject(foundry.utils.deepClone(ThemeManager.DEFAULTS), data, { inplace: false });
        else if (part === "tooltip") this._tt.load(data);
        else this._chat.load(data);
      }
      /* Une seule partie : on l'ouvre. */
      if (parts.length === 1) this._part = parts[0][0];
      await this.render();
      ui.notifications.info(game.i18n.format("SBE.Theme.ImportDoneParts",
        { parts: parts.map(([p]) => L(`SBE.Theme.Part.${p}`)).join(", ") }));
    });
    input.click();
  }

  /** Enregistrer : les trois parties d'un coup. */
  static async #onSave(_event, _target) {
    if (await SBEThemeConfig.#saveAll.call(this)) this.render();
  }

  /** Enregistre les trois parties du thème réglé. */
  static async #saveAll({ quiet = false } = {}) {
    const cfg = this._readForm();
    if (!this._validate(cfg)) return false;
    this._working = null;
    this._dirty = false;
    await ThemeManager.save(cfg, this._editId);
    await this._tt.save();
    await this._chat.save();
    if (!quiet) ui.notifications.info(game.i18n.localize("SBE.Theme.Notifications.Saved"));
    return true;
  }

  /** Réinitialiser : la partie ouverte, ou tout le thème. */
  static #onReset(event) {
    const L = (k) => game.i18n.localize(k);
    const part = this._part ?? "theme";
    const run = async (which) => {
      const label = which.map(p => L(`SBE.Theme.Part.${p}`)).join(", ");
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: L("SBE.Theme.Reset.Title") },
        content: `<p>${foundry.utils.escapeHTML(game.i18n.format("SBE.Theme.Reset.ContentParts", { parts: label }))}</p>`,
        rejectClose: false
      }).catch(() => false);
      if (!confirmed) return;
      /* Les parties NON réinitialisées gardent ce qui est saisi. */
      this._working = which.includes("theme") ? null : this._readForm();
      if (!which.includes("tooltip")) this._tt.sync();
      if (!which.includes("chat")) this._chat.sync();
      if (which.includes("theme")) await ThemeManager.reset(this._editId);
      if (which.includes("tooltip")) await this._tt.reset();
      if (which.includes("chat")) await this._chat.reset();
      ui.notifications.info(L("SBE.Theme.Notifications.Reset"));
      this.render();
    };
    openContextMenu(event, [
      { label: game.i18n.format("SBE.Theme.ResetPart", { part: L(`SBE.Theme.Part.${part}`) }), icon: "fa-solid fa-rotate-left",
        onClick: () => run([part]) },
      { label: L("SBE.Theme.ResetAll"), icon: "fa-solid fa-triangle-exclamation",
        onClick: () => run(["theme", "tooltip", "chat"]) }
    ]);
  }
}
