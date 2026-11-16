**À quoi ça sert :** plusieurs visages pour un même personnage. Ses tenues, ses formes (humain, loup), un déguisement, ou une image qui change toute seule quand il est blessé ou enragé.

**Exemple :** un lycanthrope. Un dossier avec deux images, « Humain » et « Loup ». Une règle : quand l'effet `rage` est actif → « Loup ». L'effet parti, il redevient humain.

## Préparer les apparences

Configuration du jeton (ou du jeton prototype), onglet **Apparence**, encart **Apparences du jeton** → **Configurer**. MJ seulement.

- **Dossier d'images** : un dossier par personnage ; chaque image est une apparence. **Relire** après avoir ajouté ou retiré des images. Le portrait de la fiche ne change pas.
- Pour chaque image, tout est facultatif : **Libellé**, **Largeur** et **Hauteur** en cases, **Échelle**, **Nom affiché** sur le jeton.
- **Déguisement** : les joueurs voient cette image, le MJ voit la vraie apparence. **Le propriétaire voit aussi le vrai visage sous un déguisement** se coche à part.
- **Par défaut** : l'apparence de départ.
- **Transition** : un effet au changement (fondu, tourbillon, glitch, hologramme…), sa durée, un son.
- **Les joueurs ne peuvent pas changer d'apparence** : seul le MJ choisit.

## Changer d'apparence

Dès deux images, le **HUD du jeton** a un bouton **Apparence** : un clic sur une image la pose.

## Les apparences automatiques

Des **règles** dans l'ordre ; la première remplie l'emporte. Quand plus aucune ne l'est, le jeton reprend l'apparence choisie à la main, sinon celle par défaut.

| Quand | Exemple |
|---|---|
| **Une clé**, comparée à une valeur | `pv` ≤ `0` → « À terre ». |
| **Un effet est actif** | `rage` → « Loup ». |
| **Boutique** (un marchand) | **Ouverte** → l'échoppe ouverte, **Fermée** → les volets clos. |

## Pour aller plus loin

Une apparence posée par une règle est signalée dans le HUD. Pour des barres sur le jeton, voir [Les barres de jetons](#barres-jetons).
