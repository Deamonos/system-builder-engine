/**
 * SBE — Visites guidées : le MOTEUR
 *
 * Une visite SBE est une visite de Foundry (projecteur, bulle, précédent /
 * suivant, reprise, liste « Gestion des présentations ») qui sait en plus,
 * pour chaque étape :
 *  - sidebar  : ouvrir un onglet de la barre latérale ;
 *  - control  : activer un groupe d'outils de la scène ({ control, tool }) ;
 *  - open     : ouvrir une fenêtre (fonction qui rend l'application) ; elle
 *               reste ouverte tant que les étapes suivantes portent la même
 *               clé `window`, et se ferme ensuite ;
 *  - preview  : montrer un module en aperçu (tour-previews) ;
 *  - when     : l'étape n'existe que si cette fonction rend vrai ;
 *  - selector : sélecteur CSS, fonction qui rend l'élément (ou une liste
 *               d'éléments : le projecteur les entoure ensemble), ou
 *               « @window » (la fenêtre ouverte par l'étape) ;
 *  - side     : côté de la bulle (UP, DOWN, LEFT, RIGHT) ; absent, il est
 *               choisi d'après la place de la cible à l'écran ;
 *  - html     : fonction qui construit le texte au moment de l'afficher ;
 *  - clearView: les fenêtres ouvertes s'effacent le temps de l'étape
 *               (étape qui montre la scène).
 * Option de visite `returnTo` { tour, step } : finie par « Terminer », la
 * visite rouvre cette étape d'une autre visite (le sommaire).
 * La bulle prend le thème de SBE (sombre ou clair). Un bouton
 * `data-sbe-tour="clé"` dans le texte lance une autre visite (sommaire).
 * Une visite `startup` (lancée à l'ouverture du monde) porte la case « Ne
 * plus afficher au démarrage », liée au réglage de l'utilisateur.
 */

import { isKnownPage } from "../docs/docs-links.mjs";
import { SYSTEM_ID, SYSTEM_PATH } from "../../helpers/constants.mjs";
import { showPreview, hidePreview } from "./tour-previews.mjs";

const Tour = foundry.nue.Tour;
const CLASS = "sbe-tour";
const LOGO = `${SYSTEM_PATH}/assets/sbe-logo.svg`;
/** Réglage « Ne plus afficher au démarrage » (propre à chaque utilisateur). */
export const TOUR_SKIP = "tourSkipStartup";

export class SBETour extends Tour {

  /**
   * Fenêtres de la visite : clé → { app, child, borrowed }. `child` = une
   * fenêtre ouverte depuis `app` (étape `child`) ; `borrowed` = fenêtre déjà
   * ouverte par le MJ avant la visite : montrée, jamais fermée.
   */
  #apps = new Map();
  /** Aperçu affiché. */
  #preview = null;
  /** Cadre posé sur plusieurs éléments visés ensemble. */
  #zone = null;
  /** Liste des étapes figée au lancement (une condition qui change en cours de route ne décale pas la visite). */
  #list = null;
  /** Pas en cours : un seul à la fois (double-clic sur « Suivant »). */
  #busy = null;
  /** La visite a été quittée pendant un pas : il ne s'affiche pas. */
  #stopped = false;
  /** Étape affichée au centre faute de cible trouvée. */
  #fallback = false;
  /** L'interface du MJ avant la visite (onglet, outils), rendue à la fin. */
  #ui = null;
  /** La cible décrite par la bulle (lien d'accessibilité retiré à la fin de l'étape). */
  #described = null;
  /** Suivi de la cible qui bouge (fenêtre qui se place, se redimensionne). */
  #followTimer = null;
  /** Ce que l'étape précédente a posé (voile, blocage, bulle), retiré une fois la suivante affichée. */
  #prev = null;
  /** L'étape affichée a sa bulle dans l'info-bulle de Foundry (sinon : au centre). */
  #onTooltip = false;
  /** La bulle est déjà apparue dans cette visite (l'animation d'entrée ne se rejoue pas). */
  #entered = false;
  /** Fin de visite par un bouton du sommaire qui en lance une autre. */
  #chained = false;

  /**
   * La cible bouge ou change de taille après l'affichage (fenêtre qui se
   * cale, écran redimensionné) : le projecteur et la bulle la suivent.
   * Quatre mesures par seconde, le temps de l'étape.
   */
  #follow(bubble, target, side) {
    clearInterval(this.#followTimer);
    const key = () => { const r = target.getBoundingClientRect(); return `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)},${window.innerWidth},${window.innerHeight}`; };
    let last = key();
    this.#followTimer = setInterval(() => {
      if (!target.isConnected || !this.fadeElement) return;
      const now = key();
      if (now === last) return;
      last = now;
      const r = target.getBoundingClientRect();
      const pad = Tour.HIGHLIGHT_PADDING;
      Object.assign(this.fadeElement.style, {
        width: `${r.width + pad}px`, height: `${r.height + pad}px`, top: `${r.top - pad / 2}px`, left: `${r.left - pad / 2}px`
      });
      placeBeside(bubble, target, side);
    }, 250);
  }

  /** Étapes : celles du MJ seulement pour le MJ, et celles dont la condition est vraie. */
  get steps() {
    return this.#list ?? this.#compute();
  }

  #compute() {
    return super.steps.filter(s => typeof s.when !== "function" || s.when());
  }

  async start() {
    this.#prepare();
    return super.start();
  }

  /**
   * Lance la visite à une étape précise (bouton d'en-tête d'une fenêtre).
   * @param {string} stepId
   */
  async startAt(stepId) {
    if (Tour.activeTour && Tour.activeTour !== this) Tour.activeTour.exit();
    await this.reset();
    this.#prepare();
    const index = Math.max(0, this.steps.findIndex(s => s.id === stepId));
    return this.progress(index);
  }

  #prepare() {
    this.#entered = false;
    this.#list = this.#compute();
    this.#ui ??= { tab: ui.sidebar?.tabGroups?.primary, control: ui.controls?.control?.name, tool: ui.controls?.tool?.name };
  }

  /** La fenêtre de l'étape en cours (celle ouverte depuis une autre d'abord). */
  #currentApp() {
    const entry = this.#apps.get(this.currentStep?.window ?? this.currentStep?.id);
    return entry?.child ?? entry?.app ?? null;
  }

  _getTargetElement(selector) {
    if (selector === "@window") return this.#currentApp()?.element ?? null;
    if (typeof selector === "function") {
      const found = selector(this.#currentApp());
      return Array.isArray(found) ? this.#zoneOver(found) : (found ?? null);
    }
    return super._getTargetElement(selector);
  }

  async _preStep() {
    await super._preStep();
    const step = this.currentStep;
    if (typeof step.html === "function") step.content = step.html();
    if (step.sidebar && ui.sidebar?.tabGroups?.primary !== step.sidebar) {
      await ui[step.sidebar]?.activate?.();
      await quick();
    }
    if (step.control && canvas.scene) {
      ui.controls.activate({ control: step.control.control, tool: step.control.tool });
      await quick();
    }
    /* Fenêtres d'une autre étape : fermées. */
    const key = step.open ? (step.window ?? step.id) : null;
    for (const [k, entry] of [...this.#apps]) {
      if (k === key) continue;
      this.#apps.delete(k);
      await closeEntry(entry);
    }
    if (key) {
      let entry = this.#apps.get(key);
      if (!entry?.app?.rendered) {
        if (entry) await closeEntry(entry);
        entry = { ...asOpened(await step.open()), child: null };
        if (entry.app) this.#apps.set(key, entry);
        else this.#apps.delete(key);
      }
      /* Fenêtre ouverte depuis celle-ci (ex. réglages d'un composant). */
      if (step.child && entry.app && !entry.child?.rendered) {
        entry.child = (await step.child(entry.app)) ?? null;
        await quick();
      } else if (!step.child && entry.child) {
        await entry.child.close?.({ animate: false });
        entry.child = null;
      }
      await step.focus?.(entry.child ?? entry.app);
      await quick();
    }
    /* Étape sur la scène : les fenêtres ouvertes s'effacent le temps de l'étape. */
    document.body.classList.toggle("sbe-tour-clear", !!step.clearView);
    if (this.#preview && this.#preview !== step.preview) await hidePreview(this.#preview);
    if (step.preview && this.#preview !== step.preview) {
      this.#preview = (await showPreview(step.preview)) ? step.preview : null;
      await quick();
    } else if (!step.preview) this.#preview = null;
  }

  /**
   * Fin d'une étape. Le voile, le blocage et la bulle de l'étape ne
   * partent pas ici : ils restent affichés jusqu'à ce que l'étape suivante
   * ait posé les siens (#dropPrev), sinon l'écran clignote à chaque
   * « Suivant » (le fond translucide disparaissait puis revenait).
   */
  async _postStep() {
    clearInterval(this.#followTimer);
    this.#followTimer = null;
    this.#described?.removeAttribute("aria-describedby");
    this.#described = null;
    this.#zone?.remove();
    this.#zone = null;
    const centered = this.#fallback || (this.currentStep && !this.currentStep.selector);
    this.#dropPrev();
    this.#prev = { fade: this.fadeElement, overlay: this.overlayElement, aside: centered ? this.targetElement : null, tooltip: !centered };
    this.fadeElement = undefined;
    this.overlayElement = undefined;
    this.#fallback = false;
  }

  /**
   * Retire ce que l'étape précédente avait posé. `all` : fin de la visite
   * (la bulle d'info-bulle part aussi).
   */
  #dropPrev(all = false) {
    const p = this.#prev;
    this.#prev = null;
    if (p) {
      p.fade?.remove();
      p.overlay?.remove();
      p.aside?.remove();
    }
    /* La bulle d'info-bulle de l'étape précédente : remplacée par la
       nouvelle, ou retirée si la nouvelle est au centre (ou fin). */
    if (all || (p?.tooltip && !this.#onTooltip)) {
      game.tooltip?.tooltip?.classList.remove(CLASS, "sbe-tour-enter");
      game.tooltip?.deactivate();
    }
  }

  async _renderStep() {
    if (this.#stopped) return;
    const step = this.currentStep;
    if (step.selector && this.targetElement) step.tooltipDirection = step.side ?? sideFor(this.targetElement);
    /* Cible absente (module retiré, fenêtre refusée) : l'étape s'affiche au centre au lieu de couper la visite. */
    if (step.selector && !this.targetElement) {
      const selector = step.selector;
      step.selector = null;
      try { await super._renderStep(); } finally { step.selector = selector; }
      this.#fallback = true;
    }
    else await super._renderStep();
    const bubble = step.selector && !this.#fallback ? game.tooltip.tooltip : this.targetElement;
    this.#onTooltip = bubble === game.tooltip.tooltip;
    /* L'étape est posée : ce qui restait de la précédente part maintenant (pas de clignotement). */
    this.#dropPrev();
    if (!bubble) return;
    /* La bulle tient tant que l'étape dure : Foundry la retire quand la
       souris quitte la cible (une grande fenêtre ouverte sous le curseur
       la faisait disparaître au premier mouvement). Sans élément suivi,
       la sortie de la cible ne la touche plus ; _postStep la retire. */
    if (bubble === game.tooltip.tooltip && game.tooltip.element) {
      this.#described = game.tooltip.element;
      game.tooltip.element = null;
    }
    /* Le thème de SBE : sombre ou clair, comme les fenêtres. */
    const light = schemeIsLight();
    bubble.classList.add(CLASS);
    if (!this.#entered) {
      bubble.classList.add("sbe-tour-enter");
      this.#entered = true;
    }
    bubble.classList.toggle("theme-light", light);
    bubble.classList.toggle("theme-dark", !light);
    dress(bubble, { n: this.stepIndex + 1, total: this.steps.length, last: !this.hasNext, first: !this.hasPrevious });
    if (this.config.startup && game.user.isGM) skipBox(bubble);
    /* Le projecteur : bord arrondi et halo qui respire autour de la cible. */
    this.fadeElement?.classList.add("sbe-tour-spot");
    /* La bulle à côté de la cible, jamais dessus (mesurée une fois remplie). */
    if (step.selector && !this.#fallback && this.targetElement) {
      placeBeside(bubble, this.targetElement, step.tooltipDirection);
      this.#follow(bubble, this.targetElement, step.tooltipDirection);
    }
    /* Dernière bulle : « Lire la documentation » du sujet de la visite. */
    if (!this.hasNext && this.config.docPage && isKnownPage(this.config.docPage) && !bubble.querySelector(".sbe-tour-doc")) {
      const a = document.createElement("a");
      a.className = "sbe-tour-doc";
      a.innerHTML = `<i class="fa-solid fa-book"></i> ${foundry.utils.escapeHTML(game.i18n.localize("SBE.Docs.TourLink"))}`;
      a.addEventListener("click", async (ev) => {
        ev.preventDefault();
        const { DocsManager } = await import("../docs/docs-manager.mjs");
        DocsManager.open(this.config.docPage);
      });
      (bubble.querySelector(".tour-content, .step-content") ?? bubble).append(a);
    }
    for (const b of bubble.querySelectorAll("[data-sbe-tour]")) {
      b.addEventListener("click", async (ev) => {
        ev.preventDefault();
        const next = game.tours.get(b.dataset.sbeTour);
        if (!next) return;
        this.#chained = true;
        await this.complete();
        await next.reset();
        next.start();
      });
    }
  }

  /** Un pas à la fois : un clic de plus pendant qu'un pas s'installe est ignoré. */
  progress(stepIndex) {
    if (this.#busy) return this.#busy;
    this.#stopped = false;
    this.#busy = (async () => {
      try { await super.progress(stepIndex); }
      finally { this.#busy = null; }
      if (Tour.activeTour !== this || this.#stopped) await this.#cleanup();
      /* Visite finie par « Terminer » (pas quittée) : retour à la bulle
         indiquée (le sommaire des visites). */
      const back = this.config.returnTo;
      if (back && !this.#stopped && this.status === Tour.STATUS.COMPLETED && !Tour.activeTour) {
        game.tours.get(back.tour)?.startAt(back.step);
      } else if (!back && !this.#stopped && !this.#chained && this.status === Tour.STATUS.COMPLETED && !Tour.activeTour) {
        /* Visite vraiment terminée (ni quittée, ni enchaînée sur une autre) :
           ce qui doit suivre (la fenêtre de la démo après « Découvrir SBE »). */
        try { await this.config.onDone?.(); } catch (err) { console.warn("SBE | Visite : suite en échec", err); }
      }
      this.#chained = false;
    })();
    return this.#busy;
  }

  exit() {
    this.#stopped = true;
    super.exit();
    this.#dropPrev(true);
    if (!this.#busy) this.#cleanup();
  }

  /** Un cadre invisible qui entoure plusieurs éléments : le projecteur le vise. */
  #zoneOver(elements) {
    const rects = elements.filter(Boolean).map(e => e.getBoundingClientRect()).filter(r => r.width || r.height);
    if (!rects.length) return null;
    const zone = document.createElement("div");
    zone.className = "sbe-tour-zone";
    const left = Math.min(...rects.map(r => r.left)), top = Math.min(...rects.map(r => r.top));
    Object.assign(zone.style, {
      left: `${left}px`, top: `${top}px`,
      width: `${Math.max(...rects.map(r => r.right)) - left}px`, height: `${Math.max(...rects.map(r => r.bottom)) - top}px`
    });
    document.body.append(zone);
    this.#zone?.remove();
    this.#zone = zone;
    return zone;
  }

  /** Tout ce que la visite a ouvert est refermé. */
  async #cleanup() {
    const entries = [...this.#apps.values()];
    this.#apps.clear();
    for (const entry of entries) await closeEntry(entry);
    this.#zone?.remove();
    this.#zone = null;
    const preview = this.#preview;
    this.#preview = null;
    if (preview) await hidePreview(preview);
    /* Le voile et la bulle d'un pas affiché malgré une sortie : retirés. */
    if (this.#stopped && Tour.activeTour !== this) {
      this.fadeElement?.remove();
      this.fadeElement = undefined;
      this.overlayElement?.remove();
      this.overlayElement = undefined;
      if (this.#fallback || (this.currentStep && !this.currentStep.selector)) this.targetElement?.remove();
      this.#fallback = false;
    }
    this.#dropPrev(true);
    this.#entered = false;
    this.#list = null;
    document.body.classList.remove("sbe-tour-clear");
    await this.#restoreUI();
  }

  /** L'onglet et les outils que le MJ avait avant la visite. */
  async #restoreUI() {
    const prior = this.#ui;
    this.#ui = null;
    if (!prior) return;
    if (prior.control && canvas.scene && ui.controls?.control?.name !== prior.control) {
      ui.controls.activate({ control: prior.control, tool: prior.tool });
    }
    if (prior.tab && ui.sidebar?.tabGroups?.primary !== prior.tab) await ui[prior.tab]?.activate?.();
  }
}

/** Ce que rend `open` : une application, ou { app, borrowed }. */
function asOpened(r) {
  if (!r) return { app: null, borrowed: false };
  if (r.app !== undefined && !(r instanceof foundry.applications.api.ApplicationV2)) return { app: r.app ?? null, borrowed: !!r.borrowed };
  return { app: r, borrowed: false };
}

/** Ferme ce que la visite a ouvert (pas une fenêtre que le MJ avait déjà). */
async function closeEntry(entry) {
  if (!entry) return;
  /* Sans animation : l'étape suivante s'affiche tout de suite. */
  await entry.child?.close?.({ animate: false });
  if (!entry.borrowed) await entry.app?.close?.({ animate: false });
}

/**
 * Étape « fenêtre d'un menu des réglages » : `open` qui ouvre le menu
 * `key` du système, ou reprend sa fenêtre si elle est déjà ouverte.
 * Les menus qui ouvrent une autre fenêtre (lanceurs) se reconnaissent à
 * l'id de cette fenêtre (`appId`).
 * @param {string} key      clé du menu (game.settings.menus)
 * @param {string} [appId]  id de la fenêtre ouverte, pour un lanceur
 * @param {Function} [prepare]  (app) avant l'affichage : données d'exemple
 */
export function menuWindow(key, appId, prepare = null) {
  return async () => {
    const menu = game.settings.menus.get(`${SYSTEM_ID}.${key}`);
    if (!menu?.type) return null;
    const mine = (a) => a.rendered && (a.constructor === menu.type || (appId && a.id === appId));
    const open = [...foundry.applications.instances.values()].find(mine);
    if (open) {
      open.bringToFront?.();
      return { app: open, borrowed: true };
    }
    const before = new Set(foundry.applications.instances.keys());
    const app = new menu.type();
    prepare?.(app);
    await app.render({ force: true });
    if (app.rendered && app.element) return app;
    /* Un lanceur : sa fenêtre arrive un peu après. */
    for (let i = 0; i < 20; i++) {
      await settle(100);
      const found = [...foundry.applications.instances.values()].find(x => !before.has(x.id) && mine(x));
      if (found) return found;
    }
    return null;
  };
}

/** Le côté de la bulle qui ne cache pas la cible : vers le centre de l'écran. */
function sideFor(el) {
  const r = el.getBoundingClientRect();
  const x = (r.left + r.right) / 2 / window.innerWidth;
  const y = (r.top + r.bottom) / 2 / window.innerHeight;
  if (x > 0.66) return "LEFT";
  if (x < 0.33) return "RIGHT";
  return y < 0.5 ? "DOWN" : "UP";
}

/**
 * Habille la bulle de Foundry : logo de SBE et pastille d'étape dans l'en-tête,
 * barre de progression, boutons « Précédent / Suivant / Terminer » écrits
 * (les éléments de Foundry sont gardés : leurs clics restent branchés).
 */
function dress(bubble, { n, total, last, first }) {
  const L = (k) => game.i18n.localize(k);
  const title = bubble.querySelector(".step-title");
  if (title && !title.querySelector(".sbe-tour-logo")) title.insertAdjacentHTML("afterbegin", `<img class="sbe-tour-logo" src="${LOGO}" alt="">`);
  const header = bubble.querySelector(".step-header");
  if (header && !header.querySelector(".sbe-tour-chip")) header.insertAdjacentHTML("beforeend", `<span class="sbe-tour-chip">${n} / ${total}</span>`);
  const footer = bubble.querySelector(".step-controls");
  if (footer && !bubble.querySelector(".sbe-tour-bar")) {
    footer.insertAdjacentHTML("beforebegin", `<div class="sbe-tour-bar" role="progressbar" aria-valuemin="1" aria-valuemax="${total}" aria-valuenow="${n}"><i style="width:${Math.round(n / total * 100)}%"></i></div>`);
  }
  const progress = bubble.querySelector(".progress");
  if (progress) progress.setAttribute("aria-label", game.i18n.format("SBE.Tour.Progress", { n, total }));
  const prev = bubble.querySelector('.step-button[data-action="previous"]');
  if (prev) {
    prev.innerHTML = first ? "" : `<i class="fa-solid fa-arrow-left"></i><span>${L("SBE.Tour.Previous")}</span>`;
    prev.classList.toggle("is-empty", first);
  }
  const next = bubble.querySelector('.step-button[data-action="next"], .step-button[data-action="complete"]');
  if (next) next.innerHTML = last ? `<span>${L("SBE.Tour.Finish")}</span><i class="fa-solid fa-check"></i>` : `<span>${L("SBE.Tour.Next")}</span><i class="fa-solid fa-arrow-right"></i>`;
  bubble.querySelector('.step-button[data-action="exit"]')?.setAttribute("aria-label", L("SBE.Tour.Exit"));
}

/** La case « Ne plus afficher au démarrage » (réglage propre au MJ). */
function skipBox(bubble) {
  const footer = bubble.querySelector(".step-controls");
  if (!footer || bubble.querySelector(".sbe-tour-skip")) return;
  const on = !!game.settings.get(SYSTEM_ID, TOUR_SKIP);
  footer.insertAdjacentHTML("afterend", `<label class="sbe-tour-skip"><input type="checkbox" ${on ? "checked" : ""}><span>${game.i18n.localize("SBE.Tour.Startup.Skip")}</span></label>`);
  bubble.querySelector(".sbe-tour-skip input").addEventListener("change", (ev) => game.settings.set(SYSTEM_ID, TOUR_SKIP, ev.currentTarget.checked));
}

/** Pose la bulle du côté voulu de la cible, dans l'écran. */
function placeBeside(bubble, target, side) {
  const r = target.getBoundingClientRect();
  const b = bubble.getBoundingClientRect();
  const GAP = 14, M = 8;
  const clampX = (x) => Math.min(Math.max(M, x), window.innerWidth - b.width - M);
  const clampY = (y) => Math.min(Math.max(M, y), window.innerHeight - b.height - M);
  const cx = r.left + r.width / 2 - b.width / 2;
  const cy = r.top + r.height / 2 - b.height / 2;
  const at = {
    LEFT: [r.left - b.width - GAP, cy], RIGHT: [r.right + GAP, cy],
    UP: [cx, r.top - b.height - GAP], DOWN: [cx, r.bottom + GAP]
  }[side] ?? [cx, r.bottom + GAP];
  Object.assign(bubble.style, { left: `${clampX(at[0])}px`, top: `${clampY(at[1])}px`, right: "auto", bottom: "auto" });
}

/** Le thème des fenêtres de ce poste est-il clair ? */
function schemeIsLight() {
  const pref = game.settings.get("core", "uiConfig")?.colorScheme?.applications;
  if (pref) return pref === "light";
  return matchMedia("(prefers-color-scheme: light)").matches;
}

/**
 * Le temps qu'une fenêtre ou un onglet s'affiche : deux images (ou
 * 120 ms au plus si le navigateur ne dessine pas). La bulle suit ensuite
 * la cible si elle bouge encore (#follow) : pas besoin d'attendre plus.
 */
function quick() {
  return new Promise(r => {
    requestAnimationFrame(() => requestAnimationFrame(r));
    setTimeout(r, 120);
  });
}

/** Une attente fixe (lanceurs qui ouvrent leur fenêtre un peu après). */
function settle(ms = 200) {
  return new Promise(r => { setTimeout(r, ms); });
}
