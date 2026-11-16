/**
 * SBE — Documentation : quelle page pour quelle fenêtre
 *
 * Une ligne par fenêtre : le test qui la reconnaît, la page qui
 * l'explique. Le petit livre de l'en-tête n'apparaît que si la page
 * existe dans la documentation livrée (manifest).
 */

/** [test(app) → vrai, id de la page] — le premier qui répond gagne. */
const LINKS = [
  /* L'atelier : la fiche d'un modèle de personnage ou d'objet. */
  [(app) => app.document?.type === "template", "atelier"],
  [(app) => app.id === "sbe-checker" || app.constructor?.name === "SBECheckerApp", "verifier"],
  [(app) => app.id === "sbe-demo", "demo"],
  [(app) => app.element?.classList?.contains("sbe-rr-window"), "demandes-jet"],
  /* La fenêtre d'un composant : la page de son type (lu au clic, le type
     pouvant changer pendant qu'elle est ouverte). */
  [(app) => !!app.element?.querySelector?.(".sbe-el-pane"), (app) => PAGE_OF_KIND[kindOf(app)] ?? null]
];

/** Type de composant → page qui l'explique. */
const PAGE_OF_KIND = {
  text: "champs", richtext: "champs", number: "champs", checkbox: "champs",
  select: "champs", color: "champs", image: "champs",
  gauge: "jauge",
  frame: "mise-en-page", columns: "mise-en-page", nav: "mise-en-page", tab: "mise-en-page",
  separator: "mise-en-page", tags: "mise-en-page",
  table: "affichages", chart: "affichages", html: "affichages", effects: "affichages",
  quantity: "affichages", ref: "affichages"
};
const kindOf = (app) => app.element?.querySelector?.('[name="kind"]')?.value ?? "";

let known = null;

/** Les pages qui existent (manifest), lues une fois au démarrage. */
export function setKnownPages(ids) { known = new Set(ids); }

/** La page existe-t-elle dans la documentation livrée ? */
export function isKnownPage(id) { return !!id && !!known?.has(id); }

export function docPageFor(app) {
  for (const [test, page] of LINKS) {
    let ok = false;
    try { ok = !!test(app); } catch (_e) { ok = false; }
    if (!ok) continue;
    const id = typeof page === "function" ? page(app) : page;
    return known?.has(id) ? id : null;
  }
  return null;
}
