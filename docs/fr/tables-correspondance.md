**À quoi ça sert :** chercher une valeur dans un tableau, par plage. C'est utile pour ce qu'une formule exprime mal : des paliers, une échelle de dégâts, une table de blessures.

## Exemple : un bonus par palier

On veut : Force de 1 à 9 → bonus 0, de 10 à 14 → +1, de 15 à 19 → +2, 20 et plus → +3.

1. Ajoutez une **Table** de clé `paliers`, avec trois colonnes **verrouillées** : `de`, `a`, `bonus`.
2. Remplissez les lignes :

| de | a | bonus |
|---|---|---|
| 1 | 9 | 0 |
| 10 | 14 | 1 |
| 15 | 19 | 2 |
| 20 | 99 | 3 |

3. Dans la fenêtre de la table, cochez **Interroger cette table dans les formules**, puis choisissez les **colonnes de plage** : `de` → `a`.
4. Dans le champ calculé `force_bonus`, écrivez :

```
table("paliers"; force; "bonus")
```

Avec une force de 12, `force_bonus` vaut 1.

> Cochez **Masqué sur la fiche** sur la table pour la garder sans l'afficher.

## Les trois fonctions

| Fonction | Ce qu'elle rend |
|---|---|
| `table("clé"; valeur; "colonne")` | La colonne de la ligne dont la plage contient la valeur. |
| `tableX("clé"; valeur; "colonneCherchée"; "colonneRendue")` | Cherche la valeur dans une autre colonne que la plage, et rend une autre colonne. |
| `tableList("clé"; "colonne")` | Toutes les valeurs d'une colonne, à la suite. Un troisième argument choisit le séparateur. |

Les noms de la table et des colonnes s'écrivent entre guillemets ; les arguments se séparent par `;` ou `,`.

**Pour aller plus loin :** `table` accepte deux arguments de plus, `exact` (seulement une correspondance exacte) puis une valeur **par défaut** ; `tableX` accepte une valeur par défaut.

## Les plages

- La recherche compare la valeur aux deux **colonnes de plage** (basse → haute).
- **Plage haute vide** : la ligne ne vaut que pour la valeur exacte de la plage basse.
- **Hors de toute plage** : c'est la ligne la plus proche qui répond. Une force de 0 donne le bonus de la première ligne.

## Importer un tableau tout prêt (CSV)

Préparez votre tableau dans un tableur (Excel, LibreOffice, Google Sheets) et enregistrez-le en **CSV**. Dans la fenêtre de la table, **Importer** le charge : la première ligne donne le nom des colonnes. **Exporter** fait l'inverse.

> L'import **remplace** tout le contenu de la table.
