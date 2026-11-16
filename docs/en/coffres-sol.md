**What it's for:** items waiting on the map. A treasure chest, a locked trunk, an enemy's fallen sword, an abandoned bag.

## Chests

**Example:** a pirate chest, locked with a **Lock (picking)**, holding 200 gold coins and a map.

### Placing a chest

The **Place a chest** tool (the chest) in the token controls, then a click on the scene. The chest's window has two tabs: **Contents** and **Settings** (GM).

### Settings

| Setting | What it does |
|---|---|
| **Chest name**, **image**, **size** | In cells, in pixels, or the image's size. |
| **Opening distance** | How far a token can open it from. |
| **Weight limit** and **Max capacity** | With the items' **weight key**. |
| **Single access** | One character at a time; the GM can **Release** the chest. |
| **Locking** | **None**, **GM only**, **Lock (picking)**, or **Player padlock** (only the one who placed it, and the GM, can remove it). **Allowed players**: those who open it without a key. |
| **Contents display** | **List**, **Grid**, or **Spatial grid** (columns × rows, like a bag). |
| **Chest sounds** | When opening and closing, for the one opening it. |

### In the chest

- **Deposit**: drag an item from the sidebar or your sheet.
- **Take** or **Give to…**: a click on an item.
- **Money**: **Take the money**, **Distribute the money** (for me, shared between all PCs, or with some), **Deposit money**.
- The GM: right click on a cell to change the quantity or delete.

## Ground items

**Example:** a goblin falls, its sword stays on the ground. A player picks it up by double-clicking it.

- **Drop on the ground**: drag an item from the sheet onto the map, the inventory's right click **Drop on the ground**, or a button. Several items at the same spot make a **bag**, like a small temporary chest.
- **Pick up**: double-click the item or the bag, with your token close enough. **Take** or **Give to…** another character.
- A scene object dropped on the map: SBE asks whether to **install** it or drop it on the ground.
- An item whose template isn't **Droppable on the scene** never goes on the ground. An item players can't see doesn't appear on the map for them.

### Settings

In the system settings:

- **Picking up an item on the ground: distance (squares)**: 0 = no limit; the GM is never limited.
- **Ground items: size (cells)** and **bag image**.
- **Waiting items: offer "Drop on the ground"**: items received with no room can be dropped on the ground by the player. See [How SBE stores items](#inventaire).

## Going further

A chest's contents count for [propagation](#objets-monde) and deletions: deleting a world item also offers to remove its copies from chests.
