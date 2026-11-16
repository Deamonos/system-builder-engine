**What it's for:** seeing SBE in action on a ready-to-play game, then opening its templates to understand how everything is set up.

Brumeval is a small village built **only with SBE's screens**, without a line of code: four heroes, villagers, creatures, a map with its doors, its chest, its trap and its merchant, a guide and a quest log.

![The demo window](img/en/demo-fenetre.webp)

## Installing the demo

1. **Settings** tab of the sidebar → **Game Settings** → tab **SBE — System Builder Engine** → **Brumeval demo**. The window also opens on its own at the end of the "Discover SBE" guided tour.
2. Click **Install the demo**.
3. If you have already changed some system settings (effects, currencies, calendar…), a window lists them: **check the ones the demo may replace**. An unchecked setting stays yours, but the part of the demo that uses it may then misbehave.
4. The Brumeval scene is shown and the **demo guide** opens.

> The demo installs in Foundry's language: in French, or in English for any other language.

## What you will find

| Where | What it shows |
|---|---|
| **The four heroes** (Elara, Brann, Lys, Aldric) | Sheets with tabs, gauges, rolls on click, spells, levels and talents, a spatial-grid backpack |
| **The inn** | The quest log, a token's quick menu (right-click) |
| **The square** | A stall placed on the map: a merchant, with a purse and change given |
| **The forge** | A character who is also a merchant; haggling; equipment that changes the sheet's values |
| **The lower house** | A locked door, a lever linked to a door, a chest |
| **The field** | Combat, blood tracks, hidden wolf tracks |
| **The bridge** | A hidden trap that perception can reveal |
| **The crypt** | Area spells, a spell that only targets the undead, a loot table |

The demo guide describes this tour step by step. Give each player a hero (sheet permissions) and follow along.

## Looking under the hood

Everything the demo does is set up in the windows you will use yourself:

- open a **template** ("Demo — Models" folders of actors and items) to see how a sheet is built;
- open the **system settings** to see the effects, combat rules, merchants, calendar…
- hover over a sheet component: its **tooltip** says what it shows.

## Removing the demo

Same path: **Game Settings** → **SBE — System Builder Engine** → **Brumeval demo** → **Remove the demo**.

- Everything the demo brought is deleted: scene, sheets, items, journals, table, folders. **This is final.**
- The settings replaced at install **get their previous value back**.
- Your own documents are not touched.

> Want to keep a template from the demo? Export it before removing the demo ("Export structure" at the top of the workshop), then import it afterwards.
