/**
 * SBE — DÉCLENCHEURS D'ACTIONS
 *
 * Un bouton à étapes peut se lancer TOUT SEUL quand quelque chose arrive
 * (réglage du bouton, volet « Se lance tout seul » : config.auto) :
 *   { on: [événements], formula, effect, signal, scope, freq, ask, onlyIf }
 *
 * Événements (EVENTS) :
 *   damage / heal       la clé qui encaisse les dégâts (manager Combat)
 *                       baisse / monte — d'où que ça vienne ;
 *   beforeDrop          une valeur (watchKey, sinon celle des dégâts) va
 *                       baisser : joué AVANT l'écriture, chez celui qui
 *                       écrit ; « Nouvelle baisse » (newDrop, formule sur
 *                       eventValue = la baisse prévue) la remplace, bornée
 *                       entre 0 et la baisse prévue ; les étapes suivent ;
 *   kill                une attaque de ce personnage a mis une cible à 0
 *                       (eventName : son nom) ;
 *   critSaved           un échec critique de ce personnage est devenu un
 *                       échec (clé à effet « sans_echec_critique » ;
 *                       eventName : le jet) ;
 *   turnStart / turnEnd début / fin du tour du personnage ;
 *   combatStart / combatEnd ;
 *   equip / unequip     CET objet entre dans un slot / en sort ;
 *   gain                CET objet arrive dans un inventaire ;
 *   newDay              nouvelle journée ;
 *   becomes             une formule (lue sur le document du bouton)
 *                       devient vraie ;
 *   effectOn / effectOff un effet (tous, celui choisi, ou ceux d'une
 *                       catégorie : effectCategory) est posé / retiré ; une
 *                       étape « Jet de résistance » sur l'effet posé
 *                       remplace la résistance à la pose de l'effet ;
 *   signal              une étape « Envoyer un signal » (nom libre) ;
 *   calHour / calDay / calDawn / calDusk / calWeather / calSeason / calMoon /
 *   calEvent            le calendrier : l'heure change, la date change,
 *                       le soleil se lève / se couche, la météo ou la
 *                       saison change, une lune change de phase, un
 *                       événement commence (eventName : l'heure, la date,
 *                       le temps, la saison, la phase — eventSource : la
 *                       lune —, le nom).
 *
 * Qui réagit : les boutons du MODÈLE DE PERSONNAGE (sa fiche), et ceux
 * des OBJETS qu'il porte selon leur portée : porté (dans l'inventaire),
 * équipé seulement (dans un slot), ou posé sur la scène (l'objet posé
 * réagit à ses propres événements : dégâts reçus, signal…).
 *
 * Où : tout se DÉTECTE chez le MJ principal (une seule fois), et le
 * bouton se JOUE chez le joueur du personnage s'il est connecté (ses
 * fenêtres : « Demander », « Choisir une cible »…), sinon chez le MJ.
 * Fréquence : chaque fois, une fois par round, par combat ou par
 * journée ; « demander avant » pose la question à celui qui le joue.
 *
 * Variables lues par les étapes du bouton : eventName (l'événement, le
 * nom du signal ou la clé de l'effet), eventValue (montant des dégâts
 * ou du soin), eventSource (signal : qui l'a envoyé).
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { isPrimaryGM, onSocketMessage, emitSocket, requestGM } from "../../helpers/socket.mjs";
import { walkElements, equipKeys } from "../../builder/element-renderer.mjs";
import { evalExpression } from "../../builder/formula-engine.mjs";
import { docScope } from "../../builder/doc-context.mjs";
import { CombatManager } from "../combat/combat-manager.mjs";
import { PropManager } from "../props/prop-manager.mjs";
import { CalendarManager } from "../calendar/calendar-manager.mjs";
import { EffectManager, isForwardTurn } from "../effects/effect-manager.mjs";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
export const AUTO_EVENTS = ["damage", "heal", "beforeDrop", "kill", "critSaved", "turnStart", "turnEnd", "combatStart", "combatEnd",
  "equip", "unequip", "gain", "newDay", "becomes", "effectOn", "effectOff", "signal",
  /* Calendrier (calendar-manager) : chaque heure, nouvelle date, aube, crépuscule, météo, saison, événement. */
  "calHour", "calDay", "calDawn", "calDusk", "calWeather", "calSeason", "calMoon", "calEvent"];
export const AUTO_SCOPES = ["carried", "equipped", "placed"];
export const AUTO_FREQS = ["each", "round", "combat", "day"];
/* Événements qu'un poste quelconque peut signaler au MJ principal (notify). */
const NOTIFY_EVENTS = ["critSaved"];
/* Événements qu'un autre MJ relaie au MJ principal (jamais un joueur). */
const GM_EVENTS = ["newDay"];
/* Événements qui ne concernent que l'objet lui-même. */
const ITEM_ONLY = ["equip", "unequip", "gain"];
const FIRED = "autoFired";

/* MJ principal : dernières valeurs connues (dégâts / soin, formules). */
const LAST_HP = new Map();
const LAST_TRUE = new Map();
const LAST_EQUIP = new Map();
/* Joueur actif par combat (fin de tour du précédent). */
const LAST_TURN = new Map();
/* « Avant qu'une valeur baisse » : prêtes chez celui qui écrit, jouées après l'écriture. */
const PENDING = new Map();
let REACTING = 0;
/* Ce que les réactions ont retenu de la dernière baisse, par personnage :
   { key, sources: [{ name, img, delta }] } — lu par qui a fait baisser
   (la carte d'attaque montre « −2 Réflexe de proie »). */
const DROP_NOTES = new Map();
/* Exécutions à la file (une à la fois par poste). */
let queue = Promise.resolve();

export class ActionTriggers {

  static init() {
    /* Dégâts et soin : la clé qui encaisse, sur la fiche ou sur un objet posé. */
    /* Retour en arrière (managers/undo) : aucun déclencheur ne repart. */
    const onActor = (actor, options) => { if (actor && isPrimaryGM() && !options?.sbeUndo) this.#actorChanged(actor, options); };
    Hooks.on("updateActor", (actor, _c, options, userId) => {
      onActor(actor, options);
      if (userId === game.user.id && !options?.sbeUndo) this.#afterDrop(actor);
    });
    Hooks.on("updateActorDelta", (delta, _c, options) => onActor(delta.parent?.actor, options));
    Hooks.on("updateItem", (item, changes, options) => { if (isPrimaryGM() && !options?.sbeUndo) this.#itemChanged(item, changes, options); });
    Hooks.on("createItem", (item, options) => { if (isPrimaryGM() && !options?.sbeUndo) this.#itemCreated(item); });
    /* Objet ÉQUIPÉ supprimé (retiré du slot par la croix, jeté…) : il
       sort du slot — ses boutons « retiré » se jouent une dernière fois,
       chez le MJ principal (l'objet n'existe plus ailleurs). */
    Hooks.on("deleteItem", (item, options) => {
      if (!isPrimaryGM()) return;
      if (options?.sbeUndo) { LAST_EQUIP.delete(item.uuid); return; }
      const actor = item.parent;
      const was = LAST_EQUIP.get(item.uuid) ?? this.#equipped(item);
      LAST_EQUIP.delete(item.uuid);
      if (actor?.documentName !== "Actor" || !was) return;
      for (const { doc, el } of this.#buttons(actor, "unequip", item)) this.#enqueue(doc, el, { eventName: "unequip", eventValue: 0, eventSource: "" });
    });
    for (const h of ["createActiveEffect", "deleteActiveEffect"]) {
      Hooks.on(h, (ae, options) => {
        const actor = ae.parent;
        if (!isPrimaryGM() || options?.sbeUndo || actor?.documentName !== "Actor") return;
        const key = ae.flags?.[SYSTEM_ID]?.key ?? "";
        this.fire(actor, h === "createActiveEffect" ? "effectOn" : "effectOff", { eventName: key, effect: key });
        this.#checkBecomes(actor);
      });
    }
    Hooks.on("updateCombat", (combat, changed) => { if (isPrimaryGM()) this.#combatChanged(combat, changed); });
    Hooks.on("deleteCombat", (combat) => {
      if (!isPrimaryGM()) return;
      LAST_TURN.delete(combat.id);
      for (const a of this.#combatActors(combat)) this.fire(a, "combatEnd", {});
    });
    /* Nouvelle journée : signal local du MJ qui la lance. */
    Hooks.on("sbeNewDay", (actor) => {
      if (isPrimaryGM()) this.fire(actor, "newDay", {});
      else if (game.user.isGM && actor) requestGM({ type: "sbeAutoEvent", uuid: actor.uuid, event: "newDay", data: {} }, { quiet: true });
    });

    /* Joueur : un bouton à jouer chez lui ; MJ : un signal envoyé par un joueur. */
    onSocketMessage((p) => {
      if (p?.type === "sbeAutoRun" && p.to === game.user.id) this.#runRemote(p);
      else if (p?.type === "sbeSignal" && isPrimaryGM()) this.#signalNow(p.actors ?? [], p.name, p.source ?? "");
      else if (p?.type === "sbeAutoEvent" && isPrimaryGM()
        && (NOTIFY_EVENTS.includes(p.event) || (GM_EVENTS.includes(p.event) && game.users.get(p._from)?.isGM))) {
        const a = fromUuidSync(p.uuid);
        if (a) this.fire(a, p.event, p.data ?? {});
      }
    });

    Hooks.once("ready", () => { if (isPrimaryGM()) this.#prime(); });
  }

  /* ============================================================ */
  /*  Détection (MJ principal)                                     */
  /* ============================================================ */

  /** Valeurs de départ (sans rien déclencher). */
  static #prime() {
    const key = CombatManager.getConfig().damageKey;
    const actors = [...game.actors, ...[...game.scenes].flatMap(s => s.tokens.filter(t => !t.actorLink && t.actor).map(t => t.actor))];
    for (const a of actors) {
      if (key) LAST_HP.set(a.uuid, this.#hpOf(a, key));
      this.#checkBecomes(a, { silent: true });
      for (const it of a.items ?? []) LAST_EQUIP.set(it.uuid, this.#equipped(it));
    }
  }

  static #hpOf(doc, key) {
    const v = Number(doc?.system?.values?.[key]);
    return Number.isFinite(v) ? v : null;
  }

  static #actorChanged(actor, options = {}) {
    const key = CombatManager.getConfig().damageKey;
    if (key) {
      const now = this.#hpOf(actor, key);
      const before = LAST_HP.get(actor.uuid);
      LAST_HP.set(actor.uuid, now);
      if (before !== undefined && before !== null && now !== null && now !== before) {
        this.fire(actor, now < before ? "damage" : "heal", { eventValue: Math.abs(now - before) });
        this.#killed(actor, before, now, options);
      }
    }
    this.#checkBecomes(actor);
  }

  static #itemChanged(item, changes, options = {}) {
    const actor = item.parent;
    if (actor?.documentName !== "Actor") return;
    /* Objet posé attaquable : ses PV sont la clé de son onglet Scène. */
    const td = PropManager.placedTokenOf(item);
    if (td && PropManager.flagsOf(td).item === item.id) {
      const hk = PropManager.cfgOf(item).hpKey;
      const now = hk ? this.#hpOf(item, hk) : null;
      const before = LAST_HP.get(item.uuid);
      LAST_HP.set(item.uuid, now);
      if (before !== undefined && before !== null && now !== null && now !== before) {
        this.fire(actor, now < before ? "damage" : "heal", { eventValue: Math.abs(now - before) }, item);
        this.#killed(item, before, now, options);
      }
    }
    if (foundry.utils.hasProperty(changes, "system.carry")) {
      const was = LAST_EQUIP.get(item.uuid) ?? false;
      const is = this.#equipped(item);
      LAST_EQUIP.set(item.uuid, is);
      if (is !== was) this.fire(actor, is ? "equip" : "unequip", {}, item);
    }
    this.#checkBecomes(actor);
  }

  /** Une attaque (options.sbeBy : l'attaquant) fait passer la cible de plus de 0 à 0 ou moins. */
  static #killed(target, before, now, options) {
    if (!(before > 0 && now <= 0) || !options?.sbeBy) return;
    const by = fromUuidSync(options.sbeBy);
    const killer = by?.documentName === "Actor" ? by : by?.actor;
    if (killer && killer.uuid !== target.uuid) this.fire(killer, "kill", { eventName: target.name ?? "" });
  }

  static #itemCreated(item) {
    const actor = item.parent;
    if (actor?.documentName !== "Actor" || item.type !== "objet") return;
    const is = this.#equipped(item);
    LAST_EQUIP.set(item.uuid, is);
    if (actor.type !== "prop") this.fire(actor, "gain", {}, item);
    if (is) this.fire(actor, "equip", {}, item);
  }

  /** L'objet est-il rangé dans un SLOT (de la fiche ou d'un objet hôte), ou un conteneur « équipé » ? */
  static #equipped(item) {
    const c = item.system?.carry ?? {};
    const where = String(c.where ?? "");
    if (!where) return false;
    const actor = item.parent;
    const host = c.host ? actor?.items?.get(c.host) : actor;
    const els = host?.system?.template?.system?.elements ?? [];
    return equipKeys(els).has(where);
  }

  static #combatActors(combat) {
    return [...new Set((combat?.combatants ?? []).map(c => c.actor).filter(Boolean))];
  }

  static #combatChanged(combat, changed) {
    if (!("turn" in changed) && !("round" in changed)) return;
    /* Le combat commence : premier round. */
    if (changed.round === 1 && (Number(combat.previous?.round) || 0) === 0 && isForwardTurn(combat, changed)) {
      for (const a of this.#combatActors(combat)) this.fire(a, "combatStart", {});
    }
    const prev = LAST_TURN.get(combat.id);
    const cur = combat.combatant?.actor ?? null;
    LAST_TURN.set(combat.id, cur);
    /* Revenir d'un tour (ou en choisir un plus haut) ne relance rien. */
    if (!isForwardTurn(combat, changed)) return;
    if (prev && prev !== cur) this.fire(prev, "turnEnd", {});
    if (cur && cur !== prev) this.fire(cur, "turnStart", {});
  }

  /** « Devient vraie » : chaque formule réglée est relue ; fausse → vraie déclenche. */
  static #checkBecomes(actor, { silent = false } = {}) {
    for (const { doc, el } of this.#buttons(actor, "becomes")) {
      const f = String(el.config?.auto?.formula ?? "").trim();
      if (!f) continue;
      const id = `${doc.uuid}:${el.id}`;
      let now = false;
      try { now = !!evalExpression(f, docScope(doc)); } catch (_e) { now = false; }
      const was = LAST_TRUE.get(id);
      LAST_TRUE.set(id, now);
      if (!silent && was === false && now) this.#dispatch(actor, doc, el, { eventName: "becomes" });
    }
  }

  /* ============================================================ */
  /*  Signal (étape « Envoyer un signal »)                         */
  /* ============================================================ */

  /** Envoie un signal à des personnages (ou objets posés). */
  static signal(actors, name, source = "") {
    const uuids = [...new Set(actors.map(a => a?.uuid).filter(Boolean))];
    if (!uuids.length || !name) return;
    if (isPrimaryGM()) return this.#signalNow(uuids, name, source);
    requestGM({ type: "sbeSignal", actors: uuids, name, source });
  }

  static #signalNow(uuids, name, source) {
    for (const u of uuids) {
      const a = fromUuidSync(u);
      if (a) this.fire(a, "signal", { eventName: name, signal: name, eventSource: source });
    }
  }

  /* ============================================================ */
  /*  Boutons concernés                                            */
  /* ============================================================ */

  /** Boutons automatiques d'un personnage pour cet événement (sa fiche, ses objets). */
  static #buttons(actor, event, onlyItem = null) {
    const out = [];
    const take = (doc, els) => {
      for (const el of walkElements(els ?? [])) {
        const a = el?.kind === "button" && el.config?.action === "steps" ? el.config.auto : null;
        if (a && Array.isArray(a.on) && a.on.includes(event)) out.push({ doc, el });
      }
    };
    if (!onlyItem && !ITEM_ONLY.includes(event)) take(actor, actor.system?.template?.system?.elements);
    const items = onlyItem ? [onlyItem] : (ITEM_ONLY.includes(event) ? [] : (actor.items?.contents ?? []));
    for (const it of items) {
      if (it.type !== "objet") continue;
      const els = it.system?.template?.system?.elements ?? [];
      const before = out.length;
      take(it, els);
      /* Portée de l'objet : porté, équipé, ou posé. */
      for (let i = out.length - 1; i >= before; i--) if (!this.#inScope(out[i].doc, out[i].el)) out.splice(i, 1);
    }
    return out;
  }

  static #inScope(item, el) {
    const scope = el.config.auto.scope ?? "carried";
    const placed = !!PropManager.placedTokenOf(item) && !item.system?.carry?.host;
    if (scope === "placed") return placed;
    if (placed || item.parent?.type === "prop") return false;
    return scope === "equipped" ? this.#equipped(item) : true;
  }

  /** L'effet posé / retiré est-il celui que le bouton écoute (clé, catégorie) ? */
  static #effectMatch(a, key) {
    if (a.effect && a.effect !== key) return false;
    const cat = String(a.effectCategory ?? "").trim().toLowerCase();
    return !cat || String(EffectManager.getDef(key)?.category ?? "").trim().toLowerCase() === cat;
  }

  /**
   * MJ principal, à la pose d'un effet : un bouton « Effet posé » de ce
   * personnage (ou d'un objet porté) va-t-il faire la résistance de cet
   * effet (étape « Jet de résistance ») ? Elle remplace alors celle de
   * l'effet : un seul jet. Mêmes contrôles qu'au lancement (« Seulement
   * si », fréquence, disponibilité).
   */
  static async resistsByReaction(actor, key) {
    const hasStep = (list) => (Array.isArray(list) ? list : []).some(st => st && (
      (st.type === "resist" && (!st.key || st.key === key))
      || Object.values(st).some(v => Array.isArray(v) && hasStep(v))));
    let unavailable = null;
    for (const { doc, el } of this.#buttons(actor, "effectOn")) {
      const a = el.config.auto;
      if (!this.#effectMatch(a, key) || !hasStep(el.config.steps)) continue;
      const cond = String(a.onlyIf ?? "").trim();
      if (cond && !evalExpression(cond, { ...docScope(doc), eventName: key, eventValue: 0, eventSource: "" })) continue;
      if (this.#freq(doc, el).done) continue;
      unavailable ??= (await import("../../builder/item-actions.mjs")).unavailableReason;
      if (unavailable(doc, el)) continue;
      return true;
    }
    return false;
  }

  /** MJ principal : un événement arrive sur ce personnage. */
  static fire(actor, event, data = {}, onlyItem = null) {
    if (!actor || !isPrimaryGM()) return;
    for (const { doc, el } of this.#buttons(actor, event, onlyItem)) {
      const a = el.config.auto;
      if (["effectOn", "effectOff"].includes(event) && !this.#effectMatch(a, data.effect)) continue;
      if (event === "signal" && String(a.signal ?? "").trim() !== data.signal) continue;
      this.#dispatch(actor, doc, el, { eventName: data.eventName ?? event, eventValue: data.eventValue ?? 0, eventSource: data.eventSource ?? "" });
    }
  }

  /**
   * AVANT L'ÉCRITURE (Actor._preUpdate, chez celui qui écrit) : une valeur
   * va baisser. Chaque bouton « Avant qu'une valeur baisse » qui passe
   * (« Seulement si », fréquence, disponibilité) peut changer la baisse ;
   * ses étapes sont jouées une fois la valeur écrite (#afterDrop).
   */
  static async beforeDrop(actor, changes, options = {}) {
    PENDING.delete(actor.uuid);
    DROP_NOTES.delete(actor.uuid);
    if (options.sbeDirect || REACTING) return;
    const btns = this.#buttons(actor, "beforeDrop");
    if (!btns.length) return;
    const dmgKey = CombatManager.getConfig().damageKey;
    const cur = actor.system?.values ?? {};
    const read = (p) => (p in changes ? changes[p] : foundry.utils.getProperty(changes, p));
    const put = (p, v) => { if (p in changes) changes[p] = v; else foundry.utils.setProperty(changes, p, v); };
    const { unavailableReason } = await import("../../builder/item-actions.mjs");
    const ready = [];
    for (const { doc, el } of btns) {
      const a = el.config.auto;
      const key = String(a.watchKey ?? "").trim() || dmgKey;
      if (!key) continue;
      const path = `system.values.${key}`;
      const old = Number(cur[key]);
      const raw = read(path);
      const nv = Number(raw);
      if (raw === undefined || !Number.isFinite(old) || !Number.isFinite(nv) || nv >= old) continue;
      const vars = { eventName: key, eventValue: old - nv, eventSource: "" };
      const scope = { ...docScope(doc), ...vars };
      const ok = (f) => { try { return !!evalExpression(f, scope); } catch (_e) { return false; } };
      const cond = String(a.onlyIf ?? "").trim();
      if (cond && !ok(cond)) continue;
      if (this.#freq(doc, el).done || unavailableReason(doc, el)) continue;
      const f = String(a.newDrop ?? "").trim();
      if (f) {
        let v = NaN;
        try { v = Number(evalExpression(f, scope)); } catch (_e) { /* formule cassée : baisse inchangée */ }
        if (Number.isFinite(v)) {
          const kept = Math.min(vars.eventValue, Math.max(0, v));
          put(path, old - kept);
          /* Ce que CETTE réaction a retenu, pour l'afficher où la baisse est née. */
          if (kept < vars.eventValue) {
            const note = DROP_NOTES.get(actor.uuid) ?? { key, sources: [] };
            note.sources.push({ name: doc.name, img: doc.img, delta: vars.eventValue - kept });
            DROP_NOTES.set(actor.uuid, note);
          }
        }
      }
      ready.push({ uuid: doc.uuid, btnId: el.id, vars });
    }
    if (!ready.length) return;
    PENDING.set(actor.uuid, ready);
    /* Baisse entièrement retenue (le personnage reste où il est) : la
       mise à jour ne change plus rien, Foundry ne l'écrit pas et aucun
       « updateActor » ne viendra — les étapes (la charge consommée…) se
       jouent tout de suite. */
    const src = actor._source ?? {};
    const same = Object.entries(foundry.utils.flattenObject(changes))
      .every(([p, v]) => p === "_id" || foundry.utils.getProperty(src, p) == v); // eslint-disable-line eqeqeq
    if (same) setTimeout(() => this.#afterDrop(actor), 0);
  }

  /**
   * Ce que les réactions ont retenu de la dernière baisse de `key` sur ce
   * personnage (lu une fois) : [{ name, img, delta }], ou [].
   */
  static takeDropNote(actor, key) {
    const n = DROP_NOTES.get(actor?.uuid);
    if (!n || n.key !== key) return [];
    DROP_NOTES.delete(actor.uuid);
    return n.sources;
  }

  /** Après l'écriture : les étapes des boutons retenus avant. */
  static #afterDrop(actor) {
    const list = PENDING.get(actor.uuid);
    if (!list) return;
    PENDING.delete(actor.uuid);
    for (const p of list) {
      const doc = fromUuidSync(p.uuid);
      const el = doc ? [...walkElements(doc.system?.template?.system?.elements ?? [])].find(e => e?.id === p.btnId) : null;
      if (doc && el) this.#dispatch(actor, doc, el, p.vars, true);
    }
  }

  /** Depuis n'importe quel poste : un événement arrive sur ce personnage (relayé au MJ principal). */
  static notify(actor, event, data = {}) {
    if (!actor || !NOTIFY_EVENTS.includes(event)) return;
    if (isPrimaryGM()) this.fire(actor, event, data);
    else requestGM({ type: "sbeAutoEvent", uuid: actor.uuid, event, data }, { quiet: true });
  }

  /** Qui joue le bouton : le joueur du personnage s'il est là, sinon le MJ. */
  static #runner(actor) {
    /* Un objet posé n'a pas de joueur : le MJ. */
    if (actor.type === "prop") return game.user.id;
    const players = game.users.filter(u => u.active && !u.isGM && actor.testUserPermission(u, "OWNER"));
    return (players.find(u => u.character?.id === actor.id) ?? players[0] ?? game.user).id;
  }

  /** `pre` : déjà vérifié avant l'écriture (« Avant qu'une valeur baisse ») — ni « Seulement si », ni question. */
  static #dispatch(actor, doc, el, vars, pre = false) {
    const to = this.#runner(actor);
    if (to === game.user.id) this.#enqueue(doc, el, vars, pre);
    else emitSocket({ type: "sbeAutoRun", to, uuid: doc.uuid, btnId: el.id, vars, pre });
  }

  static #runRemote(p) {
    /* Seul le MJ principal distribue les boutons automatiques ; et
       seulement un bouton réglé « automatique ». */
    if (!game.users.get(p._from)?.isGM) return;
    const doc = fromUuidSync(p.uuid);
    const el = doc ? [...walkElements(doc.system?.template?.system?.elements ?? [])].find(e => e?.id === p.btnId) : null;
    if (!doc?.isOwner || !Array.isArray(el?.config?.auto?.on) || !el.config.auto.on.length) return;
    this.#enqueue(doc, el, p.vars ?? {}, !!p.pre);
  }

  static #enqueue(doc, el, vars, pre = false) {
    queue = queue.then(() => this.#run(doc, el, vars, pre)).catch(err => console.warn("SBE | Déclencheur en échec", el?.label, err));
  }

  /* ============================================================ */
  /*  Exécution (chez celui qui joue)                              */
  /* ============================================================ */

  /** Repère de fréquence (round, combat, journée) ; "" = chaque fois. */
  static #mark(freq) {
    const c = game.combat;
    if (freq === "round") return c?.started ? `${c.id}:${c.round}` : "";
    if (freq === "combat") return c?.started ? c.id : "";
    if (freq === "day") return String(CalendarManager.dayIndex());
    return "";
  }

  /** Fréquence : déjà parti pour ce round / combat / jour ? */
  static #freq(doc, el) {
    const a = el.config?.auto ?? {};
    const freq = AUTO_FREQS.includes(a.freq) ? a.freq : "each";
    const mark = this.#mark(freq);
    const fired = doc.getFlag(SYSTEM_ID, FIRED) ?? {};
    return { freq, mark, fired, done: !!mark && fired[el.key] === `${freq}:${mark}` };
  }

  static async #run(doc, el, vars, pre = false) {
    const a = el.config?.auto ?? {};
    /* « Seulement si » : lu sur le document du bouton, avec l'événement. */
    const cond = String(a.onlyIf ?? "").trim();
    if (!pre && cond && !evalExpression(cond, { ...docScope(doc), ...vars })) return;
    const { freq, mark, fired, done } = this.#freq(doc, el);
    if (done) return;
    const { runTriggered, unavailableReason } = await import("../../builder/item-actions.mjs");
    if (unavailableReason(doc, el)) return;
    if (a.ask && !pre) {
      const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: doc.name },
        content: `<p>${L("SBE.Auto.Ask", { button: foundry.utils.escapeHTML(el.label || el.key), name: foundry.utils.escapeHTML(doc.name) })}</p>`,
        rejectClose: false
      }).catch(() => false);
      if (!ok) return;
    }
    if (mark && doc.isOwner) await doc.setFlag(SYSTEM_ID, FIRED, { ...fired, [el.key]: `${freq}:${mark}` });
    /* Les étapes d'une réaction ne relancent pas les réactions (pas de boucle). */
    if (pre) REACTING++;
    try { await runTriggered(doc, el, { vars }); } finally { if (pre) REACTING--; }
  }
}
