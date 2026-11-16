**What it's for:** a tree of talents, skills or research. Linked nodes, unlocked with points, that grant bonuses, items or effects.

**Example:** a "Warrior" tree. The **Endurance** node (3 ranks, cost `rank`, points taken from `talent_points`) gives `hp_max` + `rank * 5`. Its child **Second Wind** requires Endurance and gives the item "Second Wind".

## The Tree component

Add a **Tree** component in the workshop, then **Edit tree** under the component.

**Display on the sheet**: **inside the sheet** (with the **area height**; the tree scrolls if it is larger) or **a button that opens a window**.

## The tree editor

- **Double-click** on the background: a new node. **Drag a node's dot** to another one: a link, from parent to child. **Drag the background**: move the view. **Delete** erases the selection.
- **Ctrl + wheel** to zoom; **Snap to grid**.
- Click a node or a link to set it up. A link that would make a loop is refused.

## A node

| Part | What you set there |
|---|---|
| **The node** | Name, icon, description; **number of ranks** (more than one: it unlocks in several steps, 1/3, 2/3, 3/3). |
| **Rules** | **Cost of one rank** (empty = 1; `rank` is the rank bought: `rank * 2` costs 2, then 4, then 6). **Required parents**: all, or at least one. **Condition**: a formula of the sheet. **Exclusive group**: unlocking one closes the others. |
| **Rewards** | **Value bonuses** (add, multiply, at least, at most, replace; `rank * 2`), counted while the node is unlocked. **Items given**, **effects applied**, a **button run** at each rank. |
| **Look** | Shape (round, square, diamond, hexagon) and size. |

## The tree's rules

- **Points key**: the sheet key where points are taken (empty = free). For a tree on an item: its carrier's sheet.
- **Who unlocks**: the player freely, the player with GM approval (an Accept / Refuse card), or the GM only.
- **Taking nodes back**: not allowed, node by node, whole tree, or both; **who takes back** and the **share of points returned**. A node another one depends on cannot be taken back. **Items and effects when taken back**: removed or kept.

## The tree's look

**Straight**, **elbow** or **curved** links, their width, an animation on unlocked links (flow, glow), a background image, and a color per state: locked, available, unlocked, max rank, pending.

## On the sheet

![Elara's talent tree: clicking "Sturdy" shows what it gives (hp_max + 5), its cost and the Unlock button](img/en/talents.webp)

Each node shows its state. A click opens it: its requirements, its cost, what it gives, and **Unlock** (or **Go to rank N**). A grayed-out button says why: not enough points, missing parents, group already taken. The **history** keeps each unlock.

## Going further

A node's bonuses show up when hovering the value, under the node's name, like effect bonuses. Points are often earned with levels: a level-up rule that adds 1 to `talent_points`. See [Levels](#niveaux).
