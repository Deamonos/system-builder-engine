**What it's for:** making your game's items from an item template. The "Weapon" template draws the sheet; "Short sword", "Longbow" and "Axe" are **world items** built on it, each with its own values.

**Example:** the "Weapon" template has `damage`, `range`, `price`. The "Short sword" world item sets `1d6`, `1`, `10`.

## Creating a world item

1. **Items** tab of the sidebar → **Create an item**.
2. **What to create?**: **Item**.
3. **From which template?**: choose the template, for example "Weapon (item)".
4. **Name**: empty, the item takes the template's name.

The item opens on its sheet: fill in its values, image and description.

## A world item's sheet

Folder tabs. The first row has the system's tabs:

| Tab | What's in it |
|---|---|
| **Description** | The item's text, then what the template builds below it (compatible ammo…). |
| **Media** | Its sounds and animations. See [An item's media](#medias). GM only. |
| **Effects** | The effects it gives. See [Item effects](#effets-objets). |
| **Light**, **Zone**, **Scene** | Depending on the options: an item that gives light, leaves a zone, or can be placed on the map. |

The second row has your template's tabs.

## Copies and propagation

When a world item goes into an inventory, a chest or a stall, it is a **copy** that goes there. The copy keeps a link to its world item.

Change a value on the world item: SBE opens the **Propagate "…"?** window.

- **What changes**: each changed value, with its new value.
- **Copies concerned**: who holds them (the characters, the **World**).
- **Propagate (N)** carries the change over; **Do not propagate** keeps it for the world item alone.

![The propagation window: the Arrows' price goes to 10, one copy with Lys](img/en/propagation.webp)

What is never overwritten:

- the values of a component whose **Propagate to existing items** box is unchecked (a weapon's wear or condition);
- the name, image and description of a copy that customized them.

**Example:** the "Short sword" price goes from 10 to 12. The window offers the 4 existing short swords; their wear, specific to each one, doesn't move.

## When the template changes

Add a component to the template: the items built on it show it. An item that needs realigning shows **A newer version of the template is available**, with the **Reload** button: its values are kept, keys that no longer exist are removed.

## Deleting

- **A world item** with copies sitting in chests: SBE asks whether to delete them too. There is never an orphan copy.
- **A template**: SBE lists everything that depends on it (world items, carried items, who holds them) before deleting it all. What those items hold (a magazine's bullets) goes back into their carrier's inventory.
- **Orphaned items**: when the world loads, SBE flags items whose template no longer exists, and offers to delete them.

## Going further

Exporting a template takes its **structure** only, without the world items: for those, a Foundry compendium does the job very well. The why of templates, world items and copies: [The basic ideas](#idees).
