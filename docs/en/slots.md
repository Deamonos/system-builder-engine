**What it's for:** a space that holds **one** item — the hand, the armor, the class, a weapon's magazine. An item stored in a slot is **equipped** (a container can be too, see [Containers](#conteneurs)).

**Example:** a slot with the key `hand`, **Acceptance filter** "By tag", **Required tag(s)** `weapon`. Only items carrying the `weapon` tag can go in.

![Three equipment slots: the main hand holds a dagger, the off hand is empty, the armor is worn](img/en/slots-equipement.webp)

## What the slot holds

- **An item (instance)**: a copy carried by the character. This is the most common case.
- **A world item (reference)**: a world item, cited without being carried (a class, a profession).

## The filter

**A slot without a filter accepts nothing**: choose at least one way to accept.

| Filter | What it does |
|---|---|
| **By template(s)** | Only items built on the checked workshop templates. |
| **By tag** | Several comma-separated tags are **all** required: `accessory, grip` accepts an accessory grip, but not a melee weapon grip. Case doesn't matter. |
| **By key** | The item must have a component with this key. |

And on top of that, whatever the filter:

- **Refuse tags**: an item carrying one of them is refused.
- **Only items from the list**: the slot only takes items from a reference list of the host item. Example: a weapon's magazine only accepts the ammo in its "Compatible ammo" list.
- **Compatibility with the host**: a dropdown of the host (weapon category, class…). The dropped item declares where it goes with **checkboxes that repeat the choices** of that dropdown. Example: a scope with "Rifle" and "Bow" checked only fits a weapon of one of those two categories. No box checked: it goes anywhere.

## The other settings

| Setting | What it does |
|---|---|
| **Accepts stacks** and **Maximum quantity** | For a magazine: the quantity can be a number or a formula read on the host item, for example `capacity`. The slot then shows how full it is, "12 / 15". |
| **Ask before replacing** | If the slot is taken, you are asked whether to replace; the outgoing item goes back where it came from. Unchecked, the drop is refused. |
| **After the drop, offer the button** | The key of a button of the dropped item. Right after the drop, that button is offered. Example: a weapon rack with `reload`: drop a weapon on it, "Use “Reload”?" loads it. |
| **Text when empty** | Example: "Drop a class". |
| **Size** (px) | The size of the space, square. |
| **Show the name next to the icon** | For a slot that reads like a label (a class, a profession). |

## In play

- **Equip**: drag the item onto the slot.
- **Unequip**: right click → **Unequip**. The item goes back to the container it came from.
- **Open** the item: double-click.

## Going further

In a formula, `carriedValue("damage", "hand")` reads a value of the item stored in the `hand` slot, and `slotted("hand")` tells whether an item's slot is taken. See [Formula functions](#fonctions).
