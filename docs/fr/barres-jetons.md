**À quoi ça sert :** des barres sur les jetons, à votre goût. Les PV en vert qui virent au rouge, une barre de stress inversée, un bouclier en segments, un cœur qui bat quand on est à l'agonie.

**Exemple :** une barre « PV » : valeur `pv`, en bas du jeton, couleur selon la valeur. Un palier sous 25 % : terme « À l'agonie », animation « Battement de cœur ». Les joueurs voient le terme sur les ennemis, le MJ voit les chiffres.

## Ouvrir les barres

Les **paramètres du système** → **Barres de jetons**. À gauche, la portée :

- **Tous les personnages** : les barres de tout le monde ;
- **un modèle** : ses propres barres, **Suit Tous**, ou **Tous + les siennes** ;
- **un jeton** : dans la configuration du jeton, encart **Barres SBE**. Seul ce que vous changez est gardé pour ce jeton.

**Garder aussi les barres de Foundry**, **Cacher aux joueurs les barres des hostiles** et la hauteur s'y règlent aussi.

![Les barres du modèle Aventurier de la démo : PV et Mana, avec l'aperçu et les onglets de la barre PV](img/barres-jetons.webp)

## Une barre

**Ajouter une barre**, puis ses onglets. À droite, un aperçu en direct montre la barre : glissez la **Valeur**, simulez une perte ou un gain avec les deux boutons, et choisissez **Vu par** pour voir ce qu'en voit un joueur.

| Onglet | Ce qu'on y règle |
|---|---|
| **Valeur** | Une clé (`pv`) ou une formule (`pv + bouclier`), le maximum et le minimum (vides = ceux de la jauge). **Inverser** : pleine à 0 (stress, faim). **Modifiable dans le HUD**. |
| **Place** | Le **bord** (haut, bas, gauche, droite), dedans ou dehors, la **ligne** (les barres d'une même ligne se partagent la largeur), les retraits, l'épaisseur, le décalage. |
| **Apparence** | La forme (arrondie, pilule, chevron, en segments…), la couleur (selon la valeur, dégradé, unie), le fond, le contour et le relief, des images (remplissage, forme, cadre), le mouvement (la barre glisse, flash sur une perte ou un gain). |
| **Texte** | Les chiffres (valeur / max, valeur, pourcentage), dedans ou à côté, un préfixe, la taille et la couleur. Les **valeurs volantes** (−12 / +5) quand la valeur change. |
| **Visibilité** | Pour le MJ, le propriétaire, les autres joueurs : toujours, au survol, sélectionné, jamais. **Qui voit les chiffres**, **qui voit le terme**. Une **valeur approchée** pour qui ne voit pas les chiffres. **Cacher si** pleine, vide, en combat. **Visible si** une formule. |
| **Paliers** | Le premier palier qui correspond s'applique : couleur, motif, animation (pulsation, battement de cœur, braises, électrocardiogramme…), **terme** (« Blessé »), halo du jeton, son au passage. |

**Exporter** et **Importer** passent les barres d'un monde à l'autre, ou une seule barre.

## Pour aller plus loin

Le module Bar Brawl fait la même chose : s'il est actif, SBE le signale pour éviter deux jeux de barres.
