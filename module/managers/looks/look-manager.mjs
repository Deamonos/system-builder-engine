/**
 * SBE — APPARENCES DU JETON : branchements
 *
 * - HUD du jeton : un bouton (colonne de gauche) ouvre la grille des
 *   images du dossier du personnage ; un clic change le jeton, l'étoile
 *   en fait l'image par défaut (jeton prototype), « Par défaut » y revient.
 *   MJ et propriétaire (sauf si le MJ a verrouillé).
 * - Un personnage lié change sur toutes les scènes ; un jeton non lié,
 *   lui seul. La transition est celle de Foundry (jouée chez tous).
 * - Réglages par image (taille, échelle, nom) appliqués au changement et
 *   à la pose d'un jeton.
 * - Apparences automatiques : le MJ principal suit les règles (clé ou
 *   effet) ; quand plus rien ne correspond, l'image choisie à la main
 *   revient.
 * - Déguisement : une image marquée « déguisement » ; le MJ (et le
 *   propriétaire si le MJ le veut) voit à la place la vraie apparence.
 *   Affichage seulement : le jeton n'est pas réécrit.
 * Le portrait de la fiche n'est jamais touché.
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { onSocketMessage, isPrimaryGM, requestGM } from "../../helpers/socket.mjs";
import { checkKeyCondition } from "../../helpers/key-condition.mjs";
import { EffectManager } from "../effects/effect-manager.mjs";
import { merchantOf, MERCHANT_FLAG } from "../merchant/merchant-model.mjs";
import {
  LOOK_FLAG, STATE_FLAG, looksOf, lookFor, labelOf, stateOf, defaultSrcOf, baseActorOf
} from "./look-model.mjs";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const loadTex = (src) => (foundry.canvas?.loadTexture ?? globalThis.loadTexture)(src);

export class LookManager {

  static #pending = new Map();

  static init() {
    const M = this;
    const Base = CONFIG.Token.objectClass;
    class SBELookToken extends Base {
      async _draw(options) {
        await super._draw(options);
        try { await M.#trueFace(this); } catch (err) { console.warn("SBE | Apparences : vrai visage en échec", err); }
      }
    }
    CONFIG.Token.objectClass = SBELookToken;

    Hooks.on("renderTokenHUD", (hud, html) => { try { this.#hud(hud, html); } catch (err) { console.warn("SBE | Apparences : HUD en échec", err); } });
    Hooks.on("renderTokenApplication", (app, html) => { try { this.#tokenConfig(app, html); } catch (err) { console.warn("SBE | Apparences : encart en échec", err); } });

    /* Jeton posé : les réglages de son image (taille, échelle, nom). */
    Hooks.on("preCreateToken", (doc, _d, options) => {
      if (options?.sbeUndo) return;
      const actor = doc.actor ?? game.actors.get(doc.actorId);
      if (!actor) return;
      const looks = looksOf(actor);
      const src = doc.texture?.src ?? "";
      if (!looks.per.some(p => p.src === src)) return;
      const ch = this.changesFor(actor, { texture: { src: "", scaleX: doc.texture?.scaleX, scaleY: doc.texture?.scaleY } }, src);
      delete ch["texture.src"];
      if (Object.keys(ch).length) doc.updateSource(ch);
    });

    /* Déguisement : qui voit quoi peut changer avec le réglage. */
    Hooks.on("updateActor", (actor, changes) => {
      if (foundry.utils.hasProperty(changes, `flags.${SYSTEM_ID}.${LOOK_FLAG}`)) {
        for (const t of this.#placed(actor)) t.renderFlags?.set?.({ redraw: true });
      }
      if (changes.system || foundry.utils.hasProperty(changes, `flags.${SYSTEM_ID}.${MERCHANT_FLAG}`)) this.#schedule(actor);
    });
    for (const h of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
      Hooks.on(h, (eff) => {
        const a = eff.parent?.documentName === "Actor" ? eff.parent : eff.parent?.parent;
        if (a?.documentName === "Actor") this.#schedule(a);
      });
    }

    onSocketMessage((p) => {
      if (p?.type !== "sbeLookApply" || !isPrimaryGM()) return;
      const actor = fromUuidSync(p.actor);
      const user = game.users.get(p.user);
      if (!actor || !user) return;
      if (!user.isGM && (!actor.testUserPermission(user, "OWNER") || looksOf(actor).lock)) return;
      this.#write(actor, p.src, { sound: false });
    });
  }

  /* ========================================================== */
  /*  Changer d'apparence                                        */
  /* ========================================================== */

  static canChange(actor, user = game.user) {
    if (!actor) return false;
    if (user.isGM) return true;
    return actor.testUserPermission(user, "OWNER") && !looksOf(actor).lock;
  }

  /**
   * Ce qui change sur un jeton pour cette image : la source, et chaque
   * réglage que l'image définit. Un réglage que l'image d'avant
   * définissait et que la nouvelle ne définit pas revient à celui du
   * prototype ; le reste du jeton (taille, nom posés à la main) ne bouge pas.
   */
  static changesFor(actor, tokenDoc, src) {
    const looks = looksOf(actor);
    const next = lookFor(looks, src);
    const prev = lookFor(looks, tokenDoc?.texture?.src ?? "");
    const proto = baseActorOf(actor)?.prototypeToken;
    const out = { "texture.src": src };
    if (!proto) return out;
    const pick = (field, protoVal) => (next[field] !== null && next[field] !== "" ? next[field]
      : (prev[field] !== null && prev[field] !== "" ? protoVal : undefined));
    const w = pick("w", proto.width), h = pick("h", proto.height);
    if (w !== undefined) out.width = w;
    if (h !== undefined) out.height = h;
    const scale = pick("scale", Math.abs(proto.texture?.scaleX ?? 1));
    if (scale !== undefined) {
      out["texture.scaleX"] = scale * (Math.sign(tokenDoc?.texture?.scaleX ?? 1) || 1);
      out["texture.scaleY"] = scale * (Math.sign(tokenDoc?.texture?.scaleY ?? 1) || 1);
    }
    const name = pick("name", proto.name);
    if (name !== undefined) out.name = name;
    return out;
  }

  /** Jetons à changer : le jeton (non lié), ou tous ceux du personnage lié, sur toutes les scènes. */
  static #targets(actor) {
    if (actor.isToken) return actor.token ? [actor.token] : [];
    const out = [];
    for (const s of game.scenes ?? []) {
      for (const t of s.tokens) if (t.actorLink && t.actorId === actor.id) out.push(t);
    }
    return out;
  }

  /** Jetons dessinés sur la scène affichée. */
  static #placed(actor) {
    if (!canvas?.ready) return [];
    const base = baseActorOf(actor);
    return canvas.tokens.placeables.filter(t => t.document.actorId === base?.id);
  }

  /** Choix à la main (HUD) : retenu, puis appliqué. */
  static async choose(actor, src) {
    if (!this.canChange(actor) || !src) return;
    const st = stateOf(actor);
    if (st.manual !== src) await actor.setFlag(SYSTEM_ID, STATE_FLAG, { ...st, manual: src });
    await this.#write(actor, src, { sound: true });
  }

  /** L'étoile : cette image devient celle du jeton prototype. */
  static async setDefault(actor, src) {
    const base = baseActorOf(actor);
    if (!src || !base || !this.canChange(base)) return;
    await base.update({ "prototypeToken.texture.src": src });
    ui.notifications.info(L("SBE.Looks.DefaultSet", { name: labelOf(looksOf(base), src) }));
  }

  static async reset(actor) {
    const src = defaultSrcOf(actor);
    if (src) await this.choose(actor, src);
  }

  /** Écrit l'image sur les jetons (un joueur : la scène affichée ; le MJ principal fait le reste). */
  static async #write(actor, src, { sound = true } = {}) {
    const looks = looksOf(actor);
    const fx = looks.fx;
    const options = fx.type === "none" || !fx.ms ? { animate: false } : { animation: { transition: fx.type, duration: fx.ms } };
    const mine = [], others = [];
    for (const doc of this.#targets(actor)) {
      if (doc.texture?.src === src) continue;
      if (game.user.isGM || doc.parent?.id === canvas?.scene?.id) mine.push(doc);
      else others.push(doc);
    }
    for (const doc of mine) {
      try { await doc.update(this.changesFor(actor, doc, src), options); }
      catch (err) { console.warn("SBE | Apparences : jeton non changé", err); }
    }
    if (others.length) requestGM({ type: "sbeLookApply", actor: actor.uuid, src, user: game.user.id });
    /* Le son : une fois, chez tous, si le jeton se voit sur la scène affichée. */
    if (sound && fx.sound && mine.some(d => d.parent?.id === canvas?.scene?.id && !d.hidden)) {
      try { foundry.audio.AudioHelper.play({ src: fx.sound, volume: fx.volume, autoplay: true, loop: false }, true); }
      catch (err) { console.warn("SBE | Apparences : son en échec", err); }
    }
  }

  /* ========================================================== */
  /*  Apparences automatiques                                    */
  /* ========================================================== */

  static #schedule(actor) {
    if (!isPrimaryGM() || !actor || actor.type !== "personnage") return;
    const k = actor.uuid;
    clearTimeout(this.#pending.get(k));
    this.#pending.set(k, setTimeout(() => {
      this.#pending.delete(k);
      this.#evaluate(actor).catch(err => console.warn("SBE | Apparences : règles en échec", err));
    }, 60));
  }

  static #match(rule, actor) {
    if (!rule.src) return false;
    if (rule.kind === "shop") {
      const m = merchantOf(actor);
      return m.enabled && m.open === (rule.shop === "open");
    }
    if (rule.kind === "effect") {
      if (!rule.effect) return false;
      if (actor.statuses?.has?.(rule.effect)) return true;
      const ae = EffectManager.findEffect(actor, rule.effect);
      return !!ae && !ae.disabled;
    }
    return !!rule.key && checkKeyCondition(rule, actor);
  }

  static async #evaluate(actor) {
    const looks = looksOf(actor);
    const st = stateOf(actor);
    if (!looks.rules.length && !st.auto) return;
    const want = looks.rules.find(r => this.#match(r, actor))?.src ?? "";
    if (want === st.auto) return;
    await actor.setFlag(SYSTEM_ID, STATE_FLAG, { ...st, auto: want });
    /* Plus de règle : l'image choisie à la main, sinon celle par défaut. */
    await this.#write(actor, want || st.manual || defaultSrcOf(actor), { sound: true });
  }

  /* ========================================================== */
  /*  Déguisement                                                */
  /* ========================================================== */

  /** Le vrai visage, pour ceux qui ont le droit de le voir. */
  static async #trueFace(token) {
    const actor = token.actor;
    if (!actor || !token.mesh) return;
    const looks = looksOf(actor);
    const cur = token.document.texture?.src ?? "";
    if (!lookFor(looks, cur).disguise) return;
    if (!game.user.isGM && !(looks.ownerSees && token.document.isOwner)) return;
    const st = stateOf(actor);
    let real = st.manual && !lookFor(looks, st.manual).disguise ? st.manual : defaultSrcOf(actor);
    if (!real || real === cur || lookFor(looks, real).disguise) return;
    const tex = await loadTex(real);
    if (!tex || token.destroyed || !token.mesh) return;
    token.texture = tex;
    token.mesh.texture = tex;
    token.renderFlags.set({ refreshMesh: true });
  }

  /* ========================================================== */
  /*  HUD du jeton                                               */
  /* ========================================================== */

  static #hud(hud, html) {
    const token = hud.object;
    const actor = token?.actor;
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!actor || !root || actor.type !== "personnage") return;
    const looks = looksOf(actor);
    if (looks.files.length < 2 || !this.canChange(actor)) return;
    const col = root.querySelector(".col.left");
    if (!col || col.querySelector('[data-palette="sbeLooks"]')) return;
    const cur = token.document.texture?.src ?? "";
    const def = defaultSrcOf(actor);
    const auto = stateOf(actor).auto;
    const items = looks.files.map(src => {
      const l = lookFor(looks, src);
      const label = labelOf(looks, src);
      return `<div class="sbe-looks-item ${src === cur ? "is-cur" : ""} ${src === def ? "is-def" : ""}" data-src="${esc(src)}" data-tooltip-text="${esc(label)}">
        <img src="${esc(src)}" alt="" loading="lazy">
        <span>${esc(label)}</span>
        ${l.disguise ? `<i class="sbe-looks-mask fa-solid fa-mask" data-tooltip-text="${esc(L("SBE.Looks.Disguise"))}"></i>` : ""}
        ${src === auto ? `<i class="sbe-looks-auto fa-solid fa-wand-magic-sparkles" data-tooltip-text="${esc(L("SBE.Looks.AutoOn"))}"></i>` : ""}
        <a class="sbe-looks-star" data-star="${esc(src)}" data-tooltip-text="${esc(L(src === def ? "SBE.Looks.IsDefault" : "SBE.Looks.MakeDefault"))}"><i class="fa-${src === def ? "solid" : "regular"} fa-star"></i></a>
      </div>`;
    }).join("");
    const btn = `<button type="button" class="control-icon" data-action="togglePalette" data-palette="sbeLooks" data-tooltip aria-label="${esc(L("SBE.Looks.Hud"))}"><i class="fa-solid fa-masks-theater" inert></i></button>`;
    const pal = `<div class="palette sbe-looks-pal" data-palette="sbeLooks">
      <div class="sbe-looks-grid">${items}</div>
      <div class="sbe-looks-foot">
        <a data-looks="reset"><i class="fa-solid fa-rotate-left"></i> ${esc(L("SBE.Looks.Reset"))}</a>
        ${game.user.isGM ? `<a data-looks="config"><i class="fa-solid fa-gear"></i> ${esc(L("SBE.Looks.Configure"))}</a>` : ""}
      </div>
    </div>`;
    const anchor = col.querySelector(".attribute.elevation");
    if (anchor) anchor.insertAdjacentHTML("afterend", btn + pal);
    else col.insertAdjacentHTML("afterbegin", btn + pal);
    const palEl = col.querySelector(".sbe-looks-pal");
    palEl.addEventListener("click", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const star = ev.target.closest("[data-star]");
      if (star) return this.setDefault(actor, star.dataset.star);
      const act = ev.target.closest("[data-looks]")?.dataset.looks;
      if (act === "reset") return this.reset(actor);
      if (act === "config") {
        const { SBELooksApp } = await import("./look-app.mjs");
        return SBELooksApp.open(baseActorOf(actor));
      }
      const item = ev.target.closest(".sbe-looks-item");
      if (item) return this.choose(actor, item.dataset.src);
    });
  }

  /* ========================================================== */
  /*  Configuration du jeton : encart « Apparences SBE » (MJ)     */
  /* ========================================================== */

  static #tokenConfig(app, html) {
    if (!game.user.isGM) return;
    const actor = baseActorOf(app.isPrototype ? app.actor : (app.document ?? app.token)?.actor);
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!actor || !root || actor.type !== "personnage") return;
    const tab = root.querySelector('.tab[data-tab="appearance"]');
    if (!tab) return;
    tab.querySelector(".sbe-looks-box")?.remove();
    const looks = looksOf(actor);
    const info = looks.folder
      ? L("SBE.Looks.BoxSummary", { n: looks.files.length, folder: looks.folder })
      : L("SBE.Looks.BoxNone");
    tab.insertAdjacentHTML("beforeend", `<fieldset class="sbe-looks-box">
      <legend>${esc(L("SBE.Looks.Title"))}</legend>
      <p class="notes">${esc(info)}</p>
      <button type="button" data-looks-open><i class="fa-solid fa-masks-theater"></i> ${esc(L("SBE.Looks.Configure"))}</button>
    </fieldset>`);
    tab.querySelector("[data-looks-open]")?.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const { SBELooksApp } = await import("./look-app.mjs");
      SBELooksApp.open(actor);
    });
  }
}
