/**
 * SBE — CONTEXTE DE CALCUL d'un document
 *
 * Ce que toute formule portant sur une fiche doit voir : les objets
 * portés, les apports (effets…) et les fonctions de fiche (maxOf,
 * hasEffect…). Un seul assemblage, utilisé partout — un jet, une
 * condition de bouton, la nouvelle journée et un déclencheur d'effet
 * lisent exactement la même fiche que celle affichée.
 */

import { buildInventory, carrierOf, itemsAround } from "./inventory.mjs";
import { contributionsOf } from "./contributions.mjs";
import { scopeFunctionsOf, registerScopeFunctions } from "./doc-scope.mjs";
import { buildScope, computeAll, withDefaults } from "./formula-engine.mjs";
import { walkElements, valueBounds } from "./element-renderer.mjs";
import { SYSTEM_ID } from "../helpers/constants.mjs";
import { memoOf } from "./data-revision.mjs";

export function docContext(doc) {
  const contributions = contributionsOf(doc);
  return {
    inventory: buildInventory(doc),
    contributions,
    functions: scopeFunctionsOf(doc, contributions)
  };
}

/* ------------------------------------------------------------ */
/*  carrier("clé") : un OBJET lit la fiche de son PORTEUR        */
/* ------------------------------------------------------------ */
/* Une arme a besoin de la Distance et de la maîtrise de celui qui la
   tient ; une armure, de sa Force… Le porteur est calculé UNE fois, à
   la première lecture (paresseux), avec tout ce que voit sa fiche :
   champs calculés, apports, objets portés. Pas de boucle possible :
   les objets vus DEPUIS la fiche du porteur se calculent sans cette
   fonction (elle y vaut 0). Hors d'une fiche : 0. */
/* La fiche du porteur, gardée tant que rien ne change : chacun de ses
   objets la lit pendant un même affichage (fiches de compétences,
   conditions de boutons…) — calculée une seule fois. */
const CARRIER_SCOPES = new WeakMap();
const CARRIER_FNS = new WeakMap();
registerScopeFunctions("carrier", (doc) => {
  if (doc?.documentName !== "Item") return {};
  const actor = carrierOf(doc);
  if (!actor || actor.documentName !== "Actor") return {};
  let scope = null;
  const read = () => {
    scope ??= memoOf(CARRIER_SCOPES, actor, () => {
      const els = actor.system?.template?.system?.elements ?? [];
      const vals = withDefaults(els, actor.system?.values);
      const { results } = computeAll(els, vals, docContext(actor));
      return { ...vals, ...results };
    });
    return scope;
  };
  let fns = null;
  return {
    carrier: (key) => {
      const v = read()[String(key ?? "")];
      if (v === undefined || v === null || v === "") return 0;
      const n = Number(v);
      return Number.isFinite(n) ? n : v;
    },
    /* Les bornes réelles d'un champ du porteur (max en formule, apports). */
    carrierMax: (key) => {
      fns ??= memoOf(CARRIER_FNS, actor, () => docScope(actor));
      const n = Number(typeof fns.maxOf === "function" ? fns.maxOf(String(key ?? "")) : NaN);
      return Number.isFinite(n) ? n : 0;
    }
  };
});

/* ------------------------------------------------------------ */
/*  slotted("slot", "clé") : ce qu'un objet a dans un slot        */
/* ------------------------------------------------------------ */
/* L'arme rangée dans un piège, le chargeur d'une arme… Sans clé : 1 si
   le slot est occupé, 0 sinon. Avec une clé : sa valeur sur l'objet
   rangé (champs calculés compris) ; "" si le slot est vide. */
registerScopeFunctions("slotted", (doc) => {
  if (doc?.documentName !== "Item") return {};
  const heldOf = (slot) => itemsAround(doc).find(it => it.type === "objet"
    && String(it.system?.carry?.host ?? "") === doc.id && String(it.system?.carry?.where ?? "") === String(slot ?? ""));
  return {
    slotted: (slot, key) => {
      const it = heldOf(slot);
      if (key === undefined || key === null || key === "") return it ? 1 : 0;
      if (!it) return "";
      const els = it.system?.template?.system?.elements ?? [];
      const vals = withDefaults(els, it.system?.values);
      const { results } = computeAll(els, vals, docContext(it));
      const v = { ...vals, ...results }[String(key)];
      if (v === undefined || v === null) return "";
      return typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : v;
    }
  };
});

/* ------------------------------------------------------------ */
/*  owns(objets [, siVide]) : combien d'objets de cette sorte     */
/*  le personnage possède                                         */
/* ------------------------------------------------------------ */
/* Un nom, un id d'objet du monde, ou une LISTE (liste de références :
   « Classes autorisées »). Sur un objet : son porteur. Liste vide :
   `siVide` (0 par défaut) — `owns(classes_autorisees, 1)` = « aucune
   classe exigée, ou il en a une ». */
registerScopeFunctions("owns", (doc) => {
  const actor = doc?.documentName === "Actor" ? doc : carrierOf(doc);
  return {
    owns: (what, ifEmpty = 0) => {
      const list = (Array.isArray(what) ? what : [what]).map(x => String(x ?? "").trim()).filter(Boolean);
      if (!list.length) return Number(ifEmpty) || 0;
      if (actor?.documentName !== "Actor") return 0;
      const want = new Set(list.map(x => x.toLowerCase()));
      let n = 0;
      for (const it of actor.items ?? []) {
        if (it.type !== "objet") continue;
        const ids = [it.id, it.system?.modelId, it.name].map(x => String(x ?? "").toLowerCase());
        if (ids.some(x => x && want.has(x))) n++;
      }
      return n;
    }
  };
});

/** Portée complète d'un document (valeurs données, ou les siennes). */
export function docScope(doc, values = null) {
  const tpl = doc?.system?.template;
  return buildScope(tpl?.system?.elements ?? [], values ?? doc?.system?.values ?? {}, docContext(doc));
}

/**
 * BORNES À L'ÉCRITURE : toute valeur écrite sur une fiche (saisie,
 * macro, HUD, effet…) est ramenée dans les bornes EFFECTIVES de son
 * champ — jauge : min/max du modèle, max en formule, sous-clés
 * « clé_min » / « clé_max » et leurs apports ; nombre : min/max posés.
 * Un seul point de contrôle : impossible de mettre 120 PV sur 95.
 * Modifie `changes` sur place (forme imbriquée ou aplatie).
 * @returns {boolean} une valeur a-t-elle été ramenée ?
 */
export function clampValueChanges(doc, changes) {
  const flat = foundry.utils.flattenObject(changes ?? {});
  const touched = Object.keys(flat).filter(p => /^system\.values\.[^.]+$/.test(p));
  if (!touched.length) return false;
  let clamped = false;
  const els = [...walkElements(doc?.system?.template?.system?.elements ?? [])];
  const byKey = new Map(els.filter(e => e?.key).map(e => [e.key, e]));
  const merged = { ...(doc.system?.values ?? {}) };
  for (const p of touched) merged[p.slice(14)] = flat[p];
  let scope = null;
  /* DÉBORDEMENT (option de jauge) : ce qui passe sous le minimum ou
     au-dessus du maximum va dans une autre clé (× facteur) — qui est à
     son tour ramenée dans ses bornes (et peut déborder plus loin). */
  const queue = touched.map(p => p.slice(14));
  const done = new Set();
  const write = (key, val) => {
    const p = `system.values.${key}`;
    if (p in changes) changes[p] = val;
    else foundry.utils.setProperty(changes, p, val);
    merged[key] = val;
  };
  while (queue.length) {
    const key = queue.shift();
    if (done.has(key)) continue;
    done.add(key);
    const el = byKey.get(key);
    if (!el || !["gauge", "number"].includes(el.kind) || el.config?.computed) continue;
    const raw = merged[key];
    const n = Number(raw);
    if (raw === "" || raw === null || raw === undefined || !Number.isFinite(n)) continue;
    scope ??= docScope(doc, merged);
    const { min, max } = valueBounds(el, { ...merged, ...scope });
    const v = Math.min(Math.max(n, min), max);
    if (v === n) continue;
    clamped = true;
    write(key, v);
    const ov = el.kind === "gauge" ? el.config?.overflow : null;
    const dest = ov ? (n < min ? ov.low : ov.high) : "";
    if (!dest || done.has(dest) || !byKey.has(dest)) continue;
    const extra = Math.abs(n - v) * (Number.isFinite(Number(ov.ratio)) ? Number(ov.ratio) : 1);
    if (!extra) continue;
    const base = Number(merged[dest]) || 0;
    write(dest, n < min ? base - extra : base + extra);
    queue.push(dest);
  }
  return clamped;
}

/* ============================================================ */
/*  POINTS TEMPORAIRES (option de jauge « Accepte des points     */
/*  temporaires ») — sous-clé « clé_temp »                       */
/* ============================================================ */

/** Jauges à points temporaires du modèle d'un document. */
export function tempGauges(doc) {
  const els = doc?.system?.template?.system?.elements ?? [];
  return [...walkElements(els)].filter(e => e?.kind === "gauge" && e.key && e.config?.temp?.on && !e.config?.computed);
}

/**
 * À L'ÉCRITURE, au seul endroit par où tout passe :
 *
 * 1. DONNER : écrire « pv_temp = 8 » (étape, jet, macro, effet…) veut
 *    dire « donner 8 » — selon la jauge : garder le plus grand, ou
 *    additionner. Écrire 0 (ou moins) les retire. Les compteurs de
 *    durée repartent quand on en reçoit.
 * 2. ENCAISSER : toute BAISSE de la jauge est d'abord prise sur les
 *    temporaires (PV 30 + 5 temp, −8 → temp 0, PV 27).
 *
 * Exception : la SAISIE DIRECTE dans la fiche (options.sbeDirect) —
 * la case prend exactement ce qu'on tape, rien n'est absorbé ni cumulé.
 * Les dissipations du moteur passent options.sbeTempInternal.
 * Modifie `changes` sur place.
 */
export function applyTempPoints(doc, changes, options = {}) {
  const gauges = tempGauges(doc);
  if (!gauges.length) return;
  const flat = foundry.utils.flattenObject(changes ?? {});
  const cur = doc.system?.values ?? {};
  const direct = !!options.sbeDirect;
  const internal = !!options.sbeTempInternal;
  const put = (p, v) => {
    if (p in changes) changes[p] = v;
    else foundry.utils.setProperty(changes, p, v);
  };
  const now = Number(game.time?.worldTime ?? 0);
  for (const el of gauges) {
    const k = el.key;
    const cfg = el.config.temp;
    const tPath = `system.values.${k}_temp`;
    const vPath = `system.values.${k}`;
    const before = Math.max(0, Number(cur[`${k}_temp`]) || 0);
    let temp = before;

    /* 1. Donner / régler les temporaires. */
    if (tPath in flat) {
      const n = Number(flat[tPath]);
      const given = Number.isFinite(n) ? n : 0;
      if (direct || internal) temp = Math.max(0, given);
      else if (given <= 0) temp = 0;
      else temp = cfg.stack === "add" ? before + given : Math.max(before, given);
      put(tPath, temp);
      /* Reçus (plus qu'avant) : la durée repart de zéro. */
      if (temp > before && !internal) {
        put(`flags.${SYSTEM_ID}.temp.${k}`, { rounds: Number(cfg.rounds) || 0, at: now });
      }
    }

    /* 2. Encaisser une baisse. */
    if (!direct && vPath in flat && temp > 0) {
      const nv = Number(flat[vPath]);
      const old = Number(cur[k] ?? el.config?.default ?? 0);
      if (Number.isFinite(nv) && Number.isFinite(old) && nv < old) {
        const absorb = Math.min(temp, old - nv);
        put(vPath, nv + absorb);
        put(tPath, temp - absorb);
      }
    }
  }
}
