/**
 * SBE — Documentation intégrée
 *
 * La documentation est livrée AVEC le système, en fichiers : rien à
 * importer, rien à redémarrer ; la mettre à jour, c'est remplacer ces
 * fichiers.
 *   docs/manifest.json         chapitres et pages (titres FR / EN)
 *   docs/<langue>/<page>.md    une page, écrite en Markdown
 *   docs/img/…                 les captures
 * Une page lit la langue de Foundry (l'anglais pour une langue sans
 * documentation). Liens entre pages : [texte](#id-de-page) ; image :
 * ![légende](img/fichier.webp).
 *
 * On y arrive par le bouton des paramètres du système, par le petit
 * livre dans l'en-tête des fenêtres SBE (sa page) et par la fin des
 * visites guidées.
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { docPageFor, setKnownPages } from "./docs-links.mjs";

const { ApplicationV2 } = foundry.applications.api;
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const ROOT = `systems/${SYSTEM_ID}/docs`;
const LANGS = ["fr", "en"];
const LAST = "docsLastPage";

export class DocsManager {

  static #manifest = null;
  static #pages = new Map();      /* « fr:idees » → Markdown */

  static init() {
    game.settings.register(SYSTEM_ID, LAST, { scope: "client", config: false, type: String, default: "" });
    game.settings.registerMenu(SYSTEM_ID, "docsMenu", {
      name: "SBE.Docs.MenuName",
      label: "SBE.Docs.MenuLabel",
      hint: "SBE.Docs.MenuHint",
      icon: "fa-solid fa-book",
      type: SBEDocsMenu,
      restricted: true
    });
    Hooks.once("ready", async () => {
      if (!game.user.isGM) return;
      setKnownPages((await this.flatPages()).map(p => p.id));
      Hooks.on("renderApplicationV2", (app) => this.#headerButton(app));
    });
  }

  /** Langue de la documentation : celle de Foundry si elle existe. */
  static lang() {
    return LANGS.includes(game.i18n.lang) ? game.i18n.lang : "en";
  }

  /** Chapitres et pages : [{ id, title, pages: [{ id, title }] }]. */
  static async manifest() {
    if (!this.#manifest) {
      const res = await fetch(`${ROOT}/manifest.json`, { cache: "no-cache" }).catch(() => null);
      this.#manifest = res?.ok ? await res.json() : { chapters: [] };
    }
    const lang = this.lang();
    const t = (o) => (typeof o === "string" ? o : (o?.[lang] ?? o?.en ?? o?.fr ?? ""));
    /* Chapitres numérotés dans l'ordre du sommaire : « 3. Les composants ». */
    return (this.#manifest.chapters ?? []).map((c, i) => ({
      id: c.id, num: i + 1, title: `${i + 1}. ${t(c.title)}`,
      pages: (c.pages ?? []).map(p => ({ id: p.id, title: t(p.title) }))
    }));
  }

  /** Toutes les pages, dans l'ordre de lecture. */
  static async flatPages() {
    return (await this.manifest()).flatMap(c => c.pages.map(p => ({ ...p, chapter: c.title })));
  }

  /** Le Markdown d'une page (gardé une fois lu). */
  static async source(id) {
    const key = `${this.lang()}:${id}`;
    if (!this.#pages.has(key)) {
      const res = await fetch(`${ROOT}/${this.lang()}/${id}.md`, { cache: "no-cache" }).catch(() => null);
      this.#pages.set(key, res?.ok ? await res.text() : "");
    }
    return this.#pages.get(key);
  }

  /** Markdown → HTML : liens entre pages et images ramenés au dossier de la doc. */
  static render(md) {
    const conv = new showdown.Converter({ tables: true, strikethrough: true, ghCodeBlocks: true, simpleLineBreaks: false,
      openLinksInNewWindow: false, emoji: false });
    const div = document.createElement("div");
    div.innerHTML = conv.makeHtml(md ?? "");
    for (const a of div.querySelectorAll("a[href]")) {
      const href = a.getAttribute("href");
      if (href.startsWith("#")) { a.dataset.page = href.slice(1); a.removeAttribute("href"); a.classList.add("sbe-docs-link"); }
      else { a.target = "_blank"; a.rel = "noopener"; }
    }
    for (const img of div.querySelectorAll("img[src]")) {
      const src = img.getAttribute("src");
      if (!/^(https?:|\/|systems\/)/.test(src)) img.src = `${ROOT}/${src}`;
      img.loading = "lazy";
    }
    for (const t of div.querySelectorAll("table")) {
      const wrap = document.createElement("div");
      wrap.className = "sbe-docs-table";
      t.replaceWith(wrap);
      wrap.append(t);
    }
    return div.innerHTML;
  }

  /** Ouvre la documentation (à une page précise, sinon à la dernière lue). */
  static async open(pageId = "") {
    const app = foundry.applications.instances.get("sbe-docs") ?? new SBEDocsApp();
    await app.show(pageId || game.settings.get(SYSTEM_ID, LAST) || "");
    return app;
  }

  /** Recherche dans toute la doc : [{ id, title, chapter, snippet }]. */
  static async search(query) {
    const q = String(query ?? "").trim().toLowerCase();
    if (q.length < 2) return [];
    const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const nq = norm(q);
    const out = [];
    for (const p of await this.flatPages()) {
      const text = (await this.source(p.id)).replace(/[#*`>|_\[\]()!-]/g, " ").replace(/\s+/g, " ");
      const nt = norm(text);
      const inTitle = norm(p.title).includes(nq);
      const at = nt.indexOf(nq);
      if (!inTitle && at < 0) continue;
      const from = Math.max(0, at - 60);
      const snippet = at < 0 ? text.slice(0, 120) : `${from ? "…" : ""}${text.slice(from, at + q.length + 80)}…`;
      out.push({ ...p, snippet, score: inTitle ? 0 : 1 });
    }
    return out.sort((a, b) => a.score - b.score).slice(0, 40);
  }

  /** Le petit livre dans l'en-tête d'une fenêtre SBE qui a sa page. */
  static #headerButton(app) {
    const header = app.window?.header ?? app.element?.querySelector(".window-header");
    if (!header || header.querySelector(".sbe-docs-head") || app.id === "sbe-docs") return;
    const page = docPageFor(app);
    if (!page) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "header-control icon fa-solid fa-book sbe-docs-head";
    btn.dataset.tooltip = L("SBE.Docs.HeaderButton");
    btn.setAttribute("aria-label", btn.dataset.tooltip);
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      /* Relu au clic : la fenêtre a pu changer (type d'un composant). */
      this.open(docPageFor(app) ?? page);
    });
    const before = header.querySelector(".sbe-tour-head, [data-action=\"toggleControls\"], [data-action=\"close\"]");
    header.insertBefore(btn, before ?? null);
  }

  static remember(id) {
    try { game.settings.set(SYSTEM_ID, LAST, id); } catch (_e) { /* rien */ }
  }
}

/* ============================================================ */
/*  La fenêtre                                                   */
/* ============================================================ */

export class SBEDocsApp extends ApplicationV2 {

  static DEFAULT_OPTIONS = {
    id: "sbe-docs",
    tag: "div",
    classes: ["sbe-docs"],
    window: { title: "SBE.Docs.Title", icon: "fa-solid fa-book", resizable: true },
    position: { width: 960, height: 720 }
  };

  #page = "";
  #query = "";
  #open = new Set();
  #shown = "";

  async show(pageId) {
    const pages = await DocsManager.flatPages();
    this.#page = pages.some(p => p.id === pageId) ? pageId : (pages[0]?.id ?? "");
    this.#query = "";
    await this.render({ force: true });
    this.bringToFront?.();
  }

  async _renderHTML() {
    const chapters = await DocsManager.manifest();
    const pages = chapters.flatMap(c => c.pages);
    const cur = chapters.find(c => c.pages.some(p => p.id === this.#page));
    if (cur) this.#open.add(cur.id);
    const idx = pages.findIndex(p => p.id === this.#page);
    const prev = pages[idx - 1], next = pages[idx + 1];
    const nav = chapters.map(c => `
      <details class="sbe-docs-chap" data-chap="${esc(c.id)}" ${this.#open.has(c.id) ? "open" : ""}>
        <summary>${esc(c.title)}</summary>
        <ul>${c.pages.map(p => `<li><a data-page="${esc(p.id)}" class="${p.id === this.#page ? "is-on" : ""}">${esc(p.title)}</a></li>`).join("")}</ul>
      </details>`).join("");
    let main;
    if (this.#query) {
      const hits = await DocsManager.search(this.#query);
      main = `<h1>${esc(L("SBE.Docs.Results", { q: this.#query }))}</h1>` + (hits.length
        ? `<ul class="sbe-docs-hits">${hits.map(h => `<li><a data-page="${esc(h.id)}"><b>${esc(h.title)}</b> <small>${esc(h.chapter)}</small></a><p>${esc(h.snippet)}</p></li>`).join("")}</ul>`
        : `<p class="sbe-docs-none">${esc(L("SBE.Docs.NoResult"))}</p>`);
    } else {
      const page = pages[idx];
      main = page
        ? `<p class="sbe-docs-crumb">${esc(cur?.title ?? "")}</p><h1>${esc(page.title)}</h1>${DocsManager.render(await DocsManager.source(page.id))}
          <nav class="sbe-docs-pn">
            ${prev ? `<a data-page="${esc(prev.id)}" class="is-prev"><i class="fa-solid fa-arrow-left"></i> ${esc(prev.title)}</a>` : "<span></span>"}
            ${next ? `<a data-page="${esc(next.id)}" class="is-next">${esc(next.title)} <i class="fa-solid fa-arrow-right"></i></a>` : "<span></span>"}
          </nav>`
        : `<p class="sbe-docs-none">${esc(L("SBE.Docs.Missing"))}</p>`;
    }
    const div = document.createElement("div");
    div.className = "sbe-docs-body";
    div.innerHTML = `
      <aside class="sbe-docs-side">
        <label class="sbe-docs-search"><i class="fa-solid fa-magnifying-glass"></i>
          <input type="search" value="${esc(this.#query)}" placeholder="${esc(L("SBE.Docs.Search"))}" aria-label="${esc(L("SBE.Docs.Search"))}"></label>
        <nav class="sbe-docs-nav">${nav}</nav>
      </aside>
      <article class="sbe-docs-page" data-keep-scroll="off">${main}</article>`;
    return div;
  }

  _replaceHTML(result, content) {
    const old = content.querySelector(".sbe-docs-side .sbe-docs-nav");
    const navTop = old?.scrollTop ?? 0;
    content.replaceChildren(result);
    const nav = content.querySelector(".sbe-docs-nav");
    if (nav) nav.scrollTop = navTop;
    content.querySelector(".sbe-docs-page")?.scrollTo(0, 0);
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element;
    /* Nouvelle page (ou nouvelle recherche) : on repart du haut. Fait
       après l'affichage, et encore à l'image suivante : Foundry remet
       sinon la position de défilement de la page précédente. */
    const shown = `${this.#page}|${this.#query}`;
    if (shown !== this.#shown) {
      this.#shown = shown;
      const top = () => root.querySelector(".sbe-docs-page")?.scrollTo({ top: 0, behavior: "instant" });
      top();
      requestAnimationFrame(top);
    }
    root.querySelectorAll("[data-page]").forEach(a => a.addEventListener("click", (ev) => {
      ev.preventDefault();
      this.#page = a.dataset.page;
      this.#query = "";
      DocsManager.remember(this.#page);
      this.render();
    }));
    root.querySelectorAll(".sbe-docs-chap").forEach(d => d.addEventListener("toggle", () => {
      if (d.open) this.#open.add(d.dataset.chap); else this.#open.delete(d.dataset.chap);
    }));
    const input = root.querySelector(".sbe-docs-search input");
    let t = null;
    input?.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        this.#query = input.value.trim();
        await this.render();
        const again = this.element.querySelector(".sbe-docs-search input");
        again?.focus();
        again?.setSelectionRange(again.value.length, again.value.length);
      }, 300);
    });
  }
}

/** Entrée des paramètres du système : « Documentation ». */
export class SBEDocsMenu extends ApplicationV2 {
  render() { DocsManager.open(); return this; }
}
