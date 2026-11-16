/**
 * SBE — Réglages des MESSAGES DE CHAT (onglet de la fenêtre du thème)
 *
 * Ce n'est plus une fenêtre à part : un PANNEAU que la fenêtre du thème
 * général affiche dans son onglet « Messages du chat ». L'aperçu (une
 * carte de jet réussi, un échec critique, une carte d'effet, un message
 * libre…) prend la place de celui du thème en haut de la fenêtre ; les
 * réglages, en volets, vivent dans l'onglet : cadre des messages,
 * cartes, résultats, jets, types de carte, couleurs libres, CSS avancé.
 *
 * Tout s'applique EN DIRECT (aperçu + chat ouvert) ; c'est la fenêtre du
 * thème qui enregistre, exporte, importe et annule.
 */

import { getFontFamilies } from "../../helpers/constants.mjs";
import { UiSound } from "../media/ui-sound.mjs";
import { ChatCards, OUTCOMES, CARD_TYPES, colorPair } from "./chat-cards.mjs";
import { ThemeLibrary } from "../theme/theme-library.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const L = (k) => game.i18n.localize(k);

export class ChatPanel {

  /** Réglages en cours d'édition (null = ceux enregistrés). */
  working = null;
  /** Thème en cours d'édition (bibliothèque de thèmes). */
  themeId = null;
  pTheme = "dark";
  form = null;
  top = null;
  #timer = null;

  current() {
    return foundry.utils.deepClone(this.working ?? ChatCards.getConfig(this.themeId));
  }

  /** Complète un objet brut avec les défauts. */
  static normalize(raw) {
    const cfg = foundry.utils.mergeObject(ChatCards.DEFAULTS, raw ?? {}, { inplace: false, insertKeys: true });
    cfg.schemaVersion = ChatCards.DEFAULTS.schemaVersion;
    return cfg;
  }

  /** Les volets de réglages (HTML). */
  #body(cfg) {
    const c = cfg;
    const f = c.frame, k = c.card;
    const fonts = getFontFamilies();

    const field = (label, input, hint = "") => `
      <div class="sbe-chatc-field">
        <label>${L(label)}</label>
        ${input}
        ${hint ? `<p class="notes">${L(hint)}</p>` : ""}
      </div>`;
    /* Une couleur = DEUX valeurs : thème sombre et thème clair de Foundry. */
    const color = (name, v) => {
      const p = colorPair(v);
      return `<div class="sbe-chatc-pair">
        <label><span><i class="fa-solid fa-moon"></i> ${L("SBE.Theme.ColumnDark")}</span><color-picker name="${name}.dark" value="${esc(p.dark)}"></color-picker></label>
        <label><span><i class="fa-solid fa-sun"></i> ${L("SBE.Theme.ColumnLight")}</span><color-picker name="${name}.light" value="${esc(p.light)}"></color-picker></label>
      </div>`;
    };
    const num = (name, v, min = 0, max = 200, step = 1) =>
      `<input type="number" name="${name}" value="${esc(v)}" min="${min}" max="${max}" step="${step}">`;
    const text = (name, v, ph = "") => `<input type="text" name="${name}" value="${esc(v)}" placeholder="${esc(ph)}">`;
    const check = (name, v, label) =>
      `<label class="sbe-chatc-row"><input type="checkbox" name="${name}" ${v ? "checked" : ""}> ${L(label)}</label>`;
    const fontSel = (name, v) => `<select name="${name}"><option value="">${L("SBE.Chat.FontDefault")}</option>${
      fonts.map(ff => `<option value="${esc(ff)}" ${ff === v ? "selected" : ""}>${esc(ff)}</option>`).join("")}</select>`;
    const shadowSel = (name, v) => `<select name="${name}">${[["", "SBE.Tooltip.ShadowDefault"], ["none", "SBE.Tooltip.ShadowNone"],
      ["soft", "SBE.Tooltip.ShadowSoft"], ["strong", "SBE.Tooltip.ShadowStrong"]]
      .map(([val, lab]) => `<option value="${val}" ${val === (v ?? "") ? "selected" : ""}>${L(lab)}</option>`).join("")}</select>`;
    const icon = (name, v) => `<div class="sbe-chatc-row">${text(name, v, "fa-solid fa-star")}
      <button type="button" class="sbe-chatc-iconpick" data-for="${name}" title="${L("SBE.Template.PickIcon")}"><i class="fa-solid fa-icons"></i></button></div>`;
    const grid = (...cells) => `<div class="sbe-chatc-grid">${cells.join("")}</div>`;
    const sec = (title, body, open = false) =>
      `<details class="sbe-chatc-sec" ${open ? "open" : ""}><summary>${L(title)}</summary>${body}</details>`;

    /* --- Cadre --- */
    const frame = sec("SBE.Chat.FrameTitle", `
      <p class="notes">${L("SBE.Chat.FrameHint")}</p>
      ${check("frame.free", f.free !== false, "SBE.Chat.FrameFree")}
      ${field("SBE.Chat.Bg", color("frame.bg", f.bg))}
      ${field("SBE.Chat.Text", color("frame.text", f.text))}
      ${field("SBE.Chat.Border", color("frame.borderColor", f.borderColor))}
      ${grid(field("SBE.Chat.BorderWidth", num("frame.borderWidth", f.borderWidth, 0, 12)), field("SBE.Chat.Shadow", shadowSel("frame.shadow", f.shadow)))}
      ${grid(field("SBE.Chat.Radius", num("frame.radius", f.radius, 0, 40)), field("SBE.Chat.Padding", num("frame.padding", f.padding, 0, 40), "SBE.Chat.ZeroDefault"))}
      ${grid(field("SBE.Chat.Font", fontSel("frame.font", f.font)), field("SBE.Chat.Size", num("frame.size", f.size, 0, 40), "SBE.Chat.ZeroDefault"))}
      ${field("SBE.Chat.BgImage", `<file-picker name="frame.bgPath" type="image" value="${esc(f.bgPath)}"></file-picker>`)}
      ${field("SBE.Chat.BgSvg", `<textarea name="frame.bgCode" placeholder="<svg …>…</svg>">${esc(f.bgCode)}</textarea>`, "SBE.Chat.BgSvgHint")}
      ${field("SBE.Chat.NameColor", color("frame.nameColor", f.nameColor))}
      ${field("SBE.Chat.NameFont", fontSel("frame.nameFont", f.nameFont))}
      ${check("frame.portrait", f.portrait, "SBE.Chat.Portrait")}
      ${field("SBE.Chat.PortraitSize", num("frame.portraitSize", f.portraitSize, 16, 96))}`);

    /* --- Cartes --- */
    const card = sec("SBE.Chat.CardTitle", `
      <p class="notes">${L("SBE.Chat.CardHint")}</p>
      ${field("SBE.Chat.Bg", color("card.bg", k.bg))}
      ${field("SBE.Chat.Text", color("card.text", k.text))}
      ${field("SBE.Chat.Border", color("card.borderColor", k.borderColor))}
      ${grid(field("SBE.Chat.BorderWidth", num("card.borderWidth", k.borderWidth, 0, 12)), field("SBE.Chat.Radius", num("card.radius", k.radius, 0, 40)))}
      ${field("SBE.Chat.Accent", color("card.accent", k.accent), "SBE.Chat.AccentHint")}
      ${field("SBE.Chat.TitleColor", color("card.titleColor", k.titleColor))}
      ${field("SBE.Chat.TitleFont", fontSel("card.titleFont", k.titleFont))}
      ${grid(field("SBE.Chat.TitleSize", num("card.titleSize", k.titleSize, 0, 48), "SBE.Chat.ZeroDefault"), field("SBE.Chat.IconSize", num("card.iconSize", k.iconSize, 12, 96)))}`);

    /* --- Résultats --- */
    const outcomes = sec("SBE.Chat.OutcomesTitle", `
      <p class="notes">${L("SBE.Chat.OutcomesHint")}</p>
      ${OUTCOMES.map(o => {
        const r = c.outcomes[o];
        const p = `outcomes.${o}`;
        return `<div class="sbe-chatc-sub"><h4>${L(`SBE.Chat.Outcome.${o}`)}</h4>
          ${field("SBE.Chat.OutcomeLabel", text(`${p}.label`, r.label, L(`SBE.Chat.Outcome.${o}`)), "SBE.Chat.OutcomeLabelHint")}
          ${field("SBE.Chat.OutcomeColor", color(`${p}.color`, r.color))}
          ${field("SBE.Chat.OutcomeText", color(`${p}.text`, r.text))}
          ${field("SBE.Chat.OutcomeIcon", icon(`${p}.icon`, r.icon))}
          ${UiSound.fieldsHtml(`${p}.sound`, r.sound, "SBE.Chat.OutcomeSound", "SBE.Chat.OutcomeSoundHint")}
        </div>`;
      }).join("")}`);

    /* --- Jets : apports et avantage --- */
    const rm = c.rolls?.mods ?? {}, ra = c.rolls?.adv ?? {}, rb = c.rolls?.button ?? {};
    const rolls = sec("SBE.Chat.RollsTitle", `
      <p class="notes">${L("SBE.Chat.RollsHint")}</p>
      <div class="sbe-chatc-sub"><h4>${L("SBE.Chat.ModsTitle")}</h4>
        <p class="notes">${L("SBE.Chat.ModsHint")}</p>
        ${field("SBE.Chat.ModsLabel", text("rolls.mods.label", rm.label, L("SBE.Roll.DlgMod")), "SBE.Chat.ModsLabelHint")}
        ${field("SBE.Chat.ModsStyle", `<select name="rolls.mods.style">
          <option value="pill" ${rm.style !== "text" ? "selected" : ""}>${L("SBE.Chat.ModsStylePill")}</option>
          <option value="text" ${rm.style === "text" ? "selected" : ""}>${L("SBE.Chat.ModsStyleText")}</option></select>`)}
        ${field("SBE.Chat.ModsUp", color("rolls.mods.up", rm.up))}
        ${field("SBE.Chat.ModsDown", color("rolls.mods.down", rm.down))}
        ${field("SBE.Chat.Bg", color("rolls.mods.bg", rm.bg))}
        ${check("rolls.mods.icons", rm.icons !== false, "SBE.Chat.ModsIcons")}
        ${check("rolls.mods.summary", rm.summary !== false, "SBE.Chat.ModsSummary")}
        <p class="notes">${L("SBE.Chat.ModsSummaryHint")}</p>
      </div>
      <div class="sbe-chatc-sub"><h4>${L("SBE.Chat.AdvTitle")}</h4>
        <p class="notes">${L("SBE.Chat.AdvHint")}</p>
        ${grid(field("SBE.Chat.AdvLabel", text("rolls.adv.advLabel", ra.advLabel, L("SBE.Roll.DlgAdv"))),
          field("SBE.Chat.DisLabel", text("rolls.adv.disLabel", ra.disLabel, L("SBE.Roll.DlgDis"))))}
        ${field("SBE.Chat.AdvIcon", icon("rolls.adv.advIcon", ra.advIcon))}
        ${field("SBE.Chat.DisIcon", icon("rolls.adv.disIcon", ra.disIcon))}
        ${field("SBE.Chat.AdvColor", color("rolls.adv.advColor", ra.advColor))}
        ${field("SBE.Chat.DisColor", color("rolls.adv.disColor", ra.disColor))}
        ${field("SBE.Chat.AdvText", color("rolls.adv.text", ra.text))}
        ${check("rolls.adv.dropped", ra.dropped !== false, "SBE.Chat.AdvDropped")}
        ${field("SBE.Chat.AdvDroppedLabel", text("rolls.adv.droppedLabel", ra.droppedLabel, L("SBE.Chat.Dropped")))}
      </div>
      <div class="sbe-chatc-sub"><h4>${L("SBE.Chat.BtnTitle")}</h4>
        <p class="notes">${L("SBE.Chat.BtnHint")}</p>
        ${field("SBE.Chat.BtnLabel", text("rolls.button.label", rb.label, L("SBE.RollReq.RollMine")))}
        ${field("SBE.Chat.BtnIcon", icon("rolls.button.icon", rb.icon), "SBE.Chat.BtnIconHint")}
        ${field("SBE.Chat.Bg", color("rolls.button.bg", rb.bg))}
        ${field("SBE.Chat.Text", color("rolls.button.text", rb.text))}
        ${field("SBE.Chat.Border", color("rolls.button.border", rb.border))}
        ${field("SBE.Chat.BtnHoverBg", color("rolls.button.hoverBg", rb.hoverBg))}
        ${field("SBE.Chat.BtnHoverText", color("rolls.button.hoverText", rb.hoverText))}
        ${grid(field("SBE.Chat.Radius", num("rolls.button.radius", rb.radius ?? 4, 0, 40)), field("SBE.Chat.Size", num("rolls.button.size", rb.size, 0, 40), "SBE.Chat.ZeroDefault"))}
        ${check("rolls.button.full", rb.full, "SBE.Chat.BtnFull")}
      </div>`);

    /* --- Types de carte --- */
    const types = sec("SBE.Chat.TypesTitle", `
      <p class="notes">${L("SBE.Chat.TypesHint")}</p>
      ${CARD_TYPES.map(t => {
        const tc = c.types[t] ?? {};
        const p = `types.${t}`;
        return `<div class="sbe-chatc-sub"><h4>${L(`SBE.Chat.Type.${t}`)}</h4>
          ${field("SBE.Chat.Accent", color(`${p}.accent`, tc.accent))}
          ${field("SBE.Chat.TypeIcon", icon(`${p}.icon`, tc.icon), "SBE.Chat.TypeIconHint")}
          ${grid(
            field("SBE.Chat.Layout", `<select name="${p}.layout">
              <option value="stack" ${tc.layout !== "columns" ? "selected" : ""}>${L("SBE.Chat.LayoutStack")}</option>
              <option value="columns" ${tc.layout === "columns" ? "selected" : ""}>${L("SBE.Chat.LayoutColumns")}</option></select>`, "SBE.Chat.LayoutHint"),
            field("SBE.Chat.AttackerSide", `<select name="${p}.attacker">
              <option value="left" ${tc.attacker !== "right" ? "selected" : ""}>${L("SBE.Chat.SideLeft")}</option>
              <option value="right" ${tc.attacker === "right" ? "selected" : ""}>${L("SBE.Chat.SideRight")}</option></select>`, "SBE.Chat.AttackerSideHint"))}
          ${check(`${p}.portrait`, tc.portrait !== false, "SBE.Chat.ShowPortrait")}
          ${field("SBE.Chat.PortraitSize", num(`${p}.portraitSize`, tc.portraitSize ?? 36, 16, 96))}
          ${field("SBE.Chat.TypeCss", `<textarea name="${p}.css" placeholder="& .sbe-card-title { text-transform: uppercase; }">${esc(tc.css)}</textarea>`, "SBE.Chat.TypeCssHint")}
        </div>`;
      }).join("")}`);

    /* --- Couleurs libres (paires sombre / clair → var(--nom)) --- */
    const vars = sec("SBE.Chat.VarsTitle", `
      <p class="notes">${L("SBE.Chat.VarsHint")}</p>
      ${(c.vars ?? []).map((v, i) => `<div class="sbe-chatc-sub sbe-chatc-var" data-var="${i}">
        <div class="sbe-chatc-field"><label>${L("SBE.Chat.VarName")}</label>
          <div class="sbe-chatc-row">${text(`vars.${i}.name`, v.name, L("SBE.Ph.ChatVar"))}
            <button type="button" class="sbe-chatc-iconpick" data-chat-act="delVar" data-index="${i}" title="${L("SBE.Common.Delete")}"><i class="fa-solid fa-trash"></i></button></div></div>
        ${color(`vars.${i}`, v)}
      </div>`).join("")}
      <button type="button" data-chat-act="addVar"><i class="fa-solid fa-plus"></i> ${L("SBE.Chat.VarAdd")}</button>`);

    /* --- CSS avancé --- */
    const css = sec("SBE.Chat.CssTitle", field("SBE.Chat.Css",
      `<textarea name="customCss" placeholder="@message { … }&#10;@carte .sbe-card-title { … }">${esc(c.customCss)}</textarea>`,
      "SBE.Chat.CssHint"));

    return `<p class="notes sbe-chatc-pairhint"><i class="fa-solid fa-circle-half-stroke"></i> ${L("SBE.Chat.PairHint")}</p>${frame}${card}${outcomes}${rolls}${types}${vars}${css}`;
  }

  /** Messages d'exemple, construits avec la vraie carte. */
  #previewHtml(c) {
    const user = game.user;
    const avatar = user?.avatar || "icons/svg/mystery-man.svg";
    const msg = (sender, inner, card = true) => `
      <li class="chat-message message flexcol sbe-msg ${card ? "sbe-msg--card" : ""}">
        <header class="message-header flexrow">
          ${c.frame.portrait ? `<img class="sbe-msg-portrait" src="${esc(avatar)}" alt="">` : ""}
          <h4 class="message-sender">${esc(sender)}</h4>
          <span class="message-metadata"><time class="message-timestamp">${L("SBE.Chat.PreviewNow")}</time></span>
        </header>
        <div class="message-content">${inner}</div>
      </li>`;
    const dice = (total) => `<div class="sbe-card-roll">${ChatCards.diceMarkup("1d100", total,
      ChatCards.diceDetail({ dice: [{ faces: 100, expression: "1d100", results: [{ result: total, active: true }] }], result: String(total), total }))}</div>`;
    const name = L("SBE.Chat.PreviewHero");
    const img = "icons/svg/mystery-man.svg";
    const side = (n, total) => ({ img, name: n, rollsHtml: dice(total).replace(/^<div class="sbe-card-roll">|<\/div>$/g, "") });
    /* Jet avec avantage, modificateur et effet visible : le vrai
       balisage des jets (dés, étiquette, apports, récap). */
    const advDice = `<div class="sbe-card-roll">${ChatCards.diceMarkup("1d100", 37,
      `<div class="sbe-dd"><div class="sbe-dd-term sbe-dd-dropped"><span class="sbe-dd-f">${esc(String(c.rolls?.adv?.droppedLabel ?? "").trim() || L("SBE.Chat.Dropped"))}</span><span class="sbe-dd-chips"><span class="sbe-dd-chip is-off">81</span></span></div></div>`,
      { adv: "adv", cfg: c })}</div>`;
    const mods = ChatCards.modsHtml([
      { kind: "free", val: 10 },
      { kind: "effect", label: L("SBE.Chat.PreviewEffect"), img: "fa-solid fa-droplet", val: -5 }
    ], { on: "goal", from: 50, to: 55, cfg: c });
    const ok = ChatCards.html({ type: "roll", title: L("SBE.Chat.PreviewRoll"), outcome: "success", detail: "(37 ≤ 55)",
      sides: ChatCards.sidesHtml([{ img, name, rollsHtml: advDice.replace(/^<div class="sbe-card-roll">|<\/div>$/g, ""), after: mods }]) }, c);
    const vs = ChatCards.html({ type: "roll", title: L("SBE.Chat.PreviewOpposed"), outcome: "success", detail: "(62 > 41)",
      sides: ChatCards.sidesHtml([side(name, 62), side(L("SBE.Chat.PreviewFoe"), 41)]) }, c);
    const ko = ChatCards.html({ type: "roll", title: L("SBE.Chat.PreviewRoll"), outcome: "critFailure", detail: "(99 ≥ 96)",
      sides: ChatCards.sidesHtml([side(name, 99)]) }, c);
    const fx = ChatCards.html({ type: "effect", title: L("SBE.Chat.PreviewEffect"),
      body: `<div class="sbe-card-line is-down"><span class="sbe-card-l">pv</span><span class="sbe-card-delta">−2</span><span class="sbe-card-val">(20 → 18)</span></div>` }, c);
    /* Demande de jet : le bouton « Lancer mon jet » tel que réglé. */
    const req = ChatCards.html({ type: "request", title: L("SBE.Chat.PreviewRoll"), subtitle: L("SBE.Chat.PreviewRequestSub"),
      body: `<div class="sbe-rr-actions"><button type="button" class="sbe-rr-btn">${ChatCards.rollButtonInner(c)}</button></div>` }, c);
    return msg(name, req) + msg(name, ok) + msg(name, vs) + msg(name, ko) + msg(name, fx)
      + msg(user?.name ?? "MJ", `<p>${L("SBE.Chat.PreviewFree")}</p>`, false);
  }

  /**
   * Dessine le panneau : l'aperçu dans `topEl`, les réglages dans
   * `paneEl` (dans leur propre formulaire). Les volets ouverts et le
   * défilement sont gardés d'un rendu à l'autre.
   */
  render(topEl, paneEl) {
    const c = this.current();
    const open = [...(paneEl.querySelectorAll("details.sbe-chatc-sec") ?? [])].map(d => d.open);
    topEl.innerHTML = `
      <div class="sbe-chatc-ptheme">
        <span>${L("SBE.Chat.PreviewTheme")}</span>
        <button type="button" data-ptheme="dark" class="${this.pTheme === "light" ? "" : "active"}"><i class="fa-solid fa-moon"></i> ${L("SBE.Theme.ColumnDark")}</button>
        <button type="button" data-ptheme="light" class="${this.pTheme === "light" ? "active" : ""}"><i class="fa-solid fa-sun"></i> ${L("SBE.Theme.ColumnLight")}</button>
      </div>
      <div class="sbe-chatc-preview theme-${this.pTheme === "light" ? "light" : "dark"}"><ol>${this.#previewHtml(c)}</ol></div>`;
    const form = document.createElement("form");
    form.className = "sbe-thpanel-form sbe-chatc-body";
    form.addEventListener("submit", (ev) => ev.preventDefault());
    form.innerHTML = this.#body(c);
    paneEl.replaceChildren(form);
    form.querySelectorAll("details.sbe-chatc-sec").forEach((d, i) => { if (open[i]) d.open = true; });
    this.form = form;
    this.top = topEl;
    this.#wire(topEl, paneEl);
  }

  #wire(topEl, paneEl) {
    const form = this.form;
    UiSound.wire(form);
    for (const b of form.querySelectorAll(".sbe-chatc-iconpick[data-for]")) {
      b.addEventListener("click", async () => {
        const { pickIcon } = await import("../../helpers/icon-picker.mjs");
        const val = await pickIcon();
        if (val == null) return;
        const inp = form.querySelector(`[name="${b.dataset.for}"]`);
        if (inp) { inp.value = val; inp.dispatchEvent(new Event("change", { bubbles: true })); }
      });
    }
    /* Couleurs libres : ajouter / retirer une ligne. */
    form.querySelector('[data-chat-act="addVar"]')?.addEventListener("click", () => {
      const cfg = this.sync();
      cfg.vars.push({ name: "", dark: "", light: "" });
      this.working = cfg;
      this.render(topEl, paneEl);
    });
    for (const b of form.querySelectorAll('[data-chat-act="delVar"]')) {
      b.addEventListener("click", () => {
        const cfg = this.sync();
        cfg.vars.splice(Number(b.dataset.index), 1);
        this.working = cfg;
        ChatCards.apply(cfg);
        this.render(topEl, paneEl);
      });
    }
    /* Aperçu sombre / clair, quel que soit le thème de Foundry. */
    for (const b of topEl.querySelectorAll("[data-ptheme]")) {
      b.addEventListener("click", () => {
        this.pTheme = b.dataset.ptheme === "light" ? "light" : "dark";
        const pv = topEl.querySelector(".sbe-chatc-preview");
        pv?.classList.toggle("theme-light", this.pTheme === "light");
        pv?.classList.toggle("theme-dark", this.pTheme !== "light");
        for (const x of topEl.querySelectorAll("[data-ptheme]")) x.classList.toggle("active", x === b);
      });
    }
    /* Aperçu EN DIRECT : la feuille de style ET les exemples. */
    const live = () => {
      clearTimeout(this.#timer);
      this.#timer = setTimeout(() => this.sync(), 250);
    };
    form.addEventListener("change", live);
    form.addEventListener("input", live);
  }

  /** Formulaire → copie de travail, appliquée aussitôt (vides → défauts). */
  sync() {
    clearTimeout(this.#timer);
    if (!this.form?.isConnected) return this.working ?? this.current();
    const data = foundry.utils.expandObject(new foundry.applications.ux.FormDataExtended(this.form).object);
    const clean = (o) => {
      for (const [key, v] of Object.entries(o)) {
        if (v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v))) delete o[key];
        else if (v && typeof v === "object" && !Array.isArray(v)) clean(v);
      }
      return o;
    };
    const cleaned = clean(data);
    /* Couleurs libres : objet indexé → liste (les lignes vides restent
       pour être remplies ; seules les valides partent dans le CSS). */
    const rawVars = cleaned.vars ?? {};
    delete cleaned.vars;
    const cfg = foundry.utils.mergeObject(ChatCards.DEFAULTS, cleaned, { inplace: false });
    cfg.vars = Object.keys(rawVars).sort((a, b) => Number(a) - Number(b)).map(i => ({
      name: String(rawVars[i]?.name ?? "").trim(),
      dark: String(rawVars[i]?.dark ?? ""), light: String(rawVars[i]?.light ?? "")
    }));
    cfg.schemaVersion = ChatCards.DEFAULTS.schemaVersion;
    this.working = cfg;
    ChatCards.apply(cfg);
    const ol = this.top?.querySelector(".sbe-chatc-preview ol");
    if (ol) ol.innerHTML = this.#previewHtml(cfg);
    return cfg;
  }

  /** Remplace ce qui est affiché (import), sans rien enregistrer. */
  load(raw) {
    this.working = ChatPanel.normalize(raw);
    ChatCards.apply(this.working);
  }

  async save() {
    const cfg = this.sync();
    await ThemeLibrary.write("chat", this.themeId, cfg);
    this.working = null;
  }

  async reset() {
    await ThemeLibrary.write("chat", this.themeId, ChatCards.DEFAULTS);
    this.working = null;
    ChatCards.apply();
  }

  /** Fermeture sans enregistrer : on revient à l'enregistré. */
  cancel() {
    clearTimeout(this.#timer);
    this.working = null;
    ChatCards.apply();
  }
}
