/**
 * SBE — Data model d'une QUÊTE (type de page de journal « quete »)
 *
 * Une quête vit dans un journal de quêtes (journal marqué SBE, voir
 * managers/quest/quest-manager.mjs). Elle appartient à une SECTION du
 * journal (un groupe, ou des PJ choisis) : ses droits suivent les
 * joueurs de cette section.
 */

const fields = foundry.data.fields;

const valueEntry = () => new fields.SchemaField({
  key: new fields.StringField({ initial: "" }),
  amount: new fields.NumberField({ required: true, nullable: false, initial: 0 }),
  /* « each » = par personne ; « total » = à répartir à la fin. */
  mode: new fields.StringField({ initial: "each", choices: ["each", "total"] })
});

const itemEntry = () => new fields.SchemaField({
  uuid: new fields.StringField({ initial: "" }),
  qty: new fields.NumberField({ required: true, nullable: false, integer: true, min: 1, initial: 1 }),
  /* « each » = la quantité pour chaque membre ; « total » = à répartir. */
  mode: new fields.StringField({ initial: "each", choices: ["each", "total"] })
});

const bundle = () => new fields.SchemaField({
  values: new fields.ArrayField(valueEntry(), { initial: () => [] }),
  items: new fields.ArrayField(itemEntry(), { initial: () => [] })
});

export class SBEQueteData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {
      sectionId: new fields.StringField({ initial: "" }),
      /* Sous-onglet du journal (communauté, guilde, pays…) ; vide = aucun. */
      tabId: new fields.StringField({ initial: "" }),
      /* Cachée aux joueurs tant que le MJ ne l'a pas révélée (à la main,
         par « Annoncer », par l'étape « Quête », ou par « Apparaît si »). */
      hidden: new fields.BooleanField({ initial: false }),
      revealIf: new fields.StringField({ initial: "" }),
      category: new fields.StringField({ initial: "" }),
      status: new fields.StringField({ initial: "active" }),
      img: new fields.StringField({ initial: "" }),
      description: new fields.HTMLField({ initial: "" }),

      /* Donneur : un acteur glissé, un simple nom, ou anonyme. */
      giver: new fields.SchemaField({
        mode: new fields.StringField({ initial: "anon", choices: ["actor", "name", "anon"] }),
        uuid: new fields.StringField({ initial: "" }),
        name: new fields.StringField({ initial: "" })
      }),

      /* Lieu : une scène / un journal glissé, ou un texte. */
      place: new fields.SchemaField({
        uuid: new fields.StringField({ initial: "" }),
        text: new fields.StringField({ initial: "" })
      }),

      /* Objectifs (liste plate ; une sous-tâche porte l'id de son parent). */
      objectives: new fields.ArrayField(new fields.SchemaField({
        id: new fields.StringField({ initial: "" }),
        parent: new fields.StringField({ initial: "" }),
        label: new fields.StringField({ initial: "" }),
        kind: new fields.StringField({ initial: "check", choices: ["check", "count"] }),
        done: new fields.BooleanField({ initial: false }),
        /* Échoué (posé par le MJ ou un bouton) : en rouge, jamais rempli. */
        failed: new fields.BooleanField({ initial: false }),
        count: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
        target: new fields.NumberField({ required: true, nullable: false, integer: true, min: 1, initial: 1 }),
        optional: new fields.BooleanField({ initial: false }),
        hidden: new fields.BooleanField({ initial: false }),
        /* « Fait si » : formule lue sur les membres, ou sur une cible. */
        auto: new fields.SchemaField({
          on: new fields.BooleanField({ initial: false }),
          who: new fields.StringField({ initial: "members", choices: ["members", "target"] }),
          formula: new fields.StringField({ initial: "" }),
          target: new fields.StringField({ initial: "" })
        })
      }), { initial: () => [] }),

      rewards: bundle(),
      penalties: bundle(),

      /* Échéance en temps du monde (facultative). */
      deadline: new fields.SchemaField({
        on: new fields.BooleanField({ initial: false }),
        worldTime: new fields.NumberField({ required: true, nullable: false, initial: 0 })
      })
    };
  }

  /** Un objectif est-il atteint ? */
  static objectiveDone(o) {
    if (o.failed) return false;
    return o.kind === "count" ? (o.count ?? 0) >= (o.target ?? 1) : !!o.done;
  }
}
