/**
 * SBE — Manager de coffres
 *
 * Repris du premier système du même auteur et transposé en générique :
 * un coffre = un OBJET POSÉ de la sorte « chest » (pion non lié du
 * personnage caché « prop », bouton dans les contrôles) dont le delta
 * porte le CONTENU : de vrais objets (valeurs, usure, état). Ses
 * réglages sont les flags sbe du pion. Double-clic pour l'ouvrir,
 * ouverte au clic, avec fenêtre de contenu rafraîchie en temps réel
 * pour tous les clients, verrous à modes (aucun / MJ / crochetable /
 * joueur / digicode), accès unique, distance d'ouverture.
 *
 * Spécificités SBE (références par clé — rien en dur) :
 * - « champ d'argent » : clé de la future fiche de personnage (menu
 *   déroulant, branchement à venir) ;
 * - « champ de poids » : clé des futurs templates d'objets (idem) ;
 * - les jets de crochetage/piratage pointent une clé de fiche de
 *   personnage (LockCore, branchement à venir) ;
 * - le contenu accueillera les INSTANCES du système d'objets SBE
 *   (drag & drop d'un modèle → instance liée par modelId) — la fenêtre
 *   est prête, le raccordement viendra avec le système d'objets.
 */

import { SYSTEM_ID, audioFormatsHint } from "../../helpers/constants.mjs";
import { onSocketMessage, emitSocket, isPrimaryGM, requestGM, gmQueue } from "../../helpers/socket.mjs";
import { isActorWithinFeet } from "../../helpers/canvas-utils.mjs";
import { buildKeyRefOptions } from "../../helpers/key-refs.mjs";
import { lockStateFromPlayer, LOCK_STATE_KEYS } from "../../helpers/lock-state.mjs";
import { LockCore } from "../locks/lock-core.mjs";
import { refIds, refListHtml, readRefLists, wireRefLists, lockOptionsHtml, readLockOptions, wireLockOptions } from "../locks/lock-access.mjs";
import { askQuantity, qtyOf, QUANTITY_KEY, isStackableItem, isGmOnlyItem, buildInventory, bundleOf, holdsOthers, refuseLocked } from "../../builder/inventory.mjs";
import { withMarks } from "../../builder/icon-marks.mjs";
import { gridDims, gridVars, GRID_CELL_DEFAULT, itemTipAttr } from "../../builder/element-renderer.mjs";
import { UiSound } from "../media/ui-sound.mjs";
import { Money } from "../money/money.mjs";
import { PropManager } from "../props/prop-manager.mjs";
import { openContextMenu } from "../../helpers/context-menu.mjs";
import {
  spatialDims, spatialOf, normRot, footprint, spatialLayout, boardWithout, fits, findSpot,
  spatialBoardHTML, spatialArtHTML, SPATIAL_DEFAULT_COLS, SPATIAL_DEFAULT_ROWS
} from "../../builder/spatial.mjs";
import { wireSpatialBoards, anchorUnder, startPieceDrag } from "../../builder/spatial-ui.mjs";

/* Exemples des cases (placeholders) : traduits, jamais écrits en dur. */
const PH = (k) => foundry.utils.escapeHTML(game.i18n.localize(`SBE.Ph.${k}`));

const NS = SYSTEM_ID;
const DEFAULT_CHEST_IMG = "icons/svg/chest.svg";

const KIND = "chest";
const CARRY0 = { host: "", where: "", x: 0, y: 0, cell: -1 };

/* Le contenu d'un coffre est fait des objets du delta de son pion : le
   registre des emplacements (« tokens ») les couvre déjà (cascade,
   propagation, orphelins). */

/* Place d'une ligne dans la grille spatiale du coffre. */
const posOf = (e) => ({ x: Number(e?.x) || 0, y: Number(e?.y) || 0, rot: normRot(e?.rot), placed: e?.placed === true });

/* Ce qu'un joueur peut changer sur un coffre : l'état de sa serrure et
   l'occupation (accès unique). Tout le reste est réglé par le MJ. */

export class ChestManager {

  static _hooksBound = false;
  /* tileId → DialogV2 (fenêtre unique par coffre). */
  static _openDialogs = new Map();
  static _unlocking = new Set();

  /* ---------------------------------------------------------- */
  /*  INIT                                                       */
  /* ---------------------------------------------------------- */

  static init() {
    if (this._hooksBound) return;
    this._hooksBound = true;

    /* Sorte d'objet posé « coffre » : double-clic = ouvrir. */
    PropManager.registerKind(KIND, {
      cfg: (td) => ({ visibility: "all", use: "all", take: "none", range: 0, showName: !!td.flags?.[NS]?.showName, ignoreCombat: true }),
      open: (td, actor) => this._onDoubleClick(td, actor)
    });

    /* Prendre / donner / argent : exécutés par le MJ principal (un
       joueur ne peut pas écrire sur un coffre ni sur la fiche d'un
       autre), qui renvoie le compte rendu à celui qui a demandé. */
    onSocketMessage(async (p) => {
      if (p?.type === "sbeChestMsg") {
        if (p.userId !== game.user.id) return;
        ui.notifications[p.level === "warn" ? "warn" : "info"](game.i18n.format(p.key, p.data ?? {}));
        return;
      }
      if (!game.user.isGM || !isPrimaryGM()) return;
      if (!["sbeChestUpdate", "sbeChestPlace", "sbeChestDeposit", "sbeChestOp"].includes(p?.type)) return;
      /* Un coffre posé seulement (jamais un autre document). */
      const td = p.sceneId ? game.scenes.get(p.sceneId)?.tokens?.get(p.tokenId) : await fromUuid(p.token ?? "").catch(() => null);
      if (td?.documentName !== "Token" || !td.flags?.[NS]?.isChest) return;
      if (p.type === "sbeChestUpdate") {
        /* Un joueur ne change que l'état de la serrure et l'occupation,
           dans le bon sens (helpers/lock-state) — relu dans la file. */
        return gmQueue(td.uuid, async () => {
          const sender = game.users.get(p._from);
          const ask = foundry.utils.expandObject(foundry.utils.deepClone(p.changes ?? {}))?.flags?.[NS] ?? {};
          const state = sender?.isGM
            ? Object.fromEntries(Object.entries(ask).filter(([k]) => LOCK_STATE_KEYS.includes(k)))
            : lockStateFromPlayer(td.flags?.[NS] ?? {}, ask, p._from);
          const changes = Object.fromEntries(Object.entries(state).map(([k, v]) => [`flags.${NS}.${k}`, v]));
          if (Object.keys(changes).length) await td.update(changes);
        });
      }
      if (p.type === "sbeChestPlace") return gmQueue(td.uuid, () => this._applyEdit(td, { place: p.place ?? {} }));
      if (p.type === "sbeChestDeposit") return this._depositItem(td, String(p.item ?? ""), p.qty, p.at ?? null, p.userId);
      await gmQueue(td.uuid, () => this._execOp(td, p.op ?? {}, p.userId));
    });

    /* Accès unique : un joueur qui part (ou revient, sans fenêtre
       ouverte) libère le coffre qu'il occupait ; au démarrage du MJ,
       les coffres tenus par un absent sont libérés. */
    Hooks.on("userConnected", (user) => { if (!user.isGM) this.#freeOccupied(u => u === user.id); });
    this.#freeOccupied(u => !game.users.get(u)?.active);

    /* Rafraîchissement temps réel : la fenêtre d'un coffre modifié se
       re-render pour tous ceux qui la regardent. */
    Hooks.on("updateToken", (tileDoc, changes) => {
      try {
        if (!tileDoc?.flags?.[NS]?.isChest) return;
        const dlg = this._openDialogs.get(tileDoc.id);
        if (!dlg || dlg._sbeClosed) return;
        if (!foundry.utils.hasProperty(changes, `flags.${NS}`)) return;
        this._refreshDialogContent(tileDoc, dlg);
      } catch (err) { console.warn("SBE | Coffre : refresh auto", err); }
    });
    /* Le contenu (objets du pion) change : la fenêtre suit. */
    for (const h of ["createItem", "updateItem", "deleteItem"]) {
      Hooks.on(h, (item) => {
        const td = item.parent?.isToken ? item.parent.token : null;
        if (!td?.flags?.[NS]?.isChest) return;
        const dlg = this._openDialogs.get(td.id);
        if (dlg && !dlg._sbeClosed) {
          clearTimeout(dlg._sbeItemTimer);
          dlg._sbeItemTimer = setTimeout(() => this._refreshDialogContent(td, dlg), 30);
        }
      });
    }

    /* Purge mémoire. */
    Hooks.on("deleteToken", (tileDoc) => {
      try {
        if (!tileDoc?.flags?.[NS]?.isChest) return;
        const dlg = this._openDialogs.get(tileDoc.id);
        if (dlg) {
          try { dlg.close(); } catch (_e) { /* rien */ }
          this._openDialogs.delete(tileDoc.id);
        }
      } catch (err) { console.warn("SBE | Coffre : purge deleteTile", err); }
    });
    Hooks.on("canvasTearDown", () => {
      for (const dlg of this._openDialogs.values()) {
        try { dlg.close(); } catch (_e) { /* rien */ }
      }
      this._openDialogs.clear();
    });
  }

  /* Adaptateur LockCore pour une tuile coffre. */
  static _adapter(tileDoc) {
    return {
      id: tileDoc.id,
      name: tileDoc.flags?.[NS]?.chestName ?? game.i18n.localize("SBE.Chest.DefaultName"),
      getCfg: () => tileDoc.flags?.[NS] ?? {},
      setCfg: (key, value) => this._setFlagSafe(tileDoc, key, value)
    };
  }

  /* ---------------------------------------------------------- */
  /*  CRÉATION (MJ)                                              */
  /* ---------------------------------------------------------- */

  static async createChest() {
    if (!game.user.isGM) {
      ui.notifications.warn(game.i18n.localize("SBE.Chest.OnlyGMCreate"));
      return null;
    }
    if (!canvas?.scene) {
      ui.notifications.warn(game.i18n.localize("SBE.Chest.NoActiveScene"));
      return null;
    }

    const cfg = await this._promptChestConfig();
    if (!cfg) return null;
    /* Les clés de CE coffre deviennent celles proposées au suivant. */
    await this._rememberKeys(cfg);

    const grid = canvas.grid.size;
    const src = cfg.img || DEFAULT_CHEST_IMG;
    /* Pose : l'image suit la souris, molette = rotation, clic = poser. */
    const size = await this._resolveChestSize(cfg, src, grid);
    const w = size.width / grid, h = size.height / grid;
    const at = await PropManager.aim(src, w, h, true);
    if (!at) return null;
    const tileDoc = await this._createChestTile(cfg, src, { w, h }, at);
    if (!tileDoc) return null;
    ui.notifications.info(game.i18n.localize("SBE.Chest.Placed"));
    /* Pose ET orientation validées : la fenêtre du coffre s'ouvre
       seulement maintenant, pour le remplir. */
    this._openChest(tileDoc, null);
    return tileDoc;
  }

  /** Crée le pion du coffre au point visé (taille en cases). */
  static async _createChestTile(cfg, src, size, at) {
    const tileData = {
      flags: {
        [NS]: {
          isChest: true,
          showName: false,
          schemaVersion: 1,
          chestName: cfg.name,
          view: ["grid", "spatial"].includes(cfg.view) ? cfg.view : "list",
          cellSize: Number(cfg.cellSize) || GRID_CELL_DEFAULT,
          gridCols: Number(cfg.gridCols) || 0,
          gridRows: Number(cfg.gridRows) || 0,
          /* Argent : une bourse (monnaies du manager « Marchands et monnaies »). */
          purse: Money.full(cfg.purse),
          weightKey: cfg.weightKey ?? "",
          weightLimit: Number(cfg.weightLimit ?? 0),
          singleAccess: !!cfg.singleAccess,
          occupiedBy: null,
          openDistance: Number(cfg.openDistance ?? 0),
          /* Verrou à modes. */
          lockMode: cfg.lockMode ?? "none",
          lockAllowed: Array.isArray(cfg.lockAllowed) ? cfg.lockAllowed : [],
          lockRollTarget: cfg.lockRollTarget ?? "",
          lockMaxAttempts: Number(cfg.lockMaxAttempts ?? 0),
          lockAttempts: 0,
          lockBroken: false,
          lockedBy: null,
          /* Digicode. */
          digiLength: Number(cfg.digiLength ?? 4),
          digiCode: String(cfg.digiCode ?? ""),
          digiHackable: !!cfg.digiHackable,
          digiRollTarget: cfg.digiRollTarget ?? "",
          digiMaxAttempts: Number(cfg.digiMaxAttempts ?? 0),
          digiRemember: !!cfg.digiRemember,
          digiUnlockedBy: [],
          digiAlarm: !!cfg.digiAlarm,
          digiSound: String(cfg.digiSound ?? ""),
          /* Clés et outils acceptés (objets du monde), modificateurs. */
          lockKeys: Array.isArray(cfg.lockKeys) ? cfg.lockKeys : [],
          lockTools: Array.isArray(cfg.lockTools) ? cfg.lockTools : [],
          digiTools: Array.isArray(cfg.digiTools) ? cfg.digiTools : [],
          lockToolRequired: !!cfg.lockToolRequired,
          lockRollWithTool: !!cfg.lockRollWithTool,
          lockDiffMode: cfg.lockDiffMode ?? "none",
          lockDiff: String(cfg.lockDiff ?? ""),
          digiToolRequired: !!cfg.digiToolRequired,
          digiRollWithTool: !!cfg.digiRollWithTool,
          digiDiffMode: cfg.digiDiffMode ?? "none",
          digiDiff: String(cfg.digiDiff ?? ""),
          pickedOpen: false,
          /* Sons d'ouverture / fermeture (celui qui ouvre les entend). */
          sounds: UiSound.pairOf(cfg.sounds)
        }
      }
    };

    const td = await PropManager.createToken({
      scene: canvas.scene, center: { x: at.x, y: at.y }, rotation: at.rotation,
      name: cfg.name || game.i18n.localize("SBE.Chest.DefaultName"), img: src, size,
      cfg: { showName: false }, items: [], prop: { kind: KIND }, flags: tileData.flags[NS]
    });
    if (!td) ui.notifications.error(game.i18n.localize("SBE.Chest.CreateFailed"));
    return td;
  }

  /**
   * Résout la taille du coffre selon le mode choisi :
   * - "cells"   : cases de la scène ;
   * - "pixels"  : taille brute en pixels ;
   * - "natural" : taille propre de l'image — un SVG n'en a pas de
   *   fiable, la config impose alors un mode ; si un SVG arrive
   *   quand même ici, repli sûr sur 1×1 case avec avertissement.
   */
  static async _resolveChestSize(cfg, src, grid) {
    if (cfg.sizeMode === "cells") {
      return { width: grid * cfg.widthCells, height: grid * cfg.heightCells };
    }
    if (cfg.sizeMode === "pixels") {
      return { width: cfg.widthPx, height: cfg.heightPx };
    }
    if (/\.svg(\?.*)?$/i.test(src)) {
      ui.notifications.warn(game.i18n.localize("SBE.Chest.SvgNeedsSize"));
      return { width: grid, height: grid };
    }
    try {
      const tex = await foundry.canvas.loadTexture(src);
      const w = Number(tex?.width ?? 0);
      const h = Number(tex?.height ?? 0);
      if (w > 0 && h > 0) return { width: w, height: h };
    } catch (_e) { /* image illisible : repli */ }
    return { width: grid, height: grid };
  }

  /* ---------------------------------------------------------- */
  /*  DIALOG DE CONFIGURATION (création)                         */
  /* ---------------------------------------------------------- */

  /** Les clés retenues du dernier coffre configuré. */
  static _keyDefaults() {
    try { return { ...(game.settings.get(NS, "chestDefaults") ?? {}) }; }
    catch (_e) { return {}; }
  }

  /** Retient les clés choisies (seulement ce qui a changé). */
  static async _rememberKeys(part) {
    const cur = this._keyDefaults();
    const next = { ...cur };
    for (const k of ["weightKey", "lockRollTarget", "digiRollTarget"]) {
      if (k in part) next[k] = part[k] ?? "";
    }
    if ("sounds" in part) next.sounds = UiSound.pairOf(part.sounds);
    const same = (a, b) => JSON.stringify(a ?? "") === JSON.stringify(b ?? "");
    if (Object.keys(next).every(k => same(cur[k], next[k]))) return;
    try { await game.settings.set(NS, "chestDefaults", next); }
    catch (err) { console.warn("SBE | Coffres : clés non retenues", err); }
  }

  static _promptChestConfig() {
    /* Pré-remplies avec les clés du coffre précédent : on règle une
       fois, on enchaîne les poses. */
    const kd = this._keyDefaults();
    const weightKeyOpts = buildKeyRefOptions("item", kd.weightKey ?? "");

    const playerUsers = game.users.filter(u => !u.isGM);
    const USERS_CHECKBOXES = playerUsers.length
      ? playerUsers.map(u => `
          <label style="display:flex;align-items:center;gap:6px;font-size:0.9em;">
            <input type="checkbox" class="sbe-chest-allow-user" data-user="${u.id}">
            ${foundry.utils.escapeHTML(u.name)}${u.character ? ` (${foundry.utils.escapeHTML(u.character.name)})` : ""}
          </label>`).join("")
      : `<span style="font-size:0.85em;opacity:0.6;">${game.i18n.localize("SBE.Chest.NoPlayersInWorld")}</span>`;

    const content = `
      <div class="sbe-chest-config" style="display:flex;flex-direction:column;gap:8px;max-height:65vh;overflow-y:auto;padding-right:8px;scrollbar-gutter:stable;">
        <div class="form-group">
          <label>${game.i18n.localize("SBE.Chest.NameLabel")}</label>
          <input type="text" name="name" value="${game.i18n.localize("SBE.Chest.DefaultName")}">
        </div>

        <div class="form-group">
          <label style="display:flex;align-items:center;gap:6px;">
            <input type="checkbox" name="sizeModeCells">
            ${game.i18n.localize("SBE.Chest.SizeInCells")}
          </label>
          <label style="display:flex;align-items:center;gap:6px;">
            <input type="checkbox" name="sizeModePixels">
            ${game.i18n.localize("SBE.Chest.SizeInPixels")}
          </label>
          <p class="notes" style="margin:2px 0 0;">${game.i18n.localize("SBE.Chest.SizeNaturalHint")}</p>
        </div>

        <div class="sbe-chest-size-cells" style="display:none;gap:8px;">
          <div class="form-group" style="flex:1;">
            <label>${game.i18n.localize("SBE.Chest.WidthCells")}</label>
            <input type="number" name="widthCells" value="1" min="1" step="1">
          </div>
          <div class="form-group" style="flex:1;">
            <label>${game.i18n.localize("SBE.Chest.HeightCells")}</label>
            <input type="number" name="heightCells" value="1" min="1" step="1">
          </div>
        </div>

        <div class="sbe-chest-size-pixels" style="display:none;gap:8px;">
          <div class="form-group" style="flex:1;">
            <label>${game.i18n.localize("SBE.Chest.WidthPx")}</label>
            <input type="number" name="widthPx" value="100" min="1" step="1">
          </div>
          <div class="form-group" style="flex:1;">
            <label>${game.i18n.localize("SBE.Chest.HeightPx")}</label>
            <input type="number" name="heightPx" value="100" min="1" step="1">
          </div>
        </div>

        <div class="form-group">
          <label>${game.i18n.localize("SBE.Common.Image")}</label>
          <div style="display:flex;gap:6px;">
            <input type="text" name="img" value="${DEFAULT_CHEST_IMG}" style="flex:1;">
            <button type="button" class="sbe-chest-pick-img" style="flex:none;width:auto;padding:2px 10px;">
              <i class="fa-solid fa-folder-open"></i>
            </button>
          </div>
        </div>

        <hr>
        ${this._viewFieldsHtml({})}
        <hr>

        <div class="form-group">
          <label>${game.i18n.localize("SBE.Chest.MoneyContained")}</label>
          ${Money.enabled ? Money.inputsHTML("purse", {}) : `<p class="notes" style="margin:2px 0 0;">${game.i18n.localize("SBE.Chest.NoCurrencyHint")}</p>`}
        </div>

        <div class="form-group">
          <label>${game.i18n.localize("SBE.Chest.WeightKey")}</label>
          <select name="weightKey" style="width:100%;">${weightKeyOpts}</select>
          <p class="notes" style="margin:2px 0 0;">${game.i18n.localize("SBE.Chest.WeightKeyHint")}</p>
        </div>
        <div class="form-group">
          <label style="display:flex;align-items:center;gap:6px;">
            <input type="checkbox" name="hasWeightLimit">
            ${game.i18n.localize("SBE.Chest.WeightLimitLabel")}
          </label>
          <input type="number" name="weightLimit" value="0" min="0" step="0.1"
                 placeholder="${game.i18n.localize("SBE.Chest.CapacityMax")}" disabled>
        </div>

        <div class="form-group">
          <label style="display:flex;align-items:center;gap:6px;">
            <input type="checkbox" name="singleAccess">
            ${game.i18n.localize("SBE.Chest.SingleAccess")}
          </label>
        </div>

        <div class="form-group">
          <label>${game.i18n.localize("SBE.Chest.OpenDistance")}</label>
          <input type="number" name="openDistance" value="0" min="0" step="1">
        </div>

        <hr>
        <label style="font-weight:600;">${game.i18n.localize("SBE.Chest.SoundsTitle")}</label>
        ${UiSound.sheetBlockHtml(UiSound.pairOf(kd.sounds), { hint: "SBE.Chest.SoundsHint", open: "SBE.Chest.SoundOpen", close: "SBE.Chest.SoundClose" })}

        <hr>

        <div class="form-group">
          <label>${game.i18n.localize("SBE.Chest.LockMode")}</label>
          <select name="lockMode" class="sbe-chest-lockmode" style="width:100%;">
            <option value="none">${game.i18n.localize("SBE.Chest.LockNone")}</option>
            <option value="mj">${game.i18n.localize("SBE.Chest.LockGM")}</option>
            <option value="normal">${game.i18n.localize("SBE.Chest.LockNormal")}</option>
            <option value="joueur">${game.i18n.localize("SBE.Chest.LockPlayer")}</option>
            <option value="digicode">${game.i18n.localize("SBE.Door.LockTypeDigicode")}</option>
          </select>
        </div>

        <div class="sbe-chest-keys-opts" style="display:none;padding-left:14px;">
          ${refListHtml("lockKeys", [], "SBE.Locks.Keys", "SBE.Locks.KeysHint")}
        </div>

        <div class="sbe-chest-allowed-opts" style="display:none;padding-left:14px;flex-direction:column;gap:4px;">
          <label style="font-size:0.9em;opacity:0.85;">${game.i18n.localize("SBE.Chest.AllowedUsers")}</label>
          ${USERS_CHECKBOXES}
        </div>

        <div class="sbe-chest-lockroll-opts" style="display:none;padding-left:14px;flex-direction:column;gap:6px;">
          <label>${game.i18n.localize("SBE.Locks.PickRoll")}</label>
          <select name="lockRollTarget" style="width:100%;">${LockCore.buildRollOptions(kd.lockRollTarget ?? "")}</select>
          ${lockOptionsHtml("lock", {})}
          ${refListHtml("lockTools", [], "SBE.Locks.PickTools", "SBE.Locks.PickToolsHint")}
          <label>${game.i18n.localize("SBE.Locks.AttemptsBeforeBreak")}</label>
          <input type="number" name="lockMaxAttempts" value="0" min="0" step="1">
        </div>

        <div class="sbe-chest-playerlock-opts" style="display:none;padding-left:14px;">
          <label style="font-size:0.85em;opacity:0.75;font-style:italic;">
            ${game.i18n.localize("SBE.Chest.PlayerLockHint")}
          </label>
        </div>

        <div class="sbe-chest-digicode-opts" style="display:none;padding-left:14px;flex-direction:column;gap:6px;">
          <label>${game.i18n.localize("SBE.Locks.CodeLength")}</label>
          <input type="number" name="digiLength" value="4" min="1" max="12" step="1">
          <label>${game.i18n.localize("SBE.Locks.Code")}</label>
          <input type="text" name="digiCode" value="" inputmode="numeric" pattern="[0-9]*" placeholder="${PH("DigiCode")}">
          <label style="display:flex;align-items:center;gap:6px;">
            <input type="checkbox" name="digiHackable"> ${game.i18n.localize("SBE.Locks.Hackable")}
          </label>
          <div class="sbe-chest-digi-rollopts" style="display:none;flex-direction:column;gap:4px;">
            <label>${game.i18n.localize("SBE.Locks.HackRoll")}</label>
            <select name="digiRollTarget" style="width:100%;">${LockCore.buildRollOptions(kd.digiRollTarget ?? "")}</select>
            ${lockOptionsHtml("digi", {})}
            ${refListHtml("digiTools", [], "SBE.Locks.HackTools", "SBE.Locks.HackToolsHint")}
          </div>
          <label>${game.i18n.localize("SBE.Locks.AttemptsBeforeBreak")}</label>
          <input type="number" name="digiMaxAttempts" value="0" min="0" step="1">
          <label style="display:flex;align-items:center;gap:6px;">
            <input type="checkbox" name="digiRemember"> ${game.i18n.localize("SBE.Locks.RememberAccess")}
          </label>
          <label style="display:flex;align-items:center;gap:6px;">
            <input type="checkbox" name="digiAlarm"> ${game.i18n.localize("SBE.Locks.AlarmOnWrong")}
          </label>
          <div class="sbe-chest-digi-soundopts" style="display:none;flex-direction:column;gap:4px;">
            <label>${game.i18n.localize("SBE.Locks.AlarmSound")}</label>
            <div style="display:flex;gap:6px;">
              <input type="text" name="digiSound" value="" placeholder="sounds/alarm.ogg" style="flex:1;">
              <button type="button" class="sbe-chest-pick-sound" style="flex:none;width:auto;padding:2px 10px;">
                <i class="fa-solid fa-folder-open"></i>
              </button>
            </div>
            <p class="notes">${foundry.utils.escapeHTML(audioFormatsHint())}</p>
          </div>
        </div>
      </div>`;

    return new Promise((resolve) => {
      let captured = null;
      const dlg = new foundry.applications.api.DialogV2({
        window: { title: game.i18n.localize("SBE.Chest.ConfigTitle") },
        position: { width: 460 },
        content,
        buttons: [
          {
            action: "ok", label: game.i18n.localize("SBE.Common.Create"), icon: "fa-solid fa-check", default: true,
            callback: (event, button, dialog) => {
              const el = dialog.element;
              const v = (n) => el.querySelector(`[name="${n}"]`);
              captured = {
                name: v("name")?.value?.trim() || game.i18n.localize("SBE.Chest.DefaultName"),
                sizeMode: v("sizeModeCells")?.checked ? "cells"
                  : (v("sizeModePixels")?.checked ? "pixels" : "natural"),
                widthCells: Math.max(1, Math.floor(Number(v("widthCells")?.value ?? 1))),
                heightCells: Math.max(1, Math.floor(Number(v("heightCells")?.value ?? 1))),
                widthPx: Math.max(1, Math.floor(Number(v("widthPx")?.value ?? 100))),
                heightPx: Math.max(1, Math.floor(Number(v("heightPx")?.value ?? 100))),
                img: v("img")?.value?.trim() || DEFAULT_CHEST_IMG,
                purse: Money.readInputs(el, "purse"),
                weightKey: v("weightKey")?.value ?? "",
                weightLimit: v("hasWeightLimit")?.checked ? Math.max(0, Number(v("weightLimit")?.value ?? 0)) : 0,
                singleAccess: !!v("singleAccess")?.checked,
                openDistance: Math.max(0, Math.floor(Number(v("openDistance")?.value ?? 0))),
                lockMode: v("lockMode")?.value ?? "none",
                lockAllowed: [...el.querySelectorAll(".sbe-chest-allow-user")].filter(c => c.checked).map(c => c.dataset.user),
                lockRollTarget: v("lockRollTarget")?.value ?? "",
                lockMaxAttempts: Math.max(0, Math.floor(Number(v("lockMaxAttempts")?.value ?? 0))),
                digiLength: Math.max(1, Math.floor(Number(v("digiLength")?.value ?? 4))),
                digiCode: (v("digiCode")?.value ?? "").replace(/\D/g, ""),
                digiHackable: !!v("digiHackable")?.checked,
                digiRollTarget: v("digiRollTarget")?.value ?? "",
                digiMaxAttempts: Math.max(0, Math.floor(Number(v("digiMaxAttempts")?.value ?? 0))),
                digiRemember: !!v("digiRemember")?.checked,
                digiAlarm: !!v("digiAlarm")?.checked,
                digiSound: (v("digiSound")?.value ?? "").trim(),
                ...readLockOptions(el),
                ...readRefLists(el),
                sounds: UiSound.readSheet(el),
                ...this._readViewFields(el)
              };
              return "ok";
            }
          },
          { action: "cancel", label: game.i18n.localize("SBE.Common.Cancel"), icon: "fa-solid fa-xmark" }
        ],
        submit: () => resolve(captured)
      });
      dlg.addEventListener("close", () => resolve(captured), { once: true });
      dlg.render({ force: true });

      const wire = () => {
        const el = dlg.element;
        if (!el) { setTimeout(wire, 30); return; }

        UiSound.wire(el);
        this._wireViewFields(el);
        const wl = el.querySelector('[name="hasWeightLimit"]');
        const wlInput = el.querySelector('[name="weightLimit"]');
        wl?.addEventListener("change", () => { if (wlInput) wlInput.disabled = !wl.checked; });

        /* --- Taille : 2 cases exclusives (cases scène / pixels).
           Aucune cochée = taille naturelle de l'image… sauf SVG :
           un SVG n'a pas de taille propre, on impose un mode. --- */
        const sizeCells = el.querySelector('[name="sizeModeCells"]');
        const sizePixels = el.querySelector('[name="sizeModePixels"]');
        const cellsBox = el.querySelector(".sbe-chest-size-cells");
        const pixelsBox = el.querySelector(".sbe-chest-size-pixels");
        const imgField = el.querySelector('[name="img"]');
        const isSvg = () => /\.svg(\?.*)?$/i.test(imgField?.value?.trim() ?? "");
        const syncSizeUI = () => {
          if (cellsBox) cellsBox.style.display = sizeCells?.checked ? "flex" : "none";
          if (pixelsBox) pixelsBox.style.display = sizePixels?.checked ? "flex" : "none";
        };
        const enforceSvg = () => {
          if (isSvg() && !sizeCells?.checked && !sizePixels?.checked) {
            if (sizeCells) sizeCells.checked = true;
            ui.notifications.warn(game.i18n.localize("SBE.Chest.SvgNeedsSize"));
            syncSizeUI();
          }
        };
        sizeCells?.addEventListener("change", () => {
          if (sizeCells.checked && sizePixels) sizePixels.checked = false;
          syncSizeUI(); enforceSvg();
        });
        sizePixels?.addEventListener("change", () => {
          if (sizePixels.checked && sizeCells) sizeCells.checked = false;
          syncSizeUI(); enforceSvg();
        });
        imgField?.addEventListener("change", enforceSvg);
        syncSizeUI();

        const modeSel = el.querySelector(".sbe-chest-lockmode");
        const allowedBox = el.querySelector(".sbe-chest-allowed-opts");
        const rollBox = el.querySelector(".sbe-chest-lockroll-opts");
        const playerBox = el.querySelector(".sbe-chest-playerlock-opts");
        const digiBox = el.querySelector(".sbe-chest-digicode-opts");
        const digiRollBox = el.querySelector(".sbe-chest-digi-rollopts");
        const digiSoundBox = el.querySelector(".sbe-chest-digi-soundopts");
        const syncLockUI = () => {
          const m = modeSel?.value ?? "none";
          if (allowedBox) allowedBox.style.display = (m === "mj") ? "flex" : "none";
          if (rollBox) rollBox.style.display = (m === "normal" || m === "joueur") ? "flex" : "none";
          if (playerBox) playerBox.style.display = (m === "joueur") ? "block" : "none";
          if (digiBox) digiBox.style.display = (m === "digicode") ? "flex" : "none";
          const keysBox = el.querySelector(".sbe-chest-keys-opts");
          if (keysBox) keysBox.style.display = (m === "normal" || m === "joueur" || m === "digicode") ? "block" : "none";
        };
        wireRefLists(el);
        modeSel?.addEventListener("change", syncLockUI);
        syncLockUI();

        const digiHack = el.querySelector('[name="digiHackable"]');
        const digiAlarm = el.querySelector('[name="digiAlarm"]');
        digiHack?.addEventListener("change", () => {
          if (digiRollBox) digiRollBox.style.display = digiHack.checked ? "flex" : "none";
        });
        digiAlarm?.addEventListener("change", () => {
          if (digiSoundBox) digiSoundBox.style.display = digiAlarm.checked ? "flex" : "none";
        });

        el.querySelector(".sbe-chest-pick-img")?.addEventListener("click", () => {
          const imgInput = el.querySelector('[name="img"]');
          const FilePicker = foundry.applications.apps.FilePicker.implementation;
          new FilePicker({
            type: "image",
            current: imgInput?.value,
            callback: (path) => {
              if (imgInput) {
                imgInput.value = path;
                imgInput.dispatchEvent(new Event("change", { bubbles: true }));
              }
            }
          }).render(true);
        });
        el.querySelector(".sbe-chest-pick-sound")?.addEventListener("click", () => {
          const soundInput = el.querySelector('[name="digiSound"]');
          const FilePicker = foundry.applications.apps.FilePicker.implementation;
          new FilePicker({
            type: "audio",
            current: soundInput?.value,
            callback: (path) => { if (soundInput) soundInput.value = path; }
          }).render(true);
        });
      };
      setTimeout(wire, 30);
    });
  }

  /* ---------------------------------------------------------- */
  /*  OUVERTURE AU CLIC                                          */
  /* ---------------------------------------------------------- */

  /** Double-clic sur le pion du coffre (sorte « chest »). */
  static _onDoubleClick(tileDoc, actor) {
    if (!game.user.isGM) {
      if (!actor) {
        ui.notifications.warn(game.i18n.localize("SBE.Chest.SelectTokenNear"));
        return;
      }
      const maxFeet = Number(tileDoc.flags?.[NS]?.openDistance ?? 0);
      const c = tileDoc.object?.center ?? { x: tileDoc.x, y: tileDoc.y };
      if (!isActorWithinFeet(actor, { x: c.x, y: c.y, parent: tileDoc.parent }, maxFeet)) {
        ui.notifications.warn(game.i18n.localize("SBE.Chest.MustBeNear"));
        return;
      }
    }
    this._openChest(tileDoc, actor);
  }

  static async _openChest(tileDoc, actor, internalReopen = false) {
    const flags = tileDoc.flags?.[NS] ?? {};
    const adapter = this._adapter(tileDoc);

    if (!internalReopen) {
      const existing = this._openDialogs.get(tileDoc.id);
      if (existing && !existing._sbeClosed) {
        try { existing.bringToFront?.(); } catch (_e) { /* rien */ }
        return;
      }

      /* Une seule séquence de déverrouillage à la fois par coffre. */
      if (this._unlocking.has(tileDoc.id)) return;
      this._unlocking.add(tileDoc.id);

      try {
        /* === Verrou à modes (le MJ n'est jamais bloqué) === */
        if (!game.user.isGM) {
          const mode = flags.lockMode ?? "none";
          const allowed = Array.isArray(flags.lockAllowed) ? flags.lockAllowed : [];

          if (mode === "mj") {
            if (!allowed.includes(game.user.id)) {
              ui.notifications.warn(game.i18n.localize("SBE.Chest.LockedByGM"));
              return;
            }
          } else if (mode === "normal" && !flags.pickedOpen) {
            /* Clé portée, outil porté : seulement le possible. */
            const res = await LockCore.access(adapter, actor, { pick: true });
            if (res === "none") {
              ui.notifications.warn(game.i18n.localize(flags.lockBroken ? "SBE.Chest.LockBrokenOpen" : "SBE.Locks.Locked"));
              return;
            }
            if (!res) return;
            if (res === "pick") await this._setFlagSafe(tileDoc, "pickedOpen", true);
          } else if (mode === "joueur") {
            const lockedBy = flags.lockedBy;
            if (lockedBy) {
              const canOpenFreely = (lockedBy === game.user.id) || allowed.includes(game.user.id);
              if (!canOpenFreely) {
                const res = await LockCore.access(adapter, actor, { pick: true });
                if (res === "none") {
                  ui.notifications.warn(game.i18n.localize(flags.lockBroken ? "SBE.Chest.LockBrokenOpen" : "SBE.Locks.Locked"));
                  return;
                }
                if (!res) return;
              }
            }
          } else if (mode === "digicode") {
            const remembered = !flags.digiBroken && flags.digiRemember
              && Array.isArray(flags.digiUnlockedBy)
              && flags.digiUnlockedBy.includes(game.user.id);
            if (!remembered) {
              const res = await LockCore.access(adapter, actor, { digi: true });
              if (res === "none") {
                ui.notifications.warn(game.i18n.localize(flags.digiBroken ? "SBE.Chest.DigicodeDeadOpen" : "SBE.Locks.Locked"));
                return;
              }
              if (!res) return;
              if (flags.digiRemember && res !== "key") {
                const list = Array.isArray(flags.digiUnlockedBy) ? [...flags.digiUnlockedBy] : [];
                if (!list.includes(game.user.id)) {
                  list.push(game.user.id);
                  await this._setFlagSafe(tileDoc, "digiUnlockedBy", list);
                }
              }
            }
          }
        }
        /* === Accès unique === */
        if (flags.singleAccess && !game.user.isGM) {
          const occ = flags.occupiedBy;
          /* Un joueur parti sans fermer (onglet fermé, coupure) ne bloque personne. */
          if (occ && occ !== game.user.id && game.users.get(occ)?.active) {
            const occName = game.users.get(occ)?.name ?? "?";
            ui.notifications.warn(game.i18n.format("SBE.Chest.AlreadyInUse", { name: occName }));
            return;
          }
          await this._setFlagSafe(tileDoc, "occupiedBy", game.user.id);
        }
      } finally {
        this._unlocking.delete(tileDoc.id);
      }
    }

    const name = flags.chestName ?? game.i18n.localize("SBE.Chest.DefaultName");
    const content = this._buildChestContent(tileDoc, { tab: "content" });

    const dialog = new foundry.applications.api.DialogV2({
      window: { title: `${name}` },
      position: { width: 480 },
      content,
      buttons: [{ action: "close", label: game.i18n.localize("SBE.Common.Close"), icon: "fa-solid fa-xmark", default: true }]
    });

    this._openDialogs.set(tileDoc.id, dialog);
    dialog._sbeActor = actor;
    dialog._sbeTab = "content";
    /* Sons du coffre : seul celui qui ouvre / ferme les entend. */
    UiSound.play(UiSound.pairOf(flags.sounds).open);
    dialog.addEventListener("close", async () => {
      dialog._sbeClosed = true;
      UiSound.play(UiSound.pairOf(tileDoc.flags?.[NS]?.sounds).close);
      this._openDialogs.delete(tileDoc.id);
      const f = tileDoc.flags?.[NS] ?? {};
      if (f.singleAccess && f.occupiedBy === game.user.id && !game.user.isGM) {
        await this._setFlagSafe(tileDoc, "occupiedBy", null);
      }
    }, { once: true });

    dialog.render({ force: true });

    const wire = () => {
      if (!dialog.element) { setTimeout(wire, 30); return; }
      this._wireChestHandlers(tileDoc, actor, dialog);
    };
    setTimeout(wire, 30);
  }

  /* ---------------------------------------------------------- */
  /*  CONTENU : instances et poids                               */
  /* ---------------------------------------------------------- */

  /** Poids total des entrées (poids unitaire × quantité). */
  static _totalWeight(contents) {
    const t = (contents ?? []).reduce((sum, e) =>
      sum + Number(e?.weight ?? 0) * Number(e?.qty ?? 1), 0);
    /* 0,1 + 0,2 ne doit pas s'afficher 0,30000000000000004. */
    return Math.round(t * 1000) / 1000;
  }

  /**
   * Poids unitaire d'un objet selon la clé de poids du coffre :
   * la valeur de la clé sur l'objet (référence par clé, jamais en dur).
   */
  static _resolveWeight(objItem, weightKey) {
    if (!weightKey) return 0;
    const v = objItem.system?.values?.[weightKey];
    return Number(v ?? 0) || 0;
  }

  /**
   * Dépose un objet (modèle) dans le coffre : crée une INSTANCE
   * (entrée autonome rattachée par sourceId — les IDs restent la
   * source de vérité). Empilable → fusion des quantités.
   */
  static async _dropItemIntoChest(tileDoc, item, at = null) {
    if (item.type === "template") {
      ui.notifications.warn(game.i18n.localize("SBE.Chest.TemplatesNotDroppable"));
      return false;
    }
    if (item.type !== "objet") {
      ui.notifications.warn(game.i18n.localize("SBE.Chest.OnlyObjects"));
      return false;
    }
    const flags = tileDoc.flags?.[NS] ?? {};
    const contents = this._contents(tileDoc);
    const weightKey = String(flags.weightKey ?? "");
    const weightLimit = Number(flags.weightLimit ?? 0);
    const weight = this._resolveWeight(item, weightKey);
    const carried = item.parent?.documentName === "Actor";
    /* Déjà dans CE coffre (glissé d'une case à une autre) : rien. */
    if (carried && item.parent?.isToken && item.parent.token === tileDoc) return false;
    if (carried && refuseLocked(item)) return false;
    /* Un objet du monde ne se dépose que par le MJ. */
    if (!carried && !game.user.isGM) return false;
    const stackable = isStackableItem(item) && !(carried && holdsOthers(item));
    /* Empilable : combien en déposer (la place restante sous la limite de
       poids plafonne la saisie ; le MJ revérifie au moment du dépôt). */
    let n = 1;
    if (stackable) {
      let max = null;
      if (weightKey && weightLimit > 0 && weight > 0) {
        max = Math.floor((weightLimit - this._totalWeight(contents)) / weight + 1e-9);
      }
      if (max !== null && max < 1) {
        ui.notifications.warn(game.i18n.format("SBE.Chest.OverWeight", { total: this._totalWeight(contents) + weight, limit: weightLimit }));
        return false;
      }
      const owned = carried ? qtyOf(item) : null;
      const asked = (carried && owned <= 1) ? 1
        : await askQuantity({ total: owned, max: carried ? Math.min(owned, max ?? owned) : max, name: item.name });
      if (!asked) return false;
      n = asked;
    }
    /* Le MJ fait tout (le coffre ET l'inventaire) : rien ne se perd. */
    if (game.user.isGM) return this._depositItem(tileDoc, item, n, at, game.user.id);
    return requestGM({ type: "sbeChestDeposit", sceneId: tileDoc.parent?.id, tokenId: tileDoc.id, item: item.uuid, qty: n, at, userId: game.user.id });
  }

  /**
   * Dépôt (MJ) : l'objet réel entre dans le coffre puis quitte
   * l'inventaire, dans la même opération, une demande à la fois par coffre.
   * Les limites (poids, cases, place) sont revues sur l'état du moment.
   */
  static _depositItem(tileDoc, ref, qty, at, userId) {
    const uuid = typeof ref === "string" ? ref : ref?.uuid;
    return gmQueue(tileDoc.uuid, async () => {
      /* Relu ici, dans la file : un second dépôt du même objet (double
         clic) le trouve déjà parti et ne fait rien. */
      const item = uuid ? await fromUuid(uuid).catch(() => null) : null;
      if (!item || item.type !== "objet") return this._tell(userId, "SBE.Chest.ActionImpossible", {}, "warn");
      const carried = item.parent?.documentName === "Actor";
      const user = game.users.get(userId);
      if (carried && !(user?.isGM || item.parent.testUserPermission(user, "OWNER"))) return false;
      if (!carried && !user?.isGM) return false;
      if (carried && item.parent?.isToken && item.parent.token === tileDoc) return false;
      const flags = tileDoc.flags?.[NS] ?? {};
      const contents = this._contents(tileDoc);
      const weightKey = String(flags.weightKey ?? "");
      const weightLimit = Number(flags.weightLimit ?? 0);
      const weight = this._resolveWeight(item, weightKey);
      const inner = carried && holdsOthers(item) ? bundleOf(item) : null;
      const stackable = isStackableItem(item) && !inner;
      const n = stackable ? Math.max(1, Math.min(Math.floor(Number(qty) || 1), carried ? qtyOf(item) : Infinity)) : 1;
      if (weightKey && weightLimit > 0) {
        const total = this._totalWeight(contents) + weight * n;
        if (total > weightLimit) return this._tell(userId, "SBE.Chest.OverWeight", { total, limit: weightLimit }, "warn");
      }
      const sourceId = String(item.system?.modelId ?? "") || (carried ? "" : item.id);
      const existing = stackable && sourceId ? contents.find(e => e.sourceId === sourceId && e.stackable) : null;
      /* Grille à lignes fixes : une case par ligne du coffre, pas plus. */
      const gcap = this._viewOf(flags) === "grid" ? gridDims({ config: flags }).cap : 0;
      if (!existing && gcap && contents.length >= gcap) return this._tell(userId, "SBE.Inv.GridFull", {}, "warn");
      /* GRILLE SPATIALE : une nouvelle ligne trouve son rectangle (la case
         visée, sinon le premier emplacement libre) ; une pile garde sa place. */
      let pos = null;
      let place = {};
      if (!existing && this._viewOf(flags) === "spatial") {
        const sd = spatialDims(flags);
        const lay = spatialLayout(this._spatialPieces(contents, tileDoc), sd);
        const sp = spatialOf(item);
        const board = boardWithout(lay, sd);
        const spot = (at && fits(board, at.x, at.y, sp.w, sp.h)) ? { x: at.x, y: at.y } : findSpot(board, sp.w, sp.h);
        if (!spot) return this._tell(userId, "SBE.Inv.SpatialNoRoom", { name: item.name }, "warn");
        place = this._placesOf(contents, this._spatialFrozen(contents, lay));
        pos = { x: spot.x, y: spot.y, rot: 0, placed: true };
      }
      if (existing) await this._applyEdit(tileDoc, { qty: { [existing.id]: n } });
      else {
        const data = inner ? inner[0] : item.toObject();
        if (!inner) delete data._id;
        if (!data.system?.modelId && !carried) foundry.utils.setProperty(data, "system.modelId", item.id);
        await this._applyEdit(tileDoc, { place, add: [{ data, inner: inner ? inner.slice(1) : [], qty: n, pos }] });
      }
      /* L'objet quitte l'inventaire (un objet du monde reste où il est). */
      if (carried) {
        const rest = qtyOf(item) - n;
        if (inner) await item.parent.deleteEmbeddedDocuments("Item", inner.map(d => d._id));
        else if (stackable && rest > 0) await item.update({ [`system.values.${QUANTITY_KEY}`]: rest });
        else await item.delete();
      }
      return true;
    });
  }

  /* ---------------------------------------------------------- */
  /*  PRENDRE / DONNER / ARGENT (exécutés par le MJ)             */
  /* ---------------------------------------------------------- */

  /** Personnages des joueurs (destinataires d'un don, d'un partage). */
  static _playerCharacters() {
    return (game.actors?.contents ?? []).filter(a => a.type === "personnage" && a.hasPlayerOwner)
      .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
  }

  /** Demande une opération : le MJ l'exécute ; un joueur la lui envoie. */
  static async _op(tileDoc, op) {
    if (game.user.isGM) return gmQueue(tileDoc.uuid, () => this._execOp(tileDoc, op, game.user.id));
    requestGM({ type: "sbeChestOp", sceneId: tileDoc.parent?.id, tokenId: tileDoc.id, op, userId: game.user.id });
  }

  /** Compte rendu à celui qui a demandé (local si c'est le MJ). */
  static _tell(userId, key, data = {}, level = "info") {
    if (userId === game.user.id) ui.notifications[level === "warn" ? "warn" : "info"](game.i18n.format(key, data));
    else emitSocket({ type: "sbeChestMsg", userId, key, data, level });
  }

  /**
   * Exécution (MJ principal) — prendre et donner un objet passent par
   * PropManager.moveOut (le vrai objet sort du pion) :
   *   money       : { purse, actorUuids } — partagé à parts égales (le
   *     reste de la division reste dans le coffre) ;
   *   deposit     : { purse, actorUuid } — de la fiche vers le coffre.
   */
  static async _execOp(tileDoc, op, userId) {
    try {
      if (!Money.enabled) return this._tell(userId, "SBE.Chest.NoCurrencyHint", {}, "warn");
      /* Un joueur : pas dans un coffre réservé par le MJ (sauf autorisé),
         et ne dépose que l'argent d'un personnage à lui. */
      const user = game.users.get(userId);
      if (!user) return;
      if (!user.isGM) {
        const f = tileDoc.flags?.[NS] ?? {};
        if (f.lockMode === "mj" && !(Array.isArray(f.lockAllowed) && f.lockAllowed.includes(user.id))) {
          return this._tell(userId, "SBE.Chest.LockedByGM", {}, "warn");
        }
        if (op.kind === "deposit") {
          const from = await fromUuid(op.actorUuid).catch(() => null);
          if (!from?.testUserPermission?.(user, "OWNER")) return this._tell(userId, "SBE.Chest.ActionImpossible", {}, "warn");
        }
      }
      const inChest = this.purseOf(tileDoc);
      if (op.kind === "money") {
        const actors = (await Promise.all((op.actorUuids ?? []).map(u => fromUuid(u).catch(() => null)))).filter(a => a?.documentName === "Actor");
        const want = Money.clean(op.purse);
        if (!actors.length || Money.isEmpty(want) || !Money.covers(inChest, want)) return this._tell(userId, "SBE.Chest.NoMoneyInChest", {}, "warn");
        /* Parts égales, monnaie par monnaie ; le reste reste dans le coffre. */
        const { share } = Money.split(want, actors.length);
        if (Money.isEmpty(share)) return this._tell(userId, "SBE.Chest.MoneyTooLow", { n: actors.length }, "warn");
        for (const a of actors) await Money.move(a, share, 1);
        let given = {};
        for (let i = 0; i < actors.length; i++) given = Money.add(given, share);
        await this._updateSafe(tileDoc, { [`flags.${NS}.purse`]: Money.full(Money.sub(inChest, given)), [`flags.${NS}.money`]: 0 });
        return actors.length === 1
          ? this._tell(userId, "SBE.Chest.MoneyTaken", { actor: actors[0].name, amount: Money.text(share) })
          : this._tell(userId, "SBE.Chest.MoneyShared", { amount: Money.text(share), count: actors.length });
      }
      if (op.kind === "deposit") {
        const actor = await fromUuid(op.actorUuid).catch(() => null);
        if (!actor) return this._tell(userId, "SBE.Chest.ActionImpossible", {}, "warn");
        const give = Money.clean(op.purse);
        if (Money.isEmpty(give) || !Money.covers(Money.purseOf(actor), give)) return this._tell(userId, "SBE.Chest.NoMoney", {}, "warn");
        await Money.move(actor, give, -1);
        await this._updateSafe(tileDoc, { [`flags.${NS}.purse`]: Money.full(Money.add(inChest, give)), [`flags.${NS}.money`]: 0 });
        return this._tell(userId, "SBE.Chest.MoneyDeposited", { actor: actor.name, amount: Money.text(give) });
      }
    } catch (err) {
      console.warn("SBE | Coffre : opération en échec", err);
      this._tell(userId, "SBE.Chest.ActionImpossible", {}, "warn");
    }
  }

  /** L'argent d'un coffre (bourse ; un ancien coffre : son nombre sur sa clé). */
  static purseOf(tileDoc) {
    const f = tileDoc?.flags?.[NS] ?? {};
    if (f.purse && typeof f.purse === "object") return Money.clean(f.purse);
    return Money.fromLegacy(f.money, f.moneyKey);
  }

  /** Fenêtre « Prendre l'argent » : pour moi, entre tous les PJ, ou avec qui l'on veut. */
  static async _askMoney(tileDoc, actor) {
    const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);
    const esc = (v) => foundry.utils.escapeHTML(String(v ?? ""));
    const money = this.purseOf(tileDoc);
    if (Money.isEmpty(money)) { ui.notifications.warn(L("SBE.Chest.NoMoneyInChest")); return; }
    const pcs = this._playerCharacters();
    const content = `
      <div class="sbe-chest-money-dlg">
        <div class="sbe-cmd-f"><span>${L("SBE.Chest.Amount")}</span>
          ${Money.inputsHTML("amount", money, money)}</div>
        <label class="sbe-cmd-f"><span>${L("SBE.Chest.MoneyWho")}</span>
          <select name="who">
            ${actor ? `<option value="me">${esc(L("SBE.Chest.MoneyForMe", { actor: actor.name }))}</option>` : ""}
            <option value="all">${esc(L("SBE.Chest.MoneyShareAll", { n: pcs.length }))}</option>
            <option value="some">${esc(L("SBE.Chest.MoneyShareWith"))}</option>
          </select></label>
        <div class="sbe-cmd-some" hidden>
          ${pcs.map(a => `<label class="sbe-cmd-pc"><input type="checkbox" name="pc" value="${esc(a.uuid)}" ${a === actor ? "checked" : ""}> ${esc(a.name)}</label>`).join("")}
        </div>
      </div>`;
    const res = await foundry.applications.api.DialogV2.wait({
      window: { title: L("SBE.Chest.TakeMoney"), icon: "fa-solid fa-coins" },
      content,
      render: (_ev, dlg) => {
        const root = dlg instanceof HTMLElement ? dlg : dlg?.element;
        const sel = root?.querySelector('[name="who"]');
        const box = root?.querySelector(".sbe-cmd-some");
        sel?.addEventListener("change", () => { if (box) box.hidden = sel.value !== "some"; });
      },
      buttons: [{
        action: "ok", label: L("SBE.Chest.Take"), icon: "fa-solid fa-hand-holding-dollar", default: true,
        callback: (_e, btn) => {
          const fm = btn.form;
          const who = fm.elements.who?.value;
          const uuids = who === "me" ? [actor?.uuid] : who === "all" ? pcs.map(a => a.uuid)
            : [...fm.querySelectorAll('[name="pc"]:checked')].map(c => c.value);
          return { purse: Money.readInputs(fm, "amount", money), uuids: uuids.filter(Boolean) };
        }
      }, { action: "cancel", label: L("SBE.Common.Cancel"), icon: "fa-solid fa-xmark" }],
      rejectClose: false
    }).catch(() => null);
    if (!res || typeof res !== "object") return;
    if (!res.uuids.length) { ui.notifications.warn(L("SBE.Chest.SelectRecipients")); return; }
    await this._op(tileDoc, { kind: "money", purse: res.purse, actorUuids: res.uuids });
  }

  /** Fenêtre « Déposer de l'argent » (depuis sa fiche). */
  static async _askDeposit(tileDoc, actor) {
    const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);
    const have = Money.purseOf(actor);
    if (Money.isEmpty(have)) { ui.notifications.warn(L("SBE.Chest.NoMoney")); return; }
    const purse = await foundry.applications.api.DialogV2.prompt({
      window: { title: L("SBE.Chest.DepositMoney"), icon: "fa-solid fa-coins" },
      content: `<div class="sbe-cmd-f"><span>${L("SBE.Chest.Amount")}</span>${Money.inputsHTML("amount", {}, have)}</div>`,
      ok: { label: L("SBE.Chest.Deposit"), icon: "fa-solid fa-coins",
        callback: (_e, btn) => Money.readInputs(btn.form, "amount", have) },
      rejectClose: false
    }).catch(() => null);
    if (!purse || Money.isEmpty(purse)) return;
    await this._op(tileDoc, { kind: "deposit", purse, actorUuid: actor.uuid });
  }

  /** Choix d'un destinataire (« Donner à… »). */
  static async _askRecipient(exclude = null) {
    const L = (k) => game.i18n.localize(k);
    const esc = (v) => foundry.utils.escapeHTML(String(v ?? ""));
    const pcs = this._playerCharacters().filter(a => a !== exclude);
    if (!pcs.length) { ui.notifications.warn(L("SBE.Chest.NoOtherPlayers")); return null; }
    return foundry.applications.api.DialogV2.prompt({
      window: { title: L("SBE.Chest.GiveTo"), icon: "fa-solid fa-hand-holding-heart" },
      content: `<label class="sbe-cmd-f"><span>${L("SBE.Chest.Recipient")}</span>
        <select name="to">${pcs.map(a => `<option value="${esc(a.uuid)}">${esc(a.name)}</option>`).join("")}</select></label>`,
      ok: { label: L("SBE.Chest.Give"), icon: "fa-solid fa-hand-holding-heart", callback: (_e, btn) => btn.form.elements.to?.value || null },
      rejectClose: false
    }).catch(() => null);
  }

  /* ---------------------------------------------------------- */
  /*  CONTENU HTML DE LA FENÊTRE                                 */
  /* ---------------------------------------------------------- */

  /** Affichage du contenu, réglé par le MJ sur CE coffre : liste ou grille. */
  static _viewOf(flags) {
    return ["grid", "spatial"].includes(flags?.view) ? flags.view : "list";
  }

  /* ---------------------------------------------------------- */
  /*  GRILLE SPATIALE (même moteur que les fiches)               */
  /* ---------------------------------------------------------- */

  /** Pièces d'un coffre : la taille vient de l'objet d'origine. */
  static _spatialPieces(contents, tileDoc = null) {
    return contents.map(e => {
      const sp = spatialOf(tileDoc?.actor?.items?.get(e.id) ?? game.items.get(e.sourceId));
      return {
        id: e.id, name: e.name, w: sp.w, h: sp.h, rot: normRot(e.rot),
        x: Number(e.x) || 0, y: Number(e.y) || 0, placed: e.placed === true, e, sp
      };
    });
  }

  /** Lignes du coffre, avec la place affichée fixée pour celles posées
      « au premier libre » (rien ne bouge en dehors du geste). */
  static _spatialFrozen(contents, lay, patch = {}) {
    const auto = new Map(lay.placed.filter(p => p.auto).map(p => [p.id, p]));
    return contents.map(e => {
      if (patch[e.id]) return { ...e, ...patch[e.id] };
      const p = auto.get(e.id);
      return p ? { ...e, x: p.x, y: p.y, placed: true } : e;
    });
  }

  /** Déplace une ligne dans la grille du coffre. */
  static async _moveEntry(tileDoc, entryId, at) {
    const flags = tileDoc.flags?.[NS] ?? {};
    const contents = this._contents(tileDoc);
    const sd = spatialDims(flags);
    const lay = spatialLayout(this._spatialPieces(contents, tileDoc), sd);
    const me = lay.placed.find(p => p.id === entryId) ?? lay.out.find(p => p.id === entryId);
    if (!me || !at) return false;
    if (!fits(boardWithout(lay, sd, [entryId]), at.x, at.y, me.fw, me.fh)) {
      ui.notifications.warn(game.i18n.localize("SBE.Inv.SpatialBlocked"));
      return false;
    }
    return this._edit(tileDoc, { place: this._placesOf(contents, this._spatialFrozen(contents, lay, { [entryId]: { x: at.x, y: at.y, placed: true } })) });
  }

  /** Pivote une ligne d'un quart de tour (dir 1 : horaire, -1 : anti-horaire). */
  static async _rotateEntry(tileDoc, entryId, dir) {
    const flags = tileDoc.flags?.[NS] ?? {};
    const contents = this._contents(tileDoc);
    const sd = spatialDims(flags);
    const lay = spatialLayout(this._spatialPieces(contents, tileDoc), sd);
    const entry = contents.find(e => e.id === entryId);
    if (!entry) return false;
    const rot = normRot(normRot(entry.rot) + (dir < 0 ? -90 : 90));
    const me = lay.placed.find(p => p.id === entryId);
    if (me) {
      const { fw, fh } = footprint(me.w, me.h, rot);
      if (!fits(boardWithout(lay, sd, [entryId]), me.x, me.y, fw, fh)) {
        ui.notifications.warn(game.i18n.format("SBE.Inv.SpatialNoRotate", { name: entry.name }));
        return false;
      }
    }
    const patch = me ? { x: me.x, y: me.y, placed: true, rot } : { rot };
    return this._edit(tileDoc, { place: this._placesOf(contents, this._spatialFrozen(contents, lay, { [entryId]: patch })) });
  }

  /**
   * Affichage du contenu + réglages de grille (mêmes mots que les
   * conteneurs de fiche : taille des cases, colonnes 0 = auto, lignes
   * 0 = infini = capacité). UN SEUL bloc, à la pose comme sur un coffre
   * posé. « Grille spatiale » : annoncée, pas encore disponible.
   */
  static _viewFieldsHtml(flags = {}) {
    const L = (k) => game.i18n.localize(k);
    const view = this._viewOf(flags);
    const d = gridDims({ config: flags });
    const num = (name, label, value, min, ph) => `
        <label class="sbe-chest-gridf">
          <span>${L(label)}</span>
          <input type="number" name="${name}" value="${value}" min="${min}" step="1" ${ph ? `placeholder="${ph}"` : ""}>
        </label>`;
    return `
      <div class="sbe-chest-viewbox">
        <label class="sbe-chest-gridf">
          <span>${L("SBE.Chest.View")}</span>
          <select name="chestView">
            <option value="list" ${view === "list" ? "selected" : ""}>${L("SBE.Chest.ViewList")}</option>
            <option value="grid" ${view === "grid" ? "selected" : ""}>${L("SBE.Chest.ViewGrid")}</option>
            <option value="spatial" ${view === "spatial" ? "selected" : ""}>${L("SBE.Chest.ViewSpatial")}</option>
          </select>
        </label>
        <div class="sbe-chest-gridopts" ${view === "grid" || view === "spatial" ? "" : "hidden"}>
          ${num("cellSize", "SBE.Inv.CellSize", d.size, 24)}
          ${num("gridCols", "SBE.Inv.GridCols", view === "spatial" ? spatialDims(flags).cols : d.cols, 0)}
          ${num("gridRows", "SBE.Inv.GridRows", view === "spatial" ? spatialDims(flags).rows : d.rows, 0)}
          <p class="notes sbe-chest-gridhint" ${view === "spatial" ? "hidden" : ""}>${L("SBE.Chest.GridHint")}</p>
          <p class="notes sbe-chest-sphint" ${view === "spatial" ? "" : "hidden"}>${L("SBE.Chest.SpatialHint")}</p>
        </div>
      </div>`;
  }

  /** Lit le bloc d'affichage. */
  static _readViewFields(root) {
    const v = (n) => root.querySelector(`[name="${n}"]`);
    const int = (n, min, dflt) => Math.max(min, Math.floor(Number(v(n)?.value ?? dflt) || 0));
    const view = ["grid", "spatial"].includes(v("chestView")?.value) ? v("chestView").value : "list";
    const cellSize = Math.max(24, int("cellSize", 0, GRID_CELL_DEFAULT) || GRID_CELL_DEFAULT);
    /* Grille spatiale : colonnes et lignes obligatoires. */
    if (view === "spatial") {
      return {
        view, cellSize,
        gridCols: int("gridCols", 0, 0) || SPATIAL_DEFAULT_COLS,
        gridRows: int("gridRows", 0, 0) || SPATIAL_DEFAULT_ROWS
      };
    }
    const cols = int("gridCols", 0, 0);
    return {
      view, cellSize,
      gridCols: cols,
      gridRows: cols ? int("gridRows", 0, 0) : 0
    };
  }

  /** Branche le bloc : les réglages de grille suivent le choix. */
  static _wireViewFields(root, onChange = null) {
    const box = root.querySelector(".sbe-chest-viewbox");
    if (!box) return;
    const sync = () => {
      const view = box.querySelector('[name="chestView"]')?.value;
      const opts = box.querySelector(".sbe-chest-gridopts");
      if (opts) opts.hidden = view !== "grid" && view !== "spatial";
      const rows = box.querySelector('[name="gridRows"]');
      if (rows) rows.disabled = view === "grid" && !(Number(box.querySelector('[name="gridCols"]')?.value) > 0);
      for (const inp of box.querySelectorAll('[name="gridCols"], [name="gridRows"]')) inp.min = view === "spatial" ? "1" : "0";
      const gh = box.querySelector(".sbe-chest-gridhint");
      const sh = box.querySelector(".sbe-chest-sphint");
      if (gh) gh.hidden = view === "spatial";
      if (sh) sh.hidden = view !== "spatial";
    };
    box.addEventListener("change", () => { sync(); onChange?.(this._readViewFields(box)); });
    sync();
  }

  /**
   * Fenêtre du coffre. MJ : deux onglets — « Contenu » (ce que le coffre
   * contient) et « Configuration » (réglages du coffre posé). Joueur :
   * le contenu seul (et son verrou en mode « joueur »).
   */
  static _buildChestContent(tileDoc, state = {}) {
    const flags = tileDoc.flags?.[NS] ?? {};
    const money = this.purseOf(tileDoc);
    const isGM = game.user.isGM;
    const tab = isGM && state.tab === "config" ? "config" : "content";
    const view = this._viewOf(flags);
    const L = (k) => game.i18n.localize(k);
    const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

    const headerHtml = `
      <div class="sbe-chest-header" style="padding:6px 8px;border:1px solid rgba(0,0,0,0.15);border-radius:4px;margin-bottom:8px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <i class="fa-solid fa-coins"></i>
          <span style="font-weight:600;">${L("SBE.Chest.MoneyLabel")} :</span>
          <span class="sbe-chest-money-val">${Money.html(money)}</span>
        </div>
        ${isGM && Money.enabled ? `<div class="sbe-chest-money-edit" data-tooltip-text="${esc(L("SBE.Chest.EditTotalTitle"))}">${Money.inputsHTML("chestPurse", money)}</div>` : ""}
        ${Money.enabled ? `
        <div class="sbe-chest-money-acts">
          <button type="button" class="sbe-chest-money-take" ${Money.isEmpty(money) ? "disabled" : ""}>
            <i class="fa-solid fa-hand-holding-dollar"></i> ${L(isGM ? "SBE.Chest.DistributeMoney" : "SBE.Chest.TakeMoney")}</button>
          ${isGM ? "" : `<button type="button" class="sbe-chest-money-dep"><i class="fa-solid fa-coins"></i> ${L("SBE.Chest.DepositMoney")}</button>`}
        </div>` : (isGM ? `<p class="notes" style="margin:4px 0 0;">${L("SBE.Chest.NoCurrencyHint")}</p>` : "")}
      </div>`;

    /* Contenu : instances (dépôt par glisser-déposer d'objets). */
    const contents = this._contents(tileDoc);
    const weightKey = String(flags.weightKey ?? "");
    const weightLimit = Number(flags.weightLimit ?? 0);
    const totalWeight = this._totalWeight(contents);
    /* Objets « MJ seulement » (option du modèle) : ils pèsent et prennent
       leur place, mais un joueur ne les voit pas. */
    const seen = (e) => isGM || !e.gmOnly;
    const vis = contents.filter(seen);

    const rows = vis.map(e => `
      <div class="sbe-chest-row" data-entry="${esc(e.id)}"
           style="display:flex;align-items:center;gap:8px;padding:4px 8px;border-bottom:1px solid rgba(0,0,0,0.1);">
        <span class="sbe-chest-icon"${e.tip}>${withMarks(`<img src="${esc(e.img || "icons/svg/item-bag.svg")}" alt="">`, e.marks, "sbe-mk-fill")}</span>
        <span style="flex:1;">${esc(e.name)}</span>
        ${weightKey ? `<span style="font-size:0.8em;opacity:0.65;">${Math.round(Number(e.weight ?? 0) * Number(e.qty ?? 1) * 1000) / 1000}</span>` : ""}
        ${e.stackable ? (isGM ? `
          <button type="button" class="sbe-chest-qty-minus" style="width:auto;padding:0 8px;" title="−">−</button>
          <span class="sbe-chest-qty" style="min-width:26px;text-align:center;">${Number(e.qty ?? 1)}</span>
          <button type="button" class="sbe-chest-qty-plus" style="width:auto;padding:0 8px;" title="+">+</button>`
          : `<span style="min-width:26px;text-align:center;">×${Number(e.qty ?? 1)}</span>`) : ""}
        ${isGM ? `
          <button type="button" class="sbe-chest-row-del" style="width:auto;padding:0 8px;color:#b03030;" title="${L("SBE.Common.Delete")}">
            <i class="fa-solid fa-trash"></i>
          </button>` : ""}
      </div>`).join("");

    /* GRILLE : une case par ligne du coffre ; nom (et poids) au survol,
       quantité en badge. MJ : clic droit = +1 / −1 / supprimer. */
    const cells = vis.map(e => {
      const w = weightKey ? ` — ${Math.round(Number(e.weight ?? 0) * Number(e.qty ?? 1) * 1000) / 1000}` : "";
      const q = Number(e.qty ?? 1);
      return `<div class="sbe-grid-cell sbe-grid-item sbe-chest-cell" data-entry="${esc(e.id)}" ${e.tip || `data-tooltip-text="${esc(e.name + w)}"`}>
        ${withMarks(`<img src="${esc(e.img || "icons/svg/item-bag.svg")}" alt="">`, e.marks, "sbe-mk-fill")}${q > 1 ? `<span class="sbe-grid-qty">×${q}</span>` : ""}
      </div>`;
    }).join("");

    const empty = `<p style="opacity:0.6;text-align:center;padding:12px;">${L("SBE.Chest.Empty")}</p>`;
    /* Grille : taille des cases, colonnes, lignes = capacité (cases
       vides affichées jusqu'à elle). */
    const gd = gridDims({ config: flags });
    const gridBody = () => {
      const pad = gd.cap > vis.length ? `<div class="sbe-grid-cell is-empty"></div>`.repeat(gd.cap - vis.length) : "";
      return `<div class="sbe-grid${gd.cols ? "" : " sbe-grid--auto"} sbe-chest-grid" style="${gridVars({ config: flags })}">${cells}${pad}</div>`;
    };
    /* GRILLE SPATIALE : chaque ligne sur son rectangle ; ce qui ne
       rentre plus (grille réduite) attend sous la grille. */
    const spBody = () => {
      const sd = spatialDims(flags);
      const lay = spatialLayout(this._spatialPieces(contents, tileDoc), sd);
      const placed = lay.placed.filter(p => seen(p.e));
      const out = lay.out.filter(p => seen(p.e));
      const tip = (e) => e.name + (weightKey ? ` — ${Math.round(Number(e.weight ?? 0) * Number(e.qty ?? 1) * 1000) / 1000}` : "");
      const qtyB = (e) => Number(e.qty ?? 1) > 1 ? `<span class="sbe-grid-qty">×${Number(e.qty ?? 1)}</span>` : "";
      const board = spatialBoardHTML({
        d: sd, placed, live: true,
        piece: (p) => ({
          cls: "sbe-grid-item sbe-chest-cell",
          attrs: `data-entry="${esc(p.id)}" draggable="true" ${p.e.tip || `data-tooltip-text="${esc(tip(p.e))}"`}`,
          inner: withMarks(spatialArtHTML({ img: p.sp.img || p.e.img, w: p.sp.w, h: p.sp.h, rot: p.rot, fit: p.sp.fit }), p.e.marks, "sbe-mk-fill sbe-sp-host") + qtyB(p.e)
        })
      });
      if (!out.length) return board;
      const outs = out.map(p => `<div class="sbe-sp-outitem sbe-grid-cell sbe-grid-item sbe-chest-cell" data-entry="${esc(p.id)}" data-piece-id="${esc(p.id)}" data-fw="${p.fw}" data-fh="${p.fh}" draggable="true" ${p.e.tip || `data-tooltip-text="${esc(tip(p.e))}"`}>
          <img src="${esc(p.sp.img || p.e.img || "icons/svg/item-bag.svg")}" alt="">${qtyB(p.e)}</div>`).join("");
      return `${board}<div class="sbe-wait-band" style="--sbe-sp-cell:${sd.size}px;--sbe-grid-cell:${sd.size}px">
          <div class="sbe-wait-head"><i class="fa-solid fa-triangle-exclamation"></i>
            <span>${esc(game.i18n.format("SBE.Inv.SpatialOut", { n: out.length }))}</span></div>
          <p class="notes">${L("SBE.Inv.SpatialOutHint")}</p>
          <div class="sbe-wait-list">${outs}</div></div>`;
    };
    const body = view === "spatial" ? spBody()
      : view === "grid" ? (vis.length || gd.cap ? gridBody() : empty)
      : (!vis.length ? empty : rows);

    const weightLine = weightKey ? `
      <div style="display:flex;justify-content:flex-end;gap:6px;font-size:0.85em;opacity:0.8;margin-top:4px;">
        <i class="fa-solid fa-weight-hanging"></i>
        <span>${totalWeight}${weightLimit > 0 ? ` / ${weightLimit}` : ""}</span>
      </div>` : "";

    const listHtml = `
      <div class="sbe-chest-list sbe-chest-list--${view}" style="max-height:300px;overflow-y:auto;border:1px solid rgba(0,0,0,0.15);border-radius:4px;min-height:60px;">
        ${body}
      </div>
      ${weightLine}
      <div style="text-align:center;font-size:0.8em;opacity:0.6;margin-top:6px;font-style:italic;">
        <i class="fa-solid fa-hand-holding"></i> ${L("SBE.Chest.DropHint")} · ${L("SBE.Chest.ClickItemHint")}
      </div>`;

    const contentTab = `${headerHtml}${listHtml}${isGM ? "" : this._buildLockPlayerSection(flags)}`;
    if (!isGM) return `<div class="sbe-chest-dialog">${contentTab}</div>`;

    const configTab = `
      <div class="sbe-chest-gm-view" style="padding:6px 8px;background:rgba(0,0,0,0.05);border-radius:4px;margin-bottom:8px;">
        ${this._viewFieldsHtml(flags)}
      </div>
      ${this._buildCapacityGMSection(flags)}
      <div class="sbe-chest-gm-dist" style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:rgba(0,0,0,0.05);border-radius:4px;">
        <label style="flex:1;font-size:0.9em;">${L("SBE.Chest.OpenDistance")}</label>
        <input type="number" class="sbe-chest-dist-edit" value="${Number(flags.openDistance ?? 0)}" min="0" step="1" style="width:90px;">
      </div>
      ${this._buildLockGMSection(flags)}
      <details class="sbe-chest-sounds" style="margin-top:8px;padding:6px 8px;background:rgba(0,0,0,0.05);border-radius:4px;">
        <summary style="cursor:pointer;font-weight:600;">${L("SBE.Chest.SoundsTitle")}</summary>
        ${UiSound.sheetBlockHtml(UiSound.pairOf(flags.sounds), { hint: "SBE.Chest.SoundsHint", open: "SBE.Chest.SoundOpen", close: "SBE.Chest.SoundClose" })}
      </details>
      <div style="margin-top:12px;">
        <button type="button" class="sbe-chest-delete" style="width:auto;padding:4px 12px;color:#b03030;">
          <i class="fa-solid fa-trash"></i> ${L("SBE.Chest.DeleteChest")}
        </button>
      </div>`;

    const tabLink = (id, icon, key) =>
      `<a class="sbe-chest-tablink${tab === id ? " active" : ""}" data-ctab="${id}"><i class="fa-solid ${icon}"></i> ${L(key)}</a>`;
    return `
      <div class="sbe-chest-dialog">
        <nav class="sbe-chest-tabs">${tabLink("content", "fa-box-open", "SBE.Chest.TabContent")}${tabLink("config", "fa-gear", "SBE.Chest.TabConfig")}</nav>
        <section class="sbe-chest-tab" data-ctab="content"${tab === "content" ? "" : " hidden"}>${contentTab}</section>
        <section class="sbe-chest-tab" data-ctab="config"${tab === "config" ? "" : " hidden"}>${configTab}</section>
      </div>`;
  }

  /** Poids et accès (MJ) : modifiables sur un coffre déjà posé. */
  static _buildCapacityGMSection(flags) {
    const L = (k) => game.i18n.localize(k);
    const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
    const limit = Number(flags.weightLimit ?? 0);
    const occ = flags.occupiedBy ? (game.users.get(flags.occupiedBy)?.name ?? "?") : "";
    return `
      <div class="sbe-chest-gm-cap" style="display:flex;flex-direction:column;gap:6px;padding:6px 8px;background:rgba(0,0,0,0.05);border-radius:4px;margin-bottom:8px;">
        <label style="display:flex;flex-direction:column;gap:2px;font-size:0.9em;">
          <span>${L("SBE.Chest.WeightKey")}</span>
          <select class="sbe-chest-weightkey-edit" style="width:100%;">${buildKeyRefOptions("item", flags.weightKey ?? "")}</select>
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:0.9em;">
          <input type="checkbox" class="sbe-chest-haslimit-edit" ${limit > 0 ? "checked" : ""}> ${L("SBE.Chest.WeightLimitLabel")}
        </label>
        <input type="number" class="sbe-chest-limit-edit" value="${limit > 0 ? limit : ""}" min="0" step="0.1"
               placeholder="${esc(L("SBE.Chest.CapacityMax"))}" ${limit > 0 ? "" : "disabled"} style="width:120px;">
        <label style="display:flex;align-items:center;gap:6px;font-size:0.9em;">
          <input type="checkbox" class="sbe-chest-single-edit" ${flags.singleAccess ? "checked" : ""}> ${L("SBE.Chest.SingleAccess")}
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:0.9em;">
          <input type="checkbox" class="sbe-chest-showname-edit" ${flags.showName ? "checked" : ""}> ${L("SBE.Chest.ShowName")}
        </label>
        ${flags.singleAccess && occ ? `
        <div style="display:flex;align-items:center;gap:8px;font-size:0.85em;">
          <span><i class="fa-solid fa-user-lock"></i> ${esc(game.i18n.format("SBE.Chest.OccupiedBy", { name: occ }))}</span>
          <button type="button" class="sbe-chest-release" style="width:auto;padding:2px 10px;margin-left:auto;">
            <i class="fa-solid fa-unlock"></i> ${L("SBE.Chest.Release")}
          </button>
        </div>` : ""}
      </div>`;
  }

  /* Section verrou côté MJ (mode + options éditables in situ). */
  static _buildLockGMSection(flags) {
    const mode = flags.lockMode ?? "none";
    const allowed = Array.isArray(flags.lockAllowed) ? flags.lockAllowed : [];
    const opt = (v, label) => `<option value="${v}" ${mode === v ? "selected" : ""}>${label}</option>`;
    const players = game.users.filter(u => !u.isGM);
    const userChecks = players.length
      ? players.map(u => `
          <label style="display:flex;align-items:center;gap:6px;font-size:0.85em;">
            <input type="checkbox" class="sbe-chest-allow-edit" data-user="${u.id}" ${allowed.includes(u.id) ? "checked" : ""}>
            ${foundry.utils.escapeHTML(u.name)}${u.character ? ` (${foundry.utils.escapeHTML(u.character.name)})` : ""}
          </label>`).join("")
      : `<span style="font-size:0.8em;opacity:0.6;">${game.i18n.localize("SBE.Chest.NoPlayersInWorld")}</span>`;

    const rollOpts = LockCore.buildRollOptions(flags.lockRollTarget ?? "");
    const showRoll = (mode === "normal" || mode === "joueur");
    const maxAtt = Number(flags.lockMaxAttempts ?? 0);
    const curAtt = Number(flags.lockAttempts ?? 0);
    const broken = !!flags.lockBroken;

    const stateLine = broken
      ? `<span style="color:#b03030;font-weight:600;"><i class="fa-solid fa-link-slash"></i> ${game.i18n.localize("SBE.Locks.BrokenLabel")}</span>`
      : (maxAtt > 0
        ? `<span style="opacity:0.8;">${game.i18n.format("SBE.Locks.AttemptsN", { cur: curAtt, max: maxAtt })}</span>`
        : `<span style="opacity:0.8;">${game.i18n.localize("SBE.Locks.UnlimitedAttempts")}</span>`);

    const digiRollOpts = LockCore.buildRollOptions(flags.digiRollTarget ?? "");
    const digiMax = Number(flags.digiMaxAttempts ?? 0);
    const digiCur = Number(flags.digiAttempts ?? 0);
    const digiBroken = !!flags.digiBroken;
    const digiState = digiBroken
      ? `<span style="color:#b03030;font-weight:600;"><i class="fa-solid fa-link-slash"></i> ${game.i18n.localize("SBE.Locks.DigicodeBrokenLabel")}</span>`
      : (digiMax > 0
        ? `<span style="opacity:0.8;">${game.i18n.format("SBE.Locks.AttemptsN", { cur: digiCur, max: digiMax })}</span>`
        : `<span style="opacity:0.8;">${game.i18n.localize("SBE.Locks.UnlimitedAttempts")}</span>`);

    return `
      <div class="sbe-chest-gm-lock" style="margin-top:8px;padding:6px 8px;background:rgba(0,0,0,0.05);border-radius:4px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <label style="flex:1;font-size:0.9em;">${game.i18n.localize("SBE.Chest.LockShort")}</label>
          <select class="sbe-chest-lockmode-edit" style="width:auto;">
            ${opt("none", game.i18n.localize("SBE.Chest.LockNone"))}${opt("mj", game.i18n.localize("SBE.Chest.LockGM"))}${opt("normal", game.i18n.localize("SBE.Chest.LockNormal"))}${opt("joueur", game.i18n.localize("SBE.Chest.LockPlayer"))}${opt("digicode", game.i18n.localize("SBE.Door.LockTypeDigicode"))}
          </select>
        </div>
        <div class="sbe-chest-keys-edit" style="margin-top:6px;display:${["normal", "joueur", "digicode"].includes(mode) ? "block" : "none"};">
          ${refListHtml("lockKeys", refIds(flags, "lockKeys"), "SBE.Locks.Keys", "SBE.Locks.KeysHint")}
        </div>
        <div class="sbe-chest-allowlist" style="margin-top:6px;flex-direction:column;gap:2px;display:${mode === "mj" ? "flex" : "none"};">
          <span style="font-size:0.8em;opacity:0.75;">${game.i18n.localize("SBE.Chest.AllowedToOpen")} :</span>
          ${userChecks}
        </div>
        <div class="sbe-chest-rolledit" style="margin-top:6px;flex-direction:column;gap:6px;display:${showRoll ? "flex" : "none"};">
          <span style="font-size:0.8em;opacity:0.75;">${game.i18n.localize("SBE.Locks.PickRoll")} :</span>
          <select class="sbe-chest-lockroll-edit" style="width:100%;">${rollOpts}</select>
          ${lockOptionsHtml("lock", flags)}
          ${refListHtml("lockTools", refIds(flags, "lockTools"), "SBE.Locks.PickTools", "SBE.Locks.PickToolsHint")}
          <div style="display:flex;align-items:center;gap:8px;">
            <label style="flex:1;font-size:0.85em;">${game.i18n.localize("SBE.Locks.AttemptsBeforeBreak")}</label>
            <input type="number" class="sbe-chest-maxatt-edit" value="${maxAtt}" min="0" step="1" style="width:80px;">
          </div>
          <div style="display:flex;align-items:center;gap:8px;font-size:0.85em;">
            ${stateLine}
            <button type="button" class="sbe-chest-resetlock" style="width:auto;padding:3px 10px;margin-left:auto;">
              <i class="fa-solid fa-rotate-left"></i> ${game.i18n.localize("SBE.Common.Reset")}
            </button>
          </div>
        </div>
        <div class="sbe-chest-digi-edit" style="margin-top:6px;flex-direction:column;gap:6px;display:${mode === "digicode" ? "flex" : "none"};">
          <div style="display:flex;align-items:center;gap:8px;">
            <label style="flex:1;font-size:0.85em;">${game.i18n.localize("SBE.Locks.CodeLength")}</label>
            <input type="number" class="sbe-chest-digilen-edit" value="${Number(flags.digiLength ?? 4)}" min="1" max="12" step="1" style="width:70px;">
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <label style="flex:1;font-size:0.85em;">${game.i18n.localize("SBE.Locks.Code")}</label>
            <input type="text" class="sbe-chest-digicode-edit" value="${String(flags.digiCode ?? "")}" inputmode="numeric" pattern="[0-9]*" style="width:120px;">
          </div>
          <label style="display:flex;align-items:center;gap:6px;font-size:0.85em;">
            <input type="checkbox" class="sbe-chest-digihack-edit" ${flags.digiHackable ? "checked" : ""}> ${game.i18n.localize("SBE.Locks.Hackable")}
          </label>
          <div class="sbe-chest-digiroll-editbox" style="flex-direction:column;gap:4px;display:${flags.digiHackable ? "flex" : "none"};">
            <span style="font-size:0.8em;opacity:0.75;">${game.i18n.localize("SBE.Locks.HackRoll")} :</span>
            <select class="sbe-chest-digiroll-edit" style="width:100%;">${digiRollOpts}</select>
            ${lockOptionsHtml("digi", flags)}
            ${refListHtml("digiTools", refIds(flags, "digiTools"), "SBE.Locks.HackTools", "SBE.Locks.HackToolsHint")}
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <label style="flex:1;font-size:0.85em;">${game.i18n.localize("SBE.Locks.AttemptsBeforeBreak")}</label>
            <input type="number" class="sbe-chest-digimax-edit" value="${digiMax}" min="0" step="1" style="width:80px;">
          </div>
          <label style="display:flex;align-items:center;gap:6px;font-size:0.85em;">
            <input type="checkbox" class="sbe-chest-digiremember-edit" ${flags.digiRemember ? "checked" : ""}> ${game.i18n.localize("SBE.Locks.RememberAccess")}
          </label>
          <div style="display:flex;align-items:center;gap:8px;font-size:0.8em;opacity:0.85;">
            <span>${game.i18n.format("SBE.Locks.RememberedCount", { n: Array.isArray(flags.digiUnlockedBy) ? flags.digiUnlockedBy.length : 0 })}</span>
            <button type="button" class="sbe-chest-digiforget" style="width:auto;padding:3px 10px;margin-left:auto;">
              <i class="fa-solid fa-eraser"></i> ${game.i18n.localize("SBE.Locks.Forget")}
            </button>
          </div>
          <label style="display:flex;align-items:center;gap:6px;font-size:0.85em;">
            <input type="checkbox" class="sbe-chest-digialarm-edit" ${flags.digiAlarm ? "checked" : ""}> ${game.i18n.localize("SBE.Locks.AlarmOnWrong")}
          </label>
          <div class="sbe-chest-digisound-editbox" style="flex-direction:column;gap:4px;display:${flags.digiAlarm ? "flex" : "none"};">
            <span style="font-size:0.8em;opacity:0.75;">${game.i18n.localize("SBE.Locks.AlarmSound")} :</span>
            <div style="display:flex;gap:6px;">
              <input type="text" class="sbe-chest-digisound-edit" value="${String(flags.digiSound ?? "")}" placeholder="sounds/alarm.ogg" style="flex:1;">
              <button type="button" class="sbe-chest-digisound-pick" style="flex:none;width:auto;padding:2px 10px;">
                <i class="fa-solid fa-folder-open"></i>
              </button>
            </div>
            <p class="notes" style="margin:0;">${foundry.utils.escapeHTML(audioFormatsHint())}</p>
          </div>
          <div style="display:flex;align-items:center;gap:8px;font-size:0.85em;">
            ${digiState}
            <button type="button" class="sbe-chest-digireset" style="width:auto;padding:3px 10px;margin-left:auto;">
              <i class="fa-solid fa-rotate-left"></i> ${game.i18n.localize("SBE.Common.Reset")}
            </button>
          </div>
        </div>
      </div>`;
  }

  /* Section verrou côté joueur (mode "joueur" uniquement). */
  static _buildLockPlayerSection(flags) {
    if ((flags.lockMode ?? "none") !== "joueur") return "";
    const lockedBy = flags.lockedBy;
    const meId = game.user.id;
    const allowed = Array.isArray(flags.lockAllowed) ? flags.lockAllowed : [];

    if (!lockedBy) {
      return `
        <div class="sbe-chest-player-lock" style="margin-top:8px;padding:6px 8px;background:rgba(0,0,0,0.05);border-radius:4px;display:flex;align-items:center;gap:8px;">
          <span style="flex:1;font-size:0.85em;opacity:0.8;"><i class="fa-solid fa-lock-open"></i> ${game.i18n.localize("SBE.Chest.NotLocked")}</span>
          <button type="button" class="sbe-chest-player-lockbtn" style="width:auto;padding:3px 10px;">
            <i class="fa-solid fa-lock"></i> ${game.i18n.localize("SBE.Chest.LockBtn")}
          </button>
        </div>`;
    }

    if (lockedBy === meId) {
      const players = game.users.filter(u => !u.isGM && u.id !== meId);
      const userChecks = players.length
        ? players.map(u => `
            <label style="display:flex;align-items:center;gap:6px;font-size:0.85em;">
              <input type="checkbox" class="sbe-chest-pallow-edit" data-user="${u.id}" ${allowed.includes(u.id) ? "checked" : ""}>
              ${foundry.utils.escapeHTML(u.name)}${u.character ? ` (${foundry.utils.escapeHTML(u.character.name)})` : ""}
            </label>`).join("")
        : `<span style="font-size:0.8em;opacity:0.6;">${game.i18n.localize("SBE.Chest.NoOtherPlayers")}</span>`;
      return `
        <div class="sbe-chest-player-lock" style="margin-top:8px;padding:6px 8px;background:rgba(0,0,0,0.05);border-radius:4px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="flex:1;font-size:0.85em;"><i class="fa-solid fa-lock"></i> ${game.i18n.localize("SBE.Chest.YouLocked")}</span>
            <button type="button" class="sbe-chest-player-unlockbtn" style="width:auto;padding:3px 10px;">
              <i class="fa-solid fa-lock-open"></i> ${game.i18n.localize("SBE.Chest.UnlockBtn")}
            </button>
          </div>
          <div style="margin-top:6px;display:flex;flex-direction:column;gap:2px;">
            <span style="font-size:0.8em;opacity:0.75;">${game.i18n.localize("SBE.Chest.AllowedToOpen")} :</span>
            ${userChecks}
          </div>
        </div>`;
    }

    const byName = game.users.get(lockedBy)?.name ?? game.i18n.localize("SBE.Chest.APlayer");
    return `
      <div class="sbe-chest-player-lock" style="margin-top:8px;padding:6px 8px;background:rgba(0,0,0,0.05);border-radius:4px;font-size:0.85em;opacity:0.8;">
        <i class="fa-solid fa-lock"></i> ${game.i18n.format("SBE.Chest.LockedByPlayer", { name: byName })}
      </div>`;
  }

  /* Re-render du contenu d'une fenêtre ouverte + re-branchement. */
  static async _refreshDialogContent(tileDoc, dialog) {
    const actor = dialog._sbeActor ?? this._getInteractingActor();
    const html = this._buildChestContent(tileDoc, { tab: dialog._sbeTab });
    try {
      dialog.options.content = html;
      await dialog.render({ force: false });
    } catch (_e) {
      const root = dialog.element?.querySelector(".dialog-content, .window-content");
      if (root) root.innerHTML = html;
    }
    const wire = () => {
      if (!dialog.element) { setTimeout(wire, 20); return; }
      this._wireChestHandlers(tileDoc, actor, dialog);
    };
    setTimeout(wire, 20);
  }

  /* ---------------------------------------------------------- */
  /*  HANDLERS DE LA FENÊTRE                                     */
  /* ---------------------------------------------------------- */

  static _wireChestHandlers(tileDoc, actor, dialog) {
    void actor;
    const root = dialog?.element;
    if (!root) return;

    const container = root.querySelector(".sbe-chest-dialog");
    if (!container || container._sbeWired) return;
    container._sbeWired = true;

    /* Sons du coffre (MJ) : écoute + enregistrement à chaque changement,
       et retenus pour le prochain coffre posé. */
    const soundsBox = root.querySelector(".sbe-chest-sounds");
    if (soundsBox) {
      /* Le contenu se reconstruit à chaque écriture : on garde le
         volet ouvert s'il l'était. */
      if (dialog._sbeSoundsOpen) soundsBox.open = true;
      soundsBox.addEventListener("toggle", () => { dialog._sbeSoundsOpen = soundsBox.open; });
      UiSound.wire(soundsBox);
      soundsBox.addEventListener("change", async () => {
        const sounds = UiSound.readSheet(soundsBox);
        await this._setFlagSafe(tileDoc, "sounds", sounds);
        await this._rememberKeys({ sounds });
      });
    }

    /* Suppression du coffre (MJ). */
    root.querySelector(".sbe-chest-delete")?.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize("SBE.Chest.DeleteChest") },
        content: `<p>${game.i18n.localize("SBE.Chest.DeleteChestConfirm")}</p>`,
        yes: { label: game.i18n.localize("SBE.Common.Delete"), icon: "fa-solid fa-trash" },
        no: { label: game.i18n.localize("SBE.Common.Cancel"), icon: "fa-solid fa-xmark" },
        rejectClose: false
      }).catch(() => false);
      if (!ok) return;
      try { await tileDoc.delete(); }
      catch (err) { console.warn("SBE | Coffre : suppression en échec", err); }
      try { dialog.close(); } catch (_e) { /* rien */ }
    });

    /* Onglets du MJ : bascule sans reconstruire (l'onglet est retenu
       pour les rafraîchissements suivants). */
    for (const a of root.querySelectorAll(".sbe-chest-tablink")) {
      a.addEventListener("click", (ev) => {
        ev.preventDefault();
        dialog._sbeTab = a.dataset.ctab;
        for (const x of root.querySelectorAll(".sbe-chest-tablink")) x.classList.toggle("active", x === a);
        for (const sec of root.querySelectorAll(".sbe-chest-tab")) sec.hidden = sec.dataset.ctab !== a.dataset.ctab;
      });
    }
    /* Liste ou grille : réglage du coffre (MJ), le même pour tous. */
    const gmView = root.querySelector(".sbe-chest-gm-view");
    if (gmView) this._wireViewFields(gmView, async (vals) => {
      for (const [k, v] of Object.entries(vals)) {
        if ((tileDoc.flags?.[NS]?.[k] ?? null) !== v) await this._setFlagSafe(tileDoc, k, v);
      }
    });

    /* === Contenu : dépôt par glisser-déposer + quantités === */
    const list = root.querySelector(".sbe-chest-list");
    if (list) {
      list.addEventListener("dragover", (ev) => ev.preventDefault());
      list.addEventListener("drop", async (ev) => {
        ev.preventDefault();
        let data = null;
        try {
          data = foundry.applications.ux.TextEditor.implementation.getDragEventData(ev);
        } catch (_e) { /* données illisibles */ }
        /* GRILLE SPATIALE : la case visée (pointeur moins prise). */
        const board = ev.target?.closest?.(".sbe-sp");
        const at = board ? anchorUnder(board, ev) : null;
        if (data?.type !== "Item" || !data.uuid) return;
        const item = await PropManager.itemFromDrop(data);
        if (!item) return;
        /* Une ligne du coffre déplacée dans SA grille. */
        if (item.parent?.isToken && item.parent.token === tileDoc) {
          if (!at) return;
          const moved = await this._moveEntry(tileDoc, item.id, at);
          if (moved) this._refreshDialogContent(tileDoc, dialog);
          return;
        }
        const ok = await this._dropItemIntoChest(tileDoc, item, at);
        if (ok) this._refreshDialogContent(tileDoc, dialog);
      });

      /* Grille spatiale : aperçu de la dépose, et les lignes se glissent. */
      wireSpatialBoards(root);
      /* On saisit un objet par son ICÔNE (liste, grille, grille spatiale) :
         dans la grille du coffre, ou vers une fiche (comme « Prendre »,
         dans le contenant visé). */
      for (const node of root.querySelectorAll(".sbe-chest-list [data-entry]")) {
        const grip = node.querySelector("img");
        if (!grip) continue;
        node.setAttribute("draggable", "false");
        grip.setAttribute("draggable", "true");
        grip.classList.add("sbe-drag-grip");
        grip.addEventListener("dragstart", (ev) => {
          ev.stopPropagation();
          const it = tileDoc.actor?.items?.get(node.dataset.entry);
          if (!it) { ev.preventDefault(); return; }
          ev.dataTransfer?.setData("text/plain", JSON.stringify(PropManager.dragData(it)));
          if (node.matches(".sbe-sp-item, .sbe-sp-outitem, [data-piece-id]")) startPieceDrag(ev, node);
        });
      }

      const entryOf = (ev) => {
        const id = ev.target.closest("[data-entry]")?.dataset.entry;
        return { entry: this._contents(tileDoc).find(e => e.id === id) };
      };
      for (const btn of root.querySelectorAll(".sbe-chest-qty-plus")) {
        btn.addEventListener("click", async (ev) => {
          const { entry } = entryOf(ev);
          if (!entry) return;
          await this._edit(tileDoc, { qty: { [entry.id]: 1 } });
          this._refreshDialogContent(tileDoc, dialog);
        });
      }
      for (const btn of root.querySelectorAll(".sbe-chest-qty-minus")) {
        btn.addEventListener("click", async (ev) => {
          const { entry } = entryOf(ev);
          if (!entry) return;
          await this._edit(tileDoc, { qty: { [entry.id]: -1 } });
          this._refreshDialogContent(tileDoc, dialog);
        });
      }
      /* Clic (ou clic droit) sur un objet, en liste comme en grille :
         Prendre, Donner à… ; le MJ a en plus quantité et suppression. */
      const actorNow = () => dialog._sbeActor ?? this._getInteractingActor() ?? game.user.character ?? null;
      const menuFor = (ev) => {
        if (ev.target.closest("button, input, a")) return;
        ev.preventDefault();
        const { entry } = entryOf(ev);
        if (!entry) return;
        const L = (k) => game.i18n.localize(k);
        const me = actorNow();
        const save = async (edit) => { await this._edit(tileDoc, edit); this._refreshDialogContent(tileDoc, dialog); };
        openContextMenu(ev, [
          { label: L("SBE.Chest.Take"), icon: "fa-solid fa-hand", disabled: !me, reason: me ? "" : L("SBE.Chest.SelectTokenTake"),
            onClick: async () => {
              const it = tileDoc.actor?.items?.get(entry.id);
              if (it) await PropManager.moveOut({ item: it, sheetDoc: me, notify: "SBE.Chest.Taken" });
            } },
          { label: L("SBE.Chest.GiveTo"), icon: "fa-solid fa-hand-holding-heart",
            onClick: async () => {
              const to = await fromUuid(await this._askRecipient(me) ?? "").catch(() => null);
              const it = tileDoc.actor?.items?.get(entry.id);
              if (to && it) await PropManager.moveOut({ item: it, sheetDoc: to, notify: "SBE.Chest.Given" });
            } },
          ...(this._viewOf(tileDoc.flags?.[NS]) === "spatial" ? [
            { label: L("SBE.Inv.RotateCw"), icon: "fa-solid fa-rotate-right",
              onClick: async () => { if (await this._rotateEntry(tileDoc, entry.id, 1)) this._refreshDialogContent(tileDoc, dialog); } },
            { label: L("SBE.Inv.RotateCcw"), icon: "fa-solid fa-rotate-left",
              onClick: async () => { if (await this._rotateEntry(tileDoc, entry.id, -1)) this._refreshDialogContent(tileDoc, dialog); } }
          ] : []),
          ...(game.user.isGM ? [
            { separator: true },
            entry.stackable ? { label: L("SBE.Chest.QtyPlus"), icon: "fa-solid fa-plus",
              onClick: () => save({ qty: { [entry.id]: 1 } }) } : null,
            entry.stackable ? { label: L("SBE.Chest.QtyMinus"), icon: "fa-solid fa-minus",
              onClick: () => save({ qty: { [entry.id]: -1 } }) } : null,
            { label: L("SBE.Common.Delete"), icon: "fa-solid fa-trash",
              onClick: () => save({ remove: [entry.id] }) }
          ] : [])
        ].filter(Boolean));
      };
      for (const node of root.querySelectorAll(".sbe-chest-cell, .sbe-chest-row")) {
        node.style.cursor = "pointer";
        node.addEventListener("click", (ev) => menuFor(ev));
        node.addEventListener("contextmenu", (ev) => menuFor(ev));
      }
      for (const btn of root.querySelectorAll(".sbe-chest-row-del")) {
        btn.addEventListener("click", async (ev) => {
          const { entry } = entryOf(ev);
          if (!entry) return;
          await this._edit(tileDoc, { remove: [entry.id] });
          this._refreshDialogContent(tileDoc, dialog);
        });
      }
    }

    /* Argent : prendre (MJ : distribuer) et déposer. */
    root.querySelector(".sbe-chest-money-take")?.addEventListener("click", (ev) => {
      ev.preventDefault();
      this._askMoney(tileDoc, dialog._sbeActor ?? this._getInteractingActor() ?? game.user.character ?? null);
    });
    root.querySelector(".sbe-chest-money-dep")?.addEventListener("click", (ev) => {
      ev.preventDefault();
      const me = dialog._sbeActor ?? this._getInteractingActor() ?? game.user.character ?? null;
      if (!me) { ui.notifications.warn(game.i18n.localize("SBE.Chest.SelectTokenNear")); return; }
      this._askDeposit(tileDoc, me);
    });
    /* Argent : édition directe du contenu, monnaie par monnaie (MJ). */
    const purseBox = root.querySelector(".sbe-chest-money-edit");
    purseBox?.addEventListener("change", async () => {
      const purse = Money.readInputs(purseBox, "chestPurse");
      await this._updateSafe(tileDoc, { [`flags.${NS}.purse`]: Money.full(purse), [`flags.${NS}.money`]: 0 });
      const lbl = root.querySelector(".sbe-chest-money-val");
      if (lbl) lbl.innerHTML = Money.html(purse);
    });

    /* Poids (MJ) : changer la clé recalcule le poids des lignes déjà là
       à partir de leur objet d'origine. */
    root.querySelector(".sbe-chest-weightkey-edit")?.addEventListener("change", async (ev) => {
      /* Le poids se relit sur les objets mêmes : la clé suffit. */
      await this._setFlagSafe(tileDoc, "weightKey", String(ev.target.value ?? ""));
    });
    const limitInp = root.querySelector(".sbe-chest-limit-edit");
    root.querySelector(".sbe-chest-haslimit-edit")?.addEventListener("change", async (ev) => {
      if (limitInp) limitInp.disabled = !ev.target.checked;
      if (!ev.target.checked) await this._setFlagSafe(tileDoc, "weightLimit", 0);
      else limitInp?.focus();
    });
    limitInp?.addEventListener("change", async () => {
      await this._setFlagSafe(tileDoc, "weightLimit", Math.max(0, Number(limitInp.value) || 0));
    });
    /* Accès à un seul personnage à la fois (MJ), et libération forcée. */
    /* Nom au survol (MJ) : masqué par défaut. */
    root.querySelector(".sbe-chest-showname-edit")?.addEventListener("change", async (ev) => {
      const on = !!ev.target.checked;
      await this._updateSafe(tileDoc, {
        [`flags.${NS}.showName`]: on,
        displayName: on ? CONST.TOKEN_DISPLAY_MODES.HOVER : CONST.TOKEN_DISPLAY_MODES.NONE
      });
    });
    root.querySelector(".sbe-chest-single-edit")?.addEventListener("change", async (ev) => {
      await this._setFlagSafe(tileDoc, "singleAccess", !!ev.target.checked);
      if (!ev.target.checked) await this._setFlagSafe(tileDoc, "occupiedBy", null);
    });
    root.querySelector(".sbe-chest-release")?.addEventListener("click", async (ev) => {
      ev.preventDefault();
      await this._setFlagSafe(tileDoc, "occupiedBy", null);
    });

    /* Distance d'ouverture (MJ). */
    root.querySelector(".sbe-chest-dist-edit")?.addEventListener("change", async (ev) => {
      const v = Math.max(0, Math.floor(Number(ev.target.value ?? 0)));
      await this._setFlagSafe(tileDoc, "openDistance", v);
    });

    /* === Verrou — config MJ === */
    root.querySelector(".sbe-chest-lockmode-edit")?.addEventListener("change", async (ev) => {
      await this._setFlagSafe(tileDoc, "lockMode", ev.target.value);
      this._refreshDialogContent(tileDoc, dialog);
    });
    root.querySelectorAll(".sbe-chest-allow-edit").forEach(chk => {
      chk.addEventListener("change", async () => {
        const ids = [...root.querySelectorAll(".sbe-chest-allow-edit")].filter(c => c.checked).map(c => c.dataset.user);
        await this._setFlagSafe(tileDoc, "lockAllowed", ids);
      });
    });
    root.querySelector(".sbe-chest-lockroll-edit")?.addEventListener("change", async (ev) => {
      await this._setFlagSafe(tileDoc, "lockRollTarget", ev.target.value);
      /* Une clé changée par le MJ devient celle des prochains coffres. */
      if (game.user.isGM) await this._rememberKeys({ lockRollTarget: ev.target.value });
    });
    /* Clés et outils acceptés : sauvés au dépôt / au retrait. */
    const lockBox = root.querySelector(".sbe-chest-gm-lock");
    if (lockBox) wireRefLists(lockBox, (field, ids) => this._setFlagSafe(tileDoc, field, ids));
    if (lockBox) wireLockOptions(lockBox, async (k, v) => {
      await this._setFlagSafe(tileDoc, k, v);
      /* L'ancien « modificateur » est repris dans la difficulté : on l'efface. */
      if (/DiffMode$|Diff$/.test(k)) await this._setFlagSafe(tileDoc, k.startsWith("lock") ? "lockRollMod" : "digiRollMod", "");
    });
    root.querySelector(".sbe-chest-maxatt-edit")?.addEventListener("change", async (ev) => {
      const v = Math.max(0, Math.floor(Number(ev.target.value ?? 0)));
      await this._setFlagSafe(tileDoc, "lockMaxAttempts", v);
    });
    root.querySelector(".sbe-chest-resetlock")?.addEventListener("click", async (ev) => {
      ev.preventDefault();
      await this._setFlagSafe(tileDoc, "lockAttempts", 0);
      await this._setFlagSafe(tileDoc, "lockBroken", false);
      await this._setFlagSafe(tileDoc, "pickedOpen", false);
      ui.notifications.info(game.i18n.localize("SBE.Locks.LockReset"));
      this._refreshDialogContent(tileDoc, dialog);
    });

    /* === Digicode — config MJ === */
    root.querySelector(".sbe-chest-digilen-edit")?.addEventListener("change", async (ev) => {
      await this._setFlagSafe(tileDoc, "digiLength", Math.max(1, Math.floor(Number(ev.target.value ?? 4))));
    });
    root.querySelector(".sbe-chest-digicode-edit")?.addEventListener("change", async (ev) => {
      await this._setFlagSafe(tileDoc, "digiCode", String(ev.target.value ?? "").replace(/\D/g, ""));
    });
    root.querySelector(".sbe-chest-digihack-edit")?.addEventListener("change", async (ev) => {
      await this._setFlagSafe(tileDoc, "digiHackable", !!ev.target.checked);
      this._refreshDialogContent(tileDoc, dialog);
    });
    root.querySelector(".sbe-chest-digiroll-edit")?.addEventListener("change", async (ev) => {
      await this._setFlagSafe(tileDoc, "digiRollTarget", ev.target.value);
    });
    root.querySelector(".sbe-chest-digimax-edit")?.addEventListener("change", async (ev) => {
      await this._setFlagSafe(tileDoc, "digiMaxAttempts", Math.max(0, Math.floor(Number(ev.target.value ?? 0))));
    });
    root.querySelector(".sbe-chest-digiremember-edit")?.addEventListener("change", async (ev) => {
      await this._setFlagSafe(tileDoc, "digiRemember", !!ev.target.checked);
    });
    root.querySelector(".sbe-chest-digiforget")?.addEventListener("click", async (ev) => {
      ev.preventDefault();
      await this._setFlagSafe(tileDoc, "digiUnlockedBy", []);
      ui.notifications.info(game.i18n.localize("SBE.Locks.AccessForgotten"));
      this._refreshDialogContent(tileDoc, dialog);
    });
    root.querySelector(".sbe-chest-digialarm-edit")?.addEventListener("change", async (ev) => {
      await this._setFlagSafe(tileDoc, "digiAlarm", !!ev.target.checked);
      this._refreshDialogContent(tileDoc, dialog);
    });
    root.querySelector(".sbe-chest-digisound-edit")?.addEventListener("change", async (ev) => {
      await this._setFlagSafe(tileDoc, "digiSound", String(ev.target.value ?? "").trim());
    });
    root.querySelector(".sbe-chest-digisound-pick")?.addEventListener("click", () => {
      const inp = root.querySelector(".sbe-chest-digisound-edit");
      const FilePicker = foundry.applications.apps.FilePicker.implementation;
      new FilePicker({
        type: "audio",
        current: inp?.value,
        callback: async (path) => {
          if (inp) inp.value = path;
          await this._setFlagSafe(tileDoc, "digiSound", path);
        }
      }).render(true);
    });
    root.querySelector(".sbe-chest-digireset")?.addEventListener("click", async (ev) => {
      ev.preventDefault();
      await this._setFlagSafe(tileDoc, "digiAttempts", 0);
      await this._setFlagSafe(tileDoc, "digiBroken", false);
      ui.notifications.info(game.i18n.localize("SBE.Locks.DigicodeReset"));
      this._refreshDialogContent(tileDoc, dialog);
    });

    /* === Verrou — côté joueur (mode "joueur") === */
    root.querySelector(".sbe-chest-player-lockbtn")?.addEventListener("click", async (ev) => {
      ev.preventDefault();
      await this._setFlagSafe(tileDoc, "lockedBy", game.user.id);
      ui.notifications.info(game.i18n.localize("SBE.Chest.ChestLocked"));
      this._refreshDialogContent(tileDoc, dialog);
    });
    root.querySelector(".sbe-chest-player-unlockbtn")?.addEventListener("click", async (ev) => {
      ev.preventDefault();
      await this._setFlagSafe(tileDoc, "lockedBy", null);
      await this._setFlagSafe(tileDoc, "lockAllowed", []);
      ui.notifications.info(game.i18n.localize("SBE.Chest.ChestUnlocked"));
      this._refreshDialogContent(tileDoc, dialog);
    });
    root.querySelectorAll(".sbe-chest-pallow-edit").forEach(chk => {
      chk.addEventListener("change", async () => {
        const ids = [...root.querySelectorAll(".sbe-chest-pallow-edit")].filter(c => c.checked).map(c => c.dataset.user);
        await this._setFlagSafe(tileDoc, "lockAllowed", ids);
      });
    });
  }

  /* ---------------------------------------------------------- */
  /*  ÉCRITURES & HELPERS                                        */
  /* ---------------------------------------------------------- */

  /**
   * Le contenu du coffre, en lignes (objets du delta de son pion) :
   * { id, sourceId (modèle), templateId, name, img, stackable, qty,
   *   weight, x, y, rot, placed } — la place dans la grille spatiale est
   * gardée sur l'objet (flags.sbe.chestPos).
   */
  static _contents(tileDoc) {
    const wk = String(tileDoc?.flags?.[NS]?.weightKey ?? "");
    /* Repères d'icône (halo, petites icônes en coin…) : calculés comme
       dans un inventaire, une fois pour tout le coffre. */
    /* Repères et INFO-BULLE de l'objet (la même que dans un inventaire). */
    let inv = new Map();
    try { inv = new Map((buildInventory(tileDoc.actor).all ?? []).map(e => [e.id, e])); } catch (_e) { /* */ }
    const isGM = !!game.user?.isGM;
    return (tileDoc?.actor?.items?.contents ?? [])
      .filter(i => i.type === "objet" && !String(i.system?.carry?.host ?? ""))
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
      .map(i => {
        const pos = i.flags?.[NS]?.chestPos ?? {};
        return {
          id: i.id, sourceId: String(i.system?.modelId ?? ""), templateId: i.system?.templateId ?? "",
          name: i.name, img: i.img, stackable: isStackableItem(i), qty: qtyOf(i), gmOnly: isGmOnlyItem(i),
          weight: this._resolveWeight(i, wk), marks: inv.get(i.id)?.marks ?? null,
          tip: inv.has(i.id) ? itemTipAttr(inv.get(i.id), isGM) : "",
          x: pos.x, y: pos.y, rot: pos.rot, placed: pos.placed === true
        };
      });
  }

  /** Les places qui changent entre deux listes (grille spatiale). */
  static _placesOf(before, after) {
    const was = new Map(before.map(e => [e.id, posOf(e)]));
    const out = {};
    for (const e of after) {
      const a = posOf(e), b = was.get(e.id);
      if (!b || a.x !== b.x || a.y !== b.y || a.rot !== b.rot || a.placed !== b.placed) out[e.id] = a;
    }
    return out;
  }

  /**
   * Modifie le contenu du coffre par opérations : jamais « voici la liste
   * entière », pour que deux actions en même temps ne s'effacent pas.
   *   remove : ids retirés ;  qty : { id: +n / −n } ;  place : { id: place } ;
   *   add : [{ data, inner, qty, pos }] (MJ seulement).
   * Un joueur ne fait que ranger (places) ; le reste passe par le MJ.
   */
  static async _edit(tileDoc, edit) {
    if (!tileDoc) return false;
    if (game.user.isGM) { await gmQueue(tileDoc.uuid, () => this._applyEdit(tileDoc, edit)); return true; }
    if (!Object.keys(edit.place ?? {}).length) return false;
    return requestGM({ type: "sbeChestPlace", sceneId: tileDoc.parent?.id, tokenId: tileDoc.id, place: edit.place });
  }

  /** Applique une modification sur l'état réel du coffre (MJ). */
  static async _applyEdit(tileDoc, { remove = [], qty = {}, place = {}, add = [] } = {}) {
    const actor = tileDoc?.actor;
    if (!actor) return;
    const items = actor.items;
    const gone = new Set(remove.filter(id => items.has(id)));
    const updates = new Map();
    const upd = (id) => { if (!updates.has(id)) updates.set(id, { _id: id }); return updates.get(id); };
    for (const [id, d] of Object.entries(qty)) {
      const it = items.get(id);
      if (!it || gone.has(id)) continue;
      const n = qtyOf(it) + (Number(d) || 0);
      if (n <= 0) gone.add(id);
      else upd(id)[`system.values.${QUANTITY_KEY}`] = n;
    }
    for (const [id, pl] of Object.entries(place)) {
      if (items.has(id) && !gone.has(id)) upd(id)[`flags.${NS}.chestPos`] = posOf(pl);
    }
    const creates = [];
    for (const e of add) {
      if (!e?.data) continue;
      const d = foundry.utils.deepClone(e.data);
      const inner = Array.isArray(e.inner) ? e.inner : [];
      if (!inner.length) delete d._id;
      foundry.utils.setProperty(d, `system.values.${QUANTITY_KEY}`, Math.max(1, Number(e.qty) || 1));
      foundry.utils.setProperty(d, "system.carry", { ...CARRY0 });
      foundry.utils.setProperty(d, `flags.${NS}.chestPos`, posOf(e.pos ?? {}));
      creates.push(d, ...inner);
    }
    /* Ce que contenaient les objets retirés part avec eux. */
    const inner = items.filter(i => gone.has(String(i.system?.carry?.host ?? ""))).map(i => i.id);
    try {
      if (gone.size) await actor.deleteEmbeddedDocuments("Item", [...gone, ...inner]);
      if (updates.size) await actor.updateEmbeddedDocuments("Item", [...updates.values()]);
      if (creates.length) await actor.createEmbeddedDocuments("Item", creates, { keepId: true });
    } catch (err) {
      console.warn("SBE | Coffre : écriture du contenu en échec", err);
    }
  }

  /** Met à jour le pion du coffre (routé au MJ primaire si joueur). */
  static async _updateSafe(tileDoc, changes) {
    if (!tileDoc) return null;
    if (game.user.isGM) return tileDoc.update(changes);
    requestGM({ type: "sbeChestUpdate", sceneId: tileDoc.parent?.id, tokenId: tileDoc.id, changes });
    return null;
  }

  /** MJ principal : libère les coffres dont l'occupant répond au test. */
  static #freeOccupied(test) {
    if (!game.user.isGM || !isPrimaryGM()) return;
    for (const scene of game.scenes) {
      for (const td of scene.tokens) {
        const occ = td.flags?.[NS]?.isChest ? td.flags[NS].occupiedBy : null;
        if (!occ || !test(occ)) continue;
        gmQueue(td.uuid, () => (td.flags?.[NS]?.occupiedBy === occ ? td.update({ [`flags.${NS}.occupiedBy`]: null }) : null));
      }
    }
  }

  /** Écrit un flag du coffre (routé au MJ primaire si joueur). */
  static async _setFlagSafe(tileDoc, key, value) {
    try {
      await this._updateSafe(tileDoc, { [`flags.${NS}.${key}`]: value });
    } catch (err) {
      console.warn(`SBE | Coffre : écriture flag ${key} en échec`, err);
    }
  }

  static _getInteractingActor() {
    const controlled = canvas.tokens?.controlled ?? [];
    if (controlled.length !== 1) return null;
    return controlled[0].actor ?? null;
  }
}

/* ============================================================ */
/*  BOUTON DE CONTRÔLE DE SCÈNE (niveau module)                 */
/* ============================================================ */
/* getSceneControlButtons se déclenche avant "ready" : le hook doit
   être posé dès l'import du module. */
Hooks.on("getSceneControlButtons", (controls) => {
  try {
    const group = controls?.tokens;
    if (!group?.tools) return;
    group.tools.sbePlaceChest = {
      name: "sbePlaceChest",
      title: game.i18n.localize("SBE.Chest.PlaceChestTitle"),
      icon: "fa-solid fa-box-archive",
      order: Object.keys(group.tools).length,
      button: true,
      visible: game.user.isGM,
      onChange: () => { ChestManager.createChest(); }
    };
  } catch (err) {
    console.warn("SBE | Coffre : bouton de contrôle en échec", err);
  }
});
