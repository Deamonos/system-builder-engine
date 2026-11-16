/**
 * SBE — ZONE D'ATTENTE : les objets reçus SANS PLACE
 *
 * Un objet reçu alors que son conteneur est plein (échange, objet donné
 * par un effet, objet délogé d'un slot…) n'est pas perdu : il attend.
 *   - grille spatiale : « hors de la grille » (déduit de la mise en place) ;
 *   - liste et grille : la zone d'attente du conteneur (objet marqué
 *     `flags.<système>.waiting`, voir inventory.mjs).
 * Une fenêtre s'ouvre chez son propriétaire pour lui laisser le temps de
 * réorganiser son inventaire (glisser l'objet de la fenêtre dans un
 * conteneur). S'il ne peut vraiment pas le ranger :
 *   - le poser au sol (si le MJ le permet, paramètres du système) ;
 *   - le jeter ;
 *   - le rendre à son ancien propriétaire — qui, s'il n'a pas la place
 *     non plus, reçoit la même fenêtre et les mêmes choix.
 *
 * La même liste se voit sous chaque conteneur de la fiche (bande « En
 * attente », bouton « Organiser »). La bande disparaît quand elle est
 * vide. Seul le MJ principal écrit pour un autre personnage (rendre) :
 * les joueurs le lui demandent.
 *
 * Noms de données gardés tels quels (mondes existants) : le réglage
 * « spatialOverflowGround » et la marque « spatialFrom » (ancien
 * propriétaire).
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { onSocketMessage, emitSocket, isPrimaryGM, requestGM, gmQueue } from "../../helpers/socket.mjs";
import { buildInventory, spatialLayoutOf, dropIntoContainer, qtyOf, isStackableItem, isWaiting, isLockedItem, isGmOnlyItem, isDroppableItem } from "../../builder/inventory.mjs";
import { walkElements, slotAccepts, isRefList } from "../../builder/element-renderer.mjs";
import { isSpatialEl } from "../../builder/spatial.mjs";
import { beginDragFromUuid } from "../../builder/spatial-ui.mjs";
import { GroundItems } from "../ground/ground-items.mjs";

const { ApplicationV2 } = foundry.applications.api;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));

/** Les objets d'un personnage qui attendent une place : hors d'une
    grille spatiale, ou dans la zone d'attente d'un conteneur. */
export function waitingOf(actor) {
  if (!actor?.items) return [];
  const inv = buildInventory(actor);
  const out = [];
  const seen = new Set();
  for (const el of walkElements(actor.system?.template?.system?.elements ?? [])) {
    if (!isSpatialEl(el) || !el.key) continue;
    const got = spatialLayoutOf(actor, el, inv);
    for (const p of got?.lay.out ?? []) {
      const item = actor.items.get(p.id);
      if (item && !seen.has(item.id)) { seen.add(item.id); out.push({ item }); }
    }
  }
  for (const item of actor.items) {
    if (isWaiting(item) && !seen.has(item.id)) { seen.add(item.id); out.push({ item }); }
  }
  return out;
}

/** Premier conteneur d'une fiche qui accepte l'objet. */
function containerFor(actor, item) {
  for (const el of walkElements(actor?.system?.template?.system?.elements ?? [])) {
    if (el?.kind !== "container" || !el.key || isRefList(el)) continue;
    if (slotAccepts(el, item, actor)) continue;
    return el;
  }
  return null;
}

export class WaitingItems {

  static #apps = new Map();

  static init() {
    game.settings.register(SYSTEM_ID, "spatialOverflowGround", {
      name: "SBE.Wait.SettingGround",
      hint: "SBE.Wait.SettingGroundHint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });
    /* Un objet en attente qui bouge (rangé, équipé, posé ailleurs) n'est
       plus en attente — quel que soit le geste qui l'a déplacé. */
    Hooks.on("preUpdateItem", (item, changes) => {
      if (!isWaiting(item) || !foundry.utils.hasProperty(changes, "system.carry")) return;
      if (foundry.utils.hasProperty(changes, `flags.${SYSTEM_ID}.waiting`)) return;
      foundry.utils.setProperty(changes, `flags.${SYSTEM_ID}.waiting`, null);
    });
    onSocketMessage(async (p) => {
      if (p?.type === "sbeWaitOpen") return this.#onOpen(p.actorUuid);
      if (p?.type === "sbeWaitMsg" && p.userId === game.user.id) {
        ui.notifications[p.level === "warn" ? "warn" : "info"](L(p.key, p.data));
        return;
      }
      if (p?.type === "sbeWaitReturn" && isPrimaryGM()) await gmQueue(p.itemUuid, () => this.#doReturn(p.itemUuid, p.userId));
    });
  }

  /**
   * Prévient le propriétaire d'un personnage que des objets attendent
   * (appelé par le MJ après un échange ou un retour).
   */
  static notify(actor) {
    if (!actor) return;
    emitSocket({ type: "sbeWaitOpen", actorUuid: actor.uuid });
    this.#onOpen(actor.uuid);
  }

  /** Ce client doit-il ouvrir la fenêtre ? Le joueur propriétaire
      connecté ; sans lui, le MJ. */
  static #onOpen(actorUuid) {
    let actor = null;
    try { actor = fromUuidSync(actorUuid); } catch (_e) { actor = null; }
    if (!actor) return;
    const players = game.users.filter(u => u.active && !u.isGM && actor.testUserPermission(u, "OWNER"));
    const mine = players.length ? players.some(u => u.isSelf) : game.user.isGM;
    if (mine && waitingOf(actor).length) this.open(actor);
  }

  static open(actor) {
    if (!actor) return null;
    const app = this.#apps.get(actor.uuid) ?? new SBEWaitingApp(actor);
    this.#apps.set(actor.uuid, app);
    app.render({ force: true });
    return app;
  }

  static forget(actor) { this.#apps.delete(actor?.uuid); }

  /** Rendre un objet à son ancien propriétaire (exécuté par le MJ principal). */
  static requestReturn(item) {
    if (isPrimaryGM()) return gmQueue(item.uuid, () => this.#doReturn(item.uuid, game.user.id));
    requestGM({ type: "sbeWaitReturn", itemUuid: item.uuid, userId: game.user.id });
  }

  static #tell(userId, key, data = {}, level = "info") {
    if (userId === game.user.id) ui.notifications[level === "warn" ? "warn" : "info"](L(key, data));
    else emitSocket({ type: "sbeWaitMsg", userId, key, data, level });
  }

  static async #doReturn(itemUuid, userId) {
    const item = await fromUuid(itemUuid).catch(() => null);
    const from = item?.parent;
    const toUuid = item?.flags?.[SYSTEM_ID]?.spatialFrom;
    const to = toUuid ? await fromUuid(toUuid).catch(() => null) : null;
    if (!item || !from || !to || to === from) return this.#tell(userId, "SBE.Wait.NoOwner", {}, "warn");
    /* Seul celui qui l'a reçu (ou un MJ) peut le rendre. */
    const user = game.users.get(userId);
    if (!user || !(user.isGM || from.testUserPermission(user, "OWNER"))) return;
    const el = containerFor(to, item);
    if (!el) return this.#tell(userId, "SBE.Wait.NoContainer", { actor: to.name, name: item.name }, "warn");
    const name = item.name;
    const res = await dropIntoContainer({
      sheetDoc: to, el, item, quantity: isStackableItem(item) ? qtyOf(item) : null,
      overflow: true, origin: from.uuid
    }).catch(() => false);
    if (!res) return this.#tell(userId, "SBE.Wait.NoContainer", { actor: to.name, name }, "warn");
    this.#tell(userId, "SBE.Wait.Returned", { actor: to.name, name });
    if (res === "overflow") this.notify(to);
  }
}

class SBEWaitingApp extends ApplicationV2 {

  constructor(actor) {
    super({ id: `sbe-waiting-${actor.id}` });
    this.actor = actor;
    this._hooks = [];
  }

  static DEFAULT_OPTIONS = {
    classes: ["sbe-waiting"],
    window: { icon: "fa-solid fa-box-open", resizable: true },
    position: { width: 440, height: "auto" }
  };

  get title() {
    return L("SBE.Wait.Title", { name: this.actor?.name ?? "" });
  }

  async _renderHTML() {
    /* Objets « MJ seulement » (option du modèle) : cachés aux joueurs. */
    const list = waitingOf(this.actor).filter(({ item }) => game.user.isGM || !isGmOnlyItem(item));
    const ground = game.settings.get(SYSTEM_ID, "spatialOverflowGround");
    const rows = list.map(({ item }) => {
      const fromUuid = item.flags?.[SYSTEM_ID]?.spatialFrom;
      let owner = null;
      try { owner = fromUuid ? fromUuidSync(fromUuid) : null; } catch (_e) { owner = null; }
      const q = qtyOf(item);
      /* Objet verrouillé (donné par un effet) : il se range, rien d'autre. */
      const free = !isLockedItem(item);
      return `<div class="sbe-waitwin-row" data-item-id="${esc(item.id)}" data-uuid="${esc(item.uuid)}" draggable="true">
        <img src="${esc(item.img || "icons/svg/item-bag.svg")}" alt="">
        <span class="sbe-waitwin-name">${esc(item.name)}${q > 1 ? ` <b>×${q}</b>` : ""}</span>
        <span class="sbe-waitwin-acts">
          ${free && ground && isDroppableItem(item) ? `<button type="button" data-do="ground"><i class="fa-solid fa-hand-holding-hand"></i> ${esc(L("SBE.Wait.Ground"))}</button>` : ""}
          ${free ? `<button type="button" data-do="trash"><i class="fa-solid fa-trash"></i> ${esc(L("SBE.Wait.Trash"))}</button>` : ""}
          ${free && owner && owner !== this.actor ? `<button type="button" data-do="return"><i class="fa-solid fa-reply"></i> ${esc(L("SBE.Wait.Return", { name: owner.name }))}</button>` : ""}
        </span>
      </div>`;
    }).join("");
    return `<div class="sbe-waitwin">
      <p class="notes">${esc(L("SBE.Wait.Hint"))}</p>
      <div class="sbe-waitwin-list">${rows || `<p class="notes">${esc(L("SBE.Wait.Empty"))}</p>`}</div>
      <footer class="form-footer">
        <button type="button" data-do="sheet"><i class="fa-solid fa-id-card"></i> ${esc(L("SBE.Wait.OpenSheet"))}</button>
      </footer>
    </div>`;
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
    for (const row of content.querySelectorAll(".sbe-waitwin-row")) {
      row.addEventListener("dragstart", (ev) => {
        ev.dataTransfer?.setData("text/plain", JSON.stringify({ type: "Item", uuid: row.dataset.uuid }));
        beginDragFromUuid(row.dataset.uuid);
      });
    }
    /* Le conteneur survit aux re-rendus : un seul écouteur. */
    if (!content.dataset.sbeSpoutWired) {
      content.dataset.sbeSpoutWired = "1";
      content.addEventListener("click", (ev) => this.#onClick(ev));
    }
  }

  async #onClick(ev) {
    const btn = ev.target.closest("[data-do]");
    if (!btn) return;
    ev.preventDefault();
    const what = btn.dataset.do;
    if (what === "sheet") return this.actor?.sheet?.render(true);
    const item = this.actor?.items?.get(btn.closest(".sbe-waitwin-row")?.dataset.itemId ?? "");
    if (!item) return;
    if (what === "ground") return GroundItems.dropFromSheet(item);
    if (what === "return") return WaitingItems.requestReturn(item);
    if (what === "trash") {
      const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: L("SBE.Wait.TrashTitle") },
        content: `<p>${esc(L("SBE.Wait.TrashConfirm", { name: item.name }))}</p>`,
        rejectClose: false
      }).catch(() => false);
      if (ok) await item.delete();
    }
  }

  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    /* La fenêtre suit les objets du personnage ; vide, elle se ferme. */
    const mine = (doc) => doc?.parent === this.actor;
    const refresh = (doc) => {
      if (!mine(doc)) return;
      clearTimeout(this._t);
      this._t = setTimeout(() => {
        if (!this.rendered) return;
        if (!waitingOf(this.actor).length) {
          ui.notifications.info(L("SBE.Wait.AllStored"));
          this.close();
        } else this.render();
      }, 50);
    };
    for (const h of ["createItem", "updateItem", "deleteItem"]) this._hooks.push([h, Hooks.on(h, refresh)]);
  }

  async close(options) {
    for (const [h, id] of this._hooks) Hooks.off(h, id);
    this._hooks = [];
    clearTimeout(this._t);
    WaitingItems.forget(this.actor);
    return super.close(options);
  }
}
