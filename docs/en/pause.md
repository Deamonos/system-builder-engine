**What it's for:** replacing Foundry's pause screen with your own. A pulsing logo, a line that types itself letter by letter, a dark band across the screen, one sound when the game stops and another when it resumes.

**Example:** an inn. The media is a hanging sign (an image), the text "The game will resume shortly…" sits below it, with a **Typewriter** appearance and a continuous **Float**. A black band at 60% opacity crosses the screen, and a bell rings when the game is paused.

## Where to set it

**System settings** → **Pause Banner** → **Configure Banner** (GM).

Until you save something, Foundry's own banner stays. From your first **Save**, yours replaces it for every player.

![The pause banner window: media, text, background band, position and animation, sound](img/en/pause.webp)

## The sections

Each section has a checkbox to turn it on or off.

| Section | What you set there |
|---|---|
| **Media** | An image, a gif or a video (png, jpg, gif, webp, svg, avif, mp4, webm, ogv, m4v), and its **height** in pixels. |
| **Text** | The **displayed text**, the **font** (Foundry's fonts, including yours), the **size** (in em) and the **color**. **Position**: above the media, below the media, or **free**: two X / Y sliders place it anywhere on screen. |
| **Background Band** | The band across the screen: **color**, **opacity**, **width** (%) and **height** (pixels). |
| **Position & Animation** | Where the media + text block sits (**horizontal**, **vertical**, in %); the band stays centered on the screen width. **Darken the whole screen**: a veil behind the banner (0% = none). Then the three animations, below. |
| **Sound** | A sound **on pause**, another **on resume**, and the **volume**. |

## The animations

- **Appearance**, with its **duration** in seconds: fade, slide from the top, bottom, left or right, zoom in or out, bounce, tilt, blur to sharp, **typewriter** (the text types itself letter by letter).
- **Continuous animation**, while the game is paused: pulse, float, sway, heartbeat, neon flicker.
- **Disappearance**, on resume: fade, or **reverse of the appearance**.

**None** is always available.

## Preview and buttons

- **Preview** shows the banner on your screen, without pausing the game or saving anything. **Stop preview** removes it.
- **Save** applies the banner for everyone.
- **Reset** restores every default setting (with a confirmation; it is immediate).

## Going further

A font missing from the list is added in Foundry: *Configure Settings* → *Additional Fonts*. It then shows up here, as in the [theme](#theme).
