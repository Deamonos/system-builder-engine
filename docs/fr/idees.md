**À quoi ça sert :** comprendre les quatre idées sur lesquelles tout le reste repose. Cinq minutes de lecture qui vous en feront gagner beaucoup.

## 1. Le modèle et la fiche

Vous construisez un **modèle** : c'est le plan. Ensuite, vos personnages et vos objets sont créés **depuis** ce modèle.

- Le modèle garde la **structure** : quels champs, où, comment ils s'affichent.
- Chaque fiche ne garde que **ses valeurs** : sa force, ses PV, son nom.
- Si vous modifiez la **structure** du modèle (un champ ajouté, déplacé ou supprimé), **toutes les fiches suivent** aussitôt.

**Exemple :** vous ajoutez un champ « Chance » au modèle « Aventurier ». Tous les aventuriers déjà créés ont maintenant un champ Chance.

## 2. La clé

Chaque composant d'un modèle porte une **clé** : un nom court et unique, par exemple `pv`, `force` ou `poids`.

- La clé est **l'identité** du composant. Les formules, les effets, les jets et les réglages des outils le désignent tous par sa clé.
- Rien n'est écrit en dur dans SBE : « les PV », « le poids » ou « l'argent » n'existent que si **vous** les créez.
- Une clé commence par une minuscule, puis ne contient que des minuscules sans accent, des chiffres ou `_`. Exemples : `force`, `force_bonus`, `taille_chargeur`.

> Vous pouvez renommer une clé à tout moment : SBE la renomme partout où elle sert. Voir [Vérifier et renommer une clé](#verifier).

## 3. Une seule source de vérité

Chaque information vit à **un seul endroit**.

- Un bonus d'effet n'est jamais « cuit » dans une valeur : il **s'ajoute au calcul**, et le détail se voit au survol.
- Un objet équipé n'est pas une case cochée en double : c'est un objet **rangé dans un emplacement** de la fiche.

Résultat : rien ne se désynchronise, et retirer un effet ou un objet remet tout d'aplomb tout seul.

## 4. Aucun code obligatoire

Tout se règle à la souris. Les formules, le CSS et le HTML sont là pour aller plus loin, **pas pour démarrer**.

## Les trois étages d'un objet

Un objet passe par trois étages, reliés entre eux :

| Étage | Exemple | Où il vit |
|---|---|---|
| **Modèle d'atelier** (le plan) | « Arme » | dans les objets du monde, il ne se pose jamais sur une scène |
| **Modèle d'objet** | « Épée courte » | dans les objets du monde |
| **Exemplaire** | l'épée portée par Lys | sur une fiche, dans un coffre, au sol |

Chaque étage est relié à celui du dessus, il n'y a jamais d'objet orphelin. Mais **structure** et **valeurs** ne suivent pas de la même façon :

- **La structure suit toujours.** Ajoutez un champ « Poids » au modèle d'atelier « Arme » : toutes les armes, du monde et portées, ont un champ Poids.
- **Les valeurs suivent par propagation.** Changez le prix de l'« Épée courte » : SBE vous demande s'il faut **propager** ce nouveau prix aux épées courtes déjà existantes. Vous voyez ce qui change et combien d'exemplaires sont concernés, et c'est vous qui confirmez.

La propagation se règle composant par composant, avec la case **Propager aux objets existants** de sa fenêtre (cochée par défaut). Décochez-la pour une valeur propre à chaque exemplaire, comme l'usure ou l'état : elle ne sera jamais écrasée.

> Le nom, l'image et la description ne se propagent qu'aux exemplaires qui ne les ont pas personnalisés.

## PJ ou PNJ ?

Rien à régler : une fiche qui **appartient à un joueur** est un PJ, sinon c'est un PNJ. Changez les droits de la fiche, elle change de camp.

## Et ensuite ?

Passez à la pratique avec [Votre premier modèle en 10 minutes](#premier-modele).
