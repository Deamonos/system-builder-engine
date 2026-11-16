**À quoi ça sert :** les réglages qu'on retrouve sur **tous** les composants : qui les voit, qui les modifie, à quoi ils ressemblent, ce qu'ils disent au survol.

## Onglet Base : qui voit, qui modifie

| Réglage | Ce qu'il fait |
|---|---|
| **Libellé affiché** | Le texte devant le composant. Vide, la clé sert de libellé. |
| **Icône du libellé** | Une icône Font Awesome, un émoji ou une image, choisie dans le sélecteur (recherche en français ou en anglais). |
| **Visible par les joueurs** | Décoché, les joueurs ne voient pas le composant ; le MJ le voit avec un **œil barré**. C'est hiérarchique : un cadre masqué masque tout son contenu. |
| **Modifiable par le joueur** | Décoché, le joueur voit la valeur mais ne peut pas la changer. |
| **Masqué sur la fiche** | Jamais affiché, même au MJ, mais la clé reste utilisable dans les formules. Idéal pour une clé de calcul comme `force_bonus`. |
| **Visible si (condition)** | Le composant ne s'affiche que si la formule est vraie. Exemple : `poison > 0`. |
| **Propager aux objets existants** | Modèles d'objets seulement, coché par défaut. Quand la valeur change sur un objet du monde, SBE propose de la reporter sur ses exemplaires. Décochez pour une valeur propre à chaque exemplaire (usure, état). Voir [Les idées de base](#idees). |

## Onglet Style : à quoi ça ressemble

Tout est facultatif : ce que vous ne réglez pas garde le style du thème.

- **Libellé** : couleur, taille, police, gras, italique, majuscules, et **position** (à gauche, à droite, au-dessus, en dessous ; aligné à gauche, au centre ou à droite).
- **Valeur** : couleur, taille, gras, italique.
- **Composant** : couleur de fond, **texture de fond**, **fond transparent**, couleur et épaisseur de la bordure, **coins** (par défaut, angles droits, arrondis légers ou accentués).
- Puis les réglages propres au type : le bandeau d'un cadre, les couleurs d'une jauge, la toile d'un graphique…

**Pour aller plus loin :** **Activer le CSS avancé** ouvre un champ pour écrire vos propres déclarations CSS, appliquées à ce composant seulement. Écrivez-y des déclarations sans sélecteur, par exemple `letter-spacing: 2px;`. Pour styliser toute la fiche, passez par le **Thème du modèle** (menu ⋮ de l'atelier).

## Onglet Info-bulle : ce qu'il dit au survol

Cochez **Activer l'info-bulle au survol**, puis :

- **Contenu** : votre texte, avec `{{clé}}` pour afficher une valeur et `{{= formule}}` pour un calcul.
  Exemple : `Charge : {{poids}} / {{= maxOf("poids")}}`.
- **Afficher la formule** (champ calculé) : la formule s'affiche sous le texte.
- **Afficher les apports de la clé** : le détail de ce qui modifie la valeur, une ligne par source, en vert pour un bonus et en rouge pour un malus. Ça comprend les sous-clés (`_bonus`, `_min`, `_max`…), les objets portés et chaque **effet** posé sur la clé, avec son icône et son montant.
- **Afficher la base** (nombre « 2 en 1 ») : la valeur saisie, avant les bonus.
- **Couleur du texte**.

> L'info-bulle d'un composant est la même partout : sur la fiche, dans le HUD du pion, dans le panneau d'un objet posé.
