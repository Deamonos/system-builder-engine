/**
 * SBE — EFFETS (palier 2) : ce qui fait vivre les effets tout seuls
 *
 *   - DÉCLENCHEURS : un effet se pose quand ses conditions (formules
 *     sur la fiche, ET / OU) deviennent vraies, et part quand elles
 *     tombent ; ou se pose sur un événement (début de combat, baisse
 *     d'une clé).
 *   - PÉRIODIQUES : une clé bouge à chaque tour, round ou intervalle
 *     de temps de jeu (saignement, régénération…), bornée par le champ,
 *     éventuellement réduite par une autre clé (une résistance).
 *   - JET DE RÉSISTANCE : le jet DÉJÀ configuré sur un champ de la
 *     fiche, rendu plus dur de « difficulté » — à la pose et/ou à chaque
 *     round. Réussite : l'effet part ou perd des cumuls ; critiques en
 *     option (réduction ou aggravation multipliée).
 *   - ESCALADE : les cumuls montent à la cadence choisie ; avec
 *     « décroissance », ils redescendent quand le déclencheur ne tient
 *     plus. Les paliers donnent à chaque niveau son nom, son icône et
 *     ses modifications.
 *   - GUÉRISON AU REPOS : branchée sur le signal « nouvelle journée ».
 *
 * Rien n'est écrit en dur : ressources, résistances, types de dégâts
 * sont les clés du MJ. Tout ce qui ÉCRIT tourne chez le MJ principal.
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { walkElements, valueBounds, equipKeys } from "../../builder/element-renderer.mjs";
import { evalExpression, formulaValue } from "../../builder/formula-engine.mjs";
import { docScope } from "../../builder/doc-context.mjs";
import { registerScopeFunctions } from "../../builder/doc-scope.mjs";
import { rollField } from "../../builder/field-roll.mjs";
import { ItemEffects } from "./item-effects.mjs";
import { EffectManager, levelOf, maxStacks, isNewRound, isForwardTurn, scaleDuration } from "./effect-manager.mjs";
import { ChatCards } from "../chat/chat-cards.mjs";
import { valueQueue, isPrimaryGM } from "../../helpers/socket.mjs";
import { isStackableItem, qtyOf, QUANTITY_KEY } from "../../builder/inventory.mjs";

/** L'effet posé est-il « automatique » (posé par son déclencheur) ? */
const isAuto = (ae) => !!ae?.flags?.[SYSTEM_ID]?.auto;

/** Jauge réglée « Débordement » (voir doc-context, clampValueChanges). */
const overflows = (el) => !!(el?.kind === "gauge" && (el.config?.overflow?.low || el.config?.overflow?.high));

export class EffectEngine {

  static _bound = false;
  /** Immunités : « acteur::clé » — un jet réussi empêche la repose
      automatique tant que la condition ne retombe pas. */
  static _immune = new Set();
  /** Accumulateurs de temps : « acteur::clé::nature » → secondes. */
  static _acc = new Map();
  /** Évaluations en attente (anti-rafale). */
  static _pending = new Map();
  static _busy = new Set();
  static _again = new Set();

  static init() {
    if (this._bound) return;
    this._bound = true;

    /* Fonctions de fiche : utilisables dans TOUTES les formules. */
    registerScopeFunctions("effects", (doc) => ({
      hasEffect: (k) => !!EffectManager.findEffect(doc, String(k)),
      stacksOf: (k) => EffectManager.getStacks(doc, String(k)),
      /* Catégorie d'un effet (éditeur d'effets) : effectCategory(eventName) == "Maladie". */
      effectCategory: (k) => String(EffectManager.getDef(String(k))?.category ?? ""),
      /* Effets que ce personnage a posés (partout) : tous, ou une clé. */
      posedEffects: (k = "") => (doc?.uuid ? EffectManager.posedCount(doc.uuid, k) : 0),
      inCombat: () => (doc?.documentName === "Actor" ? EffectManager._inCombat(doc) : false)
    }));

    /* --- Déclencheurs : réévaluer quand la fiche bouge --- */
    Hooks.on("updateActor", (actor, _c, options) => {
      this.queue(actor);
      /* Retour en arrière (managers/undo) : pas de réaction. */
      if (!options?.sbeUndo) this._onDecrease(actor, options);
    });
    Hooks.on("preUpdateActor", (actor, changes, options) => this._rememberBefore(actor, changes, options));
    for (const h of ["createItem", "updateItem", "deleteItem", "createActiveEffect", "deleteActiveEffect", "updateActiveEffect"]) {
      Hooks.on(h, (doc) => { const a = doc.parent; if (a?.documentName === "Actor") this.queue(a); });
    }
    /* Un modèle d'objet change (ses effets conférés) : tout le monde. */
    Hooks.on("updateItem", (doc) => {
      if (doc.type === "template" && !doc.parent) for (const a of EffectManager.allActors()) this.queue(a);
    });
    Hooks.on("deleteCombat", (combat) => { for (const c of combat.combatants ?? []) if (c.actor) this.queue(c.actor); });

    /* --- Événement : début de combat --- */
    Hooks.on("updateCombat", (combat, changed) => this._onCombatUpdate(combat, changed));
    Hooks.on("createCombatant", (c, options) => {
      if (options?.sbeUndo) return;
      if (c.combat?.started && c.actor) this._applyEvent(c.actor, d => d.trigger.onCombatStart);
    });

    /* --- Cadences hors combat --- */
    Hooks.on("updateWorldTime", (_t, dt) => {
      if (!isPrimaryGM() || !(dt > 0)) return;
      for (const a of EffectManager.allActors()) {
        if (!EffectManager._inCombat(a)) this._cadence(a, "time", dt);
      }
    });

    /* --- Résistance à la pose --- */
    Hooks.on("createActiveEffect", async (ae, options) => {
      if (!isPrimaryGM() || options?.sbeUndo) return;
      const def = EffectManager.getDef(ae.flags?.[SYSTEM_ID]?.key ?? "");
      if (def?.resist.enabled && def.resist.onApply && ae.parent?.documentName === "Actor") {
        /* Une réaction du personnage fait ce jet (étape « Jet de
           résistance ») : elle le remplace, un seul jet. */
        const { ActionTriggers } = await import("../triggers/action-triggers.mjs");
        if (await ActionTriggers.resistsByReaction(ae.parent, def.key)) return;
        this.resist(ae.parent, def, ae, { onApply: true });
      }
    });

    /* --- Guérison au repos --- */
    Hooks.on("sbeNewDay", (actor) => { if (game.user.isGM) this.restHeal(actor); });

    /* --- Retour visuel d'un effet périodique, chez TOUS les clients --- */
    Hooks.on("updateActor", (actor, _c, options) => {
      const t = options?.sbeTick;
      if (t) this._floatText(actor, t);
    });

    Hooks.once("ready", () => { if (isPrimaryGM()) for (const a of EffectManager.allActors()) this.queue(a); });
  }

  /* ========================================================== */
  /*  DÉCLENCHEURS                                               */
  /* ========================================================== */

  static queue(actor) {
    if (!isPrimaryGM() || actor?.type !== "personnage") return;
    const id = actor.uuid;
    clearTimeout(this._pending.get(id));
    this._pending.set(id, setTimeout(() => {
      this._pending.delete(id);
      this.evaluate(actor);
    }, 60));
  }

  static conditionHolds(def, scope) {
    const conds = def.trigger.conditions;
    if (!conds.length) return false;
    const test = (f) => { const r = evalExpression(f, scope); return r !== null && !!r; };
    return def.trigger.logic === "or" ? conds.some(test) : conds.every(test);
  }

  /* ========================================================== */
  /*  EFFETS CONFÉRÉS PAR LES OBJETS                             */
  /* ========================================================== */

  /** Les clés d'effets que les objets de cet acteur confèrent. */
  static grantedKeys(actor) {
    return new Set(this.grantSources(actor).keys());
  }

  /**
   * Qui confère quoi : clé d'effet → objets qui la donnent en ce moment
   * (équipés / portés, « Seulement si » vrai). Sert aussi aux effets
   * périodiques qui agissent sur l'objet qui les confère.
   * @returns {Map<string, Item[]>}
   */
  static grantSources(actor) {
    const slots = equipKeys(actor.system?.template?.system?.elements ?? []);
    const out = new Map();
    const add = (k, it) => {
      if (!k || !EffectManager.getDef(k)) return;
      if (!out.has(k)) out.set(k, []);
      if (!out.get(k).includes(it)) out.get(k).push(it);
    };
    for (const it of actor.items ?? []) {
      if (it.type !== "objet") continue;
      const grants = it.system?.template?.system?.grants ?? [];
      const carry = it.system?.carry ?? {};
      /* Équipé = posé dans un SLOT de la fiche elle-même (ou un conteneur « équipé »). */
      const equipped = !String(carry.host ?? "") && slots.has(String(carry.where ?? ""));
      /* Effets PROPRES à l'objet (son onglet Effets). */
      for (const k of ItemEffects.grantedKeys(it, equipped)) add(k, it);
      if (!grants.length) continue;
      const cache = {};
      for (const g of grants) {
        if (g?.when === "equipped" && !equipped) continue;
        if (!ItemEffects.onlyIfHolds(it, g?.onlyIf, cache)) continue;
        let key = String(g?.effect ?? "").trim();
        if (key.startsWith("@")) key = String(it.system?.values?.[key.slice(1)] ?? "").trim();
        add(key, it);
      }
    }
    return out;
  }

  /** Pose ce que les objets confèrent, retire ce qu'ils ne confèrent plus.
      Un effet posé à la main n'est jamais touché. */
  static async syncGrants(actor) {
    const want = this.grantedKeys(actor);
    for (const ae of [...(actor.effects ?? [])]) {
      const f = ae.flags?.[SYSTEM_ID];
      if (f?.granted && !want.has(f.key)) await EffectManager.turnOff(actor, f.key);
    }
    for (const key of want) {
      if (EffectManager.findEffect(actor, key)) continue;
      const tag = `${actor.uuid}::${key}`;
      EffectManager._grantNext.add(tag);
      await EffectManager.setStacks(actor, key, 1);
      EffectManager._grantNext.delete(tag);
    }
  }

  /** Pose / retire les effets à déclencheur de cet acteur. */
  static async evaluate(actor) {
    /* Déjà en cours : on repasse une fois à la fin (un changement arrivé
       pendant l'évaluation n'est jamais perdu). */
    if (this._busy.has(actor.uuid)) { this._again.add(actor.uuid); return; }
    this._busy.add(actor.uuid);
    try {
      await this.syncGrants(actor);
      const defs = EffectManager.getDefs().filter(d => d.trigger.enabled && d.trigger.conditions.length);
      if (!defs.length) return;
      const scope = docScope(actor);
      for (const def of defs) {
        const tag = `${actor.uuid}::${def.key}`;
        const holds = this.conditionHolds(def, scope);
        const ae = EffectManager.findEffect(actor, def.key);
        if (holds) {
          if (!ae && !this._immune.has(tag)) {
            EffectManager._autoNext.add(tag);
            await EffectManager.setStacks(actor, def.key, 1);
            EffectManager._autoNext.delete(tag);
          }
        } else {
          this._immune.delete(tag);
          /* Posé par le déclencheur : il part avec lui — sauf escalade à
             décroissance, qui redescend à son rythme. */
          if (ae && isAuto(ae) && !(def.escalation.enabled && def.escalation.decay)) {
            await EffectManager.turnOff(actor, def.key);
          }
        }
      }
    } catch (err) {
      console.warn("SBE | Effets : déclencheurs en échec", err);
    } finally {
      this._busy.delete(actor.uuid);
      if (this._again.delete(actor.uuid)) this.queue(actor);
    }
  }

  /** Pose (sans retrait automatique) les effets dont l'événement a lieu. */
  static async _applyEvent(actor, match) {
    if (!isPrimaryGM()) return;
    for (const def of EffectManager.getDefs().filter(d => d.trigger.enabled && match(d))) {
      if (!EffectManager.findEffect(actor, def.key)) await EffectManager.setStacks(actor, def.key, 1);
    }
  }

  /** Mémorise les valeurs avant modification (événement « baisse »). */
  static _rememberBefore(actor, changes, options) {
    const keys = EffectManager.getDefs().map(d => d.trigger.enabled && d.trigger.onDecrease).filter(Boolean);
    if (!keys.length) return;
    const before = {};
    for (const k of keys) {
      if (foundry.utils.hasProperty(changes, `system.values.${k}`)) before[k] = Number(actor.system?.values?.[k]) || 0;
    }
    if (Object.keys(before).length) options.sbeBefore = before;
  }

  static _onDecrease(actor, options) {
    const before = options?.sbeBefore;
    if (!before) return;
    const dropped = Object.keys(before).filter(k => (Number(actor.system?.values?.[k]) || 0) < before[k]);
    if (dropped.length) this._applyEvent(actor, d => dropped.includes(d.trigger.onDecrease));
  }

  /* ========================================================== */
  /*  COMBAT : tours et rounds                                   */
  /* ========================================================== */

  static async _onCombatUpdate(combat, changed) {
    if (!isPrimaryGM() || !combat) return;
    /* Début du combat : événement + réévaluation (inCombat()). */
    if (Number(changed?.round) === 1 && Number(combat.previous?.round ?? 0) < 1) {
      for (const c of combat.combatants ?? []) {
        if (!c.actor) continue;
        this._applyEvent(c.actor, d => d.trigger.onCombatStart);
        this.queue(c.actor);
      }
    }
    if (!combat.started) return;
    const roundChanged = isNewRound(combat, changed);
    if (roundChanged) {
      const seen = new Set();
      for (const c of combat.combatants ?? []) {
        const a = c.actor;
        if (!a || seen.has(a.uuid)) continue;
        seen.add(a.uuid);
        await this._cadence(a, "round", 0);
        await this._resistRound(a);
      }
    }
    /* Le tour d'un combattant commence (y compris le premier) — en
       avançant seulement : revenir d'un tour ne refrappe pas. */
    if (isForwardTurn(combat, changed)) {
      const a = combat.combatant?.actor;
      if (a) await this._cadence(a, "turn", 0);
    }
  }

  /* ========================================================== */
  /*  CADENCE : périodiques + escalade                           */
  /* ========================================================== */

  /** Nombre de déclenchements pour cette cadence (temps : accumulé). */
  static _ticks(actor, def, kind, cfg, timing, dt) {
    if (cfg.timing !== timing) return 0;
    if (timing !== "time") return 1;
    const id = `${actor.uuid}::${def.key}::${kind}`;
    const acc = (this._acc.get(id) ?? 0) + dt;
    const n = Math.floor(acc / cfg.interval);
    this._acc.set(id, acc - n * cfg.interval);
    return n;
  }

  /** Temps qu'il reste à vivre à un effet hors combat (s), phases
      suivantes comprises ; Infinity s'il n'est pas limité en temps. */
  static _timeLeft(ae, def) {
    const f = ae.flags?.[SYSTEM_ID] ?? {};
    let left = Number(f.seconds) || 0;
    if (left <= 0) return Infinity;
    for (const ph of (def.phases ?? []).slice(Number(f.phase) || 0)) {
      const s = scaleDuration(ph.seconds, f.div);
      if (s <= 0) return Infinity;
      left += s;
    }
    return left;
  }

  static async _cadence(actor, timing, dt) {
    /* Un grand saut de temps (nuit) ne compte que la vie RESTANTE de
       chaque effet : un poison de 10 min ne frappe pas 480 fois en 8 h.
       Calculé AVANT toute écriture (le décompte des durées tourne en
       même temps et réécrit les compteurs). */
    const list = [];
    for (const ae of [...(actor.effects ?? [])]) {
      const def = EffectManager.getDef(ae.flags?.[SYSTEM_ID]?.key ?? "");
      if (def) list.push({ ae, def, span: timing === "time" ? Math.min(dt, this._timeLeft(ae, def)) : dt });
    }
    for (const { ae, def, span } of list) {
      try {
        if (def.periodic.enabled) {
          const n = this._ticks(actor, def, "p", def.periodic, timing, span);
          if (n > 0) await this.tick(actor, def, ae, n);
        }
        if (def.escalation.enabled && def.escalation.rise !== "manual" && actor.effects?.get?.(ae.id)) {
          const n = this._ticks(actor, def, "e", def.escalation, timing, span);
          if (n > 0) await this._escalate(actor, def, ae, n);
        }
      } catch (err) {
        console.warn(`SBE | Effet « ${def.key} » : cadence en échec`, err);
      }
    }
  }

  /** Un effet périodique agit n fois. */
  static async tick(actor, def, ae, n = 1) {
    const p = def.periodic;
    if (p.target === "source") return this._tickSources(actor, def, ae, n);
    const tpl = actor.system?.template;
    const el = [...walkElements(tpl?.system?.elements ?? [])].find(e => e?.key === p.key);
    if (!el || !["number", "gauge"].includes(el.kind) || el.config?.computed) return;
    const scope = docScope(actor);
    const stacks = Math.max(1, Number(ae.flags?.[SYSTEM_ID]?.stacks) || 1);
    /* Montant : un nombre, une formule de la fiche qui PORTE l'effet, et
       des dés (« 1d6 », « mort_vivant ? -1d6 : 1d6 »). */
    /* Palier qui a son propre montant : il remplace celui de l'effet
       (progression libre : 2, 5, 10, 20…), sans multiplication. */
    const tier = def.escalation.enabled && def.escalation.tiers.length ? def.escalation.tiers[Math.min(stacks, def.escalation.tiers.length) - 1] : null;
    const own = String(tier?.amount ?? "").trim();
    const src = own || p.amount;
    let amount = Number.isFinite(Number(src)) ? Number(src) : Number((await formulaValue(src, scope)).value);
    if (!Number.isFinite(amount) || !amount) return;
    if (!own && def.stack.enabled && def.stack.scale) amount *= stacks;
    amount *= n;
    /* Une perte peut être réduite par une clé (résistance du MJ),
       jamais au point de devenir un gain. */
    if (amount < 0 && p.reduceKey) amount = Math.min(0, amount + (Number(scope[p.reduceKey]) || 0));
    if (!amount) return;
    const label = levelOf(def, stacks).label;
    /* Lu et écrit dans la file du document (des dégâts appliqués au même
       moment ne s'effacent pas). */
    const done = await valueQueue(actor, async () => {
      const from = Number(actor.system?.values?.[p.key] ?? el.config?.default ?? 0) || 0;
      const { min, max } = valueBounds(el, { ...(actor.system?.values ?? {}), ...scope });
      const whole = el.kind === "gauge" || !!el.config?.integer;
      const raw = from + amount;
      const to = Math.max(min, Math.min(max, whole ? Math.round(raw) : Math.round(raw * 1000) / 1000));
      if (to === from && !overflows(el)) return null;
      /* Jauge qui déborde : la valeur brute, bornée au point de contrôle
         (le surplus passe dans l'autre clé). */
      const put = overflows(el) ? (whole ? Math.round(raw) : Math.round(raw * 1000) / 1000) : to;
      await actor.update({ [`system.values.${p.key}`]: put },
        { sbeTick: { delta: to - from, label, keyLabel: el.label || p.key } });
      return { from, to };
    });
    if (done && p.chat) await this._card(actor, def, label, el.label || p.key, done.from, done.to);
  }

  /**
   * Périodique « sur l'objet qui le confère » : la clé bouge sur chaque
   * objet qui donne l'effet en ce moment (une lampe allumée perd de son
   * autonomie). Comme l'effet n'existe que tant qu'il est conféré, rien
   * ne s'use quand l'objet est éteint ou rangé.
   */
  static async _tickSources(actor, def, ae, n) {
    const p = def.periodic;
    const items = this.grantSources(actor).get(def.key) ?? [];
    for (const item of items) {
      try { await this._tickItem(item, def, ae, n); }
      catch (err) { console.warn(`SBE | Effet « ${def.key} » : objet non mis à jour`, err); }
    }
    return p;
  }

  static async _tickItem(item, def, ae, n) {
    const p = def.periodic;
    const el = [...walkElements(item.system?.template?.system?.elements ?? [])].find(e => e?.key === p.key);
    if (!el || !["number", "gauge"].includes(el.kind) || el.config?.computed) return;
    const scope = docScope(item);
    const stacks = Math.max(1, Number(ae.flags?.[SYSTEM_ID]?.stacks) || 1);
    const src = p.amount;
    let amount = Number.isFinite(Number(src)) ? Number(src) : Number((await formulaValue(src, scope)).value);
    if (!Number.isFinite(amount) || !amount) return;
    if (def.stack.enabled && def.stack.scale) amount *= stacks;
    amount *= n;
    const from = Number(item.system?.values?.[p.key] ?? el.config?.default ?? 0) || 0;
    const { min, max } = valueBounds(el, { ...(item.system?.values ?? {}), ...scope });
    const whole = el.kind === "gauge" || !!el.config?.integer;
    const raw = from + amount;
    const to = Math.max(min, Math.min(max, whole ? Math.round(raw) : Math.round(raw * 1000) / 1000));
    if (to === from) return;
    /* À ZÉRO (ou au minimum du champ), seulement en baisse. */
    const empty = amount < 0 && to <= Math.max(0, Number.isFinite(min) ? min : 0);
    if (!empty || p.onZero === "none") {
      await item.update({ [`system.values.${p.key}`]: to });
      if (empty && p.chat) await this._emptyCard(item, def, "none");
      return;
    }
    if (p.onZero === "qty" && isStackableItem(item) && qtyOf(item) > 1) {
      /* Une unité de la pile part ; la suivante repart pleine. */
      const full = Number.isFinite(max) ? max : (Number(el.config?.default) || 0);
      await item.update({ [`system.values.${QUANTITY_KEY}`]: qtyOf(item) - 1, [`system.values.${p.key}`]: full });
      if (p.chat) await this._emptyCard(item, def, "qty");
      return;
    }
    /* Dernière unité, ou « disparaît » : l'objet part. */
    if (p.chat) await this._emptyCard(item, def, "delete");
    await item.delete();
  }

  /** Message de chat : l'objet est à zéro. */
  static async _emptyCard(item, def, what) {
    try {
      const actor = item.parent?.documentName === "Actor" ? item.parent : null;
      const e = (s) => foundry.utils.escapeHTML(String(s ?? ""));
      const text = game.i18n.format(`SBE.Effects.Periodic.Empty.${what}`, { name: item.name });
      await ChatMessage.create({
        speaker: actor ? ChatMessage.getSpeaker({ actor }) : undefined,
        content: `<div class="sbe-fx-empty"><img src="${e(item.img)}" alt=""><span>${e(text)}</span></div>`
      });
    } catch (err) { console.warn("SBE | Effets : message d'objet vide en échec", err); }
  }

  static async _escalate(actor, def, ae, n) {
    const cur = EffectManager.getStacks(actor, def.key);
    const step = def.escalation.step * n;
    let next;
    if (def.escalation.decay && def.trigger.enabled && def.trigger.conditions.length
        && !this.conditionHolds(def, docScope(actor))) {
      next = cur - step;          /* le déclencheur ne tient plus : ça redescend */
    } else {
      next = Math.min(maxStacks(def), cur + step);
    }
    if (next !== cur) await EffectManager.setStacks(actor, def.key, next);
  }

  /* ========================================================== */
  /*  JET DE RÉSISTANCE                                          */
  /* ========================================================== */

  static async _resistRound(actor) {
    for (const ae of [...(actor.effects ?? [])]) {
      const def = EffectManager.getDef(ae.flags?.[SYSTEM_ID]?.key ?? "");
      if (def?.resist.enabled && def.resist.onRound) await this.resist(actor, def, ae, {});
    }
  }

  static async resist(actor, def, ae, { onApply = false, adv = null } = {}) {
    const r = def.resist;
    if (!r.key) return null;
    const scope = docScope(actor);
    const difficulty = r.difficulty
      ? (Number.isFinite(Number(r.difficulty)) ? Number(r.difficulty) : Number(evalExpression(r.difficulty, scope)) || 0)
      : 0;
    const label = levelOf(def, EffectManager.getStacks(actor, def.key) || 1).label;
    const res = await rollField(actor, r.key, {
      difficulty, adv,
      title: game.i18n.format("SBE.Effects.ResistTitle", { effect: label })
    });
    if (!res) {
      ui.notifications.warn(game.i18n.format("SBE.Effects.ResistNoRoll", { key: r.key }));
      return null;
    }
    if (!actor.effects?.get?.(ae.id)) return res;
    const o = res.outcome;
    if (o === "success" || o === "critSuccess") {
      const mult = (o === "critSuccess" && r.crit) ? r.critMult : 1;
      if (r.result === "cancel") {
        if (onApply && isAuto(ae)) this._immune.add(`${actor.uuid}::${def.key}`);
        await EffectManager.turnOff(actor, def.key);
      } else {
        await this._reduce(actor, def, ae, r.reduceBy * mult);
      }
    } else if (o === "critFailure" && r.crit) {
      await this._aggravate(actor, def, ae, r.critMult);
    }
    return res;
  }

  /** Moins de cumuls (ou de rounds, pour un effet sans cumul). */
  static async _reduce(actor, def, ae, by) {
    if (maxStacks(def) > 1) {
      await EffectManager.setStacks(actor, def.key, EffectManager.getStacks(actor, def.key) - by);
      return;
    }
    const rounds = Number(ae.flags?.[SYSTEM_ID]?.rounds) || 0;
    if (rounds > by) await ae.update({ [`flags.${SYSTEM_ID}.rounds`]: rounds - by });
    else await EffectManager.turnOff(actor, def.key);
  }

  static async _aggravate(actor, def, ae, mult) {
    if (maxStacks(def) > 1) {
      await EffectManager.setStacks(actor, def.key, Math.round(EffectManager.getStacks(actor, def.key) * mult));
      return;
    }
    const rounds = Number(ae.flags?.[SYSTEM_ID]?.rounds) || 0;
    if (rounds > 0) await ae.update({ [`flags.${SYSTEM_ID}.rounds`]: Math.round(rounds * mult) });
  }

  /* ========================================================== */
  /*  GUÉRISON AU REPOS                                          */
  /* ========================================================== */

  static async restHeal(actor) {
    for (const ae of [...(actor.effects ?? [])]) {
      const def = EffectManager.getDef(ae.flags?.[SYSTEM_ID]?.key ?? "");
      const h = def?.restHeal;
      if (!h || h.mode === "none") continue;
      try {
        if (h.mode === "remove") { await EffectManager.turnOff(actor, def.key); continue; }
        if (h.mode === "reduce") { await this._reduce(actor, def, ae, h.reduceBy); continue; }
        /* « save » : le jet d'un champ, réussi = guérison. */
        if (!h.key) continue;
        const scope = docScope(actor);
        const difficulty = h.difficulty
          ? (Number.isFinite(Number(h.difficulty)) ? Number(h.difficulty) : Number(evalExpression(h.difficulty, scope)) || 0)
          : 0;
        const res = await rollField(actor, h.key, {
          difficulty, title: game.i18n.format("SBE.Effects.RestTitle", { effect: def.label || def.key })
        });
        if (!res || !["success", "critSuccess"].includes(res.outcome)) continue;
        if (h.onSuccess === "remove") await EffectManager.turnOff(actor, def.key);
        else await this._reduce(actor, def, ae, h.reduceBy);
      } catch (err) {
        console.warn(`SBE | Effet « ${def.key} » : guérison au repos en échec`, err);
      }
    }
  }

  /* ========================================================== */
  /*  Retours visuels                                            */
  /* ========================================================== */

  /** Chiffre flottant au-dessus des jetons de l'acteur (tous clients). */
  static _floatText(actor, t) {
    try {
      const up = t.delta > 0;
      for (const token of actor.getActiveTokens?.() ?? []) {
        canvas?.interface?.createScrollingText?.(token.center, `${up ? "+" : "−"}${Math.abs(t.delta)} ${t.keyLabel}`, {
          anchor: CONST.TEXT_ANCHOR_POINTS.TOP,
          direction: up ? CONST.TEXT_ANCHOR_POINTS.TOP : CONST.TEXT_ANCHOR_POINTS.BOTTOM,
          fill: up ? 0x5cb85c : 0xe57373,
          stroke: 0x000000, strokeThickness: 4, fontSize: 28, jitter: 0.25
        });
      }
    } catch (_e) { /* pas de scène affichée */ }
  }

  /** Carte de chat d'un effet périodique (MJ + propriétaires). */
  static async _card(actor, def, label, keyLabel, from, to) {
    const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
    const d = Math.round((to - from) * 1000) / 1000;
    const whisper = game.users.filter(u => u.isGM || actor.testUserPermission(u, "OWNER")).map(u => u.id);
    await ChatCards.post({
      type: "effect",
      icon: levelOf(def, 1).icon,
      title: label,
      body: `<div class="sbe-card-line ${d > 0 ? "is-up" : "is-down"}"><span class="sbe-card-l">${esc(keyLabel)}</span>
        <span class="sbe-card-delta">${d > 0 ? "+" : "−"}${Math.abs(d)}</span>
        <span class="sbe-card-val">(${from} → ${to})</span></div>`,
      speaker: { alias: actor.name },
      whisper
    });
  }
}
