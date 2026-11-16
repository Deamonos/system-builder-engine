/**
 * SBE — IDENTITÉ AFFICHÉE (les règles, en un seul endroit)
 *
 * Un personnage géré par le MJ seul (aucun joueur propriétaire) reste
 * « Inconnu » pour les joueurs tant que le MJ ne l'a pas RÉVÉLÉ.
 * Le MJ voit toujours le vrai nom. Un personnage qui appartient à un
 * joueur n'est jamais masqué.
 *
 * La révélation est posée sur l'acteur : pour un pion NON lié, c'est
 * ce pion-là (chaque garde d'une même fiche se révèle à part) ; pour
 * un pion lié, c'est la fiche entière.
 *
 * Tout ce qui MONTRE un nom passe par ici :
 *   - Identity.of(doc)  → { name, img } pour l'utilisateur courant ;
 *   - le manager (managers/identity) masque À LA SOURCE (nom de
 *     l'acteur, du pion, du combattant) : les autres modules — suivi
 *     de combat, carrousels, HUD — lisent donc déjà le bon nom.
 *
 * Point d'accroche : Hooks « sbeIdentity » (doc, out, viewer).
 */

import { SYSTEM_ID } from "./constants.mjs";

export const IDENTITY_FLAG = "identityRevealed";

export class Identity {

  /** Le module est-il actif (réglage du monde) ? */
  static get enabled() {
    try { return game.settings.get(SYSTEM_ID, "identityEnabled") !== false; }
    catch (_e) { return true; }
  }

  /** Nom montré pour un inconnu (réglage du monde, sinon la langue). */
  static unknownLabel() {
    let custom = "";
    try { custom = String(game.settings.get(SYSTEM_ID, "identityUnknown") ?? "").trim(); } catch (_e) { /* */ }
    return custom || game.i18n?.localize?.("SBE.Identity.Unknown") || "?";
  }

  /** Acteur d'un document (acteur, pion, combattant). */
  static actorOf(doc) {
    if (!doc) return null;
    if (doc.documentName === "Actor") return doc;
    return doc.actor ?? null;
  }

  /** Masquable : un personnage sans joueur propriétaire. */
  static isHideable(actor) {
    if (!actor || actor.type !== "personnage") return false;
    return !actor.hasPlayerOwner;
  }

  static isRevealed(actor) {
    return actor?.getFlag?.(SYSTEM_ID, IDENTITY_FLAG) === true;
  }

  /** Masqué pour ce spectateur ? (le MJ voit tout) */
  static isHiddenFor(actor, viewer = game.user) {
    if (!viewer || viewer.isGM || !this.enabled) return false;
    return this.isHideable(actor) && !this.isRevealed(actor);
  }

  /** Vrai nom d'un document, même masqué localement. */
  static realName(doc) {
    if (!doc) return "";
    if (doc._sbeIdMasked) return String(doc._sbeIdReal ?? "");
    return String(doc.name ?? doc._source?.name ?? "");
  }

  /**
   * Nom et portrait à montrer.
   * @param {Actor|TokenDocument|Combatant|string} docOrUuid
   * @param {User} [viewer]
   * @returns {{name:string, img:string, hidden:boolean}|null}
   */
  static of(docOrUuid, viewer = game.user) {
    let doc = docOrUuid;
    if (typeof doc === "string") {
      try { doc = fromUuidSync(doc); } catch (_e) { doc = null; }
    }
    if (!doc) return null;
    const actor = this.actorOf(doc);
    const hidden = this.isHiddenFor(actor, viewer);
    const isToken = doc.documentName === "Token";
    const out = {
      name: hidden ? this.unknownLabel() : this.realName(doc),
      img: String((isToken ? doc.texture?.src : null) || doc.img || actor?.img || ""),
      hidden
    };
    Hooks.callAll("sbeIdentity", doc, out, viewer);
    return out;
  }

  /** Référence à garder pour un acteur : son pion s'il en a un. */
  static refOf(actor) {
    if (!actor) return "";
    /* Objet posé (cible attaquable) : son pion. */
    if (actor.documentName === "Item" && actor.parent?.isToken) return actor.parent.token?.uuid ?? actor.uuid ?? "";
    return actor.token?.uuid ?? actor.getActiveTokens?.()[0]?.document?.uuid ?? actor.uuid ?? "";
  }
}
