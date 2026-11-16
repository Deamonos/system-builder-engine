**What it's for:** the settings found on **every** component: who sees it, who edits it, what it looks like, what it says on hover.

## Base tab: who sees, who edits

| Setting | What it does |
|---|---|
| **Displayed label** | The text in front of the component. Empty, the key is used as the label. |
| **Label icon** | A Font Awesome icon, an emoji or an image, chosen in the picker (search in English or French). |
| **Visible to players** | Unchecked, players don't see the component; the GM sees it with a **struck-through eye**. It is hierarchical: a hidden frame hides everything in it. |
| **Editable by players** | Unchecked, the player sees the value but cannot change it. |
| **Hidden on the sheet** | Never shown, not even to the GM, but the key can still be used in formulas. Ideal for a calculation key such as `strength_bonus`. |
| **Visible if (condition)** | The component only shows if the formula is true. Example: `poison > 0`. |
| **Propagate to existing items** | Item templates only, checked by default. When the value changes on a world item, SBE offers to carry it over to its copies. Uncheck it for a value specific to each copy (wear, condition). See [The basic ideas](#idees). |

## Style tab: what it looks like

Everything is optional: anything you don't set keeps the theme's style.

- **Label**: color, size, font, bold, italic, uppercase, and **position** (left, right, above, below; aligned left, center or right).
- **Value**: color, size, bold, italic.
- **Component**: background color, **background texture**, **transparent background**, border color and thickness, **corners** (default, square, slightly or strongly rounded).
- Then the settings specific to the type: a frame's banner, a gauge's colors, a chart's web…

**Going further:** **Enable advanced CSS** opens a field to write your own CSS declarations, applied to this component only. Write declarations without a selector, for example `letter-spacing: 2px;`. To style the whole sheet, use the **Template theme** (workshop's ⋮ menu).

## Tooltip tab: what it says on hover

Check **Enable tooltip on hover**, then:

- **Content**: your text, with `{{key}}` to show a value and `{{= formula}}` for a calculation.
  Example: `Load: {{weight}} / {{= maxOf("weight")}}`.
- **Show the formula** (computed field): the formula is shown below the text.
- **Show the key's contributions**: the detail of what changes the value, one line per source, green for a bonus and red for a penalty. This includes sub-keys (`_bonus`, `_min`, `_max`…), carried items and every **effect** on the key, with its icon and amount.
- **Show the base** ("2-in-1" number): the entered value, before bonuses.
- **Text color**.

> A component's tooltip is the same everywhere: on the sheet, in the token HUD, in a placed item's panel.
