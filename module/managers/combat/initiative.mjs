/**
 * SBE — INITIATIVE RÉGLABLE (Règles de combat → Initiative)
 *
 * Le jet d'initiative vient, au choix du MJ :
 *   - de la CLÉ d'un champ de la fiche : un champ à jet lance son jet
 *     (sa formule, ses apports, ses critiques, sa visibilité) ; un champ
 *     sans jet donne sa valeur comme score (aucun dé) ;
 *   - ou d'une FORMULE (clés des fiches permises : « 1d20 + agilite ») ;
 * une ligne par modèle de personnage peut remplacer le réglage général.
 * Le jet passe par le jet des champs (field-roll.mjs) : même fenêtre,
 * même carte. La fenêtre ne s'ouvre que pour UN combattant lancé à la
 * main (jamais pour « tout lancer »), si le MJ l'a permise.
 *
 * Égalités : une formule de départage (la plus haute passe devant),
 * puis, au choix, les joueurs d'abord, les PNJ d'abord ou le hasard
 * (tiré une fois au jet, stable).
 *
 * Lancer automatiquement (option) : au début du combat, ceux qui n'ont
 * pas de score lancent sans fenêtre ; un combattant qui rejoint un
 * combat déjà commencé aussi.
 * Au nouveau round : le score reste, ou tout est relancé.
 * Plusieurs tours par round (passes) : à la fin d'une passe, chaque
 * score baisse d'un PAS ; ceux qui restent au-dessus du MINIMUM jouent
 * une passe de plus dans le même round. Au round suivant, le score
 * d'origine revient (ou il est relancé).
 *
 * Seul le MJ écrit les combattants ; un joueur qui finit la dernière
 * passe le lui demande (socket).
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { onSocketMessage, isPrimaryGM, requestGM, gmQueue } from "../../helpers/socket.mjs";
import { walkElements } from "../../builder/element-renderer.mjs";
import { evalExpression } from "../../builder/formula-engine.mjs";
import { docScope } from "../../builder/doc-context.mjs";
import { rollField } from "../../builder/field-roll.mjs";
import { cleanVis, messageModeChoices } from "../../builder/roll-visibility.mjs";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
export const TIE_ORDERS = ["random", "players", "npcs"];
export const ROUND_MODES = ["keep", "reroll"];

/** Réglage d'initiative, toujours propre. `draft` garde les lignes vides. */
export function cleanInit(c = {}, { draft = false } = {}) {
  const s = (v) => String(v ?? "").trim();
  const v = cleanVis(c?.vis);
  return {
    key: s(c?.key),
    formula: s(c?.formula) || "1d20",
    models: (Array.isArray(c?.models) ? c.models : [])
      .map(m => ({ tpl: s(m?.tpl), key: s(m?.key), formula: s(m?.formula) }))
      .filter(m => draft || (m.tpl && (m.key || m.formula))),
    ask: c?.ask !== false,
    auto: !!c?.auto,
    adv: !!c?.adv,
    advCount: Math.max(2, Math.min(10, Math.floor(Number(c?.advCount) || 2))),
    mod: !!c?.mod,
    vis: { def: v.def, allowed: v.allowed },
    tie: s(c?.tie),
    tieOrder: TIE_ORDERS.includes(c?.tieOrder) ? c.tieOrder : "random",
    round: ROUND_MODES.includes(c?.round) ? c.round : "keep",
    passes: { on: !!c?.passes?.on, step: s(c?.passes?.step) || "10", min: s(c?.passes?.min) || "0" }
  };
}

/** Le réglage en vigueur (lu dans les règles de combat). */
function cfg() {
  let raw = {};
  try { raw = game.settings.get(SYSTEM_ID, "combat")?.init ?? {}; } catch (_e) { raw = {}; }
  return cleanInit(raw);
}

/** Une valeur (nombre ou formule) lue sur la fiche du combattant. */
function valueOn(expr, actor, dflt = 0) {
  const raw = String(expr ?? "").trim();
  if (!raw) return dflt;
  if (Number.isFinite(Number(raw))) return Number(raw);
  try {
    const n = Number(evalExpression(raw, actor ? docScope(actor) : {}));
    return Number.isFinite(n) ? n : dflt;
  } catch (_e) { return dflt; }
}

const isNum = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));

export class Initiative {

  /** D'où vient le jet de cet acteur : { key } (champ à jet) ou
      { formula } (formule, ou la valeur d'un champ sans jet). */
  static sourceOf(actor, k = cfg()) {
    const tplId = actor?.system?.templateId ?? "";
    const model = k.models.find(m => m.tpl === tplId);
    const els = [...walkElements(actor?.system?.template?.system?.elements ?? [])];
    for (const src of [model, k]) {
      if (!src) continue;
      const el = src.key ? els.find(e => e?.key === src.key) : null;
      if (el?.config?.roll?.on && el.config.roll.formula) return { key: src.key };
      if (el) return { formula: src.key };
      if (src.formula) return { formula: src.formula };
    }
    return { formula: "1d20" };
  }

  /** Valeur de départage (formule du MJ), lue au moment du jet. */
  static tieOf(combatant, k = cfg()) {
    return k.tie ? valueOn(k.tie, combatant?.actor, 0) : 0;
  }

  /** Lance l'initiative d'un combattant ; rend le total (null = annulé). */
  static async rollFor(combatant, { ask = false } = {}) {
    const actor = combatant?.actor;
    if (!actor) return null;
    const k = cfg();
    const src = this.sourceOf(actor, k);
    /* Un combattant caché : sa carte ne va qu'au MJ. */
    const gm = combatant.hidden ? messageModeChoices().list.find(m => m.value === "gm")?.value : null;
    const opts = { ask: ask && k.ask, title: L("SBE.Init.Card"), vis: gm ? { def: gm, allowed: [gm] } : null };
    const res = src.key
      ? await rollField(actor, src.key, opts)
      : await rollField(actor, "", { ...opts,
        spec: { formula: src.formula, dialog: { adv: k.adv, advCount: k.advCount, mod: k.mod }, vis: k.vis } });
    return res ? res.total : null;
  }

  /** Ordre des combattants : score, départage, puis le choix du MJ. */
  static compare(a, b, k = cfg()) {
    const ia = isNum(a.initiative) ? Number(a.initiative) : -Infinity;
    const ib = isNum(b.initiative) ? Number(b.initiative) : -Infinity;
    if (ia !== ib) return ib > ia ? 1 : -1;
    const f = (c, n) => Number(c.flags?.[SYSTEM_ID]?.[n]) || 0;
    const ta = f(a, "tie"), tb = f(b, "tie");
    if (ta !== tb) return tb - ta;
    if (k.tieOrder !== "random") {
      const pa = a.hasPlayerOwner ? 1 : 0, pb = b.hasPlayerOwner ? 1 : 0;
      if (pa !== pb) return k.tieOrder === "players" ? pb - pa : pa - pb;
    }
    const ra = f(a, "rnd"), rb = f(b, "rnd");
    if (ra !== rb) return rb - ra;
    return a.id > b.id ? 1 : -1;
  }

  /** Peut-il jouer dans une passe après la première ? */
  static canAct(c, k = cfg()) {
    return isNum(c.initiative) && Number(c.initiative) > valueOn(k.passes.min, c.actor, 0);
  }

  /**
   * Début d'un round (MJ) : tout relancer, ou rendre les scores
   * d'origine après les passes.
   */
  static async roundStart(combat) {
    const k = cfg();
    if (k.round === "reroll") {
      const ids = combat.combatants.map(c => c.id);
      if (ids.length) await combat.rollInitiative(ids, { updateTurn: false, sbeAsk: false });
      return;
    }
    if (!k.passes.on) return;
    const ups = combat.combatants
      .filter(c => isNum(c.flags?.[SYSTEM_ID]?.init0) && Number(c.initiative) !== Number(c.flags[SYSTEM_ID].init0))
      .map(c => ({ _id: c.id, initiative: Number(c.flags[SYSTEM_ID].init0) }));
    if (ups.length) await combat.updateEmbeddedDocuments("Combatant", ups, { sbePass: true, turnEvents: false });
  }

  /* ============================================================ */
  /*  Branchements                                                 */
  /* ============================================================ */

  static init() {
    const Base = CONFIG.Combat.documentClass;
    const I = Initiative;

    class SBECombat extends Base {

      /** Jet d'initiative SBE (fenêtre pour UN combattant lancé à la main). */
      async rollInitiative(ids, { updateTurn = true, sbeAsk } = {}) {
        ids = typeof ids === "string" ? [ids] : [...(ids ?? [])];
        const ask = sbeAsk ?? ids.length === 1;
        const k = cfg();
        const updates = [];
        for (const id of ids) {
          const c = this.combatants.get(id);
          if (!c?.isOwner) continue;
          const total = await I.rollFor(c, { ask });
          if (total === null || total === undefined) continue;
          updates.push({
            _id: id, initiative: total,
            [`flags.${SYSTEM_ID}.init0`]: total,
            [`flags.${SYSTEM_ID}.tie`]: I.tieOf(c, k),
            [`flags.${SYSTEM_ID}.rnd`]: Math.random()
          });
        }
        if (!updates.length) return this;
        const o = { turnEvents: false, sbeInit: true };
        if (!updateTurn) o.combatTurn = this.turn;
        await this.updateEmbeddedDocuments("Combatant", updates, o);
        return this;
      }

      /** Appelé sans `this` par Foundry : tout est lu sur les combattants. */
      _sortCombatants(a, b) {
        return I.compare(a, b);
      }

      /** Passes : on saute ceux qui ne jouent plus ; fin de passe → la suivante. */
      async nextTurn() {
        const k = cfg();
        if (!k.passes.on || this.round === 0) return super.nextTurn();
        const pass = Number(this.getFlag(SYSTEM_ID, "pass")) || 1;
        for (let i = (this.turn ?? -1) + 1; i < this.turns.length; i++) {
          if (this.#canPlay(this.turns[i], pass, k)) return this.#goTurn(i);
        }
        if (!game.user.isGM) {
          requestGM({ type: "sbeInitPass", id: this.id, round: this.round, turn: this.turn, pass });
          return this;
        }
        return this.sbeEndPass();
      }

      /** Lancer automatiquement : ceux qui n'ont pas de score, avant de commencer. */
      async startCombat() {
        if (game.user.isGM && cfg().auto) {
          const ids = this.combatants.filter(c => !isNum(c.initiative)).map(c => c.id);
          if (ids.length) await this.rollInitiative(ids, { sbeAsk: false });
        }
        return super.startCombat();
      }

      /** Nouveau round lancé par le MJ : relance / scores d'origine d'abord. */
      async nextRound() {
        if (game.user.isGM && this.round > 0) await I.roundStart(this);
        return super.nextRound();
      }

      #canPlay(c, pass, k) {
        if (this.settings.skipDefeated && c.isDefeated) return false;
        return pass <= 1 || I.canAct(c, k);
      }

      async #goTurn(i, extra = {}) {
        const updateData = { round: this.round, turn: i, ...extra };
        const updateOptions = { direction: 1, worldTime: { delta: this.getTimeDelta(this.round, this.turn, this.round, i) } };
        Hooks.callAll("combatTurn", this, updateData, updateOptions);
        await this.update(updateData, updateOptions);
        return this;
      }

      /** Fin d'une passe (MJ) : chaque score baisse d'un pas ; s'il reste
          quelqu'un au-dessus du minimum, une passe de plus. */
      async sbeEndPass() {
        const k = cfg();
        const pass = Number(this.getFlag(SYSTEM_ID, "pass")) || 1;
        const ups = [];
        const after = new Map();
        for (const c of this.combatants) {
          if (!isNum(c.initiative)) continue;
          const v = Number(c.initiative) - valueOn(k.passes.step, c.actor, 10);
          ups.push({ _id: c.id, initiative: v });
          after.set(c.id, v);
        }
        const more = this.combatants.some(c => after.has(c.id) && !(this.settings.skipDefeated && c.isDefeated)
          && after.get(c.id) > valueOn(k.passes.min, c.actor, 0));
        if (!more) return this.nextRound();
        await this.updateEmbeddedDocuments("Combatant", ups, { sbePass: true, turnEvents: false });
        const first = this.turns.findIndex(c => this.#canPlay(c, pass + 1, k));
        return this.#goTurn(Math.max(0, first), { [`flags.${SYSTEM_ID}.pass`]: pass + 1 });
      }
    }
    CONFIG.Combat.documentClass = SBECombat;

    /* Lancer automatiquement : un combattant qui rejoint un combat commencé. */
    Hooks.on("createCombatant", (c, options) => {
      if (!isPrimaryGM() || options?.sbeUndo || !c.combat?.started || isNum(c.initiative) || !cfg().auto) return;
      c.combat.rollInitiative([c.id], { sbeAsk: false, updateTurn: true })
        .catch(err => console.warn("SBE | Initiative automatique", err));
    });

    /* Nouveau round : la passe repart à 1. */
    Hooks.on("combatRound", (_combat, updateData) => {
      if (cfg().passes.on) updateData[`flags.${SYSTEM_ID}.pass`] = 1;
    });

    /* Round avancé par un joueur : le MJ principal fait le début de round. */
    Hooks.on("updateCombat", (combat, changed, options, userId) => {
      if (!isPrimaryGM() || !("round" in changed) || options?.direction !== 1) return;
      if (game.users.get(userId)?.isGM) return;
      I.roundStart(combat).catch(err => console.warn("SBE | Initiative : début de round", err));
    });

    /* Score changé à la main : il devient le score d'origine (passes). */
    Hooks.on("preUpdateCombatant", (c, changes, options) => {
      if (options?.sbePass || options?.sbeInit || !("initiative" in changes)) return;
      foundry.utils.setProperty(changes, `flags.${SYSTEM_ID}.init0`, changes.initiative);
      if (!isNum(c.flags?.[SYSTEM_ID]?.rnd)) foundry.utils.setProperty(changes, `flags.${SYSTEM_ID}.rnd`, Math.random());
      foundry.utils.setProperty(changes, `flags.${SYSTEM_ID}.tie`, I.tieOf(c));
    });

    /* Un joueur finit la dernière passe : le MJ principal passe à la suite. */
    onSocketMessage(async (p) => {
      if (p?.type !== "sbeInitPass" || !isPrimaryGM()) return;
      const combat = game.combats?.get(p.id);
      if (!combat) return;
      /* Une fois, par celui dont c'est le tour, au moment où il l'a
         demandé (un double clic ne fait pas sauter la passe suivante). */
      await gmQueue(`initPass:${combat.id}`, async () => {
        const user = game.users.get(p._from);
        const pass = Number(combat.getFlag(SYSTEM_ID, "pass")) || 1;
        if (combat.round !== p.round || combat.turn !== p.turn || pass !== p.pass) return;
        if (!user || !(user.isGM || combat.combatant?.actor?.testUserPermission(user, "OWNER"))) return;
        await combat.sbeEndPass?.();
      });
    });

    /* Suivi de combat : le numéro de la passe à côté du round. */
    Hooks.on("renderCombatTracker", (app, html) => {
      const combat = app?.viewed ?? game.combat;
      const pass = Number(combat?.getFlag?.(SYSTEM_ID, "pass")) || 1;
      if (!cfg().passes.on || pass <= 1) return;
      const root = html instanceof HTMLElement ? html : html?.[0];
      const title = root?.querySelector(".encounter-title");
      if (title && !title.querySelector(".sbe-init-pass")) {
        title.insertAdjacentHTML("beforeend", ` <span class="sbe-init-pass">· ${esc(L("SBE.Init.Pass", { n: pass }))}</span>`);
      }
    });
  }
}
