**À quoi ça sert :** faire apparaître des créatures : un loup appelé par un druide, des squelettes relevés par un sort, un drone déployé.

**Exemple :** un sort **Appel de la meute**. Étape **Placer**, **Ce qu'on pose** : **Des créatures (invocation)**. Créature « Loup », combien `1d3`, contrôlées par les joueurs de l'invocateur, 10 rounds. Le joueur pose chaque loup sur la carte ; ils entrent dans le combat juste après lui.

## Les réglages

| Réglage | Ce qu'il fait |
|---|---|
| **Créature** | Un PNJ du monde. Chaque créature devient un jeton non lié : blesser un loup ne blesse pas les autres. |
| **Combien** | Un nombre ou une formule, dés permis (`1d4`). Chaque créature est posée à la souris. |
| **Contrôlée par** | Les joueurs de l'invocateur, ou le MJ seul. Elle prend le camp de l'invocateur. |
| **Durée** | En rounds en combat, en minutes hors combat ; vide = jusqu'à ce qu'on la renvoie. |
| **Initiative** | Juste après l'invocateur, ou son propre jet. |
| **À 0** | Elle disparaît, ou reste sur la scène. |
| **Tant que l'invocateur a l'effet** | Une clé d'effet (la concentration) : l'effet parti, elles partent. **Elles partent si l'invocateur tombe à 0.** |
| **Valeurs de la créature** | Une ligne par clé : remplacer, ajouter ou retirer une formule à son arrivée. `pv` remplacer `carrier("niveau") * 5`. Les dés sont tirés pour chaque créature. |

**Renvoyer mes invocations** (même étape, **Ce qu'on pose**) : toutes, ou celles d'un PNJ.

## Dans les formules

`summoned()` compte les invocations du personnage, `summoned("Loup")` celles d'un PNJ. Exemple : une **Condition** `summoned() < 3`, message « Trop de créatures ».

## Pour aller plus loin

Les « services » d'une créature (trois attaques, puis elle s'en va) : un champ de sa fiche que ses boutons consomment, et une règle « à 0, elle disparaît ».
