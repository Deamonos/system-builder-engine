/**
 * SBE — OBJETS NON IDENTIFIÉS
 *
 * Un modèle d'objet coché « Peut être non identifié » désigne une CLÉ
 * (une case, `identifie` par défaut). Tant qu'elle est fausse sur un
 * objet, les JOUEURS voient sa version inconnue — nom, image et
 * description réglés par le MJ sur l'objet du monde (`flags.sbe.unid`)
 * — partout : fiche, inventaire, info-bulle, chat, échanges. Le MJ voit
 * toujours le vrai objet.
 *
 * Même approche que l'identité des PNJ : le masque est posé À LA SOURCE
 * (données préparées sur le poste du joueur, jamais enregistrées) ; un
 * joueur ne peut pas réécrire le nom, l'image ou la description d'un
 * objet qu'il ne connaît pas.
 *
 * Identifier : n'importe quel bouton qui coche la clé (jet, compétence),
 * ou le MJ (menu de la fiche, clic droit dans l'inventaire). Option du
 * modèle : identifier un exemplaire identifie tous ceux du même objet
 * du monde (fait par le MJ principal).
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { isPrimaryGM } from "../../helpers/socket.mjs";
import { registerItemTipGate } from "../../builder/element-renderer.mjs";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const FLAG = "unid";

export class ItemIdentity {

  /**
   * Réglage : celui du MODÈLE (tous ses objets), sinon celui de CET
   * objet (ou de son objet du monde) — un objet précis peut être non
   * identifié sans que son modèle le soit. { key, group } ou null.
   */
  static configOf(item) {
    if (item?.type !== "objet") return null;
    const o = item.system?.template?.system?.opts;
    if (o?.unid && o.unidKey) return { key: String(o.unidKey), group: !!o.unidGroup, byModel: true };
    const f = this.#flagOf(item);
    if (f?.on && f.key) return { key: String(f.key), group: !!f.group, byModel: false };
    return null;
  }

  /** Réglage propre : sur l'objet, sinon sur son objet du monde. */
  static #flagOf(item) {
    const own = item?.flags?.[SYSTEM_ID]?.[FLAG];
    if (own?.on !== undefined) return own;
    return this.#modelOf(item)?.flags?.[SYSTEM_ID]?.[FLAG] ?? null;
  }

  /** L'objet du monde dont il est l'exemplaire (ou lui-même). */
  static #modelOf(item) {
    const id = item?.system?.modelId;
    return (id && game.items?.get(id)) || item;
  }

  /** Version inconnue : sur l'objet, sinon sur son objet du monde. */
  static unknownOf(item) {
    const own = item?.flags?.[SYSTEM_ID]?.[FLAG];
    const mod = this.#modelOf(item)?.flags?.[SYSTEM_ID]?.[FLAG];
    const u = own && (own.name || own.img || own.desc) ? own : (mod ?? {});
    return { name: String(u.name ?? ""), img: String(u.img ?? ""), desc: String(u.desc ?? "") };
  }

  static isUnidentified(item) {
    const c = this.configOf(item);
    if (!c) return false;
    const src = item._source?.system?.values ?? item.system?.values ?? {};
    return !src[c.key];
  }

  /* ============================================================ */
  /*  Masque à la source (poste joueur)                            */
  /* ============================================================ */

  static mask(item) {
    try {
      if (!item || item.type !== "objet" || !game.user || game.user.isGM) return;
      if (!this.isUnidentified(item)) {
        if (item._sbeUnid) {
          item.name = item._source.name;
          item.img = item._source.img;
          item.system.description = item._source.system?.description ?? "";
          item._sbeUnid = false;
        }
        return;
      }
      const u = this.unknownOf(item);
      item.name = u.name || L("SBE.Unid.DefaultName");
      if (u.img) item.img = u.img;
      item.system.description = u.desc;
      item._sbeUnid = true;
    } catch (_e) { /* ne jamais casser la préparation d'un document */ }
  }

  static #wrap(cls) {
    const proto = cls?.prototype;
    if (!proto || proto.__sbeUnidWrapped) return;
    const orig = proto.prepareDerivedData;
    proto.prepareDerivedData = function (...args) {
      if (typeof orig === "function") orig.apply(this, args);
      ItemIdentity.mask(this);
    };
    proto.__sbeUnidWrapped = true;
  }

  /* ============================================================ */
  /*  Identifier / rendre inconnu (MJ)                             */
  /* ============================================================ */

  static async setIdentified(item, on) {
    const c = this.configOf(item);
    if (!c) return;
    await item.update({ [`system.values.${c.key}`]: !!on });
  }

  /** Entrée du clic droit d'inventaire (MJ). */
  static menuEntry(item) {
    if (!game.user.isGM || !this.configOf(item)) return null;
    const unknown = this.isUnidentified(item);
    return {
      label: L(unknown ? "SBE.Unid.Identify" : "SBE.Unid.Forget"),
      icon: unknown ? "fa-solid fa-magnifying-glass" : "fa-solid fa-question",
      onClick: () => this.setIdentified(item, unknown)
    };
  }

  /** Fenêtre du MJ : la version inconnue et l'état de l'objet. */
  static async dialog(item) {
    if (!game.user.isGM || item?.type !== "objet") return;
    const u = item.flags?.[SYSTEM_ID]?.[FLAG] ?? {};
    const cfg = this.configOf(item);
    const byModel = !!cfg?.byModel;
    const known = !this.isUnidentified(item);
    /* Réglage propre à cet objet (son modèle ne le prévoit pas). */
    const own = byModel ? `<p class="notes">${esc(L("SBE.Unid.ByModel", { key: cfg.key }))}</p>` : `
      <div class="form-group"><label>${esc(L("SBE.Unid.Key"))}</label>
        <input type="text" name="key" value="${esc(u.key || "")}" placeholder="${esc(L("SBE.Ph.UnidKey"))}">
        <p class="notes">${esc(L("SBE.Unid.KeyHint"))}</p></div>
      <label class="sbe-unid-known"><input type="checkbox" name="group" ${u.group ? "checked" : ""}> ${esc(L("SBE.Unid.Group"))}</label>`;
    const content = `<div class="sbe-unid-dlg">
      <label class="sbe-unid-known"><input type="checkbox" name="unknown" ${cfg && !known ? "checked" : ""}> ${esc(L("SBE.Unid.MakeUnknown"))}</label>
      <p class="notes">${esc(L("SBE.Unid.DlgHint"))}</p>
      ${own}
      <div class="form-group"><label>${esc(L("SBE.Unid.Name"))}</label>
        <input type="text" name="name" value="${esc(u.name)}" placeholder="${esc(L("SBE.Unid.DefaultName"))}"></div>
      <div class="form-group"><label>${esc(L("SBE.Unid.Img"))}</label>
        <div class="form-fields"><input type="text" name="img" value="${esc(u.img)}" placeholder="—">
        <button type="button" class="sbe-unid-pick"><i class="fa-solid fa-file-image"></i></button></div></div>
      <div class="form-group"><label>${esc(L("SBE.Unid.Desc"))}</label>
        <textarea name="desc" rows="5">${esc(u.desc)}</textarea></div>
    </div>`;
    const res = await foundry.applications.api.DialogV2.prompt({
      window: { title: L("SBE.Unid.DlgTitle", { name: item.name }), icon: "fa-solid fa-question" },
      position: { width: 480 },
      content,
      render: (_ev, dlg) => {
        const root = dlg.element ?? dlg;
        root.querySelector(".sbe-unid-pick")?.addEventListener("click", () => {
          const input = root.querySelector('[name="img"]');
          const FP = foundry.applications.apps.FilePicker.implementation;
          new FP({ type: "image", current: input.value, callback: (p) => { input.value = p; } }).render(true);
        });
      },
      ok: {
        label: L("SBE.Common.Validate"),
        callback: (_e, b) => {
          const f = b.form.elements;
          return { name: f.name.value.trim(), img: f.img.value.trim(), desc: f.desc.value, known: !f.unknown.checked,
            on: byModel ? undefined : (f.unknown.checked || !!u.on), key: f.key?.value.trim() ?? "", group: !!f.group?.checked };
        }
      },
      rejectClose: false
    }).catch(() => null);
    if (!res) return;
    const data = { name: res.name, img: res.img, desc: res.desc };
    let key = cfg?.key ?? "";
    if (!byModel) {
      /* Clé donnée une fois (langue du MJ à ce moment), puis stable. */
      key = res.key || u.key || L("SBE.Ph.UnidKey");
      if (!/^[A-Za-z_]\w*$/.test(key)) { ui.notifications.error(L("SBE.Unid.BadKey")); return; }
      Object.assign(data, { on: res.on, key, group: res.group });
    }
    const upd = { [`flags.${SYSTEM_ID}.${FLAG}`]: data };
    if (key && (byModel || res.on)) upd[`system.values.${key}`] = res.known;
    await item.update(upd);
  }

  /* ============================================================ */
  /*  Branchements                                                 */
  /* ============================================================ */

  static init() {
    this.#wrap(CONFIG.Item?.documentClass);

    /* Info-bulle d'un objet inconnu : son nom et sa description inconnue,
       rien d'autre (ni étiquettes, ni champs, ni effets). */
    registerItemTipGate((item, isGM) => {
      if (isGM || !this.isUnidentified(item)) return null;
      const desc = String(item.system?.description ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      const short = desc.length > 160 ? `${desc.slice(0, 157)}…` : desc;
      return `<div class="sbe-tt sbe-itt"><div class="sbe-itt-name">${esc(item.name)}</div>${short ? `<div class="sbe-itt-rows"><div class="sbe-itt-row">${esc(short)}</div></div>` : ""}</div>`;
    });

    /* Option cochée sans clé : une clé est donnée UNE fois (dans la
       langue du MJ à ce moment ; elle ne change plus ensuite). */
    Hooks.on("preUpdateItem", (item, changes) => {
      if (item.type !== "template") return;
      const on = foundry.utils.getProperty(changes, "system.opts.unid");
      const key = foundry.utils.getProperty(changes, "system.opts.unidKey") ?? item.system?.opts?.unidKey;
      if (on && !key) foundry.utils.setProperty(changes, "system.opts.unidKey", L("SBE.Ph.UnidKey"));
    });

    /* Un joueur ne réécrit pas ce qu'il ne connaît pas. */
    Hooks.on("preUpdateItem", (item, changes, _o, userId) => {
      if (game.users?.get(userId)?.isGM || !this.isUnidentified(item)) return;
      delete changes.name;
      delete changes.img;
      if (changes.system && "description" in changes.system) delete changes.system.description;
      delete changes["system.description"];
    });

    /* Identifier un exemplaire : tous ceux du même objet du monde (option). */
    Hooks.on("updateItem", async (item, changes) => {
      if (!isPrimaryGM()) return;
      const c = this.configOf(item);
      if (!c?.group) return;
      const v = foundry.utils.getProperty(changes, `system.values.${c.key}`);
      if (v === undefined) return;
      const groupId = item.system?.modelId || item.id;
      const all = new Set(game.items?.contents ?? []);
      for (const a of game.actors ?? []) for (const it of a.items) all.add(it);
      for (const sc of game.scenes ?? []) for (const t of sc.tokens) if (!t.actorLink && t.actor) for (const it of t.actor.items) all.add(it);
      for (const it of all) {
        if (it === item || it.type !== "objet") continue;
        if ((it.system?.modelId || it.id) !== groupId) continue;
        if (!!it.system?.values?.[c.key] === !!v) continue;
        await it.update({ [`system.values.${c.key}`]: !!v });
      }
    });
  }
}
