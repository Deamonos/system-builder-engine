**À quoi ça sert :** des fonctions prêtes à l'emploi pour lire ce qu'une simple clé ne donne pas : ce que le personnage porte, ses effets, le calendrier, le porteur d'un objet.

Le nom d'une clé, d'un effet ou d'un conteneur s'écrit **entre guillemets** : `carried("poids")`.

## Lire l'inventaire

| Fonction | Ce qu'elle rend |
|---|---|
| `carried("poids")` | La somme de la clé `poids` sur tous les objets portés, **quantité comprise** : 12 flèches à 0,1 pèsent 1,2. |
| `carried("poids", "sac")` | La même somme, limitée au conteneur ou au slot `sac`. |
| `carriedCount()` / `carriedCount("sac")` | Le nombre d'objets portés (ou rangés dans `sac`). |
| `carriedValue("degats", "main")` | La valeur sur l'objet rangé dans le slot `main` : le bonus de la munition chargée, par exemple. |
| `owns("Corde")` | Combien d'objets de cette sorte le personnage possède : un nom, l'id d'un objet du monde ou une liste de références. |

**Exemple :** une jauge de charge en mode calculé, formule `carried("poids")`, maximum `force * 2`.

> Sur un **objet**, ces fonctions ne voient que ce que l'objet contient : une arme compte les balles de son propre chargeur.

## Les bornes d'un champ

| Fonction | Ce qu'elle rend |
|---|---|
| `maxOf("pv")` / `minOf("pv")` | Les bornes réelles du champ, apports et maximum en formule compris. |

## Les effets et le combat

| Fonction | Ce qu'elle rend |
|---|---|
| `hasEffect("brulure")` | Vrai si l'effet est posé sur le personnage. |
| `stacksOf("brulure")` | Son nombre de cumuls. |
| `effectCategory("brulure")` | La catégorie de l'effet, vide s'il n'en a pas. |
| `posedEffects()` / `posedEffects("brulure")` | Combien d'effets ce personnage a posés, partout. Exemple : un malus d'entretien `-2 * posedEffects()`. |
| `inCombat()` | Vrai pendant un combat. |

## Sur un objet : lire son porteur

| Fonction | Ce qu'elle rend |
|---|---|
| `carrier("force")` | La valeur de la clé sur la fiche de celui qui porte l'objet (champs calculés et effets compris). 0 si personne ne le porte. |
| `carrierMax("pv")` | Le maximum réel du champ chez le porteur. Exemple : un soin qui rend 20 % des PV max, `ceil(carrierMax("pv") * 20 / 100)`. |
| `slotted("main")` | 1 si le slot `main` **de l'objet** est occupé, 0 sinon. |
| `slotted("main", "degats")` | La valeur de `degats` sur l'objet rangé dans ce slot, vide si le slot est vide. |

**Exemple :** une arme dont la chance de toucher dépend de la force de son porteur : `50 + carrier("force")`.

## Le calendrier

Ces fonctions lisent le calendrier du monde, s'il est en service.

| Fonction | Ce qu'elle rend |
|---|---|
| `hour()`, `minute()` | L'heure et la minute. |
| `day()`, `month()`, `year()` | Le jour du mois, le mois, l'année. |
| `weekday()`, `dayOfYear()` | Le jour de la semaine (1 = le premier), le jour de l'année. |
| `season()`, `weather()` | La **clé** de la saison et du type de météo du moment. Exemple : `weather() == "orage" ? -10 : 0`. |
| `moon()` / `moon("lune_rouge")` | La clé de la phase de la première lune, ou d'une lune précise. |
| `moonPhase("pleine")` | 1 si la première lune est dans cette phase. `moonPhase("pleine", "lune_rouge")` pour une lune précise. |
| `temperature()` | La température du moment. |
| `isNight()` | 1 la nuit. |
| `dayPart()` | Le moment de la journée : `night`, `dawn`, `morning`, `noon`, `afternoon`, `dusk`. |
| `hasEvent()` / `hasEvent("Fête")` | 1 si un événement du calendrier (ou celui-là) tombe aujourd'hui. |

## Pour aller plus loin

- `reverse(34)` rend 43 : les chiffres à l'envers (sur 2 chiffres par défaut, `reverse(7)` rend 70). Pratique pour lire un jet d'attaque comme un jet de localisation.
- `owns(classes_autorisees, 1)` : le second nombre est rendu quand la liste est vide. `owns(classes_autorisees, 1) > 0` se lit « aucune classe exigée, ou il en a une ».
- Dans un filtre « Choisir un objet », l'objet qu'on utilise s'écrit avec le préfixe `self_` : `self_slotted("main")`, `self_pv`.
