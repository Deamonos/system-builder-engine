/**
 * SBE — FORMES DE ZONE : la bibliothèque du monde
 *
 * Les formes dessinées par le MJ (manager « Formes de zone »), et les
 * trois formes simples réglées par des tailles : cercle, cône, ligne.
 * Une étape « Attaquer » désigne sa zone par un NOM (texte ou formule,
 * par exemple le type de zone de la munition chargée).
 *
 * Forme enregistrée :
 *   { id, name, anchor: "self"|"impact", rotate: "none"|"4"|"8"|"free",
 *     cover: null|1..100   (exception au % de couverture du manager),
 *     walls: ""|"none"|"move"|"sight"  (exception aux murs du manager),
 *     color: "#rrggbb"     (couleur du gabarit : code couleur du MJ),
 *     pieces: [...] }      (cf. zone-geom.mjs)
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { circleShape, coneShape, lineShape, cleanPiece, DEFAULT_COLOR } from "./zone-geom.mjs";

const HEX = /^#[0-9a-f]{6}$/i;
const colorOf = (c, d = null) => (HEX.test(String(c ?? "")) ? String(c).toLowerCase() : d);

const norm = (s) => String(s ?? "").trim().toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "");

/* Noms reconnus pour les formes simples (français et anglais). */
const BUILTIN = {
  cercle: "circle", circle: "circle", explosion: "circle",
  cone: "cone",
  ligne: "line", line: "line", rayon: "line", ray: "line"
};
const NONE = new Set(["", "0", "aucune", "aucun", "none", "-", "—"]);

export const ANCHORS = ["impact", "self"];
export const ROTATES = ["free", "8", "4", "none"];
export const WALLS = ["none", "move", "sight"];

export class ZoneShapes {

  static list() {
    let raw = [];
    try { raw = game.settings.get(SYSTEM_ID, "zoneShapes") ?? []; } catch (_e) { /* pas encore inscrit */ }
    return (Array.isArray(raw) ? raw : []).map(s => this.clean(s)).filter(s => s.name);
  }

  static async save(list) {
    await game.settings.set(SYSTEM_ID, "zoneShapes", list.map(s => this.clean(s)));
  }

  /** Forme nettoyée (import, enregistrement). */
  static clean(s) {
    const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
    const pieces = (Array.isArray(s?.pieces) ? s.pieces : []).map(p => {
      const g = cleanPiece(p);
      return g ? { ...g, intensity: Math.max(0, Math.min(1000, num(p?.intensity, 100))) } : null;
    }).filter(Boolean);
    const cover = s?.cover === null || s?.cover === undefined || s?.cover === "" ? null
      : Math.max(1, Math.min(100, num(s.cover, 50)));
    return {
      id: String(s?.id || foundry.utils.randomID()),
      name: String(s?.name ?? "").trim(),
      anchor: ANCHORS.includes(s?.anchor) ? s.anchor : "impact",
      rotate: ROTATES.includes(s?.rotate) ? s.rotate : "free",
      cover,
      walls: WALLS.includes(s?.walls) ? s.walls : "",
      color: colorOf(s?.color, DEFAULT_COLOR),
      pieces
    };
  }

  /**
   * La zone désignée par `name` (formes simples ou dessinées).
   * @param sizes { radius, length, angle, width }  en cases / degrés
   * @returns {object|null} null = pas de zone (attaque sur cible unique)
   *          { shape, builtin, unknown? }
   */
  static resolve(name, sizes = {}) {
    const n = norm(name);
    if (NONE.has(n)) return null;
    const kind = BUILTIN[n] ?? Object.entries(BUILTIN).find(([k]) => n.includes(k))?.[1] ?? null;
    const custom = this.list().find(s => norm(s.name) === n);
    if (custom) return { shape: custom, builtin: false };
    if (kind === "circle") {
      const r = Number(sizes.radius) || 0;
      return r > 0 ? { shape: { name, cover: null, walls: "", ...circleShape(r) }, builtin: true } : { missing: "circle" };
    }
    if (kind === "cone") {
      const L = Number(sizes.length) || 0;
      return L > 0 ? { shape: { name, cover: null, walls: "", ...coneShape(L, sizes.angle) }, builtin: true } : { missing: "cone" };
    }
    if (kind === "line") {
      const L = Number(sizes.length) || 0;
      return L > 0 ? { shape: { name, cover: null, walls: "", ...lineShape(L, sizes.width) }, builtin: true } : { missing: "line" };
    }
    return { unknown: String(name) };
  }
}
