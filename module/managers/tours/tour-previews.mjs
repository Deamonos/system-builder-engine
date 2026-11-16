/**
 * SBE — Visites guidées : APERÇUS
 *
 * Une visite montre un module même quand le MJ ne l'a pas activé : le
 * VRAI composant, nourri de données d'exemple, jamais enregistrées, et
 * retiré quand l'étape se termine. Chaque module qui sait s'afficher en
 * aperçu s'inscrit ici : registerPreview(id, { show, hide }).
 */

const PREVIEWS = new Map();

/**
 * Inscrit un aperçu.
 * @param {string} id
 * @param {{ show: () => (void|Promise<void>), hide: () => (void|Promise<void>) }} preview
 */
export function registerPreview(id, preview) {
  if (id && typeof preview?.show === "function" && typeof preview?.hide === "function") PREVIEWS.set(String(id), preview);
}

/** Montre un aperçu ; rend vrai s'il existe. */
export async function showPreview(id) {
  const p = PREVIEWS.get(String(id));
  if (!p) return false;
  await p.show();
  return true;
}

/** Retire un aperçu. */
export async function hidePreview(id) {
  await PREVIEWS.get(String(id))?.hide();
}
