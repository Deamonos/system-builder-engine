**À quoi ça sert :** un temps qui change selon la saison, qui se voit sur la scène, s'entend, et pèse sur les règles. La pluie qui tombe, un orage qui gronde au loin, une tempête de sable qui ralentit tout le monde.

**Exemple :** en hiver, la saison propose `neige` (poids 3), `couvert` (poids 2) et `degage` (poids 1). La neige tombe sur la scène, le vent souffle, et l'effet « Froid » est posé sur les personnages de la scène tant qu'il neige.

## Comment la météo est choisie

- **Naturelle** : tirée selon la saison, à chaque **créneau** de N heures. Plus le poids est grand, plus elle tombe souvent. Le tirage est reproductible : le passé ne change pas, et les jours à venir ont leur prévision dans le calendrier.
- **Imposée par le MJ** : un clic sur la pastille météo de l'horloge ouvre les types ; en choisir un l'impose jusqu'au lendemain ou jusqu'à nouvel ordre, avec une température facultative. **Météo naturelle** rend le tirage.
- **Imposée par un bouton** : l'étape **Météo** (un sort de pluie).

## Les types de météo

L'onglet **Météo** de l'éditeur du calendrier (roue dentée de l'horloge). **Ajouter les types fournis** remet ceux de base : Nature, Fantasy, Horreur, Apocalyptique, Science-fiction. L'œil d'une catégorie la propose ou la retire du menu de l'horloge.

![Les types de météo de la catégorie Nature, et le réglage de « Ciel dégagé » : clé, icône, écart de température, ciel et couches](img/meteo.webp)

| Réglage | Ce qu'il fait |
|---|---|
| **Nom, clé, catégorie, icône** | La clé est lue par `weather()` et les déclencheurs. |
| **Écart de température** | S'ajoute à la température de la saison. |
| **Effet** | Un effet posé sur les personnages de la scène active tant que ce temps règne. |
| **Ciel de l'horloge** | Un ciel propre, et des couches : nuages, pluie, neige, éclairs, brume, aurores… |
| **Effet sur la scène** | Une ligne par couche : un effet météo de Foundry recoloré (pluie, neige, brouillard…) ou un effet SBE (voile coloré, éclairs, étincelles, aurores, air qui tremble…), avec sa couleur et sa quantité. |
| **Sons** | Voir ci-dessous. |

## Les sons

Une ligne par son : un son de la **bibliothèque SBE** (pluie, vents, grêle, tonnerres, feu…) ou un fichier à vous.

- **Boucle** : en continu. **Aléatoire** : revient toutes les min–max secondes. **Sur l'éclair** : part avec l'éclair de la scène ; un éclair lointain arrive plus tard et plus bas.
- Quand la météo change, les sons s'effacent en 2 secondes et les nouveaux montent en 3.
- Chaque joueur règle le volume avec le curseur **Environnement** de Foundry ; la case **Sons météo** des paramètres du système les coupe.

## Dans les règles

`weather()` donne la clé du temps, `temperature()` la température. Exemple : un malus `weather() == "tempete" ? -2 : 0`. Le déclencheur **changement de météo** lance un bouton (`eventName` = la clé).

## Pour aller plus loin

Les **scènes intérieures** (options du calendrier) n'ont ni météo, ni obscurité, ni sons météo.
