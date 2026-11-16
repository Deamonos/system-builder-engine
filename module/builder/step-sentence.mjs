/**
 * SBE — Étapes en phrases : la phrase d'une étape
 *
 * Chaque étape d'un bouton se lit comme une phrase sur sa ligne repliée
 * (« retirer 1 à munitions », « jet de tir du porteur »…) ; ses réglages
 * ne s'ouvrent qu'au clic. Les valeurs écrites (clés, formules) sont en
 * gras ; un « Seulement si » s'ajoute en fin de phrase.
 */

import { BLOCK_BRANCHES } from "./step-blocks.mjs";
import { CalendarManager } from "../managers/calendar/calendar-manager.mjs";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (x) => foundry.utils.escapeHTML(String(x ?? ""));
/* Une valeur écrite par le créateur, mise en avant. */
const b = (x) => `<b>${esc(x)}</b>`;
const say = (k, d = {}) => L(`SBE.Steps.Say.${k}`, d);

/** La phrase (HTML) d'une étape lue (même forme que dans le modèle). */
export function stepSentence(st) {
  let txt = sentenceOf(st);
  if (st.onlyIf) txt += ` <span class="sbe-step-if">${say("OnlyIf", { f: b(st.onlyIf) })}</span>`;
  return txt;
}

/* « alors : 2 étapes · sinon : 1 étape » */
function branchesOf(st) {
  return BLOCK_BRANCHES[st.type]
    .map(k => ({ k, n: Array.isArray(st[k]) ? st[k].length : 0 }))
    .filter(x => x.n)
    .map(x => say("BranchCount", { b: esc(L(`SBE.Steps.Branch.${x.k}`)), n: x.n }))
    .join(" · ");
}

function sentenceOf(st) {
  switch (st.type) {
    case "if": return say("if", { f: b(st.formula || "true") }) + ` — ${branchesOf(st)}`;
    case "result": return say("result") + ` — ${branchesOf(st)}`;
    case "condition":
      return say("condition", { f: b(st.formula) }) + (st.message ? ` — ${game.i18n.format("SBE.Quote", { t: esc(st.message) })}` : "");
    case "consume": {
      const n = b(st.amount ?? 1);
      if (st.from === "self") return say("consumeSelf", { n });
      if (st.from === "picked") return say("consumePicked", { n });
      if (st.from === "slot") return say("consumeSlot", { n, k: b(st.slot) });
      if (st.from === "carrier") return say("consumeCarrier", { n, k: b(st.key) });
      return say("consume", { n, k: b(st.key) });
    }
    case "roll":
      return say(st.who === "carrier" ? "rollCarrier" : "roll", { k: b(st.key) })
        + (st.difficulty ? ` ${say("Difficulty", { f: b(st.difficulty) })}` : "");
    case "attack":
      return say("attack", { k: b(st.key) })
        + (st.profile ? ` (${esc(st.profile)})` : "")
        + (st.damage ? ` ${say("Damage", { f: b(st.damage) })}` : "");
    case "target":
      return say("target") + (st.who && st.who !== "all" ? ` (${esc(L(`SBE.PZone.Touch_${st.who}`))})` : "")
        + (st.range ? ` ${say("Range", { f: b(st.range) })}` : "")
        + (st.targetIf ? ` ${say("Filter", { f: b(st.targetIf) })}` : "");
    case "pick":
      return say("pick") + (st.formula ? ` ${say("Filter", { f: b(st.formula) })}` : "");
    case "ask": {
      const qs = (st.questions ?? []).map(q => b(q.label || q.key)).join(", ");
      return say("ask", { q: qs, who: esc(L(`SBE.Ask.WhoOpt.${st.who || "self"}`)) });
    }
    case "set": {
      const on = { carrier: "OnCarrier", targets: "OnTargets", picked: "OnPicked", slot: "OnSlot" }[st.target];
      const where = on ? ` ${say(on, { k: b(st.slot) })}` : "";
      return say(`set_${st.mode || "set"}`, { k: b(st.key), f: b(st.formula) }) + where;
    }
    case "fill": return say("fill", { k: b(st.slot) }) + (st.limit ? ` ${say("Limit", { f: b(st.limit) })}` : "");
    case "empty": return say("empty", { k: b(st.slot) });
    case "useslot": return say("useslot", { btn: b(st.button), k: b(st.slot) });
    case "effect":
      if (st.target === "mine") return say("effectMine", { k: b(st.key || L("SBE.Steps.FxAllMine")) });
      return say(st.target === "targets" ? "effectTargets" : "effect", {
        act: esc(L(`SBE.Steps.FxAction.${st.action || "apply"}`)), k: b(st.key)
      });
    case "land": return say("land", { hit: b(st.onHit || "—"), miss: b(st.onMiss || "—") });
    case "sound": return say("sound", { k: b(st.key) });
    case "wait": {
      const parts = [];
      if (st.rounds) parts.push(say("Rounds", { n: b(st.rounds) }));
      if (st.minutes) parts.push(say("Minutes", { n: b(st.minutes) }));
      return say("wait", { t: parts.join(" / ") });
    }
    case "quest": return say("quest", { act: esc(L(`SBE.Steps.Quest.Act.${st.action}`)) });
    case "level": {
      const on = st.target === "targets" ? ` ${say("level_targets")}` : st.target === "owned" ? ` ${say("level_owned", { i: b(game.items?.get(st.item)?.name ?? "?") })}` : "";
      return say(st.what === "level" ? "level_level" : "level_xp", { n: b(st.amount || "1"), k: b(st.key) }) + on;
    }
    case "take": return say("take") + (st.amount ? ` ×${b(st.amount)}` : "");
    case "give": return say("give") + (st.amount ? ` ×${b(st.amount)}` : "") + (st.where ? ` → ${b(st.where)}` : "");
    case "place": {
      const who = st.actor ? (game.actors?.get(st.actor)?.name ?? "?") : "";
      if (st.what === "dismiss") return say("dismiss", { a: who ? b(who) : esc(L("SBE.Summon.All")) });
      if (st.what === "creature") return say("summon", { n: b(st.count || "1"), a: b(who) });
      return say("place");
    }
    case "scene": {
      const act = esc(L(`SBE.Scene.Act.${st.action || "door"}`));
      const op = st.op ? ` : ${esc(L(`SBE.Scene.OpName.${st.op}`))}` : "";
      return say("scene", { act: act + op }) + (st.group ? ` ${say("Group", { g: b(st.group) })}` : "");
    }
    case "table": {
      const t = game.tables?.get(st.table);
      return say("table", { t: b(t?.name ?? "?") }) + (st.give ? ` ${say("TableGive")}` : "");
    }
    case "time": {
      const u = esc(L(`SBE.Steps.Cal.Unit.${st.unit || "hour"}`));
      const p = esc(L(`SBE.Steps.Cal.PartOpt.${st.part || "dawn"}`));
      const at = [st.hour !== undefined ? `${st.hour}:${String(st.minute ?? 0).padStart(2, "0")}` : "", [st.day, st.month, st.year].some(x => x !== undefined) ? [st.day ?? "—", st.month ?? "—", st.year ?? "—"].join("/") : ""].filter(Boolean).join(" ");
      const txt = st.action === "set" ? say("time_set", { at: b(at || "—") })
        : ["next", "prev"].includes(st.action) ? say(`time_${st.action}`, { p })
          : say(`time_${st.action === "back" ? "back" : "advance"}`, { n: b(st.amount || "1"), u });
      return txt + (st.keepWeather ? ` ${say("TimeKeep")}` : "");
    }
    case "weather": case "season": case "moon": {
      const moon = st.type === "moon" ? CalendarManager.calendar()?.moons.find(m => m.key === st.moon) : null;
      if (st.mode === "natural") return say(`${st.type}_natural`, { m: b(moon?.name ?? st.moon ?? "?") });
      const name = st.type === "weather" ? CalendarManager.weatherByKey(st.key)?.name
        : st.type === "season" ? CalendarManager.calendar()?.seasons.find(x => x.key === st.key)?.name
          : moon?.phases.find(p => p.key === st.key)?.name;
      if (st.type === "moon") {
        const d = st.amount ? ` ${say("For", { n: b(st.amount), u: esc(L(`SBE.Steps.Cal.Unit.${st.unit || "hour"}`)) })}` : "";
        return say("moon_decided", { k: b(name ?? st.key ?? "?"), m: b(moon?.name ?? st.moon ?? "?") }) + d;
      }
      const d = st.amount ? ` ${say("For", { n: b(st.amount), u: esc(L(`SBE.Steps.Cal.Unit.${st.unit || "hour"}`)) })}` : "";
      return say(`${st.type}_decided`, { k: b(name ?? st.key ?? "?") }) + d;
    }
    case "resist":
      return say("resist", { k: b(st.key || L("SBE.Steps.ResistEvent")) }) + (st.adv ? ` ${say(st.adv === "adv" ? "ResistAdv" : "ResistDis")}` : "");
    case "signal":
      return say("signal", { n: b(st.name), to: esc(L(`SBE.Auto.SignalToOpt.${st.to || "self"}`)) });
    default:
      return esc(L(`SBE.Steps.Type.${st.type}`));
  }
}
