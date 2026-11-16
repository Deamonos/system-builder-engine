/**
 * SBE — Digicode (ApplicationV2 sans cadre)
 *
 * Boîtier de saisie de code à pavé numérique, repris du premier
 * système du même auteur (transposé tel quel, classes renommées) :
 * boîtier métal flottant avec vis d'angle, afficheur 7 segments,
 * croix de fermeture intégrée, déplaçable à la souris, saisie
 * clavier physique, et plaque de piratage optionnelle qui se
 * dévisse au survol pour révéler un circuit imprimé.
 *
 * Classe totalement agnostique : toute la logique (vérification du
 * code, piratage, alarme, rupture) est pilotée par les callbacks
 * passés au constructeur : { length, hackable, expected, onValidate,
 * onHack, onClose }. Utilisée par les coffres ET les portes.
 */

const { ApplicationV2 } = foundry.applications.api;

export class SBEDigicodeApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "sbe-digicode-{id}",
    classes: ["sbe-digicode-app"],
    window: { frame: false, positioned: true },
    position: { width: 300, height: "auto" }
  };

  constructor(config = {}) {
    super(config);
    this._cfg = config;
    this._entered = "";
    this._keyHandler = null;
    this._dragging = null;
  }

  async _renderHTML() {
    const { length = 4, hackable = false } = this._cfg;
    const wrap = document.createElement("div");

    /* Vis d'angle SVG, chacune avec une rotation de fente différente. */
    const screw = (rot) => `<svg class="sbe-digicode-screw" viewBox="0 0 14 14" aria-hidden="true"><g transform="rotate(${rot} 7 7)"><circle cx="7" cy="7" r="6" fill="url(#sbeDigiScrew)" stroke="#4a4f55" stroke-width="1"/><circle cx="7" cy="7" r="6" fill="none" stroke="#fff" stroke-width="0.5" opacity="0.4"/><path d="M3 7 h8" stroke="#2b3036" stroke-width="1.5" stroke-linecap="round"/></g></svg>`;

    /* Touche piratage : plaque métallique vissée qui se dévisse au
       survol et révèle un PCB (pur CSS + SVG, voir locks.css). */
    const hackKey = hackable ? `
        <button type="button" class="sbe-digicode-hack" data-hack aria-label="${game.i18n.localize("SBE.Locks.HackButton")}">
          <svg class="sbe-hack-svg" viewBox="0 0 248 46" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
            <defs>
              <radialGradient id="sbeDigiScrew" cx="36%" cy="32%" r="72%">
                <stop offset="0" stop-color="#e0e3e6"/><stop offset="0.5" stop-color="#a8adb3"/><stop offset="1" stop-color="#6e747a"/>
              </radialGradient>
              <linearGradient id="sbeHackBrush" x1="0" y1="0" x2="0.9" y2="1">
                <stop offset="0" stop-color="#8b9197"/><stop offset="0.1" stop-color="#c8ccd0"/><stop offset="0.22" stop-color="#9ba1a7"/>
                <stop offset="0.34" stop-color="#dee1e4"/><stop offset="0.46" stop-color="#a8adb3"/><stop offset="0.58" stop-color="#d2d6d9"/>
                <stop offset="0.7" stop-color="#9da3a9"/><stop offset="0.82" stop-color="#dcdfe2"/><stop offset="0.92" stop-color="#a0a6ac"/><stop offset="1" stop-color="#888e94"/>
              </linearGradient>
              <pattern id="sbeHackTex" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
                <line x1="0.5" y1="0" x2="0.5" y2="7" stroke="#ffffff" stroke-width="0.6" opacity="0.28"/>
                <line x1="2.3" y1="0" x2="2.3" y2="7" stroke="#565b61" stroke-width="0.5" opacity="0.26"/>
                <line x1="4.5" y1="0" x2="4.5" y2="7" stroke="#ffffff" stroke-width="0.4" opacity="0.16"/>
                <line x1="5.8" y1="0" x2="5.8" y2="7" stroke="#4a4f55" stroke-width="0.4" opacity="0.20"/>
              </pattern>
            </defs>

            <!-- PCB révélé au survol (via CSS) -->
            <g class="sbe-hack-pcb">
              <rect x="1" y="1" width="246" height="44" rx="6" fill="#0c1a10" stroke="#15171a" stroke-width="1.4"/>
              <g stroke="#1c6b3f" stroke-width="1.3" fill="none" opacity="0.9">
                <path d="M34 12 h14 v8 h26"/><path d="M34 30 h6 v10 h40"/><path d="M150 40 v-14 h26 v-10"/><path d="M205 36 h-30 v-20"/><path d="M46 42 h44 v-6"/>
              </g>
              <g fill="#2a8f56">
                <circle cx="48" cy="12" r="2.2"/><circle cx="72" cy="20" r="2.2"/><circle cx="80" cy="40" r="2.2"/><circle cx="150" cy="40" r="2.2"/><circle cx="176" cy="16" r="2.2"/><circle cx="205" cy="36" r="2.2"/><circle cx="90" cy="36" r="2.2"/>
              </g>
              <rect x="112" y="16" width="24" height="14" rx="1.5" fill="#111" stroke="#333" stroke-width="1"/>
              <g stroke="#777" stroke-width="1.3"><path d="M112 20 h-4 M112 24 h-4 M112 28 h-4 M136 20 h4 M136 24 h4 M136 28 h4"/></g>
              <rect x="52" y="30" width="13" height="9" rx="1" fill="#c9772a" stroke="#7a4713" stroke-width="1"/>
              <rect x="184" y="20" width="9" height="13" rx="1" fill="#2a4fa0" stroke="#16285a" stroke-width="1"/>
              <g><circle cx="17" cy="23" r="6.5" fill="#02120a" stroke="#0a3020" stroke-width="1.5"/><circle cx="17" cy="23" r="6.5" fill="none" stroke="#000" stroke-width="1" opacity="0.6"/><circle cx="15.5" cy="21.5" r="1.6" fill="#1c6b3f" opacity="0.5"/></g>
              <circle cx="34" cy="34" r="3" fill="#8a9097" stroke="#3a3f45" stroke-width="1"/><circle cx="34" cy="34" r="1.2" fill="#2b3036"/>
              <circle cx="44" cy="36" r="3" fill="#8a9097" stroke="#3a3f45" stroke-width="1"/><circle cx="44" cy="36" r="1.2" fill="#2b3036"/>
              <g stroke-linecap="round" fill="none">
                <path d="M34 34 q-10 40 -4 80 q4 40 -2 78" stroke="#b23030" stroke-width="2.6"/>
                <path d="M44 36 q6 42 0 84 q-4 36 2 74" stroke="#c9a030" stroke-width="2.6"/>
              </g>
            </g>

            <!-- Plaque : pivot = la vis droite (231,23), contenu en
                 coordonnées relatives au pivot. -->
            <g transform="translate(231,23)">
              <g class="sbe-hack-plate">
                <rect x="-230" y="-22" width="246" height="44" rx="6" fill="url(#sbeHackBrush)" stroke="#565b61" stroke-width="1.4"/>
                <rect x="-230" y="-22" width="246" height="44" rx="6" fill="url(#sbeHackTex)"/>
                <rect x="-229" y="-21" width="244" height="10" rx="5" fill="#ffffff" opacity="0.22"/>
                <g class="sbe-hack-plate-screwL"><circle cx="-214" cy="0" r="5.2" fill="url(#sbeDigiScrew)" stroke="#4a4f55" stroke-width="1.1"/><g transform="rotate(24 -214 0)"><path d="M-218 0 h8" stroke="#2b3036" stroke-width="1.5"/></g></g>
                <g class="sbe-hack-plate-hole"><circle cx="-214" cy="0" r="5.5" fill="#0a0d10" stroke="#05070a" stroke-width="1.1"/><circle cx="-214" cy="0" r="2.4" fill="#1a1f24"/></g>
                <g><circle cx="0" cy="0" r="5.2" fill="url(#sbeDigiScrew)" stroke="#4a4f55" stroke-width="1.1"/><g transform="rotate(-58 0 0)"><path d="M-4 0 h8" stroke="#2b3036" stroke-width="1.5"/></g></g>
                <g class="sbe-hack-label">
                  <g fill="none" stroke="#2b3036" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" transform="translate(-151,-10)">
                    <rect x="0" y="8" width="17" height="12" rx="2"/><path d="M8.5 8 v-4 M4.5 4 h8 M4.5 2 a4 4 0 0 1 8 0"/>
                  </g>
                  <text x="-125" y="4" font-size="14" font-weight="700" letter-spacing="1" fill="#2b3036">${game.i18n.localize("SBE.Locks.HackButton").toUpperCase()}</text>
                </g>
              </g>
            </g>
          </svg>
        </button>` : "";

    wrap.innerHTML = `
      <div class="sbe-digicode" data-drag-root>
        ${screw(28)}${screw(-52)}${screw(72)}${screw(-15)}
        <button type="button" class="sbe-digicode-close" data-close title="${game.i18n.localize("SBE.Common.Close")}">
          <i class="fa-solid fa-xmark"></i>
        </button>
        <div class="sbe-digicode-screen" data-screen>${"_".repeat(length)}</div>
        <div class="sbe-digicode-pad">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button type="button" class="sbe-digicode-key" data-key="${n}">${n}</button>`).join("")}
          <button type="button" class="sbe-digicode-key sbe-digicode-clear" data-clear><i class="fa-solid fa-delete-left"></i></button>
          <button type="button" class="sbe-digicode-key" data-key="0">0</button>
          <button type="button" class="sbe-digicode-key sbe-digicode-enter" data-enter><i class="fa-solid fa-check"></i></button>
        </div>
        ${hackKey}
      </div>`;
    return wrap.firstElementChild;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
    return content;
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const el = this.element;
    const { length = 4 } = this._cfg;
    const screen = el.querySelector("[data-screen]");

    const refresh = () => { screen.textContent = this._entered.padEnd(length, "_").slice(0, length); };

    /* Un code refusé fait clignoter l'afficheur en rouge, puis le code
       se réinitialise après 3 s — sauf si le joueur retape un chiffre
       entre-temps (ce qui annule le reset et efface l'erreur). */
    this._clearErr = () => {
      if (this._errTimer) { clearTimeout(this._errTimer); this._errTimer = null; }
      screen.classList.remove("sbe-digicode-screen--err");
    };
    const setMsg = (_txt, ok) => {
      if (ok) { this._clearErr(); return; }
      this._clearErr();
      screen.classList.add("sbe-digicode-screen--err");
      this._errTimer = setTimeout(() => {
        this._clearErr();
        this._entered = ""; refresh();
      }, 3000);
    };
    this._setMsg = setMsg;

    const pressDigit = (d) => {
      if (this._errTimer) {
        this._clearErr();
        this._entered = "";
      }
      if (this._entered.length >= length) return;
      this._entered += d; refresh();
      /* Pas de validation auto : le joueur confirme lui-même (✓/Entrée). */
    };
    const backspace = () => {
      if (this._errTimer) { this._clearErr(); this._entered = ""; }
      this._entered = this._entered.slice(0, -1); refresh();
    };

    el.querySelectorAll("[data-key]").forEach(btn => {
      btn.addEventListener("click", () => pressDigit(btn.dataset.key));
    });
    el.querySelector("[data-clear]")?.addEventListener("click", backspace);
    el.querySelector("[data-enter]")?.addEventListener("click", () => this._validate());
    el.querySelector("[data-close]")?.addEventListener("click", () => this.close({ animate: false }));
    el.querySelector("[data-hack]")?.addEventListener("click", () => this._doHack());

    this._validate = async () => {
      const entered = this._entered;
      const ok = await this._cfg.onValidate?.(entered);
      if (ok === true) { this._clearErr?.(); this._entered = ""; refresh(); }
    };
    this._doHack = async () => {
      await this._cfg.onHack?.();
    };

    /* Saisie clavier physique. */
    this._keyHandler = (ev) => {
      if (ev.key >= "0" && ev.key <= "9") { ev.preventDefault(); pressDigit(ev.key); }
      else if (ev.key === "Backspace") { ev.preventDefault(); backspace(); }
      else if (ev.key === "Enter") { ev.preventDefault(); this._validate(); }
      else if (ev.key === "Escape") { ev.preventDefault(); this.close({ animate: false }); }
    };
    document.addEventListener("keydown", this._keyHandler, true);

    this._enableDrag(el);

    /* Centrage une fois le boîtier dimensionné (frame:false). */
    const center = () => {
      const w = el.offsetWidth || 300;
      const h = el.offsetHeight || 360;
      this.setPosition({
        left: Math.max(0, (window.innerWidth - w) / 2),
        top: Math.max(0, (window.innerHeight - h) / 2)
      });
    };
    requestAnimationFrame(() => requestAnimationFrame(center));
  }

  _enableDrag(el) {
    const root = el.querySelector("[data-drag-root]") ?? el;
    const onDown = (ev) => {
      if (ev.target.closest("button")) return;
      this._dragging = {
        sx: ev.clientX, sy: ev.clientY,
        left: this.position.left, top: this.position.top
      };
      ev.preventDefault();
    };
    const onMove = (ev) => {
      if (!this._dragging) return;
      const dx = ev.clientX - this._dragging.sx;
      const dy = ev.clientY - this._dragging.sy;
      this.setPosition({ left: this._dragging.left + dx, top: this._dragging.top + dy });
    };
    const onUp = () => { this._dragging = null; };
    root.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    this._dragCleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    root.style.cursor = "move";
  }

  async close(options) {
    if (this._keyHandler) document.removeEventListener("keydown", this._keyHandler, true);
    this._dragCleanup?.();
    this._cfg.onClose?.();
    return super.close(options);
  }
}
