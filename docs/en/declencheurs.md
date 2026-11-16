**What it's for:** a button that goes off **without a click**, when an event happens. Armor that strikes back when hit, regeneration at the start of the turn, a curse that strikes every new day.

**Example:** a ring of regeneration. Step button **Regenerate**: **Set a field**, add `1` to the carrier's `hp`. In **Runs by itself**, check **Start of its turn**, **Scope** "Equipped only (slot)".

## Where to set it

On a **Run steps** button, under the list of steps, unfold **Runs by itself** and check one or more events.

- **A character's button**: its own events.
- **An item's button**: its carrier's, depending on the **Scope**; or its own if it is placed on the scene.
- The button runs on the character's player's side if they are connected (the windows open for them), otherwise on the GM's.

## Events

![The events of "Runs by itself", under a button's list of steps](img/en/declencheurs-evenements.webp)

| Family | Events |
|---|---|
| **Combat** | Damage taken, Healing received, Before a value drops, I brought a target to 0, Critical failure avoided, Start of its turn, End of its turn, Combat start, Combat end |
| **Item** (an item's button) | Equipped (put in a slot or an "equipped" container), Removed from a slot (or from that container), Arrives in an inventory |
| **Values and effects** | A formula becomes true, Effect applied, Effect removed |
| **Time** | New day, and the calendar events: every game hour, new date, sunrise and sunset, weather change, season change, moon phase change, calendar event |
| **Signal** | Signal received: a free name sent by the **Send a signal** step of another button |

Some need more detail:

- **A formula becomes true**: the formula, for example `hp < 10`. The button goes off when it switches from false to true.
- **Effect applied** / **Effect removed**: an effect's key, or an effect category; empty = all.
- **Signal received**: the signal's name, for example `alarm`.

## Settings

| Setting | What it does |
|---|---|
| **Scope (item)** | **Carried (inventory)**, **Equipped only (slot)**, or **Placed on the scene**. |
| **Frequency** | **Every time**, **Once per round**, **Once per combat**, **Once per day**. |
| **Only if** | A formula; when false, the button doesn't go off. Example: `eventValue >= 5`. |
| **Ask first** | The player confirms: "Use "Regenerate" (Ring)?". |

## What the steps read

- `eventName`: the event, the signal's name, the effect, the watched value or the target brought to 0.
- `eventValue`: the amount of damage or healing.
- `eventSource`: who sent the signal.

**Example:** a heavy blow stuns. A character's button, event **Damage taken**, **Only if** `eventValue >= 5`. **Effect** step: apply "Stunned" to the carrier.

## Before a value drops

This event plays **just before** the value is written, and can change it.

- **Watched value**: the key; empty = the one that takes damage.
- **New drop**: a formula; `eventValue` is the planned drop. Example: `eventValue / 2` for a shield that absorbs half.
- The new drop stays between 0 and the planned drop. Typing directly into the sheet triggers nothing.

## Going further

A **signal** links buttons together: a lever sends `alarm` to the whole scene, and every guard set to **Signal received → alarm** springs into action.
