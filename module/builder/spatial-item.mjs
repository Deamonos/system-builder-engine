/**
 * SBE — GRILLE SPATIALE : réglage de l'OBJET DU MONDE
 *
 * Onglet Médias de l'objet (MJ) : sa taille en cases (L × H, 1 × 1 par
 * défaut), son image dans la grille (vide = l'icône de l'objet) et son
 * affichage (image entière ou étirée). Tous ses exemplaires suivent :
 * la taille vit sur le modèle, jamais en double sur chaque exemplaire.
 */

import { SYSTEM_ID } from "../helpers/constants.mjs";
import { cleanSpatial, SPATIAL_MAX_SIDE, spatialArtHTML } from "./spatial.mjs";
import { cfTip } from "../helpers/compact-form.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const L = (k) => game.i18n.localize(k);

/** Petit aperçu : le rectangle à l'échelle, avec son image. */
function previewHTML(item, sp) {
  return `<div class="sbe-spset-prev" style="--sp-w:${sp.w};--sp-h:${sp.h}">${spatialArtHTML({ img: sp.img || item.img, w: sp.w, h: sp.h, rot: 0, fit: sp.fit })}</div>`;
}

export function spatialItemBoxHTML(item) {
  if (!item || item.parent) return "";
  const sp = cleanSpatial(item.flags?.[SYSTEM_ID]?.spatial);
  const num = (cls, label, value) => `<div class="sbe-itemfx-field"><label>${esc(L(label))}</label>
      <input type="number" class="${cls}" value="${value}" min="1" max="${SPATIAL_MAX_SIDE}" step="1"></div>`;
  return `<div class="sbe-zm-box sbe-spset">
    <h3 class="sbe-itemfx-title"><i class="fa-solid fa-table-cells-large"></i> ${esc(L("SBE.Inv.SpatialItemTitle"))}${cfTip(L("SBE.Inv.SpatialItemHint"))}</h3>
    <div class="sbe-spset-row">
      ${num("sbe-spset-w", "SBE.Inv.SpatialItemW", sp.w)}
      ${num("sbe-spset-h", "SBE.Inv.SpatialItemH", sp.h)}
      <div class="sbe-itemfx-field"><label>${esc(L("SBE.Inv.SpatialItemFit"))}</label>
        <select class="sbe-spset-fit">
          <option value="contain" ${sp.fit === "contain" ? "selected" : ""}>${esc(L("SBE.Inv.SpatialFitContain"))}</option>
          <option value="fill" ${sp.fit === "fill" ? "selected" : ""}>${esc(L("SBE.Inv.SpatialFitFill"))}</option>
        </select></div>
      ${previewHTML(item, sp)}
    </div>
    <div class="sbe-itemfx-field"><label>${esc(L("SBE.Inv.SpatialItemImg"))}${cfTip(L("SBE.Inv.SpatialItemImgHint"))}</label>
      <div class="sbe-spset-img">
        <input type="text" class="sbe-spset-src" value="${esc(sp.img)}" placeholder="${esc(L("SBE.Inv.SpatialItemImgPh"))}">
        <a class="sbe-zm-pick sbe-spset-pick" data-tooltip-text="${esc(L("SBE.Common.Browse"))}"><i class="fa-solid fa-folder-open"></i></a>
      </div>
    </div>
  </div>`;
}

export function wireSpatialItemBox(sheet) {
  const root = sheet.element?.querySelector(".sbe-spset");
  if (!root || !game.user.isGM) return;
  const item = sheet.document;
  const v = (sel) => root.querySelector(sel)?.value ?? "";
  const read = () => cleanSpatial({
    w: v(".sbe-spset-w"), h: v(".sbe-spset-h"),
    img: v(".sbe-spset-src"), fit: v(".sbe-spset-fit")
  });
  const write = () => item.update({ [`flags.${SYSTEM_ID}.spatial`]: read() });
  /* La fiche est un formulaire : ces champs s'enregistrent seuls. */
  root.addEventListener("change", (ev) => { ev.stopPropagation(); write(); });
  root.addEventListener("input", (ev) => ev.stopPropagation());
  root.querySelector(".sbe-spset-pick")?.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const FP = foundry.applications.apps.FilePicker.implementation;
    new FP({
      type: "image",
      current: v(".sbe-spset-src") || item.img,
      callback: (path) => {
        const inp = root.querySelector(".sbe-spset-src");
        if (inp) inp.value = path;
        write();
      }
    }).render(true);
  });
}

/**
 * La taille ou l'image d'un objet du monde change : les fiches ouvertes
 * qui portent un de ses exemplaires se redessinent (sa place dans la
 * grille en dépend). Posé une fois, au démarrage.
 */
let refreshInstalled = false;
export function installSpatialRefresh() {
  if (refreshInstalled) return;
  refreshInstalled = true;
  Hooks.on("updateItem", (item, changes) => {
    if (item.parent || !foundry.utils.hasProperty(changes, `flags.${SYSTEM_ID}.spatial`)) return;
    for (const app of foundry.applications.instances.values()) {
      const doc = app.document;
      if (!app.rendered || doc?.documentName !== "Actor" && doc?.documentName !== "Item") continue;
      const carrier = doc.documentName === "Actor" ? doc : doc.parent;
      if (carrier?.items?.some(i => i.system?.modelId === item.id)) app.render();
    }
  });
}
