/**
 * SBE — ANIMATIONS (images et vidéos jouées sur la scène)
 *
 * 100 % natif : un sprite PIXI (image, ou vidéo .webm / .mp4) posé au
 * dessus des pions, puis retiré à la fin. Aucun module externe.
 *
 * Deux usages :
 *   - play()  : une animation ponctuelle d'un média (onglet Médias d'un
 *               objet), placée sur le porteur, sur la cible, en trajet
 *               du porteur vers la cible, ou au point visé / d'impact ;
 *   - sync()  : une animation EN BOUCLE qui suit un pion tant qu'un
 *               effet dure (partie « Apparence » des effets).
 *
 * Chaque client dessine pour lui-même : la diffusion (qui voit) est
 * décidée par le gestionnaire de médias, comme pour le son.
 */

export const ANIM_PLACES = ["source", "target", "trail", "point"];
const VIDEO_RE = /\.(webm|mp4|m4v|ogv|mov)(\?.*)?$/i;
const MAX_MS = 15000;

export class MediaAnim {

  static _layer = null;
  static _loops = new Map();     /* clé → { sprite, video, tokenId, sig } */
  static _ticker = null;
  static _bound = false;

  static init() {
    if (this._bound) return;
    this._bound = true;
    Hooks.on("canvasTearDown", () => this._reset());
    Hooks.on("canvasReady", () => {
      this._ticker ??= () => this._follow();
      try { canvas.app.ticker.remove(this._ticker); canvas.app.ticker.add(this._ticker); } catch (_e) { /* */ }
    });
  }

  static isVideo(path) { return VIDEO_RE.test(String(path ?? "")); }

  static _reset() {
    for (const k of [...this._loops.keys()]) this._drop(k);
    try { this._layer?.destroy?.({ children: true }); } catch (_e) { /* */ }
    this._layer = null;
  }

  static _ensureLayer() {
    if (this._layer && !this._layer.destroyed) return this._layer;
    if (!canvas?.interface) return null;
    const layer = new PIXI.Container();
    layer.eventMode = "none";
    layer.interactiveChildren = false;
    canvas.interface.addChild(layer);
    this._layer = layer;
    return layer;
  }

  /** Sprite d'une image ou d'une vidéo. → { sprite, video } */
  static async _sprite(path, { loop = false, autoplay = true } = {}) {
    if (this.isVideo(path)) {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.preload = "auto";
      video.muted = true;           /* le son du média est joué à part */
      video.playsInline = true;
      video.loop = !!loop;
      video.src = path;
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("timeout")), 8000);
        video.addEventListener("canplay", () => { clearTimeout(t); resolve(); }, { once: true });
        video.addEventListener("error", () => { clearTimeout(t); reject(new Error("video")); }, { once: true });
      });
      const sprite = new PIXI.Sprite(PIXI.Texture.from(video));
      if (autoplay) video.play().catch(() => { /* lecture refusée : l'image reste figée */ });
      return { sprite, video };
    }
    const load = foundry.canvas?.loadTexture ?? globalThis.loadTexture;
    const tex = load ? await load(path) : await PIXI.Assets.load(path);
    if (!tex) throw new Error("texture");
    return { sprite: new PIXI.Sprite(tex), video: null };
  }

  static _cell() { return canvas.scene?.grid?.size ?? canvas.grid?.size ?? 100; }

  /** Taille (en cases) → échelle du sprite, proportions gardées. */
  static _fit(sprite, cells) {
    const px = Math.max(0.1, Number(cells) || 1) * this._cell();
    const w = sprite.texture?.width || 1, h = sprite.texture?.height || 1;
    const s = px / Math.max(w, h);
    sprite.scale.set(s, s);
  }

  /**
   * Où jouer. ctx = { origin, targets: [{x,y}], point }.
   * @returns {Array<{at, from?}>} un emplacement par cible.
   */
  static placements(place, ctx) {
    const origin = ctx?.origin ?? null;
    const targets = Array.isArray(ctx?.targets) ? ctx.targets.filter(Boolean) : [];
    const point = ctx?.point ?? null;
    /* Sans cible : là où l'on a visé (le point d'impact). */
    const ends = targets.length ? targets : (point ? [point] : []);
    switch (place) {
      case "target": return (ends.length ? ends : [origin]).filter(Boolean).map(at => ({ at }));
      case "trail":
        if (!ends.length) return origin ? [{ at: origin }] : [];
        return ends.map(at => (origin ? { from: origin, at } : { at }));
      case "point": {
        const at = point ?? ends[0] ?? origin;
        return at ? [{ at }] : [];
      }
      default: {
        const at = origin ?? point ?? ends[0];
        return at ? [{ at }] : [];
      }
    }
  }

  /**
   * Joue une animation ponctuelle.
   * a = { anim, animSize, animPlace, animScreen, animDuration, animRandom }
   */
  static async play(a, ctx = {}) {
    const ready = await this.prepare(a, ctx);
    ready?.();
  }

  /**
   * PRÉPARE une animation (fichiers chargés, vidéo prête à la première
   * image) sans la montrer. → une fonction qui la lance tout de suite,
   * ou null. Le son peut ainsi partir EN MÊME TEMPS que l'image, au lieu
   * de la précéder pendant le chargement de la vidéo.
   */
  static async prepare(a, ctx = {}) {
    if (!a?.anim || !canvas?.ready) return null;
    if (ctx?.origin?.sceneId && canvas.scene?.id && ctx.origin.sceneId !== canvas.scene.id) return null;
    const spots = this.placements(a.animPlace, ctx);
    const parts = (await Promise.all(spots.map(spot => this._sprite(a.anim, { autoplay: false })
      .then(sv => ({ ...sv, spot }))
      .catch(err => { console.warn("SBE | Animation en échec", a.anim, err); return null; })))).filter(Boolean);
    if (!parts.length) return null;
    return () => { for (const p of parts) this._show(a, p); };
  }

  static _show(a, { sprite, video, spot }) {
    const layer = this._ensureLayer();
    if (!layer) { try { sprite.destroy({ texture: !!video, baseTexture: !!video }); } catch (_e) { /* */ } return; }
    if (spot.from && spot.at) {
      /* Trajet : l'animation part du porteur et s'étire jusqu'à la cible. */
      const dx = spot.at.x - spot.from.x, dy = spot.at.y - spot.from.y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      sprite.anchor.set(0, 0.5);
      sprite.position.set(spot.from.x, spot.from.y);
      sprite.rotation = Math.atan2(dy, dx);
      const h = Math.max(0.1, Number(a.animSize) || 1) * this._cell();
      sprite.scale.set(dist / (sprite.texture.width || 1), h / (sprite.texture.height || 1));
    } else {
      sprite.anchor.set(0.5, 0.5);
      sprite.position.set(spot.at.x, spot.at.y);
      this._fit(sprite, a.animSize);
      if (a.animRandom) sprite.rotation = Math.random() * Math.PI * 2;
    }
    /* Fond noir → transparent (vidéos d'effets sur fond noir). */
    if (a.animScreen) sprite.blendMode = PIXI.BLEND_MODES.SCREEN;
    layer.addChild(sprite);
    if (video) { try { video.currentTime = 0; } catch (_e) { /* */ } video.play().catch(() => { /* image figée */ }); }
    const ms = video
      ? Math.min(MAX_MS, Math.max(100, (Number(video.duration) || 2) * 1000 + 50))
      : Math.min(MAX_MS, Math.max(100, (Number(a.animDuration) || 1.5) * 1000));
    const done = () => {
      try { video?.pause(); if (video) { video.removeAttribute("src"); video.load(); } } catch (_e) { /* */ }
      try { sprite.destroy({ texture: !!video, baseTexture: !!video }); } catch (_e) { /* */ }
    };
    if (video) video.addEventListener("ended", done, { once: true });
    setTimeout(done, ms);
  }

  /* ========================================================== */
  /*  ANIMATIONS EN BOUCLE SUR UN PION (effets)                  */
  /* ========================================================== */

  /**
   * Aligne les animations d'un pion sur la liste voulue.
   * list = [{ id, file, size, screen }] (id stable : l'effet posé).
   */
  static async sync(token, list) {
    if (!token?.id || !canvas?.ready) return;
    const want = new Map((list ?? []).filter(x => x?.file).map(x => [`${token.id}:${x.id}`, x]));
    for (const [k, rec] of this._loops) {
      if (rec.tokenId !== token.id) continue;
      const w = want.get(k);
      if (!w || rec.sig !== this._sig(w)) this._drop(k);
    }
    for (const [k, w] of want) {
      if (this._loops.has(k)) continue;
      this._loops.set(k, { pending: true, tokenId: token.id, sig: this._sig(w) });
      try {
        const layer = this._ensureLayer();
        const { sprite, video } = await this._sprite(w.file, { loop: true });
        const rec = this._loops.get(k);
        if (!rec || !layer || rec.sig !== this._sig(w)) {
          if (rec?.pending) this._loops.delete(k);
          try { video?.pause(); sprite.destroy({ texture: !!video, baseTexture: !!video }); } catch (_e) { /* */ }
          continue;
        }
        sprite.anchor.set(0.5, 0.5);
        if (w.screen) sprite.blendMode = PIXI.BLEND_MODES.SCREEN;
        sprite._sbeCells = Number(w.size) || 1;
        this._fit(sprite, sprite._sbeCells);
        layer.addChild(sprite);
        this._loops.set(k, { sprite, video, tokenId: token.id, sig: this._sig(w) });
        this._place(this._loops.get(k));
      } catch (err) {
        console.warn("SBE | Animation d'effet en échec", w.file, err);
        this._loops.delete(k);
      }
    }
  }

  static _sig(w) { return `${w.file}|${w.size}|${w.screen ? 1 : 0}`; }

  static _drop(k) {
    const rec = this._loops.get(k);
    this._loops.delete(k);
    if (!rec || rec.pending) return;
    try { rec.video?.pause(); if (rec.video) { rec.video.removeAttribute("src"); rec.video.load(); } } catch (_e) { /* */ }
    try { rec.sprite?.destroy({ texture: !!rec.video, baseTexture: !!rec.video }); } catch (_e) { /* */ }
  }

  /** Le pion a disparu de la scène : ses animations partent. */
  static dropToken(tokenId) {
    for (const [k, rec] of this._loops) if (rec.tokenId === tokenId) this._drop(k);
  }

  static _place(rec) {
    const t = canvas.tokens?.get(rec.tokenId);
    if (!t || t.destroyed || !rec.sprite || rec.sprite.destroyed) return false;
    const c = t.center ?? { x: t.x + t.w / 2, y: t.y + t.h / 2 };
    rec.sprite.position.set(c.x, c.y);
    rec.sprite.visible = !!t.visible;
    return true;
  }

  /** Collées au pion à chaque image (déplacement animé compris). */
  static _follow() {
    for (const [k, rec] of this._loops) {
      if (rec.pending) continue;
      if (!this._place(rec)) this._drop(k);
    }
  }
}
