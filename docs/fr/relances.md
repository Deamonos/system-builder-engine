**À quoi ça sert :** améliorer un jet après coup — le relancer, ajouter un dé ou un bonus — gratuitement, ou en payant une ressource de la fiche (chance, héroïsme, atout…).

**Où :** dans l'atelier, crayon du champ qui a un jet → volet **Après le jet : relances et bonus**. Chaque jet a ses propres choix.

**Exemple :** un point de chance permet de relancer. Ressource `chance`, une action **Relancer tout**, libellé « Point de chance », coût `1`, garder **le meilleur**. Après le jet, le bouton « Point de chance » apparaît sur la carte du chat ; un clic relance, retire 1 point de chance et met la carte à jour.

![La carte du jet, avec le bouton de relance et la ressource restante](img/carte-relance.webp)

## Les réglages

| Réglage | Ce qu'il fait |
|---|---|
| **Ressource** | La clé de la fiche qui paie (pour une arme : le personnage qui la porte). **Vide = gratuit** : aucun coût n'est affiché ni retiré. |
| **Utilisations par jet** | Combien d'actions en tout sur un même jet (1 par défaut, formule possible). |
| **Qui peut cliquer** | Le joueur et le MJ, le joueur seul, ou le MJ seul. |

## Les actions

Ajoutez autant d'actions que vous voulez (**+ Action**). Sans action, rien ne se passe après le jet.

| Action | Ce qu'elle fait |
|---|---|
| **Relancer tout** | Un nouveau jet. **Garder** : le meilleur, ou le nouveau. |
| **Relancer les dés ratés** | Pour une réserve de dés comptés en succès (`6d6cs>=5`) : seuls les dés sans succès sont relancés. |
| **Ajouter des dés** | **Valeur** : `1d6`. |
| **Ajouter un bonus** | **Valeur** : `2` (formule possible). |
| **Relancer les dégâts** | Sur le champ à jet d'une arme : le jet de dégâts d'une attaque. Garder le meilleur ou le nouveau. |

Chaque action a son **Libellé** (le texte du bouton), son **Coût** (formule ; 1 par défaut avec une ressource) et sa **Limite** (combien de fois sur un même jet ; vide = la limite du jet).

## Quand les boutons apparaissent

- **Sur la carte du jet**, pour un jet qui n'a pas de suite : un clic sur un libellé, une valeur du HUD, une demande de jet simple, la dernière étape d'un bouton. La carte se met à jour : l'ancien jet barré, le nouveau résultat, la ressource dépensée, sans nouveau message.
- **Dans une petite fenêtre juste après les dés**, pour un jet suivi d'autre chose : une étape au milieu d'un bouton, une attaque de zone, un verrou, une langue à déchiffrer, une piste, un piège à désamorcer, une opposition. La suite se joue avec le résultat gardé (**Garder ce résultat**).
- **Jamais** pour les jets automatiques : résistance à un effet, initiative, détection d'un piège en passant.

## Pour aller plus loin : les attaques

- **Attaque relancée depuis sa carte** : la défense déjà lancée est gardée. Raté → touché : les dégâts sont lancés et appliqués. Touché → raté : les dégâts appliqués sont rendus.
- **Relancer les dégâts** : un bouton sous les dégâts de chaque cible, zones comprises. Déjà appliqués par le MJ, l'écart est corrigé tout de suite ; relancés par un joueur, le MJ a un bouton **Appliquer** pour corriger d'un clic.
