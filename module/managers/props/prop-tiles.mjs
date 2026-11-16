/**
 * SBE — TUILES INTERACTIVES et DÉCLENCHEURS des objets de scène
 *
 * 1. ACCROCHER un objet de scène à une TUILE du décor : SBE pose un pion
 *    d'objet de scène INVISIBLE à la place et à la taille de la tuile.
 *    Tout le reste (panneau, boutons, distance, droits, PV) est celui des
 *    objets de scène. La tuile reste le visuel : l'« image selon une clé »
 *    de l'objet change l'image de la TUILE (son image d'origine est
 *    gardée pour y revenir). Le pion suit la tuile (déplacée, tournée,
 *    redimensionnée) et disparaît avec elle.
 *    Deux façons de relier (MJ) : l'encart SBE de la configuration de la
 *    tuile, ou glisser un objet du monde sur la tuile, sur la carte.
 *    Tuile : flags.sbe.propToken = id du pion ; pion : flags.sbe.prop.tile.
 *
 * 1 bis. ACCROCHER un objet de scène à une RÉGION de la scène : même
 *    principe, mais le pion (à l'image et à la taille de l'objet) se pose
 *    au centre de la région, et la région donne sa FORME : un piège s'y
 *    déclenche (trap-manager). Le pion suit la région et disparaît avec
 *    elle. Région : flags.sbe.propToken ; pion : flags.sbe.prop.region.
 *
 * 1 ter. ACCROCHER un objet de scène à une PORTE (mur avec porte) : un
 *    pion invisible au milieu de la porte ; la porte est d'office dans
 *    les liens de l'objet (étape « Scène → Porte » sans rien régler). Un
 *    clic sur la porte ouvre le panneau de l'objet au lieu de l'ouvrir
 *    (ce sont ses boutons qui l'ouvrent : digicode, lecteur…) ; le MJ
 *    garde le clic droit natif (verrouiller). Mur : flags.sbe.propToken ;
 *    pion : flags.sbe.prop.wall.
 *
 * 2. DÉCLENCHEURS (réglages d'objet de scène : roue du modèle, onglet
 *    Scène) :
 *    - double-clic (PropManager) ;
 *    - À L'APPROCHE : un pion de personnage finit son déplacement à la
 *      distance réglée (en y ENTRANT) → le panneau, ou un bouton ;
 *      chaque fois / une fois par personnage / une seule fois ;
 *    - OBJET GLISSÉ DESSUS (depuis un inventaire) → un bouton, l'objet
 *      glissé devient « l'objet choisi » de ses étapes (picked_…).
 *    Ils se lancent chez celui qui a bougé ou glissé, au nom de son
 *    personnage.
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { isPrimaryGM } from "../../helpers/socket.mjs";
import { walkElements } from "../../builder/element-renderer.mjs";
import { carrierOf, isDroppableItem } from "../../builder/inventory.mjs";
import { PropManager } from "./prop-manager.mjs";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (x) => foundry.utils.escapeHTML(String(x ?? ""));
/* Sur la tuile ou la région : l'id du pion accroché. */
const TILE_FLAG = "propToken";

export class PropTiles {

  static init() {
    /* Le pion suit sa tuile ; il disparaît avec elle. */
    Hooks.on("updateTile", (tile, changes) => {
      if (!isPrimaryGM() || !this.tokenOf(tile)) return;
      const geo = ["x", "y", "width", "height", "rotation", "shape", "texture"].some(k => k in changes);
      if (geo) this.#follow(tile);
    });
    Hooks.on("deleteTile", (tile) => {
      if (!isPrimaryGM()) return;
      this.tokenOf(tile)?.delete();
    });
    /* Le pion suit sa région ; il disparaît avec elle. */
    Hooks.on("updateRegion", (region, changes) => {
      if (!isPrimaryGM() || !this.tokenOf(region) || !("shapes" in changes)) return;
      this.#followRegion(region);
    });
    Hooks.on("deleteRegion", (region) => {
      if (!isPrimaryGM()) return;
      this.tokenOf(region)?.delete();
    });
    /* … et sa porte. */
    Hooks.on("updateWall", (wall, changes) => {
      if (!isPrimaryGM() || !this.tokenOf(wall) || !("c" in changes)) return;
      this.#followWall(wall);
    });
    Hooks.on("deleteWall", (wall) => {
      if (!isPrimaryGM()) return;
      this.tokenOf(wall)?.delete();
    });
    Hooks.on("renderWallConfig", (app, element) => {
      try { this.#configBox(app, element instanceof HTMLElement ? element : element?.[0]); }
      catch (err) { console.warn("SBE | Porte : encart de configuration", err); }
    });
    /* Clic sur une porte qui porte un objet : son panneau. */
    const Door = CONFIG.Canvas.doorControlClass;
    const M = this;
    CONFIG.Canvas.doorControlClass = class SBEDoorControl extends Door {
      _onMouseDown(event) {
        const td = event?.button === 0 ? M.tokenOf(this.wall?.document) : null;
        if (!td) return super._onMouseDown(event);
        event.stopPropagation();
        if (game.paused && !game.user.isGM) {
          ui.notifications.warn("GAME.PausedWarning", { localize: true });
          return false;
        }
        PropManager.open(td);
        return false;
      }
    };
    /* Le pion supprimé (repris, détruit) : la tuile n'est plus accrochée
       et retrouve son image d'origine. */
    Hooks.on("deleteToken", (td) => {
      if (!isPrimaryGM()) return;
      const f = PropManager.flagsOf(td);
      const host = f.region ? td.parent?.regions?.get(f.region) : f.wall ? td.parent?.walls?.get(f.wall) : null;
      if (host?.getFlag(SYSTEM_ID, TILE_FLAG) === td.id) {
        host.update({ [`flags.${SYSTEM_ID}.${TILE_FLAG}`]: foundry.data.operators.ForcedDeletion.create() });
        return;
      }
      if (!f.tile) return;
      const tile = td.parent?.tiles?.get(f.tile);
      if (!tile) return;
      /* Seulement si la tuile pointe encore vers CE pion (pas déjà réaccrochée). */
      if (tile.getFlag(SYSTEM_ID, TILE_FLAG) !== td.id) return;
      const upd = { [`flags.${SYSTEM_ID}.${TILE_FLAG}`]: foundry.data.operators.ForcedDeletion.create() };
      if (f.tileImg && tile.texture?.src !== f.tileImg) upd["texture.src"] = f.tileImg;
      tile.update(upd);
    });

    /* Le pion d'une tuile ne bouge qu'avec elle (pas de glisser, pas de
       flèches du clavier, pas de configuration du pion). */
    Hooks.on("preUpdateToken", (td, changes, options) => {
      const f = PropManager.isPropToken(td) ? PropManager.flagsOf(td) : {};
      if (options?.sbeTileFollow || !(f.tile || f.region || f.wall)) return;
      if (["x", "y", "width", "height", "rotation"].some(k => k in changes)) {
        ui.notifications.info(L(f.region ? "SBE.Region.MoveRegion" : f.wall ? "SBE.DoorProp.MoveDoor" : "SBE.Tile.MoveTile"));
        return false;
      }
    });

    /* À l'ouverture d'une scène : chaque pion recalé sur sa tuile. */
    Hooks.on("canvasReady", () => {
      if (!isPrimaryGM()) return;
      for (const tile of canvas.scene?.tiles ?? []) if (this.tokenOf(tile)) this.#follow(tile);
      for (const region of canvas.scene?.regions ?? []) if (this.tokenOf(region)) this.#followRegion(region);
      for (const wall of canvas.scene?.walls ?? []) if (this.tokenOf(wall)) this.#followWall(wall);
    });

    /* Encart SBE de la configuration de tuile (MJ). */
    Hooks.on("renderTileConfig", (app, element) => {
      try { this.#configBox(app, element instanceof HTMLElement ? element : element?.[0]); }
      catch (err) { console.warn("SBE | Tuile : encart de configuration", err); }
    });
    Hooks.on("renderRegionConfig", (app, element) => {
      try { this.#configBox(app, element instanceof HTMLElement ? element : element?.[0]); }
      catch (err) { console.warn("SBE | Région : encart de configuration", err); }
    });

    /* Approche : le DÉPLACEMENT d'un pion (hook v14 « moveToken » : point
       de départ et étapes parcourues), chez celui qui l'a fait. */
    Hooks.on("moveToken", (td, movement, _operation, user) => {
      if ((user?.id ?? user) !== game.user.id || PropManager.isPropToken(td)) return;
      try { this.#onMove(td, movement); } catch (err) { console.warn("SBE | Approche", err); }
    });
  }

  /* ============================================================ */
  /*  Tuile ↔ objet de scène                                       */
  /* ============================================================ */

  /** Le pion accroché à cette tuile, région ou porte (ou null). */
  static tokenOf(tile) {
    const id = tile?.getFlag?.(SYSTEM_ID, TILE_FLAG);
    const td = id ? tile.parent?.tokens?.get(id) : null;
    return td && PropManager.isPropToken(td) ? td : null;
  }

  /** Centre, taille (px) et angle de la tuile (x / y = point d'ancrage). */
  static #geometry(tile) {
    const w = Number(tile.width) || 0, h = Number(tile.height) || 0;
    const ax = Number(tile.shape?.anchorX ?? tile.texture?.anchorX ?? 0.5);
    const ay = Number(tile.shape?.anchorY ?? tile.texture?.anchorY ?? 0.5);
    const rot = Number(tile.rotation) || 0;
    const r = rot * Math.PI / 180;
    const dx = (0.5 - ax) * w, dy = (0.5 - ay) * h;
    return {
      center: { x: tile.x + dx * Math.cos(r) - dy * Math.sin(r), y: tile.y + dx * Math.sin(r) + dy * Math.cos(r) },
      w, h, rotation: rot
    };
  }

  /** Données de l'exemplaire posé d'un objet du monde. */
  static #propData(worldItem) {
    const d = worldItem.toObject();
    d._id = foundry.utils.randomID();
    d.system = d.system ?? {};
    d.system.modelId = worldItem.id;
    foundry.utils.setProperty(d, "system.carry", { host: "", where: "", x: 0, y: 0, cell: -1 });
    foundry.utils.setProperty(d, "system.values.quantity", 1);
    return d;
  }

  /** L'objet du monde peut-il être accroché ? (message sinon) */
  static #attachable(worldItem) {
    if (worldItem && !worldItem.parent && PropManager.isPropItem(worldItem)) return true;
    /* Un MODÈLE d'atelier glissé à la place d'un objet créé avec lui. */
    const key = worldItem?.type === "template" ? "SBE.Tile.IsModel" : "SBE.Tile.NotProp";
    ui.notifications.warn(L(key, { name: worldItem?.name ?? "" }));
    return false;
  }

  /** MJ : accroche un objet du monde (objet de scène) à cette tuile ou région. */
  static async attach(host, worldItem) {
    if (!game.user.isGM || !host?.id || !worldItem || !this.#attachable(worldItem)) return false;
    if (host.documentName === "Region") return this.#attachRegion(host, worldItem);
    if (host.documentName === "Wall") return this.#attachWall(host, worldItem);
    const tile = host;
    /* Image d'origine : celle d'avant un éventuel objet déjà accroché. */
    const orig = PropManager.flagsOf(this.tokenOf(tile)).tileImg || tile.texture?.src || "";
    await this.detach(tile);
    const scene = tile.parent;
    const gs = scene?.grid?.size || 100;
    const g = this.#geometry(tile);
    const d = this.#propData(worldItem);
    const cfg = PropManager.cfgOf(d);
    const O = CONST.DOCUMENT_OWNERSHIP_LEVELS;
    const td = await PropManager.createToken({
      scene, center: g.center, rotation: g.rotation, name: worldItem.name,
      img: orig || worldItem.img, cfg, alpha: 0,
      size: { w: Math.max(0.1, g.w / gs), h: Math.max(0.1, g.h / gs) },
      items: [d], ownership: { default: cfg.use === "all" ? O.OWNER : O.LIMITED },
      prop: { item: d._id, owner: "", actor: "", user: "", tile: tile.id, tileImg: orig }
    });
    if (!td) { ui.notifications.warn(L("SBE.Prop.Failed")); return false; }
    await tile.setFlag(SYSTEM_ID, TILE_FLAG, td.id);
    /* Image d'état de l'objet, tout de suite. */
    await this.applyState(td, PropManager.itemOf(td), cfg);
    ui.notifications.info(L("SBE.Tile.Attached", { name: worldItem.name }));
    return true;
  }

  /**
   * Région : le pion de l'objet (son image, sa taille) au centre de la
   * région ; un piège prend la forme de la région comme zone.
   */
  static async #attachRegion(region, worldItem) {
    await this.detach(region);
    const scene = region.parent;
    const d = this.#propData(worldItem);
    const cfg = PropManager.cfgOf(d);
    const img = PropManager.imageOf(d, cfg);
    const O = CONST.DOCUMENT_OWNERSHIP_LEVELS;
    let flags;
    if (cfg.trOn) {
      const { TrapManager, TRAP_FLAG } = await import("../traps/trap-manager.mjs");
      flags = { [TRAP_FLAG]: TrapManager.initialFlag(cfg, null) };
    }
    const td = await PropManager.createToken({
      scene, center: this.#regionCenter(region), rotation: 0, name: worldItem.name, img, cfg, flags,
      items: [d], ownership: { default: cfg.use === "all" ? O.OWNER : O.LIMITED },
      prop: { item: d._id, owner: "", actor: "", user: "", region: region.id }
    });
    if (!td) { ui.notifications.warn(L("SBE.Prop.Failed")); return false; }
    await region.setFlag(SYSTEM_ID, TILE_FLAG, td.id);
    ui.notifications.info(L("SBE.Region.Attached", { name: worldItem.name }));
    return true;
  }

  /**
   * Porte : un pion invisible au milieu de la porte ; la porte est d'office
   * dans les liens de l'objet (groupe vide).
   */
  static async #attachWall(wall, worldItem) {
    if (!wall.door) { ui.notifications.warn(L("SBE.DoorProp.NotDoor")); return false; }
    await this.detach(wall);
    const d = this.#propData(worldItem);
    const cfg = PropManager.cfgOf(d);
    const O = CONST.DOCUMENT_OWNERSHIP_LEVELS;
    const td = await PropManager.createToken({
      scene: wall.parent, center: this.#wallCenter(wall), rotation: 0, name: worldItem.name,
      img: worldItem.img, cfg, alpha: 0, size: { w: 1, h: 1 },
      items: [d], ownership: { default: cfg.use === "all" ? O.OWNER : O.LIMITED },
      prop: { item: d._id, owner: "", actor: "", user: "", wall: wall.id,
        links: [{ uuid: wall.uuid, type: "Wall", label: "" }] }
    });
    if (!td) { ui.notifications.warn(L("SBE.Prop.Failed")); return false; }
    await wall.setFlag(SYSTEM_ID, TILE_FLAG, td.id);
    ui.notifications.info(L("SBE.DoorProp.Attached", { name: worldItem.name }));
    return true;
  }

  /** Milieu de la porte. */
  static #wallCenter(wall) {
    const [x1, y1, x2, y2] = wall.c ?? [0, 0, 0, 0];
    return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  }

  /** Le pion suit sa porte (mur déplacé). */
  static async #followWall(wall) {
    const td = this.tokenOf(wall);
    if (!td) return;
    const gs = wall.parent?.grid?.size || 100;
    const c = this.#wallCenter(wall);
    const x = Math.round(c.x - ((td.width ?? 1) * gs) / 2), y = Math.round(c.y - ((td.height ?? 1) * gs) / 2);
    if (Math.abs(td.x - x) < 1 && Math.abs(td.y - y) < 1) return;
    await td.update({ x, y }, { sbeTileFollow: true, animate: false });
  }

  /** Centre de la région (de ses formes). */
  static #regionCenter(region) {
    const b = region.bounds;
    return b?.width ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : { x: 0, y: 0 };
  }

  /** Le pion suit la région (formes changées). */
  static async #followRegion(region) {
    const td = this.tokenOf(region);
    if (!td) return;
    const gs = region.parent?.grid?.size || 100;
    const c = this.#regionCenter(region);
    const x = Math.round(c.x - ((td.width ?? 1) * gs) / 2), y = Math.round(c.y - ((td.height ?? 1) * gs) / 2);
    if (Math.abs(td.x - x) < 1 && Math.abs(td.y - y) < 1) return;
    await td.update({ x, y }, { sbeTileFollow: true, animate: false });
  }

  /** MJ : détache l'objet de la tuile ou de la région. Le pion est
      supprimé ; une tuile retrouve son image d'origine (voir deleteToken). */
  static async detach(host) {
    const td = this.tokenOf(host);
    if (td) return td.delete();
    if (host?.getFlag?.(SYSTEM_ID, TILE_FLAG)) await host.update({ [`flags.${SYSTEM_ID}.${TILE_FLAG}`]: foundry.data.operators.ForcedDeletion.create() });
  }

  /** Le pion invisible suit la tuile. */
  static async #follow(tile) {
    const td = this.tokenOf(tile);
    if (!td) return;
    const gs = tile.parent?.grid?.size || 100;
    const g = this.#geometry(tile);
    const w = Math.max(0.1, g.w / gs), h = Math.max(0.1, g.h / gs);
    const x = Math.round(g.center.x - (w * gs) / 2), y = Math.round(g.center.y - (h * gs) / 2);
    const same = (a, b) => Math.abs((Number(a) || 0) - b) < 0.01;
    if (same(td.x, x) && same(td.y, y) && same(td.width, w) && same(td.height, h) && same(td.rotation, g.rotation)) return;
    await td.update({
      width: w, height: h, rotation: g.rotation,
      x: Math.round(g.center.x - (w * gs) / 2), y: Math.round(g.center.y - (h * gs) / 2)
    }, { sbeTileFollow: true, animate: false });
  }

  /**
   * Image de la tuile selon l'état de l'objet (réglage « image selon une
   * clé ») ; sans état reconnu, son image d'origine.
   */
  static async applyState(td, item, cfg) {
    const f = PropManager.flagsOf(td);
    const tile = f.tile ? td.parent?.tiles?.get(f.tile) : null;
    if (!tile || !item) return;
    let img = f.tileImg || tile.texture?.src || "";
    if (cfg?.stateKey) {
      const v = String(item.system?.values?.[cfg.stateKey] ?? "");
      const hit = (cfg.states ?? []).find(s => s.value === v);
      if (hit) img = hit.img;
    }
    if (img && tile.texture?.src !== img) await tile.update({ "texture.src": img });
  }

  /** Tuile sous ce point (la plus haute), sans objet accroché si `free`. */
  static tileAt(point, { free = false } = {}) {
    const hits = (canvas.tiles?.placeables ?? []).filter(t => {
      if (!t.visible && !game.user.isGM) return false;
      if (free && this.tokenOf(t.document)) return false;
      return t.bounds?.contains?.(point.x, point.y);
    });
    hits.sort((a, b) => (b.document.elevation ?? 0) - (a.document.elevation ?? 0) || (b.document.sort ?? 0) - (a.document.sort ?? 0));
    return hits[0]?.document ?? null;
  }

  /** Région sous ce point (sans objet accroché si `free`). */
  static regionAt(point, { free = false } = {}) {
    for (const r of canvas.scene?.regions ?? []) {
      if (free && this.tokenOf(r)) continue;
      if (r.polygonTree?.testPoint?.(point)) return r;
    }
    return null;
  }

  /** Encart « SBE — Objet interactif » de la configuration d'une tuile, d'une région ou d'une porte. */
  static #configBox(app, root) {
    if (!game.user.isGM || !root || !app.document?.id) return;
    const tile = app.document;
    /* Un mur : seulement une porte. */
    if (tile.documentName === "Wall" && !tile.door) return;
    const K = { Region: "SBE.Region", Wall: "SBE.DoorProp" }[tile.documentName] ?? "SBE.Tile";
    root.querySelector(".sbe-tile-box")?.remove();
    const td = this.tokenOf(tile);
    const item = td ? PropManager.itemOf(td) : null;
    const box = document.createElement("fieldset");
    box.className = "sbe-tile-box";
    box.innerHTML = `
      <legend>${esc(L("SBE.Tile.Legend"))}</legend>
      ${item ? `
        <div class="sbe-tile-linked">
          <img src="${esc(item.img)}" alt="">
          <span class="sbe-tile-name">${esc(item.name)}</span>
          <button type="button" class="sbe-tile-sheet" data-tooltip-text="${esc(L("SBE.Prop.Sheet"))}"><i class="fa-solid fa-file-lines"></i></button>
          <button type="button" class="sbe-tile-detach"><i class="fa-solid fa-link-slash"></i> ${esc(L("SBE.Tile.Detach"))}</button>
        </div>` : ""}
      <div class="sbe-tile-drop"><i class="fa-solid fa-cube"></i> ${esc(L(item ? `${K}.DropReplace` : `${K}.Drop`))}</div>
      <p class="hint">${esc(L(`${K}.Hint`))}</p>`;
    const host = root.querySelector('.tab[data-tab="appearance"], .tab[data-tab="identity"]') ?? root.querySelector("form") ?? root.querySelector(".window-content") ?? root;
    const footer = host.querySelector(":scope > footer, :scope > .form-footer");
    if (footer) host.insertBefore(box, footer); else host.appendChild(box);
    const drop = box.querySelector(".sbe-tile-drop");
    drop.addEventListener("dragover", (ev) => { ev.preventDefault(); drop.classList.add("is-over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
    drop.addEventListener("drop", async (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      drop.classList.remove("is-over");
      let data = null;
      try { data = JSON.parse(ev.dataTransfer.getData("text/plain")); } catch (_e) { return; }
      const it = await PropManager.itemFromDrop(data);
      if (!it) return;
      if (await this.attach(tile, it)) app.render();
    });
    box.querySelector(".sbe-tile-detach")?.addEventListener("click", async () => {
      await this.detach(tile);
      app.render();
    });
    box.querySelector(".sbe-tile-sheet")?.addEventListener("click", () => item?.sheet?.render(true));
  }

  /* ============================================================ */
  /*  Objet glissé sur la carte                                    */
  /* ============================================================ */

  /**
   * Appelé par le dépôt sur la carte (avant le sol). true = pris en charge.
   * - un objet d'inventaire lâché sur un objet posé « objet glissé dessus » ;
   * - MJ : un objet du monde (objet de scène) lâché sur une tuile libre →
   *   Accrocher / Installer / Poser au sol.
   */
  static handleDrop(item, point) {
    const prop = item.parent ? this.#dropTarget(point) : null;
    if (prop) { this.#dropOn(prop, item).catch(err => console.warn("SBE | Objet glissé", err)); return true; }
    if (game.user.isGM && !item.parent && PropManager.isPropItem(item)) {
      const tile = this.tileAt(point, { free: true }) ?? this.regionAt(point, { free: true });
      if (tile) {
        this.#askTile(item, tile.documentName === "Region" ? "SBE.Region" : "SBE.Tile").then(async (choice) => {
          if (choice === "attach") await this.attach(tile, item);
          else if (choice === "install") await PropManager.installAt(item, point);
          else if (choice === "ground") {
            const { GroundItems } = await import("../ground/ground-items.mjs");
            GroundItems.dropFromSheet(item, point);
          }
        });
        return true;
      }
    }
    return false;
  }

  static async #askTile(item, K) {
    return foundry.applications.api.DialogV2.wait({
      window: { title: item.name, icon: "fa-solid fa-cube" },
      content: `<p>${esc(L(`${K}.DropAsk`, { name: item.name }))}</p>`,
      buttons: [
        { action: "attach", label: L(`${K}.Attach`), icon: "fa-solid fa-link", default: true },
        { action: "install", label: L("SBE.Ground.DeployInstall"), icon: "fa-solid fa-screwdriver-wrench" },
        /* « Déposable sur la scène » décoché sur le modèle : pas de « Poser au sol ». */
        ...(isDroppableItem(item) ? [{ action: "ground", label: L("SBE.Ground.Drop"), icon: "fa-solid fa-hand-holding-hand" }] : [])
      ],
      rejectClose: false
    }).catch(() => null);
  }

  /** Objet posé sous ce point qui accepte qu'on lui glisse un objet. */
  static #dropTarget(point) {
    const hits = (canvas.tokens?.placeables ?? []).filter(t => PropManager.isPropToken(t.document)
      && !PropManager.kindOf(t.document) && PropManager.tokenCfg(t.document).dropOn
      && t.bounds?.contains?.(point.x, point.y));
    return hits.at(-1)?.document ?? null;
  }

  static async #dropOn(td, dropped) {
    const cfg = PropManager.tokenCfg(td);
    const actor = carrierOf(dropped);
    if (actor?.documentName !== "Actor") return;
    const target = PropManager.itemOf(td);
    const btn = this.#buttonOf(target, cfg.dropBtn);
    if (!btn) return ui.notifications.warn(L("SBE.Trig.NoButton", { key: cfg.dropBtn }));
    const { itemFormulaOk, pickedVarsOf } = await import("../../builder/item-actions.mjs");
    if (!itemFormulaOk(dropped, cfg.dropIf)) return ui.notifications.warn(L("SBE.Trig.DropRefused", { name: dropped.name, target: target.name }));
    await PropManager.withActor(actor, async () => {
      if (!game.user.isGM && !PropManager.inRange(td, actor)) return ui.notifications.warn(L("SBE.Prop.TooFar"));
      await PropManager.run(td, btn.id, { picked: dropped, vars: pickedVarsOf(dropped) });
    });
  }

  /* ============================================================ */
  /*  Approche                                                     */
  /* ============================================================ */

  /* Déplacements déjà traités (un déplacement peut arriver en plusieurs
     morceaux) : « id du déplacement:id de l'objet ». */
  static #fired = new Set();

  /** Un pion placé en (x, y) est-il à portée de cet objet posé ? (bord à bord) */
  static #near(td, x, y, p, cfg, gs) {
    const w = (td.width ?? 1) * gs, h = (td.height ?? 1) * gs;
    const pw = (p.width ?? 1) * gs, ph = (p.height ?? 1) * gs;
    const dx = Math.max(0, Math.abs(x + w / 2 - (p.x + pw / 2)) - (w + pw) / 2);
    const dy = Math.max(0, Math.abs(y + h / 2 - (p.y + ph / 2)) - (h + ph) / 2);
    return Math.hypot(dx, dy) / gs <= cfg.apRange + 0.01;
  }

  /**
   * Un pion s'est déplacé : pour chaque objet « à l'approche », selon son
   * mode — « s'arrête à portée » (la fin du trajet y entre), « en passant »
   * (le trajet y entre à un moment), ou les deux.
   */
  static #onMove(td, movement) {
    const scene = td.parent;
    const gs = scene?.grid?.size || 100;
    const o = movement?.origin ?? { x: td.x, y: td.y };
    const pts = [{ x: o.x, y: o.y }, ...(movement?.passed?.waypoints ?? []).map(w => ({ x: w.x, y: w.y }))];
    if (pts.length < 2) return;
    /* Le trajet, échantillonné tous les quarts de case. */
    const path = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (gs / 4)));
      for (let k = 1; k <= n; k++) path.push({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n });
    }
    const end = path.at(-1);
    for (const p of scene?.tokens ?? []) {
      if (p === td || !PropManager.isPropToken(p) || PropManager.kindOf(p)) continue;
      const cfg = PropManager.tokenCfg(p);
      if (!cfg.apOn) continue;
      const near = (pt) => this.#near(td, pt.x, pt.y, p, cfg, gs);
      if (near(path[0])) continue;                 /* déjà à portée au départ */
      const stop = cfg.apMode !== "pass" && near(end);
      const pass = cfg.apMode !== "stop" && path.some(near);
      if (!stop && !pass) continue;
      const tag = `${movement?.id ?? foundry.utils.randomID()}:${p.id}`;
      if (this.#fired.has(tag)) continue;
      this.#fired.add(tag);
      if (this.#fired.size > 200) this.#fired.clear();
      this.#approach(p, td).catch(err => console.warn("SBE | Approche", err));
    }
  }

  static async #approach(prop, mover) {
    const cfg = PropManager.tokenCfg(prop);
    const actor = mover.actor;
    if (!actor || actor.type === "prop") return;
    if (cfg.apWho === "players" && !actor.hasPlayerOwner) return;
    const done = PropManager.flagsOf(prop).apDone ?? {};
    if (cfg.apFreq === "once" && done.all) return;
    if (cfg.apFreq === "actor" && (done.actors ?? []).includes(actor.id)) return;
    if (!game.user.isGM && !PropManager.canUse(prop)) return;
    if (cfg.apFreq !== "each") await PropManager.markApproach(prop, actor.id);
    await PropManager.withActor(actor, async () => {
      if (cfg.apAct === "button") {
        const btn = this.#buttonOf(PropManager.itemOf(prop), cfg.apBtn);
        if (!btn) return ui.notifications.warn(L("SBE.Trig.NoButton", { key: cfg.apBtn }));
        await PropManager.run(prop, btn.id);
      } else await PropManager.open(prop);
    });
  }

  /** Bouton d'un objet, par sa clé. */
  static #buttonOf(item, key) {
    const k = String(key ?? "").trim();
    if (!item || !k) return null;
    return [...walkElements(item.system?.template?.system?.elements ?? [])].find(e => e?.kind === "button" && e.key === k) ?? null;
  }
}
