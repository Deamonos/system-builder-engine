/**
 * SBE — CARROUSEL DE COMBAT : branchements
 *
 * Le carrousel suit le combat de la scène vue (création, tours, rounds,
 * combattants, jetons, personnages, effets) et se replace quand l'interface
 * change (taille de l'écran, colonne de droite repliée, horloge déplacée,
 * navigation des scènes).
 */

import { SBECarousel } from "./carousel-app.mjs";
import { applyRules } from "./carousel-rules.mjs";
import { applyCarouselTheme } from "./carousel-theme.mjs";
import { carouselSettings, migrateCarouselEnabled } from "./carousel-model.mjs";
import { registerPreview } from "../tours/tour-previews.mjs";

const COMBAT_HOOKS = ["createCombat", "updateCombat", "deleteCombat", "createCombatant", "updateCombatant", "deleteCombatant", "canvasReady"];
const DOC_HOOKS = ["updateToken", "updateActor", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect"];

export class CarouselManager {

  static #timer = null;
  static #clockObs = null;

  static init() {
    /* Visites guidées : le carrousel en aperçu, sur un combat d'exemple. */
    registerPreview("carousel", { show: () => SBECarousel.setPreview(sampleCombat()), hide: () => SBECarousel.setPreview(null) });
    Hooks.once("ready", () => {
      migrateCarouselEnabled().catch(err => console.warn("SBE | Carrousel : reprise de l'activation en échec", err));
      applyCarouselTheme(carouselSettings().theme);
      for (const h of COMBAT_HOOKS) {
        Hooks.on(h, () => {
          this.refresh();
          if (h === "createCombatant") this.rulesSoon(SBECarousel.realCombat());
        });
      }
      /* Un jeton ou un personnage en combat change (image, nom, valeurs). */
      for (const h of DOC_HOOKS) {
        Hooks.on(h, (doc) => {
          const combat = SBECarousel.realCombat();
          /* Un effet : son personnage (ou celui qui porte l'objet de l'effet). */
          const owner = doc.documentName === "ActiveEffect" ? (doc.parent?.documentName === "Actor" ? doc.parent : doc.parent?.parent) : doc;
          const actor = owner?.documentName === "Actor" ? owner : null;
          if (combat?.combatants.some(c => (actor ? c.actor === actor : c.tokenId === doc.id))) {
            this.refresh();
            this.rulesSoon(combat);
          }
        });
      }
      /* L'interface bouge : on replace. */
      window.addEventListener("resize", () => SBECarousel.place());
      for (const h of ["collapseSidebar", "changeSidebarTab", "renderSceneNavigation"]) Hooks.on(h, () => this.#placeSoon());
      Hooks.on("renderSBEClock", () => { this.#watchClock(); this.#placeSoon(); });
      Hooks.on("closeSBEClock", () => this.#placeSoon());
      this.#watchClock();
      /* La barre latérale s'ouvre ou se replie en s'animant : on suit sa taille. */
      const side = document.getElementById("sidebar");
      if (side) new ResizeObserver(() => SBECarousel.place()).observe(side);
      this.refresh();
    });
  }

  /** Les réglages du MJ ont changé : on redessine et on rejoue ses règles. */
  static settingsChanged() {
    applyCarouselTheme(carouselSettings().theme);
    this.refresh();
    this.rulesSoon(SBECarousel.realCombat());
  }

  /** Redessine (regroupé : plusieurs changements d'un coup = un seul rendu). */
  static refresh() {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => SBECarousel.refresh(), 50);
  }

  static #rulesTimer = null;

  /** Règles du MJ (vaincu, retiré du combat), une fois les changements passés. */
  static rulesSoon(combat) {
    clearTimeout(this.#rulesTimer);
    this.#rulesTimer = setTimeout(() => applyRules(combat).catch(err => console.warn("SBE | Carrousel : règles en échec", err)), 150);
  }

  static #placeSoon() { setTimeout(() => SBECarousel.place(), 60); }

  /** L'horloge déplacée ou repliée : le carrousel se replace. */
  static #watchClock() {
    const el = document.getElementById("sbe-clock");
    this.#clockObs?.disconnect();
    if (!el) return;
    this.#clockObs = new MutationObserver(() => SBECarousel.place());
    this.#clockObs.observe(el, { attributes: true, attributeFilter: ["style", "class"], subtree: true });
  }
}

/** Un combat d'exemple (jamais enregistré) : trois combattants, au round 2. */
function sampleCombat() {
  const L = (k) => game.i18n.localize(k);
  const one = (name, img, initiative) => ({ _id: foundry.utils.randomID(), name: L(name), img, initiative });
  return new Combat.implementation({
    round: 2, turn: 1,
    combatants: [
      one("SBE.Tour.Sample.Hero", "icons/svg/mystery-man.svg", 18),
      one("SBE.Tour.Sample.Foe", "icons/svg/skull.svg", 12),
      one("SBE.Tour.Sample.Ally", "icons/svg/cowled.svg", 7)
    ]
  });
}
