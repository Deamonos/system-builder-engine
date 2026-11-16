/**
 * SBE — COMPOSANTS DE BOUTIQUE (modèles de genre « shop »)
 *
 *   shopStall   Étal : le stock du marchand. Affichage : liste (1 à 4
 *               colonnes), grille d'icônes, grille spatiale ; onglets par
 *               famille (modèle d'atelier) ou par la valeur d'une clé.
 *   shopCash    Caisse du marchand
 *   shopPurse   Bourse de l'acheteur
 *   shopSell    Zone de vente : on y dépose un objet pour le vendre
 *   shopSellList Inventaire à vendre : les objets de l'acheteur que le
 *               marchand rachète, avec leur prix
 *   shopHistory Historique : achats, ventes, rachats (le joueur voit les
 *               siens, le MJ tout, avec un filtre par personnage)
 *
 * Sur la fiche, ils lisent `opts.shop` :
 *   { merchant, buyer, rows (stockRows), m (merchantOf), tabs: {elId: valeur},
 *     isGM, canBuy, sellRows, log, actors, histFilter }
 * Achat : [data-shop-buy] (bouton de la liste, case des grilles). MJ :
 * [data-shop-edit], clic droit sur [data-shop-entry], [data-shop-restock].
 */

import { Money } from "../../managers/money/money.mjs";
import { merchantHost } from "../../managers/merchant/merchant-model.mjs";
import { spatialDims, spatialOf, spatialLayout, spatialBoardHTML, spatialArtHTML } from "../spatial.mjs";

export const SHOP_KINDS = ["shopStall", "shopCash", "shopPurse", "shopSell", "shopSellList", "shopHistory"];
export const STALL_VIEWS = ["list", "grid", "spatial"];
export const STALL_TABS = ["none", "family", "key"];

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const int = (v, min, max, d) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };

/** Réglages de l'Étal. */
export function stallConfig(el) {
  const c = el?.config ?? {};
  return {
    view: STALL_VIEWS.includes(c.view) ? c.view : "list",
    cols: int(c.cols, 1, 4, 1),
    cellSize: int(c.cellSize, 24, 256, 56),
    gridCols: int(c.gridCols, 0, 50, 0),
    gridRows: int(c.gridRows, 0, 100, 0),
    tabs: STALL_TABS.includes(c.tabs) ? c.tabs : "none",
    tabKey: String(c.tabKey ?? "").trim(),
    showQty: c.showQty !== false,
    soldOut: c.soldOut === "hide" ? "hide" : "show"
  };
}

/* ---------------------------------------------------------- */
/*  Atelier : aperçus                                          */
/* ---------------------------------------------------------- */

const SAMPLE = [["icons/svg/sword.svg", 120], ["icons/svg/shield.svg", 80], ["icons/svg/heal.svg", 15], ["icons/svg/book.svg", 40]];

export function shopWorkshopHTML(el) {
  switch (el.kind) {
    case "shopStall": {
      const c = stallConfig(el);
      const tabs = c.tabs === "none" ? "" : `<div class="sbe-shop-tabs"><a class="active">${esc(L("SBE.Shop.TabSample1"))}</a><a>${esc(L("SBE.Shop.TabSample2"))}</a></div>`;
      const body = c.view === "list"
        ? `<div class="sbe-shop-list" style="--sbe-shop-cols:${c.cols}">${SAMPLE.map(([img, p]) => `<div class="sbe-shop-row"><img src="${img}" alt=""><span class="sbe-shop-name">${esc(L("SBE.Shop.Sample"))}</span>${c.showQty ? `<span class="sbe-shop-qty">×3</span>` : ""}<span class="sbe-shop-price">${Money.html(p)}</span><button type="button" disabled><i class="fa-solid fa-cart-shopping"></i></button></div>`).join("")}</div>`
        : `<div class="sbe-shop-grid" style="--sbe-grid-cell:${c.cellSize}px">${SAMPLE.map(([img]) => `<div class="sbe-shop-cell"><img src="${img}" alt=""></div>`).join("")}</div>`;
      return `<div class="sbe-shop-stall is-preview"><div class="sbe-shop-head"><i class="fa-solid fa-store"></i> ${esc(el.label || L("SBE.Template.Kind.shopStall"))}</div>${tabs}${body}</div>`;
    }
    case "shopCash":
      return `<div class="sbe-shop-money"><span>${esc(el.label || L("SBE.Template.Kind.shopCash"))}</span> ${Money.html(1250)}</div>`;
    case "shopPurse":
      return `<div class="sbe-shop-money"><span>${esc(el.label || L("SBE.Template.Kind.shopPurse"))}</span> ${Money.html(340)}</div>`;
    case "shopSell":
      return `<div class="sbe-shop-sell is-preview"><i class="fa-solid fa-hand-holding-dollar"></i> ${esc(el.config?.text || L("SBE.Shop.SellDrop"))}</div>`;
    case "shopSellList":
      return `<div class="sbe-shop-stall is-preview">${headOf(el, "fa-hand-holding-dollar")}<div class="sbe-shop-list">${SAMPLE.slice(0, 2).map(([img, p]) => `<div class="sbe-shop-row"><img src="${img}" alt=""><span class="sbe-shop-name">${esc(L("SBE.Shop.Sample"))}</span><span class="sbe-shop-qty">×1</span><span class="sbe-shop-price">${Money.html(Math.round(p / 2))}</span><button type="button" disabled><i class="fa-solid fa-hand-holding-dollar"></i></button></div>`).join("")}</div></div>`;
    case "shopHistory":
      return `<div class="sbe-shop-stall is-preview">${headOf(el, "fa-clock-rotate-left")}<div class="sbe-shop-hist">${SAMPLE.slice(0, 2).map(([img, p], i) => `<div class="sbe-shop-hrow"><span class="sbe-shop-hdate">—</span><img src="${img}" alt=""><span class="sbe-shop-hkind is-${i ? "sell" : "buy"}">${esc(L(`SBE.Shop.Kind_${i ? "sell" : "buy"}`))}</span><span class="sbe-shop-name">${esc(L("SBE.Shop.Sample"))}</span><span class="sbe-shop-price">${Money.html(p)}</span></div>`).join("")}</div></div>`;
    default: return "";
  }
}

/* ---------------------------------------------------------- */
/*  Boutique                                                    */
/* ---------------------------------------------------------- */

/** Le contenu d'un composant de boutique (la fiche ajoute son cadre). */
export function shopSheetHTML(el, opts) {
  const s = opts.shop;
  if (!s) return shopWorkshopHTML(el);
  switch (el.kind) {
    case "shopStall": return stallHTML(el, s);
    case "shopCash": {
      const v = s.m.cash === "unlimited" ? `<span class="sbe-shop-unl">${esc(L("SBE.Shop.Unlimited"))}</span>`
        : Money.html(s.m.cash === "own" ? s.m.purse : Money.purseOf(merchantHost(s.merchant)));
      return `<div class="sbe-shop-money"><span>${esc(el.label || L("SBE.Template.Kind.shopCash"))}</span> ${v}</div>`;
    }
    case "shopPurse":
      return `<div class="sbe-shop-money"><span>${esc(el.label || L("SBE.Template.Kind.shopPurse"))}</span> ${s.buyer ? Money.html(Money.purseOf(s.buyer)) : "—"}</div>`;
    case "shopSellList": return sellListHTML(el, s);
    case "shopHistory": return historyHTML(el, s);
    case "shopSell": {
      const off = !s.m.buyback.enabled;
      return `<div class="sbe-shop-sell${off ? " is-off" : ""}" ${off ? "" : "data-shop-sell"}><i class="fa-solid ${off ? "fa-ban" : "fa-hand-holding-dollar"}"></i> ${esc(off ? L("SBE.Shop.NoBuyback") : (el.config?.text || L("SBE.Shop.SellDrop")))}</div>`;
    }
    default: return "";
  }
}

/** L'en-tête d'un composant (son libellé), s'il en a un. */
function headOf(el, icon) {
  return el.label ? `<div class="sbe-shop-head"><i class="fa-solid ${icon}"></i> ${esc(el.label)}</div>` : "";
}

/** Inventaire à vendre : les objets de l'acheteur que le marchand rachète. */
function sellListHTML(el, s) {
  let body;
  if (!s.m.buyback.enabled) body = `<p class="notes">${esc(L("SBE.Shop.NoBuyback"))}</p>`;
  else if (!s.buyer) body = `<p class="notes">${esc(L("SBE.Shop.NoBuyerSell"))}</p>`;
  else if (!s.sellRows.length) body = `<p class="notes sbe-shop-empty">${esc(L("SBE.Shop.SellEmpty"))}</p>`;
  else {
    body = `<div class="sbe-shop-list">${s.sellRows.map(r => `
      <div class="sbe-shop-row">
        <img src="${esc(r.img)}" alt="">
        <span class="sbe-shop-name" data-tooltip-text="${esc(r.name)}">${esc(r.name)}</span>
        <span class="sbe-shop-qty">×${r.qty}</span>
        <span class="sbe-shop-price" data-tooltip-text="${esc(L("SBE.Shop.UnitBuyback"))}">${Money.html(r.unit)}</span>
        <button type="button" data-shop-sellitem="${esc(r.uuid)}" ${s.canBuy ? "" : "disabled"} data-tooltip-text="${esc(L("SBE.Shop.Sell"))}" aria-label="${esc(L("SBE.Shop.Sell"))}"><i class="fa-solid fa-hand-holding-dollar"></i></button>
      </div>`).join("")}</div>`;
  }
  return `<div class="sbe-shop-stall" data-shop-selllist>${headOf(el, "fa-hand-holding-dollar")}${body}</div>`;
}

/** Historique : du plus récent au plus ancien. */
function historyHTML(el, s) {
  const filter = s.isGM && s.actors.length > 1
    ? `<label class="sbe-shop-hfilter"><span>${esc(L("SBE.Shop.HistFilter"))}</span><select data-shop-histfilter>
        <option value="">${esc(L("SBE.Shop.HistAll"))}</option>
        ${s.actors.map(a => `<option value="${esc(a.uuid)}" ${a.uuid === s.histFilter ? "selected" : ""}>${esc(a.name)}</option>`).join("")}
      </select></label>` : "";
  const rows = s.log.map(l => {
    const gm = s.isGM ? `
      ${l.kind === "sell" ? `<button type="button" data-shop-block="${esc(l.id)}" class="${l.blocked ? "is-on" : ""}" data-tooltip-text="${esc(L(l.blocked ? "SBE.Shop.Unblock" : "SBE.Shop.Block"))}"><i class="fa-solid ${l.blocked ? "fa-lock" : "fa-lock-open"}"></i></button>` : ""}
      <button type="button" data-shop-delline="${esc(l.id)}" data-tooltip-text="${esc(L("SBE.Shop.DeleteLine"))}"><i class="fa-solid fa-trash"></i></button>` : "";
    const state = l.kind !== "sell" ? "" : l.rebought ? `<small>${esc(L("SBE.Shop.Rebought_short"))}</small>` : l.blocked ? `<small>${esc(L("SBE.Shop.Blocked"))}</small>` : "";
    return `<div class="sbe-shop-hrow">
      <span class="sbe-shop-hdate">${esc(l.date)}</span>
      <img src="${esc(l.img)}" alt="">
      <span class="sbe-shop-hkind is-${esc(l.kind)}">${esc(L(`SBE.Shop.Kind_${l.kind}`))}</span>
      <span class="sbe-shop-name">${esc(l.name)}${l.qty > 1 ? ` ×${l.qty}` : ""} ${state}${s.isGM ? ` <small class="sbe-shop-hwho">${esc(l.actorName)}</small>` : ""}</span>
      <span class="sbe-shop-price">${Money.html(l.total)}</span>
      ${l.canRebuy ? `<button type="button" data-shop-rebuy="${esc(l.id)}" data-tooltip-text="${esc(L("SBE.Shop.RebuyFor", { price: Money.text(l.rebuyPrice) }))}"><i class="fa-solid fa-rotate-left"></i></button>` : ""}
      ${gm}
    </div>`;
  }).join("");
  const body = rows ? `<div class="sbe-shop-hist">${rows}</div>` : `<p class="notes sbe-shop-empty">${esc(L("SBE.Shop.HistEmpty"))}</p>`;
  return `<div class="sbe-shop-stall">${headOf(el, "fa-clock-rotate-left")}${filter}${body}</div>`;
}

/** Le nom d'onglet d'une ligne. */
function tabOf(row, c) {
  if (c.tabs === "family") return row.familyName || L("SBE.Shop.TabOther");
  if (c.tabs === "key") { const v = row.values?.[c.tabKey]; return v === undefined || v === "" ? L("SBE.Shop.TabOther") : String(v); }
  return "";
}

function stallHTML(el, s) {
  const c = stallConfig(el);
  let rows = s.rows.filter(r => !(c.soldOut === "hide" && r.soldOut && !s.isGM));
  let tabsHtml = "";
  if (c.tabs !== "none" && rows.length) {
    const names = [...new Set(rows.map(r => tabOf(r, c)))].sort((a, b) => a.localeCompare(b, game.i18n.lang));
    const active = names.includes(s.tabs?.[el.id]) ? s.tabs[el.id] : names[0];
    tabsHtml = `<div class="sbe-shop-tabs">${names.map(n => `<a class="${n === active ? "active" : ""}" data-shop-tab="${esc(el.id)}" data-tab="${esc(n)}">${esc(n)}</a>`).join("")}</div>`;
    rows = rows.filter(r => tabOf(r, c) === active);
  }
  const qty = (r) => (!c.showQty ? "" : r.unlimited ? `<span class="sbe-shop-qty" data-tooltip-text="${esc(L("SBE.Shop.UnlimitedQty"))}">∞</span>` : `<span class="sbe-shop-qty">×${r.qty}</span>`);
  const tip = (r) => `${r.name} — ${Money.text(r.price)}${r.soldOut ? ` (${L("SBE.Shop.SoldOut")})` : ""}`;
  const can = (r) => !r.soldOut && s.canBuy;
  let body;
  if (!rows.length) body = `<p class="notes sbe-shop-empty">${esc(L("SBE.Shop.Empty"))}</p>`;
  else if (c.view === "list") {
    body = `<div class="sbe-shop-list" style="--sbe-shop-cols:${c.cols}">${rows.map(r => `
      <div class="sbe-shop-row${r.soldOut ? " is-soldout" : ""}" data-shop-entry="${esc(r.id)}">
        <img src="${esc(r.img)}" alt="" data-shop-show="${esc(r.id)}">
        <span class="sbe-shop-name" data-tooltip-text="${esc(r.name)}">${esc(r.name)}${r.soldOut ? ` <small>${esc(L("SBE.Shop.SoldOut"))}</small>` : ""}</span>
        ${qty(r)}
        <span class="sbe-shop-price">${Money.html(r.price)}</span>
        <button type="button" data-shop-buy="${esc(r.id)}" ${can(r) ? "" : "disabled"} data-tooltip-text="${esc(L("SBE.Shop.Buy"))}" aria-label="${esc(L("SBE.Shop.Buy"))}"><i class="fa-solid fa-cart-shopping"></i></button>
        ${s.isGM ? `<button type="button" data-shop-edit="${esc(r.id)}" data-tooltip-text="${esc(L("SBE.Shop.EditTitle"))}" aria-label="${esc(L("SBE.Shop.EditTitle"))}"><i class="fa-solid fa-pen"></i></button>` : ""}
      </div>`).join("")}</div>`;
  } else if (c.view === "grid") {
    body = `<div class="sbe-shop-grid" style="--sbe-grid-cell:${c.cellSize}px">${rows.map(r => `
      <div class="sbe-shop-cell${r.soldOut ? " is-soldout" : ""}" data-shop-entry="${esc(r.id)}" ${can(r) ? `data-shop-buy="${esc(r.id)}"` : ""} data-tooltip-text="${esc(tip(r))}">
        <img src="${esc(r.img)}" alt="">${c.showQty ? `<span class="sbe-grid-qty">${r.unlimited ? "∞" : `×${r.qty}`}</span>` : ""}
      </div>`).join("")}</div>`;
  } else {
    const d = spatialDims({ cellSize: c.cellSize, gridCols: c.gridCols, gridRows: c.gridRows });
    const pieces = rows.map(r => { const sp = spatialOf(r.doc); return { id: r.id, name: r.name, w: sp.w, h: sp.h, rot: 0, x: 0, y: 0, placed: false, r, sp }; });
    const { placed, out } = spatialLayout(pieces, d);
    body = spatialBoardHTML({
      d, placed, live: true,
      piece: (p) => ({
        cls: `sbe-shop-piece${p.r.soldOut ? " is-soldout" : ""}`,
        attrs: `data-shop-entry="${esc(p.id)}" ${can(p.r) ? `data-shop-buy="${esc(p.id)}"` : ""} data-tooltip-text="${esc(tip(p.r))}"`,
        inner: spatialArtHTML({ img: p.sp.img || p.r.img, w: p.sp.w, h: p.sp.h, rot: 0, fit: p.sp.fit }) + (c.showQty && !p.r.unlimited ? `<span class="sbe-grid-qty">×${p.r.qty}</span>` : "")
      })
    });
    if (out.length) body += `<p class="notes">${esc(L("SBE.Shop.SpatialOut", { n: out.length }))}</p>`;
  }
  const head = el.label ? `<div class="sbe-shop-head"><i class="fa-solid fa-store"></i> ${esc(el.label)}</div>` : "";
  /* MJ : on glisse des objets sur l'Étal, clic droit = réglages de l'article. */
  const gm = s.isGM ? `<div class="sbe-shop-gm"><span class="notes"><i class="fa-solid fa-hand-pointer"></i> ${esc(L("SBE.Shop.GmHint"))}</span>
    <button type="button" data-shop-restock><i class="fa-solid fa-boxes-stacked"></i> ${esc(L("SBE.Shop.RestockNow"))}</button></div>` : "";
  return `<div class="sbe-shop-stall${s.isGM ? " is-gm" : ""}" data-stall="${esc(el.id)}">${head}${gm}${tabsHtml}${body}</div>`;
}
