/**
 * SBE — SUIVI DES QUÊTES À L'ÉCRAN
 *
 * Une petite fenêtre (déplaçable, position gardée par joueur) ouverte
 * et fermée par un bouton de la barre de gauche (contrôles des jetons).
 *
 *   - Joueur : les quêtes en cours qu'il voit, filtrées selon le
 *     réglage du journal — « chaque joueur épingle les siennes » ou
 *     « le MJ choisit ». Une quête est SUIVIE par défaut : on retire
 *     l'épingle (drapeaux du joueur `questUnpins`, ou drapeau `tracked`
 *     = false de la quête en mode MJ).
 *   - MJ : un onglet par section de tous les journaux de quêtes, ouvert
 *     sur celle du groupe actif ; toutes les quêtes en cours (cachées
 *     comprises, signalées).
 * Clic sur une quête : le journal s'ouvre dessus.
 */

import { SYSTEM_ID, SYSTEM_PATH } from "../../helpers/constants.mjs";
import { QuestManager } from "./quest-manager.mjs";
import { SBEQueteData } from "../../data/quete-data.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class SBEQuestTracker extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "sbe-quest-tracker",
    classes: ["sbe-quest-tracker", "sbe-widget"],
    window: { title: "SBE.Quest.TrackerTitle", icon: "fa-solid fa-scroll", resizable: true, minimizable: true },
    position: { width: 300, height: 360, top: 80, left: window.innerWidth - 620 },
    actions: {
      qtTab: SBEQuestTracker.#onTab,
      qtOpen: SBEQuestTracker.#onOpen,
      qtFold: SBEQuestTracker.#onFold,
      qtFoldAll: SBEQuestTracker.#onFoldAll
    }
  };

  static PARTS = { body: { template: `${SYSTEM_PATH}/templates/journal/quest-tracker.hbs`, scrollable: [".sbe-qt-list"] } };

  static instance = null;
  _tab = null;

  /* ---------------------------------------------------------- */
  /*  Ouverture / fermeture                                      */
  /* ---------------------------------------------------------- */

  static isOpen() { return !!this.instance?.rendered; }

  static async toggle(force) {
    const open = force ?? !this.isOpen();
    await game.settings.set(SYSTEM_ID, "questTrackerOpen", open);
    if (open) {
      this.instance ??= new SBEQuestTracker();
      const pos = game.settings.get(SYSTEM_ID, "questTrackerPos");
      await this.instance.render({ force: true, position: pos?.left !== undefined ? pos : undefined });
    } else if (this.instance?.rendered) await this.instance.close({ sbeKeep: true });
    this.syncButton(open);
  }

  /** Le bouton de gauche suit l'état réel de la fenêtre. */
  static syncButton(open) {
    const tool = ui.controls?.controls?.tokens?.tools?.sbeQuests ?? ui.controls?.controls?.token?.tools?.sbeQuests;
    if (tool) tool.active = open;
    ui.controls?.render?.();
  }

  static refresh() { if (this.isOpen()) this.instance.render(); }

  /** Quêtes que le joueur a retirées de son suivi (mode « chaque joueur »). */
  static unpinsOf(user = game.user) { return user.getFlag(SYSTEM_ID, "questUnpins") ?? []; }

  static async togglePin(page) {
    const cfg = QuestManager.configOf(page.parent);
    if (cfg.widget?.mode === "gm") {
      if (!game.user.isGM) return;
      return page.setFlag(SYSTEM_ID, "tracked", !this.isPinned(page));
    }
    const off = new Set(this.unpinsOf());
    if (off.has(page.uuid)) off.delete(page.uuid); else off.add(page.uuid);
    await game.user.setFlag(SYSTEM_ID, "questUnpins", [...off]);
    this.refresh();
  }

  static isPinned(page) {
    const cfg = QuestManager.configOf(page.parent);
    return cfg.widget?.mode === "gm" ? page.getFlag(SYSTEM_ID, "tracked") !== false : !this.unpinsOf().includes(page.uuid);
  }

  /* ---------------------------------------------------------- */
  /*  Contenu                                                    */
  /* ---------------------------------------------------------- */

  #questRow(page, cfg) {
    const st = QuestManager.statusOf(cfg, page.system.status);
    const isGM = game.user.isGM;
    const objs = page.system.objectives.filter(o => isGM || !o.hidden).map(o => ({
      label: o.label || "?", sub: !!o.parent, done: SBEQueteData.objectiveDone(o), failed: !!o.failed, hidden: o.hidden,
      count: o.kind === "count" ? `${o.count ?? 0} / ${o.target ?? 1}` : "", optional: o.optional
    }));
    const folded = SBEQuestTracker.folded().includes(page.uuid);
    const left = objs.filter(o => !o.done && !o.failed && !o.sub).length;
    return { uuid: page.uuid, name: page.name, img: page.system.img || "icons/svg/book.svg", hidden: page.system.hidden, stIcon: st?.icon, stColor: st?.color, objectives: objs, folded, left };
  }

  #isActive(page, cfg) {
    return page.type === "quete" && (QuestManager.statusOf(cfg, page.system.status)?.kind ?? "active") === "active";
  }

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    const journals = (game.journal ?? []).filter(j => QuestManager.isQuestJournal(j));
    if (!game.user.isGM) {
      const quests = [];
      for (const j of journals) {
        const cfg = QuestManager.configOf(j);
        for (const p of j.pages) {
          if (!this.#isActive(p, cfg) || !p.testUserPermission(game.user, "OBSERVER")) continue;
          if (!SBEQuestTracker.isPinned(p)) continue;
          quests.push(this.#questRow(p, cfg));
        }
      }
      return Object.assign(ctx, { isGM: false, quests, anyOpen: quests.some(q => !q.folded), emptyKey: "SBE.Quest.TrackerEmpty" });
    }
    /* MJ : onglets = sections de tous les journaux. */
    const tabs = [];
    const activeGroup = (await import("../group/group-manager.mjs")).GroupManager.active?.() ?? null;
    for (const j of journals) {
      const cfg = QuestManager.configOf(j);
      for (const s of cfg.sections) {
        const quests = j.pages.filter(p => this.#isActive(p, cfg) && p.system.sectionId === s.id).map(p => this.#questRow(p, cfg));
        /* Icône de l'onglet : l'image du groupe, sinon celle du premier PJ. */
        const g = s.groupUuid ? fromUuidSync(s.groupUuid) : null;
        const img = g?.img || QuestManager.sectionActors(s)[0]?.img || "icons/svg/mystery-man.svg";
        tabs.push({ id: `${j.id}.${s.id}`, label: journals.length > 1 ? `${s.name} (${j.name})` : s.name, quests, img,
          count: quests.length, isGroup: !!activeGroup && s.groupUuid === activeGroup.uuid });
      }
    }
    if (!tabs.some(t => t.id === this._tab)) this._tab = (tabs.find(t => t.isGroup) ?? tabs[0])?.id ?? null;
    for (const t of tabs) t.active = t.id === this._tab;
    const cur = tabs.find(t => t.active);
    return Object.assign(ctx, { isGM: true, tabs, quests: cur?.quests ?? [], anyOpen: (cur?.quests ?? []).some(q => !q.folded),
      emptyKey: tabs.length ? "SBE.Quest.TrackerNone" : "SBE.Quest.TrackerNoSection" });
  }

  /* Position gardée par joueur. */
  setPosition(pos) {
    const out = super.setPosition(pos);
    if (this.rendered) {
      clearTimeout(this._posT);
      this._posT = setTimeout(() => {
        const { left, top, width, height } = this.position;
        game.settings.set(SYSTEM_ID, "questTrackerPos", { left, top, width, height });
      }, 400);
    }
    return out;
  }

  /* Fermée par la croix : le bouton de gauche suit. */
  async close(options = {}) {
    /* Sans l'animation de fermeture : sinon la fenêtre traîne et laisse
       un trait à l'écran le temps de l'animation. */
    const r = await super.close({ ...options, animate: false });
    if (!options.sbeKeep) {
      await game.settings.set(SYSTEM_ID, "questTrackerOpen", false);
      SBEQuestTracker.syncButton(false);
    }
    return r;
  }

  static #onTab(_e, t) { this._tab = t.dataset.tab; this.render(); }

  /** Quêtes repliées (par joueur). */
  static folded() { return game.settings.get(SYSTEM_ID, "questTrackerFolded") ?? []; }

  static async #onFold(_e, t) {
    const set = new Set(SBEQuestTracker.folded());
    const u = t.dataset.uuid;
    if (set.has(u)) set.delete(u); else set.add(u);
    await game.settings.set(SYSTEM_ID, "questTrackerFolded", [...set]);
    this.render();
  }

  /* Tout replier / tout déplier (les quêtes affichées). */
  static async #onFoldAll(_e, t) {
    const shown = [...this.element.querySelectorAll(".sbe-qt-quest[data-uuid]")].map(e => e.dataset.uuid);
    const set = new Set(SBEQuestTracker.folded());
    const fold = t.dataset.fold === "1";
    for (const u of shown) { if (fold) set.add(u); else set.delete(u); }
    await game.settings.set(SYSTEM_ID, "questTrackerFolded", [...set]);
    this.render();
  }

  static async #onOpen(_e, t) {
    const page = await fromUuid(t.dataset.uuid).catch(() => null);
    if (!page) return;
    const sheet = page.parent?.sheet;
    if (sheet) { sheet._sel = page.id; sheet._tab = "quests"; sheet.render(true); }
  }

  /* ---------------------------------------------------------- */
  /*  Mise en place                                              */
  /* ---------------------------------------------------------- */

  static init() {
    game.settings.register(SYSTEM_ID, "questTrackerOpen", { scope: "client", config: false, type: Boolean, default: false });
    game.settings.register(SYSTEM_ID, "questTrackerPos", { scope: "client", config: false, type: Object, default: {} });
    game.settings.register(SYSTEM_ID, "questTrackerFolded", { scope: "client", config: false, type: Array, default: [] });

    /* Bouton de la barre de gauche (contrôles des jetons). */
    Hooks.on("getSceneControlButtons", (controls) => {
      const group = controls.tokens ?? controls.token;
      if (!group?.tools) return;
      group.tools.sbeQuests = {
        name: "sbeQuests", order: 90, title: "SBE.Quest.TrackerTitle", icon: "fa-solid fa-scroll",
        toggle: true, active: SBEQuestTracker.isOpen() || game.settings.get(SYSTEM_ID, "questTrackerOpen"),
        onChange: (_event, active) => { if (active !== SBEQuestTracker.isOpen()) SBEQuestTracker.toggle(active); }
      };
    });

    Hooks.once("ready", () => { if (game.settings.get(SYSTEM_ID, "questTrackerOpen")) this.toggle(true); });

    const r = () => { clearTimeout(this._rt); this._rt = setTimeout(() => this.refresh(), 150); };
    for (const h of ["createJournalEntryPage", "updateJournalEntryPage", "deleteJournalEntryPage", "updateJournalEntry", "updateActor"]) Hooks.on(h, r);
    Hooks.on("updateUser", (u) => { if (u.id === game.user.id) r(); });
  }
}
