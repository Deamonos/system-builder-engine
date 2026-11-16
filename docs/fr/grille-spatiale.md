**À quoi ça sert :** un inventaire où la place compte vraiment. Chaque objet occupe sa forme en cases — une épée sur 1 × 3, une armure sur 2 × 3, une potion sur 1 × 1 — et il faut l'arranger pour tout faire tenir.

**Exemple :**

1. Dans l'atelier, un conteneur `sac` → **Type d'affichage** « Grille spatiale », **Colonnes** `10`, **Lignes** `6`.
2. Sur l'objet du monde « Épée courte », onglet **Médias**, bloc **Grille spatiale** : **Largeur** `1`, **Hauteur** `3`, et une image dessinée en hauteur.
3. Sur la fiche, l'épée occupe 1 × 3 cases ; glissez-la où elle tient.

> La démo Brumeval en montre une : le sac à dos des héros.

![Le sac à dos de Lys en grille spatiale : un arc sur 1 × 4, une pile de 20 flèches, des outils de crochetage](img/inventaire-sac.webp)

## Les réglages du conteneur (atelier)

- **Colonnes × lignes** : la taille de la grille (10 × 6 si rien n'est saisi).
- **Taille des cases** (px).
- Une seule grille : pas de catégories en grille spatiale.

Les coffres posés sur la scène ont la même option.

## Les réglages de l'objet (objet du monde, onglet Médias)

- **Largeur** et **Hauteur** en cases (1 × 1 par défaut, 20 au plus). Tous les exemplaires suivent leur objet du monde.
- **Image dans la grille** : une image dessinée pour cette forme. Vide, c'est l'icône de l'objet.
- **Image** : **entière** (sans déformation) ou **étirée** (elle remplit le rectangle). Un petit aperçu montre le rendu.

## En jeu

- **Glisser** : l'objet se pose comme on le tient. Pendant le glisser, un rectangle **vert** montre que ça tient, **rouge** que la place est prise ou hors de la grille. Lâché sur une place occupée : refusé.
- **Pivoter** : clic droit → **Pivoter (sens horaire)** ou **(sens anti-horaire)** : 1 × 3 devient 3 × 1, l'image tourne avec. Refusé s'il n'y a pas la place.
- **Arrivée automatique** (ramasser, prendre dans un coffre) : l'objet va au premier emplacement libre, en partant d'en haut à gauche. Sans place, il attend hors de la grille.
- **Piles** : une pile occupe sa forme une seule fois (badge « ×N ») ; compléter une pile déjà là ne prend pas de place.

## Hors de la grille

Si la grille est réduite, ou si un conteneur déjà rempli passe en grille spatiale, ce qui ne rentre pas attend dans la bande **« Hors de la grille »**, sous la grille. On le glisse dans la grille quand il y a de la place. **Rien n'est jamais supprimé.**

## Pour aller plus loin

Un objet garde sa place (coin en haut à gauche, quart de tour) même quand d'autres bougent. Ceux qui n'avaient pas encore de place enregistrée sont fixés là où on les voit dès le premier geste : rien ne glisse tout seul.
