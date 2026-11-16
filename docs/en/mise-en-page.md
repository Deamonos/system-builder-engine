**What it's for:** organizing the sheet. These components hold no value: they group, align and split the others.

![A demo sheet: a pinned header, a tab bar, two frames in columns](img/en/fiche-onglets.webp)

## Frame

A box that groups components, with a title. Drag components into it (⠿), or use its own **+**.

**Example:** an "Attributes" frame holding Strength, Agility and Spirit.

- **Collapsible**: a caret opens and closes the frame. **Collapsed by default** closes it when the sheet opens.
- **Caret position**: left, middle or right.
- **Title position**: in the frame (banner) or above it.
- **Invisible**: no bar or border. The frame only groups.
- **Pinned to top**: a top-level frame stays fixed while the rest of the sheet scrolls. Ideal for a header (name, portrait, HP).

**Going further: free placement.** The frame no longer stacks its components one under the other: you place each one wherever you want, with the mouse. The position counts in % (it follows the sheet's width) or in px (anchored to the corner, ideal over a background image), with foreground and background. The frame grows to hold what you place in it.

## Columns

Components side by side.

**Example:** 2 columns, an "Attributes" frame on the left and a "Combat" frame on the right.

- **Number of columns**: from 2 to 10. Reducing it brings the extra content back into the last one.
- **Column widths** (%): the total stays at 100% on its own, 5% minimum per column.
- **Same height for all columns**: they take the height of the tallest, and the last component of each column stretches down to the bottom. Two frames side by side end on the same line, with no gap below.

> **Automatic alignment:** within the same column, frame or tab, labels placed on the left line up. The label column takes the width of the longest one (130 px at most), and every box lines up below.

## Navigation bar and tabs

Splits the sheet into tabs: Attributes, Inventory, Spells, Notes…

1. Add a **Navigation bar**.
2. Add tabs to it (the bar's **+**).
3. Fill each tab: click it in the workshop, then **+**.

**Bar settings:**

- **Orientation**: horizontal (tabs aligned left, center or right) or vertical (bar on the left or right).

**Tab settings** (its pencil):

- **Icon**: Font Awesome, emoji or image; and a **tooltip**.
- **Visible to players**.
- **Sound on click** (Media tab of its window): a file and a volume, played when switching to this tab. Example: a bag sound for Inventory. Only the person who clicks hears it.

## Separator

A line between two parts, or a full-width **separator image** (banner, ornament). Adjustable **height**.

## Tags

Badges at the top of the sheet: "TWO-HANDED WEAPON", "MAGIC", the rarity…

**Example:** a line `WEAPON`, then a line `@category`: the second badge shows the value of the `category` field.

- **One tag per line.** `@key` makes a badge linked to a field. For a checkbox, its label is shown when it is checked, nothing otherwise.
- **Highlight**: which tags take the accent color — linked ones (`@key`, default), the first, all or none.
- **Position**: above the header, or in the header, just above the name.

**Going further:** slots and containers can **filter** items by tag ("only accepts WEAPON").
