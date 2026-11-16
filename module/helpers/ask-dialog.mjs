/**
 * SBE — Étape « Demander » : la fenêtre de questions
 *
 * Une fenêtre pose une ou plusieurs questions (nombre, liste de choix,
 * case à cocher, texte) et rend les réponses par leur clé. Elle s'ouvre
 * chez celui qui doit répondre : sur ce poste, ou chez un autre joueur
 * (le MJ, le joueur de la cible) par le socket, et la réponse revient.
 *
 * Question : { key, label, kind: number|choice|check|text, def, min,
 *   max, choices: [{ value, label }] } — def / min / max déjà calculés.
 */

import { onSocketMessage, emitSocket } from "./socket.mjs";
import { cfCell, cfGrid } from "./compact-form.mjs";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (x) => foundry.utils.escapeHTML(String(x ?? ""));
/* Sans réponse au bout de ce temps (joueur parti), le bouton s'arrête. */
const TIMEOUT = 5 * 60 * 1000;
const PENDING = new Map();
/* À qui chaque question a été posée : seule sa réponse compte. */
const ASKED = new Map();

/** « valeur = texte » par ligne (sans « = » : le texte est la valeur). */
export function parseChoices(raw) {
  return String(raw ?? "").split("\n").map(l => l.trim()).filter(Boolean).map(l => {
    const i = l.indexOf("=");
    if (i < 0) return { value: l, label: l };
    const value = l.slice(0, i).trim();
    return { value, label: l.slice(i + 1).trim() || value };
  });
}

/** Une valeur écrite (« 3 », « oui ») rendue dans son type. */
const typed = (v) => (v !== "" && Number.isFinite(Number(v)) ? Number(v) : v);

function fieldOf(q, i) {
  const n = `q${i}`;
  switch (q.kind) {
    case "number":
      return `<input type="number" name="${n}" value="${esc(q.def ?? 0)}" step="any"${Number.isFinite(q.min) ? ` min="${q.min}"` : ""}${Number.isFinite(q.max) ? ` max="${q.max}"` : ""}>`;
    case "choice":
      return `<select name="${n}">${(q.choices ?? []).map(c => `<option value="${esc(c.value)}" ${String(c.value) === String(q.def ?? "") ? "selected" : ""}>${esc(c.label)}</option>`).join("")}</select>`;
    case "check":
      return `<input type="checkbox" name="${n}" ${q.def ? "checked" : ""}>`;
    default:
      return `<input type="text" name="${n}" value="${esc(q.def ?? "")}">`;
  }
}

function readAnswer(q, el) {
  if (!el) return q.def;
  switch (q.kind) {
    case "number": {
      let v = Number(el.value);
      if (!Number.isFinite(v)) v = Number(q.def) || 0;
      if (Number.isFinite(q.min)) v = Math.max(q.min, v);
      if (Number.isFinite(q.max)) v = Math.min(q.max, v);
      return v;
    }
    case "check": return !!el.checked;
    case "choice": return typed(el.value);
    default: return String(el.value ?? "");
  }
}

/** Les réponses par défaut (personne n'est là pour répondre). */
export function defaultAnswers(questions) {
  return Object.fromEntries(questions.map(q => [q.key, q.kind === "check" ? !!q.def
    : q.kind === "choice" ? typed(q.def ?? q.choices?.[0]?.value ?? "") : (q.def ?? (q.kind === "number" ? 0 : ""))]));
}

/** La fenêtre, sur ce poste. @returns {Promise<object|null>} null = annulé */
export async function showAsk({ title = "", from = "", questions = [] }) {
  const content = `${from ? `<p class="notes">${esc(L("SBE.Ask.From", { name: from }))}</p>` : ""}`
    + cfGrid(questions.map((q, i) => cfCell(q.label || q.key, fieldOf(q, i), { check: q.kind === "check", wide: q.kind === "text" })));
  return foundry.applications.api.DialogV2.wait({
    window: { title: title || L("SBE.Steps.Type.ask"), icon: "fa-solid fa-circle-question" },
    classes: ["sbe-condense"],
    position: { width: 420 },
    content,
    buttons: [
      { action: "ok", label: L("SBE.Common.Validate"), icon: "fa-solid fa-check", default: true,
        callback: (_ev, _btn, dialog) => Object.fromEntries(questions.map((q, i) =>
          [q.key, readAnswer(q, dialog.element.querySelector(`[name="q${i}"]`))])) },
      { action: "cancel", label: L("SBE.Common.Cancel"), icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  }).then(r => (r && typeof r === "object" ? r : null)).catch(() => null);
}

/**
 * Pose les questions à un utilisateur (ce poste si `userId` est vide ou
 * le sien) et attend ses réponses.
 * @returns {Promise<object|null>} null = annulé, ou pas de réponse
 */
export async function askUser(spec, userId = null) {
  if (!userId || userId === game.user.id) return showAsk(spec);
  /* Joueur absent : pas de réponse possible, inutile d'attendre. */
  if (!game.users.get(userId)?.active) return null;
  const id = foundry.utils.randomID();
  return new Promise((resolve) => {
    const timer = setTimeout(() => { PENDING.delete(id); ASKED.delete(id); resolve(null); }, TIMEOUT);
    PENDING.set(id, (answers) => { clearTimeout(timer); PENDING.delete(id); ASKED.delete(id); resolve(answers ?? null); });
    ASKED.set(id, userId);
    emitSocket({ type: "sbeAsk", id, to: userId, from: game.user.id, spec: { ...spec, from: spec.from || game.user.name } });
  });
}

/** Branche les questions venues d'un autre poste, et leurs réponses. */
export function initAsk() {
  /* Le joueur interrogé s'est déconnecté : ses questions restent sans réponse. */
  Hooks.on("userConnected", (user, connected) => {
    if (connected) return;
    for (const [id, uid] of [...ASKED]) if (uid === user.id) PENDING.get(id)?.(null);
  });
  onSocketMessage(async (p) => {
    if (p?.to !== game.user.id) return;
    /* L'expéditeur réel (donné par le serveur) : la fenêtre dit qui
       demande, et la réponse ne repart que chez lui. */
    const sender = game.users.get(p._from);
    if (!sender) return;
    if (p.type === "sbeAsk") {
      const spec = { ...(p.spec ?? {}) };
      if (!sender.isGM) spec.from = sender.name;
      const answers = await showAsk(spec);
      emitSocket({ type: "sbeAskReply", id: p.id, to: sender.id, answers });
    } else if (p.type === "sbeAskReply" && ASKED.get(p.id) === sender.id) PENDING.get(p.id)?.(p.answers);
  });
}
