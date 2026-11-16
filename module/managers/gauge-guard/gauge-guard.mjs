/**
 * SBE — PLAFOND STRICT DES JAUGES CALCULÉES
 *
 * Une jauge CALCULÉE (le poids porté, l'encombrement, la charge
 * mentale… ce que le créateur invente) peut être réglée « ne jamais
 * dépasser le maximum » : tout changement de la fiche qui la ferait
 * passer au-dessus est REFUSÉ, avec le message choisi par le créateur.
 *
 * Rien n'est câblé sur le « poids » : la règle vit sur la jauge, par sa
 * clé. N'importe quel MJ la reprend pour autre chose.
 *
 * Contrôlé au seul endroit par où tout passe — la création et la
 * modification des objets portés, et des valeurs de la fiche : un
 * glisser-déposer, un échange, un coffre, une fabrication, une pile
 * qui grossit, un objet rangé ailleurs… sont tous couverts.
 *
 * Règle : refus si, APRÈS le changement, la jauge dépasse son maximum
 * ET a augmenté. Retirer un objet reste toujours possible, même en
 * surcharge ; une baisse du maximum (attribut perdu) ne bloque rien.
 *
 * Joueur : refus + message. MJ : refus aussi si la jauge l'y soumet, ou
 * pendant un travail de fond (la demande d'un joueur qu'il exécute) ;
 * sinon une confirmation (actuel → après / max), comme l'ancien système.
 */

import { walkElements, valueBounds } from "../../builder/element-renderer.mjs";
import { buildInventory } from "../../builder/inventory.mjs";
import { computeAll, buildScope } from "../../builder/formula-engine.mjs";
import { contributionsOf } from "../../builder/contributions.mjs";
import { scopeFunctionsOf } from "../../builder/doc-scope.mjs";
import { backgroundWork } from "../../helpers/socket.mjs";

/* Objets d'un même lot de création (par objet d'options), par fiche. */
const BATCHES = new WeakMap();
const r3 = (n) => Math.round(Number(n || 0) * 1000) / 1000;

export class GaugeGuard {

  /** Jauges à plafond strict du modèle de cette fiche. */
  static guardedOf(actor) {
    const els = actor?.system?.template?.system?.elements ?? [];
    return [...walkElements(els)].filter(e => e?.kind === "gauge" && e.key
      && e.config?.computed && e.config?.blockMax);
  }

  /**
   * État des jauges gardées pour une liste d'objets portés donnée.
   * @returns {Map<string,{value:number,max:number}>}
   */
  static states(actor, items, values = null) {
    const els = actor.system.template.system.elements;
    const vals = values ?? actor.system?.values ?? {};
    const inventory = buildInventory({ documentName: "Actor", id: actor.id, items });
    const contributions = contributionsOf(actor);
    const functions = scopeFunctionsOf({ system: { template: actor.system.template, values: vals } }, contributions);
    const ctx = { inventory, contributions, functions };
    const { results } = computeAll(els, vals, ctx);
    /* Portée COMPLÈTE (fonctions d'inventaire comprises) : un maximum
       en formule qui lit l'équipement porté (carried(…)) doit se
       calculer ici comme sur la fiche — sinon il retombait à 0. */
    const scope = buildScope(els, vals, ctx);
    const out = new Map();
    for (const el of this.guardedOf(actor)) {
      out.set(el.key, {
        el,
        value: Number(results[el.key]) || 0,
        max: valueBounds(el, scope).max
      });
    }
    return out;
  }

  /**
   * Compare avant / après et décide.
   * @param {Actor} actor
   * @param {Array} itemsAfter  objets portés après le changement
   * @param {object} [o]
   * @param {object} [o.valuesAfter]  valeurs de la fiche après
   * @param {string} [o.itemName]     objet en cause (message)
   * @returns {Promise<boolean>} true = le changement peut avoir lieu
   */
  static async allow(actor, itemsAfter, { valuesAfter = null, itemName = "" } = {}) {
    if (!actor || actor.type !== "personnage" || !this.guardedOf(actor).length) return true;
    let before, after;
    try {
      before = this.states(actor, [...actor.items]);
      after = this.states(actor, itemsAfter, valuesAfter);
    } catch (err) {
      console.warn("SBE | Plafond des jauges : calcul impossible, changement laissé passer", err);
      return true;
    }
    for (const [key, a] of after) {
      const b = before.get(key) ?? { value: 0 };
      if (!(a.value > a.max + 1e-9) || !(a.value > b.value + 1e-9)) continue;
      const data = {
        nom: actor.name ?? "",
        objet: itemName || game.i18n.localize("SBE.Gauge.BlockThisItem"),
        jauge: a.el.label || key,
        avant: r3(b.value), apres: r3(a.value), max: r3(a.max)
      };
      /* Travail de fond du MJ (achat d'un joueur, récompense, décompte…) :
         personne pour répondre à la question — le refus s'applique. */
      const subject = !game.user.isGM || a.el.config.blockGm || backgroundWork();
      if (subject) {
        const tpl = String(a.el.config.blockMsg ?? "").trim()
          || game.i18n.localize("SBE.Gauge.BlockMsgDefault");
        ui.notifications.warn(tpl.replace(/\{(nom|objet|jauge|avant|apres|max)\}/g, (_m, k) => String(data[k])));
        return false;
      }
      const esc = (s) => foundry.utils.escapeHTML(String(s));
      const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.format("SBE.Gauge.BlockTitle", { jauge: data.jauge }) },
        content: `<p>${game.i18n.format("SBE.Gauge.BlockIntro", { objet: `<b>${esc(data.objet)}</b>`, nom: `<b>${esc(data.nom)}</b>`, jauge: esc(data.jauge) })}</p>
          <p style="margin:8px 0;padding:6px 10px;background:rgba(0,0,0,0.05);border-radius:4px;">
            ${game.i18n.localize("SBE.Gauge.BlockNow")} : <b>${data.avant}</b> / ${data.max}<br>
            ${game.i18n.localize("SBE.Gauge.BlockAfter")} : <b style="color:#b03030;">${data.apres}</b> / ${data.max}
          </p>
          <p>${game.i18n.localize("SBE.Gauge.BlockAsk")}</p>`,
        yes: { label: game.i18n.localize("SBE.Gauge.BlockContinue"), icon: "fa-solid fa-check" },
        no: { label: game.i18n.localize("SBE.Common.Cancel"), icon: "fa-solid fa-xmark" },
        rejectClose: false
      }).catch(() => false);
      if (!ok) return false;
    }
    return true;
  }

  /* ---------------- points d'entrée (documents) ---------------- */

  /** Un objet va être CRÉÉ sur une fiche (il est `item`, pas encore enregistré). */
  static async onItemCreate(item, options = null) {
    const actor = item.parent;
    if (actor?.documentName !== "Actor" || item.type !== "objet") return true;
    /* Plusieurs objets créés d'un coup (un sac et son contenu, un
       échange) : chacun compte avec ceux du même lot déjà acceptés. */
    const batch = options && typeof options === "object" ? (BATCHES.get(options) ?? new Map()) : null;
    if (batch) BATCHES.set(options, batch);
    const before = batch?.get(actor.uuid) ?? [];
    const ok = await this.allow(actor, [...actor.items, ...before, item], { itemName: item.name });
    if (ok && batch) batch.set(actor.uuid, [...before, item]);
    return ok;
  }

  /** Un objet porté va être MODIFIÉ (pile, rangement, valeurs). */
  static async onItemUpdate(item, changes) {
    const actor = item.parent;
    if (actor?.documentName !== "Actor" || item.type !== "objet") return true;
    if (!foundry.utils.hasProperty(changes, "system")) return true;
    const next = item.clone(changes, { keepId: true });
    const items = [...actor.items].map(it => it.id === item.id ? next : it);
    return this.allow(actor, items, { itemName: item.name });
  }

  /** Les valeurs de la fiche vont changer (une formule de jauge peut les lire). */
  static async onActorUpdate(actor, changes) {
    if (actor.type !== "personnage") return true;
    const vals = foundry.utils.getProperty(changes, "system.values");
    const flat = Object.keys(changes ?? {}).filter(k => k.startsWith("system.values."));
    if (!vals && !flat.length) return true;
    const merged = foundry.utils.mergeObject(foundry.utils.deepClone(actor.system?.values ?? {}), vals ?? {}, { inplace: false });
    for (const k of flat) merged[k.slice(14)] = changes[k];
    return this.allow(actor, [...actor.items], { valuesAfter: merged });
  }
}
