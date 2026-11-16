/**
 * SBE — MANAGER D'IDENTITÉ (masquage des noms côté joueurs)
 *
 * Approche « À LA SOURCE », comme l'ancien système, mais élargie :
 * sur le poste d'un JOUEUR, le nom d'un personnage masqué est remplacé
 * directement dans les données préparées (jamais enregistré) :
 *   - Actor.name      → fiches, répertoire, tout module qui lit l'acteur ;
 *   - Token.name      → étiquette du pion, info-bulles, HUD ;
 *   - Combatant.name  → suivi de combat natif, carrousels de combat et
 *                       tout module qui lit le combattant.
 * Un module tiers lit donc DÉJÀ « Inconnu » sans rien savoir de nous.
 *
 * Le chat est filtré au rendu : l'orateur, les participants des cartes
 * SBE (Identity.of), et le TEXTE de tout message (y compris d'autres
 * modules) où apparaît le vrai nom d'un personnage masqué.
 *
 * Le MJ voit toujours tout, et dispose d'un bouton œil dans l'en-tête
 * de la fiche pour révéler / masquer.
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { Identity, IDENTITY_FLAG } from "../../helpers/identity.mjs";

export class IdentityManager {

  /* ============================================================ */
  /*  Masquage à la source                                         */
  /* ============================================================ */

  /** Pose le nom à montrer sur un document préparé (poste joueur). */
  static mask(doc) {
    try {
      if (!doc || !game.user || game.user.isGM) return;
      /* Vrai nom : celui posé par Foundry, sauf si c'est NOTRE masque. */
      const real = (doc._sbeIdMasked && doc.name === doc._sbeIdShown) ? doc._sbeIdReal : doc.name;
      const actor = Identity.actorOf(doc);
      if (Identity.isHiddenFor(actor)) {
        const shown = Identity.unknownLabel();
        doc._sbeIdReal = real;
        doc._sbeIdShown = shown;
        doc._sbeIdMasked = true;
        doc.name = shown;
      } else if (doc._sbeIdMasked) {
        doc.name = real;
        doc._sbeIdMasked = false;
      }
    } catch (_e) { /* ne jamais casser la préparation d'un document */ }
  }

  /** Enveloppe prepareDerivedData d'une classe de document. */
  static #wrap(cls) {
    const proto = cls?.prototype;
    if (!proto || proto.__sbeIdentityWrapped) return;
    const orig = proto.prepareDerivedData;
    proto.prepareDerivedData = function (...args) {
      if (typeof orig === "function") orig.apply(this, args);
      IdentityManager.mask(this);
    };
    proto.__sbeIdentityWrapped = true;
  }

  /** Re-masque tout (au démarrage, quand les joueurs sont connus). */
  static refreshAll() {
    if (!game.user || game.user.isGM) return;
    for (const a of game.actors ?? []) this.mask(a);
    for (const scene of game.scenes ?? []) {
      for (const t of scene.tokens ?? []) { this.mask(t); if (t.actor) this.mask(t.actor); }
    }
    for (const combat of game.combats ?? []) for (const c of combat.combatants ?? []) this.mask(c);
  }

  /* ============================================================ */
  /*  Rafraîchissement de l'affichage                              */
  /* ============================================================ */

  /** Après une révélation : étiquettes, combat, répertoire, chat. */
  static async refreshDisplays() {
    this.refreshAll();
    for (const t of canvas?.tokens?.placeables ?? []) {
      try {
        if (t.nameplate && t.nameplate.text !== t.document.name) t.nameplate.text = t.document.name;
      } catch (_e) { /* pion non dessiné */ }
    }
    try { ui.combat?.render?.(); } catch (_e) { /* */ }
    try { ui.actors?.render?.(); } catch (_e) { /* */ }
    /* Les messages déjà affichés sont redessinés (le texte masqué ne
       peut pas être « dé-masqué » sur place). */
    for (const li of document.querySelectorAll("li.chat-message[data-message-id]")) {
      const msg = game.messages?.get(li.dataset.messageId);
      if (!msg) continue;
      try { li.replaceWith(await msg.renderHTML()); } catch (_e) { /* */ }
    }
  }

  /* ============================================================ */
  /*  Chat : texte des messages (y compris d'autres modules)       */
  /* ============================================================ */

  /** Noms masqués à remplacer, et noms visibles à protéger. */
  static #nameMaps(message) {
    const hidden = new Set(), visible = new Set();
    const consider = (doc) => {
      const actor = Identity.actorOf(doc);
      const n = Identity.realName(doc);
      if (!n) return;
      (Identity.isHiddenFor(actor) ? hidden : visible).add(n);
    };
    for (const a of game.actors ?? []) consider(a);
    for (const t of canvas?.scene?.tokens ?? []) { consider(t); if (t.actor) consider(t.actor); }
    try {
      const sp = message?.speaker ?? {};
      const tok = sp.token ? game.scenes?.get(sp.scene)?.tokens?.get(sp.token) : null;
      if (tok) { consider(tok); if (tok.actor) consider(tok.actor); }
    } catch (_e) { /* */ }
    /* Références écrites dans le message (cartes SBE, boutons d'autres
       modules) : la cible peut être sur une autre scène. */
    const rx = /data-(?:ref|uuid|target-uuid|actor-uuid|token-uuid)="([^"]+)"/g;
    let m;
    const content = String(message?.content ?? "");
    while ((m = rx.exec(content))) {
      try {
        const d = fromUuidSync(m[1]);
        if (d) { consider(d); if (d.actor) consider(d.actor); }
      } catch (_e) { /* */ }
    }
    return { hidden: [...hidden], visible: [...visible] };
  }

  /**
   * Remplace les noms masqués dans les nœuds-texte. Les noms visibles
   * sont dans l'alternance (du plus long au plus court) : « Garde (2) »
   * visible n'est pas touché parce que « Garde » est masqué.
   * On ne touche jamais au HTML (aucune balise cassée).
   */
  static replaceNames(root, { hidden, visible }, repl) {
    if (!root || !hidden.length) return;
    const hiddenSet = new Set(hidden);
    const alt = [...new Set([...hidden, ...visible])].filter(Boolean)
      .sort((a, b) => b.length - a.length)
      .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    let rx;
    try { rx = new RegExp(`(?<![\\p{L}\\p{N}])(${alt})(?![\\p{L}\\p{N}])`, "gu"); }
    catch (_e) { rx = new RegExp(`(${alt})`, "g"); }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const hits = [];
    let n;
    while ((n = walker.nextNode())) { rx.lastIndex = 0; if (rx.test(n.nodeValue)) hits.push(n); }
    for (const t of hits) {
      rx.lastIndex = 0;
      t.nodeValue = t.nodeValue.replace(rx, (_m, g1) => hiddenSet.has(g1) ? repl : g1);
    }
    /* Attributs lus au survol (info-bulles, titres d'images). */
    for (const el of root.querySelectorAll("[title], [data-tooltip], img[alt]")) {
      for (const attr of ["title", "data-tooltip", "alt"]) {
        const v = el.getAttribute(attr);
        if (!v) continue;
        rx.lastIndex = 0;
        if (rx.test(v)) { rx.lastIndex = 0; el.setAttribute(attr, v.replace(rx, (_m, g1) => hiddenSet.has(g1) ? repl : g1)); }
      }
    }
  }

  /* ============================================================ */
  /*  Bouton du MJ sur la fiche                                    */
  /* ============================================================ */

  static headerButton(app) {
    try {
      if (!game.user?.isGM || !Identity.enabled) return;
      const actor = app?.document;
      const header = app?.element?.querySelector?.(".window-header");
      header?.querySelector(".sbe-identity-toggle")?.remove();
      if (!header || !Identity.isHideable(actor)) return;
      const hidden = !Identity.isRevealed(actor);
      const title = game.i18n.localize(hidden ? "SBE.Identity.RevealTitle" : "SBE.Identity.HideTitle");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `header-control icon sbe-identity-toggle ${hidden ? "is-hidden" : "is-revealed"}`;
      btn.innerHTML = `<i class="fa-solid ${hidden ? "fa-user-secret" : "fa-eye"}"></i>`;
      btn.dataset.tooltip = title;
      btn.setAttribute("aria-label", title);
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const a = app.document;
        const reveal = !Identity.isRevealed(a);
        await a.setFlag(SYSTEM_ID, IDENTITY_FLAG, reveal);
        ui.notifications.info(game.i18n.format(reveal ? "SBE.Identity.RevealedMsg" : "SBE.Identity.HiddenMsg", { name: a.name }));
      });
      const titleEl = header.querySelector(".window-title");
      if (titleEl) titleEl.after(btn); else header.prepend(btn);
    } catch (_e) { /* injection non bloquante */ }
  }

  /* ============================================================ */
  /*  Branchements                                                 */
  /* ============================================================ */

  /** À appeler dans « init », APRÈS la déclaration des classes de documents. */
  static init() {
    this.#wrap(CONFIG.Actor?.documentClass);
    this.#wrap(CONFIG.Token?.documentClass);
    this.#wrap(CONFIG.Combatant?.documentClass);

    Hooks.once("ready", () => this.refreshAll());

    /* Révélé / masqué, ou passage d'un joueur propriétaire : tout suit. */
    Hooks.on("updateActor", (actor, changes) => {
      const flagTouched = foundry.utils.hasProperty(changes, `flags.${SYSTEM_ID}.${IDENTITY_FLAG}`);
      if (flagTouched || "ownership" in (changes ?? {}) || "name" in (changes ?? {})) {
        this.refreshDisplays();
        for (const app of foundry.applications.instances?.values?.() ?? []) {
          if (app.document === actor) this.headerButton(app);
        }
      }
    });
    /* Pion non lié : la révélation vit dans son « delta ». */
    Hooks.on("updateToken", (tokenDoc, changes) => {
      if (foundry.utils.hasProperty(changes, `delta.flags.${SYSTEM_ID}`)) this.refreshDisplays();
    });

    /* Pion qui apparaît : étiquette déjà masquée (nom préparé), mais
       un module peut la redessiner avant : on la recale. */
    Hooks.on("refreshToken", (token) => {
      try {
        if (game.user?.isGM || !token?.nameplate) return;
        if (token.nameplate.text !== token.document.name) token.nameplate.text = token.document.name;
      } catch (_e) { /* */ }
    });

    /* Chat : texte de TOUS les messages, sur le poste des joueurs. */
    Hooks.on("renderChatMessageHTML", (message, html) => {
      try {
        if (game.user?.isGM || !Identity.enabled) return;
        const root = html instanceof HTMLElement ? html : html?.[0];
        if (!root) return;
        this.replaceNames(root, this.#nameMaps(message), Identity.unknownLabel());
      } catch (_e) { /* rendu du chat non bloquant */ }
    });
  }
}
