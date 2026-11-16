/**
 * SBE — POINTS TEMPORAIRES (dissipation + barre des pions)
 *
 * L'option vit sur la JAUGE (« Accepte des points temporaires ») ; la
 * valeur dans la sous-clé « clé_temp ». Donner / encaisser se fait à
 * l'écriture (doc-context → applyTempPoints). Ici :
 *
 * 1. DISSIPATION, selon ce que le MJ a coché sur la jauge (cumulable,
 *    le premier arrivé gagne) :
 *      - fin du combat ;
 *      - nouvelle journée ;
 *      - après N rounds : décompte au début du tour du porteur ;
 *      - après N minutes de temps de jeu.
 *    Les compteurs repartent quand on en reçoit (drapeau
 *    flags.<système>.temp.<clé> = { rounds, at }).
 *    Écritures faites par le MJ principal seulement.
 *
 * 2. BARRES DES PIONS : une jauge SBE peut être choisie comme barre
 *    de pion (« values.pv »), modifiable au HUD comme une barre native,
 *    et ses points temporaires y sont dessinés en segment à part.
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { isPrimaryGM } from "../../helpers/socket.mjs";
import { walkElements, valueBounds } from "../../builder/element-renderer.mjs";
import { tempGauges, docScope } from "../../builder/doc-context.mjs";
import { isForwardTurn } from "../effects/effect-manager.mjs";

export class TempPoints {

  /* ============================================================ */
  /*  Dissipation                                                  */
  /* ============================================================ */

  /** Retire les temporaires des jauges qui répondent à `test(cfg, k)`. */
  static async clear(actor, test) {
    if (!actor) return;
    const vals = actor.system?.values ?? {};
    const update = {};
    for (const el of tempGauges(actor)) {
      const k = el.key;
      if ((Number(vals[`${k}_temp`]) || 0) <= 0) continue;
      if (!test(el.config.temp, k)) continue;
      update[`system.values.${k}_temp`] = 0;
      update[`flags.${SYSTEM_ID}.temp.${k}`] = foundry.data.operators.ForcedDeletion.create();
    }
    if (Object.keys(update).length) {
      try { await actor.update(update, { sbeTempInternal: true }); }
      catch (err) { console.warn("SBE | Points temporaires : dissipation en échec", err); }
    }
  }

  /** Personnages vivants du monde ET des pions non liés. */
  static *#liveActors() {
    const seen = new Set();
    for (const a of game.actors ?? []) {
      if (a.type === "personnage") { seen.add(a.uuid); yield a; }
    }
    for (const scene of game.scenes ?? []) {
      for (const t of scene.tokens ?? []) {
        if (t.actorLink) continue;
        const a = t.actor;
        if (a?.type === "personnage" && !seen.has(a.uuid)) { seen.add(a.uuid); yield a; }
      }
    }
  }

  static async #onCombatTurn(combat, changed) {
    if (!isPrimaryGM()) return;
    /* Revenir d'un tour ne décompte pas. */
    if (!isForwardTurn(combat, changed)) return;
    const actor = combat?.combatant?.actor;
    if (actor?.type !== "personnage") return;
    const vals = actor.system?.values ?? {};
    const update = {};
    for (const el of tempGauges(actor)) {
      const k = el.key;
      if (!(Number(el.config.temp.rounds) > 0) || (Number(vals[`${k}_temp`]) || 0) <= 0) continue;
      const meta = actor.getFlag(SYSTEM_ID, `temp.${k}`) ?? {};
      const left = (Number(meta.rounds) || Number(el.config.temp.rounds)) - 1;
      if (left <= 0) {
        update[`system.values.${k}_temp`] = 0;
        update[`flags.${SYSTEM_ID}.temp.${k}`] = foundry.data.operators.ForcedDeletion.create();
      } else update[`flags.${SYSTEM_ID}.temp.${k}.rounds`] = left;
    }
    if (Object.keys(update).length) {
      try { await actor.update(update, { sbeTempInternal: true }); }
      catch (err) { console.warn("SBE | Points temporaires : décompte des rounds en échec", err); }
    }
  }

  static async #onWorldTime(worldTime) {
    if (!isPrimaryGM()) return;
    const now = Number(worldTime ?? game.time?.worldTime ?? 0);
    for (const actor of this.#liveActors()) {
      await this.clear(actor, (cfg, k) => {
        const min = Number(cfg.minutes) || 0;
        if (min <= 0) return false;
        const at = Number(actor.getFlag(SYSTEM_ID, `temp.${k}`)?.at ?? now);
        return now - at >= min * 60;
      });
    }
  }

  /* ============================================================ */
  /*  Barres des pions                                             */
  /* ============================================================ */

  /** Jauge SBE derrière un attribut de barre « values.<clé> ». */
  static #gaugeFor(actor, attribute) {
    const m = /^values\.([a-z][a-z0-9_]*)$/.exec(String(attribute ?? ""));
    if (!m || actor?.type !== "personnage") return null;
    const els = actor.system?.template?.system?.elements ?? [];
    return [...walkElements(els)].find(e => e?.kind === "gauge" && e.key === m[1]) ?? null;
  }

  /** Données de barre d'une jauge : valeur, max effectif, temporaires. */
  static barData(actor, attribute) {
    const el = this.#gaugeFor(actor, attribute);
    if (!el) return null;
    let scope = {};
    try { scope = docScope(actor); } catch (_e) { /* fiche incomplète */ }
    const vals = { ...(actor.system?.values ?? {}), ...scope };
    const { min, max } = valueBounds(el, vals);
    const value = Number(el.config?.computed ? scope[el.key] : actor.system?.values?.[el.key]) || 0;
    return {
      type: "bar", attribute,
      value: Math.round(value - min), max: Math.round(max - min),
      editable: !el.config?.computed,
      sbeTemp: el.config?.temp?.on ? Math.max(0, Number(actor.system?.values?.[`${el.key}_temp`]) || 0) : 0
    };
  }

  /** Segment des temporaires sur la barre du pion (ancien système). */
  static #overlay(token, bar, data) {
    const temp = Number(data?.sbeTemp) || 0;
    if (temp <= 0 || !bar) return;
    const max = Number(data.max) || 0;
    const val = Math.max(0, Math.min(Number(data.value) || 0, max));
    if (max <= 0) return;
    const { width, height } = token.document.getSize();
    const s = canvas.dimensions.uiScale ?? 1;
    const bh = 8 * (token.document.height >= 2 ? 1.5 : 1) * s;
    const scale = max + temp;
    const valW = (val / scale) * width;
    const tempW = (temp / scale) * width;
    let hpColor = 0x27b81f;
    const index = token.document.bar2?.attribute === data.attribute && token.document.bar1?.attribute !== data.attribute ? 1 : 0;
    try {
      const colors = token._getBarColors?.(index, data);
      if (colors) hpColor = foundry.utils.Color.mix(colors.empty, colors.full, val / max);
    } catch (_e) { /* couleur par défaut */ }
    const tempColor = Number(String(getComputedStyle(document.body).getPropertyValue("--sbe-temp-default") || "#5aa9e6")
      .trim().replace("#", "0x")) || 0x5aa9e6;
    bar.clear();
    bar.lineStyle(s, 0x000000, 1.0);
    bar.beginFill(0x000000, 0.5).drawRoundedRect(0, 0, width, bh, 3 * s).endFill();
    bar.lineStyle(0);
    bar.beginFill(hpColor, 1.0).drawRoundedRect(0, 0, valW, bh, 2 * s).endFill();
    bar.beginFill(tempColor, 0.95).drawRoundedRect(valW, 0, tempW, bh, 2 * s).endFill();
    bar.beginFill(0xffffff, 0.55).drawRect(valW, 0, Math.max(1, s), bh).endFill();
    bar.position.set(0, index === 0 ? height - bh : 0);
  }

  /* ============================================================ */
  /*  Branchements                                                 */
  /* ============================================================ */

  static init() {
    Hooks.on("updateCombat", (combat, changed) => { this.#onCombatTurn(combat, changed); });
    Hooks.on("updateWorldTime", (worldTime) => { this.#onWorldTime(worldTime); });
    /* Fin du combat. */
    Hooks.on("deleteCombat", (combat) => {
      if (!isPrimaryGM()) return;
      for (const c of combat.combatants ?? []) {
        if (c.actor?.type === "personnage") this.clear(c.actor, (cfg) => !!cfg.endCombat);
      }
    });
    /* Nouvelle journée (signal du manager). */
    Hooks.on("sbeNewDay", (actor) => { this.clear(actor, (cfg) => !!cfg.newDay); });

    /* Barre de pion : une jauge SBE devient une vraie barre. */
    const TD = CONFIG.Token?.documentClass;
    if (TD && !TD.prototype.__sbeBarWrapped) {
      const orig = TD.prototype.getBarAttribute;
      TD.prototype.getBarAttribute = function (barName, opts = {}) {
        const attribute = opts.alternative || this[barName]?.attribute;
        if (this.actor && /^values\./.test(String(attribute ?? ""))) {
          const d = TempPoints.barData(this.actor, attribute);
          if (d) return d;
        }
        return orig.call(this, barName, opts);
      };
      /* Liste des attributs proposés dans la configuration du pion. */
      const origTracked = TD.getTrackedAttributes;
      TD.getTrackedAttributes = function (data, path = []) {
        const out = origTracked.call(this, data, path);
        try {
          const actor = data?.parent;
          if (!path.length && actor?.type === "personnage" && out) {
            for (const e of walkElements(actor.system?.template?.system?.elements ?? [])) {
              if (e?.kind === "gauge" && e.key) out.bar.push(["values", e.key]);
              else if (e?.kind === "number" && e.key) out.value.push(["values", e.key]);
            }
          }
        } catch (_e) { /* liste native seulement */ }
        return out;
      };
      TD.prototype.__sbeBarWrapped = true;
    }

    /* Segment des temporaires, après le dessin natif de la barre. */
    Hooks.once("setup", () => {
      const proto = CONFIG.Token?.objectClass?.prototype;
      if (!proto || proto.__sbeTempBar || typeof proto._drawBar !== "function") return;
      const orig = proto._drawBar;
      proto._drawBar = function (index, bar, data) {
        const out = orig.call(this, index, bar, data);
        try { TempPoints.#overlay(this, bar, data); } catch (_e) { /* dessin natif seul */ }
        return out;
      };
      proto.__sbeTempBar = true;
    });

    /* Une valeur change : les barres des pions suivent. */
    Hooks.on("updateActor", (actor, changes) => {
      if (!foundry.utils.hasProperty(changes, "system.values")) return;
      for (const t of actor.getActiveTokens?.() ?? []) {
        try { t.renderFlags.set({ refreshBars: true }); } catch (_e) { /* */ }
      }
    });
  }
}
