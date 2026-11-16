**À quoi ça sert :** des boutiques où les joueurs achètent, revendent, rachètent et marchandent. Un forgeron, un apothicaire, un colporteur posé au bord du chemin.

**Exemple :** Bertrand le forgeron, dans la démo. Il vend des armes, des armures et des boucliers, avec 10 % de majoration.

## Les réglages généraux

Les **paramètres du système** → **Marchands et monnaies** :

- **Monnaies** : les pièces du jeu (or, argent, cuivre…), utilisées aussi par les échanges et les coffres.
- **Objets et prix** : la **clé du prix** des modèles d'objets (en unité de base, la plus petite monnaie) ; **ce que les marchands vendent** et **ce qu'ils rachètent**, par famille d'objets (modèle d'atelier), avec des exceptions.
- **Boutiques** : l'apparence des boutiques. La boutique de base est intégrée. C'est ici que se gèrent les modèles de boutique : **Nouveau modèle de boutique** (vide) ou **Copier la boutique de base pour la modifier** ; un clic sur un modèle l'ouvre dans l'atelier, la corbeille le supprime (ses marchands passent au modèle par défaut). « Créer un acteur » ne propose pas de modèle de boutique.

## Créer un marchand

- **Un personnage** : menu **Marchand** de sa fiche (MJ), puis **C'est un marchand**.
- **Un objet de scène** : outil **Poser un marchand** (l'échoppe) de la barre des jetons, un nom, une image, puis un clic sur la scène. Ses réglages s'ouvrent ensuite.

## Les réglages d'un marchand

| Section | Ce qu'on y règle |
|---|---|
| **Ventes** | **Majoration des prix** (30 = +30 %, −10 = une remise). **Achats et ventes des joueurs** : **Immédiats** ou **Validés par le MJ**. |
| **Caisse** | **Argent du marchand** : **Illimité**, **Les monnaies de sa fiche**, ou **Sa caisse**. C'est ce qu'il peut payer, et où va l'argent de ses ventes. |
| **Revente au marchand** | **Le marchand rachète les objets des joueurs**, à un **Prix de rachat** (% du prix, ou une formule sur l'objet revendu : son état, sa rareté). **L'objet vendu par un joueur** rejoint le stock, ou est gardé pour le rachat du vendeur. **Le vendeur peut racheter ce qu'il a vendu**, au prix touché, au prix actuel, ou par une formule. |
| **Négociation** | Le % de chaque issue (réussite critique, réussite, échec, échec critique), proposé quand le MJ lance une négociation. Positif = à l'avantage du joueur. |
| **Accès** | **Distance maximale** pour ouvrir la boutique ; 0 = de partout. |
| **Sons** | **Ouverture** et **Fermeture** de la boutique, **Achat**, **Vente**, **Rachat (historique)**. Vide, le rachat reprend le son d'achat. |
| **Modèle de boutique** | L'apparence de sa boutique. |

**Boutique ouverte** : décochée, les joueurs ne peuvent plus l'ouvrir. L'apparence du jeton ouvert / fermé se règle avec les [apparences du jeton](#apparences-jeton) (règle « Boutique »).

## Le stock

Dans la boutique, le MJ **glisse des objets** sur l'étal. Clic droit sur un article pour le régler :

- **Quantité** (ou illimitée), **Prix forcé** (vide = la clé de prix, avec la majoration) ;
- **Réapprovisionnement** : **jamais**, **à chaque nouvelle journée**, ou **après un temps de jeu** ; **remonter à** une quantité.

Un objet porté par le marchand lui-même est un **exemplaire unique** : il quitte sa fiche quand il est acheté.

![La boutique de Bertrand vue par le MJ : la bourse de l'acheteur, les onglets Acheter, Vendre, Historique, et l'étal rangé par catégorie](img/boutique.webp)

## Côté joueur

Double-clic sur le marchand (ou sur son jeton) avec son personnage assez près :

- **Acheter** : un clic sur un article, la quantité, le total.
- **Vendre** : glisser un objet de son inventaire sur la zone de vente. Le prix de rachat s'affiche avant de confirmer.
- **Historique** : chaque opération. Un objet vendu peut être **racheté** si le marchand le permet. Le MJ peut **bloquer le rachat** d'une ligne ou la supprimer.

## L'affichage de la boutique

Il se règle sur le composant **Étal** du modèle de boutique : **Liste**, **Grille d'icônes** ou **Grille spatiale** ; des **onglets** par famille d'objets ou par la valeur d'une clé (catégorie, rareté) ; la quantité restante ; les articles épuisés affichés grisés ou masqués.

## Pour aller plus loin

Une boutique sur mesure est un modèle de boutique créé dans le manager (ci-dessus), ou un modèle de personnage passé en **modèle de boutique** (menu ⋮ de l'atelier : **En faire un modèle de boutique**). On y pose les composants de boutique (bourse, caisse, étal, zone de vente) avec tout le reste de l'atelier.
