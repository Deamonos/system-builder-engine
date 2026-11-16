**What it's for:** closing a game day in one click. Characters recover, hunger rises, time moves forward by the night, and everything tied to rest happens at once.

**Example:** the Brumeval demo. Common change: `mana` back to its maximum. Two tiers: "Good night" restores half the HP, "Restless night" a quarter. The night lasts 8 hours.

## Opening the window

The **New day** tool (the bed) in the token controls, on the left of the scene. GM only.

The window has two tabs: **Rest**, to run the night, and **Settings**, to say what it does.

## Settings

![The Settings tab with the demo's: mana refilled, and two recovery tiers](img/en/nouvelle-journee-reglages.webp)

### Common changes

Applied to **every** character who rests. One line: the **key** of a number or a gauge, a signed **amount** (a number or a formula), as a **value** or as a **% of max**.

**Example:** `hunger` → `-2` value; `mana` → `maxOf("mana")` value to refill it.

The result stays within the field's bounds. A key a character doesn't have is skipped for them.

### Recovery mode

| Mode | What it does |
|---|---|
| **By tiers** | Each character gets the tier chosen for them. Example: "Decent night": `hp` → `25` % of max; "Bad night": `hp` → `10` % of max. |
| **Over time** | Each line restores its amount **every N minutes**, as many times as the rest duration allows. Example: `hp` → 10 % of max every 30 minutes: 8 h of rest = 16 times. The count stops at the maximum. |

Common changes apply in both modes.

### Night duration

**Default night duration**: the night **moves game time forward** by that much. Effect durations, the calendar and everything that follows time run by themselves. `0`: time doesn't move.

It can be changed for each night, at the bottom of the Rest tab. In "over time" mode, it is the **default rest duration**, offered for each character.

**Save** keeps the settings.

## Running the night: the Rest tab

The list of characters owned by a player (a character with no player isn't there):

- **By tiers**: check the ones who rest and choose each one's tier.
- **Over time**: check them and set each one's duration. One sleeps 8 h, another stands guard for 4 h. Time moves forward by the longest rest.

**Apply** runs the night. For each character, a **Night passed** card is whispered to the GM and its owners: what changed, or "Nothing changed tonight."

## Everything that happens on the new day

On top of the settings above, the night triggers:

- **effects** set up with **Rest recovery** (see [Effects that evolve](#effets-avances));
- the **temporary points** of gauges set to clear on the new day;
- buttons that run on **New day** (see [Runs by itself](#declencheurs));
- restocking of **merchants** set up for it;
- clearing of **ground traces** that last "until the new day";
- the automatic save of the active **group**, if it is checked.

## Going further

In a new day formula: the character's keys, plus `maxOf("key")` and `minOf("key")`, the field's bounds. `ceil(maxOf("hp") / 2)` restores half the HP, rounded up.
