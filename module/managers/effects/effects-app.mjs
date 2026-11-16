/**
 * SBE — Fenêtre MJ « Effets »
 *
 * Liste des définitions à gauche, éditeur à droite. On travaille sur
 * une COPIE : rien n'est écrit avant « Enregistrer ». Import / export
 * JSON pour passer ses effets d'un monde à l'autre.
 *
 * Supprimer une définition encore posée sur des personnages ne bloque
 * jamais : le MJ voit combien sont concernés, et s'il confirme, les
 * effets posés partent avec (standard SBE des suppressions).
 */

import { SYSTEM_PATH } from "../../helpers/constants.mjs";
import { validateFormula, HAS_DICE } from "../../builder/formula-engine.mjs";
import { EffectManager, cleanDef } from "./effect-manager.mjs";
import { paint, tintAttrs, tintStyle } from "./icon-paint.mjs";
import { wireKeyLists } from "../../helpers/key-list.mjs";
import { EDITOR_TPL, editorContext, readEditor, readOpenSections, wireGiveDrop } from "./effect-editor.mjs";
import { newGive } from "./effect-gives.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/* Nom / icône d'une condition native (affichage). */
function nativeName(id) {
  const n = (EffectManager._nativeCache ?? []).find(x => x.id === id);
  return n ? game.i18n.localize(n.name ?? id) : "";
}
function nativeImg(id) {
  return (EffectManager._nativeCache ?? []).find(x => x.id === id)?.img ?? "";
}

/** Une définition native qui ne change RIEN à l'original (juste
    ouverte pour voir, et masquée ou non comme le veut « Tout masquer ») :
    inutile de l'enregistrer. */
function isPlainNative(d) {
  if (!d?.native) return false;
  const c = cleanDef(d);
  if (c.label === nativeName(c.key)) c.label = "";
  if (c.icon === nativeImg(c.key)) c.icon = "";
  return JSON.stringify(c) === JSON.stringify(cleanDef({ key: c.key, native: true, hidden: EffectManager.hideAllNatives() }));
}

export class SBEEffectsApp extends HandlebarsApplicationMixin(ApplicationV2) {

  static _instance = null;

  static DEFAULT_OPTIONS = {
    id: "sbe-effects",
    tag: "div",
    classes: ["sbe-effects", "sbe-condense"],
    window: { title: "SBE.Effects.Title", icon: "fa-solid fa-bolt", resizable: true },
    position: { width: 860, height: 660 },
    actions: {
      select: SBEEffectsApp.#onSelect,
      newDef: SBEEffectsApp.#onNew,
      dupDef: SBEEffectsApp.#onDuplicate,
      delDef: SBEEffectsApp.#onDelete,
      addChange: SBEEffectsApp.#onAddChange,
      addCond: SBEEffectsApp.#onAddCond,
      customizeNative: SBEEffectsApp.#onCustomizeNative,
      toggleNative: SBEEffectsApp.#onToggleNative,
      resetNative: SBEEffectsApp.#onResetNative,
      toggleAllNatives: SBEEffectsApp.#onToggleAllNatives,
      pickSound: SBEEffectsApp.#onPickSound,
      pickAnim: SBEEffectsApp.#onPickAnim,
      delRow: SBEEffectsApp.#onDelRow,
      addTier: SBEEffectsApp.#onAddTier,
      addPhase: SBEEffectsApp.#onAddPhase,
      delPhase: SBEEffectsApp.#onDelPhase,
      addPhaseChange: SBEEffectsApp.#onAddPhaseChange,
      delTier: SBEEffectsApp.#onDelTier,
      addTierChange: SBEEffectsApp.#onAddTierChange,
      delChange: SBEEffectsApp.#onDelChange,
      delGive: SBEEffectsApp.#onDelGive,
      pickIcon: SBEEffectsApp.#onPickIcon,
      save: SBEEffectsApp.#onSave,
      exportDefs: SBEEffectsApp.#onExport,
      importDefs: SBEEffectsApp.#onImport
    }
  };

  static PARTS = {
    body: { template: `${SYSTEM_PATH}/templates/managers/effects.hbs`, templates: [EDITOR_TPL], scrollable: [".sbe-fx-list", ".sbe-fx-natives", ".sbe-fx-edit"] }
  };

  static open() {
    if (!game.user.isGM) return null;
    if (this._instance?.rendered) { this._instance.bringToFront?.(); return this._instance; }
    this._instance = new SBEEffectsApp();
    this._instance.render({ force: true });
    return this._instance;
  }

  get defs() {
    this._defs ??= foundry.utils.deepClone(EffectManager.getDefs());
    return this._defs;
  }

  async _prepareContext() {
    const defs = this.defs;
    if (this._sel === undefined || this._sel >= defs.length) this._sel = defs.length ? 0 : -1;
    const d = defs[this._sel] ?? null;
    const L = (k) => game.i18n.localize(k);
    const hideAll = EffectManager.hideAllNatives();
    this._open ??= {};
    return {
      ...editorContext(d, { open: this._open }),
      /* Mes effets d'un côté, les conditions de Foundry de l'autre —
         toujours toutes listées, modifiables en un clic. */
      list: defs.map((x, i) => ({ i, label: x.label || x.key || L("SBE.Effects.Unnamed"), key: x.key,
        icon: paint(x, x.icon || "icons/svg/aura.svg"),
        /* Copie colorée pas encore prête : aperçu par CSS. */
        tint: paint(x, x.icon || "icons/svg/aura.svg") === (x.icon || "icons/svg/aura.svg") ? tintAttrs(x.icon || "icons/svg/aura.svg", x.iconColor) : "",
        active: i === this._sel })).filter(x => !defs[x.i].native),
      natives: (EffectManager._nativeCache ?? []).map(n => {
        const i = defs.findIndex(x => x.native && x.key === n.id);
        const o = i >= 0 ? defs[i] : null;
        return { id: n.id, name: o?.label || game.i18n.localize(n.name ?? n.id), img: paint(o, o?.icon || n.img),
          tint: paint(o, o?.icon || n.img) === (o?.icon || n.img) ? tintAttrs(o?.icon || n.img, o?.iconColor) : "",
          custom: !!o && !isPlainNative(o), hidden: o ? !!o.hidden : hideAll, active: i >= 0 && i === this._sel };
      }),
      hideAllNatives: hideAll,
      sel: this._sel
    };
  }

  /** Relit l'éditeur dans la copie de travail. */
  #readForm() {
    const root = this.element;
    const d = this.defs[this._sel];
    if (!root || !d) return;
    this._defs[this._sel] = readEditor(root, d);
    /* Sections ouvertes : conservées d'un rendu à l'autre. */
    readOpenSections(root, this._open);
  }

  static #onSelect(_ev, target) {
    this.#readForm();
    this._sel = Number(target.dataset.index);
    this.render();
  }

  static #onNew() {
    this.#readForm();
    this.defs.push(cleanDef({ key: "", label: "" }));
    this._sel = this.defs.length - 1;
    this.render();
  }

  static #onDuplicate() {
    this.#readForm();
    const d = this.defs[this._sel];
    if (!d) return;
    const copy = foundry.utils.deepClone(d);
    copy.key = `${d.key}_copie`;
    copy.native = false;
    copy.hidden = false;
    copy.label = `${d.label} (${game.i18n.localize("SBE.Effects.Copy")})`;
    this.defs.splice(this._sel + 1, 0, copy);
    this._sel += 1;
    this.render();
  }

  /** Supprimer : on prévient avec les chiffres, on ne bloque jamais. */
  static async #onDelete() {
    this.#readForm();
    const d = this.defs[this._sel];
    if (!d) return;
    const saved = EffectManager.getDefs().some(x => x.key === d.key);
    const hits = saved && d.key ? EffectManager.instancesOf(d.key) : [];
    const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
    const who = [...new Set(hits.map(h => h.actor.name))].slice(0, 8).map(esc).join(", ");
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("SBE.Effects.DeleteTitle") },
      content: `<p>${game.i18n.format("SBE.Effects.DeleteConfirm", { name: esc(d.label || d.key) })}</p>
        ${hits.length ? `<p class="notes">${game.i18n.format("SBE.Effects.DeleteActive", { n: hits.length })} ${who}</p>` : ""}`,
      rejectClose: false
    }).catch(() => false);
    if (!ok) return;
    this.defs.splice(this._sel, 1);
    this._sel = Math.min(this._sel, this.defs.length - 1);
    /* La définition disparaît du monde tout de suite (et ses effets
       posés avec elle) : une suppression ne reste pas en attente. */
    await EffectManager.setDefs(EffectManager.getDefs().filter(x => x.key !== d.key));
    for (const h of hits) {
      try { await h.ae.delete(); } catch (err) { console.warn("SBE | Effet posé : suppression en échec", err); }
    }
    this.render();
  }

  static #onAddChange() {
    this.#readForm();
    this.defs[this._sel]?.changes.push({ key: "", mode: "add", value: "" });
    this.render();
  }

  /** Personnaliser une condition native : une définition à son id. */
  static #onCustomizeNative(_ev, target) {
    this.#readForm();
    const id = target.dataset.id;
    let i = this.defs.findIndex(d => d.native && d.key === id);
    if (i < 0) {
      /* Masquée ou non comme les autres : l'ouvrir ne la fait pas apparaître. */
      this.defs.push(cleanDef({ key: id, native: true, label: nativeName(id), icon: nativeImg(id), hidden: EffectManager.hideAllNatives() }));
      i = this.defs.length - 1;
    }
    this._sel = i;
    this.render();
  }

  /** Masquer / réafficher une condition native dans le HUD. */
  static async #onToggleNative(_ev, target) {
    this.#readForm();
    const id = target.dataset.id;
    let d = this.defs.find(x => x.native && x.key === id);
    /* Sans réglage propre, elle suit « Tout masquer » : l'œil part de là. */
    if (d) d.hidden = !d.hidden;
    else { d = cleanDef({ key: id, native: true, hidden: !EffectManager.hideAllNatives() }); this.defs.push(d); }
    /* L'œil agit TOUT DE SUITE sur le HUD : seule cette condition est
       écrite, le reste de l'édition attend « Enregistrer ». */
    const saved = EffectManager.getDefs().filter(x => !(x.native && x.key === id));
    if (!isPlainNative(d)) saved.push(cleanDef(d));
    await EffectManager.setDefs(saved);
    this.render();
  }

  /** Rendre à une condition native son état d'origine. */
  static async #onResetNative(_ev, target) {
    this.#readForm();
    const id = target.dataset.id;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("SBE.Effects.NativeResetTitle") },
      content: `<p>${game.i18n.format("SBE.Effects.NativeResetConfirm", { name: foundry.utils.escapeHTML(nativeName(id) || id) })}</p>`,
      rejectClose: false
    }).catch(() => false);
    if (!ok) return;
    const i = this.defs.findIndex(d => d.native && d.key === id);
    if (i >= 0) this.defs.splice(i, 1);
    if (this._sel >= this.defs.length || i === this._sel) this._sel = this.defs.length ? 0 : -1;
    else if (i >= 0 && i < this._sel) this._sel -= 1;
    await EffectManager.setDefs(EffectManager.getDefs().filter(d => !(d.native && d.key === id)));
    this.render();
  }

  /** Masquer d'un coup toutes les conditions natives non personnalisées. */
  static async #onToggleAllNatives(_ev, target) {
    this.#readForm();
    await EffectManager.setHideAllNatives(!!target.checked);
    this.render();
  }

  static async #onPickSound() {
    const input = this.element.querySelector(".sbe-fx-l-sound");
    const FP = foundry.applications.apps.FilePicker.implementation;
    new FP({ type: "audio", current: input?.value || "",
      callback: (path) => { if (input) { input.value = path; this.#readForm(); this.render(); } } }).render(true);
  }

  static async #onPickAnim() {
    const input = this.element.querySelector(".sbe-fx-l-anim");
    const FP = foundry.applications.apps.FilePicker.implementation;
    new FP({ type: "imagevideo", current: input?.value || "",
      callback: (path) => { if (input) { input.value = path; this.#readForm(); this.render(); } } }).render(true);
  }

  static #onAddCond() {
    this.#readForm();
    this.defs[this._sel]?.trigger.conditions.push("");
    this.render();
  }

  static #onDelRow(_ev, target) {
    target.closest(".sbe-fx-cond")?.remove();
    this.#readForm();
    this.render();
  }

  static #onAddPhase() {
    this.#readForm();
    this.defs[this._sel]?.phases.push({ label: "", icon: "", rounds: 0, seconds: 0, changes: [] });
    this.render();
  }

  static #onDelPhase(_ev, target) {
    target.closest(".sbe-fx-phase")?.remove();
    this.#readForm();
    this.render();
  }

  static #onAddPhaseChange(_ev, target) {
    this.#readForm();
    this.defs[this._sel]?.phases[Number(target.dataset.phase)]?.changes.push({ key: "", mode: "add", value: "" });
    this.render();
  }

  static #onAddTier() {
    this.#readForm();
    this.defs[this._sel]?.escalation.tiers.push({ label: "", icon: "", changes: [] });
    this.render();
  }

  static #onDelTier(_ev, target) {
    target.closest(".sbe-fx-tier")?.remove();
    this.#readForm();
    this.render();
  }

  static #onAddTierChange(_ev, target) {
    this.#readForm();
    this.defs[this._sel]?.escalation.tiers[Number(target.dataset.tier)]?.changes.push({ key: "", mode: "add", value: "" });
    this.render();
  }

  static #onDelChange(_ev, target) {
    target.closest(".sbe-fx-change")?.remove();
    this.#readForm();
    this.render();
  }

  static #onDelGive(_ev, target) {
    target.closest(".sbe-fx-give")?.remove();
    this.#readForm();
    this.render();
  }

  static async #onPickIcon() {
    const input = this.element.querySelector(".sbe-fx-icon");
    const FP = foundry.applications.apps.FilePicker.implementation;
    new FP({
      type: "image",
      current: input?.value || "",
      callback: (path) => { if (input) { input.value = path; this.#readForm(); this.render(); } }
    }).render(true);
  }

  /** Vérifie tout ; renvoie un message d'erreur ou "". */
  #validate() {
    const defs = this.defs.map(cleanDef);
    for (let i = 0; i < defs.length; i++) {
      const d = defs[i];
      /* PAS DE DOUBLON d'une condition de Foundry : sa clé, ou son nom,
         renvoie vers la condition elle-même — on la modifie, on ne la
         refait pas. */
      if (!d.native) {
        const norm = (x) => String(x ?? "").trim().toLowerCase();
        const nat = (EffectManager._nativeCache ?? []).find(n =>
          n.id === d.key || (d.label && (norm(nativeName(n.id)) === norm(d.label)
            || norm(this.defs.find(x => x.native && x.key === n.id)?.label) === norm(d.label))));
        if (nat) {
          this._sel = i;
          return game.i18n.format("SBE.Effects.DupNative", { name: d.label || d.key, native: nativeName(nat.id) || nat.id });
        }
        const twin = defs.findIndex((x, j) => j !== i && !x.native && d.label && norm(x.label) === norm(d.label));
        if (twin >= 0) { this._sel = i; return game.i18n.format("SBE.Effects.DupName", { name: d.label }); }
      }
      /* Objet donné : le MJ doit dire où il va. */
      const noWhere = (this.defs[i].gives ?? []).find(g => g.uuid && !String(g.where ?? "").trim());
      if (noWhere) { this._sel = i; return game.i18n.format("SBE.Effects.Gives.NeedWhere", { name: d.label || d.key }); }
      const err = EffectManager.keyError(d.key, defs, i, d.native);
      if (err) { this._sel = i; return `${d.label || d.key || "?"} : ${game.i18n.localize(err)}`; }
      const formulas = [
        ...d.changes.map(c => [c.key, c.value]),
        ...d.escalation.tiers.flatMap(t => t.changes.map(c => [c.key, c.value])),
        ...d.phases.flatMap(p => p.changes.map(c => [c.key, c.value])),
        ...d.trigger.conditions.map(f => [game.i18n.localize("SBE.Effects.Trigger.Title"), f]),
        [d.periodic.key, d.periodic.amount],
        ...d.escalation.tiers.map((t, n) => [`${game.i18n.localize("SBE.Effects.Esc.Tiers")} ${n + 1}`, t.amount]),
        [game.i18n.localize("SBE.Effects.Resist.Difficulty"), d.resist.difficulty],
        [game.i18n.localize("SBE.Effects.Rest.Title"), d.restHeal.difficulty]
      ];
      for (const [where, f] of formulas) {
        /* Les dés (« -1d6 ») sont vérifiés au lancer, pas ici. */
        if (!f || Number.isFinite(Number(f)) || HAS_DICE.test(String(f))) continue;
        const ferr = validateFormula(f);
        if (ferr) { this._sel = i; return `${d.label || d.key} › ${where} : ${ferr}`; }
      }
    }
    return "";
  }

  static async #onSave() {
    this.#readForm();
    const err = this.#validate();
    if (err) { ui.notifications.error(err); this.render(); return; }
    /* (Les icônes colorées et les effets déjà posés suivent d'eux-mêmes.) */
    await EffectManager.setDefs(this.defs.filter(d => !isPlainNative(d)));
    this._defs = foundry.utils.deepClone(EffectManager.getDefs());
    this._sel = Math.min(this._sel, this._defs.length - 1);
    ui.notifications.info(game.i18n.localize("SBE.Effects.Saved"));
    this.render();
  }

  static #onExport() {
    this.#readForm();
    const data = JSON.stringify({ sbe: "effects", format: 1, effects: this.defs.map(cleanDef) }, null, 2);
    foundry.utils.saveDataToFile(data, "application/json", "sbe-effets.json");
  }

  /** Import : AJOUTE à la suite ; une clé déjà prise est écartée. */
  static async #onImport() {
    this.#readForm();
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      let json = null;
      try { json = JSON.parse(await file.text()); } catch (_e) { /* illisible */ }
      const list = Array.isArray(json?.effects) ? json.effects : (Array.isArray(json) ? json : null);
      if (!list) { ui.notifications.error(game.i18n.localize("SBE.Effects.ImportBad")); return; }
      let added = 0, replaced = 0, skipped = 0;
      for (const raw of list) {
        const d = cleanDef(raw);
        /* Une condition native exportée revient sur la native ; un
           doublon (clé ou nom d'une native) est écarté. */
        if (d.native) {
          if (!EffectManager.nativeIds().has(d.key)) { skipped++; continue; }
          const i = this.defs.findIndex(x => x.native && x.key === d.key);
          if (i >= 0) { this.defs[i] = d; replaced++; } else { this.defs.push(d); added++; }
          continue;
        }
        /* Même clé qu'un effet existant : il est MIS À JOUR (comme
           l'import d'un modèle). */
        const same = this.defs.findIndex(x => !x.native && x.key === d.key);
        if (same >= 0) { this.defs[same] = d; replaced++; continue; }
        const sameName = d.label && (EffectManager._nativeCache ?? [])
          .some(n => nativeName(n.id).trim().toLowerCase() === d.label.trim().toLowerCase());
        if (sameName || EffectManager.keyError(d.key, this.defs)) { skipped++; continue; }
        this.defs.push(d);
        added++;
      }
      /* Enregistré tout de suite (sinon l'import restait en attente
         d'« Enregistrer » et semblait n'avoir rien fait). */
      const err = this.#validate();
      if (err) { ui.notifications.error(err); this.render(); return; }
      await EffectManager.setDefs(this.defs.filter(d => !isPlainNative(d)));
      this._defs = foundry.utils.deepClone(EffectManager.getDefs());
      this._sel = Math.min(Math.max(0, this._sel ?? 0), this._defs.length - 1);
      ui.notifications.info(game.i18n.format("SBE.Effects.ImportDone", { n: added, r: replaced, s: skipped }));
      this.render();
    });
    input.click();
  }

  /** Couleur de l'icône : l'aperçu suit le choix tout de suite. */
  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element;
    /* Clés proposées : liste SBE avec défilement (pas la liste du navigateur). */
    wireKeyLists(root);
    /* Objets donnés : on y glisse des objets du monde. */
    if (root) wireGiveDrop(root, (uuid) => {
      this.#readForm();
      this.defs[this._sel]?.gives.push(newGive(uuid));
      this._open.gives = true;
      this.render();
    });
    const img = root?.querySelector(".sbe-fx-iconpick img");
    const on = root?.querySelector(".sbe-fx-iconcolor-on");
    const col = root?.querySelector(".sbe-fx-iconcolor");
    if (!img || !on || !col) return;
    const shown = img.getAttribute("src");
    const src = img.dataset.raw || shown;
    const painted = shown !== src ? (img.dataset.color || "") : "";
    const upd = () => {
      /* La copie colorée enregistrée, tant que la couleur n'a pas changé ;
         sinon l'originale, teinte par CSS (ou nature si décoché). */
      const usePainted = on.checked && painted && col.value.toLowerCase() === painted;
      img.setAttribute("src", usePainted ? shown : src);
      if (on.checked && !usePainted) {
        img.setAttribute("data-sbe-tint", "");
        img.setAttribute("style", tintStyle(src, col.value));
      } else {
        img.removeAttribute("data-sbe-tint");
        img.removeAttribute("style");
      }
    };
    on.addEventListener("change", upd);
    col.addEventListener("input", upd);
    upd();
  }

  _onClose(options) {
    if (SBEEffectsApp._instance === this) SBEEffectsApp._instance = null;
    return super._onClose?.(options);
  }
}

/* Bouton des contrôles de scène (MJ), posé dès l'import du module. */
Hooks.on("getSceneControlButtons", (controls) => {
  try {
    const group = controls?.tokens;
    if (!group?.tools) return;
    group.tools.sbeEffects = {
      name: "sbeEffects",
      title: game.i18n.localize("SBE.Effects.ButtonTitle"),
      icon: "fa-solid fa-bolt",
      order: Object.keys(group.tools).length,
      button: true,
      visible: game.user.isGM,
      onChange: () => { SBEEffectsApp.open(); }
    };
  } catch (err) {
    console.warn("SBE | Effets : bouton de contrôle en échec", err);
  }
});
