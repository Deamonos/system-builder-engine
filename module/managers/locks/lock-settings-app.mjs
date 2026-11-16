/**
 * SBE — RÉGLAGES DES VERROUS (paramètres du système, MJ)
 *
 * Aujourd'hui : l'usure des outils (crochetage, piratage), réglée une
 * fois pour toutes. Désactivée par défaut.
 */

import { ToolWear, WEAR_OUTCOMES } from "./tool-wear.mjs";
import { buildKeyRefOptions } from "../../helpers/key-refs.mjs";

const { ApplicationV2 } = foundry.applications.api;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const L = (k) => game.i18n.localize(k);

export class SBELockSettings extends ApplicationV2 {

  static DEFAULT_OPTIONS = {
    id: "sbe-lock-settings",
    tag: "form",
    classes: ["sbe-lock-settings", "sbe-condense"],
    window: { title: "SBE.Locks.SettingsTitle", icon: "fa-solid fa-lock", resizable: true },
    position: { width: 520, height: "auto" },
    form: { handler: SBELockSettings.#onSubmit, closeOnSubmit: true }
  };

  async _renderHTML() {
    const w = ToolWear.get();
    const rows = WEAR_OUTCOMES.map(o => `
      <tr>
        <td>${esc(L(`SBE.Locks.Outcome_${o}`))}</td>
        <td><input type="number" name="rules.${o}.amount" value="${w.rules[o].amount}" min="0" step="1"></td>
        <td class="c"><input type="checkbox" name="rules.${o}.destroy" ${w.rules[o].destroy ? "checked" : ""}></td>
      </tr>`).join("");
    return `
      <div class="sbe-locks-set">
        <fieldset>
          <legend><i class="fa-solid fa-screwdriver-wrench"></i> ${esc(L("SBE.Locks.WearTitle"))}</legend>
          <label class="sbe-locks-check"><input type="checkbox" name="enabled" ${w.enabled ? "checked" : ""}> <b>${esc(L("SBE.Locks.WearEnabled"))}</b></label>
          <p class="notes">${esc(L("SBE.Locks.WearHint"))}</p>
          <div class="sbe-locks-f">
            <label>${esc(L("SBE.Locks.WearKey"))}</label>
            <select name="key">${buildKeyRefOptions("item", w.key)}</select>
            <p class="notes">${esc(L("SBE.Locks.WearKeyHint"))}</p>
          </div>
          <div class="sbe-locks-f">
            <label>${esc(L("SBE.Locks.WearAtZero"))}</label>
            <select name="atZero">
              <option value="unusable" ${w.atZero === "unusable" ? "selected" : ""}>${esc(L("SBE.Locks.WearAtZero_unusable"))}</option>
              <option value="destroy" ${w.atZero === "destroy" ? "selected" : ""}>${esc(L("SBE.Locks.WearAtZero_destroy"))}</option>
            </select>
          </div>
          <table class="sbe-locks-table">
            <thead><tr><th>${esc(L("SBE.Locks.WearOutcome"))}</th><th>${esc(L("SBE.Locks.WearAmount"))}</th><th>${esc(L("SBE.Locks.WearDestroy"))}</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <p class="notes">${esc(L("SBE.Locks.WearTableHint"))}</p>
        </fieldset>
        <footer class="form-footer">
          <button type="submit"><i class="fa-solid fa-floppy-disk"></i> ${esc(L("SBE.Common.Save"))}</button>
        </footer>
      </div>`;
  }

  _replaceHTML(result, content) { content.innerHTML = result; }

  static async #onSubmit(_event, form) {
    const q = (n) => form.querySelector(`[name="${n}"]`);
    const rules = {};
    for (const o of WEAR_OUTCOMES) {
      rules[o] = { amount: Number(q(`rules.${o}.amount`)?.value) || 0, destroy: !!q(`rules.${o}.destroy`)?.checked };
    }
    await ToolWear.set({
      enabled: !!q("enabled")?.checked,
      key: q("key")?.value ?? "",
      atZero: q("atZero")?.value ?? "unusable",
      rules
    });
    ui.notifications.info(L("SBE.Locks.SettingsSaved"));
  }
}
