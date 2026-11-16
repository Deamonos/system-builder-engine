**À quoi ça sert :** décider qui joue quand, et garder le combat sous les yeux. L'initiative se lance toute seule, et le carrousel montre les portraits des combattants dans l'ordre.

**Exemple :** l'initiative est le champ `agilite` de la fiche, qui a son jet `1d20 + agilite`. Au clic sur **Commencer le combat**, tout le monde lance ; le carrousel s'affiche en haut de l'écran, le combattant actif en premier.

## L'initiative

Les **règles de combat** → **Initiative** :

- **Clé d'un champ** : un champ de la fiche. S'il a un jet, c'est ce jet qui part ; sinon sa valeur est le score. Ou une **formule** (`1d20 + agilite`). **Par modèle de personnage** : une ligne pour les créatures, les véhicules…
- **Lancer automatiquement au début du combat**, et pour un combattant ajouté ensuite.
- **Fenêtre de jet** : avantage, modificateur et visibilité, pour un combattant lancé seul à la main.
- **Égalités** : une formule de départage, puis au hasard, les joueurs d'abord ou les PNJ d'abord.
- **Au nouveau round** : le score reste, ou tout le monde relance.
- **Plusieurs tours par round** : à la fin d'une passe, chaque score baisse d'un **pas** ; ceux qui restent au-dessus du **minimum** rejouent dans le même round.

## Le carrousel de combat

Activez-le dans les **paramètres du système** (case **Carrousel de combat**), puis **Carrousel de combat** → **Configurer**.

- **Placement** : en haut (horizontal) ou à droite (vertical). Chaque joueur bascule avec le bouton ↕ / ↔ ; le MJ fixe la position par défaut. Le combattant actif est toujours le premier ; une marque « Round n » sépare ceux qui ont joué.
- **Boutons** : MJ (combat, tours, initiative) ; joueurs (**Finir mon tour**, **Lancer l'initiative**).

![Le carrousel en position verticale : Lys joue (halo), le squelette est le suivant, chacun avec son initiative et ses barres](img/carrousel.webp)

| Onglet | Ce qu'on y règle |
|---|---|
| **Affichage** | Taille, forme (carrée, portrait, ronde), image du jeton ou du personnage, nom, initiative, animations. **Mise en avant** : halo du combattant actif, languette « Suivant », ceux qui ont joué assombris, icône sur les vaincus. |
| **Barres et effets** | Deux barres au plus (clé ou formule, couleur, qui la voit, chiffres) ; les icônes des effets actifs. |
| **Info-bulle** | Au survol d'un portrait : en-tête, valeurs choisies, effets avec leur durée. |
| **Boutons** | Les boutons du MJ et des joueurs dans la barre du carrousel. |
| **Clics** | Clic = centrer la vue ; survol = surligner le jeton ; double-clic = la fiche. Clic droit du MJ : rendre actif, cacher, vaincu, ping, retirer. |
| **Visibilité** | Vaincus grisés ou retirés ; PNJ cachés jusqu'à leur premier tour ; initiative des PNJ montrée ou « ? ». **Règles** : quand `pv <= 0` ou un effet, masquer, marquer vaincu ou retirer du combat. |
| **Thème** | Celui de SBE, ou un thème propre (couleurs, arrondi, cadre). **Avancé** : CSS, SVG, emplacements d'images. |

## Pour aller plus loin

Les déclencheurs **début / fin de son tour** et **début / fin du combat** lancent des boutons tout seuls : voir [Les déclencheurs](#declencheurs).
