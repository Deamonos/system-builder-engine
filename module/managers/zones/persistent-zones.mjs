/**
 * SBE — ZONES PERSISTANTES (palier 1)
 *
 * Une zone persistante est une RÉGION de Foundry (v14) qui porte un
 * comportement propre à SBE (« zone ») : tant qu'elle existe, elle
 * DONNE et RETIRE des effets du gestionnaire (ou de l'objet) à ceux qui
 * sont dedans. Elle ne fait rien d'autre : les dégâts, soins, malus
 * vivent dans l'EFFET (une seule source de vérité).
 *
 * Tout se règle sur l'OBJET DU MONDE, onglet « Zone » (item-zone-tab) :
 *   on        laisse une zone persistante
 *   nature    clé (règle des clés) : feu, eau, fumee… OBLIGATOIRE —
 *             c'est elle que comparent exclusions et chevauchement
 *   trigger   "attack" (chaque attaque de l'objet) | "button:<clé>"
 *   outcome   issue du jet du bouton (boutons seulement)
 *   shape     { kind: circle|cone|line|template, radius, length,
 *               angle, width, template, scale }  (en cases / degrés)
 *   position  impact | target | attachSelf | attachTarget
 *   rounds    durée en combat (0 = sans limite)
 *   minutes   durée en temps de jeu (0 = sans limite) — les deux
 *             horloges partent de la création, la première à 0 arrête
 *   every     hors combat, la zone frappe toutes les N secondes
 *   touch     all | notSelf | allies | alliesNotSelf | enemies
 *   effects   [{ id, key, combat, calm, action: apply|add, leave, onlyIf }]
 *             combat : ce qui se passe EN COMBAT ; calm : HORS COMBAT —
 *               none (rien) | enter (en entrant) | tick (à chaque tour
 *               dedans ; hors combat : toutes les N secondes) | both
 *               (en entrant, puis à chaque tour)
 *             leave : l'effet est retiré quand on sort de la zone (fumée) ;
 *               sinon il garde sa propre durée (brûlure)
 *   power     formule (lue sur l'objet à la pose) : la puissance
 *   endPower  % de la puissance qui reste à la fin (100 = ne faiblit pas) ;
 *             la baisse est régulière sur la durée (rounds ou minutes)
 *   shrink    la taille baisse avec la puissance (zones non attachées)
 *   excludes  natures exclues (« eau » pour un feu) : jamais deux zones
 *             opposées au même endroit
 *   weaker    face à une zone exclue plus forte : none | weaken
 *   tie       à puissance égale : both (les deux disparaissent) | new | old
 *   overlap   deux zones de même nature qui se touchent : once (une seule
 *             frappe) | each (chacune frappe) | merge (elles fusionnent)
 *   mergePower  fusion : max | sum | avg | capped (somme plafonnée à mergeCap)
 *   mergeTime   fusion : longest (le plus long reste) | reset | add
 *   mergeLook   fusion : each (chaque morceau garde son image) | stretch
 *               (une seule image étirée sur l'ensemble)
 *   color     couleur de la Région sur la scène (la carte n'a pas de thème
 *             clair / sombre : une seule couleur)
 *   look      { media: [fichiers], opacity, sound: {src, volume},
 *               startSound: {src, volume} }  (onglet Médias de l'objet)
 *   light     { on, color, dim, bright (cases), animation, speed, intensity }
 *   blockSight  un pion dedans est caché à ceux qui ne le possèdent pas
 *   announce  none | tooltip | chat | both
 *   repeat    entrées répétées : each (à chaque passage) | round (une fois
 *             par round, ou par intervalle hors combat)
 *   trace     trace au sol (zone-trace) : à la fin de la zone et / ou à
 *             l'impact — l'impact marche aussi sans zone cochée
 *
 * Les EXEMPLAIRES suivent leur modèle (objet du monde) : la zone se lit
 * sur le modèle, comme les effets propres.
 *
 * Écritures : la Région et ses comportements ne peuvent être créés que
 * par un MJ (règle de Foundry) — un joueur en fait la DEMANDE au MJ
 * principal. Les événements de Région arrivent chez tous les clients :
 * seul le MJ actif agit (un seul écrivain).
 *
 * Événements NATIFS (aucune minuterie permanente) :
 *   tokenEnter / tokenExit         entrée, sortie (et apparition)
 *   tokenTurnStart / tokenTurnEnd  début, fin du tour d'un pion dedans
 * Hors combat : l'avancée du temps de jeu (updateWorldTime) fait frapper
 * les moments « début / fin de tour » toutes les N secondes, et éteint
 * la zone à la fin de sa durée.
 */

import { activeTokenOf, TOUCH_MODES, touchesBy } from "../../helpers/canvas-utils.mjs";
import { PropManager } from "../props/prop-manager.mjs";
import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { onSocketMessage, emitSocket, isPrimaryGM, requestGM } from "../../helpers/socket.mjs";
import { KEY_RE } from "../../builder/element-renderer.mjs";
import { evalExpression, formulaValue } from "../../builder/formula-engine.mjs";
import { docScope } from "../../builder/doc-context.mjs";
import { carrierOf } from "../../builder/inventory.mjs";
import { EffectManager, isNewRound } from "../effects/effect-manager.mjs";
import { CombatManager } from "../combat/combat-manager.mjs";
import { ZoneShapes } from "./zone-shapes.mjs";
import { ZoneLook, boundsOf } from "./zone-look.mjs";
import { ZoneTrace, cleanTrace, traceActive } from "./zone-trace.mjs";
import { circleShape, coneShape, lineShape, placeShape, snapAngle, pointInPoly, DEFAULT_COLOR } from "./zone-geom.mjs";

export const ZONE_SHAPES = ["circle", "cone", "line", "template"];
export const ZONE_POSITIONS = ["impact", "target", "attachSelf", "attachTarget"];
/* Qui est touché : la règle commune (helpers/canvas-utils). */
export const ZONE_TOUCH = TOUCH_MODES;
/** Ce qui se passe, en combat comme hors combat. */
export const ZONE_WHEN = ["enter", "tick", "both", "none"];
const WHEN_ENTER = new Set(["enter", "both"]);
const WHEN_TICK = new Set(["tick", "both"]);

/**
 * Une ligne d'effet propre. L'ancien format (« when » : enter, turnStart,
 * turnEnd, inside, et la case de l'effet « retiré en sortant ») est
 * converti : tant qu'il est dedans = en entrant + retiré en sortant.
 */
function cleanZoneLine(e) {
  const key = str(e?.key);
  if (e && ("combat" in e || "calm" in e)) {
    return {
      id: str(e.id) || foundry.utils.randomID(), key,
      combat: ZONE_WHEN.includes(e.combat) ? e.combat : "enter",
      calm: ZONE_WHEN.includes(e.calm) ? e.calm : "enter",
      action: ZONE_ACTIONS.includes(e.action) ? e.action : "apply",
      leave: !!e.leave,
      onlyIf: str(e.onlyIf)
    };
  }
  const old = str(e?.when) || "enter";
  const w = old === "turnStart" || old === "turnEnd" ? "tick" : "enter";
  let defLeave = false;
  try { defLeave = !!EffectManager.getDef(key)?.zoneLeave; } catch (_e) { defLeave = false; }
  return {
    id: str(e?.id) || foundry.utils.randomID(), key,
    combat: w, calm: w,
    action: old === "inside" ? "apply" : (ZONE_ACTIONS.includes(e?.action) ? e.action : "apply"),
    leave: old === "inside" || defLeave,
    onlyIf: str(e?.onlyIf)
  };
}
export const ZONE_ACTIONS = ["apply", "add"];
export const ZONE_OUTCOMES = ["any", "success", "failure", "critSuccess", "critFailure"];
export const ZONE_WEAKER = ["none", "weaken"];
export const ZONE_TIE = ["both", "new", "old"];
export const ZONE_OVERLAP = ["once", "each", "merge"];
export const ZONE_MERGE_POWER = ["max", "sum", "avg", "capped"];
export const ZONE_MERGE_TIME = ["longest", "reset", "add"];
/** Fusion : chaque morceau garde son image, ou une seule image étirée. */
export const ZONE_MERGE_LOOK = ["each", "stretch"];
export const ZONE_ANNOUNCE = ["tooltip", "chat", "both", "none"];
export const ZONE_REPEAT = ["round", "each"];

/** Une liste de natures (« eau, glace ») → clés propres. */
export function natureList(raw) {
  const arr = Array.isArray(raw) ? raw : String(raw ?? "").split(/[\s,;]+/);
  return [...new Set(arr.map(x => String(x ?? "").trim().toLowerCase()).filter(x => KEY_RE.test(x)))];
}

/** Le type de comportement de Région déclaré par SBE (system.json). */
export const BEHAVIOR_TYPE = "zone";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const str = (v) => String(v ?? "").trim();
const num = (v, d = 0, min = 0) => (Number.isFinite(Number(v)) ? Math.max(min, Number(v)) : d);

/** Durée d'un round en secondes de jeu (réglage de Foundry). */
function roundSeconds() {
  return Math.max(1, Number(CONFIG.time?.roundTime) || 6);
}

/** Réglage de zone d'un objet, toujours propre. */
export function cleanZone(z) {
  const s = z?.shape ?? {};
  const nature = str(z?.nature).toLowerCase();
  const trigger = str(z?.trigger);
  return {
    on: !!z?.on,
    nature: KEY_RE.test(nature) ? nature : "",
    /* Brouillon : ce qui est saisi, même mal formé (pour l'avertir). */
    natureRaw: str(z?.natureRaw ?? z?.nature),
    trigger: trigger.startsWith("button:") ? trigger : "attack",
    outcome: ZONE_OUTCOMES.includes(z?.outcome) ? z.outcome : "any",
    shape: {
      kind: ZONE_SHAPES.includes(s.kind) ? s.kind : "circle",
      radius: num(s.radius, 2),
      length: num(s.length, 3),
      angle: Math.min(179, num(s.angle, 90, 1)),
      width: num(s.width, 1),
      template: str(s.template),
      scale: num(s.scale, 1) || 1
    },
    position: ZONE_POSITIONS.includes(z?.position) ? z.position : "impact",
    rounds: Math.floor(num(z?.rounds, 3)),
    minutes: num(z?.minutes, 1),
    every: Math.max(1, Math.floor(num(z?.every, roundSeconds()))),
    touch: ZONE_TOUCH.includes(z?.touch) ? z.touch : "all",
    power: str(z?.power) || "1",
    endPower: Math.min(100, num(z?.endPower, 100)),
    shrink: !!z?.shrink,
    excludes: natureList(z?.excludes),
    weaker: ZONE_WEAKER.includes(z?.weaker) ? z.weaker : "none",
    tie: ZONE_TIE.includes(z?.tie) ? z.tie : "both",
    overlap: ZONE_OVERLAP.includes(z?.overlap) ? z.overlap : "once",
    repeat: ZONE_REPEAT.includes(z?.repeat) ? z.repeat : "round",
    mergePower: ZONE_MERGE_POWER.includes(z?.mergePower) ? z.mergePower : "max",
    mergeCap: str(z?.mergeCap),
    mergeTime: ZONE_MERGE_TIME.includes(z?.mergeTime) ? z.mergeTime : "longest",
    mergeLook: ZONE_MERGE_LOOK.includes(z?.mergeLook) ? z.mergeLook : "each",
    color: /^#[0-9a-f]{6}$/i.test(str(z?.color)) ? str(z.color).toLowerCase() : "",
    look: {
      media: (Array.isArray(z?.look?.media) ? z.look.media : []).map(str).filter(Boolean),
      opacity: Math.min(100, num(z?.look?.opacity, 80)),
      sound: { src: str(z?.look?.sound?.src), volume: Math.min(100, num(z?.look?.sound?.volume, 60)) },
      startSound: { src: str(z?.look?.startSound?.src), volume: Math.min(100, num(z?.look?.startSound?.volume, 80)) }
    },
    light: {
      on: !!z?.light?.on,
      color: /^#[0-9a-f]{6}$/i.test(str(z?.light?.color)) ? str(z.light.color).toLowerCase() : "#ff9a3c",
      dim: num(z?.light?.dim, 4),
      bright: num(z?.light?.bright, 2),
      animation: str(z?.light?.animation),
      speed: Math.min(10, num(z?.light?.speed, 5)),
      intensity: Math.min(10, num(z?.light?.intensity, 5))
    },
    blockSight: !!z?.blockSight,
    /* Aura (attachée au lanceur) : le lanceur perd un effet qu'elle lui
       avait donné → elle disparaît. */
    endWithEffect: !!z?.endWithEffect,
    announce: ZONE_ANNOUNCE.includes(z?.announce) ? z.announce : "tooltip",
    trace: cleanTrace(z?.trace),
    effects: (Array.isArray(z?.effects) ? z.effects : []).map(cleanZoneLine)
  };
}

/**
 * L'objet qui PORTE le réglage de zone : le modèle (objet du monde)
 * pour un exemplaire, sinon l'objet lui-même.
 */
export function zoneHolder(item) {
  if (!item) return null;
  const model = item.system?.modelId ? game.items?.get?.(item.system.modelId) : null;
  return model && model !== item ? model : item;
}

export function zoneOf(item) {
  return cleanZone(zoneHolder(item)?.flags?.[SYSTEM_ID]?.zone);
}

/**
 * Ce combat se joue-t-il sur cette scène ? Une rencontre de Foundry
 * n'est pas toujours liée à une scène (combat.scene vide) : on regarde
 * alors la scène de ses combattants.
 */
function combatOn(combat, scene) {
  if (!combat || !scene) return false;
  if (combat.scene) return combat.scene.id === scene.id;
  return (combat.combatants?.contents ?? []).some(c => (c.sceneId ?? c.token?.parent?.id) === scene.id);
}

/** Le pion d'un acteur sur la scène affichée. */
function tokenOfActor(actor) {
  if (!actor) return null;
  try { return CombatManager.tokenOf(actor); } catch (_e) { return activeTokenOf(actor); }
}

/* ============================================================ */
/*  Le comportement de Région « Zone SBE »                       */
/* ============================================================ */

const RegionBehaviorType = foundry.data.regionBehaviors.RegionBehaviorType;

export class SBEZoneBehavior extends RegionBehaviorType {

  /* Tout le réglage vit sur la Région (drapeaux) : copié de l'objet à la
     création, la zone continue même si l'objet a été consommé. */
  static defineSchema() {
    return {};
  }

  static async #onEnter(event) {
    if (!game.user.isActiveGM) return;
    const token = event.data?.token;
    if (token) await PersistentZones.hit(this.region, token, "enter");
  }

  static async #onExit(event) {
    if (!game.user.isActiveGM) return;
    const token = event.data?.token;
    if (token) await PersistentZones.leave(this.region, token);
  }

  static async #onTurnStart(event) {
    if (!game.user.isActiveGM) return;
    const token = event.data?.token;
    if (token) await PersistentZones.hit(this.region, token, "turnStart");
  }

  static async #onTurnEnd(event) {
    if (!game.user.isActiveGM) return;
    const token = event.data?.token;
    if (token) await PersistentZones.hit(this.region, token, "turnEnd");
  }

  static events = {
    [CONST.REGION_EVENTS.TOKEN_ENTER]: this.#onEnter,
    [CONST.REGION_EVENTS.TOKEN_EXIT]: this.#onExit,
    [CONST.REGION_EVENTS.TOKEN_TURN_START]: this.#onTurnStart,
    [CONST.REGION_EVENTS.TOKEN_TURN_END]: this.#onTurnEnd
  };
}

/* ============================================================ */
/*  Le manager                                                   */
/* ============================================================ */

export class PersistentZones {

  static _bound = false;
  /** Écritures d'une même Région, une à la fois (pas de mise à jour perdue). */
  static #queue = new Map();

  static init() {
    if (this._bound) return;
    this._bound = true;

    /* L'apparence (tuile, lumière, son, vue, annonce). */
    ZoneLook.init({ ratioOf: (zf, t) => this.ratioOf(zf, t), remainingOf: (zf) => this.#remaining(zf) });
    /* Les traces au sol. */
    ZoneTrace.init();

    /* Demande d'un joueur : le MJ principal crée la Région. */
    onSocketMessage(async (p) => {
      if (p?.type === "sbeZoneNotice" && p.user === game.user.id) { ui.notifications.info(p.text); return; }
      if (p?.type !== "sbeZoneCreate" || !isPrimaryGM()) return;
      const data = this.#fromPlayer(p.data, p._from);
      if (data) await this.#create(p.sceneId, data, p.user);
    });

    /* Rounds : chaque nouveau round compte pour les zones de la scène
       du combat ; une zone arrivée au bout disparaît. */
    Hooks.on("updateCombat", (combat, changed) => {
      if (!isPrimaryGM() || !isNewRound(combat, changed)) return;
      this.#onNewRound(combat).catch(err => console.warn("SBE | Zones : décompte des rounds en échec", err));
    });

    /* Temps de jeu : hors combat, les zones frappent à leur rythme et
       s'éteignent à la fin de leur durée. */
    Hooks.on("updateWorldTime", (worldTime) => {
      if (!isPrimaryGM()) return;
      this.#onTime(worldTime).catch(err => console.warn("SBE | Zones : temps de jeu en échec", err));
    });

    /* Zone effacée (fin de durée ou MJ) : ceux qui étaient dedans en
       sortent — effets « tant qu'il est dedans » et « retiré en sortant »
       enlevés. */
    Hooks.on("deleteRegion", (region) => {
      if (!isPrimaryGM() || !this.isZone(region)) return;
      this.#onDeleted(region).catch(err => console.warn("SBE | Zones : nettoyage en échec", err));
    });

    /* Aura « retirée avec son effet » : le lanceur perd un effet que sa
       zone attachée lui avait donné (retiré à la main, fin de durée…). */
    Hooks.on("deleteActiveEffect", (ae) => {
      const actor = ae?.parent;
      const key = ae?.flags?.[SYSTEM_ID]?.key ?? "";
      if (!isPrimaryGM() || actor?.documentName !== "Actor" || !key) return;
      this.#endWithEffect(actor, key).catch(err => console.warn("SBE | Zones : retrait de l'aura en échec", err));
    });
  }

  /** Les auras de ce lanceur réglées « retirée avec son effet » qui lui avaient donné cet effet. */
  static async #endWithEffect(actor, key) {
    for (const scene of game.scenes ?? []) {
      for (const r of this.zonesOf(scene)) {
        const zf = this.#flags(r);
        if (!zf?.cfg?.endWithEffect || !zf.attached || zf.cfg.position !== "attachSelf") continue;
        if (zf.caster?.actorUuid !== actor.uuid) continue;
        if (!(zf.given?.[zf.caster.tokenId] ?? []).includes(key)) continue;
        if (this.#alive(r)) await this.#expire(r);
      }
    }
  }

  /** Cette Région est-elle une zone SBE ? */
  static isZone(region) {
    return !!region?.flags?.[SYSTEM_ID]?.zone?.cfg;
  }

  /** Les zones SBE d'une scène. */
  static zonesOf(scene) {
    return (scene?.regions?.contents ?? []).filter(r => this.isZone(r));
  }

  /* ---------------------------------------------------------- */
  /*  Pose                                                       */
  /* ---------------------------------------------------------- */

  /** Après l'étape « Attaquer » d'un objet (res = son résultat). */
  static async afterAttack(item, res) {
    try {
      const z = zoneOf(item);
      if (z.trigger !== "attack") return;
      await this.#fire(item, z, res);
    } catch (err) {
      console.warn("SBE | Zones : pose après l'attaque en échec", err);
    }
  }

  /** Après un bouton de l'objet (res = résultat de ses étapes). */
  static async afterButton(item, btnKey, res) {
    try {
      const z = zoneOf(item);
      if (z.trigger !== `button:${btnKey}`) return;
      if (z.outcome !== "any" && z.outcome !== res?.outcome) return;
      await this.#fire(item, z, res);
    } catch (err) {
      console.warn("SBE | Zones : pose après le bouton en échec", err);
    }
  }

  /** La zone (et sa trace d'impact) — ou la trace seule, sans zone. */
  static async #fire(item, z, res) {
    const ctx = { point: res?.point ?? null, targets: res?.targets ?? [] };
    if (z.on) return this.#request(item, z, ctx);
    if (traceActive(z)) return this.#traceOnly(item, z, ctx);
  }

  /** Trace d'impact d'un objet qui ne laisse pas de zone (taille fixe). */
  static async #traceOnly(item, cfg, { point, targets }) {
    if (!canvas?.ready || !canvas.scene || !cfg.trace.media.length) return;
    const carrier = carrierOf(item);
    /* Un objet posé : la zone part de son pion. */
    const casterTok = PropManager.placedTokenOf(item)?.object ?? tokenOfActor(carrier);
    const targetTok = tokenOfActor((targets ?? []).find(Boolean) ?? null);
    const at = cfg.position === "target" || cfg.position === "attachTarget"
      ? (targetTok?.center ?? point) : cfg.position === "attachSelf" ? casterTok?.center : (point ?? targetTok?.center);
    const center = at ?? casterTok?.center;
    if (!center) return;
    await ZoneTrace.place(canvas.scene, ZoneTrace.build(canvas.scene, { ...cfg.trace, size: "fixed" }, null, center));
  }

  /** La forme réglée sur l'objet (morceaux en cases). */
  static #shapeOf(cfg) {
    const s = cfg.shape;
    if (s.kind === "template") {
      const norm = (x) => String(x ?? "").trim().toLowerCase();
      return ZoneShapes.list().find(t => norm(t.name) === norm(s.template)) ?? null;
    }
    if (s.kind === "cone") return s.length > 0 ? { ...coneShape(s.length, s.angle), color: DEFAULT_COLOR } : null;
    if (s.kind === "line") return s.length > 0 ? { ...lineShape(s.length, s.width), color: DEFAULT_COLOR } : null;
    return s.radius > 0 ? { ...circleShape(s.radius), color: DEFAULT_COLOR } : null;
  }

  /**
   * Calcule la Région (chez celui qui agit : il voit la scène) puis la
   * crée — ou la demande au MJ principal.
   */
  static async #request(item, cfg, { point, targets }) {
    if (!cfg.nature) { ui.notifications.warn(L("SBE.PZone.NoNatureWarn", { name: item?.name ?? "" })); return; }
    if (!canvas?.ready || !canvas.scene) return;
    if (!game.users.activeGM) { ui.notifications.warn(L("SBE.PZone.NoGM")); return; }
    const shape = this.#shapeOf(cfg);
    if (!shape) { ui.notifications.warn(L("SBE.PZone.NoShape", { name: item?.name ?? "" })); return; }

    const carrier = carrierOf(item);
    /* Un objet posé : la zone part de son pion. */
    const casterTok = PropManager.placedTokenOf(item)?.object ?? tokenOfActor(carrier);
    const targetActor = (targets ?? []).find(Boolean) ?? null;
    const targetTok = tokenOfActor(targetActor);
    const cell = canvas.dimensions?.size || 100;

    /* Où, et vers où. */
    let origin = null, attach = null;
    if (cfg.position === "attachSelf") { origin = casterTok?.center; attach = casterTok; }
    else if (cfg.position === "attachTarget") { origin = targetTok?.center; attach = targetTok; }
    else if (cfg.position === "target") origin = targetTok?.center ?? point;
    else origin = point ?? targetTok?.center;
    origin ??= casterTok?.center ?? null;
    if (!origin) { ui.notifications.warn(L("SBE.PZone.NoPlace")); return; }
    /* Une forme qui part du tireur (cône, ligne) part de lui, tournée
       vers le point visé. */
    const aimAt = point ?? targetTok?.center ?? null;
    let angle = 0;
    if (shape.anchor === "self" && casterTok && !attach) {
      origin = { ...casterTok.center };
    }
    if (casterTok && aimAt && (aimAt.x !== casterTok.center.x || aimAt.y !== casterTok.center.y)) {
      angle = Math.atan2(aimAt.y - casterTok.center.y, aimAt.x - casterTok.center.x);
    }
    angle = snapAngle(angle, shape.rotate ?? "free");

    const placed = placeShape(shape, origin, angle, cell, cfg.shape.scale);
    if (!placed.length) { ui.notifications.warn(L("SBE.PZone.NoShape", { name: item?.name ?? "" })); return; }
    const walls = shape.walls || CombatManager.getConfig().walls || "none";
    const shapes = placed.map(pl => ({
      type: "polygon",
      points: pl.pts.flatMap(([x, y]) => [Math.round(x), Math.round(y)]),
      origin: { x: Math.round(origin.x), y: Math.round(origin.y) },
      hole: false
    }));
    const lvl = (attach ?? casterTok)?.document?._source?.level;

    /* Trace d'impact : elle reste même si la zone est refusée (zone
       opposée plus forte) — l'explosion, elle, a bien eu lieu. */
    if (cfg.trace.atImpact && cfg.trace.media.length) {
      const b = boundsOf(shapes);
      await ZoneTrace.place(canvas.scene, ZoneTrace.build(canvas.scene, cfg.trace, b, b ? { x: b.cx, y: b.cy } : origin))
        .catch(err => console.warn("SBE | Traces : trace d'impact en échec", err));
    }

    /* Effets propres à l'objet utilisés par la zone : une copie voyage
       avec elle (l'objet peut être consommé juste après). */
    const ownKeys = new Set(cfg.effects.map(e => e.key).filter(k => k.startsWith("obj_")));
    const localDefs = ownKeys.size ? EffectManager.localDefsOf(item).filter(d => ownKeys.has(d.key)) : [];

    const combat = game.combat?.started && combatOn(game.combat, canvas.scene) ? game.combat : null;
    /* Puissance : la formule de l'objet, calculée à la pose (dés permis). */
    let power = 1;
    try {
      const v = Number((await formulaValue(cfg.power, docScope(item))).value);
      power = Number.isFinite(v) ? Math.max(0, v) : 1;
    } catch (_e) { power = 1; }
    let mergeCap = Infinity;
    if (cfg.overlap === "merge" && cfg.mergePower === "capped" && cfg.mergeCap) {
      try {
        const v = Number((await formulaValue(cfg.mergeCap, docScope(item))).value);
        if (Number.isFinite(v)) mergeCap = Math.max(0, v);
      } catch (_e) { /* pas de plafond */ }
    }
    const data = {
      name: `${item?.name ?? L("SBE.PZone.Zone")}`,
      color: cfg.color || shape.color || DEFAULT_COLOR,
      shapes,
      /* Zone avec image ou vidéo : pas de hachures de Foundry par-dessus,
         seulement son contour (dessiné par ZoneLook) ; visible en entier
         dans l'outil Régions du MJ. Sans image : la Région se voit. */
      visibility: cfg.look?.media?.length ? CONST.REGION_VISIBILITY.LAYER : CONST.REGION_VISIBILITY.ALWAYS,
      highlightMode: canvas.grid?.isGridless ? "shapes" : "coverage",
      restriction: { enabled: walls !== "none", type: walls === "sight" ? "sight" : "move", priority: 0 },
      attachment: { token: attach?.document?.id ?? null },
      ...(lvl ? { levels: [lvl] } : {}),
      behaviors: [{ type: BEHAVIOR_TYPE, name: L("SBE.PZone.BehaviorName"), system: {} }],
      flags: {
        [SYSTEM_ID]: {
          zone: {
            cfg: (({ natureRaw, ...rest }) => rest)(cfg),
            item: { name: item?.name ?? "", img: item?.img ?? "", uuid: item?.uuid ?? "" },
            localDefs: localDefs.map(d => ({ ...d })),
            caster: {
              tokenId: casterTok?.document?.id ?? "",
              actorUuid: carrier?.uuid ?? "",
              disposition: casterTok?.document?.disposition ?? CONST.TOKEN_DISPOSITIONS.NEUTRAL
            },
            created: { time: game.time.worldTime, combatId: combat?.id ?? "", round: combat?.round ?? 0 },
            roundsDone: 0,
            lastTick: game.time.worldTime,
            power, powerLoss: 0,
            mergeCap: Number.isFinite(mergeCap) ? mergeCap : null,
            /* Forme d'origine : la zone qui rétrécit part d'elle. */
            baseShapes: shapes,
            attached: !!attach,
            given: {},
            hits: {}
          }
        }
      }
    };

    if (game.user.isGM) return this.#create(canvas.scene.id, data, game.user.id);
    requestGM({ type: "sbeZoneCreate", sceneId: canvas.scene.id, data, user: game.user.id });
  }

  /** Prévient celui qui a lancé l'objet (lui-même, ou par socket). */
  static #notice(userId, text) {
    if (!userId || userId === game.user.id) ui.notifications.info(text);
    else emitSocket({ type: "sbeZoneNotice", user: userId, text });
  }

  /**
   * Zone demandée par un JOUEUR : lancée par un personnage à lui, avec
   * le seul comportement « zone » de SBE (aucun autre comportement de
   * Région — script, téléportation… — ne passe par cette porte).
   */
  static #fromPlayer(data, userId) {
    const user = game.users.get(userId);
    if (!data || typeof data !== "object" || !user) return null;
    if (user.isGM) return data;
    const zf = data.flags?.[SYSTEM_ID]?.zone;
    let caster = null;
    try { caster = zf?.caster?.actorUuid ? fromUuidSync(zf.caster.actorUuid) : null; } catch (_e) { caster = null; }
    if (!zf?.cfg || !caster?.testUserPermission?.(user, "OWNER")) return null;
    return {
      ...data,
      behaviors: [{ type: BEHAVIOR_TYPE, name: L("SBE.PZone.BehaviorName"), system: {} }],
      flags: { [SYSTEM_ID]: { zone: zf } }
    };
  }

  /** Création de la Région (MJ) — après les exclusions entre natures. */
  static async #create(sceneId, data, userId = null) {
    const scene = game.scenes?.get(sceneId);
    if (!scene || !data) return null;
    const zf = data.flags?.[SYSTEM_ID]?.zone;
    if (zf && !(await this.#resolveExclusions(scene, data, zf, userId))) return null;
    if (zf && (await this.#tryMerge(scene, data, zf, userId))) return null;
    try {
      const [region] = await scene.createEmbeddedDocuments("Region", [data]);
      if (region) await ZoneLook.spawn(region).catch(err => console.warn("SBE | Zones : apparence en échec", err));
      return region ?? null;
    } catch (err) {
      console.warn("SBE | Zones : création de la Région en échec", err);
      ui.notifications.error(L("SBE.PZone.CreateFailed"));
      return null;
    }
  }

  /* ---------------------------------------------------------- */
  /*  Puissance et exclusions                                    */
  /* ---------------------------------------------------------- */

  /** Où en est la zone de sa vie : 0 (apparition) → 1 (fin). */
  static #progress(zf, worldTime = game.time.worldTime) {
    const c = zf.cfg ?? {};
    const byRounds = c.rounds > 0 ? (Number(zf.roundsDone) || 0) / c.rounds : 0;
    const byTime = c.minutes > 0 ? (worldTime - (Number(zf.created?.time) || 0)) / (c.minutes * 60) : 0;
    return Math.max(0, Math.min(1, Math.max(byRounds, byTime)));
  }

  /** Part de la puissance qui reste (100 % → « puissance à la fin »). */
  static ratioOf(zf, worldTime) {
    const end = Math.min(100, Math.max(0, Number(zf?.cfg?.endPower ?? 100))) / 100;
    return 1 - (1 - end) * this.#progress(zf, worldTime);
  }

  /** La puissance d'une zone, maintenant. */
  static powerOf(region, worldTime) {
    const zf = this.#flags(region);
    if (!zf) return 0;
    return Math.max(0, (Number(zf.power) || 0) * this.ratioOf(zf, worldTime) - (Number(zf.powerLoss) || 0));
  }

  /** Les points d'un polygone de Région → [[x, y], …]. */
  static #pts(shape) {
    const p = Array.isArray(shape?.points) ? shape.points : [];
    const out = [];
    for (let i = 0; i + 1 < p.length; i += 2) out.push([p[i], p[i + 1]]);
    return out;
  }

  /** La nouvelle zone (ses polygones) touche-t-elle cette Région ? */
  static #overlaps(shapes, region) {
    const mine = shapes.map(sh => this.#pts(sh)).filter(p => p.length >= 3);
    const theirs = (region.shapes ?? []).map(sh => this.#pts(sh)).filter(p => p.length >= 3);
    const inRegion = (x, y) => {
      try { return !!region.polygonTree?.testPoint({ x, y }); } catch (_e) { return theirs.some(p => pointInPoly(x, y, p)); }
    };
    for (const poly of mine) {
      const cx = poly.reduce((a, q) => a + q[0], 0) / poly.length, cy = poly.reduce((a, q) => a + q[1], 0) / poly.length;
      if (inRegion(cx, cy) || poly.some(([x, y]) => inRegion(x, y))) return true;
    }
    for (const poly of theirs) {
      if (poly.some(([x, y]) => mine.some(m => pointInPoly(x, y, m)))) return true;
    }
    /* Deux formes qui se croisent par les bords (en X) sans qu'aucun coin
       n'entre dans l'autre : un bord de l'une coupe un bord de l'autre. */
    for (const a of mine) for (const b of theirs) if (this.#edgesCross(a, b)) return true;
    return false;
  }

  /** Un bord du polygone a coupe-t-il un bord du polygone b ? */
  static #edgesCross(a, b) {
    const side = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    const cross = (p1, p2, p3, p4) => {
      const d1 = side(p3, p4, p1), d2 = side(p3, p4, p2), d3 = side(p1, p2, p3), d4 = side(p1, p2, p4);
      return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0)) && d1 !== 0 && d2 !== 0 && d3 !== 0 && d4 !== 0;
    };
    for (let i = 0; i < a.length; i++) {
      const p1 = a[i], p2 = a[(i + 1) % a.length];
      for (let j = 0; j < b.length; j++) {
        if (cross(p1, p2, b[j], b[(j + 1) % b.length])) return true;
      }
    }
    return false;
  }

  /* ---------------------------------------------------------- */
  /*  Fusion de deux zones de même nature                        */
  /* ---------------------------------------------------------- */

  /** Ce qu'il reste à vivre à une zone : rounds et secondes (Infinity =
      sans limite de ce côté). */
  static #remaining(zf, worldTime = game.time.worldTime) {
    zf ??= {};
    const c = zf.cfg ?? {};
    const rounds = c.rounds > 0 ? Math.max(0, c.rounds - (Number(zf.roundsDone) || 0)) : Infinity;
    const seconds = c.minutes > 0 ? Math.max(0, (Number(zf.created?.time) || 0) + c.minutes * 60 - worldTime) : Infinity;
    return { rounds, seconds };
  }

  /**
   * Deux zones de MÊME nature qui se touchent, réglées « fusionner » :
   * elles deviennent une seule Région (les deux formes réunies). Les
   * réglages (effets, qui est touché, apparence) sont ceux de la plus
   * puissante (à égalité, l'ancienne) ; la puissance et la durée suivent
   * le réglage de fusion de la nouvelle zone. Jamais une zone attachée à
   * un pion.
   * @returns {Promise<boolean>} vrai si la nouvelle zone a été fusionnée
   */
  static async #tryMerge(scene, data, zf, userId) {
    const cfg = zf.cfg ?? {};
    if (cfg.overlap !== "merge" || zf.attached) return false;
    const now = game.time.worldTime;
    const targets = this.zonesOf(scene).filter(r => {
      const o = this.#flags(r);
      return o?.cfg?.nature === cfg.nature && !o.attached && this.#overlaps(data.shapes ?? [], r);
    });
    if (!targets.length) return false;
    /* La zone qui reste : la plus puissante des zones déjà posées. */
    targets.sort((a, b) => this.powerOf(b, now) - this.powerOf(a, now));
    const keep = targets[0];
    const others = targets.slice(1);

    const combinePower = (a, b) => {
      switch (cfg.mergePower) {
        case "sum": return a + b;
        case "avg": return (a + b) / 2;
        case "capped": return Math.min(a + b, Number.isFinite(Number(zf.mergeCap)) && zf.mergeCap !== null ? Number(zf.mergeCap) : Infinity);
        default: return Math.max(a, b);
      }
    };
    const combineLeft = (a, b) => {
      if (cfg.mergeTime === "add") return a + b;
      return Math.max(a, b);
    };

    /* État de départ : la nouvelle zone (pleine durée, pleine puissance). */
    let power = Number(zf.power) || 0;
    let left = this.#remaining({ ...zf, roundsDone: 0, created: { time: now } }, now);
    let winner = { zf, power, color: data.color, name: data.name };
    let shapes = [...(data.shapes ?? [])];
    let baseShapes = [...(zf.baseShapes ?? data.shapes ?? [])];
    for (const r of [keep, ...others]) {
      const o = this.#flags(r);
      const p = this.powerOf(r, now);
      if (cfg.mergeTime !== "reset") {
        const l = this.#remaining(o, now);
        left = { rounds: combineLeft(left.rounds, l.rounds), seconds: combineLeft(left.seconds, l.seconds) };
      }
      /* Réglages de la plus puissante ; à égalité, l'ancienne. */
      if (p >= winner.power) winner = { zf: o, power: p, color: r.color, name: r.name };
      power = combinePower(power, p);
      shapes = [...(r.shapes ?? []).map(sh => sh.toObject?.() ?? sh), ...shapes];
      baseShapes = [...(o.baseShapes ?? []), ...baseShapes];
    }
    if (cfg.mergeTime === "reset") left = this.#remaining({ ...winner.zf, roundsDone: 0, created: { time: now } }, now);

    /* Horloges de la zone fusionnée, avec la durée de la gagnante. */
    const wc = winner.zf.cfg ?? {};
    const roundsDone = wc.rounds > 0 && Number.isFinite(left.rounds) ? wc.rounds - left.rounds : 0;
    const createdTime = wc.minutes > 0 && Number.isFinite(left.seconds) ? now - (wc.minutes * 60 - left.seconds) : now;
    const kf = this.#flags(keep);
    const merged = {
      ...kf,
      cfg: winner.zf.cfg,
      item: winner.zf.item,
      localDefs: [...(kf.localDefs ?? []), ...(zf.localDefs ?? [])].filter((d, i, a) => a.findIndex(x => x.key === d.key) === i),
      caster: winner.zf.caster,
      created: { ...(kf.created ?? {}), time: createdTime },
      roundsDone,
      powerLoss: 0,
      baseShapes,
      mergeCap: zf.mergeCap ?? kf.mergeCap ?? null,
      /* Images : chaque morceau garde la sienne (elles ne sont plus
         étirées quand la forme change), ou une seule étirée. */
      lookEach: cfg.mergeLook !== "stretch" || !!kf.lookEach
    };
    /* La puissance stockée est celle d'origine : la baisse dans le temps
       s'applique dessus. On la recale pour valoir « power » maintenant. */
    merged.power = power / Math.max(0.01, this.ratioOf(merged, now));

    /* La zone qui reste prend d'abord toute la surface : les pions des
       zones absorbées y sont déjà quand celles-ci disparaissent (leurs
       effets passent de main, sans clignoter). */
    await keep.update({ shapes, color: winner.color || keep.color, name: winner.name || keep.name,
      [`flags.${SYSTEM_ID}.zone`]: merged });
    if (merged.lookEach) {
      /* Une image par morceau : celles des zones absorbées passent à la
         zone qui reste, la nouvelle zone pose la sienne. */
      await ZoneLook.mergeEach(keep, others, data.shapes ?? [], zf.cfg?.look ?? {})
        .catch(err => console.warn("SBE | Zones : images de la fusion en échec", err));
    }
    for (const r of others) await r.delete();
    this.#notice(userId, L("SBE.PZone.Merged", { name: keep.name || L("SBE.PZone.Zone") }));
    return true;
  }

  /**
   * Deux natures opposées ne coexistent jamais au même endroit. La
   * nouvelle zone affronte chaque zone qu'elle exclut (ou qui l'exclut) :
   *   plus puissante → l'autre disparaît, elle prend sa place ;
   *   plus faible    → elle n'apparaît pas (et affaiblit l'autre si
   *                    « weaker » = weaken) ;
   *   égalité        → selon « tie » : les deux disparaissent, la nouvelle
   *                    gagne, ou l'ancienne reste.
   * @returns {Promise<boolean>} la nouvelle zone peut-elle apparaître ?
   */
  static async #resolveExclusions(scene, data, zf, userId) {
    const cfg = zf.cfg ?? {};
    const mine = Number(zf.power) || 0;
    const opposed = this.zonesOf(scene).filter(r => {
      const o = this.#flags(r)?.cfg;
      if (!o) return false;
      const clash = (cfg.excludes ?? []).includes(o.nature) || (o.excludes ?? []).includes(cfg.nature);
      return clash && this.#overlaps(data.shapes ?? [], r);
    });
    for (const r of opposed) {
      const theirs = this.powerOf(r);
      const name = r.name || L("SBE.PZone.Zone");
      if (mine > theirs) {
        await this.#expire(r);
        this.#notice(userId, L("SBE.PZone.ExclWin", { name }));
        continue;
      }
      if (mine < theirs) {
        if (cfg.weaker === "weaken") {
          const left = theirs - mine;
          if (left <= 0) await this.#expire(r);
          else await r.update({ [`flags.${SYSTEM_ID}.zone.powerLoss`]: (Number(this.#flags(r).powerLoss) || 0) + mine });
          this.#notice(userId, L("SBE.PZone.ExclWeaken", { name }));
        } else this.#notice(userId, L("SBE.PZone.ExclLose", { name }));
        return false;
      }
      /* Égalité. */
      if (cfg.tie === "old") { this.#notice(userId, L("SBE.PZone.ExclLose", { name })); return false; }
      await this.#expire(r);
      if (cfg.tie === "both") { this.#notice(userId, L("SBE.PZone.ExclBoth", { name })); return false; }
      this.#notice(userId, L("SBE.PZone.ExclWin", { name }));
    }
    return true;
  }

  /** La zone s'éteint (fin de durée, chassée par une zone opposée) : sa
      trace de fin, puis elle disparaît. */
  static async #expire(region) {
    await ZoneTrace.atEnd(region).catch(err => console.warn("SBE | Traces : trace de fin en échec", err));
    return region.delete();
  }

  /** Une zone qui rétrécit avec sa puissance : sa forme d'origine, réduite
      autour de son ancrage (jamais une zone attachée à un pion). */
  static async #reshape(region, zf, worldTime) {
    if (!zf.cfg?.shrink || zf.attached || !Array.isArray(zf.baseShapes)) return;
    const k = Math.max(0.05, this.ratioOf(zf, worldTime));
    const shapes = zf.baseShapes.map(sh => {
      const o = sh.origin ?? { x: 0, y: 0 };
      const points = [];
      for (let i = 0; i + 1 < sh.points.length; i += 2) {
        points.push(Math.round(o.x + (sh.points[i] - o.x) * k), Math.round(o.y + (sh.points[i + 1] - o.y) * k));
      }
      return { ...sh, points };
    });
    await region.update({ shapes });
  }

  /* ---------------------------------------------------------- */
  /*  Qui est touché, et par quoi                                */
  /* ---------------------------------------------------------- */

  /**
   * Deux zones de MÊME nature sur un pion, réglées « frappe une seule
   * fois » : seule la plus puissante le frappe (à égalité, la plus
   * ancienne).
   */
  static #outranked(region, zf, tokenDoc) {
    if ((zf.cfg?.overlap ?? "once") !== "once") return false;
    const mine = this.powerOf(region);
    for (const r of tokenDoc.regions ?? []) {
      if (r === region || r.id === region.id || !this.isZone(r)) continue;
      const o = this.#flags(r);
      if (o?.cfg?.nature !== zf.cfg.nature) continue;
      const theirs = this.powerOf(r);
      const older = (Number(o.created?.time) || 0) < (Number(zf.created?.time) || 0)
        || ((Number(o.created?.time) || 0) === (Number(zf.created?.time) || 0) && r.id < region.id);
      if (theirs > mine || (theirs === mine && older)) return true;
    }
    return false;
  }

  /** Repère du « une fois par round » (ou par intervalle hors combat). */
  static #stamp(zf, scene) {
    const c = (game.combats?.contents ?? []).find(x => x.started && combatOn(x, scene));
    if (c) return `c:${c.id}:${c.round}`;
    const every = Math.max(1, Number(zf.cfg?.every) || roundSeconds());
    return `t:${Math.floor(game.time.worldTime / every)}`;
  }

  /** Le réglage de la zone, lu sur la Région. */
  static #flags(region) {
    return region?.flags?.[SYSTEM_ID]?.zone ?? null;
  }

  /** Le pion est-il concerné (tout le monde, alliés, ennemis…) ? */
  static #touches(zf, tokenDoc) {
    return touchesBy(zf.cfg?.touch ?? "all", zf.caster, tokenDoc);
  }


  /** « Seulement si » : calculé sur la fiche de la CIBLE. */
  static #onlyIf(line, actor) {
    if (!line.onlyIf) return true;
    try { return !!evalExpression(line.onlyIf, docScope(actor)); } catch (_e) { return false; }
  }

  /** Les effets propres à l'objet, connus du moteur même si l'objet a
      disparu (copie gardée sur la zone). */
  static #remember(zf) {
    if (!zf?.localDefs?.length) return;
    EffectManager.rememberLocal({
      name: zf.item?.name ?? "", img: zf.item?.img ?? "", system: {},
      flags: { [SYSTEM_ID]: { effectsOwn: true, localEffects: zf.localDefs } }
    });
  }

  /** Une écriture à la fois par Région. */
  static #serial(regionId, fn) {
    const prev = this.#queue.get(regionId) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.#queue.set(regionId, next.catch(() => {}));
    return next;
  }

  /** La Région existe-t-elle encore ? */
  static #alive(region) {
    return !!region?.parent?.regions?.get?.(region.id);
  }

  /**
   * La zone frappe un pion : les effets réglés pour ce moment.
   * moment : enter | turnStart | turnEnd (« tant qu'il est dedans » est
   * posé à l'entrée).
   */
  static async hit(region, tokenDoc, moment) {
    if (!this.isZone(region)) return;
    /* Fin de tour : plus de moment à part (« à chaque tour » = le début). */
    if (moment === "turnEnd") return;
    return this.#serial(region.id, async () => {
      if (!this.#alive(region)) return;
      const zf = this.#flags(region);
      const actor = tokenDoc?.actor;
      if (!zf?.cfg || !actor || actor.type !== "personnage") return;
      if (!this.#touches(zf, tokenDoc)) return;
      if (this.#outranked(region, zf, tokenDoc)) return;
      this.#remember(zf);
      /* Entrées répétées : une seule frappe « à l'entrée » par round (ou
         par intervalle hors combat) si la zone est réglée ainsi. Le « tant
         qu'il est dedans » est toujours reposé. */
      let enterOk = true, stamp = null;
      if (moment === "enter" && (zf.cfg.repeat ?? "round") === "round") {
        stamp = this.#stamp(zf, region.parent);
        enterOk = zf.hits?.[tokenDoc.id] !== stamp;
      }
      /* La règle EN COMBAT ou HORS COMBAT de chaque ligne. */
      const fighting = this.#inCombat(region.parent);
      const lines = (zf.cfg.effects ?? []).map(cleanZoneLine).filter(e => {
        if (!e.key) return false;
        const rule = fighting ? e.combat : e.calm;
        if (moment === "enter") return WHEN_ENTER.has(rule) && (enterOk || e.leave);
        return moment === "turnStart" && fighting && WHEN_TICK.has(rule);
      });
      const given = new Set(zf.given?.[tokenDoc.id] ?? []);
      const upd = {};
      let struck = false;
      const applied = [];
      for (const line of lines) {
        if (!EffectManager.getDef(line.key)) continue;
        if (!this.#onlyIf(line, actor)) continue;
        /* Effet « retiré en sortant » déjà posé : rien à annoncer. */
        const fresh = !line.leave || !EffectManager.findEffect(actor, line.key);
        await EffectManager.act(actor, line.key, line.action, { quiet: true });
        if (fresh) applied.push(line.key);
        if (moment === "enter" && !line.leave) struck = true;
        if (!given.has(line.key)) { given.add(line.key); upd[`flags.${SYSTEM_ID}.zone.given.${tokenDoc.id}`] = [...given]; }
      }
      if (struck && stamp) upd[`flags.${SYSTEM_ID}.zone.hits.${tokenDoc.id}`] = stamp;
      if (Object.keys(upd).length) await region.update(upd);
      if (applied.length) await ZoneLook.announce(region, tokenDoc, applied);
    });
  }

  /**
   * Un pion sort de la zone : on lui retire ce qu'elle lui avait donné
   * « tant qu'il est dedans », et les effets réglés « retirés quand on
   * sort de la zone » — sauf s'il est encore dans une autre zone qui les
   * lui donne.
   */
  static async leave(region, tokenDoc) {
    if (!this.isZone(region)) return;
    return this.#serial(region.id, async () => {
      if (!this.#alive(region)) return;          /* zone effacée : deleteRegion s'en charge */
      const zf = this.#flags(region);
      await this.#strip(zf, tokenDoc, region);
      if (zf?.given?.[tokenDoc.id]?.length) await region.update({ [`flags.${SYSTEM_ID}.zone.given.${tokenDoc.id}`]: [] });
    });
  }

  /** Retire à un pion ce qu'une zone lui avait donné (et qui part à la sortie). */
  static async #strip(zf, tokenDoc, region) {
    const actor = tokenDoc?.actor;
    if (!zf?.cfg || !actor) return;
    this.#remember(zf);
    const given = new Set(zf.given?.[tokenDoc.id] ?? []);
    if (!given.size) return;
    const leaveKeys = new Set((zf.cfg.effects ?? []).map(cleanZoneLine).filter(e => e.leave).map(e => e.key));
    /* Les autres zones où le pion se trouve encore. */
    const others = [...(tokenDoc.regions ?? [])].filter(r => r !== region && r.id !== region?.id && this.isZone(r));
    for (const key of given) {
      const def = EffectManager.getDef(key);
      if (!def) continue;
      if (!leaveKeys.has(key)) continue;
      const stillGiven = others.some(r => (this.#flags(r)?.given?.[tokenDoc.id] ?? []).includes(key));
      if (stillGiven) continue;
      /* Passage de main : une autre zone de même nature où le pion reste,
         et qui donnerait ce même effet (bonne cible, « Seulement si »
         vrai), en devient responsable — l'effet ne clignote pas. */
      const heir = others.find(r => {
        const o = this.#flags(r);
        if (o?.cfg?.nature !== zf.cfg.nature || !this.#touches(o, tokenDoc)) return false;
        return (o.cfg.effects ?? []).some(e => e.key === key && this.#onlyIf(e, actor));
      });
      if (heir) {
        await this.#serial(heir.id, async () => {
          if (!this.#alive(heir)) return;
          const g = new Set(this.#flags(heir)?.given?.[tokenDoc.id] ?? []);
          g.add(key);
          await heir.update({ [`flags.${SYSTEM_ID}.zone.given.${tokenDoc.id}`]: [...g] });
        });
        continue;
      }
      await EffectManager.act(actor, key, "remove");
    }
  }

  /* ---------------------------------------------------------- */
  /*  Durée                                                      */
  /* ---------------------------------------------------------- */

  static async #onNewRound(combat) {
    const regions = (game.scenes?.contents ?? []).filter(sc => combatOn(combat, sc)).flatMap(sc => this.zonesOf(sc));
    for (const region of regions) {
      await this.#serial(region.id, async () => {
        if (!this.#alive(region)) return;
        const zf = this.#flags(region);
        const done = (Number(zf.roundsDone) || 0) + 1;
        if (zf.cfg.rounds > 0 && done >= zf.cfg.rounds) return this.#expire(region);
        await region.update({ [`flags.${SYSTEM_ID}.zone.roundsDone`]: done });
        await this.#reshape(region, this.#flags(region), game.time.worldTime);
        await ZoneLook.fade(region, game.time.worldTime);
      });
    }
  }

  /** Un combat est-il en cours sur cette scène ? */
  static #inCombat(scene) {
    return (game.combats?.contents ?? []).some(c => c.started && combatOn(c, scene));
  }

  static async #onTime(worldTime) {
    for (const scene of game.scenes?.contents ?? []) {
      const zones = this.zonesOf(scene);
      if (!zones.length) continue;
      const fighting = this.#inCombat(scene);
      for (const region of zones) {
        await this.#serial(region.id, async () => {
          if (!this.#alive(region)) return;
          const zf = this.#flags(region);
          const start = Number(zf.created?.time) || 0;
          const end = zf.cfg.minutes > 0 ? start + zf.cfg.minutes * 60 : Infinity;
          /* Hors combat : les moments « début / fin de tour » frappent
             toutes les N secondes — jamais au-delà de la fin de la zone
             (une nuit entière ne fait pas frapper un feu de 10 minutes). */
          let last = Number(zf.lastTick) || start;
          if (fighting) last = Math.min(worldTime, end);
          else {
            const every = Math.max(1, Number(zf.cfg.every) || roundSeconds());
            const until = Math.min(worldTime, end);
            const n = Math.min(100, Math.floor((until - last) / every));
            const timed = (zf.cfg.effects ?? []).map(cleanZoneLine).some(e => WHEN_TICK.has(e.calm));
            for (let i = 0; i < n; i++) {
              if (timed) {
                for (const tok of [...(region.tokens ?? [])]) {
                  await this.#tick(region, tok);
                }
              }
              last += every;
            }
          }
          if (worldTime >= end) return this.#expire(region);
          if (last !== Number(zf.lastTick)) await region.update({ [`flags.${SYSTEM_ID}.zone.lastTick`]: last });
          if (!fighting) {
            await this.#reshape(region, this.#flags(region), worldTime);
            await ZoneLook.fade(region, worldTime);
          }
        });
      }
    }
  }

  /** Une frappe « au rythme » hors combat (début / fin de tour). */
  static async #tick(region, tokenDoc) {
    const zf = this.#flags(region);
    const actor = tokenDoc?.actor;
    if (!zf?.cfg || !actor || actor.type !== "personnage" || !this.#touches(zf, tokenDoc)) return;
    if (this.#outranked(region, zf, tokenDoc)) return;
    this.#remember(zf);
    const given = new Set(zf.given?.[tokenDoc.id] ?? []);
    let changed = false;
    const applied = [];
    for (const line of (zf.cfg.effects ?? []).map(cleanZoneLine)) {
      if (!line.key || !WHEN_TICK.has(line.calm)) continue;
      if (!EffectManager.getDef(line.key) || !this.#onlyIf(line, actor)) continue;
      await EffectManager.act(actor, line.key, line.action, { quiet: true });
      applied.push(line.key);
      if (!given.has(line.key)) { given.add(line.key); changed = true; }
    }
    if (changed) await region.update({ [`flags.${SYSTEM_ID}.zone.given.${tokenDoc.id}`]: [...given] });
    if (applied.length) await ZoneLook.announce(region, tokenDoc, applied);
  }

  /** Zone effacée : ceux qui étaient dedans en sortent. */
  static async #onDeleted(region) {
    const zf = this.#flags(region);
    const scene = region.parent;
    for (const tokenId of Object.keys(zf?.given ?? {})) {
      const tok = scene?.tokens?.get(tokenId);
      if (tok) await this.#strip(zf, tok, region);
    }
    this.#queue.delete(region.id);
  }
}
