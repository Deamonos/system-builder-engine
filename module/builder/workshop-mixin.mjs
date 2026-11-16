/**
 * SBE — L'ATELIER (WYSIWYG) — mixin partagé objets / personnages
 *
 * La fiche du template EST la fiche finale en cours de construction
 * (maquette v3 validée) :
 * - en tête : image + nom + options fixes du modèle ;
 * - un « + » centré en haut de CHAQUE zone (racine, cadre, colonne,
 *   onglet) ajoute un élément dedans ; survol → ⠿ ✏ 🗑 ;
 * - clic sur + ou ✏ → fenêtre d'édition à deux onglets Base / Style ;
 * - clé unique dans tout l'arbre, modifiable avec avertissement ;
 * - chaque élément a sa case « visible des joueurs » — VISIBILITÉ
 *   HIÉRARCHIQUE (un conteneur invisible cache tout son contenu).
 *
 * Palier 3 : structure — cadre repliable, colonnes (2-4), barre de
 * navigation + onglets, séparateur. Le rendu vit dans
 * builder/element-renderer.mjs, partagé avec la feuille objet.
 */

import { visPolicyHTML, readVisPolicy, isDefaultVis } from "./roll-visibility.mjs";
import { afterEditorHtml, wireAfterEditor, readAfterEditor } from "./roll-after.mjs";
import { TemplateTheme } from "../managers/theme/template-theme.mjs";
import {
  renderWorkshop, findById, findParentList, getTargetList, walkElements, isNativeKind, nativeUiParts, KEY_RE,
  chartPreviewHTML, ttSnippetFor, autosizeFreeZones, isFreeFrame, QUANTITY_KEY, containerKeyLabel, isRefList, PANEL_ZONE, CARD_PLACES, CARD_TONES, BONUS_TONES
} from "./element-renderer.mjs";
import { CARRIED_FUNCS } from "./carried.mjs";
import { SCOPE_FUNC_NAMES } from "./doc-scope.mjs";
import { getKeyRefChoices } from "../helpers/key-refs.mjs";
import { CombatManager } from "../managers/combat/combat-manager.mjs";
import { profileFieldsHtml, readProfileFields, wireOptionsEditor } from "../managers/combat/attack-options.mjs";
import { EffectManager } from "../managers/effects/effect-manager.mjs";
import { validateFormula, HAS_DICE } from "./formula-engine.mjs";
import { STEP_TYPES, CAL_STEPS, EFFECT_ACTIONS, SET_MODES, INTERACTIVE_STEPS } from "./item-actions.mjs";
import { CalendarManager } from "../managers/calendar/calendar-manager.mjs";
import { TIME_ACTIONS, TIME_UNITS, TIME_PARTS, IMPOSE_MODES } from "../managers/calendar/calendar-model.mjs";
import { TOUCH_MODES } from "../helpers/canvas-utils.mjs";
import { DICE_ICONS, DICE_ICON_DEFAULT } from "../helpers/dice-icons.mjs";
import { getFontFamilies, SYSTEM_ID } from "../helpers/constants.mjs";
import { UiSound } from "../managers/media/ui-sound.mjs";
import { SCENE_ACTIONS } from "../managers/props/prop-scene.mjs";
import { SPATIAL_DEFAULT_COLS, SPATIAL_DEFAULT_ROWS } from "./spatial.mjs";
import { WorkshopHistory, wireHistoryButtons } from "./workshop-history.mjs";
import { AUTO_EVENTS, AUTO_SCOPES, AUTO_FREQS } from "../managers/triggers/action-triggers.mjs";
import { stepSentence } from "./step-sentence.mjs";
import { BLOCK_TYPES, BLOCK_BRANCHES, flatSteps } from "./step-blocks.mjs";
import { attachCondEditor, setCondMode, condAdvanced } from "./cond-builder.mjs";
import { STEP_VARS } from "../managers/checker/ref-engine.mjs";
import { SBETalentEditor } from "./talents/talent-editor.mjs";
import { SBELevelRulesEditor } from "./levels/level-rules-editor.mjs";
import { SHOP_KINDS, STALL_VIEWS, STALL_TABS, stallConfig } from "./shop/shop-render.mjs";
import { TREE_DISPLAYS, TREE_DEFAULT_HEIGHT, TREE_WHO, TREE_REFUNDS, TREE_REWARDS_BACK, fitTreePreviews } from "./talents/talent-tree.mjs";
import { LEVEL_MODES, LEVEL_GAUGES, LEVEL_WHO, LEVEL_COMMIT, LEVEL_RECEIVED } from "./levels/level-model.mjs";

/** Les clés des composants Niveau de tous les modèles (personnages et objets). */
function levelKeyChoices() {
  const keys = new Map();
  for (const coll of [game.actors, game.items]) {
    for (const d of coll ?? []) {
      for (const e of walkElements(d.system?.elements ?? [])) if (e?.kind === "level" && e.key && !keys.has(e.key)) keys.set(e.key, e.label || e.key);
    }
  }
  return [...keys];
}

/* Exemples des cases (placeholders) : traduits, jamais écrits en dur. */
const PH = (k) => foundry.utils.escapeHTML(game.i18n.localize(`SBE.Ph.${k}`));

/* Graphiques : familles de BASE → apparences (variantes). Le type
   stocké (config.type) est la variante finale. */
const CHART_BASES = [
  ["radar", "ChartRadar", ["radar", "radar2"]],
  ["line", "ChartLine", ["line", "area"]],
  ["barsh", "ChartBarsH", ["barsh", "lollipop", "dots"]],
  ["barsv", "ChartBarsV", ["barsv"]],
  ["pie", "ChartPie", ["pie", "donut", "rose"]],
  ["waterfall", "ChartWaterfall", ["waterfall"]],
  ["funnel", "ChartFunnel", ["funnel"]],
  ["picto", "ChartPicto", ["picto"]]
];
const CHART_TYPES = CHART_BASES.flatMap(b => b[2]);
const chartBaseOf = (type) => (CHART_BASES.find(b => b[2].includes(type)) ?? CHART_BASES[0])[0];

/* Types d'éléments : actifs / à venir. "tab" ne se crée que dans une
   barre de navigation (via son +). */
const ELEMENT_KINDS = [
  { kind: "text", enabled: true },
  { kind: "richtext", enabled: true },
  { kind: "number", enabled: true },
  { kind: "checkbox", enabled: true },
  { kind: "color", enabled: true },
  { kind: "select", enabled: true },
  { kind: "image", enabled: true },
  { kind: "gauge", enabled: true },
  { kind: "chart", enabled: true },
  { kind: "html", enabled: true },
  { kind: "tags", enabled: true },
  { kind: "frame", enabled: true },
  { kind: "columns", enabled: true },
  { kind: "table", enabled: true },
  { kind: "nav", enabled: true },
  { kind: "separator", enabled: true },
  { kind: "button", enabled: true },
  { kind: "slot", enabled: true },
  { kind: "container", enabled: true },
  { kind: "quantity", enabled: true },
  { kind: "effects", enabled: true },
  { kind: "talents", enabled: true },
  { kind: "level", enabled: true },
  /* Seulement dans un modèle de boutique (genre « shop »). */
  { kind: "shopStall", enabled: true },
  { kind: "shopCash", enabled: true },
  { kind: "shopPurse", enabled: true },
  { kind: "shopSell", enabled: true },
  { kind: "shopSellList", enabled: true },
  { kind: "shopHistory", enabled: true },
  /* Seulement dans la zone « Panneau une fois posé » (voir #kindOptions). */
  { kind: "ref", enabled: true }
];

/**
 * Mixin de l'ATELIER : toute la logique du modèle (WYSIWYG, dialogues
 * d'éléments, tables, onglets…) partagée entre les modèles d'OBJETS
 * (Item) et les modèles de PERSONNAGES (Actor). La classe fille ne
 * fournit que sa base (ItemSheetV2 / ActorSheetV2).
 */
export function WorkshopMixin(Base) {
  return class SBEWorkshopSheet extends Base {

    /** Un atelier (raccourcis annuler / rétablir). */
    get sbeWorkshop() { return true; }

  /** Onglet actif par barre de navigation : { navId: tabId }. */
  _navActive = {};

  /** Onglet de l'atelier : "sheet" (Fiche) ou "desc" (Description). */
  _wtab = "desc";

  static DEFAULT_OPTIONS = {
    classes: ["sbe-template-sheet"],
    position: { width: 680, height: 760 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      sbeCheckTemplate: SBEWorkshopSheet.#onCheckTemplate,
      pickImage: SBEWorkshopSheet.#onPickImage,
      addElement: SBEWorkshopSheet.#onAddElement,
      editElement: SBEWorkshopSheet.#onEditElement,
      deleteElement: SBEWorkshopSheet.#onDeleteElement,
      switchNavTab: SBEWorkshopSheet.#onSwitchNavTab,
      editNativeImg: SBEWorkshopSheet.#onEditNativeImg,
      editNativeName: SBEWorkshopSheet.#onEditNativeName,
      switchWorkshopTab: SBEWorkshopSheet.#onSwitchWorkshopTab,
      addWorkshopTab: SBEWorkshopSheet.#onAddWorkshopTab,
      deleteWorkshopTab: SBEWorkshopSheet.#onDeleteWorkshopTab,
      toggleWorkshopTabVis: SBEWorkshopSheet.#onToggleWorkshopTabVis,
      workshopTabCond: SBEWorkshopSheet.#onWorkshopTabCond,
      addTableCol: SBEWorkshopSheet.#onAddTableCol,
      editTableCol: SBEWorkshopSheet.#onEditTableCol,
      deleteTableCol: SBEWorkshopSheet.#onDeleteTableCol,
      addTableRow: SBEWorkshopSheet.#onAddTableRow,
      deleteTableRow: SBEWorkshopSheet.#onDeleteTableRow,
      chartRemoveAxis: SBEWorkshopSheet.#onChartRemoveAxis,
      editTalentTree: SBEWorkshopSheet.#onEditTalentTree,
      editLevelRules: SBEWorkshopSheet.#onEditLevelRules,
      exportTemplate: SBEWorkshopSheet.#onExportTemplate,
      importTemplate: SBEWorkshopSheet.#onImportTemplate,
      editStackOpts: SBEWorkshopSheet.#onEditStackOpts,
      editUnidOpts: SBEWorkshopSheet.#onEditUnidOpts,
      editInactiveOpts: SBEWorkshopSheet.#onEditInactiveOpts,
      editPropOpts: SBEWorkshopSheet.#onEditPropOpts,
      editIconMarks: SBEWorkshopSheet.#onEditIconMarks,
      addMediaDef: SBEWorkshopSheet.#onAddMediaDef,
      deleteMediaDef: SBEWorkshopSheet.#onDeleteMediaDef,
      addGrant: SBEWorkshopSheet.#onAddGrant,
      deleteGrant: SBEWorkshopSheet.#onDeleteGrant
    }
  };

  static PARTS = {
    body: {
      template: "systems/system-builder-engine/templates/item/template-sheet.hbs",
      /* Le défilement NE REMONTE PAS en haut à chaque validation ou
         modification : positions préservées à chaque re-rendu. */
      scrollable: [".sbe-obj-scroll", ".sbe-tpl-canvas--desc", ".sbe-tpl-fixedtab", ".sbe-tpl-root", ".window-content"]
    }
  };

  /* ---------------------------------------------------------- */
  /*  Contexte de rendu                                          */
  /* ---------------------------------------------------------- */

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const sys = this.document.system;
    context.item = this.document;
    context.sys = sys;
    context.isActor = this.document.documentName === "Actor";
    /* Modèle de personnage = page vierge : AUCUNE barre d'onglets, juste
       le « + » en haut. Si le MJ veut des onglets, il pose un élément
       Navigation où il veut. Tout vit dans la zone principale. */
    if (context.isActor) this._wtab = "sheet";

    /* Les éléments NATIFS (portrait/icône + nom) vivent dans L'EN-TÊTE
       par défaut, mais peuvent être GLISSÉS dans la page (drag & drop).
       Leur réglage (taille/style) reste dans system.nativeUi ; l'arbre
       ne porte qu'un marqueur de position. */
    if (context.isActor) {
      const nu = this.document.system.nativeUi ?? {};
      const img = nativeUiParts("img", nu.img);
      context.nativeImgCss = img.css;
      context.nativeImgCssId = img.cssId;
      context.nativeImgCls = img.cls;
      { const nm = nativeUiParts("name", nu.name); context.nativeNameCss = nm.css; context.nativeNameCssId = nm.cssId; }
      context.nativeNameSub = nu.name?.config?.subLabel ?? "";
      const all = [...walkElements(sys.elements ?? [])];
      context.nativeImgInTree = all.some(e => e?.kind === "actorImg");
      context.nativeNameInTree = all.some(e => e?.kind === "actorName");
    }
    /* Médias déclarés par ce modèle (objets uniquement). */
    context.mediaDefs = (Array.isArray(sys.mediaDefs) ? sys.mediaDefs : [])
      .map(d => ({ id: d?.id ?? "", name: d?.name ?? "", hint: d?.hint ?? "" }));
    /* Effets conférés par les objets de ce modèle. */
    context.grants = (Array.isArray(sys.grants) ? sys.grants : [])
      .map(g => ({ id: g?.id ?? "", effect: g?.effect ?? "", equipped: g?.when === "equipped", onlyIf: g?.onlyIf ?? "" }));
    context.effectKeys = EffectManager.effectOptions();
    /* Nombre de repères réglés (badge de l'option). */
    { const im = sys.iconMarks ?? {}; context.marksCount = (im.marks?.length ?? 0) + (im.halo?.length ?? 0); }

    const roots = this.document.system.elements ?? [];
    /* Les OBJETS n'ont plus d'onglet « Fiche » : leur atelier tient
       dans l'onglet Description. La zone historique « desc » rejoint
       donc la zone principale — un seul plan de travail, l'ordre du
       modèle fait foi. Les onglets personnalisés gardent le leur. */
    const extraIdSet = new Set((Array.isArray(sys.extraTabs) ? sys.extraTabs : []).map(t => t.id));
    const mainRoots = roots.filter(e => !extraIdSet.has(e?.zone) && e?.zone !== PANEL_ZONE);
    context.hasElements = mainRoots.length > 0;
    context.hasDescElements = mainRoots.length > 0;
    /* Éléments natifs : dans l'atelier ils éditent le MODÈLE lui-même. */
    const wopts = {
      navActive: this._navActive,
      docImg: this.document.img,
      docName: this.document.name,
      nativeUi: this.document.system.nativeUi ?? {},
      /* Arbre complet : les graphiques y lisent les bornes des clés. */
      elements: roots,
      /* Modèle empilable ? (signale un élément Quantité orphelin) */
      stackable: context.isActor ? undefined : !!sys.opts?.stackable
    };
    /* L'atelier défile EN ENTIER, épinglés compris : ses poignées, ses
       « + » et ses pointillés grandissent chaque élément, et un en-tête
       épinglé plus haut que la fenêtre y devenait impossible à éditer
       (rien ne défilait). L'épinglage reste un réglage de la FICHE. */
    context.workshopHTML = `<div class="sbe-obj-scroll">${renderWorkshop(mainRoots, wopts)}</div>`;
    /* Objets : le même plan de travail, sous le texte de description. */
    context.descWorkshopHTML = context.isActor ? "" : context.workshopHTML;
    context.isSheetTab = this._wtab === "sheet";
    context.isDescTab = this._wtab === "desc";
    context.isMediaTab = !context.isActor && this._wtab === "media";
    context.isGrantsTab = !context.isActor && this._wtab === "grants";

    /* Onglets personnalisés. */
    const extraTabs = Array.isArray(sys.extraTabs) ? sys.extraTabs : [];
    context.extraTabs = extraTabs.map(t => ({
      id: t.id, name: t.name ?? "", playerVisible: t.playerVisible !== false,
      visibleIf: String(t.visibleIf ?? "").trim(),
      active: this._wtab === t.id
    }));
    const activeExtra = extraTabs.find(t => t.id === this._wtab);
    context.isExtraTab = !!activeExtra;
    context.activeExtraId = activeExtra?.id ?? "";
    context.extraWorkshopHTML = activeExtra
      ? `<div class="sbe-obj-scroll">${renderWorkshop(roots.filter(e => e?.zone === activeExtra.id), wopts)}</div>`
      : "";
    /* PANNEAU UNE FOIS POSÉ (modèle d'objet de scène) : sa propre zone. */
    context.hasPanelTab = !context.isActor && !!sys.opts?.prop;
    if (!context.hasPanelTab && this._wtab === "panel") this._wtab = "desc";
    context.isPanelTab = context.hasPanelTab && this._wtab === "panel";
    context.panelZone = PANEL_ZONE;
    if (context.isPanelTab) {
      const panelRoots = roots.filter(e => e?.zone === PANEL_ZONE);
      context.hasPanelElements = panelRoots.length > 0;
      context.panelWorkshopHTML = `<div class="sbe-obj-scroll">${renderWorkshop(panelRoots, wopts)}</div>`;
      const pc = sys.propCfg ?? {};
      context.panelMode = ["window", "bubble"].includes(pc.panelMode) ? pc.panelMode : "window";
      context.panelWidth = Number(pc.panelWidth) > 0 ? Number(pc.panelWidth) : "";
      context.panelHead = pc.panelHead !== false;
    }
    return context;
  }

  /* ---------------------------------------------------------- */
  /*  Rendu : câblages hors actions déclaratives                 */
  /* ---------------------------------------------------------- */

  /**
   * PLI DES CADRES CONSERVÉ : chaque re-rendu reconstruit le DOM, et un
   * cadre replié à la main se rouvrait à la moindre modification (une
   * frappe, un placement…). L'état ouvert/replié de chaque cadre est
   * retenu sur l'application tant que la fenêtre vit, et réappliqué
   * après chaque rendu. Les cadres non repliables ne sont pas touchés.
   */
  _frameOpen = {};

  _restoreFrameFolds(root) {
    for (const d of root.querySelectorAll("details[data-sync][data-fid]")) {
      if (d.classList.contains("sbe-frame--fixed")) continue;
      const id = d.dataset.fid;
      if (id in this._frameOpen) d.open = this._frameOpen[id];
      d.addEventListener("toggle", () => { this._frameOpen[id] = d.open; });
    }
  }

  _onRender(context, options) {
    super._onRender(context, options);
    /* Même titre que les fiches : masqué si le modèle le demande. */
    TemplateTheme.applyTitle(this, this.document);
    /* Annuler / rétablir : boutons de l'en-tête. */
    wireHistoryButtons(this);
    this._restoreFrameFolds(this.element);
    this.#wireMediaDefs();
    this.#wireGrants();
    /* Aperçu des images à choix : bascule LOCALE (rien n'est écrit). */
    for (const btn of this.element.querySelectorAll("[data-preview-img]")) {
      btn.addEventListener("click", () => {
        const wrapEl = btn.closest(".sbe-obj-el-imgwrap--choice");
        const img = wrapEl?.querySelector("img");
        if (img) img.src = btn.dataset.previewImg;
        for (const b of wrapEl?.querySelectorAll("[data-preview-img]") ?? []) {
          b.classList.toggle("active", b === btn);
        }
      });
    }
    this.#wireDragReorder();
    this.#wireTableCells();
    this.#wireFreePlacement(this.element);
    autosizeFreeZones(this.element);
    fitTreePreviews(this.element);
    for (const input of this.element.querySelectorAll(".sbe-wtab-extra-input")) {
      input.addEventListener("change", async (ev) => {
        const tabId = ev.target.closest("[data-tab-id]")?.dataset.tabId;
        const tabs = foundry.utils.deepClone(this.document.system.extraTabs ?? []);
        const tab = tabs.find(t => t.id === tabId);
        if (!tab) return;
        tab.name = ev.target.value.trim();
        await this.document.update({ "system.extraTabs": tabs });
      });
    }
  }

  /* Cellules des lignes fixes (colonnes verrouillées) : saisie directe. */
  #wireTableCells() {
    for (const input of this.element.querySelectorAll(".sbe-tblfix-input")) {
      input.addEventListener("change", async (ev) => {
        const { elId, rowId, colkey } = ev.target.dataset;
        const elements = foundry.utils.deepClone(this.document.system.elements);
        const el = findById(elements, elId);
        const row = el?.config?.rows?.find(r => r.id === rowId);
        if (!row) return;
        row.cells ??= {};
        const col = el.config.columns?.find(cc => cc.key === colkey);
        let v;
        if (col?.type === "checkbox") v = !!ev.target.checked;
        else if (col?.type === "number") v = Number(ev.target.value ?? 0) || 0;
        else v = ev.target.value ?? "";
        row.cells[colkey] = v;
        await this.#saveStructure(elements);
      });
    }
  }

  /* ============================================================
     DRAG & DROP de l'atelier — inter-conteneurs.
     - Glisser un élément SUR un autre = l'insérer AVANT lui,
       où qu'il soit (colonne, cadre, nav, autre zone racine).
     - Glisser sur un bouton « + » = l'ajouter DANS ce conteneur.
     - Les éléments NATIFS de l'en-tête (portrait/nom) se glissent
       aussi dans la page ; la poubelle les renvoie dans l'en-tête.
     ============================================================ */

  /** Élément conteneur propriétaire d'une liste (null = racine). */
  static #listOwner(elements, list) {
    if (list === elements) return null;
    for (const el of walkElements(elements)) {
      if (el?.children === list) return el;
      if (Array.isArray(el?.cols) && el.cols.includes(list)) return el;
    }
    return null;
  }

  /** Le conteneur accepte-t-il ce type d'élément ? */
  static #acceptsKind(owner, kind) {
    if (owner?.kind === "nav") return kind === "tab";
    if (owner?.kind === "button") return kind === "button";
    if (kind === "tab") return false; /* un onglet ne vit que dans une nav */
    return true;
  }

  /** Déplace un élément (ou pose un natif) vers une cible. */
  async #dropMove(drag, target) {
    const elements = foundry.utils.deepClone(this.document.system.elements);

    /* --- L'élément déplacé --- */
    let moved;
    if (drag.native) {
      /* Natif depuis l'en-tête : devient un marqueur dans l'arbre
         (sa config/style restent dans system.nativeUi). */
      const kind = drag.native === "img" ? "actorImg" : "actorName";
      if ([...walkElements(elements)].some(e => e?.kind === kind)) return;
      moved = {
        id: drag.native === "img" ? "native-img" : "native-name",
        kind, key: "", label: "", playerVisible: true, config: {}, style: {}
      };
    } else {
      const from = findParentList(elements, drag.id);
      if (!from) return;
      moved = from.list[from.index];
      /* Jamais dans soi-même ni dans sa propre descendance. */
      const subtree = new Set([...walkElements([moved])].map(e => e?.id));
      const intoId = target.mode === "append" ? target.parentId
        : (() => {
          const owner = SBEWorkshopSheet.#listOwner(elements, findParentList(elements, target.targetId)?.list ?? elements);
          return owner?.id ?? "";
        })();
      if (subtree.has(target.targetId) || (intoId && subtree.has(intoId))) {
        ui.notifications.warn(game.i18n.localize("SBE.Template.DragIntoSelf"));
        return;
      }
      from.list.splice(from.index, 1);
    }

    /* --- La liste cible --- */
    let list, insertAt, owner;
    if (target.mode === "append") {
      list = getTargetList(elements, { parentId: target.parentId, col: target.col });
      if (!list) return;
      owner = target.parentId ? findById(elements, target.parentId) : null;
      insertAt = target.pos === "start" ? 0 : list.length;
    } else {
      const to = findParentList(elements, target.targetId);
      if (!to) return;
      list = to.list;
      owner = SBEWorkshopSheet.#listOwner(elements, list);
      insertAt = list.findIndex(e => e?.id === target.targetId);
      if (insertAt < 0) insertAt = list.length;
    }

    /* --- Contraintes de conteneur --- */
    if (!SBEWorkshopSheet.#acceptsKind(owner, moved.kind)) {
      ui.notifications.warn(game.i18n.localize("SBE.Template.DragKindRefused"));
      return;
    }

    /* --- Zone : propriété des éléments RACINE uniquement --- */
    if (list === elements) {
      moved.zone = target.mode === "append"
        ? (target.zone ?? "")
        : (findById(elements, target.targetId)?.zone ?? "");
      if (!moved.zone) delete moved.zone;
    } else {
      delete moved.zone;
    }

    list.splice(insertAt, 0, moved);
    await this.#saveStructure(elements);
  }

  #wireDragReorder() {
    const root = this.element;
    if (!root) return;
    /* { id } pour un élément de l'arbre, { native: "img"|"name" }
       pour un natif attrapé dans l'en-tête. */
    let drag = null;
    const clearMarks = () => root.querySelectorAll(".sbe-drop-hover").forEach(n => n.classList.remove("sbe-drop-hover"));

    /* --- Sources : les éléments de l'arbre (poignée ⠿) --- */
    for (const row of root.querySelectorAll(".sbe-tpl-el")) {
      const handle = row.querySelector(":scope > .sbe-tpl-tools .sbe-tpl-drag");
      if (handle) {
        handle.addEventListener("mousedown", () => {
          row.setAttribute("draggable", "true");
          /* Simple clic sur ⠿ sans glisser : on n'oublie pas de
             retirer « draggable », sinon le corps entier redevient
             une poignée et un placement libre devient un changement
             d'ordre (donc de plan). */
          document.addEventListener("mouseup", () => {
            if (!row.classList.contains("sbe-tpl-dragging")) row.removeAttribute("draggable");
          }, { once: true });
        });
        row.addEventListener("dragstart", (ev) => {
          /* Seule la poignée ⠿ lance un déplacement dans l'arbre. Une
             image (glissable par nature) ou un enfant qui remonte ici
             ne doit PAS être pris pour l'élément. */
          if (ev.target !== row || !row.hasAttribute("draggable")) return;
          ev.stopPropagation();
          drag = { id: row.dataset.elId };
          ev.dataTransfer.effectAllowed = "move";
          row.classList.add("sbe-tpl-dragging");
        });
        row.addEventListener("dragend", () => {
          row.removeAttribute("draggable");
          row.classList.remove("sbe-tpl-dragging");
          clearMarks();
        });
      }
      /* Cible : insérer AVANT cet élément. */
      row.addEventListener("dragover", (ev) => {
        if (!drag) return;
        ev.preventDefault(); ev.stopPropagation();
        clearMarks(); row.classList.add("sbe-drop-hover");
      });
      row.addEventListener("dragleave", () => row.classList.remove("sbe-drop-hover"));
      row.addEventListener("drop", async (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        clearMarks();
        const targetId = row.dataset.elId;
        if (!drag || drag.id === targetId) return;
        const d = drag; drag = null;
        await this.#dropMove(d, { mode: "before", targetId });
      });
    }

    /* --- Sources : les natifs de l'en-tête (poignée ⠿ dédiée) --- */
    for (const grip of root.querySelectorAll(".sbe-native-drag")) {
      const wrap = grip.closest(".sbe-native-wrap");
      if (!wrap) continue;
      grip.addEventListener("mousedown", () => wrap.setAttribute("draggable", "true"));
      wrap.addEventListener("dragstart", (ev) => {
        ev.stopPropagation();
        drag = { native: grip.dataset.native };
        ev.dataTransfer.effectAllowed = "move";
      });
      wrap.addEventListener("dragend", () => {
        wrap.removeAttribute("draggable");
        clearMarks();
      });
    }

    /* --- Cibles : les boutons « + » (ajout en fin de conteneur) --- */
    for (const plus of root.querySelectorAll("[data-action='addElement']")) {
      plus.addEventListener("dragover", (ev) => {
        if (!drag) return;
        ev.preventDefault(); ev.stopPropagation();
        clearMarks(); plus.classList.add("sbe-drop-hover");
      });
      plus.addEventListener("dragleave", () => plus.classList.remove("sbe-drop-hover"));
      plus.addEventListener("drop", async (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        clearMarks();
        if (!drag) return;
        const d = drag; drag = null;
        await this.#dropMove(d, {
          mode: "append",
          parentId: plus.dataset.parent ?? "",
          col: plus.dataset.col !== undefined ? Number(plus.dataset.col) : null,
          zone: plus.dataset.zone ?? "",
          pos: plus.dataset.pos === "start" ? "start" : "end"
        });
      });
    }

    /* --- Cibles : SLOTS des graphiques — le dépôt AJOUTE UNE
       RÉFÉRENCE (la clé du champ), l'élément n'est PAS déplacé. --- */
    for (const zone of root.querySelectorAll(".sbe-chart-dropzone")) {
      zone.addEventListener("dragover", (ev) => {
        if (!drag || drag.native) return;
        ev.preventDefault(); ev.stopPropagation();
        clearMarks(); zone.classList.add("sbe-drop-hover");
      });
      zone.addEventListener("dragleave", () => zone.classList.remove("sbe-drop-hover"));
      zone.addEventListener("drop", async (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        clearMarks();
        if (!drag || drag.native) return;
        const d = drag; drag = null;
        const elements = foundry.utils.deepClone(this.document.system.elements);
        const chart = findById(elements, zone.dataset.chartId);
        const src = findById(elements, d.id);
        if (!chart || !src || src.id === chart.id) return;
        if (!["number", "gauge"].includes(src.kind) || !src.key) {
          ui.notifications.warn(game.i18n.localize("SBE.Template.ChartKindRefused"));
          return;
        }
        chart.children = Array.isArray(chart.children) ? chart.children : [];
        if (chart.children.some(k => k?.id === src.id)) {
          ui.notifications.warn(game.i18n.localize("SBE.Template.ChartDup"));
          return;
        }
        /* DÉPLACEMENT dans le graphe : on mémorise l'emplacement
           d'origine pour pouvoir y RENVOYER le champ plus tard. */
        const from = findParentList(elements, src.id);
        if (!from) return;
        const owner = SBEWorkshopSheet.#listOwner(elements, from.list);
        src._home = {
          parentId: owner?.id ?? "",
          col: owner?.kind === "columns" ? owner.cols.findIndex(l => l === from.list) : null,
          zone: src.zone ?? ""
        };
        delete src.zone;
        from.list.splice(from.index, 1);
        chart.children.push(src);
        await this.#saveStructure(elements);
      });
    }
  }

  /**
   * PLACEMENT LIBRE — poser les enfants d'un cadre à la souris.
   *
   * On saisit le CORPS de l'élément ; la poignée ⠿ garde son rôle
   * habituel (sortir l'élément du cadre par glisser-déposer), et les
   * zones de saisie restent cliquables. Pendant le déplacement, seul le
   * style de l'élément bouge — l'écriture dans le document n'a lieu
   * qu'au relâcher, pour ne pas provoquer un rendu à chaque pixel.
   *
   * Les positions sont retenues en POURCENTAGE de la boîte : la mise en
   * page tient quand la fiche change de largeur.
   */
  #wireFreePlacement(root) {
    /* Changement de plan : déplacer l'élément dans la liste des
       enfants — l'ordre du modèle EST l'ordre d'empilement. */
    const reorder = async (item, toFront) => {
      const zoneId = item.closest("[data-free-zone]")?.dataset.freeZone;
      const elements = foundry.utils.deepClone(this.document.system.elements ?? []);
      const frame = findById(elements, zoneId);
      if (!frame || !Array.isArray(frame.children)) return;
      const i = frame.children.findIndex(e => e?.id === item.dataset.freeId);
      if (i < 0) return;
      const [moved] = frame.children.splice(i, 1);
      if (toFront) frame.children.push(moved);
      else frame.children.unshift(moved);
      await this.#saveStructure(elements);
    };
    for (const zone of root.querySelectorAll("[data-free-zone]")) {
      for (const item of zone.querySelectorAll(":scope > .sbe-free-item")) {
        item.querySelector(".sbe-free-front")?.addEventListener("click", (ev) => {
          ev.stopPropagation();
          reorder(item, true);
        });
        item.querySelector(".sbe-free-back")?.addEventListener("click", (ev) => {
          ev.stopPropagation();
          reorder(item, false);
        });
        item.querySelector(".sbe-free-unit")?.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          const zoneW = zone.getBoundingClientRect().width || 1;
          const elements = foundry.utils.deepClone(this.document.system.elements ?? []);
          const frame = findById(elements, zone.dataset.freeZone);
          const target = frame ? (frame.children ?? []).find(e => e?.id === item.dataset.freeId) : null;
          if (!target) return;
          const pos = { ...(target.pos ?? {}) };
          const wasPx = item.dataset.freeUnit === "px";
          const curX = Number(pos.x) || 0;
          if (wasPx) {
            pos.x = Number(((curX / zoneW) * 100).toFixed(2));
            pos.u = "%";
          } else {
            pos.x = Math.round((curX / 100) * zoneW);
            pos.u = "px";
          }
          target.pos = pos;
          await this.#saveStructure(elements);
        });
        /* Zone libre : glisser le CORPS = placement, jamais un
           glisser-déposer natif (image, texte sélectionné…). */
        item.addEventListener("dragstart", (ev) => {
          if (ev.target.closest?.(".sbe-tpl-drag")) return;
          const row = ev.target.closest?.(".sbe-tpl-el");
          if (row && ev.target === row && row.hasAttribute("draggable")) return;
          ev.preventDefault();
          ev.stopPropagation();
        });
        item.addEventListener("pointerdown", (ev) => {
          if (ev.button !== 0) return;
          /* Outils, poignée de glisser, champs : on ne détourne pas. */
          if (ev.target.closest(".sbe-tpl-tools, .sbe-tpl-drag, input, select, textarea, a, button")) return;
          ev.preventDefault();
          ev.stopPropagation();

          const box = zone.getBoundingClientRect();
          const rect = item.getBoundingClientRect();
          /* Écart entre le point saisi et le coin de l'élément : sans
             lui, l'élément saute sous le curseur au premier pixel. */
          const dx = ev.clientX - rect.left;
          const dy = ev.clientY - rect.top;

          item.classList.add("sbe-free-dragging");
          item.setPointerCapture(ev.pointerId);
          let px = null, py = null;

          const unitPx = item.dataset.freeUnit === "px";
          const move = (e) => {
            /* L'UNITÉ de l'élément décide : en px, ancré au coin de la
               zone (posé sur une image, ça y reste) ; en %, la position
               suit la largeur du cadre. X : jamais hors du cadre — la
               borne haute tient compte de la LARGEUR de l'élément. Y :
               jamais au-dessus du bord ; vers le bas la zone S'ÉTIRE
               pour le contenir. */
            const xMax = Math.max(0, box.width - rect.width);
            px = Math.min(xMax, Math.max(0, e.clientX - dx - box.left));
            py = Math.max(0, e.clientY - dy - box.top);
            if (unitPx) {
              item.style.left = `${Math.round(px)}px`;
              item.style.maxWidth = `calc(100% - ${Math.round(px)}px)`;
            } else {
              const pc = (px / box.width) * 100;
              item.style.left = `${pc.toFixed(2)}%`;
              item.style.maxWidth = `calc(100% - ${pc.toFixed(2)}%)`;
            }
            item.style.top = `${Math.round(py)}px`;
            const need = py + rect.height + 10;
            if (need > zone.clientHeight) zone.style.minHeight = `${Math.round(need)}px`;
          };
          const up = async () => {
            item.removeEventListener("pointermove", move);
            item.removeEventListener("pointerup", up);
            item.removeEventListener("pointercancel", up);
            item.classList.remove("sbe-free-dragging");
            if (px === null) return;      /* simple clic : rien à écrire */
            const elements = foundry.utils.deepClone(this.document.system.elements ?? []);
            const target = findById(elements, item.dataset.freeId);
            if (!target) return;
            target.pos = {
              ...(target.pos ?? {}),
              x: unitPx ? Math.round(px) : Number(((px / box.width) * 100).toFixed(2)),
              y: Math.round(py),
              u: unitPx ? "px" : "%"
            };
            await this.#saveStructure(elements);
          };
          item.addEventListener("pointermove", move);
          item.addEventListener("pointerup", up);
          item.addEventListener("pointercancel", up);
        });
      }
    }
  }

  /** Écrit la structure + incrémente le compteur de version. */
  async #saveStructure(elements) {
    await this.document.update({
      "system.elements": elements,
      "system.structVersion": (this.document.system.structVersion ?? 0) + 1
    });
  }

  /* ---------------------------------------------------------- */
  /*  Actions                                                    */
  /* ---------------------------------------------------------- */

  /** Menu ⋮ de la fenêtre : « Vérifier le modèle ». */
  _getHeaderControls() {
    const controls = super._getHeaderControls();
    controls.push({ icon: "fa-solid fa-stethoscope", label: "SBE.Checker.CheckTemplate", action: "sbeCheckTemplate" });
    return controls;
  }

  static async #onCheckTemplate() {
    const { SBECheckerApp } = await import("../managers/checker/checker-app.mjs");
    SBECheckerApp.open({ template: this.document });
  }

  static #onPickImage() {
    const FilePicker = foundry.applications.apps.FilePicker.implementation;
    new FilePicker({
      type: "image",
      current: this.document.img,
      callback: (path) => this.document.update({ img: path })
    }).render(true);
  }

  static #onSwitchWorkshopTab(_event, target) {
    let tab = target.dataset.tab ?? "sheet";
    const isExtra = (this.document.system.extraTabs ?? []).some(t => t.id === tab);
    /* Onglets fixes du modèle d'objet : médias déclarés, effets conférés. */
    const fixed = this.document.documentName !== "Actor" && (tab === "media" || tab === "grants"
      || (tab === "panel" && !!this.document.system.opts?.prop));
    if (tab !== "sheet" && tab !== "desc" && !isExtra && !fixed) tab = "sheet";
    /* Modèle de personnage : pas de barre d'onglets. */
    if (this.document.documentName === "Actor") return;
    if (tab === this._wtab) return; /* pas de re-render : garde le focus */
    this._wtab = tab;
    this.render();
  }

  /* ---------------------------------------------------------- */
  /*  MÉDIAS DÉCLARÉS                                            */
  /* ---------------------------------------------------------- */

  /**
   * Nom et aide des médias déclarés : saisie libre, enregistrée à la
   * sortie du champ. Ces champs n'ont pas d'attribut « name » — la
   * soumission du formulaire ne sait pas écrire dans un tableau, elle
   * en ferait un objet à clés numériques.
   */
  #wireMediaDefs() {
    for (const row of this.element.querySelectorAll(".sbe-mediadef")) {
      const id = row.dataset.defId;
      for (const [cls, field] of [[".sbe-mdef-name", "name"], [".sbe-mdef-hint", "hint"]]) {
        const input = row.querySelector(cls);
        if (!input) continue;
        input.addEventListener("change", async () => {
          const defs = foundry.utils.deepClone(
            Array.isArray(this.document.system.mediaDefs) ? this.document.system.mediaDefs : []);
          const def = defs.find(d => d?.id === id);
          if (!def) return;
          const next = String(input.value ?? "").trim();
          if (def[field] === next) return;
          /* Le NOM d'un média est un identifiant (appelé par les
             déclencheurs) : même règle que les clés, et unique. */
          if (field === "name" && next) {
            const bad = !KEY_RE.test(next) ? "SBE.Media.NameBad"
              : defs.some(d => d !== def && d?.name === next) ? "SBE.Media.NameTaken" : "";
            if (bad) {
              ui.notifications.error(game.i18n.format(bad, { name: next }));
              input.value = def.name ?? "";
              return;
            }
          }
          def[field] = next;
          await this.document.update({ "system.mediaDefs": defs });
        });
      }
    }
  }

  /* ---------------------------------------------------------- */
  /*  EFFETS CONFÉRÉS                                            */
  /* ---------------------------------------------------------- */

  /** Saisie des lignes (enregistrée à la sortie du champ). */
  #wireGrants() {
    for (const row of this.element.querySelectorAll(".sbe-grant")) {
      const id = row.dataset.grantId;
      const save = async () => {
        const list = foundry.utils.deepClone(Array.isArray(this.document.system.grants) ? this.document.system.grants : []);
        const g = list.find(x => x?.id === id);
        if (!g) return;
        g.effect = String(row.querySelector(".sbe-grant-effect")?.value ?? "").trim();
        g.when = row.querySelector(".sbe-grant-when")?.value === "equipped" ? "equipped" : "carried";
        /* « Seulement si » : formule lue sur l'objet (vide = toujours). */
        g.onlyIf = String(row.querySelector(".sbe-grant-if")?.value ?? "").trim();
        await this.document.update({ "system.grants": list });
      };
      row.querySelector(".sbe-grant-effect")?.addEventListener("change", save);
      row.querySelector(".sbe-grant-when")?.addEventListener("change", save);
      row.querySelector(".sbe-grant-if")?.addEventListener("change", save);
    }
  }

  static async #onAddGrant() {
    const list = [...(Array.isArray(this.document.system.grants) ? this.document.system.grants : [])];
    list.push({ id: foundry.utils.randomID(), effect: "", when: "equipped" });
    await this.document.update({ "system.grants": list });
  }

  static async #onDeleteGrant(_event, target) {
    const id = target.dataset.grantId;
    const list = (Array.isArray(this.document.system.grants) ? this.document.system.grants : []).filter(g => g?.id !== id);
    await this.document.update({ "system.grants": list });
  }

  /** Ajoute un nom de média à réclamer aux objets. */
  static async #onAddMediaDef() {
    const defs = [...(Array.isArray(this.document.system.mediaDefs) ? this.document.system.mediaDefs : [])];
    defs.push({ id: foundry.utils.randomID(), name: "", hint: "" });
    await this.document.update({ "system.mediaDefs": defs });
  }

  /**
   * Retire un nom déclaré. Les fichiers déjà posés sur les objets ne
   * sont PAS effacés : ils dorment, et reviennent si le nom est
   * recréé — on ne détruit rien dans le dos du créateur.
   */
  static async #onDeleteMediaDef(_event, target) {
    const id = target.dataset.defId;
    const defs = (Array.isArray(this.document.system.mediaDefs) ? this.document.system.mediaDefs : [])
      .filter(d => d?.id !== id);
    await this.document.update({ "system.mediaDefs": defs });
  }

  /** Molette « Repères sur l'icône » : la fenêtre de réglage. */
  static async #onEditIconMarks() {
    const { SBEIconMarksConfig } = await import("./icon-marks.mjs");
    new SBEIconMarksConfig(this.document).render(true);
  }

  /** Réglages d'OBJET DE SCÈNE (posé sur la scène en pion non lié). */
  static async #onEditPropOpts() {
    const { PropManager } = await import("../managers/props/prop-manager.mjs");
    const { trapDialogHTML, readTrapDialog } = await import("../managers/traps/trap-model.mjs");
    const { cfCell, cfGrid, wireCompactForm } = await import("../helpers/compact-form.mjs");
    const L = (k) => game.i18n.localize(k);
    const esc = (x) => foundry.utils.escapeHTML(String(x ?? ""));
    const c = PropManager.cfgOf(this.document);
    const sel = (name, cur, list) => `<select name="${name}">${list.map(v => `<option value="${v}" ${cur === v ? "selected" : ""}>${L(`SBE.Prop.${name}_${v}`)}</option>`).join("")}</select>`;
    const states = (c.states ?? []).map(x => `${x.value} = ${x.img}`).join("\n");
    /* Boutons du modèle (déclencheurs) : par leur clé. */
    const btns = [...walkElements(this.document.system.elements ?? [])].filter(e => e?.kind === "button" && e.key);
    const btnSel = (name, cur) => `<select name="${name}"><option value="">—</option>${btns.map(b => `<option value="${esc(b.key)}" ${cur === b.key ? "selected" : ""}>${esc(b.label || b.key)} (${esc(b.key)})</option>`).join("")}</select>`;
    /* Grille à 2 colonnes : aide en bulle, champs masqués s'ils ne servent pas. */
    const f = (label, inner, o = {}) => cfCell(L(label), inner, { ...o, hint: o.hint ? L(o.hint) : "" });
    const chk = (name, label, o = {}) => f(label, `<input type="checkbox" name="${name}" ${c[name] ? "checked" : ""}>`, { ...o, check: true });
    const numIn = (name, step, min, max) => `<input type="number" name="${name}" value="${c[name]}" min="${min}" ${max ? `max="${max}"` : ""} step="${step}">`;
    const content = `
      <div class="sbe-prop-cfg">
        <p class="notes">${L("SBE.Prop.CfgHint")}</p>
        ${cfGrid([
          f("SBE.Prop.PropIf", `<input type="text" name="propIf" value="${esc(c.propIf)}" placeholder="${PH("PropIf")}">`, { hint: "SBE.Prop.PropIfHint", wide: true })
        ])}
        <fieldset><legend>${L("SBE.Prop.LookGroup")}</legend>
        ${cfGrid([
          f("SBE.Prop.Img", `<div class="sbe-sc-row"><input type="text" name="img" value="${esc(c.img)}" placeholder="${L("SBE.Prop.ImgPh")}">
            <button type="button" class="sbe-prop-fp" data-target="img"><i class="fa-solid fa-folder-open"></i></button></div>`, { wide: true }),
          f("SBE.Prop.Size", sel("sizeMode", c.sizeMode, ["cells", "px", "image"]), { hint: "SBE.Prop.SizeHint" }),
          chk("rotate", "SBE.Prop.Rotate"),
          f("SBE.Prop.W", numIn("w", 0.1, 0.1), { show: "sizeMode:cells,px" }),
          f("SBE.Prop.H", numIn("h", 0.1, 0.1), { show: "sizeMode:cells,px" }),
          f("SBE.Prop.Visibility", sel("visibility", c.visibility, ["all", "owner", "gm"])),
          chk("showName", "SBE.Prop.ShowName"),
          f("SBE.Prop.StateKey", `<input type="text" name="stateKey" value="${esc(c.stateKey)}" placeholder="${PH("StateKey")}">`, { hint: "SBE.Prop.StateHint" }),
          f("SBE.Prop.States", `<textarea name="states" rows="2" placeholder="${PH("States")}">${esc(states)}</textarea>`, { wide: true })
        ])}
        </fieldset>
        <fieldset><legend>${L("SBE.Prop.UseGroup")}</legend>
        ${cfGrid([
          f("SBE.Prop.Range", numIn("range", 0.5, 0), { hint: "SBE.Prop.RangeHint" }),
          f("SBE.Prop.FireArc", numIn("fireArc", 5, 0, 360), { hint: "SBE.Prop.FireArcHint" }),
          f("SBE.Prop.UseWho", sel("use", c.use, ["all", "owner"])),
          f("SBE.Prop.TakeWho", sel("take", c.take, ["owner", "all", "gm", "none"])),
          chk("single", "SBE.Prop.Single")
        ])}
        </fieldset>
        <fieldset><legend>${L("SBE.Prop.CombatGroup")}</legend>
        ${cfGrid([
          chk("ignoreCombat", "SBE.Prop.IgnoreCombat", { hint: "SBE.Prop.IgnoreCombatHint" }),
          f("SBE.Prop.HpKey", `<input type="text" name="hpKey" value="${esc(c.hpKey)}" placeholder="${PH("HpKey")}">`, { hint: "SBE.Prop.HpHint", show: "ignoreCombat:0" }),
          f("SBE.Prop.OnZero", sel("onZero", c.onZero, ["destroy", "ground"]), { show: "ignoreCombat:0" })
        ])}
        </fieldset>
        <fieldset><legend>${L("SBE.Trig.Group")}</legend>
        ${cfGrid([
          chk("dblClick", "SBE.Trig.DblClick", { hint: "SBE.Trig.DblClickHint" }),
          chk("apOn", "SBE.Trig.Approach", { hint: "SBE.Trig.ApproachHint" }),
          f("SBE.Trig.ApRange", numIn("apRange", 0.5, 0), { show: "apOn:1" }),
          f("SBE.Trig.ApMode", sel("apMode", c.apMode, ["stop", "pass", "both"]), { show: "apOn:1" }),
          f("SBE.Trig.ApAct", sel("apAct", c.apAct, ["panel", "button"]), { show: "apOn:1" }),
          f("SBE.Trig.Button", btnSel("apBtn", c.apBtn), { show: "apOn:1;apAct:button" }),
          f("SBE.Trig.ApFreq", sel("apFreq", c.apFreq, ["each", "actor", "once"]), { show: "apOn:1" }),
          f("SBE.Trig.ApWho", sel("apWho", c.apWho, ["players", "all"]), { show: "apOn:1" }),
          chk("dropOn", "SBE.Trig.Drop", { hint: "SBE.Trig.DropHint" }),
          f("SBE.Trig.Button", btnSel("dropBtn", c.dropBtn), { show: "dropOn:1" }),
          f("SBE.Trig.DropIf", `<input type="text" name="dropIf" value="${esc(c.dropIf)}" placeholder="${PH("DropIf")}">`, { show: "dropOn:1" })
        ])}
        </fieldset>
        ${trapDialogHTML(c, btns, L, esc)}
      </div>`;
    let out = null;
    const dlg = new foundry.applications.api.DialogV2({
      window: { title: L("SBE.Prop.CfgTitle") },
      position: { width: 560 },
      content,
      buttons: [
        {
          action: "ok", label: L("SBE.Common.Validate"), icon: "fa-solid fa-check", default: true,
          callback: (_ev, _btn, dialog) => {
            const r = dialog.element;
            const val = (n) => r.querySelector(`[name="${n}"]`)?.value ?? "";
            const chk = (n) => !!r.querySelector(`[name="${n}"]`)?.checked;
            out = {
              sizeMode: val("sizeMode"), w: Number(val("w")) || 1, h: Number(val("h")) || 1,
              img: val("img").trim(), rotate: chk("rotate"), range: Math.max(0, Number(val("range")) || 0),
              single: chk("single"), visibility: val("visibility"), use: val("use"), take: val("take"),
              stateKey: val("stateKey").trim(),
              states: val("states").split("\n").map(l => l.split("=")).filter(p => p.length >= 2)
                .map(([v, ...rest]) => ({ value: v.trim(), img: rest.join("=").trim() })).filter(x => x.value && x.img),
              hpKey: val("hpKey").trim(), onZero: val("onZero"),
              showName: chk("showName"), ignoreCombat: chk("ignoreCombat"),
              fireArc: Math.max(0, Math.min(360, Number(val("fireArc")) || 0)), propIf: val("propIf").trim(),
              dblClick: chk("dblClick"),
              apOn: chk("apOn"), apRange: Math.max(0, Number(val("apRange")) || 0), apMode: val("apMode"), apAct: val("apAct"), apBtn: val("apBtn"),
              apFreq: val("apFreq"), apWho: val("apWho"),
              dropOn: chk("dropOn"), dropBtn: val("dropBtn"), dropIf: val("dropIf").trim(),
              ...readTrapDialog(r)
            };
            return "ok";
          }
        },
        { action: "cancel", label: L("SBE.Common.Cancel"), icon: "fa-solid fa-xmark" }
      ]
    });
    dlg.addEventListener("close", async () => {
      if (!out) return;
      /* Le panneau (mode, largeur) se règle dans son onglet : gardé. */
      await this.document.update({ "system.propCfg": PropManager.cleanCfg({ ...(this.document.system.propCfg ?? {}), ...out }) });
    }, { once: true });
    await dlg.render({ force: true });
    wireCompactForm(dlg.element);
    dlg.element?.querySelectorAll(".sbe-prop-fp").forEach(b => b.addEventListener("click", () => {
      const input = dlg.element.querySelector(`[name="${b.dataset.target}"]`);
      const FP = foundry.applications.apps.FilePicker.implementation;
      new FP({ type: "image", current: input?.value ?? "", callback: (path) => { if (input) input.value = path; } }).render(true);
    }));
  }

  /** Objet non identifié : la clé qui dit « identifié », et le groupe. */
  static async #onEditUnidOpts() {
    const L = (k) => game.i18n.localize(k);
    const esc = (x) => foundry.utils.escapeHTML(String(x ?? ""));
    const o = this.document.system.opts ?? {};
    const res = await foundry.applications.api.DialogV2.prompt({
      window: { title: L("SBE.Unid.CfgTitle") },
      position: { width: 440 },
      classes: ["sbe-condense"],
      content: `<div style="display:flex;flex-direction:column;gap:8px;">
        <p class="notes">${L("SBE.Unid.CfgHint")}</p>
        <div class="form-group"><label>${L("SBE.Unid.Key")}</label>
          <input type="text" name="key" value="${esc(o.unidKey || "")}" placeholder="${PH("UnidKey")}">
          <p class="notes">${L("SBE.Unid.KeyHint")}</p></div>
        <label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" name="group" ${o.unidGroup ? "checked" : ""}> ${L("SBE.Unid.Group")}</label>
        <p class="notes">${L("SBE.Unid.GroupHint")}</p>
      </div>`,
      ok: { label: L("SBE.Common.Validate"), callback: (_e, b) => ({ key: b.form.elements.key.value.trim(), group: b.form.elements.group.checked }) },
      rejectClose: false
    }).catch(() => null);
    if (!res) return;
    if (!/^[A-Za-z_]\w*$/.test(res.key)) { ui.notifications.error(L("SBE.Unid.BadKey")); return; }
    await this.document.update({ "system.opts.unidKey": res.key, "system.opts.unidGroup": res.group, "system.opts.unid": true });
  }

  /** Objet inactif : la formule (lue sur l'objet) qui le rend inactif. */
  static async #onEditInactiveOpts() {
    const L = (k) => game.i18n.localize(k);
    const esc = (x) => foundry.utils.escapeHTML(String(x ?? ""));
    const o = this.document.system.opts ?? {};
    const res = await foundry.applications.api.DialogV2.prompt({
      window: { title: L("SBE.Inactive.CfgTitle") },
      position: { width: 460 },
      classes: ["sbe-condense"],
      content: `<div style="display:flex;flex-direction:column;gap:8px;">
        <p class="notes">${L("SBE.Inactive.CfgHint")}</p>
        <div class="form-group"><label>${L("SBE.Inactive.Formula")}</label>
          <input type="text" name="f" value="${esc(o.inactiveIf || "")}" placeholder="${esc(L("SBE.Inactive.FormulaPh"))}"></div>
      </div>`,
      ok: { label: L("SBE.Common.Validate"), callback: (_e, b) => b.form.elements.f.value.trim() },
      rejectClose: false
    }).catch(() => null);
    if (res === null || res === undefined) return;
    if (res) {
      const err = validateFormula(res);
      if (err) { ui.notifications.error(`${L("SBE.Inactive.Formula")} : ${err}`); return; }
    }
    await this.document.update({ "system.opts.inactiveIf": res, "system.opts.inactive": !!res });
  }

  /**
   * Options de l'EMPILEMENT (molette de « empilable »). Une seule
   * question pour l'instant : jusqu'où une pile peut monter. Vide ou
   * zéro = illimité, et c'est le défaut — une boîte de munitions, elle,
   * se règle à 30.
   */
  static async #onEditStackOpts() {
    const L = (k) => game.i18n.localize(k);
    const cur = Number(this.document.system.opts?.stackMax ?? 0) || 0;
    const content = `
      <div style="display:flex;flex-direction:column;gap:8px;">
        <p class="notes">${L("SBE.Stack.CfgHint")}</p>
        <div class="form-group">
          <label>${L("SBE.Stack.Max")}</label>
          <input type="number" name="stackMax" value="${cur > 0 ? cur : ""}" min="0" step="1" style="width:110px;"
                 placeholder="${L("SBE.Stack.Unlimited")}" autofocus>
          <p class="notes">${L("SBE.Stack.MaxHint")}</p>
        </div>
        ${this.document.system.opts?.stackable ? "" : `<p class="notes sbe-io-warn">${L("SBE.Stack.NotStackable")}</p>`}
      </div>`;

    let value = null;
    const dlg = new foundry.applications.api.DialogV2({
      window: { title: L("SBE.Stack.CfgTitle") },
      position: { width: 420 },
      classes: ["sbe-condense"],
      content,
      buttons: [
        {
          action: "ok", label: L("SBE.Common.Validate"), icon: "fa-solid fa-check", default: true,
          callback: (_ev, _btn, dialog) => {
            /* Vide ou 0 = illimité. Un seul champ, aucune case à
               cocher : le vide dit déjà « pas de limite ». */
            const n = Number(dialog.element.querySelector('[name="stackMax"]')?.value);
            value = (Number.isFinite(n) && n > 0) ? Math.floor(n) : 0;
            return "ok";
          }
        },
        { action: "cancel", label: L("SBE.Common.Cancel"), icon: "fa-solid fa-xmark" }
      ]
    });
    dlg.addEventListener("close", async () => {
      if (value === null) return;
      if (value === (Number(this.document.system.opts?.stackMax ?? 0) || 0)) return;
      await this.document.update({ "system.opts.stackMax": value });
    }, { once: true });
    dlg.render({ force: true });

  }

  /* ---------------------------------------------------------- */
  /*  IMPORT / EXPORT de la structure                            */
  /* ---------------------------------------------------------- */

  /** Télécharge la structure du modèle en JSON. */
  static async #onExportTemplate() {
    const { templateToJson, exportFileName } = await import("./template-io.mjs");
    const data = JSON.stringify(templateToJson(this.document), null, 2);
    const save = foundry.utils.saveDataToFile ?? globalThis.saveDataToFile;
    save(data, "application/json", exportFileName(this.document));
    ui.notifications.info(game.i18n.localize("SBE.IO.Exported"));
  }

  /**
   * Relit une structure et l'applique au modèle, après un compte rendu
   * que le créateur valide. La CLÉ fait l'identité : un élément déjà
   * présent est MIS À JOUR (réglages, style, place), un nouveau est
   * ajouté. Mode Remplacer : ce que le fichier ne mentionne pas est
   * retiré. Rien ne s'écrit avant validation.
   */
  static async #onImportTemplate() {
    const L = (k) => game.i18n.localize(k);
    const raw = await SBEWorkshopSheet.#askJson();
    if (!raw) return;

    let json = null;
    try { json = JSON.parse(raw); }
    catch (err) {
      ui.notifications.error(game.i18n.format("SBE.IO.BadJson", { msg: err.message }));
      return;
    }

    const mode = await foundry.applications.api.DialogV2.wait({
      window: { title: L("SBE.IO.ImportTitle") },
      position: { width: 480 },
      content: `<p>${L("SBE.IO.ModeQuestion")}</p><p class="notes">${L("SBE.IO.ModeUpdateHint")}</p><p class="notes">${L("SBE.IO.ModeReplaceHint")}</p>`,
      buttons: [
        { action: "update", label: L("SBE.IO.ModeUpdate"), icon: "fa-solid fa-file-import", default: true },
        { action: "replace", label: L("SBE.IO.ModeReplace"), icon: "fa-solid fa-arrows-rotate" }
      ],
      rejectClose: false
    }).catch(() => null);
    if (!mode) return;
    const replace = mode === "replace";

    const { jsonToTemplate, reportHTML, applyImported } = await import("./template-io.mjs");
    const res = jsonToTemplate(json, this.document, { replace });
    if (!res.ok) {
      ui.notifications.error(res.error ?? L("SBE.IO.NotATemplate"));
      return;
    }
    if (replace) res.report.notes.unshift(L("SBE.IO.ReplaceWarn"));

    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: L(replace ? "SBE.IO.ReplaceTitle" : "SBE.IO.ImportTitle") },
      position: { width: 480 },
      content: `<div class="sbe-io-report">${reportHTML(res.report, { name: json.name ?? "" })}</div>`,
      rejectClose: false
    }).catch(() => false);
    if (!ok) return;

    await applyImported(this.document, res);
    ui.notifications.info(game.i18n.format(replace ? "SBE.IO.Replaced" : "SBE.IO.Imported",
      { n: res.report.kept.length, added: res.report.added, updated: res.report.updated }));
  }

  /**
   * Demande le JSON : un fichier à choisir, ou du texte collé — les
   * deux, parce qu'un créateur qui reçoit une structure dans un message
   * ne devrait pas avoir à s'en faire un fichier d'abord.
   */
  static async #askJson() {
    const L = (k) => game.i18n.localize(k);
    const content = `
      <div style="display:flex;flex-direction:column;gap:8px;">
        <div class="form-group">
          <label>${L("SBE.IO.PickFile")}</label>
          <input type="file" name="file" accept=".json,application/json">
        </div>
        <div class="form-group">
          <label>${L("SBE.IO.OrPaste")}</label>
          <textarea name="paste" rows="6" style="font-family:monospace;font-size:0.85em;"
                    placeholder='{ "sbe": "template", … }'></textarea>
        </div>
      </div>`;
    return new Promise((resolve) => {
      let out = null;
      const dlg = new foundry.applications.api.DialogV2({
        window: { title: L("SBE.IO.ImportTitle") },
        position: { width: 520 },
        content,
        buttons: [
          {
            action: "ok", label: L("SBE.Common.Validate"), icon: "fa-solid fa-file-import", default: true,
            callback: async (_ev, _btn, dialog) => {
              const root = dialog.element;
              const file = root.querySelector('[name="file"]')?.files?.[0];
              if (file) { out = await file.text().catch(() => null); return "ok"; }
              const txt = root.querySelector('[name="paste"]')?.value?.trim();
              out = txt || null;
              return "ok";
            }
          },
          { action: "cancel", label: L("SBE.Common.Cancel"), icon: "fa-solid fa-xmark" }
        ]
      });
      dlg.addEventListener("close", () => resolve(out), { once: true });
      dlg.render({ force: true });
    });
  }

  static async #onAddWorkshopTab() {
    const tabs = foundry.utils.deepClone(this.document.system.extraTabs ?? []);
    const id = foundry.utils.randomID();
    tabs.push({ id, name: "", playerVisible: true });
    this._wtab = id;
    await this.document.update({ "system.extraTabs": tabs });
  }

  static async #onDeleteWorkshopTab(_event, target) {
    const tabId = target.closest("[data-tab-id]")?.dataset.tabId;
    const tabs = this.document.system.extraTabs ?? [];
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;
    const roots = (this.document.system.elements ?? []).filter(e => e?.zone === tabId);
    const count = [...walkElements(roots)].length;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("SBE.Template.DeleteTabTitle") },
      content: `<p>${game.i18n.format("SBE.Template.DeleteTabConfirm", {
        name: foundry.utils.escapeHTML(tab.name || game.i18n.localize("SBE.Template.NewTabName")),
        count
      })}</p>`,
      rejectClose: false
    }).catch(() => false);
    if (!ok) return;
    this._wtab = this.document.documentName === "Actor" ? "sheet" : "desc";
    await this.document.update({
      "system.extraTabs": tabs.filter(t => t.id !== tabId),
      "system.elements": (this.document.system.elements ?? []).filter(e => e?.zone !== tabId),
      "system.structVersion": (this.document.system.structVersion ?? 0) + 1
    });
  }

  static async #onToggleWorkshopTabVis(_event, target) {
    const tabId = target.closest("[data-tab-id]")?.dataset.tabId;
    const tabs = foundry.utils.deepClone(this.document.system.extraTabs ?? []);
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;
    tab.playerVisible = tab.playerVisible === false;
    await this.document.update({ "system.extraTabs": tabs });
  }

  /** « Visible si » d'un onglet : une formule lue sur l'objet (vide = toujours). */
  static async #onWorkshopTabCond(_event, target) {
    const tabId = target.closest("[data-tab-id]")?.dataset.tabId;
    const tabs = foundry.utils.deepClone(this.document.system.extraTabs ?? []);
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;
    const L = (k) => game.i18n.localize(k);
    const esc = (v) => foundry.utils.escapeHTML(String(v ?? ""));
    const res = await foundry.applications.api.DialogV2.prompt({
      window: { title: L("SBE.Template.TabVisibleIf") },
      content: `<div class="form-group"><label>${esc(L("SBE.Template.TabVisibleIf"))}</label>
        <input type="text" name="cond" value="${esc(tab.visibleIf)}" placeholder="${esc(L("SBE.Template.TabVisibleIfPh"))}"></div>
        <p class="notes">${esc(L("SBE.Template.TabVisibleIfHint"))}</p>`,
      ok: { label: L("SBE.Common.Save"), callback: (_ev, button) => button.form.elements.cond.value.trim() },
      rejectClose: false
    }).catch(() => null);
    if (res === null || res === undefined) return;
    const err = res ? validateFormula(res) : "";
    if (err) { ui.notifications.error(err); return; }
    tab.visibleIf = res;
    await this.document.update({ "system.extraTabs": tabs });
  }

  /* Crayons de l'en-tête : réglage des éléments natifs (system.nativeUi). */
  static #onEditNativeImg() {
    const nu = this.document.system.nativeUi?.img ?? {};
    this.#openElementDialog({
      id: "native-img", kind: "actorImg", key: "", label: "",
      playerVisible: true, config: nu.config ?? {}, style: nu.style ?? {}
    }, {});
  }

  static #onEditNativeName() {
    const nu = this.document.system.nativeUi?.name ?? {};
    this.#openElementDialog({
      id: "native-name", kind: "actorName", key: "", label: "",
      playerVisible: true, config: nu.config ?? {}, style: nu.style ?? {}
    }, {});
  }

  static #onSwitchNavTab(_event, target) {
    const nav = target.dataset.nav;
    const tab = target.dataset.tab;
    if (!nav || !tab) return;
    UiSound.onTabClick(this, target, findById(this.document.system.elements ?? [], tab));
    this._navActive[nav] = tab;
    this.render();
  }

  /* Renvoie un enfant de graphique à son emplacement d'origine
     (parent mémorisé si toujours vivant, sinon à côté du graphe). */
  static #returnChartKid(elements, chart, kid, fallbackList = null) {
    const home = kid._home ?? {};
    delete kid._home;
    let list = null;
    if (home.parentId && findById(elements, home.parentId)) {
      list = getTargetList(elements, { parentId: home.parentId, col: home.col ?? null });
    }
    if (!list) list = fallbackList;
    if (!list) {
      const cf = findParentList(elements, chart.id);
      list = cf ? cf.list : elements;
    }
    if (list === elements && home.zone) kid.zone = home.zone;
    else delete kid.zone;
    list.push(kid);
  }

  /** Composant Niveau : ouvre l'éditeur de ses règles (montée, descente, historique). */
  static #onEditLevelRules(_event, target) {
    const id = target.dataset.elId ?? target.closest("[data-el-id]")?.dataset.elId;
    if (id) SBELevelRulesEditor.open(this.document, id);
  }

  /** Composant Arbre : ouvre l'éditeur de son plan. */
  static #onEditTalentTree(_event, target) {
    const id = target.dataset.elId ?? target.closest("[data-el-id]")?.dataset.elId;
    if (id) SBETalentEditor.open(this.document, id);
  }

  /* Puce × d'un graphique : un enfant RETOURNE d'où il vient ;
     une ligne tapée à la main est simplement retirée de la liste. */
  static #onChartRemoveAxis(_event, target) {
    const chartId = target.dataset.chartId ?? target.closest("[data-el-id]")?.dataset.elId;
    const key = target.dataset.axisKey;
    const elements = foundry.utils.deepClone(this.document.system.elements);
    const chart = findById(elements, chartId);
    if (!chart || !key) return;
    const kids = Array.isArray(chart.children) ? chart.children : [];
    const idx = kids.findIndex(k => k?.key === key);
    if (idx >= 0) {
      const kid = kids.splice(idx, 1)[0];
      SBEWorkshopSheet.#returnChartKid(elements, chart, kid);
    } else {
      chart.config = chart.config ?? {};
      chart.config.axes = (Array.isArray(chart.config.axes) ? chart.config.axes : []).filter(a => a.key !== key);
    }
    this.#saveStructure(elements);
  }

  static #onAddElement(_event, target) {
    const parentId = target.dataset.parent ?? "";
    const col = target.dataset.col !== undefined ? Number(target.dataset.col) : null;
    const zone = target.dataset.zone ?? "";
    const pos = target.dataset.pos === "start" ? "start" : "end";
    const parent = parentId ? findById(this.document.system.elements, parentId) : null;
    const forcedKind = parent?.kind === "nav" ? "tab"
      : (parent?.kind === "button" ? "button" : null);
    this.#openElementDialog(null, { parentId, col, forcedKind, zone, pos });
  }

  static #onEditElement(_event, target) {
    const id = target.closest("[data-el-id]")?.dataset.elId;
    const el = findById(this.document.system.elements, id);
    if (!el) return;
    /* Natif posé dans la page : même dialogue que le crayon d'en-tête
       (config/style vivent dans system.nativeUi, pas dans l'arbre). */
    if (isNativeKind(el.kind)) {
      const slot = el.kind === "actorImg" ? "img" : "name";
      const nu = this.document.system.nativeUi?.[slot] ?? {};
      this.#openElementDialog({
        id: el.id, kind: el.kind, key: "", label: "",
        playerVisible: true, config: nu.config ?? {}, style: nu.style ?? {}
      }, {});
      return;
    }
    this.#openElementDialog(el, {});
  }

  static async #onDeleteElement(_event, target) {
    const id = target.closest("[data-el-id]")?.dataset.elId;
    const el = findById(this.document.system.elements, id);
    if (!el) return;
    /* Élément natif posé dans la page : la poubelle le RENVOIE dans
       l'en-tête (il n'est jamais vraiment supprimé). */
    if (isNativeKind(el.kind)) {
      const elements = foundry.utils.deepClone(this.document.system.elements);
      const found = findParentList(elements, id);
      if (!found) return;
      found.list.splice(found.index, 1);
      await this.#saveStructure(elements);
      ui.notifications.info(game.i18n.localize("SBE.Native.ReturnedHeader"));
      return;
    }
    const hasChildren = (el.children?.length ?? 0) > 0
      || (Array.isArray(el.cols) && el.cols.some(c => c?.length));
    const childNote = !hasChildren ? ""
      : (el.kind === "chart"
        ? `<p><b>${game.i18n.localize("SBE.Template.ChartDeleteReturns")}</b></p>`
        : `<p><b>${game.i18n.localize("SBE.Template.DeleteElChildren")}</b></p>`);
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("SBE.Template.DeleteElTitle") },
      content: `<p>${game.i18n.format("SBE.Template.DeleteElConfirm", { label: el.label || el.key })}</p>
                ${childNote}
                <p class="notes">${game.i18n.localize("SBE.Template.DeleteElWarn")}</p>`
    });
    if (!ok) return;
    const elements = foundry.utils.deepClone(this.document.system.elements);
    const found = findParentList(elements, id);
    if (!found) return;
    const doomed = found.list[found.index];
    found.list.splice(found.index, 1);
    /* Supprimer un GRAPHIQUE ne supprime pas ses champs : chacun
       RETOURNE à son emplacement d'origine. */
    if (doomed?.kind === "chart" && Array.isArray(doomed.children)) {
      for (const kid of doomed.children) {
        if (kid) SBEWorkshopSheet.#returnChartKid(elements, doomed, kid, found.list);
      }
    }
    await this.#saveStructure(elements);
  }

  /* ---------------------------------------------------------- */
  /*  Tables : colonnes et lignes fixes                          */
  /* ---------------------------------------------------------- */

  static #tableOf(target) {
    const id = target.closest("[data-el-id]")?.dataset.elId;
    return findById(this.document.system.elements, id);
  }

  static #onAddTableCol(_event, target) {
    const el = SBEWorkshopSheet.#tableOf.call(this, target);
    if (el) this.#openColumnDialog(el, null);
  }

  static #onEditTableCol(_event, target) {
    const el = SBEWorkshopSheet.#tableOf.call(this, target);
    const colId = target.closest("[data-col-id]")?.dataset.colId;
    const col = el?.config?.columns?.find(c => c.id === colId);
    if (el && col) this.#openColumnDialog(el, col);
  }

  static async #onDeleteTableCol(_event, target) {
    const el = SBEWorkshopSheet.#tableOf.call(this, target);
    const colId = target.closest("[data-col-id]")?.dataset.colId;
    const col = el?.config?.columns?.find(c => c.id === colId);
    if (!el || !col) return;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("SBE.Table.DeleteColTitle") },
      content: `<p>${game.i18n.format("SBE.Table.DeleteColConfirm", { label: col.label || col.key })}</p>`,
      rejectClose: false
    }).catch(() => false);
    if (!ok) return;
    const elements = foundry.utils.deepClone(this.document.system.elements);
    const live = findById(elements, el.id);
    live.config.columns = (live.config.columns ?? []).filter(c => c.id !== colId);
    for (const r of (live.config.rows ?? [])) {
      if (r.cells) delete r.cells[col.key];
    }
    await this.#saveStructure(elements);
  }

  static async #onAddTableRow(_event, target) {
    const el = SBEWorkshopSheet.#tableOf.call(this, target);
    if (!el) return;
    const elements = foundry.utils.deepClone(this.document.system.elements);
    const live = findById(elements, el.id);
    live.config.rows = Array.isArray(live.config.rows) ? live.config.rows : [];
    live.config.rows.push({ id: foundry.utils.randomID(), cells: {} });
    await this.#saveStructure(elements);
  }

  static async #onDeleteTableRow(_event, target) {
    const el = SBEWorkshopSheet.#tableOf.call(this, target);
    const rowId = target.closest("[data-row-id]")?.dataset.rowId;
    if (!el || !rowId) return;
    const elements = foundry.utils.deepClone(this.document.system.elements);
    const live = findById(elements, el.id);
    live.config.rows = (live.config.rows ?? []).filter(r => r.id !== rowId);
    await this.#saveStructure(elements);
  }

  /* Fenêtre d'édition d'une COLONNE de table. */
  async #openColumnDialog(tableEl, existing) {
    const isNew = !existing;
    const col = existing ?? {
      id: foundry.utils.randomID(), key: "", label: "",
      type: "text", playerVisible: true, locked: false
    };
    const L = (k) => game.i18n.localize(k);
    const typeOpt = (v, key) =>
      `<option value="${v}" ${col.type === v ? "selected" : ""}>${L(key)}</option>`;

    const content = `
      <div class="sbe-el-dialog">
        <div class="form-group">
          <label>${L("SBE.Template.ElType")}</label>
          <select name="ctype">
            ${typeOpt("text", "SBE.Template.Kind.text")}
            ${typeOpt("number", "SBE.Template.Kind.number")}
            ${typeOpt("checkbox", "SBE.Template.Kind.checkbox")}
            ${typeOpt("select", "SBE.Template.Kind.select")}
            ${typeOpt("computed", "SBE.Table.ColComputed")}
          </select>
        </div>
        <div class="form-group">
          <label>${L("SBE.Template.ElLabel")}</label>
          <input type="text" name="clabel" value="${foundry.utils.escapeHTML(col.label ?? "")}" placeholder="${L("SBE.Template.ElLabelPh")}">
        </div>
        <div class="form-group">
          <label>${L("SBE.Template.ElKey")}</label>
          <input type="text" name="ckey" value="${foundry.utils.escapeHTML(col.key ?? "")}" placeholder="${PH("ColKey")}">
          <p class="notes">${L("SBE.Table.ColKeyHint")}</p>
        </div>
        <div class="form-group">
          <label style="display:flex;align-items:center;gap:6px;">
            <input type="checkbox" name="cvisible" ${col.playerVisible !== false ? "checked" : ""}>
            ${L("SBE.Template.ElPlayerVisible")}
          </label>
        </div>
        <div class="form-group">
          <label style="display:flex;align-items:center;gap:6px;">
            <input type="checkbox" name="clocked" ${col.locked ? "checked" : ""}>
            ${L("SBE.Table.ColLocked")}
          </label>
          <p class="notes">${L("SBE.Table.ColLockedHint")}</p>
        </div>
        <div class="form-group">
          <label>${L("SBE.Table.ColWidth")}</label>
          <input type="number" name="cwidth" value="${col.width ?? ""}" min="20" step="1" style="width:90px;" placeholder="${L("SBE.Template.ImgAuto")}">
        </div>
        <hr>
        <div class="sbe-col-opts" data-ctype="number">
          <div class="form-group">
            <label style="display:flex;align-items:center;gap:6px;">
              <input type="checkbox" name="cinteger" ${col.integer !== false ? "checked" : ""}>
              ${L("SBE.Template.NumInteger")}
            </label>
          </div>
          <div class="form-group">
            <label>${L("SBE.Template.NumDecimals")}</label>
            <select name="cdecimals">
              ${[1, 2, 3].map(n => `<option value="${n}" ${Number(col.decimals ?? 2) === n ? "selected" : ""}>${n}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="sbe-col-opts" data-ctype="select">
          <div class="form-group">
            <label>${L("SBE.Template.SelChoices")}</label>
            <textarea name="cchoices" rows="4" placeholder="${L("SBE.Template.SelChoicesPh")}">${(Array.isArray(col.choices) ? col.choices : []).map(foundry.utils.escapeHTML).join("\n")}</textarea>
          </div>
        </div>
        <div class="sbe-col-opts" data-ctype="computed">
          <div class="form-group">
            <label>${L("SBE.Template.NumFormula")}</label>
            <input type="text" name="cformula" value="${foundry.utils.escapeHTML(col.formula ?? "")}" placeholder="${PH("ColFormula")}">
            <p class="notes">${L("SBE.Table.ColFormulaHint")}</p>
          </div>
        </div>

        <footer class="sbe-el-footer">
          <button type="button" class="sbe-el-validate">
            <i class="fa-solid fa-check"></i> ${L("SBE.Common.Validate")}
          </button>
          <button type="button" class="sbe-el-cancel">
            <i class="fa-solid fa-xmark"></i> ${L("SBE.Common.Cancel")}
          </button>
        </footer>
      </div>`;

    const trySave = async (root) => {
      const v = (n) => root.querySelector(`[name="${n}"]`);
      const type = v("ctype")?.value ?? "text";
      const key = (v("ckey")?.value ?? "").trim();
      if (!key || !KEY_RE.test(key)) {
        ui.notifications.error(L("SBE.Template.KeyInvalid"));
        return false;
      }
      const taken = (tableEl.config?.columns ?? []).some(c => c.key === key && c.id !== col.id);
      if (taken) {
        ui.notifications.error(game.i18n.format("SBE.Table.ColKeyTaken", { key }));
        return false;
      }
      const updated = {
        id: col.id, key, type,
        label: v("clabel")?.value?.trim() ?? "",
        playerVisible: !!v("cvisible")?.checked,
        locked: !!v("clocked")?.checked
      };
      const w = v("cwidth")?.value;
      if (w !== "" && w != null) updated.width = Math.max(20, Number(w));
      if (type === "number") {
        updated.integer = !!v("cinteger")?.checked;
        if (!updated.integer) updated.decimals = Number(v("cdecimals")?.value ?? 2);
      } else if (type === "select") {
        const choices = (v("cchoices")?.value ?? "").split("\n").map(s => s.trim()).filter(Boolean);
        if (!choices.length) {
          ui.notifications.error(L("SBE.Template.SelNeedsChoices"));
          return false;
        }
        updated.choices = choices;
      } else if (type === "computed") {
        const formula = (v("cformula")?.value ?? "").trim();
        const { validateFormula } = await import("./formula-engine.mjs");
        const err = validateFormula(formula);
        if (err) { ui.notifications.error(err); return false; }
        updated.formula = formula;
        updated.locked = true; /* une colonne calculée n'est jamais saisie */
      }

      const elements = foundry.utils.deepClone(this.document.system.elements);
      const live = findById(elements, tableEl.id);
      live.config.columns = Array.isArray(live.config.columns) ? live.config.columns : [];
      const idx = live.config.columns.findIndex(c => c.id === col.id);
      if (idx >= 0) live.config.columns[idx] = updated;
      else live.config.columns.push(updated);
      await this.#saveStructure(elements);
      return true;
    };

    const dlg = new foundry.applications.api.DialogV2({
      window: { title: L(isNew ? "SBE.Table.AddColumn" : "SBE.Table.EditColumn") },
      position: { width: 480 },
      classes: ["sbe-el-dialog-app", "sbe-condense"],
      content,
      buttons: [{ action: "cancel", label: L("SBE.Common.Cancel") }]
    });
    dlg.render({ force: true });

    const wire = () => {
      const root = dlg.element;
      if (!root) { setTimeout(wire, 30); return; }
      root.querySelector(".sbe-el-validate")?.addEventListener("click", async () => {
        const ok = await trySave(root).catch((err) => {
          console.warn("SBE | Colonne : enregistrement en échec", err);
          return false;
        });
        if (ok) dlg.close();
      });
      root.querySelector(".sbe-el-cancel")?.addEventListener("click", () => dlg.close());
      const typeSel = root.querySelector('[name="ctype"]');
      const sync = () => {
        for (const box of root.querySelectorAll(".sbe-col-opts")) {
          box.style.display = (box.dataset.ctype === typeSel?.value) ? "" : "none";
        }
      };
      typeSel?.addEventListener("change", sync);
      sync();
    };
    setTimeout(wire, 30);
  }

  /* ---------------------------------------------------------- */
  /*  Fenêtre d'édition d'élément (Base / Style)                 */
  /* ---------------------------------------------------------- */

  /* ---------------------------------------------------------- */
  /*  Bouton à ÉTAPES : éditeur                                  */
  /* ---------------------------------------------------------- */

  /** Toutes les clés de CE modèle (autocomplétion des étapes). */
  #templateKeyOptions() {
    const out = [];
    for (const el of walkElements(this.document.system.elements ?? [])) {
      if (!el?.key || el.kind === "button") continue;
      out.push(`<option value="${foundry.utils.escapeHTML(el.key)}">${foundry.utils.escapeHTML(el.label || el.key)}</option>`);
    }
    return out.join("");
  }

  /**
   * Une ligne d'étape. Mêmes champs pour tous les types ; seuls ceux
   * qui servent au type choisi s'affichent (cf. #syncStepRow).
   *   condition : formule + message
   *   consume   : source (champ | slot) + clé + quantité
   *   roll      : clé du champ à jet
   *   set       : clé + formule
   *   fill      : slot + limite (facultative)
   *   empty     : slot
   */
  #stepRowHTML(st = {}, { open = false } = {}) {
    const L = (k) => game.i18n.localize(k);
    const esc = (x) => foundry.utils.escapeHTML(String(x ?? ""));
    const type = STEP_TYPES.includes(st.type) ? st.type : "condition";
    const key = st.type === "consume" ? (st.from === "slot" ? st.slot : st.key)
      : ["fill", "empty", "useslot"].includes(st.type) ? st.slot : st.type === "pick" ? st.show : st.key;
    const val = st.type === "consume" ? st.amount : st.type === "fill" ? st.limit : st.type === "target" ? st.range : st.formula;
    const mode = SET_MODES.includes(st.mode) ? st.mode : "set";
    /* Un bloc s'ouvre d'office : ses étapes se voient. */
    if (BLOCK_TYPES.includes(type)) open = true;
    return `
      <div class="sbe-step${open ? " is-open" : ""}" data-type="${type}">
        <div class="sbe-step-line" data-cf-off>
          <span class="sbe-step-num"></span>
          <span class="sbe-step-tag"></span>
          <span class="sbe-step-sum"></span>
          <i class="fa-solid fa-chevron-down sbe-step-caret"></i>
          <span class="sbe-step-tools">
            <a class="sbe-step-up" data-tooltip-text="${L("SBE.Steps.Up")}"><i class="fa-solid fa-arrow-up"></i></a>
            <a class="sbe-step-down" data-tooltip-text="${L("SBE.Steps.Down")}"><i class="fa-solid fa-arrow-down"></i></a>
            <a class="sbe-step-del" data-tooltip-text="${L("SBE.Steps.Delete")}"><i class="fa-solid fa-trash"></i></a>
          </span>
        </div>
        <div class="sbe-step-body">
        <div class="sbe-step-head">
          <select class="sbe-step-type">
            ${STEP_TYPES.filter(t => t === type || !CAL_STEPS.includes(t) || CalendarManager.enabled()).map(t => `<option value="${t}" ${t === type ? "selected" : ""}>${L(`SBE.Steps.Type.${t}`)}</option>`).join("")}
          </select>
          <i class="fa-solid fa-circle-question sbe-help sbe-step-help"></i>
        </div>
        <div class="sbe-step-fields">
          <select class="sbe-step-from">
            <option value="key" ${st.from !== "slot" ? "selected" : ""}>${L("SBE.Steps.FromKey")}</option>
            <option value="slot" ${st.from === "slot" ? "selected" : ""}>${L("SBE.Steps.FromSlot")}</option>
            <option value="carrier" ${st.from === "carrier" ? "selected" : ""}>${L("SBE.Steps.FromCarrier")}</option>
            <option value="self" ${st.from === "self" ? "selected" : ""}>${L("SBE.Steps.FromSelf")}</option>
            <option value="picked" ${st.from === "picked" ? "selected" : ""}>${L("SBE.Steps.FromPicked")}</option>
          </select>
          <select class="sbe-step-settarget">
            <option value="item" ${!["carrier", "targets"].includes(st.target) ? "selected" : ""}>${L("SBE.Steps.SetOnItem")}</option>
            <option value="carrier" ${st.target === "carrier" ? "selected" : ""}>${L("SBE.Steps.SetOnCarrier")}</option>
            <option value="targets" ${st.target === "targets" ? "selected" : ""}>${L("SBE.Steps.SetOnTargets")}</option>
            <option value="picked" ${st.target === "picked" ? "selected" : ""}>${L("SBE.Steps.SetOnPicked")}</option>
            <option value="slot" ${st.target === "slot" ? "selected" : ""}>${L("SBE.Steps.SetOnSlot")}</option>
          </select>
          <input type="text" class="sbe-step-slotkey" list="sbe-stepkeys" value="${esc(st.type === "set" ? st.slot : "")}" placeholder="${esc(L("SBE.Steps.SetSlotPh"))}">
          <input type="text" class="sbe-step-usebtn" value="${esc(st.type === "useslot" ? st.button : "")}" placeholder="${esc(L("SBE.Steps.UseSlotButtonPh"))}" data-tooltip-text="${esc(L("SBE.Steps.UseSlotButton"))}">
          <select class="sbe-step-setmode">
            ${SET_MODES.map(m => `<option value="${m}" ${m === mode ? "selected" : ""}>${L(`SBE.Steps.Mode.${m}`)}</option>`).join("")}
          </select>
          <input type="text" class="sbe-step-key" list="sbe-stepkeys" value="${esc(key)}">
          <input type="text" class="sbe-step-val" value="${esc(val)}">
          <input type="text" class="sbe-step-msg" value="${esc(st.message)}" placeholder="${L("SBE.Steps.MessagePh")}">
          <select class="sbe-step-fxact">
            ${EFFECT_ACTIONS.map(a => `<option value="${a}" ${st.action === a ? "selected" : ""}>${L(`SBE.Steps.FxAction.${a}`)}</option>`).join("")}
          </select>
          <select class="sbe-step-fxtarget">
            <option value="self" ${st.target !== "targets" ? "selected" : ""}>${L("SBE.Steps.FxSelf")}</option>
            <option value="targets" ${st.target === "targets" ? "selected" : ""}>${L("SBE.Steps.FxTargets")}</option>
            <option value="mine" ${st.target === "mine" ? "selected" : ""}>${L("SBE.Steps.FxMine")}</option>
          </select>
          <select class="sbe-step-mediamode">
            ${["both", "sound", "anim"].map(m => `<option value="${m}" ${(st.mode || "both") === m ? "selected" : ""}>${L(`SBE.Steps.MediaMode.${m}`)}</option>`).join("")}
          </select>
        </div>
        <div class="sbe-step-landbox">
          ${[["onHit", "LandHit"], ["onMiss", "LandMiss"]].map(([f, k]) => `
          <label class="sbe-step-atk-field">
            <span>${L(`SBE.Steps.${k}`)}</span>
            <input type="text" class="sbe-step-land-${f}" list="sbe-stepland" value="${esc(st.type === "land" ? st[f] : "")}" placeholder="${esc(L(`SBE.Steps.${k}Ph`))}">
          </label>`).join("")}
        </div>
        ${this.#questBoxHTML(st)}
        ${this.#levelBoxHTML(st)}
        ${this.#askBoxHTML(st)}
        <div class="sbe-step-signalbox">
          <label class="sbe-step-atk-field"><span>${L("SBE.Auto.SignalName")}</span>
            <input type="text" class="sbe-step-sig-name" value="${esc(st.type === "signal" ? st.name : "")}" placeholder="${esc(L("SBE.Auto.SignalPh"))}"></label>
          <label class="sbe-step-atk-field"><span>${L("SBE.Auto.SignalTo")}</span>
            <select class="sbe-step-sig-to">${["self", "targets", "scene"].map(t => `<option value="${t}" ${st.type === "signal" && (st.to ?? "self") === t ? "selected" : ""}>${L(`SBE.Auto.SignalToOpt.${t}`)}</option>`).join("")}</select></label>
        </div>
        <div class="sbe-step-resistbox">
          <label class="sbe-step-atk-field"><span>${L("SBE.Steps.ResistAdv")}</span>
            <select class="sbe-step-rs-adv">${["", "adv", "dis"].map(t => `<option value="${t}" ${st.type === "resist" && (st.adv ?? "") === t ? "selected" : ""}>${L(`SBE.Steps.ResistAdvOpt.${t || "none"}`)}</option>`).join("")}</select></label>
        </div>
        <div class="sbe-step-tablebox">
          <label class="sbe-step-atk-field"><span>${L("SBE.Steps.Table")}</span>
            <select class="sbe-step-table">${this.#tableOptions(st.type === "table" ? st.table : "")}</select></label>
          <label class="sbe-tc-check"><input type="checkbox" class="sbe-step-table-give" ${st.type === "table" && st.give ? "checked" : ""}> ${L("SBE.Steps.TableGive")}</label>
          <label class="sbe-tc-check"><input type="checkbox" class="sbe-step-table-chat" ${st.type === "table" && st.chat ? "checked" : ""}> ${L("SBE.Steps.TableChat")}</label>
        </div>
        ${this.#sceneBoxHTML(st)}
        ${this.#calBoxHTML(st)}
        ${this.#targetBoxHTML(st)}
        ${this.#placeBoxHTML(st)}
        ${this.#craftBoxHTML(st)}
        <div class="sbe-step-waitbox">
          ${[["rounds", "WaitRounds"], ["minutes", "WaitMinutes"], ["formula", "WaitInterrupt"]].map(([f, k]) => `
          <label class="sbe-step-atk-field">
            <span>${L(`SBE.Steps.${k}`)}</span>
            <input type="text" class="sbe-step-wait-${f}" list="sbe-stepactorkeys" value="${esc(st.type === "wait" ? st[f] : "")}" placeholder="${esc(L(`SBE.Steps.${k}Ph`))}">
          </label>`).join("")}
        </div>
        <label class="sbe-step-onlyif-box">
          <span>${L("SBE.Steps.OnlyIf")}</span>
          <input type="text" class="sbe-step-onlyif" value="${esc(st.onlyIf)}" placeholder="${esc(L("SBE.Steps.OnlyIfPh"))}">
        </label>
        <div class="sbe-step-atkbox">
          <div class="sbe-step-atk">
            <label class="sbe-step-atk-field">
              <span>${L("SBE.Steps.Atk.Profile")}</span>
              <select class="sbe-step-atk-profile">
                <option value="">${L("SBE.Steps.Atk.NoProfile")}</option>
                ${CombatManager.getConfig().profiles.map(p => `<option value="${esc(p.name)}" ${String(st.profile ?? "").toLowerCase() === p.name.toLowerCase() ? "selected" : ""}>${esc(p.name)}</option>`).join("")}
                ${st.profile && !CombatManager.getConfig().profiles.some(p => p.name.toLowerCase() === String(st.profile).toLowerCase()) ? `<option value="${esc(st.profile)}" selected>⚠ ${esc(st.profile)}</option>` : ""}
              </select>
            </label>
            ${[["damage", "Damage"], ["range", "Range"], ["hits", "Hits"]].map(([f, k]) => `
            <label class="sbe-step-atk-field">
              <span>${L(`SBE.Steps.Atk.${k}`)}</span>
              <input type="text" class="sbe-step-atk-${f}" list="sbe-stepkeys" value="${esc(st[f])}" placeholder="${esc(L(`SBE.Steps.Atk.${k}Ph`))}">
            </label>`).join("")}
          </div>
          <p class="notes">${L("SBE.Steps.Atk.ProfileHint")}</p>
          <div class="sbe-step-atk">
            ${[["mediaShot", "MediaShot"], ["mediaHit", "MediaHit"], ["mediaMiss", "MediaMiss"], ["mediaCrit", "MediaCrit"]].map(([f, k]) => `
            <label class="sbe-step-atk-field">
              <span>${L(`SBE.Steps.Atk.${k}`)}</span>
              <input type="text" class="sbe-step-atk-${f}" list="sbe-stepmedia" value="${esc(st[f])}" placeholder="${esc(L("SBE.Steps.Atk.MediaPh"))}">
            </label>`).join("")}
            ${[["mediaRepeat", "MediaRepeat"], ["mediaInterval", "MediaInterval"]].map(([f, k]) => `
            <label class="sbe-step-atk-field">
              <span>${L(`SBE.Steps.Atk.${k}`)}</span>
              <input type="text" class="sbe-step-atk-${f}" list="sbe-stepkeys" value="${esc(st[f])}" placeholder="${esc(L(`SBE.Steps.Atk.${k}Ph`))}">
            </label>`).join("")}
          </div>
          <p class="notes">${L("SBE.Steps.Atk.MediaHint")}</p>
          <details class="sbe-step-adv" ${CombatManager.PROFILE_FIELDS.some(f => String(st[f] ?? "").trim()) || st.options?.length ? "open" : ""}>
            <summary>${L("SBE.Steps.Atk.Advanced")}</summary>
            <p class="notes">${L("SBE.Steps.Atk.AdvancedHint")}</p>
            ${profileFieldsHtml(st, { inherit: true })}
          </details>
        </div>
        ${BLOCK_TYPES.includes(type) ? this.#blockBoxHTML(st) : ""}
        </div>
      </div>`;
  }

  /**
   * Branches d'un bloc (« Si… alors… sinon… », « Selon le résultat ») :
   * chacune une liste d'étapes. Les deux sortes sont posées ensemble
   * (changer de sorte ne perd rien) ; seule celle du type se voit.
   */
  #blockBoxHTML(st = {}) {
    const L = (k) => game.i18n.localize(k);
    return BLOCK_TYPES.map(kind => `
        <div class="sbe-step-blockbox" data-kind="${kind}">
          ${BLOCK_BRANCHES[kind].map(b => `
          <div class="sbe-branch" data-branch="${b}">
            <div class="sbe-branch-head">${L(`SBE.Steps.Branch.${b}`)}</div>
            <div class="sbe-steps-list">${(st.type === kind && Array.isArray(st[b]) ? st[b] : []).map(x => this.#stepRowHTML(x)).join("")}</div>
            <a class="sbe-branch-add"><i class="fa-solid fa-plus"></i> ${L("SBE.Steps.Add")}</a>
          </div>`).join("")}
        </div>`).join("");
  }

  /** Tables aléatoires du monde (étape « Table aléatoire »). */
  #tableOptions(sel = "") {
    const esc = (x) => foundry.utils.escapeHTML(String(x ?? ""));
    const list = [...(game.tables ?? [])].sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
    const known = !sel || list.some(t => t.id === sel);
    return `<option value="">${esc(game.i18n.localize("SBE.Steps.TableNone"))}</option>`
      + (known ? "" : `<option value="${esc(sel)}" selected>${esc(game.i18n.localize("SBE.Steps.TableGone"))}</option>`)
      + list.map(t => `<option value="${t.id}" ${t.id === sel ? "selected" : ""}>${esc(t.name)}</option>`).join("");
  }

  /** Les branches d'un bloc (la sorte voulue), étapes directes. */
  #branchRows(row, kind, branch) {
    const list = row.querySelector(`:scope > .sbe-step-body > .sbe-step-blockbox[data-kind="${kind}"] > .sbe-branch[data-branch="${branch}"] > .sbe-steps-list`);
    return list ? [...list.children].filter(c => c.classList.contains("sbe-step")) : [];
  }

  /** Clés et variables connues (valeurs écrites sans guillemets). */
  #condKnown(el) {
    const scope = el.closest(".sbe-btn-steps-opts") ?? el.ownerDocument;
    const out = new Set(STEP_VARS);
    for (const o of scope.querySelectorAll("#sbe-stepkeys option, #sbe-stepactorkeys option")) if (o.value) out.add(o.value);
    for (const i of scope.querySelectorAll(".sbe-ask-key")) if (i.value.trim()) out.add(i.value.trim());
    return [...out];
  }

  /** Pose l'éditeur de conditions en phrases sur un champ (une fois). */
  #condAttach(input, list = "sbe-stepkeys") {
    if (!input) return;
    attachCondEditor(input, { known: () => this.#condKnown(input), list, advanced: condAdvanced() });
  }

  /** Champs des étapes « Retirer des objets » et « Donner des objets ». */
  #craftBoxHTML(st = {}) {
    const L = (k) => game.i18n.localize(k);
    const esc = (x) => foundry.utils.escapeHTML(String(x ?? ""));
    const sel = (a, b) => (a === b ? "selected" : "");
    const items = (game.items?.filter(i => i.type === "objet") ?? []).sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
    const opts = (cur) => `<option value="">—</option>` + items.map(i => `<option value="${i.id}" ${sel(cur, i.id)}>${esc(i.name)}</option>`).join("")
      + (cur && !items.some(i => i.id === cur) ? `<option value="${esc(cur)}" selected>⚠ ${esc(L("SBE.Steps.GiveMissing"))}</option>` : "");
    const isTake = st.type === "take", isGive = st.type === "give";
    return `
        <div class="sbe-step-takebox sbe-step-craftbox">
          <label class="sbe-step-atk-field"><span>${L("SBE.Steps.Craft.What")}</span>
            <select class="sbe-step-take-mode">
              <option value="item" ${sel(isTake ? st.mode ?? "item" : "item", "item")}>${L("SBE.Steps.Craft.ByItem")}</option>
              <option value="filter" ${sel(isTake ? st.mode : "", "filter")}>${L("SBE.Steps.Craft.ByFilter")}</option>
              <option value="formula" ${sel(isTake ? st.mode : "", "formula")}>${L("SBE.Steps.Craft.ByFormula")}</option>
            </select></label>
          <label class="sbe-step-atk-field sbe-step-take-itembox"><span>${L("SBE.Steps.Craft.Item")}</span>
            <select class="sbe-step-take-item">${opts(isTake ? st.item : "")}</select></label>
          <label class="sbe-step-atk-field sbe-step-take-filterbox"><span>${L("SBE.Steps.Craft.Filter")}</span>
            <input type="text" class="sbe-step-take-filter" value="${esc(isTake ? st.filter : "")}" placeholder="${PH("TakeFilter")}"></label>
          <label class="sbe-step-atk-field sbe-step-take-formulabox"><span>${L("SBE.Steps.Craft.Formula")}</span>
            <input type="text" class="sbe-step-take-formula" value="${esc(isTake ? st.formula : "")}" placeholder="${PH("TakeFormula")}"></label>
          <label class="sbe-step-atk-field"><span>${L("SBE.Steps.Craft.Amount")}</span>
            <input type="text" class="sbe-step-take-amount" list="sbe-stepactorkeys" value="${esc(isTake ? st.amount : "")}" placeholder="1"></label>
          <label class="sbe-tc-check sbe-step-take-checkbox"><input type="checkbox" class="sbe-step-take-check" ${isTake && st.check ? "checked" : ""}> ${L("SBE.Steps.Craft.CheckOnly")}</label>
          <label class="sbe-tc-check sbe-step-take-partialbox"><input type="checkbox" class="sbe-step-take-partial" ${isTake && st.partial ? "checked" : ""}> ${L("SBE.Steps.Craft.Partial")}</label>
        </div>
        <div class="sbe-step-rollbox sbe-step-craftbox">
          <label class="sbe-step-atk-field"><span>${L("SBE.Steps.RollWho")}</span>
            <select class="sbe-step-roll-who">
              <option value="item" ${sel(st.type === "roll" ? st.who ?? "item" : "item", "item")}>${L("SBE.Steps.RollOnItem")}</option>
              <option value="carrier" ${sel(st.type === "roll" ? st.who : "", "carrier")}>${L("SBE.Steps.RollOnCarrier")}</option>
            </select></label>
          <label class="sbe-step-atk-field"><span>${L("SBE.Steps.RollDifficulty")}</span>
            <input type="text" class="sbe-step-roll-diff" value="${esc(st.type === "roll" ? st.difficulty : "")}" placeholder="0"></label>
        </div>
        <div class="sbe-step-pickbox sbe-step-craftbox">
          <label class="sbe-step-atk-field"><span>${L("SBE.Steps.PickFrom")}</span>
            <select class="sbe-step-pick-from">
              <option value="inventory" ${sel(st.type === "pick" ? st.from ?? "inventory" : "inventory", "inventory")}>${L("SBE.Steps.PickFromInventory")}</option>
              <option value="list" ${sel(st.type === "pick" ? st.from : "", "list")}>${L("SBE.Steps.PickFromList")}</option>
            </select></label>
          <label class="sbe-step-atk-field sbe-step-pick-listbox"><span>${L("SBE.Steps.PickList")}</span>
            <input type="text" class="sbe-step-pick-list" list="sbe-stepkeys" value="${esc(st.type === "pick" ? st.list : "")}" placeholder="${PH("PickList")}"></label>
          <label class="sbe-tc-check sbe-step-pick-ownedbox"><input type="checkbox" class="sbe-step-pick-owned" ${st.type === "pick" && st.owned ? "checked" : ""}> ${L("SBE.Steps.PickOwned")}</label>
        </div>
        <div class="sbe-step-givebox sbe-step-craftbox">
          <label class="sbe-step-atk-field"><span>${L("SBE.Steps.Craft.What")}</span>
            <select class="sbe-step-give-mode">
              <option value="item" ${sel(isGive ? st.mode ?? "item" : "item", "item")}>${L("SBE.Steps.Craft.ByItem")}</option>
              <option value="formula" ${sel(isGive ? st.mode : "", "formula")}>${L("SBE.Steps.Craft.ByFormula")}</option>
            </select></label>
          <label class="sbe-step-atk-field sbe-step-give-itembox"><span>${L("SBE.Steps.Craft.Item")}</span>
            <select class="sbe-step-give-item">${opts(isGive ? st.item : "")}</select></label>
          <label class="sbe-step-atk-field sbe-step-give-formulabox"><span>${L("SBE.Steps.Craft.Formula")}</span>
            <input type="text" class="sbe-step-give-formula" value="${esc(isGive ? st.formula : "")}" placeholder="${PH("GiveFormula")}"></label>
          <label class="sbe-step-atk-field"><span>${L("SBE.Steps.Craft.Amount")}</span>
            <input type="text" class="sbe-step-give-amount" list="sbe-stepactorkeys" value="${esc(isGive ? st.amount : "")}" placeholder="1"></label>
          <label class="sbe-step-atk-field"><span>${L("SBE.Steps.Craft.Where")}</span>
            <input type="text" class="sbe-step-give-where" list="sbe-stepactorkeys" value="${esc(isGive ? st.where : "")}" placeholder="${PH("GiveWhere")}"></label>
        </div>`;
  }

  /** Champs de l'étape « Placer » : l'objet, des créatures (invocation), ou les renvoyer. */
  #placeBoxHTML(st = {}) {
    const L = (k) => game.i18n.localize(k);
    const esc = (x) => foundry.utils.escapeHTML(String(x ?? ""));
    const isP = st.type === "place";
    const what = isP && ["creature", "dismiss"].includes(st.what) ? st.what : "item";
    const v = (f) => (isP ? st[f] ?? "" : "");
    const sel = (a, b) => (a === b ? "selected" : "");
    const actors = (game.actors?.contents ?? []).filter(a => a.type === "personnage")
      .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
    const actorOpts = (none) => `${none ? `<option value="">${esc(L(none))}</option>` : ""}${actors.map(a => `<option value="${esc(a.id)}" ${sel(v("actor"), a.id)}>${esc(a.name)}</option>`).join("")}`
      + (v("actor") && !actors.some(a => a.id === v("actor")) ? `<option value="${esc(v("actor"))}" selected>⚠ ${esc(L("SBE.Summon.Missing"))}</option>` : "");
    return `
        <div class="sbe-step-placebox">
          <label class="sbe-step-atk-field"><span>${L("SBE.Summon.What")}</span>
            <select class="sbe-step-pl-what">${["item", "creature", "dismiss"].map(w => `<option value="${w}" ${sel(what, w)}>${L(`SBE.Summon.What_${w}`)}</option>`).join("")}</select></label>
          <label class="sbe-step-atk-field sbe-step-pl-actorbox"><span>${L("SBE.Summon.Actor")}</span>
            <select class="sbe-step-pl-actor sbe-step-pl-c">${actorOpts("")}</select>
            <select class="sbe-step-pl-actor sbe-step-pl-d">${actorOpts("SBE.Summon.All")}</select></label>
          <div class="sbe-step-pl-creature">
            <label class="sbe-step-atk-field"><span>${L("SBE.Summon.Count")}</span>
              <input type="text" class="sbe-step-pl-count" value="${esc(v("count"))}" placeholder="1"></label>
            <label class="sbe-step-atk-field"><span>${L("SBE.Summon.Control")}</span>
              <select class="sbe-step-pl-control">${["caster", "gm"].map(c => `<option value="${c}" ${sel(v("control") || "caster", c)}>${L(`SBE.Summon.Control_${c}`)}</option>`).join("")}</select></label>
            <label class="sbe-step-atk-field"><span>${L("SBE.Summon.Rounds")}</span>
              <input type="text" class="sbe-step-pl-rounds" value="${esc(v("rounds"))}" placeholder="—"></label>
            <label class="sbe-step-atk-field"><span>${L("SBE.Summon.Minutes")}</span>
              <input type="text" class="sbe-step-pl-minutes" value="${esc(v("minutes"))}" placeholder="—"></label>
            <label class="sbe-step-atk-field"><span>${L("SBE.Summon.Init")}</span>
              <select class="sbe-step-pl-init">${["caster", "roll"].map(c => `<option value="${c}" ${sel(v("init") || "caster", c)}>${L(`SBE.Summon.Init_${c}`)}</option>`).join("")}</select></label>
            <label class="sbe-step-atk-field"><span>${L("SBE.Summon.OnZero")}</span>
              <select class="sbe-step-pl-zero">${["remove", "stay"].map(c => `<option value="${c}" ${sel(v("onZero") || "remove", c)}>${L(`SBE.Summon.OnZero_${c}`)}</option>`).join("")}</select></label>
            <label class="sbe-step-atk-field"><span>${L("SBE.Summon.WhileEffect")}</span>
              <input type="text" class="sbe-step-pl-while" list="sbe-stepfx" value="${esc(v("whileEffect"))}" placeholder="—"></label>
            <label class="sbe-tc-check"><input type="checkbox" class="sbe-step-pl-down" ${isP && st.casterDown ? "checked" : ""}> ${L("SBE.Summon.CasterDown")}</label>
            <p class="notes">${L("SBE.Summon.Hint")}</p>
            <div class="sbe-step-pl-vals">
              <span class="sbe-step-atk-field"><span>${L("SBE.Summon.Values")}</span></span>
              <p class="notes">${L("SBE.Summon.ValuesHint")}</p>
              <div class="sbe-step-pl-vlist">${(isP && Array.isArray(st.values) ? st.values : []).map(x => this.#summonValueHTML(x)).join("")}</div>
              <a class="sbe-step-pl-vadd"><i class="fa-solid fa-plus"></i> ${L("SBE.Summon.ValueAdd")}</a>
            </div>
          </div>
        </div>`;
  }

  /** Une valeur écrite sur la créature invoquée : clé, écriture, formule. */
  #summonValueHTML(x = {}) {
    const L = (k) => game.i18n.localize(k);
    const esc = (v) => foundry.utils.escapeHTML(String(v ?? ""));
    return `<div class="sbe-step-pl-vrow">
      <label class="sbe-step-atk-field"><span>${L("SBE.Summon.ValueKey")}</span>
        <input type="text" class="sbe-step-pl-vkey" list="sbe-stepactorkeys" value="${esc(x.key)}" placeholder="${esc(L("SBE.Summon.ValueKeyPh"))}"></label>
      <label class="sbe-step-atk-field"><span>${L("SBE.Summon.ValueMode")}</span>
        <select class="sbe-step-pl-vmode">${["set", "add", "sub"].map(m => `<option value="${m}" ${(x.mode || "set") === m ? "selected" : ""}>${L(`SBE.Steps.Mode.${m}`)}</option>`).join("")}</select></label>
      <label class="sbe-step-atk-field"><span>${L("SBE.Summon.ValueFormula")}</span>
        <input type="text" class="sbe-step-pl-vf" list="sbe-stepkeys" value="${esc(x.formula)}" placeholder="${esc(L("SBE.Summon.ValueFormulaPh"))}"></label>
      <a class="sbe-step-pl-vdel" data-tooltip-text="${esc(L("SBE.Common.Delete"))}"><i class="fa-solid fa-trash"></i></a>
    </div>`;
  }

  /** Champs de l'étape « Scène » : action, ce qu'elle fait, groupe de liens. */
  #sceneBoxHTML(st = {}) {
    const L = (k) => game.i18n.localize(k);
    const esc = (x) => foundry.utils.escapeHTML(String(x ?? ""));
    const isS = st.type === "scene";
    const act = isS && SCENE_ACTIONS[st.action] ? st.action : "door";
    const ops = [...new Set(Object.values(SCENE_ACTIONS).flatMap(a => a.ops))];
    return `
        <div class="sbe-step-scenebox">
          <label class="sbe-step-atk-field"><span>${L("SBE.Scene.Action")}</span>
            <select class="sbe-step-sc-action">
              ${Object.keys(SCENE_ACTIONS).map(a => `<option value="${a}" ${a === act ? "selected" : ""}>${L(`SBE.Scene.Act.${a}`)}</option>`).join("")}
            </select></label>
          <label class="sbe-step-atk-field sbe-step-sc-opbox"><span>${L("SBE.Scene.Op")}</span>
            <select class="sbe-step-sc-op">
              ${ops.map(o => `<option value="${o}" ${isS && st.op === o ? "selected" : ""}>${L(`SBE.Scene.OpName.${o}`)}</option>`).join("")}
            </select></label>
          <label class="sbe-step-atk-field"><span>${L("SBE.Scene.Group")}</span>
            <input type="text" class="sbe-step-sc-group" value="${esc(isS ? st.group : "")}" placeholder="${esc(L("SBE.Scene.GroupStepPh"))}"></label>
        </div>`;
  }

  /** Choisir une cible : qui peut être visé, et « Seulement si » lu sur la fiche de la cible. */
  #targetBoxHTML(st = {}) {
    const L = (k) => game.i18n.localize(k);
    const esc = (x) => foundry.utils.escapeHTML(String(x ?? ""));
    const isT = st.type === "target";
    const cur = isT ? st.who ?? "all" : "all";
    return `
        <div class="sbe-step-targetbox">
          <label class="sbe-step-atk-field"><span>${L("SBE.Steps.TargetWho")}</span>
            <select class="sbe-step-tg-who">${TOUCH_MODES.map(m => `<option value="${m}" ${m === cur ? "selected" : ""}>${L(`SBE.PZone.Touch_${m}`)}</option>`).join("")}</select></label>
          <label class="sbe-step-atk-field"><span>${L("SBE.Steps.TargetIf")}</span>
            <input type="text" class="sbe-step-tg-if" value="${esc(isT ? st.targetIf : "")}" placeholder="${esc(L("SBE.Ph.TargetIf"))}"></label>
          <label class="sbe-step-atk-field"><span>${L("SBE.Steps.TargetMsg")}</span>
            <input type="text" class="sbe-step-tg-msg" value="${esc(isT ? st.targetMsg : "")}" placeholder="${esc(L("SBE.Ph.TargetMsg"))}"></label>
        </div>`;
  }

  /**
   * Champs des étapes du calendrier.
   *   Temps  : avancer / reculer (durée + unité), prochain / précédent
   *            moment, fixer (heure, jour, mois, année ; vide = inchangé),
   *            garder la météo actuelle.
   *   Météo, Saison : décidée (une clé, une durée ; vide = sans fin) ou naturelle.
   */
  #calBoxHTML(st = {}) {
    const L = (k) => game.i18n.localize(k);
    const esc = (x) => foundry.utils.escapeHTML(String(x ?? ""));
    const sel = (cur, v) => (cur === v ? "selected" : "");
    const f = (cls, label, inner) => `<label class="sbe-step-atk-field ${cls}"><span>${L(label)}</span>${inner}</label>`;
    const isT = st.type === "time", isI = st.type === "weather" || st.type === "season" || st.type === "moon";
    const units = (cls, cur) => `<select class="${cls}">${TIME_UNITS.map(u => `<option value="${u}" ${sel(cur || "hour", u)}>${L(`SBE.Steps.Cal.Unit.${u}`)}</option>`).join("")}</select>`;
    const cal = CalendarManager.enabled() ? CalendarManager.calendar() : null;
    const types = CalendarManager.enabled() ? CalendarManager.weatherTypes() : [];
    const wxOpts = types.map(t => `<option value="${esc(t.key)}" ${sel(st.type === "weather" ? st.key : "", t.key)}>${esc(t.icon)} ${esc(t.name)}</option>`).join("");
    const seOpts = (cal?.seasons ?? []).map(x => `<option value="${esc(x.key)}" ${sel(st.type === "season" ? st.key : "", x.key)}>${esc(x.icon)} ${esc(x.name)}</option>`).join("");
    const moons = cal?.moons ?? [];
    const phOpts = moons.map(m => `<optgroup label="${esc(m.name)}">${m.phases.map(p => {
      const val = `${m.key}:${p.key}`;
      return `<option value="${esc(val)}" ${sel(st.type === "moon" ? `${st.moon}:${st.key}` : "", val)}>${esc(p.icon)} ${esc(p.name)}</option>`;
    }).join("")}</optgroup>`).join("");
    const moonOpts = moons.map(m => `<option value="${esc(m.key)}" ${sel(st.type === "moon" ? st.moon : "", m.key)}>${esc(m.name)}</option>`).join("");
    const v = (k) => esc(isT ? st[k] : "");
    return `
        <div class="sbe-step-timebox">
          ${f("", "SBE.Steps.Cal.Action", `<select class="sbe-step-tm-action">${TIME_ACTIONS.map(a => `<option value="${a}" ${sel(isT ? st.action : "advance", a)}>${L(`SBE.Steps.Cal.TimeAct.${a}`)}</option>`).join("")}</select>`)}
          ${f("sbe-step-tm-amountbox", "SBE.Steps.Cal.Amount", `<span class="sbe-step-pair"><input type="text" class="sbe-step-tm-amount" value="${v("amount")}" placeholder="${esc(L("SBE.Steps.Cal.AmountPh"))}">${units("sbe-step-tm-unit", isT ? st.unit : "")}</span>`)}
          ${f("sbe-step-tm-partbox", "SBE.Steps.Cal.Part", `<select class="sbe-step-tm-part">${TIME_PARTS.map(p => `<option value="${p}" ${sel(isT ? st.part : "dawn", p)}>${L(`SBE.Steps.Cal.PartOpt.${p}`)}</option>`).join("")}</select>`)}
          <div class="sbe-step-tm-setbox">
            ${f("", "SBE.Steps.Cal.Hour", `<input type="text" class="sbe-step-tm-hour" value="${isT && st.hour !== undefined && st.hour !== "" ? `${st.hour}:${String(st.minute ?? 0).padStart(2, "0")}` : ""}" placeholder="${esc(L("SBE.Steps.Cal.HourPh"))}">`)}
            ${f("", "SBE.Steps.Cal.Day", `<input type="number" min="1" class="sbe-step-tm-day" value="${v("day")}" placeholder="—">`)}
            ${f("", "SBE.Steps.Cal.Month", `<input type="number" min="1" class="sbe-step-tm-month" value="${v("month")}" placeholder="—">`)}
            ${f("", "SBE.Steps.Cal.Year", `<input type="number" class="sbe-step-tm-year" value="${v("year")}" placeholder="—">`)}
            <p class="notes">${L("SBE.Steps.Cal.SetHint")}</p>
          </div>
          <label class="sbe-tc-check"><input type="checkbox" class="sbe-step-tm-keep" ${isT && st.keepWeather ? "checked" : ""}> ${L("SBE.Steps.Cal.KeepWeather")}</label>
        </div>
        <div class="sbe-step-impbox">
          ${f("", "SBE.Steps.Cal.Mode", `<select class="sbe-step-im-mode">${IMPOSE_MODES.map(m => `<option value="${m}" ${sel(isI ? st.mode : "decided", m)}>${L(`SBE.Steps.Cal.ModeOpt.${m}`)}</option>`).join("")}</select>`)}
          ${f("sbe-step-im-wxbox", "SBE.Steps.Cal.WeatherKey", `<select class="sbe-step-im-wx">${wxOpts}</select>`)}
          ${f("sbe-step-im-sebox", "SBE.Steps.Cal.SeasonKey", `<select class="sbe-step-im-se">${seOpts}</select>`)}
          ${f("sbe-step-im-phbox", "SBE.Steps.Cal.PhaseKey", `<select class="sbe-step-im-ph">${phOpts}</select>`)}
          ${f("sbe-step-im-moonbox", "SBE.Steps.Cal.MoonKey", `<select class="sbe-step-im-moon">${moonOpts}</select>`)}
          ${f("sbe-step-im-durbox", "SBE.Steps.Cal.Duration", `<span class="sbe-step-pair"><input type="text" class="sbe-step-im-amount" value="${esc(isI ? st.amount : "")}" placeholder="${esc(L("SBE.Steps.Cal.DurationPh"))}">${units("sbe-step-im-unit", isI ? st.unit : "")}</span>`)}
        </div>`;
  }

  /** Volet « Se lance tout seul » d'un bouton à étapes (déclencheurs d'actions). */
  #autoBoxHTML(a = {}) {
    const L = (k) => game.i18n.localize(k);
    const esc = (x) => foundry.utils.escapeHTML(String(x ?? ""));
    const on = Array.isArray(a.on) ? a.on : [];
    const isItem = this.document.documentName === "Item";
    const f = (cls, label, inner) => `<label class="sbe-step-atk-field ${cls}"><span>${L(label)}</span>${inner}</label>`;
    return `
      <details class="sbe-btn-auto" ${on.length ? "open" : ""}>
        <summary>${L("SBE.Auto.Title")}</summary>
        <p class="notes">${L("SBE.Auto.Hint")}</p>
        <div class="sbe-auto-events">${AUTO_EVENTS.filter(e => isItem || !["equip", "unequip", "gain"].includes(e)).map(e => `
          <label><input type="checkbox" class="sbe-auto-on" value="${e}" ${on.includes(e) ? "checked" : ""}> ${L(`SBE.Auto.Ev.${e}`)}</label>`).join("")}</div>
        <div class="sbe-auto-fields">
          ${f("sbe-auto-if-becomes", "SBE.Auto.Formula", `<input type="text" class="sbe-auto-formula" list="sbe-stepkeys" value="${esc(a.formula)}" placeholder="${esc(L("SBE.Auto.FormulaPh"))}">`)}
          ${f("sbe-auto-if-effect", "SBE.Auto.Effect", `<input type="text" class="sbe-auto-effect" list="sbe-stepfx" value="${esc(a.effect)}" placeholder="${esc(L("SBE.Auto.EffectPh"))}">`)}
          ${f("sbe-auto-if-effcat", "SBE.Auto.EffectCategory", `<input type="text" class="sbe-auto-effcat" list="sbe-stepfxcat" value="${esc(a.effectCategory)}" placeholder="${esc(L("SBE.Auto.EffectCategoryPh"))}">`)}
          ${f("sbe-auto-if-signal", "SBE.Auto.Signal", `<input type="text" class="sbe-auto-signal" value="${esc(a.signal)}" placeholder="${esc(L("SBE.Auto.SignalPh"))}">`)}
          ${f("sbe-auto-if-drop", "SBE.Auto.WatchKey", `<input type="text" class="sbe-auto-watchkey" list="sbe-stepactorkeys" value="${esc(a.watchKey)}" placeholder="${esc(L("SBE.Auto.WatchKeyPh"))}">`)}
          ${f("sbe-auto-if-drop", "SBE.Auto.NewDrop", `<input type="text" class="sbe-auto-newdrop" list="sbe-stepkeys" value="${esc(a.newDrop)}" placeholder="${esc(L("SBE.Auto.NewDropPh"))}">`)}
          <p class="notes sbe-auto-if-drop">${L("SBE.Auto.DropHint")}</p>
          ${isItem ? f("", "SBE.Auto.Scope", `<select class="sbe-auto-scope">${AUTO_SCOPES.map(x => `<option value="${x}" ${(a.scope ?? "carried") === x ? "selected" : ""}>${L(`SBE.Auto.ScopeOpt.${x}`)}</option>`).join("")}</select>`) : ""}
          ${f("", "SBE.Auto.Freq", `<select class="sbe-auto-freq">${AUTO_FREQS.map(x => `<option value="${x}" ${(a.freq ?? "each") === x ? "selected" : ""}>${L(`SBE.Auto.FreqOpt.${x}`)}</option>`).join("")}</select>`)}
          ${f("", "SBE.Auto.OnlyIf", `<input type="text" class="sbe-auto-onlyif" list="sbe-stepkeys" value="${esc(a.onlyIf)}" placeholder="${esc(L("SBE.Auto.OnlyIfPh"))}">`)}
          <label class="sbe-auto-askbox"><input type="checkbox" class="sbe-auto-ask" ${a.ask ? "checked" : ""}> ${L("SBE.Auto.AskFirst")}</label>
        </div>
      </details>`;
  }

  /** Lit le volet « Se lance tout seul » (null = formule invalide). */
  #readAuto(root) {
    const box = root.querySelector(".sbe-btn-auto");
    if (!box) return undefined;
    const on = [...box.querySelectorAll(".sbe-auto-on:checked")].map(i => i.value).filter(e => AUTO_EVENTS.includes(e));
    if (!on.length) return undefined;
    const v = (c) => box.querySelector(c)?.value.trim() ?? "";
    const out = { on };
    for (const [k, c, formula] of [["formula", ".sbe-auto-formula", true], ["onlyIf", ".sbe-auto-onlyif", true], ["effect", ".sbe-auto-effect"], ["effectCategory", ".sbe-auto-effcat"], ["signal", ".sbe-auto-signal"],
      ...(on.includes("beforeDrop") ? [["watchKey", ".sbe-auto-watchkey"], ["newDrop", ".sbe-auto-newdrop", true]] : [])]) {
      const x = v(c);
      if (!x) continue;
      if (formula) {
        const err = validateFormula(x);
        if (err) { ui.notifications.error(`${game.i18n.localize("SBE.Auto.Title")} : ${err}`); return null; }
      }
      out[k] = x;
    }
    if (on.includes("becomes") && !out.formula) { ui.notifications.error(game.i18n.localize("SBE.Auto.NeedFormula")); return null; }
    if (on.includes("signal") && !out.signal) { ui.notifications.error(game.i18n.localize("SBE.Auto.NeedSignal")); return null; }
    const scope = v(".sbe-auto-scope");
    if (AUTO_SCOPES.includes(scope) && scope !== "carried") out.scope = scope;
    const freq = v(".sbe-auto-freq");
    if (AUTO_FREQS.includes(freq) && freq !== "each") out.freq = freq;
    if (box.querySelector(".sbe-auto-ask")?.checked) out.ask = true;
    return out;
  }

  /** Une question de l'étape « Demander ». */
  #askQuestionHTML(q = {}) {
    const L = (k) => game.i18n.localize(k);
    const esc = (x) => foundry.utils.escapeHTML(String(x ?? ""));
    const kind = ["number", "choice", "check", "text"].includes(q.kind) ? q.kind : "number";
    const f = (cls, label, inner) => `<label class="sbe-step-atk-field ${cls}"><span>${L(label)}</span>${inner}</label>`;
    return `
      <div class="sbe-ask-q" data-kind="${kind}">
        ${f("", "SBE.Ask.Key", `<input type="text" class="sbe-ask-key" value="${esc(q.key)}" placeholder="${esc(L("SBE.Ask.KeyPh"))}">`)}
        ${f("", "SBE.Ask.Label", `<input type="text" class="sbe-ask-label" value="${esc(q.label)}" placeholder="${esc(L("SBE.Ask.LabelPh"))}">`)}
        ${f("", "SBE.Ask.Kind", `<select class="sbe-ask-kind">${["number", "choice", "check", "text"].map(k => `<option value="${k}" ${k === kind ? "selected" : ""}>${L(`SBE.Ask.Kinds.${k}`)}</option>`).join("")}</select>`)}
        ${f("", "SBE.Ask.Def", `<input type="text" class="sbe-ask-def" value="${esc(q.def)}" placeholder="${esc(L("SBE.Ask.DefPh"))}">`)}
        ${f("sbe-ask-num", "SBE.Ask.Min", `<input type="text" class="sbe-ask-min" list="sbe-stepkeys" value="${esc(q.min)}">`)}
        ${f("sbe-ask-num", "SBE.Ask.Max", `<input type="text" class="sbe-ask-max" list="sbe-stepkeys" value="${esc(q.max)}">`)}
        ${f("sbe-ask-choice", "SBE.Ask.Choices", `<textarea class="sbe-ask-choices" rows="3" placeholder="${esc(L("SBE.Ask.ChoicesPh"))}">${esc(q.choices)}</textarea>`)}
        <a class="sbe-ask-del" data-tooltip-text="${esc(L("SBE.Ask.Delete"))}"><i class="fa-solid fa-trash"></i></a>
      </div>`;
  }

  /** Champs de l'étape « Demander » : qui répond, titre, les questions. */
  #askBoxHTML(st = {}) {
    const L = (k) => game.i18n.localize(k);
    const esc = (x) => foundry.utils.escapeHTML(String(x ?? ""));
    const isA = st.type === "ask";
    const who = isA && ["gm", "target"].includes(st.who) ? st.who : "self";
    const qs = isA && Array.isArray(st.questions) && st.questions.length ? st.questions : [{}];
    return `
        <div class="sbe-step-askbox">
          <label class="sbe-step-atk-field"><span>${L("SBE.Ask.Who")}</span>
            <select class="sbe-ask-who">${["self", "gm", "target"].map(w => `<option value="${w}" ${w === who ? "selected" : ""}>${L(`SBE.Ask.WhoOpt.${w}`)}</option>`).join("")}</select></label>
          <label class="sbe-step-atk-field"><span>${L("SBE.Ask.Title")}</span>
            <input type="text" class="sbe-ask-title" value="${esc(isA ? st.title : "")}" placeholder="${esc(L("SBE.Ask.TitlePh"))}"></label>
          <div class="sbe-ask-list">${qs.map(q => this.#askQuestionHTML(q)).join("")}</div>
          <a class="sbe-ask-add"><i class="fa-solid fa-plus"></i> ${L("SBE.Ask.Add")}</a>
        </div>`;
  }

  /** Champs de l'étape « Quête » : quête, action, objectif, nombre, statut. */
  #questBoxHTML(st = {}) {
    const L = (k) => game.i18n.localize(k);
    const esc = (x) => foundry.utils.escapeHTML(String(x ?? ""));
    const isQ = st.type === "quest";
    const quests = [];
    for (const j of game.journal ?? []) {
      if (!j.flags?.["system-builder-engine"]?.questConfig) continue;
      for (const p of j.pages) if (p.type === "quete") quests.push({ uuid: p.uuid, label: `${j.name} — ${p.name}`, objs: p.system.objectives });
    }
    const sel = (a, b) => (a === b ? "selected" : "");
    const missing = isQ && st.quest && !quests.some(q => q.uuid === st.quest);
    return `
        <div class="sbe-step-questbox">
          <label class="sbe-step-atk-field"><span>${L("SBE.Steps.Quest.Quest")}</span>
            <select class="sbe-step-q-quest">
              <option value="">—</option>
              ${quests.map(q => `<option value="${esc(q.uuid)}" ${sel(isQ ? st.quest : "", q.uuid)}>${esc(q.label)}</option>`).join("")}
              ${missing ? `<option value="${esc(st.quest)}" selected>⚠ ${esc(L("SBE.Steps.Quest.Missing"))}</option>` : ""}
            </select></label>
          <label class="sbe-step-atk-field"><span>${L("SBE.Steps.Quest.Action")}</span>
            <select class="sbe-step-q-action">
              ${["give", "advance", "fail", "reveal", "hide", "status"].map(a => `<option value="${a}" ${sel(isQ ? (st.action ?? "give") : "give", a)}>${L(`SBE.Steps.Quest.Act.${a}`)}</option>`).join("")}
            </select></label>
          <label class="sbe-step-atk-field sbe-step-q-objbox"><span>${L("SBE.Steps.Quest.Objective")}</span>
            <select class="sbe-step-q-obj">
              <option value="">—</option>
              ${quests.flatMap(q => q.objs.map(o => `<option value="${esc(o.id)}" data-quest="${esc(q.uuid)}" ${sel(isQ ? st.obj : "", o.id)}>${esc(o.label || "?")}</option>`)).join("")}
            </select></label>
          <label class="sbe-step-atk-field sbe-step-q-amountbox"><span>${L("SBE.Steps.Quest.Amount")}</span>
            <input type="text" class="sbe-step-q-amount" list="sbe-stepactorkeys" value="${esc(isQ ? st.amount : "")}" placeholder="1"></label>
          <label class="sbe-step-atk-field sbe-step-q-statusbox"><span>${L("SBE.Steps.Quest.Status")}</span>
            <select class="sbe-step-q-status">
              ${["success", "fail", "cancel", "active"].map(k => `<option value="${k}" ${sel(isQ ? (st.status ?? "success") : "success", k)}>${L(`SBE.Quest.Kind.${k}`)}</option>`).join("")}
            </select></label>
        </div>`;
  }

  /** Champs de l'étape « Expérience / Niveau » : sur qui, quoi, combien. */
  #levelBoxHTML(st = {}) {
    const L = (k) => game.i18n.localize(k);
    const esc = (x) => foundry.utils.escapeHTML(String(x ?? ""));
    const isL = st.type === "level";
    const v = (f, d = "") => (isL ? st[f] ?? d : d);
    const sel = (a, b) => (a === b ? "selected" : "");
    const items = (game.items?.filter(i => i.type === "objet") ?? []).sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
    const cur = v("item");
    return `
        <div class="sbe-step-levelbox">
          <label class="sbe-step-atk-field"><span>${L("SBE.Steps.Level.Target")}</span>
            <select class="sbe-step-lv-target">${["self", "targets", "owned"].map(t => `<option value="${t}" ${sel(v("target", "self"), t)}>${L(`SBE.Steps.Level.TargetOpt.${t}`)}</option>`).join("")}</select></label>
          <label class="sbe-step-atk-field sbe-step-lv-itembox"><span>${L("SBE.Steps.Level.Item")}</span>
            <select class="sbe-step-lv-item"><option value="">—</option>${items.map(i => `<option value="${i.id}" ${sel(cur, i.id)}>${esc(i.name)}</option>`).join("")}${cur && !items.some(i => i.id === cur) ? `<option value="${esc(cur)}" selected>⚠ ${esc(L("SBE.Steps.GiveMissing"))}</option>` : ""}</select></label>
          <label class="sbe-step-atk-field"><span>${L("SBE.Steps.Level.Key")}</span>
            <input type="text" class="sbe-step-lv-key" list="sbe-steplevelkeys" value="${esc(v("key"))}"></label>
          <label class="sbe-step-atk-field"><span>${L("SBE.Steps.Level.What")}</span>
            <select class="sbe-step-lv-what">${["xp", "level"].map(t => `<option value="${t}" ${sel(v("what", "xp"), t)}>${L(`SBE.Steps.Level.WhatOpt.${t}`)}</option>`).join("")}</select></label>
          <label class="sbe-step-atk-field"><span>${L("SBE.Steps.Level.Amount")}</span>
            <input type="text" class="sbe-step-lv-amount" list="sbe-stepactorkeys" value="${esc(v("amount"))}" placeholder="1"></label>
          <label class="sbe-step-atk-field sbe-step-lv-modebox"><span>${L("SBE.Steps.Level.Mode")}</span>
            <select class="sbe-step-lv-mode">${["component", "available", "direct"].map(t => `<option value="${t}" ${sel(v("mode", "component"), t)}>${L(`SBE.Steps.Level.ModeOpt.${t}`)}</option>`).join("")}</select></label>
        </div>`;
  }

  /** Affiche les champs utiles au type, avec leur aide AU-DESSUS. */
  #syncStepRow(row) {
    const L = (k) => game.i18n.localize(k);
    const type = row.querySelector(".sbe-step-type").value;
    row.dataset.type = type;
    const show = (sel, on) => { const e = row.querySelector(sel); if (e) e.style.display = on ? "" : "none"; };
    show(".sbe-step-from", type === "consume");
    show(".sbe-step-settarget", type === "set");
    show(".sbe-step-slotkey", type === "set" && row.querySelector(".sbe-step-settarget")?.value === "slot");
    show(".sbe-step-usebtn", type === "useslot");
    show(".sbe-step-setmode", type === "set");
    show(".sbe-step-waitbox", type === "wait");
    show(".sbe-step-questbox", type === "quest");
    show(".sbe-step-levelbox", type === "level");
    if (type === "level") {
      show(".sbe-step-lv-itembox", row.querySelector(".sbe-step-lv-target").value === "owned");
      show(".sbe-step-lv-modebox", row.querySelector(".sbe-step-lv-what").value === "level");
    }
    show(".sbe-step-askbox", type === "ask");
    show(".sbe-step-signalbox", type === "signal");
    show(".sbe-step-resistbox", type === "resist");
    show(".sbe-step-tablebox", type === "table");
    show(".sbe-step-placebox", type === "place");
    if (type === "place") {
      const what = row.querySelector(".sbe-step-pl-what").value;
      show(".sbe-step-pl-actorbox", what !== "item");
      show(".sbe-step-pl-c", what === "creature");
      show(".sbe-step-pl-d", what === "dismiss");
      show(".sbe-step-pl-creature", what === "creature");
    }
    for (const q of row.querySelectorAll(".sbe-ask-q")) {
      const k = q.querySelector(".sbe-ask-kind").value;
      q.dataset.kind = k;
      for (const e of q.querySelectorAll(".sbe-ask-num")) e.style.display = k === "number" ? "" : "none";
      for (const e of q.querySelectorAll(".sbe-ask-choice")) e.style.display = k === "choice" ? "" : "none";
    }
    show(".sbe-step-scenebox", type === "scene");
    if (type === "scene") {
      const act = row.querySelector(".sbe-step-sc-action").value;
      const allowed = SCENE_ACTIONS[act]?.ops ?? [];
      const opSel = row.querySelector(".sbe-step-sc-op");
      for (const o of opSel.options) o.hidden = !allowed.includes(o.value);
      if (!allowed.includes(opSel.value) && allowed.length) opSel.value = allowed[0];
      show(".sbe-step-sc-opbox", allowed.length > 0);
    }
    show(".sbe-step-targetbox", type === "target");
    show(".sbe-step-timebox", type === "time");
    if (type === "time") {
      const act = row.querySelector(".sbe-step-tm-action").value;
      show(".sbe-step-tm-amountbox", act === "advance" || act === "back");
      show(".sbe-step-tm-partbox", act === "next" || act === "prev");
      show(".sbe-step-tm-setbox", act === "set");
    }
    const imp = type === "weather" || type === "season" || type === "moon";
    show(".sbe-step-impbox", imp);
    if (imp) {
      const decided = row.querySelector(".sbe-step-im-mode").value === "decided";
      show(".sbe-step-im-wxbox", decided && type === "weather");
      show(".sbe-step-im-sebox", decided && type === "season");
      show(".sbe-step-im-phbox", decided && type === "moon");
      show(".sbe-step-im-moonbox", !decided && type === "moon");
      show(".sbe-step-im-durbox", decided);
    }
    show(".sbe-step-takebox", type === "take");
    show(".sbe-step-givebox", type === "give");
    if (type === "take") {
      const tm = row.querySelector(".sbe-step-take-mode").value;
      show(".sbe-step-take-itembox", tm === "item");
      show(".sbe-step-take-filterbox", tm === "filter");
      show(".sbe-step-take-formulabox", tm === "formula");
    }
    show(".sbe-step-rollbox", type === "roll");
    show(".sbe-step-pickbox", type === "pick");
    if (type === "pick") {
      const fromList = row.querySelector(".sbe-step-pick-from").value === "list";
      show(".sbe-step-pick-listbox", fromList);
      show(".sbe-step-pick-ownedbox", fromList);
    }
    if (type === "give") {
      const byFormula = row.querySelector(".sbe-step-give-mode").value === "formula";
      show(".sbe-step-give-itembox", !byFormula);
      show(".sbe-step-give-formulabox", byFormula);
    }
    if (type === "quest") {
      const qb = row.querySelector(".sbe-step-questbox");
      const act = qb.querySelector(".sbe-step-q-action").value;
      const quest = qb.querySelector(".sbe-step-q-quest").value;
      const objSel = qb.querySelector(".sbe-step-q-obj");
      for (const o of objSel.options) o.hidden = !!o.value && o.dataset.quest !== quest;
      if (objSel.selectedOptions[0]?.hidden) objSel.value = "";
      show(".sbe-step-q-objbox", ["advance", "fail", "reveal", "hide"].includes(act));
      show(".sbe-step-q-amountbox", act === "advance");
      show(".sbe-step-q-statusbox", act === "status");
    }
    show(".sbe-step-landbox", type === "land");
    show(".sbe-step-onlyif-box", !["condition", "if"].includes(type));
    /* Bloc : ses branches (posées à la première fois). Deux niveaux au
       plus : pas de bloc dans un bloc de bloc. */
    const body = row.querySelector(":scope > .sbe-step-body");
    if (BLOCK_TYPES.includes(type) && !body.querySelector(":scope > .sbe-step-blockbox")) body.insertAdjacentHTML("beforeend", this.#blockBoxHTML({}));
    for (const bx of body.querySelectorAll(":scope > .sbe-step-blockbox")) bx.style.display = bx.dataset.kind === type ? "" : "none";
    let depth = 0;
    for (let p = row.parentElement?.closest(".sbe-branch"); p; p = p.parentElement?.closest(".sbe-branch")) depth++;
    for (const o of row.querySelector(".sbe-step-type").options) if (BLOCK_TYPES.includes(o.value)) o.hidden = depth >= 2;
    const fromSel = row.querySelector(".sbe-step-from").value;
    show(".sbe-step-key", !["condition", "target", "wait", "land", "quest", "level", "take", "give", "place", "scene", "ask", "signal", "table", ...CAL_STEPS].includes(type) && !(type === "consume" && ["self", "picked"].includes(fromSel)));
    show(".sbe-step-val", ["condition", "if", "consume", "set", "fill", "target", "pick"].includes(type));
    show(".sbe-step-msg", ["condition", "pick", "take"].includes(type));
    show(".sbe-step-fxact", type === "effect" && row.querySelector(".sbe-step-fxtarget")?.value !== "mine");
    show(".sbe-step-fxtarget", type === "effect");
    show(".sbe-step-mediamode", type === "sound");
    show(".sbe-step-atkbox", type === "attack");
    const from = row.querySelector(".sbe-step-from").value;
    /* Clés proposées : celles du PERSONNAGE quand l'étape agit sur le
       porteur ou les cibles, sinon celles de l'objet. */
    const onActor = (type === "consume" && from === "carrier")
      || (type === "set" && ["carrier", "targets"].includes(row.querySelector(".sbe-step-settarget")?.value));
    row.querySelector(".sbe-step-key").setAttribute("list", ["effect", "resist"].includes(type) ? "sbe-stepfx" : type === "sound" ? "sbe-stepmedia" : onActor ? "sbe-stepactorkeys" : "sbe-stepkeys");
    const keyPh = { consume: from === "slot" ? "SBE.Steps.SlotPh" : from === "carrier" ? "SBE.Steps.CarrierKeyPh" : "SBE.Steps.KeyPh",
      roll: "SBE.Steps.RollKeyPh", attack: "SBE.Steps.RollKeyPh", set: "SBE.Steps.KeyPh", fill: "SBE.Steps.SlotPh", empty: "SBE.Steps.SlotPh", useslot: "SBE.Steps.SlotPh",
      effect: "SBE.Steps.FxKeyPh", resist: "SBE.Steps.ResistKeyPh", sound: "SBE.Steps.SoundPh", pick: "SBE.Steps.PickShowPh" }[type];
    const setTg = row.querySelector(".sbe-step-settarget")?.value;
    const valPh = { condition: "SBE.Steps.ConditionPh", if: "SBE.Steps.ConditionPh", consume: "SBE.Steps.AmountPh",
      set: row.querySelector(".sbe-step-setmode")?.value === "set" ? "SBE.Steps.SetPh" : "SBE.Steps.SetAmountPh",
      fill: "SBE.Steps.LimitPh", target: "SBE.Steps.TargetRangePh", pick: "SBE.Steps.PickFilterPh" }[type];
    if ((type === "set" && ["picked", "slot"].includes(setTg)) || type === "pick") row.querySelector(".sbe-step-key").setAttribute("list", "sbe-stepallitemkeys");
    row.querySelector(".sbe-step-msg").placeholder = L(type === "pick" ? "SBE.Steps.PickMsgPh" : "SBE.Steps.MessagePh");
    if (keyPh) row.querySelector(".sbe-step-key").placeholder = L(keyPh);
    if (valPh) row.querySelector(".sbe-step-val").placeholder = L(valPh);
    row.querySelector(".sbe-step-help").dataset.tooltipText = L(`SBE.Steps.Hint.${type}`);
    /* Conditions en phrases : le champ de valeur n'en est une que pour
       « Condition » et « Si » (ailleurs : quantité, formule…). */
    const val = row.querySelector(".sbe-step-val");
    this.#condAttach(val);
    this.#condAttach(row.querySelector(".sbe-step-onlyif"));
    /* La condition de cible se lit sur la fiche de la cible : clés des modèles de personnage. */
    this.#condAttach(row.querySelector(".sbe-step-tg-if"), "sbe-stepactorkeys");
    val.dispatchEvent(new CustomEvent("sbe-cond-mode", { detail: { advanced: condAdvanced() || !["condition", "if"].includes(type) } }));
    this.#syncStepLine(row);
  }

  /** La ligne repliée d'une étape : son type et sa phrase (relue à chaque frappe). */
  #syncStepLine(row) {
    const L = (k) => game.i18n.localize(k);
    const type = row.querySelector(".sbe-step-type").value;
    row.querySelector(".sbe-step-tag").textContent = L(`SBE.Steps.Type.${type}`);
    const st = this.#readStepRows([row], { silent: true })?.[0] ?? null;
    row.querySelector(".sbe-step-sum").innerHTML = st ? stepSentence(st) : `<span class="notes">${foundry.utils.escapeHTML(L("SBE.Steps.Say.Todo"))}</span>`;
  }

  #wireSteps(root) {
    const list = root.querySelector(".sbe-steps-list");
    if (!list) return;
    for (const row of list.querySelectorAll(".sbe-step")) this.#syncStepRow(row);
    for (const box of list.querySelectorAll(".sbe-aopt, .sbe-apv")) wireOptionsEditor(box);
    root.querySelector(".sbe-steps-add")?.addEventListener("click", () => {
      list.insertAdjacentHTML("beforeend", this.#stepRowHTML({}, { open: true }));
      this.#syncStepRow(list.lastElementChild);
      for (const box of list.lastElementChild.querySelectorAll(".sbe-aopt, .sbe-apv")) wireOptionsEditor(box);
    });
    list.addEventListener("change", (ev) => {
      if (ev.target.matches(".sbe-ask-kind, .sbe-step-fxtarget, .sbe-step-type, .sbe-step-from, .sbe-step-settarget, .sbe-step-setmode, .sbe-step-q-quest, .sbe-step-q-action, .sbe-step-sc-action, .sbe-step-tm-action, .sbe-step-im-mode, .sbe-step-take-mode, .sbe-step-give-mode, .sbe-step-pick-from, .sbe-step-roll-who, .sbe-step-pl-what, .sbe-step-lv-target, .sbe-step-lv-what")) this.#syncStepRow(ev.target.closest(".sbe-step"));
    });
    /* La phrase suit ce qu'on écrit. */
    /* (et celle des blocs qui la contiennent) */
    const relines = (ev) => { for (let r = ev.target.closest(".sbe-step"); r; r = r.parentElement?.closest(".sbe-step")) this.#syncStepLine(r); };
    list.addEventListener("input", relines);
    list.addEventListener("change", relines);
    /* Mode avancé : les conditions en formules (réglage de chacun). */
    const adv = root.querySelector(".sbe-steps-adv");
    adv?.addEventListener("change", async () => {
      await game.settings.set(SYSTEM_ID, "stepsAdvanced", adv.checked);
      setCondMode(root, adv.checked);
      for (const row of list.querySelectorAll(".sbe-step")) this.#syncStepRow(row);
    });
    for (const c of [".sbe-auto-formula", ".sbe-auto-onlyif", ".sbe-auto-newdrop"]) this.#condAttach(root.querySelector(c));
    list.addEventListener("click", (ev) => {
      /* Un clic sur la ligne (hors outils) ouvre / referme ses réglages. */
      const line = ev.target.closest(".sbe-step-line");
      if (line && !ev.target.closest(".sbe-step-tools")) {
        line.closest(".sbe-step").classList.toggle("is-open");
        return;
      }
      const a = ev.target.closest("a");
      const row = a?.closest(".sbe-step");
      if (!row) return;
      /* Bloc : une étape de plus dans une branche. */
      if (a.classList.contains("sbe-branch-add")) {
        const bl = a.closest(".sbe-branch").querySelector(":scope > .sbe-steps-list");
        bl.insertAdjacentHTML("beforeend", this.#stepRowHTML({}, { open: true }));
        this.#syncStepRow(bl.lastElementChild);
        for (const box of bl.lastElementChild.querySelectorAll(".sbe-aopt, .sbe-apv")) wireOptionsEditor(box);
        this.#syncStepLine(row);
        return;
      }
      /* « Demander » : ajouter / retirer une question. */
      if (a.classList.contains("sbe-ask-add")) {
        row.querySelector(".sbe-ask-list").insertAdjacentHTML("beforeend", this.#askQuestionHTML({}));
        this.#syncStepRow(row);
      } else if (a.classList.contains("sbe-ask-del")) a.closest(".sbe-ask-q")?.remove();
      /* Invocation : ajouter / retirer une valeur de la créature. */
      else if (a.classList.contains("sbe-step-pl-vadd")) row.querySelector(".sbe-step-pl-vlist")?.insertAdjacentHTML("beforeend", this.#summonValueHTML({}));
      else if (a.classList.contains("sbe-step-pl-vdel")) a.closest(".sbe-step-pl-vrow")?.remove();
      else if (a.classList.contains("sbe-step-del")) {
        const up = row.parentElement?.closest(".sbe-step");
        row.remove();
        if (up) this.#syncStepLine(up);
      }
      else if (a.classList.contains("sbe-step-up") && row.previousElementSibling) row.after(row.previousElementSibling);
      else if (a.classList.contains("sbe-step-down") && row.nextElementSibling) row.before(row.nextElementSibling);
    });
  }

  /** Lit les étapes ; null si une formule est invalide (message affiché). */
  #readSteps(root) {
    const top = root.querySelector(".sbe-steps-list");
    const steps = this.#readStepRows(top ? [...top.children].filter(c => c.classList.contains("sbe-step")) : []);
    if (steps === null) return null;
    /* Après « Attendre », personne n'est là pour choisir : cible, objet,
       fenêtre de jet se placent AVANT (blocs compris). */
    const flat = flatSteps(steps);
    const w = flat.findIndex(x => x.type === "wait");
    const bad = w >= 0 ? flat.slice(w + 1).find(x => INTERACTIVE_STEPS.includes(x.type)) : null;
    if (bad) {
      ui.notifications.error(game.i18n.format("SBE.Steps.InteractiveAfterWait", { step: game.i18n.localize(`SBE.Steps.Type.${bad.type}`) }));
      return null;
    }
    return steps;
  }

  /**
   * Lit des lignes d'étapes. `silent` : sans message (phrase de la ligne
   * repliée, relue à chaque frappe). null = une formule invalide.
   */
  #readStepRows(rows, { silent = false } = {}) {
    const steps = [];
    const notify = (msg) => { if (!silent) ui.notifications.error(msg); };
    for (const row of rows) {
      const type = row.querySelector(".sbe-step-type").value;
      const key = row.querySelector(".sbe-step-key").value.trim();
      const val = row.querySelector(".sbe-step-val").value.trim();
      const msg = row.querySelector(".sbe-step-msg").value.trim();
      const onlyIf = row.querySelector(".sbe-step-onlyif")?.value.trim() ?? "";
      const before = steps.length;
      const formulaOk = (f) => {
        if (!f || /^-?\d+(\.\d+)?$/.test(f)) return true;
        const err = validateFormula(f);
        if (err) notify(`${game.i18n.localize(`SBE.Steps.Type.${type}`)} : ${err}`);
        return !err;
      };
      /* Champs qui acceptent les dés (« 2d4 + 2 ») : relus dés mis de côté, comme le vérificateur. */
      const diceOk = (f) => formulaOk(HAS_DICE.test(f) ? f.replace(/\b\d*d(?:\d+|%)(?:[a-z]+\d*)*/gi, " 0 ") : f);
      switch (type) {
        /* Blocs : leur condition, puis chaque branche (mêmes règles). */
        case "if": case "result": {
          const out = { type };
          if (type === "if" && val) { if (!formulaOk(val)) return null; out.formula = val; }
          for (const b of BLOCK_BRANCHES[type]) {
            const sub = this.#readStepRows(this.#branchRows(row, type, b), { silent });
            if (sub === null) return null;
            if (sub.length) out[b] = sub;
          }
          if (!BLOCK_BRANCHES[type].some(b => out[b])) continue;
          steps.push(out);
          break;
        }
        case "condition":
          if (!val) continue;
          if (!formulaOk(val)) return null;
          steps.push(msg ? { type, formula: val, message: msg } : { type, formula: val });
          break;
        case "consume": {
          const fv = row.querySelector(".sbe-step-from").value;
          if (!key && !["self", "picked"].includes(fv)) continue;
          if (!formulaOk(val)) return null;
          const from = ["slot", "carrier", "self", "picked"].includes(fv) ? fv : "key";
          if (from === "self" || from === "picked") { steps.push({ type, from, amount: val || "1" }); break; }
          steps.push(from === "slot" ? { type, from, slot: key, amount: val || "1" } : { type, from, key, amount: val || "1" });
          break;
        }
        case "roll": {
          if (!key) continue;
          const out = { type, key };
          /* Sur le porteur : la clé peut être une formule qui la donne
             (picked_talent) ; difficulté en formule (plus dur si > 0). */
          if (row.querySelector(".sbe-step-roll-who")?.value === "carrier") out.who = "carrier";
          const diff = row.querySelector(".sbe-step-roll-diff")?.value.trim() ?? "";
          if (diff) { if (!formulaOk(diff)) return null; out.difficulty = diff; }
          steps.push(out);
          break;
        }
        case "attack": {
          if (!key) continue;
          const out = { type, key };
          const prof = row.querySelector(".sbe-step-atk-profile")?.value ?? "";
          if (prof) out.profile = prof;
          /* Médias joués selon l'issue (noms déclarés par le modèle). */
          for (const f of ["mediaShot", "mediaHit", "mediaMiss", "mediaCrit"]) {
            const x = row.querySelector(`.sbe-step-atk-${f}`)?.value.trim() ?? "";
            if (x) out[f] = x;
          }
          /* Rafale : répétitions (vide = nombre de coups) et intervalle (ms). */
          for (const f of ["mediaRepeat", "mediaInterval"]) {
            const x = row.querySelector(`.sbe-step-atk-${f}`)?.value.trim() ?? "";
            if (!x) continue;
            if (!formulaOk(x)) return null;
            out[f] = x;
          }
          for (const f of ["damage", "range", "hits"]) {
            const x = row.querySelector(`.sbe-step-atk-${f}`)?.value.trim() ?? "";
            if (!x) continue;
            /* Portée et coups : formules du moteur ; les dégâts sont un
               jet de dés (2d6 + bonus), vérifié au lancer. */
            if (["range", "hits"].includes(f) && !formulaOk(x)) return null;
            out[f] = x;
          }
          /* Volet Avancé : ce qui remplace le profil pour CETTE arme. */
          const adv = readProfileFields(row.querySelector(".sbe-step-adv"), (f) => (/^-?\d+(\.\d+)?$/.test(f) ? null : validateFormula(f)));
          if (adv.error) { notify(adv.error); return null; }
          Object.assign(out, adv.values);
          steps.push(out);
          break;
        }
        case "set":
          if (!key) continue;
          if (!diceOk(val)) return null;
          {
            const tg = row.querySelector(".sbe-step-settarget")?.value;
            const md = row.querySelector(".sbe-step-setmode")?.value;
            const out = ["carrier", "targets", "picked", "slot"].includes(tg) ? { type, key, formula: val, target: tg } : { type, key, formula: val };
            if (tg === "slot") {
              out.slot = row.querySelector(".sbe-step-slotkey")?.value.trim() ?? "";
              if (!out.slot) continue;
            }
            if (SET_MODES.includes(md) && md !== "set") out.mode = md;
            steps.push(out);
          }
          break;
        case "fill":
          if (!key) continue;
          if (!formulaOk(val)) return null;
          steps.push(val ? { type, slot: key, limit: val } : { type, slot: key });
          break;
        case "empty":
          if (key) steps.push({ type, slot: key });
          break;
        case "useslot": {
          const button = row.querySelector(".sbe-step-usebtn")?.value.trim() ?? "";
          if (key && button) steps.push({ type, slot: key, button });
          break;
        }
        case "place": {
          const pb = row.querySelector(".sbe-step-placebox");
          const what = pb.querySelector(".sbe-step-pl-what").value;
          if (what === "dismiss") {
            const actor = pb.querySelector(".sbe-step-pl-d").value;
            steps.push({ type, what, ...(actor ? { actor } : {}) });
            break;
          }
          if (what !== "creature") { steps.push({ type }); break; }
          const actor = pb.querySelector(".sbe-step-pl-c").value;
          if (!actor) continue;
          const g = (c) => pb.querySelector(c).value.trim();
          /* Les dés (« 1d4 ») sont lancés, pas vérifiés. */
          for (const f of [g(".sbe-step-pl-count"), g(".sbe-step-pl-rounds"), g(".sbe-step-pl-minutes")]) if (f && !HAS_DICE.test(f) && !formulaOk(f)) return null;
          const out = { type, what, actor };
          if (g(".sbe-step-pl-count")) out.count = g(".sbe-step-pl-count");
          if (g(".sbe-step-pl-control") !== "caster") out.control = g(".sbe-step-pl-control");
          if (g(".sbe-step-pl-rounds")) out.rounds = g(".sbe-step-pl-rounds");
          if (g(".sbe-step-pl-minutes")) out.minutes = g(".sbe-step-pl-minutes");
          if (g(".sbe-step-pl-init") !== "caster") out.init = g(".sbe-step-pl-init");
          if (g(".sbe-step-pl-zero") !== "remove") out.onZero = g(".sbe-step-pl-zero");
          if (g(".sbe-step-pl-while")) out.whileEffect = g(".sbe-step-pl-while");
          if (pb.querySelector(".sbe-step-pl-down").checked) out.casterDown = true;
          /* Valeurs écrites sur la créature (formules, dés permis). */
          const values = [];
          for (const vr of pb.querySelectorAll(".sbe-step-pl-vrow")) {
            const k = vr.querySelector(".sbe-step-pl-vkey").value.trim();
            const f = vr.querySelector(".sbe-step-pl-vf").value.trim();
            if (!k || !f) continue;
            if (!HAS_DICE.test(f) && !formulaOk(f)) return null;
            const mode = vr.querySelector(".sbe-step-pl-vmode").value;
            values.push({ key: k, formula: f, ...(["add", "sub"].includes(mode) ? { mode } : {}) });
          }
          if (values.length) out.values = values;
          steps.push(out);
          break;
        }
        case "target": {
          if (!formulaOk(val)) return null;
          const tb = row.querySelector(".sbe-step-targetbox");
          const who = tb?.querySelector(".sbe-step-tg-who")?.value ?? "all";
          const tif = tb?.querySelector(".sbe-step-tg-if")?.value.trim() ?? "";
          const tmsg = tb?.querySelector(".sbe-step-tg-msg")?.value.trim() ?? "";
          if (tif && !formulaOk(tif)) return null;
          steps.push({ type, ...(val ? { range: val } : {}), ...(who !== "all" ? { who } : {}), ...(tif ? { targetIf: tif } : {}), ...(tmsg ? { targetMsg: tmsg } : {}) });
          break;
        }
        case "pick":
          if (!formulaOk(val) || !formulaOk(key)) return null;
          {
            const pf = row.querySelector(".sbe-step-pick-from")?.value === "list" ? "list" : "";
            const pl = row.querySelector(".sbe-step-pick-list")?.value.trim() ?? "";
            steps.push({ type, ...(val ? { formula: val } : {}), ...(key ? { show: key } : {}), ...(msg ? { message: msg } : {}),
              ...(pf && pl ? { from: "list", list: pl } : {}),
              ...(pf && pl && row.querySelector(".sbe-step-pick-owned")?.checked ? { owned: true } : {}) });
          }
          break;
        case "sound": {
          if (!key) continue;
          const md = row.querySelector(".sbe-step-mediamode")?.value;
          steps.push(["sound", "anim"].includes(md) ? { type, key, mode: md } : { type, key });
          break;
        }
        case "take": {
          const b = row.querySelector(".sbe-step-takebox");
          const tmv = b.querySelector(".sbe-step-take-mode").value;
          const mode = ["filter", "formula"].includes(tmv) ? tmv : "item";
          const out = { type, mode };
          if (mode === "item") { out.item = b.querySelector(".sbe-step-take-item").value; if (!out.item) continue; }
          else if (mode === "formula") {
            out.formula = b.querySelector(".sbe-step-take-formula").value.trim();
            if (!out.formula) continue;
            if (!formulaOk(out.formula)) return null;
          } else {
            out.filter = b.querySelector(".sbe-step-take-filter").value.trim();
            if (!out.filter || !formulaOk(out.filter)) { if (!out.filter) continue; return null; }
          }
          if (b.querySelector(".sbe-step-take-check")?.checked) out.check = true;
          if (b.querySelector(".sbe-step-take-partial")?.checked) out.partial = true;
          const amt = b.querySelector(".sbe-step-take-amount").value.trim();
          if (amt && !formulaOk(amt)) return null;
          if (amt) out.amount = amt;
          if (msg) out.message = msg;
          steps.push(out);
          break;
        }
        case "give": {
          const b = row.querySelector(".sbe-step-givebox");
          const mode = b.querySelector(".sbe-step-give-mode").value === "formula" ? "formula" : "item";
          const out = { type, mode };
          if (mode === "item") { out.item = b.querySelector(".sbe-step-give-item").value; if (!out.item) continue; }
          else {
            out.formula = b.querySelector(".sbe-step-give-formula").value.trim();
            if (!out.formula) continue;
            if (!formulaOk(out.formula)) return null;
          }
          const amt = b.querySelector(".sbe-step-give-amount").value.trim();
          if (amt && !formulaOk(amt)) return null;
          if (amt) out.amount = amt;
          const where = b.querySelector(".sbe-step-give-where").value.trim();
          if (where) out.where = where;
          steps.push(out);
          break;
        }
        case "table": {
          const tb = row.querySelector(".sbe-step-tablebox");
          const table = tb.querySelector(".sbe-step-table").value;
          if (!table) continue;
          steps.push({ type, table,
            ...(tb.querySelector(".sbe-step-table-give").checked ? { give: true } : {}),
            ...(tb.querySelector(".sbe-step-table-chat").checked ? { chat: true } : {}) });
          break;
        }
        case "signal": {
          const sb = row.querySelector(".sbe-step-signalbox");
          const name = sb.querySelector(".sbe-step-sig-name").value.trim();
          if (!name) continue;
          const to = sb.querySelector(".sbe-step-sig-to").value;
          steps.push({ type, name, ...(to !== "self" ? { to } : {}) });
          break;
        }
        case "ask": {
          const ab = row.querySelector(".sbe-step-askbox");
          const out = { type };
          const who = ab.querySelector(".sbe-ask-who").value;
          if (who !== "self") out.who = who;
          const title = ab.querySelector(".sbe-ask-title").value.trim();
          if (title) out.title = title;
          out.questions = [];
          for (const qr of ab.querySelectorAll(".sbe-ask-q")) {
            const v = (c) => qr.querySelector(c)?.value.trim() ?? "";
            const q = { key: v(".sbe-ask-key"), kind: v(".sbe-ask-kind") };
            if (!q.key) continue;
            if (!KEY_RE.test(q.key)) { notify(game.i18n.format("SBE.Ask.BadKey", { key: q.key })); return null; }
            for (const [f, c] of [["label", ".sbe-ask-label"], ["def", ".sbe-ask-def"]]) if (v(c)) q[f] = v(c);
            if (q.kind === "number") {
              for (const f of ["def", "min", "max"]) {
                const x = f === "def" ? (q.def ?? "") : v(`.sbe-ask-${f}`);
                if (!x) continue;
                if (!formulaOk(x)) return null;
                q[f] = x;
              }
            }
            if (q.kind === "choice" && v(".sbe-ask-choices")) q.choices = v(".sbe-ask-choices");
            out.questions.push(q);
          }
          if (!out.questions.length) continue;
          steps.push(out);
          break;
        }
        case "time": {
          const tb = row.querySelector(".sbe-step-timebox");
          const q = (c) => tb.querySelector(c);
          const action = q(".sbe-step-tm-action").value;
          const out = { type, action };
          if (action === "advance" || action === "back") {
            const amt = q(".sbe-step-tm-amount").value.trim();
            if (amt && !diceOk(amt)) return null;
            out.amount = amt || "1";
            out.unit = q(".sbe-step-tm-unit").value;
          }
          if (action === "next" || action === "prev") out.part = q(".sbe-step-tm-part").value;
          if (action === "set") {
            const m = /^(\d{1,2})(?:[:h](\d{1,2}))?$/.exec(q(".sbe-step-tm-hour").value.trim());
            if (m) { out.hour = Number(m[1]); out.minute = Number(m[2] ?? 0); }
            for (const k of ["day", "month", "year"]) { const x = q(`.sbe-step-tm-${k}`).value.trim(); if (x !== "") out[k] = Number(x); }
          }
          if (q(".sbe-step-tm-keep").checked) out.keepWeather = true;
          steps.push(out);
          break;
        }
        case "weather": case "season": case "moon": {
          const ib = row.querySelector(".sbe-step-impbox");
          const mode = ib.querySelector(".sbe-step-im-mode").value;
          const out = { type, mode };
          if (type === "moon" && mode !== "decided") {
            out.moon = ib.querySelector(".sbe-step-im-moon").value;
            if (!out.moon) continue;
          }
          if (mode === "decided") {
            if (type === "moon") {
              const [mk = "", pk = ""] = ib.querySelector(".sbe-step-im-ph").value.split(":");
              out.moon = mk; out.key = pk;
            } else out.key = ib.querySelector(type === "weather" ? ".sbe-step-im-wx" : ".sbe-step-im-se").value;
            if (!out.key) continue;
            const amt = ib.querySelector(".sbe-step-im-amount").value.trim();
            if (amt && !diceOk(amt)) return null;
            if (amt) { out.amount = amt; out.unit = ib.querySelector(".sbe-step-im-unit").value; }
          }
          steps.push(out);
          break;
        }
        case "scene": {
          const sb = row.querySelector(".sbe-step-scenebox");
          const action = sb?.querySelector(".sbe-step-sc-action")?.value ?? "door";
          const out = { type, action };
          const allowed = SCENE_ACTIONS[action]?.ops ?? [];
          const op = sb.querySelector(".sbe-step-sc-op").value;
          if (allowed.length) out.op = allowed.includes(op) ? op : allowed[0];
          const group = sb.querySelector(".sbe-step-sc-group").value.trim();
          if (group) out.group = group;
          steps.push(out);
          break;
        }
        case "quest": {
          const qb = row.querySelector(".sbe-step-questbox");
          const quest = qb?.querySelector(".sbe-step-q-quest")?.value ?? "";
          if (!quest) continue;
          const action = qb.querySelector(".sbe-step-q-action").value;
          const out = { type, quest, action };
          if (["advance", "fail", "reveal", "hide"].includes(action)) out.obj = qb.querySelector(".sbe-step-q-obj").value;
          if (action === "advance") {
            const amt = qb.querySelector(".sbe-step-q-amount").value.trim();
            if (amt && !formulaOk(amt)) return null;
            if (amt) out.amount = amt;
          }
          if (action === "status") out.status = qb.querySelector(".sbe-step-q-status").value;
          steps.push(out);
          break;
        }
        case "level": {
          const lb = row.querySelector(".sbe-step-levelbox");
          const lk = lb.querySelector(".sbe-step-lv-key").value.trim();
          if (!lk) continue;
          const target = lb.querySelector(".sbe-step-lv-target").value;
          const what = lb.querySelector(".sbe-step-lv-what").value === "level" ? "level" : "xp";
          const out = { type, key: lk, what, target: ["targets", "owned"].includes(target) ? target : "self" };
          if (out.target === "owned") { out.item = lb.querySelector(".sbe-step-lv-item").value; if (!out.item) { notify(game.i18n.localize("SBE.Steps.Level.ItemNeeded")); return null; } }
          const amt = lb.querySelector(".sbe-step-lv-amount").value.trim();
          if (amt && !formulaOk(amt)) return null;
          if (amt) out.amount = amt;
          if (what === "level") { const m = lb.querySelector(".sbe-step-lv-mode").value; if (m !== "component") out.mode = m; }
          steps.push(out);
          break;
        }
        case "land": {
          const out = { type };
          for (const f of ["onHit", "onMiss"]) {
            const x = row.querySelector(`.sbe-step-land-${f}`)?.value.trim() ?? "";
            if (x) out[f] = x;
          }
          steps.push(out);
          break;
        }
        case "wait": {
          const out = { type };
          for (const f of ["rounds", "minutes", "formula"]) {
            const x = row.querySelector(`.sbe-step-wait-${f}`)?.value.trim() ?? "";
            if (!x) continue;
            if (!formulaOk(x)) return null;
            out[f] = x;
          }
          if (!out.rounds && !out.minutes) continue;
          steps.push(out);
          break;
        }
        case "resist": {
          const adv = row.querySelector(".sbe-step-rs-adv")?.value;
          steps.push({ type, ...(key ? { key } : {}), ...(["adv", "dis"].includes(adv) ? { adv } : {}) });
          break;
        }
        case "effect": {
          /* « Ceux que j'ai posés » : retirer, partout ; sans effet choisi = tous. */
          const tg = row.querySelector(".sbe-step-fxtarget")?.value;
          const target = ["targets", "mine"].includes(tg) ? tg : "self";
          if (key || target === "mine") steps.push({ type, key,
            action: target === "mine" ? "remove" : (row.querySelector(".sbe-step-fxact")?.value ?? "apply"), target });
          break;
        }
      }
      /* « Seulement si » (toutes les étapes sauf Condition). */
      if (onlyIf && !["condition", "if"].includes(type) && steps.length > before) {
        if (!formulaOk(onlyIf)) return null;
        steps[steps.length - 1].onlyIf = onlyIf;
      }
    }
    return steps;
  }

  /** Les LISTES DÉROULANTES de ce modèle (compatibilité d'un slot). */
  #selectKeyOptions(selected) {
    const esc = foundry.utils.escapeHTML;
    let html = "";
    for (const el of walkElements(this.document.system.elements ?? [])) {
      if (el?.kind !== "select" || !el.key) continue;
      html += `<option value="${esc(el.key)}" ${selected === el.key ? "selected" : ""}>${esc(el.label || el.key)} (${esc(el.key)})</option>`;
    }
    if (selected && !html.includes(`value="${esc(selected)}"`)) {
      html += `<option value="${esc(selected)}" selected>${esc(selected)} — ${game.i18n.localize("SBE.Slot.ListKeyMissing")}</option>`;
    }
    return html;
  }

  /** Les LISTES DE RÉFÉRENCES de ce modèle (sauf l'élément édité). */
  #refListOptions(selected, selfKey) {
    let html = "";
    for (const el of walkElements(this.document.system.elements ?? [])) {
      if (!isRefList(el) || !el.key || el.key === selfKey) continue;
      html += `<option value="${foundry.utils.escapeHTML(el.key)}" ${selected === el.key ? "selected" : ""}>${foundry.utils.escapeHTML(el.label || el.key)} (${foundry.utils.escapeHTML(el.key)})</option>`;
    }
    /* Une liste désignée qui n'existe plus reste visible : le créateur
       voit qu'elle manque au lieu de perdre le réglage en silence. */
    if (selected && !html.includes(`value="${foundry.utils.escapeHTML(selected)}"`)) {
      html += `<option value="${foundry.utils.escapeHTML(selected)}" selected>${foundry.utils.escapeHTML(selected)} — ${game.i18n.localize("SBE.Slot.ListKeyMissing")}</option>`;
    }
    return html;
  }

  /** Options des clés nombre/jauge de CE modèle (champ de charges). */
  #numberKeyOptions(selected) {
    let html = "";
    for (const el of walkElements(this.document.system.elements ?? [])) {
      if (!el?.key) continue;
      if (el.kind !== "number" && el.kind !== "gauge") continue;
      if (el.kind === "number" && el.config?.computed) continue;
      html += `<option value="${foundry.utils.escapeHTML(el.key)}" ${selected === el.key ? "selected" : ""}>${foundry.utils.escapeHTML(el.label || el.key)} (${foundry.utils.escapeHTML(el.key)})</option>`;
    }
    return html;
  }

  /** Une colonne de conteneur : clé, libellé, largeur ; en fiches : où, texte, condition, teinte. */
  #contColRowHTML(col = {}) {
    const L = (k) => game.i18n.localize(k);
    const esc = (x) => foundry.utils.escapeHTML(String(x ?? ""));
    const sel = (a, b) => (a === b ? "selected" : "");
    return `
      <input type="text" class="sbe-ccol-key" value="${esc(col.key)}" placeholder="${L("SBE.Inv.ColKeyPh")}" list="sbe-objkeys">
      <input type="text" class="sbe-ccol-label" value="${esc(col.label)}" placeholder="${esc(col.key ? containerKeyLabel(col.key) : L("SBE.Inv.ColLabelPh"))}">
      <input type="text" class="sbe-ccol-width" value="${esc(col.width)}" placeholder="${L("SBE.Inv.ColWidthPh")}" data-contdisplay="list">
      <a class="sbe-ccol-del" title="${L("SBE.Common.Delete")}"><i class="fa-solid fa-trash"></i></a>
      <div class="sbe-ccol-card" data-contdisplay="cards">
        <select class="sbe-ccol-place">${CARD_PLACES.map(p => `<option value="${p}" ${sel(col.place ?? "chip", p)}>${L(`SBE.Inv.CardPlace_${p}`)}</option>`).join("")}</select>
        <input type="text" class="sbe-ccol-text" value="${esc(col.text)}" placeholder="${L("SBE.Inv.CardTextPh")}">
        <input type="text" class="sbe-ccol-showif" value="${esc(col.showIf)}" placeholder="${L("SBE.Inv.CardShowIfPh")}">
        <select class="sbe-ccol-tone">${CARD_TONES.map(t => `<option value="${t}" ${sel(col.tone ?? "", t)}>${L(`SBE.Inv.CardTone_${t || "none"}`)}</option>`).join("")}</select>
      </div>`;
  }

  /**
   * Toutes les clés déclarées par les MODÈLES D'OBJETS du monde :
   * proposées en autocomplétion là où le créateur doit désigner une
   * clé qui vit sur l'objet, pas sur la fiche (colonnes et catégories
   * d'un conteneur).
   */
  #objectKeyOptions() {
    const seen = new Set();
    for (const tpl of game.items.filter(i => i.type === "template")) {
      for (const el of walkElements(tpl.system.elements ?? [])) {
        if (el?.key) seen.add(el.key);
      }
    }
    return [...seen].sort((a, b) => a.localeCompare(b, game.i18n.lang))
      .map(k => `<option value="${foundry.utils.escapeHTML(k)}">`).join("");
  }

  #kindOptions(selected, forcedKind) {
    if (forcedKind) {
      return `<option value="${forcedKind}" selected>${game.i18n.localize(`SBE.Template.Kind.${forcedKind}`)}</option>`;
    }
    let html = "";
    /* L'élément natif QUANTITÉ n'a de sens que sur un modèle d'OBJET
       empilable : ailleurs il n'est même pas proposé. */
    const qtyOk = this.document.documentName === "Item"
      && !!this.document.system.opts?.stackable;
    /* « Composant du modèle » : seulement dans la zone du panneau. */
    const panelOk = this._wtab === "panel";
    const shopOk = this.document.documentName === "Actor" && this.document.system.genre === "shop";
    for (const k of ELEMENT_KINDS) {
      if (k.kind === "quantity" && !qtyOk && selected !== "quantity") continue;
      if (SHOP_KINDS.includes(k.kind) && !shopOk && selected !== k.kind) continue;
      if (k.kind === "ref" && !panelOk && selected !== "ref") continue;
      const label = game.i18n.localize(`SBE.Template.Kind.${k.kind}`);
      const dis = k.enabled ? "" : "disabled";
      const sel = selected === k.kind ? "selected" : "";
      html += `<option value="${k.kind}" ${dis} ${sel}>${label}${k.enabled ? "" : ` — ${game.i18n.localize("SBE.Template.KindSoon")}`}</option>`;
    }
    return html;
  }

  async #openElementDialog(existing, { parentId = "", col = null, forcedKind = null, zone = "", pos = "end" } = {}) {
    const isNew = !existing;
    const el = existing ?? {
      id: foundry.utils.randomID(),
      kind: forcedKind ?? "text",
      key: "", label: "", playerVisible: true,
      config: {}, style: {}
    };
    const c = el.config ?? {};
    /* Les sections de toutes les sortes partagent la config : un champ
       nombre ne reçoit qu'une valeur numérique (le défaut « Soin » d'une
       liste ne va pas dans le défaut d'un nombre). */
    const nv = (v, d = "") => (v !== null && v !== undefined && v !== "" && typeof v !== "boolean" && Number.isFinite(Number(v)) ? v : d);
    const r = c.roll ?? {};          /* Jet de dés du champ */
    const st = el.style ?? {};
    const L = (k) => game.i18n.localize(k);
    const lockedKind = !isNew || !!forcedKind;
    /* Éléments natifs Foundry (portrait, nom) : ni type, ni clé, ni
       libellé, ni visibilité — uniquement leurs options et le Style. */
    const isNative = isNativeKind(el.kind);
    /* Onglet : son au clic (onglet « Média » de la fenêtre). */
    const isTab = el.kind === "tab";
    const colorRow = (labelKey, name, value) => `
      <div class="form-group">
        <label>${L(labelKey)}</label>
        <color-picker name="${name}" value="${foundry.utils.escapeHTML(value ?? "")}"></color-picker>
      </div>`;

    const content = `
      <div class="sbe-el-dialog">
        <nav class="sbe-el-tabs">
          <button type="button" class="sbe-el-tab active" data-tab="base">${L("SBE.Template.TabBase")}</button>
          <button type="button" class="sbe-el-tab" data-tab="style">${L("SBE.Template.TabStyle")}</button>
          ${isNative ? "" : `<button type="button" class="sbe-el-tab" data-tab="tt">${L("SBE.Template.TabTT")}</button>`}
          ${isTab ? `<button type="button" class="sbe-el-tab" data-tab="media">${L("SBE.UiSound.TabMedia")}</button>` : ""}
        </nav>

        <div class="sbe-el-pane" data-pane="base">
          ${isNative ? `
          <input type="hidden" name="kind" value="${el.kind}">
          <p class="notes">${L("SBE.Native.DialogHint")}</p>
          <hr>` : `
          <div class="form-group">
            <label>${L("SBE.Template.ElType")}</label>
            <select name="kind" ${lockedKind && !forcedKind ? "disabled" : ""}>${this.#kindOptions(el.kind, forcedKind ?? (el.kind === "tab" ? "tab" : null))}</select>
          </div>
          <div class="form-group">
            <label>${L("SBE.Template.ElLabel")}</label>
            <input type="text" name="label" value="${foundry.utils.escapeHTML(el.label ?? "")}" placeholder="${L("SBE.Template.ElLabelPh")}">
          </div>
          <div class="form-group">
            <label>${L("SBE.Template.ElKey")}</label>
            <input type="text" name="key" value="${foundry.utils.escapeHTML(el.key ?? "")}" placeholder="${PH("Key")}">
            <p class="notes">${L("SBE.Template.ElKeyHint")}</p>
          </div>
          <div class="form-group">
            <label>${L("SBE.Template.ElLabelIcon")}</label>
            <div style="display:flex;gap:6px;">
              <input type="text" name="labelIcon" value="${foundry.utils.escapeHTML(c.labelIcon ?? "")}" style="flex:1;" placeholder="${L("SBE.Template.NoneParen")}">
              <button type="button" class="sbe-iconpick" data-for="labelIcon" style="flex:none;width:auto;padding:2px 10px;" title="${L("SBE.Template.PickIcon")}">
                <i class="fa-solid fa-icons"></i>
              </button>
            </div>
            <p class="notes">${L("SBE.Template.ElLabelIconHint")}</p>
          </div>
          <div class="form-group">
            <label style="display:flex;align-items:center;gap:6px;">
              <input type="checkbox" name="playerVisible" ${el.playerVisible !== false ? "checked" : ""}>
              ${L("SBE.Template.ElPlayerVisible")}
            </label>
            <p class="notes">${L("SBE.Template.ElPlayerVisibleHint")}</p>
          </div>
          <div class="form-group">
            <label style="display:flex;align-items:center;gap:6px;">
              <input type="checkbox" name="sheetHidden" ${el.sheetHidden ? "checked" : ""}>
              ${L("SBE.Template.ElSheetHidden")}
            </label>
            <p class="notes">${L("SBE.Template.ElSheetHiddenHint")}</p>
          </div>
          <div class="form-group">
            <label>${L("SBE.Template.ElVisibleIf")}</label>
            <p class="notes">${L("SBE.Template.ElVisibleIfHint")}</p>
            <input type="text" name="visibleIf" value="${foundry.utils.escapeHTML(el.visibleIf ?? "")}"
                   placeholder="${PH("ShowIf")}">
          </div>
          <!-- Seulement pour les éléments à VALEUR (pas la structure). -->
          <div class="form-group" data-peditable-box>
            <label style="display:flex;align-items:center;gap:6px;">
              <input type="checkbox" name="playerEditable" ${el.playerEditable !== false ? "checked" : ""}>
              ${L("SBE.Template.ElPlayerEditable")}
            </label>
            <p class="notes">${L("SBE.Template.ElPlayerEditableHint")}</p>
          </div>
          <!-- PROPAGATION (modèles d'objets) : cochée par défaut. Une
               valeur d'état propre à chaque exemplaire se décoche. -->
          ${this.document.documentName === "Item" ? `
          <div class="form-group" data-propagate-box>
            <label style="display:flex;align-items:center;gap:6px;">
              <input type="checkbox" name="propagate" ${el.propagate !== false ? "checked" : ""}>
              ${L("SBE.Propag.ElOption")}
            </label>
            <p class="notes">${L("SBE.Propag.ElOptionHint")}</p>
          </div>
          <div class="form-group">
            <label style="display:flex;align-items:center;gap:6px;">
              <input type="checkbox" name="itemTip" ${el.itemTip ? "checked" : ""}>
              ${L("SBE.ItemTip.ElOption")}
            </label>
            <p class="notes">${L("SBE.ItemTip.ElOptionHint")}</p>
            <label style="display:flex;align-items:center;gap:6px;margin-top:4px;">
              <input type="checkbox" name="itemTipNoDefault" ${el.itemTipNoDefault ? "checked" : ""}>
              ${L("SBE.ItemTip.NoDefault")}
            </label>
            <p class="notes">${L("SBE.ItemTip.NoDefaultHint")}</p>
            <label style="display:flex;align-items:center;gap:6px;margin-top:4px;">
              <input type="checkbox" name="itemTipSigned" ${el.itemTipSigned ? "checked" : ""}>
              ${L("SBE.ItemTip.Signed")}
            </label>
            <p class="notes">${L("SBE.ItemTip.SignedHint")}</p>
          </div>
          <div class="form-group">
            <label style="display:flex;align-items:center;gap:6px;">
              <input type="checkbox" name="hudShow" ${el.hudShow ? "checked" : ""}>
              ${L("SBE.Hud.ElOption")}
            </label>
            <p class="notes">${L("SBE.Hud.ElOptionHint")}</p>
          </div>` : ""}
          <hr>`}

          <div class="sbe-el-opts" data-kind="actorImg">
            <div class="form-group">
              <label>${L("SBE.Template.ImgSize")}</label>
              <div style="display:flex;gap:6px;align-items:center;">
                <input type="number" name="aimg.width" value="${c.width ?? 110}" min="16" style="width:90px;"> ×
                <input type="number" name="aimg.height" value="${c.height ?? 110}" min="16" style="width:90px;"> px
              </div>
              <p class="notes">${L("SBE.Native.ImgHint")}</p>
            </div>
          </div>

          <div class="sbe-el-opts" data-kind="actorName">
            <div class="form-group">
              <label>${L("SBE.Native.SubLabel")}</label>
              <input type="text" name="aname.subLabel" value="${foundry.utils.escapeHTML(c.subLabel ?? "")}"
                     placeholder="${L("SBE.Native.SubLabelPh")}">
              <p class="notes">${L("SBE.Native.SubLabelHint")}</p>
            </div>
          </div>

          <div class="sbe-el-opts" data-kind="text">
            <div class="form-group">
              <label>${L("SBE.Template.DefaultValue")}</label>
              <input type="text" name="text.default" value="${foundry.utils.escapeHTML(c.default ?? "")}" placeholder="${L("SBE.Template.NoneParen")}">
            </div>
            <div class="form-group">
              <label>${L("SBE.Template.FieldWidth")}</label>
              <input type="number" name="text.width" value="${c.width ?? ""}" min="20" step="1" style="width:90px;" placeholder="${L("SBE.Template.ImgAuto")}">
              <p class="notes">${L("SBE.Template.FieldWidthHint")}</p>
            </div>
          </div>

          <div class="sbe-el-opts" data-kind="number">
            <div class="form-group">
              <label style="display:flex;align-items:center;gap:6px;">
                <input type="checkbox" name="num.integer" ${c.integer !== false ? "checked" : ""}>
                ${L("SBE.Template.NumInteger")}
              </label>
            </div>
            <div class="form-group">
              <label>${L("SBE.Template.NumDecimals")}</label>
              <select name="num.decimals" ${c.integer !== false ? "disabled" : ""}>
                ${[1, 2, 3].map(n => `<option value="${n}" ${Number(c.decimals ?? 2) === n ? "selected" : ""}>${n}</option>`).join("")}
              </select>
            </div>
            <div class="form-group">
              <label>${L("SBE.Template.NumMinMax")}</label>
              <div style="display:flex;gap:6px;">
                <input type="number" name="num.min" value="${c.min ?? ""}" placeholder="—" style="width:90px;">
                <input type="number" name="num.max" value="${c.max ?? ""}" placeholder="—" style="width:90px;">
              </div>
              <p class="notes">${L("SBE.Template.MinMaxSubkeysHint")}</p>
            </div>
            <div class="form-group">
              <label>${L("SBE.Gauge.MaxFormula")}</label>
              <input type="text" name="num.maxFormula" value="${foundry.utils.escapeHTML(c.maxFormula ?? "")}" placeholder="${PH("NumMax")}">
              <p class="notes">${L("SBE.Template.NumMaxFormulaHint")}</p>
            </div>
            <div class="form-group">
              <label style="display:flex;align-items:center;gap:6px;">
                <input type="checkbox" name="num.showMax" ${c.showMax ? "checked" : ""}>
                ${L("SBE.Template.NumShowMax")}
              </label>
              <p class="notes">${L("SBE.Template.NumShowMaxHint")}</p>
            </div>
            <div class="form-group">
              <label>${L("SBE.Template.DefaultValue")}</label>
              <input type="number" name="num.default" value="${nv(c.default)}" placeholder="${L("SBE.Template.NoneParen")}">
            </div>
            <div class="form-group">
              <label>${L("SBE.Template.FieldWidth")}</label>
              <input type="number" name="num.width" value="${c.width ?? ""}" min="20" step="1" style="width:90px;" placeholder="${L("SBE.Template.ImgAuto")}">
              <p class="notes">${L("SBE.Template.FieldWidthHint")}</p>
            </div>
            <div class="form-group">
              <label style="display:flex;align-items:center;gap:6px;">
                <input type="checkbox" name="num.computed" ${c.computed ? "checked" : ""}>
                ${L("SBE.Template.NumComputed")}
              </label>
            </div>
            <div class="form-group">
              <label>${L("SBE.Template.NumFormula")}</label>
              <input type="text" name="num.formula" value="${foundry.utils.escapeHTML(c.formula ?? "")}"
                     placeholder="${PH("NumFormula")}" ${c.computed ? "" : "disabled"}>
              <p class="notes">${L("SBE.Template.NumFormulaHint")}</p>
            </div>
            <div class="form-group">
              <label>${L("SBE.Template.NumBonusFormula")}</label>
              <input type="text" name="num.bonusFormula" value="${foundry.utils.escapeHTML(c.bonusFormula ?? "")}"
                     placeholder="${PH("NumMod")}" ${c.computed ? "disabled" : ""}>
              <p class="notes">${L("SBE.Template.NumBonusFormulaHint")}</p>
            </div>
            <div class="form-group">
              <label>${L("SBE.Template.NumBonusTone")}</label>
              <select name="num.bonusTone" ${c.computed ? "disabled" : ""}>
                ${BONUS_TONES.map(t => `<option value="${t}" ${(c.bonusTone ?? "items") === t ? "selected" : ""}>${L(`SBE.Template.NumBonusTone_${t}`)}</option>`).join("")}
              </select>
              <p class="notes">${L("SBE.Template.NumBonusToneHint")}</p>
            </div>
          </div>

          <div class="sbe-el-rollbox" data-rollbox>
            <fieldset class="sbe-st-group">
              <legend>${L("SBE.Roll.Group")}</legend>
              <div class="form-group">
                <label style="display:flex;align-items:center;gap:6px;">
                  <input type="checkbox" name="roll.on" ${r.on ? "checked" : ""}>
                  ${L("SBE.Roll.On")}
                </label>
                <p class="notes">${L("SBE.Roll.OnHint")}</p>
              </div>
              <div class="form-group">
                <label>${L("SBE.Roll.Formula")}</label>
                <input type="text" name="roll.formula" value="${foundry.utils.escapeHTML(r.formula ?? "")}" placeholder="1d100">
                <p class="notes">${L("SBE.Roll.FormulaHint")}</p>
              </div>
              <div class="form-group">
                <label>${L("SBE.Roll.Icon")}</label>
                <p class="notes">${L("SBE.Roll.IconHint")}</p>
                <div style="display:flex;gap:8px;align-items:center;">
                  <select name="roll.icon" style="flex:1;">
                    ${DICE_ICONS.map(di => `<option value="${foundry.utils.escapeHTML(di.v)}" ${(r.icon ?? DICE_ICON_DEFAULT) === di.v ? "selected" : ""}>${L("SBE.Roll.Dice." + di.key)}</option>`).join("")}
                  </select>
                  <span class="sbe-dice-preview">${(() => {
                    const cur = DICE_ICONS.find(di => di.v === (r.icon ?? DICE_ICON_DEFAULT)) ?? DICE_ICONS[0];
                    return cur.cp === null ? cur.v : `<i class="${cur.v}"></i>`;
                  })()}</span>
                </div>
              </div>
              <div class="form-group">
                <label style="display:flex;align-items:center;gap:6px;">
                  <input type="checkbox" name="roll.noIcon" ${r.noIcon ? "checked" : ""}>
                  ${L("SBE.Roll.NoIcon")}
                </label>
                <p class="notes">${L("SBE.Roll.NoIconHint")}</p>
              </div>
              <div class="form-group">
                <label>${L("SBE.Roll.Ids")}</label>
                <p class="notes">${L("SBE.Roll.IdsHint")}</p>
                <input type="text" name="roll.ids" value="${foundry.utils.escapeHTML((r.ids ?? []).join(", "))}"
                       placeholder="${PH("RollIds")}">
              </div>
              <div class="form-group">
                <label>${L("SBE.Roll.Label")}</label>
                <input type="text" name="roll.label" value="${foundry.utils.escapeHTML(r.label ?? "")}" placeholder="${L("SBE.Template.NoneParen")}">
              </div>
              <div class="form-group">
                <label>${L("SBE.Roll.Compare")}</label>
                <select name="roll.compare">
                  ${[["none", "CompareNone"], ["under", "CompareUnder"], ["over", "CompareOver"], ["target", "CompareTarget"], ["targetOver", "CompareTargetOver"]]
                    .map(([vv, kk]) => `<option value="${vv}" ${(r.compare ?? "none") === vv ? "selected" : ""}>${L("SBE.Roll." + kk)}</option>`).join("")}
                </select>
                <p class="notes">${L("SBE.Roll.CompareHint")}</p>
              </div>
              <div class="form-group">
                <label>${L("SBE.Roll.Target")}</label>
                <input type="text" name="roll.target" value="${foundry.utils.escapeHTML(r.target ?? "")}" placeholder="${PH("RollTarget")}">
              </div>
              ${[["critS", "CritS"], ["critF", "CritF"]].map(([nm, kk]) => {
                const cs = r[nm] ?? {};
                return `
              <div class="form-group">
                <label>${L("SBE.Roll." + kk)}</label>
                <div style="display:flex;gap:6px;">
                  <select name="roll.${nm}.mode" style="flex:none;width:auto;">
                    ${[["none", "CritNone"], ["value", "CritValue"], ["formula", "CritFormula"], ["cond", "CritCond"]]
                      .map(([vv, mk]) => `<option value="${vv}" ${(cs.mode ?? "none") === vv ? "selected" : ""}>${L("SBE.Roll." + mk)}</option>`).join("")}
                  </select>
                  <input type="text" name="roll.${nm}.expr" value="${foundry.utils.escapeHTML(cs.expr ?? "")}"
                         style="flex:1;" placeholder="${PH(nm === "critS" ? "CritS" : "CritF")}"
                         ${(cs.mode ?? "none") === "none" ? "disabled" : ""}>
                </div>
                <p class="notes">${L("SBE.Roll." + kk + "Hint")}</p>
              </div>`;
              }).join("")}
              <div class="form-group">
                <label style="display:flex;align-items:center;gap:6px;">
                  <input type="checkbox" name="roll.critDie" ${r.critDie ? "checked" : ""}>
                  ${L("SBE.Roll.CritDie")}
                </label>
                <p class="notes">${L("SBE.Roll.CritDieHint")}</p>
              </div>
              <div class="form-group">
                <label>${L("SBE.Roll.NatShift")}</label>
                <div style="display:flex;gap:6px;align-items:center;">
                  <span>${L("SBE.Roll.NatUp")}</span>
                  <input type="number" name="roll.natUp" value="${r.natUp ?? ""}" step="1" style="width:80px;" placeholder="—">
                  <span>${L("SBE.Roll.NatDown")}</span>
                  <input type="number" name="roll.natDown" value="${r.natDown ?? ""}" step="1" style="width:80px;" placeholder="—">
                </div>
                <p class="notes">${L("SBE.Roll.NatShiftHint")}</p>
              </div>
              <div class="form-group">
                <label>${L("SBE.Roll.Apply")}</label>
                <select name="roll.apply">
                  ${[["none", "ApplyNone"], ["add", "ApplyAdd"], ["sub", "ApplySub"], ["set", "ApplySet"]]
                    .map(([vv, kk]) => `<option value="${vv}" ${(r.apply ?? "none") === vv ? "selected" : ""}>${L("SBE.Roll." + kk)}</option>`).join("")}
                </select>
                <p class="notes">${L("SBE.Roll.ApplyHint")}</p>
              </div>
              ${(() => {
                const d = r.dialog ?? {};
                const box = (nm, kk) => `
              <div class="form-group">
                <label style="display:flex;align-items:center;gap:6px;">
                  <input type="checkbox" name="roll.dlg.${nm}" ${d[nm] ? "checked" : ""}>
                  ${L("SBE.Roll." + kk)}
                </label>
                <p class="notes">${L("SBE.Roll." + kk + "Hint")}</p>
              </div>`;
                return `
              <fieldset class="sbe-st-group">
              <legend>${L("SBE.Roll.DlgGroup")}</legend>
              <p class="notes">${L("SBE.Roll.DlgGroupHint")}</p>
              ${box("adv", "OptAdv")}
              <div class="form-group">
                <label>${L("SBE.Roll.OptAdvCount")}</label>
                <input type="number" name="roll.dlg.advCount" value="${Number(d.advCount) || 2}" min="2" max="10" step="1" ${d.adv ? "" : "disabled"}>
                <p class="notes">${L("SBE.Roll.OptAdvCountHint")}</p>
              </div>
              ${box("mod", "OptMod")}
              ${box("target", "OptTarget")}
              ${box("mode", "OptMode")}
              </fieldset>
              <fieldset class="sbe-st-group">
              <legend>${L("SBE.Roll.VisGroup")}</legend>
              <p class="notes">${L("SBE.Roll.VisGroupHint")}</p>
              ${visPolicyHTML("roll.vis", r.vis)}
              </fieldset>
              <fieldset class="sbe-st-group">
              <legend>${L("SBE.After.Group")}</legend>
              <p class="notes">${L("SBE.After.GroupHint")}</p>
              <datalist id="sbe-after-keys">${getKeyRefChoices("actor").map(k => `<option value="${foundry.utils.escapeHTML(k.key)}">${foundry.utils.escapeHTML(k.label ?? k.key)}</option>`).join("")}</datalist>
              ${afterEditorHtml(r.after, "sbe-after-keys")}
              </fieldset>`;
              })()}
            </fieldset>
          </div>

          <div class="sbe-el-opts" data-kind="color">
            <div class="form-group">
              <label>${L("SBE.Template.ColorDefault")}</label>
              <input type="color" name="color.default" value="${foundry.utils.escapeHTML(/^#[0-9a-f]{6}$/i.test(String(c.default ?? "")) ? c.default : "#ffffff")}">
              <p class="notes">${L("SBE.Template.ColorHint")}</p>
            </div>
          </div>

          <div class="sbe-el-opts" data-kind="shopStall">
            ${(() => { const sc = stallConfig(el); const o = (v, cur, k) => `<option value="${v}" ${v === cur ? "selected" : ""}>${L(k)}</option>`; return `
            <div class="form-group">
              <label>${L("SBE.Shop.View")}</label>
              <select name="stall.view">${STALL_VIEWS.map(vw => o(vw, sc.view, `SBE.Shop.View_${vw}`)).join("")}</select>
            </div>
            <div class="form-group"><label>${L("SBE.Shop.Cols")}</label><input type="number" name="stall.cols" min="1" max="4" step="1" value="${sc.cols}"></div>
            <div class="form-group"><label>${L("SBE.Inv.CellSize")}</label><input type="number" name="stall.cellSize" min="24" step="1" value="${sc.cellSize}"></div>
            <div class="form-group"><label>${L("SBE.Inv.GridCols")}</label><input type="number" name="stall.gridCols" min="0" step="1" value="${sc.gridCols}"></div>
            <div class="form-group"><label>${L("SBE.Inv.GridRows")}</label><input type="number" name="stall.gridRows" min="0" step="1" value="${sc.gridRows}"></div>
            <p class="notes">${L("SBE.Shop.ViewHint")}</p>
            <div class="form-group">
              <label>${L("SBE.Shop.Tabs")}</label>
              <select name="stall.tabs">${STALL_TABS.map(t => o(t, sc.tabs, `SBE.Shop.Tabs_${t}`)).join("")}</select>
            </div>
            <div class="form-group"><label>${L("SBE.Shop.TabKey")}</label><input type="text" name="stall.tabKey" list="sbe-shop-itemkeys" value="${foundry.utils.escapeHTML(sc.tabKey)}">
              <datalist id="sbe-shop-itemkeys">${this.#objectKeyOptions()}</datalist>
              <p class="notes">${L("SBE.Shop.TabKeyHint")}</p></div>
            <label class="form-group" style="display:flex;align-items:center;gap:6px;"><input type="checkbox" name="stall.showQty" ${sc.showQty ? "checked" : ""}> ${L("SBE.Shop.ShowQty")}</label>
            <div class="form-group">
              <label>${L("SBE.Shop.SoldOutShow")}</label>
              <select name="stall.soldOut">${o("show", sc.soldOut, "SBE.Shop.SoldOut_show")}${o("hide", sc.soldOut, "SBE.Shop.SoldOut_hide")}</select>
            </div>`; })()}
          </div>
          <div class="sbe-el-opts" data-kind="shopSell">
            <div class="form-group"><label>${L("SBE.Shop.SellText")}</label>
              <input type="text" name="sell.text" value="${foundry.utils.escapeHTML(String(c.text ?? ""))}" placeholder="${foundry.utils.escapeHTML(L("SBE.Shop.SellDrop"))}"></div>
          </div>

          <div class="sbe-el-opts" data-kind="level">
            <div class="form-group">
              <label>${L("SBE.Level.Start")}</label>
              <input type="number" name="lvl.start" min="0" step="1" value="${foundry.utils.escapeHTML(String(nv(c.default, 1)))}">
            </div>
            <div class="form-group">
              <label>${L("SBE.Level.Max")}</label>
              <input type="text" name="lvl.max" value="${foundry.utils.escapeHTML(String(c.max ?? ""))}" placeholder="${L("SBE.Level.MaxPh")}">
            </div>
            <div class="form-group">
              <label>${L("SBE.Level.Mode")}</label>
              <select name="lvl.mode">
                ${LEVEL_MODES.map(m => `<option value="${m}" ${(c.mode ?? "given") === m ? "selected" : ""}>${L(`SBE.Level.Mode_${m}`)}</option>`).join("")}
              </select>
              <p class="notes">${L("SBE.Level.ModeHint")}</p>
            </div>
            <div class="form-group">
              <label>${L("SBE.Level.XpKey")}</label>
              <input type="text" name="lvl.xpKey" list="sbe-lvl-keys" value="${foundry.utils.escapeHTML(String(c.xpKey ?? ""))}">
              <datalist id="sbe-lvl-keys">${getKeyRefChoices("actor").map(k => `<option value="${foundry.utils.escapeHTML(k.key)}">${foundry.utils.escapeHTML(k.label ?? k.key)}</option>`).join("")}</datalist>
            </div>
            <div class="form-group">
              <label>${L("SBE.Level.Thresholds")}</label>
              <input type="text" name="lvl.thresholds" value="${foundry.utils.escapeHTML(String(c.thresholds ?? ""))}" placeholder="100, 300, 600 — level * 1000">
              <p class="notes">${L("SBE.Level.ThresholdsHint")}</p>
            </div>
            <label class="form-group" style="display:flex;align-items:center;gap:6px;"><input type="checkbox" name="lvl.showMax" ${c.showMax ? "checked" : ""}> ${L("SBE.Level.ShowMax")}</label>
            <div class="form-group">
              <label>${L("SBE.Level.Gauge")}</label>
              <select name="lvl.gauge">
                ${LEVEL_GAUGES.map(g => `<option value="${g}" ${(c.gauge ?? "none") === g ? "selected" : ""}>${L(`SBE.Level.Gauge_${g}`)}</option>`).join("")}
              </select>
            </div>
            <label class="form-group" style="display:flex;align-items:center;gap:6px;"><input type="checkbox" name="lvl.button" ${c.button === false ? "" : "checked"}> ${L("SBE.Level.Button")}</label>
            <h4>${L("SBE.Level.PassTitle")}</h4>
            <div class="form-group">
              <label>${L("SBE.Level.Who")}</label>
              <select name="lvl.who">${LEVEL_WHO.map(w => `<option value="${w}" ${(c.who ?? "player") === w ? "selected" : ""}>${L(`SBE.Talents.Who_${w}`)}</option>`).join("")}</select>
            </div>
            <div class="form-group">
              <label>${L("SBE.Level.Commit")}</label>
              <select name="lvl.commit">${LEVEL_COMMIT.map(w => `<option value="${w}" ${(c.commit ?? "validate") === w ? "selected" : ""}>${L(`SBE.Level.Commit_${w}`)}</option>`).join("")}</select>
              <p class="notes">${L("SBE.Level.CommitHint")}</p>
            </div>
            <div class="form-group">
              <label>${L("SBE.Level.Received")}</label>
              <select name="lvl.received">${LEVEL_RECEIVED.map(w => `<option value="${w}" ${(c.received ?? "available") === w ? "selected" : ""}>${L(`SBE.Level.Received_${w}`)}</option>`).join("")}</select>
              <p class="notes">${L("SBE.Level.ReceivedHint")}</p>
            </div>
            <div class="form-group">
              <label>${L("SBE.Level.BudgetPoints")}</label>
              <input type="text" name="lvl.bPoints" value="${foundry.utils.escapeHTML(String(c.budget?.points ?? ""))}" placeholder="3 — level >= 5 ? 4 : 2">
            </div>
            <div class="form-group">
              <label>${L("SBE.Level.BudgetFields")}</label>
              <input type="text" name="lvl.bFields" value="${foundry.utils.escapeHTML(String(c.budget?.fields ?? ""))}" placeholder="force:1, agilite:2">
              <p class="notes">${L("SBE.Level.BudgetFieldsHint")}</p>
            </div>
            <label class="form-group" style="display:flex;align-items:center;gap:6px;"><input type="checkbox" name="lvl.bMust" ${c.budget?.mustSpend ? "checked" : ""}> ${L("SBE.Level.BudgetMustLabel")}</label>
            <label class="form-group" style="display:flex;align-items:center;gap:6px;"><input type="checkbox" name="lvl.bSell" ${c.budget?.sell ? "checked" : ""}> ${L("SBE.Level.BudgetSellLabel")}</label>
            <div class="form-group">
              <label>${L("SBE.Level.LeftoverKey")}</label>
              <input type="text" name="lvl.bLeft" list="sbe-lvl-keys" value="${foundry.utils.escapeHTML(String(c.budget?.leftoverKey ?? ""))}">
              <p class="notes">${L("SBE.Level.LeftoverKeyHint")}</p>
            </div>
            <p class="notes">${L("SBE.Level.ComponentHint")}</p>
          </div>

          <div class="sbe-el-opts" data-kind="talents">
            <div class="form-group">
              <label>${L("SBE.Talents.Display")}</label>
              <select name="tal.display">
                ${TREE_DISPLAYS.map(d => `<option value="${d}" ${(c.display ?? "inline") === d ? "selected" : ""}>${L(`SBE.Talents.Display_${d}`)}</option>`).join("")}
              </select>
            </div>
            <div class="form-group">
              <label>${L("SBE.Talents.Height")}</label>
              <input type="number" name="tal.height" min="120" max="2000" step="10" value="${foundry.utils.escapeHTML(String(nv(c.height, TREE_DEFAULT_HEIGHT)))}">
              <p class="notes">${L("SBE.Talents.HeightHint")}</p>
            </div>
            <div class="form-group">
              <label>${L("SBE.Talents.PointsKey")}</label>
              <input type="text" name="tal.pointsKey" list="sbe-tal-keys" value="${foundry.utils.escapeHTML(String(c.pointsKey ?? ""))}" placeholder="${L("SBE.Talents.PointsKeyPh")}">
              <datalist id="sbe-tal-keys">${getKeyRefChoices("actor").map(k => `<option value="${foundry.utils.escapeHTML(k.key)}">${foundry.utils.escapeHTML(k.label ?? k.key)}</option>`).join("")}</datalist>
              <p class="notes">${L("SBE.Talents.PointsKeyHint")}</p>
            </div>
            <div class="form-group">
              <label>${L("SBE.Talents.Who")}</label>
              <select name="tal.who">
                ${TREE_WHO.map(w => `<option value="${w}" ${(c.who ?? "player") === w ? "selected" : ""}>${L(`SBE.Talents.Who_${w}`)}</option>`).join("")}
              </select>
            </div>
            <div class="form-group">
              <label>${L("SBE.Talents.Refund")}</label>
              <select name="tal.refund">
                ${TREE_REFUNDS.map(w => `<option value="${w}" ${(c.refund ?? "none") === w ? "selected" : ""}>${L(`SBE.Talents.Refund_${w}`)}</option>`).join("")}
              </select>
              <p class="notes">${L("SBE.Talents.RefundHint")}</p>
            </div>
            <div class="form-group">
              <label>${L("SBE.Talents.RefundWho")}</label>
              <select name="tal.refundWho">
                ${TREE_WHO.map(w => `<option value="${w}" ${(c.refundWho ?? "player") === w ? "selected" : ""}>${L(`SBE.Talents.Who_${w}`)}</option>`).join("")}
              </select>
            </div>
            <div class="form-group">
              <label>${L("SBE.Talents.RefundPct")}</label>
              <input type="number" name="tal.refundPct" min="0" max="100" step="5" value="${foundry.utils.escapeHTML(String(nv(c.refundPct, 100)))}">
              <p class="notes">${L("SBE.Talents.RefundPctHint")}</p>
            </div>
            <div class="form-group">
              <label>${L("SBE.Talents.RewardsBack")}</label>
              <select name="tal.rewardsBack">
                ${TREE_REWARDS_BACK.map(w => `<option value="${w}" ${(c.rewardsBack ?? "remove") === w ? "selected" : ""}>${L(`SBE.Talents.RewardsBack_${w}`)}</option>`).join("")}
              </select>
              <p class="notes">${L("SBE.Talents.RewardsBackHint")}</p>
            </div>
            <p class="notes">${L("SBE.Talents.ComponentHint")}</p>
          </div>

          <div class="sbe-el-opts" data-kind="checkbox">
            <div class="form-group">
              <label style="display:flex;align-items:center;gap:6px;">
                <input type="checkbox" name="chk.default" ${c.default ? "checked" : ""}>
                ${L("SBE.Template.ChkDefault")}
              </label>
            </div>
          </div>

          <div class="sbe-el-opts" data-kind="select">
            <div class="form-group">
              <label>${L("SBE.Template.SelChoices")}</label>
              <textarea name="sel.choices" rows="5" placeholder="${L("SBE.Template.SelChoicesPh")}">${(Array.isArray(c.choices) ? c.choices : []).map(foundry.utils.escapeHTML).join("\n")}</textarea>
              <p class="notes">${L("SBE.Template.SelChoicesHint")}</p>
            </div>
            <div class="form-group">
              <label>${L("SBE.ItemTip.ChoiceColors")}</label>
              <p class="notes">${L("SBE.ItemTip.ChoiceColorsHint")}</p>
              <div class="sbe-sel-colors" data-colors="${foundry.utils.escapeHTML(JSON.stringify(c.choiceColors ?? {}))}"></div>
            </div>
            ${this.document.documentName === "Item" ? `
            <div class="form-group">
              <label style="display:flex;align-items:center;gap:6px;">
                <input type="checkbox" name="sel.headerColor" ${c.headerColor ? "checked" : ""}>
                ${L("SBE.ItemTip.HeaderColor")}
              </label>
              <p class="notes">${L("SBE.ItemTip.HeaderColorHint")}</p>
            </div>` : ""}
            <div class="form-group">
              <label>${L("SBE.Template.DefaultValue")}</label>
              <input type="text" name="sel.default" value="${foundry.utils.escapeHTML(c.default ?? "")}" placeholder="${L("SBE.Template.SelDefaultPh")}">
            </div>
          </div>

          <div class="sbe-el-opts" data-kind="image">
            <div class="form-group">
              <label>${L("SBE.Template.ImgDefault")}</label>
              <p class="notes">${L("SBE.Template.ImgDefaultHint")}</p>
              <div class="sbe-imgchoice">
                <input type="text" name="img.defaultIcon" class="ic-icon" value="${foundry.utils.escapeHTML(c.defaultIcon ?? "")}" placeholder="${L("SBE.Template.ImgChoiceIcon")}">
                <button type="button" class="sbe-iconpick" data-for="img.defaultIcon" title="${L("SBE.Template.PickIcon")}"><i class="fa-solid fa-icons"></i></button>
                <input type="text" name="img.defaultLabel" class="ic-label" value="${foundry.utils.escapeHTML(c.defaultLabel ?? "")}" placeholder="${L("SBE.Template.ImgChoiceName")}">
                <input type="text" name="img.default" class="ic-path" value="${foundry.utils.escapeHTML(c.default ?? "")}" placeholder="${L("SBE.Template.ImgChoicePath")}">
                <button type="button" class="sbe-el-imgpick" title="${L("SBE.Common.Image")}"><i class="fa-solid fa-folder-open"></i></button>
              </div>
            </div>
            <div class="form-group">
              <label>${L("SBE.Template.ImgChoices")}</label>
              <p class="notes">${L("SBE.Template.ImgChoicesHint")}</p>
              <div class="sbe-imgchoices" data-imgchoices>
                ${(Array.isArray(c.choices) ? c.choices : []).map(ch => `
                  <div class="sbe-imgchoice">
                    <input type="text" class="ic-icon" value="${foundry.utils.escapeHTML(ch.icon ?? "")}" placeholder="${L("SBE.Template.ImgChoiceIcon")}">
                    <button type="button" class="ic-ico" title="${L("SBE.Template.PickIcon")}"><i class="fa-solid fa-icons"></i></button>
                    <input type="text" class="ic-label" value="${foundry.utils.escapeHTML(ch.label ?? "")}" placeholder="${L("SBE.Template.ImgChoiceName")}">
                    <input type="text" class="ic-path" value="${foundry.utils.escapeHTML(ch.path ?? "")}" placeholder="${L("SBE.Template.ImgChoicePath")}">
                    <button type="button" class="ic-pick" title="${L("SBE.Common.Image")}"><i class="fa-solid fa-folder-open"></i></button>
                    <button type="button" class="ic-del" title="${L("SBE.Template.DeleteElTitle")}"><i class="fa-solid fa-trash"></i></button>
                  </div>`).join("")}
              </div>
              <button type="button" class="sbe-imgchoice-add">
                <i class="fa-solid fa-plus"></i> ${L("SBE.Template.ImgChoiceAdd")}
              </button>
            </div>
            <div class="form-group">
              <label>${L("SBE.Template.ImgPickerPos")}</label>
              <select name="img.pickerPos">
                ${[
                  ["topLeft", "PosTopLeft"], ["topCenter", "PosTopCenter"], ["topRight", "PosTopRight"],
                  ["bottomLeft", "PosBottomLeft"], ["bottomCenter", "PosBottomCenter"], ["bottomRight", "PosBottomRight"],
                  ["leftTop", "PosLeftTop"], ["leftBottom", "PosLeftBottom"],
                  ["rightTop", "PosRightTop"], ["rightBottom", "PosRightBottom"]
                ].map(([vv, kk]) => `<option value="${vv}" ${(c.pickerPos ?? "bottomCenter") === vv ? "selected" : ""}>${L("SBE.Template." + kk)}</option>`).join("")}
              </select>
            </div>
            <div class="form-group">
              <label>${L("SBE.Template.ImgSize")}</label>
              <div style="display:flex;gap:6px;align-items:center;">
                <input type="number" name="img.width" value="${c.width ?? ""}" min="16" step="1" style="width:90px;" placeholder="${L("SBE.Template.ImgAuto")}">
                <span>×</span>
                <input type="number" name="img.height" value="${c.height ?? ""}" min="16" step="1" style="width:90px;" placeholder="${L("SBE.Template.ImgAuto")}">
              </div>
              <p class="notes">${L("SBE.Template.ImgSizeHint")}</p>
            </div>
          </div>

          <div class="sbe-el-opts" data-kind="frame">
            <fieldset class="sbe-st-group">
              <legend>${L("SBE.Free.Group")}</legend>
              <div class="form-group">
                <label style="display:flex;align-items:center;gap:6px;">
                  <input type="checkbox" name="frame.freePos" ${c.freePos ? "checked" : ""}>
                  ${L("SBE.Free.On")}
                </label>
                <p class="notes">${L("SBE.Free.OnHint")}</p>
              </div>
            </fieldset>
            <div class="form-group">
              <label style="display:flex;align-items:center;gap:6px;">
                <input type="checkbox" name="frame.collapsible" ${c.noCollapse ? "" : "checked"}>
                ${L("SBE.Template.FrameCollapsible")}
              </label>
              <p class="notes">${L("SBE.Template.FrameCollapsibleHint")}</p>
            </div>
            <div class="form-group">
              <label style="display:flex;align-items:center;gap:6px;">
                <input type="checkbox" name="frame.pinned" ${c.pinned ? "checked" : ""}>
                ${L("SBE.Template.FramePinned")}
              </label>
              <p class="notes">${L("SBE.Template.FramePinnedHint")}</p>
            </div>
            <div class="form-group">
              <label style="display:flex;align-items:center;gap:6px;">
                <input type="checkbox" name="frame.startCollapsed" ${c.startCollapsed ? "checked" : ""}>
                ${L("SBE.Template.FrameStartCollapsed")}
              </label>
            </div>
            <div class="form-group">
              <label style="display:flex;align-items:center;gap:6px;">
                <input type="checkbox" name="frame.bare" ${c.bare ? "checked" : ""}>
                ${L("SBE.Template.FrameBare")}
              </label>
              <p class="notes">${L("SBE.Template.FrameBareHint")}</p>
            </div>
            <div class="form-group">
              <label>${L("SBE.Template.FrameCaretPos")}</label>
              <select name="frame.caretPos">
                ${[["left", "FrameCaretLeft"], ["center", "FrameCaretCenter"], ["right", "FrameCaretRight"]]
                  .map(([vv, kk]) => `<option value="${vv}" ${(c.caretPos ?? "left") === vv ? "selected" : ""}>${L("SBE.Template." + kk)}</option>`).join("")}
              </select>
            </div>
            <div class="form-group">
              <label>${L("SBE.Template.FrameTitlePos")}</label>
              <select name="frame.titlePos">
                <option value="in" ${(c.titlePos ?? "in") !== "above" ? "selected" : ""}>${L("SBE.Template.FrameTitleIn")}</option>
                <option value="above" ${c.titlePos === "above" ? "selected" : ""}>${L("SBE.Template.FrameTitleAbove")}</option>
              </select>
              <p class="notes">${L("SBE.Template.FrameTitlePosHint")}</p>
            </div>
          </div>

          <div class="sbe-el-opts" data-kind="nav">
            <div class="form-group">
              <label>${L("SBE.Template.NavOrient")}</label>
              <select name="nav.orient">
                <option value="h" ${c.orient !== "v" ? "selected" : ""}>${L("SBE.Template.NavOrientH")}</option>
                <option value="v" ${c.orient === "v" ? "selected" : ""}>${L("SBE.Template.NavOrientV")}</option>
              </select>
            </div>
            <div class="form-group">
              <label>${L("SBE.Template.NavAlign")}</label>
              <select name="nav.align">
                ${[["left", "NavAlignLeft"], ["center", "NavAlignCenter"], ["right", "NavAlignRight"]]
                  .map(([vv, kk]) => `<option value="${vv}" ${(c.align ?? "left") === vv ? "selected" : ""}>${L("SBE.Template." + kk)}</option>`).join("")}
              </select>
              <p class="notes">${L("SBE.Template.NavAlignHint")}</p>
            </div>
            <div class="form-group">
              <label>${L("SBE.Template.NavSide")}</label>
              <select name="nav.side">
                <option value="left" ${c.side !== "right" ? "selected" : ""}>${L("SBE.Template.NavSideLeft")}</option>
                <option value="right" ${c.side === "right" ? "selected" : ""}>${L("SBE.Template.NavSideRight")}</option>
              </select>
              <p class="notes">${L("SBE.Template.NavSideHint")}</p>
            </div>
          </div>

          <div class="sbe-el-opts" data-kind="tab">
            <div class="form-group">
              <label>${L("SBE.Template.TabIcon")}</label>
              <div style="display:flex;gap:6px;">
                <input type="text" name="tab.icon" value="${foundry.utils.escapeHTML(c.icon ?? "")}" style="flex:1;" placeholder="fa-solid fa-star">
                <button type="button" class="sbe-iconpick" data-for="tab.icon" style="flex:none;width:auto;padding:2px 10px;" title="${L("SBE.Template.PickIcon")}">
                  <i class="fa-solid fa-icons"></i>
                </button>
              </div>
              <p class="notes">${L("SBE.Template.TabIconHint")}</p>
            </div>
            <div class="form-group">
              <label>${L("SBE.Template.TabTooltip")}</label>
              <input type="text" name="tab.tooltip" value="${foundry.utils.escapeHTML(c.tooltip ?? "")}">
              <p class="notes">${L("SBE.Template.TabTooltipHint")}</p>
            </div>
          </div>

          <div class="sbe-el-opts" data-kind="richtext">
            <div class="form-group">
              <label>${L("SBE.Rich.Paper")}</label>
              <select name="rich.paper">
                <option value="" ${c.paper !== "lined" ? "selected" : ""}>${L("SBE.Rich.PaperNone")}</option>
                <option value="lined" ${c.paper === "lined" ? "selected" : ""}>${L("SBE.Rich.PaperLined")}</option>
              </select>
            </div>
            <div class="form-group">
              <label>${L("SBE.Rich.Editor")}</label>
              <select name="rich.editor">
                <option value="" ${c.editor !== "open" ? "selected" : ""}>${L("SBE.Rich.EditorToggle")}</option>
                <option value="open" ${c.editor === "open" ? "selected" : ""}>${L("SBE.Rich.EditorOpen")}</option>
              </select>
              <p class="notes">${L("SBE.Rich.EditorHint")}</p>
            </div>
            <div class="form-group">
              <label>${L("SBE.Rich.MinHeight")}</label>
              <input type="number" name="rich.minHeight" value="${c.minHeight ?? ""}" min="0" step="10" style="width:90px;" placeholder="${L("SBE.Template.ImgAuto")}">
            </div>
          </div>

          <div class="sbe-el-opts" data-kind="quantity">
            <p class="notes">${L("SBE.Inv.QtyHint")}</p>
            <div class="form-group">
              <label>${L("SBE.Template.ElDefault")}</label>
              <input type="number" name="qty.default" value="${nv(c.default, 1)}" min="1" step="1" style="width:90px;">
            </div>
          </div>

          <div class="sbe-el-opts" data-kind="container">
            <div class="form-group">
              <label>${L("SBE.Inv.Mode")}</label>
              <select name="cont.mode">
                <option value="carried" ${c.mode !== "reference" ? "selected" : ""}>${L("SBE.Inv.ModeCarried")}</option>
                <option value="reference" ${c.mode === "reference" ? "selected" : ""}>${L("SBE.Inv.ModeReference")}</option>
              </select>
              <p class="notes">${L("SBE.Inv.ModeHint")}</p>
            </div>
            <div class="form-group" data-ref-only>
              <label>${L("SBE.Inv.Mirror")}</label>
              <p class="notes">${L("SBE.Inv.MirrorHint")}</p>
              <select name="cont.mirror">
                <option value="">${L("SBE.Inv.MirrorNone")}</option>
                ${this.#refListOptions(c.mirror ?? "", el?.key ?? "")}
              </select>
            </div>
            <div class="form-group" data-ref-only>
              <label>${L("SBE.Inv.Reverse")}</label>
              <p class="notes">${L("SBE.Inv.ReverseHint")}</p>
              <input type="text" name="cont.reverse" value="${foundry.utils.escapeHTML(c.reverse ?? "")}" placeholder="${PH("ContReverse")}">
            </div>
            <div class="form-group" data-ref-only>
              <label style="display:flex;align-items:center;gap:6px;">
                <input type="checkbox" name="cont.ownedOnly" ${c.ownedOnly ? "checked" : ""}>
                ${L("SBE.Inv.OwnedOnly")}
              </label>
              <p class="notes">${L("SBE.Inv.OwnedOnlyHint")}</p>
            </div>
            <div class="form-group">
              <label style="display:flex;align-items:center;gap:6px;">
                <input type="checkbox" name="cont.unique" ${c.unique ? "checked" : ""}>
                ${L("SBE.Inv.Unique")}
              </label>
              <p class="notes">${L("SBE.Inv.UniqueHint")}</p>
            </div>
            <div class="form-group">
              <label style="display:flex;align-items:center;gap:6px;">
                <input type="checkbox" name="cont.equips" ${c.equips ? "checked" : ""}>
                ${L("SBE.Inv.Equips")}
              </label>
              <p class="notes">${L("SBE.Inv.EquipsHint")}</p>
            </div>
            <div class="form-group" data-ref-only>
              <label style="display:flex;align-items:center;gap:6px;">
                <input type="checkbox" name="cont.toChat" ${c.toChat ? "checked" : ""}>
                ${L("SBE.Inv.ToChat")}
              </label>
              <p class="notes">${L("SBE.Inv.ToChatHint")}</p>
            </div>
            <div class="form-group">
              <label>${L("SBE.Inv.Display")}</label>
              <select name="cont.display">
                <option value="list" ${(c.display ?? "list") === "list" ? "selected" : ""}>${L("SBE.Inv.DisplayList")}</option>
                <option value="grid" ${c.display === "grid" ? "selected" : ""}>${L("SBE.Inv.DisplayGrid")}</option>
                <option value="spatial" ${c.display === "spatial" ? "selected" : ""}>${L("SBE.Inv.DisplaySpatial")}</option>
                <option value="tiles" ${c.display === "tiles" ? "selected" : ""}>${L("SBE.Inv.DisplayTiles")}</option>
                <option value="cards" ${c.display === "cards" ? "selected" : ""}>${L("SBE.Inv.DisplayCards")}</option>
              </select>
              <p class="notes">${L("SBE.Inv.DisplayHint")}</p>
            </div>
            <div data-contdisplay="cards">
              <p class="notes">${L("SBE.Inv.CardsHint")}</p>
              <div class="form-group">
                <label>${L("SBE.Inv.CardLock")}</label>
                <input type="text" name="cont.cardLock" value="${foundry.utils.escapeHTML(c.cardLock ?? "")}" list="sbe-objkeys" placeholder="${L("SBE.Inv.CardLockPh")}">
                <p class="notes">${L("SBE.Inv.CardLockHint")}</p>
              </div>
              <div class="form-group">
                <label>${L("SBE.Inv.CardDescF")}</label>
                <input type="text" name="cont.cardDesc" value="${foundry.utils.escapeHTML(c.cardDesc ?? "")}" list="sbe-objkeys" placeholder="${L("SBE.Inv.CardDescPh")}">
                <p class="notes">${L("SBE.Inv.CardDescHint")}</p>
              </div>
              <div class="form-group">
                <label>${L("SBE.Inv.CardGauge")}</label>
                <input type="text" name="cont.cardGauge" value="${foundry.utils.escapeHTML(c.cardGauge ?? "")}" list="sbe-objkeys" placeholder="${L("SBE.Inv.CardGaugePh")}">
                <p class="notes">${L("SBE.Inv.CardGaugeHint")}</p>
              </div>
              <div class="form-group">
                <label>${L("SBE.Inv.CardGaugeLabel")}</label>
                <input type="text" name="cont.cardGaugeLabel" value="${foundry.utils.escapeHTML(c.cardGaugeLabel ?? "")}">
              </div>
              <div class="form-group">
                <label>${L("SBE.Inv.CardEmpty")}</label>
                <input type="text" name="cont.emptyText" value="${foundry.utils.escapeHTML(c.emptyText ?? "")}" placeholder="${L("SBE.Inv.CardsEmpty")}">
              </div>
              <div class="form-group">
                <label style="display:flex;align-items:center;gap:6px;">
                  <input type="checkbox" name="cont.cardSplit" ${c.cardSplit ? "checked" : ""}>
                  ${L("SBE.Inv.CardSplit")}
                </label>
                <p class="notes">${L("SBE.Inv.CardSplitHint")}</p>
              </div>
            </div>
            <div data-contdisplay="spatial">
              <p class="notes">${L("SBE.Inv.SpatialHint")}</p>
              <div class="form-group">
                <label>${L("SBE.Inv.GridCols")}</label>
                <input type="number" name="cont.spCols" value="${c.gridCols || SPATIAL_DEFAULT_COLS}" min="1" max="50" step="1" style="width:90px;">
              </div>
              <div class="form-group">
                <label>${L("SBE.Inv.GridRows")}</label>
                <input type="number" name="cont.spRows" value="${c.gridRows || SPATIAL_DEFAULT_ROWS}" min="1" max="100" step="1" style="width:90px;">
                <p class="notes">${L("SBE.Inv.SpatialSizeHint")}</p>
              </div>
              <div class="form-group">
                <label>${L("SBE.Inv.CellSize")}</label>
                <input type="number" name="cont.spCell" value="${c.cellSize || ""}" min="24" max="256" step="1" style="width:90px;" placeholder="56">
                <p class="notes">${L("SBE.Inv.SpatialCellHint")}</p>
              </div>
            </div>
            <div data-contdisplay="grid">
              <div class="form-group">
                <label>${L("SBE.Inv.GridCols")}</label>
                <input type="number" name="cont.gridCols" value="${c.gridCols || ""}" min="1" max="50" step="1" style="width:90px;" placeholder="${L("SBE.Inv.GridAuto")}">
                <p class="notes">${L("SBE.Inv.GridColsHint")}</p>
              </div>
              <div class="form-group">
                <label>${L("SBE.Inv.GridRows")}</label>
                <input type="number" name="cont.gridRows" value="${c.gridRows || ""}" min="1" max="100" step="1" style="width:90px;" placeholder="${L("SBE.Inv.GridInfinite")}">
                <p class="notes">${L("SBE.Inv.GridRowsHint")}</p>
              </div>
              <div class="form-group">
                <label>${L("SBE.Inv.CellSize")}</label>
                <input type="number" name="cont.cellSize" value="${c.cellSize || ""}" min="24" max="256" step="1" style="width:90px;" placeholder="56">
                <p class="notes">${L("SBE.Inv.CellSizeHint")}</p>
              </div>
              <div class="form-group">
                <label style="display:flex;align-items:center;gap:6px;">
                  <input type="checkbox" name="cont.gridName" ${c.gridName ? "checked" : ""}>
                  ${L("SBE.Inv.GridName")}
                </label>
                <p class="notes">${L("SBE.Inv.GridNameHint")}</p>
              </div>
            </div>
            <div class="form-group">
              <label style="display:flex;align-items:center;gap:6px;">
                <input type="checkbox" name="cont.acceptStacks" ${c.acceptStacks !== false ? "checked" : ""}>
                ${L("SBE.Inv.AcceptStacks")}
              </label>
              <p class="notes">${L("SBE.Inv.AcceptStacksHint")}</p>
            </div>
            <hr>
            <div data-contdisplay="list grid cards">
            <div class="form-group">
              <label>${L("SBE.Inv.CatMode")}</label>
              <select name="cont.catMode">
                <option value="none" ${(c.catMode ?? "none") === "none" ? "selected" : ""}>${L("SBE.Inv.CatNone")}</option>
                <option value="key" ${c.catMode === "key" ? "selected" : ""}>${L("SBE.Inv.CatByKey")}</option>
                <option value="manual" ${c.catMode === "manual" ? "selected" : ""}>${L("SBE.Inv.CatManual")}</option>
              </select>
              <p class="notes">${L("SBE.Inv.CatModeHint")}</p>
            </div>

            <div data-catmode="key">
              <div class="form-group">
                <label>${L("SBE.Inv.CatKey")}</label>
                <input type="text" name="cont.catKey" value="${foundry.utils.escapeHTML(c.catKey ?? "")}" list="sbe-objkeys">
                <p class="notes">${L("SBE.Inv.CatKeyHint")}</p>
              </div>
              <div class="form-group">
                <label>${L("SBE.Inv.SubKey")}</label>
                <input type="text" name="cont.subKey" value="${foundry.utils.escapeHTML(c.subKey ?? "")}" list="sbe-objkeys">
                <p class="notes">${L("SBE.Inv.SubKeyHint")}</p>
              </div>
              <div class="form-group">
                <label>${L("SBE.Inv.CatIcons")}</label>
                <p class="notes">${L("SBE.Inv.CatIconsHint")}</p>
                <div class="sbe-cat-icons">
                  ${(Array.isArray(c.catIcons) ? c.catIcons : []).map((r, i) => `
                    <div class="sbe-cat-icon" data-i="${i}">
                      <input type="text" class="sbe-cico-value" value="${foundry.utils.escapeHTML(r?.value ?? "")}" placeholder="${L("SBE.Inv.CatValuePh")}">
                      <input type="text" class="sbe-cico-icon" value="${foundry.utils.escapeHTML(r?.icon ?? "")}" placeholder="${L("SBE.Template.NoneParen")}">
                      <button type="button" class="sbe-iconpick" data-forel=".sbe-cico-icon" style="flex:none;width:auto;padding:2px 8px;"><i class="fa-solid fa-icons"></i></button>
                      <a class="sbe-cico-del" title="${L("SBE.Common.Delete")}"><i class="fa-solid fa-trash"></i></a>
                    </div>`).join("")}
                </div>
                <button type="button" class="sbe-cico-add" style="width:auto;padding:2px 10px;margin-top:4px;">
                  <i class="fa-solid fa-plus"></i> ${L("SBE.Inv.CatIconAdd")}
                </button>
              </div>
            </div>

            <div data-catmode="manual">
              <div class="form-group">
                <label>${L("SBE.Inv.Cats")}</label>
                <p class="notes">${L("SBE.Inv.CatsHint")}</p>
                <div class="sbe-cat-rows">
                  ${(Array.isArray(c.cats) ? c.cats : []).map((r, i) => `
                    <div class="sbe-cat-row" data-i="${i}">
                      <input type="text" class="sbe-ccat-label" value="${foundry.utils.escapeHTML(r?.label ?? "")}" placeholder="${L("SBE.Inv.CatLabelPh")}">
                      <input type="text" class="sbe-ccat-icon" value="${foundry.utils.escapeHTML(r?.icon ?? "")}" placeholder="${L("SBE.Template.NoneParen")}">
                      <button type="button" class="sbe-iconpick" data-forel=".sbe-ccat-icon" style="flex:none;width:auto;padding:2px 8px;"><i class="fa-solid fa-icons"></i></button>
                      <select class="sbe-ccat-ftype">
                        ${["tag", "key", "keyValue", "template", "all"].map(t =>
                          `<option value="${t}" ${r?.fType === t ? "selected" : ""}>${L("SBE.Inv.CatF_" + t)}</option>`).join("")}
                      </select>
                      <input type="text" class="sbe-ccat-fval" value="${foundry.utils.escapeHTML(r?.fVal ?? "")}" placeholder="${L("SBE.Inv.CatValuePh")}">
                      <label class="sbe-ccat-sublbl" title="${L("SBE.Inv.CatSubHint")}">
                        <input type="checkbox" class="sbe-ccat-sub" ${r?.sub ? "checked" : ""}> ${L("SBE.Inv.CatSub")}
                      </label>
                      <a class="sbe-ccat-del" title="${L("SBE.Common.Delete")}"><i class="fa-solid fa-trash"></i></a>
                    </div>`).join("")}
                </div>
                <button type="button" class="sbe-ccat-add" style="width:auto;padding:2px 10px;margin-top:4px;">
                  <i class="fa-solid fa-plus"></i> ${L("SBE.Inv.CatAdd")}
                </button>
              </div>
            </div>
            </div>
            <datalist id="sbe-objkeys">${this.#objectKeyOptions()}</datalist>
            <hr>

            <div data-contdisplay="list">
            <div class="form-group">
              <label style="display:flex;align-items:center;gap:6px;">
                <input type="checkbox" name="cont.noGroup" ${c.noGroup ? "checked" : ""}>
                ${L("SBE.Inv.NoGroup")}
              </label>
              <p class="notes">${L("SBE.Inv.NoGroupHint")}</p>
            </div>
            <div class="form-group">
              <label>${L("SBE.Inv.IconSize")}</label>
              <input type="number" name="cont.iconSize" value="${c.iconSize ?? ""}" min="8" max="256" step="1" style="width:90px;"
                     placeholder="${L("SBE.Template.ImgAuto")}">
              <p class="notes">${L("SBE.Inv.IconSizeHint")}</p>
            </div>
            </div>
            <div class="form-group">
              <label>${L("SBE.Inv.QtyMax")}</label>
              <input type="text" name="cont.qtyMax" value="${foundry.utils.escapeHTML(String(c.qtyMax ?? ""))}" style="width:140px;"
                     placeholder="${L("SBE.Inv.Unlimited")}">
              <p class="notes">${L("SBE.Inv.QtyMaxHint")}</p>
            </div>
            <div class="form-group" data-contdisplay="list cards">
              <label>${L("SBE.Inv.Cols")}</label>
              <p class="notes">${L("SBE.Inv.ColsHint")}</p>
              <p class="notes" data-contdisplay="cards">${L("SBE.Inv.CardColsHint")}</p>
              <div class="sbe-cont-cols">
                ${(Array.isArray(c.cols) ? c.cols : []).map((col, i) => `
                  <div class="sbe-cont-col" data-i="${i}">${this.#contColRowHTML(col)}</div>`).join("")}
              </div>
              <button type="button" class="sbe-ccol-add" style="width:auto;padding:2px 10px;margin-top:4px;">
                <i class="fa-solid fa-plus"></i> ${L("SBE.Inv.ColAdd")}
              </button>
            </div>
            <hr>
            <p class="notes">${L("SBE.Inv.FilterShared")}</p>
          </div>

          <div class="sbe-el-opts" data-kind="slot">
            <div class="form-group">
              <label>${L("SBE.Slot.Mode")}</label>
              <select name="slot.mode">
                <option value="instance" ${(c.mode ?? "instance") === "instance" ? "selected" : ""}>${L("SBE.Slot.ModeInstance")}</option>
                <option value="reference" ${c.mode === "reference" ? "selected" : ""}>${L("SBE.Slot.ModeReference")}</option>
              </select>
            </div>
            <div class="form-group">
              <label>${L("SBE.Slot.Size")}</label>
              <input type="number" name="slot.size" value="${c.size ?? ""}" min="24" step="1" style="width:90px;" placeholder="64">
              <p class="notes">${L("SBE.Slot.SizeHint")}</p>
            </div>
            <div class="form-group">
              <label style="display:flex;align-items:center;gap:6px;">
                <input type="checkbox" name="slot.showName" ${c.showName ? "checked" : ""}>
                ${L("SBE.Slot.ShowName")}
              </label>
              <p class="notes">${L("SBE.Slot.ShowNameHint")}</p>
            </div>
            <div class="form-group">
              <label style="display:flex;align-items:center;gap:6px;">
                <input type="checkbox" name="slot.acceptStacks" ${c.acceptStacks ? "checked" : ""}>
                ${L("SBE.Inv.AcceptStacks")}
              </label>
              <p class="notes">${L("SBE.Inv.AcceptStacksSlotHint")}</p>
            </div>
            <div class="form-group">
              <label>${L("SBE.Inv.QtyMax")}</label>
              <input type="text" name="slot.qtyMax" value="${foundry.utils.escapeHTML(String(c.qtyMax ?? ""))}" style="width:140px;"
                     placeholder="${L("SBE.Inv.Unlimited")}">
              <p class="notes">${L("SBE.Inv.QtyMaxSlotHint")}</p>
            </div>
            <div class="form-group">
              <label>${L("SBE.Slot.EmptyText")}</label>
              <p class="notes">${L("SBE.Slot.EmptyTextHint")}</p>
              <input type="text" name="slot.emptyText" value="${foundry.utils.escapeHTML(c.emptyText ?? "")}" placeholder="${L("SBE.Slot.EmptyTextPh")}">
            </div>
            <div class="form-group">
              <label style="display:flex;align-items:center;gap:6px;">
                <input type="checkbox" name="slot.askReplace" ${c.askReplace ? "checked" : ""}>
                ${L("SBE.Inv.AskReplace")}
              </label>
              <p class="notes">${L("SBE.Inv.AskReplaceHint")}</p>
            </div>
            <div class="form-group">
              <label>${L("SBE.Inv.AfterDrop")}</label>
              <input type="text" name="slot.afterDrop" value="${foundry.utils.escapeHTML(String(c.afterDrop ?? ""))}" placeholder="${L("SBE.Inv.AfterDropPh")}">
              <p class="notes">${L("SBE.Inv.AfterDropHint")}</p>
            </div>
          </div>

          <div class="sbe-el-opts" data-kind="slot container">
            <div class="form-group">
              <label>${L("SBE.Slot.Filter")}</label>
              <select name="slot.filterType">
                <option value="none" ${(c.filterType ?? "none") === "none" ? "selected" : ""}>${L("SBE.Slot.FilterNone")}</option>
                <option value="template" ${c.filterType === "template" ? "selected" : ""}>${L("SBE.Slot.FilterTemplate")}</option>
                <option value="tag" ${c.filterType === "tag" ? "selected" : ""}>${L("SBE.Slot.FilterTag")}</option>
                <option value="key" ${c.filterType === "key" ? "selected" : ""}>${L("SBE.Slot.FilterKey")}</option>
              </select>
              <p class="notes" data-fnone="slot">${L("SBE.Slot.FilterNoneHint")}</p>
              <p class="notes" data-fnone="container" style="display:none;">${L("SBE.Inv.FilterNoneHint")}</p>
            </div>
            <div class="sbe-slot-fopts" data-sfilter="template">
              <div class="form-group" style="display:flex;flex-direction:column;gap:3px;">
                ${game.items.filter(i => i.type === "template").map(t => `
                  <label style="display:flex;align-items:center;gap:6px;">
                    <input type="checkbox" class="sbe-slot-tplchk" data-id="${t.id}"
                           ${(Array.isArray(c.filterTemplates) && c.filterTemplates.includes(t.id)) ? "checked" : ""}>
                    ${foundry.utils.escapeHTML(t.name)}
                  </label>`).join("") || `<p class="notes">${L("SBE.Objet.NoTemplatesHint")}</p>`}
              </div>
            </div>
            <div class="sbe-slot-fopts" data-sfilter="tag">
              <div class="form-group">
                <label>${L("SBE.Slot.FilterTagLabel")}</label>
                <input type="text" name="slot.filterTag" value="${foundry.utils.escapeHTML(c.filterTag ?? "")}" placeholder="${PH("SlotTag")}">
                <p class="notes">${L("SBE.Slot.FilterTagHint")}</p>
              </div>
            </div>
            <div class="sbe-slot-fopts" data-sfilter="key">
              <div class="form-group">
                <label>${L("SBE.Slot.FilterKeyLabel")}</label>
                <input type="text" name="slot.filterKey" value="${foundry.utils.escapeHTML(c.filterKey ?? "")}" placeholder="${PH("SlotKey")}">
                <p class="notes">${L("SBE.Slot.FilterKeyHint")}</p>
              </div>
            </div>
            <div class="form-group">
              <label>${L("SBE.Slot.ExcludeTag")}</label>
              <input type="text" name="slot.excludeTag" value="${foundry.utils.escapeHTML(c.excludeTag ?? "")}" placeholder="${PH("SlotExclude")}">
              <p class="notes">${L("SBE.Slot.ExcludeTagHint")}</p>
            </div>
            <div class="form-group">
              <label>${L("SBE.Slot.ListKey")}</label>
              <p class="notes">${L("SBE.Slot.ListKeyHint")}</p>
              <select name="slot.listKey">
                <option value="">${L("SBE.Slot.ListKeyNone")}</option>
                ${this.#refListOptions(c.listKey ?? "", el?.key ?? "")}
              </select>
            </div>
            <div class="form-group">
              <label>${L("SBE.Slot.Compat")}</label>
              <p class="notes">${L("SBE.Slot.CompatHint")}</p>
              <select name="slot.compatKey">
                <option value="">${L("SBE.Slot.CompatNone")}</option>
                ${this.#selectKeyOptions(c.compatKey ?? "")}
              </select>
            </div>
          </div>

          
          <div class="sbe-el-opts" data-kind="chart">
            <div class="form-group">
              <label>${L("SBE.Template.ChartType")}</label>
              <select name="ch.base">
                ${CHART_BASES.map(([vv, kk]) => `<option value="${vv}" ${chartBaseOf(c.type ?? "radar") === vv ? "selected" : ""}>${L("SBE.Template." + kk)}</option>`).join("")}
              </select>
            </div>
            <div class="form-group">
              <label>${L("SBE.Template.ChartVariant")}</label>
              <select name="ch.variant"></select>
            </div>
            <div class="form-group stacked">
              <div class="sbe-chart-preview" data-tooltip="${L("SBE.Template.ChartPreviewTip")}"></div>
            </div>
            <div class="form-group stacked" data-chart-axes2-box style="display:none;">
              <label>${L("SBE.Template.ChartAxes2")}</label>
              <p class="notes">${L("SBE.Template.ChartAxes2Hint")}</p>
              <textarea name="ch.axes2" rows="4">${foundry.utils.escapeHTML((Array.isArray(c.axes2) ? c.axes2 : []).join("\n"))}</textarea>
            </div>
            <div class="form-group stacked">
              <label>${L("SBE.Template.ChartAxes")}</label>
              <p class="notes">${L("SBE.Template.ChartAxesHint")}</p>
              <textarea name="ch.axes" rows="8" placeholder="${PH("ChartAxes")}">${foundry.utils.escapeHTML((Array.isArray(c.axes) ? c.axes : []).map(a => [a.key, a.label, a.color].filter(Boolean).join(" : ")).join("\n"))}</textarea>
            </div>
            <div class="form-group">
              <label>${L("SBE.Template.ChartMax")}</label>
              <div style="display:flex;gap:6px;align-items:center;">
                <input type="number" name="ch.min" value="${c.min ?? ""}" step="1" style="width:90px;" placeholder="${L("SBE.Template.ChartAuto")}">
                <span>→</span>
                <input type="number" name="ch.max" value="${c.max ?? ""}" step="1" style="width:90px;" placeholder="${L("SBE.Template.ChartAuto")}">
              </div>
              <p class="notes">${L("SBE.Template.ChartMaxHint")}</p>
            </div>
            <div class="form-group">
              <label>${L("SBE.Template.ChartSize")}</label>
              <input type="number" name="ch.size" value="${c.size ?? ""}" min="60" step="1" style="width:90px;" placeholder="${L("SBE.Template.ImgAuto")}">
              <p class="notes">${L("SBE.Template.ChartSizeHint")}</p>
            </div>
            <div class="form-group">
              <label>${L("SBE.Template.ChartColor")}</label>
              <input type="text" name="ch.color" value="${foundry.utils.escapeHTML(c.color ?? "")}" placeholder="${L("SBE.Template.NoneParen")}" style="width:120px;">
              <p class="notes">${L("SBE.Template.ChartColorHint")}</p>
            </div>
            <div class="form-group">
              <label style="display:flex;align-items:center;gap:6px;">
                <input type="checkbox" name="ch.showValues" ${c.showValues !== false ? "checked" : ""}>
                ${L("SBE.Template.ChartShowValues")}
              </label>
            </div>
          </div>

          <div class="sbe-el-opts" data-kind="html">
            <div class="form-group stacked">
              <label>${L("SBE.Template.HtmlCode")}</label>
              <p class="notes">${L("SBE.Template.HtmlCodeHint")}</p>
              <p class="notes">${L("SBE.Template.HtmlSecurityNote")}</p>
              <textarea name="html.code" rows="10" placeholder="${PH("HtmlCode")}">${foundry.utils.escapeHTML(c.code ?? "")}</textarea>
            </div>
          </div>

          <div class="sbe-el-opts" data-kind="tags">
            <div class="form-group">
              <label>${L("SBE.Tags.Entries")}</label>
              <textarea name="tags.entries" rows="4" placeholder="${L("SBE.Tags.EntriesPh")}">${(Array.isArray(c.entries) ? c.entries : []).map(foundry.utils.escapeHTML).join("\n")}</textarea>
              <p class="notes">${L("SBE.Tags.EntriesHint")}</p>
            </div>
            <div class="form-group">
              <label>${L("SBE.Tags.Highlight")}</label>
              <p class="notes">${L("SBE.Tags.HighlightHint")}</p>
              <select name="tags.highlight">
                ${["bound", "first", "all", "none"].map(h => `<option value="${h}" ${(c.highlight ?? "bound") === h ? "selected" : ""}>${L("SBE.Tags.Hl." + h)}</option>`).join("")}
              </select>
            </div>
            <div class="form-group">
              <label>${L("SBE.Tags.Place")}</label>
              <p class="notes">${L("SBE.Tags.PlaceHint")}</p>
              <select name="tags.place">
                <option value="top" ${c.place !== "header" ? "selected" : ""}>${L("SBE.Tags.PlaceTop")}</option>
                <option value="header" ${c.place === "header" ? "selected" : ""}>${L("SBE.Tags.PlaceHeader")}</option>
              </select>
            </div>
          </div>

          <div class="sbe-el-opts" data-kind="button">
            <div class="form-group">
              <label>${L("SBE.Button.Action")}</label>
              <select name="btn.action">
                <option value="consume" ${(c.action ?? "consume") === "consume" ? "selected" : ""}>${L("SBE.Button.ActionConsume")}</option>
                <option value="steps" ${c.action === "steps" ? "selected" : ""}>${L("SBE.Button.ActionSteps")}</option>
                <option value="menu" ${c.action === "menu" ? "selected" : ""}>${L("SBE.Button.ActionMenu")}</option>
              </select>
            </div>
            <div class="form-group">
              <label>${L("SBE.Button.Icon")}</label>
              <div style="display:flex;gap:6px;">
                <input type="text" name="btn.icon" value="${foundry.utils.escapeHTML(c.icon ?? "")}" style="flex:1;" placeholder="${L("SBE.Template.NoneParen")}">
                <button type="button" class="sbe-el-btniconpick" style="flex:none;width:auto;padding:2px 10px;">
                  <i class="fa-solid fa-folder-open"></i>
                </button>
              </div>
              <p class="notes">${L("SBE.Button.IconHint")}</p>
            </div>
            <div class="form-group">
              <label style="display:flex;align-items:center;gap:6px;">
                <input type="checkbox" name="btn.showInCtx" ${c.showInCtx !== false ? "checked" : ""}>
                ${L("SBE.Button.ShowInCtx")}
              </label>
              <p class="notes">${L("SBE.Button.ShowInCtxHint")}</p>
            </div>
            <div class="form-group">
              <label>${L("SBE.Prop.Where")}</label>
              <select name="btn.where">
                ${["inventory", "placed", "both", "auto"].map(w => `<option value="${w}" ${(c.where ?? "inventory") === w ? "selected" : ""}>${L(`SBE.Prop.Where_${w}`)}</option>`).join("")}
              </select>
              <p class="notes">${L("SBE.Prop.WhereHint")}</p>
            </div>
            <div class="form-group sbe-btn-announce">
              <label style="display:flex;align-items:center;gap:6px;">
                <input type="checkbox" name="btn.announce" ${c.announce ? "checked" : ""}>
                ${L("SBE.Button.Announce")}
              </label>
              <p class="notes">${L("SBE.Button.AnnounceHint")}</p>
            </div>

            <div class="sbe-btn-consume-opts">
              <hr>
              <div class="form-group">
                <label>${L("SBE.Button.ChargesKey")}</label>
                <select name="btn.chargesKey">
                  <option value="" ${!c.chargesKey ? "selected" : ""}>${L("SBE.Button.ChargesNone")}</option>
                  ${this.#numberKeyOptions(c.chargesKey ?? "")}
                </select>
                <p class="notes">${L("SBE.Button.ChargesKeyHint")}</p>
              </div>
              <div class="form-group">
                <label>${L("SBE.Button.Amount")}</label>
                <input type="text" name="btn.amount" value="${foundry.utils.escapeHTML(String(c.amount ?? 1))}" placeholder="1">
                <p class="notes">${L("SBE.Button.AmountHint")}</p>
              </div>
              <div class="form-group">
                <label>${L("SBE.Button.OnZero")}</label>
                <select name="btn.onZero">
                  <option value="none" ${(c.onZero ?? "none") === "none" ? "selected" : ""}>${L("SBE.Button.OnZeroNone")}</option>
                  <option value="qty" ${c.onZero === "qty" ? "selected" : ""}>${L("SBE.Button.OnZeroQty")}</option>
                  <option value="delete" ${c.onZero === "delete" ? "selected" : ""}>${L("SBE.Button.OnZeroDelete")}</option>
                </select>
                <p class="notes">${L("SBE.Button.OnZeroHint")}</p>
              </div>
            </div>
            <div class="sbe-btn-steps-opts" style="display:none;">
              <hr>
              <p class="notes">${L("SBE.Steps.EditorHint")}</p>
              <label class="sbe-steps-advbox"><input type="checkbox" class="sbe-steps-adv" ${condAdvanced() ? "checked" : ""}> ${L("SBE.Cond.Advanced")}
                <i class="fa-solid fa-circle-question sbe-help" data-tooltip-text="${foundry.utils.escapeHTML(L("SBE.Cond.AdvancedHint"))}"></i></label>
              <datalist id="sbe-stepkeys">${this.#templateKeyOptions()}</datalist>
              <datalist id="sbe-steplevelkeys">${levelKeyChoices().map(([k, l]) => `<option value="${foundry.utils.escapeHTML(k)}">${foundry.utils.escapeHTML(l)}</option>`).join("")}</datalist>
              <datalist id="sbe-stepactorkeys">${getKeyRefChoices("actor").map(c => `<option value="${foundry.utils.escapeHTML(c.key)}">${foundry.utils.escapeHTML(c.label)}</option>`).join("")}</datalist>
              <datalist id="sbe-stepland"><option value="cible"></option><option value="sol"></option><option value="détruit"></option></datalist>
              <datalist id="sbe-stepmedia">${(Array.isArray(this.document.system.mediaDefs) ? this.document.system.mediaDefs : []).filter(d => d?.name).map(d => `<option value="${foundry.utils.escapeHTML(d.name)}">${foundry.utils.escapeHTML(d.hint || d.name)}</option>`).join("")}</datalist>
              <datalist id="sbe-stepallitemkeys">${getKeyRefChoices("item").map(c => `<option value="${foundry.utils.escapeHTML(c.key)}">${foundry.utils.escapeHTML(c.label)}</option>`).join("")}</datalist>
              <datalist id="sbe-stepfx">${EffectManager.effectOptions().map(d => `<option value="${foundry.utils.escapeHTML(d.key)}">${foundry.utils.escapeHTML(d.label)}</option>`).join("")}</datalist>
              <datalist id="sbe-stepfxcat">${[...new Set(EffectManager.getDefs().map(d => d.category).filter(Boolean))].map(g => `<option value="${foundry.utils.escapeHTML(g)}"></option>`).join("")}</datalist>
              <div class="sbe-steps-list">${(Array.isArray(c.steps) ? c.steps : []).map(st => this.#stepRowHTML(st)).join("")}</div>
              <button type="button" class="sbe-steps-add"><i class="fa-solid fa-plus"></i> ${L("SBE.Steps.Add")}</button>
              ${this.#autoBoxHTML(c.auto ?? {})}
            </div>
            <div class="sbe-btn-menu-opts" style="display:none;">
              <p class="notes">${L("SBE.Button.MenuHint")}</p>
            </div>
          </div>

          <div class="sbe-el-opts" data-kind="table">
            <div class="form-group">
              <label>${L("SBE.Table.DimCols")}</label>
              <input type="number" name="tbl.cols" value="${(c.columns ?? []).length || 2}" min="1" max="12" step="1" style="width:90px;">
            </div>
            <div class="form-group">
              <label>${L("SBE.Table.DimRows")}</label>
              <input type="number" name="tbl.rows" value="${(c.rows ?? []).length || 2}" min="0" max="50" step="1" style="width:90px;">
              <p class="notes">${L("SBE.Table.DimHint")}</p>
            </div>
            <p class="notes">${L("SBE.Table.ColumnsHint")}</p>
            <fieldset class="sbe-st-group">
              <legend>${L("SBE.Lookup.Group")}</legend>
              <div class="form-group">
                <label style="display:flex;align-items:center;gap:6px;">
                  <input type="checkbox" name="tbl.lookup" ${c.lookup ? "checked" : ""}>
                  ${L("SBE.Lookup.On")}
                </label>
                <p class="notes">${L("SBE.Lookup.OnHint")}</p>
              </div>
              <div class="form-group" data-lookupbox ${c.lookup ? "" : 'style="display:none;"'}>
                <label>${L("SBE.Lookup.Range")}</label>
                <p class="notes">${L("SBE.Lookup.RangeHint")}</p>
                <div style="display:flex;gap:6px;align-items:center;">
                  <select name="tbl.lowKey" style="flex:1;">
                    <option value="">${L("SBE.Template.NoneParen")}</option>
                    ${(c.columns ?? []).map(col => `<option value="${foundry.utils.escapeHTML(col.key)}" ${c.lowKey === col.key ? "selected" : ""}>${foundry.utils.escapeHTML(col.label || col.key)}</option>`).join("")}
                  </select>
                  <span>→</span>
                  <select name="tbl.highKey" style="flex:1;">
                    <option value="">${L("SBE.Template.NoneParen")}</option>
                    ${(c.columns ?? []).map(col => `<option value="${foundry.utils.escapeHTML(col.key)}" ${c.highKey === col.key ? "selected" : ""}>${foundry.utils.escapeHTML(col.label || col.key)}</option>`).join("")}
                  </select>
                </div>
              </div>
              <div class="form-group" data-lookupbox ${c.lookup ? "" : 'style="display:none;"'}>
                <label>${L("SBE.Lookup.Csv")}</label>
                <p class="notes">${L("SBE.Lookup.CsvHint")}</p>
                <div style="display:flex;gap:6px;">
                  <button type="button" class="sbe-csv-import" style="flex:1;">
                    <i class="fa-solid fa-file-import"></i> ${L("SBE.Lookup.CsvImport")}
                  </button>
                  <button type="button" class="sbe-csv-export" style="flex:1;">
                    <i class="fa-solid fa-file-export"></i> ${L("SBE.Lookup.CsvExport")}
                  </button>
                </div>
                <input type="file" class="sbe-csv-file" accept=".csv,.txt,text/csv,text/plain" style="display:none;">
                <input type="hidden" name="tbl.csvdata" value="">
              </div>
            </fieldset>
          </div>

          <div class="sbe-el-opts" data-kind="gauge">
            <div class="form-group">
              <label>${L("SBE.Template.GaugeMinMax")}</label>
              <div style="display:flex;gap:6px;align-items:center;">
                <input type="number" name="g.min" value="${c.min ?? 0}" step="1" style="width:90px;">
                <span>→</span>
                <input type="number" name="g.max" value="${c.max ?? 100}" step="1" style="width:90px;">
              </div>
              <p class="notes">${L("SBE.Template.GaugeSubkeysHint")}</p>
            </div>
            <div class="form-group">
              <label>${L("SBE.Gauge.MaxFormula")}</label>
              <p class="notes">${L("SBE.Gauge.MaxFormulaHint")}</p>
              <input type="text" name="g.maxFormula" value="${foundry.utils.escapeHTML(c.maxFormula ?? "")}" placeholder="${PH("GaugeMax")}">
            </div>
            <div class="form-group">
              <label style="display:flex;align-items:center;gap:6px;">
                <input type="checkbox" name="g.computed" ${c.computed ? "checked" : ""}>
                ${L("SBE.Gauge.Computed")}
              </label>
              <p class="notes">${L("SBE.Gauge.ComputedHint")}</p>
              <input type="text" name="g.formula" value="${foundry.utils.escapeHTML(c.computed ? (c.formula ?? "") : "")}" placeholder="${PH("GaugeFormula")}">
              <label style="display:flex;align-items:center;gap:6px;margin-top:4px;">
                <input type="checkbox" name="g.decimals" ${c.integer === false ? "checked" : ""}>
                ${L("SBE.Gauge.Decimals")}
              </label>
              <div class="sbe-g-block" ${c.computed ? "" : "hidden"}>
                <p class="notes">${L("SBE.Gauge.BlockMaxHint")}</p>
                <label style="display:flex;align-items:center;gap:6px;">
                  <input type="checkbox" name="g.blockMax" ${c.blockMax ? "checked" : ""}>
                  ${L("SBE.Gauge.BlockMax")}
                </label>
                <div class="sbe-g-blockopts" ${c.blockMax ? "" : "hidden"}>
                  <p class="notes">${L("SBE.Gauge.BlockMsgHint")}</p>
                  <input type="text" name="g.blockMsg" value="${foundry.utils.escapeHTML(c.blockMsg ?? "")}"
                         placeholder="${foundry.utils.escapeHTML(L("SBE.Gauge.BlockMsgDefault"))}">
                  <p class="notes">${L("SBE.Gauge.BlockGmHint")}</p>
                  <label style="display:flex;align-items:center;gap:6px;">
                    <input type="checkbox" name="g.blockGm" ${c.blockGm ? "checked" : ""}>
                    ${L("SBE.Gauge.BlockGm")}
                  </label>
                </div>
              </div>
            </div>
            <!-- POINTS TEMPORAIRES (jauge saisie) : sous-clé « clé_temp »,
                 encaissent les baisses en premier. -->
            <fieldset class="sbe-st-group sbe-g-temp" ${c.computed ? "hidden" : ""}>
              <legend>${L("SBE.Temp.Label")}</legend>
              <div class="form-group">
                <label style="display:flex;align-items:center;gap:6px;">
                  <input type="checkbox" name="g.tempOn" ${c.temp?.on ? "checked" : ""}>
                  ${L("SBE.Temp.On")}
                </label>
                <p class="notes">${L("SBE.Temp.OnHint")}</p>
              </div>
              <!-- Réglages côte à côte : cumul et disparition (règle des
                   fenêtres condensées en deux colonnes). -->
              <div class="sbe-g-tempopts" ${c.temp?.on ? "" : "hidden"}>
                <div class="form-group">
                  <label>${L("SBE.Temp.Stack")}</label>
                  <p class="notes">${L("SBE.Temp.StackHint")}</p>
                  <select name="g.tempStack">
                    <option value="max" ${(c.temp?.stack ?? "max") === "max" ? "selected" : ""}>${L("SBE.Temp.StackMax")}</option>
                    <option value="add" ${c.temp?.stack === "add" ? "selected" : ""}>${L("SBE.Temp.StackAdd")}</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>${L("SBE.Temp.Expire")}</label>
                  <p class="notes">${L("SBE.Temp.ExpireHint")}</p>
                  <label style="display:flex;align-items:center;gap:6px;">
                    <input type="checkbox" name="g.tempCombat" ${c.temp?.endCombat ? "checked" : ""}> ${L("SBE.Temp.EndCombat")}
                  </label>
                  <label style="display:flex;align-items:center;gap:6px;">
                    <input type="checkbox" name="g.tempNewDay" ${c.temp?.newDay ? "checked" : ""}> ${L("SBE.Temp.NewDay")}
                  </label>
                </div>
                <div class="form-group">
                  <label>${L("SBE.Temp.Rounds")}</label>
                  <input type="number" name="g.tempRounds" value="${Number(c.temp?.rounds) || 0}" min="0" step="1" style="width:90px;">
                </div>
                <div class="form-group">
                  <label>${L("SBE.Temp.Minutes")}</label>
                  <input type="number" name="g.tempMinutes" value="${Number(c.temp?.minutes) || 0}" min="0" step="1" style="width:90px;">
                </div>
              </div>
            </fieldset>
            <!-- DÉBORDEMENT (jauge saisie) : ce qui passe sous le minimum ou
                 au-dessus du maximum va dans une autre clé. -->
            <!-- Un groupe à part (comme « Jet de dés ») : ses trois champs
                 ne décalent plus la ligne de la grille voisine. -->
            <fieldset class="sbe-st-group sbe-g-over" ${c.computed ? "hidden" : ""}>
              <legend>${L("SBE.Gauge.Overflow")}</legend>
              <p class="notes">${L("SBE.Gauge.OverflowHint")}</p>
              <div class="form-group">
                <label>${L("SBE.Gauge.OverLow")}</label>
                <input type="text" name="g.overLow" value="${foundry.utils.escapeHTML(c.overflow?.low ?? "")}" placeholder="${PH("OverLow")}">
              </div>
              <div class="form-group">
                <label>${L("SBE.Gauge.OverHigh")}</label>
                <input type="text" name="g.overHigh" value="${foundry.utils.escapeHTML(c.overflow?.high ?? "")}" placeholder="${PH("OverHigh")}">
              </div>
              <div class="form-group">
                <label>${L("SBE.Gauge.OverRatio")}</label>
                <p class="notes">${L("SBE.Gauge.OverRatioHint")}</p>
                <input type="number" name="g.overRatio" value="${c.overflow?.ratio ?? 1}" min="0" step="any" style="width:90px;">
              </div>
            </fieldset>
            <div class="form-group">
              <label>${L("SBE.Gauge.Display")}</label>
              <p class="notes">${L("SBE.Gauge.DisplayHint")}</p>
              <select name="g.display">
                <option value="bar" ${c.display !== "pips" ? "selected" : ""}>${L("SBE.Gauge.DisplayBar")}</option>
                <option value="pips" ${c.display === "pips" ? "selected" : ""}>${L("SBE.Gauge.DisplayPips")}</option>
              </select>
              <input type="text" name="g.pipIcon" value="${foundry.utils.escapeHTML(c.pipIcon ?? "")}" placeholder="fa-solid fa-utensils">
            </div>
            <div class="form-group">
              <label>${L("SBE.Template.DefaultValue")}</label>
              <input type="number" name="g.default" value="${nv(c.default)}" min="0" step="1" style="width:110px;" placeholder="0">
            </div>
            <div class="form-group">
              <label>${L("SBE.Template.GaugeThresholds")}</label>
              <div style="display:flex;gap:6px;align-items:center;">
                <input type="number" name="g.low" value="${c.low ?? 25}" min="0" max="100" step="1" style="width:80px;">
                <span>% / </span>
                <input type="number" name="g.high" value="${c.high ?? 75}" min="0" max="100" step="1" style="width:80px;">
                <span>%</span>
              </div>
              <p class="notes">${L("SBE.Template.GaugeThresholdsHint")}</p>
            </div>
            <div class="form-group">
              <label>${L("SBE.Template.GaugeCrit")}</label>
              <div style="display:flex;gap:6px;align-items:center;">
                <input type="number" name="g.crit" value="${c.crit ?? ""}" min="0" max="100" step="1" style="width:80px;" placeholder="—">
                <span>%</span>
              </div>
              <p class="notes">${L("SBE.Template.GaugeCritHint")}</p>
            </div>
            <div class="form-group">
              <label>${L("SBE.Template.GaugeText")}</label>
              <select name="g.text">
                <option value="none" ${(c.text ?? "valueMax") === "none" ? "selected" : ""}>${L("SBE.Template.GaugeTextNone")}</option>
                <option value="value" ${c.text === "value" ? "selected" : ""}>${L("SBE.Template.GaugeTextValue")}</option>
                <option value="valueMax" ${(c.text ?? "valueMax") === "valueMax" ? "selected" : ""}>${L("SBE.Template.GaugeTextValueMax")}</option>
                <option value="percent" ${c.text === "percent" ? "selected" : ""}>${L("SBE.Template.GaugeTextPercent")}</option>
              </select>
            </div>
          </div>

          <div class="sbe-el-opts" data-kind="ref">
            <div class="form-group">
              <label>${L("SBE.Panel.RefTarget")}</label>
              <select name="ref.target">
                <option value="">—</option>
                ${[...walkElements((this.document.system.elements ?? []).filter(e => e?.zone !== PANEL_ZONE))]
                  .filter(e => e?.key && !["ref", "tab"].includes(e.kind))
                  .map(e => `<option value="${foundry.utils.escapeHTML(e.key)}" ${c.refKey === e.key ? "selected" : ""}>${foundry.utils.escapeHTML(e.label || e.key)} (${L(`SBE.Template.Kind.${e.kind}`)} · ${foundry.utils.escapeHTML(e.key)})</option>`).join("")}
              </select>
              <p class="notes">${L("SBE.Panel.RefTargetHint")}</p>
            </div>
            <div class="form-group">
              <label style="display:flex;align-items:center;gap:6px;">
                <input type="checkbox" name="ref.noLabel" ${c.noLabel ? "checked" : ""}>
                ${L("SBE.Panel.RefNoLabel")}
              </label>
              <p class="notes">${L("SBE.Panel.RefNoLabelHint")}</p>
            </div>
          </div>

          <div class="sbe-el-opts" data-kind="separator">
            <div class="form-group">
              <label>${L("SBE.Template.SepImage")}</label>
              <div style="display:flex;gap:6px;">
                <input type="text" name="sep.image" value="${foundry.utils.escapeHTML(c.image ?? "")}" style="flex:1;" placeholder="${L("SBE.Template.NoneParen")}">
                <button type="button" class="sbe-el-seppick" style="flex:none;width:auto;padding:2px 10px;">
                  <i class="fa-solid fa-folder-open"></i>
                </button>
              </div>
              <p class="notes">${L("SBE.Template.SepImageHint")}</p>
            </div>
            <div class="form-group">
              <label>${L("SBE.Template.SepHeight")}</label>
              <input type="number" name="sep.height" value="${c.height ?? ""}" min="2" step="1" style="width:90px;" placeholder="${L("SBE.Template.ImgAuto")}">
            </div>
          </div>

          <div class="sbe-el-opts" data-kind="columns">
            <div class="form-group">
              <label>${L("SBE.Template.ColumnsCount")}</label>
              <select name="cols.count">
                ${[2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<option value="${n}" ${Number(c.count ?? 2) === n ? "selected" : ""}>${n}</option>`).join("")}
              </select>
              <p class="notes">${L("SBE.Template.ColumnsCountHint")}</p>
            </div>
            <div class="form-group stacked">
              <label>${L("SBE.Template.ColsWidths")}</label>
              <p class="notes">${L("SBE.Template.ColsWidthsHint")}</p>
              <div class="sbe-cols-widths" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;"></div>
            </div>
            <div class="form-group">
              <label style="display:flex;align-items:center;gap:6px;">
                <input type="checkbox" name="cols.equal" ${c.equalHeight ? "checked" : ""}>
                ${L("SBE.Template.ColsEqual")}
              </label>
              <p class="notes">${L("SBE.Template.ColsEqualHint")}</p>
            </div>
          </div>
        </div>

        <div class="sbe-el-pane" data-pane="style" style="display:none;">

          <p class="notes">${L("SBE.Template.StyleIntro")}</p>

          <fieldset class="sbe-st-group">
            <legend>${L("SBE.Template.StyleLabelGroup")}</legend>
            <div class="form-group">
              <label>${L("SBE.Template.StLabelPos")}</label>
              <select name="st.labelPos">
                ${[
                  ["side-left", "PosSideLeft"], ["side-right", "PosSideRight"],
                  ["above-left", "PosAboveLeft"], ["above-center", "PosAboveCenter"], ["above-right", "PosAboveRight"],
                  ["below-left", "PosBelowLeft"], ["below-center", "PosBelowCenter"], ["below-right", "PosBelowRight"]
                ].map(([vv, kk]) => `<option value="${vv}" ${(st.labelPos ?? "side-left") === vv ? "selected" : ""}>${L("SBE.Template." + kk)}</option>`).join("")}
              </select>
            </div>
            <div class="form-group">
              <label>${L("SBE.Template.StFont")}</label>
              <select name="st.labelFont">
                <option value="" ${!st.labelFont ? "selected" : ""}>${L("SBE.Template.StFontTheme")}</option>
                ${getFontFamilies().map(f => `<option value="${foundry.utils.escapeHTML(f)}" style="font-family:'${foundry.utils.escapeHTML(f)}';" ${st.labelFont === f ? "selected" : ""}>${foundry.utils.escapeHTML(f)}</option>`).join("")}
              </select>
            </div>
            ${colorRow("SBE.Template.StColor", "st.labelColor", st.labelColor)}
            <div class="form-group">
              <label>${L("SBE.Template.StSize")}</label>
              <input type="number" name="st.labelSize" value="${st.labelSize ?? ""}" min="6" step="1" style="width:90px;" placeholder="${L("SBE.Template.ImgAuto")}">
            </div>
            <div class="form-group" style="display:flex;gap:16px;">
              <label style="display:flex;align-items:center;gap:6px;">
                <input type="checkbox" name="st.labelBold" ${st.labelBold ? "checked" : ""}> ${L("SBE.Template.StBold")}
              </label>
              <label style="display:flex;align-items:center;gap:6px;">
                <input type="checkbox" name="st.labelItalic" ${st.labelItalic ? "checked" : ""}> ${L("SBE.Template.StItalic")}
              </label>
              <label style="display:flex;align-items:center;gap:6px;">
                <input type="checkbox" name="st.labelUpper" ${st.labelUpper ? "checked" : ""}> ${L("SBE.Template.StUpper")}
              </label>
            </div>
          </fieldset>

          <fieldset class="sbe-st-group" data-skind="field">
            <legend>${L("SBE.Template.StyleValueGroup")}</legend>
            ${colorRow("SBE.Template.StColor", "st.valueColor", st.valueColor)}
            <div class="form-group">
              <label>${L("SBE.Template.StSize")}</label>
              <input type="number" name="st.valueSize" value="${st.valueSize ?? ""}" min="6" step="1" style="width:90px;" placeholder="${L("SBE.Template.ImgAuto")}">
            </div>
          </fieldset>

          <fieldset class="sbe-st-group">
            <legend>${L("SBE.Template.StyleBoxGroup")}</legend>
            ${colorRow("SBE.Template.StBgColor", "st.bgColor", st.bgColor)}
            <div class="form-group">
              <label style="display:flex;align-items:center;gap:6px;">
                <input type="checkbox" name="st.noBg" ${st.noBg ? "checked" : ""}> ${L("SBE.Template.StNoBg")}
              </label>
              <p class="notes">${L("SBE.Template.StNoBgHint")}</p>
            </div>
            <div class="form-group">
              <label>${L("SBE.Template.StBgTexture")}</label>
              <div style="display:flex;gap:6px;">
                <input type="text" name="st.bgTexture" value="${foundry.utils.escapeHTML(st.bgTexture ?? "")}" style="flex:1;" placeholder="${L("SBE.Template.NoneParen")}">
                <button type="button" class="sbe-el-bgtexpick" style="flex:none;width:auto;padding:2px 10px;">
                  <i class="fa-solid fa-folder-open"></i>
                </button>
              </div>
              <p class="notes">${L("SBE.Template.StBgTextureKeyHint")}</p>
            </div>
            ${colorRow("SBE.Template.StBorderColor", "st.borderColor", st.borderColor)}
            <div class="form-group">
              <label>${L("SBE.Template.StBorderWidth")}</label>
              <input type="number" name="st.borderWidth" value="${st.borderWidth ?? ""}" min="0" max="20" step="1" style="width:90px;" placeholder="1">
              <p class="notes">${L("SBE.Template.StBorderHint")}</p>
            </div>
            <div class="form-group">
              <label>${L("SBE.Template.StCorners")}</label>
              <select name="st.corners">
                <option value="" ${!st.corners ? "selected" : ""}>${L("SBE.Template.StCornersNone")}</option>
                <option value="none" ${st.corners === "none" ? "selected" : ""}>${L("SBE.Template.StCornersSquare")}</option>
                <option value="soft" ${st.corners === "soft" ? "selected" : ""}>${L("SBE.Template.StCornersSoft")}</option>
                <option value="strong" ${st.corners === "strong" ? "selected" : ""}>${L("SBE.Template.StCornersStrong")}</option>
              </select>
            </div>
          </fieldset>

          <fieldset class="sbe-st-group" data-skind="header">
            <legend>${L("SBE.Template.StyleHeaderGroup")}</legend>
            ${colorRow("SBE.Template.StHeaderBg", "st.headerBg", st.headerBg)}
            ${colorRow("SBE.Template.StHeaderColor", "st.headerColor", st.headerColor)}
          </fieldset>

          <fieldset class="sbe-st-group" data-skind="separator">
            <legend>${L("SBE.Template.StyleSepGroup")}</legend>
            ${colorRow("SBE.Template.StColor", "st.sepColor", st.sepColor)}
            <div class="form-group">
              <label>${L("SBE.Template.StThickness")}</label>
              <input type="number" name="st.sepThickness" value="${st.sepThickness ?? ""}" min="1" step="1" style="width:90px;" placeholder="2">
            </div>
          </fieldset>

          <fieldset class="sbe-st-group" data-skind="chart">
            <legend>${L("SBE.Template.StyleChartGroup")}</legend>
            ${colorRow("SBE.Template.StChartGrid", "st.chGrid", st.chGrid)}
            ${colorRow("SBE.Template.StChartBg", "st.chBg", st.chBg)}
            ${colorRow("SBE.Template.StChartFill", "st.chFill", st.chFill)}
            ${colorRow("SBE.Template.StChartStroke", "st.chStroke", st.chStroke)}
            <div class="form-group">
              <label>${L("SBE.Template.StChartFillOp")}</label>
              <input type="number" name="st.chFillOp" value="${st.chFillOp ?? 25}" min="0" max="100" step="5" style="width:90px;">
              <p class="notes">${L("SBE.Template.StChartFillOpHint")}</p>
            </div>
            <div class="form-group">
              <label>${L("SBE.Template.StChartDot")}</label>
              <input type="number" name="st.chDot" value="${st.chDot ?? ""}" min="1" max="30" step="0.5" style="width:90px;" placeholder="${L("SBE.Template.ImgAuto")}">
            </div>
            <div class="form-group">
              <label>${L("SBE.Template.StChartGridW")}</label>
              <input type="number" name="st.chGridW" value="${st.chGridW ?? ""}" min="0.5" max="10" step="0.5" style="width:90px;" placeholder="1">
            </div>
            <div class="form-group">
              <label style="display:flex;align-items:center;gap:6px;">
                <input type="checkbox" name="st.chGridBg" ${st.chGridBg ? "checked" : ""}> ${L("SBE.Template.StChartGridBg")}
              </label>
              <p class="notes">${L("SBE.Template.StChartGridBgHint")}</p>
            </div>
            <div class="form-group">
              <label>${L("SBE.Template.StChartStep")}</label>
              <div style="display:flex;gap:6px;align-items:center;">
                <input type="number" name="st.chStep" value="${st.chStep ?? ""}" min="0.1" step="1" style="width:90px;" placeholder="${L("SBE.Template.ImgAuto")}">
                <select name="st.chStepUnit" style="flex:1;">
                  <option value="val" ${(st.chStepUnit ?? "val") !== "pct" ? "selected" : ""}>${L("SBE.Template.StChartStepVal")}</option>
                  <option value="pct" ${st.chStepUnit === "pct" ? "selected" : ""}>${L("SBE.Template.StChartStepPct")}</option>
                </select>
              </div>
              <p class="notes">${L("SBE.Template.StChartStepHint")}</p>
            </div>
            <div class="form-group">
              <label>${L("SBE.Template.StChartTick")}</label>
              <input type="number" name="st.chTick" value="${st.chTick ?? ""}" min="6" max="40" step="1" style="width:90px;" placeholder="9">
              <p class="notes">${L("SBE.Template.StChartTickHint")}</p>
            </div>
          </fieldset>

          <fieldset class="sbe-st-group" data-skind="gauge">
            <legend>${L("SBE.Template.StyleGaugeGroup")}</legend>
            <div class="form-group">
              <label>${L("SBE.Template.StThickness")}</label>
              <input type="number" name="st.gHeight" value="${st.gHeight ?? 14}" min="4" max="60" step="1" style="width:90px;">
            </div>
            <div class="form-group">
              <label>${L("SBE.Template.GaugeShape")}</label>
              <select name="st.gShape">
                <option value="rounded" ${(st.gShape ?? "rounded") === "rounded" ? "selected" : ""}>${L("SBE.Template.GaugeShapeRounded")}</option>
                <option value="flat" ${st.gShape === "flat" ? "selected" : ""}>${L("SBE.Template.GaugeShapeFlat")}</option>
                <option value="pill" ${st.gShape === "pill" ? "selected" : ""}>${L("SBE.Template.GaugeShapePill")}</option>
              </select>
            </div>
            ${colorRow("SBE.Template.GaugeBg", "st.gBg", st.gBg)}
            ${colorRow("SBE.Template.GaugeFill", "st.gFill", st.gFill)}
            ${colorRow("SBE.Template.GaugeLowColor", "st.gLow", st.gLow)}
            ${colorRow("SBE.Template.GaugeHighColor", "st.gHigh", st.gHigh)}
            ${colorRow("SBE.Template.GaugeCritColor", "st.gCrit", st.gCrit)}
            ${colorRow("SBE.Template.StBorderColor", "st.gBorder", st.gBorder)}
            ${colorRow("SBE.Temp.ColorDark", "st.gTempD", st.gTempD)}
            ${colorRow("SBE.Temp.ColorLight", "st.gTempL", st.gTempL)}
            <div class="form-group">
              <label>${L("SBE.Template.GaugeTexture")}</label>
              <div style="display:flex;gap:6px;">
                <input type="text" name="st.gTexture" value="${foundry.utils.escapeHTML(st.gTexture ?? "")}" style="flex:1;" placeholder="${L("SBE.Template.NoneParen")}">
                <button type="button" class="sbe-el-gtexpick" style="flex:none;width:auto;padding:2px 10px;">
                  <i class="fa-solid fa-folder-open"></i>
                </button>
              </div>
            </div>
          </fieldset>

          <fieldset class="sbe-st-group">
            <legend>${L("SBE.Template.StyleAdvGroup")}</legend>
            <div class="form-group">
              <label style="display:flex;align-items:center;gap:6px;">
                <input type="checkbox" name="st.customOn" ${st.customOn ? "checked" : ""}>
                ${L("SBE.Template.StCustomOn")}
              </label>
            </div>
            <div class="form-group stacked sbe-el-customcss">
              <p class="notes">${L("SBE.Template.StCustomHint")}</p>
              <textarea name="st.custom" rows="6" ${st.customOn ? "" : "disabled"}
                        placeholder="border: 2px solid gold; box-shadow: 0 0 8px gold;">${foundry.utils.escapeHTML(st.custom ?? "")}</textarea>
            </div>
          </fieldset>
        </div>

        ${isNative ? "" : (() => {
          const tt = c.tt ?? {};
          /* Zone jamais vide : on propose l'écriture type
             « <b>libellé icône</b> : {{clé}} » — modifiable, et non
             conservée si le créateur n'active pas l'info-bulle. */
          const ttSnip = ttSnippetFor(el);
          return `
        <div class="sbe-el-pane" data-pane="tt" style="display:none;">
          <div class="form-group">
            <label style="display:flex;align-items:center;gap:6px;">
              <input type="checkbox" name="tt.on" ${tt.on ? "checked" : ""}>
              ${L("SBE.Template.TtOn")}
            </label>
          </div>
          <div class="form-group stacked">
            <label>${L("SBE.Template.TtText")}</label>
            <p class="notes">${L("SBE.Template.TtTextHint")}</p>
            <textarea name="tt.text" rows="5" data-snippet="${foundry.utils.escapeHTML(ttSnip)}"
              placeholder="{{= force + force_bonus }} = {{force}} + bonus">${foundry.utils.escapeHTML(tt.text ?? ttSnip)}</textarea>
          </div>
          <div class="form-group">
            <label style="display:flex;align-items:center;gap:6px;">
              <input type="checkbox" name="tt.formula" ${tt.formula ? "checked" : ""}>
              ${L("SBE.Template.TtFormula")}
            </label>
          </div>
          <div class="form-group">
            <label style="display:flex;align-items:center;gap:6px;">
              <input type="checkbox" name="tt.bonus" ${tt.bonus ? "checked" : ""}>
              ${L("SBE.Template.TtBonus")}
            </label>
            <p class="notes">${L("SBE.Template.TtBonusHint")}</p>
          </div>
          <div class="form-group">
            <label style="display:flex;align-items:center;gap:6px;">
              <input type="checkbox" name="tt.base" ${tt.noBase ? "" : "checked"}>
              ${L("SBE.Template.TtBase")}
            </label>
            <p class="notes">${L("SBE.Template.TtBaseHint")}</p>
          </div>
          ${colorRow("SBE.Template.TtColor", "tt.color", tt.color)}
        </div>`;
        })()}

        ${isTab ? `
        <div class="sbe-el-pane" data-pane="media" style="display:none;">
          ${UiSound.fieldsHtml("tab.clickSound", c.clickSound, "SBE.UiSound.Click", "SBE.UiSound.ClickHint")}
        </div>` : ""}

        <footer class="sbe-el-footer">
          <button type="button" class="sbe-el-validate">
            <i class="fa-solid fa-check"></i> ${L("SBE.Common.Validate")}
          </button>
          <button type="button" class="sbe-el-cancel">
            <i class="fa-solid fa-xmark"></i> ${L("SBE.Common.Cancel")}
          </button>
        </footer>
      </div>`;

    /* Validation + enregistrement. Retourne true si OK — en cas
       d'échec : notification et la fenêtre RESTE ouverte (jamais de
       throw dans un callback DialogV2 : cela fige la fenêtre). */
    const trySave = async (root) => {
      const v = (n) => root.querySelector(`[name="${n}"]`);
      let renamePlan = null;
      const kind = isNew ? (v("kind")?.value ?? "text") : el.kind;
      /* Natif : clé/libellé/visibilité inexistants — on conserve tel quel. */
      const label = isNative ? (el.label ?? "") : (v("label")?.value?.trim() ?? "");
      const key = isNative ? (el.key ?? "") : (v("key")?.value ?? "").trim();
      const playerVisible = isNative ? (el.playerVisible !== false) : !!v("playerVisible")?.checked;
      /* Réservé aux éléments à VALEUR — la structure reste toujours true. */
      const PE_KINDS = ["text", "number", "checkbox", "color", "select", "gauge", "quantity", "container"];
      const playerEditable = (isNative || !PE_KINDS.includes(kind))
        ? true : !!v("playerEditable")?.checked;
      /* Masqué sur la fiche tout court (même MJ) : clé de calcul. */
      const sheetHidden = isNative ? false : !!v("sheetHidden")?.checked;
      /* VISIBLE SI : expression évaluée à l'affichage de la fiche.
         Vide = toujours visible. Validée à la syntaxe seulement — une
         clé inconnue vaut undefined, donc l'élément se masque. */
      const visibleIf = isNative ? "" : (v("visibleIf")?.value ?? "").trim();
      if (visibleIf) {
        const { validateFormula } = await import("./formula-engine.mjs");
        const vErr = validateFormula(visibleIf);
        if (vErr) { ui.notifications.error(vErr); return false; }
      }

      if (!isNative) {
        /* Clé : obligatoire, format simple, unique dans l'arbre. */
        if (!key || !KEY_RE.test(key)) {
          ui.notifications.error(L("SBE.Template.KeyInvalid"));
          return false;
        }
        /* Mots réservés du moteur de formules (JavaScript) : une clé
           comme « for » ou « if » casserait toute formule qui la lit. */
        const RESERVED_KEYS = new Set([
          "for", "in", "of", "do", "if", "else", "new", "var", "let", "const",
          "this", "true", "false", "null", "undefined", "function", "return",
          "while", "switch", "case", "break", "continue", "typeof", "delete",
          "void", "class", "extends", "super", "import", "export", "try",
          "catch", "finally", "throw", "yield", "await", "static", "with",
          "instanceof", "default", "debugger", "enum", "arguments", "eval",
          "Math", "Number", "String", "Boolean",
          /* Fonctions mathématiques des formules (ceil(x), min(a,b)…) :
             une clé homonyme créerait un conflit — refusée d'emblée. */
          "ceil", "floor", "round", "abs", "min", "max", "sqrt", "pow", "clamp",
          /* Fonctions d'interrogation des tables de correspondance. */
          "table", "tableX", "tableList",
          /* Lecture de l'inventaire depuis les formules. */
          ...CARRIED_FUNCS,
          /* Fonctions de fiche (bornes, effets, combat). */
          ...SCOPE_FUNC_NAMES,
          /* Clé de l'élément natif Quantité : réservée POUR DE BON,
             même si l'élément n'est posé nulle part — une clé unique
             le reste, et aucun modèle futur ne pourra la reprendre. */
          QUANTITY_KEY
        ]);
        if (RESERVED_KEYS.has(key) && !(kind === "quantity" && key === QUANTITY_KEY)) {
          ui.notifications.error(game.i18n.format("SBE.Template.KeyReserved", { key }));
          return false;
        }
        if (this.document.system.isKeyTaken(key, el.id)) {
          ui.notifications.error(game.i18n.format("SBE.Template.KeyTaken", { key }));
          return false;
        }
        /* CLÉ CHANGÉE : tout ce qui l'utilise est montré, puis renommé
           partout (vérificateur de modèles). Annuler = rien n'est écrit. */
        if (!isNew && key !== el.key && el.key) {
          const { KeyRename } = await import("../managers/checker/checker-app.mjs");
          renamePlan = await KeyRename.ask(this.document, el.key, key);
          if (!renamePlan) return false;
        }
      }

      const config = {};
      if (kind === "actorImg") {
        const w = Number(v("aimg.width")?.value ?? 110);
        const h = Number(v("aimg.height")?.value ?? 110);
        config.width = Math.max(16, w || 110);
        config.height = Math.max(16, h || 110);
      } else if (kind === "actorName") {
        const sl = (v("aname.subLabel")?.value ?? "").trim();
        if (sl) config.subLabel = sl;
      }
      if (kind === "text") {
        const d = v("text.default")?.value ?? "";
        if (d !== "") config.default = d;
        const fw = v("text.width")?.value;
        if (fw !== "" && fw != null) config.width = Math.max(20, Number(fw));
      } else if (kind === "number") {
        config.integer = !!v("num.integer")?.checked;
        const fw = v("num.width")?.value;
        if (fw !== "" && fw != null) config.width = Math.max(20, Number(fw));
        if (!config.integer) config.decimals = Number(v("num.decimals")?.value ?? 2);
        const min = v("num.min")?.value, max = v("num.max")?.value, dflt = v("num.default")?.value;
        if (min !== "" && min != null) config.min = Number(min);
        if (max !== "" && max != null) config.max = Number(max);
        if (config.min !== undefined && config.max !== undefined && config.min > config.max) {
          ui.notifications.error(L("SBE.Template.MinAboveMax"));
          return false;
        }
        if (dflt !== "" && dflt != null) config.default = Number(dflt);
        /* Maximum en FORMULE (comme une jauge) et affichage « valeur / max ». */
        const nmf = (v("num.maxFormula")?.value ?? "").trim();
        if (nmf) {
          const { validateFormula } = await import("./formula-engine.mjs");
          const err = validateFormula(nmf);
          if (err) { ui.notifications.error(err); return false; }
          config.maxFormula = nmf;
        } else delete config.maxFormula;
        if (v("num.showMax")?.checked) config.showMax = true; else delete config.showMax;
        /* Mode calculé : formule obligatoire et syntaxiquement valide ;
           clé inconnue = autorisé avec avertissement (décision actée). */
        if (v("num.computed")?.checked) {
          const formula = (v("num.formula")?.value ?? "").trim();
          const { validateFormula, extractIdentifiers, FORMULA_FUNCS } = await import("./formula-engine.mjs");
          const err = validateFormula(formula);
          if (err) {
            ui.notifications.error(err);
            return false;
          }
          const known = new Set(this.document.system.keys);
          known.add(key);
          const { LOOKUP_FUNCS } = await import("./lookup.mjs");
          const engineFuncs = new Set([...LOOKUP_FUNCS, ...CARRIED_FUNCS, ...SCOPE_FUNC_NAMES]);
          const unknown = extractIdentifiers(formula).filter(id =>
            !known.has(id) && !(id in FORMULA_FUNCS) && !engineFuncs.has(id) &&
            !["Math", "Number", "Boolean", "String", "true", "false", "null", "undefined"].includes(id));
          if (unknown.length) {
            ui.notifications.warn(game.i18n.format("SBE.Formula.UnknownKeys", { keys: unknown.join(", ") }));
          }
          config.computed = true;
          config.formula = formula;
        } else {
          /* « 2 en 1 » : valeur saisie + bonus de formule (facultatif).
             Le champ affiche le total, la base reste modifiable. */
          const bonus = (v("num.bonusFormula")?.value ?? "").trim();
          if (bonus) {
            const { validateFormula, extractIdentifiers, FORMULA_FUNCS } = await import("./formula-engine.mjs");
            const err = validateFormula(bonus);
            if (err) {
              ui.notifications.error(err);
              return false;
            }
            const known = new Set(this.document.system.keys);
            known.add(key);
            const unknown = extractIdentifiers(bonus).filter(id =>
              !known.has(id) && !(id in FORMULA_FUNCS) &&
              !["Math", "Number", "Boolean", "String", "true", "false", "null", "undefined"].includes(id));
            if (unknown.length) {
              ui.notifications.warn(game.i18n.format("SBE.Formula.UnknownKeys", { keys: unknown.join(", ") }));
            }
            config.bonusFormula = bonus;
            /* « Part des objets portés » est le défaut : non stocké. */
            const tone = v("num.bonusTone")?.value;
            if (tone && tone !== "items" && BONUS_TONES.includes(tone)) config.bonusTone = tone;
          }
        }
      } else if (kind === "chart") {
        config.type = CHART_TYPES.includes(v("ch.variant")?.value)
          ? v("ch.variant").value : "radar";
        const axes = (v("ch.axes")?.value ?? "").split("\n")
          .map(l => l.trim()).filter(Boolean)
          .map(l => {
            const p = l.split(":").map(x => x.trim());
            return { key: p[0] ?? "", label: p[1] || (p[0] ?? ""), color: p[2] || "" };
          })
          .filter(a => a.key);
        /* Les champs GLISSÉS dans le graphe comptent comme des données :
           la liste tapée peut rester vide. */
        const kidKeys = new Set((Array.isArray(el.children) ? el.children : [])
          .filter(k => ["number", "gauge"].includes(k?.kind) && k.key)
          .map(k => k.key));
        const totalAxes = kidKeys.size + axes.filter(a => !kidKeys.has(a.key)).length;
        const minAxes = ["radar", "radar2"].includes(config.type) ? 3 : 1;
        /* Simple AVERTISSEMENT, jamais bloquant : on crée souvent le
           graphe VIDE pour y glisser les champs ensuite. */
        if (totalAxes > 0 && totalAxes < minAxes) {
          ui.notifications.warn(game.i18n.format("SBE.Template.ChartNeedsAxes", { n: minAxes }));
        }
        config.axes = axes;
        const cmin = v("ch.min")?.value, cmax = v("ch.max")?.value;
        if (cmin !== "" && cmin != null) config.min = Number(cmin);
        if (cmax !== "" && cmax != null) config.max = Number(cmax);
        if (config.min !== undefined && config.max !== undefined && config.max <= config.min) {
          ui.notifications.error(L("SBE.Template.MinAboveMax"));
          return false;
        }
        const cs = Number(v("ch.size")?.value);
        if (cs >= 60) config.size = cs;
        const cc = (v("ch.color")?.value ?? "").trim();
        if (cc) config.color = cc;
        if (!v("ch.showValues")?.checked) config.showValues = false;
        /* Radar comparatif : 2e série de clés (mêmes branches, même ordre). */
        if (config.type === "radar2") {
          const keys2 = (v("ch.axes2")?.value ?? "").split("\n")
            .map(l => l.split(":")[0].trim()).filter(Boolean);
          if (keys2.length) config.axes2 = keys2;
        }
      } else if (kind === "html") {
        /* Stocké TEL QUEL — l'ASSAINISSEMENT se fait AU RENDU (même
           un modèle importé trafiqué ne peut pas exécuter de code). */
        config.code = v("html.code")?.value ?? "";
      } else if (kind === "checkbox") {
        config.default = !!v("chk.default")?.checked;
      } else if (kind === "color") {
        config.default = String(v("color.default")?.value ?? "#ffffff").toLowerCase();
      } else if (kind === "shopStall") {
        const sv = v("stall.view")?.value;
        config.view = STALL_VIEWS.includes(sv) ? sv : "list";
        const n = (name, d) => { const x = Math.floor(Number(v(name)?.value)); return Number.isFinite(x) ? x : d; };
        config.cols = Math.min(4, Math.max(1, n("stall.cols", 1)));
        config.cellSize = Math.max(24, n("stall.cellSize", 56));
        config.gridCols = Math.max(0, n("stall.gridCols", 0));
        config.gridRows = Math.max(0, n("stall.gridRows", 0));
        const tb = v("stall.tabs")?.value;
        config.tabs = STALL_TABS.includes(tb) ? tb : "none";
        const tk = (v("stall.tabKey")?.value ?? "").trim();
        if (config.tabs === "key") {
          if (!KEY_RE.test(tk)) { ui.notifications.error(L("SBE.Shop.TabKeyNeeded")); return false; }
          config.tabKey = tk;
        }
        if (!v("stall.showQty")?.checked) config.showQty = false;
        if (v("stall.soldOut")?.value === "hide") config.soldOut = "hide";
      } else if (kind === "shopSell") {
        const t = (v("sell.text")?.value ?? "").trim();
        if (t) config.text = t;
      } else if (kind === "level") {
        /* Le niveau est une VALEUR : sa clé est obligatoire. */
        if (!key) { ui.notifications.error(L("SBE.Level.KeyNeeded")); return false; }
        const st = Number(v("lvl.start")?.value);
        config.default = Number.isFinite(st) ? Math.max(0, Math.floor(st)) : 1;
        const mx = (v("lvl.max")?.value ?? "").trim();
        if (mx) {
          if (!Number.isFinite(Number(mx))) { const err = validateFormula(mx); if (err) { ui.notifications.error(err); return false; } }
          config.max = mx;
        }
        if (v("lvl.mode")?.value === "xp") config.mode = "xp";
        const xk = (v("lvl.xpKey")?.value ?? "").trim();
        if (xk) {
          if (!KEY_RE.test(xk)) { ui.notifications.error(L("SBE.Template.KeyInvalid")); return false; }
          config.xpKey = xk;
        }
        const th = (v("lvl.thresholds")?.value ?? "").trim();
        if (th) {
          if (!/^[\d\s.,;]+$/.test(th)) { const err = validateFormula(th); if (err) { ui.notifications.error(err); return false; } }
          config.thresholds = th;
        }
        if (v("lvl.showMax")?.checked) config.showMax = true;
        const gg = v("lvl.gauge")?.value;
        if (LEVEL_GAUGES.includes(gg) && gg !== "none") config.gauge = gg;
        if (!v("lvl.button")?.checked) config.button = false;
        const who = v("lvl.who")?.value;
        if (LEVEL_WHO.includes(who) && who !== "player") config.who = who;
        if (v("lvl.commit")?.value === "live") config.commit = "live";
        if (v("lvl.received")?.value === "direct") config.received = "direct";
        const bp = (v("lvl.bPoints")?.value ?? "").trim();
        if (bp && !Number.isFinite(Number(bp))) { const err = validateFormula(bp); if (err) { ui.notifications.error(err); return false; } }
        const bf = (v("lvl.bFields")?.value ?? "").trim();
        const bl = (v("lvl.bLeft")?.value ?? "").trim();
        if (bl && !KEY_RE.test(bl)) { ui.notifications.error(L("SBE.Template.KeyInvalid")); return false; }
        /* Règles, descente, historique : réglés dans leur éditeur, gardés tels quels. */
        for (const k of ["rules", "down", "history"]) if (el.config?.[k] !== undefined) config[k] = foundry.utils.deepClone(el.config[k]);
        if (bp || bf || bl) config.budget = { points: bp, fields: bf, mustSpend: !!v("lvl.bMust")?.checked, leftoverKey: bl, sell: !!v("lvl.bSell")?.checked };
      } else if (kind === "talents") {
        /* Le plan de l'arbre se règle dans son éditeur : on le garde tel quel. */
        if (el.config?.tree) config.tree = foundry.utils.deepClone(el.config.tree);
        const disp = v("tal.display")?.value;
        if (TREE_DISPLAYS.includes(disp) && disp !== "inline") config.display = disp;
        const th = Number(v("tal.height")?.value);
        if (th >= 120 && th !== TREE_DEFAULT_HEIGHT) config.height = Math.min(2000, Math.round(th));
        const pk = (v("tal.pointsKey")?.value ?? "").trim();
        if (pk) {
          if (!KEY_RE.test(pk)) { ui.notifications.error(L("SBE.Template.KeyInvalid")); return false; }
          config.pointsKey = pk;
        }
        const who = v("tal.who")?.value;
        if (TREE_WHO.includes(who) && who !== "player") config.who = who;
        const refund = v("tal.refund")?.value;
        if (TREE_REFUNDS.includes(refund) && refund !== "none") config.refund = refund;
        const rwho = v("tal.refundWho")?.value;
        if (TREE_WHO.includes(rwho) && rwho !== "player") config.refundWho = rwho;
        const pct = Number(v("tal.refundPct")?.value);
        if (Number.isFinite(pct) && pct !== 100) config.refundPct = Math.min(100, Math.max(0, Math.round(pct)));
        if (v("tal.rewardsBack")?.value === "keep") config.rewardsBack = "keep";
      } else if (kind === "select") {
        const choices = (v("sel.choices")?.value ?? "")
          .split("\n").map(s => s.trim()).filter(Boolean);
        if (!choices.length) {
          ui.notifications.error(L("SBE.Template.SelNeedsChoices"));
          return false;
        }
        config.choices = choices;
        const d = (v("sel.default")?.value ?? "").trim();
        if (d && choices.includes(d)) config.default = d;
        /* Couleurs des choix : seulement celles cochées, et seulement
           pour des choix qui existent encore. */
        const colors = {};
        for (const row of root.querySelectorAll(".sbe-sel-colors .sbe-selc-row")) {
          const ch = row.dataset.choice;
          if (choices.includes(ch) && row.querySelector(".sbe-selc-on")?.checked) colors[ch] = row.querySelector(".sbe-selc-col")?.value ?? "#888888";
        }
        if (Object.keys(colors).length) config.choiceColors = colors;
        if (v("sel.headerColor")?.checked) config.headerColor = true;
      } else if (kind === "image") {
        const d = (v("img.default")?.value ?? "").trim();
        if (d) config.default = d;
        const dLab = (v("img.defaultLabel")?.value ?? "").trim();
        const dIco = (v("img.defaultIcon")?.value ?? "").trim();
        if (dLab) config.defaultLabel = dLab;
        if (dIco) config.defaultIcon = dIco;
        /* IMAGES NOMMÉES : le créateur téléverse et nomme, le joueur
           choisit par NOM. La valeur stockée reste le CHEMIN — c'est
           elle que liront le fond d'un cadre, une formule ou une
           info-bulle ; jamais de chemin à saisir côté joueur. */
        const choices = [];
        for (const row of root.querySelectorAll("[data-imgchoices] .sbe-imgchoice")) {
          const lab = (row.querySelector(".ic-label")?.value ?? "").trim();
          const pth = (row.querySelector(".ic-path")?.value ?? "").trim();
          const ico = (row.querySelector(".ic-icon")?.value ?? "").trim();
          if (!pth) continue;
          const entry = { label: lab, path: pth };
          if (ico) entry.icon = ico;
          /* Ni nom ni icône : on retombe sur le nom du fichier, sinon
             le choix serait invisible sur la fiche. */
          if (!lab && !ico) entry.label = pth.split("/").pop().replace(/\.[^.]+$/, "");
          choices.push(entry);
        }
        if (choices.length) {
          config.choices = choices;
          const pPos = v("img.pickerPos")?.value ?? "bottomCenter";
          if (pPos !== "bottomCenter") config.pickerPos = pPos;
          /* Sans image par défaut renseignée, la première de la liste
             sert de départ — jamais de champ vide. */
          if (!config.default) config.default = choices[0].path;
        }
        const h = v("img.height")?.value;
        if (h !== "" && h != null) config.height = Math.max(16, Number(h));
        const w = v("img.width")?.value;
        if (w !== "" && w != null) config.width = Math.max(16, Number(w));
      } else if (kind === "table") {
        /* Colonnes et lignes vivent dans le WYSIWYG : on les conserve.
           Les compteurs ajustent les dimensions : en plus → colonnes
           auto (col1, col2… éditables ensuite) et lignes vides ; en
           moins → retrait par la fin (contenu du surplus perdu). */
        config.columns = Array.isArray(el.config?.columns) ? foundry.utils.deepClone(el.config.columns) : [];
        config.rows = Array.isArray(el.config?.rows) ? foundry.utils.deepClone(el.config.rows) : [];

        config.lookup = !!v("tbl.lookup")?.checked;
        if (config.lookup) {
          const lk = (v("tbl.lowKey")?.value ?? "").trim();
          const hk = (v("tbl.highKey")?.value ?? "").trim();
          if (lk) config.lowKey = lk;
          if (hk) config.highKey = hk;
        }

        /* Import CSV : les colonnes et les lignes lues remplacent tout,
           les compteurs de dimensions ne s'appliquent pas cette fois. */
        const csvRaw = (v("tbl.csvdata")?.value ?? "").trim();
        if (csvRaw) {
          try {
            const data = JSON.parse(csvRaw);
            config.columns = data.columns;
            config.rows = data.rows;
            if (config.lookup) {
              if (!config.lowKey || !config.columns.some(cc => cc.key === config.lowKey)) {
                config.lowKey = config.columns[0]?.key ?? "";
              }
              if (!config.highKey || !config.columns.some(cc => cc.key === config.highKey)) {
                config.highKey = config.columns[1]?.key ?? "";
              }
            }
            el.config = { ...(el.config ?? {}), columns: config.columns, rows: config.rows };
          } catch (_e) {
            ui.notifications.error(L("SBE.Lookup.CsvBad"));
            return false;
          }
        }

        const wantCols = csvRaw
          ? config.columns.length
          : Math.min(12, Math.max(1, Math.floor(Number(v("tbl.cols")?.value ?? config.columns.length))));
        const wantRows = csvRaw
          ? config.rows.length
          : Math.min(50, Math.max(0, Math.floor(Number(v("tbl.rows")?.value ?? config.rows.length))));

        let n = 1;
        while (config.columns.length < wantCols) {
          while (config.columns.some(cc => cc.key === `col${n}`)) n++;
          config.columns.push({
            id: foundry.utils.randomID(), key: `col${n}`, label: `Col. ${n}`,
            type: "text", playerVisible: true, locked: true
          });
        }
        if (config.columns.length > wantCols) {
          const removed = config.columns.splice(wantCols);
          for (const r of config.rows) {
            for (const rc of removed) if (r.cells) delete r.cells[rc.key];
          }
          ui.notifications.warn(game.i18n.format("SBE.Table.DimColsTrimmed", { count: removed.length }));
        }
        while (config.rows.length < wantRows) {
          config.rows.push({ id: foundry.utils.randomID(), cells: {} });
        }
        if (config.rows.length > wantRows) {
          const cut = config.rows.length - wantRows;
          config.rows.length = wantRows;
          ui.notifications.warn(game.i18n.format("SBE.Table.DimRowsTrimmed", { count: cut }));
        }
      } else if (kind === "slot" || kind === "container") {
        /* FILTRE COMMUN : slot et conteneur acceptent (ou refusent) de
           la même façon — une seule mécanique, deux tailles. */
        config.filterType = ["none", "template", "tag", "key"].includes(v("slot.filterType")?.value)
          ? v("slot.filterType").value : "none";
        if (config.filterType === "template") {
          config.filterTemplates = [...root.querySelectorAll(".sbe-slot-tplchk")]
            .filter(chk => chk.checked).map(chk => chk.dataset.id);
        } else if (config.filterType === "tag") {
          config.filterTag = (v("slot.filterTag")?.value ?? "").trim();
        } else if (config.filterType === "key") {
          config.filterKey = (v("slot.filterKey")?.value ?? "").trim();
        }
        /* « Seulement les objets de la liste » : une liste de
           références de CE modèle (pas la sienne). */
        const lk = (v("slot.listKey")?.value ?? "").trim();
        if (lk) config.listKey = lk; else delete config.listKey;
        const xt = (v("slot.excludeTag")?.value ?? "").trim();
        if (xt) config.excludeTag = xt; else delete config.excludeTag;
        /* Compatibilité : la case de l'objet qui porte la valeur de
           cette liste déroulante de l'hôte doit être cochée. */
        const ck = (v("slot.compatKey")?.value ?? "").trim();
        if (ck) config.compatKey = ck; else delete config.compatKey;
        const pfx = kind === "slot" ? "slot" : "cont";
        /* Capacité : un nombre, ou une formule lue sur l'objet hôte
           (« magSize » pour un chargeur). Vide = illimité. */
        const qmax = String(v(`${pfx}.qtyMax`)?.value ?? "").trim();
        if (!qmax) delete config.qtyMax;
        else if (Number.isFinite(Number(qmax))) config.qtyMax = Math.max(1, Math.floor(Number(qmax)));
        else {
          const { validateFormula } = await import("./formula-engine.mjs");
          const err = validateFormula(qmax);
          if (err) { ui.notifications.error(err); return false; }
          config.qtyMax = qmax;
        }
        config.acceptStacks = !!v(`${pfx}.acceptStacks`)?.checked;

        if (kind === "slot") {
          config.mode = v("slot.mode")?.value === "reference" ? "reference" : "instance";
          const ssize = v("slot.size")?.value;
          if (ssize !== "" && ssize != null) config.size = Math.max(24, Number(ssize));
          /* Slot occupé : refus par défaut ; le créateur peut demander
             que la question du remplacement soit posée. */
          config.askReplace = !!v("slot.askReplace")?.checked;
          /* Nom de l'objet à droite de l'icône (sinon : dans la bulle). */
          if (v("slot.showName")?.checked) config.showName = true; else delete config.showName;
          /* Après le dépôt : proposer ce bouton de l'objet déposé. */
          const ad = String(v("slot.afterDrop")?.value ?? "").trim();
          if (ad) config.afterDrop = ad; else delete config.afterDrop;
          const et = (v("slot.emptyText")?.value ?? "").trim();
          if (et) config.emptyText = et; else delete config.emptyText;
        } else {
          if (v("cont.mode")?.value === "reference") config.mode = "reference"; else delete config.mode;
          if (config.mode === "reference" && config.listKey === key) delete config.listKey;
          /* Reflet d'une autre liste (lecture seule) ; envoi dans le chat. */
          const mir = config.mode === "reference" ? (v("cont.mirror")?.value ?? "").trim() : "";
          if (mir && mir !== key) config.mirror = mir; else delete config.mirror;
          if (config.mode === "reference" && v("cont.toChat")?.checked) config.toChat = true; else delete config.toChat;
          const rev = config.mode === "reference" ? (v("cont.reverse")?.value ?? "").trim() : "";
          if (rev) config.reverse = rev; else delete config.reverse;
          if (config.mode === "reference" && v("cont.ownedOnly")?.checked) config.ownedOnly = true; else delete config.ownedOnly;
          if (config.mode !== "reference" && v("cont.unique")?.checked) config.unique = true; else delete config.unique;
          if (config.mode !== "reference" && v("cont.equips")?.checked) config.equips = true; else delete config.equips;
          config.noGroup = !!v("cont.noGroup")?.checked;
          config.catMode = ["none", "key", "manual"].includes(v("cont.catMode")?.value)
            ? v("cont.catMode").value : "none";
          config.catKey = (v("cont.catKey")?.value ?? "").trim();
          config.subKey = (v("cont.subKey")?.value ?? "").trim();
          config.catIcons = [...root.querySelectorAll(".sbe-cat-icon")].map(row => ({
            value: (row.querySelector(".sbe-cico-value")?.value ?? "").trim(),
            icon: (row.querySelector(".sbe-cico-icon")?.value ?? "").trim()
          })).filter(r => r.value);
          config.cats = [...root.querySelectorAll(".sbe-cat-row")].map(row => ({
            label: (row.querySelector(".sbe-ccat-label")?.value ?? "").trim(),
            icon: (row.querySelector(".sbe-ccat-icon")?.value ?? "").trim(),
            fType: row.querySelector(".sbe-ccat-ftype")?.value ?? "tag",
            fVal: (row.querySelector(".sbe-ccat-fval")?.value ?? "").trim(),
            sub: !!row.querySelector(".sbe-ccat-sub")?.checked
          })).filter(r => r.label || r.fVal);
          const isz = v("cont.iconSize")?.value;
          if (isz !== "" && isz != null) config.iconSize = Math.min(256, Math.max(8, Number(isz)));
          else delete config.iconSize;
          config.display = ["list", "grid", "spatial", "tiles", "cards"].includes(v("cont.display")?.value)
            ? v("cont.display").value : "list";
          /* Cartes : réservées aux listes de références ; fiches : aux objets portés (sinon, liste). */
          if (config.display === "tiles" && config.mode !== "reference") config.display = "list";
          if (config.display === "cards" && config.mode === "reference") config.display = "list";
          /* Fiches : verrou, dépliant, jauge, sections côte à côte, texte quand vide. */
          for (const k of ["cardLock", "cardDesc"]) {
            const f = (v(`cont.${k}`)?.value ?? "").trim();
            if (f && config.display === "cards") {
              const err = validateFormula(f);
              if (err) { ui.notifications.error(`${L("SBE.Inv.DisplayCards")} : ${err}`); return false; }
              config[k] = f;
            } else delete config[k];
          }
          for (const k of ["cardGauge", "cardGaugeLabel", "emptyText"]) {
            const t = (v(`cont.${k}`)?.value ?? "").trim();
            if (t && config.display === "cards") config[k] = t; else delete config[k];
          }
          if (v("cont.cardSplit")?.checked && config.display === "cards") config.cardSplit = true; else delete config.cardSplit;
          const gInt = (n, lo, hi) => { const x = Math.floor(Number(v(n)?.value)); return Number.isFinite(x) && x >= lo ? Math.min(hi, x) : 0; };
          /* Grille spatiale : colonnes et lignes obligatoires (ses propres champs). */
          const spa = config.display === "spatial";
          const gc = spa ? (gInt("cont.spCols", 1, 50) || SPATIAL_DEFAULT_COLS) : gInt("cont.gridCols", 1, 50);
          const gr = spa ? (gInt("cont.spRows", 1, 100) || SPATIAL_DEFAULT_ROWS) : gInt("cont.gridRows", 1, 100);
          const cz = spa ? gInt("cont.spCell", 24, 256) : gInt("cont.cellSize", 24, 256);
          if (gc) config.gridCols = gc; else delete config.gridCols;
          if (gr) config.gridRows = gr; else delete config.gridRows;
          if (cz) config.cellSize = cz; else delete config.cellSize;
          delete config.gridSort;   /* rangement : choix du joueur, sur la fiche */
          if (v("cont.gridName")?.checked) config.gridName = true; else delete config.gridName;
          config.cols = [...root.querySelectorAll(".sbe-cont-col")].map(row => {
            const col = {
              key: (row.querySelector(".sbe-ccol-key")?.value ?? "").trim(),
              label: (row.querySelector(".sbe-ccol-label")?.value ?? "").trim(),
              width: (row.querySelector(".sbe-ccol-width")?.value ?? "").trim()
            };
            /* Fiches : où, texte, condition, teinte (seulement ce qui diffère du défaut). */
            const place = row.querySelector(".sbe-ccol-place")?.value;
            if (place && place !== "chip") col.place = place;
            const text = (row.querySelector(".sbe-ccol-text")?.value ?? "").trim();
            if (text) col.text = text;
            const showIf = (row.querySelector(".sbe-ccol-showif")?.value ?? "").trim();
            if (showIf) col.showIf = showIf;
            const tone = row.querySelector(".sbe-ccol-tone")?.value;
            if (tone) col.tone = tone;
            return col;
          }).filter(col => col.key);
        }
      } else if (kind === "quantity") {
        const d = v("qty.default")?.value;
        config.default = Math.max(1, Number(d) || 1);
      } else if (kind === "richtext") {
        if (v("rich.paper")?.value === "lined") config.paper = "lined"; else delete config.paper;
        if (v("rich.editor")?.value === "open") config.editor = "open"; else delete config.editor;
        const mh = Math.max(0, Math.floor(Number(v("rich.minHeight")?.value) || 0));
        if (mh) config.minHeight = mh; else delete config.minHeight;
      } else if (kind === "tags") {
        config.entries = (v("tags.entries")?.value ?? "")
          .split("\n").map(t => t.trim()).filter(Boolean);
        const hl = v("tags.highlight")?.value ?? "bound";
        if (hl !== "bound") config.highlight = hl;
        if (v("tags.place")?.value === "header") config.place = "header";
      } else if (kind === "button") {
        const act = v("btn.action")?.value;
        config.action = ["menu", "steps"].includes(act) ? act : "consume";
        const icon = (v("btn.icon")?.value ?? "").trim();
        if (icon) config.icon = icon;
        /* Proposé hors de la fiche (inventaire, HUD) : OUI par défaut,
           on n'écrit que l'exception. */
        if (v("btn.showInCtx")?.checked) delete config.showInCtx; else config.showInCtx = false;
        { const w = v("btn.where")?.value; if (["placed", "both", "auto"].includes(w)) config.where = w; else delete config.where; }
        if (v("btn.announce")?.checked && config.action !== "menu") config.announce = true; else delete config.announce;
        if (config.action === "consume") {
          config.chargesKey = v("btn.chargesKey")?.value ?? "";
          /* Montant : nombre fixe OU formule (clés des champs = variables). */
          const rawAmount = (v("btn.amount")?.value ?? "1").trim() || "1";
          if (!/^-?\d+(\.\d+)?$/.test(rawAmount)) {
            const { validateFormula } = await import("./formula-engine.mjs");
            const err = validateFormula(rawAmount);
            if (err) { ui.notifications.error(err); return false; }
          }
          config.amount = rawAmount;
          config.onZero = ["none", "qty", "delete"].includes(v("btn.onZero")?.value)
            ? v("btn.onZero").value : "none";
        }
        if (config.action === "steps") {
          const steps = this.#readSteps(root);
          if (steps === null) return false;
          config.steps = steps;
          /* Se lance tout seul (déclencheurs d'actions). */
          const auto = this.#readAuto(root);
          if (auto === null) return false;
          if (auto) config.auto = auto; else delete config.auto;
        } else {
          delete config.steps;
          delete config.auto;
        }
      } else if (kind === "nav") {
        if (v("nav.orient")?.value === "v") config.orient = "v";
        const na = v("nav.align")?.value;
        if (["center", "right"].includes(na)) config.align = na;
        if (v("nav.side")?.value === "right") config.side = "right";
      } else if (kind === "tab") {
        const ic = (v("tab.icon")?.value ?? "").trim();
        if (ic) config.icon = ic;
        const tt = (v("tab.tooltip")?.value ?? "").trim();
        if (tt) config.tooltip = tt;
        const cs = UiSound.read(root, "tab.clickSound");
        if (cs.sound) config.clickSound = cs;
      } else if (kind === "frame") {
        /* PLACEMENT LIBRE : les enfants se posent où l'on veut. */
        if (v("frame.freePos")?.checked) config.freePos = true;
        if (!v("frame.collapsible")?.checked) config.noCollapse = true;
        if (v("frame.pinned")?.checked) config.pinned = true;
        config.startCollapsed = !!v("frame.startCollapsed")?.checked;
        if (v("frame.bare")?.checked) config.bare = true;
        const cp = v("frame.caretPos")?.value;
        if (cp && cp !== "left") config.caretPos = cp;
        if (v("frame.titlePos")?.value === "above") config.titlePos = "above";
      } else if (kind === "columns") {
        config.count = Math.min(10, Math.max(2, Number(v("cols.count")?.value ?? 2)));
        /* Largeurs % (normalisées à 100 par sécurité). */
        const ws = [];
        for (let i = 0; i < config.count; i++) ws.push(Number(v(`cols.w${i}`)?.value) || 0);
        if (ws.some(w => w > 0)) {
          const s = ws.reduce((a, b) => a + b, 0) || 1;
          const norm = ws.map(w => Math.max(1, Math.round(w * 100 / s)));
          norm[norm.length - 1] += 100 - norm.reduce((a, b) => a + b, 0);
          config.widths = norm;
        }
        if (v("cols.equal")?.checked) config.equalHeight = true;
      } else if (kind === "ref") {
        const t = (v("ref.target")?.value ?? "").trim();
        if (!t) { ui.notifications.error(L("SBE.Panel.RefNone")); return false; }
        config.refKey = t;
        if (v("ref.noLabel")?.checked) config.noLabel = true; else delete config.noLabel;
      } else if (kind === "separator") {
        const img = (v("sep.image")?.value ?? "").trim();
        if (img) config.image = img;
        const h = v("sep.height")?.value;
        if (h !== "" && h != null) config.height = Math.max(2, Number(h));
      } else if (kind === "gauge") {
        const gmin = Number(v("g.min")?.value ?? 0) || 0;
        if (gmin !== 0) config.min = gmin;
        config.max = Number(v("g.max")?.value ?? 100);
        if (config.max <= gmin && !(v("g.maxFormula")?.value ?? "").trim()) {
          ui.notifications.error(L("SBE.Template.MinAboveMax"));
          return false;
        }
        const d = v("g.default")?.value;
        if (d !== "" && d != null) config.default = Number(d);
        config.low = Math.min(100, Math.max(0, Number(v("g.low")?.value ?? 25)));
        config.high = Math.min(100, Math.max(0, Number(v("g.high")?.value ?? 75)));
        if (config.low > config.high) {
          ui.notifications.error(L("SBE.Template.GaugeLowAboveHigh"));
          return false;
        }
        /* Seuil critique (facultatif) : au-dessus du seuil haut. */
        const cr = String(v("g.crit")?.value ?? "").trim();
        if (cr !== "") {
          config.crit = Math.min(100, Math.max(0, Number(cr) || 0));
          if (config.crit < config.high) {
            ui.notifications.error(L("SBE.Template.GaugeCritBelowHigh"));
            return false;
          }
        } else delete config.crit;
        config.text = v("g.text")?.value ?? "valueMax";
        const mf = (v("g.maxFormula")?.value ?? "").trim();
        if (mf) {
          const err = validateFormula(mf);
          if (err) { ui.notifications.error(err); return false; }
          config.maxFormula = mf;
        } else delete config.maxFormula;
        if (v("g.computed")?.checked) {
          const gf = (v("g.formula")?.value ?? "").trim();
          const err = validateFormula(gf);
          if (err) { ui.notifications.error(err); return false; }
          config.computed = true;
          config.formula = gf;
        } else { delete config.computed; delete config.formula; }
        /* Plafond strict (jauge calculée) : refus des ajouts qui la
           feraient dépasser son maximum. */
        if (config.computed && v("g.blockMax")?.checked) {
          config.blockMax = true;
          const bm = (v("g.blockMsg")?.value ?? "").trim();
          if (bm) config.blockMsg = bm; else delete config.blockMsg;
          if (v("g.blockGm")?.checked) config.blockGm = true; else delete config.blockGm;
        } else { delete config.blockMax; delete config.blockMsg; delete config.blockGm; }
        /* Points temporaires (jauge saisie seulement). */
        if (!config.computed && v("g.tempOn")?.checked) {
          config.temp = {
            on: true,
            stack: v("g.tempStack")?.value === "add" ? "add" : "max",
            endCombat: !!v("g.tempCombat")?.checked,
            newDay: !!v("g.tempNewDay")?.checked,
            rounds: Math.max(0, Math.floor(Number(v("g.tempRounds")?.value) || 0)),
            minutes: Math.max(0, Math.floor(Number(v("g.tempMinutes")?.value) || 0))
          };
        } else delete config.temp;
        /* Débordement (jauge saisie) : vers une autre clé du même document. */
        const ovLow = (v("g.overLow")?.value ?? "").trim();
        const ovHigh = (v("g.overHigh")?.value ?? "").trim();
        if (!config.computed && (ovLow || ovHigh)) {
          const bad = [ovLow, ovHigh].find(k => k && (!/^[A-Za-z_]\w*$/.test(k) || k === key));
          if (bad) { ui.notifications.error(game.i18n.format("SBE.Gauge.OverBadKey", { key: bad })); return false; }
          const ratio = Number(v("g.overRatio")?.value);
          config.overflow = { low: ovLow, high: ovHigh, ratio: Number.isFinite(ratio) && ratio >= 0 ? ratio : 1 };
        } else delete config.overflow;
        if (v("g.decimals")?.checked) { config.integer = false; config.decimals = 3; }
        else { delete config.integer; delete config.decimals; }
        if (v("g.display")?.value === "pips") {
          config.display = "pips";
          const pi = (v("g.pipIcon")?.value ?? "").trim();
          if (pi) config.pipIcon = pi; else delete config.pipIcon;
        } else { delete config.display; delete config.pipIcon; }
      }

      /* --- Jet de dés (champs nombre et jauge) --- */
      if (["number", "gauge"].includes(kind) && v("roll.on")?.checked) {
        const rf = (v("roll.formula")?.value ?? "").trim();
        if (!rf) {
          ui.notifications.error(L("SBE.Roll.NeedFormula"));
          return false;
        }
        const roll = { on: true, formula: rf };
        const rl = (v("roll.label")?.value ?? "").trim();
        if (rl) roll.label = rl;
        if (v("roll.noIcon")?.checked) roll.noIcon = true;
        const ricon = v("roll.icon")?.value ?? "";
        if (ricon && ricon !== DICE_ICON_DEFAULT) roll.icon = ricon;
        /* Identifiants : étiquettes libres partagées par plusieurs jets.
           Un apport visant « physique » touche tous les jets étiquetés
           ainsi, sans connaître leurs clés. */
        const rids = (v("roll.ids")?.value ?? "").split(",")
          .map(x => x.trim()).filter(Boolean)
          .filter(x => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(x));
        const ridsRaw = (v("roll.ids")?.value ?? "").split(",").map(x => x.trim()).filter(Boolean);
        if (ridsRaw.length !== rids.length) {
          ui.notifications.error(L("SBE.Roll.IdsBad"));
          return false;
        }
        if (rids.length) roll.ids = [...new Set(rids)];
        const rc = v("roll.compare")?.value ?? "none";
        if (rc !== "none") roll.compare = rc;
        const rt = (v("roll.target")?.value ?? "").trim();
        if (rt) roll.target = rt;
        const ra = v("roll.apply")?.value ?? "none";
        if (ra !== "none") roll.apply = ra;
        /* Seuils critiques : valeur fixe OU formule évaluée au jet. */
        for (const nm of ["critS", "critF"]) {
          const mode = v(`roll.${nm}.mode`)?.value ?? "none";
          if (mode === "none") continue;
          const expr = (v(`roll.${nm}.expr`)?.value ?? "").trim();
          if (!expr) { ui.notifications.error(L("SBE.Roll.CritNeedValue")); return false; }
          if (mode === "value" && !Number.isFinite(Number(expr))) {
            ui.notifications.error(L("SBE.Roll.CritNeedNumber")); return false;
          }
          if (mode === "formula" || mode === "cond") {
            const { validateFormula } = await import("./formula-engine.mjs");
            const err = validateFormula(expr);
            if (err) { ui.notifications.error(err); return false; }
          }
          roll[nm] = { mode, expr };
        }
        if (v("roll.critDie")?.checked) roll.critDie = true;
        /* Le dé naturel décale le résultat d'un cran. */
        for (const nm of ["natUp", "natDown"]) {
          const raw = (v(`roll.${nm}`)?.value ?? "").trim();
          if (raw !== "" && Number.isFinite(Number(raw))) roll[nm] = Number(raw);
        }
        /* Fenêtre de jet : seules les options cochées y figurent. */
        const dialog = {};
        for (const nm of ["adv", "mod", "target", "mode"]) if (v(`roll.dlg.${nm}`)?.checked) dialog[nm] = true;
        if (dialog.adv) dialog.advCount = Math.max(2, Math.min(10, Math.trunc(Number(v("roll.dlg.advCount")?.value) || 2)));
        if (Object.keys(dialog).length) roll.dialog = dialog;
        /* Visibilité du message : par défaut + permises. */
        /* Après le jet : relances et bonus. */
        const af = readAfterEditor(root, validateFormula);
        if (af.error) { ui.notifications.error(af.error); return false; }
        if (af.after) roll.after = af.after;
        const vis = readVisPolicy(root, "roll.vis");
        if (!isDefaultVis(vis)) roll.vis = { def: vis.def, allowed: vis.allowed };
        config.roll = roll;
      }

      /* --- Icône du libellé (générique, tous les éléments) --- */
      if (!isNative) {
        const li = (v("labelIcon")?.value ?? "").trim();
        if (li) config.labelIcon = li;
      }

      /* --- Onglet Info-bulle --- */
      if (!isNative) {
        const tt = {};
        if (v("tt.on")?.checked) tt.on = true;
        const ttText = (v("tt.text")?.value ?? "").trim();
        /* Le texte proposé par défaut n'est stocké que si l'info-bulle
           est active — sinon le modèle se remplirait de textes que le
           créateur n'a jamais écrits. */
        const ttSnip = (v("tt.text")?.dataset?.snippet ?? "").trim();
        if (ttText && (tt.on || ttText !== ttSnip)) tt.text = ttText;
        if (v("tt.formula")?.checked) tt.formula = true;
        if (v("tt.bonus")?.checked) tt.bonus = true;
        /* Ligne « Base » : affichée par défaut, seul le refus est stocké. */
        if (v("tt.base") && !v("tt.base").checked) tt.noBase = true;
        const ttCol = (v("tt.color")?.value ?? "").trim();
        if (ttCol) tt.color = ttCol;
        if (Object.keys(tt).length) config.tt = tt;
      }

      /* --- Onglet Style : ne stocke que ce qui est renseigné. --- */
      const style = {};
      const sVal = (n) => v(n)?.value?.trim?.() ?? v(n)?.value ?? "";
      const sSet = (prop, name, num = false) => {
        const raw = sVal(name);
        if (raw !== "" && raw != null) style[prop] = num ? Number(raw) : raw;
      };
      sSet("labelColor", "st.labelColor");
      sSet("labelSize", "st.labelSize", true);
      sSet("labelFont", "st.labelFont");
      const lp = sVal("st.labelPos");
      if (lp && lp !== "side-left") style.labelPos = lp;
      if (v("st.labelBold")?.checked) style.labelBold = true;
      if (v("st.labelItalic")?.checked) style.labelItalic = true;
      if (v("st.labelUpper")?.checked) style.labelUpper = true;
      sSet("valueColor", "st.valueColor");
      sSet("valueSize", "st.valueSize", true);
      sSet("bgColor", "st.bgColor");
      if (v("st.noBg")?.checked) style.noBg = true;
      sSet("bgTexture", "st.bgTexture");
      sSet("borderColor", "st.borderColor");
      sSet("borderWidth", "st.borderWidth", true);
      sSet("corners", "st.corners");
      if (["frame", "table", "richtext"].includes(kind)) {
        sSet("headerBg", "st.headerBg");
        sSet("headerColor", "st.headerColor");
      }
      if (kind === "separator") {
        sSet("sepColor", "st.sepColor");
        sSet("sepThickness", "st.sepThickness", true);
      } else if (kind === "chart") {
        sSet("chGrid", "st.chGrid");
        sSet("chBg", "st.chBg");
        sSet("chFill", "st.chFill");
        sSet("chStroke", "st.chStroke");
        sSet("chFillOp", "st.chFillOp", true);
        sSet("chDot", "st.chDot", true);
        sSet("chGridW", "st.chGridW", true);
        sSet("chTick", "st.chTick", true);
        sSet("chStep", "st.chStep", true);
        if (v("st.chGridBg")?.checked) style.chGridBg = true;
        if (sVal("st.chStep") !== "" && sVal("st.chStepUnit") === "pct") style.chStepUnit = "pct";
      } else if (kind === "gauge") {
        sSet("gHeight", "st.gHeight", true);
        sSet("gShape", "st.gShape");
        sSet("gBg", "st.gBg");
        sSet("gFill", "st.gFill");
        sSet("gLow", "st.gLow");
        sSet("gHigh", "st.gHigh");
        sSet("gCrit", "st.gCrit");
        sSet("gBorder", "st.gBorder");
        sSet("gTempD", "st.gTempD");
        sSet("gTempL", "st.gTempL");
        sSet("gTexture", "st.gTexture");
      }
      if (v("st.customOn")?.checked) {
        style.customOn = true;
        sSet("custom", "st.custom");
      }

      /* Élément natif : réglage stocké dans system.nativeUi, PAS dans
         l'arbre — l'en-tête reste en place, juste restylé.
         REMPLACEMENT FORCÉ (pas un merge, qui garderait les réglages
         décochés/effacés) : syntaxe v14, le « ==clé » est déprécié. */
      if (isNative) {
        const slot = el.kind === "actorImg" ? "img" : "name";
        const value = { config, style };
        await this.document.update({
          [`system.nativeUi.${slot}`]: foundry.data.operators.ForcedReplacement.create(value)
        });
        return true;
      }

      const updated = { ...el, kind, key, label, playerVisible, playerEditable, sheetHidden, config, style };
      if (visibleIf) updated.visibleIf = visibleIf; else delete updated.visibleIf;
      /* Propagation : on n'écrit que l'EXCEPTION (décochée) ; absent
         = suit le modèle, ce qui est le défaut. */
      const propBox = root.querySelector('[name="propagate"]');
      if (propBox && !propBox.checked) updated.propagate = false; else delete updated.propagate;
      /* Info-bulle de l'objet : champ montré au survol (modèles d'objets). */
      if (root.querySelector('[name="itemTip"]')?.checked) updated.itemTip = true; else delete updated.itemTip;
      if (root.querySelector('[name="itemTipSigned"]')?.checked) updated.itemTipSigned = true; else delete updated.itemTipSigned;
      if (root.querySelector('[name="itemTipNoDefault"]')?.checked) updated.itemTipNoDefault = true; else delete updated.itemTipNoDefault;
      delete updated.inPanel;
      /* HUD : champ montré sous l'objet dans le HUD (munitions…). */
      if (root.querySelector('[name="hudShow"]')?.checked) updated.hudShow = true; else delete updated.hudShow;
      /* Conteneurs : initialiser les listes d'enfants. */
      if (kind === "columns") {
        const count = config.count;
        const cols = Array.isArray(updated.cols) ? updated.cols : [];
        while (cols.length < count) cols.push([]);
        /* Réduction du nombre de colonnes : rapatrier le surplus. */
        while (cols.length > count) {
          const removed = cols.pop();
          if (removed?.length) cols[cols.length - 1].push(...removed);
        }
        updated.cols = cols;
      } else if (["frame", "nav", "tab", "chart", "level"].includes(kind)
        || (kind === "button" && config.action === "menu")) {
        updated.children = Array.isArray(updated.children) ? updated.children : [];
      }

      const elements = foundry.utils.deepClone(this.document.system.elements);
      if (isNew) {
        if (!parentId && zone) updated.zone = zone;
        const list = getTargetList(elements, { parentId, col });
        /* ZONE LIBRE : le nouvel élément naît au MILIEU de la zone (et
           non collé au coin haut-gauche, sous la barre d'outils, où on
           ne pouvait plus le saisir). Décalé s'il tombe sur un autre. */
        const host = parentId ? findById(elements, parentId) : null;
        if (isFreeFrame(host) && !updated.pos) {
          const zoneEl = this.element?.querySelector(`.sbe-frame-body--free[data-free-zone="${CSS.escape(parentId)}"]`);
          const w = zoneEl?.clientWidth || 300, h = zoneEl?.clientHeight || 120;
          let x = Math.max(8, Math.round(w / 2 - 50)), y = Math.max(8, Math.round(h / 2 - 14));
          const taken = (px, py) => (host.children ?? []).some(c => Math.abs(Number(c?.pos?.x) - px) < 8 && Math.abs(Number(c?.pos?.y) - py) < 8);
          for (let n = 0; n < 20 && taken(x, y); n++) { x += 16; y += 16; }
          updated.pos = { u: "px", x, y };
        }
        /* « + » du haut = ajout au DÉBUT, « + » du bas = à la fin. */
        if (pos === "start") list.unshift(updated);
        else list.push(updated);
      } else {
        const found = findParentList(elements, el.id);
        if (found) found.list[found.index] = updated;
      }
      /* Renommage : les valeurs suivent AVANT que le modèle change (rien
         ne se perd), les références APRÈS. */
      if (!renamePlan) {
        await this.#saveStructure(elements);
        return true;
      }
      /* Une seule entrée d'historique : l'annuler renomme dans l'autre sens. */
      const { KeyRename } = await import("../managers/checker/checker-app.mjs");
      await WorkshopHistory.batch(this.document, async () => {
        await KeyRename.moveValues(renamePlan);
        await this.#saveStructure(elements);
        await KeyRename.applyRefs(renamePlan);
      }, { rename: { old: renamePlan.old, nw: renamePlan.nw } });
      return true;
    };

    return new Promise((resolve) => {
      let done = false;
      const dlg = new foundry.applications.api.DialogV2({
        window: {
          title: L(isNew ? "SBE.Template.AddElTitle" : "SBE.Template.EditElTitle"),
          resizable: true
        },
        position: { width: 560, height: 620 },
        classes: ["sbe-el-dialog-app", "sbe-condense"],
        content,
        /* Un seul bouton natif, masqué par CSS : la validation passe
           par NOS boutons pour pouvoir échouer sans figer la fenêtre. */
        buttons: [
          { action: "cancel", label: L("SBE.Common.Cancel") }
        ]
      });
      dlg.addEventListener("close", () => resolve(done), { once: true });
      dlg.render({ force: true });

      const wire = () => {
        const root = dlg.element;
        if (!root) { setTimeout(wire, 30); return; }

        /* Nos boutons Valider / Annuler. */
        root.querySelector(".sbe-el-validate")?.addEventListener("click", async () => {
          const ok = await trySave(root).catch((err) => {
            console.warn("SBE | Atelier : enregistrement en échec", err);
            return false;
          });
          if (ok) {
            done = true;
            dlg.close();
          }
        });
        root.querySelector(".sbe-el-cancel")?.addEventListener("click", () => dlg.close());

        UiSound.wire(root);
        /* Onglets Base / Style. */
        for (const tab of root.querySelectorAll(".sbe-el-tab")) {
          tab.addEventListener("click", () => {
            for (const t of root.querySelectorAll(".sbe-el-tab")) t.classList.toggle("active", t === tab);
            for (const p of root.querySelectorAll(".sbe-el-pane")) {
              p.style.display = (p.dataset.pane === tab.dataset.tab) ? "" : "none";
            }
          });
        }

        /* Options par type (Base) + groupes de style par type (Style).
           data-skind="field" = visible pour les champs à valeur. */
        const FIELD_KINDS = ["text", "number", "select", "actorName", "quantity", "container"];
        const HEADER_KINDS = ["frame", "table", "richtext", "container"];
        const kindSel = root.querySelector('[name="kind"]');
        /* « Modifiable par le joueur » : uniquement les éléments à
           VALEUR — la structure (cadre, colonnes, nav…) n'en a pas. */
        const PEDITABLE_KINDS = ["text", "number", "checkbox", "color", "select", "gauge", "quantity", "container"];
        const syncKind = () => {
          const k = kindSel?.value ?? el.kind;
          for (const box of root.querySelectorAll(".sbe-el-opts")) {
            /* Un bloc peut servir à PLUSIEURS types (le filtre est
               commun au slot et au conteneur) : « slot container ». */
            box.style.display = box.dataset.kind.split(" ").includes(k) ? "" : "none";
          }
          for (const p of root.querySelectorAll("[data-fnone]")) {
            p.style.display = (p.dataset.fnone === k) ? "" : "none";
          }
          /* QUANTITÉ : clé imposée par le moteur, jamais saisie. */
          const keyIn = root.querySelector('[name="key"]');
          if (keyIn) {
            if (k === "quantity") { keyIn.value = QUANTITY_KEY; keyIn.readOnly = true; }
            else keyIn.readOnly = false;
          }
          /* Propagation : seulement les éléments qui STOCKENT une
             valeur — et jamais la quantité, propre à chaque pile. */
          const pg = root.querySelector("[data-propagate-box]");
          if (pg) pg.style.display = ["text", "richtext", "number", "checkbox", "color", "select",
            "image", "gauge", "table", "slot"].includes(k) ? "" : "none";
          const pe = root.querySelector("[data-peditable-box]");
          if (pe) pe.style.display = PEDITABLE_KINDS.includes(k) ? "" : "none";
          /* Jet de dés : champs à valeur numérique uniquement. */
          const rb = root.querySelector("[data-rollbox]");
          if (rb) rb.style.display = ["number", "gauge"].includes(k) ? "" : "none";
          for (const box of root.querySelectorAll("[data-skind]")) {
            const sk = box.dataset.skind;
            const show = sk === "field" ? FIELD_KINDS.includes(k)
              : (sk === "header" ? HEADER_KINDS.includes(k) : sk === k);
            box.style.display = show ? "" : "none";
          }
        };
        kindSel?.addEventListener("change", syncKind);
        syncKind();
        /* Composant du modèle : une clé proposée (vide seulement). */
        root.querySelector('[name="ref.target"]')?.addEventListener("change", (ev) => {
          const keyIn = root.querySelector('[name="key"]');
          if (keyIn && !keyIn.value.trim() && ev.target.value) keyIn.value = `${ev.target.value}_panel`;
        });

        /* Graphique : base → apparences + aperçu de démonstration. */
        const chBase = root.querySelector('[name="ch.base"]');
        const chVar = root.querySelector('[name="ch.variant"]');
        const chPrev = root.querySelector(".sbe-chart-preview");
        const ax2Box = root.querySelector("[data-chart-axes2-box]");
        if (chBase && chVar) {
          const syncExtras = () => {
            if (ax2Box) ax2Box.style.display = chVar.value === "radar2" ? "" : "none";
            if (chPrev) chPrev.innerHTML = chartPreviewHTML(chVar.value);
          };
          const buildVariants = (selected) => {
            const entry = CHART_BASES.find(b => b[0] === chBase.value) ?? CHART_BASES[0];
            chVar.innerHTML = entry[2].map(t =>
              `<option value="${t}" ${t === selected ? "selected" : ""}>${L("SBE.Template.ChartVar_" + t)}</option>`).join("");
            syncExtras();
          };
          chBase.addEventListener("change", () => buildVariants(null));
          chVar.addEventListener("change", syncExtras);
          buildVariants(el.config?.type ?? "radar");
        }

        /* CSS avancé : zone active seulement si la case est cochée. */
        const cssOn = root.querySelector('[name="st.customOn"]');
        const cssArea = root.querySelector('[name="st.custom"]');
        cssOn?.addEventListener("change", () => { if (cssArea) cssArea.disabled = !cssOn.checked; });

        /* Jauge : le plafond strict n'a de sens que pour une jauge
           calculée (une jauge saisie est déjà bornée) — pas de réglage mort. */
        const gComp = root.querySelector('[name="g.computed"]');
        const gBlock = root.querySelector(".sbe-g-block");
        const gBlockOn = root.querySelector('[name="g.blockMax"]');
        const gBlockOpts = root.querySelector(".sbe-g-blockopts");
        const gTemp = root.querySelector(".sbe-g-temp");
        const gTempOn = root.querySelector('[name="g.tempOn"]');
        const gTempOpts = root.querySelector(".sbe-g-tempopts");
        gComp?.addEventListener("change", () => {
          if (gBlock) gBlock.hidden = !gComp.checked;
          if (gTemp) gTemp.hidden = gComp.checked;
          const gOver = root.querySelector(".sbe-g-over");
          if (gOver) gOver.hidden = gComp.checked;
        });
        gTempOn?.addEventListener("change", () => { if (gTempOpts) gTempOpts.hidden = !gTempOn.checked; });
        gBlockOn?.addEventListener("change", () => { if (gBlockOpts) gBlockOpts.hidden = !gBlockOn.checked; });

        /* Largeurs de colonnes en % : le total est MAINTENU à 100.
           Modifier une colonne répartit le reste sur les autres au
           prorata de leurs largeurs actuelles (mini 5 % chacune). */
        const colsBox = root.querySelector(".sbe-cols-widths");
        const colsCount = root.querySelector('[name="cols.count"]');
        if (colsBox && colsCount) {
          const inputs = () => [...colsBox.querySelectorAll("input")];
          const values = () => inputs().map(x => Number(x.value) || 0);
          const apply = (arr) => inputs().forEach((x, i) => { x.value = arr[i]; });
          const rebalance = (idx) => {
            const arr = values();
            const n = arr.length;
            arr[idx] = Math.min(100 - 5 * (n - 1), Math.max(5, arr[idx]));
            const rest = 100 - arr[idx];
            const others = arr.map((w, i) => (i === idx ? 0 : Math.max(1, w)));
            const oSum = others.reduce((a, b) => a + b, 0) || 1;
            const idxs = [];
            for (let i = 0; i < n; i++) if (i !== idx) idxs.push(i);
            let acc = 0;
            for (let k = 0; k < idxs.length; k++) {
              const i = idxs[k];
              if (k === idxs.length - 1) arr[i] = Math.max(5, rest - acc);
              else { arr[i] = Math.max(5, Math.round(others[i] * rest / oSum)); acc += arr[i]; }
            }
            /* Correction finale : si les minis ont fait déborder, on
               reprend l'excédent sur la colonne éditée. */
            arr[idx] = 100 - idxs.reduce((a, i) => a + arr[i], 0);
            apply(arr);
          };
          const buildW = () => {
            const n = Math.min(10, Math.max(2, Number(colsCount.value) || 2));
            const saved = Array.isArray(c.widths) ? c.widths : [];
            const base = [];
            for (let i = 0; i < n; i++) base.push(Number(saved[i]) > 0 ? Number(saved[i]) : 0);
            let s = base.reduce((a, b) => a + b, 0);
            if (!s) for (let i = 0; i < n; i++) base[i] = Math.round(100 / n);
            s = base.reduce((a, b) => a + b, 0) || 1;
            for (let i = 0; i < n; i++) base[i] = Math.max(5, Math.round(base[i] * 100 / s));
            base[n - 1] += 100 - base.reduce((a, b) => a + b, 0);
            colsBox.innerHTML = base.map((w, i) =>
              `<span style="display:flex;align-items:center;gap:2px;flex:none;">
                 <input type="number" name="cols.w${i}" value="${w}" min="5" max="95" step="1" style="width:64px;">
                 <span>%</span>
               </span>`).join("");
            inputs().forEach((inp, i) => inp.addEventListener("change", () => rebalance(i)));
          };
          colsCount.addEventListener("change", buildW);
          buildW();
        }

        /* Nombre : décimales seulement si pas entier. */
        const intChk = root.querySelector('[name="num.integer"]');
        const decSel = root.querySelector('[name="num.decimals"]');
        intChk?.addEventListener("change", () => { if (decSel) decSel.disabled = intChk.checked; });

        /* INFO-BULLE — écriture proposée SUIVIE EN DIRECT : tant que
           la case « activer l'info-bulle » n'est pas cochée, le texte
           se réécrit à chaque frappe sur le libellé, la clé ou
           l'icône. Dès que la case est cochée, le texte appartient au
           créateur et n'est plus touché. */
        {
          const ttArea = root.querySelector('[name="tt.text"]');
          const ttOn = root.querySelector('[name="tt.on"]');
          const labIn = root.querySelector('[name="label"]');
          const keyIn = root.querySelector('[name="key"]');
          const icoIn = root.querySelector('[name="labelIcon"]');
          if (ttArea) {
            const refresh = () => {
              if (ttOn?.checked) return;
              /* Texte retouché à la main : on ne l'écrase jamais. */
              if (ttArea.value.trim() !== (ttArea.dataset.snippet ?? "").trim()) return;
              const snip = ttSnippetFor({
                kind: root.querySelector('[name="kind"]')?.value ?? el.kind,
                label: labIn?.value ?? "",
                key: keyIn?.value ?? "",
                config: { labelIcon: icoIn?.value ?? "", computed: !!root.querySelector('[name="num.computed"]')?.checked }
              });
              ttArea.dataset.snippet = snip;
              ttArea.value = snip;
            };
            for (const inp of [labIn, keyIn, icoIn]) {
              inp?.addEventListener("input", refresh);
              inp?.addEventListener("change", refresh);
            }
            /* Nombre calculé ou saisi : l'écriture proposée change. */
            root.querySelector('[name="num.computed"]')?.addEventListener("change", refresh);
            root.querySelector('[name="kind"]')?.addEventListener("change", refresh);
            /* Le sélecteur d'icônes émet « change » : déjà couvert. */
            /* Décocher rend la main au suivi automatique. */
            ttOn?.addEventListener("change", () => { if (!ttOn.checked) refresh(); });
          }
        }

        /* TABLE DE CORRESPONDANCE : bloc replié tant que l'option est
           décochée, et import/export CSV (natif navigateur, zéro dép.). */
        {
          const lkChk = root.querySelector('[name="tbl.lookup"]');
          const boxes = [...root.querySelectorAll("[data-lookupbox]")];
          const lowSel = root.querySelector('[name="tbl.lowKey"]');
          const highSel = root.querySelector('[name="tbl.highKey"]');
          const csvData = root.querySelector('[name="tbl.csvdata"]');
          const fileIn = root.querySelector(".sbe-csv-file");
          const colsIn = root.querySelector('[name="tbl.cols"]');
          const rowsIn = root.querySelector('[name="tbl.rows"]');

          lkChk?.addEventListener("change", () => {
            for (const b of boxes) b.style.display = lkChk.checked ? "" : "none";
          });

          root.querySelector(".sbe-csv-import")?.addEventListener("click", () => fileIn?.click());
          fileIn?.addEventListener("change", async () => {
            const f = fileIn.files?.[0];
            if (!f) return;
            const { parseCsv } = await import("./lookup.mjs");
            let text = "";
            try { text = await f.text(); } catch (_e) { /* illisible */ }
            fileIn.value = "";
            const { header, rows } = parseCsv(text);
            if (!header.length || !rows.length) {
              ui.notifications.error(L("SBE.Lookup.CsvEmpty"));
              return;
            }
            /* Clé de colonne dérivée de l'en-tête : lisible dans les
               formules, et repli sur col1, col2… si l'en-tête ne donne
               rien d'utilisable (accents, espaces, doublons). */
            const used = new Set();
            const columns = header.map((h, i) => {
              let key = String(h).normalize("NFD").replace(/[̀-ͯ]/g, "")
                .toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
              if (!key || /^\d/.test(key) || used.has(key)) key = `col${i + 1}`;
              while (used.has(key)) key += "_";
              used.add(key);
              /* Colonne numérique si TOUTES ses cellules sont des nombres. */
              const nums = rows.every(r => {
                const cell = String(r[i] ?? "").trim();
                return cell === "" || Number.isFinite(Number(cell));
              });
              return {
                id: foundry.utils.randomID(), key,
                label: String(h).trim() || `Col. ${i + 1}`,
                type: nums ? "number" : "text", playerVisible: true, locked: true
              };
            });
            const outRows = rows.map(r => {
              const cells = {};
              columns.forEach((col, i) => {
                const raw = String(r[i] ?? "").trim();
                cells[col.key] = (col.type === "number" && raw !== "") ? Number(raw) : raw;
              });
              return { id: foundry.utils.randomID(), cells };
            });
            if (csvData) csvData.value = JSON.stringify({ columns, rows: outRows });
            if (colsIn) colsIn.value = String(columns.length);
            if (rowsIn) rowsIn.value = String(outRows.length);
            /* Les listes de plage suivent les nouvelles colonnes. */
            for (const [sel, def] of [[lowSel, 0], [highSel, 1]]) {
              if (!sel) continue;
              sel.innerHTML = `<option value="">${L("SBE.Template.NoneParen")}</option>`
                + columns.map(cc => `<option value="${foundry.utils.escapeHTML(cc.key)}">${foundry.utils.escapeHTML(cc.label)}</option>`).join("");
              sel.value = columns[def]?.key ?? "";
            }
            ui.notifications.info(game.i18n.format("SBE.Lookup.CsvOk", {
              cols: columns.length, rows: outRows.length
            }));
          });

          root.querySelector(".sbe-csv-export")?.addEventListener("click", async () => {
            const { toCsv } = await import("./lookup.mjs");
            const cols = Array.isArray(el.config?.columns) ? el.config.columns : [];
            const rws = Array.isArray(el.config?.rows) ? el.config.rows : [];
            if (!cols.length) { ui.notifications.warn(L("SBE.Lookup.CsvEmpty")); return; }
            const csv = toCsv(
              cols.map(cc => cc.label || cc.key),
              rws.map(r => cols.map(cc => r.cells?.[cc.key] ?? ""))
            );
            /* BOM : les tableurs ouvrent alors l'UTF-8 sans casser les accents. */
            foundry.utils.saveDataToFile("\uFEFF" + csv, "text/csv",
              `${el.key || "table"}.csv`);
          });
        }

        /* IMAGES NOMMÉES : lignes ajoutables, chacune avec son
           sélecteur de fichier — aucun chemin à taper à la main. */
        {
          const box = root.querySelector("[data-imgchoices]");
          const FP = () => foundry.applications.apps.FilePicker.implementation;
          const wireRow = (row) => {
            row.querySelector(".ic-pick")?.addEventListener("click", () => {
              const input = row.querySelector(".ic-path");
              new (FP())({
                type: "image",
                current: input?.value,
                callback: (path) => {
                  if (!input) return;
                  input.value = path;
                  /* Nom proposé = nom du fichier, modifiable ensuite. */
                  const lab = row.querySelector(".ic-label");
                  if (lab && !lab.value.trim()) {
                    lab.value = String(path).split("/").pop().replace(/\.[^.]+$/, "");
                  }
                }
              }).render(true);
            });
            row.querySelector(".ic-ico")?.addEventListener("click", async () => {
              const { pickIcon } = await import("../helpers/icon-picker.mjs");
              const val = await pickIcon();
              const input = row.querySelector(".ic-icon");
              if (val && input) input.value = val;
            });
            row.querySelector(".ic-del")?.addEventListener("click", () => row.remove());
          };
          box?.querySelectorAll(".sbe-imgchoice").forEach(wireRow);
          root.querySelector(".sbe-imgchoice-add")?.addEventListener("click", () => {
            if (!box) return;
            const row = document.createElement("div");
            row.className = "sbe-imgchoice";
            row.innerHTML = `
              <input type="text" class="ic-icon" placeholder="${L("SBE.Template.ImgChoiceIcon")}">
              <button type="button" class="ic-ico"><i class="fa-solid fa-icons"></i></button>
              <input type="text" class="ic-label" placeholder="${L("SBE.Template.ImgChoiceName")}">
              <input type="text" class="ic-path" placeholder="${L("SBE.Template.ImgChoicePath")}">
              <button type="button" class="ic-pick"><i class="fa-solid fa-folder-open"></i></button>
              <button type="button" class="ic-del"><i class="fa-solid fa-trash"></i></button>`;
            box.appendChild(row);
            wireRow(row);
          });
        }

        /* Aperçu de l'icône de dé : suit le choix en direct. */
        {
          const iconSel = root.querySelector('[name="roll.icon"]');
          const prev = root.querySelector(".sbe-dice-preview");
          iconSel?.addEventListener("change", () => {
            const cur = DICE_ICONS.find(di => di.v === iconSel.value);
            if (!prev || !cur) return;
            prev.innerHTML = cur.cp === null
              ? foundry.utils.escapeHTML(cur.v)
              : `<i class="${cur.v}"></i>`;
          });
        }

        /* Liste : « reflet » et « envoi au chat » n'existent qu'en
           liste de références. */
        const contMode = root.querySelector('[name="cont.mode"]');
        const syncRefOnly = () => root.querySelectorAll("[data-ref-only]")
          .forEach(d => { d.style.display = contMode?.value === "reference" ? "" : "none"; });
        contMode?.addEventListener("change", syncRefOnly);
        syncRefOnly();

        /* Couleurs des choix : une ligne par choix, refaite quand la
           liste change (les couleurs déjà réglées sont gardées). */
        const selBox = root.querySelector(".sbe-sel-colors");
        const selTa = root.querySelector('[name="sel.choices"]');
        if (selBox && selTa) {
          let mem = {};
          try { mem = JSON.parse(selBox.dataset.colors || "{}"); } catch (_e) { mem = {}; }
          const esc2 = (x) => foundry.utils.escapeHTML(String(x ?? ""));
          const build = () => {
            for (const row of selBox.querySelectorAll(".sbe-selc-row")) {
              if (row.querySelector(".sbe-selc-on")?.checked) mem[row.dataset.choice] = row.querySelector(".sbe-selc-col").value;
              else delete mem[row.dataset.choice];
            }
            const list = selTa.value.split("\n").map(x => x.trim()).filter(Boolean);
            selBox.innerHTML = list.map(ch => `
              <label class="sbe-selc-row" data-choice="${esc2(ch)}">
                <input type="checkbox" class="sbe-selc-on" ${mem[ch] ? "checked" : ""}>
                <input type="color" class="sbe-selc-col" value="${esc2(mem[ch] || "#888888")}">
                <span class="sbe-selc-name"${mem[ch] ? ` style="color:${esc2(mem[ch])}"` : ""}>${esc2(ch)}</span>
              </label>`).join("") || `<span class="notes">${game.i18n.localize("SBE.ItemTip.NoChoices")}</span>`;
          };
          build();
          selTa.addEventListener("input", build);
          selBox.addEventListener("input", (ev) => {
            const row = ev.target.closest(".sbe-selc-row");
            if (!row) return;
            if (ev.target.classList.contains("sbe-selc-col")) row.querySelector(".sbe-selc-on").checked = true;
            const on = row.querySelector(".sbe-selc-on").checked;
            row.querySelector(".sbe-selc-name").style.color = on ? row.querySelector(".sbe-selc-col").value : "";
          });
        }

        /* Fenêtre de jet : le nombre de jets suit la case Avantage. */
        const advChk = root.querySelector('[name="roll.dlg.adv"]');
        const advCnt = root.querySelector('[name="roll.dlg.advCount"]');
        advChk?.addEventListener("change", () => { if (advCnt) advCnt.disabled = !advChk.checked; });
        wireAfterEditor(root);

        /* Seuils critiques : le champ suit le mode choisi. */
        for (const nm of ["critS", "critF"]) {
          const sel = root.querySelector(`[name="roll.${nm}.mode"]`);
          const inp = root.querySelector(`[name="roll.${nm}.expr"]`);
          sel?.addEventListener("change", () => { if (inp) inp.disabled = sel.value === "none"; });
        }

        /* Mode calculé : la formule s'active avec la case. */
        const compChk = root.querySelector('[name="num.computed"]');
        const formulaInput = root.querySelector('[name="num.formula"]');
        const bonusInput = root.querySelector('[name="num.bonusFormula"]');
        const bonusColIn = root.querySelector('[name="num.bonusTone"]');
        compChk?.addEventListener("change", () => {
          if (formulaInput) formulaInput.disabled = !compChk.checked;
          /* « 2 en 1 » et « calculé » s'excluent : la formule de bonus
             n'a de sens que si la valeur reste saisie à la main. */
          if (bonusInput) bonusInput.disabled = !!compChk.checked;
          if (bonusColIn) bonusColIn.disabled = !!compChk.checked;
        });

        /* Sélecteurs de fichiers (image par défaut, image de séparateur). */
        const wirePick = (btnSel, inputName) => {
          root.querySelector(btnSel)?.addEventListener("click", () => {
            const input = root.querySelector(`[name="${inputName}"]`);
            const FilePicker = foundry.applications.apps.FilePicker.implementation;
            new FilePicker({
              type: "image",
              current: input?.value,
              callback: (path) => { if (input) input.value = path; }
            }).render(true);
          });
        };
        wirePick(".sbe-el-imgpick", "img.default");
        wirePick(".sbe-el-seppick", "sep.image");
        wirePick(".sbe-el-gtexpick", "st.gTexture");
        wirePick(".sbe-el-bgtexpick", "st.bgTexture");
        wirePick(".sbe-el-btniconpick", "btn.icon");

        /* Slot : sous-options selon le filtre. */
        /* Colonnes du conteneur : ajout / suppression à la volée. */
        /* Classement : le bloc correspondant au mode choisi. */
        const catMode = root.querySelector('[name="cont.catMode"]');
        const syncCat = () => {
          for (const box of root.querySelectorAll("[data-catmode]")) {
            box.style.display = (box.dataset.catmode === catMode?.value) ? "" : "none";
          }
        };
        catMode?.addEventListener("change", syncCat);
        syncCat();
        /* Affichage : options de la liste OU de la grille. */
        const contDisp = root.querySelector('[name="cont.display"]');
        const syncDisp = () => {
          for (const box of root.querySelectorAll("[data-contdisplay]")) {
            box.style.display = box.dataset.contdisplay.split(" ").includes(contDisp?.value || "list") ? "" : "none";
          }
        };
        contDisp?.addEventListener("change", syncDisp);
        syncDisp();

        /* Listes répétables du conteneur : icônes par valeur, et
           catégories écrites à la main. */
        const repeat = (boxSel, addSel, delSel, html) => {
          const box = root.querySelector(boxSel);
          const wireDel = (row) => row.querySelector(delSel)?.addEventListener("click", () => row.remove());
          for (const row of root.querySelectorAll(`${boxSel} > *`)) wireDel(row);
          root.querySelector(addSel)?.addEventListener("click", () => {
            const row = document.createElement("div");
            row.className = boxSel.slice(1).replace(/s$/, "");
            row.innerHTML = html;
            box?.appendChild(row);
            wireDel(row);
            row.querySelector(".sbe-iconpick")?.addEventListener("click", async () => {
              const { pickIcon } = await import("../helpers/icon-picker.mjs");
              const val = await pickIcon();
              if (!val) return;
              const input = row.querySelector(row.querySelector(".sbe-iconpick").dataset.forel);
              if (input) input.value = val;
            });
          });
        };
        repeat(".sbe-cat-icons", ".sbe-cico-add", ".sbe-cico-del", `
          <input type="text" class="sbe-cico-value" placeholder="${L("SBE.Inv.CatValuePh")}">
          <input type="text" class="sbe-cico-icon" placeholder="${L("SBE.Template.NoneParen")}">
          <button type="button" class="sbe-iconpick" data-forel=".sbe-cico-icon" style="flex:none;width:auto;padding:2px 8px;"><i class="fa-solid fa-icons"></i></button>
          <a class="sbe-cico-del" title="${L("SBE.Common.Delete")}"><i class="fa-solid fa-trash"></i></a>`);
        repeat(".sbe-cat-rows", ".sbe-ccat-add", ".sbe-ccat-del", `
          <input type="text" class="sbe-ccat-label" placeholder="${L("SBE.Inv.CatLabelPh")}">
          <input type="text" class="sbe-ccat-icon" placeholder="${L("SBE.Template.NoneParen")}">
          <button type="button" class="sbe-iconpick" data-forel=".sbe-ccat-icon" style="flex:none;width:auto;padding:2px 8px;"><i class="fa-solid fa-icons"></i></button>
          <select class="sbe-ccat-ftype">
            ${["tag", "key", "keyValue", "template", "all"].map(t =>
              `<option value="${t}">${L("SBE.Inv.CatF_" + t)}</option>`).join("")}
          </select>
          <input type="text" class="sbe-ccat-fval" placeholder="${L("SBE.Inv.CatValuePh")}">
          <label class="sbe-ccat-sublbl" title="${L("SBE.Inv.CatSubHint")}">
            <input type="checkbox" class="sbe-ccat-sub"> ${L("SBE.Inv.CatSub")}
          </label>
          <a class="sbe-ccat-del" title="${L("SBE.Common.Delete")}"><i class="fa-solid fa-trash"></i></a>`);

        const ccolsBox = root.querySelector(".sbe-cont-cols");
        const ccolAdd = root.querySelector(".sbe-ccol-add");
        const wireCcolDel = (row) => {
          row.querySelector(".sbe-ccol-del")?.addEventListener("click", () => row.remove());
        };
        for (const row of root.querySelectorAll(".sbe-cont-col")) wireCcolDel(row);
        ccolAdd?.addEventListener("click", () => {
          const row = document.createElement("div");
          row.className = "sbe-cont-col";
          row.innerHTML = this.#contColRowHTML({});
          ccolsBox?.appendChild(row);
          wireCcolDel(row);
          syncDisp();
        });

        const slotFilter = root.querySelector('[name="slot.filterType"]');
        const syncSlot = () => {
          for (const box of root.querySelectorAll(".sbe-slot-fopts")) {
            box.style.display = (box.dataset.sfilter === slotFilter?.value) ? "" : "none";
          }
        };
        slotFilter?.addEventListener("change", syncSlot);
        syncSlot();

        /* Bouton : options selon l'action. */
        const btnAction = root.querySelector('[name="btn.action"]');
        const syncBtn = () => {
          const consume = root.querySelector(".sbe-btn-consume-opts");
          const menu = root.querySelector(".sbe-btn-menu-opts");
          const steps = root.querySelector(".sbe-btn-steps-opts");
          const a = btnAction?.value ?? "consume";
          if (consume) consume.style.display = a === "consume" ? "" : "none";
          if (menu) menu.style.display = a === "menu" ? "" : "none";
          if (steps) steps.style.display = a === "steps" ? "" : "none";
          const ann = root.querySelector(".sbe-btn-announce");
          if (ann) ann.style.display = a === "menu" ? "none" : "";
        };
        btnAction?.addEventListener("change", syncBtn);
        syncBtn();
        this.#wireSteps(root);
        /* Se lance tout seul : les champs propres aux événements cochés. */
        const autoBox = root.querySelector(".sbe-btn-auto");
        const syncAuto = () => {
          const on = new Set([...autoBox.querySelectorAll(".sbe-auto-on:checked")].map(i => i.value));
          autoBox.querySelector(".sbe-auto-fields").style.display = on.size ? "" : "none";
          const show = (cls, yes) => { const e = autoBox.querySelector(cls); if (e) e.style.display = yes ? "" : "none"; };
          show(".sbe-auto-if-becomes", on.has("becomes"));
          show(".sbe-auto-if-effect", on.has("effectOn") || on.has("effectOff"));
          show(".sbe-auto-if-effcat", on.has("effectOn") || on.has("effectOff"));
          show(".sbe-auto-if-signal", on.has("signal"));
          for (const e of autoBox.querySelectorAll(".sbe-auto-if-drop")) e.style.display = on.has("beforeDrop") ? "" : "none";
          /* « Avant qu'une valeur baisse » ne pose jamais de question. */
          show(".sbe-auto-askbox", [...on].some(e => e !== "beforeDrop"));
        };
        if (autoBox) { autoBox.addEventListener("change", syncAuto); syncAuto(); }

        /* Pré-remplissage de la clé depuis le libellé (création seulement). */
        const labelInput = root.querySelector('[name="label"]');
        const keyInput = root.querySelector('[name="key"]');
        if (isNew && labelInput && keyInput) {
          labelInput.addEventListener("input", () => {
            if (keyInput.dataset.touched) return;
            keyInput.value = labelInput.value.trim().toLowerCase()
              .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
              .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
          });
          keyInput.addEventListener("input", () => { keyInput.dataset.touched = "1"; });
        }

        /* Sélecteur d'icônes : chaque bouton .sbe-iconpick remplit
           le champ désigné par data-for. */
        root.querySelectorAll(".sbe-iconpick").forEach(btn => {
          btn.addEventListener("click", async () => {
            const { pickIcon } = await import("../helpers/icon-picker.mjs");
            const val = await pickIcon();
            if (!val) return;
            /* Cible : soit un champ nommé de la fenêtre, soit un champ
               de LA MÊME LIGNE (listes répétables : catégories…). */
            const input = btn.dataset.forel
              ? btn.closest("div")?.querySelector(btn.dataset.forel)
              : root.querySelector(`[name="${btn.dataset.for}"]`);
            if (input) {
              input.value = val;
              input.dispatchEvent(new Event("change", { bubbles: true }));
            }
          });
        });
      };
      setTimeout(wire, 30);
    });
  }
}
}
