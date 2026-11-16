/**
 * SBE — VISION THERMIQUE : les halos de chaleur
 *
 * Quand la vision qui compte pour le pion que l'on regarde à travers est
 * la vision thermique, chaque pion VISIBLE porte un halo de chaleur
 * (dégradé chaud → froid, flou, qui « respire »). L'environnement, lui,
 * est teinté par la couleur de la vision.
 *
 * Tout le monde est chaud, sauf un acteur qui porte un effet dont la
 * case « Masqué en vision thermique » est cochée (camouflage donné par un
 * objet ou le gestionnaire d'effets).
 * La force du halo est la même pour tous : elle ne trahit rien de l'état
 * de la cible.
 *
 * Chaque client dessine pour lui-même ; rien n'est écrit.
 */

import { activeEffectsOf } from "./vision-manager.mjs";
import { VisionModes } from "./vision-modes.mjs";
import { VisionScreen } from "./vision-screen.mjs";

const LOOK = {
  pulseSpeed: 0.04,   /* vitesse de respiration */
  pulseAmount: 0.12,  /* amplitude (±12 % d'échelle) */
  alpha: 0.85,        /* opacité du halo */
  haloScale: 1.7,     /* débordement au-delà du pion */
  blur: 8             /* flou du halo (px) */
};

export class ThermalView {

  static _bound = false;
  static _layer = null;
  static _tex = null;
  static _blur = null;
  static _sprites = [];
  static _active = false;
  static _phase = 0;
  static _ticker = null;
  static _timer = null;

  static init() {
    if (this._bound) return;
    this._bound = true;
    const later = () => this.queue();
    for (const h of ["controlToken", "updateToken", "updateActor", "createActiveEffect", "deleteActiveEffect",
      "updateActiveEffect", "sightRefresh", "createToken", "deleteToken", "createItem", "updateItem", "deleteItem",
      "sbeVisionModesChanged"]) Hooks.on(h, later);
    Hooks.on("canvasTearDown", () => this._reset());
    Hooks.on("canvasReady", () => {
      this._reset();
      this._ticker ??= () => this._animate();
      try { canvas.app.ticker.remove(this._ticker); canvas.app.ticker.add(this._ticker); } catch (_e) { /* */ }
      this.refresh();
    });
  }

  /** Un acteur échappe-t-il à la vision thermique ? */
  static isHidden(actor) {
    if (!actor) return true;
    return activeEffectsOf(actor).some(x => x.def.look.thermalMask);
  }

  /** Les pions à travers lesquels CE client regarde. */
  static _viewers() {
    const ctl = canvas?.tokens?.controlled ?? [];
    if (ctl.length) return ctl;
    if (game.user.isGM) return [];
    return game.user.character?.getActiveTokens?.() ?? [];
  }

  /** Le mode de vision (de la bibliothèque) du pion qui regarde, ou null. */
  static _viewMode() {
    for (const t of this._viewers()) {
      const m = VisionModes.get(t.document?.sight?.visionMode);
      if (m) return m;
    }
    return null;
  }

  static _thermalOn() {
    return this._viewers().some(t => VisionModes.get(t.document?.sight?.visionMode)?.render.heat);
  }

  static queue() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.refresh(), 30);
  }

  static _reset() {
    try { this._layer?.destroy?.({ children: true }); } catch (_e) { /* */ }
    try { this._tex?.destroy?.(true); } catch (_e) { /* */ }
    try { this._blur?.destroy?.(); } catch (_e) { /* */ }
    this._layer = null; this._tex = null; this._blur = null;
    this._sprites = []; this._active = false;
  }

  /** Dégradé radial, fabriqué une fois et partagé par tous les halos. */
  static _texture() {
    if (this._tex && !this._tex.destroyed) return this._tex;
    const size = 256, r = size / 2;
    const cnv = document.createElement("canvas");
    cnv.width = cnv.height = size;
    const ctx = cnv.getContext("2d");
    const g = ctx.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0.00, "rgba(255,255,235,1.00)");
    g.addColorStop(0.18, "rgba(255,225,120,0.98)");
    g.addColorStop(0.42, "rgba(255,110,40,0.92)");
    g.addColorStop(0.70, "rgba(210,30,20,0.70)");
    g.addColorStop(0.88, "rgba(120,10,15,0.32)");
    g.addColorStop(1.00, "rgba(60,0,10,0.00)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    this._tex = PIXI.Texture.from(cnv);
    return this._tex;
  }

  static _ensureLayer() {
    if (this._layer && !this._layer.destroyed) return this._layer;
    if (!canvas?.interface) return null;
    const layer = new PIXI.Container();
    layer.eventMode = "none";
    layer.interactiveChildren = false;
    canvas.interface.addChild(layer);
    this._layer = layer;
    return layer;
  }

  static _clear() {
    if (this._layer && !this._layer.destroyed) {
      for (const c of this._layer.removeChildren()) c.destroy();
      this._layer.visible = false;
    }
    this._sprites = [];
  }

  static refresh() {
    /* Le grain d'image du mode suit le même déclencheur. */
    try { VisionScreen.update(canvas?.ready ? (this._viewMode()?.render.grain ?? 0) : 0); }
    catch (err) { console.warn("SBE | Vision : grain en échec", err); }
    try {
      if (!canvas?.ready || !this._thermalOn()) { this._active = false; this._clear(); return; }
      this._active = true;
      const layer = this._ensureLayer();
      if (!layer) return;
      this._clear();
      layer.visible = true;
      /* UN seul filtre de flou pour la session (pas de fuite GPU). */
      try {
        if (!this._blur || this._blur.destroyed) { this._blur = new PIXI.BlurFilter(); this._blur.quality = 2; }
        this._blur.blur = LOOK.blur;
        layer.filters = [this._blur];
      } catch (_e) { layer.filters = null; }
      const tex = this._texture();
      for (const tok of canvas.tokens.placeables) {
        if (!tok.actor || !tok.visible || tok.document.hidden) continue;
        if (this.isHidden(tok.actor)) continue;
        const sp = new PIXI.Sprite(tex);
        sp.anchor.set(0.5, 0.5);
        sp.position.set(tok.x + tok.w / 2, tok.y + tok.h / 2);
        sp.blendMode = PIXI.BLEND_MODES.ADD;
        const s = (Math.max(tok.w, tok.h) * LOOK.haloScale) / tex.width;
        sp.scale.set(s, s);
        sp._sbeScale = s;
        /* Le halo suit le pion à CHAQUE image (déplacement animé). */
        sp._sbeTok = tok;
        sp.alpha = LOOK.alpha;
        layer.addChild(sp);
        this._sprites.push(sp);
      }
    } catch (err) {
      console.warn("SBE | Vision thermique : dessin en échec", err);
    }
  }

  /** Respiration douce des halos, collés à leur pion image par image. */
  static _animate() {
    if (!this._active || !this._sprites.length) return;
    this._phase += LOOK.pulseSpeed;
    const w = Math.sin(this._phase) * LOOK.pulseAmount;
    for (const sp of this._sprites) {
      if (sp.destroyed) continue;
      const t = sp._sbeTok;
      if (t && !t.destroyed) {
        sp.position.set(t.x + t.w / 2, t.y + t.h / 2);
        sp.visible = !!t.visible;
      }
      const s = sp._sbeScale * (1 + w);
      sp.scale.set(s, s);
      sp.alpha = LOOK.alpha * (1 + w * 0.5);
    }
  }
}
