/**
 * SBE — Démo « Brumeval » : installer / retirer
 *
 * La démo vit dans le paquet du système, une AVENTURE par langue
 * (demo-fr, demo-en). L'installer, c'est :
 *   1. lire les réglages que la démo apporte (rangés sur l'aventure) ;
 *   2. montrer au MJ ceux qui remplaceraient SES réglages, à cocher ;
 *   3. noter les valeurs d'avant (réglage caché « demoBackup ») ;
 *   4. importer l'aventure (scène, fiches, objets, journaux, table) ;
 *   5. poser les réglages acceptés ; relier les objets posés à l'acteur
 *      support de CE monde.
 * La retirer supprime tout ce qui porte la marque de la démo et remet
 * les réglages d'avant.
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";

const { ApplicationV2, DialogV2 } = foundry.applications.api;
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

export const DEMO_FLAG = "demo";
const BACKUP = "demoBackup";
const LANGS = ["fr", "en"];
/** Collections où la démo pose ses documents (les dossiers en dernier). */
const COLLECTIONS = ["scenes", "actors", "items", "journal", "tables", "macros", "playlists", "cards"];

export class DemoManager {

  static init() {
    game.settings.register(SYSTEM_ID, BACKUP, { scope: "world", config: false, type: Object, default: {} });
    game.settings.registerMenu(SYSTEM_ID, "demoMenu", {
      name: "SBE.Demo.MenuName",
      label: "SBE.Demo.MenuLabel",
      hint: "SBE.Demo.MenuHint",
      icon: "fa-solid fa-chess-rook",
      type: SBEDemoMenu,
      restricted: true
    });
  }

  /* ---------------------------------------------------------- */
  /*  État                                                       */
  /* ---------------------------------------------------------- */

  /** Le paquet de la démo dans cette langue (sinon l'autre). */
  static packOf(lang = game.i18n.lang) {
    const want = LANGS.includes(lang) ? lang : "en";
    const order = [want, ...LANGS.filter(l => l !== want)];
    for (const l of order) {
      const p = game.packs.get(`${SYSTEM_ID}.demo-${l}`);
      if (p) return p;
    }
    return null;
  }

  static backup() {
    try { return game.settings.get(SYSTEM_ID, BACKUP) ?? {}; } catch (_e) { return {}; }
  }

  /** Les documents de la démo dans le monde, par collection. */
  static documents() {
    const out = {};
    for (const c of COLLECTIONS) {
      const list = (game[c]?.contents ?? []).filter(d => d.getFlag?.(SYSTEM_ID, DEMO_FLAG));
      if (list.length) out[c] = list;
    }
    const folders = game.folders.filter(f => f.getFlag(SYSTEM_ID, DEMO_FLAG));
    if (folders.length) out.folders = folders;
    return out;
  }

  static isInstalled() {
    return Object.keys(this.documents()).length > 0 || !!this.backup().at;
  }

  /* ---------------------------------------------------------- */
  /*  Réglages                                                   */
  /* ---------------------------------------------------------- */

  static #norm(v) {
    try { return JSON.stringify(v ?? null); } catch (_e) { return String(v); }
  }

  /** Défaut enregistré d'un réglage du système. */
  static #defaultOf(key) {
    const def = game.settings.settings.get(`${SYSTEM_ID}.${key}`)?.default;
    return typeof def === "function" ? def() : def;
  }

  /**
   * Les réglages de la démo qui remplaceraient un réglage du MJ : il
   * l'a changé (différent du défaut) et la démo apporte autre chose.
   */
  static conflicts(settings) {
    const out = [];
    for (const [key, value] of Object.entries(settings ?? {})) {
      if (!game.settings.settings.has(`${SYSTEM_ID}.${key}`)) continue;
      const cur = game.settings.get(SYSTEM_ID, key);
      const curN = this.#norm(cur);
      if (curN === this.#norm(this.#defaultOf(key))) continue;
      if (curN === this.#norm(value)) continue;
      out.push(key);
    }
    return out;
  }

  static settingLabel(key) {
    const k = `SBE.Demo.Set.${key}`;
    return game.i18n.has(k) ? L(k) : key;
  }

  /** Le MJ coche les réglages remplacés qu'il accepte. null = annulé. */
  static async #askConflicts(keys) {
    if (!keys.length) return new Set();
    const rows = keys.map(k => `<label class="sbe-demo-set"><input type="checkbox" name="${esc(k)}" checked> ${esc(this.settingLabel(k))}</label>`).join("");
    const res = await DialogV2.wait({
      window: { title: L("SBE.Demo.ConflictTitle"), icon: "fa-solid fa-sliders" },
      classes: ["sbe-demo-dlg"],
      position: { width: 460 },
      content: `<p>${esc(L("SBE.Demo.ConflictIntro"))}</p><div class="sbe-demo-sets">${rows}</div>
        <p class="notes">${esc(L("SBE.Demo.ConflictHint"))}</p>`,
      buttons: [
        { action: "ok", label: L("SBE.Demo.Install"), icon: "fa-solid fa-download", default: true,
          callback: (_e, btn) => new Set(keys.filter(k => btn.form.elements[k]?.checked)) },
        { action: "cancel", label: L("SBE.Common.Cancel"), icon: "fa-solid fa-xmark" }
      ],
      rejectClose: false
    }).catch(() => null);
    return res instanceof Set ? res : null;
  }

  /* ---------------------------------------------------------- */
  /*  Installer                                                  */
  /* ---------------------------------------------------------- */

  static async install() {
    if (!game.user.isGM) return false;
    if (this.isInstalled()) { ui.notifications.warn(L("SBE.Demo.Already")); return false; }
    const pack = this.packOf();
    const adv = pack ? (await pack.getDocuments())[0] : null;
    if (!adv) { ui.notifications.error(L("SBE.Demo.NoPack")); return false; }

    const settings = foundry.utils.deepClone(adv.getFlag(SYSTEM_ID, DEMO_FLAG)?.settings ?? {});
    const conflicts = this.conflicts(settings);
    const accepted = await this.#askConflicts(conflicts);
    if (accepted === null) return false;
    const apply = Object.keys(settings).filter(k => game.settings.settings.has(`${SYSTEM_ID}.${k}`)
      && (!conflicts.includes(k) || accepted.has(k)));

    /* Les valeurs d'avant, notées AVANT de rien toucher. */
    const before = {};
    for (const k of apply) before[k] = foundry.utils.deepClone(game.settings.get(SYSTEM_ID, k));
    await game.settings.set(SYSTEM_ID, BACKUP, { at: Date.now(), lang: pack.metadata.name, values: before });

    ui.notifications.info(L("SBE.Demo.Installing"));
    try {
      await adv.import({ dialog: false });
      for (const k of apply) await game.settings.set(SYSTEM_ID, k, settings[k]);
      await this.#relinkProps();
    } catch (err) {
      console.error("SBE | Démo : installation en échec", err);
      ui.notifications.error(L("SBE.Demo.Failed"));
      return false;
    }

    const scene = game.scenes.find(s => s.getFlag(SYSTEM_ID, DEMO_FLAG));
    const guide = game.journal.find(j => j.getFlag(SYSTEM_ID, "demoId") === "guide");
    await scene?.view();
    guide?.sheet?.render(true);
    ui.notifications.info(L("SBE.Demo.Installed"));
    return true;
  }

  /**
   * Les objets posés (coffre, levier, piège, étal) s'appuient sur
   * l'acteur support de chaque monde : celui de la démo n'est pas
   * fourni, on relie les jetons à celui d'ici.
   */
  static async #relinkProps() {
    const { PropManager } = await import("../props/prop-manager.mjs");
    const base = await PropManager.baseActor();
    if (!base) return;
    for (const scene of game.scenes.filter(s => s.getFlag(SYSTEM_ID, DEMO_FLAG))) {
      /* Repérés par leur marque d'objet posé : sans acteur, le jeton
         n'est pas encore reconnu comme tel. */
      const up = scene.tokens.filter(t => t.flags?.[SYSTEM_ID]?.prop && t.actorId !== base.id)
        .map(t => ({ _id: t.id, actorId: base.id }));
      if (up.length) await scene.updateEmbeddedDocuments("Token", up);
    }
  }

  /* ---------------------------------------------------------- */
  /*  Retirer                                                    */
  /* ---------------------------------------------------------- */

  static async remove() {
    if (!game.user.isGM) return false;
    const docs = this.documents();
    const count = Object.values(docs).reduce((n, l) => n + l.length, 0);
    const bk = this.backup();
    if (!count && !bk.at) { ui.notifications.info(L("SBE.Demo.NotInstalled")); return false; }
    const ok = await DialogV2.confirm({
      window: { title: L("SBE.Demo.RemoveTitle"), icon: "fa-solid fa-trash" },
      content: `<p>${esc(L("SBE.Demo.RemoveBody", { n: count }))}</p>
        ${Object.keys(bk.values ?? {}).length ? `<p>${esc(L("SBE.Demo.RemoveSettings"))}</p>
        <ul>${Object.keys(bk.values).map(k => `<li>${esc(this.settingLabel(k))}</li>`).join("")}</ul>` : ""}`,
      rejectClose: false
    }).catch(() => false);
    if (!ok) return false;

    /* Les fiches et objets avant leurs modèles d'atelier : un modèle encore
       utilisé (par la démo) demanderait une suppression en cascade. Un
       modèle de la démo sur lequel le MJ a bâti ses propres fiches la
       demande toujours : c'est voulu, il choisit. */
    const isTpl = (d) => d.type === "template";
    for (const c of ["scenes", "actors", "items"]) {
      const ids = (docs[c] ?? []).filter(d => !isTpl(d)).map(d => d.id).filter(id => game[c].get(id));
      if (ids.length) await game[c].documentClass.deleteDocuments(ids);
    }
    for (const c of COLLECTIONS) {
      const ids = (docs[c] ?? []).map(d => d.id).filter(id => game[c].get(id));
      if (ids.length) await game[c].documentClass.deleteDocuments(ids);
    }
    const fids = game.folders.filter(f => f.getFlag(SYSTEM_ID, DEMO_FLAG)).map(f => f.id);
    if (fids.length) await Folder.deleteDocuments(fids);

    for (const [k, v] of Object.entries(bk.values ?? {})) {
      if (game.settings.settings.has(`${SYSTEM_ID}.${k}`)) await game.settings.set(SYSTEM_ID, k, v);
    }
    await game.settings.set(SYSTEM_ID, BACKUP, {});
    ui.notifications.info(L("SBE.Demo.Removed"));
    return true;
  }
}

/* ============================================================ */
/*  Fenêtre « Démo » des paramètres du système                   */
/* ============================================================ */

export class SBEDemoApp extends ApplicationV2 {

  static DEFAULT_OPTIONS = {
    id: "sbe-demo",
    tag: "div",
    classes: ["sbe-demo"],
    window: { title: "SBE.Demo.Title", icon: "fa-solid fa-chess-rook" },
    position: { width: 480, height: "auto" },
    actions: {
      install: async function () { if (await DemoManager.install()) this.close(); else this.render(); },
      remove: async function () { await DemoManager.remove(); this.render(); }
    }
  };

  async _renderHTML() {
    const installed = DemoManager.isInstalled();
    const pack = DemoManager.packOf();
    const div = document.createElement("div");
    div.className = "sbe-demo-body";
    div.innerHTML = `
      <img class="sbe-demo-img" src="systems/${SYSTEM_ID}/assets/demo/brumeval.webp" alt="">
      <p>${esc(L("SBE.Demo.Intro"))}</p>
      <p class="sbe-demo-state ${installed ? "is-on" : ""}"><i class="fa-solid ${installed ? "fa-circle-check" : "fa-circle"}"></i>
        ${esc(L(installed ? "SBE.Demo.StateOn" : "SBE.Demo.StateOff"))}</p>
      ${pack ? "" : `<p class="notes">${esc(L("SBE.Demo.NoPack"))}</p>`}
      <div class="sbe-demo-btns">
        <button type="button" data-action="install" ${installed || !pack ? "disabled" : ""}><i class="fa-solid fa-download"></i> ${esc(L("SBE.Demo.Install"))}</button>
        <button type="button" data-action="remove" ${installed ? "" : "disabled"}><i class="fa-solid fa-trash"></i> ${esc(L("SBE.Demo.Remove"))}</button>
      </div>
      <p class="notes">${esc(L("SBE.Demo.Hint"))}</p>`;
    return div;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }
}

/** Entrée des paramètres du système : « Démo Brumeval ». */
export class SBEDemoMenu extends ApplicationV2 {
  render() {
    const app = foundry.applications.instances.get("sbe-demo") ?? new SBEDemoApp();
    app.render({ force: true });
    return this;
  }
}
