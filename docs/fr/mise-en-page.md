**À quoi ça sert :** ranger la fiche. Ces composants ne gardent aucune valeur : ils regroupent, alignent et découpent les autres.

![Une fiche de la démo : un en-tête épinglé, une barre d'onglets, deux cadres dans des colonnes](img/fiche-onglets.webp)

## Cadre

Une boîte qui regroupe des composants, avec un titre. Glissez des composants dedans (⠿), ou utilisez son propre **+**.

**Exemple :** un cadre « Attributs » qui contient Force, Agilité et Esprit.

- **Repliable** : une flèche ouvre et ferme le cadre. **Replié par défaut** le ferme à l'ouverture de la fiche.
- **Position de la flèche** : gauche, milieu ou droite.
- **Position du titre** : dans le cadre (bandeau) ou au-dessus.
- **Invisible** : sans barre ni bordure. Le cadre ne sert plus qu'à grouper.
- **Épinglé en haut** : un cadre de premier niveau reste fixe pendant que le reste de la fiche défile. Idéal pour un en-tête (nom, portrait, PV).

**Pour aller plus loin : le placement libre.** Le cadre ne range plus ses composants l'un sous l'autre : vous posez chacun où vous voulez, à la souris. La position se compte en % (elle suit la largeur de la fiche) ou en px (ancrée au coin, idéale sur une image de fond), avec premier et arrière-plan. Le cadre s'agrandit pour contenir ce qu'on y pose.

## Colonnes

Des composants côte à côte.

**Exemple :** 2 colonnes, un cadre « Attributs » à gauche et un cadre « Combat » à droite.

- **Nombre de colonnes** : de 2 à 10. En réduire le nombre rapatrie le contenu en trop dans la dernière.
- **Largeur des colonnes** (%) : le total reste à 100 % tout seul, 5 % minimum par colonne.
- **Même hauteur pour toutes les colonnes** : elles prennent la hauteur de la plus haute, et le dernier composant de chaque colonne s'étire jusqu'en bas. Deux cadres côte à côte finissent sur la même ligne, sans vide dessous.

> **Alignement automatique :** dans une même colonne, un même cadre ou un même onglet, les libellés placés à gauche s'alignent. La colonne des libellés prend la largeur du plus long (130 px au plus), et toutes les cases se rangent dessous.

## Barre de navigation et onglets

Découpe la fiche en onglets : Caractéristiques, Inventaire, Sorts, Notes…

1. Ajoutez une **Barre de navigation**.
2. Ajoutez-lui des onglets (le **+** de la barre).
3. Remplissez chaque onglet : cliquez dessus dans l'atelier, puis **+**.

**Réglages de la barre :**

- **Orientation** : horizontale (onglets alignés à gauche, au centre ou à droite) ou verticale (barre à gauche ou à droite).

**Réglages d'un onglet** (son crayon) :

- **Icône** : Font Awesome, émoji ou image ; et une **info-bulle**.
- **Visible par les joueurs**.
- **Son au clic** (onglet Média de sa fenêtre) : un fichier et un volume, joués quand on passe sur cet onglet. Exemple : un bruit de sac pour l'Inventaire. Seul celui qui clique l'entend.

## Séparateur

Un trait entre deux parties, ou une **image de séparation** pleine largeur (bannière, ornement). **Hauteur** réglable.

## Étiquettes

Des badges en haut de la fiche : « ARME À DEUX MAINS », « MAGIQUE », la rareté…

**Exemple :** une ligne `ARME`, puis une ligne `@categorie` : le second badge affiche la valeur du champ `categorie`.

- **Une étiquette par ligne.** `@clé` crée un badge lié à un champ. Pour une case à cocher, c'est son libellé qui s'affiche quand elle est cochée, rien sinon.
- **Mise en avant** : les étiquettes qui prennent la couleur d'accent — les liées (`@clé`, par défaut), la première, toutes ou aucune.
- **Position** : au-dessus de l'en-tête, ou dans l'en-tête, juste au-dessus du nom.

**Pour aller plus loin :** les slots et les conteneurs peuvent **filtrer** les objets par étiquette (« n'accepte que les ARME »).
