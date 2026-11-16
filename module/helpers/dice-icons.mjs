/**
 * SBE — Icônes de dé des libellés cliquables
 *
 * Le MJ choisit l'icône qui précède un libellé lançant un jet. La liste
 * est VOLONTAIREMENT courte et fermée, pour une raison technique :
 * dans un graphique SVG, une classe « fa-* » ne s'applique pas à un
 * <tspan>. On y écrit donc le POINT DE CODE de l'icône, et il faut
 * pouvoir le retrouver depuis le choix du MJ — d'où cette table.
 *
 * Les émojis, eux, sont des caractères ordinaires : ils s'affichent
 * partout sans table de correspondance.
 *
 * ZÉRO dépendance : Font Awesome est livré avec Foundry.
 */

/** Choix proposés. `cp` = point de code Font Awesome (absent = émoji). */
export const DICE_ICONS = [
  { v: "fa-solid fa-dice-d20", cp: "", key: "D20" },
  { v: "fa-solid fa-dice-d6", cp: "", key: "D6" },
  { v: "fa-solid fa-dice", cp: "", key: "Pair" },
  { v: "fa-solid fa-dice-one", cp: "", key: "One" },
  { v: "fa-solid fa-dice-two", cp: "", key: "Two" },
  { v: "fa-solid fa-dice-three", cp: "", key: "Three" },
  { v: "fa-solid fa-dice-four", cp: "", key: "Four" },
  { v: "fa-solid fa-dice-five", cp: "", key: "Five" },
  { v: "fa-solid fa-dice-six", cp: "", key: "Six" },
  { v: "fa-solid fa-bullseye", cp: "", key: "Bullseye" },
  { v: "fa-solid fa-crosshairs", cp: "", key: "Crosshairs" },
  { v: "fa-solid fa-bolt", cp: "", key: "Bolt" },
  { v: "fa-solid fa-star", cp: "", key: "Star" },
  { v: "fa-solid fa-skull", cp: "", key: "Skull" },
  { v: "fa-solid fa-hand-fist", cp: "", key: "Fist" },
  { v: "🎲", cp: null, key: "EmojiDice" },
  { v: "🎯", cp: null, key: "EmojiTarget" },
  { v: "☠️", cp: null, key: "EmojiSkull" }
];

/** Choix par défaut quand rien n'est configuré. */
export const DICE_ICON_DEFAULT = "fa-solid fa-dice-d20";

/** Entrée de la table pour une valeur donnée (repli sur le défaut). */
function entryOf(value) {
  const v = String(value ?? "").trim() || DICE_ICON_DEFAULT;
  return DICE_ICONS.find(d => d.v === v)
    ?? { v, cp: null, key: "" };   /* valeur libre : traitée en texte */
}

/** Icône de dé en HTML (fiche, types de graphique en HTML). */
export function diceIconHTML(value) {
  const e = entryOf(value);
  return e.cp !== null || e.v.includes("fa-")
    ? `<i class="${e.v} sbe-roll-dice"></i>`
    : `<span class="sbe-roll-dice">${e.v}</span>`;
}

/**
 * Icône de dé en SVG (radar, courbes, secteurs…).
 * Font Awesome est appelé par son POINT DE CODE, la police étant posée
 * en CSS sur la classe — une classe « fa-* » ne rendrait rien ici.
 */
export function diceIconSVG(value) {
  const e = entryOf(value);
  return e.cp
    ? `<tspan class="sbe-chart-dice">${e.cp}</tspan>`
    : `<tspan class="sbe-chart-dice sbe-chart-dice--plain">${e.v}</tspan>`;
}
