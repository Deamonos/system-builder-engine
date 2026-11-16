/**
 * SBE — Gestionnaire de MÉDIAS (sons, et animations au palier suivant)
 *
 * Le moteur ne connaît aucun événement de jeu : « tir », « recharge »,
 * « impact » n'existent pas ici. Il sait seulement JOUER un média
 * nommé, avec les règles que le créateur a posées dessus :
 *
 *   qui       MJ seul / propriétaire de la fiche / toute la table
 *   portée    vide = partout ; sinon une distance en unités de scène,
 *             mesurée entre la SOURCE et le jeton de l'auditeur
 *   atténué   le volume décroît jusqu'au silence au bord de la portée
 *   volume    0 à 100 %
 *   répéter   N fois, toutes les X ms (N vient d'une formule côté
 *             déclencheur : la « rafale » n'est qu'une répétition)
 *
 * DÉCOUPAGE (décision actée) :
 * - le MODÈLE (atelier) déclare les NOMS de médias et les déclencheurs
 *   qui les appellent — c'est de la structure, écrite une fois ;
 * - l'OBJET porte les fichiers : un fusil à pompe et un pistolet
 *   partagent le même modèle mais pas le même son.
 *
 * ANIMATION (même ligne, même public, même portée que le son) : une
 * image ou une vidéo jouée sur la scène (media-anim.mjs) — sur le
 * porteur, sur la cible, en trajet de l'un à l'autre, ou au point visé.
 *
 * ZÉRO dépendance : foundry.audio.AudioHelper pour le son, PIXI pour
 * l'animation, le hub socket du système pour la diffusion.
 */

import { activeTokenOf } from "../../helpers/canvas-utils.mjs";
import { onSocketMessage, emitSocket } from "../../helpers/socket.mjs";
import { carrierOf } from "../../builder/inventory.mjs";
import { testSound, primeSound } from "./ui-sound.mjs";
import { soundGain } from "../../helpers/constants.mjs";
import { MediaAnim, ANIM_PLACES } from "./media-anim.mjs";

/** Qui reçoit le média. */
export const MEDIA_AUDIENCE = ["gm", "owner", "all"];

/** Attente maximale des images avant de lancer le son quand même (ms). */
const ANIM_WAIT_MS = 1500;
/* En dessous de ce seuil, demander N lectures à la suite à l'API audio
   devient imprévisible (sons avalés, décalages) : on duplique alors la
   source pour tenir la cadence. */
const TIGHT_INTERVAL_MS = 200;

/** Réglages par défaut d'une ligne de média. */
export function mediaDefaults() {
  return { sound: "", volume: 80, audience: "all", range: null, falloff: false,
    anim: "", animSize: 1, animPlace: "source", animScreen: false, animDuration: 1.5, animRandom: false, next: null };
}

/** Ce que joue un média : les deux, le son seul, l'animation seule. */
export const MEDIA_MODES = ["both", "sound", "anim"];

/**
 * L'objet qui PORTE les médias : l'objet du monde (modèle) pour un
 * exemplaire, sinon l'objet lui-même. Une seule vérité : régler les
 * médias de l'objet du monde vaut pour tous ses exemplaires, déjà
 * distribués compris.
 */
export function mediaHolder(item) {
  if (!item) return null;
  const model = item.system?.modelId ? game.items?.get?.(item.system.modelId) : null;
  return model && model !== item ? model : item;
}

/** La ligne de média d'un objet pour un nom déclaré (défauts compris). */
export function mediaEntryOf(item, defId) {
  const raw = mediaHolder(item)?.system?.media?.[defId] ?? {};
  const d = mediaDefaults();
  const range = Number(raw.range);
  return {
    sound: String(raw.sound ?? d.sound),
    volume: Number.isFinite(Number(raw.volume)) ? Number(raw.volume) : d.volume,
    audience: MEDIA_AUDIENCE.includes(raw.audience) ? raw.audience : d.audience,
    range: Number.isFinite(range) && range > 0 ? range : null,
    falloff: !!raw.falloff,
    anim: String(raw.anim ?? d.anim),
    animSize: Number(raw.animSize) > 0 ? Number(raw.animSize) : d.animSize,
    animPlace: ANIM_PLACES.includes(raw.animPlace) ? raw.animPlace : d.animPlace,
    animScreen: !!raw.animScreen,
    animDuration: Number(raw.animDuration) > 0 ? Number(raw.animDuration) : d.animDuration,
    animRandom: !!raw.animRandom,
    /* Média joué en premier (le tir) : le suivant (l'issue) part après
       ce délai en ms ; vide = à la fin du son. */
    next: raw.next !== null && raw.next !== undefined && raw.next !== "" && Number.isFinite(Number(raw.next)) ? Math.max(0, Number(raw.next)) : null
  };
}

/** Noms de médias déclarés par le modèle d'un objet. */
export function mediaDefsOf(item) {
  const defs = item?.system?.template?.system?.mediaDefs;
  return Array.isArray(defs) ? defs.filter(d => d?.id) : [];
}

export class MediaManager {

  static _bound = false;

  /** Écoute les demandes de lecture venues des autres clients. */
  static init() {
    if (this._bound) return;
    this._bound = true;
    MediaAnim.init();
    onSocketMessage((payload) => {
      if (payload?.type !== "sbeMediaPlay") return;
      this._playHere(payload.media, payload.ctx ?? {}, payload.users);
    });
  }

  /* ---------------------------------------------------------- */
  /*  Lecture                                                    */
  /* ---------------------------------------------------------- */

  /**
   * Joue un média nommé d'un objet.
   *
   * @param {Item}   item     l'objet qui porte les fichiers
   * @param {string} defId    nom déclaré par le modèle
   * @param {object} [opts]
   * @param {number} [opts.repeat=1]    nombre de lectures
   * @param {number} [opts.interval=0]  intervalle en ms
   * @param {object} [opts.origin]      { x, y } position de la source
   * @param {string} [opts.mode]        "both" | "sound" | "anim"
   * @param {Array}  [opts.targets]     cibles (acteurs, jetons ou {x, y})
   * @param {object} [opts.point]       { x, y } point visé / d'impact
   */
  static async play(item, defId, opts = {}) {
    const entry = mediaEntryOf(item, defId);
    const mode = MEDIA_MODES.includes(opts.mode) ? opts.mode : "both";
    const withSound = mode !== "anim" && !!entry.sound;
    const withAnim = mode !== "sound" && !!entry.anim;
    if (!withSound && !withAnim) return false;

    /* La source : la position annoncée, sinon le jeton de la fiche qui
       porte l'objet — un son sans source est simplement global. */
    const origin = opts.origin ?? this.originOf(item);
    const media = {
      ...entry,
      sound: withSound ? entry.sound : "",
      anim: withAnim ? entry.anim : "",
      repeat: Math.max(1, Math.floor(Number(opts.repeat) || 1)),
      interval: Math.max(0, Math.floor(Number(opts.interval) || 0))
    };
    const ctx = {
      origin, actorId: opts.actorId || this.actorIdOf(item),
      targets: (Array.isArray(opts.targets) ? opts.targets : []).map(t => this.posOf(t)).filter(Boolean),
      point: opts.point && Number.isFinite(Number(opts.point.x)) ? { x: Number(opts.point.x), y: Number(opts.point.y) } : null
    };

    /* Qui est concerné : on le décide ICI (une seule vérité), et chaque
       client vérifie seulement sa propre distance. */
    const users = this.audienceIds(media.audience, ctx.actorId);
    if (!users.length) return false;

    if (users.includes(game.user.id)) this._playHere(media, ctx, users);
    const others = users.filter(id => id !== game.user.id);
    if (others.length) emitSocket({ type: "sbeMediaPlay", media, ctx, users: others });
    return true;
  }

  /** Lecture d'essai depuis la fiche : pour celui qui règle, lui seul. */
  static async test(item, defId) {
    const entry = mediaEntryOf(item, defId);
    /* Ni portée ni public : on veut s'entendre, pas jouer la scène.
       Chaque échec (vide, format, fichier illisible) est affiché.
       L'animation se joue sur le pion choisi (ou celui du porteur),
       vers la cible marquée s'il y en a une. */
    if (entry.anim && canvas?.ready) {
      const tok = canvas.tokens?.controlled?.[0] ?? null;
      const origin = tok ? { ...tok.center } : this.originOf(item);
      const targets = [...(game.user.targets ?? [])].map(t => this.posOf(t)).filter(Boolean);
      const at = origin ?? { x: canvas.dimensions?.width / 2 || 0, y: canvas.dimensions?.height / 2 || 0 };
      MediaAnim.play(entry, { origin: at, targets, point: targets[0] ?? null });
      if (!origin) ui.notifications.info(game.i18n.localize("SBE.Media.AnimTestHint"));
    }
    if (!entry.sound) return !!entry.anim;
    return testSound(entry.sound, entry.volume / 100);
  }

  /** Délai avant le média suivant (ms) : celui réglé sur la ligne, sinon
      la durée de son son (0 sans son). */
  static async nextDelay(item, defId) {
    const e = mediaEntryOf(item, defId);
    if (e.next !== null) return e.next;
    return this.soundLength(item, defId);
  }

  /** Durée du son d'une ligne de média, en millisecondes (0 sans son). */
  static async soundLength(item, defId) {
    const e = mediaEntryOf(item, defId);
    if (!e.sound) return 0;
    await primeSound(e.sound);
    const b = game.audio?.buffers?.getBuffer?.(e.sound);
    return b?.duration ? Math.round(b.duration * 1000) : 0;
  }

  /** Position d'une cible : un acteur (son jeton), un jeton, ou {x, y}. */
  static posOf(t) {
    if (!t) return null;
    if (Number.isFinite(Number(t.x)) && Number.isFinite(Number(t.y)) && !t.document && !t.documentName) return { x: Number(t.x), y: Number(t.y) };
    const tok = t.documentName === "Actor" ? activeTokenOf(t)
      : t.documentName === "Token" ? t.object
      /* Objet posé (cible attaquable) : le pion qui le porte. */
      : t.documentName === "Item" ? t.parent?.token?.object : t;
    const c = tok?.center;
    return c ? { x: c.x, y: c.y } : null;
  }

  /* ---------------------------------------------------------- */
  /*  Destinataires et distances                                 */
  /* ---------------------------------------------------------- */

  /** Identifiants des utilisateurs concernés par ce public. */
  static audienceIds(audience, actorId) {
    const users = game.users.filter(u => u.active);
    if (audience === "gm") return users.filter(u => u.isGM).map(u => u.id);
    if (audience === "owner") {
      const actor = actorId ? game.actors.get(actorId) : null;
      return users.filter(u => u.isGM || (actor && actor.testUserPermission(u, "OWNER")))
        .map(u => u.id);
    }
    return users.map(u => u.id);
  }

  /** La fiche qui porte l'objet (pour « propriétaire ») : pour un objet
      posé, le personnage qui l'utilise (pas le personnage caché des
      objets de scène, que personne ne possède). */
  static actorIdOf(item) {
    const user = carrierOf(item);
    if (user?.documentName === "Actor" && !user.isToken) return user.id;
    return item?.parent?.documentName === "Actor" ? item.parent.id : "";
  }

  /** Position de la source : le jeton de la fiche, s'il y en a un. */
  static originOf(item) {
    const actor = item?.parent?.documentName === "Actor" ? item.parent : null;
    /* Objet d'un pion non lié (objet posé : tourelle…) : CE pion —
       getActiveTokens(true) ne rend que les pions liés. */
    const token = activeTokenOf(actor);
    if (!token) return null;
    const c = token.center ?? { x: token.x, y: token.y };
    return { x: c.x, y: c.y, sceneId: token.scene?.id ?? canvas.scene?.id ?? "" };
  }

  /**
   * Facteur de volume pour CE client : 1 = plein, 0 = inaudible.
   * Sans portée, ou sans source, ou sans jeton à soi : plein volume —
   * on n'invente pas de silence par manque d'information.
   */
  static _distanceFactor(media, ctx) {
    if (!media.range || !ctx?.origin) return 1;
    if (ctx.origin.sceneId && canvas.scene?.id && ctx.origin.sceneId !== canvas.scene.id) return 0;

    const tokens = (canvas.tokens?.placeables ?? [])
      .filter(t => t.actor?.isOwner && !t.document.hidden);
    if (!tokens.length) return game.user.isGM ? 1 : 0;

    const grid = canvas.scene?.grid;
    const perUnit = (grid?.size ?? 100) / (grid?.distance || 1);  /* px par unité */
    let best = Infinity;
    for (const t of tokens) {
      const c = t.center ?? { x: t.x, y: t.y };
      const dist = Math.hypot(c.x - ctx.origin.x, c.y - ctx.origin.y) / perUnit;
      if (dist < best) best = dist;
    }
    if (best > media.range) return 0;
    if (!media.falloff) return 1;
    /* Décroissance linéaire : plein au contact, silence au bord. */
    return Math.max(0, 1 - best / media.range);
  }

  /* ---------------------------------------------------------- */
  /*  Sortie audio                                               */
  /* ---------------------------------------------------------- */

  /** Lecture sur CE client, si tant est qu'il soit concerné. */
  static async _playHere(media, ctx, users) {
    if (Array.isArray(users) && !users.includes(game.user.id)) return;
    const factor = this._distanceFactor(media, ctx);
    if (factor <= 0) return;
    /* L'animation se voit en entier dans la portée (pas d'atténuation). */
    /* Une animation impossible (pas de source…) ne coupe pas le son. */
    if (media.anim) {
      /* Répétée au même rythme que le son (rafale : un tir par coup).
         Toutes les images sont PRÉPARÉES d'abord (vidéos chargées), puis
         image et son partent ensemble — jamais le son avant l'image. On
         n'attend pas plus de ANIM_WAIT_MS : un fichier lent ne retient
         pas le son indéfiniment. */
      const n = Math.max(1, Math.floor(Number(media.repeat) || 1));
      const gap = n > 1 ? Math.max(20, Math.floor(Number(media.interval) || 0)) : 0;
      const prep = Promise.all(Array.from({ length: n }, () => MediaAnim.prepare(media, ctx).catch(() => null)));
      const starts = await Promise.race([prep, new Promise(r => { setTimeout(() => r(null), ANIM_WAIT_MS); })]);
      if (starts) starts.forEach((go, i) => { if (!go) return; if (i) setTimeout(go, i * gap); else go(); });
      else prep.then(list => list.forEach((go, i) => { if (!go) return; if (i) setTimeout(go, i * gap); else go(); }));
    }
    if (media.sound) await this._sound(media.sound, soundGain(media.volume) * factor,
      media.repeat, media.interval);
  }

  /**
   * Joue un son, éventuellement plusieurs fois.
   * Aux intervalles serrés, on prépare une source par lecture plutôt
   * que de rappeler l'API en boucle : c'est ce qui tient la cadence.
   */
  static async _sound(path, volume, repeat = 1, interval = 0) {
    const vol = Math.max(0, Math.min(1, Number(volume) || 0));
    if (!path || vol <= 0) return;
    const n = Math.max(1, Math.floor(repeat));

    if (n === 1) { await this._once(path, vol); return; }

    if (interval >= TIGHT_INTERVAL_MS) {
      for (let i = 0; i < n; i++) {
        await this._once(path, vol);
        if (i < n - 1) await new Promise(r => { setTimeout(r, interval); });
      }
      return;
    }
    /* Cadence serrée : lectures préparées puis déclenchées au rythme. */
    for (let i = 0; i < n; i++) {
      const delay = i * Math.max(20, interval);
      setTimeout(() => { this._once(path, vol); }, delay);
    }
  }

  /** Une lecture, sans jamais faire remonter d'erreur à l'écran. */
  static async _once(path, volume) {
    try {
      await primeSound(path);
      await foundry.audio.AudioHelper.play({ src: path, volume, autoplay: true, loop: false }, false);
    } catch (err) {
      console.warn("SBE | Média : lecture en échec", path, err);
    }
  }
}
