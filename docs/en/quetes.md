**What it's for:** tracking each group's quests, handing out rewards, and showing players where they stand.

**Example:** **Journal** tab → **Quest journal**. Drag the group on the left, **+ Quest** "The Forest Wolves", two objectives, 100 coins in total, then **Announce**. Once the wolves are chased off: **Completed**, the split opens, the money is handed out.

## The journal

Create a journal of type **Quest journal**. On the left, the **sections**: drag a **group** (its members follow) or characters. Each player only sees the quests of their characters' sections. The window's ⋮ menu (GM) → **Rename the journal**.

**Quest tabs**: at the top of the Quests tab, "All" then your own tabs (a community, a guild, a country…). The **+** creates one (name, icon, hidden from players); on hover, the pencil edits it and the trash can deletes it, without deleting its quests. A quest picks its tab in the **Tab** field; created while a tab is shown, it goes into it. A player only sees the non-hidden tabs that hold one of their quests.

**Configuration** (journal tab, GM): the **reward and penalty stats** (character key, label, icon, add / subtract / set), penalties yes or no, categories, **statuses** (the four built-in ones can be renamed, you can add more), sounds, automatic completion.

## A quest

| Part | What goes in it |
|---|---|
| **Giver** and **place** | A character, a name or anonymous; a dragged scene or journal, or a text. |
| **Objectives** | Checkboxes or counters, sub-tasks; optional, hidden, failed. Green = done, red = failed. |
| **Rewards and penalties** | Values, world items, levels; **per person** or **in total**. |
| **Deadline** | A day and an hour of the calendar. |

- **Hidden**: a new quest is. It appears with the eye, **Announce**, a button's **Quest** step, or **Appears if** (a formula true for a member).
- **Done if** (an objective's lightning bolt): a formula read on the members, `carried("red_key") >= 1`, or on a dragged target, `hp <= 0`. The objective ticks itself.

![The demo's "The restless dead" quest: giver, place, description, objectives (checkbox and counter) and rewards](img/en/quetes.webp)

## Ending a quest

**Completed** (rewards), **Failed** (penalties), **Cancelled** (nothing). "In total" rewards open a split window, prefilled in equal shares. A card sums it up. **Reopen** puts the quest back in progress without taking anything back.

## The on-screen tracker

The scroll in the left bar: quests in progress, tracked by default (the journal's pin removes or restores them). Each quest folds.

## Going further

A button's **Quest** step gives a quest, advances an objective, reveals it or changes its status: a found scroll that starts the quest. See [All the steps](#etapes-liste).
