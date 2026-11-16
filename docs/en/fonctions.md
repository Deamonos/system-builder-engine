**What it's for:** ready-made functions to read what a simple key doesn't give: what the character carries, their effects, the calendar, an item's carrier.

The name of a key, an effect or a container is written **in quotes**: `carried("weight")`.

## Reading the inventory

| Function | What it returns |
|---|---|
| `carried("weight")` | The sum of the `weight` key over all carried items, **quantity included**: 12 arrows at 0.1 weigh 1.2. |
| `carried("weight", "bag")` | The same sum, limited to the `bag` container or slot. |
| `carriedCount()` / `carriedCount("bag")` | The number of carried items (or stored in `bag`). |
| `carriedValue("damage", "hand")` | The value on the item stored in the `hand` slot: the bonus of the loaded ammunition, for example. |
| `owns("Rope")` | How many items of this kind the character owns: a name, a world item's id or a list of references. |

**Example:** a load gauge in computed mode, formula `carried("weight")`, maximum `strength * 2`.

> On an **item**, these functions only see what the item contains: a weapon counts the bullets in its own magazine.

## A field's bounds

| Function | What it returns |
|---|---|
| `maxOf("hp")` / `minOf("hp")` | The field's real bounds, contributions and formula maximum included. |

## Effects and combat

| Function | What it returns |
|---|---|
| `hasEffect("burning")` | True if the effect is on the character. |
| `stacksOf("burning")` | Its number of stacks. |
| `effectCategory("burning")` | The effect's category, empty if it has none. |
| `posedEffects()` / `posedEffects("burning")` | How many effects this character has applied, anywhere. Example: an upkeep penalty `-2 * posedEffects()`. |
| `inCombat()` | True during combat. |

## On an item: reading its carrier

| Function | What it returns |
|---|---|
| `carrier("strength")` | The key's value on the sheet of whoever carries the item (computed fields and effects included). 0 if nobody carries it. |
| `carrierMax("hp")` | The field's real maximum on the carrier. Example: a heal that restores 20% of max HP, `ceil(carrierMax("hp") * 20 / 100)`. |
| `slotted("hand")` | 1 if **the item's** `hand` slot is occupied, 0 otherwise. |
| `slotted("hand", "damage")` | The value of `damage` on the item stored in that slot, empty if the slot is empty. |

**Example:** a weapon whose chance to hit depends on its carrier's strength: `50 + carrier("strength")`.

## The calendar

These functions read the world's calendar, if it is in use.

| Function | What it returns |
|---|---|
| `hour()`, `minute()` | The hour and minute. |
| `day()`, `month()`, `year()` | The day of the month, the month, the year. |
| `weekday()`, `dayOfYear()` | The day of the week (1 = the first), the day of the year. |
| `season()`, `weather()` | The **key** of the current season and weather type. Example: `weather() == "storm" ? -10 : 0`. |
| `moon()` / `moon("red_moon")` | The key of the first moon's phase, or of a specific moon. |
| `moonPhase("full")` | 1 if the first moon is in that phase. `moonPhase("full", "red_moon")` for a specific moon. |
| `temperature()` | The current temperature. |
| `isNight()` | 1 at night. |
| `dayPart()` | The time of day: `night`, `dawn`, `morning`, `noon`, `afternoon`, `dusk`. |
| `hasEvent()` / `hasEvent("Festival")` | 1 if a calendar event (or that one) falls today. |

## Going further

- `reverse(34)` returns 43: the digits reversed (on 2 digits by default, `reverse(7)` returns 70). Handy to read an attack roll as a hit-location roll.
- `owns(allowed_classes, 1)`: the second number is returned when the list is empty. `owns(allowed_classes, 1) > 0` reads "no class required, or they have one".
- In a "Choose an item" filter, the item being used is written with the `self_` prefix: `self_slotted("hand")`, `self_hp`.
