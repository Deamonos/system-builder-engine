**What it's for:** what stays on the map after an action. A fire still burning, a gas cloud, a healing aura; and traces: a wounded character's blood, footprints in the mud, a crater.

## Persistent zones

**Example:** an incendiary grenade. On the world item, **Zone** tab: **Leaves a persistent zone**, nature `fire`, a 2-cell **Circle** **at the impact point**, 3 rounds. Effect given: "Burning", **on entering, then every turn**.

A zone only **gives or removes effects** from the manager. Damage, healing and penalties are set in the effect.

| Section | What you set there |
|---|---|
| **Nature, trigger and shape** | The **nature** (`fire`, `water`, `smoke`: the word shared by zones of the same kind). **Placed by** each attack of the item. The **position**: at the impact point, on the target, attached to the caster (an aura), attached to the target. The **template**: circle, cone, line, or a drawn template. |
| **Duration** | In combat (rounds) and out of combat (minutes); the first to run out puts it out. Out of combat, the pace of repeated effects. |
| **Affects** | Everyone, everyone but the caster, allies, or only enemies (by token disposition). |
| **Effects given** | For each effect: in and out of combat, **on entering**, **each turn inside**, both, or nothing; **removed on leaving** or not; **only if** a formula on the token hit. |
| **Power and exclusions** | Two opposed natures never stay in the same place: the stronger one wipes out the other. A water zone (power 4) puts out a fire (power 3). Power can fade over time, and size with it. |
| **Overlap and repetition** | Two zones of the same nature touching: a single hit, each one hits, or they **merge**. Is a token that leaves and comes back hit again? |
| **Look and announcement** | The color, a tooltip or a chat message, **blocks sight**, a light. Images, videos and sounds: the item's **Media** tab, "Zone" part. |
| **Ground trace** | An image that stays when the zone goes out or right at impact: a burn, a crater, a puddle. Forever, for some game time, or until the new day. |

**Copy the zone of another item…** takes over all the settings of another world item.

## Ground traces

**Example:** blood. A character wounded below 80 % of their HP leaves a trail when moving; each hit taken leaves stains, bigger when the loss is heavy.

The **system settings** → **Configure traces**. One **trace type** per kind (blood, mud, oil…); blood is provided.

| Section | What you set there |
|---|---|
| **When** | The condition on a key (`hp` < 80 % of max, or always), in combat only, the **active effects** that also trigger it (Bleeding), the **templates concerned**. **Hidden (tracking)**: only the GM sees them. |
| **Stains on impact** | When the watched key drops: count, size, delay. |
| **Trail while moving** | One trace every N cells, facing the walking direction; alternating steps; nothing while flying. **Dragged body**: a long continuous trail when a downed token is moved. |
| **Look** | Shapes (splatter, drops, footprints, pool…), your own images, the color (or a Color key: each character has their own). |
| **Lifetime** | Kept in the scene or ephemeral; fading in real or world time; walls stop them. |
| **Footprints** | Who leaves which footprint: by template, character, key or owned item. Boot, hoof, wolf, tank treads, tentacle… |

### Tools

- **Track** (magnifying glass, token controls): the selected token's tracking roll; on success, hidden traces around it appear for that player.
- **Stain the selected tokens** and **Clean the scene's traces**: for the GM.
- A Foundry **region** can leave traces (mud, snow) or wipe them (rain).

## Going further

A zone that hits every turn relies on its **effects**: a "Burning" effect with a periodic effect does the damage. See [Effects that evolve](#effets-avances).
