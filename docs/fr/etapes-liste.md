**À quoi ça sert :** trouver l'étape qu'il vous faut. Dans l'atelier, le **?** à côté du type d'une étape redonne son explication complète.

## Décider et contrôler

| Étape | Ce qu'elle fait |
|---|---|
| **Condition** | Continue seulement si la formule est vraie ; sinon le bouton s'arrête et affiche le message. |
| **Si… alors… sinon…** | Un bloc : joue les étapes de « Alors » si la condition est vraie, sinon celles de « Sinon ». |
| **Selon le résultat du jet** | Un bloc : joue la branche du dernier jet ou de la dernière attaque (réussite critique, réussite, échec, échec critique). |
| **Demander** | Une fenêtre pose une ou plusieurs questions. Chaque réponse se lit ensuite sous le nom de sa question. Qui répond : celui qui agit, le MJ, ou le joueur de la première cible. |
| **Attendre** | Les étapes suivantes se font plus tard : des rounds en combat, des minutes hors combat. Une carte avec « Annuler » s'affiche. |

## Jets et combat

| Étape | Ce qu'elle fait |
|---|---|
| **Lancer un jet** | Lance le jet réglé sur un champ, de l'objet ou du porteur, avec une difficulté facultative (+ = plus dur). Voir [Les jets de dés](#jets). |
| **Attaquer** | Choisit la cible, vérifie la portée, lance la défense de la cible puis l'attaque, et calcule les dégâts selon les règles de combat. Une zone (cercle, cône, ligne, gabarit) touche plusieurs cibles. |
| **Choisir une cible** | Le joueur vise un personnage (jetons marqués avec T, sinon un clic). Portée, qui peut être visé (alliés, ennemis…), et « Seulement si » lu sur la cible. |
| **Jet de résistance** | Fait le jet de résistance d'un effet posé sur le personnage, avec avantage ou désavantage au choix. |
| **Que devient l'objet** | Pour un projectile récupérable : après l'attaque, un exemplaire va dans l'inventaire de la cible, au sol, ou disparaît, selon que l'attaque a touché ou raté. |

## Valeurs et effets

| Étape | Ce qu'elle fait |
|---|---|
| **Modifier un champ** | Remplacer, ajouter, retirer, ou donner des points temporaires, avec une formule (dés permis). Sur l'objet, le porteur, les cibles, l'objet choisi ou l'objet d'un slot. Ajouter et retirer restent dans les bornes du champ. |
| **Consommer** | Retire une quantité d'un champ de l'objet, d'un slot (les balles du chargeur), d'un champ du porteur (mana, endurance), ou de cet objet lui-même (la pile baisse). |
| **Effet** | Pose ou retire un effet, ou change ses cumuls (+1, −1), sur le porteur ou sur les cibles. |
| **Expérience / Niveau** | Donne ou retire de l'expérience ou des niveaux d'un composant Niveau. |

## Objets

| Étape | Ce qu'elle fait |
|---|---|
| **Choisir un objet** | Une fenêtre propose les objets qui passent un filtre : ceux que porte le personnage, ou ceux d'une liste de références (les recettes d'un outil). |
| **Retirer des objets** | Retire des objets de l'inventaire du porteur. S'il n'y en a pas assez, rien n'est retiré et le bouton s'arrête. **Vérifier seulement** contrôle sans rien retirer. |
| **Donner des objets** | Donne un objet du monde au porteur, ou celui que nomme une formule. Il est rangé dans l'inventaire ; sans place, il attend ; sans aucun conteneur, il tombe à ses pieds. |
| **Remplir un slot** | Recharge un slot depuis l'inventaire du porteur : une fenêtre propose la munition et la quantité. |
| **Vider un slot** | Rend tout le contenu du slot à l'inventaire du porteur. |
| **Utiliser l'objet d'un slot** | Lance un bouton de l'objet rangé dans un slot (Tirer, Recharger…), par le même personnage, sur les mêmes cibles. |
| **Table aléatoire** | Tire sur une table aléatoire de Foundry. Coché, un objet tiré est donné au porteur. |

## Scène, médias et monde

| Étape | Ce qu'elle fait |
|---|---|
| **Jouer un média** | Joue un son, une animation, ou les deux, déclarés dans l'onglet **Médias** du modèle. |
| **Poser sur la scène** | L'objet quitte l'inventaire et devient un objet de scène, visé avec un aperçu. Ou bien invoque des créatures. À mettre en dernier. |
| **Scène (porte, lumière, son…)** | Agit sur les éléments de la scène liés à un objet posé : ouvrir une porte, allumer une lumière, téléporter, désamorcer un piège… |
| **Envoyer un signal** | Envoie un nom libre au personnage qui agit, aux cibles, ou à toute la scène : leurs boutons réglés sur « Signal reçu » partent. |
| **Quête** | Donne une quête, fait avancer, révèle ou cache un objectif, change le statut. |
| **Temps**, **Météo**, **Saison**, **Lune** | Avancent le calendrier, ou imposent une météo, une saison, une phase de lune pendant une durée. Seulement si le calendrier est activé. |

## Pour aller plus loin

Les variables que les étapes se transmettent (`isSuccess`, `pickedName`, `tableResult`…) sont dans [Les étapes](#etapes).
