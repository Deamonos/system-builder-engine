**What it's for:** traps placed on the map. A mine, a pit, a tripwire, an exploding rune. They hide, get spotted, dodged, disarmed and picked up.

**Example:** a mine. A scene object, with **This is a trap** checked: shape **Radius around**, `1` cell, **Hidden**, detection roll `perception`, dodge roll `agility`. **Effect button**: **Explode**, a 2-cell circle attack **on the trap**. **After**: **Disappears**.

## Where to set it

A trap is a [scene object](#objets-scene). In the world item's **Scene** tab (or the template's gear ⚙), check **This is a trap**. Everything is set there; the one placing it only has to place it, turn it and place its zone.

## Trigger zone

| Setting | What it does |
|---|---|
| **Shape** | **The item's space**, a **radius around** it, a **rectangle**, or a **circle / cone** facing the front of the item. |
| **Placer places it** | The zone follows the mouse (wheel = rotate), a click places it. |
| **Placer sets its size** | A rectangle is drawn in two clicks; a circle or a cone asks for its radius and angle. |

## Triggering

- **Triggers**: when a token **stops** in it, **passes through** it, or both.
- **Who**: player characters, or everyone.
- **Spares allies**: those with the same disposition as the placer.
- **In combat only**.

## Hidden and detection

- **Hidden**: only the GM, the one who placed it, and players whose character spotted it see it. The one who placed it never triggers it.
- **Detection roll**: a roll key of the character passing within **Distance** cells, with a **Difficulty** read on the trap.
- **Last chance**: not spotted yet, one last roll on entering; on success, the character steps back.
- **Spotted = avoided**: a character who spotted it passes without triggering it.

## Dodge and step back

- **Dodge roll** of the character triggering it, its **Difficulty**, **Only if spotted**, **Dodgeable if** a formula.
- **If dodged**: **they step back** (to the previous cell, to the start of the move, or they stop in place), or **another button**.

## Effect and after

- **Effect button**: a "once placed" button of the item. Its target is the character who triggered it: attack, zone, effect…
- **Effect center**: **on the trap** (a mine, a pit) or **on the victim**.
- **After**: **Disappears**, keeps **Charges**, **Re-arms itself**, or **Disarmed (to re-arm)**.
- **Revealed within**: the distance at which it becomes visible after going off; 0 = only to the one who triggered it.

## Handling

- **Roll to disarm** and its difficulty. Disarmed, it is harmless, visible to all, and can be picked up.
- The item's buttons act on it with the **Scene → Trap** step: **Disarm**, **Pick up**, **Take the contents** (the trap is destroyed), **Rearm**, **Re-hide**.
- The GM chooses **who still sees it**: characters who know where it is see it and avoid it.

## Seeing the zones

The **Trap areas** tool in the token controls shows their zones to the GM: trigger in yellow, effect in red.

## Going further

A trap can also take the shape of a Foundry **region**: attach the world item to the region, its shape becomes the trigger zone. See [Scene objects](#objets-scene).
