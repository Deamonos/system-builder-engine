/**
 * SBE — Data model de l'OBJET (modèle et instance)
 *
 * Deux étages partagent ce type :
 * - MODÈLE : créé depuis un template (« Créer un objet »), vit dans les
 *   items du monde ; templateId le rattache à son plan. modelId vide.
 * - INSTANCE : créée en glissant un modèle (scène, contenant, fiche) ;
 *   item indépendant, modelId le rattache à son modèle d'origine.
 *
 * Les IDs sont la SOURCE DE VÉRITÉ UNIQUE de toute la chaîne :
 * template ← (templateId) ← modèle ← (modelId) ← instance.
 *
 * `values` stocke les valeurs par clé du template ({ cle: valeur }) —
 * souple exprès : les clés vivent dans le template, pas dans le schéma.
 * `templateVersion` mémorise la structVersion du template au moment de
 * la (re)construction : si le template a avancé depuis, le modèle
 * saura qu'un rechargement est disponible (palier suivant).
 *
 * L'onglet DESCRIPTION est obligatoire et toujours premier pour les
 * objets (décision actée) — d'où le champ dédié ici.
 */

const fields = foundry.data.fields;

export class SBEObjetData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {
      schemaVersion: new fields.NumberField({ required: true, integer: true, initial: 1 }),

      /* Rattachements (source de vérité = IDs). */
      templateId: new fields.StringField({ required: true, initial: "" }),
      templateVersion: new fields.NumberField({ required: true, integer: true, initial: 0 }),
      modelId: new fields.StringField({ required: true, initial: "" }),

      /* Contenu. */
      description: new fields.HTMLField({ initial: "" }),
      values: new fields.ObjectField({ initial: () => ({}) }),

      /* MÉDIAS de CET objet, par nom déclaré par le modèle :
         { <idDéclaré>: { sound, volume, audience, range, falloff } }.
         Objet libre : les animations viendront s'y ajouter. */
      media: new fields.ObjectField({ initial: () => ({}) }),

      /* PORTAGE — source de vérité UNIQUE de « où est cet objet ».
         Un objet porté est un item EMBARQUÉ sur la fiche ; ce bloc dit
         dans quel contenant il se range :
         - host  : id de l'OBJET qui l'héberge (sac, arme à modules…) ;
           vide = la fiche elle-même ;
         - where : CLÉ du conteneur ou du slot qui l'accueille ;
         - x/y/rot : réservés à la grille spatiale (palier suivant) ;
         - cell : case dans une grille en tri manuel (-1 = auto).
         « Équipé » n'existe pas comme booléen : un objet est équipé
         parce que `where` pointe la clé d'un slot. Une seule vérité,
         aucune désynchronisation possible. */
      carry: new fields.SchemaField({
        host: new fields.StringField({ required: true, initial: "" }),
        where: new fields.StringField({ required: true, initial: "" }),
        x: new fields.NumberField({ required: true, integer: true, initial: 0 }),
        y: new fields.NumberField({ required: true, integer: true, initial: 0 }),
        rot: new fields.NumberField({ required: true, integer: true, initial: 0 }),
        /* Case d'une GRILLE en tri manuel (-1 = première case libre). */
        cell: new fields.NumberField({ required: true, integer: true, initial: -1, min: -1 }),
        /* ORIGINE d'un objet ÉQUIPÉ : le contenant d'où il est venu dans
           son slot (hôte + clé). Délogé du slot, il y retourne. Vide hors
           d'un slot. */
        fromHost: new fields.StringField({ required: true, initial: "" }),
        fromWhere: new fields.StringField({ required: true, initial: "" })
      })
    };
  }

  /** Vrai si cet item est un MODÈLE (pas encore instancié). */
  get isModel() {
    return !this.modelId;
  }

  /** Empilable ? (option fixe du modèle, portée par le template). */
  get stackable() {
    return !!this.template?.system?.opts?.stackable;
  }

  /**
   * Quantité de la PILE. La clé « quantity » est réservée par le
   * moteur : elle n'existe que si le modèle est empilable et que le
   * créateur a posé l'élément natif Quantité. Sinon : 1.
   */
  get quantity() {
    if (!this.stackable) return 1;
    const n = Number(this.values?.quantity);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
  }

  /** Le document template dont dérive cet objet (ou null). */
  get template() {
    return this.templateId ? (game.items.get(this.templateId) ?? null) : null;
  }
}
