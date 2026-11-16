/**
 * SBE — Démo « Brumeval » : CONSTRUCTEUR
 *
 * Outil de développement (MJ) : construit la démo dans le monde ouvert,
 * à partir des définitions de ce dossier, puis la range dans le paquet du
 * système (aventure). Rien ici n'est chargé par le système en jeu.
 *
 *   const B = await import("/systems/system-builder-engine/tools/demo/demo-build.mjs");
 *   await B.buildTemplates("fr");
 */

/* Chargé à chaque appel (mise au point : jamais l'ancienne version en cache). */
let D = null;
const load = async () => { D = await import(`./demo-templates.mjs?v=${Date.now()}`); return D; };

const SYS = "system-builder-engine";
export const DEMO_FLAG = "demo";

/** Un dossier de la démo (créé au besoin). */
async function folderOf(type, name) {
  const f = game.folders.find(x => x.type === type && x.getFlag(SYS, DEMO_FLAG) && x.name === name);
  return f ?? Folder.create({ type, name, color: "#6b4a2c", flags: { [SYS]: { [DEMO_FLAG]: true } } });
}

/** Crée un modèle d'atelier depuis sa définition (passe par l'import du système). */
async function makeTemplate(json, folder, img = "") {
  const { jsonToTemplate, applyImported } = await import(`/systems/${SYS}/module/builder/template-io.mjs`);
  const cls = json.for === "item" ? Item : Actor;
  const doc = await cls.create({ name: json.name, type: "template", folder: folder.id, ...(img ? { img } : {}),
    flags: { [SYS]: { [DEMO_FLAG]: true } } });
  const res = jsonToTemplate(json, doc, { replace: true });
  if (!res.ok) { await doc.delete(); throw new Error(`${json.name} : ${res.error}`); }
  await applyImported(doc, res);
  return { doc, report: res.report };
}

/** Les définitions des modèles : [id, json, dossier, image]. */
function templateDefs(L, fA, fI) {
  return rawDefs(L, fA, fI).map(([id, json, folder, img]) => [id, D.localizeKeys(json, L), folder, img]);
}

function rawDefs(L, fA, fI) {
  return [
    ["adventurer", D.adventurerTemplate(L), fA, "icons/svg/mystery-man.svg"],
    ["creature", D.creatureTemplate(L), fA, "icons/svg/skull.svg"],
    ["beast", D.creatureTemplate(L, { beast: true }), fA, "icons/svg/pawprint.svg"],
    ["weapon", D.weaponTemplate(L), fI, "icons/svg/sword.svg"],
    ["armor", D.armorTemplate(L), fI, "icons/svg/statue.svg"],
    ["shield", D.armorTemplate(L, { shield: true }), fI, "icons/svg/shield.svg"],
    ["consumable", D.consumableTemplate(L), fI, "icons/svg/tankard.svg"],
    ["spell", D.spellTemplate(L), fI, "icons/svg/fire.svg"],
    ["ammo", D.ammoTemplate(L), fI, "icons/svg/target.svg"],
    ["class", D.classTemplate(L), fI, "icons/svg/book.svg"],
    ["tool", D.toolTemplate(L), fI, "icons/svg/hanging-sign.svg"],
    ["misc", D.miscTemplate(L), fI, "icons/svg/item-bag.svg"],
    ["mechanism", D.mechanismTemplate(L), fI, "icons/svg/lever.svg"],
    ["trap", D.trapTemplate(L), fI, "icons/svg/trap.svg"]
  ];
}

/** Tous les modèles d'atelier. */
export async function buildTemplates(lang = game.i18n.lang) {
  await load();
  const L = D.demoLang(lang);
  const { T } = L;
  const fA = await folderOf("Actor", T("Démo — Modèles", "Demo — Templates"));
  const fI = await folderOf("Item", T("Démo — Modèles", "Demo — Templates"));
  const out = {};
  for (const [id, json, folder, img] of templateDefs(L, fA, fI)) out[id] = await makeTemplate(json, folder, img);
  return out;
}

/** Réapplique les définitions aux modèles déjà créés (mise au point de l'apparence). */
export async function refreshTemplates(lang = game.i18n.lang) {
  await load();
  const { jsonToTemplate, applyImported } = await import(`/systems/${SYS}/module/builder/template-io.mjs`);
  const L = D.demoLang(lang);
  const done = [];
  for (const [, json] of templateDefs(L, null, null)) {
    const coll = json.for === "item" ? game.items : game.actors;
    const doc = coll.find(d => d.type === "template" && d.name === json.name && d.getFlag(SYS, DEMO_FLAG));
    if (!doc) continue;
    const res = jsonToTemplate(json, doc, { replace: true });
    if (!res.ok) throw new Error(`${json.name} : ${res.error}`);
    await applyImported(doc, res);
    done.push(json.name);
  }
  return done;
}

/** Retire les objets et les fiches de la démo (garde les modèles d'atelier). */
export async function wipeContent() {
  const ids = (c) => c.filter(d => d.getFlag?.(SYS, DEMO_FLAG) && d.type !== "template").map(d => d.id);
  const a = ids(game.actors); if (a.length) await Actor.deleteDocuments(a);
  const i = ids(game.items); if (i.length) await Item.deleteDocuments(i);
  return { actors: a.length, items: i.length };
}

/** Retire TOUT ce que la démo a créé dans le monde (documents marqués). */
export async function wipe() {
  const marked = (c) => c.filter(d => d.getFlag?.(SYS, DEMO_FLAG));
  /* La scène d'abord (ses objets posés sont des copies d'objets du monde),
     puis les fiches et objets, puis leurs modèles : un modèle ou un objet
     encore utilisé demande confirmation de sa suppression en cascade. */
  const scenes = marked(game.scenes).map(d => d.id);
  if (scenes.length) await Scene.deleteDocuments(scenes);
  await wipeContent();
  for (const c of [game.scenes, game.actors, game.items, game.journal, game.tables, game.macros]) {
    const ids = marked(c).map(d => d.id);
    if (ids.length) await c.documentClass.deleteDocuments(ids);
  }
  const folders = marked(game.folders).map(f => f.id);
  if (folders.length) await Folder.deleteDocuments(folders);
}

/* ------------------------------------------------------------ */
/*  Objets et personnages                                         */
/* ------------------------------------------------------------ */

let C = null;
const loadContent = async () => { C = await import(`./demo-content.mjs?v=${Date.now()}`); return C; };

/** Les modèles d'atelier de la démo, par id interne (adventurer, weapon…). */
function templatesById(L) {
  const out = {};
  for (const [id, json] of templateDefs(L, null, null)) {
    const coll = json.for === "item" ? game.items : game.actors;
    out[id] = coll.find(d => d.type === "template" && d.name === json.name && d.getFlag(SYS, DEMO_FLAG)) ?? null;
  }
  return out;
}

/** Valeurs par défaut d'un modèle (tout l'arbre). */
async function defaultsOf(tpl) {
  const { walkElements } = await import(`/systems/${SYS}/module/builder/element-renderer.mjs`);
  const values = {};
  for (const el of walkElements(tpl.system.elements ?? [])) {
    if (el?.key && el.config?.default !== undefined) values[el.key] = el.config.default;
  }
  return values;
}

/** Les objets du monde. Rend { idDémo: Item }. */
export async function buildItems(lang = game.i18n.lang) {
  await load(); await loadContent();
  const L = D.demoLang(lang);
  const tpls = templatesById(L);
  const folder = await folderOf("Item", L.T("Démo — Objets", "Demo — Items"));
  const out = {};
  for (const def of C.demoItems(L)) {
    const tpl = tpls[def.tpl];
    if (!tpl) throw new Error(`Modèle absent : ${def.tpl}`);
    const values = { ...(await defaultsOf(tpl)), ...def.values };
    out[def.id] = await Item.create({
      name: def.name, type: "objet", img: def.img, folder: folder.id,
      flags: { [SYS]: { [DEMO_FLAG]: true, demoId: def.id, ...(def.spatial ? { spatial: def.spatial } : {}) } },
      system: { templateId: tpl.id, templateVersion: tpl.system.structVersion ?? 0, values, description: def.description ?? "" }
    });
  }
  return out;
}

/** Jauges pleines à la création (PV, mana…) : leur maximum suit la fiche
 *  (attributs, niveau, objets portés), on le lit une fois tout rangé. */
async function fillGauges(actor) {
  const { walkElements, valueBounds } = await import(`/systems/${SYS}/module/builder/element-renderer.mjs`);
  const { docScope } = await import(`/systems/${SYS}/module/builder/doc-context.mjs`);
  const tpl = game.actors.get(actor.system.templateId);
  const scope = docScope(actor);
  const up = {};
  for (const el of walkElements(tpl?.system?.elements ?? [])) {
    if (el?.kind !== "gauge" || el.config?.computed || !el.config?.maxFormula) continue;
    const { max } = valueBounds(el, scope);
    if (Number.isFinite(max)) up[`system.values.${el.key}`] = max;
  }
  if (Object.keys(up).length) await actor.update(up);
}

/** Les fiches, avec leurs objets rangés. Rend { idDémo: Actor }. */
export async function buildActors(lang = game.i18n.lang) {
  await load(); await loadContent();
  const L = D.demoLang(lang);
  const tpls = templatesById(L);
  const { dropIntoContainer, elementOn } = await import(`/systems/${SYS}/module/builder/inventory.mjs`);
  const fPC = await folderOf("Actor", L.T("Démo — Héros", "Demo — Heroes"));
  const fNPC = await folderOf("Actor", L.T("Démo — Habitants et créatures", "Demo — Locals and creatures"));
  const items = Object.fromEntries(game.items.filter(i => i.getFlag(SYS, "demoId")).map(i => [i.getFlag(SYS, "demoId"), i]));
  const out = {};
  const report = [];
  for (const def of C.demoActors(L)) {
    const tpl = tpls[def.tpl];
    const values = { ...(await defaultsOf(tpl)), ...def.values };
    const actor = await Actor.create({
      name: def.name, type: "personnage", img: def.img, folder: (def.pc ? fPC : fNPC).id,
      prototypeToken: { name: def.name, texture: { src: def.img }, actorLink: !!def.pc,
        disposition: def.pc ? CONST.TOKEN_DISPOSITIONS.FRIENDLY : (def.tpl === "adventurer" ? CONST.TOKEN_DISPOSITIONS.NEUTRAL : CONST.TOKEN_DISPOSITIONS.HOSTILE),
        sight: { enabled: true } },
      flags: { [SYS]: { [DEMO_FLAG]: true, demoId: def.id } },
      system: { templateId: tpl.id, templateVersion: tpl.system.structVersion ?? 0, values }
    });
    for (const [itemId, where, qty] of def.items ?? []) {
      const item = items[itemId];
      const el = elementOn(actor, where);
      if (!item || !el) { report.push(`${def.name} : ${itemId} → ${where} introuvable`); continue; }
      try {
        await dropIntoContainer({ sheetDoc: actor, el, item, quantity: qty ?? 1, quiet: true });
      } catch (err) { report.push(`${def.name} : ${itemId} → ${err.message}`); }
    }
    await fillGauges(actor);
    out[def.id] = actor;
  }
  return { actors: out, report };
}

/* ------------------------------------------------------------ */
/*  Réglages du monde                                             */
/* ------------------------------------------------------------ */

/** Les réglages de la démo, calculés pour le monde ouvert (ids réels des modèles). */
/** Remplit les jauges des fiches déjà construites (mise au point). */
export async function refillGauges() {
  for (const a of game.actors.filter(d => d.getFlag(SYS, DEMO_FLAG) && d.type !== "template")) await fillGauges(a);
}

export async function computeSettings(lang = game.i18n.lang) {
  await load();
  const L = D.demoLang(lang);
  const S = await import(`./demo-settings.mjs?v=${Date.now()}`);
  const tpl = Object.fromEntries(Object.entries(templatesById(L)).map(([k, d]) => [k, d?.id ?? ""]));
  return S.demoSettings(L, { tpl });
}

/** Pose les réglages ; rend les anciennes valeurs (à remettre après la mise au point). */
export async function applySettings(settings) {
  const before = {};
  for (const [k, v] of Object.entries(settings)) {
    before[k] = foundry.utils.deepClone(game.settings.get(SYS, k));
    await game.settings.set(SYS, k, v);
  }
  return before;
}

/* ------------------------------------------------------------ */
/*  Empaquetage : l'aventure de la démo dans le paquet du système */
/* ------------------------------------------------------------ */

/**
 * Range tout ce que la démo a construit dans le monde (documents marqués)
 * dans l'aventure du paquet `demo-<lang>`, avec ses réglages. L'acteur
 * support des objets posés n'est pas fourni : l'installation relie les
 * jetons à celui du monde qui installe.
 */
export async function packAdventure(lang = game.i18n.lang) {
  await load();
  const L = D.demoLang(lang);
  const pack = game.packs.get(`${SYS}.demo-${lang}`);
  if (!pack) throw new Error(`Paquet absent : demo-${lang}`);
  const marked = (c) => c.filter(d => d.getFlag?.(SYS, DEMO_FLAG));
  const data = (c) => marked(c).map(d => d.toObject());
  const settings = await computeSettings(lang);
  /* Une clé d'effet égale à un statut de Foundry serait écartée en jeu. */
  const { EffectManager } = await import(`/systems/${SYS}/module/managers/effects/effect-manager.mjs`);
  const clash = (settings.effects ?? []).map(d => d.key).filter(k => EffectManager.nativeIds().has(k));
  if (clash.length) throw new Error(`Clés d'effet déjà prises par Foundry : ${clash.join(", ")}`);
  const scenes = data(game.scenes);
  for (const s of scenes) for (const t of s.tokens ?? []) if (t.flags?.[SYS]?.prop) t.actorId = null;
  const adv = {
    name: L.T("Brumeval — démo du système", "Brumeval — system demo"),
    img: `systems/${SYS}/assets/demo/brumeval.webp`,
    caption: L.T("Un village qui montre tout ce que fait le système.", "A village that shows everything the system does."),
    description: L.T("<p>Installez-la depuis Paramètres du système → Démo Brumeval : vous choisissez les réglages qu'elle remplace, et la retirer remet tout comme avant.</p>",
      "<p>Install it from System settings → Brumeval demo: you choose which settings it replaces, and removing it puts everything back.</p>"),
    scenes, actors: data(game.actors), items: data(game.items), journal: data(game.journal),
    tables: data(game.tables), folders: data(game.folders),
    flags: { [SYS]: { [DEMO_FLAG]: { lang, settings, version: game.system.version } } }
  };
  const wasLocked = pack.locked;
  if (wasLocked) await pack.configure({ locked: false });
  try {
    const old = await pack.getDocuments();
    if (old.length) await Adventure.deleteDocuments(old.map(d => d.id), { pack: pack.collection });
    const [doc] = await Adventure.createDocuments([adv], { pack: pack.collection });
    return { id: doc.id, scenes: adv.scenes.length, actors: adv.actors.length, items: adv.items.length,
      journal: adv.journal.length, tables: adv.tables.length, folders: adv.folders.length, settings: Object.keys(settings) };
  } finally {
    if (wasLocked) await pack.configure({ locked: true });
  }
}
