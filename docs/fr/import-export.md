**À quoi ça sert :** emporter un modèle d'un monde à l'autre, le partager avec un autre MJ, ou appliquer une version corrigée à un modèle déjà en jeu. Ce qui voyage, c'est la **structure** : les composants et leurs réglages, jamais les valeurs des fiches.

**Exemple :** vous avez construit un modèle « Arme » dans votre monde de test. **Exporter la structure** donne un fichier `.json`. Dans le monde de campagne, **Importer un modèle** le recrée tel quel.

## Exporter un modèle

Dans l'atelier, en tête : **Exporter la structure**. Le fichier contient :

- tous les composants, avec leurs réglages, leur style, leur CSS et leur place ;
- les onglets de l'atelier, les **médias déclarés** (les noms, pas les fichiers), les **effets conférés** ;
- les options du modèle (empilable, repères sur l'icône, inactif si…) ;
- le **thème du modèle**, son **HUD** et ses **barres de jetons**.

Rien n'est écrit sur les objets du monde ni sur les fiches : pas de valeurs, pas de personnages.

## Créer un modèle depuis un fichier

Onglet **Acteurs** ou **Objets** de la barre latérale → **Importer un modèle**. Un modèle par fichier, plusieurs fichiers à la fois. Vous pouvez aussi glisser les fichiers sur l'onglet, ou sur un dossier pour les y ranger.

## Importer dans un modèle existant

Dans l'atelier : **Importer une structure**, puis un fichier ou un JSON collé. SBE demande quoi faire :

![La question à l'import : Mettre à jour, ou Remplacer toute la structure](img/import-modes.webp)

| Mode | Ce qu'il fait |
|---|---|
| **Mettre à jour** | Un composant du fichier dont la clé existe déjà prend les réglages, le style et la place du fichier. Les nouveaux sont ajoutés. Le reste du modèle ne bouge pas, sauf dans un conteneur que le fichier décrit : ce qu'il ne contient plus en est retiré. |
| **Remplacer toute la structure** | Le modèle devient exactement le fichier ; ce qu'il ne mentionne pas est retiré. Une confirmation le rappelle. Pratique pour revenir à une version enregistrée. |

**Dans les deux cas, les fiches gardent leurs valeurs**, rangées par clé. C'est la **clé** qui fait l'identité d'un composant : renommer une clé dans le fichier, c'est un autre composant.

### Le compte rendu

Avant d'écrire quoi que ce soit, SBE montre un compte rendu, et attend votre **Oui** : combien de composants seront ajoutés, mis à jour ou retirés, ce qui changera en plus (le thème du modèle, son HUD…), et ce qui est **écarté**, avec la raison :

- un type de composant inconnu ;
- une clé invalide, réservée par le moteur, ou en double dans le fichier ;
- un composant Quantité sur un modèle de personnage.

Un conteneur écarté emporte son contenu, et c'est dit.

## Pour aller plus loin

Un fichier peut demander où poser un composant dans un modèle existant : dans un cadre, une colonne ou un onglet, avant ou après une autre clé. Utile pour livrer un « morceau » de fiche à brancher dans le modèle d'un autre MJ. Introuvable, l'emplacement demandé est remplacé par le bas du modèle, et le compte rendu le signale.
