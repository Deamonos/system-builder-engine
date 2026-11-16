/**
 * SBE — RÈGLES DE NIVEAU (exécution)
 *
 * Les tableaux de règles du composant Niveau (montée et descente) : pour
 * un niveau donné, chaque règle qui s'applique joue ses actions, dans
 * l'ordre. Ce qui a été fait est noté (le « journal ») pour pouvoir le
 * défaire quand on annule ce passage en redescendant :
 *   { values: { clé: valeur avant }, items: [{ id, qty, op }], effects: [{ key, op }] }
 * Un bouton du modèle ne se défait pas (ses étapes sont libres).
 */

import { ruleMatches } from "./level-model.mjs";
import { walkElements } from "../element-renderer.mjs";
import { docScope } from "../doc-context.mjs";
import { evalExpression } from "../formula-engine.mjs";

/** Le personnage qui reçoit objets et effets (le document, ou son porteur). */
export function carrierOf(doc) {
  if (doc?.documentName === "Actor") return doc;
  return doc?.parent?.documentName === "Actor" ? doc.parent : null;
}

function valueOf(raw, doc, level) {
  const s = String(raw ?? "").trim();
  if (!s) return NaN;
  if (Number.isFinite(Number(s))) return Number(s);
  let scope = {};
  try { scope = docScope(doc); } catch (_e) { scope = {}; }
  try { return Number(evalExpression(s, { ...scope, level })); } catch (_e) { return NaN; }
}

/**
 * Joue les règles de `rules` qui s'appliquent au niveau `level`.
 * @returns {Promise<object>} le journal de ce qui a été fait
 */
export async function runRules(doc, rules, level) {
  const journal = { values: {}, items: [], effects: [] };
  const hits = (rules ?? []).filter(r => ruleMatches(r, level));
  if (!hits.length) return journal;
  const actor = carrierOf(doc);
  for (const r of hits) {
    for (const a of r.actions) {
      try {
        if (a.type === "value" && a.key) {
          const n = valueOf(a.value, doc, level);
          if (!Number.isFinite(n)) continue;
          const cur = doc.system?.values?.[a.key];
          if (!(a.key in journal.values)) journal.values[a.key] = foundry.utils.deepClone(cur ?? null);
          const next = a.op === "set" ? n : (Number(cur) || 0) + n;
          await doc.update({ [`system.values.${a.key}`]: next });
        } else if (a.type === "item" && actor) {
          const w = game.items?.get(a.id);
          if (!w) continue;
          if (a.op === "take") {
            const { takeItems } = await import("../talents/talent-sheet.mjs");
            await takeItems(actor, a.id, a.qty);
          } else {
            const { QuestManager } = await import("../../managers/quest/quest-manager.mjs");
            await QuestManager.giveItem(actor, w, a.qty);
          }
          journal.items.push({ id: a.id, qty: a.qty, op: a.op });
        } else if (a.type === "effect" && actor && a.key) {
          const { EffectManager } = await import("../../managers/effects/effect-manager.mjs");
          const had = !!EffectManager.findEffect(actor, a.key);
          if (a.op === "remove" ? !had : had) continue;
          await EffectManager.act(actor, a.key, a.op, { by: actor.uuid });
          journal.effects.push({ key: a.key, op: a.op });
        } else if (a.type === "button" && a.key) {
          const bel = [...walkElements(doc.system?.template?.system?.elements ?? [])].find(e => e?.kind === "button" && e.key === a.key);
          if (!bel) continue;
          const { runTriggered } = await import("../item-actions.mjs");
          await runTriggered(doc, bel);
        }
      } catch (err) { console.warn("SBE | Niveau : règle en échec", a, err); }
    }
  }
  return journal;
}

/** Défait les objets et effets d'un journal (les valeurs : à part). */
export async function revertJournal(doc, journal) {
  const actor = carrierOf(doc);
  if (!actor || !journal) return;
  const { takeItems } = await import("../talents/talent-sheet.mjs");
  const { QuestManager } = await import("../../managers/quest/quest-manager.mjs");
  for (const it of [...(journal.items ?? [])].reverse()) {
    try {
      if (it.op === "take") { const w = game.items?.get(it.id); if (w) await QuestManager.giveItem(actor, w, it.qty); }
      else await takeItems(actor, it.id, it.qty);
    } catch (err) { console.warn("SBE | Niveau : objet non repris", it, err); }
  }
  if (!journal.effects?.length) return;
  const { EffectManager } = await import("../../managers/effects/effect-manager.mjs");
  for (const e of [...journal.effects].reverse()) {
    try { await EffectManager.act(actor, e.key, e.op === "remove" ? "apply" : "remove", { by: actor.uuid }); }
    catch (err) { console.warn("SBE | Niveau : effet non repris", e, err); }
  }
}
