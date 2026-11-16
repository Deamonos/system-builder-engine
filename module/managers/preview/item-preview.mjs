/**
 * SBE — APERÇU D'UN OBJET DEPUIS UN LIEN
 *
 * Un journal (livre de règles, liste de sorts…) cite un objet par un
 * lien @UUID. Un joueur qui n'a pas le droit d'ouvrir cet objet (objet
 * du monde caché, compendium fermé, objet porté par un autre) recevait
 * « permission insuffisante ». Il voit maintenant une petite fenêtre en
 * lecture seule : l'icône, le nom, les étiquettes et la description.
 *
 * Le MJ, et le joueur qui a le droit d'observer l'objet, ouvrent la
 * vraie fiche comme d'habitude : on n'intervient que là où Foundry
 * aurait refusé.
 *
 * Ce que montre l'aperçu est ce qu'un joueur peut voir : un objet non
 * identifié garde sa version inconnue (le masque est posé à la
 * préparation de l'objet), les étiquettes masquées et les secrets de
 * la description restent dehors, et un objet dont le modèle est « MJ
 * seulement » n'est jamais montré.
 */

import { tagList } from "../../builder/element-renderer.mjs";
import { isGmOnlyItem } from "../../builder/inventory.mjs";

const { ApplicationV2 } = foundry.applications.api;
const L = (k) => game.i18n.localize(k);
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const OBSERVER = () => CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;

export class ItemPreview {

  static init() {
    /* Phase de CAPTURE : on passe avant Foundry, qui refuserait l'ouverture. */
    document.addEventListener("click", (ev) => this.#onClick(ev), true);
  }

  /** Clic sur un lien de contenu : aperçu si Foundry refuserait la fiche. */
  static #onClick(ev) {
    const a = ev.target?.closest?.("a.content-link");
    if (!a || game.user?.isGM) return;
    const uuid = a.dataset?.uuid;
    if (!uuid || (a.dataset.type && a.dataset.type !== "Item")) return;
    const target = this.#blocked(uuid);
    if (!target) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    this.open(target.uuid).catch(err => console.warn("SBE | Aperçu d'objet", err));
  }

  /**
   * Faut-il l'aperçu ? (décision SYNCHRONE : elle doit tomber avant
   * Foundry). Renvoie { uuid } si le joueur ne peut pas ouvrir la fiche.
   */
  static #blocked(uuid) {
    let parsed = null;
    try { parsed = foundry.utils.parseUuid(uuid); } catch (_e) { return null; }
    if (parsed?.type !== "Item" && parsed?.documentType !== "Item") return null;
    /* Compendium : c'est le paquet qui donne le droit de lire. */
    if (parsed.collection instanceof foundry.documents.collections.CompendiumCollection) {
      const pack = parsed.collection;
      const can = pack.testUserPermission?.(game.user, "OBSERVER") ?? pack.visible;
      return can ? null : { uuid };
    }
    let doc = null;
    try { doc = fromUuidSync(uuid); } catch (_e) { doc = null; }
    if (!doc || doc.documentName !== "Item") return null;
    if (doc.testUserPermission?.(game.user, OBSERVER())) return null;
    return { uuid };
  }

  /** Ouvre l'aperçu d'un objet (n'importe quel client). */
  static async open(uuid) {
    const item = await fromUuid(uuid).catch(() => null);
    if (!item || item.documentName !== "Item") {
      ui.notifications.warn(L("SBE.ItemPreview.NotFound"));
      return null;
    }
    /* Un objet « MJ seulement » ne se montre pas aux joueurs, même par un lien. */
    if (!game.user.isGM && isGmOnlyItem(item)) {
      ui.notifications.warn(L("SBE.ItemPreview.Hidden"));
      return null;
    }
    const id = `sbe-item-preview-${item.uuid.replace(/[^a-zA-Z0-9]/g, "-")}`;
    const open = foundry.applications.instances.get(id);
    if (open) { open.bringToFront?.(); return open; }
    const app = new SBEItemPreviewApp({ id, item });
    await app.render({ force: true });
    return app;
  }
}

/* ============================================================ */
/*  La fenêtre                                                   */
/* ============================================================ */

export class SBEItemPreviewApp extends ApplicationV2 {

  static DEFAULT_OPTIONS = {
    tag: "div",
    classes: ["sbe-item-preview"],
    window: { icon: "fa-solid fa-book-open", resizable: true },
    position: { width: 460, height: "auto" }
  };

  constructor(options = {}) {
    super(options);
    this.item = options.item;
  }

  get title() { return this.item?.name ?? ""; }

  async _renderHTML() {
    const item = this.item;
    const tpl = item.system?.template;
    /* Étiquettes vues d'un joueur (les masquées restent dehors). */
    let tags = [];
    try { tags = tagList(tpl?.system?.elements ?? [], item.system?.values ?? {}, false); } catch (_e) { tags = []; }
    let desc = "";
    try {
      desc = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        item.system?.description ?? "", { relativeTo: item, secrets: false });
    } catch (_e) { desc = ""; }
    const hasDesc = !!String(desc).replace(/<[^>]*>/g, "").trim();
    const div = document.createElement("div");
    div.className = "sbe-ipv";
    div.innerHTML = `
      <header class="sbe-ipv-head">
        <img src="${esc(item.img || "icons/svg/item-bag.svg")}" alt="">
        <div class="sbe-ipv-titles">
          <h2>${esc(item.name)}</h2>
          ${tags.length ? `<div class="sbe-ipv-tags">${tags.map(t =>
            `<span class="sbe-tag${t.color ? " sbe-tag--colored" : ""}"${t.color ? ` style="--sbe-tagc:${t.color}"` : ""}>${esc(t.text)}</span>`).join("")}</div>` : ""}
        </div>
      </header>
      <div class="sbe-ipv-desc">${hasDesc ? desc : `<p class="sbe-ipv-none">${esc(L("SBE.ItemChat.NoDescription"))}</p>`}</div>`;
    return div;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }
}
