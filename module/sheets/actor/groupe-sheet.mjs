/**
 * SBE — Feuille du GROUPE
 *
 * Les membres (portrait + nom : glisser une fiche de personnage ici),
 * les 3 emplacements de sauvegarde + l'automatique, le groupe actif et
 * sa sauvegarde automatique, le son de sauvegarde. Réservé au MJ.
 */

import { SYSTEM_PATH } from "../../helpers/constants.mjs";
import { audioFormatsHint } from "../../helpers/constants.mjs";
import { GroupManager } from "../../managers/group/group-manager.mjs";
import { GROUP_SLOTS } from "../../data/groupe-data.mjs";
import { testSound } from "../../managers/media/ui-sound.mjs";

const { HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));

export class SBEGroupeSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["sbe-group-sheet"],
    position: { width: 520, height: 640 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      groupSave: SBEGroupeSheet.#onSave,
      groupLoad: SBEGroupeSheet.#onLoad,
      groupRemove: SBEGroupeSheet.#onRemove,
      groupOpen: SBEGroupeSheet.#onOpen,
      groupActive: SBEGroupeSheet.#onActive,
      groupPickSound: SBEGroupeSheet.#onPickSound,
      groupTestSound: SBEGroupeSheet.#onTestSound
    }
  };

  static PARTS = {
    body: { template: `${SYSTEM_PATH}/templates/actor/groupe-sheet.hbs`, scrollable: [""] }
  };

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    const g = this.document;
    ctx.isGM = game.user.isGM;
    ctx.system = g.system;
    ctx.members = (await GroupManager.members(g)).map(m => ({
      uuid: m.uuid,
      name: m.actor?.name ?? L("SBE.Group.Missing"),
      img: m.actor?.img || "icons/svg/mystery-man.svg",
      missing: !m.actor
    }));
    ctx.slots = GROUP_SLOTS.map(id => {
      const s = GroupManager.slotOf(g, id);
      return {
        id, label: GroupManager.slotLabel(id), auto: id === "auto", has: !!s,
        world: s ? GroupManager.formatWorldTime(s.worldTime) : "",
        real: s ? GroupManager.formatReal(s.realTime) : "",
        count: s ? s.snaps.length : 0
      };
    });
    ctx.isActive = GroupManager.activeId() === g.id;
    ctx.audioFormats = audioFormatsHint();
    ctx.audAll = g.system.media?.audience === "all";
    return ctx;
  }

  /* Le pourcentage du volume suit le curseur pendant qu'on le déplace. */
  async _onRender(context, options) {
    await super._onRender(context, options);
    const vol = this.element.querySelector(".sbe-group-volume");
    const out = this.element.querySelector(".sbe-group-volout");
    if (vol && out) vol.addEventListener("input", () => { out.textContent = `${vol.value}%`; });
  }

  /* Glisser une fiche de personnage (possédée par un joueur). */
  async _onDrop(event) {
    if (!game.user.isGM) return;
    let data;
    try { data = JSON.parse(event.dataTransfer.getData("text/plain")); } catch (_e) { return; }
    if (data?.type !== "Actor") return;
    const actor = await fromUuid(data.uuid).catch(() => null);
    if (!actor || actor.id === this.document.id) return;
    if (!GroupManager.canJoin(actor)) { ui.notifications.warn(L("SBE.Group.BadMember")); return; }
    const list = [...(this.document.system.members ?? [])];
    if (list.includes(actor.uuid)) { ui.notifications.info(L("SBE.Group.AlreadyMember")); return; }
    list.push(actor.uuid);
    await this.document.update({ "system.members": list });
  }

  static async #onSave(_ev, target) {
    const slot = target.dataset.slot;
    if (GroupManager.slotOf(this.document, slot)) {
      const ok = await DialogV2.confirm({
        window: { title: L("SBE.Group.OverwriteTitle") },
        content: `<p>${L("SBE.Group.OverwriteConfirm", { slot: GroupManager.slotLabel(slot) })}</p>`,
        rejectClose: false
      }).catch(() => false);
      if (!ok) return;
    }
    await GroupManager.save(this.document, slot);
  }

  static async #onLoad(_ev, target) {
    const slot = target.dataset.slot;
    const ok = await DialogV2.confirm({
      window: { title: L("SBE.Group.LoadTitle") },
      content: `<p>${L("SBE.Group.LoadConfirm", { slot: GroupManager.slotLabel(slot) })}</p>`,
      rejectClose: false
    }).catch(() => false);
    if (!ok) return;
    await GroupManager.load(this.document, slot);
    this.render();
  }

  static async #onRemove(_ev, target) {
    const uuid = target.closest("[data-uuid]")?.dataset.uuid;
    const list = (this.document.system.members ?? []).filter(u => u !== uuid);
    await this.document.update({ "system.members": list });
  }

  static async #onOpen(_ev, target) {
    const uuid = target.closest("[data-uuid]")?.dataset.uuid;
    const a = await fromUuid(uuid).catch(() => null);
    a?.sheet?.render(true);
  }

  static async #onActive() {
    const on = GroupManager.activeId() !== this.document.id;
    await GroupManager.setActive(this.document, on);
  }

  static #onPickSound() {
    const FP = foundry.applications.apps.FilePicker.implementation;
    new FP({
      type: "audio", current: this.document.system.media?.sound || "",
      callback: (path) => this.document.update({ "system.media.sound": path })
    }).render(true);
  }

  static async #onTestSound() {
    const m = this.document.system.media ?? {};
    await testSound(m.sound, (Number(m.volume) || 0) / 100);
  }
}
