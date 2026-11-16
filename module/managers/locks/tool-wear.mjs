/**
 * SBE — USURE DES OUTILS
 *
 * Une table réglée UNE fois par le MJ (Réglages des verrous), lue par
 * tout ce qui se sert d'un outil après un jet : crochetage et piratage
 * aujourd'hui, artisanat ou réparation demain. Désactivée par défaut.
 *
 *   toolWear = {
 *     enabled  : false,
 *     key      : "durabilite"     champ des modèles d'objets (vide = pas d'usure chiffrée)
 *     atZero   : "unusable" | "destroy"
 *     rules    : { critSuccess|success|failure|critFailure : { amount, destroy } }
 *   }
 *
 * Un outil sans le champ ne s'use pas — seul « Détruit » s'applique.
 * Un outil empilable perd UN exemplaire de sa pile au lieu de disparaître.
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { qtyOf, isStackableItem, QUANTITY_KEY } from "../../builder/inventory.mjs";

export const WEAR_OUTCOMES = ["critSuccess", "success", "failure", "critFailure"];

export const WEAR_DEFAULTS = {
  enabled: false,
  key: "",
  atZero: "unusable",
  rules: {
    critSuccess: { amount: 0, destroy: false },
    success: { amount: 1, destroy: false },
    failure: { amount: 1, destroy: false },
    critFailure: { amount: 0, destroy: true }
  }
};

export function cleanWear(w) {
  const d = WEAR_DEFAULTS;
  const rules = {};
  for (const o of WEAR_OUTCOMES) {
    const r = w?.rules?.[o] ?? d.rules[o];
    const n = Number(r?.amount);
    rules[o] = { amount: Number.isFinite(n) && n > 0 ? n : 0, destroy: !!r?.destroy };
  }
  return {
    enabled: !!w?.enabled,
    key: String(w?.key ?? "").trim(),
    atZero: w?.atZero === "destroy" ? "destroy" : "unusable",
    rules
  };
}

export class ToolWear {

  static register() {
    game.settings.register(SYSTEM_ID, "toolWear", {
      scope: "world", config: false, type: Object,
      default: foundry.utils.deepClone(WEAR_DEFAULTS)
    });
  }

  static get() {
    try { return cleanWear(game.settings.get(SYSTEM_ID, "toolWear")); }
    catch (_e) { return cleanWear(null); }
  }

  static async set(w) {
    await game.settings.set(SYSTEM_ID, "toolWear", cleanWear(w));
  }

  /** Valeur d'usure de l'objet, ou null s'il n'a pas le champ. */
  static #level(item, key) {
    if (!key) return null;
    const v = item?.system?.values?.[key];
    if (v === undefined || v === null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  /** L'outil peut-il encore servir ? (usure à 0 = inutilisable) */
  static usable(item) {
    const w = this.get();
    if (!w.enabled) return true;
    const lv = this.#level(item, w.key);
    return lv === null || lv > 0;
  }

  /**
   * Use l'outil selon l'issue du jet. Retourne un court texte à
   * afficher (« usé », « détruit ») ou "".
   * @param {Item} item
   * @param {string} outcome  critSuccess | success | failure | critFailure
   */
  static async apply(item, outcome) {
    const w = this.get();
    if (!w.enabled || !item) return "";
    const rule = w.rules[outcome] ?? null;
    if (!rule) return "";
    if (rule.destroy) return this.#destroy(item);
    const lv = this.#level(item, w.key);
    if (lv === null || !(rule.amount > 0)) return "";
    const next = Math.max(0, lv - rule.amount);
    if (next <= 0 && w.atZero === "destroy") return this.#destroy(item);
    await item.update({ [`system.values.${w.key}`]: next });
    return next <= 0 ? "worn" : "used";
  }

  static async #destroy(item) {
    if (isStackableItem(item) && qtyOf(item) > 1) {
      await item.update({ [`system.values.${QUANTITY_KEY}`]: qtyOf(item) - 1 });
    } else {
      await item.delete();
    }
    return "destroyed";
  }
}
