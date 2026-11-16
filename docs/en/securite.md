**What it's for:** playing without worry. A wrong action can be undone, a deletion never leaves things half-done, and a shared template cannot run anything on your machine.

## Going back

**Example:** a player drinks the wrong potion. Under the action's card in the chat, the GM clicks **Undo**: the potion is back in the inventory and the HP return to their previous value.

![Under the card of Brann drinking a potion, the GM clicked Undo: SBE lists the action to undo and waits for Confirm or Keep](img/en/annuler.webp)

SBE records every **action**: a button run (by a click, by a trigger, at the end of a wait) or a gesture on a card (damage applied, a reroll). Everything it changed is kept: sheets, items, effects, tokens, zones, tiles, walls, lights, combatants, settings.

- **Undo** (under the card, GM): SBE lists the actions to undo and asks for confirmation. Undoing an action also undoes **every action that came after it**, from the most recent back to that one.
- **Redo**: on an undone card, brings back what was just undone. A new action clears whatever could still be redone.
- **Action history** (the clock icon under the card, or system settings → **Open the history**): the table's latest actions, most recent at the top. **Go back here**, **Undo the last one**, **Redo**, **Clear**.
- **Shortcuts** (GM): **Ctrl + Alt + Z** to undo, **Ctrl + Alt + Y** to redo. They can be changed in Foundry's controls.

**What cannot be undone:** whatever has already happened at the table. Dice rolled, sounds played and chat messages stay. Going back triggers nothing: no reaction, no resistance roll, no trail.

Players can see that a card was undone, but only the GM can go back.

**Settings** (system settings): **Undo: enabled** (unchecked, nothing is recorded and no card offers "Undo") and the **history size** (20 actions by default, from 5 to 100; the oldest drop out).

## Nothing is left half-done

- **Deleting a workshop template** shows what depends on it, with the numbers: the world items, the copies carried and who carries them, the ones elsewhere. Once confirmed, everything goes together, on every scene.
- **Deleting a world item** removes its copies; if some remain in chests, SBE offers to delete them too.
- **The contents of a deleted item** (the weapon on a rack, the items in a bag) go back to its carrier's inventory.
- **When the world loads**, the GM is warned about items left without a template (**Orphaned items**: delete, or later) or items **stored nowhere** (delete, or store them in the inventory). Items whose container has vanished are put back in the inventory.
- No deletion is ever blocked without an explanation: you see what goes, and you decide.

## Values that are always right

- **Limits are always respected**: a value comes back between its minimum and maximum, whatever the path (typing, button, effect, macro).
- **One write at a time**: effects, durations, lights and zones are written by the connected GM. Two players acting at the same moment never step on each other.
- **Nothing is lost for lack of room**: an item received with no room waits in the container's waiting area, never silently deleted. See [How SBE stores items](#inventaire).
- **A token's vision always comes back**: a lamp switched off or a Blind effect that ends gives back the original vision exactly as it was.

For setup mistakes (a key that can't be found, a formula that can't be read), see [Checking and renaming a key](#verifier).

## A shared template stays safe

You can import another GM's template without risk:

- **Formulas** are computed by SBE, never by the browser: they only read your keys and the formula functions.
- **HTML, SVG and CSS** are cleaned: scripts, iframes and event handlers are removed.

## Immersion, not a secret

NPC identities, unidentified items and languages scramble what the player **sees**. The original text still reaches their computer: a player digging through the browser console can read it. It is made for the game, not to hide information from a cheater.
