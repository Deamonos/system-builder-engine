/**
 * SBE — AFFICHER UN OBJET DANS LE CHAT
 *
 * Comme l'ancien système : une carte repliée (image, nom, étiquettes) ;
 * un clic sur l'en-tête déroule la description, puis les listes de
 * références que le MJ a cochées « Envoyer avec la description dans
 * le chat » (par exemple le reflet des munitions compatibles).
 *
 * Ce qui part est ce qu'un JOUEUR peut voir : étiquettes et listes
 * masquées aux joueurs restent dehors, les secrets de la description
 * aussi.
 *
 * Accès : clic droit sur un objet de l'inventaire, ou menu ⋮ de la
 * fiche de l'objet.
 */

import { walkElements, tagList, isRefList, isMirrorList, refIds } from "../../builder/element-renderer.mjs";
import { carrierOf } from "../../builder/inventory.mjs";
import { ChatCards } from "../chat/chat-cards.mjs";

const L = (k) => game.i18n.localize(k);
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

export class ItemChat {

  /** Entrée du menu contextuel (clic droit). */
  static menuEntry(item) {
    if (!item || item.type !== "objet") return null;
    return { label: L("SBE.ItemChat.Show"), icon: "fa-solid fa-comment", onClick: () => this.post(item) };
  }

  /** Les listes à joindre : références cochées « vers le chat ». */
  static #lists(item) {
    const tpl = item.system?.template;
    const values = item.system?.values ?? {};
    let html = "";
    for (const el of walkElements(tpl?.system?.elements ?? [])) {
      if (!isRefList(el) || !el.config?.toChat || el.playerVisible === false) continue;
      const key = isMirrorList(el) ? el.config.mirror : el.key;
      const items = refIds(values, key).map(id => game.items?.get(id)).filter(Boolean);
      if (!items.length) continue;
      html += `<div class="sbe-itemcard-list">
        <div class="sbe-itemcard-list-title">${esc(el.label || el.key)}</div>
        <div class="sbe-itemcard-chips">${items.map(it =>
          `<span class="sbe-itemcard-chip"><img src="${esc(it.img)}" alt="">${esc(it.name)}</span>`).join("")}</div>
      </div>`;
    }
    return html;
  }

  static async post(item) {
    if (!item) return null;
    const tpl = item.system?.template;
    const values = item.system?.values ?? {};
    const tags = tagList(tpl?.system?.elements ?? [], values, false).map(t => t.text);
    let desc = "";
    try {
      desc = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        item.system?.description ?? "", { relativeTo: item, secrets: false });
    } catch (_e) { desc = ""; }
    const hasDesc = !!String(desc).replace(/<[^>]*>/g, "").trim();
    const lists = this.#lists(item);
    const body = `<div class="sbe-itemcard-desc">${hasDesc ? desc : `<em>${esc(L("SBE.ItemChat.NoDescription"))}</em>`}</div>${lists}`;
    const actor = carrierOf(item) ?? (item.parent?.documentName === "Actor" ? item.parent : null);
    return ChatCards.post({
      type: "item",
      icon: item.img,
      title: item.name,
      subtitle: tags.join(" · "),
      body,
      fold: true,
      speaker: ChatMessage.getSpeaker({ actor })
    });
  }
}
