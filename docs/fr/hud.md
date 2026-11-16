**À quoi ça sert :** une barre à l'écran pour jouer sans ouvrir la fiche. Lancer un jet, frapper avec l'arme en main, boire une potion, lancer un sort rangé dans un menu.

**Exemple :** un menu **Sorts** dans lequel on dépose la liste « Grimoire », rangée par « École ». Chaque école devient un sous-menu, à la couleur de son choix : Sorts › Feu › Boule de feu. Un nouveau sort de feu se range tout seul.

## Où le régler

Un HUD **par modèle de personnage** : un modèle « Aventurier » et un modèle « Bête » ont chacun le leur. Menu ⋮ de l'atelier du modèle → **HUD du modèle**, ou les **paramètres du système** → **HUD**. Il voyage avec l'export du modèle.

Le joueur voit le HUD du personnage qu'il contrôle (pion sélectionné), sinon celui de son personnage.

![Le HUD d'Elara dans la démo : Sorts › Feu › Boule de feu, les valeurs Points de vie et Mana dans la barre](img/hud.webp)

## L'onglet Configuration

À gauche, les **sources** du modèle ; à droite, l'**arbre** du HUD. Glissez une source dans l'arbre (double-clic : à la fin). Déposée sur le haut ou le bas d'une ligne, elle se place avant ou après ; sur son milieu, elle entre **dans** le menu.

| Source | Dans le HUD |
|---|---|
| **Menu** | Un bouton qui ouvre un panneau ; un menu peut contenir des sous-menus. |
| **Séparateur** | Un trait entre deux groupes. |
| **Valeur** | Le libellé et la valeur (« 22 / 30 »). Si le champ a un jet, le clic le lance. |
| **Bouton de la fiche** | Le même bouton que sur la fiche, grisé avec sa raison quand il est impossible. |
| **Slot** | L'objet logé ; son clic ouvre ses actions, le clic droit sa fiche. |
| **Liste** | Chaque objet d'une liste. **Étiquettes** : ne garder que ceux-là. **Ranger en sous-menus par** : un sous-menu par valeur d'un champ. |
| **Objet du monde** | Glissé depuis la barre latérale : l'exemplaire que porte le personnage. |

**Réglages** : ouverture des menus au survol ou au clic ; slot vide caché ou grisé ; un objet à une seule action la lance d'un clic. Le crayon d'une entrée règle son libellé, son icône, la couleur de son liseré et **Visible des joueurs**.

**Petits boutons** (à côté du cadenas) : l'**action d'un objet équipé** (exemple `allumer` : il n'apparaît que si un objet équipé a ce bouton ; **Enfoncé si** `allume`) ou un **bouton de la fiche**.

## L'onglet Apparence

- **Thème** : une version sombre et une claire, qui suivent Foundry. Chaque couleur a son opacité : sous 100 %, la carte se voit floutée derrière.
- **Disposition** : sens de la barre, **position de départ**, icône et/ou libellé, tailles, espacement, arrondi, largeur des menus. **En-tête** : portrait et nom du personnage, en haut, en bas ou sur le côté ; c'est la poignée pour déplacer le HUD.
- **Décorations SVG** et **CSS libre** (`@hud`).

**Aperçu** en bas du manager, avec un personnage de ce modèle ou sans ; **Aperçu à l'écran** essaie les réglages sur le vrai HUD.

## Pour le joueur

La poignée déplace le HUD (sa place est gardée), le cadenas la verrouille, l'icône de fiche l'ouvre. **Masquer la barre de macros** et **Réinitialiser la position** sont des réglages de chaque joueur.

## Pour aller plus loin

Une valeur affichée sous un objet du HUD (munitions, charges) : cochez **Montrer dans le HUD** sur le champ du modèle d'objet. Voir [Les objets du monde](#objets-monde).
