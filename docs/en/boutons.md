**What it's for:** giving a sheet an action. Drinking a potion, shooting an arrow, casting a spell, pulling a lever: that's an **Action button**, placed in the workshop like any other component.

**Example:** on the "Consumable" item template, a **Drink** button with two steps: **Consume** 1 of this item (the stack goes down), then **Set a field**: add `healing` to the carrier's `hp`.

> The Brumeval demo is full of them: Drink and Give to drink… on potions, Attack, Shoot and Reload on weapons, Cast on spells.

## What the button does

The **Button action** setting picks one of three kinds:

| Action | What it does |
|---|---|
| **Consume** | The simplest: removes charges on each use. Nothing else to write. |
| **Run steps** | A series of steps, in order: condition, roll, attack, effect, sound… See [Steps](#etapes). |
| **Open a button menu** | The button opens a list of other buttons. Add them on the sheet with the **+** under the button. Example: Shoot → Jammed → Clear. |

### Consume

- **Charges field**: a number or a gauge of this template (ammo, uses…). Each use lowers it. **None**: the button consumes the item itself.
- **Charges removed per use**: a number or a formula, for example `damage / 2`.
- **At zero**: **Nothing** (the button is disabled), **Remove 1 from the stack** (then the item with the last one), or **Delete the item**.

## Common settings

| Setting | What it does |
|---|---|
| **Icon (image)** | An image, or a font icon such as `fa-solid fa-play`. |
| **Offer outside the sheet (inventory, HUD)** | Checked by default: the action also appears when right-clicking the item in the inventory, and in the token HUD. Uncheck for a button that only makes sense in the item's sheet. |
| **Usable** | For a scene object: **in the inventory**, **once placed on the scene** (the button appears in its panel, on double-click), **both**, or **auto** (once placed if it can be, otherwise in the inventory). |
| **Announce in chat** | A card says what changed: +7 HP, effect applied, item consumed… Rolls and attacks already have their own card. |

## On an item sheet or a character sheet

- **On an item template**, the button acts for the **carrier**: the character carrying the item. Their rolls, their mana, their position on the map.
- **On a character template**, the carrier is the character itself. Example: a **Rest** button that refills mana.

## A greyed-out button

A button that can't be used stays visible, **greyed out**, and says why on hover.

![The right-click menu of a bow with no arrows: Shoot is greyed out, "No arrows left: reload." on hover](img/en/bouton-grise.webp)

The reason comes from the **conditions** at the start of its steps, from depleted charges, or from a "Choose an item" with nothing to offer. It's the same on the sheet, in the inventory's right-click menu and in the HUD.

## Going further

A button can also go off without a click, when an event happens: a hit taken, the start of the turn, a new day… See [Runs by itself](#declencheurs).
