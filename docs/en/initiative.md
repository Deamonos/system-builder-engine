**What it's for:** deciding who acts when, and keeping the fight in view. Initiative rolls on its own, and the carousel shows the combatants' portraits in order.

**Example:** initiative is the sheet's `agility` field, which has its roll `1d20 + agility`. When you click **Begin Combat**, everyone rolls; the carousel appears, the active combatant first.

## Initiative

**Combat rules** → **Initiative**:

- **Field key**: a field of the sheet. If it has a roll, that roll is used; otherwise its value is the score. Or a **formula** (`1d20 + agility`). **Per character template**: a line for creatures, vehicles…
- **Roll automatically when combat begins**, and for a combatant added later.
- **Roll window**: advantage, modifier and visibility, for a combatant rolled by hand on its own.
- **Ties**: a tie-break formula, then at random, players first or NPCs first.
- **On a new round**: the score stays, or everyone rolls again.
- **Several turns per round**: at the end of a pass, each score drops by a **step**; those still above the **minimum** act again in the same round.

## The combat carousel

Turn it on in the **system settings** (**Combat carousel** checkbox), then **Combat carousel** → **Configure**.

- **Placement**: at the top (horizontal) or on the right (vertical). Each player switches with the ↕ / ↔ button; the GM sets the default position. The active combatant is always first; a "Round n" mark separates those who have already acted.
- **Buttons**: GM (combat, turns, initiative); players (**End my turn**, **Roll initiative**).

![The carousel in vertical position: Lys is acting (glow), the wolf is next, each with their initiative and bars](img/en/carrousel.webp)

| Tab | What you set there |
|---|---|
| **Display** | Size, shape (square, portrait, round), token or character image, name, initiative, animations. **Highlights**: the active combatant's glow, the "Next" tab, those who have acted dimmed, an icon on the defeated. |
| **Buttons** | The GM's and the players' buttons in the carousel bar. |
| **Bars and effects** | Two bars at most (key or formula, color, who sees it, numbers); the icons of active effects. |
| **Tooltip** | On hovering a portrait: header, chosen values, effects with their duration. |
| **Clicks** | Click = center the view; hover = highlight the token; double-click = the sheet. GM right-click: make active, hide, defeated, ping, remove. |
| **Visibility** | Defeated grayed out or removed; NPCs hidden until their first turn; NPC initiative shown or "?". **Rules**: when `hp <= 0` or an effect, hide, mark defeated or remove from combat. |
| **Theme** | SBE's, or its own (colors, rounding, frame). **Advanced**: CSS, SVG, image slots. |

## Going further

The **start / end of turn** and **start / end of combat** triggers run buttons on their own: see [Triggers](#declencheurs).
