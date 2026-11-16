/**
 * SBE — PIÈGES : réglages
 *
 * Un piège est un OBJET DE SCÈNE : ses réglages s'ajoutent à ceux des
 * objets de scène (même héritage : modèle d'atelier → objet du monde →
 * exemplaire). Tous commencent par « tr ».
 *
 *  trOn        c'est un piège
 *  trZone      zone de déclenchement : self (la place de l'objet),
 *              radius (rayon trR autour), rect (trW × trH), circle
 *              (cercle ou cône : rayon trR, angle trArc)
 *  trPlace     le poseur place la zone (sinon : centrée sur l'objet)
 *  trResize    le poseur règle sa taille à la pose
 *  trWhen      stop (s'arrête dedans), pass (y passe), both
 *  trWho       players / all ; trAllies : épargne les alliés du poseur
 *  trCombat    seulement en combat
 *  trHidden    caché : MJ, poseur, et ceux qui l'ont repéré
 *  trDetKey / trDetDc / trDetRange   détection passive (clé du jet du
 *              personnage, difficulté en formule lue sur le piège, cases)
 *  trLast      dernière chance en entrant (jet de détection)
 *  trAvoid     un personnage qui l'a repéré l'évite
 *  trDodgeKey / trDodgeDc   esquive ; trDodgeSeen : seulement si repéré ;
 *              trDodgeIf : formule lue sur le piège (vide = toujours)
 *  trDodgeAct  back (il recule) / button (bouton trDodgeBtn)
 *  trBack      recul : cell (la case d'avant), start (début du
 *              déplacement), none
 *  trBtn       le bouton qui fait l'effet (cible : le déclencheur)
 *  trCenter    centre de la zone d'effet : trap (le piège) / victim
 *  trDisarmKey / trDisarmDc   jet pour désamorcer (clé du personnage,
 *              difficulté en formule lue sur le piège ; vide = sans jet)
 *  trAfter     once (disparaît), charges (trCharges), auto (réarmé),
 *              manual (désarmé jusqu'à ce qu'on le réarme)
 *  trReveal    révélé aux personnages à N cases après déclenchement
 */

import { cfCell, cfGrid } from "../../helpers/compact-form.mjs";

export const TRAP_DEFAULTS = {
  trOn: false, trZone: "self", trW: 1, trH: 1, trR: 1, trArc: 360, trPlace: true, trResize: false,
  trWhen: "both", trWho: "all", trAllies: false, trCombat: false,
  trHidden: true, trDetKey: "", trDetDc: "", trDetRange: 2, trLast: true, trAvoid: true,
  trDodgeKey: "", trDodgeDc: "", trDodgeSeen: true, trDodgeIf: "", trDodgeAct: "back", trDodgeBtn: "",
  trBack: "cell", trBtn: "", trCenter: "trap", trAfter: "once", trCharges: 1, trReveal: 3,
  trDisarmKey: "", trDisarmDc: ""
};

export const TRAP_LISTS = {
  trZone: ["self", "radius", "rect", "circle"],
  trWhen: ["stop", "pass", "both"],
  trWho: ["players", "all"],
  trDodgeAct: ["back", "button"],
  trBack: ["cell", "start", "none"],
  trCenter: ["trap", "victim"],
  trAfter: ["once", "charges", "auto", "manual"]
};

const num = (v, d, min, max = Infinity) => {
  const n = Number(v);
  return Number.isFinite(n) && String(v ?? "").trim() !== "" ? Math.min(max, Math.max(min, n)) : d;
};
const pick = (v, k) => (TRAP_LISTS[k].includes(v) ? v : TRAP_DEFAULTS[k]);
const yes = (v, k) => (v === undefined || v === null || v === "" ? TRAP_DEFAULTS[k] : !!v);
const str = (v) => String(v ?? "").trim();

export function cleanTrap(c = {}) {
  return {
    trOn: yes(c.trOn, "trOn"),
    trZone: pick(c.trZone, "trZone"),
    trW: num(c.trW, TRAP_DEFAULTS.trW, 0.25, 100),
    trH: num(c.trH, TRAP_DEFAULTS.trH, 0.25, 100),
    trR: num(c.trR, TRAP_DEFAULTS.trR, 0.25, 100),
    trArc: num(c.trArc, TRAP_DEFAULTS.trArc, 1, 360),
    trPlace: yes(c.trPlace, "trPlace"),
    trResize: yes(c.trResize, "trResize"),
    trWhen: pick(c.trWhen, "trWhen"),
    trWho: pick(c.trWho, "trWho"),
    trAllies: yes(c.trAllies, "trAllies"),
    trCombat: yes(c.trCombat, "trCombat"),
    trHidden: yes(c.trHidden, "trHidden"),
    trDetKey: str(c.trDetKey),
    trDetDc: str(c.trDetDc),
    trDetRange: num(c.trDetRange, TRAP_DEFAULTS.trDetRange, 0, 100),
    trLast: yes(c.trLast, "trLast"),
    trAvoid: yes(c.trAvoid, "trAvoid"),
    trDodgeKey: str(c.trDodgeKey),
    trDodgeDc: str(c.trDodgeDc),
    trDodgeSeen: yes(c.trDodgeSeen, "trDodgeSeen"),
    trDodgeIf: str(c.trDodgeIf),
    trDodgeAct: pick(c.trDodgeAct, "trDodgeAct"),
    trDodgeBtn: str(c.trDodgeBtn),
    trBack: pick(c.trBack, "trBack"),
    trBtn: str(c.trBtn),
    trCenter: pick(c.trCenter, "trCenter"),
    trAfter: pick(c.trAfter, "trAfter"),
    trCharges: Math.round(num(c.trCharges, TRAP_DEFAULTS.trCharges, 1, 999)),
    trReveal: num(c.trReveal, TRAP_DEFAULTS.trReveal, 0, 100),
    trDisarmKey: str(c.trDisarmKey),
    trDisarmDc: str(c.trDisarmDc)
  };
}

/* ============================================================ */
/*  Formulaires (une seule liste de champs pour les deux)        */
/* ============================================================ */

/** Clés à jet de dés des modèles de personnage (détection, esquive). */
export function characterRollKeys() {
  const out = new Map();
  const walk = (els) => {
    for (const e of els ?? []) {
      if (e?.key && e.config?.roll?.on && !out.has(e.key)) out.set(e.key, e.label || e.key);
      walk(e?.children);
      for (const col of e?.cols ?? []) walk(col);
    }
  };
  for (const t of game.actors?.filter(a => a.type === "template") ?? []) walk(t.system?.elements);
  return [...out.entries()].map(([key, label]) => ({ key, label }));
}

const rollKeysList = (esc) => `<datalist id="sbe-trap-rollkeys">${characterRollKeys()
  .map(k => `<option value="${esc(k.key)}">${esc(k.label)}</option>`).join("")}</datalist>`;

/**
 * La mise en page : des sections de champs, deux par ligne.
 * [clé, sorte, pas, condition d'affichage « clé:valeurs »].
 */
const SECTIONS = [
  ["Zone", [["trZone", "sel"], ["trR", "num", 0.5, "trZone:radius,circle"], ["trW", "num", 0.5, "trZone:rect"],
    ["trH", "num", 0.5, "trZone:rect"], ["trArc", "num", 5, "trZone:circle"],
    ["trPlace", "bool", 0, "trZone:rect,circle"], ["trResize", "bool", 0, "trZone:rect,circle"]]],
  ["When", [["trWhen", "sel"], ["trWho", "sel"], ["trAllies", "bool"], ["trCombat", "bool"]]],
  ["Detect", [["trHidden", "bool"], ["trDetKey", "key", 0, "trHidden:1"], ["trDetDc", "text", 0, "trHidden:1"],
    ["trDetRange", "num", 0.5, "trHidden:1"], ["trLast", "bool", 0, "trHidden:1"], ["trAvoid", "bool", 0, "trHidden:1"]]],
  ["Dodge", [["trDodgeKey", "key"], ["trDodgeDc", "text"], ["trDodgeIf", "text"], ["trDodgeSeen", "bool"],
    ["trDodgeAct", "sel"], ["trDodgeBtn", "btn", 0, "trDodgeAct:button"], ["trBack", "sel"]]],
  ["Effect", [["trBtn", "btn"], ["trCenter", "sel"], ["trAfter", "sel"], ["trCharges", "num", 1, "trAfter:charges"], ["trReveal", "num", 0.5]]],
  ["Handle", [["trDisarmKey", "key"], ["trDisarmDc", "text"]]]
];
const FIELDS = [["trOn", "bool"], ...SECTIONS.flatMap(([, list]) => list)];

/** Une case : libellé de la clé, aide en bulle si elle existe. */
function cell(k, inner, show, L, inline = false) {
  const hintKey = `SBE.Trap.${k}Hint`;
  return cfCell(L(`SBE.Trap.${k}`), inner, { hint: game.i18n.has(hintKey) ? L(hintKey) : "", show, check: inline });
}

/** Les sections, avec une fabrique de champ par sorte. */
function layout(make, L, esc, inlineBools) {
  return SECTIONS.map(([h, list]) => `<div class="sbe-cf-sec" data-show="trOn:1">
    <h4 class="sbe-cf-h">${esc(L(`SBE.Trap.H.${h}`))}</h4>
    ${cfGrid(list.map(([k, kind, step, show]) => cell(k, make(k, kind, step), show, L, inlineBools && kind === "bool")))}
  </div>`).join("");
}

/**
 * Le groupe « Piège » de la fenêtre des réglages du modèle (roue).
 * @param c       réglages effectifs
 * @param btns    [{key, label}] boutons du modèle
 * @param L, esc  traduction, échappement
 */
export function trapDialogHTML(c, btns, L, esc) {
  const make = (k, kind, step) => {
    if (kind === "bool") return `<input type="checkbox" name="${k}" ${c[k] ? "checked" : ""}>`;
    if (kind === "sel") return `<select name="${k}">${TRAP_LISTS[k].map(v => `<option value="${v}" ${c[k] === v ? "selected" : ""}>${esc(L(`SBE.Prop.${k}_${v}`))}</option>`).join("")}</select>`;
    if (kind === "btn") return `<select name="${k}"><option value="">—</option>${btns.map(b => `<option value="${esc(b.key)}" ${c[k] === b.key ? "selected" : ""}>${esc(b.label || b.key)}</option>`).join("")}</select>`;
    if (kind === "num") return `<input type="number" name="${k}" value="${c[k]}" min="0" step="${step || 1}">`;
    return kind === "key"
      ? `<input type="text" name="${k}" value="${esc(c[k])}" list="sbe-trap-rollkeys" placeholder="${esc(L("SBE.Trap.KeyPh"))}">`
      : `<input type="text" name="${k}" value="${esc(c[k])}" placeholder="${esc(L("SBE.Trap.FormulaPh"))}">`;
  };
  return `<fieldset class="sbe-prop-trap"><legend>${esc(L("SBE.Trap.Group"))}</legend>
    ${cfGrid([cell("trOn", make("trOn", "bool"), "", L, true)])}
    ${layout(make, L, esc, true)}${rollKeysList(esc)}</fieldset>`;
}

/** Relit le groupe « Piège » de la fenêtre. */
export function readTrapDialog(root) {
  const out = {};
  for (const [k, kind] of FIELDS) {
    const el = root.querySelector(`[name="${k}"]`);
    if (!el) continue;
    out[k] = kind === "bool" ? !!el.checked : kind === "num" ? Number(el.value) : String(el.value ?? "").trim();
  }
  return cleanTrap(out);
}

/**
 * Le groupe « Piège » de l'onglet Scène (champs vides = hérités).
 * @param h { yn, sel, num, text } — les aides de l'onglet
 * @param base  les valeurs héritées (placeholders, affichage)
 */
export function trapTabHTML(h, base, L, esc) {
  const make = (k, kind, step) => kind === "bool" ? h.yn(k)
    : kind === "sel" ? h.sel(k, TRAP_LISTS[k])
      : kind === "num" ? h.num(k, step || 1, 0)
        : kind === "btn" ? h.text(k, "sbe-sc-btns", base[k] || "—")
          : kind === "key" ? h.text(k, "sbe-trap-rollkeys", base[k] || L("SBE.Trap.KeyPh"))
            : h.text(k, "", base[k] || L("SBE.Trap.FormulaPh"));
  return `<fieldset class="sbe-prop-trap"><legend>${esc(L("SBE.Trap.Group"))}</legend>
    ${cfGrid([cell("trOn", make("trOn", "bool"), "", L)])}
    ${layout(make, L, esc, false)}${rollKeysList(esc)}</fieldset>`;
}
