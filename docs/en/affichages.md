**What it's for:** the components that **show** information: a table, a chart, calculated HTML, the list of effects. And a few special components.

## Table

A grid of rows and columns, filled in the template, on each sheet, or both.

**Example:** a "Ranges" table on a weapon template, with a locked "Distance" column (Short, Medium, Long) filled in the workshop, and a free "Penalty" column entered on each weapon.

Each column has its type (the column's pencil):

- **Locked**: filled in the workshop, the same for every sheet.
- **Free**: entered on each sheet or item.
- **Computed**: a formula that reads the row's other columns and the sheet's keys.

And also: each column's **width** (px), the **number of columns** and the **number of rows**.

> Reducing the number of columns or rows deletes the last ones, with their contents.

**Going further:** a table can become a **lookup table**, read by a formula: a value between two bounds gives a result (a score of 14 gives a +2 bonus). See [Lookup tables](#tables-correspondance).

## Chart

Values as a picture, updated live: an attributes radar, skill bars…

**Example:** a radar; drag your `strength`, `agility` and `spirit` fields **into** the chart.

![An attributes radar on a sheet](img/en/graphique-radar.webp)

- **Chart type** and **Appearance**:

| Type | Appearances |
|---|---|
| Radar (spider web) | Classic, Comparative (2 series) |
| Line | Line, Area (filled) |
| Bar | Bars, Lollipop, Dot plot |
| Column | Classic |
| Pie | Pie, Doughnut, Nightingale rose |
| Waterfall, Funnel, Pictograms (repeated icons) | Classic |

- **Scale Min → Max**: empty, it uses the fields' bounds.
- **Size**, **Main color**, **Show values**.

**Fields dragged into the chart become its data.** Only **numbers** and **gauges** are accepted. Removing a field sends it back to where it was; deleting the chart does not delete its fields.

A value changed by an effect shows in green (bonus) or red (penalty).

## Free HTML

To show what no component does: a screen, a dial, a special layout. The content updates live.

**Example:** `<b>Status:</b> {{= hp < 30 ? "CRITICAL" : "STABLE" }}`

- `{{key}}` shows a value.
- `{{= formula}}` shows a calculation.

> **Security:** the HTML is sanitized when displayed: scripts, iframes and event handlers are removed. A shared template can never run code on your side.

## Active effects

The list of effects on the character.

For each effect: its icon, its name (×N if stacked), what it does ("Agility +10", green for a bonus, red for a penalty) and the time left. The red cross removes the effect (GM and owner). The description shows on hover. With no effect: "No effect".

## Quantity (items)

The size of a stack, shown and editable. It only exists if the template is **stackable**, and there is only one per template; its key is fixed: `quantity`.

## Template component

Only in the **Panel once placed** tab of a scene-item template: it shows, in the placed item's panel, a component already on the sheet (a gauge, a slot, a button). It is **the same** component (same key, same value), nothing is copied.

- **No label**, or a label of your own (empty = its own).

## The other components

The **action button**, the **slot**, the **container**, the talent **tree** and the **level** each have their own chapter: they are full mechanics in their own right.
