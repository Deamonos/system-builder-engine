/**
 * SBE — System Builder Engine
 * Point d'entrée principal du système.
 *
 * Rôle : enregistrer les data models, documents, feuilles, managers,
 * helpers Handlebars et paramètres du système lors de l'initialisation.
 *
 * Structure du code :
 * - module/documents/  → classes Document étendues (SBEActor, SBEItem)
 * - module/data/       → data models / schémas (templates acteur & objet)
 * - module/sheets/     → ApplicationV2 (feuilles acteur & objet)
 * - module/builder/    → cœur SBE (éditeurs de structures, règles, mécaniques)
 * - module/managers/   → managers (groupes, journée, coffres, échanges, marchands, identité, HUD…)
 * - module/migrations/ → versionnage de schéma + migrations automatiques
 * - module/helpers/    → utilitaires partagés (sockets, helpers HBS, etc.)
 */

import { SYSTEM_ID, audioFormatsHint } from "./helpers/constants.mjs";
import { cfTip, initCondense } from "./helpers/compact-form.mjs";
import { initWorldContents } from "./builder/inventory.mjs";
import { WorkshopHistory } from "./builder/workshop-history.mjs";
import { initAsk } from "./helpers/ask-dialog.mjs";
import { initCondBuilder } from "./builder/cond-builder.mjs";
import { initTemplateImport } from "./builder/template-import.mjs";
import { ItemIdentity } from "./managers/identity/item-identity.mjs";
import { ActionTriggers } from "./managers/triggers/action-triggers.mjs";
import { initWindowFit } from "./helpers/window-fit.mjs";
import { initKeepScroll } from "./helpers/keep-scroll.mjs";
import { installSocketHub, registerSafeWriteHandlers } from "./helpers/socket.mjs";
import { initTableDraw } from "./helpers/table-draw.mjs";
import { UndoManager } from "./managers/undo/undo-manager.mjs";
import { TalentManager } from "./builder/talents/talent-sheet.mjs";
import { LevelManager } from "./builder/levels/level-sheet.mjs";
import { SBEUndoHistory } from "./managers/undo/undo-history-app.mjs";
import { PauseBanner } from "./managers/pause/pause-banner.mjs";
import { SBEPauseConfig } from "./managers/pause/pause-config.mjs";
import { ThemeLibrary } from "./managers/theme/theme-library.mjs";
import { ThemeManager } from "./managers/theme/theme-manager.mjs";
import { SBEThemeConfig } from "./managers/theme/theme-config.mjs";
import { TemplateTheme } from "./managers/theme/template-theme.mjs";
import { ElementCss } from "./managers/theme/element-css.mjs";
import { TooltipManager } from "./managers/tooltip/tooltip-manager.mjs";
import { ChatCards } from "./managers/chat/chat-cards.mjs";
import { IdentityManager } from "./managers/identity/identity-manager.mjs";
import { TempPoints } from "./managers/temp/temp-points.mjs";
import { GaugeCap } from "./managers/gauge-guard/gauge-cap.mjs";
import { TradeManager } from "./managers/trade/trade-manager.mjs";
import { SBETradeConfig } from "./managers/trade/trade-config.mjs";
import { RollRequests } from "./managers/rollreq/roll-requests.mjs";
import { GroundItems } from "./managers/ground/ground-items.mjs";
import { UseManager } from "./managers/use/use-manager.mjs";
import { CombatManager } from "./managers/combat/combat-manager.mjs";
import { Initiative } from "./managers/combat/initiative.mjs";
import { SummonManager } from "./managers/summon/summon-manager.mjs";
import { SBECombatConfig } from "./managers/combat/combat-config.mjs";
import { SBEZoneEditor } from "./managers/zones/zone-editor.mjs";
import { SBEBodyEditor } from "./managers/combat/body-editor.mjs";
import { initAfterButtons } from "./builder/field-roll.mjs";
import { PersistentZones, SBEZoneBehavior, BEHAVIOR_TYPE } from "./managers/zones/persistent-zones.mjs";
import { SBEHud } from "./managers/hud/hud.mjs";
import { SBEHudPicker } from "./managers/hud/hud-config.mjs";
import { DoorLocks } from "./managers/locks/door-locks.mjs";
import { ToolWear } from "./managers/locks/tool-wear.mjs";
import { SBELockSettings } from "./managers/locks/lock-settings-app.mjs";
import { ChestManager } from "./managers/chest/chest-manager.mjs";
import { initChecker } from "./managers/checker/checker-app.mjs";
import { DemoManager } from "./managers/demo/demo-manager.mjs";
import { DocsManager } from "./managers/docs/docs-manager.mjs";
import { ItemPreview } from "./managers/preview/item-preview.mjs";
import { SBEGroupeData } from "./data/groupe-data.mjs";
import { SBEPropData } from "./data/prop-data.mjs";
import { PropManager } from "./managers/props/prop-manager.mjs";
import { PropTiles } from "./managers/props/prop-tiles.mjs";
import { PropScene } from "./managers/props/prop-scene.mjs";
import { BarManager } from "./managers/bars/bar-manager.mjs";
import { LookManager } from "./managers/looks/look-manager.mjs";
import { TrapManager } from "./managers/traps/trap-manager.mjs";
import { LanguageManager } from "./managers/languages/language-manager.mjs";
import { SBELanguageMenu } from "./managers/languages/language-app.mjs";
import { SBEGroupeSheet } from "./sheets/actor/groupe-sheet.mjs";
import { GroupManager } from "./managers/group/group-manager.mjs";
import { WaitingItems } from "./managers/waiting/waiting-items.mjs";
import { installSpatialDragWatch } from "./builder/spatial-ui.mjs";
import { installSpatialRefresh } from "./builder/spatial-item.mjs";
import { MediaManager } from "./managers/media/media-manager.mjs";
import { PropagationManager } from "./managers/propagation/propagation-manager.mjs";
import { OrphanCleanup } from "./managers/cleanup/orphan-cleanup.mjs";
import { NEWDAY_DEFAULTS } from "./managers/newday/newday-manager.mjs";
import { EffectManager } from "./managers/effects/effect-manager.mjs";
import { EffectGives } from "./managers/effects/effect-gives.mjs";
import { SBEEffectsApp } from "./managers/effects/effects-app.mjs";
import { EffectEngine } from "./managers/effects/effect-engine.mjs";
import { EffectLook } from "./managers/effects/effect-look.mjs";
import { LightAnimations } from "./managers/vision/light-animations.mjs";
import { VisionModes } from "./managers/vision/vision-modes.mjs";
import { SBEVisionModesApp } from "./managers/vision/vision-modes-app.mjs";
import { VisionPerception } from "./managers/vision/vision-perception.mjs";
import { VisionManager } from "./managers/vision/vision-manager.mjs";
import { PersonalLight } from "./managers/vision/personal-light.mjs";
import { ThermalView } from "./managers/vision/thermal-view.mjs";
import { SBEItem } from "./documents/item.mjs";
import { SBEActor } from "./documents/actor.mjs";
import { SBETemplateData } from "./data/template-data.mjs";
import { initHelpTips } from "./managers/help/help-tips.mjs";
import { SBEQueteData } from "./data/quete-data.mjs";
import { SBEQuestJournalSheet, SBEQuetePageSheet } from "./sheets/journal/quest-journal-sheet.mjs";
import { QuestManager } from "./managers/quest/quest-manager.mjs";
import { SBEQuestTracker } from "./managers/quest/quest-tracker.mjs";
import { TraceManager } from "./managers/traces/trace-manager.mjs";
import { SBETraceMenu } from "./managers/traces/trace-config.mjs";
import { SBETraceRegionData } from "./data/trace-region-data.mjs";
import { SBEStationRegionData, atStationOf } from "./data/station-region-data.mjs";
import { registerScopeFunctions } from "./builder/doc-scope.mjs";
import { CalendarManager } from "./managers/calendar/calendar-manager.mjs";
import { SBECalendarEditor } from "./managers/calendar/calendar-editor.mjs";
import { SBEObjetData } from "./data/objet-data.mjs";
import { SBEPersonnageData } from "./data/personnage-data.mjs";
import { SBETemplateSheet } from "./sheets/item/template-sheet.mjs";
import { SBEObjetSheet } from "./sheets/item/objet-sheet.mjs";
import { SBEActorTemplateSheet } from "./sheets/actor/template-sheet.mjs";
import { SBEPersonnageSheet } from "./sheets/actor/personnage-sheet.mjs";
import { Money, MONEY_SETTING } from "./managers/money/money.mjs";
import { SBEMerchantConfig } from "./managers/merchant/merchant-config.mjs";
import { MerchantManager } from "./managers/merchant/merchant-manager.mjs";
import { MERCHANTS_SETTING } from "./managers/merchant/merchant-model.mjs";
import { CAROUSEL_SETTING, CAROUSEL_POS_SETTING, CAROUSEL_ENABLED_SETTING } from "./managers/carousel/carousel-model.mjs";
import { CarouselManager } from "./managers/carousel/carousel-manager.mjs";
import { ToursManager } from "./managers/tours/tours-manager.mjs";
import { SBECarouselConfig } from "./managers/carousel/carousel-config.mjs";
import { themeTooltips } from "./helpers/ui-theme.mjs";

/* -------------------------------------------- */
/*  Initialisation                              */
/* -------------------------------------------- */

Hooks.once("init", () => {
  console.log("SBE | Initialisation du System Builder Engine");

  /* « Formats acceptés : … » sous chaque champ de son (gabarits). */
  Handlebars.registerHelper("sbeAudioFormats", () => audioFormatsHint());
  /* Bulle d'aide « ? » d'un formulaire condensé : des clés de traduction
     ou des textes déjà prêts, mis bout à bout. */
  Handlebars.registerHelper("sbeTip", (...args) => new Handlebars.SafeString(cfTip(args.slice(0, -1)
    .map(k => (game.i18n.has(k) ? game.i18n.localize(k) : String(k ?? ""))).filter(Boolean).join(" "))));

  /* Toutes les fenêtres SBE tiennent dans l'écran (défilement sinon). */
  initWindowFit();
  initKeepScroll();
  /* Fenêtres de réglages : champs deux par ligne, aides en bulles. */
  initCondense();
  /* Contenu d'un objet du monde : il devient de vrais objets à l'arrivée. */
  initWorldContents();
  /* Atelier : annuler / rétablir (historique par modèle, raccourcis). */
  WorkshopHistory.init();
  /* Étape « Demander » : questions posées à un autre joueur (socket). */
  initAsk();
  initCondBuilder();
  /* Importer un modèle directement depuis les onglets Objets / Acteurs. */
  initTemplateImport();
  /* Déclencheurs d'actions : boutons qui se lancent tout seuls. */
  ActionTriggers.init();

  /* --- Chaîne des objets : documents, data models, feuilles --- */
  CONFIG.Item.documentClass = SBEItem;
  CONFIG.Item.dataModels.template = SBETemplateData;
  CONFIG.Item.dataModels.objet = SBEObjetData;

  /* --- Chaîne des personnages : même atelier, ancré sur Actor --- */
  CONFIG.Actor.documentClass = SBEActor;
  CONFIG.Actor.dataModels.template = SBETemplateData;   /* même data model : structure partagée */
  CONFIG.Actor.dataModels.personnage = SBEPersonnageData;
  CONFIG.Actor.dataModels.groupe = SBEGroupeData;
  /* Objets de scène : le personnage de base caché des pions posés. */
  CONFIG.Actor.dataModels.prop = SBEPropData;
  CONFIG.JournalEntryPage.dataModels.quete = SBEQueteData;
  /* Comportement de région « Traces SBE » (boue, neige…). */
  CONFIG.RegionBehavior.dataModels.sbeTraces = SBETraceRegionData;
  CONFIG.RegionBehavior.typeIcons ??= {};
  CONFIG.RegionBehavior.typeIcons.sbeTraces = "fa-solid fa-shoe-prints";
  /* Poste de travail (forge, établi…) : atStation("forge") dans les formules. */
  CONFIG.RegionBehavior.dataModels.sbeStation = SBEStationRegionData;
  CONFIG.RegionBehavior.typeIcons.sbeStation = "fa-solid fa-hammer";
  registerScopeFunctions("stations", (doc) => ({ atStation: (name = "") => atStationOf(doc, name) }));

  const { DocumentSheetConfig } = foundry.applications.apps;
  DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, SBETemplateSheet, {
    types: ["template"], makeDefault: true, label: "SBE.Template.SheetName"
  });
  DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, SBEObjetSheet, {
    types: ["objet"], makeDefault: true, label: "SBE.Objet.SheetName"
  });
  DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, SBEActorTemplateSheet, {
    types: ["template"], makeDefault: true, label: "SBE.Template.SheetName"
  });
  DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, SBEPersonnageSheet, {
    types: ["personnage"], makeDefault: true, label: "SBE.Actor.SheetName"
  });
  DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, SBEGroupeSheet, {
    types: ["groupe"], makeDefault: true, label: "SBE.Group.SheetName"
  });
  /* Journal de quêtes : choisi par le journal lui-même (flags.core.sheetClass). */
  DocumentSheetConfig.registerSheet(JournalEntry, SYSTEM_ID, SBEQuestJournalSheet, {
    makeDefault: false, label: "SBE.Quest.SheetName"
  });
  DocumentSheetConfig.registerSheet(JournalEntryPage, SYSTEM_ID, SBEQuetePageSheet, {
    types: ["quete"], makeDefault: true, label: "SBE.Quest.SheetName"
  });

  /* --- Manager : bannière de pause --- */
  game.settings.register(SYSTEM_ID, "pauseBanner", {
    scope: "world",
    config: false,
    type: Object,
    default: foundry.utils.deepClone(PauseBanner.DEFAULTS),
    onChange: () => PauseBanner.refresh()
  });

  game.settings.registerMenu(SYSTEM_ID, "pauseBannerMenu", {
    name: "SBE.PauseBanner.MenuName",
    label: "SBE.PauseBanner.MenuLabel",
    hint: "SBE.PauseBanner.MenuHint",
    icon: "fa-solid fa-pause",
    type: SBEPauseConfig,
    restricted: true
  });

  /* --- Bibliothèque de thèmes (Sombre, Clair + thèmes nommés du MJ ;
         choix de chaque joueur dans les paramètres du système) --- */
  ThemeLibrary.register();

  /* --- Manager : thème --- */
  game.settings.register(SYSTEM_ID, "theme", {
    scope: "world",
    config: false,
    type: Object,
    default: foundry.utils.deepClone(ThemeManager.DEFAULTS),
    onChange: () => ThemeManager.apply()
  });

  game.settings.registerMenu(SYSTEM_ID, "themeMenu", {
    name: "SBE.Theme.MenuName",
    label: "SBE.Theme.MenuLabel",
    hint: "SBE.Theme.MenuHint",
    icon: "fa-solid fa-palette",
    type: SBEThemeConfig,
    restricted: true
  });

  /* --- Manager : tooltips (réglés dans l'onglet « Info-bulles » du thème) --- */
  game.settings.register(SYSTEM_ID, "tooltipTheme", {
    scope: "world",
    config: false,
    type: Object,
    default: foundry.utils.deepClone(TooltipManager.DEFAULTS),
    onChange: () => TooltipManager.apply()
  });
  /* Foundry affiche toujours ses info-bulles en sombre : au choix du MJ,
     elles suivent le thème de l'interface de chaque joueur. */
  game.settings.register(SYSTEM_ID, "tooltipFollowTheme", {
    name: "SBE.Tooltip.FollowTheme",
    hint: "SBE.Tooltip.FollowThemeHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
  Hooks.once("ready", () => themeTooltips(() => game.settings.get(SYSTEM_ID, "tooltipFollowTheme") !== false));

  /* --- Manager : messages de chat (carte unique + cadre ; réglés dans
         l'onglet « Messages du chat » du thème) --- */
  game.settings.register(SYSTEM_ID, "chatTheme", {
    scope: "world",
    config: false,
    type: Object,
    default: ChatCards.DEFAULTS,
    onChange: () => ChatCards.apply()
  });
  /* Foundry affiche toujours le journal du chat en clair : au choix du MJ,
     il suit le thème de l'interface de chaque joueur. */
  game.settings.register(SYSTEM_ID, "chatFollowTheme", {
    name: "SBE.Chat.FollowTheme",
    hint: "SBE.Chat.FollowThemeHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => ChatCards.themeLogs()
  });
  ChatCards.init();

  /* --- Jets : l'avantage imposé (case d'un objet porté, effet) est-il
     verrouillé dans la fenêtre de jet, ou seulement choisi d'avance ? --- */
  game.settings.register(SYSTEM_ID, "rollAdvLock", {
    name: "SBE.Roll.SettingAdvLock",
    hint: "SBE.Roll.SettingAdvLockHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  /* --- Manager : identité (noms masqués côté joueurs) --- */
  game.settings.register(SYSTEM_ID, "identityEnabled", {
    name: "SBE.Identity.SettingEnabled",
    hint: "SBE.Identity.SettingEnabledHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => IdentityManager.refreshDisplays()
  });
  game.settings.register(SYSTEM_ID, "identityUnknown", {
    name: "SBE.Identity.SettingUnknown",
    hint: "SBE.Identity.SettingUnknownHint",
    scope: "world",
    config: true,
    type: String,
    default: "",
    onChange: () => IdentityManager.refreshDisplays()
  });
  IdentityManager.init();
  /* Objets non identifiés (masque à la source, comme les PNJ). */
  ItemIdentity.init();

  /* --- Points temporaires des jauges (dissipation, barres des pions) --- */
  TempPoints.init();
  /* --- Jauge au-dessus de son maximum (création, maximum qui baisse) --- */
  GaugeCap.init();

  /* --- Demandes de jet (bouton dé du chat, MJ) --- */
  RollRequests.init();

  /* --- Manager : combat (étape « Attaquer » des boutons) --- */
  game.settings.register(SYSTEM_ID, "combat", {
    scope: "world",
    config: false,
    type: Object,
    default: foundry.utils.deepClone(CombatManager.DEFAULTS)
  });
  game.settings.registerMenu(SYSTEM_ID, "combatMenu", {
    name: "SBE.Combat.MenuName",
    label: "SBE.Combat.MenuLabel",
    hint: "SBE.Combat.MenuHint",
    icon: "fa-solid fa-crosshairs",
    type: SBECombatConfig,
    restricted: true
  });
  CombatManager.init();
  initAfterButtons();
  /* --- Manager : retour en arrière des actions (annuler / rétablir) --- */
  game.settings.registerMenu(SYSTEM_ID, "undoMenu", {
    name: "SBE.Undo.MenuName",
    label: "SBE.Undo.MenuLabel",
    hint: "SBE.Undo.MenuHint",
    icon: "fa-solid fa-clock-rotate-left",
    type: SBEUndoHistory,
    restricted: true
  });
  UndoManager.init();
  TalentManager.init();
  LevelManager.init();
  Initiative.init();
  UseManager.init();
  GroundItems.init();
  /* --- Manager : HUD (un par modèle de personnage) --- */
  game.settings.registerMenu(SYSTEM_ID, "hudMenu", {
    name: "SBE.Hud.MenuName",
    label: "SBE.Hud.MenuLabel",
    hint: "SBE.Hud.MenuHint",
    icon: "fa-solid fa-gamepad",
    type: SBEHudPicker,
    restricted: true
  });
  SBEHud.init();
  /* --- Manager : formes de zone (dessinées par le MJ) --- */
  game.settings.register(SYSTEM_ID, "zoneShapes", {
    scope: "world",
    config: false,
    type: Array,
    default: []
  });
  game.settings.registerMenu(SYSTEM_ID, "zoneMenu", {
    name: "SBE.Zone.MenuName",
    label: "SBE.Zone.MenuLabel",
    hint: "SBE.Zone.MenuHint",
    icon: "fa-solid fa-draw-polygon",
    type: SBEZoneEditor,
    restricted: true
  });
  /* --- Manager : corps (localisation des coups) --- */
  game.settings.register(SYSTEM_ID, "bodies", {
    scope: "world",
    config: false,
    type: Array,
    default: []
  });
  game.settings.registerMenu(SYSTEM_ID, "bodiesMenu", {
    name: "SBE.Loc.MenuName",
    label: "SBE.Loc.MenuLabel",
    hint: "SBE.Loc.MenuHint",
    icon: "fa-solid fa-person",
    type: SBEBodyEditor,
    restricted: true
  });
  /* --- Manager : calendrier, horloge et météo --- */
  CalendarManager.init();
  game.settings.registerMenu(SYSTEM_ID, "calendarMenu", {
    name: "SBE.Cal.MenuName",
    label: "SBE.Cal.MenuLabel",
    hint: "SBE.Cal.MenuHint",
    icon: "fa-solid fa-calendar-days",
    type: SBECalendarEditor,
    restricted: true
  });
  /* --- Zones persistantes : un comportement de Région propre à SBE
         (déclaré dans system.json, documentTypes.RegionBehavior) --- */
  CONFIG.RegionBehavior.dataModels[BEHAVIOR_TYPE] = SBEZoneBehavior;
  CONFIG.RegionBehavior.typeIcons ??= {};
  CONFIG.RegionBehavior.typeIcons[BEHAVIOR_TYPE] = "fa-solid fa-fire";
  PersistentZones.init();

  /* --- Manager : échanges entre personnages --- */
  game.settings.register(SYSTEM_ID, "tradeEnabled", {
    name: "SBE.Trade.SettingEnabled",
    hint: "SBE.Trade.SettingEnabledHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  });
  game.settings.register(SYSTEM_ID, "tradeConfig", {
    scope: "world",
    config: false,
    type: Object,
    default: foundry.utils.deepClone(TradeManager.DEFAULTS)
  });
  /* Le bouton du manager n'apparaît que si l'échange est activé. */
  if (TradeManager.enabled) {
    game.settings.registerMenu(SYSTEM_ID, "tradeMenu", {
      name: "SBE.Trade.MenuName",
      label: "SBE.Trade.MenuLabel",
      hint: "SBE.Trade.MenuHint",
      icon: "fa-solid fa-right-left",
      type: SBETradeConfig,
      restricted: true
    });
    TradeManager.init();
  }

  /* --- Manager : marchands et monnaies (bibliothèque commune des
         monnaies : échanges, coffres, marchands) --- */
  game.settings.register(SYSTEM_ID, MONEY_SETTING, {
    scope: "world",
    config: false,
    type: Array,
    default: [],
    onChange: () => {
      for (const app of foundry.applications.instances.values()) {
        if (app.rendered && (app.document?.documentName === "Actor" || app.constructor.name === "SBETradeWindow")) app.render();
      }
    }
  });
  game.settings.register(SYSTEM_ID, MERCHANTS_SETTING, {
    scope: "world",
    config: false,
    type: Object,
    default: {}
  });
  MerchantManager.init();
  game.settings.registerMenu(SYSTEM_ID, "merchantMenu", {
    name: "SBE.Merchant.MenuName",
    label: "SBE.Merchant.MenuLabel",
    hint: "SBE.Merchant.MenuHint",
    icon: "fa-solid fa-store",
    type: SBEMerchantConfig,
    restricted: true
  });

  /* --- Carrousel de combat (bande des portraits) --- */
  game.settings.register(SYSTEM_ID, CAROUSEL_SETTING, {
    scope: "world",
    config: false,
    type: Object,
    default: {},
    onChange: () => CarouselManager.settingsChanged()
  });
  game.settings.register(SYSTEM_ID, CAROUSEL_ENABLED_SETTING, {
    name: "SBE.Carousel.SettingEnabled",
    hint: "SBE.Carousel.SettingEnabledHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => CarouselManager.settingsChanged()
  });
  game.settings.register(SYSTEM_ID, CAROUSEL_POS_SETTING, {
    scope: "client",
    config: false,
    type: String,
    default: ""
  });
  game.settings.registerMenu(SYSTEM_ID, "carouselMenu", {
    name: "SBE.Carousel.MenuName",
    label: "SBE.Carousel.MenuLabel",
    hint: "SBE.Carousel.MenuHint",
    icon: "fa-solid fa-film",
    type: SBECarouselConfig,
    restricted: true
  });
  CarouselManager.init();

  /* --- Manager : nouvelle journée (réglages du MJ, sur SES clés) --- */
  game.settings.register(SYSTEM_ID, "newDay", {
    scope: "world",
    config: false,
    type: Object,
    default: foundry.utils.deepClone(NEWDAY_DEFAULTS)
  });

  /* --- Coffres : les CLÉS choisies au dernier coffre (argent, poids,
     jets de verrou) deviennent celles des suivants — on règle une fois,
     on enchaîne les poses. Changer une clé dans un coffre la retient. */
  game.settings.register(SYSTEM_ID, "chestDefaults", {
    scope: "world",
    config: false,
    type: Object,
    default: { moneyKey: "", weightKey: "", lockRollTarget: "", digiRollTarget: "" }
  });

  /* --- Manager : effets (définitions du MJ, sur SES clés) --- */
  game.settings.register(SYSTEM_ID, "effects", {
    scope: "world",
    config: false,
    type: Array,
    default: [],
    onChange: () => {
      EffectManager.dropDefsCache();
      EffectManager.registerStatusEffects();
      /* Les apports se lisent sur les définitions : les fiches
         ouvertes se recalculent. */
      for (const a of EffectManager.allActors()) if (a.sheet?.rendered) a.sheet.render();
    }
  });
  game.settings.register(SYSTEM_ID, "hideNativeEffects", {
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
    onChange: () => EffectManager.registerStatusEffects()
  });
  game.settings.registerMenu(SYSTEM_ID, "effectsMenu", {
    name: "SBE.Effects.MenuName",
    label: "SBE.Effects.MenuLabel",
    hint: "SBE.Effects.MenuHint",
    icon: "fa-solid fa-bolt",
    type: SBEEffectsApp,
    restricted: true
  });
  EffectManager.init();
  EffectGives.init();
  EffectEngine.init();
  EffectLook.init();

  /* --- Vision (partie « Vision » des effets) + animations de lumière
         (disponibles pour TOUTES les lumières, pas seulement SBE) --- */
  LightAnimations.init();
  VisionModes.register();
  Hooks.once("setup", () => VisionPerception.register());
  game.settings.registerMenu(SYSTEM_ID, "visionModesMenu", {
    name: "SBE.VisionModes.MenuName",
    label: "SBE.VisionModes.MenuLabel",
    hint: "SBE.VisionModes.MenuHint",
    icon: "fa-solid fa-eye",
    type: SBEVisionModesApp,
    restricted: true
  });
  VisionManager.init();
  PersonalLight.init();
  ThermalView.init();

  /* --- Socket : hub unique + écritures déléguées (Tile/Wall) --- */
  installSocketHub();
  registerSafeWriteHandlers();
  initTableDraw();

  /* --- Manager : médias (sons déclenchés par les objets) --- */
  MediaManager.init();

  /* --- Manager : propagation modèle → exemplaires --- */
  PropagationManager.init();

  /* --- Manager : jamais d'objet orphelin --- */
  OrphanCleanup.init();

  /* --- Manager : thème par modèle de personnage --- */
  TemplateTheme.init();

  /* --- Manager : blocs CSS des éléments (&:hover, & .partie…) --- */
  ElementCss.init();

  /* --- Manager : verrous (portes natives, coffres) + usure des outils --- */
  ToolWear.register();
  game.settings.registerMenu(SYSTEM_ID, "lockMenu", {
    name: "SBE.Locks.MenuName",
    label: "SBE.Locks.MenuLabel",
    hint: "SBE.Locks.MenuHint",
    icon: "fa-solid fa-lock",
    type: SBELockSettings,
    restricted: true
  });
  DoorLocks.init();

  /* --- Mot de passe : chaque joueur change le sien (paramètres du
         système + clic droit dans la liste des joueurs) — toujours actif --- */
  /* --- Vérificateur de modèles : rapport, renommage, alerte au chargement --- */
  initChecker();
  DemoManager.init();
  DocsManager.init();
  ItemPreview.init();

  /* --- Groupe : sauvegardes des personnages (3 + automatique) --- */
  GroupManager.init();

  /* --- Quêtes : journaux de quêtes, sections, droits --- */
  QuestManager.init();
  SBEQuestTracker.init();

  /* --- Traces au sol (sang, boue…) --- */
  TraceManager.init();

  /* --- Objets de scène (déployables, outils fixes, éléments interactifs) --- */
  PropManager.init();
  SummonManager.init();
  /* Tuiles du décor accrochées à un objet de scène ; déclencheurs. */
  PropTiles.init();
  /* Étapes « Scène » (portes, lumières, sons, régions…) et liens de scène. */
  PropScene.init();
  /* Barres de jetons (tous les personnages, par modèle, par jeton). */
  BarManager.init();
  /* Apparences du jeton (dossier d'images, HUD, règles, déguisement). */
  LookManager.init();
  /* Pièges (objets de scène qui surveillent une zone). */
  TrapManager.init();
  /* Langues des personnages (passages écrits dans une langue, chat). */
  LanguageManager.init();
  game.settings.registerMenu(SYSTEM_ID, "languageMenu", {
    name: "SBE.Languages.MenuName", label: "SBE.Languages.MenuLabel", hint: "SBE.Languages.MenuHint",
    icon: "fa-solid fa-language", type: SBELanguageMenu, restricted: true
  });
  game.settings.registerMenu(SYSTEM_ID, "traceMenu", {
    name: "SBE.Traces.MenuName", label: "SBE.Traces.MenuLabel", hint: "SBE.Traces.MenuHint",
    icon: "fa-solid fa-droplet", type: SBETraceMenu, restricted: true
  });

  /* --- Explications longues repliées en « ? » dans toutes les fenêtres SBE --- */
  initHelpTips();

  /* --- Visites guidées (premier lancement, Gestion des présentations) --- */
  ToursManager.init();

  /* --- Grille spatiale : objets sans place (échanges), glisser-déposer
         (aperçu vert / rouge), fiches qui suivent la taille des objets --- */
  WaitingItems.init();
  installSpatialDragWatch();
  installSpatialRefresh();
});

/* -------------------------------------------- */
/*  Setup (avant le rendu de la scène)          */
/* -------------------------------------------- */

Hooks.once("setup", () => {
  PauseBanner.hideNativeEarly();
  /* Effets du MJ → statuts du HUD (réglages du monde lisibles ici). */
  EffectManager.registerStatusEffects();
});

/* -------------------------------------------- */
/*  Prêt                                        */
/* -------------------------------------------- */

Hooks.once("ready", () => {
  PauseBanner.install();
  ThemeManager.apply();
  TemplateTheme.applyAll();
  ElementCss.refresh();
  TooltipManager.apply();
  ChatCards.apply();
  /* Thème choisi (ou imposé) : liste traduite, fenêtres de Foundry
     dans son style. */
  ThemeLibrary.refreshChoices();
  ThemeLibrary.activate();

  /* --- Monnaies : l'ancienne clé d'argent unique devient la première
         monnaie (une fois, MJ). --- */
  Money.adoptLegacyKey().catch(err => console.warn("SBE | Monnaies : reprise de la clé en échec", err));

  /* --- Manager : coffres sur la scène --- */
  ChestManager.init();

  /* --- HUD du personnage contrôlé --- */
  SBEHud.ready();

  /* --- Un modèle change : les fiches OUVERTES construites dessus se
         redessinent (et prennent les nouveaux champs) sans être
         refermées. Regroupé : une rafale d'éditions = un seul rendu. --- */
  let tplTimer = null;
  const tplIds = new Set();
  const refreshDependents = () => {
    const ids = new Set(tplIds);
    tplIds.clear();
    for (const app of foundry.applications.instances.values()) {
      const doc = app?.document;
      if (!app.rendered || !doc || ids.has(doc.id)) continue;
      const own = ids.has(doc.system?.templateId);
      const carries = doc.documentName === "Actor" && doc.items?.some?.(i => ids.has(i.system?.templateId));
      if (own || carries) app.render();
    }
  };
  const onTemplate = (doc, changes) => {
    if (doc?.type !== "template" || doc.parent || !changes?.system) return;
    tplIds.add(doc.id);
    clearTimeout(tplTimer);
    tplTimer = setTimeout(refreshDependents, 300);
  };
  Hooks.on("updateActor", onTemplate);
  Hooks.on("updateItem", onTemplate);

  console.log("SBE | Système prêt");
});
