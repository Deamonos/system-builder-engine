/**
 * SBE — INVENTAIRE : le stockage des objets portés
 *
 * PRINCIPE (décision actée) : un objet possédé est un item EMBARQUÉ
 * sur la fiche (primitive Foundry, zéro dépendance). Personne d'autre
 * ne « détient » de liste : ni le conteneur, ni le slot, ni la fiche.
 *
 * Chaque objet porte son PORTAGE (system.carry) :
 *   host  = id de l'objet qui l'héberge ("" = la fiche elle-même)
 *   where = clé du contenant (conteneur ou slot)
 * Un conteneur n'AFFICHE que les objets dont le portage le désigne.
 * D'où : « équipé » = `where` pointe la clé d'un slot. Pas de booléen
 * en double, pas de désynchronisation possible.
 *
 * L'EMPILEMENT : le modèle porte l'option « empilable » ; la pile est
 * un COMPTEUR sur l'objet (clé réservée « quantity »), pas N documents
 * — 500 munitions restent un seul item. Deux objets fusionnent s'ils
 * viennent du même modèle et sont empilables. Ceux qui ne fusionnent
 * pas (états différents) restent des piles distinctes, simplement
 * REGROUPÉES à l'affichage sous le nom de leur modèle : rien n'est
 * jamais écrasé.
 *
 * Ce module ne produit AUCUN HTML : il prépare les données que le
 * moteur de rendu consomme, et exécute les mouvements. Le sens des
 * imports est à sens unique (inventaire → rendu), jamais l'inverse.
 */

import { slotAccepts, itemTags, capacityOf, gridDims, walkElements, isRefList, QUANTITY_KEY } from "./element-renderer.mjs";
import { computeAll, buildScope, evalExpression, withDefaults } from "./formula-engine.mjs";
import { propagationKeys } from "../managers/propagation/propagation-manager.mjs";
import { marksForItem } from "./icon-marks.mjs";
import { memoOf, revision, itemRevision } from "./data-revision.mjs";
import { scopeFunctionsOf } from "./doc-scope.mjs";
import {
  isSpatialEl, spatialDims, spatialOf, normRot, footprint, cellIndex,
  spatialLayout, boardWithout, fits, findSpot, mark
} from "./spatial.mjs";
import { SYSTEM_ID } from "../helpers/constants.mjs";

export { QUANTITY_KEY };

/* ============================================================ */
/*  Lecture                                                      */
/* ============================================================ */

/** Le modèle de cet objet est-il empilable ? */
export function isStackableItem(item) {
  return !!item?.system?.template?.system?.opts?.stackable;
}

/** Option du modèle « Déposable sur la scène » (cochée par défaut) :
    décochée, les objets de ce modèle ne se posent jamais au sol. */
export function isDroppableItem(item) {
  return item?.system?.template?.system?.opts?.droppable !== false;
}

/** Option du modèle « Visible des joueurs » (cochée par défaut) :
    décochée, les objets de ce modèle n'apparaissent qu'au MJ, partout
    où un objet porté s'affiche (contenants, slots, HUD, menu du jeton).
    Ils comptent quand même dans les formules : une malédiction cachée
    agit sans se montrer. */
export function isGmOnlyItem(item) {
  return item?.system?.template?.system?.opts?.playerVisible === false;
}

/** Ce joueur doit-il voir cet objet (ou cette entrée d'inventaire) ? */
export function seenByUser(itemOrEntry, user = game.user) {
  if (user?.isGM) return true;
  return itemOrEntry?.gmOnly !== undefined ? !itemOrEntry.gmOnly : !isGmOnlyItem(itemOrEntry);
}

/**
 * Taille MAXIMALE d'une pile de ce modèle (0 = illimitée). Réglée sur
 * le modèle d'objet, molette « empilable » : une boîte de munitions de
 * 30 ne contient jamais 31 cartouches, et un apport plus gros se
 * répartit en plusieurs piles.
 */
export function stackMaxOf(item) {
  const n = Number(item?.system?.template?.system?.opts?.stackMax);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Quantité de la pile (1 si non empilable ou quantité absente). */
export function qtyOf(item) {
  if (!isStackableItem(item)) return 1;
  const n = Number(item.system?.values?.[QUANTITY_KEY]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

/**
 * EN ATTENTE : reçu par un conteneur plein (échange, objet donné par un
 * effet…), l'objet lui appartient mais n'y a pas encore sa place. Il
 * attend dans la zone d'attente du conteneur, jusqu'à ce qu'on l'y
 * range. (Une grille spatiale le déduit de sa mise en place.)
 */
export function isWaiting(item) {
  return !!item?.flags?.[SYSTEM_ID]?.waiting;
}

/**
 * Objet DONNÉ par un effet et verrouillé : son porteur ne peut ni le
 * jeter, ni le donner, ni le déposer ailleurs (le MJ, si).
 */
export function isLockedItem(item) {
  return !!item?.flags?.[SYSTEM_ID]?.given?.lock && !game.user?.isGM;
}

/** Refus (avec message) si l'objet verrouillé devait quitter son porteur. */
export function refuseLocked(item) {
  if (!isLockedItem(item)) return false;
  ui.notifications.warn(game.i18n.format("SBE.Inv.Locked", { name: item.name }));
  return true;
}

/** La fiche qui porte réellement les objets (l'acteur), ou null. */
/* PORTEUR D'EMPRUNT : un objet POSÉ sur la scène (objet de scène) est
   utilisé par le personnage qui interagit — pendant l'action, c'est lui
   le porteur (ses ingrédients, ses munitions, son jet). */
const CARRIER_OVERRIDE = new Map();

/** Comme asCarrier, pour un calcul immédiat (pas d'attente dedans). */
export function asCarrierSync(item, actor, fn) {
  const k = item?.uuid;
  if (!k || !actor) return fn();
  const prev = CARRIER_OVERRIDE.get(k);
  CARRIER_OVERRIDE.set(k, actor);
  try { return fn(); }
  finally { if (prev) CARRIER_OVERRIDE.set(k, prev); else CARRIER_OVERRIDE.delete(k); }
}

/** Exécute `fn` avec `actor` comme porteur de `item`. */
export async function asCarrier(item, actor, fn) {
  const k = item?.uuid;
  if (!k || !actor) return fn();
  const prev = CARRIER_OVERRIDE.get(k);
  CARRIER_OVERRIDE.set(k, actor);
  try { return await fn(); }
  finally { if (prev) CARRIER_OVERRIDE.set(k, prev); else CARRIER_OVERRIDE.delete(k); }
}

/**
 * L'objet et TOUT ce qu'il contient (en profondeur : munitions d'une
 * arme, accessoires, contenu d'un sac), en données qui gardent leurs
 * ids — les liens « contenu dans » (carry.host) restent valables.
 * Le premier est l'objet lui-même.
 */
export function bundleOf(item) {
  const all = item?.parent?.items?.contents ?? [];
  const out = [];
  const seen = new Set();
  const add = (it) => {
    if (seen.has(it.id)) return;
    seen.add(it.id);
    out.push(it.toObject());
    for (const c of all) if (String(c.system?.carry?.host ?? "") === it.id) add(c);
  };
  if (item) add(item);
  return out;
}

/** Cet objet en contient-il d'autres ? */
export function holdsOthers(item) {
  return !!item?.parent?.items?.some?.(i => String(i.system?.carry?.host ?? "") === item.id);
}

/**
 * L'acteur où l'objet se trouve VRAIMENT (sa fiche, ou le pion d'un
 * objet posé), sans tenir compte de asCarrier. C'est là que vit son
 * CONTENU (munitions chargées, accessoires) : un objet posé utilisé par
 * un personnage garde ses munitions, le personnage donne ses jets et ce
 * qu'on lui prend.
 */
export function holderOf(doc) {
  if (!doc) return null;
  if (doc.documentName === "Actor") return doc;
  return doc.parent?.documentName === "Actor" ? doc.parent : null;
}

export function carrierOf(doc) {
  if (!doc) return null;
  if (doc.uuid && CARRIER_OVERRIDE.has(doc.uuid)) return CARRIER_OVERRIDE.get(doc.uuid);
  if (doc.documentName === "Actor") return doc;
  return doc.parent?.documentName === "Actor" ? doc.parent : null;
}

/** Identifiant d'hôte d'une fiche : "" pour la fiche, l'id pour un objet. */
export function hostIdOf(doc) {
  return doc?.documentName === "Actor" ? "" : (doc?.id ?? "");
}

/** Les objets parmi lesquels vit le contenu de cette fiche : ceux de
    l'acteur, ou le contenu gardé par un objet du monde. */
export function itemsAround(doc) {
  const carrier = holderOf(doc);
  if (carrier) return carrier.items?.contents ?? [...(carrier.items ?? [])];
  /* Un objet du contenu (l'arme d'un piège) : ses voisins. */
  if (VIRTUAL.has(doc)) return worldContents(ROOT.get(doc));
  return worldContents(doc);
}

/** Les objets portés, rangés par objet hôte (« » = la fiche). */
function childrenIndex(items) {
  const idx = new Map();
  for (const it of items ?? []) {
    if (it.type !== "objet") continue;
    const h = String(it.system?.carry?.host ?? "");
    if (!idx.has(h)) idx.set(h, []);
    idx.get(h).push(it);
  }
  return idx;
}

/** Tout ce qu'un objet contient, en profondeur (un chargeur dans une
    arme dans un sac). Protégé contre les boucles de portage. */
function descendantsOf(idx, hostId, seen = new Set()) {
  const out = [];
  for (const it of idx.get(hostId) ?? []) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    out.push(it, ...descendantsOf(idx, it.id, seen));
  }
  return out;
}

/**
 * OBJET INACTIF (option du modèle « Inactif si ») : tant que sa formule,
 * lue sur l'objet, est vraie, il n'apporte rien aux formules carried()
 * du porteur (bonus, avantages imposés, échec critique évité) — une
 * compétence d'une classe que le personnage n'a pas. Une formule qui
 * relirait l'inventaire en cours de calcul compte l'objet actif.
 */
const INACTIVE_BUSY = new Set();
/* Résultat gardé tant que rien n'a bougé (révision des données) : une
   fiche relit ses objets plusieurs fois par affichage, et chaque lecture
   recalculait le modèle de CHAQUE objet (lent sur un gros modèle). */
const INACTIVE_MEMO = new WeakMap();
export function isInactiveItem(item, vals = null) {
  const o = item?.system?.template?.system?.opts;
  const f = o?.inactive ? String(o.inactiveIf ?? "").trim() : "";
  if (!f || INACTIVE_BUSY.has(item)) return false;
  if (!vals) return memoOf(INACTIVE_MEMO, item, () => inactiveNow(item, f, null));
  return inactiveNow(item, f, vals);
}

function inactiveNow(item, f, vals) {
  INACTIVE_BUSY.add(item);
  try {
    const scope = buildScope(item.system?.template?.system?.elements ?? [], vals ?? item.system?.values ?? {}, {});
    Object.assign(scope, scopeFunctionsOf(item));
    return !!evalExpression(f, scope);
  } catch (_e) {
    return false;
  } finally {
    INACTIVE_BUSY.delete(item);
  }
}

/** Les valeurs d'un objet, ses défauts manquants compris. */
function valuesOf(item) {
  return withDefaults(item?.system?.template?.system?.elements, item?.system?.values);
}

/** Entrée minimale pour les formules (pas de calcul en cascade). */
function lightEntry(it) {
  const c = it.system?.carry ?? {};
  return {
    id: it.id,
    host: String(c.host ?? ""),
    where: String(c.where ?? ""),
    qty: qtyOf(it),
    vals: valuesOf(it),
    inactive: isInactiveItem(it)
  };
}

/** Une entrée d'inventaire, prête pour l'affichage.
    Ses formules voient CE QUE L'OBJET CONTIENT : une arme affiche le
    nombre de balles de SON chargeur, pas celles du personnage. */
/* Formules et repères d'un objet, gardés tant que rien ne change
   (révision des données) : une fiche bien remplie ne recalcule pas
   ses 50 objets à chaque affichage ou changement d'onglet. */
const ENTRY_CALC = new WeakMap();
/* Gardé tant que l'objet, ce qu'il contient et la révision des OBJETS
   n'ont pas bougé : un changement de la fiche du porteur (PV…) ne
   recalcule pas tous ses objets. */
function entryCalc(item, idx) {
  const kids = idx ? descendantsOf(idx, item.id) : [];
  const rev = itemRevision();
  const hit = ENTRY_CALC.get(item);
  if (hit && hit.rev === rev && hit.sys === item.system && hit.kids.length === kids.length
    && hit.kids.every((s, i) => s === kids[i].system)) return hit.value;
  const tplEls = item.system?.template?.system?.elements ?? [];
  let vals = valuesOf(item);
  const inner = kids.map(lightEntry);
  try {
    const { results } = computeAll(tplEls, vals, { inventory: { all: inner } });
    vals = { ...vals, ...results };
  } catch (_e) { /* modèle incomplet : on garde les valeurs brutes */ }
  /* Repères sur l'icône : calculés ici, une fois, pour tous les
     affichages (grille, liste, slot, HUD). */
  let marks = null;
  try { marks = marksForItem(item, vals, inner); } catch (_e) { marks = null; }
  const value = { vals, marks };
  ENTRY_CALC.set(item, { rev, sys: item.system, kids: kids.map(k => k.system), value });
  return value;
}

/* « Inactif si » peut lire le porteur : gardé selon la révision COMPLÈTE. */
const ENTRY_INACTIVE = new WeakMap();
function entryInactive(item, vals) {
  const rev = revision();
  const hit = ENTRY_INACTIVE.get(item);
  if (hit && hit.rev === rev && hit.vals === vals) return hit.value;
  const value = isInactiveItem(item, vals);
  ENTRY_INACTIVE.set(item, { rev, vals, value });
  return value;
}

function entryOf(item, idx = null) {
  const calc = entryCalc(item, idx);
  /* Copie : un appelant qui retouche les valeurs n'abîme pas la mémoire. */
  const vals = { ...calc.vals };
  const marks = calc.marks;
  const modelId = item.system?.modelId ?? "";
  const c = item.system?.carry ?? {};
  return {
    id: item.id,
    templateId: item.system?.templateId ?? "",
    templateName: item.system?.template?.name ?? "",
    tags: itemTags(item),
    host: String(c.host ?? ""),
    where: String(c.where ?? ""),
    cell: Number.isInteger(c.cell) ? c.cell : -1,
    /* GRILLE SPATIALE : rectangle et image (réglés sur l'objet du
       monde), case en haut à gauche et quart de tour de CET objet. */
    sp: spatialOf(item),
    x: Number.isInteger(c.x) ? c.x : 0,
    y: Number.isInteger(c.y) ? c.y : 0,
    rot: normRot(c.rot),
    /* Le contenu d'un objet du monde n'a pas d'adresse : il ne se tire
       pas hors de la fiche (il suit l'objet). */
    uuid: VIRTUAL.has(item) ? "" : item.uuid,
    name: item.name,
    img: item.img,
    qty: qtyOf(item),
    stackable: isStackableItem(item),
    gmOnly: isGmOnlyItem(item),
    waiting: isWaiting(item),
    modelId,
    modelName: (modelId ? game.items.get(modelId)?.name : "") || item.name,
    vals,
    marks,
    inactive: entryInactive(item, calc.vals)
  };
}

/**
 * Inventaire d'une fiche.
 * - `byKey` : ce que CETTE fiche affiche (objets dont l'hôte est elle) ;
 * - `all`   : TOUT ce que le personnage porte, hôtes imbriqués compris —
 *   c'est cette liste que lisent les formules (un sac dans un sac pèse
 *   quand même sur les épaules) ;
 * - `waiting` : par clé, les objets EN ATTENTE d'un conteneur plein (ni
 *   affichés dans le conteneur, ni comptés dans sa place ; portés quand même).
 * @returns {{byKey: Object, waiting: Object, all: Array, carrier: Actor|null, host: string}}
 */
export function buildInventory(doc) {
  const carrier = holderOf(doc);
  const host = hostIdOf(doc);
  const byKey = {};
  const waiting = {};
  const all = [];
  /* Un objet du monde montre le contenu qu'il garde avec lui. */
  const pool = itemsAround(doc);
  if (!pool.length) return { byKey, waiting, all, carrier, host };
  const idx = childrenIndex(pool);
  /* Ce que voient les formules de CETTE fiche :
     - une fiche de personnage : tout ce qu'il porte ;
     - un objet : seulement ce qu'il contient (en profondeur). */
  const scopeItems = host
    ? new Set(descendantsOf(idx, host).map(i => i.id))
    : null;
  for (const it of pool) {
    if (it.type !== "objet") continue;
    /* Fiche d'un OBJET : ses voisins chez le porteur ne servent ni à
       ses formules ni à son affichage — pas de calcul pour eux. */
    if (scopeItems && !scopeItems.has(it.id) && String(it.system?.carry?.host ?? "") !== host) continue;
    const entry = entryOf(it, idx);
    if (!scopeItems || scopeItems.has(it.id)) all.push(entry);
    if (entry.host !== host) continue;
    ((entry.waiting ? waiting : byKey)[entry.where] ??= []).push(entry);
  }
  for (const list of [...Object.values(byKey), ...Object.values(waiting)]) {
    list.sort((a, b) => a.modelName.localeCompare(b.modelName, game.i18n.lang)
      || a.name.localeCompare(b.name, game.i18n.lang));
  }
  return { byKey, waiting, all, carrier, host };
}

/** Quantité totale déjà rangée dans un contenant. */
export function loadOf(inv, key) {
  return (inv.byKey?.[key] ?? []).reduce((n, e) => n + (e.qty || 1), 0);
}

/** Place restante (null = illimité). La capacité peut être une
    formule lue sur l'hôte : « magSize » pour un chargeur. */
export function freeRoom(el, inv, key, scope = {}) {
  const max = capacityOf(el, scope);
  if (!max) return null;
  return Math.max(0, max - loadOf(inv, key));
}

/** Portée de formule de la fiche qui reçoit (ses clés + ce qu'elle contient). */
function hostScope(doc, inv) {
  const tpl = doc?.system?.template;
  try {
    return buildScope(tpl?.system?.elements ?? [], doc?.system?.values ?? {}, { inventory: inv });
  } catch (_e) { return {}; }
}

/**
 * Ce contenant accepte-t-il les piles ?
 * Un CONTENEUR dit oui par défaut (c'est un sac), un SLOT dit non
 * (une main, un fourreau : un exemplaire) — le créateur inverse d'une
 * case à cocher.
 */
export function acceptsStacks(el) {
  if (el?.kind === "slot") return !!el.config?.acceptStacks;
  return el?.config?.acceptStacks !== false;
}

/* ============================================================ */
/*  Grille spatiale                                              */
/* ============================================================ */

/** Pièces de la grille spatiale, telles que les lit la mise en place. */
export function spatialPieces(entries) {
  return (entries ?? []).map(e => ({
    id: e.id, name: e.name, w: e.sp?.w ?? 1, h: e.sp?.h ?? 1,
    rot: e.rot ?? 0, x: e.x ?? 0, y: e.y ?? 0, placed: (e.cell ?? -1) >= 0, e
  }));
}

/** Écriture de la position d'un objet dans la grille spatiale. */
function spatialUpdate(id, x, y, sd) {
  return { _id: id, "system.carry.x": x, "system.carry.y": y, "system.carry.cell": cellIndex(x, y, sd.cols) };
}

/** Position d'un objet déplacé tel quel (emplacement, ou hors de la grille). */
function spatialPos(spot, origin = "") {
  if (spot) {
    return {
      "system.carry.x": spot.x, "system.carry.y": spot.y, "system.carry.rot": 0,
      "system.carry.cell": spot.cell, [`flags.${SYSTEM_ID}.spatialFrom`]: null
    };
  }
  return {
    "system.carry.x": 0, "system.carry.y": 0, "system.carry.rot": 0, "system.carry.cell": -1,
    ...(origin ? { [`flags.${SYSTEM_ID}.spatialFrom`]: origin } : {})
  };
}

/**
 * Mise en place actuelle d'un conteneur en grille spatiale (celle que
 * la fiche affiche), ou null si le conteneur n'en est pas une.
 */
export function spatialLayoutOf(sheetDoc, el, inv = null) {
  if (!isSpatialEl(el)) return null;
  const sd = spatialDims(el.config);
  const list = (inv ?? buildInventory(sheetDoc)).byKey?.[el.key] ?? [];
  return { sd, lay: spatialLayout(spatialPieces(list), sd) };
}

/**
 * PIVOTER un objet d'un quart de tour (dir = 1 : sens horaire,
 * -1 : anti-horaire). Son coin haut gauche ne bouge pas ; s'il n'y a
 * pas la place pour le rectangle pivoté, rien ne change. Hors de la
 * grille, il pivote librement (il sera placé ensuite).
 */
export async function rotateCarried({ sheetDoc, el, item, dir = 1 }) {
  const carrier = holderOf(sheetDoc);
  const got = spatialLayoutOf(sheetDoc, el);
  if (!carrier || !got || !item) return false;
  const { sd, lay } = got;
  const rot = normRot(normRot(item.system?.carry?.rot) + (dir < 0 ? -90 : 90));
  const me = lay.placed.find(p => p.id === item.id);
  if (!me) {
    await item.update({ "system.carry.rot": rot });
    return true;
  }
  const sp = spatialOf(item);
  const { fw, fh } = footprint(sp.w, sp.h, rot);
  if (!fits(boardWithout(lay, sd, [item.id]), me.x, me.y, fw, fh)) {
    ui.notifications.warn(game.i18n.format("SBE.Inv.SpatialNoRotate", { name: item.name }));
    return false;
  }
  const updates = lay.placed.filter(p => p.id !== item.id && p.auto).map(p => spatialUpdate(p.id, p.x, p.y, sd));
  updates.push({ ...spatialUpdate(item.id, me.x, me.y, sd), "system.carry.rot": rot });
  await carrier.updateEmbeddedDocuments("Item", updates);
  return true;
}

/* ============================================================ */
/*  Mouvements                                                   */
/* ============================================================ */

/**
 * Petite fenêtre « combien ? » — jamais affichée pour une quantité de
 * 1 : le geste doit rester direct dans le cas courant.
 * @returns {Promise<number|null>} quantité voulue, ou null si annulé.
 */
export async function askQuantity({ total, max, name }) {
  const L = (k) => game.i18n.localize(k);
  /* total = null : AJOUT depuis un modèle du monde (réserve sans fin) —
     on part de 1, plafonné seulement par la place du contenant. */
  const adding = total === null || total === undefined;
  const cap = adding ? (Number.isFinite(max) && max !== null ? Math.max(1, max) : null)
    : Math.max(1, Math.min(total, max ?? total));
  const nm = foundry.utils.escapeHTML(name ?? "");
  const content = `
    <div class="form-group" style="display:flex;flex-direction:column;gap:4px;">
      <label>${adding ? game.i18n.format("SBE.Inv.HowManyAdd", { name: nm })
        : game.i18n.format("SBE.Inv.HowMany", { name: nm, total })}</label>
      <input type="number" name="qty" value="${adding ? 1 : cap}" min="1" ${cap ? `max="${cap}"` : ""} step="1" autofocus>
      ${cap ? `<p class="notes">${game.i18n.format("SBE.Inv.HowManyMax", { max: cap })}</p>` : ""}
    </div>`;
  return new Promise((resolve) => {
    let out = null;
    const dlg = new foundry.applications.api.DialogV2({
      window: { title: L("SBE.Inv.MoveTitle") },
      position: { width: 320 },
      content,
      buttons: [
        ...(cap ? [{
          action: "all", label: L(adding ? "SBE.Inv.AddMax" : "SBE.Inv.MoveAll"), icon: "fa-solid fa-layer-group",
          callback: () => { out = cap; return "all"; }
        }] : []),
        {
          action: "ok", label: L("SBE.Common.Validate"), icon: "fa-solid fa-check", default: true,
          callback: (_ev, _btn, dialog) => {
            const n = Number(dialog.element.querySelector('[name="qty"]')?.value);
            out = Number.isFinite(n) ? Math.max(1, cap ? Math.min(cap, Math.floor(n)) : Math.floor(n)) : null;
            return "ok";
          }
        },
        { action: "cancel", label: L("SBE.Common.Cancel"), icon: "fa-solid fa-xmark" }
      ]
    });
    dlg.addEventListener("close", () => resolve(out), { once: true });
    dlg.render({ force: true });
  });
}

/**
 * Identité de MODÈLE d'un objet : son modelId, ou son propre id quand
 * l'objet EST le modèle (c'est de lui que naîtront les instances).
 */
function modelIdentity(item) {
  return String(item?.system?.modelId || item?.id || "");
}

/**
 * Deux objets peuvent-ils fusionner ? Même modèle, empilables, et
 * mêmes valeurs sur tout ce qui NE SUIT PAS le modèle.
 *
 * C'est la propagation qui donne la réponse : un champ propagé est
 * identique sur tous les exemplaires par construction, il ne peut pas
 * faire diverger deux piles. Seuls les champs décochés (état propre à
 * chaque exemplaire : usure, état…) comptent. Deux piles de flèches,
 * l'une intacte et l'autre usée, restent donc deux piles.
 */
export function canMerge(a, b) {
  if (!a || !b) return false;
  if (!isStackableItem(a) || !isStackableItem(b)) return false;
  /* Un objet donné par un effet reste à part (il repart avec l'effet). */
  if (a.flags?.[SYSTEM_ID]?.given || b.flags?.[SYSTEM_ID]?.given) return false;
  const ma = modelIdentity(a);
  if (!ma || ma !== modelIdentity(b)) return false;

  const { own } = propagationKeys(a.system?.template?.system?.elements ?? []);
  const va = a.system?.values ?? {};
  const vb = b.system?.values ?? {};
  for (const k of own) {
    if (k === QUANTITY_KEY) continue;
    if (!foundry.utils.equals({ v: va[k] ?? null }, { v: vb[k] ?? null })) return false;
  }
  return true;
}

/** Toutes les piles d'un contenant avec lesquelles l'objet fusionne,
    les moins remplies d'abord (on complète avant d'entamer). */
function mergeTargetsIn(carrier, host, key, item) {
  const out = [];
  for (const it of carrier.items) {
    if (it.type !== "objet" || it.id === item.id || isWaiting(it)) continue;
    const c = it.system?.carry ?? {};
    if (String(c.host ?? "") !== host || String(c.where ?? "") !== key) continue;
    if (canMerge(it, item)) out.push(it);
  }
  return out.sort((a, b) => qtyOf(b) - qtyOf(a));
}

/**
 * Pose N exemplaires d'un objet dans un contenant : on COMPLÈTE
 * d'abord les piles compatibles déjà là (sans dépasser la taille
 * maximale du modèle), puis on crée autant de piles que nécessaire.
 * Cent cartouches par boîtes de trente donnent donc trois boîtes
 * pleines et une de dix — jamais une pile de cent.
 */
async function placeUnits({ carrier, host, key, source, units, cell = -1, spots = null, origin = "", stamp = null }) {
  const smax = stackMaxOf(source);
  let left = units;

  /* Objet marqué (donné par un effet) : jamais fondu dans une pile. */
  for (const it of stamp ? [] : mergeTargetsIn(carrier, host, key, source)) {
    if (left <= 0) break;
    const cur = qtyOf(it);
    const cap = smax > 0 ? smax - cur : Infinity;
    if (cap <= 0) continue;
    const add = Math.min(cap, left);
    await it.update({ [`system.values.${QUANTITY_KEY}`]: cur + add });
    left -= add;
  }

  const creations = [];
  while (left > 0) {
    const n = smax > 0 ? Math.min(smax, left) : left;
    /* Grille spatiale : chaque nouvelle pile reçoit son emplacement ;
       sans emplacement, elle attend hors de la grille. */
    const spot = spots ? spots[creations.length] ?? null : null;
    const data = instanceDataFrom(source, {
      qty: n, host, where: key,
      cell: spots ? (spot ? spot.cell : -1) : (creations.length ? -1 : cell),
      x: spot?.x ?? 0, y: spot?.y ?? 0
    });
    if (spots && !spot && origin) foundry.utils.setProperty(data, `flags.${SYSTEM_ID}.spatialFrom`, origin);
    for (const [k, v] of Object.entries(stamp ?? {})) foundry.utils.setProperty(data, `flags.${SYSTEM_ID}.${k}`, foundry.utils.deepClone(v));
    creations.push(data);
    left -= n;
  }
  if (creations.length) await carrier.createEmbeddedDocuments("Item", creations);
}

/** Données de création d'une INSTANCE à partir d'un objet source. */
function instanceDataFrom(source, { qty, host, where, cell = -1, x = 0, y = 0 }) {
  const sys = source.system ?? {};
  const values = foundry.utils.deepClone(sys.values ?? {});
  if (isStackableItem(source)) values[QUANTITY_KEY] = qty;
  /* Un objet du monde emporte son contenu : il deviendra de vrais
     objets à l'arrivée (materialize). */
  const stored = isWorldItem(source) ? storedOf(source) : [];
  return {
    ...(stored.length ? { flags: { [SYSTEM_ID]: { [CONTENTS]: foundry.utils.deepClone(stored) } } } : {}),
    name: source.name,
    type: "objet",
    img: source.img,
    system: {
      templateId: sys.templateId ?? "",
      templateVersion: sys.templateVersion ?? 0,
      /* Un MODÈLE déposé engendre une instance qui pointe vers lui ;
         une instance déposée garde le modèle d'origine. */
      modelId: sys.modelId || source.id,
      description: sys.description ?? "",
      values,
      carry: { host, where, x, y, rot: 0, cell, fromHost: "", fromWhere: "" }
    }
  };
}

/** Élément d'une fiche par sa clé (le personnage, ou l'objet hôte). */
export function elementOn(doc, key) {
  if (!doc || !key) return null;
  for (const e of walkElements(doc.system?.template?.system?.elements ?? [])) if (e?.key === key) return e;
  return null;
}

/**
 * ORIGINE d'un objet qui entre dans un SLOT : le contenant qu'il quitte
 * (venu d'un autre slot, il garde la sienne). Hors d'un slot : effacée.
 */
function originOf(carrier, item, el) {
  const c = item.system?.carry ?? {};
  if (el?.kind !== "slot") return { "system.carry.fromHost": "", "system.carry.fromWhere": "" };
  const prevHost = String(c.host ?? "");
  const prevWhere = String(c.where ?? "");
  const prevEl = elementOn(prevHost ? carrier.items.get(prevHost) : carrier, prevWhere);
  if (prevEl?.kind === "slot") return {};
  return { "system.carry.fromHost": prevEl ? prevHost : "", "system.carry.fromWhere": prevEl ? prevWhere : "" };
}

/**
 * RENVOIE un objet équipé d'où il venait : son contenant d'origine
 * (retenu à l'entrée dans le slot) ; sans origine, le premier conteneur
 * de la fiche qui l'accepte. La place d'abord ; `overflow` : plein, il
 * attend dans la zone d'attente de ce même conteneur.
 * @returns {Promise<boolean|"overflow">}
 */
export async function sendBack(sheetDoc, item, { overflow = false } = {}) {
  const carrier = holderOf(sheetDoc);
  if (!carrier || !item) return false;
  const c = item.system?.carry ?? {};
  const qty = isStackableItem(item) ? qtyOf(item) : null;
  const originDoc = c.fromWhere ? (c.fromHost ? carrier.items.get(c.fromHost) : carrier) : null;
  const originEl = originDoc ? elementOn(originDoc, c.fromWhere) : null;
  const others = [...walkElements(sheetDoc.system?.template?.system?.elements ?? [])]
    .filter(el => el?.kind === "container" && el.key && !isRefList(el) && el !== originEl)
    .map(el => [sheetDoc, el]);
  const groups = originEl?.kind === "container" ? [[[originDoc, originEl]], others] : [others];
  for (const group of groups) {
    for (const ov of overflow ? [false, true] : [false]) {
      for (const [doc, el] of group) {
        if (slotAccepts(el, item, doc)) continue;
        const ok = await dropIntoContainer({ sheetDoc: doc, el, item, quantity: qty, overflow: ov, quiet: true }).catch(() => false);
        if (ok) return ok;
      }
    }
  }
  return false;
}

/**
 * ZONE D'ATTENTE d'un conteneur plein : l'objet (ou `qty` exemplaires)
 * y est reçu tel quel, sans fusion ni case ; son propriétaire le range
 * quand il a fait de la place.
 */
async function waitIn({ carrier, host, key, item, qty, already, origin = "", stamp = null }) {
  const marks = { waiting: true, ...(origin ? { spatialFrom: origin } : {}), ...(stamp ?? {}) };
  const total = qtyOf(item);
  const carry = { host, where: key, x: 0, y: 0, rot: 0, cell: -1, fromHost: "", fromWhere: "" };
  if (already && qty >= total) {
    const upd = { "system.carry": carry };
    for (const [k, v] of Object.entries(marks)) upd[`flags.${SYSTEM_ID}.${k}`] = v;
    await item.update(upd);
    return "overflow";
  }
  const data = instanceDataFrom(item, { qty, host, where: key });
  for (const [k, v] of Object.entries(marks)) foundry.utils.setProperty(data, `flags.${SYSTEM_ID}.${k}`, foundry.utils.deepClone(v));
  await carrier.createEmbeddedDocuments("Item", [data]);
  /* La source : décomptée si elle est portée (ici ou ailleurs) ; un
     modèle du monde n'est pas consommé. */
  if (holderOf(item)) {
    const rest = total - qty;
    if (rest > 0) await item.update({ [`system.values.${QUANTITY_KEY}`]: rest });
    else await item.delete();
  }
  return "overflow";
}

/**
 * DÉPÔT d'un objet dans un contenant (conteneur ou slot en mode
 * instance). Gère les trois cas d'un seul tenant :
 *   - objet déjà porté par la même fiche → simple DÉPLACEMENT ;
 *   - modèle du monde / objet d'ailleurs → création d'une instance ;
 *   - pile → fenêtre de quantité, fusion si une pile compatible existe.
 *
 * @param {Object}   p
 * @param {Document} p.sheetDoc   fiche qui reçoit (acteur ou objet porté)
 * @param {Object}   p.el         élément contenant (config lue ici)
 * @param {Item}     p.item       objet déposé
 * @param {number}   [p.quantity] quantité imposée, sans fenêtre
 * @param {number}   [p.cell]     GRILLE en tri manuel : case visée
 * @param {number}   [p.fromCell] case affichée de l'objet déplacé (même grille)
 * @param {string}   [p.sort]     rangement choisi par le joueur (az, za, manual)
 * @param {Array}    [p.layout]   cases AFFICHÉES de la grille [{id, cell}] :
 *                                figées au premier geste, pour que rien
 *                                ne bouge en dehors de l'objet déplacé
 * @param {Object}   [p.at]       GRILLE SPATIALE : case visée {x, y} (coin
 *                                haut gauche) ; absente = premier libre
 * @param {boolean}  [p.overflow] sans place, l'objet est quand même reçu :
 *                                hors de la grille (grille spatiale) ou dans
 *                                la zone d'attente du conteneur (échanges,
 *                                objets donnés par un effet)
 * @param {string}   [p.origin]   uuid de l'ancien propriétaire (objet sans
 *                                place : « Rendre à… »)
 * @param {Object}   [p.stamp]    marques posées sur l'objet créé
 *                                (flags.<système>.<clé>) ; jamais fondu
 * @param {boolean}  [p.quiet]    aucun message (essais en série)
 * @returns {Promise<boolean|"overflow">} vrai si quelque chose a bougé ;
 *   "overflow" si une partie attend sans place
 */
export async function dropIntoContainer({ sheetDoc, el, item, quantity = null, cell = -1, fromCell = -1, layout = null, sort = "az", at = null, overflow = false, origin = "", stamp = null, quiet = false }) {
  const L = (k) => game.i18n.localize(k);
  const warn = (msg) => { if (!quiet) ui.notifications.warn(msg); };
  const carrier = holderOf(sheetDoc);
  if (!carrier) {
    /* Un objet du monde garde ce qu'on y range (il le portera partout). */
    if (isWorldItem(sheetDoc)) return dropIntoWorld({ sheetDoc, el, item, quantity });
    warn(L("SBE.Inv.NoCarrier"));
    return false;
  }
  const host = hostIdOf(sheetDoc);
  const key = String(el.key ?? "");

  /* Un objet verrouillé ne quitte pas son porteur. */
  const from0 = holderOf(item);
  if (from0 && from0 !== carrier && refuseLocked(item)) return false;
  /* Pris sur la fiche d'un autre : il faut pouvoir l'y retirer (sinon
     la copie arriverait et l'original resterait). */
  if (from0 && from0 !== carrier && !item.isOwner) {
    warn(game.i18n.format("SBE.Inv.NotYours", { name: item.name }));
    return false;
  }

  /* Filtre du contenant (identique pour slot et conteneur). */
  const refuse = slotAccepts(el, item, sheetDoc);
  if (refuse) {
    warn(L(refuse));
    return false;
  }

  /* Un objet ne peut jamais se ranger dans lui-même, ni dans un objet
     qu'il contient (boucle de portage). */
  if (item.id === host) {
    warn(L("SBE.Inv.SelfHost"));
    return false;
  }

  const inv = buildInventory(sheetDoc);
  const room = freeRoom(el, inv, key, hostScope(sheetDoc, inv));
  const already = carrier.items.get(item.id) === item;
  /* Un objet EN ATTENTE glissé dans son propre conteneur y prend place. */
  const sameSpot = already && !isWaiting(item)
    && String(item.system.carry?.host ?? "") === host
    && String(item.system.carry?.where ?? "") === key;
  const grid = el.kind === "container" && el.config?.display === "grid" ? { ...gridDims(el), sort } : null;
  const manual = grid?.sort === "manual" && Number.isInteger(cell) && cell >= 0;
  /* Cases telles qu'affichées : celles des objets rangés « au premier
     libre » sont enregistrées, sinon ils glisseraient au moindre geste. */
  const shown = new Map();
  if (manual && Array.isArray(layout)) {
    for (const r of layout) if (r?.id && Number.isInteger(r.cell)) shown.set(r.id, r.cell);
  }
  const mine = inv.byKey?.[key] ?? [];
  const cellOf = (e) => shown.has(e.id) ? shown.get(e.id) : e.cell;
  const freeze = (skip) => mine
    .filter(e => e.id !== skip && shown.has(e.id) && shown.get(e.id) !== e.cell)
    .map(e => ({ _id: e.id, "system.carry.cell": shown.get(e.id) }));

  /* GRILLE SPATIALE : la mise en place actuelle (celle qu'on voit). Les
     objets posés « au premier libre » à l'affichage sont fixés à leur
     place avant tout mouvement : rien d'autre ne bouge. */
  const sd = isSpatialEl(el) ? spatialDims(el.config) : null;
  const lay = sd ? spatialLayout(spatialPieces(mine), sd) : null;
  const freezeSp = (skip) => !lay ? [] : lay.placed
    .filter(p => p.id !== skip && p.auto)
    .map(p => spatialUpdate(p.id, p.x, p.y, sd));
  if (sameSpot && sd) {
    /* Même grille : l'objet change de place si son rectangle tient. */
    if (!at) return false;
    const me = lay.placed.find(p => p.id === item.id) ?? lay.out.find(p => p.id === item.id);
    if (!me) return false;
    if (lay.placed.includes(me) && !me.auto && me.x === at.x && me.y === at.y) return false;
    if (!fits(boardWithout(lay, sd, [item.id]), at.x, at.y, me.fw, me.fh)) {
      warn(L("SBE.Inv.SpatialBlocked"));
      return false;
    }
    const updates = freezeSp(item.id);
    updates.push({ ...spatialUpdate(item.id, at.x, at.y, sd), [`flags.${SYSTEM_ID}.spatialFrom`]: null });
    await carrier.updateEmbeddedDocuments("Item", updates);
    return true;
  }
  if (sameSpot) {
    /* Même grille, tri manuel : on change de case. L'occupant prend
       la place laissée libre (échange) — rien n'est jamais écrasé. */
    if (!manual || cell === fromCell) return false;
    const other = mine.find(e => e.id !== item.id && cellOf(e) === cell);
    const updates = freeze(item.id).filter(u => u._id !== other?.id);
    updates.push({ _id: item.id, "system.carry.cell": cell });
    if (other) updates.push({ _id: other.id, "system.carry.cell": fromCell >= 0 ? fromCell : -1 });
    await carrier.updateEmbeddedDocuments("Item", updates);
    return true;
  }

  const total = qtyOf(item);
  const stacks = acceptsStacks(el);

  /* Grille à lignes limitées : une case par objet ou pile. Pleine, elle
     n'accepte plus qu'un complément de pile déjà là. */
  const smax0 = stackMaxOf(item);
  const gridFull = !!grid?.cap && mine.length >= grid.cap
    && !(stacks && !stamp && mergeTargetsIn(carrier, host, key, item).some(t => smax0 === 0 || qtyOf(t) < smax0));

  /* CONTENEUR PLEIN, mais l'objet doit être reçu : il attend dans la
     zone d'attente du conteneur (la grille spatiale a la sienne). */
  if (overflow && el.kind === "container" && !sd) {
    const wanted = Math.max(1, Math.floor(Number(quantity ?? (from0 ? total : 1)) || 1));
    if (room === 0 || gridFull || (room !== null && wanted > room)) {
      return waitIn({ carrier, host, key, item, qty: Math.min(wanted, from0 ? total : Infinity), already, origin, stamp });
    }
  }

  if (room === 0) {
    warn(L("SBE.Inv.Full"));
    return false;
  }
  if (gridFull) {
    warn(L("SBE.Inv.GridFull"));
    return false;
  }
  /* Case libre visée : on la garde ; occupée, l'objet prend la première libre. */
  const target = manual && !mine.some(e => cellOf(e) === cell) ? cell : -1;
  if (manual) {
    const fz = freeze(item.id);
    if (fz.length) await carrier.updateEmbeddedDocuments("Item", fz);
  }

  /* Combien on déplace. Une quantité imposée (bouton « Recharger »,
     « Décharger ») évite la fenêtre : le geste doit être immédiat. */
  let move = 1;
  if (!stacks) {
    move = 1;
  } else if (quantity !== null) {
    /* Un modèle du monde est une réserve sans fin : seule la place du
       contenant plafonne (sortir 30 balles d'un coffre en sort 30). */
    const avail = holderOf(item) ? total : Infinity;
    move = Math.max(0, Math.min(Math.floor(Number(quantity) || 0), avail, room ?? avail));
    if (move <= 0) return false;
  } else if (!holderOf(item) && isStackableItem(item)) {
    /* Depuis la barre latérale (modèle du monde) : la réserve est sans
       fin, on demande combien en ajouter — plus besoin de déposer un
       par un. */
    const asked = await askQuantity({ total: null, max: room, name: item.name });
    if (!asked) return false;
    move = asked;
  } else if (total <= 1) {
    move = room === null ? 1 : Math.min(1, room);
  } else {
    const asked = await askQuantity({
      total, max: room === null ? total : Math.min(total, room), name: item.name
    });
    if (!asked) return false;
    move = asked;
  }

  /* DÉPLACEMENT SIMPLE : l'objet part en entier, aucune pile
     compatible ne l'attend, et il tient dans une seule pile → on
     déplace le DOCUMENT tel quel. C'est important : une arme usée
     gardée dans un slot doit rester LE même objet, avec son usure et
     son historique, pas une copie reconstruite. */
  const smax = stackMaxOf(item);
  const targets = stamp ? [] : mergeTargetsIn(carrier, host, key, item);
  const roomInPiles = targets.some(t => smax === 0 || qtyOf(t) < smax);
  const simple = already && move === total && !roomInPiles && (smax === 0 || total <= smax);

  /* GRILLE SPATIALE : chaque pile qui naît (ou l'objet déplacé tel
     quel) doit trouver son rectangle — la case visée d'abord, sinon le
     premier emplacement libre. Ce qui complète une pile déjà là ne
     prend aucune place. */
  let spots = null;
  let overflowed = false;
  if (sd) {
    const fill = targets.reduce((n, t) => n + (smax > 0 ? Math.max(0, smax - qtyOf(t)) : Infinity), 0);
    const left = Math.max(0, move - fill);
    const need = simple ? 1 : (left <= 0 ? 0 : (smax > 0 ? Math.ceil(left / smax) : 1));
    const sp = spatialOf(item);
    const board = boardWithout(lay, sd);
    spots = [];
    for (let i = 0; i < need; i++) {
      const s = (i === 0 && at && fits(board, at.x, at.y, sp.w, sp.h)) ? { x: at.x, y: at.y }
        : findSpot(board, sp.w, sp.h);
      if (!s) break;
      mark(board, s.x, s.y, sp.w, sp.h, `new${i}`);
      spots.push({ ...s, cell: cellIndex(s.x, s.y, sd.cols) });
    }
    if (spots.length < need) {
      if (!overflow) {
        warn(game.i18n.format("SBE.Inv.SpatialNoRoom", { name: item.name }));
        return false;
      }
      overflowed = true;
    }
    const fz = freezeSp(item.id);
    if (fz.length) await carrier.updateEmbeddedDocuments("Item", fz);
  }
  const done = overflowed ? "overflow" : true;

  if (simple) {
    await item.update({
      "system.carry.host": host, "system.carry.where": key,
      ...originOf(carrier, item, el),
      ...(isWaiting(item) ? { [`flags.${SYSTEM_ID}.waiting`]: null } : {}),
      ...(sd ? spatialPos(spots[0], origin)
        : { "system.carry.x": 0, "system.carry.y": 0, "system.carry.cell": target })
    });
    return done;
  }

  /* Sinon : on PRÉLÈVE les exemplaires à la source, puis on les pose.
     L'ordre compte — la source est lue AVANT d'être supprimée. */
  if (already) {
    const rest = total - move;
    if (rest > 0) await item.update({ [`system.values.${QUANTITY_KEY}`]: rest });
    await placeUnits({ carrier, host, key, source: item, units: move, cell: target, spots, origin });
    if (rest <= 0) await item.delete();
    return done;
  }

  await placeUnits({ carrier, host, key, source: item, units: move, cell: target, spots, origin, stamp });
  /* La source du monde n'est pas consommée (c'est un modèle) ; une
     instance venue d'une AUTRE fiche, si : on la décrémente. */
  const from = holderOf(item);
  if (from && from !== carrier) {
    const rest = qtyOf(item) - move;
    if (rest > 0) await item.update({ [`system.values.${QUANTITY_KEY}`]: rest });
    else await item.delete();
  }
  return done;
}

/* ============================================================ */
/*  Contenu d'un OBJET DU MONDE                                  */
/* ============================================================ */
/* Un objet de la barre latérale n'est porté par personne : ce qu'on
   range dans ses slots et conteneurs (l'arme d'un piège, le chargeur
   d'une arme, un sac déjà rempli) est gardé AVEC lui, en données
   (flags.<système>.contents). Les ids sont propres à ce contenu ; un
   hôte vide désigne l'objet lui-même. Dès que l'objet arrive dans un
   acteur (inventaire, scène, coffre), son contenu devient de vrais
   objets portés et la liste s'efface : une seule source à la fois. */

const CONTENTS = "contents";
/* Objets temporaires qui représentent ce contenu (lecture seule). */
const VIRTUAL = new WeakSet();
const VIRTUAL_CACHE = new WeakMap();
/* Objet temporaire → l'objet du monde qui le garde. */
const ROOT = new WeakMap();

/** Objet sans acteur (barre latérale, compendium). */
export function isWorldItem(doc) {
  return doc?.documentName === "Item" && !doc.parent && !VIRTUAL.has(doc);
}

/** Cet objet fait-il partie du contenu d'un objet du monde ? */
export function isVirtualItem(doc) {
  return !!doc && VIRTUAL.has(doc);
}

/** L'objet du monde qui garde cet objet du contenu. */
export function worldRootOf(doc) {
  return ROOT.get(doc) ?? null;
}

/** Le contenu enregistré (données brutes). */
function storedOf(doc) {
  const a = doc?._source?.flags?.[SYSTEM_ID]?.[CONTENTS];
  return Array.isArray(a) ? a : [];
}

/** Le contenu d'un objet du monde, en objets temporaires (pour
    l'affichage et les formules ; ils ne s'enregistrent pas). */
export function worldContents(doc) {
  if (!isWorldItem(doc)) return [];
  const raw = storedOf(doc);
  if (!raw.length) return [];
  const hit = VIRTUAL_CACHE.get(raw);
  if (hit?.id === doc.id) return hit.docs;
  const cls = CONFIG.Item.documentClass;
  const docs = [];
  for (const d of raw) {
    const data = foundry.utils.deepClone(d);
    if (!String(data.system?.carry?.host ?? "")) foundry.utils.setProperty(data, "system.carry.host", doc.id);
    try {
      const it = new cls(data);
      VIRTUAL.add(it);
      ROOT.set(it, doc);
      docs.push(it);
    } catch (e) { console.warn("SBE | Contenu illisible :", d?.name, e); }
  }
  VIRTUAL_CACHE.set(raw, { id: doc.id, docs });
  return docs;
}

/**
 * Données d'un objet et de tout ce qu'il contient, prêtes à rejoindre un
 * contenu : ids neufs, liens internes refaits, l'objet lui-même rangé
 * dans `host` / `where`.
 */
function packedBundle(source, host, where) {
  let datas;
  if (holderOf(source)) datas = bundleOf(source);
  else {
    const top = source.toObject();
    /* Ce qui ne regarde que la barre latérale ne suit pas l'objet. */
    for (const k of ["folder", "sort", "ownership", "_stats"]) delete top[k];
    datas = [top, ...foundry.utils.deepClone(storedOf(source)).map(d => {
      if (!String(d.system?.carry?.host ?? "")) foundry.utils.setProperty(d, "system.carry.host", top._id);
      return d;
    })];
    /* Un modèle du monde engendre une instance qui pointe vers lui. */
    if (!top.system?.modelId) foundry.utils.setProperty(top, "system.modelId", source.id);
  }
  const ids = new Map(datas.map(d => [d._id, foundry.utils.randomID()]));
  return datas.map((d, i) => {
    d._id = ids.get(d._id);
    if (d.flags?.[SYSTEM_ID]) delete d.flags[SYSTEM_ID][CONTENTS];
    if (i === 0) {
      foundry.utils.mergeObject(d, { system: { carry: { host, where, x: 0, y: 0, rot: 0, cell: -1 } } });
    } else {
      const h = String(d.system?.carry?.host ?? "");
      foundry.utils.setProperty(d, "system.carry.host", ids.get(h) ?? h);
    }
    return d;
  });
}

/**
 * Ajoute N exemplaires dans un contenu (données) : complète d'abord les
 * piles compatibles, puis crée des piles. Un objet unique (non
 * empilable) arrive avec tout ce qu'il contient.
 */
function addUnits(raw, doc, { host, key, source, units }) {
  if (!isStackableItem(source)) {
    raw.push(...packedBundle(source, host, key));
    return;
  }
  const smax = stackMaxOf(source);
  let left = units;
  const docs = new Map(worldContents(doc).map(d => [d.id, d]));
  for (const d of raw) {
    if (left <= 0) break;
    const c = d.system?.carry ?? {};
    if (String(c.host ?? "") !== host || String(c.where ?? "") !== key) continue;
    if (!canMerge(docs.get(d._id), source)) continue;
    const cur = Math.max(1, Math.floor(Number(d.system?.values?.[QUANTITY_KEY]) || 1));
    const add = Math.min(smax > 0 ? smax - cur : Infinity, left);
    if (add <= 0) continue;
    foundry.utils.setProperty(d, `system.values.${QUANTITY_KEY}`, cur + add);
    left -= add;
  }
  while (left > 0) {
    const n = smax > 0 ? Math.min(smax, left) : left;
    const data = { _id: foundry.utils.randomID(), ...instanceDataFrom(source, { qty: n, host, where: key }) };
    delete data.flags;
    raw.push(data);
    left -= n;
  }
}

/**
 * Range un objet dans un contenant d'un objet du monde.
 * @param {string} [p.hostRef] objet du contenu qui reçoit ("" = l'objet du monde)
 */
export async function dropIntoWorld({ sheetDoc, el, item, quantity = null, hostRef = "", hostDoc = null }) {
  const L = (k) => game.i18n.localize(k);
  if (!sheetDoc?.isOwner) return false;
  const target = hostDoc ?? sheetDoc;
  const key = String(el.key ?? "");
  const refuse = slotAccepts(el, item, target);
  if (refuse) { ui.notifications.warn(L(refuse)); return false; }
  if (item.uuid === sheetDoc.uuid) { ui.notifications.warn(L("SBE.Inv.SelfHost")); return false; }
  const from = holderOf(item);
  /* Un objet posé sur la scène se reprend d'abord. */
  if (from?.isToken) { ui.notifications.warn(L("SBE.Inv.WorldFromScene")); return false; }
  if (from && refuseLocked(item)) return false;

  const inv = buildInventory(target);
  const room = freeRoom(el, inv, key, hostScope(target, inv));
  if (room === 0) { ui.notifications.warn(L("SBE.Inv.Full")); return false; }
  const total = qtyOf(item);
  let move = 1;
  if (acceptsStacks(el) && isStackableItem(item)) {
    if (quantity !== null) {
      move = Math.min(Math.floor(Number(quantity) || 0), from ? total : Infinity, room ?? Infinity);
    } else {
      const asked = await askQuantity({
        total: from ? total : null,
        max: from ? Math.min(total, room ?? total) : room, name: item.name
      });
      if (!asked) return false;
      move = asked;
    }
  }
  if (move <= 0) return false;

  const raw = foundry.utils.deepClone(storedOf(sheetDoc));
  addUnits(raw, sheetDoc, { host: hostRef, key, source: item, units: move });
  await sheetDoc.update({ [`flags.${SYSTEM_ID}.${CONTENTS}`]: raw });

  /* Venu d'un inventaire : l'objet est DÉPLACÉ (avec son contenu). Un
     modèle du monde n'est pas consommé. */
  if (from) {
    const rest = total - move;
    if (isStackableItem(item) && rest > 0) await item.update({ [`system.values.${QUANTITY_KEY}`]: rest });
    else await from.deleteEmbeddedDocuments("Item", bundleOf(item).map(d => d._id));
  }
  return true;
}

/** Retire un objet (et ce qu'il contient) du contenu d'un objet du monde. */
export async function removeFromWorld(sheetDoc, id) {
  const raw = storedOf(sheetDoc);
  const gone = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const d of raw) {
      if (!gone.has(d._id) && gone.has(String(d.system?.carry?.host ?? ""))) { gone.add(d._id); grew = true; }
    }
  }
  const keep = raw.filter(d => !gone.has(d._id));
  await sheetDoc.update({ [`flags.${SYSTEM_ID}.${CONTENTS}`]: keep.length ? keep : foundry.data.operators.ForcedDeletion.create() });
}

/** Un contenu en données d'objets portés : ids neufs, l'objet hôte = hostId. */
function expandContents(raw, hostId) {
  const ids = new Map(raw.map(d => [d._id, foundry.utils.randomID()]));
  return raw.map(d => {
    const c = foundry.utils.deepClone(d);
    c._id = ids.get(d._id);
    const h = String(c.system?.carry?.host ?? "");
    foundry.utils.setProperty(c, "system.carry.host", h ? (ids.get(h) ?? hostId) : hostId);
    if (c.flags?.[SYSTEM_ID]) delete c.flags[SYSTEM_ID][CONTENTS];
    return c;
  });
}

/**
 * Données d'objets à créer d'un coup (un pion posé) : chacune qui garde
 * un contenu le déballe à sa suite.
 */
export function unpackContents(datas) {
  const out = [];
  for (const d of datas ?? []) {
    const raw = d?.flags?.[SYSTEM_ID]?.[CONTENTS];
    if (!Array.isArray(raw) || !raw.length) { out.push(d); continue; }
    const top = foundry.utils.deepClone(d);
    delete top.flags[SYSTEM_ID][CONTENTS];
    top._id ??= foundry.utils.randomID();
    out.push(top, ...expandContents(raw, top._id));
  }
  return out;
}

/** L'objet arrive dans un acteur : son contenu devient de vrais objets. */
async function materialize(item) {
  const raw = storedOf(item);
  const actor = item.parent;
  if (!raw.length || actor?.documentName !== "Actor") return;
  await actor.createEmbeddedDocuments("Item", expandContents(raw, item.id), { keepId: true });
  await item.update({ [`flags.${SYSTEM_ID}.${CONTENTS}`]: foundry.data.operators.ForcedDeletion.create() });
}

/** Branche la matérialisation (une seule fois, par celui qui crée). */
export function initWorldContents() {
  Hooks.on("createItem", (item, _options, userId) => {
    if (userId !== game.user.id || item.parent?.documentName !== "Actor" || !storedOf(item).length) return;
    materialize(item).catch(e => console.error("SBE | Contenu non créé :", item.name, e));
  });
}
