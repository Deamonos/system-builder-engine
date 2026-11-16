/**
 * SBE — Moteur de formules (mode calculé)
 *
 * Décisions actées :
 * - une formule est une EXPRESSION JavaScript simple dont les
 *   variables sont les CLÉS des autres éléments du modèle
 *   (ex. (degats + bonus) / 2) ;
 * - calcul par l'interpréteur de SBE (formula-interpreter.mjs), jamais
 *   par le moteur JavaScript : une formule ne lit QUE les clés du
 *   modèle et les fonctions permises ; ZÉRO dépendance externe ;
 * - tri par dépendances : les formules qui s'appuient sur d'autres
 *   formules sont calculées dans le bon ordre, en une passe (mécanique
 *   interne pure) ; un cycle est détecté et signalé, jamais bloquant ;
 * - référencer une clé inconnue est AUTORISÉ avec avertissement
 *   (c'est le système de l'utilisateur) — la clé vaut undefined.
 *
 * Types dans la portée : nombre → Number ; case à cocher → true/false ;
 * texte et liste → chaîne. Le résultat d'un champ calculé est arrondi
 * selon sa config (entier ou N décimales).
 */

import { walkElements } from "./element-renderer.mjs";
import { withLookups } from "./lookup.mjs";
import { withCarried } from "./carried.mjs";
import { applyContributions } from "./contributions.mjs";
import { runFormula, parseFormula } from "./formula-interpreter.mjs";

/* Fonctions mathématiques utilisables NUES dans les formules —
   ceil(x) plutôt que Math.ceil(x) (l'objet Math reste accessible
   aussi). Une clé du modèle portant le même nom gagne sur la
   fonction (les clés du créateur restent reines). */
export const FORMULA_FUNCS = {
  ceil: Math.ceil,
  floor: Math.floor,
  round: Math.round,
  abs: Math.abs,
  min: Math.min,
  max: Math.max,
  sqrt: Math.sqrt,
  pow: Math.pow,
  clamp: (v, lo, hi) => Math.min(Math.max(Number(v), Number(lo)), Number(hi)),
  /* Chiffres à l'envers, sur `w` chiffres (34 → 43, 7 → 70) : lire un
     jet d'attaque comme un jet de localisation. */
  reverse: (v, w = 2) => Number([...String(Math.abs(Math.trunc(Number(v)) || 0)).padStart(Math.max(0, Number(w) || 0), "0")].reverse().join(""))
};


/**
 * Formule de BONUS d'un champ nombre non calculé (mode « 2 en 1 ») :
 * le MJ/joueur saisit une valeur de base dans le champ, et la formule
 * ajoute un bonus par-dessus. Le champ affiche le TOTAL, la valeur
 * stockée reste la base. Retourne la formule ou null.
 */
export function bonusFormulaOf(el) {
  if (el?.kind !== "number") return null;
  if (el.config?.computed) return null;
  const f = String(el.config?.bonusFormula ?? "").trim();
  return f || null;
}

/** Un élément est-il un champ nombre en mode calculé complet ? */
function isComputedEl(el) {
  /* Nombre OU jauge en mode calculé (une jauge de charge portée…). */
  return (el?.kind === "number" || el?.kind === "gauge") && !!el.config?.computed && !!el.config?.formula;
}

/** Identifiants présents dans une expression. Le texte ENTRE
    GUILLEMETS n'en contient pas : dans carriedCount("munition"),
    « munition » est un nom de contenant, pas une clé à résoudre. */
export function extractIdentifiers(expr) {
  const bare = String(expr ?? "")
    .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, " ");
  return [...new Set(bare.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? [])];
}

/** Une clé est-elle un identifiant JS utilisable en formule ? */
export function isFormulaSafeKey(key) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(String(key ?? ""));
}

/**
 * Vérifie qu'une expression est syntaxiquement valide.
 * @returns {string|null} message d'erreur, ou null si OK.
 */
export function validateFormula(expr) {
  const src = String(expr ?? "").trim();
  if (!src) return game.i18n.localize("SBE.Formula.Empty");
  try {
    /* Lecture seule — jamais calculée ici. */
    parseFormula(src);
    return null;
  } catch (err) {
    return game.i18n.format("SBE.Formula.SyntaxError", { msg: err.message });
  }
}

/**
 * Évalue une expression dans une portée réduite aux clés fournies.
 * Exporté pour les colonnes calculées des tables (portée = cellules
 * de la ligne + valeurs de la fiche). Retourne null en cas d'échec.
 */
export function evalExpression(expr, scope) {
  try {
    return safeEval(expr, scope);
  } catch (_e) {
    return null;
  }
}

/* ------------------------------------------------------------ */
/*  Formules avec des DÉS (« 2d6 + force », « mort_vivant ? -1d6 : 1d6 »)
    — une seule façon de faire pour tout le système (étapes de bouton,
    attaques, effets périodiques).                                 */
/* ------------------------------------------------------------ */

/** Une formule contient-elle des dés ? (2d6 + 2, 1d4) */
export const HAS_DICE = /(^|[^A-Za-z_])\d*d\d/;

/**
 * Les fonctions du système (carrier, owns, carried, hasEffect, table…)
 * ne sont pas connues des dés de Foundry : chaque appel est calculé
 * d'abord, et sa valeur prend sa place (« 1d20 + carrier("force") »
 * → « 1d20 + (12) »). Les fonctions de calcul (floor, max…) restent :
 * les dés les connaissent.
 */
function inlineScopeCalls(src, scope) {
  if (!scope || !/[A-Za-z_]\w*\s*\(/.test(src)) return src;
  let out = "";
  let i = 0;
  const re = /[A-Za-z_]\w*/g;
  while (i < src.length) {
    re.lastIndex = i;
    const m = re.exec(src);
    if (!m) { out += src.slice(i); break; }
    const name = m[0];
    const start = m.index;
    let j = start + name.length;
    while (src[j] === " ") j++;
    const prev = start > 0 ? src[start - 1] : "";
    if (src[j] !== "(" || typeof scope[name] !== "function" || /[@\w.]/.test(prev)) {
      out += src.slice(i, start + name.length);
      i = start + name.length;
      continue;
    }
    /* La parenthèse fermante (textes entre guillemets compris). */
    let depth = 0, k = j, q = "";
    for (; k < src.length; k++) {
      const c = src[k];
      if (q) { if (c === "\\") k++; else if (c === q) q = ""; continue; }
      if (c === "\"" || c === "'") q = c;
      else if (c === "(") depth++;
      else if (c === ")" && --depth === 0) break;
    }
    if (depth !== 0) { out += src.slice(i); break; }
    const call = src.slice(start, k + 1);
    const v = evalExpression(call, scope);
    const n = typeof v === "number" ? v : typeof v === "boolean" ? (v ? 1 : 0)
      : (typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);
    out += src.slice(i, start) + (Number.isFinite(n) ? `(${n})` : call);
    i = k + 1;
  }
  return out;
}

/** Formule de dés : fonctions du système calculées, clés nues → @clé
    (comme les jets de champ). */
export function rollableFormula(formula, scope) {
  let f = inlineScopeCalls(String(formula ?? ""), scope);
  const keys = Object.keys(scope ?? {}).filter(k => /^[A-Za-z_]\w*$/.test(k)).sort((a, b) => b.length - a.length);
  for (const k of keys) f = f.replace(new RegExp(`(?<![@\\w"'])${k}\\b(?!\\s*\\()`, "g"), `@${k}`);
  return f;
}

/**
 * Valeur d'une formule, dés compris : un nombre, une formule ordinaire,
 * ou un jet (« 2d6 + 2 »). Un champ TEXTE qui contient un jet est lancé.
 * @returns {Promise<{value: *, roll: Roll|null}>}
 */
export async function formulaValue(raw, scope) {
  const s = String(raw ?? "").trim();
  if (s === "") return { value: "", roll: null };
  if (/^-?\d+(\.\d+)?$/.test(s)) return { value: Number(s), roll: null };
  if (HAS_DICE.test(s)) {
    try {
      const roll = await new Roll(rollableFormula(s, scope), scope).evaluate();
      return { value: roll.total, roll };
    } catch (_e) { /* pas un jet simple : dés DANS une formule (plus bas) */ }
    /* Dés dans une formule (« mort_vivant ? -1d6 : 1d6 ») : chaque dé
       est lancé, puis la formule est calculée avec les résultats. */
    const DIE = /(?<![A-Za-z_0-9.])(\d*)d(\d+)(?![A-Za-z_0-9])/g;
    const results = [];
    for (const m of s.matchAll(DIE)) {
      const r = await new Roll(`${m[1] || 1}d${m[2]}`).evaluate();
      results.push(r.total);
    }
    let i = 0;
    const v = evalExpression(s.replace(DIE, () => String(results[i++] ?? 0)), scope);
    if (v !== null && v !== undefined && v !== "") return { value: v, roll: null };
  }
  const v = evalExpression(s, scope);
  if (typeof v === "string" && HAS_DICE.test(v)) {
    try {
      const roll = await new Roll(rollableFormula(v, scope), scope).evaluate();
      return { value: roll.total, roll };
    } catch (_e) { /* texte ordinaire */ }
  }
  if (typeof v === "string" && /^\s*-?\d+(\.\d+)?\s*$/.test(v)) return { value: Number(v), roll: null };
  return { value: v, roll: null };
}

/** Évalue une expression dans une portée réduite aux clés fournies
    (une clé du modèle gagne sur une fonction de formule du même nom). */
function safeEval(expr, scope) {
  const keys = {};
  for (const k of Object.keys(scope ?? {})) if (isFormulaSafeKey(k)) keys[k] = scope[k];
  return runFormula(expr, keys, FORMULA_FUNCS);
}

/** Coercition d'une valeur brute selon le type de son élément. */
/* Défauts d'un arbre de modèle (gardés tant que l'arbre ne change pas). */
const DEFAULTS = new WeakMap();
/**
 * Les valeurs d'une fiche, ses défauts manquants compris : un champ
 * ajouté au modèle n'est écrit sur la fiche qu'à son ouverture ; d'ici
 * là, tout ce qui la lit (porteur, inventaire, slots) voit son défaut.
 */
export function withDefaults(elements, values = {}) {
  if (!Array.isArray(elements)) return { ...(values ?? {}) };
  let d = DEFAULTS.get(elements);
  if (!d) {
    d = {};
    for (const el of walkElements(elements)) {
      if (el?.key && el.config?.default !== undefined && el.config.default !== null && !el.config?.computed) d[el.key] = el.config.default;
    }
    DEFAULTS.set(elements, d);
  }
  return { ...d, ...(values ?? {}) };
}

function coerce(el, raw) {
  const v = raw ?? el.config?.default;
  if (el.kind === "number") return Number(v ?? 0) || 0;
  if (el.kind === "checkbox") return !!v;
  if (el.kind === "gauge") return Number(v ?? 0) || 0;
  if (el.kind === "level") return Number(v ?? 0) || 0;
  return v ?? "";
}

/** Arrondi du résultat selon la config du champ calculé. */
function roundResult(el, val) {
  const n = Number(val);
  if (!Number.isFinite(n)) return null;
  if (el.config?.integer !== false) return Math.round(n);
  const d = Number(el.config?.decimals ?? 2);
  return Number(n.toFixed(d));
}

/**
 * Portée complète d'un objet : toutes les clés du modèle avec leurs
 * valeurs (champs calculés compris). Sert aux formules ponctuelles
 * (boutons d'action, montants dynamiques…).
 */
export function buildScope(elements, values = {}, ctx = null) {
  const { results } = computeAll(elements, values, ctx);
  const scope = {};
  /* Clés modifiées par un apport sans être un élément du modèle
     (sous-clés « pv_max »…) : lisibles aussi. */
  for (const [k, v] of Object.entries(results)) {
    if (isFormulaSafeKey(k)) scope[k] = Number(v ?? 0) || 0;
  }
  for (const el of walkElements(elements ?? [])) {
    if (!el?.key || !isFormulaSafeKey(el.key)) continue;
    /* Champ dérivé (calculé OU « 2 en 1 ») : la clé expose le TOTAL. */
    if (Object.prototype.hasOwnProperty.call(results, el.key)) {
      scope[el.key] = Number(results[el.key] ?? 0) || 0;
      continue;
    }
    scope[el.key] = coerce(el, values[el.key]);
  }
  withLookups(scope, elements);
  /* Lecture de l'inventaire : carried("cle"), carriedCount(). */
  withCarried(scope, ctx?.inventory);
  withFunctions(scope, ctx?.functions);
  return scope;
}

/** Fonctions de fiche (maxOf, hasEffect…) : une clé homonyme gagne.
    Chaque fonction est liée à la portée qui l'appelle : maxOf("pv")
    lit ainsi la formule du maximum avec les champs CALCULÉS à jour
    (un maximum « 100 + con_mod » ne retombe pas à zéro). */
function withFunctions(scope, funcs) {
  for (const [name, fn] of Object.entries(funcs ?? {})) {
    if (typeof fn === "function" && !(name in scope)) scope[name] = fn.bind(scope);
  }
  /* carrier("clé") existe TOUJOURS : un objet que personne ne porte
     (ou un calcul sans fiche) lit 0 — jamais de formule cassée. */
  if (!("carrier" in scope)) scope.carrier = () => 0;
  return scope;
}

/** Clés lues EN DOUBLE MAIN par maxOf("x") / minOf("x") : celles de la
    formule du maximum de x et ses sous-clés — pour l'ordre de calcul. */
function boundDeps(expr, elByKey) {
  const out = [];
  for (const m of String(expr ?? "").matchAll(/\b(?:maxOf|minOf)\(\s*["']([^"']+)["']\s*\)/g)) {
    const el = elByKey.get(m[1]);
    out.push(`${m[1]}_max`, `${m[1]}_min`);
    if (el?.config?.maxFormula) out.push(...extractIdentifiers(el.config.maxFormula));
  }
  return out;
}

/**
 * Calcule tous les champs en mode calculé d'un modèle.
 *
 * @param {Array}  elements  Arbre d'éléments du modèle.
 * @param {object} values    system.values de l'objet.
 * @param {object} [ctx]     contexte de la fiche — { inventory } donne
 *                           accès aux objets portés (carried…) ;
 *                           { contributions } = REGISTRE D'APPORTS
 *                           (contributionsOf(doc)) : effets, etc.
 * @returns {{ results: Object<string, number|null>,
 *             errors: Array<{key: string, reason: string}>,
 *             breakdown: Object<string, {base, lines, total}> }}
 *   results[clé] = valeur calculée (null si échec/cycle), et le TOTAL
 *   de toute clé modifiée par un apport ; breakdown[clé] = le détail
 *   nommé de ces apports (affiché au survol).
 */
export function computeAll(elements, values = {}, ctx = null) {
  const els = [...walkElements(elements ?? [])].filter(e => e?.key);
  const results = {};
  const errors = [];
  const breakdown = {};
  const contribs = ctx?.contributions ?? {};
  const elByKey = new Map(els.map(e => [e.key, e]));

  /* APPORTS sur une clé : appliqués au calcul, jamais stockés. */
  const contribute = (key, base, scopeNow) => {
    const terms = contribs[key];
    if (!terms?.length) return base;
    const { total, lines } = applyContributions(base, terms, (f) => {
      try { return safeEval(f, scopeNow); } catch (_e) { return null; }
    });
    const el = elByKey.get(key);
    const rounded = el ? (roundResult(el, total) ?? total) : Math.round(total * 1000) / 1000;
    if (lines.length) breakdown[key] = { base, lines, total: rounded };
    return rounded;
  };

  /* Deux familles de champs DÉRIVÉS, traitées ensemble par le même
     tri de dépendances :
     - « calculé »  : la formule DONNE la valeur (base ignorée) ;
     - « 2 en 1 »   : la valeur saisie + le résultat de la formule. */
  const derived = [];
  for (const el of els) {
    if (isComputedEl(el)) {
      derived.push({ el, expr: el.config.formula, bonus: false, base: 0 });
      continue;
    }
    const bf = bonusFormulaOf(el);
    if (bf) derived.push({ el, expr: bf, bonus: true, base: Number(coerce(el, values[el.key])) || 0 });
  }
  if (!derived.length && !Object.keys(contribs).length) return { results, errors, breakdown };

  const derivedKeys = new Set(derived.map(d => d.el.key));

  /* Portée de départ : toutes les valeurs non dérivées. */
  const scope = {};
  for (const el of els) {
    if (derivedKeys.has(el.key)) continue;
    if (isFormulaSafeKey(el.key)) scope[el.key] = coerce(el, values[el.key]);
  }
  /* Tables de correspondance interrogeables depuis les formules. */
  withLookups(scope, elements);
  /* Inventaire interrogeable depuis les formules (poids, valeur,
     encombrement… : tout ce que le créateur aura inventé). */
  withCarried(scope, ctx?.inventory);
  withFunctions(scope, ctx?.functions);

  /* Apports sur les clés SAISIES (et les sous-clés hors modèle) : posés
     AVANT les formules, qui voient donc la force modifiée par l'effet.
     La valeur d'un apport se lit sur les valeurs de base. */
  const baseScope = { ...scope };
  for (const key of Object.keys(contribs)) {
    if (derivedKeys.has(key) || !isFormulaSafeKey(key)) continue;
    const el = elByKey.get(key);
    if (el && !["number", "gauge"].includes(el.kind)) continue;   /* apports numériques seulement */
    const base = el ? Number(coerce(el, values[key])) || 0 : Number(values[key]) || 0;
    const total = contribute(key, base, baseScope);
    scope[key] = total;
    results[key] = total;
  }

  /* Tri par dépendances (Kahn) entre champs dérivés. */
  const deps = new Map();   /* clé → clés dérivées dont elle dépend */
  for (const d of derived) {
    const ids = [...extractIdentifiers(d.expr), ...boundDeps(d.expr, elByKey)];
    deps.set(d.el.key, [...new Set(ids)].filter(id => derivedKeys.has(id) && id !== d.el.key));
  }
  const done = new Set();
  const order = [];
  let progressed = true;
  while (progressed && order.length < derived.length) {
    progressed = false;
    for (const d of derived) {
      if (done.has(d.el.key)) continue;
      if (deps.get(d.el.key).every(k => done.has(k))) {
        order.push(d);
        done.add(d.el.key);
        progressed = true;
      }
    }
  }
  /* Restants = cycle. */
  for (const d of derived) {
    if (!done.has(d.el.key)) {
      results[d.el.key] = null;
      errors.push({ key: d.el.key, reason: game.i18n.localize("SBE.Formula.Cycle") });
    }
  }

  /* Évaluation dans l'ordre. */
  for (const d of order) {
    try {
      /* En « 2 en 1 », la formule peut se référer à sa propre clé :
         elle y trouve la valeur SAISIE (la base), jamais le total. */
      const local = d.bonus ? { ...scope, [d.el.key]: d.base } : scope;
      const val = safeEval(d.expr, local);
      let rounded = d.bonus
        ? roundResult(d.el, d.base + (Number(val) || 0))
        : roundResult(d.el, val);
      /* Apports sur un champ dérivé : par-dessus son résultat. */
      if (rounded !== null && contribs[d.el.key]?.length) rounded = contribute(d.el.key, rounded, scope);
      results[d.el.key] = rounded;
      scope[d.el.key] = rounded ?? 0;
    } catch (err) {
      /* Formule en échec : en « 2 en 1 » la base reste affichée. */
      results[d.el.key] = d.bonus ? roundResult(d.el, d.base) : null;
      scope[d.el.key] = results[d.el.key] ?? 0;
      errors.push({ key: d.el.key, reason: err.message });
    }
  }

  return { results, errors, breakdown };
}
