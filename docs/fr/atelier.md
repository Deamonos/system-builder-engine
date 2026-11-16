**À quoi ça sert :** construire vos fiches à la souris. Ce que vous voyez dans l'atelier, **c'est la fiche finale** : pas d'aperçu à part, pas de mode « code ».

L'atelier, c'est la fenêtre d'un **modèle** : un modèle de personnage (onglet Acteurs) ou un modèle d'objet (onglet Objets). Les deux s'utilisent de la même façon.

![L'atelier d'un modèle de personnage](img/atelier-modele.webp)

## Ajouter un composant

Cliquez sur un **+**. Il y en a un en haut et un en bas de chaque zone : la page, un cadre, une colonne, un onglet. Le composant s'ajoute **à cet endroit précis**.

La fenêtre du composant a trois onglets :

| Onglet | Ce qu'on y règle |
|---|---|
| **Base** | Ce que c'est : type, clé, libellé, valeur par défaut, qui le voit, qui le modifie |
| **Style** | À quoi ça ressemble : position du libellé, police, tailles, fond, bordure |
| **Info-bulle** | Le texte qui s'affiche au survol sur la fiche |

Les réglages de la partie Base qu'on retrouve partout :

- **Visible par les joueurs** : décoché, seul le MJ voit le composant.
- **Modifiable par le joueur** : décoché, le joueur le voit mais ne peut pas le changer.
- **Masqué sur la fiche** : le composant existe (on peut s'en servir dans une formule) mais ne s'affiche pour personne, même pas le MJ.
- **Visible si (condition)** : une formule ; le composant n'apparaît que si elle est vraie. Exemple : `poison > 0`.

## Modifier, déplacer, supprimer

Survolez un composant : sa **clé** et trois outils apparaissent.

- ⠿ **glisser** : déplacez le composant, y compris dans un cadre, une colonne ou un autre onglet.
- ✏ **modifier** : rouvre sa fenêtre.
- 🗑 **supprimer** : jamais bloqué. Si d'autres réglages utilisent sa clé, on vous dit lesquels avant.

> Les flèches ↶ ↷ de l'en-tête annulent et rétablissent les changements de l'atelier (**Ctrl+Z**, **Ctrl+Y** ou **Ctrl+Maj+Z**).

## La clé

Chaque composant a une **clé** : son nom pour les formules, les effets, les jets et tous les outils.

- Elle commence par une **minuscule**, puis ne contient que des minuscules sans accent, des chiffres ou `_`.
- Pas de majuscule, d'accent, de tiret ni d'espace : `force`, `force_bonus` et `taille_chargeur` sont valides ; `Force`, `forcé` et `taille-chargeur` ne le sont pas.
- Elle est **unique dans le modèle**.
- Vous pouvez la changer à tout moment : SBE la renomme partout où elle sert. Voir [Vérifier et renommer une clé](#verifier).

## Le nom et le portrait

Un modèle de personnage a deux composants **natifs** : le **portrait** et le **nom**. Ils n'ont pas de clé : ils montrent directement l'image et le nom de la fiche.

- Glissez-les où vous voulez dans la page.
- La 🗑 les renvoie dans l'en-tête : ils ne se suppriment pas.
- Le nom peut avoir un **sous-libellé**, un petit texte dessous (exemple : « Identité »).

## Le menu ⋮ de l'atelier

En haut à droite de la fenêtre, le menu ⋮ regroupe les outils du modèle :

- **Vérifier le modèle** : cherche ce qui ne marche pas. Voir [Vérifier et renommer une clé](#verifier).

Pour un modèle de **personnage** :

- **Thème du modèle** : couleurs, polices, taille de la fiche à l'ouverture, sons de la fiche.
- **HUD du modèle** : ce qui s'affiche autour du jeton.
- **En faire un modèle de boutique** : ce modèle servira aux marchands.

Pour un modèle d'**objet** :

- **Fiche des objets (titre, sons)** : le titre de la fenêtre des objets et leurs sons.

## Exporter et importer

En haut de l'atelier :

- **Exporter la structure** enregistre le modèle dans un fichier `.json`.
- **Importer une structure** charge un fichier exporté, depuis ce monde ou un autre.

Pratique pour partager un modèle, ou pour le garder avant de tout changer.

## Pour aller plus loin

- L'atelier **défile en entier**, même les cadres « épinglés » qui, eux, restent fixes sur la fiche.
- La **taille des fiches à l'ouverture** se règle dans le thème du modèle.
- Les objets ont en plus leurs **onglets** et leurs **options** : voir [Onglets et options d'un modèle d'objet](#onglets-options).
