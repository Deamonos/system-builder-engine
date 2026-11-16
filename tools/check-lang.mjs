#!/usr/bin/env node
/**
 * SBE — Vérificateur de traductions
 *
 * Garde-fou à lancer avant toute livraison / ajout de langue :
 *   node tools/check-lang.mjs
 *
 * Contrôles :
 *  1. CLÉS MANQUANTES  — une langue n'a pas une clé que la référence a ;
 *  2. CLÉS ORPHELINES  — une langue a une clé que la référence n'a plus ;
 *  3. CLÉS FANTÔMES    — le CODE appelle une clé qui n'existe nulle part
 *                        (c'est elle qui s'affiche en brut à l'écran) ;
 *     3b. FAMILLES       — clé fabriquée à l'exécution (« SBE.Steps.Hint. »
 *                        + le type d'étape) : chaque valeur possible, lue
 *                        dans la liste du code (FAMILIES ci-dessous), doit
 *                        avoir sa traduction ;
 *  4. GABARITS         — {variable} présents d'un côté, absents de l'autre ;
 *  5. NON TRADUIT      — valeur identique à la référence (simple signalement).
 *
 * Référence = lang/fr.json (langue d'écriture du projet).
 * Sortie : code 1 si au moins un problème BLOQUANT (1 à 4).
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LANG_DIR = join(ROOT, "lang");
const REF = "fr.json";

/* ------------------------------------------------------------------ */
/*  Outils                                                             */
/* ------------------------------------------------------------------ */

/** Aplatit un objet de langue en { "SBE.A.B": "texte" }. */
function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj ?? {})) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, path, out);
    else out[path] = String(v);
  }
  return out;
}

/** Gabarits {xxx} d'une chaîne (gabarits FOUNDRY seulement : les
    doubles accolades {{clé}} sont les tokens d'interpolation SBE, pas
    des variables de traduction — on les retire d'abord). */
function slots(str) {
  const clean = String(str).replace(/\{\{[^}]*\}\}/g, "");
  return new Set([...clean.matchAll(/\{(\w+)\}/g)].map(m => m[1]));
}

/** Tous les fichiers d'un dossier, récursivement, filtrés par extension. */
function walk(dir, exts, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, exts, out);
    else if (exts.some(e => name.endsWith(e))) out.push(full);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Lecture des langues                                                */
/* ------------------------------------------------------------------ */

const files = readdirSync(LANG_DIR).filter(f => f.endsWith(".json")).sort();
if (!files.includes(REF)) {
  console.error(`✗ Référence introuvable : lang/${REF}`);
  process.exit(1);
}

const langs = {};
for (const f of files) {
  try {
    langs[f] = flatten(JSON.parse(readFileSync(join(LANG_DIR, f), "utf-8")));
  } catch (err) {
    console.error(`✗ ${f} : JSON invalide — ${err.message}`);
    process.exit(1);
  }
}

const ref = langs[REF];
const refKeys = Object.keys(ref);
let blocking = 0;

console.log(`SBE — vérification des traductions`);
console.log(`Référence : ${REF} (${refKeys.length} clés)`);
console.log(`Langues   : ${files.join(", ")}\n`);

/* ------------------------------------------------------------------ */
/*  1-2. Manquantes / orphelines + 4-5. Gabarits & non traduit         */
/* ------------------------------------------------------------------ */

for (const f of files) {
  if (f === REF) continue;
  const cur = langs[f];
  const curKeys = new Set(Object.keys(cur));

  const missing = refKeys.filter(k => !curKeys.has(k));
  const orphan = [...curKeys].filter(k => !(k in ref));
  const badSlots = [];
  const same = [];

  for (const k of refKeys) {
    if (!curKeys.has(k)) continue;
    const a = slots(ref[k]), b = slots(cur[k]);
    if (a.size !== b.size || [...a].some(x => !b.has(x))) {
      badSlots.push(`${k}  (${REF}: {${[...a].join("} {")}}  ${f}: {${[...b].join("} {")}})`);
    }
    if (ref[k] === cur[k] && ref[k].length > 3) same.push(k);
  }

  const ok = !missing.length && !orphan.length && !badSlots.length;
  console.log(`── ${f} ${ok ? "✓ complet" : ""}`);
  if (missing.length) {
    blocking++;
    console.log(`   ✗ ${missing.length} clé(s) MANQUANTE(S) :`);
    missing.forEach(k => console.log(`       ${k}  →  "${ref[k].slice(0, 60)}"`));
  }
  if (orphan.length) {
    blocking++;
    console.log(`   ✗ ${orphan.length} clé(s) ORPHELINE(S) (absente(s) de ${REF}) :`);
    orphan.forEach(k => console.log(`       ${k}`));
  }
  if (badSlots.length) {
    blocking++;
    console.log(`   ✗ ${badSlots.length} GABARIT(S) incohérent(s) :`);
    badSlots.forEach(l => console.log(`       ${l}`));
  }
  if (same.length) {
    console.log(`   ⚠ ${same.length} valeur(s) identique(s) à ${REF} (à traduire ?) :`);
    same.slice(0, 15).forEach(k => console.log(`       ${k}  =  "${ref[k].slice(0, 50)}"`));
    if (same.length > 15) console.log(`       … et ${same.length - 15} autre(s)`);
  }
  console.log("");
}

/* ------------------------------------------------------------------ */
/*  3. Clés appelées par le code mais inexistantes                      */
/* ------------------------------------------------------------------ */

const sources = [
  ...walk(join(ROOT, "module"), [".mjs"]),
  ...walk(join(ROOT, "templates"), [".hbs"])
];

const used = new Map();     /* clé → fichiers */
const dynamic = new Set();  /* préfixes construits à la volée */

for (const file of sources) {
  const text = readFileSync(file, "utf-8");
  for (const m of text.matchAll(/["'`](SBE\.[A-Za-z0-9_.]*)["'`]/g)) {
    const key = m[1];
    /* Préfixe complété à l'exécution (« SBE.Template. » + variable,
       « …ChartVar_ » + type) → non vérifiable statiquement. */
    if (/[._]$/.test(key)) { dynamic.add(key); continue; }
    if (!used.has(key)) used.set(key, new Set());
    used.get(key).add(relative(ROOT, file));
  }
}

/* Une clé qui est un PRÉFIXE de clés existantes (LOCALIZATION_PREFIXES
   des modèles de données) n'est pas fantôme. */
const isPrefix = (k) => refKeys.some(r => r.startsWith(`${k}.`));
const ghosts = [...used.keys()].filter(k => !(k in ref) && !isPrefix(k)).sort();
console.log(`── Clés appelées par le code : ${used.size}`);
if (ghosts.length) {
  blocking++;
  console.log(`   ✗ ${ghosts.length} clé(s) FANTÔME(S) (absente(s) de ${REF} → affichée(s) en brut) :`);
  ghosts.forEach(k => console.log(`       ${k}\n           ← ${[...used.get(k)].join(", ")}`));
} else {
  console.log(`   ✓ toutes présentes dans ${REF}`);
}
if (dynamic.size) {
  console.log(`   ℹ ${dynamic.size} préfixe(s) construit(s) dynamiquement (non vérifiables) :`);
  [...dynamic].sort().forEach(k => console.log(`       ${k}…`));
}

/* ------------------------------------------------------------------ */
/*  3b. Familles de clés fabriquées à l'exécution                       */
/* ------------------------------------------------------------------ */

/*
 * [préfixe, suffixe, liste(s) du code]. Une liste = le nom d'une
 * constante exportée d'un module : tableau (ses chaînes), objet (ses
 * clés) ou « NOM.sous » (le tableau « sous » d'un objet). « NOM.* » :
 * une famille par clé de l'objet, le préfixe contenant « * ».
 * À compléter quand le code fabrique une nouvelle famille de clés.
 */
const FAMILIES = [
  ["SBE.Steps.Type.", "", ["STEP_TYPES"]],
  ["SBE.Steps.Hint.", "", ["STEP_TYPES"]],
  ["SBE.Steps.FxAction.", "", ["EFFECT_ACTIONS", "RULE_ACTIONS", "ZONE_ACTIONS"]],
  ["SBE.ItemFx.Outcome.", "", ["RULE_OUTCOMES", "ZONE_OUTCOMES"]],
  ["SBE.Scene.Act.", "", ["SCENE_ACTIONS"]],
  ["SBE.Template.Kind.", "", ["ELEMENT_KIND_LIST"]],
  ["SBE.Theme.Part.", "", ["THEME_PARTS"]],
  ["SBE.Media.Place.", "", ["ANIM_PLACES"]],
  ["SBE.Effects.Unit.", "", ["UNITS"]],
  ["SBE.Effects.Mode.", "", ["CONTRIB_MODES"]],
  ["SBE.Looks.Kind.", "", ["RULE_KINDS"]],
  ["SBE.AtkOpt.Type_", "", ["OPTION_TYPES"]],
  ["SBE.PZone.Kind.", "", ["ZONE_SHAPES"]],
  ["SBE.PZone.Pos.", "", ["ZONE_POSITIONS"]],
  ["SBE.PZone.Touch_", "", ["TOUCH_MODES"]],
  ["SBE.Inv.CardPlace_", "", ["CARD_PLACES"]],
  ["SBE.Template.NumBonusTone_", "", ["BONUS_TONES"]],
  ["SBE.PZone.WhenCombat.", "", ["ZONE_WHEN"]],
  ["SBE.PZone.WhenCalm.", "", ["ZONE_WHEN"]],
  ["SBE.PZone.Weaker_", "", ["ZONE_WEAKER"]],
  ["SBE.PZone.Tie_", "", ["ZONE_TIE"]],
  ["SBE.PZone.Overlap_", "", ["ZONE_OVERLAP"]],
  ["SBE.PZone.Repeat_", "", ["ZONE_REPEAT"]],
  ["SBE.PZone.MergePower_", "", ["ZONE_MERGE_POWER"]],
  ["SBE.PZone.MergeTime_", "", ["ZONE_MERGE_TIME"]],
  ["SBE.PZone.MergeLook_", "", ["ZONE_MERGE_LOOK"]],
  ["SBE.PZone.Announce_", "", ["ZONE_ANNOUNCE"]],
  ["SBE.PZone.TraceSize_", "", ["TRACE_SIZES"]],
  ["SBE.PZone.TraceDur_", "", ["TRACE_DURATIONS"]],
  ["SBE.Prop.*_", "", ["TRAP_LISTS.*"]],
  ["SBE.Cal.SndMode_", "", ["SOUND_MODES"]],
  ["SBE.Cal.SndDist_", "", ["SOUND_DISTANCES"]],
  ["SBE.Cal.Snd_", "", ["SOUND_LIBRARY"]],
  ["SBE.Steps.Cal.TimeAct.", "", ["TIME_ACTIONS"]],
  ["SBE.Steps.Cal.Unit.", "", ["TIME_UNITS"]],
  ["SBE.Steps.Cal.PartOpt.", "", ["TIME_PARTS"]],
  ["SBE.Steps.Cal.ModeOpt.", "", ["IMPOSE_MODES"]]
];

/** Texte entre crochets / accolades équilibrés, à partir de `i`. */
function balanced(text, i) {
  const open = text[i], close = open === "[" ? "]" : "}";
  let depth = 0;
  for (let j = i; j < text.length; j++) {
    if (text[j] === open) depth++;
    else if (text[j] === close && --depth === 0) return text.slice(i, j + 1);
  }
  return "";
}
const stringsOf = (src) => [...src.matchAll(/["']([^"'\n]+)["']/g)].map(m => m[1]);
/** Clés de premier niveau d'un objet littéral. */
function keysOf(src) {
  const out = [];
  let depth = 0;
  for (const m of src.matchAll(/[{}[\]]|(?:^|[,{\s])([A-Za-z_]\w*)\s*:/g)) {
    if (m[0] === "{" || m[0] === "[") { depth++; continue; }
    if (m[0] === "}" || m[0] === "]") { depth--; continue; }
    /* Le motif a pu avaler l'accolade ouvrante. */
    if (m[0].startsWith("{")) depth++;
    if (depth === 1 && m[1]) out.push(m[1]);
  }
  return out;
}
/* Les constantes exportées du code : NOM → texte littéral. */
const consts = new Map();
for (const file of sources.filter(f => f.endsWith(".mjs"))) {
  const text = readFileSync(file, "utf-8");
  for (const m of text.matchAll(/export const ([A-Z_]+)\s*=\s*(?:Object\.freeze\()?\s*([[{])/g)) {
    consts.set(m[1], balanced(text, m.index + m[0].length - 1));
  }
}
/** Valeurs d'une liste : tableau → ses chaînes ; objet → ses clés. */
function valuesOf(name) {
  const [base, sub] = name.split(".");
  const src = consts.get(base);
  if (!src) return null;
  if (!sub) return src.startsWith("[") ? stringsOf(src) : keysOf(src);
  const m = src.match(new RegExp(`(?:^|[,{\\s])${sub}\\s*:\\s*\\[`));
  return m ? stringsOf(balanced(src, m.index + m[0].length - 1)) : null;
}
const famMissing = [];
const famBroken = [];
for (const [prefix, suffix, lists] of FAMILIES) {
  /* « NOM.* » : une famille par clé de l'objet. */
  const expanded = lists.flatMap(l => (l.endsWith(".*")
    ? (keysOf(consts.get(l.slice(0, -2)) ?? "")).map(k => [prefix.replace("*", k), `${l.slice(0, -2)}.${k}`])
    : [[prefix, l]]));
  for (const [pre, list] of expanded) {
    const vals = valuesOf(list);
    if (!vals?.length) { famBroken.push(`${pre}…  ← liste ${list} introuvable`); continue; }
    for (const v of new Set(vals)) {
      const key = `${pre}${v}${suffix}`;
      if (!(key in ref)) famMissing.push(`${key}  ← ${list}`);
    }
  }
}
console.log(`\n── Familles de clés fabriquées : ${FAMILIES.length}`);
if (famMissing.length || famBroken.length) {
  blocking++;
  if (famMissing.length) {
    console.log(`   ✗ ${famMissing.length} clé(s) MANQUANTE(S) dans une famille (affichée(s) en brut) :`);
    famMissing.forEach(k => console.log(`       ${k}`));
  }
  if (famBroken.length) {
    console.log(`   ✗ ${famBroken.length} famille(s) dont la liste est introuvable (FAMILIES à mettre à jour) :`);
    famBroken.forEach(k => console.log(`       ${k}`));
  }
} else {
  console.log(`   ✓ toutes complètes`);
}

/* Clés définies mais jamais appelées : simple information (beaucoup sont
   utilisées via des préfixes dynamiques). */
const neverUsed = refKeys.filter(k =>
  !used.has(k) && ![...dynamic].some(d => k.startsWith(d)));
if (neverUsed.length) {
  console.log(`\n   ⚠ ${neverUsed.length} clé(s) définie(s) mais jamais appelée(s) directement :`);
  neverUsed.slice(0, 20).forEach(k => console.log(`       ${k}`));
  if (neverUsed.length > 20) console.log(`       … et ${neverUsed.length - 20} autre(s)`);
}

/* ------------------------------------------------------------------ */

console.log("");
if (blocking) {
  console.log(`✗ ${blocking} problème(s) bloquant(s) — à corriger avant livraison.`);
  process.exit(1);
}
console.log("✓ Traductions cohérentes.");
