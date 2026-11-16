/**
 * SBE — BARRES DE JETONS : l'éditeur d'une barre
 *
 * Un seul éditeur pour la fenêtre « Barres de jetons » et pour la
 * configuration d'un jeton. Il est construit en HTML, relu tel quel
 * (`data-f` = chemin du champ, `data-sf` = champ d'un palier) ; les
 * onglets basculent sans nouveau rendu.
 */

import {
  SIDES, SHAPES, COLOR_MODES, TEXT_MODES, TEXT_POS, VIS_MODES, VIEWERS,
  STEP_WHEN, STEP_OPS, PATTERNS, ANIMS, HALOS, SOUND_WHO, HUD_EDIT, HUD_POS,
  BORDER_STYLES, SHADOWS, RELIEFS, cleanBar, cleanStep
} from "./bar-model.mjs";
import { createBarPreview } from "./bar-render.mjs";

/* Réglages de l'aperçu, gardés d'un rendu à l'autre. */
const PREVIEW = { pct: 0.6, viewer: "gm" };

const L = (k) => game.i18n.localize(k);
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
export const EDITOR_TABS = ["value", "place", "look", "text", "vis", "steps"];

function opts(list, cur, prefix) {
  return list.map(v => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(L(`${prefix}.${v}`))}</option>`).join("");
}

const field = (label, html, hint = "") => `<div class="sbe-bar-field"><label>${esc(L(label))}</label>${hint ? `<p class="notes">${esc(L(hint))}</p>` : ""}${html}</div>`;
const text = (f, v, ph = "", list = "") => `<input type="text" data-f="${f}" value="${esc(v)}" placeholder="${esc(ph)}" ${list ? `list="${list}"` : ""}>`;
const number = (f, v, min, max, step = 1) => `<input type="number" data-f="${f}" value="${esc(v)}" min="${min}" max="${max}" step="${step}">`;
const color = (f, v) => `<input type="color" data-f="${f}" value="${esc(v || "#ffffff")}">`;
const check = (f, v, label) => `<label class="sbe-bar-check"><input type="checkbox" data-f="${f}" ${v ? "checked" : ""}> ${esc(L(label))}</label>`;
const select = (f, list, cur, prefix) => `<select data-f="${f}">${opts(list, cur, prefix)}</select>`;
const file = (f, v, type) => `<div class="sbe-bar-file"><input type="text" data-f="${f}" value="${esc(v)}"><button type="button" data-act="pick" data-pick="${f}" data-type="${type}"><i class="fa-solid fa-folder-open"></i></button></div>`;
const row = (...cells) => `<div class="sbe-bar-row">${cells.join("")}</div>`;

function stepHTML(st, i, n) {
  const s = (f, html) => html.replace(/data-f="([^"]+)"/, `data-sf="${f}"`);
  const P = "SBE.Bars.Step";
  return `<div class="sbe-bar-step" data-step="${i}">
    <div class="sbe-bar-step-head">
      <b>${esc(L(`${P}.Title`))} ${i + 1}</b>
      <span class="sbe-bar-step-tools">
        <button type="button" data-act="stepUp" data-step="${i}" ${i ? "" : "disabled"} data-tooltip-text="${esc(L("SBE.Bars.Up"))}"><i class="fa-solid fa-arrow-up"></i></button>
        <button type="button" data-act="stepDown" data-step="${i}" ${i < n - 1 ? "" : "disabled"} data-tooltip-text="${esc(L("SBE.Bars.Down"))}"><i class="fa-solid fa-arrow-down"></i></button>
        <button type="button" data-act="stepDel" data-step="${i}" data-tooltip-text="${esc(L("SBE.Bars.Delete"))}"><i class="fa-solid fa-trash"></i></button>
      </span>
    </div>
    ${row(
      field(`${P}.When`, s("when", select("x", STEP_WHEN, st.when, `${P}.When_`))),
      st.when === "formula"
        ? field(`${P}.Formula`, s("formula", text("x", st.formula, L("SBE.Ph.BarFormula"), "sbe-bar-keys")))
        : field(`${P}.Cond`, `<div class="sbe-bar-inline">${s("op", select("x", STEP_OPS, st.op, `${P}.Op`))}${s("amount", number("x", st.amount, -99999, 99999, "any"))}</div>`)
    )}
    ${row(
      field(`${P}.Term`, s("term", text("x", st.term, L(`${P}.TermPh`)))),
      field(`${P}.Color`, `<div class="sbe-bar-inline"><label class="sbe-bar-check"><input type="checkbox" data-sf="colorOn" ${st.color ? "checked" : ""}></label>${s("color", color("x", st.color || "#d23c3c"))}</div>`)
    )}
    ${row(
      field(`${P}.Pattern`, s("pattern", select("x", PATTERNS, st.pattern, `${P}.Pattern_`))),
      field(`${P}.PatternColor`, s("patternColor", color("x", st.patternColor))),
      `<div class="sbe-bar-field sbe-bar-field--check">${s("patternMove", check("x", st.patternMove, `${P}.PatternMove`))}</div>`
    )}
    ${row(
      field(`${P}.Anim`, s("anim", select("x", ANIMS, st.anim, `${P}.Anim_`))),
      field(`${P}.Halo`, s("halo", select("x", HALOS, st.halo, `${P}.Halo_`))),
      field(`${P}.BarGlow`, s("barGlow", select("x", HALOS, st.barGlow, `${P}.Halo_`))),
      field(`${P}.HaloWho`, `<div class="sbe-bar-inline">${s("haloLikeBar", check("x", st.haloLikeBar, `${P}.HaloLikeBar`))}${st.haloLikeBar ? "" : VIEWERS.map(v => `<label class="sbe-bar-check"><input type="checkbox" data-sf="haloFor.${v}" ${st.haloFor[v] ? "checked" : ""}> ${esc(L(`SBE.Bars.Viewer.${v}`))}</label>`).join("")}</div>`),
      field(`${P}.HaloColor`, `<div class="sbe-bar-inline"><label class="sbe-bar-check"><input type="checkbox" data-sf="haloOn" ${st.haloColor ? "checked" : ""}></label>${s("haloColor", color("x", st.haloColor || "#ff2020"))}</div>`),
      field(`${P}.Glow`, `<div class="sbe-bar-inline"><label class="sbe-bar-check"><input type="checkbox" data-sf="glowOn" ${st.glowColor ? "checked" : ""}></label>${s("glowColor", color("x", st.glowColor || "#ff3030"))}</div>`)
    )}
    ${row(
      field(`${P}.Speed`, s("speed", number("x", st.speed, 0.1, 5, 0.1))),
      field(`${P}.Intensity`, s("intensity", number("x", st.intensity, 0, 1, 0.05)))
    )}
    ${row(
      field(`${P}.Sound`, s("sound", file("x", st.sound, "audio")).replace(/data-pick="x"/, `data-pick-step="${i}"`)),
      field(`${P}.SoundWho`, s("soundWho", select("x", SOUND_WHO, st.soundWho, `${P}.SoundWho_`))),
      field(`${P}.Volume`, s("volume", number("x", st.volume, 0, 1, 0.05)))
    )}
  </div>`;
}

/**
 * HTML de l'éditeur d'une barre.
 * @param {object} bar
 * @param {object} o  { tab, keys: [{value,label}] }
 */
export function barEditorHTML(bar, o = {}) {
  const b = cleanBar(bar);
  const tab = EDITOR_TABS.includes(o.tab) ? o.tab : "value";
  const P = "SBE.Bars";
  const nav = EDITOR_TABS.map(t => `<a data-bar-tab="${t}" class="${t === tab ? "is-on" : ""}">${esc(L(`${P}.Tab.${t}`))}</a>`).join("");
  const keys = `<datalist id="sbe-bar-keys">${(o.keys ?? []).map(k => `<option value="${esc(k.value)}">${esc(k.label ?? "")}</option>`).join("")}</datalist>`;
  const pane = (t, html) => `<section class="sbe-bar-pane ${t === tab ? "is-on" : ""}" data-pane="${t}">${html}</section>`;
  const viewersGrid = (f, label) => `<div class="sbe-bar-field"><label>${esc(L(label))}</label><div class="sbe-bar-inline">${VIEWERS.map(v => check(`${f}.${v}`, b[f][v], `${P}.Viewer.${v}`)).join("")}</div></div>`;

  const value = [
    field(`${P}.Label`, text("label", b.label, L(`${P}.LabelPh`)), `${P}.LabelHint`),
    row(
      field(`${P}.Value`, text("value", b.value, L("SBE.Ph.BarValue"), "sbe-bar-keys"), `${P}.ValueHint`),
      field(`${P}.Max`, text("max", b.max, L(`${P}.Auto`), "sbe-bar-keys"), `${P}.MaxHint`),
      field(`${P}.Min`, text("min", b.min, L(`${P}.Auto`), "sbe-bar-keys"))
    ),
    row(field(`${P}.HudEdit`, select("hudEdit", HUD_EDIT, b.hudEdit, `${P}.HudEdit_`)), `<div class="sbe-bar-field sbe-bar-field--check">${check("invert", b.invert, `${P}.Invert`)}</div>`),
    `<p class="notes">${esc(L(`${P}.InvertHint`))}</p>`,
    `<p class="notes">${esc(L(`${P}.HudEditHint`))}</p>`,
    b.hudEdit !== "none" ? row(
      field(`${P}.HudPos`, select("hudPos", HUD_POS, b.hudPos, `${P}.HudPos_`)),
      field(`${P}.HudGap`, number("hudGap", b.hudGap, -40, 200), `${P}.HudGapHint`)
    ) : ""
  ].join("");

  const place = [
    row(
      field(`${P}.Side`, select("side", SIDES, b.side, `${P}.Side_`)),
      field(`${P}.Where`, `<select data-f="inside"><option value="1" ${b.inside ? "selected" : ""}>${esc(L(`${P}.Inside`))}</option><option value="0" ${b.inside ? "" : "selected"}>${esc(L(`${P}.Outside`))}</option></select>`),
      field(`${P}.Row`, number("row", b.row, 0, 9), `${P}.RowHint`),
      field(`${P}.Offset`, number("offset", b.offset, -200, 200), `${P}.OffsetHint`)
    ),
    row(
      field(`${P}.IndentStart`, number("indentStart", b.indentStart, 0, 45)),
      field(`${P}.IndentEnd`, number("indentEnd", b.indentEnd, 0, 45)),
      field(`${P}.Height`, number("height", b.height, 2, 40))
    ),
    check("reverse", b.reverse, `${P}.Reverse`)
  ].join("");

  const look = [
    row(
      field(`${P}.Shape`, select("shape", SHAPES, b.shape, `${P}.Shape_`)),
      b.shape === "segments" ? field(`${P}.Segments`, number("segments", b.segments, 2, 30)) : "",
      field(`${P}.Opacity`, number("opacity", b.opacity, 0.05, 1, 0.05)),
      field(`${P}.FillAlpha`, number("fillAlpha", b.fillAlpha, 0.05, 1, 0.05))
    ),
    row(
      field(`${P}.ColorMode`, select("colorMode", COLOR_MODES, b.colorMode, `${P}.ColorMode_`)),
      field(`${P}.ColorFull`, color("colorFull", b.colorFull)),
      b.colorMode === "solid" ? "" : field(`${P}.ColorEmpty`, color("colorEmpty", b.colorEmpty))
    ),
    row(
      field(`${P}.BgColor`, color("bgColor", b.bgColor)),
      field(`${P}.BgAlpha`, number("bgAlpha", b.bgAlpha, 0, 1, 0.05)),
      `<div class="sbe-bar-field sbe-bar-field--check">${check("hideBg", b.hideBg, `${P}.HideBg`)}</div>`
    ),
    `<fieldset><legend>${esc(L(`${P}.Outline`))}</legend>
      ${row(
        field(`${P}.BorderStyle`, select("borderStyle", BORDER_STYLES, b.borderStyle, `${P}.BorderStyle_`)),
        field(`${P}.BorderColor`, color("borderColor", b.borderColor)),
        field(`${P}.BorderWidth`, number("borderWidth", b.borderWidth, 0, 6, 0.5))
      )}
      ${row(
        field(`${P}.Shadow`, select("shadow", SHADOWS, b.shadow, `${P}.Shadow_`)),
        field(`${P}.ShadowColor`, color("shadowColor", b.shadowColor)),
        field(`${P}.Relief`, select("relief", RELIEFS, b.relief, `${P}.Relief_`))
      )}
    </fieldset>`,
    `<fieldset><legend>${esc(L(`${P}.Images`))}</legend>
      <p class="notes">${esc(L(`${P}.ImagesHint`))}</p>
      ${row(field(`${P}.FgImage`, file("fgImage", b.fgImage, "image")), field(`${P}.BgImage`, file("bgImage", b.bgImage, "image")))}
      ${field(`${P}.MaskImage`, file("maskImage", b.maskImage, "image"), `${P}.MaskImageHint`)}
      ${field(`${P}.FrameImage`, file("frameImage", b.frameImage, "image"), `${P}.FrameImageHint`)}
      ${b.frameImage ? row(
        field(`${P}.FrameSlice`, number("frameSlice", b.frameSlice, 0, 200), `${P}.FrameSliceHint`),
        field(`${P}.FrameOut`, number("frameOut", b.frameOut, 0, 40))
      ) + row(
        field(`${P}.FrameSliceEnd`, number("frameSliceEnd", b.frameSliceEnd, 0, 200)),
        field(`${P}.FrameSliceV`, number("frameSliceV", b.frameSliceV, 0, 200)),
        field(`${P}.FrameOutStart`, number("frameOutStart", b.frameOutStart, -200, 200)),
        field(`${P}.FrameOutEnd`, number("frameOutEnd", b.frameOutEnd, -200, 200))
      ) : ""}
    </fieldset>`,
    `<fieldset><legend>${esc(L(`${P}.Motion`))}</legend>
      <div class="sbe-bar-inline">${check("smooth", b.smooth, `${P}.Smooth`)}${check("flash", b.flash, `${P}.Flash`)}</div>
      ${check("floatOn", b.floatOn, `${P}.FloatOn`)}
      ${b.flash || b.floatOn ? row(field(`${P}.FlashLoss`, color("flashLoss", b.flashLoss)), field(`${P}.FlashGain`, color("flashGain", b.flashGain)),
        b.floatOn ? field(`${P}.FloatSize`, number("floatSize", b.floatSize, 10, 72)) : "") : ""}
      ${b.floatOn ? `<div class="sbe-bar-field"><label>${esc(L(`${P}.FloatFor`))}</label><div class="sbe-bar-inline">${VIEWERS.map(v => check(`floatFor.${v}`, b.floatFor[v], `${P}.Viewer.${v}`)).join("")}</div></div>` : ""}
    </fieldset>`
  ].join("");

  const txt = [
    row(
      field(`${P}.Text`, select("text", TEXT_MODES, b.text, `${P}.Text_`)),
      field(`${P}.TextPos`, select("textPos", TEXT_POS, b.textPos, `${P}.TextPos_`)),
      field(`${P}.Prefix`, text("prefix", b.prefix))
    ),
    row(field(`${P}.TextSize`, number("textSize", b.textSize, 0, 48), `${P}.TextSizeHint`), field(`${P}.TextColor`, color("textColor", b.textColor)), `<div class="sbe-bar-field sbe-bar-field--check">${check("textStepColor", b.textStepColor, `${P}.TextStepColor`)}</div>`),
    viewersGrid("numbersFor", `${P}.NumbersFor`),
    viewersGrid("termFor", `${P}.TermFor`),
    `<p class="notes">${esc(L(`${P}.TermForHint`))}</p>`,
    field(`${P}.Approx`, number("approx", b.approx, 0, 20), `${P}.ApproxHint`)
  ].join("");

  const vis = [
    row(...VIEWERS.map(v => field(`${P}.VisFor.${v}`, select(`vis.${v}`, VIS_MODES, b.vis[v], `${P}.Vis_`)))),
    `<div class="sbe-bar-field"><label>${esc(L(`${P}.HideIf`))}</label><div class="sbe-bar-inline">${["full", "empty", "combat", "noCombat"].map(k => check(`hideIf.${k}`, b.hideIf[k], `${P}.HideIf_${k}`)).join("")}</div></div>`,
    field(`${P}.VisibleIf`, text("visibleIf", b.visibleIf, L("SBE.Ph.BarVisible"), "sbe-bar-keys"), `${P}.VisibleIfHint`)
  ].join("");

  const steps = `<p class="notes">${esc(L(`${P}.StepsHint`))}</p>
    <div class="sbe-bar-steps">${b.steps.map((st, i) => stepHTML(st, i, b.steps.length)).join("") || `<p class="sbe-bar-empty">${esc(L(`${P}.StepsEmpty`))}</p>`}</div>
    <button type="button" data-act="stepAdd"><i class="fa-solid fa-plus"></i> ${esc(L(`${P}.StepAdd`))}</button>`;

  const preview = `<div class="sbe-bar-preview">
      <div class="sbe-bar-preview-stage"></div>
      <div class="sbe-bar-preview-tools">
        <label>${esc(L(`${P}.PreviewValue`))} <input type="range" class="sbe-bar-pv-pct" min="0" max="100" step="1" value="${Math.round(PREVIEW.pct * 100)}"><b class="sbe-bar-pv-out">${Math.round(PREVIEW.pct * 100)} %</b></label>
        <label>${esc(L(`${P}.PreviewAs`))} <select class="sbe-bar-pv-viewer">${VIEWERS.map(v => `<option value="${v}" ${v === PREVIEW.viewer ? "selected" : ""}>${esc(L(`${P}.Viewer.${v}`))}</option>`).join("")}</select></label>
        <button type="button" class="sbe-bar-pv-hit" data-tooltip-text="${esc(L(`${P}.PreviewHit`))}"><i class="fa-solid fa-burst"></i></button>
        <button type="button" class="sbe-bar-pv-heal" data-tooltip-text="${esc(L(`${P}.PreviewHeal`))}"><i class="fa-solid fa-heart-pulse"></i></button>
      </div>
    </div>`;
  return `<div class="sbe-bar-ed" data-bar-id="${esc(b.id)}">
    ${keys}
    ${preview}
    <nav class="sbe-bar-tabs">${nav}</nav>
    ${pane("value", value)}${pane("place", place)}${pane("look", look)}${pane("text", txt)}${pane("vis", vis)}${pane("steps", steps)}
  </div>`;
}

/** Relit l'éditeur (même forme que `cleanBar`). */
export function readBarEditor(root, base = {}) {
  const ed = root?.querySelector?.(".sbe-bar-ed") ?? root;
  const out = foundry.utils.deepClone(base);
  for (const el of ed.querySelectorAll("[data-f]")) {
    const f = el.dataset.f;
    let v;
    if (el.type === "checkbox") v = el.checked;
    else if (el.type === "number") v = el.value === "" ? undefined : Number(el.value);
    else if (f === "inside") v = el.value === "1";
    else v = el.value;
    if (v !== undefined) foundry.utils.setProperty(out, f, v);
  }
  out.steps = [...ed.querySelectorAll(".sbe-bar-step")].map(rowEl => {
    const st = {};
    for (const el of rowEl.querySelectorAll("[data-sf]")) {
      const f = el.dataset.sf;
      const val = el.type === "checkbox" ? el.checked : (el.type === "number" ? Number(el.value) : el.value);
      if (f.includes(".")) foundry.utils.setProperty(st, f, val); else st[f] = val;
    }
    if (!st.colorOn) st.color = "";
    if (!st.glowOn) st.glowColor = "";
    if (!st.haloOn) st.haloColor = "";
    delete st.colorOn; delete st.glowOn; delete st.haloOn;
    return cleanStep(st);
  });
  out.id = ed.dataset.barId || out.id;
  return cleanBar(out);
}

/** Onglet actif de l'éditeur. */
export function editorTabOf(root) {
  return root?.querySelector?.(".sbe-bar-tabs .is-on")?.dataset.barTab ?? "value";
}

/**
 * Branche l'éditeur : onglets (sans rendu), sélecteurs de fichiers,
 * paliers. `onChange(bar, {rerender})` reçoit la barre relue.
 */
export function wireBarEditor(root, getBase, onChange, o = {}) {
  const ed = root?.querySelector?.(".sbe-bar-ed");
  if (!ed) return;
  for (const a of ed.querySelectorAll("[data-bar-tab]")) {
    a.addEventListener("click", () => {
      ed.querySelectorAll("[data-bar-tab]").forEach(x => x.classList.toggle("is-on", x === a));
      ed.querySelectorAll("[data-pane]").forEach(p => p.classList.toggle("is-on", p.dataset.pane === a.dataset.barTab));
    });
  }
  const read = () => readBarEditor(ed, getBase());
  /* Les choix qui changent la forme de l'éditeur le redessinent. */
  const reshape = new Set(["shape", "colorMode", "flash", "floatOn", "hudEdit", "frameImage"]);
  /* Aperçu vivant : suit chaque réglage, même pendant la saisie. */
  const stage = ed.querySelector(".sbe-bar-preview-stage");
  const pv = stage ? createBarPreview(stage, read(), { pct: PREVIEW.pct, viewer: PREVIEW.viewer, img: o.img }) : null;
  const pctIn = ed.querySelector(".sbe-bar-pv-pct"), pctOut = ed.querySelector(".sbe-bar-pv-out");
  const setPct = (p) => {
    PREVIEW.pct = Math.max(0, Math.min(1, p));
    if (pctIn) pctIn.value = String(Math.round(PREVIEW.pct * 100));
    if (pctOut) pctOut.textContent = `${Math.round(PREVIEW.pct * 100)} %`;
    pv?.setPct(PREVIEW.pct);
  };
  pctIn?.addEventListener("input", () => setPct(Number(pctIn.value) / 100));
  ed.querySelector(".sbe-bar-pv-viewer")?.addEventListener("change", (ev) => { PREVIEW.viewer = ev.target.value; pv?.setViewer(PREVIEW.viewer); });
  ed.querySelector(".sbe-bar-pv-hit")?.addEventListener("click", () => setPct(PREVIEW.pct - 0.15));
  ed.querySelector(".sbe-bar-pv-heal")?.addEventListener("click", () => setPct(PREVIEW.pct + 0.15));
  const inPreview = (t) => !!t?.closest?.(".sbe-bar-preview");
  ed.addEventListener("input", (ev) => { if (!inPreview(ev.target)) pv?.update(read()); });
  ed.addEventListener("change", (ev) => {
    const t = ev.target;
    if (inPreview(t)) return;
    const re = reshape.has(t?.dataset?.f) || ["when", "haloLikeBar"].includes(t?.dataset?.sf);
    const bar = read();
    pv?.update(bar);
    onChange(bar, { rerender: re });
  });
  ed.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-act]");
    if (!btn || !ed.contains(btn)) return;
    const act = btn.dataset.act;
    const bar = read();
    const i = Number(btn.dataset.step);
    if (act === "stepAdd") { bar.steps.push(cleanStep({ when: "pct", op: "<=", amount: 25 })); onChange(bar, { rerender: true }); }
    else if (act === "stepDel") { bar.steps.splice(i, 1); onChange(bar, { rerender: true }); }
    else if (act === "stepUp" && i > 0) { [bar.steps[i - 1], bar.steps[i]] = [bar.steps[i], bar.steps[i - 1]]; onChange(bar, { rerender: true }); }
    else if (act === "stepDown" && i < bar.steps.length - 1) { [bar.steps[i + 1], bar.steps[i]] = [bar.steps[i], bar.steps[i + 1]]; onChange(bar, { rerender: true }); }
    else if (act === "pick") {
      const input = btn.parentElement.querySelector("input");
      const FP = foundry.applications.apps.FilePicker.implementation;
      new FP({ type: btn.dataset.type || "image", current: input?.value || "",
        callback: (path) => { if (input) { input.value = path; const b = read(); pv?.update(b); onChange(b, { rerender: input.dataset.f === "frameImage" }); } } }).render(true);
    }
  });
}
