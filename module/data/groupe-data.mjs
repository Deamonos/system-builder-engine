/**
 * SBE — Data model du GROUPE (type d'acteur)
 *
 * Un groupe réunit des fiches de personnage (possédées par un joueur)
 * et garde leurs SAUVEGARDES, comme un jeu vidéo :
 *   - 3 emplacements manuels (« 1 », « 2 », « 3 ») et un emplacement
 *     automatique (« auto ») ;
 *   - chaque sauvegarde : l'état complet de chaque membre (fiche,
 *     objets, effets) en texte JSON, l'heure du monde et la date réelle.
 * La sauvegarde automatique (nouvelle journée, minuteur en temps réel)
 * ne vaut que pour le groupe ACTIF (un seul à la fois, réglage du monde).
 */

const fields = foundry.data.fields;

export const GROUP_SLOTS = ["1", "2", "3", "auto"];

export class SBEGroupeData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {
      /* Membres : UUID des fiches de personnage. */
      members: new fields.ArrayField(new fields.StringField(), { initial: () => [] }),

      /* Sauvegardes : { "1": { json, worldTime, realTime }, … }. */
      slots: new fields.ObjectField({ initial: () => ({}) }),

      /* Sauvegarde automatique (groupe actif seulement). */
      autoSave: new fields.SchemaField({
        newDay: new fields.BooleanField({ initial: false }),
        timerMinutes: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0 })
      }),

      /* Son joué à chaque sauvegarde : qui l'entend (« all » | « gm »). */
      media: new fields.SchemaField({
        sound: new fields.StringField({ initial: "" }),
        volume: new fields.NumberField({ required: true, integer: true, min: 0, max: 100, initial: 80 }),
        audience: new fields.StringField({ initial: "gm", choices: ["gm", "all"] })
      }),

      description: new fields.HTMLField({ initial: "" })
    };
  }
}
