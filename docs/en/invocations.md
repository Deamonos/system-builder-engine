**What it's for:** making creatures appear: a wolf called by a druid, skeletons raised by a spell, a deployed drone.

**Example:** a **Call of the Pack** spell. **Place** step, **What is placed**: **Creatures (summoning)**. Creature "Wolf", how many `1d3`, controlled by the summoner's players, 10 rounds. The player places each wolf on the map; they join the combat right after them.

## The settings

| Setting | What it does |
|---|---|
| **Creature** | A world NPC. Each creature becomes an unlinked token: hurting one wolf does not hurt the others. |
| **How many** | A number or a formula, dice allowed (`1d4`). Each creature is placed with the mouse. |
| **Controlled by** | The summoner's players, or the GM only. It takes the summoner's side. |
| **Duration** | In rounds in combat, in minutes out of combat; empty = until dismissed. |
| **Initiative** | Right after the summoner, or its own roll. |
| **At 0** | It disappears, or stays on the scene. |
| **While the summoner has the effect** | An effect key (concentration): once the effect is gone, they leave. **They leave if the summoner drops to 0.** |
| **Creature values** | One line per key: replace, add or subtract a formula when it arrives. `hp` replace `carrier("level") * 5`. Dice are rolled for each creature. |

**Dismiss my summons** (same step, **What is placed**): all of them, or those of one NPC.

## In formulas

`summoned()` counts the character's summons, `summoned("Wolf")` those of one NPC. Example: a **Condition** `summoned() < 3`, message "Too many creatures".

## Going further

A creature's "services" (three attacks, then it leaves): a field of its sheet that its buttons consume, and an "at 0, it disappears" rule.
