/**
 * SBE — La FICHE VIVANTE — mixin partagé objets / personnages
 *
 * Palier 2 :
 * - onglet DESCRIPTION obligatoire et toujours premier (décision
 *   actée pour les objets) ;
 * - onglet FICHE : la structure du template rendue avec les VALEURS
 *   de cet objet (system.values, indexées par clé) — la structure
 *   vit dans le template, seules les valeurs vivent ici ;
 * - indicateur « template plus récent disponible » (structVersion du
 *   template > templateVersion de l'objet) avec bouton Recharger :
 *   valeurs existantes conservées, clés orphelines purgées, défauts
 *   appliqués aux nouveaux champs (pépite reload).
 */

import { SYSTEM_ID } from "../helpers/constants.mjs";
import { TemplateTheme } from "../managers/theme/template-theme.mjs";
import {
  renderSheet, walkElements, renderTagsBar, tagsInHeader, slotAccepts, nativeUiParts, findById, autosizeFreeZones,
  isRefList, isMirrorList, refIds, PANEL_ZONE, sheetScope
} from "./element-renderer.mjs";
import { computeAll, evalExpression } from "./formula-engine.mjs";
import { wireTalentViews } from "./talents/talent-sheet.mjs";
import { wireLevelButtons } from "./levels/level-sheet.mjs";
import { buildInventory, dropIntoContainer, carrierOf, hostIdOf, canMerge, rotateCarried, worldContents, isWorldItem, isVirtualItem, removeFromWorld, isLockedItem, refuseLocked, sendBack } from "./inventory.mjs";
import { isSpatialEl } from "./spatial.mjs";
import { wireSpatialBoards, anchorUnder, startPieceDrag, beginDragFromUuid } from "./spatial-ui.mjs";
import { spatialItemBoxHTML, wireSpatialItemBox } from "./spatial-item.mjs";
import { WaitingItems } from "../managers/waiting/waiting-items.mjs";
import { contributionsOf } from "./contributions.mjs";
import { docScope } from "./doc-context.mjs";
import { memoOf } from "./data-revision.mjs";
import { scopeFunctionsOf } from "./doc-scope.mjs";
import { EffectManager } from "../managers/effects/effect-manager.mjs";
import { actionsOf, runAction, findAction, openActionMenu, offerAfterDrop } from "./item-actions.mjs";
import { rollField } from "./field-roll.mjs";
import { UiSound, sheetSoundsOf } from "../managers/media/ui-sound.mjs";
import { itemEffectsTabHTML, wireItemEffectsTab } from "../managers/effects/item-effects.mjs";
import { ItemLight } from "../managers/vision/item-light.mjs";
import { ItemScene } from "../managers/props/item-scene.mjs";
import { PropManager } from "../managers/props/prop-manager.mjs";
import { itemZoneTabHTML, wireItemZoneTab, hasZoneMedia, itemZoneMediaHTML, wireItemZoneMedia } from "../managers/zones/item-zone-tab.mjs";
import { ItemChat } from "../managers/itemchat/item-chat.mjs";
import { TradeManager } from "../managers/trade/trade-manager.mjs";
import { GroundItems } from "../managers/ground/ground-items.mjs";
import { openContextMenu } from "../helpers/context-menu.mjs";
import {
  MediaManager, mediaDefsOf, mediaEntryOf, mediaHolder
} from "../managers/media/media-manager.mjs";
import { MediaAnim, ANIM_PLACES } from "../managers/media/media-anim.mjs";
import { ItemIdentity } from "../managers/identity/item-identity.mjs";

/* Portée de chaque objet affiché en fiche (voir #cardsCtx). */
const CARD_SCOPES = new WeakMap();

/**
 * Mixin de la FICHE VIVANTE : rendu de la structure du modèle avec les
 * valeurs (onglets, tables, boutons, slots, formules…), partagé entre
 * les OBJETS (Item) et les PERSONNAGES (Actor).
 */
export function LiveSheetMixin(Base) {
  return class SBELiveSheet extends Base {

  /** Onglet actif, conservé entre deux rendus. */
  _tab = "description";

  /** Onglet actif par barre de navigation de la fiche : { navId: tabId }. */
  _navActive = {};

  /** Tri des tables : { cléTable: { colId, dir } }. */
  _tableSort = {};

  /**
   * Dépôt d'un objet sur la fiche : c'est SBE qui le range (conteneurs,
   * slots, ou premier conteneur qui l'accepte — #wireSheetDrop). Le
   * dépôt natif de Foundry créait EN PLUS une copie brute du modèle,
   * rangée nulle part : invisible dans l'inventaire, mais présente
   * (HUD, poids…). On ne le laisse plus faire pour nos objets.
   */
  async _onDropItem(event, item) {
    if (item?.type === "objet") return null;
    return super._onDropItem?.(event, item) ?? null;
  }

  static DEFAULT_OPTIONS = {
    classes: ["sbe-objet-sheet"],
    position: { width: 560, height: 660 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      gridSort: SBELiveSheet.#onGridSort,
      pickImage: SBELiveSheet.#onPickImage,
      switchTab: SBELiveSheet.#onSwitchTab,
      switchNavTab: SBELiveSheet.#onSwitchNavTab,
      reloadTemplate: SBELiveSheet.#onReloadTemplate,
      pickFieldImage: SBELiveSheet.#onPickFieldImage,
      sortTable: SBELiveSheet.#onSortTable,
      execButton: SBELiveSheet.#onExecButton,
      openButtonMenu: SBELiveSheet.#onOpenButtonMenu,
      openSlot: SBELiveSheet.#onOpenSlot,
      clearSlot: SBELiveSheet.#onClearSlot,
      openCarried: SBELiveSheet.#onOpenCarried,
      cardRun: SBELiveSheet.#onCardRun,
      cardDesc: SBELiveSheet.#onCardDesc,
      openRef: SBELiveSheet.#onOpenRef,
      setPip: SBELiveSheet.#onSetPip,
      removeRef: SBELiveSheet.#onRemoveRef,
      dropCarried: SBELiveSheet.#onDropCarried,
      unequip: SBELiveSheet.#onUnequip,
      pickMedia: SBELiveSheet.#onPickMedia,
      pickMediaAnim: SBELiveSheet.#onPickMediaAnim,
      openMediaModel: SBELiveSheet.#onOpenMediaModel,
      deleteOrphan: SBELiveSheet.#onDeleteOrphan,
      testMedia: SBELiveSheet.#onTestMedia,
      editChartValues: SBELiveSheet.#onEditChartValues,
      rollField: SBELiveSheet.#onRollField,
      pickImgChoice: SBELiveSheet.#onPickImgChoice,
      waitingItems: SBELiveSheet.#onWaitingItems
    }
  };

  static PARTS = {
    body: {
      template: "systems/system-builder-engine/templates/item/objet-sheet.hbs",
      /* Le défilement NE REMONTE PAS en haut à chaque re-rendu
         (validation, modif de stat…) : positions préservées. */
      scrollable: [".sbe-obj-scroll", ".sbe-obj-desc", ".sbe-obj-tabscroll", ".sbe-obj-root", ".window-content"]
    }
  };

  /* ---------------------------------------------------------- */
  /*  Contexte                                                   */
  /* ---------------------------------------------------------- */

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const sys = this.document.system;
    const tpl = sys.template;

    context.item = this.document;
    context.sys = sys;
    context.isActorDoc = this.document.documentName === "Actor";
    if (context.isActorDoc) {
      /* Éléments natifs : stylés selon le modèle ; s'ils ont été posés
         DANS la page (drag & drop de l'atelier), l'en-tête ne les
         affiche plus — ils sont rendus au fil des éléments. */
      const nu = tpl?.system.nativeUi ?? {};
      const img = nativeUiParts("img", nu.img);
      context.nativeImgCss = img.css;
      context.nativeImgCssId = img.cssId;
      context.nativeImgCls = img.cls;
      { const nm = nativeUiParts("name", nu.name); context.nativeNameCss = nm.css; context.nativeNameCssId = nm.cssId; }
      context.nativeNameSub = nu.name?.config?.subLabel ?? "";
      const allEls = [...walkElements(tpl?.system.elements ?? [])];
      context.nativeImgInTree = allEls.some(e => e?.kind === "actorImg");
      context.nativeNameInTree = allEls.some(e => e?.kind === "actorName");
      context.hideActorHeader = context.nativeImgInTree && context.nativeNameInTree;
      /* Personnage = page unique, sans barre d'onglets : tout est rendu
         d'un bloc ; les onglets éventuels sont des éléments Navigation.
         PJ/PNJ est automatique (hasPlayerOwner), sans badge : documenté. */
      this._tab = "sheet";
    }
    context.hasTemplate = !!sys.templateId;
    context.templateFound = !!tpl;
    /* Objet dont le modèle d'atelier a disparu : on peut le supprimer
       d'ici, sans attendre l'examen au chargement du monde. */
    context.canDeleteOrphan = !tpl && !context.isActorDoc && this.document.isOwner;
    context.templateName = tpl?.name ?? "";
    /* SYNCHRO AUTO : le modèle a évolué → la fiche se met à jour toute
       seule (plus de bouton « recharger »). L'update re-déclenche un
       rendu, déjà aligné cette fois. */
    if (tpl && this.document.isOwner
      && (tpl.system.structVersion ?? 0) > (sys.templateVersion ?? 0)) {
      await this.syncTemplate();
    }
    /* ONGLET MÉDIAS : fixe, réservé au MJ, et affiché seulement si le
       modèle réclame au moins un média. Les fichiers vivent sur CET
       objet — un fusil à pompe et un pistolet ne sonnent pas pareil. */
    const mediaDefs = context.isActorDoc ? [] : mediaDefsOf(this.document);
    /* … ou si l'objet laisse une zone persistante (images, vidéos et sons
       de la zone, partie « Zone » de l'onglet). */
    /* … ou s'il s'agit d'un objet du MONDE : sa taille et son image dans
       la grille spatiale se règlent ici (ses exemplaires suivent). */
    const worldObj = !context.isActorDoc && this.document.type === "objet" && !this.document.parent;
    context.hasMedia = game.user.isGM && (mediaDefs.length > 0 || worldObj || (!context.isActorDoc && hasZoneMedia(this.document)));
    if (!context.hasMedia && this._tab === "media") this._tab = "description";
    context.isMedia = context.hasMedia && this._tab === "media";
    context.zoneMediaHTML = context.isMedia ? itemZoneMediaHTML(this.document) : "";
    /* Objet du monde : grille spatiale, et « Cet objet émet de la lumière ». */
    context.spatialMediaHTML = context.isMedia && worldObj ? spatialItemBoxHTML(this.document) + ItemLight.optionsHTML(this.document) : "";
    /* Exemplaire : ses médias SONT ceux de l'objet du monde (réglés là-bas). */
    const mHolder = context.isActorDoc ? null : mediaHolder(this.document);
    context.mediaFromModel = !!mHolder && mHolder !== this.document;
    context.mediaModelName = context.mediaFromModel ? mHolder.name : "";
    if (context.isMedia && !context.mediaFromModel) {
      const grid = canvas.scene?.grid;
      context.sceneUnits = grid?.units || "";
      context.mediaRows = mediaDefs.map(d => {
        const e = mediaEntryOf(this.document, d.id);
        return {
          id: d.id,
          name: String(d.name ?? "").trim() || game.i18n.localize("SBE.Media.Unnamed"),
          hint: String(d.hint ?? "").trim(),
          sound: e.sound,
          volume: e.volume,
          range: e.range ?? "",
          falloff: e.falloff,
          isAll: e.audience === "all",
          isOwner: e.audience === "owner",
          isGm: e.audience === "gm",
          anim: e.anim,
          animSize: e.animSize,
          animDuration: e.animDuration,
          animScreen: e.animScreen,
          animRandom: e.animRandom,
          next: e.next ?? "",
          animIsVideo: MediaAnim.isVideo(e.anim),
          places: ANIM_PLACES.map(p => ({ value: p, label: game.i18n.localize(`SBE.Media.Place.${p}`), selected: p === e.animPlace }))
        };
      });
    }

    /* ONGLET EFFETS : fixe, réservé au MJ — les effets du modèle (en
       lecture) et ceux PROPRES à cet objet (médicaments, drogues…). */
    context.hasEffectsTab = !context.isActorDoc && game.user.isGM && !!tpl;
    if (!context.hasEffectsTab && this._tab === "effects") this._tab = "description";
    context.isEffectsTab = context.hasEffectsTab && this._tab === "effects";
    context.effectsTabHTML = context.isEffectsTab ? await itemEffectsTabHTML(this.document) : "";

    /* ONGLET LUMIÈRE : si l'objet émet de la lumière (case de l'onglet
       Médias de l'objet du monde) — vision, lumière, autonomie. */
    context.hasLightTab = !context.isActorDoc && ItemLight.hasTab(this.document);
    if (!context.hasLightTab && this._tab === "light") this._tab = "description";
    context.isLightTab = context.hasLightTab && this._tab === "light";
    context.lightTabHTML = context.isLightTab ? ItemLight.tabHTML(this.document) : "";
    /* Onglet SCÈNE : réglages d'objet de scène propres à cet objet (MJ). */
    context.hasSceneTab = !context.isActorDoc && ItemScene.hasTab(this.document);
    if (!context.hasSceneTab && this._tab === "scene") this._tab = "description";
    context.isSceneTab = context.hasSceneTab && this._tab === "scene";
    context.sceneTabHTML = context.isSceneTab ? ItemScene.tabHTML(this.document) : "";

    /* ONGLET ZONE : fixe, réservé au MJ — la zone persistante que laisse
       cet objet (feu, fumée, aura…), réglée objet par objet. */
    context.hasZoneTab = context.hasEffectsTab;
    if (!context.hasZoneTab && this._tab === "zone") this._tab = "description";
    context.isZoneTab = context.hasZoneTab && this._tab === "zone";
    context.zoneTabHTML = context.isZoneTab ? await itemZoneTabHTML(this.document) : "";

    context.tab = this._tab;
    context.isDescription = this._tab === "description";

    context.hasFields = (tpl?.system.elements ?? []).length > 0;

    /* INVENTAIRE d'abord : les formules doivent pouvoir le lire
       (carried("poids")…) — aucun système de poids n'est câblé dans le
       moteur, c'est le créateur qui l'invente avec ses propres clés. */
    const inventory = buildInventory(this.document);

    /* Formules : calcul dans l'ordre des dépendances. */
    /* REGISTRE D'APPORTS : effets (et demain équipement, classes…),
       appliqués au calcul — jamais écrits dans les valeurs. */
    const contributions = contributionsOf(this.document);
    const { results, errors, breakdown } = computeAll(tpl?.system.elements ?? [], sys.values ?? {}, { inventory, contributions, functions: scopeFunctionsOf(this.document, contributions) });
    if (errors.length && game.user.isGM) {
      console.warn("SBE | Formules en échec :", errors);
    }

    const roots = tpl?.system.elements ?? [];

    /* Textes riches : enrichissement (liens, @UUID…) comme la Description. */
    const richEnriched = {};
    for (const el of walkElements(roots)) {
      if (el?.kind !== "richtext" || !el.key) continue;
      richEnriched[el.key] = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        String(sys.values?.[el.key] ?? ""),
        { relativeTo: this.document, secrets: this.document.isOwner }
      );
    }

    const renderOpts = {
      values: sys.values ?? {},
      isGM: game.user.isGM,
      navActive: this._navActive,
      computedResults: results,
      /* Détail nommé des apports, clé par clé (survol). */
      breakdown,
      /* Effets posés (élément « Effets actifs »). */
      activeEffects: this.document.documentName === "Actor" ? EffectManager.listOf(this.document) : [],
      tableSort: this._tableSort,
      richEnriched,
      /* Éléments natifs (portrait/icône + nom) : liés au document. */
      docImg: this.document.img,
      docName: this.document.name,
      nativeUi: tpl?.system.nativeUi ?? {},
      /* Arbre complet du modèle : bornes des clés pour les graphiques. */
      elements: tpl?.system.elements ?? [],
      /* Rendu VIVANT (par opposition à l'atelier) : autorise les
         actions cliquables posées dans les graphiques. */
      live: true,
      /* INVENTAIRE : les objets portés, rangés par clé de contenant.
         Les conteneurs et les slots N'ONT PAS de contenu à eux — ils
         lisent ici, et le portage de chaque objet fait foi. */
      inventory,
      /* Conteneurs en FICHES : la portée et les boutons de chaque objet. */
      cards: this.#cardsCtx(),
      /* Rangement des grilles, choisi par le joueur (clé → az/za/manual). */
      gridSorts: this.document.flags?.[SYSTEM_ID]?.gridSort ?? {},
      /* Le document affiché : listes inverses (outils d'une recette) et
         « seulement ce que le joueur possède ». */
      hostDoc: this.document,
      hostId: String(this.document.system?.modelId || this.document.id || ""),
      /* Taille maximale d'une pile de CE modèle (0 = illimitée) :
         plafonne le champ Quantité comme le rangement. */
      stackMaxValue: Number(tpl?.system.opts?.stackMax ?? 0) || 0
    };
    /* « Visible si » d'un onglet : lu sur le document, comme celui des composants. */
    let tabScope = null;
    const tabShown = (t) => {
      const f = String(t.visibleIf ?? "").trim();
      if (!f) return true;
      tabScope ??= sheetScope(renderOpts);
      const r = evalExpression(f, tabScope);
      return r !== null && r !== undefined && !!r;
    };
    const extraTabDefs = (tpl?.system.extraTabs ?? [])
      .filter(t => (game.user.isGM || t.playerVisible !== false) && tabShown(t));
    const extraIds = new Set((tpl?.system.extraTabs ?? []).map(t => t.id));

    /* Défilement PAR DÉFAUT : les éléments racine « épinglés en haut »
       (option du cadre) restent fixes, le reste vit dans une zone qui
       défile toute seule quand la fiche est trop longue. */
    /* PLUS D'ONGLET « FICHE » sur les objets : tout ce qui n'appartient
       pas à un onglet personnalisé se lit à la suite de la Description.
       Le MJ décide : tout d'un bloc, ou réparti dans ses propres
       onglets. La zone historique « desc » rejoint la zone principale —
       les deux s'affichent au même endroit, dans l'ordre du modèle. */
    /* La zone du panneau (objet posé) ne s'affiche jamais sur la fiche. */
    const mainZone = roots.filter(e => !extraIds.has(e?.zone) && e?.zone !== PANEL_ZONE);
    const pinnedRoots = mainZone.filter(e => e?.config?.pinned);
    const flowRoots = mainZone.filter(e => !e?.config?.pinned);
    context.sheetHTML = renderSheet(pinnedRoots, renderOpts)
      + `<div class="sbe-obj-scroll">${renderSheet(flowRoots, renderOpts)}</div>`;
    /* Objets : la même zone, rendue sous le texte de description. */
    context.descSheetHTML = context.isActorDoc ? "" : context.sheetHTML;

    /* Onglets personnalisés du modèle. */
    context.extraTabs = extraTabDefs.map(t => ({
      id: t.id,
      label: (t.name ?? "").trim() || game.i18n.localize("SBE.Template.NewTabName"),
      hidden: t.playerVisible === false,
      active: this._tab === t.id
    }));
    const activeExtra = extraTabDefs.find(t => t.id === this._tab);
    context.isExtra = !!activeExtra;
    context.extraSheetHTML = activeExtra
      ? `<div class="sbe-obj-scroll">${renderSheet(roots.filter(e => e?.zone === activeExtra.id), renderOpts)}</div>`
      : "";

    /* Onglet disparu (supprimé du modèle) : repli sur Description (objets). */
    if (!context.isActorDoc && !context.isExtra && !context.isDescription && !context.isMedia && !context.isEffectsTab && !context.isZoneTab && !context.isLightTab && !context.isSceneTab) {
      this._tab = "description";
      context.tab = "description";
      context.isDescription = true;
    }

    /* Étiquettes : hissées en badges au-dessus de la fiche. */
    context.tagsHTML = renderTagsBar(roots, sys.values ?? {}, game.user.isGM);
    /* … ou DANS l'en-tête, au-dessus du nom (option de l'élément), si
       l'en-tête natif et son nom sont bien là. */
    context.tagsInHeader = !!context.tagsHTML && tagsInHeader(roots)
      && !context.hideActorHeader && !context.nativeNameInTree;

    context.descriptionHTML = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      sys.description ?? "", { relativeTo: this.document, secrets: this.document.isOwner }
    );
    /* Objet INCONNU pour ce joueur : seulement son nom, son image et sa
       description inconnue — ni champs, ni étiquettes, ni onglets, qui
       vendraient la mèche. */
    if (!context.isActorDoc && !game.user.isGM && ItemIdentity.isUnidentified(this.document)) {
      Object.assign(context, {
        isDescription: true, isExtra: false, isMedia: false, isEffectsTab: false, isZoneTab: false, isLightTab: false, isSceneTab: false,
        hasMedia: false, hasEffectsTab: false, hasZoneTab: false, hasLightTab: false, hasSceneTab: false,
        extraTabs: [], descSheetHTML: "", extraSheetHTML: "", tagsHTML: "", tagsInHeader: false, tab: "description"
      });
      this._tab = "description";
    }
    return context;
  }

  /* ---------------------------------------------------------- */
  /*  Actions                                                    */
  /* ---------------------------------------------------------- */

  static #onPickImage() {
    const FilePicker = foundry.applications.apps.FilePicker.implementation;
    new FilePicker({
      type: "image",
      current: this.document.img,
      callback: (path) => this.document.update({ img: path })
    }).render(true);
  }

  static #onSwitchTab(_event, target) {
    /* Personnage : page unique, pas d'onglets de fiche. */
    if (this.document.documentName === "Actor") return;
    this._tab = target.dataset.tab ?? "description";
    this.render();
  }

  static #onSwitchNavTab(_event, target) {
    const nav = target.dataset.nav;
    const tab = target.dataset.tab;
    if (!nav || !tab) return;
    UiSound.onTabClick(this, target, findById(this.document.system.template?.system?.elements ?? [], tab));
    this._navActive[nav] = tab;
    this.render();
  }

  /* === Tables === */

  static #onSortTable(_event, target) {
    const key = target.dataset.table;
    const colId = target.dataset.colId;
    if (!key || !colId) return;
    const cur = this._tableSort[key];
    this._tableSort[key] = (cur?.colId === colId && cur.dir === "asc")
      ? { colId, dir: "desc" }
      : (cur?.colId === colId && cur.dir === "desc" ? null : { colId, dir: "asc" });
    if (!this._tableSort[key]) delete this._tableSort[key];
    this.render();
  }

  /* === Boutons d'action === */

  /* === BOUTONS : l'exécuteur unique vit dans item-actions.mjs === */

  static #onExecButton(_event, target) {
    runAction(this.document, target.dataset.btnId);
  }

  static #onOpenButtonMenu(_event, target) {
    const el = findAction(this.document, target.dataset.btnId);
    if (el) openActionMenu(this.document, el);
  }

  /* Saisie des cellules de table (colonnes libres). */
  #wireTableInputs() {
    for (const input of this.element.querySelectorAll(".sbe-tbl-input")) {
      input.addEventListener("change", async (ev) => {
        const { table, row, colkey } = ev.target.dataset;
        if (!table || !row || !colkey) return;
        const tpl = this.document.system.template;
        const el = tpl ? [...walkElements(tpl.system.elements ?? [])].find(e => e.key === table) : null;
        const col = el?.config?.columns?.find(cc => cc.key === colkey);
        let v;
        if (col?.type === "checkbox") v = !!ev.target.checked;
        else if (col?.type === "number") v = Number(ev.target.value ?? 0) || 0;
        else v = ev.target.value ?? "";

        const tv = foundry.utils.deepClone(this.document.system.values?.[table] ?? {});
        tv.cells ??= {};
        tv.cells[row] ??= {};
        tv.cells[row][colkey] = v;
        await this.document.update({ [`system.values.${table}`]: tv });
      });
    }
  }

  /* Champs nombre « 2 en 1 » : le champ AFFICHE le total (base +
     formule) mais on SAISIT la base. Pas d'attribut name côté HTML :
     l'enregistrement est fait ici, jamais par la soumission du
     formulaire — sinon le total écraserait la base. */
  #wireNum2Inputs() {
    for (const input of this.element.querySelectorAll("input.sbe-num2")) {
      if (input.disabled) continue;
      input.addEventListener("focus", () => {
        input.dataset.total = input.value;
        input.value = input.dataset.base ?? "0";
        input.select();
      });
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") { ev.preventDefault(); input.blur(); }
        if (ev.key === "Escape") { input.value = input.dataset.base ?? "0"; input.blur(); }
      });
      input.addEventListener("blur", async () => {
        const key = input.dataset.key;
        const base = Number(input.dataset.base ?? 0) || 0;
        const raw = String(input.value ?? "").trim();
        const nv = raw === "" ? 0 : Number(raw);
        if (!key || !Number.isFinite(nv) || nv === base) {
          /* Rien à écrire : on remet l'affichage du total. */
          input.value = input.dataset.total ?? String(base);
          return;
        }
        await this.document.update({ [`system.values.${key}`]: nv });
      });
    }
  }

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

  /* Sons de la fiche (thème du modèle) : seulement à la VRAIE
     ouverture et à la vraie fermeture — jamais aux re-rendus. Seul
     celui qui ouvre / ferme les entend. */
  /* Ce que l'on TAPE dans la fiche est une saisie directe : la case
     prend exactement la valeur (pas d'absorption par les points
     temporaires, pas de cumul). Les jets, étapes, effets et macros,
     eux, passent par l'écriture « de jeu ». */
  async _processSubmitData(event, form, submitData, options = {}) {
    return super._processSubmitData(event, form, submitData, { ...options, sbeDirect: true });
  }

  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    UiSound.play(sheetSoundsOf(this.document.system.template).open);
  }

  _onClose(options) {
    super._onClose(options);
    UiSound.stop(`tab-${this.id}`);
    UiSound.play(sheetSoundsOf(this.document.system.template).close);
  }

  _onRender(context, options) {
    super._onRender(context, options);
    /* « Masquer le titre » du modèle (thème du modèle / ⋮ de l'atelier). */
    TemplateTheme.applyTitle(this, this.document.system?.template);
    wireItemEffectsTab(this);
    ItemLight.wireOptions(this);
    ItemLight.wireTab(this);
    ItemScene.wireTab(this);
    wireItemZoneTab(this);
    wireItemZoneMedia(this);
    wireSpatialItemBox(this);
    /* Élément « Effets actifs » : la croix retire l'effet (MJ, propriétaire). */
    for (const a of this.element?.querySelectorAll(".sbe-fxlist-del") ?? []) {
      a.addEventListener("click", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const ae = this.document?.effects?.get?.(a.dataset.fxId);
        if (ae && (game.user.isGM || this.document.isOwner)) await ae.delete();
      });
    }
    this._restoreFrameFolds(this.element);
    this.#wireTableInputs();
    this.#wireSlotDrops();
    this.#wireCarriedDrag();
    this.#wireCarriedMenu();
    this.#wireMediaRows();
    this.#wireSheetDrop();
    this.#wireNum2Inputs();
    /* Cadres en placement libre : hauteur ajustée au contenu réel. */
    autosizeFreeZones(this.element);
    this.#wireGrids();
    wireSpatialBoards(this.element);
    this.#wireOpenEditors();
    /* Composant Arbre : clic sur un nœud, bouton de la fenêtre. */
    wireTalentViews(this.element, this.document);
    /* Composant Niveau : « Passer au niveau ». */
    wireLevelButtons(this.element, this.document);
  }

  /** Le joueur change le rangement d'une grille (A→Z, Z→A, manuel). */
  static async #onGridSort(_event, target) {
    const key = target.dataset.key, sort = target.dataset.sort;
    if (!key || !["az", "za", "manual"].includes(sort) || !this.document.isOwner) return;
    await this.document.setFlag(SYSTEM_ID, `gridSort.${key}`, sort);
  }

  /* Texte riche « toujours ouvert » : Foundry n'enregistre qu'au bouton
     disquette (ou Ctrl+S). Ici, quitter l'éditeur enregistre aussi —
     rien ne se perd en cliquant ailleurs ou en fermant la fiche. */
  #wireOpenEditors() {
    for (const pm of this.element?.querySelectorAll(".sbe-rich--open prose-mirror") ?? []) {
      if (pm.dataset.sbeAutosave) continue;
      pm.dataset.sbeAutosave = "1";
      pm.addEventListener("focusout", (ev) => {
        if (ev.relatedTarget && pm.contains(ev.relatedTarget)) return;
        /* Menu déroulant de la barre d'outils (hors de l'éditeur) : on attend. */
        setTimeout(() => {
          if (pm.isConnected && !pm.contains(document.activeElement)
            && !document.activeElement?.closest?.("#prosemirror-dropdown, .menu-dialog")) {
            try { pm.save(); } catch (_e) { /* éditeur déjà fermé */ }
          }
        }, 150);
      });
    }
  }

  /**
   * GRILLES : double-clic = ouvrir l'objet ; en colonnes « auto », la
   * dernière rangée est complétée de cases vides selon la largeur
   * réelle (et suivie au redimensionnement de la fiche).
   */
  #wireGrids() {
    for (const node of this.element.querySelectorAll(".sbe-grid-item[data-item-id], .sbe-slot--icon[data-item-id], .sbe-icard[data-item-id]")) {
      node.addEventListener("dblclick", (ev) => {
        /* Un double clic sur un bouton (une fiche de compétence…) reste
           un clic de bouton. */
        if (ev.target.closest("button, a")) return;
        const it = this.#carriedById(node.dataset.itemId);
        /* Le contenu d'un objet du monde n'a pas de fiche enregistrable. */
        if (it && !isVirtualItem(it)) it.sheet?.render(true);
      });
    }
    const autos = [...this.element.querySelectorAll(".sbe-grid--auto")];
    this._gridObs?.disconnect();
    if (!autos.length) return;
    const pad = (g) => {
      for (const n of g.querySelectorAll(".sbe-grid-pad")) n.remove();
      const cols = getComputedStyle(g).gridTemplateColumns.split(" ").filter(Boolean).length || 1;
      const n = g.children.length;
      const want = Math.ceil(n / cols) * cols;
      const base = n;
      for (let i = n; i < want; i++) {
        const c = document.createElement("div");
        c.className = "sbe-grid-cell is-empty sbe-grid-pad";
        c.dataset.cell = String(base + (i - n));
        g.appendChild(c);
      }
    };
    autos.forEach(pad);
    this._gridObs = new ResizeObserver((list) => list.forEach(r => pad(r.target)));
    autos.forEach(g => this._gridObs.observe(g));
  }

  /* === Slots === */

  /** L'élément CONTENANT (slot ou conteneur) portant cette clé. */
  #slotElByKey(key) {
    const tpl = this.document.system.template;
    if (!tpl) return null;
    return [...walkElements(tpl.system.elements ?? [])]
      .find(e => (e?.kind === "slot" || e?.kind === "container") && e.key === key) ?? null;
  }

  #wireSlotDrops() {
    for (const box of this.element.querySelectorAll(".sbe-slot-drop")) {
      box.addEventListener("dragover", (ev) => ev.preventDefault());
      box.addEventListener("drop", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        let data = null;
        try {
          data = foundry.applications.ux.TextEditor.implementation.getDragEventData(ev);
        } catch (_e) { /* données illisibles */ }
        if (data?.type !== "Item" || !data.uuid) return;
        const item = await PropManager.itemFromDrop(data);
        if (!item) return;
        const key = box.dataset.key;
        const el = this.#slotElByKey(key);
        if (!el) return;
        if (item.uuid === this.document.uuid) return; /* pas soi-même */

        /* LISTE DE RÉFÉRENCES : on y désigne un objet du MONDE. Un
           exemplaire porté est ramené à son modèle — on liste « la 9 mm
           perforante », pas la boîte de Jack. */
        if (isRefList(el)) {
          if (isMirrorList(el)) return;   /* reflet : lecture seule */
          if (!game.user.isGM && el.playerEditable === false) return;
          const src = item.parent ? game.items.get(item.system?.modelId ?? "") : item;
          if (!src || src.type !== "objet" || src.parent) {
            ui.notifications.warn(game.i18n.localize("SBE.Inv.RefNeedWorld"));
            return;
          }
          const refuse = slotAccepts(el, src, this.document);
          if (refuse) { ui.notifications.warn(game.i18n.localize(refuse)); return; }
          const ids = refIds(this.document.system.values, key);
          if (ids.includes(src.id)) return;
          await this.document.update({ [`system.values.${key}`]: [...ids, src.id] });
          return;
        }

        /* SLOT EN MODE RÉFÉRENCE : rien n'est porté, la clé pointe un
           MODÈLE par uuid — comportement d'origine, inchangé. */
        if (el.kind === "slot" && el.config?.mode === "reference") {
          const refuse = slotAccepts(el, item, this.document);
          if (refuse) { ui.notifications.warn(game.i18n.localize(refuse)); return; }
          await this.document.update({
            [`system.values.${key}`]: { uuid: item.uuid, name: item.name, img: item.img }
          });
          return;
        }

        /* CONTENANT D'INVENTAIRE : l'objet devient (ou reste) un objet
           PORTÉ, et son portage désigne cette clé. Un slot est un
           conteneur d'une seule case. */
        if (el.kind === "slot" && await this.#slotBusy(el, item)) return;
        /* GRILLE : la case visée, celle d'où part l'objet, et les cases
           affichées (pour qu'un tri manuel ne bouge que l'objet tiré). */
        const cellEl = ev.target?.closest?.("[data-cell]");
        const grid = cellEl?.closest(".sbe-grid");
        const cellNo = cellEl ? Number(cellEl.dataset.cell) : -1;
        const src = grid?.querySelector(`.sbe-grid-item[data-item-id="${CSS.escape(item.id)}"]`);
        const layout = grid ? [...grid.querySelectorAll(".sbe-grid-item[data-item-id]")]
          .map(n => ({ id: n.dataset.itemId, cell: Number(n.dataset.cell) })) : null;
        /* GRILLE SPATIALE : le coin haut gauche visé (case sous le
           pointeur, moins l'endroit où l'objet est tenu). */
        const board = isSpatialEl(el) ? ev.target?.closest?.(".sbe-sp") : null;
        const at = board ? anchorUnder(board, ev) : null;
        /* Venu d'un sol ou d'un coffre : le MJ le déplace (avec son contenu). */
        if (PropManager.isPlacedItem(item) && !isWorldItem(this.document)) {
          await PropManager.moveOut({ item, sheetDoc: this.document, key: el.key, at, cell: cellNo });
          return;
        }
        const done = await dropIntoContainer({ sheetDoc: this.document, el, item, sort: grid?.dataset.sort || "az",
          cell: cellNo, fromCell: src ? Number(src.dataset.cell) : -1, layout, at });
        /* Réglage du slot : proposer un bouton de l'objet déposé. */
        if (done && el.kind === "slot") await offerAfterDrop(this.document, el);
      });
    }
  }

  /**
   * Un slot déjà occupé REFUSE par défaut (décision actée). Le créateur
   * peut cocher « demander le remplacement » : la question est alors
   * posée, et l'objet sortant reprend la place du nouveau.
   */
  async #slotBusy(el, item) {
    const held = (buildInventory(this.document).byKey?.[el.key] ?? [])[0];
    if (!held || held.id === item.id) return false;
    /* Même munition que celle déjà chargée : ce n'est pas un conflit,
       c'est un complément — la pile s'additionne (dans la limite de
       la capacité du slot). */
    const heldDoc = this.#carriedById(held.id);
    if (heldDoc && canMerge(heldDoc, item)) return false;
    if (!el.config?.askReplace) {
      ui.notifications.warn(game.i18n.format("SBE.Inv.SlotBusy", { name: held.name }));
      return true;
    }
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("SBE.Inv.ReplaceTitle") },
      content: `<p>${game.i18n.format("SBE.Inv.ReplaceConfirm", {
        old: foundry.utils.escapeHTML(held.name),
        neu: foundry.utils.escapeHTML(item.name)
      })}</p>`,
      rejectClose: false
    }).catch(() => false);
    if (!ok) return true;
    /* L'objet sortant retourne d'où il venait (même règle que
       « Déséquiper ») ; le contenu d'un objet du monde, lui, sort. */
    if (isVirtualItem(heldDoc)) await removeFromWorld(this.document, held.id);
    else if (heldDoc) await this.#stowAway(heldDoc);
    return false;
  }

  /** Sort un objet de son slot : retour à son origine (zone d'attente si
      elle est pleine), sinon il reste porté sans rangement. */
  async #stowAway(item) {
    const ok = await sendBack(this.document, item, { overflow: true });
    if (ok === "overflow") WaitingItems.open(carrierOf(this.document));
    if (ok) return;
    await item.update({
      "system.carry.host": hostIdOf(this.document), "system.carry.where": "",
      "system.carry.fromHost": "", "system.carry.fromWhere": ""
    });
  }

  /** « Organiser » : la fenêtre des objets en attente d'une place. */
  static #onWaitingItems() {
    const actor = carrierOf(this.document);
    if (actor) WaitingItems.open(actor);
  }

  /** Miroir v1 : ouvre la fiche de l'objet logé pour l'éditer. */
  static async #onOpenSlot(_event, target) {
    const key = target.dataset.key;
    const v = this.document.system.values?.[key];
    if (!v?.uuid) return;
    const item = await fromUuid(v.uuid).catch(() => null);
    if (!item) {
      ui.notifications.warn(game.i18n.localize("SBE.Slot.Missing"));
      return;
    }
    item.sheet?.render(true);
  }

  static async #onClearSlot(_event, target) {
    const key = target.dataset.key;
    if (!key) return;
    await this.document.update({ [`system.values.${key}`]: null });
  }

  /** Supprime un objet orphelin (modèle d'atelier disparu). */
  static async #onDeleteOrphan() {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("SBE.Orphan.Title") },
      content: `<p>${game.i18n.format("SBE.Orphan.DeleteThisConfirm", {
        name: foundry.utils.escapeHTML(this.document.name)
      })}</p>`,
      rejectClose: false
    }).catch(() => false);
    if (!ok) return;
    const doc = this.document;
    await this.close();
    await doc.delete();
  }

  /* === MÉDIAS (onglet réservé au MJ) === */

  /** Écrit une valeur de la ligne de média de CET objet. */
  async #setMedia(defId, patch) {
    if (!defId) return;
    const cur = foundry.utils.deepClone(this.document.system.media ?? {});
    cur[defId] = { ...(cur[defId] ?? {}), ...patch };
    await this.document.update({ "system.media": cur });
  }

  /** Sélecteur de fichier audio. */
  static async #onPickMedia(_event, target) {
    const defId = target.dataset.defId;
    const cur = mediaEntryOf(this.document, defId);
    const fp = new foundry.applications.apps.FilePicker.implementation({
      type: "audio",
      current: cur.sound || "",
      callback: async (path) => { await this.#setMedia(defId, { sound: path }); }
    });
    fp.render(true);
  }

  /** Ouvre l'objet du monde qui porte les médias de cet exemplaire. */
  static #onOpenMediaModel() {
    mediaHolder(this.document)?.sheet?.render(true);
  }

  /** Sélecteur d'image ou de vidéo (animation). */
  static async #onPickMediaAnim(_event, target) {
    const defId = target.dataset.defId;
    const cur = mediaEntryOf(this.document, defId);
    const fp = new foundry.applications.apps.FilePicker.implementation({
      type: "imagevideo",
      current: cur.anim || "",
      callback: async (path) => { await this.#setMedia(defId, { anim: path }); }
    });
    fp.render(true);
  }

  /** Écoute d'essai : pour celui qui règle, sans portée ni public. */
  static async #onTestMedia(_event, target) {
    await MediaManager.test(this.document, target.dataset.defId);
  }

  /**
   * Saisie de l'onglet Médias. Ces champs n'ont pas d'attribut
   * « name » : ils vivent dans un objet libre indexé par nom déclaré,
   * que la soumission du formulaire ne saurait pas reconstruire.
   */
  #wireMediaRows() {
    for (const row of this.element.querySelectorAll(".sbe-media-row")) {
      const defId = row.dataset.defId;
      const sound = row.querySelector(".sbe-media-sound");
      const vol = row.querySelector(".sbe-media-volume");
      const out = row.querySelector(".sbe-media-volout");
      const aud = row.querySelector(".sbe-media-audience");
      const range = row.querySelector(".sbe-media-rangeval");
      const fall = row.querySelector(".sbe-media-falloffchk");

      sound?.addEventListener("change", () => this.#setMedia(defId, { sound: sound.value.trim() }));
      /* Le curseur affiche sa valeur en direct, mais n'écrit qu'au
         relâchement : sinon chaque pixel de glissement sauvegarderait. */
      vol?.addEventListener("input", () => { if (out) out.value = `${vol.value}%`; });
      vol?.addEventListener("change", () => this.#setMedia(defId, { volume: Number(vol.value) }));
      aud?.addEventListener("change", () => this.#setMedia(defId, { audience: aud.value }));
      range?.addEventListener("change", () => {
        const n = Number(range.value);
        const val = Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
        /* Sans portée, l'atténuation n'a pas de distance de référence :
           on la décoche en même temps qu'on grise sa case. */
        this.#setMedia(defId, val === null ? { range: null, falloff: false } : { range: val });
      });
      fall?.addEventListener("change", () => this.#setMedia(defId, { falloff: fall.checked }));
      /* Animation. */
      const q = (c) => row.querySelector(c);
      q(".sbe-media-anim")?.addEventListener("change", (ev) => this.#setMedia(defId, { anim: ev.target.value.trim() }));
      q(".sbe-media-animplace")?.addEventListener("change", (ev) => this.#setMedia(defId, { animPlace: ev.target.value }));
      q(".sbe-media-animsize")?.addEventListener("change", (ev) => {
        const n = Number(ev.target.value);
        this.#setMedia(defId, { animSize: n > 0 ? n : 1 });
      });
      q(".sbe-media-animdur")?.addEventListener("change", (ev) => {
        const n = Number(ev.target.value);
        this.#setMedia(defId, { animDuration: n > 0 ? n : 1.5 });
      });
      q(".sbe-media-animscreen")?.addEventListener("change", (ev) => this.#setMedia(defId, { animScreen: ev.target.checked }));
      q(".sbe-media-animrandom")?.addEventListener("change", (ev) => this.#setMedia(defId, { animRandom: ev.target.checked }));
      q(".sbe-media-next")?.addEventListener("change", (ev) => {
        const raw = ev.target.value.trim();
        const n = Number(raw);
        this.#setMedia(defId, { next: raw !== "" && Number.isFinite(n) && n >= 0 ? Math.round(n) : null });
      });
    }
  }

  /* === Objets PORTÉS (conteneurs et slots en mode instance) === */

  /** Ce qu'un conteneur en « fiches » lit sur chaque objet porté (mis en cache le temps d'un rendu). */
  #cardsCtx() {
    const scopes = new Map();
    const scopeOf = (id) => {
      if (!scopes.has(id)) {
        const it = this.#carriedById(id);
        let sc = null;
        /* Gardée tant que rien ne change : une compétence à gros
           modèle ne se recalcule pas à chaque changement d'onglet. */
        try { sc = it ? memoOf(CARD_SCOPES, it, () => docScope(it)) : null; } catch (_e) { sc = null; }
        scopes.set(id, sc);
      }
      return scopes.get(id);
    };
    return {
      isGM: game.user.isGM,
      open: this._cardOpen ?? new Set(),
      itemScope: (id) => scopeOf(id),
      maxOf: (id, key) => { const sc = scopeOf(id); return typeof sc?.maxOf === "function" ? sc.maxOf(key) : null; },
      shown: (id, key) => {
        const it = this.#carriedById(id);
        const el = it ? [...walkElements(it.system?.template?.system?.elements ?? [])].find(x => x?.key === key) : null;
        const f = String(el?.visibleIf ?? "").trim();
        if (!f) return true;
        const r = evalExpression(f, scopeOf(id) ?? {});
        return r !== null && r !== undefined && !!r;
      },
      actionsOf: (id) => {
        const it = this.#carriedById(id);
        return it && !isVirtualItem(it) ? actionsOf(it) : [];
      },
      /* Texte de description de l'objet : le dépliant par défaut. */
      descOf: (id) => String(this.#carriedById(id)?.system?.description ?? "")
    };
  }

  /** L'objet porté visé par un bouton de ligne. */
  #carriedById(id) {
    const carrier = carrierOf(this.document);
    if (carrier) return carrier.items?.get(id) ?? null;
    /* Objet du monde : le contenu qu'il garde. */
    return worldContents(this.document).find(i => i.id === id) ?? null;
  }

  /** Jauge en pictos : un clic fixe la valeur. */
  static async #onSetPip(_event, target) {
    const key = target.dataset.key;
    const value = Number(target.dataset.value);
    if (!key || !Number.isFinite(value) || !this.document.isOwner) return;
    /* Clic sur un picto = saisie directe (aucun point temporaire absorbé). */
    await this.document.update({ [`system.values.${key}`]: value }, { sbeDirect: true });
  }

  /** Ouvre l'objet du monde désigné par une liste de références. */
  static async #onOpenRef(_event, target) {
    const it = await fromUuid(target.dataset.uuid ?? "").catch(() => null);
    if (!it) { ui.notifications.warn(game.i18n.localize("SBE.Slot.Missing")); return; }
    it.sheet?.render(true);
  }

  /** Retire une référence de la liste (l'objet du monde n'est pas touché). */
  static async #onRemoveRef(_event, target) {
    const key = target.dataset.key;
    const id = target.dataset.refId;
    if (!key || !id || !this.document.isOwner) return;
    if (!game.user.isGM && this.#slotElByKey(key)?.playerEditable === false) return;
    const ids = refIds(this.document.system.values, key).filter(x => x !== id);
    await this.document.update({ [`system.values.${key}`]: ids });
  }

  /** Fiche d'objet (conteneur en « fiches ») : un bouton de l'objet. */
  static async #onCardRun(_event, target) {
    const it = this.#carriedById(target.dataset.itemId);
    if (it && !isVirtualItem(it)) await runAction(it, target.dataset.btnId);
  }

  /** Fiche d'objet : déplier / replier son texte (gardé tant que la fiche reste ouverte). */
  static #onCardDesc(_event, target) {
    const id = target.dataset.itemId;
    this._cardOpen ??= new Set();
    if (this._cardOpen.has(id)) this._cardOpen.delete(id); else this._cardOpen.add(id);
    const card = target.closest(".sbe-icard");
    card?.querySelector(".sbe-icard-desc")?.toggleAttribute("hidden", !this._cardOpen.has(id));
    target.classList.toggle("is-open", this._cardOpen.has(id));
  }

  /** Ouvre la fiche de l'objet porté. */
  static async #onOpenCarried(_event, target) {
    const it = this.#carriedById(target.dataset.itemId);
    if (!it || isVirtualItem(it)) return;
    it.sheet?.render(true);
  }

  /** Retire définitivement l'objet de la fiche (confirmation). */
  static async #onDropCarried(_event, target) {
    const it = this.#carriedById(target.dataset.itemId);
    if (!it || refuseLocked(it)) return;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("SBE.Inv.RemoveTitle") },
      content: `<p>${game.i18n.format("SBE.Inv.RemoveConfirm", {
        name: foundry.utils.escapeHTML(it.name)
      })}</p>`,
      rejectClose: false
    }).catch(() => false);
    if (!ok) return;
    if (isVirtualItem(it)) await removeFromWorld(this.document, it.id);
    else await it.delete();
  }

  /**
   * DÉSÉQUIPER : l'objet retourne d'où il venait (le contenant qu'il a
   * quitté pour ce slot), sinon dans le premier CONTENEUR de la fiche
   * qui l'accepte ; plein, il y attend dans la zone d'attente. Aucun
   * conteneur → il reste porté, sans rangement (il réapparaîtra dès
   * qu'un conteneur existera) — jamais de suppression silencieuse.
   */
  static async #onUnequip(_event, target) {
    const it = this.#carriedById(target.dataset.itemId);
    if (!it) return;
    const ok = await sendBack(this.document, it, { overflow: true });
    if (ok === "overflow") WaitingItems.open(carrierOf(this.document));
    if (ok) return;
    await it.update({ "system.carry.host": hostIdOf(this.document), "system.carry.where": "",
      "system.carry.fromHost": "", "system.carry.fromWhere": "" });
    ui.notifications.info(game.i18n.localize("SBE.Inv.NoContainer"));
  }

  /**
   * DÉPÔT SUR LA FICHE (hors d'un contenant) : l'objet rejoint le
   * premier CONTENEUR qui l'accepte. Sans conteneur, rien n'est créé —
   * une fiche sans inventaire ne doit pas se remplir en douce.
   */
  #wireSheetDrop() {
    const root = this.element;
    if (!root || !carrierOf(this.document)) return;
    /* La racine SURVIT aux re-rendus : on ne l'écoute qu'une fois,
       sinon chaque rendu empilerait un écouteur de plus. */
    if (this._sheetDropWired) return;
    this._sheetDropWired = true;
    root.addEventListener("dragover", (ev) => ev.preventDefault());
    root.addEventListener("drop", async (ev) => {
      if (ev.defaultPrevented) return;   /* déjà pris par un contenant */
      ev.preventDefault();
      let data = null;
      try {
        data = foundry.applications.ux.TextEditor.implementation.getDragEventData(ev);
      } catch (_e) { /* données illisibles */ }
      if (data?.type !== "Item" || !data.uuid) return;
      const item = await PropManager.itemFromDrop(data);
      if (!item || item.type !== "objet") return;
      const tpl = this.document.system.template;
      for (const el of walkElements(tpl?.system.elements ?? [])) {
        if (el?.kind !== "container" || !el.key || isRefList(el)) continue;
        if (slotAccepts(el, item, this.document)) continue;
        if (PropManager.isPlacedItem(item)) {
          await PropManager.moveOut({ item, sheetDoc: this.document, key: el.key });
          return;
        }
        await dropIntoContainer({ sheetDoc: this.document, el, item });
        return;
      }
      ui.notifications.warn(game.i18n.localize("SBE.Inv.NoContainer"));
    });
  }

  /**
   * CLIC DROIT sur un objet porté (ligne de conteneur, slot plein) :
   * ses ACTIONS d'abord — celles de ses boutons proposés hors de la
   * fiche, grisées avec leur raison quand elles sont impossibles —
   * puis les entrées communes à tous les objets. Les actions passent
   * par l'exécuteur unique : le résultat est identique à un clic sur
   * le bouton dans la fiche de l'objet.
   */
  #wireCarriedMenu() {
    const L = (k) => game.i18n.localize(k);
    for (const node of this.element.querySelectorAll(".sbe-cont-row[data-item-id], .sbe-slot--filled[data-item-id], .sbe-grid-item[data-item-id], .sbe-icard[data-item-id]")) {
      /* Bouton « ⋮ » : le même menu, sans clic droit (pavés tactiles). */
      node.querySelector(".sbe-inv-menu")?.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        node.dispatchEvent(new MouseEvent("contextmenu", {
          bubbles: true, cancelable: true, clientX: ev.clientX, clientY: ev.clientY
        }));
      });
      node.querySelector(".sbe-inv-menu")?.addEventListener("dragstart", (ev) => ev.preventDefault());
      node.addEventListener("contextmenu", (ev) => {
        const item = this.#carriedById(node.dataset.itemId);
        if (!item) return;
        const inSlot = node.classList.contains("sbe-slot--filled");
        const fake = { dataset: { itemId: item.id, key: node.dataset.key ?? "" } };
        /* Contenu d'un objet du monde : il suit l'objet, on peut seulement l'en retirer. */
        if (isVirtualItem(item)) {
          if (this.document.isOwner) openContextMenu(ev, [{ label: L("SBE.Inv.Remove"), icon: "fa-solid fa-trash",
            onClick: () => SBELiveSheet.#onDropCarried.call(this, null, fake) }]);
          return;
        }
        /* Grille spatiale : pivoter d'un quart de tour. */
        const spKey = node.matches(".sbe-sp-item, .sbe-sp-outitem") ? node.closest(".sbe-cont")?.dataset.key : null;
        const spEl = spKey ? this.#slotElByKey(spKey) : null;
        const rotate = (spEl && isSpatialEl(spEl) && item.isOwner) ? [
          { label: L("SBE.Inv.RotateCw"), icon: "fa-solid fa-rotate-right",
            onClick: () => rotateCarried({ sheetDoc: this.document, el: spEl, item, dir: 1 }) },
          { label: L("SBE.Inv.RotateCcw"), icon: "fa-solid fa-rotate-left",
            onClick: () => rotateCarried({ sheetDoc: this.document, el: spEl, item, dir: -1 }) }
        ] : [];
        const actions = actionsOf(item).map(a => ({
          label: a.label, icon: a.icon, disabled: a.disabled, reason: a.reason,
          onClick: () => runAction(item, a.id)
        }));
        openContextMenu(ev, [
          ...actions,
          { separator: true },
          { label: L("SBE.Actions.Open"), icon: "fa-solid fa-up-right-from-square",
            onClick: () => item.sheet?.render(true) },
          ...rotate,
          inSlot ? { label: L("SBE.Inv.Unequip"), icon: "fa-solid fa-xmark",
            onClick: () => SBELiveSheet.#onUnequip.call(this, null, fake) } : null,
          /* Afficher l'objet dans le chat (carte repliée). */
          ItemChat.menuEntry(item),
          /* MJ : identifier / rendre inconnu (modèle « non identifié »). */
          ItemIdentity.menuEntry(item),
          /* Échange : seulement les objets échangeables (manager). */
          TradeManager.menuEntry(item, carrierOf(item)),
          /* Poser au sol, aux pieds du porteur. */
          GroundItems.menuEntry(item),
          item.isOwner && !isLockedItem(item) ? { label: L("SBE.Inv.Remove"), icon: "fa-solid fa-trash",
            onClick: () => SBELiveSheet.#onDropCarried.call(this, null, fake) } : null
        ]);
      });
    }
  }

  /** Les lignes d'inventaire et les slots pleins sont déplaçables. */
  #wireCarriedDrag() {
    for (const row of this.element.querySelectorAll("[data-uuid][draggable='true']")) {
      /* Le contenu d'un objet du monde ne se tire pas (il suit l'objet). */
      if (!row.dataset.uuid) { row.draggable = false; continue; }
      row.addEventListener("dragstart", (ev) => {
        ev.stopPropagation();
        ev.dataTransfer?.setData("text/plain", JSON.stringify({
          type: "Item", uuid: row.dataset.uuid
        }));
        /* Grille spatiale : on retient la taille de l'objet et l'endroit
           où il est tenu (aperçu vert / rouge, case visée). */
        if (row.matches(".sbe-sp-item, .sbe-sp-outitem")) startPieceDrag(ev, row);
        else beginDragFromUuid(row.dataset.uuid);
      });
    }
  }

  /**
   * Saisie groupée des champs d'un GRAPHIQUE : les champs déplacés dans
   * un graphe n'ont plus de zone de saisie sur la fiche — cette petite
   * fenêtre les rassemble (uniquement ceux qui sont modifiables ici :
   * non calculés, et autorisés pour cet utilisateur).
   */
  static async #onEditChartValues(_event, target) {
    const id = target.dataset.elId;
    const tpl = this.document.system.template;
    if (!id || !tpl) return;
    const chart = findById(tpl.system.elements ?? [], id);
    if (!chart) return;

    const isGM = game.user.isGM;
    const values = this.document.system.values ?? {};
    const fields = (Array.isArray(chart.children) ? chart.children : []).filter(k =>
      k?.key && ["number", "gauge"].includes(k.kind) && !k.config?.computed
      && (isGM || k.playerEditable !== false));
    if (!fields.length) return;

    const esc = foundry.utils.escapeHTML;
    const rows = fields.map(f => {
      const c = f.config ?? {};
      const min = c.min !== undefined ? ` min="${Number(c.min)}"` : "";
      const max = c.max !== undefined ? ` max="${Number(c.max)}"` : "";
      const icon = String(c.labelIcon ?? "").trim();
      const ic = icon
        ? (icon.includes("fa-") ? `<i class="fa-solid ${esc(icon.replace(/fa-solid\s*/, ""))}"></i> ` : `${esc(icon)} `)
        : "";
      return `
        <div class="form-group">
          <label>${ic}${esc(f.label || f.key)}</label>
          <div class="form-fields">
            <input type="number" name="${esc(f.key)}" value="${Number(values[f.key] ?? c.default ?? 0)}"${min}${max} step="1">
          </div>
        </div>`;
    }).join("");

    const data = await foundry.applications.api.DialogV2.prompt({
      window: {
        title: chart.label
          ? `${game.i18n.localize("SBE.Template.ChartEditValues")} — ${chart.label}`
          : game.i18n.localize("SBE.Template.ChartEditValues"),
        icon: "fa-solid fa-pen-to-square"
      },
      position: { width: 340 },
      content: `<div class="sbe-chart-values">${rows}</div>`,
      ok: {
        label: game.i18n.localize("SBE.Template.ChartEditApply"),
        icon: "fa-solid fa-check",
        callback: (_ev, button) =>
          new foundry.applications.ux.FormDataExtended(button.form).object
      }
    }).catch(() => null);
    if (!data) return;

    const update = {};
    for (const f of fields) {
      const raw = Number(data[f.key]);
      if (Number.isFinite(raw)) update[`system.values.${f.key}`] = raw;
    }
    if (Object.keys(update).length) await this.document.update(update);
  }

  /**
   * JET DE DÉS d'un champ (crayon → Jet de dés). Le champ est à la fois
   * l'affichage ET le déclencheur — pas de bouton séparé :
   *  - la formule accepte les CLÉS du modèle (converties en @clé) ;
   *  - comparaison optionnelle : sous / au-dessus de la valeur du champ,
   *    ou face à une cible (nombre ou clé) ;
   *  - application optionnelle du résultat À LA VALEUR du champ
   *    (ajouter / retirer / remplacer) — le « 2 en 1 » : PV -1d6, etc.
   * Le lanceur natif de Foundry est utilisé (donc les modules de dés 3D
   * fonctionnent, sans que SBE en dépende).
   */
  static async #onRollField(_event, target) {
    await rollField(this.document, target.dataset.key, { ask: true, after: "card" });
  }

  /** Choix d'une image nommée : la valeur du champ devient son chemin. */
  static async #onPickImgChoice(_event, target) {
    const { key, path } = target.dataset;
    if (!key || !path) return;
    if (this.document.system.values?.[key] === path) return;
    await this.document.update({ [`system.values.${key}`]: path });
  }

  /** Image d'un champ de la fiche : la valeur est un chemin d'image. */
  static #onPickFieldImage(_event, target) {
    const key = target.closest("[data-key]")?.dataset.key;
    if (!key) return;
    const current = this.document.system.values?.[key] ?? "";
    const FilePicker = foundry.applications.apps.FilePicker.implementation;
    new FilePicker({
      type: "image",
      current,
      callback: (path) => this.document.update({ [`system.values.${key}`]: path })
    }).render(true);
  }

  /**
   * Recale l'objet sur la dernière version du template :
   * - valeurs existantes conservées pour les clés toujours présentes ;
   * - clés orphelines purgées ;
   * - défauts appliqués aux nouveaux champs.
   */
  static async #onReloadTemplate() {
    await this.syncTemplate();
  }

  /**
   * Aligne la fiche sur la version courante du modèle : nouvelles clés
   * avec leurs défauts, valeurs orphelines purgées, version enregistrée.
   * Appelé AUTOMATIQUEMENT au rendu quand le modèle a changé — plus
   * aucun bouton « recharger » à cliquer.
   */
  async syncTemplate() {
    const sys = this.document.system;
    const tpl = sys.template;
    if (!tpl) return;

    const cur = sys.values ?? {};
    const liveKeys = new Set();
    const update = { "system.templateVersion": tpl.system.structVersion ?? 0 };

    for (const el of walkElements(tpl.system.elements ?? [])) {
      const k = el?.key;
      if (!k) continue;
      liveKeys.add(k);
      /* Points temporaires : leur sous-clé vit avec la jauge. */
      if (el.kind === "gauge" && el.config?.temp?.on) liveKeys.add(`${k}_temp`);
      if (!(k in cur) && el.config?.default !== undefined) {
        update[`system.values.${k}`] = el.config.default;
      }
    }
    for (const k of Object.keys(cur)) {
      if (!liveKeys.has(k)) update[`system.values.${k}`] = foundry.data.operators.ForcedDeletion.create();
    }

    await this.document.update(update);
  }
}
}
