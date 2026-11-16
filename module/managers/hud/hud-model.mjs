/**
 * SBE — HUD : la configuration (une par MODÈLE de personnage)
 *
 * Le HUD vit sur le modèle (system.hud) : un modèle « Humain » et un
 * modèle « Monstre » ont chacun le leur, et il voyage avec l'export du
 * modèle. Rien n'est écrit en dur : chaque entrée pointe une CLÉ du
 * modèle (valeur, bouton, slot, liste) ou un objet du monde.
 *
 *   hud = {
 *     enabled,
 *     nodes: [ entrée ],                  la barre (premier niveau)
 *     settings: { openOn, directRun, emptySlots, hotbarButton, effectsButton },
 *     minis: [ petit bouton ]             à côté du cadenas (voir cleanMini)
 *     look: { palette:{dark,light}, layout:{…}, decorations:[…], customCss }
 *   }
 *
 *   entrée = { id, type, label?, icon?, color?, playerVisible?, … }
 *     menu      children: [entrée]            un menu, et ses sous-menus
 *               keepEmpty                     affiché (grisé) même vide
 *     value     key                           une valeur ; clic = son jet
 *     button    key                           un bouton de la fiche
 *     slot      key                           l'objet logé (ses actions)
 *     list      key ("" = tout ce qui est porté), tags, groupBy
 *               les objets d'une liste, rangés en sous-menus selon
 *               un champ de l'objet (école : Feu, Lumière…)
 *     model     modelId, modelName            un objet précis du monde
 *     separator
 */

const HEX = /^#[0-9a-f]{6}$/i;
/* Couleurs du HUD : avec transparence possible (#rrggbbaa). */
const HEXA = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
export const NODE_TYPES = ["menu", "value", "button", "slot", "list", "model", "separator"];
export const OPEN_ON = ["hover", "click"];
export const ORIENTATIONS = ["row", "column"];
export const ANCHORS = ["bottom", "top", "left", "right"];
/** Ancien réglage « anchor » → position de départ en % (X, Y). */
export const ANCHOR_POS = { bottom: [50, 80], top: [50, 12], left: [8, 50], right: [78, 50] };
export const LABEL_MODES = ["both", "icon", "label"];
/* Où poser l'en-tête (portrait + nom) et les petits boutons. */
export const HEAD_SIDES = ["top", "bottom", "left", "right"];
export const CHROME_SIDES = ["head", "top", "bottom", "left", "right"];
export const DECO_ANCHORS = ["top-left", "top-center", "top-right", "middle-left", "center", "middle-right", "bottom-left", "bottom-center", "bottom-right"];

/**
 * Les couleurs du HUD, en sombre et en clair. Chaque couleur peut être
 * translucide (#rrggbbaa) : la barre et les menus laissent voir la
 * carte, floutée. Bases : la palette gris-métal de l'ancien HUD.
 */
export const HUD_TOKENS = ["bg", "bgEnd", "border", "borderHover", "btn", "btnHover", "item", "itemHover", "text", "textDim", "value", "accent"];
export const HUD_PALETTE_DEFAULTS = {
  dark: {
    bg: "#2d2d3099", bgEnd: "#23232699", border: "#8c8c9173", borderHover: "#b4b4b9b3",
    btn: "#37373a8c", btnHover: "#8282878c", item: "#414144a6", itemHover: "#82828799",
    text: "#e8e8e8", textDim: "#c8c8c8", value: "#ffffff", accent: "#b5471f"
  },
  light: {
    bg: "#d8dbde9e", bgEnd: "#c7cace9e", border: "#a8abb0", borderHover: "#888d93",
    btn: "#c7cace8c", btnHover: "#aab0b68c", item: "#cfd2d6a6", itemHover: "#bcc0c599",
    text: "#1e2024", textDim: "#3a3d42", value: "#1e2024", accent: "#b5471f"
  }
};

/** « #rrggbbaa » → { hex: "#rrggbb", alpha: 0..100 }. */
export function splitColor(c) {
  const v = String(c ?? "").toLowerCase();
  const hex = v.slice(0, 7);
  const a = v.length === 9 ? Math.round(parseInt(v.slice(7), 16) / 2.55) : 100;
  return { hex, alpha: a };
}

/** { hex, alpha } → « #rrggbb » (opaque) ou « #rrggbbaa ». */
export function joinColor(hex, alpha) {
  const a = Math.max(0, Math.min(100, Math.round(Number(alpha))));
  if (!Number.isFinite(a) || a >= 100) return String(hex).toLowerCase();
  return `${String(hex).toLowerCase()}${Math.round(a * 2.55).toString(16).padStart(2, "0")}`;
}

export const HUD_DEFAULTS = {
  enabled: false,
  nodes: [],
  settings: {
    openOn: "hover",        /* menus : au survol ou au clic */
    directRun: true,        /* un objet à UNE action : le clic la lance */
    emptySlots: "hide",     /* slot vide : caché ou grisé */
    hotbarButton: true,     /* bouton « barre de macros » proposé */
    effectsButton: true     /* bouton « effets du personnage » proposé */
  },
  minis: [],
  look: {
    palette: { dark: {}, light: {} },   /* seulement les écarts aux bases */
    layout: {
      orientation: "row", posX: 50, posY: 80,
      size: 52, gap: 4, radius: 8, iconSize: 18, itemSize: 44,
      labels: "both", fontSize: 12, panelWidth: 220, btnWidth: 0, itemHeight: 0, hudWidth: 0,
      opacity: 100, blur: 3, iconTop: false, header: false,
      showPortrait: false, showName: false, headerPos: "top", portraitSize: 30, nameSize: 14, chromePos: "head"
    },
    decorations: [],
    customCss: ""
  }
};

const num = (v, d, min = -Infinity, max = Infinity) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};
const str = (v) => String(v ?? "").trim();
const pick = (v, list) => (list.includes(v) ? v : list[0]);

/** Une entrée nettoyée (lecture, import). null = inutilisable. */
export function cleanNode(n, depth = 0) {
  if (!n || typeof n !== "object" || !NODE_TYPES.includes(n.type)) return null;
  const out = { id: str(n.id) || foundry.utils.randomID(), type: n.type };
  if (str(n.label)) out.label = str(n.label);
  if (str(n.icon)) out.icon = str(n.icon);
  if (HEX.test(str(n.color))) out.color = str(n.color).toLowerCase();
  if (n.playerVisible === false) out.playerVisible = false;
  switch (n.type) {
    case "menu":
      out.children = depth > 8 ? [] : (Array.isArray(n.children) ? n.children : [])
        .map(c => cleanNode(c, depth + 1)).filter(Boolean);
      if (n.keepEmpty === true) out.keepEmpty = true;
      break;
    case "value": case "button": case "slot":
      out.key = str(n.key);
      if (!out.key) return null;
      break;
    case "list":
      out.key = str(n.key);
      if (str(n.tags)) out.tags = str(n.tags);
      if (str(n.groupBy)) out.groupBy = str(n.groupBy);
      break;
    case "model":
      out.modelId = str(n.modelId);
      out.modelName = str(n.modelName);
      if (!out.modelId && !out.modelName) return null;
      break;
  }
  return out;
}

export function cleanDecoration(d) {
  return {
    id: str(d?.id) || foundry.utils.randomID(),
    source: d?.source === "file" ? "file" : "code",
    code: String(d?.code ?? ""),
    path: str(d?.path),
    anchor: pick(d?.anchor, ["top-center", ...DECO_ANCHORS.filter(a => a !== "top-center")]),
    dx: num(d?.dx, 0), dy: num(d?.dy, 0),
    width: num(d?.width, 120, 4, 4000), height: num(d?.height, 40, 4, 4000),
    layer: d?.layer === "below" ? "below" : "above",
    opacity: num(d?.opacity, 100, 0, 100)
  };
}

/**
 * PETIT BOUTON à côté du cadenas : libre, autant qu'on veut.
 *   kind "item"  : un bouton de MODÈLE D'OBJET (sa clé, ex. « allumer »),
 *                  exécuté sur le premier objet ÉQUIPÉ qui l'a — le petit
 *                  bouton n'apparaît que si un tel objet est équipé ;
 *   kind "sheet" : un bouton de la fiche du personnage (sa clé).
 *   onIf         : formule lue sur l'objet (« allume ») — vraie, le petit
 *                  bouton est montré enfoncé.
 */
export function cleanMini(m) {
  return {
    id: str(m?.id) || foundry.utils.randomID(),
    icon: str(m?.icon) || "fa-circle-dot",
    label: str(m?.label),
    kind: m?.kind === "sheet" ? "sheet" : "item",
    key: str(m?.key),
    onIf: str(m?.onIf)
  };
}

/** La configuration complète, défauts compris, toujours valide. */
export function normalizeHud(raw) {
  const r = (raw && typeof raw === "object") ? raw : {};
  const s = r.settings ?? {};
  const lk = r.look ?? {};
  const ly = lk.layout ?? {};
  const pal = { dark: {}, light: {} };
  for (const mode of ["dark", "light"]) {
    for (const t of HUD_TOKENS) {
      const v = str(lk.palette?.[mode]?.[t]).toLowerCase();
      if (HEXA.test(v) && v !== HUD_PALETTE_DEFAULTS[mode][t]) pal[mode][t] = v;
    }
  }
  const D = HUD_DEFAULTS.look.layout;
  return {
    enabled: !!r.enabled,
    nodes: (Array.isArray(r.nodes) ? r.nodes : []).map(n => cleanNode(n)).filter(Boolean),
    settings: {
      openOn: pick(s.openOn, OPEN_ON),
      directRun: s.directRun !== false,
      emptySlots: s.emptySlots === "show" ? "show" : "hide",
      hotbarButton: s.hotbarButton !== false,
      effectsButton: s.effectsButton !== false
    },
    minis: (Array.isArray(r.minis) ? r.minis : []).map(cleanMini),
    look: {
      palette: pal,
      layout: {
        orientation: pick(ly.orientation, ORIENTATIONS),
        /* Position de départ : le CENTRE du HUD à posX % de la largeur
           et posY % de la hauteur de l'écran. L'ancien réglage
           « anchor » (en bas, en haut…) est converti. */
        posX: num(ly.posX ?? ANCHOR_POS[ly.anchor]?.[0], D.posX, 0, 100),
        posY: num(ly.posY ?? ANCHOR_POS[ly.anchor]?.[1], D.posY, 0, 100),
        size: num(ly.size, D.size, 24, 160),
        gap: num(ly.gap, D.gap, 0, 40),
        radius: num(ly.radius, D.radius, 0, 80),
        iconSize: num(ly.iconSize, D.iconSize, 8, 128),
        itemSize: num(ly.itemSize, D.itemSize, 8, 128),
        labels: pick(ly.labels, LABEL_MODES),
        fontSize: num(ly.fontSize, D.fontSize, 8, 32),
        panelWidth: num(ly.panelWidth, D.panelWidth, 120, 600),
        /* 0 = automatique. Largeur des boutons de la BARRE (en ligne ou
           en colonne) ; hauteur des entrées des MENUS. */
        btnWidth: num(ly.btnWidth, D.btnWidth, 0, 600),
        /* Largeur du HUD entier (0 = selon son contenu). */
        hudWidth: num(ly.hudWidth, D.hudWidth, 0, 2000),
        itemHeight: num(ly.itemHeight, D.itemHeight, 0, 200),
        opacity: num(ly.opacity, D.opacity, 10, 100),
        blur: num(ly.blur, D.blur, 0, 20),
        iconTop: !!ly.iconTop,
        /* En-tête : portrait et/ou nom. L'ancienne case « header »
           (les deux ensemble) est reprise. */
        showPortrait: !!(ly.showPortrait ?? ly.header),
        showName: !!(ly.showName ?? ly.header),
        headerPos: pick(ly.headerPos, HEAD_SIDES),
        portraitSize: num(ly.portraitSize, D.portraitSize, 12, 200),
        nameSize: num(ly.nameSize, D.nameSize, 8, 48),
        chromePos: pick(ly.chromePos, CHROME_SIDES),
        header: !!((ly.showPortrait ?? !!ly.header) || (ly.showName ?? !!ly.header))
      },
      decorations: (Array.isArray(lk.decorations) ? lk.decorations : []).map(cleanDecoration),
      customCss: String(lk.customCss ?? "")
    }
  };
}

/** Le HUD d'un modèle de personnage. */
export function hudOf(tpl) {
  return normalizeHud(tpl?.system?.hud);
}

/** Palette effective (bases + écarts). */
export function paletteOf(cfg) {
  return {
    dark: { ...HUD_PALETTE_DEFAULTS.dark, ...(cfg.look.palette.dark ?? {}) },
    light: { ...HUD_PALETTE_DEFAULTS.light, ...(cfg.look.palette.light ?? {}) }
  };
}

/** Parcourt toutes les entrées (menus compris). */
export function* walkNodes(list) {
  for (const n of list ?? []) {
    yield n;
    if (n.type === "menu") yield* walkNodes(n.children);
  }
}

/* ------------------------------------------------------------ */
/*  CSS d'un HUD : couleurs (clair / sombre), mesures, CSS libre */
/* ------------------------------------------------------------ */

/** Assainit un SVG collé (pas de scripts ni de gestionnaires). */
export function sanitizeSvg(code) {
  return String(code ?? "")
    .replace(/<script[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "")
    .trim();
}

/**
 * @param scope  valeur de data-hud (id du modèle, ou id d'aperçu)
 * « @hud » dans le CSS libre = le sélecteur de CE HUD.
 */
export function buildHudCss(scope, cfg) {
  const S = `.sbe-hud[data-hud="${scope}"]`;
  const pal = paletteOf(cfg);
  const ly = cfg.look.layout;
  const vars = (p) => HUD_TOKENS.map(t => `  --hud-${t}: ${p[t]};`).join("\n");
  /* Deux thèmes : l'interface de Foundry en clair → les couleurs claires,
     en sombre → les sombres (le HUD suit l'interface, helpers/ui-theme).
     L'aperçu du manager peut forcer l'un ou l'autre. */
  let css = `${S} {\n${vars(pal.dark)}\n` +
    `  --hud-size: ${ly.size}px;\n  --hud-gap: ${ly.gap}px;\n  --hud-radius: ${ly.radius}px;\n` +
    `  --hud-icon: ${ly.iconSize}px;\n  --hud-item-size: ${ly.itemSize}px;\n  --hud-font: ${ly.fontSize}px;\n  --hud-panel-w: ${ly.panelWidth}px;\n` +
    `  --hud-portrait: ${ly.portraitSize}px;\n  --hud-name: ${ly.nameSize}px;\n` +
    `  --hud-opacity: ${ly.opacity / 100};\n  --hud-blur: ${ly.blur}px;\n}\n`;
  css += `#interface.theme-light ${S}:not(.sbe-hud--dark), ${S}.sbe-hud--light {\n${vars(pal.light)}\n}\n`;
  /* Largeur fixe des boutons de la barre (sinon : ils s'étirent). */
  if (ly.btnWidth > 0) {
    css += `${S} .sbe-hud-bar > .sbe-hud-btn { flex: 0 0 auto !important; width: ${ly.btnWidth}px; min-width: 0 !important; }\n`
      + `${S}.sbe-hud--column .sbe-hud-bar { align-items: center; }\n`;
  }
  /* Largeur du HUD entier : les boutons automatiques s'étirent dedans. */
  if (ly.hudWidth > 0) {
    css += `${S} .sbe-hud-frame { width: ${ly.hudWidth}px; box-sizing: border-box; }\n`;
  }
  /* Hauteur fixe des entrées des menus. */
  if (ly.itemHeight > 0) {
    css += `${S} .sbe-hud-panel .sbe-hud-btn { min-height: ${ly.itemHeight}px; height: ${ly.itemHeight}px; }\n`;
  }
  const custom = String(cfg.look.customCss ?? "").trim().replace(/@hud/g, S);
  if (custom) css += `\n/* --- CSS libre du HUD --- */\n${custom}\n`;
  return css;
}

/** Pose / met à jour la feuille d'un HUD. */
export function injectHudCss(scope, cfg) {
  const id = `sbe-hud-css-${scope}`;
  let tag = document.getElementById(id);
  if (!tag) { tag = document.createElement("style"); tag.id = id; }
  document.head.appendChild(tag);
  tag.textContent = buildHudCss(scope, cfg);
}

/** Décorations (SVG collé ou image) posées autour de la barre. */
export function decorationsHtml(cfg) {
  const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
  return (cfg.look.decorations ?? []).map((d, i) => {
    let url = null;
    if (d.source === "code") {
      const svg = sanitizeSvg(d.code);
      if (svg && /^<svg[\s>]/i.test(svg)) url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    } else if (d.path) url = `url("${d.path.replace(/"/g, "%22")}")`;
    if (!url) return "";
    const [v, h] = d.anchor === "center" ? ["middle", "center"] : d.anchor.split("-");
    const top = v === "top" ? "0%" : v === "middle" ? "50%" : "100%";
    const left = h === "left" ? "0%" : h === "center" ? "50%" : "100%";
    const tx = h === "left" ? "0%" : h === "center" ? "-50%" : "-100%";
    const ty = v === "top" ? "0%" : v === "middle" ? "-50%" : "-100%";
    const style = `left:calc(${left} + ${d.dx}px);top:calc(${top} + ${d.dy}px);transform:translate(${tx},${ty});` +
      `width:${d.width}px;height:${d.height}px;opacity:${d.opacity / 100};z-index:${d.layer === "below" ? 0 : 3};background-image:${url}`;
    return `<div class="sbe-hud-deco" data-deco="${i + 1}" style="${esc(style)}"></div>`;
  }).join("");
}
