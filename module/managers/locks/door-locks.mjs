/**
 * SBE — Verrous de portes natives
 *
 * Greffe crochetage / digicode sur les portes NATIVES de Foundry
 * (Wall avec door > 0), repris du premier système du même auteur :
 * - champ « Verrou » injecté dans la fenêtre de configuration du mur ;
 * - config stockée dans wall.flags.<ns>.config ;
 * - interception de l'ouverture (preUpdateWall) pour lancer le
 *   déverrouillage ; le MJ n'est jamais bloqué ;
 * - la logique de verrou (jets, digicode, compteurs, alarme) vit dans
 *   LockCore, partagée avec les coffres via un adaptateur.
 *
 * NOTE « armored » : la porte blindée n'a RIEN à voir avec le verrou.
 * C'est une propriété balistique héritée du premier système : une porte
 * fermée blindée ARRÊTE les tirs et les explosions, une porte fermée
 * normale les laisse passer (porte fine). Le drapeau est stocké ici et
 * sera consommé par les futures mécaniques de zones/tirs de SBE.
 *
 *   wall.flags.<ns>.config = {
 *     lockType: "none" | "pick" | "digicode", armored,
 *     lockRollTarget, lockMaxAttempts, lockAttempts, lockBroken, pickedOpen,
 *     digiLength, digiCode, digiHackable, digiRollTarget,
 *     digiMaxAttempts, digiAttempts, digiBroken,
 *     digiAlarm, digiSound, digiRemember, digiUnlockedBy
 *   }
 */

import { SYSTEM_ID, audioFormatsHint } from "../../helpers/constants.mjs";
import { updateWallSafe } from "../../helpers/socket.mjs";
import { LockCore } from "./lock-core.mjs";
import { refIds, refListHtml, readRefLists, wireRefLists, lockOptionsHtml, readLockOptions } from "./lock-access.mjs";

const NS = SYSTEM_ID;

export class DoorLocks {

  static _unlocking = new Set();

  static init() {
    Hooks.on("renderWallConfig", (app, html) => {
      try { DoorLocks._injectConfig(app, html); }
      catch (err) { console.warn("SBE | Portes : injection config échouée", err); }
    });

    Hooks.on("preUpdateWall", (wallDoc, changes, options, userId) => {
      try { return DoorLocks._onPreUpdateWall(wallDoc, changes, options, userId); }
      catch (err) { console.warn("SBE | Portes : preUpdateWall en échec", err); return true; }
    });
  }

  /* Adaptateur LockCore pour un mur. */
  static _adapter(wallDoc) {
    return {
      id: wallDoc.id,
      name: game.i18n.localize("SBE.Door.AName"),
      getCfg: () => wallDoc.flags?.[NS]?.config ?? {},
      /* Une clé à la fois (le MJ ne retient d'un joueur que l'état de la serrure). */
      setCfg: async (key, value) => {
        await updateWallSafe(wallDoc, { [`flags.${NS}.config.${key}`]: value });
      }
    };
  }

  /* ---------------------------------------------------------- */
  /*  Interception de l'ouverture                                */
  /* ---------------------------------------------------------- */

  static _onPreUpdateWall(wallDoc, changes, options, _userId) {
    if (!("ds" in (changes ?? {}))) return true;

    const DS = CONST.WALL_DOOR_STATES;
    if (changes.ds !== DS.OPEN) return true;
    if (wallDoc.ds !== DS.CLOSED) return true;

    const cfg = wallDoc?.flags?.[NS]?.config;
    const lockType = cfg?.lockType ?? "none";

    if (lockType === "none") return true;
    if (game.user.isGM) return true;
    if (lockType === "pick" && cfg.pickedOpen) return true;

    /* Marqueur interne : notre propre ré-ouverture après succès. */
    if (options?.sbeDoorUnlocked) return true;

    DoorLocks._attemptUnlock(wallDoc, cfg, lockType).then((granted) => {
      if (granted) {
        updateWallSafe(wallDoc, { ds: DS.OPEN }, { sbeDoorUnlocked: true })
          .catch(e => console.warn("SBE | Portes : ouverture en échec", e));
      }
    });
    return false;
  }

  static async _attemptUnlock(wallDoc, cfg, lockType) {
    if (this._unlocking.has(wallDoc.id)) return false;
    this._unlocking.add(wallDoc.id);
    try {
      return await this._doUnlock(wallDoc, cfg, lockType);
    } finally {
      this._unlocking.delete(wallDoc.id);
    }
  }

  static async _doUnlock(wallDoc, cfg, lockType) {
    const actor = this._currentActor();
    const adapter = this._adapter(wallDoc);

    /* Digicode déjà ouvert par ce joueur (mémoire d'accès). */
    if (lockType === "digicode" && !cfg.digiBroken && cfg.digiRemember
      && Array.isArray(cfg.digiUnlockedBy) && cfg.digiUnlockedBy.includes(game.user.id)) return true;

    /* La fenêtre ne propose que le possible : clé portée, outil porté,
       code, piratage. Rien de possible : la porte reste fermée, avec le
       son « verrouillé » de Foundry — comme une porte native. */
    const res = await LockCore.access(adapter, actor, { pick: lockType === "pick", digi: lockType === "digicode" });
    if (res === "none") {
      try { wallDoc.object?._playDoorSound?.("test"); } catch (_e) { /* pas de son */ }
      return false;
    }
    if (!res) return false;
    /* Serrure crochetée : reste ouverte pour tous jusqu'au « Réinitialiser » du MJ.
       Une clé, elle, ouvre seulement cette fois. */
    if (res === "pick") await adapter.setCfg("pickedOpen", true);
    if ((res === "code" || res === "hack") && cfg.digiRemember) {
      const list = Array.isArray(cfg.digiUnlockedBy) ? [...cfg.digiUnlockedBy] : [];
      if (!list.includes(game.user.id)) {
        list.push(game.user.id);
        await adapter.setCfg("digiUnlockedBy", list);
      }
    }
    return true;
  }

  static _currentActor() {
    return canvas.tokens?.controlled?.[0]?.actor
      ?? game.user?.character
      ?? null;
  }

  /* ---------------------------------------------------------- */
  /*  Injection dans WallConfig                                  */
  /* ---------------------------------------------------------- */

  static _injectConfig(app, html) {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root) return;
    if (root.querySelector(".sbe-door-lock")) return;

    const wallDoc = app.document ?? app.object;
    if (!wallDoc) return;
    const flags = wallDoc.flags?.[NS]?.config ?? {};
    const lockType = flags.lockType ?? "none";

    const rollOpts = LockCore.buildRollOptions(flags.lockRollTarget ?? "");
    const digiRollOpts = LockCore.buildRollOptions(flags.digiRollTarget ?? "");

    const section = document.createElement("div");
    section.className = "sbe-door-lock";
    section.innerHTML = `
      <fieldset style="margin-top:8px;">
        <legend><i class="fa-solid fa-lock"></i> ${game.i18n.localize("SBE.Door.SectionLegend")}</legend>

        <div class="form-group sbe-door-armored-row" style="display:flex;align-items:flex-start;gap:8px;padding-bottom:8px;margin-bottom:6px;border-bottom:1px solid var(--color-border-light-tertiary,#0002);">
          <input type="checkbox" class="sbe-door-armored" ${flags.armored ? "checked" : ""} style="margin-top:3px;flex:0 0 auto;">
          <div>
            <label style="font-weight:600;"><i class="fa-solid fa-shield-halved"></i> ${game.i18n.localize("SBE.Door.Armored")}</label>
            <p class="notes" style="margin:2px 0 0;">${game.i18n.localize("SBE.Door.ArmoredHint")}</p>
          </div>
        </div>

        <div class="form-group">
          <label>${game.i18n.localize("SBE.Door.LockType")}</label>
          <select class="sbe-door-locktype">
            <option value="none" ${lockType === "none" ? "selected" : ""}>${game.i18n.localize("SBE.Door.LockTypeNone")}</option>
            <option value="pick" ${lockType === "pick" ? "selected" : ""}>${game.i18n.localize("SBE.Door.LockTypePick")}</option>
            <option value="digicode" ${lockType === "digicode" ? "selected" : ""}>${game.i18n.localize("SBE.Door.LockTypeDigicode")}</option>
          </select>
        </div>

        <div class="sbe-door-keys-box" style="display:${lockType !== "none" ? "block" : "none"};">
          ${refListHtml("lockKeys", refIds(flags, "lockKeys"), "SBE.Locks.Keys", "SBE.Locks.KeysHint")}
        </div>

        <div class="form-group sbe-door-reset-box" style="display:${lockType !== "none" ? "flex" : "none"};">
          <label>${game.i18n.localize("SBE.Door.Lock")}</label>
          <button type="button" class="sbe-door-reset" style="width:auto;padding:3px 10px;">
            <i class="fa-solid fa-rotate-left"></i> ${game.i18n.localize("SBE.Door.ResetButton")}
          </button>
        </div>

        <!-- CROCHETAGE -->
        <div class="sbe-door-pick-opts" style="display:${lockType === "pick" ? "block" : "none"};padding-left:10px;">
          ${refListHtml("lockTools", refIds(flags, "lockTools"), "SBE.Locks.PickTools", "SBE.Locks.PickToolsHint")}
          <div class="form-group">
            <label>${game.i18n.localize("SBE.Locks.PickRoll")}</label>
            <select class="sbe-door-pickroll">${rollOpts}</select>
          </div>
          ${lockOptionsHtml("lock", flags)}
          <div class="form-group">
            <label>${game.i18n.localize("SBE.Locks.AttemptsBeforeBreak")}</label>
            <input type="number" class="sbe-door-pickmax" value="${Number(flags.lockMaxAttempts ?? 0)}" min="0" step="1">
          </div>
        </div>

        <!-- DIGICODE -->
        <div class="sbe-door-digi-opts" style="display:${lockType === "digicode" ? "block" : "none"};padding-left:10px;">
          <div class="form-group">
            <label>${game.i18n.localize("SBE.Locks.CodeLength")}</label>
            <input type="number" class="sbe-door-digilen" value="${Number(flags.digiLength ?? 4)}" min="1" max="12" step="1">
          </div>
          <div class="form-group">
            <label>${game.i18n.localize("SBE.Locks.Code")}</label>
            <input type="text" class="sbe-door-digicode" value="${String(flags.digiCode ?? "")}" inputmode="numeric" pattern="[0-9]*">
          </div>
          <div class="form-group">
            <label>${game.i18n.localize("SBE.Locks.Hackable")}</label>
            <input type="checkbox" class="sbe-door-digihack" ${flags.digiHackable ? "checked" : ""}>
          </div>
          <div class="sbe-door-digiroll-box form-group" style="display:${flags.digiHackable ? "flex" : "none"};">
            <label>${game.i18n.localize("SBE.Locks.HackRoll")}</label>
            <select class="sbe-door-digiroll">${digiRollOpts}</select>
          </div>
          <div class="sbe-door-digitools-box" style="display:${flags.digiHackable ? "block" : "none"};">
            ${lockOptionsHtml("digi", flags)}
            ${refListHtml("digiTools", refIds(flags, "digiTools"), "SBE.Locks.HackTools", "SBE.Locks.HackToolsHint")}
          </div>
          <div class="form-group">
            <label>${game.i18n.localize("SBE.Locks.AttemptsBeforeBreak")}</label>
            <input type="number" class="sbe-door-digimax" value="${Number(flags.digiMaxAttempts ?? 0)}" min="0" step="1">
          </div>
          <div class="form-group">
            <label>${game.i18n.localize("SBE.Locks.RememberAccess")}</label>
            <input type="checkbox" class="sbe-door-digiremember" ${flags.digiRemember ? "checked" : ""}>
          </div>
          <div class="form-group">
            <label>${game.i18n.localize("SBE.Locks.AlarmOnWrong")}</label>
            <input type="checkbox" class="sbe-door-digialarm" ${flags.digiAlarm ? "checked" : ""}>
          </div>
          <div class="sbe-door-digisound-box form-group" style="display:${flags.digiAlarm ? "flex" : "none"};">
            <label>${game.i18n.localize("SBE.Locks.AlarmSound")}</label>
            <div style="display:flex;gap:6px;flex:1;">
              <input type="text" class="sbe-door-digisound" value="${String(flags.digiSound ?? "")}" placeholder="sounds/alarm.ogg" style="flex:1;">
              <button type="button" class="sbe-door-digisound-pick" style="flex:none;width:auto;padding:2px 8px;">
                <i class="fa-solid fa-folder-open"></i>
              </button>
            </div>
            <p class="notes">${foundry.utils.escapeHTML(audioFormatsHint())}</p>
          </div>
        </div>
      </fieldset>`;

    /* Insertion dans la zone scrollable native, après les fieldsets. */
    const scrollable = root.querySelector(".standard-form.scrollable")
      ?? root.querySelector(".scrollable")
      ?? root.querySelector("form") ?? root;
    const nativeFieldsets = scrollable.querySelectorAll(":scope > fieldset");
    const lastFs = nativeFieldsets[nativeFieldsets.length - 1];
    if (lastFs && lastFs.parentNode === scrollable) {
      lastFs.after(section);
    } else {
      scrollable.appendChild(section);
    }

    DoorLocks._wireConfig(section, wallDoc);
  }

  static _wireConfig(section, wallDoc) {
    const typeSel = section.querySelector(".sbe-door-locktype");
    const pickBox = section.querySelector(".sbe-door-pick-opts");
    const digiBox = section.querySelector(".sbe-door-digi-opts");
    const sync = () => {
      const t = typeSel.value;
      pickBox.style.display = (t === "pick") ? "block" : "none";
      digiBox.style.display = (t === "digicode") ? "block" : "none";
      const resetBox = section.querySelector(".sbe-door-reset-box");
      if (resetBox) resetBox.style.display = (t !== "none") ? "flex" : "none";
      const keysBox = section.querySelector(".sbe-door-keys-box");
      if (keysBox) keysBox.style.display = (t !== "none") ? "block" : "none";
    };
    typeSel.addEventListener("change", sync);
    wireRefLists(section);

    section.querySelector(".sbe-door-reset")?.addEventListener("click", async () => {
      const cur = foundry.utils.deepClone(wallDoc.flags?.[NS]?.config ?? {});
      cur.lockAttempts = 0; cur.lockBroken = false; cur.pickedOpen = false;
      cur.digiAttempts = 0; cur.digiBroken = false; cur.digiUnlockedBy = [];
      await wallDoc.setFlag(NS, "config", cur);
      ui.notifications.info(game.i18n.localize("SBE.Door.LockReset"));
    });

    section.querySelector(".sbe-door-digihack")?.addEventListener("change", (ev) => {
      const box = section.querySelector(".sbe-door-digiroll-box");
      if (box) box.style.display = ev.target.checked ? "flex" : "none";
      const tb = section.querySelector(".sbe-door-digitools-box");
      if (tb) tb.style.display = ev.target.checked ? "block" : "none";
    });
    section.querySelector(".sbe-door-digialarm")?.addEventListener("change", (ev) => {
      const box = section.querySelector(".sbe-door-digisound-box");
      if (box) box.style.display = ev.target.checked ? "flex" : "none";
    });
    section.querySelector(".sbe-door-digisound-pick")?.addEventListener("click", () => {
      const inp = section.querySelector(".sbe-door-digisound");
      const FilePicker = foundry.applications.apps.FilePicker.implementation;
      new FilePicker({
        type: "audio",
        current: inp?.value,
        callback: (path) => { if (inp) inp.value = path; }
      }).render(true);
    });

    /* Sauvegarde : à la soumission du formulaire natif du mur, on
       écrit nos flags en plus (compteurs runtime préservés). */
    const form = section.closest("form");
    form?.addEventListener("submit", async () => {
      try { await DoorLocks._saveConfig(section, wallDoc); }
      catch (err) { console.warn("SBE | Portes : sauvegarde config en échec", err); }
    }, { capture: true });
  }

  static async _saveConfig(section, wallDoc) {
    const q = (sel) => section.querySelector(sel);
    const lockType = q(".sbe-door-locktype")?.value ?? "none";

    const data = {
      lockType,
      armored: !!q(".sbe-door-armored")?.checked,
      lockRollTarget: q(".sbe-door-pickroll")?.value ?? "",
      lockMaxAttempts: Math.max(0, Math.floor(Number(q(".sbe-door-pickmax")?.value ?? 0))),
      digiLength: Math.max(1, Math.floor(Number(q(".sbe-door-digilen")?.value ?? 4))),
      digiCode: (q(".sbe-door-digicode")?.value ?? "").replace(/\D/g, ""),
      digiHackable: !!q(".sbe-door-digihack")?.checked,
      digiRollTarget: q(".sbe-door-digiroll")?.value ?? "",
      digiMaxAttempts: Math.max(0, Math.floor(Number(q(".sbe-door-digimax")?.value ?? 0))),
      digiRemember: !!q(".sbe-door-digiremember")?.checked,
      digiAlarm: !!q(".sbe-door-digialarm")?.checked,
      digiSound: (q(".sbe-door-digisound")?.value ?? "").trim(),
      lockRollMod: "", digiRollMod: "",
      ...readLockOptions(section),
      ...readRefLists(section)
    };

    /* Compteurs runtime préservés. */
    const prev = wallDoc.flags?.[NS]?.config ?? {};
    data.lockAttempts = Number(prev.lockAttempts ?? 0);
    data.lockBroken = !!prev.lockBroken;
    data.pickedOpen = !!prev.pickedOpen;
    data.digiAttempts = Number(prev.digiAttempts ?? 0);
    data.digiBroken = !!prev.digiBroken;
    data.digiUnlockedBy = Array.isArray(prev.digiUnlockedBy) ? prev.digiUnlockedBy : [];

    await wallDoc.setFlag(NS, "config", data);
  }
}
