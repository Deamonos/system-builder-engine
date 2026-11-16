/**
 * SBE — Étapes en phrases : les CONDITIONS sans formule
 *
 * Une condition se compose en phrases à trous :
 *   [quoi] [comparaison] [valeur]       « munitions » « plus grand que » « 0 »
 * avec « non » pour inverser, réunies en groupe « Toutes » (ET) ou « Au
 * moins une » (OU), un groupe dans le groupe au plus. Une case ƒ garde
 * une formule libre (un calcul qui ne tient pas en phrase).
 *
 * UNE SEULE SOURCE : la FORMULE. L'éditeur la relit (parse), l'affiche
 * en phrases, et la réécrit à chaque changement dans le champ d'origine
 * (masqué). Ce qui ne se lit pas en phrase devient une case ƒ : rien ne
 * se perd jamais. Mode avancé : le champ de formule, tel quel.
 *
 * Arbre : groupe { mode: "all"|"any", items: [...] } ;
 *         phrase { not, left, op, right } ; case ƒ { raw }.
 */

import { SYSTEM_ID } from "../helpers/constants.mjs";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (x) => foundry.utils.escapeHTML(String(x ?? ""));
export const COND_OPS = ["==", "!=", ">", ">=", "<", "<=", "true"];

/* ============================================================ */
/*  Lecture d'une formule                                        */
/* ============================================================ */

/** Découpe au premier niveau (hors parenthèses et chaînes) sur un séparateur. */
function splitTop(s, sep) {
  const out = [];
  let depth = 0, quote = "", start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) { if (c === "\\") i++; else if (c === quote) quote = ""; continue; }
    if (c === "\"" || c === "'" || c === "`") { quote = c; continue; }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (depth === 0 && s.startsWith(sep, i)) { out.push(s.slice(start, i)); i += sep.length - 1; start = i + 1; }
  }
  out.push(s.slice(start));
  return out.map(x => x.trim());
}

/** « ( … ) » qui entoure TOUTE l'expression ? */
function wrapped(s) {
  if (!s.startsWith("(") || !s.endsWith(")")) return false;
  let depth = 0, quote = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) { if (c === "\\") i++; else if (c === quote) quote = ""; continue; }
    if (c === "\"" || c === "'") { quote = c; continue; }
    if (c === "(") depth++;
    else if (c === ")") { depth--; if (depth === 0 && i < s.length - 1) return false; }
  }
  return true;
}
const unwrap = (s) => { let x = s.trim(); while (wrapped(x)) x = x.slice(1, -1).trim(); return x; };

/** Une phrase : « gauche op droite », « !x », « x ». */
function leafOf(s) {
  let x = unwrap(s);
  let not = false;
  if (/^!(?!=)/.test(x)) {
    const rest = unwrap(x.slice(1));
    if (!/(&&|\|\|)/.test(rest)) { not = true; x = rest; }
  }
  for (const op of [">=", "<=", "===", "!==", "==", "!=", ">", "<"]) {
    const parts = splitTop(x, op);
    if (parts.length !== 2 || !parts[0] || !parts[1]) continue;
    /* « a >= b » se découpe aussi sur « > » : on garde le plus long. */
    if ((op === ">" || op === "<") && parts[1].startsWith("=")) continue;
    if ((op === "==" || op === "!=") && (parts[1].startsWith("=") || /[<>!=]$/.test(parts[0]))) continue;
    return { not, left: parts[0], op: op.length === 3 ? op.slice(0, 2) : op, right: parts[1] };
  }
  /* Une valeur vraie / fausse (case, fonction). */
  if (x && !/(&&|\|\|)/.test(x)) return { not, left: x, op: "true", right: "" };
  return { raw: s.trim() };
}

/**
 * Formule → groupe. Deux niveaux au plus ; au-delà, case ƒ.
 * @param {number} depth 0 = groupe principal
 */
export function parseCond(formula, depth = 0) {
  const f = unwrap(String(formula ?? "").trim());
  if (!f) return { mode: "all", items: [] };
  const ors = splitTop(f, "||");
  const mode = ors.length > 1 ? "any" : "all";
  const parts = ors.length > 1 ? ors : splitTop(f, "&&");
  const items = parts.map(p => {
    const inner = unwrap(p);
    const sub = splitTop(inner, "||").length > 1 || splitTop(inner, "&&").length > 1;
    if (!sub) return leafOf(p);
    if (depth >= 1) return { raw: p };
    return parseCond(inner, depth + 1);
  });
  return { mode, items };
}

/* ============================================================ */
/*  Écriture                                                     */
/* ============================================================ */

/** Une valeur saisie : nombre, clé connue, formule ou texte (entre guillemets). */
function valueOut(v, known) {
  /* Inchangée : telle qu'elle était écrite. */
  if (v && typeof v === "object") return v.raw;
  const s = String(v ?? "").trim();
  if (!s) return "\"\"";
  if (/^-?\d+(\.\d+)?$/.test(s) || ["true", "false"].includes(s)) return s;
  if (/^["'`].*["'`]$/.test(s)) return s;
  /* Une clé, une variable, ou un calcul (opérateurs, parenthèses). */
  if (known.has(s) || /^(self|picked)_\w/.test(s) || /[()+\-*/<>=!&|?:]/.test(s)) return s;
  return JSON.stringify(s);
}

function leafOut(it, known) {
  if (it.raw !== undefined) return it.raw.trim() || "true";
  const left = String(it.left ?? "").trim();
  if (!left) return "";
  const body = it.op === "true" ? left : `${left} ${it.op} ${valueOut(it.right, known)}`;
  if (!it.not) return body;
  return /^[\w.$]+(\(.*\))?$/.test(body) ? `!${body}` : `!(${body})`;
}

/** Groupe → formule. */
export function writeCond(group, known = new Set(), nested = false) {
  const parts = (group.items ?? []).map(it => (it.items ? writeCond(it, known, true) : leafOut(it, known))).filter(Boolean);
  if (!parts.length) return "";
  const s = parts.join(group.mode === "any" ? " || " : " && ");
  return nested && parts.length > 1 ? `(${s})` : s;
}

/* ============================================================ */
/*  L'éditeur (posé sur un champ de formule)                     */
/* ============================================================ */

const opLabel = (op) => L(`SBE.Cond.Op.${{ "==": "eq", "!=": "ne", ">": "gt", ">=": "ge", "<": "lt", "<=": "le", "true": "true" }[op]}`);
/* Une valeur entre guillemets se montre sans eux. */
const shown = (v) => { const s = String(v ?? ""); return /^"(?:[^"\\]|\\.)*"$/.test(s) ? JSON.parse(s) : s; };

function leafHTML(it, list) {
  if (it.raw !== undefined) {
    return `<div class="sbe-cond-row is-raw" data-k="raw"><span class="sbe-cond-fx">ƒ</span>
      <input type="text" class="sbe-cond-raw" value="${esc(it.raw)}" list="${list}">
      <a class="sbe-cond-del" data-tooltip-text="${esc(L("SBE.Cond.Delete"))}"><i class="fa-solid fa-xmark"></i></a></div>`;
  }
  return `<div class="sbe-cond-row" data-k="leaf">
    <button type="button" class="sbe-cond-not ${it.not ? "is-on" : ""}" data-tooltip-text="${esc(L("SBE.Cond.NotHint"))}">${esc(L("SBE.Cond.Not"))}</button>
    <input type="text" class="sbe-cond-left" value="${esc(it.left)}" list="${list}" placeholder="${esc(L("SBE.Cond.LeftPh"))}">
    <select class="sbe-cond-op">${COND_OPS.map(o => `<option value="${o}" ${o === it.op ? "selected" : ""}>${esc(opLabel(o))}</option>`).join("")}</select>
    <input type="text" class="sbe-cond-right" value="${esc(shown(it.right))}" data-raw="${esc(it.right ?? "")}" list="${list}" placeholder="${esc(L("SBE.Cond.RightPh"))}" ${it.op === "true" ? "hidden" : ""}>
    <a class="sbe-cond-del" data-tooltip-text="${esc(L("SBE.Cond.Delete"))}"><i class="fa-solid fa-xmark"></i></a></div>`;
}

function groupHTML(g, list, depth) {
  const mode = g.mode === "any" ? "any" : "all";
  return `<div class="sbe-cond-group" data-mode="${mode}" data-depth="${depth}">
    <div class="sbe-cond-gh">
      <button type="button" class="sbe-cond-mode is-${mode}">${esc(L(`SBE.Cond.Mode.${mode}`))}</button>
      <span>${esc(L(`SBE.Cond.ModeTail.${mode}`))}</span>
      ${depth ? `<a class="sbe-cond-del" data-tooltip-text="${esc(L("SBE.Cond.Delete"))}"><i class="fa-solid fa-xmark"></i></a>` : ""}
    </div>
    <div class="sbe-cond-items">${(g.items ?? []).map(it => (it.items ? groupHTML(it, list, depth + 1) : leafHTML(it, list))).join("")}</div>
    <div class="sbe-cond-adds">
      <a class="sbe-cond-add" data-add="leaf"><i class="fa-solid fa-plus"></i> ${esc(L("SBE.Cond.AddLeaf"))}</a>
      ${depth ? "" : `<a class="sbe-cond-add" data-add="group"><i class="fa-solid fa-plus"></i> ${esc(L("SBE.Cond.AddGroup"))}</a>`}
      <a class="sbe-cond-add" data-add="raw"><i class="fa-solid fa-plus"></i> ${esc(L("SBE.Cond.AddRaw"))}</a>
    </div>
  </div>`;
}

/** La valeur d'une case : telle qu'écrite dans la formule si on n'y a pas touché. */
function rightOf(input) {
  const raw = input.dataset.raw ?? "";
  return raw && input.value === shown(raw) ? { raw } : input.value;
}

/** Relit l'éditeur (DOM) en groupe. */
function readGroup(el) {
  const items = [];
  for (const c of el.querySelector(":scope > .sbe-cond-items").children) {
    if (c.classList.contains("sbe-cond-group")) items.push(readGroup(c));
    else if (c.dataset.k === "raw") items.push({ raw: c.querySelector(".sbe-cond-raw").value });
    else items.push({
      not: c.querySelector(".sbe-cond-not").classList.contains("is-on"),
      left: c.querySelector(".sbe-cond-left").value,
      op: c.querySelector(".sbe-cond-op").value,
      right: rightOf(c.querySelector(".sbe-cond-right"))
    });
  }
  return { mode: el.dataset.mode === "any" ? "any" : "all", items };
}

/**
 * Pose l'éditeur en phrases sur un champ de formule (il reste la source :
 * il est réécrit à chaque changement, et masqué en mode de base).
 * @param {HTMLInputElement} input
 * @param {object} o
 * @param {string[]|Function} o.known  clés et variables (valeurs sans
 *        guillemets) ; une fonction est relue à chaque écriture (une
 *        réponse de « Demander » ajoutée entre-temps compte)
 * @param {string}   o.list   id de la liste de suggestions
 * @param {boolean}  o.advanced  mode avancé (le champ, tel quel)
 */
export function attachCondEditor(input, { known = [], list = "", advanced = false } = {}) {
  if (!input || input.dataset.sbeCond) return;
  input.dataset.sbeCond = "1";
  const box = document.createElement("div");
  box.className = "sbe-cond";
  const out = document.createElement("div");
  out.className = "sbe-cond-formula notes";
  input.after(box);
  box.after(out);
  const render = () => { box.innerHTML = groupHTML(parseCond(input.value), list, 0); };
  /* « est vrai » : pas de valeur à comparer. */
  box.addEventListener("change", (ev) => {
    if (ev.target.matches(".sbe-cond-op")) ev.target.closest(".sbe-cond-row").querySelector(".sbe-cond-right").hidden = ev.target.value === "true";
  });
  const write = () => {
    input.value = writeCond(readGroup(box.querySelector(".sbe-cond-group")), new Set(typeof known === "function" ? known() : known));
    out.textContent = input.value ? L("SBE.Cond.Formula", { f: input.value }) : "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const mode = (adv) => {
    input.hidden = !adv;
    box.hidden = adv;
    out.hidden = adv;
    if (!adv) { render(); out.textContent = input.value ? L("SBE.Cond.Formula", { f: input.value }) : ""; }
  };
  input.addEventListener("sbe-cond-mode", (ev) => mode(!!ev.detail?.advanced));
  box.addEventListener("input", write);
  box.addEventListener("change", write);
  box.addEventListener("click", (ev) => {
    const t = ev.target.closest("button, a");
    if (!t) return;
    ev.preventDefault();
    if (t.classList.contains("sbe-cond-not")) t.classList.toggle("is-on");
    else if (t.classList.contains("sbe-cond-mode")) {
      const g = t.closest(".sbe-cond-group");
      const m = g.dataset.mode === "any" ? "all" : "any";
      g.dataset.mode = m;
      t.className = `sbe-cond-mode is-${m}`;
      t.textContent = L(`SBE.Cond.Mode.${m}`);
      t.nextElementSibling.textContent = L(`SBE.Cond.ModeTail.${m}`);
    } else if (t.classList.contains("sbe-cond-del")) {
      (t.closest(".sbe-cond-row") ?? t.closest(".sbe-cond-group")).remove();
    } else if (t.classList.contains("sbe-cond-add")) {
      const g = t.closest(".sbe-cond-group");
      const depth = Number(g.dataset.depth) || 0;
      const html = t.dataset.add === "group" ? groupHTML({ mode: "all", items: [{ left: "", op: "==", right: "" }] }, list, depth + 1)
        : leafHTML(t.dataset.add === "raw" ? { raw: "" } : { left: "", op: "==", right: "" }, list);
      g.querySelector(":scope > .sbe-cond-items").insertAdjacentHTML("beforeend", html);
    } else return;
    /* Pas de nouveau rendu : une phrase encore vide doit rester là. */
    write();
  });
  mode(advanced);
}

/** Bascule tous les éditeurs d'une fenêtre (mode de base / avancé). */
export function setCondMode(root, advanced) {
  for (const i of root.querySelectorAll("[data-sbe-cond]")) i.dispatchEvent(new CustomEvent("sbe-cond-mode", { detail: { advanced } }));
}

/** Mode avancé (conditions en formules) : réglage de chacun. */
export const condAdvanced = () => !!game.settings.get(SYSTEM_ID, "stepsAdvanced");

export function initCondBuilder() {
  game.settings.register(SYSTEM_ID, "stepsAdvanced", { scope: "client", config: false, type: Boolean, default: false });
}
