**À quoi ça sert :** qu'un effet se voie et s'entende. Un pion teinté de vert quand il est empoisonné, une aura de flammes, une torche qui éclaire, des lunettes qui font voir dans le noir.

Tout se règle dans le gestionnaire d'effets, bloc **Apparence et son**. Tout est facultatif.

## Son

Joué **à la pose**, ou **en boucle tant que l'effet dure**. Mêmes règles que les médias d'objets : qui entend, portée en unités de scène, atténuation.

## Sur le pion

| Réglage | Ce qu'il fait |
|---|---|
| **Teinte** | Colore le pion, à l'affichage seulement. |
| **Grande icône** | L'icône de l'effet en grand, au centre du pion. |
| **Discret** | L'icône n'est vue que du MJ et du propriétaire. |
| **Animation sur le pion** | Une image ou une vidéo qui suit le pion en boucle tant que l'effet dure (aura, brouillard…). Discret, seuls le MJ et le propriétaire la voient. |

Un effet cumulé affiche **×N** sur le pion.

## Lumière portée par le pion

Écrite sur le jeton tant que l'effet dure ; la lumière d'origine revient ensuite. Si plusieurs effets éclairent, le plus fort gagne.

- **Faible** et **Vive** (les rayons), **Couleur**, **Intensité**, **Angle**.
- **Animation** de la lumière, avec **Vitesse**, **Force** et **Animation inversée**.
- **Personnelle (vue du seul porteur)** : seul celui qui regarde à travers le pion la voit.
- **Réglages avancés** : atténuation, luminosité, saturation, contraste, ombres, technique de coloration. Vides, ce sont les valeurs habituelles de Foundry.

## Donner un mode de vision

**Donne un mode de vision** : tant que l'effet dure, le porteur voit avec ce mode (vision dans le noir, thermique…). Les modes se créent dans le gestionnaire **Modes de vision**.

- **Portée** et **Angle** : vides, ce sont ceux du pion.
- Plusieurs modes à la fois : la priorité du mode décide.

## Une valeur par objet : « @clé »

Chaque champ accepte un nombre, une formule lue sur la fiche du porteur, ou **`@clé`** lue sur l'objet qui donne l'effet.

**Exemple :** un seul effet « Éclairé » pour toutes les lampes. Sa lumière vive vaut `@portee_lumiere` : la lanterne a `12` dans ce champ, la bougie `3`. Chaque objet éclaire à sa façon avec le même effet.

## Agit comme le statut Foundry

Dans le bloc **Combat** du gestionnaire, **Agit comme le statut Foundry** : le cœur de Foundry traite aussi le porteur comme ayant ce statut (aveugle, invisible, à terre, en vol…). Les modules qui lisent ces statuts le reconnaissent aussi.

**Exemple :** « Dissimulé » de la démo agit comme « Invisible », et ajoute `+5` en discrétion.

> Les conditions de base de Foundry le font déjà d'elles-mêmes. Ce réglage sert à vos propres effets (fumée, flash…).

## Pour aller plus loin

Pour une lampe, une torche ou des lunettes, il y a plus simple : sur l'objet du monde, onglet **Médias**, cochez **Cet objet émet de la lumière**. Un onglet **Lumière** apparaît, avec la lumière, la vue et l'autonomie de l'objet.
