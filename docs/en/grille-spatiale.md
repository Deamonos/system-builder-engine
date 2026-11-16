**What it's for:** an inventory where space really matters. Each item takes up its shape in cells — a sword on 1 × 3, an armor on 2 × 3, a potion on 1 × 1 — and you have to arrange them to fit everything.

**Example:**

1. In the workshop, a container `bag` → **Display type** "Spatial grid", **Columns** `10`, **Rows** `6`.
2. On the world item "Short sword", **Media** tab, **Spatial grid** block: **Width** `1`, **Height** `3`, and an image drawn upright.
3. On the sheet, the sword takes up 1 × 3 cells; drag it where it fits.

> The Brumeval demo shows one: the heroes' backpack.

![Lys's backpack as a spatial grid: a bow on 1 × 4, a stack of 20 arrows, lockpicking tools](img/en/inventaire-sac.webp)

## Container settings (workshop)

- **Columns × rows**: the size of the grid (10 × 6 if nothing is entered).
- **Cell size** (px).
- A single grid: no categories in a spatial grid.

Chests placed on the scene have the same option.

## Item settings (world item, Media tab)

- **Width** and **Height** in cells (1 × 1 by default, 20 at most). All copies follow their world item.
- **Image in the grid**: an image drawn for this shape. Empty, the item's icon is used.
- **Image**: **whole** (no distortion) or **stretched** (it fills the rectangle). A small preview shows the result.

## In play

- **Drag**: the item lands the way you hold it. While dragging, a **green** rectangle shows it fits, **red** that the space is taken or outside the grid. Dropped on a taken space: refused.
- **Rotate**: right click → **Rotate (clockwise)** or **(counterclockwise)**: 1 × 3 becomes 3 × 1, the image turns with it. Refused if there is no room.
- **Automatic placement** (picking up, taking from a chest): the item goes to the first free space, starting from the top left. With no room, it waits outside the grid.
- **Stacks**: a stack takes up its shape only once ("×N" badge); topping up a stack already there takes no room.

## Outside the grid

If the grid is made smaller, or if an already-filled container switches to a spatial grid, what doesn't fit waits in the **"Outside the grid"** band, below the grid. Drag it into the grid when there is room. **Nothing is ever deleted.**

## Going further

An item keeps its place (top-left corner, quarter turn) even when others move. Those that didn't have a saved place yet are fixed where you see them at the first move: nothing slides on its own.
