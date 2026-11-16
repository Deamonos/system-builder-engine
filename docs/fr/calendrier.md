**À quoi ça sert :** donner au monde une date, une heure, des saisons et des lunes, que tout le monde voit et que les règles peuvent lire. Le temps reste celui de Foundry : SBE le découpe selon **votre** calendrier.

**Exemple :** activez le calendrier ; un calendrier de base est créé (12 mois, 7 jours, années bissextiles, 4 saisons, une lune). Dans l'horloge, choisissez le pas « 1 h » et cliquez ▶ : le temps passe, le ciel de l'horloge suit, la scène s'assombrit au crépuscule.

## Activer

Les **paramètres du système** → **Calendrier, horloge et météo** (décoché par défaut ; le monde se recharge). Le MJ règle tout le reste dans l'éditeur : la roue dentée de l'horloge ou du calendrier.

## L'horloge

- **Normale** (un ciel en dôme, la date, la saison, l'heure, le moment de la journée, les lunes, la météo et la température) ou **compacte**.
- **Déplaçable** ; deux emplacements l'accueillent : au-dessus de la liste des joueurs, ou à droite de la navigation des scènes. ⌖ la remet en haut.
- **Menu du MJ** : reculer ou avancer d'un **pas** (de la minute au jour) ; aller à l'aube, à midi, au crépuscule, à minuit ; faire passer le temps tout seul à une **vitesse** (×1 à ×360) ; régler la date et l'heure.

## Le calendrier

La grille du mois, la météo prévue de chaque jour, les phases de lune. Un clic sur un jour ouvre son panneau (date, saison, lunes, météo, événements).

**Événements** : nom, icône, couleur, heure, répétition (une fois, chaque année, chaque mois), note, **visible des joueurs** ou non. Un document glissé dessus (journal, scène) s'ouvre d'un clic.

## L'éditeur

| Onglet | Ce qu'on y règle |
|---|---|
| **Général** | Nom, année de départ, heures par jour, minutes par heure, secondes par minute, années bissextiles. Plusieurs calendriers possibles ; l'étoile marque celui **en service**. |
| **Mois** et **Jours de la semaine** | Noms, abréviations, nombre de jours (et en année bissextile). |
| **Saisons** | Nom, clé, icône, début, températures, lever et coucher du soleil, et les **météos possibles avec leur poids**. |
| **Lunes** | Nom, clé, cycle en jours, décalage, couleur. Ses **phases**, chacune avec sa durée, sa couleur et un **effet** posé tant qu'elle dure. Une **phase rare** remplace une phase normale tous les N cycles ou avec X % de chance (une lune de sang). |
| **Météo** | Voir [La météo](#meteo). |
| **Affichage** | Format de la date, heure sur 24 h ou 12 h, °C ou °F, premier jour de la semaine. **Options** : les joueurs voient l'horloge, la météo change toute seule, l'heure règle l'obscurité de la scène, les **scènes intérieures**. |

**Exporter / Importer** : les calendriers, les types de météo et l'affichage.

![L'onglet Lunes de l'éditeur : la lune Séléné, son cycle de 28 jours, et ses huit phases avec leur durée et leur effet](img/calendrier-lunes.webp)

## Dans les règles

- **Formules** : `hour()`, `day()`, `month()`, `season()`, `moon()`, `moonPhase("pleine_lune")`, `isNight()`, `dayPart()`, `hasEvent("Fête")`… Voir [Les fonctions](#fonctions).
- **Déclencheurs** : chaque heure, nouvelle date, lever ou coucher du soleil, changement de saison ou de phase de lune, événement. Voir [Les déclencheurs](#declencheurs).
- **Étapes** **Temps**, **Saison**, **Lune** : un sort qui fait passer la nuit, impose un hiver éternel ou lève une lune de sang.

## Pour aller plus loin

Les effets, les attentes, les zones persistantes et la nouvelle journée suivent déjà le temps de Foundry : avancer l'horloge les fait avancer.
