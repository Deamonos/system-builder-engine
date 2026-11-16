/**
 * SBE — Onglet « Scène » d'un objet (MJ)
 *
 * Les réglages d'objet de scène PROPRES à cet objet : taille, image une
 * fois posé, distance, visibilité, droits, image selon une clé, PV.
 * Un champ vide hérite :
 *  - objet du monde → les valeurs par défaut de son modèle d'atelier ;
 *  - copie (inventaire, posée) → les réglages de son objet du monde.
 * L'onglet n'existe que si le modèle coche « Objet de scène ».
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { walkElements } from "../../builder/element-renderer.mjs";
import { PropManager, CFG_FLAG } from "./prop-manager.mjs";
import { trapTabHTML } from "../traps/trap-model.mjs";
import { cfCell, cfGrid, cfBase, wireCompactForm } from "../../helpers/compact-form.mjs";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (x) => foundry.utils.escapeHTML(String(x ?? ""));

export class ItemScene {

  static hasTab(item) {
    return game.user.isGM && item?.type === "objet" && PropManager.isPropItem(item);
  }

  /** Objet du monde dont cette copie suit les réglages (ou null). */
  static modelOf(item) {
    const m = item?.system?.modelId ? game.items?.get(item.system.modelId) : null;
    return m && m !== item ? m : null;
  }

  /** Ce que vaut chaque champ laissé vide (le niveau au-dessus). */
  static inheritedOf(item) {
    const tpl = item?.system?.template;
    const model = this.modelOf(item);
    return PropManager.mergeCfg(tpl?.system?.propCfg, model?.flags?.[SYSTEM_ID]?.[CFG_FLAG]);
  }

  static tabHTML(item) {
    const flag = PropManager.flagKeyOf(item);
    const raw = item.flags?.[SYSTEM_ID]?.[flag] ?? {};
    const base = this.inheritedOf(item);
    const model = this.modelOf(item);
    const keys = [...walkElements(item.system?.template?.system?.elements ?? [])].filter(e => e?.key);
    const numKeys = keys.filter(e => ["number", "gauge"].includes(e.kind));
    const has = (k) => raw[k] !== undefined && raw[k] !== null && raw[k] !== "";
    const inh = (txt) => L("SBE.Prop.Inherit", { v: txt });
    /* Une case de la grille : libellé, aide en bulle, condition d'affichage. */
    const field = (label, inner, { hint = "", show = "", wide = false } = {}) => cfCell(L(label), inner, { hint: hint ? L(hint) : "", show, wide });
    const sel = (name, list) => {
      const cur = has(name) ? raw[name] : "";
      return `<select data-k="${name}">
        <option value="">${esc(inh(L(`SBE.Prop.${name}_${base[name]}`)))}</option>
        ${list.map(v => `<option value="${v}" ${cur === v ? "selected" : ""}>${esc(L(`SBE.Prop.${name}_${v}`))}</option>`).join("")}
      </select>`;
    };
    const yn = (name) => {
      const cur = has(name) ? (raw[name] ? "1" : "0") : "";
      const word = (b) => L(b ? "SBE.Prop.Yes" : "SBE.Prop.No");
      return `<select data-k="${name}" data-bool="1">
        <option value="">${esc(inh(word(base[name])))}</option>
        <option value="1" ${cur === "1" ? "selected" : ""}>${esc(word(true))}</option>
        <option value="0" ${cur === "0" ? "selected" : ""}>${esc(word(false))}</option>
      </select>`;
    };
    const num = (name, step, min) => `<input type="number" data-k="${name}" data-num="1" step="${step}" min="${min}"
      value="${has(name) ? esc(raw[name]) : ""}" placeholder="${esc(base[name])}">`;
    const text = (name, list, ph) => `<input type="text" data-k="${name}" ${list ? `list="${list}"` : ""}
      value="${has(name) ? esc(raw[name]) : ""}" placeholder="${esc(ph)}">`;
    const statesRaw = Array.isArray(raw.states) ? raw.states : [];
    const statesTxt = statesRaw.map(x => `${x.value} = ${x.img}`).join("\n");
    const statesPh = base.states.length ? base.states.map(x => `${x.value} = ${x.img}`).join("\n") : "on = path/on.webp";
    const head = model
      ? `<p class="notes">${esc(L("SBE.Prop.TabHintCopy", { name: model.name }))}</p>
         <button type="button" class="sbe-sc-openmodel"><i class="fa-solid fa-up-right-from-square"></i> ${esc(L("SBE.ItemFx.InheritOpen"))}</button>`
      : `<p class="notes">${esc(L("SBE.Prop.TabHintWorld"))}</p>`;
    const imgPrev = PropManager.imageOf(item, PropManager.cfgOf(item));
    return `<section class="sbe-obj-fields sbe-obj-tabscroll sbe-scenetab sbe-fx-edit" ${cfBase(base)}>
      <datalist id="sbe-sc-keys">${keys.map(e => `<option value="${esc(e.key)}">${esc(e.label || e.key)}</option>`).join("")}</datalist>
      <datalist id="sbe-sc-nkeys">${numKeys.map(e => `<option value="${esc(e.key)}">${esc(e.label || e.key)}</option>`).join("")}</datalist>
      <datalist id="sbe-sc-btns">${keys.filter(e => e.kind === "button").map(e => `<option value="${esc(e.key)}">${esc(e.label || e.key)}</option>`).join("")}</datalist>
      ${head}
      <fieldset>
        <legend>${esc(L("SBE.Prop.LookGroup"))}</legend>
        <div class="sbe-sc-img">
          <img src="${esc(imgPrev)}" alt="">
          ${field("SBE.Prop.Img", `<div class="sbe-sc-row">${text("img", "", base.img || L("SBE.Prop.ImgPh"))}
            <button type="button" class="sbe-sc-fp" data-tooltip-text="${esc(L("SBE.Common.Image"))}"><i class="fa-solid fa-folder-open"></i></button></div>`)}
        </div>
        ${cfGrid([
          field("SBE.Prop.Size", sel("sizeMode", ["cells", "px", "image"]), { hint: "SBE.Prop.SizeHint" }),
          field("SBE.Prop.Rotate", yn("rotate")),
          field("SBE.Prop.W", num("w", 0.1, 0.1), { show: "sizeMode:cells,px" }),
          field("SBE.Prop.H", num("h", 0.1, 0.1), { show: "sizeMode:cells,px" }),
          field("SBE.Prop.Visibility", sel("visibility", ["all", "owner", "gm"])),
          field("SBE.Prop.ShowName", yn("showName")),
          field("SBE.Panel.Mode", sel("panelMode", ["window", "bubble"])),
          field("SBE.Panel.Width", num("panelWidth", 10, 0)),
          field("SBE.Panel.Head", yn("panelHead")),
          field("SBE.Prop.StateKey", text("stateKey", "sbe-sc-keys", base.stateKey || L("SBE.Ph.StateKey")), { hint: "SBE.Prop.StateHint" }),
          field("SBE.Prop.States", `<textarea data-k="states" rows="2" placeholder="${esc(statesPh)}">${esc(statesTxt)}</textarea>`, { wide: true })
        ])}
      </fieldset>
      <fieldset>
        <legend>${esc(L("SBE.Prop.UseGroup"))}</legend>
        ${cfGrid([
          field("SBE.Prop.Range", num("range", 0.5, 0), { hint: "SBE.Prop.RangeHint" }),
          field("SBE.Prop.FireArc", num("fireArc", 5, 0), { hint: "SBE.Prop.FireArcHint" }),
          field("SBE.Prop.UseWho", sel("use", ["all", "owner"])),
          field("SBE.Prop.TakeWho", sel("take", ["owner", "all", "gm", "none"])),
          field("SBE.Prop.Single", yn("single"))
        ])}
      </fieldset>
      <fieldset>
        <legend>${esc(L("SBE.Prop.CombatGroup"))}</legend>
        ${cfGrid([
          field("SBE.Prop.IgnoreCombat", yn("ignoreCombat"), { hint: "SBE.Prop.IgnoreCombatHint" }),
          field("SBE.Prop.HpKey", text("hpKey", "sbe-sc-nkeys", base.hpKey || L("SBE.Ph.HpKey")), { hint: "SBE.Prop.HpHint", show: "ignoreCombat:0" }),
          field("SBE.Prop.OnZero", sel("onZero", ["destroy", "ground"]), { show: "ignoreCombat:0" })
        ])}
      </fieldset>
      <fieldset>
        <legend>${esc(L("SBE.Trig.Group"))}</legend>
        ${cfGrid([
          field("SBE.Trig.DblClick", yn("dblClick"), { hint: "SBE.Trig.DblClickHint" }),
          field("SBE.Trig.Approach", yn("apOn"), { hint: "SBE.Trig.ApproachHint" }),
          field("SBE.Trig.ApRange", num("apRange", 0.5, 0), { show: "apOn:1" }),
          field("SBE.Trig.ApMode", sel("apMode", ["stop", "pass", "both"]), { show: "apOn:1" }),
          field("SBE.Trig.ApAct", sel("apAct", ["panel", "button"]), { show: "apOn:1" }),
          field("SBE.Trig.Button", text("apBtn", "sbe-sc-btns", base.apBtn || ""), { show: "apOn:1;apAct:button" }),
          field("SBE.Trig.ApFreq", sel("apFreq", ["each", "actor", "once"]), { show: "apOn:1" }),
          field("SBE.Trig.ApWho", sel("apWho", ["players", "all"]), { show: "apOn:1" }),
          field("SBE.Trig.Drop", yn("dropOn"), { hint: "SBE.Trig.DropHint" }),
          field("SBE.Trig.Button", text("dropBtn", "sbe-sc-btns", base.dropBtn || ""), { show: "dropOn:1" }),
          field("SBE.Trig.DropIf", text("dropIf", "", base.dropIf || ""), { show: "dropOn:1" })
        ])}
      </fieldset>
      ${trapTabHTML({ yn, sel, num, text }, base, L, esc)}
      <button type="button" class="sbe-sc-reset"><i class="fa-solid fa-rotate-left"></i> ${esc(L("SBE.Prop.ResetTab"))}</button>
    </section>`;
  }

  /** Lit l'onglet : un champ vide reste vide (il hérite). */
  static readTab(root) {
    const out = {};
    for (const el of root.querySelectorAll("[data-k]")) {
      const k = el.dataset.k;
      const v = String(el.value ?? "").trim();
      if (k === "states") {
        out.states = v.split("\n").map(l => l.split("=")).filter(p => p.length >= 2)
          .map(([a, ...rest]) => ({ value: a.trim(), img: rest.join("=").trim() })).filter(x => x.value && x.img);
      } else if (!v) out[k] = "";
      else if (el.dataset.bool) out[k] = v === "1";
      else if (el.dataset.num) out[k] = Number(v);
      else out[k] = v;
    }
    return out;
  }

  static wireTab(sheet) {
    const root = sheet.element?.querySelector(".sbe-scenetab");
    if (!root || !game.user.isGM) return;
    const item = sheet.document;
    const path = `flags.${SYSTEM_ID}.${PropManager.flagKeyOf(item)}`;
    wireCompactForm(root);
    root.querySelector(".sbe-sc-openmodel")?.addEventListener("click", (ev) => {
      ev.preventDefault();
      this.modelOf(item)?.sheet?.render(true);
    });
    let timer = null;
    const save = async () => {
      await item.update({ [path]: this.readTab(root) }, { render: false });
      const img = root.querySelector(".sbe-sc-img img");
      if (img) img.src = PropManager.imageOf(item, PropManager.cfgOf(item));
    };
    root.addEventListener("change", (ev) => {
      ev.stopPropagation();
      clearTimeout(timer);
      timer = setTimeout(save, 200);
    });
    root.addEventListener("input", (ev) => ev.stopPropagation());
    root.querySelector(".sbe-sc-fp")?.addEventListener("click", (ev) => {
      ev.preventDefault();
      const input = root.querySelector('[data-k="img"]');
      const FP = foundry.applications.apps.FilePicker.implementation;
      new FP({
        type: "image", current: input?.value || input?.placeholder || "",
        callback: (p) => { if (!input) return; input.value = p; input.dispatchEvent(new Event("change", { bubbles: true })); }
      }).render(true);
    });
    root.querySelector(".sbe-sc-reset")?.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const key = PropManager.flagKeyOf(item);
      await item.update({ [`flags.${SYSTEM_ID}.${key}`]: foundry.data.operators.ForcedDeletion.create() });
    });
  }
}
