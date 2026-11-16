/**
 * SBE — COMPOSANT NIVEAU (données et calculs)
 *
 * Le niveau d'un personnage, ou d'un objet (compétence, métier…). Sa clé
 * contient le niveau, un simple nombre : utilisable dans toutes les
 * formules. La montée vient de l'expérience (une clé d'XP et des seuils)
 * ou d'ailleurs (quête réussie, bouton, MJ) : l'XP n'est qu'un mode.
 *
 *   config = {
 *     default     niveau de départ (1)
 *     max         niveau maximum : nombre ou formule ("" = aucun)
 *     mode        "xp" (seuils d'expérience) | "given" (niveaux donnés)
 *     xpKey       clé de l'expérience (un champ de la fiche)
 *     thresholds  XP totale pour passer au niveau suivant :
 *                 liste « 100, 300, 600 » (niveau 2, 3, 4…) ou formule
 *                 avec « level » = niveau actuel (« level * 1000 »)
 *     showMax     afficher « niveau / max »
 *     gauge       "none" | "xp" (vers le prochain seuil) | "level" (vers le max)
 *     button      bouton « Passer au niveau » quand un niveau est disponible
 *     who         "player" | "approve" (validation du MJ) | "gm"
 *     commit      "validate" (écrit à « Valider ») | "live" (tout de suite)
 *     budget: {
 *       points      points à répartir à chaque passage (nombre ou formule,
 *                   « level » = niveau atteint) ; vide = pas de budget
 *       fields      « clé:coût » séparés par des virgules (« force:1, agilite:2 »)
 *       mustSpend   « Valider » seulement quand tout est dépensé
 *       leftoverKey clé de la fiche où vont les points restants
 *       sell        on peut descendre un champ sous sa valeur d'ouverture
 *     }
 *     rules       tableau de règles de montée (voir cleanRules)
 *     down: { who "none"|"gm"|"approve"|"player", undo (défaire le
 *             dernier passage), rules (règles de descente) }
 *     history: { players }  les joueurs voient l'historique
 *     received    niveaux reçus (quête, bouton) : "available" (à passer
 *                 avec le bouton) | "direct" (passés tout de suite)
 *   }
 *
 * Les composants posés DANS le composant (ses enfants) forment la
 * fenêtre de passage de niveau ; ils ne s'affichent pas sur la fiche.
 */

export const LEVEL_MODES = ["xp", "given"];
export const RULE_WHEN = ["at", "every", "each"];
export const RULE_ACTIONS = ["value", "item", "effect", "button"];
export const DOWN_WHO = ["none", "gm", "approve", "player"];
export const LEVEL_RECEIVED = ["available", "direct"];
export const LEVEL_GAUGES = ["none", "xp", "level"];
export const LEVEL_WHO = ["player", "approve", "gm"];
export const LEVEL_COMMIT = ["validate", "live"];

const num = (v) => (v === "" || v === null || v === undefined ? NaN : Number(v));

/** Réglages propres (valeurs par défaut comprises). */
export function levelConfig(el) {
  const c = el?.config ?? {};
  return {
    start: Number.isFinite(num(c.default)) ? Math.max(0, Math.floor(num(c.default))) : 1,
    max: String(c.max ?? "").trim(),
    mode: c.mode === "xp" ? "xp" : "given",
    xpKey: String(c.xpKey ?? "").trim(),
    thresholds: String(c.thresholds ?? "").trim(),
    showMax: !!c.showMax,
    gauge: LEVEL_GAUGES.includes(c.gauge) ? c.gauge : "none",
    button: c.button !== false,
    who: LEVEL_WHO.includes(c.who) ? c.who : "player",
    commit: c.commit === "live" ? "live" : "validate",
    budget: {
      points: String(c.budget?.points ?? "").trim(),
      fields: parseFields(c.budget?.fields),
      mustSpend: !!c.budget?.mustSpend,
      leftoverKey: String(c.budget?.leftoverKey ?? "").trim(),
      sell: !!c.budget?.sell
    },
    rules: cleanRules(c.rules),
    down: {
      who: DOWN_WHO.includes(c.down?.who) ? c.down.who : "none",
      undo: c.down?.undo !== false,
      rules: cleanRules(c.down?.rules)
    },
    historyPlayers: !!c.history?.players,
    received: c.received === "direct" ? "direct" : "available"
  };
}

/* ------------------------------------------------------------ */
/*  Tableaux de règles (montée et descente)                      */
/* ------------------------------------------------------------ */

const KEY_OK = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const int = (v, d) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? n : d; };

/**
 * Une règle : QUAND (au niveau N, tous les N niveaux à partir de M, à
 * chaque niveau) et QUOI (actions, dans l'ordre) :
 *   { type:"value",  key, op:"add"|"set", value }   valeur (nombre ou formule, « level »)
 *   { type:"item",   id, qty, op:"give"|"take" }    objet du monde
 *   { type:"effect", key, op:"apply"|"remove" }     effet de la bibliothèque
 *   { type:"button", key }                          bouton du modèle
 */
export function cleanRules(raw) {
  const out = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    if (!r || typeof r !== "object") continue;
    const when = RULE_WHEN.includes(r.when) ? r.when : "at";
    const actions = [];
    for (const a of Array.isArray(r.actions) ? r.actions : []) {
      if (!a || !RULE_ACTIONS.includes(a.type)) continue;
      if (a.type === "value") actions.push({ type: "value", key: KEY_OK.test(a.key ?? "") ? a.key : "", op: a.op === "set" ? "set" : "add", value: String(a.value ?? "").trim() });
      else if (a.type === "item") actions.push({ type: "item", id: String(a.id ?? ""), qty: Math.max(1, int(a.qty, 1)), op: a.op === "take" ? "take" : "give" });
      else if (a.type === "effect") actions.push({ type: "effect", key: String(a.key ?? ""), op: a.op === "remove" ? "remove" : "apply" });
      else actions.push({ type: "button", key: String(a.key ?? "") });
    }
    out.push({ id: String(r.id || foundry.utils.randomID()), when, n: Math.max(1, int(r.n, 2)), from: Math.max(0, int(r.from, 1)), actions });
  }
  return out;
}

/** La règle `r` s'applique-t-elle au niveau `level` ? */
export function ruleMatches(r, level) {
  if (r.when === "each") return true;
  if (r.when === "at") return level === r.n;
  return level >= r.from && (level - r.from) % r.n === 0;
}

/** « force:1, agilite:2 » → [{ key, cost }] (coût 1 par défaut). */
export function parseFields(raw) {
  const out = [];
  for (const part of String(raw ?? "").split(/[,;\n]+/)) {
    const [k, c] = part.split(":").map(x => x?.trim());
    if (!k || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k)) continue;
    const cost = Number(c);
    out.push({ key: k, cost: Number.isFinite(cost) && cost > 0 ? cost : 1 });
  }
  return out;
}

/**
 * Le budget de points d'un passage (ou null s'il n'y en a pas) :
 * dépensé = ce que les champs ont gagné depuis l'ouverture × leur coût.
 * @param {number} to  le niveau atteint (« level » dans la formule)
 */
export function budgetOf(el, to, values, snapshot, scope, evalFn) {
  const b = levelConfig(el).budget;
  if (!b.points || !b.fields.length) return null;
  const total = numberOf(b.points, scope, evalFn, to);
  if (!Number.isFinite(total)) return null;
  const labels = new Map();
  const walk = (list) => { for (const e of list ?? []) { if (e?.key) labels.set(e.key, e.label || e.key); walk(e?.children); } };
  walk(el.children);
  let spent = 0;
  const fields = b.fields.map(f => {
    const gain = (Number(values?.[f.key]) || 0) - (Number(snapshot?.[f.key]) || 0);
    spent += gain * f.cost;
    return { ...f, label: labels.get(f.key) ?? f.key, gain };
  });
  return { total, spent, left: Math.round((total - spent) * 1000) / 1000, fields, mustSpend: b.mustSpend, leftoverKey: b.leftoverKey, sell: b.sell };
}

/**
 * Un nombre ou une formule (lue avec `scope`, plus `level`).
 * @param {Function} evalFn  (expr, scope) → valeur (moteur de formules)
 */
function numberOf(raw, scope, evalFn, level) {
  const s = String(raw ?? "").trim();
  if (!s) return NaN;
  if (Number.isFinite(Number(s))) return Number(s);
  try { return Number(evalFn(s, { ...scope, level })); } catch (_e) { return NaN; }
}

/** XP totale pour passer du niveau `level` au suivant (NaN = aucun seuil). */
export function thresholdFor(cfg, level, scope, evalFn) {
  const t = cfg.thresholds;
  if (!t) return NaN;
  /* Liste : « 100, 300, 600 » = seuils des niveaux 2, 3, 4… (comptés depuis le départ). */
  if (/^[\d\s.,;]+$/.test(t)) {
    const list = t.split(/[;,]\s*|\s+/).map(Number).filter(Number.isFinite);
    return list[level - cfg.start] ?? NaN;
  }
  return numberOf(t, scope, evalFn, level);
}

/**
 * L'état du niveau sur un document.
 * @param {object} el      le composant
 * @param {object} values  les valeurs de la fiche (system.values)
 * @param {object} scope   la portée des formules (fiche calculée)
 * @param {Function} evalFn
 * @param {number} granted niveaux reçus en attente (quête, bouton)
 */
export function levelState(el, values, scope, evalFn, granted = 0) {
  const cfg = levelConfig(el);
  const raw = Number(values?.[el.key]);
  const level = Number.isFinite(raw) ? raw : cfg.start;
  const max = numberOf(cfg.max, scope, evalFn, level);
  const atMax = Number.isFinite(max) && level >= max;
  const xp = cfg.mode === "xp" && cfg.xpKey ? (Number(scope?.[cfg.xpKey] ?? values?.[cfg.xpKey]) || 0) : null;
  const next = cfg.mode === "xp" ? thresholdFor(cfg, level, scope, evalFn) : NaN;
  const prev = cfg.mode === "xp" && level > cfg.start ? thresholdFor(cfg, level - 1, scope, evalFn) : 0;
  /* Niveaux disponibles (XP) : autant de seuils franchis, sans dépasser le max. */
  let ready = 0;
  if (cfg.mode === "xp" && xp !== null) {
    let l = level;
    for (let i = 0; i < 100; i++) {
      if (Number.isFinite(max) && l >= max) break;
      const t = thresholdFor(cfg, l, scope, evalFn);
      if (!Number.isFinite(t) || xp < t) break;
      ready++; l++;
    }
  }
  /* Niveaux reçus (quête, bouton) : disponibles en plus, sans dépasser le max. */
  const xpReady = ready;
  const g = Math.max(0, Math.floor(Number(granted) || 0));
  if (g) ready = Math.max(0, Math.min(ready + g, Number.isFinite(max) ? max - level : ready + g));
  let gauge = null;
  if (cfg.gauge === "xp" && xp !== null && Number.isFinite(next)) {
    const from = Number.isFinite(prev) ? prev : 0;
    gauge = { pct: Math.max(0, Math.min(1, (xp - from) / Math.max(1, next - from))), text: `${xp} / ${next}` };
  } else if (cfg.gauge === "level" && Number.isFinite(max) && max > 0) {
    gauge = { pct: Math.max(0, Math.min(1, level / max)), text: `${level} / ${max}` };
  }
  return { cfg, level, max: Number.isFinite(max) ? max : null, atMax, xp, next: Number.isFinite(next) ? next : null, ready, xpReady, granted: g, gauge };
}
