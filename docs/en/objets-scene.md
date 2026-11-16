**What it's for:** items you put on the map and interact with. A lever that opens a portcullis, a terminal, a turret, a campfire, a tent, a barrel you can smash.

**Example:** a lever. An item template "Mechanism" with the **Scene object** option, an `active` box, and a **Pull** button usable **once placed**: **Set a field** `active`, then **Scene** → door → **Toggle**. The portcullis is linked to the lever.

## Making an item placeable

On the item template, option **Scene object (can be placed on the map)**, then its gear ⚙: the **default** values for its items. Each world item can change them in its **Scene** tab; an empty field keeps the template's value.

| Setting | What it does |
|---|---|
| **Size once placed** | In cells, in pixels, or the image's size. |
| **Image once placed** | Empty = the item's image. **Image by key**: one image per value (lever up / down, vein full / depleted). |
| **Rotate when placing** | You turn it with the mouse wheel while placing it. |
| **Interaction distance** | In cells, edge to edge. 0 = no limit. The GM is never limited. |
| **One user at a time** | Another player has to wait. |
| **Who sees it**, **Who can use it**, **Who can pick it up** | Everyone, the one who placed it, the GM, nobody. |
| **Hit points** | A key of the item. At 0: **destroyed**, or **falls to the ground**. |
| **Ignored by combat and targeting** | Unchecked, the item can be attacked: its defense and resistances are read on the item. |
| **Firing arc** | For a turret: the target must be within this arc, in front of the item. |
| **Only if** | Only items that satisfy this formula can be placed. |

## Placing and picking up

- **Place**: drag the item from the inventory onto the map, or a button with the **Place on the scene** step. The item becomes a token that keeps everything: its values, its state, its slots' contents.
- **Pick up**: in its panel, **Pick up**. It goes back into the inventory with everything it holds.

## The panel

**Double-clicking** the placed item opens its **panel**: its image, its name, and its buttons **usable once placed**. The character interacting is the user: their rolls, what is taken from them.

![The demo lever's panel: the Pull button, and at the bottom the GM's tools (scene links, pick up, sheet, delete)](img/en/objet-scene-panneau.webp)

For a custom panel: the workshop's **Panel once placed** tab. Build it with the usual components; **Template component** shows a component of the sheet with its value. Shown as a **window** or a **bubble attached to the token**. Empty, an automatic panel is used.

## Triggers

In the world item's **Scene** tab:

- **Double-click: opens the panel** (unchecked, players don't open it).
- **On approach**: when a token comes within a given **distance**, by **stopping** there, **passing by**, or both. The panel opens, or a button runs. **Frequency**: every time, once per character, only once. **Who**: player characters, or everyone.
- **Item dropped on it**: an item dropped from an inventory runs a button; the dropped item becomes the steps' chosen item (`pickedName`, `picked_key`). A formula filters the accepted items. A key in a lock, a log in the fire.

## Scene links

At the bottom of the panel, the GM opens **Scene links**: the elements the item controls (doors, lights, sounds, tiles, tokens, drawings, regions). **Add**, then click the element. A **group** lets you target them separately: "north door", "alarm".

The **Scene** step of its buttons acts on them: open, close, lock a door; turn on a light; show or hide; teleport; open another placed item's panel. See [All the steps](#etapes-liste).

## Attaching an item to the map

A world item can also attach itself to something already drawn:

- **A tile**: the tile becomes the item (double-click, panel, buttons). The image by key changes the tile's image.
- **A door**: clicking the door opens the item's panel instead of opening it. Its buttons open or close the door.
- **A region**: the item is placed at its center; a trap takes the region's shape as its zone.

Drag the world item into the **SBE — Interactive item** box of the tile's, door's or region's configuration. Or drop it right on it: SBE asks whether to attach it, install it, or drop it on the ground.

## Going further

A scene object can be a trap or a merchant: see [Traps](#pieges) and [Merchants](#marchands).
