**À quoi ça sert :** un arbre de talents, de compétences ou de recherches. Des nœuds reliés entre eux, qu'on débloque avec des points, et qui donnent des bonus, des objets ou des effets.

**Exemple :** un arbre « Guerrier ». Le nœud **Endurance** (3 rangs, coût `rank`, points pris dans `points_talent`) donne `pv_max` + `rank * 5`. Son enfant **Second souffle** demande Endurance et donne l'objet « Second souffle ».

## Le composant Arbre

Ajoutez un composant **Arbre** dans l'atelier, puis **Éditer l'arbre** sous le composant.

**Affichage sur la fiche** : **dans la fiche** (avec la **hauteur de la zone** ; l'arbre défile s'il est plus grand) ou **un bouton qui ouvre une fenêtre**.

## L'éditeur d'arbre

- **Double-clic** sur le fond : un nouveau nœud. **Tirer le point d'un nœud** jusqu'à un autre : un lien, du parent vers l'enfant. **Glisser le fond** : déplacer la vue. **Suppr** efface la sélection.
- **Ctrl + molette** pour zoomer ; **Aimanter à la grille**.
- Un clic sur un nœud ou un lien le règle. Un lien qui ferait une boucle est refusé.

## Un nœud

| Partie | Ce qu'on y règle |
|---|---|
| **Le nœud** | Nom, icône, description ; **nombre de rangs** (plus d'un : il se débloque en plusieurs fois, 1/3, 2/3, 3/3). |
| **Règles** | **Coût d'un rang** (vide = 1 ; `rank` vaut le rang acheté : `rank * 2` coûte 2, puis 4, puis 6). **Parents requis** : tous, ou au moins un. **Condition** : une formule de la fiche. **Groupe exclusif** : en débloquer un ferme les autres. |
| **Récompenses** | **Bonus de valeurs** (ajouter, multiplier, au moins, au plus, remplacer ; `rank * 2`), comptés tant que le nœud est débloqué. **Objets donnés**, **effets posés**, un **bouton lancé** à chaque rang. |
| **Apparence** | Forme (rond, carré, losange, hexagone) et taille. |

## Les règles de l'arbre

- **Clé des points** : la clé de la fiche où les points sont pris (vide = gratuit). Pour un arbre posé sur un objet : la fiche de son porteur.
- **Qui débloque** : le joueur librement, le joueur avec validation du MJ (une carte Accepter / Refuser), ou le MJ seulement.
- **Reprise des nœuds** : interdite, nœud par nœud, tout l'arbre, ou les deux ; **qui reprend** et la **part des points rendus**. Un nœud dont dépend un autre ne se reprend pas. **Objets et effets à la reprise** : retirés ou gardés.

## L'apparence de l'arbre

Liens **droits**, **coudés** ou **courbes**, leur épaisseur, une animation sur les liens débloqués (flux, lueur), une image de fond, et une couleur par état : verrouillé, disponible, débloqué, rang maximum, en attente.

## Sur la fiche

![L'arbre de talents d'Elara : un clic sur « Robuste » montre ce qu'il donne (pv_max + 5), son coût et le bouton Débloquer](img/talents.webp)

Chaque nœud montre son état. Un clic l'ouvre : ses prérequis, son coût, ce qu'il donne, et **Débloquer** (ou **Passer au rang N**). Un bouton grisé dit pourquoi : pas assez de points, parents manquants, groupe déjà pris. L'**historique** garde chaque déblocage.

## Pour aller plus loin

Les bonus d'un nœud apparaissent au survol de la valeur, au nom du nœud, comme ceux des effets. Les points se gagnent souvent avec les niveaux : une règle de montée qui ajoute 1 à `points_talent`. Voir [Les niveaux](#niveaux).
