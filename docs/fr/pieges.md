**À quoi ça sert :** des pièges posés sur la carte. Une mine, une fosse, un fil tendu, une rune qui explose. Ils se cachent, se repèrent, s'esquivent, se désamorcent et se récupèrent.

**Exemple :** une mine. Un objet de scène, cochée **C'est un piège** : forme **Rayon autour**, `1` case, **Caché**, jet de détection `perception`, jet d'esquive `agilite`. **Bouton de l'effet** : **Exploser**, une attaque en cercle de 2 cases **sur le piège**. **Après** : **Disparaît**.

## Où le régler

Un piège est un [objet de scène](#objets-scene). Dans l'onglet **Scène** de l'objet du monde (ou la roue ⚙ du modèle), cochez **C'est un piège**. Tout se règle là ; celui qui le pose n'a plus qu'à le poser, l'orienter et placer sa zone.

## Zone de déclenchement

| Réglage | Ce qu'il fait |
|---|---|
| **Forme** | **La place de l'objet**, un **rayon autour**, un **rectangle**, ou un **cercle / cône** tourné vers l'avant de l'objet. |
| **Le poseur la place** | La zone suit la souris (molette = tourner), un clic la pose. |
| **Le poseur règle sa taille** | Un rectangle se dessine en deux clics ; un cercle ou un cône demande son rayon et son angle. |

## Déclenchement

- **Se déclenche** : quand un pion **s'y arrête**, **y passe**, ou les deux.
- **Qui** : les personnages des joueurs, ou tous.
- **Épargne les alliés** : ceux de même disposition que le poseur.
- **En combat seulement**.

## Caché et détection

- **Caché** : seuls le MJ, celui qui l'a posé, et les joueurs dont le personnage l'a repéré le voient. Celui qui l'a posé ne le déclenche jamais.
- **Jet de détection** : une clé à jet du personnage qui passe à moins de **Distance** cases, avec une **Difficulté** lue sur le piège.
- **Dernière chance** : pas encore repéré, un dernier jet en entrant ; réussi, le personnage recule.
- **Repéré = évité** : un personnage qui l'a repéré passe sans le déclencher.

## Esquive et recul

- **Jet d'esquive** du personnage qui le déclenche, sa **Difficulté**, **Seulement si repéré**, **Esquivable si** une formule.
- **Si esquivé** : **il recule** (à la case d'avant, au début du déplacement, ou il s'arrête sur place), ou **un autre bouton**.

## Effet et après

- **Bouton de l'effet** : un bouton « une fois posé » de l'objet. Sa cible est le personnage qui l'a déclenché : attaque, zone, effet…
- **Centre de l'effet** : **sur le piège** (une mine, une fosse) ou **sur la victime**.
- **Après** : **Disparaît**, garde des **Charges**, **Se réarme seul**, ou **Désarmé** (à réarmer).
- **Révélé à** : la distance à laquelle il devient visible après s'être déclenché ; 0 = seulement au déclencheur.

## Manipulation

- **Jet pour désamorcer** et sa difficulté. Désamorcé, il est inoffensif, visible de tous, et peut être récupéré.
- Les boutons de l'objet agissent sur lui avec l'étape **Scène → Piège** : **Désamorcer**, **Récupérer**, **Récupérer le contenu** (le piège est détruit), **Réarmer**, **Recamoufler**.
- Le MJ choisit **qui le voit encore** : les personnages qui savent où il est le voient et l'évitent.

## Voir les zones

L'outil **Zones des pièges** de la barre des jetons montre leurs zones au MJ : déclenchement en jaune, effet en rouge.

## Pour aller plus loin

Un piège peut aussi prendre la forme d'une **région** de Foundry : accrochez l'objet du monde à la région, sa forme devient la zone de déclenchement. Voir [Les objets de scène](#objets-scene).
