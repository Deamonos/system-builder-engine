**À quoi ça sert :** des objets qui gardent leur secret. Une potion qu'on ne reconnaît pas, une épée dont on ignore la malédiction, une compétence qui ne sert à rien sans la bonne classe.

## Les objets non identifiés

**Exemple :** une « Potion de soins » que les joueurs voient comme une « Fiole rouge », tant que personne ne l'a goûtée ou analysée.

### Sur le modèle

Option **Peut être non identifié**, puis sa roue ⚙ :

- **Clé « identifié »** : une case de l'objet. Tant qu'elle est décochée, les joueurs voient la version inconnue.
- **Identifier un exemplaire identifie tous ceux du même objet** : toutes les fioles « Potion rouge » sont reconnues dès qu'une l'est, chez tous les personnages.

### Sur l'objet du monde

Menu **⋮** de sa fiche → **Options d'identification** :

- **Nom vu des joueurs**, **Image vue des joueurs**, **Description vue des joueurs**. Vide, le nom est « Objet inconnu ».
- **Rendre cet objet inconnu des joueurs** : coché, les joueurs voient la version inconnue.

Réglée sur l'objet du monde, la version inconnue vaut pour ses exemplaires.

### Identifier

- **Le MJ** : clic droit sur l'objet dans l'inventaire → **Identifier**, ou **Rendre inconnu**.
- **Un bouton** qui coche la case « identifié » : avec un jet d'arcanes, une compétence, un sort.

Le MJ voit toujours le vrai objet, avec un badge **non identifié**.

**Exemple :** un bouton **Analyser** sur le modèle « Potion » : **Lancer un jet** d'`arcanes` du porteur, puis **Selon le résultat du jet** → **Réussite** → **Modifier un champ** : `identifie` = `1` sur l'objet.

## Les objets inactifs

Option **Inactif si…** du modèle : une formule lue sur l'objet. Tant qu'elle est vraie, l'objet reste dans l'inventaire mais **n'apporte plus rien** à son porteur : ses valeurs ne comptent plus dans `carried()`.

**Exemple :** une compétence réservée à une classe. `owns(classes_autorisees, 1) == 0` : si le personnage n'a aucune des classes de la liste, la compétence est inactive.

> `carriedCount()` compte toujours l'objet : il est là, il ne fait rien.

## Pour aller plus loin

Un objet caché au lieu d'inconnu ? L'option **Visible des joueurs** décochée cache tous les objets d'un modèle aux joueurs, mais ils agissent quand même. Voir [Onglets et options d'un modèle d'objet](#onglets-options).
