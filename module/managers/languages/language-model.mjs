/**
 * SBE — LANGUES DES PERSONNAGES : les données
 *
 * Le MJ déclare les langues de son monde (réglage `languages`). Un
 * passage d'un texte enrichi (journal, description, note) est marqué
 * « écrit en X » : <span class="sbe-lang" data-sbe-lang="x"
 * data-sbe-lang-id="…">. Chacun le lit selon la MAÎTRISE de son
 * personnage — une formule du MJ lue sur la fiche (0 à 100 %) : à 40 %,
 * 40 % des mots se lisent, toujours les mêmes pour ce personnage.
 *
 * Une langue :
 *   { id, name, color, mode: letters|symbols|blocks, alphabet, font,
 *     key (la CLÉ de la langue : un composant de même clé sur la fiche
 *          l'accorde — nombre = %, case cochée = 100 ; une formule
 *          est acceptée aussi), showName, chat,
 *     decipher: { on, key, difficulty (formule), once } }
 *
 * Passages déchiffrés : `flags.sbe.langRead` du personnage (ids),
 * essais ratés (« une seule fois ») : `flags.sbe.langTried`.
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { evalExpression } from "../../builder/formula-engine.mjs";
import { docScope } from "../../builder/doc-context.mjs";

export const LANG_SETTING = "languages";
export const LANG_MODES = ["letters", "symbols", "blocks"];
export const READ_FLAG = "langRead";
export const TRIED_FLAG = "langTried";

const str = (x) => String(x ?? "").trim();

/** Une langue propre (valeurs par défaut comprises). */
export function cleanLanguage(l = {}) {
  const d = l.decipher ?? {};
  return {
    id: str(l.id) || foundry.utils.randomID(8),
    name: str(l.name),
    color: /^#[0-9a-f]{6}$/i.test(str(l.color)) ? str(l.color) : "#8a6d3b",
    mode: LANG_MODES.includes(l.mode) ? l.mode : "letters",
    alphabet: String(l.alphabet ?? ""),
    font: str(l.font),
    key: str(l.key ?? l.mastery),
    showName: l.showName !== false,
    chat: !!l.chat,
    decipher: { on: !!d.on, key: str(d.key), difficulty: str(d.difficulty), once: !!d.once }
  };
}

/** Une clé tirée d'un nom (« Haut elfique » → « haut_elfique »). */
export function keyFromName(name) {
  return String(name ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(\d)/, "_$1");
}

/** Toutes les langues du monde. */
export function languages() {
  const raw = game.settings.get(SYSTEM_ID, LANG_SETTING);
  return (Array.isArray(raw?.list) ? raw.list : []).map(cleanLanguage);
}

export function languageById(id) {
  return languages().find(l => l.id === id) ?? null;
}

export function saveLanguages(list) {
  return game.settings.set(SYSTEM_ID, LANG_SETTING, { list: list.map(cleanLanguage) });
}

/**
 * Maîtrise d'un personnage (0 à 100). Formule vide ou illisible : 0.
 * Vrai = 100, faux = 0 (une case « parle_elfique » suffit).
 */
export function masteryOf(actor, lang) {
  if (!actor || !lang?.key) return 0;
  const r = evalExpression(lang.key, docScope(actor));
  if (r === true) return 100;
  const n = Number(r);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
}

/** Ids des passages déjà déchiffrés (ou tentés) par ce personnage. */
export function passagesOf(actor, flag = READ_FLAG) {
  const v = actor?.getFlag?.(SYSTEM_ID, flag);
  return new Set(Array.isArray(v) ? v : []);
}

/* ============================================================ */
/*  Brouillage                                                    */
/* ============================================================ */

/** Empreinte 32 bits (FNV-1a) : le même mot donne toujours la même chose. */
export function hash32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const LOWER = "abcdefghijklmnopqrstuvwxyz";

/** Un mot brouillé : même longueur, ponctuation gardée. */
export function scrambleWord(word, lang, seed) {
  const glyphs = lang.mode === "symbols" ? [...lang.alphabet.replace(/\s+/g, "")] : [];
  let out = "";
  let i = 0;
  for (const ch of word) {
    const h = hash32(`${seed}:${i++}`);
    if (!/\p{L}|\p{N}/u.test(ch)) { out += ch; continue; }
    if (lang.mode === "blocks") out += "█";
    else if (glyphs.length) out += glyphs[h % glyphs.length];
    else {
      const c = LOWER[h % LOWER.length];
      out += ch === ch.toLowerCase() ? c : c.toUpperCase();
    }
  }
  return out;
}

/** Un mot = lettres et chiffres (apostrophes et traits d'union compris). */
export const WORD_RE = /[\p{L}\p{N}][\p{L}\p{M}\p{N}'’-]*/gu;
