/**
 * SBE — PROPAGATION des modifications d'un modèle d'objet
 *
 * Quand le MJ modifie un MODÈLE (objet du monde, sans modelId), ses
 * INSTANCES — les exemplaires portés par les personnages, ou posés
 * ailleurs dans le monde — peuvent suivre.
 *
 * Ce qui suit, élément par élément, c'est le CRÉATEUR qui le décide :
 * chaque élément à valeur porte la case « propager aux objets
 * existants », COCHÉE par défaut. Une valeur d'état propre à chaque
 * exemplaire (usure, état, munitions engagées…) se décoche, et ne sera
 * jamais écrasée. C'est la version SBE de la liste de champs protégés
 * de l'ancien système : la liste n'est plus écrite dans le code, elle
 * vit dans le modèle.
 *
 * Nom, image et description suivent aussi, MAIS seulement sur les
 * exemplaires qui ne les ont pas personnalisés : un fusil renommé
 * « le fusil de Jack » garde son nom.
 *
 * Le MJ voit la liste des champs changés et le nombre d'objets
 * touchés, et confirme — rien ne se réécrit dans son dos.
 *
 * Seul le client qui a fait la modification pose la question : pas
 * de fenêtre en double chez les autres MJ.
 */

import { walkElements, QUANTITY_KEY } from "../../builder/element-renderer.mjs";
import { findItems } from "../locations/item-locations.mjs";

/* Types d'éléments qui stockent une valeur dans system.values. */
const VALUE_KINDS = new Set([
  "text", "richtext", "number", "checkbox", "color", "select", "image", "gauge", "table", "slot", "container"
]);

/** Cet élément suit-il son modèle ? (oui par défaut) */
export function isPropagated(el) {
  if (!el?.key || !VALUE_KINDS.has(el.kind)) return false;
  if (el.key === QUANTITY_KEY || el.kind === "quantity") return false;   /* toujours propre à la pile */
  if (el.kind === "number" && el.config?.computed) return false;        /* rien de stocké */
  if (el.kind === "slot" && el.config?.mode !== "reference") return false; /* objets portés */
  if (el.kind === "container" && el.config?.mode !== "reference") return false; /* idem */
  return el.propagate !== false;
}

/** Clés d'un modèle qui suivent, et celles qui restent propres. */
export function propagationKeys(tplElements) {
  const follow = new Set();
  const own = new Set();
  for (const el of walkElements(tplElements ?? [])) {
    if (!el?.key) continue;
    if (isPropagated(el)) follow.add(el.key);
    else own.add(el.key);
  }
  return { follow, own };
}

export class PropagationManager {

  static _bound = false;
  /** États d'avant modification, par uuid de modèle. */
  static _before = new Map();

  static init() {
    if (this._bound) return;
    this._bound = true;
    Hooks.on("preUpdateItem", (item, changes, options, userId) =>
      this._onPreUpdate(item, changes, options, userId));
    Hooks.on("updateItem", (item, changes, options, userId) =>
      this._onUpdate(item, changes, options, userId));
  }

  /** Un modèle d'objet du monde ? */
  static _isWorldModel(item) {
    return item?.type === "objet" && !item.parent && !item.system?.modelId;
  }

  static _onPreUpdate(item, changes, options, userId) {
    if (options?.sbePropagation) return;
    if (userId !== game.user.id || !game.user.isGM) return;
    if (!this._isWorldModel(item)) return;
    /* Seul ce qui peut se propager nous intéresse. */
    const touches = changes?.system?.values || "name" in (changes ?? {})
      || "img" in (changes ?? {}) || changes?.system?.description !== undefined;
    if (!touches) return;
    this._before.set(item.uuid, {
      name: item.name,
      img: item.img,
      description: item.system.description ?? "",
      values: foundry.utils.deepClone(item.system.values ?? {})
    });
  }

  static async _onUpdate(item, _changes, options, userId) {
    if (options?.sbePropagation) return;
    if (userId !== game.user.id || !game.user.isGM) return;
    const before = this._before.get(item.uuid);
    this._before.delete(item.uuid);
    if (!before) return;

    const tplEls = item.system.template?.system?.elements ?? [];
    const { follow } = propagationKeys(tplEls);
    const labels = new Map([...walkElements(tplEls)].filter(e => e?.key).map(e => [e.key, e.label || e.key]));

    /* --- Ce qui a changé et qui suit --- */
    const values = {};
    const now = item.system.values ?? {};
    for (const key of follow) {
      if (!foundry.utils.equals({ v: before.values[key] }, { v: now[key] })) values[key] = now[key];
    }
    const doc = {};
    if (before.name !== item.name) doc.name = { old: before.name, neu: item.name };
    if (before.img !== item.img) doc.img = { old: before.img, neu: item.img };
    if (before.description !== (item.system.description ?? "")) {
      doc.description = { old: before.description, neu: item.system.description ?? "" };
    }
    if (!Object.keys(values).length && !Object.keys(doc).length) return;

    /* --- Les exemplaires concernés --- */
    const targets = this.instancesOf(item);
    if (!targets.length) return;

    const ok = await this._confirm(item, values, doc, labels, targets);
    if (!ok) return;

    let done = 0, failed = 0;
    for (const t of targets) {
      const v = t.view;
      const change = { values: foundry.utils.deepClone(values) };
      /* Nom / image / description : seulement s'ils n'ont pas été
         personnalisés sur cet exemplaire. */
      if (doc.name && v.name === doc.name.old) change.name = doc.name.neu;
      if (doc.img && v.img === doc.img.old) change.img = doc.img.neu;
      if (doc.description && (v.system?.description ?? "") === doc.description.old) {
        change.description = doc.description.neu;
      }
      try {
        await t.update(change);
        done++;
      } catch (err) {
        console.warn("SBE | Propagation en échec sur", t.label, err);
        failed++;
      }
    }
    ui.notifications.info(game.i18n.format(failed ? "SBE.Propag.DonePartial" : "SBE.Propag.Done",
      { n: done, f: failed }));
  }

  /**
   * Tous les exemplaires d'un modèle, où qu'ils soient : le REGISTRE
   * DES EMPLACEMENTS les connaît tous (fiches, jetons non liés, monde,
   * coffres… et tout emplacement inscrit plus tard).
   */
  static instancesOf(model) {
    /* Le modèle lui-même est exclu par le DOCUMENT, pas par son id : un
       exemplaire peut porter le même id que son modèle (ancien dépôt). */
    return findItems((v, doc) => v.type === "objet" && doc !== model && v.system?.modelId === model.id);
  }

  /** Fenêtre de confirmation : champs changés + objets touchés. */
  static async _confirm(model, values, doc, labels, targets) {
    const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
    const L = (k) => game.i18n.localize(k);
    const show = (v) => {
      if (v === null || v === undefined || v === "") return "—";
      if (typeof v === "boolean") return v ? "✔" : "✘";
      if (typeof v === "object") return "…";
      const s = String(v);
      return s.length > 40 ? `${s.slice(0, 40)}…` : s;
    };

    const lines = [];
    if (doc.name) lines.push(`<li><b>${L("SBE.Propag.Name")}</b> → ${esc(doc.name.neu)}</li>`);
    if (doc.img) lines.push(`<li><b>${L("SBE.Propag.Img")}</b></li>`);
    if (doc.description) lines.push(`<li><b>${L("SBE.Propag.Desc")}</b></li>`);
    for (const [k, v] of Object.entries(values)) {
      lines.push(`<li><b>${esc(labels.get(k) ?? k)}</b> → ${esc(show(v))}</li>`);
    }

    /* Objets touchés, regroupés par porteur. */
    const byOwner = new Map();
    for (const t of targets) byOwner.set(t.label, (byOwner.get(t.label) ?? 0) + 1);
    const owners = [...byOwner.entries()].slice(0, 8)
      .map(([who, n]) => `<li>${esc(who)}${n > 1 ? ` <span class="sbe-propag-n">×${n}</span>` : ""}</li>`).join("");
    const more = byOwner.size > 8 ? `<li class="sbe-propag-more">+${byOwner.size - 8}</li>` : "";

    const content = `
      <div class="sbe-propag">
        <p>${game.i18n.format("SBE.Propag.Intro", { name: esc(model.name), n: targets.length })}</p>
        <div class="sbe-propag-box">
          <div class="sbe-propag-title">${L("SBE.Propag.Changed")}</div>
          <ul>${lines.join("")}</ul>
        </div>
        <div class="sbe-propag-box">
          <div class="sbe-propag-title">${L("SBE.Propag.Targets")}</div>
          <ul>${owners}${more}</ul>
        </div>
        <p class="notes"><i class="fa-solid fa-shield-halved"></i> ${L("SBE.Propag.SafeHint")}</p>
      </div>`;

    const res = await foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.format("SBE.Propag.Title", { name: model.name }) },
      position: { width: 480 },
      content,
      buttons: [
        { action: "yes", label: game.i18n.format("SBE.Propag.Yes", { n: targets.length }),
          icon: "fa-solid fa-arrows-rotate", default: true },
        { action: "no", label: L("SBE.Propag.No"), icon: "fa-solid fa-xmark" }
      ],
      rejectClose: false
    }).catch(() => null);
    return res === "yes";
  }
}
