**À quoi ça sert :** écrire ce que fait un bouton, sans code, comme une recette : une étape après l'autre.

**Exemple :** le bouton **Tirer** d'un arc, dans la démo :

1. **Condition** : `carriedCount("munitions") > 0`, message « Plus de flèches : rechargez. »
2. **Attaquer** avec le champ `score`, dégâts `degats`, portée `portee`.
3. **Consommer** 1 du slot `munitions`.

(Une première condition vérifie aussi que l'arc n'est pas brisé.) Si le joueur annule la visée à l'étape 2, le bouton s'arrête : la flèche n'est pas dépensée.

![Les étapes du bouton Tirer dans l'atelier : deux conditions, une attaque, puis consommer une flèche du slot](img/etapes-tirer.webp)

## L'éditeur d'étapes

Choisissez **Exécuter des étapes** dans l'**Action du bouton**, puis **Ajouter une étape**.

- Chaque étape tient sur une ligne qui se lit comme une phrase : « jet de crochetage du porteur », « retirer 1 du slot munitions ». Un clic la déplie pour la régler.
- Les flèches ↑ ↓ changent l'ordre ; la corbeille la supprime.
- Le **?** à côté du type explique ce que fait l'étape.
- Les champs proposent les clés du modèle au fur et à mesure qu'on tape.

## Dans l'ordre, et une condition fausse arrête tout

Les étapes s'exécutent **de haut en bas**.

- Une étape **Condition** continue seulement si sa formule est vraie. Sinon, le bouton s'arrête et affiche son **message**.
- Les conditions du début grisent aussi le bouton à l'avance, avec ce message au survol.
- Mettez ce qui coûte (**Consommer**, retirer des objets) **après** ce qui peut être annulé (viser, choisir, lancer un jet). Annuler ne coûte alors rien.

### Conditions en phrases ou en formules

Par défaut, une condition se compose en phrases : « munitions » « est plus grand que » « 0 ».

![Une condition dépliée, écrite en phrase, avec la formule qu'elle donne et son message](img/etapes-condition.webp)

On peut grouper des phrases (**Toutes** ou **Au moins une** doivent être vraies) et inverser une phrase avec **Non**.

Cochez **Mode avancé (conditions en formules)** pour les écrire en formules : `munitions > 0`. La formule reste la même, seul l'affichage change, et ce réglage ne vaut que pour vous.

## « Seulement si » : une étape facultative

Chaque étape a un champ **Seulement si (facultatif)**. Vide, l'étape se fait toujours. Avec une formule, elle se fait seulement si la formule est vraie, **sans arrêter** les suivantes.

**Exemple :** une potion qui soigne ou rend de la mana selon son effet. Deux étapes **Modifier un champ**, l'une avec **Seulement si** `effet == "Soin"`, l'autre avec `effet == "Mana"`.

## Ce que les étapes se transmettent

Une étape peut lire ce qu'une étape d'avant a produit :

| Variable | Après quelle étape | Ce qu'elle vaut |
|---|---|---|
| `isSuccess`, `isCrit`, `isFumble` | Lancer un jet, Attaquer | 1 ou 0 |
| `rollTotal` | Lancer un jet, Attaquer | le total du jet |
| `isHit` | Attaquer | 1 si une cible est touchée |
| `pickedName`, `picked_clé` | Choisir un objet | le nom et les champs de l'objet choisi |
| les noms des questions | Demander | la réponse donnée |
| `tableResult`, `tableTotal` | Table aléatoire | le texte tiré et le nombre obtenu |
| `eventName`, `eventValue`, `eventSource` | un bouton qui [se lance tout seul](#declencheurs) | l'événement, son montant, qui l'a envoyé |

Dans un filtre de **Choisir un objet** ou de **Retirer des objets**, les champs de l'objet qu'on utilise s'écrivent avec le préfixe `self_`.

## Les blocs

Deux étapes contiennent d'autres étapes :

- **Si… alors… sinon…** : si la condition est vraie, joue les étapes de **Alors** ; sinon celles de **Sinon**. Une branche peut rester vide.
- **Selon le résultat du jet** : joue la branche du **dernier** jet ou de la dernière attaque du bouton : **Réussite critique**, **Réussite**, **Échec**, **Échec critique**.

Un bloc peut en contenir un autre, sur deux niveaux au plus.

**Exemple :** un coffre verrouillé posé sur la scène, avec un bouton **Crocheter** utilisable une fois posé. **Lancer un jet** de `crochetage` du porteur (le personnage qui interagit), puis **Selon le résultat du jet** :

- **Réussite** → **Modifier un champ** : `verrouille` = `0` sur l'objet ;
- **Échec critique** → **Retirer des objets** : un « Crochet » du porteur (il se casse).

## Pour aller plus loin

La liste complète des étapes, avec ce que chacune fait : [Toutes les étapes](#etapes-liste).
