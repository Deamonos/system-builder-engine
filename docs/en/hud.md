**What it's for:** an on-screen bar to play without opening the sheet. Roll a check, strike with the weapon in hand, drink a potion, cast a spell filed in a menu.

**Example:** a **Spells** menu into which you drop the "Grimoire" list, sorted by "School". Each school becomes a submenu, in its choice's color: Spells › Fire › Fireball. A new fire spell files itself.

## Where to set it

One HUD **per character template**: an "Adventurer" template and a "Beast" template each have their own. The template workshop's ⋮ menu → **Template HUD**, or **system settings** → **HUD**. It travels with the template export.

The player sees the HUD of the character they control (selected token), otherwise their own character's.

![Elara's HUD in the demo: Spells › Fire › Fireball, and the Hit points and Mana values in the bar](img/en/hud.webp)

## The Configuration tab

On the left, the template's **sources**; on the right, the HUD's **tree**. Drag a source into the tree (double-click: at the end). Dropped on the top or bottom of a line, it goes before or after; on its middle, it goes **inside** the menu.

| Source | In the HUD |
|---|---|
| **Menu** | A button that opens a panel; a menu can hold submenus. |
| **Separator** | A line between two groups. |
| **Value** | The label and the value ("22 / 30"). If the field has a roll, clicking rolls it. |
| **Sheet button** | The same button as on the sheet, grayed out with its reason when it can't be used. |
| **Slot** | The item it holds; click for its actions, right-click for its sheet. |
| **List** | Each item of a list. **Tags**: keep only those. **Sort into submenus by**: one submenu per value of a field. |
| **World item** | Dragged from the sidebar: the copy the character carries. |

**Settings**: menus open on hover or on click; empty slot hidden or grayed out; an item with a single action runs it in one click. An entry's pencil sets its label, its icon, its border color and **Visible to players**.

**Small buttons** (next to the padlock): the **action of an equipped item** (example `light`: it only appears if an equipped item has that button; **Pressed if** `lit`) or a **sheet button**.

## The Appearance tab

- **Theme**: a dark and a light version, which follow Foundry. Each color has its opacity: below 100%, the map shows through, blurred.
- **Layout**: bar direction, **starting position**, icon and/or label, sizes, spacing, rounding, menu width. **Header**: the character's portrait and name, at the top, bottom or side; it is the handle to move the HUD.
- **SVG decorations** and **custom CSS** (`@hud`).

**Preview** at the bottom of the manager, with a character of this template or without; **On-screen preview** tries the settings on the real HUD.

## For the player

The handle moves the HUD (its position is kept), the padlock locks it, the sheet icon opens the sheet. **Hide the macro bar** and **Reset position** are per-player settings.

## Going further

A value shown under an item in the HUD (ammunition, charges): tick **Show in the HUD** on the item template's field. See [World items](#objets-monde).
