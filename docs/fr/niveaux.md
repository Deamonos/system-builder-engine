**À quoi ça sert :** faire monter vos personnages en niveau. Par l'expérience ou par des niveaux donnés, avec une fenêtre de passage où le joueur répartit ses points, et des règles qui donnent des objets, des effets ou des bonus à chaque niveau.

**Exemple :** un composant **Niveau**, clé `niveau`, montée **par l'expérience**, clé de l'expérience `xp`, seuils `100, 300, 600, 1000`. À 100 XP, le bouton **Passer au niveau 2** apparaît ; la fenêtre propose 3 points à répartir entre `force` et `agilite`.

## Le composant Niveau

Ajoutez-le dans l'atelier, comme les autres composants. Sa **clé** contient le niveau : un nombre, utilisable dans toutes les formules (`niveau * 5`).

![En-tête d'Elara dans la démo : le niveau 1 / 5, la jauge d'expérience 0 / 100, et le champ Expérience](img/niveau-fiche.webp)

| Réglage | Ce qu'il fait |
|---|---|
| **Niveau de départ** et **Niveau maximum** | Le maximum : vide = aucun ; un nombre ou une formule. |
| **Montée de niveau** | **Par l'expérience (seuils)** : un niveau devient disponible quand l'XP atteint le seuil. **Niveaux donnés** : pas d'XP, le niveau vient d'une quête, d'un bouton ou du MJ. |
| **Seuils d'expérience** | Une liste (`100, 300, 600` = niveaux 2, 3, 4…) ou une formule où `level` vaut le niveau actuel (`level * 1000`). |
| **Afficher « niveau / maximum »** et **Jauge** | Aucune, l'expérience vers le prochain seuil, ou le niveau vers le maximum. |
| **Bouton « Passer au niveau »** | Il apparaît sur la fiche quand un niveau est disponible. |
| **Qui passe le niveau** | Le joueur librement, le joueur avec validation du MJ, ou le MJ seulement. **MJ : niveau modifiable directement** : le MJ change le chiffre à la main. |

## La fenêtre de passage

Ce que vous posez **dans** le composant Niveau, dans l'atelier, n'apparaît pas sur la fiche : c'est le contenu de la fenêtre de passage (des choix, des explications…).

- **Points à répartir** (nombre ou formule ; `level` vaut le niveau atteint) et **Champs du budget** (`force:1, agilite:2` : +1 en force coûte 1 point, +1 en agilité en coûte 2).
- **Valider seulement quand tous les points sont dépensés**, et **Points restants vers la clé** (vide = perdus).
- **Écriture des choix** : **à Valider** (fermer ou annuler remet la fiche) ou **tout de suite**.
- **Revendre des points** : permettre de descendre un champ sous sa valeur d'ouverture.

## Les règles du niveau

Le bouton **Règles** du composant : des **règles de montée**, jouées au passage pour le niveau atteint, et des **règles de descente**.

- **Quand** : **au niveau** N, **tous les N niveaux** (à partir d'un niveau), ou **à chaque niveau**.
- **Actions** : une **valeur** (ajouter ou remplacer, nombre ou formule), un **effet** (appliquer ou retirer), un **objet** (donner ou retirer, glissé depuis le monde), un **bouton du modèle** à lancer.

**Exemple :** à chaque niveau, `pv_max` + `1d8` ; au niveau 3, donner l'objet « Attaque puissante ».

## Descendre et l'historique

- **Qui peut descendre d'un niveau** : personne, le MJ, le joueur avec validation, ou le joueur.
- **Défaire le dernier passage** : remet les valeurs d'avant et reprend les objets et effets donnés par les règles.
- **Historique des niveaux** : chaque passage, ce qui a été reçu ou retiré ; visible des joueurs si vous le cochez.

## Donner de l'expérience ou des niveaux

- L'étape **Expérience / Niveau** d'un bouton : de l'XP ou des niveaux (un nombre négatif en retire), au document du bouton, aux cibles, ou aux objets portés d'un modèle.
- Une **récompense de quête** : des niveaux. Voir [Le journal de quêtes](#quetes).
- **Niveaux reçus** : **disponibles à passer** (la fenêtre s'ouvre au clic) ou **passés tout de suite** (les règles de montée jouent, sans fenêtre).

## Pour aller plus loin

Un composant Niveau peut aussi être posé sur un **modèle d'objet** : une classe avec ses propres niveaux, une arme qui gagne en puissance. L'étape **Expérience / Niveau** vise alors les objets portés de ce modèle.
