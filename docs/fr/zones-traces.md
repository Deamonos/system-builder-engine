**À quoi ça sert :** ce qui reste sur la carte après une action. Un feu qui brûle encore, un nuage de gaz, une aura de soin ; et les traces : le sang d'un blessé, des empreintes dans la boue, un cratère.

## Les zones persistantes

**Exemple :** une grenade incendiaire. Sur l'objet du monde, onglet **Zone** : **Laisse une zone persistante**, nature `feu`, **Cercle** de 2 cases **au point d'impact**, 3 rounds. Effet donné : « En feu », **en entrant, puis à chaque tour**.

Une zone ne fait que **donner ou retirer des effets** du gestionnaire. Les dégâts, les soins et les malus se règlent dans l'effet.

| Section | Ce qu'on y règle |
|---|---|
| **Nature, déclenchement et forme** | La **nature** (`feu`, `eau`, `fumee` : le mot commun aux zones de même sorte). **Posée par** chaque attaque de l'objet. La **position** : au point d'impact, sur la cible, attachée au lanceur (une aura), attachée à la cible. Le **gabarit** : cercle, cône, ligne, ou un gabarit dessiné. |
| **Durée** | En combat (rounds) et hors combat (minutes) ; la première arrivée au bout l'éteint. Hors combat, le rythme des effets répétés. |
| **Touche** | Tout le monde, sauf le lanceur, les alliés, ou seulement les ennemis (selon la disposition des pions). |
| **Effets donnés** | Pour chaque effet : en combat et hors combat, **en entrant**, **à chaque tour dedans**, les deux, ou rien ; **retiré en sortant** ou non ; **seulement si** une formule sur le pion touché. |
| **Puissance et exclusions** | Deux natures opposées ne restent jamais au même endroit : la plus puissante efface l'autre. Une zone d'eau (puissance 4) éteint un feu (puissance 3). La puissance peut faiblir avec le temps, et la taille avec elle. |
| **Chevauchement et répétition** | Deux zones de même nature qui se touchent : une seule frappe, chacune frappe, ou elles **fusionnent**. Un pion qui sort et rentre est-il refrappé ? |
| **Apparence et annonce** | La couleur, une info-bulle ou un message dans le chat, **bloque la vue**, une lumière. Les images, vidéos et sons : onglet **Médias** de l'objet, partie « Zone ». |
| **Trace au sol** | Une image qui reste quand la zone s'éteint ou dès l'impact : une brûlure, un cratère, une flaque. Pour toujours, un temps de jeu, ou jusqu'à la nouvelle journée. |

**Copier la zone d'un autre objet…** reprend tout le réglage d'un autre objet du monde.

## Les traces au sol

**Exemple :** le sang. Un personnage blessé sous 80 % de ses PV laisse une traînée en se déplaçant ; chaque coup reçu fait des taches, plus grandes quand la perte est forte.

Les **paramètres du système** → **Configurer les traces**. Un **type de trace** par sorte (sang, boue, huile…) ; le sang est fourni.

| Section | Ce qu'on y règle |
|---|---|
| **Quand** | La condition sur une clé (`pv` < 80 % du maximum, ou toujours), en combat seulement, les **effets actifs** qui la déclenchent aussi (Saignement), les **modèles concernés**. **Cachées (pistage)** : seul le MJ les voit. |
| **Taches à l'impact** | Quand la clé surveillée baisse : nombre, taille, délai. |
| **Traînée au déplacement** | Une trace toutes les N cases, orientée dans le sens de la marche ; pas alternés ; rien en vol. **Corps traîné** : une longue traînée continue quand un pion à terre est déplacé. |
| **Apparence** | Les formes (éclaboussure, gouttes, empreintes, flaque…), des images à vous, la couleur (ou une clé Couleur : chaque personnage a la sienne). |
| **Durée** | Gardées dans la scène ou éphémères ; disparition en temps réel ou du monde ; les murs les arrêtent. |
| **Empreintes** | Qui laisse quelle empreinte : par modèle, personnage, clé ou objet possédé. Chaussure, sabot, loup, chenilles, tentacule… |

### Les outils

- **Pister** (loupe, barre des jetons) : le jet de pistage du pion sélectionné ; réussi, les traces cachées autour de lui apparaissent pour ce joueur.
- **Tacher les pions choisis** et **Nettoyer les traces de la scène** : pour le MJ.
- Une **région** de Foundry peut laisser des traces (boue, neige) ou les effacer (la pluie).

## Pour aller plus loin

Une zone qui frappe à chaque tour s'appuie sur ses **effets** : un effet « En feu » avec un effet périodique fait les dégâts. Voir [Les effets qui évoluent](#effets-avances).
