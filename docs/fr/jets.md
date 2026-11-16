**À quoi ça sert :** rendre le libellé d'un champ cliquable pour lancer un jet, sans ajouter de bouton. Un petit dé devant le libellé montre qu'il se lance.

**Exemple :** sur le champ `force`, ouvrez le crayon, bloc **Jet de dés** :

1. Cochez **Jet au clic sur le libellé**.
2. **Formule du jet** : `1d100`.
3. **Comparaison** : « Réussi si le jet ≤ valeur du champ ».

Sur la fiche, un clic sur « Force » lance 1d100 et le chat dit Réussite ou Échec.

## Les réglages du jet

| Réglage | Ce qu'il fait |
|---|---|
| **Formule du jet** | Des dés Foundry ; vos clés sont acceptées : `1d20 + force`. |
| **Titre du message** | Le titre de la carte dans le chat. Vide : le libellé du champ. |
| **Comparaison** | **Aucune** (le jet s'affiche seul) ; réussi si le jet est **≤** ou **≥ la valeur du champ** ; réussi si le jet est **≤** ou **≥ une valeur cible** (un nombre ou une clé). |
| **Appliquer le résultat** | Ajouter, retirer ou remplacer la valeur du champ. Exemple : des PV avec `1d6` en « Retirer ». Les bornes sont respectées. |
| **Icône du dé** | L'icône devant le libellé (d20, d6, crâne, émoji…), ou **Masquer l'icône de dé**. |

**Exemple d'attaque :** formule `1d100 + score`, « Réussi si le jet ≥ une valeur cible », et la difficulté saisie dans la fenêtre de jet.

## Les critiques

**Seuil de réussite critique** et **seuil d'échec critique** : aucun, une **valeur fixe**, une **formule** recalculée à chaque jet (`ceil(chance / 10)`), ou une **condition**.

- Un critique ne tombe jamais du mauvais côté : une réussite critique est toujours une réussite.
- **Critiques lus sur le dé seul** : les seuils regardent le résultat naturel des dés, sans les bonus, et le critique décide alors du résultat.

**La condition** est une formule vraie ou fausse. Elle peut lire :

| Mot | Ce qu'il vaut |
|---|---|
| `margin` | De combien le jet passe le seuil (plus grand = mieux). |
| `goal` | Le seuil. |
| `natural` | Les dés, sans les bonus. |
| `rollTotal` | Le total du jet. |
| `diceCount` | Le nombre de dés. |
| `countFace(1)` | Combien de dés ont fait 1. `countFace(5, 6)` : combien de 5 et de 6. |
| `hasDouble()` | Vrai si deux dés ont fait pareil. |

**Exemples :** réussite critique `margin >= 10`, échec critique `margin <= -10`. Pour une réserve de dés `6d6cs>=5`, un échec critique si la moitié des dés font 1 : `countFace(1) >= diceCount / 2`.

**Le dé naturel décale d'un cran** (avec une comparaison) : au-dessus d'une valeur, le résultat monte d'un degré (échec → réussite → réussite critique) ; en dessous d'une autre, il descend. Exemple sur un d20 : un cran plus haut si ≥ 20, un cran plus bas si ≤ 1.

## La fenêtre de jet

Pour laisser le joueur régler son jet avant de lancer, cochez des cases du bloc **Fenêtre de jet**. Au clic, une petite fenêtre s'ouvre, puis **Lancer**.

![La fenêtre de jet : avantage et modificateur](img/fenetre-jet.webp)

- **Avantage / désavantage** : N jets (2 à 10, **Nombre de jets**), on garde le meilleur ou le pire. Le meilleur suit le sens du jet : sous une valeur, c'est le plus bas. Le message montre tous les jets et celui gardé.
- **Modificateur libre** : un nombre saisi (+10, -5). Un bonus aide toujours : sur un jet « sous la valeur », il relève le seuil au lieu de s'ajouter au dé.
- **Difficulté / seuil** : la cible est proposée et peut être changée (seulement avec une comparaison).
- **Visibilité du message** : public, MJ, aveugle…

Rien de coché : le jet part directement. Fermer la fenêtre annule le jet. Elle ne s'ouvre jamais pour un jet automatique, comme la résistance à un effet.

### Imposer la visibilité

Bloc **Visibilité du message** : la visibilité **par défaut** de ce jet, et les visibilités **permises**. Le joueur ne choisit que parmi celles-ci ; une seule permise, il n'a pas le choix.

**Exemple :** des jets de compétence « Privé pour le MJ » par défaut, avec « Privé pour le MJ » et « Aveugle » permis.

## Bonus partagés entre plusieurs jets

**Identifiants du jet** : des étiquettes communes, par exemple `physique, attaque`. La clé `jet_physique` s'ajoute alors à **tous** les jets étiquetés `physique`. Un effet peut la viser (« Épuisé : `jet_physique` −10 ») sans qu'aucun composant de ce nom n'existe sur la fiche.

## Avantage imposé, échec critique évité

Quelques clés spéciales, posées par un effet, un objet porté ou un champ de la fiche :

| Clé | Ce qu'elle fait |
|---|---|
| `avantage` | Positive : avantage sur tous les jets ; négative : désavantage ; les deux à la fois : normal. |
| `avantage_physique` | Pareil, pour les jets d'identifiant `physique` ou pour le champ de clé `physique`. |
| `sans_echec_critique` | Positive : un échec critique devient un échec simple. La carte affiche « Échec critique évité ». |
| `sans_echec_critique_physique` | Pareil, pour un identifiant ou un champ. |

- Un objet porté qui a une case `avantage_physique` cochée impose l'avantage tant qu'il est porté. Un objet **inactif** ne l'impose plus.
- Dans la fenêtre de jet, l'avantage imposé est choisi d'office. Paramètres du système → **Avantage imposé verrouillé** : coché (par défaut), le joueur ne peut pas le changer ; décoché, il est seulement pré-coché.
- Le jet d'un objet (une arme) lit aussi ces clés chez son porteur.

## Ce que montre le message

Le modificateur saisi, et les effets **visibles de tous**, chacun nommé avec son icône. Les effets discrets restent secrets. Le résultat, lui, compte tout.

## Pour aller plus loin

Le même jet sert au clic sur le libellé, à l'étape « Lancer un jet » d'un bouton, aux [demandes de jet](#demandes-jet) du MJ et au jet de résistance des effets. Pour relancer ou ajouter un bonus après coup : [Relances et bonus](#relances).
