/**
 * SBE — EFFETS (palier 1)
 *
 * Les effets sont DÉFINIS par le MJ (fenêtre « Effets », réglage
 * monde) et POSÉS sur les personnages comme de vrais ActiveEffects de
 * Foundry : icône sur le pion, HUD du jeton, statuts. Mais leurs
 * modifications ne passent PAS par Foundry :
 *
 *   - chaque modification vise une CLÉ des modèles de personnage du MJ
 *     (jamais une clé écrite en dur dans le moteur) ;
 *   - elle est lue sur la DÉFINITION et comptée comme un APPORT NOMMÉ
 *     au moment du calcul (registre d'apports) : rien n'est écrit dans
 *     les valeurs stockées, modifier la définition met à jour tous les
 *     effets posés, et la fiche montre « Saignement −2 » au survol.
 *
 * Palier 1 : définitions, application, apports, durée (rounds en
 * combat, temps de jeu hors combat), cumuls, groupe exclusif.
 *
 * L'exécution qui ÉCRIT (expiration, exclusivité) ne tourne que chez le
 * MJ principal : jamais deux écritures concurrentes.
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { onSocketMessage, requestGM, gmQueue, isPrimaryGM } from "../../helpers/socket.mjs";
import { walkElements, KEY_RE } from "../../builder/element-renderer.mjs";
import { registerContributionSource, CONTRIB_MODES } from "../../builder/contributions.mjs";
import { paint, cleanIconColor, preparePainted } from "./icon-paint.mjs";
import { cleanGives } from "./effect-gives.mjs";
import { docScope } from "../../builder/doc-context.mjs";

/* DURÉE RÉDUITE (clés à effet du porteur, lues à la pose) : « duree_effets »
   divise la durée de tout effet reçu, « duree_<clé d'effet> » celle de cet
   effet ; le plus fort l'emporte (1 ou moins : rien). Les phases suivent. */
export const DURATION_KEY = "duree";

/** Une durée (rounds ou secondes) divisée ; jamais sous 1 si elle comptait. */
export function scaleDuration(v, div) {
  const n = Number(v) || 0;
  const d = Number(div) || 1;
  return n > 0 && d > 1 ? Math.max(1, Math.round(n / d)) : n;
}

const SETTING = "effects";
const DEFAULT_ICON = "icons/svg/aura.svg";
/* Clé d'effet : LA règle des clés SBE (KEY_RE, element-renderer) —
   un seul langage pour tout ce qui sert d'identifiant. */

/**
 * Un VRAI nouveau round : on avance (pas de retour en arrière), et ce
 * n'est pas le début du combat (le round 1 n'achève aucun round).
 */
export function isNewRound(combat, changed) {
  if (!("round" in (changed ?? {})) || !combat?.started) return false;
  const now = Number(changed.round) || 0;
  const prev = Number(combat.previous?.round ?? now - 1);
  return now > 1 && now > prev;
}

/**
 * Le combat AVANCE (tour ou round suivant, début du combat) — pas un
 * retour en arrière, ni un tour choisi plus haut dans la liste. Lu dans
 * « updateCombat » : Foundry y a déjà rangé l'état d'avant (previous).
 */
export function isForwardTurn(combat, changed) {
  const ch = changed ?? {};
  if (!("turn" in ch) && !("round" in ch)) return false;
  const p = combat?.previous, c = combat?.current;
  if (!combat?.started || !p || !c) return false;
  const pr = Number(p.round) || 0, cr = Number(c.round) || 0;
  if (cr !== pr) return cr > pr;
  return (c.turn ?? -1) > (p.turn ?? -1);
}

const TIMINGS = ["turn", "round", "time"];
const str = (v) => String(v ?? "").trim();
/** Texte, ou la valeur par défaut s'il est vide. */
const strOr = (v, dflt) => str(v) || dflt;

function cleanChanges(list, draft = false) {
  return (Array.isArray(list) ? list : [])
    .map(c => ({
      key: str(c?.key),
      mode: CONTRIB_MODES.includes(c?.mode) ? c.mode : "add",
      value: str(c?.value)
    }))
    .filter(c => draft || (c.key && c.value !== ""));
}

/** L'id exact d'une condition native, quelle que soit sa casse : une
    ancienne version de SBE rangeait « fireShield » en « fireshield ». */
function nativeIdOf(key) {
  const k = String(key ?? "").trim();
  let list = null;
  try { list = EffectManager._nativeCache; } catch (_e) { list = null; }
  list ??= Array.isArray(globalThis.CONFIG?.statusEffects) ? CONFIG.statusEffects : [];
  const hit = list.find(n => n?.id && n.id.toLowerCase() === k.toLowerCase());
  return hit?.id ?? k;
}

/** Les statuts spéciaux que le cœur de Foundry reconnaît (ids). */
function specialStatusIds() {
  return [...new Set(Object.values(globalThis.CONFIG?.specialStatusEffects ?? {}).filter(v => typeof v === "string" && v))];
}

/** Un statut spécial valide, ou "". Avant que CONFIG soit prêt, on garde
    la valeur telle quelle (elle sera revérifiée à l'usage). */
function specialStatusOf(v) {
  const id = String(v ?? "").trim();
  if (!id) return "";
  const ids = specialStatusIds();
  return !ids.length || ids.includes(id) ? id : "";
}

/** Id fixe (16 caractères) d'un effet qui porte un statut de Foundry en
    plus du sien : Foundry l'exige pour retrouver l'effet. */
function staticIdOf(key) {
  let a = 0x811c9dc5, b = 0x9747b28c;
  for (const ch of String(key)) {
    const c = ch.codePointAt(0);
    a = Math.imul(a ^ c, 16777619) >>> 0;
    b = Math.imul(b ^ c, 2246822519) >>> 0;
  }
  return ("sbe" + a.toString(36) + b.toString(36)).padEnd(16, "0").slice(0, 16);
}

/** Une même condition native rangée deux fois (ancienne clé en
    minuscules + nouvelle) : on garde la plus récente, à sa place. */
function dedupeNatives(list) {
  const last = new Map();
  list.forEach((d, i) => { if (d.native) last.set(d.key, i); });
  return list.filter((d, i) => !d.native || last.get(d.key) === i);
}

/** Une définition, toujours propre. `draft` : garde les lignes encore
    vides (brouillon d'un éditeur qui enregistre au fil de la saisie) ;
    le moteur, lui, ne les voit pas. */
export function cleanDef(d, { draft = false } = {}) {
  const num = (v) => Math.max(0, Math.floor(Number(v) || 0));
  const t = d?.trigger ?? {}, p = d?.periodic ?? {}, r = d?.resist ?? {}, e = d?.escalation ?? {}, h = d?.restHeal ?? {};
  const lk = d?.look ?? {}, li = lk.light ?? {}, vi = lk.vision ?? {};
  const n0 = (v, dflt = 0) => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : dflt);
  return {
    /* Condition NATIVE de Foundry personnalisée (la clé est son id) ;
       « hidden » la retire du HUD. */
    native: !!d?.native,
    hidden: !!d?.native && !!d?.hidden,
    /* Une condition native garde l'id exact de Foundry (« fireShield ») ;
       mes effets suivent la règle des clés (minuscules). */
    key: d?.native ? nativeIdOf(d?.key) : String(d?.key ?? "").trim().toLowerCase(),
    label: String(d?.label ?? "").trim(),
    icon: String(d?.icon ?? "").trim(),
    /* Couleur de l'icône (le blanc prend la couleur) et ses copies
       colorées, fabriquées par le MJ : { icône d'origine → copie }. */
    iconColor: cleanIconColor(d?.iconColor),
    iconPainted: cleanIconColor(d?.iconColor) && d?.iconPainted && typeof d.iconPainted === "object"
      ? Object.fromEntries(Object.entries(d.iconPainted).filter(([k, v]) => typeof k === "string" && typeof v === "string" && v))
      : {},
    description: String(d?.description ?? ""),
    duration: { rounds: num(d?.duration?.rounds), seconds: num(d?.duration?.seconds) },
    changes: cleanChanges(d?.changes, draft),
    stack: {
      enabled: !!d?.stack?.enabled,
      max: Math.max(1, num(d?.stack?.max) || 1),
      scale: d?.stack?.scale !== false
    },
    group: str(d?.group),
    /* CATÉGORIE libre, non exclusive (« Maladie », « Poison ») : ce que
       visent les réactions (« Effet posé » d'une catégorie) et la
       formule effectCategory(). */
    category: str(d?.category),
    /* ZONES PERSISTANTES : retiré quand le personnage sort de la zone qui
       l'a posé (vision réduite dans la fumée) ; sinon il garde sa durée
       (une brûlure continue après le feu). */
    zoneLeave: !!d?.zoneLeave,
    /* COMBAT : le porteur ne peut plus se défendre (esquive, parade,
       sauvegarde de zone) — étourdi, paralysé, endormi… */
    noDefense: !!d?.noDefense,
    /* Agit comme un statut spécial de Foundry (aveugle, invisible, à
       terre…) : le cœur (vision, combat, déplacement) le reconnaît. */
    foundryStatus: (() => {
      const f = specialStatusOf(d?.foundryStatus);
      return d?.native && f === nativeIdOf(d?.key) ? "" : f;
    })(),

    /* DÉCLENCHEUR : posé tant que les conditions tiennent (formules sur
       la fiche), retiré quand elles tombent ; ou posé sur un événement. */
    trigger: {
      enabled: !!t.enabled,
      logic: t.logic === "or" ? "or" : "and",
      conditions: (Array.isArray(t.conditions) ? t.conditions : []).map(str).filter(c => draft || c),
      onCombatStart: !!t.onCombatStart,
      onDecrease: str(t.onDecrease)
    },

    /* PÉRIODIQUE : modifie une clé à chaque tour / round / intervalle
       de temps de jeu (dégâts ou soins dans la durée). */
    periodic: {
      enabled: !!p.enabled,
      timing: TIMINGS.includes(p.timing) ? p.timing : "round",
      interval: Math.max(1, num(p.interval) || 60),
      key: str(p.key),
      amount: str(p.amount),
      reduceKey: str(p.reduceKey),
      chat: p.chat !== false,
      /* SUR QUI : le personnage qui porte l'effet, ou l'OBJET qui le
         confère (l'autonomie d'une lampe, qui ne baisse que tant que
         l'effet dure). À zéro, pour un objet : rien, une unité de la
         pile part (la suivante repart pleine), ou l'objet disparaît. */
      target: p.target === "source" ? "source" : "actor",
      onZero: ["qty", "delete"].includes(p.onZero) ? p.onZero : "none"
    },

    /* JET DE RÉSISTANCE : le jet configuré sur un champ de la fiche,
       rendu plus dur de « difficulté ». */
    resist: {
      enabled: !!r.enabled,
      key: str(r.key),
      difficulty: str(r.difficulty),
      onApply: r.onApply !== false,
      onRound: !!r.onRound,
      result: r.result === "reduce" ? "reduce" : "cancel",
      reduceBy: Math.max(1, num(r.reduceBy) || 1),
      crit: !!r.crit,
      critMult: Math.max(1, Number(r.critMult) || 2)
    },

    /* ESCALADE : les cumuls montent d'eux-mêmes (et redescendent, si
       « décroissance », quand le déclencheur ne tient plus). Avec des
       PALIERS, chaque niveau a son nom, son icône et ses modifications. */
    escalation: {
      enabled: !!e.enabled,
      timing: TIMINGS.includes(e.timing) ? e.timing : "round",
      interval: Math.max(1, num(e.interval) || 60),
      step: Math.max(1, num(e.step) || 1),
      decay: !!e.decay,
      /* « auto » : monte seule à la cadence ; « manual » : seulement quand
         on ajoute un cumul (zone, bouton, HUD) — les paliers restent. */
      rise: e.rise === "manual" ? "manual" : "auto",
      tiers: (Array.isArray(e.tiers) ? e.tiers : []).map(x => ({
        label: str(x?.label), icon: str(x?.icon), changes: cleanChanges(x?.changes, draft),
        /* Montant de l'effet périodique À CE PALIER (facultatif) : il
           remplace le montant de l'effet, sans être multiplié. */
        amount: str(x?.amount)
      }))
    },

    /* PHASES (palier 4) : quand la durée s'épuise, l'effet continue
       dans la phase suivante (buff puis contrecoup…) au lieu de partir. */
    phases: (Array.isArray(d?.phases) ? d.phases : []).map(x => ({
      label: str(x?.label),
      icon: str(x?.icon),
      rounds: num(x?.rounds),
      seconds: num(x?.seconds),
      changes: cleanChanges(x?.changes, draft)
    })),

    /* APPARENCE ET SON (palier 3). */
    look: {
      sound: str(lk.sound),
      volume: Math.min(100, n0(lk.volume, 80)),
      loop: !!lk.loop,
      audience: ["gm", "owner", "all"].includes(lk.audience) ? lk.audience : "all",
      range: n0(lk.range, 0),
      falloff: !!lk.falloff,
      tint: str(lk.tint),
      bigIcon: !!lk.bigIcon,
      discreet: !!lk.discreet,
      /* ANIMATION en boucle sur le pion tant que l'effet dure (image ou
         vidéo ; « fond noir transparent » pour les vidéos sur fond noir). */
      anim: {
        file: str(lk.anim?.file),
        size: Number(lk.anim?.size) > 0 ? Number(lk.anim.size) : 1,
        screen: !!lk.anim?.screen
      },
      /* Camouflage : le porteur n'a pas de halo en vision thermique. */
      thermalMask: !!lk.thermalMask,
      /* LUMIÈRE : chaque champ est un nombre, une formule (fiche du
         porteur) ou « @clé » (lu sur l'objet qui confère l'effet) —
         résolus par vision/effect-values.mjs. Vide = valeur de Foundry. */
      light: {
        enabled: !!li.enabled,
        dim: strOr(li.dim, "6"), bright: strOr(li.bright, "3"),
        color: str(li.color), alpha: strOr(li.alpha, "0.5"),
        /* Cône (suit la rotation du pion) ; 360 = tout autour. */
        angle: strOr(li.angle, "360"),
        animation: str(li.animation), speed: strOr(li.speed, "5"), intensity: strOr(li.intensity, "5"),
        reverse: (typeof li.reverse === "string" && li.reverse.trim().startsWith("@")) ? li.reverse.trim() : !!li.reverse,
        attenuation: str(li.attenuation), luminosity: str(li.luminosity), saturation: str(li.saturation),
        contrast: str(li.contrast), shadows: str(li.shadows), coloration: str(li.coloration),
        /* Personnelle : vue du seul porteur, jamais écrite sur le jeton
           (case, ou « @clé » : une case de l'objet qui confère l'effet). */
        personal: (typeof li.personal === "string" && li.personal.trim().startsWith("@")) ? li.personal.trim() : !!li.personal
      },
      /* AVEUGLE : vue nulle, lumière plus perçue ; passe devant toute
         vision (objets compris). (Une ancienne « Vision » en mode
         Aveugle devient cette case.) */
      blind: !!lk.blind || (!!vi.enabled && vi.mode === "sbeBlind"),
      /* MODE DE VISION donné tant que l'effet dure (gestionnaire « Modes
         de vision ») ; portée et angle : nombre, formule ou « @clé »,
         vides = ceux du pion. */
      sight: {
        enabled: !!lk.sight?.enabled && !!str(lk.sight?.mode),
        mode: str(lk.sight?.mode), range: str(lk.sight?.range), angle: str(lk.sight?.angle)
      }
    },

    /* GUÉRISON AU REPOS (signal « nouvelle journée »). */
    restHeal: {
      mode: ["remove", "reduce", "save"].includes(h.mode) ? h.mode : "none",
      reduceBy: Math.max(1, num(h.reduceBy) || 1),
      key: str(h.key),
      difficulty: str(h.difficulty),
      onSuccess: h.onSuccess === "reduce" ? "reduce" : "remove"
    },

    /* OBJETS DONNÉS tant que l'effet dure (voir effect-gives.mjs). */
    gives: cleanGives(d?.gives, draft)
  };
}

/** Les paliers sont-ils actifs (escalade avec au moins un palier) ? */
function hasTiers(def) {
  return def.escalation.enabled && def.escalation.tiers.length > 0;
}

/** Plafond de cumuls : nombre de paliers, sinon le maximum réglé. */
export function maxStacks(def) {
  if (hasTiers(def)) return def.escalation.tiers.length;
  return def.stack.enabled || def.escalation.enabled ? def.stack.max : 1;
}

/** Nom, icône et modifications au niveau n (paliers compris), dans
    la phase donnée (0 = l'effet lui-même). */
export function levelOf(def, n, phase = 0) {
  const ph = phase > 0 ? def.phases?.[phase - 1] : null;
  if (ph) {
    return { label: ph.label || def.label || def.key, icon: paint(def, ph.icon || def.icon || DEFAULT_ICON),
      changes: ph.changes, scaled: def.stack.scale };
  }
  const tier = hasTiers(def) ? def.escalation.tiers[Math.max(1, n) - 1] : null;
  const nat = def.native ? (EffectManager._nativeCache ?? []).find(x => x.id === def.key) : null;
  const base = def.label || (nat ? game.i18n.localize(nat.name ?? def.key) : def.key);
  return {
    label: tier?.label || (n > 1 && !tier ? `${base} ×${n}` : base),
    icon: paint(def, tier?.icon || def.icon || nat?.img || DEFAULT_ICON),
    changes: tier ? tier.changes : def.changes,
    scaled: !tier && def.stack.scale
  };
}

export class EffectManager {

  static _bound = false;
  static _nativeCache = null;
  /** « acteur::clé » des poses demandées par un déclencheur. */
  static _autoNext = new Set();
  /** « acteur::clé » des poses demandées par un objet (effet conféré). */
  static _grantNext = new Set();

  /* ---------------------------------------------------------- */
  /*  Définitions                                                */
  /* ---------------------------------------------------------- */

  /* Définitions nettoyées, gardées tant que le réglage ne change pas
     (lues à chaque image d'un pion qui bouge). LECTURE SEULE : qui les
     modifie travaille sur une copie. */
  static #defsCache = null;

  /** Le réglage a changé : on relira. */
  static dropDefsCache() { this.#defsCache = null; }

  static getDefs() {
    if (this.#defsCache) return this.#defsCache;
    let raw = [];
    try { raw = game.settings.get(SYSTEM_ID, SETTING) ?? []; } catch (_e) { return []; }
    const list = dedupeNatives((Array.isArray(raw) ? raw : []).map(cleanDef).filter(d => d.key));
    /* Avant « ready », les réglages du monde ne sont pas encore lus. */
    if (game.ready) this.#defsCache = list;
    return list;
  }

  static getDef(key) {
    const d = this.getDefs().find(x => x.key === key);
    if (d) return d;
    /* Une condition native jamais personnalisée reste un effet à part
       entière : utilisable par les boutons, les objets, les formules. */
    if (key && this.nativeIds().has(key)) return cleanDef({ key, native: true });
    return key ? this.localDef(key) : null;
  }

  /* ---------------------------------------------------------- */
  /*  Effets PROPRES à un objet                                  */
  /* ---------------------------------------------------------- */
  /*  Créés dans l'onglet Effets de l'objet (même éditeur que le   */
  /*  gestionnaire), rangés sur l'objet (flags.sbe.localEffects). */
  /*  Clé « obj_… » donnée toute seule. Posé sur un personnage,    */
  /*  l'effet garde une COPIE de sa définition : il continue (durée,*/
  /*  phases…) même si l'objet a été consommé entre-temps.         */

  static #local = new Map();

  /**
   * L'objet qui PORTE les effets de cet objet : lui-même s'il en a
   * (effets propres ou règles), sinon son modèle (objet du monde dont
   * il est un exemplaire). Une seule source : l'Adrénaline du monde
   * règle les effets de toutes les Adrénalines déjà distribuées, tant
   * qu'un exemplaire n'a pas été modifié à part.
   */
  static effectsHolder(item) {
    /* Détaché à la main (« pour cet exemplaire seulement ») : le sien.
       Sinon le modèle, même si l'exemplaire garde une vieille copie
       des effets (prise quand il a été distribué). */
    if (!item || item.flags?.[SYSTEM_ID]?.effectsOwn) return item;
    const model = item.system?.modelId ? game.items?.get?.(item.system.modelId) : null;
    return model && model !== item ? model : item;
  }

  /** Un exemplaire qu'on modifie à part : il prend sa propre copie des
      effets de son modèle (clés renouvelées, règles suivies). */
  static async forkEffects(item) {
    const holder = this.effectsHolder(item);
    if (!item || holder === item) return;
    const f = holder.flags?.[SYSTEM_ID] ?? {};
    const keys = new Map();
    const defs = (Array.isArray(f.localEffects) ? f.localEffects : []).map(d => {
      const key = `obj_${foundry.utils.randomID(10).toLowerCase()}`;
      keys.set(d.key, key);
      return { ...foundry.utils.deepClone(d), key };
    });
    const rules = (Array.isArray(f.effectRules) ? f.effectRules : [])
      .map(r => ({ ...foundry.utils.deepClone(r), effect: keys.get(r.effect) ?? r.effect }));
    await item.update({ [`flags.${SYSTEM_ID}.localEffects`]: defs, [`flags.${SYSTEM_ID}.effectRules`]: rules,
      [`flags.${SYSTEM_ID}.effectsOwn`]: true }, { render: false });
  }

  /** Les effets propres d'un objet. Nom et icône : ceux de l'objet
      (jamais à saisir). */
  static localDefsOf(item, { draft = false } = {}) {
    const raw = this.effectsHolder(item)?.flags?.[SYSTEM_ID]?.localEffects;
    return (Array.isArray(raw) ? raw : []).map(d => cleanDef(d, { draft })).filter(d => d.key)
      .map(d => ({ ...d, label: item.name ?? "", icon: item.img ?? "" }));
  }

  /** Enregistre les effets propres ; `render:false` = sans redessiner
      la fiche (saisie en cours). */
  static async setLocalDefs(item, defs, { render = true } = {}) {
    await this.forkEffects(item);
    /* Rangé en brouillon (lignes vides gardées pour l'éditeur) ; le
       moteur reçoit la version propre. */
    const list = defs.map(d => cleanDef(d, { draft: true })).filter(d => d.key).map(d => ({ ...d, label: "", icon: "" }));
    for (const d of list) this.#local.set(d.key, { ...cleanDef(d), label: item.name ?? "", icon: item.img ?? "" });
    await item.update({ [`flags.${SYSTEM_ID}.localEffects`]: list }, { render });
  }

  /** Garde en mémoire les effets propres d'un objet (avant qu'il soit
      consommé : l'effet doit pouvoir être posé juste après). */
  static rememberLocal(item) {
    for (const d of this.localDefsOf(item)) this.#local.set(d.key, d);
  }

  /** Une définition propre à un objet, où qu'elle se trouve. */
  static localDef(key) {
    if (!String(key).startsWith("obj_")) return null;
    if (this.#local.has(key)) return this.#local.get(key);
    const found = this.#scanLocal(key);
    if (found) this.#local.set(key, found);
    return found;
  }

  static #scanLocal(key) {
    const look = (item) => this.localDefsOf(item).find(d => d.key === key) ?? null;
    for (const it of game.items ?? []) { const d = look(it); if (d) return d; }
    for (const a of this.allActors?.() ?? []) {
      for (const it of a.items ?? []) { const d = look(it); if (d) return d; }
      /* Copie gardée sur l'effet posé (objet consommé depuis). */
      for (const ae of a.effects ?? []) {
        const snap = ae.flags?.[SYSTEM_ID]?.def;
        if (snap?.key === key) return cleanDef(snap);
      }
    }
    return null;
  }

  /** L'effet est-il un statut de Foundry (sinon : posé directement) ? */
  static #isStatus(key) {
    return (CONFIG.statusEffects ?? []).some(s => s?.id === key);
  }

  static async #turnOn(actor, key) {
    if (this.#isStatus(key)) return actor.toggleStatusEffect(key, { active: true });
    const def = this.getDef(key);
    return actor.createEmbeddedDocuments("ActiveEffect", [{
      name: def?.label || key, img: paint(def, def?.icon || DEFAULT_ICON),
      statuses: [key, ...(specialStatusIds().includes(def?.foundryStatus) ? [def.foundryStatus] : [])]
    }]);
  }

  /** Retire un effet (statut de Foundry ou effet propre d'un objet). */
  static async turnOff(actor, key) { return this.#locked(actor, () => this.#turnOff(actor, key)); }

  /**
   * Les poses d'effets d'un même personnage passent l'une après l'autre :
   * quatre joueurs qui ajoutent un cumul en même temps donnent UN effet
   * à quatre cumuls (et non quatre effets à un cumul).
   */
  static #locked(actor, task) {
    return gmQueue(`fx:${actor?.uuid ?? ""}`, task);
  }

  static async #turnOff(actor, key) {
    if (this.#isStatus(key)) await actor.toggleStatusEffect(key, { active: false });
    /* Un effet posé avant un changement de réglage (sans l'id fixe, ou
       avec) : on le retire aussi. */
    const left = (actor?.effects ?? []).filter(e => e.statuses?.has?.(key)).map(e => e.id);
    if (left.length) await actor.deleteEmbeddedDocuments("ActiveEffect", left);
  }

  static async setDefs(defs) {
    const before = this.getDefs();
    const list = dedupeNatives(defs.map(cleanDef).filter(d => d.key));
    /* Les réglages sont enregistrés TOUT DE SUITE ; les icônes colorées
       se fabriquent ensuite (jamais d'attente sur un envoi de fichier). */
    await game.settings.set(SYSTEM_ID, SETTING, list);
    this.dropDefsCache();
    if (list.some(d => d.iconColor) || before.some(d => d.iconColor)) {
      this.#paintPass(before).catch(err => console.warn("SBE | Effets : icônes colorées en échec", err));
    }
  }

  /** Fabrique les copies colorées qui manquent, les range sur les
      définitions, puis met à jour les effets déjà posés (MJ). */
  static async #paintPass(before) {
    if (!game.user.isGM) return;
    const list = foundry.utils.deepClone(this.getDefs());
    let changed = false;
    for (const d of list) {
      if (!d.iconColor) continue;
      const map = await preparePainted(d, this.iconSources(d));
      if (JSON.stringify(map) !== JSON.stringify(d.iconPainted ?? {})) { d.iconPainted = map; changed = true; }
    }
    if (changed) {
      /* Relu juste avant d'écrire : on ne range que les copies, rien
         d'autre ne change entre-temps. */
      const fresh = this.getDefs().map(d => {
        const p = list.find(x => x.key === d.key && x.native === d.native);
        return p && p.iconColor === d.iconColor ? { ...d, iconPainted: p.iconPainted } : d;
      });
      await game.settings.set(SYSTEM_ID, SETTING, fresh);
    }
    await this.repaintInstances(before);
  }

  /** Toutes les icônes d'origine d'une définition (effet, paliers, phases). */
  static iconSources(d) {
    const nat = d.native ? (this._nativeCache ?? []).find(n => n.id === d.key) : null;
    const base = d.icon || nat?.img || DEFAULT_ICON;
    return [base, ...(d.escalation?.tiers ?? []).map(t => t.icon), ...(d.phases ?? []).map(p => p.icon)].filter(Boolean);
  }

  /**
   * Après un changement de couleur d'icône (MJ) : les effets déjà posés
   * prennent la nouvelle icône (ou retrouvent l'originale).
   * @param {object[]} before  définitions avant l'enregistrement
   */
  static async repaintInstances(before) {
    if (!game.user.isGM) return;
    const old = new Map((before ?? []).map(d => [d.key, d]));
    for (const d of this.getDefs()) {
      const o = old.get(d.key);
      const was = o?.iconColor ?? "", now = d.iconColor ?? "";
      if (was === now && JSON.stringify(o?.iconPainted ?? {}) === JSON.stringify(d.iconPainted ?? {})) continue;
      /* Chaque icône possible (originale ou ancienne copie) → la nouvelle. */
      const map = new Map();
      for (const src of this.iconSources(d)) {
        const next = paint(d, src);
        map.set(src, next);
        if (o?.iconPainted?.[src]) map.set(o.iconPainted[src], next);
      }
      for (const { ae } of this.instancesOf(d.key)) {
        const next = map.get(ae.img);
        if (next && next !== ae.img) {
          try { await ae.update({ img: next }); } catch (err) { console.warn("SBE | Effets : icône d'un effet posé en échec", err); }
        }
      }
    }
  }

  /** Tous les effets proposables (les miens, puis les natifs). */
  static effectOptions() {
    const defs = this.getDefs();
    const mine = defs.filter(d => !d.native).map(d => ({ key: d.key, label: d.label || d.key }));
    const natives = (this._nativeCache ?? []).map(n => {
      const o = defs.find(d => d.native && d.key === n.id);
      return { key: n.id, label: o?.label || game.i18n.localize(n.name ?? n.id) };
    });
    return [...mine, ...natives];
  }

  static hideAllNatives() {
    try { return !!game.settings.get(SYSTEM_ID, "hideNativeEffects"); } catch (_e) { return false; }
  }

  static async setHideAllNatives(v) {
    await game.settings.set(SYSTEM_ID, "hideNativeEffects", !!v);
  }

  /** Choix « Agit comme le statut Foundry » : les statuts spéciaux du
      cœur, nommés comme dans le HUD. */
  static specialStatusOptions(selfKey = "") {
    const list = this._nativeCache ?? (CONFIG.statusEffects ?? []);
    return specialStatusIds().filter(id => id !== selfKey).map(id => {
      const n = list.find(e => e?.id === id);
      return { value: id, label: n?.name ? game.i18n.localize(n.name) : id };
    });
  }

  /** Identifiants des conditions natives de Foundry (réservés). */
  static nativeIds() {
    const list = this._nativeCache ?? (CONFIG.statusEffects ?? []);
    return new Set(list.map(e => e?.id).filter(Boolean));
  }

  /**
   * Erreur d'une clé d'effet, ou "" : format, unicité, conflit avec
   * une condition native.
   */
  static keyError(key, defs, selfIndex = -1, native = false) {
    if (!key) return "SBE.Effects.KeyEmpty";
    if (native) {
      if (!this.nativeIds().has(key)) return "SBE.Effects.KeyNotNative";
    } else {
      if (!KEY_RE.test(key)) return "SBE.Effects.KeyBad";
      if (this.nativeIds().has(key)) return "SBE.Effects.KeyNative";
    }
    if (defs.some((d, i) => i !== selfIndex && d.key === key)) return "SBE.Effects.KeyTaken";
    return "";
  }

  /**
   * Les définitions deviennent des statuts de Foundry (HUD du jeton).
   *
   * Foundry v14 range ses statuts dans une liste spéciale, lue aussi par
   * leur id (`CONFIG.statusEffects["dead"]`, utilisé par
   * `toggleStatusEffect`) : on la REMPLIT, on ne la remplace jamais (une
   * liste ordinaire casserait la pose des statuts).
   *
   * Une condition native masquée reste un statut (les objets, les zones,
   * les formules peuvent toujours la poser) : elle disparaît seulement du
   * HUD (`hud: false`). Sans réglage propre, elle suit « Tout masquer ».
   */
  static registerStatusEffects() {
    const target = CONFIG.statusEffects;
    if (!target) return;
    this._nativeCache ??= [...target].filter(e => e && !e?.flags?.[SYSTEM_ID]?.custom).map(e => ({ ...e }));
    const defs = this.getDefs();
    const over = new Map(defs.filter(d => d.native).map(d => [d.key, d]));
    const hideAll = this.hideAllNatives();
    const next = [
      ...this._nativeCache.map(n => {
        const o = over.get(n.id);
        const hidden = o ? o.hidden : hideAll;
        const out = o ? { ...n, name: o.label || n.name, img: paint(o, o.icon || n.img), description: o.description || n.description || "" } : { ...n };
        /* Une condition native peut aussi agir comme un autre statut
           spécial (« Inconscient » qui compte comme « À terre »). */
        if (o && specialStatusIds().includes(o.foundryStatus) && o.foundryStatus !== n.id) {
          out.statuses = [...new Set([...(n.statuses ?? []), o.foundryStatus])];
          out._id ??= staticIdOf(n.id);
        }
        if (hidden) out.hud = false;
        return out;
      }),
      /* Une définition propre ne prend jamais l'id d'un statut natif (un
         import qui contournerait la vérification de clé) : deux statuts
         de même id cassent la liste de Foundry, donc le canevas. */
      ...defs.filter(d => !d.native && !this._nativeCache.some(n => n.id === d.key)).map(d => ({
        id: d.key,
        name: d.label || d.key,
        img: paint(d, d.icon || DEFAULT_ICON),
        description: d.description,
        ...(specialStatusIds().includes(d.foundryStatus) ? { _id: staticIdOf(d.key), statuses: [d.foundryStatus] } : {}),
        flags: { [SYSTEM_ID]: { custom: true } }
      }))
    ];
    target.length = 0;
    for (const st of next) {
      target.push(st);
      target[st.id] = st;
    }
  }

  /** Une condition native est-elle masquée du HUD ? */
  static nativeHidden(id) {
    const o = this.getDefs().find(d => d.native && d.key === id);
    return o ? o.hidden : this.hideAllNatives();
  }

  /* ---------------------------------------------------------- */
  /*  Effets posés                                               */
  /* ---------------------------------------------------------- */

  /** L'ActiveEffect de cette définition sur cet acteur (ou null). */
  static findEffect(actor, key) {
    for (const e of actor?.effects ?? []) {
      if (e.statuses?.has?.(key)) return e;
    }
    return null;
  }

  /** Nom du premier effet posé qui empêche de se défendre, sinon "". */
  static noDefenseOf(actor) {
    for (const d of this.getDefs()) {
      if (!d.noDefense) continue;
      const ae = this.findEffect(actor, d.key);
      if (ae && !ae.disabled) return d.label || ae.name || d.key;
    }
    return "";
  }

  static getStacks(actor, key) {
    const ae = this.findEffect(actor, key);
    if (!ae) return 0;
    const n = Number(ae.flags?.[SYSTEM_ID]?.stacks);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }

  /** Fixe le nombre de cumuls (0 = retrait ; création si absent). */
  static async setStacks(actor, key, n) {
    return this.#locked(actor, () => this.#setStacks(actor, key, n));
  }

  static async #setStacks(actor, key, n) {
    const def = this.getDef(key);
    if (!def || !actor) return;
    n = Math.max(0, Math.min(maxStacks(def), Math.floor(Number(n) || 0)));
    if (n <= 0) {
      if (this.findEffect(actor, key)) await this.#turnOff(actor, key);
      return;
    }
    if (!this.findEffect(actor, key)) await this.#turnOn(actor, key);
    const ae = this.findEffect(actor, key);
    if (!ae) return;
    if (this.getStacks(actor, key) !== n) {
      const lv = levelOf(def, n, Number(ae.flags?.[SYSTEM_ID]?.phase) || 0);
      await ae.update({ [`flags.${SYSTEM_ID}.stacks`]: n, name: lv.label, img: lv.icon });
    }
  }

  static async addStack(actor, key, delta = 1, opts = {}) {
    return this.#locked(actor, () => this.#addStack(actor, key, delta, opts));
  }

  static async #addStack(actor, key, delta = 1, { quiet = false } = {}) {
    const def = this.getDef(key);
    if (!def) return;
    const cur = this.getStacks(actor, key);
    if (delta > 0 && cur >= maxStacks(def)) {
      /* Au maximum : l'effet y reste (une zone qui ajoute à chaque tour
         ne prévient pas à chaque fois). */
      if (quiet) return;
      ui.notifications.info(game.i18n.format("SBE.Effects.MaxStacks", { label: def.label || def.key, max: maxStacks(def) }));
      return;
    }
    await this.#setStacks(actor, key, cur + delta);
  }

  /** Les apports d'un acteur, lus sur les DÉFINITIONS (source unique). */
  static contributionsFor(doc) {
    if (doc?.documentName !== "Actor") return [];
    const defs = new Map(this.getDefs().map(d => [d.key, d]));
    const out = [];
    for (const ae of doc.effects ?? []) {
      if (ae.disabled) continue;
      for (const status of ae.statuses ?? []) {
        const def = defs.get(status) ?? (String(status).startsWith("obj_") ? this.getDef(status) : null);
        if (!def) continue;
        const n = Math.max(1, Number(ae.flags?.[SYSTEM_ID]?.stacks) || 1);
        const lv = levelOf(def, n, Number(ae.flags?.[SYSTEM_ID]?.phase) || 0);
        for (const c of lv.changes) {
          out.push({ key: c.key, mode: c.mode, value: c.value, label: lv.label, img: lv.icon,
            n, scale: lv.scaled && (def.stack.enabled || def.escalation.enabled),
            /* Effet discret : connu du MJ et du porteur seulement. */
            public: !def.look?.discreet && !def.hidden });
        }
      }
    }
    return out;
  }

  /**
   * Une action sur un effet, d'où qu'elle vienne (bouton d'objet…) :
   * "apply" | "remove" | "add" (+1 cumul) | "sub" (−1 cumul). Si
   * l'utilisateur ne possède pas l'acteur (une cible), la demande
   * part au MJ principal.
   */
  static async act(actor, key, action, { quiet = false, by = "" } = {}) {
    if (!actor || !this.getDef(key)) return false;
    if (!actor.isOwner) {
      return requestGM({ type: "sbeEffectAct", uuid: actor.uuid, key, action, quiet, by });
    }
    return this.#locked(actor, () => this.#act(actor, key, action, { quiet, by }));
  }

  static async #act(actor, key, action, { quiet = false, by = "" } = {}) {
    if (action === "apply") {
      if (!this.findEffect(actor, key)) await this.#setStacks(actor, key, 1);
    } else if (action === "remove") {
      if (this.findEffect(actor, key)) await this.#turnOff(actor, key);
    } else if (action === "add") await this.#addStack(actor, key, 1, { quiet });
    else if (action === "sub") await this.#addStack(actor, key, -1, { quiet });
    /* Qui l'a posé : retenu sur l'effet (plusieurs poseurs possibles). */
    if (by && (action === "apply" || action === "add")) {
      const ae = this.findEffect(actor, key);
      const list = new Set(ae?.flags?.[SYSTEM_ID]?.by ?? []);
      if (ae && !list.has(by)) await ae.update({ [`flags.${SYSTEM_ID}.by`]: [...list, by] });
    }
    return true;
  }

  /* ============================================================ */
  /*  Effets liés à celui qui les a posés                          */
  /* ============================================================ */

  static #posed = null;

  /** Tous les personnages (du monde et des jetons non liés des scènes). */
  static #allActors() {
    const out = new Set(game.actors?.contents ?? []);
    for (const sc of game.scenes ?? []) for (const t of sc.tokens) if (!t.actorLink && t.actor) out.add(t.actor);
    return [...out];
  }

  /** Index { poseur → [{ actor, key }] }, refait quand un effet bouge. */
  static #posedIndex() {
    if (this.#posed) return this.#posed;
    const idx = new Map();
    for (const a of this.#allActors()) {
      for (const ae of a.effects ?? []) {
        const f = ae.flags?.[SYSTEM_ID] ?? {};
        for (const by of Array.isArray(f.by) ? f.by : []) {
          if (!idx.has(by)) idx.set(by, []);
          for (const k of ae.statuses ?? []) idx.get(by).push({ actor: a, key: k });
        }
      }
    }
    this.#posed = idx;
    return idx;
  }

  static invalidatePosed() { this.#posed = null; }

  /** Combien d'effets ce personnage a posés (tous, ou une clé). */
  static posedCount(byUuid, key = "") {
    const list = this.#posedIndex().get(byUuid) ?? [];
    const k = String(key ?? "");
    return list.filter(e => !k || e.key === k).length;
  }

  /**
   * Retire les effets posés par ce personnage (tous, ou une clé), où
   * qu'ils soient. Posé aussi par d'autres : il n'en est que retiré de
   * la liste. Fait par le MJ principal (les cibles ne sont pas à lui).
   * @returns {Promise<number>} effets touchés
   */
  static async dropPosedBy(byUuid, key = "") {
    if (!byUuid) return 0;
    const n = this.posedCount(byUuid, key);
    if (!isPrimaryGM()) {
      requestGM({ type: "sbeEffectDrop", by: byUuid, key });
      return n;
    }
    const k = String(key ?? "");
    for (const a of this.#allActors()) {
      for (const ae of [...(a.effects ?? [])]) {
        const by = ae.flags?.[SYSTEM_ID]?.by;
        if (!Array.isArray(by) || !by.includes(byUuid)) continue;
        const keys = [...(ae.statuses ?? [])];
        if (k && !keys.includes(k)) continue;
        if (by.length > 1) await ae.update({ [`flags.${SYSTEM_ID}.by`]: by.filter(x => x !== byUuid) });
        else for (const kk of keys.filter(x => this.getDef(x))) await this.#turnOff(a, kk);
      }
    }
    return n;
  }

  /** Les effets posés d'un acteur, prêts à afficher (élément « Effets
      actifs ») : icône, nom, cumuls, temps restant. Les effets discrets
      ne sont listés que pour le MJ et le propriétaire. */
  static listOf(actor) {
    const canSee = game.user.isGM || actor?.isOwner;
    const out = [];
    for (const ae of actor?.effects ?? []) {
      if (ae.disabled) continue;
      const f = ae.flags?.[SYSTEM_ID] ?? {};
      const def = f.key ? this.getDef(f.key) : null;
      if (def?.look?.discreet && !canSee) continue;
      const n = Math.max(1, Number(f.stacks) || 1);
      const lv = def ? levelOf(def, n, Number(f.phase) || 0) : null;
      const left = [];
      if (Number(f.rounds) > 0) left.push(`${f.rounds} r`);
      if (Number(f.seconds) > 0) {
        const sec = Number(f.seconds);
        left.push(sec >= 3600 ? `${Math.ceil(sec / 3600)} h` : sec >= 60 ? `${Math.ceil(sec / 60)} min` : `${sec} s`);
      }
      /* Ce que fait l'effet, lisible : « Agilité +10 · Force ×2 ». */
      const labels = new Map([...walkElements(actor.system?.template?.system?.elements ?? [])]
        .filter(e => e?.key).map(e => [e.key, e.label || e.key]));
      const signed = (v) => (/^[+-]/.test(String(v)) ? String(v) : `+${v}`);
      const fmt = { add: signed, multiply: (v) => `×${v}`, downgrade: (v) => `≤ ${v}`, upgrade: (v) => `≥ ${v}`, override: (v) => `= ${v}` };
      /* Sens : bonus (vert) ou malus (rouge), d'après le montant. */
      const dirOf = (c) => {
        const v = Number(String(c.value).trim());
        if (!Number.isFinite(v)) return "";
        if (c.mode === "multiply") return v > 1 ? "is-up" : (v < 1 ? "is-down" : "");
        if (c.mode === "add") return v > 0 ? "is-up" : (v < 0 ? "is-down" : "");
        return "";
      };
      const doesList = (lv?.changes ?? []).map(c => ({
        text: `${labels.get(c.key) ?? c.key} ${(fmt[c.mode] ?? signed)(String(c.value).trim())}`, dir: dirOf(c) }));
      out.push({
        id: ae.id,
        doesList,
        canRemove: game.user.isGM || !!actor?.isOwner,
        icon: lv?.icon || ae.img || DEFAULT_ICON,
        label: (lv?.label ?? ae.name ?? "").replace(/ ×\d+$/, ""),
        stacks: (def && (def.stack.enabled || def.escalation.enabled) && !(def.escalation.tiers?.length)) ? n : 1,
        left: left.join(" · "),
        description: def?.description || ""
      });
    }
    return out;
  }

  /** Tous les acteurs du monde, jetons non liés compris. */
  static allActors() {
    const out = [...(game.actors?.contents ?? [])];
    for (const scene of game.scenes?.contents ?? []) {
      for (const tok of scene.tokens?.contents ?? []) {
        if (tok.actorLink) continue;
        try { if (tok.actor) out.push(tok.actor); } catch (_e) { /* indisponible */ }
      }
    }
    return out.filter(a => a?.type === "personnage");
  }

  /** Effets posés de cette définition, partout (pour la suppression). */
  static instancesOf(key) {
    const out = [];
    for (const a of this.allActors()) {
      const ae = this.findEffect(a, key);
      if (ae) out.push({ actor: a, ae });
    }
    return out;
  }

  /* ---------------------------------------------------------- */
  /*  Branchements                                               */
  /* ---------------------------------------------------------- */

  static init() {
    if (this._bound) return;
    this._bound = true;

    registerContributionSource("effects", (doc) => this.contributionsFor(doc));

    /* Effets déjà posés avant que l'icône soit forcée (Foundry v14) :
       on la rend visible sur le pion, une fois, côté MJ principal. */
    Hooks.once("ready", async () => {
      const SHOW = globalThis.CONST?.ACTIVE_EFFECT_SHOW_ICON;
      if (!SHOW || !isPrimaryGM()) return;
      for (const actor of this.allActors()) {
        const ups = (actor.effects ?? []).filter(ae => {
          const def = this.getDef(ae.flags?.[SYSTEM_ID]?.key ?? "");
          return def && !def.native && !def.look?.discreet && ae.showIcon === SHOW.CONDITIONAL;
        }).map(ae => ({ _id: ae.id, showIcon: SHOW.ALWAYS }));
        if (ups.length) {
          try { await actor.updateEmbeddedDocuments("ActiveEffect", ups); }
          catch (err) { console.warn("SBE | Effets : icône du pion", err); }
        }
      }
    });

    /* Effets propres à un objet modifiés (par le MJ) : chaque client
       relit les définitions de cet objet. */
    Hooks.on("updateItem", (item, changes) => {
      if (!foundry.utils.hasProperty(changes, `flags.${SYSTEM_ID}.localEffects`)
        && !("name" in changes) && !("img" in changes)) return;
      for (const d of this.localDefsOf(item)) this.#local.set(d.key, d);
    });

    /* Demandes des joueurs sur des acteurs qu'ils ne possèdent pas. */
    onSocketMessage(async (p) => {
      if (p?.type !== "sbeEffectAct" || !isPrimaryGM()) return;
      const actor = await fromUuid(p.uuid).catch(() => null);
      if (actor) await this.act(actor, p.key, p.action, { quiet: !!p.quiet, by: p.by ?? "" });
    });
    onSocketMessage(async (p) => {
      if (p?.type !== "sbeEffectDrop" || !isPrimaryGM()) return;
      await this.dropPosedBy(p.by, p.key ?? "");
    });
    /* L'index « posés par » se refait au besoin. */
    for (const h of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect", "deleteActor", "deleteToken", "createToken"]) {
      Hooks.on(h, (doc) => {
        this.invalidatePosed();
        /* La fiche du poseur relit ses formules (malus d'entretien…). */
        const by = doc?.documentName === "ActiveEffect" ? doc.flags?.[SYSTEM_ID]?.by : null;
        for (const u of Array.isArray(by) ? by : []) {
          const a = fromUuidSync(u);
          if (a?.sheet?.rendered) a.sheet.render();
        }
      });
    }

    /* Durée et cumul posés à la création, depuis la définition. */
    Hooks.on("preCreateActiveEffect", (ae, _d, options) => {
      /* Effet remis par un retour en arrière : tel qu'il était. */
      if (options?.sbeUndo) return;
      const key = [...(ae.statuses ?? [])].find(s => this.getDef(s));
      if (!key) return;
      const def = this.getDef(key);
      const actor = ae.parent;
      /* Posé par un déclencheur ? (marqué juste avant la pose) */
      const tag = `${actor?.uuid}::${key}`;
      const auto = this._autoNext.delete(tag);
      const granted = this._grantNext.delete(tag);
      const lv = levelOf(def, 1);
      const native = def.native ? (this._nativeCache ?? []).find(n => n.id === key) : null;
      const SHOW = globalThis.CONST?.ACTIVE_EFFECT_SHOW_ICON;
      const div = actor?.documentName === "Actor" ? this.durationDivisor(actor, key) : 1;
      ae.updateSource({
        name: def.native ? (def.label || game.i18n.localize(native?.name ?? key)) : lv.label,
        img: def.native ? paint(def, def.icon || native?.img || DEFAULT_ICON) : lv.icon,
        /* Discret : pas d'icône native (le calque SBE la montre au MJ et
           au propriétaire seulement). */
        /* Icône sur le pion : TOUJOURS (Foundry v14 ne la montre seul que
           pour une durée « à lui », or la durée SBE vit dans nos drapeaux).
           Discret : jamais (le calque SBE la montre au MJ et au porteur). */
        ...(SHOW ? { showIcon: def.look.discreet ? SHOW.NEVER : SHOW.ALWAYS } : {}),
        [`flags.${SYSTEM_ID}`]: {
          custom: true, key, auto, granted, phase: 0,
          stacks: 1,
          rounds: scaleDuration(def.duration.rounds, div),
          seconds: scaleDuration(def.duration.seconds, div),
          ...(div > 1 ? { div } : {}),
          /* Effet propre à un objet : sa définition voyage avec lui. */
          ...(String(key).startsWith("obj_") ? { def: foundry.utils.deepClone(def) } : {})
        }
      });
    });

    /* Groupe exclusif : poser un effet retire les autres du groupe. */
    Hooks.on("createActiveEffect", async (ae, options) => {
      if (!isPrimaryGM() || options?.sbeUndo) return;
      const key = ae.flags?.[SYSTEM_ID]?.key;
      const def = key ? this.getDef(key) : null;
      const actor = ae.parent;
      if (!def?.group || actor?.documentName !== "Actor") return;
      const others = (actor.effects ?? []).filter(e => e.id !== ae.id
        && this.getDef(e.flags?.[SYSTEM_ID]?.key ?? "")?.group === def.group);
      if (others.length) await actor.deleteEmbeddedDocuments("ActiveEffect", others.map(e => e.id));
    });

    /* La fiche se recalcule quand un effet arrive, change ou part. */
    for (const h of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
      Hooks.on(h, (ae) => {
        const actor = ae.parent;
        if (actor?.documentName === "Actor" && actor.sheet?.rendered) actor.sheet.render();
      });
    }

    /* DURÉE — en combat : un round de moins à chaque nouveau round. */
    Hooks.on("updateCombat", (combat, changed) => {
      if (!isPrimaryGM() || !isNewRound(combat, changed)) return;
      const seen = new Set();
      for (const c of combat.combatants ?? []) {
        const a = c.actor;
        if (!a || seen.has(a.uuid)) continue;
        seen.add(a.uuid);
        this._tick(a, "rounds", 1);
      }
    });

    /* DURÉE — hors combat : le temps de jeu, en SECONDES (l'ancien
       système stockait des millisecondes et les décomptait comme des
       secondes : 60 s duraient 60 000 s). */
    Hooks.on("updateWorldTime", (_worldTime, dt) => {
      if (!isPrimaryGM() || !(dt > 0)) return;
      for (const a of this.allActors()) {
        if (this._inCombat(a)) continue;
        this._tick(a, "seconds", dt);
      }
    });
  }

  /** Diviseur de durée d'un effet reçu par ce personnage (1 = aucun). */
  static durationDivisor(actor, key) {
    let sc = {};
    try { sc = docScope(actor); } catch (_e) { return 1; }
    const vals = [`${DURATION_KEY}_effets`, `${DURATION_KEY}_${key}`].map(k => Number(sc[k])).filter(Number.isFinite);
    return Math.max(1, ...vals);
  }

  static _inCombat(actor) {
    for (const combat of game.combats?.contents ?? []) {
      if (!combat.started) continue;
      for (const c of combat.combatants ?? []) if (c.actor?.uuid === actor.uuid) return true;
    }
    return false;
  }

  /** Décompte un compteur de durée ; à zéro, l'effet passe à sa
      phase suivante, ou part s'il n'en a plus. */
  static _tick(actor, field, amount) {
    /* Dans la file des effets de la fiche : deux avancées du temps
       rapprochées décomptent toutes les deux (sans s'écraser). */
    return this.#locked(actor, () => this.#tickNow(actor, field, amount));
  }

  static async #tickNow(actor, field, amount) {
    const expired = [];
    const updates = [];
    for (const ae of actor.effects ?? []) {
      const f = ae.flags?.[SYSTEM_ID];
      if (!f?.custom) continue;
      const left = Number(f[field]) || 0;
      if (left <= 0) continue;   /* 0 = ce compteur ne s'applique pas */
      let next = left - amount;
      if (next > 0) { updates.push({ _id: ae.id, [`flags.${SYSTEM_ID}.${field}`]: next }); continue; }
      /* Le compteur est épuisé : on passe aux phases suivantes, et le
         temps EN TROP continue de s'écouler dessus (une nuit de 8 h
         traverse un effet de 30 min ET son contrecoup d'1 h). */
      const def = this.getDef(f.key);
      let phase = Number(f.phase) || 0;
      let ph = null;
      let gone = false;
      while (next <= 0) {
        const nextPh = def?.phases?.[phase];
        if (!nextPh) { gone = true; break; }
        phase += 1;
        ph = nextPh;
        const len = scaleDuration(nextPh[field], f.div);
        if (len <= 0) { next = 0; break; }   /* cette phase ne se décompte pas ici */
        next += len;
      }
      if (gone) { expired.push(ae.id); continue; }
      const lv = levelOf(def, Number(f.stacks) || 1, phase);
      updates.push({
        _id: ae.id, name: lv.label, img: lv.icon,
        [`flags.${SYSTEM_ID}.phase`]: phase,
        [`flags.${SYSTEM_ID}.rounds`]: field === "rounds" ? Math.max(0, next) : scaleDuration(ph.rounds, f.div),
        [`flags.${SYSTEM_ID}.seconds`]: field === "seconds" ? Math.max(0, next) : scaleDuration(ph.seconds, f.div)
      });
    }
    try {
      if (updates.length) await actor.updateEmbeddedDocuments("ActiveEffect", updates);
      if (expired.length) await actor.deleteEmbeddedDocuments("ActiveEffect", expired);
    } catch (err) {
      console.warn("SBE | Effets : décompte de durée en échec", err);
    }
  }

  /* ---------------------------------------------------------- */
  /*  Clés proposées dans l'éditeur                              */
  /* ---------------------------------------------------------- */

  /** Clés numériques des modèles de personnage, sous-clés de jauge
      comprises (pv_max…) : ce qu'un effet peut modifier. */
  static keyOptions() {
    const map = new Map();
    for (const tpl of (game.actors?.contents ?? []).filter(a => a.type === "template")) {
      for (const el of walkElements(tpl.system.elements ?? [])) {
        if (!el?.key) continue;
        if (el.kind === "number") {
          map.set(el.key, el.label || el.key);
          /* Nombre borné (max saisi ou en formule, min posé) : ses bornes
             se modifient comme celles d'une jauge. */
          const c = el.config ?? {};
          const lb = el.label || el.key;
          if (String(c.maxFormula ?? "").trim() || (c.max !== undefined && c.max !== "")) map.set(`${el.key}_max`, `${lb} (max)`);
          if (c.min !== undefined && c.min !== "") map.set(`${el.key}_min`, `${lb} (min)`);
        }
        if (el.kind === "gauge") {
          const lb = el.label || el.key;
          map.set(`${el.key}_max`, `${lb} (max)`);
          map.set(`${el.key}_min`, `${lb} (min)`);
        }
      }
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], game.i18n.lang))
      .map(([key, label]) => ({ key, label }));
  }

  /** Clés que l'on peut ÉCRIRE (périodiques) : nombres saisis, jauges. */
  static valueKeyOptions() {
    return this._keysWhere(el => el.kind === "gauge" || (el.kind === "number" && !el.config?.computed));
  }

  /** Clés qui portent un JET configuré (jets de résistance). */
  static rollKeyOptions() {
    return this._keysWhere(el => !!el.config?.roll?.on);
  }

  static _keysWhere(test) {
    const map = new Map();
    for (const tpl of (game.actors?.contents ?? []).filter(a => a.type === "template")) {
      for (const el of walkElements(tpl.system.elements ?? [])) {
        if (el?.key && test(el) && !map.has(el.key)) map.set(el.key, el.label || el.key);
      }
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], game.i18n.lang))
      .map(([key, label]) => ({ key, label }));
  }
}

/* ============================================================ */
/*  HUD DU JETON : cumuls au clic                                */
/* ============================================================ */
/* Sur un effet CUMULABLE, le HUD natif ne sait que poser/retirer. On
   prend la main au pointerdown : clic gauche +1, clic droit −1 (retrait
   à 0), et on avale les événements suivants pour que Foundry ne
   bascule pas l'effet derrière nous. Les effets non cumulables gardent
   le comportement natif. */

function hudHit(ev) {
  const ctrl = ev.target?.closest?.(".status-effects [data-status-id]");
  if (!ctrl) return null;
  const def = EffectManager.getDef(ctrl.dataset.statusId);
  if (!(def?.stack?.enabled || hasTiers(def))) return null;
  const actor = canvas?.hud?.token?.object?.actor;
  return actor ? { actor, def } : null;
}

function onHudPointerDown(ev) {
  const hit = hudHit(ev);
  if (!hit) return;
  ev.preventDefault();
  ev.stopImmediatePropagation();
  const delta = ev.button === 2 ? -1 : (ev.button === 0 ? 1 : 0);
  if (delta) EffectManager.addStack(hit.actor, hit.def.key, delta).then(() => canvas?.hud?.token?.render?.());
}

function swallow(ev) {
  if (hudHit(ev)) { ev.preventDefault(); ev.stopImmediatePropagation(); }
}

document.addEventListener("pointerdown", onHudPointerDown, true);
for (const t of ["mousedown", "mouseup", "click", "contextmenu"]) document.addEventListener(t, swallow, true);

/* Le nombre de cumuls se lit au survol de l'icône dans le HUD. */
Hooks.on("renderTokenHUD", (hud, html) => {
  try {
    const root = html instanceof HTMLElement ? html : html?.[0];
    const actor = hud?.object?.actor;
    if (!root || !actor) return;
    for (const ctrl of root.querySelectorAll(".status-effects [data-status-id]")) {
      const def = EffectManager.getDef(ctrl.dataset.statusId);
      if (!def) continue;
      const n = EffectManager.getStacks(actor, def.key);
      const name = def.label || def.key;
      ctrl.dataset.tooltipText = (def.stack.enabled || hasTiers(def))
        ? `${n ? levelOf(def, n).label : name} — ${game.i18n.localize("SBE.Effects.HudStackHint")}`
        : name;
    }
  } catch (err) {
    console.warn("SBE | Effets : HUD en échec", err);
  }
});
