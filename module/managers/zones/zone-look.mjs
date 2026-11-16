/**
 * SBE — ZONES PERSISTANTES : l'apparence (palier 3)
 *
 * Tout ce qui se VOIT et s'ENTEND d'une zone, avec des documents natifs
 * de Foundry (créés par le MJ principal, supprimés avec la zone) :
 *   - image ou vidéo (tirée au hasard dans la liste de l'objet) : une
 *     TUILE sous les pions — Foundry lit la vidéo en boucle et garde la
 *     texture en cache (une seule par fichier, partagée) ;
 *   - lumière : une lumière d'ambiance au centre de la zone ;
 *   - son en boucle : un son d'ambiance au centre (portée = la zone) ;
 *     son à l'apparition : joué une fois pour tous.
 * La tuile, la lumière et le son suivent la zone (aura qui se déplace,
 * zone qui rétrécit) et s'estompent avec sa puissance.
 *
 * « Bloque la vue » : un pion dans la zone est caché à ceux qui ne le
 * possèdent pas (classe de pion propre à SBE, déclarée à Foundry — rien
 * n'est forcé dans le code de Foundry). Le MJ voit tout.
 *
 * Annonce (au choix du MJ, sur l'objet) : une info-bulle au survol de la
 * zone (nom, temps restant), et/ou une ligne dans le chat quand
 * quelqu'un est touché.
 *
 * Aucune minuterie : le survol n'écoute la souris que s'il y a des zones
 * à annoncer sur la scène ; tout est débranché à la fermeture de la scène.
 */

import { SYSTEM_ID, soundGain } from "../../helpers/constants.mjs";
import { isPrimaryGM } from "../../helpers/socket.mjs";
import { Identity } from "../../helpers/identity.mjs";
import { ChatCards } from "../chat/chat-cards.mjs";
import { EffectManager } from "../effects/effect-manager.mjs";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const flagsOf = (region) => region?.flags?.[SYSTEM_ID]?.zone ?? null;
const isZone = (region) => !!flagsOf(region)?.cfg;

/** Les points des polygones d'une Région → leur boîte. */
export function boundsOf(shapes) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const sh of shapes ?? []) {
    const p = Array.isArray(sh?.points) ? sh.points : [];
    for (let i = 0; i + 1 < p.length; i += 2) {
      x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]);
      y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]);
    }
  }
  if (!Number.isFinite(x0)) return null;
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0), cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

/** Une liste de fichiers → l'un d'eux, au hasard. */
const pick = (list) => (list?.length ? list[Math.floor(Math.random() * list.length)] : "");

export class ZoneLook {

  static _bound = false;
  /** Survol : écouteur branché sur le plateau, et la bulle. */
  static #hover = null;
  /** Fonctions de la zone (posées par PersistentZones : pas d'import croisé). */
  static #api = { ratioOf: () => 1, remainingOf: () => ({ rounds: Infinity, seconds: Infinity }) };

  static init(api) {
    if (this._bound) return;
    this._bound = true;
    if (api) this.#api = { ...this.#api, ...api };

    /* La classe de pion de SBE : « bloque la vue ». */
    const Base = CONFIG.Token.objectClass;
    const Look = this;
    class SBEToken extends Base {
      get isVisible() {
        if (Look.concealed(this)) return false;
        return super.isVisible;
      }
    }
    CONFIG.Token.objectClass = SBEToken;

    /* Une zone apparaît, change ou disparaît : la visibilité des pions
       et le survol se remettent à jour (chez chaque client). */
    const changed = (region) => {
      if (!isZone(region) || region.parent !== canvas?.scene) return;
      this.refreshVisibility();
      this.#syncHover();
      this.#outline(region);
    };
    Hooks.on("createRegion", changed);
    Hooks.on("updateRegion", (region, changes) => {
      changed(region);
      /* La forme a bougé (aura, zone qui rétrécit, fusion) : la tuile, la
         lumière et le son suivent (MJ principal). */
      if (isPrimaryGM() && isZone(region) && "shapes" in (changes ?? {})) {
        this.follow(region).catch(err => console.warn("SBE | Zones : suivi de l'apparence en échec", err));
      }
    });
    Hooks.on("deleteRegion", (region) => {
      changed(region);
      if (isPrimaryGM() && isZone(region)) this.remove(region).catch(err => console.warn("SBE | Zones : nettoyage de l'apparence en échec", err));
    });
    /* Un pion bouge : il entre ou sort peut-être d'une fumée. */
    Hooks.on("updateToken", (tokenDoc, changes) => {
      if (!("x" in (changes ?? {}) || "y" in (changes ?? {}))) return;
      if (!this.#blockingZones(tokenDoc.parent).length) return;
      setTimeout(() => this.refreshVisibility(), 50);
    });
    Hooks.on("canvasReady", () => {
      this.#syncHover();
      for (const r of canvas.scene?.regions?.contents ?? []) if (isZone(r)) this.#outline(r);
    });
    Hooks.on("canvasTearDown", () => {
      this.#unhover();
      for (const g of this.#outlines.values()) { try { g.destroy(); } catch (_e) { /* */ } }
      this.#outlines.clear();
    });
  }

  /* ---------------------------------------------------------- */
  /*  Apparition, suivi, disparition (MJ principal)              */
  /* ---------------------------------------------------------- */

  /** Tuile, lumière, son de la zone qui vient d'apparaître. */
  static async spawn(region) {
    const zf = flagsOf(region);
    const cfg = zf?.cfg;
    const scene = region?.parent;
    if (!cfg || !scene) return;
    const b = boundsOf(region.shapes);
    if (!b) return;
    const ids = {};
    const unit = Number(scene.grid?.distance) || 1;
    const look = cfg.look ?? {};
    const flags = { [SYSTEM_ID]: { zoneLook: region.id } };

    /* Image ou vidéo, sous les pions. */
    const src = pick(look.media);
    if (src) {
      try {
        const [tile] = await scene.createEmbeddedDocuments("Tile", [{
          /* Foundry v14 : x / y d'une tuile = son point d'ancrage (ici le
             centre), plus le coin haut-gauche. */
          texture: { src, anchorX: 0.5, anchorY: 0.5 }, x: Math.round(b.cx), y: Math.round(b.cy), width: Math.round(b.w), height: Math.round(b.h),
          alpha: Math.max(0, Math.min(1, (Number(look.opacity) || 0) / 100)),
          elevation: 0, sort: -1000, hidden: !!region.hidden, locked: true,
          video: { loop: true, autoplay: true, volume: 0 },
          flags
        }]);
        if (tile) ids.tileId = tile.id;
      } catch (err) { console.warn("SBE | Zones : tuile de la zone en échec", err); }
    }

    /* Lumière. */
    const li = cfg.light ?? {};
    if (li.on) {
      try {
        const [light] = await scene.createEmbeddedDocuments("AmbientLight", [{
          x: b.cx, y: b.cy, hidden: !!region.hidden,
          config: {
            dim: (Number(li.dim) || 0) * unit, bright: (Number(li.bright) || 0) * unit,
            color: li.color || null, alpha: 0.5,
            animation: { type: li.animation || null, speed: Number(li.speed) || 5, intensity: Number(li.intensity) || 5 }
          },
          flags
        }]);
        if (light) ids.lightId = light.id;
      } catch (err) { console.warn("SBE | Zones : lumière de la zone en échec", err); }
    }

    /* Son en boucle, entendu dans la zone (et un peu autour). */
    const loop = look.sound ?? {};
    if (loop.src) {
      try {
        const radius = (Math.max(b.w, b.h) / 2) / ((Number(scene.dimensions?.size) || 100) / unit) + unit;
        const [snd] = await scene.createEmbeddedDocuments("AmbientSound", [{
          x: b.cx, y: b.cy, radius, path: loop.src, repeat: true, walls: true, easing: true,
          volume: soundGain(loop.volume ?? 60), hidden: !!region.hidden,
          flags
        }]);
        if (snd) ids.soundId = snd.id;
      } catch (err) { console.warn("SBE | Zones : son de la zone en échec", err); }
    }

    /* Son à l'apparition : une fois, pour toute la table. */
    const start = look.startSound ?? {};
    if (start.src) {
      try { foundry.audio.AudioHelper.play({ src: start.src, volume: soundGain(start.volume ?? 80), loop: false }, true); }
      catch (err) { console.warn("SBE | Zones : son d'apparition en échec", err); }
    }

    if (Object.keys(ids).length) await region.update({ [`flags.${SYSTEM_ID}.zone.lookIds`]: ids });
  }

  /** Toutes les tuiles d'une zone (la sienne + celles des morceaux fusionnés). */
  static #tilesOf(region) {
    const ids = flagsOf(region)?.lookIds ?? {};
    const scene = region?.parent;
    return [ids.tileId, ...(Array.isArray(ids.tileIds) ? ids.tileIds : [])]
      .filter(Boolean).map(id => scene?.tiles?.get(id)).filter(Boolean);
  }

  /** Une tuile d'image pour ces formes (image tirée au hasard). */
  static async #tileFor(scene, region, shapes, look) {
    const b = boundsOf(shapes);
    const src = pick(look?.media);
    if (!b || !src || !scene) return null;
    const [tile] = await scene.createEmbeddedDocuments("Tile", [{
      texture: { src, anchorX: 0.5, anchorY: 0.5 }, x: Math.round(b.cx), y: Math.round(b.cy), width: Math.round(b.w), height: Math.round(b.h),
      alpha: Math.max(0, Math.min(1, (Number(look.opacity) || 0) / 100)),
      elevation: 0, sort: -1000, hidden: !!region.hidden, locked: true,
      video: { loop: true, autoplay: true, volume: 0 },
      flags: { [SYSTEM_ID]: { zoneLook: region.id } }
    }]);
    return tile?.id ?? null;
  }

  /**
   * Fusion « une image par morceau » (MJ) : les images des zones absorbées
   * passent à la zone qui reste, la nouvelle zone pose la sienne.
   */
  static async mergeEach(keep, absorbed, newShapes, newLook) {
    const scene = keep.parent;
    const ids = flagsOf(keep)?.lookIds ?? {};
    const extra = Array.isArray(ids.tileIds) ? [...ids.tileIds] : [];
    for (const r of absorbed) {
      const o = flagsOf(r)?.lookIds ?? {};
      const moved = [o.tileId, ...(Array.isArray(o.tileIds) ? o.tileIds : [])].filter(id => id && scene.tiles.get(id));
      if (!moved.length) continue;
      extra.push(...moved);
      /* Elles ne partent plus avec la zone absorbée. */
      await r.update({ [`flags.${SYSTEM_ID}.zone.lookIds.tileId`]: null, [`flags.${SYSTEM_ID}.zone.lookIds.tileIds`]: [] });
    }
    const fresh = await this.#tileFor(scene, keep, newShapes, newLook);
    if (fresh) extra.push(fresh);
    await keep.update({ [`flags.${SYSTEM_ID}.zone.lookIds.tileIds`]: extra });
  }

  /** La zone a bougé ou changé de taille : tuile, lumière, son suivent. */
  static async follow(region) {
    const zf = flagsOf(region);
    const ids = zf?.lookIds ?? {};
    const scene = region.parent;
    const b = boundsOf(region.shapes);
    if (!b || !scene) return;
    /* Fusion « une image par morceau » : chaque image reste sur son morceau. */
    const tile = ids.tileId && !zf.lookEach ? scene.tiles.get(ids.tileId) : null;
    if (tile) await tile.update({ x: Math.round(b.cx), y: Math.round(b.cy), width: Math.round(b.w), height: Math.round(b.h), "texture.anchorX": 0.5, "texture.anchorY": 0.5 });
    const light = ids.lightId ? scene.lights.get(ids.lightId) : null;
    if (light) await light.update({ x: b.cx, y: b.cy });
    const snd = ids.soundId ? scene.sounds.get(ids.soundId) : null;
    if (snd) await snd.update({ x: b.cx, y: b.cy });
  }

  /** La zone faiblit : l'image s'estompe avec sa puissance. */
  static async fade(region, worldTime) {
    const zf = flagsOf(region);
    const tiles = this.#tilesOf(region);
    if (!tiles.length || (Number(zf?.cfg?.endPower ?? 100) >= 100)) return;
    const base = Math.max(0, Math.min(1, (Number(zf.cfg?.look?.opacity) || 0) / 100));
    const alpha = Math.round(base * this.#api.ratioOf(zf, worldTime) * 100) / 100;
    for (const tile of tiles) if (Math.abs((tile.alpha ?? 1) - alpha) >= 0.01) await tile.update({ alpha });
  }

  /** La zone a disparu : sa tuile, sa lumière et son son aussi. */
  static async remove(region) {
    const ids = flagsOf(region)?.lookIds ?? {};
    const scene = region.parent;
    if (!scene) return;
    const del = async (coll, name, id) => { if (id && coll?.get(id)) await scene.deleteEmbeddedDocuments(name, [id]); };
    await del(scene.tiles, "Tile", ids.tileId);
    for (const id of Array.isArray(ids.tileIds) ? ids.tileIds : []) await del(scene.tiles, "Tile", id);
    await del(scene.lights, "AmbientLight", ids.lightId);
    await del(scene.sounds, "AmbientSound", ids.soundId);
  }

  /* ---------------------------------------------------------- */
  /*  Contour d'une zone à image (sans hachures par-dessus)      */
  /* ---------------------------------------------------------- */

  /** Contours dessinés chez ce client : id de la Région → graphique. */
  static #outlines = new Map();

  /**
   * Une zone qui a une image ou une vidéo n'affiche pas la Région de
   * Foundry (ses hachures recouvriraient l'image) : on trace seulement
   * son contour, à sa couleur. Dessiné par chaque client, rien d'écrit.
   */
  static #outline(region) {
    const old = this.#outlines.get(region.id);
    if (old) { try { old.destroy(); } catch (_e) { /* */ } this.#outlines.delete(region.id); }
    const zf = flagsOf(region);
    const alive = region.parent?.regions?.get?.(region.id);
    if (!alive || !zf?.cfg?.look?.media?.length || region.parent !== canvas?.scene || !canvas.interface) return;
    if (region.hidden && !game.user.isGM) return;
    let polys = [];
    try { polys = (region.polygons ?? []).map(p => p.points); } catch (_e) { polys = []; }
    if (!polys.length) polys = (region.shapes ?? []).map(sh => sh.points ?? []).filter(p => p.length >= 6);
    if (!polys.length) return;
    const g = new PIXI.Graphics();
    g.eventMode = "none";
    let col = 0xffffff;
    try { col = Number(foundry.utils.Color.from(region.color)); } catch (_e) { /* blanc */ }
    const w = 3 * (canvas.dimensions?.uiScale || 1);
    for (const pts of polys) g.lineStyle(w, col, 0.9).drawPolygon(pts);
    canvas.interface.addChild(g);
    this.#outlines.set(region.id, g);
  }

  /* ---------------------------------------------------------- */
  /*  « Bloque la vue »                                          */
  /* ---------------------------------------------------------- */

  static #blockingZones(scene) {
    return (scene?.regions?.contents ?? []).filter(r => flagsOf(r)?.cfg?.blockSight);
  }

  /** Ce pion est-il caché, pour ce joueur, par une zone qui bloque la vue ? */
  static concealed(token) {
    if (game.user.isGM) return false;
    const doc = token?.document;
    if (!doc || doc.isOwner) return false;
    for (const r of doc.regions ?? []) {
      if (flagsOf(r)?.cfg?.blockSight) return true;
    }
    return false;
  }

  /** Recalcule qui voit quoi (après une zone posée, un pion déplacé). */
  static refreshVisibility() {
    if (!canvas?.ready) return;
    for (const t of canvas.tokens?.placeables ?? []) {
      try { t.renderFlags.set({ refreshVisibility: true }); } catch (_e) { /* pion en cours de dessin */ }
    }
  }

  /* ---------------------------------------------------------- */
  /*  Annonce : chat                                             */
  /* ---------------------------------------------------------- */

  /** Quelqu'un vient d'être touché : une ligne dans le chat (MJ). */
  static async announce(region, tokenDoc, keys) {
    const zf = flagsOf(region);
    const mode = zf?.cfg?.announce ?? "tooltip";
    if (!(mode === "chat" || mode === "both") || !keys?.length) return;
    const actor = tokenDoc?.actor;
    const labels = keys.map(k => EffectManager.getDef(k)?.label || k);
    const who = actor ? `<b data-ref-name="${esc(Identity.refOf(actor))}"></b>` : esc(tokenDoc?.name ?? "");
    await ChatCards.post({
      type: "zone",
      icon: zf.item?.img || "",
      title: region.name || L("SBE.PZone.Zone"),
      body: `<div class="sbe-card-line">${L("SBE.PZone.ChatHit", { who, effects: esc(labels.join(", ")) })}</div>`
    });
  }

  /* ---------------------------------------------------------- */
  /*  Annonce : info-bulle au survol de la zone                  */
  /* ---------------------------------------------------------- */

  /** Le texte du temps restant (« 2 rounds · 8 min »). */
  static #leftText(zf) {
    const left = this.#api.remainingOf(zf);
    const bits = [];
    if (Number.isFinite(left.rounds)) bits.push(L("SBE.PZone.LeftRounds", { n: left.rounds }));
    if (Number.isFinite(left.seconds)) {
      const s = Math.max(0, Math.round(left.seconds));
      bits.push(s >= 3600 ? L("SBE.PZone.LeftHours", { n: Math.ceil(s / 3600) })
        : s >= 60 ? L("SBE.PZone.LeftMinutes", { n: Math.ceil(s / 60) }) : L("SBE.PZone.LeftSeconds", { n: s }));
    }
    return bits.join(" · ") || L("SBE.PZone.LeftForever");
  }

  static #tipZones() {
    return (canvas?.scene?.regions?.contents ?? []).filter(r => {
      /* Seulement les ZONES persistantes : pas les autres régions (traces,
         poste de travail, régions du MJ). */
      const zf = flagsOf(r);
      if (!zf) return false;
      const m = zf.cfg?.announce ?? "tooltip";
      return (m === "tooltip" || m === "both") && (!r.hidden || game.user.isGM);
    });
  }

  /** Branche le survol seulement s'il y a des zones à annoncer. */
  static #syncHover() {
    if (!canvas?.ready) return;
    const need = this.#tipZones().length > 0;
    if (need && !this.#hover) this.#wireHover();
    else if (!need && this.#hover) this.#unhover();
  }

  static #wireHover() {
    const view = canvas.app?.canvas ?? canvas.app?.view;
    if (!view) return;
    const anchor = document.createElement("div");
    anchor.className = "sbe-zone-tipanchor";
    document.body.appendChild(anchor);
    let last = 0, current = null;
    const hide = () => {
      if (current) { try { game.tooltip.deactivate(); } catch (_e) { /* */ } current = null; }
    };
    const onMove = (ev) => {
      const now = performance.now();
      if (now - last < 120) return;
      last = now;
      let p;
      try { p = canvas.canvasCoordinatesFromClient({ x: ev.clientX, y: ev.clientY }); } catch (_e) { return; }
      const r = this.#tipZones().find(z => { try { return z.polygonTree?.testPoint(p); } catch (_e) { return false; } });
      if (!r) return hide();
      anchor.style.left = `${ev.clientX}px`;
      anchor.style.top = `${ev.clientY - 8}px`;
      const html = `<div class="sbe-tt sbe-zone-tt"><b>${esc(r.name || L("SBE.PZone.Zone"))}</b><br>${esc(this.#leftText(flagsOf(r)))}</div>`;
      if (current === r.id) return;
      current = r.id;
      try { game.tooltip.activate(anchor, { html, direction: "UP" }); } catch (_e) { /* */ }
    };
    view.addEventListener("pointermove", onMove);
    view.addEventListener("pointerleave", hide);
    this.#hover = { view, onMove, hide, anchor };
  }

  static #unhover() {
    const h = this.#hover;
    if (!h) return;
    h.view.removeEventListener("pointermove", h.onMove);
    h.view.removeEventListener("pointerleave", h.hide);
    h.hide();
    h.anchor.remove();
    this.#hover = null;
  }
}
