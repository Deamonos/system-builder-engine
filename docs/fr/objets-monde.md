**À quoi ça sert :** fabriquer les objets de votre jeu à partir d'un modèle d'objet. Le modèle « Arme » dessine la fiche ; « Épée courte », « Arc long » et « Hache » sont des **objets du monde** construits dessus, chacun avec ses valeurs.

**Exemple :** le modèle « Arme » a `degats`, `portee`, `prix`. L'objet du monde « Épée courte » met `1d6`, `1`, `10`.

## Créer un objet du monde

1. Onglet **Objets** de la barre latérale → **Créer un objet**.
2. **Que créer ?** : **Objet**.
3. **Depuis quel modèle ?** : choisissez le modèle, par exemple « Arme (objet) ».
4. **Nom** : vide, l'objet prend le nom du modèle.

L'objet s'ouvre sur sa fiche : remplissez ses valeurs, son image et sa description.

## La fiche d'un objet du monde

Des onglets en dossiers. La première ligne a les onglets du système :

| Onglet | Ce qu'on y trouve |
|---|---|
| **Description** | Le texte de l'objet, puis ce que le modèle construit en dessous (munitions compatibles…). |
| **Médias** | Ses sons et ses animations. Voir [Les médias d'un objet](#medias). MJ seulement. |
| **Effets** | Les effets qu'il donne. Voir [Les effets des objets](#effets-objets). |
| **Lumière**, **Zone**, **Scène** | Selon les options : un objet qui éclaire, qui laisse une zone, qui se pose sur la carte. |

La deuxième ligne a les onglets de votre modèle.

## Les exemplaires et la propagation

Quand un objet du monde arrive dans un inventaire, un coffre ou un étal, c'est un **exemplaire** qui y va. L'exemplaire garde un lien avec son objet du monde.

Changez une valeur sur l'objet du monde : SBE ouvre la fenêtre **Propager « … » ?**.

- **Ce qui change** : chaque valeur modifiée, avec sa nouvelle valeur.
- **Exemplaires concernés** : chez qui ils sont (les personnages, le **Monde**).
- **Propager (N)** reporte le changement ; **Ne pas propager** le garde pour l'objet du monde seul.

![La fenêtre de propagation : le prix des Flèches passe à 10, un exemplaire chez Lys](img/propagation.webp)

Ce qui n'est jamais écrasé :

- les valeurs d'un composant dont la case **Propager aux objets existants** est décochée (l'usure, l'état d'une arme) ;
- le nom, l'image et la description d'un exemplaire qui les a personnalisés.

**Exemple :** le prix de l'« Épée courte » passe de 10 à 12. La fenêtre propose les 4 épées courtes existantes ; leur usure, propre à chacune, ne bouge pas.

## Quand le modèle change

Ajoutez un composant au modèle : les objets construits dessus l'affichent. Un objet qui a besoin d'être recalé montre **Une version plus récente du modèle est disponible**, avec le bouton **Recharger** : ses valeurs sont conservées, les clés qui n'existent plus sont retirées.

## Supprimer

- **Un objet du monde** dont des exemplaires dorment dans des coffres : SBE demande s'il faut les supprimer aussi. Il n'y a jamais d'exemplaire orphelin.
- **Un modèle** : SBE liste tout ce qui en dépend (objets du monde, objets portés, chez qui) avant de tout supprimer. Ce que ces objets contiennent (les balles d'un chargeur) revient dans l'inventaire de leur porteur.
- **Objets orphelins** : au chargement du monde, SBE signale les objets dont le modèle n'existe plus, et propose de les supprimer.

## Pour aller plus loin

L'export d'un modèle emporte sa **structure** seule, sans les objets du monde : pour ceux-là, un compendium de Foundry fait très bien l'affaire. Le pourquoi du modèle, de l'objet du monde et de l'exemplaire : [Les idées de base](#idees).
