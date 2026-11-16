/**
 * SBE — MARCHANDS : stock (MJ) et achat
 *
 * Stock, réglé par le MJ dans la boutique :
 *   - un objet du monde glissé sur l'Étal : un article (exemplaires neufs) ;
 *   - un objet porté glissé : un exemplaire unique (copié chez le marchand
 *     s'il vient d'ailleurs) ;
 *   - clic droit sur un article : quantité, illimité, prix forcé,
 *     réapprovisionnement ; bouton « Réapprovisionner » de l'Étal.
 *
 * Achat, vente, rachat par le vendeur : le joueur choisit la quantité, le
 * MJ principal applique (bourses, monnaie rendue, caisse du marchand,
 * stock, objet rangé dans un conteneur ou en attente), ou une carte de
 * validation part au MJ si le marchand le demande. Chaque opération
 * entre dans l'historique du marchand (drapeau `merchantLog`) : le MJ
 * peut en supprimer une ligne ou bloquer le rachat d'un objet vendu.
 *
 * Réapprovisionnement automatique (MJ principal) : à la nouvelle journée,
 * ou après un temps de jeu (heures ou jours du calendrier).
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { emitSocket, onSocketMessage, isPrimaryGM, gmQueue, onCardAnswer, answerCard } from "../../helpers/socket.mjs";
import { qtyOf, isLockedItem, holdsOthers, carrierOf, QUANTITY_KEY } from "../../builder/inventory.mjs";
import { ChatCards } from "../chat/chat-cards.mjs";
import { CalendarManager } from "../calendar/calendar-manager.mjs";
import { GroundItems } from "../ground/ground-items.mjs";
import { QuestManager } from "../quest/quest-manager.mjs";
import { UiSound } from "../media/ui-sound.mjs";
import { Money } from "../money/money.mjs";
import { MERCHANT_FLAG, RESTOCK_MODES, RESTOCK_UNITS, merchantOf, merchantHost, cleanStockEntry, tradableBy, dealKey, allMerchants } from "./merchant-model.mjs";
import { stockRows, basePriceOf, buybackUnitOf, rebuyPriceOf } from "./shop-stock.mjs";

export const LOG_FLAG = "merchantLog";
const CARD_FLAG = "shopBuy";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const { DialogV2 } = foundry.applications.api;

/** Le marchand qui porte le stock ; son réglage est réécrit en entier. */
export async function saveMerchant(actor, patch) {
  const host = merchantHost(actor);
  if (!host) return;
  /* Remplacé en entier : une fusion garderait une négociation retirée. */
  const full = { ...merchantOf(host), ...patch };
  await host.update({ [`flags.${SYSTEM_ID}.${MERCHANT_FLAG}`]: foundry.data.operators.ForcedReplacement.create(full) });
}

/** Le stock sans les exemplaires uniques qui ne sont plus chez le marchand. */
function liveStock(host, stock) {
  return stock.filter(e => !e.item || host.items.get(e.item));
}

export class ShopTrade {

  static init() {
    onCardAnswer("shop", (message, yes, by) => this.#answer(message, yes, by));
    onSocketMessage((p) => this.#onSocket(p));
    Hooks.on("renderChatMessageHTML", (message, html) => {
      try { this.#decorateCard(message, html instanceof HTMLElement ? html : html?.[0]); }
      catch (err) { console.warn("SBE | Boutique : carte en échec", err); }
    });
    Hooks.on("sbeNewDayDone", () => { if (game.user.isGM) { this.restockAll("newday"); this.#endDayDeals(); } });
    Hooks.on("updateWorldTime", () => { if (isPrimaryGM()) this.restockAll("time"); });
  }

  /* ---------------------------------------------------------- */
  /*  Stock (MJ)                                                  */
  /* ---------------------------------------------------------- */

  /** Un objet glissé sur l'Étal par le MJ. */
  static async addStock(merchant, item) {
    if (!game.user.isGM || !item || item.documentName !== "Item") return;
    const host = merchantHost(merchant);
    if (item.pack) { ui.notifications.warn(L("SBE.Shop.NoPack")); return; }
    if (item.type !== "objet" || !tradableBy(item, "sell")) { ui.notifications.warn(L("SBE.Shop.NotSold", { name: item.name })); return; }
    const m = merchantOf(host);
    const stock = [...m.stock];
    if (!item.parent) {
      const same = stock.find(e => e.model === item.id && !e.item);
      if (same) same.qty += 1;
      else stock.push(cleanStockEntry({ model: item.id, qty: 1 }));
    } else {
      let own = item.parent === host ? item : null;
      if (!own) {
        const data = GroundItems.dataOf(item, qtyOf(item));
        data.system.modelId = item.system?.modelId ?? "";
        [own] = await host.createEmbeddedDocuments("Item", [data]);
      }
      if (!own) return;
      if (stock.some(e => e.item === own.id)) return;
      stock.push(cleanStockEntry({ item: own.id, qty: qtyOf(own) }));
    }
    await saveMerchant(host, { stock });
  }

  static async removeStock(merchant, entryId) {
    if (!game.user.isGM) return;
    const m = merchantOf(merchant);
    await saveMerchant(merchant, { stock: m.stock.filter(e => e.id !== entryId) });
  }

  /** Réglages d'un article (MJ). */
  static async editStock(merchant, entryId) {
    if (!game.user.isGM) return;
    const row = stockRows(merchant).find(r => r.id === entryId);
    if (!row) return;
    const e = row.entry;
    const unique = !!e.item;
    const opt = (list, cur, pre) => list.map(v => `<option value="${v}" ${v === cur ? "selected" : ""}>${esc(L(`${pre}${v}`))}</option>`).join("");
    const content = `
      <div class="sbe-shopdlg">
        <div class="sbe-shopdlg-head"><img src="${esc(row.img)}" alt=""> <strong>${esc(row.name)}</strong></div>
        ${unique ? `<p class="notes">${esc(L("SBE.Shop.UniqueHint", { n: e.qty }))}</p>` : `
        <div class="sbe-shopdlg-row">
          <label class="sbe-shopdlg-f"><span>${esc(L("SBE.Shop.Qty"))}</span><input type="number" name="qty" min="0" step="1" value="${e.qty}"></label>
          <label class="sbe-shopdlg-check"><input type="checkbox" name="unlimited" ${e.unlimited ? "checked" : ""}> ${esc(L("SBE.Shop.UnlimitedQty"))}</label>
        </div>`}
        <label class="sbe-shopdlg-f"><span>${esc(L("SBE.Shop.PriceForced"))}</span>
          <input type="text" name="price" value="${esc(e.price)}" placeholder="${esc(L("SBE.Shop.PriceFromKey", { price: Money.text(basePriceOf({}, row.doc)) }))}"></label>
        <p class="notes">${esc(L("SBE.Shop.PriceHint"))}</p>
        ${unique ? "" : `
        <fieldset class="sbe-shopdlg-restock"><legend>${esc(L("SBE.Shop.Restock"))}</legend>
          <label class="sbe-shopdlg-f"><span>${esc(L("SBE.Shop.RestockWhen"))}</span>
            <select name="mode">${opt(RESTOCK_MODES, e.restock.mode, "SBE.Shop.Restock_")}</select></label>
          <div class="sbe-shopdlg-row" data-show="time">
            <label class="sbe-shopdlg-f"><span>${esc(L("SBE.Shop.RestockEvery"))}</span><input type="number" name="every" min="1" step="1" value="${e.restock.every}"></label>
            <label class="sbe-shopdlg-f"><span>${esc(L("SBE.Shop.RestockUnit"))}</span><select name="unit">${opt(RESTOCK_UNITS, e.restock.unit, "SBE.Shop.Unit_")}</select></label>
          </div>
          <label class="sbe-shopdlg-f"><span>${esc(L("SBE.Shop.RestockTo"))}</span><input type="number" name="to" min="0" step="1" value="${e.restock.to}"></label>
          <p class="notes">${esc(L("SBE.Shop.RestockHint"))}</p>
        </fieldset>`}
      </div>`;
    const res = await DialogV2.wait({
      window: { title: L("SBE.Shop.EditTitle"), icon: "fa-solid fa-pen" },
      position: { width: 420 },
      content,
      render: (_ev, dlg) => {
        const root = dlg instanceof HTMLElement ? dlg : dlg?.element;
        const mode = root?.querySelector('[name="mode"]');
        const sync = () => { const t = root?.querySelector('[data-show="time"]'); if (t) t.hidden = mode?.value !== "time"; };
        mode?.addEventListener("change", sync);
        sync();
      },
      buttons: [
        { action: "save", label: L("SBE.Common.Save"), icon: "fa-solid fa-check", default: true,
          callback: (_e, btn) => {
            const f = btn.form.elements;
            return {
              qty: f.qty?.value, unlimited: f.unlimited?.checked, price: f.price?.value,
              restock: { mode: f.mode?.value, every: f.every?.value, unit: f.unit?.value, to: f.to?.value }
            };
          } },
        { action: "remove", label: L("SBE.Shop.RemoveStock"), icon: "fa-solid fa-trash" },
        { action: "cancel", label: L("SBE.Common.Cancel"), icon: "fa-solid fa-xmark" }
      ],
      rejectClose: false
    }).catch(() => null);
    if (res === "remove") return this.removeStock(merchant, entryId);
    if (!res || typeof res !== "object") return;
    const m = merchantOf(merchant);
    const stock = m.stock.map(x => {
      if (x.id !== entryId) return x;
      const next = cleanStockEntry({ ...x, ...res, id: x.id, model: x.model, item: x.item, restock: { ...x.restock, ...(res.restock ?? {}) } });
      if (unique) { next.qty = x.qty; next.unlimited = false; next.restock = x.restock; }
      /* Le temps de jeu compte à partir du réglage. */
      if (next.restock.mode === "time" && (x.restock.mode !== "time" || x.restock.last === null)) next.restock.last = CalendarManager.now();
      return next;
    });
    await saveMerchant(merchant, { stock });
  }

  /** Remet chaque article réapprovisionnable à sa quantité cible. */
  static #refill(stock, pick) {
    let changed = false;
    const now = CalendarManager.now();
    const out = stock.map(e => {
      if (e.item || e.unlimited || e.restock.to <= 0 || !pick(e, now)) return e;
      changed = true;
      return { ...e, qty: Math.max(e.qty, e.restock.to), restock: { ...e.restock, last: now } };
    });
    return changed ? out : null;
  }

  /** Bouton du MJ : tout le stock du marchand. */
  static async restockNow(merchant) {
    if (!game.user.isGM) return;
    const next = this.#refill(merchantOf(merchant).stock, () => true);
    if (next) await saveMerchant(merchant, { stock: next });
    ui.notifications.info(L("SBE.Shop.Restocked", { name: merchantHost(merchant)?.name ?? "" }));
  }

  /** Réapprovisionnement automatique de tous les marchands (MJ principal). */
  static async restockAll(mode) {
    for (const actor of allMerchants()) {
      const m = merchantOf(actor);
      if (!m.enabled || !m.stock.some(e => e.restock.mode === mode)) continue;
      let stock = m.stock;
      if (mode === "time") {
        /* Premier passage, ou temps remonté : le compteur repart d'ici. */
        const now = CalendarManager.now();
        let reset = false;
        stock = stock.map(e => {
          if (e.restock.mode !== "time" || (e.restock.last !== null && e.restock.last <= now)) return e;
          reset = true;
          return { ...e, restock: { ...e.restock, last: now } };
        });
        const next = this.#refill(stock, (e, t) => {
          if (e.restock.mode !== "time") return false;
          const span = e.restock.every * (e.restock.unit === "hour" ? CalendarManager.secondsPerHour() : CalendarManager.secondsPerDay());
          return t - e.restock.last >= span;
        });
        if (next) stock = next;
        else if (!reset) continue;
      } else {
        stock = this.#refill(stock, (e) => e.restock.mode === mode);
        if (!stock) continue;
      }
      await saveMerchant(actor, { stock });
    }
  }

  /* ---------------------------------------------------------- */
  /*  Achat, vente, rachat (côté joueur)                          */
  /* ---------------------------------------------------------- */

  /** Le joueur (ou le MJ pour le jeton qu'il contrôle) achète un article. */
  static async buy(merchant, buyer, entryId) {
    if (!this.#canTrade(merchant, buyer)) return;
    const row = stockRows(merchant, buyer).find(r => r.id === entryId);
    if (!row || row.soldOut) { ui.notifications.warn(L("SBE.Shop.SoldOutMsg")); return; }
    const afford = row.price > 0 ? Math.floor(Money.totalOf(buyer) / row.price) : Infinity;
    const stockMax = row.unlimited ? Infinity : row.qty;
    const max = Math.min(stockMax, afford);
    if (max < 1) { ui.notifications.warn(L("SBE.Shop.NotEnoughMoney")); return; }
    const qty = await this.#askQty({ img: row.img, name: row.name, price: row.price }, max, stockMax);
    if (!qty) return;
    return this.#send({ kind: "buy", merchant: merchant.uuid, buyer: buyer.uuid, entry: entryId, qty }, { name: row.name, total: row.price * qty, buyer });
  }

  /** Le joueur vend un objet de son inventaire au marchand. */
  static async sell(merchant, seller, item) {
    if (!this.#canTrade(merchant, seller)) return;
    const why = this.sellRefusal(merchant, seller, item);
    if (why) { ui.notifications.warn(L(why, { name: item?.name ?? "" })); return; }
    const m = merchantOf(merchant);
    const unit = buybackUnitOf(merchant, item, seller);
    const have = qtyOf(item);
    const budget = m.cash === "unlimited" ? Infinity
      : Money.valueOf(m.cash === "own" ? m.purse : Money.purseOf(merchantHost(merchant)));
    const max = Math.min(have, unit > 0 ? Math.floor(budget / unit) : Infinity);
    if (max < 1) { ui.notifications.warn(L("SBE.Shop.NoBudget")); return; }
    const qty = await this.#askQty({ img: item.img, name: item.name, price: unit }, max, have, "sell");
    if (!qty) return;
    return this.#send({ kind: "sell", merchant: merchant.uuid, buyer: seller.uuid, item: item.uuid, qty }, { name: item.name, total: unit * qty, buyer: seller });
  }

  /** Le vendeur rachète un objet qu'il a vendu (ligne de l'historique). */
  static async rebuy(merchant, buyer, lineId) {
    if (!this.#canTrade(merchant, buyer)) return;
    const host = merchantHost(merchant);
    const line = this.logOf(host).find(l => l.id === lineId);
    const item = line?.item ? host.items.get(line.item) : null;
    if (!line || !this.canRebuy(merchant, line) || !item) { ui.notifications.warn(L("SBE.Shop.Gone")); return; }
    const price = rebuyPriceOf(merchant, line, item, buyer);
    if (Money.totalOf(buyer) < price) { ui.notifications.warn(L("SBE.Shop.NotEnoughMoney")); return; }
    const ok = await DialogV2.confirm({
      window: { title: L("SBE.Shop.RebuyTitle"), icon: "fa-solid fa-rotate-left" },
      content: `<div class="sbe-shopdlg"><div class="sbe-shopdlg-head"><img src="${esc(item.img)}" alt=""> <strong>${esc(item.name)}${line.qty > 1 ? ` ×${line.qty}` : ""}</strong></div>
        <div class="sbe-shopdlg-line sbe-shopdlg-total"><span>${esc(L("SBE.Shop.Total"))}</span> ${Money.html(price)}</div></div>`,
      rejectClose: false
    }).catch(() => false);
    if (!ok) return;
    return this.#send({ kind: "rebuy", merchant: merchant.uuid, buyer: buyer.uuid, line: lineId }, { name: item.name, total: price, buyer });
  }

  /** Pourquoi ce marchand ne rachète pas cet objet (clé de message), sinon "". */
  static sellRefusal(merchant, seller, item) {
    const m = merchantOf(merchant);
    if (!m.buyback.enabled) return "SBE.Shop.NoBuyback";
    if (!item || item.type !== "objet" || carrierOf(item) !== seller) return "SBE.Shop.NotYours";
    if (isLockedItem(item)) return "SBE.Shop.Locked";
    if (holdsOthers(item)) return "SBE.Shop.NotEmpty";
    if (!tradableBy(item, "buy")) return "SBE.Shop.NotBought";
    return "";
  }

  /** Le rachat de cette ligne est-il possible (réglages, état de la ligne) ? */
  static canRebuy(merchant, line) {
    return merchantOf(merchant).buyback.rebuy && line?.kind === "sell" && !line.blocked && !line.rebought;
  }

  static #canTrade(merchant, actor) {
    if (!actor) { ui.notifications.warn(L("SBE.Shop.NoBuyer")); return false; }
    if (!merchantOf(merchant).open && !game.user.isGM) { ui.notifications.warn(L("SBE.Shop.IsClosed", { name: merchant.name })); return false; }
    return true;
  }

  /** Validation du MJ, ou application directe (MJ principal). */
  static async #send(req, show) {
    req.userId = game.user.id;
    if (merchantOf(await fromUuid(req.merchant)).approval === "gm" && !game.user.isGM) return this.#ask(req, show);
    if (isPrimaryGM()) return this.#execute(req);
    if (!game.users.activeGM) { ui.notifications.warn(L("SBE.Shop.NoGM")); return; }
    emitSocket({ type: "sbeShopReq", req });
  }

  /** Combien ? (rien à demander pour un seul exemplaire : on confirme). */
  static async #askQty(row, max, stockMax, side = "buy") {
    const cap = Number.isFinite(max) ? max : 999;
    const all = Number.isFinite(stockMax) && cap > 1;
    const sell = side === "sell";
    const content = `
      <div class="sbe-shopdlg">
        <div class="sbe-shopdlg-head"><img src="${esc(row.img)}" alt=""> <strong>${esc(row.name)}</strong></div>
        <div class="sbe-shopdlg-line"><span>${esc(L(sell ? "SBE.Shop.UnitBuyback" : "SBE.Shop.UnitPrice"))}</span> ${Money.html(row.price)}</div>
        ${cap > 1 ? `<label class="sbe-shopdlg-f"><span>${esc(L("SBE.Shop.HowMany", { max: cap }))}</span>
          <input type="number" name="qty" min="1" max="${cap}" step="1" value="1"></label>` : ""}
        <div class="sbe-shopdlg-line sbe-shopdlg-total"><span>${esc(L(sell ? "SBE.Shop.YouGet" : "SBE.Shop.Total"))}</span> <span data-total>${Money.html(row.price)}</span></div>
      </div>`;
    const read = (form) => Math.min(cap, Math.max(1, Math.floor(Number(form?.elements?.qty?.value) || 1)));
    const buttons = [{ action: "ok", label: L(sell ? "SBE.Shop.Sell" : "SBE.Shop.Buy"), icon: `fa-solid ${sell ? "fa-hand-holding-dollar" : "fa-cart-shopping"}`, default: true, callback: (_e, btn) => read(btn.form) }];
    if (all) buttons.push({ action: "all", label: L(sell ? "SBE.Shop.SellAll" : "SBE.Shop.BuyAll", { n: cap }), icon: "fa-solid fa-layer-group", callback: () => cap });
    buttons.push({ action: "cancel", label: L("SBE.Common.Cancel"), icon: "fa-solid fa-xmark" });
    const res = await DialogV2.wait({
      window: { title: L(sell ? "SBE.Shop.SellTitle" : "SBE.Shop.BuyTitle"), icon: `fa-solid ${sell ? "fa-hand-holding-dollar" : "fa-cart-shopping"}` },
      position: { width: 360 },
      content,
      render: (_ev, dlg) => {
        const root = dlg instanceof HTMLElement ? dlg : dlg?.element;
        const input = root?.querySelector('[name="qty"]');
        const total = root?.querySelector("[data-total]");
        input?.addEventListener("input", () => { if (total) total.innerHTML = Money.html(row.price * read(input.form)); });
      },
      buttons,
      rejectClose: false
    }).catch(() => null);
    return Number.isInteger(res) && res > 0 ? res : 0;
  }

  /* ---------------------------------------------------------- */
  /*  Validation du MJ                                            */
  /* ---------------------------------------------------------- */

  static async #ask(req, { name, total, buyer }) {
    const merchant = await fromUuid(req.merchant);
    const key = { buy: "SBE.Shop.AskText", sell: "SBE.Shop.AskSellText", rebuy: "SBE.Shop.AskRebuyText" }[req.kind];
    await ChatCards.post({
      type: "request",
      title: L({ buy: "SBE.Shop.AskTitle", sell: "SBE.Shop.AskSellTitle", rebuy: "SBE.Shop.AskRebuyTitle" }[req.kind]),
      subtitle: merchant?.name ?? "",
      body: `<p>${esc(L(key, { user: game.user.name, buyer: buyer.name, qty: req.qty ?? 1, name, price: Money.text(total) }))}</p>`,
      speaker: ChatMessage.getSpeaker({ actor: buyer }),
      whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id),
      flags: { [SYSTEM_ID]: { [CARD_FLAG]: { req, state: "ask" } } }
    });
    ui.notifications.info(L("SBE.Shop.Asked"));
  }

  /* Toujours chez le MJ principal, une réponse à la fois (answerCard). */
  static async #answer(message, yes, by) {
    if (!game.user.isGM) return;
    const f = message.getFlag(SYSTEM_ID, CARD_FLAG);
    if (!f || f.state !== "ask") return;
    /* Le demandeur est l'AUTEUR de la carte (pas ce qu'elle déclare). */
    const req = { ...f.req, userId: message.author?.id ?? f.req?.userId };
    let state = "no";
    if (yes) state = (await this.#execute(req)) ? "ok" : "gone";
    else this.#tell(req.userId, "SBE.Shop.Refused", {}, "warn");
    await message.setFlag(SYSTEM_ID, CARD_FLAG, { ...f, state, by });
  }

  static #decorateCard(message, root) {
    const f = message.getFlag(SYSTEM_ID, CARD_FLAG);
    if (!f || !root) return;
    const body = root.querySelector(".message-content") ?? root;
    body.querySelector(".sbe-shop-cardbar")?.remove();
    const bar = document.createElement("div");
    bar.className = "sbe-shop-cardbar sbe-tal-cardbar";
    if (f.state === "ask") {
      if (!game.user.isGM) bar.innerHTML = `<span class="notes">${esc(L("SBE.Talents.Waiting"))}</span>`;
      else {
        bar.innerHTML = `<button type="button" data-shop-answer="yes"><i class="fa-solid fa-check"></i> ${esc(L("SBE.Talents.Accept"))}</button>
          <button type="button" data-shop-answer="no"><i class="fa-solid fa-xmark"></i> ${esc(L("SBE.Talents.Refuse"))}</button>`;
        bar.addEventListener("click", async (ev) => {
          const b = ev.target.closest("[data-shop-answer]");
          if (!b) return;
          for (const x of bar.querySelectorAll("button")) x.disabled = true;
          await answerCard("shop", message, b.dataset.shopAnswer === "yes");
          for (const x of bar.querySelectorAll("button")) x.disabled = false;
        });
      }
    } else {
      const key = { ok: "Accepted", no: "Refused" }[f.state] ?? "Gone";
      bar.innerHTML = `<span class="sbe-tal-cardstate is-${esc(f.state)}">${esc(L(`SBE.Talents.${key}`, { by: f.by ?? "" }))}</span>`;
    }
    body.appendChild(bar);
  }

  /* ---------------------------------------------------------- */
  /*  Application (MJ)                                            */
  /* ---------------------------------------------------------- */

  /**
   * Applique une demande. Tout est relu : stock, prix, bourses et
   * objets ont pu changer depuis la demande. Une demande à la fois par
   * marchand : le stock, la caisse et la bourse sont vérifiés puis
   * écrits sans qu'une autre demande s'intercale.
   * @returns {Promise<boolean>}
   */
  static #execute(req) {
    return gmQueue(req?.merchant ?? "", () => this.#run(req));
  }

  static async #run(req) {
    const fail = (key, data) => { this.#tell(req.userId, key, data, "warn"); return false; };
    const merchant = await fromUuid(req.merchant).catch(() => null);
    const actor = await fromUuid(req.buyer).catch(() => null);
    const host = merchantHost(merchant);
    if (!host || !actor || !merchantOf(host).enabled) return fail("SBE.Shop.Gone");
    /* Le demandeur agit pour un personnage à lui, dans une boutique ouverte. */
    const user = game.users.get(req.userId);
    if (!user || !(user.isGM || actor.testUserPermission(user, "OWNER"))) return false;
    if (!user.isGM && !merchantOf(host).open) return fail("SBE.Shop.IsClosed", { name: merchant.name });
    const qty = Math.max(1, Math.floor(Number(req.qty) || 1));
    if (req.kind === "sell") return this.#doSell(req, merchant, host, actor, qty, fail);
    if (req.kind === "rebuy") return this.#doRebuy(req, merchant, host, actor, fail);
    return this.#doBuy(req, merchant, host, actor, qty, fail);
  }

  static async #doBuy(req, merchant, host, buyer, qty, fail) {
    const row = stockRows(merchant, buyer).find(r => r.id === req.entry);
    if (!row || (!row.unlimited && row.qty < qty)) return fail("SBE.Shop.SoldOutMsg");
    const total = row.price * qty;
    if (!(await Money.pay(buyer, total))) return fail("SBE.Shop.NotEnoughMoney");
    /* L'objet change de mains (exemplaire unique) ou un neuf est donné. */
    const placed = await QuestManager.giveItem(buyer, row.doc, qty);
    const m = merchantOf(host);
    const patch = await this.#cashIn(m, host, total);
    patch.stock = liveStock(host, m.stock.map(e => (e.id !== row.id || e.unlimited || e.item) ? e : { ...e, qty: Math.max(0, e.qty - qty) }))
      .map(e => (e.item ? { ...e, qty: qtyOf(host.items.get(e.item)) } : e));
    patch.deals = this.#spendDeal(m, buyer, "buy");
    await saveMerchant(host, patch);
    await this.#log(host, { kind: "buy", user: req.userId, actor: buyer.uuid, actorName: buyer.name, name: row.name, img: row.img, qty, total });
    this.#tell(req.userId, placed ? "SBE.Shop.Bought" : "SBE.Shop.BoughtAtFeet", { qty, name: row.name, price: Money.text(total) }, "info", m.sounds.buy);
    return true;
  }

  static async #doSell(req, merchant, host, seller, qty, fail) {
    const item = await fromUuid(req.item).catch(() => null);
    const why = this.sellRefusal(merchant, seller, item);
    if (why) return fail(why, { name: item?.name ?? "" });
    if (qtyOf(item) < qty) return fail("SBE.Shop.Gone");
    const m = merchantOf(host);
    const total = buybackUnitOf(merchant, item, seller) * qty;
    /* Le marchand paie de sa caisse (ou de sa fiche) ; illimitée : rien à retirer. */
    const patch = {};
    if (m.cash === "own") {
      const next = Money.payFrom(m.purse, total);
      if (!next) return fail("SBE.Shop.NoBudget");
      patch.purse = next;
    } else if (m.cash === "sheet" && !(await Money.pay(host, total))) return fail("SBE.Shop.NoBudget");
    await Money.credit(seller, total);
    /* L'objet passe chez le marchand : dans son stock, ou gardé pour le rachat. */
    const data = GroundItems.dataOf(item, qty);
    data.system.modelId = item.system?.modelId ?? "";
    const [kept] = await host.createEmbeddedDocuments("Item", [data]);
    const rest = qtyOf(item) - qty;
    if (rest > 0) await item.update({ [`system.values.${QUANTITY_KEY}`]: rest });
    else await item.delete();
    const cur = merchantOf(host);
    patch.stock = cur.buyback.keep === "stock" && kept ? [...cur.stock, cleanStockEntry({ item: kept.id, qty })] : cur.stock;
    patch.deals = this.#spendDeal(cur, seller, "sell");
    await saveMerchant(host, patch);
    await this.#log(host, { kind: "sell", user: req.userId, actor: seller.uuid, actorName: seller.name, name: item.name, img: item.img, qty, total, item: kept?.id ?? "", blocked: false, rebought: false });
    this.#tell(req.userId, "SBE.Shop.Sold", { qty, name: item.name, price: Money.text(total) }, "info", m.sounds.sell);
    return true;
  }

  static async #doRebuy(req, merchant, host, buyer, fail) {
    const line = this.logOf(host).find(l => l.id === req.line);
    const item = line?.item ? host.items.get(line.item) : null;
    if (!line || !item || !this.canRebuy(merchant, line) || line.actor !== buyer.uuid) return fail("SBE.Shop.Gone");
    const total = rebuyPriceOf(merchant, line, item, buyer);
    if (!(await Money.pay(buyer, total))) return fail("SBE.Shop.NotEnoughMoney");
    const placed = await QuestManager.giveItem(buyer, item, qtyOf(item));
    const m = merchantOf(host);
    const patch = await this.#cashIn(m, host, total);
    patch.stock = liveStock(host, m.stock);
    await saveMerchant(host, patch);
    await this.#editLog(host, (log) => {
      const l = log.find(x => x.id === line.id);
      if (l) l.rebought = true;
      log.push(this.#line({ kind: "rebuy", user: req.userId, actor: buyer.uuid, actorName: buyer.name, name: line.name, img: line.img, qty: line.qty, total }));
    });
    this.#tell(req.userId, placed ? "SBE.Shop.Rebought" : "SBE.Shop.BoughtAtFeet", { qty: line.qty, name: line.name, price: Money.text(total) }, "info", m.sounds.rebuy?.sound ? m.sounds.rebuy : m.sounds.buy);
    return true;
  }

  /** L'argent d'une vente du marchand : sa caisse ou sa fiche. */
  static async #cashIn(m, host, total) {
    if (m.cash === "own") return { purse: Money.add(m.purse, Money.breakdown(total)) };
    if (m.cash === "sheet") await Money.credit(host, total);
    return {};
  }

  /** Une négociation « prochaine transaction » est consommée. */
  static #spendDeal(m, actor, side) {
    const deals = { ...m.deals };
    const k = dealKey(actor);
    if (deals[k]?.[side] && deals[k].until === "next") delete deals[k];
    return deals;
  }

  /** Fin de journée : les négociations « jusqu'à la fin de la journée » s'arrêtent. */
  static async #endDayDeals() {
    for (const actor of allMerchants()) {
      const m = merchantOf(actor);
      if (!Object.values(m.deals).some(d => d.until === "day")) continue;
      await saveMerchant(actor, { deals: Object.fromEntries(Object.entries(m.deals).filter(([, d]) => d.until !== "day")) });
    }
  }

  /* ---------------------------------------------------------- */
  /*  Historique                                                  */
  /* ---------------------------------------------------------- */

  /** Les lignes de l'historique d'un marchand (les plus anciennes d'abord). */
  static logOf(merchant) {
    const log = merchantHost(merchant)?.getFlag(SYSTEM_ID, LOG_FLAG);
    return Array.isArray(log) ? log : [];
  }

  static #line(entry) {
    return { id: foundry.utils.randomID(), t: Date.now(), wt: CalendarManager.now(), ...entry };
  }

  static async #log(host, entry) {
    await this.#editLog(host, (log) => { log.push(this.#line(entry)); });
  }

  static async #editLog(host, fn) {
    const log = foundry.utils.deepClone(this.logOf(host));
    fn(log);
    await host.update({ [`flags.${SYSTEM_ID}.${LOG_FLAG}`]: log });
  }

  /** MJ : supprimer une ligne. */
  static async deleteLine(merchant, lineId) {
    if (!game.user.isGM) return;
    await this.#editLog(merchantHost(merchant), (log) => {
      const i = log.findIndex(l => l.id === lineId);
      if (i >= 0) log.splice(i, 1);
    });
  }

  /** MJ : bloquer (ou débloquer) le rachat d'un objet vendu. */
  static async toggleBlock(merchant, lineId) {
    if (!game.user.isGM) return;
    await this.#editLog(merchantHost(merchant), (log) => {
      const l = log.find(x => x.id === lineId);
      if (l) l.blocked = !l.blocked;
    });
  }

  /* ---------------------------------------------------------- */
  /*  Messages                                                    */
  /* ---------------------------------------------------------- */

  /** Message (et son) pour l'utilisateur qui a fait la demande. */
  static #tell(userId, key, data = {}, level = "info", sound = null) {
    if (!userId || userId === game.user.id) return this.#show({ key, data, level, sound });
    emitSocket({ type: "sbeShopTell", userId, key, data, level, sound });
  }

  static #show({ key, data, level, sound }) {
    ui.notifications[level === "warn" ? "warn" : "info"](L(key, data));
    if (sound?.sound) UiSound.play(sound);
  }

  static #onSocket(p) {
    if (p?.type === "sbeShopTell") { if (p.userId === game.user.id) this.#show(p); return; }
    if (p?.type === "sbeShopReq" && isPrimaryGM()) this.#execute(p.req ?? {});
  }
}
