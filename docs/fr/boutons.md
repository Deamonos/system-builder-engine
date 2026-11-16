**À quoi ça sert :** donner une action à une fiche. Boire une potion, tirer une flèche, lancer un sort, actionner un levier : c'est un **Bouton d'action**, posé dans l'atelier comme les autres composants.

**Exemple :** sur le modèle d'objet « Consommable », un bouton **Boire** avec deux étapes : **Consommer** 1 de cet objet (la pile baisse), puis **Modifier un champ** : ajouter `soin` aux `pv` du porteur.

> La démo Brumeval en est pleine : Boire et Faire boire… sur les potions, Attaquer, Tirer et Recharger sur les armes, Lancer sur les sorts.

## Ce que fait le bouton

Le réglage **Action du bouton** choisit entre trois sortes :

| Action | Ce qu'elle fait |
|---|---|
| **Consommer** | Le plus simple : retire des charges à chaque usage. Rien d'autre à écrire. |
| **Exécuter des étapes** | Une suite d'étapes, dans l'ordre : condition, jet, attaque, effet, son… Voir [Les étapes](#etapes). |
| **Ouvrir un menu de boutons** | Le bouton ouvre une liste d'autres boutons. Ajoutez-les sur la fiche avec le **+** sous le bouton. Exemple : Tirer → Enrayée → Débloquer. |

### Consommer

- **Champ de charges** : un nombre ou une jauge de ce modèle (munitions, utilisations…). Chaque usage le baisse. **Aucun** : le bouton consomme l'objet lui-même.
- **Charges retirées par usage** : un nombre ou une formule, par exemple `degats / 2`.
- **À zéro** : **Rien** (le bouton est grisé), **Retirer 1 de la pile** (puis l'objet avec le dernier), ou **Supprimer l'objet**.

## Les réglages communs

| Réglage | Ce qu'il fait |
|---|---|
| **Icône (image)** | Une image, ou une icône de police comme `fa-solid fa-play`. |
| **Proposer hors de la fiche (inventaire, HUD)** | Coché par défaut : l'action apparaît aussi au clic droit sur l'objet dans l'inventaire, et dans le HUD du pion. Décochez pour un bouton qui n'a de sens que dans la fiche de l'objet. |
| **Utilisable** | Pour un objet de scène : **dans l'inventaire**, **une fois posé sur la scène** (le bouton apparaît dans son panneau, au double-clic), **les deux**, ou **auto** (une fois posé s'il peut l'être, sinon dans l'inventaire). |
| **Annoncer dans le chat** | Une carte dit ce qui a changé : +7 PV, effet posé, objet consommé… Les jets et les attaques ont déjà leur propre carte. |

## Sur une fiche d'objet ou de personnage

- **Sur un modèle d'objet**, le bouton agit pour le **porteur** : le personnage qui porte l'objet. Ses jets, sa mana, sa position sur la carte.
- **Sur un modèle de personnage**, le porteur, c'est le personnage lui-même. Exemple : un bouton **Se reposer** qui remet la mana à son maximum.

## Un bouton grisé

Un bouton qui ne peut pas servir reste visible, **grisé**, et dit pourquoi au survol.

![Le menu clic droit d'un arc sans flèches : Tirer est grisé, « Plus de flèches : rechargez. » au survol](img/bouton-grise.webp)

La raison vient des **conditions** placées au début de ses étapes, des charges épuisées, ou d'un « Choisir un objet » qui n'a rien à proposer. C'est pareil sur la fiche, au clic droit dans l'inventaire et dans le HUD.

## Pour aller plus loin

Un bouton peut aussi partir sans clic, quand un événement arrive : un coup reçu, le début du tour, une nouvelle journée… Voir [Se lance tout seul](#declencheurs).
