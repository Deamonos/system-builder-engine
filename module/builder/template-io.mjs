/**
 * SBE — IMPORT / EXPORT de la STRUCTURE d'un modèle
 *
 * Un modèle, c'est un arbre d'éléments. Ce module le traduit en JSON
 * lisible et le relit — rien d'autre. Aucune valeur d'objet, aucun
 * contenu de partie : la STRUCTURE seule, celle qu'on met des heures
 * à saisir à la souris.
 *
 * À quoi ça sert :
 * - sauvegarder un modèle avant de le charcuter ;
 * - repartir d'un modèle existant pour en faire une variante ;
 * - transporter un modèle d'un monde à l'autre, ou le partager ;
 * - reprendre une structure venue d'ailleurs sans la retaper.
 *
 * RÈGLE D'OR : la CLÉ est l'identité d'un élément. Un fichier qui
 * parle d'une clé déjà présente dans le modèle la MET À JOUR (réglages,
 * style, contenu, place) — jamais « déjà là, on passe » : un import
 * applique TOUT ce que dit le fichier, une seule source de vérité.
 *
 * Deux modes :
 * - METTRE À JOUR (défaut) : clés connues mises à jour et déplacées là
 *   où le fichier les range, clés nouvelles ajoutées, et ce que le
 *   fichier ne mentionne pas reste où il était ;
 * - REMPLACER : la structure devient exactement celle du fichier ; ce
 *   qu'il ne mentionne pas est retiré (les valeurs des fiches, rangées
 *   par clé, ne sont jamais touchées).
 *
 * SÛRETÉ :
 * - un élément mis à jour garde son identifiant interne ; un nouveau
 *   en reçoit un neuf ;
 * - une clé mal formée, réservée ou en double DANS le fichier est
 *   refusée, l'élément écarté — jamais renommé en silence ;
 * - un type d'élément inconnu est écarté de même ;
 * - tout (ajouts, mises à jour, retraits, écarts) est listé dans le
 *   compte rendu, validé avant d'écrire.
 *
 * ZÉRO dépendance : JSON et primitives Foundry.
 */

import {
  ELEMENT_KIND_LIST, CONTAINER_KINDS, QUANTITY_KEY, KEY_RE, walkElements, PANEL_ZONE
} from "./element-renderer.mjs";
import { FORMULA_FUNCS } from "./formula-engine.mjs";
import { LOOKUP_FUNCS } from "./lookup.mjs";
import { CARRIED_FUNCS } from "./carried.mjs";

/** Version du format de fichier (incrémentée si la forme change). */
export const IO_FORMAT = 1;

/* Mots que le moteur se réserve : une clé importée qui tombe dessus
   est refusée, exactement comme à la saisie dans l'atelier. */
const RESERVED = new Set([
  "for", "in", "of", "do", "if", "else", "new", "var", "let", "const",
  "this", "true", "false", "null", "undefined", "function", "return",
  "while", "switch", "case", "break", "continue", "typeof", "delete",
  "void", "class", "extends", "super", "import", "export", "try",
  "catch", "finally", "throw", "yield", "await", "static", "with",
  "instanceof", "default", "debugger", "enum", "arguments", "eval",
  "Math", "Number", "String", "Boolean",
  ...Object.keys(FORMULA_FUNCS),
  ...LOOKUP_FUNCS,
  ...CARRIED_FUNCS,
  QUANTITY_KEY
]);

/* Propriétés d'un élément qui NE voyagent PAS telles quelles : les
   identifiants (régénérés), les enfants (relus récursivement), l'onglet
   (désigné par son rang) et le placement (consigne d'import). TOUT LE
   RESTE voyage — position en placement libre, propagation, style, CSS
   personnalisé, SVG en ligne, chemins d'images… : pas de liste à tenir
   à jour, aucune propriété oubliée en route. */
const EL_SKIP = new Set(["id", "children", "cols", "zone", "tab", "place", "_place", "_home"]);

/* Éléments NATIFS de l'en-tête (modèles de personnage) : sans clé,
   uniques, identifiant fixe. */
const NATIVE_IDS = { actorImg: "native-img", actorName: "native-name" };

/* ============================================================ */
/*  EXPORT                                                       */
/* ============================================================ */

/** Un élément, débarrassé de ses identifiants internes. */
function exportEl(el, tabRef) {
  const out = {};
  for (const [f, v] of Object.entries(el ?? {})) {
    if (EL_SKIP.has(f) || v === undefined) continue;
    out[f] = foundry.utils.deepClone(v);
  }
  /* L'onglet est désigné par son RANG, pas par son id : à l'import,
     les onglets reçoivent de nouveaux identifiants. */
  if (el.zone !== undefined) {
    /* Zone du panneau d'objet posé : désignée par son nom fixe. */
    const ref = el.zone === PANEL_ZONE ? PANEL_ZONE : tabRef.get(el.zone);
    if (ref !== undefined) out.tab = ref;
  }
  if (el.kind === "columns" && Array.isArray(el.cols)) {
    out.cols = el.cols.map(list => (list ?? []).map(c => exportEl(c, tabRef)));
  } else if (CONTAINER_KINDS.includes(el.kind) && Array.isArray(el.children)) {
    out.children = el.children.map(c => exportEl(c, tabRef));
  }
  return out;
}

/** La structure d'un modèle, en objet JSON. */
export function templateToJson(doc) {
  const sys = doc.system;
  const isItem = doc.documentName === "Item";
  const tabs = Array.isArray(sys.extraTabs) ? sys.extraTabs : [];
  const tabRef = new Map(tabs.map((t, i) => [t.id, i]));
  const out = {
    sbe: "template",
    format: IO_FORMAT,
    for: isItem ? "item" : "actor",
    name: doc.name,
    exported: new Date().toISOString().slice(0, 10),
    tabs: tabs.map(t => ({ name: t.name ?? "", playerVisible: t.playerVisible !== false,
      ...(String(t.visibleIf ?? "").trim() ? { visibleIf: String(t.visibleIf).trim() } : {}) })),
    /* Les NOMS de médias réclamés par le modèle. Les fichiers, eux,
       vivent sur chaque objet et ne voyagent jamais ici. */
    media: (Array.isArray(sys.mediaDefs) ? sys.mediaDefs : [])
      .map(d => ({ name: d?.name ?? "", hint: d?.hint ?? "" })),
    elements: (sys.elements ?? []).map(el => exportEl(el, tabRef))
  };
  /* Apparence du modèle : thème propre, nom de l'onglet Fiche. */
  if (sys.theme && Object.keys(sys.theme).length) out.theme = foundry.utils.deepClone(sys.theme);
  if (sys.sheetTabName) out.sheetTabName = sys.sheetTabName;
  if (isItem) {
    out.opts = foundry.utils.deepClone(sys.opts ?? {});
    /* Repères sur l'icône : ils pointent des CLÉS, ils voyagent avec. */
    if (sys.opts?.marks && (sys.iconMarks?.marks?.length || sys.iconMarks?.halo?.length)) out.iconMarks = foundry.utils.deepClone(sys.iconMarks);
    /* Objet de scène : ses réglages voyagent avec. */
    if (sys.opts?.prop && sys.propCfg && Object.keys(sys.propCfg).length) out.propCfg = foundry.utils.deepClone(sys.propCfg);
    /* Effets conférés : désignés par leur CLÉ d'effet (ou « @clé »). */
    const grants = (Array.isArray(sys.grants) ? sys.grants : []).filter(g => g?.effect)
      .map(g => ({ effect: g.effect, when: g.when === "equipped" ? "equipped" : "carried",
        ...(String(g.onlyIf ?? "").trim() ? { onlyIf: String(g.onlyIf).trim() } : {}) }));
    if (grants.length) out.grants = grants;
  }
  else {
    if (sys.nativeUi) out.nativeUi = foundry.utils.deepClone(sys.nativeUi);
    /* HUD du modèle : ses entrées pointent des CLÉS, il voyage avec. */
    if (sys.hud && Object.keys(sys.hud).length) out.hud = foundry.utils.deepClone(sys.hud);
    /* Barres de jetons du modèle : elles aussi pointent des CLÉS. */
    if (sys.tokenBars && Object.keys(sys.tokenBars).length) out.tokenBars = foundry.utils.deepClone(sys.tokenBars);
  }
  return out;
}

/** Nom de fichier proposé au téléchargement. */
export function exportFileName(doc) {
  const safe = String(doc.name ?? "modele")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
  return `sbe-modele-${safe || "sans-nom"}.json`;
}

/* ============================================================ */
/*  IMPORT                                                       */
/* ============================================================ */

/**
 * Relit un JSON de structure et prépare ce qu'il faut écrire.
 *
 * Rien n'est enregistré ici : la fonction RETOURNE les éléments et un
 * compte rendu, à charge de l'appelant d'écrire (et de montrer le
 * compte rendu avant). Aucune surprise, aucun effet de bord.
 *
 * @param {object}   json  contenu du fichier
 * @param {Document} doc   modèle de destination
 * @param {object}   [o]
 * @param {boolean}  [o.replace]  la structure devient celle du fichier
 * @returns {{ ok: boolean, elements: Array, tabs: Array, opts: object,
 *             report: { kept: Array, skipped: Array, notes: Array } }}
 */
export function jsonToTemplate(json, doc, { replace = false } = {}) {
  const L = (k, d) => game.i18n.format(k, d ?? {});
  const report = { kept: [], skipped: [], notes: [] };
  const fail = (msg) => ({ ok: false, elements: [], tabs: [], media: [], opts: {}, report, error: msg });

  if (!json || typeof json !== "object" || json.sbe !== "template") {
    return fail(game.i18n.localize("SBE.IO.NotATemplate"));
  }
  if (Number(json.format) > IO_FORMAT) {
    return fail(game.i18n.localize("SBE.IO.TooNew"));
  }
  const isItem = doc.documentName === "Item";
  if (json.for && ((json.for === "item") !== isItem)) {
    return fail(game.i18n.localize(isItem ? "SBE.IO.ForActor" : "SBE.IO.ForItem"));
  }

  /* --- Onglets : le fichier les désigne par leur RANG. Le même rang
     dans le modèle = le même onglet (renommé si besoin) ; au-delà, ils
     sont créés. Plus de doublons à chaque réimport. --- */
  const oldTabs = Array.isArray(doc.system.extraTabs) ? doc.system.extraTabs : [];
  const fileTabs = Array.isArray(json.tabs) ? json.tabs : [];
  const newTabs = [];
  const tabId = new Map();     /* rang dans le fichier → id réel */
  const finalTabs = replace ? [] : oldTabs.map(t => ({ ...t }));
  fileTabs.forEach((t, i) => {
    const name = String(t?.name ?? "").trim();
    const vis = t?.playerVisible !== false;
    const visibleIf = String(t?.visibleIf ?? "").trim();
    const same = oldTabs[i];
    if (same) {
      tabId.set(i, same.id);
      const row = { ...same, name, playerVisible: vis, visibleIf };
      if (replace) finalTabs.push(row);
      else finalTabs[i] = row;
      return;
    }
    const id = foundry.utils.randomID();
    const tab = { id, name, playerVisible: vis, visibleIf };
    newTabs.push(tab);
    finalTabs.push(tab);
    tabId.set(i, id);
    report.notes.push(L("SBE.IO.TabCreated", { name: name || "—" }));
  });
  if (replace && oldTabs.length > fileTabs.length) {
    report.notes.push(L("SBE.IO.TabsRemoved", { n: oldTabs.length - fileTabs.length }));
  }

  /* --- Médias déclarés : réutilisés par leur NOM, créés sinon --- */
  const oldMedia = Array.isArray(doc.system.mediaDefs) ? doc.system.mediaDefs : [];
  const existingMedia = replace ? [] : [...oldMedia];
  const newMedia = [];
  for (const m of (Array.isArray(json.media) ? json.media : [])) {
    const name = String(m?.name ?? "").trim();
    if (!name) continue;
    if (!KEY_RE.test(name)) {
      report.skipped.push({ name: `${game.i18n.localize("SBE.Media.Tab")} › ${name}`, reason: L("SBE.IO.SkipKeyBad", { key: name }) });
      continue;
    }
    const hint = String(m?.hint ?? "").trim();
    const cur = existingMedia.find(x => String(x?.name ?? "").trim() === name);
    if (cur) { cur.hint = hint || cur.hint; continue; }
    /* Remplacement : un média de même nom garde son identifiant (les
       fichiers posés sur les objets y sont rattachés). */
    const prev = oldMedia.find(x => String(x?.name ?? "").trim() === name);
    const def = { id: prev?.id ?? foundry.utils.randomID(), name, hint };
    if (!prev) { newMedia.push(def); report.notes.push(L("SBE.IO.MediaCreated", { name })); }
    existingMedia.push(def);
  }

  /* --- Effets conférés : ajoutés s'ils ne sont pas déjà là --- */
  const existingGrants = (replace || !Array.isArray(doc.system.grants)) ? [] : [...doc.system.grants];
  const newGrants = [];
  if (isItem) {
    for (const g of (Array.isArray(json.grants) ? json.grants : [])) {
      const effect = String(g?.effect ?? "").trim();
      const when = g?.when === "equipped" ? "equipped" : "carried";
      const onlyIf = String(g?.onlyIf ?? "").trim();
      if (!effect) continue;
      /* Déjà là : le « Seulement si » du fichier fait foi. */
      const at = existingGrants.findIndex(x => x?.effect === effect && x?.when === when);
      if (at >= 0) {
        if (onlyIf !== String(existingGrants[at].onlyIf ?? "").trim()) existingGrants[at] = { ...existingGrants[at], onlyIf };
        continue;
      }
      const row = { id: foundry.utils.randomID(), effect, when, onlyIf };
      newGrants.push(row);
      existingGrants.push(row);
    }
  }

  /* --- Identité : un élément du modèle est retrouvé par sa CLÉ (les
     natifs, par leur type). Retrouvé → mis à jour, il garde son id. */
  const oldEls = [...walkElements(doc.system.elements ?? [])].filter(Boolean);
  const oldByKey = new Map();
  /* Un élément SANS clé (étiquettes, onglets, bourse de boutique…) est
     retrouvé par sa sorte, son libellé et son rang parmi ses pareils. */
  const anonSig = (counts, kind, label) => {
    const base = `anon:${kind}:${label ?? ""}`;
    const n = (counts.get(base) ?? 0) + 1;
    counts.set(base, n);
    return `${base}#${n}`;
  };
  const oldAnon = new Map();
  for (const e of oldEls) {
    if (NATIVE_IDS[e.kind]) oldByKey.set(`native:${e.kind}`, e);
    else if (e.key) oldByKey.set(e.key, e);
    else oldByKey.set(anonSig(oldAnon, e.kind, e.label), e);
  }
  const fileAnon = new Map();
  /* Clés DÉJÀ VUES dans ce fichier : un doublon y est refusé. */
  const taken = new Set();
  const nativesSeen = new Set();
  let wantStackable = false;
  /* Un élément Quantité du modèle que le fichier ne reprend pas reste
     en place en mode Mise à jour : il compte. */
  const fileHasQty = JSON.stringify(json.elements ?? []).includes('"kind":"quantity"');
  let quantitySeen = !replace && !fileHasQty && oldEls.some(e => e.kind === "quantity");
  const updatedIds = new Set();
  const kindChanged = [];

  /** Un élément relu, ou null s'il est écarté. */
  const importEl = (raw, path) => {
    if (!raw || typeof raw !== "object") return null;
    const kind = String(raw.kind ?? "");
    const where = path ? `${path} › ` : "";
    const name = String(raw.label ?? raw.key ?? kind) || "?";
    /* Un élément de STRUCTURE écarté emporte son contenu : on le dit,
       plutôt que de laisser croire qu'une seule ligne a sauté. */
    const branch = (reason) => CONTAINER_KINDS.includes(kind)
      ? `${reason} — ${game.i18n.localize("SBE.IO.SkipBranch")}`
      : reason;

    if (!ELEMENT_KIND_LIST.includes(kind)) {
      report.skipped.push({ name: where + name, reason: branch(L("SBE.IO.SkipKind", { kind })) });
      return null;
    }
    /* L'élément natif Quantité : réservé aux modèles d'objets, et
       unique. Il impose l'option « empilable », qu'on activera. */
    if (kind === "quantity") {
      if (!isItem) {
        report.skipped.push({ name: where + name, reason: game.i18n.localize("SBE.IO.SkipQtyActor") });
        return null;
      }
      if (quantitySeen) {
        report.skipped.push({ name: where + name, reason: game.i18n.localize("SBE.IO.SkipQtyDouble") });
        return null;
      }
      quantitySeen = true;
      wantStackable = true;
    }

    /* Natifs de l'en-tête : modèles de personnage seulement, une fois. */
    const native = NATIVE_IDS[kind];
    if (native) {
      if (isItem || nativesSeen.has(kind)) {
        report.skipped.push({ name: where + name, reason: L("SBE.IO.SkipNative") });
        return null;
      }
      nativesSeen.add(kind);
    }

    /* La clé : facultative, comme dans l'atelier (un export doit se
       réimporter tel quel) ; donnée, elle doit être valide et unique. */
    const key = native ? "" : String(raw.key ?? "").trim();
    if (key) {
      const reservedOk = (kind === "quantity" && key === QUANTITY_KEY);
      /* Même règle que la saisie dans l'atelier : ce que l'atelier
         accepte, l'import l'accepte (un export doit se réimporter). */
      if (!KEY_RE.test(key)) {
        report.skipped.push({ name: where + name, reason: branch(L("SBE.IO.SkipKeyBad", { key })) });
        return null;
      }
      if (!reservedOk && RESERVED.has(key)) {
        report.skipped.push({ name: where + name, reason: branch(L("SBE.IO.SkipKeyReserved", { key })) });
        return null;
      }
      if (taken.has(key)) {
        report.skipped.push({ name: where + name, reason: branch(L("SBE.IO.SkipKeyDouble", { key })) });
        return null;
      }
      taken.add(key);
    }

    const prev = oldByKey.get(native ? `native:${kind}` : key || anonSig(fileAnon, kind, String(raw.label ?? "")));
    if (prev) {
      updatedIds.add(prev.id);
      if (prev.kind !== kind) kindChanged.push(`${key} (${prev.kind} → ${kind})`);
    }
    const el = { id: native ?? prev?.id ?? foundry.utils.randomID(), kind, key, label: String(raw.label ?? "") };
    for (const [f, v] of Object.entries(raw)) {
      if (EL_SKIP.has(f) || ["kind", "key", "label"].includes(f) || v === undefined) continue;
      el[f] = foundry.utils.deepClone(v);
    }
    el.config ??= {};
    el.style ??= {};
    if (raw.tab === PANEL_ZONE) el.zone = PANEL_ZONE;
    else if (raw.tab !== undefined && tabId.has(Number(raw.tab))) el.zone = tabId.get(Number(raw.tab));
    /* Consigne de PLACEMENT (éléments de premier niveau du fichier) :
       « dans » tel conteneur, « après » / « avant » tel élément — par
       CLÉ, appliquée au moment d'écrire (mergeImported). */
    if (!path && raw.place && typeof raw.place === "object") el._place = foundry.utils.deepClone(raw.place);

    /* Enfants : même traitement, en profondeur. */
    const childPath = (raw.label || raw.key) ? `${where}${name}` : where.replace(/ › $/, "");
    if (kind === "columns") {
      const cols = Array.isArray(raw.cols) ? raw.cols : [];
      el.cols = cols.map(list => (Array.isArray(list) ? list : [])
        .map(c => importEl(c, childPath)).filter(Boolean));
      if (!el.cols.length) el.cols = [[], []];
    } else if (CONTAINER_KINDS.includes(kind)) {
      el.children = (Array.isArray(raw.children) ? raw.children : [])
        .map(c => importEl(c, childPath)).filter(Boolean);
    }
    report.kept.push(el.key || name);
    return el;
  };

  const elements = (Array.isArray(json.elements) ? json.elements : [])
    .map(raw => importEl(raw, "")).filter(Boolean);

  if (!elements.length && !newTabs.length && !newMedia.length && !newGrants.length
      && !json.theme && !json.nativeUi && !json.hud && !json.tokenBars && !json.iconMarks) {
    return fail(game.i18n.localize("SBE.IO.Empty"));
  }

  /* Options du modèle : jamais imposées, SAUF « empilable » si un
     élément Quantité est arrivé (sans quoi il ne s'afficherait pas). */
  const opts = {};
  if (wantStackable && !doc.system.opts?.stackable) {
    opts.stackable = true;
    report.notes.push(game.i18n.localize("SBE.IO.StackableOn"));
  }

  /* Apparence du modèle : appliquée APRÈS confirmation, annoncée dans
     le compte rendu (jamais en silence). */
  const model = {};
  if (json.theme && typeof json.theme === "object") {
    model.theme = foundry.utils.deepClone(json.theme);
    report.notes.push(game.i18n.localize("SBE.IO.ThemeApplied"));
  }
  if (!isItem && json.nativeUi && typeof json.nativeUi === "object") {
    model.nativeUi = foundry.utils.deepClone(json.nativeUi);
    report.notes.push(game.i18n.localize("SBE.IO.NativeUiApplied"));
  }
  if (!isItem && json.hud && typeof json.hud === "object") {
    model.hud = foundry.utils.deepClone(json.hud);
    report.notes.push(game.i18n.localize("SBE.IO.HudApplied"));
  }
  if (!isItem && json.tokenBars && typeof json.tokenBars === "object") {
    model.tokenBars = foundry.utils.deepClone(json.tokenBars);
    report.notes.push(game.i18n.localize("SBE.IO.BarsApplied"));
  }
  if (isItem && json.iconMarks && typeof json.iconMarks === "object") {
    model.iconMarks = { marks: Array.isArray(json.iconMarks.marks) ? json.iconMarks.marks : [], halo: Array.isArray(json.iconMarks.halo) ? json.iconMarks.halo : [] };
    opts.marks = true;
    report.notes.push(game.i18n.localize("SBE.Marks.ImportApplied"));
  }
  if (isItem && json.propCfg && typeof json.propCfg === "object") {
    model.propCfg = foundry.utils.deepClone(json.propCfg);
    opts.prop = true;
  }
  if (isItem && json.opts?.prop && !doc.system.opts?.prop) opts.prop = true;
  /* « Inactif si » : apporté par le modèle importé quand celui du monde n'en a pas. */
  if (isItem && json.opts?.inactive && String(json.opts.inactiveIf ?? "").trim() && !String(doc.system.opts?.inactiveIf ?? "").trim()) {
    opts.inactive = true;
    opts.inactiveIf = String(json.opts.inactiveIf).trim();
    report.notes.push(game.i18n.localize("SBE.Inactive.ImportApplied"));
  }
  if (json.sheetTabName && !doc.system.sheetTabName) model.sheetTabName = String(json.sheetTabName);
  if (kindChanged.length) report.notes.push(L("SBE.IO.KindChanged", { list: kindChanged.join(", ") }));
  /* L'arbre COMPLET à écrire, calculé ici pour que tout soit dans le
     compte rendu validé avant l'écriture. */
  const tree = mergeImported(doc.system.elements ?? [], elements, { replace, report });
  report.updated = updatedIds.size;
  report.added = report.kept.length - updatedIds.size;
  return {
    ok: true, elements, tree, tabs: newTabs, allTabs: finalTabs,
    media: newMedia, allMedia: existingMedia,
    grants: newGrants, allGrants: existingGrants, opts, model, report
  };
}

/**
 * Écrit sur le modèle le résultat validé de jsonToTemplate (même chemin
 * pour l'import dans un modèle ouvert et pour l'import depuis la barre
 * latérale, qui crée le modèle d'abord).
 */
export async function applyImported(doc, res) {
  const sys = doc.system;
  const update = {
    "system.structVersion": (sys.structVersion ?? 0) + 1,
    "system.elements": res.tree,
    "system.extraTabs": res.allTabs,
    "system.mediaDefs": res.allMedia
  };
  if (doc.documentName === "Item") update["system.grants"] = res.allGrants;
  /* Apparence du modèle (thème, en-tête natif, nom d'onglet) :
     annoncée dans le compte rendu que le MJ vient de valider. */
  if (res.model?.theme) update["system.theme"] = res.model.theme;
  if (res.model?.nativeUi) update["system.nativeUi"] = res.model.nativeUi;
  if (res.model?.hud) update["system.hud"] = foundry.data.operators.ForcedReplacement.create(res.model.hud);
  if (res.model?.tokenBars) update["system.tokenBars"] = foundry.data.operators.ForcedReplacement.create(res.model.tokenBars);
  if (res.model?.sheetTabName) update["system.sheetTabName"] = res.model.sheetTabName;
  if (res.model?.iconMarks) update["system.iconMarks"] = res.model.iconMarks;
  if (res.model?.propCfg) update["system.propCfg"] = res.model.propCfg;
  for (const [k, v] of Object.entries(res.opts)) update[`system.opts.${k}`] = v;
  return doc.update(update);
}

/** Compte rendu en HTML, pour la fenêtre de confirmation. */
export function reportHTML(report, { name = "" } = {}) {
  const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
  const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
  let html = `<p>${L("SBE.IO.ReportIntro", { name: esc(name), added: report.added ?? report.kept.length, updated: report.updated ?? 0 })}</p>`;
  if (report.notes.length) {
    html += `<ul class="sbe-io-notes">${report.notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul>`;
  }
  if (report.skipped.length) {
    html += `<p class="sbe-io-warn"><b>${L("SBE.IO.ReportSkipped", { n: report.skipped.length })}</b></p>
      <ul class="sbe-io-skipped">${report.skipped
        .map(s => `<li><b>${esc(s.name)}</b> — ${esc(s.reason)}</li>`).join("")}</ul>`;
  }
  return html;
}

/* ============================================================ */
/*  PLACEMENT des éléments importés                              */
/* ============================================================ */

/** La liste qui contient la clé, où qu'elle soit dans l'arbre. */
function listOfKey(list, key) {
  for (let i = 0; i < (list ?? []).length; i++) {
    const el = list[i];
    if (!el) continue;
    if (key && el.key === key) return { list, index: i };
    if (el.kind === "columns") {
      for (const col of el.cols ?? []) { const r = listOfKey(col, key); if (r) return r; }
    } else if (Array.isArray(el.children)) {
      const r = listOfKey(el.children, key);
      if (r) return r;
    }
  }
  return null;
}

/** L'élément portant cette clé (ou cet identifiant natif). */
function elByKey(list, key) {
  for (const el of walkElements(list ?? [])) if (el?.key === key || (!el?.key && el?.id === key)) return el;
  return null;
}

/** Les listes d'enfants d'un élément (colonnes : une par colonne). */
function kidLists(el) {
  if (!el) return [];
  if (el.kind === "columns") return Array.isArray(el.cols) ? el.cols : [];
  return Array.isArray(el.children) ? [el.children] : [];
}

/** Retire de l'arbre l'élément d'identifiant id ; rend sa place. */
function extractId(list, id) {
  for (let i = 0; i < (list ?? []).length; i++) {
    const el = list[i];
    if (el?.id === id) { list.splice(i, 1); return { el, list, index: i }; }
    for (const kids of kidLists(el)) {
      const r = extractId(kids, id);
      if (r) return r;
    }
  }
  return null;
}

/** La liste d'enfants n° col d'un élément (null si elle n'existe pas). */
function kidList(el, col) {
  if (!el) return null;
  if (el.kind === "columns") {
    const i = Math.max(0, Math.floor(Number(col) || 0));
    return Array.isArray(el.cols) && el.cols[i] ? el.cols[i] : null;
  }
  return Array.isArray(el.children) ? el.children : null;
}

/**
 * Pose les éléments importés dans l'arbre du modèle — LA règle d'import.
 *
 * - Un élément du fichier déjà présent (même clé → même id) est RETIRÉ
 *   de son ancienne place et posé là où le fichier le range : à la
 *   place de son ancienne version (élément de premier niveau sans
 *   consigne), à la place demandée (consigne « place »), ou dans le
 *   conteneur où le fichier le met. Ses réglages sont ceux du fichier.
 * - Un élément nouveau est posé de même (en bas s'il n'a ni consigne
 *   ni ancienne place).
 * - Ce que le fichier ne mentionne PAS :
 *     · Mise à jour → si son conteneur est DÉCRIT par le fichier, il
 *       est retiré (le fichier dit ce que ce conteneur contient) ;
 *       sinon il reste à sa place, après son ancien voisin. Un
 *       conteneur dont le fichier a sorti tout le contenu disparaît.
 *     · Remplacement → retiré.
 *
 * Consigne de placement (premier niveau du fichier) :
 *   place: { into: "cle_conteneur", col: 0, after: "cle", before: "cle", at: "start" }
 *
 * @returns {Array} le nouvel arbre complet
 */
export function mergeImported(existing, imported, { replace = false, report = null } = {}) {
  const old = existing ?? [];
  /* Où vivait chaque élément du modèle : parent, colonne, voisin. */
  const where = new Map();
  const scan = (list, parentId, col) => list.forEach((el, i) => {
    if (!el?.id) return;
    where.set(el.id, { parentId, col, prevId: list[i - 1]?.id ?? null, index: i, el });
    kidLists(el).forEach((kids, c) => scan(kids, el.id, el.kind === "columns" ? c : null));
  });
  scan(old, "", null);

  const tree = replace ? [] : foundry.utils.deepClone(old);
  const fileIds = new Set();
  for (const r of imported) for (const e of walkElements([r])) if (e?.id) fileIds.add(e.id);

  let placed = 0;
  for (const el of imported) {
    const place = el._place;
    delete el._place;
    /* L'ancienne version et tout ce que le fichier range ailleurs sortent
       de l'arbre AVANT la pose : aucun doublon possible. */
    const prev = replace ? null : extractId(tree, el.id);
    if (!replace) for (const d of walkElements(kidLists(el).flat())) if (d?.id) extractId(tree, d.id);

    if (place) {
      let target = null;
      if (place.into) {
        const box = elByKey(tree, String(place.into));
        target = kidList(box, place.col);
      }
      const ref = place.after ?? place.before;
      let index = null;
      if (ref) {
        const hit = listOfKey(target ?? tree, String(ref));
        if (hit) { target = hit.list; index = hit.index + (place.after ? 1 : 0); }
      }
      if (target) {
        if (target !== tree) delete el.zone;
        if (index === null) index = place.at === "start" ? 0 : target.length;
        target.splice(index, 0, el);
        placed++;
        continue;
      }
      report?.notes.push(game.i18n.format("SBE.IO.PlaceMissing", { name: el.label || el.key || el.kind }));
    }
    /* Sans consigne : à la place de l'ancienne version, sinon en bas. */
    if (prev && !place && (prev.list === tree || [...walkElements(tree)].some(e => kidLists(e).includes(prev.list)))) {
      if (prev.list !== tree) delete el.zone;
      prev.list.splice(Math.min(prev.index, prev.list.length), 0, el);
    } else tree.push(el);
  }
  if (placed) report?.notes.unshift(game.i18n.format("SBE.IO.Placed", { n: placed }));

  /* Ce que le fichier ne mentionne pas. */
  const inTree = new Set([...walkElements(tree)].map(e => e?.id).filter(Boolean));
  const missing = [...where.keys()].filter(id => !inTree.has(id));
  if (replace) {
    const roots = missing.filter(id => !missing.includes(where.get(id).parentId));
    if (roots.length) report?.notes.push(game.i18n.format("SBE.IO.Removed", { n: missing.length }));
    return tree;
  }
  let kept = 0, dismantled = 0, dropped = 0;
  for (const id of missing) {
    const w = where.get(id);
    /* Seuls les « sommets » : un enfant manquant voyage avec son parent. */
    if (w.parentId && !inTree.has(w.parentId)) continue;
    /* Son conteneur est DÉCRIT par le fichier : le fichier dit ce qu'il
       contient, une seule source de vérité — l'absent est retiré. */
    if (w.parentId && fileIds.has(w.parentId)) {
      dropped += [...walkElements([w.el])].filter(e => !inTree.has(e?.id)).length;
      continue;
    }
    const el = foundry.utils.deepClone(w.el);
    /* Ce que le fichier a rangé ailleurs n'y est plus. */
    const prune = (node) => {
      for (const kids of kidLists(node)) {
        for (let i = kids.length - 1; i >= 0; i--) {
          if (inTree.has(kids[i]?.id)) kids.splice(i, 1);
          else prune(kids[i]);
        }
      }
    };
    prune(el);
    const hadKids = kidLists(w.el).some(k => k.length);
    if (CONTAINER_KINDS.includes(el.kind) && hadKids && !kidLists(el).some(k => k.length)) {
      dismantled++;
      continue;
    }
    const parent = w.parentId ? [...walkElements(tree)].find(e => e?.id === w.parentId) : null;
    const list = w.parentId ? kidList(parent, w.col) : tree;
    if (!list) { tree.push(el); kept++; inTree.add(el.id); continue; }
    const at = w.prevId ? list.findIndex(e => e?.id === w.prevId) : -1;
    list.splice(at >= 0 ? at + 1 : Math.min(w.index, list.length), 0, el);
    for (const e of walkElements([el])) if (e?.id) inTree.add(e.id);
    kept++;
  }
  if (dropped) report?.notes.push(game.i18n.format("SBE.IO.Removed", { n: dropped }));
  if (kept) report?.notes.push(game.i18n.format("SBE.IO.KeptOutside", { n: kept }));
  if (dismantled) report?.notes.push(game.i18n.format("SBE.IO.Dismantled", { n: dismantled }));
  return tree;
}

/** Compatibilité : pose d'éléments NEUFS (ancienne API). */
export function placeImported(existing, imported, report) {
  return mergeImported(existing, imported, { report });
}
