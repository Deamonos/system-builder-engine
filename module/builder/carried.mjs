/**
 * SBE — Lecture de l'INVENTAIRE depuis les formules
 *
 * AUCUN système de poids n'est câblé dans le moteur (décision actée) :
 * le poids, l'encombrement, la valeur marchande, le nombre de balles
 * n'existent que si le créateur les invente. Ce qu'il lui faut, c'est
 * une seule chose : pouvoir dire « regarde chez ce personnage tous les
 * objets qui portent CETTE clé, et fais-moi la somme ».
 *
 * D'où trois fonctions, et rien de plus :
 *   carried("cle")            somme de la clé sur TOUS les objets portés
 *   carried("cle", "contenant") somme limitée à un conteneur ou un slot
 *   carriedCount()            nombre d'objets portés
 *   carriedCount("contenant") nombre d'objets dans ce contenant
 *   carriedValue("cle", "contenant")
 *                             la valeur de la clé sur l'objet LOGÉ dans
 *                             ce contenant, telle quelle (sans la
 *                             multiplier par la quantité) — le bonus de
 *                             dégâts de la munition chargée, par exemple
 *
 * Un objet INACTIF (option du modèle « Inactif si ») n'apporte rien à
 * carried() ni à carriedValue() ; carriedCount() le compte toujours.
 *
 * La QUANTITÉ est toujours prise en compte : une pile de 12 flèches à
 * 0,1 pèse 1,2. Un objet absent de la clé compte pour 0 — jamais
 * d'erreur, jamais de formule cassée.
 *
 * Un slot étant un contenant d'une case, `carried("degats", "arme")`
 * lit l'objet ÉQUIPÉ dans le slot « arme » : aucune fonction
 * supplémentaire n'est nécessaire pour l'équipement.
 *
 * PORTÉE : sur une fiche de personnage, ces fonctions voient tout ce
 * qu'il porte ; sur un OBJET, seulement ce que cet objet contient. Une
 * arme compte donc les balles de SON chargeur, jamais celles d'à côté.
 *
 * Module volontairement SANS import : il est appelé par le moteur de
 * formules, qui est lui-même appelé par l'inventaire.
 */

/** Noms réservés par ces fonctions (refusés comme clés d'élément). */
export const CARRIED_FUNCS = ["carried", "carriedCount", "carriedValue"];

/** Toutes les entrées portées, tous contenants confondus. */
function entriesOf(inv, where) {
  if (!inv) return [];
  if (where === undefined || where === null || where === "") {
    return Array.isArray(inv.all) ? inv.all : [];
  }
  const key = String(where);
  return (Array.isArray(inv.all) ? inv.all : []).filter(e => e.where === key);
}

/** Les entrées qui APPORTENT leurs valeurs (objets actifs). */
function activeOf(inv, where) {
  return entriesOf(inv, where).filter(e => !e.inactive);
}

/** Les fonctions d'inventaire, liées à un inventaire donné. */
export function carriedFuncs(inv) {
  return {
    carried: (key, where) => {
      const k = String(key ?? "");
      if (!k) return 0;
      return activeOf(inv, where).reduce((sum, e) => {
        const v = Number(e.vals?.[k]);
        return Number.isFinite(v) ? sum + v * (e.qty || 1) : sum;
      }, 0);
    },
    carriedCount: (where) =>
      entriesOf(inv, where).reduce((n, e) => n + (e.qty || 1), 0),
    carriedValue: (key, where) => {
      const k = String(key ?? "");
      const e = activeOf(inv, where)[0];
      if (!k || !e) return 0;
      const v = e.vals?.[k];
      if (v === undefined || v === null || v === "") return 0;
      const n = Number(v);
      return Number.isFinite(n) ? n : v;
    }
  };
}

/**
 * SOURCES d'une formule qui lit l'inventaire : pour chaque appel
 * carried("cle"[, "contenant"]), les objets portés qui apportent une
 * valeur non nulle (icône, nom, montant). Sert à l'info-bulle d'un
 * champ « 2 en 1 » : « +10 Brécheur » plutôt qu'un « +10 » muet.
 */
export function carriedSources(inv, formula) {
  const out = [];
  const re = /\bcarried\(\s*["']([^"']+)["']\s*(?:,\s*["']([^"']*)["']\s*)?\)/g;
  for (const m of String(formula ?? "").matchAll(re)) {
    for (const e of activeOf(inv, m[2])) {
      const v = Number(e.vals?.[m[1]]);
      if (!Number.isFinite(v) || !v) continue;
      out.push({ img: e.img, name: e.name, delta: v * (e.qty || 1) });
    }
  }
  return out;
}

/**
 * Injecte les fonctions dans une portée de formule. Une clé du
 * créateur portant le même nom garde la main (comme pour les
 * fonctions mathématiques) — mais ces noms sont refusés à la
 * validation, donc le cas ne devrait jamais se produire.
 */
export function withCarried(scope, inv) {
  const funcs = carriedFuncs(inv);
  for (const [name, fn] of Object.entries(funcs)) {
    if (!(name in scope)) scope[name] = fn;
  }
  return scope;
}
