/**
 * SBE — MONNAIES (bibliothèque commune)
 *
 * Déclarées une seule fois par le MJ (manager « Marchands et monnaies ») :
 *   { id, name, key, rate, icon }
 *     key   la clé de la fiche de personnage qui compte cette monnaie
 *     rate  sa valeur en unité de base (la plus petite vaut 1 ; 1 or = 100)
 *     icon  une image (vide = pièce)
 * Une seule monnaie suffit (une clé, rate 1) ; plusieurs : or, argent,
 * cuivre… Servent aux échanges, aux coffres et aux marchands.
 *
 * Une BOURSE = { idMonnaie: nombre } (des pièces réelles qui bougent :
 * échanges, coffres). Un PRIX = un nombre en unité de base : payer rend
 * la monnaie (marchands).
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { valueQueue } from "../../helpers/socket.mjs";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const KEY_OK = /^[a-z][a-z0-9_]*$/;
const int = (v) => Math.max(0, Math.floor(Number(v) || 0));

export const MONEY_SETTING = "currencies";

/** Une monnaie propre (ou null si inutilisable). */
export function cleanCurrency(o = {}) {
  const key = String(o.key ?? "").trim();
  return {
    id: String(o.id || foundry.utils.randomID()),
    name: String(o.name ?? "").trim(),
    key: KEY_OK.test(key) ? key : "",
    rate: Math.max(1, Math.floor(Number(o.rate) || 1)),
    icon: String(o.icon ?? "").trim()
  };
}

export class Money {

  /** Toutes les monnaies déclarées, de la plus forte à la plus faible. */
  static all() {
    let raw = [];
    try { raw = game.settings.get(SYSTEM_ID, MONEY_SETTING) ?? []; } catch (_e) { raw = []; }
    return (Array.isArray(raw) ? raw : []).map(cleanCurrency).sort((a, b) => b.rate - a.rate);
  }

  /** Les monnaies utilisables (avec une clé). */
  static list() { return this.all().filter(c => c.key); }

  static get enabled() { return this.list().length > 0; }

  static get(id) { return this.list().find(c => c.id === id) ?? null; }

  static nameOf(c) { return c?.name || c?.key || "?"; }

  /* ---------------------------------------------------------- */
  /*  Bourses                                                    */
  /* ---------------------------------------------------------- */

  /** Bourse propre : seulement des monnaies connues, des entiers ≥ 0. */
  static clean(raw) {
    const out = {};
    for (const c of this.list()) {
      const n = int(raw?.[c.id]);
      if (n) out[c.id] = n;
    }
    return out;
  }

  /** Bourse avec TOUTES les monnaies (zéros compris) : pour écrire
      une bourse entière sur un document (une fusion garderait l'ancien). */
  static full(purse) {
    const out = {};
    for (const c of this.list()) out[c.id] = int(purse?.[c.id]);
    return out;
  }

  static isEmpty(purse) { return !Object.values(purse ?? {}).some(n => n > 0); }

  /** La bourse d'un personnage (lue sur ses clés). */
  static purseOf(actor) {
    const v = actor?.system?.values ?? {};
    const out = {};
    for (const c of this.list()) { const n = int(v[c.key]); if (n) out[c.id] = n; }
    return out;
  }

  /** Valeur d'une bourse en unité de base. */
  static valueOf(purse) {
    let t = 0;
    for (const c of this.list()) t += int(purse?.[c.id]) * c.rate;
    return t;
  }

  static totalOf(actor) { return this.valueOf(this.purseOf(actor)); }

  /** Un montant en unité de base → le moins de pièces possible. */
  static breakdown(base) {
    let left = int(base);
    const out = {};
    for (const c of this.list()) {
      const n = Math.floor(left / c.rate);
      if (n) { out[c.id] = n; left -= n * c.rate; }
    }
    return out;
  }

  /** La bourse `a` contient-elle la bourse `b` (pièce par pièce) ? */
  static covers(a, b) {
    return this.list().every(c => int(a?.[c.id]) >= int(b?.[c.id]));
  }

  static add(a, b) {
    const out = {};
    for (const c of this.list()) { const n = int(a?.[c.id]) + int(b?.[c.id]); if (n) out[c.id] = n; }
    return out;
  }

  /** a − b (sans descendre sous 0). */
  static sub(a, b) {
    const out = {};
    for (const c of this.list()) { const n = Math.max(0, int(a?.[c.id]) - int(b?.[c.id])); if (n) out[c.id] = n; }
    return out;
  }

  /** Partage une bourse en `n` parts égales ; le reste reste à part. */
  static split(purse, n) {
    const share = {}, rest = {};
    for (const c of this.list()) {
      const v = int(purse?.[c.id]);
      const s = Math.floor(v / Math.max(1, n));
      if (s) share[c.id] = s;
      if (v - s * n) rest[c.id] = v - s * n;
    }
    return { share, rest };
  }

  /** Les écritures qui donnent à `actor` la bourse `purse` (ses clés). */
  static changesFor(actor, purse) {
    const v = actor?.system?.values ?? {};
    const ch = {};
    for (const c of this.list()) {
      const n = int(purse?.[c.id]);
      ch[`system.values.${c.key}`] = n;
      if (int(v[c.key]) === n) delete ch[`system.values.${c.key}`];
    }
    return ch;
  }

  /** Ajoute (ou retire, `sign` = −1) une bourse sur un personnage. */
  /* Lire la bourse puis l'écrire passe dans la file des valeurs du
     personnage : deux achats chez deux marchands au même instant, ou un
     achat et un partage de coffre, ne s'écrasent jamais. */
  static async move(actor, purse, sign = 1) {
    if (!actor || this.isEmpty(purse)) return;
    return valueQueue(actor, async () => {
      const next = sign < 0 ? this.sub(this.purseOf(actor), purse) : this.add(this.purseOf(actor), purse);
      const ch = this.changesFor(actor, next);
      if (Object.keys(ch).length) await actor.update(ch);
    });
  }

  /**
   * Payer `base` (unité de base) avec la bourse `have` : d'abord les
   * petites pièces, puis une plus grosse si besoin, la monnaie rendue en
   * pièces plus petites.
   * @returns {object|null} la nouvelle bourse, ou null si pas assez
   */
  static payFrom(have, base) {
    let due = int(base);
    if (this.valueOf(have) < due) return null;
    const purse = { ...this.clean(have) };
    const asc = [...this.list()].reverse();
    for (const c of asc) {
      const take = Math.min(int(purse[c.id]), Math.floor(due / c.rate));
      purse[c.id] = int(purse[c.id]) - take;
      due -= take * c.rate;
    }
    while (due > 0) {
      const c = asc.find(x => int(purse[x.id]) > 0 && x.rate >= due) ?? asc.find(x => int(purse[x.id]) > 0);
      if (!c) return null;
      purse[c.id] -= 1;
      due -= c.rate;
    }
    return this.add(this.clean(purse), this.breakdown(-due));
  }

  /** Fait payer `base` à un personnage. @returns {boolean} */
  static async pay(actor, base) {
    if (!actor) return false;
    return valueQueue(actor, async () => {
      const next = this.payFrom(this.purseOf(actor), base);
      if (!next) return false;
      const ch = this.changesFor(actor, next);
      if (Object.keys(ch).length) await actor.update(ch);
      return true;
    });
  }

  /** Donne `base` (unité de base) en pièces, le moins possible. */
  static async credit(actor, base) {
    return this.move(actor, this.breakdown(base), 1);
  }

  /* ---------------------------------------------------------- */
  /*  Affichage                                                  */
  /* ---------------------------------------------------------- */

  static iconHTML(c) {
    return c?.icon
      ? `<img class="sbe-money-ico" src="${esc(c.icon)}" alt="">`
      : `<i class="sbe-money-ico fa-solid fa-coins"></i>`;
  }

  /** Une pastille : l'icône et le nombre ; sans icône, le nombre et le nom. */
  static #chip(c, n, cls = "") {
    const name = esc(this.nameOf(c));
    return c.icon
      ? `<span class="sbe-money-chip ${cls}" data-tooltip-text="${name}">${this.iconHTML(c)}<b>${n}</b></span>`
      : `<span class="sbe-money-chip ${cls}"><b>${n}</b> ${name}</span>`;
  }

  /** Une bourse (ou un montant en unité de base) en pastilles. */
  static html(purseOrBase, { empty = true } = {}) {
    const purse = typeof purseOrBase === "number" ? this.breakdown(purseOrBase) : purseOrBase;
    const parts = this.list().filter(c => int(purse?.[c.id]) > 0)
      .map(c => this.#chip(c, int(purse[c.id])));
    if (!parts.length) return empty && this.list().length ? this.#chip(this.list().at(-1), 0, "is-zero") : "";
    return `<span class="sbe-money">${parts.join("")}</span>`;
  }

  /** Une bourse (ou un montant) en texte : « 2 or, 15 argent ». */
  static text(purseOrBase) {
    const purse = typeof purseOrBase === "number" ? this.breakdown(purseOrBase) : purseOrBase;
    const parts = this.list().filter(c => int(purse?.[c.id]) > 0).map(c => `${int(purse[c.id])} ${this.nameOf(c)}`);
    return parts.length ? parts.join(", ") : `0 ${this.nameOf(this.list().at(-1))}`;
  }

  /**
   * Cases à remplir, une par monnaie (label au-dessus).
   * @param {string} name   préfixe des champs
   * @param {object} purse  valeurs de départ
   * @param {object} [max]  bourse maximale (ce qu'on a)
   */
  static inputsHTML(name, purse = {}, max = null) {
    return `<div class="sbe-money-inputs">${this.list().map(c => `
      <label class="sbe-money-in"><span>${this.iconHTML(c)} ${esc(this.nameOf(c))}</span>
        <input type="number" name="${esc(name)}.${esc(c.id)}" value="${int(purse?.[c.id])}" min="0" step="1"${max ? ` max="${int(max[c.id])}"` : ""}>
        ${max ? `<small>/ ${int(max[c.id])}</small>` : ""}</label>`).join("")}</div>`;
  }

  /** Relit les cases de `inputsHTML` (bornées par `max` si donné). */
  static readInputs(root, name, max = null) {
    const out = {};
    for (const c of this.list()) {
      let n = int(root?.querySelector?.(`[name="${name}.${c.id}"]`)?.value);
      if (max) n = Math.min(n, int(max[c.id]));
      if (n) out[c.id] = n;
    }
    return out;
  }

  /* ---------------------------------------------------------- */
  /*  Reprise de l'ancienne clé unique                           */
  /* ---------------------------------------------------------- */

  /**
   * Ancienne clé d'argent (échanges, coffres) → une première monnaie,
   * une seule fois, si le MJ n'en a déclaré aucune.
   */
  static async adoptLegacyKey() {
    if (!game.user.isGM || this.all().length) return;
    let key = "";
    try { key = game.settings.get(SYSTEM_ID, "tradeConfig")?.moneyKey || ""; } catch (_e) { /* */ }
    if (!key) { try { key = game.settings.get(SYSTEM_ID, "chestDefaults")?.moneyKey || ""; } catch (_e) { /* */ } }
    if (!key) {
      for (const s of game.scenes ?? []) for (const t of s.tiles) { const k = t.flags?.[SYSTEM_ID]?.moneyKey; if (k) { key = k; break; } }
    }
    if (!KEY_OK.test(key)) return;
    await game.settings.set(SYSTEM_ID, MONEY_SETTING, [cleanCurrency({ id: "base", name: L("SBE.Money.DefaultName"), key, rate: 1 })]);
  }

  /**
   * La bourse d'un ancien coffre (un nombre sur une clé) : la monnaie
   * de cette clé, sinon la plus petite.
   */
  static fromLegacy(amount, key = "") {
    const n = int(amount);
    if (!n) return {};
    const c = this.list().find(x => x.key === key) ?? this.list().at(-1);
    return c ? { [c.id]: n } : {};
  }
}
