# Police d'émojis embarquée — drapeaux

`sbe-emoji-flags-1.woff2` et `sbe-emoji-flags-2.woff2` sont deux
**sous-ensembles** de Noto Color Emoji (Google), sous licence SIL Open
Font License 1.1 — voir `LICENSE-Noto-Color-Emoji.txt`.

## Pourquoi

La police d'émojis de Windows (*Segoe UI Emoji*) ne contient AUCUN
drapeau de pays : Microsoft ne les a jamais dessinés. Le navigateur
retombe alors sur les deux lettres du code — « FR » au lieu du drapeau.

## ⚠ Variante COLR obligatoire

Une police d'émojis en couleur existe en plusieurs formats. Foundry
tourne sur Chromium, qui lit **COLR** et **CBDT** mais PAS la table
`SVG `. Une police OT-SVG se charge sans erreur, puis Chromium retombe
sur les contours noirs — vides dans ces polices — et l'on obtient des
cases BLANCHES. Symptôme trompeur : la police est bien téléchargée.

Les fichiers présents ici sont la variante **COLR** (paquet
`@infolektuell/noto-color-emoji`, pensé pour Chrome et Edge). En cas de
remplacement, vérifier la présence de la table `COLR` :

```
python3 -c "from fontTools.ttLib import TTFont; \
  print([t for t in ('COLR','CBDT','SVG ') if t in TTFont('fichier.woff2')])"
```

## Contenu

| Fichier | Contenu | Poids |
|---|---|---|
| `sbe-emoji-flags-1.woff2` | indicateurs régionaux `U+1F1E6–1F1FF` : 258 drapeaux de pays | 687 Ko |
| `sbe-emoji-flags-2.woff2` | drapeaux à balises (Écosse, Pays de Galles…) et composés (arc-en-ciel, pirate) | 15 Ko |

RIEN d'autre n'est embarqué : la `unicode-range` de chaque `@font-face`
limite le téléchargement à ces seuls caractères. Tous les autres émojis
restent rendus par la police du système, et les fichiers ne sont pas
chargés si la page n'affiche aucun drapeau.
