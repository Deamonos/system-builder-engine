/**
 * SBE — Formulaire condensé (grille à 2 colonnes)
 *
 * Mise en page commune des fenêtres de réglages longues :
 *  - les champs sont rangés deux par ligne (une case large prend la ligne) ;
 *  - l'aide d'un champ est une bulle (icône « ? ») au lieu d'un paragraphe ;
 *  - un champ qui ne sert pas est masqué : `show` = « clé:v1,v2 », plusieurs
 *    conditions séparées par « ; » (toutes doivent être vraies).
 *
 * Une case vide d'un onglet « hérité » vaut la valeur héritée : la boîte
 * porte ces valeurs en JSON dans `data-base`.
 *
 * Les fenêtres écrites avant ce composant se condensent d'elles-mêmes :
 * une fenêtre qui porte la classe `sbe-condense` passe par condense() à
 * chaque rendu (initCondense) — ses champs se rangent deux par ligne, sans
 * réécrire son HTML ; ses explications passent toutes en « ? » (le
 * repliage est celui de managers/help/help-tips, qui reconnaît la classe).
 */

const escape = (x) => foundry.utils.escapeHTML(String(x ?? ""));

/**
 * Une case : libellé (et sa bulle d'aide), puis le champ.
 * @param label  libellé (déjà traduit)
 * @param inner  le champ (HTML)
 * @param o.hint aide (déjà traduite)
 * @param o.show condition d'affichage
 * @param o.check case à cocher en ligne (le champ avant le libellé)
 * @param o.wide prend toute la ligne
 * @param o.hidden masqué dès le rendu (fiches qui se redessinent à chaque changement)
 * @param o.cls classes en plus
 */
export function cfCell(label, inner, { hint = "", show = "", check = false, wide = false, hidden = false, cls: extra = "" } = {}) {
  const tip = cfTip(hint);
  const sh = `${show ? ` data-show="${escape(show)}"` : ""}${hidden ? " hidden" : ""}`;
  const cls = `sbe-cf-cell${check ? " is-check" : ""}${wide ? " is-wide" : ""}${extra ? ` ${extra}` : ""}`;
  return check
    ? `<label class="${cls}"${sh}>${inner} <span>${escape(label)}</span>${tip}</label>`
    : `<div class="${cls}"${sh}><label>${escape(label)}${tip}</label>${inner}</div>`;
}

/** La bulle d'aide « ? » (vide sans texte) : après un libellé ou un titre.
    Même « ? » que les explications repliées (managers/help/help-tips). */
export function cfTip(hint) {
  return hint ? ` <i class="fa-solid fa-circle-question sbe-help" data-tooltip-text="${escape(hint)}" aria-label="${escape(hint)}"></i>` : "";
}

/** Une grille de cases (les cases vides sont ignorées). */
export function cfGrid(cells, { show = "", hidden = false } = {}) {
  return `<div class="sbe-cf-grid"${show ? ` data-show="${escape(show)}"` : ""}${hidden ? " hidden" : ""}>${cells.filter(Boolean).join("")}</div>`;
}

/** Données « valeurs héritées » à poser sur la boîte. */
export function cfBase(values) {
  return `data-base="${escape(JSON.stringify(values ?? {}))}"`;
}

/**
 * Masque ce qui ne sert pas, à chaque changement.
 * @param root la boîte (ou un parent) ; les valeurs héritées sont lues
 *             sur elle et ses enfants `[data-base]`.
 */
export function wireCompactForm(root) {
  if (!root?.querySelectorAll) return;
  const base = {};
  for (const el of [root, ...root.querySelectorAll("[data-base]")]) {
    if (!el.dataset?.base) continue;
    try { Object.assign(base, JSON.parse(el.dataset.base)); } catch (_e) { /* ignoré */ }
  }
  const valueOf = (k) => {
    const el = root.querySelector(`[name="${k}"], [data-k="${k}"]`);
    if (!el) return "";
    if (el.type === "checkbox") return el.checked ? "1" : "0";
    let v = String(el.value ?? "");
    if (v === "") v = base[k] === true ? "1" : base[k] === false ? "0" : String(base[k] ?? "");
    return v;
  };
  const ok = (cond) => cond.split(";").every(c => {
    const [k, vals = ""] = c.split(":");
    return vals.split(",").includes(valueOf(k.trim()));
  });
  const apply = () => {
    for (const el of root.querySelectorAll("[data-show]")) el.hidden = !ok(el.dataset.show);
  };
  root.addEventListener("change", apply);
  apply();
}

/* ============================================================ */
/*  Condensation automatique (fenêtres « sbe-condense »)         */
/* ============================================================ */

/** Un champ : un groupe libellé + saisie, ou une case à cocher libellée. */
const FIELD_SEL = ".form-group, .sbe-cf-cell, [class$='-field'], [class*='-field ']";
/* Ce qui ne tient pas dans une demi-ligne. */
const WIDE_SEL = "textarea, table, fieldset, details, ul, ol, .sbe-cf-grid, .sbe-cf-auto, [data-cf-wide]";

const isField = (el) => el.matches?.(FIELD_SEL)
  || (el.tagName === "LABEL" && !!el.querySelector(":scope > input[type='checkbox']"));

/**
 * Condense une fenêtre déjà rendue (idempotent) : un conteneur qui aligne
 * au moins deux champs devient une grille à 2 colonnes (ce qui n'est pas
 * un champ, ou ce qui est large, prend toute la ligne).
 */
export function condense(root) {
  if (!root?.querySelectorAll) return;
  const boxes = new Set();
  for (const f of root.querySelectorAll(FIELD_SEL + ", label")) {
    if (!isField(f)) continue;
    const box = f.parentElement;
    if (!box || box.matches(".sbe-cf-grid, .sbe-cf-cell, .form-group, label, [data-cf-off]") || box.closest("[data-cf-off]")) continue;
    boxes.add(box);
  }
  for (const box of boxes) {
    const kids = [...box.children].filter(isField);
    if (kids.length < 2) continue;
    for (const k of kids) {
      k.classList.add("sbe-cf-field");
      k.classList.toggle("is-wide", !!k.querySelector(WIDE_SEL) || k.querySelectorAll("input, select").length > 3);
      if (k.tagName === "LABEL") k.classList.add("is-check");
    }
    /* Un dépliant ne se met pas en grille : ses champs qui se suivent sont
       regroupés dans une grille à part. */
    if (box.tagName !== "DETAILS") { box.classList.add("sbe-cf-auto"); continue; }
    let run = [];
    const flush = () => {
      if (run.length >= 2) {
        const grid = document.createElement("div");
        grid.className = "sbe-cf-auto";
        run[0].before(grid);
        grid.append(...run);
      }
      run = [];
    };
    for (const k of [...box.children]) (isField(k) ? run.push(k) : flush());
    flush();
  }
}

/** Branche la condensation sur les fenêtres qui la demandent. */
export function initCondense() {
  Hooks.on("renderApplicationV2", (app) => {
    const el = app?.element;
    if (!el?.classList?.contains("sbe-condense")) return;
    condense(el.querySelector(".window-content") ?? el);
  });
}
