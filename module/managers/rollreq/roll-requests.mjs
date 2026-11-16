/**
 * SBE — DEMANDES DE JET (MJ)
 *
 * Comme l'ancien système. Le bouton dé du chat (MJ) ouvre la fenêtre
 * de demande, qui propose TOUS les jets des fiches : chaque champ à
 * jet des modèles de personnage (rien à préparer, rien de câblé — ni
 * « attributs », ni « talents », seulement les champs du MJ).
 *
 *  • SIMPLE — le MJ coche les personnages joueurs visés (ou tous) ;
 *    la carte « Lancer mon jet » est chuchotée à leurs joueurs, et le
 *    jet part sur le personnage visé (fenêtre de jet comprise).
 *
 *  • OPPOSITION — le MJ coche des pions de la scène (2 ou plus) ;
 *    facultatif : un champ du défenseur (Attaque contre Esquive) et la
 *    règle du vainqueur. Les PNJ sont lancés tout de suite ; chaque PJ
 *    lance depuis la carte. Une seule carte, avec chaque participant
 *    (2 colonnes si le MJ l'a choisi dans le manager des messages),
 *    réécrite à chaque jet reçu ; le verdict tombe quand tout le monde
 *    a lancé.
 *
 * Le MJ principal est l'autorité : un joueur lance chez lui, puis
 * envoie son résultat (données, jamais du HTML) ; le MJ réécrit la
 * carte.
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { onSocketMessage, isPrimaryGM, requestGM, gmQueue } from "../../helpers/socket.mjs";
import { walkElements } from "../../builder/element-renderer.mjs";
import { rollField } from "../../builder/field-roll.mjs";
import { ChatCards } from "../chat/chat-cards.mjs";

const SOCK = "sbeRollReq";
const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/** Règles du vainqueur d'une opposition. */
export const WIN_RULES = ["high", "low", "margin"];

export class RollRequests {

  /**
   * Tous les champs À JET des modèles de personnage (clé → libellé) :
   * c'est la liste de la fenêtre de demande.
   */
  static rollChoices() {
    const seen = new Map();
    for (const tpl of game.actors?.filter(a => a.type === "template") ?? []) {
      for (const el of walkElements(tpl.system?.elements ?? [])) {
        if (!el?.key || seen.has(el.key) || !el.config?.roll?.on) continue;
        seen.set(el.key, el.config.roll.label || el.label || el.key);
      }
    }
    return [...seen.entries()].map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));
  }

  static labelOf(key) {
    return this.rollChoices().find(c => c.key === key)?.label || key;
  }

  /** Les personnages joueurs (ceux qu'un joueur possède). */
  static playerCharacters() {
    return (game.actors?.contents ?? [])
      .filter(a => a.type !== "template" && a.hasPlayerOwner)
      .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
  }

  /* ============================================================ */
  /*  Branchements                                                 */
  /* ============================================================ */

  static init() {
    /* Bouton dé dans les contrôles du chat (MJ). */
    for (const h of ["renderChatLog", "renderChatInput", "renderSidebar", "changeSidebarTab", "collapseSidebar"]) {
      Hooks.on(h, () => this.#injectButton());
    }
    Hooks.once("ready", () => this.#injectWithRetry());

    /* Boutons des cartes, chez chaque client. */
    Hooks.on("renderChatMessageHTML", (message, html) => {
      try { this.#wire(message, html); }
      catch (err) { console.warn("SBE | Demande de jet : câblage en échec", err); }
    });

    /* Résultats d'opposition envoyés par les joueurs : le MJ principal
       les range dans la carte. */
    onSocketMessage(async (p) => {
      if (p?.type !== SOCK || p.op !== "result" || !isPrimaryGM()) return;
      await this.#applyResult(p.messageId, p.pid, p.res, p._from);
    });
  }

  static #injectWithRetry(tries = 0) {
    if (this.#injectButton()) return;
    if (tries < 25) setTimeout(() => this.#injectWithRetry(tries + 1), 300);
  }

  /** @returns {boolean} plus rien à faire */
  static #injectButton() {
    if (!game.user?.isGM) return true;
    const controls = document.querySelector("#chat-controls");
    if (!controls) return false;
    if (controls.querySelector('[data-action="sbe-roll-request"]')) return true;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ui-control icon fa-solid fa-dice-d20";
    btn.dataset.action = "sbe-roll-request";
    btn.dataset.tooltip = L("SBE.RollReq.Title");
    btn.setAttribute("aria-label", L("SBE.RollReq.Title"));
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this.openDialog();
    });
    const exp = controls.querySelector('[data-action="export"]');
    if (exp?.parentNode) exp.parentNode.insertBefore(btn, exp);
    else controls.appendChild(btn);
    return true;
  }

  /* ============================================================ */
  /*  Fenêtre de demande (MJ)                                      */
  /* ============================================================ */

  static async openDialog() {
    if (!game.user?.isGM) return;
    const choices = this.rollChoices();
    if (!choices.length) { ui.notifications.warn(L("SBE.RollReq.NoRollFields")); return; }
    const pcs = this.playerCharacters();
    const tokens = (canvas?.tokens?.placeables ?? []).filter(t => t?.actor);

    const seg = (group, value, icon, label, on) =>
      `<button type="button" class="sbe-rr-seg-btn${on ? " is-on" : ""}" data-seg="${group}" data-value="${esc(value)}">
        ${icon ? `<i class="${icon}"></i>` : ""}<span>${esc(label)}</span></button>`;
    const keyOpts = (first) => (first ? `<option value="">${esc(first)}</option>` : "")
      + choices.map(c => `<option value="${esc(c.key)}">${esc(c.label)}</option>`).join("");
    const ownersOf = (a) => game.users.filter(u => !u.isGM && a.testUserPermission(u, "OWNER")).map(u => u.name).join(", ");

    const pcRows = pcs.length
      ? pcs.map(a => `<label class="sbe-rr-target sbe-rr-tok" data-pc="${esc(a.uuid)}"><input type="checkbox" name="pc" value="${esc(a.uuid)}">
          <img src="${esc(a.img)}" alt=""><span class="sbe-rr-tokname">${esc(a.name)}</span>
          <span class="sbe-rr-lack">${esc(L("SBE.RollReq.Lacks"))}</span>
          <span class="sbe-rr-owner">${esc(ownersOf(a))}</span></label>`).join("")
      : `<em class="notes">${L("SBE.RollReq.NoPCs")}</em>`;

    const content = `
      <div class="sbe-rr-dlg">
        <input type="hidden" name="mode" value="simple">

        <div class="sbe-rr-label">${L("SBE.RollReq.Mode")}</div>
        <div class="sbe-rr-seg">
          ${seg("mode", "simple", "fa-solid fa-dice-d20", L("SBE.RollReq.ModeSimple"), true)}
          ${seg("mode", "opposed", "fa-solid fa-people-arrows", L("SBE.RollReq.ModeOpposed"), false)}
        </div>

        <div class="sbe-rr-label">${L("SBE.RollReq.Roll")}</div>
        <select name="key">${keyOpts("")}</select>

        <div class="sbe-rr-label">${L("SBE.RollReq.Difficulty")}</div>
        <input type="number" name="difficulty" value="0" step="1">
        <p class="notes">${L("SBE.RollReq.DifficultyHint")}</p>

        <div class="sbe-rr-panel" data-only="simple">
          <div class="sbe-rr-panel-head">
            <span class="sbe-rr-label">${L("SBE.RollReq.Characters")}</span>
            <label class="sbe-rr-switch"><input type="checkbox" name="all" checked> ${L("SBE.RollReq.AllPCs")} <span class="sbe-rr-count"></span></label>
          </div>
          <div class="sbe-rr-targets is-off">${pcRows}</div>
        </div>

        <div class="sbe-rr-panel" data-only="opposed" hidden>
          <div class="sbe-rr-label">${L("SBE.RollReq.KeyB")}</div>
          <select name="keyB">${keyOpts(L("SBE.RollReq.SameRoll"))}</select>
          <p class="notes">${L("SBE.RollReq.KeyBHint")}</p>
          <div class="sbe-rr-label">${L("SBE.RollReq.WinRule")}</div>
          <select name="win">${WIN_RULES.map(w => `<option value="${w}">${L("SBE.RollReq.Win." + w)}</option>`).join("")}</select>
          <p class="notes">${L("SBE.RollReq.WinHint")}</p>
          <span class="sbe-rr-label">${L("SBE.RollReq.Participants")}</span>
          <div class="sbe-rr-targets sbe-rr-tokens">${tokens.length ? "" : `<em class="notes">${L("SBE.RollReq.NoTokens")}</em>`}</div>
        </div>
      </div>`;

    const res = await foundry.applications.api.DialogV2.wait({
      window: { title: L("SBE.RollReq.Title"), icon: "fa-solid fa-dice-d20" },
      classes: ["sbe-rr-window"],
      position: { width: 440 },
      content,
      rejectClose: false,
      buttons: [{
        action: "send", label: L("SBE.RollReq.Send"), icon: "fa-solid fa-paper-plane", default: true,
        callback: (_ev, button) => {
          const el = button.form;
          return {
            mode: el.querySelector('[name="mode"]')?.value,
            key: el.querySelector('[name="key"]')?.value,
            keyB: el.querySelector('[name="keyB"]')?.value ?? "",
            win: el.querySelector('[name="win"]')?.value ?? "high",
            difficulty: Math.trunc(Number(el.querySelector('[name="difficulty"]')?.value) || 0),
            all: !!el.querySelector('[name="all"]')?.checked,
            pcs: [...el.querySelectorAll('[name="pc"]:checked')].map(c => c.value),
            parts: [...el.querySelectorAll("select[data-token]")]
              .filter(s => s.value).map(s => ({ tokenId: s.dataset.token, side: s.value }))
          };
        }
      }, { action: "cancel", label: L("SBE.Common.Cancel"), icon: "fa-solid fa-xmark" }],
      render: (_ev, dialog) => {
        const el = dialog.element;
        const modeIn = el.querySelector('[name="mode"]');
        const keySel = el.querySelector('[name="key"]');
        const keyBSel = el.querySelector('[name="keyB"]');
        const tokBox = el.querySelector(".sbe-rr-tokens");

        /* Un champ du défenseur : chaque pion choisit son camp
           (attaque / défense) ; sinon il participe ou non. */
        const fillTokens = () => {
          if (!tokens.length) return;
          const two = !!keyBSel.value;
          const keep = new Map([...tokBox.querySelectorAll("select[data-token]")].map(s => [s.dataset.token, s.value]));
          tokBox.innerHTML = tokens.map(t => {
            /* Un camp n'est proposé que si la fiche du pion a ce jet. */
            const okA = this.hasRoll(t.actor, keySel.value);
            const okB = two && this.hasRoll(t.actor, keyBSel.value);
            let v = keep.get(t.id) ?? "";
            if (!two && v) v = "a";
            if ((v === "a" && !okA) || (v === "b" && !okB)) v = "";
            const opt = (val, ok, label) => `<option value="${val}" ${v === val ? "selected" : ""} ${ok ? "" : "disabled"}>${esc(label)}</option>`;
            const opts = `<option value="">—</option>` + (two
              ? opt("a", okA, `${L("SBE.RollReq.SideA")} · ${this.labelOf(keySel.value)}`) + opt("b", okB, `${L("SBE.RollReq.SideB")} · ${this.labelOf(keyBSel.value)}`)
              : opt("a", okA, L("SBE.RollReq.Joins")));
            const none = !okA && !okB;
            return `<label class="sbe-rr-target sbe-rr-tok${none ? " is-lack" : ""}">
              <img src="${esc(t.document.texture?.src || t.actor.img)}" alt="">
              <span class="sbe-rr-tokname">${esc(t.document.name || t.actor.name)}</span>
              <span class="sbe-rr-lack">${esc(L("SBE.RollReq.Lacks"))}</span>
              ${t.actor.hasPlayerOwner ? "" : `<span class="sbe-rr-npc">${L("SBE.RollReq.NPC")}</span>`}
              <select data-token="${t.id}" ${none ? "disabled" : ""}>${opts}</select></label>`;
          }).join("");
        };
        const applyMode = () => {
          for (const p of el.querySelectorAll("[data-only]")) p.hidden = p.dataset.only !== modeIn.value;
        };
        for (const b of el.querySelectorAll(".sbe-rr-seg-btn")) {
          b.addEventListener("click", (ev) => {
            ev.preventDefault();
            el.querySelectorAll(`.sbe-rr-seg-btn[data-seg="${b.dataset.seg}"]`).forEach(x => x.classList.toggle("is-on", x === b));
            modeIn.value = b.dataset.value;
            applyMode();
          });
        }
        /* Personnages joueurs : ceux dont la fiche n'a pas ce jet sont
           grisés et ne peuvent pas être visés. */
        const fillPCs = () => {
          let n = 0;
          for (const row of el.querySelectorAll("[data-pc]")) {
            const ok = this.hasRoll(fromUuidSync(row.dataset.pc), keySel.value);
            row.classList.toggle("is-lack", !ok);
            const cb = row.querySelector('input[name="pc"]');
            cb.disabled = !ok;
            if (!ok) cb.checked = false;
            if (ok) n++;
          }
          const cnt = el.querySelector(".sbe-rr-count");
          if (cnt) cnt.textContent = `(${n}/${pcs.length})`;
        };
        keySel.addEventListener("change", fillPCs);
        keySel.addEventListener("change", fillTokens);
        keyBSel.addEventListener("change", fillTokens);
        const all = el.querySelector('[name="all"]');
        all?.addEventListener("change", () => el.querySelector('[data-only="simple"] .sbe-rr-targets')?.classList.toggle("is-off", all.checked));
        fillPCs();
        fillTokens();
        applyMode();
      }
    });

    if (!res || typeof res !== "object" || !res.key) return;
    if (res.mode === "opposed") {
      if (res.parts.length < 2) { ui.notifications.warn(L("SBE.RollReq.NeedTwo")); return; }
      await this.postOpposed(res, res.parts);
    } else {
      /* « Tous » = tous les PJ dont la fiche a CE jet. */
      const list = (res.all ? pcs.map(a => a.uuid) : res.pcs)
        .filter(u => this.hasRoll(fromUuidSync(u), res.key));
      if (!list.length) { ui.notifications.warn(L(res.all ? "SBE.RollReq.NobodyHas" : "SBE.RollReq.NeedPC")); return; }
      await this.postSimple(res.key, list, res.difficulty, { everyone: res.all });
    }
  }

  /** « Difficulté −20 » (vide si 0). */
  static diffNote(d) {
    const n = Number(d) || 0;
    if (!n) return "";
    return L("SBE.RollReq.DiffNote", { n: n > 0 ? `+${n}` : String(n).replace("-", "−") });
  }

  /* ============================================================ */
  /*  Mode SIMPLE                                                  */
  /* ============================================================ */

  /**
   * @param {string} key          champ à jet
   * @param {"all"|string[]} actors  uuids des personnages visés
   *        (seuls ceux dont la fiche a ce jet sont gardés)
   * @param {{everyone?: boolean}} [o]  « tous les PJ » : pas de ligne « Pour : »
   */
  static async postSimple(key, actors, difficulty = 0, { everyone = false } = {}) {
    const name = this.labelOf(key);
    const list = (Array.isArray(actors) ? actors.map(u => fromUuidSync(u)).filter(Boolean)
      : this.playerCharacters()).filter(a => this.hasRoll(a, key));
    /* Visés : la carte n'est chuchotée qu'à leurs joueurs (+ MJ). */
    const whisper = list.length
      ? [...new Set([...game.users.filter(u => u.isGM || list.some(a => a.testUserPermission(u, "OWNER"))).map(u => u.id)])]
      : [];
    const forLine = list.length && !everyone
      ?`<div class="sbe-rr-for">${esc(L("SBE.RollReq.For"))} : ${list.map(a => `<b data-ref-name="${esc(a.uuid)}"></b>`).join(", ")}</div>`
      : "";
    return ChatCards.post({
      type: "request",
      title: name,
      subtitle: this.diffNote(difficulty),
      body: `${forLine}<div class="sbe-rr-actions"><button type="button" class="sbe-rr-btn" data-sbe-rr="simple">
        ${ChatCards.rollButtonInner()}</button></div>`,
      speaker: { alias: L("SBE.RollReq.GM") },
      whisper,
      flags: { [SYSTEM_ID]: { rollReq: { kind: "simple", name, key, difficulty, actors: list.length ? list.map(a => a.uuid) : "all" } } }
    });
  }

  /** Qui lance ? Parmi les personnages visés, celui de ce joueur. */
  static #pickActor(rr) {
    const mine = (a) => a && a.type !== "template" && a.isOwner;
    const pool = (Array.isArray(rr.actors)
      ? rr.actors.map(u => fromUuidSync(u)).filter(mine)
      : (game.actors?.contents ?? []).filter(a => mine(a) && a.hasPlayerOwner))
      .filter(a => this.hasRoll(a, rr.key));
    if (!pool.length) return null;
    const own = game.user.character;
    const sel = canvas?.tokens?.controlled?.map(t => t.actor) ?? [];
    return pool.find(a => a === own) ?? pool.find(a => sel.includes(a)) ?? (pool.length === 1 || !game.user.isGM ? pool[0] : null);
  }

  static async #rollSimple(rr) {
    const actor = this.#pickActor(rr);
    if (!actor) { ui.notifications.warn(L(game.user.isGM ? "SBE.RollReq.PickToken" : "SBE.RollReq.NoChar")); return; }
    /* Difficulté du MJ : −20 = plus dur. Le moteur de jet compte une
       difficulté POSITIVE comme plus dure, d'où le signe. */
    const r = await rollField(actor, rr.key, {
      ask: true, title: rr.name, difficulty: -(Number(rr.difficulty) || 0), note: this.diffNote(rr.difficulty), after: "card"
    });
    if (r === null && !this.hasRoll(actor, rr.key)) ui.notifications.warn(L("SBE.RollReq.NoField", { name: actor.name }));
  }

  /** La fiche de ce personnage a-t-elle ce jet ? (plusieurs modèles
      de fiche peuvent coexister : tous n'ont pas les mêmes jets) */
  static hasRoll(actor, key) {
    const tpl = actor?.system?.template;
    return !![...walkElements(tpl?.system?.elements ?? [])].find(e => e?.key === key && e.config?.roll?.on);
  }

  /* ============================================================ */
  /*  Mode OPPOSITION                                              */
  /* ============================================================ */

  /** @param {{key, keyB, win, difficulty}} opt */
  static async postOpposed(opt, picked) {
    const keyB = opt.keyB && opt.keyB !== opt.key ? opt.keyB : "";
    const parts = [], lacking = [];
    for (const p of picked) {
      const tok = canvas?.tokens?.get(p.tokenId);
      if (!tok?.actor) continue;
      const side = p.side === "b" && keyB ? "b" : "a";
      /* Un pion dont la fiche n'a pas son jet ne participe pas. */
      if (!this.hasRoll(tok.actor, side === "b" ? keyB : opt.key)) { lacking.push(tok.document.name || tok.actor.name); continue; }
      parts.push({ pid: tok.id, ref: tok.document.uuid, side, npc: !tok.actor.hasPlayerOwner, res: null });
    }
    if (lacking.length) ui.notifications.warn(L("SBE.RollReq.Skipped", { names: lacking.join(", ") }));
    if (parts.length < 2) { ui.notifications.warn(L("SBE.RollReq.NeedTwo")); return; }
    const data = {
      kind: "opposed",
      name: keyB ? `${this.labelOf(opt.key)} / ${this.labelOf(keyB)}` : this.labelOf(opt.key),
      key: opt.key, keyB, win: WIN_RULES.includes(opt.win) ? opt.win : "high",
      difficulty: Number(opt.difficulty) || 0, parts, status: "pending", winners: []
    };
    /* PNJ : lancés tout de suite, par le MJ, sans fenêtre. */
    for (const p of parts) {
      if (!p.npc) continue;
      const actor = fromUuidSync(p.ref)?.actor;
      p.res = await this.#rollFor(actor, this.#keyOf(data, p), data.difficulty, false);
    }
    this.resolve(data);
    const built = await this.buildOpposed(data);
    return ChatMessage.create({
      content: built.content,
      rolls: built.rolls,
      sound: built.rolls.length ? CONFIG.sounds?.dice : undefined,
      speaker: { alias: L("SBE.RollReq.GM") },
      flags: foundry.utils.mergeObject(ChatCards.flags("roll"), { [SYSTEM_ID]: { rollReq: data } })
    });
  }

  static #keyOf(data, p) {
    return p.side === "b" && data.keyB ? data.keyB : data.key;
  }

  /** Lance sans carte et rend des DONNÉES (jamais de HTML). */
  static async #rollFor(actor, key, difficulty, ask) {
    if (!actor) return null;
    const r = await rollField(actor, key, { ask, post: false, difficulty: -(Number(difficulty) || 0), after: ask ? "now" : "none" });
    if (!r) {
      if (!this.hasRoll(actor, key)) ui.notifications.warn(L("SBE.RollReq.NoField", { name: actor.name }));
      return null;
    }
    return {
      roll: r.roll.toJSON(),
      dropped: (r.dropped ?? []).map(x => x.toJSON()),
      adv: r.adv || "",
      outcome: r.outcome,
      cardOutcome: r.cardOutcome || "",
      detail: r.detail || "",
      mods: r.mods,
      total: r.total,
      margin: r.margin,
      hasCmp: !!r.hasCmp
    };
  }

  /** Tous ont lancé → vainqueur(s), selon la règle du jet. */
  static resolve(data) {
    const done = data.parts.filter(p => p.res);
    if (done.length < data.parts.length) { data.status = "pending"; data.winners = []; return; }
    data.status = "done";
    const TIER = { critSuccess: 3, success: 2, done: 2, failure: 1, critFailure: 0 };
    const byMargin = data.win === "margin" && done.some(p => p.res.hasCmp);
    const score = (p) => data.win === "low" ? [-p.res.total]
      : byMargin ? [TIER[p.res.outcome] ?? 1, Number(p.res.margin) || 0]
        : [p.res.total];
    const cmp = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
    let best = null;
    for (const p of done) if (!best || cmp(score(p), best) > 0) best = score(p);
    /* Meilleure réussite : si personne ne réussit, personne ne gagne. */
    if (byMargin && best[0] < 2) { data.winners = []; return; }
    data.winners = done.filter(p => cmp(score(p), best) === 0).map(p => p.pid);
  }

  /** La carte d'opposition, depuis les données. */
  static async buildOpposed(data) {
    const nameSpan = (p) => `<b data-ref-name="${esc(p.ref)}"></b>`;
    const sides = data.parts.map(p => {
      const base = { ref: p.ref, pid: p.pid, role: p.side === "b" ? "defender" : "attacker",
        cls: data.winners.includes(p.pid) ? "is-winner" : "" };
      if (!p.res) {
        return { ...base, body: `<div class="sbe-rr-pending">
          <button type="button" class="sbe-rr-btn" data-sbe-rr="opposed" data-pid="${esc(p.pid)}">${ChatCards.rollButtonInner()}</button>
          <span class="sbe-rr-wait"><i class="fa-solid fa-hourglass-half"></i> ${esc(L("SBE.RollReq.Waiting"))}</span></div>` };
      }
      const r = p.res;
      const own = r.cardOutcome ? `<div class="sbe-card-result sbe-card-result--side" data-outcome="${esc(r.cardOutcome)}">
          <span class="sbe-card-result-icon"></span><span class="sbe-card-result-label"></span>
          ${r.detail ? `<span class="sbe-card-result-detail">${esc(r.detail)}</span>` : ""}</div>` : "";
      return { ...base,
        rolls: [Roll.fromData(r.roll)], adv: r.adv, dropped: (r.dropped ?? []).map(x => Roll.fromData(x)),
        after: `${ChatCards.modsHtml(r.mods?.rows ?? [], r.mods ?? {})}${own}` };
    });
    let footer = "";
    if (data.status === "done") {
      const win = data.parts.filter(p => data.winners.includes(p.pid));
      footer = !win.length
        ? `<div class="sbe-rr-verdict is-none"><i class="fa-solid fa-ban"></i> ${esc(L("SBE.RollReq.NoWinner"))}</div>`
        : win.length > 1
          ? `<div class="sbe-rr-verdict is-tie"><i class="fa-solid fa-scale-balanced"></i> ${esc(L("SBE.RollReq.Tie"))} : ${win.map(nameSpan).join(", ")}</div>`
          : `<div class="sbe-rr-verdict"><i class="fa-solid fa-crown"></i> ${esc(L("SBE.RollReq.Winner"))} : ${nameSpan(win[0])}</div>`;
    }
    return ChatCards.build({
      type: "roll",
      title: data.name,
      subtitle: [L("SBE.RollReq.ModeOpposed"), this.diffNote(data.difficulty)].filter(Boolean).join(" · "),
      sides, footer
    });
  }

  /** MJ principal : range un résultat et réécrit la carte. */
  /* Les résultats d'une même carte passent un par un : deux joueurs qui
     lancent ensemble ne s'effacent pas (chacun relit la carte à jour). */
  static #applyResult(messageId, pid, res, from = null) {
    return gmQueue(`rollreq:${messageId}`, () => this.#applyResultNow(messageId, pid, res, from));
  }

  static async #applyResultNow(messageId, pid, res, from) {
    const msg = game.messages.get(messageId);
    const data = foundry.utils.deepClone(msg?.flags?.[SYSTEM_ID]?.rollReq);
    if (!data || data.kind !== "opposed" || !res) return;
    const p = data.parts.find(x => x.pid === pid);
    if (!p || p.res) return;                 /* déjà lancé */
    /* Un joueur ne lance que pour un participant à lui. */
    const user = from ? game.users.get(from) : game.user;
    let actor = null;
    try { actor = fromUuidSync(p.ref)?.actor ?? null; } catch (_e) { actor = null; }
    if (!user || !(user.isGM || actor?.testUserPermission(user, "OWNER"))) return;
    p.res = res;
    this.resolve(data);
    const built = await this.buildOpposed(data);
    await msg.update({ content: built.content, rolls: built.rolls, [`flags.${SYSTEM_ID}.rollReq`]: data });
  }

  /** Un participant lance depuis la carte. */
  static async #rollOpposed(message, pid) {
    const data = message.flags?.[SYSTEM_ID]?.rollReq;
    const p = data?.parts?.find(x => x.pid === pid);
    if (!p || p.res) return;
    const actor = fromUuidSync(p.ref)?.actor;
    if (!actor?.isOwner) { ui.notifications.warn(L("SBE.RollReq.NoChar")); return; }
    const res = await this.#rollFor(actor, this.#keyOf(data, p), data.difficulty, true);
    if (!res) return;
    try { foundry.audio.AudioHelper.play({ src: CONFIG.sounds.dice, volume: 0.8 }, false); } catch (_e) { /* */ }
    if (isPrimaryGM()) await this.#applyResult(message.id, pid, res);
    else requestGM({ type: SOCK, op: "result", messageId: message.id, pid, res });
  }

  /* ============================================================ */
  /*  Câblage des cartes                                           */
  /* ============================================================ */

  static #wire(message, html) {
    const rr = message?.flags?.[SYSTEM_ID]?.rollReq;
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!rr || !root) return;

    if (rr.kind === "simple") {
      const btn = root.querySelector('[data-sbe-rr="simple"]');
      if (!btn) return;
      /* Le bouton chez les joueurs des personnages visés (et le MJ). */
      const can = game.user.isGM || (Array.isArray(rr.actors)
        ? rr.actors.some(u => fromUuidSync(u)?.isOwner)
        : (game.actors?.contents ?? []).some(a => a.type !== "template" && a.isOwner && a.hasPlayerOwner));
      if (!can) { btn.remove(); return; }
      btn.addEventListener("click", (ev) => { ev.preventDefault(); this.#rollSimple(rr); });
      return;
    }

    /* Opposition : le bouton chez qui possède le participant, « en
       attente » chez les autres. */
    for (const btn of root.querySelectorAll('[data-sbe-rr="opposed"]')) {
      const p = rr.parts?.find(x => x.pid === btn.dataset.pid);
      const mine = !!fromUuidSync(p?.ref ?? "")?.actor?.isOwner;
      const wait = btn.parentElement?.querySelector(".sbe-rr-wait");
      btn.hidden = !mine;
      if (wait) wait.hidden = mine;
      if (!mine) continue;
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        btn.disabled = true;
        try { await this.#rollOpposed(message, btn.dataset.pid); }
        finally { btn.disabled = false; }
      });
    }
  }
}
