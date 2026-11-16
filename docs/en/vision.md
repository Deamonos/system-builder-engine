**What it's for:** a lamp, night-vision goggles, a thermal camera. An item that gives light, or changes the sight of whoever carries it, when it is equipped and switched on.

**Example:** a lantern. On the template, a checkbox `lit` and a **Light / Put out** button (Change a field `lit` = `lit ? 0 : 1`). On the world item, **Media** tab, **This item emits light**; **Light** tab: when equipped, only if `lit`, dim `6`, bright `3`. Equipped and lit, it lights up around the token.

## An item's Light tab

| Part | What you set there |
|---|---|
| **Activation** | When it is **equipped** or **carried**; **Only if** a formula of the item (`lit`). |
| **Sight** | Checked, it **replaces** the token's sight while the item is active, then the original sight comes back. A **vision mode**, a range, an angle, an intensity, a tint. Unchecked, the base sight stays (a lamp). |
| **Light** | Dim and bright radius, angle, color, animation, advanced settings; **seen by the carrier only** for goggles. |
| **Battery** | A key of the item drops over game time while it gives light (oil, a battery); at zero: nothing, one unit of the stack, or it disappears. |

Each field accepts a formula read on the item. Several lit items: the last sight switched on wins; for light, the strongest. A **Blind** effect overrides everything.

## The sheet's base sight

Two fixed keys: a `sight` field gives the token's **sight range**, `sight_angle` its **angle**. Bonuses and effects count: an effect that lowers `sight` reduces the sight. All of the character's tokens follow.

## Vision modes

**System settings** → **Vision modes**: the world's modes (night vision, thermal…), to rename, set up, duplicate, or create.

- **On-screen look**: tint, **see in the dark** (no, yes, amplified), brightness, saturation (−1 = black and white), contrast, grain, **heat halo** on tokens.
- **Perception**: **sees invisible tokens**, **spots through walls** (with a range), a **condition on the target** (spots only if, hides if), and what else it spots: characters, placed items, traps.
- **Priority**: with several active modes, the highest priority wins.

![The Night vision mode: see in the dark, the on-screen look and what the mode spots](img/en/modes-vision.webp)

**Thermal vision**: a token has no halo if it carries a "Hidden from thermal vision" effect, or if the GM marked it with the thermometer in its sheet header.

## Animated lights

Six animations are added to every Foundry light: screen sweep, alert, night-vision grain, radar, failing neon, short circuit.

## Going further

The scene must have **token vision** turned on, otherwise no sight shows. An effect can also carry a light or blind: see [Effect appearance](#effets-apparence).
