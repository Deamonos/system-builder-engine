**À quoi ça sert :** jouer sans crainte. Une mauvaise action se défait, une suppression ne laisse rien à moitié, et un modèle partagé ne peut rien exécuter chez vous.

## Revenir en arrière

**Exemple :** un joueur boit la mauvaise potion. Sous la carte de l'action, dans le chat, le MJ clique **Annuler** : la potion revient dans l'inventaire et les PV reprennent leur valeur.

![Sous la carte de Brann qui boit une potion, le MJ a cliqué Annuler : SBE liste l'action défaite et attend Confirmer ou Garder](img/annuler.webp)

SBE note chaque **action** : un bouton lancé (au clic, par un déclencheur, à la fin d'une attente) ou un geste sur une carte (dégâts appliqués, relance). Tout ce qu'elle a changé est gardé : fiches, objets, effets, jetons, zones, tuiles, murs, lumières, combattants, réglages.

- **Annuler** (sous la carte, MJ) : SBE liste les actions défaites et demande confirmation. Annuler une action défait aussi **toutes celles qui ont suivi**, de la plus récente à celle-là.
- **Rétablir** : sur une carte annulée, refait ce qui vient d'être défait. Une nouvelle action efface ce qui pouvait encore être rétabli.
- **Historique des actions** (l'icône d'horloge sous la carte, ou les paramètres du système → **Ouvrir l'historique**) : les dernières actions de la table, la plus récente en haut. **Revenir ici**, **Annuler la dernière**, **Rétablir**, **Vider**.
- **Raccourcis** (MJ) : **Ctrl + Alt + Z** pour annuler, **Ctrl + Alt + Y** pour rétablir. Ils se changent dans les contrôles de Foundry.

**Ce qui ne se défait pas :** ce qui est déjà arrivé à la table. Les dés lancés, les sons joués et les messages du chat restent. Revenir en arrière ne déclenche rien : ni réaction, ni jet de résistance, ni trace.

Les joueurs voient qu'une carte a été annulée, mais seul le MJ revient en arrière.

**Réglages** (paramètres du système) : **Retour en arrière : activé** (décoché, rien n'est noté et aucune carte ne propose « Annuler ») et la **taille de l'historique** (20 actions par défaut, de 5 à 100 ; les plus anciennes sortent).

## Rien n'est laissé à moitié

- **Supprimer un modèle d'atelier** montre ce qui en dépend, avec les nombres : les objets du monde, les exemplaires portés et qui les porte, ceux qui sont ailleurs. Confirmé, tout part ensemble, sur toutes les scènes.
- **Supprimer un objet du monde** retire ses exemplaires ; s'il en reste dans des coffres, SBE propose de les supprimer aussi.
- **Le contenu d'un objet supprimé** (l'arme d'un support, les objets d'un sac) revient dans l'inventaire de son porteur.
- **Au chargement du monde**, le MJ est prévenu s'il reste des objets sans modèle (**Objets orphelins** : supprimer, ou plus tard) ou des objets **rangés nulle part** (supprimer, ou ranger dans l'inventaire). Les objets dont le contenant a disparu sont remis dans l'inventaire.
- Aucune suppression n'est bloquée sans explication : vous voyez ce qui part, et vous décidez.

## Des valeurs toujours justes

- **Les bornes sont toujours respectées** : une valeur revient entre son minimum et son maximum, quel que soit le chemin (saisie, bouton, effet, macro).
- **Une seule écriture à la fois** : les effets, les durées, les lumières et les zones sont écrits par le MJ connecté. Deux joueurs qui agissent en même temps ne se marchent pas dessus.
- **Rien ne se perd faute de place** : un objet reçu sans place attend dans la zone d'attente du conteneur, jamais supprimé en silence. Voir [Comment SBE range les objets](#inventaire).
- **La vue d'un pion revient toujours** : une lampe éteinte ou un effet Aveugle terminé rend la vue d'origine telle quelle.

Pour les erreurs de réglage (une clé introuvable, une formule illisible), voir [Vérifier un modèle](#verifier).

## Un modèle partagé reste sans danger

Vous pouvez importer le modèle d'un autre MJ sans risque :

- **Les formules** sont calculées par SBE, jamais par le navigateur : elles ne lisent que vos clés et les fonctions de formule.
- **Le HTML, le SVG et le CSS** sont nettoyés : scripts, iframes et gestionnaires d'événements sont retirés.

## Ce qui est de l'immersion, pas un secret

L'identité des PNJ, les objets non identifiés et les langues brouillent ce que le joueur **voit**. Le texte d'origine arrive pourtant sur son ordinateur : un joueur qui fouille la console du navigateur peut le lire. C'est fait pour le jeu, pas pour cacher une information à un tricheur.
