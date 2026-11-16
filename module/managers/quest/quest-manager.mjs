/**
 * SBE — QUÊTES : journaux de quêtes, configuration, sections, droits
 *
 * Un journal de quêtes est un journal de Foundry marqué SBE
 * (`flags.<sbe>.questConfig`) qui s'ouvre avec la fiche SBE. Le MJ en
 * crée autant qu'il veut (bouton « Journal de quêtes » de l'onglet
 * Journaux). Chaque quête est une page de type « quete ».
 *
 * La CONFIGURATION vit dans le journal (une seule source) : stats de
 * récompense et de pénalité, catégories, statuts, médias, sections,
 * mode du suivi à l'écran.
 *
 * SECTIONS : un groupe glissé (ses membres le suivent) ou des PJ choisis.
 * Une quête appartient à une section ; ses droits = les joueurs
 * propriétaires des membres (Foundry cache le reste aux autres joueurs).
 */

import { SYSTEM_ID, soundGain } from "../../helpers/constants.mjs";
import { ChatCards } from "../chat/chat-cards.mjs";
import { walkElements, slotAccepts, isRefList } from "../../builder/element-renderer.mjs";
import { dropIntoContainer, isStackableItem } from "../../builder/inventory.mjs";
import { GroundItems } from "../ground/ground-items.mjs";
import { WaitingItems } from "../waiting/waiting-items.mjs";
import { SBEQueteData } from "../../data/quete-data.mjs";
import { evalExpression } from "../../builder/formula-engine.mjs";
import { docScope } from "../../builder/doc-context.mjs";
import { onSocketMessage, emitSocket, isPrimaryGM, requestGM, gmQueue } from "../../helpers/socket.mjs";

const L = (k) => game.i18n.localize(k);
const OWN = () => CONST.DOCUMENT_OWNERSHIP_LEVELS;
export const QUEST_SHEET_ID = `${SYSTEM_ID}.SBEQuestJournalSheet`;
export const STATUS_KINDS = ["active", "success", "fail", "cancel"];
export const STAT_OPS = ["add", "sub", "set"];

export class QuestManager {

  /* ========================================================== */
  /*  Configuration                                              */
  /* ========================================================== */

  static defaultConfig() {
    const st = (id, kind, color, icon) => ({ id, kind, color, icon, label: L(`SBE.Quest.Status.${id}`) });
    return {
      stats: [],
      penalties: { enabled: false, stats: [] },
      categories: [
        { id: "main", label: L("SBE.Quest.Cat.main"), color: "#c8a03c", icon: "fa-solid fa-crown" },
        { id: "side", label: L("SBE.Quest.Cat.side"), color: "#6f8fb0", icon: "fa-solid fa-compass" }
      ],
      statuses: [
        st("active", "active", "#5f9ea0", "fa-solid fa-hourglass-half"),
        st("success", "success", "#4caf50", "fa-solid fa-check"),
        st("fail", "fail", "#c0392b", "fa-solid fa-xmark"),
        st("cancel", "cancel", "#8a8a8a", "fa-solid fa-ban")
      ],
      media: Object.fromEntries(["given", "success", "fail", "cancel"].map(k => [k, { sound: "", volume: 80 }])),
      audience: "all",
      /* La quête passe en réussie quand tous les objectifs obligatoires sont faits. */
      autoComplete: false,
      widget: { mode: "players" },
      sections: [],
      /* Sous-onglets de l'onglet Quêtes : { id, name, icon, hidden }. */
      tabs: []
    };
  }

  static isQuestJournal(doc) {
    return doc?.documentName === "JournalEntry" && !!doc.flags?.[SYSTEM_ID]?.questConfig;
  }

  /** Configuration complète (défauts pour ce qui manque). */
  static configOf(journal) {
    const raw = journal?.flags?.[SYSTEM_ID]?.questConfig ?? {};
    const def = this.defaultConfig();
    const cfg = foundry.utils.mergeObject(def, foundry.utils.deepClone(raw), { inplace: false, insertKeys: true });
    for (const k of ["stats", "categories", "statuses", "sections", "tabs"]) if (Array.isArray(raw[k])) cfg[k] = foundry.utils.deepClone(raw[k]);
    if (Array.isArray(raw.penalties?.stats)) cfg.penalties.stats = foundry.utils.deepClone(raw.penalties.stats);
    /* Les quatre statuts de base existent toujours. */
    for (const s of def.statuses) if (!cfg.statuses.some(x => x.id === s.id)) cfg.statuses.push(s);
    return cfg;
  }

  static async saveConfig(journal, cfg) {
    await journal.update({ [`flags.${SYSTEM_ID}.questConfig`]: cfg });
    await this.syncOwnership(journal);
  }

  static statusOf(cfg, id) {
    return cfg.statuses.find(s => s.id === id) ?? cfg.statuses.find(s => s.id === "active");
  }

  static categoryOf(cfg, id) {
    return cfg.categories.find(c => c.id === id) ?? null;
  }

  /* ========================================================== */
  /*  Sections et droits                                         */
  /* ========================================================== */

  /** Acteurs d'une section (groupe glissé, ou PJ choisis). */
  static sectionActors(section) {
    let uuids = section?.members ?? [];
    if (section?.groupUuid) {
      const g = fromUuidSync(section.groupUuid);
      uuids = g?.system?.members ?? [];
    }
    return uuids.map(u => fromUuidSync(u)).filter(a => a?.documentName === "Actor");
  }

  /** Joueurs (non MJ) propriétaires d'au moins un acteur de la section. */
  static sectionUsers(section) {
    const ids = new Set();
    for (const a of this.sectionActors(section)) {
      for (const u of game.users) {
        if (!u.isGM && a.testUserPermission(u, "OWNER")) ids.add(u.id);
      }
    }
    return [...ids];
  }

  /** Remet les droits de chaque quête selon sa section. MJ seulement. */
  static async syncOwnership(journal) {
    if (!game.user.isGM || !this.isQuestJournal(journal)) return;
    const cfg = this.configOf(journal);
    const updates = [];
    for (const page of journal.pages) {
      if (page.type !== "quete") continue;
      const sec = cfg.sections.find(s => s.id === page.system.sectionId);
      const want = new Set(sec && !page.system.hidden ? this.sectionUsers(sec) : []);
      const ownership = { default: OWN().NONE };
      /* Anciens joueurs remis explicitement à « aucun » (la mise à jour fusionne). */
      for (const k of Object.keys(page.ownership ?? {})) if (k !== "default") ownership[k] = OWN().NONE;
      for (const uid of want) ownership[uid] = OWN().OBSERVER;
      const same = Object.entries(ownership).every(([k, v]) => (page.ownership?.[k] ?? (k === "default" ? undefined : OWN().NONE)) === v);
      if (same) continue;
      updates.push({ _id: page.id, ownership });
    }
    if (updates.length) await journal.updateEmbeddedDocuments("JournalEntryPage", updates);
  }

  static async syncAll() {
    if (!game.user.isGM) return;
    for (const j of game.journal ?? []) if (this.isQuestJournal(j)) await this.syncOwnership(j);
  }

  /* ========================================================== */
  /*  Clés utilisables (modèles de personnage)                   */
  /* ========================================================== */

  static async templateKeys() {
    const { walkElements } = await import("../../builder/element-renderer.mjs");
    const keys = new Set();
    for (const t of game.actors?.filter(a => a.type === "template") ?? []) {
      for (const el of walkElements(t.system.elements ?? [])) if (el?.key) keys.add(el.key);
    }
    return [...keys].sort();
  }

  /* ========================================================== */
  /*  Création                                                   */
  /* ========================================================== */

  /* ========================================================== */
  /*  Annonce et fin de quête                                    */
  /* ========================================================== */

  static journalOf(page) { return page?.parent ?? null; }

  static sectionOfPage(page) {
    const cfg = this.configOf(this.journalOf(page));
    return cfg.sections.find(s => s.id === page.system.sectionId) ?? null;
  }

  /** Destinataires des cartes : joueurs de la section + MJ. */
  static whisperOf(page) {
    const sec = this.sectionOfPage(page);
    const ids = new Set(game.users.filter(u => u.isGM).map(u => u.id));
    for (const id of (sec ? this.sectionUsers(sec) : [])) ids.add(id);
    return [...ids];
  }

  /** Son d'un événement : le MJ, et les joueurs de la section si « tout le monde ». */
  static playMedia(journal, kind, page = null) {
    const cfg = this.configOf(journal);
    const m = cfg.media?.[kind];
    if (!m?.sound) return;
    const play = () => {
      try { foundry.audio.AudioHelper.play({ src: m.sound, volume: soundGain(m.volume ?? 80), autoplay: true, loop: false }, false); }
      catch (err) { console.warn("SBE | Quêtes : son en échec", err); }
    };
    play();
    if (cfg.audience === "all" && page) {
      const sec = this.sectionOfPage(page);
      const users = sec ? this.sectionUsers(sec) : [];
      if (users.length) emitSocket({ type: "sbeQuestSound", users, src: m.sound, volume: m.volume ?? 80 });
    }
  }

  static async _card(page, title, icon, lines) {
    await ChatCards.post({
      type: "quest", icon, title, subtitle: page.name,
      body: lines.map(l => `<div class="sbe-card-line">${l}</div>`).join(""),
      speaker: { alias: this.journalOf(page)?.name ?? page.name },
      whisper: this.whisperOf(page)
    });
  }

  /** Annonce la quête à sa section (carte + son « obtenue »). */
  static async announce(page) {
    if (!game.user.isGM) return;
    if (page.system.hidden) await page.update({ "system.hidden": false });
    const esc = foundry.utils.escapeHTML;
    const objs = page.system.objectives.filter(o => !o.hidden && !o.parent).map(o => `• ${esc(o.label)}`);
    await this._card(page, L("SBE.Quest.CardGiven"), "fa-solid fa-scroll", objs.length ? objs : [esc(page.name)]);
    this.playMedia(this.journalOf(page), "given", page);
  }

  /** Tous les objectifs obligatoires sont-ils faits ? */
  static requiredDone(page) {
    const req = page.system.objectives.filter(o => !o.optional);
    return req.length > 0 && req.every(o => SBEQueteData.objectiveDone(o));
  }

  /** Répartition égale d'un total entre n membres. */
  static split(total, n) {
    if (n <= 0) return [];
    if (!Number.isInteger(total)) return Array(n).fill(Math.round(total / n * 100) / 100);
    const base = Math.floor(total / n);
    return Array.from({ length: n }, (_v, i) => base + (i < total - base * n ? 1 : 0));
  }

  /**
   * Fenêtre de répartition des entrées « au total » : une ligne par
   * membre, parts égales préremplies (bouton pour y revenir).
   * Renvoie { "v0": [parts…], "i0": [parts…] } ou null (annulé).
   */
  static async askSplit(entries, actors) {
    if (!entries.length) return {};
    const esc = foundry.utils.escapeHTML;
    const blocks = entries.map(e => {
      const parts = this.split(e.total, actors.length);
      const rows = actors.map((a, i) => `<div class="sbe-qsplit-row"><label>${esc(a.name)}</label>
        <input type="number" step="any" min="0" name="${e.id}.${i}" value="${parts[i]}"></div>`).join("");
      return `<fieldset class="sbe-qsplit" data-id="${e.id}" data-total="${e.total}">
        <legend>${esc(e.label)} — ${L("SBE.Quest.Total")} ${e.total}</legend>${rows}
        <button type="button" class="sbe-qsplit-eq" data-id="${e.id}"><i class="fa-solid fa-scale-balanced"></i> ${L("SBE.Quest.EqualShares")}</button>
      </fieldset>`;
    }).join("");
    const res = await foundry.applications.api.DialogV2.wait({
      window: { title: L("SBE.Quest.SplitTitle") },
      classes: ["sbe-quest-split"],
      content: `<div class="sbe-qsplit-wrap">${blocks}</div>`,
      buttons: [
        { action: "ok", label: L("SBE.Quest.Distribute"), icon: "fa-solid fa-check", default: true,
          callback: (_e, b) => {
            const out = {};
            for (const e of entries) out[e.id] = actors.map((_a, i) => Math.max(0, Number(b.form.elements[`${e.id}.${i}`]?.value) || 0));
            return out;
          } },
        { action: "cancel", label: L("SBE.Common.Cancel"), icon: "fa-solid fa-xmark" }
      ],
      render: (_e, dialog) => {
        dialog.element.querySelectorAll(".sbe-qsplit-eq").forEach(btn => btn.addEventListener("click", () => {
          const e = entries.find(x => x.id === btn.dataset.id);
          const parts = this.split(e.total, actors.length);
          actors.forEach((_a, i) => { const inp = dialog.element.querySelector(`[name="${e.id}.${i}"]`); if (inp) inp.value = parts[i]; });
        }));
      },
      rejectClose: false
    }).catch(() => null);
    return res && res !== "cancel" ? res : null;
  }

  /** Range un objet dans la fiche (sinon à ses pieds) : un objet du monde
      donne un exemplaire neuf, un objet porté change de mains. */
  static async giveItem(actor, item, qty, where = null) {
    if (!item || qty <= 0) return false;
    /* Le contenant demandé (« Où ») s'il y en a un ; sinon le premier
       conteneur qui a la place ; à défaut, le premier qui l'accepte le
       reçoit dans sa zone d'attente. */
    const conts = where ? [where] : [...walkElements(actor?.system?.template?.system?.elements ?? [])]
      .filter(el => el?.kind === "container" && el.key && !isRefList(el) && !slotAccepts(el, item, actor));
    const place = async (n) => {
      for (const overflow of [false, true]) {
        for (const el of conts) {
          const ok = await dropIntoContainer({ sheetDoc: actor, el, item, quantity: n, overflow, quiet: !overflow }).catch(() => false);
          if (ok === "overflow") WaitingItems.notify(actor);
          if (ok) return true;
        }
      }
      return false;
    };
    /* Un objet du monde NON empilable : un exemplaire par dépôt (3 épées
       achetées = 3 épées, pas une seule). */
    let left = qty;
    if (!item.parent && !isStackableItem(item)) {
      while (left > 0 && await place(1)) left--;
    } else if (await place(qty)) left = 0;
    if (left <= 0) return true;
    /* Un objet porté par quelqu'un d'autre change de mains (comme dans un
       conteneur) ; un objet du monde donne un exemplaire neuf. Le MJ le
       range (ou le pose à ses pieds) puis le retire de son porteur. */
    if (!item.parent && !isStackableItem(item)) {
      for (; left > 0; left--) await GroundItems.moveItem(item, 1, { actor });
    } else await GroundItems.moveItem(item, left, { actor });
    return false;
  }

  /**
   * Termine la quête : réussie (récompenses), échouée (pénalités si
   * activées) ou annulée (rien). Carte à la section + son.
   */
  /* Quêtes en cours de clôture : une seule à la fois (deux objectifs
     finis ensemble, un double clic… ne donnent pas deux récompenses). */
  static #completing = new Set();

  static async complete(page, kind) {
    if (!game.user.isGM || !["success", "fail", "cancel"].includes(kind) || !page) return false;
    if (this.#completing.has(page.uuid)) return false;
    this.#completing.add(page.uuid);
    try { return await this.#complete(page, kind); }
    finally { this.#completing.delete(page.uuid); }
  }

  static async #complete(page, kind) {
    /* Déjà close ainsi : rien n'est redonné. */
    if (page.system.status === kind) return false;
    const journal = this.journalOf(page);
    const cfg = this.configOf(journal);
    const esc = foundry.utils.escapeHTML;
    const actors = this.sectionActors(this.sectionOfPage(page)).filter(a => a.type === "personnage");
    const bundle = kind === "success" ? page.system.rewards
      : (kind === "fail" && cfg.penalties.enabled ? page.system.penalties : { values: [], items: [] });
    const stats = kind === "success" ? cfg.stats : cfg.penalties.stats;

    /* Entrées à répartir. */
    const totals = [];
    bundle.values.forEach((v, i) => {
      if (v.mode !== "total") return;
      const st = stats.find(x => x.key === v.key);
      totals.push({ id: `v${i}`, total: Number(v.amount) || 0, label: st?.label || v.key });
    });
    bundle.items.forEach((it, i) => {
      if (it.mode !== "total") return;
      totals.push({ id: `i${i}`, total: it.qty, label: fromUuidSync(it.uuid)?.name ?? L("SBE.Quest.ItemGone") });
    });
    let shares = {};
    if (totals.length && actors.length) {
      shares = actors.length === 1
        ? Object.fromEntries(totals.map(e => [e.id, [e.total]]))
        : await this.askSplit(totals, actors);
      if (!shares) return false;
    }

    /* Application, membre par membre. Une clé de composant Niveau donne
       (ou retire) des niveaux selon son réglage « Niveaux reçus ». */
    const { LevelManager, levelElByKey, levelStateOf } = await import("../../builder/levels/level-sheet.mjs");
    const lines = [];
    for (const [ai, actor] of actors.entries()) {
      const got = [];
      const upd = {};
      const grants = [];
      bundle.values.forEach((v, i) => {
        const st = stats.find(x => x.key === v.key);
        if (!st?.key) return;
        const amt = v.mode === "total" ? (shares[`v${i}`]?.[ai] ?? 0) : (Number(v.amount) || 0);
        if (!amt && st.op !== "set") return;
        const lv = levelElByKey(actor, st.key);
        if (lv) {
          const cur = levelStateOf(actor, lv).level;
          const n = Math.trunc(st.op === "set" ? amt - cur : (st.op === "sub" ? -amt : amt));
          if (n) { grants.push([lv, n]); got.push(`${n > 0 ? "+" : ""}${n} ${esc(st.label || st.key)}`); }
          return;
        }
        const path = `system.values.${st.key}`;
        const cur = Number(foundry.utils.getProperty(upd, path) ?? foundry.utils.getProperty(actor, path)) || 0;
        const next = st.op === "set" ? amt : (st.op === "sub" ? cur - amt : cur + amt);
        upd[path] = next;
        const sign = st.op === "set" ? "=" : (st.op === "sub" ? "−" : "+");
        got.push(`${sign}${amt} ${esc(st.label || st.key)}`);
      });
      if (Object.keys(upd).length) await actor.update(upd);
      for (const [lv, n] of grants) await LevelManager.grant(actor, lv, n);
      for (const [i, it] of bundle.items.entries()) {
        const n = it.mode === "total" ? (shares[`i${i}`]?.[ai] ?? 0) : it.qty;
        const item = await fromUuid(it.uuid).catch(() => null);
        if (!n || !item) continue;
        if (kind === "success") {
          const placed = await this.giveItem(actor, item, n);
          got.push(`${esc(item.name)} ×${n}${placed ? "" : ` (${esc(L("SBE.Quest.AtFeet"))})`}`);
        } else {
          /* Pénalité d'objet : retire des exemplaires portés. */
          const removed = await this.takeItem(actor, item, n);
          if (removed) got.push(`−${esc(item.name)} ×${removed}`);
        }
      }
      if (got.length) lines.push(`<b>${esc(actor.name)}</b> : ${got.join(", ")}`);
    }

    await page.update({ "system.status": kind });
    const titles = { success: "SBE.Quest.CardSuccess", fail: "SBE.Quest.CardFail", cancel: "SBE.Quest.CardCancel" };
    const icons = { success: "fa-solid fa-trophy", fail: "fa-solid fa-skull", cancel: "fa-solid fa-ban" };
    await this._card(page, L(titles[kind]), icons[kind], lines.length ? lines : [esc(page.name)]);
    this.playMedia(journal, kind, page);
    return true;
  }

  /** Retire jusqu'à n exemplaires d'un objet du monde portés par l'acteur. */
  static async takeItem(actor, worldItem, n) {
    const { qtyOf, isStackableItem, QUANTITY_KEY } = await import("../../builder/inventory.mjs");
    let left = n;
    for (const it of actor.items.filter(i => i.type === "objet" && i.system?.modelId === worldItem.id)) {
      if (left <= 0) break;
      const q = isStackableItem(it) ? qtyOf(it) : 1;
      if (q > left) { await it.update({ [`system.values.${QUANTITY_KEY}`]: q - left }); left = 0; }
      else { await it.delete(); left -= q; }
    }
    return n - left;
  }

  /* ========================================================== */
  /*  « Fait si » : objectifs cochés tout seuls                  */
  /* ========================================================== */

  /** Acteurs d'une cible : l'acteur, et ses pions non liés sur les scènes. */
  static targetActors(uuid) {
    const a = uuid ? fromUuidSync(uuid) : null;
    if (a?.documentName !== "Actor") return [];
    const out = [a];
    if (!a.prototypeToken?.actorLink) {
      for (const sc of game.scenes ?? []) for (const t of sc.tokens ?? []) {
        if (t.actorId === a.id && !t.actorLink && t.actor) out.push(t.actor);
      }
    }
    return out;
  }

  static #eval(formula, actor) {
    try { return evalExpression(formula, docScope(actor)); } catch (_e) { return null; }
  }

  /** Recalcule les objectifs automatiques des quêtes en cours (MJ principal). */
  static async checkAuto() {
    if (!isPrimaryGM()) return;
    for (const journal of game.journal ?? []) {
      if (!this.isQuestJournal(journal)) continue;
      const cfg = this.configOf(journal);
      for (const page of journal.pages) {
        if (page.type !== "quete") continue;
        if ((this.statusOf(cfg, page.system.status)?.kind ?? "active") !== "active") continue;
        /* « Apparaît si » : une quête cachée se révèle (et s'annonce). */
        const rif = String(page.system.revealIf ?? "").trim();
        if (page.system.hidden && rif) {
          const mem = this.sectionActors(this.sectionOfPage(page)).filter(a => a.type === "personnage");
          if (mem.some(a => { const v = this.#eval(rif, a); return v !== null && v !== undefined && !!v; })) await this.announce(page);
          continue;
        }
        if (page.system.hidden) continue;
        const objs = page.system.toObject().objectives;
        let changed = false;
        for (const o of objs) {
          const f = String(o.auto?.formula ?? "").trim();
          if (!o.auto?.on || !f || o.failed) continue;
          const actors = o.auto.who === "target" ? this.targetActors(o.auto.target)
            : this.sectionActors(this.sectionOfPage(page)).filter(a => a.type === "personnage");
          if (!actors.length) continue;
          const vals = actors.map(a => this.#eval(f, a));
          if (o.kind === "count") {
            const n = o.auto.who === "target" ? Math.max(...vals.map(v => Number(v) || 0))
              : vals.reduce((s, v) => s + (Number(v) || 0), 0);
            const c = Math.max(0, Math.min(o.target, Math.floor(n)));
            if (c !== o.count) { o.count = c; changed = true; }
          } else {
            const d = vals.some(v => v !== null && v !== undefined && !!v);
            if (d !== o.done) { o.done = d; changed = true; }
          }
        }
        if (!changed) continue;
        await page.update({ "system.objectives": objs });
        if (cfg.autoComplete && this.requiredDone(page)) await this.complete(page, "success");
      }
    }
  }

  /* ========================================================== */
  /*  Étape « Quête » des boutons                                */
  /* ========================================================== */

  /** Toutes les quêtes (pour l'éditeur d'étapes). */
  static allQuests() {
    const out = [];
    for (const j of game.journal ?? []) {
      if (!this.isQuestJournal(j)) continue;
      for (const p of j.pages) if (p.type === "quete") out.push({ uuid: p.uuid, label: `${j.name} — ${p.name}`,
        objectives: p.system.objectives.map(o => ({ id: o.id, label: o.label || "?" })) });
    }
    return out;
  }

  /** Lancé par un bouton (n'importe quel client) : exécuté par le MJ principal. */
  static async runStep(step) {
    if (isPrimaryGM()) return this.applyStep(step);
    requestGM({ type: "sbeQuestStep", step });
  }

  /* Les étapes d'une même quête passent l'une après l'autre (deux
     avancées en même temps ne s'écrasent pas). */
  static async applyStep(step) {
    return gmQueue(`quest:${step?.quest ?? ""}`, () => this.#applyStep(step));
  }

  static async #applyStep({ quest, action, obj, amount = 1, status }) {
    const page = await fromUuid(quest).catch(() => null);
    if (page?.type !== "quete") return;
    const cfg = this.configOf(this.journalOf(page));
    if (action === "give") {
      if ((this.statusOf(cfg, page.system.status)?.kind ?? "active") !== "active") await page.update({ "system.status": "active" });
      return this.announce(page);
    }
    if (action === "status") {
      if (status === "active") return page.update({ "system.status": "active" });
      return this.complete(page, status);
    }
    const objs = page.system.toObject().objectives;
    const o = objs.find(x => x.id === obj);
    if (!o) return;
    if (action === "fail") { o.failed = true; o.done = false; }
    else if (action === "reveal") o.hidden = false;
    else if (action === "hide") o.hidden = true;
    else if (action === "advance") {
      if (o.kind === "count") o.count = Math.max(0, Math.min(o.target, (o.count ?? 0) + (Number(amount) || 0)));
      else o.done = (Number(amount) || 0) >= 0;
      if (o.done) o.failed = false;
    }
    await page.update({ "system.objectives": objs });
    if (action === "advance" && cfg.autoComplete && (this.statusOf(cfg, page.system.status)?.kind ?? "active") === "active"
      && this.requiredDone(page)) await this.complete(page, "success");
  }

  static async createJournal() {
    const name = await foundry.applications.api.DialogV2.prompt({
      window: { title: L("SBE.Quest.CreateTitle") },
      content: `<div class="form-group"><label>${L("SBE.Quest.CreateName")}</label><input type="text" name="name" value="${foundry.utils.escapeHTML(L("SBE.Quest.JournalName"))}" autofocus></div>`,
      ok: { label: L("SBE.Common.Create"), callback: (_e, b) => b.form.elements.name.value.trim() },
      rejectClose: false
    }).catch(() => null);
    if (name === null || name === undefined) return null;
    const j = await JournalEntry.implementation.create({
      name: name || L("SBE.Quest.JournalName"),
      ownership: { default: OWN().OBSERVER },
      flags: {
        [SYSTEM_ID]: { questConfig: this.defaultConfig() },
        core: { sheetClass: QUEST_SHEET_ID }
      }
    });
    j?.sheet?.render(true);
    return j;
  }

  /* ========================================================== */
  /*  Mise en place                                              */
  /* ========================================================== */

  static init() {
    /* Bouton « Journal de quêtes » dans l'onglet Journaux (MJ). */
    Hooks.on("renderJournalDirectory", (_app, html) => {
      if (!game.user.isGM) return;
      const root = html instanceof HTMLElement ? html : html?.[0];
      const bar = root?.querySelector(".header-actions");
      if (!bar || bar.querySelector(".sbe-quest-create")) return;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "sbe-quest-create";
      b.innerHTML = `<i class="fa-solid fa-scroll"></i> ${L("SBE.Quest.CreateButton")}`;
      b.addEventListener("click", () => this.createJournal());
      bar.append(b);
    });

    /* Les membres d'un groupe ou les propriétaires changent : droits suivis. */
    let t = null;
    const later = () => { clearTimeout(t); t = setTimeout(() => this.syncAll(), 500); };
    Hooks.on("updateActor", (actor, changes) => {
      if (actor.type === "groupe" && foundry.utils.hasProperty(changes, "system.members")) later();
      else if ("ownership" in changes) later();
    });
    Hooks.on("updateUser", later);
    /* Quête cachée / révélée ou changée de section : droits suivis. */
    Hooks.on("updateJournalEntryPage", (page, changes) => {
      if (page.type !== "quete" || !game.user.isGM) return;
      if (foundry.utils.hasProperty(changes, "system.hidden") || foundry.utils.hasProperty(changes, "system.sectionId")) this.syncOwnership(page.parent);
    });

    /* « Fait si » : une fiche, un objet porté ou un pion change. */
    let a = null;
    const auto = () => { if (!isPrimaryGM()) return; clearTimeout(a); a = setTimeout(() => this.checkAuto(), 400); };
    for (const h of ["updateActor", "createItem", "updateItem", "deleteItem", "updateToken", "createToken", "deleteToken"]) Hooks.on(h, auto);

    /* Messages : étape « Quête » lancée par un joueur ; son de section. */
    onSocketMessage(async (p) => {
      if (p?.type === "sbeQuestStep" && isPrimaryGM()) return this.applyStep(p.step ?? {});
      if (p?.type === "sbeQuestSound" && (p.users ?? []).includes(game.user.id) && game.users.get(p._from)?.isGM) {
        try { foundry.audio.AudioHelper.play({ src: p.src, volume: soundGain(p.volume ?? 80), autoplay: true, loop: false }, false); }
        catch (_e) { /* son introuvable */ }
      }
    });
  }
}
