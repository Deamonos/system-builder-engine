/**
 * SBE — COMBAT : l'étape de bouton « Attaquer »
 *
 * Le moteur ne connaît ni parade, ni esquive, ni points de vie : le
 * MJ dit quelles clés jouent quel rôle.
 *
 *  - sur l'ARME (étape « Attaquer » d'un bouton) :
 *      jet      champ à jet de l'arme (son score, ses options) ;
 *      portée   formule en cases (vide = illimitée) ;
 *      défense  formule lue sur la fiche de la CIBLE (« 1d100 + esquive ») ;
 *      dégâts   formule de dégâts (sur l'arme) ;
 *      type     type de dégâts (texte, ou formule qui le donne) ;
 *      coups    multiplicateur des dégâts (rafale…), 1 par défaut ;
 *      zone     nom d'une forme (cercle, cône, ligne, ou dessinée),
 *               ses tailles, la sauvegarde des cibles, la traversée.
 *  - dans le MANAGER Combat (règles de la table) : clé qui encaisse,
 *    critique, types de dégâts → réduction, couverture, murs, visée
 *    au sol et déviation.
 *
 * CIBLE UNIQUE : cible (T ou clic), portée, défense de la cible, jet
 * d'attaque contre son total (égalité = touché), dégâts réduits.
 * ZONE : la forme suit la souris ; posée sur le point d'impact, elle
 * peut viser un jeton (attaque contre sa défense) ou le sol (jet contre
 * un DD) — ratée, elle dévie. Partant du tireur (cône, ligne…), elle
 * part sans jet. Chaque cible touchée reçoit les dégâts × l'intensité
 * de la zone sur elle, et peut se sauvegarder (moitié ou rien).
 *
 * Le MJ applique tout de suite ; pour un joueur, la carte porte un
 * bouton que seul le MJ peut cliquer.
 */

import { cleanVis, visDefaultMode, TARGETS_MODE, targetsWhisper, gmIds, isPublicMode } from "../../builder/roll-visibility.mjs";
import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { rollField, askRollWindow, defaultOptionValues } from "../../builder/field-roll.mjs";
import { cleanOption, cleanPreviewLine } from "./attack-options.mjs";
import { docScope } from "../../builder/doc-context.mjs";
import { evalExpression, rollableFormula } from "../../builder/formula-engine.mjs";
import { carrierOf } from "../../builder/inventory.mjs";
import { walkElements } from "../../builder/element-renderer.mjs";
import { awaitCanvasClick, activeTokenOf } from "../../helpers/canvas-utils.mjs";
import { ChatCards } from "../chat/chat-cards.mjs";
import { EffectManager } from "../effects/effect-manager.mjs";
import { Identity } from "../../helpers/identity.mjs";
import { ZoneShapes } from "../zones/zone-shapes.mjs";
import { ZoneTargeting } from "../zones/zone-targeting.mjs";
import { placeShape, groundDD, scatter } from "../zones/zone-geom.mjs";
import { onSocketMessage, isPrimaryGM, requestGM, valueQueue, gmQueue, onCardAnswer, answerCard } from "../../helpers/socket.mjs";
import { PropManager } from "../props/prop-manager.mjs";
import { UndoManager } from "../undo/undo-manager.mjs";
import { cleanInit } from "./initiative.mjs";
import { HitLocations, zoneSlug } from "./hit-locations.mjs";
import { cleanAfter, afterFor, freshState, choices as afterChoices, play as afterPlay, canClick as afterCanClick, cardHtml as afterCardHtml } from "../../builder/roll-after.mjs";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const HIT = new Set(["success", "critSuccess"]);

export class CombatManager {

  static DEFAULTS = {
    damageKey: "",        /* clé (jauge) qui encaisse les dégâts */
    critMult: 2,          /* multiplicateur des dégâts en critique */
    types: [],            /* [{ name, reduceKey }] */
    cover: 50,            /* % d'une case (ou du jeton) à couvrir pour toucher */
    measure: "cells",     /* "cells" | "token" (sans grille : toujours le jeton) */
    walls: "move",        /* "none" | "move" | "sight" */
    ground: { on: true, base: 30, byRange: 40 },
    scatter: { min: 3, max: 5 },
    profiles: [],         /* profils d'attaque (cf. PROFILE_FIELDS) */
    /* MESSAGES D'ATTAQUE : visibilité par défaut + permises (imposées à
       toutes les attaques, devant le réglage du jet de l'arme) ; « Détails
       au MJ seul » : la table voit l'attaque, les chiffres vont au MJ. */
    vis: { def: "", allowed: [] },
    gmDetails: false
  };

  /** Ce qu'un PROFIL d'attaque regroupe (et qu'une arme peut remplacer). */
  static PROFILE_FIELDS = ["defense", "ignoreDefenseIf", "sureHitIf", "unblockable", "dmgType", "zone", "zRadius", "zLength", "zAngle", "zWidth", "zScale",
    "save", "saveMode", "saveVs", "traverse", "traverseLimit", "push", "pushSave",
    "loc", "locFormula", "locAim", "locArea", "locCount", "locSplit",
    /* Dégâts non létaux : si la formule est vraie, la clé de la cible ne
       descend pas sous la valeur gardée ; l'atteindre pose l'effet. */
    "nonLethalIf", "nonLethalKeep", "nonLethalEffect"];

  static getConfig() {
    let c = {};
    try { c = game.settings.get(SYSTEM_ID, "combat") ?? {}; } catch (_e) { /* pas encore inscrit */ }
    return this.normalize(c);
  }

  /** Réglages complets et propres (lecture, import). */
  static normalize(c = {}) {
    const d = this.DEFAULTS;
    const num = (v, def) => (Number.isFinite(Number(v)) && v !== "" && v !== null ? Number(v) : def);
    return {
      damageKey: String(c.damageKey ?? d.damageKey),
      critMult: Math.max(1, num(c.critMult, d.critMult)),
      types: (Array.isArray(c.types) ? c.types : [])
        .map(t => ({ name: String(t?.name ?? "").trim(), reduceKey: String(t?.reduceKey ?? "").trim() }))
        .filter(t => t.name),
      cover: Math.max(1, Math.min(100, num(c.cover, d.cover))),
      measure: c.measure === "token" ? "token" : "cells",
      walls: ["none", "move", "sight"].includes(c.walls) ? c.walls : d.walls,
      ground: {
        on: c.ground?.on === undefined ? d.ground.on : !!c.ground.on,
        base: num(c.ground?.base, d.ground.base),
        byRange: num(c.ground?.byRange, d.ground.byRange)
      },
      scatter: {
        min: Math.max(0, num(c.scatter?.min, d.scatter.min)),
        max: Math.max(0, num(c.scatter?.max, d.scatter.max))
      },
      vis: (() => { const v = cleanVis(c.vis, { targets: true }); return { def: v.def, allowed: v.allowed }; })(),
      gmDetails: !!c.gmDetails,
      /* INITIATIVE (voir initiative.mjs). */
      init: cleanInit(c.init ?? {}),
      profiles: (Array.isArray(c.profiles) ? c.profiles : []).map(p => {
        const out = { id: String(p?.id || foundry.utils.randomID()), name: String(p?.name ?? "").trim() };
        for (const f of this.PROFILE_FIELDS) {
          const v = String(p?.[f] ?? "").trim();
          if (v) out[f] = v;
        }
        out.options = (Array.isArray(p?.options) ? p.options : []).map(cleanOption).filter(Boolean);
        const pv = (Array.isArray(p?.preview) ? p.preview : []).map(cleanPreviewLine).filter(Boolean);
        if (pv.length) out.preview = pv;
        return out;
      }).filter(p => p.name)
    };
  }

  /**
   * Réglages EFFECTIFS d'une étape « Attaquer » : son profil, puis ce
   * que l'arme précise elle-même (une case remplie sur l'arme gagne).
   * Options : celles du profil, plus celles de l'arme (même clé =
   * l'arme gagne).
   */
  static effective(st) {
    const name = String(st?.profile ?? "").trim().toLowerCase();
    const prof = name ? this.getConfig().profiles.find(p => p.name.toLowerCase() === name) : null;
    const eff = { ...st };
    for (const f of this.PROFILE_FIELDS) {
      if (!String(st?.[f] ?? "").trim() && prof?.[f]) eff[f] = prof[f];
    }
    const own = (Array.isArray(st?.options) ? st.options : []).map(cleanOption).filter(Boolean);
    eff.options = [...(prof?.options ?? []).filter(o => !own.some(w => w.key === o.key)), ...own];
    /* Aperçu de la fenêtre de jet : celui de l'arme s'il existe, sinon
       celui du profil. */
    const ownPv = (Array.isArray(st?.preview) ? st.preview : []).map(cleanPreviewLine).filter(Boolean);
    eff.preview = ownPv.length ? ownPv : (prof?.preview ?? []);
    return { eff, profile: prof, missing: !!name && !prof };
  }

  static async setConfig(cfg) {
    await game.settings.set(SYSTEM_ID, "combat", this.normalize(cfg));
  }

  static init() {
    Hooks.on("renderChatMessageHTML", (message, html) => {
      try { this.#wire(message, html); }
      catch (err) { console.warn("SBE | Combat : câblage de la carte en échec", err); }
    });
    /* Recul demandé par un joueur : le MJ principal déplace le jeton. */
    /* « Appliquer les dégâts » : chez le MJ principal, une fois par carte
       (deux MJ, ou un double clic, n'appliquent pas deux fois). */
    onCardAnswer("attack", (message) => UndoManager.record({ label: L("SBE.Undo.ApplyDamage"), msgId: message.id }, () => this.#applyCard(message)));
    onSocketMessage(async (p) => {
      if (p?.type !== "sbeTokenPush" || !isPrimaryGM()) return;
      const tok = await fromUuid(p.token).catch(() => null);
      if (tok) await tok.update({ x: p.x, y: p.y }).catch(err => console.warn("SBE | Recul en échec", err));
    });
  }

  /* ============================================================ */
  /*  Recul                                                        */
  /* ============================================================ */

  /** Cases de recul demandées par l'attaque (0 = aucun). */
  static #pushOf(st, scope) {
    return Math.max(0, Math.floor(this.#numberOf(st.push, scope, 0)));
  }

  /** Part des dégâts gardée sur une sauvegarde réussie : « moitié »
      (par défaut) ou « aucun » — un mot, ou une clé de l'arme. */
  static #saveFactor(st, scope) {
    const t = String(this.#textOf(st.saveMode, scope) ?? "").toLowerCase();
    if (/^none$|aucun|^0$|nul|évit|evit/.test(t)) return 0;
    return 0.5;
  }

  /** La sauvegarde d'une cible, en clair (zone et cible seule). */
  static #saveHtml(r, st) {
    if (r.save?.skipped) return `<span class="sbe-zone-save is-ko"><i class="fa-solid fa-shield-slash"></i> ${esc(r.save.why)}</span>`;
    if (!r.save) return "";
    const tpl = r.actor?.system?.template?.system?.elements ?? [];
    const el = Number.isFinite(r.save.vs) ? null : [...walkElements(tpl)].find(e => e?.key === st.save);
    const label = Number.isFinite(r.save.vs) ? L("SBE.Zone.SaveDefense", { vs: r.save.vs })
      : (el?.label || st.save || L("SBE.Zone.Save"));
    const effect = r.save.ok ? L(r.save.factor === 0 ? "SBE.Zone.SaveNoDmg" : "SBE.Zone.SaveHalf") : "";
    return `<span class="sbe-zone-save ${r.save.ok ? "is-ok" : "is-ko"}"><i class="fa-solid ${r.save.ok ? "fa-shield-halved" : "fa-shield"}"></i> ${esc(L(r.save.ok ? "SBE.Zone.SaveOk" : "SBE.Zone.SaveKo", { label, total: r.save.total }))}${effect ? ` <small>${esc(effect)}</small>` : ""}</span>`;
  }

  /** Ce que fait une sauvegarde réussie au recul : 0, 0.5 ou 1. */
  static #pushSaveFactor(st, scope) {
    const t = String(this.#textOf(st.pushSave, scope) ?? "").toLowerCase();
    if (/moiti|half|demi|0[.,]5/.test(t)) return 0.5;
    if (/compl|full|tout|plein|^1$/.test(t)) return 1;
    return 0;
  }

  /**
   * Repousse un jeton depuis un point, case par case, jusqu'au premier
   * mur (déplacement). @returns {number} cases réellement parcourues
   */
  static async #pushToken(token, from, cases) {
    if (!token || !from || !(cases > 0) || !canvas?.ready) return 0;
    const c = token.center;
    let dx = c.x - from.x, dy = c.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) return 0;
    dx /= len; dy /= len;
    const size = canvas.dimensions?.size || 100;
    const snap = (pt) => { try { return canvas.grid.getCenterPoint(pt); } catch (_e) { return pt; } };
    const blocked = (a, b) => {
      try { return !!CONFIG.Canvas.polygonBackends.move.testCollision(a, b, { type: "move", mode: "any" }); }
      catch (_e) { return false; }
    };
    let last = { x: c.x, y: c.y }, moved = 0;
    for (let i = 1; i <= cases; i++) {
      const next = snap({ x: c.x + dx * size * i, y: c.y + dy * size * i });
      if (next.x === last.x && next.y === last.y) continue;
      if (blocked(last, next)) break;
      last = next; moved = i;
    }
    if (!moved) return 0;
    const x = Math.round(last.x - token.w / 2), y = Math.round(last.y - token.h / 2);
    if (game.user.isGM || token.document.isOwner) await token.document.update({ x, y });
    else requestGM({ type: "sbeTokenPush", token: token.document.uuid, x, y });
    return moved;
  }

  static #pushLine(pushed) {
    const list = pushed.filter(p => p.cases > 0);
    if (!list.length) return "";
    return `<div class="sbe-atk-push">${list.map(p => `<div class="sbe-card-line"><i class="fa-solid fa-person-walking-arrow-right"></i> <b data-ref-name="${esc(Identity.refOf(p.actor))}"></b> ${esc(game.i18n.format("SBE.Combat.Pushed", { n: p.cases }))}</div>`).join("")}</div>`;
  }

  /* ============================================================ */
  /*  Outils                                                       */
  /* ============================================================ */

  /** Formule de jet : clés nues → @clé (comme les jets de champ). */
  static #rollable(formula, scope) {
    return rollableFormula(formula, scope);
  }

  /** Pour les autres modules : texte d'une formule (« Feu », « sol »…). */
  static textOf(raw, scope) { return this.#textOf(raw, scope); }

  /**
   * La zone d'une étape d'attaque (ou null : cible unique).
   * @param range portée de l'arme (longueur par défaut d'un cône, d'une ligne)
   */
  static stepZone(st, scope, range = 0) {
    return ZoneShapes.resolve(this.#textOf(st.zone, scope), {
      radius: this.#numberOf(st.zRadius, scope, 0),
      /* Cône, ligne : longueur = PORTÉE de l'arme par défaut, et jamais
         plus loin qu'elle. */
      length: range > 0 ? Math.min(this.#numberOf(st.zLength, scope, range), range) : this.#numberOf(st.zLength, scope, 0),
      angle: this.#numberOf(st.zAngle, scope, 90),
      width: this.#numberOf(st.zWidth, scope, 1)
    });
  }

  /**
   * Centre d'un pion d'après son DOCUMENT (à jour tout de suite) : pendant
   * l'animation d'un déplacement, le pion affiché est encore en chemin.
   */
  static docCenter(tok) {
    const d = tok?.document ?? tok;
    const gs = d?.parent?.grid?.size || canvas?.dimensions?.size || 100;
    return { x: (d?.x ?? 0) + (d?.width ?? 1) * gs / 2, y: (d?.y ?? 0) + (d?.height ?? 1) * gs / 2 };
  }

  /** Valeur d'une formule ; à défaut, le texte tel quel (« Feu »). */
  static #textOf(raw, scope) {
    const s = String(raw ?? "").trim();
    if (!s) return "";
    const v = evalExpression(s, scope);
    if (v === null || v === undefined || v === "" || (typeof v === "number" && !Number.isFinite(v))) return s.replace(/^["']|["']$/g, "");
    return String(v);
  }

  /** Médias de l'attaque : combien de fois rejouer le tir (rafale), et à
      quel rythme. Vide = le nombre de coups de l'étape. */
  static #shotsOf(st, scope) {
    const raw = String(st.mediaRepeat ?? "").trim() || String(st.hits ?? "").trim();
    return {
      shots: Math.max(1, Math.min(100, Math.floor(this.#numberOf(raw, scope, 1)))),
      interval: Math.max(0, Math.floor(this.#numberOf(st.mediaInterval, scope, 0)))
    };
  }

  /** Prévient l'appelant que la visée est faite (jamais bloquant). */
  static #aimed(onAim, info) {
    if (typeof onAim !== "function") return;
    try { onAim(info); } catch (err) { console.warn("SBE | Combat : suite de la visée en échec", err); }
  }

  static #numberOf(raw, scope, fallback = 0) {
    const s = String(raw ?? "").trim();
    if (!s) return fallback;
    const n = Number.isFinite(Number(s)) ? Number(s) : Number(evalExpression(s, scope));
    return Number.isFinite(n) ? n : fallback;
  }

  /** Dégâts non létaux de cette attaque : { keep, effect }, ou null. */
  static #nonLethal(st, scope) {
    const f = String(st?.nonLethalIf ?? "").trim();
    if (!f || !evalExpression(f, scope)) return null;
    return { keep: this.#numberOf(st.nonLethalKeep || "1", scope, 1), effect: String(st.nonLethalEffect ?? "").trim() };
  }

  /** Le jeton de l'attaquant sur la scène. */
  static #tokenOf(actor) {
    /* Pion non lié : le SIEN (deux pions d'un même personnage ont le même id). */
    if (actor?.isToken) return activeTokenOf(actor);
    const ctl = canvas?.tokens?.controlled?.find(t => t.actor === actor);
    return ctl ?? activeTokenOf(actor);
  }

  /** Distance en CASES entre deux jetons (scène quadrillée ou non). */
  static distanceCases(a, b) {
    if (!a || !b) return 0;
    return ZoneTargeting.distCases(a.center, b.center);
  }

  /** Cercle de portée affiché pendant le choix de la cible. */
  static #rangeRing(token, cases) {
    if (!token || !(cases > 0) || !canvas?.interface) return () => {};
    const g = new PIXI.Graphics();
    const r = cases * (canvas.dimensions?.size || 100);
    g.lineStyle(3, 0xffffff, 0.8).beginFill(0xffffff, 0.06).drawCircle(token.center.x, token.center.y, r).endFill();
    canvas.interface.addChild(g);
    return () => { try { g.destroy(); } catch (_e) { /* */ } };
  }

  /** Pour les autres modules (étape « Choisir une cible »). */
  static pickTarget(token, range) { return this.#pickTarget(token, range); }
  static tokenOf(actor) { return this.#tokenOf(actor); }

  /** Cible : jeton marqué (T), sinon clic sur un jeton. null = annulé. */
  static async #pickTarget(atkToken, range) {
    const marked = [...(game.user.targets ?? [])][0];
    if (marked) return { token: marked, point: { ...marked.center } };
    if (!canvas?.ready) return { token: null };
    ui.notifications.info(L("SBE.Combat.PickTarget"));
    const clear = this.#rangeRing(atkToken, range);
    const p = await awaitCanvasClick({ aim: true });
    clear();
    if (!p) return null;
    const hit = canvas.tokens.placeables
      .filter(t => t.visible && t.bounds?.contains(p.x, p.y) && !PropManager.isIgnored(t))
      .sort((a, b) => (b.document.sort ?? 0) - (a.document.sort ?? 0))[0];
    /* Le point cliqué compte aussi : un projectile lancé au sol (sans
       cible) retombe LÀ, pas aux pieds du lanceur. */
    return { token: hit ?? null, point: { x: p.x, y: p.y } };
  }

  /** Raté : le projectile passe À CÔTÉ de la cible et continue sa
      course (un peu plus loin, décalé d'un côté au hasard). */
  static #missPoint(atkToken, tgtToken, cellPx) {
    const t = tgtToken.center;
    const o = atkToken?.center;
    const side = Math.random() < 0.5 ? -1 : 1;
    if (!o || (o.x === t.x && o.y === t.y)) return { x: t.x + cellPx * side, y: t.y };
    const d = Math.hypot(t.x - o.x, t.y - o.y);
    const ux = (t.x - o.x) / d, uy = (t.y - o.y) / d;
    const size = Math.max(tgtToken.w ?? cellPx, tgtToken.h ?? cellPx);
    return {
      x: t.x + ux * cellPx * 1.5 - uy * (size / 2 + cellPx * 0.4) * side,
      y: t.y + uy * cellPx * 1.5 + ux * (size / 2 + cellPx * 0.4) * side
    };
  }

  /** Le champ du jet existe-t-il, avec un jet configuré ? */
  static #rollEl(item, key) {
    const el = [...walkElements(item.system?.template?.system?.elements ?? [])].find(e => e?.key === key);
    return el?.config?.roll?.on ? el : null;
  }

  /** Formule vraie ? (vide = non ; une formule fausse ou cassée = non) */
  static #truthy(formula, scope) {
    const f = String(formula ?? "").trim();
    if (!f) return false;
    try { return !!evalExpression(f, scope); } catch (_e) { return false; }
  }

  /**
   * La cible peut-elle se défendre (défense, parade, esquive, sauvegarde) ?
   * Renvoie la raison affichée, ou "" si elle se défend : attaque
   * imparable, effet qui empêche de se défendre, ou « Ignorer la défense
   * si… » (formule lue sur la fiche de la CIBLE, l'arme en secours).
   */
  static #noDefenseFor(target, st, scope, unblockable) {
    if (!target) return "";
    if (unblockable) return L("SBE.Combat.Unblockable");
    const fx = EffectManager.noDefenseOf(target);
    if (fx) return L("SBE.Combat.CantDefend", { name: fx });
    const f = String(st.ignoreDefenseIf ?? "").trim();
    if (f) {
      try { if (evalExpression(f, { ...scope, ...docScope(target) })) return L("SBE.Combat.DefenseIgnored"); }
      catch (_e) { /* formule fausse : la cible se défend */ }
    }
    return "";
  }

  /** Fenêtre « Normale / Imparable » ; null = annulé. */
  static async #askUnblockable(title) {
    const r = await foundry.applications.api.DialogV2.wait({
      window: { title: title || L("SBE.Combat.UnblockTitle"), icon: "fa-solid fa-shield-slash" },
      position: { width: 380 },
      content: `<p>${esc(L("SBE.Combat.UnblockAsk"))}</p>`,
      buttons: [
        { action: "normal", label: L("SBE.Combat.UnblockNormal"), icon: "fa-solid fa-shield-halved", default: true },
        { action: "unblock", label: L("SBE.Combat.Unblockable"), icon: "fa-solid fa-shield-slash" }
      ],
      rejectClose: false
    }).catch(() => null);
    if (r === "unblock") return true;
    if (r === "normal") return false;
    return null;
  }

  /** Jet de défense de la cible (formule lue sur SA fiche). */
  static async #defense(target, formula) {
    const f = String(formula ?? "").trim();
    if (!target || !f) return { roll: null, total: 0 };
    try {
      const tScope = docScope(target);
      const roll = await new Roll(this.#rollable(f, tScope), tScope).evaluate();
      return { roll, total: roll.total };
    } catch (err) {
      /* Un objet posé sans la clé de défense : pas de défense. */
      if (target.documentName === "Item") return { roll: null, total: 0 };
      return { error: L("SBE.Combat.BadFormula", { what: L("SBE.Steps.Atk.Defense"), msg: err.message }) };
    }
  }

  /**
   * Dégâts reçus par UNE cible : jet de dégâts × multiplicateur ×
   * part reçue (intensité, sauvegarde), moins la réduction du type.
   */
  static async #damage(target, st, scope, cfg, mult, part = 1, why = {}, loc = null) {
    const raw = loc?.roll ?? await new Roll(this.#rollable(st.damage, scope), scope).evaluate();
    const type = this.#textOf(st.dmgType, scope);
    const row = cfg.types.find(t => t.name.toLowerCase() === type.toLowerCase());
    const tScope = docScope(target);
    const red = row?.reduceKey ? (Number(tScope[row.reduceKey]) || 0) : 0;
    /* ZONE TOUCHÉE : multiplicateur, protection en plus lue sur la cible,
       clé qui encaisse ; « partagés » : chaque zone a sa part. */
    const z = loc?.zone ?? null;
    const zMult = z ? this.#numberOf(z.mult, { ...scope, ...tScope }, 1) : 1;
    const share = loc?.share ?? 1;
    const prot = z?.protKey ? (Number(tScope[z.protKey]) || 0) : 0;
    const w = { ...why, ...(z ? { loc: zMult, share } : {}) };
    const gross = Math.round(raw.total * mult * part * zMult * share);
    return { roll: raw, type, mult, part, gross, red, redKey: row?.reduceKey || "", why: w,
      zone: z ? z.name : "", prot, protKey: z?.protKey || "", key: z?.dmgKey || "",
      final: Math.max(0, gross - red - prot) };
  }

  /* ------------------------------------------------------------ */
  /*  Relancer les dégâts (depuis la carte)                        */
  /* ------------------------------------------------------------ */

  /** Les actions « Relancer les dégâts » du champ à jet de l'arme. */
  static #dmgAfterOf(item, st) {
    return afterFor(cleanAfter(this.#rollEl(item, String(st?.key))?.config?.roll?.after), "damage");
  }

  /**
   * Un GROUPE de dégâts : un jet de dégâts d'une cible (une ligne, ou
   * une par zone touchée quand ils se partagent le même jet), et de quoi
   * le rejouer depuis la carte.
   */
  static #dmgGroup(target, rows, { mult, part, why, share = 1, hitLine = "" }) {
    const d0 = rows[0]?.dmg;
    if (!d0) return null;
    return { target: target.uuid, rids: rows.map(r => r.rid), roll: d0.roll.toJSON(),
      zones: rows.map(r => r.zoneObj ?? null), mult, part, why, share, hitLine, st: freshState() };
  }

  /** Les boutons (et ce qui a été fait) d'un groupe de dégâts. */
  static async #dmgAfterHtml(after, item, gid, g) {
    if (!after || !g) return "";
    const inner = await afterCardHtml(after, item, Roll.fromData(g.roll), g.st, { diceHtml: (r) => ChatCards.diceHtml(r), buttons: true });
    return `<div class="sbe-dmg-after" data-dmg-gid="${esc(gid)}">${inner}</div>`;
  }

  /** La part des dégâts dans une ligne de zone (rejouée par une relance). */
  static #dmgSpan(d, rid) {
    return `<span class="sbe-zone-dmg" data-dmg-row="${rid}"><i class="fa-solid fa-burst"></i> <b>${d.taken ?? d.final}</b>${d.type ? ` <small>${esc(d.type)}</small>` : ""}</span>`;
  }

  /**
   * « Relancer les dégâts » cliqué sur une carte d'attaque : le jet de
   * dégâts du groupe est rejoué, les lignes et l'application corrigées
   * (le MJ applique l'écart ; un joueur laisse l'application au MJ).
   */
  static async #rerollDamage(message, gid, actionId) {
    const da = foundry.utils.deepClone(message.getFlag(SYSTEM_ID, "dmgAfter") ?? null);
    const g = da?.groups?.[gid];
    if (!g) return;
    const item = await fromUuid(da.item).catch(() => null);
    const target = await fromUuid(g.target).catch(() => null);
    if (!item || !target) { ui.notifications.warn(L("SBE.After.Gone")); return; }
    const after = this.#dmgAfterOf(item, da.st);
    if (!after) return;
    const cfg = this.getConfig();
    const st = da.st;
    const scope = { ...docScope(item), ...(da.optVals ?? {}) };
    const c = afterChoices(after, item, g.st, null).find(x => x.a.id === actionId && x.ok);
    if (!c) return;
    const roll = await afterPlay(after, c, item, Roll.fromData(g.roll), g.st,
      { formula: this.#rollable(st.damage, scope), scope, better: (a, b) => a.total > b.total });
    g.roll = roll.toJSON();
    const att = foundry.utils.deepClone(message.getFlag(SYSTEM_ID, "attack") ?? { list: [], key: cfg.damageKey });
    att.list ??= [];
    const tpl = document.createElement("template");
    tpl.innerHTML = String(message.content);
    let pending = !!att.pending;
    for (const [k, rid] of g.rids.entries()) {
      const zone = g.zones[k] ?? null;
      const dmg = await this.#damage(target, st, scope, cfg, g.mult, g.part, g.why, { zone, share: g.share, roll });
      /* L'application : l'ancienne ligne, corrigée. */
      const i = att.list.findIndex(e => e.rid === rid && !e.undo);
      const old = i >= 0 ? att.list[i] : null;
      const f = Number(old?.f) || 0;
      const key = dmg.key || "";
      const next = { target: target.uuid, amount: dmg.final, gross: dmg.gross, red: dmg.red + (dmg.prot || 0), redKey: dmg.redKey, rid, f,
        ...(key ? { key } : {}), ...(dmg.protKey ? { protKey: dmg.protKey } : {}), ...(old?.touched ? { touched: true } : {}),
        ...(old?.nl ? { nl: old.nl } : {}) };
      if (key || att.key) {
        /* Déjà appliquée (ou attaque déjà appliquée pour une ligne nouvelle) :
           le MJ applique l'écart ; un joueur la fait défaire par le MJ.
           Pas encore appliquée : seul le montant en attente change. */
        const live = f || (!old && att.applied);
        if (live && game.user.isGM) {
          const ff = f || 1;
          next.f = ff;
          await this.#shift(target, key || att.key, this.#fixValue(next, ff) - (old ? this.#fixValue(old, f) : 0), this.#byOf(message), next.nl ?? null);
        } else if (live) {
          if (f) att.list.push({ target: target.uuid, key, undo: this.#fixValue(old, f), amount: 0, gross: 0, red: 0, f: 0 });
          next.f = 0;
          pending = true;
        } else if (!old) pending = true;
        if (i >= 0) att.list[i] = next; else att.list.push(next);
      }
      /* La carte : le bloc (cible seule) ou la ligne (zone). */
      const block = tpl.content.querySelector(`.sbe-atk-dmg[data-dmg-row="${rid}"]`);
      if (block) block.outerHTML = await this.#damageBlock(dmg, target, g.hitLine, rid);
      const span = tpl.content.querySelector(`.sbe-zone-dmg[data-dmg-row="${rid}"]`);
      if (span) span.outerHTML = this.#dmgSpan(dmg, rid);
      const calc = tpl.content.querySelector(`.sbe-zone-row .sbe-atk-calc[data-dmg-row="${rid}"]`);
      if (calc) calc.outerHTML = this.#calcHtml(dmg, target, "", rid);
    }
    const box = tpl.content.querySelector(`[data-dmg-gid="${CSS.escape(gid)}"]`);
    if (box) box.outerHTML = await this.#dmgAfterHtml(after, item, gid, g);
    /* Quelque chose attend le MJ : le bouton « Appliquer » revient. */
    const done = tpl.content.querySelector(".sbe-atk-applied");
    if (pending && done) done.outerHTML = this.#applyHtml({ pending: true });
    else if (pending && !tpl.content.querySelector(".sbe-atk-apply")) tpl.content.querySelector(".sbe-card-body")?.insertAdjacentHTML("beforeend", this.#applyHtml({ pending: true }));
    att.pending = pending;
    /* Cible seule : l'attaque relancée plus tard garde CES dégâts. */
    const upd = { content: tpl.innerHTML, [`flags.${SYSTEM_ID}.dmgAfter`]: da, [`flags.${SYSTEM_ID}.attack`]: att };
    if (message.getFlag(SYSTEM_ID, "atkAfter") && gid === "0") upd[`flags.${SYSTEM_ID}.atkAfter.dmgRoll`] = g.roll;
    await message.update(upd);
  }

  /* ============================================================ */
  /*  Localisation des coups                                       */
  /* ============================================================ */

  /** La localisation est-elle active pour cette attaque ? */
  static #locOn(st) { return !!st.loc && st.loc !== "none"; }

  /**
   * La zone touchée sur une cible (hors coup visé).
   * @param atk  le jet d'attaque (source « lue sur le jet d'attaque »)
   */
  static async #locate(body, st, scope, atk = null) {
    if (body.odds === "area") return HitLocations.pick(body, 0);
    const f = String(st.locFormula ?? "").trim();
    let value = null;
    try {
      if (st.loc === "attack" && atk?.roll) {
        const natural = (atk.roll.dice ?? []).reduce((t, d) => t + (Number(d.total) || 0), 0);
        value = Number(evalExpression(f || "natural", { ...scope, natural, rollTotal: atk.total }));
      } else if (f) {
        value = (await new Roll(this.#rollable(f, scope), scope).evaluate()).total;
      }
    } catch (err) {
      console.warn("SBE | Localisation : formule illisible", f, err);
    }
    /* Sans formule (ou attaque sans jet) : un tirage sur les plages du corps. */
    if (!Number.isFinite(value)) value = HitLocations.draw(body);
    return HitLocations.pick(body, value);
  }

  /** Fenêtre « Viser une zone » : la silhouette de la cible.
      @returns zone | "none" (sans visée) | null (annulé) */
  static async #askAim(body, title) {
    let chosen = null;
    const items = body.zones.map(z => `<button type="button" class="sbe-loc-aimbtn" data-zone="${esc(z.id)}">${esc(z.name)}${String(z.aim ?? "").trim() ? ` <small>(${esc(z.aim)})</small>` : ""}</button>`).join("");
    const r = await foundry.applications.api.DialogV2.wait({
      window: { title: title || L("SBE.Loc.AimTitle"), icon: "fa-solid fa-crosshairs" },
      classes: ["sbe-loc-aim"],
      position: { width: 420 },
      content: `<p class="sbe-loc-aimp">${esc(L("SBE.Loc.AimAsk"))}</p>
        <div class="sbe-loc-aimbox">${HitLocations.svg(body, { pick: true })}<div class="sbe-loc-aimlist">${items}</div></div>`,
      buttons: [{ action: "none", label: L("SBE.Loc.NoAim"), icon: "fa-solid fa-dice", default: true }],
      render: (_ev, dialog) => {
        const root = dialog.element;
        const pickZone = (id) => { chosen = body.zones.find(z => z.id === id) ?? null; if (chosen) dialog.close(); };
        root.querySelector(".sbe-loc-aimbox")?.addEventListener("click", (ev) => {
          const el = ev.target.closest("[data-zone]");
          if (el) pickZone(el.dataset.zone);
        });
        root.querySelector(".sbe-loc-aimbox")?.addEventListener("pointerover", (ev) => {
          const id = ev.target.closest("[data-zone]")?.dataset.zone ?? null;
          for (const el of root.querySelectorAll("[data-zone]")) el.classList.toggle("is-on", el.dataset.zone === id);
        });
      },
      rejectClose: false
    }).catch(() => null);
    if (chosen) return chosen;
    return r === "none" ? "none" : null;
  }

  /** La ligne « Touché : Tête » de la carte, avec la silhouette. */
  static #locHtml(body, zone, aimed) {
    if (!zone) return "";
    return `<div class="sbe-loc-hit">${body ? HitLocations.svg(body, { on: zone.id, cls: "is-mini" }) : ""}
      <span><i class="fa-solid fa-location-crosshairs"></i> ${esc(L("SBE.Loc.HitOn", { zone: zone.name }))}${aimed ? ` <small>(${esc(L("SBE.Loc.Aimed"))})</small>` : ""}</span></div>`;
  }

  /* ============================================================ */
  /*  L'attaque                                                    */
  /* ============================================================ */

  /**
   * Étape « Attaquer » d'un bouton d'objet.
   * @param {object} [hooks]
   * @param {Function} [hooks.onAim]  appelé DÈS que la cible (ou la zone) est
   *   choisie, avant défense, jets et dégâts : { targets, point, shots,
   *   interval } — le média du tir part au moment du clic.
   * @returns {Promise<{outcome:string}|{error:string}|null>} null = annulé
   */
  static async attack(item, stepIn, vars = {}, { onAim = null } = {}) {
    const cfg = this.getConfig();
    const { eff: st, missing } = this.effective(stepIn);
    if (missing) return { error: L("SBE.Combat.ProfileMissing", { name: stepIn.profile }) };
    const actor = carrierOf(item);
    /* Un objet POSÉ tire depuis son pion (portée, ligne de tir, départ
       d'une zone) ; le personnage qui l'utilise donne le jet. */
    const placed = PropManager.placedTokenOf(item);
    const atkToken = placed?.object ?? (actor ? this.#tokenOf(actor) : null);
    const el = this.#rollEl(item, String(st.key ?? ""));
    if (!el) return { error: L("SBE.Steps.NoRoll", { key: st.key ?? "" }) };
    const title = el.config.roll.label || el.label || "";
    const zoneOf = (sc, range) => this.stepZone(st, sc, range);

    /* Cible imposée (piège déclenché : le personnage qui est entré) :
       ni question, ni fenêtre, ni visée ; les options gardent leur défaut.
       `_autoAt` : « trap » = la zone part du piège (son pion), sinon de la cible. */
    const auto = vars?._autoTarget ? canvas?.tokens?.get(vars._autoTarget) ?? null : null;
    const autoAt = auto && vars?._autoAt === "trap" ? "trap" : "target";

    /* Imparable ? Demandé AVANT tout (la visée part dès le clic). */
    let unblockable = st.unblockable === "always";
    if (st.unblockable === "ask" && !auto) {
      const r = await this.#askUnblockable(title);
      if (r === null) return null;
      unblockable = r;
    }

    /* 0. LA FENÊTRE D'ABORD (avantage, modificateur, options), puis on
       vise — les options changent la zone, la défense, les dégâts.
       Une zone qui part du tireur n'a pas de jet : options seules. */
    const pre = { ...docScope(item), ...vars, ...defaultOptionValues(st.options) };
    const z0 = zoneOf(pre, this.#numberOf(st.range, pre, 0));
    const win = auto ? { adv: 0, mod: 0, goal: null, mode: visDefaultMode(cleanVis(cfg.vis, { targets: true })), options: defaultOptionValues(st.options) }
      : await askRollWindow(item, String(st.key), st.options, {
      title, optionsOnly: z0?.shape?.anchor === "self",
      /* Le seuil d'une attaque est la défense de la cible. */
      noGoal: true,
      /* Lignes d'aperçu : recalculées avec les options en cours. */
      preview: st.preview, scope: { ...docScope(item), ...vars },
      /* Visibilité des messages d'attaque : celle des règles de combat. */
      vis: cleanVis(cfg.vis, { targets: true })
    });
    if (!win) return null;
    const optVals = win.options ?? {};
    const scope = { ...docScope(item), ...vars, ...optVals };
    const range = this.#numberOf(st.range, scope, 0);
    const zone = zoneOf(scope, range);
    if (zone?.unknown) return { error: L("SBE.Zone.Unknown", { name: zone.unknown }) };
    if (zone?.missing) return { error: L(`SBE.Zone.Missing_${zone.missing}`) };
    const ctx = { item, st, cfg, actor, scope, atkToken, range, title, win, unblockable, optVals, auto, autoAt, onAim };
    if (zone) return this.#zoneAttack({ ...ctx, shape: zone.shape });

    /* --- CIBLE UNIQUE --- */
    /* 1. Cible + portée (avant tout jet : annuler ne coûte rien). */
    let pick;
    if (auto) pick = { token: auto, point: this.docCenter(auto) };
    else {
      const clearArc = PropManager.drawArc(item, range);
      pick = await this.#pickTarget(atkToken, range);
      clearArc();
    }
    if (!pick) return null;
    const tgtToken = pick.token;
    /* Angle de tir d'un objet posé : la cible (ou le point visé) doit y être. */
    if (!PropManager.inArc(item, tgtToken?.center ?? pick.point)) return { error: L("SBE.Prop.OutOfArc") };
    /* Un objet posé attaquable : la cible est l'objet (ses clés). */
    const target = tgtToken ? PropManager.targetDocOf(tgtToken) : null;
    if (target && target === actor) return { error: L("SBE.Combat.SelfTarget") };
    /* Lancé au sol : la portée compte aussi. */
    if (!tgtToken && pick.point && range > 0 && atkToken) {
      const cellPx0 = canvas?.dimensions?.size || 100;
      const d = Math.hypot(pick.point.x - atkToken.center.x, pick.point.y - atkToken.center.y) / cellPx0;
      if (d > range + 0.5) return { error: L("SBE.Combat.OutOfRange", { d: Math.round(d * 10) / 10, r: range }) };
    }
    if (target && range > 0 && atkToken) {
      const d = this.distanceCases(atkToken, tgtToken);
      if (d > range + 1e-6) return { error: L("SBE.Combat.OutOfRange", { d: Math.round(d * 10) / 10, r: range }) };
    }

    /* LOCALISATION : le corps de la cible ; le coup visé se choisit ici
       (la cible n'est connue qu'après la visée), son malus va au jet. */
    const locBody = target && this.#locOn(st) ? HitLocations.bodyOf(target) : null;
    let aimZone = null;
    if (locBody && st.locAim === "yes" && !auto) {
      const a = await this.#askAim(locBody, title);
      if (a === null) return null;
      if (a !== "none") aimZone = a;
    }
    const aimBonus = aimZone ? [{ label: L("SBE.Loc.AimBonus", { zone: aimZone.name }), val: this.#numberOf(aimZone.aim, scope, 0) }] : [];
    /* Le tir part : son média, sans attendre défense, jets et dégâts. */
    this.#aimed(onAim, { targets: target ? [target] : [],
      point: tgtToken ? { ...tgtToken.center } : (pick.point ? { ...pick.point } : null), ...this.#shotsOf(st, scope) });

    /* 2. Défense de la cible : son total devient la difficulté —
       sauf « Ignorer la défense si… » (cible étourdie…). */
    /* « Touche toujours si… » (formule lue sur l'objet) : ni défense ni jet. */
    const sure = this.#truthy(st.sureHitIf, scope);
    const noDef = target && !sure ? this.#noDefenseFor(target, st, scope, unblockable) : "";
    const def = sure ? { roll: null, total: 0 }
      : noDef ? { roll: null, total: 0, ignored: true, why: noDef } : await this.#defense(target, st.defense);
    if (def.error) return { error: def.error };

    /* 3. Jet d'attaque (égalité = touché, critiques sur le dé). Relances
       et bonus : sur la carte quand l'attaque finit le bouton (dernière
       étape), sinon tout de suite, avant les dégâts. */
    const onCard = !!vars?._afterCard && !auto && !sure;
    /* La défense REMPLACE la cible du jet (goal) : l'ajouter à la cible du champ (difficulty)
       obligeait l'attaque à dépasser « cible du champ + défense », et tout ratait. */
    const atk = sure ? null : await rollField(item, String(st.key), { post: false, preset: win, goal: def.total, bonuses: aimBonus,
      after: auto || onCard ? "none" : "now" });
    if (!sure && !atk) return null;
    const dmgAfter = auto ? null : this.#dmgAfterOf(item, st);
    const ctx1 = { item, st, cfg, actor, scope, target, tgtToken, atkToken, def, sure, locBody, aimZone, dmgAfter };
    const res = await this.#single(ctx1, atk);
    if (res.error) return res;
    const { hit, hitZone } = res;
    /* Recul : la cible touchée part dans l'axe du tireur. */
    const pushN = this.#pushOf(st, scope);
    if (target && hit && pushN > 0 && tgtToken && atkToken && !PropManager.isPropToken(tgtToken)) {
      res.body += this.#pushLine([{ actor: target, cases: await this.#pushToken(tgtToken, atkToken.center, pushN) }]);
    }
    /* Relance depuis la carte : les boutons, et de quoi tout rejouer. */
    const after = onCard ? afterFor(cleanAfter(this.#rollEl(item, String(st.key))?.config?.roll?.after), "roll") : null;
    let atkAfter = null;
    if (after && atk.resumeData) {
      res.sides[0].after = ChatCards.modsHtml(atk.mods?.rows ?? [], atk.mods ?? {}) + await afterCardHtml(after, item, atk.roll, atk.resumeData.st, { diceHtml: (r) => ChatCards.diceHtml(r), buttons: true });
      atkAfter = { item: item.uuid, st: foundry.utils.deepClone(st), win, title, optVals, target: target?.uuid ?? "", token: tgtToken?.document?.uuid ?? "",
        def: { total: def.total, ignored: !!def.ignored, why: def.why ?? "", roll: def.roll?.toJSON?.() ?? null },
        locBody: locBody?.id ?? "", aimZone: aimZone?.id ?? "", hitZone: hitZone?.id ?? "", dmgRoll: res.dmgRoll?.toJSON?.() ?? null,
        atk: atk.resumeData };
    }
    await this.#post({ item, actor, title, sides: res.sides, body: res.body + res.tail, outcome: res.outcome, detail: res.detail,
      messageMode: atk?.messageMode ?? win?.mode, apply: res.apply, optVals, st, targets: target ? [target] : [], atkAfter,
      dmgAfter: dmgAfter && Object.keys(res.groups).length ? { item: item.uuid, st: foundry.utils.deepClone(st), optVals, groups: res.groups } : null });
    /* Où le projectile est retombé : sur la cible, sinon à côté d'elle. */
    const cellPx = canvas?.dimensions?.size || 100;
    const point = tgtToken ? (hit ? { ...tgtToken.center } : this.#missPoint(atkToken, tgtToken, cellPx))
      : (pick.point ? { ...pick.point } : (atkToken ? { ...atkToken.center } : null));
    return { outcome: sure ? "success" : atk.outcome, vars: { ...optVals, hitZone: hitZone ? zoneSlug(hitZone.name) : "" }, total: atk?.total,
      targets: hit && target ? [target] : [], hit: !!(hit && target), point,
      ...this.#shotsOf(st, scope) };
  }

  /**
   * CIBLE UNIQUE, après le jet : touché ou non, zone touchée, dégâts,
   * application, et le contenu de la carte. Rejoué à l'identique par
   * une relance depuis la carte (même défense, même zone si elle
   * était déjà touchée, même jet de dégâts).
   * @param keep { zone, dmgRoll }  ce qui est gardé d'avant (relance)
   * @param reapply { list, applied }  l'application d'avant (relance) :
   *        le MJ la défait puis applique la nouvelle ; un joueur la laisse
   *        au MJ (bouton « Appliquer », qui défait aussi l'ancienne).
   */
  static async #single({ item, st, cfg, actor, scope, target, def, sure, locBody, aimZone, dmgAfter = null }, atk, { keep = null, reapply = null } = {}) {
    /* Avec une cible, c'est le total contre la défense qui décide (égalité = touché) ;
       un critique du dé l'emporte. Sans cible, l'issue du jet suffit. */
    const hit = sure ? !!target
      : target ? (atk.outcome === "critSuccess" || (atk.outcome !== "critFailure" && atk.total >= def.total))
        : (HIT.has(atk.outcome) || atk.outcome === "done");
    const crit = !sure && atk.outcome === "critSuccess";
    /* Zone touchée, puis dégâts. */
    const hitZone = hit && locBody ? (aimZone ?? keep?.zone ?? await this.#locate(locBody, st, scope, atk)) : null;
    const rows = [];
    if (target && hit && String(st.damage ?? "").trim()) {
      try {
        const why = { crit: crit ? cfg.critMult : 1, hits: Math.max(1, this.#numberOf(st.hits, scope, 1)) };
        rows.push({ actor: target, rid: 0, gid: "0", zoneObj: hitZone, why, dmg: await this.#damage(target, st, scope, cfg, why.crit * why.hits, 1, why,
          { zone: hitZone, roll: keep?.dmgRoll ?? null }) });
      } catch (err) {
        return { error: L("SBE.Combat.BadFormula", { what: L("SBE.Steps.Atk.Damage"), msg: err.message }) };
      }
    }
    if (reapply && game.user.isGM) {
      /* Le MJ défait d'abord ce qui avait été appliqué. */
      for (const e of reapply.list ?? []) {
        const f = Number(e.f) || 0;
        if (!f || e.undo) continue;
        const t = await fromUuid(e.target).catch(() => null);
        if (t) await this.#shift(t, e.key || cfg.damageKey, -this.#fixValue(e, f));
      }
    }
    const apply = await this.#applyAll(rows, cfg, actor?.uuid, this.#nonLethal(st, scope));
    if (reapply && !game.user.isGM) {
      /* Joueur : l'ancienne application, s'il y en avait une, sera défaite par le MJ. */
      const undo = (reapply.list ?? []).filter(e => Number(e.f) && !e.undo)
        .map(e => ({ target: e.target, key: e.key, undo: this.#fixValue(e, Number(e.f)), amount: 0, gross: 0, red: 0, f: 0 }));
      if (undo.length) { apply.list = [...apply.list, ...undo]; apply.pending = true; apply.applied = false; apply.key ||= cfg.damageKey; }
    }
    const sides = [this.#attackerSide(item, actor, atk, hit && !!target)];
    if (target) sides.push({ ref: Identity.refOf(target), role: "defender", cls: hit ? "" : "is-winner",
      rolls: def.roll ? [def.roll] : [],
      body: def.ignored ? `<div class="sbe-atk-note"><i class="fa-solid fa-shield-slash"></i> ${esc(def.why)}</div>` : "" });
    let body = target ? this.#locHtml(locBody, hitZone, !!aimZone) : `<div class="sbe-card-line sbe-atk-note"><i class="fa-solid fa-crosshairs"></i> ${esc(L("SBE.Combat.NoTarget"))}</div>`;
    const hitLine = sure ? L("SBE.Combat.SureHit") : L(def.ignored ? "SBE.Combat.CalcHitIgnored" : "SBE.Combat.CalcHit", { atk: atk.total, def: def.total });
    const groups = {};
    if (rows[0]) {
      body += await this.#damageBlock(rows[0].dmg, rows[0].actor, hitLine, 0);
      /* Les dégâts se relancent depuis la carte. */
      groups["0"] = this.#dmgGroup(target, rows, { mult: rows[0].dmg.mult, part: 1, why: rows[0].why, hitLine });
      body += await this.#dmgAfterHtml(dmgAfter, item, "0", groups["0"]);
    }
    const tail = this.#applyHtml(apply);
    const outcome = sure ? (target ? "success" : "")
      : !target ? (atk.cardOutcome || "")
        : crit ? "critSuccess" : atk.outcome === "critFailure" ? "critFailure" : hit ? "success" : "failure";
    const detail = sure ? "" : target ? `(${atk.total} ${hit ? "≥" : "<"} ${def.total})` : (atk.detail || "");
    return { hit, crit, hitZone, rows, apply, sides, body, tail, outcome, detail, groups, dmgRoll: rows[0]?.dmg?.roll ?? keep?.dmgRoll ?? null };
  }

  /** Relance (ou bonus) cliquée sur une carte d'attaque : le jet est
      repris, le reste rejoué, la même carte réécrite. */
  static async #rerollAttack(message, actionId) {
    const d = message.getFlag(SYSTEM_ID, "atkAfter");
    const old = message.getFlag(SYSTEM_ID, "attack") ?? {};
    if (!d) return;
    const item = await fromUuid(d.item).catch(() => null);
    if (!item) { ui.notifications.warn(L("SBE.After.Gone")); return; }
    const cfg = this.getConfig();
    const st = d.st;
    const actor = carrierOf(item);
    const scope = { ...docScope(item), ...(d.optVals ?? {}) };
    const target = d.target ? await fromUuid(d.target).catch(() => null) : null;
    const locBody = d.locBody ? HitLocations.list().find(b => b.id === d.locBody) ?? null : null;
    const aimZone = locBody?.zones.find(z => z.id === d.aimZone) ?? null;
    const aimBonus = aimZone ? [{ label: L("SBE.Loc.AimBonus", { zone: aimZone.name }), val: this.#numberOf(aimZone.aim, scope, 0) }] : [];
    const def = { total: d.def.total, ignored: d.def.ignored, why: d.def.why, roll: d.def.roll ? Roll.fromData(d.def.roll) : null };
    const atk = await rollField(item, String(st.key), { post: false, preset: d.win, goal: def.total, bonuses: aimBonus,
      resume: { ...d.atk, action: actionId } });
    if (!atk) return;
    const keep = { zone: locBody?.zones.find(z => z.id === d.hitZone) ?? null, dmgRoll: d.dmgRoll ? Roll.fromData(d.dmgRoll) : null };
    const dmgAfter = this.#dmgAfterOf(item, st);
    const res = await this.#single({ item, st, cfg, actor, scope, target, def, sure: false, locBody, aimZone, dmgAfter }, atk,
      { keep, reapply: { list: old.list ?? [], applied: !!old.applied } });
    if (res.error) { ui.notifications.error(res.error); return; }
    const after = afterFor(cleanAfter(this.#rollEl(item, String(st.key))?.config?.roll?.after), "roll");
    if (after) res.sides[0].after = ChatCards.modsHtml(atk.mods?.rows ?? [], atk.mods ?? {}) + await afterCardHtml(after, item, atk.roll, atk.resumeData.st, { diceHtml: (r) => ChatCards.diceHtml(r), buttons: true });
    const next = { ...d, hitZone: res.hitZone?.id ?? d.hitZone, dmgRoll: res.dmgRoll?.toJSON?.() ?? d.dmgRoll, atk: atk.resumeData };
    const { content } = await ChatCards.build(this.#cardOf({ item, title: d.title, sides: res.sides, body: res.body + res.tail,
      outcome: res.outcome, detail: res.detail, optVals: d.optVals ?? {}, st }));
    await message.update({ content,
      [`flags.${SYSTEM_ID}.attack`]: { list: res.apply.list, key: res.apply.key, applied: res.apply.applied, pending: res.apply.pending },
      [`flags.${SYSTEM_ID}.atkAfter`]: next, [`flags.${SYSTEM_ID}.outcome`]: res.outcome || null,
      [`flags.${SYSTEM_ID}.dmgAfter`]: dmgAfter && Object.keys(res.groups).length ? { item: item.uuid, st: foundry.utils.deepClone(st), optVals: d.optVals ?? {}, groups: res.groups } : null });
  }

  /* ------------------------------------------------------------ */
  /*  Zone                                                         */
  /* ------------------------------------------------------------ */

  static async #zoneAttack({ item, st, cfg, actor, scope, atkToken, range, title, shape, win, unblockable, optVals, auto = null, autoAt = "target", onAim = null }) {
    if (!canvas?.ready) return { error: L("SBE.Zone.NoScene") };
    const scale = this.#numberOf(st.zScale, scope, 1);
    const threshold = shape.cover ?? cfg.cover;
    const walls = shape.walls || cfg.walls;
    const measure = cfg.measure;
    const self = shape.anchor === "self";

    /* 1. Visée (annuler ne coûte rien). */
    let aim;
    if (auto && autoAt === "trap" && atkToken) {
      /* Piège fixe (mine…) : la zone est centrée sur lui. */
      const c = this.docCenter(atkToken);
      aim = { origin: { ...c }, angle: 0, point: { ...c }, token: null };
    } else if (auto) aim = ZoneTargeting.autoAim({ shape, attacker: atkToken, target: auto, at: this.docCenter(auto) });
    else {
      const clearArc = PropManager.drawArc(item, range);
      aim = await ZoneTargeting.aim({ shape, scale, attacker: atkToken, range, threshold, measure, walls });
      clearArc();
    }
    if (!aim) return null;
    if (!PropManager.inArc(item, aim.point)) return { error: L("SBE.Prop.OutOfArc") };
    /* Le tir part : son média, sans attendre jets et dégâts. */
    this.#aimed(onAim, { targets: aim.token ? [PropManager.targetDocOf(aim.token)].filter(Boolean) : [],
      point: aim.point ? { ...aim.point } : null, ...this.#shotsOf(st, scope) });

    /* 2. Jet : sur un jeton visé (contre sa défense), ou au sol (DD). */
    let origin = aim.origin;
    let atk = null, def = { roll: null, total: 0 }, aimed = null, note = "", crit = false;
    const cell = ZoneTargeting.cellSize();
    /* « Touche toujours si… » : pas de jet, la zone tombe où elle est visée. */
    const sure = this.#truthy(st.sureHitIf, scope);
    if (sure && !self) note = L("SBE.Combat.SureHit");
    if (!self && !sure) {
      const dist = atkToken ? ZoneTargeting.distCases(atkToken.center, aim.point) : 0;
      const aimDoc = aim.token ? PropManager.targetDocOf(aim.token) : null;
      const aimedActor = aimDoc && aimDoc !== actor ? aimDoc : null;
      let goal = null;
      if (aimedActor) {
        aimed = aimedActor;
        const noDef = this.#noDefenseFor(aimedActor, st, scope, unblockable);
        def = noDef ? { roll: null, total: 0, ignored: true, why: noDef } : await this.#defense(aimedActor, st.defense);
        if (def.error) return { error: def.error };
        goal = def.total;
      } else if (cfg.ground.on) {
        goal = groundDD(cfg.ground.base, cfg.ground.byRange, dist, range);
      }
      if (goal !== null) {
        atk = await rollField(item, String(st.key), { post: false, preset: win, goal, after: auto ? "none" : "now" });
        if (!atk) return null;
        const ok = atk.outcome === "critSuccess" || (atk.outcome !== "critFailure" && atk.total >= goal);
        crit = atk.outcome === "critSuccess";
        if (ok) {
          if (aimed) origin = { ...aim.token.center };
          note = aimed ? L("SBE.Zone.AimHit", { total: atk.total, goal }) : L("SBE.Zone.GroundHit", { total: atk.total, goal });
          if (aimed && def.ignored) note += ` — ${def.why}`;
        } else {
          const sc = scatter(origin, cfg.scatter.min, cfg.scatter.max, dist, range, cell);
          origin = { x: sc.x, y: sc.y };
          note = L(aimed ? "SBE.Zone.AimMiss" : "SBE.Zone.GroundMiss", { total: atk.total, goal, cases: sc.cases });
        }
      }
    }

    /* 3. Qui est touché, où la zone est retombée. */
    const placed = placeShape(shape, origin, aim.angle, cell, scale);
    ZoneTargeting.flash(placed);
    let hits = ZoneTargeting.affected(placed, { origin, threshold, measure, walls, exclude: self ? atkToken : null,
      reach: self && range > 0 && atkToken ? { center: atkToken.center, cases: range } : null });
    if (st.traverse === "ordered") {
      const lim = Math.floor(this.#numberOf(st.traverseLimit, scope, 0));
      if (lim > 0) hits = hits.slice(0, lim);
    }

    /* 4. Pour chacun : sauvegarde, dégâts × intensité. */
    const rows = [];
    const groups = {};
    const why0 = { crit: crit ? cfg.critMult : 1, hits: Math.max(1, this.#numberOf(st.hits, scope, 1)) };
    const mult = why0.crit * why0.hits;
    for (const h of hits) {
      const target = PropManager.targetDocOf(h.token);
      if (!target) continue;
      let save = null, part = Math.min(10, h.intensity / 100);
      const why = { ...why0, zone: part, save: 1 };
      /* Sauvegarde : le champ à jet de la cible, ou SA DÉFENSE contre le
         total du jet d'attaque (égalité = esquivé). */
      const vsDef = st.saveVs === "defense" && !!atk && !!String(st.defense ?? "").trim();
      const wants = vsDef || !!String(st.save ?? "").trim();
      const noSave = wants ? this.#noDefenseFor(target, st, scope, unblockable) : "";
      if (noSave) save = { skipped: true, why: noSave, ok: false };
      else if (vsDef) {
        const d = await this.#defense(target, st.defense);
        if (d.error) return { error: d.error };
        save = { roll: d.roll, total: d.total, ok: d.total >= atk.total, factor: this.#saveFactor(st, scope), vs: atk.total };
      } else if (wants) {
        const r = await rollField(target, String(st.save), { post: false });
        if (r) save = { roll: r.roll, total: r.total, ok: HIT.has(r.outcome), factor: this.#saveFactor(st, scope) };
      }
      if (save?.ok) { why.save = save.factor; part *= why.save; }
      /* LOCALISATION (réglage « Attaques de zone ») : une zone au hasard,
         tout le corps, ou plusieurs au hasard ; un seul jet de dégâts,
         entier sur chaque zone ou partagé entre elles. */
      const area = st.locArea || "each";
      const locBody = this.#locOn(st) && area !== "none" ? HitLocations.bodyOf(target) : null;
      let zones = [];
      if (locBody) {
        zones = area === "all" ? [...locBody.zones]
          : area === "some" ? HitLocations.pickMany(locBody, this.#numberOf(st.locCount, scope, 1))
            : [await this.#locate(locBody, st, scope, atk)].filter(Boolean);
      }
      const dmgs = [];
      const share = zones.length && st.locSplit === "split" ? 1 / zones.length : 1;
      if (String(st.damage ?? "").trim()) {
        try {
          if (zones.length) {
            const roll = await new Roll(this.#rollable(st.damage, scope), scope).evaluate();
            for (const z of zones) dmgs.push(await this.#damage(target, st, scope, cfg, mult, part, why, { zone: z, share, roll }));
          } else dmgs.push(await this.#damage(target, st, scope, cfg, mult, part, why));
        } catch (err) { return { error: L("SBE.Combat.BadFormula", { what: L("SBE.Steps.Atk.Damage"), msg: err.message }) }; }
      }
      /* Recul × intensité du morceau, et la sauvegarde selon le réglage. */
      let pushCases = 0;
      const pushN = this.#pushOf(st, scope);
      if (pushN > 0) {
        let f = Math.min(1, h.intensity / 100);
        if (save?.ok) f *= this.#pushSaveFactor(st, scope);
        pushCases = Math.round(pushN * f);
      }
      /* Une ligne par zone touchée (le recul, une fois par cible). */
      const lines = Math.max(1, zones.length, dmgs.length);
      const first = rows.length;
      const gid = String(Object.keys(groups).length);
      for (let k = 0; k < lines; k++) {
        rows.push({ actor: target, token: h.token, intensity: h.intensity, cover: h.cover, save, dmg: dmgs[k] ?? null,
          loc: zones[k]?.name ?? "", zoneObj: zones[k] ?? null, rid: rows.length, gid, pushCases: k ? 0 : pushCases });
      }
      /* Un seul jet de dégâts par cible : il se relance depuis la carte. */
      if (dmgs.length) groups[gid] = this.#dmgGroup(target, rows.slice(first).filter(r => r.dmg), { mult, part, why, share });
    }
    const apply = await this.#applyAll(rows, cfg, actor?.uuid, this.#nonLethal(st, scope));
    const pushed = [];
    for (const r of rows) {
      if (r.pushCases > 0 && !PropManager.isPropToken(r.token)) pushed.push({ actor: r.actor, cases: await this.#pushToken(r.token, origin, r.pushCases) });
    }

    /* 5. La carte. */
    /* Le tireur n'apparaît que s'il a un jet (le nom du message le
       dit déjà) : une ligne de zone partie de lui n'en a pas. */
    const sides = atk ? [this.#attackerSide(item, actor, atk, false)] : [];
    if (aimed) sides.push({ ref: Identity.refOf(aimed), role: "defender", rolls: def.roll ? [def.roll] : [] });
    let body = `<div class="sbe-zone-head"><i class="fa-solid fa-bullseye"></i> ${esc(shape.name || L("SBE.Zone.Zone"))}</div>`;
    if (note) body += `<div class="sbe-card-line sbe-atk-note">${esc(note)}</div>`;
    const dmgAfter = auto ? null : this.#dmgAfterOf(item, st);
    body += await this.#zoneRows(rows, st, { after: dmgAfter, item, groups });
    body += this.#pushLine(pushed);
    body += this.#applyHtml(apply);
    const outcome = atk ? (crit ? "critSuccess" : atk.outcome === "critFailure" ? "critFailure" : HIT.has(atk.outcome) ? "success" : "failure") : "";
    await this.#post({ item, actor, title, sides, body, outcome, detail: "", messageMode: atk?.messageMode ?? win?.mode, apply, optVals, st,
      targets: [...new Set([aimed, ...rows.map(r => r.actor)].filter(Boolean))],
      dmgAfter: dmgAfter && Object.keys(groups).length ? { item: item.uuid, st: foundry.utils.deepClone(st), optVals, groups } : null });
    return { outcome: atk?.outcome ?? (rows.length ? "success" : "done"), vars: optVals, total: atk?.total,
      /* Touché (sons, animations, isHit) : au moins une cible qui a RATÉ
         sa sauvegarde, ou qui n'en avait pas. Une sauvegarde réussie = raté,
         même si elle prend encore la moitié des dégâts. */
      targets: rows.map(r => r.actor).filter(Boolean),
      hit: !!(atk ? HIT.has(atk.outcome) : rows.some(r => !r.save?.ok)),
      /* Point visé : une forme partie du tireur (ligne, cône) vise là où
         l'on a cliqué ; une forme posée à l'impact, là où elle est tombée. */
      point: self && aim.point ? { ...aim.point } : { ...origin },
      ...this.#shotsOf(st, scope) };
  }

  /* ============================================================ */
  /*  Application des dégâts                                       */
  /* ============================================================ */

  /** Retire `amount` de la clé `key` (bornes et points temporaires
      gérés à l'écriture, comme partout). `by` : l'attaquant (uuid) —
      le déclencheur « J'ai mis une cible à 0 » le lit à l'écriture. */
  static async applyDamage(actor, key, amount, by = null, nl = null) {
    /* Objet posé attaquable : ses PV sont la clé de son onglet Scène. */
    if (actor?.documentName === "Item") key = PropManager.cfgOf(actor).hpKey;
    if (!actor || !key || !(amount > 0)) return;
    /* Non létal : jamais sous la valeur gardée ; l'atteindre (ou un coup
       qui l'aurait dépassée) pose l'effet choisi. */
    const keep = nl && Number.isFinite(Number(nl.keep)) ? Number(nl.keep) : null;
    /* Lu et écrit dans la file du document : plusieurs dégâts appliqués
       ensemble se cumulent (aucun n'écrase l'autre). */
    const amt = await valueQueue(actor, async () => {
      const cur = Number(docScope(actor)[key] ?? actor.system?.values?.[key] ?? 0) || 0;
      const a = keep === null ? amount : Math.min(amount, Math.max(0, cur - keep));
      if (a > 0) await actor.update({ [`system.values.${key}`]: cur - a }, by ? { sbeBy: by } : {});
      return a;
    });
    if (keep !== null && nl.effect && actor.documentName === "Actor") {
      const now = Number(docScope(actor)[key] ?? actor.system?.values?.[key] ?? 0) || 0;
      if (now <= keep && EffectManager.getDef(nl.effect)) await EffectManager.act(actor, nl.effect, "apply");
    }
    if (!(amt > 0)) return [];
    /* Ce que les réactions de la cible ont retenu (Réflexe de proie…). */
    const { ActionTriggers } = await import("../triggers/action-triggers.mjs");
    return ActionTriggers.takeDropNote(actor, key);
  }

  /** L'attaquant d'une carte : celui qui parle. */
  static #byOf(message) {
    return ChatMessage.getSpeakerActor(message?.speaker)?.uuid ?? null;
  }

  /** MJ : applique tout de suite. Joueur : liste en attente pour le MJ. */
  static async #applyAll(rows, cfg, by = null, nl = null) {
    /* Chaque cible garde de quoi CORRIGER plus tard (carte, MJ) : le
       dégât brut, la réduction lue sur elle, et le facteur appliqué. */
    /* Une zone touchée peut encaisser sur sa propre clé (`key`). */
    const due = rows.filter(r => r.dmg && r.dmg.final > 0 && r.actor && (r.dmg.key || cfg.damageKey));
    const list = due.map(r => ({
      target: r.actor.uuid, amount: r.dmg.final, gross: r.dmg.gross, red: r.dmg.red + (r.dmg.prot || 0), redKey: r.dmg.redKey, f: 0,
      ...(r.rid !== undefined ? { rid: r.rid } : {}),
      ...(r.dmg.key ? { key: r.dmg.key } : {}), ...(r.dmg.protKey ? { protKey: r.dmg.protKey } : {}),
      ...(nl ? { nl } : {})
    }));
    /* La carte l'annonce : « Non létal ». */
    if (nl) for (const r of due) r.dmg.nonLethal = true;
    if (!list.length) return { list: [], key: cfg.damageKey, applied: false, pending: false };
    if (game.user.isGM) {
      for (const r of due) {
        const reacts = await this.applyDamage(r.actor, r.dmg.key || cfg.damageKey, r.dmg.final, by, nl);
        if (reacts?.length) {
          r.dmg.reacts = reacts;
          r.dmg.taken = Math.max(0, r.dmg.final - reacts.reduce((n, x) => n + x.delta, 0));
        }
      }
      for (const e of list) e.f = 1;
      return { list, key: cfg.damageKey, applied: true, pending: false };
    }
    return { list, key: cfg.damageKey, applied: false, pending: true };
  }

  /* ============================================================ */
  /*  La carte                                                     */
  /* ============================================================ */

  static #attackerSide(item, actor, atk, winner) {
    return {
      ...(actor ? { ref: Identity.refOf(actor) } : { img: item.img || "", name: item.name || "" }),
      role: "attacker", cls: winner ? "is-winner" : "",
      rolls: atk ? [atk.roll] : [], adv: atk?.adv, dropped: atk?.dropped ?? [],
      after: atk ? ChatCards.modsHtml(atk.mods?.rows ?? [], atk.mods ?? {}) + (atk.afterHtml ?? "") : ""
    };
  }

  static async #damageBlock(dmg, target, hitLine = "", rid = null) {
    return `<div class="sbe-atk-dmg"${rid !== null ? ` data-dmg-row="${rid}"` : ""}>
      <div class="sbe-atk-dmg-head"><i class="fa-solid fa-burst"></i> ${esc(L("SBE.Combat.Damage"))}${dmg.type ? ` · <span class="sbe-atk-type">${esc(dmg.type)}</span>` : ""}</div>
      <div class="sbe-atk-dmg-roll">${await ChatCards.diceHtml(dmg.roll)}</div>
      ${this.#nonLethalHtml(dmg)}
      <div class="sbe-atk-dmg-total">${esc(L("SBE.Combat.DamageTotal"))} <b>${dmg.taken ?? dmg.final}</b></div>
      ${this.#reactsHtml(dmg)}
      ${this.#calcHtml(dmg, target, hitLine)}
    </div>`;
  }

  /** Au-dessus des dégâts : « Non létal ». */
  static #nonLethalHtml(dmg) {
    return dmg?.nonLethal ? `<div class="sbe-atk-nonlethal-row"><span class="sbe-atk-nonlethal">${esc(L("SBE.Combat.NonLethal"))}</span></div>` : "";
  }

  /** Sous le total : ce que les réactions de la cible ont retenu (icône, nom, montant). */
  static #reactsHtml(dmg) {
    if (!dmg?.reacts?.length) return "";
    return `<div class="sbe-atk-reacts">${dmg.reacts.map(x => `<div class="sbe-atk-react">${x.img ? `<img src="${esc(x.img)}" alt="">` : ""}<span>${esc(x.name)}</span><b>−${x.delta}</b></div>`).join("")}</div>`;
  }

  /** Libellé d'une clé sur la fiche de la cible (sinon la clé). */
  static #labelOf(actor, key) {
    if (!key) return "";
    const tpl = actor?.system?.template?.system?.elements ?? [];
    return [...walkElements(tpl)].find(e => e?.key === key)?.label || key;
  }

  /**
   * « Détail du calcul » repliable : chaque étape, son facteur et la
   * valeur obtenue. Le résumé donne la chaîne courte (9 × 2 − 4 = 14).
   */
  static #calcHtml(dmg, target, hitLine = "", rid = null) {
    const w = dmg.why ?? {};
    const lang = game.i18n?.lang || "fr";
    const n = v => (Math.round(v * 10) / 10).toLocaleString(lang);
    const steps = [];
    let v = dmg.roll.total;
    const short = [String(v)];
    if (hitLine) steps.push(`<li class="sbe-atk-calc-hit">${esc(hitLine)}</li>`);
    const r = dmg.roll;
    steps.push(`<li><span>${esc(L("SBE.Combat.CalcRoll"))}</span><span>${esc(r.formula)} → ${esc(r.result)}</span><b>${n(v)}</b></li>`);
    const factor = (f, label, txt) => {
      if (f === undefined || f === 1) return;
      v *= f;
      short.push(txt);
      steps.push(`<li><span>${esc(label)}</span><span>${esc(txt)}</span><b>${n(v)}</b></li>`);
    };
    if (w.crit === undefined && w.hits === undefined) factor(dmg.mult, L("SBE.Combat.CalcMult"), `× ${n(dmg.mult)}`);
    factor(w.crit, L("SBE.Combat.CalcCrit"), `× ${n(w.crit)}`);
    factor(w.hits, L("SBE.Combat.CalcHits"), `× ${n(w.hits)}`);
    if (w.zone === undefined && w.save === undefined) factor(dmg.part, L("SBE.Combat.CalcZone"), `× ${Math.round(dmg.part * 100)} %`);
    factor(w.zone, L("SBE.Combat.CalcZone"), `× ${Math.round((w.zone ?? 1) * 100)} %`);
    factor(w.save, L("SBE.Combat.CalcSave"), w.save === 0.5 ? "× ½" : `× ${n(w.save)}`);
    factor(w.loc, L("SBE.Loc.CalcZone", { zone: dmg.zone }), `× ${n(w.loc)}`);
    factor(w.share, L("SBE.Loc.CalcShare"), `÷ ${Math.round(1 / (w.share || 1))}`);
    if (dmg.gross !== v) steps.push(`<li><span>${esc(L("SBE.Combat.CalcRound"))}</span><span></span><b>${dmg.gross}</b></li>`);
    let after = dmg.gross;
    if (dmg.red) {
      short.push(`− ${dmg.red}`);
      after -= dmg.red;
      const lbl = this.#labelOf(target, dmg.redKey);
      steps.push(`<li><span>${esc(L("SBE.Combat.CalcRed", { label: lbl, type: dmg.type || "" }).replace(/\s+/g, " "))}</span><span>− ${dmg.red}</span><b>${after}</b></li>`);
    }
    if (dmg.prot) {
      short.push(`− ${dmg.prot}`);
      after -= dmg.prot;
      steps.push(`<li><span>${esc(L("SBE.Loc.CalcProt", { label: this.#labelOf(target, dmg.protKey), zone: dmg.zone }))}</span><span>− ${dmg.prot}</span><b>${after}</b></li>`);
    }
    if ((dmg.red || dmg.prot) && dmg.final !== after) steps.push(`<li><span>${esc(L("SBE.Combat.CalcFloor"))}</span><span></span><b>${dmg.final}</b></li>`);
    /* Ce que les réactions de la cible ont retenu, une étape chacune. */
    let left = dmg.final;
    for (const x of dmg.reacts ?? []) {
      left = Math.max(0, left - x.delta);
      short.push(`− ${x.delta}`);
      steps.push(`<li><span>${esc(x.name)}</span><span>− ${x.delta}</span><b>${left}</b></li>`);
    }
    const total = dmg.taken ?? dmg.final;
    steps.push(`<li class="sbe-atk-calc-total"><span>${esc(L("SBE.Combat.CalcTotal"))}</span><span></span><b>${total}</b></li>`);
    return `<details class="sbe-atk-calc"${rid !== null ? ` data-dmg-row="${rid}"` : ""}>
      <summary><i class="fa-solid fa-caret-right sbe-atk-calc-caret"></i> ${esc(L("SBE.Combat.Calc"))} <span class="sbe-atk-calc-short">${esc(short.join(" "))} = ${total}</span></summary>
      <ol>${steps.join("")}</ol>
    </details>`;
  }

  /**
   * Une ligne par cible touchée par la zone, en clair :
   *   NOM ........................ 💥 12 Physique
   *   Zone 50 % · Équilibre 14 : réussi (½ dégâts)
   * (la part de zone ne s'affiche que si elle n'est pas de 100 %).
   */
  static async #zoneRows(rows, st = {}, { after = null, item = null, groups = {} } = {}) {
    if (!rows.length) return `<div class="sbe-card-line sbe-atk-note">${esc(L("SBE.Zone.Nobody"))}</div>`;
    let html = `<div class="sbe-zone-rows">`;
    for (const r of rows) {
      const meta = [];
      if (r.intensity !== 100) meta.push(`<span class="sbe-zone-int">${esc(L("SBE.Zone.InZone", { n: r.intensity }))}</span>`);
      const sv = this.#saveHtml(r, st);
      if (sv) meta.push(sv);
      const d = r.dmg;
      const who = `<span class="sbe-zone-who"><b data-ref-name="${esc(Identity.refOf(r.actor))}"></b>${r.loc ? ` <small class="sbe-loc-tag"><i class="fa-solid fa-location-crosshairs"></i> ${esc(r.loc)}</small>` : ""}</span>`;
      /* Non létal : le nom sur la ligne de l'étiquette, les dégâts dessous. */
      const head = d?.nonLethal
        ? `<div class="sbe-zone-line">${who}<span class="sbe-atk-nonlethal">${esc(L("SBE.Combat.NonLethal"))}</span></div>
        <div class="sbe-zone-line sbe-zone-dmgline">${this.#dmgSpan(d, r.rid)}</div>`
        : `<div class="sbe-zone-line">${who}${d ? this.#dmgSpan(d, r.rid) : ""}</div>`;
      html += `<div class="sbe-zone-row">
        ${head}
        ${d ? this.#reactsHtml(d) : ""}
        ${meta.length ? `<div class="sbe-zone-meta">${meta.join("")}</div>` : ""}
        ${d ? this.#calcHtml(d, r.actor, "", r.rid) : ""}
        ${r.gid !== undefined && rows[rows.indexOf(r) + 1]?.gid !== r.gid ? await this.#dmgAfterHtml(after, item, r.gid, groups[r.gid]) : ""}
      </div>`;
    }
    return html + `</div>`;
  }

  static #applyHtml(apply) {
    if (apply.applied) return `<div class="sbe-atk-applied"><i class="fa-solid fa-check"></i> ${esc(L("SBE.Combat.Applied"))}</div>`;
    if (apply.pending) return `<button type="button" class="sbe-atk-apply" data-sbe-atk="apply"><i class="fa-solid fa-heart-crack"></i> ${esc(L("SBE.Combat.Apply"))}</button>`;
    return "";
  }

  /** Les champs de la carte d'attaque (publiée, ou réécrite par une relance). */
  static #cardOf({ item, title, sides, body, outcome, detail, optVals = {}, st = {} }) {
    /* Options choisies (cochées, ou différentes de 0 / vide) : en tête. */
    const chosen = (st.options ?? []).filter(o => optVals[o.key] !== undefined && optVals[o.key] !== 0 && optVals[o.key] !== "")
      .map(o => `<span class="sbe-atk-opt">${esc(o.label || o.key)}${o.type === "check" ? "" : ` : ${esc(optVals[o.key])}`}</span>`).join("");
    if (chosen) body = `<div class="sbe-atk-opts">${chosen}</div>` + body;
    return { type: "roll", title: title || item.name, subtitle: item.name, body, outcome, detail, sides, sidesFirst: true };
  }

  static async #post({ item, actor, title, sides, body, outcome, detail, messageMode, apply, optVals = {}, st = {}, targets = [], atkAfter = null, dmgAfter = null }) {
    const speakerActor = actor?.documentName === "Actor" ? actor : null;
    const card = this.#cardOf({ item, title, sides, body, outcome, detail, optVals, st });
    /* VISIBILITÉ (règles de combat) : la valeur choisie dans la fenêtre,
       sinon celle par défaut ; « Tireur, cibles et MJ » = un murmure. */
    const cfg = this.getConfig();
    let mode = messageMode || visDefaultMode(cleanVis(cfg.vis, { targets: true }));
    let whisper = null;
    if (mode === TARGETS_MODE) { whisper = targetsWhisper(speakerActor, targets); mode = null; }
    const speaker = ChatMessage.getSpeaker({ actor: speakerActor });
    const flags = { [SYSTEM_ID]: { attack: { list: apply.list, key: apply.key, applied: apply.applied, pending: apply.pending },
      ...(atkAfter ? { atkAfter } : {}), ...(dmgAfter ? { dmgAfter } : {}) } };
    const full = { ...card, speaker, flags };
    /* DÉTAILS AU MJ SEUL : ceux qui lisent le message voient l'attaque et
       son issue ; les chiffres (jets, défense, dégâts) vont au MJ seul. */
    const shared = !!whisper || isPublicMode(mode);
    if (cfg.gmDetails && shared) {
      await ChatCards.post({
        type: "roll", title: title || item.name, subtitle: item.name, outcome, sidesFirst: true, speaker,
        sides: (sides ?? []).map(sd => ({ ref: sd.ref, img: sd.img, name: sd.name, role: sd.role, cls: sd.cls })),
        body: `<div class="sbe-card-line sbe-atk-note"><i class="fa-solid fa-eye-slash"></i> ${esc(L("SBE.Combat.DetailsToGm"))}</div>`,
        ...(whisper ? { whisper } : { messageMode: mode })
      });
      await ChatCards.post({ ...full, whisper: gmIds() });
      return;
    }
    await ChatCards.post({ ...full, ...(whisper ? { whisper } : { messageMode: mode }) });
  }

  /* ============================================================ */
  /*  Corriger un dégât depuis la carte (MJ)                        */
  /* ============================================================ */

  /** Facteurs proposés : annuler, moitié, normal, double, en soin. */
  static FIX_FACTORS = [0, 0.5, 1, 2, -1];

  /** Ce que vaut une ligne pour un facteur (soin = négatif). */
  static #fixValue(e, f) {
    if (!f) return 0;
    if (f < 0) return -Math.round(Number(e.amount) || 0) * Math.abs(f);
    const gross = Number(e.gross ?? e.amount) || 0;
    return Math.max(0, Math.round(gross * f) - (Number(e.red) || 0));
  }

  /** Écart de PV sur la cible : dégât (positif) ou soin (négatif). */
  static async #shift(target, key, delta, by = null, nl = null) {
    if (!delta) return;
    if (delta > 0) return this.applyDamage(target, key, delta, by, nl);
    const k = target?.documentName === "Item" ? PropManager.cfgOf(target).hpKey : key;
    await valueQueue(target, async () => {
      const cur = Number(docScope(target)[k] ?? target.system?.values?.[k] ?? 0) || 0;
      await target.update({ [`system.values.${k}`]: cur - delta });
    });
  }

  static #fixLabel(f) {
    return f === 0 ? L("SBE.Combat.FixUndo") : f < 0 ? L("SBE.Combat.FixHeal") : f === 0.5 ? "½" : `×${f}`;
  }

  /** Les corrections, lisibles par tous dans la carte. */
  static #fixNotes(list) {
    const rows = list.filter(e => e.touched && (Number(e.f) !== 1 || e.added))
      .map(e => `<div class="sbe-card-line sbe-atk-fix"><i class="fa-solid fa-pen"></i> <b data-ref-name="${esc(e.target)}">?</b> : ${esc(e.added && Number(e.f) === 1 ? L("SBE.Combat.FixAdded", { n: e.amount }) : this.#fixLabel(Number(e.f)))}</div>`);
    return rows.length ? `<div class="sbe-atk-fixes">${rows.join("")}</div>` : "";
  }

  static async #saveFix(message, data) {
    /* Le bloc des corrections est toujours en fin de message. */
    let content = String(message.content).replace(/<div class="sbe-atk-fixes">[\s\S]*$/, "");
    content += this.#fixNotes(data.list);
    await message.update({ content, [`flags.${SYSTEM_ID}.attack.list`]: data.list });
  }

  /** Le panneau du MJ sous la carte (jamais enregistré dans le message). */
  static #fixPanel(message, root, data) {
    const card = root.querySelector(".message-content");
    if (!card || card.querySelector(".sbe-atk-fixpanel")) return;
    const panel = document.createElement("details");
    panel.className = "sbe-atk-fixpanel";
    const btn = (i, f, cur) => `<button type="button" data-fix="${i}" data-f="${f}" class="${f === cur ? "is-on" : ""}">${esc(this.#fixLabel(f))}</button>`;
    const rows = (data.list ?? []).map((e, i) => {
      if (e.undo) return "";
      const who = Identity.of(e.target)?.name ?? "?";
      const cur = Number(e.f ?? (data.applied ? 1 : 0));
      return `<div class="sbe-atk-fixrow"><span class="sbe-atk-fixwho">${esc(who)} <small>(${this.#fixValue(e, cur)})</small></span>
        <span class="sbe-atk-fixbtns">${this.FIX_FACTORS.map(f => btn(i, f, cur)).join("")}</span></div>`;
    }).join("");
    panel.innerHTML = `<summary><i class="fa-solid fa-user-shield"></i> ${esc(L("SBE.Combat.FixTitle"))}</summary>
      ${rows}
      <button type="button" class="sbe-atk-fixsel"><i class="fa-solid fa-crosshairs"></i> ${esc(L("SBE.Combat.FixSelected"))}</button>
      <p class="notes">${esc(L("SBE.Combat.FixHint"))}</p>`;
    card.appendChild(panel);
    panel.addEventListener("click", (ev) => {
      const b = ev.target.closest("button");
      if (!b) return;
      ev.preventDefault();
      /* Un clic à la fois par carte : le suivant relit les corrections
         déjà faites (deux clics rapides ne s'appliquent pas deux fois). */
      gmQueue(`atkfix:${message.id}`, () => this.#onFix(message, b)).catch(err => console.warn("SBE | Correction des dégâts en échec", err));
    });
  }

  /** Une correction du MJ (facteur sur une cible, ou « aux sélectionnés »). */
  static async #onFix(message, b) {
    const fresh = foundry.utils.deepClone(message.getFlag(SYSTEM_ID, "attack") ?? {});
    const list = fresh.list ?? [];
    if (b.classList.contains("sbe-atk-fixsel")) {
      /* Mêmes dégâts aux jetons sélectionnés (leur réduction relue). */
      const base = list.find(e => !e.undo);
      if (!base) return;
      const known = new Set(list.map(e => e.target));
      const actors = (canvas.tokens?.controlled ?? []).map(t => t.actor).filter(a => a && !known.has(a.uuid));
      if (!actors.length) { ui.notifications.warn(L("SBE.Combat.FixNoSel")); return; }
      for (const a of actors) {
        const sc = docScope(a);
        const red = (base.redKey ? (Number(sc[base.redKey]) || 0) : 0) + (base.protKey ? (Number(sc[base.protKey]) || 0) : 0);
        const e = { target: a.uuid, amount: 0, gross: Number(base.gross ?? base.amount) || 0, red, redKey: base.redKey ?? "", f: 1, touched: true, added: true,
          ...(base.key ? { key: base.key } : {}), ...(base.protKey ? { protKey: base.protKey } : {}), ...(base.nl ? { nl: base.nl } : {}) };
        e.amount = this.#fixValue(e, 1);
        await this.#shift(a, e.key || fresh.key, e.amount, this.#byOf(message), e.nl ?? null);
        list.push(e);
      }
      return this.#saveFix(message, fresh);
    }
    const i = Number(b.dataset.fix);
    const f = Number(b.dataset.f);
    const e = list[i];
    if (!e) return;
    const target = await fromUuid(e.target).catch(() => null);
    if (!target) { ui.notifications.warn(L("SBE.Combat.TargetGone")); return; }
    const before = Number(e.f ?? (fresh.applied ? 1 : 0));
    if (before === f) return;
    await this.#shift(target, e.key || fresh.key, this.#fixValue(e, f) - this.#fixValue(e, before), this.#byOf(message), e.nl ?? null);
    e.f = f;
    e.touched = true;
    return this.#saveFix(message, fresh);
  }

  /** Bouton « Appliquer les dégâts » : seul le MJ peut cliquer. */
  static #wire(message, html) {
    const root = html instanceof HTMLElement ? html : html?.[0];
    /* Relancer les dégâts (un groupe par cible). */
    const dft = message.getFlag(SYSTEM_ID, "dmgAfter");
    const dbtns = dft ? [...(root?.querySelectorAll?.(".sbe-dmg-after [data-sbe-after]") ?? [])] : [];
    if (dbtns.length) {
      for (const b of dbtns) b.disabled = true;
      fromUuid(dft.item).catch(() => null).then(item => {
        const after = item ? this.#dmgAfterOf(item, dft.st) : null;
        for (const b of dbtns) {
          if (!after || !afterCanClick(after, item)) { b.style.display = "none"; continue; }
          if (!b.dataset.tooltipText) b.disabled = false;
          b.addEventListener("click", async (ev) => {
            ev.preventDefault();
            for (const x of dbtns) x.disabled = true;
            await UndoManager.record({ label: `${message.speaker?.alias ?? ""} — ${b.textContent.trim()}`.replace(/^ — /, ""), msgId: message.id },
              () => this.#rerollDamage(message, b.closest("[data-dmg-gid]")?.dataset.dmgGid ?? "", b.dataset.sbeAfter));
          });
        }
      });
    }
    /* Relances et bonus sur la carte d'attaque (dernière étape d'un bouton). */
    const aft = message.getFlag(SYSTEM_ID, "atkAfter");
    const abtns = aft ? [...(root?.querySelectorAll?.("[data-sbe-after]") ?? [])].filter(b => !b.closest(".sbe-dmg-after")) : [];
    if (abtns.length) {
      for (const b of abtns) b.disabled = true;
      fromUuid(aft.item).catch(() => null).then(item => {
        const after = item ? afterFor(cleanAfter(this.#rollEl(item, String(aft.st?.key))?.config?.roll?.after), "roll") : null;
        for (const b of abtns) {
          if (!after || !afterCanClick(after, item)) { b.style.display = "none"; continue; }
          if (!b.dataset.tooltipText) b.disabled = false;
          b.addEventListener("click", async (ev) => {
            ev.preventDefault();
            for (const x of abtns) x.disabled = true;
            await UndoManager.record({ label: `${message.speaker?.alias ?? ""} — ${b.textContent.trim()}`.replace(/^ — /, ""), msgId: message.id },
              () => this.#rerollAttack(message, b.dataset.sbeAfter));
          });
        }
      });
    }
    const data = message.getFlag(SYSTEM_ID, "attack");
    /* MJ : corriger les dégâts de cette carte. */
    if (game.user.isGM && root && Array.isArray(data?.list) && data.list.some(e => e.key || data.key)) this.#fixPanel(message, root, data);
    const btn = root?.querySelector?.('[data-sbe-atk="apply"]');
    if (!btn) return;
    if (!game.user.isGM || !data?.pending) { btn.disabled = true; if (game.user.isGM) btn.style.display = "none"; return; }
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      btn.disabled = true;
      answerCard("attack", message, true);
    });
  }

  /** Bouton « Appliquer » d'une carte d'attaque (MJ) : une action de l'historique. */
  static async #applyCard(message) {
    /* Relue ici : déjà appliquée (autre MJ, double clic) → rien. */
    const data = foundry.utils.deepClone(message.getFlag(SYSTEM_ID, "attack") ?? {});
    if (!data.pending) return;
    let missing = 0;
    for (const e of data.list ?? []) {
      /* Déjà réglée par le MJ (panneau de correction) : on n'y touche pas. */
      if (Number(e.f)) continue;
      const target = await fromUuid(e.target).catch(() => null);
      if (!target) { missing++; continue; }
      /* Une relance a changé l'issue : l'ancienne application est défaite. */
      if (e.undo) { await this.#shift(target, e.key || data.key, -Number(e.undo)); continue; }
      await this.applyDamage(target, e.key || data.key, Number(e.amount) || 0, this.#byOf(message), e.nl ?? null);
    }
    if (missing) ui.notifications.warn(L("SBE.Combat.TargetGone"));
    const content = String(message.content).replace(
      /<button type="button" class="sbe-atk-apply"[^>]*>[\s\S]*?<\/button>/,
      `<div class="sbe-atk-applied"><i class="fa-solid fa-check"></i> ${esc(L("SBE.Combat.Applied"))}</div>`);
    const list = (data.list ?? []).filter(e => !e.undo).map(e => ({ ...e, f: Number(e.f) || 1 }));
    await message.update({ content, [`flags.${SYSTEM_ID}.attack.pending`]: false, [`flags.${SYSTEM_ID}.attack.applied`]: true,
      [`flags.${SYSTEM_ID}.attack.list`]: list });
  }
}
