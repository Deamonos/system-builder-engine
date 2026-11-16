**What it's for:** having an item give an effect. Enchanted armor while it is worn, a potion that blesses when drunk, a cursed sword as soon as it is equipped.

## On the template: granted effects

In an item template's workshop, **Effects** tab: **Add a granted effect**.

- **The effect**: its key in the effect manager, or `@key` to read the effect key on each item (a field of the item).
- **When equipped** (stored in a slot of the sheet, or in a container whose items are equipped) or **While carried**.
- **Only if**: a formula read on the item, for example a `lit` box. The effect is only granted while it is true.

The effect goes away with the item. An effect applied by hand is never removed.

**Example:** a "Ring" template with a dropdown field `power` (`blessed`, `rage`…) and a granted effect `@power`, **When equipped**. Each ring gives its own effect.

## On the world item: the Effects tab

A world item's sheet also has an **Effects** tab, in three parts.

### Given by the template

A reminder of the effects granted by its template. They are changed in the workshop.

### This item's own effects

Effects that only exist on this item, without cluttering the effect manager. **Add an own effect**: it takes the item's name and icon, and is set up like in the manager (duration, changes, phases, periodic effect…).

Each one says at the top **when** it is applied: **Never** (not automatic), **when equipped or while carried**, or when a **button** of the item is used, depending on the roll's outcome, on the carrier or on the targets. Everything is saved as you type.

Once on a character, an own effect keeps going even if the item is consumed: a drunk potion leaves its effect until the end.

### Effect manager effects: when to apply

**Rules** to apply an effect from the manager. **Add a rule**, then choose:

- the **effect**;
- **When equipped**, **While carried**, or **Button "…"**: as soon as the button is used;
- the **action**: apply, remove, +1 or −1 stack;
- for a button: the roll's **outcome** (**Always**, **On success**, **On failure**, **On critical success**, **On critical failure**), and **on the carrier** or **on the targets**;
- without a button: **Only if**, a formula read on the item.

**Example:** a "Draught of courage" potion, rule **Button "Drink"**, **Always**, apply `blessed`.

The item's rules are never overwritten by a template update.

## Copies follow the world item

A copy (in an inventory, a chest) **follows the effects of its world item**: changing them on the world item changes them for all, even those already handed out. **Change them for this copy only** detaches this copy.

## In the tooltip

**Show the effects in the item tooltip**: when hovering a carried item, each effect it gives and what it does. A discreet effect stays hidden from players.

## Items given by an effect

In the effect manager, **Given items** block: while the effect lasts, the character receives these world items. The weapons of an animal form, the weapon summoned by a spell…

- Drag the world items from the sidebar.
- **Where it goes**: the key of a container or a slot of the sheet. Slot taken: the item in place goes back where it came from, then returns when the effect ends.
- **When the effect ends**: **It is removed** or **It stays**.
- **Locked**: the player can't throw it away, give it, or put it somewhere else.

**Example:** a "Flame blade" spell: the effect gives the "Flame blade" item in the `hand` slot, locked, removed at the end. The character's sword comes back to their hand afterwards.

## Going further

A button can also apply an effect with its **Effect** step, on the carrier or on the targets. See [All the steps](#etapes-liste).
