**What it's for:** building your sheets with the mouse. What you see in the workshop **is the final sheet**: no separate preview, no "code" mode.

The workshop is the window of a **template**: a character template (Actors tab) or an item template (Items tab). Both work the same way.

![A character template's workshop](img/en/atelier-modele.webp)

## Adding a component

Click a **+**. There is one at the top and one at the bottom of every area: the page, a frame, a column, a tab. The component is added **right there**.

The component's window has three tabs:

| Tab | What you set there |
|---|---|
| **Base** | What it is: type, key, label, default value, who sees it, who edits it |
| **Style** | What it looks like: label position, font, sizes, background, border |
| **Tooltip** | The text shown on hover on the sheet |

The Base settings you find everywhere:

- **Visible to players**: unchecked, only the GM sees the component.
- **Editable by players**: unchecked, the player sees it but cannot change it.
- **Hidden on the sheet**: the component exists (you can use it in a formula) but is shown to nobody, not even the GM.
- **Visible if (condition)**: a formula; the component only shows if it is true. Example: `poison > 0`.

## Editing, moving, deleting

Hover over a component: its **key** and three tools appear.

- ⠿ **drag**: move the component, including into a frame, a column or another tab.
- ✏ **edit**: reopens its window.
- 🗑 **delete**: never blocked. If other settings use its key, you are told which ones first.

> The ↶ ↷ arrows in the header undo and redo the workshop's changes (**Ctrl+Z**, **Ctrl+Y** or **Ctrl+Shift+Z**).

## The key

Every component has a **key**: its name for formulas, effects, rolls and every tool.

- It starts with a **lowercase letter**, then only contains lowercase letters without accents, digits or `_`.
- No uppercase, accent, hyphen or space: `strength`, `strength_bonus` and `mag_size` are valid; `Strength`, `strengh-bonus` and `mag size` are not.
- It is **unique within the template**.
- You can change it at any time: SBE renames it everywhere it is used. See [Checking and renaming a key](#verifier).

## The name and the portrait

A character template has two **native** components: the **portrait** and the **name**. They have no key: they directly show the sheet's image and name.

- Drag them wherever you want on the page.
- The 🗑 sends them back to the header: they cannot be deleted.
- The name can have a **sub-label**, a small text below it (example: "Identity").

## The workshop's ⋮ menu

At the top right of the window, the ⋮ menu gathers the template's tools:

- **Check template**: looks for what doesn't work. See [Checking and renaming a key](#verifier).

For a **character** template:

- **Template theme**: colors, fonts, sheet size when opened, sheet sounds.
- **Template HUD**: what is shown around the token.
- **Make it a shop template**: this template will be used by merchants.

For an **item** template:

- **Item sheets (title, sounds)**: the title of item windows and their sounds.

## Exporting and importing

At the top of the workshop:

- **Export structure** saves the template to a `.json` file.
- **Import a structure** loads an exported file, from this world or another.

Handy to share a template, or to keep it before changing everything.

## Going further

- The workshop **scrolls in full**, even "pinned" frames, which stay fixed on the sheet.
- The **sheet size when opened** is set in the template theme.
- Items also have their **tabs** and **options**: see [Template tabs and options](#onglets-options).
