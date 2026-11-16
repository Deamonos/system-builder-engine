/**
 * SBE — Data model du TEMPLATE d'objet
 *
 * Le template est le plan de construction : sa fiche EST l'atelier
 * (WYSIWYG). Il est intransportable (jamais déposé sur une scène ni
 * dans un contenant) — seuls les modèles et instances circulent.
 *
 * La structure est volontairement souple : `elements` est un tableau
 * d'objets libres, car les types d'éléments vont s'enrichir palier
 * après palier (structure, style, formules, tables, slots…). Chaque
 * élément porte au minimum :
 *   { id, kind, key, label, config: {...}, style: {...} }
 *
 * - id     : identifiant interne stable (jamais montré) ;
 * - kind   : type d'élément ("text", "number", "checkbox", "select",
 *            "image", puis les suivants aux paliers à venir) ;
 * - key    : CLÉ unique dans le template — la référence que tout le
 *            reste du moteur utilisera (formules, managers, slots) ;
 * - label  : libellé affiché ;
 * - config : options propres au type (min/max, choix de liste…) ;
 * - style  : apparence (palier style à venir).
 *
 * `structVersion` est un compteur monotone : il s'incrémente à chaque
 * modification de structure et permettra aux modèles de savoir qu'une
 * version plus récente du template existe (indicateur + rechargement).
 */

import { allKeys, isKeyTaken } from "../builder/element-renderer.mjs";

const fields = foundry.data.fields;

export class SBETemplateData extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {
      schemaVersion: new fields.NumberField({ required: true, integer: true, initial: 1 }),
      structVersion: new fields.NumberField({ required: true, integer: true, initial: 0 }),

      /* GENRE d'un modèle de personnage : "character" (une fiche) ou
         "shop" (l'apparence d'une boutique de marchand : ses composants
         Étal, Caisse, Bourse de l'acheteur, Zone de vente). */
      genre: new fields.StringField({ required: true, initial: "character", choices: ["character", "shop"] }),

      /* Nom de l'onglet Fiche (vide = libellé traduit par défaut).
         L'onglet Description, lui, n'est PAS renommable (décision). */
      sheetTabName: new fields.StringField({ required: true, initial: "" }),

      /* Onglets personnalisés supplémentaires de la fiche :
         [{ id, name, playerVisible }] — les éléments racine portent
         zone = id de l'onglet. */
      extraTabs: new fields.ArrayField(new fields.ObjectField(), { initial: () => [] }),

      /* Options fixes du modèle (en tête de fiche). */
      opts: new fields.SchemaField({
        stackable: new fields.BooleanField({ initial: false }),
        /* Taille maximale d'une PILE (0 = illimitée). Réglée par la
           molette de l'option « empilable ». */
        stackMax: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        droppable: new fields.BooleanField({ initial: true }),
        playerVisible: new fields.BooleanField({ initial: true }),
        /* REPÈRES SUR L'ICÔNE (valeurs, icônes, jauges, halo) : réglés
           par la molette de l'option, détail dans iconMarks. */
        marks: new fields.BooleanField({ initial: false }),
        /* OBJET DE SCÈNE : peut être posé sur la scène (pion non lié),
           réglages dans propCfg. */
        prop: new fields.BooleanField({ initial: false }),
        /* NON IDENTIFIÉ : les joueurs voient une version inconnue tant
           que la clé `unidKey` (une case) est fausse sur l'objet. */
        unid: new fields.BooleanField({ initial: false }),
        unidKey: new fields.StringField({ required: true, initial: "" }),
        unidGroup: new fields.BooleanField({ initial: false }),
        /* INACTIF SI : tant que la formule (lue sur l'objet) est vraie,
           l'objet n'apporte rien aux carried() de son porteur. */
        inactive: new fields.BooleanField({ initial: false }),
        inactiveIf: new fields.StringField({ required: true, initial: "" })
      }),

      /* Réglages d'objet de scène (voir managers/props/prop-manager.mjs). */
      propCfg: new fields.ObjectField({ initial: () => ({}) }),

      /* Repères sur l'icône des objets de ce modèle : { marks, halo }
         (voir builder/icon-marks.mjs). */
      iconMarks: new fields.ObjectField({ initial: () => ({ marks: [], halo: [] }) }),

      /* MÉDIAS DÉCLARÉS : les NOMS de sons/animations que ce modèle
         réclame — [{ id, name, hint }]. C'est de la structure : le
         modèle dit « il me faut un média nommé tir » ; chaque OBJET
         pose ensuite son propre fichier derrière ce nom (un fusil à
         pompe et un pistolet ne sonnent pas pareil). */
      mediaDefs: new fields.ArrayField(new fields.ObjectField(), { initial: () => [] }),

      /* EFFETS CONFÉRÉS (modèles d'objets) : [{ effect, when }] —
         effect = clé d'effet, ou « @clé » lue sur chaque objet ;
         when = "carried" (porté) | "equipped" (dans un slot de la fiche). */
      grants: new fields.ArrayField(new fields.ObjectField(), { initial: () => [] }),

      /* Structure construite dans l'atelier. */
      elements: new fields.ArrayField(
        new fields.ObjectField(),
        { initial: () => [] }
      ),

      /* Réglages des éléments NATIFS de l'en-tête (modèles de
         personnage) : { img: {config,style}, name: {config,style} }.
         Édités via les crayons de l'en-tête de l'atelier. */
      nativeUi: new fields.ObjectField({ initial: () => ({}) }),

      /* Thème propre au modèle (modèles de personnage) :
         useGlobal = true → le thème général SBE s'applique ;
         false → apparence native de Foundry pour ce modèle et ses
         fiches. Objet libre : d'autres options de thème viendront. */
      theme: new fields.ObjectField({ initial: () => ({ useGlobal: true }) }),

      /* HUD propre au modèle (modèles de personnage) : sa barre, ses
         menus et son apparence (managers/hud/hud-model.mjs). */
      hud: new fields.ObjectField({ initial: () => ({}) }),

      /* Barres de jetons propres au modèle (modèles de personnage) :
         { mode, bars, keepNative } (managers/bars/bar-model.mjs). */
      tokenBars: new fields.ObjectField({ initial: () => ({}) })
    };
  }

  /** Toutes les clés utilisées dans le template (arbre complet). */
  get keys() {
    return allKeys(this.elements);
  }

  /** Vrai si la clé est déjà prise par un AUTRE élément (arbre complet). */
  isKeyTaken(key, exceptId = null) {
    return isKeyTaken(this.elements, key, exceptId);
  }
}
