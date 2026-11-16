/**
 * SBE — MODES DE VISION (bibliothèque du MJ)
 *
 * Les modes de vision du monde, réglés par le MJ dans le gestionnaire
 * « Modes de vision » (vision-modes-app.mjs). Trois modes de départ,
 * renommables, réglables et réinitialisables (ils servent d'exemples) ;
 * le MJ crée les siens.
 *
 * Chaque mode devient un mode de vision de Foundry (CONFIG.Canvas.visionModes),
 * reconstruit à chaque changement : rien à recharger.
 *
 *   mode = {
 *     id, name, icon, priority,
 *     render: {
 *       tint        couleur de teinte de la vue ("" = aucune)
 *       brightness, saturation, contrast   −1 … 1 (noir et blanc : saturation −1)
 *       dark        "none" | "dim" | "bright"   voir dans le noir (dans la portée)
 *       heat        halo de chaleur sur les pions (thermal-view.mjs)
 *       grain       grain d'image, 0 … 1 (vision-screen.mjs)
 *     },
 *     perception: {              ce qu'il repère en plus (vision-perception.mjs)
 *       invisible   les pions invisibles
 *       through, throughRange    à travers les murs, dans cette portée (nombre / formule)
 *       cond, condMode           formule sur la cible : "only" (repère seulement si) | "hide" (cache si)
 *       targets: { chars, props, traps }   genres de pions repérés EN PLUS
 *     }
 *   }
 *
 * « Aveugle » (case d'un effet) n'est pas un mode : c'est une portée
 * nulle et la perception de la lumière coupée (vision-manager.mjs).
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";

/** Les modes de départ (ids gardés : les objets déjà réglés les utilisent). */
export const BUILTIN_MODES = ["sbeVision", "sbeNight", "sbeThermal"];
/** Ancien nom gardé pour les autres fichiers. */
export const SBE_VISION_MODES = BUILTIN_MODES;
/** Mode « aveugle » (case Aveugle d'un effet) : pas un mode de Foundry. */
export const BLIND_MODE = "sbeBlind";
export const DARK_LEVELS = ["none", "dim", "bright"];
export const COND_MODES = ["only", "hide"];
export const TARGET_KINDS = ["chars", "props", "traps"];
const SETTING = "visionModes";

const clamp1 = (v) => Math.max(-1, Math.min(1, Number(v) || 0));
const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));
const hex = (v) => (/^#[0-9a-f]{6}$/i.test(String(v ?? "").trim()) ? String(v).trim().toLowerCase() : "");

/** Réglages d'origine des modes de départ (« Réinitialiser »). */
export function builtinDefaults(id) {
  const base = { id, name: "", icon: "", priority: 0, builtin: true,
    render: { tint: "", brightness: 0, saturation: 0, contrast: 0, dark: "none", heat: false, grain: 0 },
    perception: { invisible: false, through: false, throughRange: "", cond: "", condMode: "only", targets: { chars: true, props: true, traps: true } } };
  if (id === "sbeNight") Object.assign(base, { icon: "fa-solid fa-moon", render: { ...base.render, dark: "dim" } });
  else if (id === "sbeThermal") Object.assign(base, { icon: "fa-solid fa-temperature-half", render: { ...base.render, dark: "dim", heat: true } });
  else base.icon = "fa-solid fa-eye";
  return base;
}

/** Un mode propre (rien d'inconnu). */
export function cleanMode(raw) {
  const m = raw && typeof raw === "object" ? raw : {};
  const id = String(m.id ?? "").trim();
  const builtin = BUILTIN_MODES.includes(id);
  const r = m.render ?? {};
  const p = m.perception ?? {};
  return {
    id,
    name: String(m.name ?? "").trim(),
    icon: String(m.icon ?? "").trim(),
    priority: Math.round(Number(m.priority) || 0),
    builtin,
    render: {
      tint: hex(r.tint),
      brightness: clamp1(r.brightness),
      saturation: clamp1(r.saturation),
      contrast: clamp1(r.contrast),
      dark: DARK_LEVELS.includes(r.dark) ? r.dark : "none",
      heat: !!r.heat,
      grain: clamp01(r.grain)
    },
    perception: {
      invisible: !!p.invisible,
      through: !!p.through,
      throughRange: String(p.throughRange ?? "").trim(),
      cond: String(p.cond ?? "").trim(),
      condMode: p.condMode === "hide" ? "hide" : "only",
      targets: { chars: p.targets?.chars !== false, props: p.targets?.props !== false, traps: p.targets?.traps !== false }
    }
  };
}

const rgb = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);

export class VisionModes {

  static _done = false;
  static _list = null;

  /** Tous les modes : ceux de départ (toujours là), puis ceux du MJ. */
  static all() {
    if (this._list) return this._list;
    let saved = [];
    try { saved = game.settings.get(SYSTEM_ID, SETTING)?.modes ?? []; } catch (_e) { saved = []; }
    const byId = new Map(saved.map(cleanMode).filter(m => m.id).map(m => [m.id, m]));
    const out = BUILTIN_MODES.map(id => byId.get(id) ?? builtinDefaults(id));
    for (const m of byId.values()) if (!m.builtin) out.push(m);
    this._list = out;
    return out;
  }

  static get(id) { return this.all().find(m => m.id === id) ?? null; }

  /** Nom affiché (un mode de départ sans nom : celui de la langue). */
  static nameOf(m) {
    if (!m) return "";
    return m.name || (m.builtin ? game.i18n.localize(`SBE.Vision.Mode.${m.id}`) : m.id);
  }

  /** Écrit la bibliothèque (MJ). */
  static async save(list) {
    const modes = list.map(cleanMode).filter(m => m.id);
    await game.settings.set(SYSTEM_ID, SETTING, { modes });
  }

  /** À appeler dans « init » : réglage + modes (reconstruits au « setup »). */
  static register() {
    if (this._done) return;
    this._done = true;
    game.settings.register(SYSTEM_ID, SETTING, {
      scope: "world", config: false, type: Object, default: { modes: [] },
      onChange: () => { this._list = null; this.rebuild(); }
    });
    Hooks.once("setup", () => this.rebuild(false));
  }

  /**
   * La vue d'un pion avec ce mode : Foundry lit la teinte, la luminosité,
   * la saturation et le contraste sur le PION (pas sur le mode). Les
   * réglages du mode s'ajoutent donc à ceux de la source (intensité d'un
   * objet allumé) ; une couleur de la source passe devant la teinte.
   */
  static applyTo(modeId, sight) {
    const m = this.get(modeId);
    if (!m) return sight;
    const r = m.render;
    const out = { ...sight };
    out.brightness = clamp1(r.brightness + Number(sight.brightness ?? 0));
    out.saturation = clamp1(r.saturation + Number(sight.saturation ?? 0));
    out.contrast = clamp1(r.contrast + Number(sight.contrast ?? 0));
    if (!out.color && r.tint) out.color = r.tint;
    return out;
  }

  /** Les modes du MJ deviennent des modes de Foundry ; la scène suit. */
  static rebuild(refresh = true) {
    const VisionMode = foundry.canvas?.perception?.VisionMode;
    const modes = CONFIG.Canvas?.visionModes;
    if (!VisionMode || !modes) { console.warn("SBE | Modes de vision : API de Foundry introuvable"); return; }
    /* Les modes retirés de la bibliothèque disparaissent aussi chez Foundry. */
    for (const id of Object.keys(modes)) {
      if (modes[id]?._sbe && !this.get(id)) delete modes[id];
    }
    for (const m of this.all()) {
      try {
        const vm = new VisionMode(this.#data(m), { animated: false });
        vm._sbe = true;
        modes[m.id] = vm;
      } catch (err) {
        console.warn(`SBE | Mode de vision « ${m.id} » en échec`, err);
      }
    }
    if (!refresh) return;
    try {
      if (canvas?.ready) canvas.perception.update({ initializeVisionModes: true, initializeVision: true, refreshVision: true, refreshLighting: true });
    } catch (_e) { /* scène pas prête */ }
    Hooks.callAll("sbeVisionModesChanged");
  }

  /** Données du mode de Foundry correspondant. */
  static #data(m) {
    const r = m.render;
    const L = foundry.canvas.perception.VisionMode.LIGHTING_LEVELS;
    const V = foundry.canvas.perception.VisionMode.LIGHTING_VISIBILITY;
    const shaders = foundry.canvas.rendering?.shaders ?? {};
    const data = {
      id: m.id,
      label: this.nameOf(m),
      vision: {
        /* « Adaptatif » : Foundry n'applique les réglages d'image que dans
           le noir — un filtre (teinte, saturation…) doit valoir partout. */
        darkness: { adaptive: r.dark === "none" && !(r.tint || r.brightness || r.saturation || r.contrast) },
        defaults: { attenuation: 0, brightness: r.brightness, saturation: r.saturation, contrast: r.contrast },
        preferred: true
      }
    };
    if (r.tint) data.vision.defaults.color = r.tint;
    /* Toute la vue : teinte et réglages d'image (seulement s'il y en a). */
    if (r.tint || r.brightness || r.saturation || r.contrast) {
      data.canvas = {
        shader: shaders.ColorAdjustmentsSamplerShader,
        uniforms: { tint: r.tint ? rgb(r.tint) : [1, 1, 1], brightness: r.brightness, saturation: r.saturation, contrast: r.contrast, exposure: 0 }
      };
    }
    /* Voir dans le noir : le décor reste visible dans la portée ; la
       pénombre est vue comme la pleine lumière (et plus en « bright »). */
    if (r.dark !== "none") {
      data.lighting = {
        background: { visibility: V.REQUIRED },
        levels: r.dark === "bright"
          ? { [L.DIM]: L.BRIGHT, [L.BRIGHT]: L.BRIGHTEST }
          : { [L.DIM]: L.BRIGHT }
      };
    }
    return data;
  }

  /** Les modes proposés (onglet Lumière d'un objet…) : ceux de SBE,
      puis ceux de Foundry (et des modules installés). */
  static options() {
    const L = (k) => game.i18n.localize(k);
    const own = this.all().map(m => ({ value: m.id, label: this.nameOf(m) }));
    const mine = new Set(own.map(o => o.value));
    const natives = Object.entries(CONFIG.Canvas?.visionModes ?? {})
      .filter(([id, vm]) => !mine.has(id) && !vm?._sbe)
      .map(([id, vm]) => ({ value: id, label: L(vm?.label ?? id) }))
      .sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));
    return { own, natives };
  }
}
