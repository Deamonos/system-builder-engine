/**
 * SBE — TRACES AU SOL (sang, boue, huile, pas…)
 *
 * Le MJ crée des TYPES de traces (réglage « traceTypes ») ; le sang est
 * fourni prêt à l'emploi. Par type :
 *   - conditions par clé (« hp < 80 % du max ») ;
 *   - EMPREINTES : une liste de règles commune à tous les types (réglage
 *     « traceFootprints ») — modèle, personnage, clé ou objet possédé →
 *     une empreinte ; le type donne la couleur, la règle la forme ;
 *   - IMPACT : quand la clé surveillée BAISSE (ex. hp), des taches
 *     apparaissent sous le pion (plus grosses si la perte est forte) ;
 *   - TRAÎNÉE : un pion qui se déplace pendant que la condition est
 *     vraie laisse des taches tous les N cases ;
 *   - formes (dessinées par SBE à la volée, ou images du MJ), taille,
 *     quantité, couleur (clé de couleur de l'acteur — `blood` pour le
 *     sang — sinon couleur du type) et transparence ;
 *   - gardées dans la scène (drapeau de la scène, tout le monde les voit,
 *     elles restent) ou éphémères (jusqu'au rechargement) ;
 *   - disparition en temps réel ou en temps du monde (ou jamais).
 * Les murs arrêtent les traces : la forme est découpée au moment de la
 * tache (porte ouverte : elle passe ; fermée : elle s'arrête), puis figée.
 *
 * Calcul et écriture : MJ principal. Dessin : chaque client, dans le
 * groupe principal du canevas, sous les pions et au-dessus des tuiles.
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { onSocketMessage, emitSocket, isPrimaryGM } from "../../helpers/socket.mjs";
import { docScope } from "../../builder/doc-context.mjs";
import { rollField } from "../../builder/field-roll.mjs";
import { COND_OPS, checkKeyCondition } from "../../helpers/key-condition.mjs";
import { listImages } from "../../helpers/image-folder.mjs";

const SETTING = "traceTypes";
const OPTIONS = "traceOptions";
const FLAG = "traces";
export const BUILTIN_SHAPES = ["splat", "burst", "pool", "drops", "smear", "footprint"];
/* Empreintes dessinées par SBE (ou le chemin d'une image). */
export const FOOTPRINTS = ["boot", "bare", "hoof", "paw", "canine", "bear", "bird", "insect", "reptile",
  "dragon", "tentacle", "slime", "robot", "mech", "alien", "tread", "tire", "motorbike", "wheel",
  "snake", "horse", "webbed", "spider", "rodent", "skeleton", "cleat", "snowshoe", "ski"];
export { COND_OPS };
/* Critères d'une règle d'empreinte. */
export const FP_KINDS = ["template", "actor", "key", "item"];
const FP_SETTING = "traceFootprints";
/* Modes de déplacement qui ne laissent pas de traces au sol. */
const AIR_ACTIONS = new Set(["fly", "swim", "burrow", "blink"]);

/**
 * Géométrie d'une PAIRE d'empreintes (gauche, droite), l'avant vers +x
 * (sens de la marche), à l'échelle R. Primitives : c (cercle), e
 * (ellipse), p (polygone). Utilisée par le dessin sur la scène ET par
 * l'aperçu de la configuration (une seule source).
 */
export function footprintPrims(fp, R, foot = 0) {
  const out = [];
  const C = (x, y, r) => out.push({ t: "c", x, y, r });
  const E = (x, y, rx, ry) => out.push({ t: "e", x, y, rx, ry });
  const P = (pts) => out.push({ t: "p", pts });
  const line = (x1, y1, x2, y2, w) => {
    const a = Math.atan2(y2 - y1, x2 - x1) + Math.PI / 2;
    const dx = Math.cos(a) * w / 2, dy = Math.sin(a) * w / 2;
    P([x1 + dx, y1 + dy, x2 + dx, y2 + dy, x2 - dx, y2 - dy, x1 - dx, y1 - dy]);
  };
  const rect = (x, y, w, h) => P([x - w / 2, y - h / 2, x + w / 2, y - h / 2, x + w / 2, y + h / 2, x - w / 2, y + h / 2]);
  /* Anneau elliptique (contour seul), en segments. */
  const ring = (cx, cy, rx, ry, w, a0 = 0, a1 = Math.PI * 2, n = 20) => {
    let px = null, py = null;
    for (let i = 0; i <= n; i++) {
      const t = a0 + (i / n) * (a1 - a0), x = cx + Math.cos(t) * rx, y = cy + Math.sin(t) * ry;
      if (px !== null) line(px, py, x, y, w);
      px = x; py = y;
    }
  };
  /* Ellipse tournée (polygone). */
  const RE = (cx, cy, rx, ry, a) => {
    const pts = [], c = Math.cos(a), sn = Math.sin(a);
    for (let i = 0; i < 14; i++) {
      const t = (i / 14) * Math.PI * 2, u = Math.cos(t) * rx, v = Math.sin(t) * ry;
      pts.push(cx + u * c - v * sn, cy + u * sn + v * c);
    }
    P(pts);
  };
  /* Doigt effilé : large à la base, pointu (griffe) au bout. */
  const toe = (x1, y1, x2, y2, w) => {
    const a = Math.atan2(y2 - y1, x2 - x1) + Math.PI / 2;
    const dx = Math.cos(a) * w / 2, dy = Math.sin(a) * w / 2;
    const mx = x1 + (x2 - x1) * 0.7, my = y1 + (y2 - y1) * 0.7;
    P([x1 + dx, y1 + dy, mx + dx * 0.8, my + dy * 0.8, x2, y2, mx - dx * 0.8, my - dy * 0.8, x1 - dx, y1 - dy]);
  };
  /* Traces continues (une bande, pas une paire). */
  if (fp === "tread") {
    /* Chenilles de char : deux larges bandes de patins rectangulaires
       séparés par un mince jour, reliés par un axe au milieu. */
    for (const side of [-1, 1]) {
      const y = side * R * 0.36, hw = R * 0.17;
      for (let x = -R * 0.62; x < R * 0.6; x += R * 0.13) {
        rect(x + R * 0.05, y, R * 0.1, hw * 2);
      }
      line(-R * 0.62, y, R * 0.62, y, R * 0.04);
    }
    return out;
  }
  if (fp === "tire") {
    /* Pneus de voiture modernes : de larges rainures droites séparent
       deux nervures centrales (lamelles en biais, en V directionnel) et
       deux épaulements à pavés. */
    for (const side of [-1, 1]) {
      const y = side * R * 0.38, hw = R * 0.16;
      /* Nervures centrales presque continues : fines lamelles en V. */
      for (let x = -R * 0.62; x < R * 0.58; x += R * 0.09) {
        const x2 = x + R * 0.078;
        for (const k of [-1, 1]) {
          const y0 = y + k * hw * 0.1, y1 = y + k * hw * 0.45, s0 = R * 0.05;
          P([x, y0, x2, y0, x2 + s0, y1, x + s0, y1]);
        }
      }
      /* Épaulements : pavés séparés par de larges entailles. */
      for (let x = -R * 0.58; x < R * 0.6; x += R * 0.13) {
        rect(x, y - hw * 0.82, R * 0.085, hw * 0.28);
        rect(x, y + hw * 0.82, R * 0.085, hw * 0.28);
      }
    }
    return out;
  }
  if (fp === "motorbike") {
    /* Pneu de moto : une seule bande étroite au milieu, crampons en
       quinconce de part et d'autre d'une rainure. */
    const hw = R * 0.09;
    line(-R * 0.62, -hw, R * 0.62, -hw, R * 0.025);
    line(-R * 0.62, hw, R * 0.62, hw, R * 0.025);
    for (let i = 0, x = -R * 0.58; x <= R * 0.56; i++, x += R * 0.09) {
      const y = (i % 2 ? 1 : -1) * hw * 0.45;
      rect(x, y, R * 0.06, hw * 0.7);
    }
    return out;
  }
  if (fp === "wheel") {
    for (const side of [-1, 1]) rect(0, side * R * 0.35, R * 1.1, R * 0.07);
    return out;
  }
  if (fp === "slime") {
    /* Une coulée visqueuse : bande ondulée aux bords lisses, plus large
       au milieu, avec quelques gouttes détachées sur les côtés. */
    const n = 14, top = [], bot = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = -R * 0.62 + t * R * 1.24;
      const w = R * (0.13 + 0.09 * Math.sin(t * Math.PI) + 0.03 * Math.sin(t * 9.1));
      const c = Math.sin(t * 5.3) * R * 0.05;
      top.push(x, c - w); bot.unshift(x, c + w);
    }
    P([...top, ...bot]);
    C(-R * 0.62, 0, R * 0.12); C(R * 0.62, Math.sin(5.3) * R * 0.05, R * 0.1);
    for (const [x, y, r] of [[-0.3, 0.33, 0.045], [0.05, -0.36, 0.035], [0.35, 0.3, 0.03], [-0.05, 0.4, 0.022], [0.45, -0.28, 0.025]]) C(x * R, y * R, r * R);
    return out;
  }
  if (fp === "tentacle") {
    /* Un tentacule traîné : bande ondulante qui s'affine, bordée de
       ventouses de plus en plus petites. */
    const n = 16, top = [], bot = [], mid = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = -R * 0.62 + t * R * 1.24;
      const c = Math.sin(t * Math.PI * 2) * R * 0.14, w = R * (0.1 - t * 0.075);
      top.push(x, c - w); bot.unshift(x, c + w); mid.push([x, c, w]);
    }
    P([...top, ...bot]);
    mid.forEach(([x, c, w], i) => {
      if (i % 2 || i > n - 2) return;
      const rr = Math.max(R * 0.018, w * 0.45);
      C(x, c - w - rr * 1.6, rr); C(x + R * 0.04, c + w + rr * 1.6, rr);
    });
    return out;
  }
  if (fp === "snake") {
    /* Serpent : une ondulation en S continue, de largeur égale. */
    let px = null, py = null;
    for (let i = 0; i <= 24; i++) {
      const t = i / 24, x = -R * 0.62 + t * R * 1.24, y = Math.sin(t * Math.PI * 2) * R * 0.18;
      if (px !== null) line(px, py, x, y, R * 0.09);
      C(x, y, R * 0.045);
      px = x; py = y;
    }
    return out;
  }
  if (fp === "spider") {
    /* Araignée : quatre pattes de chaque côté, en éventail (avant vers
       l'avant, arrière vers l'arrière), des points au bout. */
    for (const side of [-1, 1]) {
      [[-0.3, -0.7], [-0.1, -0.25], [0.1, 0.25], [0.3, 0.7]].forEach(([dx, a]) => {
        const x = dx * R + (side > 0 ? R * 0.06 : 0), y = side * R * 0.2;
        const ex = x + Math.sin(a) * R * 0.1, ey = y + side * Math.cos(a) * R * 0.1;
        line(x, y, ex, ey, R * 0.025); C(ex, ey, R * 0.025);
      });
    }
    return out;
  }
  if (fp === "ski") {
    /* Skis : deux longues bandes fines, et les points des bâtons sur les
       côtés. */
    for (const side of [-1, 1]) {
      line(-R * 0.62, side * R * 0.14, R * 0.62, side * R * 0.14, R * 0.07);
      C(side > 0 ? -R * 0.2 : R * 0.25, side * R * 0.42, R * 0.04);
    }
    return out;
  }
  if (fp === "insect") {
    /* Piste d'insecte : la trace fine du corps, et de chaque côté trois
       pattes en biais vers l'arrière, en quinconce. */
    const n = 12, wav = [];
    for (let i = 0; i <= n; i++) { const t = i / n; wav.push([-R * 0.62 + t * R * 1.24, Math.sin(t * Math.PI * 3) * R * 0.025]); }
    for (let i = 0; i < n; i++) line(wav[i][0], wav[i][1], wav[i + 1][0], wav[i + 1][1], R * 0.025);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        const x = -R * 0.5 + i * R * 0.2 + (side > 0 ? R * 0.1 : 0);
        const y = side * R * 0.2;
        line(x, y, x - R * 0.08, y + side * R * 0.07, R * 0.035);
      }
    }
    return out;
  }
  /* Une paire, ou un seul pied (pas alternés : -1 gauche, 1 droite). */
  for (const side of (foot ? [foot] : [-1, 1])) {
    const ox = foot ? 0 : side * R * 0.4, oy = side * R * (foot ? 0.22 : 0.38);
    switch (fp) {
      case "bare": {
        /* Talon, voûte fine côté extérieur, avant-pied large, cinq orteils
           du gros (intérieur) au petit (extérieur). `side` = extérieur. */
        {
          const sole = [[-0.42, 0], [-0.4, 0.085], [-0.3, 0.125], [-0.15, 0.125], [0, 0.135], [0.12, 0.14], [0.2, 0.115],
            [0.245, 0.045], [0.245, -0.04], [0.21, -0.11], [0.12, -0.15], [0.03, -0.13], [-0.07, -0.055],
            [-0.18, -0.045], [-0.3, -0.095], [-0.4, -0.075]];
          P(sole.flatMap(([u, v]) => [ox + u * R, oy + side * v * R]));
        }
        for (const [dx, dy, r] of [[0.31, -0.085, 0.058], [0.33, 0.0, 0.04], [0.31, 0.06, 0.035], [0.275, 0.11, 0.031], [0.225, 0.15, 0.027]])
          C(ox + dx * R, oy + side * dy * R, r * R);
        break;
      }
      case "hoof":
        E(ox + R * 0.05, oy - R * 0.08, R * 0.2, R * 0.08); E(ox + R * 0.05, oy + R * 0.08, R * 0.2, R * 0.08); break;
      case "paw": {
        /* Félin : coussinet large à trois lobes à l'arrière, quatre doigts
           ovales en arc asymétrique, pas de griffes (rétractées). */
        P([ox + R * 0.06, oy - R * 0.08, ox + R * 0.06, oy + R * 0.08, ox - R * 0.1, oy + R * 0.16, ox - R * 0.1, oy - R * 0.16]);
        C(ox + R * 0.05, oy - R * 0.045, R * 0.045); C(ox + R * 0.05, oy + R * 0.045, R * 0.045);
        for (const dy of [-0.1, 0, 0.1]) C(ox - R * 0.12, oy + dy * R, R * 0.065);
        for (const [dx, dy] of [[0.13, -0.17], [0.21, -0.065], [0.21, 0.05], [0.14, 0.16]]) E(ox + dx * R, oy + side * dy * R, R * 0.06, R * 0.05);
        break;
      }
      case "canine": {
        /* Chien, loup : petit coussinet triangulaire, quatre doigts — les
           deux du milieu en avant et serrés —, une griffe devant chacun. */
        P([ox + R * 0.07, oy, ox - R * 0.1, oy - R * 0.13, ox - R * 0.15, oy - R * 0.06, ox - R * 0.12, oy, ox - R * 0.15, oy + R * 0.06, ox - R * 0.1, oy + R * 0.13]);
        C(ox - R * 0.05, oy, R * 0.09);
        for (const [dx, dy] of [[0.12, -0.13], [0.22, -0.045], [0.22, 0.045], [0.12, 0.13]]) {
          E(ox + dx * R, oy + dy * R, R * 0.055, R * 0.042);
          C(ox + (dx + 0.09) * R, oy + dy * 1.15 * R, R * 0.022);
        }
        break;
      }
      case "bear":
        /* Ours : large coussinet plus large que long, cinq doigts presque
           alignés juste devant, et des griffes détachées encore devant. */
        E(ox, oy, R * 0.13, R * 0.22);
        for (let i = 0; i < 5; i++) {
          const y = oy + (i - 2) * R * 0.105, x = ox + R * 0.21 - Math.abs(i - 2) * Math.abs(i - 2) * R * 0.018;
          const rr = R * (i === 0 || i === 4 ? 0.04 : 0.05);
          E(x, y, rr * 1.15, rr);
          line(x + R * 0.08, y, x + R * 0.16, y, R * 0.022);
        }
        break;
      case "bird": {
        /* Oiseau : trois doigts fins vers l'avant, un doigt arrière plus
           court, des articulations marquées et une griffe au bout. */
        const jx = ox - R * 0.02;
        C(jx, oy, R * 0.035);
        for (const [a, l] of [[-0.6, 0.3], [0, 0.36], [0.6, 0.3], [Math.PI, 0.17]]) {
          const ex = jx + Math.cos(a) * R * l, ey = oy + Math.sin(a) * R * l;
          line(jx, oy, ex, ey, R * 0.035);
          C(jx + Math.cos(a) * R * l * 0.5, oy + Math.sin(a) * R * l * 0.5, R * 0.026);
          toe(ex, ey, ex + Math.cos(a) * R * 0.06, ey + Math.sin(a) * R * 0.06, R * 0.03);
        }
        break;
      }
      case "reptile":
        /* Lézard : petite paume, cinq doigts fins et longs écartés en main,
           pointe de griffe au bout. */
        E(ox - R * 0.02, oy, R * 0.09, R * 0.08);
        for (const [a, l] of [[-1.25, 0.2], [-0.6, 0.27], [0, 0.3], [0.6, 0.27], [1.3, 0.18]]) {
          const ex = ox + Math.cos(a) * R * l, ey = oy + Math.sin(a) * R * l;
          line(ox, oy, ex, ey, R * 0.035); C(ex, ey, R * 0.028);
        }
        break;
      case "dragon": {
        /* Dragon : gros talon, trois longs doigts à deux phalanges
           terminés par une griffe crochue, un ergot côté intérieur. */
        E(ox - R * 0.2, oy, R * 0.16, R * 0.15);
        for (const a of [-0.55, 0, 0.55]) {
          const ca = Math.cos(a), sa = Math.sin(a), bx = ox - R * 0.08, by = oy + sa * R * 0.04;
          RE(bx + ca * R * 0.14, by + sa * R * 0.14, R * 0.11, R * 0.075, a);
          RE(bx + ca * R * 0.31, by + sa * R * 0.31, R * 0.09, R * 0.06, a);
          const tx = bx + ca * R * 0.37, ty = by + sa * R * 0.37;
          toe(tx, ty, tx + ca * R * 0.15, ty + sa * R * 0.15, R * 0.075);
        }
        toe(ox - R * 0.26, oy - side * R * 0.1, ox - R * 0.42, oy - side * R * 0.17, R * 0.06);
        break;
      }
      case "robot":
        /* Pied mécanique : talon carré, plante, deux orteils plats. */
        rect(ox - R * 0.3, oy, R * 0.16, R * 0.24); rect(ox, oy, R * 0.32, R * 0.2);
        rect(ox + R * 0.26, oy - R * 0.07, R * 0.16, R * 0.07); rect(ox + R * 0.26, oy + R * 0.07, R * 0.16, R * 0.07); break;
      case "mech":
        /* Pied de mécha : moyeu rond, trois branches avant et une arrière,
           chacune terminée par un patin carré. */
        C(ox, oy, R * 0.13);
        for (const a of [-0.75, 0, 0.75, Math.PI]) {
          const ex = ox + Math.cos(a) * R * 0.34, ey = oy + Math.sin(a) * R * 0.34;
          line(ox, oy, ex, ey, R * 0.08);
          rect(ex, ey, R * 0.12, R * 0.12);
        }
        break;
      case "alien":
        /* Plante étroite et longue, deux longs doigts en V à bout rond,
           un petit doigt arrière — rien d'un oiseau. */
        E(ox - R * 0.06, oy, R * 0.22, R * 0.08);
        line(ox + R * 0.1, oy, ox + R * 0.42, oy - R * 0.14, R * 0.06); C(ox + R * 0.44, oy - R * 0.15, R * 0.055);
        line(ox + R * 0.1, oy, ox + R * 0.42, oy + R * 0.14, R * 0.06); C(ox + R * 0.44, oy + R * 0.15, R * 0.055);
        C(ox - R * 0.32, oy + side * R * 0.08, R * 0.04);
        break;
      case "horse":
        /* Cheval ferré : un fer en U ouvert vers l'arrière, la fourchette
           en triangle au milieu. */
        ring(ox, oy, R * 0.17, R * 0.15, R * 0.06, -2.3, 2.3, 16);
        P([ox - R * 0.12, oy - R * 0.05, ox + R * 0.06, oy, ox - R * 0.12, oy + R * 0.05]);
        break;
      case "webbed": {
        /* Palmé : trois doigts en éventail réunis par la palmure (bord
           creusé entre les doigts), un petit talon. */
        const tips = [-0.6, 0, 0.6].map(a => [ox + Math.cos(a) * R * 0.32, oy + Math.sin(a) * R * 0.32]);
        const mid = [-0.3, 0.3].map(a => [ox + Math.cos(a) * R * 0.22, oy + Math.sin(a) * R * 0.22]);
        P([ox - R * 0.05, oy, ...tips[0], ...mid[0], ...tips[1], ...mid[1], ...tips[2]]);
        for (const [x, y] of tips) { line(ox, oy, x, y, R * 0.04); C(x, y, R * 0.025); }
        C(ox - R * 0.08, oy, R * 0.05);
        break;
      }
      case "rodent": {
        /* Rat : comme une petite main — paume allongée qui s'affine vers
           le talon, cinq doigts fins et longs écartés (le pouce plus bas,
           côté intérieur), une griffe pointue au bout de chacun. */
        const inn = -side;
        P([ox - R * 0.24, oy - R * 0.025, ox - R * 0.08, oy - R * 0.05, ox + R * 0.03, oy - R * 0.075, ox + R * 0.05, oy,
           ox + R * 0.03, oy + R * 0.075, ox - R * 0.08, oy + R * 0.05, ox - R * 0.24, oy + R * 0.025, ox - R * 0.27, oy]);
        const fingers = [[-0.55, 0.15, -0.06], [-0.18, 0.19, -0.025], [0.18, 0.19, 0.025], [0.55, 0.15, 0.06]].map(([a, l, dy]) => [a, l, dy]);
        fingers.push([inn * 1.25, 0.12, inn * 0.06]);
        fingers.forEach(([a, l, dy], i) => {
          const bx = ox + R * (i === 4 ? -0.05 : 0.04), by = oy + dy * R;
          const ex = bx + Math.cos(a) * R * l, ey = by + Math.sin(a) * R * l;
          RE((bx + ex) / 2, (by + ey) / 2, R * l * 0.5, R * 0.02, a);
          toe(ex, ey, ex + Math.cos(a) * R * 0.06, ey + Math.sin(a) * R * 0.06, R * 0.018);
        });
        break;
      }
      case "skeleton": {
        /* Squelette : chaque os séparé de son voisin par un petit jour —
           calcanéum, os du tarse, cinq métatarses, puis deux phalanges par
           doigt (le gros orteil plus épais, à l'intérieur). */
        RE(ox - R * 0.33, oy, R * 0.08, R * 0.055, 0);
        for (const dy of [-0.05, 0.05]) C(ox - R * 0.19, oy + dy * R, R * 0.04);
        C(ox - R * 0.12, oy - side * R * 0.07, R * 0.035);
        for (let i = 0; i < 5; i++) {
          const y0 = oy - side * (0.06 - i * 0.03) * R, y1 = oy - side * (0.14 - i * 0.07) * R;
          const w = R * (i === 0 ? 0.034 : 0.02);
          line(ox - R * 0.08, y0, ox + R * 0.12, y1, w);
          const len = i === 0 ? 0.07 : 0.06 - i * 0.004;
          line(ox + R * 0.15, y1, ox + R * (0.15 + len), y1, w * 0.9);
          if (i) line(ox + R * (0.18 + len), y1, ox + R * (0.21 + len), y1, w * 0.8);
          else C(ox + R * (0.18 + len + 0.015), y1, w * 0.45);
        }
        break;
      }
      case "cleat": {
        /* Rangers (semelle crantée lourde) : des crampons rectangulaires
           tout le long du bord, comme des dents ; au milieu de l'avant-pied
           une colonne de gros blocs ; un rond sous la cambrure ; le talon
           séparé, crampons sur le pourtour et blocs au centre. */
        const prof = [[-0.52, 0], [-0.5, 0.1], [-0.4, 0.13], [-0.28, 0.12], [-0.15, 0.1], [0, 0.135], [0.18, 0.16], [0.32, 0.14], [0.42, 0.08], [0.45, 0]];
        const half = (u) => {
          for (let i = 0; i < prof.length - 1; i++) {
            const [u0, v0] = prof[i], [u1, v1] = prof[i + 1];
            if (u >= u0 && u <= u1) return v0 + (v1 - v0) * (u - u0) / (u1 - u0);
          }
          return 0;
        };
        const X = (u) => ox + u * R, Y = (v) => oy + side * v * R;
        /* Dents du bord : avant-pied et talon. */
        const teeth = (u0, u1, step) => {
          for (let u = u0; u <= u1 + 1e-6; u += step) {
            const w = half(u);
            for (const k of [-1, 1]) rect(X(u), Y(k * (w - 0.048)), R * 0.047, R * 0.09);
          }
        };
        teeth(-0.06, 0.34, 0.062);
        teeth(-0.465, -0.3, 0.055);
        /* Bout : dents en éventail. */
        for (const a of [-0.9, -0.45, 0, 0.45, 0.9]) {
          const cx = X(0.38) + Math.cos(a) * R * 0.04, cy = oy + Math.sin(a) * R * 0.07;
          line(cx, cy, cx + Math.cos(a) * R * 0.05, cy + Math.sin(a) * R * 0.05, R * 0.035);
        }
        /* Colonne centrale de l'avant-pied et du talon. */
        for (const u of [-0.02, 0.1, 0.22, 0.32]) P([X(u - 0.045), oy, X(u), oy - R * 0.04, X(u + 0.045), oy, X(u), oy + R * 0.04]);
        for (const u of [-0.42, -0.34]) rect(X(u), oy, R * 0.06, R * 0.05);
        /* Talon : bord arrière. */
        for (const v of [-0.055, 0, 0.055]) rect(X(-0.5), Y(v), R * 0.03, R * 0.045);
        /* Rond sous la cambrure. */
        C(X(-0.18), oy, R * 0.045);
        break;
      }
      case "snowshoe":
        /* Raquette : grand cadre ovale, croisillons de laçage, la botte
           au milieu. */
        ring(ox, oy, R * 0.34, R * 0.15, R * 0.035);
        for (const k of [-0.18, 0, 0.18]) line(ox + k * R - R * 0.06, oy - R * 0.13, ox + k * R + R * 0.06, oy + R * 0.13, R * 0.018);
        for (const k of [-0.18, 0, 0.18]) line(ox + k * R + R * 0.06, oy - R * 0.13, ox + k * R - R * 0.06, oy + R * 0.13, R * 0.018);
        E(ox + R * 0.02, oy, R * 0.12, R * 0.06);
        break;
      default: /* boot : semelle + talon */
        E(ox + R * 0.25, oy, R * 0.42, R * 0.2); E(ox - R * 0.42, oy, R * 0.22, R * 0.16);
    }
  }
  /* Lézard : la queue traînée entre les pattes. */
  if (fp === "reptile") {
    let px = -R * 0.6, py = 0;
    for (let i = 1; i <= 12; i++) {
      const t = i / 12, x = -R * 0.6 + t * R * 1.2, y = Math.sin(t * Math.PI * 2) * R * 0.07;
      line(px, py, x, y, R * (0.045 - t * 0.02)); px = x; py = y;
    }
  }
  return out;
}

/** Aperçu SVG d'une empreinte (fenêtre de configuration). */
export function footprintSVG(fp, size = 56) {
  const R = 100;
  const prims = footprintPrims(fp, R);
  /* Cadre ajusté à la forme (vers le haut : l'avant pointe en haut), pour
     que chaque empreinte tienne entière dans sa case. */
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (x, y, rx = 0, ry = rx) => { x0 = Math.min(x0, x - rx); x1 = Math.max(x1, x + rx); y0 = Math.min(y0, y - ry); y1 = Math.max(y1, y + ry); };
  for (const pr of prims) {
    if (pr.t === "c") grow(pr.x, pr.y, pr.r);
    else if (pr.t === "e") grow(pr.x, pr.y, pr.rx, pr.ry);
    else for (let i = 0; i < pr.pts.length; i += 2) grow(pr.pts[i], pr.pts[i + 1]);
  }
  const f = (v) => v.toFixed(1);
  const parts = prims.map(pr => {
    if (pr.t === "c") return `<circle cx="${f(pr.x)}" cy="${f(pr.y)}" r="${f(pr.r)}"/>`;
    if (pr.t === "e") return `<ellipse cx="${f(pr.x)}" cy="${f(pr.y)}" rx="${f(pr.rx)}" ry="${f(pr.ry)}"/>`;
    return `<polygon points="${pr.pts.map(f).join(" ")}"/>`;
  }).join("");
  /* Rotation -90° : (x, y) → (y, -x). Carré centré, un peu de marge. */
  const cx = (y0 + y1) / 2, cy = -(x0 + x1) / 2;
  const side = Math.max(x1 - x0, y1 - y0) * 1.1 || R;
  return `<svg viewBox="${f(cx - side / 2)} ${f(cy - side / 2)} ${f(side)} ${f(side)}" width="${size}" height="${size}" fill="currentColor"><g transform="rotate(-90)">${parts}</g></svg>`;
}

/* ------------------------------------------------------------ */
/*  Hasard reproductible (même tache chez tous les clients)       */
/* ------------------------------------------------------------ */
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}

/* ------------------------------------------------------------ */
/*  Giclées de sang : géométrie (une seule source pour le dessin) */
/* ------------------------------------------------------------ */
const TAU = Math.PI * 2;

/**
 * Contour « vivant » : un cercle dont le rayon ondule doucement sur
 * plusieurs fréquences (bords lisses, comme un liquide), avec un grain
 * très léger. `amp` : force des ondulations. Rend les points ET, si
 * `E` est donné, le même contour élargi de E (la bordure, qui suit
 * exactement le corps).
 */
function blobPts(r, cx, cy, rad, { n = 80, amp = 1, E = 0 } = {}) {
  const H = [2, 3, 4, 5, 7, 9, 12].map(f => [f, (0.1 / f ** 0.45) * amp * (0.3 + r() * 1.3), r() * TAU]);
  const pts = [], rim = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    let k = 1;
    for (const [f, am, ph] of H) k += am * Math.sin(a * f + ph);
    k += (r() - 0.5) * 0.012 * amp;
    const d = rad * Math.max(0.3, k), ca = Math.cos(a), sa = Math.sin(a);
    pts.push(cx + ca * d, cy + sa * d);
    if (E) rim.push(cx + ca * (d + E), cy + sa * (d + E));
  }
  return E ? { pts, rim } : pts;
}

/** Ovale irrégulier, allongé `el` fois dans la direction `ang`. */
function ovalPts(r, cx, cy, rad, el, ang, { n = 28, amp = 0.8 } = {}) {
  const H = [2, 3, 5, 7].map(f => [f, (0.09 / f ** 0.4) * amp * (0.3 + r() * 1.2), r() * TAU]);
  const ca = Math.cos(ang), sa = Math.sin(ang), pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    let k = 1;
    for (const [f, am, ph] of H) k += am * Math.sin(a * f + ph);
    const u = Math.cos(a) * rad * el * k, v = Math.sin(a) * rad * k;
    pts.push(cx + u * ca - v * sa, cy + u * sa + v * ca);
  }
  return pts;
}

/**
 * Goutte projetée : un ovale irrégulier allongé dans le sens du vol
 * (angle `a`, distance `d` depuis `ox, oy`), et parfois un filament
 * très fin qui traîne derrière, de plus en plus mince.
 */
function drop(r, out, a, d, rd, tone, ox = 0, oy = 0) {
  const el = 1 + r() ** 1.5 * 1.8;
  const ca = Math.cos(a), sa = Math.sin(a), cx = ox + ca * d, cy = oy + sa * d;
  out.push({ t: "p", pts: ovalPts(r, cx, cy, rd, el, a), tone });
  if (r() < 0.45) {
    const len = rd * (1.5 + r() * 4), w0 = rd * (0.22 + r() * 0.18), k = Math.max(3, Math.round(len / (w0 * 0.8)));
    for (let i = 1; i <= k; i++) {
      const t = i / k, w = w0 * (1 - t) + rd * 0.03;
      out.push({ t: "c", x: cx - ca * (rd * el * 0.8 + len * t), y: cy - sa * (rd * el * 0.8 + len * t), r: w, tone });
    }
  }
}

/**
 * Doigt de sang : un cou fin qui part du bord (angle `a`, distance `d0`)
 * et finit en bulbe rond — le sang qui déborde de la flaque.
 */
function finger(r, out, a, d0, len, w, tone, { bulb = true, taper = 0.35, curve = 0.6, bulbSize = 1.3 } = {}) {
  const ca = Math.cos(a), sa = Math.sin(a), wob = r() * TAU;
  const k = Math.max(3, Math.round(len / (w * 0.5)));
  for (let i = 0; i <= k; i++) {
    const t = i / k, bend = Math.sin(t * 2.5 + wob) * w * curve * t;
    const d = d0 + len * t, ww = Math.max(w * 0.06, w * (1 - taper * t + 0.15 * Math.sin(t * 7 + wob)) * (0.9 + r() * 0.2));
    out.push({ t: "c", x: ca * d - sa * bend, y: sa * d + ca * bend, r: ww, tone });
  }
  if (!bulb) return;
  const bend = Math.sin(2.5 + wob) * w * curve, d = d0 + len + w * 0.3;
  out.push({ t: "p", pts: ovalPts(r, ca * d - sa * bend, sa * d + ca * bend, w * bulbSize * (1 + r() * 0.6), 1 + r() * 0.3, a, { n: 24, amp: 0.6 }), tone });
}

/** Grappe de gouttes fondues (cœur, lobes) : bordure puis corps. */
function mass(r, out, blobs, M, E, n = 96) {
  const rims = [], bodies = [];
  for (const b of blobs) {
    const [x, y] = M(b.u, b.v);
    const { pts, rim } = blobPts(r, x, y, b.rad, { n, amp: b.amp ?? 1, E });
    rims.push({ t: "p", pts: rim, tone: "rim" });
    bodies.push({ t: "p", pts, tone: "body" });
  }
  out.push(...rims, ...bodies);
}

/** Caillots sombres et reflet humide sur une masse de rayon `core`. */
function poolDetail(r, out, core, M, clots) {
  for (let i = 0; i < clots; i++) {
    const [x, y] = M(r() * core * 1.2 - core * 0.3, (r() - 0.5) * core * 0.8);
    out.push({ t: "p", pts: blobPts(r, x, y, core * (0.1 + r() * 0.2), { n: 36, amp: 1.4 }), tone: "dark" });
  }
  const wa = r() * TAU, cxw = Math.cos(wa) * core * 0.3, cyw = Math.sin(wa) * core * 0.3, rw = core * 0.3;
  const wet = [];
  for (let j = 0; j <= 14; j++) { const t = wa + Math.PI / 2 - 0.7 + (j / 14) * 1.4; wet.push(cxw + Math.cos(t) * rw, cyw + Math.sin(t) * rw); }
  for (let j = 14; j >= 0; j--) { const t = wa + Math.PI / 2 - 0.7 + (j / 14) * 1.4; wet.push(cxw + Math.cos(t) * rw * 0.8 + Math.cos(wa) * rw * 0.1, cyw + Math.sin(t) * rw * 0.8 + Math.sin(wa) * rw * 0.1); }
  out.push({ t: "p", pts: wet, tone: "wet" });
}

/**
 * Gerbe (forme « burst ») : un cœur compact et de longues pointes
 * effilées qui rayonnent dans tous les sens (plus longues dans le sens
 * du coup), certaines à bout rond, des gouttes allongées dans leur
 * prolongement et une bruine légère.
 */
export function burstPrims(r, R, dir = null) {
  const out = [];
  dir = dir ?? r() * TAU;
  const M = frame(dir);
  const core = R * (0.22 + r() * 0.1), E = R * 0.025;
  const blobs = [{ u: 0, v: 0, rad: core, amp: 1 }];
  const nb = 2 + Math.floor(r() * 4);
  for (let i = 0; i < nb; i++) {
    const a = r() * TAU, d = core * (0.4 + r() * 0.5);
    blobs.push({ u: Math.cos(a) * d, v: Math.sin(a) * d, rad: core * (0.3 + r() * 0.45), amp: 1.3 });
  }
  mass(r, out, blobs, M, E);
  /* Pointes : longues, effilées, un peu courbes ; vers l'avant, plus longues. */
  const spikes = 7 + Math.floor(r() * 8);
  for (let i = 0; i < spikes; i++) {
    const a = r() * TAU;
    const fwd = Math.max(0, Math.cos(a - dir));
    const len = R * (0.15 + r() ** 1.4 * 0.9) * (0.7 + fwd * 0.8);
    /* Large à la base (fondue dans le cœur), de plus en plus fine. */
    const w = core * (0.18 + r() ** 1.3 * 0.3);
    const bulb = r() < 0.3;
    finger(r, out, a, core * 0.35, len + core * 0.4, w, "body", { bulb, taper: bulb ? 0.7 : 0.96, curve: 0.3 + r() * 0.8, bulbSize: 0.5 });
    /* Une goutte détachée dans le prolongement de la pointe. */
    if (r() < 0.6) drop(r, out, a + (r() - 0.5) * 0.2, core + len + R * (0.08 + r() * 0.5), R * (0.01 + r() ** 1.5 * 0.045), "edge");
  }
  poolDetail(r, out, core, M, 1 + Math.floor(r() * 2));
  const drops = 10 + Math.floor(r() * 14);
  for (let i = 0; i < drops; i++) {
    drop(r, out, r() * TAU, core + R * (0.2 + r() ** 1.5 * 2), R * (0.008 + r() ** 1.8 * 0.04), "edge");
  }
  const mist = 60 + Math.floor(r() * 90);
  for (let i = 0; i < mist; i++) {
    const a = r() * TAU, d = core + R * 2.2 * r() ** 1.6;
    out.push({ t: "c", x: Math.cos(a) * d, y: Math.sin(a) * d, r: R * (0.004 + r() ** 2.2 * 0.016), tone: "mist" });
  }
  return out;
}

/**
 * Flaque (forme « pool ») : une mare large et calme, faite de gros
 * lobes fondus, avec sa bordure, ses caillots et son reflet, un ou deux
 * doigts qui s'échappent et quelques gouttes tout près. Pas de bruine.
 */
export function poolPrims(r, R) {
  const out = [];
  const dir = r() * TAU;
  const M = frame(dir);
  const core = R * (0.42 + r() * 0.14), E = R * 0.03;
  const blobs = [{ u: 0, v: 0, rad: core, amp: 0.8 }];
  const nb = 4 + Math.floor(r() * 5);
  for (let i = 0; i < nb; i++) {
    const a = r() * TAU, d = core * (0.5 + r() * 0.55);
    blobs.push({ u: Math.cos(a) * d, v: Math.sin(a) * d, rad: core * (0.3 + r() * 0.45), amp: 1 });
  }
  mass(r, out, blobs, M, E, 110);
  const fingers = 1 + Math.floor(r() * 3);
  for (let i = 0; i < fingers; i++) {
    finger(r, out, r() * TAU, core * (0.9 + r() * 0.3), core * (0.2 + r() * 0.6), core * (0.06 + r() * 0.08), "body", { curve: 1 });
  }
  poolDetail(r, out, core, M, 3 + Math.floor(r() * 4));
  const drops = 3 + Math.floor(r() * 6);
  for (let i = 0; i < drops; i++) {
    drop(r, out, r() * TAU, core * (1.4 + r() * 0.8), R * (0.015 + r() ** 1.5 * 0.05), "edge");
  }
  return out;
}

/** Repère local : u le long du coup, v en travers → x, y. */
function frame(dir) {
  const ca = Math.cos(dir), sa = Math.sin(dir);
  return (u, v) => [u * ca - v * sa, u * sa + v * ca];
}

/**
 * Giclée de sang (forme « splat ») à l'échelle R, hasard fixé par `r`.
 * Une flaque en grappe de gouttes qui se rejoignent (bordure un peu plus
 * sombre, caillots, reflet humide), allongée dans le sens du coup, des
 * filets qui partent surtout de ce côté, des larmes projetées et une
 * bruine de fines gouttelettes. Chaque morceau porte un `tone`.
 */
export function splatPrims(r, R, dir = null) {
  const out = [];
  dir = dir ?? r() * TAU;
  const M = frame(dir);
  const core = R * (0.2 + r() * 0.12);
  const E = R * 0.025;                       /* épaisseur de la bordure */
  /* Combien la tache file dans le sens du coup : 0 = ronde, 1 = longue traînée. */
  const streak = r() ** 0.7;
  const blobs = [{ u: 0, v: 0, rad: core, amp: 1.1 }];
  /* La queue : des gouttes qui se rejoignent, de plus en plus petites. */
  const nt = 3 + Math.floor(r() * 7);
  const tailLen = core * (0.8 + streak * 4);
  for (let i = 1; i <= nt; i++) {
    const t = i / nt;
    blobs.push({ u: core * 0.5 + tailLen * t * (0.8 + r() * 0.4), v: (r() - 0.5) * core * 0.9 * (1 - t * 0.4),
      rad: core * (0.7 - 0.45 * t) * (0.55 + r() * 0.8), amp: 1.4 });
  }
  /* Quelques gouttes collées autour du cœur (la forme n'est pas ronde). */
  const ns = 2 + Math.floor(r() * 3);
  for (let i = 0; i < ns; i++) {
    const a = r() * TAU, d = core * (0.7 + r() * 0.5);
    blobs.push({ u: Math.cos(a) * d, v: Math.sin(a) * d, rad: core * (0.2 + r() * 0.3), amp: 1.5 });
  }
  /* Gouttes satellites : des pâtés nets autour, dans l'éventail du coup. */
  const fan = 1 + r() * 1.6;
  const nsat = 6 + Math.floor(r() * 10);
  for (let i = 0; i < nsat; i++) {
    const a = r() < 0.8 ? dir + (r() - 0.5) * fan : r() * TAU;
    const d = core * (1.3 + r() ** 1.2 * 2.6);
    blobs.push({ u: Math.cos(a - dir) * d, v: Math.sin(a - dir) * d, rad: core * (0.07 + r() ** 1.3 * 0.36), amp: 1.2 });
  }
  const rims = [], bodies = [];
  for (const b of blobs) {
    const [x, y] = M(b.u, b.v);
    const { pts, rim } = blobPts(r, x, y, b.rad, { n: 96, amp: b.amp, E });
    rims.push({ t: "p", pts: rim, tone: "rim" });
    bodies.push({ t: "p", pts, tone: "body" });
  }
  out.push(...rims, ...bodies);
  /* Doigts : le sang qui déborde du cœur, à bout rond, surtout vers l'avant. */
  const fingers = 6 + Math.floor(r() * 8);
  for (let i = 0; i < fingers; i++) {
    const a = r() < 0.6 ? dir + (r() - 0.5) * 2.4 : r() * TAU;
    const long = r() < 0.4;
    finger(r, out, a, core * (0.75 + r() * 0.2), core * (long ? 0.6 + r() * 1.3 : 0.15 + r() ** 1.3 * 0.5),
      core * (long ? 0.04 + r() * 0.05 : 0.06 + r() * 0.1), "body");
  }
  /* Larmes projetées : dans l'éventail du coup, surtout près, quelques-unes loin. */
  const drops = 24 + Math.floor(r() * 30);
  for (let i = 0; i < drops; i++) {
    const a = r() < 0.85 ? dir + (r() - 0.5) * fan : r() * TAU;
    const d = core * 1.2 + R * (0.1 + r() ** 1.5 * 3);
    drop(r, out, a, d, R * (0.008 + r() ** 1.8 * 0.05), "edge");
  }
  /* Caillots : taches plus sombres dans la flaque. */
  const clots = 2 + Math.floor(r() * 3);
  for (let i = 0; i < clots; i++) {
    const [x, y] = M(r() * core * 1.2 - core * 0.3, (r() - 0.5) * core * 0.8);
    out.push({ t: "p", pts: blobPts(r, x, y, core * (0.1 + r() * 0.2), { n: 36, amp: 1.4 }), tone: "dark" });
  }
  /* Reflet humide : un petit croissant clair sur la flaque. */
  {
    const wa = r() * TAU, cxw = Math.cos(wa) * core * 0.3, cyw = Math.sin(wa) * core * 0.3, rw = core * 0.3;
    const wet = [];
    for (let j = 0; j <= 14; j++) { const t = wa + Math.PI / 2 - 0.7 + (j / 14) * 1.4; wet.push(cxw + Math.cos(t) * rw, cyw + Math.sin(t) * rw); }
    for (let j = 14; j >= 0; j--) { const t = wa + Math.PI / 2 - 0.7 + (j / 14) * 1.4; wet.push(cxw + Math.cos(t) * rw * 0.8 + Math.cos(wa) * rw * 0.1, cyw + Math.sin(t) * rw * 0.8 + Math.sin(wa) * rw * 0.1); }
    out.push({ t: "p", pts: wet, tone: "wet" });
  }
  /* Bruine : des centaines de gouttelettes, denses près du coup, rares au loin. */
  const mist = 120 + Math.floor(r() * 160);
  for (let i = 0; i < mist; i++) {
    const a = r() < 0.8 ? dir + (r() - 0.5) * (fan + 0.8) : r() * TAU;
    const d = core * 0.8 + R * 3 * r() ** 1.7;
    const rr = R * (0.004 + r() ** 2.2 * 0.02);
    out.push({ t: "c", x: Math.cos(a) * d, y: Math.sin(a) * d, r: rr, tone: "mist" });
  }
  return out;
}

/**
 * Gouttes (forme « drops ») : quelques gouttes tombées, rondes et
 * vivantes, avec leurs petites larmes satellites dans un même sens, et
 * un peu de bruine.
 */
export function dropsPrims(r, R, dir = null) {
  const out = [];
  dir = dir ?? r() * TAU;
  const E = R * 0.02;
  const n = 3 + Math.floor(r() * 5);
  const rims = [], bodies = [];
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, d = R * (0.1 + r() * 0.9);
    const cx = Math.cos(a) * d, cy = Math.sin(a) * d, rd = R * (0.04 + r() ** 1.5 * 0.12);
    const { pts, rim } = blobPts(r, cx, cy, rd, { n: 56, amp: 0.9, E });
    rims.push({ t: "p", pts: rim, tone: "rim" });
    bodies.push({ t: "p", pts, tone: "body" });
    const sat = Math.floor(r() * 4);
    for (let j = 0; j < sat; j++) {
      const sa = dir + (r() - 0.5) * 1.4;
      drop(r, out, sa, rd * (1.3 + r() * 2), rd * (0.1 + r() * 0.25), "edge", cx, cy);
    }
  }
  out.push(...rims, ...bodies);
  const mist = 25 + Math.floor(r() * 40);
  for (let i = 0; i < mist; i++) {
    const a = r() * TAU, d = R * (0.1 + r() * 1.3);
    out.push({ t: "c", x: Math.cos(a) * d, y: Math.sin(a) * d, r: R * (0.005 + r() ** 2 * 0.02), tone: "mist" });
  }
  return out;
}

/**
 * Bande de sang étalé le long de +x, de 0 à `len`, d'après un profil
 * de demi-largeur `prof(t)` : un seul contour continu, bruité sur
 * plusieurs fréquences (bords inégaux, comme un frottis), et qui
 * s'arrête à `tEnd` (la fin est faite de stries, pas du corps).
 */
function bandPts(r, len, prof, tEnd = 1, rough = 1) {
  const n = Math.max(40, Math.round(len / 2));
  const noise = () => [3, 7, 13, 29, 61].map(f => [f, (0.28 / f ** 0.35) * rough * (0.5 + r()), r() * TAU]);
  const edge = (H, sgn) => {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * tEnd;
      let k = 1;
      for (const [f, am, ph] of H) k += am * Math.sin(t * f + ph);
      k += (r() - 0.5) * 0.08 * rough;
      pts.push(t * len, sgn * prof(t) * Math.max(0.15, k));
    }
    return pts;
  };
  const top = edge(noise(), -1), bot = edge(noise(), 1);
  const out = [];
  for (let i = 0; i < top.length; i += 2) out.push(top[i], top[i + 1]);
  for (let i = bot.length - 2; i >= 0; i -= 2) out.push(bot[i], bot[i + 1]);
  return out;
}

/**
 * Strie effilée le long de +x : large `h` en `x0`, pointe en `x1`,
 * dérive `dy` ; le bord vit un peu (largeur et trajet irréguliers).
 */
function streak(r, x0, y0, x1, h, dy = 0) {
  const n = 6, top = [], bot = [];
  const wob = r() * TAU, wob2 = r() * TAU;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t, y = y0 + dy * t + Math.sin(t * 5 + wob) * h * 0.6;
    const w = h * (1 - t) ** 0.8 * (0.7 + 0.5 * Math.abs(Math.sin(t * 9 + wob2)));
    top.push(x, y - w); bot.unshift(x, y + w);
  }
  return [...top, ...bot];
}

/**
 * Effiloche la fin d'une bande : des stries parallèles au mouvement qui
 * partent de la fin du corps (`xEnd`, demi-largeur `hw`) et s'arrêtent
 * les unes après les autres.
 */
function feather(r, out, xEnd, hw, len, tone = "body") {
  const n = 4 + Math.floor(r() * 6);
  for (let i = 0; i < n; i++) {
    const y = (r() - 0.5) * 2 * hw * 0.9, h = hw * (0.08 + r() ** 1.5 * 0.3);
    const back = len * r() * 0.3;
    out.push({ t: "p", pts: streak(r, xEnd - back, y, xEnd + len * (0.15 + r() ** 1.3 * 0.6), h, (r() - 0.5) * hw * 0.5), tone });
  }
}

/** Stries plus sombres DANS la bande (le frottement), dans le sens du mouvement. */
function striations(r, out, len, hw, n) {
  for (let i = 0; i < n; i++) {
    const y = (r() - 0.5) * 2 * hw * 0.8, h = hw * (0.03 + r() * 0.07);
    const x0 = len * r() * 0.5, x1 = x0 + len * (0.25 + r() * 0.6);
    out.push({ t: "p", pts: streak(r, x0, y, Math.min(len, x1), h, (r() - 0.5) * hw * 0.4), tone: r() < 0.5 ? "dark" : "thin" });
  }
}

/** Bavures sur les bords : petites stries qui débordent, tournées vers +x. */
function fringe(r, out, len, prof, n, R) {
  for (let i = 0; i < n; i++) {
    const t = r(), sgn = r() < 0.5 ? -1 : 1, hw = prof(t);
    const h = R * (0.01 + r() ** 1.5 * 0.03), y = sgn * hw * (0.85 + r() * 0.4);
    out.push({ t: "p", pts: streak(r, t * len, y, t * len + R * (0.1 + r() * 0.4), h, sgn * R * r() * 0.08), tone: "body" });
  }
}

/**
 * Traînée (forme « smear ») : du sang étalé dans le sens de la marche
 * (+x) — un frottis lourd au départ qui s'amincit, aux bords inégaux,
 * qui s'effiloche en stries à la fin, avec des stries sombres dedans,
 * des bavures sur les côtés, quelques gouttes et un peu de bruine.
 */
export function smearPrims(r, R) {
  const out = [];
  const E = R * 0.02;
  const len = R * (2.2 + r() * 1.4), w = R * (0.2 + r() * 0.16);
  const k1 = r() * TAU, k2 = r() * TAU;
  /* Parfois un « saut » : la bande se pince presque jusqu'à casser. */
  const gap = r() < 0.5 ? 0.3 + r() * 0.4 : -1;
  const tEnd = 0.72 + r() * 0.2;
  const prof = (t) => {
    let p = w * (1 - t * 0.55) * (0.75 + 0.25 * Math.sin(t * 9 + k1) * Math.sin(t * 4 + k2));
    if (gap > 0) { const d = Math.abs(t - gap) / 0.06; if (d < 1) p *= 0.2 + 0.8 * d * d; }
    /* Tête ronde au départ, corps qui se pince avant les stries. */
    return p * Math.min(1, (t / 0.1) ** 0.5) * Math.min(1, ((tEnd - t) / 0.15) ** 0.7);
  };
  const body = bandPts(r, len, prof, tEnd, 1.7);
  /* Bordure : le même contour, poussé de E vers l'extérieur (par le signe de y). */
  const rim = [];
  for (let i = 0; i < body.length; i += 2) rim.push(body[i] + (i < body.length / 2 ? 0 : 0), body[i + 1] + Math.sign(body[i + 1]) * E);
  out.push({ t: "p", pts: rim.map((v, i) => i % 2 ? v : v - len / 2), tone: "rim" });
  out.push({ t: "p", pts: body.map((v, i) => i % 2 ? v : v - len / 2), tone: "body" });
  const sub = [];
  feather(r, sub, tEnd * len, prof(tEnd - 0.1), len * (0.45 + r() * 0.35));
  striations(r, sub, tEnd * len, w * 0.8, 2 + Math.floor(r() * 3));
  fringe(r, sub, tEnd * len, prof, 4 + Math.floor(r() * 7), R);
  /* Un ou deux pâtés collés au bord, au départ (le sang qui déborde). */
  const nb = Math.floor(r() * 3);
  for (let i = 0; i < nb; i++) {
    const t = r() * 0.5, sgn = r() < 0.5 ? -1 : 1, rad = w * (0.25 + r() * 0.4);
    const { pts, rim: rr } = blobPts(r, t * len, sgn * (prof(t) + rad * 0.5), rad, { n: 48, amp: 1, E });
    out.push({ t: "p", pts: rr.map((v, j) => j % 2 ? v : v - len / 2), tone: "rim" });
    sub.push({ t: "p", pts, tone: "body" });
  }
  /* Larmes dans le sens de la marche, autour de la bande. */
  const drops = 4 + Math.floor(r() * 7);
  for (let i = 0; i < drops; i++) {
    drop(r, sub, (r() - 0.5) * 0.4, 0, R * (0.01 + r() ** 1.6 * 0.04), "edge", r() * len * 1.15, (r() - 0.5) * w * 3.5);
  }
  const mist = 25 + Math.floor(r() * 40);
  for (let i = 0; i < mist; i++) {
    sub.push({ t: "c", x: r() * len * 1.2, y: (r() - 0.5) * w * 4, r: R * (0.004 + r() ** 2 * 0.014), tone: "mist" });
  }
  for (const pr of sub) {
    if (pr.t === "c") pr.x -= len / 2;
    else pr.pts = pr.pts.map((v, i) => i % 2 ? v : v - len / 2);
  }
  out.push(...sub);
  return out;
}

/**
 * Corps traîné (forme « drag ») : une large bande continue de longueur
 * `len`, lourde au départ, aux bords inégaux, rayée de stries sombres
 * dans le sens du frottement, qui bave sur les côtés et s'effiloche à
 * la fin.
 */
export function dragPrims(r, R, len) {
  const out = [];
  const E = R * 0.02, w = R * 0.34;
  const k1 = r() * TAU, k2 = r() * TAU;
  const tEnd = 0.9;
  const prof = (t) => w * (1 - t * 0.25) * (0.8 + 0.2 * Math.sin(t * 5 + k1) + 0.1 * Math.sin(t * 11 + k2))
    * Math.min(1, (t * len / (w * 1.2)) ** 0.5) * Math.min(1, ((tEnd - t) * len / (w * 1.5)) ** 0.6);
  const body = bandPts(r, len, prof, tEnd, 1.7);
  const rim = [];
  for (let i = 0; i < body.length; i += 2) rim.push(body[i], body[i + 1] + Math.sign(body[i + 1]) * E);
  out.push({ t: "p", pts: rim, tone: "rim" });
  out.push({ t: "p", pts: body, tone: "body" });
  feather(r, out, tEnd * len, prof(tEnd - 0.08), len * 0.25 + R * 0.3);
  striations(r, out, tEnd * len, w * 0.9, 4 + Math.floor(r() * 4));
  fringe(r, out, tEnd * len, prof, 6 + Math.floor(r() * 8), R);
  return out;
}

/* Teintes d'une giclée, tirées de la couleur de la trace. */
const TONES = {
  rim: { mul: 0.68, alpha: 1, order: 0 },
  edge: { mul: 0.8, alpha: 1, order: 1 },
  mist: { mul: 0.85, alpha: 0.9, order: 1 },
  body: { mul: 1, alpha: 1, order: 2 },
  dark: { mul: 0.7, alpha: 0.35, order: 3 },
  thin: { light: 0.3, alpha: 0.3, order: 3 },
  wet: { light: 0.4, alpha: 0.12, order: 4 }
};
function toneColor(col, tone) {
  const t = TONES[tone] ?? TONES.body;
  let rr = (col >> 16) & 255, gg = (col >> 8) & 255, bb = col & 255;
  if (t.light) { rr += (255 - rr) * t.light; gg += (255 - gg) * t.light; bb += (255 - bb) * t.light; }
  else { rr *= t.mul; gg *= t.mul; bb *= t.mul; }
  return (Math.round(rr) << 16) | (Math.round(gg) << 8) | Math.round(bb);
}

/** Peint des morceaux (polygones, cercles) teinte par teinte, dans l'ordre. */
export function paintPrims(g, prims, col) {
  const sorted = [...prims].sort((a, b) => (TONES[a.tone]?.order ?? 2) - (TONES[b.tone]?.order ?? 2));
  let cur = null;
  for (const pr of sorted) {
    const tone = pr.tone ?? "body";
    if (tone !== cur) {
      if (cur !== null) g.endFill();
      g.beginFill(toneColor(col, tone), TONES[tone]?.alpha ?? 1);
      cur = tone;
    }
    if (pr.t === "c") g.drawCircle(pr.x, pr.y, pr.r);
    else if (pr.t === "e") g.drawEllipse(pr.x, pr.y, pr.rx, pr.ry);
    else g.drawPolygon(pr.pts);
  }
  if (cur !== null) g.endFill();
}

function colorNum(c, fallback = 0x8a0303) {
  const m = /^#?([0-9a-f]{6})/i.exec(String(c ?? "").trim());
  return m ? parseInt(m[1], 16) : fallback;
}

export class TraceManager {

  static #layer = null;
  static #ephemeral = [];
  static #lastPos = new Map();
  static #lastDrop = new Map();
  static #regionState = new Map();
  static #fadeTimer = null;
  static #queue = Promise.resolve();

  /** Les écritures de traces d'une scène, une à la fois (ajout, effacement, nettoyage). */
  static #write(task) {
    const run = this.#queue.then(task);
    this.#queue = run.catch(err => console.warn("SBE | Traces : écriture en échec", err));
    return this.#queue;
  }

  /** Zones révélées par un pistage réussi (ce client) : { x, y, r, until }. */
  static #reveals = [];
  /** Traces dont ce client peut lire l'âge au survol. */
  static #drawn = [];
  static #tip = null;
  static #hoverAt = 0;
  static #hoverBound = false;
  /** Traces à l'écran (id → nœud) : gardées d'un dessin à l'autre. */
  static #objs = new Map();
  static #objsLayer = null;
  static #anims = new Set();
  static #tickFn = null;
  /** Premier dessin d'une scène : tout d'un coup, sans animation. */
  static #instant = true;
  /** Dossiers d'images des types (chemin → fichiers), lus par le MJ principal. */
  static #folders = new Map();

  /* ========================================================== */
  /*  Réglages                                                   */
  /* ========================================================== */

  static defaultType(over = {}) {
    return {
      id: foundry.utils.randomID(), name: game.i18n.localize("SBE.Traces.NewType"), enabled: true,
      /* Conditions : une clé, un opérateur, une valeur (ou un % du maximum). */
      /* Chaque déclencheur a ses formes : on ne pose pas une éclaboussure
         d'impact en marchant. Les images et les empreintes sont communes. */
      impact: { on: true, count: 2, size: 1, byLoss: false, shapes: ["splat"], key: "", op: "any", value: 0, unit: "value" },
      /* grow : plus la clé surveillée est basse (en % du max), plus les taches sont grosses. */
      trail: { on: false, spacing: 1, size: 0.5, grow: false, shapes: ["drops"], key: "", op: "any", value: 0, unit: "value" },
      footprint: "boot",
      images: [],
      /* Dossier d'images : une image tirée au hasard à chaque trace. */
      imageFolder: "",
      color: { key: "", value: "#5a4632", alpha: 0.85 },
      persist: "scene",
      fade: { mode: "none", amount: 60 },
      combatOnly: false, wallsBlock: true, delay: 0, orient: false,
      /* Taille des taches, des pas et de leur écart × taille du pion. */
      scaleToken: true,
      /* Empreintes : un pied à chaque pas (gauche, droite…) au lieu d'une paire. */
      alternate: true,
      /* Rien en volant, en nageant, sous terre ni en téléportation. */
      skipAir: true,
      /* Cachées : visibles du MJ, et des joueurs qui les ont pistées. */
      hidden: false,
      /* Corps traîné : condition (ex. hp <= 0) → longue traînée continue. */
      drag: { on: false, key: "", op: "<=", value: 0, unit: "value", size: 0.8 },
      /* Modèles concernés (ids des modèles) ; vide = tous. */
      templates: [],
      ...over
    };
  }

  /** Le sang, prêt à l'emploi (clé de couleur fixe « blood »). */
  static bloodType() {
    return this.defaultType({
      id: "blood", name: game.i18n.localize("SBE.Traces.Blood"),
      impact: { on: true, count: 3, size: 1, byLoss: true, shapes: ["splat", "burst"], key: "", op: "any", value: 0, unit: "value" },
      trail: { on: true, spacing: 1, size: 0.45, grow: true, shapes: ["drops", "smear"], key: "", op: "<", value: 80, unit: "pct" },
      color: { key: "blood", value: "#7a0a0a", alpha: 0.85 }
    });
  }

  /** Types de traces. Réglage { types: […] } ; jamais réglé → le sang seul. */
  static types() {
    let t;
    try { t = game.settings.get(SYSTEM_ID, SETTING); } catch (_e) { t = null; }
    return (Array.isArray(t?.types) ? t.types : [this.bloodType()]).map(x => this.#normalize(x));
  }

  /** Remet un type à la forme actuelle (anciennes conditions en formule). */
  static #normalize(t) {
    const o = foundry.utils.deepClone(t);
    o.impact ??= {};
    o.trail ??= {};
    if (!o.impact.key && o.watchKey) o.impact.key = o.watchKey;
    o.impact.op ??= "any"; o.impact.unit ??= "value"; o.impact.value ??= 0; o.impact.byLoss ??= false;
    if (!Array.isArray(o.impact.effects)) o.impact.effects = []; o.impact.effMode = o.impact.effMode === "and" ? "and" : "or";
    o.imageFolder ??= "";
    if (!o.trail.key && typeof o.condition === "string" && o.condition.trim()) {
      const m = /^\s*([a-z][a-z0-9_]*)\s*(<=|>=|==|!=|<|>)\s*(-?\d+(?:\.\d+)?)\s*$/i.exec(o.condition);
      if (m) {
        const pct = /_pct$/.test(m[1]);
        Object.assign(o.trail, { key: pct ? m[1].replace(/_pct$/, "") : m[1], op: m[2], value: Number(m[3]), unit: pct ? "pct" : "value" });
      }
    }
    o.trail.op ??= "any"; o.trail.unit ??= "value"; o.trail.value ??= 0; o.trail.grow ??= false;
    if (!Array.isArray(o.trail.effects)) o.trail.effects = []; o.trail.effMode = o.trail.effMode === "and" ? "and" : "or";
    /* Ancienne liste unique : l'impact la garde, la traînée ne prend que ce qui se pose en marchant. */
    if (!Array.isArray(o.impact.shapes)) {
      const hit = (o.shapes ?? []).filter(x => ["splat", "burst", "pool", "drops"].includes(x));
      o.impact.shapes = hit.length ? hit : ["splat"];
    }
    if (!Array.isArray(o.trail.shapes)) {
      const walk = (o.shapes ?? []).filter(x => ["drops", "smear", "footprint"].includes(x));
      o.trail.shapes = walk.length ? walk : ["drops"];
    }
    delete o.shapes;
    o.footprint ??= "boot";
    if (o.footprint === "giant") o.footprint = "bare";
    o.scaleToken ??= true;
    o.alternate ??= true;
    o.skipAir ??= true;
    o.drag = { on: false, key: "", op: "<=", value: 0, unit: "value", size: 0.8, ...(o.drag ?? {}) };
    delete o.condition; delete o.watchKey;
    return o;
  }

  static async saveTypes(types) {
    await game.settings.set(SYSTEM_ID, SETTING, { types });
  }

  static options() {
    let o;
    try { o = game.settings.get(SYSTEM_ID, OPTIONS); } catch (_e) { o = null; }
    return {
      maxPerScene: 400, hoverAge: true, ...(o ?? {}),
      /* Pistage : jet sur une clé du personnage ; réussi, il révèle les
         traces cachées dans un rayon (cases) pendant N minutes réelles. */
      track: { key: "", radius: 6, minutes: 10, ...(o?.track ?? {}) }
    };
  }

  /* ========================================================== */
  /*  Déclencheurs (MJ principal)                                */
  /* ========================================================== */

  /** Condition { key, op, value, unit } (helpers/key-condition). */
  static #check(cond, actor) {
    const effects = Array.isArray(cond?.effects) ? cond.effects : [];
    if (!effects.length) return checkKeyCondition(cond, actor);
    /* Un des effets choisis est actif sur l'acteur (statuts de ses effets). */
    const has = effects.some(id => actor?.statuses?.has?.(id));
    if (!this.#keySet(cond)) return has;
    const key = checkKeyCondition(cond, actor);
    return cond.effMode === "and" ? key && has : key || has;
  }

  /** La condition de clé est-elle réglée (une clé et une comparaison) ? */
  static #keySet(cond) { return !!cond?.key && !!cond.op && cond.op !== "any"; }

  /** Clé ET effets réglés : le MJ choisit « l'un ou l'autre » / « les deux ». */
  static condUsesBoth(cond) { return this.#keySet(cond) && (cond?.effects ?? []).length > 0; }

  /** Ce type concerne-t-il le modèle de cet acteur ? */
  static #forTemplate(type, actor) {
    const list = type.templates ?? [];
    return !list.length || list.includes(actor?.system?.templateId) || list.includes(actor?.id);
  }

  /** Le type agit-il ? `cond` : condition de l'impact ou de la traînée. */
  static #active(type, actor, cond) {
    if (!type.enabled || !this.#forTemplate(type, actor)) return false;
    if (type.combatOnly && !game.combat?.started) return false;
    return this.#check(cond, actor);
  }

  /** Règles d'empreintes : [{ id, kind, ref, key, op, value, footprint }]. */
  static footprintRules() {
    let o;
    try { o = game.settings.get(SYSTEM_ID, FP_SETTING); } catch (_e) { o = null; }
    return Array.isArray(o?.rules) ? foundry.utils.deepClone(o.rules) : [];
  }

  static async saveFootprintRules(rules) {
    await game.settings.set(SYSTEM_ID, FP_SETTING, { rules });
  }

  static newFootprintRule() {
    return { id: foundry.utils.randomID(), kind: "template", ref: "", key: "", op: "==", value: "", footprint: "boot" };
  }

  /** La règle vise-t-elle cet acteur ? */
  static #ruleMatch(rule, actor) {
    switch (rule?.kind) {
      case "template": return !!rule.ref && actor?.system?.templateId === rule.ref;
      case "actor": return !!rule.ref && (actor?.id === rule.ref || actor?.token?.actorId === rule.ref);
      case "item": return !!rule.ref && !!actor?.items?.some(i => i.system?.modelId === rule.ref || i.id === rule.ref);
      case "key": {
        if (!rule.key) return false;
        const raw = foundry.utils.getProperty(actor, `system.values.${rule.key}`);
        if (!rule.op || rule.op === "any") return raw !== undefined && raw !== null && String(raw).trim() !== "";
        const a = Number(raw), b = Number(rule.value);
        const num = String(raw ?? "").trim() !== "" && String(rule.value ?? "").trim() !== "" && Number.isFinite(a) && Number.isFinite(b);
        if (num) {
          switch (rule.op) {
            case "<": return a < b; case "<=": return a <= b; case ">": return a > b; case ">=": return a >= b;
            case "==": return a === b; case "!=": return a !== b;
          }
        }
        /* Texte (« race » = « elf ») : sans tenir compte des majuscules. */
        const x = String(raw ?? "").trim().toLowerCase(), y = String(rule.value ?? "").trim().toLowerCase();
        if (rule.op === "==") return x === y;
        if (rule.op === "!=") return x !== y;
        return false;
      }
      default: return false;
    }
  }

  /** L'empreinte d'un acteur : la première règle qui le vise, sinon celle du type. */
  static #footprintFor(type, actor) {
    for (const r of this.footprintRules()) if (r.footprint && this.#ruleMatch(r, actor)) return r.footprint === "giant" ? "bare" : r.footprint;
    return type.footprint || "boot";
  }

  static #colorFor(type, actor) {
    const k = type.color?.key;
    const v = k ? foundry.utils.getProperty(actor, `system.values.${k}`) : null;
    return (typeof v === "string" && /^#?[0-9a-f]{6}/i.test(v)) ? v : (type.color?.value ?? "#7a0a0a");
  }

  static #tokensOf(actor) {
    if (actor.isToken) return actor.token?.object ? [actor.token.object] : [];
    return actor.getActiveTokens?.(true) ?? [];
  }

  /** Avant une mise à jour : on retient l'ancienne valeur des clés surveillées. */
  static #preUpdate(actor, changes, options) {
    /* Retour en arrière (managers/undo) : les traces reviennent seules. */
    if (!isPrimaryGM() || options?.sbeUndo) return;
    const keys = [...new Set(this.types().map(t => t.impact?.key).filter(Boolean))];
    const before = {};
    for (const k of keys) {
      if (foundry.utils.hasProperty(changes, `system.values.${k}`)) before[k] = Number(foundry.utils.getProperty(actor, `system.values.${k}`)) || 0;
    }
    if (Object.keys(before).length) options.sbeTraceBefore = before;
  }

  static #update(actor, _changes, options) {
    const before = options?.sbeTraceBefore;
    if (!before || !isPrimaryGM()) return;
    for (const type of this.types()) {
      const wk = type.impact?.key;
      if (!type.impact?.on || !wk || !(wk in before)) continue;
      const now = Number(foundry.utils.getProperty(actor, `system.values.${wk}`)) || 0;
      const loss = before[wk] - now;
      if (loss <= 0 || !this.#active(type, actor, type.impact)) continue;
      /* Plus la perte est forte (par rapport à la valeur d'avant), plus la tache est grosse. */
      const ref = Math.abs(before[wk]) || loss;
      const strength = Math.min(2, 0.7 + (loss / ref) * 1.5);
      for (const tok of this.#tokensOf(actor)) this.#later(type, () => this.splat(tok, type, { strength }));
    }
  }

  static #later(type, fn) {
    const d = Number(type.delay) || 0;
    if (d > 0) setTimeout(fn, d); else fn();
  }

  /**
   * Traînée « de plus en plus grosse » : facteur de taille d'après la
   * clé de la traînée en % de son maximum — 0,7 à plein, 1,8 à zéro.
   * Sans clé ni maximum connu : 1.
   */
  static #growOf(type, actor) {
    const key = type.trail?.key;
    if (!type.trail?.grow || !key) return 1;
    let max = 0;
    try { max = Number(docScope(actor).maxOf?.(key)) || 0; } catch (_e) { max = 0; }
    if (max <= 0) return 1;
    const v = Number(foundry.utils.getProperty(actor, `system.values.${key}`)) || 0;
    const ratio = Math.min(1, Math.max(0, v / max));
    return 0.7 + (1 - ratio) * 1.1;
  }

  /** Règles « Traces SBE » des régions de la scène. */
  static #regionRules() {
    const out = [];
    for (const region of canvas.scene?.regions ?? []) {
      for (const b of region.behaviors ?? []) {
        if (b.type !== "sbeTraces" || b.disabled || b.system.mode === "weather") continue;
        out.push({ region, typeId: b.system.traceType, mode: b.system.mode ?? "both",
          cases: Number(b.system.cases) || 0, templates: new Set(b.system.templates ?? []) });
      }
    }
    return out;
  }

  /**
   * Déplacement d'un pion : tous les N cases, une trace par type actif —
   * traînée (condition vraie), région « sur la région », ou pieds sales
   * après une région « en sortant ». Deux régions qui se chevauchent avec
   * le même type ne posent qu'une trace.
   */
  static #moved(tokenDoc, changes) {
    if (!isPrimaryGM() || !("x" in changes || "y" in changes)) return;
    const tok = tokenDoc.object;
    const actor = tokenDoc.actor;
    const gs = canvas.grid?.size || 100;
    const w = (tokenDoc.width ?? 1) * gs, h = (tokenDoc.height ?? 1) * gs;
    const to = { x: tokenDoc.x + w / 2, y: tokenDoc.y + h / 2 };
    const from = this.#lastPos.get(tokenDoc.uuid) ?? to;
    this.#lastPos.set(tokenDoc.uuid, to);
    if (!actor || !tok) return;
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    if (dist < 1) return;
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const elevation = tokenDoc.elevation ?? 0;
    const airborne = AIR_ACTIONS.has(String(tokenDoc.movementAction ?? ""));
    const rules = this.#regionRules();
    const batch = [];
    for (const type of this.types()) {
      if (!type.enabled || !this.#forTemplate(type, actor)) continue;
      if (type.combatOnly && !game.combat?.started) continue;
      const mine = rules.filter(r => (r.typeId === type.id || r.typeId === "*")
        && (!r.templates.size || r.templates.has(actor.system?.templateId)));
      if (airborne && type.skipAir !== false) continue;
      const condTrail = !!type.trail?.on && this.#check(type.trail, actor);
      const condDrag = !!type.drag?.on && !!type.drag?.key && this.#check(type.drag, actor);
      const key = `${tokenDoc.uuid}|${type.id}`;
      const st = this.#regionState.get(key) ?? { wasIn: false, dirty: 0 };
      if (!condTrail && !condDrag && !mine.length && st.dirty <= 0) continue;
      const step = Math.max(0.1, Number(type.trail?.spacing) || 1) * gs * this.#sizeOf(type, tokenDoc);
      const carried = this.#lastDrop.get(key) ?? 0;
      for (let d = step - carried; d <= dist; d += step) {
        const p = { x: from.x + Math.cos(angle) * d, y: from.y + Math.sin(angle) * d, elevation };
        const hits = mine.filter(r => { try { return r.region.testPoint(p); } catch (_e) { return false; } });
        const inside = hits.some(r => r.mode !== "exit");
        if (hits.length) {
          st.wasIn = true;
          st.dirty = 0;
          st.exitCases = Math.max(0, ...hits.filter(r => r.mode !== "inside").map(r => r.cases));
        } else if (st.wasIn) {
          st.wasIn = false;
          st.dirty = (st.exitCases ?? 0) * gs;
        }
        const dirty = !hits.length && st.dirty > 0;
        if (dirty) st.dirty -= step;
        if (condDrag) {
          /* Corps traîné : un long frottis continu, sur toute la longueur du pas. */
          batch.push(this.#entry(type, actor, tokenDoc, { x: p.x - Math.cos(angle) * step / 2, y: p.y - Math.sin(angle) * step / 2 },
            { size: type.drag.size ?? 0.8, count: 1, angle, drag: step / gs }));
        } else if (condTrail || inside || dirty) {
          /* Pas alternés : gauche, droite, gauche… (par pion et par type). */
          st.foot = type.alternate === false ? 0 : (st.foot === -1 ? 1 : -1);
          batch.push(this.#entry(type, actor, tokenDoc, p, { size: (type.trail?.size ?? 0.5) * this.#growOf(type, actor), count: 1, angle, foot: st.foot, shapes: type.trail?.shapes ?? [] }));
        }
      }
      this.#lastDrop.set(key, (carried + dist) % step);
      this.#regionState.set(key, st);
    }
    if (batch.length) this.#store(batch.flat(), this.types());
  }

  /* ========================================================== */
  /*  Fabrication d'une tache                                    */
  /* ========================================================== */

  /** Polygone des murs au moment de la tache (portes ouvertes : on passe). */
  static #clip(p, radius) {
    try {
      const poly = CONFIG.Canvas.polygonBackends.move.create({ x: p.x, y: p.y }, { type: "move", radius });
      const pts = poly?.points ?? [];
      return pts.length >= 6 ? pts.map(v => Math.round(v)) : null;
    } catch (_e) { return null; }
  }

  /** Facteur de taille du pion (2×2 → 2), si le type le suit. */
  static #sizeOf(type, tokenDoc) {
    if (type.scaleToken === false) return 1;
    const w = Number(tokenDoc?.width) || 1, h = Number(tokenDoc?.height) || 1;
    return Math.max(0.25, (w + h) / 2);
  }

  static #entry(type, actor, tokenDoc, p, { size = 1, count = 1, strength = 1, angle = null, foot = 0, drag = 0, shapes: own = [] } = {}) {
    const gs = canvas.grid?.size || 100;
    const tz = this.#sizeOf(type, tokenDoc);
    const out = [];
    const folder = type.imageFolder ? (this.#folders.get(type.imageFolder) ?? []) : [];
    const shapes = [...own, ...[...(type.images ?? []), ...folder].map(src => `img:${src}`)];
    if (!shapes.length) shapes.push("splat");
    const color = this.#colorFor(type, actor);
    for (let i = 0; i < Math.max(1, count); i++) {
      const seed = Math.floor(Math.random() * 2 ** 31);
      const r = rng(seed);
      /* La première tache est la grosse ; les suivantes, plus petites autour. */
      const scale = (Number(size) || 1) * strength * tz * (0.8 + r() * 0.4) * (i === 0 ? 1 : 0.45 + r() * 0.35);
      const spread = i === 0 ? 0 : gs * 0.35 * strength * tz;
      const q = { x: p.x + (r() - 0.5) * 2 * spread, y: p.y + (r() - 0.5) * 2 * spread };
      let shape = drag ? "drag" : shapes[Math.floor(r() * shapes.length)];
      /* Empreintes : la règle qui vise l'acteur, sinon celle du type ;
         une image garde l'orientation de la marche. */
      let fp = null;
      if (shape === "footprint") {
        fp = this.#footprintFor(type, actor);
        if (!FOOTPRINTS.includes(fp)) { shape = `img:${fp}`; fp = "img"; }
      }
      /* Traînée (angle connu) : toujours dans le sens de la marche, à peine
         dévié ; la giclée part vers l'avant (`k`) ; impact : rotation au hasard. */
      const trail = angle !== null;
      const rot = trail ? angle + (type.orient || fp ? 0 : (r() - 0.5) * 0.35) : r() * Math.PI * 2;
      const stretch = trail && !fp ? 1.6 : 1;
      out.push({
        id: foundry.utils.randomID(), t: type.id, x: Math.round(q.x), y: Math.round(q.y), seed, shape,
        s: Math.round(scale * 100) / 100, rot: Math.round((drag ? angle : rot) * 100) / 100, k: drag ? 1 : stretch, fp,
        ...(fp && foot ? { f: foot } : {}), ...(drag ? { l: Math.round(drag * 100) / 100 } : {}),
        c: color, a: type.color?.alpha ?? 0.85, e: tokenDoc?.elevation ?? 0,
        real: Date.now(), world: game.time?.worldTime ?? 0,
        clip: type.wallsBlock ? this.#clip(q, gs * Math.max(scale * 0.9, drag ? drag : 0)) : null
      });
    }
    return out;
  }

  /** Tache d'impact sous un pion (aussi le bouton « tacher »). */
  static async splat(token, type, { strength = 1 } = {}) {
    if (type.imageFolder) await this.loadFolder(type.imageFolder);
    const doc = token.document ?? token;
    const actor = doc.actor;
    if (!actor) return;
    const p = token.center ?? { x: doc.x, y: doc.y };
    /* « Selon la perte » : un gros coup fait aussi PLUS de taches. */
    const base = Math.max(1, Number(type.impact?.count) || 1);
    const count = type.impact?.byLoss ? Math.max(1, Math.min(20, Math.round(base * strength))) : base;
    /* La taille ne suit la perte que jusqu'à un point : au-delà, c'est le nombre. */
    this.#store(this.#entry(type, actor, doc, p, { size: type.impact?.size ?? 1, count, strength: Math.min(1.4, strength), shapes: type.impact?.shapes ?? [] }), this.types());
  }

  /**
   * Lit les images d'un dossier (une fois, puis gardées). `force` : relit
   * (dossier changé dans la configuration).
   */
  static async loadFolder(folder, { force = false } = {}) {
    if (!folder) return [];
    if (!force && this.#folders.has(folder)) return this.#folders.get(folder);
    let files = [];
    try { files = await listImages(folder); }
    catch (err) { console.warn(`SBE | Traces : dossier d'images illisible (${folder})`, err); }
    this.#folders.set(folder, files);
    return files;
  }

  /** Range : scène (drapeau, MJ) ou éphémère (message à tous). */
  static async #store(entries, types) {
    if (!entries.length || !canvas.scene) return;
    const byPersist = { scene: [], ephemeral: [] };
    for (const e of entries) {
      const t = types.find(x => x.id === e.t);
      (t?.persist === "ephemeral" ? byPersist.ephemeral : byPersist.scene).push(e);
    }
    if (byPersist.ephemeral.length) {
      emitSocket({ type: "sbeTraceAdd", scene: canvas.scene.id, entries: byPersist.ephemeral });
      this.#addEphemeral(canvas.scene.id, byPersist.ephemeral);
    }
    if (byPersist.scene.length) {
      /* Écritures en file : deux taches rapprochées ne s'écrasent pas. */
      const scene = canvas.scene;
      await this.#write(async () => {
        const max = Math.max(20, Number(this.options().maxPerScene) || 400);
        const list = [...(scene.getFlag(SYSTEM_ID, FLAG) ?? []), ...byPersist.scene].slice(-max);
        await scene.setFlag(SYSTEM_ID, FLAG, list);
      });
    }
  }

  static #addEphemeral(sceneId, entries) {
    if (canvas.scene?.id !== sceneId) return;
    this.#ephemeral.push(...entries);
    const max = Math.max(20, Number(this.options().maxPerScene) || 400);
    if (this.#ephemeral.length > max) this.#ephemeral.splice(0, this.#ephemeral.length - max);
    this.draw();
  }

  /** Efface les traces de la scène (toutes, ou d'un type). MJ. */
  static async clear(sceneDoc = canvas.scene, typeId = null) {
    if (!game.user.isGM || !sceneDoc) return;
    /* Dans la file des écritures de traces : une tache posée au même
       moment n'est ni perdue ni ressuscitée. */
    await this.#write(async () => {
      const keep = typeId ? (sceneDoc.getFlag(SYSTEM_ID, FLAG) ?? []).filter(e => e.t !== typeId) : [];
      if (keep.length) await sceneDoc.setFlag(SYSTEM_ID, FLAG, keep);
      else await sceneDoc.unsetFlag(SYSTEM_ID, FLAG);
    });
    emitSocket({ type: "sbeTraceClear", scene: sceneDoc.id, typeId });
    this.#clearEphemeral(typeId);
  }

  static #clearEphemeral(typeId) {
    this.#ephemeral = typeId ? this.#ephemeral.filter(e => e.t !== typeId) : [];
    this.draw();
  }

  /* ========================================================== */
  /*  Disparition                                                */
  /* ========================================================== */

  /** Régions « météo » de la scène : elles effacent les traces plus vite. */
  static #weatherRules() {
    const out = [];
    for (const region of canvas.scene?.regions ?? []) {
      for (const b of region.behaviors ?? []) {
        if (b.type !== "sbeTraces" || b.disabled || b.system.mode !== "weather") continue;
        out.push({ region, typeId: b.system.traceType, hours: Math.max(0.01, Number(b.system.eraseAfter) || 1) });
      }
    }
    return out;
  }

  /** Vie d'une trace : 1 = neuve, 0 = disparue. */
  static #life(e, types, weather = []) {
    const t = types.find(x => x.id === e.t);
    const mode = t?.fade?.mode ?? "none";
    const amount = Math.max(1, Number(t?.fade?.amount) || 60);
    let life = 1;
    if (mode === "real") life = 1 - (Date.now() - (e.real ?? 0)) / (amount * 60000);
    else if (mode === "world") life = 1 - ((game.time?.worldTime ?? 0) - (e.world ?? 0)) / (amount * 3600);
    /* Pluie, neige qui tombe… : la trace part au bout de N heures de jeu. */
    for (const w of weather) {
      if (w.typeId !== "*" && w.typeId !== e.t) continue;
      let inside = false;
      try { inside = w.region.testPoint({ x: e.x, y: e.y, elevation: e.e ?? 0 }); } catch (_e) { inside = false; }
      if (inside) life = Math.min(life, 1 - ((game.time?.worldTime ?? 0) - (e.world ?? 0)) / (w.hours * 3600));
    }
    return life;
  }

  /** Le MJ principal retire de la scène ce qui a disparu. */
  static async purge() {
    if (!isPrimaryGM() || !canvas.scene) return;
    const scene = canvas.scene;
    await this.#write(async () => {
      const types = this.types();
      const list = scene.getFlag(SYSTEM_ID, FLAG) ?? [];
      const weather = this.#weatherRules();
      const keep = list.filter(e => this.#life(e, types, weather) > 0);
      if (keep.length !== list.length) await scene.setFlag(SYSTEM_ID, FLAG, keep);
    });
  }

  /* ========================================================== */
  /*  Dessin                                                     */
  /* ========================================================== */

  static #ensureLayer() {
    if (!canvas.ready || !canvas.primary) return null;
    if (this.#layer && !this.#layer.destroyed && this.#layer.parent === canvas.primary) return this.#layer;
    const c = new PIXI.Container();
    c.name = "sbe-traces";
    c.eventMode = "none";
    c.elevation = canvas.level?.elevation?.base ?? 0;
    c.sortLayer = 550;            /* au-dessus des tuiles (500), sous les dessins et les pions */
    c.sort = 0;
    canvas.primary.addChild(c);
    canvas.primary.sortDirty = true;
    this.#layer = c;
    return c;
  }

  /**
   * Dessine les traces. Une trace déjà à l'écran est GARDÉE (seule sa
   * transparence suit son âge) : rien n'est refait à chaque écriture.
   * Une nouvelle trace apparaît en s'étalant ; une trace retirée (trop
   * vieille, plafond de la scène atteint, nettoyage) s'efface en fondu.
   */
  static draw() {
    const layer = this.#ensureLayer();
    if (!layer) return;
    if (this.#objsLayer !== layer) { this.#objs.clear(); this.#objsLayer = layer; }
    const animate = !this.#instant;
    this.#instant = false;
    const types = this.types();
    const weather = this.#weatherRules();
    const all = [...(canvas.scene?.getFlag(SYSTEM_ID, FLAG) ?? []), ...this.#ephemeral];
    const isGM = game.user.isGM;
    const seen = new Set();
    this.#drawn = [];
    for (const e of all) {
      const life = this.#life(e, types, weather);
      if (life <= 0) continue;
      /* Traces cachées : le MJ les voit ; un joueur, seulement celles
         qu'il a révélées en pistant. */
      const t = types.find(x => x.id === e.t);
      const revealed = this.#revealed(e);
      if (t?.hidden && !isGM && !revealed) continue;
      if (isGM || revealed) this.#drawn.push(e);
      const id = e.id ?? `${e.x}|${e.y}|${e.seed}`;
      const target = (e.a ?? 0.85) * Math.min(1, life);
      seen.add(id);
      const rec = this.#objs.get(id);
      if (rec) {
        rec.target = target;
        if (!rec.anim) rec.node.alpha = target;
        continue;
      }
      const g = this.#shape(e);
      if (!g) continue;
      let node = g;
      if (e.clip?.length >= 6) {
        const m = new PIXI.Graphics();
        m.beginFill(0xffffff).drawPolygon(e.clip).endFill();
        node = new PIXI.Container();
        node.addChild(g, m);
        g.mask = m;
      }
      layer.addChild(node);
      const nrec = { node, shape: g, target, sx: g.scale.x, sy: g.scale.y };
      this.#objs.set(id, nrec);
      if (animate) this.#animate(nrec, { from: 0, dur: 380, grow: true });
      else node.alpha = target;
    }
    for (const [id, rec] of this.#objs) {
      if (seen.has(id)) continue;
      this.#objs.delete(id);
      this.#animate(rec, { from: rec.node.alpha, to: 0, dur: 700, out: true });
    }
  }

  /** Apparition (s'étale) ou disparition (fondu) d'une trace. */
  static #animate(rec, { from, to = null, dur, grow = false, out = false }) {
    rec.anim = { from, to, t0: performance.now(), dur, grow, out };
    rec.node.alpha = from;
    this.#anims.add(rec);
    if (this.#tickFn) return;
    const ticker = canvas.app?.ticker;
    if (!ticker) { this.#finish(rec); return; }
    this.#tickFn = () => {
      const now = performance.now();
      for (const r of this.#anims) {
        const a = r.anim;
        const k = Math.min(1, (now - a.t0) / a.dur);
        const ease = 1 - (1 - k) ** 3;
        const goal = a.to ?? r.target;
        if (!r.node.destroyed) {
          r.node.alpha = a.from + (goal - a.from) * ease;
          if (a.grow && !r.shape.destroyed) {
            const f = 0.55 + 0.45 * ease;
            r.shape.scale.set(r.sx * f, r.sy * f);
          }
        }
        if (k >= 1) this.#finish(r);
      }
      if (!this.#anims.size) this.#stopTicker();
    };
    ticker.add(this.#tickFn);
  }

  static #finish(rec) {
    this.#anims.delete(rec);
    const a = rec.anim;
    rec.anim = null;
    if (rec.node.destroyed) return;
    if (a?.out) { rec.node.destroy({ children: true }); return; }
    rec.node.alpha = rec.target;
    if (a?.grow && !rec.shape.destroyed) rec.shape.scale.set(rec.sx, rec.sy);
  }

  static #stopTicker() {
    if (this.#tickFn) canvas.app?.ticker?.remove(this.#tickFn);
    this.#tickFn = null;
  }

  /** Une tache : forme dessinée par SBE (hasard fixé par sa graine) ou image. */
  static #shape(e) {
    const gs = canvas.grid?.size || 100;
    const col = colorNum(e.c);
    if (String(e.shape).startsWith("img:")) {
      try {
        const tex = PIXI.Texture.from(e.shape.slice(4));
        const sp = new PIXI.Sprite(tex);
        sp.anchor.set(0.5);
        sp.tint = col;
        sp.position.set(e.x, e.y);
        sp.rotation = e.rot ?? 0;
        /* Une image sur deux en miroir : plus de variété avec peu d'images. */
        const mirror = rng(e.seed)() < 0.5 ? -1 : 1;
        /* Taille posée quand l'image est connue (un SVG se charge après coup) :
           le plus grand côté = la taille de la trace, proportions gardées. */
        const fit = () => {
          if (sp.destroyed) return;
          const k = (gs * (e.s ?? 1)) / (Math.max(tex.width, tex.height) || 1);
          sp.scale.set(k * mirror, k);
        };
        if (tex.baseTexture.valid) fit(); else tex.baseTexture.once("loaded", fit);
        return sp;
      } catch (_e) { return null; }
    }
    const r = rng(e.seed);
    const R = gs * 0.32 * (e.s ?? 1);
    const g = new PIXI.Graphics();
    /* Trace posée en marchant (`k`) : la giclée part dans le sens de la
       marche (angle de la trace) ; impact : sens au hasard. */
    const walk = e.k && e.k !== 1 ? 0 : null;
    switch (e.shape) {
      case "footprint": {
        /* Géométrie partagée avec l'aperçu de la fenêtre de configuration. */
        g.beginFill(col);
        for (const pr of footprintPrims(e.fp, R, e.f || 0)) {
          if (pr.t === "c") g.drawCircle(pr.x, pr.y, pr.r);
          else if (pr.t === "e") g.drawEllipse(pr.x, pr.y, pr.rx, pr.ry);
          else if (pr.t === "p") g.drawPolygon(pr.pts);
        }
        g.endFill();
        break;
      }
      case "drops": paintPrims(g, dropsPrims(r, R, walk), col); break;
      case "burst": paintPrims(g, burstPrims(r, R, walk), col); break;
      case "pool": paintPrims(g, poolPrims(r, R), col); break;
      case "smear": paintPrims(g, smearPrims(r, R), col); break;
      case "drag": paintPrims(g, dragPrims(r, R, gs * (e.l || 1)), col); break;
      /* Giclée : géométrie partagée (hasard fixé par la graine), en
         plusieurs teintes tirées de la couleur de la trace. */
      default: paintPrims(g, splatPrims(r, R, walk), col);
    }
    g.position.set(e.x, e.y);
    g.rotation = e.rot ?? 0;
    return g;
  }

  /* ========================================================== */
  /*  Mise en place                                              */
  /* ========================================================== */

  static init() {
    game.settings.register(SYSTEM_ID, SETTING, {
      scope: "world", config: false, type: Object, default: {},
      onChange: () => { this.draw(); ui.controls?.render?.(); this.#preloadFolders(); }
    });
    game.settings.register(SYSTEM_ID, OPTIONS, {
      scope: "world", config: false, type: Object, default: {},
      onChange: () => ui.controls?.render?.()
    });
    game.settings.register(SYSTEM_ID, FP_SETTING, { scope: "world", config: false, type: Object, default: {} });

    Hooks.once("ready", () => this.#preloadFolders());
    Hooks.on("preUpdateActor", (a, c, o) => this.#preUpdate(a, c, o));
    Hooks.on("updateActor", (a, c, o) => this.#update(a, c, o));
    Hooks.on("updateToken", (d, c, o) => { if (!o?.sbeUndo) this.#moved(d, c); });
    Hooks.on("canvasReady", () => {
      this.#reveals = [];
      if (!this.#hoverBound) {
        this.#hoverBound = true;
        canvas.app?.view?.addEventListener?.("pointermove", (ev) => this.#onHover(ev), { passive: true });
        canvas.app?.view?.addEventListener?.("pointerleave", () => { if (this.#tip) this.#tip.style.display = "none"; }, { passive: true });
      }
      this.#layer = null;
      this.#instant = true;
      this.#ephemeral = [];
      this.#lastPos.clear();
      this.#lastDrop.clear();
      this.#regionState.clear();
      for (const t of canvas.tokens?.placeables ?? []) this.#lastPos.set(t.document.uuid, { ...t.center });
      this.draw();
    });
    Hooks.on("canvasTearDown", () => {
      this.#stopTicker();
      this.#anims.clear();
      this.#objs.clear();
      this.#objsLayer = null;
    });
    Hooks.on("updateScene", (scene, changes) => {
      if (scene.id === canvas.scene?.id && foundry.utils.hasProperty(changes, `flags.${SYSTEM_ID}`)) this.draw();
    });
    Hooks.on("updateWorldTime", () => { this.draw(); this.purge(); });

    /* Disparition en temps réel : on redessine régulièrement. */
    clearInterval(this.#fadeTimer);
    this.#fadeTimer = setInterval(() => {
      if (this.types().some(t => t.fade?.mode === "real")) { this.draw(); this.purge(); }
    }, 30000);

    onSocketMessage((p) => {
      if (p?.type === "sbeTraceAdd") this.#addEphemeral(p.scene, p.entries ?? []);
      if (p?.type === "sbeTraceClear" && p.scene === canvas.scene?.id) this.#clearEphemeral(p.typeId);
    });

    /* Barre de gauche (MJ) : tacher les pions choisis, nettoyer la scène. */
    Hooks.on("getSceneControlButtons", (controls) => {
      const group = controls.tokens ?? controls.token;
      if (!group?.tools) return;
      /* Pister : pour tout le monde, s'il y a des traces cachées à trouver. */
      if (this.canTrack()) {
        group.tools.sbeTraceTrack = {
          name: "sbeTraceTrack", order: 90, title: "SBE.Traces.Track", icon: "fa-solid fa-magnifying-glass", button: true,
          onChange: () => this.track()
        };
      }
      if (!game.user.isGM) return;
      group.tools.sbeTraceSplat = {
        name: "sbeTraceSplat", order: 91, title: "SBE.Traces.ToolSplat", icon: "fa-solid fa-droplet", button: true,
        onChange: () => this.splatSelected()
      };
      group.tools.sbeTraceClear = {
        name: "sbeTraceClear", order: 92, title: "SBE.Traces.ToolClear", icon: "fa-solid fa-broom", button: true,
        onChange: () => this.askClear()
      };
    });
  }

  /** MJ principal : lit d'avance les dossiers d'images (les traînées n'attendent pas). */
  static #preloadFolders() {
    if (!isPrimaryGM()) return;
    for (const t of this.types()) if (t.enabled && t.imageFolder) this.loadFolder(t.imageFolder, { force: true });
  }

  static #revealed(e) {
    const now = Date.now();
    this.#reveals = this.#reveals.filter(r => r.until > now);
    return this.#reveals.some(r => Math.hypot(e.x - r.x, e.y - r.y) <= r.r);
  }

  /** Y a-t-il de quoi pister (une clé de jet et un type caché) ? */
  static canTrack() {
    return !!this.options().track.key && this.types().some(t => t.enabled && t.hidden);
  }

  /**
   * Bouton « Pister » : le jet de pistage du pion contrôlé. Réussi, les
   * traces cachées autour de lui apparaissent (pour ce joueur) pendant
   * quelques minutes.
   */
  static async track() {
    const opt = this.options().track;
    const tok = canvas.tokens?.controlled?.[0];
    const actor = tok?.actor;
    if (!actor) return ui.notifications.warn(game.i18n.localize("SBE.Traces.TrackSelect"));
    const res = await rollField(actor, opt.key, { title: game.i18n.localize("SBE.Traces.Track"), after: "now" });
    if (!res) return ui.notifications.warn(game.i18n.format("SBE.Traces.TrackNoRoll", { key: opt.key }));
    if (!["success", "critSuccess", "done"].includes(res.outcome)) {
      return ui.notifications.info(game.i18n.localize("SBE.Traces.TrackFail"));
    }
    const gs = canvas.grid?.size || 100;
    const ms = Math.max(1, Number(opt.minutes) || 10) * 60000;
    this.#reveals.push({ x: tok.center.x, y: tok.center.y, r: Math.max(1, Number(opt.radius) || 6) * gs, until: Date.now() + ms });
    ui.notifications.info(game.i18n.format("SBE.Traces.TrackOk", { n: opt.minutes }));
    this.draw();
    setTimeout(() => this.draw(), ms + 100);
  }

  /** Âge lisible d'une trace (temps du monde, sinon temps réel). */
  static ageText(e) {
    const world = (game.time?.worldTime ?? 0) - (e.world ?? 0);
    const sec = world > 0 ? world : (Date.now() - (e.real ?? Date.now())) / 1000;
    const L = (k, d) => game.i18n.format(k, d);
    if (sec < 60) return game.i18n.localize("SBE.Traces.AgeNow");
    if (sec < 3600) return L("SBE.Traces.AgeMin", { n: Math.round(sec / 60) });
    if (sec < 86400) return L("SBE.Traces.AgeHours", { n: Math.round(sec / 3600) });
    return L("SBE.Traces.AgeDays", { n: Math.round(sec / 86400) });
  }

  /** Survol du plateau : nom et âge de la trace sous la souris. */
  static #onHover(ev) {
    const now = performance.now();
    if (now - this.#hoverAt < 80) return;
    this.#hoverAt = now;
    const hide = () => { if (this.#tip) this.#tip.style.display = "none"; };
    if (!canvas.ready || !this.#drawn.length || this.options().hoverAge === false) return hide();
    let p;
    try { p = canvas.canvasCoordinatesFromClient({ x: ev.clientX, y: ev.clientY }); } catch (_e) { return hide(); }
    const gs = canvas.grid?.size || 100;
    let best = null, bd = Infinity;
    for (const e of this.#drawn) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < bd && d <= gs * 0.32 * (e.s ?? 1) * 1.2) { bd = d; best = e; }
    }
    if (!best) return hide();
    if (!this.#tip) {
      this.#tip = document.createElement("div");
      this.#tip.className = "sbe-trace-tip";
      document.body.appendChild(this.#tip);
    }
    const t = this.types().find(x => x.id === best.t);
    this.#tip.textContent = `${t?.name ?? ""} — ${this.ageText(best)}`;
    this.#tip.style.left = `${ev.clientX + 14}px`;
    this.#tip.style.top = `${ev.clientY + 14}px`;
    this.#tip.style.display = "block";
  }

  /** Bouton « tacher » : les pions sélectionnés, avec le type choisi. */
  static async splatSelected() {
    const toks = canvas.tokens?.controlled ?? [];
    if (!toks.length) return ui.notifications.warn(game.i18n.localize("SBE.Traces.SelectTokens"));
    const types = this.types().filter(t => t.enabled);
    if (!types.length) return;
    let type = types[0];
    if (types.length > 1) {
      const id = await foundry.applications.api.DialogV2.wait({
        window: { title: game.i18n.localize("SBE.Traces.ToolSplat") },
        content: `<p>${game.i18n.localize("SBE.Traces.PickType")}</p>`,
        buttons: types.map(t => ({ action: t.id, label: t.name })),
        rejectClose: false
      }).catch(() => null);
      type = types.find(t => t.id === id);
      if (!type) return;
    }
    for (const t of toks) this.splat(t, type, { strength: 1.2 });
  }

  static async askClear() {
    const types = this.types();
    const id = await foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.localize("SBE.Traces.ToolClear") },
      content: `<p>${game.i18n.localize("SBE.Traces.ClearWhat")}</p>`,
      buttons: [{ action: "*all", label: game.i18n.localize("SBE.Traces.ClearAll"), icon: "fa-solid fa-broom" },
        ...types.map(t => ({ action: t.id, label: t.name }))],
      rejectClose: false
    }).catch(() => null);
    if (!id) return;
    await this.clear(canvas.scene, id === "*all" ? null : id);
  }
}
