/**
 * SBE — FEUILLE DES BLOCS CSS DES ÉLÉMENTS
 *
 * Le CSS avancé d'un élément peut contenir des BLOCS (« &:hover {…} »,
 * « & .partie {…} », « &::after {…} », « @media … {…} ») et des
 * @keyframes / @property. Les déclarations simples restent posées sur
 * l'élément (inline) ; les blocs, eux, ne peuvent pas vivre dans un
 * attribut style : ils sont rassemblés ici, dans UNE feuille globale,
 * chaque bloc visant son élément par data-sbe-el (voir elCssId).
 *
 * Le style d'un élément reste donc SUR l'élément (modèle, export,
 * import) — cette feuille n'en est que la traduction pour le navigateur,
 * reconstruite à chaque modification d'un modèle.
 *
 * Valable partout où l'élément est rendu : atelier, fiches, objets.
 * ZÉRO dépendance : CSS natif (imbrication « & »).
 */

import { walkElements, splitElementCss, elCssId } from "../../builder/element-renderer.mjs";

const STYLE_ID = "sbe-element-css";
/* Règles sorties telles quelles (globales par nature). */
const HOIST = /^@(?:-webkit-)?(?:keyframes|property|font-face)\b/i;

export class ElementCss {

  static #timer = null;

  /** Feuille de tous les éléments à blocs des modèles du monde. */
  static build() {
    const docs = [
      ...(game.actors?.filter(a => a.type === "template") ?? []),
      ...(game.items?.filter(i => i.type === "template") ?? [])
    ];
    const seen = new Set();
    const hoisted = new Map();
    let rules = "";
    for (const doc of docs) {
      /* Natifs de l'en-tête : leur style vit dans system.nativeUi. */
      const nu = doc.system?.nativeUi ?? {};
      const natives = [
        { kind: "actorImg", style: nu.img?.style ?? {} },
        { kind: "actorName", style: nu.name?.style ?? {} }
      ];
      for (const el of [...walkElements(doc.system?.elements ?? []), ...natives]) {
        const id = elCssId(el);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const sel = `[data-sbe-el="${id}"]`;
        for (const r of splitElementCss(el.style.custom).rules) {
          const body = this.#safe(r.body);
          const prelude = this.#safe(r.prelude);
          if (HOIST.test(prelude)) {
            /* Une animation nommée deux fois : la dernière gagne, une seule sortie. */
            hoisted.set(prelude, `${prelude} {\n${body}\n}`);
            continue;
          }
          rules += `${sel} {\n  ${prelude} {\n${body}\n  }\n}\n`;
        }
      }
    }
    return `/* SBE — blocs CSS des éléments (généré) */\n${[...hoisted.values()].join("\n")}\n${rules}`;
  }

  /** Rien ne peut sortir de la balise <style>. */
  static #safe(s) {
    return String(s ?? "").replace(/<\/?\s*style/gi, "");
  }

  /** (Ré)injecte la feuille. */
  static refresh() {
    try {
      let tag = document.getElementById(STYLE_ID);
      if (!tag) {
        tag = document.createElement("style");
        tag.id = STYLE_ID;
      }
      /* Fin de <head> : après les feuilles du système et des thèmes. */
      document.head.appendChild(tag);
      tag.textContent = this.build();
    } catch (err) {
      console.warn("SBE | Blocs CSS des éléments : échec d'injection", err);
    }
  }

  /** Regroupe les rafales de modifications (glisser-déposer, import…). */
  static schedule() {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.refresh(), 50);
  }

  static init() {
    const onDoc = (doc, changes) => {
      if (doc.type !== "template") return;
      const sys = changes?.system ?? {};
      if (changes && !("elements" in sys) && !("nativeUi" in sys)) return;
      this.schedule();
    };
    for (const type of ["Actor", "Item"]) {
      Hooks.on(`create${type}`, (doc) => onDoc(doc, null));
      Hooks.on(`update${type}`, (doc, changes) => onDoc(doc, changes));
      Hooks.on(`delete${type}`, (doc) => onDoc(doc, null));
    }
  }
}
