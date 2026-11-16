/**
 * SBE — Logique de verrou partagée (coffres, portes, et futurs supports)
 *
 * Fournit les briques communes :
 * - le sélecteur de cible de jet (référence par CLÉ de fiche de perso,
 *   menu vide tant que les templates de personnage n'existent pas) ;
 * - la résolution d'un jet de verrou (contrat tri-état) ;
 * - la session de digicode complète (fenêtre unique par support,
 *   vérification du code, piratage, compteurs, rupture, alarme,
 *   mémoire d'accès), pilotée par un ADAPTATEUR :
 *
 *   adapter = {
 *     id            : identifiant unique du support (tuile, mur…),
 *     name          : nom affiché (pour l'alarme),
 *     getCfg()      : lit la config de verrou à jour,
 *     setCfg(k, v)  : écrit une clé de config (via socket si joueur)
 *   }
 *
 * C'est le patron multi-ancrage de SBE : la même mécanique s'accroche
 * à un coffre (tuile) ou à une porte (mur) via l'adaptateur.
 */

import { buildKeyRefOptions } from "../../helpers/key-refs.mjs";
import { SBEDigicodeApp } from "./digicode-app.mjs";
import { ChatCards } from "../chat/chat-cards.mjs";
import { rollField } from "../../builder/field-roll.mjs";
import { evalExpression } from "../../builder/formula-engine.mjs";
import { docScope } from "../../builder/doc-context.mjs";
import { ToolWear } from "./tool-wear.mjs";
import { accessOptions, askAccess, hackOptions } from "./lock-access.mjs";

export class LockCore {

  /* Fenêtres de digicode ouvertes : id de support → app. */
  static _openDigicodes = new Map();

  /* ---------------------------------------------- */
  /*  Cible de jet (référence par clé)              */
  /* ---------------------------------------------- */

  /**
   * Options du <select> de cible de jet. Référence par clé de la
   * future fiche de personnage — menu vide (avec entrée explicative)
   * tant que le branchement n'existe pas.
   */
  static buildRollOptions(selected = "") {
    return buildKeyRefOptions("actor", selected);
  }

  /**
   * Jet de verrou (crochetage / piratage) : le jet du champ choisi sur
   * la fiche, comme un clic sur son libellé — son dé, sa comparaison,
   * ses critiques. Le MODIFICATEUR du verrou (formule, peut lire
   * l'équipement avec carried) aide s'il est positif, gêne s'il est
   * négatif.
   * @returns {Promise<{ok:boolean, outcome:string}|"cancel">}
   *   outcome : critSuccess | success | failure | critFailure
   */
  static async rollLockResult(actor, target, { diffMode = "none", diff = "", tool = null, title = "" } = {}) {
    if (!target) return { ok: true, outcome: "success" };   /* pas de jet : ça cède */
    if (!actor) {
      ui.notifications.warn(game.i18n.localize("SBE.Locks.NoActor"));
      return "cancel";
    }
    const num = (raw) => {
      const t = String(raw ?? "").trim();
      if (!t) return null;
      const v = Number(evalExpression(t, docScope(actor)));
      return Number.isFinite(v) ? v : null;
    };
    /* Difficulté du verrou : un MODIFICATEUR (positif = plus dur) ou un
       SEUIL qui remplace la valeur à comparer. */
    let goal = null;
    const bonuses = [];
    const dv = num(diff);
    /* Modificateur : positif = plus dur, donc un apport négatif nommé. */
    if (dv !== null && diffMode === "mod") bonuses.push({ label: game.i18n.localize("SBE.Locks.Difficulty"), val: -dv });
    else if (dv !== null && diffMode === "goal") goal = dv;
    /* Bonus de l'OUTIL utilisé : son champ qui porte la clé du jet. */
    const tb = Number(tool?.system?.values?.[target]);
    if (tool && Number.isFinite(tb) && tb !== 0) bonuses.push({ label: tool.name, img: tool.img, val: tb });
    const res = await rollField(actor, target, { ask: true, goal, title, bonuses, after: "now" });
    if (!res) return "cancel";
    const o = res.outcome;
    if (o === "critSuccess" || o === "success") return { ok: true, outcome: o };
    if (o === "critFailure" || o === "failure") return { ok: false, outcome: o };
    /* Champ sans comparaison : le jet ne tranche pas — on ne bloque pas. */
    return { ok: true, outcome: "success" };
  }

  /** Lit la difficulté d'un verrou (ancien « modificateur » repris). */
  static #diffOf(cfg, prefix) {
    const mode = cfg[`${prefix}DiffMode`];
    if (mode === "mod" || mode === "goal") return { diffMode: mode, diff: cfg[`${prefix}Diff`] ?? "" };
    const old = String(cfg[`${prefix}RollMod`] ?? "").trim();
    return old ? { diffMode: "mod", diff: `-(${old})` } : { diffMode: "none", diff: "" };
  }

  /**
   * Ouvre l'accès d'un verrou : la fenêtre ne propose QUE ce que ce
   * personnage peut faire (clé portée, outil porté, code, piratage).
   * @returns {Promise<string|false|"none">} le moyen qui a ouvert
   *   ("key" | "pick" | "code" | "hack"), false (raté / annulé),
   *   "none" (rien de possible pour ce personnage).
   */
  static async access(adapter, actor, { pick = false, digi = false } = {}) {
    const cfg = adapter.getCfg();
    const options = accessOptions(cfg, actor, { pick, digi });
    if (!options.length) return "none";
    /* Digicode sans clé portée : le clavier s'ouvre directement, comme
       dans le premier système (le piratage est sa touche). */
    if (options.length === 1 && options[0].type === "code") {
      return (await this.promptDigicode(adapter, actor)) ? "code" : false;
    }
    const chosen = await askAccess(adapter.name ? game.i18n.format("SBE.Locks.AccessTitle", { name: adapter.name }) : game.i18n.localize("SBE.Locks.AccessTitleNone"), options);
    if (!chosen) return false;
    let ok = false;
    if (chosen.type === "key") {
      ui.notifications.info(game.i18n.format("SBE.Locks.KeyOpened", { name: chosen.item?.name ?? "" }));
      ok = true;
    } else if (chosen.type === "pick") ok = await this.tryPick(adapter, actor, chosen.item);
    else if (chosen.type === "code") ok = await this.promptDigicode(adapter, actor);
    return ok ? chosen.type : false;
  }

  /** Usure de l'outil après le jet, avec un mot si elle compte. */
  static async #wear(tool, outcome) {
    if (!tool) return;
    try {
      const r = await ToolWear.apply(tool, outcome);
      if (r === "destroyed") ui.notifications.warn(game.i18n.format("SBE.Locks.ToolDestroyed", { name: tool.name }));
      else if (r === "worn") ui.notifications.warn(game.i18n.format("SBE.Locks.ToolWornOut", { name: tool.name }));
    } catch (err) { console.warn("SBE | Verrous : usure de l'outil en échec", err); }
  }

  /* ---------------------------------------------- */
  /*  Crochetage                                    */
  /* ---------------------------------------------- */

  /**
   * Tente de crocheter. Gère le compteur d'échecs et la rupture
   * définitive via l'adaptateur. Retourne true si le verrou cède.
   */
  static async tryPick(adapter, actor, tool = null) {
    const cfg = adapter.getCfg();
    /* Avec un outil, sans « jet même avec un outil » : il ouvre. */
    const target = (tool && !cfg.lockRollWithTool) ? "" : (cfg.lockRollTarget ?? "");
    const res = await this.rollLockResult(actor, target, { ...this.#diffOf(cfg, "lock"), tool, title: game.i18n.localize("SBE.Locks.PickTitle") });
    if (res === "cancel") return false;
    await this.#wear(tool, res.outcome);
    if (res.ok) {
      ui.notifications.info(game.i18n.localize("SBE.Locks.PickSuccess"));
      return true;
    }

    const max = Number(cfg.lockMaxAttempts ?? 0);
    const cur = Number(cfg.lockAttempts ?? 0) + 1;
    await adapter.setCfg("lockAttempts", cur);
    if (max > 0 && cur >= max) {
      await adapter.setCfg("lockBroken", true);
      ui.notifications.error(game.i18n.localize("SBE.Locks.LockJustBroke"));
    } else if (max > 0) {
      ui.notifications.warn(game.i18n.format("SBE.Locks.PickFailRemaining", { remaining: max - cur }));
    } else {
      ui.notifications.warn(game.i18n.localize("SBE.Locks.PickFail"));
    }
    return false;
  }

  /* ---------------------------------------------- */
  /*  Digicode                                      */
  /* ---------------------------------------------- */

  /**
   * Session de digicode complète pour un support.
   * Lit digiCode/digiLength/digiHackable dans la config de
   * l'adaptateur ; gère la fenêtre unique, la vérification, le
   * piratage, la rupture. Retourne true si l'accès est accordé.
   * (La mémoire d'accès digiRemember est gérée par l'appelant, qui
   * sait déjà court-circuiter la saisie.)
   */
  static async promptDigicode(adapter, actor) {
    const cfg = adapter.getCfg();
    const expected = String(cfg.digiCode ?? "");
    const length = Number(cfg.digiLength ?? 4);
    /* Touche de piratage du clavier : seulement si ce personnage peut
       pirater (outil porté utilisable, ou mains nues permises). */
    const hacks = hackOptions(cfg, actor);
    const hackable = hacks.some(o => !o.disabled);

    const existing = this._openDigicodes.get(adapter.id);
    if (existing && existing.rendered) {
      try { existing.bringToFront?.(); } catch (_e) { /* rien */ }
      return false;
    }

    return await new Promise((resolve) => {
      let resolved = false;
      let granted = false;
      const finish = (val) => { if (!resolved) { resolved = true; resolve(val); } };
      let app = null;

      const grant = () => {
        granted = true;
        finish(true);
        try { app.close({ animate: false }); } catch (_e) { /* rien */ }
      };

      const onValidate = async (entered) => {
        if (entered === expected) {
          app._setMsg?.(null, true);
          grant();
          return true;
        }
        app._setMsg?.(null, false);
        await this.onDigiFail(adapter, actor);
        const fresh = adapter.getCfg();
        if (fresh.digiBroken) {
          app._setMsg?.(null, false);
          setTimeout(() => { try { app.close({ animate: false }); } catch (_e) { /* rien */ } }, 250);
        }
        return false;
      };

      const onHack = async () => {
        /* Un seul moyen : on y va ; plusieurs (outils, mains nues) : on choisit. */
        const usable = hacks.filter(o => !o.disabled);
        const pick = usable.length === 1 ? usable[0]
          : await askAccess(game.i18n.localize("SBE.Locks.HackTitle"), hacks);
        if (!pick) return;
        const res = await this.tryHack(adapter, actor, pick.item);
        if (res === "cancel") return;
        if (res === true) {
          app._setMsg?.(null, true);
          grant();
        } else {
          app._setMsg?.(null, false);
        }
      };

      const onClose = () => {
        this._openDigicodes.delete(adapter.id);
        if (!granted) finish(false);
      };

      app = new SBEDigicodeApp({ length, hackable, expected, onValidate, onHack, onClose });
      this._openDigicodes.set(adapter.id, app);
      app.render(true);
    });
  }

  /**
   * Tente de pirater le digicode (jet). true / false / "cancel".
   * Un piratage raté (jet lancé) compte comme une tentative.
   */
  static async tryHack(adapter, actor, tool = null) {
    const cfg = adapter.getCfg();
    const target = (tool && !cfg.digiRollWithTool) ? "" : (cfg.digiRollTarget ?? "");
    const res = await this.rollLockResult(actor, target, { ...this.#diffOf(cfg, "digi"), tool, title: game.i18n.localize("SBE.Locks.HackTitle") });
    if (res === "cancel") return "cancel";
    await this.#wear(tool, res.outcome);
    if (!res.ok) {
      ui.notifications.warn(game.i18n.localize("SBE.Locks.HackFail"));
      await this.onDigiFail(adapter, actor, true);
      return false;
    }
    ui.notifications.info(game.i18n.localize("SBE.Locks.HackSuccess"));
    return true;
  }

  /** Échec de code ou de piratage : compteur, rupture, alarme. */
  static async onDigiFail(adapter, actor, fromHack = false) {
    void fromHack;
    const cfg = adapter.getCfg();
    const max = Number(cfg.digiMaxAttempts ?? 0);
    const cur = Number(cfg.digiAttempts ?? 0) + 1;
    await adapter.setCfg("digiAttempts", cur);

    if (cfg.digiAlarm) {
      const who = actor?.name ?? game.user.name;
      ChatCards.post({
        type: "alarm",
        title: game.i18n.localize("SBE.Locks.AlarmTitle"),
        body: `<p>${foundry.utils.escapeHTML(game.i18n.format("SBE.Locks.AlarmMsg", { who, name: adapter.name }))}</p>`,
        whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id)
      });
      if (cfg.digiSound) {
        try {
          foundry.audio.AudioHelper.play({ src: cfg.digiSound, volume: 0.8, autoplay: true, loop: false }, true);
        } catch (_e) { /* son indisponible */ }
      }
      ui.notifications.warn(game.i18n.localize("SBE.Locks.WrongCodeAlarm"));
    }

    if (max > 0 && cur >= max) {
      await adapter.setCfg("digiBroken", true);
      ui.notifications.error(game.i18n.localize("SBE.Locks.DigicodeLocked"));
    }
  }
}
