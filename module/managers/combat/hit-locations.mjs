/**
 * SBE — LOCALISATION DES COUPS : les CORPS du monde
 *
 * Un corps (Humanoïde, Quadrupède, ceux du MJ) est un tableau de ZONES
 * et un DESSIN : des morceaux tracés sur une image de fond (facultative),
 * chacun rattaché à une zone. Chaque modèle de personnage choisi dans
 * « Modèles concernés » utilise ce corps ; un corps sans modèle sert
 * aux autres (corps par défaut).
 *
 *   body = { id, name, img, frame: "tall"|"wide"|"square",
 *            models: [templateId…], odds: "ranges"|"area",
 *            zones: [{ id, name, from, to, dmgKey, protKey, mult, aim }],
 *            pieces: [{ …géométrie, zone: zoneId }] }
 *
 * CHANCES : les plages (« 1 à 2 » sur le dé de localisation) ou la
 * SURFACE dessinée (plus une zone est grande, plus elle est touchée).
 * Ce que change une zone (toutes facultatives, case vide = règle
 * normale) : la clé qui encaisse, une protection lue sur la cible en
 * plus, un multiplicateur (formule) et le malus d'un coup visé.
 *
 * Les étapes qui suivent l'attaque lisent `hitZone` : le nom de la zone
 * en minuscules, sans accents, espaces en « _ » (« Bras droit » →
 * « bras_droit »).
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { cleanPiece, piecePolygon, pieceArea } from "../zones/zone-geom.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
export const FRAMES = { tall: [100, 150], wide: [150, 100], square: [100, 100] };
export const ODDS = ["ranges", "area"];
const COLORS = ["#d2622c", "#5a8f4e", "#3a83a8", "#c9a227", "#9b59b6", "#c0392b", "#16a085", "#7f8c8d"];

/** « Bras droit » → « bras_droit » (ce que lisent les formules). */
export function zoneSlug(name) {
  return String(name ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

/** Couleur d'affichage d'une zone (son rang dans le tableau). */
export function zoneColor(body, zoneId) {
  const i = Math.max(0, (body?.zones ?? []).findIndex(z => z.id === zoneId));
  /* Au-delà des couleurs de base, une teinte nouvelle par zone (angle
     d'or) : autant de zones que voulu, toutes distinctes. */
  return i < COLORS.length ? COLORS[i] : `hsl(${Math.round((i * 137.508) % 360)}, 55%, 52%)`;
}

/* Corps de départ (des données, proposées à la création ; noms des
   zones traduits à la création : SBE.Loc.Z_…). */
const P = (kind, g, zone) => ({ kind, ...g, zone });
const PRESETS = {
  humanoid: () => {
    const z = ["head", "torso", "rarm", "larm", "rleg", "lleg"];
    return {
      frame: "tall",
      zones: [
        { id: z[0], name: "head", from: 1, to: 2, mult: "2" }, { id: z[1], name: "torso", from: 3, to: 10 },
        { id: z[2], name: "rarm", from: 11, to: 13 }, { id: z[3], name: "larm", from: 14, to: 16 },
        { id: z[4], name: "rleg", from: 17, to: 18 }, { id: z[5], name: "lleg", from: 19, to: 20 }
      ],
      pieces: [
        P("ellipse", { x: 50, y: 16, rx: 11, ry: 13, rot: 0 }, z[0]), P("rect", { x: 30, y: 31, w: 40, h: 45, rot: 0 }, z[1]),
        P("poly", { pts: [[29, 33], [18, 37], [13, 80], [21, 81], [28, 48]] }, z[2]),
        P("poly", { pts: [[71, 33], [82, 37], [87, 80], [79, 81], [72, 48]] }, z[3]),
        P("poly", { pts: [[31, 77], [49, 77], [47, 146], [36, 146]] }, z[4]),
        P("poly", { pts: [[51, 77], [69, 77], [64, 146], [53, 146]] }, z[5])
      ]
    };
  },
  quadruped: () => {
    const z = ["head", "body", "front", "back", "tail"];
    return {
      frame: "wide",
      zones: [
        { id: z[0], name: "head", from: 1, to: 3, mult: "2" }, { id: z[1], name: "body", from: 4, to: 12 },
        { id: z[2], name: "front", from: 13, to: 16 }, { id: z[3], name: "back", from: 17, to: 19 },
        { id: z[4], name: "tail", from: 20, to: 20 }
      ],
      pieces: [
        P("ellipse", { x: 128, y: 30, rx: 14, ry: 12, rot: 0 }, z[0]), P("rect", { x: 40, y: 35, w: 75, h: 32, rot: 0 }, z[1]),
        P("poly", { pts: [[95, 66], [112, 66], [110, 95], [98, 95]] }, z[2]),
        P("poly", { pts: [[45, 66], [62, 66], [60, 95], [48, 95]] }, z[3]),
        P("poly", { pts: [[40, 40], [18, 28], [16, 33], [40, 48]] }, z[4])
      ]
    };
  }
};
export const PRESET_KEYS = ["empty", ...Object.keys(PRESETS)];

export class HitLocations {

  static list() {
    let raw = [];
    try { raw = game.settings.get(SYSTEM_ID, "bodies") ?? []; } catch (_e) { /* pas encore inscrit */ }
    return (Array.isArray(raw) ? raw : []).map(b => this.clean(b)).filter(b => b.name);
  }

  static async save(list) {
    await game.settings.set(SYSTEM_ID, "bodies", list.map(b => this.clean(b)));
  }

  /** Un nouveau corps (vide ou de départ), nommé. */
  /**
   * @param tr  (facultatif) traduit une clé de zone (« head »…) : la démo
   *            construit ses deux langues sans dépendre de la langue active.
   */
  static create(preset, name, tr = null) {
    const p = PRESETS[preset]?.() ?? { frame: "tall", zones: [], pieces: [] };
    /* Ids propres à ce corps : deux corps de départ ne se mélangent pas. */
    const ids = new Map(p.zones.map(z => [z.id, foundry.utils.randomID()]));
    return this.clean({ name, ...p,
      zones: p.zones.map(z => ({ ...z, id: ids.get(z.id), name: (tr?.(z.name)) || game.i18n.localize(`SBE.Loc.Z_${z.name}`) })),
      pieces: p.pieces.map(x => ({ ...x, zone: ids.get(x.zone) })) });
  }

  /** Corps nettoyé (lecture, import, enregistrement). */
  static clean(b) {
    const s = (v) => String(v ?? "").trim();
    const int = (v, d) => (Number.isFinite(Number(v)) && s(v) !== "" ? Math.round(Number(v)) : d);
    const zones = (Array.isArray(b?.zones) ? b.zones : []).map(z => ({
      id: s(z?.id) || foundry.utils.randomID(),
      name: s(z?.name),
      from: int(z?.from, null), to: int(z?.to, null),
      dmgKey: s(z?.dmgKey), protKey: s(z?.protKey), mult: s(z?.mult), aim: s(z?.aim)
    })).filter(z => z.name);
    const known = new Set(zones.map(z => z.id));
    const pieces = (Array.isArray(b?.pieces) ? b.pieces : []).map(p => {
      const g = cleanPiece(p);
      return g && known.has(s(p?.zone)) ? { ...g, zone: s(p.zone) } : null;
    }).filter(Boolean);
    return {
      id: s(b?.id) || foundry.utils.randomID(),
      name: s(b?.name),
      img: s(b?.img),
      frame: FRAMES[b?.frame] ? b.frame : "tall",
      models: (Array.isArray(b?.models) ? b.models : []).map(s).filter(Boolean),
      odds: ODDS.includes(b?.odds) ? b.odds : "ranges",
      zones, pieces
    };
  }

  /** Le corps d'un personnage : celui de son modèle, sinon le corps
      sans modèle (par défaut). Un objet posé n'a pas de corps. */
  static bodyOf(doc) {
    if (!doc || doc.documentName !== "Actor") return null;
    const list = this.list().filter(b => b.zones.length);
    const tpl = doc.system?.templateId ?? "";
    return list.find(b => tpl && b.models.includes(tpl)) ?? list.find(b => !b.models.length) ?? null;
  }

  /** Surface dessinée de chaque zone. */
  static areas(body) {
    const out = new Map();
    for (const p of body?.pieces ?? []) out.set(p.zone, (out.get(p.zone) ?? 0) + pieceArea(p));
    return out;
  }

  /**
   * La zone touchée.
   * @param value  la valeur tirée (plages) ; ignorée selon la surface
   * @param rnd    tirage 0..1 (surface, et repli d'une valeur hors plage)
   */
  static pick(body, value, rnd = () => CONFIG.Dice.randomUniform()) {
    if (!body?.zones.length) return null;
    if (body.odds === "area") {
      const areas = this.areas(body);
      const total = [...areas.values()].reduce((t, a) => t + a, 0);
      if (total > 0) {
        let r = rnd() * total;
        for (const z of body.zones) { r -= areas.get(z.id) ?? 0; if (r < 0) return z; }
      }
      return body.zones[Math.floor(rnd() * body.zones.length)] ?? null;
    }
    const v = Math.round(Number(value));
    return body.zones.find(z => z.from !== null && z.to !== null && v >= Math.min(z.from, z.to) && v <= Math.max(z.from, z.to)) ?? null;
  }

  /** N zones différentes au hasard (selon les chances du corps). */
  static pickMany(body, n, rnd = () => CONFIG.Dice.randomUniform()) {
    const out = [];
    const all = body?.zones ?? [];
    const want = Math.max(0, Math.min(all.length, Math.floor(Number(n) || 0)));
    let guard = 0;
    while (out.length < want && guard++ < 200) {
      const z = body.odds === "area" ? this.pick(body, 0, rnd)
        : this.pick(body, this.draw(body, rnd), rnd) ?? all[Math.floor(rnd() * all.length)];
      if (z && !out.includes(z)) out.push(z);
    }
    return out;
  }

  /** Un tirage sur les plages du corps (de la plus petite à la plus grande valeur). */
  static draw(body, rnd = () => CONFIG.Dice.randomUniform()) {
    const vals = body.zones.flatMap(z => [z.from, z.to]).filter(v => v !== null);
    if (!vals.length) return 0;
    const lo = Math.min(...vals), hi = Math.max(...vals);
    return lo + Math.floor(rnd() * (hi - lo + 1));
  }

  /**
   * Le dessin du corps en SVG (fenêtre de visée, carte de chat).
   * @param on       id de la zone allumée
   * @param pick     zones cliquables (data-zone)
   * @param cls      classe du SVG
   */
  static svg(body, { on = null, pick = false, cls = "" } = {}) {
    const [w, h] = FRAMES[body.frame] ?? FRAMES.tall;
    const img = body.img ? `<image href="${esc(body.img)}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>` : "";
    const shapes = body.pieces.map(p => {
      const pts = piecePolygon(p).map(([x, y]) => `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`).join(" ");
      const c = zoneColor(body, p.zone);
      return `<polygon points="${pts}" class="sbe-loc-z${p.zone === on ? " is-on" : ""}" ${pick ? `data-zone="${esc(p.zone)}"` : ""} style="--z:${c}"/>`;
    }).join("");
    return `<svg class="sbe-loc-svg ${cls}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${img}${shapes}</svg>`;
  }
}
