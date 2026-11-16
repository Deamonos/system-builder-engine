**What it's for:** giving the world a date, a time, seasons and moons, that everyone sees and that rules can read. Time stays Foundry's: SBE splits it according to **your** calendar.

**Example:** turn on the calendar; a base calendar is created (12 months, 7 days, leap years, 4 seasons, a moon). In the clock, pick the "1 h" step and click ▶: time passes, the clock's sky follows, the scene darkens at dusk.

## Turning it on

**System settings** → **Calendar, clock and weather** (unchecked by default; the world reloads). The GM sets everything else in the editor: the gear of the clock or the calendar.

## The clock

- **Normal** (a dome-shaped sky, the date, the season, the time, the part of the day, the moons, the weather and the temperature) or **compact**.
- **Movable**; two spots take it in: above the player list, or to the right of the scene navigation. ⌖ puts it back at the top.
- **GM menu**: go back or forward by a **step** (from a minute to a day); jump to dawn, noon, dusk, midnight; let time pass on its own at a **speed** (×1 to ×360); set the date and time.

## The calendar

The month grid, each day's forecast, the moon phases. Click a day to open its panel (date, season, moons, weather, events).

**Events**: name, icon, color, time, repetition (once, every year, every month), note, **visible to players** or not. A document dropped on it (journal, scene) opens with a click.

## The editor

| Tab | What you set there |
|---|---|
| **General** | Name, starting year, hours per day, minutes per hour, seconds per minute, leap years. Several calendars possible; the star marks the one **in use**. |
| **Months** and **Weekdays** | Names, abbreviations, number of days (and in a leap year). |
| **Seasons** | Name, key, icon, start, temperatures, sunrise and sunset, and the **possible weathers with their weight**. |
| **Moons** | Name, key, cycle in days, offset, color. Its **phases**, each with its length, its color and an **effect** applied while it lasts. A **rare phase** replaces a normal phase every N cycles or with an X% chance (a blood moon). |
| **Weather** | See [Weather](#meteo). |
| **Display and options** | Date format, 24 h or 12 h clock, °C or °F, first day of the week. **Options**: players see the clock, the weather changes on its own, the time sets the scene's darkness, **indoor scenes**. |

**Export / Import**: calendars, weather types and display settings.

![The editor's Moons tab: the moon Selene, its 28-day cycle, and its eight phases with their length and effect](img/en/calendrier-lunes.webp)

## In the rules

- **Formulas**: `hour()`, `day()`, `month()`, `season()`, `moon()`, `moonPhase("full_moon")`, `isNight()`, `dayPart()`, `hasEvent("Feast")`… See [Functions](#fonctions).
- **Triggers**: every hour, new date, sunrise or sunset, change of season or moon phase, event. See [Triggers](#declencheurs).
- **Time**, **Season**, **Moon** steps: a spell that makes the night pass, imposes an eternal winter or raises a blood moon.

## Going further

Effects, waits, persistent zones and the new day already follow Foundry's time: moving the clock forward moves them along.
