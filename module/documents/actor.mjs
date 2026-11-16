/**
 * SBE — Document Actor étendu
 *
 * Même patron d'intégrité que les objets :
 * - « Créer un personnage » propose Modèle ou Personnage (depuis quel
 *   modèle) — un personnage n'existe JAMAIS sans modèle ;
 * - supprimer un modèle référencé est bloqué ;
 * - PJ / PNJ automatique : la fiche appartient à un joueur → PJ,
 *   sinon PNJ (getter isPJ, aucun réglage à faire) ;
 * - icône : le modèle reçoit le SVG SBE ; la fiche de personnage
 *   GARDE l'icône d'origine de Foundry (décision actée).
 */

import { clampValueChanges, applyTempPoints } from "../builder/doc-context.mjs";
import { GaugeGuard } from "../managers/gauge-guard/gauge-guard.mjs";
import { OrphanCleanup } from "../managers/cleanup/orphan-cleanup.mjs";

const DEFAULT_TEMPLATE_ICON = "systems/system-builder-engine/assets/icons/modele.svg";

export class SBEActor extends Actor {

  /** PJ si un joueur (non-MJ) possède la fiche, PNJ sinon. */
  get isPJ() {
    return this.hasPlayerOwner;
  }

  /**
   * Barre de pion branchée sur une jauge SBE (« values.pv ») : le HUD
   * écrit dans la VALEUR de la jauge (pas dans « .value »). C'est une
   * écriture « de jeu » : les points temporaires encaissent d'abord,
   * et les bornes s'appliquent.
   */
  async modifyTokenAttribute(attribute, value, isDelta = false, isBar = true) {
    if (this.type === "personnage" && /^values\.[a-z][a-z0-9_]*$/.test(String(attribute))) {
      const key = attribute.slice(7);
      const cur = Number(this.system.values?.[key]) || 0;
      let next;
      if (isDelta) next = cur + Number(value);
      else {
        /* La barre compte depuis le minimum de la jauge. */
        const { TempPoints } = await import("../managers/temp/temp-points.mjs");
        const d = isBar ? TempPoints.barData(this, attribute) : null;
        next = Number(value) + (d ? cur - d.value : 0);
      }
      if (!Number.isFinite(next) || next === cur) return this;
      const updates = { [`system.values.${key}`]: next };
      const allowed = Hooks.call("modifyTokenAttribute", { attribute, value, isDelta, isBar }, updates, this);
      return allowed !== false ? this.update(updates) : this;
    }
    return super.modifyTokenAttribute(attribute, value, isDelta, isBar);
  }

  /** Tous les personnages du monde construits sur ce modèle. */
  get dependentActors() {
    if (this.type !== "template") return [];
    return game.actors.filter(a => a.type === "personnage" && a.system.templateId === this.id);
  }

  /** @override */
  async _preCreate(data, options, user) {
    if (this.type === "personnage" && !this.system.templateId) {
      ui.notifications.error(game.i18n.localize("SBE.Actor.NeedsTemplate"));
      return false;
    }
    /* Icône du modèle uniquement — la fiche garde celle de Foundry. */
    if (this.type === "template" && (!data.img || data.img === "icons/svg/mystery-man.svg")) {
      this.updateSource({ img: DEFAULT_TEMPLATE_ICON });
    }
    return super._preCreate(data, options, user);
  }

  /** @override — valeurs ramenées dans leurs bornes, quel que soit le chemin. */
  async _preUpdate(changes, options, user) {
    /* Retour en arrière (managers/undo) : l'état d'avant, tel quel. */
    if (this.type === "personnage" && !options?.sbeUndo && !(await GaugeGuard.onActorUpdate(this, changes))) return false;
    /* Valeur ramenée à une borne déjà atteinte (95 → 95) : rien ne
       change côté serveur, donc la fiche ne se redessinerait pas et
       garderait « 120 » affiché — on la redessine. */
    /* Points temporaires : donner / encaisser AVANT les bornes. */
    if (this.type === "personnage") applyTempPoints(this, changes, options);
    /* Réactions « Avant qu'une valeur baisse » : elles peuvent changer la baisse avant les bornes. */
    const touchesValues = foundry.utils.hasProperty(changes, "system.values") || Object.keys(changes ?? {}).some(k => k.startsWith("system.values."));
    if (this.type === "personnage" && !options?.sbeDirect && touchesValues) {
      const { ActionTriggers } = await import("../managers/triggers/action-triggers.mjs");
      await ActionTriggers.beforeDrop(this, changes, options);
    }
    if (this.type === "personnage" && clampValueChanges(this, changes)) {
      setTimeout(() => { if (this.sheet?.rendered) this.sheet.render(); }, 0);
    }
    return super._preUpdate(changes, options, user);
  }

  /** @override */
  async _preDelete(options, user) {
    /* Même standard que les modèles d'objets : jamais de blocage. On
       prévient — fiches et jetons, scène par scène — et si le MJ
       confirme, tout ce qui découle du modèle part avec lui. */
    if (this.type === "template" && !options?.sbeCascade) {
      const ok = await this.#cascadeTemplate();
      if (!ok) return false;
    }
    return super._preDelete(options, user);
  }

  /**
   * Suppression EN CASCADE d'un modèle de personnage : les fiches
   * construites dessus (PJ et PNJ, avec tout ce qu'elles portent) et
   * leurs jetons sur toutes les scènes — sans quoi des jetons sans
   * fiche traîneraient sur les cartes.
   * @returns {Promise<boolean>}
   */
  async #cascadeTemplate() {
    const actors = this.dependentActors;
    if (!actors.length) return true;
    const ids = new Set(actors.map(a => a.id));
    const byScene = [];
    let tokenCount = 0;
    for (const scene of game.scenes) {
      const toks = scene.tokens.filter(t => ids.has(t.actorId));
      if (!toks.length) continue;
      byScene.push({ scene, ids: toks.map(t => t.id) });
      tokenCount += toks.length;
    }

    const esc = (x) => foundry.utils.escapeHTML(String(x ?? ""));
    const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
    const pj = actors.filter(a => a.hasPlayerOwner).length;
    const names = actors.slice(0, 6).map(a => a.name).join(", ") + (actors.length > 6 ? ` +${actors.length - 6}` : "");
    const lines = [L("SBE.Orphan.ActSheets", { n: actors.length, pj, pnj: actors.length - pj, who: esc(names) })];
    if (tokenCount) lines.push(L("SBE.Orphan.ActTokens", { n: tokenCount, s: byScene.length }));

    const ok = await OrphanCleanup.confirmCascade({
      title: L("SBE.Orphan.TplTitle", { name: this.name }),
      intro: L("SBE.Orphan.ActIntro", { name: esc(this.name) }),
      lines,
      warn: L("SBE.Orphan.ActWarn")
    });
    if (!ok) return false;

    /* Les jetons d'abord (scène par scène, en un seul appel chacune),
       puis les fiches en un seul appel. */
    for (const { scene, ids: tokIds } of byScene) {
      try { await scene.deleteEmbeddedDocuments("Token", tokIds); }
      catch (err) { console.warn("SBE | Cascade : jetons non supprimés sur", scene.name, err); }
    }
    try {
      await Actor.implementation.deleteDocuments([...ids], { sbeCascade: true });
    } catch (err) {
      console.warn("SBE | Cascade : fiches non supprimées", err);
    }
    ui.notifications.info(L("SBE.Orphan.ActDone", { n: actors.length, t: tokenCount }));
    return true;
  }

  /* ---------------------------------------------------------- */
  /*  « Créer un personnage »                                    */
  /* ---------------------------------------------------------- */

  /** @override */
  static async createDialog(data = {}, createOptions = {}, _options = {}) {
    const L = (k) => game.i18n.localize(k);
    /* Les modèles de boutique ne servent pas à créer des personnages. */
    const templates = game.actors.filter(a => a.type === "template" && a.system?.genre !== "shop")
      .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));

    const modelOpts = templates.map(t =>
      `<option value="${t.id}">${foundry.utils.escapeHTML(t.name)}</option>`).join("");

    const content = `
      <div style="display:flex;flex-direction:column;gap:8px;">
        <div class="form-group">
          <label style="flex:0 0 8.5rem;">${L("SBE.Objet.CreateType")}</label>
          <select name="choice" style="flex:1;">
            <option value="template">${L("SBE.Template.CreateChoice")}</option>
            <option value="personnage" ${templates.length ? "" : "disabled"}>${L("SBE.Actor.CreateChoicePerso")}</option>
            ${game.user.isGM ? `<option value="groupe">${L("TYPES.Actor.groupe")}</option>` : ""}
          </select>
        </div>
        ${templates.length ? "" : `<p class="notes" style="margin:0;">${L("SBE.Actor.NoTemplatesHint")}</p>`}
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
        window: { title: L("SBE.Actor.CreateTitle") },
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
          /* Les modèles de boutique se créent dans le manager « Marchands et monnaies ». */
          if (captured.choice === "template") {
            return resolve(await this.implementation.create({
              name: captured.name || L("SBE.Template.NewName"),
              type: "template",
              system: {},
              folder: data.folder ?? null
            }, { ...createOptions, renderSheet: true }));
          }
          if (captured.choice === "groupe") {
            return resolve(await this.implementation.create({
              name: captured.name || L("TYPES.Actor.groupe"),
              type: "groupe",
              folder: data.folder ?? null
            }, { ...createOptions, renderSheet: true }));
          }
          const tpl = game.actors.get(captured.modelId);
          if (!tpl) return resolve(null);
          return resolve(await this.createFromTemplate(tpl, {
            name: captured.name, folder: data.folder ?? null, createOptions
          }));
        } catch (err) {
          console.warn("SBE | Création de personnage en échec", err);
          resolve(null);
        }
      }, { once: true });

      dlg.render({ force: true });

      const wire = () => {
        const root = dlg.element;
        if (!root) { setTimeout(wire, 30); return; }
        const choice = root.querySelector('[name="choice"]');
        const modelBox = root.querySelector(".sbe-create-model");
        const sync = () => {
          if (modelBox) modelBox.style.display = (choice?.value === "personnage") ? "" : "none";
        };
        choice?.addEventListener("change", sync);
        sync();
      };
      setTimeout(wire, 30);
    });
  }

  /** Crée une FICHE depuis un modèle : rattachement + défauts. */
  static async createFromTemplate(tpl, { name = "", folder = null, createOptions = {} } = {}) {
    const { walkElements } = await import("../builder/element-renderer.mjs");
    const values = {};
    for (const el of walkElements(tpl.system.elements ?? [])) {
      if (el?.key && el.config?.default !== undefined) values[el.key] = el.config.default;
    }
    return this.implementation.create({
      name: name || tpl.name,
      type: "personnage",
      /* Pas d'icône imposée : la fiche garde celle d'origine Foundry. */
      folder,
      system: {
        templateId: tpl.id,
        templateVersion: tpl.system.structVersion ?? 0,
        values
      }
    }, { ...createOptions, renderSheet: true });
  }
}
