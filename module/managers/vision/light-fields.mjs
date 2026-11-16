/**
 * SBE — LES CHAMPS D'UNE LUMIÈRE (une seule source)
 *
 * Les mêmes champs servent à la lumière d'un EFFET (gestionnaire
 * d'effets, onglet Effets d'un objet) et à celle d'un OBJET (onglet
 * Lumière) : rayons, angle, opacité, couleur, animation, réglages
 * avancés, lumière personnelle. Écrits ici une fois, relus ici une fois.
 *
 * Chaque champ : un nombre, une formule, ou « @clé ». Où se lit la
 * formule dépend de l'appelant (fiche du porteur pour un effet, l'objet
 * lui-même pour un objet) — voir effect-values.mjs.
 */

import { colorationTechniques } from "./effect-values.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const L = (k) => game.i18n.localize(k);

/** Un choix « liste + @clé » : { sel, key }. */
function pickOf(v) {
  const s = String(v ?? "").trim();
  return s.startsWith("@") ? { sel: "@", key: s.slice(1) } : { sel: s, key: "" };
}

/** Une case, ou « @clé » : { on, key }. */
function flagOf(v) {
  return typeof v === "string" && v.trim().startsWith("@") ? { on: true, key: v.trim() } : { on: !!v, key: "" };
}

/**
 * Les champs (sans la case « active ») d'une lumière.
 * @param {object} l        la lumière (valeurs brutes)
 * @param {object} [opts]
 * @param {string} [opts.list]  id d'une datalist de clés proposées
 */
export function lightFieldsHTML(l = {}, { list = "" } = {}) {
  const li = list ? ` list="${esc(list)}"` : "";
  const text = (cls, label, value, ph) => `<div class="sbe-fx-field"><label>${esc(L(label))}</label>
      <input type="text" class="${cls}"${li} value="${esc(value ?? "")}" placeholder="${esc(ph)}"></div>`;
  const col = String(l.color ?? "").trim();
  const colKey = col.startsWith("@") ? col : "";
  const colHex = colKey ? "" : col;
  const anim = pickOf(l.animation);
  const colo = pickOf(l.coloration);
  const rev = flagOf(l.reverse);
  const pers = flagOf(l.personal);
  const animations = Object.entries(CONFIG.Canvas?.lightAnimations ?? {})
    .map(([value, a]) => ({ value, label: L(a?.label ?? value) }));
  const opt = (value, label, sel) => `<option value="${esc(value)}" ${value === sel ? "selected" : ""}>${esc(label)}</option>`;
  const pick = (cls, keyCls, label, none, entries, p) => `<div class="sbe-fx-field sbe-fx-pick"><label>${esc(L(label))}</label>
      <select class="${cls}">
        ${opt("", L(none), p.sel)}
        ${entries.map(e => opt(e.value, e.label, p.sel)).join("")}
        ${opt("@", L("SBE.Effects.Look.FromItem"), p.sel)}
      </select>
      <input type="text" class="${keyCls} sbe-fx-pickkey" value="${esc(p.key)}" placeholder="${esc(L("SBE.Effects.Look.KeyOnly"))}"></div>`;
  return `<p class="notes">${esc(L("SBE.Effects.Look.ValueHint"))}</p>
    <div class="sbe-fx-vision-grid">
      ${text("sbe-fx-l-dim", "SBE.Effects.Look.Dim", l.dim, "6")}
      ${text("sbe-fx-l-bright", "SBE.Effects.Look.Bright", l.bright, "3")}
      ${text("sbe-fx-l-angle", "SBE.Effects.Look.Angle", l.angle, "360")}
      ${text("sbe-fx-l-alpha", "SBE.Effects.Look.Alpha", l.alpha, "0.5")}
      <div class="sbe-fx-field"><label>${esc(L("SBE.Effects.Look.Color"))}</label>
        <div class="sbe-fx-pickrow">
          <input type="color" class="sbe-fx-l-color" value="${esc(/^#[0-9a-f]{6}$/i.test(colHex) ? colHex : "#ffd27a")}">
          <input type="text" class="sbe-fx-l-colorkey" value="${esc(colKey)}" placeholder="${esc(L("SBE.Effects.Look.KeyPh"))}">
        </div></div>
    </div>
    <div class="sbe-fx-vision-grid">
      ${pick("sbe-fx-l-anim", "sbe-fx-l-animkey", "SBE.Effects.Look.Anim", "SBE.Effects.Look.AnimNone", animations, anim)}
      ${text("sbe-fx-l-speed", "SBE.Effects.Look.Speed", l.speed, "5")}
      ${text("sbe-fx-l-int", "SBE.Effects.Look.Intensity", l.intensity, "5")}
      <div class="sbe-fx-field sbe-fx-field-end">
        <label class="sbe-fx-check"><input type="checkbox" class="sbe-fx-l-reverse" ${rev.on ? "checked" : ""}> ${esc(L("SBE.Effects.Look.Reverse"))}</label>
        <input type="text" class="sbe-fx-l-reversekey" value="${esc(rev.key)}" placeholder="${esc(L("SBE.Effects.Look.KeyPh"))}"></div>
    </div>
    <details class="sbe-fx-adv">
      <summary>${esc(L("SBE.Effects.Look.Advanced"))}</summary>
      <p class="notes">${esc(L("SBE.Effects.Look.AdvancedHint"))}</p>
      <div class="sbe-fx-vision-grid">
        ${text("sbe-fx-l-atten", "SBE.Effects.Look.Attenuation", l.attenuation, "0.5")}
        ${text("sbe-fx-l-lum", "SBE.Effects.Look.Luminosity", l.luminosity, "0.5")}
        ${text("sbe-fx-l-sat", "SBE.Effects.Look.Saturation", l.saturation, "0")}
        ${text("sbe-fx-l-con", "SBE.Effects.Look.Contrast", l.contrast, "0")}
        ${text("sbe-fx-l-shad", "SBE.Effects.Look.Shadows", l.shadows, "0")}
        ${pick("sbe-fx-l-colo", "sbe-fx-l-colokey", "SBE.Effects.Look.Coloration", "SBE.Effects.Look.Default",
          colorationTechniques().map(t => ({ value: String(t.id), label: t.label })), colo)}
      </div>
    </details>
    <div class="sbe-fx-pickrow">
      <label class="sbe-fx-check"><input type="checkbox" class="sbe-fx-l-personal" ${pers.on ? "checked" : ""}> ${esc(L("SBE.Effects.Look.Personal"))}</label>
      <input type="text" class="sbe-fx-l-personalkey" value="${esc(pers.key)}" placeholder="${esc(L("SBE.Effects.Look.KeyPh"))}">
    </div>
    <p class="notes">${esc(L("SBE.Effects.Look.PersonalHint"))}</p>`;
}

/** Relit les champs d'une lumière (sans la case « active »). */
export function readLightFields(root) {
  const val = (sel) => root.querySelector(sel)?.value ?? "";
  const chk = (sel) => !!root.querySelector(sel)?.checked;
  const keyed = (sel) => { const k = String(val(sel)).trim(); return k ? (k.startsWith("@") ? k : `@${k}`) : ""; };
  const pick = (sel, keySel) => { const v = val(sel); return v === "@" ? keyed(keySel) : v; };
  return {
    dim: val(".sbe-fx-l-dim"),
    bright: val(".sbe-fx-l-bright"),
    angle: val(".sbe-fx-l-angle"),
    alpha: val(".sbe-fx-l-alpha"),
    color: keyed(".sbe-fx-l-colorkey") || val(".sbe-fx-l-color"),
    animation: pick(".sbe-fx-l-anim", ".sbe-fx-l-animkey"),
    speed: val(".sbe-fx-l-speed"),
    intensity: val(".sbe-fx-l-int"),
    reverse: keyed(".sbe-fx-l-reversekey") || chk(".sbe-fx-l-reverse"),
    attenuation: val(".sbe-fx-l-atten"),
    luminosity: val(".sbe-fx-l-lum"),
    saturation: val(".sbe-fx-l-sat"),
    contrast: val(".sbe-fx-l-con"),
    shadows: val(".sbe-fx-l-shad"),
    coloration: pick(".sbe-fx-l-colo", ".sbe-fx-l-colokey"),
    personal: keyed(".sbe-fx-l-personalkey") || chk(".sbe-fx-l-personal")
  };
}
