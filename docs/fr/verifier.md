**À quoi ça sert :** une clé sert à plein d'endroits (formules, effets, HUD, réglages de combat, coffres…). Le vérificateur les connaît tous : il signale ce qui ne marche pas, et renomme une clé partout d'un coup.

## Vérifier

Deux façons de lancer la vérification :

- **Un modèle** : menu ⋮ de son atelier → **Vérifier le modèle**. Il vérifie ce modèle et les réglages qui lisent ses clés.
- **Tout le monde** : paramètres du système → **Vérifier les modèles** → bouton **Vérifier**.

![Le rapport du vérificateur](img/verifier-rapport.webp)

Le rapport range les problèmes **par endroit**. Le bouton à droite d'un groupe ouvre la fenêtre concernée.

| Niveau | Ce que ça veut dire |
|---|---|
| **Erreur** | Ce réglage ne peut pas marcher : clé introuvable, effet ou bouton introuvable, formule illisible. |
| **Avertissement** | Une formule lit une clé qu'aucun modèle n'a : elle vaudra 0 ou vide. |

**Exemple :** la formule `force + agilite` alors qu'aucun modèle n'a de clé `agilite` donne un avertissement. Ajoutez le composant `agilite`, ou corrigez la formule, puis cliquez sur **Revérifier**.

### Au chargement du monde

Quand le MJ ouvre le monde, le rapport s'ouvre tout seul s'il y a des problèmes.

- Un problème voulu ? Cochez **Ne plus m'avertir pour ces problèmes**.
- Pour les réactiver : ouvrez le rapport global (paramètres du système → **Vérifier**), puis **Avertir à nouveau pour tout**.

## Renommer une clé

1. Ouvrez le composant (✏) et changez sa **clé**.
2. **Valider** : avant d'enregistrer quoi que ce soit, la fenêtre **Renommer une clé** s'ouvre.

![La fenêtre « Renommer une clé »](img/renommer-cle.webp)

Elle montre :

- **ce qui utilise la clé** : formules, textes `{{clé}}`, étapes des boutons, effets, HUD, réglages des outils, objets, portes, coffres, barres des jetons… ;
- **les autres modèles** qui ont aussi cette clé, cochés. Cochés, ils sont renommés eux aussi. Décochés, ils gardent l'ancienne clé, et les réglages communs (effets, HUD, outils) ne les liront plus. Un modèle qui a déjà la nouvelle clé est grisé.

Puis :

- **Renommer partout** : les valeurs déjà saisies suivent la nouvelle clé (fiches, objets, objets portés, jetons, compendiums non verrouillés), puis tout ce qui l'utilise est mis à jour.
- **Annuler** : rien n'est écrit, la fenêtre du composant reste ouverte.

**Exemple :** renommer `force` en `vigueur` change aussi la formule `force + agilite` en `vigueur + agilite`, et Lys garde sa valeur 10.

## Pour aller plus loin

- Les **sous-clés** suivent : `pv_max`, `pv_temp`…, comme `carried("pv")`, `carrier("pv")` et `self_pv` dans un filtre « Choisir un objet ».
- Un **compendium verrouillé** n'est pas modifié : il est signalé.
- Le **calendrier** est vérifié aussi : une étape Météo, Saison ou Lune dont la clé n'existe plus est une erreur. Changer une clé dans l'éditeur du calendrier met à jour les étapes qui l'utilisent.
