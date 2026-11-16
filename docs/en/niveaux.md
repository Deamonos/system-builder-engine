**What it's for:** letting your characters level up. Through experience or through given levels, with a level-up window where the player spends their points, and rules that grant items, effects or bonuses at each level.

**Example:** a **Level** component, key `level`, leveling **through experience**, experience key `xp`, thresholds `100, 300, 600, 1000`. At 100 XP, the **Go to level 2** button appears; the window offers 3 points to spend between `strength` and `agility`.

## The Level component

Add it in the workshop, like any other component. Its **key** holds the level: a number, usable in every formula (`level * 5`).

![Elara's header in the demo: level 1 / 5, the experience gauge 0 / 100, and the Experience field](img/en/niveau-fiche.webp)

| Setting | What it does |
|---|---|
| **Starting level** and **Maximum level** | The maximum: empty = none; a number or a formula. |
| **Leveling up** | **Through experience (thresholds)**: a level becomes available when the XP reaches the threshold. **Given levels**: no XP, the level comes from a quest, a button or the GM. |
| **Experience thresholds** | A list (`100, 300, 600` = levels 2, 3, 4…) or a formula where `level` is the current level (`level * 1000`). |
| **Show "level / maximum"** and **Gauge** | None, experience toward the next threshold, or level toward the maximum. |
| **"Level up" button** | It appears on the sheet when a level is available. |
| **Who levels up** | The player freely, the player with GM approval, or the GM only. **GM: level editable directly**: the GM changes the number by hand. |

## The level-up window

What you place **inside** the Level component, in the workshop, does not appear on the sheet: it is the content of the level-up window (choices, explanations…).

- **Points to spend** (number or formula; `level` is the level reached) and **Budget fields** (`strength:1, agility:2`: +1 strength costs 1 point, +1 agility costs 2).
- **"Validate" only when every point is spent**, and **Leftover points to key** (empty = lost).
- **Writing the choices**: **on Validate** (closing or cancelling restores the sheet) or **right away**.
- **Selling points back**: allow lowering a field below its opening value.

## Level rules

The component's **Rules** button: **level-up rules**, played when leveling up for the level reached, and **going-down rules**.

- **When**: **at level** N, **every N levels** (from a given level), or **every level**.
- **Actions**: a **value** (add or replace, number or formula), an **effect** (apply or remove), an **item** (give or take, dragged from the world), a **template button** to run.

**Example:** every level, `hp_max` + `1d8`; at level 3, give the item "Power Attack".

## Going down and the history

- **Who can go down a level**: nobody, the GM, the player with approval, or the player.
- **Undo the last level-up**: restores the previous values and takes back the items and effects given by the rules.
- **Level history**: each level-up, what was received or taken; visible to players if you tick it.

## Giving experience or levels

- A button's **Experience / Level** step: XP or levels (a negative number takes some away), to the button's document, to the targets, or to the carried items of a template.
- A **quest reward**: levels. See [The quest journal](#quetes).
- **Levels received**: **available to take** (the window opens on click) or **applied right away** (the level-up rules run, with no window).

## Going further

A Level component can also be placed on an **item template**: a class with its own levels, a weapon that grows in power. The **Experience / Level** step then targets the carried items of that template.
