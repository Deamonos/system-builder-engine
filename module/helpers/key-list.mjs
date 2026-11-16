/**
 * SBE — Liste de clés proposées sous un champ (remplace la liste native
 * du navigateur, qui n'a ni barre de défilement ni thème).
 *
 * Un champ <input list="…"> dont la <datalist> est dans la même fenêtre
 * devient une liste SBE : filtrée à la frappe (clé ou libellé), avec une
 * barre de défilement, aux couleurs du thème (clair / sombre), au clavier
 * (flèches, Entrée, Échap). Choisir une clé écrit le champ et déclenche
 * « change » comme une saisie normale.
 *
 * Une seule liste ouverte à la fois, rangée dans <body> (jamais coupée
 * par une zone qui défile), retirée à la fermeture.
 */

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
let open = null;

function close() {
  if (!open) return;
  open.pop.remove();
  window.removeEventListener("scroll", open.place, true);
  window.removeEventListener("resize", open.place);
  open = null;
}

function show(input) {
  const opts = JSON.parse(input.dataset.sbeList || "[]");
  const q = input.value.trim().toLowerCase();
  /* Valeur déjà exacte : toute la liste (on veut peut-être changer). */
  const exact = opts.some(o => o.value.toLowerCase() === q);
  const list = !q || exact ? opts : opts.filter(o => o.value.toLowerCase().includes(q) || o.label.toLowerCase().includes(q));
  if (!list.length) { close(); return; }
  if (open?.input !== input) {
    close();
    const pop = document.createElement("div");
    pop.className = "sbe-keylist";
    document.body.appendChild(pop);
    const place = () => {
      const r = input.getBoundingClientRect();
      const below = window.innerHeight - r.bottom;
      pop.style.left = `${Math.round(r.left)}px`;
      pop.style.minWidth = `${Math.max(220, Math.round(r.width))}px`;
      if (below < 180 && r.top > below) {
        pop.style.top = ""; pop.style.bottom = `${Math.round(window.innerHeight - r.top + 2)}px`;
        pop.style.maxHeight = `${Math.min(260, Math.round(r.top - 8))}px`;
      } else {
        pop.style.bottom = ""; pop.style.top = `${Math.round(r.bottom + 2)}px`;
        pop.style.maxHeight = `${Math.min(260, Math.round(below - 8))}px`;
      }
    };
    pop.addEventListener("mousedown", (ev) => {
      const row = ev.target.closest(".sbe-keylist-row");
      if (!row) return;
      ev.preventDefault();
      pick(input, row.dataset.value);
    });
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    open = { input, pop, place, idx: -1 };
  }
  open.items = list;
  open.idx = Math.min(open.idx, list.length - 1);
  open.pop.innerHTML = list.map((o, i) => `<div class="sbe-keylist-row ${i === open.idx ? "is-active" : ""}" data-value="${esc(o.value)}">
    <b>${esc(o.value)}</b>${o.label && o.label !== o.value ? `<span>${esc(o.label)}</span>` : ""}</div>`).join("");
  open.place();
}

function pick(input, value) {
  input.value = value;
  close();
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function move(step) {
  if (!open?.items?.length) return;
  open.idx = (open.idx + step + open.items.length) % open.items.length;
  const rows = open.pop.querySelectorAll(".sbe-keylist-row");
  rows.forEach((r, i) => r.classList.toggle("is-active", i === open.idx));
  rows[open.idx]?.scrollIntoView({ block: "nearest" });
}

/** Transforme les champs à liste d'une fenêtre (à appeler après chaque rendu). */
export function wireKeyLists(root) {
  if (!root) return;
  for (const input of root.querySelectorAll("input[list]")) {
    const dl = root.querySelector(`datalist#${CSS.escape(input.getAttribute("list"))}`);
    if (!dl) continue;
    const opts = [...dl.options].map(o => ({ value: o.value, label: o.label || o.textContent || "" })).filter(o => o.value);
    input.dataset.sbeList = JSON.stringify(opts);
    input.removeAttribute("list");
    input.setAttribute("autocomplete", "off");
    input.addEventListener("focus", () => show(input));
    input.addEventListener("click", () => show(input));
    input.addEventListener("input", () => { if (open?.input === input) open.idx = -1; show(input); });
    input.addEventListener("blur", () => setTimeout(() => { if (open?.input === input) close(); }, 120));
    input.addEventListener("keydown", (ev) => {
      if (open?.input !== input) return;
      if (ev.key === "ArrowDown") { ev.preventDefault(); move(1); }
      else if (ev.key === "ArrowUp") { ev.preventDefault(); move(-1); }
      else if (ev.key === "Enter" && open.idx >= 0) { ev.preventDefault(); pick(input, open.items[open.idx].value); }
      else if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); close(); }
    });
  }
}
