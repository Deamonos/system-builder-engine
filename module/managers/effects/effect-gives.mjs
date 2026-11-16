/**
 * SBE — EFFETS : les OBJETS DONNÉS tant que l'effet dure
 *
 * Une définition d'effet peut donner des objets du monde (les armes
 * d'une forme, la lame d'un sort…). Chaque objet donné a :
 *   - where : la clé du CONTENEUR ou du SLOT de la fiche où il va
 *     (obligatoire : le MJ dit où) ;
 *   - lock  : verrouillé — son porteur ne peut ni le jeter, ni le
 *     donner, ni le déposer ailleurs tant qu'il est donné ;
 *   - end   : à la fin de l'effet, il est retiré (« remove ») ou il
 *     reste (« keep » : il devient un objet comme un autre).
 *
 * Pose de l'effet → l'objet est créé (marqué `flags.<système>.given`) :
 *   - conteneur plein : il attend dans sa zone d'attente ;
 *   - slot occupé : l'occupant retourne d'où il venait (ou attend) et
 *     revient dans le slot quand l'effet se termine.
 * Fin de l'effet → objets retirés (ou gardés), occupants remis en place.
 *
 * Seul le MJ principal écrit ; une file par personnage garde l'ordre
 * (une forme qui en remplace une autre : retrait puis pose, jamais mêlés).
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { isPrimaryGM } from "../../helpers/socket.mjs";
import { slotAccepts } from "../../builder/element-renderer.mjs";
import { dropIntoContainer, sendBack, elementOn, isWaiting, qtyOf, isStackableItem } from "../../builder/inventory.mjs";
import { WaitingItems } from "../waiting/waiting-items.mjs";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
export const GIVE_ENDS = ["remove", "keep"];

/** Les objets donnés d'une définition, toujours propres. */
export function cleanGives(list, draft = false) {
  return (Array.isArray(list) ? list : [])
    .map(g => ({
      uuid: String(g?.uuid ?? "").trim(),
      where: String(g?.where ?? "").trim(),
      lock: !!g?.lock,
      end: GIVE_ENDS.includes(g?.end) ? g.end : "remove"
    }))
    .filter(g => g.uuid && (draft || g.where));
}

/** Une ligne neuve (objet glissé dans l'éditeur). */
export function newGive(uuid) {
  return { uuid: String(uuid ?? ""), where: "", lock: true, end: "remove" };
}

/** Prévient le(s) MJ (jamais les joueurs). */
function tellGM(key, data) {
  ui.notifications.warn(L(key, data));
}

export class EffectGives {

  static #queues = new Map();

  static init() {
    /* Retour en arrière (managers/undo) : les objets donnés reviennent
       ou repartent avec lui, rien à redonner ni à reprendre. */
    Hooks.on("createActiveEffect", (ae, options) => {
      if (!isPrimaryGM() || options?.sbeUndo || ae.parent?.documentName !== "Actor") return;
      this.#queue(ae.parent, () => this.#give(ae));
    });
    Hooks.on("deleteActiveEffect", (ae, options) => {
      if (!isPrimaryGM() || options?.sbeUndo || ae.parent?.documentName !== "Actor") return;
      this.#queue(ae.parent, () => this.#takeBack(ae));
    });
  }

  /** Une file par personnage : chaque geste attend le précédent. */
  static #queue(actor, fn) {
    const k = actor.uuid;
    const prev = this.#queues.get(k) ?? Promise.resolve();
    const next = prev.then(fn).catch(err => console.warn("SBE | Objets donnés par un effet", err));
    this.#queues.set(k, next);
    next.then(() => { if (this.#queues.get(k) === next) this.#queues.delete(k); });
  }

  /** La définition d'un effet posé (copie voyageuse d'un effet d'objet). */
  static async #defOf(ae) {
    const { EffectManager, cleanDef } = await import("./effect-manager.mjs");
    const f = ae.flags?.[SYSTEM_ID] ?? {};
    return f.def ? cleanDef(f.def) : EffectManager.getDef(f.key ?? "");
  }

  /* ============================================================ */
  /*  Pose : donner                                                */
  /* ============================================================ */

  static async #give(ae) {
    const actor = ae.parent;
    const def = await this.#defOf(ae);
    if (!def?.gives?.length || !actor?.items) return;
    let waited = false;
    for (const g of def.gives) {
      const src = await fromUuid(g.uuid).catch(() => null);
      if (src?.type !== "objet") { tellGM("SBE.Effects.Gives.Missing", { effect: def.label || def.key }); continue; }
      const el = elementOn(actor, g.where);
      if (!["container", "slot"].includes(el?.kind)) {
        tellGM("SBE.Effects.Gives.NoKey", { name: src.name, key: g.where, actor: actor.name });
        continue;
      }
      if (slotAccepts(el, src, actor)) {
        tellGM("SBE.Effects.Gives.Refused", { name: src.name, key: g.where, actor: actor.name });
        continue;
      }
      const given = { effect: ae.id, lock: g.lock, end: g.end };
      if (el.kind === "slot") {
        /* Slot occupé : l'occupant laisse la place (il reviendra). Si
           c'était déjà un objet donné, c'est SON occupant d'origine qui
           reviendra (une forme qui en remplace une autre). */
        const occ = actor.items.find(i => i.type === "objet" && !isWaiting(i)
          && !String(i.system?.carry?.host ?? "") && i.system?.carry?.where === el.key);
        if (occ) {
          const res = await sendBack(actor, occ, { overflow: true });
          if (!res) { tellGM("SBE.Effects.Gives.NoPlace", { name: src.name, actor: actor.name }); continue; }
          if (res === "overflow") waited = true;
          const prevGiven = occ.flags?.[SYSTEM_ID]?.given;
          given.back = prevGiven ? (prevGiven.back ?? "") : occ.id;
        }
        given.slot = el.key;
      }
      const res = await dropIntoContainer({
        sheetDoc: actor, el, item: src, quantity: isStackableItem(src) ? qtyOf(src) : null,
        overflow: true, stamp: { given }, quiet: true
      }).catch(() => false);
      if (!res) tellGM("SBE.Effects.Gives.NoPlace", { name: src.name, actor: actor.name });
      if (res === "overflow") waited = true;
    }
    if (waited) WaitingItems.notify(actor);
  }

  /* ============================================================ */
  /*  Fin : reprendre                                              */
  /* ============================================================ */

  static async #takeBack(ae) {
    const actor = ae.parent;
    if (!actor?.items) return;
    const mine = actor.items.filter(i => i.flags?.[SYSTEM_ID]?.given?.effect === ae.id);
    for (const it of mine) {
      const g = it.flags[SYSTEM_ID].given;
      if (g.end === "keep") {
        await it.update({ [`flags.${SYSTEM_ID}.given`]: null });
        continue;
      }
      await it.delete();
      /* L'occupant d'origine reprend son slot, s'il est libre. */
      const back = g.back ? actor.items.get(g.back) : null;
      const el = back && g.slot ? elementOn(actor, g.slot) : null;
      if (!back || el?.kind !== "slot") continue;
      const taken = actor.items.some(i => i.type === "objet" && !isWaiting(i)
        && !String(i.system?.carry?.host ?? "") && i.system?.carry?.where === el.key);
      if (taken) continue;
      await dropIntoContainer({
        sheetDoc: actor, el, item: back, quantity: isStackableItem(back) ? qtyOf(back) : null, quiet: true
      }).catch(() => false);
    }
  }
}
