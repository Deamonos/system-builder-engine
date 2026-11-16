**What it's for:** doors and chests you don't just walk through. A key, lockpicks, a keypad, a terminal to hack, an alarm on a wrong code.

**Example:** the house's front door, in the demo. A **Lock (picking)**: Mother Greyhair's key opens it without a roll; otherwise, a `lockpicking` roll, with the bonus of Lys's thieves' tools.

## Where to set it

- **A door**: the wall's configuration, **SBE — Door lock** box.
- **A chest**: its configuration, **Locking** → **Lock (picking)**. See [Chests and ground items](#coffres-sol).

## Lock types

| Type | How it opens |
|---|---|
| **Lock (picking)** | An accepted key, or a **lockpicking roll** (a roll key of the sheet, for example `lockpicking`). **Attempts before breaking**: beyond that, the lock breaks and can no longer be picked. |
| **Keypad** | The **code** (and its length). **Hackable**: a **hacking roll** can get around it. **Remember access**: the code is no longer asked after a success. **Alarm on wrong code**, with a sound. Too many attempts: the keypad is out of order. |

**Armored door**: closed, it stops explosions and area templates. A normal door lets them through.

## Keys and tools

Drag world items into the lock's boxes:

- **Accepted keys**: a character carrying a copy of one opens without a roll.
- **Accepted lockpicking tools**, **Accepted hacking tools**: a carried tool is used from the lock's window. Its field with the same key as the roll (for example `lockpicking`) is added to the roll.
- **Tool required**: you can only try with an accepted tool.
- **Roll even with a tool**: unchecked, an accepted tool opens without a roll.

**Lock difficulty**: **None**, a **Modifier** (positive = harder), or a **Fixed value** the roll is compared to. A formula is allowed.

## Opening

A player clicks the locked door or opens the chest: the lock's window offers what they can do. **Use the key**, **Pick** with a tool or without, **Hack**, **Enter the code**.

The GM can **reset the counters** (attempts, broken lock, keypad out of order) and **forget accesses** remembered.

## Tool wear

The **system settings** → **Lock settings**:

- **Enable tool wear** and the items' **wear field** (their durability).
- For each **roll result** (critical success, success, failure, critical failure): the **wear removed**, and whether it **destroys the tool**.
- **At 0**: the tool is unusable, or disappears. A stackable tool (single-use picks) loses one copy.

## Going further

For a door that opens with a lever, a terminal or a riddle, attach a [scene object](#objets-scene) to the door: its buttons open it.
