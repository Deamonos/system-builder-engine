/**
 * SBE — UTILISATIONS : annonce dans le chat et TEMPS D'UTILISATION
 *
 * Aucun « consommable » écrit ici : une potion, un bandage, un kit de
 * réparation sont des BOUTONS à étapes du modèle d'objet. Ce module
 * ne fait que deux choses autour d'eux :
 *
 *  1. ANNONCER (case « Annoncer dans le chat » du bouton) : une carte
 *     « utilise » qui dit ce qui a changé (+7 PV, effet posé…).
 *
 *  2. ATTENDRE (étape « Attendre ») : les étapes qui suivent sont mises
 *     de côté sur la fiche du porteur (drapeau `uses`) et jouées par le
 *     MJ principal quand le temps est écoulé — N rounds en combat (à
 *     chaque nouveau round), N minutes hors combat (heure du monde).
 *     « Interrompu si » (formule lue sur le porteur) est vérifié à
 *     chaque round, à chaque minute et à chaque changement de sa fiche.
 *     Bouton « Annuler » sur la carte (propriétaire ou MJ).
 *
 * Tout ce qui demande un choix (cible, objet, fenêtre de jet) se fait
 * AVANT l'attente : la fin se déroule seule, joueur connecté ou non.
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { isPrimaryGM, onSocketMessage, requestGM, notifyUser } from "../../helpers/socket.mjs";
import { docScope } from "../../builder/doc-context.mjs";
import { evalExpression } from "../../builder/formula-engine.mjs";
import { ChatCards } from "../chat/chat-cards.mjs";
import { Identity } from "../../helpers/identity.mjs";
import { ItemEffects } from "../effects/item-effects.mjs";
import { isNewRound } from "../effects/effect-manager.mjs";
import { UndoManager } from "../undo/undo-manager.mjs";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const FLAG = "uses";

function numberOf(raw, scope) {
  const s = String(raw ?? "").trim();
  if (!s) return 0;
  const n = Number.isFinite(Number(s)) ? Number(s) : Number(evalExpression(s, scope));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

const roundTime = () => Number(CONFIG.time?.roundTime) || 6;

/** Le combat (commencé) où figure ce personnage. */
function combatOf(actor) {
  return (game.combats?.contents ?? []).find(c => c.started
    && c.combatants.some(cb => cb.actor?.uuid === actor?.uuid)) ?? null;
}

export class UseManager {

  static init() {
    Hooks.on("updateCombat", (combat, changed) => {
      /* Un vrai nouveau round (revenir en arrière ne décompte pas). */
      if (isNewRound(combat, changed)) this.#tick({ combat });
    });
    Hooks.on("deleteCombat", (combat) => this.#tick({ ended: combat }));
    Hooks.on("updateWorldTime", () => this.#tick({}));
    Hooks.on("updateActor", (actor) => {
      if (actor.getFlag(SYSTEM_ID, FLAG)) this.#tick({ only: actor, check: true });
    });
    Hooks.on("renderChatMessageHTML", (message, html) => {
      try { this.#wire(message, html); }
      catch (err) { console.warn("SBE | Utilisation : câblage de la carte en échec", err); }
    });
    onSocketMessage((p) => {
      if (p?.type === "sbeUseCancel" && isPrimaryGM()) this.cancel(p.actor, p.id, p._from);
    });
    /* L'EFFET d'une utilisation est retiré (croix de l'élément Effets,
       fin de durée, MJ…) : l'utilisation en attente qui l'a posé part
       avec lui, sans laisser de trace — rien ne s'accumule. */
    Hooks.on("deleteActiveEffect", (ae) => {
      if (!isPrimaryGM()) return;
      this.#dropForEffect(ae).catch(err => console.warn("SBE | Utilisation : retrait lié à l'effet en échec", err));
    });
    /* Au chargement : les utilisations restées en attente sont listées
       au MJ, qui peut toutes les annuler d'un coup. */
    Hooks.once("ready", () => {
      if (isPrimaryGM()) this.#offerCleanup().catch(err => console.warn("SBE | Utilisation : examen au chargement en échec", err));
    });
  }

  /** Clés des effets posés par une utilisation (bouton de l'objet). */
  static async #effectKeys(e) {
    if (Array.isArray(e?.effects)) return e.effects;
    /* Anciennes attentes : retrouvées depuis la copie de l'objet. */
    try {
      const { findAction } = await import("../../builder/item-actions.mjs");
      const tmp = new CONFIG.Item.documentClass(foundry.utils.deepClone(e.snap));
      const key = findAction(tmp, e.btn)?.key;
      if (!key) return [];
      return ItemEffects.rulesOf(tmp).filter(r => r.effect && r.when === `button:${key}`).map(r => r.effect);
    } catch (_e) { return []; }
  }

  static async #dropForEffect(ae) {
    const actor = ae.parent;
    if (actor?.documentName !== "Actor") return;
    const key = ae.flags?.[SYSTEM_ID]?.key || [...(ae.statuses ?? [])][0];
    const uses = actor.getFlag(SYSTEM_ID, FLAG) ?? {};
    if (!key || !Object.keys(uses).length) return;
    for (const e of Object.values(uses)) {
      if (!e?.id) continue;
      if ((await this.#effectKeys(e)).includes(key)) await actor.unsetFlag(SYSTEM_ID, `${FLAG}.${e.id}`);
    }
  }

  static async #offerCleanup() {
    const list = [];
    for (const actor of this.#waiting()) {
      for (const e of Object.values(actor.getFlag(SYSTEM_ID, FLAG) ?? {})) if (e?.id) list.push({ actor, e });
    }
    if (!list.length) return;
    const rows = list.slice(0, 12).map(({ actor, e }) => `<li><b>${esc(e.snap?.name ?? "?")}</b> — ${esc(actor.name)}</li>`).join("")
      + (list.length > 12 ? `<li>+${list.length - 12}</li>` : "");
    const res = await foundry.applications.api.DialogV2.wait({
      window: { title: L("SBE.Use.PendingTitle") },
      position: { width: 460 },
      content: `<div class="sbe-propag"><p>${L("SBE.Use.PendingIntro", { n: list.length })}</p>
        <div class="sbe-propag-box"><ul>${rows}</ul></div>
        <p class="notes">${L("SBE.Use.PendingHint")}</p></div>`,
      buttons: [
        { action: "cancel", label: L("SBE.Use.PendingCancel"), icon: "fa-solid fa-ban", default: true },
        { action: "keep", label: L("SBE.Use.PendingKeep"), icon: "fa-solid fa-hourglass-half" }
      ],
      rejectClose: false
    }).catch(() => null);
    if (res !== "cancel") return;
    for (const { actor, e } of list) {
      try { await actor.unsetFlag(SYSTEM_ID, `${FLAG}.${e.id}`); } catch (_e) { /* non modifiable */ }
    }
    ui.notifications.info(L("SBE.Use.PendingDone", { n: list.length }));
  }

  /* ============================================================ */
  /*  Annonce                                                      */
  /* ============================================================ */

  /** Carte « X utilise Y » avec ce qui a changé. */
  static async announce({ item, el, actor, lines = [], rolls = [], name = "", extra = "", whisper = null, flags = null, rollCard = null }) {
    const list = (lines ?? []).filter(Boolean);
    const body = (list.length ? `<ul class="sbe-use-lines">${list.map(l => `<li>${l}</li>`).join("")}</ul>` : "") + extra;
    /* Le JET d'une étape (fabrication…) dans la même carte : le lanceur,
       ses dés et l'issue, puis ce qui en découle. */
    let sides = null, outcome = "", detail = "", messageMode = "";
    if (rollCard?.roll) {
      const roll = Roll.fromData(rollCard.roll);
      const who = rollCard.actor ? await fromUuid(rollCard.actor).catch(() => null) : null;
      sides = [{
        ...(who ? { ref: Identity.refOf(who) } : { img: item?.img || "", name: item?.name || "" }),
        rolls: [roll], adv: rollCard.adv, dropped: (rollCard.dropped ?? []).map(r => Roll.fromData(r)), after: typeof rollCard.mods === "string" ? rollCard.mods
          /* Apports nommés du jet : rendus ici (le jet ne rend que leurs données). */
          : ChatCards.modsHtml(rollCard.mods?.rows ?? [], rollCard.mods ?? {}) + (rollCard.afterHtml ?? ""),
        body: `<div class="sbe-use-rolltitle">${foundry.utils.escapeHTML(rollCard.title ?? "")}</div>`
      }];
      outcome = rollCard.outcome; detail = rollCard.detail; messageMode = rollCard.mode;
    }
    return ChatCards.post({
      type: "use",
      title: name || item?.name || "",
      subtitle: el?.label || el?.key || "",
      body,
      rolls,
      ...(sides ? { sides, sidesFirst: true, outcome, detail, messageMode } : {}),
      speaker: actor ? ChatMessage.getSpeaker({ actor }) : undefined,
      whisper,
      flags
    });
  }

  /* ============================================================ */
  /*  Attente                                                      */
  /* ============================================================ */

  /**
   * Met la suite de côté. @returns {object|null} l'attente, ou null si
   * la durée est nulle (on continue tout de suite).
   */
  static async begin({ item, el, actor, next, st, scope, vars, targets, picked, lines, outcome }) {
    const combat = combatOf(actor);
    const rounds = Math.ceil(numberOf(st.rounds, scope));
    const minutes = numberOf(st.minutes, scope);
    /* En combat : les rounds (à défaut, les minutes en rounds) ;
       hors combat : les minutes (à défaut, les rounds en temps). */
    let wait;
    if (combat && (rounds > 0 || minutes > 0)) {
      wait = { rounds: rounds > 0 ? rounds : Math.max(1, Math.ceil(minutes * 60 / roundTime())), combat: combat.id };
    } else if (minutes > 0 || rounds > 0) {
      const secs = minutes > 0 ? minutes * 60 : rounds * roundTime();
      wait = { until: (game.time?.worldTime ?? 0) + secs };
    } else return null;

    const id = foundry.utils.randomID();
    const entry = {
      id, ...wait,
      item: item.uuid ?? "",
      snap: item.toObject(),
      btn: el.id,
      next,
      vars: { ...foundry.utils.deepClone(vars ?? {}), _rollCard: null },
      targets: (targets ?? []).map(a => a?.uuid).filter(Boolean),
      picked: picked?.uuid ?? "",
      lines: [...(lines ?? [])],
      outcome: outcome ?? null,
      interrupt: String(st.formula ?? "").trim(),
      /* Effets que ce bouton pose : les retirer met fin à l'attente. */
      effects: ItemEffects.rulesOf(item).filter(r => r.effect && r.when === `button:${el.key}`).map(r => r.effect),
      announce: !!el.config?.announce,
      user: game.user.id
    };
    await actor.setFlag(SYSTEM_ID, `${FLAG}.${id}`, entry);

    /* Carte de début : publique si le bouton s'annonce, sinon pour le
       joueur et le MJ — elle porte le bouton « Annuler ». */
    const howLong = wait.rounds ? L("SBE.Use.ForRounds", { n: wait.rounds })
      : L("SBE.Use.ForMinutes", { n: Math.round((wait.until - (game.time?.worldTime ?? 0)) / 6) / 10 });
    const whisper = entry.announce ? null : game.users.filter(u => u.isGM || u.id === game.user.id).map(u => u.id);
    await this.announce({
      item, el, actor, lines: entry.lines, whisper, rollCard: vars?._rollCard ?? null,
      extra: `<p class="sbe-use-wait"><i class="fa-solid fa-hourglass-half"></i> ${esc(L("SBE.Use.Started", { time: howLong }))}</p>
        <button type="button" class="sbe-use-cancel" data-actor="${esc(actor.uuid)}" data-use="${esc(id)}"><i class="fa-solid fa-ban"></i> ${esc(L("SBE.Use.Cancel"))}</button>`,
      flags: { [SYSTEM_ID]: { use: { actor: actor.uuid, id } } }
    });
    ui.notifications.info(L("SBE.Use.Started", { time: howLong }));
    return entry;
  }

  /** Annule une attente (propriétaire, sinon le MJ principal). */
  static async cancel(actorUuid, id, from = null) {
    const actor = await fromUuid(actorUuid).catch(() => null);
    if (!actor?.getFlag(SYSTEM_ID, `${FLAG}.${id}`)) return;
    if (!actor.isOwner) { requestGM({ type: "sbeUseCancel", actor: actorUuid, id }); return; }
    const entry = actor.getFlag(SYSTEM_ID, `${FLAG}.${id}`);
    /* Demande d'un joueur : seulement celui qui a lancé, ou un propriétaire. */
    if (from && from !== game.user.id) {
      const u = game.users.get(from);
      if (!u || (!u.isGM && entry.user !== from && !actor.testUserPermission(u, "OWNER"))) return;
    }
    await actor.unsetFlag(SYSTEM_ID, `${FLAG}.${id}`);
    if (entry.announce) await this.#endCard(actor, entry, L("SBE.Use.Cancelled"));
    else notifyUser(entry.user || game.user.id, "info", "SBE.Use.Cancelled");
  }

  /** Personnages qui ont une attente en cours (fiches et pions non liés). */
  static *#waiting() {
    const seen = new Set();
    const consider = (a) => {
      if (!a || seen.has(a.uuid)) return false;
      seen.add(a.uuid);
      const u = a.flags?.[SYSTEM_ID]?.[FLAG];
      return !!u && Object.keys(u).length > 0;
    };
    for (const a of game.actors ?? []) if (consider(a)) yield a;
    for (const scene of game.scenes ?? []) {
      for (const t of scene.tokens ?? []) {
        if (t.actorLink) continue;
        if (consider(t.actor)) yield t.actor;
      }
    }
  }

  /* Les passages se suivent (jamais deux à la fois, aucun n'est perdu :
     un round et l'heure qui avance arrivent ensemble). */
  static #chain = Promise.resolve();

  /** Fait avancer les attentes (MJ principal seulement). */
  static async #tick({ combat = null, ended = null, only = null, check = false }) {
    if (!isPrimaryGM()) return;
    const run = this.#chain.then(() => this.#tickNow({ combat, ended, only, check }));
    this.#chain = run.catch(() => {});
    return run;
  }

  static async #tickNow({ combat = null, ended = null, only = null, check = false }) {
    try {
      const actors = only ? [only] : [...this.#waiting()];
      const now = game.time?.worldTime ?? 0;
      for (const actor of actors) {
        const uses = foundry.utils.deepClone(actor.getFlag(SYSTEM_ID, FLAG) ?? {});
        for (const e of Object.values(uses)) {
          if (!e?.id) continue;
          /* Interrompu ? */
          if (e.interrupt) {
            let hit = false;
            try { hit = !!evalExpression(e.interrupt, { ...docScope(actor), ...(e.vars ?? {}) }); } catch (_e) { hit = false; }
            if (hit) {
              await actor.unsetFlag(SYSTEM_ID, `${FLAG}.${e.id}`);
              await this.#endCard(actor, e, L("SBE.Use.Interrupted"), true);
              continue;
            }
          }
          if (check) continue;
          let due = false;
          if (e.rounds) {
            /* Combat fini (ou supprimé sans MJ connecté) : les rounds
               restants deviennent du temps. */
            if ((ended && ended.id === e.combat) || (!ended && !game.combats?.get(e.combat))) {
              await actor.setFlag(SYSTEM_ID, `${FLAG}.${e.id}`, { ...e, rounds: 0, combat: "", until: now + e.rounds * roundTime() });
              continue;
            }
            if (combat && combat.id === e.combat) {
              const left = e.rounds - 1;
              if (left > 0) { await actor.setFlag(SYSTEM_ID, `${FLAG}.${e.id}.rounds`, left); continue; }
              due = true;
            }
          } else if (Number.isFinite(Number(e.until)) && now >= Number(e.until)) due = true;
          if (!due) continue;
          await actor.unsetFlag(SYSTEM_ID, `${FLAG}.${e.id}`);
          await this.#finish(actor, e);
        }
      }
    } catch (err) {
      console.warn("SBE | Utilisation : suivi des attentes en échec", err);
    }
  }

  /** Fin de l'attente : les étapes qui restent. */
  static async #finish(actor, e) {
    const { runSteps, findAction } = await import("../../builder/item-actions.mjs");
    /* L'objet a pu être consommé avant l'attente : on le reconstitue
       (copie en mémoire, jamais recréée dans l'inventaire). */
    let item = e.item ? await fromUuid(e.item).catch(() => null) : null;
    if (!item) {
      try { item = new CONFIG.Item.documentClass(e.snap, { parent: actor }); } catch (_e) { item = null; }
    }
    const el = item ? findAction(item, e.btn) : null;
    if (!el) return;
    const back = async (u) => (u ? fromUuid(u).catch(() => null) : null);
    const targets = (await Promise.all((e.targets ?? []).map(back))).filter(Boolean)
      .map(d => (d.documentName === "Token" ? d.actor : d)).filter(Boolean);
    const picked = await back(e.picked);
    /* Objet de scène : celui qui l'utilisait reste le porteur. */
    const { asCarrier } = await import("../../builder/inventory.mjs");
    const go = () => runSteps(item, el, {
      start: e.next, vars: e.vars, targets, picked, lines: e.lines, outcome: e.outcome
    });
    /* La suite d'une attente : une action de l'historique à part. */
    const res = await UndoManager.record({ item, el, actor, label: `${item.name} — ${L("SBE.Undo.Resume")}` },
      () => (item.parent?.type === "prop" ? asCarrier(item, actor, go) : go()));
    if (!res?.ok) return;
    if (res.pending) return;
    /* Les effets de l'objet ont été posés dès l'usage (runAction). */
    if (e.announce) {
      await this.announce({ item, el, actor, lines: res.lines, rolls: res.rolls,
        extra: `<p class="sbe-use-wait"><i class="fa-solid fa-check"></i> ${esc(L("SBE.Use.Done"))}</p>` });
    } else {
      /* Chez celui qui a lancé l'attente (la fin tourne chez le MJ). */
      notifyUser(e.user, "info", "SBE.Use.DoneNamed", { name: e.snap?.name ?? "" });
    }
  }

  /** Carte de fin (annulé, interrompu). */
  static async #endCard(actor, e, text, always = false) {
    if (!e.announce && !always) return;
    const whisper = e.announce ? null : game.users.filter(u => u.isGM || u.id === e.user).map(u => u.id);
    return ChatCards.post({
      type: "use",
      title: e.snap?.name ?? "",
      body: `<p class="sbe-use-wait"><i class="fa-solid fa-ban"></i> ${esc(text)}</p>`,
      speaker: ChatMessage.getSpeaker({ actor }),
      whisper
    });
  }

  /** Bouton « Annuler » : visible tant que l'attente existe. */
  static #wire(message, html) {
    const f = message.flags?.[SYSTEM_ID]?.use;
    const btn = html.querySelector?.(".sbe-use-cancel");
    if (!f || !btn) return;
    let actor = null;
    try { actor = fromUuidSync(f.actor); } catch (_e) { actor = null; }
    const live = !!actor?.getFlag?.(SYSTEM_ID, `${FLAG}.${f.id}`);
    if (!live || !(actor.isOwner || game.user.isGM)) { btn.remove(); return; }
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      btn.disabled = true;
      this.cancel(f.actor, f.id);
    });
  }
}
