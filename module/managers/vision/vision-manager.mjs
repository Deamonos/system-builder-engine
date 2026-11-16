/**
 * SBE — LA VUE DU JETON (MJ principal)
 *
 * La vue de BASE d'un pion reste celle que le MJ règle dans Foundry :
 * SBE n'y touche jamais. Elle est REMPLACÉE tant que :
 *   - un effet « Aveugle » est posé (fumigène, flash, sort) — il passe
 *     devant tout ;
 *   - sinon, un OBJET allumé change la vue (onglet Lumière de l'objet :
 *     item-light.mjs) — le dernier allumé compte.
 * La vue d'origine est gardée de côté sur le jeton et rendue telle
 * quelle quand plus rien ne la change.
 *
 * La lumière des objets allumés rejoint celle des effets (effect-look :
 * la plus forte est écrite sur le jeton) ; la lumière personnelle et le
 * halo thermique se dessinent chez chacun.
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { EffectManager } from "../effects/effect-manager.mjs";
import { EffectLook } from "../effects/effect-look.mjs";
import { BLIND_MODE, VisionModes } from "./vision-modes.mjs";
import { effectReader, matchChoice } from "./effect-values.mjs";
import { VisionPerception, PERCEPTION_IDS } from "./vision-perception.mjs";
import { ItemLight } from "./item-light.mjs";
import { docScope } from "../../builder/doc-context.mjs";
import { walkElements } from "../../builder/element-renderer.mjs";
import { isPrimaryGM } from "../../helpers/socket.mjs";

/** CLÉS FIXES de la vue du jeton : un champ de la fiche (n'importe quel
    composant) nommé ainsi donne la portée / l'angle de vue de BASE du
    jeton. Valeur totale (bonus et effets compris) ; lisible dans toute
    formule comme n'importe quelle clé. */
export const SIGHT_KEY = "sight";
export const SIGHT_ANGLE_KEY = "sight_angle";
/** Clé fixe du MODE de vision de base (identifiant ou nom d'un mode). */
export const SIGHT_MODE_KEY = "sight_mode";

/** Les effets SBE actifs d'un acteur, avec leur définition. */
export function activeEffectsOf(actor) {
  const out = [];
  for (const ae of actor?.effects ?? []) {
    if (ae.disabled) continue;
    const def = EffectManager.getDef(ae.flags?.[SYSTEM_ID]?.key ?? "");
    if (def) out.push({ ae, def });
  }
  return out;
}

export class VisionManager {

  static _bound = false;
  /** Écritures en attente (anti-rafale), par acteur. */
  static _pending = new Map();

  static init() {
    if (this._bound) return;
    this._bound = true;

    /* Les lumières des objets allumés rejoignent celles des effets. */
    EffectLook.registerLightProvider((actor) => ItemLight.lightsOf(actor));

    /* Un objet change (équipé, allumé, réglé, épuisé…) : vue et lumière. */
    ItemLight.init((actor) => { this.queue(actor); this.preview(actor); });

    /* Un effet « Aveugle » arrive ou part : la vue suit. */
    for (const h of ["createActiveEffect", "deleteActiveEffect", "updateActiveEffect"]) {
      Hooks.on(h, (ae) => {
        const actor = ae.parent;
        if (actor?.documentName !== "Actor") return;
        const def = EffectManager.getDef(ae.flags?.[SYSTEM_ID]?.key ?? "");
        if (def?.look.blind || def?.look.sight?.enabled || this.hasSheetSight(actor)) { this.queue(actor); this.preview(actor); }
      });
    }
    /* Un mode de vision réglé autrement (priorité…) : les pions de la scène suivent. */
    Hooks.on("sbeVisionModesChanged", () => {
      if (!isPrimaryGM()) return;
      for (const t of canvas?.tokens?.placeables ?? []) if (t.actor) this.queue(t.actor);
    });
    /* Un pion posé sur la scène prend la vue et la lumière de son porteur. */
    Hooks.on("createToken", (td) => {
      const actor = td.actor;
      if (!isPrimaryGM() || !actor) return;
      this.queue(actor);
    });
    /* Scène affichée : les jetons prennent la vue de leur fiche. */
    Hooks.on("canvasReady", () => {
      if (!isPrimaryGM()) return;
      for (const t of canvas.tokens?.placeables ?? []) if (this.hasSheetSight(t.actor)) this.queue(t.actor);
    });
    /* Formules lues sur l'objet (portée selon une valeur du porteur…). */
    Hooks.on("updateActor", (actor) => {
      if (ItemLight.activeOf(actor).length || this.hasSheetSight(actor)) { this.queue(actor); this.preview(actor); }
    });
  }

  /* ========================================================== */
  /*  VUE DE BASE LUE SUR LA FICHE (clés fixes)                  */
  /* ========================================================== */

  /** Le modèle de la fiche porte-t-il une clé de vue ? */
  static hasSheetSight(actor) {
    const els = actor?.system?.template?.system?.elements ?? [];
    for (const el of walkElements(els)) if ([SIGHT_KEY, SIGHT_ANGLE_KEY, SIGHT_MODE_KEY].includes(el?.key)) return true;
    return false;
  }

  /** {range?, angle?} lus sur la fiche, null = rien à imposer. Un
      angle de 0 ou moins est ignoré (vue tout autour). */
  static sheetSight(actor) {
    if (!this.hasSheetSight(actor)) return null;
    let sc;
    try { sc = docScope(actor); } catch (_e) { return null; }
    const out = {};
    const r = Number(sc?.[SIGHT_KEY]);
    if (sc && SIGHT_KEY in sc && Number.isFinite(r)) out.range = Math.max(0, r);
    const a = Number(sc?.[SIGHT_ANGLE_KEY]);
    if (sc && SIGHT_ANGLE_KEY in sc && Number.isFinite(a) && a > 0) out.angle = Math.min(360, a);
    return Object.keys(out).length ? out : null;
  }

  /** Le mode de vision de BASE lu sur la fiche (clé « sight_mode » :
      identifiant ou nom d'un mode), ou "". */
  static sheetMode(actor) {
    if (!this.hasSheetSight(actor)) return "";
    let sc;
    try { sc = docScope(actor); } catch (_e) { return ""; }
    const raw = String(sc?.[SIGHT_MODE_KEY] ?? "").trim();
    if (!raw) return "";
    const { own, natives } = VisionModes.options();
    return matchChoice(raw, [...own, ...natives].map(o => [o.value, o.label]));
  }

  /* ========================================================== */
  /*  QUELLE VUE COMPTE                                          */
  /* ========================================================== */

  static isBlind(actor) {
    return activeEffectsOf(actor).some(x => x.def.look.blind);
  }

  /**
   * Les modes de vision proposés au personnage : objets allumés, effets,
   * fiche. Chacun : { mode, sight (ce qu'il pose sur le pion), since }.
   */
  static candidates(actor) {
    const out = [];
    for (const x of ItemLight.visionsOf(actor)) out.push({ mode: x.src.vision.mode, sight: ItemLight.sightOf(x).sight, since: x.since ?? 0 });
    for (const { ae, def } of activeEffectsOf(actor)) {
      const s = def.look.sight;
      if (!s?.enabled || !s.mode) continue;
      const r = effectReader(actor, def.key);
      const sight = { enabled: true, visionMode: CONFIG.Canvas?.visionModes?.[s.mode] ? s.mode : "basic" };
      const range = r.num(s.range, null), angle = r.num(s.angle, null);
      if (range !== null) sight.range = Math.max(0, range);
      if (angle !== null) sight.angle = Math.max(1, Math.min(360, angle));
      out.push({ mode: s.mode, sight, since: ae._stats?.createdTime ?? 0 });
    }
    const base = this.sheetMode(actor);
    if (base) out.push({ mode: base, sight: { enabled: true, visionMode: base }, since: -1 });
    /* Les réglages du mode (teinte, luminosité…) vont sur le pion. */
    for (const c of out) c.sight = VisionModes.applyTo(c.mode, c.sight);
    return out;
  }

  /** Le mode qui compte : la plus haute priorité, puis le plus récent. */
  static #winner(actor) {
    const prio = (m) => VisionModes.get(m)?.priority ?? 0;
    return this.candidates(actor).sort((a, b) => (prio(b.mode) - prio(a.mode)) || (b.since - a.since))[0] ?? null;
  }

  /** Mode de vision qui compte pour cet acteur ("" = vue de base). */
  static modeOf(actor) {
    if (this.isBlind(actor)) return BLIND_MODE;
    return this.#winner(actor)?.mode ?? "";
  }

  /** La vue à poser (null = vue de base) : complète la vue de base du pion. */
  static sightOf(actor) {
    if (this.isBlind(actor)) return { blind: true };
    const win = this.#winner(actor);
    return win ? { blind: false, sight: win.sight, mode: win.mode } : null;
  }

  /* ========================================================== */
  /*  ÉCRITURE SUR LE JETON (MJ principal)                       */
  /* ========================================================== */

  /** Vue ET lumière du jeton, écrites ensemble (une seule écriture par
      jeton : la vue s'allume d'un coup, sans attendre la lumière). Le
      court délai regroupe seulement les changements d'un même geste. */
  static queue(actor) {
    if (!isPrimaryGM() || !actor) return;
    const id = actor.uuid;
    clearTimeout(this._pending.get(id));
    this._pending.set(id, setTimeout(() => {
      this._pending.delete(id);
      this.sync(actor).catch(err => console.warn("SBE | Vision : mise à jour du jeton en échec", err));
    }, 10));
  }

  /** AFFICHAGE IMMÉDIAT chez le joueur propriétaire : sans attendre
      l'écriture du MJ (un aller-retour de plus), son écran pose tout de
      suite la vue et la lumière calculées — en LOCAL, rien n'est écrit.
      L'écriture du MJ arrive ensuite avec les mêmes valeurs. Les
      réglages gardés sur le jeton (vue d'origine…) ne sont jamais
      touchés ici. Seulement si un MJ est connecté (sinon rien ne
      serait enregistré). */
  static preview(actor) {
    if (!actor || isPrimaryGM() || !actor.isOwner || !game.users?.activeGM) return;
    const id = `${actor.uuid}::preview`;
    clearTimeout(this._pending.get(id));
    this._pending.set(id, setTimeout(() => {
      this._pending.delete(id);
      try { this._preview(actor); }
      catch (err) { console.warn("SBE | Vision : affichage immédiat en échec", err); }
    }, 0));
  }

  /* Le joueur peut allumer puis éteindre AVANT que l'écriture du MJ
     ne revienne : le jeton ne porte pas encore la vue / la lumière
     d'origine gardées par le MJ (flags). Le client garde donc sa propre
     copie de l'état d'origine (prise quand rien n'est encore remplacé)
     et s'en sert tant que les flags du MJ manquent. Copie effacée dès
     que la vue / la lumière d'origine sont rendues. */
  static _preview(actor) {
    const changes = this.changesFor(actor);
    const Del = foundry.data.operators.ForcedDeletion;
    const isDel = (v) => v instanceof Del;
    let any = false;
    for (const tok of actor.getActiveTokens?.() ?? []) {
      const td = tok.document;
      const src = td._source;
      const own = src.flags?.[SYSTEM_ID] ?? {};
      const snap = tok._sbeSnap ??= {};
      if (!own.baseSight && !snap.sight) {
        snap.sight = { sight: foundry.utils.deepClone(src.sight), detection: foundry.utils.deepClone(src.detectionModes ?? {}) };
      }
      if (!own.baseLight && !snap.light) snap.light = foundry.utils.deepClone(src.light);
      /* Vue du calcul : les flags du MJ, complétés par la copie locale. */
      const f = { ...own };
      f.baseSight ??= snap.sight;
      f.baseLight ??= snap.light;
      f.blindSet ??= snap.blind;
      const view = { flags: { [SYSTEM_ID]: f }, _source: { ...src, flags: { ...(src.flags ?? {}), [SYSTEM_ID]: f } } };
      const upd = changes(view);
      if (!upd) continue;
      const local = {};
      for (const [k, v] of Object.entries(upd)) if (!k.startsWith("flags.")) local[k] = v;
      const kS = `flags.${SYSTEM_ID}.baseSight`, kL = `flags.${SYSTEM_ID}.baseLight`, kB = `flags.${SYSTEM_ID}.blindSet`;
      if (kB in upd) snap.blind = isDel(upd[kB]) ? undefined : upd[kB];
      if (isDel(upd[kS])) { delete snap.sight; snap.blind = undefined; }
      if (isDel(upd[kL])) delete snap.light;
      if (!Object.keys(local).length) continue;
      const diff = td.updateSource(local);
      if (foundry.utils.isEmpty(diff ?? {})) continue;   /* déjà à jour */
      tok.initializeSources?.();
      any = true;
    }
    if (any) canvas?.perception?.update({ initializeVisionModes: true, initializeVision: true, refreshVision: true, refreshLighting: true });
  }

  /** Ancien nom : la lumière suit désormais la vue (même écriture). */
  static queueLight(actor) { this.queue(actor); }

  /** Les modes de détection touchés par l'aveuglement. */
  static BLIND_DETECTION = ["lightPerception", "basicSight"];

  /** Ce qu'il faut écrire sur UN jeton (vue + lumière), null = rien.
      Une seule source : l'écriture du MJ et l'affichage immédiat du
      joueur (preview) utilisent ce même calcul. */
  static changesFor(actor) {
    const want = this.sightOf(actor);
    const sheet = this.sheetSight(actor);
    const lightOf = EffectLook.lightChanges(actor);
    /* La vue de base, corrigée par la fiche. */
    const withSheet = (sight) => (sheet ? { ...(sight ?? {}), ...sheet } : sight);
    const differs = (sight) => !!sheet && Object.entries(sheet).some(([k, v]) => sight?.[k] !== v);
    const Del = foundry.data.operators.ForcedDeletion;
    /* Modes de détection : ceux d'origine reviennent (une clé absente
       à l'origine est retirée). */
    const restoreDetection = (upd, from, ids = this.BLIND_DETECTION) => {
      const det = from?.detection ?? {};
      for (const id of ids) {
        upd[`detectionModes.${id}`] = det[id] ? foundry.utils.deepClone(det[id]) : Del.create();
      }
    };
    return (td) => {
      const base = td.flags?.[SYSTEM_ID]?.baseSight;
      const upd = lightOf(td) ?? {};
      /* Perception d'un mode (invisibles, murs, condition) posée avant. */
      const percSet = !!td._source.flags?.[SYSTEM_ID]?.percSet;
      if (want) {
        const saved = base ?? {
          sight: foundry.utils.deepClone(td._source.sight),
          detection: foundry.utils.deepClone(td._source.detectionModes ?? {})
        };
        if (!base || differs(saved.sight)) {
          upd[`flags.${SYSTEM_ID}.baseSight`] = { ...saved, sight: withSheet(saved.sight) };
        }
        if (percSet) restoreDetection(upd, saved, PERCEPTION_IDS);
        let perc = null;
        if (want.blind) {
          upd.sight = { enabled: true, visionMode: "basic", range: 0, angle: 360, brightness: 0, saturation: 0, contrast: 0 };
          for (const id of this.BLIND_DETECTION) upd[`detectionModes.${id}`] = { enabled: false, range: 0 };
        } else {
          upd.sight = { ...(withSheet(saved.sight) ?? {}), ...want.sight };
          if (td._source.flags?.[SYSTEM_ID]?.blindSet) restoreDetection(upd, saved);
          /* Ce que le mode repère en plus (ou cache). */
          perc = VisionPerception.changes(want.mode, actor, saved, upd.sight);
          for (const [id, v] of Object.entries(perc ?? {})) upd[`detectionModes.${id}`] = v;
        }
        upd[`flags.${SYSTEM_ID}.blindSet`] = !!want.blind;
        upd[`flags.${SYSTEM_ID}.percSet`] = !!perc;
      } else if (base) {
        upd.sight = withSheet(base.sight);
        upd[`flags.${SYSTEM_ID}.baseSight`] = Del.create();
        upd[`flags.${SYSTEM_ID}.blindSet`] = Del.create();
        upd[`flags.${SYSTEM_ID}.percSet`] = Del.create();
        if (td._source.flags?.[SYSTEM_ID]?.blindSet) restoreDetection(upd, base);
        if (percSet) restoreDetection(upd, base, PERCEPTION_IDS);
      } else if (differs(td._source.sight)) {
        upd.sight = { ...sheet };
      }
      return Object.keys(upd).length ? upd : null;
    };
  }

  static async sync(actor) {
    const changes = this.changesFor(actor);
    const docs = actor.getDependentTokens?.() ?? actor.getActiveTokens?.(false, true) ?? [];
    for (const td of docs) {
      try {
        const upd = changes(td);
        if (upd) await td.update(upd);
      } catch (err) {
        console.warn("SBE | Vision : jeton non mis à jour", err);
      }
    }
    /* Jeton par défaut de l'acteur : la vue de la fiche (vue de BASE). */
    const sheet = this.sheetSight(actor);
    if (sheet && !actor.isToken && actor.prototypeToken) {
      const p = actor.prototypeToken.sight ?? {};
      const u = {};
      for (const [k, v] of Object.entries(sheet)) if (p[k] !== v) u[`prototypeToken.sight.${k}`] = v;
      if (Object.keys(u).length) {
        try { await actor.update(u); } catch (err) { console.warn("SBE | Vision : jeton par défaut non mis à jour", err); }
      }
    }
    try { canvas?.perception?.update({ initializeVisionModes: true, initializeVision: true, refreshVision: true }); }
    catch (_e) { /* scène pas prête */ }
  }
}
