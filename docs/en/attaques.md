**What it's for:** a weapon, a spell, a punch: anything that hits someone. SBE knows nothing about parries, dodges or hit points: you tell it which keys play which role.

**Example:** a sword. Its **Strike** button has an **Attack** step: roll field `attack`, profile **Melee**, damage `damage + carrier("strength_bonus")`, range `1`. The player clicks, aims at a token, the target rolls its defense, and a single chat card shows both rolls and the damage.

## How it goes

1. **The target**: the token marked with T, otherwise a click on a token (a circle shows the range). Escape or right-click cancels, without spending anything.
2. **The range** is checked, in squares.
3. **The target rolls its defense**, on its own.
4. **Your roll** is compared to that total. A tie hits. A critical failure always misses, a critical success always hits.
5. **On a hit**: damage is rolled, multiplied on a critical and by the number of hits, then reduced by the target's protection against that damage type.
6. **A single card**: the attacker, the target, their dice, the damage. The GM applies it right away; when a player attacks, an **Apply damage** button waits for the GM.

**Recommended step order:** Condition → **Attack** → Consume. Cancelling the aim then costs nothing.

## The step settings

| Setting | Example |
|---|---|
| **Roll field** | `attack`: the roll of this field is the one that goes (its formula, its criticals). |
| **Attack profile** | `Melee`: it brings everything else (see below). |
| **Damage** | `2d6 + 3`, or keys: `damage + bonus`. |
| **Range** (squares) | `range`; empty = unlimited. |
| **Hits** | `burst_hits`: multiplies the damage, 1 by default. |

The **Advanced** panel repeats every profile setting: a box filled here replaces the profile's, for this weapon only.

## The combat rules

**System settings** → **Combat** → **Combat rules** (the **Combat manager** window):

- **Key that takes damage**: the hit point gauge of your sheets.
- **Critical multiplier**: ×2 by default.
- **Damage types**: for each type, the target's key that reduces it. `Fire` → `fire_armor`. A type missing from the list is not reduced.
- **Attack messages**: who sees the card (everyone, the GM, blind, the attacker, their targets and the GM…). **Full detail to the GM**: the others see a short card.
- **Initiative**: see [Initiative and carousel](#initiative).

## Attack profiles

Set once in the combat rules, chosen by the weapons. Changing the profile changes all of its weapons.

![The demo's "Melee" profile in the Combat manager: defense, damage type, save, area, hit location, non-lethal damage](img/en/profil-attaque.webp)

| Setting | What it does |
|---|---|
| **Target defense** | A formula read on the **target's** sheet: `1d20 + dodge + armor`. Without a defense, the target rolls nothing. |
| **Ignore defense if** | A formula read on the target: `hasEffect("stunned")`. |
| **Always hits if** | A formula read on the weapon (a checkbox `always_hits`): no defense, no roll. |
| **Unblockable** | No, **Ask on every attack**, or **Always**: the target makes no roll. |
| **Damage type** | `Fire`, or a formula (the type of the loaded ammunition). |
| **Knockback** | A target that is hit is pushed back N squares; a wall stops it. |
| **Non-lethal damage** | **If** (often a roll-window checkbox), **Kept value** (`1`), **Effect applied** when it reaches it (`unconscious`). |
| **Area, save, hit location** | See [Area attacks](#zones-attaque) and [Hit locations](#localisation). |

### The roll window

- **Roll-window options**: checkboxes, numbers or lists the player sets before aiming. Their key then works in every formula of the button (checked = 1). Example: a checkbox `aimed` and a roll bonus `aimed ? 2 : 0`. **Visible if** shows them depending on the other options; **Minimum / Maximum** bound a number.
- **Preview**: "label: text" lines recomputed while the player ticks boxes. `{damage} × {burst ? 3 : 1}` shows the damage before rolling. `mod` is the modifier, `adv` the advantage (1, −1 or 0).

## Correcting damage (GM)

Under each attack card, a panel for the GM only:

- For each target hit: **Cancel**, **½**, **×1**, **×2**, **As healing**. Only the difference with what was already applied is written.
- **Apply to selected tokens**: the same damage, each with its own protection.

## After the attack

The next steps of the button read `isHit` (hit), `isCrit`, `isFumble`, `rollTotal` and `hitZone`. Example: **Play a media** `impact` only if `isHit`. The attack's own sounds and animations are set in the step: see [Media](#medias).

## Going further

An attack run from an item placed on the scene (a turret) starts from its token. See [Scene objects](#objets-scene).
