/**
 * SBE — FONCTIONS DE FICHE dans les formules
 *
 * Fonctions qu'une formule peut appeler sur la fiche d'un personnage,
 * en plus de ses clés : bornes d'un champ, effets posés, combat… Chaque
 * mécanique inscrit les siennes ici ; TOUTES les formules (champs
 * calculés, conditions de boutons, nouvelle journée, déclencheurs
 * d'effets…) les reçoivent par le même chemin.
 *
 *   maxOf("clé") / minOf("clé")   bornes du champ (apports compris)
 *   carrier("clé")                sur un OBJET : la valeur de cette clé
 *                                 sur la fiche de celui qui le porte
 *                                 (champs calculés et apports compris) ;
 *                                 0 si personne ne le porte
 *   slotted("slot", "clé")       sur un OBJET : la valeur de cette clé sur
 *                                 l'objet rangé dans ce slot ("" si vide ;
 *                                 sans clé : 1 occupé / 0 vide)
 *   (+ celles inscrites par les managers : hasEffect, stacksOf, effectCategory, inCombat,
 *    summoned, et celles du calendrier : hour, day, season, weather…)
 */

import { walkElements, valueBounds } from "./element-renderer.mjs";
import { applyContributions } from "./contributions.mjs";
import { evalExpression } from "./formula-engine.mjs";

const PROVIDERS = new Map();

/** Noms réservés (connus du vérificateur de formules de l'atelier). */
export const SCOPE_FUNC_NAMES = ["maxOf", "minOf", "carrier", "carrierMax", "slotted", "hasEffect", "stacksOf", "effectCategory", "posedEffects", "inCombat", "atStation", "summoned", "owns",
  /* Calendrier (calendar-manager) */
  "hour", "minute", "day", "month", "year", "weekday", "dayOfYear", "season", "weather", "temperature", "moon", "moonPhase", "isNight", "dayPart", "hasEvent"];

/** Inscrit un fournisseur : fn(doc) → { nom: fonction }. */
export function registerScopeFunctions(id, fn) {
  if (id && typeof fn === "function") PROVIDERS.set(id, fn);
}

/**
 * Les fonctions de fiche d'un document.
 * @param {Document} doc
 * @param {object} [contributions]  apports déjà calculés (évite un recalcul)
 */
export function scopeFunctionsOf(doc, contributions = null) {
  const out = {};
  const tpl = doc?.system?.template;
  const els = [...walkElements(tpl?.system?.elements ?? [])];
  const byKey = new Map(els.filter(e => e?.key).map(e => [e.key, e]));
  const values = doc?.system?.values ?? {};

  /* Bornes : « clé_max » / « clé_min » lus APRÈS leurs apports (un
     effet sur pv_max compte). Les montants des apports se lisent sur
     les valeurs de base — pas de calcul circulaire. */
  const bound = (k, side, live) => {
    const el = byKey.get(String(k));
    if (!el) return 0;
    /* Portée VIVANTE (celle de la formule qui appelle) : champs calculés
       compris — un maximum en formule (« 100 + con_mod ») s'y lit. */
    const vals = { ...values };
    if (live && typeof live === "object") {
      /* Valeurs ET fonctions (carried, maxOf…) : un maximum en formule
         peut lire l'équipement porté. */
      for (const [kk, v] of Object.entries(live)) if (typeof v === "number" || typeof v === "function") vals[kk] = v;
    }
    for (const sub of [`${el.key}_max`, `${el.key}_min`]) {
      /* Déjà posée dans la portée vivante (apports compris) : telle quelle. */
      if (live && typeof live[sub] === "number") continue;
      const terms = contributions?.[sub];
      if (terms?.length) {
        vals[sub] = applyContributions(Number(values[sub]) || 0, terms, (f) => evalExpression(f, values)).total;
      }
    }
    const b = valueBounds(el, vals);
    const v = side === "max" ? b.max : b.min;
    return Number.isFinite(v) ? v : 0;
  };
  /* function (pas flèche) : la portée appelante arrive en « this ». */
  out.maxOf = function (k) { return bound(k, "max", this); };
  out.minOf = function (k) { return bound(k, "min", this); };

  for (const [id, fn] of PROVIDERS) {
    try { Object.assign(out, fn(doc) ?? {}); }
    catch (err) { console.warn(`SBE | Fonctions de fiche « ${id} » en échec`, err); }
  }
  return out;
}
