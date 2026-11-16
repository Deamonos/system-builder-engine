**What it's for:** understanding the four ideas everything else rests on. Five minutes of reading that will save you a lot of time.

## 1. The template and the sheet

You build a **template**: it's the blueprint. Your characters and items are then created **from** that template.

- The template holds the **structure**: which fields, where, how they are displayed.
- Each sheet only holds **its values**: its strength, its HP, its name.
- If you change the **structure** of the template (a field added, moved or deleted), **every sheet follows** right away.

**Example:** you add a "Luck" field to the "Adventurer" template. Every adventurer already created now has a Luck field.

## 2. The key

Every component of a template has a **key**: a short, unique name, for example `hp`, `strength` or `weight`.

- The key is the component's **identity**. Formulas, effects, rolls and tool settings all refer to it by its key.
- Nothing is hard-coded in SBE: "HP", "weight" or "money" only exist if **you** create them.
- A key starts with a lowercase letter, then only contains lowercase letters without accents, digits or `_`. Examples: `strength`, `strength_bonus`, `mag_size`.

> You can rename a key at any time: SBE renames it everywhere it is used. See [Checking and renaming a key](#verifier).

## 3. A single source of truth

Each piece of information lives in **one place only**.

- An effect bonus is never "baked" into a value: it **is added to the calculation**, and the detail shows on hover.
- An equipped item is not a checkbox ticked twice: it is an item **stored in a slot** of the sheet.

Result: nothing gets out of sync, and removing an effect or an item puts everything back on its own.

## 4. No code required

Everything is set up with the mouse. Formulas, CSS and HTML are there to go further, **not to get started**.

## The three levels of an item

An item goes through three levels, linked together: **template → world item → copy**.

| Level | Example | Where it lives |
|---|---|---|
| **Template** (the blueprint) | "Weapon" | in the world items, never placed on a scene |
| **World item** | "Short sword" | in the world items |
| **Copy** | the sword carried by Lys | on a sheet, in a chest, on the ground |

Each level is linked to the one above, so there is never an orphan item. But **structure** and **values** don't follow the same way:

- **The structure always follows.** Add a "Weight" field to the "Weapon" template: every weapon, in the world and carried, gets a Weight field.
- **Values follow by propagation.** Change the price of the "Short sword": SBE asks whether to **propagate** the new price to the short swords that already exist. You see what changes and how many copies are concerned, and you confirm.

Propagation is set component by component, with the **Propagate to existing items** box in its window (checked by default). Uncheck it for a value specific to each copy, such as wear or condition: it will never be overwritten.

> The name, image and description only propagate to copies that haven't customized them.

## PC or NPC?

Nothing to set: a sheet that **belongs to a player** is a PC, otherwise it is an NPC. Change the sheet's permissions and it changes sides.

## What next?

Get hands-on with [Your first template in 10 minutes](#premier-modele).
