/**
 * SBE — Tables de correspondance
 *
 * Une TABLE DE CORRESPONDANCE est un élément « table » ordinaire dont on a
 * coché l'option correspondante : ses lignes vivent dans le MODÈLE (colonnes
 * verrouillées), deux de ses colonnes servent de PLAGE (basse / haute), et
 * les formules peuvent l'interroger.
 *
 * Pourquoi réutiliser l'élément table plutôt que d'en créer un nouveau :
 * l'éditeur de lignes, les colonnes, les largeurs, le tri et le rendu
 * existent déjà. Une table de correspondance n'est qu'une table qu'on
 * consulte au lieu de la remplir.
 *
 * Trois fonctions sont injectées dans la portée des formules :
 *   table(clé; valeur; colonne [; exact [; défaut]])
 *   tableX(clé; valeur; colonneCherchée; colonneRendue [; défaut])
 *   tableList(clé; colonne [; séparateur])
 *
 * ZÉRO dépendance : lecture de l'arbre d'éléments, rien d'autre.
 */

import { walkElements } from "./element-renderer.mjs";

/** Noms occupés par les fonctions de table (refusés comme clés). */
export const LOOKUP_FUNCS = ["table", "tableX", "tableList"];

/** Un élément est-il une table de correspondance exploitable ? */
export function isLookupTable(el) {
  return el?.kind === "table" && !!el.config?.lookup;
}

/** Toutes les tables de correspondance d'un modèle, indexées par clé. */
function lookupIndex(elements) {
  const map = new Map();
  for (const el of walkElements(elements ?? [])) {
    if (isLookupTable(el) && el.key && !map.has(el.key)) map.set(el.key, el);
  }
  return map;
}

/** Colonne désignée par sa CLÉ, son LIBELLÉ, ou son NUMÉRO (1 = première). */
function findColumn(el, ref) {
  const cols = Array.isArray(el.config?.columns) ? el.config.columns : [];
  const r = String(ref ?? "").trim();
  if (!r) return null;
  const byKey = cols.find(c => c.key === r);
  if (byKey) return byKey;
  const byLabel = cols.find(c => String(c.label ?? "").trim() === r);
  if (byLabel) return byLabel;
  const n = Number(r);
  if (Number.isInteger(n) && n >= 1 && n <= cols.length) return cols[n - 1];
  return null;
}

/** Valeur brute d'une cellule de MODÈLE (les lignes appartiennent au modèle). */
function cellOf(row, col) {
  if (!col) return undefined;
  return row?.cells?.[col.key];
}

/** Les lignes d'une table, dans leur ordre de saisie. */
function rowsOf(el) {
  return Array.isArray(el.config?.rows) ? el.config.rows : [];
}

/** Bornes de plage d'une ligne. Colonnes désignées dans la config. */
function rangeOf(el, row) {
  const lowCol = findColumn(el, el.config?.lowKey);
  const highCol = findColumn(el, el.config?.highKey);
  const lo = Number(cellOf(row, lowCol));
  /* Plage haute non renseignée = même valeur que la plage basse : une
     table de correspondance peut lister des valeurs exactes. */
  const hiRaw = cellOf(row, highCol);
  const hi = (hiRaw === undefined || hiRaw === "" || highCol === null)
    ? lo : Number(hiRaw);
  return {
    lo: Number.isFinite(lo) ? lo : null,
    hi: Number.isFinite(hi) ? hi : null
  };
}

/**
 * Construit les fonctions de table pour un modèle donné.
 * @param {Array} elements  Arbre d'éléments du modèle.
 * @returns {object} { table, tableX, tableList }
 */
export function lookupFuncs(elements) {
  const index = lookupIndex(elements);

  /* Recherche par PLAGE. Hors plage, on retient la ligne la plus proche
     (première ou dernière) — sauf en mode exact, qui renvoie le défaut. */
  const table = (key, value, column, exact = false, fallback = "") => {
    const el = index.get(String(key ?? "").trim());
    if (!el) return fallback;
    const col = findColumn(el, column);
    if (!col) return fallback;
    const v = Number(value);
    if (!Number.isFinite(v)) return fallback;

    const rows = rowsOf(el)
      .map(r => ({ r, ...rangeOf(el, r) }))
      .filter(x => x.lo !== null)
      .sort((a, b) => a.lo - b.lo);
    if (!rows.length) return fallback;

    const hit = rows.find(x => v >= x.lo && v <= (x.hi ?? x.lo));
    if (hit) return cellOf(hit.r, col) ?? fallback;
    if (exact === true || exact === "true") return fallback;
    if (v < rows[0].lo) return cellOf(rows[0].r, col) ?? fallback;
    return cellOf(rows[rows.length - 1].r, col) ?? fallback;
  };

  /* Recherche par VALEUR EXACTE dans une colonne (comparaison textuelle,
     insensible à la casse et aux espaces de bord). */
  const tableX = (key, value, lookupColumn, returnColumn, fallback = "") => {
    const el = index.get(String(key ?? "").trim());
    if (!el) return fallback;
    const src = findColumn(el, lookupColumn);
    const dst = findColumn(el, returnColumn);
    if (!src || !dst) return fallback;
    const needle = String(value ?? "").trim().toLowerCase();
    const row = rowsOf(el).find(r =>
      String(cellOf(r, src) ?? "").trim().toLowerCase() === needle);
    return row ? (cellOf(row, dst) ?? fallback) : fallback;
  };

  /* Toutes les valeurs d'une colonne, séparées — utile pour alimenter
     une liste déroulante depuis une table. */
  const tableList = (key, column, sep = "|") => {
    const el = index.get(String(key ?? "").trim());
    if (!el) return "";
    const col = findColumn(el, column);
    if (!col) return "";
    return rowsOf(el)
      .map(r => cellOf(r, col))
      .filter(v => v !== undefined && v !== null && v !== "")
      .join(String(sep ?? "|"));
  };

  return { table, tableX, tableList };
}

/**
 * Ajoute les fonctions de table à une portée de formule.
 * Une CLÉ du modèle portant le même nom l'emporterait — c'est pourquoi
 * ces noms sont refusés à la validation (RESERVED_KEYS).
 */
export function withLookups(scope, elements) {
  const f = lookupFuncs(elements);
  for (const name of LOOKUP_FUNCS) {
    if (!(name in scope)) scope[name] = f[name];
  }
  return scope;
}

/* ============================================================ */
/*  CSV — import / export des lignes d'une table                 */
/* ============================================================ */

/** Découpe une ligne CSV en respectant les guillemets. */
function splitCsvLine(line, sep) {
  const out = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === sep) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

/** Séparateur le plus probable d'un texte CSV (point-virgule, virgule, tab). */
export function guessSeparator(text) {
  const first = String(text ?? "").split(/\r?\n/).find(l => l.trim()) ?? "";
  const counts = [[";", 0], [",", 0], ["\t", 0]];
  for (const c of counts) c[1] = first.split(c[0]).length - 1;
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ";";
}

/**
 * Lit un texte CSV.
 * @returns {{header: string[], rows: string[][]}}
 */
export function parseCsv(text, sep = null) {
  const s = sep || guessSeparator(text);
  const lines = String(text ?? "").split(/\r?\n/).filter(l => l.trim() !== "");
  if (!lines.length) return { header: [], rows: [] };
  const header = splitCsvLine(lines[0], s);
  const rows = lines.slice(1).map(l => splitCsvLine(l, s));
  return { header, rows };
}

/** Écrit un tableau en CSV (point-virgule : ouvert tel quel par les tableurs). */
export function toCsv(header, rows, sep = ";") {
  const cell = (v) => {
    const s = String(v ?? "");
    return (s.includes(sep) || s.includes('"') || s.includes("\n"))
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header, ...rows].map(r => r.map(cell).join(sep)).join("\r\n");
}
