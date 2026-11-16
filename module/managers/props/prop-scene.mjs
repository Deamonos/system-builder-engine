/**
 * SBE — ÉTAPES « SCÈNE » et LIENS DE SCÈNE d'un objet posé
 *
 * Un objet posé (levier, terminal, interrupteur, tuile interactive) agit
 * sur les éléments de la scène qu'on lui a LIÉS : portes, lumières, sons
 * d'ambiance, tuiles, pions, dessins, régions.
 *
 * - Les liens appartiennent à l'OBJET POSÉ (chaque levier commande SA
 *   porte) : flags.sbe.prop.links = [{ uuid, type, label }]. Le MJ les
 *   gère depuis le pied du panneau (« Liens de scène ») : il clique sur
 *   l'élément, sur la carte, quel que soit le calque actif.
 * - Le LIBELLÉ d'un lien est un groupe libre (« porte nord », « alarme ») :
 *   une étape vise les liens d'un groupe, ou tous ceux du bon type.
 * - Étape de bouton « Scène » : porte (ouvrir, fermer, basculer,
 *   verrouiller, déverrouiller), lumière / son / région (allumer,
 *   éteindre, basculer), visibilité (montrer, cacher, basculer : pions,
 *   tuiles, dessins), téléporter le personnage qui agit vers un lien.
 * - Les écritures passent par le MJ principal (socket sbeSceneAct).
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { onSocketMessage, isPrimaryGM, requestGM } from "../../helpers/socket.mjs";
import { activeTokenOf } from "../../helpers/canvas-utils.mjs";
import { carrierOf } from "../../builder/inventory.mjs";
import { PropManager } from "./prop-manager.mjs";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (x) => foundry.utils.escapeHTML(String(x ?? ""));

/* Actions de l'étape et ce qu'elles visent. */
export const SCENE_ACTIONS = {
  door: { types: ["Wall"], ops: ["open", "close", "toggle", "lock", "unlock"] },
  light: { types: ["AmbientLight"], ops: ["on", "off", "toggle"] },
  sound: { types: ["AmbientSound"], ops: ["on", "off", "toggle"] },
  visibility: { types: ["Token", "Tile", "Drawing"], ops: ["show", "hide", "toggle"] },
  region: { types: ["Region"], ops: ["on", "off", "toggle"] },
  teleport: { types: ["Token", "Tile", "Region", "AmbientLight", "AmbientSound", "Drawing"], ops: [] },
  /* Le panneau d'un objet posé lié (lui-même, ou accroché à la tuile, la
     porte ou la région liée) : un terminal ouvre la porte distante. */
  panel: { types: ["Token", "Tile", "Wall", "Region"], ops: [] },
  /* Le piège lui-même (l'objet posé dont c'est le bouton) : pas de lien. */
  trap: { types: [], ops: ["disarm", "take", "salvage", "rearm", "camo", "reveal", "hide"] }
};

const TYPE_ICON = {
  Wall: "fa-solid fa-door-closed", AmbientLight: "fa-solid fa-lightbulb", AmbientSound: "fa-solid fa-music",
  Tile: "fa-solid fa-cubes", Token: "fa-solid fa-user", Drawing: "fa-solid fa-pencil", Region: "fa-solid fa-draw-polygon"
};

export class PropScene {

  static init() {
    onSocketMessage(async (p) => {
      if (p?.type !== "sbeSceneAct" || !isPrimaryGM()) return;
      const safe = this.#fromPlayer(p);
      if (safe) await this.#gmApply(safe);
    });
  }

  /* ============================================================ */
  /*  Liens                                                        */
  /* ============================================================ */

  static linksOf(td) {
    const l = PropManager.flagsOf(td).links;
    return Array.isArray(l) ? l.filter(x => x?.uuid) : [];
  }

  static async setLinks(td, links) {
    await td.setFlag(SYSTEM_ID, "prop.links", links);
  }

  /** Les documents liés pour cette action (groupe vide = tous). */
  static #targets(td, action, group) {
    const types = SCENE_ACTIONS[action]?.types ?? [];
    const g = String(group ?? "").trim().toLowerCase();
    return this.linksOf(td)
      .filter(l => types.includes(l.type) && (!g || String(l.label ?? "").trim().toLowerCase() === g))
      .map(l => fromUuidSync(l.uuid))
      .filter(Boolean);
  }

  /* ============================================================ */
  /*  L'étape « Scène »                                            */
  /* ============================================================ */

  /**
   * @returns {Promise<{error?:string, line?:string}>}
   */
  static async runStep(item, st) {
    const td = PropManager.placedTokenOf(item);
    if (!td) return { error: L("SBE.Scene.NotPlaced", { name: item.name }) };
    const action = SCENE_ACTIONS[st.action] ? st.action : "door";
    if (action === "trap") {
      const { TrapManager } = await import("../traps/trap-manager.mjs");
      const op = SCENE_ACTIONS.trap.ops.includes(st.op) ? st.op : "disarm";
      const actor = carrierOf(item);
      return TrapManager.stepOp(td, op, actor?.documentName === "Actor" && actor.type !== "prop" ? actor : null);
    }
    const docs = this.#targets(td, action, st.group);
    if (!docs.length) return { error: L("SBE.Scene.NoLink", { group: st.group || L(`SBE.Scene.Act.${action}`) }) };
    if (action === "panel") {
      const { PropTiles } = await import("./prop-tiles.mjs");
      const target = docs.map(d => (d.documentName === "Token" ? (PropManager.isPropToken(d) ? d : null) : PropTiles.tokenOf(d)))
        .find(Boolean);
      if (!target) return { error: L("SBE.Scene.NoPanel") };
      await PropManager.open(target, { remote: true });
      return {};
    }
    if (action === "teleport") {
      const actor = carrierOf(item);
      const tok = actor?.documentName === "Actor" ? activeTokenOf(actor)?.document : null;
      if (!tok) return { error: L("SBE.Steps.NoCarrier") };
      const dest = this.#centerOf(docs[0]);
      if (!dest) return { error: L("SBE.Scene.NoLink", { group: st.group || "" }) };
      await this.#teleport(tok, dest, td);
      return {};
    }
    const op = SCENE_ACTIONS[action].ops.includes(st.op) ? st.op : SCENE_ACTIONS[action].ops[0];
    const payload = { type: "sbeSceneAct", action, op, uuids: docs.map(d => d.uuid), prop: td.uuid };
    if (isPrimaryGM()) await this.#gmApply(payload);
    else requestGM(payload);
    return {};
  }

  /** Centre d'un élément de la scène. */
  static #centerOf(doc) {
    const o = doc.object;
    if (o?.center) return { x: o.center.x, y: o.center.y };
    if (o?.bounds) return { x: o.bounds.x + o.bounds.width / 2, y: o.bounds.y + o.bounds.height / 2 };
    if (Number.isFinite(doc.x) && Number.isFinite(doc.y)) return { x: doc.x, y: doc.y };
    return null;
  }

  /** Téléporte un pion (centré sur le point), sans trajet ni murs. */
  static async #teleport(tok, dest, td) {
    const gs = tok.parent?.grid?.size || 100;
    const x = Math.round(dest.x - ((tok.width ?? 1) * gs) / 2), y = Math.round(dest.y - ((tok.height ?? 1) * gs) / 2);
    if (tok.isOwner) {
      await tok.move({ x, y, action: "displace" }, { constrainOptions: { ignoreWalls: true, ignoreCost: true } });
      return;
    }
    const payload = { type: "sbeSceneAct", action: "teleport", token: tok.uuid, x, y, prop: td?.uuid ?? "" };
    if (isPrimaryGM()) await this.#gmApply(payload);
    else requestGM(payload);
  }

  /**
   * Demande d'un JOUEUR : seulement sur les éléments LIÉS à l'objet posé
   * dont c'est l'étape (pas n'importe quelle porte ou pion de la scène) ;
   * se téléporter : son propre pion, vers un élément lié.
   */
  static #fromPlayer(p) {
    const user = game.users.get(p._from);
    if (!user) return null;
    if (user.isGM) return p;
    let td = null;
    try { td = p.prop ? fromUuidSync(p.prop) : null; } catch (_e) { td = null; }
    if (!td) return null;
    const links = this.linksOf(td);
    if (p.action === "teleport") {
      let tok = null;
      try { tok = fromUuidSync(p.token); } catch (_e) { tok = null; }
      if (!tok?.actor?.testUserPermission(user, "OWNER")) return null;
      const gs = tok.parent?.grid?.size || 100;
      const ok = links.some(l => {
        let d = null;
        try { d = fromUuidSync(l.uuid); } catch (_e) { d = null; }
        const c = d ? this.#centerOf(d) : null;
        return c && Math.abs(Math.round(c.x - ((tok.width ?? 1) * gs) / 2) - p.x) <= 1
          && Math.abs(Math.round(c.y - ((tok.height ?? 1) * gs) / 2) - p.y) <= 1;
      });
      return ok ? p : null;
    }
    if (!SCENE_ACTIONS[p.action]?.ops.includes(p.op)) return null;
    const allowed = new Set(links.filter(l => SCENE_ACTIONS[p.action].types.includes(l.type)).map(l => l.uuid));
    const uuids = (Array.isArray(p.uuids) ? p.uuids : []).filter(u => allowed.has(u));
    return uuids.length ? { ...p, uuids } : null;
  }

  /** MJ principal : applique l'action aux éléments liés. */
  static async #gmApply(p) {
    if (p.action === "teleport") {
      const tok = await fromUuid(p.token).catch(() => null);
      if (tok) await tok.move({ x: p.x, y: p.y, action: "displace" }, { constrainOptions: { ignoreWalls: true, ignoreCost: true } });
      return;
    }
    const DS = CONST.WALL_DOOR_STATES;
    for (const uuid of p.uuids ?? []) {
      const doc = await fromUuid(uuid).catch(() => null);
      if (!doc) continue;
      try {
        if (p.action === "door") {
          if (doc.documentName !== "Wall" || !doc.door) continue;
          const cur = doc.ds;
          const next = p.op === "open" ? DS.OPEN : p.op === "close" ? DS.CLOSED : p.op === "lock" ? DS.LOCKED
            : p.op === "unlock" ? (cur === DS.LOCKED ? DS.CLOSED : cur)
              : (cur === DS.OPEN ? DS.CLOSED : cur === DS.CLOSED ? DS.OPEN : cur);
          if (next !== cur) await doc.update({ ds: next }, { sbeDoorUnlocked: true });
        } else if (p.action === "region") {
          const behaviors = doc.behaviors?.contents ?? [];
          const upd = behaviors.map(b => ({ _id: b.id, disabled: p.op === "off" ? true : p.op === "on" ? false : !b.disabled }));
          if (upd.length) await doc.updateEmbeddedDocuments("RegionBehavior", upd);
        } else {
          /* Lumière, son : « allumé » = non caché ; visibilité : montrer = non caché. */
          const hide = ["off", "hide"].includes(p.op) ? true : ["on", "show"].includes(p.op) ? false : !doc.hidden;
          if (!!doc.hidden !== hide) await doc.update({ hidden: hide });
        }
      } catch (err) {
        console.warn("SBE | Étape Scène en échec", uuid, err);
      }
    }
  }

  /* ============================================================ */
  /*  Choisir un élément sur la carte (MJ)                          */
  /* ============================================================ */

  /** Éléments de la scène sous ce point, tous calques confondus. */
  static #elementsAt(pt) {
    const out = [];
    const sc = canvas.stage?.scale?.x || 1;
    const tol = 14 / sc;
    for (const w of canvas.walls?.placeables ?? []) {
      if (!w.document.door) continue;
      const [x1, y1, x2, y2] = w.document.c;
      const dx = x2 - x1, dy = y2 - y1;
      const t = Math.max(0, Math.min(1, ((pt.x - x1) * dx + (pt.y - y1) * dy) / ((dx * dx + dy * dy) || 1)));
      if (Math.hypot(pt.x - (x1 + t * dx), pt.y - (y1 + t * dy)) <= tol) out.push(w.document);
    }
    for (const layer of [canvas.lighting, canvas.sounds]) {
      for (const o of layer?.placeables ?? []) {
        if (Math.hypot(pt.x - o.document.x, pt.y - o.document.y) <= Math.max(tol, 24 / sc)) out.push(o.document);
      }
    }
    for (const layer of [canvas.tokens, canvas.tiles, canvas.drawings]) {
      for (const o of layer?.placeables ?? []) {
        if (o.bounds?.contains?.(pt.x, pt.y)) out.push(o.document);
      }
    }
    for (const r of canvas.regions?.placeables ?? []) {
      const d = r.document;
      const hit = typeof d.testPoint === "function" ? d.testPoint({ x: pt.x, y: pt.y, elevation: d.elevation?.bottom ?? 0 }) : r.bounds?.contains?.(pt.x, pt.y);
      if (hit) out.push(d);
    }
    return out;
  }

  static labelOf(doc) {
    if (!doc) return L("SBE.Scene.Missing");
    const t = L(`SBE.Scene.Type.${doc.documentName}`);
    const name = doc.name || doc.text || doc.label || "";
    return name ? `${t} — ${name}` : t;
  }

  /** Mode « cliquez sur un élément » : résout un document, ou null (annulé). */
  static pick() {
    return new Promise((resolve) => {
      const stage = canvas.stage;
      if (!stage) { resolve(null); return; }
      ui.notifications.info(L("SBE.Scene.PickHint"));
      const done = (v) => {
        stage.off("pointerdowncapture", onDown);
        window.removeEventListener("keydown", onKey, true);
        document.body.style.cursor = "";
        resolve(v);
      };
      const onKey = (ev) => { if (ev.key === "Escape") { ev.preventDefault(); done(null); } };
      const onDown = async (event) => {
        const btn = event?.data?.originalEvent?.button ?? event?.button ?? 0;
        if (btn === 2) { done(null); return; }
        event.stopPropagation?.();
        event.preventDefault?.();
        const pt = event.getLocalPosition?.(stage) ?? canvas.mousePosition;
        const hits = this.#elementsAt(pt);
        if (!hits.length) { ui.notifications.warn(L("SBE.Scene.PickNone")); return; }
        if (hits.length === 1) { done(hits[0]); return; }
        const choice = await foundry.applications.api.DialogV2.wait({
          window: { title: L("SBE.Scene.PickWhich") },
          content: `<div class="sbe-scene-which">${hits.map((d, i) => `<label><input type="radio" name="which" value="${i}" ${i ? "" : "checked"}> <i class="${TYPE_ICON[d.documentName] ?? "fa-solid fa-cube"}"></i> ${esc(this.labelOf(d))}</label>`).join("")}</div>`,
          buttons: [{ action: "ok", label: L("SBE.Common.Validate"), icon: "fa-solid fa-check", default: true,
            callback: (_e, _b, dlg) => Number(dlg.element.querySelector("[name=which]:checked")?.value ?? 0) },
          { action: "cancel", label: L("SBE.Common.Cancel"), icon: "fa-solid fa-xmark" }],
          rejectClose: false
        }).catch(() => null);
        if (choice === null || choice === "cancel" || choice === undefined) return;
        done(hits[Number(choice)] ?? null);
      };
      /* En CAPTURE : le clic ne sélectionne rien et n'ouvre aucune porte. */
      stage.on("pointerdowncapture", onDown);
      window.addEventListener("keydown", onKey, true);
      document.body.style.cursor = "crosshair";
    });
  }

  /** Fenêtre « Liens de scène » d'un objet posé (MJ). */
  static async openLinks(td) {
    if (!game.user.isGM || !td) return;
    const app = new SBEPropLinks({ token: td });
    return app.render({ force: true });
  }
}

const { ApplicationV2 } = foundry.applications.api;

class SBEPropLinks extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    tag: "div",
    classes: ["sbe-prop-links", "sbe-window"],
    /* Redimensionnable par la poignée SBE (window-fit), comme les autres. */
    window: { icon: "fa-solid fa-link" },
    position: { width: 420, height: "auto" },
    actions: {
      linkAdd: SBEPropLinks.#onAdd,
      linkDel: SBEPropLinks.#onDel,
      linkShow: SBEPropLinks.#onShow
    }
  };

  constructor(options = {}) {
    super({ ...options, id: `sbe-links-${options.token?.id ?? foundry.utils.randomID()}` });
    this.token = options.token;
  }

  get title() { return L("SBE.Scene.LinksTitle", { name: this.token?.name ?? "" }); }

  async _renderHTML() {
    const links = PropScene.linksOf(this.token);
    const rows = links.map((l, i) => {
      const doc = fromUuidSync(l.uuid);
      return `<div class="sbe-link-row${doc ? "" : " is-missing"}" data-i="${i}">
        <i class="${TYPE_ICON[l.type] ?? "fa-solid fa-cube"}"></i>
        <span class="sbe-link-what">${esc(PropScene.labelOf(doc))}</span>
        <input type="text" class="sbe-link-label" value="${esc(l.label ?? "")}" placeholder="${esc(L("SBE.Scene.GroupPh"))}">
        <button type="button" data-action="linkShow" data-tooltip-text="${esc(L("SBE.Scene.Show"))}" ${doc ? "" : "disabled"}><i class="fa-solid fa-eye"></i></button>
        <button type="button" data-action="linkDel" data-tooltip-text="${esc(L("SBE.Common.Delete"))}"><i class="fa-solid fa-trash"></i></button>
      </div>`;
    }).join("");
    return `
      <p class="notes">${esc(L("SBE.Scene.LinksHint"))}</p>
      <div class="sbe-link-list">${rows || `<p class="notes">${esc(L("SBE.Scene.NoLinks"))}</p>`}</div>
      <button type="button" data-action="linkAdd"><i class="fa-solid fa-crosshairs"></i> ${esc(L("SBE.Scene.Add"))}</button>`;
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
    for (const input of content.querySelectorAll(".sbe-link-label")) {
      input.addEventListener("change", async () => {
        const i = Number(input.closest("[data-i]")?.dataset.i);
        const links = foundry.utils.deepClone(PropScene.linksOf(this.token));
        if (!links[i]) return;
        links[i].label = input.value.trim();
        await PropScene.setLinks(this.token, links);
      });
    }
  }

  static async #onAdd() {
    this.minimize?.();
    const doc = await PropScene.pick();
    this.maximize?.();
    if (!doc) return;
    const links = foundry.utils.deepClone(PropScene.linksOf(this.token));
    if (links.some(l => l.uuid === doc.uuid)) { ui.notifications.info(L("SBE.Scene.Already")); return; }
    links.push({ uuid: doc.uuid, type: doc.documentName, label: "" });
    await PropScene.setLinks(this.token, links);
    this.render();
  }

  static async #onDel(_e, t) {
    const i = Number(t.closest("[data-i]")?.dataset.i);
    const links = foundry.utils.deepClone(PropScene.linksOf(this.token));
    links.splice(i, 1);
    await PropScene.setLinks(this.token, links);
    this.render();
  }

  static #onShow(_e, t) {
    const i = Number(t.closest("[data-i]")?.dataset.i);
    const doc = fromUuidSync(PropScene.linksOf(this.token)[i]?.uuid ?? "");
    const o = doc?.object;
    if (!o) return;
    const c = o.center ?? { x: doc.x, y: doc.y };
    canvas.animatePan({ x: c.x, y: c.y, duration: 400 });
    o.control?.({ releaseOthers: true });
  }
}
