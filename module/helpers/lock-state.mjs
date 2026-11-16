/**
 * SBE — ÉTAT D'UNE SERRURE écrit à la demande d'un JOUEUR
 *
 * Le crochetage et le code se jouent chez le joueur ; le MJ principal
 * écrit le résultat (porte, coffre). Ce qu'un joueur peut faire changer,
 * et seulement dans le bon sens :
 *   - crochetée / cassée : passer à « oui » (jamais revenir à « non ») ;
 *   - essais : UN de plus par demande (deux échecs simultanés comptent
 *     deux fois, et personne ne remet le compteur à zéro) ;
 *   - « a le code » : s'ajouter soi-même à la liste ;
 *   - « occupé par » : se l'attribuer s'il est libre, ou libérer sa prise.
 * Les réglages de la serrure (type, code, difficulté…) restent au MJ.
 */

const FLAGS_TRUE = ["pickedOpen", "lockBroken", "digiBroken"];
const COUNTERS = ["lockAttempts", "digiAttempts"];

/** Clés d'état qu'un joueur peut demander. */
export const LOCK_STATE_KEYS = [...FLAGS_TRUE, ...COUNTERS, "digiUnlockedBy", "occupiedBy"];

/**
 * @param {object} cur     l'état actuel (réglages de la serrure)
 * @param {object} asked   les clés demandées (seules celles-ci comptent)
 * @param {string} userId  le joueur (identité réelle)
 * @returns {object} les clés à écrire (vide : rien)
 */
export function lockStateFromPlayer(cur, asked, userId) {
  const out = {};
  for (const k of LOCK_STATE_KEYS) {
    if (!asked || !(k in asked)) continue;
    const v = asked[k];
    if (FLAGS_TRUE.includes(k)) {
      if (v === true && !cur?.[k]) out[k] = true;
    } else if (COUNTERS.includes(k)) {
      out[k] = (Number(cur?.[k]) || 0) + 1;
    } else if (k === "digiUnlockedBy") {
      const list = Array.isArray(cur?.digiUnlockedBy) ? [...cur.digiUnlockedBy] : [];
      if (Array.isArray(v) && v.includes(userId) && !list.includes(userId)) out[k] = [...list, userId];
    } else if (k === "occupiedBy") {
      const holder = cur?.occupiedBy ?? null;
      const active = holder && game.users.get(holder)?.active;
      if (v === userId && (!holder || !active)) out[k] = userId;
      else if ((v === null || v === "") && holder === userId) out[k] = null;
    }
  }
  return out;
}
