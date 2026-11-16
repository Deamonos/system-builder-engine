**À quoi ça sert :** les composants qui **montrent** des informations : un tableau, un graphique, du HTML calculé, la liste des effets. Et quelques composants particuliers.

## Table

Un tableau de lignes et de colonnes, rempli dans le modèle, sur chaque fiche, ou les deux.

**Exemple :** une table « Portées » sur un modèle d'arme, avec une colonne verrouillée « Distance » (Courte, Moyenne, Longue) remplie dans l'atelier, et une colonne libre « Malus » saisie sur chaque arme.

Chaque colonne a son type (crayon de la colonne) :

- **Verrouillée** : remplie dans l'atelier, la même pour toutes les fiches.
- **Libre** : saisie sur chaque fiche ou objet.
- **Calculée** : une formule qui lit les autres colonnes de la ligne et les clés de la fiche.

Et aussi : la **largeur** de chaque colonne (px), le **nombre de colonnes** et le **nombre de lignes**.

> Réduire le nombre de colonnes ou de lignes supprime celles de la fin, avec leur contenu.

**Pour aller plus loin :** une table peut devenir une **table de correspondance**, lue par une formule : une valeur entre deux bornes donne un résultat (un score de 14 donne un bonus de +2). Voir [Les tables de correspondance](#tables-correspondance).

## Graphique

Des valeurs en image, mises à jour en direct : le radar des caractéristiques, des barres de compétences…

**Exemple :** un radar ; glissez vos champs `force`, `agilite` et `esprit` **dans** le graphique.

![Un radar des attributs sur une fiche](img/graphique-radar.webp)

- **Type de graphique** et **Apparence** :

| Type | Apparences |
|---|---|
| Radar (toile d'araignée) | Classique, Comparatif (2 séries) |
| Courbes | Courbe, Aires (remplie) |
| Barres | Barres, Sucettes, Points sur échelle |
| Histogramme | Classique |
| Secteurs | Camembert, Anneau, Rose de Nightingale |
| Cascade, Entonnoir, Pictogrammes (icônes répétées) | Classique |

- **Échelle Min → Max** : vide, elle reprend les bornes des champs.
- **Taille**, **Couleur principale**, **Afficher les valeurs**.

**Les champs glissés dans le graphique en deviennent les données.** Seuls les **nombres** et les **jauges** sont acceptés. Retirer un champ le renvoie à sa place d'origine ; supprimer le graphique ne supprime pas ses champs.

Une valeur modifiée par un effet s'affiche en vert (bonus) ou en rouge (malus).

## HTML libre

Pour afficher ce qu'aucun composant ne fait : un écran, un cadran, une mise en page spéciale. Le contenu se met à jour en direct.

**Exemple :** `<b>État :</b> {{= pv < 30 ? "CRITIQUE" : "STABLE" }}`

- `{{clé}}` affiche une valeur.
- `{{= formule}}` affiche un calcul.

> **Sécurité :** le HTML est assaini à l'affichage : scripts, iframes et gestionnaires d'événements sont retirés. Un modèle partagé ne peut jamais exécuter de code chez vous.

## Effets actifs

La liste des effets posés sur le personnage.

Pour chaque effet : son icône, son nom (×N s'il est cumulé), ce qu'il fait (« Agilité +10 », en vert pour un bonus, en rouge pour un malus) et le temps restant. La croix rouge retire l'effet (MJ et propriétaire). La description s'affiche au survol. Sans effet : « Aucun effet ».

## Quantité (objets)

La taille d'une pile, affichée et modifiable. Il n'existe que si le modèle est **empilable**, et il n'y en a qu'un par modèle ; sa clé est imposée : `quantity`.

## Composant du modèle

Seulement dans l'onglet **Panneau une fois posé** d’un modèle d'objet de scène : il affiche, dans le panneau de l'objet posé, un composant déjà présent sur la fiche (une jauge, un slot, un bouton). C'est **le même** composant (même clé, même valeur), rien n'est copié.

- **Sans libellé**, ou un libellé à vous (vide = le sien).

## Les autres composants

Le **bouton d'action**, le **slot**, le **conteneur**, l'**arbre** de talents et le **niveau** ont chacun leur chapitre : ce sont des mécaniques à part entière.
