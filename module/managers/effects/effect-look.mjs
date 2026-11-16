/**
 * SBE — EFFETS (palier 3) : ce qu'un effet fait VOIR et ENTENDRE
 *
 *   - SON à la pose (une fois) ou EN BOUCLE tant que l'effet dure :
 *     mêmes règles que les médias d'objets (qui entend, portée,
 *     atténuation, volume) — c'est le gestionnaire de médias qui joue.
 *   - TEINTE du pion tant que l'effet dure (plusieurs teintes se
 *     multiplient), appliquée à l'affichage seulement : le jeton n'est
 *     jamais réécrit.
 *   - LUMIÈRE portée par le pion : écrite sur le jeton (seul moyen
 *     stable), la lumière d'origine est gardée de côté et rendue quand
 *     plus aucun effet n'éclaire. La plus forte gagne. Une lumière
 *     « personnelle » n'est pas écrite : seul le porteur la voit.
 *     Les objets allumés (onglet Lumière) y ajoutent leurs lumières
 *     (registerLightProvider) : UN seul écrivain de la lumière du jeton.
 *   - VISION : voir managers/vision/ (la vue du porteur, le halo
 *     thermique, la lumière personnelle).
 *   - Sur le pion : ×N des effets cumulés, GRANDE ICÔNE au centre, et
 *     effets DISCRETS (icône visible du MJ et du propriétaire seuls —
 *     l'icône native est masquée pour tous, la nôtre ne se dessine que
 *     pour eux).
 *
 * Chaque client dessine et joue pour lui-même (les hooks d'effets
 * arrivent partout) ; seule la lumière, qui s'écrit, passe par le MJ
 * principal.
 */

import { activeTokenOf } from "../../helpers/canvas-utils.mjs";
import { SYSTEM_ID, soundGain } from "../../helpers/constants.mjs";
import { MediaManager } from "../media/media-manager.mjs";
import { EffectManager, levelOf } from "./effect-manager.mjs";
import { resolveLight, strongestLight } from "../vision/effect-values.mjs";
import { MediaAnim } from "../media/media-anim.mjs";
import { isPrimaryGM } from "../../helpers/socket.mjs";

/** Les effets SBE actifs d'un acteur, avec leur définition. */
function activeOf(actor) {
  const out = [];
  for (const ae of actor?.effects ?? []) {
    if (ae.disabled) continue;
    const def = EffectManager.getDef(ae.flags?.[SYSTEM_ID]?.key ?? "");
    if (def) out.push({ ae, def, n: Math.max(1, Number(ae.flags?.[SYSTEM_ID]?.stacks) || 1) });
  }
  return out;
}

export class EffectLook {

  static _bound = false;
  /** Sons en boucle de CE client : uuid de l'effet → Sound. */
  static _loops = new Map();

  static init() {
    if (this._bound) return;
    this._bound = true;

    Hooks.on("createActiveEffect", (ae) => this._onEffect(ae, "create"));
    Hooks.on("deleteActiveEffect", (ae) => this._onEffect(ae, "delete"));
    Hooks.on("updateActiveEffect", (ae) => this._onEffect(ae, "update"));

    /* Le nombre de cumuls s'écrit SUR l'icône de l'effet (coin bas-droit),
       dans la rangée d'icônes de Foundry : classe de pion SBE, rien n'est
       forcé dans le code de Foundry. */
    const Base = CONFIG.Token.objectClass;
    const Look = this;
    class SBEStackToken extends Base {
      async _drawEffects() {
        await super._drawEffects();
        try { Look._stackNumbers(this); } catch (err) { console.warn("SBE | Effets : nombre de cumuls en échec", err); }
      }
    }
    CONFIG.Token.objectClass = SBEStackToken;

    /* Le pion : teinte + calque SBE, à chaque rafraîchissement. */
    Hooks.on("refreshToken", (token) => {
      try { this._tint(token); this._overlay(token); this._anims(token); }
      catch (err) { console.warn("SBE | Effets : dessin du pion en échec", err); }
    });
    Hooks.on("destroyToken", (token) => { token._sbeFx = null; token._sbeFxSig = null; token._sbeAnimSig = null; MediaAnim.dropToken(token.id); });

    /* Les boucles des effets déjà posés reprennent au chargement. */
    Hooks.on("canvasReady", () => this._resyncLoops());
  }

  static _onEffect(ae, kind) {
    const actor = ae.parent;
    if (actor?.documentName !== "Actor") return;
    const def = EffectManager.getDef(ae.flags?.[SYSTEM_ID]?.key ?? "");
    if (def) {
      if (kind === "create") this._sound(actor, def, ae);
      if (kind === "delete") this._stopLoop(ae);
      if (isPrimaryGM() && def.look.light.enabled) this.syncLight(actor);
    }
    for (const t of actor.getActiveTokens?.() ?? []) t.renderFlags?.set?.({ refreshMesh: true, refreshEffects: true });
  }

  /* ========================================================== */
  /*  ANIMATION EN BOUCLE SUR LE PION                            */
  /* ========================================================== */

  /** Les animations des effets actifs suivent le pion (chaque client
      dessine pour lui ; un effet discret ne se voit que du MJ et du
      propriétaire). */
  static _anims(token) {
    const actor = token?.actor;
    const mine = game.user.isGM || !!actor?.isOwner;
    const list = activeOf(actor)
      .filter(x => x.def.look.anim?.file && (!x.def.look.discreet || mine))
      .map(x => ({ id: x.ae.id, file: x.def.look.anim.file, size: x.def.look.anim.size, screen: x.def.look.anim.screen }));
    const sig = list.map(x => `${x.id}|${x.file}|${x.size}|${x.screen ? 1 : 0}`).join(";");
    if (token._sbeAnimSig === sig) return;
    token._sbeAnimSig = sig;
    MediaAnim.sync(token, list);
  }

  /* ========================================================== */
  /*  SON                                                        */
  /* ========================================================== */

  static _media(actor, def) {
    const l = def.look;
    return {
      sound: l.sound, volume: l.volume, audience: l.audience,
      range: l.range || null, falloff: l.falloff, repeat: 1, interval: 0
    };
  }

  static _ctx(actor) {
    const token = activeTokenOf(actor);
    const c = token ? (token.center ?? { x: token.x, y: token.y }) : null;
    return { origin: c ? { x: c.x, y: c.y, sceneId: canvas?.scene?.id ?? "" } : null, actorId: actor.id };
  }

  /** Ce client est-il concerné (public + distance) ? → facteur de volume. */
  static _factor(actor, media) {
    const ctx = this._ctx(actor);
    if (!MediaManager.audienceIds(media.audience, actor.id).includes(game.user.id)) return 0;
    return MediaManager._distanceFactor(media, ctx);
  }

  static async _sound(actor, def, ae) {
    const media = this._media(actor, def);
    if (!media.sound) return;
    const f = this._factor(actor, media);
    if (f <= 0) return;
    const volume = Math.max(0, Math.min(1, soundGain(media.volume) * f));
    if (!def.look.loop) { await MediaManager._once(media.sound, volume); return; }
    this._stopLoop(ae);
    try {
      const snd = await foundry.audio.AudioHelper.play({ src: media.sound, volume, autoplay: true, loop: true }, false);
      if (snd) this._loops.set(ae.uuid, snd);
    } catch (err) { console.warn("SBE | Effets : son en boucle en échec", err); }
  }

  static _stopLoop(ae) {
    const snd = this._loops.get(ae.uuid);
    if (!snd) return;
    try { snd.stop(); } catch (_e) { /* déjà arrêté */ }
    this._loops.delete(ae.uuid);
  }

  static _resyncLoops() {
    for (const [, snd] of this._loops) { try { snd.stop(); } catch (_e) { /* */ } }
    this._loops.clear();
    for (const t of canvas?.tokens?.placeables ?? []) {
      for (const { ae, def } of activeOf(t.actor)) if (def.look.loop && def.look.sound) this._sound(t.actor, def, ae);
    }
  }

  /* ========================================================== */
  /*  TEINTE (affichage seulement)                               */
  /* ========================================================== */

  static _tint(token) {
    const mesh = token.mesh;
    if (!mesh) return;
    const tints = activeOf(token.actor).map(x => x.def.look.tint).filter(Boolean);
    if (!tints.length) {
      if (token._sbeTinted) { token._sbeTinted = false; token.renderFlags?.set?.({ refreshMesh: true }); }
      return;
    }
    const Color = foundry.utils.Color;
    let [r, g, b] = Color.from(token.document.texture?.tint ?? "#ffffff").rgb;
    for (const t of tints) {
      const [tr, tg, tb] = Color.from(t).rgb;
      r *= tr; g *= tg; b *= tb;
    }
    mesh.tint = Color.fromRGB([r, g, b]);
    token._sbeTinted = true;
  }

  /* ========================================================== */
  /*  CALQUE SUR LE PION : ×N, grande icône, effets discrets     */
  /* ========================================================== */

  static _overlay(token) {
    const actor = token.actor;
    const canSee = game.user.isGM || actor?.isOwner;
    const badges = [];
    let big = null;
    for (const { def, n } of activeOf(actor)) {
      const lv = levelOf(def, n);
      if (def.look.discreet && !canSee) continue;
      if (def.look.bigIcon && !big) big = lv.icon;
      const stackable = maxStacksShown(def);
      /* Les cumuls d'un effet visible s'écrivent sur son icône de Foundry
         (_stackNumbers) ; seuls les effets discrets ont leur icône ici. */
      if (def.look.discreet) badges.push({ icon: lv.icon, n: stackable ? n : 0 });
    }
    const sig = JSON.stringify([badges, big, token.w, token.h]);
    if (token._sbeFxSig === sig && token._sbeFx && !token._sbeFx.destroyed) return;
    token._sbeFxSig = sig;
    this._draw(token, badges, big);
  }

  static async _draw(token, badges, big) {
    const sig = token._sbeFxSig;
    if (!token._sbeFx || token._sbeFx.destroyed) {
      token._sbeFx = new PIXI.Container();
      token._sbeFx.eventMode = "none";
      token.addChild(token._sbeFx);
    }
    const box = token._sbeFx;
    for (const c of box.removeChildren()) c.destroy?.({ children: true });
    if (!badges.length && !big) return;

    const load = async (src) => { try { return await foundry.canvas.loadTexture(src); } catch (_e) { return null; } };
    const parts = [];
    if (big) {
      const tex = await load(big);
      if (tex) {
        const s = new PIXI.Sprite(tex);
        const size = Math.min(token.w, token.h) * 0.6;
        s.width = s.height = size;
        s.position.set((token.w - size) / 2, (token.h - size) / 2);
        s.alpha = 0.85;
        parts.push(s);
      }
    }
    const size = Math.max(14, Math.min(token.w, token.h) * 0.22);
    let y = 0;
    for (const b of badges) {
      const tex = await load(b.icon);
      if (tex) {
        const s = new PIXI.Sprite(tex);
        s.width = s.height = size;
        s.position.set(0, y);
        parts.push(s);
      }
      if (b.n > 1) {
        /* Le nombre SUR l'icône, coin bas-droit. */
        const txt = new PIXI.Text(String(b.n), {
          fontFamily: "Signika", fontSize: Math.round(size * 0.6), fontWeight: "bold",
          fill: 0xffffff, stroke: 0x000000, strokeThickness: 3
        });
        txt.anchor.set(1, 1);
        txt.position.set(size + 1, y + size + 1);
        parts.push(txt);
      }
      y += size + 2;
    }
    /* Un rendu plus récent a pu passer pendant le chargement. */
    if (token._sbeFxSig !== sig || box.destroyed) { for (const p of parts) p.destroy(); return; }
    for (const p of parts) box.addChild(p);
  }

  /**
   * Le nombre de cumuls sur les icônes d'effets que Foundry dessine sur le
   * pion : même ordre et même filtre que Foundry (_drawEffects), chaque
   * icône porte son rang dans zIndex.
   */
  static _stackNumbers(token) {
    const actor = token.actor;
    if (!actor || !token.effects) return;
    const SHOW = CONST.ACTIVE_EFFECT_SHOW_ICON;
    const shown = (actor.appliedEffects ?? []).filter(e => (e.showIcon === SHOW.ALWAYS)
      || ((e.showIcon === SHOW.CONDITIONAL) && e.isTemporary));
    shown.forEach((ae, i) => {
      const key = ae.flags?.[SYSTEM_ID]?.key ?? "";
      const def = key ? EffectManager.getDef(key) : null;
      const n = Math.max(1, Number(ae.flags?.[SYSTEM_ID]?.stacks) || 1);
      if (!def || !maxStacksShown(def) || n < 2) return;
      const icon = token.effects.children.find(c => c !== token.effects.bg && c.zIndex === i && c.texture);
      if (!icon) return;
      /* Dans les coordonnées de la texture : le nombre suit la taille de
         l'icône quand Foundry la redimensionne. */
      const h = Math.max(8, icon.texture.height || 64);
      const w = icon.texture.width || h;
      const fs = Math.round(h * 0.46);
      const txt = new PIXI.Text(String(n), {
        fontFamily: "Signika", fontSize: fs, fontWeight: "bold",
        fill: 0xffffff, stroke: 0x000000, strokeThickness: Math.max(2, Math.round(h * 0.09))
      });
      /* Coin BAS-DROIT : le bas du texte de PIXI garde la place des
         jambages (sous la ligne de base) — on le descend d'autant pour
         que le chiffre touche le coin. */
      txt.anchor.set(1, 1);
      txt.position.set(w + Math.round(h * 0.04), h + Math.round(fs * 0.24));
      txt.eventMode = "none";
      icon.addChild(txt);
    });
  }

  /* ========================================================== */
  /*  LUMIÈRE (écrite sur le jeton, par le MJ principal)         */
  /* ========================================================== */

  /** Autres sources de lumière du porteur (objets allumés…) :
      fn(actor) → lumières résolues. */
  static _providers = [];
  static registerLightProvider(fn) {
    if (typeof fn === "function") this._providers.push(fn);
  }

  /** Ce qu'il faut écrire sur la lumière d'UN jeton (null = rien). Sert
      à syncLight et à la vue du jeton (vision-manager), qui fusionne vue
      et lumière en UNE seule écriture. */
  static lightChanges(actor) {
    /* Une lumière PERSONNELLE n'est jamais écrite : seul le porteur la
       voit (vision/personal-light.mjs). */
    const extra = [];
    for (const fn of this._providers) {
      try { extra.push(...(fn(actor) ?? [])); } catch (err) { console.warn("SBE | Effets : source de lumière en échec", err); }
    }
    const best = strongestLight([...activeOf(actor)
      .filter(x => x.def.look.light.enabled)
      .map(x => resolveLight(actor, x.def)), ...extra]
      .filter(l => l && !l.personal));
    return (td) => {
      const base = td.flags?.[SYSTEM_ID]?.baseLight;
      if (best) {
        return {
          light: {
            dim: best.dim, bright: best.bright, color: best.color, alpha: best.alpha, angle: best.angle,
            attenuation: best.attenuation, luminosity: best.luminosity, saturation: best.saturation,
            contrast: best.contrast, shadows: best.shadows, coloration: best.coloration,
            animation: best.animation
          },
          [`flags.${SYSTEM_ID}.baseLight`]: base ?? foundry.utils.deepClone(td._source.light)
        };
      }
      if (base) return { light: base, [`flags.${SYSTEM_ID}.baseLight`]: foundry.data.operators.ForcedDeletion.create() };
      return null;
    };
  }

  static async syncLight(actor) {
    const changes = this.lightChanges(actor);
    const docs = actor.getDependentTokens?.() ?? actor.getActiveTokens?.(false, true) ?? [];
    for (const td of docs) {
      try {
        const upd = changes(td);
        if (upd) await td.update(upd);
      } catch (err) {
        console.warn("SBE | Effets : lumière du jeton en échec", err);
      }
    }
  }
}

/** Un ×N a-t-il un sens pour cet effet ? */
function maxStacksShown(def) {
  return def.stack.enabled || def.escalation.enabled;
}
