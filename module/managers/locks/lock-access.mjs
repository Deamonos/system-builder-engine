/**
 * SBE — ACCÈS À UN VERROU : clés et outils acceptés
 *
 * Sur chaque verrou (porte, coffre), le MJ glisse :
 *   lockKeys   des CLÉS — un exemplaire porté ouvre, sans jet ;
 *   lockTools  des OUTILS de crochetage ;
 *   digiTools  des OUTILS de piratage (digicode piratable).
 * Le MJ décide, par verrou : outil obligatoire ou non (sans outil, on
 * tente à mains nues), et jet même avec un outil ou non (sans jet,
 * l'outil ouvre). Le champ de l'outil qui porte la MÊME clé que le jet
 * (« crochetage » sur un kit) s'ajoute à ce jet — et à lui seul.
 * Ce sont des objets DU MONDE : un exemplaire porté se reconnaît par
 * son modèle d'origine (system.modelId), donc chaque copie compte.
 *
 * Au clic sur le verrou, une petite fenêtre ne propose QUE ce qui est
 * possible pour ce personnage. Rien de possible : pas de fenêtre.
 */

import { ToolWear } from "./tool-wear.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const L = (k) => game.i18n.localize(k);

export const REF_FIELDS = ["lockKeys", "lockTools", "digiTools"];

/** Liste d'identifiants propre. */
export function refIds(cfg, field) {
  const v = cfg?.[field];
  return Array.isArray(v) ? [...new Set(v.map(String).filter(Boolean))] : [];
}

/** Objets portés par ce personnage qui sont un exemplaire de ces objets du monde. */
export function carriedMatches(actor, ids) {
  if (!actor || !ids?.length) return [];
  const set = new Set(ids);
  return (actor.items ?? []).filter(it => it.type === "objet"
    && (set.has(String(it.system?.modelId ?? "")) || set.has(it.id)));
}

/* ------------------------------------------------------------ */
/*  Liste à déposer (configuration du MJ)                       */
/* ------------------------------------------------------------ */

function chip(id) {
  const it = game.items?.get(id);
  return `<span class="sbe-lockref" data-id="${esc(id)}">
    <img src="${esc(it?.img || "icons/svg/item-bag.svg")}" alt="">
    <span>${esc(it?.name ?? L("SBE.Locks.RefMissing"))}</span>
    <a class="sbe-lockref-del" data-tooltip-text="${esc(L("SBE.Locks.RefRemove"))}"><i class="fa-solid fa-xmark"></i></a>
  </span>`;
}

/** Bloc HTML : libellé au-dessus, puis la zone de dépôt. */
export function refListHtml(field, ids, label, hint = "") {
  return `<div class="sbe-lockref-box" data-field="${field}" data-ids="${esc(JSON.stringify(ids ?? []))}">
    <label class="sbe-lockref-label">${esc(L(label))}</label>
    <div class="sbe-lockref-drop">
      ${(ids ?? []).map(chip).join("")}
      <span class="sbe-lockref-ph">${esc(L("SBE.Locks.RefDrop"))}</span>
    </div>
    ${hint ? `<p class="notes">${esc(L(hint))}</p>` : ""}
  </div>`;
}

/** Lit les listes d'un formulaire : { lockKeys: [...], ... }. */
export function readRefLists(root) {
  const out = {};
  for (const box of root?.querySelectorAll?.(".sbe-lockref-box") ?? []) {
    try { out[box.dataset.field] = JSON.parse(box.dataset.ids || "[]"); }
    catch (_e) { out[box.dataset.field] = []; }
  }
  return out;
}

/**
 * Branche le dépôt et le retrait. `onChange(field, ids)` est appelé
 * à chaque changement (sauvegarde immédiate) — facultatif.
 */
export function wireRefLists(root, onChange = null) {
  for (const box of root?.querySelectorAll?.(".sbe-lockref-box") ?? []) {
    const drop = box.querySelector(".sbe-lockref-drop");
    const ids = () => { try { return JSON.parse(box.dataset.ids || "[]"); } catch (_e) { return []; } };
    const set = (list) => {
      box.dataset.ids = JSON.stringify(list);
      drop.querySelectorAll(".sbe-lockref").forEach(n => n.remove());
      drop.insertAdjacentHTML("afterbegin", list.map(chip).join(""));
      onChange?.(box.dataset.field, list);
    };
    drop.addEventListener("dragover", (ev) => { ev.preventDefault(); drop.classList.add("is-over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
    drop.addEventListener("drop", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      drop.classList.remove("is-over");
      let data = null;
      try { data = foundry.applications.ux.TextEditor.implementation.getDragEventData(ev); } catch (_e) { /* illisible */ }
      if (data?.type !== "Item" || !data.uuid) return;
      const item = await fromUuid(data.uuid).catch(() => null);
      /* Un objet du monde (pas un exemplaire porté, pas un modèle). */
      const world = item?.parent ? game.items.get(String(item.system?.modelId ?? "")) : item;
      if (!world || world.type !== "objet" || world.pack) {
        ui.notifications.warn(L("SBE.Locks.RefOnlyWorld"));
        return;
      }
      const list = ids();
      if (!list.includes(world.id)) set([...list, world.id]);
    });
    drop.addEventListener("click", (ev) => {
      const del = ev.target.closest(".sbe-lockref-del");
      if (!del) return;
      ev.preventDefault();
      const id = del.closest(".sbe-lockref")?.dataset.id;
      set(ids().filter(x => x !== id));
    });
  }
}

/* ------------------------------------------------------------ */
/*  Ce que ce personnage peut faire                             */
/* ------------------------------------------------------------ */

/**
 * Les actions possibles sur ce verrou pour ce personnage.
 * @param {object} cfg       config du verrou
 * @param {Actor} actor
 * @param {{pick:boolean, digi:boolean}} kind  quels mécanismes sont actifs
 * @returns {Array<{type:"key"|"pick"|"code"|"hack", item?:Item, label:string, icon:string, disabled?:boolean, reason?:string}>}
 */
export function accessOptions(cfg, actor, { pick = false, digi = false } = {}) {
  const out = [];
  for (const key of uniqueByModel(carriedMatches(actor, refIds(cfg, "lockKeys")))) {
    out.push({ type: "key", item: key, icon: "fa-solid fa-key",
      label: game.i18n.format("SBE.Locks.UseKey", { name: key.name }) });
  }
  /* Outils portés (un bouton par outil), puis — si le MJ le permet —
     la tentative sans outil. */
  const tools = (field, type, icon, labelKey, bareKey, required) => {
    for (const it of uniqueByModel(carriedMatches(actor, refIds(cfg, field)))) {
      const ok = ToolWear.usable(it);
      out.push({ type, item: it, icon, label: game.i18n.format(labelKey, { name: it.name }),
        disabled: !ok, reason: ok ? "" : L("SBE.Locks.ToolWorn") });
    }
    if (!required) out.push({ type, item: null, icon, label: L(bareKey) });
  };
  if (pick && !cfg.lockBroken) tools("lockTools", "pick", "fa-solid fa-unlock-keyhole", "SBE.Locks.PickWith", "SBE.Locks.PickBare", !!cfg.lockToolRequired);
  /* Digicode : le clavier, comme toujours ; le piratage est la touche
     du clavier lui-même (voir hackOptions). */
  if (digi && !cfg.digiBroken) out.push({ type: "code", icon: "fa-solid fa-keyboard", label: L("SBE.Locks.EnterCode") });
  return out;
}

/** Les moyens de pirater ce digicode pour ce personnage (outils portés, mains nues). */
export function hackOptions(cfg, actor) {
  if (!cfg?.digiHackable || cfg.digiBroken) return [];
  const out = [];
  for (const it of uniqueByModel(carriedMatches(actor, refIds(cfg, "digiTools")))) {
    const ok = ToolWear.usable(it);
    out.push({ type: "hack", item: it, icon: "fa-solid fa-laptop-code",
      label: game.i18n.format("SBE.Locks.HackWith", { name: it.name }),
      disabled: !ok, reason: ok ? "" : L("SBE.Locks.ToolWorn") });
  }
  if (!cfg.digiToolRequired) out.push({ type: "hack", item: null, icon: "fa-solid fa-laptop-code", label: L("SBE.Locks.HackBare") });
  return out;
}

/** Un seul bouton par objet du monde (deux exemplaires = un choix). */
function uniqueByModel(items) {
  const seen = new Set();
  return items.filter(it => {
    const m = String(it.system?.modelId || it.id);
    if (seen.has(m)) return false;
    seen.add(m);
    return true;
  });
}

/** Petite fenêtre : un bouton par action possible. Retourne l'option choisie ou null. */
export async function askAccess(title, options) {
  const content = `<div class="sbe-lockask">${options.map((o, i) => `
    <button type="button" class="sbe-lockask-btn" data-i="${i}" ${o.disabled ? "disabled" : ""}
      ${o.reason ? `data-tooltip-text="${esc(o.reason)}"` : ""}>
      <i class="${esc(o.icon)}"></i> <span>${esc(o.label)}</span>
    </button>`).join("")}</div>`;
  return new Promise((resolve) => {
    let picked = null;
    const dlg = new foundry.applications.api.DialogV2({
      window: { title, icon: "fa-solid fa-lock" },
      position: { width: 340 },
      content,
      buttons: [{ action: "cancel", label: L("SBE.Common.Cancel"), icon: "fa-solid fa-xmark" }],
      submit: () => resolve(picked)
    });
    dlg.addEventListener?.("close", () => resolve(picked));
    dlg.render({ force: true }).then(() => {
      dlg.element?.querySelectorAll(".sbe-lockask-btn").forEach(b => b.addEventListener("click", (ev) => {
        ev.preventDefault();
        picked = options[Number(b.dataset.i)] ?? null;
        resolve(picked);
        dlg.close();
      }));
    });
  });
}

/* ------------------------------------------------------------ */
/*  Options d'un mécanisme (serrure « lock », piratage « digi ») */
/* ------------------------------------------------------------ */

/**
 * Bloc commun : outil obligatoire, jet même avec un outil, difficulté
 * (aucune, modificateur, seuil). Les champs portent data-lk = nom de
 * la clé de config : readLockOptions / wireLockOptions les lisent.
 */
export function lockOptionsHtml(prefix, cfg) {
  const old = String(cfg?.[`${prefix}RollMod`] ?? "").trim();
  const mode = ["mod", "goal"].includes(cfg?.[`${prefix}DiffMode`]) ? cfg[`${prefix}DiffMode`] : (old ? "mod" : "none");
  const diff = cfg?.[`${prefix}Diff`] ?? (old ? `-(${old})` : "");
  const chk = (k, label, hint) => `<div class="sbe-lockopt-row">
      <label class="sbe-lockopt-check"><input type="checkbox" data-lk="${prefix}${k}" ${cfg?.[`${prefix}${k}`] ? "checked" : ""}> ${esc(L(label))}</label>
      <p class="notes">${esc(L(hint))}</p></div>`;
  return `<div class="sbe-lockopt">
    ${chk("ToolRequired", "SBE.Locks.ToolRequired", "SBE.Locks.ToolRequiredHint")}
    ${chk("RollWithTool", "SBE.Locks.RollWithTool", "SBE.Locks.RollWithToolHint")}
    <div class="sbe-lockopt-f">
      <label>${esc(L("SBE.Locks.Difficulty"))}</label>
      <div class="sbe-lockopt-diff">
        <select data-lk="${prefix}DiffMode">
          ${["none", "mod", "goal"].map(m => `<option value="${m}" ${mode === m ? "selected" : ""}>${esc(L(`SBE.Locks.Diff_${m}`))}</option>`).join("")}
        </select>
        <input type="text" data-lk="${prefix}Diff" value="${esc(diff)}" placeholder="20">
      </div>
      <p class="notes">${esc(L("SBE.Locks.DifficultyHint"))}</p>
    </div>
  </div>`;
}

/** Lit les options d'un formulaire : { lockToolRequired, lockDiffMode, … }. */
export function readLockOptions(root) {
  const out = {};
  for (const el of root?.querySelectorAll?.("[data-lk]") ?? []) {
    out[el.dataset.lk] = el.type === "checkbox" ? el.checked : String(el.value ?? "").trim();
  }
  return out;
}

/** Sauvegarde immédiate de chaque option (coffre posé). */
export function wireLockOptions(root, onChange) {
  for (const el of root?.querySelectorAll?.("[data-lk]") ?? []) {
    el.addEventListener("change", () => onChange?.(el.dataset.lk,
      el.type === "checkbox" ? el.checked : String(el.value ?? "").trim()));
  }
}
