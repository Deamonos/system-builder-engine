/**
 * SBE — Fenêtre HISTORIQUE des actions (MJ)
 *
 * Les dernières actions de la table, la plus récente en haut :
 * « Revenir ici » défait celle-ci et toutes celles d'après ;
 * « Rétablir » refait les actions annulées jusqu'à celle-ci.
 */

import { UndoManager } from "./undo-manager.mjs";

const { ApplicationV2 } = foundry.applications.api;
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

export class SBEUndoHistory extends ApplicationV2 {

  static DEFAULT_OPTIONS = {
    tag: "div",
    classes: ["sbe-undo-history"],
    window: { title: "SBE.Undo.HistoryTitle", icon: "fa-solid fa-clock-rotate-left", resizable: true },
    position: { width: 520, height: 560 }
  };

  static open() {
    const app = [...(foundry.applications.instances?.values?.() ?? [])].find(a => a instanceof SBEUndoHistory) ?? new SBEUndoHistory();
    app.render({ force: true });
    return app;
  }

  async _renderHTML() {
    const runs = [...UndoManager.runs()].reverse();
    const time = (t) => { try { return new Date(t).toLocaleTimeString(game.i18n.lang, { hour: "2-digit", minute: "2-digit", second: "2-digit" }); } catch (_e) { return ""; } };
    const rows = runs.map(r => {
      const chainU = r.undone ? [] : UndoManager.chainUndo(r.id);
      const chainR = r.undone ? UndoManager.chainRedo(r.id) : [];
      const btn = r.undone
        ? (UndoManager.denyRedo(chainR) ? "" : `<button type="button" data-redo="${esc(r.id)}"><i class="fa-solid fa-rotate-right"></i> ${esc(L("SBE.Undo.Redo"))}</button>`)
        : (UndoManager.denyUndo(chainU) ? "" : `<button type="button" data-undo="${esc(r.id)}" data-tooltip-text="${esc(L("SBE.Undo.BackHereTip", { n: chainU.length }))}"><i class="fa-solid fa-rotate-left"></i> ${esc(L("SBE.Undo.BackHere"))}</button>`);
      return `<li class="sbe-undo-row${r.undone ? " is-undone" : ""}">
        ${r.img ? `<img src="${esc(r.img)}" alt="">` : `<i class="fa-solid fa-bolt"></i>`}
        <div class="sbe-undo-txt"><b>${esc(r.label || "?")}</b>
          <small>${esc([r.actorName, r.userName, time(r.at)].filter(Boolean).join(" · "))} · ${esc(L("SBE.Undo.Changes", { n: r.n ?? r.entries?.length ?? 0 }))}${r.undone ? ` · ${esc(L("SBE.Undo.Undone"))}` : ""}</small></div>
        ${btn}
      </li>`;
    }).join("");
    return `
      <div class="sbe-undo-head">
        <button type="button" data-do="undo"><i class="fa-solid fa-rotate-left"></i> ${esc(L("SBE.Undo.UndoLast"))}</button>
        <button type="button" data-do="redo"><i class="fa-solid fa-rotate-right"></i> ${esc(L("SBE.Undo.RedoNext"))}</button>
        <button type="button" data-do="clear"><i class="fa-solid fa-trash"></i> ${esc(L("SBE.Undo.Clear"))}</button>
      </div>
      <p class="notes">${esc(L("SBE.Undo.HistoryHint"))}</p>
      ${rows ? `<ol class="sbe-undo-rows">${rows}</ol>` : `<p class="sbe-undo-empty">${esc(L("SBE.Undo.Empty"))}</p>`}`;
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
    content.querySelectorAll("[data-undo]").forEach(b => b.addEventListener("click", () => UndoManager.undo(b.dataset.undo)));
    content.querySelectorAll("[data-redo]").forEach(b => b.addEventListener("click", () => UndoManager.redo(b.dataset.redo)));
    content.querySelector('[data-do="undo"]')?.addEventListener("click", () => UndoManager.undoLast());
    content.querySelector('[data-do="redo"]')?.addEventListener("click", () => UndoManager.redoNext());
    content.querySelector('[data-do="clear"]')?.addEventListener("click", (ev) => {
      const b = ev.currentTarget;
      if (b.dataset.armed) { UndoManager.clear(); return; }
      b.dataset.armed = "1";
      b.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${esc(L("SBE.Undo.ClearConfirm"))}`;
    });
  }
}
