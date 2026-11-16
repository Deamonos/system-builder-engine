/**
 * SBE — APPARENCES DU JETON : données
 *
 * Réglage d'un personnage, dans son drapeau `looks` :
 *   folder   dossier des images ; files : la liste lue par le MJ (les
 *            joueurs n'ont souvent pas le droit de parcourir les dossiers)
 *   lock     les joueurs ne peuvent pas changer d'apparence
 *   fx       transition (celles de Foundry) : type, durée, son, volume
 *   per      réglages facultatifs par image : libellé, taille en cases,
 *            échelle, nom affiché, déguisement
 *   rules    apparences automatiques : clé · opérateur · valeur, effet, ou
 *            boutique ouverte / fermée (marchands)
 *            actif → image (la première qui correspond l'emporte)
 *   ownerSees  le propriétaire voit aussi le vrai visage sous un déguisement
 * État (drapeau `lookState`) : manual = dernière image choisie à la main,
 * auto = image posée par une règle (vide : aucune).
 *
 * Seul le JETON change ; le portrait de la fiche n'est jamais touché.
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { COND_OPS } from "../../helpers/key-condition.mjs";

export const LOOK_FLAG = "looks";
export const STATE_FLAG = "lookState";
export const RULE_KINDS = ["key", "effect", "shop"];

/** Transitions de Foundry (filtre de transition des textures), plus « aucune ». */
export function transitionTypes() {
  const T = foundry.canvas?.rendering?.filters?.TextureTransitionFilter?.TYPES;
  const list = T ? Object.values(T) : ["fade", "swirl", "waterDrop", "morph", "crosshatch", "wind", "waves",
    "whiteNoise", "hologram", "hole", "holeSwirl", "glitch", "dots"];
  return ["none", ...list];
}

const num = (v, min, max) => {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
};

/** Libellé lisible d'une image : son nom de fichier, sans extension. */
export function fileLabel(src) {
  const base = decodeURIComponent(String(src ?? "").split("/").pop() ?? "").replace(/\.[a-z0-9]+$/i, "");
  return base.replace(/[_-]+/g, " ").trim() || String(src ?? "");
}

export function cleanLook(o = {}) {
  return {
    src: String(o.src ?? ""),
    label: String(o.label ?? "").trim(),
    w: num(o.w, 0.25, 20),
    h: num(o.h, 0.25, 20),
    scale: num(o.scale, 0.1, 5),
    name: String(o.name ?? "").trim(),
    disguise: !!o.disguise
  };
}

export function cleanRule(o = {}) {
  return {
    id: String(o.id || foundry.utils.randomID()),
    kind: RULE_KINDS.includes(o.kind) ? o.kind : "key",
    key: String(o.key ?? "").trim(),
    op: COND_OPS.includes(o.op) && o.op !== "any" ? o.op : "<=",
    value: Number(o.value) || 0,
    unit: o.unit === "pct" ? "pct" : "value",
    effect: String(o.effect ?? ""),
    shop: o.shop === "closed" ? "closed" : "open",
    src: String(o.src ?? "")
  };
}

export function cleanLooks(o = {}) {
  const types = transitionTypes();
  const fx = o.fx ?? {};
  return {
    folder: String(o.folder ?? "").replace(/\/+$/, ""),
    files: Array.isArray(o.files) ? o.files.map(String).filter(Boolean) : [],
    lock: !!o.lock,
    ownerSees: !!o.ownerSees,
    fx: {
      type: types.includes(fx.type) ? fx.type : "fade",
      ms: num(fx.ms, 0, 10000) ?? 800,
      sound: String(fx.sound ?? ""),
      volume: num(fx.volume, 0, 1) ?? 0.8
    },
    per: (Array.isArray(o.per) ? o.per : []).map(cleanLook).filter(l => l.src),
    rules: (Array.isArray(o.rules) ? o.rules : []).map(cleanRule)
  };
}

/** L'acteur « de base » (un jeton non lié lit le réglage de son acteur). */
export function baseActorOf(actor) {
  return actor?.isToken ? (game.actors.get(actor.id) ?? actor) : actor;
}

/** Réglage des apparences d'un personnage. */
export function looksOf(actor) {
  return cleanLooks(baseActorOf(actor)?.getFlag?.(SYSTEM_ID, LOOK_FLAG) ?? {});
}

/** Réglages d'une image (par défaut : rien de changé). */
export function lookFor(looks, src) {
  return looks.per.find(l => l.src === src) ?? cleanLook({ src });
}

export function labelOf(looks, src) {
  return lookFor(looks, src).label || fileLabel(src);
}

export function stateOf(actor) {
  const s = actor?.getFlag?.(SYSTEM_ID, STATE_FLAG) ?? {};
  return { manual: String(s.manual ?? ""), auto: String(s.auto ?? "") };
}

/** Image par défaut : celle du jeton prototype. */
export function defaultSrcOf(actor) {
  return baseActorOf(actor)?.prototypeToken?.texture?.src ?? "";
}
