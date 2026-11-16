**What it's for:** making an effect seen and heard. A token tinted green when poisoned, an aura of flames, a torch that lights up, goggles that see in the dark.

Everything is set in the effect manager, **Look and sound** block. Everything is optional.

## Sound

Played **when applied**, or **looped while the effect lasts**. Same rules as item media: who hears, range in scene units, falloff.

## On the token

| Setting | What it does |
|---|---|
| **Tint** | Colors the token, display only. |
| **Big icon** | The effect's icon, large, in the middle of the token. |
| **Discreet** | The icon is only seen by the GM and the owner. |
| **Animation on the token** | An image or a video that follows the token in a loop while the effect lasts (aura, fog…). When discreet, only the GM and the owner see it. |

A stacked effect shows **×N** on the token.

## Light carried by the token

Written on the token while the effect lasts; the original light comes back afterwards. If several effects give light, the strongest wins.

- **Dim** and **Bright** (the radii), **Color**, **Intensity**, **Angle**.
- Light **animation**, with **Speed**, **Strength** and **Reverse animation**.
- **Personal (seen by the bearer only)**: only the one looking through the token sees it.
- **Advanced settings**: attenuation, luminosity, saturation, contrast, shadows, coloration technique. Empty, they are Foundry's usual values.

## Giving a vision mode

**Gives a vision mode**: while the effect lasts, the bearer sees with this mode (darkvision, thermal…). Modes are created in the **Vision modes** manager.

- **Range** and **Angle**: empty, they are the token's.
- Several modes at once: the mode's priority decides.

## One value per item: "@key"

Each field accepts a number, a formula read on the bearer's sheet, or **`@key`** read on the item that gives the effect.

**Example:** a single "Lit" effect for every lamp. Its bright light is `@light_range`: the lantern has `12` in that field, the candle `3`. Each item lights up its own way with the same effect.

## Acts as Foundry status

In the manager's **Combat** block, **Acts as Foundry status**: Foundry's core also treats the bearer as having this status (blind, invisible, prone, flying…). Modules that read these statuses recognize it too.

**Example:** the demo's "Concealed" acts as "Invisible", and adds `+5` to stealth.

> Foundry's base conditions already do this by themselves. This setting is for your own effects (smoke, flash…).

## Going further

For a lamp, a torch or goggles, there is a simpler way: on the world item, **Media** tab, check **This item emits light**. A **Light** tab appears, with the item's light, sight and fuel.
