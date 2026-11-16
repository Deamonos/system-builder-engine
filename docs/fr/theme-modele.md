**À quoi ça sert :** une fiche qui a son propre style. Une feuille de papier jauni pour le carnet d'un explorateur, un écran de terminal pour un robot, sans changer le reste des fenêtres.

## Ouvrir le thème d'un modèle

Dans l'atelier d'un modèle de personnage : menu **⋮** → **Thème du modèle**.

**Utiliser le thème général sur ce modèle** : coché, la fiche part du thème du système et applique vos retouches. Décoché, elle part de l'apparence de base de Foundry : le modèle est indépendant de tout le reste.

## Les réglages

| Réglage | Ce qu'il fait |
|---|---|
| **Couleurs** (sombre / clair) | La palette des fiches de ce modèle. |
| **Mode de la fiche** | **Suivre Foundry**, **Toujours clair** ou **Toujours sombre**. Une fiche au style propre (papier, écran) garde ainsi le même aspect pour tout le monde. |
| **Barre de titre** | Visible, ou **cadre masqué** : la fiche monte jusqu'en haut, les boutons flottent par-dessus, la fenêtre reste déplaçable. |
| **Masquer le titre des fiches** | Le titre et son icône disparaissent ; les boutons restent. |
| **Taille des fiches à l'ouverture** | Largeur × hauteur en pixels. Vide = automatique. La fenêtre reste redimensionnable. |
| **Habillage** | Une texture de fond (mosaïque ou étirée) et une image d'en-tête avec fondu. |
| **Décorations SVG** | Des images posées sur la fenêtre : un code SVG collé ou un fichier, un **ancrage** (haut gauche, centre…), un **décalage**, une **taille**, un **calque** (au-dessus ou sous le contenu), une **opacité**. Un décalage négatif fait déborder : un blason qui dépasse au-dessus de la fiche. |
| **CSS avancé** | `@modele` désigne les fenêtres de ce modèle : `@modele .window-content { … }`. |

**Aperçu à l'écran**, **Enregistrer**, **Réinitialiser** ; **Exporter** et **Importer** passent le thème d'un modèle à l'autre.

## Les sons de la fiche

En bas de la même fenêtre, bloc **Sons de la fiche** : un son à l'**ouverture** et à la **fermeture** de la fiche. Ils marchent même si le modèle utilise le thème général. Et sur chaque onglet d'une **Barre de navigation** (onglet **Média** de sa fenêtre), un **son au clic** : un bruit de sac pour l'onglet Inventaire.

Seul celui qui ouvre ou clique entend le son, sur le canal **Interface** de Foundry.

## Les modèles d'objets

Un modèle d'objet n'a que le titre et les sons : menu **⋮** de l'atelier → **Fiche des objets (titre, sons)**.

## Pour aller plus loin

Le style d'un seul composant (couleur, police, bordure, texture) se règle dans son onglet **Style**. Voir [Réglages communs, style et info-bulle](#reglages-communs).
