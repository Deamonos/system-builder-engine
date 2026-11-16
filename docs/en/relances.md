**What it's for:** improving a roll afterwards — rerolling it, adding a die or a bonus — for free, or by spending a resource of the sheet (luck, heroism, edge…).

**Where:** in the workshop, pencil of a field with a roll → **After the roll: rerolls and bonuses** section. Each roll has its own choices.

**Example:** a luck point lets you reroll. Resource `luck`, a **Reroll everything** action, label "Luck point", cost `1`, keep **the best**. After the roll, the "Luck point" button appears on the chat card; a click rerolls, spends 1 luck point and updates the card.

![The roll card, with the reroll button and the remaining resource](img/en/carte-relance.webp)

## The settings

| Setting | What it does |
|---|---|
| **Resource** | The sheet key that pays (for a weapon: the character carrying it). **Empty = free**: no cost is shown or spent. |
| **Uses per roll** | How many actions in total on the same roll (1 by default, formula allowed). |
| **Who can click** | The player and the GM, the player only, or the GM only. |

## The actions

Add as many actions as you want (**+ Action**). Without any action, nothing happens after the roll.

| Action | What it does |
|---|---|
| **Reroll everything** | A new roll. **Keep**: the best, or the new one. |
| **Reroll failed dice** | For a pool of dice counted as successes (`6d6cs>=5`): only the dice without a success are rerolled. |
| **Add dice** | **Value**: `1d6`. |
| **Add a bonus** | **Value**: `2` (formula allowed). |
| **Reroll damage** | On a weapon's roll field: the damage roll of an attack. Keep the best or the new one. |

Each action has its **Label** (the button's text), its **Cost** (formula; 1 by default with a resource) and its **Limit** (how many times on the same roll; empty = the roll's limit).

## When the buttons appear

- **On the roll's card**, for a roll with no follow-up: a label click, a HUD value, a simple roll request, a button's last step. The card updates: the old roll struck through, the new result, the resource spent, no new message.
- **In a small window right after the dice**, for a roll followed by something else: a step in the middle of a button, an area attack, a lock, a language to decipher, a track, a trap to disarm, an opposed roll. The rest plays out with the kept result (**Keep this result**).
- **Never** for automatic rolls: resisting an effect, initiative, spotting a trap while walking by.

## Going further: attacks

- **Attack rerolled from its card**: the defense already rolled is kept. Miss → hit: damage is rolled and applied. Hit → miss: the damage applied is given back.
- **Reroll damage**: a button under each target's damage, areas included. Already applied by the GM, the difference is corrected right away; rerolled by a player, the GM gets an **Apply** button to correct it in one click.
