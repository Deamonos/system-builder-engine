/**
 * SBE — Rendu et parcours de l'arbre d'éléments
 *
 * Module partagé entre l'ATELIER (feuille template) et la FICHE
 * (feuille objet). La structure est un ARBRE :
 * - cadre (frame)     : el.children[]                (repliable)
 * - colonnes (columns): el.cols[[]...]               (2 à 10)
 * - navigation (nav)  : el.children[] de kind "tab"
 * - onglet (tab)      : el.children[]
 * - les champs simples et la jauge sont des feuilles.
 *
 * Chaque élément porte playerVisible (défaut true). VISIBILITÉ
 * HIÉRARCHIQUE : un conteneur invisible cache tout son contenu.
 * Le MJ voit toujours tout (badge œil barré sur le masqué).
 *
 * STYLE (palier 4) : chaque élément porte un objet `style` rempli par
 * l'onglet Style de la fenêtre d'édition — couleurs/tailles du libellé
 * et de la valeur, fond, options par type (cadre, séparateur, jauge)
 * et CSS avancé libre (case à cocher + déclarations appliquées à
 * l'élément). Tout est appliqué en styles inline au rendu.
 *
 * Deux modes de rendu :
 * - "workshop" : aperçu inerte + outils ⠿ ✏ 🗑 + badges + « + » de
 *   chaque zone (data-parent / data-col pour cibler le conteneur) ;
 * - "sheet"    : entrées vivantes liées à system.values.<clé>.
 */

import { evalExpression, buildScope, extractIdentifiers } from "./formula-engine.mjs";
import { withMarks } from "./icon-marks.mjs";
import { withLookups } from "./lookup.mjs";
import { withCarried, carriedSources } from "./carried.mjs";
import { revision, memoOf } from "./data-revision.mjs";
import { diceIconHTML, diceIconSVG } from "../helpers/dice-icons.mjs";
import { spatialDims, spatialLayout, spatialBoardHTML, spatialArtHTML } from "./spatial.mjs";
import { treeViewHTML } from "./talents/talent-tree.mjs";
import { levelConfig, levelState } from "./levels/level-model.mjs";
import { shopWorkshopHTML, shopSheetHTML } from "./shop/shop-render.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

export const CONTAINER_KINDS = ["frame", "columns", "nav", "tab", "button", "chart", "level"];

/* Clé RÉSERVÉE de l'élément natif Quantité : réservée pour de bon,
   même quand l'élément n'est pas posé — une clé unique le reste. */
export const QUANTITY_KEY = "quantity";

/* FORMAT D'UNE CLÉ — une seule règle pour l'atelier, les colonnes de
   table et l'import : une lettre MINUSCULE pour commencer, puis
   minuscules sans accent, chiffres ou « _ ». Ni majuscule, ni accent,
   ni tiret : « Force » et « force » ne peuvent pas coexister, et toute
   clé se lit telle quelle dans une formule (« a-b » y serait une
   soustraction). */
export const KEY_RE = /^[a-z][a-z0-9_]*$/;

/* TOUS les types d'éléments que ce fichier sait dessiner. Miroir des
   « case » des deux switch (atelier et fiche) : c'est la liste de
   référence pour tout ce qui doit valider un type venu de l'extérieur
   (import de structure, notamment). */
export const ELEMENT_KIND_LIST = [
  "text", "richtext", "number", "checkbox", "color", "select", "image", "gauge",
  "chart", "html", "tags", "frame", "columns", "table", "nav", "tab",
  "separator", "button", "slot", "container", "quantity", "effects",
  "talents", "level", "actorImg", "actorName", "ref",
  "shopStall", "shopCash", "shopPurse", "shopSell", "shopSellList", "shopHistory"
];

/* ZONE « Panneau une fois posé » d'un modèle d'objet de scène : ses
   composants ne s'affichent que dans le panneau de l'objet posé, jamais
   sur la fiche. */
export const PANEL_ZONE = "panel";

/** Le composant qu'affiche un composant « Composant du modèle » (ou null). */
export function refTargetOf(el, rootList) {
  const key = String(el?.config?.refKey ?? "").trim();
  if (!key) return null;
  for (const e of walkElements(rootList)) {
    if (e?.key === key && e.kind !== "ref" && e !== el) return e;
  }
  return null;
}

/* ============================================================ */
/*  Parcours de l'arbre                                          */
/* ============================================================ */

/** Toutes les listes d'enfants directs d'un élément. */
export function childLists(el) {
  if (!el) return [];
  if (el.kind === "columns") return Array.isArray(el.cols) ? el.cols : [];
  if (CONTAINER_KINDS.includes(el.kind)) return Array.isArray(el.children) ? [el.children] : [];
  return [];
}

/** Générateur : tous les éléments de l'arbre (profondeur d'abord). */
export function* walkElements(list) {
  for (const el of (list ?? [])) {
    if (!el) continue;
    yield el;
    for (const sub of childLists(el)) yield* walkElements(sub);
  }
}

/**
 * Clés des contenants où un objet est ÉQUIPÉ : les slots (objets portés)
 * et les conteneurs cochés « Les objets rangés ici sont équipés »
 * (`config.equips`). Seule source pour savoir ce qui est équipé.
 */
export function equipKeys(list) {
  const out = new Set();
  for (const e of walkElements(list)) {
    if (!e?.key) continue;
    if (e.kind === "slot" && e.config?.mode !== "reference") out.add(e.key);
    else if (e.kind === "container" && e.config?.equips && e.config?.mode !== "reference") out.add(e.key);
  }
  return out;
}

/** Élément par id, où qu'il soit dans l'arbre. */
export function findById(rootList, id) {
  for (const el of walkElements(rootList)) if (el.id === id) return el;
  return null;
}

/** Liste contenant l'élément + son index : { list, index } ou null. */
export function findParentList(rootList, id) {
  const search = (list) => {
    for (let i = 0; i < list.length; i++) {
      const el = list[i];
      if (!el) continue;
      if (el.id === id) return { list, index: i };
      for (const sub of childLists(el)) {
        const r = search(sub);
        if (r) return r;
      }
    }
    return null;
  };
  return search(rootList ?? []);
}

/**
 * Liste cible d'un ajout : racine, enfants d'un conteneur, ou
 * colonne précise. Crée les tableaux manquants au besoin.
 */
export function getTargetList(rootList, { parentId = "", col = null } = {}) {
  if (!parentId) return rootList;
  const parent = findById(rootList, parentId);
  if (!parent) return rootList;
  if (parent.kind === "columns") {
    if (!Array.isArray(parent.cols)) parent.cols = [];
    const idx = Math.max(0, Number(col ?? 0));
    while (parent.cols.length <= idx) parent.cols.push([]);
    return parent.cols[idx];
  }
  if (!Array.isArray(parent.children)) parent.children = [];
  return parent.children;
}

/** Toutes les clés de l'arbre. */
export function allKeys(rootList) {
  const keys = [];
  for (const el of walkElements(rootList)) if (el.key) keys.push(el.key);
  return keys;
}

/** La clé est-elle prise par un AUTRE élément ? */
export function isKeyTaken(rootList, key, exceptId = null) {
  for (const el of walkElements(rootList)) {
    if (el.key === key && el.id !== exceptId) return true;
  }
  return false;
}

/* ============================================================ */
/*  Styles inline (onglet Style)                                 */
/* ============================================================ */

/** Nettoie des déclarations CSS libres (pas de balises ni blocs). */
function cleanCss(s) {
  return String(s ?? "").replace(/[<>{}]/g, "").trim();
}

/* ============================================================ */
/*  CSS AVANCÉ D'UN ÉLÉMENT — complet, sur l'élément lui-même    */
/* ============================================================ */
/*
 * Le champ « CSS avancé » d'un élément accepte :
 *   - des DÉCLARATIONS (« padding: 4px; ») → posées sur l'élément ;
 *   - des BLOCS, « & » désignant l'élément :
 *       &:hover { … }   & .sbe-slot-empty-text { … }   &::after { … }
 *       @media (…) { … }
 *   - des @keyframes / @property / @font-face → sortis dans la feuille
 *     globale (ElementCss), une fois.
 * Les blocs vivent dans UNE feuille générée ; l'élément y est désigné
 * par data-sbe-el="<clé>-<empreinte du CSS>" : deux modèles qui ont la
 * même clé avec un CSS différent ne se marchent pas dessus.
 */

/** Sépare déclarations et blocs : { decls, rules: [{prelude, body}] }. */
export function splitElementCss(src) {
  const css = String(src ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [];
  let decls = "";
  let i = 0, start = 0;
  while (i < css.length) {
    const ch = css[i];
    if (ch === "{") {
      /* Le prélude commence après la dernière déclaration (« ; ») ou bloc. */
      const before = css.slice(start, i);
      const cut = before.lastIndexOf(";");
      decls += cut >= 0 ? before.slice(0, cut + 1) : "";
      const prelude = (cut >= 0 ? before.slice(cut + 1) : before).trim();
      let depth = 1, j = i + 1;
      while (j < css.length && depth > 0) {
        if (css[j] === "{") depth++;
        else if (css[j] === "}") depth--;
        j++;
      }
      if (depth !== 0) break;                     /* bloc non fermé : ignoré */
      if (prelude) rules.push({ prelude, body: css.slice(i + 1, j - 1).trim() });
      i = j; start = j;
      continue;
    }
    if (ch === "}") { start = i + 1; }          /* accolade orpheline : ignorée */
    i++;
  }
  decls += css.slice(start);
  return { decls: cleanCss(decls), rules };
}

/** Empreinte courte et stable d'une chaîne. */
function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Identifiant de ciblage d'un élément à blocs CSS (ou "" s'il n'en a pas). */
export function elCssId(el) {
  const st = el?.style ?? {};
  if (!st.customOn || !String(st.custom ?? "").includes("{")) return "";
  const base = String(el.key || el.kind || "el").replace(/[^\p{L}\p{N}_-]/gu, "");
  return `${base}-${hashStr(String(st.custom))}`;
}

/** Déclarations inline du CSS avancé (+ repère de ciblage si blocs). */
function customInline(el) {
  const st = el?.style ?? {};
  if (!st.customOn || !st.custom) return "";
  const id = elCssId(el);
  const decls = id ? splitElementCss(st.custom).decls : cleanCss(st.custom);
  return `${decls}${id ? `/*sbe-el:${id}*/` : ""}`;
}

/** Repères → attribut data-sbe-el sur le nœud qui porte le style. */
function markCssTargets(html) {
  return html.replace(/style="([^"]*?)\/\*sbe-el:([\p{L}\p{N}_-]+)\*\/([^"]*)"/gu,
    (_m, a, id, b) => `data-sbe-el="${id}" style="${a}${b}"`);
}

/** Nettoie un chemin destiné à url('…'). */
function cleanUrl(s) {
  return String(s ?? "").replace(/['"<>()]/g, "").trim();
}

const IMG_TYPES = new Set(["image", "actorImg"]);

/**
 * Bordure choisie dans l'onglet Style. Une épaisseur de 0 SAISIE
 * signifie « aucune bordure » (et non « valeur par défaut ») ;
 * rien de saisi = on laisse l'habillage de base.
 */
function borderDecl(st) {
  const raw = st?.borderWidth;
  const hasW = raw !== undefined && raw !== null && raw !== "";
  if (hasW && Number(raw) <= 0) return "border:none";
  if (!hasW && !st?.borderColor) return "";
  const w = hasW ? Number(raw) : 1;
  return `border:${w}px solid ${st.borderColor || "var(--sbe-tone-3)"}`;
}

/**
 * Chemin d'une TEXTURE DE FOND, résolu contre la fiche.
 * Le créateur peut y écrire une clé — « {{silhouette}} » — ou un
 * chemin qui en contient une. La valeur de la clé étant elle-même un
 * chemin (cf. images nommées), un fond peut ainsi suivre le choix du
 * joueur ou l'état du personnage, avec UN SEUL jeu d'enfants dans le
 * cadre. Dans l'atelier, sans fiche pour résoudre, on n'affiche rien
 * plutôt qu'une URL cassée.
 */
function resolveBgTexture(raw, scope) {
  const src = String(raw ?? "").trim();
  if (!src) return "";
  if (!src.includes("{{")) return src;
  if (!scope) return "";
  const out = interpolateHtml(src, scope).replace(/&amp;/g, "&").trim();
  return (!out || out.includes("—")) ? "" : out;
}

/**
 * Décompose el.style en styles inline prêts à poser :
 * { wrap, label, value } (chaînes "prop:val;…").
 */
export function styleParts(el, scope = null) {
  const st = el.style ?? {};
  const label = [];
  if (st.labelColor) label.push(`color:${st.labelColor}`);
  if (st.labelSize) label.push(`font-size:${Number(st.labelSize)}px`);
  if (st.labelFont) label.push(`font-family:'${cleanUrl(st.labelFont)}'`);
  if (st.labelBold) label.push("font-weight:700");
  if (st.labelItalic) label.push("font-style:italic");
  if (st.labelUpper) label.push("text-transform:uppercase", "letter-spacing:.05em");
  const value = [];
  if (st.valueColor) value.push(`color:${st.valueColor}`);
  if (st.valueSize) value.push(`font-size:${Number(st.valueSize)}px`);
  const wrap = [];
  if (st.noBg) wrap.push("background:transparent");
  else if (st.bgColor) wrap.push(`background-color:${st.bgColor}`);
  const wrapTex = st.noBg ? "" : resolveBgTexture(st.bgTexture, scope);
  if (wrapTex) {
    wrap.push(`background-image:url('${cleanUrl(wrapTex)}')`);
    wrap.push("background-size:cover", "background-position:center");
  }
  /* Image : la bordure habille l'IMAGE (la boîte visible), pas le champ. */
  const bd = borderDecl(st);
  if (bd && !IMG_TYPES.has(el.kind)) wrap.push(bd);
  if (st.corners === "soft") wrap.push("border-radius:6px");
  else if (st.corners === "strong") wrap.push("border-radius:16px");
  else if (st.corners === "none") wrap.push("border-radius:0");
  if (st.customOn && st.custom) wrap.push(customInline(el));
  return {
    wrap: wrap.join(";"),
    label: label.join(";"),
    value: value.join(";")
  };
}

/** Styles inline du cadre : bord/fond + bandeau. */
function frameStyles(el, scope = null) {
  const st = el.style ?? {};
  const box = [];
  const bd = borderDecl(st);
  if (bd) box.push(bd);
  if (st.corners === "soft") box.push("border-radius:6px", "overflow:hidden");
  else if (st.corners === "strong") box.push("border-radius:16px", "overflow:hidden");
  else if (st.corners === "none") box.push("border-radius:0");
  if (st.noBg) box.push("background:transparent");
  else if (st.bgColor) box.push(`background-color:${st.bgColor}`);
  const boxTex = st.noBg ? "" : resolveBgTexture(st.bgTexture, scope);
  if (boxTex) {
    box.push(`background-image:url('${cleanUrl(boxTex)}')`);
    box.push("background-size:cover", "background-position:center");
  }
  if (st.customOn && st.custom) box.push(customInline(el));
  const head = [];
  if (st.corners === "none") head.push("border-radius:0");
  if (st.headerBg) head.push(`background:${st.headerBg}`);
  /* Libellé du bandeau : couleur/police/graisse/italique du groupe
     « Libellé » de l'onglet Style s'appliquent bien au cadre. */
  const headColor = st.labelColor || st.headerColor;
  if (headColor) head.push(`color:${headColor}`);
  if (st.labelSize) head.push(`font-size:${Number(st.labelSize)}px`);
  if (st.labelFont) head.push(`font-family:'${cleanUrl(st.labelFont)}'`);
  if (st.labelBold) head.push("font-weight:700");
  if (st.labelItalic) head.push("font-style:italic");
  if (st.labelUpper) head.push("text-transform:uppercase", "letter-spacing:.05em");
  if (st.borderColor) head.push(`border-bottom-color:${st.borderColor}`);
  /* Alignement : position du libellé (Style), puis position de la
     flèche (config) qui a le dernier mot si elle est définie. */
  const lp = st.labelPos ?? "";
  if (lp.endsWith("-center")) head.push("justify-content:center");
  else if (lp.endsWith("-right")) head.push("justify-content:flex-end");
  const cp = el.config?.caretPos;
  if (cp === "center") head.push("justify-content:center");
  else if (cp === "right") head.push("justify-content:flex-end");
  return { box: box.join(";"), head: head.join(";") };
}

/** Options d'un texte riche (fiche et atelier : même rendu). */
export function richOpts(el) {
  const c = el?.config ?? {};
  const h = Math.max(0, Math.floor(Number(c.minHeight) || 0));
  return {
    open: c.editor === "open",
    cls: `${c.paper === "lined" ? " sbe-rich--lined" : ""}${c.editor === "open" ? " sbe-rich--open" : ""}`,
    css: h ? `--sbe-rich-h:${h}px;` : ""
  };
}

/** Style d'en-tête (fond/texte) : cadres, tables, textes riches. */
function headerStyles(el) {
  const st = el.style ?? {};
  return `${st.headerBg ? `background:${st.headerBg};` : ""}${st.headerColor ? `color:${st.headerColor};` : ""}`;
}

/** Position du libellé (Style) : side-left par défaut. */
function labelPos(el) {
  return el.style?.labelPos || "side-left";
}
function labelAlign(pos) {
  return pos.endsWith("-center") ? "center" : (pos.endsWith("-right") ? "right" : "left");
}

/* ============================================================ */
/*  Rendu — briques communes                                     */
/* ============================================================ */

/** Mise en page d'une barre de navigation : orientation + alignement. */
function navLayout(el) {
  const c = el.config ?? {};
  const vertical = c.orient === "v";
  const right = c.side === "right";
  const align = ["center", "right"].includes(c.align) ? c.align : "left";
  return {
    vertical,
    wrapCls: vertical ? `sbe-nav-wrap sbe-nav-wrap--v${right ? " sbe-nav-wrap--right" : ""}` : "",
    barCls: vertical ? " sbe-navbar--v" : (align === "left" ? "" : ` sbe-navbar--${align}`)
  };
}

/** Icône optionnelle d'un onglet : classe FontAwesome OU chemin d'image. */
function tabIcon(t) {
  const icon = String(t.config?.icon ?? "").trim();
  if (!icon) return "";
  if (icon.includes("fa-")) return `<i class="${esc(icon)} sbe-navtab-ico"></i>`;
  return `<img class="sbe-navtab-ico" src="${esc(cleanUrl(icon))}" alt="">`;
}

/** Info-bulle optionnelle d'un onglet (tooltip natif Foundry). */
function tabTooltip(t) {
  const tt = String(t.config?.tooltip ?? "").trim();
  return tt ? ` data-tooltip="${esc(tt)}"` : "";
}

/** Largeur bornée d'un champ texte/nombre (option du crayon). */
function fieldWidth(el) {
  const w = Number(el.config?.width);
  return w > 0 ? `width:${w}px;max-width:${w}px;flex:0 0 auto;justify-self:start;` : "";
}

/** Colonnes du grid : largeurs % personnalisées ou parts égales. */
function colsTemplate(el, count) {
  const ws = el.config?.widths;
  if (Array.isArray(ws) && ws.length === count && ws.some(w => Number(w) > 0)) {
    return ws.map(w => `${Math.max(1, Number(w) || 1)}fr`).join(" ");
  }
  return `repeat(${count},1fr)`;
}

function addBar(parentId = "", col = null, small = true, pos = "end") {
  const colAttr = col === null ? "" : `data-col="${col}"`;
  return `
    <div class="sbe-tpl-addbar">
      <button type="button" class="sbe-tpl-plus ${small ? "sbe-tpl-plus--small" : ""}" data-pos="${pos}"
              data-action="addElement" data-parent="${esc(parentId)}" ${colAttr}
              title="${game.i18n.localize("SBE.Template.AddElTitle")}">+</button>
    </div>`;
}

/** Éléments NATIFS Foundry (portrait/icône + nom) : indestructibles,
    sans clé ni libellé — ils vivent dans l'en-tête des fiches de
    personnage et pointent img/name du document. */
export function isNativeKind(kind) {
  return kind === "actorImg" || kind === "actorName";
}

/**
 * Style inline des éléments natifs de l'en-tête, depuis
 * system.nativeUi du modèle. Portrait : taille + onglet Style ;
 * les habillages avancés (polaroïd, inclinaison…) passent par le
 * CSS avancé du thème du modèle.
 */
export function nativeUiParts(which, entry) {
  /* Pseudo-élément natif : son CSS avancé à blocs est ciblé comme celui
     des autres (data-sbe-el), qu'il soit dans l'arbre ou dans l'en-tête. */
  const pseudo = { kind: which === "img" ? "actorImg" : "actorName", style: entry?.style ?? {} };
  const sp = styleParts(pseudo);
  const cssId = elCssId(pseudo);
  if (which === "img") {
    const c = entry?.config ?? {};
    return {
      css: `${c.width ? `width:${Number(c.width)}px;` : ""}${c.height ? `height:${Number(c.height)}px;` : ""}${sp.wrap}`,
      cls: "", cssId
    };
  }
  return { css: `${sp.value}${sp.wrap}`, cls: "", cssId };
}

function tools(el, extra = "") {
  const native = isNativeKind(el.kind);
  const delTitle = native
    ? game.i18n.localize("SBE.Native.ReturnHeaderTitle")
    : game.i18n.localize("SBE.Template.DeleteElTitle");
  const delIcon = native ? "fa-arrow-turn-up" : "fa-trash";
  const keyBadge = native
    ? `<span class="sbe-tpl-el-key sbe-tpl-el-key--native">${game.i18n.localize("SBE.Native.Badge")}</span>`
    : `<span class="sbe-tpl-el-key">${esc(el.key)}</span>`;
  /* La clé vit DANS la barre, en premier : une seule boîte, aucune
     collision possible quand la barre gagne des boutons (plans des
     zones libres). Deux boîtes positionnées séparément finissaient
     toujours par se recouvrir quelque part. */
  return `
    <span class="sbe-tpl-tools">
      ${keyBadge}${extra}<span class="sbe-tpl-drag" title="${game.i18n.localize("SBE.Template.DragHint")}">⠿</span>
      <a data-action="editElement" title="${game.i18n.localize("SBE.Template.EditElTitle")}"><i class="fa-solid fa-pen"></i></a>
      <a data-action="deleteElement" title="${delTitle}"><i class="fa-solid ${delIcon}"></i></a>
    </span>`;
}

/** Icône de libellé (crayon → « Icône du libellé ») : classe fa-…,
    émoji/texte, ou chemin d'image. Rendu HTML — pour les textes SVG
    des graphiques, seuls les émojis passent (voir chartIconSVG). */
export function labelIconHTML(el) {
  const ic = String(el?.config?.labelIcon ?? "").trim();
  if (!ic) return "";
  if (ic.includes("fa-")) {
    const cls = ic.includes("fa-solid") || ic.includes("fa-regular") || ic.includes("fa-brands")
      ? ic : `fa-solid ${ic}`;
    return `<i class="sbe-label-icon ${esc(cls)}"></i> `;
  }
  if (ic.includes("/") || /\.(png|jpe?g|webp|svg|gif)$/i.test(ic)) {
    return `<img class="sbe-label-icon-img" src="${esc(cleanUrl(ic))}" alt=""> `;
  }
  return `<span class="sbe-label-icon">${esc(ic)}</span> `;
}

/**
 * En-tête d'info-bulle d'un élément : son libellé, son icône, ou les
 * deux. Rien de renseigné → un simple tiret (repère visuel).
 */
export function ttHeadHTML(el) {
  const lab = String(el?.label ?? "").trim();
  const head = [lab ? esc(lab) : "", labelIconHTML(el).trim()].filter(Boolean).join(" ");
  return head || "-";
}

/**
 * Texte d'info-bulle proposé PAR DÉFAUT dans l'atelier : il montre la
 * façon d'écrire (gras + interpolation) plutôt que de laisser la zone
 * vide devant le créateur.
 */
export function ttSnippetFor(el) {
  const k = String(el?.key ?? "").trim() || "cle";
  /* Nombre saisi : la valeur interpolée est le TOTAL ; la bulle
     ajoute d'elle-même la ligne « Base » en dessous. */
  if (el?.kind === "number" && !el.config?.computed) return `<b>${ttHeadHTML(el)}</b> ${game.i18n.localize("SBE.Tooltip.Total")} : {{${k}}}`;
  return `<b>${ttHeadHTML(el)}</b> : {{${k}}}`;
}

function hiddenBadge(el) {
  let b = "";
  if (el.playerVisible === false) {
    b += `<i class="fa-solid fa-eye-slash sbe-tpl-hidden-badge" title="${game.i18n.localize("SBE.Template.HiddenFromPlayers")}"></i>`;
  }
  /* Masqué sur la FICHE (même MJ) : clé de calcul invisible. */
  if (el.sheetHidden) {
    b += `<i class="fa-solid fa-ghost sbe-tpl-hidden-badge" title="${game.i18n.localize("SBE.Template.SheetHiddenBadge")}"></i>`;
  }
  /* Affichage CONDITIONNEL : visible dans l'atelier, la condition en
     info-bulle — sinon on cherche longtemps pourquoi un bloc a disparu
     de la fiche. */
  if (String(el.visibleIf ?? "").trim()) {
    b += `<i class="fa-solid fa-code-branch sbe-tpl-hidden-badge" title="${esc(game.i18n.format("SBE.Template.VisibleIfBadge", { expr: el.visibleIf }))}"></i>`;
  }
  return b;
}

/** Séparateur : trait (couleur/épaisseur stylables), ou image pleine largeur. */
function separatorHTML(el) {
  const img = el.config?.image;
  if (img) {
    const h = el.config?.height ? `height:${Number(el.config.height)}px;` : "";
    return `<img class="sbe-separator-img" src="${esc(img)}" style="${h}" alt="">`;
  }
  const st = el.style ?? {};
  const color = st.sepColor ? `border-top-color:${st.sepColor};` : "";
  const thick = st.sepThickness ? `border-top-width:${Number(st.sepThickness)}px;` : "";
  return `<hr class="sbe-separator" style="${color}${thick}">`;
}

/* ============================================================ */
/*  Jauge                                                        */
/* ============================================================ */

/* Ce que fait un effet : [{ text, dir }] (dir = is-up / is-down). */
function doesOf(e) {
  if (Array.isArray(e.doesList)) return e.doesList;
  return e.does ? [{ text: e.does, dir: "" }] : [];
}

/**
 * LISTE DES EFFETS ACTIFS du personnage (élément « Effets actifs ») :
 * icône, nom (avec ×N), temps restant. Vide → la mention « aucun ».
 * La liste vient de la fiche (opts.activeEffects), le moteur de rendu
 * ne connaît pas le gestionnaire d'effets.
 */
function effectsListHTML(el, list, workshop) {
  const sp = styleParts(el);
  const title = el.label
    ? `<div class="sbe-fxlist-title" style="${sp.label}">${labelIconHTML(el)}${esc(el.label)}</div>` : "";
  if (!list.length) {
    return `<div class="sbe-fxlist">${title}<div class="sbe-fxlist-none" style="${sp.value}">${esc(game.i18n.localize("SBE.Effects.ListNone"))}</div></div>`;
  }
  const rows = list.map(e => `
    <div class="sbe-fxlist-row"${e.description ? ` data-tooltip-text="${esc(e.description)}"` : ""}>
      <span class="sbe-fxlist-ico"><img src="${esc(e.icon)}" alt="">${e.stacks > 1 ? `<b class="sbe-fxlist-stack">${e.stacks}</b>` : ""}</span>
      <div class="sbe-fxlist-text">
        <span class="sbe-fxlist-name" style="${sp.value}">${esc(e.label)}</span>
        ${(doesOf(e).length || e.left) ? `<span class="sbe-fxlist-sub">${doesOf(e).map(d => `<span class="sbe-fxlist-does ${d.dir}">${esc(d.text)}</span>`).join("")}${e.left ? `<span class="sbe-fxlist-left" style="${sp.value}"><i class="fa-solid fa-hourglass-half"></i> ${esc(e.left)}</span>` : ""}</span>` : ""}
      </div>
      ${e.canRemove ? `<a class="sbe-fxlist-del" data-fx-id="${esc(e.id)}" data-tooltip-text="${esc(game.i18n.localize("SBE.Effects.ListRemove"))}"><i class="fa-solid fa-xmark"></i></a>` : ""}
    </div>`).join("");
  return `<div class="sbe-fxlist${workshop ? " is-sample" : ""}">${title}${rows}</div>`;
}

/**
 * DÉTAIL DES APPORTS d'une clé (effets…), pour le survol : la base,
 * chaque source nommée avec son montant coloré, puis le total.
 * Renvoie { attr, cls } — attribut d'info-bulle et classe de couleur
 * (hausse / baisse nette) — ou des chaînes vides si rien ne s'applique.
 */
export function contribTooltip(bd) {
  if (!bd?.lines?.length) return { attr: "", cls: "" };
  const L = (k) => game.i18n.localize(k);
  const net = Number(bd.total) - Number(bd.base);
  const lines = bd.lines.map(l => {
    const dir = l.delta > 0 ? "is-up" : (l.delta < 0 ? "is-down" : "");
    return `<div class="sbe-contrib-line ${dir}">${l.img ? `<img src="${esc(l.img)}" alt="">` : ""}<span>${esc(l.label)}</span><span class="sbe-contrib-val">${esc(l.text)}</span></div>`;
  }).join("");
  const html = `<div class="sbe-contrib-tt">
    <div class="sbe-contrib-line"><span>${L("SBE.Effects.TtBase")}</span><span class="sbe-contrib-val">${esc(String(bd.base))}</span></div>
    ${lines}
    <div class="sbe-contrib-line sbe-contrib-total"><span>${L("SBE.Effects.TtTotal")}</span><span class="sbe-contrib-val">${esc(String(bd.total))}</span></div>
  </div>`;
  return {
    attr: ` data-tooltip-html="${esc(html)}"`,
    cls: net > 0 ? " sbe-num2--up" : (net < 0 ? " sbe-num2--down" : "")
  };
}

/**
 * Bornes d'un champ à valeur (jauge ou nombre), telles que la fiche
 * les applique : jauge = min/max du modèle + sous-clés « clé_min » /
 * « clé_max » ; nombre = min/max du modèle s'ils sont posés. Une seule
 * lecture des bornes pour tout ce qui écrit une valeur hors de la
 * fiche (nouvelle journée, effets périodiques…).
 * @returns {{min:number, max:number}} (±Infinity si non borné)
 */
export function valueBounds(el, values = {}) {
  const c = el?.config ?? {};
  if (el?.kind === "gauge") {
    return {
      min: (Number(c.min ?? 0) || 0) + (Number(values?.[`${el.key}_min`]) || 0),
      max: gaugeBaseMax(el, values) + (Number(values?.[`${el.key}_max`]) || 0)
    };
  }
  const has = (v) => v !== undefined && v !== null && v !== "" && Number.isFinite(Number(v));
  if (el?.kind === "number") {
    /* Nombre borné comme une jauge : maximum saisi OU en formule, et
       sous-clés « clé_min » / « clé_max » qui s'y ajoutent. */
    const mx = numberBaseMax(el, values);
    return {
      min: has(c.min) ? Number(c.min) + (Number(values?.[`${el.key}_min`]) || 0) : -Infinity,
      max: mx !== null ? mx + (Number(values?.[`${el.key}_max`]) || 0) : Infinity
    };
  }
  return {
    min: has(c.min) ? Number(c.min) : -Infinity,
    max: has(c.max) ? Number(c.max) : Infinity
  };
}

/** Maximum DE BASE d'un nombre (saisi ou en formule), ou null s'il n'en a pas. */
export function numberBaseMax(el, scope = {}) {
  const c = el?.config ?? {};
  const f = String(c.maxFormula ?? "").trim();
  if (f && scope && Object.keys(scope).length) {
    const v = Number(evalExpression(f, scope ?? {}));
    if (Number.isFinite(v)) return v;
  }
  const m = Number(c.max);
  return (c.max === undefined || c.max === null || c.max === "" || !Number.isFinite(m)) ? null : m;
}

/**
 * Maximum DE BASE d'une jauge : un nombre (défaut 100, 0 permis), ou
 * une FORMULE lue sur la fiche (« ceil((force + con) / 4) ») — la
 * capacité de charge suit alors les attributs.
 */
export function gaugeBaseMax(el, scope = {}) {
  const c = el?.config ?? {};
  const f = String(c.maxFormula ?? "").trim();
  /* Sans fiche (aperçu de l'atelier), la formule n'a rien à lire : on
     montre le maximum saisi. */
  if (f && scope && Object.keys(scope).length) {
    const v = Number(evalExpression(f, scope ?? {}));
    return Number.isFinite(v) ? v : 0;
  }
  const m = Number(c.max);
  return (c.max === undefined || c.max === null || c.max === "" || !Number.isFinite(m)) ? 100 : m;
}

/**
 * Rendu complet de la jauge : valeur/max, seuils bas/haut (couleur du
 * remplissage selon la zone), forme, épaisseur, couleurs, texture,
 * texte (rien / valeur / valeur-max / %). `input:true` ajoute le champ
 * de saisie lié (fiche objet).
 */
function gaugeHTML(el, rawVal, { input = false, locked = false, minMod = 0, maxMod = 0, lowMod = 0, highMod = 0, scope = null, temp = 0 } = {}) {
  const c = el.config ?? {};
  const st = el.style ?? {};
  /* Bornes dynamiques : sous-clés « clé_min » / « clé_max » (additives). */
  const min = (Number(c.min ?? 0) || 0) + (Number(minMod) || 0);
  const max = gaugeBaseMax(el, scope ?? {}) + (Number(maxMod) || 0);
  const range = (max - min) || 1;
  let v = Number(rawVal ?? c.default ?? min);
  if (!Number.isFinite(v)) v = min;
  /* Saisie : jamais au-delà des bornes effectives (un max qui baisse —
     constitution perdue — ramène l'affichage). Une jauge CALCULÉE peut
     dépasser : c'est une information (surcharge). */
  if (!c.computed) v = Math.min(Math.max(v, min), max);
  /* POINTS TEMPORAIRES (sous-clé « clé_temp ») : la barre s'étire sur
     (plage + temporaires) pour qu'ils restent visibles même jauge
     pleine — comme sur la barre du pion. */
  const tempOn = !!c.temp?.on && !c.computed;
  const tv = tempOn ? Math.max(0, Number(temp) || 0) : 0;
  const pct = Math.max(0, Math.min(100, ((v - min) / range) * 100));
  const scale = range + tv;
  const barPct = tv ? Math.max(0, Math.min(100, ((v - min) / scale) * 100)) : pct;
  const tempPct = tv ? Math.max(0, Math.min(100 - barPct, (tv / scale) * 100)) : 0;

  /* Seuils (%) dynamiques : sous-clés « clé_bas » / « clé_haut ». */
  const low = Math.min(100, Math.max(0, Number(c.low ?? 25) + (Number(lowMod) || 0)));
  const high = Math.min(100, Math.max(0, Number(c.high ?? 75) + (Number(highMod) || 0)));
  let fill = st.gFill || "var(--sbe-accent)";
  /* Troisième seuil, facultatif : la zone CRITIQUE (au-dessus du seuil
     haut — surcharge, folie, alerte…). Vide = pas de zone critique. */
  const critRaw = c.crit;
  const crit = critRaw === undefined || critRaw === null || String(critRaw).trim() === "" ? null
    : Math.min(100, Math.max(0, Number(critRaw)));
  if (pct <= low) fill = st.gLow || "var(--sbe-fail)";
  else if (crit !== null && pct >= crit) fill = st.gCrit || "var(--sbe-fail)";
  else if (pct >= high) fill = st.gHigh || st.gFill || "var(--sbe-ok)";

  const h = Number(st.gHeight ?? 14);
  const radius = st.gShape === "flat" ? "0" : (st.gShape === "pill" ? `${h}px` : "4px");
  const bg = st.gBg || "var(--sbe-surf-1)";
  const border = st.gBorder ? `border:1px solid ${st.gBorder};` : "border:1px solid var(--sbe-tone-3);";
  const tex = st.gTexture ? `background-image:url('${esc(st.gTexture)}');background-size:cover;background-position:center;` : "";

  /* Valeur CALCULÉE : rien à saisir. */
  const inputHtml = (input && !c.computed)
    ? `<input type="number" class="sbe-gauge-input" name="system.values.${esc(el.key)}"
              value="${v}" min="${min}" max="${max}" step="1" ${locked ? "disabled" : ""}>`
    : "";

  /* Texte. Avec une saisie, la valeur EST la saisie : on ne la répète
     pas à côté (« 27 / 100  [27] ») — « Valeur / max » devient
     « [27] / 100 », « Valeur » se résume à la saisie. */
  let text = "";
  const mode = c.text ?? "valueMax";
  /* Temporaires : leur propre case (mêmes droits que la jauge), sinon
     « (+5) » en texte. */
  const tempHtml = !tempOn ? ""
    : (input
      ? `<span class="sbe-gauge-temp-box" title="${esc(game.i18n.localize("SBE.Temp.Label"))}">+<input type="number" class="sbe-gauge-temp-input"
            name="system.values.${esc(el.key)}_temp" value="${tv}" min="0" step="1" ${locked ? "disabled" : ""}></span>`
      : (tv ? `<span class="sbe-gauge-temp-text">(+${tv})</span>` : ""));
  if (mode === "value") text = inputHtml ? "" : String(v);
  else if (mode === "valueMax") text = inputHtml ? `/ ${max}` : `${v} / ${max}`;
  else if (mode === "percent") text = `${Math.round(pct)}%`;

  /* AFFICHAGE EN PICTOS (faim, fatigue…) : une icône par point, pleine
     jusqu'à la valeur, éteinte au-delà. Un clic fixe la valeur (si le
     champ est modifiable) ; recliquer le dernier point plein le vide. */
  if (c.display === "pips") {
    const n = Math.max(0, Math.min(30, Math.round(max - min)));
    const filled = Math.round(v - min);
    const icon = esc(String(c.pipIcon || "fa-solid fa-circle"));
    const clickable = input && !locked && !c.computed;
    let pips = "";
    for (let i = 1; i <= n; i++) {
      const on = i <= filled;
      pips += `<i class="${icon} sbe-pip${on ? " is-on" : ""}"${clickable
        ? ` data-action="setPip" data-key="${esc(el.key)}" data-value="${min + (i === filled ? i - 1 : i)}"` : ""}></i>`;
    }
    const pfill = st.gFill || "var(--sbe-accent)";
    return `<div class="sbe-gauge sbe-gauge--pips" style="--sbe-pip-on:${esc(pfill)};--sbe-pip-off:${esc(st.gBg || "var(--sbe-tone-3)")}">
      <span class="sbe-pips">${pips}</span>
      ${text ? `<span class="sbe-gauge-text">${esc(text)}</span>` : ""}
    </div>`;
  }

  const tvars = (st.gTempD ? `--sbe-gtemp-d:${esc(st.gTempD)};` : "") + (st.gTempL ? `--sbe-gtemp-l:${esc(st.gTempL)};` : "");
  return `
    <div class="sbe-gauge${tempOn ? " sbe-gauge--temp" : ""}"${tvars ? ` style="${tvars}"` : ""}>
      <div class="sbe-gauge-bar" style="height:${h}px;border-radius:${radius};background:${bg};${border}">
        <i style="width:${barPct}%;background:${fill};${tex}border-radius:${radius};"></i>
        ${tempPct ? `<i class="sbe-gauge-temp" style="left:${barPct}%;width:${tempPct}%;border-radius:${radius};"></i>` : ""}
      </div>
      ${(inputHtml || tempHtml || text) ? `<span class="sbe-gauge-vals">${inputHtml}${tempHtml}${text ? `<span class="sbe-gauge-text">${esc(text)}</span>` : ""}</span>` : ""}
    </div>`;
}

/* ============================================================ */
/*  Élément GRAPHIQUE — radar, courbe, barres, colonnes,         */
/*  camembert. SVG/HTML généré au rendu, données lues dans les   */
/*  clés de la fiche (champs calculés compris) : tout est LIVE.  */
/* ============================================================ */

const CHART_PALETTE = [
  "#b5471f", "#4a6d7c", "#8a7a2f", "#6b4a7c", "#3f7a55", "#a3552f",
  "#5a5a8a", "#7c4a4a", "#4a7c6d", "#8a6a3f", "#98652d", "#556270"
];

/** Lignes de données d'un graphique : ses ENFANTS d'abord (champs
    déplacés dedans — libellé/couleur pris sur le champ, surchargés
    par la liste du crayon), puis les lignes tapées à la main dont la
    clé n'est pas déjà couverte. */
export function chartAxesOf(el) {
  const kids = (Array.isArray(el.children) ? el.children : [])
    .filter(k => ["number", "gauge"].includes(k?.kind) && k.key);
  const manual = Array.isArray(el.config?.axes) ? el.config.axes : [];
  const seen = new Set(kids.map(k => k.key));
  const fromKids = kids.map(k => {
    const ov = manual.find(a => a.key === k.key);
    const icon = String(k.config?.labelIcon ?? "").trim() || null;
    return {
      key: k.key,
      label: (ov?.label && ov.label !== k.key) ? ov.label : (k.label || k.key),
      color: ov?.color || k.style?.valueColor || "",
      icon,
      /* Pas de libellé saisi + icône → l'icône REMPLACE le nom. */
      iconOnly: !!icon && !k.label
    };
  });
  return fromKids.concat(manual.filter(a => a.key && !seen.has(a.key)));
}

/** Données du graphe : une entrée par branche, valeurs résolues. */
function chartData(el, resolve) {
  const axes = chartAxesOf(el);
  return axes.map((a, i) => ({
    key: a.key,
    icon: a.icon ?? null,
    iconOnly: a.iconOnly ?? false,
    label: String(a.label ?? a.key ?? ""),
    value: Math.max(0, Number(resolve(a.key)) || 0),
    /* Valeur SIGNÉE (la cascade accepte les négatifs). */
    raw: Number(resolve(a.key)) || 0,
    /* 3e champ de la ligne : couleur — ou ICÔNE pour les pictogrammes. */
    color: cleanUrl(a.color || "") || null,
    i
  }));
}

/** Bornes déclarées d'une clé (champ nombre min/max, jauge min→max). */
function keyBounds(elements, key) {
  if (!elements || !key) return null;
  for (const e of walkElements(elements)) {
    if (e?.key !== key) continue;
    const c = e.config ?? {};
    if (e.kind === "number") {
      return {
        min: c.min !== undefined ? Number(c.min) : null,
        max: c.max !== undefined ? Number(c.max) : null
      };
    }
    if (e.kind === "gauge") return { min: Number(c.min ?? 0), max: Number(c.max ?? 100) };
    return null;
  }
  return null;
}

/** Échelle du graphe — trois niveaux :
    1. Min/Max FORCÉS dans le crayon du graphique ;
    2. sinon, bornes DÉCLARÉES des champs référencés (min/max des
       champs nombre, min→max des jauges) ;
    3. sinon, adaptation aux valeurs (arrondi au pas au-dessus). */
function chartRange(el, data, opts = {}) {
  const c = el.config ?? {};
  let lo = (c.min !== undefined && Number.isFinite(Number(c.min))) ? Number(c.min) : null;
  let hi = (c.max !== undefined && Number.isFinite(Number(c.max))) ? Number(c.max) : null;
  if (lo === null || hi === null) {
    let bmin = null, bmax = null;
    for (const a of (Array.isArray(c.axes) ? c.axes : [])) {
      const b = keyBounds(opts.elements, a.key);
      if (!b) continue;
      if (b.min !== null && Number.isFinite(b.min)) bmin = bmin === null ? b.min : Math.min(bmin, b.min);
      if (b.max !== null && Number.isFinite(b.max)) bmax = bmax === null ? b.max : Math.max(bmax, b.max);
    }
    if (lo === null) lo = bmin !== null ? bmin : 0;
    if (hi === null) {
      if (bmax !== null) hi = bmax;
      else {
        const top = Math.max(1, ...data.map(d => d.value));
        const step = top > 50 ? 25 : (top > 20 ? 10 : 5);
        hi = Math.ceil(top / step) * step;
      }
    }
  }
  if (hi <= lo) hi = lo + 1;
  return { lo, hi, frac: (v) => Math.max(0, Math.min(1, (v - lo) / (hi - lo))) };
}

function chartMain(el) {
  return cleanUrl(el.config?.color || "") || "var(--sbe-accent)";
}

/* Onglet Style du graphe : toile/grille, fond, zone + opacité. */
function chartGrid(el) {
  return el.style?.chGrid || "var(--sbe-tone-3)";
}
function chartFill(el, fallback) {
  return el.style?.chFill || fallback;
}
function chartStroke(el, fallback) {
  return el.style?.chStroke || fallback;
}
function chartFillOp(el) {
  const o = Number(el.style?.chFillOp);
  return Number.isFinite(o) ? Math.max(0, Math.min(100, o)) / 100 : 0.25;
}
/**
 * GRADUATIONS d'un graphe (Style → Pas des graduations).
 * - vide      : quarts (0-25-50-75-100 % de l'échelle) ;
 * - « valeur » : un repère tous les N points (ex. 30 → 30, 60, 90…) ;
 * - « % »      : un repère tous les N % de l'échelle (ex. 20 %).
 * Retourne [{ f (0→1), v (valeur affichée) }], plafonné à 40 repères.
 * withZero : inclure le repère de départ (axes cartésiens ; les toiles
 * radar/rose ne dessinent pas le centre).
 */
function chartTicks(el, lo, hi, withZero = false) {
  const step = Number(el.style?.chStep);
  const span = (hi - lo) || 1;
  const out = [];
  const push = (f) => out.push({ f, v: Math.round(lo + span * f) });
  if (Number.isFinite(step) && step > 0) {
    const pct = (el.style?.chStepUnit ?? "val") === "pct";
    const fStep = pct ? Math.min(1, step / 100) : Math.min(1, step / span);
    if (fStep > 0) {
      const n = Math.min(40, Math.floor(1 / fStep));
      for (let i = withZero ? 0 : 1; i <= n; i++) push(i * fStep);
      /* Le sommet de l'échelle reste marqué s'il ne tombe pas juste. */
      if (out.length && Math.abs(out[out.length - 1].f - 1) > 0.001) push(1);
      return out;
    }
  }
  for (const f of (withZero ? [0, 0.25, 0.5, 0.75, 1] : [0.25, 0.5, 0.75, 1])) push(f);
  return out;
}

/**
 * Fond de graduations pour les rendus HTML (barres, entonnoir) :
 * une fine ligne verticale à chaque repère de l'échelle, peinte en
 * couches de dégradés — aucun élément DOM supplémentaire.
 * Style → « Grille de fond » (st.chGridBg).
 */
function gridBgStyle(el, ticks) {
  if (!el.style?.chGridBg) return "";
  const col = chartGrid(el);
  const w = Math.max(0.5, chartGridW(el));
  const layers = ticks.map(t => {
    const p = (t.f * 100).toFixed(3);
    return `linear-gradient(90deg, transparent calc(${p}% - ${w / 2}px), ${col} calc(${p}% - ${w / 2}px), ${col} calc(${p}% + ${w / 2}px), transparent calc(${p}% + ${w / 2}px))`;
  });
  if (!layers.length) return "";
  return `background-image:${layers.join(",")};background-repeat:no-repeat;`;
}

/* Taille des points (px) — vide = défaut du type de graphe. */
function chartDot(el, fallback) {
  const d = Number(el.style?.chDot);
  return (Number.isFinite(d) && d > 0) ? Math.min(30, d) : fallback;
}
/* Épaisseur de la grille (px) — vide = 1 (les rendus la modulent). */
function chartGridW(el) {
  const w = Number(el.style?.chGridW);
  return (Number.isFinite(w) && w > 0) ? Math.min(10, w) : 1;
}

function sliceColor(d) {
  return d.color || CHART_PALETTE[d.i % CHART_PALETTE.length];
}

/* Icône d'une ligne de graphe — contexte HTML (barres, entonnoir,
   pictos) : fa-… et émojis passent. */
function chartIconHTML(d) {
  const ic = String(d?.icon ?? "").trim();
  if (!ic) return "";
  if (ic.includes("fa-")) {
    const cls = ic.includes("fa-solid") || ic.includes("fa-regular") ? ic : `fa-solid ${ic}`;
    return `<i class="${esc(cls)}"></i> `;
  }
  if (ic.includes("/")) return "";
  return `${esc(ic)} `;
}
/* Contexte SVG (<text>) : seuls les émojis/texte s'affichent
   (Font Awesome est une police à classes CSS, pas injectable ici). */
function chartIconSVG(d) {
  const ic = String(d?.icon ?? "").trim();
  if (!ic || ic.includes("fa-") || ic.includes("/")) return "";
  return `${esc(ic)} `;
}

/* Libellé complet d'une ligne : icône + nom — ou icône SEULE si le
   champ n'a pas de libellé (le nom de clé ne s'affiche jamais). */
/* Marqueur « ce libellé lance un jet ».
   En SVG, une icône Font Awesome ne s'affiche pas (police à classes
   CSS) : on pose le glyphe de dé ⚄, qui est un CARACTÈRE ordinaire —
   il hérite donc de la couleur et de la taille du libellé, là où un
   émoji resterait en couleur fixe. En HTML, le vrai d20 de la fiche. */
/* d20 en SVG : une CLASSE Font Awesome ne peut pas s'appliquer à un
   <tspan>, mais la POLICE, si — on appelle donc la famille et le
   poids, et on écrit le point de code du dé (fa-dice-d20 = U+F6CF).
   Résultat monochrome, à la couleur et à la taille du libellé. */
function chartDiceSVG(d) {
  return d?.roll ? `${diceIconSVG(d.rollIcon)}<tspan>\u2004</tspan>` : "";
}
function chartDiceHTML(d) {
  return d?.roll ? `${diceIconHTML(d.rollIcon)} ` : "";
}
/* Le dé passe TOUJOURS devant : dé, puis icône de libellé, puis nom —
   même ordre que sur les champs de la fiche. */
function chartLabelSVG(d) {
  const ic = chartIconSVG(d);
  const dice = chartDiceSVG(d);
  return (ic && d.iconOnly) ? `${dice}${ic.trim()}` : `${dice}${ic}${esc(d.label)}`;
}
function chartLabelHTML(d) {
  const ic = chartIconHTML(d);
  const dice = chartDiceHTML(d);
  return (ic && d.iconOnly) ? `${dice}${ic.trim()}` : `${dice}${ic}${esc(d.label)}`;
}

/** RADAR (toile d'araignée) : anneaux + axes + polygone des valeurs. */
function radarSVG(el, data, opts = {}, data2 = null) {
  const S = Math.max(120, Number(el.config?.size) || 220);
  const pad = 30, cx = S / 2, cy = S / 2, R = S / 2 - pad;
  const N = data.length, main = chartMain(el);
  const { lo, hi, frac } = chartRange(el, data, opts);
  const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / N;
  const px = (i, r) => cx + Math.cos(ang(i)) * r;
  const py = (i, r) => cy + Math.sin(ang(i)) * r;
  const grid = chartGrid(el);
  let s = "";
  /* Fond de la toile (Style → Fond). */
  if (el.style?.chBg) {
    s += `<polygon points="${data.map((_, i) => `${px(i, R)},${py(i, R)}`).join(" ")}" fill="${el.style.chBg}"/>`;
  }
  const gw = chartGridW(el);
  for (const t of chartTicks(el, lo, hi)) {
    const pts = data.map((_, i) => `${px(i, R * t.f)},${py(i, R * t.f)}`).join(" ");
    s += `<polygon points="${pts}" fill="none" stroke="${grid}" stroke-width="${gw}"/>`;
    s += `<text x="${cx + 4}" y="${cy - R * t.f + 11}" class="sbe-chart-tick sbe-chart-tick--over">${t.v}</text>`;
  }
  for (let i = 0; i < N; i++) {
    s += `<line x1="${cx}" y1="${cy}" x2="${px(i, R)}" y2="${py(i, R)}" stroke="${grid}" stroke-width="${gw}"/>`;
    const lx = px(i, R + 12), ly = py(i, R + 12);
    const anchor = Math.abs(Math.cos(ang(i))) < 0.35 ? "middle" : (Math.cos(ang(i)) > 0 ? "start" : "end");
    s += `<text x="${lx}" y="${ly + 3}" text-anchor="${anchor}" class="sbe-chart-label"${data[i].tt ?? ""}>${chartLabelSVG(data[i])}</text>`;
  }
  /* Série 2 (radar comparatif) : pointillés, dessinée SOUS la 1re. */
  if (Array.isArray(data2) && data2.length) {
    const c2 = cleanUrl(el.config?.color2 || "") || "#4a6d7c";
    const pts2 = data2.slice(0, N).map((d, i) => `${px(i, R * frac(d.value))},${py(i, R * frac(d.value))}`).join(" ");
    s += `<polygon points="${pts2}" fill="${c2}" fill-opacity="0.18" stroke="${c2}" stroke-width="1.5" stroke-dasharray="4,3"/>`;
  }
  const pts = data.map((d, i) => `${px(i, R * frac(d.value))},${py(i, R * frac(d.value))}`).join(" ");
  s += `<polygon points="${pts}" fill="${chartFill(el, main)}" fill-opacity="${chartFillOp(el)}" stroke="${chartStroke(el, main)}" stroke-width="2"/>`;
  const dot = chartDot(el, 4.5);
  data.forEach((d, i) => {
    const r = R * frac(d.value);
    s += `<circle cx="${px(i, r)}" cy="${py(i, r)}" r="${dot}" fill="${d.color || main}" stroke="var(--sbe-surf-1)" stroke-width="1.5"/>`;
    if (el.config?.showValues !== false) {
      s += `<text x="${px(i, r + 10)}" y="${py(i, r + 10) + 3}" text-anchor="middle" class="sbe-chart-value${d.dir ?? ""}">${d.value}</text>`;
    }
    /* Cible de survol invisible, plus large que le point. */
    s += `<circle cx="${px(i, r)}" cy="${py(i, r)}" r="${Math.max(9, dot + 4)}" fill="transparent"${d.tt ?? ""}/>`;
  });
  return `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${s}</svg>`;
}

/** COURBES / AIRES : axe Y gradué, points reliés, valeurs au-dessus.
    area = surface remplie sous la courbe. */
function lineSVG(el, data, area = false, opts = {}) {
  const H = Math.max(90, Number(el.config?.size) || 170);
  const W = Math.max(220, data.length * 46 + 44);
  const pl = 32, pr = 12, pt = 16, pb = 22;
  const N = data.length, main = chartMain(el);
  const { lo, hi, frac } = chartRange(el, data, opts);
  const x = (i) => pl + (N > 1 ? (i * (W - pl - pr)) / (N - 1) : (W - pl - pr) / 2);
  const y = (v) => pt + (1 - frac(v)) * (H - pt - pb);
  let s = "";
  const gw = chartGridW(el);
  for (const t of chartTicks(el, lo, hi, true)) {
    const yy = y(t.v);
    s += `<line x1="${pl}" y1="${yy}" x2="${W - pr}" y2="${yy}" stroke="${chartGrid(el)}" stroke-width="${t.f === 0 ? gw * 1.5 : gw * 0.5}"/>`;
    s += `<text x="${pl - 4}" y="${yy + 3}" text-anchor="end" class="sbe-chart-tick">${t.v}</text>`;
  }
  if (area && data.length > 1) {
    const top = data.map((d, i) => `${x(i)},${y(d.value)}`).join(" ");
    s += `<polygon points="${x(0)},${y(lo)} ${top} ${x(data.length - 1)},${y(lo)}" fill="${chartFill(el, main)}" fill-opacity="${chartFillOp(el)}"/>`;
  }
  s += `<polyline points="${data.map((d, i) => `${x(i)},${y(d.value)}`).join(" ")}" fill="none" stroke="${chartStroke(el, main)}" stroke-width="1.5"/>`;
  const dot = chartDot(el, 3);
  data.forEach((d, i) => {
    s += `<circle cx="${x(i)}" cy="${y(d.value)}" r="${dot}" fill="${d.color || main}"/>`;
    if (el.config?.showValues !== false) {
      s += `<text x="${x(i)}" y="${y(d.value) - 7}" text-anchor="middle" class="sbe-chart-value${d.dir ?? ""}">${d.value}</text>`;
    }
    s += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" class="sbe-chart-label"${d.tt ?? ""}>${chartLabelSVG(d)}</text>`;
    s += `<circle cx="${x(i)}" cy="${y(d.value)}" r="${Math.max(8, dot + 4)}" fill="transparent"${d.tt ?? ""}/>`;
  });
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="max-width:100%;">${s}</svg>`;
}

/** BARRES horizontales : libellé | barre | valeur + échelle en bas. */
function barsHTML(el, data, opts = {}) {
  const main = chartMain(el);
  const { lo, hi, frac } = chartRange(el, data, opts);
  const show = el.config?.showValues !== false;
  let s = "";
  const gbg = gridBgStyle(el, chartTicks(el, lo, hi, true));
  for (const d of data) {
    const pct = frac(d.value) * 100;
    s += `
      <div class="sbe-chart-row"${d.tt ?? ""}>
        <span class="sbe-chart-rowlabel">${chartLabelHTML(d)}</span>
        <span class="sbe-chart-track" style="${gbg}"><i style="width:${pct}%;background:${d.color || main};"></i></span>
        ${show ? `<span class="sbe-chart-rowvalue">${d.value}</span>` : ""}
      </div>`;
  }
  s += `<div class="sbe-chart-scale"><span></span><span class="sbe-chart-scalemarks">${chartTicks(el, lo, hi, true)
    .map(t => `<i>${t.v}</i>`).join("")}</span>${show ? "<span></span>" : ""}</div>`;
  return `<div class="sbe-chart-bars">${s}</div>`;
}

/** COLONNES verticales : valeur au-dessus, libellé en dessous. */
function colsSVG(el, data, opts = {}) {
  const H = Math.max(80, Number(el.config?.size) || 140);
  const bw = 26, gap = 14;
  const W = data.length * (bw + gap) + gap + 8;
  const pt = 16, pb = 20;
  const main = chartMain(el);
  const { frac } = chartRange(el, data, opts);
  let s = `<line x1="2" y1="${H - pb}" x2="${W - 2}" y2="${H - pb}" stroke="${chartGrid(el)}" stroke-width="${chartGridW(el) * 1.5}"/>`;
  data.forEach((d, i) => {
    const hFull = H - pt - pb;
    const h = frac(d.value) * hFull;
    const xx = gap + i * (bw + gap);
    s += `<rect x="${xx}" y="${H - pb - h}" width="${bw}" height="${Math.max(1, h)}" rx="2" fill="${d.color || main}"${d.tt ?? ""}/>`;
    if (el.config?.showValues !== false) {
      s += `<text x="${xx + bw / 2}" y="${H - pb - h - 5}" text-anchor="middle" class="sbe-chart-value${d.dir ?? ""}">${d.value}</text>`;
    }
    s += `<text x="${xx + bw / 2}" y="${H - 6}" text-anchor="middle" class="sbe-chart-label"${d.tt ?? ""}>${chartLabelSVG(d)}</text>`;
  });
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="max-width:100%;">${s}</svg>`;
}

/** SECTEURS / ANNEAU : parts proportionnelles, libellés autour.
    innerFrac > 0 = anneau (trou central). */
function pieSVG(el, data, innerFrac = 0) {
  const S = Math.max(140, Number(el.config?.size) || 230);
  const pad = 40, cx = S / 2, cy = S / 2, R = S / 2 - pad;
  const r = R * Math.min(0.85, Math.max(0, innerFrac));
  const total = data.reduce((a, d) => a + d.value, 0) || 1;
  const show = el.config?.showValues !== false;
  let a0 = -Math.PI / 2, s = "";
  for (const d of data) {
    const frac = d.value / total;
    const a1 = a0 + frac * 2 * Math.PI;
    if (frac > 0) {
      const large = frac > 0.5 ? 1 : 0;
      const x0 = cx + Math.cos(a0) * R, y0 = cy + Math.sin(a0) * R;
      const x1 = cx + Math.cos(a1) * R, y1 = cy + Math.sin(a1) * R;
      if (frac >= 0.999) {
        s += r > 0
          ? `<circle cx="${cx}" cy="${cy}" r="${(R + r) / 2}" fill="none" stroke="${sliceColor(d)}" stroke-width="${R - r}"${d.tt ?? ""}/>`
          : `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${sliceColor(d)}"${d.tt ?? ""}/>`;
      } else if (r > 0) {
        const xi0 = cx + Math.cos(a0) * r, yi0 = cy + Math.sin(a0) * r;
        const xi1 = cx + Math.cos(a1) * r, yi1 = cy + Math.sin(a1) * r;
        s += `<path d="M${x0},${y0} A${R},${R} 0 ${large} 1 ${x1},${y1} L${xi1},${yi1} A${r},${r} 0 ${large} 0 ${xi0},${yi0} Z" fill="${sliceColor(d)}" stroke="var(--sbe-surf-1)" stroke-width="1"${d.tt ?? ""}/>`;
      } else {
        s += `<path d="M${cx},${cy} L${x0},${y0} A${R},${R} 0 ${large} 1 ${x1},${y1} Z" fill="${sliceColor(d)}" stroke="var(--sbe-surf-1)" stroke-width="1"${d.tt ?? ""}/>`;
      }
      const am = (a0 + a1) / 2;
      const lx = cx + Math.cos(am) * (R + 12), ly = cy + Math.sin(am) * (R + 12);
      const anchor = Math.abs(Math.cos(am)) < 0.3 ? "middle" : (Math.cos(am) > 0 ? "start" : "end");
      s += `<text x="${lx}" y="${ly + 3}" text-anchor="${anchor}" class="sbe-chart-label"${d.tt ?? ""}>${chartLabelSVG(d)}${show ? ` ${d.value}` : ""}</text>`;
    }
    a0 = a1;
  }
  return `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${s}</svg>`;
}

/** CASCADE : barres cumulées, positifs/négatifs, connecteurs. */
function waterfallSVG(el, data) {
  const H = Math.max(90, Number(el.config?.size) || 150);
  const bw = 26, gap = 14;
  const W = data.length * (bw + gap) + gap + 8;
  const pt = 16, pb = 20;
  const main = chartMain(el);
  const show = el.config?.showValues !== false;
  /* Bornes de l'échelle sur les cumuls. */
  let cum = 0, lo = 0, hi = 0;
  const steps = data.map(d => {
    const start = cum;
    cum += d.raw;
    lo = Math.min(lo, cum, start);
    hi = Math.max(hi, cum, start);
    return { ...d, start, end: cum };
  });
  const span = (hi - lo) || 1;
  const y = (v) => pt + (1 - (v - lo) / span) * (H - pt - pb);
  let s = `<line x1="2" y1="${y(0)}" x2="${W - 2}" y2="${y(0)}" stroke="${chartGrid(el)}" stroke-width="${chartGridW(el) * 1.5}"/>`;
  steps.forEach((d, i) => {
    const xx = gap + i * (bw + gap);
    const yTop = Math.min(y(d.start), y(d.end));
    const h = Math.max(1, Math.abs(y(d.start) - y(d.end)));
    const fill = d.color || (d.raw >= 0 ? main : "var(--sbe-fail)");
    s += `<rect x="${xx}" y="${yTop}" width="${bw}" height="${h}" rx="2" fill="${fill}"${d.tt ?? ""}/>`;
    if (i < steps.length - 1) {
      s += `<line x1="${xx + bw}" y1="${y(d.end)}" x2="${xx + bw + gap}" y2="${y(d.end)}" stroke="var(--sbe-text-dim)" stroke-width="1" stroke-dasharray="2,2"/>`;
    }
    if (show) {
      s += `<text x="${xx + bw / 2}" y="${yTop - 4}" text-anchor="middle" class="sbe-chart-value${d.dir ?? ""}">${d.raw >= 0 ? "+" + d.raw : d.raw}</text>`;
    }
    s += `<text x="${xx + bw / 2}" y="${H - 6}" text-anchor="middle" class="sbe-chart-label"${d.tt ?? ""}>${chartLabelSVG(d)}</text>`;
  });
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="max-width:100%;">${s}</svg>`;
}

/** ENTONNOIR : barres centrées, largeur proportionnelle. */
function funnelHTML(el, data, opts = {}) {
  const main = chartMain(el);
  const { lo, hi, frac } = chartRange(el, data, opts);
  const show = el.config?.showValues !== false;
  const gbg = gridBgStyle(el, chartTicks(el, lo, hi, true));
  let s = "";
  for (const d of data) {
    const pct = frac(d.value) * 100;
    s += `
      <div class="sbe-chart-row sbe-chart-row--funnel"${d.tt ?? ""}>
        <span class="sbe-chart-rowlabel">${chartLabelHTML(d)}</span>
        <span class="sbe-chart-funnel" style="${gbg}"><i style="width:${pct}%;background:${d.color || main};"></i></span>
        ${show ? `<span class="sbe-chart-rowvalue">${d.value}</span>` : ""}
      </div>`;
  }
  return `<div class="sbe-chart-bars">${s}</div>`;
}

/** SUCETTES (lollipop) / POINTS SUR ÉCHELLE : apparences des barres. */
function lollipopSVG(el, data, opts = {}, dotsOnly = false) {
  const rowH = 24, pl = 92, pr = 18;
  const W = 330, H = data.length * rowH + 26;
  const { lo, hi, frac } = chartRange(el, data, opts);
  const main = chartMain(el);
  const show = el.config?.showValues !== false;
  const X = (v) => pl + frac(v) * (W - pl - pr);
  let s = "";
  const gw = chartGridW(el);
  for (const t of chartTicks(el, lo, hi, true)) {
    const x = pl + t.f * (W - pl - pr);
    s += `<line x1="${x}" y1="6" x2="${x}" y2="${H - 16}" stroke="${chartGrid(el)}" stroke-width="${gw * 0.6}"/>`;
    s += `<text x="${x}" y="${H - 4}" text-anchor="middle" class="sbe-chart-tick">${t.v}</text>`;
  }
  data.forEach((d, i) => {
    const y = 12 + i * rowH, x = X(d.value);
    s += `<text x="${pl - 6}" y="${y + 3}" text-anchor="end" class="sbe-chart-label"${d.tt ?? ""}>${chartLabelSVG(d)}</text>`;
    if (dotsOnly) {
      const dot = chartDot(el, 6.5);
      s += `<line x1="${pl}" y1="${y}" x2="${W - pr}" y2="${y}" stroke="var(--sbe-surf-3)" stroke-width="5" stroke-linecap="round"/>`;
      s += `<circle cx="${x}" cy="${y}" r="${dot}" fill="${d.color || main}"/>`;
      if (show) s += `<text x="${x}" y="${y + 2.5}" text-anchor="middle" style="font-size:${Math.max(7, dot)}px;font-weight:700" fill="#fff">${d.value}</text>`;
    } else {
      const dot = chartDot(el, 5);
      s += `<line x1="${pl}" y1="${y}" x2="${x}" y2="${y}" stroke="${d.color || main}" stroke-width="2"/>`;
      s += `<circle cx="${x}" cy="${y}" r="${dot}" fill="${d.color || main}"/>`;
      if (show) s += `<text x="${x}" y="${y - 8}" text-anchor="middle" class="sbe-chart-value${d.dir ?? ""}">${d.value}</text>`;
    }
    s += `<circle cx="${x}" cy="${y}" r="${Math.max(9, chartDot(el, 5) + 4)}" fill="transparent"${d.tt ?? ""}/>`;
  });
  return `<svg width="${W}" height="${H}" style="max-width:100%;">${s}</svg>`;
}

/** ROSE DE NIGHTINGALE : parts d'angle égal, rayon = valeur. */
function roseSVG(el, data, opts = {}) {
  const S = Math.max(140, Number(el.config?.size) || 230);
  const pad = 36, cx = S / 2, cy = S / 2, R = S / 2 - pad;
  const { lo, hi, frac } = chartRange(el, data, opts);
  const N = data.length;
  const show = el.config?.showValues !== false;
  let s = "";
  /* Échelle : anneaux aux quarts (les VALEURS sont posées plus bas,
     par-dessus les secteurs, sinon les parts opaques les masquent). */
  const RINGS = chartTicks(el, lo, hi);
  for (const t of RINGS) {
    s += `<circle cx="${cx}" cy="${cy}" r="${R * t.f}" fill="none" stroke="${chartGrid(el)}" stroke-width="${chartGridW(el)}"/>`;
  }
  data.forEach((d, i) => {
    const a0 = -Math.PI / 2 + (i * 2 * Math.PI) / N;
    const a1 = a0 + (2 * Math.PI) / N;
    const r = Math.max(2, R * frac(d.value));
    const x0 = cx + Math.cos(a0) * r, y0 = cy + Math.sin(a0) * r;
    const x1 = cx + Math.cos(a1) * r, y1 = cy + Math.sin(a1) * r;
    s += `<path d="M${cx},${cy} L${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1} Z" fill="${sliceColor(d)}" fill-opacity="0.85" stroke="var(--sbe-surf-1)"${d.tt ?? ""}/>`;
    const am = (a0 + a1) / 2;
    const anchor = Math.abs(Math.cos(am)) < 0.3 ? "middle" : (Math.cos(am) > 0 ? "start" : "end");
    s += `<text x="${cx + Math.cos(am) * (R + 11)}" y="${cy + Math.sin(am) * (R + 11) + 3}" text-anchor="${anchor}" class="sbe-chart-label"${d.tt ?? ""}>${chartLabelSVG(d)}${show ? ` ${d.value}` : ""}</text>`;
  });
  /* Valeurs de l'échelle AU-DESSUS des secteurs (liseré pour rester
     lisibles sur les parts colorées). */
  for (const t of RINGS) {
    s += `<text x="${cx + 4}" y="${cy - R * t.f + 11}" class="sbe-chart-tick sbe-chart-tick--over">${t.v}</text>`;
  }
  return `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${s}</svg>`;
}

/** Une icône de pictogramme : emoji/texte, classe fa-…, ou image. */
function pictoIcon(icon, on) {
  const cls = on ? "sbe-picto-on" : "sbe-picto-off";
  if (icon.includes("fa-")) return `<i class="${esc(icon)} ${cls}"></i>`;
  if (icon.includes("/") || icon.includes(".")) return `<img class="${cls}" src="${esc(cleanUrl(icon))}" alt="">`;
  return `<span class="${cls}">${esc(icon)}</span>`;
}

/** PICTOGRAMMES : icônes répétées pleines/éteintes. Le nombre d'icônes
    = max déclaré de la clé (sinon l'échelle du graphe), plafonné à 24.
    Le 3e champ de chaque ligne est l'ICÔNE (emoji, fa-…, ou image). */
function pictoHTML(el, data, opts = {}) {
  const { hi } = chartRange(el, data, opts);
  const show = el.config?.showValues !== false;
  let s = "";
  for (const d of data) {
    const bounds = keyBounds(opts.elements, d.key);
    const max = Math.max(1, Math.round(bounds?.max ?? hi));
    const n = Math.min(24, max);
    const filled = Math.round(Math.max(0, Math.min(max, d.value)) / max * n);
    const icon = (d.color || "●");
    let ic = "";
    for (let i = 0; i < n; i++) ic += pictoIcon(icon, i < filled);
    s += `
      <div class="sbe-chart-row sbe-chart-row--picto"${d.tt ?? ""}>
        <span class="sbe-chart-rowlabel">${chartLabelHTML(d)}</span>
        <span class="sbe-picto">${ic}</span>
        ${show ? `<span class="sbe-chart-rowvalue">${d.value}/${max}</span>` : ""}
      </div>`;
  }
  return `<div class="sbe-chart-bars">${s}</div>`;
}

/** Rendu complet d'un élément graphique. */
function chartHTML(el, resolve, opts = {}) {
  const data = chartData(el, resolve);
  if (!data.length) return `<p class="sbe-tpl-empty">${game.i18n.localize("SBE.Template.ChartNoAxes")}</p>`;
  /* INFO-BULLES DES POINTS : un champ déplacé DANS le graphe n'a plus
     de champ à survoler sur la fiche — c'est son point/sa barre qui
     porte sa bulle configurée. Sans configuration : libellé + valeur. */
  const kids = new Map((Array.isArray(el.children) ? el.children : [])
    .filter(k => k?.key).map(k => [k.key, k]));
  for (const d of data) {
    /* Valeur modifiée par un effet : vert en bonus, rouge en malus. */
    const bd = opts.breakdown?.[d.key];
    const net = bd ? Number(bd.total) - Number(bd.base) : 0;
    d.dir = net > 0 ? " is-up" : (net < 0 ? " is-down" : "");
    const kid = kids.get(d.key);
    const own = elementTtHtml(kid, opts);
    const html = own || `<div class="sbe-tt"><b>${esc(d.label)}</b> : ${d.raw}</div>`;
    d.tt = ` data-tooltip-html="${esc(html)}"`;
    /* JET AU CLIC : un champ déplacé DANS le graphe n'a plus de libellé
       à cliquer sur la fiche — c'est son point, sa barre, sa part et
       son libellé d'axe qui déclenchent le jet. Les attributs sont
       posés sur « tt », donc TOUS les types de graphique en héritent.
       Uniquement sur la fiche : l'atelier montre des données d'exemple
       et n'a pas d'action de jet. */
    if (opts.live && kid?.config?.roll?.on && kid.config.roll.formula
      && (opts.isGM || kid.playerEditable !== false)) {
      d.tt += ` data-action="rollField" data-key="${esc(d.key)}" data-roll="1"`;
      /* Icône de dé sur le libellé d'axe, sauf si le créateur l'a
         retirée pour CE champ (case « masquer l'icône de dé »). */
      d.roll = !kid.config.roll.noIcon;
      d.rollIcon = kid.config.roll.icon;
    }
  }
  const type = el.config?.type ?? "radar";
  let body;
  if (type === "line") body = lineSVG(el, data, false, opts);
  else if (type === "area") body = lineSVG(el, data, true, opts);
  else if (type === "barsh") body = barsHTML(el, data, opts);
  else if (type === "lollipop") body = lollipopSVG(el, data, opts, false);
  else if (type === "dots") body = lollipopSVG(el, data, opts, true);
  else if (type === "barsv") body = colsSVG(el, data, opts);
  else if (type === "pie") body = pieSVG(el, data);
  else if (type === "donut") body = pieSVG(el, data, 0.55);
  else if (type === "rose") body = roseSVG(el, data, opts);
  else if (type === "waterfall") body = waterfallSVG(el, data);
  else if (type === "funnel") body = funnelHTML(el, data, opts);
  else if (type === "picto") body = pictoHTML(el, data, opts);
  else if (type === "radar2") {
    const axes2 = Array.isArray(el.config?.axes2) ? el.config.axes2 : [];
    const d2 = axes2.map((k, i) => ({ key: k, label: "", value: Math.max(0, Number(resolve(k)) || 0), raw: 0, color: null, i }));
    body = radarSVG(el, data, opts, d2);
  }
  else body = radarSVG(el, data, opts);
  const sp = styleParts(el);
  const title = el.label
    ? `<div class="sbe-chart-title" style="${sp.label}">${esc(el.label)}</div>` : "";
  /* Onglet Style → variables CSS du graphe : le groupe Libellé pilote
     les étiquettes (SVG = fill, pas color), le groupe Valeur pilote
     les valeurs affichées. */
  const st = el.style ?? {};
  const vars = [];
  if (st.labelColor) vars.push(`--sbe-ch-label:${st.labelColor}`);
  if (st.labelSize) vars.push(`--sbe-ch-labels:${Number(st.labelSize)}px`);
  if (st.labelFont) vars.push(`--sbe-ch-font:'${cleanUrl(st.labelFont)}'`);
  if (st.valueColor) vars.push(`--sbe-ch-value:${st.valueColor}`);
  if (st.valueSize) vars.push(`--sbe-ch-values:${Number(st.valueSize)}px`);
  if (st.chTick) vars.push(`--sbe-ch-tick:${Number(st.chTick)}px`);
  return `<div class="sbe-chart" data-key="${esc(el.key ?? "")}" style="${vars.join(";")}">${title}${body}</div>`;
}

/** Libellés d'exemple (fichier de langue, séparés par des virgules). */
function sampleLabels(key, n) {
  const list = String(game.i18n.localize(key)).split(",").map(t => t.trim()).filter(Boolean);
  return Array.from({ length: n }, (_, i) => list[i] ?? `#${i + 1}`);
}

/** Aperçu de démonstration d'un TYPE de graphique (fenêtre d'édition) :
    8 attributs neutres dans la langue de l'utilisateur, mêmes données
    pour tous les types. */
export function chartPreviewHTML(type) {
  if (type === "picto") {
    const P = sampleLabels("SBE.Template.ChartSamplePicto", 3);
    const el = {
      key: "", label: "",
      config: {
        type, max: 5, axes: P.map((label, i) => ({ key: `p${i}`, label, color: ["🍗", "🛏️", "💧"][i] }))
      }, style: {}
    };
    const map = { p0: 3, p1: 2, p2: 4 };
    return chartHTML(el, (k) => map[k] ?? 0);
  }
  /* Libellés d'exemple dans la langue de l'utilisateur. */
  const AX = sampleLabels("SBE.Template.ChartSampleAxes", 8).map((l, i) => [l, [60, 50, 45, 70, 55, 30, 65, 40][i]]);
  const el = {
    key: "", label: "",
    config: { type, max: 100, size: 180, axes: AX.map(([l]) => ({ key: l, label: l, color: "" })) },
    style: {}
  };
  if (type === "radar2") el.config.axes2 = AX.map(([l]) => l).reverse();
  const map = Object.fromEntries(AX);
  return chartHTML(el, (k) => map[k] ?? 0);
}

/** Valeurs d'exemple STABLES pour l'atelier (pas de fiche sous la main). */
function chartSampleResolve(el) {
  const max = Number(el.config?.max) > 0 ? Number(el.config.max) : 100;
  return (k) => {
    let h = 0;
    for (const ch of String(k ?? "")) h = (h * 31 + ch.charCodeAt(0)) % 997;
    return Math.round(max * (0.3 + (h % 55) / 100));
  };
}

/* ============================================================ */
/*  Élément HTML LIBRE — bloc de balisage du MJ, ASSAINI au      */
/*  rendu (jamais de code exécutable, même importé), avec        */
/*  interpolation {{clé}} et {{= formule}} en direct.            */
/* ============================================================ */

/** Retire tout ce qui peut exécuter du code : balises actives,
    gestionnaires d'événements inline, protocoles javascript:. */
export function sanitizeHtml(src) {
  let s = String(src ?? "");
  /* Blocs exécutables AVEC leur contenu (le code ne doit même pas
     rester en texte), puis balises orphelines. */
  s = s.replace(/<\s*(script|iframe|object|embed)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  s = s.replace(/<\s*\/?\s*(script|iframe|object|embed|form|link|meta|base)\b[^>]*>/gi, "");
  /* Gestionnaires inline : onclick=, onload=… */
  s = s.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  /* Protocoles exécutables dans href/src/etc. */
  s = s.replace(/(javascript|vbscript)\s*:/gi, "blocked:");
  return s;
}

/** Interpolation : {{clé}} = valeur de la clé, {{= expr}} = formule
    évaluée dans la portée de la fiche. Échec ou clé absente = "—". */
function interpolateHtml(src, scope) {
  return String(src ?? "").replace(/\{\{\s*(=?)([\s\S]*?)\}\}/g, (_m, eq, body) => {
    const expr = body.trim();
    if (!expr) return "";
    if (eq === "=") {
      const res = evalExpression(expr, scope);
      return (res === null || res === undefined) ? "—" : esc(String(res));
    }
    const val = scope[expr];
    return (val === null || val === undefined || typeof val === "object") ? "—" : esc(String(val));
  });
}

function htmlBlock(el, scope) {
  return interpolateHtml(sanitizeHtml(el.config?.code), scope);
}

/* ============================================================ */
/*  Rendu ATELIER (workshop)                                     */
/* ============================================================ */

/**
 * @param {Array} list        Arbre d'éléments.
 * @param {object} opts       { navActive: {navId: tabId} }
 */

/* ============================================================ */
/*  PLACEMENT LIBRE                                              */
/* ============================================================ */

/**
 * Un cadre en « placement libre » ne range plus ses enfants à la
 * suite : chacun se pose OÙ ON VEUT, à une position retenue en
 * POURCENTAGE de la boîte. Le pourcentage plutôt que le pixel, pour que
 * la mise en page tienne quand la fiche est redimensionnée ou que le
 * cadre n'a pas la même largeur d'un écran à l'autre.
 *
 * Chaque enfant est CENTRÉ sur son point (translate -50 %) : on vise
 * l'épaule ou la main sur une silhouette, pas le coin d'une boîte.
 */
export function isFreeFrame(el) {
  return el?.kind === "frame" && !!el.config?.freePos;
}

/**
 * Corps d'un cadre libre : hauteur de départ minimale seulement — la
 * vraie hauteur est mesurée sur les enfants après rendu
 * (autosizeFreeZones), le cadre ÉPOUSE donc son contenu. Aucun champ
 * de hauteur à régler, et rien ne peut en déborder.
 */
/* Dernière taille mesurée de chaque zone libre (par id de cadre) : la
   zone REDESSINÉE (un objet glissé, une valeur changée) naît à sa taille
   d'avant au lieu de s'effondrer puis de regrandir pendant que ses
   images se chargent — l'effet « elle se rétracte et revient ». */
const FREE_SIZES = (() => {
  /* Gardée aussi d'une session à l'autre (navigateur de ce joueur) : même
     le premier affichage après F5 naît à la bonne taille. */
  try { return new Map(Object.entries(JSON.parse(localStorage.getItem("sbe-free-sizes") || "{}"))); }
  catch (_e) { return new Map(); }
})();
let freeSaveTimer = null;
function rememberFreeSize(id, size) {
  const old = FREE_SIZES.get(id);
  if (old && old.h === size.h && old.w === size.w) return;
  FREE_SIZES.set(id, size);
  clearTimeout(freeSaveTimer);
  freeSaveTimer = setTimeout(() => {
    try { localStorage.setItem("sbe-free-sizes", JSON.stringify(Object.fromEntries(FREE_SIZES))); }
    catch (_e) { /* stockage indisponible : la mémoire de session suffit */ }
  }, 500);
}

export function freeBodyStyle(el) {
  const sz = el?.id ? FREE_SIZES.get(el.id) : null;
  return sz ? `min-height:${sz.h}px;min-width:${sz.w}px;` : "min-height:120px;";
}

/** Unité de position d'un élément libre — AU CHOIX, par élément :
    - « px » : ancré au coin de la zone, comme l'image posée là — ne
      bouge pas quand la fenêtre s'étire (emplacements sur une image) ;
    - « % » : suit la largeur du cadre (mises en page fluides).
    Défaut : px. Les positions posées avant l'unité (sans marque « u »)
    étaient des pourcentages : elles se lisent comme tel. */
export function freeUnitOf(el) {
  const p = el?.pos ?? {};
  if (p.u === "px" || p.u === "%") return p.u;
  return p.x !== undefined ? "%" : "px";
}

function freeItemStyle(el) {
  const p = el?.pos ?? {};
  const y = Number.isFinite(Number(p.y)) ? Number(p.y) : 8;
  const w = Number(p.w) > 0 ? `width:${Number(p.w)}px;` : "";
  if (freeUnitOf(el) === "px") {
    const x = Number.isFinite(Number(p.x)) ? Number(p.x) : 8;
    return `left:${x}px;top:${y}px;max-width:calc(100% - ${x}px);${w}`;
  }
  const x = Number.isFinite(Number(p.x)) ? Number(p.x) : 4;
  return `left:${x}%;top:${y}px;max-width:calc(100% - ${x}%);${w}`;
}

/**
 * Ajuste la hauteur de chaque zone libre à son contenu réel : le bas
 * de l'enfant le plus bas + une marge. À appeler après chaque rendu
 * (atelier ET fiche).
 */
export function autosizeFreeZones(root) {
  const measure = (zone) => {
    /* Zone CACHÉE (onglet pas affiché, cadre replié) : rien ne se mesure,
       tout vaut 0. On garde la taille d'avant ; la zone sera mesurée au
       moment où elle s'affiche (l'observateur réagit). */
    if (!zone.isConnected || !zone.getClientRects().length) return;
    let bottom = 0, right = 0;
    for (const it of zone.querySelectorAll(":scope > .sbe-free-item")) {
      bottom = Math.max(bottom, it.offsetTop + it.offsetHeight);
      right = Math.max(right, it.offsetLeft + it.offsetWidth);
    }
    /* Images pas encore chargées : la mesure est trop petite — on ne
       descend pas sous la taille d'avant (pas d'effondrement visible). */
    const id = zone.dataset.freeZone;
    const prev = id ? FREE_SIZES.get(id) : null;
    const loading = [...zone.querySelectorAll("img")].some(i => !i.complete);
    let h = Math.max(120, bottom + 10), w = Math.round(right + 10);
    if (loading && prev) { h = Math.max(h, prev.h); w = Math.max(w, prev.w); }
    else if (id) rememberFreeSize(id, { h, w });
    bottom = h - 10; right = w - 10;
    zone.style.minHeight = `${Math.max(120, bottom + 10)}px`;
    /* LARGEUR MINIMALE = le bord droit du contenu : sans elle, réduire
       la fenêtre comprimait la zone, l'image rapetissait avec, et les
       emplacements posés en pixels ne tombaient plus sur elle. La zone
       refuse de descendre sous son contenu — la mise en place tient,
       quelle que soit la taille de la fenêtre. */
    zone.style.minWidth = `${Math.round(right + 10)}px`;
    /* La COLONNE qui l'abrite reçoit le même plancher, en pixels : la
       règle CSS (min-width: fit-content) n'est pas lue pareil par tous
       les navigateurs (Firefox laissait la colonne se comprimer, et la
       zone débordait sur la colonne voisine). */
    const col = zone.closest(".sbe-col");
    if (col) {
      const extra = Math.max(0, col.getBoundingClientRect().width - zone.getBoundingClientRect().width);
      col.style.minWidth = `${Math.round(right + 10 + extra)}px`;
    }
  };
  for (const zone of root?.querySelectorAll?.(".sbe-frame-body--free") ?? []) {
    measure(zone);
    /* ⚠ La taille RÉELLE des enfants n'est pas connue au rendu : une
       image (SVG ou autre) charge après coup, et Foundry peut mesurer
       un DOM pas encore mis en page — l'écouteur « load » seul ratait
       les images déjà en cache. Un ResizeObserver re-mesure la zone à
       CHAQUE changement de taille d'un enfant, quel que soit le format
       ou le moment. Accroché à la zone : il meurt avec elle au rendu
       suivant (pas de fuite). */
    zone._sbeFreeRO?.disconnect?.();
    const ro = new ResizeObserver(() => measure(zone));
    for (const it of zone.querySelectorAll(":scope > .sbe-free-item")) ro.observe(it);
    /* La zone elle-même : quand son onglet s'affiche, elle passe de 0 à
       sa vraie taille — c'est là qu'on la mesure. */
    ro.observe(zone);
    zone._sbeFreeRO = ro;
    requestAnimationFrame(() => measure(zone));
  }
}

/**
 * Rendu des enfants d'un cadre libre.
 * @param {string} mode  "sheet" (fiche) ou "workshop" (atelier).
 */
function renderFree(list, opts, mode) {
  let html = "";
  for (const el of (list ?? [])) {
    if (!el) continue;
    if (mode === "sheet") {
      if (el.sheetHidden) continue;
      if (el.playerVisible === false && !opts.isGM) continue;
      if (!isVisibleNow(el, opts)) continue;
    }
    /* ORDRE DES PLANS : les éléments s'empilent dans l'ordre du modèle
       (le dernier au-dessus). Dans l'atelier, deux boutons par élément
       renvoient à l'arrière ou ramènent devant — indispensable pour
       poser des éléments PAR-DESSUS une image de fond, qui sinon avale
       toute la zone de saisie. Ils s'insèrent DANS la barre d'outils de
       l'élément, entre la clé et ⠿ ✏ 🗑 — pas de barre flottante qui
       chevauche le reste. */
    const unit = freeUnitOf(el);
    const freeTools = mode === "workshop" ? `<a class="sbe-free-front" data-tooltip-text="${esc(game.i18n.localize("SBE.Free.Front"))}"><i class="fa-solid fa-chevron-up"></i></a><a class="sbe-free-back" data-tooltip-text="${esc(game.i18n.localize("SBE.Free.Back"))}"><i class="fa-solid fa-chevron-down"></i></a><a class="sbe-free-unit" data-tooltip-text="${esc(game.i18n.localize(unit === "px" ? "SBE.Free.UnitPx" : "SBE.Free.UnitPct"))}">${unit}</a>` : "";
    const inner = mode === "sheet" ? sheetElement(el, opts) : workshopElement(el, { ...opts, freeTools });
    html += `<div class="sbe-free-item" data-free-id="${esc(el.id)}" data-free-unit="${unit}" style="${freeItemStyle(el)}">${inner}</div>`;
  }
  return html;
}

export function renderWorkshop(list, opts = {}) {
  let html = "";
  for (const el of (list ?? [])) {
    if (!el) continue;
    html += workshopElement(el, opts);
  }
  return markCssTargets(html);
}

function workshopElement(el, opts) {
  const sp = styleParts(el);
  /* Comme sur la fiche : aucun libellé ni icône → aucune colonne de
     libellé réservée, le contenu occupe toute la largeur. L'atelier
     doit montrer ce que la fiche affichera. */
  const bareW = !String(el.label ?? "").trim() && !String(el.config?.labelIcon ?? "").trim();
  /* data-key sur l'enveloppe, COMME sur la fiche : un thème qui vise
     « [data-key="pv"] » habille l'atelier ET la fiche (ce qu'on
     applique au résultat s'applique à l'atelier). */
  const wrap = (inner, extraClass = "", wrapStyle = sp.wrap) => `
    <div class="sbe-tpl-el ${extraClass}${bareW ? " sbe-el--nolabel" : ""}" data-el-id="${esc(el.id)}"${el.key ? ` data-key="${esc(el.key)}"` : ""} style="${wrapStyle}">
      ${tools(el, opts.freeTools ?? "")}${inner}
    </div>`;
  const label = () =>
    `<label class="sbe-tpl-el-label" style="${sp.label}">${hiddenBadge(el)}${labelIconHTML(el)}${esc(el.label ?? "")}</label>`;
  /* Position du libellé (Style) : côté g./d., dessus, dessous. */
  const field = (control) => {
    const pos = labelPos(el);
    if (pos === "side-left") return wrap(`${label()}${control}`);
    if (pos === "side-right") return wrap(`${control}${label()}`, "sbe-el--side-right");
    const lbl = `<div class="sbe-el-labelblock" style="text-align:${labelAlign(pos)};">${label()}</div>`;
    /* Le CHAMP suit l'alignement du libellé (au-dessus/en dessous centré → champ centré). */
    const ctl = `<div style="text-align:${labelAlign(pos)};">${control}</div>`;
    const body = pos.startsWith("above") ? `${lbl}${ctl}` : `${ctl}${lbl}`;
    return wrap(body, "sbe-el--stack");
  };

  switch (el.kind) {

    case "frame": {
      /* Non repliable : toujours ouvert, flèche masquée, bandeau inerte —
         dans l'atelier comme sur la fiche (même comportement partout). */
      const fixed = !!el.config?.noCollapse;
      const open = (fixed || !el.config?.startCollapsed) ? "open" : "";
      const fs = frameStyles(el);
      const bare = el.config?.bare ? " sbe-frame--bare" : "";
      /* Titre AU-DESSUS du cadre : le bandeau sort visuellement de la
         boîte — les styles de boîte (bord/fond/coins) migrent sur le corps. */
      const above = el.config?.titlePos === "above";
      return wrap(`
        <details class="sbe-frame${bare}${fixed ? " sbe-frame--fixed" : ""}${above ? " sbe-frame--title-above" : ""}" ${open} data-sync data-fid="${esc(el.id)}" data-key="${esc(el.key ?? "")}" style="${above ? "" : fs.box}">
          <summary style="${fs.head}"><i class="fa-solid fa-caret-right sbe-frame-caret"></i>${hiddenBadge(el)}${labelIconHTML(el)}${esc(el.label ?? "")}</summary>
          ${isFreeFrame(el) ? `
          <div class="sbe-frame-body sbe-frame-body--free" data-free-zone="${esc(el.id)}"
               style="${above ? fs.box : ""}${freeBodyStyle(el)}">
            ${renderFree(el.children ?? [], opts, "workshop")}
            ${addBar(el.id)}
          </div>` : `
          <div class="sbe-frame-body"${above ? ` style="${fs.box}"` : ""}>
            ${addBar(el.id, null, true, "start")}
            ${renderWorkshop(el.children ?? [], opts)}
            ${addBar(el.id)}
          </div>`}
        </details>`, "sbe-tpl-el--block", "");
    }

    case "columns": {
      const count = Math.min(10, Math.max(2, Number(el.config?.count ?? 2)));
      let cols = "";
      for (let i = 0; i < count; i++) {
        cols += `
          <div class="sbe-col">
            ${addBar(el.id, i, true, "start")}
            ${renderWorkshop(el.cols?.[i] ?? [], opts)}
            ${addBar(el.id, i)}
          </div>`;
      }
      return wrap(`
        <div class="sbe-cols-head">${hiddenBadge(el)}<span style="${sp.label}">${esc(el.label ?? "")}</span></div>
        <div class="sbe-cols${el.config?.equalHeight ? " sbe-cols--equal" : ""}" data-key="${esc(el.key ?? "")}" style="grid-template-columns:${colsTemplate(el, count)};${sp.wrap}">${cols}</div>`,
        "sbe-tpl-el--block", "");
    }

    case "nav": {
      const tabs = (el.children ?? []).filter(t => t?.kind === "tab");
      const activeId = opts.navActive?.[el.id] ?? tabs[0]?.id ?? null;
      const nl = navLayout(el);
      let bar = "";
      for (const t of tabs) {
        bar += `
          <span class="sbe-navtab ${t.id === activeId ? "active" : ""}" data-el-id="${esc(t.id)}">
            <a data-action="switchNavTab" data-nav="${esc(el.id)}" data-tab="${esc(t.id)}"${tabTooltip(t)}>
              ${hiddenBadge(t)}${tabIcon(t)}${esc(t.label ?? "")}
            </a>
            <span class="sbe-navtab-tools">
              <a data-action="editElement" title="${game.i18n.localize("SBE.Template.EditElTitle")}"><i class="fa-solid fa-pen"></i></a>
              <a data-action="deleteElement" title="${game.i18n.localize("SBE.Template.DeleteElTitle")}"><i class="fa-solid fa-trash"></i></a>
            </span>
          </span>`;
      }
      bar += `
        <button type="button" class="sbe-tpl-plus sbe-tpl-plus--small" data-action="addElement"
                data-parent="${esc(el.id)}" title="${game.i18n.localize("SBE.Template.AddTabTitle")}">+</button>`;
      const active = tabs.find(t => t.id === activeId);
      const body = active ? `
        <div class="sbe-navtab-body">
          ${addBar(active.id, null, true, "start")}
          ${renderWorkshop(active.children ?? [], opts)}
          ${addBar(active.id)}
        </div>` : "";
      const navHtml = `<div class="sbe-navbar${nl.barCls}" data-key="${esc(el.key ?? "")}">${hiddenBadge(el)}${bar}</div>${body}`;
      return wrap(nl.vertical ? `<div class="${nl.wrapCls}">${navHtml}</div>` : navHtml,
        "sbe-tpl-el--block");
    }

    case "chart": {
      /* Aperçu atelier : valeurs d'exemple stables (la vraie donnée
         vit sur les fiches). En dessous : les SLOTS — puces des champs
         branchés (× pour retirer) + zone où GLISSER un champ pour
         l'ajouter comme référence (l'élément ne bouge pas). */
      const axes = chartAxesOf(el);
      const kidsByKey = new Map((Array.isArray(el.children) ? el.children : [])
        .filter(k => k?.key).map(k => [k.key, k]));
      const chips = axes.map(a => {
        const kid = kidsByKey.get(a.key);
        /* Enfant déplacé DANS le graphe : crayon pour l'éditer ;
           × = il RETOURNE à son emplacement d'origine. */
        const pencil = kid
          ? `<a data-action="editElement" title="${game.i18n.localize("SBE.Template.EditElTitle")}"><i class="fa-solid fa-pen"></i></a>`
          : "";
        return `<span class="sbe-chart-chip" ${kid ? `data-el-id="${esc(kid.id)}"` : ""}>${esc(a.label || a.key)}${pencil}<a data-action="chartRemoveAxis" data-chart-id="${esc(el.id)}" data-axis-key="${esc(a.key)}" title="${game.i18n.localize("SBE.Template.ChartRemoveAxis")}">×</a></span>`;
      }).join("");
      const slots = `
        <div class="sbe-chart-slots">
          ${chips}
          <span class="sbe-chart-dropzone" data-chart-id="${esc(el.id)}">
            <i class="fa-solid fa-bullseye"></i> ${game.i18n.localize("SBE.Template.ChartDropHint")}
          </span>
        </div>`;
      return wrap(`${hiddenBadge(el)}${chartHTML(el, chartSampleResolve(el), opts)}${slots}`, "sbe-tpl-el--block");
    }

    case "html":
      /* Atelier : pas de valeurs sous la main — les {{…}} affichent —. */
      return wrap(`${hiddenBadge(el)}<div class="sbe-html">${htmlBlock(el, {})}</div>`, "sbe-tpl-el--block");

    case "effects":
      /* Atelier : deux lignes d'exemple, pour juger du rendu. */
      return wrap(`${hiddenBadge(el)}${effectsListHTML(el, [
        { icon: "icons/svg/aura.svg", label: game.i18n.localize("SBE.Effects.SampleA"), stacks: 2, left: "3 r", doesList: [{ text: game.i18n.localize("SBE.Effects.SampleDoesA"), dir: "is-up" }], canRemove: true },
        { icon: "icons/svg/daze.svg", label: game.i18n.localize("SBE.Effects.SampleB"), stacks: 1, left: "10 min", doesList: [{ text: game.i18n.localize("SBE.Effects.SampleDoesB"), dir: "is-down" }], canRemove: true }
      ], true)}`, "sbe-tpl-el--block");

    case "level": {
      /* Atelier : le niveau, puis SA ZONE : les composants posés dedans
         forment la fenêtre de passage de niveau (absents de la fiche). */
      const lc = levelConfig(el);
      return wrap(`<div class="sbe-level-ws">
        <div class="sbe-level-head">${hiddenBadge(el)}<span style="${sp.label}">${labelIconHTML(el)}${esc(el.label ?? "")}</span>
          <span class="sbe-level"><span class="sbe-level-val">${lc.start}</span>${lc.showMax && lc.max ? `<span class="sbe-num-max">/ ${esc(lc.max)}</span>` : ""}</span>
          <button type="button" class="sbe-level-rulesbtn" data-action="editLevelRules" data-el-id="${esc(el.id)}"><i class="fa-solid fa-list-check"></i> ${esc(game.i18n.format("SBE.Level.RulesBtn", { up: lc.rules.length, down: lc.down.rules.length }))}</button></div>
        <div class="sbe-level-zone">
          <div class="sbe-level-zonetitle"><i class="fa-solid fa-angles-up"></i> ${esc(game.i18n.localize("SBE.Level.WindowZone"))}</div>
          ${addBar(el.id, null, true, "start")}
          ${renderWorkshop(el.children ?? [], opts)}
          ${addBar(el.id)}
        </div></div>`, "sbe-tpl-el--block");
    }

    /* Composants de boutique (modèles de genre « shop ») : un aperçu. */
    case "shopStall": case "shopCash": case "shopPurse": case "shopSell": case "shopSellList": case "shopHistory":
      return wrap(`${hiddenBadge(el)}${shopWorkshopHTML(el)}`, "sbe-tpl-el--block");

    case "talents":
      /* Atelier : l'arbre tel qu'il sera, et le bouton de son éditeur. */
      return wrap(`${hiddenBadge(el)}<div class="sbe-tal-head"><span style="${sp.label}">${labelIconHTML(el)}${esc(el.label ?? "")}</span>
        <button type="button" class="sbe-tal-editbtn" data-action="editTalentTree" data-el-id="${esc(el.id)}"><i class="fa-solid fa-sitemap"></i> ${esc(game.i18n.localize("SBE.Talents.EditTree"))}</button></div>
        ${treeViewHTML(el, { fit: true, height: Math.min(320, Number(el.config?.height) || 320) })}`, "sbe-tpl-el--block");

    case "separator":
      return wrap(`${separatorHTML(el)}${hiddenBadge(el)}`, "sbe-tpl-el--block sbe-tpl-el--sep");

    /* COMPOSANT DU MODÈLE : un composant déjà posé ailleurs, affiché
       aussi ici (même clé, même valeur — rien n'est copié). */
    case "ref": {
      const t = refTargetOf(el, opts.elements);
      const what = t
        ? `${esc(t.label || t.key)} <span class="notes">(${esc(game.i18n.localize(`SBE.Template.Kind.${t.kind}`))} · ${esc(t.key)})</span>`
        : `<span class="sbe-io-warn">${esc(game.i18n.format("SBE.Panel.RefMissing", { key: el.config?.refKey ?? "" }))}</span>`;
      return wrap(`<div class="sbe-ref-el">${hiddenBadge(el)}<i class="fa-solid fa-share"></i> ${what}</div>`, "sbe-tpl-el--block");
    }

    case "text":
      return field(`<input type="text" value="${esc(el.config?.default ?? "")}" style="${fieldWidth(el)}${sp.value}" disabled>`);

    case "color":
      return field(`<input type="color" class="sbe-color-field" value="${esc(colorValue(el.config?.default))}" disabled>`);

    case "number": {
      /* Aperçu « valeur / max » : le maximum saisi, ou sa formule. */
      const pc = el.config ?? {};
      const pMax = String(pc.maxFormula ?? "").trim() || (pc.max !== undefined && pc.max !== "" ? String(pc.max) : "");
      const fieldP = (h) => field(pc.showMax && pMax
        ? `<span class="sbe-num-of">${h}<span class="sbe-num-max">/ ${esc(pMax)}</span></span>` : h);
      if (el.config?.computed) {
        return fieldP(`<input type="text" class="sbe-computed" value="= ${esc(el.config?.formula ?? "")}" style="${fieldWidth(el)}${sp.value}" disabled>`);
      }
      const bf2 = String(el.config?.bonusFormula ?? "").trim();
      if (bf2) {
        return fieldP(`<input type="text" class="sbe-computed sbe-num2" value="${esc(String(el.config?.default ?? 0))} + ${esc(bf2)}" style="${fieldWidth(el)}${sp.value}" disabled>`);
      }
      return fieldP(`<input type="number" value="${esc(el.config?.default ?? "")}" style="${fieldWidth(el)}${sp.value}" disabled>`);
    }

    case "checkbox":
      return field(`<input type="checkbox" ${el.config?.default ? "checked" : ""} disabled>`);

    case "select": {
      const choices = Array.isArray(el.config?.choices) ? el.config.choices : [];
      const def = el.config?.default ?? choices[0] ?? "";
      const optionsHtml = choices.map(c =>
        `<option ${c === def ? "selected" : ""}${choiceStyle(el, c)}>${esc(c)}</option>`).join("");
      return field(`<select style="${sp.value}${selectColor(el, def)}" disabled>${optionsHtml}</select>`);
    }

    case "image": {
      const wPicks = imageChoices(el);
      const wCur = el.config?.default || wPicks[0]?.path || "";
      /* Boutons FONCTIONNELS dans l'atelier aussi : l'aperçu bascule en
         direct (câblage local, rien n'est écrit — l'atelier n'a pas de
         valeurs), pour vérifier ses images sans ouvrir une fiche. */
      const wBtns = wPicks.length
        ? `<span class="sbe-img-pick">${wPicks.map(p => {
            const ic = String(p.icon ?? "").trim()
              ? labelIconHTML({ config: { labelIcon: p.icon } }) : "";
            return `<span class="sbe-img-btn ${p.path === wCur ? "active" : ""}" data-preview-img="${esc(p.path)}">${ic}${esc(p.label ?? "")}</span>`;
          }).join("")}</span>`
        : "";
      const wPos = pickerPosOf(el);
      const wImg = imageBox(el, wCur, false);
      const wFirst = wPos.startsWith("top") || wPos.startsWith("left");
      return field(`<div class="sbe-obj-el-imgwrap sbe-obj-el-imgwrap--choice sbe-imgpick--${esc(wPos)}">
        ${wFirst ? `${wBtns}${wImg}` : `${wImg}${wBtns}`}
      </div>`);
    }

    case "actorImg": {
      /* NATIF posé dans la page : portrait du document (clic = changer).
         Config/style depuis system.nativeUi (opts.nativeUi). */
      const p = nativeUiParts("img", opts.nativeUi?.img);
      return wrap(`<img class="sbe-native-img ${p.cls}" src="${esc(opts.docImg || "icons/svg/mystery-man.svg")}"
        data-action="pickImage" title="${game.i18n.localize("SBE.Common.Image")}" style="${p.css}" alt="">`,
        "sbe-tpl-el--block sbe-el--native");
    }

    case "actorName": {
      /* NATIF posé dans la page : nom du document (édition directe). */
      const p = nativeUiParts("name", opts.nativeUi?.name);
      const sub = opts.nativeUi?.name?.config?.subLabel;
      return wrap(`<span class="sbe-native-namebox">
        <input type="text" class="sbe-native-name" name="name" value="${esc(opts.docName ?? "")}" style="${p.css}">
        ${sub ? `<span class="sbe-native-sub">${esc(sub)}</span>` : ""}
      </span>`, "sbe-el--native");
    }

    case "gauge":
      return field(gaugeHTML(el, el.config?.default));

    case "table":
      return wrap(renderTableWorkshop(el), "sbe-tpl-el--block");

    case "richtext": {
      const pos = labelPos(el);
      const title = el.label
        ? `<div class="sbe-rich-title" style="${sp.label};${headerStyles(el)}text-align:${labelAlign(pos)};">${hiddenBadge(el)}${esc(el.label)}</div>`
        : (hiddenBadge(el) ? `<div class="sbe-rich-title">${hiddenBadge(el)}</div>` : "");
      const rc = richOpts(el);
      const box = `<div class="sbe-richtext-preview${rc.cls}" style="${rc.css}"><div class="editor-content">${game.i18n.localize("SBE.Rich.Preview")}</div></div>`;
      const body = pos.startsWith("below") ? box + title : title + box;
      return wrap(body, "sbe-tpl-el--block");
    }

    case "quantity": {
      /* Élément NATIF Quantité : clé réservée, un seul par modèle, et
         seulement si le modèle est empilable. Décoché après coup :
         l'élément reste, signalé — jamais rien supprimé dans le dos. */
      const warn = opts.stackable === false
        ? `<span class="sbe-el-warn" data-tooltip-html="${esc(game.i18n.localize("SBE.Inv.QtyNeedsStack"))}"><i class="fa-solid fa-triangle-exclamation"></i></span>`
        : "";
      return field(`${warn}<input type="number" value="${esc(el.config?.default ?? 1)}" style="${fieldWidth(el)}${sp.value}" disabled>`);
    }

    case "container":
      /* Enveloppe neutre : l'atelier montre EXACTEMENT ce que la fiche
         affichera, style compris (le style habille la boîte). */
      return wrap(`${hiddenBadge(el)}${el.label || el.config?.labelIcon
        ? `<div class="sbe-cont-title" style="${sp.label}">${labelIconHTML(el)}${esc(el.label ?? "")}</div>` : ""}
        ${containerHTML(el, opts, false)}`, "sbe-tpl-el--block", "");

    case "slot":
      /* Le style habille la BOÎTE du slot, pas l'enveloppe : l'atelier
         montre exactement ce que la fiche affichera. */
      return wrap(`
        <div class="sbe-slot sbe-slot--empty" data-key="${esc(el.key ?? "")}" style="${slotSizeStyle(el)}${sp.wrap}">
          ${slotEmptyDecor(el, true)}
        </div>`, "sbe-tpl-el--block", "");

    case "tags": {
      const entries = (Array.isArray(el.config?.entries) ? el.config.entries : []).filter(Boolean);
      const hl = tagHighlight(el);
      const badges = entries.map((t, i) => {
        const bound = t.startsWith("@");
        return `<span class="sbe-tag${tagIsHot(hl, i, bound) ? " sbe-tag--hot" : ""}${bound ? " sbe-tag--bound" : ""}">${esc(t)}</span>`;
      }).join("");
      return wrap(`
        <div class="sbe-tags-row">${hiddenBadge(el)}${badges || `<span class="sbe-tbl-free">${game.i18n.localize("SBE.Tags.EmptyHint")}</span>`}
          <span class="sbe-tags-note">${game.i18n.localize(el.config?.place === "header" ? "SBE.Tags.HeaderNote" : "SBE.Tags.TopNote")}</span>
        </div>`, "sbe-tpl-el--block");
    }

    case "button": {
      const isMenu = el.config?.action === "menu";
      const face = buttonFace(el, { inert: true });
      if (!isMenu) {
        return wrap(`<div class="sbe-btn-row">${hiddenBadge(el)}${face}</div>`, "sbe-tpl-el--block");
      }
      return wrap(`
        <div class="sbe-btn-row">${hiddenBadge(el)}${face}<span class="sbe-btn-menumark">▾</span></div>
        <div class="sbe-btn-children">
          ${addBar(el.id, null, true, "start")}
          ${renderWorkshop(el.children ?? [], opts)}
          ${addBar(el.id)}
        </div>`, "sbe-tpl-el--block");
    }

    default:
      return wrap(`
        ${label()}
        <span class="sbe-tpl-el-unknown">${game.i18n.localize("SBE.Template.UnknownKind")} (${esc(el.kind)})</span>`);
  }
}

/* ============================================================ */
/*  Rendu FICHE (sheet)                                          */
/* ============================================================ */

/**
 * Libellé de la SOURCE d'un bonus « 2 en 1 » : le libellé/icône des
 * CLÉS citées par la formule — l'attribut d'origine parle de lui-même
 * (agi → « Agilité »). Rien de trouvable → « - ».
 */
function bonusSrcHTML(el, opts) {
  /* Le texte entre guillemets n'est pas une source : dans
     carried("bonus_agi", "slot_classe"), ce sont des noms de clé et
     de contenant — les objets portés se nomment eux-mêmes. */
  const ids = extractIdentifiers(el?.config?.bonusFormula);
  if (!ids.length) return "-";
  const wanted = new Set(ids);
  const heads = new Map();   /* clé → en-tête, sans doublon */
  for (const e of walkElements(opts?.elements ?? [])) {
    if (!e?.key || heads.has(e.key) || !wanted.has(e.key)) continue;
    if (e.key === el.key) continue;   /* auto-référence : pas une source */
    heads.set(e.key, ttHeadHTML(e));
  }
  /* Ordre d'apparition dans la formule. */
  const out = [];
  for (const id of ids) {
    if (heads.has(id) && !out.includes(heads.get(id))) out.push(heads.get(id));
  }
  return out.length ? out.join(" + ") : "-";
}

/** Contenu HTML de l'info-bulle configurée d'un élément (crayon →
    onglet Info-bulle) : contenu interpolé + formule + apports colorés,
    assaini comme le HTML libre. Retourne "" si désactivée. Si activée
    mais qu'aucune section ne produit rien (pas de texte, pas de
    formule sur l'élément, aucun apport non nul), REPLI : libellé +
    valeur courante — la bulle activée affiche toujours quelque chose. */
export function elementTtHtml(el, opts = {}) {
  const t = el?.config?.tt;
  if (!t?.on) return "";
  const scope = withLookups({ ...(opts.values ?? {}), ...(opts.computedResults ?? {}) }, opts.elements);
  const parts = [];
  /* Tout nombre SAISI (pas calculé) : sous le texte (qui donne le
     total), la ligne « Base : x », puis les lignes de bonus/malus. */
  const T = (k) => game.i18n.localize(k);
  const baseV = Number((opts.values ?? {})[el?.key] ?? el?.config?.default ?? 0) || 0;
  const totV = Number(scope[el?.key]);
  const showBT = !t.noBase && el?.kind === "number" && !el.config?.computed && !!el.key && Number.isFinite(totV);
  /* La formule s'affiche EN TÊTE de bulle, avant le texte libre. */
  if (t.formula && el.config?.computed && el.config?.formula) {
    parts.push(`<div class="sbe-tt-formula">ƒ ${esc(el.config.formula)}</div>`);
  }
  /* « 2 en 1 » : la formule de bonus se lit AU MÊME ENDROIT, en tête. */
  if (t.formula && !el.config?.computed && String(el.config?.bonusFormula ?? "").trim()) {
    parts.push(`<div class="sbe-tt-formula">ƒ ${esc(String(el.config.bonusFormula).trim())}</div>`);
  }
  if (t.text) {
    parts.push(interpolateHtml(sanitizeHtml(t.text), scope).replace(/\n/g, "<br>"));
  }
  if (showBT) {
    parts.push(`<div class="sbe-tt-base">${esc(T("SBE.Tooltip.Base"))} : ${esc(String(baseV))}</div>`);
  }
  /* « 2 en 1 » : le bonus/malus produit par la formule se lit SOUS le
     texte, montant coloré puis libellé de sa source (« - » si aucun).
     Rien à afficher quand l'apport est nul. */
  const bfTt = String(el?.config?.bonusFormula ?? "").trim();
  if (bfTt && !el.config?.computed && el.key) {
    const bonus = Number.isFinite(totV) ? totV - baseV : 0;
    /* Les objets portés lus par la formule (une classe dans son slot,
       des compétences…) se nomment eux-mêmes : une ligne par objet,
       icône, nom, montant — quand ils expliquent TOUT le bonus. */
    const srcs = bonus ? carriedSources(opts.inventory, bfTt) : [];
    /* Le reste de la formule (un attribut…) : une ligne, sa source. */
    const rest = bonus - srcs.reduce((n, x) => n + x.delta, 0);
    if (rest) {
      const col = rest > 0 ? "#5cb85c" : "#e57373";
      parts.push(`<div><span style="color:${col};font-weight:700">${rest > 0 ? "+" + rest : rest}</span> <span class="sbe-tt-src">${bonusSrcHTML(el, opts)}</span></div>`);
    }
    for (const x of srcs) {
      parts.push(`<div class="sbe-tt-fx">${x.img ? `<img src="${esc(x.img)}" alt="">` : ""}<span class="sbe-tt-fx-name">${esc(x.name)}</span><span class="sbe-tt-fx-val ${x.delta > 0 ? "is-up" : "is-down"}">${x.delta > 0 ? "+" + x.delta : x.delta}</span></div>`);
    }
  }
  if (t.bonus && el.key) {
    for (const suf of ["bonus", "min", "max", "bas", "haut"]) {
      const bv = Number(scope[`${el.key}_${suf}`]);
      if (Number.isFinite(bv) && bv !== 0) {
        const col = bv > 0 ? "#5cb85c" : "#e57373";
        parts.push(`<div><span style="color:${col};font-weight:700">${bv > 0 ? "+" + bv : bv}</span> <span class="sbe-tt-src">${esc(suf)}</span></div>`);
      }
    }
  }
  /* EFFETS (et tout apport nommé) sur cette clé : une ligne par
     source — icône, nom, montant (vert en bonus, rouge en malus). */
  if (t.bonus && el.key) {
    for (const l of opts.breakdown?.[el.key]?.lines ?? []) {
      const dir = l.delta > 0 ? " is-up" : (l.delta < 0 ? " is-down" : "");
      parts.push(`<div class="sbe-tt-fx">${l.img ? `<img src="${esc(l.img)}" alt="">` : ""}<span class="sbe-tt-fx-name">${esc(l.label)}</span><span class="sbe-tt-fx-val${dir}">${esc(l.text)}</span></div>`);
    }
  }
  if (!parts.length) {
    const val = scope[el.key];
    parts.push(`<div><b>${ttHeadHTML(el)}</b>${val !== undefined && val !== null && val !== "" ? ` : ${esc(String(val))}` : ""}</div>`);
  }
  const style = t.color ? ` style="color:${esc(cleanUrl(t.color))}"` : "";
  return `<div class="sbe-tt"${style}>${parts.join("")}</div>`;
}

/** Attribut d'info-bulle prêt à poser (ou "").
    data-tooltip-html : la v14 réserve data-tooltip aux clés de langue
    (contenu potentiellement localisé/échappé — la bulle ne sortait pas). */
function ttAttrOf(el, opts) {
  const html = elementTtHtml(el, opts);
  return html ? ` data-tooltip-html="${esc(html)}"` : "";
}

/**
 * « Visible si » : l'élément ne s'affiche que si son expression est
 * vraie dans la portée courante de la fiche. Vide = toujours visible.
 * Une expression en échec MASQUE l'élément (choix prudent : mieux vaut
 * un bloc absent qu'un bloc affiché à tort — les PV secrets d'un PNJ,
 * un onglet réservé…). La clé et sa valeur restent utilisables par les
 * formules, exactement comme « masqué sur la fiche ».
 */
export function isVisibleNow(el, opts = {}) {
  const expr = String(el?.visibleIf ?? "").trim();
  if (!expr) return true;
  const res = evalExpression(expr, sheetScope(opts));
  return res === null ? false : !!res;
}

/**
 * La portée des formules de la fiche affichée : valeurs, résultats
 * calculés, tables de correspondance ET objets portés — la même que
 * celle des champs calculés. Une condition écrite une fois se lit
 * partout pareil.
 */
export function sheetScope(opts = {}) {
  const scope = withLookups(
    { ...(opts.values ?? {}), ...(opts.computedResults ?? {}) }, opts.elements);
  return opts.inventory ? withCarried(scope, opts.inventory) : scope;
}

/**
 * Bouton à étapes : la raison qui l'empêche en ce moment (première
 * condition fausse), "" s'il est possible. Même règle que le menu
 * contextuel : visible, grisé, la raison au survol.
 */
function stepsBlocked(el, opts) {
  if (el.config?.action !== "steps") return "";
  let scope = null;
  for (const st of (el.config?.steps ?? [])) {
    if (st?.type !== "condition" || !String(st.formula ?? "").trim()) continue;
    scope ??= sheetScope(opts);
    const r = evalExpression(String(st.formula), scope);
    if (r === null || !r) return String(st.message ?? "").trim() || game.i18n.localize("SBE.Steps.Impossible");
  }
  return "";
}

/**
 * @param {Array} list   Arbre d'éléments du template.
 * @param {object} opts  { values, isGM, navActive }
 */
export function renderSheet(list, opts = {}) {
  let html = "";
  for (const el of (list ?? [])) {
    if (!el) continue;
    /* Visibilité hiérarchique : caché aux joueurs, MJ voit tout. */
    /* Masqué sur la fiche TOUT COURT (même MJ) : la clé et sa valeur
       existent toujours pour les formules, mais rien n'est affiché. */
    if (el.sheetHidden) continue;
    if (el.playerVisible === false && !opts.isGM) continue;
    /* VISIBLE SI : condition évaluée sur l'état courant de la fiche. */
    if (!isVisibleNow(el, opts)) continue;
    html += sheetElement(el, opts);
  }
  return markCssTargets(html);
}

function sheetElement(el, opts) {
  const values = opts.values ?? {};
  const has = el.key in values;
  const val = has ? values[el.key] : el.config?.default;
  const badge = opts.isGM ? hiddenBadge(el) : "";
  /* « Modifiable par le joueur » décoché : le joueur VOIT le champ
     mais sa zone de saisie est verrouillée (le MJ garde la main). */
  const lock = (!opts.isGM && el.playerEditable === false) ? "disabled" : "";
  /* Portée de la fiche : sert aux fonds de cadre interpolés. */
  const bgScope = { ...(opts.values ?? {}), ...(opts.computedResults ?? {}) };
  const sp = styleParts(el, bgScope);
  /* INFO-BULLE configurée (crayon → onglet Info-bulle). */
  const ttAttr = ttAttrOf(el, opts);
  /* Aucun libellé, aucune icône, aucun badge : pas de colonne de
     libellé réservée — le champ prend TOUTE la largeur. C'est ce qui
     étranglait les images posées seules dans une colonne. */
  const bare = !String(el.label ?? "").trim() && !String(el.config?.labelIcon ?? "").trim() && !badge;
  const row = (inner, extraClass = "") => `<div class="sbe-obj-el ${extraClass}${bare ? " sbe-el--nolabel" : ""}" data-key="${esc(el.key)}"${ttAttr} style="${sp.wrap}">${inner}</div>`;
  /* JET AU CLIC (crayon → Jet de dés) : le LIBELLÉ devient le bouton —
     le champ garde sa saisie, aucun élément supplémentaire n'est ajouté. */
  const rollOn = !!(el.config?.roll?.on && el.config?.roll?.formula);
  const rollIcon = rollOn && !el.config.roll.noIcon
    ? diceIconHTML(el.config.roll.icon) : "";
  const label = () => rollOn
    ? `<label class="sbe-roll-label" style="${sp.label}" data-action="rollField" data-key="${esc(el.key)}"
         data-tooltip-text="${esc(game.i18n.localize("SBE.Roll.ClickHint"))}">${badge}${rollIcon}${labelIconHTML(el)}${esc(el.label ?? "")}</label>`
    : `<label style="${sp.label}">${badge}${labelIconHTML(el)}${esc(el.label ?? "")}</label>`;
  /* Position du libellé (Style) : côté g./d., dessus, dessous. */
  const field = (control) => {
    const pos = labelPos(el);
    if (pos === "side-left") return row(`${label()}${control}`);
    if (pos === "side-right") return row(`${control}${label()}`, "sbe-el--side-right");
    const lbl = `<div class="sbe-el-labelblock" style="text-align:${labelAlign(pos)};">${label()}</div>`;
    /* Le CHAMP suit l'alignement du libellé (au-dessus/en dessous centré → champ centré). */
    const ctl = `<div style="text-align:${labelAlign(pos)};">${control}</div>`;
    const body = pos.startsWith("above") ? `${lbl}${ctl}` : `${ctl}${lbl}`;
    return row(body, "sbe-el--stack");
  };

  switch (el.kind) {

    case "frame": {
      /* Non repliable (choix du MJ) : toujours ouvert, flèche masquée,
         clic sur le bandeau inerte. */
      const fixed = !!el.config?.noCollapse;
      const open = (fixed || !el.config?.startCollapsed) ? "open" : "";
      const fs = frameStyles(el, bgScope);
      const bare = el.config?.bare ? " sbe-frame--bare" : "";
      const above = el.config?.titlePos === "above";
      return `
        <details class="sbe-frame${bare}${fixed ? " sbe-frame--fixed" : ""}${above ? " sbe-frame--title-above" : ""}" ${open} data-sync data-fid="${esc(el.id)}" data-key="${esc(el.key ?? "")}" style="${above ? "" : fs.box}">
          <summary style="${fs.head}"><i class="fa-solid fa-caret-right sbe-frame-caret"></i>${badge}${labelIconHTML(el)}${esc(el.label ?? "")}</summary>
          ${isFreeFrame(el) ? `
          <div class="sbe-frame-body sbe-frame-body--free" data-free-zone="${esc(el.id)}"
               style="${above ? fs.box : ""}${freeBodyStyle(el)}">
            ${renderFree(el.children ?? [], opts, "sheet")}
          </div>` : `
          <div class="sbe-frame-body"${above ? ` style="${fs.box}"` : ""}>
            ${renderSheet(el.children ?? [], opts)}
          </div>`}
        </details>`;
    }

    case "columns": {
      const count = Math.min(10, Math.max(2, Number(el.config?.count ?? 2)));
      let cols = "";
      for (let i = 0; i < count; i++) {
        cols += `<div class="sbe-col">${renderSheet(el.cols?.[i] ?? [], opts)}</div>`;
      }
      /* Le style de l'élément habille la GRILLE — même nœud qu'à l'atelier. */
      return `<div class="sbe-cols${el.config?.equalHeight ? " sbe-cols--equal" : ""}" data-key="${esc(el.key ?? "")}" style="grid-template-columns:${colsTemplate(el, count)};${sp.wrap}">${cols}</div>`;
    }

    case "nav": {
      const tabs = (el.children ?? []).filter(t => t?.kind === "tab")
        .filter(t => (opts.isGM || t.playerVisible !== false) && isVisibleNow(t, opts));
      if (!tabs.length) return "";
      const activeId = opts.navActive?.[el.id] ?? tabs[0]?.id;
      const nl = navLayout(el);
      let bar = "";
      for (const t of tabs) {
        bar += `
          <a class="sbe-navtab ${t.id === activeId ? "active" : ""}"
             data-action="switchNavTab" data-nav="${esc(el.id)}" data-tab="${esc(t.id)}"${tabTooltip(t)}>
            ${opts.isGM ? hiddenBadge(t) : ""}${tabIcon(t)}${esc(t.label ?? "")}
          </a>`;
      }
      const active = tabs.find(t => t.id === activeId);
      const body = active ? `<div class="sbe-navtab-body">${renderSheet(active.children ?? [], opts)}</div>` : "";
      const navHtml = `<div class="sbe-navbar${nl.barCls}" data-key="${esc(el.key ?? "")}">${bar}</div>${body}`;
      return nl.vertical ? `<div class="${nl.wrapCls}">${navHtml}</div>` : navHtml;
    }

    case "chart": {
      /* Données LIVE : clés de la fiche, champs calculés compris. */
      const cr = opts.computedResults ?? {};
      const cv = opts.values ?? {};
      /* Les champs déplacés DANS le graphe n'ont plus de zone de saisie
         sur la fiche : un bouton ouvre une petite fenêtre où l'on
         renseigne d'un coup tous ceux qui sont saisissables (non
         calculés, et modifiables par cet utilisateur). */
      const editable = (Array.isArray(el.children) ? el.children : []).filter(k =>
        k?.key && ["number", "gauge"].includes(k.kind) && !k.config?.computed
        && (opts.isGM || k.playerEditable !== false));
      const editBtn = editable.length
        ? `<a class="sbe-chart-edit" data-action="editChartValues" data-el-id="${esc(el.id)}"
              data-tooltip-text="${esc(game.i18n.localize("SBE.Template.ChartEditValues"))}"><i class="fa-solid fa-pen-to-square"></i></a>`
        : "";
      return row(`${editBtn}${chartHTML(el, (k) => cr[k] ?? cv[k], opts)}`, "sbe-obj-el--block sbe-obj-el--chart");
    }

    case "html": {
      /* Portée LIVE : valeurs de la fiche + champs calculés. */
      const scope = withLookups({ ...(opts.values ?? {}), ...(opts.computedResults ?? {}) }, opts.elements);
      return row(`<div class="sbe-html">${htmlBlock(el, scope)}</div>`, "sbe-obj-el--block");
    }

    case "effects":
      return row(effectsListHTML(el, opts.activeEffects ?? [], false), "sbe-obj-el--block");

    case "level": {
      /* Le niveau (sa valeur : un nombre), et au choix « / max », une
         jauge (XP vers le prochain seuil, ou niveau vers le max) et le
         bouton « Passer au niveau ». Ses enfants (la fenêtre de passage)
         ne s'affichent pas ici. */
      const granted = opts.live ? opts.hostDoc?.flags?.["system-builder-engine"]?.levelGranted?.[el.key] : 0;
      const ls = levelState(el, opts.values ?? {}, sheetScope(opts), evalExpression, granted);
      const T = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
      const edit = opts.live && opts.isGM;
      const val = edit
        ? `<input type="number" class="sbe-level-input" name="system.values.${esc(el.key)}" value="${ls.level}" step="1" min="0" data-tooltip-text="${esc(T("SBE.Level.GmEdit"))}">`
        : `<span class="sbe-level-val">${ls.level}</span>`;
      const maxH = ls.cfg.showMax && ls.max !== null ? `<span class="sbe-num-max">/ ${ls.max}</span>` : "";
      const gauge = ls.gauge
        ? `<div class="sbe-level-gauge" data-tooltip-text="${esc(ls.gauge.text)}"><span style="width:${Math.round(ls.gauge.pct * 100)}%"></span><em>${esc(ls.gauge.text)}</em></div>` : "";
      /* Demande au MJ en attente : le repère, et « Retirer la demande ». */
      const pend = opts.live ? opts.hostDoc?.flags?.["system-builder-engine"]?.levelPending?.[el.key] : null;
      const mayPass = opts.isGM || ls.cfg.who !== "gm";
      const btn = pend
        ? `<span class="sbe-level-pending"><i class="fa-solid fa-hourglass-half"></i> ${esc(T(pend.op === "down" ? "SBE.Level.PendingDownTo" : "SBE.Level.PendingTo", { n: pend.to }))}</span>
           <button type="button" class="sbe-level-up" data-level-cancel="${esc(el.id)}"><i class="fa-solid fa-xmark"></i> ${esc(T("SBE.Talents.CancelAsk"))}</button>`
        : (ls.cfg.button && ls.ready > 0 && opts.live && mayPass
          ? `<button type="button" class="sbe-level-up" data-level-up="${esc(el.id)}"><i class="fa-solid fa-angles-up"></i> ${esc(T("SBE.Level.LevelUp", { n: ls.level + 1 }))}${ls.ready > 1 ? ` <small>(+${ls.ready})</small>` : ""}</button>`
          : (ls.cfg.button && ls.ready > 0 && opts.live ? `<span class="sbe-level-pending">${esc(T("SBE.Level.ReadyGm", { n: ls.level + 1 }))}</span>` : ""));
      /* « Descendre d'un niveau » (réglage du composant) et l'historique. */
      const dn = ls.cfg.down;
      const host = opts.live ? opts.hostDoc : null;
      const mayDown = host && !pend && dn.who !== "none" && (dn.undo || dn.rules.length) && ls.level > ls.cfg.start
        && (opts.isGM || (dn.who !== "gm" && host.isOwner));
      const down = mayDown
        ? `<button type="button" class="sbe-level-icon" data-level-down="${esc(el.id)}" data-tooltip-text="${esc(T("SBE.Level.GoDown", { n: ls.level - 1 }))}" aria-label="${esc(T("SBE.Level.GoDown", { n: ls.level - 1 }))}"><i class="fa-solid fa-angles-down"></i></button>` : "";
      const hasLog = (host?.flags?.["system-builder-engine"]?.levelLog?.[el.key] ?? []).length > 0;
      const hist = host && hasLog && (opts.isGM || ls.cfg.historyPlayers)
        ? `<button type="button" class="sbe-level-icon" data-level-history="${esc(el.id)}" data-tooltip-text="${esc(T("SBE.Level.History"))}" aria-label="${esc(T("SBE.Level.History"))}"><i class="fa-solid fa-clock-rotate-left"></i></button>` : "";
      return field(`<span class="sbe-level-line"><span class="sbe-level">${val}${maxH}</span>${gauge}${btn}${down}${hist}</span>`);
    }

    /* Composants de boutique : lus sur opts.shop (fenêtre de boutique). */
    case "shopStall": case "shopCash": case "shopPurse": case "shopSell": case "shopSellList": case "shopHistory":
      return row(shopSheetHTML(el, opts), "sbe-obj-el--block sbe-obj-el--shop");

    case "talents":
    {
      /* « Bouton qui ouvre une fenêtre » : l'arbre en grand, à part. */
      const live = opts.live ? (opts.hostDoc ?? null) : null;
      if (el.config?.display === "window") {
        return row(`<button type="button" class="sbe-tal-openbtn" ${live ? `data-tal-open="${esc(el.id)}"` : "disabled"}>
          <i class="fa-solid fa-sitemap"></i> ${labelIconHTML(el)}${esc(el.label || game.i18n.localize("SBE.Talents.Tree"))}</button>`, "sbe-obj-el--talents");
      }
      return row(`${el.label ? `<div class="sbe-tal-title" style="${sp.label}">${labelIconHTML(el)}${esc(el.label)}</div>` : ""}${treeViewHTML(el, { doc: live })}`,
        "sbe-obj-el--block sbe-obj-el--talents");
    }

    case "separator":
      return separatorHTML(el);

    /* COMPOSANT DU MODÈLE : rendu du composant visé, avec ses propres
       règles de visibilité. */
    case "ref": {
      const t = refTargetOf(el, opts.elements);
      if (!t) return "";
      /* Son propre libellé s'il en a un, ou aucun (« sans libellé ») ;
         vide = celui du composant. Même id, même clé : tout le reste suit. */
      const noLabel = !!el.config?.noLabel;
      const own = String(el.label ?? "").trim();
      /* « Masqué sur la fiche » ne vaut que pour la fiche : un composant
         montré exprès dans le panneau (bouton réservé à l'objet posé) s'y voit. */
      const shown = (noLabel || own)
        ? { ...t, sheetHidden: false, label: noLabel ? "" : own, config: { ...(t.config ?? {}), ...(noLabel ? { labelIcon: "" } : {}) } }
        : { ...t, sheetHidden: false };
      return renderSheet([shown], opts);
    }

    case "text":
      return field(`<input type="text" name="system.values.${esc(el.key)}" value="${esc(val ?? "")}" style="${fieldWidth(el)}${sp.value}" ${lock}>`);

    /* COULEUR : un nuancier ; la valeur est « #rrggbb » (lisible dans
       les formules et par « @clé » des effets). */
    case "color":
      return field(`<input type="color" class="sbe-color-field" name="system.values.${esc(el.key)}" value="${esc(colorValue(val ?? el.config?.default))}" ${lock}>`);

    case "number": {
      const c = el.config ?? {};
      /* Apports nommés (effets…) sur cette clé : couleur + détail. */
      const ct = contribTooltip(opts.breakdown?.[el.key]);
      /* Maximum effectif (saisi ou formule, + « clé_max ») et, au choix,
         « valeur / max » à côté du champ — comme le texte d'une jauge. */
      const nv = { ...(opts.values ?? {}), ...(opts.computedResults ?? {}) };
      const nBase = numberBaseMax(el, sheetScope(opts));
      const nMax = nBase !== null ? Math.round((nBase + (Number(nv[`${el.key}_max`]) || 0)) * 1000) / 1000 : null;
      const fieldN = (h) => field(c.showMax && nMax !== null
        ? `<span class="sbe-num-of">${h}<span class="sbe-num-max">/ ${esc(String(nMax))}</span></span>` : h);
      if (c.computed) {
        const res = opts.computedResults?.[el.key];
        const shown = (res === null || res === undefined) ? "—" : String(res);
        /* Avec des apports, le détail remplace le rappel de formule
           (un champ désactivé ne reçoit pas le survol : il passe par
           l'enveloppe). */
        if (ct.attr) {
          return fieldN(`<span class="sbe-contrib-wrap"${ct.attr}><input type="text" class="sbe-computed sbe-num2${ct.cls}" value="${esc(shown)}" style="${fieldWidth(el)}${sp.value}" disabled></span>`);
        }
        return fieldN(`<input type="text" class="sbe-computed" value="${esc(shown)}" style="${fieldWidth(el)}${sp.value}" disabled
                 title="= ${esc(c.formula ?? "")}">`);
      }
      const step = (c.integer !== false) ? 1 : Math.pow(10, -(c.decimals ?? 2));
      /* Sous-clés réservées « clé_min » / « clé_max » : leur valeur
         s'AJOUTE au min/max de base (bonus/malus dynamiques). */
      const vals = opts.values ?? {};
      const minMod = Number(vals[`${el.key}_min`]) || 0;
      const min = c.min !== undefined ? `min="${Number(c.min) + minMod}"` : "";
      const max = nMax !== null ? `max="${nMax}"` : "";
      /* « 2 en 1 » : valeur saisie + bonus de formule, le champ montre
         le TOTAL. Pas d'attribut name → la soumission du formulaire ne
         peut pas écraser la base par le total ; l'enregistrement passe
         par le clic/blur (live-sheet-mixin). */
      const bf = String(c.bonusFormula ?? "").trim();
      /* Valeur modifiée par des apports : même mécanique que le « 2 en
         1 » — le champ montre le TOTAL, la saisie modifie la BASE, la
         couleur et le survol disent pourquoi. */
      if (ct.attr && !lock) {
        const base = Number(val ?? c.default ?? 0) || 0;
        const tot = opts.computedResults?.[el.key];
        const shown = (tot === null || tot === undefined) ? base : tot;
        return fieldN(`<input type="number" class="sbe-num2${ct.cls}"${ct.attr}
          data-key="${esc(el.key)}" data-base="${esc(String(base))}" value="${esc(String(shown))}"
          step="${step}" ${min} ${max} style="${fieldWidth(el)}${sp.value}">`);
      }
      if (ct.attr && lock) {
        const tot = opts.computedResults?.[el.key];
        return fieldN(`<span class="sbe-contrib-wrap"${ct.attr}><input type="number" class="sbe-num2${ct.cls}" value="${esc(String(tot ?? val ?? ""))}" style="${fieldWidth(el)}${sp.value}" disabled></span>`);
      }
      if (bf) {
        const base = Number(val ?? c.default ?? 0) || 0;
        const tot = opts.computedResults?.[el.key];
        const shown = (tot === null || tot === undefined) ? base : tot;
        const bonus = Number(shown) - base;
        /* Le bonus de FORMULE (apport de base du modèle) ne colore PAS
           la valeur : il est déjà lisible dans l'info-bulle. Seul un
           repère neutre est posé, pour un habillage CSS au choix du
           créateur — la couleur restera réservée aux apports variables
           (effets, équipement) quand ils arriveront. */
        /* …sauf si le créateur demande explicitement la couleur pour
           CE champ (case « colorer la valeur »). */
        /* Seule la part qui vient d'OBJETS PORTÉS (classe, équipement,
           compétences : carried…) colore la valeur : la part fixe de
           la formule (un attribut) est la base, elle reste neutre. */
        const mode = BONUS_TONES.includes(c.bonusTone) ? c.bonusTone : "items";
        const tone = mode === "all" ? bonus
          : mode === "items" ? carriedSources(opts.inventory, bf).reduce((n, x) => n + x.delta, 0) : 0;
        const bCol = tone ? (tone > 0 ? " sbe-num2--up" : " sbe-num2--down") : "";
        return fieldN(`<input type="number" class="sbe-num2${bCol}"
          ${bonus ? `data-bonus="${esc(String(bonus))}" data-bonus-sign="${bonus > 0 ? "up" : "down"}"` : ""}
          data-key="${esc(el.key)}" data-base="${esc(String(base))}" value="${esc(String(shown))}"
          step="${step}" ${min} ${max} style="${fieldWidth(el)}${sp.value}" ${lock}>`);
      }
      return fieldN(`<input type="number" name="system.values.${esc(el.key)}" value="${esc(val ?? "")}" step="${step}" ${min} ${max} style="${fieldWidth(el)}${sp.value}" ${lock}>`);
    }

    case "checkbox":
      return field(`<input type="checkbox" name="system.values.${esc(el.key)}" ${val ? "checked" : ""} ${lock}>`);

    case "select": {
      const choices = Array.isArray(el.config?.choices) ? el.config.choices : [];
      const cur = (val != null && choices.includes(val)) ? val : (choices[0] ?? "");
      const optionsHtml = choices.map(c =>
        `<option value="${esc(c)}" ${c === cur ? "selected" : ""}${choiceStyle(el, c)}>${esc(c)}</option>`).join("");
      return field(`<select name="system.values.${esc(el.key)}" style="${sp.value}${selectColor(el, cur)}" ${lock}>${optionsHtml}</select>`);
    }

    case "image": {
      /* IMAGES NOMMÉES : le joueur choisit dans une liste de NOMS ; la
         valeur enregistrée est le CHEMIN, donc la clé sert telle quelle
         ailleurs (fond de cadre, formule, info-bulle). Sans choix
         déclaré, on garde le comportement d'origine : clic sur l'image
         → sélecteur de fichiers. */
      const picks = imageChoices(el);
      if (picks.length) {
        const cur = picks.some(p => p.path === val) ? val : (val || picks[0].path);
        /* Choix rendus en BOUTONS et non en menu : c'est le seul moyen
           d'afficher une icône PAR CHOIX (une balise <option> ne sait
           pas rendre une icône). Icône seule, nom seul, ou les deux. */
        const pos = pickerPosOf(el);
        const btns = picks.map(p => {
          const ic = String(p.icon ?? "").trim()
            ? labelIconHTML({ config: { labelIcon: p.icon } }) : "";
          const nm = esc(p.label ?? "");
          return `<a class="sbe-img-btn ${p.path === cur ? "active" : ""}"
            data-action="pickImgChoice" data-key="${esc(el.key)}" data-path="${esc(p.path)}">${ic}${nm}</a>`;
        }).join("");
        const sel = lock ? "" : `<span class="sbe-img-pick">${btns}</span>`;
        const img = imageBox(el, cur, false);
        const first = pos.startsWith("top") || pos.startsWith("left");
        const inner = first ? `${sel}${img}` : `${img}${sel}`;
        return field(`<div class="sbe-obj-el-imgwrap sbe-obj-el-imgwrap--choice sbe-imgpick--${esc(pos)}">${inner}</div>`);
      }
      return field(`<div class="sbe-obj-el-imgwrap">${imageBox(el, val ?? "", true)}</div>`);
    }

    case "actorImg": {
      /* NATIF posé dans la page : portrait/icône du document. */
      const p = nativeUiParts("img", opts.nativeUi?.img);
      return row(`<img class="sbe-native-img ${p.cls}" src="${esc(opts.docImg || "icons/svg/mystery-man.svg")}"
        data-action="pickImage" title="${game.i18n.localize("SBE.Common.Image")}" style="${p.css}" alt="">`,
        "sbe-obj-el--block");
    }

    case "actorName": {
      /* NATIF posé dans la page : nom du document. */
      const p = nativeUiParts("name", opts.nativeUi?.name);
      const sub = opts.nativeUi?.name?.config?.subLabel;
      return row(`<span class="sbe-native-namebox">
        <input type="text" class="sbe-native-name" name="name" value="${esc(opts.docName ?? "")}" style="${p.css}">
        ${sub ? `<span class="sbe-native-sub">${esc(sub)}</span>` : ""}
      </span>`);
    }

    case "gauge": {
      /* Sous-clés réservées : _min/_max (bornes) et _bas/_haut (seuils %).
         Lues APRÈS apports : un effet sur « pv_max » bouge la jauge. */
      const gv = { ...(opts.values ?? {}), ...(opts.computedResults ?? {}) };
      const gscope = sheetScope(opts);
      /* Jauge CALCULÉE : la valeur vient de sa formule. */
      const gval = el.config?.computed ? (opts.computedResults?.[el.key] ?? 0) : val;
      const gct = contribTooltip(opts.breakdown?.[`${el.key}_max`] ?? opts.breakdown?.[`${el.key}_min`]);
      if (gct.attr) {
        return field(`<span class="sbe-contrib-wrap"${gct.attr}>${gaugeHTML(el, gval, {
          input: true, locked: !!lock, scope: gscope, temp: gv[`${el.key}_temp`],
          minMod: Number(gv[`${el.key}_min`]) || 0, maxMod: Number(gv[`${el.key}_max`]) || 0,
          lowMod: Number(gv[`${el.key}_bas`]) || 0, highMod: Number(gv[`${el.key}_haut`]) || 0
        })}</span>`);
      }
      return field(gaugeHTML(el, gval, {
        scope: gscope,
        temp: gv[`${el.key}_temp`],
        input: true,
        locked: !!lock,
        minMod: Number(gv[`${el.key}_min`]) || 0,
        maxMod: Number(gv[`${el.key}_max`]) || 0,
        lowMod: Number(gv[`${el.key}_bas`]) || 0,
        highMod: Number(gv[`${el.key}_haut`]) || 0
      }));
    }

    case "richtext": {
      /* Éditeur complet, pleine largeur, comme la Description :
         contenu enrichi (liens, @UUID…) fourni par la feuille. */
      const enriched = opts.richEnriched?.[el.key] ?? (val ?? "");
      /* Structure STRICTEMENT identique à l'onglet Description :
         même conteneur .sbe-obj-desc, même élément — rendu garanti. */
      {
        const pos = labelPos(el);
        const title = el.label
          ? `<div class="sbe-rich-title" style="${sp.label};${headerStyles(el)}text-align:${labelAlign(pos)};">${badge}${esc(el.label)}</div>`
          : (badge ? `<div class="sbe-rich-title">${badge}</div>` : "");
        /* Options : fond papier ligné, éditeur toujours ouvert (barre
           d'outils visible, comme un bloc-notes), hauteur minimale. */
        const rc = richOpts(el);
        const editor = `<section class="sbe-obj-desc${rc.cls}" style="${rc.css}">
          <prose-mirror name="system.values.${esc(el.key)}" value="${esc(val ?? "")}"${rc.open ? "" : " toggled"}>${enriched}</prose-mirror>
        </section>`;
        const body = pos.startsWith("below") ? editor + title : title + editor;
        return `<div class="sbe-obj-el sbe-obj-el--block" data-key="${esc(el.key)}" style="${sp.wrap}">${body}</div>`;
      }
    }

    case "quantity": {
      /* Quantité de la pile : un entier, jamais en dessous de 1 (une
         pile vide n'existe pas, l'objet est retiré), et jamais au-delà
         de la taille maximale réglée sur le modèle quand il y en a
         une — c'est la même limite que respecte le rangement. */
      const q = Number(val);
      const shown = Number.isFinite(q) && q > 0 ? Math.floor(q) : 1;
      const smax = Number(opts.stackMaxValue) || 0;
      const cap = smax > 0 ? `max="${smax}"` : "";
      return field(`<input type="number" name="system.values.${QUANTITY_KEY}" value="${shown}" min="1" ${cap} step="1" style="${fieldWidth(el)}${sp.value}" ${lock}>`);
    }

    case "container": {
      /* « Joueurs : seulement ce qu'ils possèdent » — rien de possédé : la
         liste n'existe pas pour eux (le MJ la voit toujours). */
      if (el.config?.ownedOnly && isRefList(el) && !game.user?.isGM
        && !ownedOnlyFilter(el, opts, refEntries(el, opts.values ?? {}, opts.hostId ?? "")).length) return "";
      const title = (el.label || el.config?.labelIcon)
        ? `<div class="sbe-cont-title" style="${sp.label}">${badge}${labelIconHTML(el)}${esc(el.label ?? "")}</div>`
        : (badge ? `<div class="sbe-cont-title">${badge}</div>` : "");
      /* L'enveloppe reste NEUTRE : tout le style part sur la boîte
         (voir contStyles), sinon fond et bordure s'affichaient deux
         fois et les coins droits ne se voyaient pas. */
      return `<div class="sbe-obj-el sbe-obj-el--block" data-key="${esc(el.key)}">
        ${title}${containerHTML(el, { ...opts, bgScope }, true)}
      </div>`;
    }

    case "slot": {
      /* MODE INSTANCE : le slot n'est qu'un contenant d'UNE case — l'icône
         remplit toute la case (nom dans l'info-bulle) ; ouvrir = double-
         clic, déséquiper et le reste = clic droit, comme la grille. Il
         ne stocke rien, il montre l'objet PORTÉ dont le portage pointe
         sa clé. « Équipé » se lit donc à un seul endroit.
         MODE RÉFÉRENCE : inchangé, la clé pointe un MODÈLE par uuid. */
      const ref = el.config?.mode === "reference";
      const held = ref ? null : (opts.inventory?.byKey?.[el.key] ?? []).filter(seenEntry)[0];
      if (held) {
        /* Un slot à capacité (un chargeur) montre son remplissage :
           « 12 / 15 » se lit d'un coup d'œil. */
        const cap = capacityOf(el, { ...(opts.values ?? {}), ...(opts.computedResults ?? {}) });
        const qty = cap
          ? `<span class="sbe-grid-qty">${held.qty} / ${cap}</span>`
          : (held.qty > 1 ? `<span class="sbe-grid-qty">×${held.qty}</span>` : "");
        /* Option « nom à droite » : l'icône garde sa case carrée (la
           taille du slot), le nom prend la place restante. */
        const named = !!el.config?.showName;
        const icon = withMarks(`<img class="sbe-slot-img" src="${esc(held.img || "icons/svg/item-bag.svg")}" alt="">`, held.marks, "sbe-mk-fill");
        return `<div class="sbe-obj-el sbe-obj-el--block" data-key="${esc(el.key)}">
          ${label()}
          <div class="sbe-slot sbe-slot--filled sbe-slot--icon${named ? " sbe-slot--named" : ""} sbe-slot-drop" data-key="${esc(el.key)}" data-el-id="${esc(el.id)}"
               data-item-id="${esc(held.id)}" data-uuid="${esc(held.uuid ?? "")}" draggable="true" style="${named ? slotIconVar(el) : slotSizeStyle(el)}${sp.wrap}"${itemTipAttr(held, !!opts.isGM)}>
            ${named ? `<span class="sbe-slot-ic">${icon}</span><span class="sbe-slot-name" style="${sp.value}">${esc(held.name ?? "")}</span>` : icon}${qty}
            <a class="sbe-inv-menu" data-tooltip-text="${esc(game.i18n.localize("SBE.Inv.MenuBtn"))}"><i class="fa-solid fa-ellipsis-vertical"></i></a>
          </div>
        </div>`;
      }
      const filled = ref && val && typeof val === "object" && val.uuid;
      if (filled) {
        return `<div class="sbe-obj-el sbe-obj-el--block" data-key="${esc(el.key)}">
          ${label()}
          <div class="sbe-slot sbe-slot--filled sbe-slot-drop" data-key="${esc(el.key)}" data-el-id="${esc(el.id)}" style="${slotSizeStyle(el)}${sp.wrap}">
            <img class="sbe-slot-img" src="${esc(val.img || "icons/svg/item-bag.svg")}" alt="">
            <span class="sbe-slot-name" style="${sp.value}">${esc(val.name ?? "")}</span>
            <a data-action="openSlot" data-key="${esc(el.key)}" title="${game.i18n.localize("SBE.Slot.Open")}"><i class="fa-solid fa-up-right-from-square"></i></a>
            <a data-action="clearSlot" data-key="${esc(el.key)}" title="${game.i18n.localize("SBE.Slot.Clear")}"><i class="fa-solid fa-xmark"></i></a>
          </div>
        </div>`;
      }
      return `<div class="sbe-obj-el sbe-obj-el--block" data-key="${esc(el.key)}">
        ${label()}
        <div class="sbe-slot sbe-slot--empty sbe-slot-drop" data-key="${esc(el.key)}" data-el-id="${esc(el.id)}" style="${slotSizeStyle(el)}${sp.wrap}">
          ${slotEmptyDecor(el, false)}
        </div>
      </div>`;
    }

    case "tags":
      return ""; /* hissées dans l'en-tête de la fiche (renderTagsBar) */

    case "button": {
      const isMenu = el.config?.action === "menu";
      const charges = buttonCharges(el, opts.values ?? {});
      const depleted = charges !== null && charges <= 0 && (el.config?.onZero ?? "none") === "none" && !isMenu;
      const blocked = stepsBlocked(el, opts);
      const face = buttonFace(el, {
        action: isMenu ? "openButtonMenu" : "execButton",
        disabled: depleted || !!blocked,
        charges
      });
      /* La raison se lit au survol de la RANGÉE : un bouton désactivé
         ne reçoit pas le survol dans tous les navigateurs. */
      const tip = blocked ? ` data-tooltip-text="${esc(blocked)}"` : "";
      return `<div class="sbe-obj-el sbe-obj-el--block sbe-btn-row${blocked ? " is-blocked" : ""}" data-key="${esc(el.key)}"${tip} style="${sp.wrap}">${badge}${face}${isMenu ? `<span class="sbe-btn-menumark">▾</span>` : ""}</div>`;
    }

    case "table":
      {
        const pos = labelPos(el);
        const title = el.label
          ? `<div class="sbe-tbl-title" style="${sp.label};${headerStyles(el)}justify-content:${labelAlign(pos) === "center" ? "center" : (labelAlign(pos) === "right" ? "flex-end" : "flex-start")};">${badge}${esc(el.label)}</div>`
          : (badge ? `<div class="sbe-tbl-title">${badge}</div>` : "");
        const tbl = renderTableSheet(el, opts);
        const body = pos.startsWith("below") ? tbl + title : title + tbl;
        return `<div class="sbe-obj-el sbe-obj-el--block" data-key="${esc(el.key)}" style="${sp.wrap}">${body}</div>`;
      }

    default:
      return row(`
        ${label()}
        <span class="sbe-tpl-el-unknown">${game.i18n.localize("SBE.Template.UnknownKind")} (${esc(el.kind)})</span>`);
  }
}

/* ============================================================ */
/*  Divers                                                       */
/* ============================================================ */

/**
 * Liste COMPLÈTE des choix d'un élément image : l'image par défaut,
 * avec son propre nom et sa propre icône, puis les images ajoutées.
 * Le défaut est un choix comme les autres — sans quoi le joueur ne
 * pourrait jamais y revenir après en avoir sélectionné une autre.
 */
function imageChoices(el) {
  const c = el?.config ?? {};
  const list = Array.isArray(c.choices) ? [...c.choices] : [];
  const dft = String(c.default ?? "").trim();
  if (!list.length) return [];
  if (dft && !list.some(p => p.path === dft)) {
    list.unshift({
      path: dft,
      label: String(c.defaultLabel ?? "").trim()
        || (String(c.defaultIcon ?? "").trim() ? "" : dft.split("/").pop().replace(/\.[^.]+$/, "")),
      icon: String(c.defaultIcon ?? "").trim()
    });
  }
  return list;
}

/** Placement des boutons de choix autour de l'image. */
function pickerPosOf(el) {
  const POS = ["topLeft", "topCenter", "topRight",
    "bottomLeft", "bottomCenter", "bottomRight",
    "leftTop", "leftBottom", "rightTop", "rightBottom"];
  return POS.includes(el?.config?.pickerPos) ? el.config.pickerPos : "bottomCenter";
}

function imageBox(el, src, clickable) {
  const c = el.config ?? {};
  /* TAILLE : les deux dimensions données décrivent des PROPORTIONS,
     pas un carcan. La largeur est une cible, la hauteur en découle —
     sinon, dans une colonne étroite, la largeur se rabattait sur le
     conteneur pendant que la hauteur restait figée : image minuscule
     perdue dans une grande boîte vide, et fenêtre à étirer pour voir
     quelque chose. Avec le rapport, l'image se réduit ENTIÈREMENT. */
  let style = "";
  if (c.width && c.height) {
    style = `width:${c.width}px;aspect-ratio:${Number(c.width)}/${Number(c.height)};height:auto;`;
  } else if (c.width) {
    style = `width:${c.width}px;height:auto;`;
  } else if (c.height) {
    style = `height:${c.height}px;width:auto;`;
  } else {
    /* AUTO = la place offerte par le cadre ou la colonne. Sans ça, un
       SVG sans dimensions intrinsèques se réduit à presque rien. */
    style = "width:100%;height:auto;";
  }
  const bd = borderDecl(el.style);
  if (bd) style += `${bd};`;
  const action = clickable ? `data-action="pickFieldImage"` : "";
  if (src) {
    return `<img class="sbe-tpl-el-img" src="${esc(src)}" style="${style}" ${action} alt="">`;
  }
  return `
    <div class="sbe-tpl-el-img sbe-tpl-el-img--empty" style="${style}" ${action}>
      <i class="fa-solid fa-image"></i>
    </div>`;
}

/* ============================================================ */
/*  TABLES                                                       */
/* ------------------------------------------------------------ */
/*  config = {                                                   */
/*    mode: "fixed" | "dynamic",                                 */
/*    columns: [{ id, key, label, type: "text"|"number"|         */
/*                "checkbox"|"select"|"computed",                */
/*                choices?, integer?, decimals?, formula?,       */
/*                width?, playerVisible, locked }],              */
/*    rows (mode fixed): [{ id, cells: { colKey: valeur } }]     */
/*  }                                                            */
/*  Valeurs sur l'objet (values[cléTable]) :                     */
/*  - fixed   : { cells: { rowId: { colKey: valeur } } }         */
/*              (uniquement les colonnes LIBRES)                 */
/*  - dynamic : { rows: [{ id, cells: { colKey: valeur } }] }    */
/* ============================================================ */

/** Colonnes visibles pour ce spectateur. */
function tableColumns(el, isGM = true) {
  const cols = Array.isArray(el.config?.columns) ? el.config.columns : [];
  return isGM ? cols : cols.filter(c => c.playerVisible !== false);
}

/** Valeur d'une cellule non calculée en mode fixe (verrouillée → modèle, libre → objet). */
function fixedCellValue(el, colDef, rowDef, tableValues) {
  if (colDef.locked) return rowDef.cells?.[colDef.key];
  return tableValues?.cells?.[rowDef.id]?.[colDef.key];
}

/** Portée d'une ligne pour les colonnes calculées. */
function rowScope(el, cols, cellOf, globalValues) {
  const scope = {};
  for (const [k, v] of Object.entries(globalValues ?? {})) {
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k)) scope[k] = v;
  }
  for (const c of cols) {
    if (c.type === "computed" || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(c.key)) continue;
    let v = cellOf(c);
    if (c.type === "number") v = Number(v ?? 0) || 0;
    else if (c.type === "checkbox") v = !!v;
    else v = v ?? "";
    scope[c.key] = v;
  }
  return scope;
}

/** Cellule d'une colonne calculée. */
function computedCell(el, cols, colDef, cellOf, globalValues) {
  const res = evalExpression(colDef.formula ?? "", rowScope(el, cols, cellOf, globalValues));
  return (res === null || res === undefined || Number.isNaN(res)) ? "—" : String(res);
}

/** Entrée de saisie d'une cellule (fiche objet). */
function cellInput(el, colDef, rowId, value) {
  const base = `class="sbe-tbl-input" data-table="${esc(el.key)}" data-row="${esc(rowId)}" data-colkey="${esc(colDef.key)}"`;
  if (colDef.type === "number") {
    const step = (colDef.integer !== false) ? 1 : Math.pow(10, -(colDef.decimals ?? 2));
    return `<input type="number" ${base} value="${esc(value ?? "")}" step="${step}">`;
  }
  if (colDef.type === "checkbox") {
    return `<input type="checkbox" ${base} ${value ? "checked" : ""}>`;
  }
  if (colDef.type === "select") {
    const choices = Array.isArray(colDef.choices) ? colDef.choices : [];
    const cur = (value != null && choices.includes(value)) ? value : (choices[0] ?? "");
    return `<select ${base}>${choices.map(c =>
      `<option value="${esc(c)}" ${c === cur ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>`;
  }
  return `<input type="text" ${base} value="${esc(value ?? "")}">`;
}

/* ---------------- ATELIER ---------------- */

export function renderTableWorkshop(el) {
  const c = el.config ?? {};
  const cols = tableColumns(el, true);
  const L = (k) => game.i18n.localize(k);

  let head = "";
  for (const col of cols) {
    const w = col.width ? `style="width:${Number(col.width)}px;"` : "";
    head += `
      <th ${w} style="${headerStyles(el)}" data-col-id="${esc(col.id)}">
        <span class="sbe-tbl-colhead">
          ${col.playerVisible === false ? `<i class="fa-solid fa-eye-slash sbe-tpl-hidden-badge"></i>` : ""}
          ${col.type === "computed" ? `<span class="sbe-tbl-computedmark">=</span>` : ""}
          ${esc(col.label || col.key)}
          <span class="sbe-tbl-coltools">
            <a data-action="editTableCol" title="${L("SBE.Template.EditElTitle")}"><i class="fa-solid fa-pen"></i></a>
            <a data-action="deleteTableCol" title="${L("SBE.Template.DeleteElTitle")}"><i class="fa-solid fa-trash"></i></a>
          </span>
        </span>
      </th>`;
  }
  head += `
    <th class="sbe-tbl-addcol">
      <button type="button" class="sbe-tpl-plus sbe-tpl-plus--small" data-action="addTableCol"
              title="${L("SBE.Table.AddColumn")}">+</button>
    </th>`;

  let body = "";
  {
    for (const r of (c.rows ?? [])) {
      let tds = "";
      for (const col of cols) {
        if (col.type === "computed") {
          const cellOf = (cd) => r.cells?.[cd.key];
          tds += `<td class="sbe-tbl-computed">${esc(computedCell(el, cols, col, cellOf, {}))}</td>`;
        } else if (col.locked) {
          tds += `<td>${cellInputWorkshop(el, col, r)}</td>`;
        } else {
          tds += `<td class="sbe-tbl-free" title="${L("SBE.Table.FreeCellHint")}">${L("SBE.Table.FreeCell")}</td>`;
        }
      }
      tds += `<td class="sbe-tbl-rowdel"><a data-action="deleteTableRow" data-row-id="${esc(r.id)}" title="${L("SBE.Common.Delete")}"><i class="fa-solid fa-trash"></i></a></td>`;
      body += `<tr data-row-id="${esc(r.id)}">${tds}</tr>`;
    }
  }

  const foot = `<div class="sbe-tpl-addbar"><button type="button" class="sbe-tpl-plus sbe-tpl-plus--small"
         data-action="addTableRow" title="${L("SBE.Table.AddRow")}">+</button></div>`;

  const pos = labelPos(el);
  const align = labelAlign(pos);
  const title = el.label
    ? `<div class="sbe-tbl-title" style="${headerStyles(el)}justify-content:${align === "center" ? "center" : (align === "right" ? "flex-end" : "flex-start")};">${esc(el.label)}</div>`
    : "";
  const tableHtml = `
    <table class="sbe-tbl" data-sbe-headstyle>
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>
    ${foot}`;
  return pos.startsWith("below") ? tableHtml + title : title + tableHtml;
}

/** Cellule éditable de l'atelier (colonnes verrouillées du mode fixe). */
function cellInputWorkshop(el, colDef, rowDef) {
  const value = rowDef.cells?.[colDef.key];
  const base = `class="sbe-tblfix-input" data-el-id="${esc(el.id)}" data-row-id="${esc(rowDef.id)}" data-colkey="${esc(colDef.key)}"`;
  if (colDef.type === "number") {
    const step = (colDef.integer !== false) ? 1 : Math.pow(10, -(colDef.decimals ?? 2));
    return `<input type="number" ${base} value="${esc(value ?? "")}" step="${step}">`;
  }
  if (colDef.type === "checkbox") return `<input type="checkbox" ${base} ${value ? "checked" : ""}>`;
  if (colDef.type === "select") {
    const choices = Array.isArray(colDef.choices) ? colDef.choices : [];
    const cur = (value != null && choices.includes(value)) ? value : (choices[0] ?? "");
    return `<select ${base}>${choices.map(ch =>
      `<option value="${esc(ch)}" ${ch === cur ? "selected" : ""}>${esc(ch)}</option>`).join("")}</select>`;
  }
  return `<input type="text" ${base} value="${esc(value ?? "")}">`;
}

/* ---------------- FICHE ---------------- */

export function renderTableSheet(el, opts = {}) {
  const c = el.config ?? {};
  const cols = tableColumns(el, !!opts.isGM);
  const tableValues = opts.values?.[el.key] ?? {};
  const sort = opts.tableSort?.[el.key] ?? null;
  const L = (k) => game.i18n.localize(k);

  /* Les lignes viennent TOUJOURS du modèle ; l'objet ne fait que
     remplir les colonnes libres. */
  let rows = (c.rows ?? []).map(r => ({
    id: r.id,
    cellOf: (col) => col.type === "computed" ? undefined : fixedCellValue(el, col, r, tableValues)
  }));

  /* Valeur affichée (calculées comprises) pour tri et rendu. */
  const displayValue = (row, col) => {
    if (col.type === "computed") {
      return computedCell(el, cols, col, row.cellOf, opts.values ?? {});
    }
    return row.cellOf(col);
  };

  /* Tri par colonne (clic sur l'en-tête). */
  if (sort?.colId) {
    const col = cols.find(k => k.id === sort.colId);
    if (col) {
      const dir = sort.dir === "desc" ? -1 : 1;
      rows = [...rows].sort((a, b) => {
        const va = displayValue(a, col), vb = displayValue(b, col);
        const na = Number(va), nb = Number(vb);
        if (!Number.isNaN(na) && !Number.isNaN(nb)) return (na - nb) * dir;
        return String(va ?? "").localeCompare(String(vb ?? ""), game.i18n.lang) * dir;
      });
    }
  }

  let head = "";
  for (const col of cols) {
    const w = col.width ? `style="width:${Number(col.width)}px;"` : "";
    const arrow = sort && sort.colId === col.id ? (sort.dir === "desc" ? " ▼" : " ▲") : "";
    head += `
      <th ${w} style="${headerStyles(el)}">
        <a class="sbe-tbl-sort" data-action="sortTable" data-table="${esc(el.key)}" data-col-id="${esc(col.id)}">
          ${opts.isGM && col.playerVisible === false ? `<i class="fa-solid fa-eye-slash sbe-tpl-hidden-badge"></i>` : ""}
          ${esc(col.label || col.key)}${arrow}
        </a>
      </th>`;
  }
  let body = "";
  for (const row of rows) {
    let tds = "";
    for (const col of cols) {
      if (col.type === "computed") {
        tds += `<td class="sbe-tbl-computed" title="= ${esc(col.formula ?? "")}">${esc(displayValue(row, col))}</td>`;
      } else if (col.locked) {
        const v = row.cellOf(col);
        tds += `<td>${col.type === "checkbox" ? (v ? "✓" : "—") : esc(v ?? "")}</td>`;
      } else {
        tds += `<td>${cellInput(el, col, row.id, row.cellOf(col))}</td>`;
      }
    }
    body += `<tr>${tds}</tr>`;
  }
  if (!rows.length) {
    body = `<tr><td colspan="${cols.length + 1}" class="sbe-tbl-empty">${L("SBE.Table.Empty")}</td></tr>`;
  }

  return `
    <table class="sbe-tbl">
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}

/* ============================================================ */
/*  BOUTONS D'ACTION                                             */
/* ------------------------------------------------------------ */
/*  config = {                                                   */
/*    action: "consume" | "menu",                                */
/*    icon (chemin image, optionnel), showInCtx (false = réservé */
/*    à la fiche ; absent = proposé dans l'inventaire et le HUD),*/
/*    consume : chargesKey ("" = consomme l'objet directement),  */
/*              amount (par usage), onZero: "none"|"qty"|"delete"*/
/*    menu    : children = boutons (fenêtre de sous-actions)     */
/*  }                                                            */
/* ============================================================ */

/** Une couleur « #rrggbb » valable (blanc sinon) : valeur d'un champ Couleur. */
export function colorValue(v) {
  const s = String(v ?? "").trim();
  return /^#[0-9a-f]{6}$/i.test(s) ? s.toLowerCase() : "#ffffff";
}

/** Charges restantes d'un bouton Consommer (null si pas de champ). */
export function buttonCharges(el, values) {
  /* Les charges ne concernent que l'action « Consommer ». */
  if (el.config?.action === "menu" || el.config?.action === "steps") return null;
  const key = el.config?.chargesKey;
  if (!key) return null;
  const v = values?.[key];
  return Number(v ?? 0) || 0;
}

/** Icône d'un bouton : une image (chemin) OU une icône de police
    (« fa-solid fa-play ») — partout où un bouton s'affiche. */
export function btnIconHTML(icon) {
  const v = String(icon ?? "").trim();
  if (!v) return "";
  if (!v.includes("/") && !/\.(png|jpe?g|webp|svg|gif|avif)$/i.test(v) && v.includes("fa-")) {
    return `<i class="sbe-btn-icon ${esc(/fa-(solid|regular|brands)/.test(v) ? v : `fa-solid ${v}`)}"></i>`;
  }
  return `<img class="sbe-btn-icon" src="${esc(cleanUrl(v))}" alt="">`;
}

/** Face visuelle du bouton (atelier inerte / fiche active). */
function buttonFace(el, { inert = false, action = "", disabled = false, charges = null } = {}) {
  const st = el.style ?? {};
  const styles = [];
  if (st.valueColor) styles.push(`color:${st.valueColor}`);
  if (st.valueSize) styles.push(`font-size:${Number(st.valueSize)}px`);
  const icon = btnIconHTML(el.config?.icon);
  const badge = (charges !== null)
    ? `<span class="sbe-btn-charges">${charges}</span>`
    : "";
  const attrs = inert
    ? "disabled"
    : `data-action="${action}" data-btn-id="${esc(el.id)}" ${disabled ? "disabled" : ""}`;
  return `
    <button type="button" class="sbe-btn-face" ${attrs} style="${styles.join(";")}">
      ${icon}<span>${esc(el.label || el.key)}</span>${badge}
    </button>`;
}

/* ============================================================ */
/*  ÉTIQUETTES (badges d'en-tête de fiche)                       */
/* ------------------------------------------------------------ */
/*  config.entries = ["ARME À FEU", "@categorie", "@mains"]      */
/*  - texte simple  → badge statique ;                           */
/*  - "@cle"        → badge lié : affiche la VALEUR du champ     */
/*    (liste déroulante ou nombre) de la fiche.                  */
/*  Les étiquettes s'affichent EN HAUT de la fiche objet,        */
/*  quelle que soit leur position dans l'arbre.                  */
/* ============================================================ */

/** Tous les éléments étiquettes de l'arbre. */
export function collectTags(list) {
  return [...walkElements(list ?? [])].filter(e => e?.kind === "tags");
}

/** Mise en avant des étiquettes : "bound" (les @clé, par défaut),
    "first" (la première), "all", "none". */
export const TAG_HIGHLIGHTS = ["bound", "first", "all", "none"];
function tagHighlight(el) {
  return TAG_HIGHLIGHTS.includes(el?.config?.highlight) ? el.config.highlight : "bound";
}
function tagIsHot(hl, index, bound) {
  return hl === "all" || (hl === "first" && index === 0) || (hl === "bound" && bound);
}

/** Les étiquettes vont-elles DANS l'en-tête (au-dessus du nom) ? */
export function tagsInHeader(list) {
  return collectTags(list).some(e => e.config?.place === "header");
}

/**
 * Les étiquettes d'une fiche, résolues : [{ text, hot, bound }].
 * Une seule lecture pour la fiche ET le chat (« Afficher dans le chat »).
 */
export function tagList(list, values = {}, isGM = false) {
  const tagEls = collectTags(list).filter(e => isGM || e.playerVisible !== false);
  if (!tagEls.length) return [];
  const byKey = new Map();
  for (const e of walkElements(list ?? [])) if (e?.key) byKey.set(e.key, e);
  const out = [];
  for (const tEl of tagEls) {
    const entries = Array.isArray(tEl.config?.entries) ? tEl.config.entries : [];
    const hl = tagHighlight(tEl);
    let n = 0;
    for (const entry of entries) {
      if (!entry) continue;
      if (entry.startsWith("@")) {
        const key = entry.slice(1).trim();
        const src = byKey.get(key);
        if (!src) continue;
        if (!isGM && src.playerVisible === false) continue;
        /* Un champ masqué (« Visible si ») ne donne pas d'étiquette. */
        if (hiddenByPath(list, values, src)) continue;
        let val = values[key] ?? src.config?.default;
        if (src.kind === "checkbox") {
          if (!val) continue; /* décochée → pas de badge */
          val = src.label || key;
        }
        if (val === undefined || val === null || val === "") continue;
        out.push({ text: String(val), bound: true, hot: tagIsHot(hl, n++, true),
          color: src.kind === "select" ? choiceColor(src, val) : "" });
      } else {
        out.push({ text: entry, bound: false, hot: tagIsHot(hl, n++, false) });
      }
    }
  }
  return out;
}

/**
 * COULEUR D'UN CHOIX de liste déroulante (réglée par le MJ sur
 * l'élément : Rareté → Rare = bleu, État → Cassé = rouge…). Elle suit
 * la valeur partout où elle s'affiche : étiquettes, info-bulle de
 * l'objet. "" = pas de couleur.
 */
export function choiceColor(el, value) {
  const c = el?.config?.choiceColors?.[String(value ?? "")];
  return /^#[0-9a-f]{6}$/i.test(String(c ?? "")) ? c : "";
}

/** Couleur d'un choix dans la LISTE elle-même (option déroulée). */
function choiceStyle(el, c) {
  const col = choiceColor(el, c);
  return col ? ` style="color:${col};font-weight:700"` : "";
}

/** Couleur de la valeur affichée dans la liste fermée. */
function selectColor(el, v) {
  const col = choiceColor(el, v);
  return col ? `;color:${col};font-weight:700` : "";
}

/**
 * INFO-BULLE D'UN OBJET (survol dans l'inventaire, un slot…) :
 * le nom, les étiquettes (dont la liste cochée « étiquette colorée »,
 * la rareté, écrite dans sa couleur), puis les champs cochés
 * « Montrer dans l'info-bulle de l'objet », dans l'ordre du modèle.
 * Aucune mise en page imposée à la bulle elle-même : son apparence
 * reste celle du manager des info-bulles.
 * @param e  { templateId, name, img, vals, qty }  (entrée d'inventaire)
 */
/* Blocs ajoutés à l'info-bulle d'un objet par d'autres modules (les
   effets de l'objet…), sans que ce fichier les connaisse. fn(item, isGM) → html. */
const ITEM_TIP_EXTRAS = [];
export function registerItemTipExtra(fn) { if (typeof fn === "function") ITEM_TIP_EXTRAS.push(fn); }

/* Bulle REMPLACÉE par un module (un objet inconnu ne montre que sa
   version inconnue). fn(item, isGM) → html, ou null pour la bulle normale. */
const ITEM_TIP_GATES = [];
export function registerItemTipGate(fn) { if (typeof fn === "function") ITEM_TIP_GATES.push(fn); }

/* Bulles gardées tant que rien ne change (révision des données) :
   une fiche bien remplie, ou une petite machine, ne les reconstruit
   pas à chaque affichage. Un objet sans adresse (contenu d'un objet
   du monde) n'est pas gardé. */
const TIP_CACHE = new Map();
let TIP_REV = -1;
export function itemTipHtml(e, isGM = false) {
  const k = e?.uuid ? `${e.uuid}|${isGM ? 1 : 0}|${e.qty ?? 1}` : "";
  if (!k) return buildItemTip(e, isGM);
  if (TIP_REV !== revision()) { TIP_CACHE.clear(); TIP_REV = revision(); }
  let html = TIP_CACHE.get(k);
  if (html === undefined) { html = buildItemTip(e, isGM); TIP_CACHE.set(k, html); }
  return html;
}

function buildItemTip(e, isGM) {
  if (ITEM_TIP_GATES.length && e?.uuid) {
    let item = null;
    try { item = fromUuidSync(e.uuid); } catch (_e) { item = null; }
    for (const g of ITEM_TIP_GATES) {
      const html = item ? g(item, isGM) : null;
      if (html) return html;
    }
  }
  const tpl = game.items?.get(e?.templateId ?? "");
  const els = [...walkElements(tpl?.system?.elements ?? [])];
  if (!els.length) return "";
  const vals = e.vals ?? {};
  const shown = (el) => isGM || el.playerVisible !== false;
  const valOf = (el) => vals[el.key] ?? el.config?.default;
  /* En-tête : la liste cochée « étiquette colorée » (la rareté) devient
     une ÉTIQUETTE écrite dans sa couleur, devant les autres. Un choix
     sans couleur (« Aucune ») ne s'affiche pas. */
  const head = els.find(el => el.kind === "select" && el.config?.headerColor && shown(el));
  const hv = head ? valOf(head) : "";
  const hc = head ? choiceColor(head, hv) : "";
  const chip = (text, color) => `<span class="sbe-itt-tag${color ? " is-colored" : ""}"${color ? ` style="--sbe-itt-c:${color}"` : ""}>${esc(text)}</span>`;
  const tags = (hc ? chip(hv, hc) : "") + tagList(tpl.system.elements, vals, isGM)
    .filter(t => !(hc && t.text === String(hv))).map(t => chip(t.text, t.color)).join("");
  /* « Visible si » : un champ caché sur la fiche de CET objet (lui, ou
     le cadre / la colonne qui le contient) ne s'affiche pas non plus
     dans la bulle — une fiche pour plusieurs sortes d'objets ne montre
     que les lignes de la bonne sorte. */
  let tipScope = null;
  const scopeOf = () => {
    if (tipScope) return tipScope;
    const base = {};
    for (const el of els) if (el?.key) base[el.key] = vals[el.key] ?? el.config?.default;
    return (tipScope = withLookups({ ...base, ...vals }, tpl.system.elements));
  };
  const visible = (el) => {
    const expr = String(el?.visibleIf ?? "").trim();
    if (!expr) return true;
    const r = evalExpression(expr, scopeOf());
    return r === null ? false : !!r;
  };
  const hiddenIds = new Set();
  const markHidden = (list, hidden) => {
    for (const el of list ?? []) {
      if (!el || typeof el !== "object") continue;
      const h = hidden || !visible(el);
      if (h && el.id) hiddenIds.add(el.id);
      if (h && !el.id && el.key) hiddenIds.add(`k:${el.key}`);
      if (Array.isArray(el.children)) markHidden(el.children, h);
      if (Array.isArray(el.cols)) for (const c of el.cols) markHidden(Array.isArray(c) ? c : [c], h);
    }
  };
  markHidden(tpl.system.elements, false);
  const rows = [];
  for (const el of els) {
    /* « Montrer dans l'info-bulle » est un choix explicite : il vaut
       aussi pour une clé de calcul masquée sur la fiche (la valeur du
       niveau actuel d'un objet à niveaux…). */
    if (!el.itemTip || !el.key || !shown(el)) continue;
    if (hiddenIds.has(el.id) || hiddenIds.has(`k:${el.key}`)) continue;
    let v = valOf(el);
    /* Option du champ : rien à dire quand il vaut sa valeur par défaut
       (« Zone : Aucune », « Recul : Aucun »). */
    if (el.itemTipNoDefault && String(v ?? "") === String(el.config?.default ?? "")) continue;
    let style = "";
    /* Une case décochée ou un nombre à 0 ne s'affichent pas : la bulle
       reste courte (une armure ne liste que ses vraies résistances). */
    if (el.kind === "checkbox") { if (!v) continue; v = "✔"; }
    else if (el.kind === "color") {
      const c = colorValue(v);
      rows.push(`<div class="sbe-itt-row"><span class="sbe-itt-l">${labelIconHTML(el)}${esc(el.label || el.key)}</span><span class="sbe-itt-v"><span class="sbe-color-swatch" style="background:${c}"></span></span></div>`);
      continue;
    }
    else if (el.kind === "number" || el.kind === "gauge") {
      const n = Number(v);
      if (!Number.isFinite(n) || n === 0) continue;
      v = el.config?.integer === false ? String(Number(n.toFixed(Number(el.config?.decimals ?? 2)))) : String(Math.round(n));
      /* Option du champ : un bonus/malus se lit signé et coloré. */
      if (el.itemTipSigned) {
        if (n > 0) v = `+${v}`;
        style = ` style="color:${n > 0 ? "#5cb85c" : "#e57373"}"`;
      }
    } else if (el.kind === "select") {
      const col = choiceColor(el, v);
      if (col) style = ` style="color:${col}"`;
    } else if (isRefList(el)) {
      /* Liste de références : l'icône et le nom de chaque objet du
         monde désigné, un par ligne sous le libellé. */
      const refs = refIds(vals, el.key).map(id => game.items?.get?.(id)).filter(Boolean);
      if (!refs.length) continue;
      rows.push(`<div class="sbe-itt-refs"><span class="sbe-itt-l">${labelIconHTML(el)}${esc(el.label || el.key)}</span>${refs.map(it =>
        `<span class="sbe-itt-ref"><img src="${esc(it.img || "icons/svg/item-bag.svg")}" alt="">${esc(it.name)}</span>`).join("")}</div>`);
      continue;
    } else if (["image", "html", "table", "chart", "container"].includes(el.kind)) continue;
    if (v === undefined || v === null || v === "") continue;
    rows.push(`<div class="sbe-itt-row"><span class="sbe-itt-l">${labelIconHTML(el)}${esc(el.label || el.key)}</span><span class="sbe-itt-v"${style}>${esc(String(v))}</span></div>`);
  }
  return `<div class="sbe-tt sbe-itt">
    <div class="sbe-itt-name">${esc(e.name ?? "")}${e.qty > 1 ? ` <small>×${e.qty}</small>` : ""}</div>
    ${tags ? `<div class="sbe-itt-tags">${tags}</div>` : ""}
    ${rows.length ? `<div class="sbe-itt-rows">${rows.join("")}</div>` : ""}
    ${itemTipExtras(e, isGM)}
  </div>`;
}

function itemTipExtras(e, isGM) {
  if (!ITEM_TIP_EXTRAS.length || !e?.uuid) return "";
  let item = null;
  try { item = fromUuidSync(e.uuid); } catch (_e) { item = null; }
  if (!item) return "";
  let out = "";
  for (const fn of ITEM_TIP_EXTRAS) {
    try { out += fn(item, isGM) || ""; } catch (err) { console.warn("SBE | Info-bulle d'objet : bloc en échec", err); }
  }
  return out;
}

/** Attribut prêt à poser sur un objet affiché (ou ""). */
export function itemTipAttr(e, isGM = false) {
  const html = itemTipHtml(e, isGM);
  /* Même placement que les bulles de la fiche (aucune direction
     imposée) : un thème de bulle réglé pour elles reste juste ici. */
  /* Objet « MJ seulement » (option du modèle) : le MJ le voit marqué
     d'un œil barré, pour savoir que ses joueurs, eux, ne le voient pas. */
  const hidden = e?.gmOnly && isGM ? ` data-sbe-gmonly="" aria-description="${esc(game.i18n.localize("SBE.Template.GmOnlyBadge"))}"` : "";
  return (html ? ` data-tooltip-html="${esc(html)}"` : "") + hidden;
}

export function renderTagsBar(list, values = {}, isGM = false) {
  const html = tagList(list, values, isGM).map(t =>
    `<span class="sbe-tag${t.hot ? " sbe-tag--hot" : ""}${t.bound ? " sbe-tag--bound" : ""}${t.color ? " sbe-tag--colored" : ""}"${t.color ? ` style="--sbe-tagc:${t.color}"` : ""}>${esc(t.text)}</span>`).join("");
  return html ? `<div class="sbe-tags-bar">${html}</div>` : "";
}

/* ============================================================ */
/*  CONTENEURS (inventaire)                                      */
/* ------------------------------------------------------------ */
/*  config = {                                                   */
/*    display: "list" | "grid" | "spatial",                      */
/*    cols: [{ key, label, width }],   (affichage LISTE)          */
/*    GRILLE : gridCols (0 = auto), gridRows (0 = infini),        */
/*      cellSize (px), gridName ; le RANGEMENT (A→Z, Z→A, manuel)  */
/*      est choisi par le joueur sur la fiche (drapeau gridSort)  */
/*    acceptStacks: bool, qtyMax: nombre|"",                      */
/*    + le MÊME filtre que les slots (filterType, …)              */
/*  }                                                            */
/*  Le conteneur ne DÉTIENT rien : il affiche les objets portés   */
/*  dont le portage (system.carry) pointe sa clé. Une seule       */
/*  vérité, aucune liste en double.                               */
/* ============================================================ */

/**
 * CAPACITÉ d'un contenant (slot ou conteneur) : un nombre, ou une
 * FORMULE lue sur l'objet qui l'héberge. Un chargeur dit « magSize »,
 * et sa contenance suit la valeur de l'arme — un chargeur étendu qui
 * change magSize change aussitôt ce que l'arme peut contenir.
 * @returns {number|null} null = illimité
 */
export function capacityOf(el, scope = {}) {
  const raw = el?.config?.qtyMax;
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  const n = Number(raw);
  if (Number.isFinite(n)) return n > 0 ? Math.floor(n) : null;
  const v = Number(evalExpression(String(raw), scope));
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : null;
}

/** Colonnes déclarées par le créateur (hors colonne du nom). */
export function containerCols(el) {
  const raw = Array.isArray(el?.config?.cols) ? el.config.cols : [];
  return raw
    .filter(c => c && String(c.key ?? "").trim())
    .map(c => ({
      key: String(c.key).trim(),
      label: String(c.label ?? "").trim(),
      width: String(c.width ?? "").trim(),
      /* Affichage en FICHES : où va la colonne, son texte, sa condition, sa teinte. */
      place: CARD_PLACES.includes(c.place) ? c.place : "chip",
      text: String(c.text ?? "").trim(),
      showIf: String(c.showIf ?? "").trim(),
      tone: CARD_TONES.includes(c.tone) ? c.tone : ""
    }));
}

/* ------------------------------------------------------------ */
/*  FICHES (conteneur d'objets portés, affichage « fiches »)      */
/* ------------------------------------------------------------ */
/*  Une fiche par objet : icône, nom, pastilles (colonnes « dans   */
/*  la fiche »), colonne de droite (cadre + étiquettes), bandeau    */
/*  d'action (jauge en points + boutons de l'objet), dépliant.     */
/*  Tout vient du réglage du conteneur et des objets eux-mêmes :   */
/*  rien n'est propre à une sorte d'objet.                          */
/*    config.cardLock   formule lue sur l'objet : vraie = verrouillé */
/*    config.cardDesc   formule lue sur l'objet : le texte du dépliant*/
/*                      (vide ou sans résultat : sa description)    */
/*    config.cardGauge  clé d'une jauge de l'objet (en points)      */
/*    config.cardGaugeLabel, config.cardSplit (sections côte à côte) */
/* ------------------------------------------------------------ */
export const CARD_PLACES = ["chip", "box", "tag"];
export const CARD_TONES = ["", "cost", "up", "info", "accent"];

function cardTextOf(c, scope) {
  if (c.showIf) {
    const ok = evalExpression(c.showIf, scope);
    if (ok === null || !ok) return "";
  }
  if (c.text) return interpolateHtml(sanitizeHtml(c.text), scope).trim();
  const v = scope[c.key];
  if (v === null || v === undefined || v === "" || v === false || v === 0) return "";
  return esc(contCell(v));
}

/** Une fiche. `ctx` : itemScope(id), actionsOf(id), open (Set), isGM. */
function cardHTML(e, el, ctx, live) {
  const c = el.config ?? {};
  const cols = containerCols(el);
  const scope = live ? (ctx.itemScope?.(e.id) ?? { ...(e.vals ?? {}) }) : { ...(e.vals ?? {}) };
  const truthy = (f) => { if (!f) return false; const r = evalExpression(f, scope); return r !== null && r !== undefined && !!r; };
  const locked = live && truthy(String(c.cardLock ?? "").trim());
  const chips = cols.filter(x => x.place === "chip").map(x => {
    const t = cardTextOf(x, scope);
    return t ? `<span class="sbe-icard-chip${x.tone ? ` is-${x.tone}` : ""}">${t}</span>` : "";
  }).join("");
  const box = cols.filter(x => x.place === "box").map(x => {
    const t = cardTextOf(x, scope);
    return t ? `<div class="sbe-icard-box"><span class="sbe-icard-box-l">${esc(x.label || containerKeyLabel(x.key))}</span><span class="sbe-icard-box-v">${t}</span></div>` : "";
  }).join("");
  const tags = cols.filter(x => x.place === "tag").map(x => {
    const t = cardTextOf(x, scope);
    return t ? `<span class="sbe-icard-tag${x.tone ? ` is-${x.tone}` : ""}">${t}</span>` : "";
  }).join("");
  /* Dépliant : le texte que donne la formule (HTML assaini). */
  const descF = String(c.cardDesc ?? "").trim();
  let desc = "";
  if (descF) {
    const r = evalExpression(descF, scope);
    desc = (r === null || r === undefined) ? "" : sanitizeHtml(String(r)).trim();
    if (!desc.replace(/<[^>]*>/g, "").trim()) desc = "";
  }
  /* Rien par la formule (ou pas de formule) : la description de l'objet. */
  if (!desc && live) {
    desc = sanitizeHtml(String(ctx.descOf?.(e.id) ?? "")).trim();
    if (!desc.replace(/<[^>]*>/g, "").trim()) desc = "";
  }
  const open = !!ctx.open?.has?.(e.id);
  const corner = `<div class="sbe-icard-corner">
      ${live && ctx.isGM ? `<a data-action="dropCarried" data-item-id="${esc(e.id)}" class="sbe-icard-del" title="${esc(game.i18n.localize("SBE.Inv.Remove"))}"><i class="fa-solid fa-xmark"></i></a>` : ""}
      ${desc ? `<a data-action="cardDesc" data-item-id="${esc(e.id)}" class="sbe-icard-toggle${open ? " is-open" : ""}" title="${esc(game.i18n.localize("SBE.Inv.CardDesc"))}"><i class="fa-solid fa-chevron-down"></i></a>` : ""}
    </div>`;
  /* Bandeau : la jauge en points, puis les boutons de l'objet. */
  const gk = String(c.cardGauge ?? "").trim();
  let gauge = "";
  /* La jauge suit son propre « Visible si » (sur l'objet). */
  if (gk && scope[gk] !== undefined && ctx.shown?.(e.id, gk) !== false) {
    const cur = Math.max(0, Math.floor(Number(scope[gk]) || 0));
    const max = Math.max(cur, Math.floor(Number(ctx.maxOf?.(e.id, gk) ?? cur) || 0));
    if (max > 0) {
      const pips = Array.from({ length: Math.min(max, 20) }, (_v, i) => `<span class="sbe-icard-pip${i < cur ? "" : " is-off"}"></span>`).join("");
      gauge = `${String(c.cardGaugeLabel ?? "").trim() ? `<span class="sbe-icard-glabel">${esc(c.cardGaugeLabel)}</span>` : ""}
        <span class="sbe-icard-pips${cur ? "" : " is-empty"}" title="${cur}/${max}">${pips}</span><span class="sbe-icard-gcount">${cur}/${max}</span>`;
    }
  }
  const acts = live ? (ctx.actionsOf?.(e.id) ?? []).filter(a => !a.el?.sheetHidden) : [];
  const btns = acts.map((a, i) => {
    const main = i === acts.length - 1 || !a.icon;
    const off = locked || a.disabled;
    const tip = a.reason || a.label;
    const icon = btnIconHTML(a.icon);
    return `<button type="button" class="sbe-icard-btn${main ? " is-main" : ""}" data-action="cardRun" data-item-id="${esc(e.id)}" data-btn-id="${esc(a.id)}"
      ${off ? "disabled" : ""} data-tooltip-text="${esc(tip)}">${icon}${main ? `<span>${esc(a.label)}</span>` : ""}</button>`;
  }).join("");
  const band = (gauge || btns) ? `<div class="sbe-icard-band">${gauge}<span class="sbe-icard-spacer"></span>${btns}</div>` : "";
  return `
    <div class="sbe-icard${locked ? " is-locked" : ""}${band ? "" : " is-bare"}${gauge && /is-empty/.test(gauge) ? " is-depleted" : ""}" data-item-id="${esc(e.id)}" data-uuid="${esc(e.uuid ?? "")}" ${live ? `draggable="true"` : ""}${itemTipAttr(e, !!game.user?.isGM)}>
      <div class="sbe-icard-head">
        <img class="sbe-icard-img" src="${esc(e.img || "icons/svg/item-bag.svg")}" alt="">
        <div class="sbe-icard-info">
          <div class="sbe-icard-name">${locked ? `<i class="fa-solid fa-lock sbe-icard-lock"></i>` : ""}${esc(e.name ?? "")}</div>
          ${chips ? `<div class="sbe-icard-chips">${chips}</div>` : ""}
        </div>
        ${box || tags ? `<div class="sbe-icard-side">${box}${tags}</div>` : ""}
        ${corner}
      </div>
      ${band}
      ${desc ? `<div class="sbe-icard-desc"${open ? "" : " hidden"}>${desc}</div>` : ""}
    </div>`;
}

/** Le corps « fiches » : sections (par clé ou à la main), ou une seule pile. */
function cardsHTML(entries, el, ctx, live) {
  const sample = !live ? [{ id: "s1", name: game.i18n.localize("SBE.Inv.CardSample"), img: "icons/svg/book.svg", vals: {} }] : entries;
  const empty = `<div class="sbe-icards-empty"><span class="sbe-icards-ph"><i class="fa-solid fa-plus"></i></span><span>${esc(String(el.config?.emptyText ?? "").trim() || game.i18n.localize("SBE.Inv.CardsEmpty"))}</span></div>`;
  const list = (arr) => `<div class="sbe-icards-list">${arr.length ? arr.map(e => cardHTML(e, el, ctx, live)).join("") : empty}</div>`;
  const sections = live ? contSections(entries, el) : (el.config?.catMode === "manual" ? sectionsManual([], el) : null);
  if (!sections) return `<div class="sbe-icards">${list(sample)}</div>`;
  const secs = sections.map(sec => {
    const all = secEntries(sec);
    const icon = sec.icon ? labelIconHTML({ config: { labelIcon: sec.icon } }) : "";
    return `<section class="sbe-icards-sec">
      <h3 class="sbe-icards-title">${icon}<span>${esc(sec.label)}</span><span class="sbe-icards-count">(${all.length})</span></h3>
      ${list(all)}
    </section>`;
  }).join("");
  return `<div class="sbe-icards${el.config?.cardSplit ? " is-split" : ""}">${secs}</div>`;
}

/** Libellé d'une clé d'objet, cherché dans les modèles du monde. */
export function containerKeyLabel(key) {
  for (const tpl of game.items.filter(i => i.type === "template")) {
    for (const el of walkElements(tpl.system.elements ?? [])) {
      if (el?.key === key && String(el.label ?? "").trim()) return el.label.trim();
    }
  }
  return key;
}

/**
 * Style du conteneur. Comme pour les cadres, l'onglet Style doit
 * habiller la BOÎTE visible (bordure, coins, fond, texture, CSS
 * avancé) et non l'enveloppe invisible qui l'entoure — sans quoi
 * « angles droits » ou une bordure choisie ne se voient jamais.
 */
function contStyles(el, scope = null) {
  const st = el.style ?? {};
  const box = [];
  const bd = borderDecl(st);
  if (bd) box.push(bd);
  if (st.corners === "soft") box.push("border-radius:6px");
  else if (st.corners === "strong") box.push("border-radius:16px");
  else if (st.corners === "none") box.push("border-radius:0");
  if (st.noBg) box.push("background:transparent");
  else if (st.bgColor) box.push(`background-color:${st.bgColor}`);
  const tex = st.noBg ? "" : resolveBgTexture(st.bgTexture, scope);
  if (tex) {
    box.push(`background-image:url('${cleanUrl(tex)}')`);
    box.push("background-size:cover", "background-position:center");
  }
  if (st.customOn && st.custom) box.push(customInline(el));
  return { box: box.join(";"), head: headerStyles(el) };
}

/** Gabarit de grille : le nom prend la place restante. */
function contGrid(cols) {
  const rest = cols.map(c => c.width ? c.width : "minmax(0,1fr)").join(" ");
  return `--sbe-cont-grid:minmax(0,2fr)${rest ? " " + rest : ""} auto;`;
}

/** Taille des icônes d'objets, en px (vide = taille par défaut). */
function contIconSize(el) {
  const n = Number(el?.config?.iconSize);
  return Number.isFinite(n) && n > 0 ? `--sbe-cont-icon:${Math.round(n)}px;` : "";
}

function contCell(v) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "✔" : "—";
  return String(v);
}

/** Une ligne d'objet. */
function contRow(e, cols, live) {
  const qty = e.qty > 1 ? `<span class="sbe-cont-qty">×${e.qty}</span>` : "";
  const cells = cols.map(c => `<span class="sbe-cont-cell">${esc(contCell(e.vals?.[c.key]))}</span>`).join("");
  /* Référence : on l'ouvre, on la retire de la liste — rien d'autre,
     l'objet du monde n'est jamais touché. */
  if (e.ref) {
    const racts = live
      ? `<span class="sbe-cont-acts">
           <a data-action="openRef" data-uuid="${esc(e.uuid)}" title="${game.i18n.localize("SBE.Slot.Open")}"><i class="fa-solid fa-up-right-from-square"></i></a>
           ${e.mirror || e.locked ? "" : `<a data-action="removeRef" data-key="${esc(e.listKey)}" data-ref-id="${esc(e.id)}" title="${game.i18n.localize("SBE.Inv.RefRemove")}"><i class="fa-solid fa-xmark"></i></a>`}
         </span>`
      : `<span class="sbe-cont-acts"></span>`;
    return `
      <div class="sbe-cont-row sbe-cont-row--ref" data-ref-id="${esc(e.id)}"${itemTipAttr(e, !!game.user?.isGM)}>
        <span class="sbe-cont-cell sbe-cont-cell--name">
          <img class="sbe-cont-img" src="${esc(e.img || "icons/svg/item-bag.svg")}" alt="">
          <span class="sbe-cont-name">${esc(e.name ?? "")}</span>
        </span>${cells}${racts}
      </div>`;
  }
  const acts = live
    ? `<span class="sbe-cont-acts">
         <a data-action="openCarried" data-item-id="${esc(e.id)}" title="${game.i18n.localize("SBE.Slot.Open")}"><i class="fa-solid fa-up-right-from-square"></i></a>
         <a data-action="dropCarried" data-item-id="${esc(e.id)}" title="${game.i18n.localize("SBE.Inv.Remove")}"><i class="fa-solid fa-trash"></i></a>
         <a class="sbe-inv-menu" data-tooltip-text="${esc(game.i18n.localize("SBE.Inv.MenuBtn"))}"><i class="fa-solid fa-ellipsis-vertical"></i></a>
       </span>`
    : `<span class="sbe-cont-acts"></span>`;
  return `
    <div class="sbe-cont-row" data-item-id="${esc(e.id)}" data-uuid="${esc(e.uuid ?? "")}" ${live ? `draggable="true"` : ""}${itemTipAttr(e, !!game.user?.isGM)}>
      <span class="sbe-cont-cell sbe-cont-cell--name">
        ${withMarks(`<img class="sbe-cont-img" src="${esc(e.img || "icons/svg/item-bag.svg")}" alt="">`, e.marks, "sbe-mk-list")}
        <span class="sbe-cont-name">${esc(e.name ?? "")}</span>${qty}
      </span>${cells}${acts}
    </div>`;
}

/** Somme d'une colonne sur un groupe (vide si la colonne n'est pas
    numérique — on n'additionne pas des mots). */
function contColSum(list, key) {
  let sum = 0;
  for (const e of list) {
    const v = Number(e.vals?.[key]);
    if (!Number.isFinite(v)) return "";
    sum += v * (e.qty || 1);
  }
  return String(Math.round(sum * 1000) / 1000);
}

/**
 * Corps de la liste. Les objets d'un MÊME modèle sont regroupés sous
 * une tête repliable — piles empilables comme exemplaires distincts :
 * cinq fusils identiques font une ligne, pas cinq. Chacun garde ses
 * valeurs propres, accessibles en dépliant : rien n'est fusionné de
 * force. Un groupe d'un seul élément redevient une ligne ordinaire —
 * pas de chevron inutile.
 *
 * La tête additionne les colonnes NUMÉRIQUES du groupe (quantité
 * comprise) : le total d'une catégorie ne peut donc jamais contredire
 * les lignes qu'il résume.
 */
function contBody(entries, cols, live, el) {
  if (el?.config?.noGroup) {
    return entries.map(e => contRow(e, cols, live)).join("");
  }
  const groups = new Map();
  for (const e of entries) {
    const gid = e.modelId || `#${e.id}`;
    if (!groups.has(gid)) groups.set(gid, []);
    groups.get(gid).push(e);
  }
  let html = "";
  for (const [gid, list] of groups) {
    if (list.length < 2) { html += contRow(list[0], cols, live); continue; }
    const total = list.reduce((n, e) => n + (e.qty || 1), 0);
    const stacked = list.some(e => (e.qty || 1) > 1);
    const count = game.i18n.format(stacked ? "SBE.Inv.Piles" : "SBE.Inv.Units", { n: list.length });
    const sums = cols.map(c => `<span class="sbe-cont-cell">${esc(contColSum(list, c.key))}</span>`).join("");
    /* Replié par défaut ; le pli tenu à la main est conservé tant que
       la fiche reste ouverte (même mécanique que les cadres). */
    html += `
      <details class="sbe-cont-grp" data-sync data-fid="grp:${esc(el?.key ?? "")}:${esc(gid)}">
        <summary class="sbe-cont-row sbe-cont-row--grp">
          <span class="sbe-cont-cell sbe-cont-cell--name">
            <img class="sbe-cont-img" src="${esc(list[0].img || "icons/svg/item-bag.svg")}" alt="">
            <span class="sbe-cont-name">${esc(list[0].modelName)}</span>
            <span class="sbe-cont-qty">×${total}</span>
            <span class="sbe-cont-piles">${esc(count)}</span>
          </span>${sums}<span class="sbe-cont-acts"></span>
        </summary>
        ${list.map(e => contRow(e, cols, live)).join("")}
      </details>`;
  }
  return html;
}

/* ------------------------------------------------------------ */
/*  CATÉGORIES                                                    */
/* ------------------------------------------------------------ */
/*  Deux modes, au choix du créateur :                            */
/*   - PAR CLÉ    : les sections se construisent toutes seules à  */
/*     partir de la valeur d'une clé sur chaque objet (et d'une   */
/*     seconde clé pour les sous-sections). Aucune double saisie ;*/
/*     si la clé est une liste déroulante, l'ORDRE des sections   */
/*     suit l'ordre des choix écrits dans le modèle.              */
/*   - MANUEL    : le créateur écrit ses sections (libellé, icône,*/
/*     filtre), et range une section sous une autre au besoin.    */
/*  Un objet qui n'entre nulle part atterrit dans une section de  */
/*  fin — jamais escamoté.                                        */
/* ------------------------------------------------------------ */

/** Ordre des valeurs d'une clé : celui de la liste déroulante qui la
    porte, si elle existe quelque part dans les modèles d'objets. */
function keyChoicesOrder(key) {
  if (!key) return null;
  for (const tpl of game.items.filter(i => i.type === "template")) {
    for (const el of walkElements(tpl.system.elements ?? [])) {
      if (el?.key !== key) continue;
      const ch = el.config?.choices;
      if (el.kind === "select" && Array.isArray(ch) && ch.length) return ch.map(String);
    }
  }
  return null;
}

/** Valeur de classement d'une entrée pour une clé donnée. */
function catValueOf(entry, key) {
  const v = entry?.vals?.[key];
  if (v === undefined || v === null || v === "") return "";
  if (typeof v === "boolean") return v ? key : "";
  return String(v);
}

/** Sections construites à partir d'une clé (et d'une sous-clé). */
function sectionsByKey(entries, el) {
  const key = String(el.config?.catKey ?? "").trim();
  const subKey = String(el.config?.subKey ?? "").trim();
  const icons = new Map((Array.isArray(el.config?.catIcons) ? el.config.catIcons : [])
    .filter(r => r && String(r.value ?? "").trim())
    .map(r => [String(r.value).trim(), String(r.icon ?? "").trim()]));

  const group = (list, k) => {
    const map = new Map();
    for (const e of list) {
      const v = k ? catValueOf(e, k) : "";
      if (!map.has(v)) map.set(v, []);
      map.get(v).push(e);
    }
    const order = keyChoicesOrder(k);
    const keys = [...map.keys()].filter(v => v !== "");
    if (order) keys.sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia < 0 ? 1e6 : ia) - (ib < 0 ? 1e6 : ib)
        || a.localeCompare(b, game.i18n.lang);
    });
    else keys.sort((a, b) => a.localeCompare(b, game.i18n.lang));
    if (map.has("")) keys.push("");   /* « sans catégorie » en dernier */
    return keys.map(v => ({
      id: `k:${k}:${v}`,
      label: v || game.i18n.localize("SBE.Inv.NoCat"),
      icon: icons.get(v) ?? "",
      entries: map.get(v)
    }));
  };

  const top = group(entries, key);
  if (!subKey) return top;
  for (const sec of top) {
    const subs = group(sec.entries, subKey);
    /* Une seule sous-section sans valeur : inutile de l'imbriquer. */
    if (subs.length > 1 || (subs.length === 1 && subs[0].label !== game.i18n.localize("SBE.Inv.NoCat"))) {
      sec.subs = subs;
      sec.entries = [];
    }
  }
  return top;
}

/** Une entrée correspond-elle au filtre d'une section manuelle ? */
function catMatches(entry, cat) {
  const val = String(cat?.fVal ?? "").trim();
  switch (cat?.fType) {
    case "tag":
      return !!val && (entry.tags ?? []).includes(val.toLowerCase());
    case "key":
      return !!val && catValueOf(entry, val) !== "";
    case "keyValue": {
      const i = val.indexOf("=");
      if (i < 0) return false;
      const k = val.slice(0, i).trim();
      const want = val.slice(i + 1).trim();
      return !!k && catValueOf(entry, k) === want;
    }
    case "template":
      return !!val && String(entry.templateName ?? "").toLowerCase() === val.toLowerCase();
    case "all":
      return true;      /* fourre-tout volontaire, à placer en dernier */
    default:
      return false;
  }
}

/**
 * Sections écrites à la main. L'ordre de la liste fait tout : une
 * ligne cochée « sous-catégorie » se range sous la dernière section
 * principale écrite au-dessus d'elle, et un objet tombe dans la
 * PREMIÈRE section qui l'accepte — le créateur maîtrise donc la
 * priorité rien qu'en déplaçant ses lignes.
 */
function sectionsManual(entries, el) {
  const cats = (Array.isArray(el.config?.cats) ? el.config.cats : [])
    .filter(c => c && (String(c.label ?? "").trim() || c.fType));
  if (!cats.length) return null;

  const mk = (c, i) => ({
    id: `m:${i}`,
    label: String(c.label ?? "").trim() || game.i18n.localize("SBE.Inv.NoCat"),
    icon: String(c.icon ?? "").trim(),
    entries: [],
    cat: c
  });
  const secs = [];
  cats.forEach((c, i) => {
    const sec = mk(c, i);
    if (c.sub && secs.length) (secs[secs.length - 1].subs ??= []).push(sec);
    else secs.push(sec);
  });

  const rest = [];
  for (const e of entries) {
    let placed = false;
    for (const sec of secs) {
      for (const sub of (sec.subs ?? [])) {
        if (catMatches(e, sub.cat)) { sub.entries.push(e); placed = true; break; }
      }
      if (placed) break;
      if (catMatches(e, sec.cat)) { sec.entries.push(e); placed = true; break; }
    }
    if (!placed) rest.push(e);
  }
  if (rest.length) {
    secs.push({ id: "m:rest", label: game.i18n.localize("SBE.Inv.NoCat"), icon: "", entries: rest });
  }
  return secs;
}

/** Sections d'un conteneur, ou null si le classement est désactivé. */
function contSections(entries, el) {
  const mode = el?.config?.catMode ?? "none";
  if (mode === "key" && String(el.config?.catKey ?? "").trim()) return sectionsByKey(entries, el);
  if (mode === "manual") return sectionsManual(entries, el);
  return null;
}

/** Toutes les entrées d'une section, sous-sections comprises. */
function secEntries(sec) {
  return [...(sec.entries ?? []), ...(sec.subs ?? []).flatMap(secEntries)];
}

/** En-tête d'une section : icône, libellé, compteur, totaux. */
function secHead(sec, cols, sub = false) {
  const list = secEntries(sec);
  const count = list.reduce((n, e) => n + (e.qty || 1), 0);
  const sums = cols.map(c => `<span class="sbe-cont-cell">${esc(contColSum(list, c.key))}</span>`).join("");
  const icon = sec.icon ? labelIconHTML({ config: { labelIcon: sec.icon } }) : "";
  return `
    <summary class="sbe-cont-row sbe-cont-row--cat${sub ? " sbe-cont-row--subcat" : ""}">
      <span class="sbe-cont-cell sbe-cont-cell--name">
        ${icon}<span class="sbe-cont-name">${esc(sec.label)}</span>
        <span class="sbe-cont-piles">(${count})</span>
      </span>${sums}<span class="sbe-cont-acts"></span>
    </summary>`;
}

/** Une section (et ses sous-sections) rendue. */
function secHTML(sec, cols, live, el, sub = false) {
  const inner = (el?.config?.display === "grid")
    ? (sec.entries?.length || !sec.subs?.length ? gridHTML(live ? (sec.entries ?? []) : null, el, live) : "")
      + (sec.subs ?? []).map(x => secHTML(x, cols, live, el, true)).join("")
    : (sec.subs?.length)
    ? contBody(sec.entries ?? [], cols, live, el)
      + sec.subs.map(x => secHTML(x, cols, live, el, true)).join("")
    : contBody(sec.entries ?? [], cols, live, el);
  return `
    <details class="sbe-cont-cat${sub ? " sbe-cont-cat--sub" : ""}" open data-sync data-fid="cat:${esc(el?.key ?? "")}:${esc(sec.id)}">
      ${secHead(sec, cols, sub)}
      <div class="sbe-cont-catbody">${inner}</div>
    </details>`;
}

/* ------------------------------------------------------------ */
/*  GRILLE                                                        */
/* ------------------------------------------------------------ */
/*  Une case par objet (ou par pile). Colonnes : un nombre, ou     */
/*  « auto » (autant que la largeur permet — la fiche complète la  */
/*  dernière rangée à l'affichage). Lignes : un nombre (la grille  */
/*  est alors une capacité : N × M cases), ou infini (une rangée   */
/*  libre s'ajoute toujours). Tri : A→Z, Z→A, ou MANUEL — chaque   */
/*  objet garde la case où on l'a lâché (system.carry.cell).       */
/* ------------------------------------------------------------ */

export const GRID_CELL_DEFAULT = 56;
export const GRID_SORTS = ["az", "za", "manual"];

/** Rangement choisi par le joueur pour ce conteneur (A → Z par défaut). */
export function gridSortOf(doc, key) {
  const v = doc?.flags?.["system-builder-engine"]?.gridSort?.[key];
  return GRID_SORTS.includes(v) ? v : "az";
}

/** Barre de rangement : trois boutons, celui en cours allumé. */
function gridBar(el, sort, live) {
  const ic = { az: "fa-arrow-down-a-z", za: "fa-arrow-up-z-a", manual: "fa-hand-pointer" };
  const L = (k) => game.i18n.localize(k);
  return `<div class="sbe-grid-bar${live ? "" : " is-preview"}">${GRID_SORTS.map(o =>
    `<a class="sbe-grid-sort${o === sort ? " is-on" : ""}" ${live ? `data-action="gridSort" data-key="${esc(el.key)}" data-sort="${o}"` : ""} data-tooltip-text="${esc(L(`SBE.Inv.GridSort_${o}`) + (o === "manual" ? " — " + L("SBE.Inv.GridSortHint") : ""))}"><i class="fa-solid ${ic[o]}"></i></a>`).join("")}</div>`;
}

/** Réglages de grille, nettoyés. Lignes limitées = colonnes fixes. */
export function gridDims(el) {
  const c = el?.config ?? {};
  const cols = Math.max(0, Math.floor(Number(c.gridCols) || 0));
  const rows = cols ? Math.max(0, Math.floor(Number(c.gridRows) || 0)) : 0;
  const size = Math.max(24, Math.floor(Number(c.cellSize) || GRID_CELL_DEFAULT));
  const sort = GRID_SORTS.includes(c.gridSort) ? c.gridSort : "az";
  return { cols, rows, size, sort, cap: cols && rows ? cols * rows : 0, name: !!c.gridName };
}

export function gridVars(el) {
  const d = gridDims(el);
  /* Colonnes fixes : chaque case peut RÉTRÉCIR (minmax 0) quand la
     colonne de la fiche est plus étroite que prévu — sinon la grille
     forçait sa largeur et débordait sur la colonne voisine. */
  return `--sbe-grid-cell:${d.size}px;--sbe-grid-cols:${d.cols ? `repeat(${d.cols}, minmax(0, var(--sbe-grid-cell)))` : "repeat(auto-fill, var(--sbe-grid-cell))"};`;
}

/**
 * Place les entrées dans les cases. Manuel : chaque objet reprend sa
 * case enregistrée ; ceux qui n'en ont pas (ou dont la case est prise)
 * vont dans la première case libre — jamais escamotés.
 * @returns {Array<Object|null>}
 */
export function gridLayout(entries, el) {
  const d = gridDims(el);
  const list = [...entries];
  const cmp = (a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), game.i18n?.lang)
    || String(a.id).localeCompare(String(b.id));
  const cells = [];
  if (d.sort !== "manual") {
    list.sort(cmp);
    if (d.sort === "za") list.reverse();
    cells.push(...list);
  } else {
    const rest = [];
    for (const e of list.sort(cmp)) {
      const i = Number.isInteger(e.cell) ? e.cell : -1;
      if (i >= 0 && (!d.cap || i < d.cap) && !cells[i]) cells[i] = e;
      else rest.push(e);
    }
    let i = 0;
    for (const e of rest) { while (cells[i]) i++; cells[i] = e; }
  }
  /* Taille affichée : la capacité, sinon le contenu + une rangée libre
     (colonnes fixes) ; en colonnes auto, la fiche complète la rangée. */
  let n = cells.length;
  if (d.cap) n = Math.max(d.cap, n);
  else if (d.cols) n = (Math.ceil(n / d.cols) + (n % d.cols === 0 ? 1 : 0)) * d.cols;
  else n = n + 1;
  const out = [];
  for (let i = 0; i < n; i++) out.push(cells[i] ?? null);
  return out;
}

/** Une case : icône, quantité en badge, nom au choix. */
function gridCell(e, i, live, showName) {
  if (!e) return `<div class="sbe-grid-cell is-empty" data-cell="${i}"></div>`;
  const qty = e.qty > 1 ? `<span class="sbe-grid-qty">×${e.qty}</span>` : "";
  const name = showName ? `<span class="sbe-grid-name">${esc(e.name ?? "")}</span>` : "";
  if (!live) {
    return `<div class="sbe-grid-cell sbe-grid-item is-ghost" data-cell="${i}">
      <img src="icons/svg/item-bag.svg" alt="">${name}</div>`;
  }
  return `<div class="sbe-grid-cell sbe-grid-item" data-cell="${i}" data-item-id="${esc(e.id)}" data-uuid="${esc(e.uuid ?? "")}" draggable="true"${itemTipAttr(e, !!game.user?.isGM)}>
      ${withMarks(`<img src="${esc(e.img || "icons/svg/item-bag.svg")}" alt="">`, e.marks, "sbe-mk-fill")}${qty}${name}<a class="sbe-inv-menu" data-tooltip-text="${esc(game.i18n.localize("SBE.Inv.MenuBtn"))}"><i class="fa-solid fa-ellipsis-vertical"></i></a></div>`;
}

/** Une grille (entries = null : aperçu de l'atelier). */
function gridHTML(entries, el, live) {
  const d = gridDims(el);
  const name = d.name;
  let cells;
  if (entries === null) {
    const sample = [{ name: game.i18n.localize("SBE.Inv.SampleItem") }, { name: game.i18n.localize("SBE.Inv.SampleItem") }];
    cells = gridLayout([], el);
    if (cells.length < 3) cells = [null, null, null];
    cells[0] = sample[0]; cells[1] = sample[1];
  } else {
    cells = gridLayout(entries, el);
  }
  return `<div class="sbe-grid${d.cols ? "" : " sbe-grid--auto"}" data-sort="${d.sort}">${cells.map((e, i) => gridCell(e, i, live, name)).join("")}</div>`;
}

/* ------------------------------------------------------------ */
/*  GRILLE SPATIALE                                               */
/* ------------------------------------------------------------ */
/*  Colonnes × lignes fixes ; chaque objet occupe son rectangle     */
/*  (L × H, réglé sur l'objet du monde), pivotable d'un quart de    */
/*  tour. Ce qui ne rentre pas attend « hors de la grille ».        */
/*  Moteur et mise en place : builder/spatial.mjs.                  */
/* ------------------------------------------------------------ */

/** Pièces d'un conteneur (fiche) : celles des objets portés. */
function spatialEntryPieces(entries) {
  return entries.map(e => ({
    id: e.id, name: e.name, w: e.sp?.w ?? 1, h: e.sp?.h ?? 1,
    rot: e.rot ?? 0, x: e.x ?? 0, y: e.y ?? 0, placed: (e.cell ?? -1) >= 0, e
  }));
}

/** Contenu d'une pièce de la fiche : image tournée, quantité, menu. */
function spatialPieceOf(p, live) {
  const e = p.e;
  const art = spatialArtHTML({ img: e.sp?.img || e.img, w: e.sp?.w ?? 1, h: e.sp?.h ?? 1, rot: p.rot, fit: e.sp?.fit });
  if (!live) return { cls: "sbe-grid-item is-ghost", inner: art };
  const qty = e.qty > 1 ? `<span class="sbe-grid-qty">×${e.qty}</span>` : "";
  return {
    cls: "sbe-grid-item",
    attrs: `data-item-id="${esc(e.id)}" data-uuid="${esc(e.uuid ?? "")}" draggable="true"${itemTipAttr(e, !!game.user?.isGM)}`,
    inner: `${withMarks(art, e.marks, "sbe-mk-fill sbe-sp-host")}${qty}<a class="sbe-inv-menu" data-tooltip-text="${esc(game.i18n.localize("SBE.Inv.MenuBtn"))}"><i class="fa-solid fa-ellipsis-vertical"></i></a>`
  };
}

/**
 * Grille spatiale d'un conteneur (entries = null : aperçu de l'atelier,
 * avec deux objets d'exemple de tailles différentes).
 */
function spatialContHTML(entries, el, live) {
  const d = spatialDims(el.config ?? {});
  const L = (k) => game.i18n.localize(k);
  const pieces = entries === null
    ? [
      { id: "s1", name: L("SBE.Inv.SampleItem"), w: Math.min(1, d.cols), h: Math.min(2, d.rows), rot: 0, x: 0, y: 0, placed: true,
        e: { sp: { w: Math.min(1, d.cols), h: Math.min(2, d.rows), fit: "contain" }, img: "icons/svg/item-bag.svg" } },
      { id: "s2", name: L("SBE.Inv.SampleItem"), w: Math.min(2, d.cols), h: Math.min(2, d.rows), rot: 0, x: 0, y: 0, placed: false,
        e: { sp: { w: Math.min(2, d.cols), h: Math.min(2, d.rows), fit: "contain" }, img: "icons/svg/item-bag.svg" } }
    ]
    : spatialEntryPieces(entries);
  const { placed, out } = spatialLayout(pieces, d);
  const board = spatialBoardHTML({ d, placed, live, piece: (p) => spatialPieceOf(p, live) });
  if (!live || !out.length) return board;
  /* HORS DE LA GRILLE : ce qui n'a pas de place (grille réduite,
     objet reçu par un échange). On le replace en le glissant. */
  const outs = out.map(p => {
    const e = p.e;
    const v = spatialPieceOf({ ...p, rot: 0 }, true);
    return `<div class="sbe-sp-outitem sbe-grid-cell ${v.cls}" data-piece-id="${esc(e.id)}" data-fw="${p.fw}" data-fh="${p.fh}" ${v.attrs}>
      <img src="${esc(e.sp?.img || e.img || "icons/svg/item-bag.svg")}" alt="">${e.qty > 1 ? `<span class="sbe-grid-qty">×${e.qty}</span>` : ""}<a class="sbe-inv-menu" data-tooltip-text="${esc(L("SBE.Inv.MenuBtn"))}"><i class="fa-solid fa-ellipsis-vertical"></i></a></div>`;
  }).join("");
  return board + waitBandHTML({
    title: game.i18n.format("SBE.Inv.SpatialOut", { n: out.length }), hint: L("SBE.Inv.SpatialOutHint"),
    items: outs, style: `--sbe-sp-cell:${d.size}px;--sbe-grid-cell:${d.size}px`
  });
}

/**
 * Bande de la ZONE D'ATTENTE sous un conteneur : ce qui n'a pas de
 * place (hors de la grille spatiale, conteneur plein). Même bande,
 * même bouton « Organiser » pour tous les affichages.
 */
function waitBandHTML({ title, hint, items, style = "" }) {
  const L = (k) => game.i18n.localize(k);
  return `
    <div class="sbe-wait-band" style="${style}">
      <div class="sbe-wait-head"><i class="fa-solid fa-triangle-exclamation"></i>
        <span>${esc(title)}</span>
        <a class="sbe-wait-open" data-action="waitingItems" data-tooltip-text="${esc(L("SBE.Inv.WaitOpenHint"))}"><i class="fa-solid fa-box-open"></i> ${esc(L("SBE.Inv.WaitOpen"))}</a>
      </div>
      <p class="notes">${esc(hint)}</p>
      <div class="sbe-wait-list">${items}</div>
    </div>`;
}

/** Zone d'attente d'un conteneur en liste ou en grille (objets marqués). */
function waitingListHTML(entries) {
  if (!entries?.length) return "";
  const L = (k) => game.i18n.localize(k);
  const items = entries.map(e => `<div class="sbe-wait-item sbe-grid-cell sbe-grid-item" data-item-id="${esc(e.id)}" data-uuid="${esc(e.uuid ?? "")}" draggable="true"${itemTipAttr(e, !!game.user?.isGM)}>
      <img src="${esc(e.img || "icons/svg/item-bag.svg")}" alt="">${e.qty > 1 ? `<span class="sbe-grid-qty">×${e.qty}</span>` : ""}<a class="sbe-inv-menu" data-tooltip-text="${esc(L("SBE.Inv.MenuBtn"))}"><i class="fa-solid fa-ellipsis-vertical"></i></a></div>`).join("");
  return waitBandHTML({ title: game.i18n.format("SBE.Inv.Wait", { n: entries.length }), hint: L("SBE.Inv.WaitHint"), items });
}

/** Deux lignes d'exemple : l'atelier montre ce que la fiche affichera. */
function contSample(cols) {
  const ph = game.i18n.localize("SBE.Inv.SampleItem");
  const cells = cols.map(() => `<span class="sbe-cont-cell">—</span>`).join("");
  const one = `
    <div class="sbe-cont-row sbe-cont-row--ghost">
      <span class="sbe-cont-cell sbe-cont-cell--name">
        <img class="sbe-cont-img" src="icons/svg/item-bag.svg" alt="">
        <span class="sbe-cont-name">${esc(ph)}</span>
      </span>${cells}<span class="sbe-cont-acts"></span>
    </div>`;
  return one + one;
}

/** Option du modèle « Visible des joueurs » décochée : l'objet n'est
    montré qu'au MJ (il compte quand même dans les formules). */
const seenEntry = (e) => !e?.gmOnly || !!game.user?.isGM;

/**
 * Rendu d'un conteneur. `live` = fiche (objets réels, actions) ;
 * sinon atelier (aperçu avec deux lignes fantômes).
 */
export function containerHTML(el, opts = {}, live = false) {
  const cols = containerCols(el);
  const display = el.config?.display ?? "list";
  const entries = !live ? []
    : isRefList(el) ? ownedOnlyFilter(el, opts, refEntries(el, opts.values ?? {}, opts.hostId ?? ""))
      : (opts.inventory?.byKey?.[el.key] ?? []).filter(seenEntry);
  const cs = contStyles(el, opts.bgScope ?? null);
  const sp = styleParts(el);
  const head = `
    <div class="sbe-cont-head" style="${cs.head}">
      <span class="sbe-cont-cell sbe-cont-cell--name">${game.i18n.localize("SBE.Inv.ColName")}</span>
      ${cols.map(c => `<span class="sbe-cont-cell">${esc(c.label || containerKeyLabel(c.key))}</span>`).join("")}
      <span class="sbe-cont-acts"></span>
    </div>`;
  let body;
  const grid = display === "grid";
  const spatial = display === "spatial" && !isRefList(el);
  let bar = "";
  if (spatial) {
    body = spatialContHTML(live ? entries : null, el, live);
  } else if (grid) {
    /* Le rangement vient du JOUEUR (drapeau sur la fiche), pas du modèle. */
    el = { ...el, config: { ...(el.config ?? {}), gridSort: opts.gridSorts?.[el.key] ?? "az" } };
    bar = gridBar(el, el.config.gridSort, live);
    const sections = live ? contSections(entries, el)
      : (el.config?.catMode === "manual" ? sectionsManual([], el) : null);
    body = sections
      ? sections.map(sec => secHTML(sec, [], live, el)).join("")
      : gridHTML(live ? entries : null, el, live);
  } else if (display === "tiles" && isRefList(el)) {
    body = refTilesHTML(live ? entries : null, el, live);
  } else if (display === "cards" && !isRefList(el)) {
    body = cardsHTML(entries, el, opts.cards ?? {}, live);
  } else if (live && isRefList(el) && !entries.length) {
    body = `<p class="notes sbe-cont-empty">${game.i18n.localize(isMirrorList(el) ? "SBE.Inv.MirrorEmpty" : "SBE.Inv.RefEmpty")}</p>`;
  } else if (live) {
    const sections = contSections(entries, el);
    body = sections
      ? sections.map(sec => secHTML(sec, cols, true, el)).join("")
      : contBody(entries, cols, true, el);
  } else {
    /* Atelier : les sections écrites à la main s'affichent telles
       quelles (vides) ; celles déduites d'une clé n'existent qu'avec
       des objets, on montre alors deux lignes d'exemple. */
    const manual = (el.config?.catMode === "manual") ? sectionsManual([], el) : null;
    body = manual
      ? manual.map(sec => secHTML(sec, cols, false, el)).join("") + contSample(cols)
      : contSample(cols);
  }
  /* Charge : affichée seulement si le créateur a posé un maximum. */
  const max = live
    ? capacityOf(el, { ...(opts.values ?? {}), ...(opts.computedResults ?? {}) })
    : (Number.isFinite(Number(el.config?.qtyMax)) ? Number(el.config.qtyMax) : null);
  const load = entries.reduce((n, e) => n + (e.qty || 1), 0);
  const gauge = max
    ? `<span class="sbe-cont-load">${live ? load : 0} / ${max}</span>` : "";
  return `
    <div class="sbe-cont sbe-cont--${esc(display)}${isMirrorList(el) ? " sbe-cont--mirror" : " sbe-slot-drop"}" data-key="${esc(el.key)}" data-el-id="${esc(el.id)}" style="${contGrid(cols)}${contIconSize(el)}${grid ? gridVars(el) : ""}${cs.box}">
      ${gauge}${spatial || display === "cards" || (display === "tiles" && isRefList(el)) ? "" : grid ? bar : head}
      <div class="sbe-cont-body" style="${sp.value}">${body}</div>
      ${live && !isRefList(el) ? waitingListHTML((opts.inventory?.waiting?.[el.key] ?? []).filter(seenEntry)) : ""}
    </div>`;
}

/* ------------------------------------------------------------ */
/*  SLOTS                                                        */
/* ------------------------------------------------------------ */
/*  config = {                                                   */
/*    mode: "instance" (accueille un OBJET)                      */
/*        | "reference" (référence un MODÈLE),                   */
/*    filterType: "none"|"template"|"tag"|"key",                 */
/*    filterTemplates: [ids], filterTag: "…", filterKey: "…"     */
/*  }                                                            */
/*  Valeur sur l'objet : values[clé] = { uuid, name, img }.      */
/* ============================================================ */

/** Visuel d'un SLOT VIDE. Le créateur peut lui donner une identité —
    icône de libellé, fond (couleur/texture du style) : dans ce cas ce
    visuel PARLE DE LUI-MÊME et aucun texte d'aide ne s'affiche. Sans
    identité : la cible ⌖ (et, dans l'atelier seulement, le texte
    d'aide + le résumé du filtre — jamais sur la fiche). */
function slotEmptyDecor(el, workshop) {
  const hasBg = !!(el.style?.bgTexture || el.style?.bgColor);
  const hasIcon = !!String(el.config?.labelIcon ?? "").trim();
  const icon = hasIcon ? labelIconHTML(el).trim()
    : (hasBg ? "" : `<i class="fa-solid fa-bullseye"></i>`);
  /* TEXTE QUAND VIDE (« Glisser une classe ») : l'invite du créateur,
     identique dans l'atelier et sur la fiche, à la police de la valeur. */
  const txt = String(el.config?.emptyText ?? "").trim();
  if (txt) {
    return `${icon}<span class="sbe-slot-empty-text" style="${styleParts(el).value}">${esc(txt)}</span>`;
  }
  if (!workshop || hasBg || hasIcon) return icon;
  return `${icon}
          <span>${hiddenBadge(el)}${esc(el.label ?? "")}</span>
          <span class="sbe-slot-note">${slotFilterSummary(el)}</span>`;
}

/** Un slot est TOUJOURS carré : la taille choisie, sinon 64 px. */
export const SLOT_DEFAULT_SIZE = 64;
/** Style inline de taille du slot : CARRÉ (px, vide = auto) —
    une seule dimension pour ne jamais déformer les icônes. */
function slotSizeStyle(el) {
  const size = Number(el.config?.size ?? el.config?.width ?? el.config?.height ?? 0) || SLOT_DEFAULT_SIZE;
  return `width:${size}px;height:${size}px;`;
}

/** Couleur de la valeur d'un nombre « 2 en 1 » : aucune, la part qui
    vient d'objets portés (défaut), ou tout le bonus. */
export const BONUS_TONES = ["none", "items", "all"];

/** Slot « nom à droite » : seule l'icône est carrée (taille du slot). */
function slotIconVar(el) {
  const size = Number(el.config?.size ?? 0) || SLOT_DEFAULT_SIZE;
  return `--sbe-slot-ic:${size}px;`;
}

/** Résumé lisible du filtre d'un slot (atelier + case vide). */
export function slotFilterSummary(el) {
  const c = el.config ?? {};
  const L = (k) => game.i18n.localize(k);
  const mode = c.mode === "reference" ? L("SBE.Slot.ModeReferenceShort") : L("SBE.Slot.ModeInstanceShort");
  let filter = "";
  if (!c.filterType || c.filterType === "none") {
    return `${mode} — ${L("SBE.Slot.NoFilterShort")}`;
  }
  if (c.filterType === "template") {
    const names = (Array.isArray(c.filterTemplates) ? c.filterTemplates : [])
      .map(id => game.items.get(id)?.name).filter(Boolean);
    if (names.length) filter = names.join(", ");
  } else if (c.filterType === "tag" && c.filterTag) {
    filter = `${L("SBE.Slot.FilterTagShort")} ${game.i18n.format("SBE.Quote", { t: c.filterTag })}`;
  } else if (c.filterType === "key" && c.filterKey) {
    filter = `${L("SBE.Slot.FilterKeyShort")} ${game.i18n.format("SBE.Quote", { t: c.filterKey })}`;
  }
  return filter ? `${mode} — ${esc(filter)}` : mode;
}

/**
 * ÉTIQUETTES d'un objet, en minuscules : celles écrites en dur dans le
 * modèle et celles liées à une clé (« @clé »), dont la valeur est lue
 * sur l'objet. Sert au filtre des contenants ET au classement par
 * catégories — une seule lecture, un seul comportement.
 */
/* Étiquettes d'un objet, gardées tant que rien n'a bougé (révision des
   données) : chaque inventaire les relit pour chaque objet, et les
   chercher parcourt tout le modèle. */
const ITEM_TAGS = new WeakMap();
export function itemTags(item) {
  if (!item) return [];
  return [...memoOf(ITEM_TAGS, item, () => itemTagsNow(item))];
}

function itemTagsNow(item) {
  const tpl = item?.type === "objet" ? item.system?.template : item;
  const els = tpl?.system?.elements ?? [];
  const out = [];
  for (const tEl of collectTags(els)) {
    for (const entry of (tEl.config?.entries ?? [])) {
      if (!entry) continue;
      if (entry.startsWith("@")) {
        const key = entry.slice(1).trim();
        const src = findByKeyIn(els, key);
        /* Un champ masqué (« Visible si ») ne donne pas d'étiquette. */
        if (src && hiddenByPath(els, item.type === "objet" ? item.system?.values : {}, src)) continue;
        const v = item.type === "objet"
          ? (item.system?.values?.[key] ?? src?.config?.default)
          : src?.config?.default;
        if (v !== undefined && v !== null && v !== "") out.push(String(v));
      } else {
        out.push(entry);
      }
    }
  }
  return out.map(t => t.trim().toLowerCase()).filter(Boolean);
}

/** Ce contenant est-il masqué (« Visible si ») sur la fiche qui le porte ? */
function hiddenOnHost(el, host) {
  return hiddenByPath(host?.system?.template?.system?.elements ?? [], host?.system?.values ?? {}, el);
}

/**
 * Cet élément est-il masqué par un « Visible si » (le sien ou celui
 * d'un cadre, d'une colonne… qui le contient) pour ces valeurs ?
 * Une expression en échec ne masque pas ici.
 */
function hiddenByPath(roots, values, el) {
  if (!roots?.length || !el) return false;
  const path = pathOf(roots, el);
  if (!path || !path.some(e => String(e.visibleIf ?? "").trim())) return false;
  const scope = scopeFor(roots, values ?? {});
  if (!scope) return false;
  return path.some(e => {
    const expr = String(e.visibleIf ?? "").trim();
    if (!expr) return false;
    try { const r = evalExpression(expr, scope); return r !== null && r !== undefined && !r; } catch (_e) { return false; }
  });
}

/* Mémoires de hiddenByPath : appelé pour chaque objet à chaque inventaire
   (étiquettes), il ne refait ni la recherche du chemin ni la portée tant
   que le modèle et les valeurs n'ont pas changé (nouvel objet = à refaire). */
const PATHS = new WeakMap();      /* éléments du modèle → (élément → chemin) */
const SCOPES = new WeakMap();     /* valeurs → (éléments du modèle → portée) */

/** Le chemin de l'élément (ses cadres, colonnes…) dans le modèle, ou null. */
function pathOf(roots, el) {
  let byEl = PATHS.get(roots);
  if (!byEl) { byEl = new Map(); PATHS.set(roots, byEl); }
  const id = el.id || `key:${el.key ?? ""}`;
  if (byEl.has(id)) return byEl.get(id);
  const path = [];
  const find = (list, trail) => {
    for (const e of list ?? []) {
      if (!e || typeof e !== "object") continue;
      const t = [...trail, e];
      if (e === el || (el.id && e.id === el.id) || (!el.id && el.key && e.key === el.key)) { path.push(...t); return true; }
      if (Array.isArray(e.children) && find(e.children, t)) return true;
      if (Array.isArray(e.cols)) for (const c of e.cols) if (find(Array.isArray(c) ? c : [c], t)) return true;
    }
    return false;
  };
  const out = find(roots, []) ? path : null;
  byEl.set(id, out);
  return out;
}

function scopeFor(roots, values) {
  if (!values || typeof values !== "object") values = {};
  let byRoots = SCOPES.get(values);
  if (!byRoots) { byRoots = new WeakMap(); SCOPES.set(values, byRoots); }
  if (byRoots.has(roots)) return byRoots.get(roots);
  let scope = null;
  try { scope = withLookups(buildScope(roots, values, {}), roots); } catch (_e) { scope = null; }
  byRoots.set(roots, scope);
  return scope;
}

/**
 * L'item déposé est-il accepté par ce slot ?
 * @returns {string|null} clé i18n du refus, ou null si accepté.
 */
export function slotAccepts(el, item, host = null) {
  const c = el.config ?? {};
  /* Une LISTE DE RÉFÉRENCES ne contient pas d'objets portés : rien ne
     s'y range par le chemin de l'inventaire. */
  if (isRefList(el) && item?.parent) return "SBE.Inv.RefNotCarried";
  /* Le mode « reference » d'un SLOT vise un modèle d'atelier ; celui
     d'un CONTENEUR vise des objets du monde — donc des objets. */
  const mode = (el.kind === "slot" && c.mode === "reference") ? "reference" : "instance";
  if (mode === "instance" && item.type !== "objet") return "SBE.Slot.NeedObject";
  if (mode === "reference" && item.type !== "template") return "SBE.Slot.NeedModel";

  const tpl = item.type === "objet" ? item.system.template : item;
  if (!tpl) return "SBE.Slot.NeedObject";

  /* Un contenant MASQUÉ sur la fiche qui le porte (« Visible si » faux,
     pour lui ou un cadre qui le contient) n'accepte rien : les
     accessoires d'une arme qui n'en prend pas ne se montent par aucun
     chemin (glisser, recharger, étape). */
  if (host && hiddenOnHost(el, host)) return "SBE.Slot.Hidden";

  /* REFUSER des étiquettes (l'inventaire général sans les recettes). */
  const nope = String(c.excludeTag ?? "").split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
  if (nope.length && itemTags(item).some(t => nope.includes(t))) return "SBE.Slot.Excluded";
  /* UN SEUL de chaque sur la fiche (une recette connue ne se double pas). */
  if (c.unique && host?.documentName === "Actor") {
    const me = identityOf(item);
    const dup = (host.items?.contents ?? [...(host.items ?? [])]).some(i => i.id !== item.id && identityOf(i) === me);
    if (dup) return "SBE.Slot.AlreadyOwned";
  }

  if (c.filterType === "template") {
    const list = Array.isArray(c.filterTemplates) ? c.filterTemplates : [];
    if (!list.length) return "SBE.Slot.NoFilter"; /* rien de coché = rien d'accepté */
    if (!list.includes(tpl.id)) return "SBE.Slot.Rejected";
  } else if (c.filterType === "tag") {
    /* Plusieurs étiquettes séparées par des virgules : l'objet doit
       les porter TOUTES (« accessoire, poignée » ≠ la poignée d'une
       arme de mêlée). */
    const wants = String(c.filterTag ?? "").split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
    if (!wants.length) return "SBE.Slot.NoFilter";
    const has = itemTags(item);
    if (!wants.every(w => has.includes(w))) return "SBE.Slot.Rejected";
  } else if (c.filterType === "key") {
    const want = String(c.filterKey ?? "").trim();
    if (!want) return "SBE.Slot.NoFilter";
    if (!allKeys(tpl.system.elements ?? []).includes(want)) return "SBE.Slot.Rejected";
  } else {
    /* AUCUN filtre défini : un SLOT n'accepte RIEN (décision actée —
       jamais de slot fourre-tout par défaut), alors qu'un CONTENEUR
       accepte tout : c'est le sac, son rôle est de tout recevoir tant
       que le créateur n'a pas restreint. */
    if (el.kind === "container") return listCheck(c, item, host) ?? compatCheck(c, item, host);
    return "SBE.Slot.NoFilter";
  }
  return listCheck(c, item, host) ?? compatCheck(c, item, host);
}

/**
 * COMPATIBILITÉ avec l'hôte (option du slot / conteneur) :
 * `compatKey` = une liste déroulante de l'HÔTE (catégorie d'arme,
 * classe…). L'objet qu'on dépose déclare ses compatibilités par des
 * CASES À COCHER dont le libellé reprend un choix de cette liste
 * (« Arme de poing », « PM »…).
 *   - aucune de ces cases cochée (ou aucune case) → il va partout ;
 *   - sinon → seulement si la case du choix actuel de l'hôte est cochée.
 * Rien à câbler : même règle sur un objet ou une fiche de personnage.
 */
function compatCheck(c, item, host) {
  const key = String(c.compatKey ?? "").trim();
  if (!key || !host || item?.type !== "objet") return null;
  const hostEls = host.system?.template?.system?.elements ?? [];
  const hostEl = findByKeyIn(hostEls, key);
  const choices = (hostEl?.config?.choices ?? []).map(x => String(x).trim().toLowerCase()).filter(Boolean);
  if (!choices.length) return null;
  const hostVal = String(host.system?.values?.[key] ?? hostEl?.config?.default ?? "").trim().toLowerCase();
  const vals = item.system?.values ?? {};
  const boxes = [...walkElements(item.system?.template?.system?.elements ?? [])]
    .filter(e => e?.kind === "checkbox" && e.key && choices.includes(String(e.label ?? "").trim().toLowerCase()));
  const checked = boxes.filter(e => !!(vals[e.key] ?? e.config?.default));
  if (!checked.length) return null;
  return checked.some(e => String(e.label).trim().toLowerCase() === hostVal) ? null : "SBE.Slot.Incompatible";
}

/**
 * « Seulement les objets de la liste » : le contenant n'accepte que
 * les objets dont le MODÈLE figure dans une liste de références de son
 * hôte (l'arme et ses munitions compatibles). Liste vide = rien
 * n'entre. Sans hôte connu, on ne peut pas vérifier : refus.
 */
function listCheck(c, item, host) {
  const key = String(c.listKey ?? "").trim();
  if (!key) return null;
  const ids = refIds(host?.system?.values, key);
  if (!ids.length) return "SBE.Slot.ListEmpty";
  return ids.includes(identityOf(item)) ? null : "SBE.Slot.NotListed";
}

/* ------------------------------------------------------------ */
/*  LISTE DE RÉFÉRENCES (conteneur en mode « reference »)         */
/* ------------------------------------------------------------ */
/*  Même affichage qu'un conteneur, mais il ne PORTE rien : il      */
/*  désigne des objets du monde (ses modèles d'objets). Valeur sur  */
/*  l'objet : values[clé] = [ids d'objets du monde]. Sert à dire   */
/*  « munitions compatibles », « outils requis »… et un slot peut  */
/*  s'y limiter.                                                   */
/* ------------------------------------------------------------ */

export function isRefList(el) {
  return el?.kind === "container" && el.config?.mode === "reference";
}

/** Liste en REFLET d'une autre (lecture seule : ni dépôt, ni retrait). */
export function isMirrorList(el) {
  return isRefList(el) && ((!!String(el.config?.mirror ?? "").trim() && el.config.mirror !== el.key) || isReverseList(el));
}

/** Liste INVERSE : les objets du monde qui citent CELUI-CI dans leur
    liste « reverse » (les outils qui listent cette recette). Lecture seule. */
export function isReverseList(el) {
  return isRefList(el) && !!String(el.config?.reverse ?? "").trim();
}

/** Les ids d'une liste de références (tableau propre, toujours). */
export function refIds(values, key) {
  const v = values?.[key];
  return Array.isArray(v) ? v.filter(x => typeof x === "string" && x) : [];
}

/** Le modèle dont un objet est l'exemplaire (lui-même s'il est le modèle). */
export function identityOf(item) {
  return String(item?.system?.modelId || item?.id || "");
}

/** Entrées d'affichage d'une liste de références. Une référence vers
    un objet du monde supprimé est simplement ignorée. */
function refEntries(el, values, hostId = "") {
  const out = [];
  /* REFLET : la liste montre celle d'une autre clé, en lecture seule. */
  const mirror = isMirrorList(el);
  /* INVERSE : les objets du monde (modèles) dont la liste « reverse »
     contient l'hôte. */
  const rev = String(el.config?.reverse ?? "").trim();
  const ids = rev
    ? (hostId ? (game.items?.filter?.(i => i.type === "objet" && !i.system?.modelId && refIds(i.system?.values, rev).includes(hostId)) ?? [])
      .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang)).map(i => i.id) : [])
    : refIds(values, mirror ? el.config.mirror : el.key);
  for (const id of ids) {
    const it = game.items?.get?.(id);
    if (!it || it.type !== "objet") continue;
    out.push({
      id: it.id, ref: true, listKey: el.key, mirror,
      /* Liste « non modifiable par les joueurs » : ni retrait ni dépôt. */
      locked: !game.user?.isGM && el.playerEditable === false,
      templateId: it.system?.templateId ?? "",
      templateName: it.system?.template?.name ?? "",
      tags: itemTags(it),
      uuid: it.uuid, name: it.name, img: it.img,
      qty: 1, stackable: false, modelId: "", modelName: it.name,
      vals: { ...(it.system?.values ?? {}) }
    });
  }
  return out;
}

/**
 * Liste de références en CARTES : grande icône, nom entier dessous,
 * ouvrir / retirer au survol. Vide : une case pointillée « + » qui
 * invite à glisser un objet (rien pour qui ne peut pas modifier).
 */
function refTilesHTML(entries, el, live) {
  const L = (k) => game.i18n.localize(k);
  if (!live) {
    return `<div class="sbe-ref-tiles"><div class="sbe-ref-tile sbe-ref-tile--empty"><i class="fa-solid fa-plus"></i><span>${esc(L("SBE.Inv.TileDrop"))}</span></div></div>`;
  }
  if (!entries.length) {
    const locked = isMirrorList(el) || (!game.user?.isGM && el.playerEditable === false);
    return `<div class="sbe-ref-tiles"><div class="sbe-ref-tile sbe-ref-tile--empty${locked ? " is-locked" : ""}">
      ${locked ? `<span>—</span>` : `<i class="fa-solid fa-plus"></i><span>${esc(L("SBE.Inv.TileDrop"))}</span>`}</div></div>`;
  }
  return `<div class="sbe-ref-tiles">${entries.map(e => `
    <div class="sbe-ref-tile" data-ref-id="${esc(e.id)}">
      <img src="${esc(e.img || "icons/svg/item-bag.svg")}" alt="">
      <span class="sbe-ref-tile-name">${esc(e.name ?? "")}</span>
      <span class="sbe-ref-tile-acts">
        <a data-action="openRef" data-uuid="${esc(e.uuid)}" title="${L("SBE.Slot.Open")}"><i class="fa-solid fa-up-right-from-square"></i></a>
        ${e.mirror || e.locked ? "" : `<a data-action="removeRef" data-key="${esc(e.listKey)}" data-ref-id="${esc(e.id)}" title="${L("SBE.Inv.RefRemove")}"><i class="fa-solid fa-xmark"></i></a>`}
      </span>
    </div>`).join("")}</div>`;
}

/**
 * « Joueurs : seulement ce qu'ils possèdent » : un joueur ne voit, dans
 * une liste de références, que les objets dont son personnage porte un
 * exemplaire (le porteur de l'objet affiché, sinon son personnage). Le
 * MJ voit tout.
 */
function ownedOnlyFilter(el, opts, entries) {
  if (!el.config?.ownedOnly || game.user?.isGM) return entries;
  const host = opts.hostDoc ?? null;
  const owner = host?.documentName === "Actor" ? host
    : (host?.parent?.documentName === "Actor" ? host.parent : game.user?.character ?? null);
  if (!owner) return [];
  const have = new Set((owner.items?.contents ?? [...(owner.items ?? [])]).map(i => identityOf(i)));
  return entries.filter(e => have.has(e.id));
}

/** Élément par clé dans un arbre. */
function findByKeyIn(list, key) {
  for (const e of walkElements(list)) if (e?.key === key) return e;
  return null;
}
