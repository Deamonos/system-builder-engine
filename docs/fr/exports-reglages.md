**À quoi ça sert :** savoir ce qui se partage, et où. Presque chaque réglage de SBE a ses boutons **Exporter** et **Importer** : on monte un système une fois, on le réutilise partout.

**Exemple :** pour lancer une nouvelle campagne avec vos règles, exportez vos modèles, vos effets, vos règles de combat et votre thème ; importez-les dans le nouveau monde.

## Ce qui s'exporte

| Quoi | Où |
|---|---|
| **Un modèle** (structure) | L'atelier : **Exporter la structure**. Voir [Partager un modèle](#import-export). |
| **Le thème** (général, info-bulles, chat) | Paramètres du système → **Configurer le thème** : tout, ou une partie. |
| **Le thème d'un modèle** | Atelier, menu ⋮ → **Thème du modèle**. |
| **Les effets** | Gestionnaire d'effets : **Exporter les effets (JSON)**. |
| **Les règles de combat** | Paramètres du système → **Règles de combat**. |
| **Les gabarits** | Paramètres du système → **Dessiner les gabarits**. |
| **Les corps** (localisation des coups) | Paramètres du système → **Corps**. |
| **Les barres de jetons** | Paramètres du système → **Barres de jetons** : toutes, ou une seule. |
| **Le HUD d'un modèle** | Atelier, menu ⋮ → **HUD du modèle**. |
| **Les repères sur l'icône** | Leur fenêtre de réglage, dans les options du modèle d'objet. |
| **Les calendriers** | Paramètres du système → **Régler le calendrier**. |
| **Les langues** | Paramètres du système → **Ouvrir les langues**. |
| **Les modes de vision** | Paramètres du système → **Ouvrir les modes de vision**. |
| **Le thème du carrousel de combat** | Paramètres du système → **Carrousel de combat**. |
| **Une table de correspondance** | En CSV, dans sa fenêtre de réglage. |

## À l'import

- Tout passe d'abord par un **contrôle** : un fichier qui n'est pas le bon export est refusé, avec un message clair.
- La plupart des imports **ajoutent** à ce qui existe ; certains proposent de **remplacer**. Rien n'est écrasé sans que ce soit dit.
- Après un import, **vérifiez puis enregistrez** : beaucoup de fenêtres montrent l'import avant de le garder.

## Ce qui ne s'exporte pas

- **Les valeurs** des fiches et des objets, ni les personnages et objets du monde eux-mêmes.
- **Les fichiers** (images, sons) : seuls leurs chemins voyagent. Copiez les fichiers dans le nouveau monde au même endroit.

## Pour aller plus loin

Gardez vos exports dans un dossier à vous, nommés par date : un modèle exporté avant une grosse modification, c'est un retour en arrière possible avec **Remplacer toute la structure**.
