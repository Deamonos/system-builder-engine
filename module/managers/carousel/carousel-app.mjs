/**
 * SBE — CARROUSEL DE COMBAT : la bande des portraits
 *
 * Affiché pendant un combat de la scène vue. Le combattant actif est
 * toujours le premier (à gauche en haut de l'écran, en haut à droite de
 * l'écran) : c'est la liste qui tourne. Une marque « round suivant »
 * sépare ceux qui ont joué de ceux qui jouent ensuite. Le round est
 * au-dessus ; les boutons sont sous les portraits (en haut de l'écran,
 * dépliés au survol) ou en colonne à leur gauche (à droite de l'écran).
 *
 * Placement (refait à chaque changement de l'interface) :
 *   - en haut : de la navigation des scènes (ou de l'horloge, si elle est
 *     affichée dans la bande) jusqu'à la barre latérale de droite, calée à
 *     droite (ou à gauche, réglage) quand elle n'est pas pleine ;
 *   - à droite : collé à gauche de la colonne de droite, du haut de
 *     l'écran jusqu'en bas.
 * Trop de portraits : la bande défile (molette).
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { Identity } from "../../helpers/identity.mjs";
import { uiRect } from "../../helpers/ui-rect.mjs";
import { carouselSettings, carouselPosOf, carouselAnimates, visibleTo, clickAllowed, CAROUSEL_POS_SETTING } from "./carousel-model.mjs";
import { barValues } from "../bars/bar-render.mjs";
import { ruleActions } from "./carousel-rules.mjs";
import { docScope } from "../../builder/doc-context.mjs";
import { walkElements } from "../../builder/element-renderer.mjs";
import { openContextMenu } from "../../helpers/context-menu.mjs";
import { followInterfaceTheme } from "../../helpers/ui-theme.mjs";

const { ApplicationV2 } = foundry.applications.api;
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const GAP = 8;
/* Attitude du jeton → liseré du portrait (couleurs du thème). */
const DISPOSITION = { [-2]: "secret", [-1]: "hostile", 0: "neutral", 1: "friendly" };
/* Une icône du sélecteur : classe Font Awesome ou émoji. */
const iconHTML = (ic) => (String(ic).includes("fa-") ? `<i class="${esc(ic)}"></i>` : `<span>${esc(ic)}</span>`);
const isNum = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));

export class SBECarousel extends ApplicationV2 {

  static DEFAULT_OPTIONS = {
    id: "sbe-carousel",
    tag: "div",
    classes: ["sbe-carousel"],
    window: { frame: false, positioned: false }
  };

  static instance = null;

  /* APERÇU (visites guidées) : un combat d'exemple, jamais enregistré,
     montré même carrousel désactivé. */
  static #preview = null;

  /** Montre (ou retire, avec null) un combat d'exemple. */
  static setPreview(combat) {
    this.#preview = combat ?? null;
    this.refresh({ instant: true });
  }

  /** Le combat montré : l'aperçu, sinon celui de la scène vue. */
  static combat() { return this.#preview ?? game.combats?.viewed ?? null; }

  /** Le vrai combat de la scène vue (jamais l'aperçu). */
  static realCombat() { return game.combats?.viewed ?? null; }

  /**
   * Affiche, met à jour ou retire le carrousel selon le combat et les réglages.
   * @param {boolean} [o.instant] retiré sans animation (aperçu des visites :
   *   montré puis retiré aussitôt, la fermeture ne doit pas croiser un affichage)
   */
  static refresh({ instant = false } = {}) {
    const c = this.combat();
    const show = (carouselSettings().enabled || !!this.#preview) && !!c && c.combatants.size > 0;
    if (!show) { this.instance?.close(instant ? { animate: false } : {}); return; }
    this.instance ??= new SBECarousel();
    this.instance.render({ force: true });
  }

  static #frame = 0;

  /** Remet la bande à sa place (interface changée) ; une fois par image au plus. */
  static place() {
    if (this.#frame) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = 0;
      if (this.instance?.rendered) this.instance.place();
    });
  }

  /* ------------------------------------------------------------ */
  /*  Contenu                                                      */
  /* ------------------------------------------------------------ */

  /** Les combattants dans l'ordre du carrousel, actif en premier, et la place de la marque de round. */
  #order(combat) {
    const turns = combat.turns ?? [];
    const idx = combat.started && Number.isInteger(combat.turn) && combat.turn >= 0 ? combat.turn : 0;
    const list = [...turns.slice(idx), ...turns.slice(0, idx)];
    return { list, wrapAt: combat.started && idx > 0 ? turns.length - idx : -1 };
  }

  /**
   * Qui voit ce portrait : caché, vaincu (si le MJ les masque), masqué par
   * une règle, PNJ qui n'a pas encore joué (option) → invisible aux
   * joueurs, en transparence pour le MJ.
   */
  #visibility(c, cfg, combat) {
    const acts = ruleActions(c, cfg);
    const waiting = cfg.shown.untilTurn && !c.hasPlayerOwner && !this.#played(c, combat);
    const hidden = c.hidden || acts.has("hide") || (c.isDefeated && cfg.shown.defeated === "hide") || waiting;
    return { show: game.user.isGM || !hidden, faded: hidden };
  }

  /** Ce combattant a-t-il déjà joué (ou joue-t-il) ? */
  #played(c, combat) {
    if (!combat.started) return false;
    return combat.round > 1 || combat.turns.indexOf(c) <= (combat.turn ?? -1);
  }

  async _renderHTML() {
    const combat = SBECarousel.combat();
    if (!combat) return "";
    const cfg = carouselSettings();
    const isGM = game.user.isGM;
    const { list, wrapAt } = this.#order(combat);
    const activeId = combat.started ? combat.combatant?.id : null;
    /* Le prochain à jouer : le suivant de la liste (les vaincus sautés si
       le combat les saute). */
    const skip = !!combat.settings?.skipDefeated;
    const nextId = activeId ? (list.slice(1).find(c => !(skip && c.isDefeated))?.id ?? null) : null;
    let cards = "";
    let activeName = "";
    list.forEach((c, i) => {
      if (i === wrapAt) cards += `<div class="sbe-car-wrapmark" data-tooltip-text="${esc(L("SBE.Carousel.NextRound"))}"><span>${esc(L("SBE.Carousel.RoundN", { n: (combat.round || 0) + 1 }))}</span></div>`;
      const v = this.#visibility(c, cfg, combat);
      if (!v.show) return;
      if (c.id === activeId && (isGM || !v.faded)) activeName = Identity.of(c.token ?? c.actor)?.name ?? c.name;
      /* Après la marque de round : ils ont déjà joué ce round. */
      cards += this.#card(c, cfg, c.id === activeId, combat, v.faded, { next: c.id === nextId, played: wrapAt >= 0 && i >= wrapAt });
    });
    const btn = (act, icon, tip) => `<button type="button" data-car="${act}" data-tooltip-text="${esc(L(tip))}" aria-label="${esc(L(tip))}"><i class="fa-solid ${icon}"></i></button>`;
    const gm = !isGM ? "" : [
      cfg.buttons.gmInit ? `${btn("rollAll", "fa-users", "COMBAT.RollAll")}${btn("rollNPC", "fa-users-gear", "COMBAT.RollNPC")}${btn("reset", "fa-arrow-rotate-left", "COMBAT.InitiativeReset")}` : "",
      cfg.buttons.gmCombat ? (combat.started
        ? `${btn("prevRound", "fa-angles-left", "COMBAT.RoundPrev")}${btn("prevTurn", "fa-angle-left", "COMBAT.TurnPrev")}${btn("nextTurn", "fa-angle-right", "COMBAT.TurnNext")}${btn("nextRound", "fa-angles-right", "COMBAT.RoundNext")}${btn("end", "fa-flag-checkered", "COMBAT.End")}`
        : btn("start", "fa-play", "COMBAT.Begin")) : ""
    ].join("");
    const pos = carouselPosOf();
    const who = cfg.shown.roundName && activeName ? `<em>${esc(activeName)}</em>` : "";
    const round = combat.started ? `<span class="sbe-car-round"><b>${esc(L("SBE.Carousel.RoundN", { n: combat.round }))}</b>${who}</span>` : `<span class="sbe-car-round is-wait">${esc(L("SBE.Carousel.NotStarted"))}</span>`;
    const flip = btn("flip", pos === "top" ? "fa-arrows-up-down" : "fa-arrows-left-right", pos === "top" ? "SBE.Carousel.ToRight" : "SBE.Carousel.ToTop");
    /* En haut : le round au-dessus, les boutons sous les portraits (repliés,
       ils se déplient au survol du carrousel). À droite : le round
       au-dessus, les boutons en colonne à gauche des portraits. */
    return `<div class="sbe-car-wrap is-${pos} is-${cfg.shape}${isGM ? " is-gm" : ""}${carouselAnimates(cfg) ? " is-anim" : ""}${cfg.active.glow ? " is-glow" : ""}" style="--sbe-car-size:${cfg.size}px; --sbe-car-scale:${cfg.active.scale / 100}">
      ${round}
      <div class="sbe-car-main">
        <div class="sbe-car-track">${cards}</div>
        <div class="sbe-car-btns">${gm}${isGM ? btn("config", "fa-gear", "SBE.Carousel.OpenConfig") : ""}${flip}</div>
      </div>
    </div>`;
  }

  #card(c, cfg, active, combat, faded = false, mark = {}) {
    const isGM = game.user.isGM;
    const token = c.token ?? null;
    const shown = Identity.of(token ?? c.actor);
    const img = (cfg.img === "actor" ? c.actor?.img : token?.texture?.src) || c.img || c.actor?.img || "icons/svg/mystery-man.svg";
    const own = c.isOwner;
    const hasInit = isNum(c.initiative);
    /* Initiative des PNJ cachée aux joueurs (option). */
    const initShown = isGM || c.hasPlayerOwner || cfg.shown.npcInit;
    const initTxt = !hasInit ? "—" : initShown ? esc(Math.round(Number(c.initiative) * 100) / 100) : "?";
    const init = cfg.show.init ? `<span class="sbe-car-init">${initTxt}</span>` : "";
    const name = cfg.show.name ? `<span class="sbe-car-name">${esc(shown?.name ?? c.name)}</span>` : "";
    /* Boutons du joueur sur SON portrait (le MJ les a sur tous). */
    let acts = "";
    if (!hasInit && own && (isGM || cfg.buttons.playerInit)) {
      acts += `<button type="button" data-car="rollOne" data-tooltip-text="${esc(L("COMBAT.InitiativeRoll"))}"><i class="fa-solid fa-dice-d20"></i></button>`;
    }
    if (active && own && !isGM && cfg.buttons.playerEnd) {
      acts += `<button type="button" data-car="endTurn" data-tooltip-text="${esc(L("SBE.Carousel.EndTurn"))}"><i class="fa-solid fa-forward-step"></i></button>`;
    }
    /* Barres (clés ou formules) et effets, selon qui peut les voir. */
    let scope = null;
    const scopeOf = () => (scope ??= this.#scope(c.actor));
    const gauges = !c.actor ? "" : cfg.bars.filter(b => visibleTo(b.vis, c)).map(b => {
      let v = null;
      try { v = barValues({ value: b.value, max: b.max, min: "" }, c.actor, scopeOf()); } catch (_e) { v = null; }
      if (!v) return "";
      const txt = b.text === "never" ? "" : `<span>${esc(v.value)} / ${esc(v.max)}</span>`;
      return `<div class="sbe-car-gauge${txt ? ` is-text-${b.text}` : ""}" style="--bar-c:${esc(b.color)}"><i style="width:${Math.round(v.pct * 100)}%"></i>${txt}</div>`;
    }).join("");
    const fx = cfg.effects.on && c.actor && visibleTo(cfg.effects.vis, c) ? SBECarousel.effectsOf(c.actor) : [];
    const fxHtml = fx.length ? `<div class="sbe-car-fx">${fx.slice(0, cfg.effects.max).map(e => `<span class="sbe-car-fxi" style="background-image:url('${esc(e.img)}')"></span>`).join("")}${fx.length > cfg.effects.max ? `<span class="sbe-car-fxmore">+${fx.length - cfg.effects.max}</span>` : ""}</div>` : "";
    const disp = DISPOSITION[token?.disposition] ?? "neutral";
    const next = mark.next && cfg.marks.next;
    const cls = ["sbe-car-p", active ? "is-active" : "", c.isDefeated ? "is-defeated" : "", faded ? "is-hidden" : "",
      next ? "is-next" : "", mark.played && cfg.marks.played && !active ? "is-played" : "",
      c.hasPlayerOwner ? "is-pc" : "is-npc", `is-${disp}`].filter(Boolean).join(" ");
    /* Info-bulle : construite ici, affichée par Foundry au survol. */
    const tip = cfg.tooltip.on && visibleTo(cfg.tooltip.vis, c)
      ? ` data-tooltip-html="${esc(this.#tipHTML(c, cfg, { img, disp, init: hasInit && cfg.show.init ? initTxt : "" }))}" data-tooltip-class="sbe-car-tipbox" data-tooltip-direction="${carouselPosOf() === "top" ? "DOWN" : "LEFT"}"` : "";
    /* Icônes du vaincu et de « Suivant » : le SVG du thème avancé (montré par le
       thème quand il en a un, à la place de l'icône choisie). */
    const defeat = c.isDefeated ? `<span class="sbe-car-defmark"><span class="sbe-car-svgic is-defeat"></span>${cfg.marks.defeatIcon ? iconHTML(cfg.marks.defeatIcon) : ""}</span>` : "";
    return `<div class="${cls}" data-cid="${esc(c.id)}"${tip}>
      <div class="sbe-car-img" style="background-image:url('${esc(img)}')"></div>
      <div class="sbe-car-shade"></div>${defeat}
      ${next ? `<span class="sbe-car-nexttag"><span class="sbe-car-svgic is-next"></span>${esc(L("SBE.Carousel.NextTag"))}</span>` : ""}
      ${init}${acts ? `<div class="sbe-car-acts">${acts}</div>` : ""}${fxHtml}
      <div class="sbe-car-foot">${gauges ? `<div class="sbe-car-gauges">${gauges}</div>` : ""}${name}</div>
    </div>`;
  }

  #scope(actor) {
    try { return docScope(actor); } catch (_e) { return { ...(actor?.system?.values ?? {}) }; }
  }

  /** Les effets actifs d'un personnage (icône, nom, rounds restants, description). */
  static effectsOf(actor) {
    const list = [...(actor?.appliedEffects ?? actor?.effects ?? [])].filter(e => e?.img && !e.disabled);
    return list.map(e => {
      const raw = e.duration?.remaining;
      const r = Number(raw);
      return { img: e.img, name: e.name, left: raw != null && Number.isFinite(r) && r > 0 ? Math.ceil(r) : 0, perm: raw == null, desc: e.description ?? "" };
    });
  }

  /* ------------------------------------------------------------ */
  /*  Info-bulle                                                   */
  /* ------------------------------------------------------------ */

  #tipHTML(c, cfg, info = {}) {
    const t = cfg.tooltip;
    const shown = Identity.of(c.token ?? c.actor);
    const name = esc(shown?.name ?? c.name);
    /* En-tête : mini portrait, nom, attitude (liseré) et initiative. */
    let html = !t.header ? `<div class="sbe-car-tip-name">${name}</div>`
      : `<div class="sbe-car-tip-h is-${esc(info.disp ?? "neutral")}">
          ${info.img ? `<span class="sbe-car-tip-mini" style="background-image:url('${esc(info.img)}')"></span>` : ""}
          <div><b class="sbe-car-tip-name">${name}</b><small>${esc(L(`SBE.Carousel.Disp_${info.disp ?? "neutral"}`))}${info.init ? ` · ${esc(L("SBE.Carousel.TipInit", { n: info.init }))}` : ""}</small></div>
        </div>`;
    let body = "";
    if (c.actor && t.keys.length) {
      const scope = this.#scope(c.actor);
      const rows = t.keys.map(k => {
        /* Une barre du carrousel sur la même clé : son maximum et sa couleur. */
        const bar = cfg.bars.find(b => b.value === k.key);
        const color = bar?.color;
        let v = null;
        try { v = barValues({ value: k.key, max: bar?.max ?? "", min: "" }, c.actor, scope); } catch (_e) { v = null; }
        const val = v ? `${v.value} / ${v.max}` : (scope[k.key] ?? "—");
        const el = k.label ? null : [...walkElements(c.actor.system?.template?.system?.elements ?? [])].find(e => e?.key === k.key);
        /* Une valeur qui a un maximum : sa mini-barre. */
        const meter = t.meters && v ? `<span class="sbe-car-tip-meter"${color ? ` style="--bar-c:${esc(color)}"` : ""}><i style="width:${Math.round(v.pct * 100)}%"></i></span>` : "";
        return `<div class="sbe-car-tip-row"><span>${esc(k.label || el?.label || k.key)}</span><b>${esc(val)}</b>${meter}</div>`;
      }).join("");
      body += `<div class="sbe-car-tip-keys">${rows}</div>`;
    }
    if (c.actor && t.effects) {
      const fx = SBECarousel.effectsOf(c.actor);
      if (fx.length) {
        body += `<div class="sbe-car-tip-fx">${fx.map(e => {
          const d = t.desc ? String(e.desc).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180) : "";
          const left = !t.durations ? "" : e.left ? L("SBE.Carousel.RoundsLeft", { n: e.left }) : e.perm ? L("SBE.Carousel.Permanent") : "";
          return `<div class="sbe-car-tip-e"><img src="${esc(e.img)}" alt=""><div class="sbe-car-tip-en"><b>${esc(e.name)}</b>${d ? `<p>${esc(d)}</p>` : ""}</div>${left ? `<small>${esc(left)}</small>` : ""}</div>`;
        }).join("")}</div>`;
      }
    }
    if (body) html += `<div class="sbe-car-tip-b">${body}</div>`;
    return `<div class="sbe-car-tip${t.header ? " has-head" : ""}">${html}</div>`;
  }

  /* ------------------------------------------------------------ */
  /*  Portraits : clic, double-clic, survol, menu du MJ            */
  /* ------------------------------------------------------------ */

  #tokenOf(c) {
    const t = c?.token?.object;
    return t && t.scene === canvas.scene ? t : null;
  }

  #pan(c) {
    const t = this.#tokenOf(c);
    if (!t || !clickAllowed(carouselSettings().clicks.pan)) return;
    if (!t.visible && !game.user.isGM) return;
    canvas.animatePan({ x: t.center.x, y: t.center.y, duration: 250 });
    if (t.isOwner) t.control({ releaseOthers: true });
  }

  #hover(c, on) {
    const t = this.#tokenOf(c);
    if (!t || !clickAllowed(carouselSettings().clicks.hover)) return;
    if (!t.visible && !game.user.isGM) return;
    try { on ? t._onHoverIn(new Event("pointerenter"), { hoverOutOthers: true }) : t._onHoverOut(new Event("pointerleave")); } catch (_e) { /* jeton redessiné */ }
  }

  #menu(ev, c, combat) {
    const t = this.#tokenOf(c);
    const idx = combat.turns.findIndex(x => x.id === c.id);
    openContextMenu(ev, [
      combat.started && idx >= 0 && combat.turn !== idx ? { label: L("SBE.Carousel.MakeActive"), icon: "fa-solid fa-play", onClick: () => combat.update({ turn: idx }) } : null,
      { label: L(c.hidden ? "SBE.Carousel.Show" : "SBE.Carousel.Hide"), icon: `fa-solid ${c.hidden ? "fa-eye" : "fa-eye-slash"}`, onClick: () => c.update({ hidden: !c.hidden }) },
      { label: L(c.isDefeated ? "SBE.Carousel.Revive" : "SBE.Carousel.Defeat"), icon: "fa-solid fa-skull", onClick: () => c.update({ defeated: !c.isDefeated }) },
      t ? { label: L("SBE.Carousel.Ping"), icon: "fa-solid fa-bullseye", onClick: () => canvas.ping(t.center) } : null,
      { label: L("SBE.Carousel.Remove"), icon: "fa-solid fa-user-minus", onClick: () => c.delete() }
    ]);
  }

  _replaceHTML(result, content) {
    const track = content.querySelector(".sbe-car-track");
    const keep = track ? [track.scrollLeft, track.scrollTop] : [0, 0];
    /* Où était chaque portrait : il glisse jusqu'à sa nouvelle place. */
    const before = new Map([...content.querySelectorAll("[data-cid]")].map(e => [e.dataset.cid, e.getBoundingClientRect()]));
    const wasActive = content.querySelector(".sbe-car-p.is-active")?.dataset.cid ?? null;
    const wasRound = content.querySelector(".sbe-car-round")?.textContent ?? "";
    content.innerHTML = result;
    const t = content.querySelector(".sbe-car-track");
    if (t) { t.scrollLeft = keep[0]; t.scrollTop = keep[1]; }
    if (!before.size || !carouselAnimates()) return;
    /* Toutes les mesures d'abord, les animations ensuite : mesurer
       entre deux animations referait la mise en page à chaque portrait. */
    const cards = [...content.querySelectorAll("[data-cid]")].map(e => [e, before.has(e.dataset.cid) ? e.getBoundingClientRect() : null]);
    for (const [e, now] of cards) {
      const was = before.get(e.dataset.cid);
      if (!was) { e.animate([{ opacity: 0, transform: "scale(0.8)" }, { opacity: 1, transform: "none" }], { duration: 250, easing: "ease-out" }); continue; }
      const dx = was.left - now.left, dy = was.top - now.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      e.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 350, easing: "cubic-bezier(.2,.7,.2,1)" });
    }
    /* Au suivant : le nouveau combattant actif « saute » et s'illumine. */
    const act = content.querySelector(".sbe-car-p.is-active");
    if (act && wasActive && act.dataset.cid !== wasActive) {
      act.animate([{ transform: "scale(0.85)" }, { transform: "scale(1.08)", offset: 0.6 }, { transform: "scale(1)" }],
        { duration: 450, easing: "ease-out", composite: "add" });
      act.querySelector(".sbe-car-img")?.animate([{ filter: "brightness(1.8)" }, { filter: "brightness(1)" }], { duration: 600, easing: "ease-out" });
      act.insertAdjacentHTML("beforeend", `<div class="sbe-car-sweep"></div>`);
      const sw = act.lastElementChild;
      sw.animate([{ transform: "translateX(-120%) skewX(-20deg)" }, { transform: "translateX(220%) skewX(-20deg)" }], { duration: 700, easing: "ease-in-out", fill: "forwards" });
      /* Retiré à coup sûr, même si l'onglet ralentit les animations. */
      setTimeout(() => sw.remove(), 800);
    }
    /* Nouveau round : la pastille du round pulse. */
    const rd = content.querySelector(".sbe-car-round");
    if (rd && wasRound && rd.textContent !== wasRound) {
      rd.animate([{ transform: "scale(1)" }, { transform: "scale(1.25)" }, { transform: "scale(1)" }], { duration: 500, easing: "ease-out" });
    }
  }

  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    followInterfaceTheme(this.element);
    this.element.addEventListener("click", (ev) => this.#onClick(ev));
    const cardOf = (ev) => (ev.target.closest("[data-car]") ? null : ev.target.closest(".sbe-car-p[data-cid]"));
    const combatantOf = (card) => SBECarousel.combat()?.combatants.get(card?.dataset.cid ?? "") ?? null;
    this.element.addEventListener("click", (ev) => { const card = cardOf(ev); if (card) this.#pan(combatantOf(card)); });
    this.element.addEventListener("dblclick", (ev) => {
      const c = combatantOf(cardOf(ev));
      if (c?.actor && carouselSettings().clicks.sheet && c.actor.testUserPermission(game.user, "OBSERVER")) c.actor.sheet?.render(true);
    });
    this.element.addEventListener("contextmenu", (ev) => {
      const c = combatantOf(cardOf(ev));
      if (c && game.user.isGM && SBECarousel.combat()?.id) this.#menu(ev, c, SBECarousel.combat());
    });
    /* Survol : le jeton s'allume (l'info-bulle est celle de Foundry). */
    this.element.addEventListener("pointerover", (ev) => {
      const card = ev.target.closest(".sbe-car-p[data-cid]");
      if (!card || card.contains(ev.relatedTarget)) return;
      this.#hover(combatantOf(card), true);
    });
    this.element.addEventListener("pointerout", (ev) => {
      const card = ev.target.closest(".sbe-car-p[data-cid]");
      if (!card || card.contains(ev.relatedTarget)) return;
      this.#hover(combatantOf(card), false);
    });
    /* Molette : la bande horizontale défile de côté. */
    this.element.addEventListener("wheel", (ev) => {
      const t = ev.target.closest(".sbe-car-track");
      if (!t || carouselPosOf() !== "top" || t.scrollWidth <= t.clientWidth) return;
      ev.preventDefault();
      t.scrollLeft += ev.deltaY || ev.deltaX;
    }, { passive: false });
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    this.place();
  }

  /* ------------------------------------------------------------ */
  /*  Placement                                                    */
  /* ------------------------------------------------------------ */

  place() {
    const el = this.element;
    if (!el) return;
    const pos = carouselPosOf();
    /* La colonne de droite (barre latérale, ouverte ou repliée). */
    const right = uiRect("#sidebar")?.left ?? window.innerWidth;
    const nav = uiRect("#scene-navigation");
    /* Collé en haut de l'écran (la pastille du round prend le moins de place possible). */
    const top = GAP / 2;
    /* L'horloge, si elle est affichée. */
    const clockEl = document.getElementById("sbe-clock");
    const ckBox = clockEl ? (clockEl.querySelector(".sbe-ck") ?? clockEl).getBoundingClientRect() : null;
    const ck = ckBox?.width && ckBox.height ? ckBox : null;
    const st = el.style;
    st.position = "fixed";
    if (pos === "top") {
      let left = (nav?.right ?? uiRect("#ui-left")?.right ?? 0) + GAP * 2;
      /* L'horloge dans la bande du haut : on commence après elle. */
      if (ck && ck.top < top + 40 && ck.right > left - GAP && ck.left < right) left = ck.right + GAP;
      /* Bande pas pleine : calée à droite (contre la barre latérale) ou à gauche, selon le MJ. */
      const atEnd = carouselSettings().align === "end";
      Object.assign(st, { left: atEnd ? "auto" : `${Math.round(left)}px`, right: atEnd ? `${Math.round(window.innerWidth - right + GAP)}px` : "auto",
        top: `${Math.round(top)}px`, bottom: "auto",
        maxWidth: `${Math.max(120, Math.round(right - GAP - left))}px`, maxHeight: "", width: "auto", height: "auto" });
    } else {
      let y = top;
      /* L'horloge posée dans la bande de droite : on passe dessous. */
      if (ck && ck.right > right - 200 && ck.left < right && ck.top < top + 40) y = ck.bottom + GAP;
      Object.assign(st, { left: "auto", right: `${Math.round(window.innerWidth - right + GAP)}px`, top: `${Math.round(y)}px`, bottom: "auto",
        maxHeight: `${Math.max(120, Math.round(window.innerHeight - y - GAP * 2))}px`, maxWidth: "", width: "auto", height: "auto" });
    }
  }

  /* ------------------------------------------------------------ */
  /*  Actions                                                      */
  /* ------------------------------------------------------------ */

  async #onClick(ev) {
    const b = ev.target.closest("[data-car]");
    if (!b) return;
    ev.preventDefault();
    ev.stopPropagation();
    const combat = SBECarousel.combat();
    if (!combat) return;
    /* Aperçu : rien à modifier (le combat d'exemple n'existe pas). */
    if (!combat.id && b.dataset.car !== "flip") return;
    const c = combat.combatants.get(b.closest("[data-cid]")?.dataset.cid ?? "");
    switch (b.dataset.car) {
      case "flip": {
        const next = carouselPosOf() === "top" ? "right" : "top";
        await game.settings.set(SYSTEM_ID, CAROUSEL_POS_SETTING, next);
        return this.render();
      }
      case "rollOne": return c ? combat.rollInitiative([c.id]) : null;
      case "endTurn": return c && combat.combatant?.id === c.id && c.isOwner ? combat.nextTurn() : null;
    }
    if (!game.user.isGM) return;
    switch (b.dataset.car) {
      case "config": {
        /* Les réglages du carrousel (menu des paramètres du système). */
        const Menu = game.settings.menus.get(`${SYSTEM_ID}.carouselMenu`)?.type;
        return Menu ? new Menu().render({ force: true }) : null;
      }
      case "rollAll": return combat.rollAll();
      case "rollNPC": return combat.rollNPC();
      case "reset": return combat.resetAll();
      case "start": return combat.startCombat();
      case "end": return combat.endCombat();
      case "prevRound": return combat.previousRound();
      case "prevTurn": return combat.previousTurn();
      case "nextTurn": return combat.nextTurn();
      case "nextRound": return combat.nextRound();
    }
  }

  async _onClose(options) {
    if (SBECarousel.instance === this) SBECarousel.instance = null;
    return super._onClose?.(options);
  }
}
