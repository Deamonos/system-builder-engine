**À quoi ça sert :** des objets qui attendent sur la carte. Un coffre au trésor, une malle verrouillée, l'épée tombée d'un ennemi, un sac abandonné.

## Les coffres

**Exemple :** un coffre de pirate, verrouillé par une **Serrure (crochetage)**, avec 200 pièces d'or et une carte.

### Placer un coffre

Outil **Placer un coffre** (le coffre) de la barre des jetons, puis un clic sur la scène. La fenêtre du coffre a deux onglets : **Contenu** et **Configuration** (MJ).

### La configuration

| Réglage | Ce qu'il fait |
|---|---|
| **Nom du coffre**, **image**, **taille** | En cases, en pixels, ou la taille de l'image. |
| **Distance d'ouverture** | Jusqu'où un pion peut l'ouvrir. |
| **Limite de poids** et **Capacité max** | Avec la **clé de poids** des objets. |
| **Accès unique** | Un seul personnage à la fois ; le MJ peut **Libérer** le coffre. |
| **Verrouillage** | **Aucun**, **MJ uniquement**, **Serrure (crochetage)**, ou **Cadenas joueur** (seul celui qui l'a posé, et le MJ, l'enlève). **Joueurs autorisés** : ceux qui l'ouvrent sans clé. |
| **Affichage du contenu** | **Liste**, **Grille**, ou **Grille spatiale** (colonnes × lignes, comme un sac). |
| **Sons du coffre** | À l'ouverture et à la fermeture, pour celui qui l'ouvre. |

### Dans le coffre

- **Déposer** : glissez un objet depuis la barre latérale ou votre fiche.
- **Prendre** ou **Donner à…** : un clic sur un objet.
- **L'argent** : **Prendre l'argent**, **Distribuer l'argent** (pour moi, partager entre tous les PJ, ou avec certains), **Déposer de l'argent**.
- Le MJ : clic droit sur une case pour changer la quantité ou supprimer.

## Les objets au sol

**Exemple :** un gobelin tombe, son épée reste au sol. Un joueur la ramasse en double-cliquant dessus.

- **Poser au sol** : glisser un objet de la fiche sur la carte, le clic droit **Poser au sol** dans l'inventaire, ou un bouton. Plusieurs objets au même endroit forment un **sac**, comme un petit coffre temporaire.
- **Ramasser** : double-clic sur l'objet ou le sac, avec son pion assez près. **Prendre** ou **Donner à…** un autre personnage.
- Un objet de scène lâché sur la carte : SBE demande s'il faut l'**installer** ou le poser au sol.
- Un objet dont le modèle n'est pas **Déposable sur la scène** ne se pose jamais au sol. Un objet que les joueurs ne voient pas n'apparaît pas pour eux sur la carte.

### Les réglages

Dans les paramètres du système :

- **Ramasser un objet au sol : distance (cases)** : 0 = aucune limite ; le MJ n'est jamais limité.
- **Objets au sol : taille (cases)** et **image du sac**.
- **Objets en attente : proposer « Poser au sol »** : les objets reçus sans place peuvent être posés au sol par le joueur. Voir [Comment SBE range les objets](#inventaire).

## Pour aller plus loin

Le contenu d'un coffre compte pour la [propagation](#objets-monde) et les suppressions : supprimer un objet du monde propose aussi de retirer ses exemplaires des coffres.
