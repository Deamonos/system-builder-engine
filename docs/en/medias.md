**What it's for:** giving an item its own voice. A bow doesn't sound like a crossbow, a fireball doesn't have a lightning bolt's animation. The template says **which** media are needed; each item picks **its own** files.

**Example:** the demo's "Weapon" template declares two media, `swing` and `impact`. A longbow will put a bowstring sound and a flying arrow there; an axe, a heavy swing and a crash.

## 1. The template declares the names

In the item template's workshop, **Media** tab: **Add a medium**.

- A **name**: `shot`, `impact`, `drink`. A lowercase letter first, then lowercase letters, digits or `_`.
- An optional **hint**, shown to the GM: "On use", "When the target is hit".

## 2. The world item picks its files

On the world item's sheet, **Media** tab (only the GM sees it): one block per declared name, with its hint.

![The longbow's Media tab: the "swing" block, its sound, audience, range and animation](img/en/medias-objet.webp)

### Sound

| Setting | What it does |
|---|---|
| **Sound** | The file (ogg, mp3, wav…). |
| **Volume** | From 0 to 100 %. |
| **Who hears** | **The whole table**, **The sheet's owner (and the GM)**, or **The GM only**. |
| **Range** | In scene units, or **everywhere**. |
| **Fade** | The volume drops with distance, down to silence at the edge of the range. |

The ▶ button in the block's header tests the sound and the animation.

### Animation

An image or a video (webm, mp4…) played on the scene, with the same audience and range as the sound. Its settings appear once a file is chosen.

| Setting | What it does |
|---|---|
| **Where** | **On the carrier**, **On the target**, **Trail carrier → target** (it stretches from the carrier to the target), or **At the aimed / impact point**. |
| **Size (cells)** | On a trail, it's the thickness. |
| **Image duration (s)** | For a still image. |
| **Transparent black background** | For effect videos on a black background: black disappears. |
| **Random rotation** | Each playback turns at random: repeated impacts don't look alike. |

**Next media after (ms)**: for the medium played first (an attack's shot), the outcome's medium (hit, miss) starts after this delay. Empty = at the end of the sound; `0` = at the same time.

## 3. A button plays them

- The **Play a media** step plays a declared name: sound, animation, or both.
- The **Attack** step has its own boxes: medium for the shot, the **hit**, the **miss**, the **critical**.

See [All the steps](#etapes-liste).

## Copies follow

A copy's sounds and animations are those of its world item. Set them on the world item: every copy follows.

## Going further

A sound that doesn't play? SBE says why: volume at 0 %, the **Interface** slider of Foundry's audio settings at zero, or a file the browser can't read (re-export it as OGG, MP3 or 16-bit PCM WAV).
