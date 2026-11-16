/**
 * SBE — LANGUES DES PERSONNAGES : la fenêtre du MJ
 * (Paramètres du système → Langues des personnages)
 *
 * À gauche les langues, à droite celle choisie (nom, couleur, brouillage,
 * maîtrise, chat, déchiffrage) avec un aperçu. En haut : « Voir comme »
 * (le MJ lit les textes comme un personnage), export / import. Chaque
 * champ s'enregistre dès qu'il change.
 */

import { SYSTEM_ID, getFontFamilies } from "../../helpers/constants.mjs";
import { cfCell, cfGrid } from "../../helpers/compact-form.mjs";
import { walkElements } from "../../builder/element-renderer.mjs";
import { LANG_MODES, languages, saveLanguages, cleanLanguage, scrambleWord, hash32, WORD_RE, keyFromName } from "./language-model.mjs";

const { ApplicationV2, DialogV2 } = foundry.applications.api;
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

export class SBELanguageApp extends ApplicationV2 {

  static DEFAULT_OPTIONS = {
    id: "sbe-language-app",
    tag: "div",
    classes: ["sbe-language-app", "sbe-condense"],
    window: { title: "SBE.Languages.Title", icon: "fa-solid fa-language", resizable: true },
    position: { width: 780, height: 640 }
  };

  _sel = null;

  static open() {
    const app = foundry.applications.instances.get("sbe-language-app") ?? new SBELanguageApp();
    return app.render({ force: true });
  }

  async #save(mutate) {
    const list = languages();
    mutate(list);
    await saveLanguages(list);
    this.render();
  }

  /** Clés à jet des modèles de personnage (pour le déchiffrage). */
  #rollKeys() {
    const out = new Map();
    for (const t of game.actors?.filter(a => a.type === "template") ?? []) {
      for (const el of walkElements(t.system?.elements ?? [])) {
        if (el?.key && el.config?.roll?.on && !out.has(el.key)) out.set(el.key, el.label || el.key);
      }
    }
    return [...out.entries()];
  }

  /** Aperçu : une phrase brouillée à 0 %, et à 50 %. */
  #preview(lang, pct) {
    const text = L("SBE.Languages.PreviewText");
    let i = 0;
    return esc(text).replace(WORD_RE, (w) => {
      const s = `preview|${i++}`;
      return hash32(s) % 100 < pct ? w : `<span class="sbe-lang-x">${esc(scrambleWord(w, lang, s))}</span>`;
    });
  }

  async _renderHTML() {
    const list = languages();
    const sel = list.find(l => l.id === this._sel) ?? list[0] ?? null;
    this._sel = sel?.id ?? null;

    const viewAs = game.settings.get(SYSTEM_ID, "langViewAs");
    const pcs = (game.actors?.filter(a => a.type === "personnage") ?? [])
      .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
    const viewOpts = `<option value="">${esc(L("SBE.Languages.ViewAsGM"))}</option>`
      + pcs.map(a => `<option value="${a.id}" ${a.id === viewAs ? "selected" : ""}>${esc(a.name)}</option>`).join("");

    const items = list.map(l => `<li class="${l.id === sel?.id ? "active" : ""}" data-act="select" data-id="${l.id}">
        <span class="sbe-lang-dot" style="background:${esc(l.color)}"></span><span class="sbe-lang-name">${esc(l.name || L("SBE.Languages.NoName"))}</span>
        <a data-act="delete" data-id="${l.id}" data-tooltip-text="${esc(L("SBE.Languages.Delete"))}"><i class="fa-solid fa-trash"></i></a>
      </li>`).join("");

    let edit = `<p class="notes">${esc(L("SBE.Languages.Empty"))}</p>`;
    /* Une clé simple qu'aucun modèle de personnage ne porte : à créer. */
    const tplKeys = new Set((game.actors?.filter(a => a.type === "template") ?? [])
      .flatMap(t => [...walkElements(t.system?.elements ?? [])]).map(e => e?.key).filter(Boolean));
    const keyWarn = !sel ? "" : !sel.key ? L("SBE.Languages.KeyMissing")
      : (/^[A-Za-z_]\w*$/.test(sel.key) && !tplKeys.has(sel.key) ? L("SBE.Languages.KeyUnknown", { key: sel.key }) : "");
    if (sel) {
      const f = (path, val, attrs = "") => `<input type="text" data-f="${path}" value="${esc(val)}" ${attrs}>`;
      const modes = LANG_MODES.map(m => `<option value="${m}" ${m === sel.mode ? "selected" : ""}>${esc(L(`SBE.Languages.Mode.${m}`))}</option>`).join("");
      const fonts = `<option value="">${esc(L("SBE.Languages.FontNone"))}</option>`
        + getFontFamilies().map(x => `<option value="${esc(x)}" ${x === sel.font ? "selected" : ""}>${esc(x)}</option>`).join("");
      const chk = (path, on, label, hint) => cfCell(L(label), `<input type="checkbox" data-f="${path}" ${on ? "checked" : ""}>`, { check: true, hint: hint ? L(hint) : "" });
      edit = `
        <h3><i class="fa-solid fa-language"></i> ${esc(sel.name || L("SBE.Languages.NoName"))}</h3>
        ${cfGrid([
          cfCell(L("SBE.Languages.Name"), f("name", sel.name, `placeholder="${esc(L("SBE.Languages.NamePh"))}"`)),
          cfCell(L("SBE.Languages.Color"), `<input type="color" data-f="color" value="${esc(sel.color)}">`),
          cfCell(L("SBE.Languages.Key"), f("key", sel.key, `list="sbe-lang-keys" placeholder="${esc(L("SBE.Languages.KeyPh"))}"`), { wide: true, hint: L("SBE.Languages.KeyHint") }),
          keyWarn ? `<p class="notes sbe-lang-warn is-wide"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(keyWarn)}</p>` : "",
          cfCell(L("SBE.Languages.ModeLabel"), `<select data-f="mode">${modes}</select>`, { hint: L("SBE.Languages.ModeHint") }),
          cfCell(L("SBE.Languages.Font"), `<select data-f="font">${fonts}</select>`, { hint: L("SBE.Languages.FontHint") }),
          sel.mode === "symbols" ? cfCell(L("SBE.Languages.Alphabet"), f("alphabet", sel.alphabet, `placeholder="ᚠᚢᚦᚨᚱᚲᚷᚹ"`), { wide: true, hint: L("SBE.Languages.AlphabetHint") }) : "",
          chk("showName", sel.showName, "SBE.Languages.ShowName", "SBE.Languages.ShowNameHint"),
          chk("chat", sel.chat, "SBE.Languages.Chat", "SBE.Languages.ChatHint")
        ])}
        <h3><i class="fa-solid fa-magnifying-glass"></i> ${esc(L("SBE.Languages.Decipher"))}</h3>
        ${cfGrid([
          chk("decipher.on", sel.decipher.on, "SBE.Languages.DecipherOn", "SBE.Languages.DecipherOnHint"),
          sel.decipher.on ? chk("decipher.once", sel.decipher.once, "SBE.Languages.DecipherOnce", "SBE.Languages.DecipherOnceHint") : "",
          sel.decipher.on ? cfCell(L("SBE.Languages.DecipherKey"), f("decipher.key", sel.decipher.key, `list="sbe-lang-rollkeys" placeholder="${esc(L("SBE.Languages.DecipherKeyPh"))}"`), { hint: L("SBE.Languages.DecipherKeyHint") }) : "",
          sel.decipher.on ? cfCell(L("SBE.Languages.DecipherDiff"), f("decipher.difficulty", sel.decipher.difficulty, `placeholder="0"`), { hint: L("SBE.Languages.DecipherDiffHint") }) : ""
        ])}
        <h3><i class="fa-solid fa-eye"></i> ${esc(L("SBE.Languages.Preview"))}</h3>
        <div class="sbe-lang-preview" data-sbe-lang="${sel.id}">
          <p><b>0 %</b> — ${this.#preview(sel, 0)}</p>
          <p><b>50 %</b> — ${this.#preview(sel, 50)}</p>
          <p><b>100 %</b> — ${esc(L("SBE.Languages.PreviewText"))}</p>
        </div>`;
    }

    const keys = (game.actors?.filter(a => a.type === "template") ?? [])
      .flatMap(t => [...walkElements(t.system?.elements ?? [])]).filter(e => e?.key);
    const uniq = [...new Map(keys.map(e => [e.key, e.label || e.key])).entries()];

    return `<div class="sbe-lang-app">
      <div class="sbe-lang-top">
        ${cfCell(L("SBE.Languages.ViewAs"), `<select data-act="viewas">${viewOpts}</select>`, { hint: L("SBE.Languages.ViewAsHint") })}
        <span class="sbe-lang-io">
          <button type="button" data-act="export"><i class="fa-solid fa-file-export"></i> ${esc(L("SBE.Languages.Export"))}</button>
          <button type="button" data-act="import"><i class="fa-solid fa-file-import"></i> ${esc(L("SBE.Languages.Import"))}</button>
        </span>
      </div>
      <div class="sbe-lang-cols">
        <aside class="sbe-lang-list">
          <ul>${items}</ul>
          <button type="button" data-act="add"><i class="fa-solid fa-plus"></i> ${esc(L("SBE.Languages.Add"))}</button>
          <p class="notes">${esc(L("SBE.Languages.HowTo"))}</p>
        </aside>
        <section class="sbe-lang-edit">${edit}</section>
      </div>
      <datalist id="sbe-lang-keys">${uniq.map(([k, l]) => `<option value="${esc(k)}" label="${esc(l)}"></option>`).join("")}</datalist>
      <datalist id="sbe-lang-rollkeys">${this.#rollKeys().map(([k, l]) => `<option value="${esc(k)}" label="${esc(l)}"></option>`).join("")}</datalist>
    </div>`;
  }

  _replaceHTML(result, content) { content.innerHTML = result; }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element;
    root.querySelectorAll("[data-f]").forEach(el => el.addEventListener("change", () => {
      const v = el.type === "checkbox" ? el.checked : el.value;
      return this.#save(list => {
        const l = list.find(x => x.id === this._sel);
        if (!l) return;
        foundry.utils.setProperty(l, el.dataset.f, v);
        /* Un nom donné à une langue sans clé lui en donne une. */
        if (el.dataset.f === "name" && !l.key) l.key = keyFromName(v);
      });
    }));
    root.querySelector('[data-act="viewas"]')?.addEventListener("change", (ev) => game.settings.set(SYSTEM_ID, "langViewAs", ev.currentTarget.value));
    root.querySelectorAll("a[data-act], button[data-act], li[data-act]").forEach(el => el.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const id = el.dataset.id;
      switch (el.dataset.act) {
        case "select": this._sel = id; return this.render();
        case "add": return this.#save(list => {
          const l = cleanLanguage({ name: L("SBE.Languages.NewName"), key: "" });
          list.push(l);
          this._sel = l.id;
        });
        case "delete": return this.#delete(id);
        case "export": return this.#export();
        case "import": return this.#import();
      }
    }));
  }

  async #delete(id) {
    const l = languages().find(x => x.id === id);
    if (!l) return;
    const ok = await DialogV2.confirm({
      window: { title: L("SBE.Languages.Delete") },
      content: `<p>${esc(L("SBE.Languages.DeleteConfirm", { name: l.name }))}</p>`, rejectClose: false
    }).catch(() => false);
    if (!ok) return;
    if (this._sel === id) this._sel = null;
    await this.#save(list => list.splice(list.findIndex(x => x.id === id), 1));
  }

  #export() {
    const data = JSON.stringify({ sbe: "languages", format: 1, languages: languages() }, null, 2);
    foundry.utils.saveDataToFile(data, "application/json", "sbe-langues.json");
  }

  /** Import : ajoute les langues ; une langue de même id est remplacée
      (les passages déjà marqués la retrouvent). */
  #import() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      let json = null;
      try { json = JSON.parse(await file.text()); } catch (_e) { /* illisible */ }
      const incoming = json?.sbe === "languages" && Array.isArray(json.languages) ? json.languages.map(cleanLanguage) : null;
      if (!incoming) { ui.notifications.error(L("SBE.Languages.ImportBad")); return; }
      await this.#save(list => {
        for (const l of incoming) {
          const i = list.findIndex(x => x.id === l.id);
          if (i >= 0) list[i] = l; else list.push(l);
        }
      });
      ui.notifications.info(L("SBE.Languages.ImportDone", { n: incoming.length }));
    });
    input.click();
  }
}

/** Entrée des paramètres du système. */
export class SBELanguageMenu extends ApplicationV2 {
  render() { SBELanguageApp.open(); return this; }
}
