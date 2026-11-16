/**
 * SBE — Panneau d'un OBJET DE SCÈNE (double-clic sur le pion)
 *
 * Deux contenus :
 *  - le PANNEAU DU MODÈLE : ce que le MJ a composé dans l'atelier (zone
 *    « Panneau une fois posé »), rendu comme la fiche — mêmes composants,
 *    mêmes clés, mêmes valeurs ;
 *  - sinon un panneau AUTOMATIQUE : l'image, le nom et les boutons
 *    « une fois posé ».
 * En bas, toujours : Reprendre (si permis), la fiche, et pour le MJ la
 * suppression.
 *
 * Deux formes, au choix du MJ (réglages d'objet de scène) : une
 * FENÊTRE, ou une BULLE accrochée au pion qui suit la carte.
 *
 * Les boutons passent par PropManager.run : le personnage qui interagit
 * en est l'utilisateur. Les champs y sont en lecture : on agit sur
 * l'objet par ses boutons (le MJ garde la fiche).
 */

import { PropManager } from "./prop-manager.mjs";
import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { buildInventory, asCarrier } from "../../builder/inventory.mjs";
import { renderSheet, walkElements, PANEL_ZONE, refTargetOf, autosizeFreeZones, btnIconHTML } from "../../builder/element-renderer.mjs";
import { computeAll } from "../../builder/formula-engine.mjs";
import { contributionsOf } from "../../builder/contributions.mjs";
import { scopeFunctionsOf } from "../../builder/doc-scope.mjs";
import { findAction, unavailableReason } from "../../builder/item-actions.mjs";

const { ApplicationV2 } = foundry.applications.api;

/* Ce qui marche dans le panneau ; les commandes réservées à la fiche. */
const PANEL_ACTIONS = new Set(["execButton", "openButtonMenu", "switchNavTab", "openRef"]);
const SHEET_ONLY = new Set(["clearSlot", "removeRef", "unequip", "dropCarried", "deleteOrphan", "pickImage",
  "pickFieldImage", "editChartValues", "setPip", "pickImgChoice", "waitingItems", "gridSort", "reloadTemplate"]);
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (x) => foundry.utils.escapeHTML(String(x ?? ""));

export class SBEPropPanel extends ApplicationV2 {

  static DEFAULT_OPTIONS = {
    tag: "div",
    classes: ["sbe-prop-panel", "sbe-window"],
    window: { icon: "fa-solid fa-cube", resizable: false },
    position: { width: 320, height: "auto" },
    actions: {
      propRun: SBEPropPanel.#onRun,
      execButton: SBEPropPanel.#onRun,
      openButtonMenu: SBEPropPanel.#onRun,
      switchNavTab: SBEPropPanel.#onNavTab,
      openRef: SBEPropPanel.#onOpenRef,
      propTake: SBEPropPanel.#onTake,
      propSheet: SBEPropPanel.#onSheet,
      propDelete: SBEPropPanel.#onDelete,
      propClose: SBEPropPanel.#onClose,
      propRearm: SBEPropPanel.#onRearm,
      propTrap: SBEPropPanel.#onTrap,
      propTrapOp: SBEPropPanel.#onTrapOp,
      propLinks: SBEPropPanel.#onLinks
    }
  };

  /** Onglet actif de chaque barre de navigation du panneau. */
  _navActive = {};

  /** Raison de chaque bouton grisé (id → texte). */
  #reasons = new Map();

  #hooks = [];
  #onResize = null;

  constructor(options = {}) {
    const td = options.token;
    const cfg = PropManager.tokenCfg(td);
    const bubble = cfg.panelMode === "bubble";
    const width = cfg.panelWidth > 0 ? cfg.panelWidth : 320;
    super(foundry.utils.mergeObject(options, {
      id: `sbe-prop-${td?.id ?? foundry.utils.randomID()}`,
      position: { width },
      ...(bubble ? { window: { frame: false, positioned: true }, classes: ["sbe-prop-panel", "sbe-window", "sbe-prop-bubble"] } : {})
    }, { inplace: false }));
    this.token = td;
    this.bubble = bubble;
  }

  get title() { return this.token?.name ?? L("SBE.Prop.Panel"); }

  /** Les composants de la zone « Panneau une fois posé » du modèle. */
  static panelRoots(item) {
    return (item?.system?.template?.system?.elements ?? []).filter(e => e?.zone === PANEL_ZONE);
  }

  async _renderHTML() {
    const td = this.token;
    const item = PropManager.itemOf(td);
    if (!item) return `<p class="notes">${esc(L("SBE.Prop.Gone"))}</p>`;
    const actor = PropManager.interactor();
    const canUse = PropManager.canUse(td);
    /* Piège : armé ou non (Reprendre attend qu'il soit désamorcé). */
    let TrapManager = null, trapState = null;
    if (PropManager.tokenCfg(td).trOn) {
      ({ TrapManager } = await import("../traps/trap-manager.mjs"));
      if (TrapManager.isTrap(td)) trapState = TrapManager.stateOf(td);
    }
    const roots = SBEPropPanel.panelRoots(item);
    /* En-tête : image et nom (toujours sur le panneau automatique). */
    const withHead = !roots.length || PropManager.tokenCfg(td).panelHead;
    const head = withHead ? `
      <div class="sbe-prop-head">
        <img src="${esc(item.img)}" alt="">
        <span class="sbe-prop-name">${esc(item.name)}</span>
      </div>` : "";
    let body;
    this.#reasons.clear();
    if (roots.length) {
      body = await asCarrier(item, actor, async () => {
        const html = await this.#customHTML(item, roots);
        /* Boutons du panneau : grisés avec leur raison (pas « une fois
           posé », condition fausse, objet d'un autre joueur…). */
        for (const id of html.matchAll(/data-btn-id="([^"]+)"/g)) {
          const el = findAction(item, id[1]);
          const why = !canUse ? L("SBE.Prop.NotYours") : (el ? unavailableReason(item, el) : "");
          if (why) this.#reasons.set(id[1], why);
        }
        return html;
      });
      body = `<div class="sbe-prop-custom">${body}</div>`;
    } else {
      const acts = await PropManager.actions(td);
      /* Piège : son état et ses actions, avant les boutons de l'objet. */
      const trapActs = trapState ? await this.#trapActsHTML(td, item, trapState) : "";
      const btns = acts.length
        ? acts.map(a => `<button type="button" data-action="propRun" data-btn-id="${esc(a.id)}" ${a.disabled || !canUse ? "disabled" : ""}
            ${a.reason ? `data-tooltip-text="${esc(a.reason)}"` : ""}>${a.icon ? `${btnIconHTML(a.icon)} ` : ""}<span>${esc(a.label)}</span></button>`).join("")
        : (trapActs ? "" : `<p class="notes">${esc(L("SBE.Prop.NoActions"))}</p>`);
      body = `${trapActs}<div class="sbe-prop-acts">${btns}</div>`;
    }
    const take = PropManager.canTake(td) && !trapState?.armed
      ? `<button type="button" data-action="propTake" data-tooltip-text="${esc(L("SBE.Prop.Take"))}"><i class="fa-solid fa-hand"></i></button>` : "";
    /* La fiche : le MJ, et le joueur qui peut l'utiliser. */
    const sheet = game.user.isGM || canUse
      ? `<button type="button" data-action="propSheet" data-tooltip-text="${esc(L("SBE.Prop.Sheet"))}"><i class="fa-solid fa-file-lines"></i></button>` : "";
    /* MJ : réarmer l'approche (« une fois par personnage » / « une seule fois »). */
    const ap = PropManager.flagsOf(td).apDone ?? {};
    const rearm = game.user.isGM && PropManager.tokenCfg(td).apOn && (ap.all || ap.actors?.length)
      ? `<button type="button" data-action="propRearm" data-tooltip-text="${esc(L("SBE.Trig.Rearm"))}"><i class="fa-solid fa-rotate-left"></i></button>` : "";
    /* MJ : armer / désarmer un piège. */
    let trap = "";
    if (game.user.isGM && trapState) {
      const armed = trapState.armed;
      trap = `<button type="button" data-action="propTrap" data-tooltip-text="${esc(L(armed ? "SBE.Trap.Disarm" : "SBE.Trap.Rearm"))}"><i class="fa-solid ${armed ? "fa-shield-halved" : "fa-burst"}"></i></button>`;
    }
    /* MJ : les éléments de la scène que cet objet commande. */
    const links = game.user.isGM
      ? `<button type="button" data-action="propLinks" data-tooltip-text="${esc(L("SBE.Scene.LinksBtn"))}"><i class="fa-solid fa-link"></i></button>` : "";
    const del = game.user.isGM
      ? `<button type="button" data-action="propDelete" data-tooltip-text="${esc(L("SBE.Prop.Delete"))}"><i class="fa-solid fa-trash"></i></button>` : "";
    const close = this.bubble
      ? `<button type="button" class="sbe-prop-x" data-action="propClose" data-tooltip-text="${esc(L("SBE.Common.Close"))}"><i class="fa-solid fa-xmark"></i></button>` : "";
    const foot = links || trap || rearm || take || sheet || del
      ? `<div class="sbe-prop-foot">${this.bubble && !withHead ? `<span class="sbe-prop-foot-name">${esc(item.name)}</span>` : ""}${links}${trap}${rearm}${take}${sheet}${del}</div>` : "";
    return `${close}${head}${body}${foot}`;
  }

  /** Panneau automatique d'un piège : son état, puis ses actions (grisées avec leur raison). */
  async #trapActsHTML(td, item, st) {
    const { TrapManager } = await import("../traps/trap-manager.mjs");
    const cfg = PropManager.tokenCfg(td);
    const bits = [L(st.armed ? "SBE.Trap.State.Armed" : "SBE.Trap.State.Disarmed"),
      cfg.trAfter === "charges" ? L("SBE.Trap.State.Charges", { n: st.charges }) : "",
      st.shown ? L("SBE.Trap.State.Shown") : ""].filter(Boolean);
    const icons = { disarm: "fa-screwdriver-wrench", take: "fa-hand", salvage: "fa-box-open", rearm: "fa-rotate-right", camo: "fa-eye-slash" };
    const empty = L("SBE.Trap.Why.Empty");
    const btns = TrapManager.OPS.map(op => {
      const why = TrapManager.opReason(item, op);
      /* Un piège qui ne contient rien n'a pas de contenu à récupérer. */
      if (op === "salvage" && why === empty) return "";
      return `<button type="button" data-action="propTrapOp" data-op="${op}" ${why ? `disabled data-tooltip-text="${esc(why)}"` : ""}>
        <i class="fa-solid ${icons[op]}"></i> <span>${esc(L(`SBE.Trap.Op.${op}`))}</span></button>`;
    }).join("");
    return `<p class="sbe-prop-trapstate ${st.armed ? "is-armed" : "is-off"}">${esc(bits.join(" · "))}</p><div class="sbe-prop-acts">${btns}</div>`;
  }

  /** Le panneau composé dans l'atelier, rendu comme la fiche. */
  async #customHTML(item, roots) {
    const sys = item.system;
    const els = sys.template?.system?.elements ?? [];
    const inventory = buildInventory(item);
    const contributions = contributionsOf(item);
    const { results, breakdown } = computeAll(els, sys.values ?? {}, { inventory, contributions, functions: scopeFunctionsOf(item, contributions) });
    /* Textes riches montrés (directement ou par un composant du modèle). */
    const richEnriched = {};
    for (const e of walkElements(roots)) {
      const el = e.kind === "ref" ? refTargetOf(e, els) : e;
      if (el?.kind !== "richtext" || !el.key || el.key in richEnriched) continue;
      richEnriched[el.key] = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        String(sys.values?.[el.key] ?? ""), { relativeTo: item, secrets: item.isOwner });
    }
    return renderSheet(roots, {
      values: sys.values ?? {},
      isGM: game.user.isGM,
      navActive: this._navActive,
      computedResults: results,
      breakdown,
      activeEffects: [],
      tableSort: {},
      richEnriched,
      docImg: item.img,
      docName: item.name,
      nativeUi: {},
      elements: els,
      live: true,
      inventory,
      gridSorts: item.flags?.[SYSTEM_ID]?.gridSort ?? {},
      hostDoc: item,
      hostId: String(sys.modelId || item.id || ""),
      stackMaxValue: Number(sys.template?.system?.opts?.stackMax ?? 0) || 0
    });
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
    const custom = content.querySelector(".sbe-prop-custom");
    if (custom) {
      /* Lecture seule : on agit par les boutons. */
      for (const f of custom.querySelectorAll("input, select, textarea, prose-mirror")) {
        f.removeAttribute("name");
        f.setAttribute("disabled", "");
      }
      /* Commandes de fiche sans objet ici (vider un slot, retirer, changer
         une image…) : masquées ; le reste devient inerte. */
      for (const c of custom.querySelectorAll("[data-action]")) {
        const act = c.dataset.action;
        if (PANEL_ACTIONS.has(act)) continue;
        c.removeAttribute("data-action");
        if (SHEET_ONLY.has(act)) c.remove();
      }
      for (const b of custom.querySelectorAll("[data-btn-id]")) {
        const why = this.#reasons.get(b.dataset.btnId);
        if (!why) continue;
        b.setAttribute("disabled", "");
        /* La raison au survol de la rangée (un bouton grisé ne reçoit pas
           toujours le survol). */
        (b.closest(".sbe-btn-row") ?? b).dataset.tooltipText = why;
      }
      /* Ce que l'objet contient (l'arme d'un piège) : double-clic = sa fiche. */
      const pool = this.token?.actor?.items;
      for (const n of custom.querySelectorAll(".sbe-slot--filled[data-item-id], .sbe-cont-row[data-item-id], .sbe-grid-item[data-item-id]")) {
        const it = pool?.get(n.dataset.itemId);
        if (!it?.testUserPermission(game.user, "LIMITED")) continue;
        n.removeAttribute("draggable");
        n.classList.add("sbe-prop-openable");
        n.addEventListener("dblclick", () => it.sheet?.render(true));
      }
      autosizeFreeZones(custom);
    }
    if (this.bubble) requestAnimationFrame(() => this.#follow());
  }

  /* ---------------------------------------------------------- */
  /*  Bulle accrochée au pion                                    */
  /* ---------------------------------------------------------- */

  /** Place la bulle au-dessus du pion (en dessous s'il n'y a pas la place). */
  #follow() {
    const tok = this.token?.object;
    const el = this.element;
    if (!tok || !el || !canvas?.ready) return;
    const b = tok.bounds;
    const top = canvas.clientCoordinatesFromCanvas({ x: b.x + b.width / 2, y: b.y });
    const bottom = canvas.clientCoordinatesFromCanvas({ x: b.x + b.width / 2, y: b.y + b.height });
    const w = el.offsetWidth || this.position.width || 320;
    const h = el.offsetHeight || 0;
    let y = top.y - h - 10;
    if (y < 4) y = bottom.y + 10;
    const x = Math.min(Math.max(4, top.x - w / 2), window.innerWidth - w - 4);
    this.setPosition({ left: Math.round(x), top: Math.round(Math.min(y, window.innerHeight - h - 4)) });
  }

  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    if (!this.bubble) return;
    const follow = () => this.#follow();
    const onToken = (t) => { if (t.document === this.token) follow(); };
    this.#hooks = [["canvasPan", Hooks.on("canvasPan", follow)], ["refreshToken", Hooks.on("refreshToken", onToken)]];
    this.#onResize = follow;
    window.addEventListener("resize", follow);
  }

  _onClose(options) {
    for (const [name, id] of this.#hooks) Hooks.off(name, id);
    this.#hooks = [];
    if (this.#onResize) window.removeEventListener("resize", this.#onResize);
    this.#onResize = null;
    super._onClose(options);
  }

  /* ---------------------------------------------------------- */
  /*  Actions                                                    */
  /* ---------------------------------------------------------- */

  static async #onRun(_e, t) {
    if (t.disabled || t.hasAttribute("disabled")) return;
    await PropManager.run(this.token, t.dataset.btnId);
    if (this.rendered) this.render();
  }

  /** Ouvrir un objet du monde listé (recette, munition compatible…). */
  static async #onOpenRef(_e, t) {
    const doc = await fromUuid(t.dataset.uuid ?? "").catch(() => null);
    doc?.sheet?.render(true);
  }

  static #onNavTab(_e, t) {
    this._navActive[t.dataset.nav] = t.dataset.tab;
    this.render();
  }

  static async #onTake() {
    const actor = PropManager.interactor();
    await PropManager.retrieve(this.token, actor);
    this.close({ animate: false });
  }

  static #onSheet() { PropManager.itemOf(this.token)?.sheet?.render(true); }

  static #onClose() { this.close({ animate: false }); }

  static async #onLinks() {
    const { PropScene } = await import("./prop-scene.mjs");
    PropScene.openLinks(this.token);
  }

  static async #onTrap() {
    const { TrapManager } = await import("../traps/trap-manager.mjs");
    await TrapManager.toggle(this.token);
    this.render();
  }

  static async #onTrapOp(_e, t) {
    if (t.disabled) return;
    const { TrapManager } = await import("../traps/trap-manager.mjs");
    const r = await TrapManager.stepOp(this.token, t.dataset.op, PropManager.interactor());
    if (r?.error) ui.notifications.warn(r.error);
    if (t.dataset.op === "take") return this.close({ animate: false });
    if (this.rendered) this.render();
  }

  static async #onRearm() {
    await PropManager.resetApproach(this.token);
    ui.notifications.info(L("SBE.Trig.Rearmed"));
  }

  static async #onDelete() {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: L("SBE.Prop.Delete") },
      content: `<p>${esc(L("SBE.Prop.DeleteConfirm", { name: this.token.name }))}</p>`, rejectClose: false
    }).catch(() => false);
    if (!ok) return;
    await this.token.delete();
  }
}
