/**
 * SBE — Feuille du MODÈLE de personnage : le même atelier que les
 * objets, ancré sur un Actor (mixin partagé).
 *
 * Spécifique aux modèles de personnage : le manager de thème DU MODÈLE
 * dans le menu ⋮ de la fenêtre. Coché (défaut) : le modèle suit le
 * thème général. Décoché : base native de Foundry + les réglages
 * propres au modèle (palette, habillage, CSS) par-dessus — appliqués
 * au modèle ET à toutes ses fiches (classes .sbe-window +
 * .sbe-tpltheme-<id>, feuille injectée par TemplateTheme).
 */

import { WorkshopMixin } from "../../builder/workshop-mixin.mjs";
import { TemplateTheme } from "../../managers/theme/template-theme.mjs";
import { SBETemplateThemeConfig } from "../../managers/theme/template-theme-config.mjs";
import { openHudConfig } from "../../managers/hud/hud-config.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export class SBEActorTemplateSheet extends WorkshopMixin(HandlebarsApplicationMixin(ActorSheetV2)) {

  static DEFAULT_OPTIONS = {
    actions: {
      sbeTemplateTheme: SBEActorTemplateSheet.#onTemplateTheme,
      sbeTemplateHud: SBEActorTemplateSheet.#onTemplateHud,
      sbeTemplateGenre: SBEActorTemplateSheet.#onTemplateGenre
    }
  };

  /** Taille à L'OUVERTURE (thème → Interface) : vaut aussi pour
      l'atelier du modèle. Fenêtre toujours redimensionnable. */
  _initializeApplicationOptions(options) {
    options = super._initializeApplicationOptions(options);
    const iface = options.document?.system?.theme?.interface;
    const w = Number(iface?.sheetW) || 0;
    const h = Number(iface?.sheetH) || 0;
    if (w || h) {
      options.position = { ...options.position };
      if (w) options.position.width = Math.max(200, w);
      if (h) options.position.height = Math.max(200, h);
    }
    return options;
  }

  /** Entrée « Thème du modèle » dans le menu ⋮ de la fenêtre. */
  _getHeaderControls() {
    const controls = super._getHeaderControls();
    controls.push({
      icon: "fa-solid fa-palette",
      label: "SBE.Actor.ThemeMenu",
      action: "sbeTemplateTheme"
    });
    /* Le HUD de ce modèle (chaque modèle a le sien). */
    if (game.user.isGM) controls.push({
      icon: "fa-solid fa-gamepad",
      label: "SBE.Hud.SheetMenu",
      action: "sbeTemplateHud"
    });
    /* Genre du modèle : une fiche de personnage, ou une boutique de marchand. */
    if (game.user.isGM) controls.push({
      icon: this.document.system.genre === "shop" ? "fa-solid fa-user" : "fa-solid fa-store",
      label: this.document.system.genre === "shop" ? "SBE.Shop.GenreToCharacter" : "SBE.Shop.GenreToShop",
      action: "sbeTemplateGenre"
    });
    return controls;
  }

  /** Applique les classes de thème + décorations SVG du modèle. */
  _onRender(context, options) {
    super._onRender(context, options);
    const off = this.document.system.theme?.useGlobal === false;
    this.element.classList.toggle("sbe-window", off);
    this.element.classList.toggle(TemplateTheme.sheetClass(this.document.id), off);
    TemplateTheme.applyDecorations(this, this.document);
  }

  static async #onTemplateGenre() {
    const toShop = this.document.system.genre !== "shop";
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize(toShop ? "SBE.Shop.GenreToShop" : "SBE.Shop.GenreToCharacter") },
      content: `<p>${game.i18n.localize(toShop ? "SBE.Shop.GenreToShopHint" : "SBE.Shop.GenreToCharacterHint")}</p>`,
      rejectClose: false
    }).catch(() => false);
    if (!ok) return;
    await this.document.update({ "system.genre": toShop ? "shop" : "character" });
    this.render();
  }

  static #onTemplateHud() {
    openHudConfig(this.document);
  }

  static #onTemplateTheme() {
    new SBETemplateThemeConfig({
      id: `sbe-tpltheme-config-${this.document.id}`,
      document: this.document
    }).render(true);
  }
}
