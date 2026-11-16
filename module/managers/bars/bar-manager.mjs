/**
 * SBE — BARRES DE JETONS : branchements
 *
 * - réglage du monde `tokenBars` (« Tous les personnages ») et menu ;
 * - classe de jeton SBE : ses barres remplacent (ou complètent) les
 *   barres natives, la visibilité suit le survol et la sélection ;
 * - ce qui redessine les barres : valeurs, effets, objets, combat,
 *   modèle, réglage, jeton ;
 * - champs du HUD du jeton pour les barres « modifiables dans le HUD » ;
 * - encart dans la configuration du jeton, bouton dans la fenêtre de
 *   surcharge des prototypes de Foundry ;
 * - Bar Brawl actif : les barres SBE se mettent en pause (jamais deux
 *   dessins des barres en même temps) et le MJ est prévenu.
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { allSet, resolveBars, anyBarsDefined, cleanAllSet, setBarsPreview } from "./bar-model.mjs";
import { registerPreview } from "../tours/tour-previews.mjs";
import { drawTokenBars, refreshBarsVisibility, resetBarsTicker, barValues, outsideExtents, placeNameplate } from "./bar-render.mjs";
import { SBETokenBarsApp, tokenBarsBoxHTML, wireTokenBarsBox, brawlActive } from "./bar-app.mjs";
import { docScope } from "../../builder/doc-context.mjs";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/** Menu des paramètres : ouvre la fenêtre (une seule à la fois). */
class SBETokenBarsMenu extends foundry.applications.api.ApplicationV2 {
  render() { SBETokenBarsApp.open("all"); return this; }
}

const recentSounds = new Map();

export class BarManager {

  static paused() { return brawlActive(); }

  static init() {
    game.settings.register(SYSTEM_ID, "tokenBars", {
      scope: "world", config: false, type: Object, default: cleanAllSet({}),
      onChange: () => this.refreshAll()
    });
    game.settings.registerMenu(SYSTEM_ID, "tokenBarsMenu", {
      name: "SBE.Bars.MenuName", label: "SBE.Bars.MenuLabel", hint: "SBE.Bars.MenuHint",
      icon: "fa-solid fa-bars-progress", type: SBETokenBarsMenu, restricted: true
    });

    const Base = CONFIG.Token.objectClass;
    const M = this;
    class SBEBarsToken extends Base {
      drawBars() {
        if (M.paused()) { this._sbeHideNative = false; return super.drawBars(); }
        let r = { count: 0, keepNative: true };
        try { r = drawTokenBars(this, { onStep: (t, bar, step) => M.#stepSound(t, bar, step) }); }
        catch (err) { console.warn("SBE | Barres de jetons : dessin en échec", err); }
        this._sbeHideNative = r.count > 0 && !r.keepNative;
        placeNameplate(this);
        if (this._sbeHideNative) { if (this.bars) this.bars.visible = false; return; }
        return super.drawBars();
      }
      _refreshSize() {
        super._refreshSize();
        if (!M.paused()) placeNameplate(this);
      }
      _refreshState() {
        super._refreshState();
        if (this._sbeHideNative && this.bars) this.bars.visible = false;
        try { refreshBarsVisibility(this); } catch (_e) { /* jeton en cours de dessin */ }
      }
    }
    CONFIG.Token.objectClass = SBEBarsToken;

    /* Ce qui change les valeurs (ou ce qu'on en voit). */
    Hooks.on("updateActor", (actor, changes) => { if (changes.system) this.refreshActor(actor); });
    for (const h of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect", "createItem", "updateItem", "deleteItem"]) {
      Hooks.on(h, (doc) => { const a = doc.parent?.documentName === "Actor" ? doc.parent : doc.parent?.parent; if (a?.documentName === "Actor") this.refreshActor(a); });
    }
    for (const h of ["createCombatant", "deleteCombatant"]) Hooks.on(h, (c) => { const t = c.token?.object; if (t) this.refreshToken(t); });
    Hooks.on("deleteCombat", () => this.refreshAll());
    Hooks.on("updateToken", (doc, changes) => {
      if (changes.flags?.[SYSTEM_ID] || "disposition" in changes || "width" in changes || "height" in changes) {
        if (doc.object) this.refreshToken(doc.object);
      }
    });
    /* Modèle de personnage changé (ses barres, ses champs). */
    Hooks.on("updateActor", (actor, changes) => {
      if (actor.type !== "template" || !changes.system) return;
      for (const t of canvas?.tokens?.placeables ?? []) if (t.actor?.system?.templateId === actor.id) this.refreshToken(t);
    });
    Hooks.on("canvasTearDown", () => resetBarsTicker());

    /* HUD du jeton : champs des barres modifiables. */
    Hooks.on("renderTokenHUD", (hud, html) => { try { this.#hud(hud, html); } catch (err) { console.warn("SBE | Barres de jetons : HUD en échec", err); } });

    /* Configuration du jeton et du prototype : encart « Barres SBE ». */
    Hooks.on("renderTokenApplication", (app, html) => { try { this.#tokenConfig(app, html); } catch (err) { console.warn("SBE | Barres de jetons : encart en échec", err); } });

    /* Fenêtre de surcharge des prototypes de Foundry : un accès direct. */
    Hooks.on("renderPrototypeOverridesConfig", (app, html) => {
      if (!game.user.isGM) return;
      const root = html instanceof HTMLElement ? html : html?.[0];
      const form = root?.querySelector?.(".window-content") ?? root;
      if (!form || form.querySelector(".sbe-bars-ovr")) return;
      form.insertAdjacentHTML("afterbegin", `<div class="sbe-bars-ovr"><button type="button"><i class="fa-solid fa-bars-progress"></i> ${esc(L("SBE.Bars.OpenManager"))}</button><p class="notes">${esc(L("SBE.Bars.OverridesHint"))}</p></div>`);
      form.querySelector(".sbe-bars-ovr button")?.addEventListener("click", () => SBETokenBarsApp.open("all"));
    });

    Hooks.once("ready", () => this.#brawlWarn());
    registerPreview("bars", { show: () => this.tourPreview(true), hide: () => this.tourPreview(false) });
  }

  /* ------------------------------------------------------------ */
  /*  Aperçu (visites guidées)                                     */
  /* ------------------------------------------------------------ */

  static #previewToken = null;
  static #previewView = null;   /* la vue du MJ avant l'aperçu, rendue ensuite */

  /** Le jeton qui montre l'aperçu (pour la visite), ou null. */
  static previewToken() { return this.#previewToken?.destroyed ? null : this.#previewToken; }

  /**
   * Deux barres d'exemple sur un jeton de personnage visible à l'écran
   * (sinon le premier de la scène, montré). Rien n'est enregistré.
   */
  static tourPreview(on) {
    const prev = this.previewToken();
    setBarsPreview(null);
    this.#previewToken = null;
    if (prev) this.refreshToken(prev);
    if (this.#previewView && canvas?.ready) canvas.pan(this.#previewView);
    this.#previewView = null;
    if (!on || !canvas?.ready || this.paused()) return;
    const tokens = (canvas.tokens?.placeables ?? []).filter(t => t.actor?.type === "personnage" && t.visible);
    const onScreen = (t) => {
      const p = canvas.clientCoordinatesFromCanvas(t.center);
      return p.x > 0 && p.y > 0 && p.x < window.innerWidth && p.y < window.innerHeight;
    };
    const token = tokens.find(onScreen) ?? tokens[0];
    if (!token) return;
    /* Le jeton au centre, assez grand pour lire ses barres ; la vue revient ensuite. */
    this.#previewView = { x: canvas.stage.pivot.x, y: canvas.stage.pivot.y, scale: canvas.stage.scale.x };
    canvas.pan({ x: token.center.x, y: token.center.y, scale: Math.max(canvas.stage.scale.x, 1) });
    const L = (k) => game.i18n.localize(`SBE.Tour.Sample.${k}`);
    setBarsPreview({ tokenId: token.document.id, bars: [
      { label: L("Gauge"), value: "18", max: "24", shape: "pill", height: 10, text: "fraction", relief: "gloss",
        vis: { gm: "always", owner: "always", others: "always" } },
      { label: L("Stat"), value: "5", max: "12", shape: "segments", segments: 6, height: 7, colorMode: "solid", colorFull: "#3b8fd9",
        vis: { gm: "always", owner: "always", others: "always" } }
    ] });
    this.#previewToken = token;
    this.refreshToken(token);
  }

  static refreshToken(t) {
    try { t.renderFlags?.set?.({ refreshBars: true, refreshState: true }); } catch (_e) { /* jeton détruit */ }
  }

  static refreshActor(actor) {
    for (const t of actor?.getActiveTokens?.() ?? []) this.refreshToken(t);
  }

  static refreshAll() {
    for (const t of canvas?.tokens?.placeables ?? []) this.refreshToken(t);
  }

  /* ------------------------------------------------------------ */

  static #stepSound(token, bar, step) {
    if (!step?.sound) return;
    if (step.soundWho === "owner" && !game.user.isGM && !token.isOwner) return;
    const k = `${token.actor?.id}|${bar.id}|${step.sound}`;
    const now = Date.now();
    if (now - (recentSounds.get(k) ?? 0) < 800) return;
    recentSounds.set(k, now);
    try { foundry.audio.AudioHelper.play({ src: step.sound, volume: step.volume, loop: false }, false); }
    catch (err) { console.warn("SBE | Barres de jetons : son en échec", err); }
  }

  static #hud(hud, html) {
    if (this.paused()) return;
    const token = hud.object;
    const actor = token?.actor;
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!actor || !root || !actor.isOwner) return;
    const can = (mode) => mode === "owner" || (mode === "gm" && game.user.isGM);
    const res = resolveBars(token.document, actor);
    let scope = {};
    try { scope = docScope(actor); } catch (_e) { scope = { ...(actor.system?.values ?? {}) }; }
    const groups = { below: [], above: [] };
    for (const { bar } of res.bars) {
      if (!can(bar.hudEdit)) continue;
      const vals = barValues(bar, actor, scope);
      if (!vals?.key) continue;
      groups[bar.hudPos].push({ bar, html: `<label class="sbe-bars-hudf"><span>${esc(bar.label || bar.value)}</span>
        <input type="text" data-sbe-bar-key="${esc(vals.key)}" value="${esc(vals.value)}" data-tooltip-text="${esc(L("SBE.Bars.HudInputHint"))}"></label>` });
    }
    if (!groups.below.length && !groups.above.length) return;
    const col = root.querySelector(".col.middle") ?? root;
    /* La colonne du milieu dépasse le jeton de 50 px en haut et en bas
       (place des champs natifs). Le bloc se pose APRÈS les barres SBE
       posées dehors de ce côté (et après le champ natif s'il est là),
       plus la distance choisie. Le HUD est à l'échelle de la scène :
       ses pixels sont des unités de scène. */
    const ext = outsideExtents(token);
    const BAND = 50;
    for (const pos of ["below", "above"]) {
      const list = groups[pos];
      if (!list.length) continue;
      const native = !!col.querySelector(`.attribute.${pos === "below" ? "bar1" : "bar2"} input`);
      const gap = Math.max(...list.map(x => x.bar.hudGap));
      const off = Math.max(pos === "below" ? ext.bottom : ext.top, native ? BAND : 0) + gap;
      const style = pos === "below" ? `top:calc(100% - ${BAND}px + ${off}px)` : `bottom:calc(100% - ${BAND}px + ${off}px)`;
      col.insertAdjacentHTML("beforeend", `<div class="sbe-bars-hud is-${pos}" style="${style}">${list.map(x => x.html).join("")}</div>`);
    }
    for (const inp of col.querySelectorAll("[data-sbe-bar-key]")) {
      const stop = (ev) => ev.stopPropagation();
      inp.addEventListener("keydown", (ev) => { ev.stopPropagation(); if (ev.key === "Enter") { ev.preventDefault(); inp.blur(); } });
      inp.addEventListener("pointerdown", stop);
      inp.addEventListener("focus", () => inp.select());
      inp.addEventListener("change", async (ev) => {
        ev.stopPropagation();
        const key = inp.dataset.sbeBarKey;
        const raw = String(inp.value ?? "").trim();
        const cur = Number(actor.system?.values?.[key]) || 0;
        let n;
        if (/^[+-]\s*\d/.test(raw)) n = cur + Number(raw.replace(/\s+/g, ""));
        else if (/^=/.test(raw)) n = Number(raw.slice(1));
        else n = Number(raw);
        if (!Number.isFinite(n)) { inp.value = String(cur); return; }
        await actor.update({ [`system.values.${key}`]: n });
      });
    }
  }

  static #tokenConfig(app, html) {
    /* Prototype : la fenêtre travaille sur une copie ; on écrit sur l'acteur. */
    const doc = app.isPrototype ? app.actor?.prototypeToken : (app.document ?? app.token);
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!doc || !root) return;
    const tab = root.querySelector('.tab[data-tab="resources"]');
    if (!tab) return;
    tab.querySelector(".sbe-bars-tokenbox")?.remove();
    const markup = tokenBarsBoxHTML(doc);
    if (!markup) return;
    tab.insertAdjacentHTML("beforeend", markup);
    const box = tab.querySelector(".sbe-bars-tokenbox");
    if (box) wireTokenBarsBox(box, doc);
  }

  static async #brawlWarn() {
    if (!game.user.isGM || !this.paused() || !anyBarsDefined()) return;
    const all = allSet();
    if (all.brawlIgnore) return;
    const choice = await foundry.applications.api.DialogV2.wait({
      window: { title: L("SBE.Bars.BrawlTitle"), icon: "fa-solid fa-triangle-exclamation" },
      content: `<p>${esc(L("SBE.Bars.BrawlWarn"))}</p>`,
      buttons: [
        { action: "modules", label: L("SBE.Bars.BrawlModules"), icon: "fa-solid fa-plug", default: true },
        { action: "ignore", label: L("SBE.Bars.BrawlIgnore"), icon: "fa-solid fa-bell-slash" }
      ],
      rejectClose: false
    }).catch(() => null);
    if (choice === "modules") {
      const MM = foundry.applications?.sidebar?.apps?.ModuleManagement;
      if (MM) new MM().render({ force: true });
    } else if (choice === "ignore") {
      await game.settings.set(SYSTEM_ID, "tokenBars", cleanAllSet({ ...all, brawlIgnore: true }));
    }
  }
}
