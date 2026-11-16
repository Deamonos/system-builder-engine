/**
 * SBE — Comportement de région « Traces SBE »
 *
 * Posé sur une région (invisible des joueurs), il fait laisser un type de
 * trace aux pions : pendant qu'ils marchent dedans (neige), et / ou en
 * sortant pendant N cases (boue sous les pieds). Passif : c'est le
 * gestionnaire des traces (MJ principal) qui le lit à chaque déplacement.
 * Une région peut avoir plusieurs formes ; deux régions qui se
 * chevauchent avec le même type ne posent qu'une trace par pas.
 * Mode « Météo » : la région ne pose rien, elle EFFACE les traces qui s'y
 * trouvent au bout de N heures de jeu (pluie, neige qui tombe, marée).
 */

import { TraceManager } from "../managers/traces/trace-manager.mjs";

const fields = foundry.data.fields;

export class SBETraceRegionData extends foundry.data.regionBehaviors.RegionBehaviorType {

  static LOCALIZATION_PREFIXES = ["SBE.Traces.Region"];

  static defineSchema() {
    return {
      traceType: new fields.StringField({
        required: true, blank: false, initial: "blood",
        choices: () => ({ "*": game.i18n.localize("SBE.Traces.Region.AllTypes"), ...Object.fromEntries(TraceManager.types().map(t => [t.id, t.name])) })
      }),
      mode: new fields.StringField({
        required: true, initial: "both",
        choices: { inside: "SBE.Traces.Region.Mode.inside", exit: "SBE.Traces.Region.Mode.exit", both: "SBE.Traces.Region.Mode.both", weather: "SBE.Traces.Region.Mode.weather" }
      }),
      cases: new fields.NumberField({ required: true, nullable: false, min: 0, initial: 3 }),
      eraseAfter: new fields.NumberField({ required: true, nullable: false, min: 0.01, initial: 1 }),
      templates: new fields.SetField(new fields.StringField({
        choices: () => Object.fromEntries((game.actors?.filter(a => a.type === "template") ?? []).map(a => [a.id, a.name]))
      }))
    };
  }

  static events = {};
}
