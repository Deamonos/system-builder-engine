**What it's for:** shops where players buy, sell, buy back and haggle. A blacksmith, an apothecary, a peddler set up by the road.

**Example:** Bertrand the smith, in the demo. He sells weapons, armor and shields, with a 10 % markup.

## General settings

The **system settings** → **Merchants and currencies**:

- **Currencies**: the game's coins (gold, silver, copper…), also used by trades and chests.
- **Items and prices**: the item templates' **price key** (in base unit, the smallest coin); **what merchants sell** and **what merchants buy back**, by item family (workshop template), with exceptions.
- **Shops**: the shops' look. The base shop is built in. Shop templates are managed here: **New shop template** (empty) or **Copy the base shop to edit it**; clicking a template opens it in the workshop, the trash can deletes it (its merchants switch to the default template). "Create Actor" does not offer shop templates.

## Creating a merchant

- **A character**: the **Merchant** menu of their sheet (GM), then **This is a merchant**.
- **A scene object**: the **Place a merchant** tool (the stall) in the token controls, a name, an image, then a click on the scene. Its settings open next.

## A merchant's settings

| Section | What you set there |
|---|---|
| **Sales** | **Price markup** (30 = +30 %, −10 = a discount). **Players' purchases and sales**: **Immediate** or **Approved by the GM**. |
| **Cash** | **Merchant's money**: **Unlimited**, **The currencies on their sheet**, or **Their own till**. It's what they can pay, and where the money from their sales goes. |
| **Selling to the merchant** | **The merchant buys players' items**, at a **Buyback price** (% of the price, or a formula on the item sold: its condition, its rarity). **An item sold by a player** joins the stock, or is kept for the seller to buy back. **The seller can buy back what they sold**, at the price received, the current price, or by a formula. |
| **Negotiation** | The % of each outcome (critical success, success, failure, critical failure), offered when the GM starts a negotiation. Positive = in the player's favor. |
| **Access** | **Maximum distance** to open the shop; 0 = from anywhere. |
| **Sounds** | **Shop opening** and **Shop closing**, **Purchase**, **Sale**, **Buyback (history)**. Empty, the buyback uses the purchase sound. |
| **Shop template** | Their shop's look. |

**Shop open**: unchecked, players can no longer open it. The token's open / closed look is set with [token looks](#apparences-jeton) ("Shop" rule).

## Stock

In the shop, the GM **drags items** onto the stall. Right click on an article to set it up:

- **Quantity** (or unlimited), **Forced price** (empty = the price key, with the markup);
- **Restocking**: **never**, **every new day**, or **after some game time**; **refill to** a quantity.

An item carried by the merchant themselves is a **unique copy**: it leaves their sheet when bought.

![Bertrand's shop seen by the GM: the buyer's purse, the Buy, Sell, History tabs, and the stall sorted by category](img/en/boutique.webp)

## Player side

Double-click the merchant (or their token) with your character close enough:

- **Buy**: a click on an article, the quantity, the total.
- **Sell**: drag an item from your inventory onto the selling zone. The buyback price shows before confirming.
- **History**: every transaction. A sold item can be **bought back** if the merchant allows it. The GM can **block buyback** on a line or delete it.

## The shop's display

It is set on the shop template's **Stall** component: **List**, **Icon grid** or **Spatial grid**; **tabs** by item family or by the value of a key (category, rarity); the remaining quantity; sold-out articles greyed out or hidden.

## Going further

A custom shop is a shop template created in the manager (above), or a character template turned into a **shop template** (workshop's ⋮ menu: **Make it a shop template**). You place the shop components there (purse, till, stall, selling zone) with everything else the workshop offers.
