**À quoi ça sert :** des effets qui vivent seuls. Ils se posent quand une condition devient vraie, font des dégâts à chaque round, se combattent avec un jet, s'aggravent, ou s'enchaînent en plusieurs temps.

Chaque bloc ci-dessous se trouve dans le gestionnaire d'effets, sous l'identité et les modifications de l'effet. Tous sont facultatifs : dépliez le bloc et cochez **Activé**. Un point vert sur le titre signale un bloc en service.

## Déclencheur : un effet qui se pose tout seul

**Conditions** : des formules sur la fiche. L'effet se pose quand elles deviennent vraies, et part quand elles tombent.

- **Toutes vraies (ET)** ou **Au moins une vraie (OU)**.
- Formules permises : vos clés, `maxOf("clé")`, `minOf("clé")`, `hasEffect("clé")`, `stacksOf("clé")`, `inCombat()`.

**Exemple :** « Blessé grave », condition `pv <= maxOf("pv") * 0.25`, modification `agilite` **Ajouter** `-2`. Il apparaît sous un quart des PV, et disparaît avec les soins.

**Événements** : **Au début d'un combat**, **Quand cette clé baisse**. Ils posent l'effet au moment où ils arrivent ; il suit ensuite sa durée.

> Un effet posé par son déclencheur n'empêche pas de le poser à la main.

## Effet périodique : dégâts ou soins dans la durée

L'effet modifie une clé à intervalles réguliers.

| Réglage | Ce qu'il fait |
|---|---|
| **Cadence** | **Au tour du personnage**, **À chaque round**, ou **Temps de jeu** (hors combat), avec un **Intervalle** en secondes de jeu. |
| **Clé modifiée** et **Montant** | Exemple : `pv`, `-1d4`. Le résultat reste dans les bornes du champ. |
| **Réduit par la clé** | Une perte est réduite de cette valeur : la résistance au type de dégâts. Jamais au point de devenir un gain. |
| **Message dans le chat** | Pour le MJ et les propriétaires. |
| **Sur** | **Le personnage qui porte l'effet**, ou **L'objet qui confère l'effet** (l'autonomie d'une lampe, les charges d'un objet). |
| **À zéro** | Pour un objet : **Rien**, **Retirer 1 de la pile** (la suivante repart pleine), ou **L'objet disparaît**. |

**Exemple :** « Empoisonné » de la démo : à chaque round, `pv` `-1d4`, réduit par `res_poison`.

![L'effet « Empoisonné » : effet périodique et jet de résistance](img/effets-poison.webp)

## Jet de résistance

Le personnage tente de chasser l'effet. SBE utilise le jet déjà réglé sur un champ de la fiche (crayon → **Jet de dés**).

- **Champ du jet** et **Difficulté** (+ = plus dur).
- **À la pose** et / ou **À chaque round**.
- **Si réussi** : **L'effet part**, ou **Réduire** de N cumuls (de N rounds s'il n'est pas cumulable).
- **Critiques** : une réussite critique multiplie la réduction, un échec critique aggrave.

**Exemple :** « Empoisonné » : jet de `constitution`, difficulté `2`, à la pose et à chaque round ; réussi, le poison part.

## Escalade et paliers

Pour un effet **cumulable** qui s'aggrave.

- **Les cumuls montent** : **D'eux-mêmes, à la cadence choisie** (par **Pas**), ou **Seulement quand on en ajoute** (une zone, un bouton, le HUD).
- **Décroissance** : les cumuls redescendent quand le déclencheur ne tient plus. À zéro, l'effet part.
- **Paliers** : chaque palier remplace le **nom**, l'**icône**, les **modifications** et, si vous voulez, le **montant périodique** de l'effet à ce niveau. Le nombre de paliers devient le maximum.

**Exemple :** « Froid », trois paliers : Frissons (`-1` en agilité), Engourdi (`-2`), Gelé (`-4` et `-1d4` PV par round). Les cumuls montent tant que le personnage reste dehors en hiver.

## Phases : un effet en plusieurs temps

Pour enchaîner : un bonus, puis un contrecoup. **Ajouter une phase** fait passer l'effet en phases : la durée et les modifications du haut deviennent la phase 1.

- Quand la durée d'une phase s'épuise, l'effet passe à la suivante ; après la dernière, il part.
- Chaque phase a son nom, son icône, sa durée et ses modifications.
- Une phase sans durée dure jusqu'à ce qu'on retire l'effet.

**Exemple :** « Rage » de la démo. Phase 1 : `force` `+4`, `defense` `-2`, 3 rounds. Phase 2, « Épuisé » : `agilite` `-2`, 2 rounds.

## Guérison au repos

À la **nouvelle journée**, pour chaque personnage qui la passe :

- **Rien** ;
- **L'effet part** ;
- **Réduire** de N cumuls ;
- **Jet de guérison** : un jet de résistance, puis **Si le jet réussit** : l'effet part ou est réduit.

## Pour aller plus loin

Un bouton peut réagir à la pose ou au retrait d'un effet : **Se lance tout seul** → **Effet posé** / **Effet retiré**. Voir [Se lance tout seul](#declencheurs).
