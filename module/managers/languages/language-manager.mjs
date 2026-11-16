/**
 * SBE — LANGUES DES PERSONNAGES : l'affichage
 *
 * À chaque rendu (fenêtres, messages du chat, info-bulles), les passages
 * marqués d'une langue sont réécrits POUR CELUI QUI REGARDE :
 *   - le MJ lit tout, la langue soulignée de sa couleur (ou « voit
 *     comme » un personnage choisi dans la fenêtre des langues) ;
 *   - un joueur lit selon la maîtrise de SON personnage : chaque mot se
 *     lit ou se brouille (toujours les mêmes mots pour ce personnage) ;
 *     un passage déchiffré se lit en entier.
 * Le texte d'origine ne reste pas dans la page d'un joueur. Les éditeurs
 * (texte en cours d'écriture) ne sont jamais touchés.
 *
 * Le chat : chacun choisit la langue qu'il parle (bouton près de la
 * saisie, langues « parlées » que son personnage connaît) ; le message
 * se lit ensuite comme un passage.
 *
 * Marquer : bouton « Langue » dans la barre des éditeurs de texte.
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { evalExpression } from "../../builder/formula-engine.mjs";
import { docScope } from "../../builder/doc-context.mjs";
import { rollField } from "../../builder/field-roll.mjs";
import {
  LANG_SETTING, READ_FLAG, TRIED_FLAG, WORD_RE, languages, cleanLanguage, masteryOf, passagesOf,
  hash32, scrambleWord
} from "./language-model.mjs";

const { DialogV2 } = foundry.applications.api;
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const PASSAGE = "span.sbe-lang[data-sbe-lang]:not([data-sbe-done])";
const WON = ["success", "critSuccess", "done"];

export class LanguageManager {

  static #observer = null;

  static init() {
    game.settings.register(SYSTEM_ID, LANG_SETTING, {
      scope: "world", config: false, type: Object, default: { list: [] },
      onChange: () => { this.#refreshStyle(); this.#injectChat(); this.refreshAll(); }
    });
    /* « Voir comme » du MJ et langue parlée dans le chat : à chacun. */
    game.settings.register(SYSTEM_ID, "langViewAs", {
      scope: "client", config: false, type: String, default: "",
      onChange: () => this.refreshAll()
    });
    game.settings.register(SYSTEM_ID, "langChat", {
      scope: "client", config: false, type: String, default: "",
      onChange: () => this.#injectChat()
    });

    /* Rendus : fenêtres (v2 et anciennes) et messages. */
    Hooks.on("renderApplicationV2", (_app, el) => this.apply(el));
    Hooks.on("renderApplication", (_app, html) => this.apply(html?.[0] ?? html));
    Hooks.on("renderChatMessageHTML", (msg, html) => this.#renderMessage(msg, html));

    /* Bouton « Langue » des éditeurs. */
    Hooks.on("getProseMirrorMenuItems", (menu, items) => this.#menuItem(menu, items));

    /* Chat : langue parlée. */
    for (const h of ["renderChatLog", "renderChatInput", "renderSidebar", "changeSidebarTab", "collapseSidebar"]) {
      Hooks.on(h, () => this.#injectChat());
    }
    Hooks.on("preCreateChatMessage", (doc, data, _o, userId) => this.#tagMessage(doc, data, userId));

    /* Un personnage déchiffre, apprend ou progresse : ce qu'il lit change. */
    Hooks.on("updateActor", (actor, changes) => {
      if (actor !== this.viewer()) return;
      const flags = foundry.utils.getProperty(changes, `flags.${SYSTEM_ID}`) ?? {};
      if (READ_FLAG in flags || TRIED_FLAG in flags || "system" in changes) this.refreshAll();
    });
    Hooks.on("updateUser", (user, changes) => { if (user === game.user && "character" in changes) this.refreshAll(); });

    Hooks.once("ready", () => {
      this.#refreshStyle();
      this.#injectChat();
      this.#watchTooltips();
    });
  }

  /* ============================================================ */
  /*  Qui lit                                                      */
  /* ============================================================ */

  /** Le personnage dont on lit les langues (null = le MJ voit tout). */
  static viewer() {
    if (game.user.isGM) {
      const id = game.settings.get(SYSTEM_ID, "langViewAs");
      return id ? game.actors?.get(id) ?? null : null;
    }
    return game.user.character ?? null;
  }

  static #context() {
    const actor = this.viewer();
    const cache = new Map();
    return {
      gm: game.user.isGM && !actor,
      actor,
      langs: new Map(languages().map(l => [l.id, l])),
      read: passagesOf(actor, READ_FLAG),
      tried: passagesOf(actor, TRIED_FLAG),
      who: actor?.id ?? game.user.id,
      mastery: (lang) => {
        if (!cache.has(lang.id)) cache.set(lang.id, masteryOf(actor, lang));
        return cache.get(lang.id);
      }
    };
  }

  /* ============================================================ */
  /*  Réécriture des passages                                      */
  /* ============================================================ */

  /** Les passages d'un bout de page, pour celui qui regarde. */
  static apply(root) {
    if (!root?.querySelectorAll) return;
    const spans = [...root.querySelectorAll(PASSAGE)].filter(s => !s.closest(".ProseMirror, [contenteditable='true']"));
    if (!spans.length) return;
    const ctx = this.#context();
    for (const sp of spans) this.#passage(sp, ctx);
  }

  /**
   * Un passage. `author` : le message est de celui qui regarde (il sait
   * ce qu'il a dit).
   */
  static #passage(el, ctx, { author = false } = {}) {
    el.dataset.sbeDone = "1";
    const lang = ctx.langs.get(el.dataset.sbeLang);
    if (!lang) return;
    const pid = el.dataset.sbeLangId || "";
    el.classList.add("sbe-lang-on");
    if (ctx.gm || author) {
      el.classList.add("is-gm");
      el.dataset.tooltipText = L("SBE.Languages.WrittenIn", { name: lang.name });
      return;
    }
    const pct = ctx.mastery(lang);
    const named = lang.showName || pct > 0;
    const label = named ? L("SBE.Languages.WrittenIn", { name: lang.name }) : L("SBE.Languages.Unknown");
    if (pct >= 100 || (pid && ctx.read.has(pid))) {
      el.classList.add("is-known");
      el.dataset.tooltipText = label;
      return;
    }
    this.#scramble(el, lang, pct, `${pid}|${ctx.who}`);
    el.classList.add("is-foreign");
    /* Déchiffrage (si le MJ le permet, et pas déjà raté « une seule fois »). */
    const dc = lang.decipher;
    const canTry = dc.on && dc.key && ctx.actor && pid && !(dc.once && ctx.tried.has(pid));
    el.dataset.tooltipText = canTry ? `${label} — ${L("SBE.Languages.ClickDecipher")}` : label;
    if (!canTry) return;
    el.classList.add("is-cipher");
    el.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this.#decipher(ctx.actor, lang, pid);
    });
  }

  /** Brouille les mots non compris (mot par mot, toujours les mêmes). */
  static #scramble(el, lang, pct, seed) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    let idx = 0;
    for (const node of nodes) {
      const text = node.nodeValue ?? "";
      const frag = document.createDocumentFragment();
      let last = 0;
      for (const m of text.matchAll(WORD_RE)) {
        if (m.index > last) frag.append(text.slice(last, m.index));
        const s = `${seed}|${idx++}`;
        if (hash32(s) % 100 < pct) frag.append(m[0]);
        else {
          const x = document.createElement("span");
          x.className = "sbe-lang-x";
          x.textContent = scrambleWord(m[0], lang, s);
          frag.append(x);
        }
        last = m.index + m[0].length;
      }
      if (last < text.length) frag.append(text.slice(last));
      node.replaceWith(frag);
    }
  }

  /** Jet de déchiffrage : réussi, le passage se lit pour de bon. */
  static async #decipher(actor, lang, pid) {
    const dc = lang.decipher;
    let difficulty = 0;
    if (dc.difficulty) difficulty = Number(evalExpression(dc.difficulty, docScope(actor))) || 0;
    const res = await rollField(actor, dc.key, { difficulty, title: L("SBE.Languages.DecipherTitle", { name: lang.name }), after: "now" });
    if (!res) { ui.notifications.warn(L("SBE.Languages.NoRoll", { key: dc.key })); return; }
    const ok = WON.includes(res.outcome);
    if (!ok) {
      ui.notifications.info(L("SBE.Languages.DecipherFail"));
      if (!dc.once) return;
    }
    const flag = ok ? READ_FLAG : TRIED_FLAG;
    const set = passagesOf(actor, flag);
    set.add(pid);
    await actor.setFlag(SYSTEM_ID, flag, [...set]);
  }

  /** Redessine ce qui montre des passages (langues, lecteur, maîtrise changés). */
  static refreshAll() {
    for (const app of foundry.applications.instances.values()) {
      if (app.rendered && app.element?.querySelector?.("[data-sbe-lang]")) app.render();
    }
    for (const app of Object.values(ui.windows ?? {})) {
      if (app.rendered && app.element?.[0]?.querySelector?.("[data-sbe-lang]")) app.render();
    }
    for (const msg of game.messages ?? []) {
      if (msg.getFlag(SYSTEM_ID, "lang") || String(msg.content ?? "").includes("data-sbe-lang")) ui.chat?.updateMessage?.(msg);
    }
  }

  /* ============================================================ */
  /*  Chat                                                         */
  /* ============================================================ */

  static #renderMessage(msg, html) {
    const id = msg.getFlag(SYSTEM_ID, "lang");
    const content = html?.querySelector?.(".message-content");
    if (id && content && !content.dataset.sbeDone) {
      const ctx = this.#context();
      const lang = ctx.langs.get(id);
      if (lang) {
        content.classList.add("sbe-lang");
        content.dataset.sbeLang = id;
        content.dataset.sbeLangId = msg.id;
        this.#passage(content, ctx, { author: msg.isAuthor });
        /* Étiquette sous le nom de l'orateur (langue commune : aucune). */
        const named = ctx.gm || msg.isAuthor || lang.showName || ctx.mastery(lang) > 0;
        const head = html.querySelector(".message-header");
        if (head && !head.querySelector(".sbe-lang-badge")) {
          const b = document.createElement("span");
          b.className = "sbe-lang-badge";
          b.dataset.sbeLang = id;
          b.innerHTML = `<i class="fa-solid fa-language"></i> ${esc(named ? lang.name : L("SBE.Languages.Unknown"))}`;
          const sender = head.querySelector(".message-sender");
          if (sender) sender.after(b); else head.append(b);
        }
      }
    }
    this.apply(html);
  }

  /** Langues que l'utilisateur peut parler dans le chat. */
  static speakable() {
    const list = languages().filter(l => l.chat && l.name);
    if (game.user.isGM) return list;
    const actor = game.user.character;
    return actor ? list.filter(l => masteryOf(actor, l) > 0) : [];
  }

  static #current() {
    const id = game.settings.get(SYSTEM_ID, "langChat");
    return this.speakable().find(l => l.id === id) ?? null;
  }

  /** Un message tapé part dans la langue choisie (pas les cartes ni les jets). */
  static #tagMessage(doc, data, userId) {
    if (userId !== game.user.id) return;
    const lang = this.#current();
    if (!lang || doc.rolls?.length || data?.flags?.[SYSTEM_ID]) return;
    doc.updateSource({ [`flags.${SYSTEM_ID}.lang`]: lang.id });
  }

  static #injectChat() {
    const controls = document.querySelector("#chat-controls");
    if (!controls) return;
    controls.querySelector('[data-action="sbe-language"]')?.remove();
    const list = this.speakable();
    if (!list.length) return;
    const cur = this.#current();
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `ui-control icon fa-solid fa-language${cur ? " sbe-lang-active" : ""}`;
    btn.dataset.action = "sbe-language";
    const tip = cur ? L("SBE.Languages.Speaking", { name: cur.name }) : L("SBE.Languages.SpeakCommon");
    btn.dataset.tooltipText = tip;
    btn.setAttribute("aria-label", tip);
    if (cur) btn.style.setProperty("--sbe-lang-color", cur.color);
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this.#pickChat();
    });
    const modes = controls.querySelector("#message-modes");
    if (modes?.nextSibling) controls.insertBefore(btn, modes.nextSibling);
    else controls.appendChild(btn);
  }

  static async #pickChat() {
    const list = this.speakable();
    const cur = game.settings.get(SYSTEM_ID, "langChat");
    const opts = [`<option value="">${esc(L("SBE.Languages.Common"))}</option>`]
      .concat(list.map(l => `<option value="${esc(l.id)}" ${l.id === cur ? "selected" : ""}>${esc(l.name)}</option>`)).join("");
    const id = await DialogV2.prompt({
      window: { title: L("SBE.Languages.SpeakTitle"), icon: "fa-solid fa-language" },
      content: `<div class="form-group"><label>${esc(L("SBE.Languages.SpeakLabel"))}</label><select name="lang">${opts}</select></div>`,
      ok: { label: L("SBE.Languages.SpeakOk"), callback: (_e, b) => b.form.elements.lang.value },
      rejectClose: false
    }).catch(() => null);
    if (id === null || id === undefined) return;
    await game.settings.set(SYSTEM_ID, "langChat", id);
  }

  /* ============================================================ */
  /*  Éditeur : marquer un passage                                 */
  /* ============================================================ */

  static #menuItem(menu, items) {
    const list = languages().filter(l => l.name);
    if (!list.length || !menu?.view || !menu.schema?.marks?.span) return;
    items.push({
      action: "sbe-language",
      title: "SBE.Languages.MarkTitle",
      icon: '<i class="fa-solid fa-language fa-fw"></i>',
      scope: menu.constructor._MENU_ITEM_SCOPES?.TEXT ?? "text",
      cmd: () => this.#markPrompt(menu)
    });
  }

  static async #markPrompt(menu) {
    const { empty } = menu.view.state.selection;
    if (empty) { ui.notifications.warn(L("SBE.Languages.SelectFirst")); return; }
    const list = languages().filter(l => l.name);
    const opts = list.map(l => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join("");
    const id = await DialogV2.prompt({
      window: { title: L("SBE.Languages.MarkTitle"), icon: "fa-solid fa-language" },
      content: `<div class="form-group"><label>${esc(L("SBE.Languages.MarkLabel"))}</label>
        <select name="lang"><option value="">${esc(L("SBE.Languages.MarkNone"))}</option>${opts}</select></div>`,
      ok: { label: L("SBE.Languages.MarkOk"), callback: (_e, b) => b.form.elements.lang.value },
      rejectClose: false
    }).catch(() => null);
    if (id === null || id === undefined) return;
    /* L'état relu APRÈS la fenêtre (la sélection n'a pas bougé). */
    const { state } = menu.view;
    const { from, to } = state.selection;
    const type = menu.schema.marks.span;
    let tr = state.tr.removeMark(from, to, type);
    if (id) {
      tr = tr.addMark(from, to, type.create({
        classes: "sbe-lang",
        _preserve: { "data-sbe-lang": id, "data-sbe-lang-id": foundry.utils.randomID(10) }
      }));
    }
    menu.view.dispatch(tr);
    menu.view.focus();
  }

  /* ============================================================ */
  /*  Couleurs, polices, info-bulles                               */
  /* ============================================================ */

  /** Une règle par langue : sa couleur, la police des mots brouillés. */
  static #refreshStyle() {
    let tag = document.getElementById("sbe-lang-style");
    if (!tag) {
      tag = document.createElement("style");
      tag.id = "sbe-lang-style";
      document.head.appendChild(tag);
    }
    const css = (s) => String(s).replace(/["\\<>]/g, "");
    tag.textContent = languages().map(l => {
      const sel = `[data-sbe-lang="${css(l.id)}"]`;
      return `${sel}{--sbe-lang-color:${css(l.color)};}`
        + (l.font ? `${sel} .sbe-lang-x{font-family:"${css(l.font)}";}` : "");
    }).join("\n");
  }

  /** Les info-bulles (descriptions au survol) passent aussi par ici. */
  static #watchTooltips() {
    if (this.#observer) return;
    this.#observer = new MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.addedNodes) if (n.nodeType === 1) this.apply(n.parentElement ?? n);
      }
    });
    const tip = document.getElementById("tooltip");
    if (tip) this.#observer.observe(tip, { childList: true, subtree: true });
    /* Info-bulles verrouillées : ajoutées au corps de la page. */
    this.#observer.observe(document.body, { childList: true });
  }

  /** Pour l'import : une langue propre. */
  static clean(l) { return cleanLanguage(l); }
}
