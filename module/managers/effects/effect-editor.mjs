/**
 * SBE — Éditeur d'UNE définition d'effet (partagé)
 *
 * Le même éditeur sert :
 *   - au gestionnaire d'effets (fenêtre MJ « Effets ») ;
 *   - à l'onglet Effets d'un objet (effets PROPRES à l'objet), en
 *     dépliant : un bloc par effet, sans nom ni icône (ceux de l'objet).
 * Une seule source de vérité : gabarit effect-editor.hbs, contexte et
 * relecture ci-dessous.
 */

import { SYSTEM_PATH } from "../../helpers/constants.mjs";
import { CONTRIB_MODES } from "../../builder/contributions.mjs";
import { EffectManager } from "./effect-manager.mjs";
import { paint } from "./icon-paint.mjs";
import { lightFieldsHTML, readLightFields } from "../vision/light-fields.mjs";
import { VisionModes } from "../vision/vision-modes.mjs";
import { isRefList } from "../../builder/element-renderer.mjs";
import { GIVE_ENDS } from "./effect-gives.mjs";

export const EDITOR_TPL = `${SYSTEM_PATH}/templates/managers/effect-editor.hbs`;

/* Unités de temps proposées (stockage : secondes). */
export const UNITS = [["days", 86400], ["hours", 3600], ["minutes", 60], ["seconds", 1]];

export function splitSeconds(sec) {
  if (!sec) return { amount: 0, unit: "minutes" };
  for (const [u, f] of UNITS) if (sec % f === 0) return { amount: sec / f, unit: u };
  return { amount: sec, unit: "seconds" };
}

/** Contexte du gabarit pour une définition. */
export function editorContext(d, { local = false, open = {} } = {}) {
  const L = (k) => game.i18n.localize(k);
  const view = d ? foundry.utils.deepClone(d) : null;
  view?.escalation?.tiers?.forEach((t, i) => { t.num = i + 1; });
  /* Tout en phases : la phase 1 est le début de l'effet (durée et
     modifications du haut), les phases suivantes sont numérotées 2, 3… */
  view?.phases?.forEach((p, i) => { p.num = i + 2; p.time = splitSeconds(p.seconds ?? 0); });
  return {
    local,
    def: view,
    /* L'icône telle qu'elle s'affichera (copie colorée si elle est prête). */
    iconRaw: d ? (d.icon || (d.native ? (EffectManager._nativeCache ?? []).find(n => n.id === d.key)?.img : "") || "icons/svg/aura.svg") : "",
    iconShown: d ? paint(d, d.icon || (d.native ? (EffectManager._nativeCache ?? []).find(n => n.id === d.key)?.img : "") || "icons/svg/aura.svg") : "",
    open,
    time: splitSeconds(d?.duration?.seconds ?? 0),
    audiences: [["all", "AudAll"], ["owner", "AudOwner"], ["gm", "AudGm"]].map(([v, k]) => ({ value: v, label: L(`SBE.Media.${k}`) })),
    valueKeys: EffectManager.valueKeyOptions(),
    rollKeys: EffectManager.rollKeyOptions(),
    timings: ["turn", "round", "time"].map(v => ({ value: v, label: L(`SBE.Effects.Timing.${v}`) })),
    restModes: ["none", "remove", "reduce", "save"].map(v => ({ value: v, label: L(`SBE.Effects.Rest.Mode.${v}`) })),
    restOn: !!d && d.restHeal?.mode !== "none",
    lookOn: !!d && !!(d.look?.sound || d.look?.tint || d.look?.bigIcon || d.look?.discreet || d.look?.thermalMask
      || d.look?.blind || d.look?.light?.enabled || d.look?.anim?.file || d.look?.sight?.enabled),
    /* Mode de vision donné par l'effet (bibliothèque « Modes de vision »). */
    sightModes: (() => {
      const { own, natives } = VisionModes.options();
      const cur = d?.look?.sight?.mode ?? "";
      return [...own, ...natives].map(o => ({ ...o, selected: o.value === cur }));
    })(),
    /* Champs de la lumière : les mêmes que l'onglet Lumière d'un objet. */
    lightFieldsHTML: d ? lightFieldsHTML(d.look?.light ?? {}, { list: "sbe-fx-keys" }) : "",
    periodicTargets: ["actor", "source"].map(v => ({ value: v, label: L(`SBE.Effects.Periodic.Target.${v}`) })),
    zeroModes: ["none", "qty", "delete"].map(v => ({ value: v, label: L(`SBE.Effects.Periodic.Zero.${v}`) })),
    keys: EffectManager.keyOptions(),
    categories: [...new Set(EffectManager.getDefs().map(x => x.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    foundryStatuses: EffectManager.specialStatusOptions(d?.native ? d.key : ""),
    modes: CONTRIB_MODES.map(m => ({ value: m, label: L(`SBE.Effects.Mode.${m}`) })),
    units: UNITS.map(([u]) => ({ value: u, label: L(`SBE.Effects.Unit.${u}`) })),
    /* Objets donnés : l'objet du monde (nom, image) et où il va. */
    gives: (d?.gives ?? []).map(g => {
      let doc = null;
      try { doc = fromUuidSync(g.uuid); } catch (_e) { doc = null; }
      return { ...g, name: doc?.name ?? L("SBE.Effects.Gives.Gone"), img: doc?.img || "icons/svg/item-bag.svg", gone: !doc };
    }),
    givesOn: !!d?.gives?.length,
    placeKeys: EffectManager._keysWhere(el => (el.kind === "container" && !isRefList(el))
      || (el.kind === "slot" && el.config?.mode !== "reference")),
    giveEnds: GIVE_ENDS.map(v => ({ value: v, label: L(`SBE.Effects.Gives.End_${v}`) }))
  };
}

/** Rendu HTML de l'éditeur (onglet d'objet). */
export async function renderEditor(d, opts) {
  const render = foundry.applications.handlebars?.renderTemplate ?? globalThis.renderTemplate;
  return render(EDITOR_TPL, editorContext(d, opts));
}

/**
 * Relit l'éditeur contenu dans `root` ; `d` = définition d'origine
 * (garde natif / masqué, et nom / icône / clé quand ils ne sont pas
 * dans l'éditeur). Renvoie la définition relue.
 */
export function readEditor(root, d) {
  const val = (sel) => root.querySelector(sel)?.value ?? "";
  const has = (sel) => !!root.querySelector(sel);
  const chk = (sel) => !!root.querySelector(sel)?.checked;
  const readChanges = (rows) => [...rows].map(r => ({
    key: r.querySelector(".sbe-fx-ckey")?.value ?? "",
    mode: r.querySelector(".sbe-fx-cmode")?.value ?? "add",
    value: r.querySelector(".sbe-fx-cval")?.value ?? ""
  }));
  const unit = UNITS.find(([u]) => u === val(".sbe-fx-unit"))?.[1] ?? 60;
  return {
    native: d.native,
    hidden: d.hidden,
    key: d.native ? d.key : (has(".sbe-fx-key") ? val(".sbe-fx-key").trim().toLowerCase() : d.key),
    label: has(".sbe-fx-label") ? val(".sbe-fx-label") : (d.label ?? ""),
    icon: has(".sbe-fx-icon") ? val(".sbe-fx-icon") : (d.icon ?? ""),
    iconColor: has(".sbe-fx-iconcolor") ? (chk(".sbe-fx-iconcolor-on") ? val(".sbe-fx-iconcolor") : "") : (d.iconColor ?? ""),
    iconPainted: d.iconPainted ?? {},
    description: val(".sbe-fx-desc"),
    duration: {
      rounds: Number(val(".sbe-fx-rounds")) || 0,
      seconds: Math.round((Number(val(".sbe-fx-time")) || 0) * unit)
    },
    changes: readChanges(root.querySelectorAll(".sbe-fx-mchange")),
    stack: {
      enabled: chk(".sbe-fx-stack"),
      max: Number(val(".sbe-fx-stackmax")) || 1,
      scale: chk(".sbe-fx-scale")
    },
    group: val(".sbe-fx-group"),
    category: val(".sbe-fx-category"),
    /* Ancienne case « retiré en sortant de la zone » : le réglage vit
       maintenant sur la ligne d'effet de la zone (onglet Zone de l'objet) ;
       la valeur est gardée telle quelle pour la conversion. */
    zoneLeave: has(".sbe-fx-zleave") ? chk(".sbe-fx-zleave") : !!d.zoneLeave,
    noDefense: has(".sbe-fx-nodef") ? chk(".sbe-fx-nodef") : !!d.noDefense,
    foundryStatus: has(".sbe-fx-fstatus") ? val(".sbe-fx-fstatus") : (d.foundryStatus ?? ""),
    trigger: {
      enabled: chk(".sbe-fx-t-on"),
      logic: val(".sbe-fx-t-logic"),
      conditions: [...root.querySelectorAll(".sbe-fx-t-cond")].map(i => i.value),
      onCombatStart: chk(".sbe-fx-t-combat"),
      onDecrease: val(".sbe-fx-t-dec")
    },
    periodic: {
      enabled: chk(".sbe-fx-p-on"),
      timing: val(".sbe-fx-p-timing"),
      interval: Number(val(".sbe-fx-p-int")) || 60,
      key: val(".sbe-fx-p-key"),
      amount: val(".sbe-fx-p-amount"),
      reduceKey: val(".sbe-fx-p-reduce"),
      chat: chk(".sbe-fx-p-chat"),
      target: val(".sbe-fx-p-target") || "actor",
      onZero: val(".sbe-fx-p-zero") || "none"
    },
    resist: {
      enabled: chk(".sbe-fx-r-on"),
      key: val(".sbe-fx-r-key"),
      difficulty: val(".sbe-fx-r-diff"),
      onApply: chk(".sbe-fx-r-apply"),
      onRound: chk(".sbe-fx-r-round"),
      result: val(".sbe-fx-r-result"),
      reduceBy: Number(val(".sbe-fx-r-by")) || 1,
      crit: chk(".sbe-fx-r-crit"),
      critMult: Number(val(".sbe-fx-r-mult")) || 2
    },
    escalation: {
      enabled: chk(".sbe-fx-e-on"),
      timing: val(".sbe-fx-e-timing"),
      interval: Number(val(".sbe-fx-e-int")) || 60,
      step: Number(val(".sbe-fx-e-step")) || 1,
      decay: chk(".sbe-fx-e-decay"),
      rise: val(".sbe-fx-e-rise") === "manual" ? "manual" : "auto",
      tiers: [...root.querySelectorAll(".sbe-fx-tier:not(.sbe-fx-phase)")].map(t => ({
        label: t.querySelector(".sbe-fx-tier-label")?.value ?? "",
        icon: t.querySelector(".sbe-fx-tier-icon")?.value ?? "",
        amount: t.querySelector(".sbe-fx-tier-amount")?.value ?? "",
        changes: readChanges(t.querySelectorAll(".sbe-fx-tchange"))
      }))
    },
    phases: [...root.querySelectorAll(".sbe-fx-phase")].map(ph => {
      const u = UNITS.find(([x]) => x === ph.querySelector(".sbe-fx-ph-unit")?.value)?.[1] ?? 60;
      return {
        label: ph.querySelector(".sbe-fx-ph-label")?.value ?? "",
        icon: ph.querySelector(".sbe-fx-ph-icon")?.value ?? "",
        rounds: Number(ph.querySelector(".sbe-fx-ph-rounds")?.value) || 0,
        seconds: Math.round((Number(ph.querySelector(".sbe-fx-ph-time")?.value) || 0) * u),
        changes: readChanges(ph.querySelectorAll(".sbe-fx-pchange"))
      };
    }),
    look: {
      sound: val(".sbe-fx-l-sound"),
      volume: Number(val(".sbe-fx-l-volume")) || 0,
      loop: chk(".sbe-fx-l-loop"),
      audience: val(".sbe-fx-l-aud") || "all",
      range: Number(val(".sbe-fx-l-range")) || 0,
      falloff: chk(".sbe-fx-l-falloff"),
      tint: chk(".sbe-fx-l-tinton") ? val(".sbe-fx-l-tint") : "",
      bigIcon: chk(".sbe-fx-l-big"),
      discreet: chk(".sbe-fx-l-discreet"),
      thermalMask: chk(".sbe-fx-l-thermal"),
      blind: chk(".sbe-fx-l-blind"),
      anim: { file: val(".sbe-fx-l-anim").trim(), size: Number(val(".sbe-fx-l-animsize")) || 1, screen: chk(".sbe-fx-l-animscreen") },
      light: { enabled: chk(".sbe-fx-l-light"), ...readLightFields(root) },
      sight: { enabled: chk(".sbe-fx-l-sight"), mode: val(".sbe-fx-l-sightmode"), range: val(".sbe-fx-l-sightrange"), angle: val(".sbe-fx-l-sightangle") }
    },
    restHeal: {
      mode: val(".sbe-fx-h-mode"),
      reduceBy: Number(val(".sbe-fx-h-by")) || 1,
      key: val(".sbe-fx-h-key"),
      difficulty: val(".sbe-fx-h-diff"),
      onSuccess: val(".sbe-fx-h-success")
    },
    gives: [...root.querySelectorAll(".sbe-fx-give")].map(r => ({
      uuid: r.dataset.uuid ?? "",
      where: r.querySelector(".sbe-fx-g-where")?.value ?? "",
      lock: !!r.querySelector(".sbe-fx-g-lock")?.checked,
      end: r.querySelector(".sbe-fx-g-end")?.value ?? "remove"
    }))
  };
}

/** Sections dépliées de l'éditeur (gardées d'un rendu à l'autre). */
export function readOpenSections(root, into = {}) {
  for (const sec of root.querySelectorAll(".sbe-fx-sec")) into[sec.dataset.sec] = sec.open;
  return into;
}

/**
 * Actions de structure de l'éditeur (ajouter / retirer une ligne).
 * À appeler APRÈS la relecture ; `def` est modifiée sur place.
 * Les « del… » retirent la ligne du DOM : on les traite AVANT la
 * relecture (voir `removeRow`).
 */
export function addRow(action, target, def) {
  const blank = () => ({ key: "", mode: "add", value: "" });
  switch (action) {
    case "addChange": def.changes.push(blank()); return true;
    case "addCond": def.trigger.conditions.push(""); return true;
    case "addPhase": def.phases.push({ label: "", icon: "", rounds: 0, seconds: 0, changes: [] }); return true;
    case "addPhaseChange": def.phases[Number(target.dataset.phase)]?.changes.push(blank()); return true;
    case "addTier": def.escalation.tiers.push({ label: "", icon: "", changes: [] }); return true;
    case "addTierChange": def.escalation.tiers[Number(target.dataset.tier)]?.changes.push(blank()); return true;
  }
  return false;
}

export function removeRow(action, target) {
  const sel = { delRow: ".sbe-fx-cond", delPhase: ".sbe-fx-phase", delTier: ".sbe-fx-tier", delChange: ".sbe-fx-change", delGive: ".sbe-fx-give" }[action];
  if (!sel) return false;
  target.closest(sel)?.remove();
  return true;
}

/**
 * OBJETS DONNÉS : on y glisse des objets du MONDE (barre latérale ou
 * compendium). `onAdd(uuid, zone)` reçoit chaque objet accepté ; la
 * zone dit à quel éditeur il revient (onglet d'objet : un par effet).
 */
export function wireGiveDrop(root, onAdd) {
  for (const zone of root.querySelectorAll(".sbe-fx-gives")) {
    if (zone.dataset.sbeWired) continue;
    zone.dataset.sbeWired = "1";
    zone.addEventListener("dragover", (ev) => { ev.preventDefault(); zone.classList.add("is-over"); });
    zone.addEventListener("dragleave", () => zone.classList.remove("is-over"));
    zone.addEventListener("drop", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      zone.classList.remove("is-over");
      let data = null;
      try { data = foundry.applications.ux.TextEditor.implementation.getDragEventData(ev); } catch (_e) { data = null; }
      const doc = data?.type === "Item" && data.uuid ? await fromUuid(data.uuid).catch(() => null) : null;
      if (doc?.type !== "objet" || doc.parent) {
        ui.notifications.warn(game.i18n.localize("SBE.Effects.Gives.WorldOnly"));
        return;
      }
      onAdd(doc.uuid, zone);
    });
  }
}
