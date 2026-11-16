/**
 * SBE — LUMIÈRE PERSONNELLE (case « Personnelle » de la lumière d'un effet)
 *
 * Une lumière personnelle n'est vue QUE par celui qui regarde à travers
 * le pion (le MJ et les autres joueurs ne voient rien) : l'éclat de
 * lunettes de vision nocturne, une animation de balayage sur la vue…
 *
 * Principe : le rendu des lumières est propre à chaque client. On crée
 * une vraie source de lumière de Foundry, ajoutée sur CE client
 * seulement, jamais écrite dans le jeton : elle n'est donc partagée avec
 * personne, et toutes les animations / colorations marchent telles
 * quelles. Elle n'existe que si la vue du pion est active ici (c'est
 * bien ce client qui regarde à travers).
 *
 * Sources : les effets ET les objets allumés (onglet Lumière). Plusieurs
 * lumières personnelles : la plus forte gagne. Ses champs se lisent comme ceux de toute
 * lumière d'effet (nombre, formule, « @clé » de l'objet).
 */

import { activeEffectsOf } from "./vision-manager.mjs";
import { resolveLight, strongestLight } from "./effect-values.mjs";
import { ItemLight } from "./item-light.mjs";

const SUFFIX = "sbePersonalLight";

export class PersonalLight {

  static _bound = false;
  /** id du pion → source de lumière de CE client. */
  static _sources = new Map();

  static init() {
    if (this._bound) return;
    this._bound = true;
    const all = () => this.refreshAll();
    Hooks.on("sightRefresh", all);
    Hooks.on("controlToken", all);
    Hooks.on("canvasReady", all);
    Hooks.on("canvasTearDown", () => this.clearAll());
    for (const h of ["createActiveEffect", "deleteActiveEffect", "updateActiveEffect"]) {
      Hooks.on(h, (ae) => { if (ae.parent?.documentName === "Actor") this.refreshActor(ae.parent); });
    }
    /* Valeurs lues sur l'objet (« @clé ») ou la fiche : elles suivent. */
    Hooks.on("updateItem", (item) => { if (item.parent?.documentName === "Actor") this.refreshActor(item.parent); });
    Hooks.on("updateActor", (actor) => this.refreshActor(actor));
    /* Le pion bouge ou tourne : rendu local, collé au pion. */
    Hooks.on("refreshToken", (token, flags) => {
      if (!this._sources.has(token?.id)) return;
      if (flags && !flags.refreshPosition && !flags.refreshElevation && !flags.refreshRotation) return;
      this.refreshToken(token);
    });
  }

  /** La lumière personnelle la plus forte des effets actifs de l'acteur. */
  static lightOf(actor) {
    return strongestLight([...activeEffectsOf(actor)
      .filter(x => x.def.look.light.enabled && x.def.look.light.personal)
      .map(x => resolveLight(actor, x.def)), ...ItemLight.lightsOf(actor)]
      .filter(l => l?.personal));
  }

  static refreshAll() {
    if (!canvas?.ready) return;
    for (const t of canvas.tokens?.placeables ?? []) this.refreshToken(t);
    for (const id of [...this._sources.keys()]) if (!canvas.tokens?.get?.(id)) this.remove(id);
  }

  static refreshActor(actor) {
    if (!canvas?.ready) return;
    for (const t of actor?.getActiveTokens?.() ?? []) this.refreshToken(t);
  }

  static refreshToken(token) {
    if (!canvas?.ready || !token || token.destroyed) return;
    const light = token.vision?.active ? this.lightOf(token.actor) : null;
    if (!light) { this.remove(token.id); return; }
    try {
      let src = this._sources.get(token.id);
      if (!src) {
        const Cls = CONFIG.Canvas.lightSourceClass;
        src = new Cls({ sourceId: `${token.sourceId}.${SUFFIX}`, object: token });
        this._sources.set(token.id, src);
      }
      src.initialize(this._data(token, light));
      src.add();
      canvas.perception.update({ refreshLighting: true });
    } catch (err) {
      console.warn("SBE | Lumière personnelle en échec", err);
      this.remove(token.id);
    }
  }

  /** Données de la source, calquées sur celles d'un pion de Foundry. */
  static _data(token, l) {
    const doc = token.document;
    const o = doc.getLightOrigin?.() ?? { x: token.center?.x, y: token.center?.y, elevation: doc.elevation ?? 0 };
    return {
      x: o.x, y: o.y, elevation: o.elevation ?? 0,
      level: doc.level ?? 0,
      rotation: doc.rotation ?? 0,
      angle: l.angle,
      dim: token.getLightRadius(l.dim),
      bright: token.getLightRadius(l.bright),
      color: l.color,
      alpha: l.alpha,
      attenuation: l.attenuation, luminosity: l.luminosity, saturation: l.saturation,
      contrast: l.contrast, shadows: l.shadows, coloration: l.coloration,
      animation: l.animation,
      externalRadius: token.externalRadius ?? 0,
      seed: doc.getFlag?.("core", "animationSeed"),
      preview: !!token.isPreview,
      walls: true,
      vision: false,
      disabled: false
    };
  }

  static remove(id) {
    const src = this._sources.get(id);
    if (!src) return;
    try { src.destroy(); } catch (_e) { try { src.remove(); } catch (_e2) { /* déjà retirée */ } }
    this._sources.delete(id);
    try { if (canvas?.ready) canvas.perception.update({ refreshLighting: true }); } catch (_e) { /* */ }
  }

  static clearAll() {
    for (const id of [...this._sources.keys()]) this.remove(id);
  }
}
