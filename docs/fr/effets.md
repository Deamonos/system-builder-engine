**À quoi ça sert :** poser un état sur un personnage. Un bonus, un malus, un poison, une bénédiction, une rage : un effet modifie des valeurs pendant un temps, se cumule ou non, et se voit sur le pion.

**Exemple :** l'effet « Béni » de la démo : `attaque` **Ajouter** `2`, `defense` **Ajouter** `1`, pendant 10 rounds (10 minutes hors combat).

## Le gestionnaire d'effets

Tous les effets du monde se créent au même endroit, le **gestionnaire d'effets** :

- l'outil **Effets** (éclair) de la barre des jetons, à gauche de la scène ;
- ou les **paramètres du système** → **Gérer les effets**.

À gauche, la liste des effets ; à droite, celui qu'on règle.

![Le gestionnaire d'effets, avec l'effet « Béni » de la démo : +2 en attaque, +1 en défense, 10 rounds](img/effets-gestionnaire.webp)

**Nouvel effet** en crée un, **Dupliquer** en copie un. **Importer** et **Exporter** passent les effets d'un monde à l'autre en JSON. **Enregistrer** garde tout.

## L'identité de l'effet

| Réglage | Ce qu'il fait |
|---|---|
| **Nom** et **Icône** | Ce que voient les joueurs, sur le pion, la fiche et le chat. |
| **Couleur** | Le blanc de l'icône prend cette couleur, partout. |
| **Clé** | L'identifiant, utilisé par les formules et les étapes : `beni`. Mêmes règles que toutes les clés SBE. |
| **Description** | Le texte affiché au survol. |
| **Catégorie** | Facultative et libre : `Maladie`, `Poison`… Plusieurs effets d'une même catégorie coexistent. Un bouton peut réagir à toute une catégorie. |

## Ce que l'effet modifie

Une ligne par modification : une **clé** de vos modèles de personnage, un **mode**, un **montant** (un nombre ou une formule lue sur la fiche, par exemple `force / 2`).

| Mode | Ce qu'il fait |
|---|---|
| **Ajouter** | `+2`, ou `-2` pour un malus. |
| **Multiplier** | `0.5` divise par deux. |
| **Au plus (plafond)** | La valeur ne dépasse pas ce montant. |
| **Au moins (plancher)** | La valeur ne descend pas sous ce montant. |
| **Remplacer par** | La valeur devient ce montant. |

- Les bornes d'une jauge se visent avec `clé_max` et `clé_min` : `pv_max` **Ajouter** `5`.
- Ordre appliqué : multiplier, ajouter, au plus, au moins, remplacer.
- **Rien n'est écrit dans les valeurs.** La fiche affiche le total, coloré (vert pour un bonus, rouge pour un malus), avec le détail au survol. L'effet parti, la valeur d'origine revient d'elle-même.

![La fiche de Lys bénie : Attaque et Défense en vert, le détail au survol, et le composant Effets actifs](img/effets-fiche.webp)

## La durée

- **Rounds** : en combat, l'effet perd un round à chaque nouveau round.
- **Temps de jeu** : hors combat, il suit le temps du monde (secondes, minutes, heures, jours).
- `0` = pas de limite pour ce compteur. À zéro, l'effet est retiré.

## Cumuls et exclusivité

- **Cumulable** : l'effet peut être posé plusieurs fois (×2, ×3…), jusqu'au **Maximum**.
- **Le montant suit les cumuls** : ajouter ×N, multiplier ^N. Exemple : « Saignement » à 3 cumuls fait perdre 3 PV par round.
- **Groupe exclusif** : deux effets du même groupe ne coexistent pas. Poser l'un retire l'autre. Exemple : les niveaux de fatigue, groupe `fatigue`.

## Combat

**Empêche de se défendre** : le porteur ne fait plus de jet de défense, d'esquive, de parade ni de sauvegarde quand on l'attaque. Étourdi, paralysé, endormi…

**Agit comme le statut Foundry** : voir [L'apparence d'un effet](#effets-apparence).

## Poser et retirer un effet

- **Dans le HUD du pion** : clic gauche pose l'effet (ou +1 cumul), clic droit le retire (ou −1 cumul).
- **Avec un bouton** : l'étape **Effet** pose, retire, ou change les cumuls. Voir [Toutes les étapes](#etapes-liste).
- **Avec un objet** : tant qu'il est porté ou équipé, ou à l'usage d'un bouton. Voir [Les effets des objets](#effets-objets).
- **Tout seul** : quand des conditions deviennent vraies. Voir [Les effets qui évoluent](#effets-avances).

## Les conditions natives de Foundry

En bas de la liste, les **conditions de Foundry** (Aveugle, À terre, Invisible…). Un clic les règle comme un effet SBE : nom, icône, modifications, durée, déclencheur. L'**œil** les masque du HUD, la **flèche** rend l'original.

## Pour aller plus loin

Dans une formule, `hasEffect("beni")` dit si le personnage a l'effet, `stacksOf("saignement")` donne ses cumuls, et `effectCategory("empoisonne")` donne la catégorie d'un effet. Voir [Les fonctions de formule](#fonctions).
