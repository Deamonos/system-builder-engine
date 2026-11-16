/**
 * SBE — Visites par famille de modules (MJ)
 *
 * Construire, Combat, Effets, Le monde, Apparence, Outils. Chacune montre
 * les vraies fenêtres (rien n'est créé : les modèles de « Construire » sont
 * tenus en mémoire). Une étape qui porte `menu` relie la fenêtre de ce menu
 * à la visite : son en-tête reçoit un bouton qui lance la visite à cette
 * étape (tours-manager).
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { menuWindow } from "./sbe-tour.mjs";
import { openSampleActorModel, openSampleItemModel, openComponentWindow, openSampleHudConfig, prepareZoneEditor, prepareBodyEditor } from "./tour-samples.mjs";
import { BarManager } from "../bars/bar-manager.mjs";

/** La place d'un jeton à l'écran (le projecteur l'entoure). */
function tokenOnScreen(token) {
  if (!token || token.destroyed) return null;
  const b = token.bounds;
  const a = canvas.clientCoordinatesFromCanvas({ x: b.left, y: b.top });
  const z = canvas.clientCoordinatesFromCanvas({ x: b.right, y: b.bottom });
  return [{ getBoundingClientRect: () => new DOMRect(a.x, a.y, z.x - a.x, z.y - a.y) }];
}

/** Une étape : titre et texte traduits d'après la visite et l'id. */
const stepOf = (tour) => (id, extra = {}) => ({
  id, title: `SBE.Tour.${tour}.${id}Title`, content: `SBE.Tour.${tour}.${id}Body`, restricted: true, ...extra
});

/** Une étape sur la fenêtre d'un menu des réglages du système. */
const menuStepOf = (tour) => (id, key, appId, extra = {}) =>
  stepOf(tour)(id, { open: menuWindow(key, appId), selector: "@window", menu: key, appId, ...extra });

/** Un ou plusieurs outils de la scène (jetons), montrés ensemble. */
const toolStepOf = (tour) => (id, tools, extra = {}) => stepOf(tour)(id, {
  control: { control: "tokens", tool: "select" },
  selector: () => tools.map(t => document.querySelector(`#scene-controls-tools [data-tool='${t}']`)).filter(Boolean),
  when: () => !!canvas.scene,
  ...extra
});

/** Données communes d'une visite. */
const tourOf = (key, steps, docPage = "") => ({
  docPage,
  title: `SBE.Tour.${key}.Title`,
  description: `SBE.Tour.${key}.Description`,
  canBeResumed: true,
  display: true,
  /* Finie, la visite revient au sommaire de « Découvrir SBE ». */
  returnTo: { tour: `${SYSTEM_ID}.discover`, step: "End" },
  steps
});

function buildTour() {
  const s = stepOf("Build");
  return tourOf("Build", [
    s("Intro"),
    s("Workshop", { window: "actor", open: openSampleActorModel, selector: "@window" }),
    s("Add", { window: "actor", open: openSampleActorModel, selector: (app) => app?.element?.querySelector(".sbe-tpl-plus") }),
    s("Component", { window: "actor", open: openSampleActorModel, selector: (app) => app?.element?.querySelector(".sbe-tpl-el") }),
    s("Share", { window: "actor", open: openSampleActorModel,
      selector: (app) => [...(app?.element?.querySelectorAll("[data-action='exportTemplate'], [data-action='importTemplate']") ?? [])] }),
    s("ItemModel", { window: "item", open: openSampleItemModel, selector: "@window" }),
    s("Steps", { window: "item", open: openSampleItemModel, child: (app) => openComponentWindow(app, "button"),
      selector: (app) => app?.element?.querySelector(".sbe-steps-list") ?? app?.element }),
    s("End")
  ], "atelier");
}

function combatTour() {
  const s = stepOf("Combat"), m = menuStepOf("Combat");
  return tourOf("Combat", [
    s("Intro"),
    m("Rules", "combatMenu"),
    m("Templates", "zoneMenu", null, { open: menuWindow("zoneMenu", null, prepareZoneEditor) }),
    m("Bodies", "bodiesMenu", null, { open: menuWindow("bodiesMenu", null, prepareBodyEditor) }),
    s("Carousel", { preview: "carousel", selector: "#sbe-carousel", clearView: true }),
    m("CarouselConfig", "carouselMenu"),
    s("End")
  ], "combat");
}

function effectsTour() {
  const s = stepOf("Effects"), m = menuStepOf("Effects"), t = toolStepOf("Effects");
  return tourOf("Effects", [
    s("Intro"),
    m("Manager", "effectsMenu"),
    t("Tool", ["sbeEffects"]),
    s("Items"),
    s("End")
  ], "effets");
}

function worldTour() {
  const s = stepOf("World"), m = menuStepOf("World"), t = toolStepOf("World");
  return tourOf("World", [
    s("Intro"),
    m("Calendar", "calendarMenu"),
    s("Clock", { preview: "clock", selector: ".sbe-clock" }),
    t("NewDay", ["sbeNewDay"]),
    t("Quests", ["sbeQuests"]),
    m("Merchants", "merchantMenu"),
    t("Place", ["sbePlaceChest", "sbePlaceMerchant"]),
    m("Trades", "tradeMenu"),
    m("Locks", "lockMenu"),
    t("Traps", ["sbeTrapZones"]),
    m("Traces", "traceMenu", "sbe-trace-config"),
    m("Vision", "visionModesMenu"),
    m("Languages", "languageMenu", "sbe-language-app"),
    s("End")
  ], "monde");
}

function lookTour() {
  const s = stepOf("Look"), m = menuStepOf("Look");
  return tourOf("Look", [
    s("Intro"),
    m("Theme", "themeMenu"),
    s("HudPreview", { preview: "hud", clearView: true, selector: () => {
      const hud = document.querySelector("#sbe-hud-tour") ?? document.querySelector("#sbe-hud");
      return hud ? [hud, ...hud.querySelectorAll(".sbe-hud-panel")] : null;
    } }),
    m("Hud", "hudMenu", null, { open: openSampleHudConfig }),
    s("BarsPreview", { preview: "bars", selector: () => tokenOnScreen(BarManager.previewToken()), when: () => !!canvas.scene, clearView: true }),
    m("Bars", "tokenBarsMenu", "sbe-token-bars"),
    s("PausePreview", { preview: "pause", selector: "#sbe-pause .sbe-pause-content" }),
    m("Pause", "pauseBannerMenu"),
    s("End")
  ], "apparence");
}

function toolsTour() {
  const s = stepOf("Tools"), m = menuStepOf("Tools");
  /* Les explications « ? » et le bouton de visite, montrés sur une fenêtre du système. */
  const demo = { window: "demo", open: menuWindow("combatMenu") };
  return tourOf("Tools", [
    s("Intro"),
    m("Undo", "undoMenu"),
    m("Checker", "checkerMenu", "sbe-checker"),
    m("Demo", "demoMenu", "sbe-demo"),
    s("Help", { ...demo, selector: (app) => app?.element?.querySelector(".sbe-help"),
      /* Les « ? » se posent à l'image qui suit l'affichage de la fenêtre : on les attend (1 s au plus). */
      focus: async (app) => {
        for (let i = 0; i < 10 && !app?.element?.querySelector(".sbe-help"); i++) await new Promise(r => { setTimeout(r, 100); });
      } }),
    s("TourButton", { ...demo, selector: (app) => app?.element?.querySelector(".sbe-tour-head") }),
    s("Manage", { sidebar: "settings", selector: "#settings button[data-app='tours']" }),
    s("End")
  ], "outils");
}

/** Les visites par famille, dans l'ordre du sommaire : [id, config]. */
export function familyTours() {
  return [
    ["build", buildTour()],
    ["combat", combatTour()],
    ["effects", effectsTour()],
    ["world", worldTour()],
    ["look", lookTour()],
    ["tools", toolsTour()]
  ];
}
