**What it's for:** knowing where a blow lands (the head, an arm, a wing) and acting on it: multiplied damage, armor for one zone only, hit points per limb, an aimed shot.

**Example:** a **Humanoid** body. The head is hit on 1 to 2 on a d20, with damage ×2 and the protection `helmet`. A player aims at the head: −4 to the roll. On a hit, the card shows the silhouette with the head in color.

## Bodies

**System settings** → **Bodies (hit locations)** → **Bodies**. **New body** starts from an empty body or a starting body (**Humanoid**, **Quadruped**), to change freely.

![The Humanoid body: the templates using it, the zones with their ranges and multiplier, and the drawing](img/en/corps.webp)

| Setting | What it does |
|---|---|
| **Templates using it** | The character templates that have this body. A body with no template serves all the others. |
| **Frame** and **background image** | Tall, wide or square; the image is optional. |
| **Odds** | **By ranges** ("From" and "To": the value rolled gives the zone) or **by drawn area** (the larger a zone, the more often it is hit). |

**Per zone** (empty = the normal rule):

- **Damage key**: the field that takes the damage when this zone is hit (`hp_head` for hit points per limb).
- **Extra protection**: a key of the target, subtracted on top of the damage type's protection.
- **Multiplier** (formula, ×1 by default) and **Hit modifier** (added to the attack roll: `-4` = harder).

**The drawing**: the same tools as the templates (Polygon, Ellipse, Rectangle, Select). A zone's dot picks the one that receives new pieces.

## In the attack profile

The profile's **Hit location** section (or the weapon's Advanced panel):

- **Hit zone**: none; a **separate roll** (`1d20`); or **read from the attack roll** (`natural` = the dice alone: `reverse(natural)` reads 34 as 43). Empty formula = a roll on the body's ranges.
- **Aimed shot**: after clicking the target, its silhouette appears; click the aimed zone, or **No aim**.
- **Area attacks**: one random zone per target, **the whole body**, **several at random**, or none; the full damage on each zone, or shared.

## After the blow

`hitZone` is the zone's name in lowercase, without accents, with `_` ("Right arm" → `right_arm`). Example: **Effect** step "Dazed" on the targets, only if `hitZone == "head"`.

## Going further

Bodies are exported and imported like templates. Another world's templates are not carried over.
