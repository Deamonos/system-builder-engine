/**
 * SBE — ATELIER : annuler / rétablir
 *
 * Toute modification d'un MODÈLE (objet ou personnage) est retenue :
 * composants, onglets, thème, panneau posé, HUD, médias, réglages de
 * scène, barres, nom, image. Une seule source : les écritures du modèle
 * elles-mêmes (preUpdate / update), quel que soit l'endroit d'où elles
 * partent — pas un appel par fenêtre.
 *
 * - Historique par modèle, gardé tant que le monde est ouvert (perdu au
 *   rechargement), 50 pas.
 * - Une entrée garde l'avant et l'après des seules parties changées ;
 *   annuler réécrit l'avant (rétablir, l'après) sans créer d'entrée.
 * - Un « Renommer partout » forme UNE entrée (batch) : l'annuler refait
 *   le renommage dans l'autre sens, partout, avec la même fenêtre.
 * - Commandes : boutons ↶ ↷ de l'en-tête de l'atelier, Ctrl+Z / Ctrl+Y
 *   (Ctrl+Maj+Z) quand l'atelier est la fenêtre active.
 */

import { SYSTEM_ID } from "../helpers/constants.mjs";
import { childLists } from "./element-renderer.mjs";

const MAX = 50;
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
/* Parties du modèle qui ne sont pas des réglages (compteur de version). */
const SKIP = new Set(["structVersion"]);

/* uuid du modèle → { undo: [], redo: [] } */
const STACKS = new Map();
/* Écritures en cours : uuid → parties d'avant. */
const PENDING = new Map();
/* Opérations groupées (renommage) ou annulation en cours : on n'écoute pas. */
let muted = 0;

const isModel = (doc) => doc?.type === "template" && ["Item", "Actor"].includes(doc.documentName) && !doc.parent;
const stackOf = (doc) => {
  if (!STACKS.has(doc.uuid)) STACKS.set(doc.uuid, { undo: [], redo: [] });
  return STACKS.get(doc.uuid);
};
const clone = (v) => (v === undefined ? undefined : foundry.utils.deepClone(v));

/** Les parties suivies d'un modèle : nom, image, et chaque clé de system. */
function partsOf(doc, keys = null) {
  const src = doc._source ?? {};
  const out = {};
  const want = keys ?? ["name", "img", ...Object.keys(src.system ?? {}).map(k => `system.${k}`)];
  for (const k of want) {
    if (SKIP.has(k.replace(/^system\./, ""))) continue;
    out[k] = clone(k.startsWith("system.") ? src.system?.[k.slice(7)] : src[k]);
  }
  return out;
}

/** Ce que touche une écriture (parties de premier niveau). */
function touched(changes) {
  const keys = [];
  if ("name" in (changes ?? {})) keys.push("name");
  if ("img" in (changes ?? {})) keys.push("img");
  for (const k of Object.keys(changes?.system ?? {})) {
    const base = k.split(".")[0].replace(/^-=/, "");
    if (!SKIP.has(base)) keys.push(`system.${base}`);
  }
  return [...new Set(keys)];
}

/** Seulement ce qui a vraiment changé. */
function diff(before, after) {
  const b = {}, a = {};
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (foundry.utils.equals({ v: before[k] ?? null }, { v: after[k] ?? null })) continue;
    b[k] = before[k];
    a[k] = after[k];
  }
  return Object.keys(b).length ? { before: b, after: a } : null;
}

/* ============================================================ */
/*  Libellé d'une entrée (« ajout de « PV » »…)                  */
/* ============================================================ */

/** Composants à plat : id → { sig (réglages), place (parent + rang), name }. */
function flat(list) {
  const out = new Map();
  const walk = (arr, parent) => (arr ?? []).forEach((el, i) => {
    if (!el) return;
    const id = el.id ?? el.key ?? `${parent}:${i}`;
    const own = { ...el };
    delete own.children;
    delete own.cols;
    out.set(id, { sig: JSON.stringify(own), place: `${parent}:${i}`, name: el.label || el.key || el.kind });
    childLists(el).forEach((sub, j) => walk(sub, `${id}/${j}`));
  });
  walk(list, "");
  return out;
}

function labelOf(before, after) {
  const keys = Object.keys(after);
  if (keys.length === 1 && keys[0] === "system.elements") {
    const b = flat(before["system.elements"]), a = flat(after["system.elements"]);
    const added = [...a.keys()].filter(id => !b.has(id));
    const removed = [...b.keys()].filter(id => !a.has(id));
    const edited = [...a.keys()].filter(id => b.has(id) && b.get(id).sig !== a.get(id).sig);
    const moved = [...a.keys()].filter(id => b.has(id) && b.get(id).place !== a.get(id).place);
    const one = (kind, ids, map) => L(`SBE.History.${kind}`, { name: map.get(ids[0]).name });
    if (added.length === 1 && !removed.length) return one("Add", added, a);
    if (removed.length === 1 && !added.length) return one("Remove", removed, b);
    if (!added.length && !removed.length && edited.length === 1) return one("Edit", edited, a);
    if (!added.length && !removed.length && !edited.length && moved.length) return one("Move", moved, a);
    const n = new Set([...added, ...removed, ...edited, ...moved]).size;
    if (n) return L("SBE.History.Several", { n });
  }
  if (keys.length === 1) {
    const k = `SBE.History.Part.${keys[0].replace(/^system\./, "")}`;
    if (game.i18n.has(k)) return L(k);
  }
  return L("SBE.History.Generic");
}

/* ============================================================ */
/*  Écoute des écritures                                         */
/* ============================================================ */

function onPre(doc, changes, options, userId) {
  if (muted || options?.sbeHistory || userId !== game.user.id || !isModel(doc)) return;
  const keys = touched(changes);
  if (keys.length) PENDING.set(doc.uuid, partsOf(doc, keys));
}

function onUpdate(doc, _changes, options, userId) {
  if (options?.sbeHistory || userId !== game.user.id || !isModel(doc)) return;
  const before = PENDING.get(doc.uuid);
  PENDING.delete(doc.uuid);
  if (muted || !before) return;
  const d = diff(before, partsOf(doc, Object.keys(before)));
  if (d) push(doc, { ...d, label: labelOf(d.before, d.after) });
}

function push(doc, entry) {
  const st = stackOf(doc);
  st.undo.push(entry);
  if (st.undo.length > MAX) st.undo.shift();
  st.redo.length = 0;
  refresh(doc);
}

/* ============================================================ */
/*  API                                                          */
/* ============================================================ */

export class WorkshopHistory {

  static init() {
    for (const d of ["Item", "Actor"]) {
      Hooks.on(`preUpdate${d}`, onPre);
      Hooks.on(`update${d}`, onUpdate);
    }
    /* Raccourcis (modifiables dans les commandes de Foundry). Actifs
       seulement quand un atelier est la fenêtre active ; sinon Foundry
       garde les siens (Ctrl+Z de la carte). */
    const P = CONST.KEYBINDING_PRECEDENCE.PRIORITY;
    const run = (redo) => () => {
      const app = ui.activeWindow;
      const doc = app?.document;
      if (!app?.sbeWorkshop || !isModel(doc)) return false;
      (redo ? this.redo(doc) : this.undo(doc));
      return true;
    };
    game.keybindings.register(SYSTEM_ID, "workshopUndo", {
      name: "SBE.History.KeyUndo", editable: [{ key: "KeyZ", modifiers: ["Control"] }],
      onDown: run(false), precedence: P
    });
    game.keybindings.register(SYSTEM_ID, "workshopRedo", {
      name: "SBE.History.KeyRedo",
      editable: [{ key: "KeyY", modifiers: ["Control"] }, { key: "KeyZ", modifiers: ["Control", "Shift"] }],
      onDown: run(true), precedence: P
    });
  }

  /** Ce que ferait Annuler / Rétablir (libellé), ou "". */
  static peek(doc, redo = false) {
    const st = STACKS.get(doc?.uuid);
    return (redo ? st?.redo : st?.undo)?.at(-1)?.label ?? "";
  }

  /**
   * Opération groupée : une seule entrée pour tout ce que fait `fn` sur
   * ce modèle (et rien d'enregistré pour les autres modèles touchés).
   * @param {object} [extra] { rename: { old, nw } }
   */
  static async batch(doc, fn, extra = {}) {
    const before = partsOf(doc);
    muted++;
    try { return await fn(); }
    finally {
      muted--;
      const d = diff(before, partsOf(doc));
      if (d) {
        const label = extra.rename ? L("SBE.History.Rename", { old: extra.rename.old, nw: extra.rename.nw }) : labelOf(d.before, d.after);
        push(doc, { ...d, ...extra, label });
      }
    }
  }

  static async undo(doc) { return this.#step(doc, false); }
  static async redo(doc) { return this.#step(doc, true); }

  static async #step(doc, redo) {
    const st = stackOf(doc);
    const from = redo ? st.redo : st.undo;
    const to = redo ? st.undo : st.redo;
    const entry = from.at(-1);
    if (!entry) { ui.notifications.info(L(redo ? "SBE.History.NothingRedo" : "SBE.History.Nothing")); return; }
    const target = redo ? entry.after : entry.before;
    muted++;
    try {
      if (entry.rename) {
        /* Renommage : dans l'autre sens, partout (même fenêtre). */
        const { KeyRename } = await import("../managers/checker/checker-app.mjs");
        const [old, nw] = redo ? [entry.rename.old, entry.rename.nw] : [entry.rename.nw, entry.rename.old];
        const plan = await KeyRename.ask(doc, old, nw);
        if (!plan) return;
        await KeyRename.moveValues(plan);
        await this.#write(doc, target);
        await KeyRename.applyRefs(plan);
      } else {
        await this.#write(doc, target);
      }
    } finally { muted--; }
    from.pop();
    to.push(entry);
    ui.notifications.info(L(redo ? "SBE.History.Redone" : "SBE.History.Undone", { what: entry.label }));
    refresh(doc);
  }

  /** Réécrit des parties du modèle telles quelles. */
  static async #write(doc, parts) {
    const ops = foundry.data.operators;
    const upd = {};
    for (const [k, v] of Object.entries(parts)) {
      if (v === undefined) upd[k] = ops.ForcedDeletion.create();
      else if (v && typeof v === "object" && !Array.isArray(v)) upd[k] = ops.ForcedReplacement.create(clone(v));
      else upd[k] = clone(v);
    }
    /* La structure change : les fiches doivent le savoir. */
    if ("system.elements" in parts) upd["system.structVersion"] = (doc.system?.structVersion ?? 0) + 1;
    await doc.update(upd, { sbeHistory: true });
  }
}

/* ============================================================ */
/*  Boutons ↶ ↷ de l'en-tête de l'atelier                        */
/* ============================================================ */

/** Les ateliers ouverts sur ce modèle remettent leurs boutons à jour. */
function refresh(doc) {
  for (const app of foundry.applications.instances.values()) {
    if (app.sbeWorkshop && app.document === doc) wireHistoryButtons(app);
  }
}

/** Pose (une fois) et met à jour les boutons de l'en-tête. */
export function wireHistoryButtons(app) {
  const header = app.window?.header;
  const doc = app.document;
  if (!header || !doc) return;
  let box = header.querySelector(".sbe-history");
  if (!box) {
    box = document.createElement("span");
    box.className = "sbe-history";
    box.innerHTML = `
      <button type="button" class="header-control icon fa-solid fa-rotate-left" data-sbe-hist="undo"></button>
      <button type="button" class="header-control icon fa-solid fa-rotate-right" data-sbe-hist="redo"></button>`;
    const anchor = header.querySelector('[data-action="toggleControls"], [data-action="close"]');
    if (anchor) anchor.before(box); else header.append(box);
    box.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-sbe-hist]");
      if (!b || b.disabled) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (b.dataset.sbeHist === "redo") WorkshopHistory.redo(doc); else WorkshopHistory.undo(doc);
    });
  }
  for (const [act, redo] of [["undo", false], ["redo", true]]) {
    const b = box.querySelector(`[data-sbe-hist="${act}"]`);
    const what = WorkshopHistory.peek(doc, redo);
    b.disabled = !what;
    const tip = what ? L(redo ? "SBE.History.RedoWhat" : "SBE.History.UndoWhat", { what })
      : L(redo ? "SBE.History.NothingRedo" : "SBE.History.Nothing");
    b.dataset.tooltipText = tip;
    b.setAttribute("aria-label", tip);
  }
}
