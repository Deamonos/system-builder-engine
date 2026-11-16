**What it's for:** making a field's label clickable to roll, without adding a button. A small die in front of the label shows it can be rolled.

**Example:** on the `strength` field, open the pencil, **Dice roll** block:

1. Check **Roll on label click**.
2. **Roll formula**: `1d100`.
3. **Comparison**: "Success if roll ≤ field value".

On the sheet, clicking "Strength" rolls 1d100 and the chat says Success or Failure.

## Roll settings

| Setting | What it does |
|---|---|
| **Roll formula** | Foundry dice; your keys are accepted: `1d20 + strength`. |
| **Message title** | The card's title in the chat. Empty: the field's label. |
| **Comparison** | **None** (the roll is just shown); success if the roll is **≤** or **≥ the field value**; success if the roll is **≤** or **≥ a target value** (a number or a key). |
| **Apply the result** | Add to, subtract from or replace the field's value. Example: HP with `1d6` in "Subtract". Bounds are respected. |
| **Die icon** | The icon in front of the label (d20, d6, skull, emoji…), or **Hide the die icon**. |

**Attack example:** formula `1d100 + score`, "Success if roll ≥ a target value", and the difficulty entered in the roll window.

## Criticals

**Critical success threshold** and **critical failure threshold**: none, a **fixed value**, a **formula** recalculated on every roll (`ceil(luck / 10)`), or a **condition**.

- A critical never lands on the wrong side: a critical success is always a success.
- **Criticals read on the die alone**: thresholds look at the dice's natural result, without bonuses, and the critical then decides the result.

**The condition** is a true-or-false formula. It can read:

| Word | What it is |
|---|---|
| `margin` | By how much the roll beats the threshold (bigger = better). |
| `goal` | The threshold. |
| `natural` | The dice, without bonuses. |
| `rollTotal` | The roll's total. |
| `diceCount` | The number of dice. |
| `countFace(1)` | How many dice rolled 1. `countFace(5, 6)`: how many 5s and 6s. |
| `hasDouble()` | True if two dice rolled the same. |

**Examples:** critical success `margin >= 10`, critical failure `margin <= -10`. For a `6d6cs>=5` dice pool, a critical failure if half the dice roll 1: `countFace(1) >= diceCount / 2`.

**The natural die shifts one step** (with a comparison): above one value, the result moves up a degree (failure → success → critical success); below another, it moves down. Example on a d20: one step up if ≥ 20, one step down if ≤ 1.

## The roll window

To let the player adjust the roll before rolling, check boxes in the **Roll window** block. On click, a small window opens, then **Roll**.

![The roll window: advantage and modifier](img/en/fenetre-jet.webp)

- **Advantage / disadvantage**: N rolls (2 to 10, **Number of rolls**), keeping the best or the worst. The best follows the roll's direction: under a value, it's the lowest. The message shows every roll and the one kept.
- **Free modifier**: a number entered (+10, -5). A bonus always helps: on an "under the value" roll, it raises the threshold instead of being added to the die.
- **Difficulty / threshold**: the target is offered and can be changed (only with a comparison).
- **Message visibility**: public, GM, blind…

Nothing checked: the roll goes straight away. Closing the window cancels the roll. It never opens for an automatic roll, such as resisting an effect.

### Forcing the visibility

**Message visibility** block: this roll's **default** visibility, and the **allowed** ones. The player only chooses among those; with a single one allowed, there is no choice.

**Example:** skill rolls "Private to Gamemasters" by default, with "Private to Gamemasters" and "Blind to Gamemasters" allowed.

## Bonuses shared between several rolls

**Roll identifiers**: shared labels, for example `physical, attack`. The `jet_physical` key is then added to **every** roll labeled `physical`. An effect can target it ("Exhausted: `jet_physical` −10") without any component of that name existing on the sheet.

## Imposed advantage, avoided critical failure

A few special keys, set by an effect, a carried item or a field of the sheet:

| Key | What it does |
|---|---|
| `avantage` | Positive: advantage on every roll; negative: disadvantage; both at once: normal. |
| `avantage_physical` | The same, for rolls with the `physical` identifier or for the field with the `physical` key. |
| `sans_echec_critique` | Positive: a critical failure becomes a simple failure. The card shows "Critical failure avoided". |
| `sans_echec_critique_physical` | The same, for an identifier or a field. |

> These special keys are fixed words of the engine, the same in every language.

- A carried item with a checked `avantage_physical` box imposes advantage while it is carried. An **inactive** item no longer imposes it.
- In the roll window, imposed advantage is selected automatically. System settings → **Imposed advantage locked**: checked (default), the player cannot change it; unchecked, it is only pre-selected.
- An item's roll (a weapon) also reads these keys on its carrier.

## What the message shows

The entered modifier, and effects **visible to everyone**, each named with its icon. Discreet effects stay secret. The result itself counts everything.

## Going further

The same roll is used on a label click, by a button's "Roll" step, by the GM's [roll requests](#demandes-jet) and by effects' resistance rolls. To reroll or add a bonus afterwards: [Rerolls and bonuses](#relances).
