/**
 * SBE — Visites guidées : inscription et lancement au démarrage
 *
 * Les visites de SBE sont rangées avec celles de Foundry (Paramètres →
 * Gestion des présentations). « Découvrir SBE » se lance à chaque ouverture
 * du monde pour un MJ, depuis le début, tant qu'il n'a pas coché « Ne plus
 * afficher au démarrage » dans la bulle ; il la décoche dans les
 * paramètres du système pour la revoir (réglage propre à chaque MJ).
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { SBETour, TOUR_SKIP } from "./sbe-tour.mjs";
import { discoverTour } from "./tour-discover.mjs";
import { familyTours } from "./tour-families.mjs";

export class ToursManager {

  static init() {
    game.settings.register(SYSTEM_ID, TOUR_SKIP, {
      name: "SBE.Tour.Startup.Name",
      hint: "SBE.Tour.Startup.Hint",
      scope: "user",
      config: true,
      restricted: true,
      type: Boolean,
      default: false
    });
    Hooks.once("ready", () => {
      /* Les visites présentent les outils du MJ : un joueur ne les voit pas. */
      if (!game.user.isGM) return;
      game.tours.register(SYSTEM_ID, "discover", new SBETour(discoverTour()));
      for (const [id, config] of familyTours()) game.tours.register(SYSTEM_ID, id, new SBETour(config));
      Hooks.on("renderApplicationV2", (app) => this.#headerButton(app));
      if (!game.settings.get(SYSTEM_ID, TOUR_SKIP)) this.#startSoon();
    });
  }

  /** La visite (et l'étape) qui présente cette fenêtre, s'il y en a une. */
  static #tourFor(app) {
    for (const tour of game.tours.values()) {
      if (tour.namespace !== SYSTEM_ID || !(tour instanceof SBETour)) continue;
      for (const step of tour.config.steps) {
        if (!step.menu) continue;
        const type = game.settings.menus.get(`${SYSTEM_ID}.${step.menu}`)?.type;
        if ((type && app.constructor === type) || (step.appId && app.id === step.appId)) return { tour, step };
      }
    }
    return null;
  }

  /** Bouton d'en-tête « Visite guidée » sur une fenêtre qu'une visite présente. */
  static #headerButton(app) {
    const header = app.window?.header ?? app.element?.querySelector(".window-header");
    if (!header || header.querySelector(".sbe-tour-head")) return;
    const found = this.#tourFor(app);
    if (!found) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "header-control icon fa-solid fa-route sbe-tour-head";
    btn.dataset.tooltip = game.i18n.format("SBE.Tour.HeaderButton", { tour: game.i18n.localize(found.tour.title) });
    btn.setAttribute("aria-label", btn.dataset.tooltip);
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      found.tour.startAt(found.step.id);
    });
    const before = header.querySelector('[data-action="toggleControls"], [data-action="close"]');
    header.insertBefore(btn, before ?? null);
  }

  /** Lancée après une visite déjà en cours (celle de Foundry). */
  static #startSoon() {
    const tick = async () => {
      if (foundry.nue.Tour.tourInProgress) { setTimeout(tick, 500); return; }
      if (game.settings.get(SYSTEM_ID, TOUR_SKIP)) return;
      const tour = game.tours.get(`${SYSTEM_ID}.discover`);
      await tour?.reset();
      tour?.start();
    };
    setTimeout(tick, 200);
  }
}
