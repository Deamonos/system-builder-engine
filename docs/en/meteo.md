**What it's for:** weather that changes with the season, that shows on the scene, can be heard, and weighs on the rules. Falling rain, a storm rumbling in the distance, a sandstorm that slows everyone down.

**Example:** in winter, the season offers `snow` (weight 3), `overcast` (weight 2) and `clear` (weight 1). Snow falls on the scene, the wind blows, and the "Cold" effect is applied to the scene's characters while it snows.

## How the weather is chosen

- **Natural**: rolled according to the season, at each **slot** of N hours. The bigger the weight, the more often it comes up. The roll is reproducible: the past doesn't change, and the coming days have their forecast in the calendar.
- **Imposed by the GM**: a click on the clock's weather badge opens the types; picking one imposes it until the next day or until further notice, with an optional temperature. **Natural weather** brings the roll back.
- **Imposed by a button**: the **Weather** step (a rain spell).

## Weather types

The calendar editor's **Weather** tab (the clock's gear). **Add the built-in types** brings back the base ones: Nature, Fantasy, Horror, Apocalyptic, Science fiction. A category's eye offers it in, or removes it from, the clock's menu.

![The Nature category's weather types, and the settings of "Clear sky": key, icon, temperature offset, sky and layers](img/en/meteo.webp)

| Setting | What it does |
|---|---|
| **Name, key, category, icon** | The key is read by `weather()` and the triggers. |
| **Temperature offset** | Added to the season's temperature. |
| **Effect** | An effect applied to the active scene's characters while this weather lasts. |
| **Clock sky** | Its own sky, and layers: clouds, rain, snow, lightning, mist, auroras… |
| **Effect on the scene** | One line per layer: a recolored Foundry weather effect (rain, snow, fog…) or an SBE effect (colored veil, lightning, sparks, auroras, shimmering air…), with its color and amount. |
| **Sounds** | See below. |

## Sounds

One line per sound: a sound from the **SBE library** (rain, winds, hail, thunder, fire…) or a file of your own.

- **Loop**: continuous. **Random**: comes back every min–max seconds. **On lightning**: plays with the scene's lightning; distant lightning arrives later and quieter.
- When the weather changes, the sounds fade out over 2 seconds and the new ones rise over 3.
- Each player sets the volume with Foundry's **Environment** slider; the **Weather sounds** checkbox in the system settings turns them off.

## In the rules

`weather()` gives the weather's key, `temperature()` the temperature. Example: a penalty `weather() == "storm" ? -2 : 0`. The **weather change** trigger runs a button (`eventName` = the key).

## Going further

**Indoor scenes** (calendar options) have no weather, no darkness and no weather sounds.
