/**
 * SBE — APRÈS LE JET : relances et bonus payés avec une ressource
 *
 * Réglé sur chaque champ à jet (atelier, volet « Après le jet ») :
 *   after = { key, uses, who: "both"|"player"|"gm",
 *             actions: [{ id, type: "all"|"failed"|"dice"|"bonus",
 *                         label, cost, value, keep: "best"|"new", max }] }
 *   key   ressource (clé de la fiche qui paie ; vide = gratuit)
 *   uses  utilisations par jet, toutes actions confondues (formule, 1)
 *   cost  ce que coûte l'action (formule, 1) ; value : les dés ajoutés
 *         (« 1d6 ») ou le bonus (« 2 ») ; keep : après une relance, le
 *         meilleur ou le nouveau ; max : limite propre à l'action (vide =
 *         seulement la limite du jet).
 *
 * Deux moments (au choix de l'appelant, jamais du joueur) :
 *  - « now »  : une fenêtre juste après les dés, AVANT la suite (bouton
 *               à étapes, attaque, verrou…) : tout se joue ensuite avec
 *               le résultat final ;
 *  - « card » : un jet sans suite (libellé de la fiche, HUD, dernière
 *               étape d'un bouton) : des boutons sur la carte, qui se
 *               met à jour (field-roll.mjs, reprise du jet).
 *
 * L'état d'un jet (gardé dans la carte) :
 *   { used, per: {id: n}, extras: [{ id, kind: "dice"|"bonus"|"reroll",
 *     label, total, roll? }], old: [rollJSON…] }
 */

import { evalExpression, rollableFormula } from "./formula-engine.mjs";
import { docScope } from "./doc-context.mjs";
import { carrierOf } from "./inventory.mjs";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
export const AFTER_TYPES = ["all", "failed", "dice", "bonus", "damage"];
const REROLLS = new Set(["all", "failed", "damage"]);
export const AFTER_WHO = ["both", "player", "gm"];

/**
 * Réglage nettoyé ; null = rien après le jet.
 * @param keepEmpty  garder la ressource, les utilisations et « qui » même
 *                   sans action (atelier : rien de ce qui est saisi ne se
 *                   perd) ; le jet, lui, ne propose rien sans action.
 */
export function cleanAfter(a, { keepEmpty = false } = {}) {
  const s = (v) => String(v ?? "").trim();
  const actions = (Array.isArray(a?.actions) ? a.actions : []).map(x => ({
    id: s(x?.id) || foundry.utils.randomID(),
    type: AFTER_TYPES.includes(x?.type) ? x.type : "all",
    label: s(x?.label), cost: s(x?.cost), value: s(x?.value),
    keep: x?.keep === "new" ? "new" : "best", max: s(x?.max)
  })).filter(x => REROLLS.has(x.type) || x.value);
  const out = { key: s(a?.key), uses: s(a?.uses), who: AFTER_WHO.includes(a?.who) ? a.who : "both", actions };
  if (actions.length) return out;
  return keepEmpty && (out.key || out.uses || out.who !== "both") ? out : null;
}

/**
 * Les actions d'un moment précis : celles du JET (tout sauf les dégâts),
 * ou celles des DÉGÂTS d'une attaque (« Relancer les dégâts »).
 * null = rien à proposer.
 */
export function afterFor(after, what) {
  if (!after) return null;
  const actions = after.actions.filter(a => (what === "damage") === (a.type === "damage"));
  return actions.length ? { ...after, actions } : null;
}

export function freshState() { return { used: 0, per: {}, extras: [], old: [] }; }

/** Qui paie : le personnage (le porteur pour un objet). */
export function payerOf(doc) {
  if (doc?.documentName === "Actor") return doc;
  return carrierOf(doc) ?? null;
}

const num = (raw, scope, d) => {
  const t = String(raw ?? "").trim();
  if (!t) return d;
  const n = Number.isFinite(Number(t)) ? Number(t) : Number(evalExpression(t, scope));
  return Number.isFinite(n) ? n : d;
};

/** Libellé d'une action (le sien, sinon son type). */
export function actionLabel(a) {
  if (a.label) return a.label;
  if (a.type === "dice") return `+${a.value}`;
  if (a.type === "bonus") return `${/^[-+]/.test(a.value) ? "" : "+"}${a.value}`;
  return L(`SBE.After.Type_${a.type}`);
}

/**
 * Les actions encore possibles (coût, ressource, limites).
 * @returns {Array<{a, cost, ok:boolean, why:string}>}
 */
export function choices(after, doc, st, roll = null) {
  const payer = payerOf(doc);
  const pScope = payer ? docScope(payer) : {};
  const dScope = docScope(doc);
  const uses = Math.max(0, Math.floor(num(after.uses, dScope, 1)));
  const have = after.key ? Number(pScope[after.key]) || 0 : Infinity;
  return after.actions.map(a => {
    const cost = Math.max(0, num(a.cost, dScope, after.key ? 1 : 0));
    const max = String(a.max ?? "").trim() ? Math.max(0, Math.floor(num(a.max, dScope, 0))) : Infinity;
    let why = "";
    if (st.used >= uses) why = L("SBE.After.NoUses");
    else if ((st.per[a.id] ?? 0) >= max) why = L("SBE.After.MaxReached");
    else if (after.key && have < cost) why = L("SBE.After.NotEnough", { res: resLabel(after, payer) });
    else if (a.type === "failed" && roll && !failedCount(roll)) why = L("SBE.After.NoFailed");
    return { a, cost, ok: !why, why };
  });
}

/** Libellé de la ressource (sur la fiche du payeur). */
export function resLabel(after, payer) {
  if (!after?.key) return "";
  const els = payer?.system?.template?.system?.elements ?? [];
  const find = (list) => {
    for (const e of list ?? []) {
      if (e?.key === after.key) return e;
      const c = find(e?.children) ?? (Array.isArray(e?.cols) ? e.cols.map(find).find(Boolean) : null);
      if (c) return c;
    }
    return null;
  };
  return find(els)?.label || after.key;
}

/** Dés « ratés » d'une réserve (dés comptés en succès) : ceux qui n'en sont pas. */
function failedCount(roll) {
  let n = 0;
  for (const d of roll?.dice ?? []) {
    for (const r of d.results ?? []) if (r.active !== false && !r.discarded && r.success === false) n++;
  }
  return n;
}

/** Total d'un jet avec ce qu'on a ajouté après coup. */
export function totalOf(roll, st) {
  return (Number(roll?.total) || 0) + (st?.extras ?? []).filter(x => x.kind !== "reroll").reduce((t, x) => t + (Number(x.total) || 0), 0);
}

/**
 * Joue une action. Paie, relance ou ajoute ; met l'état à jour.
 * @param better (a, b) => true si le total a vaut mieux que b
 * @returns {Promise<Roll>} le jet gardé (le même, ou le nouveau)
 */
export async function play(after, c, doc, roll, st, { formula, scope, better }) {
  const a = c.a;
  const payer = payerOf(doc);
  if (after.key && c.cost > 0 && payer) {
    const cur = Number(docScope(payer)[after.key]) || 0;
    await payer.update({ [`system.values.${after.key}`]: cur - c.cost });
  }
  st.used += 1;
  st.per[a.id] = (st.per[a.id] ?? 0) + 1;
  const label = actionLabel(a);
  const costTxt = after.key && c.cost ? L("SBE.After.Paid", { n: c.cost, res: resLabel(after, payer) }) : "";
  if (a.type === "bonus") {
    const v = num(a.value, docScope(doc), 0);
    st.extras.push({ id: a.id, kind: "bonus", label, total: v, cost: costTxt });
    return roll;
  }
  if (a.type === "dice") {
    const r = await new Roll(rollableFormula(a.value, scope), scope).evaluate();
    st.extras.push({ id: a.id, kind: "dice", label, total: r.total, roll: r.toJSON(), cost: costTxt });
    return roll;
  }
  if (a.type === "failed") {
    /* Une réserve : seuls les dés sans succès sont relancés ; ce qu'ils
       donnent s'ajoute aux succès déjà là. */
    let gain = 0;
    const parts = [];
    for (const d of roll.dice ?? []) {
      const n = (d.results ?? []).filter(r => r.active !== false && !r.discarded && r.success === false).length;
      if (!n) continue;
      const mods = (d.modifiers ?? []).join("");
      const r = await new Roll(`${n}d${d.faces}${mods}`).evaluate();
      gain += r.total;
      parts.push(r);
    }
    st.extras.push({ id: a.id, kind: "dice", label, total: gain, roll: parts[0]?.toJSON() ?? null, cost: costTxt });
    return roll;
  }
  /* Tout relancer (le jet, ou les dégâts) : le nouveau, ou le meilleur des deux. */
  const r = await new Roll(formula, scope).evaluate();
  const keepNew = a.keep === "new" || better(r, roll);
  st.old.push(keepNew ? roll.toJSON() : r.toJSON());
  st.extras.push({ id: a.id, kind: "reroll", label, total: 0, cost: costTxt, kept: keepNew ? "new" : "old" });
  return keepNew ? r : roll;
}

/**
 * MOMENT « tout de suite » : la fenêtre juste après les dés.
 * @param verdict (roll) => { text, total } pour l'en-tête
 * @returns {Promise<Roll>} le jet final (l'état est rempli)
 */
export async function runNow(after, doc, roll, st, { title, formula, scope, better, verdict }) {
  for (let guard = 0; guard < 20; guard++) {
    const list = choices(after, doc, st, roll).filter(c => c.ok);
    if (!list.length) return roll;
    const v = verdict(roll);
    const payer = payerOf(doc);
    const left = after.key ? `<p class="sbe-after-left">${esc(L("SBE.After.Left", { res: resLabel(after, payer), n: Number(docScope(payer ?? doc)[after.key]) || 0 }))}</p>` : "";
    const res = await foundry.applications.api.DialogV2.wait({
      window: { title: String(title || L("SBE.After.Title")), icon: "fa-solid fa-dice" },
      classes: ["sbe-after-dialog"],
      position: { width: 380 },
      content: `<div class="sbe-after-now"><span class="sbe-after-total">${esc(v.total)}</span><b>${esc(v.text)}</b></div>${left}`,
      buttons: [
        ...list.map(c => ({ action: c.a.id, label: c.cost && after.key ? `${actionLabel(c.a)} — ${c.cost} ${resLabel(after, payer)}` : actionLabel(c.a), icon: REROLLS.has(c.a.type) ? "fa-solid fa-rotate" : "fa-solid fa-plus" })),
        { action: "keep", label: L("SBE.After.Keep"), icon: "fa-solid fa-check", default: true }
      ],
      rejectClose: false
    }).catch(() => null);
    const c = list.find(x => x.a.id === res);
    if (!c) return roll;
    roll = await play(after, c, doc, roll, st, { formula, scope, better });
  }
  return roll;
}

/** Peut-on cliquer les boutons de la carte ? */
export function canClick(after, doc) {
  if (game.user.isGM) return after.who !== "player" || !doc?.hasPlayerOwner;
  return after.who !== "gm" && !!doc?.isOwner;
}

/** Ce qui a été fait après coup, dans la carte (et les boutons). */
export async function cardHtml(after, doc, roll, st, { diceHtml, buttons = false }) {
  let html = "";
  for (const o of st.old ?? []) {
    const r = Roll.fromData(o);
    html += `<div class="sbe-after-old">${await diceHtml(r)}</div>`;
  }
  for (const x of st.extras ?? []) {
    if (x.kind === "reroll") {
      html += `<div class="sbe-after-line"><i class="fa-solid fa-rotate"></i> ${esc(x.label)} : ${esc(L(x.kept === "new" ? "SBE.After.KeptNew" : "SBE.After.KeptOld"))}${x.cost ? ` <small>${esc(x.cost)}</small>` : ""}</div>`;
    } else {
      const dice = x.roll ? await diceHtml(Roll.fromData(x.roll)) : "";
      html += `<div class="sbe-after-line"><i class="fa-solid fa-plus"></i> ${esc(x.label)} : <b>${x.total >= 0 ? "+" : ""}${x.total}</b>${x.cost ? ` <small>${esc(x.cost)}</small>` : ""}${dice}</div>`;
    }
  }
  if (buttons) {
    const list = choices(after, doc, st, roll);
    const payer = payerOf(doc);
    const open = list.filter(c => c.ok || c.why !== L("SBE.After.NoUses"));
    if (open.length && list.some(c => c.ok)) {
      html += `<div class="sbe-after-btns">${open.map(c => `<button type="button" data-sbe-after="${esc(c.a.id)}" ${c.ok ? "" : `disabled data-tooltip-text="${esc(c.why)}"`}>
        <i class="fa-solid ${REROLLS.has(c.a.type) ? "fa-rotate" : "fa-plus"}"></i> ${esc(actionLabel(c.a))}${c.cost && after.key ? ` — ${c.cost} ${esc(resLabel(after, payer))}` : ""}</button>`).join("")}</div>`;
      if (after.key) html += `<div class="sbe-after-left">${esc(L("SBE.After.Left", { res: resLabel(after, payer), n: Number(docScope(payer ?? doc)[after.key]) || 0 }))}</div>`;
    }
  }
  return html ? `<div class="sbe-after">${html}</div>` : "";
}

/* ============================================================ */
/*  Éditeur (atelier, volet « Après le jet »)                    */
/* ============================================================ */

function rowHtml(a = {}) {
  const t = AFTER_TYPES.includes(a.type) ? a.type : "all";
  return `<div class="sbe-after-row" data-id="${esc(a.id || foundry.utils.randomID())}">
    <select class="sbe-after-type">${AFTER_TYPES.map(x => `<option value="${x}" ${x === t ? "selected" : ""}>${L(`SBE.After.Type_${x}`)}</option>`).join("")}</select>
    <input type="text" class="sbe-after-label" value="${esc(a.label)}" placeholder="${esc(L("SBE.After.LabelPh"))}">
    <input type="text" class="sbe-after-cost" value="${esc(a.cost)}" placeholder="1">
    <input type="text" class="sbe-after-value" value="${esc(a.value)}" placeholder="${esc(L("SBE.After.ValuePh"))}">
    <select class="sbe-after-keep"><option value="best" ${a.keep !== "new" ? "selected" : ""}>${L("SBE.After.Keep_best")}</option><option value="new" ${a.keep === "new" ? "selected" : ""}>${L("SBE.After.Keep_new")}</option></select>
    <input type="text" class="sbe-after-max" value="${esc(a.max)}" placeholder="—">
    <a class="sbe-after-del" data-tooltip-text="${esc(L("SBE.After.Delete"))}"><i class="fa-solid fa-trash"></i></a>
  </div>`;
}

/** Le volet complet (dans le fieldset du jet). */
export function afterEditorHtml(after, keyList = "") {
  const a = after ?? {};
  return `<div class="sbe-after-ed">
    <div class="sbe-after-grid">
      <label class="sbe-after-f"><span>${L("SBE.After.Key")}</span><input type="text" name="roll.after.key" list="${esc(keyList)}" value="${esc(a.key)}" placeholder="${esc(L("SBE.After.KeyPh"))}"></label>
      <label class="sbe-after-f"><span>${L("SBE.After.Uses")}</span><input type="text" name="roll.after.uses" value="${esc(a.uses)}" placeholder="1"></label>
      <label class="sbe-after-f"><span>${L("SBE.After.Who")}</span><select name="roll.after.who">${AFTER_WHO.map(w => `<option value="${w}" ${(a.who || "both") === w ? "selected" : ""}>${L(`SBE.After.Who_${w}`)}</option>`).join("")}</select></label>
    </div>
    <div class="sbe-after-row sbe-after-head"><b>${L("SBE.After.Action")}</b><b>${L("SBE.After.Label")}</b><b>${L("SBE.After.Cost")}</b><b>${L("SBE.After.Value")}</b><b>${L("SBE.After.KeepCol")}</b><b>${L("SBE.After.Max")}</b><span></span></div>
    <div class="sbe-after-rows">${(a.actions ?? []).map(rowHtml).join("")}</div>
    <button type="button" class="sbe-after-add"><i class="fa-solid fa-plus"></i> ${L("SBE.After.Add")}</button>
  </div>`;
}

/** Montre la valeur et « garder » seulement quand ils servent. */
function syncRow(row) {
  const t = row.querySelector(".sbe-after-type")?.value;
  row.querySelector(".sbe-after-value").style.visibility = t === "dice" || t === "bonus" ? "" : "hidden";
  row.querySelector(".sbe-after-keep").style.visibility = t === "all" || t === "damage" ? "" : "hidden";
}

export function wireAfterEditor(root) {
  const box = root?.querySelector(".sbe-after-ed");
  if (!box || box.dataset.wired) return;
  box.dataset.wired = "1";
  for (const r of box.querySelectorAll(".sbe-after-rows .sbe-after-row")) syncRow(r);
  box.querySelector(".sbe-after-add")?.addEventListener("click", () => {
    const rows = box.querySelector(".sbe-after-rows");
    rows.insertAdjacentHTML("beforeend", rowHtml({}));
    syncRow(rows.lastElementChild);
  });
  box.addEventListener("click", (ev) => { ev.target.closest(".sbe-after-del")?.closest(".sbe-after-row")?.remove(); });
  box.addEventListener("change", (ev) => { if (ev.target.classList.contains("sbe-after-type")) syncRow(ev.target.closest(".sbe-after-row")); });
}

/** Lecture ; { after, error }. after = null quand il n'y a aucune action. */
export function readAfterEditor(root, validate) {
  const v = (n) => root.querySelector(`[name="${n}"]`)?.value?.trim() ?? "";
  const actions = [];
  for (const row of root.querySelectorAll(".sbe-after-rows .sbe-after-row")) {
    const a = {
      id: row.dataset.id, type: row.querySelector(".sbe-after-type")?.value,
      label: row.querySelector(".sbe-after-label")?.value.trim() ?? "",
      cost: row.querySelector(".sbe-after-cost")?.value.trim() ?? "",
      value: row.querySelector(".sbe-after-value")?.value.trim() ?? "",
      keep: row.querySelector(".sbe-after-keep")?.value, max: row.querySelector(".sbe-after-max")?.value.trim() ?? ""
    };
    if ((a.type === "dice" || a.type === "bonus") && !a.value) return { after: null, error: L("SBE.After.NeedValue", { label: a.label || L(`SBE.After.Type_${a.type}`) }) };
    for (const f of ["cost", "max", ...(a.type === "bonus" ? ["value"] : [])]) {
      if (!a[f] || /^-?\d+([.,]\d+)?$/.test(a[f])) continue;
      const err = validate?.(a[f]);
      if (err) return { after: null, error: `${actionLabel(a)} — ${a[f]} : ${err}` };
    }
    actions.push(a);
  }
  const uses = v("roll.after.uses");
  if (uses && !/^\d+$/.test(uses)) { const err = validate?.(uses); if (err) return { after: null, error: `${L("SBE.After.Uses")} : ${err}` }; }
  return { after: cleanAfter({ key: v("roll.after.key"), uses, who: v("roll.after.who"), actions }, { keepEmpty: true }), error: null };
}
