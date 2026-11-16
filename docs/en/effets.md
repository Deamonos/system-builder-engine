**What it's for:** putting a state on a character. A bonus, a penalty, a poison, a blessing, a rage: an effect changes values for a while, stacks or not, and shows on the token.

**Example:** the demo's "Blessed" effect: `attack` **Add** `2`, `defense` **Add** `1`, for 10 rounds (10 minutes out of combat).

## The effect manager

All the world's effects are created in one place, the **effect manager**:

- the **Effects** tool (lightning bolt) in the token controls, on the left of the scene;
- or the **system settings** → **Manage effects**.

On the left, the list of effects; on the right, the one being set up.

![The effect manager, with the demo's "Blessed" effect: +2 attack, +1 defense, 10 rounds](img/en/effets-gestionnaire.webp)

**New effect** creates one, **Duplicate** copies one. **Import** and **Export** move effects from one world to another as JSON. **Save** keeps everything.

## The effect's identity

| Setting | What it does |
|---|---|
| **Name** and **Icon** | What players see, on the token, the sheet and in chat. |
| **Color** | The white of the icon takes this color, everywhere. |
| **Key** | The identifier, used by formulas and steps: `blessed`. Same rules as every SBE key. |
| **Description** | The text shown on hover. |
| **Category** | Optional and free: `Disease`, `Poison`… Several effects of the same category can coexist. A button can react to a whole category. |

## What the effect modifies

One row per change: a **key** of your character templates, a **mode**, an **amount** (a number or a formula read on the sheet, for example `strength / 2`).

| Mode | What it does |
|---|---|
| **Add** | `+2`, or `-2` for a penalty. |
| **Multiply** | `0.5` halves. |
| **At most (cap)** | The value doesn't go above this amount. |
| **At least (floor)** | The value doesn't go below this amount. |
| **Override with** | The value becomes this amount. |

- A gauge's bounds are targeted with `key_max` and `key_min`: `hp_max` **Add** `5`.
- Order applied: multiply, add, at most, at least, override.
- **Nothing is written into the values.** The sheet shows the total, colored (green for a bonus, red for a penalty), with the detail on hover. Once the effect is gone, the original value comes back by itself.

![Lys's sheet while blessed: Attack and Defense in green, the detail on hover, and the Active effects component](img/en/effets-fiche.webp)

## Duration

- **Rounds**: in combat, the effect loses one round each new round.
- **Game time**: out of combat, it follows the world's time (seconds, minutes, hours, days).
- `0` = no limit for this counter. At zero, the effect is removed.

## Stacks and exclusivity

- **Stackable**: the effect can be applied several times (×2, ×3…), up to the **Maximum**.
- **Amount follows stacks**: add ×N, multiply ^N. Example: "Bleeding" at 3 stacks loses 3 HP per round.
- **Exclusive group**: two effects of the same group can't coexist. Applying one removes the other. Example: levels of fatigue, group `fatigue`.

## Combat

**Prevents defending**: the bearer no longer rolls defense, dodge, parry or saves when attacked. Stunned, paralyzed, asleep…

**Acts as Foundry status**: see [An effect's look](#effets-apparence).

## Applying and removing an effect

- **In the token HUD**: left click applies the effect (or +1 stack), right click removes it (or −1 stack).
- **With a button**: the **Effect** step applies, removes, or changes stacks. See [All the steps](#etapes-liste).
- **With an item**: while it is carried or equipped, or when a button is used. See [Item effects](#effets-objets).
- **On its own**: when conditions become true. See [Effects that evolve](#effets-avances).

## Foundry native conditions

At the bottom of the list, **Foundry's conditions** (Blind, Prone, Invisible…). A click sets them up like an SBE effect: name, icon, changes, duration, trigger. The **eye** hides them from the HUD, the **arrow** restores the original.

## Going further

In a formula, `hasEffect("blessed")` tells whether the character has the effect, `stacksOf("bleed")` gives its stacks, and `effectCategory("poisoned")` gives an effect's category. See [Formula functions](#fonctions).
