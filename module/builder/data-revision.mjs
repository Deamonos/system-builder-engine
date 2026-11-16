/**
 * SBE — RÉVISION DES DONNÉES
 *
 * Un compteur qui avance à CHAQUE changement susceptible de modifier
 * le résultat d'une formule : un document (personnage, objet, effet,
 * combat, token, scène, utilisateur), l'heure du monde ou un réglage. Un calcul
 * coûteux peut être gardé tant que le compteur n'a pas bougé : la
 * fiche d'un porteur, lue par chacun de ses objets pendant un même
 * affichage, n'est calculée qu'une fois.
 */

let REV = 0;
const bump = () => { REV++; };

const HOOKS = [
  "Actor", "Item", "ActiveEffect", "Combat", "Combatant", "Token", "Scene", "User"
].flatMap(d => [`create${d}`, `update${d}`, `delete${d}`])
  .concat(["updateWorldTime", "updateSetting", "createSetting", "canvasReady"]);
for (const h of HOOKS) Hooks.on(h, bump);

/** Révision courante (pour un cache qui n'est pas indexé par document). */
export function revision() { return REV; }

/*
 * Révision des OBJETS : comme la précédente, sauf les changements de
 * fiche, de pion, de scène et d'utilisateur. Les calculs propres à un
 * objet (ses formules, ses repères) ne lisent que lui et ce qu'il
 * contient : un PV perdu ou un pas de pion ne les refait pas.
 */
let ITEM_REV = 0;
const ITEM_HOOKS = ["Item", "ActiveEffect", "Combat", "Combatant"]
  .flatMap(d => [`create${d}`, `update${d}`, `delete${d}`])
  .concat(["updateWorldTime", "updateSetting", "createSetting", "canvasReady", "createActor", "deleteActor"]);
for (const h of ITEM_HOOKS) Hooks.on(h, () => { ITEM_REV++; });

/** Révision des objets (voir plus haut). */
export function itemRevision() { return ITEM_REV; }

/**
 * Valeur gardée pour `doc` tant que rien n'a changé (révision, et
 * données propres du document : remplacées à chaque mise à jour).
 * @param {WeakMap} cache  propre à l'appelant
 * @param {Document} doc
 * @param {Function} make  () → valeur
 */
export function memoOf(cache, doc, make) {
  const hit = cache.get(doc);
  if (hit && hit.rev === REV && hit.sys === doc.system) return hit.value;
  const value = make();
  cache.set(doc, { rev: REV, sys: doc.system, value });
  return value;
}
