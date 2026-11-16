**À quoi ça sert :** calculer une valeur à partir des autres. Dans une formule, **vos clés sont les variables** : `force`, `pv`, `niveau`…

On écrit des formules partout : un nombre ou une jauge en mode calculé, un maximum, un « Visible si », une condition de bouton, le montant d'un effet, un seuil de critique…

## Exemples

```
force + force_bonus
ceil((agilite + esprit) / 2)
pv <= 0 ? "Mort" : "Vivant"
maxOf("pv") > 0 ? round(pv / maxOf("pv") * 100) : 0
```

## Ce qu'on peut écrire

| Quoi | Comment |
|---|---|
| **Calculs** | `+  -  *  /` et les parenthèses. |
| **Comparaisons** | `<  <=  >  >=  ==  !=` |
| **Et, ou** | `&&` (et), `\|\|` (ou). Exemple : `blesse && pv < 10` |
| **Si… alors… sinon** | `condition ? valeur_si_vrai : valeur_si_faux`. Exemple : `niveau >= 5 ? 2 : 1` |
| **Arrondis** | `round` (au plus proche), `floor` (vers le bas), `ceil` (vers le haut) |
| **Autres calculs** | `min`, `max`, `abs`, `sqrt`, `pow`, `clamp(valeur, bas, haut)` |
| **Textes** | Entre guillemets : `taille == "Grande"`. Quelques méthodes sûres : `nom.includes("x")`… |

- Une **case à cocher** vaut `true` ou `false`.
- Une **liste déroulante** ou un **texte** vaut le texte choisi ou saisi.
- Les arguments d'une fonction se séparent par `,` ou `;`.

> Une clé du modèle qui porte le nom d'une fonction (une clé `max`, par exemple) passe avant la fonction. Évitez ces noms.

## Ce que SBE fait pour vous

- **L'ordre de calcul est automatique.** Une formule qui dépend d'une autre est calculée après elle. Une boucle (A dépend de B qui dépend de A) est signalée, et ne bloque rien.
- **Une clé inconnue est permise**, avec un avertissement du [vérificateur](#verifier) : elle vaut vide (ou 0) tant qu'elle n'existe pas.
- **Les apports sont comptés.** Les effets et l'équipement modifient vos clés sans jamais réécrire la valeur saisie : une formule lit toujours le total. Ordre : multiplier, puis ajouter, puis plafonner (au plus), puis plancher (au moins), puis remplacer.

## Des dés dans une formule

Dans une étape de bouton « Modifier un champ », des dégâts ou le montant d'un effet qui revient chaque tour, une formule peut **lancer des dés** :

```
2d6 + force
mort_vivant ? -1d6 : 1d6
```

Chaque dé est lancé, puis la formule est calculée.

> Les champs **calculés** de la fiche ne lancent jamais de dés : leur valeur doit rester la même d'un affichage à l'autre.

## Sécurité

Une formule est calculée par l'interpréteur de SBE, jamais exécutée par le navigateur. Elle ne lit que vos clés, les fonctions de formule et quelques méthodes sûres des textes et des listes. **Un modèle importé ne peut rien exécuter d'autre.**

## Et ensuite ?

- Toutes les fonctions (inventaire, effets, calendrier…) : [Les fonctions de formule](#fonctions).
- Chercher une valeur dans un tableau : [Les tables de correspondance](#tables-correspondance).
