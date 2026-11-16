/**
 * SBE — MARCHANDS : le stock lu pour l'affichage et la vente
 *
 * Un article du stock (drapeau du marchand) devient une ligne prête à
 * afficher : le document vendu (objet du monde, ou exemplaire porté par
 * le marchand), son nom, son image, ce qu'il en reste, son prix final
 * (unité de base) et sa famille (modèle d'atelier). Aussi : prix de
 * rachat d'un objet du joueur, prix du rachat par le vendeur, négociation.
 */

import { evalExpression } from "../../builder/formula-engine.mjs";
import { walkElements } from "../../builder/element-renderer.mjs";
import { CalendarManager } from "../calendar/calendar-manager.mjs";
import { merchantOf, merchantHost, merchantSettings, dealKey } from "./merchant-model.mjs";

/** Les valeurs d'un objet (ses valeurs, sinon les défauts de son modèle d'atelier). */
function valuesOf(doc) {
  const out = {};
  const tpl = game.items.get(doc?.system?.templateId ?? "") ?? doc?.system?.template ?? null;
  for (const e of walkElements(tpl?.system?.elements ?? [])) {
    if (e?.key && e.config?.default !== undefined && e.config.default !== "") out[e.key] = e.config.default;
  }
  return { ...out, ...(doc?.system?.values ?? {}) };
}

/**
 * Prix de base d'un article, avant majoration : le prix forcé (nombre ou
 * formule sur les clés de l'objet), sinon la clé de prix du manager.
 */
export function basePriceOf(entry, doc) {
  const vals = valuesOf(doc);
  const raw = String(entry?.price ?? "").trim();
  let n;
  if (raw) {
    if (Number.isFinite(Number(raw))) n = Number(raw);
    else { try { n = Number(evalExpression(raw, vals)); } catch (_e) { n = NaN; } }
  } else {
    const key = merchantSettings().priceKey;
    n = key ? Number(vals[key]) : NaN;
  }
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/** Un nombre, ou une formule sur les valeurs d'un objet (NaN si invalide). */
function numberOrFormula(raw, doc) {
  const t = String(raw ?? "").trim();
  if (!t) return NaN;
  if (Number.isFinite(Number(t))) return Number(t);
  try { return Number(evalExpression(t, valuesOf(doc))); } catch (_e) { return NaN; }
}

/**
 * Le % de négociation d'un personnage chez ce marchand pour un côté
 * (`buy` : ses achats, `sell` : ses ventes) ; positif = à son avantage.
 */
export function dealPct(merchant, actor, side) {
  if (!actor) return 0;
  const d = merchantOf(merchant).deals[dealKey(actor)];
  if (!d?.[side]) return 0;
  if (d.until === "day" && CalendarManager.dayIndex() > d.day) return 0;
  return d.pct;
}

/** Prix de vente d'un article par ce marchand (majoration et négociation comprises, arrondi). */
export function salePriceOf(merchant, entry, doc, buyer = null) {
  const m = merchantOf(merchant);
  return Math.max(0, Math.round(basePriceOf(entry, doc) * (1 + m.markup / 100) * (1 - dealPct(merchant, buyer, "buy") / 100)));
}

/** Ce que le marchand paie pour UN exemplaire de cet objet (rachat, négociation comprise). */
export function buybackUnitOf(merchant, item, seller = null) {
  const m = merchantOf(merchant);
  const pct = numberOrFormula(m.buyback.pct, item);
  if (!Number.isFinite(pct)) return 0;
  return Math.max(0, Math.round(basePriceOf({}, item) * pct / 100 * (1 + dealPct(merchant, seller, "sell") / 100)));
}

/**
 * Prix du rachat, par le vendeur, d'un objet qu'il a vendu (ligne de
 * l'historique) : ce qu'il a touché, le prix de vente actuel, ou une
 * formule (prix d'un exemplaire) — au choix du marchand.
 */
export function rebuyPriceOf(merchant, line, item, buyer = null) {
  const m = merchantOf(merchant);
  const qty = Math.max(1, Number(line?.qty) || 1);
  if (m.buyback.rebuyPrice === "current") return salePriceOf(merchant, {}, item, buyer) * qty;
  if (m.buyback.rebuyPrice === "formula") {
    const n = numberOrFormula(m.buyback.rebuyFormula, item);
    if (Number.isFinite(n)) return Math.max(0, Math.round(n)) * qty;
  }
  return Math.max(0, Number(line?.total) || 0);
}

/** Le document vendu par un article. */
export function entryDoc(merchant, entry) {
  if (entry.item) return merchantHost(merchant)?.items?.get(entry.item) ?? null;
  return game.items.get(entry.model) ?? null;
}

/** Les lignes du stock d'un marchand (articles introuvables écartés),
    aux prix de cet acheteur. */
export function stockRows(merchant, buyer = null) {
  const m = merchantOf(merchant);
  const rows = [];
  for (const e of m.stock) {
    const doc = entryDoc(merchant, e);
    if (!doc) continue;
    const tplId = doc.system?.templateId ?? "";
    rows.push({
      id: e.id, entry: e, doc,
      name: doc.name, img: doc.img,
      qty: e.unlimited ? Infinity : e.qty,
      unlimited: e.unlimited,
      soldOut: !e.unlimited && e.qty <= 0,
      unique: !!e.item,
      price: salePriceOf(merchant, e, doc, buyer),
      family: tplId,
      familyName: game.items.get(tplId)?.name ?? "",
      values: valuesOf(doc)
    });
  }
  return rows;
}
