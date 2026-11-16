/**
 * SBE — FENÊTRE D'ÉCHANGE (une par participant)
 *
 * Deux colonnes : « Vous donnez » (sa propre offre : objets glissés
 * depuis sa fiche, quantités, argent) et « Vous recevez » (l'offre de
 * l'autre, en lecture). Les deux fenêtres se tiennent à jour par le
 * canal du système.
 *
 * Règle de validation (ancien système) : quand l'un change son offre,
 * la validation de l'autre saute — il doit revalider ce qu'il voit.
 * Quand les deux ont validé, la fenêtre de l'INITIATEUR demande
 * l'exécution au MJ principal (une seule écriture).
 * Fermer la fenêtre = annuler l'échange, pour les deux.
 */

import { emitSocket } from "../../helpers/socket.mjs";
import { Identity } from "../../helpers/identity.mjs";
import { qtyOf } from "../../builder/inventory.mjs";
import { TradeManager, TRADE_SOCKET } from "./trade-manager.mjs";
import { Money } from "../money/money.mjs";

const { ApplicationV2 } = foundry.applications.api;
const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

export class SBETradeWindow extends ApplicationV2 {

  constructor({ trade, side }) {
    super({ id: `sbe-trade-${trade.id}` });
    this.trade = trade;
    this.side = side;                       /* "a" = initiateur, "b" = destinataire */
    this.other = side === "a" ? "b" : "a";
    this.offers = {
      a: { items: [], money: {}, validated: false },
      b: { items: [], money: {}, validated: false }
    };
    this._sent = false;
  }

  static DEFAULT_OPTIONS = {
    classes: ["sbe-trade-window"],
    window: { title: "SBE.Trade.WindowTitle", icon: "fa-solid fa-right-left", resizable: true },
    position: { width: 560, height: 480 },
    actions: {
      removeItem: SBETradeWindow.#onRemove,
      validate: SBETradeWindow.#onValidate,
      cancelTrade: SBETradeWindow.#onCancel
    }
  };

  get mine() { return this.offers[this.side]; }
  get theirs() { return this.offers[this.other]; }
  get myActor() { return fromUuidSync(this.trade[this.side].actor); }
  get theirActor() { return fromUuidSync(this.trade[this.other].actor); }
  get otherUser() { return this.trade[this.other].user; }

  /* ============================================================ */
  /*  Rendu                                                        */
  /* ============================================================ */

  async _prepareContext() {
    /* L'initiateur démarre avec l'objet du clic droit. */
    if (this.side === "a" && this.trade.firstItem && !this._seeded) {
      this._seeded = true;
      const it = this.myActor?.items?.get(this.trade.firstItem);
      if (it) {
        this.mine.items.push(this.#itemEntry(it, 1));
        this.#send(true);
      }
    }
    return {};
  }

  #itemEntry(it, qty) {
    return { id: it.id, name: it.name, img: it.img, qty, max: qtyOf(it) };
  }

  async _renderHTML() {
    const me = this.myActor, them = this.theirActor;
    const meId = Identity.of(Identity.refOf(me) || me) ?? { name: me?.name };
    const themId = Identity.of(Identity.refOf(them) || them) ?? { name: them?.name };
    const hasMoney = Money.enabled;

    const rows = (list, own) => list.length ? list.map((o, i) => `
      <li class="sbe-trade-item">
        <img src="${esc(o.img)}" alt="">
        <span class="sbe-trade-name">${esc(o.name)}</span>
        ${own && o.max > 1
          ? `<input type="number" class="sbe-trade-qty" data-index="${i}" value="${o.qty}" min="1" max="${o.max}" step="1">
             <span class="sbe-trade-max">/ ${o.max}</span>`
          : (o.qty > 1 ? `<span class="sbe-trade-qtyro">× ${o.qty}</span>` : "")}
        ${own ? `<a data-action="removeItem" data-index="${i}" title="${esc(L("SBE.Trade.Remove"))}"><i class="fa-solid fa-xmark"></i></a>` : ""}
      </li>`).join("")
      : `<li class="sbe-trade-empty">${esc(L(own ? "SBE.Trade.DropHere" : "SBE.Trade.Nothing"))}</li>`;

    const status = (o) => o.validated
      ? `<span class="sbe-trade-ok"><i class="fa-solid fa-circle-check"></i> ${esc(L("SBE.Trade.Validated"))}</span>`
      : `<span class="sbe-trade-wait"><i class="fa-solid fa-hourglass-half"></i> ${esc(L("SBE.Trade.Waiting"))}</span>`;

    return `
      <div class="sbe-trade-cols">
        <section class="sbe-trade-side sbe-trade-mine">
          <header>${esc(L("SBE.Trade.YouGive"))} <small>(${esc(meId.name)})</small></header>
          <ul class="sbe-trade-list sbe-trade-drop">${rows(this.mine.items, true)}</ul>
          ${hasMoney ? `<div class="sbe-trade-money"><span>${esc(L("SBE.Trade.Money"))}</span>
            ${Money.inputsHTML("tradeMoney", this.mine.money, Money.purseOf(me))}</div>` : ""}
          ${status(this.mine)}
        </section>
        <section class="sbe-trade-side sbe-trade-theirs">
          <header>${esc(L("SBE.Trade.YouGet"))} <small>(${esc(themId.name)})</small></header>
          <ul class="sbe-trade-list">${rows(this.theirs.items, false)}</ul>
          ${hasMoney ? `<div class="sbe-trade-money"><span>${esc(L("SBE.Trade.Money"))}</span> ${Money.html(this.theirs.money)}</div>` : ""}
          ${status(this.theirs)}
        </section>
      </div>
      <p class="notes">${esc(L("SBE.Trade.Rule"))}</p>
      <footer class="sbe-trade-foot">
        <button type="button" data-action="validate" class="${this.mine.validated ? "active" : ""}">
          <i class="fa-solid fa-check"></i> ${esc(L(this.mine.validated ? "SBE.Trade.Unvalidate" : "SBE.Trade.Validate"))}
        </button>
        <button type="button" data-action="cancelTrade"><i class="fa-solid fa-xmark"></i> ${esc(L("SBE.Common.Cancel"))}</button>
      </footer>`;
  }

  _replaceHTML(result, content) { content.innerHTML = result; }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element;
    /* Glisser un objet de SA fiche dans « Vous donnez ». */
    const drop = root.querySelector(".sbe-trade-mine");
    drop?.addEventListener("dragover", (ev) => ev.preventDefault());
    drop?.addEventListener("drop", (ev) => this.#onDrop(ev));
    for (const inp of root.querySelectorAll(".sbe-trade-qty")) {
      inp.addEventListener("change", () => {
        const o = this.mine.items[Number(inp.dataset.index)];
        if (!o) return;
        o.qty = Math.max(1, Math.min(o.max, Math.floor(Number(inp.value) || 1)));
        this.#changed();
      });
    }
    for (const inp of root.querySelectorAll('.sbe-trade-mine [name^="tradeMoney."]')) {
      inp.addEventListener("change", () => {
        this.mine.money = Money.readInputs(root.querySelector(".sbe-trade-mine"), "tradeMoney", Money.purseOf(this.myActor));
        this.#changed();
      });
    }
  }

  async #onDrop(ev) {
    ev.preventDefault();
    let data = null;
    try { data = foundry.applications.ux.TextEditor.implementation.getDragEventData(ev); } catch (_e) { /* */ }
    if (data?.type !== "Item" || !data.uuid) return;
    const it = await fromUuid(data.uuid).catch(() => null);
    if (!it || !it.parent || it.parent.uuid !== this.myActor?.uuid) { ui.notifications.warn(L("SBE.Trade.OwnOnly")); return; }
    if (!TradeManager.isTradeable(it)) { ui.notifications.warn(L("SBE.Trade.ErrNotTradeable", { name: it.name })); return; }
    if (it.parent.items.some(i => i.system?.carry?.host === it.id)) { ui.notifications.warn(L("SBE.Trade.HostsOthers")); return; }
    if (this.mine.items.some(o => o.id === it.id)) return;
    this.mine.items.push(this.#itemEntry(it, 1));
    this.#changed();
  }

  /* ============================================================ */
  /*  Synchronisation                                              */
  /* ============================================================ */

  /** Mon offre a changé : ma validation et celle de l'autre sautent. */
  #changed() {
    this.mine.validated = false;
    this.theirs.validated = false;
    this.#send(true);
    this.render();
  }

  #send(resetOther) {
    const p = {
      type: TRADE_SOCKET, op: "state", to: this.otherUser, id: this.trade.id,
      side: this.side, offer: foundry.utils.deepClone(this.mine), resetOther
    };
    emitSocket(p);
    /* Un MJ participe : il retient sa propre offre (son message ne lui
       revient pas ; les autres MJ la reçoivent). */
    if (game.user.isGM) TradeManager.noteOffer(p, game.user.id);
  }

  /** Message de l'autre participant. */
  receive(p) {
    if (p.op === "cancel") {
      TradeManager.playSound("cancel");
      ui.notifications.warn(L("SBE.Trade.CancelledBy"));
      this.closeQuiet();
      return;
    }
    if (p.op === "state" && p.side === this.other) {
      this.offers[this.other] = p.offer;
      if (p.resetOther) this.mine.validated = false;
      this.render();
      this.#maybeExecute();
    }
  }

  /** Les deux ont validé : l'initiateur demande l'exécution. */
  #maybeExecute() {
    if (this.side !== "a" || this._sent) return;
    if (!this.offers.a.validated || !this.offers.b.validated) return;
    this._sent = true;
    TradeManager.requestExecute(this.trade, foundry.utils.deepClone(this.offers));
  }

  static #onRemove(_ev, target) {
    this.mine.items.splice(Number(target.dataset.index), 1);
    this.#changed();
  }

  static #onValidate() {
    this.mine.validated = !this.mine.validated;
    this.#send(false);
    this.render();
    this.#maybeExecute();
  }

  static #onCancel() { this.close(); }

  /** Fermeture : annule l'échange chez l'autre (sauf fin normale). */
  async close(options = {}) {
    if (!this._quiet) {
      emitSocket({ type: TRADE_SOCKET, op: "cancel", to: this.otherUser, id: this.trade.id });
      TradeManager.playSound("cancel");
    }
    TradeManager.windows.delete(this.trade.id);
    return super.close(options);
  }

  closeQuiet() {
    this._quiet = true;
    return this.close();
  }
}
