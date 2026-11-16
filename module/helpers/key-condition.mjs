/**
 * SBE — Condition sur une clé, sans formule
 *
 * { key, op, value, unit } : « hp < 80 % du max ». Sans clé ou « any » :
 * toujours vrai. `unit` « pct » compare en % du maximum de la clé.
 * Une seule source pour les traces, les apparences… (menus identiques :
 * SBE.Traces.Ops.*, SBE.Traces.UnitValue / UnitPct).
 */

import { docScope } from "../builder/doc-context.mjs";

export const COND_OPS = ["any", "<", "<=", ">", ">=", "==", "!="];

/** Clé de traduction du libellé d'un opérateur. */
export const OP_LABEL = { any: "any", "<": "lt", "<=": "le", ">": "gt", ">=": "ge", "==": "eq", "!=": "ne" };

/** Valeur de la clé, en % de son maximum si `pct` (0 sans maximum connu). */
export function keyValueOf(actor, key, pct = false) {
  let v = Number(foundry.utils.getProperty(actor, `system.values.${key}`)) || 0;
  if (!pct) return v;
  let max = 0;
  try { max = Number(docScope(actor).maxOf?.(key)) || 0; } catch (_e) { max = 0; }
  return max > 0 ? (v / max) * 100 : 0;
}

export function checkKeyCondition(cond, actor) {
  if (!cond?.key || !cond.op || cond.op === "any") return true;
  const v = keyValueOf(actor, cond.key, cond.unit === "pct");
  const x = Number(cond.value) || 0;
  switch (cond.op) {
    case "<": return v < x;
    case "<=": return v <= x;
    case ">": return v > x;
    case ">=": return v >= x;
    case "==": return v === x;
    case "!=": return v !== x;
    default: return true;
  }
}
