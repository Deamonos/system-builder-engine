/**
 * SBE — Thème de l'INTERFACE (et non des fenêtres)
 *
 * Foundry a deux réglages de couleurs : les fenêtres (classe du <body>)
 * et l'interface (classe de #interface : barres latérales, contrôles…).
 * Ce qui est posé sur l'écran comme une pièce de l'interface (horloge,
 * carrousel de combat, HUD d'actions, journaux du chat, info-bulles) suit celui de
 * l'interface : il
 * reçoit `themed theme-light|theme-dark`, remis à jour quand le joueur
 * change ses couleurs.
 */

const tracked = new Set();

/** "light" ou "dark" : le thème de l'interface de ce joueur. */
export function interfaceScheme() {
  const ui = document.getElementById("interface");
  if (ui?.classList.contains("theme-light")) return "light";
  if (ui?.classList.contains("theme-dark")) return "dark";
  return document.body.classList.contains("theme-light") ? "light" : "dark";
}

function apply(el) {
  const s = interfaceScheme();
  el.classList.add("themed");
  el.classList.toggle("theme-light", s === "light");
  el.classList.toggle("theme-dark", s === "dark");
}

/** L'élément suit le thème de l'interface, maintenant et à chaque changement. */
export function followInterfaceTheme(el) {
  if (!el) return;
  apply(el);
  tracked.add(el);
}

/**
 * Les info-bulles de Foundry (toujours posées en sombre) prennent le thème
 * de l'interface, si `isOn()` le permet. Branché une fois, au « ready ».
 */
export function themeTooltips(isOn) {
  const tm = game.tooltip;
  if (!tm || tm.sbeThemed) return;
  tm.sbeThemed = true;
  const activate = tm.activate.bind(tm);
  tm.activate = (element, options) => {
    const out = activate(element, options);
    if (isOn() && tm.tooltip) {
      tm.tooltip.classList.remove("theme-dark", "theme-light");
      tm.tooltip.classList.add(`theme-${interfaceScheme()}`);
    }
    return out;
  };
}

/** L'élément ne suit plus le thème de l'interface. */
export function unfollowInterfaceTheme(el) {
  tracked.delete(el);
}

Hooks.on("clientSettingChanged", (key) => {
  if (key !== "core.uiConfig") return;
  /* Foundry pose d'abord ses classes ; on suit juste après. */
  setTimeout(() => {
    for (const el of tracked) {
      if (el.isConnected) apply(el);
      else tracked.delete(el);
    }
  }, 0);
});
