/**
 * SBE — Data model du PERSONNAGE
 *
 * Même patron que l'objet : la STRUCTURE vit dans le modèle (Actor de
 * type "template", même data model SBETemplateData que les objets),
 * seules les VALEURS vivent ici, indexées par clé.
 *
 * PJ / PNJ n'est PAS une donnée : c'est un état déduit de la propriété
 * de la fiche (un joueur propriétaire = PJ, sinon PNJ) — décision
 * actée : un seul modèle sert aux deux, zéro duplication.
 */

const fields = foundry.data.fields;

export class SBEPersonnageData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {
      schemaVersion: new fields.NumberField({ required: true, integer: true, initial: 1 }),

      /* Rattachement au modèle (IDs = source de vérité). */
      templateId: new fields.StringField({ required: true, initial: "" }),
      templateVersion: new fields.NumberField({ required: true, integer: true, initial: 0 }),

      /* Contenu. */
      description: new fields.HTMLField({ initial: "" }),
      values: new fields.ObjectField({ initial: () => ({}) })
    };
  }

  /** Le modèle (Actor template) dont dérive cette fiche (ou null). */
  get template() {
    return this.templateId ? (game.actors.get(this.templateId) ?? null) : null;
  }
}
