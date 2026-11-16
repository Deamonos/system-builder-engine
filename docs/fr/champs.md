**À quoi ça sert :** les composants où l'on **saisit** une valeur : un nom, un nombre, une case, un choix, une couleur, une image. Ce sont les briques de base de toutes les fiches.

Ils se créent tous de la même façon : **+** dans l'atelier, puis le **Type** voulu. Les réglages communs (clé, libellé, visibilité…) sont expliqués dans [Construire un modèle](#atelier) ; cette page ne détaille que ce qui est propre à chaque type.

## Texte court

Une ligne de texte : un métier, une origine, une note.

**Exemple :** clé `metier`, libellé « Métier ».

- **Valeur par défaut** : le texte de départ des nouvelles fiches.
- **Largeur du champ** (px) : vide, le champ prend toute la place.

## Texte riche

Un texte mis en forme (gras, listes, titres…), rédigé sur **chaque fiche ou objet**, pas dans le modèle.

- **Fond** : aucun (le thème de la fiche) ou **papier ligné**, avec ses lignes et sa marge rouge, comme un bloc-notes.
- **Éditeur** : **bouton pour écrire** (on lit d'abord, un clic ouvre l'édition) ou **toujours ouvert** (barre d'outils visible, le texte s'enregistre quand on clique ailleurs).
- **Hauteur minimale** (px).

## Nombre

Toute valeur chiffrée : une caractéristique, une compétence, un niveau, des charges.

**Exemple :** clé `force`, minimum `0`, maximum `100`, valeur par défaut `50`.

![Des nombres sur une fiche, avec leur icône de libellé et le dé du jet au clic](img/champs-nombres.webp)

| Réglage | Ce qu'il fait |
|---|---|
| **Nombre entier** | Décoché, choisissez les **décimales affichées**. |
| **Minimum / Maximum** | La valeur est toujours ramenée dans ces bornes, même si on tape plus. |
| **Maximum par formule** | Un maximum calculé, par exemple `10 + niveau`. Il remplace le maximum saisi. |
| **Afficher « valeur / max »** | Le maximum s'affiche à côté du champ : `3 / 10`. Pratique pour des charges, sans jauge. |
| **Mode calculé** | La valeur vient d'une **formule** et ne se saisit plus. Exemple : `force + force_bonus`. |
| **Formule de bonus (2 en 1)** | La valeur reste saisie à la main **et** la formule ajoute un bonus par-dessus. Le champ affiche le total. Exemple : `floor(agilite / 10)`. |

### Le nombre « 2 en 1 »

Avec une formule de bonus, le champ montre le **total**, et son info-bulle détaille d'où il vient : la base saisie, puis une ligne par objet porté qui apporte quelque chose (« +2 Épée courte »), puis le reste du bonus.

**Couleur de la valeur** :

- **Part des objets portés** (par défaut) : la valeur passe en vert ou en rouge seulement quand l'équipement, la classe ou les compétences changent la valeur. La part fixe de la formule (un attribut, par exemple) reste neutre.
- **Tout le bonus** : toute la formule colore la valeur.
- **Aucune**.

## Case à cocher

Un oui / non : « Blessé », « Identifié », « Allumé ».

- **Cochée par défaut**.
- Dans une formule, elle vaut `true` ou `false` : `blesse ? 2 : 0`.

## Liste déroulante

Un choix parmi des valeurs fixes.

**Exemple :** clé `taille`, choix `Petite`, `Moyenne`, `Grande` (un par ligne).

- **Choix de la liste** : un par ligne, dans l'ordre d'affichage.
- **Valeur par défaut** : vide, c'est le premier choix.
- Dans une formule, elle vaut le **texte** choisi : `taille == "Grande"`.

**Couleurs des choix** (facultatif) : donnez une couleur à un choix. Elle le suit partout : dans la liste, dans les étiquettes, dans l'info-bulle de l'objet. Exemple : Rareté, avec Rare en bleu et Unique en or.

**Étiquette colorée en tête de l'info-bulle** (modèles d'objets) : la valeur s'affiche en premier dans l'info-bulle de l'objet, écrite dans sa couleur (« RARE » en bleu). Une seule liste par modèle, en général la rareté.

## Couleur

Une couleur choisie au nuancier : la teinte d'une vision, la couleur d'une lumière, celle d'une équipe.

**Exemple :** clé `teinte`, couleur par défaut `#33ff66`.

- La valeur est un texte `#rrggbb`, lisible dans une formule et par les réglages de lumière.
- Le **blanc** veut dire « pas de teinte » pour une vision ou une lumière.
- Dans l'info-bulle d'un objet, elle s'affiche en pastille.

## Image

Une image fixe, ou un choix d'images proposé au joueur.

**Exemple :** clé `blason`, avec trois images au choix : le joueur clique sur la sienne.

- **Taille** (L × H, px) : vide, automatique.
- **Image par défaut**.
- **Images au choix** : chacune avec un nom affiché et/ou une icône, et la **position des boutons** de choix.

**Pour aller plus loin :** la valeur enregistrée est le chemin de l'image. La clé peut donc resservir ailleurs, par exemple comme fond d'un cadre : `{{blason}}`.

## Pour aller plus loin : les sous-clés

Si une clé `force_min` ou `force_max` existe, sa valeur **s'ajoute** à la borne correspondante de `force` : avec `force_max` = 20, le maximum passe de 100 à 120. Un effet ou un objet peut ainsi repousser une limite sans toucher au modèle.

Dans une formule, `maxOf("charges")` lit le maximum effectif d'un nombre ou d'une jauge.
