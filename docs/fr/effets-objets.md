**À quoi ça sert :** qu'un objet donne un effet. Une armure enchantée tant qu'elle est portée, une potion qui bénit quand on la boit, une épée maudite dès qu'on l'équipe.

## Sur le modèle : les effets conférés

Dans l'atelier d'un modèle d'objet, onglet **Effets** : **Ajouter un effet conféré**.

- **L'effet** : sa clé dans le gestionnaire d'effets, ou `@clé` pour lire la clé d'effet sur chaque objet (un champ de l'objet).
- **Quand il est équipé** (rangé dans un slot de la fiche, ou un conteneur dont les objets sont équipés) ou **Tant qu'il est porté**.
- **Seulement si** : une formule lue sur l'objet, par exemple une case `allume`. L'effet n'est donné que tant qu'elle est vraie.

L'effet part avec l'objet. Un effet posé à la main n'est jamais retiré.

**Exemple :** un modèle « Anneau » avec un champ liste `pouvoir` (`beni`, `rage`…) et un effet conféré `@pouvoir`, **Quand il est équipé**. Chaque anneau donne son propre effet.

## Sur l'objet du monde : l'onglet Effets

La fiche d'un objet du monde a aussi un onglet **Effets**, en trois parties.

### Donnés par le modèle

Le rappel des effets conférés par son modèle. On les change dans l'atelier.

### Effets propres à cet objet

Des effets qui n'existent que sur cet objet, sans encombrer le gestionnaire d'effets. **Ajouter un effet propre** : il porte le nom et l'icône de l'objet, et se règle comme dans le gestionnaire (durée, modifications, phases, effet périodique…).

Chacun dit en haut **quand** il est posé : **Jamais** (pas automatique), **tant qu'il est équipé ou porté**, ou à l'usage d'un **bouton** de l'objet, selon l'issue du jet, sur le porteur ou sur les cibles. Tout est enregistré au fil de la saisie.

Posé sur un personnage, un effet propre continue même si l'objet est consommé : une potion bue laisse son effet jusqu'au bout.

### Effets du gestionnaire : quand les appliquer

Des **règles** pour poser un effet du gestionnaire. **Ajouter une règle**, puis choisir :

- l'**effet** ;
- **Quand il est équipé**, **Tant qu'il est porté**, ou **Bouton « … »** : dès l'usage du bouton ;
- l'**action** : poser, retirer, +1 ou −1 cumul ;
- pour un bouton : l'**issue** du jet (**Toujours**, **Si réussite**, **Si échec**, **Si réussite critique**, **Si échec critique**), et **sur le porteur** ou **sur les cibles** ;
- sans bouton : **Seulement si**, une formule lue sur l'objet.

**Exemple :** une potion « Élixir de bravoure », règle **Bouton « Boire »**, **Toujours**, poser `beni`.

Les règles de l'objet ne sont jamais écrasées par une mise à jour du modèle.

## Les exemplaires suivent l'objet du monde

Un exemplaire (dans un inventaire, un coffre) **suit les effets de son objet du monde** : les changer sur l'objet du monde les change pour tous, même ceux déjà distribués. **Les modifier pour cet exemplaire seulement** détache cet exemplaire.

## Dans l'info-bulle

**Montrer les effets dans l'info-bulle de l'objet** : au survol d'un objet porté, chaque effet qu'il donne et ce qu'il fait. Un effet discret reste caché aux joueurs.

## Les objets donnés par un effet

Dans le gestionnaire d'effets, bloc **Objets donnés** : tant que l'effet dure, le personnage reçoit ces objets du monde. Les armes d'une forme animale, l'arme invoquée par un sort…

- Glissez les objets du monde depuis la barre latérale.
- **Où il va** : la clé d'un conteneur ou d'un slot de la fiche. Slot occupé : l'objet en place retourne d'où il venait, puis revient à la fin de l'effet.
- **À la fin de l'effet** : **Il est retiré** ou **Il reste**.
- **Verrouillé** : le joueur ne peut ni le jeter, ni le donner, ni le déposer ailleurs.

**Exemple :** un sort « Lame de feu » : l'effet donne l'objet « Lame de feu » dans le slot `main`, verrouillé, retiré à la fin. L'épée du personnage revient dans sa main ensuite.

## Pour aller plus loin

Un bouton peut aussi poser un effet avec son étape **Effet**, sur le porteur ou sur les cibles. Voir [Toutes les étapes](#etapes-liste).
