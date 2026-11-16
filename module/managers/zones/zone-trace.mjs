/**
 * SBE — ZONES PERSISTANTES : les traces au sol (palier 4)
 *
 * Une trace est une simple TUILE posée sous les pions (brûlure, cratère,
 * flaque…) : elle ne fait rien, elle se voit. Elle se règle sur l'objet
 * du monde (onglet Zone → « Trace au sol » ; images dans l'onglet Médias) :
 *   atEnd     quand la zone s'éteint (fin de durée, ou chassée par une
 *             zone opposée) — pas quand le MJ l'efface à la main
 *   atImpact  au moment de l'impact, même si l'objet ne laisse pas de zone
 *   media     plusieurs images ou vidéos : une est tirée au hasard
 *   size      "zone" (la taille de la zone) | "fixed" (N cases)
 *   opacity   0 à 100
 *   rotate    tournée au hasard (deux traces ne se ressemblent pas)
 *   duration  "permanent" | "minutes" (N minutes de jeu) | "newday"
 *             (jusqu'à la prochaine nouvelle journée)
 *
 * La tuile est créée par le MJ principal (un joueur en fait la demande) ;
 * elle porte sa date de fin dans ses drapeaux : l'avancée du temps de jeu
 * et la nouvelle journée l'effacent. Aucune minuterie.
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { onSocketMessage, emitSocket, isPrimaryGM } from "../../helpers/socket.mjs";
import { boundsOf } from "./zone-look.mjs";

export const TRACE_SIZES = ["zone", "fixed"];
export const TRACE_DURATIONS = ["permanent", "minutes", "newday"];

const str = (v) => String(v ?? "").trim();
const num = (v, d = 0, min = 0) => (Number.isFinite(Number(v)) ? Math.max(min, Number(v)) : d);
const pick = (list) => (list?.length ? list[Math.floor(Math.random() * list.length)] : "");
const traceOf = (tile) => tile?.flags?.[SYSTEM_ID]?.zoneTrace ?? null;

/** Réglage de trace, toujours propre. */
export function cleanTrace(t) {
  return {
    atEnd: !!t?.atEnd,
    atImpact: !!t?.atImpact,
    media: (Array.isArray(t?.media) ? t.media : []).map(str).filter(Boolean),
    size: TRACE_SIZES.includes(t?.size) ? t.size : "zone",
    cases: num(t?.cases, 2),
    opacity: Math.min(100, num(t?.opacity, 90)),
    rotate: t?.rotate !== false,
    duration: TRACE_DURATIONS.includes(t?.duration) ? t.duration : "minutes",
    minutes: num(t?.minutes, 60)
  };
}

/** L'objet laisse-t-il une trace (selon que sa zone est cochée ou non) ? */
export function traceActive(z) {
  const t = z?.trace;
  return !!t && (t.atImpact || (z.on && t.atEnd));
}

export class ZoneTrace {

  static _bound = false;

  static init() {
    if (this._bound) return;
    this._bound = true;

    /* Demande d'un joueur : le MJ principal pose la trace. */
    onSocketMessage(async (p) => {
      if (p?.type !== "sbeTraceCreate" || !isPrimaryGM()) return;
      /* D'un joueur : seulement ce que `build` produit (une image au sol,
         jamais des réglages ou drapeaux d'autres modules). */
      await this.#create(p.sceneId, game.users.get(p._from)?.isGM ? p.data : this.#clean(p.data));
    });

    /* Le temps de jeu avance : les traces arrivées au bout s'effacent. */
    Hooks.on("updateWorldTime", (worldTime) => {
      if (!isPrimaryGM()) return;
      this.#purge(t => Number.isFinite(Number(t.until)) && t.until !== null && worldTime >= Number(t.until))
        .catch(err => console.warn("SBE | Traces : effacement en échec", err));
    });

    /* Nouvelle journée (lancée par un MJ, chez lui) : les traces
       « jusqu'à la nouvelle journée » s'effacent. */
    Hooks.on("sbeNewDayDone", () => {
      if (!game.user.isGM) return;
      this.#purge(t => !!t.newDay).catch(err => console.warn("SBE | Traces : effacement en échec", err));
    });
  }

  /**
   * Les données de la tuile (calculées chez celui qui agit).
   * @param {object} trace   réglage (cleanTrace)
   * @param {object|null} b  boîte de la zone (boundsOf) — taille « zone »
   * @param {{x,y}} center   centre de la trace
   */
  static build(scene, trace, b, center) {
    const src = pick(trace?.media);
    if (!src || !scene || !center) return null;
    const cell = Number(scene.dimensions?.size) || Number(scene.grid?.size) || 100;
    let w, h, cx = center.x, cy = center.y;
    if (trace.size === "zone" && b) { w = b.w; h = b.h; cx = b.cx; cy = b.cy; }
    else { w = h = Math.max(0.5, Number(trace.cases) || 1) * cell; }
    return {
      /* Foundry v14 : x / y d'une tuile = son point d'ancrage (le centre). */
      texture: { src, anchorX: 0.5, anchorY: 0.5 },
      x: Math.round(cx), y: Math.round(cy), width: Math.round(w), height: Math.round(h),
      rotation: trace.rotate ? Math.floor(Math.random() * 360) : 0,
      alpha: Math.max(0, Math.min(1, (Number(trace.opacity) || 0) / 100)),
      elevation: 0, sort: -2000, locked: true,
      video: { loop: true, autoplay: true, volume: 0 },
      flags: { [SYSTEM_ID]: { zoneTrace: { duration: trace.duration, minutes: Number(trace.minutes) || 0 } } }
    };
  }

  /** Les champs d'une trace demandée par un joueur, et rien d'autre. */
  static #clean(d) {
    const src = String(d?.texture?.src ?? "");
    if (!src || /^\s*(javascript|data):/i.test(src)) return null;
    const num = (v, lo, hi, dflt) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; };
    const t = d.flags?.[SYSTEM_ID]?.zoneTrace ?? {};
    return {
      texture: { src, anchorX: 0.5, anchorY: 0.5 },
      x: Math.round(num(d.x, -1e6, 1e6, 0)), y: Math.round(num(d.y, -1e6, 1e6, 0)),
      width: Math.round(num(d.width, 1, 20000, 100)), height: Math.round(num(d.height, 1, 20000, 100)),
      rotation: num(d.rotation, 0, 360, 0), alpha: num(d.alpha, 0, 1, 1),
      elevation: 0, sort: -2000, locked: true,
      video: { loop: true, autoplay: true, volume: 0 },
      flags: { [SYSTEM_ID]: { zoneTrace: { duration: ["minutes", "newday"].includes(t.duration) ? t.duration : "", minutes: num(t.minutes, 0, 1e7, 0) } } }
    };
  }

  /** Pose une trace (MJ) — ou la demande au MJ principal. */
  static async place(scene, data) {
    if (!scene || !data) return null;
    if (game.user.isGM) return this.#create(scene.id, data);
    if (!game.users.activeGM) return null;
    emitSocket({ type: "sbeTraceCreate", sceneId: scene.id, data });
    return null;
  }

  /** La zone s'éteint : sa trace de fin, là où elle était (MJ). */
  static async atEnd(region) {
    const zf = region?.flags?.[SYSTEM_ID]?.zone;
    const trace = zf?.cfg?.trace;
    if (!trace?.atEnd || !trace.media?.length) return;
    /* La surface d'origine (une zone qui a rétréci a brûlé plus large) ;
       une aura, elle, est là où elle a fini. */
    const shapes = !zf.attached && Array.isArray(zf.baseShapes) && zf.baseShapes.length
      ? zf.baseShapes : (region.shapes ?? []).map(sh => sh.toObject?.() ?? sh);
    const b = boundsOf(shapes);
    if (!b) return;
    await this.#create(region.parent?.id, this.build(region.parent, trace, b, { x: b.cx, y: b.cy }));
  }

  static async #create(sceneId, data) {
    const scene = game.scenes?.get(sceneId);
    if (!scene || !data) return null;
    /* La date de fin se fixe à la pose (sur le temps du monde). */
    const t = data.flags?.[SYSTEM_ID]?.zoneTrace ?? {};
    const flag = {
      until: t.duration === "minutes" && Number(t.minutes) > 0 ? game.time.worldTime + Number(t.minutes) * 60 : null,
      newDay: t.duration === "newday"
    };
    try {
      const [tile] = await scene.createEmbeddedDocuments("Tile", [{
        ...data, flags: { ...(data.flags ?? {}), [SYSTEM_ID]: { zoneTrace: flag } }
      }]);
      return tile ?? null;
    } catch (err) {
      console.warn("SBE | Traces : pose en échec", err);
      return null;
    }
  }

  /** Efface les traces qui répondent au test, sur toutes les scènes. */
  static async #purge(test) {
    for (const scene of game.scenes?.contents ?? []) {
      const ids = (scene.tiles?.contents ?? []).filter(t => { const f = traceOf(t); return f && test(f); }).map(t => t.id);
      if (ids.length) await scene.deleteEmbeddedDocuments("Tile", ids);
    }
  }
}
