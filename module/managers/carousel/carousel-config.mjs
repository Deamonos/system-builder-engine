/**
 * SBE — Manager « Carrousel de combat » (MJ, paramètres du système)
 *
 * Onglet « Affichage » : affiché ou non, position par défaut, taille,
 * forme et image des portraits, nom et initiative ; mise en avant (halo
 * et taille de l'actif, « Suivant », ceux qui ont joué, icône des
 * vaincus, nom de l'actif dans la pastille du round).
 * Onglet « Boutons » : ceux du MJ (combat et tours, initiative) et ceux
 * des joueurs (finir son tour, lancer son initiative).
 * Onglet « Barres et effets » : 2 barres sur des clés ou formules, les
 * icônes des effets actifs, chacun avec qui peut les voir.
 * Onglet « Info-bulle » : clés montrées, effets et descriptions.
 * Onglet « Clics » : centrer, surligner le jeton, ouvrir la fiche.
 * Onglet « Thème » : celui de SBE, ou un thème propre (couleurs sombres et
 * claires, arrondi, cadres), aperçu en direct, export / import JSON.
 * Onglet « Visibilité » : vaincus, PNJ jusqu'à leur 1er tour, initiative
 * des PNJ, règles (formule ou effet → masquer, vaincu, retirer).
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import {
  CAROUSEL_SETTING, CAROUSEL_POS, TOP_ALIGN, PORTRAIT_SHAPES, PORTRAIT_IMG, ANIM_MODES, VIS, CLICK_WHO, BARS_MAX, DEFEATED_MODES, RULE_WHEN, RULE_ACTIONS, SIZE_MIN, SIZE_MAX, BAR_TEXT, SCALE_MIN, SCALE_MAX,
  carouselSettings, cleanCarousel
} from "./carousel-model.mjs";
import { CarouselManager } from "./carousel-manager.mjs";
import { buildKeyRefOptions } from "../../helpers/key-refs.mjs";
import { pickIcon } from "../../helpers/icon-picker.mjs";
import { THEME_TOKENS, THEME_MODES, SVG_SLOTS, sbeColors, cleanTheme, applyCarouselTheme, carouselCssOk } from "./carousel-theme.mjs";

const { ApplicationV2 } = foundry.applications.api;
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const opt = (v, cur, label) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(label)}</option>`;

export class SBECarouselConfig extends ApplicationV2 {

  static DEFAULT_OPTIONS = {
    id: "sbe-carousel-config",
    tag: "div",
    classes: ["sbe-carousel-config"],
    window: { title: "SBE.Carousel.ConfigTitle", icon: "fa-solid fa-film", resizable: true },
    position: { width: 520, height: 600 }
  };

  tab = "display";
  /** Section « Avancé » du thème dépliée. */
  _advOpen = false;
  /** Copie de travail (enregistrée avec « Enregistrer »). */
  _cfg = null;

  async _renderHTML() {
    this._cfg ??= carouselSettings();
    const tabs = [["display", "fa-display", "SBE.Carousel.TabDisplay"], ["bars", "fa-bars-progress", "SBE.Carousel.TabBars"],
      ["tooltip", "fa-comment-dots", "SBE.Carousel.TabTooltip"], ["clicks", "fa-arrow-pointer", "SBE.Carousel.TabClicks"], ["shown", "fa-eye-slash", "SBE.Carousel.TabShown"], ["theme", "fa-palette", "SBE.Carousel.TabTheme"],
      ["buttons", "fa-hand-pointer", "SBE.Carousel.TabButtons"]];
    const nav = `<nav class="sbe-mc-tabs">${tabs.map(([t, i, k]) => `<button type="button" data-tab="${t}" class="${this.tab === t ? "on" : ""}"><i class="fa-solid ${i}"></i> ${esc(L(k))}</button>`).join("")}</nav>`;
    const body = { buttons: () => this.#buttonsHTML(), bars: () => this.#barsHTML(), tooltip: () => this.#tooltipHTML(), clicks: () => this.#clicksHTML(), shown: () => this.#shownHTML(), theme: () => this.#themeHTML() }[this.tab]?.() ?? this.#displayHTML();
    return `${nav}<div class="sbe-mc-body">${body}</div>
      <footer class="sbe-mc-foot"><button type="button" data-act="save"><i class="fa-solid fa-floppy-disk"></i> ${esc(L("SBE.Common.Save"))}</button></footer>`;
  }

  #f(label, html, hint = "") {
    return `<div class="sbe-mc-f"><span>${esc(L(label))}</span>${html}${hint ? `<p class="notes">${esc(L(hint))}</p>` : ""}</div>`;
  }

  #check(name, on, label) {
    return `<label class="sbe-ma-check"><input type="checkbox" data-k="${name}" ${on ? "checked" : ""}> ${esc(L(label))}</label>`;
  }

  #displayHTML() {
    const c = this._cfg;
    return `<section class="sbe-mc-sec">
        <p class="notes">${esc(L("SBE.Carousel.EnabledWhere"))}</p>
        ${this.#f("SBE.Carousel.Pos", `<select data-k="pos">${CAROUSEL_POS.map(p => opt(p, c.pos, L(`SBE.Carousel.Pos_${p}`))).join("")}</select>`, "SBE.Carousel.PosHint")}
        ${this.#f("SBE.Carousel.Align", `<select data-k="align">${TOP_ALIGN.map(p => opt(p, c.align, L(`SBE.Carousel.Align_${p}`))).join("")}</select>`, "SBE.Carousel.AlignHint")}
      </section>
      <section class="sbe-mc-sec"><h3>${esc(L("SBE.Carousel.SecPortraits"))}</h3>
        <div class="sbe-ma-row">
          ${this.#f("SBE.Carousel.Size", `<input type="number" data-k="size" min="${SIZE_MIN}" max="${SIZE_MAX}" step="5" value="${c.size}">`)}
          ${this.#f("SBE.Carousel.Shape", `<select data-k="shape">${PORTRAIT_SHAPES.map(p => opt(p, c.shape, L(`SBE.Carousel.Shape_${p}`))).join("")}</select>`)}
          ${this.#f("SBE.Carousel.Img", `<select data-k="img">${PORTRAIT_IMG.map(p => opt(p, c.img, L(`SBE.Carousel.Img_${p}`))).join("")}</select>`)}
        </div>
        ${this.#check("show.name", c.show.name, "SBE.Carousel.ShowName")}
        ${this.#check("show.init", c.show.init, "SBE.Carousel.ShowInit")}
        ${this.#f("SBE.Carousel.Anim", `<select data-k="anim">${ANIM_MODES.map(p => opt(p, c.anim, L(`SBE.Carousel.Anim_${p}`))).join("")}</select>`, "SBE.Carousel.AnimHint")}
      </section>
      <section class="sbe-mc-sec"><h3>${esc(L("SBE.Carousel.SecMarks"))}</h3>
        ${this.#check("active.glow", c.active.glow, "SBE.Carousel.ActiveGlow")}
        ${this.#f("SBE.Carousel.ActiveScale", `<input type="number" data-k="active.scale" min="${SCALE_MIN}" max="${SCALE_MAX}" step="5" value="${c.active.scale}">`, "SBE.Carousel.ActiveScaleHint")}
        ${this.#check("marks.next", c.marks.next, "SBE.Carousel.MarkNext")}
        ${this.#check("marks.played", c.marks.played, "SBE.Carousel.MarkPlayed")}
        ${this.#check("shown.roundName", c.shown.roundName, "SBE.Carousel.RoundName")}
        ${this.#f("SBE.Carousel.DefeatIcon", `<div class="sbe-ma-row">
            <span class="sbe-car-cfg-ico">${c.marks.defeatIcon ? (c.marks.defeatIcon.includes("fa-") ? `<i class="${esc(c.marks.defeatIcon)}"></i>` : esc(c.marks.defeatIcon)) : "—"}</span>
            <input type="hidden" data-k="marks.defeatIcon" value="${esc(c.marks.defeatIcon)}">
            <button type="button" data-act="pickDefeat"><i class="fa-solid fa-icons"></i> ${esc(L("SBE.Carousel.PickIcon"))}</button>
            <button type="button" data-act="noDefeat"><i class="fa-solid fa-ban"></i> ${esc(L("SBE.Carousel.NoIcon"))}</button>
          </div>`, "SBE.Carousel.DefeatIconHint")}
      </section>`;
  }

  #vis(name, cur) {
    return `<select data-k="${name}">${VIS.map(v => opt(v, cur, L(`SBE.Carousel.Vis_${v}`))).join("")}</select>`;
  }

  #barsHTML() {
    const c = this._cfg;
    const rows = c.bars.map((b, i) => `
      <div class="sbe-car-cfg-row">
        ${this.#f("SBE.Carousel.BarLabel", `<input type="text" data-k="bars.${i}.label" value="${esc(b.label)}">`)}
        ${this.#f("SBE.Carousel.BarValue", `<input type="text" data-k="bars.${i}.value" value="${esc(b.value)}" list="sbe-car-keys">`)}
        ${this.#f("SBE.Carousel.BarMax", `<input type="text" data-k="bars.${i}.max" value="${esc(b.max)}" list="sbe-car-keys" placeholder="${esc(L("SBE.Carousel.BarMaxAuto"))}">`)}
        ${this.#f("SBE.Carousel.BarColor", `<input type="color" data-k="bars.${i}.color" value="${esc(b.color)}">`)}
        ${this.#f("SBE.Carousel.Who", this.#vis(`bars.${i}.vis`, b.vis))}
        ${this.#f("SBE.Carousel.BarText", `<select data-k="bars.${i}.text">${BAR_TEXT.map(v => opt(v, b.text, L(`SBE.Carousel.BarText_${v}`))).join("")}</select>`)}
        <button type="button" class="sbe-car-cfg-del" data-act="delBar" data-i="${i}" data-tooltip-text="${esc(L("SBE.Carousel.Delete"))}"><i class="fa-solid fa-trash"></i></button>
      </div>`).join("");
    const keys = `<datalist id="sbe-car-keys">${buildKeyRefOptions("actor").replace(/<option value="" [^>]*>[^<]*<\/option>/, "")}</datalist>`;
    return `<section class="sbe-mc-sec"><h3>${esc(L("SBE.Carousel.SecBars"))}</h3>
        <p class="notes">${esc(L("SBE.Carousel.BarsHint"))}</p>
        ${rows || `<p class="notes">${esc(L("SBE.Carousel.NoBars"))}</p>`}
        ${c.bars.length < BARS_MAX ? `<button type="button" data-act="addBar"><i class="fa-solid fa-plus"></i> ${esc(L("SBE.Carousel.AddBar"))}</button>` : ""}
        ${keys}
      </section>
      <section class="sbe-mc-sec"><h3>${esc(L("SBE.Carousel.SecEffects"))}</h3>
        ${this.#check("effects.on", c.effects.on, "SBE.Carousel.EffectsOn")}
        <div class="sbe-ma-row">
          ${this.#f("SBE.Carousel.EffectsMax", `<input type="number" data-k="effects.max" min="1" max="12" step="1" value="${c.effects.max}">`)}
          ${this.#f("SBE.Carousel.Who", this.#vis("effects.vis", c.effects.vis))}
        </div>
      </section>`;
  }

  #tooltipHTML() {
    const t = this._cfg.tooltip;
    const rows = t.keys.map((k, i) => `
      <div class="sbe-car-cfg-row">
        ${this.#f("SBE.Carousel.TipKey", `<select data-k="tooltip.keys.${i}.key">${buildKeyRefOptions("actor", k.key)}</select>`)}
        ${this.#f("SBE.Carousel.TipLabel", `<input type="text" data-k="tooltip.keys.${i}.label" value="${esc(k.label)}">`)}
        <button type="button" class="sbe-car-cfg-del" data-act="delKey" data-i="${i}" data-tooltip-text="${esc(L("SBE.Carousel.Delete"))}"><i class="fa-solid fa-trash"></i></button>
      </div>`).join("");
    return `<section class="sbe-mc-sec">
        ${this.#check("tooltip.on", t.on, "SBE.Carousel.TipOn")}
        ${this.#f("SBE.Carousel.Who", this.#vis("tooltip.vis", t.vis), "SBE.Carousel.TipWhoHint")}
        ${this.#check("tooltip.header", t.header, "SBE.Carousel.TipHeader")}
        ${this.#check("tooltip.meters", t.meters, "SBE.Carousel.TipMeters")}
      </section>
      <section class="sbe-mc-sec"><h3>${esc(L("SBE.Carousel.SecTipKeys"))}</h3>
        ${rows || `<p class="notes">${esc(L("SBE.Carousel.NoTipKeys"))}</p>`}
        <button type="button" data-act="addKey"><i class="fa-solid fa-plus"></i> ${esc(L("SBE.Carousel.AddTipKey"))}</button>
      </section>
      <section class="sbe-mc-sec"><h3>${esc(L("SBE.Carousel.SecEffects"))}</h3>
        ${this.#check("tooltip.effects", t.effects, "SBE.Carousel.TipEffects")}
        ${this.#check("tooltip.durations", t.durations, "SBE.Carousel.TipDurations")}
        ${this.#check("tooltip.desc", t.desc, "SBE.Carousel.TipDesc")}
      </section>`;
  }

  #clicksHTML() {
    const k = this._cfg.clicks;
    const who = (name, cur) => `<select data-k="${name}">${CLICK_WHO.map(v => opt(v, cur, L(`SBE.Carousel.Click_${v}`))).join("")}</select>`;
    return `<section class="sbe-mc-sec">
        ${this.#f("SBE.Carousel.ClickPan", who("clicks.pan", k.pan), "SBE.Carousel.ClickPanHint")}
        ${this.#f("SBE.Carousel.ClickHover", who("clicks.hover", k.hover), "SBE.Carousel.ClickHoverHint")}
        ${this.#check("clicks.sheet", k.sheet, "SBE.Carousel.ClickSheet")}
        <p class="notes">${esc(L("SBE.Carousel.ClickMenuHint"))}</p>
      </section>`;
  }

  #shownHTML() {
    const c = this._cfg;
    const rows = c.rules.map((r, i) => `
      <div class="sbe-car-cfg-row" data-rule="${i}">
        ${this.#f("SBE.Carousel.RuleWhen", `<select data-k="rules.${i}.when">${RULE_WHEN.map(v => opt(v, r.when, L(`SBE.Carousel.RuleWhen_${v}`))).join("")}</select>`)}
        ${r.when === "effect"
          ? this.#f("SBE.Carousel.RuleEffect", `<input type="text" data-k="rules.${i}.effect" value="${esc(r.effect)}" placeholder="${esc(L("SBE.Carousel.RuleEffectPh"))}">`)
          : this.#f("SBE.Carousel.RuleFormula", `<input type="text" data-k="rules.${i}.formula" value="${esc(r.formula)}" list="sbe-car-keys" placeholder="${esc(L("SBE.Carousel.RuleFormulaPh"))}">`)}
        ${this.#f("SBE.Carousel.RuleAction", `<select data-k="rules.${i}.action">${RULE_ACTIONS.map(v => opt(v, r.action, L(`SBE.Carousel.RuleAction_${v}`))).join("")}</select>`)}
        <button type="button" class="sbe-car-cfg-del" data-act="delRule" data-i="${i}" data-tooltip-text="${esc(L("SBE.Carousel.Delete"))}"><i class="fa-solid fa-trash"></i></button>
      </div>`).join("");
    const keys = `<datalist id="sbe-car-keys">${buildKeyRefOptions("actor").replace(/<option value="" [^>]*>[^<]*<\/option>/, "")}</datalist>`;
    return `<section class="sbe-mc-sec">
        ${this.#f("SBE.Carousel.Defeated", `<select data-k="shown.defeated">${DEFEATED_MODES.map(v => opt(v, c.shown.defeated, L(`SBE.Carousel.Defeated_${v}`))).join("")}</select>`)}
        ${this.#check("shown.untilTurn", c.shown.untilTurn, "SBE.Carousel.UntilTurn")}
        ${this.#check("shown.npcInit", c.shown.npcInit, "SBE.Carousel.NpcInit")}
        <p class="notes">${esc(L("SBE.Carousel.ShownHint"))}</p>
      </section>
      <section class="sbe-mc-sec"><h3>${esc(L("SBE.Carousel.SecRules"))}</h3>
        <p class="notes">${esc(L("SBE.Carousel.RulesHint"))}</p>
        ${rows || `<p class="notes">${esc(L("SBE.Carousel.NoRules"))}</p>`}
        <button type="button" data-act="addRule"><i class="fa-solid fa-plus"></i> ${esc(L("SBE.Carousel.AddRule"))}</button>
        ${keys}
      </section>`;
  }

  #themeHTML() {
    const t = this._cfg.theme;
    const own = t.mode === "own";
    const rows = Object.keys(THEME_TOKENS).map(k => `
      <tr><td>${esc(L(`SBE.Carousel.Tok_${k}`))}</td>
        <td><input type="color" data-k="theme.dark.${k}" value="${esc(t.dark[k] || "#808080")}"></td>
        <td><input type="color" data-k="theme.light.${k}" value="${esc(t.light[k] || "#808080")}"></td></tr>`).join("");
    return `<section class="sbe-mc-sec">
        ${this.#f("SBE.Carousel.ThemeMode", `<select data-k="theme.mode">${THEME_MODES.map(v => opt(v, t.mode, L(`SBE.Carousel.ThemeMode_${v}`))).join("")}</select>`, "SBE.Carousel.ThemeHint")}
      </section>
      ${own ? `<section class="sbe-mc-sec">
        <div class="sbe-ma-row">
          ${this.#f("SBE.Carousel.ThemeRadius", `<input type="number" data-k="theme.radius" min="0" max="40" step="1" value="${t.radius}">`)}
          ${this.#f("SBE.Carousel.ThemeBorder", `<input type="number" data-k="theme.border" min="0" max="8" step="1" value="${t.border}">`)}
        </div>
        <table class="sbe-car-cfg-colors"><thead><tr><th></th><th>${esc(L("SBE.Carousel.ThemeDark"))}</th><th>${esc(L("SBE.Carousel.ThemeLight"))}</th></tr></thead><tbody>${rows}</tbody></table>
        <div class="sbe-ma-row">
          <button type="button" data-act="themeFromSbe"><i class="fa-solid fa-rotate-left"></i> ${esc(L("SBE.Carousel.ThemeFromSbe"))}</button>
          <button type="button" data-act="themeExport"><i class="fa-solid fa-file-export"></i> ${esc(L("SBE.Carousel.ThemeExport"))}</button>
          <button type="button" data-act="themeImport"><i class="fa-solid fa-file-import"></i> ${esc(L("SBE.Carousel.ThemeImport"))}</button>
        </div>
        <p class="notes">${esc(L("SBE.Carousel.ThemeLiveHint"))}</p>
      </section>
      ${this.#advHTML()}` : ""}`;
  }

  /** Thème avancé (repliable) : CSS libre, bibliothèque de SVG, emplacements. */
  #advHTML() {
    const a = this._cfg.theme.adv ?? { css: "", svgs: [], slots: {} };
    const svgs = a.svgs ?? [];
    const rows = svgs.map((x, i) => `
      <div class="sbe-car-cfg-row sbe-car-svgrow">
        ${this.#f("SBE.Carousel.AdvSvgName", `<input type="text" data-k="theme.adv.svgs.${i}.name" value="${esc(x.name)}" placeholder="cadre">`)}
        ${this.#f("SBE.Carousel.AdvSvgFile", `<div class="sbe-ma-row"><input type="text" data-k="theme.adv.svgs.${i}.file" value="${esc(x.file)}"><button type="button" data-act="svgFile" data-i="${i}" data-tooltip-text="${esc(L("SBE.Carousel.PickIcon"))}"><i class="fa-solid fa-file-image"></i></button></div>`)}
        <button type="button" class="sbe-car-cfg-del" data-act="delSvg" data-i="${i}" data-tooltip-text="${esc(L("SBE.Carousel.Delete"))}"><i class="fa-solid fa-trash"></i></button>
        ${this.#f("SBE.Carousel.AdvSvgCode", `<textarea rows="3" class="sbe-car-code" data-k="theme.adv.svgs.${i}.code" placeholder="<svg …>…</svg>">${esc(x.code)}</textarea>`)}
      </div>`).join("");
    const names = svgs.map(x => String(x.name ?? "").trim().toLowerCase()).filter(Boolean);
    const slot = (k) => this.#f(`SBE.Carousel.AdvSlot_${k}`, `<select data-k="theme.adv.slots.${k}">${opt("", a.slots?.[k] ?? "", L("SBE.Carousel.AdvNone"))}${names.map(n => opt(n, a.slots?.[k] ?? "", n)).join("")}</select>`);
    return `<details class="sbe-mc-sec sbe-car-adv"${this._advOpen ? " open" : ""}>
        <summary><h3>${esc(L("SBE.Carousel.SecAdv"))}</h3></summary>
        ${this.#f("SBE.Carousel.AdvCss", `<textarea rows="8" class="sbe-car-code" data-k="theme.adv.css" spellcheck="false">${esc(a.css)}</textarea>`, "SBE.Carousel.AdvCssHint")}
        <h4>${esc(L("SBE.Carousel.AdvSvgs"))}</h4>
        <p class="notes">${esc(L("SBE.Carousel.AdvSvgsHint"))}</p>
        ${rows}
        ${svgs.length < 30 ? `<button type="button" data-act="addSvg"><i class="fa-solid fa-plus"></i> ${esc(L("SBE.Carousel.AdvAddSvg"))}</button>` : ""}
        <h4>${esc(L("SBE.Carousel.AdvSlots"))}</h4>
        <div class="sbe-ma-row sbe-car-slots">${SVG_SLOTS.map(slot).join("")}</div>
      </details>`;
  }

  /** Les couleurs du thème SBE dans le thème propre (point de départ). */
  #fillFromSbe() {
    this._cfg.theme.dark = sbeColors("dark");
    this._cfg.theme.light = sbeColors("light");
  }

  async #exportTheme() {
    const data = { type: "sbe-carousel-theme", version: 1, theme: cleanTheme(this._cfg.theme) };
    foundry.utils.saveDataToFile(JSON.stringify(data, null, 2), "application/json", "sbe-carrousel-theme.json");
  }

  #importTheme() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const data = JSON.parse(await foundry.utils.readTextFromFile(file));
        if (data?.type !== "sbe-carousel-theme" || !data.theme) throw new Error("type");
        this._cfg.theme = { ...cleanTheme(data.theme), mode: "own" };
        applyCarouselTheme(this._cfg.theme);
        this.render();
        ui.notifications.info(L("SBE.Carousel.ThemeImported"));
      } catch (_e) { ui.notifications.error(L("SBE.Carousel.ThemeBadFile")); }
    });
    input.click();
  }

  #buttonsHTML() {
    const b = this._cfg.buttons;
    return `<section class="sbe-mc-sec"><h3>${esc(L("SBE.Carousel.SecGM"))}</h3>
        ${this.#check("buttons.gmCombat", b.gmCombat, "SBE.Carousel.BtnGmCombat")}
        ${this.#check("buttons.gmInit", b.gmInit, "SBE.Carousel.BtnGmInit")}
      </section>
      <section class="sbe-mc-sec"><h3>${esc(L("SBE.Carousel.SecPlayers"))}</h3>
        ${this.#check("buttons.playerEnd", b.playerEnd, "SBE.Carousel.BtnPlayerEnd")}
        ${this.#check("buttons.playerInit", b.playerInit, "SBE.Carousel.BtnPlayerInit")}
        <p class="notes">${esc(L("SBE.Carousel.BtnPlayerInitHint"))}</p>
      </section>`;
  }

  _replaceHTML(result, content) { content.innerHTML = result; }

  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    /* Une règle change de sorte (formule / effet) : son champ change. */
    this.element.addEventListener("change", (ev) => {
      if (ev.target.matches?.('[data-k="theme.mode"]')) {
        this.#read();
        /* Premier passage au thème propre : on part des couleurs SBE. */
        if (this._cfg.theme.mode === "own" && !Object.values(this._cfg.theme.dark).some(Boolean)) this.#fillFromSbe();
        applyCarouselTheme(this._cfg.theme);
        this.render();
        return;
      }
      if (!ev.target.matches?.('[data-k^="rules."][data-k$=".when"]')) return;
      this.#read();
      this.render();
    });
    /* La section « Avancé » du thème garde son état replié / déplié. */
    this.element.addEventListener("toggle", (ev) => {
      if (ev.target.matches?.(".sbe-car-adv")) this._advOpen = ev.target.open;
    }, true);
    /* Molette sur les onglets (fenêtre étroite) : ils défilent de côté. */
    this.element.addEventListener("wheel", (ev) => {
      const nav = ev.target.closest(".sbe-mc-tabs");
      if (!nav || nav.scrollWidth <= nav.clientWidth) return;
      ev.preventDefault();
      nav.scrollLeft += ev.deltaY || ev.deltaX;
    }, { passive: false });
    /* Aperçu en direct : le carrousel prend les couleurs pendant le réglage. */
    this.element.addEventListener("input", (ev) => {
      if (!ev.target.matches?.('[data-k^="theme."]')) return;
      this.#read();
      applyCarouselTheme(this._cfg.theme);
    });
    this.element.addEventListener("click", (ev) => {
      const tab = ev.target.closest("[data-tab]");
      if (tab) { this.#read(); this.tab = tab.dataset.tab; this.render(); return; }
      const act = ev.target.closest("[data-act]")?.dataset.act;
      const i = Number(ev.target.closest("[data-i]")?.dataset.i);
      if (act === "themeFromSbe") { this.#read(); this.#fillFromSbe(); applyCarouselTheme(this._cfg.theme); this.render(); return; }
      if (act === "themeExport") { this.#read(); this.#exportTheme(); return; }
      if (act === "themeImport") { this.#importTheme(); return; }
      if (act === "addSvg" || act === "delSvg") {
        this.#read();
        const adv = this._cfg.theme.adv ??= { css: "", svgs: [], slots: {} };
        adv.svgs = Object.values(adv.svgs ?? {});
        if (act === "addSvg") adv.svgs.push({ name: `svg-${adv.svgs.length + 1}`, code: "", file: "" });
        else adv.svgs.splice(i, 1);
        applyCarouselTheme(this._cfg.theme);
        this.render();
        return;
      }
      if (act === "svgFile") {
        this.#read();
        const x = this._cfg.theme.adv?.svgs?.[i];
        if (!x) return;
        const FP = foundry.applications.apps.FilePicker.implementation;
        new FP({ type: "image", current: x.file ?? "", callback: (path) => { x.file = path; applyCarouselTheme(this._cfg.theme); this.render(); } }).render(true);
        return;
      }
      if (act === "pickDefeat") { this.#read(); pickIcon().then(ic => { if (ic) { this._cfg.marks.defeatIcon = ic; this.render(); } }); return; }
      if (act === "noDefeat") { this.#read(); this._cfg.marks.defeatIcon = ""; this.render(); return; }
      if (["addBar", "delBar", "addKey", "delKey", "addRule", "delRule"].includes(act)) {
        this.#read();
        if (act === "addBar") this._cfg.bars.push({ label: "", value: "", max: "", color: this._cfg.bars.length ? "#2e86de" : "#c0392b", vis: "all", text: "hover" });
        if (act === "delBar") this._cfg.bars.splice(i, 1);
        if (act === "addKey") this._cfg.tooltip.keys.push({ key: "", label: "" });
        if (act === "delKey") this._cfg.tooltip.keys.splice(i, 1);
        if (act === "addRule") this._cfg.rules.push({ when: "formula", formula: "", effect: "", action: "hide" });
        if (act === "delRule") this._cfg.rules.splice(i, 1);
        this.render();
        return;
      }
      if (ev.target.closest('[data-act="save"]')) this.#save();
    });
  }

  /** Fermé sans enregistrer : l'aperçu du thème revient au thème enregistré. */
  async _onClose(options) {
    applyCarouselTheme(carouselSettings().theme);
    return super._onClose?.(options);
  }

  /** L'onglet affiché passe dans la copie de travail. */
  #read() {
    const next = foundry.utils.deepClone(this._cfg);
    for (const el of this.element.querySelectorAll("[data-k]")) {
      foundry.utils.setProperty(next, el.dataset.k, el.type === "checkbox" ? el.checked : el.value);
    }
    /* Pas de nettoyage ici : une ligne vide en cours de saisie doit rester. */
    this._cfg = next;
  }

  async #save() {
    this.#read();
    if (!carouselCssOk(this._cfg.theme?.adv?.css)) ui.notifications.warn(L("SBE.Carousel.AdvCssRefused"));
    this._cfg = cleanCarousel(this._cfg);
    await game.settings.set(SYSTEM_ID, CAROUSEL_SETTING, this._cfg);
    this.render();
    CarouselManager.refresh();
    ui.notifications.info(L("SBE.Carousel.Saved"));
  }
}
