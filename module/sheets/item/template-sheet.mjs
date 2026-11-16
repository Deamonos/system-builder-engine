/**
 * SBE — Feuille du MODÈLE d'objet : l'atelier.
 * Toute la logique vit dans builder/workshop-mixin.mjs (partagée avec
 * les modèles de personnages).
 *
 * Spécifique : « Sons de la fiche » dans le menu ⋮ — le même bloc que
 * dans le thème des modèles de personnage, stocké au même endroit
 * (system.theme.sounds) : un seul langage pour tous les modèles.
 */

import { WorkshopMixin } from "../../builder/workshop-mixin.mjs";
import { UiSound, sheetSoundsOf } from "../../managers/media/ui-sound.mjs";
import { TemplateTheme } from "../../managers/theme/template-theme.mjs";

const { HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export class SBETemplateSheet extends WorkshopMixin(HandlebarsApplicationMixin(ItemSheetV2)) {

  static DEFAULT_OPTIONS = {
    actions: {
      sbeSheetSounds: SBETemplateSheet.#onSheetSounds
    }
  };

  /** Entrée « Sons de la fiche » dans le menu ⋮ de la fenêtre. */
  _getHeaderControls() {
    const controls = super._getHeaderControls();
    controls.push({
      icon: "fa-solid fa-volume-high",
      label: "SBE.TplTheme.ItemSheetMenu",
      action: "sbeSheetSounds"
    });
    return controls;
  }

  static async #onSheetSounds() {
    const doc = this.document;
    const res = await DialogV2.prompt({
      window: {
        title: game.i18n.format("SBE.UiSound.TitleName", { name: doc.name ?? "" }),
        icon: "fa-solid fa-volume-high"
      },
      position: { width: 460 },
      content: `
        <label class="sbe-tplth-row" style="display:flex;align-items:center;gap:6px;">
          <input type="checkbox" name="hideTitle" ${doc.system?.theme?.interface?.hideTitle ? "checked" : ""}>
          <span>${game.i18n.localize("SBE.TplTheme.HideTitle")}</span>
        </label>
        <p class="hint notes">${game.i18n.localize("SBE.TplTheme.HideTitleHint")}</p>
        ${UiSound.sheetBlockHtml(sheetSoundsOf(doc))}
        <div style="display:flex;gap:6px;margin-top:6px;">
          <button type="button" data-sbe-io="export"><i class="fa-solid fa-file-export"></i> ${game.i18n.localize("SBE.Common.Export")}</button>
          <button type="button" data-sbe-io="import"><i class="fa-solid fa-file-import"></i> ${game.i18n.localize("SBE.Common.Import")}</button>
        </div>
        <p class="hint notes">${game.i18n.localize("SBE.TplTheme.ItemIoHint")}</p>`,
      ok: {
        label: game.i18n.localize("SBE.Common.Validate"),
        icon: "fa-solid fa-check",
        callback: (_ev, button) => ({
          sounds: UiSound.readSheet(button.form),
          hideTitle: !!button.form.querySelector('[name="hideTitle"]')?.checked
        })
      },
      render: (_ev, dialog) => {
        const root = dialog?.element ?? dialog;
        UiSound.wire(root);
        const form = root.querySelector("form") ?? root;
        const current = () => ({
          ...foundry.utils.deepClone(doc.system?.theme ?? {}),
          sounds: UiSound.readSheet(form),
          interface: { ...(doc.system?.theme?.interface ?? {}), hideTitle: !!form.querySelector('[name="hideTitle"]')?.checked }
        });
        root.querySelector('[data-sbe-io="export"]')?.addEventListener("click", () => TemplateTheme.exportFile(doc, current()));
        root.querySelector('[data-sbe-io="import"]')?.addEventListener("click", async () => {
          const t = await TemplateTheme.pickFile();
          if (!t) return;
          /* Un modèle d'objet ne prend que le titre et les sons. */
          const box = form.querySelector('[name="hideTitle"]');
          if (box) box.checked = !!t.interface?.hideTitle;
          for (const w of ["open", "close"]) {
            const s = t.sounds?.[w] ?? {};
            const f = form.querySelector(`[name="sounds.${w}.sound"]`);
            const v = form.querySelector(`[name="sounds.${w}.volume"]`);
            if (f) f.value = s.sound ?? "";
            if (v) v.value = Number.isFinite(Number(s.volume)) ? Number(s.volume) : 80;
          }
          ui.notifications.info(game.i18n.localize("SBE.TplTheme.ImportDone"));
        });
      },
      rejectClose: false
    }).catch(() => null);
    if (!res) return;
    await doc.update({ "system.theme.sounds": res.sounds, "system.theme.interface.hideTitle": res.hideTitle });
  }
}
