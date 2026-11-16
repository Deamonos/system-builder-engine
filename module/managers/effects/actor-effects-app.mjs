/**
 * SBE — EFFETS D'UN PERSONNAGE (fenêtre ouverte depuis le HUD d'action)
 *
 * Tous les effets proposés (ceux du gestionnaire + les conditions de
 * Foundry non masquées), en tuiles :
 *   clic gauche   pose l'effet — ou +1 cumul s'il est cumulable
 *   clic droit    retire l'effet — ou −1 cumul
 * Un effet à déclencheur porte une petite flèche : le moteur peut le
 * reprendre à la prochaine évaluation.
 *
 * Réservée au MJ et aux propriétaires du personnage. Une seule fenêtre
 * par personnage ; elle se redessine quand ses effets changent.
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { EffectManager, maxStacks } from "./effect-manager.mjs";

const { ApplicationV2 } = foundry.applications.api;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const L = (k) => game.i18n.localize(k);

export class SBEActorEffectsApp extends ApplicationV2 {

  static #open = new Map();   /* actor.uuid → fenêtre */

  static DEFAULT_OPTIONS = {
    tag: "div",
    classes: ["sbe-actor-fx"],
    window: { icon: "fa-solid fa-bolt", resizable: true },
    position: { width: 400, height: 520 }
  };

  /** Ouvre (ou ramène devant) la fenêtre du personnage. */
  static open(actor) {
    if (!actor) return null;
    if (!game.user.isGM && !actor.isOwner) return null;
    const cur = this.#open.get(actor.uuid);
    if (cur?.rendered) { cur.bringToFront?.(); return cur; }
    const app = new SBEActorEffectsApp({ actor });
    this.#open.set(actor.uuid, app);
    app.render({ force: true });
    return app;
  }

  constructor(options = {}) {
    super(options);
    this.actor = options.actor;
    this._hooks = [];
  }

  get title() { return `${L("SBE.Hud.EffectsTitle")} — ${this.actor?.name ?? ""}`; }

  /** Les tuiles : effets du gestionnaire d'abord, puis les natifs. */
  #tiles() {
    const actor = this.actor;
    const out = [];
    for (const st of CONFIG.statusEffects ?? []) {
      if (!st?.id || st.hud === false) continue;
      const def = EffectManager.getDef(st.id);
      const custom = !!st.flags?.[SYSTEM_ID]?.custom;
      const stackable = !!def && maxStacks(def) > 1;
      const on = !!EffectManager.findEffect(actor, st.id) || !!actor.statuses?.has?.(st.id);
      out.push({
        id: st.id, custom, stackable, on,
        name: game.i18n.localize(st.name ?? st.id),
        img: st.img || "icons/svg/aura.svg",
        auto: !!def?.trigger?.enabled,
        stacks: stackable && on ? EffectManager.getStacks(actor, st.id) : 0,
        max: def ? maxStacks(def) : 1
      });
    }
    const coll = game.i18n.lang || "fr";
    return out.sort((a, b) => (a.custom !== b.custom ? (a.custom ? -1 : 1)
      : a.name.localeCompare(b.name, coll, { sensitivity: "base" })));
  }

  async _renderHTML() {
    const tiles = this.#tiles();
    const body = tiles.length
      ? `<div class="sbe-afx-grid">${tiles.map(t => `
          <div class="sbe-afx-tile${t.on ? " is-on" : ""}" data-fx="${esc(t.id)}"
               data-tooltip-text="${esc(t.name)}${t.stackable ? ` — ${esc(game.i18n.format("SBE.Hud.EffectsMax", { max: t.max }))}` : ""}${t.auto ? ` — ${esc(L("SBE.Hud.EffectsAuto"))}` : ""}">
            <span class="sbe-afx-ico"><img src="${esc(t.img)}" alt="">
              ${t.auto ? `<i class="fa-solid fa-arrows-rotate sbe-afx-auto"></i>` : ""}
              ${t.stacks > 1 ? `<b class="sbe-afx-stack">${t.stacks}</b>` : ""}
            </span>
            <span class="sbe-afx-name">${esc(t.name)}</span>
          </div>`).join("")}</div>`
      : `<p class="sbe-afx-none">${esc(L("SBE.Hud.EffectsNone"))}</p>`;
    return `<div class="sbe-afx"><p class="sbe-afx-hint">${esc(L("SBE.Hud.EffectsHint"))}</p>${body}</div>`;
  }

  /* Le défilement est gardé pour toutes les fenêtres (helpers/keep-scroll.mjs). */
  _replaceHTML(result, content) {
    content.innerHTML = result;
  }

  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    /* Les effets du personnage changent : on redessine. */
    const mine = (ae) => ae?.parent?.uuid === this.actor?.uuid;
    for (const h of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
      const id = Hooks.on(h, (ae) => { if (mine(ae)) this.render(); });
      this._hooks.push([h, id]);
    }
    const root = this.element;
    root.addEventListener("click", (ev) => this.#act(ev, +1));
    root.addEventListener("contextmenu", (ev) => this.#act(ev, -1));
  }

  async #act(ev, dir) {
    const tile = ev.target.closest?.("[data-fx]");
    if (!tile || !this.actor) return;
    ev.preventDefault();
    const id = tile.dataset.fx;
    const def = EffectManager.getDef(id);
    try {
      if (def && maxStacks(def) > 1) {
        await EffectManager.addStack(this.actor, id, dir);
      } else if (def) {
        await EffectManager.setStacks(this.actor, id, dir > 0 ? (EffectManager.findEffect(this.actor, id) ? 0 : 1) : 0);
      } else {
        const on = !!this.actor.statuses?.has?.(id);
        await this.actor.toggleStatusEffect(id, { active: dir > 0 ? !on : false });
      }
    } catch (err) {
      console.warn("SBE | Effets du personnage : action en échec", err);
      ui.notifications.warn(L("SBE.Hud.EffectsFail"));
    }
  }

  async close(options) {
    for (const [h, id] of this._hooks) Hooks.off(h, id);
    this._hooks = [];
    SBEActorEffectsApp.#open.delete(this.actor?.uuid);
    return super.close(options);
  }
}
