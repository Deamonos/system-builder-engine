/**
 * SBE — CARROUSEL DE COMBAT : règles du MJ
 *
 * Chaque règle lit un combattant : une formule vraie sur sa fiche
 * (« pv <= 0 ») ou un effet actif (par son nom ou son statut :
 * « Inconscient »). Elle le masque du carrousel (le MJ le voit en
 * transparence), le marque vaincu, ou le retire du combat. Les deux
 * dernières sont écrites par le MJ principal quand la fiche ou ses
 * effets changent.
 */

import { isPrimaryGM } from "../../helpers/socket.mjs";
import { docScope } from "../../builder/doc-context.mjs";
import { evalExpression } from "../../builder/formula-engine.mjs";
import { carouselSettings } from "./carousel-model.mjs";

const norm = (s) => String(s ?? "").trim().toLowerCase();

/** Une règle touche-t-elle ce combattant ? */
function hits(rule, actor) {
  if (!actor) return false;
  if (rule.when === "effect") {
    const want = norm(rule.effect);
    if (actor.statuses?.has?.(want) || actor.statuses?.has?.(rule.effect)) return true;
    return [...(actor.appliedEffects ?? actor.effects ?? [])].some(e => !e.disabled && norm(e.name) === want);
  }
  try {
    let scope;
    try { scope = docScope(actor); } catch (_e) { scope = { ...(actor.system?.values ?? {}) }; }
    return !!evalExpression(rule.formula, scope);
  } catch (_e) { return false; }
}

/** Les actions des règles qui touchent ce combattant. */
export function ruleActions(combatant, cfg = carouselSettings()) {
  const out = new Set();
  for (const r of cfg.rules) if (hits(r, combatant?.actor)) out.add(r.action);
  return out;
}

/** MJ principal : marque vaincus et retire du combat ceux que les règles visent. */
export async function applyRules(combat, cfg = carouselSettings()) {
  if (!combat || !isPrimaryGM() || !cfg.rules.some(r => r.action !== "hide")) return;
  const del = [];
  const ups = [];
  for (const c of combat.combatants) {
    const acts = ruleActions(c, cfg);
    if (acts.has("remove")) del.push(c.id);
    else if (acts.has("defeat") && !c.isDefeated) ups.push({ _id: c.id, defeated: true });
  }
  if (ups.length) await combat.updateEmbeddedDocuments("Combatant", ups);
  if (del.length) await combat.deleteEmbeddedDocuments("Combatant", del);
}
