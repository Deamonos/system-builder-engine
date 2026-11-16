**À quoi ça sert :** ce qui touche une surface plutôt qu'une cible. Une grenade, un cône de flammes, un éclair qui traverse une file d'ennemis, un souffle de dragon.

**Exemple :** une boule de feu. Étape **Attaquer**, **Zone** `cercle`, rayon `3`. Le joueur pose le cercle, les pions dedans s'encadrent en rouge, chacun fait sa sauvegarde et reçoit sa part de dégâts.

## La zone de l'étape

Dans l'étape **Attaquer** (ou le profil), **Zone** : `cercle`, `cône`, `ligne`, ou le nom d'un gabarit dessiné. Un texte ou une formule (le type de zone de la munition chargée). Vide = une cible unique.

| Réglage | Sert à |
|---|---|
| **Rayon** | La taille du cercle, en cases. |
| **Longueur, ouverture** | Le cône (longueur vide = la portée de l'arme ; ouverture 90° par défaut). |
| **Longueur, largeur** | La ligne. |
| **Agrandissement** | Multiplie un gabarit dessiné (1,5 = 50 % plus grand). |
| **Traversée** | Toutes les cibles (une explosion), ou dans l'ordre depuis l'ancrage, avec un maximum (un trait qui perce). |

## En jeu

1. La forme suit la souris ; la **molette** la tourne (Maj : par 15°). Les pions touchés s'encadrent en rouge.
2. **Posée au point d'impact** (cercle, gabarit « au point d'impact ») : sur un pion, c'est une attaque contre sa défense ; au sol, un jet contre une difficulté qui grandit avec la distance. Ratée, la zone **dévie**.
3. **Partant du tireur** (cône, ligne) : pas de jet, la zone part. Elle s'arrête à la portée de l'arme.
4. Chaque cible touchée fait sa **sauvegarde** et reçoit les dégâts × l'**intensité** de la zone sur elle, moins sa protection. Une seule carte liste tout le monde.

## La sauvegarde

Dans le profil : chaque cible se défend avec **un champ à jet de sa fiche**, ou avec **sa défense contre le jet d'attaque**. **Sauvegarde réussie** : **moitié** ou **aucun** dégât. Une cible imparable ne fait aucun jet.

## Qui est touché

Les **règles de combat** :

- **Couverture** : la part d'une case (ou du pion) que la zone doit couvrir, de 1 à 100 %.
- **Mesurer sur** les cases occupées ou sur le pion lui-même. Un grand pion est touché si une seule de ses cases l'est.
- **Murs** : aucun, murs de déplacement, ou murs de vision. Ce qu'un mur cache depuis l'ancrage n'est pas touché.
- **Visée au sol** : la difficulté de base, la difficulté en plus à portée maximale, la déviation minimale et maximale.

## Les gabarits dessinés

Les **paramètres du système** → **Gabarits** → **Dessiner les gabarits** : des zones qui ne sont ni un cercle, ni un cône, ni une ligne.

- **Dessiner** sur la feuille quadrillée : **Polygone** (un clic par point, double-clic pour fermer), **Ellipse** (Maj : cercle), **Rectangle**. **Sélection** choisit un morceau, le déplace ; Suppr l'efface.
- **Intensité** : chaque morceau a la sienne (100 % au cœur, 50 % au bord). Une cible prend le morceau le plus fort qui la couvre.
- **Réglages du gabarit** : nom, **ancrage** (au point d'impact ou sur le tireur), **rotation** (libre, 8 ou 4 directions, aucune), **couleur**, et au besoin sa propre couverture et ses propres murs.
- Le point blanc est l'ancrage, la flèche montre l'avant. Mesurés en cases, les gabarits gardent leurs proportions sur toutes les cartes.

## Pour aller plus loin

Une zone qui **reste** sur la scène (un feu qui brûle trois rounds) se règle sur l'objet : voir [Zones et traces](#zones-traces).
