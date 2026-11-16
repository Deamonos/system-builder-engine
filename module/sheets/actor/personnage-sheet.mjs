/**
 * SBE — Feuille de PERSONNAGE : la fiche vivante partagée avec les
 * objets, ancrée sur un Actor. PJ/PNJ est automatique : une fiche
 * possédée par un joueur est un PJ, sinon un PNJ (badge d'en-tête).
 *
 * Thème : si le modèle a décoché « Utiliser le thème général », la
 * fiche reprend l'apparence native de Foundry + les réglages propres
 * au modèle (classes .sbe-window + .sbe-tpltheme-<idModèle>).
 */

import { LiveSheetMixin } from "../../builder/live-sheet-mixin.mjs";
import { TemplateTheme } from "../../managers/theme/template-theme.mjs";
import { IdentityManager } from "../../managers/identity/identity-manager.mjs";
import { MerchantManager } from "../../managers/merchant/merchant-manager.mjs";
import { SBEMerchantApp } from "../../managers/merchant/merchant-app.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export class SBEPersonnageSheet extends LiveSheetMixin(HandlebarsApplicationMixin(ActorSheetV2)) {

  static DEFAULT_OPTIONS = {
    actions: { sbeMerchant: SBEPersonnageSheet.#onMerchant }
  };

  /** Menu ⋮ de la fiche (MJ) : « Marchand » (réglages de ce marchand). */
  _getHeaderControls() {
    const controls = super._getHeaderControls();
    if (game.user.isGM) controls.push({ icon: "fa-solid fa-store", label: "SBE.Merchant.Menu", action: "sbeMerchant" });
    return controls;
  }


  static #onMerchant() {
    return SBEMerchantApp.open(this.document);
  }

  /** Taille à L'OUVERTURE définie sur le modèle (thème → Interface).
      La fenêtre reste redimensionnable ensuite — rien n'est figé. */
  _initializeApplicationOptions(options) {
    options = super._initializeApplicationOptions(options);
    const iface = options.document?.system?.template?.system?.theme?.interface;
    const w = Number(iface?.sheetW) || 0;
    const h = Number(iface?.sheetH) || 0;
    if (w || h) {
      options.position = { ...options.position };
      if (w) options.position.width = Math.max(200, w);
      if (h) options.position.height = Math.max(200, h);
    }
    return options;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const tpl = this.document.system.template;
    const off = tpl?.system.theme?.useGlobal === false;
    this.element.classList.toggle("sbe-window", off);
    if (tpl) this.element.classList.toggle(TemplateTheme.sheetClass(tpl.id), off);
    TemplateTheme.applyDecorations(this, tpl);
    /* MJ : bouton œil « révéler / masquer l'identité » (PNJ seulement). */
    IdentityManager.headerButton(this);
    /* MJ : bouton « boutique ouverte / fermée » (marchands). */
    MerchantManager.headerButton(this);
  }
}
