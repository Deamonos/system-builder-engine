/**
 * SBE — Document Item étendu
 *
 * Porte les règles d'intégrité de la chaîne template → modèle →
 * instance (IDs = source de vérité unique) :
 *
 * - « Créer un objet » propose : Template (atelier) + chaque template
 *   existant sous la forme « Nom (modèle) » — créer un modèle depuis
 *   un template initialise templateId, templateVersion et les valeurs
 *   par défaut.
 * - Supprimer un TEMPLATE est BLOQUÉ tant que des objets (modèles ou
 *   instances) le référencent — jamais d'orphelins.
 * - Supprimer un MODÈLE supprimera en cascade ses instances avec une
 *   confirmation chiffrée (branché au palier des instances ; le
 *   recensement est déjà en place).
 */

/* Icône SBE des modèles : blanc plein sur fond transparent,
   dans le style des icônes natives de Foundry. */
import { clampValueChanges, applyTempPoints } from "../builder/doc-context.mjs";
import { GaugeGuard } from "../managers/gauge-guard/gauge-guard.mjs";
import { OrphanCleanup } from "../managers/cleanup/orphan-cleanup.mjs";
import { findItems, removeItems, countUnits } from "../managers/locations/item-locations.mjs";

const DEFAULT_TEMPLATE_ICON = "systems/system-builder-engine/assets/icons/modele.svg";
const DEFAULT_OBJECT_ICON = "systems/system-builder-engine/assets/icons/objet.svg";

export class SBEItem extends Item {

  /** Tout ce qui est construit sur ce modèle d'atelier, où que ce soit
      (registre des emplacements : fiches, jetons, monde, coffres…). */
  get templateDependents() {
    if (this.type !== "template") return [];
    return findItems(v => v.type === "objet" && v.system?.templateId === this.id);
  }

  /** Les exemplaires de cet objet du monde, où qu'ils soient. */
  get copiesEverywhere() {
    if (this.type !== "objet" || this.parent) return [];
    /* Exclu par le DOCUMENT : un exemplaire peut avoir le même id que lui. */
    return findItems((v, doc) => v.type === "objet" && doc !== this && v.system?.modelId === this.id);
  }

  /**
   * @override
   * Un OBJET n'existe jamais sans template : toute création d'objet
   * sans templateId est refusée, quel que soit le chemin (dialogue,
   * import, macro, drop…).
   */
  async _preCreate(data, options, user) {
    if (this.type === "objet" && !this.system.templateId) {
      ui.notifications.error(game.i18n.localize("SBE.Objet.NeedsTemplate"));
      return false;
    }
    /* Icônes par défaut : la fiche-atelier pour les modèles, le cube
       pour les objets — jamais le sac natif. */
    if (this.type === "template" && (!data.img || data.img === "icons/svg/item-bag.svg")) {
      this.updateSource({ img: DEFAULT_TEMPLATE_ICON });
    }
    if (this.type === "objet" && (!data.img || data.img === "icons/svg/item-bag.svg")) {
      this.updateSource({ img: DEFAULT_OBJECT_ICON });
    }
    /* Plafond strict des jauges calculées de la fiche qui reçoit. */
    /* Retour en arrière (managers/undo) : l'objet revient tel qu'il était. */
    if (this.type === "objet" && this.parent && !options?.sbeUndo && !(await GaugeGuard.onItemCreate(this, options))) return false;
    return super._preCreate(data, options, user);
  }

  /** @override — valeurs ramenées dans leurs bornes, quel que soit le chemin. */
  async _preUpdate(changes, options, user) {
    /* Modèle modifié par le MJ et propagé aux exemplaires : la règle change
       pour tous, sans question ni refus objet par objet. */
    if (this.type === "objet" && this.parent && !options?.sbeUndo && !options?.sbePropagation
      && !(await GaugeGuard.onItemUpdate(this, changes))) return false;
    /* Valeur ramenée à une borne déjà atteinte (95 → 95) : rien ne
       change côté serveur, donc la fiche ne se redessinerait pas et
       garderait « 120 » affiché — on la redessine. */
    /* Points temporaires : donner / encaisser AVANT les bornes. */
    if (this.type === "objet") applyTempPoints(this, changes, options);
    if (this.type === "objet" && clampValueChanges(this, changes)) {
      setTimeout(() => { if (this.sheet?.rendered) this.sheet.render(); }, 0);
    }
    return super._preUpdate(changes, options, user);
  }

  /** @override */
  async _preDelete(options, user) {
    if (this.type === "template" && !options?.sbeCascade) {
      /* Supprimer un modèle d'atelier n'est JAMAIS bloqué : on prévient,
         chiffres à l'appui, et si le MJ confirme, tout ce qui en découle
         part avec lui — modèles d'objets, exemplaires portés (PJ, PNJ,
         jetons non liés), objets du monde et contenus des coffres.
         Personne n'a à fouiller les scènes une par une. */
      const ok = await this.#cascadeTemplate();
      if (!ok) return false;
    }

    /* Supprimer un OBJET du monde : tous ses exemplaires, où qu'ils
       soient, partent avec lui — UNE seule fenêtre, la même partout. */
    if (this.type === "objet" && !options?.sbeCascade && !this.parent) {
      const hits = this.copiesEverywhere;
      if (hits.length) {
        const esc = (x) => foundry.utils.escapeHTML(String(x ?? ""));
        const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
        const total = countUnits(hits);
        const ok = await OrphanCleanup.confirmCascade({
          title: L("SBE.Orphan.TplTitle", { name: this.name }),
          intro: L("SBE.Orphan.ModelIntro", { name: esc(this.name), n: total }),
          lines: OrphanCleanup.cascadeLines(hits, { worldKey: "SBE.Orphan.ModelWorld" }),
          warn: L("SBE.Orphan.TplWarn")
        });
        if (!ok) return false;
        await removeItems(hits);
        ui.notifications.info(L("SBE.Orphan.TplDone", { n: total }));
      }
    }
    return super._preDelete(options, user);
  }

  /**
   * Suppression EN CASCADE d'un modèle d'atelier, après confirmation.
   * @returns {Promise<boolean>} faux si le MJ renonce
   */
  async #cascadeTemplate() {
    const hits = this.templateDependents;
    if (!hits.length) return true;   /* rien n'en dépend : suppression simple */
    const esc = (x) => foundry.utils.escapeHTML(String(x ?? ""));
    const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
    const total = countUnits(hits);
    const ok = await OrphanCleanup.confirmCascade({
      title: L("SBE.Orphan.TplTitle", { name: this.name }),
      intro: L("SBE.Orphan.TplIntro", { name: esc(this.name), n: total }),
      lines: OrphanCleanup.cascadeLines(hits),
      warn: L("SBE.Orphan.TplWarn")
    });
    if (!ok) return false;
    /* Le registre traite les emplacements dans le bon ordre : portés
       d'abord (leur contenu se range), monde en dernier. */
    await removeItems(hits);
    ui.notifications.info(L("SBE.Orphan.TplDone", { n: total }));
    return true;
  }

  /* ---------------------------------------------------------- */
  /*  « Créer un objet »                                         */
  /* ---------------------------------------------------------- */

  /**
   * @override
   * Remplace le dialogue natif : « Que créer ? » = Modèle ou Objet ;
   * si Objet, un second menu demande depuis quel modèle.
   */
  static async createDialog(data = {}, createOptions = {}, _options = {}) {
    const L = (k) => game.i18n.localize(k);
    const templates = game.items.filter(i => i.type === "template")
      .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));

    const modelOpts = templates.map(t =>
      `<option value="${t.id}">${foundry.utils.escapeHTML(t.name)}</option>`).join("");

    const content = `
      <div style="display:flex;flex-direction:column;gap:8px;">
        <div class="form-group">
          <label style="flex:0 0 8.5rem;">${L("SBE.Objet.CreateType")}</label>
          <select name="choice" style="flex:1;">
            <option value="template">${L("SBE.Template.CreateChoice")}</option>
            <option value="objet" ${templates.length ? "" : "disabled"}>${L("SBE.Objet.CreateChoiceObjet")}</option>
          </select>
        </div>
        ${templates.length ? "" : `<p class="notes" style="margin:0;">${L("SBE.Objet.NoTemplatesHint")}</p>`}
        <div class="form-group sbe-create-model" style="display:none;">
          <label style="flex:0 0 8.5rem;">${L("SBE.Objet.FromModel")}</label>
          <select name="modelId" style="flex:1;">${modelOpts}</select>
        </div>
        <div class="form-group">
          <label style="flex:0 0 8.5rem;">${L("SBE.Objet.CreateName")}</label>
          <input type="text" name="name" value="" placeholder="${L("SBE.Objet.CreateNamePh")}">
        </div>
      </div>`;

    return new Promise((resolve) => {
      let captured = null;
      const dlg = new foundry.applications.api.DialogV2({
        window: { title: L("SBE.Objet.CreateTitle") },
        position: { width: 380 },
        content,
        buttons: [
          {
            action: "ok", label: L("SBE.Common.Create"), icon: "fa-solid fa-check", default: true,
            callback: (event, button, dialog) => {
              const el = dialog.element;
              captured = {
                choice: el.querySelector('[name="choice"]')?.value ?? "template",
                modelId: el.querySelector('[name="modelId"]')?.value ?? "",
                name: el.querySelector('[name="name"]')?.value?.trim() ?? ""
              };
              return "ok";
            }
          },
          { action: "cancel", label: L("SBE.Common.Cancel"), icon: "fa-solid fa-xmark" }
        ]
      });

      dlg.addEventListener("close", async () => {
        if (!captured) return resolve(null);
        try {
          if (captured.choice === "template") {
            return resolve(await this.implementation.create({
              name: captured.name || L("SBE.Template.NewName"),
              type: "template",
              folder: data.folder ?? null
            }, { ...createOptions, renderSheet: true }));
          }
          const tpl = game.items.get(captured.modelId);
          if (!tpl) return resolve(null);
          return resolve(await this.createFromTemplate(tpl, {
            name: captured.name, folder: data.folder ?? null, createOptions
          }));
        } catch (err) {
          console.warn("SBE | Création en échec", err);
          resolve(null);
        }
      }, { once: true });

      dlg.render({ force: true });

      /* Le menu du modèle n'apparaît que pour « Objet ». */
      const wire = () => {
        const root = dlg.element;
        if (!root) { setTimeout(wire, 30); return; }
        const choice = root.querySelector('[name="choice"]');
        const modelBox = root.querySelector(".sbe-create-model");
        const sync = () => {
          if (modelBox) modelBox.style.display = (choice?.value === "objet") ? "" : "none";
        };
        choice?.addEventListener("change", sync);
        sync();
      };
      setTimeout(wire, 30);
    });
  }

  /**
   * Crée un MODÈLE depuis un template : rattachement par ID, version
   * de structure mémorisée, valeurs par défaut matérialisées.
   */
  static async createFromTemplate(tpl, { name = "", folder = null, createOptions = {} } = {}) {
    const { walkElements } = await import("../builder/element-renderer.mjs");
    const values = {};
    /* Défauts de TOUT l'arbre (cadres, colonnes, onglets compris). */
    for (const el of walkElements(tpl.system.elements ?? [])) {
      if (el?.key && el.config?.default !== undefined) values[el.key] = el.config.default;
    }
    /* L'objet hérite de l'image du modèle ; si le modèle n'a pas de
       vraie image (sac natif ou icône par défaut des modèles),
       l'objet prend la SIENNE (le cube). */
    const generic = [DEFAULT_TEMPLATE_ICON, "icons/svg/item-bag.svg", ""];
    const img = (tpl.img && !generic.includes(tpl.img)) ? tpl.img : DEFAULT_OBJECT_ICON;
    return this.implementation.create({
      name: name || tpl.name,
      type: "objet",
      img,
      folder,
      system: {
        templateId: tpl.id,
        templateVersion: tpl.system.structVersion ?? 0,
        values
      }
    }, { ...createOptions, renderSheet: true });
  }
}
