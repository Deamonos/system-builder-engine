/**
 * SBE — VISIBILITÉ DES MESSAGES DE JET (une seule source)
 *
 * Les visibilités sont celles de Foundry (public, MJ, aveugle, soi),
 * lues sur place — rien d'écrit en dur. Le MJ règle, pour un jet (un
 * composant qui lance un jet) ou pour les attaques (règles de combat) :
 *   - def     : la visibilité par défaut ("" = celle choisie dans le
 *               chat par le joueur) ;
 *   - allowed : les visibilités permises (vide = toutes). La fenêtre de
 *               jet ne propose qu'elles ; une seule = imposée.
 * Les attaques ont une visibilité de plus : « Tireur, cibles et MJ »
 * (TARGETS_MODE), un murmure à ceux qui sont concernés.
 */

export const TARGETS_MODE = "sbeTargets";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/** Visibilités offertes par Foundry (v14 : modes de message ; sinon
 *  modes de jet). { list: [{value, label}], cur } */
export function messageModeChoices() {
  const src = CONFIG.ChatMessage?.modes ?? CONFIG.Dice?.rollModes ?? {};
  let cur = "";
  try { cur = game.settings.get("core", "messageMode"); }
  catch (_e) { try { cur = game.settings.get("core", "rollMode"); } catch (_e2) { /* */ } }
  /* Le mode « aveugle » de Foundry est traduit « Aveugle pour les
     maîtres de jeu », ce qui laisse croire que le MJ ne voit rien :
     c'est l'inverse (seul le MJ voit le résultat). Libellé clarifié. */
  /* « En personnage » (ic) est un style de message, pas une visibilité
     de jet : écarté. */
  const list = Object.entries(src).filter(([v]) => v !== "ic").map(([v, d]) => ({
    value: v,
    label: /blind/i.test(v)
      ? L("SBE.Roll.ModeBlind")
      : L(typeof d === "string" ? d : (d?.label ?? v))
  }));
  return { list, cur };
}

/** Toutes les visibilités possibles (+ « Tireur, cibles et MJ »). */
export function visChoices({ targets = false } = {}) {
  const { list, cur } = messageModeChoices();
  const all = [...list];
  if (targets) all.push({ value: TARGETS_MODE, label: L("SBE.Roll.ModeTargets") });
  return { list: all, cur };
}

/** Réglage propre : { def, allowed } (valeurs inconnues écartées). */
export function cleanVis(raw, { targets = false } = {}) {
  const ok = new Set(visChoices({ targets }).list.map(m => m.value));
  const allowed = (Array.isArray(raw?.allowed) ? raw.allowed : []).filter(v => ok.has(v));
  const def = ok.has(raw?.def) ? raw.def : "";
  /* La visibilité par défaut est toujours permise. */
  if (def && allowed.length && !allowed.includes(def)) allowed.push(def);
  return { def, allowed: [...new Set(allowed)], targets };
}

/** Le réglage est-il celui d'origine (rien à enregistrer) ? */
export function isDefaultVis(v) {
  return !v?.def && !(v?.allowed?.length);
}

/** Ce que propose la fenêtre de jet : la liste permise et la valeur
    choisie d'avance. */
export function visOptions(policy) {
  const { list, cur } = visChoices({ targets: !!policy?.targets });
  const allowed = policy?.allowed?.length ? list.filter(m => policy.allowed.includes(m.value)) : list.filter(m => m.value !== TARGETS_MODE || policy?.targets);
  const has = (v) => allowed.some(m => m.value === v);
  const selected = has(policy?.def) ? policy.def : has(cur) ? cur : (allowed[0]?.value ?? "");
  return { list: allowed, selected };
}

/** La visibilité quand aucune fenêtre ne la demande. null = celle du
    chat du joueur (permise). */
export function visDefaultMode(policy) {
  const { list, cur } = visChoices({ targets: !!policy?.targets });
  const allowed = policy?.allowed?.length ? policy.allowed : null;
  if (policy?.def && (!allowed || allowed.includes(policy.def))) return policy.def;
  if (!allowed) return null;
  if (allowed.includes(cur)) return null;
  return allowed.find(v => list.some(m => m.value === v)) ?? null;
}

/** La visibilité est-elle publique (tout le monde lit le message) ? */
export function isPublicMode(mode) {
  let m = mode;
  if (!m) {
    try { m = game.settings.get("core", "messageMode"); }
    catch (_e) { try { m = game.settings.get("core", "rollMode"); } catch (_e2) { m = "public"; } }
  }
  return /public/i.test(String(m ?? "public"));
}

/** « Tireur, cibles et MJ » : les joueurs qui possèdent le tireur ou
    une cible, celui qui lance, et les MJ. */
export function targetsWhisper(actor, targets = []) {
  const ids = new Set([game.user.id]);
  for (const u of game.users ?? []) {
    if (u.isGM) { ids.add(u.id); continue; }
    const owns = (a) => !!a?.testUserPermission?.(u, "OWNER");
    if (owns(actor) || (targets ?? []).some(owns)) ids.add(u.id);
  }
  return [...ids];
}

/** Les MJ (pour les détails réservés). */
export function gmIds() {
  return (game.users ?? []).filter(u => u.isGM).map(u => u.id);
}

/**
 * Bloc de réglage : visibilité par défaut + visibilités permises.
 * `prefix` nomme les champs (prefix.def, prefix.allow).
 */
export function visPolicyHTML(prefix, raw, { targets = false } = {}) {
  const v = cleanVis(raw, { targets });
  const { list } = visChoices({ targets });
  return `
    <div class="form-group sbe-vis-def">
      <label>${L("SBE.Roll.VisDefault")}</label>
      <select name="${prefix}.def">
        <option value="" ${!v.def ? "selected" : ""}>${esc(L("SBE.Roll.VisPlayer"))}</option>
        ${list.map(m => `<option value="${esc(m.value)}" ${v.def === m.value ? "selected" : ""}>${esc(m.label)}</option>`).join("")}
      </select>
    </div>
    <div class="form-group sbe-vis-allow">
      <label>${L("SBE.Roll.VisAllowed")}</label>
      <div class="sbe-vis-allow-list">
        ${list.map(m => `<label class="sbe-vis-chk"><input type="checkbox" name="${prefix}.allow" value="${esc(m.value)}" ${v.allowed.includes(m.value) ? "checked" : ""}> ${esc(m.label)}</label>`).join("")}
      </div>
      <p class="notes">${L("SBE.Roll.VisAllowedHint")}</p>
    </div>`;
}

/** Relit le bloc. */
export function readVisPolicy(root, prefix, { targets = false } = {}) {
  const def = root.querySelector(`[name="${prefix}.def"]`)?.value ?? "";
  const allowed = [...root.querySelectorAll(`[name="${prefix}.allow"]:checked`)].map(i => i.value);
  return cleanVis({ def, allowed }, { targets });
}
