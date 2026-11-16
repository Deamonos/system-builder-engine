**À quoi ça sert :** suivre les quêtes de chaque groupe, distribuer les récompenses, et montrer aux joueurs où ils en sont.

**Exemple :** onglet **Journaux** → **Journal de quêtes**. Glissez le groupe à gauche, **+ Quête** « Les loups de la forêt », deux objectifs, 100 pièces au total, puis **Annoncer**. Les loups chassés : **Réussie**, la répartition s'ouvre, l'argent est distribué.

## Le journal

Créez un journal de type **Journal de quêtes**. À gauche, les **sections** : glissez un **groupe** (ses membres suivent) ou des personnages. Chaque joueur ne voit que les quêtes des sections de ses personnages. Le menu ⋮ de la fenêtre (MJ) → **Renommer le journal**.

**Onglets de quêtes** : en haut de l'onglet Quêtes, « Toutes » puis vos propres onglets (une communauté, une guilde, un pays…). Le **+** en crée un (nom, icône, masqué aux joueurs) ; au survol, le crayon le modifie et la corbeille le supprime, sans supprimer ses quêtes. Une quête choisit son onglet dans le champ **Onglet** ; créée pendant qu'un onglet est affiché, elle y est rangée. Un joueur ne voit que les onglets non masqués qui contiennent une de ses quêtes.

**Configuration** (onglet du journal, MJ) : les **stats de récompense et de pénalité** (clé du personnage, libellé, icône, ajouter / retirer / fixer), les pénalités oui ou non, les catégories, les **statuts** (les quatre de base se renomment, on en ajoute), les sons, la réussite automatique.

## Une quête

| Partie | Ce qu'on y met |
|---|---|
| **Donneur** et **lieu** | Un personnage, un nom ou anonyme ; une scène ou un journal glissé, ou un texte. |
| **Objectifs** | Des cases ou des compteurs, des sous-tâches ; facultatifs, cachés, échoués. Vert = rempli, rouge = échoué. |
| **Récompenses et pénalités** | Des valeurs, des objets du monde, des niveaux ; **par personne** ou **au total**. |
| **Échéance** | Un jour et une heure du calendrier. |

- **Cachée** : une nouvelle quête l'est. Elle apparaît avec l'œil, **Annoncer**, l'étape **Quête** d'un bouton, ou **Apparaît si** (une formule vraie pour un membre).
- **Fait si** (l'éclair d'un objectif) : une formule lue sur les membres, `carried("cle_rouge") >= 1`, ou sur une cible glissée, `pv <= 0`. L'objectif se coche tout seul.

![La quête « Les morts sans repos » de la démo : donneur, lieu, description, objectifs (case et compteur) et récompenses](img/quetes.webp)

## La fin d'une quête

**Réussie** (récompenses), **Échouée** (pénalités), **Annulée** (rien). Les récompenses « au total » ouvrent une fenêtre de répartition, préremplie à parts égales. Une carte récapitule. **Rouvrir** remet la quête en cours sans rien reprendre.

## Le suivi à l'écran

Le parchemin de la barre de gauche : les quêtes en cours, suivies par défaut (la punaise du journal les retire ou les remet). Chaque quête se replie.

## Pour aller plus loin

L'étape **Quête** d'un bouton donne une quête, fait avancer un objectif, la révèle ou change son statut : un parchemin trouvé qui lance la quête. Voir [Toutes les étapes](#etapes-liste).
