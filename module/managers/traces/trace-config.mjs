/**
 * SBE — Fenêtre de configuration des TRACES (Paramètres → Traces au sol)
 *
 * À gauche les types de traces, à droite le type choisi. Chaque champ
 * s'enregistre dès qu'il change (`data-f` = chemin dans le type).
 * Entrée « Empreintes » : règles communes à tous les types (`data-r` =
 * « index.champ » dans la règle).
 */
const FP_SECTION = "__footprints";

import { SYSTEM_ID, SYSTEM_PATH } from "../../helpers/constants.mjs";
import { TraceManager, BUILTIN_SHAPES, FOOTPRINTS, FP_KINDS, COND_OPS, footprintSVG } from "./trace-manager.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));

export class SBETraceConfig extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "sbe-trace-config",
    tag: "div",
    classes: ["sbe-trace-config", "sbe-condense"],
    window: { title: "SBE.Traces.Title", icon: "fa-solid fa-droplet", resizable: true },
    position: { width: 760, height: 640 },
    actions: {
      tcSelect: SBETraceConfig.#onSelect,
      tcAdd: SBETraceConfig.#onAdd,
      tcDelete: SBETraceConfig.#onDelete,
      tcReset: SBETraceConfig.#onReset,
      tcAddImage: SBETraceConfig.#onAddImage,
      tcDelImage: SBETraceConfig.#onDelImage,
      tcPickFolder: SBETraceConfig.#onPickFolder,
      tcClearScene: SBETraceConfig.#onClearScene,
      tcFootprintImg: SBETraceConfig.#onFootprintImg,
      tcPickFoot: SBETraceConfig.#onPickFoot,
      tcRuleAdd: SBETraceConfig.#onRuleAdd,
      tcRuleDel: SBETraceConfig.#onRuleDel,
      tcRuleMove: SBETraceConfig.#onRuleMove,
      tcRuleImg: SBETraceConfig.#onRuleImg
    }
  };

  static PARTS = {
    body: { template: `${SYSTEM_PATH}/templates/managers/trace-config.hbs`, scrollable: [".sbe-tc-list", ".sbe-tc-edit"] }
  };

  _sel = null;

  static open() {
    const app = foundry.applications.instances.get("sbe-trace-config") ?? new SBETraceConfig();
    return app.render({ force: true });
  }

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    const types = TraceManager.types();
    const fpMode = this._sel === FP_SECTION;
    const sel = fpMode ? null : (types.find(t => t.id === this._sel) ?? types[0] ?? null);
    if (!fpMode) this._sel = sel?.id ?? null;
    const { walkElements } = await import("../../builder/element-renderer.mjs");
    const keys = new Set();
    for (const t of game.actors?.filter(a => a.type === "template") ?? []) {
      for (const el of walkElements(t.system.elements ?? [])) if (el?.key) keys.add(el.key);
    }
    return Object.assign(ctx, {
      types: types.map(t => ({ id: t.id, name: t.name, enabled: t.enabled, active: t.id === sel?.id, color: t.color?.value, isBase: t.id === "blood" })),
      type: sel,
      isBlood: sel?.id === "blood",
      templates: (game.actors?.filter(a => a.type === "template") ?? []).map(a => ({ id: a.id, name: a.name, on: (sel?.templates ?? []).includes(a.id) })),
      impactShapes: BUILTIN_SHAPES.map(id => ({ id, label: L(`SBE.Traces.Shape.${id}`), on: (sel?.impact?.shapes ?? []).includes(id) })),
      trailShapes: BUILTIN_SHAPES.map(id => ({ id, label: L(`SBE.Traces.Shape.${id}`), on: (sel?.trail?.shapes ?? []).includes(id) })),
      impactEffects: this.#effectsOf(sel?.impact), trailEffects: this.#effectsOf(sel?.trail),
      impactBoth: TraceManager.condUsesBoth(sel?.impact), trailBoth: TraceManager.condUsesBoth(sel?.trail),
      keys: [...keys].sort(),
      ops: COND_OPS.map(id => ({ id, label: L(`SBE.Traces.Ops.${id === "any" ? "any" : ({ "<": "lt", "<=": "le", ">": "gt", ">=": "ge", "==": "eq", "!=": "ne" })[id]}`) })),
      footprints: FOOTPRINTS.map(id => ({ id, label: L(`SBE.Traces.Foot.${id}`), on: sel?.footprint === id, svg: footprintSVG(id, 48) })),
      fpImage: !!sel?.footprint && !FOOTPRINTS.includes(sel.footprint),
      folderCount: sel?.imageFolder ? (await TraceManager.loadFolder(sel.imageFolder)).length : 0,
      fadeUnit: sel?.fade?.mode === "world" ? L("SBE.Traces.Hours") : L("SBE.Traces.Minutes"),
      opts: TraceManager.options(),
      fpMode,
      rules: fpMode ? this.#rulesContext() : []
    });
  }

  /** Les effets proposés (gestionnaire et statuts de Foundry), cochés selon la condition. */
  #effectsOf(cond) {
    const on = new Set(cond?.effects ?? []);
    return [...(CONFIG.statusEffects ?? [])].filter(e => e?.id)
      .map(e => ({ id: e.id, label: game.i18n.localize(e.name ?? e.id), img: e.img ?? "", on: on.has(e.id) }));
  }

  /** Règles d'empreintes prêtes à afficher (listes de choix selon le critère). */
  #rulesContext() {
    const byName = (a, b) => a.name.localeCompare(b.name, game.i18n.lang);
    const tpls = (game.actors?.filter(a => a.type === "template") ?? []).sort(byName);
    const chars = (game.actors?.filter(a => a.type === "personnage") ?? []).sort(byName);
    const models = (game.items?.filter(i => i.type === "objet" && !i.system?.modelId) ?? []).sort(byName);
    const listFor = { template: tpls, actor: chars, item: models };
    const rules = TraceManager.footprintRules();
    return rules.map((r, i) => {
      const img = !!r.footprint && !FOOTPRINTS.includes(r.footprint);
      return {
        ...r, idx: i, first: i === 0, last: i === rules.length - 1,
        isKey: r.kind === "key", img,
        svg: img ? "" : footprintSVG(r.footprint || "boot", 40),
        kinds: FP_KINDS.map(id => ({ id, label: L(`SBE.Traces.FpKind.${id}`), on: id === r.kind })),
        refs: (listFor[r.kind] ?? []).map(d => ({ id: d.id, name: d.name, on: d.id === r.ref })),
        feet: FOOTPRINTS.map(id => ({ id, label: L(`SBE.Traces.Foot.${id}`), on: id === r.footprint }))
      };
    });
  }

  async #saveRules(mutator) {
    const rules = TraceManager.footprintRules();
    mutator(rules);
    await TraceManager.saveFootprintRules(rules);
    this.render();
  }

  async #save(mutator) {
    const types = foundry.utils.deepClone(TraceManager.types());
    const t = types.find(x => x.id === this._sel);
    if (!t) return;
    mutator(t, types);
    await TraceManager.saveTypes(types);
    this.render();
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const root = this.element;
    root.querySelectorAll("[data-f]").forEach(el => el.addEventListener("change", () => {
      const path = el.dataset.f;
      let v = el.type === "checkbox" ? el.checked : el.value;
      if (el.type === "number" || el.type === "range") v = Number(el.value) || 0;
      if (path.startsWith("tpl:")) {
        const id = path.slice(4);
        return this.#save(t => {
          const set = new Set(t.templates ?? []);
          if (el.checked) set.add(id); else set.delete(id);
          t.templates = [...set];
        });
      }
      if (path.startsWith("eff:")) {
        /* « eff:trail:saignement » : les effets qui déclenchent cette trace. */
        const [, which, id] = path.split(":");
        return this.#save(t => {
          const set = new Set(t[which]?.effects ?? []);
          if (el.checked) set.add(id); else set.delete(id);
          t[which].effects = [...set];
        });
      }
      if (path.startsWith("shape:")) {
        /* « shape:impact:splat » : la liste de formes de ce déclencheur. */
        const [, which, id] = path.split(":");
        return this.#save(t => {
          const set = new Set(t[which]?.shapes ?? []);
          if (el.checked) set.add(id); else set.delete(id);
          t[which].shapes = BUILTIN_SHAPES.filter(s => set.has(s));
        });
      }
      return this.#save(t => foundry.utils.setProperty(t, path, v));
    }));
    root.querySelectorAll("[data-r]").forEach(el => el.addEventListener("change", () => {
      const [i, field] = el.dataset.r.split(".");
      return this.#saveRules(rules => {
        const r = rules[Number(i)];
        if (!r) return;
        r[field] = el.value;
        /* Nouveau critère : l'ancienne cible ne veut plus rien dire. */
        if (field === "kind") r.ref = "";
      });
    }));
    root.querySelectorAll("[data-opt]").forEach(el => el.addEventListener("change", async () => {
      const o = TraceManager.options();
      const v = el.type === "checkbox" ? el.checked : (el.type === "number" ? (Number(el.value) || 0) : el.value.trim());
      foundry.utils.setProperty(o, el.dataset.opt, v);
      await game.settings.set(SYSTEM_ID, "traceOptions", o);
    }));
  }

  static #onSelect(_e, t) { this._sel = t.dataset.id; this.render(); }

  static async #onAdd() {
    const types = foundry.utils.deepClone(TraceManager.types());
    const t = TraceManager.defaultType();
    types.push(t);
    this._sel = t.id;
    await TraceManager.saveTypes(types);
    this.render();
  }

  /* Supprime un type ajouté (le sang de base reste : il se remet à zéro). */
  static async #onDelete(ev, target) {
    ev?.stopPropagation?.();
    const types = TraceManager.types();
    const t = types.find(x => x.id === (target?.dataset.id ?? this._sel));
    if (!t || t.id === "blood") return;
    if (!t) return;
    const ok = await DialogV2.confirm({
      window: { title: L("SBE.Traces.DeleteTitle") },
      content: `<p>${L("SBE.Traces.DeleteConfirm", { name: foundry.utils.escapeHTML(t.name) })}</p>`, rejectClose: false
    }).catch(() => false);
    if (!ok) return;
    await TraceManager.saveTypes(types.filter(x => x.id !== t.id));
    if (this._sel === t.id) this._sel = null;
    this.render();
  }

  /* Remet le sang d'origine (ou le recrée s'il a été supprimé). */
  static async #onReset() {
    const types = foundry.utils.deepClone(TraceManager.types()).filter(x => x.id !== "blood");
    types.unshift(TraceManager.bloodType());
    this._sel = "blood";
    await TraceManager.saveTypes(types);
    this.render();
  }

  static #onAddImage() {
    const FP = foundry.applications.apps.FilePicker.implementation;
    new FP({ type: "image", callback: (path) => this.#save(t => { t.images = [...(t.images ?? []), path]; }) }).render(true);
  }

  /* Dossier d'images : une image tirée au hasard à chaque trace. */
  static #onPickFolder() {
    const FP = foundry.applications.apps.FilePicker.implementation;
    const cur = TraceManager.types().find(x => x.id === this._sel)?.imageFolder ?? "";
    new FP({ type: "folder", current: cur, callback: (path) => this.#save(t => { t.imageFolder = String(path ?? "").replace(/\/+$/, ""); }) }).render(true);
  }

  static async #onPickFoot(_e, t) {
    const id = t.dataset.id;
    await this.#save(x => { x.footprint = id; });
  }

  /* Empreinte en image (téléversée ou choisie). */
  static #onFootprintImg() {
    const FP = foundry.applications.apps.FilePicker.implementation;
    new FP({ type: "image", callback: (path) => this.#save(t => { t.footprint = path; }) }).render(true);
  }

  static async #onDelImage(_e, t) {
    const i = Number(t.dataset.idx);
    await this.#save(x => { x.images = (x.images ?? []).filter((_p, j) => j !== i); });
  }

  static async #onRuleAdd() {
    await this.#saveRules(rules => { rules.push(TraceManager.newFootprintRule()); });
  }

  static async #onRuleDel(_e, t) {
    const i = Number(t.dataset.idx);
    await this.#saveRules(rules => { rules.splice(i, 1); });
  }

  static async #onRuleMove(_e, t) {
    const i = Number(t.dataset.idx), j = i + Number(t.dataset.dir);
    await this.#saveRules(rules => {
      if (j < 0 || j >= rules.length) return;
      [rules[i], rules[j]] = [rules[j], rules[i]];
    });
  }

  static #onRuleImg(_e, t) {
    const i = Number(t.dataset.idx);
    const FP = foundry.applications.apps.FilePicker.implementation;
    new FP({ type: "image", callback: (path) => this.#saveRules(rules => { if (rules[i]) rules[i].footprint = path; }) }).render(true);
  }

  static async #onClearScene() {
    if (canvas.scene) await TraceManager.askClear();
  }
}

export class SBETraceMenu extends ApplicationV2 {
  render() { SBETraceConfig.open(); return this; }
}
