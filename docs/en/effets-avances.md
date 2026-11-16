**What it's for:** effects that live on their own. They apply themselves when a condition becomes true, deal damage every round, can be fought off with a roll, get worse, or play out in several stages.

Each block below is in the effect manager, under the effect's identity and changes. All are optional: unfold the block and check **Enabled**. A green dot on the title marks a block in use.

## Trigger: an effect that applies itself

**Conditions**: formulas on the sheet. The effect applies when they become true, and goes away when they stop being true.

- **All true (AND)** or **At least one true (OR)**.
- Allowed in formulas: your keys, `maxOf("key")`, `minOf("key")`, `hasEffect("key")`, `stacksOf("key")`, `inCombat()`.

**Example:** "Badly wounded", condition `hp <= maxOf("hp") * 0.25`, change `agility` **Add** `-2`. It appears below a quarter of HP, and disappears with healing.

**Events**: **When a combat starts**, **When this key decreases**. They apply the effect when they happen; it then follows its duration.

> An effect applied by its trigger doesn't prevent applying it by hand.

## Periodic effect: damage or healing over time

The effect changes a key at regular intervals.

| Setting | What it does |
|---|---|
| **Cadence** | **On the character's turn**, **Every round**, or **Game time** (out of combat), with an **Interval** in game seconds. |
| **Changed key** and **Amount** | Example: `hp`, `-1d4`. The result stays within the field's bounds. |
| **Reduced by key** | A loss is reduced by this value: the resistance to the damage type. Never so much that it becomes a gain. |
| **Chat message** | For the GM and the owners. |
| **On** | **The character bearing the effect**, or **The item granting the effect** (a lamp's fuel, an item's charges). |
| **At zero** | For an item: **Nothing**, **Remove 1 from the stack** (the next starts full), or **The item disappears**. |

**Example:** the demo's "Poisoned": every round, `hp` `-1d4`, reduced by `poison_res`.

![The "Poisoned" effect: periodic effect and resistance roll](img/en/effets-poison.webp)

## Resistance roll

The character tries to shake off the effect. SBE uses the roll already set up on a field of the sheet (pencil → **Dice roll**).

- **Roll field** and **Difficulty** (+ = harder).
- **When applied** and / or **Every round**.
- **On success**: **Effect goes away**, or **Reduce** by N stacks (by N rounds if it isn't stackable).
- **Criticals**: a critical success multiplies the reduction, a critical failure makes it worse.

**Example:** "Poisoned": `constitution` roll, difficulty `2`, when applied and every round; on success, the poison goes away.

## Escalation and tiers

For a **stackable** effect that gets worse.

- **Stacks rise**: **On their own, at the chosen cadence** (by **Step**), or **Only when added** (a zone, a button, the HUD).
- **Decay**: stacks go back down when the trigger no longer holds. At zero, the effect goes away.
- **Tiers**: each tier replaces the effect's **name**, **icon**, **changes** and, if you want, its **periodic amount** at that level. The number of tiers becomes the maximum.

**Example:** "Cold", three tiers: Shivering (`-1` agility), Numb (`-2`), Frozen (`-4` and `-1d4` HP per round). Stacks rise as long as the character stays outside in winter.

## Phases: an effect in several stages

To chain: a bonus, then a backlash. **Add a phase** switches the effect to phases: the duration and changes above become phase 1.

- When a phase's duration runs out, the effect moves to the next one; after the last one, it goes away.
- Each phase has its own name, icon, duration and changes.
- A phase without a duration lasts until the effect is removed.

**Example:** the demo's "Rage". Phase 1: `strength` `+4`, `defense` `-2`, 3 rounds. Phase 2, "Exhausted": `agility` `-2`, 2 rounds.

## Rest recovery

On the **new day**, for each character going through it:

- **Nothing**;
- **Effect goes away**;
- **Reduce** by N stacks;
- **Recovery roll**: a resistance roll, then **If the roll succeeds**: the effect goes away or is reduced.

## Going further

A button can react when an effect is applied or removed: **Runs by itself** → **Effect applied** / **Effect removed**. See [Runs by itself](#declencheurs).
