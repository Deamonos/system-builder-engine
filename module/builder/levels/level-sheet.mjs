/**
 * SBE — COMPOSANT NIVEAU À LA TABLE
 *
 * « Passer au niveau » : selon les réglages du composant,
 *   - qui : le joueur, le joueur avec validation du MJ, le MJ seulement ;
 *   - la fenêtre de passage (les composants posés DANS le Niveau) et son
 *     budget de points ; écrite « à Valider » ou « tout de suite ».
 * Chaque passage est noté (drapeau levelLog.<clé>) : niveau, qui, quand,
 * les valeurs avant / après et ce que les règles ont fait — pour
 * redescendre plus tard. Il s'annule aussi (annulation des actions).
 *
 * « Descendre d'un niveau » (selon le réglage : personne, le MJ, le
 * joueur avec validation, le joueur) : défaire le dernier passage et/ou
 * jouer le tableau de règles de descente.
 */

import { levelState, levelConfig, budgetOf } from "./level-model.mjs";
import { SBELevelUpApp, windowKeys } from "./level-window.mjs";
import { runRules, revertJournal } from "./level-rules.mjs";
import { SBELevelHistoryApp } from "./level-history.mjs";
import { findById, walkElements } from "../element-renderer.mjs";
import { onSocketMessage, isPrimaryGM, requestGM, onCardAnswer, answerCard } from "../../helpers/socket.mjs";
import { docScope } from "../doc-context.mjs";
import { evalExpression } from "../formula-engine.mjs";
import { UndoManager } from "../../managers/undo/undo-manager.mjs";
import { ChatCards } from "../../managers/chat/chat-cards.mjs";
import { SYSTEM_ID } from "../../helpers/constants.mjs";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const Del = () => foundry.data.operators.ForcedDeletion.create();
const FLAG = "levelUp";

/** Le composant Niveau `elId` du modèle de `doc`. */
export function levelElOf(doc, elId) {
  const el = findById(doc?.system?.template?.system?.elements ?? [], elId);
  return el?.kind === "level" ? el : null;
}

/** L'état du niveau sur un document (portée calculée de la fiche). */
export function levelStateOf(doc, el) {
  return levelState(el, doc?.system?.values ?? {}, scopeOf(doc), evalExpression, levelGrantedOf(doc, el.key));
}

/** Niveaux reçus (quête, bouton) en attente d'être passés. */
export function levelGrantedOf(doc, key) {
  return Math.max(0, Math.floor(Number(doc?.flags?.[SYSTEM_ID]?.levelGranted?.[key]) || 0));
}

/** Le composant Niveau de clé `key` sur un document (ou null). */
export function levelElByKey(doc, key) {
  for (const e of walkElements(doc?.system?.template?.system?.elements ?? [])) if (e?.kind === "level" && e.key === key) return e;
  return null;
}

function scopeOf(doc) {
  try { return docScope(doc); } catch (_e) { return {}; }
}

/** L'historique des passages d'un niveau (le plus ancien d'abord). */
export function levelLogOf(doc, key) {
  return doc?.flags?.[SYSTEM_ID]?.levelLog?.[key] ?? [];
}

/** La descente est-elle possible pour cet utilisateur ? */
export function mayGoDown(doc, el, st, isGM = game.user.isGM) {
  const d = st.cfg.down;
  if (d.who === "none" || !(d.undo || d.rules.length)) return false;
  if (st.level <= st.cfg.start) return false;
  return isGM || (d.who !== "gm" && !!doc?.isOwner);
}

/** La demande en attente du MJ pour ce niveau (ou null). */
export function levelPendingOf(doc, key) {
  return doc?.flags?.[SYSTEM_ID]?.levelPending?.[key] ?? null;
}

/** Les clés qu'un passage peut changer : la fenêtre, le budget, les points restants. */
function touchedKeys(el) {
  const cfg = levelConfig(el);
  const keys = windowKeys(el);
  for (const f of cfg.budget.fields) keys.add(f.key);
  if (cfg.budget.leftoverKey) keys.add(cfg.budget.leftoverKey);
  keys.delete(el.key);
  return [...keys];
}

const pick = (values, keys) => Object.fromEntries(keys.map(k => [k, foundry.utils.deepClone(values?.[k] ?? null)]));

export class LevelManager {

  static init() {
    onCardAnswer("level", (message, yes, by) => this.#answer(message, yes, by));
    /* Un joueur donne des niveaux à un document qu'il ne possède pas. */
    onSocketMessage(async (p) => {
      if (p?.type !== "sbeLevelGrant" || !isPrimaryGM()) return;
      const doc = await fromUuid(p.uuid).catch(() => null);
      const el = doc ? levelElOf(doc, p.el) : null;
      if (el) await this.grant(doc, el, Number(p.n) || 0, p.mode, p.u);
    });
    Hooks.on("renderChatMessageHTML", (message, html) => {
      try { this.#decorateCard(message, html instanceof HTMLElement ? html : html?.[0]); }
      catch (err) { console.warn("SBE | Niveau : carte en échec", err); }
    });
    Hooks.on("createChatMessage", (message) => {
      const f = message.getFlag(SYSTEM_ID, FLAG);
      if (!f || f.state !== "ask" || !game.user.isGM || message.author?.id === game.user.id) return;
      ui.notifications.info(L(f.op === "down" ? "SBE.Level.AskDownNote" : "SBE.Level.AskNote", { user: message.author?.name ?? "?", name: f.name ?? "?", n: f.to }));
    });
  }

  /** « Passer au niveau » : la fenêtre de passage, ou le passage direct. */
  static async levelUp(doc, elId) {
    const el = levelElOf(doc, elId);
    if (!el || !(game.user.isGM || doc.isOwner)) return false;
    const gm = game.user.isGM;
    const st = levelStateOf(doc, el);
    const cfg = st.cfg;
    if (levelPendingOf(doc, el.key)) { ui.notifications.warn(L("SBE.Level.Pending")); return false; }
    if (!gm && cfg.who === "gm") { ui.notifications.warn(L("SBE.Level.GmOnly")); return false; }
    if (st.atMax) { ui.notifications.warn(L("SBE.Level.AtMax")); return false; }
    if (st.ready <= 0 && !gm) { ui.notifications.warn(L("SBE.Level.NotReady")); return false; }
    const to = st.level + 1;
    const ask = !gm && cfg.who === "approve";
    const snapshot = foundry.utils.deepClone(doc.system?.values ?? {});
    const hasWindow = (el.children ?? []).length > 0 || (cfg.budget.points && cfg.budget.fields.length);
    if (!hasWindow) return ask ? this.#ask(doc, el, to, snapshot) : this.#apply(doc, el, to, snapshot, game.user.id);

    /* « Tout de suite » : le niveau monte maintenant, les choix restent. */
    if (cfg.commit === "live" && !ask) {
      await this.#apply(doc, el, to, snapshot, game.user.id, { leftover: false });
      SBELevelUpApp.open({ doc, el, to, snapshot, onDone: () => this.#leftover(doc, el, to, snapshot) });
      return true;
    }
    /* « À Valider » (et toute demande au MJ) : annuler remet la fiche. */
    SBELevelUpApp.open({
      doc, el, to, snapshot,
      onDone: async (how) => {
        if (how !== "validate") return this.#rollback(doc, el, snapshot);
        return ask ? this.#ask(doc, el, to, snapshot) : this.#apply(doc, el, to, snapshot, game.user.id);
      }
    });
    return true;
  }

  /** Le passage : niveau, points restants, historique (annulable). */
  static async #apply(doc, el, to, snapshot, userId, { leftover = true, consume = true } = {}) {
    const keys = touchedKeys(el);
    return UndoManager.record({ label: L("SBE.Level.UndoLabel", { name: el.label || el.key, n: to }), actor: doc.documentName === "Actor" ? doc : doc.parent ?? null, item: doc.documentName === "Item" ? doc : null }, async () => {
      const ch = { [`system.values.${el.key}`]: to };
      if (leftover) Object.assign(ch, this.#leftoverChange(doc, el, to, snapshot));
      if (levelPendingOf(doc, el.key)) ch[`flags.${SYSTEM_ID}.levelPending.${el.key}`] = Del();
      /* Un niveau reçu (quête, bouton) est consommé quand l'XP ne suffit
         pas — pas par un niveau donné « direct », qui s'ajoute. */
      const st = levelStateOf(doc, el);
      if (consume && st.granted > 0 && st.xpReady <= 0) ch[`flags.${SYSTEM_ID}.levelGranted.${el.key}`] = st.granted - 1;
      await doc.update(ch);
      /* Le tableau de règles de montée, pour le niveau atteint. */
      const journal = await runRules(doc, levelConfig(el).rules, to);
      const before = { ...pick(snapshot, keys) };
      for (const [k, v] of Object.entries(journal.values)) if (!(k in before)) before[k] = v;
      const after = pick(doc.system?.values, Object.keys(before));
      const log = [...levelLogOf(doc, el.key), { from: to - 1, to, u: userId, t: Date.now(), before, after, journal }];
      await doc.update({ [`flags.${SYSTEM_ID}.levelLog.${el.key}`]: log });
      ui.notifications.info(L("SBE.Level.Reached", { name: doc.name, n: to }));
      return true;
    });
  }

  /**
   * Donne `n` niveaux (quête, bouton) : « disponibles » (le bouton
   * « Passer au niveau » apparaît, passage normal) ou « directs » (passés
   * tout de suite, règles de montée comprises). Négatif : retire d'abord
   * les niveaux reçus en attente, puis descend (réglages de descente).
   * @param {string} mode "component" (réglage du composant) | "available" | "direct"
   */
  static async grant(doc, el, n, mode = "component", userId = game.user.id) {
    n = Math.trunc(Number(n) || 0);
    if (!doc || !el || !n) return false;
    if (!doc.isOwner) {
      return requestGM({ type: "sbeLevelGrant", uuid: doc.uuid, el: el.id, n, mode, u: userId });
    }
    const how = mode === "available" || mode === "direct" ? mode : levelConfig(el).received;
    const flag = `flags.${SYSTEM_ID}.levelGranted.${el.key}`;
    if (n < 0) {
      let left = -n;
      const g = levelGrantedOf(doc, el.key);
      if (g) { const k = Math.min(g, left); left -= k; await doc.update({ [flag]: g - k }); }
      for (; left > 0; left--) { if (!(await this.#applyDown(doc, el, userId))) break; }
      return true;
    }
    if (how === "available") {
      await doc.update({ [flag]: levelGrantedOf(doc, el.key) + n });
      ui.notifications.info(L("SBE.Level.Granted", { name: doc.name, n }));
      return true;
    }
    for (let i = 0; i < n; i++) {
      const st = levelStateOf(doc, el);
      if (st.atMax) break;
      await this.#apply(doc, el, st.level + 1, foundry.utils.deepClone(doc.system?.values ?? {}), userId, { consume: false });
    }
    return true;
  }

  /** « Descendre d'un niveau » : selon le réglage, direct ou demandé au MJ. */
  static async levelDown(doc, elId) {
    const el = levelElOf(doc, elId);
    if (!el) return false;
    const st = levelStateOf(doc, el);
    if (!mayGoDown(doc, el, st)) return false;
    if (levelPendingOf(doc, el.key)) { ui.notifications.warn(L("SBE.Level.Pending")); return false; }
    if (!game.user.isGM && st.cfg.down.who === "approve") return this.#ask(doc, el, st.level - 1, {}, "down");
    return this.#applyDown(doc, el, game.user.id);
  }

  /**
   * La descente : défaire le dernier passage vers ce niveau (valeurs
   * d'avant, objets et effets repris) et/ou le tableau de règles de
   * descente (pour le niveau quitté). Notée dans l'historique.
   */
  static async #applyDown(doc, el, userId) {
    const st = levelStateOf(doc, el);
    const from = st.level, to = from - 1;
    if (to < st.cfg.start) return false;
    return UndoManager.record({ label: L("SBE.Level.UndoDownLabel", { name: el.label || el.key, n: to }), actor: doc.documentName === "Actor" ? doc : doc.parent ?? null, item: doc.documentName === "Item" ? doc : null }, async () => {
      const log = foundry.utils.deepClone(levelLogOf(doc, el.key));
      const start = foundry.utils.deepClone(doc.system?.values ?? {});
      const ch = { [`system.values.${el.key}`]: to };
      let undone = null;
      if (st.cfg.down.undo) {
        for (let i = log.length - 1; i >= 0; i--) {
          const e = log[i];
          if (e.down || e.undone) continue;
          if (e.to === from) undone = i;
          break;
        }
        if (undone !== null) {
          for (const [k, v] of Object.entries(log[undone].before ?? {})) {
            if (k !== el.key) ch[`system.values.${k}`] = v === null || v === undefined ? Del() : v;
          }
          log[undone].undone = true;
        }
      }
      if (levelPendingOf(doc, el.key)) ch[`flags.${SYSTEM_ID}.levelPending.${el.key}`] = Del();
      await doc.update(ch);
      if (undone !== null) await revertJournal(doc, log[undone].journal);
      const journal = await runRules(doc, st.cfg.down.rules, from);
      const keys = new Set(Object.keys(ch).filter(k => k.startsWith("system.values.")).map(k => k.slice(14)));
      for (const k of Object.keys(journal.values)) keys.add(k);
      keys.delete(el.key);
      const before = pick(start, [...keys]);
      const after = pick(doc.system?.values, [...keys]);
      log.push({ from, to, down: true, undo: undone !== null, u: userId, t: Date.now(), before, after, journal });
      await doc.update({ [`flags.${SYSTEM_ID}.levelLog.${el.key}`]: log });
      ui.notifications.info(L("SBE.Level.WentDown", { name: doc.name, n: to }));
      return true;
    });
  }

  /** Points du budget non dépensés → la clé choisie. */
  static #leftoverChange(doc, el, to, snapshot) {
    const b = budgetOf(el, to, doc.system?.values ?? {}, snapshot, scopeOf(doc), evalExpression);
    if (!b?.leftoverKey || !(b.left > 0)) return {};
    const cur = Number(doc.system?.values?.[b.leftoverKey]) || 0;
    return { [`system.values.${b.leftoverKey}`]: cur + b.left };
  }

  static async #leftover(doc, el, to, snapshot) {
    const ch = this.#leftoverChange(doc, el, to, snapshot);
    if (Object.keys(ch).length) await doc.update(ch);
  }

  /** Remet les valeurs de la fenêtre comme à l'ouverture. */
  static async #rollback(doc, el, snapshot) {
    const ch = {};
    const cur = doc.system?.values ?? {};
    for (const k of touchedKeys(el)) {
      if (foundry.utils.equals(cur[k], snapshot[k])) continue;
      ch[`system.values.${k}`] = snapshot[k] === undefined ? Del() : snapshot[k];
    }
    if (Object.keys(ch).length) await doc.update(ch);
  }

  /** Demande au MJ : les choix restent écrits, le niveau attend sa réponse. */
  static async #ask(doc, el, to, snapshot, op = "up") {
    const name = el.label || el.key;
    const down = op === "down";
    const msg = await ChatCards.post({
      type: "request",
      title: L(down ? "SBE.Level.AskDownTitle" : "SBE.Level.AskTitle", { n: to }),
      subtitle: `${doc.name} — ${name}`,
      body: `<p>${esc(L(down ? "SBE.Level.AskDownText" : "SBE.Level.AskText", { user: game.user.name, name: doc.name, label: name, n: to }))}</p>`,
      speaker: ChatMessage.getSpeaker({ actor: doc.documentName === "Actor" ? doc : doc.parent }),
      whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id),
      flags: { [SYSTEM_ID]: { [FLAG]: { uuid: doc.uuid, el: el.id, to, op, name: doc.name, user: game.user.id, state: "ask" } } }
    });
    const pend = { to, op, u: game.user.id, t: Date.now(), m: msg?.id ?? "" };
    if (!down) pend.snapshot = pick(snapshot, touchedKeys(el));
    await doc.update({ [`flags.${SYSTEM_ID}.levelPending.${el.key}`]: pend });
    ui.notifications.info(L("SBE.Level.Asked"));
    return true;
  }

  /** Le joueur retire sa demande : la fiche revient comme avant. */
  static async cancel(doc, elId) {
    const el = levelElOf(doc, elId);
    const p = el ? levelPendingOf(doc, el.key) : null;
    if (!p) return;
    if (p.op !== "down") await this.#rollback(doc, el, p.snapshot ?? {});
    await doc.update({ [`flags.${SYSTEM_ID}.levelPending.${el.key}`]: Del() });
    await this.#close(game.messages.get(p.m), "cancel");
  }

  static async #close(message, state, by = game.user.name) {
    const f = message?.getFlag(SYSTEM_ID, FLAG);
    if (!f || f.state !== "ask" || !message.isOwner) return;
    await message.setFlag(SYSTEM_ID, FLAG, { ...f, state, by });
  }

  /* Toujours chez le MJ principal, une réponse à la fois (answerCard). */
  static async #answer(message, yes, by) {
    if (!game.user.isGM) return;
    const f = message.getFlag(SYSTEM_ID, FLAG);
    if (!f || f.state !== "ask") return;
    const doc = await fromUuid(f.uuid).catch(() => null);
    const el = doc ? levelElOf(doc, f.el) : null;
    const p = el ? levelPendingOf(doc, el.key) : null;
    if (!doc || !el || !p) { await this.#close(message, "gone", by); return; }
    if (!yes) {
      if (p.op !== "down") await this.#rollback(doc, el, p.snapshot ?? {});
      await doc.update({ [`flags.${SYSTEM_ID}.levelPending.${el.key}`]: Del() });
      await this.#close(message, "no", by);
      return;
    }
    if (p.op === "down") await this.#applyDown(doc, el, f.user);
    else await this.#apply(doc, el, f.to, { ...doc.system.values, ...(p.snapshot ?? {}) }, f.user);
    await this.#close(message, "ok", by);
  }

  static #decorateCard(message, root) {
    const f = message.getFlag(SYSTEM_ID, FLAG);
    if (!f || !root) return;
    const body = root.querySelector(".message-content") ?? root;
    body.querySelector(".sbe-lvl-cardbar")?.remove();
    const bar = document.createElement("div");
    bar.className = "sbe-lvl-cardbar sbe-tal-cardbar";
    if (f.state === "ask") {
      if (!game.user.isGM) bar.innerHTML = `<span class="notes">${esc(L("SBE.Talents.Waiting"))}</span>`;
      else {
        bar.innerHTML = `<button type="button" data-lvl="yes"><i class="fa-solid fa-check"></i> ${esc(L("SBE.Talents.Accept"))}</button>
          <button type="button" data-lvl="no"><i class="fa-solid fa-xmark"></i> ${esc(L("SBE.Talents.Refuse"))}</button>`;
        bar.addEventListener("click", async (ev) => {
          const b = ev.target.closest("[data-lvl]");
          if (!b) return;
          for (const x of bar.querySelectorAll("button")) x.disabled = true;
          await answerCard("level", message, b.dataset.lvl === "yes");
          for (const x of bar.querySelectorAll("button")) x.disabled = false;
        });
      }
    } else {
      const key = { ok: "Accepted", no: "Refused", cancel: "Cancelled", gone: "Gone" }[f.state] ?? "Gone";
      bar.innerHTML = `<span class="sbe-tal-cardstate is-${esc(f.state)}">${esc(L(`SBE.Talents.${key}`, { by: f.by ?? "" }))}</span>`;
    }
    body.appendChild(bar);
  }
}

/** Fiche : « Passer au niveau », « Retirer la demande ». */
export function wireLevelButtons(root, doc) {
  if (!root || !doc) return;
  for (const b of root.querySelectorAll("[data-level-up], [data-level-cancel], [data-level-down], [data-level-history]")) {
    if (b.dataset.lvlWired) continue;
    b.dataset.lvlWired = "1";
    b.addEventListener("click", async (ev) => {
      ev.preventDefault();
      if (b.dataset.levelHistory) { SBELevelHistoryApp.open(doc, b.dataset.levelHistory); return; }
      b.disabled = true;
      try {
        if (b.dataset.levelUp) await LevelManager.levelUp(doc, b.dataset.levelUp);
        else if (b.dataset.levelDown) await LevelManager.levelDown(doc, b.dataset.levelDown);
        else await LevelManager.cancel(doc, b.dataset.levelCancel);
      } finally { b.disabled = false; }
    });
  }
}
