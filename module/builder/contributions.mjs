/**
 * SBE — REGISTRE D'APPORTS
 *
 * UNE seule réponse à « qu'est-ce qui modifie cette clé, et de
 * combien ? ». Chaque mécanique capable de modifier une valeur (les
 * effets aujourd'hui ; l'équipement, les classes, les compétences
 * demain) s'inscrit ici comme SOURCE. Le moteur de formules demande la
 * liste des apports d'un document, et les applique AU CALCUL :
 *
 *   - rien n'est jamais écrit dans les valeurs stockées : la base que
 *     le joueur a saisie reste la base, resauvegarder la fiche ne
 *     « cuit » jamais un bonus dedans ;
 *   - un champ calculé reçoit ses apports comme les autres ;
 *   - chaque apport est NOMMÉ : la fiche montre au survol la base, puis
 *     chaque source (« Saignement −2 »), puis le total.
 *
 * FORME D'UN APPORT (ce que rend une source) :
 *   { key, mode, value, label, img?, n? , scale? }
 *     key   : clé visée (champ du modèle, ou sous-clé « clé_max »…)
 *     mode  : "add" | "multiply" | "downgrade" | "upgrade" | "override"
 *     value : nombre ou formule (lue sur la fiche au moment du calcul)
 *     n     : nombre de cumuls (1 par défaut)
 *     scale : vrai → la valeur suit les cumuls (add : ×n ; multiply : ^n)
 *     public: vrai → l'apport peut être nommé à tous (carte de jet) ;
 *             sinon il reste secret (équipement, compétences, effet discret)
 *
 * Ordre d'application (celui des ActiveEffects de Foundry, que les MJ
 * connaissent) : multiplier, ajouter, plafonner (au plus), plancher
 * (au moins), remplacer.
 */

const SOURCES = new Map();

export const CONTRIB_MODES = ["add", "multiply", "downgrade", "upgrade", "override"];
const ORDER = { multiply: 10, add: 20, downgrade: 30, upgrade: 40, override: 50 };

/** Inscrit (ou remplace) une source d'apports. fn(doc) → [apports]. */
export function registerContributionSource(id, fn) {
  if (!id || typeof fn !== "function") return;
  SOURCES.set(id, fn);
}

/**
 * Tous les apports d'un document, rangés par clé.
 * @returns {Object<string, Array>} {} si rien
 */
export function contributionsOf(doc) {
  const out = {};
  if (!doc) return out;
  for (const [id, fn] of SOURCES) {
    let list = [];
    try { list = fn(doc) ?? []; } catch (err) {
      console.warn(`SBE | Source d'apports « ${id} » en échec`, err);
      continue;
    }
    for (const c of list) {
      if (!c?.key || !CONTRIB_MODES.includes(c.mode)) continue;
      (out[c.key] ??= []).push({ ...c, source: id });
    }
  }
  return out;
}

/**
 * Applique les apports d'une clé à sa valeur de base.
 * @param {number} base
 * @param {Array} terms     apports de cette clé
 * @param {Function} evaluate  (formule) → nombre|null
 * @returns {{ total:number, lines:Array<{label,img,mode,text,delta}> }}
 */
export function applyContributions(base, terms, evaluate) {
  let total = Number(base) || 0;
  const lines = [];
  const sorted = [...terms].sort((a, b) => (ORDER[a.mode] ?? 99) - (ORDER[b.mode] ?? 99));
  for (const t of sorted) {
    const raw = String(t.value ?? "").trim();
    let v = Number.isFinite(Number(raw)) && raw !== "" ? Number(raw) : Number(evaluate(raw));
    if (!Number.isFinite(v)) continue;
    const n = Math.max(1, Number(t.n) || 1);
    if (t.scale && n > 1) {
      if (t.mode === "add") v *= n;
      else if (t.mode === "multiply") v = v ** n;
    }
    const before = total;
    let text = "";
    switch (t.mode) {
      case "add": total += v; text = `${v >= 0 ? "+" : "−"}${fmt(Math.abs(v))}`; break;
      case "multiply": total *= v; text = `×${fmt(v)}`; break;
      case "downgrade": total = Math.min(total, v); text = `≤ ${fmt(v)}`; break;
      case "upgrade": total = Math.max(total, v); text = `≥ ${fmt(v)}`; break;
      case "override": total = v; text = `= ${fmt(v)}`; break;
      default: continue;
    }
    lines.push({ label: t.label ?? "", img: t.img ?? "", mode: t.mode, text, delta: total - before,
      source: t.source ?? "", public: !!t.public });
  }
  return { total, lines };
}

function fmt(n) {
  return String(Math.round(Number(n) * 1000) / 1000);
}
