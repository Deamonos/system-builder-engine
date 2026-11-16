/**
 * SBE — CARROUSEL DE COMBAT : réglages
 *
 * Réglage du monde `carousel` (manager « Carrousel de combat ») :
 *   pos       position par défaut : "top" (horizontal, en haut) | "right"
 *             (vertical, à droite) ; chaque joueur peut changer la sienne
 *   align     en haut, quand la bande n'est pas pleine : "end" (calée à
 *             droite, contre la barre latérale) | "start" (calée à gauche)
 *   size      taille des portraits (px)
 *   shape     forme : "square" | "portrait" (plus haut que large) | "round"
 *   img       image : "token" (celle du jeton) | "actor" (celle du personnage)
 *   show      { name, init } : ce qui s'affiche sur un portrait
 *   anim      animations : "on" (toujours) | "system" (sauf si l'ordinateur
 *             demande moins d'animations) | "off"
 *   active    { glow (halo animé), scale (taille du combattant actif, en %) }
 *   marks     { next (languette « Suivant »), played (ceux qui ont joué ce
 *             round sont assombris), defeatIcon (icône posée sur un vaincu :
 *             classe Font Awesome ou émoji ; vide = aucune) }
 *   buttons   { gmCombat, gmInit, playerEnd, playerInit }
 *   bars      jusqu'à 2 barres : [{ label, value (clé ou formule), max (vide =
 *             le maximum du champ), color, vis, text (chiffres dans la barre :
 *             "never" | "hover" | "always") }]
 *   effects   { on, max (icônes au plus), vis } : les effets actifs
 *   tooltip   { on, header (mini portrait, attitude, initiative), meters
 *             (mini-barre sous une valeur qui a un maximum), effects,
 *             durations (durée restante des effets), desc, keys: [{ key,
 *             label }], vis } : l'info-bulle
 *   clicks    { pan, hover : "all" | "gm" ; sheet : double-clic = fiche }
 *   vis       qui voit : "all" | "owner" (le propriétaire et le MJ) | "gm"
 *   shown     { defeated "grey" | "hide", untilTurn (PNJ cachés aux joueurs
 *             jusqu'à leur 1er tour), npcInit (initiative des PNJ montrée),
 *             roundName (nom du combattant actif dans la pastille du round) }
 *   theme     { mode "sbe" (thème SBE) | "own", radius, border, dark, light }
 *             (voir carousel-theme.mjs)
 *   rules     [{ when "formula" | "effect", formula, effect (nom ou statut),
 *             action "hide" (masqué du carrousel) | "defeat" | "remove" }]
 *
 * Réglage du monde `carouselEnabled` (case des paramètres du système,
 * décochée par défaut) : le carrousel s'affiche pendant les combats.
 * `carouselSettings().enabled` le reprend.
 *
 * Réglage du poste `carouselPos` : la position choisie par ce joueur
 * ("" = celle du MJ).
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { cleanTheme } from "./carousel-theme.mjs";

export const CAROUSEL_SETTING = "carousel";
export const CAROUSEL_POS_SETTING = "carouselPos";
export const CAROUSEL_ENABLED_SETTING = "carouselEnabled";
export const CAROUSEL_POS = ["top", "right"];
export const TOP_ALIGN = ["end", "start"];
export const PORTRAIT_SHAPES = ["square", "portrait", "round"];
export const PORTRAIT_IMG = ["token", "actor"];
export const ANIM_MODES = ["on", "system", "off"];
export const VIS = ["all", "owner", "gm"];
export const CLICK_WHO = ["all", "gm"];
export const BARS_MAX = 2;
export const DEFEATED_MODES = ["grey", "hide"];
export const RULE_WHEN = ["formula", "effect"];
export const RULE_ACTIONS = ["hide", "defeat", "remove"];
export const BAR_TEXT = ["never", "hover", "always"];
export const SCALE_MIN = 100;
export const SCALE_MAX = 160;
const DEFEAT_ICON = "fa-solid fa-skull";
const BAR_COLORS = ["#c0392b", "#2e86de"];
const HEX = /^#[0-9a-f]{6}$/i;
const KEY = /^[a-z][a-z0-9_]*$/;
const pick = (v, list, d) => (list.includes(v) ? v : d);
export const SIZE_MIN = 40;
export const SIZE_MAX = 200;

const int = (v, min, max, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
const on = (v) => v !== false;

export function cleanCarousel(o = {}) {
  return {
    pos: CAROUSEL_POS.includes(o.pos) ? o.pos : "top",
    align: pick(o.align, TOP_ALIGN, "end"),
    size: int(o.size, SIZE_MIN, SIZE_MAX, 80),
    shape: PORTRAIT_SHAPES.includes(o.shape) ? o.shape : "portrait",
    img: PORTRAIT_IMG.includes(o.img) ? o.img : "token",
    show: { name: on(o.show?.name), init: on(o.show?.init) },
    anim: ANIM_MODES.includes(o.anim) ? o.anim : "on",
    active: { glow: on(o.active?.glow), scale: int(o.active?.scale, SCALE_MIN, SCALE_MAX, 115) },
    marks: {
      next: on(o.marks?.next), played: on(o.marks?.played),
      defeatIcon: o.marks?.defeatIcon === undefined ? DEFEAT_ICON : String(o.marks.defeatIcon ?? "").trim().slice(0, 80)
    },
    buttons: {
      gmCombat: on(o.buttons?.gmCombat), gmInit: on(o.buttons?.gmInit),
      playerEnd: on(o.buttons?.playerEnd), playerInit: on(o.buttons?.playerInit)
    },
    bars: (Array.isArray(o.bars) ? o.bars : []).slice(0, BARS_MAX).map((b, i) => ({
      label: String(b?.label ?? "").trim(),
      value: String(b?.value ?? "").trim(),
      max: String(b?.max ?? "").trim(),
      color: HEX.test(String(b?.color ?? "")) ? String(b.color).toLowerCase() : BAR_COLORS[i],
      vis: pick(b?.vis, VIS, "all"),
      text: pick(b?.text, BAR_TEXT, "hover")
    })).filter(b => b.value),
    effects: { on: on(o.effects?.on), max: int(o.effects?.max, 1, 12, 4), vis: pick(o.effects?.vis, VIS, "all") },
    tooltip: {
      on: on(o.tooltip?.on), header: on(o.tooltip?.header), meters: on(o.tooltip?.meters),
      effects: on(o.tooltip?.effects), durations: on(o.tooltip?.durations), desc: !!o.tooltip?.desc,
      keys: (Array.isArray(o.tooltip?.keys) ? o.tooltip.keys : [])
        .map(k => ({ key: String(k?.key ?? "").trim(), label: String(k?.label ?? "").trim() }))
        .filter(k => KEY.test(k.key)),
      vis: pick(o.tooltip?.vis, VIS, "owner")
    },
    clicks: { pan: pick(o.clicks?.pan, CLICK_WHO, "all"), hover: pick(o.clicks?.hover, CLICK_WHO, "all"), sheet: on(o.clicks?.sheet) },
    shown: { defeated: pick(o.shown?.defeated, DEFEATED_MODES, "grey"), untilTurn: !!o.shown?.untilTurn, npcInit: on(o.shown?.npcInit), roundName: on(o.shown?.roundName) },
    rules: (Array.isArray(o.rules) ? o.rules : []).map(r => ({
      when: pick(r?.when, RULE_WHEN, "formula"),
      formula: String(r?.formula ?? "").trim(),
      effect: String(r?.effect ?? "").trim(),
      action: pick(r?.action, RULE_ACTIONS, "hide")
    })).filter(r => (r.when === "formula" ? r.formula : r.effect)),
    theme: cleanTheme(o.theme)
  };
}

/** Ce combattant peut-il montrer cette information à ce joueur ? */
export function visibleTo(vis, combatant, user = game.user) {
  if (user.isGM || vis === "all") return true;
  return vis === "owner" && !!combatant?.testUserPermission?.(user, "OWNER");
}

/** Une action de clic est-elle permise à ce joueur ? */
export function clickAllowed(who, user = game.user) { return user.isGM || who === "all"; }

/**
 * Un réglage de monde se remplace en entier : un opérateur de
 * remplacement (fait pour les documents) y est enregistré tel quel.
 * Les réglages enregistrés ainsi par erreur sont relus dedans.
 */
function unwrapStored(raw) {
  const ops = foundry.data.operators;
  if (raw && typeof raw === "object" && ops.OPERATOR_IDENTIFIER in raw && raw.value && typeof raw.value === "object") return raw.value;
  return raw;
}

export function carouselSettings() {
  let cfg;
  try { cfg = cleanCarousel(unwrapStored(game.settings.get(SYSTEM_ID, CAROUSEL_SETTING)) ?? {}); }
  catch (_e) { cfg = cleanCarousel(); }
  let enabled = false;
  try { enabled = game.settings.get(SYSTEM_ID, CAROUSEL_ENABLED_SETTING) === true; } catch (_e) { /* pas encore enregistré */ }
  return { enabled, ...cfg };
}

/**
 * Ancien emplacement de l'activation (dans les réglages du carrousel) : le
 * MJ principal la passe dans la case des paramètres du système, une fois.
 */
export async function migrateCarouselEnabled() {
  if (!game.users.activeGM?.isSelf) return;
  const stored = game.settings.get(SYSTEM_ID, CAROUSEL_SETTING) ?? {};
  const raw = unwrapStored(stored) ?? {};
  if (!("enabled" in raw)) {
    /* Réglage enregistré dans un opérateur : remis à plat. */
    if (raw !== stored) await game.settings.set(SYSTEM_ID, CAROUSEL_SETTING, raw);
    return;
  }
  const { enabled, ...rest } = raw;
  await game.settings.set(SYSTEM_ID, CAROUSEL_ENABLED_SETTING, enabled !== false);
  await game.settings.set(SYSTEM_ID, CAROUSEL_SETTING, rest);
}

/** Les animations sont-elles jouées sur ce poste ? */
export function carouselAnimates(cfg = carouselSettings()) {
  if (cfg.anim === "off") return false;
  if (cfg.anim === "system") return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return true;
}

/** La position du carrousel sur ce poste (le choix du joueur, sinon celle du MJ). */
export function carouselPosOf() {
  let own = "";
  try { own = game.settings.get(SYSTEM_ID, CAROUSEL_POS_SETTING) ?? ""; } catch (_e) { /* pas encore enregistré */ }
  return CAROUSEL_POS.includes(own) ? own : carouselSettings().pos;
}
