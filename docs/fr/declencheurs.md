**À quoi ça sert :** un bouton qui part **sans clic**, quand un événement arrive. Une armure qui riposte quand on est touché, une régénération au début du tour, une malédiction qui frappe à chaque nouvelle journée.

**Exemple :** un anneau de régénération. Bouton à étapes **Régénérer** : **Modifier un champ**, ajouter `1` aux `pv` du porteur. Dans **Se lance tout seul**, cochez **Début de son tour**, **Portée** « Équipé seulement (slot) ».

## Où le régler

Sur un bouton **Exécuter des étapes**, sous la liste des étapes, dépliez **Se lance tout seul** et cochez un ou plusieurs événements.

- **Bouton d'un personnage** : ses propres événements.
- **Bouton d'un objet** : ceux de son porteur, selon la **Portée** ; ou les siens s'il est posé sur la scène.
- Le bouton se joue chez le joueur du personnage s'il est connecté (les fenêtres s'ouvrent chez lui), sinon chez le MJ.

## Les événements

![Les événements de « Se lance tout seul », sous la liste des étapes d'un bouton](img/declencheurs-evenements.webp)

| Famille | Événements |
|---|---|
| **Combat** | Dégâts reçus, Soin reçu, Avant qu'une valeur baisse, J'ai mis une cible à 0, Échec critique évité, Début de son tour, Fin de son tour, Début du combat, Fin du combat |
| **Objet** (bouton d'un objet) | Équipé (rangé dans un slot ou un conteneur « équipé »), Retiré d'un slot (ou de ce conteneur), Arrive dans un inventaire |
| **Valeurs et effets** | Une formule devient vraie, Effet posé, Effet retiré |
| **Temps** | Nouvelle journée, et les événements du calendrier : chaque heure de jeu, nouvelle date, lever et coucher du soleil, changement de météo, de saison, de phase de lune, événement du calendrier |
| **Signal** | Signal reçu : un nom libre envoyé par l'étape **Envoyer un signal** d'un autre bouton |

Certains demandent une précision :

- **Une formule devient vraie** : la formule, par exemple `pv < 10`. Le bouton part au moment où elle passe de fausse à vraie.
- **Effet posé** / **Effet retiré** : la clé d'un effet, ou une catégorie d'effets ; vide = tous.
- **Signal reçu** : le nom du signal, par exemple `alarme`.

## Les réglages

| Réglage | Ce qu'il fait |
|---|---|
| **Portée (objet)** | **Porté (inventaire)**, **Équipé seulement (slot)**, ou **Posé sur la scène**. |
| **Fréquence** | **À chaque fois**, **Une fois par round**, **Une fois par combat**, **Une fois par journée**. |
| **Seulement si** | Une formule ; fausse, le bouton ne part pas. Exemple : `eventValue >= 5`. |
| **Demander avant** | Le joueur confirme : « Utiliser « Régénérer » (Anneau) ? ». |

## Ce que les étapes lisent

- `eventName` : l'événement, le nom du signal, l'effet, la valeur surveillée ou la cible mise à 0.
- `eventValue` : le montant des dégâts ou du soin.
- `eventSource` : qui a envoyé le signal.

**Exemple :** un gros coup sonne. Bouton d'un personnage, événement **Dégâts reçus**, **Seulement si** `eventValue >= 5`. Étape **Effet** : poser « Sonné » sur le porteur.

## Avant qu'une valeur baisse

Cet événement se joue **juste avant** que la valeur soit écrite, et peut la changer.

- **Valeur surveillée** : la clé ; vide = celle qui encaisse les dégâts.
- **Nouvelle baisse** : une formule ; `eventValue` vaut la baisse prévue. Exemple : `eventValue / 2` pour un bouclier qui absorbe la moitié.
- La nouvelle baisse reste entre 0 et la baisse prévue. Une saisie directe dans la fiche ne déclenche rien.

## Pour aller plus loin

Un **signal** relie des boutons entre eux : un levier envoie `alarme` à toute la scène, et chaque garde réglé sur **Signal reçu → alarme** se met en marche.
