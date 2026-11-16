/**
 * SBE — Manager « Marchands et monnaies » (MJ, paramètres du système)
 *
 * Onglet « Monnaies » : la bibliothèque commune des monnaies (échanges,
 * coffres, marchands). Une ligne par monnaie : nom, clé de la fiche de
 * personnage, valeur en unité de base, icône.
 * Onglet « Objets et prix » : la clé de prix des modèles d'objets, et ce
 * que les marchands vendent / rachètent (familles d'atelier + exceptions).
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { buildKeyRefOptions } from "../../helpers/key-refs.mjs";
import { Money, MONEY_SETTING, cleanCurrency } from "../money/money.mjs";
import { MERCHANTS_SETTING, merchantSettings, cleanMerchantSettings, shopTemplates, allMerchants, merchantOf } from "./merchant-model.mjs";
import { createBaseShop, createEmptyShop } from "./shop-base.mjs";

const { ApplicationV2 } = foundry.applications.api;
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const FP = () => foundry.applications.apps.FilePicker.implementation;

export class SBEMerchantConfig extends ApplicationV2 {

  static DEFAULT_OPTIONS = {
    id: "sbe-merchant-config",
    tag: "div",
    classes: ["sbe-merchant-config"],
    window: { title: "SBE.Merchant.ConfigTitle", icon: "fa-solid fa-store", resizable: true },
    position: { width: 620, height: 640 }
  };

  tab = "money";
  /** Copies de travail (enregistrées avec « Enregistrer »). */
  _money = null;
  _items = null;

  async _renderHTML() {
    this._money ??= Money.all();
    this._items ??= merchantSettings();
    const tabs = [["money", "fa-coins", "SBE.Merchant.TabMoney"], ["items", "fa-tags", "SBE.Merchant.TabItems"], ["shops", "fa-store", "SBE.Merchant.TabShops"]];
    const nav = `<nav class="sbe-mc-tabs">${tabs.map(([t, i, k]) => `<button type="button" data-tab="${t}" class="${this.tab === t ? "on" : ""}"><i class="fa-solid ${i}"></i> ${esc(L(k))}</button>`).join("")}</nav>`;
    return `${nav}<div class="sbe-mc-body">${this.tab === "items" ? this.#itemsHTML() : this.tab === "shops" ? this.#shopsHTML() : this.#moneyHTML()}</div>
      <footer class="sbe-mc-foot"><button type="button" data-act="save"><i class="fa-solid fa-floppy-disk"></i> ${esc(L("SBE.Common.Save"))}</button></footer>`;
  }

  #moneyHTML() {
    const rows = this._money.map((c, i) => `
      <div class="sbe-mc-cur" data-i="${i}">
        <button type="button" class="sbe-mc-ico" data-act="icon" data-tooltip-text="${esc(L("SBE.Money.PickIcon"))}">${Money.iconHTML(c)}</button>
        <label class="sbe-mc-f"><span>${esc(L("SBE.Money.Name"))}</span><input type="text" data-f="name" value="${esc(c.name)}"></label>
        <label class="sbe-mc-f"><span>${esc(L("SBE.Money.Key"))}</span><select data-f="key">${buildKeyRefOptions("actor", c.key)}</select></label>
        <label class="sbe-mc-f sbe-mc-rate"><span>${esc(L("SBE.Money.Rate"))}</span><input type="number" data-f="rate" min="1" step="1" value="${c.rate}"></label>
        <button type="button" class="sbe-mc-del" data-act="del" data-tooltip-text="${esc(L("SBE.Money.Delete"))}" aria-label="${esc(L("SBE.Money.Delete"))}"><i class="fa-solid fa-trash"></i></button>
      </div>`).join("");
    const ok = this._money.filter(c => c.key);
    const ex = ok.length > 1 ? `<p class="notes sbe-mc-example">${esc(L("SBE.Money.Example", { text: this.#exampleText(ok) }))}</p>` : "";
    return `<section class="sbe-mc-sec">
        <p class="notes">${esc(L("SBE.Money.Hint"))}</p>
        <div class="sbe-mc-curs">${rows || `<p class="notes">${esc(L("SBE.Money.None"))}</p>`}</div>
        <button type="button" data-act="add"><i class="fa-solid fa-plus"></i> ${esc(L("SBE.Money.Add"))}</button>
        ${ex}
      </section>`;
  }

  /** Boutiques : le modèle par défaut, et le modèle de base à créer. */
  #shopsHTML() {
    const list = shopTemplates();
    const cur = this._items.shop;
    const opts = `<option value="">${esc(L("SBE.Merchant.ShopFirst"))}</option>` + list.map(t => `<option value="${esc(t.id)}" ${t.id === cur ? "selected" : ""}>${esc(t.name)}</option>`).join("");
    return `<section class="sbe-mc-sec">
        <p class="notes">${esc(L("SBE.Merchant.ShopsHint"))}</p>
        <div class="sbe-mc-f"><span>${esc(L("SBE.Merchant.ShopDefaultModel"))}</span><select data-g="shop">${opts}</select></div>
        <ul class="sbe-trade-checks">${list.map(t => `<li class="sbe-trade-check"><img src="${esc(t.img)}" alt=""> <a data-act="openShopTpl" data-id="${esc(t.id)}">${esc(t.name)}</a>
          <button type="button" class="sbe-mc-del sbe-mc-shopdel" data-act="delShopTpl" data-id="${esc(t.id)}" data-tooltip-text="${esc(L("SBE.Merchant.DeleteShop"))}" aria-label="${esc(L("SBE.Merchant.DeleteShop"))}"><i class="fa-solid fa-trash"></i></button></li>`).join("") || `<li class="sbe-trade-empty">${esc(L("SBE.Merchant.NoShops"))}</li>`}</ul>
        <div class="sbe-mc-shopbtns">
          <button type="button" data-act="newShop"><i class="fa-solid fa-plus"></i> ${esc(L("SBE.Merchant.NewShop"))}</button>
          <button type="button" data-act="baseShop"><i class="fa-solid fa-wand-magic-sparkles"></i> ${esc(L("SBE.Merchant.CreateBaseShop"))}</button>
        </div>
      </section>`;
  }

  /** Objets et prix : clé de prix, familles vendues / rachetées, exceptions. */
  #itemsHTML() {
    const c = this._items;
    const tpls = game.items.filter(i => i.type === "template").sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
    const side = (k) => {
      const fam = tpls.map(t => `<label class="sbe-trade-check"><input type="checkbox" data-side="${k}" data-tpl="${esc(t.id)}" ${c[k].templates.includes(t.id) ? "checked" : ""}>
          <img src="${esc(t.img)}" alt=""> ${esc(t.name)}</label>`).join("") || `<p class="notes">${esc(L("SBE.Trade.NoFamilies"))}</p>`;
      const exc = c[k].exclude.map(id => {
        const m = game.items.get(id);
        return `<li class="sbe-trade-check"><img src="${esc(m?.img ?? "icons/svg/hazard.svg")}" alt=""> ${esc(m?.name ?? L("SBE.Trade.Missing"))}
          <a data-act="unexclude" data-side="${k}" data-id="${esc(id)}" data-tooltip-text="${esc(L("SBE.Trade.Remove"))}"><i class="fa-solid fa-xmark"></i></a></li>`;
      }).join("");
      return `<section class="sbe-mc-sec"><h3>${esc(L(`SBE.Merchant.Side_${k}`))}</h3>
        <p class="notes">${esc(L(`SBE.Merchant.Side_${k}Hint`))}</p>
        <div class="sbe-trade-checks">${fam}</div>
        <span class="sbe-mc-lbl">${esc(L("SBE.Trade.Exclude"))}</span>
        <ul class="sbe-trade-checks sbe-mc-excdrop" data-side="${k}">${exc || `<li class="sbe-trade-empty">${esc(L("SBE.Trade.ExcludeDrop"))}</li>`}</ul></section>`;
    };
    return `<section class="sbe-mc-sec">
        <div class="sbe-mc-f"><span>${esc(L("SBE.Merchant.PriceKey"))}</span><select data-g="priceKey">${buildKeyRefOptions("item", c.priceKey)}</select>
          <p class="notes">${esc(L("SBE.Merchant.PriceKeyHint"))}</p></div>
      </section>${side("sell")}${side("buy")}`;
  }

  /** Exemple : la plus forte monnaie exprimée dans la plus faible. */
  #exampleText(list) {
    const s = [...list].sort((a, b) => b.rate - a.rate);
    return s.slice(0, -1).map(c => `1 ${c.name || c.key} = ${c.rate / s.at(-1).rate} ${s.at(-1).name || s.at(-1).key}`).join(" · ");
  }

  _replaceHTML(result, content) { content.innerHTML = result; }

  /* Écouteurs posés une fois : le contenu est remplacé à chaque rendu. */
  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    this.element.addEventListener("click", (ev) => this.#onClick(ev));
    this.element.addEventListener("change", (ev) => this.#onChange(ev));
    this.element.addEventListener("dragover", (ev) => { if (ev.target.closest(".sbe-mc-excdrop")) ev.preventDefault(); });
    this.element.addEventListener("drop", (ev) => this.#onExcludeDrop(ev));
  }

  /** Exceptions : glisser un objet (du répertoire, ou un exemplaire porté → son modèle). */
  async #onExcludeDrop(ev) {
    const zone = ev.target.closest(".sbe-mc-excdrop");
    if (!zone) return;
    ev.preventDefault();
    let data = null;
    try { data = foundry.applications.ux.TextEditor.implementation.getDragEventData(ev); } catch (_e) { /* */ }
    if (data?.type !== "Item" || !data.uuid) return;
    const it = await fromUuid(data.uuid).catch(() => null);
    const model = it?.parent ? game.items.get(it.system?.modelId ?? "") : it;
    if (!model || model.type !== "objet" || model.parent) { ui.notifications.warn(L("SBE.Trade.ExcludeBad")); return; }
    const list = this._items[zone.dataset.side].exclude;
    if (!list.includes(model.id)) list.push(model.id);
    this.render();
  }

  #onChange(ev) {
    const t = ev.target;
    if (t.dataset.g === "priceKey") { this._items.priceKey = t.value; return; }
    if (t.dataset.g === "shop") { this._items.shop = t.value; return; }
    if (t.dataset.side && t.dataset.tpl) {
      const list = this._items[t.dataset.side].templates;
      const i = list.indexOf(t.dataset.tpl);
      if (t.checked && i < 0) list.push(t.dataset.tpl);
      if (!t.checked && i >= 0) list.splice(i, 1);
      return;
    }
    const row = ev.target.closest(".sbe-mc-cur");
    const f = ev.target.dataset.f;
    if (!row || !f) return;
    const c = this._money[Number(row.dataset.i)];
    if (!c) return;
    c[f] = f === "rate" ? Math.max(1, Math.floor(Number(ev.target.value) || 1)) : String(ev.target.value ?? "");
    if (f === "key" && !c.name) {
      c.name = ev.target.selectedOptions?.[0]?.textContent?.replace(/\s*\([^)]*\)\s*$/, "") ?? "";
      this.render();
    } else if (f === "rate") this.render();
  }

  async #onClick(ev) {
    const b = ev.target.closest("[data-act], [data-tab]");
    if (!b) return;
    if (b.dataset.tab) { this.tab = b.dataset.tab; this.render(); return; }
    const row = b.closest(".sbe-mc-cur");
    const i = row ? Number(row.dataset.i) : -1;
    switch (b.dataset.act) {
      case "add":
        this._money.push(cleanCurrency({ rate: this._money.length ? Math.max(...this._money.map(c => c.rate)) * 10 : 1 }));
        return this.render();
      case "del":
        this._money.splice(i, 1);
        return this.render();
      case "icon": {
        const c = this._money[i];
        if (!c) return;
        new (FP())({ type: "image", current: c.icon, callback: (path) => { c.icon = path; this.render(); } }).render(true);
        return;
      }
      case "unexclude": {
        const list = this._items[b.dataset.side]?.exclude ?? [];
        const j = list.indexOf(b.dataset.id);
        if (j >= 0) list.splice(j, 1);
        return this.render();
      }
      case "baseShop": {
        const tpl = await createBaseShop();
        if (!this._items.shop && tpl) this._items.shop = tpl.id;
        tpl?.sheet?.render(true);
        return this.render();
      }
      case "newShop": {
        const tpl = await createEmptyShop();
        tpl?.sheet?.render(true);
        return this.render();
      }
      case "delShopTpl": return this.#deleteShop(b.dataset.id);
      case "openShopTpl": return game.actors.get(b.dataset.id)?.sheet?.render(true);
      case "save": return this.#save();
    }
  }

  /** Supprime un modèle de boutique (après confirmation) ; ses marchands passent à celui par défaut. */
  async #deleteShop(id) {
    const tpl = game.actors.get(id);
    if (!tpl) return;
    const users = allMerchants().filter(m => merchantOf(m).shop === id).length;
    const content = `<p>${L("SBE.Merchant.DeleteShopAsk", { name: esc(tpl.name) })}</p>`
      + (users ? `<p class="notes">${esc(L("SBE.Merchant.DeleteShopUsers", { n: users }))}</p>` : "");
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: L("SBE.Merchant.DeleteShop") }, content, rejectClose: false
    });
    if (!ok) return;
    await tpl.delete();
    if (this._items.shop === id) this._items.shop = "";
    const saved = merchantSettings();
    if (saved.shop === id) await game.settings.set(SYSTEM_ID, MERCHANTS_SETTING, cleanMerchantSettings({ ...saved, shop: "" }));
    this.render();
  }

  async #save() {
    const list = this._money.map(cleanCurrency);
    const keys = list.filter(c => c.key).map(c => c.key);
    if (new Set(keys).size !== keys.length) { ui.notifications.error(L("SBE.Money.KeyTwice")); return; }
    if (new Set(list.map(c => c.rate)).size !== list.length) { ui.notifications.error(L("SBE.Money.RateTwice")); return; }
    await game.settings.set(SYSTEM_ID, MONEY_SETTING, list);
    await game.settings.set(SYSTEM_ID, MERCHANTS_SETTING, cleanMerchantSettings(this._items));
    this._money = Money.all();
    this._items = merchantSettings();
    ui.notifications.info(L("SBE.Merchant.Saved"));
    this.render();
  }
}
