/**
 * SBE — Réglages des INFO-BULLES (onglet de la fenêtre du thème)
 *
 * Ce n'est plus une fenêtre à part : un PANNEAU que la fenêtre du thème
 * général affiche dans son onglet « Info-bulles ». L'aperçu (une bulle
 * d'exemple, basculable sombre / clair) prend la place de celui du thème
 * en haut de la fenêtre ; les réglages vivent dans l'onglet.
 *
 * Tout s'applique EN DIRECT pendant l'édition ; c'est la fenêtre du
 * thème qui enregistre, exporte, importe et annule.
 */

import { SYSTEM_PATH, getFontFamilies } from "../../helpers/constants.mjs";
import { TooltipManager } from "./tooltip-manager.mjs";
import { colorPair } from "../chat/chat-cards.mjs";
import { ThemeLibrary } from "../theme/theme-library.mjs";

const TEMPLATE = `${SYSTEM_PATH}/templates/managers/tooltip-config.hbs`;

export class TooltipPanel {

  /** Réglages en cours d'édition (null = ceux enregistrés). */
  working = null;
  /** Thème en cours d'édition (bibliothèque de thèmes). */
  themeId = null;
  pTheme = "dark";
  form = null;
  #timer = null;

  /** Réglages affichés : la copie de travail, sinon l'enregistré. */
  current() {
    return foundry.utils.deepClone(this.working ?? TooltipManager.getConfig(this.themeId));
  }

  /** Complète un objet brut avec les défauts. */
  static normalize(raw) {
    const cfg = foundry.utils.mergeObject(foundry.utils.deepClone(TooltipManager.DEFAULTS), raw ?? {}, { inplace: false });
    cfg.schemaVersion = TooltipManager.DEFAULTS.schemaVersion;
    return cfg;
  }

  /**
   * Dessine le panneau : l'aperçu dans `topEl`, les réglages dans
   * `paneEl` (dans leur propre formulaire).
   */
  async render(topEl, paneEl) {
    const config = this.current();
    for (const k of ["bg", "text", "borderColor"]) config[k] = colorPair(config[k]);
    const html = await foundry.applications.handlebars.renderTemplate(TEMPLATE, {
      config,
      previewLight: this.pTheme === "light",
      fontFamilies: getFontFamilies(),
      shadowChoices: {
        "": "SBE.Tooltip.ShadowDefault",
        none: "SBE.Tooltip.ShadowNone",
        soft: "SBE.Tooltip.ShadowSoft",
        strong: "SBE.Tooltip.ShadowStrong"
      }
    });
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    topEl.replaceChildren(...[".sbe-tooltip-ptheme", ".sbe-tooltip-preview-wrap"]
      .map(s => tmp.querySelector(s)).filter(Boolean));
    const form = document.createElement("form");
    form.className = "sbe-thpanel-form";
    form.addEventListener("submit", (ev) => ev.preventDefault());
    const body = tmp.querySelector(".sbe-tooltip-body");
    if (body) form.append(body);
    paneEl.replaceChildren(form);
    this.form = form;

    /* Aperçu sombre / clair, quel que soit le thème de Foundry. */
    for (const b of topEl.querySelectorAll("[data-ptheme]")) {
      b.addEventListener("click", () => {
        this.pTheme = b.dataset.ptheme === "light" ? "light" : "dark";
        const pv = topEl.querySelector(".sbe-tooltip-preview-wrap");
        pv?.classList.toggle("theme-light", this.pTheme === "light");
        pv?.classList.toggle("theme-dark", this.pTheme !== "light");
        for (const x of topEl.querySelectorAll("[data-ptheme]")) x.classList.toggle("active", x === b);
      });
    }
    /* Aperçu EN DIRECT : chaque saisie réapplique la feuille. */
    const live = () => {
      clearTimeout(this.#timer);
      this.#timer = setTimeout(() => this.sync(), 250);
    };
    form.addEventListener("change", live);
    form.addEventListener("input", live);
  }

  /** Formulaire → copie de travail, appliquée aussitôt. */
  sync() {
    clearTimeout(this.#timer);
    if (!this.form?.isConnected) return this.working;
    const data = foundry.utils.expandObject(new foundry.applications.ux.FormDataExtended(this.form).object);
    this.working = TooltipPanel.normalize(data);
    TooltipManager.apply(this.working);
    return this.working;
  }

  /** Remplace ce qui est affiché (import), sans rien enregistrer. */
  load(raw) {
    this.working = TooltipPanel.normalize(raw);
    TooltipManager.apply(this.working);
  }

  async save() {
    const cfg = this.sync() ?? this.current();
    await ThemeLibrary.write("tooltip", this.themeId, TooltipPanel.normalize(cfg));
    this.working = null;
  }

  async reset() {
    await ThemeLibrary.write("tooltip", this.themeId, foundry.utils.deepClone(TooltipManager.DEFAULTS));
    this.working = null;
    TooltipManager.apply();
  }

  /** Fermeture sans enregistrer : on revient à l'enregistré. */
  cancel() {
    clearTimeout(this.#timer);
    this.working = null;
    TooltipManager.apply();
  }
}
