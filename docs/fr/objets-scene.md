**À quoi ça sert :** des objets qu'on pose sur la carte et avec lesquels on interagit. Un levier qui ouvre une herse, un terminal, une tourelle, un feu de camp, une tente, un tonneau qu'on peut briser.

**Exemple :** un levier. Modèle d'objet « Mécanisme » avec l'option **Objet de scène**, une case `actif`, et un bouton **Actionner** utilisable **une fois posé** : **Modifier un champ** `actif`, puis **Scène** → porte → **Basculer**. La herse est liée au levier.

## Rendre un objet posable

Sur le modèle d'objet, option **Objet de scène (peut être posé sur la carte)**, puis sa roue ⚙ : les valeurs **par défaut** de ses objets. Chaque objet du monde peut les changer dans son onglet **Scène** ; un champ vide garde la valeur du modèle.

| Réglage | Ce qu'il fait |
|---|---|
| **Taille une fois posé** | En cases, en pixels, ou la taille de l'image. |
| **Image une fois posé** | Vide = l'image de l'objet. **Image selon une clé** : une image par valeur (levier haut / bas, filon plein / épuisé). |
| **Orienter à la pose** | On le tourne avec la molette en le posant. |
| **Distance d'interaction** | En cases, bord à bord. 0 = sans limite. Le MJ n'est jamais limité. |
| **Un seul utilisateur à la fois** | Un autre joueur doit attendre. |
| **Qui le voit**, **Qui peut l'utiliser**, **Qui peut le reprendre** | Tout le monde, celui qui l'a posé, le MJ, personne. |
| **Points de vie** | Une clé de l'objet. À 0 : **détruit**, ou **tombe au sol**. |
| **Ignoré en combat et au ciblage** | Décoché, l'objet peut être attaqué : sa défense et ses résistances se lisent sur l'objet. |
| **Angle de tir** | Pour une tourelle : la cible doit être dans cet angle, devant l'objet. |
| **Seulement si** | Seuls les objets qui vérifient cette formule sont posables. |

## Poser et reprendre

- **Poser** : glisser l'objet de l'inventaire sur la carte, ou un bouton avec l'étape **Poser sur la scène**. L'objet devient un pion qui garde tout : ses valeurs, son état, le contenu de ses slots.
- **Reprendre** : dans son panneau, **Reprendre**. Il revient dans l'inventaire avec tout ce qu'il contient.

## Le panneau

Le **double-clic** sur l'objet posé ouvre son **panneau** : son image, son nom, et ses boutons **utilisables une fois posé**. Le personnage qui interagit en est l'utilisateur : ses jets, ce qu'on lui prend.

![Le panneau du levier de la démo : le bouton Actionner, et au pied les outils du MJ (liens de scène, reprendre, fiche, supprimer)](img/objet-scene-panneau.webp)

Pour un panneau sur mesure : onglet **Panneau une fois posé** de l'atelier. Composez-le avec les composants habituels ; **Composant du modèle** affiche un composant de la fiche avec sa valeur. Affichage en **fenêtre** ou en **bulle accrochée au pion**. Vide, un panneau automatique est utilisé.

## Les déclencheurs

Dans l'onglet **Scène** de l'objet du monde :

- **Double-clic : ouvre le panneau** (décoché, les joueurs ne l'ouvrent pas).
- **À l'approche** : quand un pion arrive à une **distance** donnée, en **s'y arrêtant**, **en passant**, ou les deux. Le panneau s'ouvre, ou un bouton se lance. **Fréquence** : à chaque fois, une fois par personnage, une seule fois. **Qui** : les personnages des joueurs, ou tous.
- **Objet glissé dessus** : un objet lâché depuis un inventaire lance un bouton ; l'objet glissé devient l'objet choisi des étapes (`pickedName`, `picked_clé`). Une formule filtre les objets acceptés. Une clé dans une serrure, une bûche dans le feu.

## Les liens de scène

Au pied du panneau, le MJ ouvre **Liens de scène** : les éléments que l'objet commande (portes, lumières, sons, tuiles, pions, dessins, régions). **Ajouter**, puis un clic sur l'élément. Un **groupe** permet de les viser séparément : « porte nord », « alarme ».

L'étape **Scène** de ses boutons agit sur eux : ouvrir, fermer, verrouiller une porte ; allumer une lumière ; montrer ou cacher ; téléporter ; ouvrir le panneau d'un autre objet posé. Voir [Toutes les étapes](#etapes-liste).

## Accrocher un objet à la carte

Un objet du monde peut aussi s'accrocher à un élément déjà dessiné :

- **Une tuile** : la tuile devient l'objet (double-clic, panneau, boutons). L'image selon une clé change l'image de la tuile.
- **Une porte** : un clic sur la porte ouvre le panneau de l'objet au lieu de l'ouvrir. Ce sont ses boutons qui l'ouvrent ou la ferment.
- **Une région** : l'objet est posé au centre ; un piège prend la forme de la région comme zone.

Glissez l'objet du monde dans l'encart **SBE — Objet interactif** de la configuration de la tuile, de la porte ou de la région. Ou glissez-le directement dessus : SBE demande s'il faut l'accrocher, l'installer, ou le poser au sol.

## Pour aller plus loin

Un objet de scène peut être un piège ou un marchand : voir [Les pièges](#pieges) et [Les marchands](#marchands).
