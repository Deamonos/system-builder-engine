**What it's for:** looking up a value in a table, by range. It is useful for what a formula expresses badly: tiers, a damage scale, a wound table.

## Example: a bonus per tier

We want: Strength 1 to 9 → bonus 0, 10 to 14 → +1, 15 to 19 → +2, 20 and up → +3.

1. Add a **Table** with the key `tiers`, with three **locked** columns: `from`, `to`, `bonus`.
2. Fill the rows:

| from | to | bonus |
|---|---|---|
| 1 | 9 | 0 |
| 10 | 14 | 1 |
| 15 | 19 | 2 |
| 20 | 99 | 3 |

3. In the table's window, check **Make this table queryable from formulas**, then pick the **range columns**: `from` → `to`.
4. In the computed field `strength_bonus`, write:

```
table("tiers"; strength; "bonus")
```

With a strength of 12, `strength_bonus` is 1.

> Check **Hidden on the sheet** on the table to keep it without showing it.

## The three functions

| Function | What it returns |
|---|---|
| `table("key"; value; "column")` | The column of the row whose range contains the value. |
| `tableX("key"; value; "searchedColumn"; "returnedColumn")` | Looks the value up in a column other than the range, and returns another column. |
| `tableList("key"; "column")` | All the values of a column, one after the other. A third argument picks the separator. |

Table and column names are written in quotes; arguments are separated by `;` or `,`.

**Going further:** `table` accepts two more arguments, `exact` (exact match only) then a **default** value; `tableX` accepts a default value.

## Ranges

- The lookup compares the value with the two **range columns** (low → high).
- **Empty high bound**: the row only applies to the exact value of the low bound.
- **Outside every range**: the closest row answers. A strength of 0 gives the first row's bonus.

## Importing a ready-made table (CSV)

Prepare your table in a spreadsheet (Excel, LibreOffice, Google Sheets) and save it as **CSV**. In the table's window, **Import** loads it: the first row gives the column names. **Export** does the opposite.

> Importing **replaces** the whole content of the table.
