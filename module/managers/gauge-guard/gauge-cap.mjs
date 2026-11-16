/**
 * SBE — UNE JAUGE NE RESTE JAMAIS AU-DESSUS DE SON MAXIMUM
 *
 * Les bornes s'appliquent déjà à chaque ÉCRITURE (clampValueChanges).
 * Il restait deux cas où une jauge saisie pouvait afficher « 100 / 75 » :
 *
 * 1. CRÉATION : la valeur par défaut du modèle (100) dépasse le maximum
 *    réel de la fiche (formule, attributs, sous-clé « clé_max ») ;
 * 2. LE MAXIMUM BAISSE sans que la valeur soit écrite : un attribut
 *    change, un effet ou un objet porté retire du maximum, le modèle
 *    change sa formule.
 *
 * Dans ces deux cas, la valeur est ramenée au maximum (jamais remontée,
 * jamais poussée au-dessus du minimum). Écrite par le MJ principal, en
 * écriture silencieuse : pas de points temporaires encaissés, pas de
 * « dégâts reçus », pas de traces, pas de débordement vers une autre
 * clé — ce n'est pas une perte de jeu, juste la borne qui suit.
 */

import { walkElements, valueBounds } from "../../builder/element-renderer.mjs";
import { docScope } from "../../builder/doc-context.mjs";
import { isPrimaryGM } from "../../helpers/socket.mjs";

const PENDING = new Map();

export class GaugeCap {

  static init() {
    const soon = (actor) => {
      if (!actor || actor.type !== "personnage" || !isPrimaryGM()) return;
      const id = actor.uuid;
      clearTimeout(PENDING.get(id)?.t);
      PENDING.set(id, { actor, t: setTimeout(() => { PENDING.delete(id); this.cap(actor); }, 60) });
    };
    const ofParent = (doc) => {
      const p = doc?.parent;
      if (p?.documentName === "Actor") soon(p);
    };
    Hooks.on("createActor", (a, options) => { if (!options?.sbeCap) soon(a); });
    Hooks.on("updateActor", (a, _c, options) => {
      if (options?.sbeCap) return;
      if (a.type === "template" && !a.parent) {
        for (const d of a.dependentActors ?? []) soon(d);
        return;
      }
      soon(a);
    });
    Hooks.on("updateActorDelta", (delta, _c, options) => { if (!options?.sbeCap) soon(delta.parent?.actor); });
    for (const h of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect", "createItem", "updateItem", "deleteItem"]) {
      Hooks.on(h, (doc) => ofParent(doc));
    }
    /* Au chargement : les fiches déjà au-dessus (créées avant cette règle). */
    Hooks.once("ready", () => {
      if (!isPrimaryGM()) return;
      for (const a of game.actors) if (a.type === "personnage") soon(a);
    });
  }

  /** Ramène sous leur maximum les jauges saisies de la fiche. */
  static async cap(actor) {
    if (!actor || actor.type !== "personnage" || !isPrimaryGM()) return;
    if (!actor.isToken && !game.actors.has(actor.id)) return;
    const els = actor.system?.template?.system?.elements ?? [];
    const gauges = [...walkElements(els)].filter(e => e?.kind === "gauge" && e.key && !e.config?.computed);
    if (!gauges.length) return;
    const values = actor.system?.values ?? {};
    let scope;
    try { scope = docScope(actor); } catch (_e) { return; }
    const all = { ...values, ...scope };
    const updates = {};
    for (const el of gauges) {
      const raw = el.key in values ? values[el.key] : el.config?.default;
      const n = Number(raw);
      if (raw === "" || raw === null || raw === undefined || !Number.isFinite(n)) continue;
      const { min, max } = valueBounds(el, all);
      if (!Number.isFinite(max) || n <= max) continue;
      const v = Math.max(max, Number.isFinite(min) ? min : max);
      if (v !== n) updates[`system.values.${el.key}`] = v;
    }
    if (!Object.keys(updates).length) return;
    try {
      await actor.update(updates, { sbeCap: true, sbeUndo: true, sbeDirect: true, render: true });
    } catch (err) {
      console.warn("SBE | Jauge ramenée à son maximum : échec", actor.name, err);
    }
  }
}
