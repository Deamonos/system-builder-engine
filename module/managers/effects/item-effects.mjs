/**
 * SBE — EFFETS PROPRES À UN OBJET (onglet « Effets » de l'objet, MJ)
 *
 * Comme l'ancien système : chaque objet peut avoir ses propres règles
 * d'effets, en plus de celles de son modèle (effets conférés). C'est
 * ce qui distingue deux objets d'un même modèle : deux médicaments
 * ne soignent pas pareil, deux drogues n'ont pas le même effet.
 *
 * Une règle = QUAND + (résultat) + ACTION + EFFET + SUR QUI :
 *   when    "equipped" | "carried"        tant que l'objet est équipé / porté
 *           "button:<clé>"                à chaque usage réussi du bouton
 *   outcome "any" | "success" | "failure" | "critSuccess" | "critFailure"
 *           (boutons seulement : l'issue du jet du bouton)
 *   action  "apply" | "remove" | "add" | "sub"   (boutons)
 *   effect  clé d'effet
 *   target  "self" (porteur) | "targets" (jetons ciblés)  (boutons)
 *   onlyIf  formule lue sur l'OBJET (« tant que » seulement) : l'effet
 *           n'est conféré que si elle est vraie (allume, charge > 0…) ;
 *           vide = toujours
 *
 * Stockage : flags[SYSTEM_ID].effectRules de l'OBJET — jamais écrasé
 * par une mise à jour du modèle (la propagation ne touche pas aux
 * drapeaux).
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { walkElements, registerItemTipExtra } from "../../builder/element-renderer.mjs";
import { carrierOf } from "../../builder/inventory.mjs";
import { EffectManager, cleanDef, levelOf } from "./effect-manager.mjs";
import { validateFormula, HAS_DICE, evalExpression } from "../../builder/formula-engine.mjs";
import { docScope } from "../../builder/doc-context.mjs";
import { cfCell, cfGrid, cfTip } from "../../helpers/compact-form.mjs";
import { renderEditor, readEditor, readOpenSections, addRow, removeRow, wireGiveDrop } from "./effect-editor.mjs";
import { newGive } from "./effect-gives.mjs";
import { wireKeyLists } from "../../helpers/key-list.mjs";

export const RULE_OUTCOMES = ["any", "success", "failure", "critSuccess", "critFailure"];
export const RULE_ACTIONS = ["apply", "remove", "add", "sub"];

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));

export class ItemEffects {

  /** Une règle, toujours propre. */
  static clean(r) {
    const str = (v) => String(v ?? "").trim();
    const when = str(r?.when);
    return {
      id: str(r?.id) || foundry.utils.randomID(),
      when: (when === "equipped" || when === "carried" || when.startsWith("button:")) ? when : "equipped",
      outcome: RULE_OUTCOMES.includes(r?.outcome) ? r.outcome : "any",
      action: RULE_ACTIONS.includes(r?.action) ? r.action : "apply",
      effect: str(r?.effect),
      target: r?.target === "targets" ? "targets" : "self",
      onlyIf: str(r?.onlyIf)
    };
  }

  /**
   * « Seulement si » d'une règle « tant que » : vrai si la formule
   * (lue sur l'objet) l'est, ou si elle est vide. Même règle pour les
   * effets conférés du modèle.
   */
  static onlyIfHolds(item, formula, cache = null) {
    const f = String(formula ?? "").trim();
    if (!f) return true;
    let scope;
    try { scope = cache ? (cache.scope ??= docScope(item)) : docScope(item); } catch (_e) { return false; }
    const r = evalExpression(f, scope);
    return r !== null && r !== undefined && !!r;
  }

  static rulesOf(item) {
    const raw = EffectManager.effectsHolder(item)?.flags?.[SYSTEM_ID]?.effectRules;
    return (Array.isArray(raw) ? raw : []).map(r => this.clean(r));
  }

  static async save(item, rules) {
    await EffectManager.forkEffects(item);
    return item.update({ [`flags.${SYSTEM_ID}.effectRules`]: rules.map(r => this.clean(r)) });
  }

  /** Les boutons de l'objet (déclencheurs possibles). */
  static buttonsOf(item) {
    return [...walkElements(item?.system?.template?.system?.elements ?? [])]
      .filter(e => e?.kind === "button" && e.key)
      .map(e => ({ key: e.key, label: e.label || e.key }));
  }

  /**
   * Effets « tant que » de CET objet (équipé / porté), pour la pose
   * continue du moteur d'effets.
   */
  static grantedKeys(item, equipped) {
    const out = [];
    const cache = {};
    for (const r of this.rulesOf(item)) {
      if (!r.effect) continue;
      if (!(r.when === "carried" || (r.when === "equipped" && equipped))) continue;
      if (this.onlyIfHolds(item, r.onlyIf, cache)) out.push(r.effect);
    }
    return out;
  }

  /**
   * Un bouton de l'objet a fini ses étapes : on applique ses règles.
   * @param {string} outcome  issue du jet du bouton (ou null / "done")
   */
  static async fire(item, btnKey, outcome) {
    const rules = this.rulesOf(item).filter(r => r.effect && r.when === `button:${btnKey}`
      && (r.outcome === "any" || r.outcome === outcome));
    if (!rules.length) return;
    EffectManager.rememberLocal(item);
    for (const r of rules) {
      if (!EffectManager.getDef(r.effect)) { ui.notifications.warn(L("SBE.Steps.NoEffect", { key: r.effect })); continue; }
      let actors = [];
      if (r.target === "targets") {
        actors = [...(game.user.targets ?? [])].map(t => t.actor).filter(Boolean);
        if (!actors.length) { ui.notifications.warn(L("SBE.Steps.NoTarget")); continue; }
      } else {
        const carrier = carrierOf(item);
        if (carrier?.documentName === "Actor") actors = [carrier];
      }
      for (const a of actors) await EffectManager.act(a, r.effect, r.action);
    }
  }
}

/* ============================================================ */
/*  Onglet « Effets » de l'objet (MJ)                            */
/* ============================================================ */

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/* Effets propres dépliés / sections ouvertes, par objet : gardés
   d'un rendu de la fiche à l'autre. */
const OPEN = new Map();
function openState(item) {
  if (!OPEN.has(item.uuid)) OPEN.set(item.uuid, { fx: new Set(), sec: {} });
  return OPEN.get(item.uuid);
}

/** Nom d'un effet propre dans les listes : celui de l'objet, numéroté
    s'il y en a plusieurs. */
function ownLabel(item, i, n) {
  return n > 1 ? `${item.name} (${i + 1})` : item.name;
}

/** Résumé d'un effet propre (en-tête du dépliant). */
function ownSummary(raw) {
  const d = cleanDef(raw);
  const bits = [];
  const n = d.changes.length + d.phases.length;
  if (d.changes.length) bits.push(L("SBE.ItemFx.SumChanges", { n: d.changes.length }));
  /* Tout en phases : le début de l'effet compte comme la phase 1. */
  if (d.phases.length) bits.push(L("SBE.ItemFx.SumPhases", { n: d.phases.length + 1 }));
  if (d.duration.rounds) bits.push(L("SBE.ItemFx.SumRounds", { n: d.duration.rounds }));
  else if (d.duration.seconds) bits.push(L("SBE.ItemFx.SumTimed"));
  if (!n) bits.push(L("SBE.ItemFx.SumEmpty"));
  return bits.join(" · ");
}

/** HTML de l'onglet : ce que donne le modèle (lecture), les effets
    PROPRES à l'objet (un dépliant chacun), puis les règles. */
export async function itemEffectsTabHTML(item) {
  const ownDefs = EffectManager.localDefsOf(item, { draft: true });
  /* Les effets propres à CET objet d'abord (★), puis ceux du gestionnaire. */
  const own = ownDefs.map((d, i) => ({ key: d.key, label: `★ ${ownLabel(item, i, ownDefs.length)}` }));
  const ownKeys = new Set(ownDefs.map(d => d.key));
  const effects = [...own, ...EffectManager.effectOptions()];
  /* Les règles ne proposent que les effets du gestionnaire : un effet
     propre règle son déclenchement dans son propre dépliant. */
  const ruleEffects = EffectManager.effectOptions();
  const effLabel = (k) => effects.find(e => e.key === k)?.label || k;
  const grants = (item.system?.template?.system?.grants ?? []).filter(g => g?.effect);
  const buttons = ItemEffects.buttonsOf(item);
  const opt = (v, label, sel) => `<option value="${esc(v)}" ${v === sel ? "selected" : ""}>${esc(label)}</option>`;
  const state = openState(item);

  const modelList = grants.length
    ? `<ul class="sbe-itemfx-model">${grants.map(g => {
        const k = String(g.effect);
        const shown = k.startsWith("@") ? `${k} → ${effLabel(String(item.system?.values?.[k.slice(1)] ?? ""))}` : effLabel(k);
        return `<li><i class="fa-solid fa-lock"></i> ${esc(shown)} <span class="sbe-itemfx-when">${esc(L(g.when === "equipped" ? "SBE.Grants.Equipped" : "SBE.Grants.Carried"))}</span></li>`;
      }).join("")}</ul>`
    : `<p class="notes">${L("SBE.ItemFx.ModelNone")}</p>`;

  const ownBlocks = [];
  for (const [i, d] of ownDefs.entries()) {
    state.sec[d.key] ??= {};
    const editor = await renderEditor(d, { local: true, open: state.sec[d.key] });
    const rule = ItemEffects.rulesOf(item).find(r => r.effect === d.key) ?? null;
    const when = rule?.when ?? "";
    const isBtn = when.startsWith("button:");
    const trigger = `<div class="sbe-itemfx-own-when">${cfGrid([
        cfCell(L("SBE.ItemFx.TriggerWhen"), `<select class="sbe-itemfx-ow-when">${opt("", L("SBE.ItemFx.TriggerNever"), when)}
            ${buttons.map(b => opt(`button:${b.key}`, L("SBE.ItemFx.OnButton", { name: b.label }), when)).join("")}
            ${isBtn && !buttons.some(b => `button:${b.key}` === when) ? opt(when, `${when} ⚠`, when) : ""}
            ${opt("equipped", L("SBE.Grants.Equipped"), when)}${opt("carried", L("SBE.Grants.Carried"), when)}</select>`, { hint: L("SBE.ItemFx.TriggerHint") }),
        cfCell(L("SBE.ItemFx.TriggerIf"), `<select class="sbe-itemfx-ow-outcome">${RULE_OUTCOMES.map(o => opt(o, L("SBE.ItemFx.Outcome." + o), rule?.outcome ?? "any")).join("")}</select>`, { hidden: !isBtn }),
        cfCell(L("SBE.ItemFx.TriggerOn"), `<select class="sbe-itemfx-ow-target">${opt("self", L("SBE.Steps.FxSelf"), rule?.target ?? "self")}${opt("targets", L("SBE.Steps.FxTargets"), rule?.target ?? "self")}</select>`, { hidden: !isBtn }),
        cfCell(L("SBE.ItemFx.OnlyIf"), `<input type="text" class="sbe-itemfx-ow-onlyif" value="${esc(rule?.onlyIf ?? "")}" placeholder="${esc(L("SBE.ItemFx.OnlyIfPh"))}">`, { hidden: !(when && !isBtn) })
      ])}</div>`;
    ownBlocks.push(`<details class="sbe-itemfx-own" data-key="${esc(d.key)}" ${state.fx.has(d.key) ? "open" : ""}>
      <summary>
        <i class="fa-solid fa-chevron-right sbe-itemfx-own-chev"></i>
        <img src="${esc(item.img || "icons/svg/aura.svg")}" alt="">
        <span class="sbe-itemfx-own-name">${esc(ownLabel(item, i, ownDefs.length))}</span>
        <span class="sbe-itemfx-own-sum">${esc(ownSummary(d))}${when ? "" : ` · ⚠ ${esc(L("SBE.ItemFx.TriggerNone"))}`}</span>
        <a class="sbe-itemfx-own-del" data-tooltip-text="${esc(L("SBE.ItemFx.LocalDelete"))}"><i class="fa-solid fa-trash"></i></a>
      </summary>
      <div class="sbe-fx-edit sbe-itemfx-own-body">${trigger}${editor}</div>
    </details>`);
  }

  const rows = ItemEffects.rulesOf(item).filter(r => !ownKeys.has(r.effect)).map(r => {
    const isBtn = r.when.startsWith("button:");
    const whenOpts = opt("equipped", L("SBE.Grants.Equipped"), r.when) + opt("carried", L("SBE.Grants.Carried"), r.when)
      + buttons.map(b => opt(`button:${b.key}`, L("SBE.ItemFx.OnButton", { name: b.label }), r.when)).join("")
      + (isBtn && !buttons.some(b => `button:${b.key}` === r.when) ? opt(r.when, `${r.when} ⚠`, r.when) : "");
    const effOpts = `<option value="">${esc(L("SBE.ItemFx.PickEffect"))}</option>`
      + ruleEffects.map(e => opt(e.key, e.label, r.effect)).join("")
      + (r.effect && !ruleEffects.some(e => e.key === r.effect) ? opt(r.effect, `${r.effect} ⚠`, r.effect) : "");
    return `<div class="sbe-itemfx-rule" data-id="${esc(r.id)}">
      <select class="sbe-itemfx-when-sel">${whenOpts}</select>
      <select class="sbe-itemfx-outcome" ${isBtn ? "" : "hidden"}>${RULE_OUTCOMES.map(o => opt(o, L("SBE.ItemFx.Outcome." + o), r.outcome)).join("")}</select>
      <select class="sbe-itemfx-action" ${isBtn ? "" : "hidden"}>${RULE_ACTIONS.map(a => opt(a, L("SBE.Steps.FxAction." + a), r.action)).join("")}</select>
      <select class="sbe-itemfx-effect">${effOpts}</select>
      <select class="sbe-itemfx-target" ${isBtn ? "" : "hidden"}>${opt("self", L("SBE.Steps.FxSelf"), r.target)}${opt("targets", L("SBE.Steps.FxTargets"), r.target)}</select>
      <input type="text" class="sbe-itemfx-onlyif" ${isBtn ? "hidden" : ""} value="${esc(r.onlyIf)}"
        placeholder="${esc(L("SBE.ItemFx.OnlyIfPh"))}" data-tooltip-text="${esc(L("SBE.ItemFx.OnlyIfHint"))}">
      <a class="sbe-itemfx-del" title="${esc(L("SBE.Common.Delete"))}"><i class="fa-solid fa-trash"></i></a>
    </div>`;
  }).join("");

  /* Exemplaire (porté par un personnage…) qui suit son modèle : ses
     effets SONT ceux du modèle. On les montre, on ne les modifie pas
     ici — sauf à le détacher pour cet exemplaire seulement. */
  const holder = EffectManager.effectsHolder(item);
  if (holder !== item) {
    const rules = ItemEffects.rulesOf(item);
    const whenText = (r) => r.when.startsWith("button:")
      ? L("SBE.ItemFx.OnButton", { name: buttons.find(b => `button:${b.key}` === r.when)?.label ?? r.when.slice(7) })
      : L(r.when === "equipped" ? "SBE.Grants.Equipped" : "SBE.Grants.Carried");
    const list = ownDefs.map((d, i) => `<li><i class="fa-solid fa-star"></i> ${esc(ownLabel(item, i, ownDefs.length))}
        <span class="sbe-itemfx-when">${esc(ownSummary(d))}</span></li>`)
      .concat(rules.filter(r => !ownKeys.has(r.effect)).map(r => `<li><i class="fa-solid fa-bolt"></i> ${esc(effLabel(r.effect))}
        <span class="sbe-itemfx-when">${esc(whenText(r))}</span></li>`));
    return `<section class="sbe-obj-fields sbe-obj-tabscroll sbe-itemfx">
    <h3 class="sbe-itemfx-title">${L("SBE.ItemFx.ModelTitle")}</h3>
    ${modelList}
    <h3 class="sbe-itemfx-title">${L("SBE.ItemFx.InheritTitle")}</h3>
    <p class="notes">${L("SBE.ItemFx.InheritHint", { name: esc(holder.name) })}</p>
    ${list.length ? `<ul class="sbe-itemfx-model">${list.join("")}</ul>` : `<p class="notes">${L("SBE.ItemFx.Empty")}</p>`}
    <div class="sbe-itemfx-inherit">
      <button type="button" class="sbe-itemfx-openmodel"><i class="fa-solid fa-up-right-from-square"></i> ${L("SBE.ItemFx.InheritOpen")}</button>
      <button type="button" class="sbe-itemfx-fork"><i class="fa-solid fa-code-branch"></i> ${L("SBE.ItemFx.InheritFork")}</button>
    </div>
  </section>`;
  }

  return `<section class="sbe-obj-fields sbe-obj-tabscroll sbe-itemfx">
    <div class="sbe-itemfx-tipopt">
      ${cfCell(L("SBE.ItemFx.TipShow"), `<input type="checkbox" class="sbe-itemfx-tip" ${item.flags?.[SYSTEM_ID]?.effectsTip ? "checked" : ""}>`, { hint: L("SBE.ItemFx.TipShowHint"), check: true })}
    </div>
    <h3 class="sbe-itemfx-title">${L("SBE.ItemFx.ModelTitle")}</h3>
    ${modelList}
    <h3 class="sbe-itemfx-title">${L("SBE.ItemFx.LocalSection")}${cfTip(L("SBE.ItemFx.LocalSectionHint"))}</h3>
    <div class="sbe-itemfx-owns">${ownBlocks.join("")}</div>
    <button type="button" class="sbe-itemfx-local"><i class="fa-solid fa-plus"></i> ${L("SBE.ItemFx.LocalCreate")}</button>
    <h3 class="sbe-itemfx-title">${L("SBE.ItemFx.OwnTitle")}${cfTip(L("SBE.ItemFx.OwnHint"))}</h3>
    <div class="sbe-itemfx-rules">${rows || `<p class="notes sbe-itemfx-empty">${L("SBE.ItemFx.Empty")}</p>`}</div>
    <button type="button" class="sbe-itemfx-add"><i class="fa-solid fa-plus"></i> ${L("SBE.ItemFx.Add")}</button>
  </section>`;
}

/** Câblage de l'onglet (MJ). Les champs n'ont pas de « name » : ils ne
    passent pas par le formulaire de la fiche, chaque changement écrit
    directement les règles / les effets propres. */
export function wireItemEffectsTab(sheet) {
  const root = sheet.element?.querySelector(".sbe-itemfx");
  if (!root || !game.user.isGM) return;
  const item = sheet.document;
  /* Exemplaire qui suit son modèle : ouvrir le modèle, ou le détacher. */
  root.querySelector(".sbe-itemfx-openmodel")?.addEventListener("click", (ev) => {
    ev.preventDefault();
    EffectManager.effectsHolder(item)?.sheet?.render(true);
  });
  root.querySelector(".sbe-itemfx-fork")?.addEventListener("click", async (ev) => {
    ev.preventDefault();
    await EffectManager.forkEffects(item);
    sheet.render();
  });
  if (EffectManager.effectsHolder(item) !== item) return;
  root.querySelector(".sbe-itemfx-tip")?.addEventListener("change", (ev) => {
    item.update({ [`flags.${SYSTEM_ID}.effectsTip`]: !!ev.target.checked }, { render: false });
  });
  wireKeyLists(root);
  /* Les règles des effets PROPRES vivent dans leurs dépliants : la
     liste ne les montre pas, mais on les garde à l'enregistrement. */
  const ownKeys = () => new Set(EffectManager.localDefsOf(item, { draft: true }).map(d => d.key));
  const ownRules = () => ItemEffects.rulesOf(item).filter(r => ownKeys().has(r.effect));
  const listRules = () => [...root.querySelectorAll(".sbe-itemfx-rule")].map(row => ({
    id: row.dataset.id,
    when: row.querySelector(".sbe-itemfx-when-sel")?.value,
    outcome: row.querySelector(".sbe-itemfx-outcome")?.value,
    action: row.querySelector(".sbe-itemfx-action")?.value,
    effect: row.querySelector(".sbe-itemfx-effect")?.value,
    target: row.querySelector(".sbe-itemfx-target")?.value,
    onlyIf: row.querySelector(".sbe-itemfx-onlyif")?.value ?? ""
  }));
  const gather = () => [...ownRules(), ...listRules()];
  for (const sel of root.querySelectorAll(".sbe-itemfx-rule select, .sbe-itemfx-rule input")) {
    sel.addEventListener("change", (ev) => { ev.stopPropagation(); ItemEffects.save(item, gather()); });
    sel.addEventListener("input", (ev) => ev.stopPropagation());
  }
  for (const a of root.querySelectorAll(".sbe-itemfx-del")) {
    a.addEventListener("click", (ev) => {
      ev.preventDefault();
      const id = a.closest(".sbe-itemfx-rule")?.dataset.id;
      ItemEffects.save(item, gather().filter(r => r.id !== id));
    });
  }
  root.querySelector(".sbe-itemfx-add")?.addEventListener("click", (ev) => {
    ev.preventDefault();
    const firstBtn = ItemEffects.buttonsOf(item)[0];
    ItemEffects.save(item, [...gather(), { when: firstBtn ? `button:${firstBtn.key}` : "equipped" }]);
  });
  wireOwnEffects(root, item);
}

/* ---------- Effets PROPRES : un dépliant par effet ---------- */

function wireOwnEffects(root, item) {
  const box = root.querySelector(".sbe-itemfx-owns");
  if (!box) return;
  const state = openState(item);
  const stored = () => EffectManager.localDefsOf(item, { draft: true });
  /* Relit TOUS les dépliants (l'éditeur de chacun). */
  const readAll = () => {
    const prev = stored();
    return [...box.querySelectorAll(".sbe-itemfx-own")].map(det => {
      const d = prev.find(x => x.key === det.dataset.key) ?? cleanDef({ key: det.dataset.key });
      const body = det.querySelector(".sbe-itemfx-own-body");
      state.sec[d.key] = readOpenSections(body, state.sec[d.key] ?? {});
      return readEditor(body, d);
    });
  };
  /* Une formule douteuse est signalée, jamais bloquée. */
  const check = (defs) => {
    for (const d of defs) {
      const fs = [...d.changes, ...d.phases.flatMap(p => p.changes), ...d.escalation.tiers.flatMap(t => t.changes)]
        .map(c => c.value).concat(d.trigger.conditions, [d.periodic.amount, d.resist.difficulty, d.restHeal.difficulty]);
      for (const f of fs) {
        /* Une formule avec des dés (« 1d6 ») est lancée, pas vérifiée. */
        if (!f || Number.isFinite(Number(f)) || HAS_DICE.test(f)) continue;
        const err = validateFormula(f);
        if (err) { ui.notifications.warn(L("SBE.ItemFx.BadFormula", { err: `${f} : ${err}` })); return; }
      }
    }
  };
  const save = (defs, render) => { check(defs); return EffectManager.setLocalDefs(item, defs, { render }); };

  /* Saisie : enregistrée tout de suite, sans redessiner la fiche. */
  let timer = null;
  const later = () => { clearTimeout(timer); timer = setTimeout(() => save(readAll(), false), 250); };
  /* Déclenchement d'un effet propre (en tête de son dépliant) : UNE
     règle « Poser » rangée avec les autres règles de l'objet. */
  const triggerOf = (det) => {
    const when = det.querySelector(".sbe-itemfx-ow-when")?.value ?? "";
    if (!when) return null;
    return { when, action: "apply", effect: det.dataset.key,
      outcome: det.querySelector(".sbe-itemfx-ow-outcome")?.value ?? "any",
      target: det.querySelector(".sbe-itemfx-ow-target")?.value ?? "self",
      onlyIf: det.querySelector(".sbe-itemfx-ow-onlyif")?.value ?? "" };
  };
  const rulesWith = (key, rule) => [...ItemEffects.rulesOf(item).filter(r => r.effect !== key), ...(rule ? [rule] : [])];
  box.addEventListener("change", async (ev) => {
    ev.stopPropagation();
    const det = ev.target.closest?.(".sbe-itemfx-own");
    if (det && ev.target.matches(".sbe-itemfx-ow-when, .sbe-itemfx-ow-outcome, .sbe-itemfx-ow-target, .sbe-itemfx-ow-onlyif")) {
      clearTimeout(timer);
      await save(readAll(), false);
      return ItemEffects.save(item, rulesWith(det.dataset.key, triggerOf(det)));
    }
    later();
  });
  box.addEventListener("input", (ev) => ev.stopPropagation());

  /* Dépliants ouverts / fermés : mémorisés. */
  for (const det of box.querySelectorAll(".sbe-itemfx-own")) {
    det.addEventListener("toggle", () => {
      if (det.open) state.fx.add(det.dataset.key); else state.fx.delete(det.dataset.key);
    });
  }
  box.addEventListener("toggle", (ev) => {
    const sec = ev.target?.closest?.(".sbe-fx-sec");
    const det = sec?.closest(".sbe-itemfx-own");
    if (sec && det) (state.sec[det.dataset.key] ??= {})[sec.dataset.sec] = sec.open;
  }, true);

  /* Boutons de l'éditeur (ajouter / retirer une ligne, son…) : gérés
     ici, avant la fiche (qui ne les connaît pas). */
  box.addEventListener("click", async (ev) => {
    const del = ev.target.closest(".sbe-itemfx-own-del");
    if (del) {
      ev.preventDefault(); ev.stopPropagation();
      const det = del.closest(".sbe-itemfx-own");
      const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: L("SBE.ItemFx.LocalDelete") },
        content: `<p>${L("SBE.ItemFx.LocalDeleteConfirm")}</p>`,
        rejectClose: false
      }).catch(() => false);
      if (!ok) return;
      clearTimeout(timer);
      const defs = readAll().filter(d => d.key !== det.dataset.key);
      state.fx.delete(det.dataset.key);
      await save(defs, false);
      return ItemEffects.save(item, rulesWith(det.dataset.key, null));
    }
    const target = ev.target.closest("[data-action]");
    const det = target?.closest(".sbe-itemfx-own");
    if (!target || !det) return;
    ev.preventDefault(); ev.stopPropagation();
    const action = target.dataset.action;
    clearTimeout(timer);
    if (action === "pickAnim") {
      const input = det.querySelector(".sbe-fx-l-anim");
      const FP = foundry.applications.apps.FilePicker.implementation;
      new FP({ type: "imagevideo", current: input?.value || "",
        callback: (path) => { if (input) { input.value = path; save(readAll(), false); } } }).render(true);
      return;
    }
    if (action === "pickSound") {
      const input = det.querySelector(".sbe-fx-l-sound");
      const FP = foundry.applications.apps.FilePicker.implementation;
      new FP({ type: "audio", current: input?.value || "",
        callback: (path) => { if (input) { input.value = path; save(readAll(), false); } } }).render(true);
      return;
    }
    const removed = removeRow(action, target);
    const defs = readAll();
    if (!removed) {
      const d = defs.find(x => x.key === det.dataset.key);
      if (!d || !addRow(action, target, d)) return;
    }
    return save(defs, true);
  });

  /* Objets donnés : on y glisse des objets du monde (dans le dépliant
     de l'effet visé). */
  wireGiveDrop(box, (uuid, zone) => {
    const det = zone.closest(".sbe-itemfx-own");
    if (!det) return;
    clearTimeout(timer);
    const defs = readAll();
    const d = defs.find(x => x.key === det.dataset.key);
    if (!d) return;
    d.gives.push(newGive(uuid));
    (state.sec[d.key] ??= {}).gives = true;
    return save(defs, true);
  });

  /* Nouvel effet propre : sa clé se donne toute seule, déplié. */
  root.querySelector(".sbe-itemfx-local")?.addEventListener("click", async (ev) => {
    ev.preventDefault();
    clearTimeout(timer);
    const key = `obj_${foundry.utils.randomID(10).toLowerCase()}`;
    state.fx.add(key);
    /* Déclenché par défaut au premier bouton de l'objet (sinon :
       tant qu'il est équipé), posé sur le porteur. */
    const firstBtn = ItemEffects.buttonsOf(item)[0];
    const rule = { when: firstBtn ? `button:${firstBtn.key}` : "equipped", action: "apply", effect: key, outcome: "any", target: "self" };
    return save([...readAll(), cleanDef({ key })], false).then(() => ItemEffects.save(item, rulesWith(key, rule)));
  });
}

/* ============================================================ */
/*  Info-bulle de l'objet : ses effets (option de l'onglet)       */
/* ============================================================ */

/** Les effets que donne cet objet, lisibles : icône, nom, quand, ce qu'ils font. */
export function itemEffectsTipLines(item, isGM = false) {
  const holder = EffectManager.effectsHolder(item);
  if (!holder?.flags?.[SYSTEM_ID]?.effectsTip) return [];
  const labels = new Map(EffectManager.keyOptions().map(o => [o.key, o.label]));
  const buttons = ItemEffects.buttonsOf(item);
  const whenText = (when) => !when ? ""
    : when.startsWith("button:") ? L("SBE.ItemFx.OnButton", { name: buttons.find(b => `button:${b.key}` === when)?.label ?? when.slice(7) })
      : L(when === "equipped" ? "SBE.Grants.Equipped" : "SBE.Grants.Carried");
  const signed = (v) => (/^[+-]/.test(String(v)) ? String(v) : `+${v}`);
  const fmt = { add: signed, multiply: (v) => `×${v}`, downgrade: (v) => `≤ ${v}`, upgrade: (v) => `≥ ${v}`, override: (v) => `= ${v}` };
  const dirOf = (c) => {
    const v = Number(String(c.value).trim());
    if (!Number.isFinite(v)) return "";
    if (c.mode === "multiply") return v > 1 ? "is-up" : (v < 1 ? "is-down" : "");
    if (c.mode === "add") return v > 0 ? "is-up" : (v < 0 ? "is-down" : "");
    return "";
  };
  const out = [];
  const push = (def, when, ownName = "") => {
    if (!def || (def.look?.discreet && !isGM)) return;
    const lv = levelOf(def, 1);
    out.push({
      icon: lv?.icon || def.icon || item.img || "icons/svg/aura.svg",
      label: ownName || lv?.label || def.label || def.key,
      when: whenText(when),
      does: (lv?.changes ?? []).map(c => ({ text: `${labels.get(c.key) ?? c.key} ${(fmt[c.mode] ?? signed)(String(c.value).trim())}`, dir: dirOf(c) }))
    });
  };
  /* Donnés par le modèle (effets conférés). */
  for (const g of item.system?.template?.system?.grants ?? []) {
    let k = String(g?.effect ?? "");
    if (k.startsWith("@")) k = String(item.system?.values?.[k.slice(1)] ?? "");
    if (k) push(EffectManager.getDef(k), g.when === "equipped" ? "equipped" : "carried");
  }
  /* Propres à l'objet, puis ses règles vers le gestionnaire. */
  const rules = ItemEffects.rulesOf(item);
  const own = EffectManager.localDefsOf(item);
  for (const d of own) push(d, rules.find(r => r.effect === d.key)?.when ?? "", item.name);
  const ownKeys = new Set(own.map(d => d.key));
  for (const r of rules) {
    if (ownKeys.has(r.effect) || (r.when.startsWith("button:") && r.action === "remove")) continue;
    push(EffectManager.getDef(r.effect), r.when);
  }
  return out;
}

registerItemTipExtra((item, isGM) => {
  const lines = itemEffectsTipLines(item, isGM);
  if (!lines.length) return "";
  const e = (s) => foundry.utils.escapeHTML(String(s ?? ""));
  return `<div class="sbe-itt-fx">
    <div class="sbe-itt-fx-title">${e(L("SBE.ItemFx.TipTitle"))}</div>
    ${lines.map(l => `<div class="sbe-itt-fx-row">
      <img src="${e(l.icon)}" alt="">
      <div class="sbe-itt-fx-text">
        <span class="sbe-itt-fx-name">${e(l.label)}</span>
        ${l.does.length ? `<span class="sbe-itt-fx-does">${l.does.map(d => `<span class="${d.dir}">${e(d.text)}</span>`).join(" · ")}</span>` : ""}
      </div>
    </div>`).join("")}
  </div>`;
});
