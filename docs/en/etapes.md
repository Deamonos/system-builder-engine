**What it's for:** writing what a button does, without code, like a recipe: one step after another.

**Example:** a bow's **Shoot** button, in the demo:

1. **Condition**: `carriedCount("ammo") > 0`, message "No arrows left: reload."
2. **Attack** with the `score` field, damage `damage`, range `range`.
3. **Consume** 1 from the `ammo` slot.

(A first condition also checks that the bow isn't broken.) If the player cancels the aim at step 2, the button stops: the arrow isn't spent.

![The Shoot button's steps in the workshop: two conditions, an attack, then consume one arrow from the slot](img/en/etapes-tirer.webp)

## The step editor

Choose **Run steps** in the **Button action**, then **Add a step**.

- Each step fits on one line that reads like a sentence: "roll the carrier's lockpicking", "remove 1 from slot ammo". A click unfolds it to set it up.
- The ↑ ↓ arrows change the order; the bin deletes it.
- The **?** next to the type explains what the step does.
- The fields suggest the template's keys as you type.

## In order, and a false condition stops everything

Steps run **from top to bottom**.

- A **Condition** step only continues if its formula is true. Otherwise, the button stops and shows its **message**.
- The conditions at the start also grey the button out in advance, with that message on hover.
- Put what costs something (**Consume**, removing items) **after** what can be cancelled (aiming, choosing, rolling). Cancelling then costs nothing.

### Conditions as sentences or formulas

By default, a condition is built as a sentence: "ammo" "is greater than" "0".

![An unfolded condition, written as a sentence, with the formula it gives and its message](img/en/etapes-condition.webp)

You can group sentences (**All** or **At least one** must be true) and invert a sentence with **Not**.

Check **Advanced mode (conditions as formulas)** to write them as formulas: `ammo > 0`. The formula stays the same, only the display changes, and this setting only applies to you.

## "Only if": an optional step

Every step has an **Only if (optional)** field. Empty, the step always runs. With a formula, it only runs if the formula is true, **without stopping** the following ones.

**Example:** a potion that heals or restores mana depending on its effect. Two **Set a field** steps, one with **Only if** `effect == "Healing"`, the other with `effect == "Mana"`.

## What steps pass on

A step can read what an earlier step produced:

| Variable | After which step | What it holds |
|---|---|---|
| `isSuccess`, `isCrit`, `isFumble` | Roll, Attack | 1 or 0 |
| `rollTotal` | Roll, Attack | the roll's total |
| `isHit` | Attack | 1 if a target was hit |
| `pickedName`, `picked_key` | Choose an item | the name and fields of the chosen item |
| the questions' names | Ask | the answer given |
| `tableResult`, `tableTotal` | Random table | the text drawn and the number rolled |
| `eventName`, `eventValue`, `eventSource` | a button that [runs by itself](#declencheurs) | the event, its amount, who sent it |

In a filter of **Choose an item** or **Remove items**, the fields of the item being used are written with the `self_` prefix.

## Blocks

Two steps contain other steps:

- **If… then… else…**: if the condition is true, plays the **Then** steps; otherwise the **Else** ones. A branch can stay empty.
- **Depending on the roll result**: plays the branch of the **last** roll or attack of the button: **Critical success**, **Success**, **Failure**, **Critical failure**.

A block can contain another one, two levels deep at most.

**Example:** a locked chest placed on the scene, with a **Pick the lock** button usable once placed. **Roll** `lockpicking` of the carrier (the character interacting), then **Depending on the roll result**:

- **Success** → **Set a field**: `locked` = `0` on the item;
- **Critical failure** → **Remove items**: one "Lockpick" from the carrier (it breaks).

## Going further

The full list of steps, with what each one does: [All the steps](#etapes-liste).
