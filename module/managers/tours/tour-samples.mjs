/**
 * SBE — Visites guidées : MODÈLES D'EXEMPLE
 *
 * La visite « Construire » montre le VRAI atelier sur des modèles tenus en
 * mémoire : jamais enregistrés, ils disparaissent à la fermeture de leur
 * fenêtre. Libellés et clés viennent des traductions (une clé suit la
 * langue de celui qui regarde).
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { ZoneShapes } from "../zones/zone-shapes.mjs";
import { circleShape, coneShape, lineShape } from "../zones/zone-geom.mjs";
import { HitLocations } from "../combat/hit-locations.mjs";

const L = (k) => game.i18n.localize(`SBE.Tour.Sample.${k}`);
const id = () => foundry.utils.randomID();

/** Un modèle de personnage d'exemple : une valeur à jet, une jauge, une valeur calculée. */
function sampleActorElements() {
  const stat = L("KeyStat");
  return [
    { id: id(), kind: "number", key: stat, label: L("Stat"), playerVisible: true, playerEditable: true,
      config: { default: 12, integer: true, roll: { on: true, formula: `1d20 + ${stat}`, label: L("Stat") } }, style: {} },
    { id: id(), kind: "gauge", key: L("KeyGauge"), label: L("Gauge"), playerVisible: true, playerEditable: true,
      config: { min: 0, max: 24, default: 18 }, style: {} },
    { id: id(), kind: "number", key: L("KeyComputed"), label: L("Computed"), playerVisible: true,
      config: { computed: true, formula: `10 + floor(${stat} / 2)` }, style: {} }
  ];
}

/** Un modèle d'objet d'exemple : un poids et un bouton à étapes. */
function sampleItemElements() {
  return [
    { id: id(), kind: "number", key: L("KeyWeight"), label: L("Weight"), playerVisible: true, playerEditable: true,
      config: { default: 1 }, style: {} },
    { id: id(), kind: "button", key: L("KeyUse"), label: L("Use"), playerVisible: true,
      config: { action: "steps", steps: [
        { type: "set", key: L("KeyGauge"), mode: "add", formula: "2d4 + 2", target: "carrier" },
        { type: "consume", from: "self", amount: "1" }
      ] }, style: {} }
  ];
}

/** Un modèle de personnage d'exemple, en mémoire (jamais enregistré). */
export function sampleActorModel() {
  return new Actor.implementation({ name: L("ActorModel"), type: "template", system: { elements: sampleActorElements() } });
}

/** Ouvre l'atelier d'un modèle de personnage d'exemple (non enregistré). */
export async function openSampleActorModel() {
  const doc = sampleActorModel();
  await doc.sheet.render({ force: true });
  return doc.sheet;
}

/** Ouvre l'atelier d'un modèle d'objet d'exemple (non enregistré). */
export async function openSampleItemModel() {
  const doc = new Item.implementation({ name: L("ItemModel"), type: "template", system: { elements: sampleItemElements() } });
  await doc.sheet.render({ force: true });
  return doc.sheet;
}

/**
 * Ouvre les réglages d'un composant de l'atelier (comme le crayon), et rend
 * la fenêtre ouverte.
 * @param {foundry.applications.api.ApplicationV2} sheet  l'atelier
 * @param {string} kind  sorte du composant visé (le premier trouvé)
 */
export async function openComponentWindow(sheet, kind) {
  const el = sheet?.document?.system?.elements?.find(e => e.kind === kind);
  const pen = el && sheet.element?.querySelector(`[data-el-id="${el.id}"] [data-action="editElement"]`);
  if (!pen) return null;
  const before = new Set(foundry.applications.instances.keys());
  pen.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  for (let i = 0; i < 20; i++) {
    await new Promise(r => { setTimeout(r, 100); });
    const app = [...foundry.applications.instances.values()].find(a => !before.has(a.id) && a.rendered);
    if (app) return app;
  }
  return null;
}

/* ------------------------------------------------------------ */
/*  HUD : un panneau de jeu d'exemple (jets, objets, action)      */
/* ------------------------------------------------------------ */

/**
 * Un modèle de personnage d'exemple portant un HUD de jeu : « Attaquer »
 * (les armes portées), « Statistiques » (les jets de la fiche) et « Sorts ».
 * En mémoire, jamais enregistré : les armes et les sorts sont montrés
 * comme des objets attendus (aucun personnage derrière).
 */
export function sampleHudModel() {
  const roll = (key, label) => ({ id: id(), kind: "number", key, label, playerVisible: true, playerEditable: true,
    config: { default: 10, integer: true, roll: { on: true, formula: `1d20 + ${key}`, label } }, style: {} });
  const els = [roll(L("KeyStat"), L("Stat")), roll(L("KeyAgility"), L("Agility")), roll(L("KeyPerception"), L("Perception"))];
  const obj = (label, icon) => ({ id: id(), type: "model", modelName: label, label, icon });
  const hud = {
    enabled: true,
    nodes: [
      { id: id(), type: "menu", label: L("Attack"), icon: "fa-solid fa-hand-fist", children: [
        obj(L("Sword"), "icons/svg/sword.svg"), obj(L("Shield"), "icons/svg/shield.svg"), obj(L("Bow"), "icons/svg/target.svg")
      ] },
      { id: id(), type: "menu", label: L("Stats"), icon: "fa-solid fa-dice-d20",
        children: els.map(e => ({ id: id(), type: "value", key: e.key })) },
      { id: id(), type: "menu", label: L("Spells"), icon: "fa-solid fa-wand-magic-sparkles", children: [
        obj(L("Fireball"), "icons/svg/fire.svg"), obj(L("Heal"), "icons/svg/regen.svg"), obj(L("Lightning"), "icons/svg/lightning.svg")
      ] }
    ]
  };
  return new Actor.implementation({ name: L("HudModel"), type: "template", system: { elements: els, hud } });
}

/** Ouvre les réglages du HUD sur le modèle d'exemple. */
export async function openSampleHudConfig() {
  const { SBEHudConfig } = await import("../hud/hud-config.mjs");
  const app = new SBEHudConfig({ id: "sbe-hud-config-tour", document: sampleHudModel() });
  await app.render({ force: true });
  return app;
}

/* ------------------------------------------------------------ */
/*  Gabarits et corps : des exemples quand le monde n'en a pas   */
/* ------------------------------------------------------------ */

/** Gabarits d'exemple : une explosion (centre plein, bord à moitié), un cône, une ligne. */
export function sampleShapes() {
  const blast = circleShape(3);
  blast.pieces = [{ kind: "ellipse", x: 0, y: 0, rx: 3, ry: 3, intensity: 50 }, { kind: "ellipse", x: 0, y: 0, rx: 1.5, ry: 1.5, intensity: 100 }];
  return [
    ZoneShapes.clean({ name: L("ShapeBlast"), ...blast }),
    ZoneShapes.clean({ name: L("ShapeCone"), ...coneShape(5, 60) }),
    ZoneShapes.clean({ name: L("ShapeLine"), ...lineShape(6, 1) })
  ];
}

/** Corps d'exemple : humanoïde et quadrupède. */
export function sampleBodies() {
  return ["humanoid", "quadruped"].map(k => HitLocations.create(k, game.i18n.localize(`SBE.Loc.Preset_${k}`)));
}

/** Préparation d'un éditeur avant son affichage : exemples si le monde n'a rien. */
export const prepareZoneEditor = (app) => { if (!ZoneShapes.list().length) app._shapes = sampleShapes(); };
export const prepareBodyEditor = (app) => { if (!HitLocations.list().length) app._bodies = sampleBodies(); };

