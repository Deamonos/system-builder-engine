**À quoi ça sert :** une ressource qui a un maximum : points de vie, mana, endurance, poids porté, faim… La jauge la montre en barre ou en icônes, et la protège : elle ne sort jamais de ses bornes.

**Exemple simple :** clé `pv`, **Min → Max** `0` → `100`, valeur par défaut `100`.

**Exemple calculé :** clé `poids`, cochez **Valeur calculée**, formule `carried("poids")`, **maximum par formule** `ceil((force + endurance) / 4)`. La jauge suit d'elle-même ce que le personnage porte.

## Les réglages

| Réglage | Ce qu'il fait |
|---|---|
| **Min → Max** | Les bornes. Aucune écriture ne les dépasse : saisie, bouton, effet, HUD, macro. Une nouvelle fiche démarre au plus à son maximum réel, et quand le maximum baisse (attribut, effet, objet porté), la valeur est ramenée dessous, sans compter comme des dégâts. |
| **Maximum par formule** | Facultatif. Remplace le maximum saisi, par exemple `10 + niveau * 5`. |
| **Valeur calculée** | La jauge suit sa formule, rien à saisir. **Garder les décimales** évite l'arrondi. |
| **Affichage** | **Barre**, ou **Icônes** (une par point : trois couverts pour la faim). Un clic sur une icône fixe la valeur. |
| **Texte affiché** | Rien, valeur, valeur / maximum, ou pourcentage. Si le joueur peut la modifier, la valeur **est** la case de saisie : « [27] / 100 ». |
| **Seuils bas / haut** (%) | La jauge prend la couleur basse sous le seuil bas, la couleur haute au-dessus du seuil haut. |
| **Seuil critique** | Facultatif, au-dessus du seuil haut : une troisième couleur, pour une jauge qui devient dangereuse quand elle est trop pleine (une surchauffe, une corruption). |

Les couleurs, la forme (arrondie, carrée, pilule), la texture de remplissage et la hauteur se règlent dans l'onglet **Style**.

![Les réglages des points temporaires et du débordement](img/jauge-reglages.webp)

## Le débordement

Pour une jauge saisie : ce qui passe sous le minimum est **retiré d'une autre clé**, ce qui dépasse le maximum y est **ajouté**, multiplié par un **facteur** (1 = tout, 0,5 = la moitié).

**Exemple :** la fatigue est à 3 et en perd 5. Elle tombe à 0, et la santé perd les 2 de trop.

La clé qui reçoit garde ses propres bornes, et peut déborder à son tour.

## Ne jamais dépasser le maximum

Pour une jauge **calculée** (un poids porté, par exemple) : tout ajout qui la ferait dépasser est refusé, avec un message. **Le MJ y est aussi soumis** se coche si le MJ doit respecter la limite lui aussi ; sinon, on lui demande s'il veut continuer.

## Les points temporaires

Des points qui s'ajoutent à la jauge et **partent en premier** : PV temporaires, bouclier magique, armure qui s'use.

**Exemple :** jauge `pv`, cochez **Accepte des points temporaires**. Une case `+` apparaît à côté de la jauge (sous-clé `pv_temp`). Avec 30 PV et 5 temporaires, 8 dégâts laissent 0 temporaire et 27 PV.

![Points de vie à 14 sur 20, avec 5 points temporaires (segment bleu et case +)](img/jauge-temp.webp)

- **Quand on en donne alors qu'il en reste** : **garder le plus grand** (il en reste 5, on en donne 8 → 8) ou **additionner** (5 + 8 → 13).
- **Ils disparaissent** : à la fin du combat, à la nouvelle journée, après un nombre de rounds, après un nombre de minutes de temps de jeu. Cochez ce que vous voulez ; le premier arrivé gagne. Rien de coché : ils restent jusqu'à être usés.
- **Couleur** : une pour le thème sombre, une pour le thème clair (onglet Style).

**En donner :** écrivez la sous-clé `pv_temp` avec un bouton (étape « Modifier un champ »), un jet, un effet ou une macro. Écrire `0` les retire.

**Ce qu'ils absorbent :** toute baisse « de jeu » de la jauge (jets, boutons, effets, HUD du pion, macros). **Une saisie directe sur la fiche n'est jamais absorbée** : taper 25 dans la case PV donne exactement 25.

## Sur la scène

Une jauge peut servir de **barre de pion** : dans la configuration du pion, choisissez `values.pv`. Le HUD natif la modifie comme une barre normale (`-8` = 8 dégâts), et les points temporaires y apparaissent en segment de couleur à part.

## Pour aller plus loin

- Les sous-clés `pv_min` et `pv_max` **s'ajoutent** aux bornes : un objet qui donne `pv_max` +10 monte le maximum de 10.
- Les sous-clés `pv_bas` et `pv_haut` décalent les seuils (en %).
- `maxOf("pv")` lit le maximum effectif dans une formule.
