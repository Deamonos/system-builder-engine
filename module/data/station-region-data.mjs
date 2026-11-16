/**
 * SBE — Comportement de région « Poste de travail SBE »
 *
 * Une région (invisible des joueurs) marquée d'un nom : forge, établi,
 * laboratoire… Les formules le lisent avec atStation("forge") : vrai si
 * un pion du personnage se trouve dans une région de ce nom (vide = un
 * poste quelconque). Passif : aucun événement.
 */

const fields = foundry.data.fields;

export class SBEStationRegionData extends foundry.data.regionBehaviors.RegionBehaviorType {

  static LOCALIZATION_PREFIXES = ["SBE.Station.Region"];

  static defineSchema() {
    return {
      name: new fields.StringField({ required: true, blank: false, initial: "forge" })
    };
  }

  static events = {};
}

/** Les pions de ce document (un objet : ceux de son porteur) sont-ils dans un poste « name » ? */
export function atStationOf(doc, name = "") {
  const actor = doc?.documentName === "Actor" ? doc : (doc?.parent?.documentName === "Actor" ? doc.parent : null);
  if (!actor || !canvas?.scene) return false;
  const want = String(name ?? "").trim().toLowerCase();
  const tokens = actor.isToken ? [actor.token].filter(Boolean) : (actor.getActiveTokens?.(true, true) ?? []);
  if (!tokens.length) return false;
  for (const region of canvas.scene.regions ?? []) {
    const ok = (region.behaviors ?? []).some(b => b.type === "sbeStation" && !b.disabled
      && (!want || String(b.system.name ?? "").trim().toLowerCase() === want));
    if (!ok) continue;
    for (const t of tokens) {
      const gs = canvas.grid?.size || 100;
      const p = { x: t.x + (t.width ?? 1) * gs / 2, y: t.y + (t.height ?? 1) * gs / 2, elevation: t.elevation ?? 0 };
      try { if (region.testPoint(p)) return true; } catch (_e) { /* forme invalide */ }
    }
  }
  return false;
}
