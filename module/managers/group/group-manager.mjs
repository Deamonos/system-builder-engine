/**
 * SBE — GROUPE : sauvegarder / charger l'état des personnages
 *
 * Sauvegarde (comme un jeu vidéo) : pour chaque membre, sa fiche, tous
 * ses objets et ses effets — sauf ceux que donnent les objets (ils
 * reviennent d'eux-mêmes avec les objets) —, l'heure du monde et la
 * date réelle. 3 emplacements manuels + 1 automatique.
 *
 * Chargement : chaque membre retrouve cet état, l'heure du monde revient
 * à celle de la sauvegarde. Rien d'orphelin ne revient :
 *   - un objet dont l'objet du monde (ou le modèle d'atelier) n'existe
 *     plus est écarté ;
 *   - un effet dont la définition n'existe plus est écarté ;
 *   - les valeurs suivent le modèle actuel (une clé supprimée est oubliée).
 * Le MJ reçoit un message (et, au choix, toute la table entend le son
 * du groupe à la sauvegarde).
 *
 * Sauvegarde automatique : groupe ACTIF seulement (un à la fois), à la
 * nouvelle journée et/ou toutes les N minutes réelles (MJ principal).
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { soundGain } from "../../helpers/constants.mjs";
import { walkElements } from "../../builder/element-renderer.mjs";
import { ChatCards } from "../chat/chat-cards.mjs";
import { GROUP_SLOTS } from "../../data/groupe-data.mjs";
import { isPrimaryGM } from "../../helpers/socket.mjs";

const ACTIVE = "activeGroupId";
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const SUBKEYS = ["_min", "_max", "_temp", "_bonus", "_bas", "_haut"];

export class GroupManager {

  static _timer = null;
  static _bound = false;

  static init() {
    if (this._bound) return;
    this._bound = true;
    game.settings.register(SYSTEM_ID, ACTIVE, {
      scope: "world", config: false, type: String, default: "",
      onChange: () => { this.refreshTimer(); this._renderGroups(); }
    });
    Hooks.once("ready", () => this.refreshTimer());
    Hooks.on("updateActor", (a, ch) => {
      if (a.type === "groupe" && a.id === this.activeId() && foundry.utils.hasProperty(ch, "system.autoSave")) this.refreshTimer();
    });
    /* Nouvelle journée : sauvegarde automatique du groupe actif. */
    /* Signal local du MJ qui la lance (pas forcément le MJ principal). */
    Hooks.on("sbeNewDayDone", () => {
      if (!game.user.isGM) return;
      const g = this.active();
      if (g?.system.autoSave?.newDay) this.save(g, "auto", { auto: true }).catch(err => console.warn("SBE | Groupe : sauvegarde auto en échec", err));
    });
  }

  /* ========================================================== */
  /*  GROUPE ACTIF                                               */
  /* ========================================================== */

  static activeId() {
    try { return game.settings.get(SYSTEM_ID, ACTIVE) || ""; } catch (_e) { return ""; }
  }

  static active() {
    const g = game.actors?.get(this.activeId());
    return g?.type === "groupe" ? g : null;
  }

  static async setActive(group, on) {
    await game.settings.set(SYSTEM_ID, ACTIVE, on && group ? group.id : "");
  }

  static _renderGroups() {
    for (const a of game.actors ?? []) if (a.type === "groupe" && a.sheet?.rendered) a.sheet.render();
  }

  /** Minuteur en temps réel (MJ principal, groupe actif, minutes > 0). */
  static refreshTimer() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    if (!isPrimaryGM()) return;
    const g = this.active();
    const mins = Math.max(0, Number(g?.system.autoSave?.timerMinutes) || 0);
    if (!g || !mins) return;
    this._timer = setInterval(() => {
      const cur = this.active();
      if (!cur || !(Number(cur.system.autoSave?.timerMinutes) > 0)) { this.refreshTimer(); return; }
      this.save(cur, "auto", { auto: true }).catch(err => console.warn("SBE | Groupe : sauvegarde auto en échec", err));
    }, mins * 60000);
  }

  /* ========================================================== */
  /*  MEMBRES                                                    */
  /* ========================================================== */

  /** Peut-on ajouter cette fiche ? (personnage possédé par un joueur) */
  static canJoin(actor) {
    return actor?.documentName === "Actor" && actor.type === "personnage" && !!actor.hasPlayerOwner;
  }

  static async members(group) {
    const out = [];
    for (const uuid of group?.system?.members ?? []) {
      const a = await fromUuid(uuid).catch(() => null);
      out.push({ uuid, actor: a?.documentName === "Actor" ? a : null });
    }
    return out;
  }

  /* ========================================================== */
  /*  SAUVEGARDE                                                 */
  /* ========================================================== */

  /** L'état d'un membre. Les effets donnés par les objets n'y sont pas. */
  static snapshotOf(actor) {
    const src = actor.toObject();
    return {
      uuid: actor.uuid,
      name: actor.name,
      img: actor.img,
      system: src.system,
      items: src.items ?? [],
      effects: (src.effects ?? []).filter(e => !e?.flags?.[SYSTEM_ID]?.granted)
    };
  }

  /** Lecture d'un emplacement : { snaps, worldTime, realTime } ou null. */
  static slotOf(group, slot) {
    const s = group?.system?.slots?.[slot];
    if (!s?.json) return null;
    let snaps = [];
    try { snaps = JSON.parse(s.json) || []; } catch (_e) { return null; }
    return { snaps, worldTime: Number(s.worldTime) || 0, realTime: Number(s.realTime) || 0 };
  }

  static async save(group, slot, { auto = false } = {}) {
    if (!group || !GROUP_SLOTS.includes(slot) || !game.user.isGM) return false;
    const snaps = [];
    for (const m of await this.members(group)) {
      if (!m.actor) continue;
      try { snaps.push(this.snapshotOf(m.actor)); }
      catch (err) { console.warn("SBE | Groupe : sauvegarde d'un membre en échec", m.actor?.name, err); }
    }
    const worldTime = Number(game.time?.worldTime ?? 0);
    const realTime = Date.now();
    /* Le texte JSON évite que des clés à points soient lues comme des
       chemins par Foundry. */
    await group.update({ [`system.slots.${slot}`]: { json: JSON.stringify(snaps), worldTime, realTime } });
    this.playSound(group);
    const lines = [
      L(auto ? "SBE.Group.SaveAuto" : "SBE.Group.SaveManual"),
      L("SBE.Group.SavedMembers", { n: snaps.length }),
      `<i class="fa-solid fa-hourglass-half"></i> ${esc(this.formatWorldTime(worldTime))}`,
      `<i class="fa-regular fa-clock"></i> ${esc(this.formatReal(realTime))}`
    ];
    await this._card(group, L("SBE.Group.SavedTitle", { slot: this.slotLabel(slot) }), lines, "fa-solid fa-floppy-disk");
    return true;
  }

  /* ========================================================== */
  /*  CHARGEMENT                                                 */
  /* ========================================================== */

  /** Un objet sauvegardé a-t-il encore sa place dans le monde ? */
  static itemAlive(data) {
    const sys = data?.system ?? {};
    if (data?.type !== "objet") return false;
    if (sys.modelId) return !!game.items?.get(sys.modelId);
    return !!(sys.templateId && game.items?.get(sys.templateId));
  }

  /** Clés d'effets connues : gestionnaire, objets du monde, états de Foundry. */
  static knownEffects(extraItems = []) {
    const keys = new Set((game.settings.get(SYSTEM_ID, "effects") ?? []).map(d => d?.key).filter(Boolean));
    const local = (it) => {
      const f = it?.flags?.[SYSTEM_ID] ?? {};
      for (const d of f.localEffects ?? []) if (d?.key) keys.add(d.key);
      const model = it?.system?.modelId ? game.items?.get(it.system.modelId) : null;
      for (const d of model?.flags?.[SYSTEM_ID]?.localEffects ?? []) if (d?.key) keys.add(d.key);
    };
    for (const it of game.items ?? []) local(it);
    for (const it of extraItems) local(it);
    for (const se of CONFIG.statusEffects ?? []) if (se?.id) keys.add(se.id);
    return keys;
  }

  /** Les valeurs suivent le modèle actuel : une clé disparue est oubliée. */
  static valuesForTemplate(values, templateId) {
    const tpl = templateId ? game.actors?.get(templateId) : null;
    if (!tpl) return values ?? {};
    const live = new Set();
    for (const el of walkElements(tpl.system?.elements ?? [])) {
      if (!el?.key) continue;
      live.add(el.key);
      for (const s of SUBKEYS) live.add(el.key + s);
    }
    const out = {};
    for (const [k, v] of Object.entries(values ?? {})) if (live.has(k)) out[k] = v;
    return out;
  }

  static async load(group, slot) {
    if (!group || !game.user.isGM) return false;
    const data = this.slotOf(group, slot);
    if (!data) { ui.notifications.warn(L("SBE.Group.SlotEmpty")); return false; }
    const removed = [];
    let restored = 0;
    for (const snap of data.snaps) {
      const actor = await fromUuid(snap.uuid).catch(() => null);
      if (!actor) { removed.push(L("SBE.Group.MemberGone", { name: snap.name })); continue; }
      try {
        const r = await this.restore(actor, snap);
        restored++;
        for (const n of r.items) removed.push(L("SBE.Group.ItemGone", { name: n, who: actor.name }));
        for (const n of r.effects) removed.push(L("SBE.Group.EffectGone", { name: n, who: actor.name }));
      } catch (err) {
        console.warn("SBE | Groupe : chargement d'un membre en échec", actor?.name, err);
      }
    }
    /* L'heure du monde revient à celle de la sauvegarde (elle peut reculer). */
    try {
      const delta = data.worldTime - Number(game.time?.worldTime ?? 0);
      if (delta) await game.time.advance(delta);
    } catch (err) { console.warn("SBE | Groupe : heure du monde non rétablie", err); }
    const lines = [
      L("SBE.Group.LoadedMembers", { n: restored }),
      `<i class="fa-solid fa-hourglass-half"></i> ${esc(this.formatWorldTime(data.worldTime))}`
    ];
    if (removed.length) {
      lines.push(`<b>${esc(L("SBE.Group.Removed"))}</b>`);
      for (const r of removed) lines.push(`• ${esc(r)}`);
    }
    await this._card(group, L("SBE.Group.LoadedTitle", { slot: this.slotLabel(slot) }), lines, "fa-solid fa-clock-rotate-left");
    return true;
  }

  /** Remet un membre dans l'état sauvegardé, sans rien d'orphelin. */
  static async restore(actor, snap) {
    const removedItems = [], removedEffects = [];
    const items = (snap.items ?? []).filter(it => {
      if (this.itemAlive(it)) return true;
      removedItems.push(it?.name ?? "?");
      return false;
    });
    const known = this.knownEffects(items);
    const effects = (snap.effects ?? []).filter(e => {
      const key = e?.flags?.[SYSTEM_ID]?.key;
      if (!key || known.has(key) || known.has(String(key).toLowerCase())) return true;
      removedEffects.push(e?.name ?? key);
      return false;
    });
    const system = foundry.utils.deepClone(snap.system ?? {});
    system.values = this.valuesForTemplate(system.values, system.templateId ?? actor.system?.templateId);

    /* Un chargement REMET l'état sauvegardé, tel quel — comme un retour
       en arrière : ni plafond de jauge, ni points temporaires qui
       encaissent, ni déclencheurs, réactions ou nettoyages relancés. */
    const o = () => ({ sbeUndo: true, sbeDirect: true, sbeGroupLoad: true });
    await actor.update({ system }, { ...o(), diff: false, recursive: false });
    const oldItems = actor.items.map(i => i.id);
    if (oldItems.length) await actor.deleteEmbeddedDocuments("Item", oldItems, o());
    if (items.length) await actor.createEmbeddedDocuments("Item", items, { ...o(), keepId: true });
    /* Les effets donnés par les objets restent : le moteur les aligne
       sur les objets rendus. */
    const oldFx = actor.effects.filter(e => !e.flags?.[SYSTEM_ID]?.granted).map(e => e.id);
    if (oldFx.length) await actor.deleteEmbeddedDocuments("ActiveEffect", oldFx, o());
    if (effects.length) await actor.createEmbeddedDocuments("ActiveEffect", effects, { ...o(), keepId: true });
    return { items: removedItems, effects: removedEffects };
  }

  /* ========================================================== */
  /*  AFFICHAGE                                                  */
  /* ========================================================== */

  static slotLabel(slot) {
    return slot === "auto" ? L("SBE.Group.SlotAuto") : L("SBE.Group.Slot", { n: slot });
  }

  /** Heure du monde lisible (calendrier de Foundry, sinon jours / heures). */
  static formatWorldTime(seconds) {
    const t = Number(seconds) || 0;
    const pad = (n) => String(Math.floor(Number(n) || 0)).padStart(2, "0");
    try {
      const cal = game.time?.calendar;
      if (cal?.timeToComponents) {
        const c = cal.timeToComponents(t);
        const months = cal.months?.values ?? [];
        const month = months[c.month]?.name ? L(months[c.month].name) : String(Number(c.month ?? 0) + 1);
        const year = Number(c.year ?? 0) + Number(cal.years?.yearZero ?? 0);
        const day = Number(c.dayOfMonth ?? c.day ?? 0) + 1;
        return `${day} ${month} ${year} — ${pad(c.hour)}:${pad(c.minute)}`;
      }
    } catch (_e) { /* calendrier absent : repli */ }
    const day = Math.floor(t / 86400) + 1;
    const rem = ((t % 86400) + 86400) % 86400;
    return L("SBE.Group.GenericDay", { day, time: `${pad(rem / 3600)}:${pad((rem % 3600) / 60)}` });
  }

  static formatReal(ms) {
    if (!ms) return "";
    return new Date(ms).toLocaleString(game.i18n.lang, { dateStyle: "medium", timeStyle: "short" });
  }

  /** Message au MJ (sauvegarde, chargement). */
  static async _card(group, title, lines, icon) {
    const whisper = game.users.filter(u => u.isGM).map(u => u.id);
    await ChatCards.post({
      type: "group", icon, title, subtitle: group.name,
      body: lines.map(l => `<div class="sbe-card-line">${l}</div>`).join(""),
      speaker: { alias: group.name }, whisper
    });
  }

  /** Son du groupe : toute la table, ou le MJ seul. */
  static playSound(group) {
    const m = group?.system?.media ?? {};
    if (!m.sound) return;
    try {
      foundry.audio.AudioHelper.play({ src: m.sound, volume: soundGain(m.volume ?? 80), autoplay: true, loop: false },
        m.audience === "all");
    } catch (err) { console.warn("SBE | Groupe : son en échec", err); }
  }
}
