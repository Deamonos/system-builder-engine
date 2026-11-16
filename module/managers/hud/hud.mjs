/**
 * SBE — HUD : la barre d'actions à l'écran
 *
 * Montre le HUD du MODÈLE du personnage contrôlé (jeton sélectionné ;
 * pour un joueur sans jeton : son personnage assigné). Tout passe par
 * les mêmes chemins que la fiche :
 *   - une valeur lance SON jet (rollField, comme un clic sur la fiche) ;
 *   - un bouton de la fiche, une action d'objet → runAction() : mêmes
 *     étapes, mêmes conditions, mêmes raisons quand c'est impossible ;
 *   - un objet montre son info-bulle (champs « info-bulle ») et ses
 *     compteurs (champs « Montrer dans le HUD »).
 *
 * HudView sert aussi à l'APERÇU du manager (mêmes menus, rien n'est
 * exécuté).
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { walkElements, equipKeys, choiceColor, itemTipAttr, valueBounds, labelIconHTML, elementTtHtml } from "../../builder/element-renderer.mjs";
import { computeAll, evalExpression } from "../../builder/formula-engine.mjs";
import { buildInventory } from "../../builder/inventory.mjs";
import { withMarks } from "../../builder/icon-marks.mjs";
import { docScope, docContext } from "../../builder/doc-context.mjs";
import { rollField } from "../../builder/field-roll.mjs";
import { actionsOf, runAction, unavailableReason } from "../../builder/item-actions.mjs";
import { hudOf, injectHudCss, decorationsHtml, normalizeHud } from "./hud-model.mjs";
import { sampleHudModel } from "../tours/tour-samples.mjs";
import { registerPreview } from "../tours/tour-previews.mjs";
import { SBEActorEffectsApp } from "../effects/actor-effects-app.mjs";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const norm = (s) => String(s ?? "").trim().toLowerCase();

/** Une icône : classe fa-…, image, ou émoji / texte. */
export function hudIcon(ic, fallback = "") {
  const v = String(ic ?? "").trim() || fallback;
  if (!v) return "";
  if (v.includes("/") || /\.(png|jpe?g|webp|svg|gif|avif)$/i.test(v)) return `<img class="sbe-hud-ic sbe-hud-ic--img" src="${esc(v)}" alt="">`;
  if (v.includes("fa-")) {
    const cls = /fa-(solid|regular|brands)/.test(v) ? v : `fa-solid ${v}`;
    return `<i class="sbe-hud-ic ${esc(cls)}"></i>`;
  }
  return `<span class="sbe-hud-ic sbe-hud-ic--txt">${esc(v)}</span>`;
}

/* ============================================================ */
/*  Les entrées → ce qui s'affiche                              */
/* ============================================================ */

/** Texte affiché pour une valeur de la fiche. */
function valueText(el, scope, values) {
  const raw = values?.[el.key] ?? el.config?.default;
  switch (el.kind) {
    case "gauge": {
      const v = Math.round(Number(scope[el.key]) || 0);
      const { max } = valueBounds(el, scope);
      return { text: `${v} / ${Math.round(max)}` };
    }
    case "number": {
      const n = Number(scope[el.key]);
      if (!Number.isFinite(n)) return { text: "—" };
      const dec = el.config?.integer === false ? Number(el.config?.decimals ?? 2) : 0;
      return { text: String(Number(n.toFixed(dec))) };
    }
    case "checkbox": return { text: raw ? "✔" : "✘" };
    case "select": return { text: String(raw ?? ""), color: choiceColor(el, raw) };
    default: return { text: raw === undefined || raw === null ? "" : String(raw) };
  }
}

/** Compteurs d'un objet : ses champs cochés « Montrer dans le HUD ». */
function countersOf(entry, isGM) {
  const tpl = game.items?.get(entry.templateId ?? "");
  const out = [];
  for (const el of walkElements(tpl?.system?.elements ?? [])) {
    if (!el?.hudShow || !el.key || (!isGM && el.playerVisible === false)) continue;
    const v = entry.vals?.[el.key] ?? el.config?.default;
    if (v === undefined || v === null || v === "") continue;
    let text = String(v);
    if (el.kind === "checkbox") text = v ? "✔" : "✘";
    else if (el.kind === "number" || el.kind === "gauge") {
      const n = Number(v);
      text = Number.isFinite(n) ? String(Math.round(n * 100) / 100) : "—";
    }
    out.push({ label: el.label || el.key, text, icon: labelIconHTML(el), color: el.kind === "select" ? choiceColor(el, v) : "" });
  }
  return out;
}

/**
 * Construit l'arbre affiché. Une entrée « liste » peut en donner
 * plusieurs (un objet chacune) ou des sous-menus (rangement par champ).
 */
export function buildViews(cfg, { tpl, actor = null, preview = false } = {}) {
  const isGM = game.user.isGM;
  const els = new Map();
  for (const el of walkElements(tpl?.system?.elements ?? [])) if (el?.key) els.set(el.key, el);
  const inv = actor ? buildInventory(actor) : null;
  const values = actor?.system?.values ?? {};
  let scope = null;
  const scopeNow = () => (scope ??= actor ? docScope(actor) : {});
  /* Info-bulle d'un élément : la MÊME que sur la fiche (case « info-
     bulle » de l'élément), calculée avec les valeurs du personnage. */
  const tplEls = tpl?.system?.elements ?? [];
  let ttCtx = null;
  const ttOf = (el) => {
    if (!el?.config?.tt?.on) return "";
    if (!ttCtx) {
      const all = actor ? computeAll(tplEls, values, docContext(actor)) : { results: {}, breakdown: {} };
      ttCtx = { values, elements: tplEls, computedResults: all.results, breakdown: all.breakdown };
    }
    const html = elementTtHtml(el, ttCtx);
    return html ? ` data-tooltip-html="${esc(html)}"` : "";
  };
  const shownEl = (el) => isGM || el.playerVisible !== false;

  const itemView = (entry, node) => {
    const item = actor?.items?.get(entry.id);
    if (!item) return null;
    return {
      kind: "item", node, item, entry,
      label: entry.name, iconHtml: node?.type === "model" && node.icon ? hudIcon(node.icon) : withMarks(hudIcon(entry.img), entry.marks, "sbe-mk-hud"),
      color: node?.type !== "list" ? node?.color : "",
      counters: countersOf(entry, isGM),
      tip: itemTipAttr(entry, isGM)
    };
  };
  const placeholder = (node, label, icon, warn = false) => ({
    kind: "placeholder", node, label, iconHtml: hudIcon(node.icon, icon), color: node.color, warn
  });

  /* Les objets d'une liste, rangés en sous-menus selon un champ. */
  const listViews = (node) => {
    const label = node.label || (node.key ? (els.get(node.key)?.label || node.key) : L("SBE.Hud.ListAll"));
    if (!actor) return [placeholder(node, label, "fa-list")];
    /* Objets « MJ seulement » (option du modèle) : cachés aux joueurs. */
    let entries = (node.key ? (inv.byKey[node.key] ?? []) : inv.all).filter(e => isGM || !e.gmOnly);
    /* Étiquettes : « consommable, arme » = l'une d'elles ; « !recette »
       = sauf celles-ci. */
    const all = String(node.tags ?? "").split(",").map(t => t.trim()).filter(Boolean);
    const want = all.filter(t => !t.startsWith("!")).map(norm).filter(Boolean);
    const not = all.filter(t => t.startsWith("!")).map(t => norm(t.slice(1))).filter(Boolean);
    if (want.length) entries = entries.filter(e => want.some(t => (e.tags ?? []).includes(t)));
    if (not.length) entries = entries.filter(e => !not.some(t => (e.tags ?? []).includes(t)));
    const items = entries.map(e => itemView(e, node)).filter(Boolean);
    if (!node.groupBy) return items;
    /* Rangement : un sous-menu par valeur du champ (dans l'ordre des
       choix d'une liste déroulante, sinon alphabétique) ; un objet
       sans valeur reste au niveau de la liste. */
    const groups = new Map();
    const loose = [];
    let order = [];
    for (const v of items) {
      const tplEl = [...walkElements(game.items?.get(v.entry.templateId)?.system?.elements ?? [])].find(e => e?.key === node.groupBy);
      const g = String(v.entry.vals?.[node.groupBy] ?? tplEl?.config?.default ?? "").trim();
      if (!g) { loose.push(v); continue; }
      if (!groups.has(g)) {
        groups.set(g, { kind: "menu", node, label: g, iconHtml: "", color: choiceColor(tplEl, g), children: [], group: true });
        if (tplEl?.kind === "select" && !order.length) order = (tplEl.config?.choices ?? tplEl.config?.options ?? []).map(String);
      }
      groups.get(g).children.push(v);
    }
    const sorted = [...groups.values()].sort((a, b) => {
      const ia = order.indexOf(a.label), ib = order.indexOf(b.label);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 1e9 : ia) - (ib === -1 ? 1e9 : ib);
      return a.label.localeCompare(b.label, game.i18n.lang);
    });
    return [...sorted, ...loose];
  };

  const walk = (nodes) => {
    const out = [];
    for (const node of nodes ?? []) {
      if (!isGM && node.playerVisible === false) continue;
      switch (node.type) {
        case "separator": out.push({ kind: "separator", node }); break;
        case "menu": {
          const children = walk(node.children);
          /* Aperçu AVEC un personnage : exactement ce qu'il verra en jeu
             (un menu vide est caché) ; sans personnage, on montre tout. */
          /* « Affiché même vide » : le menu reste, grisé, et s'ouvre sur
             « Rien ici pour l'instant ». */
          if (!children.length && !node.keepEmpty && !(preview && !actor)) break;
          out.push({ kind: "menu", node, label: node.label || L("SBE.Hud.MenuUnnamed"), iconHtml: hudIcon(node.icon, "fa-folder"), color: node.color, children,
            empty: !children.length && !!actor });
          break;
        }
        case "value": {
          const el = els.get(node.key);
          if (!el) { if (preview) out.push(placeholder(node, `⚠ ${node.key}`, "fa-triangle-exclamation", true)); break; }
          if (!shownEl(el)) break;
          const vt = actor ? valueText(el, scopeNow(), values) : { text: "—" };
          out.push({
            kind: "value", node, el, label: node.label || el.label || el.key, tip: ttOf(el),
            iconHtml: hudIcon(node.icon || el.config?.labelIcon, ""), color: node.color,
            value: vt.text, valueColor: vt.color, roll: !!(el.config?.roll?.on && el.config?.roll?.formula)
          });
          break;
        }
        case "button": {
          const el = els.get(node.key);
          if (!el || el.kind !== "button") { if (preview) out.push(placeholder(node, `⚠ ${node.key}`, "fa-triangle-exclamation", true)); break; }
          if (!shownEl(el)) break;
          const reason = actor ? unavailableReason(actor, el) : "";
          out.push({
            kind: "button", node, el, label: node.label || el.label || el.key, tip: ttOf(el),
            iconHtml: hudIcon(node.icon || el.config?.icon, "fa-hand-pointer"), color: node.color, reason
          });
          break;
        }
        case "slot": {
          const el = els.get(node.key);
          if (!el) { if (preview) out.push(placeholder(node, `⚠ ${node.key}`, "fa-triangle-exclamation", true)); break; }
          if (!shownEl(el)) break;
          const entry = actor ? (inv.byKey[node.key] ?? []).filter(e => isGM || !e.gmOnly)[0] : null;
          const v = entry ? itemView(entry, node) : null;
          if (v) { out.push(v); break; }
          if (cfg.settings.emptySlots === "show" || (preview && !actor)) {
            out.push({ ...placeholder(node, node.label || el.label || el.key, "fa-square-dashed"), empty: true });
          }
          break;
        }
        case "list": out.push(...listViews(node)); break;
        case "model": {
          if (!actor) { out.push(placeholder(node, node.label || node.modelName, "fa-cube")); break; }
          const e = inv.all.find(x => x.modelId === node.modelId || x.id === node.modelId)
            ?? inv.all.find(x => norm(x.modelName) === norm(node.modelName));
          const v = e ? itemView(e, node) : null;
          if (v) { if (node.label) v.label = node.label; out.push(v); }
          break;
        }
      }
    }
    return out;
  };
  return walk(cfg.nodes);
}

/* ============================================================ */
/*  La vue : barre + panneaux (menus, actions d'un objet)        */
/* ============================================================ */

export class HudView {

  /**
   * @param opt { root (élément), scope (data-hud), cfg, tpl, actor,
   *              preview, mode ("dark"|"light" : aperçu), onChrome(action) }
   */
  constructor(opt) {
    this.opt = opt;
    this.panels = [];          /* [{ el, owner, depth }] */
    this.closeTimer = null;
  }

  get cfg() { return this.opt.cfg; }

  render() {
    const { root, scope, cfg, preview } = this.opt;
    this.closeAll();
    this.views = buildViews(cfg, { tpl: this.opt.tpl, actor: this.opt.actor, preview });
    const ly = cfg.look.layout;
    root.className = `${this.opt.baseClass ? `${this.opt.baseClass} ` : ""}sbe-hud sbe-hud--${ly.orientation} sbe-hud--lbl-${ly.labels}${ly.iconTop ? " sbe-hud--icontop" : ""}${ly.header ? " sbe-hud--head" : ""}${preview ? " sbe-hud--preview" : ""}${this.opt.mode ? ` sbe-hud--${this.opt.mode}` : ""}`;
    root.dataset.hud = scope;
    const chrome = this.opt.chrome ?? [];
    /* En-tête : portrait et/ou nom du personnage (sert aussi de poignée). */
    const who = this.opt.actor;
    const chromeHtml = `<div class="sbe-hud-chrome">${chrome.filter(c => !(ly.header && c.action === "grip"))
      .map(c => `<a class="sbe-hud-chr${c.on ? " is-on" : ""}${c.off ? " is-off" : ""}${c.action.startsWith("mini:") ? " sbe-hud-mini" : ""}" data-chrome="${esc(c.action)}" data-tooltip-text="${esc(c.off && c.reason ? `${c.title} — ${c.reason}` : c.title)}">${hudIcon(c.icon)}</a>`).join("")}</div>`;
    /* ZONES autour de la barre : haut, bas, gauche, droite. L'en-tête va
       où le MJ le place ; les petits boutons (verrou, fiche…) le suivent
       par défaut, ou vont dans leur propre zone. */
    const zones = { top: [], bottom: [], left: [], right: [] };
    const headSide = ly.headerPos;
    let chromeSide = ly.chromePos;
    if (chromeSide === "head") chromeSide = ly.header ? headSide : (ly.orientation === "column" ? "top" : "left");
    if (ly.header) {
      const who1 = `<span class="sbe-hud-who" data-hud-drag="1">${ly.showPortrait ? `<img src="${esc(who?.img || "icons/svg/mystery-man.svg")}" alt="">` : ""}${ly.showName ? `<span>${esc(who?.name || this.opt.tpl?.name || "")}</span>` : ""}</span>`;
      zones[headSide].push(`<div class="sbe-hud-head">${who1}${chromeSide === headSide ? chromeHtml : ""}</div>`);
    }
    if (!ly.header || chromeSide !== headSide) zones[chromeSide].push(chromeHtml);
    const zoneHtml = (k) => zones[k].length ? `<div class="sbe-hud-zone sbe-hud-zone--${k}">${zones[k].join("")}</div>` : "";
    root.innerHTML = `
      <div class="sbe-hud-frame">
        ${decorationsHtml(cfg)}
        ${zoneHtml("top")}${zoneHtml("left")}
        <div class="sbe-hud-bar">${this.views.map((v, i) => this.#btnHtml(v, String(i), true)).join("")
          || `<span class="sbe-hud-empty">${esc(L("SBE.Hud.Empty"))}</span>`}</div>
        ${zoneHtml("right")}${zoneHtml("bottom")}
      </div>`;
    this.#wire(root.querySelector(".sbe-hud-bar"), this.views, 0);
    for (const a of root.querySelectorAll("[data-chrome]")) {
      a.addEventListener("click", (ev) => { ev.preventDefault(); this.opt.onChrome?.(a.dataset.chrome, ev); });
    }
    root.onmouseleave = () => this.#scheduleClose();
    root.onmouseenter = () => this.#cancelClose();
  }

  #btnHtml(v, path, top = false) {
    if (v.kind === "separator") return `<span class="sbe-hud-sep"></span>`;
    const cls = ["sbe-hud-btn", `sbe-hud-btn--${v.kind}`];
    if (v.empty) cls.push("is-empty");
    if (!v.iconHtml) cls.push("no-ic");
    if (v.warn) cls.push("is-warn");
    if (v.reason) cls.push("is-disabled");
    if (v.kind === "value" && v.roll) cls.push("is-roll");
    const style = v.color ? ` style="--hud-node:${esc(v.color)}"` : "";
    /* Bulle : l'objet (son info-bulle), la raison d'un bouton grisé,
       l'info-bulle de l'élément, sinon le libellé (barre). */
    const tip = v.kind === "item" ? v.tip
      : v.reason ? ` data-tooltip-text="${esc(v.reason)}"`
      : v.tip ? v.tip
      : top ? ` data-tooltip-text="${esc(v.label)}"` : "";
    const val = v.kind === "value" && v.value !== ""
      ? `<span class="sbe-hud-val"${v.valueColor ? ` style="color:${esc(v.valueColor)}"` : ""}>${esc(v.value)}</span>` : "";
    const counters = v.kind === "item" && v.counters?.length
      ? `<span class="sbe-hud-cnt">${v.counters.map(c => `<span class="sbe-hud-cnt-i" title="${esc(c.label)}"${c.color ? ` style="color:${esc(c.color)}"` : ""}>${c.icon || `${esc(c.label)} `}${esc(c.text)}</span>`).join("")}</span>` : "";
    const qty = v.kind === "item" && v.entry?.qty > 1 ? `<span class="sbe-hud-qty">×${v.entry.qty}</span>` : "";
    const caret = (v.kind === "menu") ? `<span class="sbe-hud-caret"><i class="fa-solid fa-caret-${top ? (this.cfg.look.layout.orientation === "row" ? "up" : "right") : "right"}"></i></span>` : "";
    return `<button type="button" class="${cls.join(" ")}" data-path="${path}"${style}${tip}>
      ${v.iconHtml ? `<span class="sbe-hud-icbox">${v.iconHtml}</span>` : ""}
      <span class="sbe-hud-txt"><span class="sbe-hud-lbl"${v.group && v.color ? ` style="color:${esc(v.color)}"` : ""}>${esc(v.label)}</span>${val}${counters}</span>${qty}${caret}
    </button>`;
  }

  #wire(box, views, depth) {
    const hover = this.cfg.settings.openOn === "hover";
    for (const b of box.querySelectorAll(":scope > .sbe-hud-btn")) {
      const path = b.dataset.path;
      const v = views[Number(path.split(".").pop())];
      if (!v) continue;
      const opens = v.kind === "menu" || (v.kind === "item" && !this.#direct(v));
      b.addEventListener("mouseenter", () => {
        this.#cancelClose();
        /* Au survol, seuls les MENUS s'ouvrent ; les actions d'un
           objet attendent le clic (pas de menu qui surgit en passant). */
        if (hover && v.kind === "menu") this.#open(v, b, depth);
        else if (hover && this.panels[depth]?.owner !== b) this.#closeFrom(depth);
      });
      b.addEventListener("click", (ev) => {
        ev.preventDefault();
        if (opens) {
          const cur = this.panels[depth];
          if (cur?.owner === b && (!hover || v.kind === "item")) this.#closeFrom(depth);
          else this.#open(v, b, depth);
          return;
        }
        this.#activate(v);
      });
      if (v.kind === "item") {
        b.addEventListener("contextmenu", (ev) => { ev.preventDefault(); if (!this.opt.preview) v.item.sheet?.render(true); });
      }
    }
  }

  /** Objet à une seule action, et l'option « clic direct » : pas de panneau. */
  #direct(v) {
    if (!this.cfg.settings.directRun || v.kind !== "item") return false;
    const acts = actionsOf(v.item);
    return acts.length === 1;
  }

  async #activate(v) {
    if (this.opt.preview) { ui.notifications.info(L("SBE.Hud.PreviewNoRun")); return; }
    const actor = this.opt.actor;
    if (v.kind === "value") { if (v.roll) await rollField(actor, v.el.key, { ask: true, after: "card" }); return; }
    if (v.kind === "button") {
      if (v.reason) { ui.notifications.warn(v.reason); return; }
      this.closeAll();
      await runAction(actor, v.el.id);
      return;
    }
    if (v.kind === "item") {
      const a = actionsOf(v.item)[0];
      if (!a) return;
      if (a.disabled) { ui.notifications.warn(a.reason); return; }
      this.closeAll();
      await runAction(v.item, a.id);
    }
  }

  /* --- Panneaux --- */

  #open(v, owner, depth) {
    if (this.panels[depth]?.owner === owner) { this.#closeFrom(depth + 1); return; }
    this.#closeFrom(depth);
    const p = document.createElement("div");
    p.className = "sbe-hud-panel";
    if (v.kind === "menu") {
      const kids = v.children ?? [];
      /* Le CONTENU défile dans sa propre boîte : le panneau, lui, reste
         fixe — ses décorations (coins, équerres, écran…) restent aux
         bords au lieu de remonter avec la liste. */
      p.innerHTML = `<div class="sbe-hud-ptitle">${esc(v.label)}</div><div class="sbe-hud-pbody">` + (kids.length
        ? kids.map((c, i) => this.#btnHtml(c, `${owner.dataset.path}.${i}`)).join("")
        : `<span class="sbe-hud-empty">${esc(L("SBE.Hud.MenuEmpty"))}</span>`) + `</div>`;
      this.opt.root.appendChild(p);
      this.#wire(p.querySelector(".sbe-hud-pbody"), kids, depth + 1);
    } else {
      /* Les actions d'un objet : exactement celles de l'inventaire. */
      const acts = this.opt.preview && !v.item ? [] : actionsOf(v.item);
      p.innerHTML = `<div class="sbe-hud-ptitle">${esc(v.label)}</div><div class="sbe-hud-pbody">` +
        acts.map(a => `<button type="button" class="sbe-hud-btn sbe-hud-btn--action${a.disabled ? " is-disabled" : ""}" data-act="${esc(a.id)}"${a.disabled ? ` data-tooltip-text="${esc(a.reason)}"` : ""}>
            ${a.icon ? `<span class="sbe-hud-icbox">${hudIcon(a.icon)}</span>` : ""}<span class="sbe-hud-txt"><span class="sbe-hud-lbl">${esc(a.label)}</span></span></button>`).join("") +
        `<button type="button" class="sbe-hud-btn sbe-hud-btn--action sbe-hud-open" data-open="1">
            <span class="sbe-hud-icbox">${hudIcon("fa-up-right-from-square")}</span><span class="sbe-hud-txt"><span class="sbe-hud-lbl">${esc(L("SBE.Actions.Open"))}</span></span></button></div>`;
      this.opt.root.appendChild(p);
      for (const b of p.querySelectorAll("[data-act]")) {
        b.addEventListener("mouseenter", () => this.#cancelClose());
        b.addEventListener("click", async () => {
          if (this.opt.preview) { ui.notifications.info(L("SBE.Hud.PreviewNoRun")); return; }
          const a = acts.find(x => x.id === b.dataset.act);
          if (a?.disabled) { ui.notifications.warn(a.reason); return; }
          this.closeAll();
          await runAction(v.item, b.dataset.act);
        });
      }
      p.querySelector("[data-open]")?.addEventListener("click", () => {
        if (this.opt.preview) return;
        this.closeAll();
        v.item.sheet?.render(true);
      });
    }
    p.addEventListener("mouseenter", () => this.#cancelClose());
    p.addEventListener("mouseleave", () => this.#scheduleClose());
    owner.classList.add("is-open");
    this.panels[depth] = { el: p, owner, depth };
    this.#place(p, owner, depth);
  }

  /** Place un panneau près de son bouton, toujours dans l'écran. */
  #place(p, owner, depth) {
    const r = owner.getBoundingClientRect();
    const host = this.opt.root.getBoundingClientRect();
    const bounds = this.opt.bounds?.() ?? { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    const pw = p.offsetWidth, ph = p.offsetHeight;
    const row = this.cfg.look.layout.orientation === "row";
    let x, y;
    if (depth === 0 && row) {
      x = r.left;
      const below = (host.top + host.bottom) / 2 < (bounds.top + bounds.bottom) / 2;
      /* Au-dessus (ou au-dessous) de TOUT le HUD : l'en-tête et les
         décorations restent visibles. */
      const fr = this.opt.root.querySelector(".sbe-hud-frame")?.getBoundingClientRect() ?? r;
      y = below ? fr.bottom + 6 : fr.top - ph - 6;
    } else {
      const right = depth === 0 ? (host.left + host.right) / 2 < (bounds.left + bounds.right) / 2 : true;
      x = right ? r.right + 6 : r.left - pw - 6;
      if (x + pw > bounds.right) x = r.left - pw - 6;
      y = r.top;
    }
    x = Math.max(bounds.left + 4, Math.min(x, bounds.right - pw - 4));
    y = Math.max(bounds.top + 4, Math.min(y, bounds.bottom - ph - 4));
    /* Coordonnées relatives à la racine (fixe ou dans l'aperçu). */
    p.style.left = `${x - host.left}px`;
    p.style.top = `${y - host.top}px`;
  }

  #closeFrom(depth) {
    for (let d = this.panels.length - 1; d >= depth; d--) {
      const pn = this.panels[d];
      if (!pn) continue;
      pn.owner?.classList.remove("is-open");
      pn.el.remove();
    }
    this.panels.length = Math.min(this.panels.length, depth);
  }

  closeAll() { this.#cancelClose(); this.#closeFrom(0); }

  #scheduleClose() {
    if (this.cfg.settings.openOn !== "hover") return;
    this.#cancelClose();
    this.closeTimer = setTimeout(() => this.#closeFrom(0), 350);
  }

  #cancelClose() { if (this.closeTimer) { clearTimeout(this.closeTimer); this.closeTimer = null; } }
}

/**
 * Les boutons de l'en-tête (poignée, verrou, effets, barre de macros, fiche).
 * UNE seule liste : le HUD en jeu et l'aperçu du manager montrent
 * exactement les mêmes.
 */
export function hudChrome(cfg, { locked = false, hideBar = false, actor = null, preview = false } = {}) {
  return [
    { action: "grip", icon: "fa-grip-vertical", title: L("SBE.Hud.Move") },
    { action: "lock", icon: locked ? "fa-lock" : "fa-lock-open", title: L(locked ? "SBE.Hud.Unlock" : "SBE.Hud.Lock"), on: locked },
    ...hudMinis(cfg, actor, { preview }),
    ...(cfg.settings.effectsButton ? [{ action: "effects", icon: "fa-bolt", title: L("SBE.Hud.EffectsBtn") }] : []),
    ...(cfg.settings.hotbarButton ? [{ action: "hotbar", icon: "fa-table-cells-large", title: L(hideBar ? "SBE.Hud.ShowHotbar" : "SBE.Hud.HideHotbar"), on: hideBar }] : []),
    { action: "sheet", icon: "fa-id-card", title: L("SBE.Hud.OpenSheet") }
  ];
}

/** Le premier objet ÉQUIPÉ (slot de la fiche ou conteneur « équipé ») qui a ce bouton. */
function equippedAction(actor, key) {
  const slots = equipKeys(actor.system?.template?.system?.elements ?? []);
  for (const it of actor.items ?? []) {
    if (it.type !== "objet") continue;
    const c = it.system?.carry ?? {};
    if (String(c.host ?? "") || !slots.has(String(c.where ?? ""))) continue;
    const a = actionsOf(it).find(x => x.el?.key === key);
    if (a) return { item: it, a };
  }
  return null;
}

/**
 * Les PETITS BOUTONS du MJ (à côté du cadenas) pour ce personnage :
 * seulement ceux qui ont de quoi agir (un objet équipé qui a le bouton,
 * un bouton de la fiche). Sans personnage (aperçu), tous.
 */
export function hudMinis(cfg, actor, { preview = false } = {}) {
  const out = [];
  for (const m of cfg.minis ?? []) {
    if (!m.key) continue;
    const base = { action: `mini:${m.id}`, icon: m.icon, title: m.label || m.key };
    if (!actor) { if (preview) out.push(base); continue; }
    if (m.kind === "sheet") {
      const el = [...walkElements(actor.system?.template?.system?.elements ?? [])].find(e => e?.kind === "button" && e.key === m.key);
      if (!el) continue;
      const reason = unavailableReason(actor, el);
      out.push({ ...base, title: m.label || el.label || m.key, off: !!reason, reason, run: () => runAction(actor, el.id) });
      continue;
    }
    const hit = equippedAction(actor, m.key);
    if (!hit) continue;
    let on = false;
    if (m.onIf) {
      try { const r = evalExpression(m.onIf, docScope(hit.item)); on = r !== null && r !== undefined && !!r; } catch (_e) { on = false; }
    }
    out.push({ ...base, title: m.label || hit.a.label, on, off: hit.a.disabled, reason: hit.a.reason,
      run: () => runAction(hit.item, hit.a.id) });
  }
  return out;
}

/* ============================================================ */
/*  Le HUD de l'écran                                           */
/* ============================================================ */

export class SBEHud {

  static #root = null;
  static #view = null;
  static #preview = null;     /* { tplId, cfg } : aperçu du manager */
  static #timer = null;
  static #actorId = null;

  static init() {
    /* Barre de macros masquée : réglage de CHAQUE joueur (paramètres du
       système), indépendant du HUD — le bouton du HUD le bascule aussi. */
    game.settings.register(SYSTEM_ID, "hudHideHotbar", {
      name: "SBE.Hud.SettingHideHotbar",
      hint: "SBE.Hud.SettingHideHotbarHint",
      scope: "client",
      config: true,
      type: Boolean,
      default: false,
      onChange: () => { this.applyHotbar(); this.refreshSoon(); }
    });
    /* Position du HUD : chaque joueur peut la remettre à sa place par
       défaut depuis les paramètres du système (centré, à 80 % de la
       hauteur, ou l'ancrage choisi par le MJ). */
    game.settings.registerMenu(SYSTEM_ID, "hudResetPos", {
      name: "SBE.Hud.SettingResetPos",
      label: "SBE.Hud.SettingResetPosLabel",
      hint: "SBE.Hud.SettingResetPosHint",
      icon: "fa-solid fa-arrows-to-dot",
      type: SBEHudResetPos,
      restricted: false
    });
    const soon = () => this.refreshSoon();
    Hooks.on("controlToken", soon);
    Hooks.on("canvasReady", soon);
    Hooks.on("updateUser", (u) => { if (u.id === game.user.id) soon(); });
    Hooks.on("updateActor", (a) => {
      if (a.id === this.#actorId || (a.type === "template" && a.id === this.#tplId())) soon();
    });
    for (const h of ["createItem", "updateItem", "deleteItem"]) {
      Hooks.on(h, (it) => { if (it.parent?.id === this.#actorId) soon(); });
    }
    Hooks.on("updateItem", (it) => { if (it.type === "template") soon(); });
    Hooks.on("collapseSidebar", soon);
    window.addEventListener("resize", () => this.#clamp());
    registerPreview("hud", { show: () => this.tourPreview(true), hide: () => this.tourPreview(false) });
  }

  static ready() { this.applyHotbar(); this.refresh(); }

  /* APERÇU (visites guidées) : un HUD d'exemple (jets, objet en main,
     sac, action) sur un modèle tenu en mémoire, sans personnage ni pion
     choisi. Le vrai HUD affiché passe avant (rien n'est ajouté). */
  static #tour = null;      /* { root, view } */

  static tourPreview(on) {
    this.#tour?.view.closeAll();
    this.#tour?.root.remove();
    this.#tour = null;
    document.getElementById("sbe-hud-css-tour")?.remove();
    if (!on || this.#root) return;
    const tpl = sampleHudModel();
    const cfg = normalizeHud(tpl.system.hud);
    injectHudCss("tour", cfg);
    const root = document.createElement("div");
    root.id = "sbe-hud-tour";
    (document.getElementById("interface") ?? document.body).appendChild(root);
    const view = new HudView({ root, scope: "tour", cfg, tpl, actor: null, preview: true, chrome: hudChrome(cfg, { preview: true }) });
    view.render();
    /* Le premier menu (« Attaquer ») ouvert : on voit ce que le HUD propose. */
    root.querySelector('.sbe-hud-bar [data-path="0"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    root.style.position = "fixed";
    const ly = cfg.look.layout;
    root.style.left = `${Math.round(Math.max(0, window.innerWidth * ly.posX / 100 - root.offsetWidth / 2))}px`;
    root.style.top = `${Math.round(Math.max(0, window.innerHeight * ly.posY / 100 - root.offsetHeight / 2))}px`;
    this.#tour = { root, view };
  }

  /** Barre de macros : masquée ou non, selon le réglage du joueur. */
  static applyHotbar() {
    let hide = false;
    try { hide = !!game.settings.get(SYSTEM_ID, "hudHideHotbar"); } catch (_e) { /* pas encore inscrit */ }
    document.body.classList.toggle("sbe-hud-nohotbar", hide);
  }

  static #tplId() { return game.actors.get(this.#actorId)?.system?.templateId ?? ""; }

  /** Le personnage dont on montre le HUD. */
  static currentActor() {
    const tok = canvas?.tokens?.controlled?.[0];
    const a = tok?.actor;
    if (a?.type === "personnage" && a.isOwner) return a;
    if (tok) return null;
    const c = game.user.character;
    return c?.type === "personnage" && c.isOwner ? c : null;
  }

  static refreshSoon() {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.refresh(), 60);
  }

  /** Aperçu du manager sur l'écran (null = fin de l'aperçu). */
  static preview(tplId, cfg) {
    this.#preview = cfg ? { tplId, cfg } : null;
    this.refresh();
  }

  static refresh() {
    const actor = this.currentActor();
    const tpl = actor?.system?.template ?? null;
    const cfg = tpl && this.#preview?.tplId === tpl.id ? this.#preview.cfg : (tpl ? hudOf(tpl) : null);
    if (!actor || !tpl || !cfg?.enabled || !cfg.nodes.length) { this.hide(); return; }
    this.#actorId = actor.id;
    if (!this.#root) {
      this.#root = document.createElement("div");
      this.#root.id = "sbe-hud";
      (document.getElementById("interface") ?? document.body).appendChild(this.#root);
    }
    const root = this.#root;
    const scope = this.#preview?.tplId === tpl.id ? `${tpl.id}-live` : tpl.id;
    injectHudCss(scope, cfg);
    const locked = !!game.user.getFlag(SYSTEM_ID, "hudLocked");
    const hideBar = game.settings.get(SYSTEM_ID, "hudHideHotbar");
    const chrome = hudChrome(cfg, { locked, hideBar, actor });
    this.#view = new HudView({
      root, scope, cfg, tpl, actor, chrome,
      onChrome: (a) => this.#chrome(a, actor, chrome)
    });
    this.#view.render();
    root.classList.toggle("is-locked", locked);
    root.style.opacity = String(cfg.look.layout.opacity / 100);
    this.applyHotbar();
    this.#wireDrag(root);
    this.#position(cfg);
  }

  static hide() {
    this.#view?.closeAll();
    this.#root?.remove();
    this.#root = null;
    this.#view = null;
    this.#actorId = null;
  }

  static async #chrome(action, actor, chrome = []) {
    /* Petit bouton du MJ : son action (objet équipé ou fiche). */
    if (action.startsWith("mini:")) {
      const c = chrome.find(x => x.action === action);
      if (!c?.run) return;
      if (c.off) { if (c.reason) ui.notifications.warn(c.reason); return; }
      await c.run();
      return;
    }
    if (action === "lock") {
      await game.user.setFlag(SYSTEM_ID, "hudLocked", !game.user.getFlag(SYSTEM_ID, "hudLocked"));
      this.refresh();
    } else if (action === "hotbar") {
      await game.settings.set(SYSTEM_ID, "hudHideHotbar", !game.settings.get(SYSTEM_ID, "hudHideHotbar"));
      this.refresh();
    } else if (action === "effects") SBEActorEffectsApp.open(actor);
    else if (action === "sheet") actor.sheet?.render(true);
  }

  /** Position : celle de l'utilisateur, sinon la position de départ du MJ. */
  static #position(cfg) {
    const root = this.#root;
    if (!root) return;
    root.style.position = "fixed";
    const pos = game.user.getFlag(SYSTEM_ID, "hudPos");
    const w = root.offsetWidth, h = root.offsetHeight;
    let x, y;
    if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) ({ x, y } = pos);
    else {
      /* Position de départ du MJ : le centre du HUD à posX % / posY %. */
      const ly = cfg.look.layout;
      x = window.innerWidth * ly.posX / 100 - w / 2;
      y = window.innerHeight * ly.posY / 100 - h / 2;
    }
    root.style.left = `${Math.round(x)}px`;
    root.style.top = `${Math.round(y)}px`;
    this.#clamp();
  }

  static #clamp() {
    const root = this.#root;
    if (!root) return;
    const r = root.getBoundingClientRect();
    const x = Math.max(0, Math.min(r.left, window.innerWidth - r.width));
    const y = Math.max(0, Math.min(r.top, window.innerHeight - r.height));
    root.style.left = `${Math.round(x)}px`;
    root.style.top = `${Math.round(y)}px`;
  }

  static #wireDrag(root) {
    for (const grip of root.querySelectorAll('[data-chrome="grip"], [data-hud-drag]')) grip.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0 || game.user.getFlag(SYSTEM_ID, "hudLocked")) return;
      ev.preventDefault();
      this.#view?.closeAll();
      const r = root.getBoundingClientRect();
      const dx = ev.clientX - r.left, dy = ev.clientY - r.top;
      const move = (e) => {
        root.style.left = `${Math.round(e.clientX - dx)}px`;
        root.style.top = `${Math.round(e.clientY - dy)}px`;
      };
      const up = async () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        this.#clamp();
        const b = root.getBoundingClientRect();
        await game.user.setFlag(SYSTEM_ID, "hudPos", { x: Math.round(b.left), y: Math.round(b.top) });
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });
  }

  /** Remet le HUD à sa place par défaut (bouton du manager). */
  static async resetPosition() {
    await game.user.unsetFlag(SYSTEM_ID, "hudPos");
    this.refresh();
  }
}

/** Bouton d'un clic des paramètres : remet le HUD en place, sans
    ouvrir de fenêtre (Foundry exige une sous-classe d'ApplicationV2). */
class SBEHudResetPos extends foundry.applications.api.ApplicationV2 {
  async render() {
    await SBEHud.resetPosition();
    ui.notifications.info(game.i18n.localize("SBE.Hud.ResetPosDone"));
    return this;
  }
  async close() { return this; }
}
