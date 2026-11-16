/**
 * SBE — ACTIONS D'OBJET : une seule source, un seul exécuteur
 *
 * Les BOUTONS posés sur le modèle d'un objet SONT ses actions. Aucun
 * autre endroit n'en définit : ni le menu contextuel de l'inventaire,
 * ni le futur HUD, ni rien d'autre. Ils se contentent de demander
 * `actionsOf(objet)` et d'afficher ce qu'on leur rend.
 *
 * Et quel que soit l'endroit où l'on clique — fiche de l'objet, clic
 * droit dans l'inventaire, HUD — c'est `runAction()` qui s'exécute :
 * mêmes étapes, même jet, même consommation, mêmes sons. Une action
 * ne peut donc jamais se comporter différemment selon l'endroit.
 *
 * DISPONIBILITÉ : une action impossible n'est pas cachée, elle est
 * GRISÉE avec sa raison (« plus de charges », plus tard « l'arme est
 * enrayée ») — le joueur comprend, au lieu de chercher.
 *
 * Case « Proposer hors de la fiche (inventaire, HUD) » sur chaque
 * bouton : COCHÉE par défaut. On ne la décoche que pour les boutons
 * internes à la fiche.
 */

import { walkElements, buttonCharges, slotAccepts, capacityOf, refIds, valueBounds, isRefList, btnIconHTML } from "./element-renderer.mjs";
import { cfCell, cfGrid } from "../helpers/compact-form.mjs";
import { docScope } from "./doc-context.mjs";
import { buildScope, evalExpression, formulaValue } from "./formula-engine.mjs";
import {
  buildInventory, qtyOf, isStackableItem, canMerge, carrierOf, dropIntoContainer, QUANTITY_KEY, asCarrier, asCarrierSync, itemsAround,
  isVirtualItem, worldRootOf, dropIntoWorld, acceptsStacks
} from "./inventory.mjs";
import { rollField } from "./field-roll.mjs";
import { OrphanCleanup } from "../managers/cleanup/orphan-cleanup.mjs";
import { EffectManager } from "../managers/effects/effect-manager.mjs";
import { ItemEffects } from "../managers/effects/item-effects.mjs";
import { EffectEngine } from "../managers/effects/effect-engine.mjs";
import { CombatManager } from "../managers/combat/combat-manager.mjs";
import { requestGM, requestDeltas } from "../helpers/socket.mjs";
import { Identity } from "../helpers/identity.mjs";
import { MediaManager, mediaDefsOf } from "../managers/media/media-manager.mjs";
import { UseManager } from "../managers/use/use-manager.mjs";
import { GroundItems } from "../managers/ground/ground-items.mjs";
import { PropManager } from "../managers/props/prop-manager.mjs";
import { PersistentZones } from "../managers/zones/persistent-zones.mjs";
import { TrapManager } from "../managers/traps/trap-manager.mjs";
import { askUser, defaultAnswers, parseChoices } from "../helpers/ask-dialog.mjs";
import { touchesBy } from "../helpers/canvas-utils.mjs";
import { compileSteps, OUTCOME_BRANCH } from "./step-blocks.mjs";
import { UndoManager } from "../managers/undo/undo-manager.mjs";

/** Le bouton est-il proposé hors de la fiche ? (oui par défaut) */
export function isOfferedOutside(el) {
  return el?.config?.showInCtx !== false;
}

/** Les boutons d'un modèle, hors sous-boutons d'un bouton-menu. */
function topButtons(tplEls) {
  const nested = new Set();
  for (const el of walkElements(tplEls ?? [])) {
    if (el?.kind === "button" && el.config?.action === "menu") {
      for (const c of el.children ?? []) if (c?.id) nested.add(c.id);
    }
  }
  return [...walkElements(tplEls ?? [])]
    .filter(el => el?.kind === "button" && !nested.has(el.id));
}

/**
 * L'objet choisi se lit dans les étapes suivantes : pickedName, et ses
 * champs préfixés « picked_ » (picked_etat, picked_usure…). Une liste de
 * références (ingrédient, résultat) donne ses ids d'objets du monde.
 */
export function pickedVarsOf(it) {
  const out = { pickedName: it?.name ?? "" };
  for (const [k, v] of Object.entries(itemScope(it))) {
    if (!/^[a-z][a-z0-9_]*$/.test(k)) continue;
    if (["number", "string", "boolean"].includes(typeof v)) out[`picked_${k}`] = v;
    else if (Array.isArray(v) && v.every(x => typeof x === "string")) out[`picked_${k}`] = [...v];
  }
  return out;
}

/** Un bouton par son identifiant, dans le modèle de l'objet. */
export function findAction(item, btnId) {
  const tpl = item?.system?.template;
  return [...walkElements(tpl?.system?.elements ?? [])].find(e => e?.id === btnId) ?? null;
}

/**
 * APRÈS LE DÉPÔT dans un slot : proposer un bouton de l'objet déposé
 * (réglage du slot ; « Recharger » une arme qu'on vient de poser dans
 * un piège).
 *  - porté par un acteur : le bouton lui-même, s'il est possible (les
 *    munitions compatibles du porteur) ;
 *  - dans un objet du monde : pour chaque contenant de l'objet déposé,
 *    on choisit un objet du monde et sa quantité, rangés avec lui.
 */
export async function offerAfterDrop(sheetDoc, el) {
  const btnKey = String(el?.config?.afterDrop ?? "").trim();
  if (!btnKey || el.kind !== "slot") return;
  const entry = (buildInventory(sheetDoc).byKey?.[el.key] ?? [])[0];
  const held = entry ? itemsAround(sheetDoc).find(i => i.id === entry.id) : null;
  if (!held) return;
  const btn = [...walkElements(held.system?.template?.system?.elements ?? [])]
    .find(e => e?.kind === "button" && e.key === btnKey);
  if (!btn) return;
  const label = btn.label || btnKey;
  if (isVirtualItem(held)) return fillWorldContent(held, label);
  if (unavailableReason(held, btn)) return;
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: held.name },
    content: `<p>${game.i18n.format("SBE.Inv.AfterDropAsk", {
      button: foundry.utils.escapeHTML(label), name: foundry.utils.escapeHTML(held.name)
    })}</p>`,
    rejectClose: false
  }).catch(() => false);
  if (ok) await runAction(held, btn.id);
}

/** Objet du contenu d'un objet du monde : on remplit ses contenants. */
async function fillWorldContent(held, label) {
  const L = (k) => game.i18n.localize(k);
  const esc = (x) => foundry.utils.escapeHTML(String(x ?? ""));
  const root = worldRootOf(held);
  if (!root) return;
  const scope = docScope(held);
  const rows = [];
  for (const e of walkElements(held.system?.template?.system?.elements ?? [])) {
    const box = (e?.kind === "slot" && e.config?.mode !== "reference") || (e?.kind === "container" && !isRefList(e));
    if (!box || !e.key) continue;
    const cands = game.items.filter(w => w.type === "objet" && !slotAccepts(e, w, held))
      .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
    if (cands.length) rows.push({ e, cands, cap: Number(capacityOf(e, scope)) || 1 });
  }
  if (!rows.length) return;
  const content = `<p class="notes">${game.i18n.format("SBE.Inv.AfterDropFill", { name: esc(held.name) })}</p>`
    + rows.map((r, i) => cfGrid([
      cfCell(r.e.label || r.e.key, `<select name="c${i}"><option value="">${L("SBE.Inv.AfterDropNone")}</option>${
        r.cands.map(w => `<option value="${esc(w.id)}">${esc(w.name)}</option>`).join("")}</select>`),
      cfCell(L("SBE.Inv.AfterDropQty"), `<input type="number" name="q${i}" value="${r.cap}" min="1" step="1">`)
    ])).join("");
  const picks = await foundry.applications.api.DialogV2.wait({
    window: { title: `${label} : ${held.name}` },
    classes: ["sbe-condense"],
    position: { width: 460 },
    content,
    buttons: [
      { action: "ok", label: label, icon: "fa-solid fa-check", default: true,
        callback: (_ev, _btn, dialog) => rows.map((r, i) => ({
          r, id: dialog.element.querySelector(`[name="c${i}"]`)?.value ?? "",
          qty: Number(dialog.element.querySelector(`[name="q${i}"]`)?.value) || 1
        })) },
      { action: "cancel", label: L("SBE.Common.Cancel"), icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  }).catch(() => null);
  if (!Array.isArray(picks)) return;
  for (const p of picks) {
    const w = p.id ? game.items.get(p.id) : null;
    if (w) await dropIntoWorld({ sheetDoc: root, el: p.r.e, item: w, quantity: p.qty, hostRef: held.id, hostDoc: held });
  }
}

/**
 * Pourquoi cette action est-elle impossible en ce moment ?
 * @returns {string} "" si elle est disponible
 */
export function unavailableReason(item, el) {
  const c = el?.config ?? {};
  /* « Utilisable » : dans l'inventaire, une fois posé, les deux, ou
     selon que l'objet est déployable. */
  const where = PropManager.whereReason(item, el);
  if (where) return where;
  if (c.action === "steps") {
    /* Ce qui dit d'avance si le bouton est possible (la première raison
       trouvée est affichée) : ses CONDITIONS ; un « Choisir un objet »
       sans rien à choisir ; un slot vide ou dont le bouton est
       impossible ; l'état d'un piège. */
    const scope = itemScope(item);
    /* Ces trois-là seulement avant un jet, une attaque, une cible ou un
       choix (ensuite, les formules lisent des valeurs encore inconnues),
       et pas sur une étape « Seulement si ». */
    let later = false;
    for (const st of stepsOf(el)) {
      /* Un bloc : la suite dépend de lui, on ne sait pas d'avance. */
      if (st.type.startsWith("_") || st._inBlock) break;
      if (st.type === "condition") {
        if (!conditionHolds(st, scope)) return String(st.message ?? "").trim() || game.i18n.localize("SBE.Steps.Impossible");
        continue;
      }
      const sets = ["roll", "attack", "target", "pick", "useslot"].includes(st.type);
      if (later || String(st.onlyIf ?? "").trim()) { later ||= sets; continue; }
      later = sets;
      if (st.type === "pick") {
        if (!pickCandidates(item, st, scope, {}, { first: true }).length) return String(st.message ?? "").trim() || game.i18n.localize("SBE.Steps.NothingToPick");
      } else if (st.type === "useslot") {
        const why = useSlotReason(item, st);
        if (why) return why;
      } else if (st.type === "scene" && st.action === "trap") {
        const why = TrapManager.opReason(item, st.op);
        if (why) return why;
      }
    }
    return "";
  }
  if (c.action === "menu") {
    const kids = (el.children ?? []).filter(b => b?.kind === "button");
    return kids.length ? "" : game.i18n.localize("SBE.Button.MenuEmpty");
  }
  const charges = buttonCharges(el, item?.system?.values ?? {});
  if (charges !== null && charges <= 0 && (c.onZero ?? "none") === "none") {
    return game.i18n.localize("SBE.Actions.NoCharges");
  }
  return "";
}

/**
 * LES actions d'un objet, telles que les affichent le menu de
 * l'inventaire et (plus tard) le HUD.
 * @param {Item} item
 * @param {object} [opts]
 * @param {boolean} [opts.outside=true]  seulement celles proposées hors de la fiche
 * @returns {Array<{id, label, icon, el, disabled, reason}>}
 */
export function actionsOf(item, { outside = true } = {}) {
  const els = topButtons(item?.system?.template?.system?.elements ?? []);
  const scope = els.some(el => String(el.visibleIf ?? "").trim()) ? itemScope(item) : null;
  return els
    .filter(el => !outside || isOfferedOutside(el))
    .filter(el => game.user.isGM || el.playerVisible !== false)
    /* « Visible si » : un bouton masqué sur la fiche l'est aussi dans
       le menu et le HUD (Désenrayer n'apparaît que sur une arme enrayée). */
    .filter(el => !String(el.visibleIf ?? "").trim() || !!evalExpression(el.visibleIf, scope))
    .map(el => {
      const reason = unavailableReason(item, el);
      return {
        id: el.id,
        label: el.label || el.key,
        icon: el.config?.icon ?? "",
        el,
        disabled: !!reason,
        reason
      };
    });
}

/* ============================================================ */
/*  L'EXÉCUTEUR                                                  */
/* ============================================================ */

/* UN SEUL USAGE À LA FOIS (par client) : pendant une visée, une
   fenêtre de jet ou de choix, un second clic est ignoré — pas de
   grenade lancée par-dessus une autre. */
let busy = false;

/**
 * Exécute une action d'objet, d'où qu'on l'appelle.
 * @param preset  départ imposé des étapes (objet glissé sur un objet posé :
 *                { picked, vars }) — même forme qu'une reprise.
 */
export async function runAction(item, btnId, preset = null) {
  const el = findAction(item, btnId);
  if (!el) return;
  const reason = unavailableReason(item, el);
  if (reason) { ui.notifications.warn(reason); return; }
  const c = el.config ?? {};
  if (c.action === "menu") return openActionMenu(item, el);
  if (busy) { ui.notifications.warn(game.i18n.localize("SBE.Use.Busy")); return; }
  busy = true;
  try {
    return await runButton(item, el, preset);
  } finally {
    busy = false;
  }
}

/**
 * Bouton lancé TOUT SEUL (déclencheurs d'actions) : sans le verrou d'un
 * clic (plusieurs peuvent partir à la suite), mêmes étapes que le clic.
 */
export async function runTriggered(doc, el, preset = null) {
  return runButton(doc, el, preset);
}

/** Un bouton = UNE action de l'historique (retour en arrière) — sans le
    verrou « un seul à la fois » (déjà pris par le bouton qui l'appelle :
    « Utiliser l'objet d'un slot »). */
async function runButton(item, el, preset = null) {
  return UndoManager.record({ item, el, actor: carrierOf(item) }, () => runButtonNow(item, el, preset));
}

async function runButtonNow(item, el, preset = null) {
  const c = el.config ?? {};
  const carrier = carrierOf(item);
  /* Effets PROPRES à l'objet (onglet Effets) : après un usage réussi
     du bouton, selon l'issue de son jet. */
  if (c.action === "steps") {
    const res = await runSteps(item, el, preset);
    if (!res?.ok) return res;
    /* Les effets de l'objet sont posés DÈS l'usage (leur durée part
       de là), même si une attente retient la suite des étapes. */
    await ItemEffects.fire(item, el.key, res.outcome);
    /* Zone persistante posée par CE bouton (onglet Zone de l'objet). */
    await PersistentZones.afterButton(item, el.key, res);
    if (res.pending) return res;            /* la suite viendra à la fin de l'attente */
    if (c.announce) await UseManager.announce({ item, el, actor: res.actor ?? carrier, lines: res.lines, rolls: res.rolls, rollCard: res.rollCard });
    return res;
  }
  const name = item.name;
  const done = await consume(item, el);
  if (done) {
    await ItemEffects.fire(item, el.key, null);
    if (c.announce) await UseManager.announce({ item, el, actor: carrier, lines: [], rolls: [], name });
  }
  return done;
}

/* ============================================================ */
/*  BOUTONS À ÉTAPES                                             */
/* ------------------------------------------------------------ */
/*  config.steps = [ { type, ... } ], exécutées dans l'ordre ;   */
/*  la première qui échoue arrête la suite, avec son message.    */
/*                                                               */
/*  condition { formula, message }   formule vraie, sinon stop   */
/*  consume   { from: key|slot|carrier, key, slot, amount }      */
/*  roll      { key }       le jet configuré sur ce champ        */
/*  attack    { key, profile, damage, range, … } (manager Combat)*/
/*  set       { key, formula, target?: carrier|targets }         */
/*  Toute étape (sauf condition) : onlyIf = formule ; fausse →   */
/*  l'étape est SAUTÉE (le bouton continue).                     */
/*  Après un jet / une attaque : isSuccess, isCrit, isFumble,    */
/*  rollTotal, et les options de la fenêtre, pour la suite.      */
/*  fill      { slot, limit? }  remplit le slot depuis l'inven-  */
/*            taire du porteur (même objet que celui déjà logé)  */
/*  empty     { slot }      rend le contenu du slot à l'inventaire*/
/*                                                               */
/*  Aucun « tirer » écrit ici : Tirer = condition + consume +    */
/*  roll, Recharger = condition + fill. Le MJ compose.           */
/* ============================================================ */

export const STEP_TYPES = ["condition", "if", "result", "consume", "roll", "attack", "target", "pick", "ask", "set", "fill", "empty", "useslot", "effect", "land", "sound", "wait", "quest", "level", "take", "give", "table", "place", "scene", "signal", "resist", "time", "weather", "season", "moon"];
/** Étapes du calendrier (proposées quand le composant est activé). */
export const CAL_STEPS = ["time", "weather", "season", "moon"];
export const EFFECT_ACTIONS = ["apply", "remove", "add", "sub"];

/** Les étapes d'un bouton, blocs compilés en liste plate (sauts). */
export function stepsOf(el) {
  return compileSteps(el?.config?.steps);
}

/** Objet du monde par id ou par nom (sans tenir compte des majuscules ni des espaces autour). */
function worldItemNamed(name) {
  const n = String(name ?? "").trim();
  if (!n) return null;
  const low = n.toLowerCase();
  return game.items.get(n) ?? game.items.find(i => i.type === "objet" && !i.system?.modelId && i.name.trim().toLowerCase() === low)
    ?? game.items.find(i => i.type === "objet" && i.name.trim().toLowerCase() === low) ?? null;
}

/**
 * Clé de jet sur un document : la clé telle quelle si elle a un jet, sinon
 * la formule évaluée (picked_talent), puis son texte ramené à une clé
 * (« Fabrication » → fabrication).
 */
function rollKeyOn(doc, raw, scope) {
  const els = [...walkElements(doc?.system?.template?.system?.elements ?? [])];
  const has = (k) => els.some(e => e?.key === k && e.config?.roll?.on);
  if (has(raw)) return raw;
  let v = raw;
  try { const r = evalExpression(raw, scope); if (r !== null && r !== undefined && r !== "") v = String(r); } catch (_e) { /* texte brut */ }
  if (has(v)) return v;
  const slug = String(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (has(slug)) return slug;
  const byLabel = els.find(e => e?.config?.roll?.on && String(e.label ?? "").trim().toLowerCase() === String(v).trim().toLowerCase());
  return byLabel?.key ?? slug;
}

/** Portée de formule d'un objet : ses clés + ce qu'il contient. */
function itemScope(item) {
  /* Portée complète : valeurs, contenu, apports ET fonctions (slotted,
     carrier…) — sans elles, un « Seulement si » qui les appelle était
     faux en silence. */
  try { return docScope(item); } catch (_e) { return {}; }
}

/** Une formule lue sur un objet (ses clés nues) est-elle vraie ? Vide = oui. */
export function itemFormulaOk(it, formula) {
  const f = String(formula ?? "").trim();
  return !f || conditionHolds({ formula: f }, itemScope(it));
}

function conditionHolds(st, scope, { warn = false } = {}) {
  const f = String(st.formula ?? "").trim();
  if (!f) return true;
  const r = evalExpression(f, scope);
  /* Formule illisible dans une étape : on le dit au MJ (sinon l'étape
     saute en silence). Pas pour un tri de candidats : un objet sans les
     clés demandées n'est simplement pas candidat. */
  if (warn && r === null && game.user?.isGM) console.warn("SBE | Formule illisible :", f);
  return r !== null && !!r;
}

function numberOf(raw, scope, fallback = 1) {
  const s = String(raw ?? "").trim();
  if (!s) return fallback;
  const n = Number.isFinite(Number(s)) ? Number(s) : Number(evalExpression(s, scope));
  return Number.isFinite(n) ? n : fallback;
}

/** Élément du modèle par clé. */
function elementByKey(item, key) {
  return [...walkElements(item?.system?.template?.system?.elements ?? [])].find(e => e?.key === key) ?? null;
}

/** Les piles logées dans un slot de CET objet. */
function heldIn(item, slotKey) {
  /* Le contenu se lit là où est l'objet (un objet posé garde ses munitions). */
  /* Un objet du monde : le contenu qu'il garde avec lui. */
  return itemsAround(item).filter(it => it.type === "objet"
    && String(it.system?.carry?.host ?? "") === item.id
    && String(it.system?.carry?.where ?? "") === slotKey);
}

/**
 * Les objets que « Choisir un objet » propose (sans rien demander) :
 * l'inventaire du porteur, ou une liste de références de cet objet,
 * filtrés par la formule (clés nues du candidat ; « self_clé » = cet objet).
 */
function pickCandidates(item, st, scope, vars, { first = false } = {}) {
  const carrier = carrierOf(item);
  if (carrier?.documentName !== "Actor") return [];
  const f = String(st.formula ?? "").trim();
  const all = carrier.items?.contents ?? [...(carrier.items ?? [])];
  const selfVars = selfVarsOf(scope);
  /* Source : l'inventaire du porteur, ou une LISTE de références de
     cet objet (des objets du monde : les recettes d'un outil). */
  const pool = st.from === "list"
    ? (Array.isArray(item.system?.values?.[st.list]) ? item.system.values[st.list] : []).map(id => game.items.get(id)).filter(Boolean)
    : all;
  /* « Seulement ceux que le porteur possède » (les recettes qu'il connaît). */
  const owns = st.from === "list" && st.owned
    ? new Set(all.map(i => String(i.system?.modelId || i.id))) : null;
  const ok = (it) => it.type === "objet" && it.id !== item.id && (!owns || owns.has(it.id))
    && (!f || conditionHolds({ formula: f }, { ...itemScope(it), ...vars, ...selfVars }));
  /* Pour griser un bouton, un seul suffit (pas tout l'inventaire à calculer). */
  if (first) { const one = pool.find(ok); return one ? [one] : []; }
  return pool.filter(ok).sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
}

/**
 * L'objet qu'on utilise, vu depuis un candidat : « self_clé » (ses
 * valeurs) et « self_fonction(…) » (ses fonctions : self_slotted…).
 */
function selfVarsOf(scope) {
  const out = {};
  for (const [k, v] of Object.entries(scope)) {
    if (/^[a-z][a-zA-Z0-9_]*$/.test(k) && ["number", "string", "boolean", "function"].includes(typeof v)) out[`self_${k}`] = v;
  }
  return out;
}

/**
 * Les questions d'une étape « Demander », valeurs calculées (défaut,
 * minimum et maximum d'un nombre : nombres ou formules).
 */
function askQuestionsOf(st, scope) {
  const num = (raw) => {
    const s = String(raw ?? "").trim();
    if (!s) return null;
    const n = Number.isFinite(Number(s)) ? Number(s) : Number(evalExpression(s, scope));
    return Number.isFinite(n) ? n : null;
  };
  return (Array.isArray(st.questions) ? st.questions : []).filter(q => q?.key).map(q => {
    const kind = ["number", "choice", "check", "text"].includes(q.kind) ? q.kind : "number";
    const out = { key: q.key, label: q.label || q.key, kind };
    if (kind === "number") {
      out.min = num(q.min);
      out.max = num(q.max);
      out.def = num(q.def) ?? out.min ?? 0;
    } else if (kind === "choice") {
      out.choices = parseChoices(q.choices);
      out.def = String(q.def ?? "").trim() || out.choices[0]?.value || "";
    } else if (kind === "check") out.def = !!num(q.def);
    else out.def = String(q.def ?? "");
    return out;
  });
}

/**
 * Qui répond à une étape « Demander » : celui qui agit (vide), le MJ, ou
 * le joueur de la première cible (à défaut le MJ).
 * @returns {{ user?: string, error?: string }}
 */
function askWho(st, item, targets) {
  const L = (k) => game.i18n.localize(k);
  const gm = () => (game.user.isGM ? { user: "" } : game.users.activeGM ? { user: game.users.activeGM.id } : { error: L("SBE.Ask.NoGM") });
  if (st.who === "gm") return gm();
  if (st.who === "target") {
    const actor = (targets ?? []).find(a => a?.documentName === "Actor");
    if (!actor) return { error: L("SBE.Steps.NoTarget") };
    if (actor.isOwner && !game.user.isGM) return { user: "" };
    const player = game.users.find(u => u.active && !u.isGM && actor.testUserPermission(u, "OWNER"));
    return player ? { user: player.id } : gm();
  }
  return { user: "" };
}

/** L'objet rangé dans un slot de cet objet (le premier), et son bouton. */
function slotButton(item, st) {
  const held = heldIn(item, String(st.slot ?? ""))[0] ?? null;
  const btn = held ? [...walkElements(held.system?.template?.system?.elements ?? [])]
    .find(e => e?.kind === "button" && e.key === String(st.button ?? "")) : null;
  return { held, btn };
}

/** Pourquoi « Utiliser l'objet d'un slot » est impossible (ou ""). */
function useSlotReason(item, st) {
  const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
  const { held, btn } = slotButton(item, st);
  if (!held) return L("SBE.Steps.SlotEmpty", { slot: slotLabel(item, st.slot) });
  if (!btn) return L("SBE.Steps.NoSlotButton", { name: held.name, key: st.button ?? "" });
  /* Le bouton de l'objet logé, vu par le même porteur. */
  const carrier = carrierOf(item);
  return asCarrierSync(held, carrier, () => unavailableReason(held, btn));
}

/**
 * Écrit une valeur sur la fiche d'un PERSONNAGE. Pas propriétaire (la
 * cible d'un joueur) : le MJ principal l'écrit, par le canal du système
 * — seules les valeurs de fiche (system.values.*) passent.
 */
async function writeActorValue(actor, key, val, delta = null) {
  if (!actor || !key) return;
  /* Ajouter / retirer, par un joueur : l'ÉCART part chez le MJ, qui
     l'applique sur la valeur du moment, et on attend qu'il l'ait fait —
     même sur sa propre fiche (un soin et des dégâts du MJ au même
     instant ne s'effacent pas). Sans MJ : écrit ici. */
  if (delta !== null && !game.user.isGM && game.users.activeGM) {
    if (await requestDeltas(actor, { [key]: delta })) return;
  }
  if (actor.isOwner) return actor.update({ [`system.values.${key}`]: val });
  requestGM({ type: "sbeActorValues", uuid: actor.uuid, changes: { [`system.values.${key}`]: val } });
}

/* ---------------- outils des étapes ---------------- */

const escH = (x) => foundry.utils.escapeHTML(String(x ?? ""));
const r2 = (n) => Math.round(Number(n) * 100) / 100;
const nameOf = (doc) => { try { return Identity.of(doc)?.name ?? doc?.name ?? ""; } catch (_e) { return doc?.name ?? ""; } };

/* Valeur d'une formule, dés compris : la règle commune du moteur de
   formules (une seule façon de lancer des dés dans tout le système). */
const valueOf = formulaValue;

/** L'élément d'une clé sur le modèle d'un document (objet ou fiche). */
function elementOn(doc, key) {
  return [...walkElements(doc?.system?.template?.system?.elements ?? [])].find(e => e?.key === key) ?? null;
}

/** Valeur actuelle d'une clé sur un document. */
function currentOf(doc, key) {
  let v;
  try { v = docScope(doc)[key]; } catch (_e) { v = undefined; }
  return Number(v ?? doc?.system?.values?.[key] ?? elementOn(doc, key)?.config?.default ?? 0) || 0;
}

/**
 * Nouvelle valeur selon le MODE de « Modifier un champ » :
 *   set (=), add (+), sub (−), temp (points temporaires de la jauge).
 * Ajouter / Retirer restent dans les bornes du champ (max de la jauge,
 * en formule compris) — l'écriture les vérifie aussi, ceci sert au
 * texte de la carte (« +3 » si le max coupe un soin de 7).
 */
function nextValue(doc, key, mode, amount) {
  if (mode === "set") return { path: key, val: amount };
  const el = elementOn(doc, key);
  if (mode === "temp") {
    const cur = Number(doc?.system?.values?.[`${key}_temp`]) || 0;
    return { path: `${key}_temp`, val: Math.max(0, Number(amount) || 0), before: cur };
  }
  const cur = currentOf(doc, key);
  const raw = cur + (mode === "sub" ? -1 : 1) * (Number(amount) || 0);
  let val = raw;
  if (el) {
    let b = { min: -Infinity, max: Infinity };
    try { b = valueBounds(el, docScope(doc)); } catch (_e) { /* bornes inconnues */ }
    val = Math.min(b.max, Math.max(b.min, val));
  }
  /* Jauge qui DÉBORDE : la valeur brute est écrite, les bornes (et le
     surplus vers l'autre clé) se font au seul point de contrôle. */
  const write = el?.config?.overflow && (el.config.overflow.low || el.config.overflow.high) ? raw : val;
  return { path: key, val, write, before: cur };
}

/** Écrit une valeur sur un document (objet, ou fiche — même d'un autre). */
async function writeValue(doc, path, val, delta = null) {
  if (!doc) return;
  if (doc.documentName === "Actor") return writeActorValue(doc, path, val, delta);
  if (delta !== null && !game.user.isGM && game.users.activeGM) {
    if (await requestDeltas(doc, { [path]: delta })) return;
  }
  if (doc.isOwner) return doc.update({ [`system.values.${path}`]: val });
  /* L'objet d'un autre (l'arme de la cible) : le MJ l'écrit. */
  requestGM({ type: "sbeActorValues", uuid: doc.uuid, changes: { [`system.values.${path}`]: val } });
}

/** Ligne de la carte « utilise » pour une modification. */
function changeLine(doc, key, mode, res, amount) {
  const el = elementOn(doc, key);
  const label = escH(el?.label || key);
  const who = escH(nameOf(doc));
  let txt;
  if (mode === "set") txt = `${label} = ${escH(res.val)}`;
  else if (mode === "temp") txt = `${label} : +${r2(res.val)} ${escH(game.i18n.localize("SBE.Steps.TempWord"))}`;
  else {
    const d = r2(res.val - res.before);
    txt = `${label} ${d >= 0 ? "+" : ""}${d}`;
    if (Math.abs(d) < Math.abs(Number(amount) || 0) - 1e-9) txt += ` <span class="notes">(${r2(amount)})</span>`;
  }
  return `${txt} — ${who}`;
}

/** Fenêtre « Choisir un objet » : les objets portés qui passent le filtre. */
async function askPick(title, candidates, infoOf = null) {
  const L = (k) => game.i18n.localize(k);
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const rows = candidates.map((it, i) => `
      <button type="button" class="sbe-pick-row" data-i="${i}">
        <img src="${escH(it.img)}" alt=""><span>${escH(it.name)}</span>
        ${(() => { const inf = infoOf?.(it); return inf?.text ? `<span class="sbe-pick-info"${inf.color ? ` style="color:${escH(inf.color)}"` : ""}>${escH(inf.text)}</span>` : ""; })()}
        ${isStackableItem(it) && qtyOf(it) > 1 ? `<span class="sbe-pick-qty">×${qtyOf(it)}</span>` : ""}
      </button>`).join("");
    const dlg = new foundry.applications.api.DialogV2({
      window: { title },
      position: { width: 340 },
      classes: ["sbe-pick-app"],
      content: `<p class="notes">${L("SBE.Steps.PickIntro")}</p><div class="sbe-pick-list">${rows}</div>`,
      buttons: [{ action: "cancel", label: L("SBE.Common.Cancel"), icon: "fa-solid fa-xmark" }],
      submit: () => finish(null)
    });
    dlg.addEventListener("close", () => finish(null), { once: true });
    dlg.render({ force: true });
    const wire = () => {
      const root = dlg.element;
      if (!root) { setTimeout(wire, 30); return; }
      for (const b of root.querySelectorAll(".sbe-pick-row")) {
        b.addEventListener("click", () => { finish(candidates[Number(b.dataset.i)] ?? null); dlg.close(); });
      }
    };
    setTimeout(wire, 30);
  });
}

/** Étapes qui demandent un choix au joueur : jamais après « Attendre ». */
export const INTERACTIVE_STEPS = ["target", "pick", "roll", "attack", "fill", "place"];

/** Valeurs de « Modifier un champ ». */
export const SET_MODES = ["set", "add", "sub", "temp"];

/**
 * Exécute les étapes d'un bouton.
 * @param {Item} item
 * @param {object} el            le bouton
 * @param {object} [resume]      reprise après « Attendre » :
 *                               { start, vars, targets, picked, lines }
 * @returns {{ok, outcome, pending?, lines, rolls, actor}}
 */
export async function runSteps(item, el, resume = null) {
  const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
  const lines = [...(resume?.lines ?? [])];
  const rolls = [];
  const stop = (msg) => { ui.notifications.warn(msg); return { ok: false, outcome: null, lines, rolls }; };
  let outcome = resume?.outcome ?? null;
  /* Valeurs choisies en route (options de la fenêtre d'une attaque :
     Focalisation, Étourdi…) : lisibles par les étapes SUIVANTES —
     « Consommer focus ? 3 : 1 ». */
  const vars = { ...(resume?.vars ?? {}) };
  /* Cibles : celles de la dernière attaque ou de « Choisir une cible ».
     Les étapes « sur les cibles » qui suivent (Effet, Modifier un
     champ) les visent, même cliquées à la souris plutôt que marquées. */
  let lastTargets = resume?.targets ?? null;
  /* Objet choisi par « Choisir un objet » (réparer, affûter…). */
  let picked = resume?.picked ?? null;
  /* Dernière attaque : où elle est retombée, et si elle a touché
     (étape « Que devient l'objet »). */
  let lastPoint = resume?.vars?._point ?? null;
  let lastHit = !!resume?.vars?._hit;
  const targetsNow = () => {
    if (lastTargets?.length) return lastTargets;
    return [...(game.user.targets ?? [])].map(t => PropManager.targetDocOf(t)).filter(Boolean);
  };
  /* RÉSULTAT du dernier jet, lisible par les étapes suivantes :
     isSuccess, isCrit, isFumble (1 / 0) et rollTotal. */
  /* MÉDIAS À LA SUITE : chaque « Jouer un média » attend le délai
     « Média suivant après » du média joué juste avant dans ce bouton
     (tir → impact → ricochet), sans retenir les étapes suivantes. */
  let mediaChain = Promise.resolve();
  let mediaReadyAt = 0;
  const queueMedia = (defId, opts) => {
    opts = { ...opts, actorId: MediaManager.actorIdOf(item) };   /* noté maintenant (voir l'attaque) */
    mediaChain = mediaChain.then(async () => {
      const wait = mediaReadyAt - Date.now();
      if (wait > 0) await new Promise(r => { setTimeout(r, wait); });
      const t0 = Date.now();
      await MediaManager.play(item, defId, opts);
      mediaReadyAt = t0 + await MediaManager.nextDelay(item, defId);
    }).catch(err => console.warn("SBE | Média en échec", err));
  };
  const setOutcome = (oc, total) => {
    vars.isSuccess = ["success", "critSuccess", "done"].includes(oc) ? 1 : 0;
    vars.isCrit = oc === "critSuccess" ? 1 : 0;
    vars.isFumble = oc === "critFailure" ? 1 : 0;
    if (Number.isFinite(Number(total))) vars.rollTotal = Number(total);
  };
  const steps = stepsOf(el);

  for (let i = resume?.start ?? 0; i < steps.length; i++) {
    const st = steps[i];
    const scope = { ...itemScope(item), ...vars };   /* relue à chaque étape : les valeurs bougent */

    /* Après une attente, plus personne n'est là pour choisir. (Un départ
       imposé — objet glissé dessus, piège — n'est pas une reprise.) */
    if (resume?.start !== undefined && INTERACTIVE_STEPS.includes(st.type)) continue;

    /* Blocs (compilés en sauts) : « Si… alors… sinon… », « Selon le
       résultat du jet ». Un bloc sauté par son « Seulement si » saute
       tout son contenu. */
    if (st.type === "_jump") { i = st.to - 1; continue; }
    if (st.type === "_if" || st.type === "_switch") {
      if (String(st.onlyIf ?? "").trim() && !conditionHolds({ formula: st.onlyIf }, scope, { warn: true })) { i = st.end - 1; continue; }
      if (st.type === "_if") { if (!conditionHolds({ formula: st.formula || "true" }, scope, { warn: true })) i = st.else - 1; continue; }
      const branch = OUTCOME_BRANCH[outcome];
      i = (branch ? st.targets[branch] : st.end) - 1;
      continue;
    }

    /* « Seulement si » : une étape sautée ne bloque rien (au contraire
       d'une Condition, qui arrête le bouton). */
    if (st.type !== "condition" && String(st.onlyIf ?? "").trim() && !conditionHolds({ formula: st.onlyIf }, scope, { warn: true })) continue;

    switch (st.type) {

      case "condition":
        if (!conditionHolds(st, scope, { warn: true })) {
          return stop(String(st.message ?? "").trim() || L("SBE.Steps.Impossible"));
        }
        break;

      case "consume": {
        const amount = Math.max(0, Math.floor(numberOf(st.amount, scope, 1)));
        if (!amount) break;
        if (st.from === "self") {
          /* CET OBJET : la pile baisse, et disparaît à zéro. */
          if (!item.id || !item.parent?.items?.get?.(item.id)) return stop(L("SBE.Steps.NotEnough", { what: item.name }));
          const q = isStackableItem(item) ? qtyOf(item) : 1;
          if (q < amount) return stop(L("SBE.Steps.NotEnough", { what: item.name }));
          if (q - amount > 0) await item.update({ [`system.values.${QUANTITY_KEY}`]: q - amount });
          else await item.delete();
          lines.push(`−${amount} ${escH(item.name)}`);
        } else if (st.from === "picked") {
          /* L'objet choisi plus haut (« Choisir un objet ») : sa pile baisse. */
          if (!picked?.parent) return stop(L("SBE.Steps.NoPicked"));
          const q = isStackableItem(picked) ? qtyOf(picked) : 1;
          if (q < amount) return stop(L("SBE.Steps.NotEnough", { what: picked.name }));
          const nm = picked.name;
          if (q - amount > 0) await picked.update({ [`system.values.${QUANTITY_KEY}`]: q - amount });
          else await picked.delete();
          lines.push(`−${amount} ${escH(nm)}`);
        } else if (st.from === "slot") {
          const piles = heldIn(item, st.slot);
          const have = piles.reduce((n, p) => n + qtyOf(p), 0);
          if (have < amount) return stop(L("SBE.Steps.NotEnough", { what: slotLabel(item, st.slot) }));
          let left = amount;
          for (const p of piles) {
            if (left <= 0) break;
            const q = qtyOf(p);
            const take = Math.min(q, left);
            left -= take;
            if (q - take > 0) await p.update({ [`system.values.${QUANTITY_KEY}`]: q - take });
            else await p.delete();
          }
        } else if (st.from === "carrier") {
          /* Sur le PORTEUR : la mana, l'endurance… du personnage. */
          const carrier = carrierOf(item);
          if (carrier?.documentName !== "Actor") return stop(L("SBE.Steps.NoCarrier"));
          const key = String(st.key ?? "");
          const cel = elementOn(carrier, key);
          const cur = Number(carrier.system.values?.[key] ?? cel?.config?.default ?? 0) || 0;
          if (cur < amount) return stop(L("SBE.Steps.NotEnough", { what: cel?.label || key }));
          await carrier.update({ [`system.values.${key}`]: cur - amount });
          lines.push(`${escH(cel?.label || key)} −${amount} — ${escH(nameOf(carrier))}`);
        } else {
          const key = String(st.key ?? "");
          const cur = Number(item.system.values?.[key] ?? elementByKey(item, key)?.config?.default ?? 0) || 0;
          if (cur < amount) return stop(L("SBE.Steps.NotEnough", { what: elementByKey(item, key)?.label || key }));
          await item.update({ [`system.values.${key}`]: cur - amount });
        }
        break;
      }

      case "roll": {
        /* Sur l'objet (son champ), ou sur le PORTEUR : la clé peut alors
           être une formule qui la donne (picked_talent → « crafting ») ;
           un libellé (« Fabrication ») est ramené à sa clé. */
        let doc = item, key = String(st.key ?? "");
        if (st.who === "carrier") {
          doc = carrierOf(item);
          if (doc?.documentName !== "Actor") return stop(L("SBE.Steps.NoCarrier"));
          key = rollKeyOn(doc, key, scope);
        }
        const difficulty = String(st.difficulty ?? "").trim() ? numberOf(st.difficulty, scope, 0) : 0;
        /* Bouton qui s'annonce : le jet va DANS sa carte (un seul message). */
        const inCard = !!el.config?.announce;
        /* Relances et bonus : sur la carte si le jet a sa carte et que rien
           ne le suit ; sinon tout de suite, avant la suite du bouton. */
        const last = i === steps.length - 1 && !resume;
        const res = await rollField(doc, key, { ask: true, difficulty, post: !inCard, after: !inCard && last ? "card" : "now" });
        if (!res) return stop(L("SBE.Steps.NoRoll", { key: key || st.key || "" }));
        if (inCard) {
          const rEl = [...walkElements(doc?.system?.template?.system?.elements ?? [])].find(e => e?.key === key);
          vars._rollCard = {
            title: rEl?.config?.roll?.label || rEl?.label || key,
            actor: doc.documentName === "Actor" ? doc.uuid : (doc.parent?.documentName === "Actor" ? doc.parent.uuid : ""),
            roll: res.roll?.toJSON?.() ?? null, adv: res.adv ?? "",
            dropped: (res.dropped ?? []).map(r => r.toJSON?.()).filter(Boolean),
            mods: res.mods ?? "", outcome: res.cardOutcome ?? "", detail: res.detail ?? "", mode: res.messageMode ?? "", afterHtml: res.afterHtml ?? ""
          };
        }
        outcome = res.outcome;
        setOutcome(res.outcome, res.total);
        break;
      }

      /* Attaquer : cible, défense de la cible, dégâts (manager Combat).
         Annuler le choix de la cible arrête le bouton SANS rien coûter :
         placez « Consommer » APRÈS cette étape. */
      case "attack": {
        /* Médias de l'attaque : le TIR part AU CLIC sur la cible (pas après
           les jets, dégâts et carte) ; l'issue (critique — sinon touché —,
           touché, raté) suit : à la fin du son du tir, ou après le délai
           réglé sur la ligne du tir (objet), et pas avant de la connaître.
           Rafale : le tir ET l'issue se rejouent autant de fois, au même
           rythme — chaque impact suit son coup. */
        const defOf = (raw) => {
          const nm = String(raw ?? "").trim();
          return nm ? mediaDefsOf(item).find(d => d.name === nm || d.id === nm) : null;
        };
        const shot = defOf(st.mediaShot);
        /* Le « propriétaire » (public des médias) : celui qui utilise l'objet,
           noté maintenant — le média de l'issue part plus tard. */
        const actorId = MediaManager.actorIdOf(item);
        let shotAt = null;          /* moment où le tir est parti */
        let shotDone = Promise.resolve();
        const onAim = (info) => {
          shotAt = Date.now();
          if (!shot) return;
          shotDone = MediaManager.play(item, shot.id, { targets: info.targets ?? [], point: info.point ?? null, actorId,
            repeat: info.shots ?? 1, interval: info.interval ?? 0 }).catch(err => console.warn("SBE | Média du tir en échec", err));
        };
        /* Dernière étape : l'attaque peut se relancer depuis sa carte. */
        const res = await CombatManager.attack(item, st, { ...vars, _afterCard: i === steps.length - 1 && !resume }, { onAim });
        if (!res) return { ok: false, outcome: null, lines, rolls };
        if (res.error) return stop(res.error);
        outcome = res.outcome;
        Object.assign(vars, res.vars ?? {});
        setOutcome(res.outcome, res.total);
        if (Array.isArray(res.targets)) lastTargets = res.targets;
        if (res.point) lastPoint = res.point;
        lastHit = !!res.hit;
        /* isHit : une cible a été touchée (1 / 0), pour les « Seulement si ». */
        vars.isHit = lastHit ? 1 : 0;
        {
          const crit = res.outcome === "critSuccess";
          const after = defOf(crit ? (st.mediaCrit || st.mediaHit) : res.hit ? st.mediaHit : st.mediaMiss);
          const opts = { targets: res.targets ?? [], point: res.point ?? null, actorId,
            repeat: res.shots ?? 1, interval: res.interval ?? 0 };
          (async () => {
            /* Visée jamais annoncée : le tir part maintenant. */
            if (shot && shotAt === null) { shotAt = Date.now(); shotDone = MediaManager.play(item, shot.id, opts); }
            if (!after) return;
            await shotDone;
            if (shot) {
              const wait = await MediaManager.nextDelay(item, shot.id) - (Date.now() - (shotAt ?? Date.now()));
              if (wait > 0) await new Promise(r => { setTimeout(r, wait); });
            }
            await MediaManager.play(item, after.id, opts);
          })().catch(err => console.warn("SBE | Média de l'attaque en échec", err));
        }
        /* Zone persistante laissée par l'attaque (onglet Zone de l'objet),
           posée tout de suite : l'objet existe encore (Consommer vient après). */
        await PersistentZones.afterAttack(item, res);
        break;
      }

      /* Que devient l'objet (projectile récupérable) : un exemplaire
         quitte la pile et va dans l'inventaire de la cible, au sol, ou
         disparaît — selon que la dernière attaque a touché ou non. */
      case "land": {
        const where = (raw, dflt) => {
          const t = String(CombatManager.textOf(raw, scope) || dflt).toLowerCase();
          if (/sol|ground|terre/.test(t)) return "ground";
          if (/cible|target|inventaire|inventory/.test(t)) return "target";
          return "destroy";
        };
        const dest = lastHit ? where(st.onHit, "destroy") : where(st.onMiss, "destroy");
        const inInv = !!(item.id && item.parent?.items?.get?.(item.id));
        const tgt = lastTargets?.[0] ?? null;
        /* L'exemplaire part chez la cible ou au sol : le MJ le crée là-bas
           puis le retire de la pile, dans la même opération. */
        if (inInv && dest === "target" && tgt) {
          if (await GroundItems.moveItem(item, 1, { actor: tgt })) lines.push(`${escH(item.name)} → ${escH(L("SBE.Ground.ToTarget", { name: nameOf(tgt) }))}`);
        } else if (inInv && (dest === "ground" || dest === "target") && lastPoint) {
          if (await GroundItems.moveItem(item, 1, { point: lastPoint })) lines.push(`${escH(item.name)} → ${escH(L("SBE.Ground.ToGround"))}`);
        } else {
          if (inInv) {
            const q = isStackableItem(item) ? qtyOf(item) : 1;
            if (q - 1 > 0) await item.update({ [`system.values.${QUANTITY_KEY}`]: q - 1 });
            else await item.delete();
          }
          lines.push(`−1 ${escH(item.name)}`);
        }
        break;
      }

      /* Choisir une cible : jeton(s) marqué(s) avec T, sinon un clic ;
         portée en cases facultative. Le porteur peut se viser. */
      case "target": {
        const carrier = carrierOf(item);
        const from = carrier ? CombatManager.tokenOf(carrier) : null;
        const range = numberOf(st.range, scope, 0);
        /* Cible imposée (piège : le déclencheur). */
        const auto = vars._autoTarget ? canvas?.tokens?.get(vars._autoTarget) : null;
        let tokens = auto ? [auto] : [...(game.user.targets ?? [])];
        if (!tokens.length) {
          const pick = await CombatManager.pickTarget(from, range);
          if (!pick) return { ok: false, outcome: null, lines, rolls };
          if (pick.token) tokens = [pick.token];
        }
        /* Objet posé : ignoré en combat → jamais ; attaquable → l'objet. */
        tokens = tokens.filter(t => t?.actor && PropManager.targetDocOf(t));
        if (!tokens.length) return stop(L("SBE.Steps.NoTarget"));
        if (range > 0 && from) {
          for (const t of tokens) {
            const d = CombatManager.distanceCases(from, t);
            if (d > range + 1e-6) return stop(L("SBE.Combat.OutOfRange", { d: Math.round(d * 10) / 10, r: range }));
          }
        }
        /* Qui peut être visé (alliés, ennemis…) et « Seulement si » lu sur la fiche de la cible. */
        const who = { tokenId: from?.id ?? from?.document?.id ?? "", actorUuid: carrier?.uuid ?? "", disposition: (from?.document ?? from)?.disposition };
        const cond = String(st.targetIf ?? "").trim();
        for (const t of tokens) {
          const doc = PropManager.targetDocOf(t);
          let ok = touchesBy(st.who ?? "all", who, t.document ?? t);
          if (ok && cond) { try { ok = !!evalExpression(cond, docScope(doc)); } catch (_e) { ok = false; } }
          if (!ok) return stop(String(st.targetMsg ?? "").trim() || L("SBE.Steps.TargetRefused", { name: Identity.of(doc)?.name ?? doc?.name ?? "" }));
        }
        lastTargets = tokens.map(t => PropManager.targetDocOf(t));
        break;
      }

      /* Choisir un objet du porteur qui passe le filtre. */
      /* Envoyer un signal : les boutons qui l'écoutent se lancent. */
      case "signal": {
        const name = String(st.name ?? "").trim();
        if (!name) break;
        let actors = [];
        if (st.to === "targets") actors = targetsNow().filter(a => a?.documentName === "Actor");
        else if (st.to === "scene") actors = (canvas.scene?.tokens ?? []).map(t => t.actor).filter(Boolean);
        else { const c = carrierOf(item); if (c?.documentName === "Actor") actors = [c]; }
        const { ActionTriggers } = await import("../managers/triggers/action-triggers.mjs");
        ActionTriggers.signal(actors, name, carrierOf(item)?.name ?? item.name);
        break;
      }

      /* Demander : les réponses deviennent des variables des étapes suivantes. */
      case "ask": {
        const qs = askQuestionsOf(st, scope);
        if (!qs.length) break;
        let answers;
        /* Après une attente, personne n'est là : les valeurs par défaut. */
        if (resume?.start !== undefined) answers = defaultAnswers(qs);
        else {
          const who = askWho(st, item, targetsNow());
          if (who.error) return stop(who.error);
          answers = await askUser({ title: String(st.title ?? "").trim() || el.label || "", questions: qs,
            from: carrierOf(item)?.name ?? "" }, who.user);
          /* Annulé (ou sans réponse) : le bouton s'arrête sans rien faire. */
          if (!answers) return { ok: false, outcome: null, lines, rolls };
        }
        Object.assign(vars, answers);
        break;
      }

      case "pick": {
        const carrier = carrierOf(item);
        if (carrier?.documentName !== "Actor") return stop(L("SBE.Steps.NoCarrier"));
        const candidates = pickCandidates(item, st, scope, vars);
        const selfVars = selfVarsOf(scope);
        if (!candidates.length) return stop(String(st.message ?? "").trim() || L("SBE.Steps.NothingToPick"));
        /* Texte affiché à côté du nom (ex. l'état) : formule lue sur
           chaque objet ; une clé de liste garde la couleur de son choix. */
        const show = String(st.show ?? "").trim();
        const infoOf = show ? (it) => {
          const sc = { ...itemScope(it), ...selfVars };
          let v;
          try { v = evalExpression(show, sc); } catch (_e) { v = null; }
          if (v === null || v === undefined || v === "") return null;
          const sel = /^[a-z][a-z0-9_]*$/.test(show) ? elementOn(it, show) : null;
          const color = sel?.config?.choiceColors?.[String(v)] ?? "";
          return { text: String(v), color };
        } : null;
        const it = await askPick(el.label || el.key || item.name, candidates, infoOf);
        if (!it) return { ok: false, outcome: null, lines, rolls };
        picked = it;
        Object.assign(vars, pickedVarsOf(it));
        break;
      }

      case "set": {
        const key = String(st.key ?? "");
        if (!key) break;
        const mode = SET_MODES.includes(st.mode) ? st.mode : "set";
        const { value: amount, roll } = await valueOf(st.formula, scope);
        if (roll) rolls.push(roll);
        let docs;
        if (st.target === "carrier") {
          const carrier = carrierOf(item);
          if (carrier?.documentName !== "Actor") return stop(L("SBE.Steps.NoCarrier"));
          docs = [carrier];
        } else if (st.target === "targets") {
          docs = targetsNow();
          if (!docs.length) return stop(L("SBE.Steps.NoTarget"));
        } else if (st.target === "picked") {
          if (!picked) return stop(L("SBE.Steps.NoPicked"));
          docs = [picked];
        } else if (st.target === "slot") {
          /* L'objet rangé dans un slot de cet objet (l'arme d'un piège). */
          const held = heldIn(item, String(st.slot ?? ""))[0];
          if (!held) return stop(L("SBE.Steps.SlotEmpty", { slot: slotLabel(item, st.slot) }));
          docs = [held];
        } else docs = [item];
        for (const d of docs) {
          const res = nextValue(d, key, mode, amount);
          const delta = (mode === "add" || mode === "sub") ? (mode === "sub" ? -1 : 1) * (Number(amount) || 0) : null;
          await writeValue(d, res.path, res.write ?? res.val, delta);
          if (d !== item || mode !== "set") lines.push(changeLine(d, key, mode, res, amount));
        }
        break;
      }

      case "fill": {
        const res = await fillSlot(item, st, scope);
        if (res.silent) return { ok: false, outcome: null, lines, rolls };
        if (!res.ok) return stop(res.message);
        break;
      }

      case "empty": {
        const res = await emptySlot(item, st);
        if (!res.ok) return stop(res.message);
        break;
      }

      /* Utiliser l'objet d'un slot : un bouton de l'objet rangé (Tirer,
         Recharger…), par le même porteur, avec les mêmes cibles. */
      case "useslot": {
        const why = useSlotReason(item, st);
        if (why) return stop(why);
        const { held, btn } = slotButton(item, st);
        const res = await asCarrier(held, carrierOf(item), () => runButton(held, btn, {
          vars: Object.fromEntries(Object.entries(vars).filter(([k]) => k.startsWith("_"))),
          targets: lastTargets ?? undefined
        }));
        /* Un bouton sans étapes rend vrai / faux. */
        if (res !== true && !res?.ok) return { ok: false, outcome: null, lines, rolls };
        if (res?.outcome) { outcome = res.outcome; setOutcome(res.outcome, vars.rollTotal); }
        break;
      }

      /* Effet : sur le porteur, ou sur les jetons ciblés. */
      case "effect": {
        const key = String(st.key ?? "");
        /* Celui qui pose : retenu sur l'effet (« ceux que j'ai posés »). */
        const by = carrierOf(item)?.uuid ?? "";
        if (st.target === "mine") {
          const n = await EffectManager.dropPosedBy(by, key);
          const what = key ? (EffectManager.getDef(key)?.label || key) : L("SBE.Steps.FxAllMine");
          lines.push(`${escH(L("SBE.Steps.FxAction.remove"))} : ${escH(what)} (${n})`);
          break;
        }
        const def = EffectManager.getDef(key);
        if (!def) return stop(L("SBE.Steps.NoEffect", { key }));
        const action = EFFECT_ACTIONS.includes(st.action) ? st.action : "apply";
        let actors = [];
        if (st.target === "targets") {
          /* Les effets vont aux personnages : un objet posé n'en reçoit pas. */
          actors = targetsNow().filter(a => a?.documentName === "Actor");
          if (!actors.length) return stop(L("SBE.Steps.NoTarget"));
        } else {
          const carrier = carrierOf(item);
          if (carrier?.documentName === "Actor") actors = [carrier];
        }
        for (const a of actors) {
          await EffectManager.act(a, key, action, { by });
          lines.push(`${escH(L(`SBE.Steps.FxAction.${action}`))} : ${escH(def.label || key)} — ${escH(nameOf(a))}`);
        }
        break;
      }

      /* Jet de résistance d'un effet posé sur le porteur (vide :
         l'effet qui a lancé le bouton, « Effet posé ») ; avantage ou
         désavantage au choix. Son issue est celle de la résistance
         de l'effet (annulé, réduit, aggravé). */
      case "resist": {
        const actor = carrierOf(item);
        if (actor?.documentName !== "Actor") return stop(L("SBE.Steps.NoCarrier"));
        const key = String(st.key ?? "").trim() || String(vars.eventName ?? "");
        const def = EffectManager.getDef(key);
        if (!def) return stop(L("SBE.Steps.NoEffect", { key }));
        if (!def.resist?.enabled || !def.resist.key) return stop(L("SBE.Steps.NoResist", { effect: def.label || key }));
        const ae = EffectManager.findEffect(actor, key);
        if (!ae) break;
        const adv = st.adv === "adv" ? 1 : st.adv === "dis" ? -1 : null;
        const res = await EffectEngine.resist(actor, def, ae, { onApply: true, adv });
        if (!res) return stop(L("SBE.Steps.NoRoll", { key: def.resist.key }));
        outcome = res.outcome;
        setOutcome(res.outcome, res.total);
        break;
      }

      /* Son : un des médias déclarés par le modèle (onglet Médias de
         l'objet : fichier, public, portée). */
      case "sound": {
        const nm = String(st.key ?? "");
        const def = mediaDefsOf(item).find(d => d.name === nm || d.id === nm);
        /* Cibles et point visé : ceux de la dernière attaque ou de
           « Choisir une cible » — une attaque ratée ou tirée au sol n'a
           PAS de cible : l'animation va au point d'impact. Sans attaque
           ni choix de cible : les jetons marqués. */
        const tg = Array.isArray(lastTargets) ? lastTargets
          : [...(game.user.targets ?? [])].map(t => t.actor).filter(Boolean);
        if (def) queueMedia(def.id, { mode: st.mode, targets: tg, point: lastPoint });
        break;
      }

      /* Retirer des objets du PORTEUR : un objet du monde précis (ses
         exemplaires), ou les objets qui passent un filtre (comme « Choisir
         un objet »). Pas assez → le bouton s'arrête, rien n'est retiré. */
      case "take": {
        const carrier = carrierOf(item);
        if (carrier?.documentName !== "Actor") return stop(L("SBE.Steps.NoCarrier"));
        const amount = Math.max(0, Math.floor(numberOf(st.amount, scope, 1)));
        if (!amount) break;
        /* Les objets visés : un objet du monde, ceux que nomme une formule
           (un nom, un id, ou une LISTE — une liste de références : chacun
           compte pour lui), ou le filtre. */
        let worlds = [null];
        if (st.mode === "formula") {
          let v;
          try { v = evalExpression(String(st.formula ?? ""), scope); } catch (_e) { v = null; }
          const names = (Array.isArray(v) ? v : [v]).map(x => String(x ?? "").trim()).filter(Boolean);
          if (!names.length) break;
          worlds = [];
          for (const name of names) {
            const w = worldItemNamed(name);
            if (!w) return stop(L("SBE.Steps.GiveUnknown", { name }));
            worlds.push(w);
          }
        } else if (st.mode !== "filter") worlds = [game.items.get(st.item) ?? null];
        const f = String(st.filter ?? "").trim();
        const selfVars = {};
        for (const [k, v] of Object.entries(scope)) {
          if (/^[a-z][a-z0-9_]*$/.test(k) && ["number", "string", "boolean"].includes(typeof v)) selfVars[`self_${k}`] = v;
        }
        const plan = worlds.map(world => {
          const piles = (carrier.items?.contents ?? [...(carrier.items ?? [])]).filter(it => {
            if (it.type !== "objet" || it.id === item.id) return false;
            if (st.mode === "filter") return !!f && conditionHolds({ formula: f }, { ...itemScope(it), ...vars, ...selfVars });
            return !!world && (it.system?.modelId === world.id || it.id === world.id);
          });
          const what = world?.name ?? (st.mode === "filter" ? f : "?");
          const have = piles.reduce((n, p) => n + (isStackableItem(p) ? qtyOf(p) : 1), 0);
          return { piles, what, have };
        });
        /* « Ce qu'il y a » : retire au plus ce qui est porté, sans bloquer
           (un échec critique qui gâche le double des ingrédients). */
        const short = plan.find(x => x.have < amount);
        if (short && !st.partial) return stop(String(st.message ?? "").trim() || L("SBE.Steps.NotEnough", { what: short.what }));
        /* « Vérifier seulement » : on contrôle tout AVANT de retirer quoi que ce soit. */
        if (st.check) break;
        for (const { piles, what, have } of plan) {
          const want = Math.min(amount, have);
          if (!want) continue;
          let left = want;
          for (const p of piles) {
            if (left <= 0) break;
            const q = isStackableItem(p) ? qtyOf(p) : 1;
            const n = Math.min(q, left);
            left -= n;
            if (q - n > 0) await p.update({ [`system.values.${QUANTITY_KEY}`]: q - n });
            else await p.delete();
          }
          lines.push(`−${want} ${escH(what)}`);
        }
        break;
      }

      /* Donner des objets au PORTEUR : un objet du monde, ou celui que
         nomme une formule (son nom ou son id — une table peut le tirer). */
      /* Table aléatoire : un tirage ; le résultat devient une variable
         (tableResult, tableTotal), un objet tiré peut être donné. */
      case "table": {
        const table = game.tables?.get(st.table) ?? null;
        if (!table) return stop(L("SBE.Steps.TableMissing"));
        /* Tirage par le MJ quand la table n'est pas au joueur (table sans remise). */
        const { drawTable } = await import("../helpers/table-draw.mjs");
        const draw = await drawTable(table, { chat: !!st.chat });
        const results = draw?.results ?? [];
        const names = results.map(r => String(r.name || foundry.utils.cleanHTML?.(r.description ?? "") || r.description || "")
          .replace(/<[^>]*>/g, "").trim()).filter(Boolean);
        vars.tableResult = names.join(", ");
        vars.tableTotal = Number(draw?.roll?.total) || 0;
        if (draw?.roll && !st.chat) rolls.push(draw.roll);
        lines.push(`${escH(table.name)} : ${escH(vars.tableResult || "—")}`);
        if (st.give) {
          const carrier = carrierOf(item);
          if (carrier?.documentName !== "Actor") break;
          const { QuestManager } = await import("../managers/quest/quest-manager.mjs");
          for (const r of results) {
            const doc = r.documentUuid ? await fromUuid(r.documentUuid).catch(() => null) : null;
            /* Objets du monde seulement (un objet de compendium n'a pas de modèle ici). */
            if (doc?.documentName !== "Item" || doc.pack) continue;
            const placed = await QuestManager.giveItem(carrier, doc, 1);
            lines.push(`+1 ${escH(doc.name)}${placed ? "" : ` (${escH(L("SBE.Quest.AtFeet"))})`}`);
          }
        }
        break;
      }

      case "give": {
        const carrier = carrierOf(item);
        if (carrier?.documentName !== "Actor") return stop(L("SBE.Steps.NoCarrier"));
        const n = Math.max(0, Math.floor(numberOf(st.amount, scope, 1)));
        if (!n) break;
        /* Une formule peut nommer plusieurs objets (liste de références). */
        let worlds = [];
        if (st.mode === "formula") {
          let v;
          try { v = evalExpression(String(st.formula ?? ""), scope); } catch (_e) { v = null; }
          for (const x of Array.isArray(v) ? v : [v]) {
            const name = String(x ?? "").trim();
            if (!name) continue;
            const w = worldItemNamed(name);
            if (w) worlds.push(w);
            else lines.push(escH(L("SBE.Steps.GiveUnknown", { name })));
          }
          if (!worlds.length) break;
        } else {
          const w = game.items.get(st.item);
          if (!w) return stop(L("SBE.Steps.GiveMissing"));
          worlds = [w];
        }
        /* « Où » : la clé d'un conteneur ou d'un slot de la fiche ; vide = le premier conteneur qui l'accepte. */
        const whereKey = String(st.where ?? "").trim();
        const whereEl = whereKey ? [...walkElements(carrier.system?.template?.system?.elements ?? [])]
          .find(e => e?.key === whereKey && (e.kind === "container" || e.kind === "slot")) : null;
        const { QuestManager } = await import("../managers/quest/quest-manager.mjs");
        for (const world of worlds) {
          const placed = await QuestManager.giveItem(carrier, world, n, whereEl);
          lines.push(`+${n} ${escH(world.name)}${placed ? "" : ` (${escH(L("SBE.Quest.AtFeet"))})`}`);
        }
        break;
      }

      /* Expérience / Niveau : de l'XP (la clé d'XP du composant Niveau) ou
         des niveaux (disponibles à passer, ou passés tout de suite) au
         document du bouton, aux cibles, ou aux objets portés d'un modèle
         (compétence, métier…). */
      case "level": {
        const lvKey = String(st.key ?? "").trim();
        if (!lvKey) break;
        const n = numberOf(st.amount, scope, 1);
        if (!n) break;
        let docs;
        if (st.target === "targets") {
          docs = targetsNow();
          if (!docs.length) return stop(L("SBE.Steps.NoTarget"));
        } else if (st.target === "owned") {
          const carrier = carrierOf(item);
          if (carrier?.documentName !== "Actor") return stop(L("SBE.Steps.NoCarrier"));
          docs = [...(carrier.items ?? [])].filter(it => it.system?.modelId === st.item);
          if (!docs.length) return stop(L("SBE.Steps.Level.NoOwned", { name: game.items?.get(st.item)?.name ?? "?" }));
        } else docs = [item];
        const { LevelManager, levelElByKey } = await import("./levels/level-sheet.mjs");
        const { levelConfig } = await import("./levels/level-model.mjs");
        for (const d of docs) {
          const lv = levelElByKey(d, lvKey);
          if (!lv) { lines.push(escH(L("SBE.Steps.Level.NoLevel", { name: nameOf(d), k: lvKey }))); continue; }
          if (st.what === "xp") {
            const xk = levelConfig(lv).xpKey;
            if (!xk) { lines.push(escH(L("SBE.Steps.Level.NoXp", { k: lvKey }))); continue; }
            const cur = Number(d.system?.values?.[xk]) || 0;
            await writeValue(d, xk, cur + n);
            lines.push(`${escH(nameOf(d))} : ${n > 0 ? "+" : ""}${n} ${escH(elementOn(d, xk)?.label || xk)}`);
          } else {
            const k = Math.trunc(n);
            if (!k) continue;
            await LevelManager.grant(d, lv, k, ["available", "direct"].includes(st.mode) ? st.mode : "component");
            lines.push(`${escH(nameOf(d))} : ${k > 0 ? "+" : ""}${k} ${escH(lv.label || lvKey)}`);
          }
        }
        break;
      }

      /* Poser sur la scène : l'objet quitte l'inventaire et devient un
         objet de scène (pion non lié). À mettre en DERNIER : après, l'objet
         n'est plus dans le sac. Annuler la visée arrête le bouton. */
      case "place": {
        const carrier = carrierOf(item);
        if (carrier?.documentName !== "Actor") return stop(L("SBE.Steps.NoCarrier"));
        /* INVOQUER des créatures, ou RENVOYER celles de l'invocateur. */
        if (st.what === "creature" || st.what === "dismiss") {
          const { SummonManager } = await import("../managers/summon/summon-manager.mjs");
          if (st.what === "dismiss") {
            const who = st.actor ? game.actors.get(st.actor)?.name ?? "" : "";
            await SummonManager.dismiss(carrier, who);
            lines.push(escH(L("SBE.Summon.Dismissed", { name: who || L("SBE.Summon.All") })));
            break;
          }
          if (item.sheet?.rendered) await item.sheet.close({ animate: false });
          const r = await SummonManager.summon(carrier, st, scope);
          rolls.push(...r.rolls);
          if (r.error) return stop(r.error);
          if (!r.ok) return { ok: false, outcome: null, lines, rolls };
          lines.push(escH(L("SBE.Summon.Done", { n: r.n, name: r.name })));
          break;
        }
        /* La fiche de l'objet cacherait la carte pendant la pose. */
        if (item.sheet?.rendered) await item.sheet.close({ animate: false });
        const ok = await PropManager.place(item, carrier);
        if (!ok) return { ok: false, outcome: null, lines, rolls };
        lines.push(escH(L("SBE.Prop.Placed", { name: item.name })));
        break;
      }

      /* Scène : agit sur les éléments LIÉS à l'objet posé (portes,
         lumières, sons, visibilité, régions, téléportation). */
      case "scene": {
        const { PropScene } = await import("../managers/props/prop-scene.mjs");
        const r = await PropScene.runStep(item, st);
        if (r?.error) return stop(r.error);
        if (r?.cancel) return { ok: false, outcome: null, lines, rolls };
        break;
      }

      /* Quête : donner, faire avancer / révéler un objectif, changer le
         statut. Exécuté par le MJ principal (le joueur n'écrit pas). */
      case "quest": {
        if (!st.quest) break;
        const { QuestManager } = await import("../managers/quest/quest-manager.mjs");
        await QuestManager.runStep({ quest: st.quest, action: st.action ?? "give", obj: st.obj ?? "",
          amount: numberOf(st.amount, scope, 1), status: st.status ?? "success" });
        break;
      }

      /* Temps, météo, saison du calendrier : faits par le MJ principal
         (nombres calculés ici, avec les valeurs de l'objet). */
      case "time": case "weather": case "season": case "moon": {
        const { CalendarManager } = await import("../managers/calendar/calendar-manager.mjs");
        let amount = 0;
        if (String(st.amount ?? "").trim()) {
          const r = await formulaValue(st.amount, scope).catch(() => ({ value: 0, roll: null }));
          if (r.roll) rolls.push(r.roll);
          amount = Number.isFinite(Number(r.value)) ? Number(r.value) : 0;
        }
        const step = { ...st, kind: st.type, amount };
        delete step.type; delete step.onlyIf; delete step._inBlock;
        await CalendarManager.runStep(step);
        break;
      }

      /* Attendre : la suite se fera quand le temps sera écoulé. */
      case "wait": {
        const carrier = carrierOf(item);
        if (carrier?.documentName !== "Actor") return stop(L("SBE.Steps.NoCarrier"));
        const res = await UseManager.begin({
          item, el, actor: carrier, next: i + 1, st, scope,
          vars: { ...vars, _point: lastPoint, _hit: lastHit }, targets: lastTargets, picked, lines, outcome
        });
        if (!res) break;            /* durée nulle : on continue tout de suite */
        return { ok: true, outcome, pending: res, lines, rolls, actor: carrier, point: lastPoint, hit: lastHit, targets: lastTargets };
      }

      default:
        break;
    }
  }
  return { ok: true, outcome, lines, rolls, actor: carrierOf(item), point: lastPoint, hit: lastHit, targets: lastTargets, rollCard: vars._rollCard ?? null };
}

function slotLabel(item, key) {
  return elementByKey(item, key)?.label || key;
}

/**
 * REMPLIR un slot de cet objet depuis l'inventaire de son porteur :
 * on prend le même objet que celui déjà logé (on ne mélange jamais
 * deux munitions), ou, slot vide, le premier que le slot accepte.
 * Sans fenêtre : on charge le maximum possible.
 */
async function fillSlot(item, st, scope) {
  const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
  const slotEl = elementByKey(item, st.slot);
  const carrier = carrierOf(item);
  if (!slotEl || !carrier) return { ok: false, message: L("SBE.Steps.NoSlot", { slot: st.slot ?? "" }) };

  const held = heldIn(item, st.slot);
  const load = held.reduce((n, p) => n + qtyOf(p), 0);
  let cap = capacityOf(slotEl, scope);
  /* Un slot qui n'accepte pas les piles ne tient qu'UN exemplaire. */
  if (!acceptsStacks(slotEl)) cap = 1;
  const limit = String(st.limit ?? "").trim();
  if (limit) {
    const lim = numberOf(limit, scope, 0);
    cap = cap ? Math.min(cap, lim) : lim;
  }
  let room = cap ? cap - load : Infinity;
  if (room <= 0) return { ok: false, message: L("SBE.Steps.Full", { what: slotEl.label || st.slot }) };

  const all = carrier.items?.contents ?? [...(carrier.items ?? [])];
  /* Déjà chargé dans un AUTRE objet (le chargeur d'une autre arme) :
     on ne vide pas une arme pour en charger une autre. Le contenu d'un
     sac, lui, se prend. */
  const loadedElsewhere = (it) => {
    const h = String(it.system?.carry?.host ?? "");
    const host = h ? carrier.items?.get?.(h) : null;
    return elementByKey(host, it.system?.carry?.where)?.kind === "slot";
  };
  const candidates = all.filter(it => it.type === "objet" && it.id !== item.id
    && String(it.system?.carry?.host ?? "") !== item.id
    && !loadedElsewhere(it)
    && !slotAccepts(slotEl, it, item))
    .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
  if (!candidates.length) {
    /* Liste de compatibilité vide : c'est ÇA qu'il faut dire au joueur. */
    const lk = String(slotEl.config?.listKey ?? "").trim();
    if (lk && !refIds(item.system?.values, lk).length) return { ok: false, message: L("SBE.Slot.ListEmpty") };
    return { ok: false, message: L("SBE.Steps.NothingToLoad", { what: slotEl.label || st.slot }) };
  }

  /* SORTES disponibles : les piles qui fusionnent forment une sorte
     (9 mm ordinaire, 9 mm perforant…). Celle déjà chargée d'abord. */
  const groups = [];
  for (const c of candidates) {
    const g = groups.find(x => canMerge(x.items[0], c));
    if (g) g.items.push(c); else groups.push({ items: [c] });
  }
  for (const g of groups) {
    g.qty = g.items.reduce((n, p) => n + qtyOf(p), 0);
    g.loaded = !!held.length && canMerge(held[0], g.items[0]);
  }
  groups.sort((a, b) => (b.loaded - a.loaded));
  const roomFor = (g) => (g.loaded || !held.length ? room : (cap ? cap : Infinity));
  /* FENÊTRE : quelle munition, combien (le maximum proposé). */
  const pick = await askLoad(slotEl.label || st.slot, groups, roomFor);
  if (!pick) return { ok: false, silent: true };
  const g = groups[pick.index];
  /* Changer de sorte : la précédente retourne d'abord dans le sac. */
  if (held.length && !g.loaded) {
    await emptySlot(item, st);
    room = cap ? cap : Infinity;
  }
  let want = Math.min(pick.qty, room);
  for (const cand of g.items) {
    if (want <= 0) break;
    const n = Math.min(qtyOf(cand), want);
    const moved = await dropIntoContainer({ sheetDoc: item, el: slotEl, item: cand, quantity: n });
    if (moved) want -= n;
  }
  return { ok: true };
}

/**
 * Fenêtre « Recharger » : la sorte à charger (si plusieurs) et combien
 * (le maximum par défaut — Entrée suffit pour un rechargement normal).
 * @returns {Promise<{index:number, qty:number}|null>}
 */
async function askLoad(what, groups, roomFor) {
  const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
  const esc = (x) => foundry.utils.escapeHTML(String(x ?? ""));
  const maxOf = (g) => Math.max(0, Math.min(g.qty, roomFor(g)));
  const rows = groups.map((g, i) => {
    const it = g.items[0];
    return `<label class="sbe-load-row">
      <input type="radio" name="kind" value="${i}" ${i === 0 ? "checked" : ""} data-max="${maxOf(g)}">
      <img src="${esc(it.img || "icons/svg/item-bag.svg")}" alt="">
      <span class="sbe-load-name">${esc(it.name)}</span>
      <span class="sbe-load-qty">×${g.qty}</span>
      ${g.loaded ? `<span class="sbe-load-tag">${esc(L("SBE.Steps.LoadLoaded"))}</span>` : ""}
    </label>`;
  }).join("");
  const first = maxOf(groups[0]);
  const content = `<div class="sbe-load">
    ${groups.length > 1 ? `<p class="notes">${esc(L("SBE.Steps.LoadPickHint"))}</p><div class="sbe-load-list">${rows}</div>` : `<div class="sbe-load-list">${rows}</div>`}
    <div class="form-group" style="display:flex;flex-direction:column;gap:3px;margin-top:6px;">
      <label>${esc(L("SBE.Steps.LoadHowMany"))}</label>
      <input type="number" name="qty" value="${first}" min="1" max="${first}" step="1" autofocus>
      <p class="notes sbe-load-max">${esc(L("SBE.Inv.HowManyMax", { max: first }))}</p>
    </div></div>`;
  const res = await foundry.applications.api.DialogV2.wait({
    window: { title: L("SBE.Steps.LoadTitle", { what }), icon: "fa-solid fa-rotate" },
    classes: ["sbe-load-dialog"],
    content,
    render: (_ev, dlg) => {
      const root = dlg.element ?? dlg;
      const qty = root.querySelector('[name="qty"]');
      const note = root.querySelector(".sbe-load-max");
      for (const r of root.querySelectorAll('[name="kind"]')) {
        r.addEventListener("change", () => {
          const m = Number(r.dataset.max) || 0;
          qty.max = m; qty.value = m;
          if (note) note.textContent = L("SBE.Inv.HowManyMax", { max: m });
        });
      }
    },
    buttons: [{
      action: "ok", label: L("SBE.Steps.LoadOk"), icon: "fa-solid fa-check", default: true,
      callback: (_ev, button) => {
        const f = button.form.elements;
        const index = Number([...button.form.querySelectorAll('[name="kind"]')].find(x => x.checked)?.value ?? 0);
        const m = maxOf(groups[index]);
        const qty = Math.max(1, Math.min(m, Math.floor(Number(f.qty?.value) || m)));
        return { index, qty };
      }
    }, { action: "cancel", label: L("SBE.Common.Cancel"), icon: "fa-solid fa-xmark" }],
    rejectClose: false
  }).catch(() => null);
  return res && typeof res === "object" ? res : null;
}

/** VIDER un slot de cet objet : son contenu rejoint l'inventaire. */
async function emptySlot(item, st) {
  const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
  const carrier = carrierOf(item);
  const piles = heldIn(item, st.slot);
  if (!carrier || !piles.length) return { ok: false, message: L("SBE.Steps.AlreadyEmpty", { what: slotLabel(item, st.slot) }) };
  const ctpl = carrier.system?.template;
  for (const p of piles) {
    const key = OrphanCleanup.firstContainerFor(carrier, p);
    const cont = key ? [...walkElements(ctpl?.system?.elements ?? [])].find(e => e?.key === key) : null;
    if (cont) {
      /* Par le rangement normal : la pile rejoint celle du sac. */
      await dropIntoContainer({ sheetDoc: carrier, el: cont, item: p, quantity: qtyOf(p) });
    } else {
      await p.update({ "system.carry.host": "", "system.carry.where": "" });
    }
  }
  return { ok: true };
}

/** Étape « Consommer » (charges d'une clé, ou l'objet lui-même). */
async function consume(item, el) {
  const c = el.config ?? {};
  const key = c.chargesKey ?? "";
  const onZero = c.onZero ?? "none";

  /* Montant : nombre fixe OU formule sur les clés de l'objet. */
  const rawAmount = String(c.amount ?? "1").trim() || "1";
  let amount;
  if (/^-?\d+(\.\d+)?$/.test(rawAmount)) {
    amount = Number(rawAmount);
  } else {
    const tplDoc = item.system.template;
    const scope = buildScope(tplDoc?.system.elements ?? [], item.system.values ?? {},
      { inventory: buildInventory(item) });
    amount = Number(evalExpression(rawAmount, scope));
    if (!Number.isFinite(amount)) {
      ui.notifications.warn(game.i18n.format("SBE.Button.AmountFormulaFail", { formula: rawAmount }));
      amount = 1;
    }
  }
  amount = Math.max(0, amount);
  if (amount <= 0) return;

  if (key) {
    const chargesEl = [...walkElements(item.system.template?.system.elements ?? [])].find(e => e.key === key);
    const cur = Number(item.system.values?.[key] ?? chargesEl?.config?.default ?? 0) || 0;
    if (cur <= 0) {
      if (onZero === "none") return;
      return consumeObject(item, onZero);
    }
    const next = Math.max(0, cur - amount);
    await item.update({ [`system.values.${key}`]: next });
    ui.notifications.info(game.i18n.format("SBE.Button.Consumed", { name: item.name, remaining: next }));
    if (next <= 0 && onZero !== "none") await consumeObject(item, onZero);
    return true;
  }
  /* Pas de champ de charges : c'est l'objet lui-même qui se consomme. */
  return consumeObject(item, onZero === "none" ? "delete" : onZero);
}

/**
 * @returns {Promise<boolean>} l'objet a bien été consommé
 * Épuisement. « qty » : un exemplaire de la pile part (et l'objet avec
 * le dernier) — l'inventaire existe désormais, le branchement promis
 * est fait. « delete » : l'objet est supprimé, après confirmation.
 */
async function consumeObject(item, onZero) {
  if (onZero === "qty" && isStackableItem(item)) {
    const left = qtyOf(item) - 1;
    if (left > 0) {
      await item.update({ [`system.values.${QUANTITY_KEY}`]: left });
      return true;
    }
    await item.delete();
    return true;
  }
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: game.i18n.localize("SBE.Button.DepletedTitle") },
    content: `<p>${game.i18n.format("SBE.Button.DepletedConfirm", {
      name: foundry.utils.escapeHTML(item.name)
    })}</p>`,
    rejectClose: false
  }).catch(() => false);
  if (!ok) return false;
  await item.delete();
  return true;
}

/** Fenêtre de sous-actions d'un bouton-menu. `run` : qui lance le bouton choisi (par défaut runAction ; un objet
    posé passe par PropManager.run, au nom du personnage qui interagit). */
export function openActionMenu(item, el, run = null) {
  const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
  const children = (el.children ?? []).filter(b => b?.kind === "button")
    .filter(b => game.user.isGM || b.playerVisible !== false);
  const rows = children.map(b => {
    const reason = unavailableReason(item, b);
    return `
      <button type="button" class="sbe-btnmenu-item" data-btn-id="${esc(b.id)}"
              ${reason ? `aria-disabled="true" data-tooltip-text="${esc(reason)}"` : ""}>
        ${btnIconHTML(b.config?.icon)}
        <span>${esc(b.label || b.key)}</span>
      </button>`;
  }).join("");

  const dlg = new foundry.applications.api.DialogV2({
    window: { title: el.label || el.key },
    position: { width: 300 },
    content: `<div class="sbe-btnmenu">${rows || `<p class="notes">${game.i18n.localize("SBE.Button.MenuEmpty")}</p>`}</div>`,
    buttons: [{ action: "close", label: game.i18n.localize("SBE.Common.Close"), icon: "fa-solid fa-xmark" }]
  });
  dlg.render({ force: true });
  const wire = () => {
    const root = dlg.element;
    if (!root) { setTimeout(wire, 30); return; }
    for (const btn of root.querySelectorAll(".sbe-btnmenu-item")) {
      /* Grisé mais survolable (aria-disabled) : la raison s'affiche. */
      btn.addEventListener("click", () => {
        if (btn.getAttribute("aria-disabled") === "true") return;
        if (run) run(btn.dataset.btnId); else runAction(item, btn.dataset.btnId);
      });
    }
  };
  setTimeout(wire, 30);
}
