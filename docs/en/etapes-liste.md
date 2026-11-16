**What it's for:** finding the step you need. In the workshop, the **?** next to a step's type gives its full explanation.

## Decide and control

| Step | What it does |
|---|---|
| **Condition** | Only continues if the formula is true; otherwise the button stops and shows the message. |
| **If… then… else…** | A block: plays the "Then" steps if the condition is true, otherwise the "Else" ones. |
| **Depending on the roll result** | A block: plays the branch of the last roll or attack (critical success, success, failure, critical failure). |
| **Ask** | A window asks one or more questions. Each answer is then read under its question's name. Who answers: the one acting, the GM, or the player of the first target. |
| **Wait** | The next steps happen later: rounds in combat, minutes outside combat. A card with "Cancel" is shown. |

## Rolls and combat

| Step | What it does |
|---|---|
| **Roll** | Rolls the roll set up on a field, of the item or of the carrier, with an optional difficulty (+ = harder). See [Dice rolls](#jets). |
| **Attack** | Chooses the target, checks the range, rolls the target's defense then the attack, and computes damage according to the combat rules. An area (circle, cone, line, template) hits several targets. |
| **Choose a target** | The player targets a character (tokens marked with T, otherwise a click). Range, who can be targeted (allies, enemies…), and "Only if" read on the target. |
| **Resistance roll** | Makes the resistance roll of an effect on the character, with advantage or disadvantage if wanted. |
| **What happens to the item** | For a recoverable projectile: after the attack, one copy goes into the target's inventory, onto the ground, or disappears, depending on whether the attack hit or missed. |

## Values and effects

| Step | What it does |
|---|---|
| **Set a field** | Replace, add, subtract, or give temporary points, with a formula (dice allowed). On the item, the carrier, the targets, the chosen item or a slot's item. Adding and subtracting stay within the field's bounds. |
| **Consume** | Removes an amount from a field of the item, from a slot (the magazine's bullets), from a field of the carrier (mana, stamina), or from this item itself (the stack goes down). |
| **Effect** | Applies or removes an effect, or changes its stacks (+1, −1), on the carrier or the targets. |
| **Experience / Level** | Gives or removes experience or levels of a Level component. |

## Items

| Step | What it does |
|---|---|
| **Choose an item** | A window offers the items that pass a filter: those the character carries, or those of a reference list (a tool's recipes). |
| **Remove items** | Removes items from the carrier's inventory. If there aren't enough, nothing is removed and the button stops. **Check only** checks without removing anything. |
| **Give items** | Gives the carrier a world item, or the one a formula names. It is stored in the inventory; with no room, it waits; with no container at all, it falls at their feet. |
| **Fill a slot** | Reloads a slot from the carrier's inventory: a window offers the ammo and the quantity. |
| **Empty a slot** | Returns all of the slot's contents to the carrier's inventory. |
| **Use a slot's item** | Runs a button of the item stored in a slot (Shoot, Reload…), by the same character, on the same targets. |
| **Random table** | Draws on a Foundry random table. Checked, a drawn item is given to the carrier. |

## Scene, media and world

| Step | What it does |
|---|---|
| **Play a media** | Plays a sound, an animation, or both, declared in the template's **Media** tab. |
| **Place on the scene** | The item leaves the inventory and becomes a scene object, aimed with a preview. Or summons creatures. Put it last. |
| **Scene (door, light, sound…)** | Acts on the scene elements linked to a placed item: open a door, turn on a light, teleport, disarm a trap… |
| **Send a signal** | Sends a free name to the acting character, the targets, or the whole scene: their buttons set to "Signal received" go off. |
| **Quest** | Gives a quest, advances, reveals or hides an objective, changes the status. |
| **Time**, **Weather**, **Season**, **Moon** | Advance the calendar, or impose a weather, a season, a moon phase for a duration. Only if the calendar is enabled. |

## Going further

The variables steps pass on (`isSuccess`, `pickedName`, `tableResult`…) are in [Steps](#etapes).
