**À quoi ça sert :** une lampe, des lunettes de vision nocturne, une caméra thermique. Un objet qui éclaire, ou qui change la vue de celui qui le porte, quand il est équipé et allumé.

**Exemple :** une lanterne. Sur le modèle, une case `allume` et un bouton **Allumer / Éteindre** (Modifier un champ `allume` = `allume ? 0 : 1`). Sur l'objet du monde, onglet **Médias**, **Cet objet émet de la lumière** ; onglet **Lumière** : quand il est équipé, seulement si `allume`, faible `6`, vive `3`. Équipée et allumée, elle éclaire autour du pion.

## L'onglet Lumière d'un objet

| Partie | Ce qu'on y règle |
|---|---|
| **Activation** | Quand il est **équipé** ou **porté** ; **Seulement si** une formule de l'objet (`allume`). |
| **Vue** | Cochée, elle **remplace** la vue du pion tant que l'objet est actif, puis la vue d'origine revient. Un **mode de vision**, une portée, un angle, une intensité, une teinte. Décochée, la vue de base reste (une lampe). |
| **Lumière** | Rayons faible et vive, angle, couleur, animation, réglages avancés ; **vue du seul porteur** pour des lunettes. |
| **Autonomie** | Une clé de l'objet baisse en temps de jeu tant qu'il éclaire (de l'huile, une batterie) ; à zéro : rien, une unité de la pile, ou il disparaît. |

Chaque champ accepte une formule lue sur l'objet. Plusieurs objets allumés : la dernière vue allumée compte ; pour la lumière, la plus forte. Un effet **Aveugle** passe devant tout.

## La vue de base de la fiche

Deux clés fixes : un champ `sight` donne la **portée de vue** du pion, `sight_angle` son **angle**. Bonus et effets comptent : un effet qui baisse `sight` réduit la vue. Tous les jetons du personnage suivent.

## Les modes de vision

Les **paramètres du système** → **Modes de vision** : les modes du monde (vision nocturne, thermique…), à renommer, régler, dupliquer, ou créer.

- **Rendu à l'écran** : teinte, **voir dans le noir** (non, oui, amplifié), luminosité, saturation (−1 = noir et blanc), contraste, grain, **halo de chaleur** sur les pions.
- **Perception** : **voit les invisibles**, **repère à travers les murs** (avec une portée), une **condition sur la cible** (repère seulement si, cache si), et ce qu'il repère en plus : personnages, objets posés, pièges.
- **Priorité** : plusieurs modes actifs, le plus prioritaire compte.

![Le mode Vision nocturne : voir dans le noir, le rendu à l'écran et ce que le mode repère](img/modes-vision.webp)

**Vision thermique** : un pion n'a pas de halo s'il porte un effet « Masqué en vision thermique », ou si le MJ l'a marqué avec le thermomètre de l'en-tête de sa fiche.

## Les lumières animées

Six animations sont ajoutées à toutes les lumières de Foundry : balayage d'écran, alerte, grain de vision nocturne, radar, néon défaillant, court-circuit.

## Pour aller plus loin

La scène doit avoir la **vision des jetons** activée, sinon aucune vue ne s'affiche. Un effet peut aussi porter une lumière ou rendre aveugle : voir [L'apparence des effets](#effets-apparence).
