/**
 * SBE — Socket & écritures déléguées
 *
 * Hub unique sur le canal `system.<id>` :
 * - onSocketMessage(handler) : abonne un handler (tous les managers
 *   partagent le même canal, chacun filtre par payload.type) ;
 * - isPrimaryGM() : vrai si CE client est le premier MJ actif — seul
 *   lui applique les demandes des joueurs (évite les doublons) ;
 * - requestGM(payload) : une demande au MJ ; sans MJ connecté, rien ne
 *   part et le joueur est prévenu (needGM) ;
 * - gmQueue(clé, tâche) : côté MJ, les demandes qui touchent la même
 *   chose (un marchand, un coffre, un objet) passent une par une ;
 * - updateWallSafe : l'état d'une porte (ouverte / fermée) et sa
 *   serrure, que les joueurs n'ont pas le droit de modifier, routés au
 *   MJ primaire par socket quand l'utilisateur est un joueur ; le MJ
 *   n'applique que ces champs-là.
 *
 * Brique transverse : tous les futurs managers de scène (coffres,
 * pièges, marchands…) passent par ici.
 */

import { SYSTEM_ID } from "./constants.mjs";
import { lockStateFromPlayer } from "./lock-state.mjs";

const CHANNEL = `system.${SYSTEM_ID}`;
const handlers = [];
let hubInstalled = false;
/* Retour en arrière : l'action en cours part avec chaque demande, et le
   MJ traite la demande « sous » cette action (managers/undo). */
let runTagOut = null;
let runWrapIn = null;

/** Branche le marquage des demandes par l'action en cours. */
export function setSocketRunTag(out, wrapIn) {
  runTagOut = typeof out === "function" ? out : null;
  runWrapIn = typeof wrapIn === "function" ? wrapIn : null;
}

/** Vrai si ce client est le premier MJ actif. */
export function isPrimaryGM() {
  return !!game.users?.activeGM?.isSelf;
}

/* ============================================================ */
/*  REPRISE par un autre MJ                                      */
/* ============================================================ */
/* Une demande envoyée à l'instant où le MJ principal se déconnecte : il
   peut partir sans la traiter, et l'autre MJ l'a ignorée (il n'était pas
   encore principal). Chaque message porte un numéro ; le principal
   annonce « commencé » AVANT de la traiter (ce signal part avant toute
   écriture, sur la même connexion : le serveur le relaie même si le MJ
   part juste après), puis « fini » (par paquets). Les autres MJ gardent
   les demandes quelques secondes ; quand le principal part, celui qui
   prend la suite rejoue celles jamais commencées et signale celles
   commencées mais pas finies (les rejouer risquerait un doublon). */
const RELAY = "sbeRelay";
const KEEP_MS = 10_000;
const DONE_EVERY = 500;
const TAKEOVER_WAIT = 1000;
/* Chez les MJ qui ne sont pas principaux : numéro → demande gardée. */
const KEPT = new Map();
/* Chez le principal : numéros finis, envoyés par paquets. */
let doneOut = [];
let doneTimer = null;

function relayDone(rid) {
  doneOut.push(rid);
  if (doneTimer) return;
  doneTimer = setTimeout(() => {
    doneTimer = null;
    const ids = doneOut;
    doneOut = [];
    if (ids.length) game.socket.emit(CHANNEL, { type: RELAY, op: "done", ids });
  }, DONE_EVERY);
}

/** Les files de travail en cours (leur fin = la demande est finie). */
function queuesNow() {
  return [...QUEUES.values()];
}

/** Distribue un message aux handlers ; le principal le suit (commencé → fini). */
function deliver(payload, { track = false } = {}) {
  const rid = typeof payload?._rid === "string" ? payload._rid : null;
  const followed = track && rid && game.user.isGM && isPrimaryGM();
  if (followed) game.socket.emit(CHANNEL, { type: RELAY, op: "begin", ids: [rid] });
  const dispatch = () => {
    const outs = [];
    for (const handler of handlers) {
      try { outs.push(handler(payload)); }
      catch (err) { console.warn("SBE | Socket : handler en échec", err); }
    }
    return outs;
  };
  let outs;
  if (payload?._sbeRun && runWrapIn) outs = runWrapIn(payload._sbeRun, dispatch);
  else outs = dispatch();
  if (!followed) return;
  /* Fini quand les handlers ET les files qu'ils ont lancées ont fini. */
  const tails = queuesNow();
  Promise.allSettled([...(Array.isArray(outs) ? outs : [outs]), ...tails]).then(() => relayDone(rid));
}

/** Un MJ non principal garde la demande (au cas où le principal partirait). */
function keep(payload) {
  const now = Date.now();
  for (const [id, k] of KEPT) if (now - k.at > KEEP_MS) KEPT.delete(id);
  KEPT.set(payload._rid, { payload, at: now, begun: null, done: false });
}

function onRelay(p, senderId) {
  if (!game.user.isGM || !Array.isArray(p.ids)) return;
  for (const id of p.ids) {
    const k = KEPT.get(id);
    if (!k) continue;
    if (p.op === "begin") k.begun = senderId;
    else if (p.op === "done") KEPT.delete(id);
  }
}

/** Le principal est parti : celui qui prend la suite reprend ses demandes. */
function takeOver(gone) {
  setTimeout(() => {
    if (!game.user.isGM || !isPrimaryGM()) return;
    const list = [...KEPT.values()].sort((a, b) => a.at - b.at);
    KEPT.clear();
    for (const k of list) {
      const from = game.users.get(k.payload._from);
      if (k.begun === gone.id) {
        /* Commencée, peut-être à moitié : on prévient, sans rejouer. */
        ui.notifications?.warn(game.i18n.format("SBE.Relay.Unsure", { player: from?.name ?? "?", gm: gone.name }));
        if (from && !from.isGM) notifyUser(from.id, "warn", "SBE.Relay.UnsurePlayer", { gm: gone.name });
        continue;
      }
      if (k.begun) continue;
      deliver(k.payload, { track: true });
    }
  }, TAKEOVER_WAIT);
}

/** Installe le hub (une seule fois). Appelé par sbe-main au ready. */
export function installSocketHub() {
  if (hubInstalled) return;
  hubInstalled = true;
  game.socket.on(CHANNEL, (payload, senderId) => {
    /* L'EXPÉDITEUR est donné par le serveur (impossible à falsifier). Un
       joueur ne parle qu'en son nom : les champs qui désignent le
       demandeur sont remplacés par son identité réelle. Les messages
       d'un MJ restent tels quels (ils désignent souvent un destinataire). */
    if (payload && typeof payload === "object" && typeof senderId === "string") {
      payload._from = senderId;
      const sender = game.users?.get(senderId);
      if (sender && !sender.isGM) {
        for (const k of ["userId", "user", "u"]) if (k in payload) payload[k] = senderId;
        if (payload.req && typeof payload.req === "object" && "userId" in payload.req) payload.req.userId = senderId;
      }
    }
    if (payload?.type === RELAY) return onRelay(payload, senderId);
    /* Suivi pour la reprise : les demandes des joueurs, sans destinataire
       précis (celles-là vont au MJ principal). */
    const track = !!payload?._rid && !payload.to && !game.users?.get(senderId)?.isGM;
    if (track && game.user.isGM && !isPrimaryGM()) keep(payload);
    deliver(payload, { track });
  });
  Hooks.on("userConnected", (user, connected) => {
    if (connected || !user?.isGM || !game.user.isGM) return;
    takeOver(user);
  });
}

/** Abonne un handler au canal système. */
export function onSocketMessage(handler) {
  if (typeof handler === "function") handlers.push(handler);
}

/** Émet un message sur le canal système. */
export function emitSocket(payload) {
  const run = runTagOut?.() ?? null;
  let out = run && payload && typeof payload === "object" ? { ...payload, _sbeRun: run } : payload;
  /* Une demande de joueur porte un numéro (reprise par un autre MJ). */
  if (!game.user.isGM && out && typeof out === "object" && !out.to) out = { ...out, _rid: foundry.utils.randomID() };
  game.socket.emit(CHANNEL, out);
}

/**
 * Un MJ est-il là pour traiter une demande ? Sinon le joueur est prévenu
 * (sauf `quiet`, pour les signaux de fond sans action visible).
 */
export function needGM({ quiet = false } = {}) {
  if (game.users?.activeGM) return true;
  if (!quiet) ui.notifications?.warn(game.i18n.localize("SBE.Common.NoGM"));
  return false;
}

/**
 * Envoie une demande au MJ principal. Faux (et rien n'est envoyé) quand
 * aucun MJ n'est connecté : l'appelant s'arrête là, sans rien changer.
 */
export function requestGM(payload, { quiet = false } = {}) {
  if (!needGM({ quiet })) return false;
  emitSocket(payload);
  return true;
}

/**
 * Prévient un JOUEUR précis (message traduit chez lui). Le MJ principal
 * qui termine une action lancée par un joueur (fin d'une attente…) :
 * la notification part chez celui qui l'a lancée, pas chez le MJ.
 */
export function notifyUser(userId, level, key, data = {}) {
  const lvl = ["info", "warn", "error"].includes(level) ? level : "info";
  if (!userId || userId === game.user.id || !game.users?.get(userId)?.active) {
    if (!userId || userId === game.user.id) ui.notifications?.[lvl](game.i18n.format(key, data));
    return;
  }
  emitSocket({ type: "sbeNotify", to: userId, level: lvl, key: String(key), data });
}

/* ============================================================ */
/*  RÉPONSES DES MJ aux cartes de demande (niveau, talent, achat)  */
/* ============================================================ */
/* Deux MJ qui cliquent « Accepter » en même temps : sans arbitre, la
   demande passerait deux fois (deux achats, deux niveaux). Toute réponse
   est donc traitée par le MJ PRINCIPAL, une à la fois par carte — la
   seconde trouve la carte déjà fermée. */
const ANSWERS = new Map();

/** Enregistre le traitement des réponses d'une sorte de carte. */
export function onCardAnswer(kind, handler) {
  if (typeof handler === "function") ANSWERS.set(String(kind), handler);
}

/** Un MJ répond à une carte : relayée au MJ principal, en file par carte. */
export function answerCard(kind, message, yes) {
  if (!game.user.isGM || !message?.id) return null;
  if (!isPrimaryGM()) {
    emitSocket({ type: "sbeCardAnswer", kind: String(kind), msg: message.id, yes: !!yes, by: game.user.name });
    return null;
  }
  return runAnswer(String(kind), message, !!yes, game.user.name);
}

function runAnswer(kind, message, yes, by) {
  const handler = ANSWERS.get(kind);
  if (!handler) return null;
  return gmQueue(`answer:${message.id}`, () => handler(message, yes, by));
}

/* Écarts envoyés au MJ et attendus (nonce → résolution). */
const WAITING = new Map();

/**
 * ÉCARTS de valeurs (« +5 », « −1 ») appliqués par le MJ principal sur la
 * valeur du moment, et ATTENDUS : la suite (l'étape d'après d'un bouton)
 * lit la valeur déjà modifiée. Un seul écrivain par valeur : un soin du
 * joueur et des dégâts du MJ au même instant s'additionnent toujours.
 * @returns {Promise<boolean>} faux sans MJ (rien n'est parti)
 */
export function requestDeltas(doc, deltas) {
  if (!doc?.uuid || !game.users?.activeGM) return Promise.resolve(false);
  const nonce = foundry.utils.randomID();
  const done = new Promise((resolve) => {
    const timer = setTimeout(() => { WAITING.delete(nonce); resolve(true); }, 3000);
    WAITING.set(nonce, () => { clearTimeout(timer); WAITING.delete(nonce); resolve(true); });
  });
  emitSocket({ type: "sbeActorValues", uuid: doc.uuid, deltas, nonce, user: game.user.id });
  return done;
}

/* Une file par chose touchée (côté MJ). */
const QUEUES = new Map();

/**
 * Exécute `task` après les tâches déjà en cours sur la même clé : deux
 * demandes sur le même marchand, coffre ou objet ne se croisent jamais
 * (une vérification puis une écriture, sans qu'une autre s'intercale).
 * @returns {Promise<*>} le résultat de la tâche
 */
/* Tâches en file en cours d'exécution (travail de fond : demandes des
   joueurs, décomptes…) — personne n'est devant pour répondre à une
   question : voir backgroundWork(). */
let RUNNING = 0;

/**
 * Ce poste fait-il en ce moment un travail de FOND (une tâche en file) ?
 * Une confirmation (« dépasser le maximum ? ») n'a alors personne pour
 * y répondre : la règle s'applique sans demander.
 */
export function backgroundWork() {
  return RUNNING > 0;
}

export function gmQueue(key, task) {
  const k = String(key ?? "");
  const prev = QUEUES.get(k) ?? Promise.resolve();
  const exec = async () => {
    RUNNING++;
    try { return await task(); } finally { RUNNING--; }
  };
  const run = prev.then(exec, exec);
  QUEUES.set(k, run);
  const done = () => { if (QUEUES.get(k) === run) QUEUES.delete(k); };
  run.then(done, done);
  return run;
}

/* -------------------------------------------- */
/*  Écritures déléguées                         */
/* -------------------------------------------- */

/**
 * La demande d'un joueur sur une porte, réduite à ce qu'il peut faire :
 * ouvrir une porte FERMÉE à serrure SBE (après l'avoir déverrouillée
 * chez lui), et noter l'état de cette serrure (helpers/lock-state).
 * Une porte verrouillée par le MJ (Foundry) ne s'ouvre jamais ainsi.
 */
function wallChanges(wall, raw, userId) {
  const DS = CONST.WALL_DOOR_STATES;
  const cfg = wall.flags?.[SYSTEM_ID]?.config ?? {};
  if ((cfg.lockType ?? "none") === "none") return {};
  const ask = foundry.utils.expandObject(foundry.utils.deepClone(raw ?? {}));
  const out = {};
  if (ask.ds === DS.OPEN && wall.ds === DS.CLOSED) out.ds = DS.OPEN;
  const state = lockStateFromPlayer(cfg, ask.flags?.[SYSTEM_ID]?.config, userId);
  for (const [k, v] of Object.entries(state)) out[`flags.${SYSTEM_ID}.config.${k}`] = v;
  return out;
}

/**
 * Met à jour un Wall. MJ : direct. Joueur : demande au MJ primaire.
 */
export async function updateWallSafe(wallDoc, changes, options = {}) {
  if (!wallDoc) return null;
  if (game.user.isGM) return wallDoc.update(changes, options);
  requestGM({
    type: "sbeWallUpdate",
    sceneId: wallDoc.parent?.id,
    wallId: wallDoc.id,
    changes, options
  });
  return null;
}

/**
 * Valeur actuelle d'une clé de fiche (son défaut si elle n'est pas
 * encore écrite) — lue au moment d'écrire, dans la file du document.
 */
export async function currentValue(doc, key) {
  const v = doc?.system?.values?.[key];
  if (v !== undefined && v !== null && v !== "") return Number(v) || 0;
  const { walkElements } = await import("../builder/element-renderer.mjs");
  for (const e of walkElements(doc?.system?.template?.system?.elements ?? [])) {
    if (e?.key === key) return Number(e.config?.default) || 0;
  }
  return 0;
}

/**
 * Les écritures « valeur lue puis réécrite » d'un même document passent
 * l'une après l'autre (dégâts, soins, écarts) : jamais deux qui partent
 * de la même valeur et s'écrasent.
 */
export function valueQueue(doc, task) {
  return gmQueue(`val:${doc?.uuid ?? ""}`, task);
}

/** Handlers côté MJ primaire pour les écritures déléguées. */
export function registerSafeWriteHandlers() {
  onSocketMessage((payload) => {
    if (payload?.type === "sbeValuesDone" && payload.user === game.user.id) WAITING.get(payload.nonce)?.();
    /* Message d'un MJ pour ce joueur (une clé de traduction seulement). */
    if (payload?.type === "sbeNotify" && payload.to === game.user.id && game.users?.get(payload._from)?.isGM
      && /^SBE\.[\w.]+$/.test(String(payload.key ?? ""))) {
      const lvl = ["info", "warn", "error"].includes(payload.level) ? payload.level : "info";
      const data = Object.fromEntries(Object.entries(payload.data ?? {}).map(([k, v]) => [k, String(v ?? "")]));
      ui.notifications?.[lvl](game.i18n.format(payload.key, data));
    }
  });
  onSocketMessage(async (payload) => {
    if (!payload || !game.user.isGM || !isPrimaryGM()) return;
    try {
      if (payload.type === "sbeActorValues") {
        /* Valeur écrite sur la fiche d'un personnage que l'émetteur ne
           possède pas (étape « Modifier un champ » sur une cible).
           Seules les valeurs de fiche passent — rien d'autre. */
        const doc = await fromUuid(payload.uuid).catch(() => null);
        if (!["Actor", "Item"].includes(doc?.documentName)) return;
        const changes = Object.fromEntries(Object.entries(payload.changes ?? {})
          .filter(([k]) => /^system\.values\.[A-Za-z_][\w]*$/.test(k)));
        /* ÉCARTS (« −5 PV ») : appliqués ici, sur la valeur du moment —
           quatre soins envoyés ensemble font bien quatre soins. */
        const deltas = Object.entries(payload.deltas ?? {})
          .filter(([k, v]) => /^[A-Za-z_][\w]*$/.test(k) && Number.isFinite(Number(v)));
        await valueQueue(doc, async () => {
          for (const [k, v] of deltas) changes[`system.values.${k}`] = (await currentValue(doc, k)) + Number(v);
          return Object.keys(changes).length ? doc.update(changes) : null;
        });
        /* Le demandeur attend : c'est fait (même si rien n'a changé). */
        if (payload.nonce) emitSocket({ type: "sbeValuesDone", nonce: payload.nonce, user: payload.user });
      } else if (payload.type === "sbeCardAnswer") {
        /* Réponse d'un AUTRE MJ (jamais d'un joueur). */
        const sender = game.users.get(payload._from);
        const message = game.messages.get(payload.msg);
        if (sender?.isGM && message) await runAnswer(String(payload.kind), message, !!payload.yes, sender.name);
      } else if (payload.type === "sbeWallUpdate") {
        const scene = game.scenes.get(payload.sceneId);
        const wall = scene?.walls?.get(payload.wallId);
        /* Une porte seulement, et seulement son état et sa serrure. */
        if (!wall?.door) return;
        const sender = game.users.get(payload._from);
        /* Relu dans la file de la porte : deux échecs simultanés comptent deux fois. */
        await gmQueue(wall.uuid, async () => {
          const changes = sender?.isGM ? foundry.utils.deepClone(payload.changes ?? {}) : wallChanges(wall, payload.changes, payload._from);
          if (Object.keys(changes).length) await wall.update(changes, { sbeDoorUnlocked: !!payload.options?.sbeDoorUnlocked });
        });
      }
    } catch (err) {
      console.warn("SBE | Socket : application d'écriture déléguée en échec", err);
    }
  });
}
