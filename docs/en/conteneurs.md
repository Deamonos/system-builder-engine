**What it's for:** a bag, an inventory, a spell list, a list of required tools. The container stores **several** items and displays them your way.

**Example:** a container with the key `bag`, **Display type** "Grid (cells)", 8 columns. With no filter, it accepts everything.

## What the container holds

- **Carried items (inventory)**: the character's bag.
- **References to world items (list)**: nothing is carried or moved, items are cited. Example: a weapon's "Compatible ammo" list, or a recipe's "Required tools".

The **filter** is the same as for [slots](#slots) (by template, tag, key, refused tags). But unlike the slot, **a container without a filter accepts everything**.

## Display types

| Display | What it shows |
|---|---|
| **List (columns)** | One row per item, with the **columns** of your choice: one item key per column (weight, price, ammo…). |
| **Grid (cells)** | One square cell per item or per stack, with the icon and the quantity as a badge. |
| **Spatial grid** | Each item takes up its shape in cells. See [The spatial grid](#grille-spatiale). |
| **Cards** (reference lists) | Large icon, full name, and a "+" cell when empty. |
| **Cards** (carried items) | One card per item, like a skill card: chips, buttons, folding text. |

### The grid

- **Columns**: a number, or empty for **auto** (as many as the width allows).
- **Rows**: empty = **unlimited**. With a number, the grid refuses a new item when it is full.
- **Cell size** (px) and **Show the name under the icon**.
- **The order** is chosen on the sheet, with the three buttons at the top of the grid: by name from A to Z, from Z to A, or **manual** (the item stays in the cell where it is dropped, and swaps places when dropped on a taken cell).

### Cards (carried items)

Each item becomes a small card:

- **Header**: icon and name. The **columns** choose their place: **chip** under the name, **box on the right** or **label on the right**. Each column has a **text** (`{{key}}`, `{{= formula}}`), an **only if** condition, and a **tone** (neutral, cost in red, increase in amber, info in blue, accent).
- **Gauge as dots**: a gauge of the item at the bottom of the card (charges, for example). At zero, the card fades.
- **The item's buttons**: those offered outside its sheet.
- **Locked if**: a formula read on the item; when true, the card is greyed out with a padlock and its buttons are disabled.
- **Folding text**: an arrow unfolds the description (or another text, chosen by a formula).

**Example:** a chip `-{{mana_cost}} MP`, only if `mana_cost > 0`, tone "Cost".

## Sorting

**Item sorting** (list, grid and cards):

- **None**: a plain list.
- **By a key**: automatic sections based on the value of a key (category, type…), with sub-sections and an icon per value.
- **Hand-written categories**: each with its filter (tag, key present, key = value, item template, or "everything else").

**Do not group identical items**: by default, several copies of the same item share one folding row. Checked, one row per item.

## Reference list settings

- **Mirror of list**: the list shows the contents of another reference list, read-only. Nothing to fill in twice.
- **Reverse list**: the world items that cite **this** item in one of their lists. Example: on a recipe, the tools that allow it.
- **Players: only what they own**: a player only sees the items their character carries a copy of.
- **Send with the description to chat**: the list follows the description when the item is shown in chat.

## Other settings

- **Items stored here are equipped** (carried items): everything in this container counts as equipped, as in a slot ("when equipped" effects, light, equipped / removed triggers, small HUD buttons). Example: an "Equipped" grid on a creature sheet, instead of slots.
- **Only one copy of each item on the sheet**: a duplicate is refused, wherever it is stored.
- **Editable by players**: unchecked, a player can neither drop nor remove.
- **Accepts stacks**, **Maximum quantity**, **Icon size**.

## Going further

`carried("weight", "bag")` adds up a key over the contents of the `bag` container, and `carriedCount("bag")` counts its items. See [Formula functions](#fonctions).
