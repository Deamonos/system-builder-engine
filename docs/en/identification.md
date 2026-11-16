**What it's for:** items that keep their secret. A potion nobody recognizes, a sword whose curse is unknown, a skill that does nothing without the right class.

## Unidentified items

**Example:** a "Healing potion" that players see as a "Red vial", until someone tastes or analyzes it.

### On the template

**Can be unidentified** option, then its gear ⚙:

- **"Identified" key**: a box of the item. While it is unchecked, players see the unknown version.
- **Identifying one copy identifies all copies of the same item**: every "Red potion" vial is recognized as soon as one is, for every character.

### On the world item

The **⋮** menu of its sheet → **Identification options**:

- **Name seen by players**, **Image seen by players**, **Description seen by players**. Empty, the name is "Unknown item".
- **Make this item unknown to players**: checked, players see the unknown version.

Set on the world item, the unknown version applies to its copies.

### Identifying

- **The GM**: right click on the item in the inventory → **Identify**, or **Make unknown**.
- **A button** that checks the "identified" box: with an arcana roll, a skill, a spell.

The GM always sees the real item, with an **unidentified** badge.

**Example:** an **Analyze** button on the "Potion" template: **Roll** the carrier's `arcana`, then **Depending on the roll result** → **Success** → **Set a field**: `identified` = `1` on the item.

## Inactive items

The template's **Inactive if…** option: a formula read on the item. While it is true, the item stays in the inventory but **gives nothing** to its carrier: its values no longer count in `carried()`.

**Example:** a skill restricted to a class. `owns(allowed_classes, 1) == 0`: if the character has none of the classes in the list, the skill is inactive.

> `carriedCount()` still counts the item: it is there, it does nothing.

## Going further

A hidden item rather than an unknown one? Unchecking the **Visible to players** option hides every item of a template from players, but they still act. See [Template tabs and options](#onglets-options).
