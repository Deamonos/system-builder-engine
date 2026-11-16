/**
 * SBE — Onglet « Zone » de l'objet (MJ)
 *
 * Tout le réglage d'une zone persistante se fait ICI, sur l'objet du
 * monde : un cocktail incendiaire et une grosse bombe incendiaire ne
 * laissent pas la même zone, même s'ils partagent le bouton de leur
 * modèle d'atelier. Les exemplaires suivent leur modèle.
 *
 * Rangement : flags[SYSTEM_ID].zone de l'objet (cleanZone). Les champs
 * n'ont pas de « name » : ils ne passent pas par le formulaire de la
 * fiche ; chaque changement écrit directement le réglage.
 */

import { SYSTEM_ID, audioFormatsHint } from "../../helpers/constants.mjs";
import { KEY_RE } from "../../builder/element-renderer.mjs";
import { validateFormula, HAS_DICE } from "../../builder/formula-engine.mjs";
import { EffectManager } from "../effects/effect-manager.mjs";
import { ItemEffects } from "../effects/item-effects.mjs";
import { ZoneShapes } from "./zone-shapes.mjs";
import {
  cleanZone, zoneHolder, ZONE_SHAPES, ZONE_POSITIONS, ZONE_TOUCH, ZONE_WHEN, ZONE_ACTIONS, ZONE_OUTCOMES,
  ZONE_WEAKER, ZONE_TIE, ZONE_OVERLAP, ZONE_REPEAT, ZONE_MERGE_POWER, ZONE_MERGE_TIME, ZONE_MERGE_LOOK, ZONE_ANNOUNCE
} from "./persistent-zones.mjs";
import { TRACE_SIZES, TRACE_DURATIONS, traceActive } from "./zone-trace.mjs";
import { cfCell, cfGrid, cfTip } from "../../helpers/compact-form.mjs";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const opt = (v, label, sel) => `<option value="${esc(v)}" ${String(v) === String(sel) ? "selected" : ""}>${esc(label)}</option>`;

/* Sections repliables ouvertes, par objet : gardées d'un rendu à l'autre
   (fermées par défaut : l'essentiel reste visible, le reste se déplie). */
const OPEN = new Map();
const isOpen = (item, sec) => !!OPEN.get(item.uuid)?.has(sec);

/** Les natures déjà utilisées dans le monde (proposées à la frappe). */
function knownNatures() {
  const out = new Set();
  for (const it of game.items ?? []) {
    const n = cleanZone(it.flags?.[SYSTEM_ID]?.zone).nature;
    if (n) out.add(n);
  }
  return [...out].sort((a, b) => a.localeCompare(b, game.i18n.lang));
}

/** Rythme hors combat : secondes → { montant, unité }. */
function splitEvery(sec) {
  return sec % 60 === 0 ? { amount: sec / 60, unit: "minutes" } : { amount: sec, unit: "seconds" };
}

/** Un champ de la grille (2 colonnes) : libellé au-dessus, aide en bulle. */
function field(label, input, { hint = "", hidden = false, wide = false } = {}) {
  return cfCell(label, input, { hint, hidden, wide });
}

/** Une case à cocher de la grille. */
function check(cls, on, label, hint = "") {
  return cfCell(label, `<input type="checkbox" class="${cls}" ${on ? "checked" : ""}>`, { hint, check: true });
}

/** Titre de section, son aide en bulle. */
const title = (label, hint = "") => `<h3 class="sbe-itemfx-title">${esc(label)}${cfTip(hint)}</h3>`;

/** La section « Trace au sol » (avec ou sans zone cochée). */
function traceHTML(item, z) {
  const t = z.trace;
  const numIn = (cls, v, step = 1) => `<input type="number" class="${cls}" value="${esc(v)}" min="0" step="${step}">`;
  /* Sans zone : la trace a besoin de son propre déclencheur. */
  let trig = [];
  if (!z.on) {
    const buttons = ItemEffects.buttonsOf(item);
    const isBtn = z.trigger.startsWith("button:");
    const trigOpts = opt("attack", L("SBE.PZone.TrigAttack"), z.trigger)
      + buttons.map(b => opt(`button:${b.key}`, L("SBE.ItemFx.OnButton", { name: b.label }), z.trigger)).join("")
      + (isBtn && !buttons.some(b => `button:${b.key}` === z.trigger) ? opt(z.trigger, `${z.trigger} ⚠`, z.trigger) : "");
    trig = [
      field(L("SBE.PZone.Trigger"), `<select class="sbe-zt-trigger">${trigOpts}</select>`, { hidden: !t.atImpact }),
      field(L("SBE.ItemFx.TriggerIf"), `<select class="sbe-zt-outcome">${ZONE_OUTCOMES.map(o => opt(o, L(`SBE.ItemFx.Outcome.${o}`), z.outcome)).join("")}</select>`, { hidden: !t.atImpact || !isBtn }),
      field(L("SBE.PZone.TraceWhere"), `<select class="sbe-zt-position">${["impact", "target", "attachSelf"].map(p => opt(p, L(`SBE.PZone.TracePos.${p}`), z.position)).join("")}</select>`, { hidden: !t.atImpact })
    ];
  }
  const active = traceActive(z);
  const zoneSize = z.on && t.size === "zone";
  return `<details class="sbe-fx-sec sbe-zt-sec" data-zsec="trace" ${isOpen(item, "trace") || (!z.on && active) ? "open" : ""}>
    <summary>${esc(L("SBE.PZone.SecTrace"))}${cfTip(L(z.on ? "SBE.PZone.TraceHint" : "SBE.PZone.TraceHintNoZone"))}</summary>
    ${cfGrid([
      z.on ? check("sbe-zt-tr-end", t.atEnd, L("SBE.PZone.TraceEnd")) : "",
      check("sbe-zt-tr-impact", t.atImpact, L("SBE.PZone.TraceImpact")),
      ...trig
    ])}
    <div ${active ? "" : "hidden"}>
      ${cfGrid([
        z.on ? field(L("SBE.PZone.TraceSize"), `<select class="sbe-zt-tr-size">${TRACE_SIZES.map(v => opt(v, L(`SBE.PZone.TraceSize_${v}`), t.size)).join("")}</select>`) : "",
        field(L("SBE.PZone.TraceCases"), numIn("sbe-zt-tr-cases", t.cases, 0.5), { hidden: zoneSize }),
        field(L("SBE.PZone.TraceDuration"), `<select class="sbe-zt-tr-dur">${TRACE_DURATIONS.map(v => opt(v, L(`SBE.PZone.TraceDur_${v}`), t.duration)).join("")}</select>`),
        field(L("SBE.PZone.TraceMinutes"), numIn("sbe-zt-tr-min", t.minutes, 5), { hidden: t.duration !== "minutes" }),
        check("sbe-zt-tr-rotate", t.rotate, L("SBE.PZone.TraceRotate"), L("SBE.PZone.TraceMediaWhere"))
      ])}
      ${!t.media.length ? `<p class="sbe-zt-warn"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(L("SBE.PZone.TraceNoMedia"))}</p>` : ""}
    </div>
  </details>`;
}

/** HTML de l'onglet. */
export async function itemZoneTabHTML(item) {
  const holder = zoneHolder(item);
  const z = cleanZone(holder?.flags?.[SYSTEM_ID]?.zone);

  /* Exemplaire : sa zone EST celle du modèle. */
  if (holder !== item) {
    return `<section class="sbe-obj-fields sbe-obj-tabscroll sbe-zonetab">
      <h3 class="sbe-itemfx-title">${L("SBE.PZone.Title")}</h3>
      <p class="notes">${esc(L("SBE.PZone.Inherit", { name: holder.name }))}</p>
      <p>${esc(z.on ? L("SBE.PZone.InheritOn", { nature: z.nature || "?" }) : L("SBE.PZone.InheritOff"))}</p>
      <div class="sbe-itemfx-inherit">
        <button type="button" class="sbe-zt-openmodel"><i class="fa-solid fa-up-right-from-square"></i> ${L("SBE.ItemFx.InheritOpen")}</button>
      </div>
    </section>`;
  }

  const head = `${title(L("SBE.PZone.Title"), L("SBE.PZone.TabHint"))}
    <div class="sbe-zt-headrow">
      <label class="sbe-fx-check sbe-zt-onrow"><input type="checkbox" class="sbe-zt-on" ${z.on ? "checked" : ""}> ${L("SBE.PZone.On")}</label>
      <button type="button" class="sbe-zt-copy"><i class="fa-solid fa-copy"></i> ${L("SBE.PZone.CopyFrom")}</button>
    </div>`;
  if (!z.on) return `<section class="sbe-obj-fields sbe-obj-tabscroll sbe-zonetab">${head}${traceHTML(item, z)}</section>`;

  /* --- Nature --- */
  const raw = z.natureRaw;
  const natureWarn = !raw ? L("SBE.PZone.NatureMissing") : (!KEY_RE.test(raw.toLowerCase()) ? L("SBE.PZone.NatureBad") : "");
  const natures = knownNatures();
  const natureInput = `<input type="text" class="sbe-zt-nature" list="sbe-zt-natures" value="${esc(raw)}" placeholder="${esc(L("SBE.PZone.NaturePh"))}">
    <datalist id="sbe-zt-natures">${natures.map(n => `<option value="${esc(n)}"></option>`).join("")}</datalist>
    ${natureWarn ? `<p class="sbe-zt-warn"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(natureWarn)}</p>` : ""}`;

  /* --- Déclencheur --- */
  const buttons = ItemEffects.buttonsOf(item);
  const isBtn = z.trigger.startsWith("button:");
  const trigOpts = opt("attack", L("SBE.PZone.TrigAttack"), z.trigger)
    + buttons.map(b => opt(`button:${b.key}`, L("SBE.ItemFx.OnButton", { name: b.label }), z.trigger)).join("")
    + (isBtn && !buttons.some(b => `button:${b.key}` === z.trigger) ? opt(z.trigger, `${z.trigger} ⚠`, z.trigger) : "");

  /* --- Gabarit --- */
  const k = z.shape.kind;
  const templates = ZoneShapes.list();
  const tplOpts = `<option value="">${esc(L("SBE.PZone.PickTemplate"))}</option>`
    + templates.map(t => opt(t.name, t.name, z.shape.template)).join("")
    + (z.shape.template && !templates.some(t => t.name === z.shape.template) ? opt(z.shape.template, `${z.shape.template} ⚠`, z.shape.template) : "");
  const numIn = (cls, v, step = 1) => `<input type="number" class="${cls}" value="${esc(v)}" min="0" step="${step}">`;

  /* --- Durée --- */
  const every = splitEvery(z.every);

  /* --- Effets donnés --- */
  const ownDefs = EffectManager.localDefsOf(item, { draft: true });
  const effList = [
    ...ownDefs.map((d, i) => ({ key: d.key, label: `★ ${ownDefs.length > 1 ? `${item.name} (${i + 1})` : item.name}` })),
    ...EffectManager.effectOptions()
  ];
  const rows = z.effects.map(e => {
    const effOpts = `<option value="">${esc(L("SBE.ItemFx.PickEffect"))}</option>`
      + effList.map(x => opt(x.key, x.label, e.key)).join("")
      + (e.key && !effList.some(x => x.key === e.key) ? opt(e.key, `${e.key} ⚠`, e.key) : "");
    return `<div class="sbe-zt-fx" data-id="${esc(e.id)}">
      ${cfGrid([
        field(L("SBE.PZone.FxEffect"), `<select class="sbe-zt-fx-key">${effOpts}</select>`),
        field(L("SBE.PZone.FxAction"), `<select class="sbe-zt-fx-action">${ZONE_ACTIONS.map(a => opt(a, L(`SBE.Steps.FxAction.${a}`), e.action)).join("")}</select>`),
        field(L("SBE.PZone.FxCombat"), `<select class="sbe-zt-fx-combat">${ZONE_WHEN.map(m => opt(m, L(`SBE.PZone.WhenCombat.${m}`), e.combat)).join("")}</select>`),
        field(L("SBE.PZone.FxCalm"), `<select class="sbe-zt-fx-calm">${ZONE_WHEN.map(m => opt(m, L(`SBE.PZone.WhenCalm.${m}`), e.calm)).join("")}</select>`),
        field(L("SBE.PZone.FxOnlyIf"), `<input type="text" class="sbe-zt-fx-if" value="${esc(e.onlyIf)}" placeholder="${esc(L("SBE.PZone.FxOnlyIfPh"))}">`),
        check("sbe-zt-fx-leave", e.leave, L("SBE.PZone.FxLeave"), L("SBE.PZone.FxLeaveHint"))
      ])}
      <a class="sbe-zt-fx-del" data-tooltip-text="${esc(L("SBE.Common.Delete"))}"><i class="fa-solid fa-trash"></i></a>
    </div>`;
  }).join("");

  const lightAnims = `<select class="sbe-zt-lanim">${opt("", L("SBE.PZone.LightAnimNone"), z.light.animation)}${Object.entries(CONFIG.Canvas?.lightAnimations ?? {}).map(([k, a]) => opt(k, game.i18n.localize(a.label ?? k), z.light.animation)).join("")}</select>`;
  const merge = z.overlap === "merge";

  return `<section class="sbe-obj-fields sbe-obj-tabscroll sbe-zonetab">
    ${head}

    ${title(L("SBE.PZone.SecWhere"))}
    ${cfGrid([
      field(L("SBE.PZone.Nature"), natureInput, { hint: L("SBE.PZone.NatureHint") }),
      field(L("SBE.PZone.Touch"), `<select class="sbe-zt-touch">${ZONE_TOUCH.map(t => opt(t, L(`SBE.PZone.Touch_${t}`), z.touch)).join("")}</select>`, { hint: L("SBE.PZone.TouchHint") }),
      field(L("SBE.PZone.Trigger"), `<select class="sbe-zt-trigger">${trigOpts}</select>`),
      field(L("SBE.ItemFx.TriggerIf"), `<select class="sbe-zt-outcome">${ZONE_OUTCOMES.map(o => opt(o, L(`SBE.ItemFx.Outcome.${o}`), z.outcome)).join("")}</select>`, { hidden: !isBtn }),
      field(L("SBE.PZone.Position"), `<select class="sbe-zt-position">${ZONE_POSITIONS.map(p => opt(p, L(`SBE.PZone.Pos.${p}`), z.position)).join("")}</select>`),
      cfCell(L("SBE.PZone.EndWithEffect"), `<input type="checkbox" class="sbe-zt-endfx" ${z.endWithEffect ? "checked" : ""}>`,
        { hint: L("SBE.PZone.EndWithEffectHint"), check: true, hidden: z.position !== "attachSelf" }),
      field(L("SBE.PZone.Shape"), `<select class="sbe-zt-kind">${ZONE_SHAPES.map(sh => opt(sh, L(`SBE.PZone.Kind.${sh}`), k)).join("")}</select>`, { hint: L("SBE.PZone.ShapeHint") }),
      field(L("SBE.PZone.Radius"), numIn("sbe-zt-radius", z.shape.radius, 0.5), { hidden: k !== "circle" }),
      field(L("SBE.PZone.Length"), numIn("sbe-zt-length", z.shape.length, 0.5), { hidden: k !== "cone" && k !== "line" }),
      field(L("SBE.PZone.Angle"), numIn("sbe-zt-angle", z.shape.angle, 5), { hidden: k !== "cone" }),
      field(L("SBE.PZone.Width"), numIn("sbe-zt-width", z.shape.width, 0.5), { hidden: k !== "line" }),
      field(L("SBE.PZone.Template"), `<select class="sbe-zt-template">${tplOpts}</select>`, { hidden: k !== "template" }),
      field(L("SBE.PZone.Scale"), numIn("sbe-zt-scale", z.shape.scale, 0.1), { hidden: k !== "template" })
    ])}

    ${title(L("SBE.PZone.SecDuration"), L("SBE.PZone.DurationHint"))}
    ${cfGrid([
      field(L("SBE.PZone.Rounds"), numIn("sbe-zt-rounds", z.rounds)),
      field(L("SBE.PZone.Minutes"), numIn("sbe-zt-minutes", z.minutes, 0.5)),
      field(L("SBE.PZone.Every"), `<div class="sbe-cf-inline">${numIn("sbe-zt-every", every.amount)}
        <select class="sbe-zt-everyunit">${opt("seconds", L("SBE.Effects.Unit.seconds"), every.unit)}${opt("minutes", L("SBE.Effects.Unit.minutes"), every.unit)}</select></div>`,
        { hint: L("SBE.PZone.EveryHint") })
    ])}

    <details class="sbe-fx-sec sbe-zt-sec" data-zsec="power" ${isOpen(item, "power") ? "open" : ""}>
      <summary>${esc(L("SBE.PZone.SecPower"))}${cfTip(L("SBE.PZone.PowerHint"))}</summary>
      ${cfGrid([
        field(L("SBE.PZone.Power"), `<input type="text" class="sbe-zt-power" value="${esc(z.power)}" placeholder="1">`, { hint: L("SBE.PZone.PowerFieldHint") }),
        field(L("SBE.PZone.EndPower"), numIn("sbe-zt-endpower", z.endPower, 5), { hint: L("SBE.PZone.EndPowerHint") }),
        field(L("SBE.PZone.Weaker"), `<select class="sbe-zt-weaker">${ZONE_WEAKER.map(v => opt(v, L(`SBE.PZone.Weaker_${v}`), z.weaker)).join("")}</select>`),
        field(L("SBE.PZone.Tie"), `<select class="sbe-zt-tie">${ZONE_TIE.map(v => opt(v, L(`SBE.PZone.Tie_${v}`), z.tie)).join("")}</select>`),
        field(L("SBE.PZone.Excludes"), `<input type="text" class="sbe-zt-excludes" list="sbe-zt-natures" value="${esc(z.excludes.join(", "))}" placeholder="${esc(L("SBE.PZone.ExcludesPh"))}">`, { hint: L("SBE.PZone.ExcludesHint") }),
        check("sbe-zt-shrink", z.shrink, L("SBE.PZone.Shrink"))
      ])}
    </details>

    <details class="sbe-fx-sec sbe-zt-sec" data-zsec="advanced" ${isOpen(item, "advanced") ? "open" : ""}>
      <summary>${esc(L("SBE.PZone.SecAdvanced"))}</summary>
      ${cfGrid([
        field(L("SBE.PZone.Overlap"), `<select class="sbe-zt-overlap">${ZONE_OVERLAP.map(v => opt(v, L(`SBE.PZone.Overlap_${v}`), z.overlap)).join("")}</select>`, { hint: L(merge ? "SBE.PZone.MergeHint" : "SBE.PZone.OverlapHint") }),
        field(L("SBE.PZone.Repeat"), `<select class="sbe-zt-repeat">${ZONE_REPEAT.map(v => opt(v, L(`SBE.PZone.Repeat_${v}`), z.repeat)).join("")}</select>`, { hint: L("SBE.PZone.RepeatHint") }),
        field(L("SBE.PZone.MergePower"), `<select class="sbe-zt-mpower">${ZONE_MERGE_POWER.map(v => opt(v, L(`SBE.PZone.MergePower_${v}`), z.mergePower)).join("")}</select>`, { hidden: !merge }),
        field(L("SBE.PZone.MergeCap"), `<input type="text" class="sbe-zt-mcap" value="${esc(z.mergeCap)}" placeholder="10">`, { hidden: !merge || z.mergePower !== "capped" }),
        field(L("SBE.PZone.MergeTime"), `<select class="sbe-zt-mtime">${ZONE_MERGE_TIME.map(v => opt(v, L(`SBE.PZone.MergeTime_${v}`), z.mergeTime)).join("")}</select>`, { hidden: !merge }),
        field(L("SBE.PZone.MergeLook"), `<select class="sbe-zt-mlook">${ZONE_MERGE_LOOK.map(v => opt(v, L(`SBE.PZone.MergeLook_${v}`), z.mergeLook)).join("")}</select>`, { hint: L("SBE.PZone.MergeLookHint"), hidden: !merge })
      ])}
    </details>

    <details class="sbe-fx-sec sbe-zt-sec" data-zsec="look" ${isOpen(item, "look") ? "open" : ""}>
      <summary>${esc(L("SBE.PZone.SecLook"))}${cfTip(`${L("SBE.PZone.LookHint")} ${L("SBE.PZone.MediaWhere")}`)}</summary>
      ${cfGrid([
        field(L("SBE.PZone.Color"), `<input type="color" class="sbe-zt-color" value="${esc(z.color || "#ff6a00")}">`, { hint: L("SBE.PZone.ColorHint") }),
        field(L("SBE.PZone.Announce"), `<select class="sbe-zt-announce">${ZONE_ANNOUNCE.map(v => opt(v, L(`SBE.PZone.Announce_${v}`), z.announce)).join("")}</select>`),
        check("sbe-zt-block", z.blockSight, L("SBE.PZone.BlockSight"), L("SBE.PZone.BlockSightHint")),
        check("sbe-zt-light", z.light.on, L("SBE.PZone.Light")),
        field(L("SBE.PZone.LightColor"), `<input type="color" class="sbe-zt-lcolor" value="${esc(z.light.color)}">`, { hidden: !z.light.on }),
        field(L("SBE.PZone.LightAnim"), lightAnims, { hidden: !z.light.on }),
        field(L("SBE.PZone.LightDim"), numIn("sbe-zt-ldim", z.light.dim, 0.5), { hidden: !z.light.on }),
        field(L("SBE.PZone.LightBright"), numIn("sbe-zt-lbright", z.light.bright, 0.5), { hidden: !z.light.on }),
        field(L("SBE.PZone.LightSpeed"), numIn("sbe-zt-lspeed", z.light.speed), { hidden: !z.light.on }),
        field(L("SBE.PZone.LightIntensity"), numIn("sbe-zt-lint", z.light.intensity), { hidden: !z.light.on })
      ])}
    </details>

    ${traceHTML(item, z)}

    ${title(L("SBE.PZone.SecEffects"), L("SBE.PZone.EffectsHint"))}
    <div class="sbe-zt-fxlist">${rows || `<p class="notes sbe-itemfx-empty">${L("SBE.PZone.NoEffects")}</p>`}</div>
    <button type="button" class="sbe-zt-fx-add"><i class="fa-solid fa-plus"></i> ${L("SBE.PZone.AddEffect")}</button>
  </section>`;
}

/** Relit l'onglet. */
function readTab(root, prev) {
  const val = (sel) => root.querySelector(sel)?.value ?? "";
  const n = (sel, d) => (root.querySelector(sel) ? Number(val(sel)) : d);
  const everyUnit = val(".sbe-zt-everyunit") === "minutes" ? 60 : 1;
  const nature = root.querySelector(".sbe-zt-nature") ? val(".sbe-zt-nature").trim() : prev.natureRaw;
  return {
    on: !!root.querySelector(".sbe-zt-on")?.checked,
    nature: nature.toLowerCase(),
    natureRaw: nature,
    trigger: root.querySelector(".sbe-zt-trigger") ? val(".sbe-zt-trigger") : prev.trigger,
    outcome: root.querySelector(".sbe-zt-outcome") ? val(".sbe-zt-outcome") : prev.outcome,
    shape: {
      kind: root.querySelector(".sbe-zt-kind") ? val(".sbe-zt-kind") : prev.shape.kind,
      radius: n(".sbe-zt-radius", prev.shape.radius),
      length: n(".sbe-zt-length", prev.shape.length),
      angle: n(".sbe-zt-angle", prev.shape.angle),
      width: n(".sbe-zt-width", prev.shape.width),
      template: root.querySelector(".sbe-zt-template") ? val(".sbe-zt-template") : prev.shape.template,
      scale: n(".sbe-zt-scale", prev.shape.scale)
    },
    position: root.querySelector(".sbe-zt-position") ? val(".sbe-zt-position") : prev.position,
    rounds: n(".sbe-zt-rounds", prev.rounds),
    minutes: n(".sbe-zt-minutes", prev.minutes),
    every: root.querySelector(".sbe-zt-every") ? Math.round(Number(val(".sbe-zt-every")) * everyUnit) : prev.every,
    touch: root.querySelector(".sbe-zt-touch") ? val(".sbe-zt-touch") : prev.touch,
    power: root.querySelector(".sbe-zt-power") ? val(".sbe-zt-power") : prev.power,
    endPower: n(".sbe-zt-endpower", prev.endPower),
    shrink: root.querySelector(".sbe-zt-shrink") ? !!root.querySelector(".sbe-zt-shrink").checked : prev.shrink,
    excludes: root.querySelector(".sbe-zt-excludes") ? val(".sbe-zt-excludes") : prev.excludes,
    weaker: root.querySelector(".sbe-zt-weaker") ? val(".sbe-zt-weaker") : prev.weaker,
    tie: root.querySelector(".sbe-zt-tie") ? val(".sbe-zt-tie") : prev.tie,
    overlap: root.querySelector(".sbe-zt-overlap") ? val(".sbe-zt-overlap") : prev.overlap,
    repeat: root.querySelector(".sbe-zt-repeat") ? val(".sbe-zt-repeat") : prev.repeat,
    color: root.querySelector(".sbe-zt-color") ? val(".sbe-zt-color") : prev.color,
    announce: root.querySelector(".sbe-zt-announce") ? val(".sbe-zt-announce") : prev.announce,
    blockSight: root.querySelector(".sbe-zt-block") ? !!root.querySelector(".sbe-zt-block").checked : prev.blockSight,
    endWithEffect: root.querySelector(".sbe-zt-endfx") ? !!root.querySelector(".sbe-zt-endfx").checked : prev.endWithEffect,
    light: root.querySelector(".sbe-zt-light") ? {
      on: !!root.querySelector(".sbe-zt-light").checked,
      color: val(".sbe-zt-lcolor") || prev.light.color,
      dim: n(".sbe-zt-ldim", prev.light.dim),
      bright: n(".sbe-zt-lbright", prev.light.bright),
      animation: val(".sbe-zt-lanim"),
      speed: n(".sbe-zt-lspeed", prev.light.speed),
      intensity: n(".sbe-zt-lint", prev.light.intensity)
    } : prev.light,
    look: prev.look,
    trace: {
      ...prev.trace,
      atEnd: root.querySelector(".sbe-zt-tr-end") ? !!root.querySelector(".sbe-zt-tr-end").checked : prev.trace.atEnd,
      atImpact: root.querySelector(".sbe-zt-tr-impact") ? !!root.querySelector(".sbe-zt-tr-impact").checked : prev.trace.atImpact,
      size: root.querySelector(".sbe-zt-tr-size") ? val(".sbe-zt-tr-size") : prev.trace.size,
      cases: n(".sbe-zt-tr-cases", prev.trace.cases),
      duration: root.querySelector(".sbe-zt-tr-dur") ? val(".sbe-zt-tr-dur") : prev.trace.duration,
      minutes: n(".sbe-zt-tr-min", prev.trace.minutes),
      rotate: root.querySelector(".sbe-zt-tr-rotate") ? !!root.querySelector(".sbe-zt-tr-rotate").checked : prev.trace.rotate
    },
    mergePower: root.querySelector(".sbe-zt-mpower") ? val(".sbe-zt-mpower") : prev.mergePower,
    mergeCap: root.querySelector(".sbe-zt-mcap") ? val(".sbe-zt-mcap") : prev.mergeCap,
    mergeTime: root.querySelector(".sbe-zt-mtime") ? val(".sbe-zt-mtime") : prev.mergeTime,
    mergeLook: root.querySelector(".sbe-zt-mlook") ? val(".sbe-zt-mlook") : prev.mergeLook,
    effects: root.querySelector(".sbe-zt-fxlist")
      ? [...root.querySelectorAll(".sbe-zt-fx")].map(row => ({
          id: row.dataset.id,
          key: row.querySelector(".sbe-zt-fx-key")?.value ?? "",
          combat: row.querySelector(".sbe-zt-fx-combat")?.value ?? "enter",
          calm: row.querySelector(".sbe-zt-fx-calm")?.value ?? "enter",
          leave: !!row.querySelector(".sbe-zt-fx-leave")?.checked,
          action: row.querySelector(".sbe-zt-fx-action")?.value ?? "apply",
          onlyIf: row.querySelector(".sbe-zt-fx-if")?.value ?? ""
        }))
      : prev.effects
  };
}

async function save(item, z) {
  /* Formule douteuse (« Seulement si », puissance) : signalée, jamais bloquée. */
  const plain = (f) => (Number.isFinite(Number(f)) || HAS_DICE.test(String(f ?? "")) ? "" : f);
  const formulas = [...z.effects.map(e => e.onlyIf), plain(z.power), plain(z.mergeCap)];
  for (const f of formulas) {
    const err = f ? validateFormula(f) : null;
    if (err) ui.notifications.warn(L("SBE.PZone.BadFormula", { err: `${f} : ${err}` }));
  }
  const clean = cleanZone(z);
  return item.update({ [`flags.${SYSTEM_ID}.zone`]: clean });
}

/** Câblage de l'onglet (MJ). */
export function wireItemZoneTab(sheet) {
  const root = sheet.element?.querySelector(".sbe-zonetab");
  if (!root || !game.user.isGM) return;
  const item = sheet.document;
  root.querySelector(".sbe-zt-openmodel")?.addEventListener("click", (ev) => {
    ev.preventDefault();
    zoneHolder(item)?.sheet?.render(true);
  });
  if (zoneHolder(item) !== item) return;
  const prev = () => cleanZone(item.flags?.[SYSTEM_ID]?.zone);

  root.addEventListener("change", (ev) => {
    ev.stopPropagation();
    save(item, readTab(root, prev()));
  });
  root.addEventListener("input", (ev) => ev.stopPropagation());
  /* Sections dépliées : retenues pour le prochain rendu. */
  for (const det of root.querySelectorAll(".sbe-zt-sec")) {
    det.addEventListener("toggle", () => {
      if (!OPEN.has(item.uuid)) OPEN.set(item.uuid, new Set());
      if (det.open) OPEN.get(item.uuid).add(det.dataset.zsec); else OPEN.get(item.uuid).delete(det.dataset.zsec);
    });
  }
  root.addEventListener("click", (ev) => {
    if (ev.target.closest(".sbe-zt-copy")) {
      ev.preventDefault();
      return copyFrom(item);
    }
    const del = ev.target.closest(".sbe-zt-fx-del");
    if (del) {
      ev.preventDefault();
      const id = del.closest(".sbe-zt-fx")?.dataset.id;
      const z = readTab(root, prev());
      z.effects = z.effects.filter(e => e.id !== id);
      return save(item, z);
    }
    if (ev.target.closest(".sbe-zt-fx-add")) {
      ev.preventDefault();
      const z = readTab(root, prev());
      z.effects.push({ key: "", combat: "enter", calm: "enter", action: "apply", leave: false, onlyIf: "" });
      return save(item, z);
    }
  });
}

/**
 * « Copier la zone d'un autre objet… » : tout le réglage (zone, apparence,
 * trace, médias) d'un autre objet du monde remplace celui-ci.
 */
async function copyFrom(item) {
  const list = (game.items?.contents ?? [])
    .filter(it => it !== item && zoneHolder(it) === it)
    .filter(it => { const z = cleanZone(it.flags?.[SYSTEM_ID]?.zone); return z.on || traceActive(z); })
    .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
  if (!list.length) { ui.notifications.warn(L("SBE.PZone.CopyNone")); return; }
  const id = await foundry.applications.api.DialogV2.wait({
    window: { title: L("SBE.PZone.CopyFrom"), icon: "fa-solid fa-copy" },
    content: `<div class="sbe-itemfx-field"><label>${L("SBE.PZone.CopyPick")}</label>
      <select name="src">${list.map(it => {
        const z = cleanZone(it.flags?.[SYSTEM_ID]?.zone);
        return `<option value="${esc(it.id)}">${esc(it.name)}${z.on && z.nature ? ` (${esc(z.nature)})` : ""}</option>`;
      }).join("")}</select></div>
      <p class="notes">${esc(L("SBE.PZone.CopyHint", { name: item.name }))}</p>`,
    buttons: [
      { action: "ok", label: L("SBE.PZone.CopyDo"), icon: "fa-solid fa-copy", default: true,
        callback: (_e, _b, dlg) => dlg.element.querySelector("select[name=src]")?.value ?? null },
      { action: "cancel", label: L("SBE.Common.Cancel"), icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  }).catch(() => null);
  const src = id && id !== "ok" && id !== "cancel" ? game.items.get(id) : null;
  if (!src) return;
  const z = cleanZone(src.flags?.[SYSTEM_ID]?.zone);
  /* Les effets propres à l'autre objet ne le suivent pas : ils restent
     marqués ⚠ pour être choisis à nouveau. */
  z.effects = z.effects.map(e => ({ ...e, id: foundry.utils.randomID() }));
  if (z.effects.some(e => e.key.startsWith("obj_"))) ui.notifications.warn(L("SBE.PZone.CopyOwnFx", { name: src.name }));
  await item.update({ [`flags.${SYSTEM_ID}.zone`]: z });
  ui.notifications.info(L("SBE.PZone.CopyDone", { name: src.name }));
}

/* ============================================================ */
/*  Onglet Médias : la partie « Zone » (images, vidéos, sons)    */
/* ============================================================ */

/** La partie « Zone » de l'onglet Médias doit-elle s'afficher ? */
export function hasZoneMedia(item) {
  if (!item || zoneHolder(item) !== item) return false;
  const z = cleanZone(item.flags?.[SYSTEM_ID]?.zone);
  return z.on || traceActive(z);
}

/** Une liste d'images / vidéos en pastilles (avec la croix pour retirer). */
function chipsHTML(list, cls) {
  return list.map((m, i) => `<span class="sbe-zm-chip ${cls}" data-i="${i}" data-tooltip-text="${esc(m)}">
      <i class="fa-solid ${/\.(webm|mp4|m4v|ogv)$/i.test(m) ? "fa-film" : "fa-image"}"></i> ${esc(m.split("/").pop())}
      <a class="sbe-zm-del" data-tooltip-text="${esc(L("SBE.Common.Delete"))}"><i class="fa-solid fa-xmark"></i></a></span>`).join("");
}

export function itemZoneMediaHTML(item) {
  if (!hasZoneMedia(item)) return "";
  const z = cleanZone(item.flags?.[SYSTEM_ID]?.zone);
  const lk = z.look;
  const sound = (cls, label, snd) => [
    field(label, `<div class="sbe-cf-inline"><input type="text" class="${cls}-src" value="${esc(snd.src)}" placeholder="sounds/…">
      <a class="sbe-zm-pick" data-target="${cls}-src" data-type="audio" data-tooltip-text="${esc(L("SBE.Common.Browse"))}"><i class="fa-solid fa-folder-open"></i></a></div>`, { hint: audioFormatsHint() }),
    field(L("SBE.Media.Volume"), `<input type="number" class="${cls}-vol" value="${esc(snd.volume)}" min="0" max="100" step="5">`)
  ];
  const list = (items, cls, add) => field(L("SBE.PZone.MediaList"), `<div class="sbe-zm-chips">${chipsHTML(items, cls) || `<span class="notes">${L("SBE.PZone.MediaNone")}</span>`}</div>
      <button type="button" class="${add}"><i class="fa-solid fa-plus"></i> ${L("SBE.PZone.MediaAdd")}</button>`, { wide: true });
  const tr = z.trace;
  const tracePart = traceActive(z) ? `<div class="sbe-zm-box">
    <h3 class="sbe-itemfx-title"><i class="fa-solid fa-shoe-prints"></i> ${esc(L("SBE.PZone.TraceMediaTitle"))}${cfTip(L("SBE.PZone.TraceMediaHint"))}</h3>
    ${cfGrid([
      list(tr.media, "sbe-zm-trace", "sbe-zm-tadd"),
      field(L("SBE.PZone.Opacity"), `<input type="number" class="sbe-zm-topacity" value="${esc(tr.opacity)}" min="0" max="100" step="5">`)
    ])}</div>` : "";
  if (!z.on) return `<div class="sbe-zonemedia">${tracePart}</div>`;
  return `<div class="sbe-zonemedia"><div class="sbe-zm-box">
    <h3 class="sbe-itemfx-title"><i class="fa-solid fa-fire"></i> ${esc(L("SBE.PZone.MediaTitle"))}${cfTip(L("SBE.PZone.MediaHint"))}</h3>
    ${cfGrid([
      list(lk.media, "sbe-zm-look", "sbe-zm-add"),
      ...sound("sbe-zm-loop", L("SBE.PZone.LoopSound"), lk.sound),
      ...sound("sbe-zm-start", L("SBE.PZone.StartSound"), lk.startSound),
      field(L("SBE.PZone.Opacity"), `<input type="number" class="sbe-zm-opacity" value="${esc(lk.opacity)}" min="0" max="100" step="5">`)
    ])}
    </div>
    ${tracePart}
  </div>`;
}

/** Câblage de la partie « Zone » de l'onglet Médias (MJ). */
export function wireItemZoneMedia(sheet) {
  const root = sheet.element?.querySelector(".sbe-zonemedia");
  if (!root || !game.user.isGM) return;
  const item = sheet.document;
  const current = () => cleanZone(item.flags?.[SYSTEM_ID]?.zone);
  const v = (sel) => root.querySelector(sel)?.value ?? "";
  const write = (look) => item.update({ [`flags.${SYSTEM_ID}.zone.look`]: cleanZone({ ...current(), look }).look });
  const read = () => {
    const lk = current().look;
    if (!root.querySelector(".sbe-zm-opacity")) return lk;
    return {
      media: lk.media,
      opacity: Number(v(".sbe-zm-opacity")) || 0,
      sound: { src: v(".sbe-zm-loop-src").trim(), volume: Number(v(".sbe-zm-loop-vol")) || 0 },
      startSound: { src: v(".sbe-zm-start-src").trim(), volume: Number(v(".sbe-zm-start-vol")) || 0 }
    };
  };
  /* La trace : ses images et son opacité. */
  const writeTrace = (trace) => item.update({ [`flags.${SYSTEM_ID}.zone.trace`]: cleanZone({ ...current(), trace }).trace });
  const readTrace = () => {
    const tr = current().trace;
    return root.querySelector(".sbe-zm-topacity") ? { ...tr, opacity: Number(v(".sbe-zm-topacity")) || 0 } : tr;
  };
  root.addEventListener("change", (ev) => {
    ev.stopPropagation();
    if (ev.target.closest(".sbe-zm-topacity")) return writeTrace(readTrace());
    write(read());
  });
  root.addEventListener("input", (ev) => ev.stopPropagation());
  const FP = () => foundry.applications.apps.FilePicker.implementation;
  root.addEventListener("click", (ev) => {
    const del = ev.target.closest(".sbe-zm-del");
    if (del) {
      ev.preventDefault(); ev.stopPropagation();
      const chip = del.closest(".sbe-zm-chip");
      const i = Number(chip?.dataset.i);
      if (chip?.classList.contains("sbe-zm-trace")) {
        const tr = readTrace();
        tr.media = tr.media.filter((_m, j) => j !== i);
        return writeTrace(tr);
      }
      const lk = read();
      lk.media = lk.media.filter((_m, j) => j !== i);
      return write(lk);
    }
    if (ev.target.closest(".sbe-zm-add")) {
      ev.preventDefault(); ev.stopPropagation();
      new (FP())({ type: "imagevideo", callback: (path) => { const lk = read(); lk.media = [...lk.media, path]; write(lk); } }).render(true);
      return;
    }
    if (ev.target.closest(".sbe-zm-tadd")) {
      ev.preventDefault(); ev.stopPropagation();
      new (FP())({ type: "imagevideo", callback: (path) => { const tr = readTrace(); tr.media = [...tr.media, path]; writeTrace(tr); } }).render(true);
      return;
    }
    const pickBtn = ev.target.closest(".sbe-zm-pick");
    if (pickBtn) {
      ev.preventDefault(); ev.stopPropagation();
      const input = root.querySelector(`.${pickBtn.dataset.target}`);
      new (FP())({ type: "audio", current: input?.value || "", callback: (path) => { if (input) input.value = path; write(read()); } }).render(true);
    }
  });
}
