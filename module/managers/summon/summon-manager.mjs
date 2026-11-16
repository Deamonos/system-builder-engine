/**
 * SBE — INVOCATIONS (étape « Placer » : une créature)
 *
 * Au lieu de poser l'objet, l'étape place sur la scène des PNJ du monde
 * (un loup, un golem…), chacun en JETON NON LIÉ (une copie : blesser un
 * loup ne blesse pas les autres), visé comme un objet posé.
 *
 * Réglages de l'étape (tous au choix du MJ) :
 *   actor      le PNJ du monde invoqué
 *   count      combien (nombre ou formule, dés permis : « 1d4 »)
 *   control    caster (les joueurs de l'invocateur) | gm (le MJ seul)
 *   rounds / minutes   durée (formules) — en rounds pendant un combat,
 *                      en temps de jeu hors combat ; rien = jusqu'au renvoi
 *   init       caster (joue juste après l'invocateur) | roll (son jet)
 *   onZero     remove (disparaît à 0 sur la clé qui encaisse) | stay
 *   whileEffect  clé d'un effet de l'invocateur : il part, elles partent
 *   casterDown   l'invocateur tombe à 0 : elles partent
 *   values     [{ key, formula, mode: set|add|sub }] écrites sur chaque
 *              créature à son arrivée (formules lues comme les étapes :
 *              l'objet, carrier() pour l'invocateur, réponses d'avant ;
 *              dés tirés pour chaque créature)
 * L'étape peut aussi RENVOYER les invocations de l'invocateur (toutes,
 * ou celles d'un PNJ). Formules : `summoned()` compte les invocations
 * du personnage, `summoned("Nom")` celles d'un PNJ.
 *
 * Tout ce qui écrit (création, durée, renvoi) passe par le MJ principal.
 * Marque du jeton : flags.<système>.summon { by, name, rounds, seconds,
 * onZero, whileEffect, casterDown }.
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { onSocketMessage, isPrimaryGM, requestGM, gmQueue } from "../../helpers/socket.mjs";
import { activeTokenOf } from "../../helpers/canvas-utils.mjs";
import { registerScopeFunctions } from "../../builder/doc-scope.mjs";
import { docScope } from "../../builder/doc-context.mjs";
import { formulaValue } from "../../builder/formula-engine.mjs";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
export const SUMMON_FLAG = "summon";
export const SUMMON_CONTROLS = ["caster", "gm"];
export const SUMMON_INITS = ["caster", "roll"];
export const SUMMON_ZERO = ["remove", "stay"];

const flagOf = (td) => td?.flags?.[SYSTEM_ID]?.[SUMMON_FLAG] ?? null;

/** Clé qui encaisse les dégâts (règles de combat). */
function damageKey() {
  try { return String(game.settings.get(SYSTEM_ID, "combat")?.damageKey ?? ""); } catch (_e) { return ""; }
}

/** Valeur de la clé qui encaisse sur une fiche (null si inconnue). */
function hpOf(actor) {
  const k = damageKey();
  if (!k || !actor) return null;
  const v = Number(docScope(actor)[k] ?? actor.system?.values?.[k]);
  return Number.isFinite(v) ? v : null;
}

/** Tous les jetons d'invocation (toutes les scènes). */
function allSummons() {
  const out = [];
  for (const s of game.scenes ?? []) for (const t of s.tokens) if (flagOf(t)) out.push(t);
  return out;
}

export class SummonManager {

  static #index = null;

  static init() {
    /* summoned() / summoned("Nom") : les invocations de ce personnage. */
    registerScopeFunctions("summons", (doc) => ({
      summoned: (name = "") => (doc?.uuid ? this.count(doc.uuid, name) : 0)
    }));
    for (const h of ["createToken", "updateToken", "deleteToken", "deleteScene"]) Hooks.on(h, () => { this.#index = null; });

    onSocketMessage(async (p) => {
      if (!isPrimaryGM()) return;
      /* Un joueur n'invoque (ou ne renvoie) qu'au nom d'un personnage à lui. */
      if (!["sbeSummonCreate", "sbeSummonDismiss"].includes(p?.type)) return;
      if (!(await this.#mayAct(p._from, p.by))) return;
      if (p.type === "sbeSummonCreate") await this.#gmCreate(p);
      else await this.#gmDismiss(p.by, p.name ?? "");
    });

    /* Durée : un round de moins par round de combat… */
    Hooks.on("updateCombat", async (combat, changed) => {
      if (!isPrimaryGM() || !("round" in changed) || !combat.started) return;
      const now = Number(changed.round) || 0;
      const prev = Number(combat.previous?.round ?? now - 1);
      if (!(now > 1 && now > prev)) return;
      for (const c of combat.combatants) {
        const td = c.token;
        const f = flagOf(td);
        if (f && Number(f.rounds) > 0) await this.#tick(td, "rounds", 1);
      }
    });
    /* … et du temps de jeu hors combat. */
    Hooks.on("updateWorldTime", async (_t, dt) => {
      if (!isPrimaryGM() || !(dt > 0)) return;
      for (const td of allSummons()) {
        const f = flagOf(td);
        if (!(Number(f.seconds) > 0) || this.#inCombat(td)) continue;
        await this.#tick(td, "seconds", dt);
      }
    });

    /* À 0 sur la clé qui encaisse : l'invocation disparaît (option) ;
       l'invocateur à 0 : ses invocations partent (option). */
    Hooks.on("updateActor", async (actor, changes, options) => {
      /* Retour en arrière (managers/undo) : les invocations suivent seules. */
      if (!isPrimaryGM() || options?.sbeUndo) return;
      const k = damageKey();
      if (!k || !foundry.utils.hasProperty(changes, `system.values.${k}`)) return;
      const hp = hpOf(actor);
      if (hp === null || hp > 0) return;
      const td = actor.isToken ? actor.token : null;
      const f = flagOf(td);
      if (f?.onZero === "remove") await this.#remove([td]);
      const mine = allSummons().filter(t => flagOf(t).by === actor.uuid && flagOf(t).casterDown);
      if (mine.length) await this.#remove(mine);
    });

    /* L'effet qui les tient (concentration…) part : elles partent. */
    Hooks.on("deleteActiveEffect", async (ae, options) => {
      if (!isPrimaryGM() || options?.sbeUndo) return;
      const key = ae.flags?.[SYSTEM_ID]?.key;
      const by = ae.parent?.uuid;
      if (!key || !by) return;
      const mine = allSummons().filter(t => flagOf(t).by === by && flagOf(t).whileEffect === key);
      if (mine.length) await this.#remove(mine);
    });
  }

  /** Nombre d'invocations d'un personnage (toutes, ou d'un PNJ par son nom). */
  static count(byUuid, name = "") {
    if (!this.#index) {
      this.#index = new Map();
      for (const t of allSummons()) {
        const f = flagOf(t);
        if (!this.#index.has(f.by)) this.#index.set(f.by, []);
        this.#index.get(f.by).push(String(f.name ?? ""));
      }
    }
    const list = this.#index.get(byUuid) ?? [];
    const n = String(name ?? "").trim().toLowerCase();
    return n ? list.filter(x => x.toLowerCase() === n).length : list.length;
  }

  /* ============================================================ */
  /*  Étape : invoquer / renvoyer (client)                         */
  /* ============================================================ */

  /**
   * Invoque (visée sur la carte pour chaque créature).
   * @returns {Promise<{ok: boolean, n: number, name: string, rolls: Roll[], error?: string}>}
   */
  static async summon(carrier, st, scope = {}) {
    const actor = game.actors.get(st.actor);
    if (!actor || actor.type === "template") return { ok: false, n: 0, name: "", rolls: [], error: L("SBE.Summon.Missing") };
    if (!canvas.ready || !canvas.scene) return { ok: false, n: 0, name: actor.name, rolls: [], error: L("SBE.Prop.NoScene") };
    const rolls = [];
    const val = async (raw, dflt) => {
      if (!String(raw ?? "").trim()) return dflt;
      const r = await formulaValue(raw, scope).catch(() => ({ value: dflt, roll: null }));
      if (r.roll) rolls.push(r.roll);
      const n = Number(r.value);
      return Number.isFinite(n) ? n : dflt;
    };
    const count = Math.max(0, Math.min(20, Math.floor(await val(st.count, 1))));
    const rounds = Math.max(0, Math.floor(await val(st.rounds, 0)));
    const seconds = Math.max(0, Math.round((await val(st.minutes, 0)) * 60));
    const proto = actor.prototypeToken;
    const img = proto?.texture?.src || actor.img;
    const points = [];
    for (let i = 0; i < count; i++) {
      if (count > 1) ui.notifications.info(L("SBE.Summon.AimN", { i: i + 1, n: count, name: actor.name }));
      const at = await (await import("../props/prop-manager.mjs")).PropManager.aim(img, proto?.width || 1, proto?.height || 1, false);
      if (!at) break;
      /* Ses valeurs : tirées pour elle (des dés différents par créature). */
      const vals = [];
      for (const v of Array.isArray(st.values) ? st.values : []) {
        const key = String(v?.key ?? "").trim();
        if (!key || !String(v?.formula ?? "").trim()) continue;
        const r = await formulaValue(v.formula, scope).catch(() => ({ value: null, roll: null }));
        if (r.roll) rolls.push(r.roll);
        if (r.value === null || r.value === undefined || r.value === "") continue;
        vals.push({ key, mode: ["add", "sub"].includes(v.mode) ? v.mode : "set", value: r.value });
      }
      points.push({ x: at.x, y: at.y, vals });
    }
    if (!points.length) return { ok: false, n: 0, name: actor.name, rolls };
    const payload = {
      type: "sbeSummonCreate", sceneId: canvas.scene.id, actorId: actor.id, points, by: carrier.uuid, userId: game.user.id,
      control: SUMMON_CONTROLS.includes(st.control) ? st.control : "caster",
      init: SUMMON_INITS.includes(st.init) ? st.init : "caster",
      onZero: SUMMON_ZERO.includes(st.onZero) ? st.onZero : "remove",
      whileEffect: String(st.whileEffect ?? ""), casterDown: !!st.casterDown, rounds, seconds
    };
    if (isPrimaryGM()) await this.#gmCreate(payload);
    else if (!requestGM(payload)) return { ok: false, n: 0, name: actor.name, rolls };
    return { ok: true, n: points.length, name: actor.name, rolls };
  }

  /** Renvoie les invocations d'un personnage (toutes, ou d'un PNJ). */
  static async dismiss(carrier, name = "") {
    if (isPrimaryGM()) return this.#gmDismiss(carrier.uuid, name);
    requestGM({ type: "sbeSummonDismiss", by: carrier.uuid, name });
  }

  /* ============================================================ */
  /*  MJ principal                                                 */
  /* ============================================================ */

  /** L'expéditeur est-il MJ, ou propriétaire de l'invocateur ? */
  static async #mayAct(userId, by) {
    const user = game.users.get(userId);
    if (user?.isGM) return true;
    const caster = by ? await fromUuid(by).catch(() => null) : null;
    return !!(user && caster?.testUserPermission?.(user, "OWNER"));
  }

  static async #gmCreate(p) {
    const scene = game.scenes.get(p.sceneId);
    const actor = game.actors.get(p.actorId);
    const caster = p.by ? await fromUuid(p.by).catch(() => null) : null;
    if (!scene || !actor) return;
    const O = CONST.DOCUMENT_OWNERSHIP_LEVELS;
    /* Qui la contrôle : les joueurs de l'invocateur, ou le MJ seul. */
    const ownership = { default: O.LIMITED };
    if (p.control === "caster" && caster) {
      for (const u of game.users) if (!u.isGM && caster.testUserPermission(u, "OWNER")) ownership[u.id] = O.OWNER;
    }
    const casterTok = caster ? activeTokenOf(caster)?.document : null;
    const gs = scene.grid?.size || 100;
    const datas = [];
    for (const pt of (Array.isArray(p.points) ? p.points : []).slice(0, 20)) {
      const base = (await actor.getTokenDocument({}, { parent: scene })).toObject();
      const w = Number(base.width) || 1, h = Number(base.height) || 1;
      let tl = { x: pt.x - (w * gs) / 2, y: pt.y - (h * gs) / 2 };
      try { tl = scene.grid.getSnappedPoint(tl, { mode: CONST.GRID_SNAPPING_MODES.TOP_LEFT_VERTEX }); } catch (_e) { /* grille absente */ }
      delete base._id;
      Object.assign(base, {
        x: Math.round(tl.x), y: Math.round(tl.y), actorId: actor.id, actorLink: false,
        disposition: casterTok?.disposition ?? base.disposition,
        hidden: false
      });
      /* Le jeton non lié garde ses droits dans son delta (vide au départ),
         et les valeurs écrites par l'invocation (sur celles du PNJ). */
      base.delta = { ...(base.delta ?? {}), ownership };
      if (pt.vals?.length) {
        const own = docScope(actor);
        const values = {};
        for (const v of pt.vals) {
          const cur = Number(own[v.key] ?? actor.system?.values?.[v.key]) || 0;
          const n = Number(v.value);
          values[v.key] = v.mode === "set" ? (Number.isFinite(n) && String(v.value).trim() !== "" ? n : v.value)
            : cur + (v.mode === "sub" ? -1 : 1) * (Number.isFinite(n) ? n : 0);
        }
        base.delta.system = foundry.utils.mergeObject(base.delta.system ?? {}, { values });
      }
      foundry.utils.setProperty(base, `flags.${SYSTEM_ID}.${SUMMON_FLAG}`, {
        by: p.by ?? "", name: actor.name, rounds: p.rounds, seconds: p.seconds,
        onZero: p.onZero, whileEffect: p.whileEffect, casterDown: p.casterDown
      });
      datas.push(base);
    }
    let made = [];
    try { made = await scene.createEmbeddedDocuments("Token", datas); } catch (err) { console.warn("SBE | Invocation : jetons non créés", err); return; }
    await this.#joinCombat(made, caster, p.init);
  }

  /** Combat en cours avec l'invocateur : elles y entrent. */
  static async #joinCombat(tokens, caster, init) {
    if (!tokens.length || !caster) return;
    const combat = (game.combats?.contents ?? []).find(c => c.started && c.combatants.some(x => x.actor?.uuid === caster.uuid));
    if (!combat) return;
    const me = combat.combatants.find(x => x.actor?.uuid === caster.uuid);
    const fl = me?.flags?.[SYSTEM_ID] ?? {};
    const after = init === "caster" && me && me.initiative !== null && me.initiative !== undefined;
    const datas = tokens.map(td => ({
      tokenId: td.id, sceneId: td.parent.id, actorId: td.actorId, hidden: td.hidden,
      ...(after ? {
        initiative: me.initiative,
        /* Juste après lui : même score, départage à peine plus bas. */
        flags: { [SYSTEM_ID]: { init0: fl.init0 ?? me.initiative, tie: (Number(fl.tie) || 0) - 1e-6, rnd: Number(fl.rnd) || 0 } }
      } : {})
    }));
    const made = await combat.createEmbeddedDocuments("Combatant", datas);
    if (!after && made.length) await combat.rollInitiative(made.map(c => c.id), { sbeAsk: false });
  }

  static async #gmDismiss(by, name = "") {
    const n = String(name ?? "").trim().toLowerCase();
    const mine = allSummons().filter(t => flagOf(t).by === by && (!n || String(flagOf(t).name ?? "").toLowerCase() === n));
    if (mine.length) await this.#remove(mine);
  }

  /** Retire des invocations (et leur place au combat). */
  static async #remove(tokens) {
    for (const combat of game.combats?.contents ?? []) {
      const ids = combat.combatants.filter(c => tokens.some(t => t.id === c.tokenId && t.parent?.id === c.sceneId)).map(c => c.id);
      if (ids.length) await combat.deleteEmbeddedDocuments("Combatant", ids).catch(() => null);
    }
    const byScene = new Map();
    for (const t of tokens) {
      if (!t?.parent) continue;
      if (!byScene.has(t.parent)) byScene.set(t.parent, []);
      byScene.get(t.parent).push(t.id);
    }
    for (const [scene, ids] of byScene) {
      await scene.deleteEmbeddedDocuments("Token", ids.filter(id => scene.tokens.get(id))).catch(err => console.warn("SBE | Invocation : retrait", err));
    }
  }

  static #inCombat(td) {
    return (game.combats?.contents ?? []).some(c => c.started && c.combatants.some(x => x.tokenId === td.id && x.sceneId === td.parent?.id));
  }

  /** Décompte la durée ; à zéro (sur la mesure qui courait), elle part. */
  static #tick(td, field, amount) {
    /* Une avancée à la fois par invocation (deux avancées du temps
       rapprochées décomptent toutes les deux). */
    return gmQueue(`summon:${td.uuid}`, () => this.#tickNow(td, field, amount));
  }

  static async #tickNow(td, field, amount) {
    if (!td?.parent?.tokens?.get(td.id)) return;
    const f = flagOf(td);
    const left = Math.max(0, (Number(f?.[field]) || 0) - amount);
    if (left <= 0) return this.#remove([td]);
    await td.update({ [`flags.${SYSTEM_ID}.${SUMMON_FLAG}.${field}`]: left });
  }
}
