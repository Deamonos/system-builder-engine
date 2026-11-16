/**
 * SBE — VÉRIFICATEUR DE MODÈLES : où SBE range des clés et des formules
 *
 * Chaque bloc ci-dessous DÉCLARE un endroit (registerRefSource) et dit,
 * champ par champ, ce qu'il contient : une clé, une formule, un texte à
 * {{clé}}… Le moteur (ref-engine.mjs) s'en sert pour vérifier ET pour
 * renommer : une seule description, deux usages.
 *
 * Un futur module n'a qu'à appeler registerRefSource pour être vérifié
 * et renommé lui aussi.
 */

import { BLOCK_BRANCHES } from "../../builder/step-blocks.mjs";
import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { registerRefSource } from "./ref-engine.mjs";

/* Ce que lit un critique « par condition » (field-roll). */
const ROLL_COND_VARS = ["rollTotal", "natural", "goal", "margin", "diceCount", "countFace", "hasDouble"];

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const clone = (x) => foundry.utils.deepClone(x ?? null);
const W = (...parts) => parts.filter(p => p !== undefined && p !== null && p !== "").join(" › ");

/** Ouvre une fenêtre de réglages déclarée dans les paramètres du système. */
function openMenu(id) {
  try {
    const m = game.settings.menus.get(`${SYSTEM_ID}.${id}`);
    if (m?.type) new m.type().render({ force: true });
  } catch (err) { console.warn("SBE | Vérificateur : ouverture en échec", err); }
}

/** Un réglage du monde, lu et écrit tel quel. */
function settingContainer(id, key, label, open, walk, extra = {}) {
  return {
    id, label, open, ...extra,
    read: () => clone(game.settings.get(SYSTEM_ID, key)),
    write: (data) => game.settings.set(SYSTEM_ID, key, data),
    walk
  };
}

/* ============================================================ */
/*  Morceaux réutilisés                                          */
/* ============================================================ */

/** Les étapes d'un bouton (modèle d'objet ou de personnage). */
function walkSteps(steps, v, where, outer = []) {
  /* Réponses d'une étape « Demander » : variables des étapes suivantes
     (celles d'avant un bloc valent dedans). */
  const asked = [...outer];
  (Array.isArray(steps) ? steps : []).forEach((st, i) => {
    if (!st || typeof st !== "object") return;
    const w = W(where, L("SBE.Checker.W.Step", { n: i + 1 }));
    const vars = [...asked, ...(Array.isArray(st.options) ? st.options : []).map(o => o?.key).filter(Boolean)];
    v.formula(st, "onlyIf", "self", W(w, L("SBE.Checker.W.OnlyIf")), { vars });
    switch (st.type) {
      case "condition": v.formula(st, "formula", "self", w, { vars }); break;
      case "consume":
        v.formula(st, "amount", "self", w, { vars });
        if (st.from === "carrier") v.key(st, "key", "actor", w);
        else if (st.from === "slot") v.key(st, "slot", "self", w);
        else v.key(st, "key", "self", w);
        break;
      case "roll":
        /* Sur le porteur : une clé du personnage, ou une formule qui la donne. */
        /* Sur le porteur : formule lue sur l'objet (talent, picked_talent)
           ou clé du personnage entre guillemets ("crafting"). */
        /* Une clé à jet d'un modèle de personnage, écrite telle quelle :
           c'est une clé du PORTEUR (l'exécuteur la prend directement). */
        if (st.who === "carrier" && actorRollKeys().has(String(st.key ?? "").trim())) v.key(st, "key", "actor", w);
        else if (st.who === "carrier") v.formula(st, "key", "self", w, { vars });
        else v.key(st, "key", "self", w);
        v.formula(st, "difficulty", "self", w, { vars });
        break;
      case "attack": walkAttack(st, v, w, vars, "self"); break;
      case "target": v.formula(st, "range", "self", w, { vars }); v.formula(st, "targetIf", "actor", w, { vars }); break;
      case "pick":
        /* Le filtre lit l'objet candidat (clés nues) et l'objet qu'on
           utilise (« self_clé »). */
        v.formula(st, "formula", "item", w, { vars, selfPrefix: true });
        v.formula(st, "show", "item", w, { vars, selfPrefix: true });
        break;
      case "set": {
        const fam = st.target === "carrier" || st.target === "targets" ? "actor" : ["picked", "slot"].includes(st.target) ? "item" : "self";
        v.key(st, "key", fam, w);
        if (st.target === "slot") v.key(st, "slot", "self", w);
        /* Accepte les dés (« 2d4 + 2 »). */
        v.formula(st, "formula", "self", w, { vars, dice: true });
        break;
      }
      case "fill": case "empty": v.key(st, "slot", "self", w); v.formula(st, "limit", "self", w, { vars }); break;
      case "useslot": v.key(st, "slot", "self", w); break;
      /* Blocs : leur condition, puis leurs étapes (mêmes variables). */
      case "if": case "result":
        if (st.type === "if") v.formula(st, "formula", "self", w, { vars });
        for (const b of BLOCK_BRANCHES[st.type]) walkSteps(st[b], v, w, asked);
        break;
      case "ask":
        (Array.isArray(st.questions) ? st.questions : []).forEach(q => {
          if (q?.kind === "number" || !q?.kind) for (const f of ["def", "min", "max"]) v.formula(q, f, "self", w, { vars });
        });
        asked.push(...(Array.isArray(st.questions) ? st.questions : []).map(q => q?.key).filter(Boolean));
        break;
      case "effect": case "resist": v.effect(st, "key", w); break;
      case "quest": v.formula(st, "amount", "self", w, { vars }); break;
      case "level":
        v.formula(st, "amount", "self", w, { vars });
        /* Le composant Niveau visé : sur ce document, sur les cibles, ou
           sur les objets portés d'un modèle. */
        v.key(st, "key", st.target === "targets" ? "actor" : st.target === "owned" ? "item" : "self", w);
        break;
      /* Temps, météo, saison : la durée (formule). */
      case "time": v.formula(st, "amount", "self", w, { vars, dice: true }); break;
      case "weather": case "season":
        v.formula(st, "amount", "self", w, { vars, dice: true });
        if (st.mode !== "natural") v.key(st, "key", st.type === "weather" ? "calWeather" : "calSeason", w);
        break;
      case "moon":
        v.formula(st, "amount", "self", w, { vars, dice: true });
        v.key(st, "moon", "calMoon", w);
        if (st.mode !== "natural") v.key(st, "key", "calMoonPhase", w);
        break;
      case "take":
        v.formula(st, "amount", "self", w, { vars });
        v.formula(st, "filter", "item", w, { vars, selfPrefix: true });
        v.formula(st, "formula", "self", w, { vars });
        break;
      case "give":
        v.formula(st, "amount", "self", w, { vars });
        v.formula(st, "formula", "self", w, { vars });
        v.key(st, "where", "actor", w);
        break;
      /* Invocation : nombre et durée (formules), effet qui la tient. */
      case "place":
        if (st.what !== "creature") break;
        for (const f of ["count", "rounds", "minutes"]) v.formula(st, f, "self", w, { vars, dice: true });
        v.effect(st, "whileEffect", w);
        /* Valeurs de la créature : sa clé (fiche de personnage), la formule. */
        (Array.isArray(st.values) ? st.values : []).forEach(x => {
          v.key(x, "key", "actor", w);
          v.formula(x, "formula", "self", w, { vars, dice: true });
        });
        break;
      default: break;
    }
  });
}

/**
 * Composant Niveau : clé d'XP, points restants, champs du budget
 * (« clé:coût, clé:coût »), formules, tableaux de règles de montée et
 * de descente (`level` = le niveau atteint).
 */
function walkLevel(c, v, w) {
  const lv = { vars: ["level"] };
  v.key(c, "xpKey", "self", w);
  v.formula(c, "max", "self", w, lv);
  /* Seuils : une liste de nombres (« 100, 300, 600 »), ou une formule. */
  if (!/^[\d\s.,;]+$/.test(String(c.thresholds ?? ""))) v.formula(c, "thresholds", "self", w, lv);
  const b = c.budget;
  if (b && typeof b === "object") {
    v.key(b, "leftoverKey", "self", w);
    v.formula(b, "points", "self", w, lv);
    if (typeof b.fields === "string" && b.fields.trim()) {
      let any = false;
      const out = b.fields.split(/([,;\n]+)/).map(part => {
        const m = /^(\s*)([a-zA-Z_][a-zA-Z0-9_]*)(.*)$/s.exec(part);
        if (!m) return part;
        const h = { k: m[2] };
        v.key(h, "k", "self", w);
        if (h.k !== m[2]) any = true;
        return m[1] + h.k + m[3];
      });
      if (any) b.fields = out.join("");
    }
  }
  for (const rules of [c.rules, c.down?.rules]) {
    for (const r of Array.isArray(rules) ? rules : []) {
      for (const a of Array.isArray(r?.actions) ? r.actions : []) {
        if (a?.type === "value") { v.key(a, "key", "self", w); v.formula(a, "value", "self", w, lv); }
        else if (a?.type === "effect") v.effect(a, "key", w);
        else if (a?.type === "button") v.button(a, "key", w);
      }
    }
  }
}

/**
 * Composant Arbre de talents : la clé des points (sur le porteur pour
 * l'arbre d'un objet), coût et condition de chaque nœud (`rank`), et
 * leurs bonus (sur le porteur ou sur l'objet).
 */
function walkTalents(c, v, w, carrierFam) {
  v.key(c, "pointsKey", carrierFam, w);
  for (const n of Array.isArray(c.tree?.nodes) ? c.tree.nodes : []) {
    const nw = W(w, n?.name || n?.id || "");
    v.formula(n, "cost", "self", nw, { vars: ["rank"] });
    v.formula(n, "cond", "self", nw, { vars: ["rank"] });
    for (const bo of Array.isArray(n?.bonus) ? n.bonus : []) {
      v.key(bo, "key", bo?.to === "item" ? "self" : carrierFam, nw);
      v.formula(bo, "value", "self", nw, { vars: ["rank"] });
    }
    for (const e of Array.isArray(n?.effects) ? n.effects : []) v.effect(e, "key", nw);
    if (String(n?.button ?? "").trim()) v.button(n, "button", nw);
  }
}

/** Réglages d'une attaque (étape « Attaquer » ou profil d'attaque). */
function walkAttack(a, v, w, vars = [], fam = "self") {
  const o = { vars };
  if (fam === "self") v.key(a, "key", "self", w);
  v.formula(a, "defense", "actor", W(w, L("SBE.Checker.W.Defense")), { dice: true, vars });
  v.formula(a, "ignoreDefenseIf", fam, w, o);
  v.formula(a, "sureHitIf", fam, w, o);
  v.formula(a, "damage", fam, W(w, L("SBE.Checker.W.Damage")), { dice: true, vars });
  for (const f of ["hits", "range", "zRadius", "zLength", "zAngle", "zWidth", "zScale", "traverseLimit", "push", "locCount"]) v.formula(a, f, fam, w, o);
  /* Localisation : la formule du jet à part, ou lue sur le jet d'attaque
     (elle connaît alors natural et rollTotal). */
  v.formula(a, "locFormula", fam, W(w, L("SBE.Steps.Atk.LocFormula")), { dice: true, vars: [...vars, "natural", "rollTotal"] });
  v.key(a, "save", "actor", W(w, L("SBE.Checker.W.Save")));
  /* Dégâts non létaux : la condition, la valeur gardée, l'effet posé. */
  v.formula(a, "nonLethalIf", fam, w, o);
  v.formula(a, "nonLethalKeep", fam, w, o);
  v.effect(a, "nonLethalEffect", w);
  /* Options de la fenêtre : « visible si », minimum, maximum (elles
     lisent aussi les autres options). */
  const optKeys = (Array.isArray(a.options) ? a.options : []).map(x => x?.key).filter(Boolean);
  (Array.isArray(a.options) ? a.options : []).forEach(op => {
    for (const f of ["visibleIf", "min", "max"]) v.formula(op, f, fam, w, { vars: [...vars, ...optKeys] });
  });
  (Array.isArray(a.preview) ? a.preview : []).forEach(pl => v.braces(pl, "text", fam, W(w, L("SBE.Checker.W.Preview"))));
}

/** Une définition d'effet (gestionnaire, objet, ou copie posée). */
function walkEffectDef(d, v, where) {
  if (!d || typeof d !== "object") return;
  const w = W(where, d.label || d.key);
  const changes = (list, ww) => (Array.isArray(list) ? list : []).forEach(c => {
    v.key(c, "key", "actor", ww);
    v.formula(c, "value", "actor", ww);
  });
  changes(d.changes, W(w, L("SBE.Checker.W.Changes")));
  (d.escalation?.tiers ?? []).forEach((t, i) => {
    changes(t?.changes, W(w, L("SBE.Checker.W.Tier", { n: i + 1 })));
    v.formula(t, "amount", "actor", W(w, L("SBE.Checker.W.Tier", { n: i + 1 })), { dice: true });
  });
  (d.phases ?? []).forEach((p, i) => changes(p?.changes, W(w, L("SBE.Checker.W.Phase", { n: i + 1 }))));
  const t = d.trigger;
  if (t) {
    (Array.isArray(t.conditions) ? t.conditions : []).forEach((_c, i) => v.formula(t.conditions, i, "actor", W(w, L("SBE.Checker.W.Trigger"))));
    v.key(t, "onDecrease", "actor", W(w, L("SBE.Checker.W.Trigger")));
  }
  const p = d.periodic;
  if (p) {
    const pw = W(w, L("SBE.Checker.W.Periodic"));
    v.key(p, "key", p.target === "source" ? "item" : "actor", pw);
    v.formula(p, "amount", "actor", pw, { dice: true });
    v.key(p, "reduceKey", "actor", pw);
  }
  for (const [part, lbl] of [["resist", "SBE.Checker.W.Resist"], ["restHeal", "SBE.Checker.W.Rest"]]) {
    const r = d[part];
    if (!r) continue;
    v.key(r, "key", "actor", W(w, L(lbl)));
    v.formula(r, "difficulty", "actor", W(w, L(lbl)));
  }
  (Array.isArray(d.gives) ? d.gives : []).forEach(g => v.key(g, "where", "actor", W(w, L("SBE.Checker.W.Gives"))));
  const li = d.look?.light;
  if (li) {
    const lw = W(w, L("SBE.Checker.W.Light"));
    for (const f of ["dim", "bright", "alpha", "angle", "speed", "intensity", "attenuation", "luminosity", "saturation", "contrast", "shadows", "coloration"]) {
      v.value(li, f, "actor", "item", lw);
    }
    for (const f of ["color", "animation", "reverse", "personal"]) v.entry(li, f, "item", lw);
  }
}

/** Réglages de lumière / vue d'un objet (onglet Lumière). */
function walkLightSource(src, v, where) {
  if (!src || typeof src !== "object") return;
  v.formula(src, "onlyIf", "item", W(where, L("SBE.Checker.W.OnlyIf")));
  const vi = src.vision;
  if (vi) for (const f of ["range", "angle", "intensity"]) v.value(vi, f, "item", "item", W(where, L("SBE.Checker.W.Vision")));
  if (vi) v.entry(vi, "color", "item", W(where, L("SBE.Checker.W.Vision")));
  const li = src.light;
  if (li) {
    for (const f of ["dim", "bright", "alpha", "angle", "speed", "intensity", "attenuation", "luminosity", "saturation", "contrast", "shadows", "coloration"]) {
      v.value(li, f, "item", "item", W(where, L("SBE.Checker.W.Light")));
    }
    for (const f of ["color", "animation", "reverse", "personal"]) v.entry(li, f, "item", W(where, L("SBE.Checker.W.Light")));
  }
  const au = src.autonomy;
  if (au) {
    v.key(au, "key", "item", W(where, L("SBE.Checker.W.Autonomy")));
    v.formula(au, "amount", "item", W(where, L("SBE.Checker.W.Autonomy")));
  }
}

/** Zone persistante (onglet Zone d'un objet, ou région posée). */
function walkZone(z, v, where) {
  if (!z || typeof z !== "object") return;
  v.button(z, "trigger", W(where, L("SBE.Checker.W.Zone")), { prefix: "button:" });
  v.formula(z, "power", "item", W(where, L("SBE.Checker.W.Zone")), { dice: true });
  (Array.isArray(z.effects) ? z.effects : []).forEach(e => {
    v.effect(e, "key", W(where, L("SBE.Checker.W.Zone")));
    v.formula(e, "onlyIf", "actor", W(where, L("SBE.Checker.W.Zone")));
  });
}

/** Réglages de verrou (porte ou coffre). */
function walkLock(cfg, v, where) {
  if (!cfg || typeof cfg !== "object") return;
  v.key(cfg, "lockRollTarget", "actor", where);
  v.key(cfg, "digiRollTarget", "actor", where);
  v.formula(cfg, "lockDiff", "actor", where, { dice: true });
  v.formula(cfg, "digiDiff", "actor", where, { dice: true });
}

/** Entrées du HUD (arbre). */
function walkHudNodes(list, v, where) {
  (Array.isArray(list) ? list : []).forEach(n => {
    if (!n || typeof n !== "object") return;
    const w = W(where, n.label || n.key);
    if (["value", "button", "slot", "list"].includes(n.type)) v.key(n, "key", "self", w);
    if (n.type === "list") v.key(n, "groupBy", "item", w);
    if (n.type === "menu") walkHudNodes(n.children, v, where);
  });
}

/* ============================================================ */
/*  1. Les modèles (atelier)                                     */
/* ============================================================ */

function walkTemplate(data, v, ctx, ctn) {
  const ren = ctx?.rename;
  const mine = ren && ren.templates.has(ctn.templateId) && ren.fam === ctn.family;
  /* Renommage dans un AUTRE modèle coché : la clé de son composant. */
  if (mine) {
    const taken = [...walkAll(data.elements)].some(el => el?.key === ren.nw);
    for (const el of walkAll(data.elements)) {
      if (el?.key === ren.old && !taken) { el.key = ren.nw; data.__changed = true; }
    }
  }
  /* Objet non identifié : la clé « identifié » du modèle. */
  if (data.unid) v.key(data.unid, "key", "self", L("SBE.Unid.Opt"));
  /* Onglets du modèle : leur « Visible si ». */
  for (const t of Array.isArray(data.extraTabs) ? data.extraTabs : []) {
    v.formula(t, "visibleIf", "self", W(t.name || L("SBE.Template.NewTabName"), L("SBE.Checker.W.VisibleIf")));
  }
  for (const el of walkAll(data.elements)) {
    if (!el || typeof el !== "object") continue;
    const w = el.label || el.key || L(`SBE.Template.Kind.${el.kind}`);
    const c = el.config ?? {};
    v.formula(el, "visibleIf", "self", W(w, L("SBE.Checker.W.VisibleIf")));
    v.formula(c, "formula", "self", W(w, L("SBE.Checker.W.Formula")));
    v.formula(c, "bonusFormula", "self", W(w, L("SBE.Checker.W.Bonus")));
    v.formula(c, "maxFormula", "self", W(w, L("SBE.Checker.W.Max")));
    if (c.overflow && typeof c.overflow === "object") for (const k of ["low", "high"]) v.key(c.overflow, k, "self", w);
    if (c.roll && typeof c.roll === "object") {
      const rw = W(w, L("SBE.Checker.W.Roll"));
      v.formula(c.roll, "formula", "self", rw, { dice: true });
      for (const k of ["critS", "critF"]) {
        if (c.roll[k]?.mode === "formula") v.formula(c.roll[k], "expr", "self", rw);
        else if (c.roll[k]?.mode === "cond") v.formula(c.roll[k], "expr", "self", rw, { vars: ROLL_COND_VARS });
      }
      if (typeof c.roll.target === "string" && c.roll.target.trim() && !Number.isFinite(Number(c.roll.target))) v.key(c.roll, "target", "self", rw);
      /* Après le jet : la ressource est sur le personnage qui paie. */
      const af = c.roll.after;
      if (af && typeof af === "object") {
        v.key(af, "key", "actor", rw);
        v.formula(af, "uses", "self", rw);
        (Array.isArray(af.actions) ? af.actions : []).forEach(a => {
          if (!a) return;
          v.formula(a, "cost", "self", rw);
          v.formula(a, "max", "self", rw);
          v.formula(a, "value", "self", rw, { dice: a.type === "dice" });
        });
      }
    }
    if (el.kind === "level") walkLevel(c, v, w);
    if (el.kind === "talents") walkTalents(c, v, w, ctn.family === "item" ? "actor" : "self");
    if (c.tt && typeof c.tt === "object") v.text(c.tt, "text", "self", W(w, L("SBE.Checker.W.Tooltip")));
    if (typeof c.code === "string") v.text(c, "code", "self", w);
    if (Array.isArray(c.entries)) c.entries.forEach((_e, i) => v.entry(c.entries, i, "self", w));
    v.key(c, "listKey", "self", w);
    v.key(c, "compatKey", "self", w);
    v.key(c, "chargesKey", "self", w);
    /* Composant du modèle (panneau d'objet posé) : la clé qu'il affiche. */
    v.key(c, "refKey", "self", w);
    v.key(c, "catKey", "item", w);
    v.key(c, "subKey", "item", w);
    /* Conteneur en fiches : verrou, dépliant, jauge et conditions des colonnes (lus sur les objets). */
    if (c.display === "cards") {
      v.formula(c, "cardLock", "item", w);
      v.formula(c, "cardDesc", "item", w);
      v.key(c, "cardGauge", "item", w);
      if (Array.isArray(c.cols)) c.cols.forEach(col => v.formula(col, "showIf", "item", w));
    }
    if (c.filterType === "key") v.key(c, "filterKey", "item", w);
    if (Array.isArray(c.axes)) c.axes.forEach(a => v.key(a, "key", "self", w));
    if (c.action === "steps") walkSteps(c.steps, v, w);
    /* Se lance tout seul : sa formule, sa condition, l'effet écouté. */
    if (c.auto && typeof c.auto === "object") {
      v.formula(c.auto, "formula", "self", w);
      v.formula(c.auto, "onlyIf", "self", w);
      v.effect(c.auto, "effect", w);
      /* Avant qu'une valeur baisse : la valeur surveillée (porteur) et la nouvelle baisse. */
      v.key(c.auto, "watchKey", "actor", w);
      v.formula(c.auto, "newDrop", "self", w);
    }
  }
  /* Objet de scène : condition, déclencheurs (boutons par clé, filtre). */
  if (data.propCfg && typeof data.propCfg === "object") {
    const pw = L("SBE.Prop.Opt");
    v.formula(data.propCfg, "propIf", "self", pw);
    v.formula(data.propCfg, "dropIf", "item", pw);
    if (String(data.propCfg.apBtn ?? "").trim()) v.button(data.propCfg, "apBtn", pw);
    if (String(data.propCfg.dropBtn ?? "").trim()) v.button(data.propCfg, "dropBtn", pw);
    /* Piège : formules lues sur le piège, boutons d'effet. */
    if (data.propCfg.trOn) {
      const tw = L("SBE.Trap.Group");
      for (const k of ["trDetDc", "trDodgeDc", "trDodgeIf", "trDisarmDc"]) v.formula(data.propCfg, k, "self", tw);
      for (const k of ["trBtn", "trDodgeBtn"]) if (String(data.propCfg[k] ?? "").trim()) v.button(data.propCfg, k, tw);
    }
  }
  if (data.iconMarks) {
    const mw = L("SBE.Checker.W.Marks");
    for (const m of data.iconMarks.marks ?? []) {
      v.braces(m, "text", "self", mw);
      for (const f of ["val", "value", "max", "when"]) v.formula(m, f, "self", mw);
    }
    for (const h of data.iconMarks.halo ?? []) v.formula(h, "when", "self", mw);
  }
  (data.grants ?? []).forEach(g => {
    v.effect(g, "effect", L("SBE.Checker.W.Grants"));
    v.formula(g, "onlyIf", "self", L("SBE.Checker.W.Grants"));
  });
  if (data.tokenBars) walkTokenBars(data.tokenBars.bars, v, "self");
  if (data.hud) {
    const hw = L("SBE.Checker.W.Hud");
    walkHudNodes(data.hud.nodes, v, hw);
    (data.hud.minis ?? []).forEach(m => {
      if (m?.kind === "sheet") v.key(m, "key", "self", W(hw, m.label || m.key));
      else {
        v.button(m, "key", W(hw, m.label || m.key));
        v.formula(m, "onIf", "item", W(hw, m.label || m.key));
      }
    });
  }
}

/** Barres de jetons : valeur, bornes, condition, paliers. */
function walkTokenBars(bars, v, scope) {
  (Array.isArray(bars) ? bars : []).forEach((b, i) => {
    if (!b || typeof b !== "object") return;
    const w = W(L("SBE.Checker.W.Bars"), b.label || L("SBE.Checker.W.Step", { n: i + 1 }));
    const vars = ["value", "max", "min", "pct"];
    for (const f of ["value", "max", "min"]) v.formula(b, f, scope, w);
    v.formula(b, "visibleIf", scope, w, { vars });
    (Array.isArray(b.steps) ? b.steps : []).forEach(st => { if (st?.when === "formula") v.formula(st, "formula", scope, w, { vars }); });
  });
}

/** Clés à jet des modèles de personnage. */
function actorRollKeys() {
  const out = new Set();
  for (const t of game.actors?.filter(a => a.type === "template") ?? []) {
    for (const el of walkAll(t.system?.elements ?? [])) if (el?.key && el.config?.roll?.on) out.add(el.key);
  }
  return out;
}

/** Tous les composants, enfants et colonnes compris (copie modifiable). */
function* walkAll(list) {
  for (const el of Array.isArray(list) ? list : []) {
    if (!el || typeof el !== "object") continue;
    yield el;
    if (Array.isArray(el.children)) yield* walkAll(el.children);
    if (Array.isArray(el.cols)) for (const col of el.cols) yield* walkAll(col);
  }
}

registerRefSource("templates", () => {
  const out = [];
  for (const [fam, coll] of [["actor", game.actors], ["item", game.items]]) {
    for (const tpl of coll?.filter(d => d.type === "template") ?? []) {
      const ctn = {
        id: `tpl:${tpl.uuid}`,
        label: L(fam === "actor" ? "SBE.Checker.TplActor" : "SBE.Checker.TplItem", { name: tpl.name }),
        family: fam,
        templateId: tpl.id,
        doc: tpl,
        open: () => tpl.sheet?.render(true),
        read: () => {
          const s = tpl.system ?? {};
          return { elements: clone(s.elements ?? []), grants: clone(s.grants ?? []), iconMarks: clone(s.iconMarks ?? {}), hud: s.hud && Object.keys(s.hud).length ? clone(s.hud) : null,
            tokenBars: fam === "actor" && s.tokenBars && Object.keys(s.tokenBars).length ? clone(s.tokenBars) : null,
            propCfg: fam === "item" && s.propCfg && Object.keys(s.propCfg).length ? clone(s.propCfg) : null,
            unid: fam === "item" && s.opts?.unid && s.opts.unidKey ? { key: s.opts.unidKey } : null };
        },
        write: (data) => {
          const upd = {
            "system.elements": data.elements,
            "system.structVersion": (tpl.system.structVersion ?? 0) + 1
          };
          if (fam === "item") { upd["system.grants"] = data.grants; upd["system.iconMarks"] = data.iconMarks; }
          if (data.hud) upd["system.hud"] = data.hud;
          if (data.tokenBars) upd["system.tokenBars"] = data.tokenBars;
          if (data.propCfg) upd["system.propCfg"] = data.propCfg;
          if (data.unid?.key) upd["system.opts.unidKey"] = data.unid.key;
          return tpl.update(upd);
        },
        walk: (data, v, ctx) => walkTemplate(data, v, ctx, ctn)
      };
      out.push(ctn);
    }
  }
  return out;
});

/* ============================================================ */
/*  2. Gestionnaire d'effets                                     */
/* ============================================================ */

registerRefSource("tokenBars", () => [
  settingContainer("set:tokenBars", "tokenBars", L("SBE.Bars.Title"), () => openMenu("tokenBarsMenu"),
    (data, v) => walkTokenBars(data?.bars, v, "actor"))
]);

registerRefSource("effects", () => [
  settingContainer("set:effects", "effects", L("SBE.Checker.Src.Effects"), () => openMenu("effectsMenu"),
    (data, v) => (Array.isArray(data) ? data : []).forEach(d => walkEffectDef(d, v, "")),
    { effectKeys: () => (game.settings.get(SYSTEM_ID, "effects") ?? []).map(d => d?.key).filter(Boolean) })
]);

/* ============================================================ */
/*  3. Combat, échanges, nouvelle journée, coffres               */
/* ============================================================ */

registerRefSource("combat", () => [
  settingContainer("set:combat", "combat", L("SBE.Checker.Src.Combat"), () => openMenu("combatMenu"), (data, v) => {
    if (!data) return;
    v.key(data, "damageKey", "actor", L("SBE.Checker.W.DamageKey"));
    (data.types ?? []).forEach(t => v.key(t, "reduceKey", "actor", W(L("SBE.Checker.W.DmgTypes"), t?.name)));
    const ini = data.init;
    if (ini) {
      const iw = L("SBE.Checker.W.Init");
      for (const src of [ini, ...(Array.isArray(ini.models) ? ini.models : [])]) {
        v.key(src, "key", "actor", iw);
        v.formula(src, "formula", "actor", iw, { dice: true });
      }
      v.formula(ini, "tie", "actor", iw);
      if (ini.passes) { v.formula(ini.passes, "step", "actor", iw); v.formula(ini.passes, "min", "actor", iw); }
    }
    (data.profiles ?? []).forEach(p => {
      const vars = (Array.isArray(p?.options) ? p.options : []).map(o => o?.key).filter(Boolean);
      walkAttack(p, v, W(L("SBE.Checker.W.Profile"), p?.name), vars, "item");
    });
  }, {
    profileNames: () => (game.settings.get(SYSTEM_ID, "combat")?.profiles ?? []).map(p => p?.name).filter(Boolean),
    varNames: () => (game.settings.get(SYSTEM_ID, "combat")?.profiles ?? []).flatMap(p => (p?.options ?? []).map(o => o?.key)).filter(Boolean)
  })
]);

registerRefSource("bodies", () => [
  settingContainer("set:bodies", "bodies", L("SBE.Checker.Src.Bodies"), () => openMenu("bodiesMenu"), (data, v) => {
    (Array.isArray(data) ? data : []).forEach(b => (Array.isArray(b?.zones) ? b.zones : []).forEach(z => {
      if (!z) return;
      const w = W(b.name, z.name);
      v.key(z, "dmgKey", "actor", w);
      v.key(z, "protKey", "actor", w);
      v.formula(z, "mult", "actor", w);
      v.formula(z, "aim", "item", w);
    }));
  })
]);

registerRefSource("trade", () => [
  settingContainer("set:trade", "tradeConfig", L("SBE.Checker.Src.Trade"), () => openMenu("tradeMenu"),
    (data, v) => v.key(data, "moneyKey", "actor", L("SBE.Checker.W.Money")))
]);

registerRefSource("languages", () => [
  settingContainer("set:languages", "languages", L("SBE.Checker.Src.Languages"),
    async () => (await import("../languages/language-app.mjs")).SBELanguageApp.open(), (data, v) => {
      (Array.isArray(data?.list) ? data.list : []).forEach(l => {
        if (!l) return;
        v.formula(l, "key", "actor", l.name);
        if (l.decipher) { v.key(l.decipher, "key", "actor", l.name); v.formula(l.decipher, "difficulty", "actor", l.name); }
      });
    })
]);

registerRefSource("newday", () => [
  settingContainer("set:newday", "newDay", L("SBE.Checker.Src.NewDay"),
    async () => (await import("../newday/newday-manager.mjs")).SBENewDayApp.open(), (data, v) => {
      if (!data) return;
      const lines = (list, w) => (Array.isArray(list) ? list : []).forEach(l => { v.key(l, "key", "actor", w); v.formula(l, "amount", "actor", w); });
      lines(data.common, L("SBE.Checker.W.Common"));
      (data.tiers ?? []).forEach(t => lines(t?.lines, t?.name));
      lines(data.rate, L("SBE.Checker.W.Rate"));
    })
]);

registerRefSource("calendar", () => [
  settingContainer("set:calendar", "calendars", L("SBE.Checker.Src.Calendar"), () => openMenu("calendarMenu"), (data, v) => {
    (Array.isArray(data?.weather) ? data.weather : []).forEach(w => { if (w?.effect) v.effect(w, "effect", W(L("SBE.Cal.Tab_weather"), w.name)); });
  })
]);

registerRefSource("chestDefaults", () => [
  settingContainer("set:chestDefaults", "chestDefaults", L("SBE.Checker.Src.ChestDefaults"), () => null, (data, v) => {
    if (!data) return;
    v.key(data, "moneyKey", "actor", L("SBE.Checker.W.Money"));
    v.key(data, "weightKey", "item", L("SBE.Checker.W.Weight"));
    walkLock(data, v, L("SBE.Checker.W.Lock"));
  })
]);

/* ============================================================ */
/*  4. Objets (réglages propres à l'objet : lumière, effets,     */
/*     zone) — objets du monde et objets portés                   */
/* ============================================================ */

function itemContainers(item, owner = "") {
  const f = item.flags?.[SYSTEM_ID] ?? {};
  if (!f.lightSource && !f.localEffects?.length && !f.effectRules?.length && !f.zone) return null;
  return {
    id: `item:${item.uuid}`,
    label: owner ? L("SBE.Checker.ItemOf", { name: item.name, owner }) : L("SBE.Checker.Item", { name: item.name }),
    doc: item,
    open: () => item.sheet?.render(true),
    read: () => {
      const g = item.flags?.[SYSTEM_ID] ?? {};
      return { lightSource: clone(g.lightSource), localEffects: clone(g.localEffects), effectRules: clone(g.effectRules), zone: clone(g.zone) };
    },
    write: (data) => {
      const upd = {};
      for (const k of ["lightSource", "localEffects", "effectRules", "zone"]) if (data[k] !== null && data[k] !== undefined) upd[`flags.${SYSTEM_ID}.${k}`] = data[k];
      return item.update(upd, { render: false });
    },
    walk: (data, v) => {
      walkLightSource(data.lightSource, v, L("SBE.Checker.W.LightTab"));
      (data.localEffects ?? []).forEach(d => walkEffectDef(d, v, L("SBE.Checker.W.OwnEffects")));
      (data.effectRules ?? []).forEach(r => {
        const w = L("SBE.Checker.W.OwnEffects");
        v.effect(r, "effect", w, { local: true });
        v.button(r, "when", w, { prefix: "button:" });
        v.formula(r, "onlyIf", "item", w);
      });
      walkZone(data.zone, v, "");
    },
    effectKeys: () => (item.flags?.[SYSTEM_ID]?.localEffects ?? []).map(d => d?.key).filter(Boolean)
  };
}

registerRefSource("items", () => {
  const out = [];
  for (const i of game.items ?? []) if (i.type !== "template") out.push(itemContainers(i));
  for (const a of game.actors ?? []) for (const i of a.items ?? []) out.push(itemContainers(i, a.name));
  return out;
});

/* ============================================================ */
/*  5. Effets posés sur les personnages (copie de leur réglage)  */
/* ============================================================ */

registerRefSource("actorEffects", () => {
  const out = [];
  for (const a of game.actors ?? []) {
    for (const ae of a.effects ?? []) {
      const def = ae.flags?.[SYSTEM_ID]?.def;
      if (!def || typeof def !== "object") continue;
      out.push({
        id: `ae:${ae.uuid}`,
        label: L("SBE.Checker.ActorEffect", { name: ae.name, owner: a.name }),
        doc: ae,
        open: () => a.sheet?.render(true),
        read: () => clone(ae.flags?.[SYSTEM_ID]?.def),
        write: (data) => ae.update({ [`flags.${SYSTEM_ID}.def`]: data }),
        walk: (data, v) => walkEffectDef(data, v, "")
      });
    }
  }
  return out;
});

/* ============================================================ */
/*  6. Scènes : portes, coffres, zones posées, barres de jetons  */
/* ============================================================ */

registerRefSource("scenes", () => {
  const out = [];
  for (const sc of game.scenes ?? []) {
    for (const wall of sc.walls ?? []) {
      const cfg = wall.flags?.[SYSTEM_ID]?.config;
      if (!cfg) continue;
      out.push({
        id: `wall:${wall.uuid}`, label: L("SBE.Checker.Door", { scene: sc.name }), doc: wall,
        open: () => wall.sheet?.render(true),
        read: () => clone(wall.flags?.[SYSTEM_ID]?.config),
        write: (data) => wall.update({ [`flags.${SYSTEM_ID}.config`]: data }),
        walk: (data, v) => walkLock(data, v, L("SBE.Checker.W.Lock"))
      });
    }
    /* Coffres : pions d'objets posés (réglages dans leurs flags). */
    for (const tile of sc.tokens ?? []) {
      const f = tile.flags?.[SYSTEM_ID];
      if (!f?.isChest) continue;
      out.push({
        id: `token:${tile.uuid}`, label: L("SBE.Checker.Chest", { name: f.chestName || tile.name || tile.id, scene: sc.name }), doc: tile,
        open: () => canvas.scene?.id === sc.id && tile.object ? canvas.animatePan?.({ x: tile.object.center.x, y: tile.object.center.y }) : sc.view?.(),
        read: () => {
          const g = tile.flags?.[SYSTEM_ID] ?? {};
          return { moneyKey: g.moneyKey, weightKey: g.weightKey, lockRollTarget: g.lockRollTarget, digiRollTarget: g.digiRollTarget, lockDiff: g.lockDiff, digiDiff: g.digiDiff };
        },
        write: (data) => {
          const upd = {};
          for (const [k, val] of Object.entries(data)) if (val !== undefined) upd[`flags.${SYSTEM_ID}.${k}`] = val;
          return tile.update(upd);
        },
        walk: (data, v) => {
          v.key(data, "moneyKey", "actor", L("SBE.Checker.W.Money"));
          v.key(data, "weightKey", "item", L("SBE.Checker.W.Weight"));
          walkLock(data, v, L("SBE.Checker.W.Lock"));
        }
      });
    }
    for (const region of sc.regions ?? []) {
      if (!region.flags?.[SYSTEM_ID]?.zone) continue;
      out.push({
        id: `region:${region.uuid}`, label: L("SBE.Checker.Region", { name: region.name, scene: sc.name }), doc: region,
        open: () => region.sheet?.render(true),
        read: () => clone(region.flags?.[SYSTEM_ID]?.zone),
        write: (data) => region.update({ [`flags.${SYSTEM_ID}.zone`]: data }),
        walk: (data, v) => walkZone(data, v, "")
      });
    }
    for (const td of sc.tokens ?? []) {
      if (!String(td.bar1?.attribute ?? "").startsWith("values.") && !String(td.bar2?.attribute ?? "").startsWith("values.")) continue;
      out.push({
        id: `token:${td.uuid}`, label: L("SBE.Checker.Token", { name: td.name, scene: sc.name }), doc: td,
        open: () => td.sheet?.render(true),
        read: () => ({ bar1: { attribute: td.bar1?.attribute ?? "" }, bar2: { attribute: td.bar2?.attribute ?? "" } }),
        write: (data) => td.update({ "bar1.attribute": data.bar1.attribute, "bar2.attribute": data.bar2.attribute }),
        walk: (data, v) => { v.attr(data.bar1, "attribute", "actor", L("SBE.Checker.W.Bars")); v.attr(data.bar2, "attribute", "actor", L("SBE.Checker.W.Bars")); }
      });
    }
  }
  /* Jeton par défaut des personnages. */
  for (const a of game.actors ?? []) {
    if (a.type === "template") continue;
    const pt = a.prototypeToken;
    if (!String(pt?.bar1?.attribute ?? "").startsWith("values.") && !String(pt?.bar2?.attribute ?? "").startsWith("values.")) continue;
    out.push({
      id: `proto:${a.uuid}`, label: L("SBE.Checker.Proto", { name: a.name }), doc: a,
      open: () => a.sheet?.render(true),
      read: () => ({ bar1: { attribute: pt.bar1?.attribute ?? "" }, bar2: { attribute: pt.bar2?.attribute ?? "" } }),
      write: (data) => a.update({ "prototypeToken.bar1.attribute": data.bar1.attribute, "prototypeToken.bar2.attribute": data.bar2.attribute }),
      walk: (data, v) => { v.attr(data.bar1, "attribute", "actor", L("SBE.Checker.W.Bars")); v.attr(data.bar2, "attribute", "actor", L("SBE.Checker.W.Bars")); }
    });
  }
  return out;
});

/* ============================================================ */
/*  Quêtes : stats configurées et objectifs « Fait si »          */
/* ============================================================ */

registerRefSource("quests", () => {
  const out = [];
  for (const j of game.journal ?? []) {
    if (!j.flags?.[SYSTEM_ID]?.questConfig) continue;
    out.push({
      id: `questcfg:${j.uuid}`, label: L("SBE.Checker.QuestJournal", { name: j.name }), doc: j,
      open: () => j.sheet?.render(true),
      read: () => clone(j.flags[SYSTEM_ID].questConfig),
      write: (data) => j.update({ [`flags.${SYSTEM_ID}.questConfig`]: data }),
      walk: (data, v) => {
        (data?.stats ?? []).forEach(st => v.key(st, "key", "actor", L("SBE.Checker.W.QuestRewards")));
        (data?.penalties?.stats ?? []).forEach(st => v.key(st, "key", "actor", L("SBE.Checker.W.QuestPenalties")));
      }
    });
    for (const p of j.pages) {
      if (p.type !== "quete") continue;
      out.push({
        id: `quest:${p.uuid}`, label: L("SBE.Checker.Quest", { name: p.name, journal: j.name }), doc: p,
        open: () => p.sheet?.render(true),
        read: () => clone({ objectives: p.system.objectives, rewards: p.system.rewards, penalties: p.system.penalties, revealIf: p.system.revealIf }),
        write: (data) => p.update({ "system.objectives": data.objectives, "system.rewards": data.rewards, "system.penalties": data.penalties, "system.revealIf": data.revealIf }),
        walk: (data, v) => {
          v.formula(data, "revealIf", "actor", L("SBE.Quest.RevealIf"));
          (data?.objectives ?? []).forEach(o => { if (o?.auto) v.formula(o.auto, "formula", "actor", W(L("SBE.Checker.W.Objective"), o.label)); });
          (data?.rewards?.values ?? []).forEach(x => v.key(x, "key", "actor", L("SBE.Checker.W.QuestRewards")));
          (data?.penalties?.values ?? []).forEach(x => v.key(x, "key", "actor", L("SBE.Checker.W.QuestPenalties")));
        }
      });
    }
  }
  return out;
});

/* ============================================================ */
/*  Traces au sol : condition, clé surveillée, clé de couleur    */
/* ============================================================ */

registerRefSource("traces", () => [{
  id: "traces", label: L("SBE.Traces.Title"),
  open: async () => (await import("../traces/trace-config.mjs")).SBETraceConfig.open(),
  read: () => clone(game.settings.get(SYSTEM_ID, "traceTypes")?.types ?? []),
  write: (data) => game.settings.set(SYSTEM_ID, "traceTypes", { types: data }),
  walk: (data, v) => {
    for (const t of (Array.isArray(data) ? data : [])) {
      const w = L("SBE.Traces.Title") + " — " + (t.name ?? "?");
      if (t.impact) v.key(t.impact, "key", "actor", w);
      if (t.trail) v.key(t.trail, "key", "actor", w);
      if (t.drag) v.key(t.drag, "key", "actor", w);
      /* Effets qui déclenchent l'impact ou la traînée. */
      for (const part of [t.impact, t.trail]) {
        const list = Array.isArray(part?.effects) ? part.effects : [];
        for (let i = 0; i < list.length; i++) v.effect(list, i, w);
      }
      if (t.color && t.id !== "blood") v.key(t.color, "key", "actor", w);
    }
  }
}]);

/* Règles d'empreintes : le critère « Clé » vise une clé de personnage. */
registerRefSource("traceFootprints", () => [{
  id: "traceFootprints", label: L("SBE.Traces.Title") + " — " + L("SBE.Traces.FpSection"),
  open: async () => (await import("../traces/trace-config.mjs")).SBETraceConfig.open(),
  read: () => clone(game.settings.get(SYSTEM_ID, "traceFootprints")?.rules ?? []),
  write: (data) => game.settings.set(SYSTEM_ID, "traceFootprints", { rules: data }),
  walk: (data, v) => {
    const w = L("SBE.Traces.Title") + " — " + L("SBE.Traces.FpSection");
    for (const r of (Array.isArray(data) ? data : [])) if (r?.kind === "key") v.key(r, "key", "actor", w);
  }
}]);
