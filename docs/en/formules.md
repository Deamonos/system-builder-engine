**What it's for:** calculating a value from others. In a formula, **your keys are the variables**: `strength`, `hp`, `level`…

You write formulas everywhere: a number or gauge in computed mode, a maximum, a "Visible if", a button condition, an effect's amount, a critical threshold…

## Examples

```
strength + strength_bonus
ceil((agility + spirit) / 2)
hp <= 0 ? "Dead" : "Alive"
maxOf("hp") > 0 ? round(hp / maxOf("hp") * 100) : 0
```

## What you can write

| What | How |
|---|---|
| **Arithmetic** | `+  -  *  /` and parentheses. |
| **Comparisons** | `<  <=  >  >=  ==  !=` |
| **And, or** | `&&` (and), `\|\|` (or). Example: `wounded && hp < 10` |
| **If… then… else** | `condition ? value_if_true : value_if_false`. Example: `level >= 5 ? 2 : 1` |
| **Rounding** | `round` (nearest), `floor` (down), `ceil` (up) |
| **Other math** | `min`, `max`, `abs`, `sqrt`, `pow`, `clamp(value, low, high)` |
| **Texts** | In quotes: `size == "Large"`. A few safe methods: `name.includes("x")`… |

- A **checkbox** is `true` or `false`.
- A **dropdown list** or a **text** is the chosen or entered text.
- A function's arguments are separated by `,` or `;`.

> A template key named like a function (a `max` key, for example) takes precedence over the function. Avoid these names.

## What SBE does for you

- **Calculation order is automatic.** A formula that depends on another is calculated after it. A loop (A depends on B which depends on A) is reported, and blocks nothing.
- **An unknown key is allowed**, with a warning from the [checker](#verifier): it is empty (or 0) until it exists.
- **Contributions are counted.** Effects and equipment change your keys without ever rewriting the entered value: a formula always reads the total. Order: multiply, then add, then cap (at most), then floor (at least), then replace.

## Dice in a formula

In a "Set a field" button step, damage, or the amount of an effect that comes back every turn, a formula can **roll dice**:

```
2d6 + strength
undead ? -1d6 : 1d6
```

Each die is rolled, then the formula is calculated.

> **Computed** fields on the sheet never roll dice: their value must stay the same from one display to the next.

## Security

A formula is calculated by SBE's interpreter, never executed by the browser. It only reads your keys, the formula functions and a few safe methods of texts and lists. **An imported template cannot run anything else.**

## What next?

- All the functions (inventory, effects, calendar…): [Formula functions](#fonctions).
- Looking up a value in a table: [Lookup tables](#tables-correspondance).
