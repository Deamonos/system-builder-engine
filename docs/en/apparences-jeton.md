**What it's for:** several faces for one character. Their outfits, their forms (human, wolf), a disguise, or an image that changes by itself when they are wounded or enraged.

**Example:** a werewolf. A folder with two images, "Human" and "Wolf". A rule: when the `rage` effect is active → "Wolf". Once the effect is gone, they turn human again.

## Preparing the looks

Token configuration (or prototype token), **Appearance** tab, **Token looks** box → **Configure**. GM only.

- **Image folder**: one folder per character; each image is a look. **Reload** after adding or removing images. The sheet's portrait doesn't change.
- For each image, everything is optional: **Label**, **Width** and **Height** in cells, **Scale**, **Displayed name** on the token.
- **Disguise**: players see this image, the GM sees the true look. **The owner also sees the true face under a disguise** is a separate checkbox.
- **Make default**: the starting look.
- **Transition**: an effect on change (fade, swirl, glitch, hologram…), its duration, a sound.
- **Players cannot change look**: only the GM chooses.

## Changing look

From two images on, the **token HUD** has a **Look** button: a click on an image applies it.

## Automatic looks

**Rules** in order; the first one met wins. When none is met anymore, the token goes back to the look chosen by hand, otherwise the default one.

| When | Example |
|---|---|
| **A key**, compared to a value | `hp` ≤ `0` → "Down". |
| **An effect is active** | `rage` → "Wolf". |
| **Shop** (a merchant) | **Open** → the open stall, **Closed** → the shutters down. |

## Going further

A look set by a rule is flagged in the HUD. For bars on the token, see [Token bars](#barres-jetons).
