/**
 * SBE — Data model du type d'acteur « prop » (OBJETS DE SCÈNE)
 *
 * Un seul personnage de ce type par monde, caché de la barre latérale :
 * le BASE des pions non liés qui portent les objets posés sur la scène
 * (voir managers/props/prop-manager.mjs). Il ne porte rien lui-même.
 */

export class SBEPropData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {};
  }
}
