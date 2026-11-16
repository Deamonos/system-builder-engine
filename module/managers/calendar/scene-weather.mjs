/**
 * SBE — LA MÉTÉO SUR LA SCÈNE (vue de tous)
 *
 * Chaque type de météo décrit ses couches de scène (calendar-model :
 * scene = [{ kind, color, color2, amount }]). Deux familles :
 *
 *   - « fx:<id> » : un effet météo de Foundry (pluie, averse, neige,
 *     blizzard, brouillard, feuilles…) RECOLORÉ et dosé. Pour chaque type,
 *     SBE inscrit dans CONFIG.weatherEffects une entrée « sbe-<id du
 *     type> » faite de copies de ces effets (mêmes moteurs, réglages
 *     changés). La scène porte cette entrée dans son champ météo : Foundry
 *     l'affiche chez tout le monde, comme ses propres météos.
 *
 *   - les couches SBE, dessinées par ce fichier au-dessus de la scène,
 *     chez chaque client, quand la scène porte une météo « sbe-… » :
 *       tint      voile coloré sur toute la scène
 *       pulse     voile qui palpite
 *       flash     éclairs : la scène s'illumine
 *       sparks    étincelles qui scintillent
 *       aurora    voiles d'aurore qui ondulent (deux couleurs)
 *       meteors   étoiles filantes / météores
 *       floaters  points lumineux en suspension (spores, feux follets…)
 *       dust      poussières qui montent
 *       arcs      arcs électriques
 *       heat      l'air qui tremble
 *
 * Les éclairs et les arcs suivent l'heure du SERVEUR : tous les joueurs
 * les voient au même instant.
 */

import { CalendarManager as CM } from "./calendar-manager.mjs";
import { seeded } from "./calendar-model.mjs";

export const FX_PREFIX = "sbe-";

const rgb = (hex) => {
  const n = parseInt(String(hex).slice(1), 16) || 0;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const num = (hex) => parseInt(String(hex).slice(1), 16) || 0xffffff;

/* ============================================================ */
/*  Les effets de Foundry, recolorés                             */
/* ============================================================ */

/** Les effets météo de Foundry (sans ceux de SBE) : { id: libellé }. */
export function foundryWeatherChoices() {
  const out = {};
  for (const [id, cfg] of Object.entries(CONFIG.weatherEffects ?? {})) {
    if (id.startsWith(FX_PREFIX) || !cfg?.effects) continue;
    out[id] = game.i18n.localize(cfg.label ?? id);
  }
  return out;
}

/* Copies d'origine des effets de Foundry (avant toute inscription SBE). */
let ORIGINALS = null;

/** Une copie d'un effet de Foundry, teintée et dosée. */
function recolor(effect, color, amount) {
  const cfg = { ...(effect.config ?? {}) };
  const uniforms = effect.shaderClass?.defaultUniforms ?? {};
  const has = (k) => k in cfg || k in uniforms;
  if (has("tint")) cfg.tint = rgb(color);
  if ("intensity" in cfg) cfg.intensity = Number(cfg.intensity) * amount;
  else if (has("intensity")) cfg.intensity = amount;
  if ("opacity" in cfg) cfg.opacity = Math.min(1, Number(cfg.opacity) * Math.min(1.5, amount));
  const out = { ...effect, id: `${effect.id ?? "fx"}-${Math.random().toString(36).slice(2, 7)}`, config: cfg };
  /* Effets à particules (feuilles…) : la teinte et la quantité passent par leur configuration. */
  if (Array.isArray(effect.particles)) out.particles = effect.particles.map(p => ({ ...p, tint: num(color), count: p.count ? Math.round(p.count * amount) : p.count }));
  return out;
}

/** Inscrit (ou réinscrit) une entrée « sbe-<id> » par type de météo. */
export function registerSceneEffects(types) {
  if (!CONFIG.weatherEffects) return;
  ORIGINALS ??= Object.fromEntries(Object.entries(CONFIG.weatherEffects).filter(([id]) => !id.startsWith(FX_PREFIX)));
  for (const id of Object.keys(CONFIG.weatherEffects)) if (id.startsWith(FX_PREFIX)) delete CONFIG.weatherEffects[id];
  for (const t of types) {
    const effects = [];
    let filter = null;
    for (const l of t.scene) {
      if (!l.kind.startsWith("fx:")) continue;
      const base = ORIGINALS[l.kind.slice(3)];
      if (!base?.effects) continue;
      filter ??= base.filter ?? null;
      for (const e of base.effects) effects.push(recolor(e, l.color, l.amount));
    }
    const entry = { id: `${FX_PREFIX}${t.id}`, label: t.name, effects };
    if (filter) entry.filter = filter;
    CONFIG.weatherEffects[entry.id] = entry;
  }
}

/** Le type de météo porté par la scène (ou null). */
export function sceneWeatherType(scene = canvas?.scene) {
  const w = String(scene?.weather ?? "");
  if (!w.startsWith(FX_PREFIX)) return null;
  return CM.weatherType(w.slice(FX_PREFIX.length));
}

/* ============================================================ */
/*  Les couches SBE, dessinées au-dessus de la scène             */
/* ============================================================ */

/* Textures fabriquées une fois : un point doux, une bande floue. */
let TEX = null;
function textures() {
  if (TEX) return TEX;
  const make = (w, h, paint) => {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    paint(c.getContext("2d"), w, h);
    return PIXI.Texture.from(c);
  };
  TEX = {
    dot: make(64, 64, (g, w) => {
      const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.25, "rgba(255,255,255,.8)"); r.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = r; g.fillRect(0, 0, w, w);
    }),
    /* Rideau d'aurore : lumineux en bas, qui s'efface vers le haut. */
    curtain: make(64, 256, (g, w, h) => {
      const v = g.createLinearGradient(0, 0, 0, h);
      v.addColorStop(0, "rgba(255,255,255,0)"); v.addColorStop(0.7, "rgba(255,255,255,.55)"); v.addColorStop(0.92, "rgba(255,255,255,1)"); v.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = v; g.fillRect(0, 0, w, h);
    }),
    band: make(256, 64, (g, w, h) => {
      const v = g.createLinearGradient(0, 0, 0, h);
      v.addColorStop(0, "rgba(255,255,255,0)"); v.addColorStop(0.5, "rgba(255,255,255,1)"); v.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = v; g.fillRect(0, 0, w, h);
      const fade = g.createLinearGradient(0, 0, w, 0);
      fade.addColorStop(0, "rgba(0,0,0,1)"); fade.addColorStop(0.2, "rgba(0,0,0,0)"); fade.addColorStop(0.8, "rgba(0,0,0,0)"); fade.addColorStop(1, "rgba(0,0,0,1)");
      g.globalCompositeOperation = "destination-out"; g.fillStyle = fade; g.fillRect(0, 0, w, h);
    })
  };
  return TEX;
}

/** Nombre de particules pour la scène : selon sa surface, borné. */
function countFor(rect, perMega, amount) {
  return Math.max(4, Math.min(600, Math.round((rect.width * rect.height) / 1e6 * perMega * amount)));
}

/** Instant partagé par tous (heure du serveur, en secondes). */
const sharedNow = () => (game.time?.serverTime ?? Date.now()) / 1000;

/**
 * Une couche : { root (PIXI), tick(dtSec, now) }.
 * `rect` : la scène (coordonnées de la toile), `full` : toute la toile.
 */
const LAYERS = {
  tint(l, rect, full) {
    const g = new PIXI.Graphics();
    g.beginFill(num(l.color), Math.min(0.85, 0.12 * l.amount)).drawRect(full.x, full.y, full.width, full.height).endFill();
    return { root: g, tick() {} };
  },

  pulse(l, rect, full) {
    const g = new PIXI.Graphics();
    g.beginFill(num(l.color), 1).drawRect(full.x, full.y, full.width, full.height).endFill();
    const max = Math.min(0.8, 0.14 * l.amount);
    return { root: g, tick(_dt, now) { g.alpha = max * (0.55 + 0.45 * Math.sin(now * 1.6)); } };
  },

  flash(l, rect, full) {
    const g = new PIXI.Graphics();
    g.beginFill(num(l.color), 1).drawRect(full.x, full.y, full.width, full.height).endFill();
    g.blendMode = PIXI.BLEND_MODES.ADD;
    g.alpha = 0;
    /* Chaque seconde partagée a une chance d'éclair ; double éclat. */
    const chance = Math.min(0.5, 0.07 * l.amount);
    let struck = -1;
    return {
      root: g,
      tick(_dt, now) {
        const s = Math.floor(now), f = now - s;
        if (seeded(`flash:${s}`) >= chance) { g.alpha = 0; return; }
        const at = seeded(`flash-at:${s}`) * 0.6;
        const t = f - at;
        /* L'éclat commence : les sons « sur l'éclair » partent au même instant. */
        if (t >= 0 && struck !== s) { struck = s; Hooks.callAll("sbeWeatherFlash", { second: s }); }
        g.alpha = t < 0 ? 0 : t < 0.08 ? 0.55 : t < 0.16 ? 0.1 : t < 0.24 ? 0.4 : Math.max(0, 0.4 - (t - 0.24) * 1.2);
      }
    };
  },

  sparks(l, rect) {
    const c = new PIXI.Container();
    const n = countFor(rect, 80, l.amount), list = [];
    for (let i = 0; i < n; i++) {
      const p = new PIXI.Sprite(textures().dot);
      p.anchor.set(0.5); p.tint = num(l.color); p.blendMode = PIXI.BLEND_MODES.ADD;
      p.x = rect.x + Math.random() * rect.width; p.y = rect.y + Math.random() * rect.height;
      p.scale.set(0.15 + Math.random() * 0.2);
      list.push({ p, ph: Math.random() * 6.28, sp: 1 + Math.random() * 2, vy: -6 - Math.random() * 10 });
      c.addChild(p);
    }
    return {
      root: c,
      tick(dt, now) {
        for (const s of list) {
          s.p.alpha = Math.max(0, Math.sin(now * s.sp + s.ph));
          s.p.y += s.vy * dt;
          if (s.p.y < rect.y) s.p.y = rect.y + rect.height;
        }
      }
    };
  },

  aurora(l, rect) {
    /* Des rideaux souples : une bande lumineuse qui suit une courbe ondulante. */
    const c = new PIXI.Container();
    const curtains = [];
    const N = 24;
    for (let i = 0; i < 3; i++) {
      const pts = Array.from({ length: N }, (_, k) => new PIXI.Point(rect.x - rect.width * 0.1 + (rect.width * 1.2 * k) / (N - 1), 0));
      const rope = new PIXI.SimpleRope(textures().curtain, pts, 0);
      rope.tint = num(i === 1 ? l.color2 : l.color);
      rope.blendMode = PIXI.BLEND_MODES.ADD;
      /* Épaisseur du rideau : la hauteur de la texture, mise à l'échelle. */
      rope.scale.y = 1;
      curtains.push({ rope, pts, y0: rect.y + rect.height * (0.18 + i * 0.14), ph: i * 2.1, amp: rect.height * (0.05 + i * 0.015), thick: rect.height * (0.25 - i * 0.04) / 256 });
      c.addChild(rope);
    }
    const a = Math.min(0.7, 0.3 * l.amount);
    return {
      root: c,
      tick(_dt, now) {
        for (const s of curtains) {
          s.pts.forEach((p, k) => {
            const u = k / (N - 1);
            p.y = (s.y0 + Math.sin(u * 5 + now * 0.35 + s.ph) * s.amp + Math.sin(u * 11 - now * 0.5) * s.amp * 0.35) / s.thick;
          });
          s.rope.scale.y = s.thick;
          s.rope.alpha = a * (0.65 + 0.35 * Math.sin(now * 0.6 + s.ph));
        }
      }
    };
  },

  meteors(l, rect) {
    const g = new PIXI.Graphics();
    g.blendMode = PIXI.BLEND_MODES.ADD;
    const color = num(l.color);
    const live = [];
    const span = Math.max(rect.width, rect.height);
    let acc = 0;
    return {
      root: g,
      tick(dt) {
        acc += dt * 0.8 * l.amount;
        while (acc > 1) {
          acc -= 1;
          live.push({ x: rect.x + Math.random() * rect.width * 1.2, y: rect.y - Math.random() * rect.height * 0.2, t: 0, d: 0.7 + Math.random() * 0.8, len: span * (0.06 + Math.random() * 0.06) });
        }
        g.clear();
        for (let i = live.length - 1; i >= 0; i--) {
          const m = live[i];
          m.t += dt;
          if (m.t > m.d) { live.splice(i, 1); continue; }
          const k = m.t / m.d, dist = span * 0.35 * k;
          const hx = m.x - dist * 0.8, hy = m.y + dist * 0.6;
          const alpha = Math.sin(k * Math.PI);
          g.lineStyle({ width: Math.max(2, span / 900), color, alpha });
          g.moveTo(hx + m.len * 0.8, hy - m.len * 0.6).lineTo(hx, hy);
          g.lineStyle(0).beginFill(color, alpha).drawCircle(hx, hy, Math.max(3, span / 500)).endFill();
        }
      }
    };
  },

  floaters(l, rect) {
    const c = new PIXI.Container();
    const n = countFor(rect, 30, l.amount), list = [];
    for (let i = 0; i < n; i++) {
      const p = new PIXI.Sprite(textures().dot);
      p.anchor.set(0.5); p.tint = num(l.color); p.blendMode = PIXI.BLEND_MODES.ADD;
      const x = rect.x + Math.random() * rect.width, y = rect.y + Math.random() * rect.height;
      p.position.set(x, y);
      p.scale.set(0.3 + Math.random() * 0.5);
      list.push({ p, x, y, ph: Math.random() * 6.28, r: 10 + Math.random() * 30 });
      c.addChild(p);
    }
    return {
      root: c,
      tick(_dt, now) {
        for (const s of list) {
          s.p.x = s.x + Math.sin(now * 0.4 + s.ph) * s.r;
          s.p.y = s.y + Math.cos(now * 0.3 + s.ph) * s.r * 0.7;
          s.p.alpha = 0.45 + 0.4 * Math.sin(now * 0.9 + s.ph);
        }
      }
    };
  },

  dust(l, rect) {
    const c = new PIXI.Container();
    const n = countFor(rect, 70, l.amount), list = [];
    for (let i = 0; i < n; i++) {
      const p = new PIXI.Sprite(textures().dot);
      p.anchor.set(0.5); p.tint = num(l.color); p.blendMode = PIXI.BLEND_MODES.ADD;
      p.position.set(rect.x + Math.random() * rect.width, rect.y + Math.random() * rect.height);
      p.scale.set(0.1 + Math.random() * 0.15);
      list.push({ p, vy: -(20 + Math.random() * 40), ph: Math.random() * 6.28 });
      c.addChild(p);
    }
    return {
      root: c,
      tick(dt, now) {
        for (const s of list) {
          s.p.y += s.vy * dt;
          s.p.x += Math.sin(now + s.ph) * 8 * dt;
          if (s.p.y < rect.y) { s.p.y = rect.y + rect.height; s.p.x = rect.x + Math.random() * rect.width; }
          s.p.alpha = 0.5 + 0.4 * Math.sin(now * 2 + s.ph);
        }
      }
    };
  },

  arcs(l, rect) {
    const g = new PIXI.Graphics();
    g.blendMode = PIXI.BLEND_MODES.ADD;
    const color = num(l.color);
    const span = Math.max(rect.width, rect.height);
    const chance = Math.min(0.8, 0.25 * l.amount);
    return {
      root: g,
      tick(_dt, now) {
        g.clear();
        /* Créneaux de 0,4 s partagés : chaque arc a sa place et sa forme. */
        const slot = Math.floor(now / 0.4);
        for (let k = 0; k < 3; k++) {
          if (seeded(`arc:${slot}:${k}`) >= chance) continue;
          const x = rect.x + seeded(`arcx:${slot}:${k}`) * rect.width, y = rect.y + seeded(`arcy:${slot}:${k}`) * rect.height;
          const len = span * (0.05 + seeded(`arcl:${slot}:${k}`) * 0.08);
          const ang = seeded(`arca:${slot}:${k}`) * Math.PI * 2;
          g.lineStyle({ width: Math.max(2, span / 1200), color, alpha: 0.9 });
          g.moveTo(x, y);
          for (let j = 1; j <= 7; j++) {
            const t = j / 7, off = (Math.random() - 0.5) * len * 0.25;
            g.lineTo(x + Math.cos(ang) * len * t - Math.sin(ang) * off, y + Math.sin(ang) * len * t + Math.cos(ang) * off);
          }
        }
      }
    };
  },

  heat(l, rect) {
    const c = new PIXI.Container();
    const list = [];
    const n = Math.round(6 * l.amount) + 4;
    for (let i = 0; i < n; i++) {
      const b = new PIXI.Sprite(textures().band);
      b.anchor.set(0.5); b.tint = num(l.color); b.blendMode = PIXI.BLEND_MODES.ADD;
      b.width = rect.width * (0.5 + Math.random() * 0.6);
      b.height = rect.height * 0.04;
      b.position.set(rect.x + Math.random() * rect.width, rect.y + Math.random() * rect.height);
      list.push({ b, ph: Math.random() * 6.28, vy: -(15 + Math.random() * 25) });
      c.addChild(b);
    }
    return {
      root: c,
      tick(dt, now) {
        for (const s of list) {
          s.b.y += s.vy * dt;
          if (s.b.y < rect.y) s.b.y = rect.y + rect.height;
          s.b.skew.x = Math.sin(now * 2 + s.ph) * 0.15;
          s.b.alpha = 0.05 + 0.04 * Math.sin(now * 3 + s.ph);
        }
      }
    };
  }
};

/* ============================================================ */
/*  Le calque                                                    */
/* ============================================================ */

export class SceneWeather {
  static #root = null;
  static #layers = [];
  static #ticker = null;
  static #key = "";

  static init() {
    Hooks.on("canvasReady", () => this.draw(true));
    Hooks.on("canvasTearDown", () => this.clear());
    Hooks.on("updateScene", (scene, changes) => {
      if (scene.id === canvas?.scene?.id && ("weather" in changes || "dimensions" in changes || "width" in changes || "height" in changes)) this.draw(true);
    });
  }

  /** Après un changement des types de météo : Foundry et SBE redessinent la météo de la scène. */
  static refresh() {
    registerSceneEffects(CM.weatherTypes());
    const w = String(canvas?.scene?.weather ?? "");
    if (canvas?.ready && w.startsWith(FX_PREFIX)) {
      try { canvas.weather?.initializeEffects?.(CONFIG.weatherEffects[w]); } catch (err) { console.warn("SBE | Météo de scène : effet Foundry en échec", err); }
    }
    this.draw(true);
  }

  static clear() {
    if (this.#ticker) { canvas?.app?.ticker?.remove(this.#ticker); this.#ticker = null; }
    this.#root?.destroy({ children: true });
    this.#root = null;
    this.#layers = [];
    this.#key = "";
  }

  /** Dessine les couches SBE de la météo portée par la scène. */
  static draw(force = false) {
    if (!canvas?.ready) return;
    const type = sceneWeatherType();
    const key = type ? JSON.stringify([type.id, type.scene, canvas.scene.id]) : "";
    if (!force && key === this.#key) return;
    this.clear();
    this.#key = key;
    const own = (type?.scene ?? []).filter(l => LAYERS[l.kind]);
    if (!own.length) return;
    const parent = canvas.weather ?? canvas.primary;
    if (!parent) return;
    const d = canvas.dimensions;
    const rect = d.sceneRect, full = d.rect;
    this.#root = new PIXI.Container();
    this.#root.eventMode = "none";
    this.#root.sortLayer = parent.sortLayer;
    for (const l of own) {
      try {
        const layer = LAYERS[l.kind](l, rect, full);
        this.#layers.push(layer);
        this.#root.addChild(layer.root);
      } catch (err) { console.warn(`SBE | Météo de scène : couche « ${l.kind} » en échec`, err); }
    }
    parent.addChild(this.#root);
    this.#ticker = () => {
      const dt = Math.min(0.1, (canvas.app.ticker.deltaMS ?? 16) / 1000);
      const now = sharedNow();
      for (const layer of this.#layers) layer.tick(dt, now);
    };
    canvas.app.ticker.add(this.#ticker);
  }
}
