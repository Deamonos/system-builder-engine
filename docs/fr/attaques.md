**À quoi ça sert :** une arme, un sort, un coup de poing : tout ce qui frappe quelqu'un. SBE ne connaît ni parade, ni esquive, ni points de vie : vous lui dites quelles clés jouent quel rôle.

**Exemple :** une épée. Son bouton **Frapper** a une étape **Attaquer** : champ à jet `attaque`, profil **Mêlée**, dégâts `degats + carrier("force_bonus")`, portée `1`. Le joueur clique, vise un pion, la cible lance sa défense, et une seule carte du chat montre les deux jets et les dégâts.

## Le déroulé

1. **La cible** : le pion marqué avec T, sinon un clic sur un pion (un cercle montre la portée). Échap ou clic droit annule, sans rien dépenser.
2. **La portée** est vérifiée, en cases.
3. **La cible lance sa défense**, toute seule.
4. **Votre jet** est comparé à ce total. Égalité : touché. Un échec critique rate toujours, une réussite critique touche toujours.
5. **Touché** : les dégâts sont lancés, multipliés en cas de critique et par le nombre de coups, puis réduits par la protection de la cible contre ce type de dégâts.
6. **Une seule carte** : l'attaquant, la cible, leurs dés, les dégâts. Le MJ les applique tout de suite ; quand c'est un joueur, un bouton **Appliquer les dégâts** attend le MJ.

**Ordre conseillé des étapes :** Condition → **Attaquer** → Consommer. Annuler la visée ne coûte alors rien.

## Les réglages de l'étape

| Réglage | Exemple |
|---|---|
| **Champ à jet** | `attaque` : c'est le jet de ce champ qui part (sa formule, ses critiques). |
| **Profil d'attaque** | `Mêlée` : il apporte tout le reste (voir plus bas). |
| **Dégâts** | `2d6 + 3`, ou des clés : `degats + bonus`. |
| **Portée** (cases) | `portee` ; vide = illimitée. |
| **Coups** | `coups_rafale` : multiplie les dégâts, 1 par défaut. |

Le volet **Avancé** reprend tous les réglages du profil : une case remplie ici remplace celle du profil, pour cette arme seulement.

## Les règles de combat

Les **paramètres du système** → **Combat** → **Règles de combat** (la fenêtre **Manager du combat**) :

- **Clé qui encaisse les dégâts** : la jauge des points de vie de vos fiches.
- **Multiplicateur en critique** : ×2 par défaut.
- **Types de dégâts** : pour chaque type, la clé de la cible qui le réduit. `Feu` → `armure_feu`. Un type absent de la liste n'est pas réduit.
- **Messages d'attaque** : qui voit la carte (tout le monde, le MJ, aveugle, le lanceur, ses cibles et le MJ…). **Détail complet au MJ** : les autres voient une carte courte.
- **Initiative** : voir [Initiative et carrousel](#initiative).

## Les profils d'attaque

Réglés une fois dans les règles de combat, choisis par les armes. Changer le profil change toutes ses armes.

![Le profil « Mêlée » de la démo dans le manager du combat : défense, type de dégâts, sauvegarde, zone, localisation, dégâts non létaux](img/profil-attaque.webp)

| Réglage | Ce qu'il fait |
|---|---|
| **Défense de la cible** | Une formule lue sur la fiche de la **cible** : `1d20 + esquive + armure`. Sans défense, la cible ne lance rien. |
| **Ignorer la défense si** | Une formule lue sur la cible : `hasEffect("etourdi")`. |
| **Touche toujours si** | Une formule lue sur l'arme (une case `touche_toujours`) : ni défense ni jet. |
| **Imparable** | Non, **Demander à chaque attaque**, ou **Toujours** : la cible ne fait aucun jet. |
| **Type de dégâts** | `Feu`, ou une formule (le type de la munition chargée). |
| **Recul** | La cible touchée est repoussée de N cases ; un mur l'arrête. |
| **Dégâts non létaux** | **Si** (souvent une case de la fenêtre de jet), **Valeur gardée** (`1`), **Effet posé** en l'atteignant (`inconscient`). |
| **Zone, sauvegarde, localisation** | Voir [Les attaques de zone](#zones-attaque) et [La localisation des coups](#localisation). |

### La fenêtre de jet

- **Options de la fenêtre de jet** : des cases, nombres ou listes que le joueur règle avant de viser. Leur clé vaut ensuite dans toutes les formules du bouton (case cochée = 1). Exemple : une case `visee` et un bonus au jet `visee ? 2 : 0`. **Visible si** les fait apparaître selon les autres options ; **Minimum / Maximum** bornent un nombre.
- **Aperçu** : des lignes « libellé : texte » recalculées pendant que le joueur coche. `{degats} × {rafale ? 3 : 1}` montre les dégâts avant de lancer. `mod` vaut le modificateur, `adv` l'avantage (1, −1 ou 0).

## Corriger les dégâts (MJ)

Sous chaque carte d'attaque, un volet réservé au MJ :

- Par cible touchée : **Annuler**, **½**, **×1**, **×2**, **En soin**. Seule la différence avec ce qui est déjà appliqué est écrite.
- **Appliquer aux jetons sélectionnés** : les mêmes dégâts, chacun avec sa propre protection.

## Après l'attaque

Les étapes suivantes du bouton lisent `isHit` (touché), `isCrit`, `isFumble`, `rollTotal` et `hitZone`. Exemple : **Jouer un média** `impact` seulement si `isHit`. Les sons et animations de l'attaque elle-même se règlent dans l'étape : voir [Les médias](#medias).

## Pour aller plus loin

Une attaque lancée depuis un objet posé sur la scène (une tourelle) part de son pion. Voir [Les objets de scène](#objets-scene).
