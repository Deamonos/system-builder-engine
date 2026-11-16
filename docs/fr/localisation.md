**À quoi ça sert :** savoir où frappe un coup (la tête, un bras, une aile) et en tirer les conséquences : des dégâts multipliés, l'armure d'une seule zone, des PV par membre, un coup visé.

**Exemple :** un corps **Humanoïde**. La tête est touchée sur 1 à 2 au d20, avec dégâts ×2 et la protection `casque`. Un joueur vise la tête : −4 à son jet. Touché, la carte montre la silhouette avec la tête en couleur.

## Les corps

Les **paramètres du système** → **Corps (localisation des coups)** → **Corps**. **Nouveau corps** part d'un corps vide ou d'un corps de départ (**Humanoïde**, **Quadrupède**), à modifier librement.

![Le corps Humanoïde : les modèles concernés, les zones avec leurs plages et leur multiplicateur, et le dessin](img/corps.webp)

| Réglage | Ce qu'il fait |
|---|---|
| **Modèles concernés** | Les modèles de personnage qui ont ce corps. Un corps sans modèle sert à tous les autres. |
| **Cadre** et **image de fond** | En hauteur, en largeur ou carré ; l'image est facultative. |
| **Chances** | **Selon les plages** (« De » et « À » : la valeur tirée donne la zone) ou **selon la surface dessinée** (plus une zone est grande, plus elle est touchée). |

**Par zone** (vide = la règle normale) :

- **Clé de dégâts** : le champ qui encaisse quand la zone est touchée (`pv_tete` pour des PV par membre).
- **Protection en plus** : une clé de la cible, retirée en plus de la protection du type de dégâts.
- **Multiplicateur** (formule, ×1 par défaut) et **Modificateur de touche** (ajouté au jet d'attaque : `-4` = plus dur).

**Le dessin** : les mêmes outils que les gabarits (Polygone, Ellipse, Rectangle, Sélection). La pastille d'une zone choisit celle qui reçoit les nouveaux morceaux.

## Dans le profil d'attaque

Section **Localisation** du profil (ou du volet Avancé de l'arme) :

- **Zone touchée** : aucune ; un **jet à part** (`1d20`) ; ou **lue sur le jet d'attaque** (`natural` = les dés seuls : `reverse(natural)` lit 34 comme 43). Formule vide = un tirage sur les plages du corps.
- **Coup visé** : après le clic sur la cible, sa silhouette s'affiche ; on clique la zone visée, ou **Pas de visée**.
- **Attaques de zone** : une zone au hasard par cible, **tout le corps**, **plusieurs au hasard**, ou aucune ; les dégâts entiers sur chaque zone, ou partagés.

## Après le coup

`hitZone` vaut le nom de la zone en minuscules, sans accent, avec `_` (« Bras droit » → `bras_droit`). Exemple : étape **Effet** « Sonné » sur les cibles, seulement si `hitZone == "tete"`.

## Pour aller plus loin

Les corps s'exportent et s'importent comme les gabarits. Les modèles d'un autre monde ne sont pas repris.
