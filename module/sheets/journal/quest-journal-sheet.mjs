/**
 * SBE — Fiche du JOURNAL DE QUÊTES
 *
 * Onglet Quêtes : à gauche les sections (groupe ou PJ choisis) et leurs
 * quêtes, à droite la quête choisie (lecture pour les joueurs, édition
 * pour le MJ). Onglet Configuration (MJ) : sections, stats de
 * récompense et de pénalité, catégories, statuts, médias, suivi à l'écran.
 *
 * Les champs ne portent pas de « name » : chaque changement est écrit
 * par `data-qf` (champ de la quête, chemin dans system ou « name ») ou
 * `data-cf` (chemin dans la configuration du journal).
 */

import { SYSTEM_PATH } from "../../helpers/constants.mjs";
import { audioFormatsHint } from "../../helpers/constants.mjs";
import { Identity } from "../../helpers/identity.mjs";
import { testSound } from "../../managers/media/ui-sound.mjs";
import { QuestManager, STATUS_KINDS, STAT_OPS } from "../../managers/quest/quest-manager.mjs";
import { SBEQueteData } from "../../data/quete-data.mjs";
import { SBEQuestTracker } from "../../managers/quest/quest-tracker.mjs";
import { pickIcon } from "../../helpers/icon-picker.mjs";

const { HandlebarsApplicationMixin, DocumentSheetV2, DialogV2 } = foundry.applications.api;
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
/* Icône d'un sous-onglet : Font Awesome, image ou émoji. */
const tabIcon = (ic) => {
  const v = String(ic ?? "").trim();
  if (!v) return "";
  if (v.includes("/") || /\.(png|jpe?g|webp|svg|gif|avif)$/i.test(v)) return `<img class="sbe-qj-stab-img" src="${esc(v)}" alt="">`;
  if (v.includes("fa-")) return `<i class="${esc(/fa-(solid|regular|brands)/.test(v) ? v : `fa-solid ${v}`)}"></i>`;
  return `<span>${esc(v)}</span>`;
};
const CFG_LISTS = {
  stats: () => ({ key: "", label: "", icon: "fa-solid fa-star", op: "add" }),
  "penalties.stats": () => ({ key: "", label: "", icon: "fa-solid fa-skull", op: "sub" }),
  categories: () => ({ id: foundry.utils.randomID(), label: L("SBE.Quest.NewCategory"), color: "#888888", icon: "fa-solid fa-tag" }),
  statuses: () => ({ id: foundry.utils.randomID(), label: L("SBE.Quest.NewStatus"), kind: "active", color: "#888888", icon: "fa-solid fa-circle" })
};

export class SBEQuestJournalSheet extends HandlebarsApplicationMixin(DocumentSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["sbe-quest-journal"],
    position: { width: 920, height: 700 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      qjTab: SBEQuestJournalSheet.#onTab,
      qjRename: SBEQuestJournalSheet.#onRename,
      qjSubTab: SBEQuestJournalSheet.#onSubTab,
      qjAddSubTab: SBEQuestJournalSheet.#onAddSubTab,
      qjEditSubTab: SBEQuestJournalSheet.#onEditSubTab,
      qjDelSubTab: SBEQuestJournalSheet.#onDelSubTab,
      qjSelect: SBEQuestJournalSheet.#onSelect,
      qjAddQuest: SBEQuestJournalSheet.#onAddQuest,
      qjDelQuest: SBEQuestJournalSheet.#onDelQuest,
      qjQuestImg: SBEQuestJournalSheet.#onQuestImg,
      qjAddObj: SBEQuestJournalSheet.#onAddObj,
      qjDelObj: SBEQuestJournalSheet.#onDelObj,
      qjToggleObj: SBEQuestJournalSheet.#onToggleObj,
      qjStepObj: SBEQuestJournalSheet.#onStepObj,
      qjRevealObj: SBEQuestJournalSheet.#onRevealObj,
      qjAddValue: SBEQuestJournalSheet.#onAddValue,
      qjDelValue: SBEQuestJournalSheet.#onDelValue,
      qjDelItem: SBEQuestJournalSheet.#onDelItem,
      qjOpen: SBEQuestJournalSheet.#onOpen,
      qjClearRef: SBEQuestJournalSheet.#onClearRef,
      qjCfgAdd: SBEQuestJournalSheet.#onCfgAdd,
      qjCfgDel: SBEQuestJournalSheet.#onCfgDel,
      qjDelSection: SBEQuestJournalSheet.#onDelSection,
      qjDelMember: SBEQuestJournalSheet.#onDelMember,
      qjPickSound: SBEQuestJournalSheet.#onPickSound,
      qjTestSound: SBEQuestJournalSheet.#onTestSound,
      qjAnnounce: SBEQuestJournalSheet.#onAnnounce,
      qjComplete: SBEQuestJournalSheet.#onComplete,
      qjReopen: SBEQuestJournalSheet.#onReopen,
      qjAutoObj: SBEQuestJournalSheet.#onAutoObj,
      qjToggleHidden: SBEQuestJournalSheet.#onToggleHidden,
      qjPin: SBEQuestJournalSheet.#onPin,
      qjFailObj: SBEQuestJournalSheet.#onFailObj
    }
  };

  static PARTS = {
    body: {
      template: `${SYSTEM_PATH}/templates/journal/quest-journal.hbs`,
      scrollable: [".sbe-qj-side", ".sbe-qj-main", ".sbe-qj-config"]
    }
  };

  _tab = "quests";
  /* Sous-onglet affiché (id) ; vide = toutes les quêtes. */
  _qtab = "";
  _sel = null;

  get title() { return this.document.name; }

  /** Menu ⋮ de la fenêtre (MJ) : « Renommer le journal ». */
  _getHeaderControls() {
    const controls = super._getHeaderControls();
    if (game.user.isGM) controls.unshift({ icon: "fa-solid fa-pen", label: "SBE.Quest.RenameJournal", action: "qjRename" });
    return controls;
  }

  static async #onRename() {
    if (!game.user.isGM) return;
    const name = await DialogV2.prompt({
      window: { title: L("SBE.Quest.RenameJournal") },
      content: `<div class="form-group"><label>${esc(L("SBE.Quest.SubTabName"))}</label><input type="text" name="name" value="${esc(this.document.name)}" autofocus></div>`,
      ok: { label: L("SBE.Quest.SubTabSave"), icon: "fa-solid fa-check", callback: (_ev, btn) => btn.form.elements.name.value.trim() },
      rejectClose: false
    });
    if (!name || name === this.document.name) return;
    await this.document.update({ name });
    this.render({ window: { title: this.title } });
  }

  /* ---------------------------------------------------------- */

  get quests() {
    return this.document.pages.filter(p => p.type === "quete" && p.testUserPermission(game.user, "OBSERVER"))
      .sort((a, b) => (a.sort - b.sort) || a.name.localeCompare(b.name));
  }

  /** Le sous-onglet affiché, s'il existe encore et que ce joueur le voit. */
  #currentTab(cfg = QuestManager.configOf(this.document)) {
    const t = cfg.tabs.find(x => x.id === this._qtab);
    return t && (game.user.isGM || !t.hidden) ? t : null;
  }

  /** Les quêtes du sous-onglet affiché (toutes sans sous-onglet). */
  get shownQuests() {
    const t = this.#currentTab();
    return t ? this.quests.filter(q => q.system.tabId === t.id) : this.quests;
  }

  get selected() {
    const q = this.shownQuests;
    return q.find(p => p.id === this._sel) ?? q[0] ?? null;
  }

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    const isGM = game.user.isGM;
    const cfg = QuestManager.configOf(this.document);
    const all = this.quests;
    const curTab = this.#currentTab(cfg);
    if (!curTab) this._qtab = "";
    const quests = this.shownQuests;
    const sel = this.selected;
    /* Sous-onglets : un joueur ne voit que ceux qui ne sont pas masqués et
       qui ont au moins une quête pour lui. */
    const subTabs = cfg.tabs.filter(t => isGM || (!t.hidden && all.some(q => q.system.tabId === t.id)))
      .map(t => ({ ...t, iconHtml: tabIcon(t.icon), active: t.id === this._qtab, count: all.filter(q => q.system.tabId === t.id).length }));
    this._sel = sel?.id ?? null;

    const chip = (q) => {
      const st = QuestManager.statusOf(cfg, q.system.status);
      return { id: q.id, name: q.name, img: q.system.img || "icons/svg/book.svg", active: q.id === sel?.id, hidden: q.system.hidden,
        stColor: st?.color, stIcon: st?.icon, stLabel: st?.label };
    };
    const sections = cfg.sections.map((s, i) => ({
      ...s, idx: i,
      linked: !!s.groupUuid,
      groupName: s.groupUuid ? (fromUuidSync(s.groupUuid)?.name ?? L("SBE.Group.Missing")) : "",
      actors: QuestManager.sectionActors(s).map(a => ({ name: a.name, img: a.img, uuid: a.uuid })),
      quests: quests.filter(q => q.system.sectionId === s.id).map(chip)
    })).filter(s => isGM || s.quests.length);
    const orphans = quests.filter(q => !cfg.sections.some(s => s.id === q.system.sectionId)).map(chip);

    Object.assign(ctx, {
      isGM, cfg, tab: isGM ? this._tab : "quests",
      sections, orphans,
      subTabs, showSubTabs: isGM || subTabs.length > 0, allActive: !this._qtab, allCount: all.length,
      quest: sel ? await this.#questContext(sel, cfg, isGM) : null,
      statusKinds: STATUS_KINDS.map(k => ({ id: k, label: L(`SBE.Quest.Kind.${k}`) })),
      statOps: STAT_OPS.map(k => ({ id: k, label: L(`SBE.Quest.Op.${k}`) })),
      mediaRows: ["given", "success", "fail", "cancel"].map(k => ({ id: k, label: L(`SBE.Quest.Media.${k}`), ...cfg.media[k] })),
      audioFormats: audioFormatsHint(),
      keys: isGM ? await QuestManager.templateKeys() : []
    });
    return ctx;
  }

  async #questContext(q, cfg, isGM) {
    const s = q.system;
    const st = QuestManager.statusOf(cfg, s.status);
    const cat = QuestManager.categoryOf(cfg, s.category);
    const statLabel = (key, list) => list.find(x => x.key === key)?.label || key;
    const statIcon = (key, list) => list.find(x => x.key === key)?.icon || "fa-solid fa-circle";
    const objs = s.objectives.map((o, i) => {
      const tg = o.auto?.target ? fromUuidSync(o.auto.target) : null;
      return { ...o, idx: i, isDone: SBEQueteData.objectiveDone(o), isFailed: !!o.failed, isCount: o.kind === "count", isSub: !!o.parent,
        autoOn: !!o.auto?.on, autoTarget: o.auto?.who === "target", tgName: tg?.name ?? "", tgImg: tg?.img ?? "", tgUuid: tg?.uuid ?? "" };
    })
      .filter(o => isGM || !o.hidden);
    /* Ordre : chaque objectif, puis ses sous-tâches. */
    const ordered = [];
    for (const o of objs.filter(x => !x.isSub)) {
      ordered.push(o);
      for (const c of objs.filter(x => x.parent === o.id)) ordered.push(c);
    }
    for (const o of objs) if (o.isSub && !ordered.includes(o)) ordered.push(o);
    const bundle = (b, list) => ({
      values: b.values.map((v, i) => ({ ...v, idx: i, label: statLabel(v.key, list), icon: statIcon(v.key, list), each: v.mode === "each" })),
      items: b.items.map((it, i) => {
        const doc = fromUuidSync(it.uuid);
        return { ...it, idx: i, each: it.mode !== "total", name: doc?.name ?? L("SBE.Quest.ItemGone"), img: doc?.img || "icons/svg/item-bag.svg", missing: !doc };
      })
    });
    const giverDoc = s.giver.mode === "actor" && s.giver.uuid ? fromUuidSync(s.giver.uuid) : null;
    /* Identity.of rend { name, img } : le nom et l'image vus par ce joueur (PNJ masqué). */
    const giverId = giverDoc ? (Identity.of(giverDoc) ?? { name: giverDoc.name, img: giverDoc.img }) : null;
    const placeDoc = s.place.uuid ? fromUuidSync(s.place.uuid) : null;
    const rewards = bundle(s.rewards, cfg.stats);
    const penalties = bundle(s.penalties, cfg.penalties.stats);
    return {
      id: q.id, name: q.name, img: s.img || "icons/svg/book.svg", system: s,
      descriptionHTML: await foundry.applications.ux.TextEditor.implementation.enrichHTML(s.description ?? "", { relativeTo: q, secrets: isGM }),
      status: st, category: cat, isOpen: (st?.kind ?? "active") === "active",
      /* Épingle du suivi : le joueur (mode « chaque joueur ») ou le MJ (mode « le MJ choisit »). */
      canPin: (st?.kind ?? "active") === "active" && (cfg.widget?.mode === "gm" ? isGM : !isGM),
      pinned: SBEQuestTracker.isPinned(q),
      giverName: s.giver.mode === "actor" ? (giverId ? giverId.name : L("SBE.Group.Missing"))
        : (s.giver.mode === "name" ? s.giver.name : L("SBE.Quest.Anonymous")),
      giverImg: giverId?.img || giverDoc?.img, giverUuid: giverDoc?.uuid,
      giverActor: s.giver.mode === "actor", giverNamed: s.giver.mode === "name",
      placeName: placeDoc?.name ?? s.place.text, placeUuid: placeDoc?.uuid,
      objectives: ordered,
      rewards, penalties,
      hasRewards: rewards.values.length || rewards.items.length,
      showPenalties: cfg.penalties.enabled,
      hasPenalties: penalties.values.length || penalties.items.length,
      deadline: s.deadline.on ? this.#formatTime(s.deadline.worldTime) : "",
      deadlineInput: this.#toInput(s.deadline.worldTime)
    };
  }

  #formatTime(t) {
    try {
      const c = game.time.calendar.timeToComponents(t);
      return game.time.calendar.format?.(c) ?? `${c.year}-${c.month + 1}-${c.dayOfMonth + 1} ${c.hour}:${String(c.minute).padStart(2, "0")}`;
    } catch (_e) { return String(t); }
  }

  /* Échéance saisie en jours / heures depuis l'origine du calendrier. */
  #toInput(t) {
    const day = 86400;
    const d = Math.floor((t || 0) / day);
    const h = Math.round(((t || 0) % day) / 3600 * 100) / 100;
    return { d, h };
  }

  /* ---------------------------------------------------------- */
  /*  Écriture                                                   */
  /* ---------------------------------------------------------- */

  async #updateQuest(mutator) {
    const q = this.selected;
    if (!q || !game.user.isGM) return;
    const sys = q.system.toObject();
    mutator(sys);
    await q.update({ system: sys });
  }

  async #updateConfig(mutator) {
    if (!game.user.isGM) return;
    const cfg = QuestManager.configOf(this.document);
    mutator(cfg);
    await QuestManager.saveConfig(this.document, cfg);
  }

  #readValue(el) {
    if (el.type === "checkbox") return el.checked;
    if (el.type === "number" || el.dataset.type === "number") return Number(el.value) || 0;
    return el.value;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const root = this.element;
    if (!game.user.isGM) return;

    root.querySelectorAll("[data-qf]").forEach(el => el.addEventListener("change", async () => {
      const path = el.dataset.qf;
      const v = this.#readValue(el);
      if (path === "name") return this.selected?.update({ name: v || this.selected.name });
      if (path === "deadline.day" || path === "deadline.hour") {
        const box = el.closest(".sbe-qj-deadline");
        const d = Number(box.querySelector('[data-qf="deadline.day"]').value) || 0;
        const h = Number(box.querySelector('[data-qf="deadline.hour"]').value) || 0;
        return this.#updateQuest(s => { s.deadline.worldTime = Math.round(d * 86400 + h * 3600); });
      }
      await this.#updateQuest(s => foundry.utils.setProperty(s, path, v));
      /* Changer de section change qui voit la quête. */
      if (path === "sectionId") await QuestManager.syncOwnership(this.document);
    }));

    root.querySelectorAll("[data-cf]").forEach(el => el.addEventListener("change", () =>
      this.#updateConfig(c => foundry.utils.setProperty(c, el.dataset.cf, this.#readValue(el)))));

    /* Glisser-déposer : sections, membres, donneur, lieu, objets. */
    root.querySelectorAll("[data-drop]").forEach(zone => {
      zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("is-over"); });
      zone.addEventListener("dragleave", () => zone.classList.remove("is-over"));
      zone.addEventListener("drop", (e) => { zone.classList.remove("is-over"); this.#onDropZone(e, zone); });
    });
  }

  async #onDropZone(event, zone) {
    event.preventDefault();
    event.stopPropagation();
    let data;
    try { data = JSON.parse(event.dataTransfer.getData("text/plain")); } catch (_e) { return; }
    const doc = data?.uuid ? await fromUuid(data.uuid).catch(() => null) : null;
    if (!doc) return;
    const kind = zone.dataset.drop;

    if (kind === "section-new" || kind === "section") {
      if (doc.documentName !== "Actor" || !["groupe", "personnage"].includes(doc.type)) {
        return ui.notifications.warn(L("SBE.Quest.DropActorHint"));
      }
      const idx = Number(zone.dataset.idx);
      return this.#updateConfig(c => {
        const sec = kind === "section" ? c.sections[idx] : null;
        if (doc.type === "groupe") {
          if (sec) { sec.groupUuid = doc.uuid; sec.members = []; }
          else c.sections.push({ id: foundry.utils.randomID(), name: doc.name, groupUuid: doc.uuid, members: [] });
          return;
        }
        if (sec) {
          if (sec.groupUuid) return ui.notifications.warn(L("SBE.Quest.SectionIsGroup"));
          sec.members = [...new Set([...(sec.members ?? []), doc.uuid])];
        } else c.sections.push({ id: foundry.utils.randomID(), name: doc.name, groupUuid: "", members: [doc.uuid] });
      });
    }
    if (kind === "objtarget") {
      if (doc.documentName !== "Actor") return ui.notifications.warn(L("SBE.Quest.DropActorOnly"));
      const i = Number(zone.dataset.idx);
      return this.#updateQuest(s => { s.objectives[i].auto.target = doc.uuid; });
    }
    if (kind === "giver") {
      if (doc.documentName !== "Actor") return;
      return this.#updateQuest(s => { s.giver.mode = "actor"; s.giver.uuid = doc.uuid; });
    }
    if (kind === "place") {
      if (!["Scene", "JournalEntry", "JournalEntryPage"].includes(doc.documentName)) return;
      return this.#updateQuest(s => { s.place.uuid = doc.uuid; });
    }
    if (kind === "items") {
      if (doc.documentName !== "Item" || doc.parent) return ui.notifications.warn(L("SBE.Quest.DropItemHint"));
      const list = zone.dataset.list;
      return this.#updateQuest(s => {
        const arr = s[list].items;
        const found = arr.find(x => x.uuid === doc.uuid);
        if (found) found.qty += 1; else arr.push({ uuid: doc.uuid, qty: 1, mode: "each" });
      });
    }
  }

  /* ---------------------------------------------------------- */
  /*  Actions                                                    */
  /* ---------------------------------------------------------- */

  static #onTab(_e, t) { this._tab = t.dataset.tab; this.render(); }
  static #onSubTab(_e, t) { this._qtab = t.dataset.id ?? ""; this._sel = null; this.render(); }

  /** Fenêtre nom / icône / masqué d'un sous-onglet. */
  async #subTabDialog(tab = null) {
    const icon = tab?.icon || "fa-solid fa-folder";
    const content = `<div class="sbe-qj-stab-form">
      <div class="form-group"><label>${esc(L("SBE.Quest.SubTabName"))}</label><input type="text" name="name" value="${esc(tab?.name ?? "")}" autofocus></div>
      <div class="form-group"><label>${esc(L("SBE.Quest.SubTabIcon"))}</label>
        <div class="form-fields"><input type="text" name="icon" value="${esc(icon)}"><button type="button" class="sbe-qj-stab-pick" data-tooltip-text="${esc(L("SBE.Quest.SubTabPick"))}"><i class="fa-solid fa-icons"></i></button></div></div>
      <div class="form-group"><label><input type="checkbox" name="hidden" ${tab?.hidden ? "checked" : ""}> ${esc(L("SBE.Quest.SubTabHidden"))}</label></div>
    </div>`;
    return DialogV2.wait({
      window: { title: L(tab ? "SBE.Quest.SubTabEdit" : "SBE.Quest.SubTabAdd") },
      content, rejectClose: false,
      render: (_ev, dlg) => {
        const root = dlg.element ?? dlg;
        root.querySelector(".sbe-qj-stab-pick")?.addEventListener("click", async () => {
          const ic = await pickIcon();
          if (ic) root.querySelector('input[name="icon"]').value = ic;
        });
      },
      buttons: [
        { action: "ok", label: L("SBE.Quest.SubTabSave"), icon: "fa-solid fa-check", default: true,
          callback: (_ev, btn) => {
            const f = btn.form;
            return { name: f.elements.name.value.trim(), icon: f.elements.icon.value.trim(), hidden: f.elements.hidden.checked };
          } },
        { action: "cancel", label: L("Cancel"), icon: "fa-solid fa-xmark" }
      ]
    });
  }

  static async #onAddSubTab() {
    const r = await this.#subTabDialog();
    if (!r || r === "cancel" || !r.name) return;
    const id = foundry.utils.randomID();
    await this.#updateConfig(c => { c.tabs.push({ id, name: r.name, icon: r.icon, hidden: r.hidden }); });
    this._qtab = id;
    this._sel = null;
    this.render();
  }

  static async #onEditSubTab(ev, t) {
    ev?.stopPropagation?.();
    const cfg = QuestManager.configOf(this.document);
    const tab = cfg.tabs.find(x => x.id === t.dataset.id);
    if (!tab) return;
    const r = await this.#subTabDialog(tab);
    if (!r || r === "cancel" || !r.name) return;
    await this.#updateConfig(c => {
      const x = c.tabs.find(y => y.id === tab.id);
      if (x) Object.assign(x, { name: r.name, icon: r.icon, hidden: r.hidden });
    });
  }

  static async #onDelSubTab(ev, t) {
    ev?.stopPropagation?.();
    const cfg = QuestManager.configOf(this.document);
    const tab = cfg.tabs.find(x => x.id === t.dataset.id);
    if (!tab) return;
    const inside = this.document.pages.filter(p => p.type === "quete" && p.system.tabId === tab.id);
    const ok = await DialogV2.confirm({
      window: { title: L("SBE.Quest.SubTabDelete") },
      content: `<p>${L("SBE.Quest.SubTabDeleteAsk", { name: esc(tab.name) })}</p>`
        + (inside.length ? `<p class="notes">${esc(L("SBE.Quest.SubTabDeleteQuests", { n: inside.length }))}</p>` : ""),
      rejectClose: false
    });
    if (!ok) return;
    if (inside.length) await this.document.updateEmbeddedDocuments("JournalEntryPage", inside.map(p => ({ _id: p.id, "system.tabId": "" })));
    await this.#updateConfig(c => { c.tabs = c.tabs.filter(x => x.id !== tab.id); });
    if (this._qtab === tab.id) this._qtab = "";
    this.render();
  }
  static #onSelect(_e, t) { this._sel = t.dataset.id; this._tab = "quests"; this.render(); }

  static async #onAddQuest(_e, t) {
    const cfg = QuestManager.configOf(this.document);
    const [page] = await this.document.createEmbeddedDocuments("JournalEntryPage", [{
      name: L("SBE.Quest.NewQuest"), type: "quete",
      /* Une nouvelle quête est cachée : le MJ la révèle quand il veut. */
      system: { sectionId: t.dataset.section ?? "", tabId: this.#currentTab(cfg)?.id ?? "", category: cfg.categories[0]?.id ?? "", status: "active", hidden: true }
    }]);
    await QuestManager.syncOwnership(this.document);
    this._sel = page?.id ?? this._sel;
    this.render();
  }

  static async #onDelQuest() {
    const q = this.selected;
    if (!q) return;
    const ok = await DialogV2.confirm({
      window: { title: L("SBE.Quest.DeleteTitle") },
      content: `<p>${L("SBE.Quest.DeleteConfirm", { name: esc(q.name) })}</p>`, rejectClose: false
    }).catch(() => false);
    if (!ok) return;
    await q.delete();
    this._sel = null;
    this.render();
  }

  static #onQuestImg() {
    const q = this.selected;
    if (!q) return;
    const FP = foundry.applications.apps.FilePicker.implementation;
    new FP({ type: "image", current: q.system.img, callback: (path) => q.update({ "system.img": path }) }).render(true);
  }

  static async #onAddObj(_e, t) {
    const parent = t.dataset.parent ?? "";
    await this.#updateQuest(s => {
      const o = { id: foundry.utils.randomID(), parent, label: "", kind: "check", done: false, count: 0, target: 1, optional: false, hidden: false };
      if (!parent) { s.objectives.push(o); return; }
      /* Après la dernière sous-tâche du parent. */
      let at = s.objectives.findIndex(x => x.id === parent);
      while (at + 1 < s.objectives.length && s.objectives[at + 1].parent === parent) at++;
      s.objectives.splice(at + 1, 0, o);
    });
  }

  static async #onDelObj(_e, t) {
    const i = Number(t.dataset.idx);
    await this.#updateQuest(s => {
      const id = s.objectives[i]?.id;
      s.objectives = s.objectives.filter((o, j) => j !== i && o.parent !== id);
    });
  }

  static async #onToggleObj(_e, t) {
    const i = Number(t.dataset.idx);
    await this.#updateQuest(s => { const o = s.objectives[i]; o.done = !o.done; if (o.done) o.failed = false; });
    await this.#autoComplete();
  }

  static async #onFailObj(_e, t) {
    const i = Number(t.dataset.idx);
    await this.#updateQuest(s => { const o = s.objectives[i]; o.failed = !o.failed; if (o.failed) o.done = false; });
  }

  /* Option : tous les objectifs obligatoires faits → quête réussie. */
  async #autoComplete() {
    const q = this.selected;
    const cfg = QuestManager.configOf(this.document);
    if (!q || !cfg.autoComplete) return;
    if ((QuestManager.statusOf(cfg, q.system.status)?.kind ?? "active") !== "active") return;
    if (QuestManager.requiredDone(q)) await QuestManager.complete(q, "success");
  }

  static async #onPin() {
    const q = this.selected;
    if (!q) return;
    await SBEQuestTracker.togglePin(q);
    this.render();
  }

  static async #onToggleHidden() {
    const q = this.selected;
    if (q) await q.update({ "system.hidden": !q.system.hidden });
  }

  static async #onAutoObj(_e, t) {
    const i = Number(t.dataset.idx);
    await this.#updateQuest(s => { s.objectives[i].auto.on = !s.objectives[i].auto.on; });
  }

  static async #onAnnounce() {
    const q = this.selected;
    if (q) await QuestManager.announce(q);
  }

  static async #onComplete(_e, t) {
    const q = this.selected;
    if (!q) return;
    const kind = t.dataset.kind;
    const ok = await DialogV2.confirm({
      window: { title: L(`SBE.Quest.Kind.${kind}`) },
      content: `<p>${L(`SBE.Quest.Confirm.${kind}`, { name: esc(q.name) })}</p>`, rejectClose: false
    }).catch(() => false);
    if (ok) await QuestManager.complete(q, kind);
  }

  static async #onReopen() {
    await this.selected?.update({ "system.status": "active" });
  }

  static async #onStepObj(_e, t) {
    const i = Number(t.dataset.idx);
    const d = Number(t.dataset.step) || 0;
    await this.#updateQuest(s => {
      const o = s.objectives[i];
      o.count = Math.max(0, Math.min(o.target, (o.count ?? 0) + d));
    });
    await this.#autoComplete();
  }

  static async #onRevealObj(_e, t) {
    const i = Number(t.dataset.idx);
    await this.#updateQuest(s => { s.objectives[i].hidden = !s.objectives[i].hidden; });
  }

  static async #onAddValue(_e, t) {
    const list = t.dataset.list;
    const cfg = QuestManager.configOf(this.document);
    const stats = list === "penalties" ? cfg.penalties.stats : cfg.stats;
    if (!stats.length) return ui.notifications.warn(L("SBE.Quest.NoStats"));
    await this.#updateQuest(s => { s[list].values.push({ key: stats[0].key, amount: 0, mode: "each" }); });
  }

  static async #onDelValue(_e, t) {
    await this.#updateQuest(s => { s[t.dataset.list].values.splice(Number(t.dataset.idx), 1); });
  }

  static async #onDelItem(_e, t) {
    await this.#updateQuest(s => { s[t.dataset.list].items.splice(Number(t.dataset.idx), 1); });
  }

  static async #onOpen(_e, t) {
    const d = await fromUuid(t.dataset.uuid).catch(() => null);
    if (d?.documentName === "Scene") return d.view();
    d?.sheet?.render(true);
  }

  static async #onClearRef(_e, t) {
    const what = t.dataset.ref;
    await this.#updateQuest(s => {
      if (what === "giver") { s.giver.uuid = ""; s.giver.mode = "anon"; }
      if (what === "place") s.place.uuid = "";
    });
  }

  static async #onCfgAdd(_e, t) {
    const list = t.dataset.list;
    await this.#updateConfig(c => { foundry.utils.getProperty(c, list).push(CFG_LISTS[list]()); });
  }

  static async #onCfgDel(_e, t) {
    const list = t.dataset.list;
    const i = Number(t.dataset.idx);
    await this.#updateConfig(c => {
      const arr = foundry.utils.getProperty(c, list);
      /* Les quatre statuts de base ne se suppriment pas. */
      if (list === "statuses" && STATUS_KINDS.includes(arr[i]?.id)) return;
      arr.splice(i, 1);
    });
  }

  static async #onDelSection(_e, t) {
    const i = Number(t.dataset.idx);
    const cfg = QuestManager.configOf(this.document);
    const sec = cfg.sections[i];
    if (!sec) return;
    const n = this.document.pages.filter(p => p.type === "quete" && p.system.sectionId === sec.id).length;
    const ok = await DialogV2.confirm({
      window: { title: L("SBE.Quest.DelSectionTitle") },
      content: `<p>${L("SBE.Quest.DelSectionConfirm", { name: esc(sec.name), n })}</p>`, rejectClose: false
    }).catch(() => false);
    if (!ok) return;
    await this.#updateConfig(c => { c.sections.splice(i, 1); });
  }

  static async #onDelMember(_e, t) {
    const i = Number(t.dataset.idx);
    const uuid = t.dataset.uuid;
    await this.#updateConfig(c => {
      const s = c.sections[i];
      if (s.groupUuid) { s.groupUuid = ""; s.members = []; return; }
      s.members = (s.members ?? []).filter(u => u !== uuid);
    });
  }

  static #onPickSound(_e, t) {
    const k = t.dataset.media;
    const cfg = QuestManager.configOf(this.document);
    const FP = foundry.applications.apps.FilePicker.implementation;
    new FP({ type: "audio", current: cfg.media[k]?.sound ?? "",
      callback: (path) => this.#updateConfig(c => { c.media[k].sound = path; }) }).render(true);
  }

  static async #onTestSound(_e, t) {
    const m = QuestManager.configOf(this.document).media[t.dataset.media] ?? {};
    await testSound(m.sound, (Number(m.volume) || 0) / 100);
  }
}

/**
 * Page « Quête » ouverte seule (lien, recherche) : on ouvre son journal
 * de quêtes sur elle. Dans un journal affiché avec une autre fiche, la
 * page s'affiche normalement (un court message) : rouvrir le journal
 * depuis sa propre page tournerait en boucle.
 */
export class SBEQuetePageSheet extends foundry.applications.sheets.journal.JournalEntryPageSheet {
  async render(options = {}, _opts) {
    const sheet = this.document.parent?.sheet;
    if (sheet instanceof SBEQuestJournalSheet) {
      sheet._sel = this.document.id;
      sheet._tab = "quests";
      await sheet.render(true);
      return this;
    }
    return super.render(options, _opts);
  }

  async _renderHTML() {
    const div = document.createElement("div");
    div.className = "sbe-quete-page-plain";
    div.innerHTML = `<h3>${esc(this.document.name)}</h3><p>${esc(L("SBE.Quest.PlainSheet", { sheet: L("SBE.Quest.SheetName") }))}</p>`;
    return div;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }
}
