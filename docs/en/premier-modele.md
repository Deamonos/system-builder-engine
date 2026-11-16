**What it's for:** building a real template from A to Z, then creating a character with it. By the end, you will understand 80% of SBE.

We will make an "Adventurer" template with **Strength** and **Hit points**, then create **Lys**, an adventurer.

## Step 1 — Create the template

1. Open the **Actors** tab of the sidebar.
2. Click **Create Actor**.
3. In "What to create?", keep **Template**.
4. Name: `Adventurer`, then **Create**.

![The creation window, on "Template"](img/en/creer-modele.webp)

The template's workshop opens. It is empty: that's normal.

> As long as no template exists, the "Character" choice is greyed out: a sheet is always created **from** a template.

## Step 2 — Add Strength

1. Click the **+** in the middle of the workshop.
2. **Type**: `Number`.
3. **Key**: `strength`. **Displayed label**: `Strength`.
4. Further down, **Default value**: `10`.
5. **Validate**.

![The "Add a component" window](img/en/ajouter-composant.webp)

The Strength box appears in the workshop. What you see in the workshop **is the final sheet**.

## Step 3 — Add Hit points

1. Click the bottom **+** (it adds at the end).
2. **Type**: `Gauge`.
3. **Key**: `hp`. **Displayed label**: `Hit points`.
4. **Min → Max**: `0` → `20`. **Default value**: `20`.
5. **Validate**.

Hover over a component: its key and three tools appear at the top right.

- ⠿ to **drag** it elsewhere;
- ✏ to **edit** it;
- 🗑 to **delete** it.

![The workshop with Strength and Hit points, the mouse over the gauge](img/en/atelier-modele.webp)

> A mistake? The ↶ ↷ arrows at the top of the workshop undo and redo (**Ctrl+Z** and **Ctrl+Y**).

## Step 4 — Create Lys

1. Close the workshop, then **Create Actor** again.
2. "What to create?": **Character**.
3. "From which template?": **Adventurer**.
4. Name: `Lys`, then **Create**.

![Creating a character from the Adventurer template](img/en/creer-personnage.webp)

Lys's sheet opens with its default values: Strength 10, Hit points 20 out of 20.

![Lys's sheet](img/en/fiche-lys.webp)

## Step 5 — Change the template

Reopen the "Adventurer" workshop and add a `Number` with the key `luck`. Reopen Lys: **she now has a Luck field**. Sheets always follow their template's structure.

## Going further

- Put Strength next to HP: a **Columns** component, then drag both components into it.
- Make a number **computed**: check "Computed mode" and write a **Formula**, for example `strength * 2`.
- Split the sheet into **tabs** with a **Navigation bar**.
- Want complete examples? Install [the Brumeval demo](#demo) and open its templates: everything in it is set up with the mouse.
