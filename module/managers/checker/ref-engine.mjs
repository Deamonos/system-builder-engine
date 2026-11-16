/**
 * SBE — VÉRIFICATEUR DE MODÈLES : le moteur
 *
 * Le vérificateur ne connaît rien en dur. Chaque partie de SBE DÉCLARE
 * où elle range des clés et des formules (registerRefSource) : un
 * « conteneur » = un document ou un réglage, avec
 *
 *   { id, label, open(), family?, templateId?,
 *     read()  → copie modifiable des données,
 *     write(data) → enregistre (seulement si quelque chose a changé),
 *     walk(data, v) → montre chaque référence au visiteur v }
 *
 * Le visiteur v propose une méthode par sorte de référence :
 *   v.key(holder, prop, fam, where)       une clé ;
 *   v.keys(holder, prop, fam, where)      une liste de clés ;
 *   v.formula(holder, prop, fam, where, { dice, vars })  une formule ;
 *   v.text(holder, prop, fam, where)      texte à {{clé}} / {{= formule}} ;
 *   v.braces(holder, prop, fam, where)    texte à {formule} ;
 *   v.entry(holder, prop, fam, where)     « @clé » ou texte libre ;
 *   v.value(holder, prop, famFormula, famAt, where)  nombre, formule ou @clé ;
 *   v.effect(holder, prop, where, { local })  une clé d'effet (ou @clé) ;
 *   v.button(holder, prop, where, { prefix }) un bouton de modèle d'objet ;
 *   v.attr(holder, prop, fam, where)      attribut de barre de jeton.
 * fam : "actor" (modèles de personnage), "item" (modèles d'objet) ou
 * "self" (le modèle qui porte la référence).
 *
 * Trois usages, un seul parcours :
 *   - check()  : le rapport (clés introuvables, références cassées,
 *                formules en erreur) ;
 *   - find()   : où une clé est utilisée (avant de la renommer) ;
 *   - rename() : renommer partout.
 */

import { walkElements } from "../../builder/element-renderer.mjs";
import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { FORMULA_FUNCS, validateFormula } from "../../builder/formula-engine.mjs";
import { LOOKUP_FUNCS } from "../../builder/lookup.mjs";
import { CARRIED_FUNCS } from "../../builder/carried.mjs";
import { SCOPE_FUNC_NAMES } from "../../builder/doc-scope.mjs";

/* ============================================================ */
/*  REGISTRE                                                     */
/* ============================================================ */

const SOURCES = [];

/** Une partie de SBE déclare ses conteneurs : fn() → [conteneur]. */
export function registerRefSource(id, fn) {
  if (!id || typeof fn !== "function") return;
  const i = SOURCES.findIndex(s => s.id === id);
  if (i >= 0) SOURCES.splice(i, 1);
  SOURCES.push({ id, fn });
}

function containers() {
  const out = [];
  for (const s of SOURCES) {
    try { out.push(...(s.fn() ?? []).filter(Boolean)); }
    catch (err) { console.warn(`SBE | Vérificateur : source « ${s.id} » en échec`, err); }
  }
  return out;
}

/* ============================================================ */
/*  INDEX DES CLÉS                                               */
/* ============================================================ */

/** Sous-clés qu'un champ fait naître (bornes, points temporaires, bonus). */
export const SUBKEY_SUFFIXES = ["_min", "_max", "_temp", "_bonus", "_bas", "_haut"];

/** Modèles d'une famille. */
export function templatesOf(fam) {
  if (fam === "actor") return game.actors?.filter(a => a.type === "template") ?? [];
  if (fam === "item") return game.items?.filter(i => i.type === "template") ?? [];
  return [];
}

export function familyOf(tpl) {
  return tpl?.documentName === "Actor" ? "actor" : "item";
}

function keysOfTemplate(tpl) {
  const own = new Set(), all = new Set(), buttons = new Set();
  for (const el of walkElements(tpl?.system?.elements ?? [])) {
    if (!el?.key) continue;
    own.add(el.key);
    all.add(el.key);
    for (const s of SUBKEY_SUFFIXES) all.add(el.key + s);
    if (el.kind === "button") buttons.add(el.key);
  }
  return { own, all, buttons };
}

/**
 * Familles de clés venues d'un composant (ex. les types de météo du
 * calendrier) : `keys()` donne les clés valables, `label` le nom de la
 * famille dans les messages. Une étape qui en lit une : v.key(st, p, fam, w).
 */
const KEY_FAMILIES = new Map();
export function registerKeyFamily(fam, { keys, label }) {
  if (fam && typeof keys === "function") KEY_FAMILIES.set(fam, { keys, label });
}

/** Toutes les clés connues, par famille et par modèle. */
export function buildIndex() {
  const idx = { actor: new Set(), item: new Set(), byTpl: new Map(), buttons: new Set(), effects: new Set(), profiles: new Set() };
  for (const [fam, f] of KEY_FAMILIES) {
    try { idx[fam] = new Set(f.keys() ?? []); } catch (_e) { idx[fam] = new Set(); }
  }
  for (const fam of ["actor", "item"]) {
    for (const tpl of templatesOf(fam)) {
      const k = keysOfTemplate(tpl);
      idx.byTpl.set(tpl.id, k);
      for (const x of k.all) idx[fam].add(x);
      if (fam === "item") for (const b of k.buttons) idx.buttons.add(b);
    }
  }
  return idx;
}

/* ============================================================ */
/*  FORMULES : lecture et réécriture                             */
/* ============================================================ */

const JS_WORDS = new Set([
  "true", "false", "null", "undefined", "NaN", "Infinity", "Math", "Number", "String", "Boolean",
  "typeof", "instanceof", "in", "of", "new", "void", "delete", "this"
]);
/* Valeurs posées en route par les boutons à étapes et les jets. */
export const STEP_VARS = ["isSuccess", "isCrit", "isFumble", "rollTotal", "isHit", "hitZone", "pickedName", "eventName", "eventValue", "eventSource", "tableResult", "tableTotal"];

/** Fonctions dont un argument TEXTE est une clé : nom → [famille par rang]. */
const STRING_ARG_FUNCS = {
  maxOf: ["base"], minOf: ["base"],
  table: ["base"], tableX: ["base"], tableList: ["base"],
  carried: ["item", "base"], carriedValue: ["item", "base"], carriedCount: ["base"],
  carrier: ["actor"], carrierMax: ["actor"],
  slotted: ["base", "item"],
  hasEffect: ["effect"], stacksOf: ["effect"], effectCategory: ["effect"], posedEffects: ["effect"]
};

function knownFuncs() {
  return new Set([...Object.keys(FORMULA_FUNCS), ...LOOKUP_FUNCS, ...CARRIED_FUNCS, ...SCOPE_FUNC_NAMES]);
}

/**
 * Découpe une formule : identifiants nus (hors chaînes, hors « .x ») et
 * chaînes passées en argument d'une fonction à clé. Chaque morceau garde
 * sa position, pour la réécriture.
 * @returns {{ids: Array<{name,start,end}>, strs: Array<{value,start,end,quote,fn,arg}>}}
 */
export function scanFormula(src) {
  const s = String(src ?? "");
  const ids = [], strs = [];
  const stack = [];          /* appels ouverts : { fn, arg, depth } */
  let depth = 0, lastIdent = null, prevSig = "";
  for (let i = 0; i < s.length;) {
    const c = s[i];
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1, val = "";
      while (j < s.length && s[j] !== c) { if (s[j] === "\\") { val += s[j + 1] ?? ""; j += 2; continue; } val += s[j]; j++; }
      const top = stack[stack.length - 1];
      if (top && top.depth === depth && (prevSig === "(" || prevSig === "," || prevSig === ";")) {
        strs.push({ value: val, start: i, end: Math.min(j + 1, s.length), quote: c, fn: top.fn, arg: top.arg });
      }
      i = j + 1; prevSig = "str"; lastIdent = null;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i + 1;
      while (j < s.length && /[A-Za-z0-9_$]/.test(s[j])) j++;
      const name = s.slice(i, j);
      /* Précédé d'un point (propriété) : pas une clé. */
      let k = i - 1;
      while (k >= 0 && /\s/.test(s[k])) k--;
      const isProp = k >= 0 && s[k] === "." && !(k > 0 && /[0-9]/.test(s[k - 1]) && !/[A-Za-z_$]/.test(s[k - 1]));
      /* Collé à un chiffre devant (1d6, 2e3) : pas une clé. */
      const glued = i > 0 && /[0-9]/.test(s[i - 1]);
      if (!isProp && !glued) ids.push({ name, start: i, end: j });
      lastIdent = name; prevSig = "id"; i = j;
      continue;
    }
    if (c === "(") {
      depth++;
      if (prevSig === "id" && lastIdent && STRING_ARG_FUNCS[lastIdent]) stack.push({ fn: lastIdent, arg: 0, depth });
      prevSig = "("; lastIdent = null; i++; continue;
    }
    if (c === ")") {
      if (stack.length && stack[stack.length - 1].depth === depth) stack.pop();
      depth = Math.max(0, depth - 1);
      prevSig = ")"; lastIdent = null; i++; continue;
    }
    if (c === "," || c === ";") {
      const top = stack[stack.length - 1];
      if (top && top.depth === depth) top.arg++;
      prevSig = c; lastIdent = null; i++; continue;
    }
    if (!/\s/.test(c)) { prevSig = c; lastIdent = null; }
    i++;
  }
  return { ids, strs };
}

/** Famille d'une chaîne argument : "base" devient la famille de la formule. */
function strFamily(str, base) {
  const f = STRING_ARG_FUNCS[str.fn]?.[str.arg];
  if (!f) return null;
  return f === "base" ? base : f;
}

/** La clé (ou une de ses sous-clés) correspond-elle à `old` ? → nouvelle. */
export function renamedKey(name, old, nw) {
  if (name === old) return nw;
  for (const sfx of SUBKEY_SUFFIXES) if (name === old + sfx) return nw + sfx;
  return null;
}

/** Réécrit une formule. `test(name, fam)` → nouveau nom ou null. */
/* Portée d'une clé lue dans une formule :
   "same"   — clé nue : celle du document où la formule est lue ;
   "global" — argument d'une fonction qui vise une AUTRE famille ou
              d'autres objets (carried("poids"), carrier("pv")) ;
   "self"   — « self_clé » d'un filtre « Choisir un objet » : l'objet
              qu'on utilise. */
function strScope(st) {
  return STRING_ARG_FUNCS[st.fn]?.[st.arg] === "base" ? "same" : "global";
}

function rewriteFormula(src, base, test, opts = {}) {
  const s = String(src ?? "");
  const { ids, strs } = scanFormula(s);
  const edits = [];
  for (const id of ids) {
    if (STRING_ARG_FUNCS[id.name] || JS_WORDS.has(id.name)) continue;
    if (opts.selfPrefix && id.name.startsWith("self_")) {
      const n = test(id.name.slice(5), opts.selfFam, "self");
      if (n) edits.push({ start: id.start, end: id.end, text: `self_${n}` });
      continue;
    }
    const n = test(id.name, base, "same");
    if (n) edits.push({ start: id.start, end: id.end, text: n });
  }
  for (const st of strs) {
    const fam = strFamily(st, base);
    if (!fam || fam === "effect") continue;
    const n = test(st.value, fam, strScope(st));
    if (n) edits.push({ start: st.start, end: st.end, text: st.quote + n + st.quote });
  }
  if (!edits.length) return s;
  edits.sort((a, b) => b.start - a.start);
  let out = s;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

/** Retire la notation des dés (2d6, 1d100kh, d%) avant l'analyse. */
function stripDice(src) {
  return String(src ?? "").replace(/\b\d*d(?:\d+|%)(?:[a-z]+\d*)*/gi, " 0 ").replace(/@/g, "");
}

const TEXT_RE = /\{\{\s*(=?)([\s\S]*?)\}\}/g;
const BRACE_RE = /\{([^{}]+)\}/g;

/* ============================================================ */
/*  VISITEURS                                                    */
/* ============================================================ */

/**
 * Visiteur générique : `onKey(name, fam, info)` pour chaque clé lue,
 * `onFormula(src, fam, info, opts)` pour chaque formule, `onEffect`,
 * `onButton`. En mode réécriture, chaque fonction peut rendre une
 * nouvelle valeur (sinon undefined).
 */
function makeVisitor(ctn, hooks) {
  const resolve = (fam) => (fam === "self" ? (ctn.family ?? "item") : fam);
  const self = (fam) => fam === "self";
  const info = (where, fam) => ({ ctn, where, self: self(fam) });
  let changed = false;
  const set = (h, p, v) => { if (v !== undefined && v !== h[p]) { h[p] = v; changed = true; } };
  const keyIn = (name, fam, where) => hooks.key?.(String(name ?? "").trim(), resolve(fam), info(where, fam));
  const formulaIn = (src, fam, where, opts = {}) => hooks.formula?.(String(src ?? ""), resolve(fam), info(where, fam), opts);
  const v = {
    get changed() { return changed; },
    key(h, p, fam, where) {
      if (!h || typeof h[p] !== "string" || !h[p].trim()) return;
      set(h, p, keyIn(h[p], fam, where));
    },
    keys(h, p, fam, where) {
      if (!h || !Array.isArray(h[p])) return;
      h[p].forEach((_k, i) => v.key(h[p], i, fam, where));
    },
    formula(h, p, fam, where, opts = {}) {
      if (!h || typeof h[p] !== "string" || !h[p].trim()) return;
      if (/^-?\d+(\.\d+)?$/.test(h[p].trim())) return;
      set(h, p, formulaIn(h[p], fam, where, opts));
    },
    text(h, p, fam, where) {
      if (!h || typeof h[p] !== "string" || !h[p].includes("{{")) return;
      const src = h[p];
      let any = false;
      const out = src.replace(TEXT_RE, (m, eq, body) => {
        const b = body.trim();
        if (!b) return m;
        if (eq === "=") {
          const n = formulaIn(b, fam, where);
          if (n !== undefined && n !== b) { any = true; return m.replace(b, n); }
          return m;
        }
        const n = keyIn(b, fam, where);
        if (n !== undefined && n !== b) { any = true; return m.replace(b, n); }
        return m;
      });
      if (any) set(h, p, out);
    },
    braces(h, p, fam, where) {
      if (!h || typeof h[p] !== "string" || !h[p].includes("{")) return;
      let any = false;
      const out = h[p].replace(BRACE_RE, (m, body) => {
        const n = formulaIn(body.trim(), fam, where);
        if (n !== undefined && n !== body.trim()) { any = true; return `{${n}}`; }
        return m;
      });
      if (any) set(h, p, out);
    },
    entry(h, p, fam, where) {
      if (!h || typeof h[p] !== "string") return;
      const t = h[p].trim();
      if (!t.startsWith("@")) return;
      const n = keyIn(t.slice(1), fam, where);
      if (n !== undefined && n !== t.slice(1)) set(h, p, `@${n}`);
    },
    value(h, p, famFormula, famAt, where) {
      if (!h || typeof h[p] !== "string" || !h[p].trim()) return;
      const t = h[p].trim();
      if (t.startsWith("@")) {
        const n = keyIn(t.slice(1), famAt, where);
        if (n !== undefined && n !== t.slice(1)) set(h, p, `@${n}`);
        return;
      }
      v.formula(h, p, famFormula, where);
    },
    effect(h, p, where, opts = {}) {
      if (!h || typeof h[p] !== "string" || !h[p].trim()) return;
      const t = h[p].trim();
      if (t.startsWith("@")) {
        const n = keyIn(t.slice(1), "item", where);
        if (n !== undefined && n !== t.slice(1)) set(h, p, `@${n}`);
        return;
      }
      hooks.effect?.(t, info(where, null), opts);
    },
    button(h, p, where, { prefix = "" } = {}) {
      if (!h || typeof h[p] !== "string") return;
      const raw = h[p];
      if (prefix && !raw.startsWith(prefix)) return;
      const k = raw.slice(prefix.length).trim();
      if (!k) return;
      const n = hooks.button ? hooks.button(k, info(where, null)) : keyIn(k, "item", where);
      if (n !== undefined && n !== k) set(h, p, prefix + n);
    },
    attr(h, p, fam, where) {
      if (!h || typeof h[p] !== "string" || !h[p].startsWith("values.")) return;
      const rest = h[p].slice(7);
      const [k, ...tail] = rest.split(".");
      const n = keyIn(k, fam, where);
      if (n !== undefined && n !== k) set(h, p, ["values." + n, ...tail].join("."));
    }
  };
  return v;
}

/* ============================================================ */
/*  VÉRIFIER                                                     */
/* ============================================================ */

/**
 * Le rapport. `onlyTemplate` : seulement ce qui touche ce modèle (ses
 * propres références, et les références globales à sa famille).
 * @returns {Array<{level: "error"|"warn", ctn, where, msg}>}
 */
export function check({ onlyTemplate = null } = {}) {
  const L = (k, d) => game.i18n.format(k, d ?? {});
  const idx = buildIndex();
  const funcs = knownFuncs();
  const issues = [];
  const all = containers();
  /* Effets connus : ceux du gestionnaire + ceux propres aux objets. */
  for (const c of all) for (const k of c.effectKeys?.() ?? []) idx.effects.add(k);
  /* États de Foundry (à terre, aveuglé…) : des effets valables aussi. */
  for (const se of CONFIG.statusEffects ?? []) if (se?.id) idx.effects.add(se.id);
  for (const c of all) for (const k of c.profileNames?.() ?? []) idx.profiles.add(k.toLowerCase());
  const extraVars = new Set(STEP_VARS);
  for (const c of all) for (const k of c.varNames?.() ?? []) extraVars.add(k);
  const famLabel = (f) => L(KEY_FAMILIES.get(f)?.label ?? (f === "actor" ? "SBE.Checker.FamActor" : "SBE.Checker.FamItem"));
  const onlyFam = onlyTemplate ? familyOf(onlyTemplate) : null;

  const known = (name, fam, inf) => {
    if (inf.self && inf.ctn.templateId) {
      const k = idx.byTpl.get(inf.ctn.templateId);
      if (k) return k.all.has(name);
    }
    return idx[fam]?.has(name) ?? false;
  };
  const concerns = (fam, inf) => {
    if (!onlyTemplate) return true;
    if (inf.ctn.templateId) return inf.ctn.templateId === onlyTemplate.id;
    return fam === onlyFam;
  };

  for (const ctn of all) {
    let data;
    try { data = ctn.read(); } catch (_e) { continue; }
    const hooks = {
      key(name, fam, inf) {
        if (!name || !concerns(fam, inf)) return undefined;
        if (!known(name, fam, inf)) {
          issues.push({ level: "error", ctn, where: inf.where,
            msg: L(inf.self ? "SBE.Checker.KeyMissingHere" : "SBE.Checker.KeyMissing", { key: name, fam: famLabel(fam) }) });
        }
        return undefined;
      },
      formula(src, fam, inf, opts) {
        if (!concerns(fam, inf)) return undefined;
        /* Avec des dés : la formule est relue, dés mis de côté (« 2d4 + 2 »
           est juste ; « 2d4 + » reste une erreur). */
        {
          /* Étiquettes de dés « [feu] » et groupes « {…} » : syntaxe des dés. */
          const err = validateFormula(opts.dice ? stripDice(String(src ?? "").replace(/\[[^\]]*\]/g, "")).replace(/[{}]/g, " ") : src);
          if (err) { issues.push({ level: "error", ctn, where: inf.where, msg: L("SBE.Checker.FormulaError", { formula: src, msg: err }) }); return undefined; }
        }
        const { ids, strs } = scanFormula(opts.dice ? stripDice(src) : src);
        const vars = new Set(opts.vars ?? []);
        const unknown = new Set();
        for (const id of ids) {
          const n = id.name;
          if (funcs.has(n) || JS_WORDS.has(n) || vars.has(n) || extraVars.has(n) || STRING_ARG_FUNCS[n]) continue;
          if (opts.selfPrefix && n.startsWith("self_")) {
            if (funcs.has(n.slice(5))) continue;            /* self_slotted(…) */
            if (!known(n.slice(5), ctn.family ?? "item", { ...inf, self: true })) unknown.add(n);
            continue;
          }
          /* « picked_clé » : un champ de l'objet choisi plus tôt (étape Choisir). */
          if (n.startsWith("picked_")) {
            if (!known(n.slice(7), "item", { ...inf, self: false })) unknown.add(n);
            continue;
          }
          if (!known(n, fam, inf)) unknown.add(n);
        }
        for (const st of strs) {
          const f = strFamily(st, fam);
          if (!f || !st.value) continue;
          if (f === "effect") { if (!idx.effects.has(st.value.toLowerCase()) && !idx.effects.has(st.value)) unknown.add(`"${st.value}"`); continue; }
          if (!known(st.value, f, { ...inf, self: inf.self && strScope(st) === "same" })) unknown.add(`"${st.value}"`);
        }
        if (unknown.size) {
          issues.push({ level: "warn", ctn, where: inf.where,
            msg: L("SBE.Checker.FormulaUnknown", { formula: src, keys: [...unknown].join(", ") }) });
        }
        return undefined;
      },
      effect(key, inf) {
        if (onlyTemplate && inf.ctn.templateId !== onlyTemplate.id && !(onlyFam === "actor" && !inf.ctn.templateId)) return;
        if (!idx.effects.has(key) && !idx.effects.has(key.toLowerCase())) {
          issues.push({ level: "error", ctn, where: inf.where, msg: L("SBE.Checker.EffectMissing", { key }) });
        }
      },
      button(key, inf) {
        if (onlyTemplate && onlyFam !== "item") return undefined;
        if (onlyTemplate && inf.ctn.templateId && inf.ctn.templateId !== onlyTemplate.id) return undefined;
        const tplKeys = inf.ctn.templateId ? idx.byTpl.get(inf.ctn.templateId)?.buttons : null;
        const ok = tplKeys && ctn.family === "item" ? tplKeys.has(key) : idx.buttons.has(key);
        if (!ok) issues.push({ level: "error", ctn, where: inf.where, msg: L("SBE.Checker.ButtonMissing", { key }) });
        return undefined;
      }
    };
    try { ctn.walk(data, makeVisitor(ctn, hooks), { idx }); }
    catch (err) { console.warn(`SBE | Vérificateur : lecture de « ${ctn.label} » en échec`, err); }
    for (const extra of ctn.extraChecks?.(data, idx) ?? []) {
      if (!onlyTemplate || !ctn.templateId || ctn.templateId === onlyTemplate.id) issues.push({ ctn, ...extra });
    }
  }
  return issues;
}

/* ============================================================ */
/*  TROUVER ET RENOMMER                                          */
/* ============================================================ */

/** Une référence propre à un modèle (renommée seulement s'il est coché) ? */
function limited(inf, f, scope) {
  if (!inf.ctn.templateId || f !== inf.ctn.family) return false;
  if (scope === "self") return true;
  if (scope === "global") return false;
  return !!inf.self;
}

/**
 * Où la clé `old` (famille `fam`) est-elle utilisée ?
 * `templates` : ids des modèles concernés par le renommage (le modèle
 * qu'on modifie + ceux cochés) — leurs références « self » comptent.
 * @returns {Array<{ctn, where, global: boolean}>}
 */
export function find(old, fam, templates) {
  const hits = [];
  const ids = new Set(templates ?? []);
  const test = (name, f, inf, scope = "same") => {
    if (f !== fam) return false;
    if (limited(inf, f, scope) && !ids.has(inf.ctn.templateId)) return false;
    return renamedKey(name, old, "x") !== null;
  };
  for (const ctn of containers()) {
    let data;
    try { data = ctn.read(); } catch (_e) { continue; }
    const seen = new Set();
    const note = (inf) => {
      const id = `${inf.where}`;
      if (seen.has(id)) return;
      seen.add(id);
      hits.push({ ctn, where: inf.where, global: !inf.ctn.templateId });
    };
    const hooks = {
      key(name, f, inf) { if (test(name, f, inf)) note(inf); return undefined; },
      formula(src, f, inf, opts = {}) {
        const out = rewriteFormula(src, f, (n, ff, sc) => (test(n, ff, inf, sc) ? "x" : null), { ...opts, selfFam: inf.ctn.family ?? "item" });
        if (out !== src) note(inf);
        return undefined;
      }
    };
    try { ctn.walk(data, makeVisitor(ctn, hooks), {}); } catch (_e) { /* */ }
  }
  return hits;
}

/**
 * Renomme `old` en `nw` partout (famille `fam`). Les références propres
 * à un modèle (« self ») ne changent que dans les modèles de `templates`.
 * @returns {Promise<{changed: number, failed: Array<string>}>}
 */
export async function rename(old, nw, fam, templates) {
  const ids = new Set(templates ?? []);
  const test = (name, f, inf, scope = "same") => {
    if (f !== fam) return null;
    if (limited(inf, f, scope) && !ids.has(inf.ctn.templateId)) return null;
    return renamedKey(name, old, nw);
  };
  let changed = 0;
  const failed = [];
  for (const ctn of containers()) {
    if (ctn.locked) continue;
    let data;
    try { data = ctn.read(); } catch (_e) { continue; }
    const hooks = {
      key(name, f, inf) { return test(name, f, inf) ?? undefined; },
      formula(src, f, inf, opts = {}) {
        const out = rewriteFormula(src, f, (n, ff, sc) => test(n, ff, inf, sc), { ...opts, selfFam: inf.ctn.family ?? "item" });
        return out !== src ? out : undefined;
      }
    };
    const v = makeVisitor(ctn, hooks);
    try {
      ctn.walk(data, v, { rename: { old, nw, fam, templates: ids } });
      if (v.changed || data?.__changed) {
        delete data.__changed;
        await ctn.write(data);
        changed++;
      }
    } catch (err) {
      console.warn(`SBE | Vérificateur : renommage dans « ${ctn.label} » en échec`, err);
      failed.push(ctn.label);
    }
  }
  return { changed, failed };
}

/* ============================================================ */
/*  VALEURS DES FICHES ET DES OBJETS                             */
/* ============================================================ */

/* Ce qu'un document range PAR CLÉ hors de ses valeurs : niveaux reçus,
   historique et demande d'un composant Niveau, points temporaires d'une
   jauge, tri d'une grille. Ils suivent la clé renommée. */
const KEYED_FLAGS = ["levelGranted", "levelLog", "levelPending", "temp", "gridSort"];

/** Déplace les valeurs `old` (et sous-clés) vers `nw` sur un document. */
function valueMoves(doc, old, nw) {
  const upd = {};
  const del = () => foundry.data.operators.ForcedDeletion.create();
  const values = doc?.system?.values ?? {};
  for (const k of Object.keys(values)) {
    const n = renamedKey(k, old, nw);
    if (!n) continue;
    upd[`system.values.${n}`] = values[k];
    upd[`system.values.${k}`] = del();
  }
  const flags = doc?.flags?.[SYSTEM_ID] ?? {};
  for (const f of KEYED_FLAGS) {
    const map = flags[f];
    if (!map || typeof map !== "object" || !(old in map)) continue;
    upd[`flags.${SYSTEM_ID}.${f}.${nw}`] = foundry.utils.deepClone(map[old]);
    upd[`flags.${SYSTEM_ID}.${f}.${old}`] = del();
  }
  /* L'historique d'un Niveau note les valeurs d'avant / après PAR CLÉ
     (pour redescendre) : elles suivent aussi, quel que soit le niveau. */
  const renameIn = (obj) => {
    if (!obj || typeof obj !== "object") return [obj, false];
    let moved = false;
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      const n = renamedKey(k, old, nw);
      if (n) moved = true;
      out[n ?? k] = v;
    }
    return [out, moved];
  };
  for (const [lv, log] of Object.entries(flags.levelLog ?? {})) {
    if (!Array.isArray(log)) continue;
    let touched = false;
    const next = log.map(e => {
      const c = foundry.utils.deepClone(e);
      for (const part of ["before", "after"]) { const [o, m] = renameIn(c[part]); c[part] = o; touched ||= m; }
      if (c.journal?.values) { const [o, m] = renameIn(c.journal.values); c.journal.values = o; touched ||= m; }
      return c;
    });
    if (touched) upd[`flags.${SYSTEM_ID}.levelLog.${lv === old ? nw : lv}`] = next;
  }
  for (const [lv, p] of Object.entries(flags.levelPending ?? {})) {
    const [snap, m] = renameIn(p?.snapshot);
    if (m) upd[`flags.${SYSTEM_ID}.levelPending.${lv === old ? nw : lv}`] = { ...foundry.utils.deepClone(p), snapshot: snap };
  }
  return upd;
}

/**
 * Valeurs saisies : les fiches et objets des modèles `templates` passent
 * de `old` à `nw` (rien n'est perdu). Jetons non liés et objets portés
 * compris ; un compendium verrouillé est signalé.
 * @returns {Promise<{docs: number, locked: Array<string>}>}
 */
export async function moveValues(old, nw, fam, templates) {
  const ids = new Set(templates ?? []);
  let docs = 0;
  const locked = [];
  const touch = async (doc) => {
    if (!ids.has(doc?.system?.templateId)) return;
    const upd = valueMoves(doc, old, nw);
    if (!Object.keys(upd).length) return;
    await doc.update(upd, { sbeKeyRename: true });
    docs++;
  };
  const items = (actor) => [...(actor?.items ?? [])];
  if (fam === "actor") {
    for (const a of game.actors ?? []) if (a.type !== "template") await touch(a);
  } else {
    for (const i of game.items ?? []) if (i.type !== "template") await touch(i);
    for (const a of game.actors ?? []) for (const i of items(a)) await touch(i);
  }
  /* Jetons non liés : leur propre copie de l'acteur. */
  for (const sc of game.scenes ?? []) {
    for (const td of sc.tokens ?? []) {
      if (td.actorLink || !td.actor) continue;
      if (fam === "actor") await touch(td.actor);
      else for (const i of items(td.actor)) await touch(i);
    }
  }
  /* Compendiums : les documents de ces modèles y sont aussi déplacés ;
     un compendium verrouillé ne peut pas l'être (signalé). */
  for (const pack of game.packs ?? []) {
    if (!["Actor", "Item"].includes(pack.documentName)) continue;
    let index;
    try { index = await pack.getIndex({ fields: ["system.templateId", "type"] }); } catch (_e) { continue; }
    const hit = [...index].some(e => ids.has(e.system?.templateId)) || (fam === "item" && pack.documentName === "Actor");
    if (!hit) continue;
    if (pack.locked) { if ([...index].some(e => ids.has(e.system?.templateId))) locked.push(pack.title); continue; }
    try {
      for (const doc of await pack.getDocuments()) {
        await touch(doc);
        if (fam === "item" && doc.documentName === "Actor") for (const i of items(doc)) await touch(i);
      }
    } catch (err) { console.warn(`SBE | Vérificateur : compendium « ${pack.title} »`, err); locked.push(pack.title); }
  }
  return { docs, locked };
}
