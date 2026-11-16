/**
 * SBE — PERCEPTION D'UN MODE DE VISION
 *
 * Ce qu'un mode de vision (gestionnaire « Modes de vision ») permet de
 * repérer en plus de la vue :
 *   - les invisibles (sbeInvis, le « voir l'invisible » de Foundry) ;
 *   - à travers les murs, dans sa propre portée (sbeThrough) ;
 *   - une CONDITION sur la cible (formule lue sur la fiche du pion
 *     regardé) : « repère seulement si » ou « cache si ». La vue et la
 *     perception de la lumière du pion sont alors remplacées par leurs
 *     équivalents SBE (sbeSight, sbeLight), qui appliquent la condition.
 *
 * Ce qu'il repère EN PLUS (invisibles, à travers les murs) se limite aux
 * genres de pions cochés : personnages, objets posés, pièges.
 *
 * Les modes de détection d'origine du pion sont rendus quand le mode
 * part (vision-manager.mjs garde la vue d'origine).
 */

import { VisionModes } from "./vision-modes.mjs";
import { docScope } from "../../builder/doc-context.mjs";
import { evalExpression } from "../../builder/formula-engine.mjs";
import { memoOf } from "../../builder/data-revision.mjs";

export const SBE_DETECTION = ["sbeSight", "sbeLight", "sbeThrough", "sbeInvis"];
/** Les modes de détection qu'une perception touche (rendus à la fin). */
export const PERCEPTION_IDS = ["basicSight", "lightPerception", "seeInvisibility", ...SBE_DETECTION];

/* La portée d'un pion regardé, gardée tant que rien ne change. */
const SCOPES = new WeakMap();
const scopeOf = (actor) => memoOf(SCOPES, actor, () => { try { return docScope(actor); } catch (_e) { return {}; } });

/* Les pièges (chargé à part : le gestionnaire des pièges dépend de beaucoup). */
let TRAPS = null;

/** Genre d'un pion : "chars" (personnage), "props" (objet posé), "traps" (piège). */
function kindOf(target) {
  const td = target?.document;
  if (TRAPS?.isTrap?.(td)) return "traps";
  return target?.actor?.type === "prop" ? "props" : "chars";
}

/** Ce genre de pion est-il repéré EN PLUS par le mode de celui qui regarde ? */
function kindOk(viewerDoc, target) {
  const t = VisionModes.get(viewerDoc?.sight?.visionMode)?.perception.targets;
  return !t || t[kindOf(target)] !== false;
}

/** Le pion `target` passe-t-il la condition du mode de celui qui regarde ? */
function passes(viewerDoc, target) {
  const p = VisionModes.get(viewerDoc?.sight?.visionMode)?.perception;
  if (!p?.cond) return true;
  const actor = target?.actor;
  /* Un pion sans fiche : jamais « repéré seulement si », jamais « caché si ». */
  if (!actor) return p.condMode === "hide";
  const hit = !!evalExpression(p.cond, scopeOf(actor));
  return p.condMode === "hide" ? !hit : hit;
}

export class VisionPerception {

  static _done = false;

  /** À appeler au « setup » : les modes de détection de SBE. */
  static register() {
    if (this._done) return;
    this._done = true;
    try {
      const P = foundry.canvas.perception;
      const Token = foundry.canvas.placeables.Token;
      const T = P.DetectionMode.DETECTION_TYPES;
      const isTok = (t) => t instanceof Token;
      class SBESight extends P.DetectionModeDarkvision {
        _canDetect(vs, t, l) { return super._canDetect(vs, t, l) && (!isTok(t) || passes(vs.object?.document, t)); }
      }
      class SBELight extends P.DetectionModeLightPerception {
        _canDetect(vs, t, l) { return super._canDetect(vs, t, l) && (!isTok(t) || passes(vs.object?.document, t)); }
      }
      /* À travers les murs : un « sens » (pas la vue) — l'invisible n'est
         repéré que si le mode voit aussi les invisibles. Hors de la vue,
         Foundry ne dessine un pion repéré QU'AVEC un filtre : le contour
         du « tout percevoir » de Foundry (DetectionModeAll). */
      class SBEThrough extends P.DetectionModeAll {
        _canDetect(vs, t) {
          if (!isTok(t)) return false;
          const src = vs.object?.document;
          const m = VisionModes.get(src?.sight?.visionMode);
          if (t.document.hasStatusEffect(CONFIG.specialStatusEffects.INVISIBLE) && !m?.perception.invisible) return false;
          return kindOk(src, t) && passes(src, t);
        }
      }
      /* Les invisibles, limités aux genres de pions cochés. */
      class SBEInvis extends P.DetectionModeInvisibility {
        _canDetect(vs, t, l) { return super._canDetect(vs, t, l) && kindOk(vs.object?.document, t) && passes(vs.object?.document, t); }
      }
      const dm = CONFIG.Canvas.detectionModes;
      dm.sbeSight = new SBESight({ id: "sbeSight", label: "SBE.VisionModes.Det.sight", type: T.SIGHT, tokenConfig: false });
      dm.sbeLight = new SBELight({ id: "sbeLight", label: "SBE.VisionModes.Det.light", type: T.SIGHT, tokenConfig: false });
      dm.sbeInvis = new SBEInvis({ id: "sbeInvis", label: "SBE.VisionModes.Det.invis", type: T.SIGHT, tokenConfig: false });
      dm.sbeThrough = new SBEThrough({ id: "sbeThrough", label: "SBE.VisionModes.Det.through", type: T.OTHER, walls: false, angle: false, tokenConfig: false });
    } catch (err) {
      console.error("SBE | Perception : modes de détection en échec", err);
    }
    import("../traps/trap-manager.mjs").then(m => { TRAPS = m.TrapManager; }).catch(() => { /* pas de pièges */ });

    /* Une cible change (effet, valeur) : ce qui est repéré est revu. */
    const later = foundry.utils.debounce(() => {
      if (!canvas?.ready || !VisionModes.all().some(m => m.perception.cond)) return;
      try { canvas.perception.update({ refreshVision: true }); } catch (_e) { /* scène pas prête */ }
    }, 50);
    for (const h of ["updateActor", "createActiveEffect", "deleteActiveEffect", "updateActiveEffect"]) Hooks.on(h, later);
    /* Les détections d'un pion changent : Foundry ne revoit pas tout seul
       qui est visible (un pion derrière un mur resterait caché). */
    Hooks.on("updateToken", (_td, changes) => {
      if (!("detectionModes" in (changes ?? {})) || !canvas?.ready) return;
      try { canvas.perception.update({ initializeVision: true, refreshVision: true }); } catch (_e) { /* scène pas prête */ }
    });
  }

  /**
   * Les modes de détection à poser sur un pion pour le mode `modeId`
   * ({ id: { enabled, range } }), ou null s'il n'a pas de perception.
   * @param {object} saved  la vue d'origine gardée ({ sight, detection })
   * @param {object} sight  la vue posée (sa portée sert par défaut)
   */
  static changes(modeId, actor, saved, sight) {
    const p = VisionModes.get(modeId)?.perception;
    if (!p || !(p.invisible || p.through || p.cond)) return null;
    const det = saved?.detection ?? {};
    const range = Number(sight?.range ?? saved?.sight?.range) || 0;
    const out = {};
    if (p.invisible) out.sbeInvis = { enabled: true, range };
    if (p.through) {
      const r = this.#number(p.throughRange, actor);
      if (r > 0) out.sbeThrough = { enabled: true, range: r };
    }
    if (p.cond) {
      const bs = det.basicSight, lp = det.lightPerception;
      out.basicSight = { ...(bs ?? {}), enabled: false, range: bs?.range ?? range };
      out.lightPerception = { ...(lp ?? {}), enabled: false, range: lp?.range ?? null };
      out.sbeSight = { enabled: bs?.enabled !== false, range: bs?.range ?? range };
      out.sbeLight = { enabled: lp?.enabled !== false, range: lp?.range ?? null };
    }
    return out;
  }

  /** Un nombre ou une formule lue sur la fiche de celui qui regarde. */
  static #number(raw, actor) {
    const s = String(raw ?? "").trim();
    if (!s) return 0;
    if (Number.isFinite(Number(s))) return Math.max(0, Number(s));
    const v = Number(evalExpression(s, actor ? scopeOf(actor) : {}));
    return Number.isFinite(v) ? Math.max(0, v) : 0;
  }
}
