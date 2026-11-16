/**
 * SBE — Manager des ÉCHANGES (MJ)
 *
 * - les FAMILLES échangeables (modèles d'atelier d'objets) ;
 * - les EXCEPTIONS : des objets précis de ces familles qui ne
 *   s'échangent pas (« toutes les armes, sauf celles-ci ») ;
 * - l'ARGENT : les monnaies du manager « Marchands et monnaies » ;
 * - la distance maximale entre les pions ;
 * - les sons : demande, terminé, annulé.
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { UiSound } from "../media/ui-sound.mjs";
import { TradeManager } from "./trade-manager.mjs";

const { ApplicationV2 } = foundry.applications.api;
const L = (k) => game.i18n.localize(k);
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

export class SBETradeConfig extends ApplicationV2 {

  static DEFAULT_OPTIONS = {
    id: "sbe-trade-config",
    tag: "form",
    classes: ["sbe-trade-config", "sbe-condense"],
    window: { title: "SBE.Trade.ConfigTitle", icon: "fa-solid fa-right-left", resizable: true },
    position: { width: 540, height: 680 },
    form: { handler: SBETradeConfig.#onSubmit, submitOnChange: false, closeOnSubmit: false }
  };

  async _renderHTML() {
    const c = this._working ?? TradeManager.getConfig();
    const tpls = game.items.filter(i => i.type === "template")
      .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
    const fam = tpls.map(t => `<label class="sbe-trade-check">
        <input type="checkbox" name="tpl" value="${esc(t.id)}" ${c.templates.includes(t.id) ? "checked" : ""}>
        <img src="${esc(t.img)}" alt=""> ${esc(t.name)}</label>`).join("")
      || `<p class="notes">${L("SBE.Trade.NoFamilies")}</p>`;

    /* Exceptions : une ZONE DE DÉPÔT — on y glisse seulement les objets
       à exclure (un monde peut en compter des centaines). */
    this._exclude ??= [...c.exclude];
    const exc = this._exclude.map(id => {
      const m = game.items.get(id);
      return `<li class="sbe-trade-check" data-id="${esc(id)}">
        <img src="${esc(m?.img ?? "icons/svg/hazard.svg")}" alt=""> ${esc(m?.name ?? L("SBE.Trade.Missing"))}
        <small>${esc(game.items.get(m?.system?.templateId)?.name ?? "")}</small>
        <a class="sbe-trade-exc-del" data-id="${esc(id)}" title="${esc(L("SBE.Trade.Remove"))}"><i class="fa-solid fa-xmark"></i></a></li>`;
    }).join("");

    return `
      <div class="sbe-trade-cfg-body">
        <details class="sbe-chatc-sec" open><summary>${L("SBE.Trade.Families")}</summary>
          <p class="notes">${L("SBE.Trade.FamiliesHint")}</p>
          <div class="sbe-trade-checks">${fam}</div>
        </details>
        <details class="sbe-chatc-sec" open><summary>${L("SBE.Trade.Exclude")}</summary>
          <p class="notes">${L("SBE.Trade.ExcludeHint")}</p>
          <ul class="sbe-trade-checks sbe-trade-excdrop">${exc || `<li class="sbe-trade-empty">${L("SBE.Trade.ExcludeDrop")}</li>`}</ul>
        </details>
        <details class="sbe-chatc-sec" open><summary>${L("SBE.Trade.Rules")}</summary>
          <p class="notes">${L("SBE.Trade.MoneyFromLibrary")}</p>
          <div class="sbe-chatc-field"><label>${L("SBE.Trade.Distance")}</label>
            <input type="number" name="distance" value="${Number(c.distance) || 0}" min="0" step="1">
            <p class="notes">${L("SBE.Trade.DistanceHint")}</p></div>
        </details>
        <details class="sbe-chatc-sec" open><summary>${L("SBE.Trade.Sounds")}</summary>
          <p class="notes">${L("SBE.Trade.SoundsHint")}</p>
          <div class="sbe-uisound-block">
            ${UiSound.fieldsHtml("sounds.request", c.sounds.request, "SBE.Trade.SoundRequest")}
            ${UiSound.fieldsHtml("sounds.done", c.sounds.done, "SBE.Trade.SoundDone")}
            ${UiSound.fieldsHtml("sounds.cancel", c.sounds.cancel, "SBE.Trade.SoundCancel")}
          </div>
        </details>
      </div>
      <footer class="sbe-chatc-foot">
        <button type="submit"><i class="fa-solid fa-floppy-disk"></i> ${L("SBE.Common.Save")}</button>
      </footer>`;
  }

  /* Le défilement est gardé pour toutes les fenêtres (helpers/keep-scroll.mjs). */
  _replaceHTML(result, content) {
    content.innerHTML = result;
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    UiSound.wire(this.element);
    /* Cocher une famille met à jour la liste des exceptions. */
    for (const cb of this.element.querySelectorAll('input[name="tpl"]')) {
      cb.addEventListener("change", () => { this._working = this.#read(); this.render(); });
    }
    /* Zone des exceptions : glisser un objet (du répertoire des objets,
       ou un exemplaire porté — ramené à son modèle). */
    const zone = this.element.querySelector(".sbe-trade-excdrop");
    zone?.addEventListener("dragover", (ev) => ev.preventDefault());
    zone?.addEventListener("drop", async (ev) => {
      ev.preventDefault();
      let data = null;
      try { data = foundry.applications.ux.TextEditor.implementation.getDragEventData(ev); } catch (_e) { /* */ }
      if (data?.type !== "Item" || !data.uuid) return;
      const it = await fromUuid(data.uuid).catch(() => null);
      const model = it?.parent ? game.items.get(it.system?.modelId ?? "") : it;
      if (!model || model.type !== "objet" || model.parent) {
        ui.notifications.warn(L("SBE.Trade.ExcludeBad"));
        return;
      }
      if (!this._exclude.includes(model.id)) this._exclude.push(model.id);
      this._working = this.#read();
      this.render();
    });
    for (const a of this.element.querySelectorAll(".sbe-trade-exc-del")) {
      a.addEventListener("click", () => {
        this._exclude = this._exclude.filter(id => id !== a.dataset.id);
        this._working = this.#read();
        this.render();
      });
    }
  }

  #read() {
    const root = this.element;
    const checked = (n) => [...root.querySelectorAll(`input[name="${n}"]:checked`)].map(x => x.value);
    const templates = checked("tpl");
    const exclude = [...(this._exclude ?? [])];
    return {
      templates, exclude,
      distance: Math.max(0, Number(root.querySelector('[name="distance"]')?.value) || 0),
      sounds: {
        request: UiSound.read(root, "sounds.request"),
        done: UiSound.read(root, "sounds.done"),
        cancel: UiSound.read(root, "sounds.cancel")
      }
    };
  }

  static async #onSubmit() {
    const cfg = this.#read();
    this._working = cfg;
    await game.settings.set(SYSTEM_ID, "tradeConfig", cfg);
    ui.notifications.info(L("SBE.Trade.Saved"));
  }
}
