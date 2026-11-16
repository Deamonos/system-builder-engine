**À quoi ça sert :** qu'un objet ait sa voix. Un arc ne sonne pas comme une arbalète, une boule de feu n'a pas l'animation d'un éclair. Le modèle dit **quels** médias il faut ; chaque objet choisit **ses** fichiers.

**Exemple :** le modèle « Arme » de la démo déclare deux médias, `frappe` et `impact`. Un arc long y mettra un son de corde et une flèche qui file ; une hache, un souffle lourd et un choc.

## 1. Le modèle déclare les noms

Dans l'atelier du modèle d'objet, onglet **Médias** : **Ajouter un média**.

- Un **nom** : `tir`, `impact`, `boire`. Une minuscule pour commencer, puis minuscules, chiffres ou `_`.
- Une **aide** facultative, affichée au MJ : « À l'utilisation », « Quand la cible est touchée ».

## 2. L'objet du monde choisit ses fichiers

Sur la fiche de l'objet du monde, onglet **Médias** (le MJ seul le voit) : un bloc par nom déclaré, avec son aide.

![L'onglet Médias de l'arc long : le bloc « frappe », son son, son public, sa portée et son animation](img/medias-objet.webp)

### Le son

| Réglage | Ce qu'il fait |
|---|---|
| **Son** | Le fichier (ogg, mp3, wav…). |
| **Volume** | De 0 à 100 %. |
| **Qui entend** | **Toute la table**, **Le propriétaire de la fiche (et le MJ)**, ou **Le MJ seul**. |
| **Portée** | En unités de scène, ou **partout**. |
| **Atténuer** | Le volume baisse avec la distance, jusqu'au silence au bord de la portée. |

Le bouton ▶ de l'en-tête du bloc teste le son et l'animation.

### L'animation

Une image ou une vidéo (webm, mp4…) jouée sur la scène, avec le même public et la même portée que le son. Ses réglages apparaissent une fois le fichier choisi.

| Réglage | Ce qu'il fait |
|---|---|
| **Où** | **Sur le porteur**, **Sur la cible**, **Trajet porteur → cible** (elle s'étire du porteur à la cible), ou **Au point visé / d'impact**. |
| **Taille (cases)** | En trajet, c'est l'épaisseur. |
| **Durée d'une image (s)** | Pour une image fixe. |
| **Fond noir transparent** | Pour les vidéos d'effets sur fond noir : le noir disparaît. |
| **Rotation aléatoire** | Chaque lecture tourne au hasard : des impacts répétés ne se ressemblent pas. |

**Média suivant après (ms)** : pour le média joué en premier (le tir d'une attaque), le média de l'issue (touché, raté) part après ce délai. Vide = à la fin du son ; `0` = en même temps.

## 3. Un bouton les joue

- L'étape **Jouer un média** joue un nom déclaré : son, animation, ou les deux.
- L'étape **Attaquer** a ses propres cases : média du tir, du coup **touché**, **raté**, **critique**.

Voir [Toutes les étapes](#etapes-liste).

## Les exemplaires suivent

Les sons et animations d'un exemplaire sont ceux de son objet du monde. Réglez-les sur l'objet du monde : tous les exemplaires suivent.

## Pour aller plus loin

Un son qui ne sort pas ? SBE le dit : volume à 0 %, curseur **Interface** des réglages audio de Foundry à zéro, ou fichier illisible par le navigateur (réexportez-le en OGG, MP3 ou WAV PCM 16 bits).
