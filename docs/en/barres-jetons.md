**What it's for:** bars on tokens, your way. HP in green turning red, an inverted stress bar, a segmented shield, a beating heart when near death.

**Example:** an "HP" bar: value `hp`, at the bottom of the token, colored by value. A step below 25 %: term "Near death", "Heartbeat" animation. Players see the term on enemies, the GM sees the numbers.

## Opening the bars

The **system settings** → **Token bars**. On the left, the scope:

- **All characters**: everyone's bars;
- **a template**: **Own bars**, **Follows All**, or **All + own**;
- **a token**: in the token configuration, **SBE bars** box. Only what you change is kept for that token.

**Also keep Foundry's bars**, **Hide hostile bars from players** and the height are set there too.

![The demo's Adventurer template bars: HP and Mana, with the preview and the HP bar's tabs](img/en/barres-jetons.webp)

## A bar

**Add a bar**, then its tabs. On the right, a live preview shows the bar: drag the **Value**, simulate a loss or a gain with the two buttons, and pick **Seen by** to see what a player sees.

| Tab | What you set there |
|---|---|
| **Value** | A key (`hp`) or a formula (`hp + shield`), the maximum and minimum (empty = the gauge's). **Invert**: full at 0 (stress, hunger). **Editable in the HUD**. |
| **Place** | The **edge** (top, bottom, left, right), inside or outside, the **row** (bars on the same row share the width), indents, thickness, offset. |
| **Look** | The shape (rounded, pill, chevron, segmented…), the color (by value, gradient, solid), the background, outline and relief, images (fill, shape, frame), motion (the bar slides, flash on loss or gain). |
| **Text** | The numbers (value / max, value, percentage), inside or beside, a prefix, size and color. **Floating values** (−12 / +5) when the value changes. |
| **Visibility** | For the GM, the owner, other players: always, on hover, when selected, never. **Who sees the numbers**, **who sees the step term**. An **approximate value** for those who don't see the numbers. **Hide when** full, empty, in combat. **Visible if** a formula. |
| **Steps** | The first matching step applies: color, pattern, animation (pulse, heartbeat, embers, ECG…), **term** ("Wounded"), token halo, a sound when crossing it. |

**Export** and **Import** move bars from one world to another, or a single bar.

## Going further

The Bar Brawl module does the same thing: if it is active, SBE warns you to avoid two sets of bars.
