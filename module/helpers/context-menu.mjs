/**
 * SBE — Menu contextuel maison
 *
 * Pourquoi pas celui de Foundry : il ne sait que montrer ou cacher une
 * entrée. Or une action impossible doit rester VISIBLE, GRISÉE, avec
 * sa raison au survol (« l'arme est enrayée ») — décision actée : le
 * joueur comprend au lieu de chercher.
 *
 * Un seul menu ouvert à la fois ; il se ferme au clic ailleurs, à
 * Échap, au défilement et au redimensionnement. Il reste dans l'écran.
 * Zéro dépendance.
 *
 * Entrée : { label, icon?, disabled?, reason?, onClick? } | { separator: true }
 *   icon : classe Font Awesome (« fa-solid fa-gun »), émoji, ou chemin
 *          d'image — comme partout ailleurs dans SBE.
 */

let current = null;

function close() {
  if (!current) return;
  current.el.remove();
  for (const [target, type, fn, opts] of current.listeners) target.removeEventListener(type, fn, opts);
  current = null;
}

function iconHTML(icon) {
  const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
  const ic = String(icon ?? "").trim();
  if (!ic) return `<span class="sbe-ctx-ico"></span>`;
  if (ic.includes("fa-")) return `<span class="sbe-ctx-ico"><i class="${esc(ic)}"></i></span>`;
  if (/[./]/.test(ic)) return `<span class="sbe-ctx-ico"><img src="${esc(ic)}" alt=""></span>`;
  return `<span class="sbe-ctx-ico">${esc(ic)}</span>`;
}

/**
 * Ouvre le menu à la position de la souris.
 * @param {MouseEvent} event
 * @param {Array} entries
 */
export function openContextMenu(event, entries) {
  event.preventDefault();
  event.stopPropagation();
  close();
  const list = (entries ?? []).filter(Boolean);
  /* Pas de séparateur en tête, en queue, ni deux d'affilée. */
  const clean = list.filter((e, i) => !e.separator
    || (i > 0 && i < list.length - 1 && !list[i - 1].separator));
  if (!clean.length) return;

  const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
  const menu = document.createElement("nav");
  menu.className = "sbe-ctx";
  menu.innerHTML = clean.map((e, i) => e.separator
    ? `<hr class="sbe-ctx-sep">`
    : `<button type="button" class="sbe-ctx-item${e.disabled ? " is-disabled" : ""}" data-i="${i}"
         ${e.disabled ? `aria-disabled="true" data-tooltip-text="${esc(e.reason || "")}"` : ""}>
         ${iconHTML(e.icon)}<span class="sbe-ctx-label">${esc(e.label)}</span>
       </button>`).join("");
  document.body.appendChild(menu);

  /* Position : sous la souris, sans jamais sortir de l'écran. */
  const r = menu.getBoundingClientRect();
  const x = Math.min(event.clientX, window.innerWidth - r.width - 4);
  const y = Math.min(event.clientY, window.innerHeight - r.height - 4);
  menu.style.left = `${Math.max(4, x)}px`;
  menu.style.top = `${Math.max(4, y)}px`;

  menu.addEventListener("click", async (ev) => {
    const btn = ev.target.closest(".sbe-ctx-item");
    if (!btn) return;
    const entry = clean[Number(btn.dataset.i)];
    if (!entry || entry.disabled) return;   /* grisée : on ne fait rien */
    close();
    try { await entry.onClick?.(); }
    catch (err) { console.warn("SBE | Menu contextuel : action en échec", err); }
  });

  const listeners = [];
  const on = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); listeners.push([target, type, fn, opts]); };
  on(document, "pointerdown", (ev) => { if (!menu.contains(ev.target)) close(); }, true);
  on(document, "keydown", (ev) => { if (ev.key === "Escape") close(); }, true);
  on(window, "resize", close, false);
  on(document, "scroll", close, true);
  current = { el: menu, listeners };
}

export function closeContextMenu() { close(); }
