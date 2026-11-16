**What it's for:** understanding how SBE stores a character's items, before you build bags and equipment slots.

## The principle

An owned item is a **real Foundry item** on the sheet. It knows **where** it is stored: in which container, in which slot, inside which item (a weapon and its magazine).

- **"Equipped" simply means "stored in a slot"**, or in a [container](#conteneurs) checked "Items stored here are equipped". There is no extra "equipped" box to check.
- Two components store items:
  - the [slot](#slots): a space for **one** item (the hand, the armor, the class);
  - the [container](#conteneurs): a bag, an inventory, a list.
- A container without a filter accepts everything: that's the bag. A slot without a filter accepts nothing.

**Minimal example:** a character template with a **Container** with the key `bag` and a **Slot** with the key `hand`, filtered by the tag `weapon`. Drag a sword from the sidebar onto the bag: it is stored there. Then drag it onto the hand: it is equipped.

## Stacks

500 arrows is **a single item** with a counter.

- Check **Stackable** in the item template's options. Its gear sets the **maximum per stack**: 100 rounds in boxes of 30 make three full boxes and one of ten.
- Two copies merge if they come from the same world item and are in the same state.
- When you move a stack, you are asked **what quantity**.
- From the sidebar, a window asks **how many to add**, capped by the room in the container.

## The right-click menu

On an item in the inventory: **open**, **unequip**, **delete**, and all the item's **actions** (its buttons). An action that can't be done stays visible, greyed out, with its reason. In a spatial grid: **Rotate**.

**Show in chat** (right click, or the ⋮ menu of the item's sheet): a folded card with the image, the name and the tags; a click on the header unfolds the description. Only what a player may see goes to chat: hidden tags and secret passages stay out.

## Back to where it came from

An item you equip remembers the container it came from (the bag, the belt…). **Unequipped**, it goes back to that same container. If that container is full, it waits in the waiting area (below). With no known origin: the first container on the sheet that accepts it.

## Nothing gets lost: the waiting area

An item received when there is no room is never lost. It waits in the **"Waiting"** band below the container (or **"Outside the grid"** for a spatial grid).

This happens with a trade into a full bag, an item given by an effect, an item taken out of a slot when its original bag is full, a quest reward…

- The item already belongs to the character (it counts in what they carry), but doesn't take up room yet.
- Make room, then drag it from the band into the container. The band disappears when it is empty.
- **Organize** opens the **Waiting items** window: drop on the ground (if the GM allows it in the system settings), throw away, or give back to the previous owner.

## Limiting what a character carries

A **computed** gauge, for example `carried("weight")`, with **Never exceed the maximum** checked, prevents carrying more than the capacity. Every addition is checked (picking up, trading, taking from a chest, a growing stack); **removing is always possible**, even when overloaded. See [Gauges and temporary points](#jauge).

## The contents of a world item

You can also store items in the slots and containers of an item **that nobody carries**: a weapon with its magazine, a bag already filled. Those contents are kept with the item. When the item arrives in an inventory, a chest or on the scene, its contents follow it.

- Dragged from an inventory, an item is **moved** there (with what it holds); from the sidebar, it is **copied**.
- Those contents can't be dragged out of the sheet: right click → **Delete**.
