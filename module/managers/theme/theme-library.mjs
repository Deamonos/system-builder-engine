/**
 * SBE — BIBLIOTHÈQUE DE THÈMES
 *
 * Un THÈME = une palette et tout ce qui va avec : la partie Générale
 * (couleurs, polices, habillage, médias, CSS), les Info-bulles et les
 * Messages du chat. Trois parties, un seul nom.
 *
 *  - Deux thèmes DE BASE, toujours là : « Sombre » et « Clair ». Le MJ
 *    les règle comme il veut, sans pouvoir les supprimer. Ils vivent
 *    dans les réglages historiques (theme, tooltipTheme, chatTheme) :
 *    Sombre en est la moitié « dark », Clair la moitié « light » ; le
 *    reste (polices, habillage, CSS…) leur est commun.
 *  - Des thèmes NOMMÉS, créés par le MJ (réglage « themeLibrary ») :
 *    un nouveau thème part d'une copie du Clair. Une seule palette —
 *    les deux moitiés de chaque couleur sont toujours identiques — et
 *    un style de fenêtres de Foundry (clair ou sombre) pour que ses
 *    propres fenêtres aillent avec.
 *
 * QUI CHOISIT : chaque joueur, dans les paramètres du système
 * (« Thème de l'interface »), parmi les thèmes proposés ; « Automatique »
 * suit le clair / sombre de Foundry. Le MJ peut IMPOSER un thème à
 * tous, et retirer des thèmes du choix des joueurs.
 *
 * Les thèmes de MODÈLES (habillage d'une fiche précise) restent à part.
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";

export const BUILTIN = ["dark", "light"];
export const THEME_PARTS = ["theme", "tooltip", "chat"];
const SETTING = { theme: "theme", tooltip: "tooltipTheme", chat: "chatTheme" };
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));

/** Choix du réglage joueur : rempli à la volée (la liste bouge). */
export const THEME_CHOICES = {};

export class ThemeLibrary {

  /* ============================================================ */
  /*  Réglages                                                     */
  /* ============================================================ */

  static register() {
    game.settings.register(SYSTEM_ID, "themeLibrary", {
      scope: "world",
      config: false,
      type: Object,
      default: { themes: [], imposed: "", hidden: [] },
      onChange: () => { this.refreshChoices(); this.activate(); }
    });
    game.settings.register(SYSTEM_ID, "themeChoice", {
      name: "SBE.Theme.Lib.SettingChoice",
      hint: "SBE.Theme.Lib.SettingChoiceHint",
      scope: "client",
      config: true,
      type: String,
      choices: THEME_CHOICES,
      default: "",
      onChange: () => this.activate({ force: true })
    });
    this.refreshChoices();
    /* Le joueur change le clair / sombre de Foundry : en Automatique,
       le thème suit. */
    Hooks.on("clientSettingChanged", (key) => {
      if (key === "core.uiConfig" && !this.#settingMode) this.activate();
    });
    /* Les thèmes du système dans « Configuration de l'interface
       utilisateur » de Foundry, avec Sombre et Clair. */
    Hooks.on("renderUIConfig", (app, html) => {
      try { this.#wireUIConfig(app, html instanceof HTMLElement ? html : app.element); }
      catch (err) { console.warn("SBE | Thèmes : configuration de l'interface", err); }
    });
  }

  /** Choix en cours d'enregistrement (lu avant que le réglage soit écrit). */
  static #pendingChoice = null;

  /**
   * Menu « Interface » de la configuration de Foundry : ses choix
   * (Par défaut, Sombre, Clair) puis les thèmes créés par le MJ.
   * Le vrai champ de Foundry devient caché et reçoit le style du thème
   * (clair ou sombre) : Foundry reste valide, SBE retient le thème.
   */
  static #wireUIConfig(app, root) {
    const KEYS = ["interface", "applications"];
    const sels = KEYS.map(k => root?.querySelector?.(`select[name="core.uiConfig.colorScheme.${k}"]`)).filter(Boolean);
    if (!sels.length || sels[0].dataset.sbeThemes) return;
    const named = this.themes().filter(t => !t.builtin);
    const lib = this.lib();
    if (!named.length && !lib.imposed) return;
    const chosen = this.chosenId();
    const imposed = lib.imposed && this.get(lib.imposed) ? lib.imposed : "";

    /* Les DEUX menus (Interface, Applications) : choix de Foundry puis
       les thèmes. Chaque vrai champ devient caché et reçoit le style du
       thème ; un thème habille tout, donc les deux menus le suivent. */
    const pairs = sels.map((sel) => {
      sel.dataset.sbeThemes = "1";
      const hidden = document.createElement("input");
      hidden.type = "hidden";
      hidden.name = sel.name;
      hidden.value = sel.value;
      sel.name = `sbePick-${sel.name.split(".").pop()}`;
      sel.after(hidden);
      const group = document.createElement("optgroup");
      group.label = L("SBE.Theme.Lib.UiGroup");
      for (const t of named) {
        if (lib.hidden.includes(t.id) && imposed !== t.id) continue;
        const o = document.createElement("option");
        o.value = `sbe:${t.id}`;
        o.textContent = t.name;
        group.append(o);
      }
      if (group.children.length) sel.append(group);
      if (chosen && !this.isBuiltin(chosen) && sel.querySelector(`option[value="sbe:${chosen}"]`)) sel.value = `sbe:${chosen}`;
      if (imposed) sel.disabled = true;
      return { sel, hidden };
    });

    /* Thème imposé : on le dit, et le choix est verrouillé. */
    if (imposed) {
      const note = document.createElement("p");
      note.className = "hint sbe-uiconfig-imposed";
      note.textContent = L("SBE.Theme.Lib.UiImposed", { name: this.get(imposed).name });
      sels[0].closest(".form-group")?.append(note);
    }

    const sync = (src) => {
      const v = src.sel.value;
      for (const p of pairs) {
        if (p === src) continue;
        /* Un thème choisi d'un côté → le même de l'autre ; on quitte un
           thème → l'autre menu reprend le même choix de Foundry. */
        if (v.startsWith("sbe:") || p.sel.value.startsWith("sbe:")) p.sel.value = v;
      }
      for (const p of pairs) {
        const pv = p.sel.value;
        p.hidden.value = pv.startsWith("sbe:") ? this.baseOf(pv.slice(4)) : pv;
      }
    };
    for (const p of pairs) p.sel.addEventListener("change", () => sync(p), { capture: true });
    sync(pairs[0]);

    /* Enregistrer : le thème choisi (ou « Automatique » si on a pris
       un choix de Foundry) AVANT que Foundry n'écrive son réglage. */
    const form = sels[0].form ?? root.querySelector("form") ?? root;
    form.addEventListener("submit", () => {
      if (imposed) return;
      const v = pairs.map(p => p.sel.value).find(x => x.startsWith("sbe:")) ?? "";
      const choice = v ? v.slice(4) : "";
      this.#pendingChoice = choice;
      game.settings.set(SYSTEM_ID, "themeChoice", choice)
        .catch(err => console.warn("SBE | Thèmes : choix non enregistré", err))
        .finally(() => { this.#pendingChoice = null; this.activate(); });
    }, { capture: true });
  }

  /** La bibliothèque brute (toujours propre). */
  static lib() {
    let raw = {};
    try { raw = game.settings.get(SYSTEM_ID, "themeLibrary") ?? {}; } catch (_e) { raw = {}; }
    return {
      themes: (Array.isArray(raw.themes) ? raw.themes : []).filter(t => t?.id && !BUILTIN.includes(t.id)),
      imposed: String(raw.imposed ?? ""),
      hidden: Array.isArray(raw.hidden) ? raw.hidden.map(String) : []
    };
  }

  static async #saveLib(lib) {
    await game.settings.set(SYSTEM_ID, "themeLibrary", lib);
  }

  /** Tous les thèmes : les deux de base, puis ceux du MJ. */
  static themes() {
    const lib = this.lib();
    return [
      { id: "dark", name: L("SBE.Theme.Lib.Dark"), base: "dark", builtin: true },
      { id: "light", name: L("SBE.Theme.Lib.Light"), base: "light", builtin: true },
      ...lib.themes.map(t => ({ id: t.id, name: String(t.name || t.id), base: t.base === "dark" ? "dark" : "light", builtin: false }))
    ];
  }

  static get(id) { return this.themes().find(t => t.id === id) ?? null; }
  static baseOf(id) { return this.get(id)?.base ?? "dark"; }
  static isBuiltin(id) { return BUILTIN.includes(id); }

  /** Liste du réglage joueur (Automatique + les thèmes proposés). */
  static refreshChoices() {
    for (const k of Object.keys(THEME_CHOICES)) delete THEME_CHOICES[k];
    THEME_CHOICES[""] = L("SBE.Theme.Lib.Auto");
    const lib = this.lib();
    for (const t of this.themes()) {
      if (lib.hidden.includes(t.id)) continue;
      THEME_CHOICES[t.id] = t.name;
    }
  }

  /* ============================================================ */
  /*  Thème actif                                                  */
  /* ============================================================ */

  /** Clair ou sombre, d'après le réglage de Foundry de ce joueur. */
  static foundryMode() {
    let scheme = "";
    try { scheme = game.settings.get("core", "uiConfig")?.colorScheme?.applications ?? ""; } catch (_e) { /* */ }
    if (scheme === "dark" || scheme === "light") return scheme;
    return globalThis.matchMedia?.("(prefers-color-scheme: light)")?.matches ? "light" : "dark";
  }

  /** Le thème choisi explicitement (imposé, sinon celui du joueur), ou "". */
  static chosenId() {
    const lib = this.lib();
    if (lib.imposed && this.get(lib.imposed)) return lib.imposed;
    let c = "";
    if (this.#pendingChoice !== null) c = this.#pendingChoice;
    else try { c = game.settings.get(SYSTEM_ID, "themeChoice") ?? ""; } catch (_e) { c = ""; }
    if (c && this.get(c) && !lib.hidden.includes(c)) return c;
    return "";
  }

  /** Le thème affiché pour ce client. */
  static activeId() {
    return this.chosenId() || this.foundryMode();
  }

  static #settingMode = false;

  /**
   * Applique le thème actif. Un thème choisi (ou imposé) met Foundry
   * dans son style de fenêtres — clair ou sombre — pour que tout aille
   * ensemble.
   */
  static async activate({ force = false } = {}) {
    const chosen = this.chosenId();
    if (chosen) {
      const base = this.baseOf(chosen);
      try {
        const ui = foundry.utils.deepClone(game.settings.get("core", "uiConfig"));
        if (ui?.colorScheme && (ui.colorScheme.applications !== base || ui.colorScheme.interface !== base)) {
          ui.colorScheme.applications = base;
          ui.colorScheme.interface = base;
          this.#settingMode = true;
          try { await game.settings.set("core", "uiConfig", ui); } finally { this.#settingMode = false; }
        }
      } catch (err) {
        console.warn("SBE | Thèmes : style de Foundry non modifié", err);
      }
    }
    /* Les trois parties relisent le thème actif. */
    try {
      const { ThemeManager } = await import("./theme-manager.mjs");
      const { TooltipManager } = await import("../tooltip/tooltip-manager.mjs");
      const { ChatCards } = await import("../chat/chat-cards.mjs");
      ThemeManager.apply();
      TooltipManager.apply();
      ChatCards.apply();
    } catch (err) {
      console.warn("SBE | Thèmes : application en échec", err);
    }
  }

  /* ============================================================ */
  /*  Lecture / écriture d'une partie                              */
  /* ============================================================ */

  /** Ce qui est enregistré pour une partie d'un thème (brut). */
  static raw(part, id) {
    if (!id || this.isBuiltin(id) || !this.get(id)) {
      try { return game.settings.get(SYSTEM_ID, SETTING[part]) ?? {}; } catch (_e) { return {}; }
    }
    const t = this.lib().themes.find(x => x.id === id);
    return foundry.utils.deepClone(t?.[part] ?? {});
  }

  /** Enregistre une partie. Thème nommé : une seule palette (miroir). */
  static async write(part, id, data) {
    if (!id || this.isBuiltin(id)) {
      await game.settings.set(SYSTEM_ID, SETTING[part], data);
      return;
    }
    const lib = this.lib();
    const t = lib.themes.find(x => x.id === id);
    if (!t) return;
    t[part] = this.mirror(foundry.utils.deepClone(data), t.base === "dark" ? "dark" : "light");
    await this.#saveLib(lib);
  }

  /**
   * UNE SEULE PALETTE : toute paire { dark, light } prend la valeur de
   * la moitié de base, partout dans l'objet (couleurs, palette,
   * interface, couleurs libres…).
   */
  static mirror(obj, base) {
    const other = base === "dark" ? "light" : "dark";
    const walk = (o) => {
      if (Array.isArray(o)) { o.forEach(walk); return; }
      if (!o || typeof o !== "object") return;
      if ("dark" in o && "light" in o) {
        const b = o[base];
        o[other] = (b && typeof b === "object") ? foundry.utils.deepClone(b) : b;
      }
      for (const v of Object.values(o)) walk(v);
    };
    walk(obj);
    return obj;
  }

  /* ============================================================ */
  /*  Gestion des thèmes (MJ)                                      */
  /* ============================================================ */

  /**
   * Crée un thème nommé, copie d'un autre (le Clair par défaut).
   * @returns {Promise<string>} son identifiant
   */
  static async create(name, fromId = "light", parts = null, baseIn = null) {
    const lib = this.lib();
    const id = foundry.utils.randomID();
    const base = baseIn === "dark" || baseIn === "light" ? baseIn : this.baseOf(fromId);
    const entry = { id, name: String(name || L("SBE.Theme.Lib.NewName")).trim(), base };
    const { ThemeManager } = await import("./theme-manager.mjs");
    for (const part of THEME_PARTS) {
      let data = parts?.[part] ?? this.raw(part, fromId);
      if (part === "theme" && !parts?.theme) {
        /* La palette d'un thème de base n'est stockée qu'en écarts :
           le nouveau thème en garde une copie COMPLÈTE. */
        const cfg = ThemeManager.getConfig(fromId);
        data = foundry.utils.deepClone(cfg);
        data.palette = ThemeManager.getPalette(cfg);
      }
      entry[part] = this.mirror(foundry.utils.deepClone(data ?? {}), base);
    }
    lib.themes.push(entry);
    await this.#saveLib(lib);
    return id;
  }

  /** Ce nom est-il déjà pris (casse et espaces ignorés) ? */
  static nameTaken(name, exceptId = null) {
    const n = String(name ?? "").trim().toLowerCase();
    return !!n && this.themes().some(t => t.id !== exceptId && t.name.trim().toLowerCase() === n);
  }

  /** Un nom libre proche : « Néon (2) », « Néon (3) »… */
  static uniqueName(name) {
    const root = String(name ?? "").trim().replace(/\s*\(\d+\)$/, "") || L("SBE.Theme.Lib.NewName");
    if (!this.nameTaken(root)) return root;
    let i = 2;
    while (this.nameTaken(`${root} (${i})`)) i++;
    return `${root} (${i})`;
  }

  static async rename(id, name) {
    const lib = this.lib();
    const t = lib.themes.find(x => x.id === id);
    if (!t || !String(name ?? "").trim()) return;
    t.name = String(name).trim();
    await this.#saveLib(lib);
  }

  /** Style des fenêtres de Foundry (clair / sombre) d'un thème nommé. */
  static async setBase(id, base) {
    const lib = this.lib();
    const t = lib.themes.find(x => x.id === id);
    if (!t) return;
    const from = t.base === "dark" ? "dark" : "light";
    t.base = base === "dark" ? "dark" : "light";
    /* La palette ne change pas : les deux moitiés sont déjà égales. */
    for (const part of THEME_PARTS) if (t[part]) this.mirror(t[part], from);
    await this.#saveLib(lib);
  }

  static async remove(id) {
    if (this.isBuiltin(id)) return;
    const lib = this.lib();
    lib.themes = lib.themes.filter(x => x.id !== id);
    if (lib.imposed === id) lib.imposed = "";
    lib.hidden = lib.hidden.filter(x => x !== id);
    await this.#saveLib(lib);
  }

  static async setImposed(id) {
    const lib = this.lib();
    lib.imposed = id && this.get(id) ? id : "";
    if (lib.imposed) lib.hidden = lib.hidden.filter(x => x !== lib.imposed);
    await this.#saveLib(lib);
  }

  /** Proposé (ou non) dans le choix des joueurs. */
  static async setOffered(id, offered) {
    const lib = this.lib();
    lib.hidden = lib.hidden.filter(x => x !== id);
    if (!offered) lib.hidden.push(id);
    await this.#saveLib(lib);
  }
}
