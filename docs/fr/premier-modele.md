**À quoi ça sert :** construire un vrai modèle, de A à Z, puis créer un personnage avec. À la fin, vous aurez compris 80 % de SBE.

On va faire un modèle « Aventurier » avec une **Force** et des **Points de vie**, puis créer **Lys**, une aventurière.

## Étape 1 — Créer le modèle

1. Ouvrez l'onglet **Acteurs** de la barre latérale.
2. Cliquez sur **Créer un acteur**.
3. Dans « Que créer ? », gardez **Modèle**.
4. Nom : `Aventurier`, puis **Créer**.

![La fenêtre de création, sur « Modèle »](img/creer-modele.webp)

L'atelier du modèle s'ouvre. Il est vide : c'est normal.

> Tant qu'aucun modèle n'existe, le choix « Personnage » est grisé : une fiche se crée toujours **depuis** un modèle.

## Étape 2 — Ajouter la Force

1. Cliquez sur le **+** au milieu de l'atelier.
2. **Type** : `Nombre`.
3. **Clé** : `force`. **Libellé affiché** : `Force`.
4. Plus bas, **Valeur par défaut** : `10`.
5. **Valider**.

![La fenêtre « Ajouter un composant »](img/ajouter-composant.webp)

La case Force apparaît dans l'atelier. Ce que vous voyez dans l'atelier, **c'est la fiche finale**.

## Étape 3 — Ajouter les Points de vie

1. Cliquez sur le **+** du bas (il ajoute à la fin).
2. **Type** : `Jauge`.
3. **Clé** : `pv`. **Libellé affiché** : `Points de vie`.
4. **Minimum → maximum** : `0` → `20`. **Valeur par défaut** : `20`.
5. **Valider**.

Survolez un composant : sa clé et trois outils apparaissent en haut à droite.

- ⠿ pour le **glisser** ailleurs ;
- ✏ pour le **modifier** ;
- 🗑 pour le **supprimer**.

![L'atelier avec Force et Points de vie, la souris sur la jauge](img/atelier-modele.webp)

> Une erreur ? Les flèches ↶ ↷ en haut de l'atelier annulent et rétablissent (**Ctrl+Z** et **Ctrl+Y**).

## Étape 4 — Créer Lys

1. Fermez l'atelier, puis **Créer un acteur** à nouveau.
2. « Que créer ? » : **Personnage**.
3. « Depuis quel modèle ? » : **Aventurier**.
4. Nom : `Lys`, puis **Créer**.

![Créer un personnage depuis le modèle Aventurier](img/creer-personnage.webp)

La fiche de Lys s'ouvre avec ses valeurs par défaut : Force 10, Points de vie 20 sur 20.

![La fiche de Lys](img/fiche-lys.webp)

## Étape 5 — Faire évoluer le modèle

Rouvrez l'atelier « Aventurier » et ajoutez un `Nombre` de clé `chance`. Rouvrez Lys : **elle a maintenant un champ Chance**. Toutes les fiches suivent leur modèle, toujours.

## Pour aller plus loin

- Mettez la Force à côté des PV : un composant **Colonnes**, puis glissez les deux composants dedans.
- Rendez un nombre **calculé** : cochez « Mode calculé » et écrivez une **Formule**, par exemple `force * 2`.
- Rangez la fiche en **onglets** avec une **Barre de navigation**.
- Envie d'exemples complets ? Installez [la démo Brumeval](#demo) et ouvrez ses modèles : tout y est réglé à la souris.
