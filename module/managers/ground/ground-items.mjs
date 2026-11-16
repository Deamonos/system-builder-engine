/**
 * SBE — OBJETS AU SOL
 *
 * Un objet posé au sol est un OBJET DE SCÈNE de la sorte « ground » :
 * un pion non lié du personnage caché « prop » dont le delta porte les
 * vrais objets (leurs valeurs, leur usure, leur état). Plusieurs objets
 * au même endroit forment un SAC (un seul pion, image de sac) ; il
 * disparaît quand on l'a vidé.
 *
 * Un double-clic (pion proche) ouvre la fenêtre : ce qu'il y a, et
 * pour chaque objet « Prendre » (pour soi) ou « Donner à… » (un autre
 * personnage de joueur), plus ses boutons « une fois posé » s'il en a.
 * Distance, taille et image du sac : paramètres du système.
 *
 * Qui pose : « Poser au sol » (clic droit), le glisser-déposer sur la
 * scène, un projectile récupérable, un objet de scène tombé à 0 PV…
 * Seul le MJ principal écrit : les joueurs le lui demandent par le
 * canal du système.
 *
 * Les objets étant de vrais objets d'un pion, le registre des
 * emplacements (« tokens ») les couvre : cascade, propagation, orphelins.
 */

import { activeTokenOf } from "../../helpers/canvas-utils.mjs";
import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { onSocketMessage, emitSocket, isPrimaryGM, requestGM, gmQueue } from "../../helpers/socket.mjs";
import { dropIntoContainer, QUANTITY_KEY, askQuantity, qtyOf, isStackableItem, carrierOf, asCarrier, bundleOf, holdsOthers, buildInventory, isLockedItem, refuseLocked, isGmOnlyItem, isDroppableItem } from "../../builder/inventory.mjs";
import { withMarks } from "../../builder/icon-marks.mjs";
import { walkElements, slotAccepts, isRefList, itemTipAttr } from "../../builder/element-renderer.mjs";
import { PropManager } from "../props/prop-manager.mjs";
import { PropTiles } from "../props/prop-tiles.mjs";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const KIND = "ground";
const BAG = "icons/svg/item-bag.svg";

/** Deux exemplaires identiques (même objet, mêmes valeurs hors quantité) ? */
function sameItem(a, b) {
  const strip = (d) => {
    const c = foundry.utils.deepClone(d);
    if (c?.system?.values) delete c.system.values[QUANTITY_KEY];
    delete c._id; delete c.sort; delete c.ownership; delete c._stats; delete c.folder;
    if (c?.system) delete c.system.carry;
    return JSON.stringify(c);
  };
  try { return strip(a) === strip(b); } catch (_e) { return false; }
}

const CARRY0 = { host: "", where: "", x: 0, y: 0, cell: -1 };

export class GroundItems {

  static #windows = new Map();

  static init() {
    game.settings.register(SYSTEM_ID, "groundPickupDistance", {
      name: "SBE.Ground.SettingDistance",
      hint: "SBE.Ground.SettingDistanceHint",
      scope: "world", config: true, type: Number, default: 1
    });
    game.settings.register(SYSTEM_ID, "groundSize", {
      name: "SBE.Ground.SettingSize",
      hint: "SBE.Ground.SettingSizeHint",
      scope: "world", config: true, type: Number, default: 0.6
    });
    game.settings.register(SYSTEM_ID, "groundBagImage", {
      name: "SBE.Ground.SettingBag",
      hint: "SBE.Ground.SettingBagHint",
      scope: "world", config: true, type: String, filePicker: "image", default: BAG
    });

    PropManager.registerKind(KIND, {
      cfg: () => this.#cfg(),
      open: (td, actor) => this.#open(td, actor),
      changed: (td) => this.#refresh(td)
    });

    onSocketMessage(async (p) => {
      if (p?.type === "sbeGroundMsg" && p.userId === game.user.id) {
        ui.notifications[p.level === "warn" ? "warn" : "info"](L(p.key, p.data));
        return;
      }
      if (!isPrimaryGM()) return;
      if (p?.type === "sbeGroundMove") await this.#move(p);
    });

    /* Glisser un objet (fiche ou barre latérale) sur la scène : il
       est posé au sol à cet endroit. */
    Hooks.on("dropCanvasData", (_canvas, data) => {
      if (data?.type !== "Item" || !data.uuid) return;
      const item = fromUuidSync(data.uuid);
      if (!item || item.type !== "objet") return;
      const point = { x: data.x, y: data.y };
      /* Sur un objet posé qui l'attend (clé, carte…), ou un objet du monde
         sur une tuile du décor (MJ) : voir PropTiles. */
      if (PropTiles.handleDrop(item, point)) return false;
      /* Un objet DÉPLOYABLE : le poser au sol, ou l'installer ici ? */
      if (PropManager.isPropItem(item) && (item.parent || game.user.isGM)) {
        /* Non déposable (option du modèle) : il ne peut que s'installer. */
        if (!isDroppableItem(item)) { PropManager.installAt(item, point); return false; }
        this.#askDeploy(item).then(choice => {
          if (choice === "install") PropManager.installAt(item, point);
          else if (choice === "ground") this.dropFromSheet(item, point);
        });
        return false;
      }
      this.dropFromSheet(item, point);
      return false;
    });

    /* Fenêtre ouverte : elle suit son pion et ce qu'il contient. */
    const refresh = (td) => { if (td) this.#windows.get(td.uuid)?.refresh?.(); };
    Hooks.on("updateToken", (td) => refresh(td));
    Hooks.on("deleteToken", (td) => this.#windows.get(td.uuid)?.close?.());
    for (const h of ["createItem", "updateItem", "deleteItem"]) {
      Hooks.on(h, (item) => { if (item.parent?.isToken) refresh(item.parent.token); });
    }
  }

  /** Objet déployable lâché sur la carte : « Poser au sol » ou « Installer ». */
  static async #askDeploy(item) {
    const res = await foundry.applications.api.DialogV2.wait({
      window: { title: item.name, icon: "fa-solid fa-cube" },
      content: `<p>${esc(L("SBE.Ground.DeployAsk", { name: item.name }))}</p>`,
      buttons: [
        { action: "install", label: L("SBE.Ground.DeployInstall"), icon: "fa-solid fa-screwdriver-wrench", default: true },
        { action: "ground", label: L("SBE.Ground.Drop"), icon: "fa-solid fa-hand-holding-hand" }
      ],
      rejectClose: false
    }).catch(() => null);
    return res ?? null;
  }

  /** Est-ce un pion « au sol » ? */
  static isGround(td) { return PropManager.isPropToken(td) && PropManager.kindOf(td) === KIND; }

  /** Réglages des pions au sol (paramètres du système). */
  static #cfg() {
    const n = Math.max(0.1, Number(game.settings.get(SYSTEM_ID, "groundSize")) || 0.6);
    return {
      sizeMode: "cells", w: n, h: n, rotate: false, range: this.#maxDistance(),
      visibility: "all", use: "all", take: "all", showName: false, ignoreCombat: true
    };
  }

  /** Les objets posés là (ceux du haut : le contenu d'un objet le suit). */
  static #entries(td) {
    return (td?.actor?.items?.contents ?? []).filter(i => i.type === "objet" && !String(i.system?.carry?.host ?? ""));
  }

  /* ============================================================ */
  /*  Poser / donner (appelés depuis n'importe quel client)        */
  /* ============================================================ */

  /** Données d'UN exemplaire d'un objet, prêtes à voyager. */
  static dataOf(item, qty = 1) {
    const d = item.toObject();
    delete d._id;
    foundry.utils.setProperty(d, `system.values.${QUANTITY_KEY}`, qty);
    foundry.utils.setProperty(d, "system.carry", { ...CARRY0 });
    return d;
  }

  /** MJ : pose au sol, au point donné (scène affichée), un objet décrit
      par ses données. `inner` : ce qu'il contient (données avec leurs
      ids), qui part avec lui. Un joueur passe par moveItem. */
  static async drop(data, qty, point, inner = []) {
    if (!game.user.isGM) return false;
    return this.#drop(data, qty, point, canvas.scene?.id, inner);
  }

  /** MJ : range dans l'inventaire d'un personnage un objet décrit par ses
      données. Un joueur passe par moveItem. */
  static async give(actor, data, qty = 1) {
    if (!game.user.isGM) return false;
    return this.#give(actor.uuid, data, qty, game.user.id);
  }

  /**
   * Déplace un objet RÉEL : au sol (`point`) ou chez un personnage
   * (`actor`). Le MJ crée l'objet à l'arrivée PUIS le retire de son
   * porteur, dans la même opération ; sans MJ connecté, rien ne bouge.
   * Un objet du monde (barre latérale) donne un exemplaire neuf (MJ).
   */
  static async moveItem(item, qty, { point = null, actor = null, notify = "" } = {}) {
    if (!item) return false;
    const p = { type: "sbeGroundMove", item: item.uuid, qty, point, sceneId: canvas.scene?.id ?? "", actor: actor?.uuid ?? "", notify, userId: game.user.id };
    if (isPrimaryGM()) return this.#move(p);
    return requestGM(p);
  }

  /** Le déplacement, chez le MJ principal (une demande à la fois par objet). */
  static #move(p) {
    return gmQueue(p.item, async () => {
      const item = await fromUuid(p.item).catch(() => null);
      const user = game.users.get(p.userId);
      if (!item || item.type !== "objet") return false;
      const holder = item.parent?.documentName === "Actor" ? item.parent : null;
      const target = p.actor ? await fromUuid(p.actor).catch(() => null) : null;
      /* Un objet porté : par son propriétaire. Un objet du monde (récompense,
         talent, niveau…) : par le MJ, ou pour un personnage du demandeur. */
      const owns = (doc) => !!user && (user.isGM || !!doc?.testUserPermission?.(user, "OWNER"));
      if (holder ? !owns(holder) : !(user?.isGM || (target && owns(target)))) return false;
      const whole = holder && holdsOthers(item);
      const n = whole || !isStackableItem(item) ? (whole ? qtyOf(item) : 1)
        : Math.max(1, Math.min(Math.floor(Number(p.qty) || 1), holder ? qtyOf(item) : Infinity));
      let data, inner = [];
      if (whole) {
        const datas = bundleOf(item);
        foundry.utils.setProperty(datas[0], "system.carry", { ...CARRY0 });
        [data, ...inner] = datas;
      } else {
        data = this.dataOf(item, n);
        data.system.modelId = holder ? (item.system?.modelId ?? "") : item.id;
      }
      if (target && whole) {
        /* Un objet qui en contient d'autres tombe aux pieds du personnage, avec son contenu. */
        const tok = activeTokenOf(target);
        if (!tok) return false;
        await this.#drop(data, n, { ...tok.center }, tok.scene?.id ?? canvas.scene?.id, inner);
      } else if (target) await this.#give(target.uuid, data, n, p.userId);
      else if (p.point) await this.#drop(data, n, p.point, p.sceneId, inner);
      else return false;
      /* L'objet quitte son porteur, une fois arrivé. */
      if (holder) {
        if (whole) await holder.deleteEmbeddedDocuments("Item", [data._id, ...inner.map(d => d._id)]);
        else if (qtyOf(item) - n > 0) await item.update({ [`system.values.${QUANTITY_KEY}`]: qtyOf(item) - n });
        else await item.delete();
      }
      if (p.notify) this.#tell(p.userId, p.notify, { name: item.name, qty: n });
      return true;
    });
  }

  /** Message pour celui qui a fait la demande (local s'il s'agit de ce client). */
  static #tell(userId, key, data = {}, level = "info") {
    if (!userId || userId === game.user.id) ui.notifications[level === "warn" ? "warn" : "info"](L(key, data));
    else emitSocket({ type: "sbeGroundMsg", userId, key, data, level });
  }

  /** Entrée « Poser au sol » du menu clic droit d'un objet porté. */
  static menuEntry(item) {
    if (!item || item.type !== "objet" || !item.isOwner || !carrierOf(item) || isLockedItem(item)) return null;
    if (!isDroppableItem(item)) return null;
    return { label: L("SBE.Ground.Drop"), icon: "fa-solid fa-hand-holding-hand", onClick: () => this.dropFromSheet(item) };
  }

  /** Distance maximale (cases) ; 0 = sans limite. */
  static #maxDistance() {
    return Math.max(0, Number(game.settings.get(SYSTEM_ID, "groundPickupDistance")) || 0);
  }

  /** Le pion est-il assez près du point ? (le MJ l'est toujours) */
  static #near(token, point) {
    if (game.user.isGM) return true;
    const max = this.#maxDistance();
    if (max <= 0 || !token) return true;
    const size = canvas.dimensions?.size || 100;
    return Math.hypot(token.center.x - point.x, token.center.y - point.y) / size <= max + 0.5;
  }

  /**
   * Pose au sol un objet porté (au point donné, sinon aux pieds du
   * porteur) ou un objet du monde (MJ). Une pile demande combien.
   */
  static async dropFromSheet(item, point = null) {
    /* Option du modèle « Déposable sur la scène » décochée : jamais au sol. */
    if (!isDroppableItem(item)) {
      ui.notifications.warn(L("SBE.Ground.NotDroppable", { name: item?.name ?? "" }));
      return;
    }
    const carrier = carrierOf(item);
    /* Objet du monde (barre latérale) : le MJ seulement. */
    if (!carrier) {
      if (!game.user.isGM || !point) return;
      let n = 1;
      if (isStackableItem(item)) {
        n = await askQuantity({ total: null, max: null, name: item.name });
        if (!n) return;
      }
      const d = this.dataOf(item, n);
      if (!item.system?.modelId) foundry.utils.setProperty(d, "system.modelId", item.id);
      return this.drop(d, n, point);
    }
    if (!item.isOwner || refuseLocked(item)) return;
    const tok = activeTokenOf(carrier);
    if (!point) {
      if (!tok) { ui.notifications.warn(L("SBE.Ground.NoToken")); return; }
      point = { ...tok.center };
    } else if (!this.#near(tok, point)) {
      ui.notifications.warn(L("SBE.Ground.TooFar", { n: this.#maxDistance() })); return;
    }
    /* Un objet qui en contient d'autres (arme chargée, sac) part au sol
       avec tout son contenu ; une pile : combien en poser. */
    let n = 1;
    const total = isStackableItem(item) && !holdsOthers(item) ? qtyOf(item) : 1;
    if (total > 1) {
      n = await askQuantity({ total, max: total, name: item.name });
      if (!n) return;
    }
    return this.moveItem(item, n, { point, notify: "SBE.Ground.Dropped" });
  }

  /* ============================================================ */
  /*  Exécution (MJ principal)                                     */
  /* ============================================================ */

  /** Image et nom du pion selon ce qu'il porte (vidé → supprimé). */
  static async #refresh(td) {
    const list = this.#entries(td);
    if (!list.length) return td.delete();
    const one = list.length === 1;
    const img = one ? (list[0].img || BAG) : (game.settings.get(SYSTEM_ID, "groundBagImage") || BAG);
    const name = one ? list[0].name : L("SBE.Ground.BagTitle");
    const upd = {};
    if (td.texture?.src !== img) upd["texture.src"] = img;
    if (td.name !== name) upd.name = name;
    /* Rien que des objets « MJ seulement » : le pion est caché aux
       joueurs (un sac qui s'ouvre sur du vide les intriguerait). */
    const secret = list.every(i => isGmOnlyItem(i));
    if (!!td.hidden !== secret) upd.hidden = secret;
    if (Object.keys(upd).length) await td.update(upd);
  }

  static async #drop(data, qty, point, sceneId, inner = []) {
    const scene = game.scenes.get(sceneId) ?? canvas.scene;
    if (!scene || !data || !point) return;
    const gs = scene.grid?.size ?? 100;
    let at = point;
    try { if (scene === canvas.scene) at = canvas.grid.getCenterPoint(point); } catch (_e) { /* */ }
    const n = Math.max(1, Number(qty) || 1);
    const d = foundry.utils.deepClone(data);
    /* Avec son contenu : les ids voyagent (liens « contenu dans »). */
    const bundle = Array.isArray(inner) && inner.length > 0;
    if (!bundle) delete d._id;
    foundry.utils.setProperty(d, `system.values.${QUANTITY_KEY}`, n);
    foundry.utils.setProperty(d, "system.carry", { ...CARRY0 });
    /* Déjà quelque chose ici : on l'ajoute (pile identique fusionnée),
       et le pion devient un sac. */
    const here = scene.tokens.find(t => this.isGround(t)
      && Math.abs(t.x + (t.width * gs) / 2 - at.x) < gs / 2 && Math.abs(t.y + (t.height * gs) / 2 - at.y) < gs / 2);
    if (here?.actor) {
      if (bundle) {
        await here.actor.createEmbeddedDocuments("Item", [d, ...inner], { keepId: true });
        return this.#refresh(here);
      }
      let stack = false;
      try { stack = isStackableItem(new CONFIG.Item.documentClass(foundry.utils.deepClone(d))); } catch (_e) { stack = false; }
      const same = stack ? this.#entries(here).find(i => sameItem(i.toObject(), d)) : null;
      if (same) await same.update({ [`system.values.${QUANTITY_KEY}`]: qtyOf(same) + n });
      else await here.actor.createEmbeddedDocuments("Item", [d]);
      return this.#refresh(here);
    }
    const td = await PropManager.createToken({
      scene, center: at, name: d.name, img: d.img || BAG, cfg: this.#cfg(),
      items: bundle ? [d, ...inner] : [d], prop: { kind: KIND }
    });
    if (td) await this.#refresh(td);
  }

  /** Premier conteneur de la fiche qui accepte l'objet. */
  static #containerFor(actor, item) {
    for (const el of walkElements(actor?.system?.template?.system?.elements ?? [])) {
      if (el?.kind !== "container" || !el.key || isRefList(el)) continue;
      if (slotAccepts(el, item, actor)) continue;
      return el;
    }
    return null;
  }

  /** Range dans la fiche ; si rien ne l'accepte, l'objet tombe au sol à ses pieds. */
  static async #give(actorUuid, data, qty, _userId) {
    const actor = await fromUuid(actorUuid).catch(() => null);
    if (!data) return false;
    /* Une cible qui n'est pas un personnage (objet posé attaquable) :
       l'objet tombe au sol à ses pieds. */
    if (actor?.documentName !== "Actor") {
      const td = actor?.parent?.token ?? null;
      const c = td?.object?.center;
      if (c) await this.#drop(data, qty, { ...c }, td.parent?.id);
      return false;
    }
    const tmp = new CONFIG.Item.documentClass(foundry.utils.deepClone(data));
    const el = this.#containerFor(actor, tmp);
    const ok = el ? await dropIntoContainer({ sheetDoc: actor, el, item: tmp, quantity: qty }) : false;
    if (ok) return true;
    const tok = activeTokenOf(actor);
    if (tok) await this.#drop(data, qty, { ...tok.center }, tok.scene?.id ?? canvas.scene?.id);
    return false;
  }

  /* ============================================================ */
  /*  La fenêtre (double-clic sur le pion)                         */
  /* ============================================================ */

  /** Personnages des joueurs (destinataires de « Donner à… »). */
  static #playerCharacters() {
    return game.users.filter(u => !u.isGM && u.character).map(u => u.character)
      .filter((a, i, arr) => arr.indexOf(a) === i);
  }

  static async #askRecipient(exclude) {
    const list = this.#playerCharacters().filter(a => a !== exclude);
    if (!list.length) { ui.notifications.warn(L("SBE.Ground.NoRecipient")); return null; }
    const id = await foundry.applications.api.DialogV2.wait({
      window: { title: L("SBE.Ground.GiveTo") },
      content: `<div class="sbe-ground-recip">${list.map(a => `<label><input type="radio" name="who" value="${esc(a.uuid)}"> <img src="${esc(a.img)}" alt=""> ${esc(a.name)}</label>`).join("")}</div>`,
      buttons: [{ action: "ok", label: L("SBE.Ground.Give"), icon: "fa-solid fa-hand-holding-heart", default: true,
        callback: (_e, _b, dlg) => dlg.element.querySelector("input[name=who]:checked")?.value ?? null }],
      rejectClose: false
    }).catch(() => null);
    return id && id !== "ok" ? id : null;
  }

  /** Boutons « une fois posé » d'un objet au sol (le personnage qui interagit les utilise). */
  static async #placedActions(item, actor) {
    const { actionsOf } = await import("../../builder/item-actions.mjs");
    try {
      return await asCarrier(item, actor, () => actionsOf(item, { outside: false })
        .filter(a => PropManager.isPlacedAction(item, a.el)));
    } catch (_e) { return []; }
  }

  static async #open(td, actor) {
    const tok = canvas.tokens?.controlled?.find(t => t.actor === actor) ?? null;
    if (!game.user.isGM) {
      if (!actor) { ui.notifications.warn(L("SBE.Ground.SelectToken")); return; }
      if (!this.#near(tok, td.object?.center ?? { x: td.x, y: td.y })) {
        ui.notifications.warn(L("SBE.Ground.TooFar", { n: this.#maxDistance() })); return;
      }
    }
    const old = this.#windows.get(td.uuid);
    if (old) { old.bringToFront?.(); return; }
    const body = async () => {
      /* Objets « MJ seulement » (option du modèle) : cachés aux joueurs. */
      const list = this.#entries(td).filter(i => game.user.isGM || !isGmOnlyItem(i));
      if (!list.length) return `<p class="notes">${L("SBE.Ground.Empty")}</p>`;
      /* Repères d'icône (halo, petites icônes…) comme dans un inventaire. */
      /* Repères et info-bulle de l'objet (comme dans un inventaire). */
      let inv = new Map();
      try { inv = new Map((buildInventory(td.actor).all ?? []).map(e => [e.id, e])); } catch (_e) { /* */ }
      const rows = [];
      for (const it of list) {
        const q = qtyOf(it);
        const acts = actor ? await this.#placedActions(it, actor) : [];
        rows.push(`
        <div class="sbe-ground-row" data-entry="${esc(it.id)}">
          <span class="sbe-ground-icon"${inv.has(it.id) ? itemTipAttr(inv.get(it.id), game.user.isGM) : ""}>${withMarks(`<img src="${esc(it.img)}" alt="">`, inv.get(it.id)?.marks, "sbe-mk-fill")}</span>
          <span class="sbe-ground-name">${esc(it.name)}</span>
          ${q > 1 ? `<span class="sbe-ground-qty">×${q}</span>` : ""}
          ${actor ? `<button type="button" data-do="take"><i class="fa-solid fa-hand"></i> ${L("SBE.Ground.Take")}</button>` : ""}
          <button type="button" data-do="give"><i class="fa-solid fa-hand-holding-heart"></i> ${L("SBE.Ground.GiveTo")}</button>
          ${acts.length ? `<div class="sbe-ground-acts">${acts.map(a => `<button type="button" data-do="run" data-id="${esc(a.id)}" ${a.disabled ? "disabled" : ""}
            ${a.reason ? `data-tooltip-text="${esc(a.reason)}"` : ""}>${a.icon ? `<i class="${esc(a.icon)}"></i> ` : ""}${esc(a.label)}</button>`).join("")}</div>` : ""}
        </div>`);
      }
      return `<div class="sbe-ground-list">${rows.join("")}</div>`;
    };
    const dlg = new foundry.applications.api.DialogV2({
      window: { title: this.#entries(td).length > 1 ? L("SBE.Ground.BagTitle") : L("SBE.Ground.ItemTitle"), icon: "fa-solid fa-sack" },
      position: { width: 440 },
      classes: ["sbe-ground-app"],
      content: `<div class="sbe-ground-body">${await body()}</div>`,
      buttons: [{ action: "close", label: L("SBE.Common.Close"), icon: "fa-solid fa-xmark" }]
    });
    const wire = () => {
      const root = dlg.element;
      if (!root) { setTimeout(wire, 30); return; }
      root.querySelector(".sbe-ground-body")?.addEventListener("click", async (ev) => {
        const b = ev.target.closest("button[data-do]");
        const row = b?.closest(".sbe-ground-row");
        if (!row) return;
        const it = td.actor?.items?.get(row.dataset.entry);
        if (!it) return;
        if (b.dataset.do === "run") {
          const { runAction } = await import("../../builder/item-actions.mjs");
          await asCarrier(it, actor, () => runAction(it, b.dataset.id));
          return;
        }
        const give = b.dataset.do === "give";
        const to = give ? await fromUuid(await this.#askRecipient(actor) ?? "").catch(() => null) : actor;
        if (!to) return;
        await PropManager.moveOut({ item: it, sheetDoc: to, notify: give ? "SBE.Ground.Given" : "SBE.Ground.Picked" });
      });
      /* Glisser un objet par son ICÔNE vers une fiche : comme Prendre,
         dans le contenant visé. */
      for (const row of root.querySelectorAll(".sbe-ground-row[data-entry]")) {
        const grip = row.querySelector(".sbe-ground-icon img");
        if (!grip) continue;
        grip.setAttribute("draggable", "true");
        grip.classList.add("sbe-drag-grip");
        grip.addEventListener("dragstart", (ev) => {
          ev.stopPropagation();
          const it = td.actor?.items?.get(row.dataset.entry);
          if (!it) { ev.preventDefault(); return; }
          ev.dataTransfer?.setData("text/plain", JSON.stringify(PropManager.dragData(it)));
        });
      }
    };
    dlg.refresh = async () => {
      const box = dlg.element?.querySelector(".sbe-ground-body");
      if (box) box.innerHTML = await body();
    };
    dlg.addEventListener("close", () => this.#windows.delete(td.uuid), { once: true });
    this.#windows.set(td.uuid, dlg);
    await dlg.render({ force: true });
    setTimeout(wire, 30);
  }
}
