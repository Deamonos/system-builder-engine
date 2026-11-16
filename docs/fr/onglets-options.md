**À quoi ça sert :** un modèle d'**objet** a, en plus des composants, des **options** (en tête de l'atelier) et des **onglets** fixes. Cette page les passe en revue.

![L'atelier d'un modèle d'objet : options et onglets](img/atelier-objet.webp)

> Un modèle de **personnage** n'a ni options ni onglets d'atelier : pour découper sa fiche en onglets, posez un composant **Barre de navigation**.

## Les options du modèle

Cliquez sur **Options du modèle** pour déplier ou replier le bloc. Une option avec une roue ⚙ a des réglages : cochez-la, puis cliquez sur la roue.

| Option | Ce qu'elle fait |
|---|---|
| **Empilable** | Plusieurs exemplaires identiques ne font qu'un objet avec une quantité : 500 flèches, c'est une ligne « Flèches × 500 ». La roue règle le **maximum par pile** : 100 cartouches en boîtes de 30 font trois boîtes pleines et une de dix. |
| **Déposable sur la scène** | Cochée par défaut. Décochée, les objets de ce modèle ne se posent jamais au sol : ni en les glissant sur la carte, ni par « Poser au sol ». Pratique pour un sort, une compétence ou une malédiction. |
| **Visible des joueurs** | Cochée par défaut. Décochée, seul le MJ voit les objets de ce modèle : fiches, coffres, sol, HUD, étals des marchands. Ils **comptent quand même** dans les formules : une malédiction cachée agit sans se montrer. |
| **Repères sur l'icône** | Des petites marques calculées sur l'icône de chaque objet porté : un texte (« 12/15 »), une icône, une jauge, des pastilles, une icône assombrie, un halo. |
| **Peut être non identifié** | Tant qu'une case de l'objet n'est pas cochée, les joueurs voient sa version inconnue (nom, image, description). Le MJ voit toujours le vrai objet. |
| **Inactif si…** | Une formule lue sur l'objet. Tant qu'elle est vraie, l'objet reste dans l'inventaire mais n'apporte plus rien à son porteur. |
| **Objet de scène** | L'objet peut être posé sur la carte : il devient un pion qui garde tout (valeurs, état, contenu). Un double-clic ouvre son **panneau**. Cocher cette option ajoute l'onglet **Panneau une fois posé** à l'atelier. |

**Exemple — un chargeur :** cochez **Empilable** (maximum 10 par pile), puis **Repères sur l'icône** avec le texte `{balles}/{capacite}`. Chaque chargeur porté affiche ses balles restantes sur son icône.

## Les onglets de l'atelier

| Onglet | Ce qu'on y construit |
|---|---|
| **Description** | Le texte de description s'écrit **sur chaque objet**. Ce que vous construisez ici s'affiche **en dessous** : munitions compatibles, outils requis… |
| **Médias** | Les **noms** des sons et animations que ce modèle réclame (exemple : `tir`). Chaque objet choisit ensuite son propre fichier derrière chaque nom : un fusil et un pistolet ne sonnent pas pareil. |
| **Effets** | Les **effets conférés** : tant que l'objet est équipé, ou simplement porté, son porteur a l'effet. Il part avec l'objet. |
| **Panneau une fois posé** | Avec l'option « Objet de scène » : ce que montre le double-clic sur l'objet posé. |

## Vos propres onglets

Le petit **+** à droite des onglets ajoute un onglet à vous.

- **Renommer** : écrivez directement dans l'onglet.
- 👁 **Visible des joueurs** : barré, seul le MJ voit l'onglet.
- **Entonnoir — Onglet visible si** : une formule lue sur l'objet. Fausse, l'onglet ne s'affiche pas, même au MJ. Exemple : `niveau_max >= 2` pour un onglet « Niveau 2 ».
- 🗑 **Supprimer** : l'onglet et tout ce qu'il contient. On vous dit combien de composants partent avec.

## Pour aller plus loin

Les repères voyagent avec l'export du modèle, ou seuls (fichier `sbe-reperes-….json`, depuis leur fenêtre de réglage).

Chaque repère a une condition facultative, **Afficher si** : vide, il s'affiche toujours. Pour le halo, les règles se lisent dans l'ordre et la première vraie colore l'icône : mettez la plus grave en premier.
