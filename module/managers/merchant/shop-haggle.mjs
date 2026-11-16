/**
 * SBE — MARCHANDS : négociation
 *
 * Le MJ la propose depuis la boutique : le personnage, le jet (un champ à
 * jet des fiches), la difficulté, la durée (prochaine transaction, fin de
 * la journée de jeu, jusqu'à ce que le MJ l'annule), ce qu'elle touche
 * (achats, ventes) et le % de chaque issue (préremplis par le marchand).
 * Une carte part au joueur ; son jet donne l'issue, le MJ principal pose
 * la négociation sur le marchand (`deals`), lue par les prix.
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { onSocketMessage, isPrimaryGM, requestGM, gmQueue } from "../../helpers/socket.mjs";
import { rollField } from "../../builder/field-roll.mjs";
import { ChatCards } from "../chat/chat-cards.mjs";
import { CalendarManager } from "../calendar/calendar-manager.mjs";
import { RollRequests } from "../rollreq/roll-requests.mjs";
import { Identity } from "../../helpers/identity.mjs";
import { HAGGLE_OUTCOMES, DEAL_UNTIL, merchantOf, merchantHost, cleanDeal, dealKey } from "./merchant-model.mjs";
import { saveMerchant } from "./shop-trade.mjs";

const FLAG = "shopHaggle";
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const { DialogV2 } = foundry.applications.api;

/** Issue d'un jet → issue de négociation (un jet sans seuil compte comme réussi). */
const OUTCOME = { critSuccess: "critSuccess", success: "success", done: "success", failure: "failure", critFailure: "critFailure" };

/** « +10 % en sa faveur sur les achats et les ventes, prochaine transaction ». */
export function dealText(d) {
  const sides = [d.buy ? L("SBE.Shop.DealBuy") : "", d.sell ? L("SBE.Shop.DealSell") : ""].filter(Boolean).join(L("SBE.Shop.DealAnd"));
  const n = d.pct > 0 ? `+${d.pct}` : String(d.pct).replace("-", "−");
  return L("SBE.Shop.DealText", { n, sides, until: L(`SBE.Shop.Until_${d.until}`) });
}

export class ShopHaggle {

  static init() {
    onSocketMessage((p) => {
      if (p?.type === "sbeShopHaggle" && isPrimaryGM()) this.#apply(p.messageId, p.outcome, p.userId);
    });
    Hooks.on("renderChatMessageHTML", (message, html) => {
      try { this.#decorate(message, html instanceof HTMLElement ? html : html?.[0]); }
      catch (err) { console.warn("SBE | Négociation : carte en échec", err); }
    });
  }

  /** MJ : proposer une négociation. */
  static async propose(merchant, actor = null) {
    if (!game.user.isGM) return;
    const m = merchantOf(merchant);
    const pcs = RollRequests.playerCharacters();
    if (actor && !pcs.includes(actor)) pcs.unshift(actor);
    const keys = RollRequests.rollChoices();
    if (!pcs.length) { ui.notifications.warn(L("SBE.Shop.HaggleNoChar")); return; }
    if (!keys.length) { ui.notifications.warn(L("SBE.Shop.HaggleNoRoll")); return; }
    const opt = (v, cur, label) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(label)}</option>`;
    const content = `
      <div class="sbe-shopdlg">
        <label class="sbe-shopdlg-f"><span>${esc(L("SBE.Shop.HaggleWho"))}</span>
          <select name="actor">${pcs.map(a => opt(a.uuid, actor?.uuid, a.name)).join("")}</select></label>
        <div class="sbe-shopdlg-row">
          <label class="sbe-shopdlg-f"><span>${esc(L("SBE.Shop.HaggleRoll"))}</span>
            <select name="key">${keys.map(k => opt(k.key, "", k.label)).join("")}</select></label>
          <label class="sbe-shopdlg-f"><span>${esc(L("SBE.RollReq.Difficulty"))}</span>
            <input type="number" name="difficulty" step="1" value="0"></label>
        </div>
        <label class="sbe-shopdlg-f"><span>${esc(L("SBE.Shop.HaggleUntil"))}</span>
          <select name="until">${DEAL_UNTIL.map(u => opt(u, "next", L(`SBE.Shop.Until_${u}`))).join("")}</select></label>
        <div class="sbe-shopdlg-f"><span>${esc(L("SBE.Shop.HaggleOn"))}</span>
          <div class="sbe-shopdlg-row">
            <label class="sbe-shopdlg-check"><input type="checkbox" name="buy" checked> ${esc(L("SBE.Shop.HaggleOnBuy"))}</label>
            <label class="sbe-shopdlg-check"><input type="checkbox" name="sell" checked> ${esc(L("SBE.Shop.HaggleOnSell"))}</label>
          </div></div>
        <fieldset class="sbe-shopdlg-restock"><legend>${esc(L("SBE.Shop.HagglePcts"))}</legend>
          <div class="sbe-shopdlg-row">
            ${HAGGLE_OUTCOMES.map(k => `<label class="sbe-shopdlg-f"><span>${esc(L(`SBE.Merchant.Haggle_${k}`))}</span>
              <input type="number" name="${k}" step="1" min="-100" max="100" value="${m.haggle[k]}"></label>`).join("")}
          </div>
          <p class="notes">${esc(L("SBE.Merchant.HaggleHint"))}</p>
        </fieldset>
      </div>`;
    const res = await DialogV2.wait({
      window: { title: L("SBE.Shop.HaggleTitle"), icon: "fa-solid fa-handshake" },
      position: { width: 480 },
      content,
      buttons: [
        { action: "ok", label: L("SBE.Shop.HaggleSend"), icon: "fa-solid fa-paper-plane", default: true,
          callback: (_e, btn) => {
            const f = btn.form.elements;
            return {
              actor: f.actor.value, key: f.key.value, difficulty: Number(f.difficulty.value) || 0,
              until: f.until.value, buy: f.buy.checked, sell: f.sell.checked,
              pcts: Object.fromEntries(HAGGLE_OUTCOMES.map(k => [k, Number(f[k].value) || 0]))
            };
          } },
        { action: "cancel", label: L("SBE.Common.Cancel"), icon: "fa-solid fa-xmark" }
      ],
      rejectClose: false
    }).catch(() => null);
    if (!res || typeof res !== "object") return;
    if (!res.buy && !res.sell) { ui.notifications.warn(L("SBE.Shop.HaggleNoSide")); return; }
    const target = fromUuidSync(res.actor);
    if (!target) return;
    const name = RollRequests.labelOf(res.key);
    /* Noms lus chez chaque lecteur (le marchand peut être « Inconnu » pour le joueur). */
    const ref = (a) => `<b data-ref-name="${esc(Identity.refOf(a))}"></b>`;
    const text = esc(L("SBE.Shop.HaggleText", { actor: "\u0001", merchant: "\u0002", roll: name }))
      .replace("\u0001", ref(target)).replace("\u0002", ref(merchant));
    const whisper = game.users.filter(u => u.isGM || target.testUserPermission(u, "OWNER")).map(u => u.id);
    await ChatCards.post({
      type: "request",
      title: L("SBE.Shop.HaggleCard"),
      subtitle: RollRequests.diffNote(res.difficulty),
      body: `<p>${text}</p>`,
      speaker: { alias: L("SBE.RollReq.GM") },
      whisper,
      flags: { [SYSTEM_ID]: { [FLAG]: { ...res, merchant: merchant.uuid, name, state: "ask" } } }
    });
  }

  /** MJ : retirer la négociation d'un personnage. */
  static async cancel(merchant, actor) {
    if (!game.user.isGM) return;
    const deals = { ...merchantOf(merchant).deals };
    delete deals[dealKey(actor)];
    await saveMerchant(merchant, { deals });
  }

  /** Le joueur lance le jet depuis la carte. */
  /* Un seul jet par carte à la fois (double clic : pas deux jets). */
  static #rolling = new Set();

  static async #roll(message) {
    const f = message.getFlag(SYSTEM_ID, FLAG);
    const actor = f ? fromUuidSync(f.actor) : null;
    if (!actor?.isOwner || f.state !== "ask" || this.#rolling.has(message.id)) return;
    this.#rolling.add(message.id);
    let r;
    try {
      r = await rollField(actor, f.key, {
        ask: true, title: f.name, difficulty: -(Number(f.difficulty) || 0), note: RollRequests.diffNote(f.difficulty), after: "card"
      });
    } finally { this.#rolling.delete(message.id); }
    if (!r?.outcome) return;
    if (isPrimaryGM()) return this.#apply(message.id, r.outcome, game.user.id);
    requestGM({ type: "sbeShopHaggle", messageId: message.id, outcome: r.outcome, userId: game.user.id });
  }

  /** MJ principal : l'issue du jet devient la négociation du personnage. */
  /* Une issue à la fois par carte : la première ferme la carte, la
     suivante (deuxième jet, deux joueurs) la trouve close. */
  static #apply(messageId, outcome, userId) {
    return gmQueue(`haggle:${messageId}`, () => this.#applyNow(messageId, outcome, userId));
  }

  static async #applyNow(messageId, outcome, userId) {
    const message = game.messages.get(messageId);
    const f = message?.getFlag(SYSTEM_ID, FLAG);
    const actor = f ? fromUuidSync(f.actor) : null;
    const user = game.users.get(userId);
    const merchant = f ? await fromUuid(f.merchant).catch(() => null) : null;
    if (!f || f.state !== "ask" || !actor || !merchantHost(merchant) || !(user?.isGM || actor.testUserPermission(user, "OWNER"))) return;
    const issue = OUTCOME[outcome] ?? "failure";
    const deal = cleanDeal({ pct: f.pcts?.[issue] ?? 0, buy: f.buy, sell: f.sell, until: f.until, day: CalendarManager.dayIndex() });
    const deals = { ...merchantOf(merchant).deals };
    if (deal && deal.pct) deals[dealKey(actor)] = deal;
    else delete deals[dealKey(actor)];
    await saveMerchant(merchant, { deals });
    await message.setFlag(SYSTEM_ID, FLAG, { ...f, state: "done", issue, pct: deal?.pct ?? 0 });
  }

  static #decorate(message, root) {
    const f = message.getFlag(SYSTEM_ID, FLAG);
    if (!f || !root) return;
    const body = root.querySelector(".message-content") ?? root;
    body.querySelector(".sbe-shop-cardbar")?.remove();
    const bar = document.createElement("div");
    bar.className = "sbe-shop-cardbar sbe-tal-cardbar";
    if (f.state === "ask") {
      const actor = fromUuidSync(f.actor);
      if (actor?.isOwner) {
        bar.innerHTML = `<button type="button" class="sbe-rr-btn">${ChatCards.rollButtonInner()}</button>`;
        bar.querySelector("button").addEventListener("click", () => this.#roll(message));
      } else bar.innerHTML = `<span class="notes">${esc(L("SBE.Shop.HaggleWaiting"))}</span>`;
    } else {
      const d = { pct: f.pct, buy: f.buy, sell: f.sell, until: f.until };
      bar.innerHTML = `<span class="sbe-tal-cardstate is-${f.pct >= 0 ? "ok" : "no"}">${esc(L(`SBE.Merchant.Haggle_${f.issue}`))} — ${esc(f.pct ? dealText(d) : L("SBE.Shop.DealNone"))}</span>`;
    }
    body.appendChild(bar);
  }
}
