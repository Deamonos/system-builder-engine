/**
 * SBE — Feuille de l'OBJET.
 * Toute la logique vit dans builder/live-sheet-mixin.mjs (partagée
 * avec les fiches de personnages).
 */

import { LiveSheetMixin } from "../../builder/live-sheet-mixin.mjs";
import { ItemChat } from "../../managers/itemchat/item-chat.mjs";
import { ItemIdentity } from "../../managers/identity/item-identity.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export class SBEObjetSheet extends LiveSheetMixin(HandlebarsApplicationMixin(ItemSheetV2)) {

  static DEFAULT_OPTIONS = {
    actions: {
      sbeShowInChat: SBEObjetSheet.#onShowInChat,
      sbeUnid: SBEObjetSheet.#onUnid
    }
  };

  /** Menu ⋮ de la fiche : « Afficher dans le chat ». */
  _getHeaderControls() {
    const controls = super._getHeaderControls();
    controls.push({ icon: "fa-solid fa-comment", label: "SBE.ItemChat.Show", action: "sbeShowInChat" });
    /* MJ : version inconnue de l'objet (réglée sur le modèle, ou pour cet objet seul). */
    if (game.user.isGM) {
      controls.push({ icon: "fa-solid fa-question", label: "SBE.Unid.Menu", action: "sbeUnid" });
    }
    return controls;
  }

  static #onUnid() {
    return ItemIdentity.dialog(this.document);
  }

  /** Titre : le MJ voit qu'un objet n'est pas identifié. */
  get title() {
    const t = super.title;
    return game.user.isGM && ItemIdentity.isUnidentified(this.document) ? `${t} (${game.i18n.localize("SBE.Unid.Badge")})` : t;
  }

  static #onShowInChat() {
    return ItemChat.post(this.document);
  }
}
