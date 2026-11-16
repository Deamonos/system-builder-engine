/**
 * SBE — MARCHANDS : données
 *
 * Réglages du monde (manager « Marchands et monnaies ») :
 *   merchants = {
 *     priceKey  clé des modèles d'objets qui contient le prix (unité de base)
 *     sell      ce que les marchands VENDENT : { templates: [ids d'atelier], exclude: [ids d'objets] }
 *     buy       ce qu'ils RACHÈTENT : { templates, exclude }
 *     shop      modèle de boutique par défaut (id d'un modèle de personnage de genre « shop ») ;
 *               vide = la boutique de base intégrée
 *   }
 *
 * Réglage d'un marchand (drapeau `merchant` du personnage, ou de son
 * acteur de base pour un jeton non lié) :
 *   enabled    ce personnage est un marchand
 *   open       boutique ouverte
 *   markup     majoration de ses prix de vente, en % (−10 = remise)
 *   approval   "none" (immédiat) | "gm" (validation du MJ)
 *   cash       "unlimited" | "sheet" (les monnaies de sa fiche) | "own" (sa caisse)
 *   purse      sa caisse (cash = "own")
 *   buyback    { enabled, pct (nombre ou formule), rebuy (rachat par le vendeur),
 *                keep "stock" (l'objet vendu rejoint le stock) | "rebuy" (gardé
 *                pour le rachat du vendeur), rebuyPrice "sold" | "current" |
 *                "formula", rebuyFormula }
 *   haggle     % de chaque issue d'une négociation { critSuccess, success,
 *                failure, critFailure } (positif = à l'avantage du joueur)
 *   deals      négociations en cours, par personnage : { [dealKey]: { pct, buy,
 *                sell, until "next" | "day" | "gm", day } }
 *   distance   distance maximale pour ouvrir la boutique (0 = partout)
 *   sounds     { open, close, buy, sell, rebuy } (rachat vide = son d'achat)
 *   shop       son modèle de boutique ("" = celui par défaut)
 *   stock      ses articles (voir cleanStockEntry)
 */

import { baseShopElements } from "./shop-base.mjs";

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { uiSoundOf } from "../media/ui-sound.mjs";
import { Money } from "../money/money.mjs";
import { PROP_TYPE } from "../props/prop-manager.mjs";

export const MERCHANT_FLAG = "merchant";
export const MERCHANTS_SETTING = "merchants";
export const MERCHANT_CASH = ["unlimited", "sheet", "own"];
export const MERCHANT_APPROVAL = ["none", "gm"];
export const SOLD_KEEP = ["stock", "rebuy"];
export const REBUY_PRICE = ["sold", "current", "formula"];
export const HAGGLE_OUTCOMES = ["critSuccess", "success", "failure", "critFailure"];
export const DEAL_UNTIL = ["next", "day", "gm"];
const HAGGLE0 = { critSuccess: 20, success: 10, failure: -10, critFailure: -20 };

/** Clé d'un personnage dans `deals` (sans point : Foundry en ferait des sous-objets). */
export function dealKey(actor) { return String(actor?.uuid ?? "").replace(/\./g, "_"); }

/** Une négociation en cours, propre (null si elle n'apporte rien). */
export function cleanDeal(d = {}) {
  const pct = Number(d.pct);
  if (!Number.isFinite(pct) || (!d.buy && !d.sell)) return null;
  return { pct: Math.max(-100, Math.min(100, Math.round(pct))), buy: !!d.buy, sell: !!d.sell,
    until: DEAL_UNTIL.includes(d.until) ? d.until : "next", day: Math.floor(Number(d.day) || 0) };
}

const KEY_OK = /^[a-z][a-z0-9_]*$/;
const ids = (a) => (Array.isArray(a) ? [...new Set(a.map(String).filter(Boolean))] : []);

/** Réglages du monde, propres. */
export function cleanMerchantSettings(o = {}) {
  const fam = (x) => ({ templates: ids(x?.templates), exclude: ids(x?.exclude) });
  const k = String(o.priceKey ?? "").trim();
  return { priceKey: KEY_OK.test(k) ? k : "", sell: fam(o.sell), buy: fam(o.buy), shop: String(o.shop ?? "") };
}

export function merchantSettings() {
  try { return cleanMerchantSettings(game.settings.get(SYSTEM_ID, MERCHANTS_SETTING) ?? {}); }
  catch (_e) { return cleanMerchantSettings(); }
}

/** Réglage d'un marchand, propre. */
export function cleanMerchant(o = {}) {
  const pct = Number(o.markup);
  return {
    enabled: !!o.enabled,
    open: !!o.open,
    markup: Number.isFinite(pct) ? Math.max(-100, Math.round(pct)) : 0,
    approval: MERCHANT_APPROVAL.includes(o.approval) ? o.approval : "none",
    cash: MERCHANT_CASH.includes(o.cash) ? o.cash : "unlimited",
    purse: Money.clean(o.purse),
    buyback: {
      enabled: o.buyback?.enabled !== false,
      pct: String(o.buyback?.pct ?? "50").trim() || "50",
      rebuy: !!o.buyback?.rebuy,
      keep: SOLD_KEEP.includes(o.buyback?.keep) ? o.buyback.keep : "stock",
      rebuyPrice: REBUY_PRICE.includes(o.buyback?.rebuyPrice) ? o.buyback.rebuyPrice : "sold",
      rebuyFormula: String(o.buyback?.rebuyFormula ?? "").trim()
    },
    haggle: Object.fromEntries(HAGGLE_OUTCOMES.map(k => {
      const n = Number(o.haggle?.[k]);
      return [k, Number.isFinite(n) ? Math.max(-100, Math.min(100, Math.round(n))) : HAGGLE0[k]];
    })),
    deals: Object.fromEntries(Object.entries(o.deals ?? {}).map(([k, d]) => [k, cleanDeal(d)]).filter(([, d]) => d)),
    distance: Math.max(0, Number(o.distance) || 0),
    sounds: { open: uiSoundOf(o.sounds?.open), close: uiSoundOf(o.sounds?.close), buy: uiSoundOf(o.sounds?.buy), sell: uiSoundOf(o.sounds?.sell), rebuy: uiSoundOf(o.sounds?.rebuy) },
    shop: String(o.shop ?? ""),
    stock: (Array.isArray(o.stock) ? o.stock : []).map(cleanStockEntry).filter(e => e.model || e.item)
  };
}

export const RESTOCK_MODES = ["none", "newday", "time"];
export const RESTOCK_UNITS = ["hour", "day"];

/**
 * Un article du stock :
 *   model      objet du monde vendu (un exemplaire neuf à chaque achat)
 *   item       OU un exemplaire précis porté par le marchand (objet unique)
 *   qty        exemplaires disponibles ; unlimited = jamais épuisé
 *   price      prix forcé : nombre ou formule (vide = clé de prix du modèle)
 *   restock    { mode none | newday | time, every, unit hour | day, to,
 *                last : temps du monde du dernier réapprovisionnement, null = pas encore }
 */
export function cleanStockEntry(o = {}) {
  const r = o.restock ?? {};
  return {
    id: String(o.id || foundry.utils.randomID()),
    model: String(o.model ?? ""),
    item: String(o.item ?? ""),
    qty: Math.max(0, Math.floor(Number(o.qty) || 0)),
    unlimited: !!o.unlimited,
    price: String(o.price ?? "").trim(),
    restock: {
      mode: RESTOCK_MODES.includes(r.mode) ? r.mode : "none",
      every: Math.max(1, Math.floor(Number(r.every) || 1)),
      unit: RESTOCK_UNITS.includes(r.unit) ? r.unit : "day",
      to: Math.max(0, Math.floor(Number(r.to) || 0)),
      last: typeof r.last === "number" && Number.isFinite(r.last) ? r.last : null
    }
  };
}

/** Les modèles de boutique (modèles de personnage de genre « shop »). */
export function shopTemplates() {
  return game.actors.filter(a => a.type === "template" && a.system?.genre === "shop")
    .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
}

let BUILTIN_SHOP = null;

/**
 * La boutique de base, INTÉGRÉE au système : un modèle tenu en mémoire
 * (jamais un acteur du monde), utilisé quand aucun modèle de boutique
 * n'est choisi.
 */
export function builtinShop() {
  return (BUILTIN_SHOP ??= new Actor.implementation({
    name: game.i18n.localize("SBE.Shop.BaseName"), type: "template", img: "icons/svg/coins.svg",
    system: { genre: "shop", elements: baseShopElements(), structVersion: 1 }
  }));
}

/** Le modèle de boutique d'un marchand : le sien, sinon celui par défaut, sinon la boutique de base intégrée. */
export function shopTemplateOf(actor) {
  const want = merchantOf(actor).shop || merchantSettings().shop;
  return (want && shopTemplates().find(t => t.id === want)) || builtinShop();
}

/**
 * L'acteur qui porte le réglage : un jeton non lié lit son acteur de base ;
 * un marchand objet de scène (pion du personnage caché des objets posés)
 * porte tout lui-même (réglages, stock, historique dans son pion).
 */
export function merchantHost(actor) {
  if (!actor?.isToken || actor.type === PROP_TYPE) return actor;
  return game.actors.get(actor.id) ?? actor;
}

/** Tous les marchands : personnages du monde et objets de scène de toutes les scènes. */
export function allMerchants() {
  const out = game.actors.filter(a => isMerchant(a));
  for (const scene of game.scenes) {
    for (const td of scene.tokens) {
      if (!td.actorLink && td.actor?.type === PROP_TYPE && isMerchant(td.actor)) out.push(td.actor);
    }
  }
  return out;
}

export function merchantOf(actor) {
  return cleanMerchant(merchantHost(actor)?.getFlag?.(SYSTEM_ID, MERCHANT_FLAG) ?? {});
}

export function isMerchant(actor) { return !!actor && merchantOf(actor).enabled; }

export function isShopOpen(actor) { const m = merchantOf(actor); return m.enabled && m.open; }

/**
 * Un objet du monde peut-il être vendu (`sell`) ou racheté (`buy`) par les
 * marchands ? Son modèle d'atelier doit être coché, et lui pas exclu.
 */
export function tradableBy(item, side = "sell") {
  const model = item?.parent ? game.items.get(item.system?.modelId ?? "") : item;
  if (!model || model.type !== "objet") return false;
  const f = merchantSettings()[side];
  return f.templates.includes(model.system?.templateId) && !f.exclude.includes(model.id);
}
