/**
 * SBE — PIÈGES : ce qui se passe sur la scène
 *
 * Un piège est un objet de scène dont le groupe « Piège » est coché.
 * État du pion posé (drapeau `trap`) :
 *   { zone, armed, charges, seen: [ids de personnages qui l'ont repéré],
 *     tried: [ids qui ont déjà tenté de le repérer], shown: révélé à tous }
 *
 * Double-clic (MJ, poseur, ceux qui l'ont repéré, à portée) : le panneau
 * de l'objet — composé dans l'atelier, ou automatique avec les actions du
 * piège. Actions (stepOp, aussi étape « Scène → Piège ») : désamorcer
 * (jet trDisarmKey ; désarmé et révélé à tous), récupérer (désamorcé
 * seulement), réarmer, recamoufler (on choisit qui le voit encore).
 * Le MJ voit les zones de déclenchement (jaune) et d'effet (rouge) au
 * survol, ou toutes avec l'outil « Zones des pièges » des jetons.
 *
 * Tout se décide chez le MJ principal (jets secrets, recul, écritures) :
 *  1. un personnage passe à portée de détection → jet (secret), une
 *     tentative ; réussi → il voit le piège ;
 *  2. il entre dans la zone (s'y arrête, y passe, ou les deux) :
 *     - repéré et « l'évite » → rien ;
 *     - pas repéré → dernière chance (jet de détection) : réussi → il
 *       recule et voit le piège ;
 *     - esquive (si permise) : réussie → il recule, ou un autre bouton ;
 *     - sinon : arrêté sur le piège, le bouton d'effet part, la cible
 *       est le déclencheur ;
 *  3. après : disparaît, une charge de moins, réarmé, ou désarmé ;
 *     révélé aux personnages proches.
 * Visibilité d'un piège caché : le MJ, celui qui l'a posé, et les
 * joueurs dont un personnage l'a repéré.
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { isPrimaryGM, onSocketMessage, requestGM, gmQueue } from "../../helpers/socket.mjs";
import { walkElements } from "../../builder/element-renderer.mjs";
import { evalExpression } from "../../builder/formula-engine.mjs";
import { docScope } from "../../builder/doc-context.mjs";
import { rollField } from "../../builder/field-roll.mjs";
import { messageModeChoices } from "../../builder/roll-visibility.mjs";
import { PropManager } from "../props/prop-manager.mjs";
import { triggerZoneOf, distanceTo, drawZone, zoneFromCfg } from "./trap-zone.mjs";
import { flatSteps } from "../../builder/step-blocks.mjs";
import { CombatManager } from "../combat/combat-manager.mjs";
import { placeShape } from "../zones/zone-geom.mjs";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
export const TRAP_FLAG = "trap";

export class TrapManager {

  /** Pions que le MJ déplace lui-même (recul, arrêt) : pas de nouveau test. */
  static #skip = new Set();
  static #hover = null;
  /* MJ : toutes les zones des pièges de la scène, affichées en permanence. */
  static #showAll = false;
  static #all = null;

  static init() {
    Hooks.on("moveToken", (td, movement) => {
      if (!isPrimaryGM() || PropManager.isPropToken(td)) return;
      if (this.#skip.delete(td.id)) return;
      /* Un déplacement à la fois par scène : deux pions qui entrent
         ensemble ne déclenchent pas deux fois un piège à usage unique. */
      gmQueue(`trap:${td.parent?.id ?? ""}`, () => this.#onMove(td, movement))
        .catch(err => console.warn("SBE | Pièges : déplacement", err));
    });

    /* Survol : la zone de déclenchement pour qui voit le piège ; le MJ
       voit aussi la zone d'effet. */
    Hooks.on("hoverToken", (tok, on) => {
      this.#hover?.destroy();
      this.#hover = null;
      if (!on || !this.isTrap(tok.document) || !tok.isVisible) return;
      const g = this.#overlay();
      this.#drawTrap(g, tok.document);
      canvas.controls.addChild(g);
      this.#hover = g;
    });
    Hooks.on("canvasTearDown", () => { this.#hover = null; this.#all = null; });

    /* Double-clic : le panneau de l'objet (composé dans l'atelier, ou
       automatique avec les actions du piège), même si le double-clic de
       l'objet est coupé : un piège se manipule toujours ainsi. */
    PropManager.registerOpener((td) => {
      if (!this.isTrap(td)) return false;
      PropManager.open(td);
      return true;
    });

    /* MJ : outil « Zones des pièges » (toutes, en permanence). */
    Hooks.on("getSceneControlButtons", (controls) => {
      const group = controls.tokens ?? controls.token;
      if (!group?.tools || !game.user.isGM) return;
      group.tools.sbeTrapZones = {
        name: "sbeTrapZones", order: 93, title: "SBE.Trap.ShowZones", icon: "fa-solid fa-land-mine-on",
        toggle: true, active: this.#showAll,
        onChange: (_ev, active) => { this.#showAll = !!active; this.#redrawAll(); }
      };
    });
    const redraw = () => { if (this.#showAll) this.#redrawAll(); };
    Hooks.on("canvasReady", redraw);
    for (const h of ["createToken", "deleteToken", "updateToken"]) {
      Hooks.on(h, (t) => { if (this.isTrap(t?.document ?? t)) redraw(); });
    }
    /* Piège accroché à une région : sa forme change. */
    Hooks.on("updateRegion", redraw);

    /* Étape « Piège » demandée par un joueur. */
    onSocketMessage((p) => {
      if (p?.type !== "sbeTrapOp" || !isPrimaryGM()) return;
      const td = fromUuidSync(p.token);
      const actor = p.actor ? fromUuidSync(p.actor) : null;
      if (td) this.#apply(td, p.op, actor, Array.isArray(p.seen) ? p.seen : null).catch(err => console.warn("SBE | Pièges : étape", err));
    });

    /* Ce qui change la visibilité d'un piège : son état. */
    Hooks.on("updateToken", (td, changes) => {
      if (foundry.utils.hasProperty(changes, `flags.${SYSTEM_ID}.${TRAP_FLAG}`)) td.object?.renderFlags?.set?.({ refreshVisibility: true, refreshState: true });
    });

    this.#patchToken();
  }

  /* ============================================================ */
  /*  État                                                         */
  /* ============================================================ */

  static isTrap(td) {
    const doc = td?.document ?? td;
    return !!doc && PropManager.isPropToken(doc) && !PropManager.kindOf(doc) && PropManager.tokenCfg(doc).trOn;
  }

  static stateOf(td) {
    const doc = td?.document ?? td;
    const cfg = PropManager.tokenCfg(doc);
    const f = doc?.getFlag?.(SYSTEM_ID, TRAP_FLAG) ?? {};
    return {
      zone: f.zone ?? zoneFromCfg(cfg),
      armed: f.armed !== false,
      charges: Number.isFinite(Number(f.charges)) ? Number(f.charges) : cfg.trCharges,
      seen: Array.isArray(f.seen) ? f.seen : [],
      tried: Array.isArray(f.tried) ? f.tried : [],
      shown: !!f.shown
    };
  }

  static async #setState(td, patch) {
    const st = { ...this.stateOf(td), ...patch };
    await td.update({ [`flags.${SYSTEM_ID}.${TRAP_FLAG}`]: st });
  }

  /** Premier réglage d'un piège posé (zone choisie à la pose). */
  static initialFlag(cfg, zone) {
    return { zone: zone ?? zoneFromCfg(cfg), armed: true, charges: cfg.trCharges, seen: [], tried: [], shown: false };
  }

  /** Ce joueur voit-il ce piège caché ? */
  static canSee(td, user = game.user) {
    if (user.isGM) return true;
    const doc = td?.document ?? td;
    if (PropManager.flagsOf(doc).owner === user.id) return true;
    if (this.stateOf(doc).shown) return true;
    return this.stateOf(doc).seen.some(id => game.actors.get(id)?.testUserPermission(user, "OWNER"));
  }

  /** Ce piège est-il encore caché à TOUS les joueurs (ni repéré, ni révélé) ? */
  static hiddenFromPlayers(td) {
    const doc = td?.document ?? td;
    if (!this.isTrap(doc) || !PropManager.tokenCfg(doc).trHidden) return false;
    const st = this.stateOf(doc);
    if (st.shown || st.seen.length) return false;
    const owner = game.users.get(PropManager.flagsOf(doc).owner);
    return !owner || owner.isGM;
  }

  static #patchToken() {
    const Base = CONFIG.Token.objectClass;
    const M = this;
    class SBETrapToken extends Base {
      get isVisible() {
        if (M.isTrap(this.document) && PropManager.tokenCfg(this.document).trHidden && !game.user.isGM) {
          return M.canSee(this.document) && super.isVisible;
        }
        return super.isVisible;
      }

      /* MJ : un piège encore caché à tous les joueurs se montre à demi
         transparent (comme un jeton caché) ; repéré ou révélé, il
         reprend sa pleine opacité. */
      _getTargetAlpha() {
        const a = super._getTargetAlpha();
        return game.user.isGM && M.hiddenFromPlayers(this.document) ? Math.min(a, 0.5) : a;
      }
    }
    CONFIG.Token.objectClass = SBETrapToken;
  }

  /* ============================================================ */
  /*  Déplacement                                                  */
  /* ============================================================ */

  static async #onMove(td, movement) {
    const actor = td.actor;
    if (!actor || actor.type === "prop") return;
    const scene = td.parent;
    const gs = scene?.grid?.size || 100;
    const o = movement?.origin ?? { x: td.x, y: td.y };
    const pts = [{ x: o.x, y: o.y }, ...(movement?.passed?.waypoints ?? []).map(w => ({ x: w.x, y: w.y }))];
    if (pts.length < 2) return;
    /* Les jets, la visée et les médias se font sur la carte du MJ : il doit
       regarder cette scène. */
    if (canvas?.scene?.id !== scene?.id) {
      if (scene?.tokens?.some(t => this.isTrap(t))) ui.notifications.warn(L("SBE.Trap.OtherScene", { scene: scene.name }));
      return;
    }
    /* Le trajet (coin haut-gauche du pion), tous les quarts de case. */
    const path = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (gs / 4)));
      for (let k = 1; k <= n; k++) path.push({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n });
    }
    const w = (td.width ?? 1) * gs, h = (td.height ?? 1) * gs;
    const center = (p) => ({ x: p.x + w / 2, y: p.y + h / 2 });

    for (const trap of [...(scene?.tokens ?? [])]) {
      if (!this.isTrap(trap)) continue;
      const cfg = PropManager.tokenCfg(trap);
      const st = this.stateOf(trap);
      if (!st.armed) continue;
      if (!this.#concerns(trap, cfg, td, actor)) continue;
      const zone = triggerZoneOf(trap, st.zone, PropManager.regionOf(trap));
      const inside = (p) => zone.has(center(p), td.elevation ?? 0);
      if (inside(path[0])) continue;                       /* déjà dedans au départ */
      const entry = path.findIndex(inside);

      /* 1. Détection passive, à portée (avant d'entrer). */
      if (cfg.trHidden && cfg.trDetKey && !st.seen.includes(actor.id) && !st.tried.includes(actor.id)) {
        const tc = trap.object?.center ?? { x: trap.x + (trap.width ?? 1) * gs / 2, y: trap.y + (trap.height ?? 1) * gs / 2 };
        const reach = (cfg.trDetRange + Math.max(trap.width ?? 1, trap.height ?? 1) / 2) * gs;
        /* Accroché à une région : la distance se compte depuis son bord. */
        const near = PropManager.regionOf(trap)
          ? (p) => distanceTo(zone.polys, center(p)) <= cfg.trDetRange * gs
          : (p) => Math.hypot(center(p).x - tc.x, center(p).y - tc.y) <= reach;
        const until = entry >= 0 ? path.slice(0, entry) : path;
        if (until.some(near)) {
          await this.#detect(trap, cfg, actor, false);
        }
      }

      /* 2. Dans la zone ? */
      if (entry < 0) continue;
      const stops = inside(path.at(-1));
      const fires = (cfg.trWhen !== "pass" && stops) || (cfg.trWhen !== "stop" && entry >= 0);
      if (!fires) continue;
      await this.#enter(trap, cfg, td, actor, path, entry);
      return;                                             /* un piège à la fois */
    }
  }

  /** Ce piège réagit-il à ce personnage ? */
  static #concerns(trap, cfg, td, actor) {
    if (cfg.trCombat && !game.combat?.started) return false;
    if (cfg.trWho === "players" && !actor.hasPlayerOwner) return false;
    const poser = PropManager.flagsOf(trap).actor ? fromUuidSync(PropManager.flagsOf(trap).actor) : null;
    if (poser && poser.id === actor.id) return false;
    if (cfg.trAllies && poser) {
      const pd = poser.getActiveTokens?.()[0]?.document?.disposition ?? poser.prototypeToken?.disposition;
      if (pd !== undefined && pd === td.disposition) return false;
    }
    return true;
  }

  /** Difficulté (rend le jet plus dur) : formule lue sur le piège ; vide = aucune. */
  static #dc(trap, formula) {
    if (!String(formula ?? "").trim()) return null;
    const item = PropManager.itemOf(trap);
    const v = Number(evalExpression(String(formula), item ? docScope(item) : {}));
    return Number.isFinite(v) ? v : null;
  }

  /** Condition lue sur le piège (vide = vraie). */
  static #cond(trap, formula) {
    if (!String(formula ?? "").trim()) return true;
    const item = PropManager.itemOf(trap);
    return !!evalExpression(String(formula), item ? docScope(item) : {});
  }

  /** Visibilité « seul le MJ voit le résultat » de Foundry. */
  static #secretVis() {
    const blind = messageModeChoices().list.find(m => /blind/i.test(m.value));
    return blind ? { def: blind.value, allowed: [blind.value] } : null;
  }

  static #ok(res) { return ["success", "critSuccess"].includes(res?.outcome); }

  /** Jet de détection (secret). @returns vrai si repéré. */
  static async #detect(trap, cfg, actor, last) {
    const st = this.stateOf(trap);
    const res = await rollField(actor, cfg.trDetKey, {
      title: L(last ? "SBE.Trap.LastChance" : "SBE.Trap.Detect"),
      difficulty: this.#dc(trap, cfg.trDetDc) ?? 0, vis: this.#secretVis()
    });
    if (!res) ui.notifications.warn(L("SBE.Trap.NoRoll", { key: cfg.trDetKey }));
    const seen = this.#ok(res);
    await this.#setState(trap, {
      tried: [...new Set([...st.tried, actor.id])],
      seen: seen ? [...new Set([...st.seen, actor.id])] : st.seen
    });
    if (seen) await this.#whisper(actor, L("SBE.Trap.Spotted", { name: actor.name }), trap);
    return seen;
  }

  /** Le personnage entre dans la zone. */
  static async #enter(trap, cfg, td, actor, path, entry) {
    let st = this.stateOf(trap);
    const seen = !cfg.trHidden || st.seen.includes(actor.id);
    /* Il l'a repéré : il l'évite. */
    if (seen && cfg.trHidden && cfg.trAvoid) return;
    /* Dernière chance. */
    if (cfg.trHidden && !seen && cfg.trLast && cfg.trDetKey && !st.tried.includes(actor.id)) {
      if (await this.#detect(trap, cfg, actor, true)) { await this.#back(td, cfg, path, entry); return; }
      st = this.stateOf(trap);
    }
    /* Arrêté sur le piège (il y passait). */
    const end = path.at(-1), at = path[entry];
    if (cfg.trWhen !== "stop" && (Math.abs(end.x - at.x) > 1 || Math.abs(end.y - at.y) > 1)) await this.#moveTo(td, this.#snap(td, at));
    const trapItem = PropManager.itemOf(trap);
    await this.#announce(trap, actor, L("SBE.Trap.Triggered", { name: actor.name, trap: trapItem?.name ?? "" }));
    /* Esquive. */
    const canDodge = cfg.trDodgeKey && (!cfg.trDodgeSeen || seen || st.seen.includes(actor.id)) && this.#cond(trap, cfg.trDodgeIf);
    let dodged = false;
    if (canDodge) {
      const res = await rollField(actor, cfg.trDodgeKey, { title: L("SBE.Trap.Dodge"), difficulty: this.#dc(trap, cfg.trDodgeDc) ?? 0 });
      if (!res) ui.notifications.warn(L("SBE.Trap.NoRoll", { key: cfg.trDodgeKey }));
      dodged = this.#ok(res);
    }
    if (dodged) {
      if (cfg.trDodgeAct === "button" && cfg.trDodgeBtn) await this.#fire(trap, cfg.trDodgeBtn, td);
      else await this.#back(td, cfg, path, entry);
    } else if (cfg.trBtn) await this.#fire(trap, cfg.trBtn, td);
    await this.#after(trap, cfg, td);
  }

  /** Lance un bouton du piège ; sa cible est le déclencheur. */
  static async #fire(trap, key, victim) {
    const item = PropManager.itemOf(trap);
    const btn = [...walkElements(item?.system?.template?.system?.elements ?? [])].find(e => e?.kind === "button" && e.key === key);
    if (!btn) { ui.notifications.warn(L("SBE.Trig.NoButton", { key })); return; }
    const { runAction } = await import("../../builder/item-actions.mjs");
    const target = PropManager.targetDocOf(victim);
    /* Zone d'effet : centrée sur le piège (fixe) ou sur la victime. */
    const at = PropManager.tokenCfg(trap).trCenter === "trap" ? "trap" : "target";
    await runAction(item, btn.id, { vars: { _autoTarget: victim.id, _autoAt: at }, targets: target ? [target] : [] });
  }

  /** Après le déclenchement : disparaît, une charge, réarmé ou désarmé ; révélé autour. */
  static async #after(trap, cfg, victim) {
    if (cfg.trAfter === "once" || (cfg.trAfter === "charges" && this.stateOf(trap).charges <= 1)) {
      /* Désarmé tout de suite (personne d'autre ne le déclenche) ; il
         part le temps que ses médias (tir, impact) quittent son pion. */
      await this.#setState(trap, { armed: false, charges: 0 }).catch(() => null);
      setTimeout(() => trap.delete().catch(() => null), 2000);
      return;
    }
    const st = this.stateOf(trap);
    const patch = {};
    if (cfg.trAfter === "charges") patch.charges = st.charges - 1;
    if (cfg.trAfter === "manual") patch.armed = false;
    /* Révélé aux personnages proches (et au déclencheur). */
    const gs = trap.parent?.grid?.size || 100;
    const tc = trap.object?.center;
    const near = new Set(st.seen);
    if (victim.actor) near.add(victim.actor.id);
    if (cfg.trReveal > 0 && tc) {
      for (const t of trap.parent.tokens) {
        if (!t.actor || PropManager.isPropToken(t)) continue;
        const c = t.object?.center;
        if (c && Math.hypot(c.x - tc.x, c.y - tc.y) <= cfg.trReveal * gs + gs / 2) near.add(t.actor.id);
      }
    }
    patch.seen = [...near];
    await this.#setState(trap, patch);
  }

  /* ============================================================ */
  /*  Recul, arrêt                                                 */
  /* ============================================================ */

  static #snap(td, p) {
    try {
      return td.object?.getSnappedPosition?.(p) ?? p;
    } catch (_e) { return p; }
  }

  static async #moveTo(td, p) {
    this.#skip.add(td.id);
    try {
      await td.move({ x: Math.round(p.x), y: Math.round(p.y), action: "displace" }, { constrainOptions: { ignoreWalls: true, ignoreCost: true } });
    } catch (err) {
      this.#skip.delete(td.id);
      console.warn("SBE | Pièges : déplacement du pion", err);
    }
  }

  /** Recule : la case d'avant la zone, le début du déplacement, ou pas du tout. */
  static async #back(td, cfg, path, entry) {
    if (cfg.trBack === "none") {
      const at = path[entry];
      const end = path.at(-1);
      if (Math.abs(end.x - at.x) > 1 || Math.abs(end.y - at.y) > 1) await this.#moveTo(td, this.#snap(td, at));
      return;
    }
    let p = path[0];
    if (cfg.trBack === "cell") {
      const gs = td.parent?.grid?.size || 100;
      /* Le dernier point du trajet hors de la zone, à au moins une demi-case de l'entrée. */
      const at = path[entry];
      for (let i = entry - 1; i >= 0; i--) {
        if (Math.hypot(path[i].x - at.x, path[i].y - at.y) >= gs * 0.5) { p = path[i]; break; }
      }
      p = this.#snap(td, p);
    }
    await this.#moveTo(td, p);
  }

  /* ============================================================ */
  /*  Messages                                                     */
  /* ============================================================ */

  /** Au MJ et aux propriétaires du personnage. */
  static async #whisper(actor, text, trap) {
    const owners = game.users.filter(u => u.isGM || actor.testUserPermission(u, "OWNER")).map(u => u.id);
    await this.#post(text, owners, trap);
  }

  /** Le déclenchement : le MJ, le déclencheur et ceux qui voient le piège. */
  static async #announce(trap, actor, text) {
    const users = game.users.filter(u => u.isGM || actor.testUserPermission(u, "OWNER") || this.canSee(trap, u)).map(u => u.id);
    await this.#post(text, users, trap);
  }

  static async #post(text, whisper, trap) {
    const img = trap?.texture?.src ?? "";
    await ChatMessage.create({
      content: `<div class="sbe-trap-msg">${img ? `<img src="${esc(img)}" alt="">` : ""}<span>${esc(text)}</span></div>`,
      whisper, speaker: { alias: L("SBE.Trap.Speaker") }
    });
  }

  /* ============================================================ */
  /*  Étape « Scène » → « Piège » ; boutons du MJ                  */
  /* ============================================================ */

  /** Actions du piège, dans l'ordre des boutons du panneau automatique. */
  static OPS = ["disarm", "take", "salvage", "rearm", "camo"];

  /** Pourquoi cette action est impossible maintenant (ou ""). */
  static opReason(item, op) {
    const td = PropManager.placedTokenOf(item);
    if (!td || !this.isTrap(td)) return "";
    const armed = this.stateOf(td).armed;
    if (op === "disarm" && !armed) return L("SBE.Trap.Why.Disarmed");
    if (op === "take" && armed) return L("SBE.Trap.Why.DisarmFirst");
    /* Récupérer son contenu (l'arme qu'il porte) : le piège est démonté. */
    if (op === "salvage") {
      const inside = (td.actor?.items?.contents ?? []).some(i => String(i.system?.carry?.host ?? "") === item.id);
      if (!inside) return L("SBE.Trap.Why.Empty");
      if (armed) return L("SBE.Trap.Why.DisarmFirst");
    }
    if (op === "rearm" && armed) return L("SBE.Trap.Why.Armed");
    return "";
  }

  /**
   * Action sur un piège posé (étape « Scène → Piège », panneau) :
   * disarm (jet trDisarmKey, puis désarmé et révélé à tous), take
   * (désamorcé : dans l'inventaire), salvage (désamorcé : son contenu
   * dans l'inventaire, le piège est détruit), rearm, camo (on choisit qui le
   * voit encore), reveal, hide.
   */
  static async stepOp(td, op, actor) {
    if (!this.isTrap(td)) return { error: L("SBE.Trap.NotTrap") };
    const item = PropManager.itemOf(td);
    const why = this.opReason(item, op);
    if (why) return { error: why };
    const cfg = PropManager.tokenCfg(td);
    const name = item?.name ?? td.name;
    let seen = null;
    if (op === "disarm" && cfg.trDisarmKey) {
      if (!actor) return { error: L("SBE.Prop.NeedActor") };
      const res = await rollField(actor, cfg.trDisarmKey, { title: L("SBE.Trap.Op.disarm"), difficulty: this.#dc(td, cfg.trDisarmDc) ?? 0, after: "now" });
      if (!res) return { error: L("SBE.Trap.NoRoll", { key: cfg.trDisarmKey }) };
      if (!this.#ok(res)) return { error: L("SBE.Trap.DisarmFail", { name }) };
    }
    if (op === "take" || op === "salvage") {
      if (!actor) return { error: L("SBE.Prop.NeedActor") };
      await PropManager.retrieve(td, actor, { contents: op === "salvage" });
      return {};
    }
    if (op === "camo") {
      seen = await this.#askShare(td, actor);
      if (!seen) return { cancel: true };
    }
    const real = op === "camo" ? "hide" : op;
    if (isPrimaryGM()) await this.#apply(td, real, actor, seen);
    else if (!requestGM({ type: "sbeTrapOp", token: td.uuid, op: real, actor: actor?.uuid ?? "", seen })) return {};
    if (op === "disarm") ui.notifications.info(L("SBE.Trap.DisarmOk", { name }));
    return {};
  }

  static async #apply(td, op, actor, seen = null) {
    const st = this.stateOf(td);
    const camo = seen ? { seen, tried: seen, shown: false } : null;
    switch (op) {
      /* Désamorcé : inoffensif, et révélé à tous. */
      case "disarm": return this.#setState(td, { armed: false, shown: true });
      case "rearm": return this.#setState(td, { armed: true, charges: Math.max(st.charges, 1), ...(camo ?? {}) });
      case "reveal": return actor ? this.#setState(td, { seen: [...new Set([...st.seen, actor.id])] }) : null;
      case "hide": return this.#setState(td, camo ?? { seen: [], tried: [], shown: false });
      default: return null;
    }
  }

  /** MJ : armer / désarmer depuis le pied du panneau. */
  static async toggle(td) {
    const st = this.stateOf(td);
    await this.#setState(td, st.armed ? { armed: false } : { armed: true, charges: Math.max(st.charges, 1), tried: [] });
  }

  /* ============================================================ */
  /*  Zones affichées (survol, outil du MJ)                        */
  /* ============================================================ */

  /** Zone d'effet du piège (bouton d'effet, étape d'attaque à zone), centrée sur lui. */
  static #impactOf(trap) {
    const cfg = PropManager.tokenCfg(trap);
    if (cfg.trCenter !== "trap" || !cfg.trBtn) return [];
    const item = PropManager.itemOf(trap);
    const btn = [...walkElements(item?.system?.template?.system?.elements ?? [])].find(e => e?.kind === "button" && e.key === cfg.trBtn);
    const step = flatSteps(btn?.config?.steps).find(x => x?.type === "attack" && String(x.zone ?? "").trim());
    if (!step) return [];
    const { eff } = CombatManager.effective(step);
    const scope = docScope(item);
    const z = CombatManager.stepZone(eff, scope, 0);
    if (!z?.shape) return [];
    const gs = trap.parent?.grid?.size || 100;
    const scale = Number(evalExpression(String(eff.zScale ?? "").trim() || "1", scope)) || 1;
    return placeShape(z.shape, CombatManager.docCenter(trap), 0, gs, scale);
  }

  /** Calque de dessin qui laisse passer la souris (sinon il vole le double-clic du piège). */
  static #overlay() {
    const g = new PIXI.Graphics();
    g.eventMode = "none";
    g.interactiveChildren = false;
    return g;
  }

  /** Déclenchement (jaune) ; effet (rouge), pour le MJ. */
  static #drawTrap(g, trap) {
    for (const pts of triggerZoneOf(trap, this.stateOf(trap).zone, PropManager.regionOf(trap)).polys) drawZone(g, pts);
    if (!game.user.isGM) return;
    for (const pc of this.#impactOf(trap)) drawZone(g, pc.pts.flat(), 0xff3030);
  }

  static #redrawAll() {
    this.#all?.destroy();
    this.#all = null;
    if (!this.#showAll || !canvas?.ready || !game.user.isGM) return;
    const g = this.#overlay();
    for (const t of canvas.scene?.tokens ?? []) if (this.isTrap(t)) this.#drawTrap(g, t);
    canvas.controls.addChild(g);
    this.#all = g;
  }

  /* ============================================================ */
  /*  Recamoufler                                                  */
  /* ============================================================ */

  /**
   * Recamoufler : les personnages des joueurs présents sur la scène,
   * cochés s'ils le voyaient déjà. Celui qui agit le voit toujours.
   * @returns {Promise<string[]|null>} ids d'acteurs, null = annulé
   */
  static async #askShare(doc, actor) {
    const st = this.stateOf(doc);
    const list = [];
    for (const t of doc.parent?.tokens ?? []) {
      const a = t.actor;
      if (!a || a === actor || !a.hasPlayerOwner || PropManager.isPropToken(t) || list.some(x => x.a === a)) continue;
      list.push({ a, img: t.texture?.src || a.img });
    }
    const keep = actor ? [actor.id] : [];
    if (!list.length) return keep;
    const rows = list.map(({ a, img }) => `<label class="sbe-trap-share">
      <input type="checkbox" name="who" value="${esc(a.id)}" ${st.seen.includes(a.id) ? "checked" : ""}>
      <img src="${esc(img)}" alt=""><span>${esc(a.name)}</span></label>`).join("");
    const res = await foundry.applications.api.DialogV2.wait({
      window: { title: L("SBE.Trap.ShareTitle"), icon: "fa-solid fa-eye-slash" },
      classes: ["sbe-condense"], position: { width: 380 },
      content: `<p class="notes">${esc(L("SBE.Trap.ShareHint"))}</p><div class="sbe-trap-sharelist">${rows}</div>`,
      buttons: [{
        action: "ok", label: L("SBE.Common.Validate"), icon: "fa-solid fa-check", default: true,
        callback: (_e, b) => [...b.form.querySelectorAll('input[name="who"]:checked')].map(i => i.value)
      }, { action: "cancel", label: L("SBE.Common.Cancel"), icon: "fa-solid fa-xmark" }],
      rejectClose: false
    }).catch((err) => { console.warn("SBE | Pièges : fenêtre", err); return null; });
    if (!Array.isArray(res)) return null;
    return [...new Set([...keep, ...res])];
  }
}
