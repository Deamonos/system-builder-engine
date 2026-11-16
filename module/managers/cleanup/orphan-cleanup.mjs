/**
 * SBE — Nettoyage des OBJETS ORPHELINS
 *
 * Règle actée : jamais d'objet orphelin. Trois situations :
 *
 * 1. MODÈLE D'ATELIER (template) supprimé alors que des objets s'en
 *    servent → la suppression est BLOQUÉE tant qu'il reste des objets,
 *    PORTÉS COMPRIS (le contrôle ne voyait que les objets du monde :
 *    c'est par ce trou qu'un objet porté pouvait devenir orphelin).
 *
 * 2. MODÈLE D'OBJET (objet du monde) supprimé → ses exemplaires le
 *    suivent EN CASCADE, partout : fiches, jetons non liés, objets du
 *    monde, coffres. Une seule confirmation, chiffrée.
 *
 * 3. OBJET HÔTE supprimé (une arme avec des balles dans son chargeur)
 *    → ce qu'il contenait REVIENT dans l'inventaire du personnage,
 *    au lieu de disparaître dans un hôte qui n'existe plus.
 *
 * Et pour ce qui existe déjà (mondes antérieurs à ces protections),
 * un examen au chargement du monde, côté MJ : les objets dont le
 * modèle d'atelier a disparu sont listés et peuvent être supprimés ;
 * les objets « égarés » (hôte disparu) sont rangés sans rien demander.
 */

import { walkElements, slotAccepts, isRefList } from "../../builder/element-renderer.mjs";
import { findItems, removeItems, summarize, countUnits } from "../locations/item-locations.mjs";

export class OrphanCleanup {

  static _bound = false;

  static init() {
    if (this._bound) return;
    this._bound = true;
    /* Retour en arrière (managers/undo) : ce qui en dépendait revient seul. */
    Hooks.on("deleteItem", (item, options, userId) => { if (!options?.sbeUndo) this._onDeleteItem(item, options, userId); });
    Hooks.once("ready", () => {
      if (game.user.isGM && game.users.activeGM?.isSelf) this.scan();
    });
  }

  /* ---------------------------------------------------------- */
  /*  Recensement — tout passe par le REGISTRE DES EMPLACEMENTS   */
  /* ---------------------------------------------------------- */

  /** Les objets PORTÉS (fiches, jetons non liés) répondant au critère. */
  static carried(predicate) {
    return findItems((view, doc) => !!doc && predicate(doc))
      .filter(h => h.carried && h.item)
      .map(h => ({ item: h.item, label: h.label }));
  }

  /** Résumé « Jack ×2, Sam » pour les messages. */
  static summary(list, max = 6) {
    return summarize(list, max);
  }

  /**
   * Les lignes de la fenêtre de cascade, à partir des trouvailles du
   * registre : portés, monde, puis UNE ligne par autre emplacement
   * (coffres aujourd'hui ; sol, tourelles, marchands demain) — sans
   * qu'il faille rien ajouter ici quand un emplacement apparaît.
   */
  static cascadeLines(hits, { worldKey = "SBE.Orphan.TplWorld" } = {}) {
    const L = (k, d) => game.i18n.format(k, d);
    const esc = (x) => foundry.utils.escapeHTML(String(x ?? ""));
    const carried = hits.filter(h => h.carried);
    const world = hits.filter(h => h.location === "world");
    const others = new Map();
    for (const h of hits) {
      if (h.carried || h.location === "world") continue;
      if (!others.has(h.location)) others.set(h.location, []);
      others.get(h.location).push(h);
    }
    const lines = [];
    if (carried.length) lines.push(L("SBE.Orphan.TplCarried", { n: countUnits(carried), who: esc(summarize(carried)) }));
    if (world.length) lines.push(L(worldKey, { n: world.length }));
    for (const list of others.values()) {
      lines.push(L("SBE.Orphan.TplElsewhere", { n: countUnits(list), who: esc(summarize(list)) }));
    }
    return lines;
  }

  /**
   * LA fenêtre d'avertissement de toutes les suppressions en cascade
   * (modèles d'objets, modèles de personnages…) : même présentation,
   * mêmes boutons, partout. Jamais de blocage — on prévient, chiffres
   * à l'appui, et le MJ décide.
   * @param {object} p
   * @param {string}   p.title  titre de la fenêtre
   * @param {string}   p.intro  phrase d'introduction (HTML déjà échappé)
   * @param {string[]} p.lines  une ligne par famille touchée (HTML)
   * @param {string}   p.warn   avertissement final
   * @returns {Promise<boolean>}
   */
  static async confirmCascade({ title, intro, lines, warn }) {
    return foundry.applications.api.DialogV2.confirm({
      window: { title },
      position: { width: 480 },
      content: `<div class="sbe-propag">
        <p>${intro}</p>
        <div class="sbe-propag-box"><ul>${lines.map(l => `<li>${l}</li>`).join("")}</ul></div>
        <p class="notes"><i class="fa-solid fa-triangle-exclamation"></i> ${warn}</p>
      </div>`,
      rejectClose: false
    }).catch(() => false);
  }

  /* ---------------------------------------------------------- */
  /*  3. Un objet hôte disparaît : son contenu revient            */
  /* ---------------------------------------------------------- */

  static async _onDeleteItem(item, _options, userId) {
    if (userId !== game.user.id) return;
    const actor = item?.parent;
    if (actor?.documentName !== "Actor" || item.type !== "objet") return;
    const children = actor.items.filter(i => i.type === "objet"
      && String(i.system?.carry?.host ?? "") === item.id);
    if (!children.length) return;
    /* Le contenu remonte d'un étage : là où était l'hôte. */
    const host = String(item.system?.carry?.host ?? "");
    const updates = children.map(c => ({
      _id: c.id,
      "system.carry.host": host,
      "system.carry.where": host ? "" : this.firstContainerFor(actor, c)
    }));
    try {
      await actor.updateEmbeddedDocuments("Item", updates);
      ui.notifications.info(game.i18n.format("SBE.Orphan.Rehomed", {
        n: children.length, name: item.name
      }));
    } catch (err) {
      console.warn("SBE | Rangement du contenu d'un objet supprimé en échec", err);
    }
  }

  /** Premier conteneur de la fiche qui accepte cet objet ("" sinon). */
  static firstContainerFor(actor, item) {
    const tpl = actor?.system?.template;
    for (const el of walkElements(tpl?.system?.elements ?? [])) {
      if (el?.kind !== "container" || !el.key || isRefList(el)) continue;
      if (!slotAccepts(el, item, actor)) return el.key;
    }
    return "";
  }

  /* ---------------------------------------------------------- */
  /*  Examen au chargement du monde                              */
  /* ---------------------------------------------------------- */

  static async scan() {
    /* Objets égarés : leur hôte n'existe plus → rangés d'office. */
    let rehomed = 0;
    const lost = this.carried(it => {
      const h = String(it.system?.carry?.host ?? "");
      return !!h && !it.parent?.items?.get(h);
    });
    for (const { item } of lost) {
      try {
        await item.update({
          "system.carry.host": "",
          "system.carry.where": this.firstContainerFor(item.parent, item)
        });
        rehomed++;
      } catch (_e) { /* jeton non modifiable : on laisse */ }
    }
    if (rehomed) {
      ui.notifications.info(game.i18n.format("SBE.Orphan.LostFixed", { n: rehomed }));
    }

    /* Objets FANTÔMES : portés par un personnage mais rangés nulle part
       (ni conteneur, ni slot, ni hôte) — doublons laissés par l'ancien
       dépôt natif de Foundry. Invisibles dans l'inventaire, ils
       apparaissaient pourtant dans le HUD. Le MJ choisit. */
    /* Un objet de scène posé (pion du personnage « prop ») n'est rangé
       nulle part par nature : il est sur la scène. */
    const ghosts = this.carried(it => it.type === "objet" && it.parent?.documentName === "Actor"
      && it.parent.type !== "prop"
      && !String(it.system?.carry?.host ?? "") && !String(it.system?.carry?.where ?? ""));
    if (ghosts.length) await this.offerGhosts(ghosts);

    /* Objets orphelins : leur modèle d'atelier a disparu — où qu'ils
       soient (fiches, jetons, monde, coffres, et tout emplacement
       inscrit plus tard). */
    const orphans = findItems(v => {
      if (v.type !== "objet") return false;
      const tid = v.system?.templateId;
      return !tid || !game.items.get(tid);
    });
    if (!orphans.length) return;
    await this.offerDelete(orphans);
  }

  /** Objets rangés nulle part : supprimer, ou ranger dans l'inventaire. */
  static async offerGhosts(ghosts) {
    const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
    const L = (k) => game.i18n.localize(k);
    const rows = ghosts.slice(0, 12)
      .map(g => `<li><b>${esc(g.item.name)}</b> — ${esc(g.label)}</li>`).join("");
    const more = ghosts.length > 12 ? `<li>+${ghosts.length - 12}</li>` : "";
    const res = await foundry.applications.api.DialogV2.wait({
      window: { title: L("SBE.Orphan.GhostTitle") },
      position: { width: 480 },
      content: `<div class="sbe-propag">
        <p>${game.i18n.format("SBE.Orphan.GhostIntro", { n: ghosts.length })}</p>
        <div class="sbe-propag-box"><ul>${rows}${more}</ul></div>
        <p class="notes">${L("SBE.Orphan.GhostHint")}</p>
      </div>`,
      buttons: [
        { action: "delete", label: L("SBE.Orphan.GhostDelete"), icon: "fa-solid fa-trash", default: true },
        { action: "store", label: L("SBE.Orphan.GhostStore"), icon: "fa-solid fa-box-open" },
        { action: "later", label: L("SBE.Orphan.Later"), icon: "fa-solid fa-clock" }
      ],
      rejectClose: false
    }).catch(() => null);
    let n = 0;
    for (const { item } of ghosts) {
      try {
        if (res === "delete") { await item.delete(); n++; }
        else if (res === "store") {
          /* Rattaché à son modèle (même id, ou même nom et même plan). */
          const model = game.items.get(item.id)
            ?? game.items.find(m => m.type === "objet" && !m.system?.modelId && m.name === item.name
              && m.system?.templateId === item.system?.templateId);
          await item.update({
            "system.carry.where": this.firstContainerFor(item.parent, item),
            ...(model && !item.system?.modelId ? { "system.modelId": model.id } : {})
          });
          n++;
        }
      } catch (_e) { /* jeton non modifiable : on laisse */ }
    }
    if (n) ui.notifications.info(game.i18n.format(res === "delete" ? "SBE.Orphan.GhostDeleted" : "SBE.Orphan.GhostStored", { n }));
  }

  /** Propose la suppression d'une liste d'orphelins (trouvailles du registre). */
  static async offerDelete(orphans) {
    const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
    const L = (k) => game.i18n.localize(k);
    const rows = orphans.slice(0, 12)
      .map(o => `<li><b>${esc(o.view?.name ?? o.item?.name)}</b> — ${esc(o.label)}</li>`).join("");
    const more = orphans.length > 12 ? `<li>+${orphans.length - 12}</li>` : "";
    const n = countUnits(orphans);
    const res = await foundry.applications.api.DialogV2.wait({
      window: { title: L("SBE.Orphan.Title") },
      position: { width: 460 },
      content: `<div class="sbe-propag">
        <p>${game.i18n.format("SBE.Orphan.Intro", { n })}</p>
        <div class="sbe-propag-box"><ul>${rows}${more}</ul></div>
        <p class="notes">${L("SBE.Orphan.Hint")}</p>
      </div>`,
      buttons: [
        { action: "delete", label: game.i18n.format("SBE.Orphan.Delete", { n }),
          icon: "fa-solid fa-trash", default: true },
        { action: "later", label: L("SBE.Orphan.Later"), icon: "fa-solid fa-clock" }
      ],
      rejectClose: false
    }).catch(() => null);
    if (res !== "delete") return;
    const done = await removeItems(orphans);
    ui.notifications.info(game.i18n.format("SBE.Orphan.Deleted", { n: done }));
  }
}
