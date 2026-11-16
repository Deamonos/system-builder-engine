**What it's for:** what hits an area rather than a single target. A grenade, a cone of flames, a bolt that pierces a line of enemies, a dragon's breath.

**Example:** a fireball. **Attack** step, **Zone** `circle`, radius `3`. The player places the circle, the tokens inside get a red frame, each one makes its save and takes its share of the damage.

## The step's area

In the **Attack** step (or the profile), **Zone**: `circle`, `cone`, `line`, or the name of a drawn template. A text or a formula (the area type of the loaded ammunition). Empty = a single target.

| Setting | Used for |
|---|---|
| **Radius** | The size of the circle, in squares. |
| **Length, opening** | The cone (empty length = the weapon's range; 90° opening by default). |
| **Length, width** | The line. |
| **Scale** | Multiplies a drawn template (1.5 = 50% larger). |
| **Traversal** | Every target (an explosion), or in order from the anchor, with a maximum (a piercing bolt). |

## In play

1. The shape follows the mouse; the **wheel** rotates it (Shift: by 15°). Tokens that will be hit get a red frame.
2. **Placed at the point of impact** (circle, "at the point of impact" template): on a token, it is an attack against its defense; on the ground, a roll against a difficulty that grows with the distance. On a miss, the area **drifts**.
3. **Starting from the shooter** (cone, line): no roll, the area goes off. It stops at the weapon's range.
4. Each target hit makes its **save** and takes the damage × the area's **intensity** on it, minus its protection. A single card lists everyone.

## The save

In the profile: each target defends with **a roll field of its sheet**, or with **its defense against the attack roll**. **Successful save**: **half** or **no** damage. An unblockable target makes no roll.

## Who is hit

The **combat rules**:

- **Coverage**: the share of a square (or of the token) the area must cover, from 1 to 100%.
- **Measure on** the occupied squares or on the token itself. A large token is hit if a single one of its squares is.
- **Walls**: none, movement walls, or sight walls. What a wall hides from the anchor is not hit.
- **Ground aiming**: the base difficulty, the extra difficulty at maximum range, the minimum and maximum drift.

## Drawn templates

**System settings** → **Area templates** → **Draw the area templates**: areas that are neither a circle, a cone nor a line.

- **Draw** on the grid sheet: **Polygon** (one click per point, double-click to close), **Ellipse** (Shift: circle), **Rectangle**. **Select** picks a piece and moves it; Delete erases it.
- **Intensity**: each piece has its own (100% at the core, 50% at the edge). A target takes the strongest piece that covers it.
- **Template settings**: name, **anchor** (at the point of impact or on the shooter), **rotation** (free, 8 or 4 directions, none), **color**, and if needed its own coverage and walls.
- The white dot is the anchor, the arrow shows the front. Measured in squares, templates keep their proportions on every map.

## Going further

An area that **stays** on the scene (a fire burning for three rounds) is set on the item: see [Zones and traces](#zones-traces).
