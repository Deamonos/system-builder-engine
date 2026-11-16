/**
 * SBE — RETOUR EN ARRIÈRE des actions (annuler / rétablir)
 *
 * Une ACTION = un bouton lancé (clic, déclencheur, suite d'une attente)
 * ou un geste de carte (dégâts appliqués, relance). Tout ce qu'elle
 * écrit dans le monde est noté : création, modification (valeurs
 * d'avant / d'après), suppression — fiches, objets, effets, jetons,
 * zones, tuiles, murs, lumières, combattants, réglages (calendrier…).
 *
 * ENREGISTREMENT
 * - Chaque poste note SES écritures (crochets « pre » : l'état d'avant
 *   n'existe qu'à cet instant, et seulement chez celui qui écrit).
 * - Une écriture déléguée au MJ (socket) porte l'identifiant de
 *   l'action : le MJ principal la note sous cette action.
 * - Le MJ principal assemble et garde l'HISTORIQUE, commun à toute la
 *   table, dans l'ordre : le détail dans un fichier du monde
 *   (worlds/<monde>/sbe/undo-history.json, jamais envoyé aux joueurs),
 *   le sommaire léger dans un réglage du monde (lu par les cartes).
 *
 * RETOUR EN ARRIÈRE (MJ principal seul exécute ; les autres demandent)
 * - Annuler une action défait aussi toutes celles d'après (pile).
 * - Rétablir refait ce qui vient d'être annulé ; une nouvelle action
 *   efface ce qui pouvait encore être rétabli.
 * - Les écritures du retour portent `sbeUndo` (+ `sbeDirect`) : les
 *   managers à effets de bord (déclencheurs, résistances, objets donnés
 *   par un effet, traces, invocations, initiative…) ne se relancent pas.
 * - Rien de ce qui est déjà ARRIVÉ ne se défait : dés, sons, messages.
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { onSocketMessage, emitSocket, isPrimaryGM, setSocketRunTag, requestGM } from "../../helpers/socket.mjs";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

const SETTING = "undoHistory";     /* ancien emplacement du détail (repris une fois dans le fichier) */
/* Le détail (MJ) vit dans un fichier du monde : jamais envoyé aux joueurs. */
const FILE_DIR = () => `worlds/${game.world.id}/sbe`;
const FILE_NAME = "undo-history.json";
const INDEX = "undoIndex";         /* le sommaire léger que lisent les cartes */
/** Documents suivis (le chat n'est jamais défait). */
const DOCS = ["Actor", "ActorDelta", "Item", "ActiveEffect", "Token", "Region", "RegionBehavior", "Tile", "Wall",
  "AmbientLight", "AmbientSound", "Drawing", "Note", "Combatant", "Setting", "JournalEntry", "JournalEntryPage", "Scene"];
const MAX_BYTES = 1_500_000;
const APPLY_OPTS = { sbeUndo: true, sbeDirect: true, animate: false, render: true };
/* Toujours une COPIE : Foundry complète l'objet d'options (parent…) ;
   le réutiliser ferait viser le mauvais document à l'écriture suivante. */
const opts = () => ({ ...APPLY_OPTS });
/**
 * Longue liste (traces au sol…) : on ne garde que ce qui a été ajouté
 * et retiré, pas la liste entière à chaque action.
 */
const ARR_MIN = 8;
const jkey = (x) => JSON.stringify(x);
function arrDiff(before, after) {
  const count = (list) => { const m = new Map(); for (const x of list) { const k = jkey(x); m.set(k, (m.get(k) ?? 0) + 1); } return m; };
  const pick = (list, other) => { const m = count(other); const out = []; for (const x of list) { const k = jkey(x); const n = m.get(k) ?? 0; if (n > 0) m.set(k, n - 1); else out.push(x); } return out; };
  return { __sbeArr: 1, add: pick(after, before), rem: pick(before, after) };
}
/** Rejoue une différence de liste : défaire (undo) ou refaire. */
function arrPatch(cur, d, undo) {
  const drop = undo ? d.add : d.rem;
  const put = undo ? d.rem : d.add;
  const m = new Map();
  for (const x of drop ?? []) { const k = jkey(x); m.set(k, (m.get(k) ?? 0) + 1); }
  const out = [];
  for (const x of Array.isArray(cur) ? cur : []) { const k = jkey(x); const n = m.get(k) ?? 0; if (n > 0) m.set(k, n - 1); else out.push(x); }
  return out.concat(foundry.utils.deepClone(put ?? []));
}
const isArrDiff = (v) => !!v && typeof v === "object" && v.__sbeArr === 1;

/**
 * Écritures en attente sur UN document, fusionnées : chaque clé garde sa
 * dernière valeur ; une clé posée sous une autre déjà posée entre dans
 * son objet ; une clé retirée annule ce qui la visait.
 */
class Pending {
  constructor(doc) { this.doc = doc; this.ch = {}; this.del = new Set(); this.snapshot = false; }
  /** Clé déjà posée qui contient `k` (« system.values » pour « system.values.pv »). */
  #above(k) { return Object.keys(this.ch).find(a => k.startsWith(`${a}.`)) ?? null; }
  #clearBelow(k) {
    for (const x of Object.keys(this.ch)) if (x === k || x.startsWith(`${k}.`)) delete this.ch[x];
    for (const x of [...this.del]) if (x === k || x.startsWith(`${k}.`) || k.startsWith(`${x}.`)) this.del.delete(x);
  }
  /** Valeur actuelle de `k`, en tenant compte de ce qui attend. */
  cur(k) {
    if (k in this.ch) return this.ch[k];
    const a = this.#above(k);
    if (a) return foundry.utils.getProperty(this.ch[a], k.slice(a.length + 1));
    return foundry.utils.getProperty(this.doc._source, k);
  }
  put(k, v) {
    const val = foundry.utils.deepClone(v);
    const a = this.#above(k);
    if (a && this.ch[a] && typeof this.ch[a] === "object") { foundry.utils.setProperty(this.ch[a], k.slice(a.length + 1), val); return; }
    this.#clearBelow(k);
    this.ch[k] = val;
  }
  drop(k) {
    const a = this.#above(k);
    if (a && this.ch[a] && typeof this.ch[a] === "object") {
      const rest = k.slice(a.length + 1); const i = rest.lastIndexOf(".");
      const host = i < 0 ? this.ch[a] : foundry.utils.getProperty(this.ch[a], rest.slice(0, i));
      if (host && typeof host === "object") delete host[i < 0 ? rest : rest.slice(i + 1)];
      return;
    }
    this.#clearBelow(k);
    if (foundry.utils.hasProperty(this.doc._source, k)) this.del.add(k);
  }
  /** L'envoi unique : valeurs posées, clés retirées, valeurs de fiche apparues depuis. */
  change() {
    const Del = () => foundry.data.operators.ForcedDeletion.create();
    const out = { ...this.ch };
    for (const k of this.del) out[k] = Del();
    const sv = this.ch["system.values"];
    if (this.snapshot && sv && typeof sv === "object") {
      const vals = { ...sv };
      for (const extra of Object.keys(this.doc._source?.system?.values ?? {})) {
        if (!(extra in sv)) vals[extra] = Del();
      }
      out["system.values"] = vals;
    }
    return out;
  }
}

/** Clés internes de Foundry (« _movementHistory »…) : jamais rejouées. */
const internal = (k) => k.split(".").some(p => p.startsWith("_"));

export class UndoManager {

  static #local = [];            /* actions en cours sur CE poste */
  static #remote = [];           /* actions distantes dont le MJ traite une écriture */
  static #runs = new Map();      /* MJ : actions en construction (id → action) */
  static #pendingUpd = new Map();/* uuid → entrée « modification » en attente de son « après » */
  static #hist = null;           /* MJ principal : l'historique en mémoire */
  static #saveT = null;
  static #indexT = null;
  static #seq = 0;
  static #busy = false;          /* MJ : un retour en arrière est en cours */
  static #confirm = new Set();   /* cartes en attente de confirmation (ici) */

  /** Vrai pendant un retour en arrière (chez le MJ qui l'exécute). */
  static get busy() { return this.#busy; }

  /** Raccourci reconnu par la lettre (claviers non QWERTY). */
  static #byLetter(ev) {
    try {
      if (ev.repeat || !game.user?.isGM || !ev.key || ev.key.length !== 1) return;
      if (game.settings.get("core", "universalKeybindings")) return;   /* Foundry lit déjà la lettre */
      const t = ev.target;
      if (t?.closest?.("input, textarea, select, [contenteditable='true']")) return;
      const letter = ev.key.toUpperCase();
      const mods = (b) => new Set(b.modifiers ?? []);
      for (const [action, run] of [["actionUndo", () => this.undoLast()], ["actionRedo", () => this.redoNext()]]) {
        for (const b of game.keybindings.get(SYSTEM_ID, action) ?? []) {
          if (b.key !== `Key${letter}` || b.key === ev.code) continue;   /* même touche physique : Foundry s'en charge */
          const m = mods(b);
          if (m.has("Control") !== (ev.ctrlKey || ev.metaKey) || m.has("Alt") !== ev.altKey || m.has("Shift") !== ev.shiftKey) continue;
          ev.preventDefault();
          ev.stopPropagation();
          run();
          return;
        }
      }
    } catch (_e) { /* réglages pas prêts */ }
  }

  /* ============================================================ */
  /*  Branchements                                                 */
  /* ============================================================ */

  static init() {
    game.settings.register(SYSTEM_ID, SETTING, { scope: "world", config: false, type: Object, default: { runs: [] } });
    game.settings.register(SYSTEM_ID, INDEX, { scope: "world", config: false, type: Object, default: { runs: [] },
      onChange: () => this.#refreshCards() });
    game.settings.register(SYSTEM_ID, "undoOn", {
      name: "SBE.Undo.SettingOn", hint: "SBE.Undo.SettingOnHint", scope: "world", config: true, type: Boolean, default: true,
      onChange: () => this.#refreshCards(true)
    });
    game.settings.register(SYSTEM_ID, "undoSize", {
      name: "SBE.Undo.SettingSize", hint: "SBE.Undo.SettingSizeHint", scope: "world", config: true, type: Number,
      range: { min: 5, max: 100, step: 5 }, default: 20
    });

    const P = CONST.KEYBINDING_PRECEDENCE.NORMAL;
    game.keybindings.register(SYSTEM_ID, "actionUndo", {
      name: "SBE.Undo.KeyUndo", editable: [{ key: "KeyZ", modifiers: ["Control", "Alt"] }],
      onDown: () => { this.undoLast(); return true; }, precedence: P, restricted: true
    });
    game.keybindings.register(SYSTEM_ID, "actionRedo", {
      name: "SBE.Undo.KeyRedo", editable: [{ key: "KeyY", modifiers: ["Control", "Alt"] }],
      onDown: () => { this.redoNext(); return true; }, precedence: P, restricted: true
    });

    /* Clavier non QWERTY (AZERTY…) : Foundry lit la touche PHYSIQUE
       (sauf « raccourcis universels »), Ctrl+Alt+Z tombait sur la touche W.
       On suit aussi la LETTRE tapée, d'après le raccourci réglé dans
       « Configurer les contrôles » (rien ne part deux fois). */
    window.addEventListener("keydown", (ev) => this.#byLetter(ev));

    /* Les écritures déléguées au MJ emportent l'action en cours, et le
       MJ les note sous cette action. */
    setSocketRunTag(() => this.#local.at(-1)?.id ?? null, (id, run) => this.#withRemote(id, run));

    Hooks.on("renderChatMessageHTML", (message, html) => {
      try { this.#decorate(message.id, html instanceof HTMLElement ? html : html?.[0]); }
      catch (err) { console.warn("SBE | Retour en arrière : carte en échec", err); }
    });

    /* Crochets posés au « ready » : APRÈS ceux des autres managers, pour
       lire les changements dans leur forme finale. */
    Hooks.once("ready", () => {
      this.#bindRecorder();
      if (isPrimaryGM()) this.#hist = this.#read();
      onSocketMessage((p) => this.#onSocket(p));
    });
  }

  /* ============================================================ */
  /*  Enregistrer une action                                       */
  /* ============================================================ */

  /** Le retour en arrière est-il actif dans ce monde ? */
  static get enabled() {
    try { return game.settings.get(SYSTEM_ID, "undoOn") !== false; } catch (_e) { return true; }
  }

  /**
   * Enregistre tout ce que `fn` écrit comme UNE action.
   * Une action lancée pendant une autre (bouton d'un slot, réaction…)
   * rejoint celle qui tourne : un seul retour en arrière pour les deux.
   * @param {{label?, item?, el?, actor?, msgId?}} meta
   */
  static async record(meta, fn) {
    if (this.#local.length || this.#busy || !this.enabled) return fn();
    const ctx = { id: foundry.utils.randomID(), entries: [], msgs: meta?.msgId ? [meta.msgId] : [], meta: this.#meta(meta) };
    this.#local.push(ctx);
    try {
      return await fn();
    } finally {
      const i = this.#local.indexOf(ctx);
      if (i >= 0) this.#local.splice(i, 1);
      this.#submit(ctx);
    }
  }

  static #meta({ label = "", item = null, el = null, actor = null } = {}) {
    const a = actor ?? (item?.parent?.documentName === "Actor" ? item.parent : null);
    const c = game.combat?.started ? { id: game.combat.id, round: game.combat.round, turn: game.combat.turn } : null;
    const lbl = label || [item?.name, el?.label].filter(Boolean).join(" — ") || item?.name || "";
    return { label: lbl, img: item?.img ?? a?.img ?? "", actor: a?.uuid ?? "", actorName: a?.name ?? "",
      user: game.user.id, userName: game.user.name, combat: c };
  }

  /** Le contexte d'écriture de ce poste (action distante d'abord). */
  static #ctx() {
    if (this.#busy) return null;
    const r = this.#remote.at(-1);
    if (r) return { remote: r };
    return this.#local.at(-1) ?? null;
  }

  /**
   * Demandes de plusieurs joueurs arrivées ensemble : traitées l'une après
   * l'autre, pour que chaque écriture soit notée sous SON action (sinon
   * quatre « Maudire » simultanés ne faisaient qu'une action, mélangée).
   * Une demande qui attend (fenêtre du MJ…) ne bloque pas les suivantes
   * plus de 2 s : elles repartent, notées au mieux.
   */
  static #remoteChain = Promise.resolve();

  static #withRemote(id, run) {
    if (!isPrimaryGM()) return run();
    const go = async () => {
      this.#remote.push(id);
      let outs = [];
      try { outs = run() ?? []; }
      catch (err) { console.warn("SBE | Retour en arrière : demande en échec", err); }
      const all = Promise.allSettled(outs.filter(p => p?.then)).finally(() => {
        const i = this.#remote.indexOf(id);
        if (i >= 0) this.#remote.splice(i, 1);
      });
      await Promise.race([all, new Promise(r => { setTimeout(r, 2000); })]);
    };
    const p = this.#remoteChain.then(go, go);
    this.#remoteChain = p.catch(() => {});
    return [p];
  }

  static #bindRecorder() {
    const own = new Set([`${SYSTEM_ID}.${SETTING}`, `${SYSTEM_ID}.${INDEX}`]);
    const skip = (doc) => !doc || doc.pack || (doc.documentName === "Setting" && own.has(doc.key));
    /* Pion non lié : ses valeurs vivent dans son « delta » ; on note (et
       on rejoue) sur son personnage, celui que tout SBE lit et écrit. */
    const subject = (doc) => (doc?.documentName === "ActorDelta" ? doc.parent?.actor ?? null : doc);
    for (const name of DOCS) {
      const kind = name === "ActorDelta" ? "Actor" : name;
      if (name !== "ActorDelta") Hooks.on(`create${name}`, (doc, _o, userId) => {
        if (userId !== game.user.id || skip(doc)) return;
        this.#push({ op: "create", name, uuid: doc.uuid, parent: doc.parent?.uuid ?? null, data: doc.toObject() });
      });
      Hooks.on(`preUpdate${name}`, (raw, changes) => {
        const doc = subject(raw);
        if (skip(doc) || !this.#ctx()) return;
        /* Déjà noté à l'instant par l'autre crochet (personnage ET delta) :
           une fois. (Une écriture sans changement n'a pas de « après » :
           son attente est simplement remplacée par la suivante.) */
        const prev = this.#pendingUpd.get(doc.uuid);
        if (prev && Date.now() - prev.t < 25) return;
        const { before, gone } = this.#before(doc, changes);
        if (!Object.keys(before).length && !gone.length) return;
        const e = { op: "update", name: kind, uuid: doc.uuid, before, gone, after: null };
        this.#pendingUpd.set(doc.uuid, e);
        this.#push(e);
      });
      Hooks.on(`update${name}`, (raw, changes, _o, userId) => {
        if (userId !== game.user.id) return;
        const doc = subject(raw);
        const e = doc ? this.#pendingUpd.get(doc.uuid) : null;
        if (!e) return;
        this.#pendingUpd.delete(doc.uuid);
        const flat = foundry.utils.flattenObject(changes ?? {});
        for (const k of Object.keys(flat)) if (internal(k)) delete flat[k];
        /* Longues listes : seulement ce qui a bougé. */
        for (const [k, v] of Object.entries(e.before)) {
          if (!Array.isArray(v) || v.length < ARR_MIN) continue;
          const now = foundry.utils.getProperty(doc._source, k);
          if (!Array.isArray(now)) continue;
          const d = arrDiff(v, now);
          e.before[k] = d;
          if (k in flat) flat[k] = d;
        }
        e.after = flat;
      });
      if (name !== "ActorDelta") Hooks.on(`preDelete${name}`, (doc) => {
        if (skip(doc) || !this.#ctx()) return;
        this.#push({ op: "delete", name, uuid: doc.uuid, parent: doc.parent?.uuid ?? null, data: doc.toObject() });
      });
    }
    Hooks.on("createChatMessage", (msg, _o, userId) => {
      if (userId !== game.user.id) return;
      const ctx = this.#ctx();
      if (!ctx) return;
      if (ctx.remote) this.#gmRun(ctx.remote).msgs.push(msg.id);
      else ctx.msgs.push(msg.id);
    });
  }

  /**
   * L'état d'AVANT d'une modification : chaque clé touchée ; et, si la
   * fiche change de valeurs, toutes ses valeurs (une valeur ajoutée en
   * route — temporaires, bornes — revient aussi).
   */
  static #before(doc, changes) {
    const src = doc._source ?? {};
    const flat = foundry.utils.flattenObject(changes ?? {});
    delete flat._id;
    const before = {};
    const gone = [];        /* clés absentes avant : à retirer au retour */
    const values = Object.keys(flat).some(k => k.startsWith("system.values"));
    for (const k of Object.keys(flat)) {
      const real = k.replace(/(^|\.)(-=|==)/g, "$1");
      if (internal(real)) continue;
      if (values && real.startsWith("system.values")) continue;
      if (!foundry.utils.hasProperty(src, real)) { gone.push(real); continue; }
      before[real] = foundry.utils.deepClone(foundry.utils.getProperty(src, real));
    }
    if (values) before["system.values"] = foundry.utils.deepClone(foundry.utils.getProperty(src, "system.values") ?? {});
    return { before, gone };
  }

  /** Une écriture : notée dans l'action en cours (ici, ou chez le MJ). */
  static #push(entry) {
    const ctx = this.#ctx();
    if (!ctx) return;
    entry.t = Date.now();
    entry.s = this.#seq++;
    if (ctx.remote) {
      const run = this.#gmRun(ctx.remote);
      run.entries.push(entry);
      run.bytes = (run.bytes ?? 0) + JSON.stringify(entry).length;
      this.#gmCommit(run);
    } else ctx.entries.push(entry);
  }

  /** Fin d'une action : tout part chez le MJ principal. */
  static #submit(ctx) {
    const payload = { id: ctx.id, meta: ctx.meta, entries: ctx.entries, msgs: ctx.msgs, sentAt: Date.now() };
    /* Même vide ici : le MJ a pu noter des écritures déléguées. */
    if (isPrimaryGM()) this.#gmStore(payload);
    else requestGM({ type: "sbeUndoRun", run: payload }, { quiet: true });
  }

  /* ============================================================ */
  /*  Historique (MJ principal)                                    */
  /* ============================================================ */

  static #loading = null;
  static #loaded = false;
  static #migrated = false;

  /**
   * L'historique en mémoire (MJ principal) : vide tout de suite, puis
   * complété par le fichier du monde dès qu'il est lu (les actions faites
   * entre-temps sont gardées ; rien n'est écrit avant la lecture).
   */
  static #read() {
    this.#startLoad();
    return [];
  }

  static #startLoad() {
    if (this.#loaded || this.#loading) return;
    this.#loading = this.#loadFile().then((runs) => {
      for (const r of runs) { r.saved = true; r.meta = true; r.bytes = JSON.stringify(r.entries ?? []).length; }
      const have = new Set((this.#hist ?? []).map(r => r.id));
      this.#hist = [...runs.filter(r => !have.has(r.id)), ...(this.#hist ?? [])].sort((a, b) => a.at - b.at);
      this.#loaded = true;
      this.#trim();
      if (this.#migrated) this.#save();
    }).catch(err => {
      console.warn("SBE | Retour en arrière : lecture de l'historique en échec", err);
      this.#loaded = true;
    }).finally(() => { this.#loading = null; });
  }

  /** Le détail : le fichier du monde, sinon (une fois) l'ancien réglage. */
  static async #loadFile() {
    try {
      const res = await fetch(foundry.utils.getRoute(`${FILE_DIR()}/${FILE_NAME}`), { cache: "no-store" });
      if (res.ok) {
        const v = await res.json();
        return Array.isArray(v?.runs) ? v.runs : [];
      }
    } catch (_e) { /* pas encore de fichier */ }
    const old = game.settings.get(SYSTEM_ID, SETTING);
    const runs = Array.isArray(old?.runs) ? foundry.utils.deepClone(old.runs) : [];
    this.#migrated = runs.length > 0;
    return runs;
  }

  /** Écrit le détail dans le fichier du monde (MJ principal). */
  static async #writeFile(runs) {
    const FP = foundry.applications.apps.FilePicker.implementation;
    try { await FP.createDirectory("data", FILE_DIR(), {}); } catch (_e) { /* déjà là */ }
    const file = new File([JSON.stringify({ runs })], FILE_NAME, { type: "application/json" });
    const res = await FP.upload("data", FILE_DIR(), file, {}, { notify: false });
    if (!res?.path) throw new Error(res?.message || "upload refused");
    /* L'ancien réglage, repris : on le vide (il partait à tous les joueurs). */
    if (this.#migrated) { this.#migrated = false; await game.settings.set(SYSTEM_ID, SETTING, { runs: [] }); }
  }

  /** Les actions de l'historique (tout poste, lecture : le sommaire). */
  static runs() {
    if (isPrimaryGM() && this.#hist) return this.#hist;
    const v = game.settings.get(SYSTEM_ID, INDEX);
    return Array.isArray(v?.runs) ? v.runs : [];
  }

  static #gmRun(id) {
    let run = this.#runs.get(id) ?? this.#hist?.find(r => r.id === id);
    if (!run) {
      run = { id, at: Date.now(), entries: [], msgs: [], undone: false, label: "", meta: false };
      this.#runs.set(id, run);
      /* Une action jamais annoncée (poste déconnecté) ne traîne pas. */
      setTimeout(() => { if (!run.meta) this.#runs.delete(id); }, 60_000);
    }
    return run;
  }

  static #gmStore(payload) {
    if (!isPrimaryGM()) return;
    this.#hist ??= this.#read();
    const run = this.#gmRun(payload.id);
    const shift = Date.now() - (Number(payload.sentAt) || Date.now());
    Object.assign(run, payload.meta ?? {}, { meta: true });
    for (const e of payload.entries ?? []) { e.t = (Number(e.t) || 0) + shift; run.entries.push(e); run.bytes = (run.bytes ?? 0) + JSON.stringify(e).length; }
    for (const m of payload.msgs ?? []) if (!run.msgs.includes(m)) run.msgs.push(m);
    run.entries.sort((a, b) => (a.t - b.t) || (a.s - b.s));
    this.#gmCommit(run);
  }

  /** L'action entre dans l'historique dès qu'elle a écrit quelque chose. */
  static #gmCommit(run) {
    if (!isPrimaryGM() || !run.meta) return;
    this.#hist ??= this.#read();
    if (!run.saved) {
      if (!run.entries.length) return;
      run.saved = true;
      this.#runs.delete(run.id);
      /* Une nouvelle action : ce qui était annulé ne se rétablit plus. */
      this.#hist = this.#hist.filter(r => !r.undone);
      this.#hist.push(run);
      this.#hist.sort((a, b) => a.at - b.at);
    }
    this.#trim();
    this.#save();
  }

  static #trim() {
    const max = Math.max(5, Number(game.settings.get(SYSTEM_ID, "undoSize")) || 20);
    while (this.#hist.length > max) this.#hist.shift();
    /* Taille tenue au fil de l'eau (jamais de gros calcul à chaque action). */
    const size = () => this.#hist.reduce((n, r) => n + (r.bytes ?? 0), 0);
    while (this.#hist.length > 1 && size() > MAX_BYTES) this.#hist.shift();
  }

  /** Le sommaire d'une action (ce que voient les cartes et la fenêtre). */
  static #summary(r) {
    return { id: r.id, at: r.at, label: r.label, img: r.img, actor: r.actor, actorName: r.actorName,
      user: r.user, userName: r.userName, combat: r.combat ?? null, msgs: [...(r.msgs ?? [])], undone: !!r.undone, n: r.entries?.length ?? 0 };
  }

  /**
   * Le sommaire part tout de suite (léger) ; le détail, plus lourd, est
   * écrit au calme — il ne sert qu'au MJ, qui le garde en mémoire.
   */
  static #save() {
    clearTimeout(this.#indexT);
    this.#indexT = setTimeout(() => {
      game.settings.set(SYSTEM_ID, INDEX, { runs: this.#hist.map(r => this.#summary(r)) })
        .catch(err => console.warn("SBE | Retour en arrière : sommaire en échec", err));
    }, 100);
    clearTimeout(this.#saveT);
    this.#saveT = setTimeout(async () => {
      /* Jamais avant d'avoir lu le fichier : on l'écraserait. */
      if (this.#loading) await this.#loading;
      if (!this.#loaded || !isPrimaryGM()) return;
      const runs = this.#hist.map(r => { const out = foundry.utils.deepClone(r); delete out.saved; delete out.meta; return out; });
      this.#writeFile(runs).catch(err => console.warn("SBE | Retour en arrière : sauvegarde en échec", err));
    }, 3000);
  }

  /** Vider l'historique (MJ). */
  static async clear() {
    if (!game.user.isGM) return;
    if (isPrimaryGM()) { this.#hist = []; this.#save(); }
    else requestGM({ type: "sbeUndoClear" });
  }

  /* ============================================================ */
  /*  Droits                                                       */
  /* ============================================================ */

  /** Les actions à défaire pour revenir jusqu'à `id` (la plus récente d'abord). */
  static chainUndo(id) {
    const runs = this.runs();
    const i = runs.findIndex(r => r.id === id);
    if (i < 0 || runs[i].undone) return [];
    return runs.slice(i).filter(r => !r.undone).reverse();
  }

  /** Les actions à refaire jusqu'à `id` (la plus ancienne d'abord). */
  static chainRedo(id) {
    const runs = this.runs();
    const i = runs.findIndex(r => r.id === id);
    if (i < 0 || !runs[i].undone) return [];
    return runs.slice(0, i + 1).filter(r => r.undone);
  }

  /** Raison du refus (ou ""). Seul le MJ revient en arrière. */
  static denyUndo(chain, user = game.user) {
    if (!chain.length) return L("SBE.Undo.Nothing");
    return user?.isGM ? "" : L("SBE.Undo.GmOnly");
  }

  static denyRedo(chain, user = game.user) {
    if (!chain.length) return L("SBE.Undo.Nothing");
    return user?.isGM ? "" : L("SBE.Undo.GmOnly");
  }

  /* ============================================================ */
  /*  Annuler / rétablir                                           */
  /* ============================================================ */

  /** Revenir jusqu'à l'action `id` (incluse). */
  static async undo(id) { return this.#request("undo", id); }
  /** Refaire jusqu'à l'action `id` (incluse). */
  static async redo(id) { return this.#request("redo", id); }

  static async undoLast() {
    const last = this.runs().filter(r => !r.undone).at(-1);
    if (!last) { ui.notifications.info(L("SBE.Undo.Nothing")); return; }
    return this.undo(last.id);
  }

  static async redoNext() {
    const next = this.runs().find(r => r.undone);
    if (!next) { ui.notifications.info(L("SBE.Undo.NothingRedo")); return; }
    return this.redo(next.id);
  }

  static async #request(op, id) {
    const chain = op === "undo" ? this.chainUndo(id) : this.chainRedo(id);
    const why = op === "undo" ? this.denyUndo(chain) : this.denyRedo(chain);
    if (why) { ui.notifications.warn(why); return false; }
    if (isPrimaryGM()) return this.#exec(op, id, game.user.id);
    requestGM({ type: "sbeUndoExec", op, id, user: game.user.id });
    return true;
  }

  static async #onSocket(p) {
    if (!p?.type?.startsWith?.("sbeUndo")) return;
    if (p.type === "sbeUndoNote" && p.user === game.user.id) { ui.notifications[p.level ?? "info"](p.text); return; }
    if (!isPrimaryGM()) return;
    if (p.type === "sbeUndoRun") this.#gmStore(p.run);
    else if (p.type === "sbeUndoClear") {
      /* Vider l'historique : un MJ seulement (expéditeur réel). */
      if (!game.users.get(p._from)?.isGM) return;
      this.#hist = []; this.#save();
    }
    else if (p.type === "sbeUndoExec") await this.#exec(p.op, p.id, p.user);
  }

  static #note(user, text, level = "info") {
    if (user === game.user.id) ui.notifications[level](text);
    else emitSocket({ type: "sbeUndoNote", user, text, level });
  }

  /** MJ principal : exécute un retour en arrière (ou sa reprise). */
  static async #exec(op, id, userId) {
    if (this.#busy) return false;
    this.#hist ??= this.#read();
    const user = game.users.get(userId) ?? game.user;
    const chain = op === "undo" ? this.chainUndo(id) : this.chainRedo(id);
    const why = op === "undo" ? this.denyUndo(chain, user) : this.denyRedo(chain, user);
    if (why) { this.#note(userId, why, "warn"); return false; }
    this.#busy = true;
    let missed = 0;
    try {
      const lives = [];
      const all = [];
      for (const run of chain) {
        const live = this.#hist.find(r => r.id === run.id);
        if (!live) continue;
        const entries = [...live.entries].sort((a, b) => (a.t - b.t) || (a.s - b.s));
        if (op === "undo") entries.reverse();
        all.push(...entries);
        lives.push(live);
      }
      missed = await this.#applyAll(op, all);
      for (const live of lives) live.undone = op === "undo";
    } finally {
      this.#busy = false;
    }
    this.#save();
    const n = chain.length;
    const text = L(op === "undo" ? "SBE.Undo.DoneUndo" : "SBE.Undo.DoneRedo", { n }) + (missed ? ` ${L("SBE.Undo.Missed", { n: missed })}` : "");
    this.#note(userId, text, missed ? "warn" : "info");
    return true;
  }

  /** Une écriture défaite (undo) ou refaite (redo). Faux = sautée. */
  static async #apply(op, e) {
    const doc = await fromUuid(e.uuid).catch(() => null);
    const recreate = async () => {
      if (doc) return true;
      const parent = e.parent ? await fromUuid(e.parent).catch(() => null) : null;
      if (e.parent && !parent) return false;
      const data = foundry.utils.deepClone(e.data);
      if (parent) await parent.createEmbeddedDocuments(e.name, [data], { ...APPLY_OPTS, keepId: true });
      else await CONFIG[e.name].documentClass.create(data, { ...APPLY_OPTS, keepId: true });
      return true;
    };
    const remove = async () => {
      if (!doc) return true;
      await doc.delete(opts());
      return true;
    };
    if (e.op === "create") return op === "undo" ? remove() : recreate();
    if (e.op === "delete") return op === "undo" ? recreate() : remove();
    return false;
  }

  /**
   * Toutes les écritures d'un retour en arrière (ou de sa reprise), dans
   * l'ordre. Les modifications qui se suivent sont FUSIONNÉES : un seul
   * envoi par document — et, pour les documents d'un même porteur (objets,
   * effets d'un personnage…), un seul envoi pour tous. Dix actions défaites
   * ne font plus des dizaines d'allers-retours et d'affichages.
   * Une création ou une suppression coupe la fusion (l'ordre compte alors).
   * @returns {Promise<number>} écritures sautées
   */
  static async #applyAll(op, entries) {
    let missed = 0;
    let batch = new Map();
    const flush = async () => {
      const list = [...batch.values()];
      batch = new Map();
      const groups = new Map();
      for (const b of list) {
        const ch = b.change();
        if (!Object.keys(ch).length) continue;
        const doc = b.doc;
        /* Objets, effets… d'un porteur : envoyés ensemble. Le personnage
           d'un jeton non lié (son parent est le jeton) s'écrit seul. */
        const host = doc.isEmbedded && doc.parent && !doc.isToken ? doc.parent : null;
        if (!host) { await this.#safe(() => doc.update(ch, opts()), () => missed++); continue; }
        const key = `${host.uuid}|${doc.documentName}`;
        if (!groups.has(key)) groups.set(key, { host, name: doc.documentName, rows: [] });
        groups.get(key).rows.push({ ...ch, _id: doc.id });
      }
      for (const g of groups.values()) {
        await this.#safe(() => g.host.updateEmbeddedDocuments(g.name, g.rows, opts()), () => { missed += g.rows.length; });
      }
    };
    for (const e of entries) {
      if (e.op === "create" || e.op === "delete") {
        await flush();
        await this.#safe(async () => { if (!(await this.#apply(op, e))) missed++; }, () => missed++, e);
        continue;
      }
      if (op === "redo" && (!e.after || !Object.keys(e.after).length)) continue;
      let b = batch.get(e.uuid);
      if (!b) {
        const doc = await fromUuid(e.uuid).catch(() => null);
        if (!doc) { missed++; continue; }
        b = new Pending(doc);
        batch.set(e.uuid, b);
      }
      if (op === "undo") {
        for (const k of e.gone ?? []) b.drop(k);
        for (const [k, v] of Object.entries(e.before ?? {})) {
          b.put(k, isArrDiff(v) ? arrPatch(b.cur(k), v, true) : v);
          /* Valeurs de fiche : celles apparues depuis repartent aussi. */
          if (k === "system.values" && v && typeof v === "object") b.snapshot = true;
        }
      } else {
        for (const [k, v] of Object.entries(e.after)) b.put(k, isArrDiff(v) ? arrPatch(b.cur(k), v, false) : v);
      }
    }
    await flush();
    return missed;
  }

  static async #safe(fn, onFail, what = null) {
    try { await fn(); }
    catch (err) { onFail(); console.warn("SBE | Retour en arrière : écriture en échec", what ?? "", err); }
  }

  /* ============================================================ */
  /*  Carte du chat                                                */
  /* ============================================================ */

  /** L'action la plus récente liée à ce message. */
  static runOfMessage(msgId) {
    const runs = this.runs();
    for (let i = runs.length - 1; i >= 0; i--) if (runs[i].msgs?.includes(msgId)) return runs[i];
    return null;
  }

  /** Redessine les seules cartes dont l'état a changé (ou toutes : réglage). */
  static #refreshCards(all = false) {
    const runs = this.runs();
    const state = new Map();
    for (const r of runs) for (const m of r.msgs ?? []) state.set(m, `${r.id}:${r.undone ? 1 : 0}:${runs.length}`);
    for (const li of document.querySelectorAll("[data-message-id]")) {
      const id = li.dataset.messageId;
      const now = state.get(id) ?? "";
      /* L'état affiché est gardé sur l'élément : un message peut être
         affiché deux fois (chat de la barre latérale et chat détaché). */
      if (!all && (li.dataset.sbeUndoShown ?? "") === now) continue;
      try { this.#decorate(id, li); } catch (_e) { /* */ }
    }
    for (const app of foundry.applications.instances?.values?.() ?? []) {
      if (app?.options?.classes?.includes?.("sbe-undo-history") && app.rendered) app.render();
    }
  }

  static #decorate(msgId, root) {
    if (!root || !msgId) return;
    root.querySelector(":scope .sbe-undo-bar")?.remove();
    if (!this.enabled) { root.classList.remove("sbe-undone"); return; }
    const run = this.runOfMessage(msgId);
    root.dataset.sbeUndoShown = run ? `${run.id}:${run.undone ? 1 : 0}:${this.runs().length}` : "";
    root.classList.toggle("sbe-undone", !!run?.undone);
    /* Les joueurs voient la carte annulée, sans bouton : seul le MJ revient en arrière. */
    if (!run || !game.user.isGM) return;
    const body = root.querySelector(".message-content") ?? root;
    const bar = document.createElement("div");
    bar.className = "sbe-undo-bar";
    if (!run.undone) {
      const chain = this.chainUndo(run.id);
      const why = this.denyUndo(chain);
      if (this.#confirm.has(msgId) && !why) {
        const names = chain.map(r => r.label || r.actorName || "?");
        bar.innerHTML = `<p class="sbe-undo-ask">${esc(L("SBE.Undo.Ask", { n: chain.length }))}</p>
          <ul class="sbe-undo-list">${names.map(n => `<li>${esc(n)}</li>`).join("")}</ul>
          <div class="sbe-undo-btns"><button type="button" data-undo="go"><i class="fa-solid fa-rotate-left"></i> ${esc(L("SBE.Undo.Confirm"))}</button>
          <button type="button" data-undo="no">${esc(L("SBE.Undo.Keep"))}</button></div>`;
      } else {
        bar.innerHTML = `<button type="button" data-undo="ask" ${why ? `disabled data-tooltip-text="${esc(why)}"` : ""}><i class="fa-solid fa-rotate-left"></i> ${esc(L("SBE.Undo.Undo"))}</button>`;
      }
    } else {
      const chain = this.chainRedo(run.id);
      const why = this.denyRedo(chain);
      bar.innerHTML = `<span class="sbe-undo-tag"><i class="fa-solid fa-ban"></i> ${esc(L("SBE.Undo.Undone"))}</span>`
        + (why ? "" : `<button type="button" data-undo="redo"><i class="fa-solid fa-rotate-right"></i> ${esc(L("SBE.Undo.Redo"))}</button>`);
    }
    if (game.user.isGM) bar.insertAdjacentHTML("beforeend", `<a class="sbe-undo-hist" data-undo="hist" data-tooltip-text="${esc(L("SBE.Undo.HistoryTitle"))}"><i class="fa-solid fa-clock-rotate-left"></i></a>`);
    body.appendChild(bar);
    bar.addEventListener("click", async (ev) => {
      const b = ev.target.closest("[data-undo]");
      if (!b || b.disabled) return;
      ev.preventDefault();
      ev.stopPropagation();
      const what = b.dataset.undo;
      if (what === "ask") { this.#confirm.add(msgId); this.#decorate(msgId, root); return; }
      if (what === "no") { this.#confirm.delete(msgId); this.#decorate(msgId, root); return; }
      if (what === "hist") { const { SBEUndoHistory } = await import("./undo-history-app.mjs"); SBEUndoHistory.open(); return; }
      this.#confirm.delete(msgId);
      for (const x of bar.querySelectorAll("button")) x.disabled = true;
      if (what === "go") await this.undo(run.id);
      else if (what === "redo") await this.redo(run.id);
    });
  }
}
