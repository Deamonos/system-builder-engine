/**
 * SBE — LES OBJETS QUI ÉCLAIRENT ET QUI FONT VOIR (onglet « Lumière »)
 *
 * Un moteur À PART des effets : une lampe, des lunettes de vision
 * nocturne, une caméra thermique sont des OBJETS, pas des états. Le MJ
 * coche « Cet objet émet de la lumière » (onglet Médias de l'objet du
 * monde) et règle l'onglet Lumière :
 *
 *   flags.sbe.lightSource = {
 *     enabled,
 *     when    "equipped" | "carried"      quand il agit
 *     onlyIf  formule lue sur l'objet     (« allume » par défaut)
 *     vision  { enabled, mode, range, angle, intensity, color }
 *     light   { enabled, …les champs d'une lumière (light-fields.mjs) }
 *     autonomy { enabled, key, amount, interval, onZero }
 *   }
 *
 * Formules et « @clé » se lisent sur l'OBJET (sa portée selon son état…).
 * Les exemplaires suivent leur objet du monde (une seule source).
 *
 * Plusieurs objets allumés : la DERNIÈRE vision allumée compte (le
 * porteur est prévenu) ; les lumières : la plus forte. Un effet
 * « Aveugle » passe devant tout. L'écriture sur le jeton, elle, reste
 * celle de vision-manager (vue) et effect-look (lumière).
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { walkElements, valueBounds, equipKeys } from "../../builder/element-renderer.mjs";
import { docScope } from "../../builder/doc-context.mjs";
import { evalExpression, formulaValue } from "../../builder/formula-engine.mjs";
import { isStackableItem, qtyOf, QUANTITY_KEY } from "../../builder/inventory.mjs";
import { cleanDef, EffectManager } from "../effects/effect-manager.mjs";
import { ItemEffects } from "../effects/item-effects.mjs";
import { lightFieldsHTML, readLightFields } from "./light-fields.mjs";
import { itemReader, resolveLightWith, colorOf } from "./effect-values.mjs";
import { VisionModes } from "./vision-modes.mjs";
import { cfCell } from "../../helpers/compact-form.mjs";
import { isPrimaryGM, valueQueue } from "../../helpers/socket.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const str = (v) => String(v ?? "").trim();

export const LIGHT_SOURCE_FLAG = "lightSource";
/** Activation par défaut (choix de l'auteur, modifiable par objet). */
const DEFAULT_ONLY_IF = "allume";

/** Des réglages, toujours propres. */
export function cleanSource(s) {
  const v = s?.vision ?? {}, a = s?.autonomy ?? {};
  return {
    enabled: !!s?.enabled,
    when: s?.when === "carried" ? "carried" : "equipped",
    onlyIf: s?.onlyIf === undefined ? DEFAULT_ONLY_IF : str(s.onlyIf),
    vision: {
      enabled: !!v.enabled,
      mode: str(v.mode) || "sbeNight",
      range: str(v.range), angle: str(v.angle), intensity: str(v.intensity),
      color: str(v.color)
    },
    /* Mêmes champs (et même nettoyage) que la lumière d'un effet. */
    light: cleanDef({ look: { light: s?.light ?? {} } }).look.light,
    autonomy: {
      enabled: !!a.enabled,
      key: str(a.key),
      amount: str(a.amount) || "-1",
      interval: Math.max(1, Math.floor(Number(a.interval) || 60)),
      onZero: ["qty", "delete"].includes(a.onZero) ? a.onZero : "none"
    }
  };
}

export class ItemLight {

  static _bound = false;
  /** acteur → (objet → instant où il s'est allumé), pour « la dernière gagne ». */
  static _since = new Map();
  /** Ce client : visions allumées connues par acteur (avertissement). */
  static _known = new Map();
  /** Autonomie : secondes accumulées par objet. */
  static _acc = new Map();

  /* ========================================================== */
  /*  LECTURE                                                    */
  /* ========================================================== */

  /** L'objet qui PORTE les réglages : lui-même s'il en a, sinon son
      objet du monde (les exemplaires suivent leur modèle). */
  static holderOf(item) {
    if (!item) return null;
    if (item.flags?.[SYSTEM_ID]?.[LIGHT_SOURCE_FLAG]) return item;
    const model = item.system?.modelId ? game.items?.get?.(item.system.modelId) : null;
    return model && model !== item ? model : item;
  }

  /** Les réglages actifs de cet objet (null s'il n'éclaire pas). */
  static sourceOf(item) {
    const raw = this.holderOf(item)?.flags?.[SYSTEM_ID]?.[LIGHT_SOURCE_FLAG];
    if (!raw?.enabled) return null;
    return cleanSource(raw);
  }

  /** Les objets de l'acteur qui éclairent en ce moment. */
  static activeOf(actor) {
    if (actor?.documentName !== "Actor") return [];
    const slots = equipKeys(actor.system?.template?.system?.elements ?? []);
    const out = [];
    for (const it of actor.items ?? []) {
      if (it.type !== "objet") continue;
      const src = this.sourceOf(it);
      if (!src) continue;
      const carry = it.system?.carry ?? {};
      const equipped = !str(carry.host) && slots.has(str(carry.where));
      if (src.when === "equipped" && !equipped) continue;
      if (src.onlyIf) {
        let ok = false;
        try { const r = evalExpression(src.onlyIf, docScope(it)); ok = r !== null && r !== undefined && !!r; } catch (_e) { ok = false; }
        if (!ok) continue;
      }
      out.push({ item: it, src });
    }
    /* Depuis quand chacun est allumé (la dernière vision gagne). */
    const map = this._since.get(actor.uuid) ?? new Map();
    const now = Date.now();
    const seen = new Set();
    for (const x of out) {
      if (!map.has(x.item.id)) map.set(x.item.id, now);
      x.since = map.get(x.item.id);
      seen.add(x.item.id);
    }
    for (const id of [...map.keys()]) if (!seen.has(id)) map.delete(id);
    this._since.set(actor.uuid, map);
    return out;
  }

  /** Les objets allumés qui changent la vue, du plus récent au plus ancien. */
  static visionsOf(actor) {
    return this.activeOf(actor).filter(x => x.src.vision.enabled).sort((a, b) => b.since - a.since);
  }

  /** La vue que donne un objet (pour le jeton). */
  static sightOf(x) {
    const v = x.src.vision;
    const r = itemReader(x.item);
    const color = colorOf(r.text(v.color));
    return {
      mode: v.mode,
      sight: {
        enabled: true,
        visionMode: CONFIG.Canvas?.visionModes?.[v.mode] ? v.mode : "basic",
        range: Math.max(0, r.num(v.range, 0)),
        angle: Math.max(1, Math.min(360, r.num(v.angle, 360))),
        brightness: Math.max(-1, Math.min(1, r.num(v.intensity, 0))),
        saturation: 0, contrast: 0,
        color: color ?? null
      }
    };
  }

  /** Les lumières des objets allumés (résolues). */
  static lightsOf(actor) {
    return this.activeOf(actor).filter(x => x.src.light.enabled)
      .map(x => resolveLightWith(x.src.light, itemReader(x.item))).filter(Boolean);
  }

  /* ========================================================== */
  /*  BRANCHEMENTS                                               */
  /* ========================================================== */

  /** `onChange(actor)` : ce qui doit suivre (vue, lumière, dessin). */
  static init(onChange) {
    if (this._bound) return;
    this._bound = true;
    const touched = (item) => {
      const actor = item?.parent;
      if (actor?.documentName !== "Actor") return;
      onChange(actor);
      this._warnIfSeveral(actor);
    };
    for (const h of ["createItem", "updateItem", "deleteItem"]) Hooks.on(h, (item) => touched(item));
    /* Un objet du monde change ses réglages : tous ses exemplaires. */
    Hooks.on("updateItem", (item, changes) => {
      if (item.parent || !foundry.utils.hasProperty(changes, `flags.${SYSTEM_ID}.${LIGHT_SOURCE_FLAG}`)) return;
      for (const a of EffectManager.allActors()) {
        if ((a.items ?? []).some(i => i.system?.modelId === item.id)) onChange(a);
      }
    });
    /* Autonomie : en temps de jeu, seulement quand l'objet éclaire. */
    Hooks.on("updateWorldTime", (_t, dt) => {
      if (!isPrimaryGM() || !(dt > 0)) return;
      this._tickAll(dt).catch(err => console.warn("SBE | Lumière : autonomie en échec", err));
    });
    Hooks.once("ready", () => { if (isPrimaryGM()) this.migrate().catch(err => console.warn("SBE | Lumière : conversion en échec", err)); });
  }

  /** Deux visions allumées : le porteur est prévenu (une seule compte). */
  static _warnIfSeveral(actor) {
    if (!actor.isOwner) return;
    const list = this.visionsOf(actor);
    const ids = new Set(list.map(x => x.item.id));
    const before = this._known.get(actor.uuid) ?? new Set();
    this._known.set(actor.uuid, ids);
    const fresh = list.find(x => !before.has(x.item.id));
    if (!fresh || list.length < 2) return;
    ui.notifications.warn(L("SBE.Vision.OnlyOne", { name: fresh.item.name, actor: actor.name }));
  }

  /* ========================================================== */
  /*  AUTONOMIE                                                  */
  /* ========================================================== */

  static async _tickAll(dt) {
    for (const actor of EffectManager.allActors()) {
      for (const x of this.activeOf(actor)) {
        const a = x.src.autonomy;
        if (!a.enabled || !a.key) continue;
        const id = x.item.uuid;
        const acc = (this._acc.get(id) ?? 0) + dt;
        const n = Math.floor(acc / a.interval);
        this._acc.set(id, acc - n * a.interval);
        if (n > 0) await this._tick(x.item, a, n);
      }
    }
  }

  /* Une recharge à la fois par objet (deux avancées du temps rapprochées
     décomptent toutes les deux, chacune sur la valeur à jour). */
  static _tick(item, a, n) {
    return valueQueue(item, () => this.#tickNow(item, a, n));
  }

  static async #tickNow(item, a, n) {
    if (item?.parent && !item.parent.items?.get?.(item.id)) return;   /* déjà vidé et retiré */
    const el = [...walkElements(item.system?.template?.system?.elements ?? [])].find(e => e?.key === a.key);
    if (!el || !["number", "gauge"].includes(el.kind) || el.config?.computed) return;
    const scope = docScope(item);
    let amount = Number.isFinite(Number(a.amount)) ? Number(a.amount) : Number((await formulaValue(a.amount, scope)).value);
    if (!Number.isFinite(amount) || !amount) return;
    amount *= n;
    const from = Number(item.system?.values?.[a.key] ?? el.config?.default ?? 0) || 0;
    const { min, max } = valueBounds(el, { ...(item.system?.values ?? {}), ...scope });
    const whole = el.kind === "gauge" || !!el.config?.integer;
    const raw = from + amount;
    const to = Math.max(min, Math.min(max, whole ? Math.round(raw) : Math.round(raw * 1000) / 1000));
    if (to === from) return;
    const empty = amount < 0 && to <= Math.max(0, Number.isFinite(min) ? min : 0);
    if (!empty || a.onZero === "none") {
      await item.update({ [`system.values.${a.key}`]: to });
      if (empty) await this._emptyCard(item, "none");
      return;
    }
    if (a.onZero === "qty" && isStackableItem(item) && qtyOf(item) > 1) {
      /* Une unité de la pile part ; la suivante repart pleine. */
      const full = Number.isFinite(max) ? max : (Number(el.config?.default) || 0);
      await item.update({ [`system.values.${QUANTITY_KEY}`]: qtyOf(item) - 1, [`system.values.${a.key}`]: full });
      await this._emptyCard(item, "qty");
      return;
    }
    await this._emptyCard(item, "delete");
    await item.delete();
  }

  static async _emptyCard(item, what) {
    try {
      const actor = item.parent?.documentName === "Actor" ? item.parent : null;
      await ChatMessage.create({
        speaker: actor ? ChatMessage.getSpeaker({ actor }) : undefined,
        content: `<div class="sbe-fx-empty"><img src="${esc(item.img)}" alt=""><span>${esc(L(`SBE.Effects.Periodic.Empty.${what}`, { name: item.name }))}</span></div>`
      });
    } catch (err) { console.warn("SBE | Lumière : message d'objet vide en échec", err); }
  }

  /* ========================================================== */
  /*  LA CASE (onglet Médias de l'objet du monde, MJ)            */
  /* ========================================================== */

  static optionsHTML(item) {
    if (!game.user.isGM || !item || item.type !== "objet" || item.parent) return "";
    const on = !!item.flags?.[SYSTEM_ID]?.[LIGHT_SOURCE_FLAG]?.enabled;
    return `<div class="sbe-zm-box sbe-lt-opts">
      <h3 class="sbe-itemfx-title"><i class="fa-solid fa-lightbulb"></i> ${esc(L("SBE.Light.Tab"))}</h3>
      ${cfCell(L("SBE.Light.OptLight"), `<input type="checkbox" class="sbe-lt-light" ${on ? "checked" : ""}>`, { hint: L("SBE.Light.OptLightHint"), check: true })}
    </div>`;
  }

  static wireOptions(sheet) {
    const box = sheet.element?.querySelector(".sbe-lt-light");
    if (!box || !game.user.isGM) return;
    const item = sheet.document;
    box.addEventListener("change", async (ev) => {
      ev.stopPropagation();
      /* Décocher garde les réglages (on peut recocher sans tout refaire). */
      const cur = cleanSource(item.flags?.[SYSTEM_ID]?.[LIGHT_SOURCE_FLAG] ?? { light: { enabled: true } });
      cur.enabled = !!ev.target.checked;
      await item.update({ [`flags.${SYSTEM_ID}.${LIGHT_SOURCE_FLAG}`]: cur });
    });
  }

  /* ========================================================== */
  /*  L'ONGLET « LUMIÈRE »                                       */
  /* ========================================================== */

  /** L'onglet existe-t-il pour cet objet (MJ) ? */
  static hasTab(item) {
    return game.user.isGM && item?.type === "objet" && !!this.sourceOf(item);
  }

  static tabHTML(item) {
    const holder = this.holderOf(item);
    if (holder !== item) {
      return `<section class="sbe-obj-fields sbe-obj-tabscroll sbe-lighttab">
        <p class="notes">${esc(L("SBE.Light.Inherited", { name: holder?.name ?? "" }))}</p>
        <button type="button" class="sbe-lt-openmodel"><i class="fa-solid fa-up-right-from-square"></i> ${esc(L("SBE.ItemFx.InheritOpen"))}</button>
      </section>`;
    }
    const s = cleanSource(item.flags?.[SYSTEM_ID]?.[LIGHT_SOURCE_FLAG]);
    const keys = [...walkElements(item.system?.template?.system?.elements ?? [])].filter(e => e?.key);
    const numKeys = keys.filter(e => ["number", "gauge"].includes(e.kind) && !e.config?.computed);
    const { own, natives } = VisionModes.options();
    const opt = (value, label, sel) => `<option value="${esc(value)}" ${value === sel ? "selected" : ""}>${esc(label)}</option>`;
    const field = (label, inner, cls = "") => `<div class="sbe-fx-field ${cls}"><label>${esc(L(label))}</label>${inner}</div>`;
    const text = (cls, value, ph, list = "sbe-lt-allkeys") => `<input type="text" class="${cls}" list="${list}" value="${esc(value)}" placeholder="${esc(ph)}">`;
    const vcol = s.vision.color;
    return `<section class="sbe-obj-fields sbe-obj-tabscroll sbe-lighttab sbe-fx-edit">
      <datalist id="sbe-lt-allkeys">${keys.map(e => `<option value="${esc(e.key)}">${esc(e.label || e.key)}</option>`).join("")}</datalist>
      <datalist id="sbe-lt-ikeys">${numKeys.map(e => `<option value="${esc(e.key)}">${esc(e.label || e.key)}</option>`).join("")}</datalist>
      <p class="notes">${esc(L("SBE.Light.TabHint"))}</p>

      <fieldset class="sbe-lt-when">
        <legend>${esc(L("SBE.Light.Activation"))}</legend>
        <p class="notes">${esc(L("SBE.Light.ActivationHint"))}</p>
        <div class="sbe-fx-vision-grid">
          ${field("SBE.ItemFx.TriggerWhen", `<select class="sbe-lt-whensel">
            ${opt("equipped", L("SBE.Grants.Equipped"), s.when)}${opt("carried", L("SBE.Grants.Carried"), s.when)}</select>`)}
          ${field("SBE.ItemFx.OnlyIf", text("sbe-lt-onlyif", s.onlyIf, L("SBE.ItemFx.OnlyIfPh")), "sbe-lt-wide")}
        </div>
      </fieldset>

      <fieldset class="sbe-fx-vision">
        <legend>${esc(L("SBE.Light.Vision"))}</legend>
        <label class="sbe-fx-check"><input type="checkbox" class="sbe-fx-v-on" ${s.vision.enabled ? "checked" : ""}> ${esc(L("SBE.Effects.Vision.Enabled"))}</label>
        <p class="notes">${esc(L("SBE.Effects.Vision.Hint"))}</p>
        <div class="sbe-fx-vision-body">
          <div class="sbe-fx-vision-grid">
            ${field("SBE.Effects.Vision.Mode", `<select class="sbe-fx-v-mode">
              <optgroup label="${esc(L("SBE.Effects.Vision.ModesOwn"))}">${own.map(o => opt(o.value, o.label, s.vision.mode)).join("")}</optgroup>
              <optgroup label="${esc(L("SBE.Effects.Vision.ModesNative"))}">${natives.map(o => opt(o.value, o.label, s.vision.mode)).join("")}</optgroup>
            </select>`)}
            ${field("SBE.Effects.Vision.Range", text("sbe-fx-v-range", s.vision.range, "15"))}
            ${field("SBE.Effects.Vision.Angle", text("sbe-fx-v-angle", s.vision.angle, "360"))}
            ${field("SBE.Effects.Vision.Intensity", text("sbe-fx-v-int", s.vision.intensity, "0"))}
            <div class="sbe-fx-field">
              <label class="sbe-fx-check"><input type="checkbox" class="sbe-fx-v-coloron" ${vcol ? "checked" : ""}> ${esc(L("SBE.Effects.Vision.Color"))}</label>
              <div class="sbe-fx-pickrow">
                <input type="color" class="sbe-fx-v-color" value="${esc(/^#[0-9a-f]{6}$/i.test(vcol) ? vcol : "#7cff8a")}">
                <input type="text" class="sbe-fx-v-colorkey" value="${esc(vcol.startsWith("@") ? vcol : "")}" placeholder="${esc(L("SBE.Effects.Look.KeyPh"))}">
              </div>
            </div>
          </div>
          <p class="notes">${esc(L("SBE.Light.FormulaHint"))}</p>
        </div>
      </fieldset>

      <fieldset class="sbe-fx-light">
        <legend>${esc(L("SBE.Effects.Look.Light"))}</legend>
        <label class="sbe-fx-check"><input type="checkbox" class="sbe-fx-l-light" ${s.light.enabled ? "checked" : ""}> ${esc(L("SBE.Light.LightOn"))}</label>
        <div class="sbe-fx-light-body">${lightFieldsHTML(s.light, { list: "sbe-lt-allkeys" })}</div>
      </fieldset>

      <fieldset class="sbe-fx-autonomy">
        <legend>${esc(L("SBE.Light.Autonomy"))}</legend>
        <label class="sbe-fx-check"><input type="checkbox" class="sbe-lt-a-on" ${s.autonomy.enabled ? "checked" : ""}> ${esc(L("SBE.Light.AutonomyOn"))}</label>
        <p class="notes">${esc(L("SBE.Light.AutonomyHint"))}</p>
        <div class="sbe-fx-autonomy-body sbe-fx-vision-grid">
          ${field("SBE.Light.AutonomyKey", text("sbe-lt-a-key", s.autonomy.key, L("SBE.Ph.LightAutonomy"), "sbe-lt-ikeys"))}
          ${field("SBE.Light.AutonomyAmount", `<input type="text" class="sbe-lt-a-amount" value="${esc(s.autonomy.amount)}">`)}
          ${field("SBE.Light.AutonomyEvery", `<input type="number" class="sbe-lt-a-int" value="${s.autonomy.interval}" min="1" step="1">`)}
          ${field("SBE.Effects.Periodic.ZeroLabel", `<select class="sbe-lt-a-zero">${["none", "qty", "delete"]
            .map(v => opt(v, L(`SBE.Effects.Periodic.Zero.${v}`), s.autonomy.onZero)).join("")}</select>`)}
        </div>
      </fieldset>
    </section>`;
  }

  /** Relit l'onglet. */
  static readTab(root, prev) {
    const val = (sel) => root.querySelector(sel)?.value ?? "";
    const chk = (sel) => !!root.querySelector(sel)?.checked;
    const vkey = str(val(".sbe-fx-v-colorkey"));
    return cleanSource({
      enabled: prev.enabled,
      when: val(".sbe-lt-whensel"),
      onlyIf: val(".sbe-lt-onlyif"),
      vision: {
        enabled: chk(".sbe-fx-v-on"),
        mode: val(".sbe-fx-v-mode"),
        range: val(".sbe-fx-v-range"), angle: val(".sbe-fx-v-angle"), intensity: val(".sbe-fx-v-int"),
        color: chk(".sbe-fx-v-coloron") ? (vkey ? (vkey.startsWith("@") ? vkey : `@${vkey}`) : val(".sbe-fx-v-color")) : ""
      },
      light: { enabled: chk(".sbe-fx-l-light"), ...readLightFields(root) },
      autonomy: {
        enabled: chk(".sbe-lt-a-on"), key: val(".sbe-lt-a-key"), amount: val(".sbe-lt-a-amount"),
        interval: val(".sbe-lt-a-int"), onZero: val(".sbe-lt-a-zero")
      }
    });
  }

  static wireTab(sheet) {
    const root = sheet.element?.querySelector(".sbe-lighttab");
    if (!root || !game.user.isGM) return;
    const item = sheet.document;
    root.querySelector(".sbe-lt-openmodel")?.addEventListener("click", (ev) => {
      ev.preventDefault();
      this.holderOf(item)?.sheet?.render(true);
    });
    if (this.holderOf(item) !== item) return;
    let timer = null;
    const save = () => {
      const prev = cleanSource(item.flags?.[SYSTEM_ID]?.[LIGHT_SOURCE_FLAG]);
      return item.update({ [`flags.${SYSTEM_ID}.${LIGHT_SOURCE_FLAG}`]: this.readTab(root, prev) }, { render: false });
    };
    root.addEventListener("change", (ev) => {
      ev.stopPropagation();
      clearTimeout(timer);
      timer = setTimeout(save, 200);
    });
    root.addEventListener("input", (ev) => ev.stopPropagation());
  }

  /* ========================================================== */
  /*  CONVERSION des réglages de l'essai précédent (effet propre)  */
  /* ========================================================== */

  static async migrate() {
    for (const item of game.items ?? []) {
      const f = item.flags?.[SYSTEM_ID] ?? {};
      const key = f.lightEffect;
      if (!key) continue;
      const rawDef = (Array.isArray(f.localEffects) ? f.localEffects : []).find(d => d?.key === key);
      const rule = (Array.isArray(f.effectRules) ? f.effectRules : []).find(r => r?.effect === key);
      if (rawDef) {
        const v = rawDef.look?.vision ?? {}, p = rawDef.periodic ?? {};
        const src = cleanSource({
          enabled: true,
          when: rule?.when, onlyIf: rule?.onlyIf ?? DEFAULT_ONLY_IF,
          vision: v, light: rawDef.look?.light ?? {},
          autonomy: { enabled: !!p.enabled, key: p.key, amount: p.amount, interval: p.interval, onZero: p.onZero }
        });
        await item.update({ [`flags.${SYSTEM_ID}.${LIGHT_SOURCE_FLAG}`]: src });
      }
      await EffectManager.setLocalDefs(item, EffectManager.localDefsOf(item, { draft: true }).filter(d => d.key !== key), { render: false });
      await ItemEffects.save(item, ItemEffects.rulesOf(item).filter(r => r.effect !== key));
      await item.unsetFlag(SYSTEM_ID, "lightEffect");
    }
  }
}
