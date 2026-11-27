<div align="center">

<img src="assets/sbe-logo.svg" alt="SBE logo" width="200">

# SBE — System Builder Engine

**Build your own tabletop RPG system in Foundry VTT — no code required.**<br>
**Créez votre propre système de jeu de rôle dans Foundry VTT — sans coder.**

[![Foundry v14](https://img.shields.io/badge/Foundry-v14-ff6400?logo=foundryvirtualtabletop&logoColor=white)](https://foundryvtt.com)
[![Release](https://img.shields.io/github/v/release/Deamonos/system-builder-engine?label=release&color=245d9b)](https://github.com/Deamonos/system-builder-engine/releases/latest)
[![Last commit](https://img.shields.io/github/last-commit/Deamonos/system-builder-engine?label=last%20commit)](https://github.com/Deamonos/system-builder-engine/commits)
[![Latest release](https://img.shields.io/github/release-date/Deamonos/system-builder-engine?label=latest%20release)](https://github.com/Deamonos/system-builder-engine/releases/latest)
<br>
[![Discord](https://img.shields.io/badge/Discord-join-5865F2?logo=discord&logoColor=white)](https://discord.gg/kUY28T8rHj)
[![Roadmap](https://img.shields.io/badge/Roadmap-SBE-163d6b?logo=googlemaps&logoColor=white)](https://claude.ai/artifact/HWMjKciPgGM8A1DWJVFKNi)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Languages](https://img.shields.io/badge/languages-EN%20%7C%20FR-informational)](#)
[![Built with Claude](https://img.shields.io/badge/built%20with-Claude%20AI-D97757?logo=anthropic&logoColor=white)](https://claude.ai)

**🇬🇧 [English](#-english)** · **🇫🇷 [Français](#-français)**

</div>

---

## 🇬🇧 English

### About SBE

**SBE (System Builder Engine)** is a system for Foundry VTT v14 that lets you build your own tabletop RPG system — sheets, rules, mechanics and automations — without writing a single line of code.

You have your own game in mind, homemade rules, or a system no one has adapted yet? SBE ships **no game rules at all**: it gives you the tools to create them. Everything is done in windows, with buttons, lists and plain-language steps — no scripts, no macros, no programming.

**How it works**

1. **You design a template** in the workshop: you place the components of the sheet (values, gauges, lists, buttons, tabs…) where you want them, and choose how they look.
2. **You give it rules**: formulas that compute values, rolls launched with a click, buttons that chain actions (roll, check a condition, deal damage, apply an effect, play a sound).
3. **Characters and items are created from that template** and follow its changes: edit the template, every sheet updates.
4. **At the table**, SBE's modules take over: inventory, effects, combat, calendar and weather, quests, merchants, trades, locks, traps… Each one is optional and set up in its own window.

**Who is it for?** Game masters who want to play *their* game in Foundry VTT, exactly the way they imagined it, without depending on someone else's system or learning to code. Your templates can be exported and shared with other tables.

**The project**: SBE is designed by Deamonos and developed with the help of **Claude**, Anthropic's AI: Deamonos imagines the features, the mechanics and the look, tests everything at the table and decides; Claude writes the code and the documentation. The project grows with its community. Ideas, bug reports and creations are welcome on the Discord.

### Installation

In Foundry VTT: **Game Systems → Install System**, then paste this manifest URL:

```
https://github.com/Deamonos/system-builder-engine/releases/latest/download/system.json
```

Requires Foundry VTT **v14**.

### Getting started

- A guided tour, **Discover SBE**, starts the first time a GM opens a world. Other tours present each family of modules.
- The built-in documentation (French and English) opens from the book icon in window headers.
- A demo adventure (French and English) is included in the compendiums.

### Features

#### Build
- **Workshop**: design character and item sheets by placing components — text, numbers, checkboxes, lists, colors, images, gauges, tables, charts, tabs and columns.
- **Templates**: characters and items follow their template's changes; templates can be exported and imported as `.json` files.
- **Formulas**: values computed from other values, with functions and lookup tables.
- **Step buttons**: chain actions without code — rolls, conditions, damage, effects, sounds, messages.
- **Rolls**: click-to-roll values, critical thresholds, rerolls, roll requests sent to players.
- **Levels and talents**: progression rules, level sheets and talent trees.

#### Play
- **Inventory**: containers, carrying, stacking, equipment slots and a spatial grid.
- **Effects**: timed, stacking and periodic effects, applied by items or by the GM.
- **Combat**: attack profiles, hit locations, attack zones and templates, initiative, and a combat carousel.
- **The world**: calendar, clock, moons and weather; new day; quests; merchants and trades; chests and items on the ground; locks and keys; traps; traces; languages; vision modes.

#### Look
- Theme (dark or light, colors, fonts, textures), per-template themes, HUD, token bars, token looks and pause banner.

#### Tools
- History of actions with undo, a checker that finds broken references, setting exports, guided tours and help on hover.

### Links

- 🗺️ Roadmap: https://claude.ai/artifact/HWMjKciPgGM8A1DWJVFKNi
- 💬 Discord: https://discord.gg/kUY28T8rHj
- 🐞 Bug reports: [Issues](https://github.com/Deamonos/system-builder-engine/issues)

### License

[MIT](LICENSE): free to use, copy, modify and share, for any purpose; just keep the copyright notice and the license.

---

## 🇫🇷 Français

### À propos de SBE

**SBE (System Builder Engine)** est un système pour Foundry VTT v14 qui permet de construire son propre système de jeu de rôle — fiches, règles, mécaniques et automatisations — sans écrire une ligne de code.

Vous avez votre propre jeu en tête, des règles maison, ou un système que personne n'a encore adapté ? SBE ne fournit **aucune règle de jeu** : il vous donne les outils pour créer les vôtres. Tout se fait dans des fenêtres, avec des boutons, des listes et des étapes en langage clair — pas de script, pas de macro, pas de programmation.

**Comment ça marche**

1. **Vous dessinez un modèle** dans l'atelier : vous placez les composants de la fiche (valeurs, jauges, listes, boutons, onglets…) où vous voulez, et vous choisissez leur apparence.
2. **Vous lui donnez des règles** : des formules qui calculent les valeurs, des jets lancés d'un clic, des boutons qui enchaînent des actions (lancer un jet, vérifier une condition, infliger des dégâts, appliquer un effet, jouer un son).
3. **Les personnages et les objets sont créés depuis ce modèle** et suivent ses changements : modifiez le modèle, toutes les fiches se mettent à jour.
4. **À la table**, les modules de SBE prennent le relais : inventaire, effets, combat, calendrier et météo, quêtes, marchands, échanges, verrous, pièges… Chacun est facultatif et se règle dans sa propre fenêtre.

**Pour qui ?** Les MJ qui veulent jouer à *leur* jeu dans Foundry VTT, exactement comme ils l'ont imaginé, sans dépendre du système de quelqu'un d'autre ni apprendre à coder. Vos modèles s'exportent et se partagent avec d'autres tables.

**Le projet** : SBE est conçu par Deamonos et développé avec l'aide de **Claude**, l'IA d'Anthropic : Deamonos imagine les fonctionnalités, les mécaniques et l'apparence, teste tout en jeu et décide ; Claude écrit le code et la documentation. Le projet grandit avec sa communauté. Idées, signalements de bugs et créations sont les bienvenus sur le Discord.

### Installation

Dans Foundry VTT : **Systèmes de jeu → Installer un système**, puis collez cette adresse de manifeste :

```
https://github.com/Deamonos/system-builder-engine/releases/latest/download/system.json
```

Nécessite Foundry VTT **v14**.

### Pour commencer

- Une visite guidée, **Découvrir SBE**, se lance la première fois qu'un MJ ouvre un monde. D'autres visites présentent chaque famille de modules.
- La documentation intégrée (français et anglais) s'ouvre depuis l'icône de livre dans l'en-tête des fenêtres.
- Une aventure de démonstration (français et anglais) est fournie dans les compendiums.

### Fonctionnalités

#### Construire
- **Atelier** : dessinez les fiches de personnages et d'objets en plaçant des composants — textes, nombres, cases à cocher, listes, couleurs, images, jauges, tableaux, graphiques, onglets et colonnes.
- **Modèles** : les personnages et les objets suivent les changements de leur modèle ; les modèles s'exportent et s'importent en fichiers `.json`.
- **Formules** : des valeurs calculées à partir d'autres, avec des fonctions et des tables de correspondance.
- **Boutons à étapes** : enchaînez des actions sans code — jets, conditions, dégâts, effets, sons, messages.
- **Jets** : valeurs lancées d'un clic, seuils critiques, relances, demandes de jet envoyées aux joueurs.
- **Niveaux et talents** : règles de progression, fiches de niveaux et arbres de talents.

#### Jouer
- **Inventaire** : conteneurs, portage, empilement, emplacements d'équipement et grille spatiale.
- **Effets** : effets limités dans le temps, cumulables et périodiques, appliqués par les objets ou par le MJ.
- **Combat** : profils d'attaque, localisation des coups, zones et gabarits d'attaque, initiative et carrousel de combat.
- **Le monde** : calendrier, horloge, lunes et météo ; nouvelle journée ; quêtes ; marchands et échanges ; coffres et objets au sol ; verrous et clés ; pièges ; traces ; langues ; modes de vision.

#### Apparence
- Thème (sombre ou clair, couleurs, polices, textures), thème par modèle, HUD, barres de jetons, apparences des jetons et bannière de pause.

#### Outils
- Historique des actions avec annulation, vérificateur de références cassées, export des réglages, visites guidées et aide au survol.

### Liens

- 🗺️ Feuille de route : https://claude.ai/artifact/HWMjKciPgGM8A1DWJVFKNi
- 💬 Discord : https://discord.gg/kUY28T8rHj
- 🐞 Signaler un bug : [Issues](https://github.com/Deamonos/system-builder-engine/issues)

### Licence

[MIT](LICENSE) : libre d'utiliser, de copier, de modifier et de partager, pour tout usage ; il suffit de garder la mention de copyright et la licence.
