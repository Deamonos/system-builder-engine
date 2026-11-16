**What it's for:** a resource with a maximum: hit points, mana, stamina, carried weight, hunger… The gauge shows it as a bar or as icons, and protects it: it never leaves its bounds.

**Simple example:** key `hp`, **Min → Max** `0` → `100`, default value `100`.

**Computed example:** key `weight`, check **Computed value**, formula `carried("weight")`, **maximum by formula** `ceil((strength + endurance) / 4)`. The gauge follows what the character carries on its own.

## The settings

| Setting | What it does |
|---|---|
| **Min → Max** | The bounds. No write goes past them: typing, button, effect, HUD, macro. A new sheet starts at most at its real maximum, and when the maximum drops (attribute, effect, carried item), the value is brought back under it, without counting as damage. |
| **Maximum by formula** | Optional. Replaces the entered maximum, for example `10 + level * 5`. |
| **Computed value** | The gauge follows its formula, nothing to enter. **Keep decimals** avoids rounding. |
| **Display** | **Bar**, or **Icons** (one per point: three forks and knives for hunger). Clicking an icon sets the value. |
| **Displayed text** | Nothing, value, value / maximum, or percentage. If the player can edit it, the value **is** the input box: "[27] / 100". |
| **Low / high thresholds** (%) | The gauge takes the low color below the low threshold, the high color above the high threshold. |
| **Critical threshold** | Optional, above the high threshold: a third color, for a gauge that becomes dangerous when too full (overheating, corruption). |

Colors, shape (rounded, square, pill), fill texture and height are set in the **Style** tab.

![The temporary points and overflow settings](img/en/jauge-reglages.webp)

## Overflow

For an entered gauge: what goes below the minimum is **taken from another key**, what goes above the maximum is **added** to it, multiplied by a **factor** (1 = all, 0.5 = half).

**Example:** fatigue is at 3 and loses 5. It drops to 0, and health loses the extra 2.

The receiving key keeps its own bounds, and can overflow in turn.

## Never exceed the maximum

For a **computed** gauge (a carried weight, for example): any addition that would push it over is refused, with a message. Check **The GM is bound too** if the GM must respect the limit as well; otherwise, the GM is asked whether to go on.

## Temporary points

Points added to the gauge that **go first**: temporary HP, a magic shield, armor that wears down.

**Example:** gauge `hp`, check **Accepts temporary points**. A `+` box appears next to the gauge (sub-key `hp_temp`). With 30 HP and 5 temporary, 8 damage leaves 0 temporary and 27 HP.

![Hit points at 14 out of 20, with 5 temporary points (blue segment and + box)](img/en/jauge-temp.webp)

- **When given while some remain**: **keep the highest** (5 left, 8 given → 8) or **add them up** (5 + 8 → 13).
- **They disappear**: at the end of combat, at the new day, after a number of rounds, after a number of minutes of game time. Check what you want; the first one reached wins. Nothing checked: they stay until used up.
- **Color**: one for the dark theme, one for the light theme (Style tab).

**Giving some:** write the `hp_temp` sub-key with a button ("Set a field" step), a roll, an effect or a macro. Writing `0` removes them.

**What they absorb:** any "in-game" decrease of the gauge (rolls, buttons, effects, token HUD, macros). **Typing directly on the sheet is never absorbed**: typing 25 in the HP box gives exactly 25.

## On the scene

A gauge can be a **token bar**: in the token configuration, choose `values.hp`. The native HUD edits it like a normal bar (`-8` = 8 damage), and temporary points show as a separately colored segment.

## Going further

- The `hp_min` and `hp_max` sub-keys **are added** to the bounds: an item that gives `hp_max` +10 raises the maximum by 10.
- The `hp_bas` and `hp_haut` sub-keys shift the low and high thresholds (in %).
- `maxOf("hp")` reads the effective maximum in a formula.
