/**
 * SBE — ÉCHANGES entre personnages
 *
 * Déroulé (comme l'ancien système, lancé du clic droit) :
 *   1. clic droit sur un objet porté → « Échanger l'objet » (seulement
 *      si l'objet est échangeable : famille cochée dans le manager, et
 *      pas dans la liste d'exclusion) ;
 *   2. choix du destinataire : TOUJOURS un personnage joueur dont le
 *      joueur est connecté, à portée si une distance est réglée.
 *      L'initiateur : un joueur, ou le MJ depuis un PNJ ;
 *   3. le destinataire accepte ou refuse (son « demande ») ;
 *   4. fenêtre à deux colonnes chez les deux (trade-window.mjs) ;
 *   5. les deux valident → le MJ principal exécute (une seule
 *      écriture), son « terminé » + carte chuchotée ; sinon « annulé ».
 *
 * Rien n'est câblé : l'argent est une CLÉ choisie dans le manager, les
 * objets passent par le même rangement que le glisser-déposer
 * (dropIntoContainer), les noms par Identity.
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { onSocketMessage, emitSocket, isPrimaryGM, gmQueue, valueQueue } from "../../helpers/socket.mjs";
import { Identity } from "../../helpers/identity.mjs";
import { walkElements, slotAccepts } from "../../builder/element-renderer.mjs";
import { dropIntoContainer, qtyOf, carrierOf, acceptsStacks, isStackableItem, isLockedItem, QUANTITY_KEY } from "../../builder/inventory.mjs";
import { WaitingItems } from "../waiting/waiting-items.mjs";
import { UiSound, uiSoundOf } from "../media/ui-sound.mjs";
import { ChatCards } from "../chat/chat-cards.mjs";
import { Money } from "../money/money.mjs";

const T = "sbeTrade";
const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

export class TradeManager {

  static DEFAULTS = {
    templates: [],      /* ids des modèles d'atelier échangeables */
    exclude: [],        /* ids des modèles d'objet exclus */
    distance: 0,        /* distance max entre pions (unités de scène), 0 = partout */
    sounds: {
      request: { sound: "", volume: 80 },
      done: { sound: "", volume: 80 },
      cancel: { sound: "", volume: 80 }
    }
  };

  /** Fenêtres ouvertes, par identifiant d'échange. */
  static windows = new Map();

  /* ============================================================ */
  /*  Réglages                                                     */
  /* ============================================================ */

  /** Activé ? (lisible dès « init », avant le chargement complet). */
  static get enabled() {
    try { return game.settings.get(SYSTEM_ID, "tradeEnabled") !== false; }
    catch (_e) {
      const raw = game.data?.settings?.find?.(s => s.key === `${SYSTEM_ID}.tradeEnabled`);
      if (!raw) return true;
      try { return JSON.parse(raw.value) !== false; } catch (_e2) { return true; }
    }
  }

  static getConfig() {
    let stored = {};
    try { stored = game.settings.get(SYSTEM_ID, "tradeConfig") ?? {}; } catch (_e) { /* */ }
    return foundry.utils.mergeObject(foundry.utils.deepClone(this.DEFAULTS), stored, { inplace: false });
  }

  /** L'objet peut-il être échangé ? */
  static isTradeable(item, cfg = null) {
    if (!this.enabled || item?.type !== "objet" || isLockedItem(item)) return false;
    const c = cfg ?? this.getConfig();
    if (!c.templates.includes(item.system?.templateId)) return false;
    const model = item.system?.modelId || item.id;
    return !c.exclude.includes(model);
  }

  /** Objets rangés DANS cet objet (un sac plein ne s'échange pas). */
  static #hostsOthers(item) {
    const carrier = carrierOf(item);
    return !!carrier?.items?.some(i => i.system?.carry?.host === item.id);
  }

  /* ============================================================ */
  /*  Participants                                                 */
  /* ============================================================ */

  /** Personnage joueur : au moins un joueur (non-MJ) en est propriétaire. */
  static isPJ(actor) {
    return !!actor && game.users.some(u => !u.isGM && actor.testUserPermission(u, "OWNER"));
  }

  /** Le joueur CONNECTÉ qui recevra la demande pour ce personnage. */
  static ownerUserOf(actor) {
    return game.users.find(u => u.active && !u.isGM && actor.testUserPermission(u, "OWNER"))
      ?? null;
  }

  /** Distance entre les pions de deux acteurs (scène affichée). */
  static #distance(a, b) {
    const ta = a.getActiveTokens?.(true, true) ?? [];
    const tb = b.getActiveTokens?.(true, true) ?? [];
    let best = Infinity;
    for (const x of ta) for (const y of tb) {
      try {
        const d = canvas.grid.measurePath([x.center ?? x.object?.center, y.center ?? y.object?.center]).distance;
        if (d < best) best = d;
      } catch (_e) { /* pas de scène */ }
    }
    return best;
  }

  /** Destinataires possibles pour cet initiateur. */
  static recipients(fromActor) {
    const max = Number(this.getConfig().distance) || 0;
    return game.actors.filter(a => a.type === "personnage" && a.id !== fromActor.id
      && this.isPJ(a) && this.ownerUserOf(a)
      && (max <= 0 || this.#distance(fromActor, a) <= max));
  }

  /* ============================================================ */
  /*  1-3. Demande                                                 */
  /* ============================================================ */

  /** Entrée du menu clic droit (ou null). */
  static menuEntry(item, sheetActor) {
    if (!this.isTradeable(item) || !sheetActor?.isOwner || sheetActor.type !== "personnage") return null;
    /* Un PNJ ne propose un échange que par la main du MJ. */
    if (!this.isPJ(sheetActor) && !game.user.isGM) return null;
    return {
      label: L("SBE.Trade.Menu"), icon: "fa-solid fa-right-left",
      onClick: () => this.start(sheetActor, item)
    };
  }

  static async start(fromActor, item) {
    if (this.#hostsOthers(item)) { ui.notifications.warn(L("SBE.Trade.HostsOthers")); return; }
    const list = this.recipients(fromActor);
    if (!list.length) { ui.notifications.warn(L("SBE.Trade.NoRecipient")); return; }
    const rows = list.map(a => {
      const id = Identity.of(Identity.refOf(a) || a) ?? { name: a.name, img: a.img };
      return `<label class="sbe-trade-pick">
        <input type="radio" name="to" value="${esc(a.uuid)}">
        <img src="${esc(id.img || a.img)}" alt=""><span>${esc(id.name)}</span>
      </label>`;
    }).join("");
    const toUuid = await foundry.applications.api.DialogV2.prompt({
      window: { title: L("SBE.Trade.PickTitle"), icon: "fa-solid fa-right-left" },
      content: `<p>${L("SBE.Trade.PickIntro", { item: esc(item.name) })}</p><div class="sbe-trade-picks">${rows}</div>`,
      ok: {
        label: L("SBE.Trade.Send"), icon: "fa-solid fa-paper-plane",
        callback: (_ev, button) => button.form.querySelector('input[name="to"]:checked')?.value ?? null
      },
      rejectClose: false
    }).catch(() => null);
    if (!toUuid) return;
    const toActor = await fromUuid(toUuid);
    const toUser = toActor ? this.ownerUserOf(toActor) : null;
    if (!toUser) { ui.notifications.warn(L("SBE.Trade.Offline")); return; }

    const trade = {
      id: foundry.utils.randomID(),
      a: { user: game.user.id, actor: fromActor.uuid },
      b: { user: toUser.id, actor: toActor.uuid },
      firstItem: item.id
    };
    this._pending = trade;
    this.playSound("request");
    ui.notifications.info(L("SBE.Trade.Sent"));
    emitSocket({ type: T, op: "offer", to: toUser.id, trade });
  }

  /** Chez le destinataire : accepter ou refuser. */
  static async #onOffer(trade) {
    this.playSound("request");
    const from = await fromUuid(trade.a.actor);
    const to = await fromUuid(trade.b.actor);
    const fromName = Identity.of(Identity.refOf(from) || from)?.name ?? "?";
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: L("SBE.Trade.OfferTitle"), icon: "fa-solid fa-right-left" },
      content: `<p>${L("SBE.Trade.OfferText", { from: `<b>${esc(fromName)}</b>`, to: `<b>${esc(to?.name ?? "")}</b>` })}</p>`,
      yes: { label: L("SBE.Trade.Accept"), icon: "fa-solid fa-check" },
      no: { label: L("SBE.Trade.Refuse"), icon: "fa-solid fa-xmark" },
      rejectClose: false
    }).catch(() => false);
    if (!ok) {
      this.playSound("cancel");
      emitSocket({ type: T, op: "refuse", to: trade.a.user, id: trade.id });
      return;
    }
    /* La fenêtre d'abord : l'offre de l'initiateur arrive juste après. */
    await this.openWindow(trade, "b");
    emitSocket({ type: T, op: "accept", to: trade.a.user, id: trade.id });
  }

  static async openWindow(trade, side) {
    const { SBETradeWindow } = await import("./trade-window.mjs");
    const w = new SBETradeWindow({ trade, side });
    this.windows.set(trade.id, w);
    await w.render(true);
    return w;
  }

  /* ============================================================ */
  /*  5. Exécution (MJ principal)                                  */
  /* ============================================================ */

  /** Ce que vaut une offre, vérifié sur les documents réels. */
  static async #checkOffer(actor, offer, cfg) {
    const items = [];
    const seen = new Set();
    for (const o of offer.items ?? []) {
      /* Un objet ne se propose qu'une fois (deux lignes du même objet
         le feraient partir deux fois). */
      if (seen.has(o?.id)) return { error: L("SBE.Trade.ErrQty", { name: o?.name ?? "" }) };
      seen.add(o?.id);
      const it = actor.items.get(o.id);
      if (!it) return { error: L("SBE.Trade.ErrGone", { name: o.name }) };
      if (!this.isTradeable(it, cfg)) return { error: L("SBE.Trade.ErrNotTradeable", { name: it.name }) };
      if (this.#hostsOthers(it)) return { error: L("SBE.Trade.HostsOthers") };
      const q = Math.max(1, Math.floor(Number(o.qty) || 1));
      if (q > qtyOf(it)) return { error: L("SBE.Trade.ErrQty", { name: it.name }) };
      items.push({ item: it, qty: q });
    }
    /* Argent : une bourse (des pièces de chaque monnaie). */
    const money = Money.clean(offer.money);
    if (!Money.covers(Money.purseOf(actor), money)) return { error: L("SBE.Trade.ErrMoney", { name: actor.name }) };
    return { items, money };
  }

  /** Premier conteneur du destinataire qui accepte l'objet (une pile
      va dans un conteneur qui accepte les piles). */
  static #containerFor(actor, item, qty = 1) {
    const needStacks = qty > 1 && isStackableItem(item);
    for (const el of walkElements(actor.system?.template?.system?.elements ?? [])) {
      if (el?.kind !== "container" || !el.key || el.config?.mode === "reference") continue;
      if (needStacks && !acceptsStacks(el)) continue;
      if (!slotAccepts(el, item, actor)) return el;
    }
    return null;
  }

  /* MJ principal : la dernière offre de chaque côté, telle que SA fenêtre
     l'a envoyée (expéditeur réel) — échange → { a, b }. */
  static #offers = new Map();

  /** Une offre vue passer (fenêtre d'un participant). */
  static noteOffer(p, from) {
    if (!p?.id || !["a", "b"].includes(p.side) || !p.offer) return;
    const rec = this.#offers.get(p.id) ?? {};
    rec[p.side] = { offer: foundry.utils.deepClone(p.offer), from };
    /* Une offre qui change annule la validation de l'autre : il doit
       revalider ce qu'il voit maintenant. */
    const other = p.side === "a" ? "b" : "a";
    if (p.resetOther && rec[other]?.offer) rec[other].offer.validated = false;
    this.#offers.set(p.id, rec);
    /* Rien ne traîne : un échange oublié part au bout d'une heure. */
    setTimeout(() => { if (this.#offers.get(p.id) === rec) this.#offers.delete(p.id); }, 3_600_000);
  }

  /**
   * Un échange à la fois (les deux inventaires sont relus juste avant).
   * On n'exécute que ce que CHAQUE participant a lui-même validé : les
   * offres retenues ici, envoyées par un propriétaire de chaque côté —
   * jamais l'état que l'initiateur transmet.
   */
  static execute(trade, state, from = game.user.id) {
    return gmQueue("sbe-trade", async () => {
      const rec = this.#offers.get(trade?.id) ?? {};
      const A = await fromUuid(trade?.a?.actor).catch(() => null);
      const B = await fromUuid(trade?.b?.actor).catch(() => null);
      const owns = (actor, uid) => { const u = game.users.get(uid); return !!u && (u.isGM || !!actor?.testUserPermission?.(u, "OWNER")); };
      const ok = A && B && owns(A, from)
        && rec.a?.offer?.validated && owns(A, rec.a.from)
        && rec.b?.offer?.validated && owns(B, rec.b.from);
      if (!ok) {
        const reason = L("SBE.Trade.Cancelled");
        emitSocket({ type: T, op: "result", id: trade?.id, ok: false, reason });
        this.#onResult({ id: trade?.id, ok: false, reason });
        return;
      }
      this.#offers.delete(trade.id);
      return this.#run(trade, { a: rec.a.offer, b: rec.b.offer });
    });
  }

  static async #run(trade, state) {
    const cfg = this.getConfig();
    const A = await fromUuid(trade.a.actor);
    const B = await fromUuid(trade.b.actor);
    const fail = (reason) => {
      emitSocket({ type: T, op: "result", id: trade.id, ok: false, reason });
      this.#onResult({ id: trade.id, ok: false, reason });
    };
    if (!A || !B) return fail(L("SBE.Trade.ErrGone", { name: "?" }));
    const offA = await this.#checkOffer(A, state.a, cfg);
    if (offA.error) return fail(offA.error);
    const offB = await this.#checkOffer(B, state.b, cfg);
    if (offB.error) return fail(offB.error);
    /* Chaque objet doit avoir sa place chez l'autre AVANT de bouger. */
    for (const [list, dest] of [[offA.items, B], [offB.items, A]]) {
      for (const { item, qty } of list) {
        if (!this.#containerFor(dest, item, qty)) return fail(L("SBE.Trade.ErrNoRoom", { name: item.name }));
      }
    }

    /* Objets : le même rangement que le glisser-déposer. Une grille
       spatiale sans la place reçoit quand même l'objet, hors de la
       grille : son nouveau propriétaire a une fenêtre pour s'organiser. */
    const moved = { a: [], b: [] };
    const overflowed = new Set();
    for (const [list, dest, side, from] of [[offA.items, B, "a", A], [offB.items, A, "b", B]]) {
      for (const { item, qty } of list) {
        const el = this.#containerFor(dest, item, qty);
        const name = item.name;
        const ok = await dropIntoContainer({ sheetDoc: dest, el, item, quantity: qty, overflow: true, origin: from.uuid }).catch(() => false);
        if (ok) moved[side].push(`${qty > 1 ? `${qty} × ` : ""}${name}`);
        if (ok === "overflow") overflowed.add(dest);
      }
    }
    /* Argent : une seule écriture par fiche. */
    if (!Money.isEmpty(offA.money) || !Money.isEmpty(offB.money)) {
      for (const [who, out, inc] of [[A, offA.money, offB.money], [B, offB.money, offA.money]]) {
        /* Dans la file des valeurs de la fiche (un achat au même instant). */
        await valueQueue(who, async () => {
          const ch = Money.changesFor(who, Money.add(Money.sub(Money.purseOf(who), out), inc));
          if (Object.keys(ch).length) await who.update(ch);
        });
      }
    }

    await this.#card(A, B, moved, offA.money, offB.money);
    emitSocket({ type: T, op: "result", id: trade.id, ok: true });
    this.#onResult({ id: trade.id, ok: true });
    for (const actor of overflowed) WaitingItems.notify(actor);
  }

  /** Carte chuchotée au MJ et aux deux participants. */
  static async #card(A, B, moved, mA, mB) {
    const list = (items, money) => {
      const lines = items.map(n => `<div class="sbe-card-line">${esc(n)}</div>`);
      if (!Money.isEmpty(money)) lines.push(`<div class="sbe-card-line">${Money.html(money)}</div>`);
      return lines.length ? lines.join("") : `<p class="sbe-card-none">${esc(L("SBE.Trade.Nothing"))}</p>`;
    };
    const whisper = game.users.filter(u => u.isGM || A.testUserPermission(u, "OWNER") || B.testUserPermission(u, "OWNER"))
      .map(u => u.id);
    await ChatCards.post({
      type: "trade",
      title: L("SBE.Trade.CardTitle"),
      sides: [
        { ref: Identity.refOf(A), body: `<div class="sbe-card-sub">${esc(L("SBE.Trade.Gives"))}</div>${list(moved.a, mA)}` },
        { ref: Identity.refOf(B), body: `<div class="sbe-card-sub">${esc(L("SBE.Trade.Gives"))}</div>${list(moved.b, mB)}` }
      ],
      whisper
    });
  }

  /* ============================================================ */
  /*  Sons et messages                                             */
  /* ============================================================ */

  static playSound(which) {
    const s = uiSoundOf(this.getConfig().sounds?.[which]);
    if (s.sound) UiSound.play(s);
  }

  static #onResult({ id, ok, reason }) {
    const w = this.windows.get(id);
    if (!w) return;
    this.playSound(ok ? "done" : "cancel");
    if (ok) ui.notifications.info(L("SBE.Trade.Done"));
    else ui.notifications.warn(reason || L("SBE.Trade.Cancelled"));
    w.closeQuiet();
  }

  /** Message reçu d'une fenêtre (l'autre participant). */
  static #toWindow(payload) {
    const w = this.windows.get(payload.id);
    if (w) w.receive(payload);
  }

  static init() {
    /* L'autre participant s'est déconnecté : l'échange s'arrête. */
    Hooks.on("userConnected", (user, connected) => {
      if (connected) return;
      for (const w of [...this.windows.values()]) {
        if (w.otherUser !== user.id) continue;
        TradeManager.playSound("cancel");
        ui.notifications.warn(L("SBE.Trade.PartnerLeft"));
        w.closeQuiet();
      }
      if (this._pending?.b.user === user.id) this._pending = null;
    });
    onSocketMessage(async (p) => {
      if (!p || p.type !== T) return;
      /* Exécution : le MJ principal seulement. */
      if (p.op === "execute") {
        if (game.user.isGM && isPrimaryGM()) await this.execute(p.trade, p.state, p._from);
        return;
      }
      /* Les offres passent par ici : chaque MJ retient qui a validé quoi
         (si le MJ principal part, celui qui prend le relais sait aussi). */
      if (p.op === "state" && game.user.isGM) this.noteOffer(p, p._from);
      if (p.op === "result") { this.#onResult(p); return; }
      if (p.to && p.to !== game.user.id) return;
      if (p.op === "offer") return this.#onOffer(p.trade);
      if (p.op === "refuse") {
        this.playSound("cancel");
        ui.notifications.warn(L("SBE.Trade.Refused"));
        this._pending = null;
        return;
      }
      if (p.op === "accept") {
        const trade = this._pending?.id === p.id ? this._pending : null;
        this._pending = null;
        if (trade) await this.openWindow(trade, "a");
        return;
      }
      this.#toWindow(p);
    });
  }

  /** Demande d'exécution (depuis la fenêtre de l'initiateur). */
  static requestExecute(trade, state) {
    if (game.user.isGM && isPrimaryGM()) return this.execute(trade, state);
    if (!game.users.activeGM) {
      ui.notifications.error(L("SBE.Trade.NoGM"));
      return null;
    }
    emitSocket({ type: T, op: "execute", trade, state });
    return null;
  }
}

export { T as TRADE_SOCKET, QUANTITY_KEY };
