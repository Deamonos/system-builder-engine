/**
 * SBE — VALEURS DES PARTIES « VISION » ET « LUMIÈRE » D'UN EFFET
 *
 * Chaque champ de ces parties accepte :
 *   - un nombre (ou un texte : couleur, nom d'animation…) ;
 *   - une FORMULE lue sur la fiche du porteur ;
 *   - « @clé » : la valeur lue sur l'OBJET qui confère l'effet.
 *
 * Pour un OBJET (onglet Lumière), formules et « @clé » se lisent sur
 * l'objet lui-même (itemReader).
 *
 * Choix par nom : un mode de vision, une animation ou une technique de
 * coloration lus sur l'objet peuvent être donnés par leur identifiant
 * ou par leur nom affiché (une liste du modèle aux choix « Radar »,
 * « Vision nocturne »…).
 */

import { evalExpression } from "../../builder/formula-engine.mjs";
import { docScope } from "../../builder/doc-context.mjs";
import { EffectEngine } from "../effects/effect-engine.mjs";

/** Valeurs par défaut d'une lumière de Foundry (champs avancés). */
export const LIGHT_DEFAULTS = { attenuation: 0.5, luminosity: 0.5, saturation: 0, contrast: 0, shadows: 0, coloration: 1 };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/** Comparaison souple : casse, accents et espaces ignorés. */
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/** Les techniques de coloration de Foundry : [{ id, label }]. */
export function colorationTechniques() {
  const T = foundry.canvas?.rendering?.shaders?.AdaptiveLightingShader?.SHADER_TECHNIQUES ?? {};
  return Object.values(T).filter(t => Number.isFinite(Number(t?.id)))
    .map(t => ({ id: Number(t.id), label: game.i18n.localize(t.label ?? String(t.id)) }));
}

/** Retrouve une entrée par identifiant ou par nom affiché. */
export function matchChoice(value, entries) {
  const v = norm(value);
  if (!v) return "";
  for (const [id] of entries) if (norm(id) === v) return id;
  for (const [id, label] of entries) if (norm(label) === v) return id;
  return "";
}

/**
 * Lecteur des valeurs d'un effet pour un acteur : résout « @clé » sur
 * l'objet qui confère l'effet, et les formules sur la fiche du porteur.
 */
export function effectReader(actor, key) {
  return makeReader(() => EffectEngine.grantSources(actor).get(key)?.[0] ?? null, actor);
}

/**
 * Lecteur des valeurs d'un OBJET (onglet Lumière) : « @clé » ET les
 * formules se lisent sur l'objet lui-même (sa portée, son état…).
 */
export function itemReader(item) {
  return makeReader(() => item, item);
}

/** Un lecteur : `getItem` donne l'objet de « @clé », `formulaDoc` la
    fiche où se lisent les formules. */
function makeReader(getItem, formulaDoc) {
  let item;
  let itemScope = null;
  let actorScope = null;
  const actor = formulaDoc;
  const source = () => (item === undefined ? (item = getItem() ?? null) : item);
  const scopeOf = (doc) => { try { return docScope(doc); } catch (_e) { return {}; } };
  return {
    /** La valeur brute (« @clé » lue sur l'objet). */
    raw(v) {
      const s = typeof v === "string" ? v.trim() : v;
      if (typeof s === "string" && s.startsWith("@")) {
        const it = source();
        if (!it) return "";
        const k = s.slice(1);
        itemScope ??= scopeOf(it);
        return itemScope[k] ?? it.system?.values?.[k] ?? "";
      }
      return s ?? "";
    },
    /** Un nombre (formule lue sur la fiche du porteur). */
    num(v, dflt) {
      const r = this.raw(v);
      if (r === "" || r === null || r === undefined) return dflt;
      if (typeof r === "boolean") return r ? 1 : 0;
      const n = Number(r);
      if (Number.isFinite(n)) return n;
      actorScope ??= scopeOf(actor);
      let x;
      try { x = Number(evalExpression(String(r), actorScope)); } catch (_e) { return dflt; }
      return Number.isFinite(x) ? x : dflt;
    },
    /** Un texte (couleur, nom…). */
    text(v) {
      const r = this.raw(v);
      return r === null || r === undefined ? "" : String(r).trim();
    },
    /** Un vrai / faux. */
    bool(v) {
      const r = this.raw(v);
      if (typeof r === "string") return !!r && !["0", "false", "non", "no"].includes(norm(r));
      return !!r;
    },
    get item() { return source(); }
  };
}

/** Une couleur valable (#rrggbb) ou null. */
export function colorOf(s) {
  const c = String(s ?? "").trim();
  /* Le blanc (valeur de départ d'un champ Couleur) = pas de teinte. */
  return /^#[0-9a-f]{6}$/i.test(c) && c.toLowerCase() !== "#ffffff" ? c.toLowerCase() : null;
}

/**
 * La lumière d'un effet, résolue en nombres pour Foundry (null si elle
 * n'éclaire pas).
 */
export function resolveLight(actor, def) {
  const l = def?.look?.light;
  if (!l?.enabled) return null;
  return resolveLightWith(l, effectReader(actor, def.key));
}

/** Une lumière (valeurs brutes) résolue avec un lecteur donné. */
export function resolveLightWith(l, r) {
  const dim = Math.max(0, r.num(l.dim, 0));
  const bright = Math.max(0, r.num(l.bright, 0));
  if (!(dim > 0 || bright > 0)) return null;
  const anims = Object.entries(CONFIG.Canvas?.lightAnimations ?? {}).map(([k, a]) => [k, game.i18n.localize(a?.label ?? k)]);
  const type = matchChoice(r.text(l.animation), anims) || null;
  const techs = colorationTechniques().map(t => [String(t.id), t.label]);
  /* Technique : son numéro (« 3 ») ou son nom ; vide = celle de Foundry. */
  const rawCol = r.text(l.coloration);
  const hit = matchChoice(rawCol, techs);
  const col = hit !== "" ? Number(hit) : (rawCol !== "" && Number.isFinite(Number(rawCol)) ? Number(rawCol) : NaN);
  return {
    dim, bright,
    color: colorOf(r.text(l.color)),
    alpha: clamp(r.num(l.alpha, 0.5), 0, 1),
    angle: clamp(r.num(l.angle, 360), 1, 360),
    attenuation: clamp(r.num(l.attenuation, LIGHT_DEFAULTS.attenuation), 0, 1),
    luminosity: clamp(r.num(l.luminosity, LIGHT_DEFAULTS.luminosity), 0, 1),
    saturation: clamp(r.num(l.saturation, LIGHT_DEFAULTS.saturation), -1, 1),
    contrast: clamp(r.num(l.contrast, LIGHT_DEFAULTS.contrast), -1, 1),
    shadows: clamp(r.num(l.shadows, LIGHT_DEFAULTS.shadows), 0, 1),
    coloration: Number.isFinite(col) ? col : LIGHT_DEFAULTS.coloration,
    animation: {
      type,
      speed: clamp(r.num(l.speed, 5), 0, 10),
      intensity: clamp(r.num(l.intensity, 5), 0, 10),
      reverse: r.bool(l.reverse)
    },
    personal: typeof l.personal === "string" ? r.bool(l.personal) : !!l.personal
  };
}

/** La plus forte de plusieurs lumières résolues. */
export function strongestLight(lights) {
  return lights.filter(Boolean).sort((a, b) => (b.bright - a.bright) || (b.dim - a.dim))[0] ?? null;
}

/** Un champ de l'effet dépend-il de l'objet ou de la fiche (à relire) ? */
export function isDynamic(v) {
  const s = String(v ?? "").trim();
  return !!s && (s.startsWith("@") || !Number.isFinite(Number(s)));
}
