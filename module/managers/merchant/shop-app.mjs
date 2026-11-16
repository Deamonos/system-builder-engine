/**
 * SBE — FENÊTRE DE BOUTIQUE
 *
 * L'apparence vient du modèle de boutique du marchand (atelier, genre
 * « shop ») : ses composants Étal, Caisse, Bourse de l'acheteur, Zone de
 * vente, et tous les composants habituels (le nom et le portrait du
 * marchand, du texte…). Le MJ y voit aussi les articles épuisés.
 */

import { renderSheet } from "../../builder/element-renderer.mjs";
import { Identity } from "../../helpers/identity.mjs";
import { merchantOf, merchantHost, shopTemplateOf, dealKey } from "./merchant-model.mjs";
import { stockRows, buybackUnitOf, rebuyPriceOf, dealPct } from "./shop-stock.mjs";
import { ShopTrade } from "./shop-trade.mjs";
import { ShopHaggle, dealText } from "./shop-haggle.mjs";
import { SBEMerchantApp } from "./merchant-app.mjs";
import { CalendarManager } from "../calendar/calendar-manager.mjs";
import { qtyOf, carrierOf, isGmOnlyItem } from "../../builder/inventory.mjs";
import { UiSound } from "../media/ui-sound.mjs";

const { ApplicationV2 } = foundry.applications.api;
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

export class SBEShopApp extends ApplicationV2 {

  static #open = new Map();

  /**
   * @param {Actor} merchant  le marchand (personnage ou acteur de jeton)
   * @param {Actor|null} buyer celui qui achète (null : le MJ qui regarde)
   */
  static open(merchant, buyer = null) {
    const k = `${merchant.uuid}|${buyer?.uuid ?? ""}`;
    const cur = this.#open.get(k);
    if (cur?.rendered) { cur.bringToFront?.(); return cur; }
    const tpl = shopTemplateOf(merchant);
    const w = Number(tpl?.system?.theme?.interface?.sheetW) || 560;
    const h = Number(tpl?.system?.theme?.interface?.sheetH) || 640;
    const app = new SBEShopApp({ merchant, buyer, id: `sbe-shop-${foundry.utils.randomID()}`, position: { width: w, height: h } });
    this.#open.set(k, app);
    app.render({ force: true });
    return app;
  }

  /** Toutes les boutiques ouvertes de ce marchand. */
  static of(merchant) {
    const host = merchantHost(merchant);
    return [...this.#open.values()].filter(a => merchantHost(a.merchant) === host);
  }

  constructor(options = {}) {
    super(options);
    this.merchant = options.merchant;
    this.buyer = options.buyer ?? null;
    this.tabs = {};
    this.navActive = {};
    this.histFilter = "";
  }

  static DEFAULT_OPTIONS = {
    tag: "div",
    classes: ["sbe-shop", "sbe-objet-sheet"],
    window: { title: "SBE.Shop.Title", icon: "fa-solid fa-store", resizable: true },
    position: { width: 560, height: 640 }
  };

  #hooks = [];
  #ac = null;

  get title() {
    const name = Identity.of(Identity.refOf(this.merchant) || this.merchant)?.name ?? this.merchant?.name ?? "";
    return L("SBE.Shop.TitleOf", { name });
  }

  /** Le contexte lu par les composants de boutique. */
  shopContext() {
    const m = merchantOf(this.merchant);
    const isGM = game.user.isGM;
    const host = merchantHost(this.merchant);
    /* Objets que l'acheteur peut revendre ici. */
    const sellRows = !this.buyer ? [] : this.buyer.items
      .filter(i => i.type === "objet" && carrierOf(i) === this.buyer && !ShopTrade.sellRefusal(this.merchant, this.buyer, i))
      .map(i => ({ uuid: i.uuid, name: i.name, img: i.img, qty: qtyOf(i), unit: buybackUnitOf(this.merchant, i, this.buyer) }))
      .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
    /* Historique : le joueur voit ses personnages, le MJ tout (filtre). */
    const all = ShopTrade.logOf(host);
    const actors = [...new Map(all.map(l => [l.actor, { uuid: l.actor, name: l.actorName }])).values()]
      .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
    const mine = (l) => fromUuidSync(l.actor)?.isOwner;
    const cal = CalendarManager.enabled();
    const log = all.filter(l => (isGM ? (!this.histFilter || l.actor === this.histFilter) : mine(l))).reverse().map(l => {
      const item = l.item ? host?.items?.get(l.item) : null;
      const rebuyer = this.buyer?.uuid === l.actor ? this.buyer : null;
      const canRebuy = !!item && !!rebuyer && ShopTrade.canRebuy(this.merchant, l);
      const comp = cal ? CalendarManager.components(l.wt) : null;
      return {
        ...l, canRebuy,
        rebuyPrice: canRebuy ? rebuyPriceOf(this.merchant, l, item, rebuyer) : 0,
        date: comp ? `${CalendarManager.fmtDate(comp)} ${CalendarManager.fmtTime(comp)}` : new Date(l.t).toLocaleString(game.i18n.lang)
      };
    });
    return {
      merchant: this.merchant, buyer: this.buyer, m,
      /* Articles « MJ seulement » (option du modèle) : cachés aux joueurs. */
      rows: stockRows(this.merchant, this.buyer).filter(r => game.user.isGM || !isGmOnlyItem(r.doc)),
      tabs: this.tabs,
      isGM,
      canBuy: !!this.buyer && (m.open || isGM),
      sellRows, log, actors, histFilter: this.histFilter
    };
  }

  async _renderHTML() {
    const tpl = shopTemplateOf(this.merchant);
    const m = merchantOf(this.merchant);
    const els = tpl.system.elements ?? [];
    const html = renderSheet(els, {
      values: this.merchant.system?.values ?? {}, computedResults: {}, elements: els,
      isGM: game.user.isGM, live: true, hostDoc: this.merchant, navActive: this.navActive,
      richEnriched: {}, inventory: {}, shop: this.shopContext()
    });
    const closed = !m.open ? `<div class="sbe-shop-closed"><i class="fa-solid fa-store-slash"></i> ${esc(L(game.user.isGM ? "SBE.Shop.ClosedBanner" : "SBE.Shop.ClosedBannerPlayer"))}</div>` : "";
    const noBuyer = !this.buyer ? `<p class="notes sbe-shop-nobuyer">${esc(L("SBE.Shop.NoBuyer"))}</p>` : "";
    /* Négociation en cours de l'acheteur ; MJ : la proposer, l'annuler. */
    const d = this.buyer ? m.deals[dealKey(this.buyer)] : null;
    const live = d && (dealPct(this.merchant, this.buyer, "buy") || dealPct(this.merchant, this.buyer, "sell"));
    const deal = live ? `<div class="sbe-shop-deal ${d.pct >= 0 ? "is-good" : "is-bad"}"><i class="fa-solid fa-handshake"></i> ${esc(dealText(d))}
      ${game.user.isGM ? `<button type="button" data-shop-dealcancel data-tooltip-text="${esc(L("SBE.Shop.DealCancel"))}"><i class="fa-solid fa-xmark"></i></button>` : ""}</div>` : "";
    const gm = game.user.isGM ? `<div class="sbe-shop-gmbar">
      <button type="button" data-shop-settings><i class="fa-solid fa-gear"></i> ${esc(L("SBE.Shop.Settings"))}</button>
      <button type="button" data-shop-haggle><i class="fa-solid fa-handshake"></i> ${esc(L("SBE.Shop.HaggleTitle"))}</button></div>` : "";
    return `${closed}${noBuyer}${gm}${deal}<div class="sbe-shop-body sbe-obj-sheet">${html}</div>`;
  }

  _replaceHTML(result, content) {
    const keep = content.querySelector(".sbe-shop-body")?.scrollTop ?? 0;
    content.innerHTML = result;
    const body = content.querySelector(".sbe-shop-body");
    if (body) body.scrollTop = keep;
  }

  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    this.#ac = new AbortController();
    const sig = { signal: this.#ac.signal };
    this.element.addEventListener("click", (ev) => this.#onClick(ev), sig);
    /* MJ : clic droit sur un article = ses réglages ; objets glissés sur l'Étal. */
    this.element.addEventListener("contextmenu", (ev) => {
      const entry = game.user.isGM && ev.target.closest("[data-shop-entry]");
      if (!entry) return;
      ev.preventDefault();
      ShopTrade.editStock(this.merchant, entry.dataset.shopEntry);
    }, sig);
    this.element.addEventListener("dragover", (ev) => {
      if (ev.target.closest("[data-shop-sell], [data-shop-selllist]") || (game.user.isGM && ev.target.closest("[data-stall]"))) ev.preventDefault();
    }, sig);
    this.element.addEventListener("change", (ev) => {
      if (!ev.target.matches("[data-shop-histfilter]")) return;
      this.histFilter = ev.target.value;
      this.render();
    }, sig);
    this.element.addEventListener("drop", (ev) => this.#onDrop(ev), sig);
    /* Le marchand, l'acheteur (stock, caisse, bourse) ou le modèle de
       boutique (atelier) change : on redessine. */
    const host = merchantHost(this.merchant);
    const fn = (doc) => {
      const a = doc?.documentName === "Item" ? doc.parent : doc;
      if (!this.rendered || !a) return;
      if (a === host || a === this.merchant || a === this.buyer || a === shopTemplateOf(this.merchant)) this.render();
    };
    for (const h of ["updateActor", "updateItem", "createItem", "deleteItem"]) this.#hooks.push([h, Hooks.on(h, fn)]);
  }

  #onClick(ev) {
    const tab = ev.target.closest("[data-shop-tab]");
    if (tab) { this.tabs[tab.dataset.shopTab] = tab.dataset.tab; this.render(); return; }
    const nav = ev.target.closest('[data-action="switchNavTab"]');
    if (nav) { this.navActive[nav.dataset.nav] = nav.dataset.tab; this.render(); return; }
    const show = ev.target.closest("[data-shop-show]");
    if (show) {
      const row = stockRows(this.merchant).find(r => r.id === show.dataset.shopShow);
      row?.doc?.sheet?.render(true);
      return;
    }
    const buy = ev.target.closest("[data-shop-buy]");
    if (buy && !buy.disabled) { ShopTrade.buy(this.merchant, this.buyer, buy.dataset.shopBuy); return; }
    const edit = ev.target.closest("[data-shop-edit]");
    if (edit) { ShopTrade.editStock(this.merchant, edit.dataset.shopEdit); return; }
    if (ev.target.closest("[data-shop-restock]")) { ShopTrade.restockNow(this.merchant); return; }
    const sell = ev.target.closest("[data-shop-sellitem]");
    if (sell && !sell.disabled) { this.#sell(sell.dataset.shopSellitem); return; }
    const rebuy = ev.target.closest("[data-shop-rebuy]");
    if (rebuy) { ShopTrade.rebuy(this.merchant, this.buyer, rebuy.dataset.shopRebuy); return; }
    const block = ev.target.closest("[data-shop-block]");
    if (block) { ShopTrade.toggleBlock(this.merchant, block.dataset.shopBlock); return; }
    const del = ev.target.closest("[data-shop-delline]");
    if (del) { ShopTrade.deleteLine(this.merchant, del.dataset.shopDelline); return; }
    if (ev.target.closest("[data-shop-haggle]")) { ShopHaggle.propose(this.merchant, this.buyer); return; }
    if (ev.target.closest("[data-shop-settings]")) { SBEMerchantApp.open(this.merchant); return; }
    if (ev.target.closest("[data-shop-dealcancel]") && this.buyer) ShopHaggle.cancel(this.merchant, this.buyer);
  }

  async #sell(uuid) {
    const item = await fromUuid(uuid).catch(() => null);
    if (item) await ShopTrade.sell(this.merchant, this.buyer, item);
  }

  /** Un objet déposé : à vendre (zone de vente, inventaire à vendre), ou au stock (MJ, Étal). */
  async #onDrop(ev) {
    const sellZone = ev.target.closest("[data-shop-sell], [data-shop-selllist]");
    const stall = game.user.isGM && ev.target.closest("[data-stall]");
    if (!sellZone && !stall) return;
    ev.preventDefault();
    let data = null;
    try { data = foundry.applications.ux.TextEditor.implementation.getDragEventData(ev); } catch (_e) { /* rien de lisible */ }
    if (data?.type !== "Item") return;
    const item = await fromUuid(data.uuid).catch(() => null);
    if (!item) return;
    if (sellZone) await ShopTrade.sell(this.merchant, this.buyer, item);
    else await ShopTrade.addStock(this.merchant, item);
  }

  async _onClose(options) {
    /* Son de fermeture de la boutique (chez celui qui la ferme). */
    try {
      const snd = this.merchant ? merchantOf(this.merchant).sounds?.close : null;
      if (snd?.sound) UiSound.play(snd);
    } catch (err) { console.warn("SBE | Boutique : son de fermeture en échec", err); }
    this.#ac?.abort();
    for (const [h, id] of this.#hooks) Hooks.off(h, id);
    this.#hooks = [];
    for (const [k, a] of SBEShopApp.#open) if (a === this) SBEShopApp.#open.delete(k);
    return super._onClose?.(options);
  }
}
