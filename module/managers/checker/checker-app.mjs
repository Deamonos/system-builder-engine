/**
 * SBE — VÉRIFICATEUR DE MODÈLES : les fenêtres
 *
 *  - SBECheckerApp : le RAPPORT (un modèle, ou tout le monde). Chaque
 *    ligne dit où est le problème et ouvre la fenêtre concernée.
 *    Au chargement du monde (MJ), il s'ouvre tout seul s'il y a des
 *    problèmes, avec « Ne plus m'avertir pour ces problèmes ».
 *  - KeyRename : à l'enregistrement d'un composant dont la clé change,
 *    la liste de tout ce qui l'utilise, les autres modèles qui ont la
 *    même clé (à cocher), puis « Renommer partout » ou « Annuler ».
 *    Les valeurs déjà saisies suivent la nouvelle clé.
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { check, find, rename, moveValues, templatesOf, familyOf, renamedKey } from "./ref-engine.mjs";
import { walkElements } from "../../builder/element-renderer.mjs";
import "./ref-sources.mjs";

const { ApplicationV2, DialogV2 } = foundry.applications.api;
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const IGNORED = "checkerIgnored";

const sig = (i) => `${i.ctn.id}|${i.where}|${i.msg}`;

/* ============================================================ */
/*  RAPPORT                                                      */
/* ============================================================ */

export class SBECheckerApp extends ApplicationV2 {

  constructor(options = {}) {
    super(options);
    this.template = options.template ?? null;
    this.onLoad = !!options.onLoad;
    this._issues = null;
  }

  static DEFAULT_OPTIONS = {
    tag: "div",
    classes: ["sbe-checker"],
    window: { icon: "fa-solid fa-stethoscope", resizable: true },
    position: { width: 640, height: 560 }
  };

  get title() {
    return this.template ? L("SBE.Checker.TitleTpl", { name: this.template.name }) : L("SBE.Checker.Title");
  }

  static ignored() {
    try { return new Set(game.settings.get(SYSTEM_ID, IGNORED) ?? []); } catch (_e) { return new Set(); }
  }

  #run() {
    this._issues = check({ onlyTemplate: this.template });
    return this._issues;
  }

  async _renderHTML() {
    const issues = this._issues ?? this.#run();
    const ign = SBECheckerApp.ignored();
    const errors = issues.filter(i => i.level === "error").length;
    const warns = issues.length - errors;
    const groups = new Map();
    for (const i of issues) {
      if (!groups.has(i.ctn.id)) groups.set(i.ctn.id, { ctn: i.ctn, list: [] });
      groups.get(i.ctn.id).list.push(i);
    }
    let n = 0;
    const rows = [...groups.values()].map(g => `
      <section class="sbe-chk-group">
        <header class="sbe-chk-ghead">
          <span class="sbe-chk-gname">${esc(g.ctn.label)}</span>
          <button type="button" class="sbe-chk-open" data-open="${esc(g.ctn.id)}" data-tooltip="${esc(L("SBE.Checker.Open"))}"
            aria-label="${esc(L("SBE.Checker.Open"))}"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>
        </header>
        <ul>${g.list.map(i => {
          const k = n++;
          const off = ign.has(sig(i));
          return `<li class="sbe-chk-row is-${i.level}${off ? " is-ignored" : ""}" data-i="${k}">
            <i class="fa-solid ${i.level === "error" ? "fa-circle-xmark" : "fa-triangle-exclamation"}"></i>
            <div class="sbe-chk-text">
              ${i.where ? `<span class="sbe-chk-where">${esc(i.where)}</span>` : ""}
              <span class="sbe-chk-msg">${esc(i.msg)}</span>
              ${off ? `<span class="sbe-chk-ign">${esc(L("SBE.Checker.Ignored"))}</span>` : ""}
            </div>
          </li>`;
        }).join("")}</ul>
      </section>`).join("");
    const head = issues.length
      /* Un compteur à zéro reste discret ; la légende (« ? ») suit les compteurs. */
      ? `<div class="sbe-chk-sum"><b class="is-error${errors ? "" : " is-zero"}">${L("SBE.Checker.Errors", { n: errors })}</b> · <b class="is-warn${warns ? "" : " is-zero"}">${L("SBE.Checker.Warns", { n: warns })}</b>
          <p class="notes">${esc(L("SBE.Checker.Legend"))}</p></div>`
      : `<p class="sbe-chk-sum is-ok"><i class="fa-solid fa-circle-check"></i> ${esc(L("SBE.Checker.AllGood"))}</p>`;
    /* Texte d'accueil laissé visible (une « notes » se replie en « ? »). */
    const intro = this.onLoad ? `<p class="sbe-chk-intro">${esc(L("SBE.Checker.OnLoadIntro"))}</p>` : "";
    const ignBox = this.onLoad && issues.length ? `<label class="sbe-chk-ignbox"><input type="checkbox" name="ignore"> ${esc(L("SBE.Checker.IgnoreThese"))}</label>` : "";
    const unIgn = !this.onLoad && issues.some(i => ign.has(sig(i)))
      ? `<button type="button" data-act="unignore"><i class="fa-solid fa-bell"></i> ${esc(L("SBE.Checker.Unignore"))}</button>` : "";
    return `
      <div class="sbe-chk">
        ${intro}${head}
        <div class="sbe-chk-scroll">${rows}</div>
        <footer class="sbe-chk-foot">
          ${ignBox}
          ${unIgn}
          <button type="button" data-act="recheck"><i class="fa-solid fa-rotate"></i> ${esc(L("SBE.Checker.Recheck"))}</button>
          <button type="button" data-act="close"><i class="fa-solid fa-check"></i> ${esc(L("SBE.Common.Close"))}</button>
        </footer>
      </div>`;
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
    const byId = new Map((this._issues ?? []).map(i => [i.ctn.id, i.ctn]));
    content.querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", () => {
      const ctn = byId.get(b.dataset.open);
      try { ctn?.open?.(); } catch (err) { console.warn("SBE | Vérificateur : ouverture en échec", err); }
    }));
    content.querySelector('[data-act="recheck"]')?.addEventListener("click", () => { this._issues = null; this.render(); });
    content.querySelector('[data-act="unignore"]')?.addEventListener("click", async () => {
      await game.settings.set(SYSTEM_ID, IGNORED, []);
      this.render();
    });
    content.querySelector('[data-act="close"]')?.addEventListener("click", async () => {
      if (content.querySelector('[name="ignore"]')?.checked) {
        const set = SBECheckerApp.ignored();
        for (const i of this._issues ?? []) set.add(sig(i));
        await game.settings.set(SYSTEM_ID, IGNORED, [...set]);
      }
      this.close();
    });
  }

  /** Ouvre le rapport (d'un modèle, ou de tout le monde). */
  static open({ template = null } = {}) {
    const id = template ? `sbe-checker-${template.id}` : "sbe-checker";
    const cur = foundry.applications.instances.get(id);
    if (cur) { cur._issues = null; return cur.render({ force: true }); }
    return new SBECheckerApp({ id, template }).render({ force: true });
  }

  /** Au chargement du monde : la fenêtre s'ouvre s'il y a des problèmes
      (hors ceux que le MJ a choisi d'ignorer). */
  static onReady() {
    if (!game.user.isGM) return;
    let issues = [];
    try { issues = check(); } catch (err) { console.warn("SBE | Vérificateur : examen au chargement en échec", err); return; }
    const ign = this.ignored();
    if (!issues.some(i => !ign.has(sig(i)))) return;
    const app = new SBECheckerApp({ id: "sbe-checker", onLoad: true });
    app._issues = issues;
    app.render({ force: true });
  }
}

/** Entrée des paramètres du système : « Vérifier les modèles ». */
export class SBECheckerMenu extends ApplicationV2 {
  render() { SBECheckerApp.open(); return this; }
}

/* ============================================================ */
/*  RENOMMER UNE CLÉ                                             */
/* ============================================================ */

export class KeyRename {

  /**
   * Fenêtre avant l'enregistrement. `tpl` : le modèle modifié.
   * @returns {Promise<null|{tpl, old, nw, fam, templates: string[]}>}
   *   null = annulé (le composant n'est pas enregistré).
   */
  static async ask(tpl, old, nw) {
    const fam = familyOf(tpl);
    const others = templatesOf(fam).filter(t => t.id !== tpl.id
      && [...walkElements(t.system?.elements ?? [])].some(el => el?.key === old));
    const blocked = new Set(others.filter(t => [...walkElements(t.system?.elements ?? [])].some(el => el?.key === nw)).map(t => t.id));
    const hitsFor = (ids) => find(old, fam, [tpl.id, ...ids]);
    const list = (ids) => {
      const hits = hitsFor(ids);
      if (!hits.length) return `<p class="notes">${esc(L("SBE.Checker.RenameNone"))}</p>`;
      const by = new Map();
      for (const h of hits) {
        if (!by.has(h.ctn.id)) by.set(h.ctn.id, { label: h.ctn.label, where: [] });
        by.get(h.ctn.id).where.push(h.where);
      }
      return `<ul class="sbe-chk-hits">${[...by.values()].map(g => `<li><b>${esc(g.label)}</b>${g.where.filter(Boolean).length ? ` — ${esc([...new Set(g.where.filter(Boolean))].join(", "))}` : ""}</li>`).join("")}</ul>`;
    };
    const othersHtml = others.length ? `
      <h4>${esc(L("SBE.Checker.RenameOthers", { key: old }))}</h4>
      <p class="notes">${esc(L("SBE.Checker.RenameOthersHint"))}</p>
      <div class="sbe-chk-others">${others.map(t => `
        <label><input type="checkbox" name="tpl" value="${t.id}" ${blocked.has(t.id) ? "disabled" : "checked"}>
          ${esc(t.name)}${blocked.has(t.id) ? ` <span class="notes">— ${esc(L("SBE.Checker.RenameTaken", { key: nw }))}</span>` : ""}</label>`).join("")}</div>` : "";
    const initial = others.filter(t => !blocked.has(t.id)).map(t => t.id);
    const content = `
      <div class="sbe-chk sbe-chk-rename">
        <p>${L("SBE.Checker.RenameIntro", { old: `<code>${esc(old)}</code>`, nw: `<code>${esc(nw)}</code>` })}</p>
        <h4>${esc(L("SBE.Checker.RenameUsed"))}</h4>
        <div class="sbe-chk-hitbox">${list(initial)}</div>
        ${othersHtml}
        <p class="notes">${esc(L("SBE.Checker.RenameValues"))}</p>
      </div>`;
    const res = await DialogV2.wait({
      window: { title: L("SBE.Checker.RenameTitle"), icon: "fa-solid fa-i-cursor" },
      position: { width: 560 },
      content,
      buttons: [
        { action: "ok", label: L("SBE.Checker.RenameAll"), icon: "fa-solid fa-check", default: true,
          callback: (_ev, button) => [...button.form.querySelectorAll('[name="tpl"]:checked')].map(i => i.value) },
        { action: "cancel", label: L("SBE.Common.Cancel"), icon: "fa-solid fa-xmark" }
      ],
      render: (_ev, dialog) => {
        const root = dialog?.element ?? dialog;
        root.querySelectorAll('[name="tpl"]').forEach(box => box.addEventListener("change", () => {
          const ids = [...root.querySelectorAll('[name="tpl"]:checked')].map(i => i.value);
          const hb = root.querySelector(".sbe-chk-hitbox");
          if (hb) hb.innerHTML = list(ids);
        }));
      },
      rejectClose: false
    }).catch(() => null);
    if (!Array.isArray(res)) return null;
    return { tpl, old, nw, fam, templates: [tpl.id, ...res] };
  }

  /** AVANT l'enregistrement du modèle : les valeurs suivent la clé. */
  static async moveValues(plan) {
    const r = await moveValues(plan.old, plan.nw, plan.fam, plan.templates);
    plan.locked = r.locked;
    return r;
  }

  /** APRÈS l'enregistrement : toutes les références suivent. */
  static async applyRefs(plan) {
    const r = await rename(plan.old, plan.nw, plan.fam, plan.templates);
    const lines = [L("SBE.Checker.RenameDone", { old: plan.old, nw: plan.nw, n: r.changed })];
    if (r.failed.length) lines.push(L("SBE.Checker.RenameFailed", { list: r.failed.join(", ") }));
    if (plan.locked?.length) lines.push(L("SBE.Checker.RenameLocked", { list: plan.locked.join(", ") }));
    ui.notifications[r.failed.length || plan.locked?.length ? "warn" : "info"](lines.join(" "));
    return r;
  }
}

/* ============================================================ */
/*  BRANCHEMENTS                                                 */
/* ============================================================ */

export function initChecker() {
  game.settings.register(SYSTEM_ID, IGNORED, { scope: "world", config: false, type: Array, default: [] });
  game.settings.registerMenu(SYSTEM_ID, "checkerMenu", {
    name: "SBE.Checker.MenuName",
    label: "SBE.Checker.MenuLabel",
    hint: "SBE.Checker.MenuHint",
    icon: "fa-solid fa-stethoscope",
    type: SBECheckerMenu,
    restricted: true
  });
  Hooks.once("ready", () => setTimeout(() => SBECheckerApp.onReady(), 1500));
}

export { renamedKey };
