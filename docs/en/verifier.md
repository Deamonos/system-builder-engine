**What it's for:** a key is used in many places (formulas, effects, HUD, combat settings, chests…). The checker knows them all: it reports what doesn't work, and renames a key everywhere at once.

## Checking

Two ways to run the check:

- **One template**: ⋮ menu of its workshop → **Check template**. It checks this template and the settings that read its keys.
- **Everything**: system settings → **Check templates** → **Check** button.

![The checker's report](img/en/verifier-rapport.webp)

The report groups problems **by place**. The button on the right of a group opens the window concerned.

| Level | What it means |
|---|---|
| **Error** | This setting cannot work: key not found, effect or button not found, unreadable formula. |
| **Warning** | A formula reads a key that no template has: it will be 0 or empty. |

**Example:** the formula `strength + agility` while no template has an `agility` key gives a warning. Add the `agility` component, or fix the formula, then click **Check again**.

### When the world loads

When the GM opens the world, the report opens on its own if there are problems.

- A deliberate problem? Check **Don't warn me about these problems again**.
- To turn them back on: open the global report (system settings → **Check**), then **Warn again about everything**.

## Renaming a key

1. Open the component (✏) and change its **key**.
2. **Validate**: before anything is saved, the **Rename a key** window opens.

![The "Rename a key" window](img/en/renommer-cle.webp)

It shows:

- **what uses the key**: formulas, `{{key}}` texts, button steps, effects, HUD, tool settings, items, doors, chests, token bars…;
- **the other templates** that also have this key, checked. Checked, they are renamed too. Unchecked, they keep the old key, and shared settings (effects, HUD, tools) will no longer read them. A template that already has the new key is greyed out.

Then:

- **Rename everywhere**: values already entered follow the new key (sheets, items, carried items, tokens, unlocked compendiums), then everything that uses it is updated.
- **Cancel**: nothing is written, the component's window stays open.

**Example:** renaming `strength` to `might` also changes the formula `strength + agility` into `might + agility`, and Lys keeps her value of 10.

## Going further

- **Sub-keys** follow: `hp_max`, `hp_temp`…, as well as `carried("hp")`, `carrier("hp")` and `self_hp` in a "Choose an item" filter.
- A **locked compendium** is not changed: it is reported.
- The **calendar** is checked too: a Weather, Season or Moon step whose key no longer exists is an error. Changing a key in the calendar editor updates the steps that use it.
