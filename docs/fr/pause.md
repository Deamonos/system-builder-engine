**À quoi ça sert :** remplacer l'écran de pause de Foundry par le vôtre. Un logo qui pulse, une phrase qui s'écrit lettre par lettre, une bande sombre en travers de l'écran, un son quand le jeu s'arrête et un autre quand il reprend.

**Exemple :** une auberge. Le média est une enseigne (image), le texte « La partie reprend bientôt… » s'affiche sous elle, en **Machine à écrire**, avec un **Flottement** en continu. Une bande noire à 60 % d'opacité traverse l'écran, et une cloche sonne à la mise en pause.

## Où la régler

Les **paramètres du système** → **Bannière de pause** → **Configurer la bannière** (MJ).

Tant que vous n'avez rien enregistré, la bannière de Foundry reste affichée. Dès le premier **Enregistrer**, la vôtre la remplace, chez tous les joueurs.

![La fenêtre de la bannière de pause : média, texte, bande de fond, position et animation, son](img/pause.webp)

## Les sections

Chaque section a une case pour l'activer ou la couper.

| Section | Ce qu'on y règle |
|---|---|
| **Média** | Une image, un gif ou une vidéo (png, jpg, gif, webp, svg, avif, mp4, webm, ogv, m4v), et sa **hauteur** en pixels. |
| **Texte** | Le **texte affiché**, la **police** (celles de Foundry, y compris les vôtres), la **taille** (en em) et la **couleur**. **Position** : au-dessus du média, sous le média, ou **libre** : deux curseurs X / Y le placent n'importe où sur l'écran. |
| **Bande de fond** | La bande en travers de l'écran : **couleur**, **opacité**, **largeur** (%) et **hauteur** (pixels). |
| **Position & animation** | Où se place le bloc média + texte (**horizontal**, **vertical**, en %) ; la bande reste centrée sur la largeur. **Assombrir tout l'écran** : un voile derrière la bannière (0 % = aucun). Puis les trois animations, ci-dessous. |
| **Son** | Un son **à la mise en pause**, un autre **à la reprise**, et le **volume**. |

## Les animations

- **Apparition**, avec sa **durée** en secondes : fondu, glissement depuis le haut, le bas, la gauche ou la droite, zoom avant ou arrière, rebond, bascule, flou net, **machine à écrire** (le texte s'écrit lettre par lettre).
- **Animation continue**, tant que le jeu est en pause : pulsation, flottement, balancement, battement de cœur, scintillement de néon.
- **Disparition**, à la reprise : fondu, ou **inverse de l'apparition**.

**Aucune** est toujours possible.

## Aperçu et boutons

- **Aperçu** montre la bannière sur votre écran, sans mettre le jeu en pause ni rien enregistrer. **Arrêter l'aperçu** la retire.
- **Enregistrer** applique la bannière pour tout le monde.
- **Réinitialiser** remet tous les réglages par défaut (avec confirmation ; c'est immédiat).

## Pour aller plus loin

Une police qui n'est pas dans la liste s'ajoute dans Foundry : *Configurer les paramètres* → *Polices supplémentaires*. Elle apparaît ensuite ici, comme dans le [thème](#theme).
