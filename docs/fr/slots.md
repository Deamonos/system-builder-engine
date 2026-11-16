**À quoi ça sert :** une case qui accueille **un** objet — la main, l'armure, la classe, le chargeur d'une arme. Un objet rangé dans un slot est **équipé** (un conteneur peut aussi l'être, voir [Les conteneurs](#conteneurs)).

**Exemple :** un slot de clé `main`, **Filtre d'acceptation** « Par étiquette », **Étiquette(s) exigée(s)** `arme`. Seuls les objets qui portent l'étiquette `arme` peuvent y entrer.

![Trois slots d'équipement : la main droite tient une dague, la main gauche est vide, l'armure est portée](img/slots-equipement.webp)

## Ce que le slot accueille

- **Un objet (instance)** : un exemplaire porté par le personnage. C'est le cas le plus courant.
- **Un modèle (référence)** : un objet du monde, cité sans être porté (une classe, un métier).

## Le filtre

**Un slot sans filtre n'accepte rien** : choisissez au moins une façon d'accepter.

| Filtre | Ce qu'il fait |
|---|---|
| **Par modèle(s)** | Seuls les objets construits sur les modèles d'atelier cochés. |
| **Par étiquette** | Plusieurs étiquettes séparées par des virgules sont **toutes** exigées : `accessoire, poignée` accepte une poignée d'accessoire, mais pas une poignée d'arme de mêlée. Majuscules indifférentes. |
| **Par clé** | L'objet doit avoir un composant de cette clé. |

Et en plus, quel que soit le filtre :

- **Refuser les étiquettes** : un objet qui porte l'une d'elles est refusé.
- **Seulement les objets de la liste** : le slot ne prend que les objets d'une liste de références de l'objet hôte. Exemple : le chargeur d'une arme n'accepte que les munitions de sa liste « Munitions compatibles ».
- **Compatibilité avec l'hôte** : une liste déroulante de l'hôte (catégorie d'arme, classe…). L'objet déposé déclare où il va avec des **cases à cocher qui reprennent les choix** de cette liste. Exemple : une lunette avec « Fusil » et « Arc » cochés n'entre que dans une arme de l'une de ces deux catégories. Aucune case cochée : elle va partout.

## Les autres réglages

| Réglage | Ce qu'il fait |
|---|---|
| **Accepte les piles** et **Quantité maximale** | Pour un chargeur : la quantité peut être un nombre ou une formule lue sur l'objet hôte, par exemple `capacite`. Le slot affiche alors son remplissage, « 12 / 15 ». |
| **Demander le remplacement** | Si le slot est occupé, on vous demande s'il faut remplacer ; l'objet sortant retourne d'où il venait. Décoché, le dépôt est refusé. |
| **Après le dépôt, proposer le bouton** | La clé d'un bouton de l'objet déposé. Juste après le dépôt, ce bouton est proposé. Exemple : un râtelier avec `recharger` : on y dépose une arme, « Utiliser « Recharger » ? » la charge. |
| **Texte quand vide** | Exemple : « Glisser une classe ». |
| **Taille** (px) | La taille de la case, carrée. |
| **Afficher le nom à droite de l'icône** | Pour un slot qui se lit comme une étiquette (une classe, un métier). |

## En jeu

- **Équiper** : glissez l'objet sur le slot.
- **Déséquiper** : clic droit → **Déséquiper**. L'objet retourne dans le contenant d'où il venait.
- **Ouvrir** l'objet : double-clic.

## Pour aller plus loin

Dans une formule, `carriedValue("degats", "main")` lit une valeur de l'objet rangé dans le slot `main`, et `slotted("main")` dit si le slot d'un objet est occupé. Voir [Les fonctions de formule](#fonctions).
