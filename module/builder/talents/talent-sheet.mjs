/**
 * SBE — COMPOSANT ARBRE À LA TABLE (fiche, déblocage, validation du MJ)
 *
 * Ce qui est débloqué vit dans la valeur du composant, sur la fiche (ou
 * l'objet) :
 *   values[clé] = {
 *     r:   { idNœud: rang },
 *     p:   { idNœud: { r, u, t, m } }     demandes en attente (MJ)
 *     log: [{ n, r, c, u, t, x }]         historique : nœud (« * » = tout l'arbre),
 *                                         rang atteint, points payés (négatif :
 *                                         rendus), utilisateur, date, et x =
 *                                         "refund" (un rang repris) | "reset"
 *   }
 * Les points se prennent sur une clé de la fiche du PORTEUR (réglage du
 * composant) ; sans clé, le déblocage est gratuit.
 */

import { cleanTree, setTreeStateProvider, treeViewHTML, nodeShape, treeResetVisible, treeStyleVars } from "./talent-tree.mjs";
import { findById, walkElements } from "../element-renderer.mjs";
import { registerContributionSource } from "../contributions.mjs";
import { memoOf } from "../data-revision.mjs";
import { isStackableItem, qtyOf, QUANTITY_KEY, carrierOf } from "../inventory.mjs";
import { docScope } from "../doc-context.mjs";
import { evalExpression } from "../formula-engine.mjs";
import { UndoManager } from "../../managers/undo/undo-manager.mjs";
import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { ChatCards } from "../../managers/chat/chat-cards.mjs";
import { onCardAnswer, answerCard } from "../../helpers/socket.mjs";

const { ApplicationV2 } = foundry.applications.api;
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const FLAG = "talent";
const Del = () => foundry.data.operators.ForcedDeletion.create();

/* ------------------------------------------------------------ */
/*  Lecture                                                      */
/* ------------------------------------------------------------ */

/** L'état d'un arbre sur un document (copie). */
export function treeState(doc, key) {
  const raw = doc?.system?.values?.[key];
  const v = raw && typeof raw === "object" ? raw : {};
  return {
    r: { ...(v.r && typeof v.r === "object" ? v.r : {}) },
    p: { ...(v.p && typeof v.p === "object" ? v.p : {}) },
    log: Array.isArray(v.log) ? [...v.log] : []
  };
}

/** Le composant `elId` du modèle de `doc`. */
export function treeElOf(doc, elId) {
  const el = findById(doc?.system?.template?.system?.elements ?? [], elId);
  return el?.kind === "talents" ? el : null;
}

/**
 * Tout ce qu'il faut savoir d'un arbre sur un document : rangs, et pour
 * chaque nœud ce qu'il manque pour le débloquer.
 */
export function treeContext(doc, el) {
  const tree = cleanTree(el?.config?.tree);
  const st = treeState(doc, el?.key);
  const carrier = carrierOf(doc);
  const pointsKey = String(el?.config?.pointsKey ?? "").trim();
  const who = el?.config?.who ?? "player";
  /* Reprises : nœud par nœud, tout l'arbre, les deux, ou rien (le MJ peut toujours). */
  const refund = el?.config?.refund ?? "none";
  const refundWho = el?.config?.refundWho ?? "player";
  const refundPct = Math.min(100, Math.max(0, Number(el?.config?.refundPct ?? 100)));
  /* À la reprise, l'objet donné et l'effet posé : retirés (défaut) ou gardés. */
  const rewardsBack = el?.config?.rewardsBack === "keep" ? "keep" : "remove";
  let scope = null;
  const scopeOf = () => {
    if (scope) return scope;
    try {
      /* Arbre d'un objet : la fiche du porteur, puis l'objet lui-même. */
      scope = doc.documentName === "Item" && carrier ? { ...docScope(carrier), ...docScope(doc) } : docScope(doc);
    } catch (err) { console.warn("SBE | Arbre : portée en échec", err); scope = {}; }
    return scope;
  };
  const rank = (id) => Math.max(0, Math.floor(Number(st.r[id]) || 0));
  const byId = new Map(tree.nodes.map(n => [n.id, n]));
  const parentsOf = (id) => tree.links.filter(l => l.b === id).map(l => l.a).filter(a => byId.has(a));
  const points = pointsKey ? (Number(carrier?.system?.values?.[pointsKey]) || 0) : null;
  const cache = new Map();

  const info = (n) => {
    if (cache.has(n.id)) return cache.get(n.id);
    const r = rank(n.id);
    const max = r >= n.ranks;
    const parents = parentsOf(n.id);
    const any = n.parents === "any";
    const parentsOk = !parents.length || (any ? parents.some(p => rank(p) > 0) : parents.every(p => rank(p) > 0));
    let condOk = true;
    if (n.cond) condOk = !!evalExpression(n.cond, { ...scopeOf(), rank: r + 1 });
    const takenBy = n.group ? tree.nodes.find(o => o.id !== n.id && o.group === n.group && rank(o.id) > 0) ?? null : null;
    let cost = 0;
    if (!max) {
      const c = Number(n.cost ? evalExpression(n.cost, { ...scopeOf(), rank: r + 1 }) : 1);
      cost = Number.isFinite(c) ? Math.max(0, c) : null;
    }
    const pending = st.p[n.id] ?? null;
    const affordable = cost !== null && (points === null || points >= cost);
    const open = parentsOk && condOk && !takenBy;
    const state = max ? "max" : (r > 0 ? "owned" : (open ? "open" : "locked"));
    const out = { node: n, rank: r, max, parents, any, parentsOk, condOk, takenBy, cost, pending, affordable, open, state,
      canBuy: !max && open && !pending && affordable };
    cache.set(n.id, out);
    return out;
  };
  /* Ce que rend la reprise du dernier rang : ce qu'il a coûté (historique), au pourcentage réglé. */
  const back = (cost) => Math.round((Number(cost) || 0) * refundPct) / 100;
  const childrenOf = (id) => tree.links.filter(l => l.a === id).map(l => l.b).filter(b => byId.has(b));
  /* Un nœud débloqué qui ne tiendrait plus sans celui-ci. */
  const holds = (id) => childrenOf(id).filter(c => {
    if (rank(c) <= 0) return false;
    const cn = byId.get(c);
    if (cn.parents !== "any") return true;
    return !parentsOf(c).some(p => p !== id && rank(p) > 0);
  });
  const refundInfo = (n) => {
    const r = rank(n.id);
    const paid = [...st.log].reverse().find(e => e?.n === n.id && Number(e.r) === r && !e.x);
    const cost = Number(paid?.c) || 0;
    const blocking = r === 1 ? holds(n.id).map(c => byId.get(c)) : [];
    return { rank: r, cost, back: back(cost), blocking, pending: st.p[n.id] ?? null,
      can: r > 0 && !blocking.length && !st.p[n.id] };
  };
  /* Tout l'arbre : ce qui a été payé, moins ce qui a déjà été rendu. */
  const resetBack = () => back(st.log.reduce((t, e) => t + (Number(e?.c) || 0), 0));
  return { doc, el, tree, st, carrier, pointsKey, points, who, refund, refundWho, refundPct, rewardsBack, rank, byId, info, refundInfo, resetBack };
}

/* La fiche dessine l'état de chaque nœud. */
setTreeStateProvider((doc, el) => {
  const ctx = treeContext(doc, el);
  return {
    stateOf: (n) => { const i = ctx.info(n); return i.pending ? `${i.state} is-pending` : i.state; },
    rankOf: (n) => ctx.rank(n.id),
    tipOf: (n) => (n.name || L("SBE.Talents.Unnamed")) + (n.ranks > 1 ? ` (${ctx.rank(n.id)}/${n.ranks})` : ""),
    tools: treeToolsHTML(el, doc)
  };
});

/** Pourquoi on ne peut pas débloquer (ou ""). */
function whyNot(i) {
  if (i.max) return L("SBE.Talents.WhyMax");
  if (i.pending) return L("SBE.Talents.WhyPending");
  if (!i.parentsOk) return L("SBE.Talents.WhyParents");
  if (i.takenBy) return L("SBE.Talents.WhyGroup", { name: i.takenBy.name || L("SBE.Talents.Unnamed") });
  if (!i.condOk) return L("SBE.Talents.WhyCond");
  if (i.cost === null) return L("SBE.Talents.WhyCost");
  if (!i.affordable) return L("SBE.Talents.WhyPoints");
  return "";
}

/** Pourquoi on ne peut pas reprendre un rang (ou ""). */
function whyNotRefund(ri) {
  if (ri.rank <= 0) return L("SBE.Talents.WhyNotOwned");
  if (ri.pending) return L("SBE.Talents.WhyPending");
  if (ri.blocking.length) return L("SBE.Talents.WhyHeld", { names: ri.blocking.map(b => b.name || L("SBE.Talents.Unnamed")).join(", ") });
  return "";
}

/* ------------------------------------------------------------ */
/*  Récompenses                                                  */
/* ------------------------------------------------------------ */

/* Bonus de valeurs : des APPORTS, comptés au calcul (rien n'est écrit) ;
   le survol d'une valeur nomme le nœud. Arbre d'un objet : chaque bonus
   vise le porteur ou l'objet. « rank » = rang débloqué. */
const CONTRIBS = new WeakMap();
function talentContribs(doc) {
  const out = [];
  const add = (d, to) => {
    for (const el of walkElements(d?.system?.template?.system?.elements ?? [])) {
      if (el?.kind !== "talents" || !el.key) continue;
      const st = treeState(d, el.key);
      for (const n of cleanTree(el.config?.tree).nodes) {
        const r = Math.floor(Number(st.r[n.id]) || 0);
        if (r <= 0 || !n.bonus) continue;
        for (const b of n.bonus) {
          if ((d.documentName === "Item" ? b.to : "carrier") !== to) continue;
          out.push({ key: b.key, mode: b.mode, value: b.value.replace(/\brank\b/g, String(r)),
            label: n.name || el.label || el.key, img: n.icon || "", public: false });
        }
      }
    }
  };
  if (doc?.documentName === "Actor") {
    add(doc, "carrier");
    for (const it of doc.items ?? []) add(it, "carrier");
  } else if (doc?.documentName === "Item") add(doc, "item");
  return out;
}
registerContributionSource("talents", (doc) => memoOf(CONTRIBS, doc, () => talentContribs(doc)));

/** Donne les récompenses du rang `rank` qui vient d'être débloqué. */
async function giveRewards(ctx, n, rank) {
  const actor = ctx.carrier?.documentName === "Actor" ? ctx.carrier : null;
  const first = rank === 1;
  if (actor && (n.items?.length || n.effects?.length)) {
    const { QuestManager } = await import("../../managers/quest/quest-manager.mjs");
    const { EffectManager } = await import("../../managers/effects/effect-manager.mjs");
    for (const it of n.items ?? []) {
      if (!it.each && !first) continue;
      const w = game.items?.get(it.id);
      if (w) await QuestManager.giveItem(actor, w, it.qty);
    }
    for (const e of n.effects ?? []) {
      if (first) await EffectManager.act(actor, e.key, "apply", { by: actor.uuid });
      else if (e.each) await EffectManager.act(actor, e.key, "add", { by: actor.uuid });
    }
  }
  if (n.button) {
    const bel = [...walkElements(ctx.doc.system?.template?.system?.elements ?? [])].find(e => e?.kind === "button" && e.key === n.button);
    if (bel) {
      const { runTriggered } = await import("../item-actions.mjs");
      await runTriggered(ctx.doc, bel);
    }
  }
}

/** Reprend les récompenses des rangs `from` → `to` (selon le réglage de l'arbre). */
async function takeRewards(ctx, n, from, to) {
  const actor = ctx.carrier?.documentName === "Actor" ? ctx.carrier : null;
  if (!actor || ctx.rewardsBack === "keep" || from <= to) return;
  const gone = to === 0;
  for (const it of n.items ?? []) {
    const q = it.each ? it.qty * (from - to) : (gone ? it.qty : 0);
    if (q > 0) await takeItems(actor, it.id, q);
  }
  if (!n.effects?.length) return;
  const { EffectManager } = await import("../../managers/effects/effect-manager.mjs");
  for (const e of n.effects) {
    if (gone) await EffectManager.act(actor, e.key, "remove");
    else if (e.each) for (let k = to; k < from; k++) await EffectManager.act(actor, e.key, "sub");
  }
}

/** Retire `qty` exemplaires d'un objet du monde donné au personnage (ce qu'il en reste). */
export async function takeItems(actor, worldId, qty) {
  let left = qty;
  const piles = (actor.items?.contents ?? [...(actor.items ?? [])]).filter(it => it.type === "objet" && it.system?.modelId === worldId);
  for (const p of piles) {
    if (left <= 0) break;
    const q = isStackableItem(p) ? qtyOf(p) : 1;
    const k = Math.min(q, left);
    left -= k;
    if (q - k > 0) await p.update({ [`system.values.${QUANTITY_KEY}`]: q - k });
    else await p.delete();
  }
}

/* Notification du MJ, selon la demande. */
const NOTE = { buy: "SBE.Talents.AskNote", refund: "SBE.Talents.AskRefundNote", reset: "SBE.Talents.AskResetNote" };

/* ------------------------------------------------------------ */
/*  Écriture                                                     */
/* ------------------------------------------------------------ */

export class TalentManager {

  static init() {
    onCardAnswer("talent", (message, yes, by) => this.#answer(message, yes, by));
    Hooks.on("renderChatMessageHTML", (message, html) => {
      try { this.#decorateCard(message, html instanceof HTMLElement ? html : html?.[0]); }
      catch (err) { console.warn("SBE | Arbre : carte en échec", err); }
    });
    /* Le MJ est prévenu d'une demande (en plus de la carte). */
    Hooks.on("createChatMessage", (message) => {
      const f = message.getFlag(SYSTEM_ID, FLAG);
      if (!f || f.state !== "ask" || !game.user.isGM || message.author?.id === game.user.id) return;
      ui.notifications.info(L(NOTE[f.op] ?? NOTE.buy, { user: message.author?.name ?? "?", node: f.nodeName ?? "?" }));
    });
  }

  /**
   * Qui peut faire `op` sur cet arbre : "do" (tout de suite), "ask" (demande au MJ),
   * ou le motif du refus.
   */
  static #may(ctx, op) {
    if (game.user.isGM) return "do";
    if (!ctx.doc.isOwner) return L("SBE.Talents.WhyOwner");
    if (op !== "buy") {
      const want = op === "reset" ? ["tree", "both"] : ["node", "both"];
      if (!want.includes(ctx.refund)) return L(op === "reset" ? "SBE.Talents.WhyNoReset" : "SBE.Talents.WhyNoRefund");
    }
    const who = op === "buy" ? ctx.who : ctx.refundWho;
    if (who === "gm") return L(op === "buy" ? "SBE.Talents.WhyGm" : "SBE.Talents.WhyGmRefund");
    return who === "approve" ? "ask" : "do";
  }

  static #ctxOf(doc, elId) {
    const el = treeElOf(doc, elId);
    return el ? treeContext(doc, el) : null;
  }

  /* Achats et reprises d'un même arbre, un à la fois sur ce poste : un
     double clic (ou une macro) relit l'arbre déjà à jour — jamais deux
     fois le même rang payé. */
  static #chains = new Map();

  static #serial(doc, elId, task) {
    const key = `${doc?.uuid}|${elId}`;
    const run = (this.#chains.get(key) ?? Promise.resolve()).then(task, task);
    const tail = run.catch(() => {});
    this.#chains.set(key, tail);
    tail.then(() => { if (this.#chains.get(key) === tail) this.#chains.delete(key); });
    return run;
  }

  /** Débloque le rang suivant de `nodeId` (ou le demande au MJ). */
  static buy(doc, elId, nodeId) {
    return this.#serial(doc, elId, () => this.#buyNow(doc, elId, nodeId));
  }

  /** Reprend le dernier rang de `nodeId` (points rendus selon le réglage). */
  static refund(doc, elId, nodeId) {
    return this.#serial(doc, elId, () => this.#refundNow(doc, elId, nodeId));
  }

  static async #buyNow(doc, elId, nodeId) {
    const ctx = this.#ctxOf(doc, elId);
    const n = ctx?.byId.get(nodeId);
    if (!n) return false;
    const i = ctx.info(n);
    const why = whyNot(i);
    if (why) { ui.notifications.warn(why); return false; }
    const may = this.#may(ctx, "buy");
    if (may === "do") return this.#applyBuy(ctx, n, i.cost, game.user.id);
    if (may === "ask") return this.#ask(ctx, "buy", n, L("SBE.Talents.AskDetail", { r: i.rank + 1, max: n.ranks, cost: i.cost }));
    ui.notifications.warn(may);
    return false;
  }

  static async #refundNow(doc, elId, nodeId) {
    const ctx = this.#ctxOf(doc, elId);
    const n = ctx?.byId.get(nodeId);
    if (!n) return false;
    const ri = ctx.refundInfo(n);
    const why = whyNotRefund(ri);
    if (why) { ui.notifications.warn(why); return false; }
    const may = this.#may(ctx, "refund");
    if (may === "do") return this.#applyRefund(ctx, n, game.user.id);
    if (may === "ask") return this.#ask(ctx, "refund", n, L("SBE.Talents.AskRefundDetail", { r: ri.rank, back: ri.back }));
    ui.notifications.warn(may);
    return false;
  }

  /** Remet tout l'arbre à zéro (après confirmation). */
  static async reset(doc, elId) {
    const ctx = this.#ctxOf(doc, elId);
    if (!ctx) return false;
    if (ctx.st.p["*"]) { ui.notifications.warn(L("SBE.Talents.WhyPending")); return false; }
    if (!Object.values(ctx.st.r).some(r => Number(r) > 0)) { ui.notifications.info(L("SBE.Talents.NothingToReset")); return false; }
    const may = this.#may(ctx, "reset");
    if (may !== "do" && may !== "ask") { ui.notifications.warn(may); return false; }
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: L("SBE.Talents.ResetTitle") },
      content: `<p>${esc(L("SBE.Talents.ResetConfirm", { tree: ctx.el.label || ctx.el.key, back: ctx.resetBack() }))}</p>`
    }).catch(() => false);
    if (!ok) return false;
    if (may === "do") return this.#applyReset(ctx, game.user.id);
    return this.#ask(ctx, "reset", null, L("SBE.Talents.AskResetDetail", { back: ctx.resetBack() }));
  }

  /** Une écriture de l'arbre (et des points du porteur), annulable. */
  static async #write(ctx, label, ch, delta, after = null) {
    const { doc, el, carrier, pointsKey } = ctx;
    return UndoManager.record({ label: `${el.label || el.key} — ${label}`, actor: carrier, item: doc.documentName === "Item" ? doc : null }, async () => {
      if (pointsKey && delta && carrier) {
        const left = (Number(carrier.system?.values?.[pointsKey]) || 0) + delta;
        if (carrier === doc) ch[`system.values.${pointsKey}`] = left;
        else await carrier.update({ [`system.values.${pointsKey}`]: left });
      }
      await doc.update(ch);
      /* Récompenses : dans la même action (un retour en arrière reprend tout). */
      if (after) {
        try { await after(); } catch (err) { console.warn("SBE | Arbre : récompense en échec", err); }
      }
      return true;
    });
  }

  static async #applyBuy(ctx, n, cost, userId) {
    const st = treeState(ctx.doc, ctx.el.key);
    const r = (Math.floor(Number(st.r[n.id]) || 0)) + 1;
    const k = `system.values.${ctx.el.key}`;
    const ch = { [`${k}.r.${n.id}`]: r, [`${k}.log`]: [...st.log, { n: n.id, r, c: cost, u: userId, t: Date.now() }] };
    if (st.p[n.id]) ch[`${k}.p.${n.id}`] = Del();
    return this.#write(ctx, n.name || L("SBE.Talents.Unnamed"), ch, -cost, () => giveRewards(ctx, n, r));
  }

  static async #applyRefund(ctx, n, userId) {
    const st = treeState(ctx.doc, ctx.el.key);
    const ri = ctx.refundInfo(n);
    const r = ri.rank - 1;
    const k = `system.values.${ctx.el.key}`;
    const ch = { [`${k}.r.${n.id}`]: r > 0 ? r : Del(), [`${k}.log`]: [...st.log, { n: n.id, r, c: -ri.back, u: userId, t: Date.now(), x: "refund" }] };
    if (st.p[n.id]) ch[`${k}.p.${n.id}`] = Del();
    return this.#write(ctx, L("SBE.Talents.RefundLabel", { node: n.name || L("SBE.Talents.Unnamed") }), ch, ri.back,
      () => takeRewards(ctx, n, ri.rank, r));
  }

  static async #applyReset(ctx, userId) {
    const st = treeState(ctx.doc, ctx.el.key);
    const backPts = ctx.resetBack();
    const k = `system.values.${ctx.el.key}`;
    const ch = { [`${k}.r`]: Del(), [`${k}.p`]: Del(), [`${k}.log`]: [...st.log, { n: "*", r: 0, c: -backPts, u: userId, t: Date.now(), x: "reset" }] };
    const owned = ctx.tree.nodes.map(n => [n, ctx.rank(n.id)]).filter(([, r]) => r > 0);
    return this.#write(ctx, L("SBE.Talents.ResetLabel"), ch, backPts, async () => {
      for (const [n, r] of owned) await takeRewards(ctx, n, r, 0);
    });
  }

  /** Demande au MJ : en attente sur la fiche, carte (et notification) chez le MJ. */
  static async #ask(ctx, op, n, detail) {
    const { doc, el, carrier } = ctx;
    const nodeName = n ? (n.name || L("SBE.Talents.Unnamed")) : (el.label || el.key);
    const at = n ? n.id : "*";
    const text = { buy: "SBE.Talents.AskText", refund: "SBE.Talents.AskRefundText", reset: "SBE.Talents.AskResetText" }[op];
    /* La carte commune de SBE : elle suit le thème et les réglages des messages. */
    const msg = await ChatCards.post({
      type: "request",
      icon: n?.icon || "",
      title: nodeName,
      subtitle: el.label || el.key,
      body: `<p>${esc(L(text, { user: game.user.name, node: nodeName, tree: el.label || el.key }))}</p>
        <p class="sbe-card-val">${esc(detail)}</p>`,
      speaker: ChatMessage.getSpeaker({ actor: carrier }),
      whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id),
      flags: { [SYSTEM_ID]: { [FLAG]: { uuid: doc.uuid, el: el.id, node: at, op, nodeName, user: game.user.id, state: "ask" } } }
    });
    await doc.update({ [`system.values.${el.key}.p.${at}`]: { op, u: game.user.id, t: Date.now(), m: msg?.id ?? "" } });
    ui.notifications.info(L("SBE.Talents.Asked"));
    return true;
  }

  /** Le joueur retire sa demande (« * » : celle de tout l'arbre). */
  static async cancel(doc, elId, at) {
    const el = treeElOf(doc, elId);
    if (!el) return;
    const p = treeState(doc, el.key).p[at];
    if (!p) return;
    await doc.update({ [`system.values.${el.key}.p.${at}`]: Del() });
    await this.#close(game.messages.get(p.m), "cancel");
  }

  static async #close(message, state, by = game.user.name) {
    if (!message) return;
    const f = message.getFlag(SYSTEM_ID, FLAG);
    if (!f || f.state !== "ask") return;
    if (!message.isOwner) return;
    await message.setFlag(SYSTEM_ID, FLAG, { ...f, state, by });
  }

  /** Réponse du MJ : les règles sont revues maintenant (la demande ne compte pas). */
  /* Toujours chez le MJ principal, une réponse à la fois (answerCard). */
  static async #answer(message, yes, by) {
    if (!game.user.isGM) return;
    const f = message.getFlag(SYSTEM_ID, FLAG);
    if (!f || f.state !== "ask") return;
    const doc = await fromUuid(f.uuid).catch(() => null);
    const el = doc ? treeElOf(doc, f.el) : null;
    if (!doc || !el) { await this.#close(message, "gone", by); return; }
    const k = `system.values.${el.key}`;
    const st = treeState(doc, el.key);
    if (!yes) {
      if (st.p[f.node]) await doc.update({ [`${k}.p.${f.node}`]: Del() });
      await this.#close(message, "no", by);
      return;
    }
    if (st.p[f.node]) {
      await doc.update({ [`${k}.p.${f.node}`]: Del() });
    }
    const ctx = treeContext(doc, el);
    const op = f.op ?? "buy";
    if (op === "reset") await this.#applyReset(ctx, f.user);
    else {
      const n = ctx.byId.get(f.node);
      if (!n) { await this.#close(message, "gone", by); return; }
      const why = op === "buy" ? whyNot(ctx.info(n)) : whyNotRefund(ctx.refundInfo(n));
      if (why) {
        /* La demande reste en attente : le MJ peut la refuser. */
        await doc.update({ [`${k}.p.${f.node}`]: st.p[f.node] ?? { op, u: f.user, t: Date.now(), m: message.id } });
        ui.notifications.warn(why);
        return;
      }
      if (op === "buy") await this.#applyBuy(ctx, n, ctx.info(n).cost, f.user);
      else await this.#applyRefund(ctx, n, f.user);
    }
    await this.#close(message, "ok", by);
  }

  static #decorateCard(message, root) {
    const f = message.getFlag(SYSTEM_ID, FLAG);
    if (!f || !root) return;
    const body = root.querySelector(".message-content") ?? root;
    body.querySelector(".sbe-tal-cardbar")?.remove();
    const bar = document.createElement("div");
    bar.className = "sbe-tal-cardbar";
    if (f.state === "ask") {
      if (!game.user.isGM) bar.innerHTML = `<span class="notes">${esc(L("SBE.Talents.Waiting"))}</span>`;
      else {
        bar.innerHTML = `<button type="button" data-tal="yes"><i class="fa-solid fa-check"></i> ${esc(L("SBE.Talents.Accept"))}</button>
          <button type="button" data-tal="no"><i class="fa-solid fa-xmark"></i> ${esc(L("SBE.Talents.Refuse"))}</button>`;
        bar.addEventListener("click", async (ev) => {
          const b = ev.target.closest("[data-tal]");
          if (!b) return;
          for (const x of bar.querySelectorAll("button")) x.disabled = true;
          await answerCard("talent", message, b.dataset.tal === "yes");
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

/* ------------------------------------------------------------ */
/*  Fenêtres                                                     */
/* ------------------------------------------------------------ */

/** Ré-affiche une fenêtre quand son document ou son porteur change. */
function watchDocs(app) {
  const ids = [];
  const hit = (d) => d === app.doc || d === app.doc?.parent || (d?.documentName === "Item" && d.parent === app.doc);
  for (const name of ["updateActor", "updateItem"]) {
    ids.push([name, Hooks.on(name, (d) => { if (hit(d) && app.rendered) app.render(); })]);
  }
  return () => { for (const [n, id] of ids) Hooks.off(n, id); };
}

/** La fiche d'un nœud : détail, ce qu'il manque, et le bouton. */
export class SBETalentNodeApp extends ApplicationV2 {

  static #open = new Map();

  static open(doc, elId, nodeId, ev = null) {
    const k = `${doc.uuid}|${elId}`;
    let app = this.#open.get(k);
    if (!app?.rendered) {
      const pos = ev ? { left: Math.max(0, ev.clientX + 16), top: Math.max(0, ev.clientY - 60) } : {};
      app = new SBETalentNodeApp({ doc, elId, id: `sbe-tal-node-${doc.id}-${elId}`, position: { width: 340, height: "auto", ...pos } });
      this.#open.set(k, app);
    }
    const shown = app.rendered;
    app.nodeId = nodeId;
    app.render({ force: true });
    /* Déjà ouverte : elle revient devant (une fenêtre neuve y est déjà). */
    if (shown) app.bringToFront?.();
    return app;
  }

  constructor(options = {}) {
    super(options);
    this.doc = options.doc;
    this.elId = options.elId;
    this.nodeId = null;
  }

  static DEFAULT_OPTIONS = {
    tag: "div",
    classes: ["sbe-tal-nodeapp"],
    window: { title: "SBE.Talents.Node", icon: "fa-solid fa-circle-nodes", resizable: false }
  };

  #unwatch = null;

  get title() {
    const el = treeElOf(this.doc, this.elId);
    return el?.label || L("SBE.Talents.Tree");
  }

  async _renderHTML() {
    const el = treeElOf(this.doc, this.elId);
    if (!el) return `<p class="notes">${esc(L("SBE.Talents.Missing"))}</p>`;
    const ctx = treeContext(this.doc, el);
    const n = ctx.byId.get(this.nodeId);
    if (!n) return `<p class="notes">${esc(L("SBE.Talents.Missing"))}</p>`;
    const i = ctx.info(n);
    const nm = (id) => ctx.byId.get(id)?.name || L("SBE.Talents.Unnamed");
    const ok = (b) => `<i class="fa-solid ${b ? "fa-check is-ok" : "fa-xmark is-no"}"></i>`;
    const reqs = [];
    if (i.parents.length) {
      reqs.push(`<li>${ok(i.parentsOk)} ${esc(L(i.any ? "SBE.Talents.ReqAny" : "SBE.Talents.ReqAll"))}
        ${i.parents.map(p => `<span class="sbe-tal-chip ${ctx.rank(p) > 0 ? "is-ok" : ""}">${esc(nm(p))}</span>`).join(" ")}</li>`);
    }
    if (n.cond) reqs.push(`<li>${ok(i.condOk)} ${esc(L("SBE.Talents.ReqCond"))}</li>`);
    if (n.group) reqs.push(`<li>${ok(!i.takenBy)} ${esc(i.takenBy ? L("SBE.Talents.ReqGroupTaken", { name: i.takenBy.name || L("SBE.Talents.Unnamed") }) : L("SBE.Talents.ReqGroup"))}</li>`);
    const cost = i.max ? "" : (i.cost === null ? L("SBE.Talents.WhyCost")
      : (ctx.pointsKey ? L("SBE.Talents.CostLine", { cost: i.cost, have: ctx.points }) : L("SBE.Talents.Free")));
    const users = (id) => game.users.get(id)?.name ?? "?";
    const date = (t) => { try { return new Date(t).toLocaleString(game.i18n.lang, { dateStyle: "short", timeStyle: "short" }); } catch (_e) { return ""; } };
    const log = ctx.st.log.filter(e => e?.n === n.id).reverse().map(e => {
      const line = e.x === "refund"
        ? L("SBE.Talents.LogRefund", { r: e.r, back: Math.abs(Number(e.c) || 0), user: users(e.u) })
        : L("SBE.Talents.LogLine", { r: e.r, cost: Number(e.c) || 0, user: users(e.u) });
      return `<li class="${e.x ? "is-back" : ""}">${esc(line)} <small>${esc(date(e.t))}</small></li>`;
    }).join("");
    const can = game.user.isGM || this.doc.isOwner;
    let btn = "";
    if (can && !i.max) {
      if (i.pending) {
        btn = `<p class="sbe-tal-pending"><i class="fa-solid fa-hourglass-half"></i> ${esc(L("SBE.Talents.WhyPending"))}</p>
          ${this.doc.isOwner ? `<button type="button" data-act="cancel"><i class="fa-solid fa-xmark"></i> ${esc(L("SBE.Talents.CancelAsk"))}</button>` : ""}`;
      } else if (!game.user.isGM && ctx.who === "gm") {
        btn = `<p class="notes">${esc(L("SBE.Talents.WhyGm"))}</p>`;
      } else {
        const why = whyNot(i);
        const ask = !game.user.isGM && ctx.who === "approve";
        const lbl = ask ? "SBE.Talents.AskBtn" : (i.rank > 0 ? "SBE.Talents.RankUp" : "SBE.Talents.Unlock");
        btn = `<button type="button" data-act="buy" ${why ? `disabled data-tooltip-text="${esc(why)}"` : ""}>
          <i class="fa-solid ${ask ? "fa-paper-plane" : "fa-lock-open"}"></i> ${esc(L(lbl, { r: i.rank + 1 }))}</button>
          ${why ? `<p class="notes">${esc(why)}</p>` : ""}`;
      }
    }
    /* Reprendre un rang : selon le réglage de l'arbre (le MJ peut toujours). */
    let back = "";
    const ri = ctx.refundInfo(n);
    const mayBack = game.user.isGM || (this.doc.isOwner && ["node", "both"].includes(ctx.refund) && ctx.refundWho !== "gm");
    if (mayBack && ri.rank > 0 && !i.pending) {
      const why = whyNotRefund(ri);
      const ask = !game.user.isGM && ctx.refundWho === "approve";
      const pts = ctx.pointsKey && ri.back ? ` (+${ri.back})` : "";
      back = `<button type="button" data-act="refund" ${why ? `disabled data-tooltip-text="${esc(why)}"` : ""}>
        <i class="fa-solid ${ask ? "fa-paper-plane" : "fa-rotate-left"}"></i> ${esc(L(ask ? "SBE.Talents.AskRefundBtn" : (ri.rank > 1 ? "SBE.Talents.RefundRank" : "SBE.Talents.RefundNode")))}${esc(pts)}</button>
        ${why ? `<p class="notes">${esc(why)}</p>` : ""}`;
    }
    /* Ce que donne le nœud (bonus en formule : « rank » = rang). */
    const SYM = { add: "+", multiply: "×", upgrade: "≥", downgrade: "≤", override: "=" };
    const gives = [
      ...(n.bonus ?? []).map(b => `<li><i class="fa-solid fa-chart-line"></i> ${esc(b.key)} ${esc(SYM[b.mode] ?? "+")} ${esc(b.value)}</li>`),
      ...(n.items ?? []).map(it => { const w = game.items?.get(it.id); return w ? `<li><img src="${esc(w.img)}" alt=""> ${esc(w.name)} ×${it.qty}${it.each ? ` <small>(${esc(L("SBE.Talents.Each"))})</small>` : ""}</li>` : ""; }),
      ...(n.effects ?? []).map(e => `<li><i class="fa-solid fa-wand-sparkles"></i> ${esc(e.key)}${e.each ? ` <small>(${esc(L("SBE.Talents.EachStack"))})</small>` : ""}</li>`)
    ].filter(Boolean).join("");
    const face = n.icon ? `<img src="${esc(n.icon)}" alt="">` : `<i class="fa-solid fa-star"></i>`;
    return `<div class="sbe-tal-nodecard" style="${esc(treeStyleVars(ctx.tree))}">
      <header>
        <div class="sbe-tal-node is-${nodeShape(ctx.tree, n)} is-${i.state}" style="--tal-s:56px"><span class="sbe-tal-face"><span class="sbe-tal-in">${face}</span></span></div>
        <div><h3>${esc(n.name || L("SBE.Talents.Unnamed"))}</h3>
          <span class="notes">${esc(L(`SBE.Talents.State_${i.state}`))}${n.ranks > 1 ? ` · ${esc(L("SBE.Talents.RankOf", { r: i.rank, max: n.ranks }))}` : ""}</span></div>
      </header>
      ${n.desc ? `<p class="sbe-tal-desc">${esc(n.desc).replace(/\n/g, "<br>")}</p>` : ""}
      ${gives ? `<h4>${esc(L("SBE.Talents.Gives"))}</h4><ul class="sbe-tal-gives">${gives}</ul>` : ""}
      ${reqs.length ? `<h4>${esc(L("SBE.Talents.Reqs"))}</h4><ul class="sbe-tal-reqs">${reqs.join("")}</ul>` : ""}
      ${cost ? `<p class="sbe-tal-cost"><i class="fa-solid fa-coins"></i> ${esc(cost)}</p>` : ""}
      ${btn}
      ${back}
      ${log ? `<h4>${esc(L("SBE.Talents.History"))}</h4><ul class="sbe-tal-log">${log}</ul>` : ""}
    </div>`;
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
    content.querySelector('[data-act="buy"]')?.addEventListener("click", async (ev) => {
      ev.currentTarget.disabled = true;
      await TalentManager.buy(this.doc, this.elId, this.nodeId);
    });
    content.querySelector('[data-act="refund"]')?.addEventListener("click", async (ev) => {
      ev.currentTarget.disabled = true;
      await TalentManager.refund(this.doc, this.elId, this.nodeId);
    });
    content.querySelector('[data-act="cancel"]')?.addEventListener("click", () => TalentManager.cancel(this.doc, this.elId, this.nodeId));
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    this.#unwatch ??= watchDocs(this);
  }

  async _onClose(options) {
    this.#unwatch?.(); this.#unwatch = null;
    SBETalentNodeApp.#open.delete(`${this.doc?.uuid}|${this.elId}`);
    return super._onClose?.(options);
  }
}

/** L'arbre en grande fenêtre (réglage « Bouton qui ouvre une fenêtre »). */
export class SBETalentWindow extends ApplicationV2 {

  static #open = new Map();

  static open(doc, elId) {
    const k = `${doc.uuid}|${elId}`;
    const cur = this.#open.get(k);
    if (cur?.rendered) { cur.bringToFront?.(); return cur; }
    const app = new SBETalentWindow({ doc, elId, id: `sbe-tal-win-${doc.id}-${elId}` });
    this.#open.set(k, app);
    app.render({ force: true });
    return app;
  }

  constructor(options = {}) {
    super(options);
    this.doc = options.doc;
    this.elId = options.elId;
  }

  static DEFAULT_OPTIONS = {
    tag: "div",
    classes: ["sbe-tal-window"],
    window: { title: "SBE.Talents.Tree", icon: "fa-solid fa-sitemap", resizable: true },
    position: { width: 900, height: 680 }
  };

  #unwatch = null;

  get title() {
    const el = treeElOf(this.doc, this.elId);
    return `${el?.label || L("SBE.Talents.Tree")} — ${this.doc?.name ?? ""}`;
  }

  async _renderHTML() {
    const el = treeElOf(this.doc, this.elId);
    if (!el) return `<p class="notes">${esc(L("SBE.Talents.Missing"))}</p>`;
    return treeViewHTML(el, { doc: this.doc, fill: true });
  }

  _replaceHTML(result, content) {
    const view = content.querySelector("[data-tal-view]");
    const keep = view ? { l: view.scrollLeft, t: view.scrollTop } : null;
    content.innerHTML = result;
    const fresh = content.querySelector("[data-tal-view]");
    if (fresh && keep) { fresh.scrollLeft = keep.l; fresh.scrollTop = keep.t; }
    wireTalentViews(content, this.doc);
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    this.#unwatch ??= watchDocs(this);
  }

  async _onClose(options) {
    this.#unwatch?.(); this.#unwatch = null;
    SBETalentWindow.#open.delete(`${this.doc?.uuid}|${this.elId}`);
    return super._onClose?.(options);
  }
}

/* Zoom et position de chaque arbre affiché (gardés d'un affichage à l'autre). */
const VIEWS = new Map();
const ZMIN = 0.2, ZMAX = 2.5;

/** Zoom (boutons, Ctrl + molette) et déplacement (glisser le fond) d'un arbre. */
function wireZoom(view, key) {
  const stage = view.querySelector(".sbe-tal-stage");
  const bar = view.parentElement?.querySelector(".sbe-tal-zoombar");
  if (!stage) return;
  const mem = VIEWS.get(key) ?? { z: 1, l: 0, t: 0 };
  VIEWS.set(key, mem);
  const show = () => { const v = bar?.querySelector("[data-tal-zoomval]"); if (v) v.textContent = `${Math.round(mem.z * 100)} %`; };
  const setZoom = (z, ax = view.clientWidth / 2, ay = view.clientHeight / 2) => {
    const old = mem.z;
    mem.z = Math.min(ZMAX, Math.max(ZMIN, z));
    const px = (view.scrollLeft + ax) / old, py = (view.scrollTop + ay) / old;
    stage.style.zoom = String(mem.z);
    view.scrollLeft = px * mem.z - ax;
    view.scrollTop = py * mem.z - ay;
    show();
  };
  stage.style.zoom = String(mem.z);
  view.scrollLeft = mem.l;
  view.scrollTop = mem.t;
  show();
  view.addEventListener("scroll", () => { mem.l = view.scrollLeft; mem.t = view.scrollTop; }, { passive: true });
  view.addEventListener("wheel", (ev) => {
    if (!ev.ctrlKey) return;
    ev.preventDefault();
    const r = view.getBoundingClientRect();
    setZoom(mem.z * (ev.deltaY < 0 ? 1.15 : 1 / 1.15), ev.clientX - r.left, ev.clientY - r.top);
  }, { passive: false });
  bar?.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-tal-zoom]");
    if (!b) return;
    ev.preventDefault();
    if (b.dataset.talZoom === "in") setZoom(mem.z * 1.25);
    else if (b.dataset.talZoom === "out") setZoom(mem.z / 1.25);
    else {
      /* Tout l'arbre dans la zone. */
      const w = parseFloat(stage.style.width) || 1, h = parseFloat(stage.style.height) || 1;
      setZoom(Math.min(ZMAX, (view.clientWidth - 4) / w, (view.clientHeight - 4) / h));
      view.scrollLeft = 0; view.scrollTop = 0;
    }
  });
  /* Glisser le fond déplace la vue (un nœud, lui, s'ouvre au clic). */
  view.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0 || ev.target.closest(".sbe-tal-node")) return;
    const sx = ev.clientX, sy = ev.clientY, sl = view.scrollLeft, st = view.scrollTop;
    view.classList.add("is-panning");
    const move = (e) => { view.scrollLeft = sl - (e.clientX - sx); view.scrollTop = st - (e.clientY - sy); };
    const up = () => {
      view.classList.remove("is-panning");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  });
}

/**
 * Les outils au-dessus d'un arbre (fiche, fenêtre) : « Réinitialiser » si le
 * réglage le permet à cet utilisateur ; demande en attente = la retirer.
 */
export function treeToolsHTML(el, doc) {
  if (!doc || !treeResetVisible(el, game.user.isGM, doc.isOwner)) return "";
  const pending = !!treeState(doc, el.key).p["*"];
  const ask = !game.user.isGM && (el.config?.refundWho ?? "player") === "approve";
  const lbl = pending ? "SBE.Talents.CancelAsk" : (ask ? "SBE.Talents.AskResetBtn" : "SBE.Talents.Reset");
  return `<div class="sbe-tal-tools"><button type="button" class="sbe-tal-resetbtn" data-tal-reset="${esc(el.id)}"${pending ? ` data-pending="1"` : ""}>
    <i class="fa-solid ${pending ? "fa-xmark" : "fa-rotate-left"}"></i> ${esc(L(lbl))}</button></div>`;
}

/** Fiche : un clic sur un nœud ouvre sa fiche ; le bouton ouvre la fenêtre. */
export function wireTalentViews(root, doc) {
  if (!root || !doc) return;
  for (const view of root.querySelectorAll("[data-tal-el]")) {
    if (view.dataset.talWired) continue;
    view.dataset.talWired = "1";
    view.addEventListener("click", (ev) => {
      const node = ev.target.closest(".sbe-tal-node");
      if (node) SBETalentNodeApp.open(doc, view.dataset.talEl, node.dataset.node, ev);
    });
    wireZoom(view, `${doc.uuid}|${view.dataset.talEl}`);
  }
  for (const b of root.querySelectorAll("[data-tal-reset]")) {
    if (b.dataset.talWired) continue;
    b.dataset.talWired = "1";
    b.addEventListener("click", (ev) => {
      ev.preventDefault();
      if (b.dataset.pending) TalentManager.cancel(doc, b.dataset.talReset, "*");
      else TalentManager.reset(doc, b.dataset.talReset);
    });
  }
  for (const b of root.querySelectorAll("[data-tal-open]")) {
    if (b.dataset.talWired) continue;
    b.dataset.talWired = "1";
    b.addEventListener("click", (ev) => { ev.preventDefault(); SBETalentWindow.open(doc, b.dataset.talOpen); });
  }
}
