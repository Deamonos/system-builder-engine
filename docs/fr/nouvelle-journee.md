**À quoi ça sert :** clore une journée de jeu en un clic. Les personnages récupèrent, la faim monte, le temps avance de la nuit, et tout ce qui dépend du repos se fait d'un coup.

**Exemple :** la démo Brumeval. Changement commun : `mana` remise à son maximum. Deux paliers : « Bonne nuit » rend la moitié des PV, « Nuit agitée » un quart. La nuit dure 8 heures.

## Ouvrir la fenêtre

Outil **Nouvelle journée** (le lit) de la barre des jetons, à gauche de la scène. Réservé au MJ.

La fenêtre a deux onglets : **Repos**, pour lancer la nuit, et **Réglages**, pour dire ce qu'elle fait.

## Les réglages

![L'onglet Réglages avec ceux de la démo : la mana remise pleine, et deux paliers de récupération](img/nouvelle-journee-reglages.webp)

### Changements communs

Appliqués à **tous** les personnages qui se reposent. Une ligne : la **clé** d'un nombre ou d'une jauge, un **montant** signé (un nombre ou une formule), en **valeur** ou en **% du max**.

**Exemple :** `faim` → `-2` valeur ; `mana` → `maxOf("mana")` valeur pour la remettre pleine.

Le résultat reste dans les bornes du champ. Une clé absente d'un personnage est ignorée pour lui.

### Le mode de récupération

| Mode | Ce qu'il fait |
|---|---|
| **Par paliers** | Chaque personnage reçoit le palier choisi pour lui. Exemple : « Nuit correcte » : `pv` → `25` % du max ; « Mauvaise nuit » : `pv` → `10` % du max. |
| **Au temps** | Chaque ligne rend son montant **toutes les N minutes**, autant de fois que la durée de repos le permet. Exemple : `pv` → 10 % du max toutes les 30 minutes : 8 h de repos = 16 fois. Le calcul s'arrête au maximum. |

Les changements communs s'appliquent dans les deux modes.

### Durée de la nuit

**Durée de la nuit par défaut** : la nuit **fait avancer le temps de jeu** d'autant. Les durées d'effets, le calendrier et tout ce qui suit le temps tournent d'eux-mêmes. `0` : le temps ne bouge pas.

Elle se change à chaque nuit, en bas de l'onglet Repos. En mode « au temps », c'est la **durée de repos par défaut**, proposée à chaque personnage.

**Enregistrer** garde les réglages.

## Lancer la nuit : l'onglet Repos

La liste des personnages qui appartiennent à un joueur (un personnage sans joueur n'y est pas) :

- **Par paliers** : cochez ceux qui se reposent et choisissez le palier de chacun.
- **Au temps** : cochez-les et réglez la durée de chacun. L'un dort 8 h, l'autre monte la garde 4 h. Le temps avance du plus long repos.

**Appliquer** fait la nuit. Pour chaque personnage, une carte **Nuit passée** est chuchotée au MJ et à ses propriétaires : ce qui a changé, ou « Rien n'a changé cette nuit ».

## Tout ce qui se fait à la nouvelle journée

En plus des réglages ci-dessus, la nuit déclenche :

- les **effets** réglés sur **Guérison au repos** (voir [Les effets qui évoluent](#effets-avances)) ;
- les **points temporaires** des jauges réglées pour s'effacer à la nouvelle journée ;
- les boutons qui se lancent sur **Nouvelle journée** (voir [Se lance tout seul](#declencheurs)) ;
- le réassort des **marchands** réglés pour ça ;
- l'effacement des **traces au sol** qui durent « jusqu'à la nouvelle journée » ;
- la sauvegarde automatique du **groupe** actif, si elle est cochée.

## Pour aller plus loin

Dans une formule de la nouvelle journée : les clés du personnage, plus `maxOf("clé")` et `minOf("clé")`, les bornes du champ. `ceil(maxOf("pv") / 2)` rend la moitié des PV, arrondie au-dessus.
