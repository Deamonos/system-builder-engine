**À quoi ça sert :** un sac, un inventaire, une liste de sorts, une liste d'outils requis. Le conteneur range **plusieurs** objets et les affiche à votre façon.

**Exemple :** un conteneur de clé `sac`, **Type d'affichage** « Grille (cases) », 8 colonnes. Sans filtre, il accepte tout.

## Ce que le conteneur accueille

- **Des objets portés (inventaire)** : le sac du personnage.
- **Des références à des objets du monde (liste)** : rien n'est porté ni déplacé, on cite des objets. Exemple : la liste « Munitions compatibles » d'une arme, ou « Outils requis » d'une recette.

Le **filtre** est le même que celui des [slots](#slots) (par modèle, étiquette, clé, étiquettes refusées). Mais à l'inverse du slot, **un conteneur sans filtre accepte tout**.

## Les types d'affichage

| Affichage | Ce qu'il montre |
|---|---|
| **Liste (colonnes)** | Une ligne par objet, avec les **colonnes** de votre choix : une clé de l'objet par colonne (poids, prix, munitions…). |
| **Grille (cases)** | Une case carrée par objet ou par pile, avec l'icône et la quantité en badge. |
| **Grille spatiale** | Chaque objet occupe sa forme en cases. Voir [La grille spatiale](#grille-spatiale). |
| **Cartes** (listes de références) | Grande icône, nom entier, et une case « + » quand c'est vide. |
| **Fiches** (objets portés) | Une fiche par objet, comme une carte de compétence : pastilles, boutons, texte dépliant. |

### La grille

- **Colonnes** : un nombre, ou vide pour **auto** (autant que la largeur le permet).
- **Lignes** : vide = **infini**. Avec un nombre, la grille refuse un nouvel objet quand elle est pleine.
- **Taille des cases** (px) et **Afficher le nom sous l'icône**.
- **Le rangement** se choisit sur la fiche, avec les trois boutons en haut de la grille : par nom de A à Z, de Z à A, ou **manuel** (l'objet reste dans la case où on le lâche, et échange sa place sur une case occupée).

### Les fiches

Chaque objet devient une petite fiche :

- **Tête** : icône et nom. Les **colonnes** choisissent leur place : **pastille** sous le nom, **cadre à droite** ou **étiquette à droite**. Chaque colonne a un **texte** (`{{clé}}`, `{{= formule}}`), une condition **seulement si**, et une **teinte** (neutre, coût en rouge, hausse en ambre, info en bleu, accent).
- **Jauge en points** : une jauge de l'objet en bas de la fiche (des charges, par exemple). À zéro, la fiche s'estompe.
- **Les boutons de l'objet** : ceux qui sont proposés hors de sa fiche.
- **Verrouillé si** : une formule lue sur l'objet ; vraie, la fiche est grisée avec un cadenas et ses boutons sont désactivés.
- **Texte dépliant** : une flèche déplie la description (ou un autre texte, choisi par une formule).

**Exemple :** une pastille `-{{cout_mana}} PM`, seulement si `cout_mana > 0`, teinte « Coût ».

## Le classement

**Classement des objets** (liste, grille et fiches) :

- **Aucun** : une liste simple.
- **Par une clé** : des sections automatiques selon la valeur d'une clé (catégorie, type…), avec des sous-sections et une icône par valeur.
- **Catégories écrites à la main** : chacune avec son filtre (étiquette, clé présente, clé = valeur, modèle d'objet, ou « tout le reste »).

**Ne pas regrouper les objets identiques** : par défaut, plusieurs exemplaires d'un même objet tiennent sur une ligne repliable. Coché, une ligne par objet.

## Les réglages des listes de références

- **Reflet de la liste** : la liste montre le contenu d'une autre liste de références, en lecture seule. Rien à remplir deux fois.
- **Liste inverse** : les objets du monde qui citent **cet** objet dans une de leurs listes. Exemple : sur une recette, les outils qui la permettent.
- **Joueurs : seulement ce qu'ils possèdent** : un joueur ne voit que les objets dont son personnage porte un exemplaire.
- **Envoyer avec la description dans le chat** : la liste suit la description quand l'objet est affiché dans le chat.

## Les autres réglages

- **Les objets rangés ici sont équipés** (objets portés) : tout ce qui est dans ce conteneur compte comme équipé, comme dans un slot (effets « quand il est équipé », lumière, déclencheurs équipé / retiré, petits boutons du HUD). Exemple : une grille « Équipé » sur une fiche de créature, à la place des slots.
- **Un seul exemplaire de chaque objet sur la fiche** : un doublon est refusé, où qu'il soit rangé.
- **Modifiable par le joueur** : décoché, un joueur ne peut ni déposer ni retirer.
- **Accepte les piles**, **Quantité maximale**, **Taille des icônes**.

## Pour aller plus loin

`carried("poids", "sac")` additionne une clé sur le contenu du conteneur `sac`, et `carriedCount("sac")` compte ses objets. Voir [Les fonctions de formule](#fonctions).
