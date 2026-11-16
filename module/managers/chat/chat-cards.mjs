/**
 * SBE — MESSAGES DE CHAT : la carte unique et son habillage
 *
 * UNE SEULE CARTE pour tout le système (même langage partout) :
 *
 *   ┌ en-tête : icône + titre + sous-titre ┐
 *   │ corps   : ce que le module veut dire │
 *   └ bandeau : le résultat (réussite…)    ┘
 *
 * Chaque module appelle ChatCards.post({ type, … }) : jets, effets,
 * nouvelle journée, alarmes… Le MJ règle ensuite l'apparence de
 * toutes les cartes depuis le manager (ChatStyle), puis retouche
 * chaque TYPE (couleur d'accent, icône, CSS « & »), et chaque
 * RÉSULTAT (texte, couleur, icône, son).
 *
 * Le texte et l'icône d'un résultat sont posés AU RENDU : changer
 * « Réussite » en « Succès » change aussi les anciens messages.
 *
 * Le CADRE du message (fond, bordure, nom, portrait) habille :
 *   - les messages SBE ;
 *   - le chat libre (messages tapés, jets /r de Foundry) ;
 *   - les messages d'autres modules s'ils sont du texte simple.
 * Un message d'un autre module avec son propre format (sa carte) est
 * laissé tel quel.
 */

import { ThemeLibrary } from "../theme/theme-library.mjs";
import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { labelIconHTML, KEY_RE } from "../../builder/element-renderer.mjs";
import { UiSound, uiSoundOf } from "../media/ui-sound.mjs";
import { TemplateTheme } from "../theme/template-theme.mjs";
import { Identity } from "../../helpers/identity.mjs";
import { CHAT_DEFAULT } from "./chat-default.mjs";
import { followInterfaceTheme, unfollowInterfaceTheme } from "../../helpers/ui-theme.mjs";

/** Résultats connus (l'ordre est celui du manager). */
export const OUTCOMES = ["success", "failure", "critSuccess", "critFailure"];

/** Types de carte connus. Un futur module en ajoute un ici. */
export const CARD_TYPES = ["roll", "request", "item", "effect", "newday", "alarm", "trade", "use", "zone", "group", "quest"];

/** Icône par défaut de chaque type (si le module n'en donne pas). */
const TYPE_ICONS = {
  roll: "fa-solid fa-dice-d20",
  request: "fa-solid fa-bullhorn",
  item: "fa-solid fa-box-open",
  effect: "fa-solid fa-wand-sparkles",
  newday: "fa-solid fa-moon",
  alarm: "fa-solid fa-triangle-exclamation",
  trade: "fa-solid fa-right-left",
  use: "fa-solid fa-hand-sparkles",
  zone: "fa-solid fa-fire",
  group: "fa-solid fa-users",
  quest: "fa-solid fa-scroll"
};

/* COULEURS : Foundry a DEUX thèmes, sombre et clair. Toute couleur du
   manager est donc une PAIRE { dark, light }. Une moitié vide reprend
   l'autre ; les deux vides = Foundry décide.
   Chaque paire devient une variable CSS posée sur les deux thèmes ;
   la plus proche (fenêtre, barre latérale, page) gagne, comme pour
   le reste de Foundry. */
const pair = (dark, light = dark) => ({ dark, light });

/** Une couleur stockée → paire (accepte l'ancien format « une chaîne »). */
export function colorPair(v) {
  if (v && typeof v === "object") return { dark: String(v.dark ?? "").trim(), light: String(v.light ?? "").trim() };
  const s = String(v ?? "").trim();
  return { dark: s, light: s };
}

/** Réglages par défaut d'un résultat. */
const OUTCOME_DEFAULTS = {
  success: { label: "", color: pair("#2d9d3a"), text: pair("#ffffff"), icon: "fa-solid fa-check" },
  failure: { label: "", color: pair("#c22525"), text: pair("#ffffff"), icon: "fa-solid fa-xmark" },
  critSuccess: { label: "", color: pair("#1f7a2a"), text: pair("#ffffff"), icon: "fa-solid fa-star" },
  critFailure: { label: "", color: pair("#7a0e0e"), text: pair("#ffffff"), icon: "fa-solid fa-skull" }
};

/* Où vivent les deux thèmes (mêmes repères que le manager de thème). */
const DARK = ":root, .theme-dark";
const LIGHT = ".theme-light";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const cssVal = (s) => String(s ?? "").replace(/[;{}<>]/g, "").trim();
const cssUrl = (s) => String(s ?? "").replace(/['"<>()]/g, "");

/* Sélecteurs : le cadre habillé, la carte. Raccourcis du CSS avancé :
   @message / @carte (FR) et @frame / @card (EN). */
const MSG = "li.chat-message.sbe-msg";
const CARD = ".sbe-card";

export class ChatCards {

  /* ============================================================ */
  /*  Configuration                                                */
  /* ============================================================ */

  static get DEFAULTS() {
    const outcomes = {};
    for (const k of OUTCOMES) outcomes[k] = { ...foundry.utils.deepClone(OUTCOME_DEFAULTS[k]), sound: { sound: "", volume: 80 } };
    const types = {};
    /* Disposition des PARTICIPANTS (acteur + ses jets) :
       - layout « stack » = l'un sous l'autre (base), « columns » = côte
         à côte, à activer par le MJ ;
       - attacker « left » / « right » = côté de celui qui agit ;
       - portrait affiché ou non, et sa taille. */
    for (const k of CARD_TYPES) types[k] = {
      accent: pair(""), icon: "", css: "",
      layout: "stack", attacker: "left", portrait: true, portraitSize: 36
    };
    const base = {
      schemaVersion: 2,
      /* Cadre du message (li.chat-message). */
      frame: {
        free: true,           /* habiller aussi le chat libre */
        bg: pair(""), text: pair(""), borderColor: pair(""), borderWidth: 1, radius: 0,
        padding: 0, font: "", size: 0, shadow: "",
        bgPath: "", bgCode: "",
        nameColor: pair(""), nameFont: "",
        portrait: false, portraitSize: 32
      },
      /* Carte SBE (.sbe-card). */
      card: {
        bg: pair(""), text: pair(""), borderColor: pair(""), borderWidth: 1, radius: 6,
        accent: pair(""), titleColor: pair(""), titleFont: "", titleSize: 0, iconSize: 32
      },
      outcomes,
      /* Présentation des JETS : apports (modificateur, effets visibles)
         et avantage / désavantage. Textes et icônes posés au rendu. */
      rolls: {
        mods: {
          label: "",              /* texte de la ligne du modificateur saisi */
          style: "pill",          /* pill = pastille, text = texte coloré */
          up: pair(""), down: pair(""), bg: pair(""),
          icons: true,            /* icônes des effets */
          summary: true           /* récap « Seuil 40 → 50 » */
        },
        adv: {
          advLabel: "", disLabel: "",
          advIcon: "fa-solid fa-angles-up", disIcon: "fa-solid fa-angles-down",
          advColor: pair(""), disColor: pair(""), text: pair(""),
          dropped: true, droppedLabel: ""
        },
        /* Bouton « Lancer mon jet » des demandes de jet. */
        button: {
          label: "", icon: "fa-solid fa-dice-d20",
          bg: pair(""), text: pair(""), border: pair(""),
          hoverBg: pair(""), hoverText: pair(""),
          radius: 4, size: 0, full: false
        }
      },
      types,
      /* Couleurs LIBRES du MJ, une paire sombre / clair par nom :
         utilisables dans tout le CSS avancé avec var(--nom). */
      vars: [],
      customCss: ""
    };
    /* L'habillage par défaut (chat-default.mjs) se pose PAR-DESSUS la
       structure : une clé qu'il n'aurait pas garde sa valeur neutre. */
    return foundry.utils.mergeObject(base, foundry.utils.deepClone(CHAT_DEFAULT), { inplace: false });
  }

  /** Config d'un thème (par défaut : le thème actif de ce client). */
  static getConfig(themeId = null) {
    let stored = {};
    try { stored = ThemeLibrary.raw("chat", themeId ?? ThemeLibrary.activeId()) ?? {}; } catch (_e) { /* pas encore inscrit */ }
    return foundry.utils.mergeObject(this.DEFAULTS, stored, { inplace: false });
  }

  /** Texte affiché d'un résultat (réglé par le MJ, sinon la langue). */
  static outcomeLabel(outcome, cfg = null) {
    const c = (cfg ?? this.getConfig()).outcomes?.[outcome];
    return String(c?.label ?? "").trim() || game.i18n.localize(`SBE.Chat.Outcome.${outcome}`);
  }

  /* ============================================================ */
  /*  Construction d'une carte                                     */
  /* ============================================================ */

  /**
   * HTML d'une carte.
   * @param {object} o
   * @param {string} o.type        roll | effect | newday | alarm | …
   * @param {string} [o.icon]      fa-…, émoji ou chemin d'image
   * @param {string} [o.title]
   * @param {string} [o.subtitle]
   * @param {string} [o.body]      HTML déjà assaini par l'appelant
   * @param {string} [o.outcome]   un des OUTCOMES (sinon pas de bandeau)
   * @param {string} [o.detail]    précision du bandeau, ex. « (12 ≤ 50) »
   * @param {string} [o.sides]     HTML des participants (voir sidesHtml)
   * @param {string} [o.footer]    HTML sous les participants (verdict d'une opposition)
   * @param {object} [config]      réglages à utiliser (aperçu du manager)
   */
  static html({ type = "roll", icon = "", title = "", subtitle = "", body = "", sides = "", footer = "", outcome = "", detail = "", fold = false } = {}, config = null) {
    const cfg = config ?? this.getConfig();
    const ic = String(icon || cfg.types?.[type]?.icon || TYPE_ICONS[type] || "").trim();
    const icoHtml = ic ? `<span class="sbe-card-icon">${labelIconHTML({ config: { labelIcon: ic } })}</span>` : "";
    const hasOutcome = OUTCOMES.includes(outcome);
    const banner = hasOutcome ? `
      <div class="sbe-card-result" data-outcome="${outcome}">
        <span class="sbe-card-result-icon">${this.#outcomeIcon(outcome, cfg)}</span>
        <span class="sbe-card-result-label">${esc(this.outcomeLabel(outcome, cfg))}</span>
        ${detail ? `<span class="sbe-card-result-detail">${esc(detail)}</span>` : ""}
      </div>` : "";
    const titles = `${icoHtml}<div class="sbe-card-titles">
        ${title ? `<div class="sbe-card-title">${esc(title)}</div>` : ""}
        ${subtitle ? `<div class="sbe-card-sub">${esc(subtitle)}</div>` : ""}
      </div>`;
    const bodyHtml = (body || sides || footer) ? `<div class="sbe-card-body">${body}${sides || ""}${footer || ""}</div>` : "";
    /* REPLIÉE : l'en-tête se clique pour dérouler le corps (carte
       d'objet). <details> natif : rien à brancher. */
    if (fold && bodyHtml) {
      return `<div class="sbe-card sbe-card--fold" data-card-type="${esc(type)}">
        <details class="sbe-card-fold"><summary class="sbe-card-head">${titles}<i class="fa-solid fa-chevron-down sbe-card-fold-caret"></i></summary>
        ${bodyHtml}</details>${banner}
      </div>`;
    }
    return `<div class="sbe-card" data-card-type="${esc(type)}"${hasOutcome ? ` data-outcome="${outcome}"` : ""}>
      <header class="sbe-card-head">${titles}</header>
      ${bodyHtml}
      ${banner}
    </div>`;
  }

  static #outcomeIcon(outcome, cfg) {
    const ic = String(cfg.outcomes?.[outcome]?.icon ?? "").trim();
    return ic ? labelIconHTML({ config: { labelIcon: ic } }).trim() : "";
  }

  /** Drapeaux qui marquent un message comme carte SBE. */
  static flags(type, outcome = "") {
    return { [SYSTEM_ID]: { card: type, ...(OUTCOMES.includes(outcome) ? { outcome } : {}) } };
  }

  /**
   * Publie une carte.
   * @param {object} o   les champs de html() +
   * @param {object} [o.speaker]
   * @param {string[]} [o.whisper]
   * @param {Roll[]} [o.rolls]     jets Foundry (dés 3D, son des dés)
   */
  static async post({ speaker, whisper, messageMode, flags, ...rest } = {}) {
    const { content, rolls, type, outcome } = await this.build(rest);
    const data = { content, flags: foundry.utils.mergeObject(this.flags(type, outcome), flags ?? {}, { inplace: false }) };
    if (speaker) data.speaker = speaker;
    if (whisper?.length) data.whisper = whisper;
    const options = {};
    /* Visibilité demandée pour un message SANS dés (carte courte) : elle
       s'applique aussi. */
    if (!rolls?.length && messageMode && !whisper?.length) {
      if (CONFIG.ChatMessage?.modes) options.messageMode = messageMode;
      else if (ChatMessage.applyRollMode) ChatMessage.applyRollMode(data, messageMode);
    }
    if (rolls?.length) {
      data.rolls = rolls;
      data.sound = CONFIG.sounds?.dice;
      /* Visibilité choisie par le joueur dans le chat (public, MJ,
         aveugle, soi), comme un jet Foundry — sauf chuchotement imposé. */
      if (!whisper?.length) {
        try { options.messageMode = messageMode || game.settings.get("core", "messageMode"); }
        catch (_e) { /* réglage absent : public */ }
        /* Ancien moteur (modes de jet) : appliqué au message. */
        if (messageMode && !CONFIG.ChatMessage?.modes && ChatMessage.applyRollMode) {
          ChatMessage.applyRollMode(data, messageMode);
        }
      }
    }
    return ChatMessage.create(data, options);
  }

  /**
   * Construit une carte SANS la publier : { content, rolls }. Sert à
   * post() et aux cartes qui se mettent à jour (opposition : le MJ
   * réécrit la carte à chaque jet reçu).
   */
  static async build({ rolls, sides, ...card } = {}) {
    let body = card.body ?? "";
    /* PARTICIPANTS : celui qui agit, puis (s'il y en a) celui qui subit.
       Chacun : portrait + nom, puis ses jets (flèche de détail). */
    const allRolls = [...(rolls ?? [])];
    if (Array.isArray(sides) && sides.length) {
      const built = [];
      for (const sd of sides) {
        let rh = "";
        /* Jet gardé (avec son étiquette, ex. « Avantage ») ; les jets
           écartés sont dans son détail, sous la flèche. */
        allRolls.push(...(sd.rolls ?? []));
        for (const [i, r] of (sd.rolls ?? []).entries()) {
          rh += await this.diceHtml(r, i ? {} : { adv: sd.adv, dropped: sd.dropped ?? [] });
        }
        allRolls.push(...(sd.dropped ?? []));
        built.push({ ...sd, rollsHtml: rh });
      }
      card.sides = this.sidesHtml(built);
    }
    /* Jets SANS participant (rare) : sous le corps. Ceux des
       participants sont déjà dans leur bloc — on ne les répète pas. */
    if (rolls?.length) {
      let rh = "";
      for (const r of rolls) rh += await this.diceHtml(r);
      body = `${body}<div class="sbe-card-roll">${rh}</div>`;
    }
    /* sidesFirst : les participants AVANT le corps (attaque : qui tire
       et contre qui, puis ce qui en résulte). */
    if (card.sidesFirst && card.sides) { body = card.sides + body; card.sides = ""; }
    delete card.sidesFirst;
    /* Tous les jets restent attachés au message (dés 3D, son). */
    return { content: this.html({ ...card, body }), rolls: allRolls, type: card.type, outcome: card.outcome };
  }

  /**
   * Bloc des participants.
   * @param {Array<{ref?:string, img?:string, name?:string, body?:string, rollsHtml?:string, after?:string}>} sides
   *        le 1er agit (attaquant), le 2e subit (défenseur).
   *        `ref` (uuid du pion ou de l'acteur) : le nom et le portrait
   *        ne sont PAS écrits dans le message, ils sont résolus à
   *        l'affichage par Identity (module d'identité à venir).
   */
  static sidesHtml(sides) {
    const list = (sides ?? []).filter(Boolean);
    if (!list.length) return "";
    const one = (sd, role) => {
      const ref = String(sd.ref ?? "");
      const img = ref ? "" : String(sd.img ?? "");
      const name = ref ? "" : String(sd.name ?? "");
      return `<div class="sbe-card-side${sd.cls ? ` ${esc(sd.cls)}` : ""}" data-role="${role}"${ref ? ` data-ref="${esc(ref)}"` : ""}${sd.pid ? ` data-pid="${esc(sd.pid)}"` : ""}>
        <div class="sbe-card-actor">
          ${img ? `<img class="sbe-card-portrait" src="${esc(img)}" alt="">` : ""}
          <span class="sbe-card-actor-name">${esc(name)}</span>
        </div>
        ${sd.body ? `<div class="sbe-card-side-body">${sd.body}</div>` : ""}
        ${sd.rollsHtml ? `<div class="sbe-card-roll">${sd.rollsHtml}</div>` : ""}
        ${sd.after ? `<div class="sbe-card-side-after">${sd.after}</div>` : ""}
      </div>`;
    };
    const vs = `<div class="sbe-card-vs">${esc(game.i18n.localize("SBE.Chat.Vs"))}</div>`;
    /* Le 1er agit, les suivants subissent (2 en général ; une
       opposition à plusieurs les empile, « contre » entre chacun). */
    return `<div class="sbe-card-sides" data-count="${list.length}">
      ${list.map((sd, i) => one(sd, sd.role || (i ? "defender" : "attacker"))).join(vs)}
    </div>`;
  }

  /**
   * Un jet : « formule … total ▸ », le détail des dés se déroule au clic
   * (élément <details> natif : rien à brancher, marche partout).
   */
  static async diceHtml(roll, { adv = "", dropped = [] } = {}) {
    /* Avantage : seul le jet gardé est affiché ; les autres (2 ou 10)
       se lisent sous la flèche, barrés. */
    const off = dropped.length
      ? `<div class="sbe-dd-term sbe-dd-dropped"><span class="sbe-dd-f">${esc(game.i18n.localize("SBE.Chat.Dropped"))}</span>
          <span class="sbe-dd-chips">${dropped.map(r => `<span class="sbe-dd-chip is-off">${esc(r.total)}</span>`).join("")}</span></div>`
      : "";
    let detail = this.diceDetail(roll);
    if (off) detail = detail ? detail.replace(/<\/div>$/, `${off}</div>`) : `<div class="sbe-dd">${off}</div>`;
    return this.diceMarkup(roll.formula, roll.total, detail, { adv });
  }

  /** Texte et icône (HTML) de l'étiquette avantage / désavantage. */
  static advTagOf(adv, cfg = null) {
    const a = (cfg ?? this.getConfig()).rolls?.adv ?? {};
    const isAdv = adv === "adv";
    const label = String((isAdv ? a.advLabel : a.disLabel) ?? "").trim()
      || game.i18n.localize(isAdv ? "SBE.Roll.DlgAdv" : "SBE.Roll.DlgDis");
    const iv = String((isAdv ? a.advIcon : a.disIcon) ?? "").trim();
    return { label, icon: iv ? labelIconHTML({ config: { labelIcon: iv } }).trim() : "" };
  }

  /** Intérieur du bouton « Lancer mon jet » : icône + texte du MJ. */
  static rollButtonInner(cfg = null) {
    const b = (cfg ?? this.getConfig()).rolls?.button ?? {};
    const iv = String(b.icon ?? "").trim();
    const label = String(b.label ?? "").trim() || game.i18n.localize("SBE.RollReq.RollMine");
    return `<span class="sbe-rr-btn-ic">${iv ? labelIconHTML({ config: { labelIcon: iv } }).trim() : ""}</span><span class="sbe-rr-btn-l">${esc(label)}</span>`;
  }

  /** Texte de la ligne du modificateur saisi. */
  static modLabelOf(cfg = null) {
    return String((cfg ?? this.getConfig()).rolls?.mods?.label ?? "").trim() || game.i18n.localize("SBE.Roll.DlgMod");
  }

  /**
   * Bloc des APPORTS d'un jet (modificateur saisi, effets visibles).
   * Servi par les jets ET par l'aperçu du manager : un seul balisage.
   * @param {Array<{kind:"free"|"effect", label?, img?, val:number}>} rows
   * @param {{on:"goal"|"roll", from:number, to:number}} sum  récap
   */
  static modsHtml(rows, { on = "roll", from = 0, to = 0, cfg = null } = {}) {
    if (!rows?.length) return "";
    const L = (k) => game.i18n.localize(k);
    const sign = (v) => (v > 0 ? `+${v}` : String(v).replace("-", "−"));
    const lines = rows.map(r => {
      const ic = r.kind === "effect" && r.img
        ? `<span class="sbe-card-mod-ic">${labelIconHTML({ config: { labelIcon: r.img } }).trim()}</span>` : "";
      const label = r.kind === "free" ? this.modLabelOf(cfg) : (r.label ?? "");
      return `<div class="sbe-card-mod ${r.val > 0 ? "is-up" : "is-down"}" data-mod="${r.kind === "free" ? "free" : "effect"}">
        ${ic}<span class="sbe-card-mod-l">${esc(label)}</span><span class="sbe-card-mod-v">${esc(sign(r.val))}</span></div>`;
    }).join("");
    const total = rows.reduce((t, r) => t + r.val, 0);
    const sum = `<div class="sbe-card-mods-sum" data-on="${on === "goal" ? "goal" : "roll"}">
        <span class="sbe-card-mods-cap">${esc(L(on === "goal" ? "SBE.Roll.SumGoal" : "SBE.Roll.SumRoll"))}</span>
        <span class="sbe-card-mods-from">${esc(from)}</span>
        <i class="fa-solid fa-arrow-right-long"></i>
        <b class="sbe-card-mods-to ${total >= 0 ? "is-up" : "is-down"}">${esc(to)}</b></div>`;
    return `<div class="sbe-card-mods">${lines}${sum}</div>`;
  }

  /**
   * Détail d'un jet, lisible d'un coup d'œil : chaque dé en pastille
   * (max / min soulignés, dés écartés barrés), puis le calcul s'il y
   * en a un (« 12 + 5 »). Pas de répétition de la formule ni du total.
   */
  static diceDetail(roll) {
    const terms = roll?.dice ?? [];
    if (!terms.length) return "";
    /* Un seul dé, rien à calculer (1d100 → 12) : le total dit tout. */
    if (terms.length === 1 && (terms[0].results ?? []).length <= 1
      && String(roll.total) === String(terms[0].results?.[0]?.result)) return "";
    const many = terms.length > 1;
    const rows = terms.map(d => {
      const chips = (d.results ?? []).map(r => {
        const cls = ["sbe-dd-chip"];
        if (r.active === false || r.discarded) cls.push("is-off");
        else if (r.result === d.faces) cls.push("is-max");
        else if (r.result === 1) cls.push("is-min");
        return `<span class="${cls.join(" ")}">${esc(r.result)}</span>`;
      }).join("");
      return `<div class="sbe-dd-term">
        ${many || d.modifiers?.length ? `<span class="sbe-dd-f">${esc(d.expression ?? d.formula ?? "")}</span>` : ""}
        <span class="sbe-dd-chips">${chips}</span></div>`;
    }).join("");
    const calc = String(roll.result ?? "").trim();
    const calcLine = calc && calc !== String(roll.total) && /[+\-*/]/.test(calc)
      ? `<div class="sbe-dd-calc">${esc(calc)} = <b>${esc(roll.total)}</b></div>` : "";
    return `<div class="sbe-dd">${rows}${calcLine}</div>`;
  }

  /**
   * Balisage d'un jet (servi aussi à l'aperçu du manager).
   * @param {object} [o] { adv: "adv" | "dis" — étiquette Avantage / Désavantage }
   */
  static diceMarkup(formula, total, detailHtml = "", { adv = "", cfg = null } = {}) {
    let tag = "";
    if (adv === "adv" || adv === "dis") {
      const t = this.advTagOf(adv, cfg);
      tag = `<span class="sbe-card-dice-tag" data-adv="${adv}"><span class="sbe-card-dice-tag-ic">${t.icon}</span><span class="sbe-card-dice-tag-l">${esc(t.label)}</span></span>`;
    }
    return `<details class="sbe-card-dice">
      <summary>
        <i class="fa-solid fa-chevron-right sbe-card-dice-caret"></i>
        <span class="sbe-card-dice-formula">${esc(formula)}</span>
        ${tag}
        <span class="sbe-card-dice-total">${esc(total)}</span>
      </summary>
      <div class="sbe-card-dice-detail">${detailHtml}</div>
    </details>`;
  }

  /* ============================================================ */
  /*  Au rendu : cadre, portrait, textes des résultats             */
  /* ============================================================ */

  /** Un message d'un autre module a-t-il SON format (sa carte) ? */
  static #isForeignFormat(message) {
    /* Tirage d'une table aléatoire de Foundry : un message de Foundry. */
    if (message.flags?.core?.RollTable) return false;
    const box = document.createElement("div");
    box.innerHTML = String(message.content ?? "");
    /* Classes que Foundry lui-même pose dans un message simple. */
    /* … et dans un tirage de table aléatoire (table-draw, résultats). */
    const ok = /^(dice-|inline-|content-link|fa-|fa$|fas$|far$|fab$|sbe-|part-|tooltip|roll|entity-link|secret|table-|flexrow$|name$|description$|die$|d\d+$|min$|max$|discarded$|rerolled$|exploded$|success$|failure$)/;
    for (const node of box.querySelectorAll("[class]")) {
      for (const c of node.classList) if (!ok.test(c)) return true;
    }
    return false;
  }

  static decorate(message, li, cfg = null) {
    if (!message || !li) return;
    const c = cfg ?? this.getConfig();
    const isCard = !!message.flags?.[SYSTEM_ID]?.card || !!li.querySelector(".sbe-card");
    const styled = isCard || (c.frame?.free !== false && !this.#isForeignFormat(message));
    li.classList.toggle("sbe-msg", styled);
    li.classList.toggle("sbe-msg--card", isCard);

    /* Orateur : nom et portrait passent par Identity (un seul endroit
       décide de ce qu'un joueur voit d'un personnage). */
    const sp = message.speaker ?? {};
    const spDoc = (sp.token && game.scenes?.get(sp.scene)?.tokens?.get(sp.token)) || message.speakerActor || null;
    const who = (spDoc && message.style !== CONST.CHAT_MESSAGE_STYLES.OOC) ? Identity.of(spDoc) : null;
    if (who?.name) {
      const sender = li.querySelector(".message-sender");
      if (sender) sender.textContent = who.name;
    }
    /* Nom trop long : coupé par « … » (CSS) ; le nom entier au survol. */
    const snd = li.querySelector(".message-sender");
    if (snd) snd.title = snd.textContent.trim();

    /* Participants des cartes : résolus ici, chez chaque joueur. */
    for (const side of li.querySelectorAll(".sbe-card-side[data-ref]")) {
      const id = Identity.of(side.dataset.ref);
      if (!id) continue;
      const nm = side.querySelector(".sbe-card-actor-name");
      if (nm) nm.textContent = id.name;
      let im = side.querySelector(".sbe-card-portrait");
      if (id.img) {
        if (!im) {
          im = document.createElement("img");
          im.className = "sbe-card-portrait";
          im.alt = "";
          side.querySelector(".sbe-card-actor")?.prepend(im);
        }
        im.src = id.img;
      } else im?.remove();
    }

    /* Noms cités dans le texte (vainqueur…) : par Identity aussi. */
    for (const n of li.querySelectorAll("[data-ref-name]")) {
      const id = Identity.of(n.dataset.refName);
      if (id?.name) n.textContent = id.name;
    }

    /* Portrait de l'orateur dans l'en-tête. */
    li.querySelector(".sbe-msg-portrait")?.remove();
    if (styled && c.frame?.portrait) {
      const src = who?.img || message.author?.avatar;
      const head = li.querySelector(".message-header");
      if (src && head) {
        const img = document.createElement("img");
        img.className = "sbe-msg-portrait";
        img.src = src;
        img.alt = "";
        head.prepend(img);
      }
    }

    /* Jets : textes et icônes du moment (anciens messages compris). */
    for (const t of li.querySelectorAll(".sbe-card-dice-tag[data-adv]")) {
      const tg = this.advTagOf(t.dataset.adv, c);
      const lab = t.querySelector(".sbe-card-dice-tag-l");
      if (lab) lab.textContent = tg.label;
      const ic = t.querySelector(".sbe-card-dice-tag-ic");
      if (ic) ic.innerHTML = tg.icon;
    }
    for (const d of li.querySelectorAll(".sbe-dd-dropped > .sbe-dd-f")) {
      d.textContent = String(c.rolls?.adv?.droppedLabel ?? "").trim() || game.i18n.localize("SBE.Chat.Dropped");
    }
    /* Bouton « Lancer mon jet » : icône et texte du moment. */
    const btnInner = li.querySelector(".sbe-rr-btn") ? this.rollButtonInner(c) : "";
    for (const b of li.querySelectorAll(".sbe-rr-btn")) b.innerHTML = btnInner;
    for (const m of li.querySelectorAll('.sbe-card-mod[data-mod="free"] > .sbe-card-mod-l')) {
      m.textContent = this.modLabelOf(c);
    }

    /* Résultats : texte et icône du moment (anciens messages compris). */
    for (const res of li.querySelectorAll(".sbe-card-result[data-outcome]")) {
      const o = res.dataset.outcome;
      if (!OUTCOMES.includes(o)) continue;
      const lab = res.querySelector(".sbe-card-result-label");
      if (lab) lab.textContent = this.outcomeLabel(o, c);
      const ico = res.querySelector(".sbe-card-result-icon");
      if (ico) ico.innerHTML = this.#outcomeIcon(o, c);
    }
  }

  /** Réapplique l'habillage aux messages déjà affichés. */
  static redecorateAll(cfg = null) {
    const c = cfg ?? this.getConfig();
    for (const li of document.querySelectorAll("li.chat-message[data-message-id]")) {
      this.decorate(game.messages?.get(li.dataset.messageId), li, c);
    }
  }

  /* ============================================================ */
  /*  Feuille de style                                             */
  /* ============================================================ */

  static buildCss(cfg = null) {
    const c = cfg ?? this.getConfig();
    const f = c.frame ?? {};
    const k = c.card ?? {};
    let css = "";
    /* Paires de couleurs → variables sombre / clair. */
    const dark = [], light = [];
    const col = (name, v) => {
      const p = colorPair(v);
      if (!p.dark && !p.light) return "";
      dark.push(`--sbe-chat-${name}: ${cssVal(p.dark || p.light)}`);
      light.push(`--sbe-chat-${name}: ${cssVal(p.light || p.dark)}`);
      return `var(--sbe-chat-${name})`;
    };
    for (const v of Array.isArray(c.vars) ? c.vars : []) {
      const n = String(v?.name ?? "").trim();
      if (!KEY_RE.test(n)) continue;
      const p = colorPair(v);
      if (!p.dark && !p.light) continue;
      dark.push(`--${n}: ${cssVal(p.dark || p.light)}`);
      light.push(`--${n}: ${cssVal(p.light || p.dark)}`);
    }
    const block = (sel, rules) => {
      const r = rules.filter(Boolean);
      if (r.length) css += `${sel} {\n  ${r.join(";\n  ")};\n}\n`;
    };
    const shadow = (s) => s === "none" ? "box-shadow: none !important"
      : s === "soft" ? "box-shadow: 0 3px 10px rgba(0,0,0,0.35) !important"
        : s === "strong" ? "box-shadow: 0 6px 22px rgba(0,0,0,0.6) !important" : "";
    const bgImage = (path, code) => {
      const svg = code ? TemplateTheme.sanitizeSvg(code) : "";
      if (svg) return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
      if (path) return `url('${cssUrl(path)}')`;
      return "";
    };

    /* --- Cadre --- */
    const fImg = bgImage(f.bgPath, f.bgCode);
    const fBg = col("frame-bg", f.bg), fText = col("frame-text", f.text), fBorder = col("frame-border", f.borderColor);
    const fName = col("frame-name", f.nameColor);
    block(MSG, [
      fBg && `background: ${fBg} !important`,
      fText && `color: ${fText} !important`,
      fBorder && `border: ${Number(f.borderWidth) || 1}px solid ${fBorder} !important`,
      (f.radius !== "" && f.radius != null && Number(f.radius) > 0) && `border-radius: ${Number(f.radius)}px !important`,
      Number(f.padding) > 0 && `padding: ${Number(f.padding)}px !important`,
      f.font && `font-family: '${cssUrl(f.font)}' !important`,
      Number(f.size) > 0 && `font-size: ${Number(f.size)}px !important`,
      shadow(f.shadow),
      fImg && `background-image: ${fImg} !important`,
      fImg && "background-size: cover !important",
      fImg && "background-position: center !important"
    ]);
    block(`${MSG} .message-sender`, [
      fName && `color: ${fName} !important`,
      f.nameFont && `font-family: '${cssUrl(f.nameFont)}' !important`
    ]);
    const ps = Math.max(16, Number(f.portraitSize) || 32);
    css += `${MSG} .sbe-msg-portrait { width: ${ps}px; height: ${ps}px; flex: 0 0 ${ps}px; }\n`;

    /* --- Carte --- */
    const kBg = col("card-bg", k.bg), kText = col("card-text", k.text), kBorder = col("card-border", k.borderColor);
    const kAccent = col("card-accent", k.accent), kTitle = col("card-title", k.titleColor);
    block(CARD, [
      kBg && `background: ${kBg}`,
      kText && `color: ${kText}`,
      kBorder && `border: ${Number(k.borderWidth) || 1}px solid ${kBorder}`,
      (k.radius !== "" && k.radius != null) && `border-radius: ${Number(k.radius) || 0}px`,
      kAccent && `--sbe-card-accent: ${kAccent}`,
      `--sbe-card-icon: ${Math.max(12, Number(k.iconSize) || 32)}px`
    ]);
    block(`${CARD} .sbe-card-title`, [
      kTitle && `color: ${kTitle}`,
      k.titleFont && `font-family: '${cssUrl(k.titleFont)}'`,
      Number(k.titleSize) > 0 && `font-size: ${Number(k.titleSize)}px`
    ]);

    /* --- Résultats --- */
    for (const o of OUTCOMES) {
      const r = c.outcomes?.[o] ?? {};
      const rc = col(`res-${o}`, r.color), rt = col(`res-${o}-text`, r.text);
      block(`${CARD} .sbe-card-result[data-outcome="${o}"]`, [
        rc && `--sbe-res: ${rc}`,
        rt && `--sbe-res-text: ${rt}`
      ]);
      /* Un critique peint aussi le total des dés de Foundry. */
      if (rc && (o === "critSuccess" || o === "critFailure")) {
        css += `${CARD}[data-outcome="${o}"] .sbe-card-dice-total { color: ${rc}; border-color: ${rc}; }\n`;
      }
    }

    /* --- Jets : apports et avantage --- */
    const rm = c.rolls?.mods ?? {}, ra = c.rolls?.adv ?? {};
    const mUp = col("mod-up", rm.up), mDown = col("mod-down", rm.down), mBg = col("mod-bg", rm.bg);
    block(`${CARD} .sbe-card-mods`, [
      mUp && `--sbe-mod-up: ${mUp}`,
      mDown && `--sbe-mod-down: ${mDown}`,
      mBg && `--sbe-mod-bg: ${mBg}`
    ]);
    if (rm.style === "text") css += `${CARD} .sbe-card-mod-v { border: none; padding: 0; background: none; min-width: 0; }\n`;
    if (rm.icons === false) css += `${CARD} .sbe-card-mod-ic { display: none; }\n`;
    if (rm.summary === false) css += `${CARD} .sbe-card-mods-sum { display: none; }\n`;
    const aAdv = col("adv", ra.advColor), aDis = col("dis", ra.disColor), aText = col("adv-text", ra.text);
    block(`${CARD} .sbe-card-dice-tag[data-adv="adv"]`, [aAdv && `--sbe-tag-bg: ${aAdv}`]);
    block(`${CARD} .sbe-card-dice-tag[data-adv="dis"]`, [aDis && `--sbe-tag-bg: ${aDis}`]);
    block(`${CARD} .sbe-card-dice-tag`, [aText && `--sbe-tag-text: ${aText}`]);
    if (ra.dropped === false) {
      css += `${CARD} .sbe-dd-dropped { display: none; }\n`;
      /* Plus rien à dérouler : ni flèche ni curseur. */
      css += `${CARD} .sbe-card-dice:has(.sbe-dd > .sbe-dd-dropped:only-child) > summary { cursor: default; pointer-events: none; }\n`;
      css += `${CARD} .sbe-card-dice:has(.sbe-dd > .sbe-dd-dropped:only-child) .sbe-card-dice-caret { visibility: hidden; }\n`;
    }

    /* --- Bouton « Lancer mon jet » --- */
    const rb = c.rolls?.button ?? {};
    const bBg = col("rbtn-bg", rb.bg), bText = col("rbtn-text", rb.text), bBorder = col("rbtn-border", rb.border);
    const bHBg = col("rbtn-hbg", rb.hoverBg), bHText = col("rbtn-htext", rb.hoverText);
    block(`${CARD} .sbe-rr-btn`, [
      bBg && `background: ${bBg}`,
      bText && `color: ${bText}`,
      bBorder && `border: 1px solid ${bBorder}`,
      (rb.radius !== "" && rb.radius != null) && `border-radius: ${Math.max(0, Number(rb.radius) || 0)}px`,
      Number(rb.size) > 0 && `font-size: ${Number(rb.size)}px`,
      rb.full && "width: 100%",
      rb.full && "justify-content: center"
    ]);
    block(`${CARD} .sbe-rr-btn:hover:not(:disabled)`, [
      bHBg && `background: ${bHBg}`,
      bHText && `color: ${bHText}`
    ]);

    /* --- Retouches par type : accent + CSS « & » --- */
    for (const t of Object.keys(c.types ?? {})) {
      const tc = c.types[t] ?? {};
      const sel = `${CARD}[data-card-type="${t}"]`;
      const ta = col(`type-${t}-accent`, tc.accent);
      block(sel, [
        ta && `--sbe-card-accent: ${ta}`,
        `--sbe-card-portrait: ${Math.max(16, Number(tc.portraitSize) || 36)}px`
      ]);
      if (tc.portrait === false) css += `${sel} .sbe-card-portrait { display: none; }\n`;
      /* 2 colonnes : option du MJ, jamais par défaut. */
      if (tc.layout === "columns") {
        /* Rangées PARTAGÉES par les deux côtés (sous-grille) : nom, texte,
           jet, suite. Les valeurs restent alignées quoi qu'il y ait
           au-dessus (couronne du gagnant, nom sur deux lignes, nom absent). */
        const sides = `${sel} .sbe-card-sides[data-count="2"]`;
        css += `${sides} { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); grid-template-rows: repeat(4, auto); row-gap: 0; align-items: start; }\n`;
        css += `${sides} > .sbe-card-side { display: grid; grid-row: 1 / span 4; grid-template-rows: subgrid; row-gap: 4px; }\n`;
        css += `${sides} > .sbe-card-side > .sbe-card-actor { grid-row: 1; }\n`;
        css += `${sides} > .sbe-card-side > .sbe-card-side-body { grid-row: 2; }\n`;
        css += `${sides} > .sbe-card-side > .sbe-card-roll { grid-row: 3; }\n`;
        css += `${sides} > .sbe-card-side > .sbe-card-side-after { grid-row: 4; }\n`;
        css += `${sides} > .sbe-card-vs { grid-row: 1 / span 4; grid-column: 2; align-self: center; }\n`;
        /* Portrait AU-DESSUS du nom : la colonne est étroite. */
        css += `${sides} .sbe-card-actor { flex-direction: column; text-align: center; gap: 3px; }\n`;
        const right = tc.attacker === "right";
        css += `${sides} > .sbe-card-side[data-role="attacker"] { grid-column: ${right ? 3 : 1}; }\n`;
        css += `${sides} > .sbe-card-side[data-role="defender"] { grid-column: ${right ? 1 : 3}; }\n`;
      }
      const own = String(tc.css ?? "").trim();
      if (own) css += `\n/* --- CSS du type « ${t} » --- */\n${this.#scopeAmp(own, sel)}\n`;
    }

    /* --- CSS avancé global --- */
    const custom = String(c.customCss ?? "").trim()
      .replace(/@(?:message|frame)\b/g, MSG)
      .replace(/@(?:carte|card)\b/g, CARD);
    if (custom) css += `\n/* --- CSS avancé des messages --- */\n${custom}\n`;

    /* Les deux thèmes, en tête de feuille. */
    let head = "";
    if (dark.length) head += `${DARK} {\n  ${dark.join(";\n  ")};\n}\n${LIGHT} {\n  ${light.join(";\n  ")};\n}\n`;
    return head + css;
  }

  /** « & » = la carte du type. Déclarations seules → posées sur la carte. */
  static #scopeAmp(src, sel) {
    if (!/[{}]/.test(src)) return `${sel} { ${src} }`;
    return src.replace(/&/g, sel);
  }

  /** Injecte (ou remplace) la feuille de style. */
  static apply(cfg = null) {
    const id = "sbe-chat-css";
    document.getElementById(id)?.remove();
    const css = this.buildCss(cfg);
    if (css) {
      const style = document.createElement("style");
      style.id = id;
      style.textContent = css;
      document.head.appendChild(style);
    }
    this.redecorateAll(cfg);
  }

  /* ============================================================ */
  /*  Branchements                                                 */
  /* ============================================================ */

  /**
   * Les journaux du chat (barre latérale, notifications, fenêtre détachée)
   * suivent le thème de l'interface du joueur — Foundry les force en clair.
   * Réglage du MJ « chatFollowTheme » ; décoché, on rend la main à Foundry.
   */
  static themeLogs() {
    let on = true;
    try { on = game.settings.get(SYSTEM_ID, "chatFollowTheme") !== false; } catch (_e) { /* pas encore enregistré */ }
    for (const ol of document.querySelectorAll("ol.chat-log")) {
      if (on) followInterfaceTheme(ol);
      else { unfollowInterfaceTheme(ol); ol.classList.remove("theme-dark"); ol.classList.add("theme-light"); }
    }
  }

  static init() {
    for (const h of ["renderChatLog", "renderChatPopout"]) Hooks.on(h, () => setTimeout(() => this.themeLogs(), 0));
    Hooks.once("ready", () => this.themeLogs());
    Hooks.on("renderChatMessageHTML", (message, html) => {
      try { this.decorate(message, html); }
      catch (err) { console.warn("SBE | Chat : habillage en échec", err); }
    });
    /* Son du résultat : joué chez chaque joueur qui VOIT la carte. */
    Hooks.on("createChatMessage", (message) => {
      try {
        const o = message.flags?.[SYSTEM_ID]?.outcome;
        if (!OUTCOMES.includes(o) || !message.visible || !message.isContentVisible) return;
        const snd = uiSoundOf(this.getConfig().outcomes?.[o]?.sound);
        if (snd.sound) UiSound.play(snd);
      } catch (err) { console.warn("SBE | Chat : son du résultat en échec", err); }
    });
  }
}
