**What it's for:** the components where you **enter** a value: a name, a number, a box, a choice, a color, an image. They are the building blocks of every sheet.

They are all created the same way: **+** in the workshop, then the **Type** you want. The common settings (key, label, visibility…) are explained in [Building a template](#atelier); this page only covers what is specific to each type.

## Short text

A line of text: a profession, an origin, a note.

**Example:** key `profession`, label "Profession".

- **Default value**: the starting text of new sheets.
- **Field width** (px): empty, the field takes all the room.

## Rich text

Formatted text (bold, lists, headings…), written on **each sheet or item**, not in the template.

- **Background**: none (the sheet's theme) or **lined paper**, with its lines and red margin, like a notepad.
- **Editor**: **button to write** (you read first, a click opens editing) or **always open** (toolbar visible, the text is saved when you click elsewhere).
- **Minimum height** (px).

## Number

Any numeric value: an attribute, a skill, a level, charges.

**Example:** key `strength`, minimum `0`, maximum `100`, default value `50`.

![Numbers on a sheet, with their label icon and the click-to-roll die](img/en/champs-nombres.webp)

| Setting | What it does |
|---|---|
| **Integer** | Unchecked, choose the **displayed decimals**. |
| **Minimum / Maximum** | The value is always brought back within these bounds, even if you type more. |
| **Maximum by formula** | A calculated maximum, for example `10 + level`. It replaces the entered maximum. |
| **Show "value / max"** | The maximum is shown next to the field: `3 / 10`. Handy for charges, without a gauge. |
| **Computed mode** | The value comes from a **formula** and can no longer be entered. Example: `strength + strength_bonus`. |
| **Bonus formula (2-in-1)** | The value is still entered by hand **and** the formula adds a bonus on top. The field shows the total. Example: `floor(agility / 10)`. |

### The "2-in-1" number

With a bonus formula, the field shows the **total**, and its tooltip details where it comes from: the entered base, then one line per carried item that adds something ("+2 Short sword"), then the rest of the bonus.

**Value color**:

- **Carried items' share** (default): the value turns green or red only when equipment, class or skills change it. The fixed part of the formula (an attribute, for example) stays neutral.
- **Whole bonus**: the whole formula colors the value.
- **None**.

## Checkbox

A yes / no: "Wounded", "Identified", "Lit".

- **Checked by default**.
- In a formula, it is `true` or `false`: `wounded ? 2 : 0`.

## Dropdown list

One choice among fixed values.

**Example:** key `size`, choices `Small`, `Medium`, `Large` (one per line).

- **List choices**: one per line, in display order.
- **Default value**: empty, it's the first choice.
- In a formula, it is the chosen **text**: `size == "Large"`.

**Choice colors** (optional): give a choice a color. It follows it everywhere: in the list, in tags, in the item's tooltip. Example: Rarity, with Rare in blue and Unique in gold.

**Colored tag at the top of the tooltip** (item templates): the value is shown first in the item's tooltip, written in its color ("RARE" in blue). One list per template, usually the rarity.

## Color

A color picked from the palette: the tint of a vision, the color of a light, a team's color.

**Example:** key `tint`, default color `#33ff66`.

- The value is a `#rrggbb` text, readable in a formula and by light settings.
- **White** means "no tint" for a vision or a light.
- In an item's tooltip, it is shown as a swatch.

## Image

A fixed image, or a choice of images offered to the player.

**Example:** key `crest`, with three images to choose from: the player clicks theirs.

- **Size** (W × H, px): empty, automatic.
- **Default image**.
- **Selectable images**: each with a displayed name and/or an icon, and the **button position** of the choices.

**Going further:** the saved value is the image path. The key can therefore be reused elsewhere, for example as a frame's background: `{{crest}}`.

## Going further: sub-keys

If a `strength_min` or `strength_max` key exists, its value **is added** to the matching bound of `strength`: with `strength_max` = 20, the maximum goes from 100 to 120. An effect or an item can push a limit this way without touching the template.

In a formula, `maxOf("charges")` reads the effective maximum of a number or a gauge.
