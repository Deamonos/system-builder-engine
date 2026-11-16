/**
 * SBE — OBJETS DE SCÈNE (socle des déployables, outils fixes, tourelles,
 * éléments interactifs et pièges)
 *
 * Un objet POSÉ sur la scène est un PION NON LIÉ d'un seul personnage de
 * base caché (type d'acteur « prop »). Le delta de chaque pion porte son
 * propre inventaire : l'objet ENTIER (valeurs, usure, état) et ce qu'il
 * contient (munitions dans ses slots…). Rien d'autre à cacher ni à
 * nettoyer : supprimer le pion supprime l'objet.
 *
 * - Un modèle d'objet devient « objet de scène » par une case de ses
 *   options (réglages : propCfg) ;
 * - on le pose par l'étape de bouton « Poser sur la scène » (le joueur)
 *   ou en glissant un objet du monde sur la carte (le MJ) ;
 * - un double-clic ouvre le PANNEAU : ses boutons « une fois posé »,
 *   utilisés par le personnage qui interagit (il devient le porteur le
 *   temps de l'action : ses ingrédients, ses munitions, son jet) ;
 * - « Reprendre » le rend à l'inventaire, en entier.
 *
 * Seul le MJ principal crée, supprime et rend : les joueurs le lui
 * demandent par le canal du système.
 *
 * Pion : flags.sbe.prop = { item, owner (id d'utilisateur), actor (uuid
 * du personnage qui l'a posé), user (utilisateur en cours, option « un
 * seul à la fois ») }.
 */

import { activeTokenOf } from "../../helpers/canvas-utils.mjs";
import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { onSocketMessage, emitSocket, isPrimaryGM, requestGM, gmQueue } from "../../helpers/socket.mjs";
import { flatSteps } from "../../builder/step-blocks.mjs";
import { carrierOf, asCarrier, bundleOf, holdsOthers, dropIntoContainer, askQuantity, isStackableItem, qtyOf, hostIdOf, unpackContents } from "../../builder/inventory.mjs";
import { walkElements, slotAccepts, isRefList } from "../../builder/element-renderer.mjs";
import { evalExpression, buildScope } from "../../builder/formula-engine.mjs";
import { docScope } from "../../builder/doc-context.mjs";
import { cleanTrap } from "../traps/trap-model.mjs";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const FLAG = "prop";
export const CFG_FLAG = "propCfg";
export const LOCAL_FLAG = "propLocal";
export const PROP_TYPE = "prop";

const DEFAULTS = {
  sizeMode: "cells", w: 1, h: 1, img: "", rotate: true, range: 1, single: false,
  visibility: "all", use: "all", take: "owner", stateKey: "", states: [], hpKey: "", onZero: "destroy",
  showName: false, ignoreCombat: true, fireArc: 0, propIf: "",
  panelMode: "window", panelWidth: 0, panelHead: true,
  /* Déclencheurs : double-clic, approche, objet glissé dessus. */
  dblClick: true,
  apOn: false, apRange: 1, apMode: "stop", apAct: "panel", apBtn: "", apFreq: "each", apWho: "players",
  dropOn: false, dropBtn: "", dropIf: ""
};

export class PropManager {

  static #panels = new Map();
  /* Dernier pion de personnage sélectionné (voir interactor). */
  static #lastToken = "";
  /* Personnage imposé le temps d'un déclencheur (voir withActor). */
  static #forced = null;

  /** Exécute fn avec ce personnage comme celui qui interagit. */
  static async withActor(actor, fn) {
    if (!actor) return fn();
    const prev = this.#forced;
    this.#forced = actor;
    try { return await fn(); } finally { this.#forced = prev; }
  }
  /* Sortes de pions posés par d'autres modules (sol, coffre…) :
     kind → { cfg(td) → réglages, open(td, actor) }. */
  static #kinds = new Map();

  /** Un module déclare sa sorte d'objet posé (sol, coffre…). */
  static registerKind(kind, def) { this.#kinds.set(kind, def); }

  /* Fenêtres propres à une famille d'objets posés (piège…) : au double-clic,
     la première qui répond vrai prend la main. */
  static #openers = [];
  static registerOpener(fn) { this.#openers.push(fn); }

  static kindOf(td) { return String(this.flagsOf(td).kind ?? ""); }

  /** Réglages effectifs d'un pion : ceux de sa sorte, sinon de son objet. */
  static tokenCfg(td) {
    const doc = td?.document ?? td;
    const k = this.#kinds.get(this.kindOf(doc));
    return k ? this.cleanCfg(k.cfg?.(doc) ?? {}) : this.cfgOf(this.itemOf(doc));
  }

  /**
   * Ce qu'un combat vise sur ce pion : le personnage d'un pion ordinaire ;
   * pour un objet posé, rien s'il est « ignoré en combat », sinon l'OBJET
   * lui-même (sa défense, ses résistances, ses PV sont ses clés).
   */
  static targetDocOf(t) {
    const doc = t?.document ?? t;
    if (!doc) return null;
    if (!this.isPropToken(doc)) return doc.actor ?? null;
    if (this.kindOf(doc) || this.tokenCfg(doc).ignoreCombat) return null;
    return this.itemOf(doc);
  }

  /** Pion d'objet posé que les combats et le ciblage ignorent ? */
  static isIgnored(t) {
    const doc = t?.document ?? t;
    return this.isPropToken(doc) && !this.targetDocOf(doc);
  }

  /* ============================================================ */
  /*  Réglages                                                     */
  /* ============================================================ */

  static cleanCfg(c = {}) {
    const pick = (v, list, d) => (list.includes(v) ? v : d);
    return {
      sizeMode: pick(c.sizeMode, ["cells", "px", "image"], DEFAULTS.sizeMode),
      w: Math.max(0.1, Number(c.w) || DEFAULTS.w),
      h: Math.max(0.1, Number(c.h) || DEFAULTS.h),
      img: String(c.img ?? "").trim(),
      rotate: c.rotate !== false,
      range: Math.max(0, Number(c.range ?? DEFAULTS.range) || 0),
      single: !!c.single,
      visibility: pick(c.visibility, ["all", "owner", "gm"], DEFAULTS.visibility),
      use: pick(c.use, ["all", "owner"], DEFAULTS.use),
      take: pick(c.take, ["owner", "all", "gm", "none"], DEFAULTS.take),
      stateKey: String(c.stateKey ?? "").trim(),
      states: (Array.isArray(c.states) ? c.states : []).map(x => ({ value: String(x?.value ?? "").trim(), img: String(x?.img ?? "").trim() }))
        .filter(x => x.value && x.img),
      hpKey: String(c.hpKey ?? "").trim(),
      onZero: pick(c.onZero, ["destroy", "ground"], DEFAULTS.onZero),
      showName: !!c.showName,
      ignoreCombat: c.ignoreCombat !== false,
      /* Angle de tir (degrés) d'un objet posé qui attaque ; 0 = tout autour. */
      fireArc: Math.max(0, Math.min(360, Number(c.fireArc) || 0)),
      /* Condition du MODÈLE : seuls les objets qui la vérifient sont des
         objets de scène (vide = tous). */
      propIf: String(c.propIf ?? "").trim(),
      /* Panneau de l'objet posé : fenêtre, ou bulle accrochée au pion ;
         largeur en pixels (0 = par défaut). */
      panelMode: pick(c.panelMode, ["window", "bubble"], DEFAULTS.panelMode),
      panelWidth: Math.max(0, Math.round(Number(c.panelWidth) || 0)),
      /* En-tête du panneau : image et nom de l'objet. */
      panelHead: c.panelHead !== false,
      /* DÉCLENCHEURS. Double-clic : ouvre le panneau (le MJ l'ouvre toujours). */
      dblClick: c.dblClick !== false,
      /* À l'approche : un pion de personnage finit son déplacement à
         apRange cases (bord à bord) → le panneau, ou un bouton (clé). */
      apOn: !!c.apOn,
      apRange: Math.max(0, Number(c.apRange ?? DEFAULTS.apRange) || 0),
      /* « s'arrête à portée », « en passant » (le trajet y entre), ou les deux. */
      apMode: pick(c.apMode, ["stop", "pass", "both"], DEFAULTS.apMode),
      apAct: pick(c.apAct, ["panel", "button"], DEFAULTS.apAct),
      apBtn: String(c.apBtn ?? "").trim(),
      apFreq: pick(c.apFreq, ["each", "actor", "once"], DEFAULTS.apFreq),
      apWho: pick(c.apWho, ["players", "all"], DEFAULTS.apWho),
      /* Objet glissé dessus (depuis un inventaire) : lance un bouton (clé),
         l'objet glissé devient « l'objet choisi » ; dropIf filtre. */
      dropOn: !!c.dropOn,
      dropBtn: String(c.dropBtn ?? "").trim(),
      dropIf: String(c.dropIf ?? "").trim(),
      /* PIÈGE (managers/traps) : ses réglages « tr… ». */
      ...cleanTrap(c)
    };
  }

  /**
   * Réglages d'un objet : ceux du MODÈLE D'ATELIER (valeurs par défaut),
   * puis ceux de l'OBJET DU MONDE (onglet « Scène », flag propCfg), puis
   * ceux propres à CET EXEMPLAIRE (onglet « Scène » d'une copie, flag
   * propLocal). Un champ vide hérite. Accepte un document ou ses
   * données brutes (toObject).
   */
  static cfgOf(doc) {
    if (doc?.type === "template") return this.cleanCfg(doc.system?.propCfg ?? {});
    const sys = doc?.system ?? {};
    const tpl = game.items?.get(sys.templateId ?? "");
    const model = sys.modelId ? game.items?.get(sys.modelId) : null;
    const own = doc?.flags?.[SYSTEM_ID] ?? {};
    /* Une copie suit son objet du monde ; sans lui, sa propre copie des réglages. */
    const worldRaw = model && model.id !== doc?._id && model.id !== doc?.id
      ? model.flags?.[SYSTEM_ID]?.[CFG_FLAG] : own[CFG_FLAG];
    const localRaw = model ? own[LOCAL_FLAG] : null;
    return this.mergeCfg(tpl?.system?.propCfg, worldRaw, localRaw);
  }

  /** Superpose des réglages : un champ vide (ou une liste vide) hérite. */
  static mergeCfg(...layers) {
    const out = {};
    for (const l of layers) {
      for (const [k, v] of Object.entries(l ?? {})) {
        if (v === null || v === undefined || v === "") continue;
        if (Array.isArray(v) && !v.length) continue;
        out[k] = v;
      }
    }
    return this.cleanCfg(out);
  }

  /** Le flag où l'onglet « Scène » de cet objet écrit. */
  static flagKeyOf(item) {
    const model = item?.system?.modelId ? game.items?.get(item.system.modelId) : null;
    return model && model !== item ? LOCAL_FLAG : CFG_FLAG;
  }

  /** Cet objet peut-il être posé sur la scène ? (option du modèle, et
      sa condition « Seulement si » lue sur l'objet) */
  static isPropItem(item) {
    const tpl = item?.system?.template;
    if (!tpl?.system?.opts?.prop) return false;
    const cond = String(tpl.system.propCfg?.propIf ?? "").trim();
    if (!cond) return true;
    /* La condition lit les champs de l'objet (son type…) : d'abord ses
       valeurs seules (sûr où qu'il soit), sinon sa portée complète. */
    try {
      const r = evalExpression(cond, buildScope(tpl.system.elements ?? [], item.system?.values ?? {}, {}));
      if (r !== null && r !== undefined) return !!r;
    } catch (_e) { /* portée complète ci-dessous */ }
    try { return !!evalExpression(cond, docScope(item)); }
    catch (err) { console.warn("SBE | Condition « Objet de scène si… » illisible", cond, err); return false; }
  }

  /** Le pion où cet objet est posé (objet de scène, sol, coffre), ou null. */
  static placedTokenOf(item) {
    const td = item?.parent?.isToken ? item.parent.token : null;
    return td && this.isPropToken(td) ? td : null;
  }

  /* ------------------------------------------------------------ */
  /*  Angle de tir d'un objet posé                                 */
  /* ------------------------------------------------------------ */

  /** { center, arc, rot } de l'objet posé qui attaque (null = sans limite). */
  static arcOf(item) {
    const td = this.placedTokenOf(item);
    if (!td || this.kindOf(td)) return null;
    const arc = this.tokenCfg(td).fireArc;
    if (!(arc > 0 && arc < 360)) return null;
    const c = td.object?.center;
    return c ? { center: { x: c.x, y: c.y }, arc, rot: Number(td.rotation) || 0 } : null;
  }

  /** Ce point est-il dans l'angle de tir ? (0° = le haut du pion, qui
      tourne avec lui) */
  static inArc(item, point) {
    const a = this.arcOf(item);
    if (!a || !point) return true;
    const dx = point.x - a.center.x, dy = point.y - a.center.y;
    if (Math.hypot(dx, dy) < 1) return true;
    const ang = Math.atan2(dy, dx) * 180 / Math.PI + 90;
    const diff = ((ang - a.rot) % 360 + 540) % 360 - 180;
    return Math.abs(diff) <= a.arc / 2 + 0.5;
  }

  /** Dessine l'angle de tir pendant la visée ; renvoie de quoi l'effacer. */
  static drawArc(item, cases = 0) {
    const a = this.arcOf(item);
    if (!a || !canvas?.interface) return () => {};
    const gs = canvas.dimensions?.size || 100;
    const r = (cases > 0 ? cases : 12) * gs;
    const g = new PIXI.Graphics();
    const from = (a.rot - 90 - a.arc / 2) * Math.PI / 180;
    const to = (a.rot - 90 + a.arc / 2) * Math.PI / 180;
    g.lineStyle(2, 0xffb000, 0.85).beginFill(0xffb000, 0.08);
    g.moveTo(a.center.x, a.center.y);
    g.arc(a.center.x, a.center.y, r, from, to);
    g.lineTo(a.center.x, a.center.y);
    g.endFill();
    canvas.interface.addChild(g);
    return () => { try { g.destroy(); } catch (_e) { /* */ } };
  }

  /** Ce pion est-il un objet de scène ? */
  static isPropToken(td) {
    const doc = td?.document ?? td;
    return !!doc?.getFlag?.(SYSTEM_ID, FLAG) && doc.actor?.type === PROP_TYPE;
  }

  static flagsOf(td) { return (td?.document ?? td)?.getFlag?.(SYSTEM_ID, FLAG) ?? {}; }

  /** La région de la scène à laquelle ce pion est accroché (ou null). */
  static regionOf(td) {
    const doc = td?.document ?? td;
    const id = this.flagsOf(doc).region;
    return id ? doc.parent?.regions?.get(id) ?? null : null;
  }

  /** L'objet porté par un pion d'objet de scène. */
  static itemOf(td) {
    const doc = td?.document ?? td;
    const f = this.flagsOf(doc);
    if (f.kind) return null;           /* sol, coffre : pas d'objet principal */
    return doc?.actor?.items?.get(f.item) ?? doc?.actor?.items?.contents?.[0] ?? null;
  }

  /** Le personnage de base (créé au besoin par le MJ). */
  static async baseActor() {
    const found = game.actors?.find(a => a.type === PROP_TYPE);
    if (found || !game.user.isGM) return found ?? null;
    return Actor.implementation.create({
      name: L("SBE.Prop.BaseName"), type: PROP_TYPE, img: "icons/svg/chest.svg",
      ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
      prototypeToken: { actorLink: false }
    });
  }

  /* ============================================================ */
  /*  Mise en place                                                */
  /* ============================================================ */

  static init() {
    onSocketMessage(async (p) => {
      if (p?.type === "sbePropMsg" && p.userId === game.user.id) { ui.notifications[p.level ?? "info"](L(p.key, p.data)); return; }
      if (!isPrimaryGM()) return;
      /* Une demande à la fois par objet ou par pion. */
      if (p?.type === "sbePropCreate") await gmQueue(p.source?.itemId ?? p.mainId, () => this.#gmCreate(p));
      else if (p?.type === "sbePropRetrieve") await gmQueue(p.token, () => this.#gmRetrieve(p));
      else if (p?.type === "sbePropLock") await gmQueue(p.token, () => this.#gmLock(p));
      else if (p?.type === "sbePropOut") await gmQueue(p.item, () => this.#gmMoveOut(p));
      else if (p?.type === "sbePropApDone") await gmQueue(p.token, () => this.#gmApDone(p));
    });

    /* Le personnage de base n'apparaît pas dans la barre latérale. */
    Hooks.on("renderActorDirectory", (_app, html) => {
      const root = html instanceof HTMLElement ? html : html?.[0];
      for (const a of game.actors?.filter(x => x.type === PROP_TYPE) ?? []) {
        root?.querySelectorAll(`[data-entry-id="${a.id}"]`).forEach(li => li.remove());
      }
    });

    /* MJ : glisser un objet du monde « objet de scène » sur la carte. */

    /* État (image) et PV : relus quand l'objet posé change. */
    Hooks.on("updateItem", (item) => {
      if (!isPrimaryGM()) return;
      const actor = item.parent;
      if (actor?.type !== PROP_TYPE || !actor.isToken) return;
      const td = actor.token;
      if (!td || !this.isPropToken(td) || this.flagsOf(td).item !== item.id) return;
      this.#afterChange(td, item);
    });

    /* Réglages de l'objet du monde (onglet « Scène ») changés : ses
       copies posées sur les scènes se mettent à jour. */
    Hooks.on("updateItem", (item, changes) => {
      if (!isPrimaryGM() || item.parent || item.type !== "objet") return;
      if (!foundry.utils.hasProperty(changes, `flags.${SYSTEM_ID}.${CFG_FLAG}`)) return;
      this.refreshCopies(item);
    });

    /* SÉCURITÉ : un objet POSÉ dont le modèle a une condition « Objet de
       scène si… » ne peut pas cesser de la vérifier (changer le type
       d'une tourelle posée en arme ordinaire) : il faut d'abord le
       reprendre. */
    Hooks.on("preUpdateItem", (item, changes) => {
      const td = this.placedTokenOf(item);
      if (!td || this.kindOf(td) || this.flagsOf(td).item !== item.id) return;
      if (!String(item.system?.template?.system?.propCfg?.propIf ?? "").trim()) return;
      let next = null;
      try { next = item.clone(changes, { keepId: true, parent: item.parent }); } catch (_e) { return; }
      if (next && !this.isPropItem(next)) {
        ui.notifications.warn(L("SBE.Prop.MustStayProp", { name: item.name }));
        return false;
      }
    });

    Hooks.on("controlToken", (tok, on) => {
      if (on && tok?.document && !this.isPropToken(tok.document)) this.#lastToken = tok.id;
    });

    /* Ignoré en combat : jamais dans le suivi de combat. */
    Hooks.on("preCreateCombatant", (c) => {
      const td = c.token ?? c.parent?.scene?.tokens?.get(c.tokenId);
      if (td && this.isIgnored(td)) return false;
    });

    /* Le panneau suit son pion. */
    Hooks.on("deleteToken", (td) => this.#panels.get(td.uuid)?.close({ animate: false }));
    /* L'objet d'un pion posé disparaît (objet du monde supprimé en
       cascade, consommé, supprimé à la main) : le pion part avec lui —
       jamais de pion vide sur la scène. Le sol et les coffres gardent
       leur pion (leur contenu change, eux restent). */
    Hooks.on("deleteItem", (item) => {
      if (!isPrimaryGM()) return;
      const td = item.parent?.isToken ? item.parent.token : null;
      if (!td || !this.isPropToken(td) || this.kindOf(td) || this.flagsOf(td).item !== item.id) return;
      td.delete().catch(err => console.warn("SBE | Objet posé : pion non supprimé", err));
    });
    Hooks.on("updateToken", (td) => this.#panels.get(td.uuid)?.render());
    /* … et son contenu (munition chargée, retirée, consommée). */
    for (const h of ["createItem", "updateItem", "deleteItem"]) {
      Hooks.on(h, (item) => {
        const td = item.parent?.isToken ? item.parent.token : null;
        if (td) this.#panels.get(td.uuid)?.render();
      });
    }

    this.#patchToken();
  }

  /** Le pion : double-clic = panneau ; jamais contrôlé ni déplacé par un joueur. */
  static #patchToken() {
    const Base = CONFIG.Token.objectClass;
    const PM = this;
    class SBEPropToken extends Base {
      _canView(user, event) {
        if (PM.isPropToken(this.document)) return this.layer.active && !this.layer._draggedToken;
        return super._canView(user, event);
      }
      _onClickLeft2(event) {
        if (PM.isPropToken(this.document)) {
          event?.stopPropagation?.();
          if (PM.#openers.some(fn => fn(this.document))) return;
          /* Double-clic coupé (objet qui ne réagit qu'à l'approche…) : le MJ l'ouvre quand même. */
          if (!game.user.isGM && !PM.kindOf(this.document) && !PM.tokenCfg(this.document).dblClick) return;
          PM.open(this.document);
          return;
        }
        return super._onClickLeft2(event);
      }
      _canControl(user, event) {
        if (PM.isPropToken(this.document) && !user.isGM) return false;
        return super._canControl(user, event);
      }
      /* Accroché à une tuile, une région ou une porte : c'est ELLE qu'on déplace (le pion suit). */
      _canDrag(user, event) {
        const f = PM.isPropToken(this.document) ? PM.flagsOf(this.document) : {};
        if (f.tile || f.region || f.wall) return false;
        return super._canDrag(user, event);
      }
      _canHUD(user, event) {
        if (PM.isPropToken(this.document) && !user.isGM) return false;
        return super._canHUD(user, event);
      }
      /* Ignoré en combat : jamais ciblé. */
      setTarget(targeted = true, opts = {}) {
        if (targeted && PM.isIgnored(this.document)) return;
        return super.setTarget(targeted, opts);
      }
      get isVisible() {
        const v = super.isVisible;
        if (!v || game.user.isGM || !PM.isPropToken(this.document)) return v;
        const cfg = PM.tokenCfg(this.document);
        if (cfg.visibility === "owner") return PM.flagsOf(this.document).owner === game.user.id;
        return v;
      }
    }
    CONFIG.Token.objectClass = SBEPropToken;
  }

  /* ============================================================ */
  /*  Poser                                                        */
  /* ============================================================ */

  /** Taille du pion en cases. */
  static async sizeOf(cfg, img) {
    const gs = canvas.grid?.size || 100;
    if (cfg.sizeMode === "px") return { w: cfg.w / gs, h: cfg.h / gs };
    if (cfg.sizeMode === "image" && img) {
      try {
        const tex = await foundry.canvas.loadTexture(img);
        if (tex?.width) return { w: tex.width / gs, h: tex.height / gs };
      } catch (_e) { /* image illisible : en cases */ }
    }
    return { w: cfg.w, h: cfg.h };
  }

  /** Image posée : celle de l'état, sinon du réglage, sinon de l'objet. */
  static imageOf(item, cfg = this.cfgOf(item)) {
    if (cfg.stateKey) {
      const v = String(item?.system?.values?.[cfg.stateKey] ?? "");
      const hit = cfg.states.find(s => s.value === v);
      if (hit) return hit.img;
    }
    return cfg.img || item?.img || "icons/svg/item-bag.svg";
  }

  /**
   * Visée de la pose, en deux temps :
   *  1. l'image suit la souris, clic = la poser là ;
   *  2. (si l'orientation est permise) l'image tourne vers la souris
   *     (par pas de 5°, Maj = libre ; molette = réglage fin), clic =
   *     valider.
   * Clic droit / Échap = annuler.
   * @returns {Promise<{x,y,rotation}|null>} centre et angle
   */
  static async aim(img, wCells, hCells, rotate, start = null) {
    if (!canvas.ready) return null;
    /* L'image d'abord : la visée elle-même ne fait plus rien d'asynchrone
       (une erreur y est rendue, jamais avalée). */
    let tex;
    try { tex = await foundry.canvas.loadTexture(img); } catch (_e) { tex = null; }
    if (!canvas.ready) return null;
    return new Promise((resolve) => {
      const gs = canvas.grid?.size || 100;
      const spr = new PIXI.Sprite(tex ?? PIXI.Texture.WHITE);
      spr.anchor.set(0.5);
      spr.width = wCells * gs; spr.height = hCells * gs;
      spr.alpha = 0.6;
      canvas.controls.addChild(spr);
      let rot = 0;
      let at = null;            /* point posé (temps 2) */
      let shift = false;
      const pos = () => canvas.mousePosition ?? { x: 0, y: 0 };
      const move = () => {
        const p = pos();
        if (!at) { spr.position.set(p.x, p.y); return; }
        if (Math.hypot(p.x - at.x, p.y - at.y) < 4) return;
        let a = Math.atan2(p.y - at.y, p.x - at.x) * 180 / Math.PI + 90;
        if (!shift) a = Math.round(a / 5) * 5;
        rot = ((a % 360) + 360) % 360;
        spr.angle = rot;
      };
      const wheel = (ev) => {
        if (!at) return;
        ev.preventDefault(); ev.stopPropagation();
        rot = (rot + (ev.deltaY > 0 ? 1 : -1) + 360) % 360;
        spr.angle = rot;
      };
      const done = (val) => {
        canvas.stage.off("pointermove", move);
        canvas.stage.off("pointerdown", down);
        window.removeEventListener("wheel", wheel, { capture: true });
        window.removeEventListener("keydown", key, { capture: true });
        window.removeEventListener("keyup", key, { capture: true });
        spr.destroy();
        resolve(val);
      };
      const down = (ev) => {
        const b = ev?.button ?? ev?.data?.button ?? 0;
        if (b === 2) return done(null);
        if (b !== 0) return;
        ev.stopPropagation?.();
        const p = pos();
        if (!at && rotate) {
          at = { x: p.x, y: p.y };
          spr.position.set(at.x, at.y);
          ui.notifications.info(L("SBE.Prop.AimOrient"));
          return;
        }
        done({ x: at?.x ?? p.x, y: at?.y ?? p.y, rotation: rot });
      };
      const key = (ev) => {
        shift = !!ev.shiftKey;
        if (ev.type === "keydown" && ev.key === "Escape") { ev.preventDefault(); done(null); }
      };
      canvas.stage.on("pointermove", move);
      canvas.stage.on("pointerdown", down);
      window.addEventListener("wheel", wheel, { capture: true, passive: false });
      window.addEventListener("keydown", key, { capture: true });
      window.addEventListener("keyup", key, { capture: true });
      /* Point déjà choisi (objet lâché sur la carte) : on oriente seulement. */
      if (start) {
        at = { x: start.x, y: start.y };
        spr.position.set(at.x, at.y);
        if (!rotate) { done({ x: at.x, y: at.y, rotation: 0 }); return; }
        ui.notifications.info(L("SBE.Prop.AimOrient"));
        return;
      }
      move();
      ui.notifications.info(L("SBE.Prop.Aim"));
    });
  }

  /** L'objet et tout ce qu'il contient (slots, conteneurs), prêts à voyager. */
  static #bundle(item) {
    const out = bundleOf(item);
    if (out[0]) foundry.utils.setProperty(out[0], "system.carry", { host: "", where: "", x: 0, y: 0, cell: -1 });
    return out;
  }

  /**
   * Étape « Poser sur la scène » : l'objet porté quitte l'inventaire et
   * devient un pion. @returns {Promise<boolean>}
   */
  static async place(item, actor, { point = null } = {}) {
    if (!this.isPropItem(item)) { ui.notifications.warn(L("SBE.Prop.NotProp")); return false; }
    if (!canvas.ready || !canvas.scene) { ui.notifications.warn(L("SBE.Prop.NoScene")); return false; }
    const cfg = this.cfgOf(item);
    const img = this.imageOf(item, cfg);
    const size = await this.sizeOf(cfg, img);
    const at = await this.aim(img, size.w, size.h, cfg.rotate, point);
    if (!at) return false;
    /* Piège : on place sa zone de déclenchement (annuler = rien n'est posé). */
    const trap = await this.#trapZone(cfg, at, size);
    if (trap === false) return false;
    /* Une pile : un seul exemplaire part, le reste reste dans le sac. */
    const qty = Number(item.system?.values?.quantity ?? 1) || 1;
    const items = this.#bundle(item);
    let split = false;
    if (qty > 1) {
      items.length = 1;
      items[0]._id = foundry.utils.randomID();
      foundry.utils.setProperty(items[0], "system.values.quantity", 1);
      split = true;
    }
    const payload = {
      type: "sbePropCreate", sceneId: canvas.scene.id, center: { x: at.x, y: at.y }, rotation: at.rotation,
      items, mainId: items[0]._id, userId: game.user.id, actorUuid: actor?.uuid ?? "",
      source: { itemId: item.id, split, ids: split ? [] : items.map(d => d._id) }, trap
    };
    if (isPrimaryGM()) await gmQueue(payload.source?.itemId ?? payload.mainId, () => this.#gmCreate(payload));
    else return requestGM(payload);
    return true;
  }

  /**
   * Installer un objet glissé sur la carte, au point lâché (puis
   * l'orienter) : un objet porté (son porteur), ou un objet du monde (MJ).
   */
  static async installAt(item, point) {
    const holder = item?.parent?.documentName === "Actor" ? item.parent : null;
    if (holder) return this.place(item, holder, { point });
    if (!game.user.isGM) return false;
    const cfg = this.cfgOf(item);
    const img = this.imageOf(item, cfg);
    const size = await this.sizeOf(cfg, img);
    const at = await this.aim(img, size.w, size.h, cfg.rotate, point);
    if (!at) return false;
    const trap = await this.#trapZone(cfg, at, size);
    if (trap === false) return false;
    await this.#placeWorld(item, { x: at.x, y: at.y }, at.rotation, trap);
    return true;
  }

  /** Zone d'un piège à la pose : ses réglages, sinon false (annulé) ; null hors piège. */
  static async #trapZone(cfg, at, size) {
    if (!cfg.trOn) return null;
    const { placeZone } = await import("../traps/trap-zone.mjs");
    const zone = await placeZone(cfg, at, size);
    return zone ?? false;
  }

  /** MJ : un objet du monde glissé sur la carte (une copie, l'original reste). */
  static async #placeWorld(item, point, rotation = 0, trap = null) {
    const d = item.toObject();
    d._id = foundry.utils.randomID();
    d.system = d.system ?? {};
    d.system.modelId = item.id;
    foundry.utils.setProperty(d, "system.carry", { host: "", where: "", x: 0, y: 0, cell: -1 });
    foundry.utils.setProperty(d, "system.values.quantity", 1);
    const payload = { type: "sbePropCreate", sceneId: canvas.scene?.id, center: point, rotation, items: [d], mainId: d._id,
      userId: game.user.id, actorUuid: "", source: null, trap };
    if (isPrimaryGM()) return gmQueue(payload.mainId, () => this.#gmCreate(payload));
    requestGM(payload);
  }

  static async #gmCreate(p) {
    const scene = game.scenes.get(p.sceneId);
    const user = game.users.get(p.userId);
    /* Les objets posés sont relus ici, sur l'objet réel du personnage :
       jamais les données envoyées par le demandeur. Un objet du monde ne
       se pose que par le MJ. */
    const src = p.actorUuid ? await fromUuid(p.actorUuid).catch(() => null) : null;
    let items;
    if (p.actorUuid) {
      const it = src?.items?.get(p.source?.itemId ?? "");
      if (!it || !(user?.isGM || src.testUserPermission(user, "OWNER"))) return this.#msg(p.userId, "SBE.Prop.Failed", "warn");
      items = this.#bundle(it);
      if (p.source.split) {
        items.length = 1;
        items[0]._id = p.mainId;
        foundry.utils.setProperty(items[0], "system.values.quantity", 1);
      }
    } else {
      if (!user?.isGM) return;
      items = p.items ?? [];
    }
    const main = items.find(d => d._id === p.mainId);
    if (!scene || !main) return;
    const cfg = this.cfgOf(main);
    const img = this.imageOf(main, cfg);
    const O = CONST.DOCUMENT_OWNERSHIP_LEVELS;
    /* Qui peut l'utiliser : propriétaire du pion (son delta) ; les autres
       le voient (limité). */
    const ownership = { default: cfg.use === "all" ? O.OWNER : O.LIMITED };
    if (p.userId && !game.users.get(p.userId)?.isGM) ownership[p.userId] = O.OWNER;
    /* Piège : son état (zone choisie à la pose, armé, charges). */
    let flags;
    if (cfg.trOn) {
      const { TrapManager, TRAP_FLAG } = await import("../traps/trap-manager.mjs");
      flags = { [TRAP_FLAG]: TrapManager.initialFlag(cfg, p.trap) };
    }
    const td = await this.createToken({
      scene, center: p.center, rotation: p.rotation, name: main.name, img, cfg, flags,
      items, ownership, prop: { item: p.mainId, owner: p.userId ?? "", actor: p.actorUuid ?? "", user: "" }
    });
    if (!td) return this.#msg(p.userId, "SBE.Prop.Failed", "warn");
    /* L'objet quitte l'inventaire (ou un exemplaire de la pile). */
    if (src) {
      if (p.source.split) {
        const it = src.items.get(p.source.itemId);
        const q = Number(it?.system?.values?.quantity ?? 1) || 1;
        if (it) await it.update({ "system.values.quantity": Math.max(1, q - 1) });
      } else {
        const ids = items.map(d => d._id).filter(id => src.items.get(id));
        if (ids.length) await src.deleteEmbeddedDocuments("Item", ids);
      }
    }
  }

  /**
   * MJ : crée le pion d'un objet posé (seul point de création, pour
   * toutes les sortes : objet de scène, sol, coffre).
   * @param o { scene, center {x,y}, rotation, name, img, cfg (réglages
   *   effectifs : taille, visibilité, nom), items (données), ownership,
   *   prop (contenu de flags.sbe.prop), flags (autres flags sbe) }
   * @returns {Promise<TokenDocument|null>}
   */
  static async createToken(o) {
    const scene = o.scene;
    const base = await this.baseActor();
    if (!scene || !base) return null;
    const cfg = this.cleanCfg(o.cfg ?? {});
    const gs = scene.grid?.size || 100;
    const size = o.size ?? await this.sizeOf(cfg, o.img);
    const M = CONST.TOKEN_DISPLAY_MODES;
    const data = {
      name: o.name, actorId: base.id, actorLink: false,
      texture: { src: o.img || "icons/svg/item-bag.svg" }, width: size.w, height: size.h,
      x: Math.round(o.center.x - (size.w * gs) / 2), y: Math.round(o.center.y - (size.h * gs) / 2),
      rotation: Number(o.rotation) || 0, lockRotation: false,
      alpha: Number.isFinite(Number(o.alpha)) ? Number(o.alpha) : 1,
      hidden: cfg.visibility === "gm",
      disposition: CONST.TOKEN_DISPOSITIONS.NEUTRAL,
      displayName: cfg.showName ? M.HOVER : M.NONE,
      displayBars: M.NONE,
      sight: { enabled: false },
      /* Un objet du monde qui garde un contenu le déballe ici (son arme, son chargeur). */
      delta: { name: o.name, img: o.img, items: unpackContents(o.items ?? []), ownership: o.ownership ?? { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED } },
      flags: { [SYSTEM_ID]: { ...(o.flags ?? {}), [FLAG]: { item: "", owner: "", actor: "", user: "", ...(o.prop ?? {}) } } }
    };
    try {
      const [td] = await scene.createEmbeddedDocuments("Token", [data]);
      return td ?? null;
    } catch (err) {
      console.warn("SBE | Objet posé : pion non créé", err);
      return null;
    }
  }

  /* ============================================================ */
  /*  Reprendre                                                    */
  /* ============================================================ */

  /** Ce joueur peut-il reprendre l'objet ? */
  static canTake(td, user = game.user) {
    if (user.isGM) return true;
    const cfg = this.tokenCfg(td);
    if (cfg.take === "all") return true;
    if (cfg.take === "owner") return this.flagsOf(td).owner === user.id;
    return false;
  }

  /** Ce joueur peut-il utiliser l'objet ? */
  static canUse(td, user = game.user) {
    if (user.isGM) return true;
    const cfg = this.tokenCfg(td);
    return cfg.use === "all" || this.flagsOf(td).owner === user.id;
  }

  static async retrieve(td, actor, { contents = false } = {}) {
    if (!actor) { ui.notifications.warn(L("SBE.Prop.NeedActor")); return; }
    const payload = { type: "sbePropRetrieve", token: td.uuid, actor: actor.uuid, userId: game.user.id, contents };
    if (isPrimaryGM()) return gmQueue(payload.token, () => this.#gmRetrieve(payload));
    requestGM(payload);
  }

  static async #gmRetrieve(p) {
    const td = await fromUuid(p.token).catch(() => null);
    const actor = await fromUuid(p.actor).catch(() => null);
    if (!td || !actor) return;
    /* Un joueur reprend pour un personnage à lui, un objet qu'il a le
       droit de reprendre (réglage « Qui peut le reprendre »), ou un
       piège désamorcé. */
    const user = game.users.get(p.userId);
    if (!user) return;
    if (!user.isGM) {
      if (!actor.testUserPermission(user, "OWNER")) return;
      let ok = this.canTake(td, user);
      if (!ok) {
        const { TrapManager } = await import("../traps/trap-manager.mjs");
        ok = TrapManager.isTrap(td) && !TrapManager.stateOf(td).armed;
      }
      if (!ok) return this.#msg(p.userId, "SBE.Prop.Failed", "warn");
    }
    const mainId = this.flagsOf(td).item;
    /* « Son contenu » : tout sauf l'objet lui-même (qui est détruit). */
    const items = (td.actor?.items?.contents ?? []).map(i => i.toObject())
      .filter(d => !p.contents || d._id !== mainId);
    /* L'objet repris (ou, pour son contenu, ce qu'il portait directement)
       va dans le premier conteneur qui l'accepte (jamais « nulle part »). */
    const top = (d) => (p.contents ? String(d.system?.carry?.host ?? "") === mainId : d._id === mainId);
    for (const d of items) {
      if (!top(d)) continue;
      const tmp = new CONFIG.Item.documentClass(foundry.utils.deepClone(d));
      foundry.utils.setProperty(d, "system.carry", { host: "", where: this.containerKeyFor(actor, tmp), x: 0, y: 0, cell: -1 });
    }
    try {
      if (items.length) await actor.createEmbeddedDocuments("Item", items, { keepId: true });
      await td.delete();
      this.#msg(p.userId, p.contents ? "SBE.Prop.Salvaged" : "SBE.Prop.Retrieved", "info", { name: td.name });
    } catch (err) {
      console.warn("SBE | Objet de scène non repris", err);
      this.#msg(p.userId, "SBE.Prop.Failed", "warn");
    }
  }

  /* ============================================================ */
  /*  Sortir un objet d'un pion posé (sol, coffre) vers une fiche   */
  /* ============================================================ */

  /** Données de glisser d'un objet d'un pion posé (sol, coffre) : l'uuid,
      plus le pion et l'id — retrouvés sans dépendre de l'uuid d'un
      objet de pion non lié. */
  static dragData(item) {
    const td = item?.parent?.isToken ? item.parent.token : null;
    return { type: "Item", uuid: item.uuid, sbeToken: td?.uuid ?? "", sbeItem: item.id };
  }

  /** L'objet d'un glisser (fiche, barre latérale, sol, coffre). */
  static async itemFromDrop(data) {
    if (data?.type !== "Item") return null;
    let item = null;
    if (data.sbeToken && data.sbeItem) {
      const td = await fromUuid(data.sbeToken).catch(() => null);
      item = td?.actor?.items?.get(data.sbeItem) ?? null;
    }
    if (!item && data.uuid) item = await fromUuid(data.uuid).catch(() => null);
    return item;
  }

  /** Cet objet est-il DANS un pion posé de sorte « sol » ou « coffre » ? */
  static isPlacedItem(item) {
    const td = item?.parent?.isToken ? item.parent.token : null;
    return !!(td && this.isPropToken(td) && this.kindOf(td));
  }

  /**
   * Un objet d'un sol ou d'un coffre va dans une fiche (glisser-déposer,
   * Prendre, Donner à…). La quantité se demande ICI (chez celui qui
   * agit) ; le MJ principal fait le déplacement. Un objet qui en
   * contient d'autres part avec tout son contenu.
   * @param o { item, sheetDoc (fiche ou objet porté qui reçoit), key
   *   (contenant visé ; vide = le premier qui l'accepte), qty, at, cell,
   *   notify (clé de message de réussite) }
   * @returns {Promise<boolean>} false = annulé
   */
  static async moveOut({ item, sheetDoc, key = "", qty = null, at = null, cell = -1, notify = "" }) {
    if (!item || !sheetDoc) return false;
    let n = qty;
    if (n === null) {
      const have = isStackableItem(item) ? qtyOf(item) : 1;
      n = 1;
      if (have > 1 && !holdsOthers(item)) {
        n = await askQuantity({ total: have, max: have, name: item.name });
        if (!n) return false;
      }
    }
    const payload = { type: "sbePropOut", item: item.uuid, sheet: sheetDoc.uuid, key, qty: n, at, cell, notify, userId: game.user.id };
    if (isPrimaryGM()) await gmQueue(payload.item, () => this.#gmMoveOut(payload));
    else return requestGM(payload);
    return true;
  }

  static async #gmMoveOut(p) {
    const item = await fromUuid(p.item).catch(() => null);
    const sheet = await fromUuid(p.sheet).catch(() => null);
    const td = item?.parent?.isToken ? item.parent.token : null;
    if (!item || !sheet || !td) return this.#msg(p.userId, "SBE.Ground.Gone", "warn");
    const actor = carrierOf(sheet);
    /* On ne range que dans SA fiche ; un coffre réservé par le MJ ne
       s'ouvre qu'aux joueurs qu'il a autorisés. */
    const user = game.users.get(p.userId);
    if (!user?.isGM) {
      if (!actor?.testUserPermission?.(user, "OWNER")) return this.#msg(p.userId, "SBE.Prop.Failed", "warn");
      const cf = td.flags?.[SYSTEM_ID] ?? {};
      if (cf.lockMode === "mj" && !(Array.isArray(cf.lockAllowed) && cf.lockAllowed.includes(user.id))) {
        return this.#msg(p.userId, "SBE.Chest.LockedByGM", "warn");
      }
    }
    const tmp = new CONFIG.Item.documentClass(foundry.utils.deepClone(item.toObject()));
    let el = null;
    for (const e of walkElements(sheet.system?.template?.system?.elements ?? [])) {
      if ((e?.kind !== "container" && e?.kind !== "slot") || !e.key || isRefList(e)) continue;
      if (p.key ? e.key !== p.key : e.kind !== "container") continue;
      if (slotAccepts(e, tmp, sheet)) { if (p.key) break; continue; }
      el = e; break;
    }
    if (!el || !actor) return this.#msg(p.userId, "SBE.Ground.NoRoom", "warn", { actor: sheet.name, name: item.name });
    try {
      if (holdsOthers(item)) {
        /* Avec son contenu : les ids voyagent, les liens restent. */
        const datas = bundleOf(item);
        const ids = datas.map(d => d._id);
        foundry.utils.setProperty(datas[0], "system.carry", { host: hostIdOf(sheet), where: el.key, x: 0, y: 0, cell: -1 });
        if (datas[0].flags?.[SYSTEM_ID]) delete datas[0].flags[SYSTEM_ID].chestPos;
        await actor.createEmbeddedDocuments("Item", datas, { keepId: true });
        await td.actor.deleteEmbeddedDocuments("Item", ids);
      } else {
        const ok = await dropIntoContainer({ sheetDoc: sheet, el, item, quantity: Number(p.qty) || 1, at: p.at ?? null, cell: Number(p.cell ?? -1), overflow: true });
        if (!ok) return this.#msg(p.userId, "SBE.Ground.NoRoom", "warn", { actor: sheet.name, name: item.name });
      }
    } catch (err) {
      console.warn("SBE | Objet non sorti", err);
      return this.#msg(p.userId, "SBE.Prop.Failed", "warn");
    }
    await this.#kinds.get(this.kindOf(td))?.changed?.(td);
    if (p.notify) this.#msg(p.userId, p.notify, "info", { actor: actor.name, name: item.name, qty: Number(p.qty) || 1 });
  }

  /* ============================================================ */
  /*  Utiliser                                                     */
  /* ============================================================ */

  /** Clé du premier conteneur de la fiche qui accepte l'objet ("" sinon). */
  static containerKeyFor(actor, item) {
    for (const el of walkElements(actor?.system?.template?.system?.elements ?? [])) {
      if (el?.kind !== "container" || !el.key || isRefList(el)) continue;
      if (!slotAccepts(el, item, actor)) return el.key;
    }
    return "";
  }

  /** Le personnage qui interagit : pion contrôlé, sinon personnage du joueur. */
  static interactor() {
    /* Déclencheur (approche, objet glissé) : le personnage qui l'a provoqué. */
    if (this.#forced) return this.#forced;
    const tok = canvas.tokens?.controlled?.find(t => !this.isPropToken(t.document));
    if (tok?.actor) return tok.actor;
    /* Le MJ qui double-clique un objet posé le sélectionne au passage :
       on garde le dernier pion de personnage qu'il avait sélectionné. */
    const last = this.#lastToken && canvas.tokens?.get(this.#lastToken);
    return last?.actor ?? game.user.character ?? null;
  }

  static #tokenOfActor(actor) {
    return canvas.tokens?.controlled?.find(t => t.actor === actor) ?? activeTokenOf(actor);
  }

  /** Assez près ? (bord à bord, en cases ; le MJ l'est toujours) */
  static inRange(td, actor) {
    if (game.user.isGM) return true;
    if (this.#remote.has((td?.document ?? td)?.uuid)) return true;
    const cfg = this.tokenCfg(td);
    if (cfg.range <= 0) return true;
    const tok = this.#tokenOfActor(actor);
    if (!tok) return false;
    const gs = canvas.grid?.size || 100;
    const o = td.object;
    if (!o) return false;
    const dx = Math.max(0, Math.abs(tok.center.x - o.center.x) - (tok.w + o.w) / 2);
    const dy = Math.max(0, Math.abs(tok.center.y - o.center.y) - (tok.h + o.h) / 2);
    return Math.hypot(dx, dy) / gs <= cfg.range + 0.01;
  }

  /** Ouvre le panneau d'un objet posé. */
  /* Panneaux ouverts À DISTANCE par une étape « Scène → Panneau » (uuid du
     pion) : ni la distance ni le panneau qui l'a ouvert ne comptent tant
     qu'il est ouvert. */
  static #remote = new Set();

  /**
   * @param {object} [o]
   * @param {boolean} [o.remote] ouvert par une étape (terminal) : sans
   *   condition de distance, ses boutons non plus, tant qu'il est ouvert
   */
  static async open(td, { remote = false } = {}) {
    const doc = td?.document ?? td;
    const actor = this.interactor();
    /* Une sorte à part (sol, coffre) ouvre sa propre fenêtre. */
    const kind = this.#kinds.get(this.kindOf(doc));
    if (kind) return kind.open?.(doc, actor);
    const item = this.itemOf(doc);
    if (!item) return;
    if (!game.user.isGM) {
      if (!actor) return ui.notifications.warn(L("SBE.Prop.NeedActor"));
      if (!remote && !this.inRange(doc, actor)) return ui.notifications.warn(L("SBE.Prop.TooFar"));
      const cfg = this.tokenCfg(doc);
      const busy = this.flagsOf(doc).user;
      if (cfg.single && busy && busy !== game.user.id && game.users.get(busy)?.active) {
        return ui.notifications.warn(L("SBE.Prop.Busy", { name: game.users.get(busy)?.name ?? "" }));
      }
      if (cfg.single) await this.lock(doc, game.user.id);
    }
    if (remote) this.#remote.add(doc.uuid);
    const existing = this.#panels.get(doc.uuid);
    if (existing) return existing.render({ force: true });
    const { SBEPropPanel } = await import("./prop-panel.mjs");
    const app = new SBEPropPanel({ token: doc });
    this.#panels.set(doc.uuid, app);
    app.addEventListener?.("close", () => {
      this.#panels.delete(doc.uuid);
      if (this.flagsOf(doc).user === game.user.id) this.lock(doc, "");
      this.#remote.delete(doc.uuid);
    }, { once: true });
    return app.render({ force: true });
  }

  /** « Un seul à la fois » : qui l'utilise (vide = libre). */
  static async lock(td, userId) {
    /* « free » : libérer (le champ du demandeur est toujours son identité réelle). */
    const payload = { type: "sbePropLock", token: td.uuid, user: userId, free: !userId };
    if (isPrimaryGM()) return gmQueue(payload.token, () => this.#gmLock(payload));
    requestGM(payload);
  }

  /** Approche déjà déclenchée : par qui (fréquence « une fois »). */
  static async markApproach(td, actorId) {
    const payload = { type: "sbePropApDone", token: td.uuid, actor: actorId ?? "", reset: false };
    if (isPrimaryGM()) return gmQueue(payload.token, () => this.#gmApDone(payload));
    requestGM(payload, { quiet: true });
  }

  /** MJ : réarmer l'approche (tout oublier). */
  static async resetApproach(td) {
    const payload = { type: "sbePropApDone", token: td.uuid, reset: true };
    if (isPrimaryGM()) return gmQueue(payload.token, () => this.#gmApDone(payload));
    requestGM(payload);
  }

  static async #gmApDone(p) {
    const td = await fromUuid(p.token).catch(() => null);
    if (!td) return;
    if (p.reset) return td.setFlag(SYSTEM_ID, `${FLAG}.apDone`, { all: false, actors: [] });
    const cur = this.flagsOf(td).apDone ?? {};
    const actors = new Set(Array.isArray(cur.actors) ? cur.actors : []);
    if (p.actor) actors.add(p.actor);
    await td.setFlag(SYSTEM_ID, `${FLAG}.apDone`, { all: true, actors: [...actors] });
  }

  static async #gmLock(p) {
    const td = await fromUuid(p.token).catch(() => null);
    if (!td) return;
    const user = game.users.get(p._from) ?? game.user;
    const cur = this.flagsOf(td).user ?? "";
    /* Libérer : seulement sa propre prise (ou un MJ). */
    if (p.free) {
      if (cur && (user.isGM || cur === user.id)) await td.setFlag(SYSTEM_ID, `${FLAG}.user`, "");
      return;
    }
    if (cur && cur !== p.user && !user.isGM && game.users.get(cur)?.active) return;
    await td.setFlag(SYSTEM_ID, `${FLAG}.user`, p.user ?? "");
  }

  /** Lance un bouton de l'objet posé, au nom du personnage qui interagit. */
  static async run(td, btnId, preset = null) {
    const item = this.itemOf(td);
    /* Un bouton qui fait viser ou poser sur la carte : le panneau se
       ferme d'abord (il cacherait la carte). */
    const el = [...walkElements(item?.system?.template?.system?.elements ?? [])].find(e => e?.id === btnId);
    /* Blocs compris (une attaque dans un « Si… alors… »). */
    const steps = flatSteps(el?.config?.steps);
    if (steps.some(s => ["attack", "target", "place"].includes(s?.type))) this.#panels.get(td.uuid)?.close({ animate: false });
    const actor = game.user.isGM ? (this.interactor() ?? null) : this.interactor();
    if (!item) return;
    if (!game.user.isGM && !this.canUse(td)) return ui.notifications.warn(L("SBE.Prop.NotYours"));
    if (!game.user.isGM && !this.inRange(td, actor)) return ui.notifications.warn(L("SBE.Prop.TooFar"));
    const { runAction, openActionMenu } = await import("../../builder/item-actions.mjs");
    /* Bouton menu : ses boutons repassent par ici (même personnage). */
    if (el?.config?.action === "menu") return asCarrier(item, actor, () => openActionMenu(item, el, (id) => this.run(td, id)));
    return asCarrier(item, actor, () => runAction(item, btnId, preset));
  }

  /**
   * Ce bouton s'utilise-t-il sur l'objet POSÉ ? « une fois posé », « les
   * deux », ou « auto » quand l'objet est déployable (sinon il reste
   * pour l'inventaire).
   */
  static isPlacedAction(item, el) {
    const w = el?.config?.where ?? "inventory";
    /* « auto » : seulement INSTALLÉ (pas un objet déployable jeté au sol). */
    return w === "placed" || w === "both" || (w === "auto" && this.isPropItem(item) && this.isInstalled(item));
  }

  /** Et dans l'inventaire ? */
  static isInventoryAction(item, el) {
    const w = el?.config?.where ?? "inventory";
    return w === "inventory" || w === "both" || (w === "auto" && !this.isPropItem(item));
  }

  /** L'objet est-il INSTALLÉ (objet de scène posé, pas au sol ni dans un coffre) ? */
  static isInstalled(item) {
    const td = this.placedTokenOf(item);
    return !!td && !this.kindOf(td);
  }

  /** Raison pour laquelle ce bouton n'est pas utilisable LÀ où est l'objet ("" = il l'est). */
  static whereReason(item, el) {
    /* Un objet RANGÉ dans un objet posé (l'arme d'un piège) se sert comme
       en main : c'est l'objet posé qui décide, par ses propres boutons. */
    const placed = !!this.placedTokenOf(item) && !String(item.system?.carry?.host ?? "");
    if (placed && !this.isPlacedAction(item, el)) {
      const w = el?.config?.where ?? "inventory";
      return L(w === "auto" ? "SBE.Prop.OnlyInstalled" : "SBE.Prop.OnlyInventory");
    }
    if (!placed && !this.isInventoryAction(item, el)) return L("SBE.Prop.OnlyPlaced");
    return "";
  }

  /** Les boutons utilisables une fois posé. */
  static async actions(td) {
    const item = this.itemOf(td);
    if (!item) return [];
    const { actionsOf } = await import("../../builder/item-actions.mjs");
    const actor = this.interactor();
    return asCarrier(item, actor, () => actionsOf(item, { outside: false })
      .filter(a => this.isPlacedAction(item, a.el)));
  }

  /* ============================================================ */
  /*  État et PV                                                   */
  /* ============================================================ */

  static async #afterChange(td, item) {
    const cfg = this.cfgOf(item);
    /* Image (état, réglage), taille et visibilité : suivent les réglages. */
    const upd = {};
    /* Accroché à une TUILE du décor : c'est la tuile qui porte l'image
       (celle de l'état, sinon la sienne d'origine) et la taille. */
    const tileId = this.flagsOf(td).tile;
    if (tileId) {
      const { PropTiles } = await import("./prop-tiles.mjs");
      await PropTiles.applyState(td, item, cfg);
    }
    const img = tileId ? null : this.imageOf(item, cfg);
    const size = tileId ? { w: td.width ?? 1, h: td.height ?? 1 } : await this.sizeOf(cfg, img);
    if (img && td.texture?.src !== img) upd["texture.src"] = img;
    if (Math.abs((td.width ?? 1) - size.w) > 0.001 || Math.abs((td.height ?? 1) - size.h) > 0.001) {
      /* Garde le centre. */
      const gs = td.parent?.grid?.size || 100;
      const cx = td.x + ((td.width ?? 1) * gs) / 2, cy = td.y + ((td.height ?? 1) * gs) / 2;
      Object.assign(upd, { width: size.w, height: size.h, x: Math.round(cx - (size.w * gs) / 2), y: Math.round(cy - (size.h * gs) / 2) });
    }
    if (!!td.hidden !== (cfg.visibility === "gm")) upd.hidden = cfg.visibility === "gm";
    const dn = cfg.showName ? CONST.TOKEN_DISPLAY_MODES.HOVER : CONST.TOKEN_DISPLAY_MODES.NONE;
    if (td.displayName !== dn) upd.displayName = dn;
    if (Object.keys(upd).length) await td.update(upd);
    /* PV à zéro : détruit, ou au sol cassé. */
    if (cfg.hpKey) {
      const hp = Number(item.system?.values?.[cfg.hpKey]);
      if (Number.isFinite(hp) && hp <= 0) {
        if (cfg.onZero === "ground") {
          const { GroundItems } = await import("../ground/ground-items.mjs");
          const d = item.toObject();
          delete d._id;
          foundry.utils.setProperty(d, "system.carry", { host: "", where: "", x: 0, y: 0, cell: -1 });
          const c = td.object?.center ?? { x: td.x, y: td.y };
          await GroundItems.drop(d, 1, { x: c.x, y: c.y });
        }
        await td.delete();
      }
    }
  }

  /** Les pions de toutes les scènes posés depuis cet objet du monde. */
  static async refreshCopies(model) {
    for (const scene of game.scenes ?? []) {
      for (const td of scene.tokens) {
        if (!this.isPropToken(td)) continue;
        const it = this.itemOf(td);
        if (it?.system?.modelId === model.id) await this.#afterChange(td, it);
      }
    }
  }

  /** Re-applique les réglages à un pion (après l'onglet « Scène » d'une copie). */
  static async refreshToken(td) {
    const it = this.itemOf(td);
    if (it && isPrimaryGM()) await this.#afterChange(td, it);
  }

  static #msg(userId, key, level = "info", data = null) {
    if (!userId || userId === game.user.id) return ui.notifications[level](L(key, data));
    emitSocket({ type: "sbePropMsg", userId, key, level, data });
  }
}
