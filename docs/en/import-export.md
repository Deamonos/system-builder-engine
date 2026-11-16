**What it's for:** taking a template from one world to another, sharing it with another GM, or applying a corrected version to a template already in play. What travels is the **structure**: the components and their settings, never the sheets' values.

**Example:** you built a "Weapon" template in your test world. **Export structure** gives a `.json` file. In the campaign world, **Import a template** recreates it as is.

## Exporting a template

In the workshop, at the top: **Export structure**. The file holds:

- every component, with its settings, style, CSS and place;
- the workshop's tabs, the **declared media** (the names, not the files), the **granted effects**;
- the template's options (stackable, icon markers, inactive if…);
- the **template theme**, its **HUD** and its **token bars**.

Nothing is written about world items or sheets: no values, no characters.

## Creating a template from a file

**Actors** or **Items** tab of the sidebar → **Import a template**. One template per file, several files at once. You can also drag the files onto the tab, or onto a folder to store them there.

## Importing into an existing template

In the workshop: **Import a structure**, then a file or pasted JSON. SBE asks what to do:

![The import question: Update, or Replace the whole structure](img/en/import-modes.webp)

| Mode | What it does |
|---|---|
| **Update** | A component of the file whose key already exists takes the file's settings, style and place. New ones are added. The rest of the template doesn't move, except inside a container the file describes: what it no longer holds is removed. |
| **Replace the whole structure** | The template becomes exactly the file; what it doesn't mention is removed. A confirmation reminds you. Handy to go back to a saved version. |

**In both cases, sheets keep their values**, stored by key. The **key** is a component's identity: renaming a key in the file makes it another component.

### The report

Before writing anything, SBE shows a report and waits for your **Yes**: how many components will be added, updated or removed, what else will change (the template theme, its HUD…), and what is **skipped**, with the reason:

- an unknown component type;
- an invalid key, reserved by the engine, or duplicated in the file;
- a Quantity component on a character template.

A skipped container takes its contents with it, and the report says so.

## Going further

A file can ask where to put a component in an existing template: in a frame, a column or a tab, before or after another key. Handy to deliver a "piece" of sheet to plug into another GM's template. If the requested place isn't found, the component goes at the bottom of the template, and the report says so.
