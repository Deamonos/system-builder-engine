/**
 * SBE — Visite « Découvrir SBE » (premier lancement, MJ)
 *
 * Vue d'ensemble : modèles, réglages du système, outils de la scène,
 * horloge, carrousel (en aperçu s'il n'est pas activé), historique, puis
 * le sommaire des autres visites.
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { menuWindow } from "./sbe-tour.mjs";

const K = "SBE.Tour.Discover";
const esc = (x) => foundry.utils.escapeHTML(String(x ?? ""));

/** Le sommaire : les autres visites de SBE (s'il y en a). */
function summary() {
  const others = [...game.tours.values()].filter(t => t.namespace === SYSTEM_ID && t.id !== "discover");
  const list = others.length
    ? `<span class="sbe-tour-list">${others.map(t => {
      /* Une visite déjà terminée porte une coche. */
      const done = t.status === foundry.nue.Tour.STATUS.COMPLETED;
      return `<button type="button" data-sbe-tour="${esc(t.key)}"${done ? ' class="is-done"' : ""}><i class="fa-solid fa-route"></i> ${esc(t.title)}${done ? ' <i class="fa-solid fa-check sbe-tour-done"></i>' : ""}</button>`;
    }).join("")}</span>`
    : "";
  return `${game.i18n.localize(`${K}.EndBody`)}\n${list}${game.i18n.localize(`${K}.EndHelp`)}`;
}

/** Liens de la bulle d'accueil : feuille de route et serveur Discord. */
const LINKS = [
  ["https://claude.ai/artifact/HWMjKciPgGM8A1DWJVFKNi", "fa-solid fa-map", `${K}.Roadmap`],
  ["https://discord.gg/kUY28T8rHj", "fa-brands fa-discord", `${K}.Discord`]
];

/** L'accueil : le texte, puis les liens (ouverts dans le navigateur). */
function welcome() {
  const links = LINKS.map(([url, icon, key]) =>
    `<a class="sbe-tour-link" href="${esc(url)}" target="_blank" rel="noopener"><i class="${icon}"></i> ${esc(game.i18n.localize(key))}</a>`).join("");
  return `${game.i18n.localize(`${K}.WelcomeBody`)}\n<span class="sbe-tour-links">${links}</span>`;
}

/** Une étape : titre et texte traduits d'après son id. */
const step = (id, extra = {}) => ({ id, title: `${K}.${id}Title`, content: `${K}.${id}Body`, ...extra });

export function discoverTour() {
  return {
    title: `${K}.Title`,
    description: `${K}.Description`,
    canBeResumed: true,
    display: true,
    /* Case « Ne plus afficher au démarrage » dans la bulle. */
    startup: true,
    docPage: "bienvenue",
    /* Terminée : la démo Brumeval est proposée (si elle n'est pas déjà là). */
    onDone: async () => {
      if (!game.user.isGM) return;
      const { DemoManager, SBEDemoApp } = await import("../demo/demo-manager.mjs");
      if (DemoManager.isInstalled() || !DemoManager.packOf()) return;
      (foundry.applications.instances.get("sbe-demo") ?? new SBEDemoApp()).render({ force: true });
    },
    steps: [
      step("Welcome", { restricted: true, html: welcome }),
      step("Templates", { restricted: true, sidebar: "actors", selector: "#actors button[data-action='createEntry']" }),
      step("Import", { restricted: true, sidebar: "actors", selector: "#actors .sbe-import-template",
        when: () => !!document.querySelector("#actors .sbe-import-template") }),
      step("Items", { restricted: true, sidebar: "items", selector: "#items button[data-action='createEntry']" }),
      step("Settings", { restricted: true, sidebar: "settings", selector: "#settings button[data-app='configure']" }),
      step("Managers", {
        restricted: true, window: "settings",
        open: async () => {
          const app = new foundry.applications.settings.SettingsConfig();
          await app.render({ force: true });
          return app;
        },
        focus: (app) => app?.changeTab?.("system", "categories"),
        selector: () => document.querySelector("#settings-config section[data-tab='system']")
      }),
      step("Tools", { restricted: true, control: { control: "tokens", tool: "select" },
        selector: () => [...document.querySelectorAll("#scene-controls-tools [data-tool^='sbe']")],
        when: () => !!canvas.scene }),
      step("Clock", { restricted: true, preview: "clock", selector: ".sbe-clock" }),
      step("Carousel", { restricted: true, preview: "carousel", selector: "#sbe-carousel", clearView: true }),
      step("Undo", { restricted: true, window: "undo", open: menuWindow("undoMenu"), selector: "@window" }),
      { id: "End", title: `${K}.EndTitle`, content: "", html: summary, restricted: true }
    ]
  };
}
