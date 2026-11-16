**What it's for:** a sheet with its own style. A sheet of yellowed paper for an explorer's notebook, a terminal screen for a robot, without changing the other windows.

## Opening a template's theme

In a character template's workshop: **⋮** menu → **Template theme**.

**Use the general theme on this template**: checked, the sheet starts from the system theme and applies your tweaks. Unchecked, it starts from Foundry's base look: the template is independent from everything else.

## Settings

| Setting | What it does |
|---|---|
| **Colors** (dark / light) | The palette of this template's sheets. |
| **Sheet mode** | **Follow Foundry**, **Always light** or **Always dark**. A sheet with its own style (paper, screen) keeps the same look for everyone. |
| **Title bar** | Visible, or **hidden frame**: the sheet goes up to the top, the buttons float over it, the window stays movable. |
| **Hide the sheets' title** | The title and its icon disappear; the buttons stay. |
| **Sheet size on open** | Width × height in pixels. Empty = automatic. The window stays resizable. |
| **Dressing** | A background texture (tiled or stretched) and a header image with a fade. |
| **SVG decorations** | Images laid on the window: pasted SVG code or a file, an **anchor** (top left, center…), an **offset**, a **size**, a **layer** (above or below the content), an **opacity**. A negative offset overflows: a crest that sticks out above the sheet. |
| **Advanced CSS** | `@modele` targets this template's windows: `@modele .window-content { … }`. |

**On-screen preview**, **Save**, **Reset**; **Export** and **Import** move a template's theme from one template to another.

## Sheet sounds

At the bottom of the same window, **Sheet sounds** block: a sound when the sheet **opens** and when it **closes**. They work even if the template uses the general theme. And on each tab of a **Navigation bar** (its window's **Media** tab), a **click sound**: a rustling bag for the Inventory tab.

Only the one opening or clicking hears the sound, on Foundry's **Interface** channel.

## Item templates

An item template only has the title and sounds: workshop's **⋮** menu → **Item sheets (title, sounds)**.

## Going further

A single component's style (color, font, border, texture) is set in its **Style** tab. See [Common settings, style and tooltip](#reglages-communs).
