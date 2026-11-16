**What it's for:** an **item** template has, on top of its components, **options** (at the top of the workshop) and fixed **tabs**. This page goes through them.

![An item template's workshop: options and tabs](img/en/atelier-objet.webp)

> A **character** template has no workshop options or tabs: to split its sheet into tabs, add a **Navigation bar** component.

## The template options

Click **Template options** to fold or unfold the block. An option with a ⚙ wheel has settings: check it, then click the wheel.

| Option | What it does |
|---|---|
| **Stackable** | Several identical copies make a single item with a quantity: 500 arrows is one "Arrows × 500" line. The wheel sets the **maximum per stack**: 100 cartridges in boxes of 30 make three full boxes and one of ten. |
| **Droppable on the scene** | Checked by default. Unchecked, items of this template are never put on the ground: neither by dragging them onto the map nor with "Drop on the ground". Handy for a spell, a skill or a curse. |
| **Visible to players** | Checked by default. Unchecked, only the GM sees items of this template: sheets, chests, ground, HUD, merchants' stalls. They **still count** in formulas: a hidden curse works without showing itself. |
| **Icon markers** | Small calculated marks on the icon of every carried item: a text ("12/15"), an icon, a gauge, pips, a darkened icon, a glow. |
| **Can be unidentified** | As long as a box of the item is unchecked, players see its unknown version (name, image, description). The GM always sees the real item. |
| **Inactive if…** | A formula read on the item. While it is true, the item stays in the inventory but no longer gives anything to its carrier. |
| **Scene object** | The item can be placed on the map: it becomes a token that keeps everything (values, state, contents). A double-click opens its **panel**. Checking this option adds the **Panel once placed** tab to the workshop. |

**Example — a magazine:** check **Stackable** (maximum 10 per stack), then **Icon markers** with the text `{bullets}/{capacity}`. Every carried magazine shows its remaining bullets on its icon.

## The workshop tabs

| Tab | What you build there |
|---|---|
| **Description** | The description text is written **on each item**. What you build here is shown **below it**: compatible ammunition, required tools… |
| **Media** | The **names** of the sounds and animations this template needs (example: `shot`). Each item then picks its own file behind each name: a rifle and a pistol don't sound the same. |
| **Effects** | **Granted effects**: as long as the item is equipped, or simply carried, its carrier has the effect. It leaves with the item. |
| **Panel once placed** | With the "Scene object" option: what a double-click on the placed item shows. |

## Your own tabs

The small **+** to the right of the tabs adds a tab of your own.

- **Rename**: type directly in the tab.
- 👁 **Visible to players**: struck through, only the GM sees the tab.
- **Funnel — Tab visible if**: a formula read on the item. False, the tab is not shown, not even to the GM. Example: `max_level >= 2` for a "Level 2" tab.
- 🗑 **Delete**: the tab and everything in it. You are told how many components go with it.

## Going further

Markers travel with the template's export, or on their own (an `sbe-reperes-….json` file, from their settings window).

Each marker has an optional condition, **Show if**: empty, it always shows. For the glow, rules are read in order and the first true one colors the icon: put the most serious one first.
