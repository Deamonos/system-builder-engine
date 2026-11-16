/**
 * SBE — Références par clé
 *
 * Principe fondateur : les managers ne connaissent jamais « l'argent »,
 * « le poids » ou « la stat de crochetage » en dur. Ils pointent une CLÉ
 * de template via un menu déroulant, et le moteur résout la valeur.
 *
 * Familles de références :
 * - "actor" : clés des futurs templates de fiche de personnage
 *             (argent, stats de jets…) — branchement à venir ;
 * - "item"  : clés de NOMBRE des modèles d'objets — BRANCHÉ : le menu
 *             liste toutes les clés numériques de tous les modèles
 *             (c'est là que vit « le poids » de chaque système).
 */

import { walkElements } from "../builder/element-renderer.mjs";

/**
 * Liste des clés disponibles pour une famille.
 * @param {"actor"|"item"} kind
 * @returns {Array<{key: string, label: string}>}
 */
export function getKeyRefChoices(kind) {
  if (kind === "item") {
    const seen = new Map(); /* clé → libellé (premier rencontré) */
    for (const tpl of game.items.filter(i => i.type === "template")) {
      for (const el of walkElements(tpl.system.elements ?? [])) {
        if (!["number", "gauge", "level"].includes(el?.kind) || !el.key || seen.has(el.key)) continue;
        const label = el.label || el.key;
        seen.set(el.key, `${label} — ${tpl.name}`);
      }
    }
    return [...seen.entries()].map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));
  }
  if (kind === "actor") {
    /* Clés de nombre/jauge des MODÈLES DE PERSONNAGES — c'est là que
       vivent l'argent, les stats de jets, etc. */
    const seen = new Map();
    for (const tpl of game.actors.filter(a => a.type === "template")) {
      for (const el of walkElements(tpl.system.elements ?? [])) {
        if (!el?.key || seen.has(el.key)) continue;
        if (el.kind !== "number" && el.kind !== "gauge") continue;
        const label = el.label || el.key;
        seen.set(el.key, `${label} — ${tpl.name}`);
      }
    }
    return [...seen.entries()].map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));
  }
  return [];
}

/**
 * Construit les <option> d'un menu de référence de clé.
 * @param {"actor"|"item"} kind
 * @param {string} selected  Clé actuellement choisie.
 * @returns {string} HTML des options.
 */
export function buildKeyRefOptions(kind, selected = "") {
  const placeholderKey = kind === "item"
    ? "SBE.KeyRefs.PlaceholderItem"
    : "SBE.KeyRefs.PlaceholderActor";
  let html = `<option value="" ${selected === "" ? "selected" : ""}>${game.i18n.localize(placeholderKey)}</option>`;
  for (const c of getKeyRefChoices(kind)) {
    const e = (v) => foundry.utils.escapeHTML(String(v ?? ""));
    html += `<option value="${e(c.key)}" ${selected === c.key ? "selected" : ""}>${e(c.label)} (${e(c.key)})</option>`;
  }
  return html;
}
