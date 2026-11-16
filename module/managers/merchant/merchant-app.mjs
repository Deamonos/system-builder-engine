/**
 * SBE — Réglages d'UN marchand (MJ ; menu ⋮ de la fiche → « Marchand »)
 *
 * Ce personnage (PJ ou PNJ) est-il un marchand, sa boutique ouverte, ses
 * prix (majoration), la validation des achats, sa caisse, la revente
 * (prix de rachat, ce que devient l'objet vendu, rachat par le vendeur),
 * les % de la négociation, la distance et les sons.
 * L'apparence du jeton boutique ouverte / fermée se règle dans les
 * Apparences du jeton (règle « Boutique »).
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { UiSound } from "../media/ui-sound.mjs";
import { Money } from "../money/money.mjs";
import { validateFormula } from "../../builder/formula-engine.mjs";
import {
  MERCHANT_FLAG, MERCHANT_CASH, MERCHANT_APPROVAL, SOLD_KEEP, REBUY_PRICE, HAGGLE_OUTCOMES,
  cleanMerchant, merchantOf, merchantHost, shopTemplates
} from "./merchant-model.mjs";

const { ApplicationV2 } = foundry.applications.api;
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const opt = (v, cur, label) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(label)}</option>`;

export class SBEMerchantApp extends ApplicationV2 {

  static #open = new Map();

  static open(actor) {
    const host = merchantHost(actor);
    if (!game.user.isGM || !host) return null;
    const cur = this.#open.get(host.uuid);
    if (cur?.rendered) { cur.bringToFront?.(); return cur; }
    const app = new SBEMerchantApp({ actor: host, id: `sbe-merchant-${host.uuid.replace(/\./g, "-")}` });
    this.#open.set(host.uuid, app);
    app.render({ force: true });
    return app;
  }

  constructor(options = {}) {
    super(options);
    this.actor = options.actor;
  }

  static DEFAULT_OPTIONS = {
    tag: "div",
    classes: ["sbe-merchant-app"],
    window: { title: "SBE.Merchant.AppTitle", icon: "fa-solid fa-store", resizable: true },
    position: { width: 520, height: 680 }
  };

  get title() { return `${L("SBE.Merchant.AppTitle")} — ${this.actor?.token?.name ?? this.actor?.name ?? ""}`; }

  async _renderHTML() {
    const m = merchantOf(this.actor);
    const f = (label, html, hint = "") => `<div class="sbe-mc-f"><span>${esc(L(label))}</span>${html}${hint ? `<p class="notes">${esc(L(hint))}</p>` : ""}</div>`;
    const check = (name, on, label) => `<label class="sbe-ma-check"><input type="checkbox" name="${name}" ${on ? "checked" : ""}> ${esc(L(label))}</label>`;
    return `<div class="sbe-ma-body">
      <section class="sbe-ma-sec">
        ${check("enabled", m.enabled, "SBE.Merchant.Enabled")}
        ${check("open", m.open, "SBE.Merchant.Open")}
        <p class="notes">${esc(L("SBE.Merchant.LookHint"))}</p>
        ${f("SBE.Merchant.ShopModel", `<select name="shop">${opt("", m.shop, L("SBE.Merchant.ShopDefault"))}${shopTemplates().map(t => opt(t.id, m.shop, t.name)).join("")}</select>`, "SBE.Merchant.ShopModelHint")}
      </section>
      <section class="sbe-ma-sec"><h3>${esc(L("SBE.Merchant.SecSales"))}</h3>
        <div class="sbe-ma-row">
          ${f("SBE.Merchant.Markup", `<input type="number" name="markup" step="1" min="-100" value="${m.markup}">`, "SBE.Merchant.MarkupHint")}
          ${f("SBE.Merchant.Approval", `<select name="approval">${MERCHANT_APPROVAL.map(a => opt(a, m.approval, L(`SBE.Merchant.Approval_${a}`))).join("")}</select>`)}
        </div>
      </section>
      <section class="sbe-ma-sec"><h3>${esc(L("SBE.Merchant.SecCash"))}</h3>
        ${f("SBE.Merchant.Cash", `<select name="cash">${MERCHANT_CASH.map(c => opt(c, m.cash, L(`SBE.Merchant.Cash_${c}`))).join("")}</select>`, "SBE.Merchant.CashHint")}
        <div class="sbe-ma-purse" ${m.cash === "own" ? "" : "hidden"}>
          ${Money.enabled ? Money.inputsHTML("purse", m.purse) : `<p class="notes">${esc(L("SBE.Chest.NoCurrencyHint"))}</p>`}
        </div>
      </section>
      <section class="sbe-ma-sec"><h3>${esc(L("SBE.Merchant.SecBuyback"))}</h3>
        ${check("buyback.enabled", m.buyback.enabled, "SBE.Merchant.BuybackEnabled")}
        ${f("SBE.Merchant.BuybackPct", `<input type="text" name="buyback.pct" value="${esc(m.buyback.pct)}" placeholder="50">`, "SBE.Merchant.BuybackPctHint")}
        ${f("SBE.Merchant.Keep", `<select name="buyback.keep">${SOLD_KEEP.map(k => opt(k, m.buyback.keep, L(`SBE.Merchant.Keep_${k}`))).join("")}</select>`)}
        ${check("buyback.rebuy", m.buyback.rebuy, "SBE.Merchant.Rebuy")}
        <div class="sbe-ma-row" data-show-rebuy ${m.buyback.rebuy ? "" : "hidden"}>
          ${f("SBE.Merchant.RebuyPrice", `<select name="buyback.rebuyPrice">${REBUY_PRICE.map(k => opt(k, m.buyback.rebuyPrice, L(`SBE.Merchant.RebuyPrice_${k}`))).join("")}</select>`)}
          <div data-show-rebuyformula ${m.buyback.rebuyPrice === "formula" ? "" : "hidden"}>
            ${f("SBE.Merchant.RebuyFormula", `<input type="text" name="buyback.rebuyFormula" value="${esc(m.buyback.rebuyFormula)}">`, "SBE.Merchant.RebuyFormulaHint")}
          </div>
        </div>
      </section>
      <section class="sbe-ma-sec"><h3>${esc(L("SBE.Merchant.SecHaggle"))}</h3>
        <p class="notes">${esc(L("SBE.Merchant.HaggleHint"))}</p>
        <div class="sbe-ma-row">
          ${HAGGLE_OUTCOMES.map(k => f(`SBE.Merchant.Haggle_${k}`, `<input type="number" name="haggle.${k}" step="1" min="-100" max="100" value="${m.haggle[k]}">`)).join("")}
        </div>
      </section>
      <section class="sbe-ma-sec"><h3>${esc(L("SBE.Merchant.SecAccess"))}</h3>
        ${f("SBE.Merchant.Distance", `<input type="number" name="distance" min="0" step="1" value="${m.distance}">`, "SBE.Merchant.DistanceHint")}
      </section>
      <section class="sbe-ma-sec"><h3>${esc(L("SBE.Merchant.SecSounds"))}</h3>
        <div class="sbe-uisound-block">
          ${UiSound.fieldsHtml("sounds.open", m.sounds.open, "SBE.Merchant.SoundOpen")}
          ${UiSound.fieldsHtml("sounds.close", m.sounds.close, "SBE.Merchant.SoundClose")}
          ${UiSound.fieldsHtml("sounds.buy", m.sounds.buy, "SBE.Merchant.SoundBuy")}
          ${UiSound.fieldsHtml("sounds.sell", m.sounds.sell, "SBE.Merchant.SoundSell")}
          ${UiSound.fieldsHtml("sounds.rebuy", m.sounds.rebuy, "SBE.Merchant.SoundRebuy")}
        </div>
      </section>
    </div>
    <footer class="sbe-mc-foot"><button type="button" data-act="save"><i class="fa-solid fa-floppy-disk"></i> ${esc(L("SBE.Common.Save"))}</button></footer>`;
  }

  _replaceHTML(result, content) { content.innerHTML = result; }

  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    this.element.addEventListener("click", (ev) => { if (ev.target.closest('[data-act="save"]')) this.#save(); });
    this.element.addEventListener("change", (ev) => {
      if (ev.target.name === "cash") this.element.querySelector(".sbe-ma-purse").hidden = ev.target.value !== "own";
      if (ev.target.name === "buyback.rebuy") this.element.querySelector("[data-show-rebuy]").hidden = !ev.target.checked;
      if (ev.target.name === "buyback.rebuyPrice") this.element.querySelector("[data-show-rebuyformula]").hidden = ev.target.value !== "formula";
    });
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    UiSound.wire(this.element);
  }

  #read() {
    const root = this.element;
    const v = (n) => root.querySelector(`[name="${n}"]`);
    /* Ce que la fenêtre ne montre pas (le stock) reste tel quel. */
    const cur = merchantOf(this.actor);
    return cleanMerchant({
      ...cur,
      shop: v("shop")?.value ?? cur.shop,
      enabled: v("enabled")?.checked,
      open: v("open")?.checked,
      markup: v("markup")?.value,
      approval: v("approval")?.value,
      cash: v("cash")?.value,
      purse: Money.readInputs(root, "purse"),
      buyback: {
        enabled: v("buyback.enabled")?.checked, pct: v("buyback.pct")?.value, rebuy: v("buyback.rebuy")?.checked,
        keep: v("buyback.keep")?.value, rebuyPrice: v("buyback.rebuyPrice")?.value, rebuyFormula: v("buyback.rebuyFormula")?.value
      },
      haggle: Object.fromEntries(HAGGLE_OUTCOMES.map(k => [k, v(`haggle.${k}`)?.value])),
      distance: v("distance")?.value,
      sounds: { open: UiSound.read(root, "sounds.open"), close: UiSound.read(root, "sounds.close"), buy: UiSound.read(root, "sounds.buy"), sell: UiSound.read(root, "sounds.sell"), rebuy: UiSound.read(root, "sounds.rebuy") }
    });
  }

  async #save() {
    const m = this.#read();
    for (const raw of [m.buyback.pct, m.buyback.rebuyPrice === "formula" ? m.buyback.rebuyFormula : ""]) {
      if (!raw || Number.isFinite(Number(raw))) continue;
      const err = validateFormula(raw);
      if (err) { ui.notifications.error(err); return; }
    }
    /* Écrit en entier (une fusion garderait une monnaie vidée, une négociation retirée). */
    await this.actor.update({ [`flags.${SYSTEM_ID}.${MERCHANT_FLAG}`]: foundry.data.operators.ForcedReplacement.create(m) });
    ui.notifications.info(L("SBE.Merchant.SavedOne", { name: this.actor.name }));
  }

  async _onClose(options) {
    SBEMerchantApp.#open.delete(this.actor?.uuid);
    return super._onClose?.(options);
  }
}
