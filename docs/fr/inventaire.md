**À quoi ça sert :** comprendre comment SBE range les objets d'un personnage, avant de construire ses sacs et ses emplacements.

## Le principe

Un objet possédé est un **vrai objet Foundry**, posé sur la fiche. Il sait **où** il est rangé : dans quel conteneur, dans quel slot, dans quel objet (une arme et son chargeur).

- **« Équipé » veut simplement dire « rangé dans un slot »**, ou dans un [conteneur](#conteneurs) coché « Les objets rangés ici sont équipés ». Il n'y a pas de case « équipé » à cocher en plus.
- Deux composants servent à ranger :
  - le [slot](#slots) : une case pour **un** objet (la main, l'armure, la classe) ;
  - le [conteneur](#conteneurs) : un sac, un inventaire, une liste.
- Un conteneur sans filtre accepte tout : c'est le sac. Un slot sans filtre n'accepte rien.

**Exemple minimal :** un modèle de personnage avec un **Conteneur** de clé `sac` et un **Slot** de clé `main` filtré par l'étiquette `arme`. Glissez une épée depuis la barre latérale sur le sac : elle y est rangée. Glissez-la ensuite sur la main : elle est équipée.

## Les piles

500 flèches, c'est **un seul objet** avec un compteur.

- Cochez **Empilable** dans les options du modèle d'objet. Sa roue règle le **maximum par pile** : 100 cartouches en boîtes de 30 font trois boîtes pleines et une de dix.
- Deux exemplaires fusionnent s'ils viennent du même objet du monde et ont le même état.
- En déplaçant une pile, on vous demande **quelle quantité**.
- Depuis la barre latérale, une fenêtre demande **combien en ajouter**, plafonné par la place du contenant.

## Le menu clic droit

Sur un objet de l'inventaire : **ouvrir**, **déséquiper**, **supprimer**, et toutes les **actions** de l'objet (ses boutons). Une action impossible reste visible, grisée, avec sa raison. Dans une grille spatiale : **Pivoter**.

**Afficher dans le chat** (clic droit, ou menu ⋮ de la fiche de l'objet) : une carte repliée avec l'image, le nom et les étiquettes ; un clic sur l'en-tête déroule la description. Seul ce qu'un joueur peut voir part dans le chat : les étiquettes masquées et les passages secrets restent dehors.

## Le retour à l'origine

Un objet qu'on équipe retient le contenant d'où il vient (le sac, la ceinture…). **Déséquipé**, il retourne dans ce même contenant. S'il est plein, il attend dans la zone d'attente (ci-dessous). Sans origine connue : le premier conteneur de la fiche qui l'accepte.

## Rien ne se perd : la zone d'attente

Un objet reçu alors qu'il n'y a pas la place n'est jamais perdu. Il attend dans la bande **« En attente »** sous le conteneur (ou **« Hors de la grille »** pour une grille spatiale).

Ça arrive avec un échange vers un sac plein, un objet donné par un effet, un objet sorti d'un slot quand le sac d'origine est plein, une récompense de quête…

- L'objet appartient déjà au personnage (il compte dans ce qu'il porte), mais n'occupe pas encore de place.
- Faites de la place, puis glissez-le de la bande dans le conteneur. La bande disparaît quand elle est vide.
- **Organiser** ouvre la fenêtre **Objets en attente** : poser au sol (si le MJ le permet dans les paramètres du système), jeter, ou rendre à l'ancien propriétaire.

## Limiter ce qu'on porte

Une jauge **calculée**, par exemple `carried("poids")`, avec **Ne jamais dépasser le maximum** coché, empêche de porter plus que sa capacité. Tout ajout est contrôlé (ramasser, échanger, prendre dans un coffre, une pile qui grossit) ; **retirer reste toujours possible**, même en surcharge. Voir [Jauges et points temporaires](#jauge).

## Le contenu d'un objet du monde

On peut aussi ranger des objets dans les slots et conteneurs d'un objet **que personne ne porte** : une arme avec son chargeur, un sac déjà rempli. Ce contenu est gardé avec l'objet. Quand l'objet arrive dans un inventaire, un coffre ou sur la scène, son contenu le suit.

- Glissé depuis un inventaire, un objet y est **déplacé** (avec ce qu'il contient) ; depuis la barre latérale, il y est **copié**.
- Ce contenu ne se tire pas hors de la fiche : clic droit → **Supprimer**.
