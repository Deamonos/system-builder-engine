/**
 * SBE — JET D'UN CHAMP
 *
 * Le jet configuré sur un champ (crayon → Jet de dés) : formule, clés
 * remplacées par @clé, identifiants de jet, comparaison, seuils
 * critiques, application au champ, message de chat.
 *
 * Sorti de la fiche pour qu'il n'y en ait qu'UN : le clic sur le
 * libellé d'un champ et l'étape « Jet » d'un bouton lancent exactement
 * ce même code, et reçoivent la même ISSUE (réussite, échec,
 * critiques) — celle qu'écoutera la table des déclencheurs média.
 */

import { messageModeChoices, cleanVis, visOptions, visDefaultMode } from "./roll-visibility.mjs";
import { walkElements } from "./element-renderer.mjs";
import { buildScope, computeAll, evalExpression, rollableFormula } from "./formula-engine.mjs";
import { docContext } from "./doc-context.mjs";
import { ChatCards } from "../managers/chat/chat-cards.mjs";
import { Identity } from "../helpers/identity.mjs";
import { SYSTEM_ID } from "../helpers/constants.mjs";
import { cleanAfter, afterFor, freshState, choices as afterChoices, play as afterPlay, runNow as afterNow, canClick as afterCanClick, totalOf as afterTotal, cardHtml as afterHtml } from "./roll-after.mjs";

/* CLÉS À EFFET lues par le jet (comme « jet_<identifiant> ») : une clé
   seule vaut pour tous les jets, « clé_<identifiant> » pour les jets
   qui portent cet identifiant. Un effet (posé, ou conféré par un objet
   porté) les fait vivre ; le jet d'un objet lit aussi son porteur.
     avantage            > 0 avantage imposé, < 0 désavantage imposé
                         (les deux à la fois : normal imposé) ;
     sans_echec_critique > 0 : un échec critique devient un échec. */
export const ADV_KEY = "avantage";
export const NO_CRIT_KEY = "sans_echec_critique";

/** Les valeurs d'une clé à effet pour ce jet (la clé seule, puis par identifiant). */
function imposedValues(scope, base, ids) {
  const read = (k) => {
    const own = Number(scope[k]);
    let v = Number.isFinite(own) ? own : 0;
    /* Jet d'un objet : la fiche de son porteur. */
    if (typeof scope.carrier === "function") {
      const c = Number(scope.carrier(k));
      if (Number.isFinite(c)) v += c;
    }
    /* Jet d'une fiche : ses objets portés (une compétence, un équipement
       dont la case « avantage_mentale » est cochée), comme leurs bonus. */
    if (typeof scope.carried === "function") {
      const c = Number(scope.carried(k));
      if (Number.isFinite(c)) v += c;
    }
    return v;
  };
  return [base, ...ids.map(id => `${base}_${id}`)].map(read).filter(v => v !== 0);
}

/** Identifiants lus pour l'avantage imposé et l'échec critique évité :
    la clé du champ elle-même (« avantage_acrobatie »), puis ses
    identifiants de jet. */
export function imposedIds(key, cfg) {
  return [...new Set([key, ...(Array.isArray(cfg?.ids) ? cfg.ids : [])].map(x => String(x ?? "").trim()).filter(Boolean))];
}

/** Réglage du MJ : l'avantage imposé est verrouillé dans la fenêtre de
    jet (sinon il y est seulement choisi d'avance, modifiable). */
function advLocked() {
  try { return game.settings.get(SYSTEM_ID, "rollAdvLock") !== false; } catch (_e) { return true; }
}

/** Avantage imposé : 1, -1, 0 (normal imposé) ou null (libre). */
export function imposedAdv(scope, ids = [], extra = null) {
  const vals = imposedValues(scope, ADV_KEY, ids);
  /* Avantage demandé par celui qui lance (étape « Jet de résistance ») :
     il compte comme un avantage imposé de plus. */
  if (extra === 1 || extra === -1) vals.push(extra);
  const up = vals.some(v => v > 0);
  const down = vals.some(v => v < 0);
  if (!up && !down) return null;
  return up && down ? 0 : (up ? 1 : -1);
}

/**
 * Lance le jet du champ `key` de ce document (fiche ou objet).
 * `spec` : un jet qui n'est sur aucun champ ({ formula, dialog, vis… },
 * même forme que le jet d'un champ) — l'initiative écrite en formule
 * passe par ce même chemin (fenêtre, apports, carte).
 * @returns {Promise<{roll: Roll, outcome: string}|null>}
 *   outcome : "success" | "failure" | "critSuccess" | "critFailure" | "done"
 */
export async function rollField(doc, key, { difficulty = 0, title = "", ask = false, post = true, note = "", options = [], difficultyFn = null, preset = null, goal: goalOverride = null, bonuses = [], vis: visOverride = null, spec = null, after: afterMode = "none", resume = null, adv: advIn = null } = {}) {
  const tpl = doc?.system?.template;
  if ((!key && !spec) || !tpl) return null;
  const el = key ? [...walkElements(tpl.system.elements ?? [])].find(e => e?.key === key) : null;
  const cfg = spec ?? el?.config?.roll;
  if (!cfg?.formula || (!spec && !cfg.on)) return null;

  const esc = (v) => foundry.utils.escapeHTML(String(v ?? ""));
  const values = doc.system.values ?? {};
  const ctx = docContext(doc);
  const scope = buildScope(tpl.system.elements ?? [], values, ctx);

  /* Clés nues → @clé, pour que Foundry les résolve et que la formule
     reste lisible dans le message de chat. */
  let formula = rollableFormula(String(cfg.formula), scope);

  /* --- IDENTIFIANTS DE JET ---
     Un jet peut porter des étiquettes libres (« physique », « talent »).
     Pour chacune, la clé réservée « jet_<étiquette> » du modèle, si
     elle existe, s'ajoute au jet. C'est le même principe de réservoir
     que « clé_bonus » : le MJ la renseigne à la main ou par formule,
     et le registre d'apports l'alimente (effets aujourd'hui ;
     équipement, compétences demain). */
  const rollIds = Array.isArray(cfg.ids) ? cfg.ids : [];
  const idMods = [];
  for (const id of rollIds) {
    const mk = `jet_${id}`;
    const mv = Number(scope[mk]);
    if (Number.isFinite(mv) && mv !== 0) {
      const src = [...walkElements(tpl.system.elements ?? [])].find(e => e?.key === mk);
      idMods.push({ id, val: mv, label: src?.label || id });
    }
  }
  const idTotal = idMods.reduce((a, m) => a + m.val, 0);
  /* SENS DE L'APPORT : un bonus doit TOUJOURS aider. Quand les hauts
     sont bons (attaque), il s'ajoute au dé ; quand les bas sont bons
     (jet sous une valeur), l'ajouter au dé serait une pénalité — il
     relève alors le SEUIL à atteindre. Le joueur écrit « +10 » et il
     est aidé, sans avoir à raisonner à l'envers. */
  const cmpMode = cfg.compare ?? "none";
  /* Deux sens : les BAS sont bons (jet sous une valeur, sous une
     cible) ou les HAUTS sont bons (atteindre une valeur, une cible —
     une attaque « 1d100 + score contre une difficulté »). */
  const lowIsGood = cmpMode === "under" || cmpMode === "target";
  let goalBonus = 0;
  if (idTotal) {
    if (lowIsGood) goalBonus = idTotal;
    else formula = `(${formula}) + ${idTotal}`;
  }

  /* --- Comparaison (facultative) --- */
  const own = key ? Number(scope[key] ?? 0) : 0;
  const hasCmp = !!(cfg.compare && cfg.compare !== "none");
  /* « over » = les hauts sont bons (attaque) ; sinon les bas sont
     bons (jets sous une valeur). Les seuils critiques suivent ce
     même sens, sans quoi ils voudraient dire l'inverse. */
  const highGood = cfg.compare === "over" || cfg.compare === "targetOver";
  let goal = own;
  if (hasCmp && (cfg.compare === "target" || cfg.compare === "targetOver")) {
    const raw = String(cfg.target ?? "").trim();
    goal = Number.isFinite(Number(raw)) ? Number(raw) : Number(scope[raw] ?? 0);
  }
  /* SEUIL imposé de l'extérieur (difficulté d'un verrou…) : il remplace
     la valeur à comparer, dans le sens du jet. */
  if (hasCmp && goalOverride !== null && goalOverride !== "" && Number.isFinite(Number(goalOverride))) goal = Number(goalOverride);

  /* --- FENÊTRE DE JET (options cochées par le MJ sur l'élément) ---
     Ne s'ouvre qu'au clic d'un joueur (ask), jamais pour un jet
     automatique (résistance d'un effet). */
  const dlg = cfg.dialog ?? {};
  /* Visibilité du message : réglée sur le jet (ou imposée par l'appelant). */
  const vis = visOverride ?? cleanVis(cfg.vis);
  let pick = { adv: 0, mod: 0, goal: null, mode: null, options: {} };
  /* OPTIONS D'ATTAQUE (profil du manager Combat, ou l'arme) : elles
     ouvrent la fenêtre même sans autre ligne cochée. */
  const extra = Array.isArray(options) ? options.filter(o => o?.key) : [];
  /* Fenêtre déjà remplie AVANT la visée (attaque) : on la reprend.
     Reprise d'une carte (relance après coup) : les mêmes choix. */
  if (resume) {
    pick = { adv: 0, mod: 0, goal: null, mode: null, options: {}, ...(resume.pick ?? {}) };
  } else if (preset) {
    pick = { adv: 0, mod: 0, goal: null, mode: null, options: {}, ...preset };
  } else if (ask && (dlg.adv || dlg.mod || (dlg.target && hasCmp) || (dlg.mode && visOptions(vis).list.length > 1) || extra.length)) {
    const res = await askRollOptions(dlg, {
      title: title || cfg.label || el?.label || key, hasCmp, goal, extra, vis, scope, forced: imposedAdv(scope, imposedIds(key, cfg), advIn)
    });
    if (!res) return null;               /* fenêtre fermée : pas de jet */
    pick = res;
  } else if (extra.length) {
    pick.options = defaultOptionValues(extra);
  }
  /* Sans fenêtre (ou sans liste) : la visibilité par défaut du jet. */
  if (!pick.mode) pick.mode = visDefaultMode(vis);
  /* Avantage IMPOSÉ (effet, case d'un objet porté) : il prime sur le
     choix de la fenêtre — sauf réglage « pré-coché » du MJ, où le
     joueur a pu le changer dans la fenêtre. */
  const forcedAdv = resume ? null : imposedAdv(scope, imposedIds(key, cfg), advIn);
  if (forcedAdv !== null && !pick.advChosen) pick.adv = forcedAdv;
  /* Les options valent comme des clés dans la formule du jet. */
  for (const [k, v] of Object.entries(pick.options ?? {})) {
    scope[k] = v;
    formula = formula.replace(new RegExp(`(?<![@\\w])${k}\\b`, "g"), `@${k}`);
  }
  /* Difficulté qui DÉPEND des options (défense ignorée…) : demandée
     après la fenêtre, avant les dés. null = annuler. */
  if (typeof difficultyFn === "function") {
    const d = await difficultyFn(pick.options ?? {});
    if (d === null) return null;
    difficulty = Number(d) || 0;
  }
  if (pick.goal !== null) goal = pick.goal;
  /* Le modificateur aide toujours, comme les apports d'étiquette. */
  if (pick.mod) {
    if (lowIsGood) goalBonus += pick.mod;
    else formula = `(${formula}) + ${pick.mod}`;
  }
  /* APPORTS NOMMÉS venus de l'appelant (l'outil d'un crochetage, la
     difficulté d'un verrou…) : même sens que le modificateur, et une
     ligne à leur nom sous les dés. */
  const extra2 = (Array.isArray(bonuses) ? bonuses : [])
    .map(b => ({ label: String(b?.label ?? ""), img: b?.img ?? "", val: Number(b?.val) }))
    .filter(b => Number.isFinite(b.val) && b.val !== 0);
  for (const b of extra2) {
    if (lowIsGood) goalBonus += b.val;
    else formula = `(${formula}) + ${b.val}`;
  }

  /* Avantage : N jets, on garde le meilleur (désavantage : le pire),
     « meilleur » suivant le sens du jet. */
  const count = resume ? (Number(resume.count) || 1) : (pick.adv ? Math.max(2, Math.min(10, Number(dlg.advCount) || 2)) : 1);
  const all = resume ? (resume.all ?? []).map(d => Roll.fromData(d)) : [];
  try {
    for (let i = all.length; i < count; i++) {
      const r = new Roll(formula, scope);
      await r.evaluate();
      all.push(r);
    }
  } catch (err) {
    ui.notifications.error(game.i18n.format("SBE.Roll.BadFormula", { msg: err.message }));
    return null;
  }
  const better = (a, b) => (lowIsGood ? a.total < b.total : a.total > b.total);
  let roll = resume?.roll ? Roll.fromData(resume.roll) : all[0];
  if (!resume) {
    for (const r of all) {
      if (pick.adv > 0 ? better(r, roll) : (pick.adv < 0 ? better(roll, r) : false)) roll = r;
    }
  }
  const advKept = roll;

  if (hasCmp) {
    goal += goalBonus;
    /* DIFFICULTÉ (jet de résistance d'un effet…) : rend le jet plus
       dur, dans le bon sens selon la comparaison. */
    const diff = Number(difficulty) || 0;
    if (diff) goal += highGood ? diff : -diff;
  }

  /* --- Seuils critiques (valeur fixe ou formule de la fiche) --- */
  const critVal = (sp) => {
    const raw = String(sp?.expr ?? "").trim();
    if (!sp || sp.mode === "none" || sp.mode === "cond" || !raw) return null;
    const n = (sp.mode === "value") ? Number(raw) : Number(evalExpression(raw, scope));
    return Number.isFinite(n) ? n : null;
  };
  const csT = critVal(cfg.critS);
  const cfT = critVal(cfg.critF);
  /* Un critique ne se déclenche QUE du bon côté du résultat : pas de
     réussite critique sur un jet raté, ni d'échec critique sur un
     jet réussi. Sans comparaison, le seuil parle tout seul.
     CRITIQUES SUR LE DÉ SEUL (option) : on lit le résultat NATUREL
     des dés, sans les bonus — un 98 sur le d100 reste un 98, quel que
     soit le score ajouté. Dans ce cas c'est le dé qui décide : un
     critique emporte le résultat (réussite critique = réussi, échec
     critique = raté), comme le veut la règle du « dé naturel ». */
  const onDie = !!cfg.critDie;
  const natUp = Number.isFinite(Number(cfg.natUp)) && cfg.natUp !== "" && cfg.natUp !== undefined ? Number(cfg.natUp) : null;
  const natDown = Number.isFinite(Number(cfg.natDown)) && cfg.natDown !== "" && cfg.natDown !== undefined ? Number(cfg.natDown) : null;

  /**
   * LE VERDICT d'un jet : r = les dés gardés, rt = leur total avec ce
   * qui a été ajouté après coup (bonus, dés en plus). Rejoué après
   * chaque relance.
   */
  const judge = (r, rt) => {
    let w = hasCmp ? (highGood ? (rt >= goal) : (rt <= goal)) : false;
    const natural = (r.dice ?? []).reduce((t, d) => t + (Number(d.total) || 0), 0);
    const readCrit = onDie ? natural : rt;
    /* MARGE : de combien le jet passe (ou rate) son seuil, toujours
       « plus grand = mieux ». Sert aux oppositions « meilleure réussite »
       et aux critiques par condition. */
    const margin = hasCmp ? (highGood ? rt - goal : goal - rt) : 0;
    /* LECTURE DES DÉS : faces gardées (avantage, dés retirés exclus). */
    const faces = (r.dice ?? []).flatMap(d => (d.results ?? [])
      .filter(x => x.active !== false && !x.discarded).map(x => Number(x.result)));
    /* CRITIQUES PAR CONDITION : une formule vraie / fausse qui lit la
       marge, la difficulté, le dé naturel et les faces (complication
       quand la moitié des dés font 1, critique sur un double…). Elle
       décide du résultat. */
    const condScope = {
      ...scope, rollTotal: rt, natural, goal: hasCmp ? goal : 0, margin, diceCount: faces.length,
      countFace: (lo, hi) => faces.filter(f => (hi === undefined ? f === Number(lo) : f >= Number(lo) && f <= Number(hi))).length,
      hasDouble: () => new Set(faces).size < faces.length
    };
    const condOf = (sp) => (sp?.mode === "cond" && String(sp.expr ?? "").trim()
      ? !!evalExpression(String(sp.expr), condScope) : null);
    const csC = condOf(cfg.critS);
    const cfC = condOf(cfg.critF);
    let crit = "";
    let byCond = false;
    if (csC !== null ? csC : (csT !== null && (onDie || !hasCmp || w)
      && (highGood ? readCrit >= csT : readCrit <= csT))) { crit = "success"; byCond = csC !== null; }
    else if (cfC !== null ? cfC : (cfT !== null && (onDie || !hasCmp || !w)
      && (highGood ? readCrit <= cfT : readCrit >= cfT))) { crit = "failure"; byCond = cfC !== null; }
    if ((onDie || byCond) && hasCmp && crit) w = crit === "success";
    /* LE DÉ NATUREL DÉCALE D'UN CRAN (option) : au plus haut, le
       résultat monte d'un degré (échec → réussite → réussite critique) ;
       au plus bas, il descend. */
    if (hasCmp && (natUp !== null || natDown !== null)) {
      const ladder = ["failure+", "failure", "success", "success+"];
      let i = crit === "failure" ? 0 : crit === "success" ? 3 : (w ? 2 : 1);
      if (natUp !== null && natural >= natUp) i = Math.min(3, i + 1);
      else if (natDown !== null && natural <= natDown) i = Math.max(0, i - 1);
      const step = ladder[i];
      crit = step === "success+" ? "success" : step === "failure+" ? "failure" : "";
      w = i >= 2;
    }
    /* Résultat de la carte (texte, couleur, icône et son : réglés par
       le MJ dans le manager des messages de chat). */
    const cardOutcome = crit === "success" ? "critSuccess"
      : crit === "failure" ? "critFailure"
        : hasCmp ? (w ? "success" : "failure") : "";
    const detail = !cardOutcome ? ""
      : hasCmp
        ? `(${rt} ${highGood ? "≥" : "≤"} ${goal})`
        : (byCond ? `(${rt})`
          : `(${rt} ${crit === "success" ? (highGood ? "≥" : "≤") + " " + csT : (highGood ? "≤" : "≥") + " " + cfT})`);
    /* L'ISSUE, pour qui l'a demandée (un bouton à étapes, une demande
       de jet ; demain la table des déclencheurs média). */
    const outcome = crit === "success" ? "critSuccess"
      : crit === "failure" ? "critFailure"
        : hasCmp ? (w ? "success" : "failure") : "done";
    return { margin, cardOutcome, detail, outcome };
  };

  /* --- APRÈS LE JET : relances et bonus (roll-after.mjs) ---
     « now » : une fenêtre tout de suite, avant la suite ; « card » :
     des boutons sur la carte ; une reprise de carte joue l'action
     cliquée. */
  const after = afterFor(cleanAfter(cfg.after), "roll");
  const ast = resume?.st ? foundry.utils.deepClone(resume.st) : freshState();
  if (after && resume?.action) {
    const c = afterChoices(after, doc, ast, roll).find(x => x.a.id === resume.action && x.ok);
    if (!c) return null;
    roll = await afterPlay(after, c, doc, roll, ast, { formula, scope, better });
  } else if (after && afterMode === "now" && afterCanClick(after, doc)) {
    roll = await afterNow(after, doc, roll, ast, {
      title: title || cfg.label || el?.label || key, formula, scope, better,
      verdict: (r) => {
        const t = afterTotal(r, ast);
        const j = judge(r, t);
        return { total: t, text: j.cardOutcome ? ChatCards.outcomeLabel(j.cardOutcome) : "" };
      }
    });
  }
  const rt = afterTotal(roll, ast);
  let { margin, cardOutcome, detail, outcome } = judge(roll, rt);
  /* ÉCHEC CRITIQUE ÉVITÉ (clé à effet) : il devient un échec simple ;
     le moment « Échec critique évité » part (un bouton peut payer une charge). */
  let saved = "";
  if (outcome === "critFailure" && imposedValues(scope, NO_CRIT_KEY, imposedIds(key, cfg)).some(v => v > 0)) {
    outcome = hasCmp ? "failure" : "done";
    cardOutcome = hasCmp ? "failure" : "";
    if (!hasCmp) detail = "";
    saved = `<div class="sbe-card-line sbe-card-critsaved"><i class="fa-solid fa-shield-halved"></i> ${esc(game.i18n.localize("SBE.Roll.CritSaved"))}</div>`;
    const who = doc.documentName === "Actor" ? doc : (doc.parent?.documentName === "Actor" ? doc.parent : null);
    if (who) {
      const { ActionTriggers } = await import("../managers/triggers/action-triggers.mjs");
      ActionTriggers.notify(who, "critSaved", { eventName: title || cfg.label || el?.label || key || "" });
    }
  }

  /* --- Application du résultat à la valeur du champ --- */
  let applied = "";
  const mode = cfg.apply ?? "none";
  if (mode !== "none" && el && doc.isOwner && !el.config?.computed) {
    const c = el.config ?? {};
    /* Reprise d'une carte : on repart de la valeur d'AVANT le premier jet. */
    const base = resume ? Number(resume.own0 ?? own) : own;
    let next = mode === "set" ? rt
      : mode === "sub" ? base - rt
        : base + rt;
    if (c.min !== undefined) next = Math.max(Number(c.min), next);
    if (c.max !== undefined) next = Math.min(Number(c.max), next);
    await doc.update({ [`system.values.${key}`]: next });
    applied = `<div class="sbe-card-line">${esc(el.label || key)} : ${base} → <b>${next}</b></div>`;
  }

  /* Apports NOMMÉS sous les dés — jamais un total anonyme : le
     joueur voit d'où vient son bonus. Mais la carte ne nomme QUE le
     modificateur saisi et les effets visibles de tous : effets
     discrets, équipement, compétences, valeur saisie par le MJ…
     restent secrets — sinon les joueurs liraient toutes les
     statistiques derrière un jet. Le total, lui, compte tout. */
  const rows = [];
  if (pick.mod) rows.push({ kind: "free", val: pick.mod });
  for (const b of extra2) rows.push({ kind: "effect", label: b.label, img: b.img, val: b.val });
  if (idMods.length) {
    const { breakdown } = computeAll(tpl.system.elements ?? [], values, ctx);
    for (const m of idMods) {
      for (const ln of breakdown[`jet_${m.id}`]?.lines ?? []) {
        if (ln.public && ln.delta) rows.push({ kind: "effect", label: ln.label, img: ln.img, val: Math.round(ln.delta * 1000) / 1000 });
      }
    }
  }
  /* Récap : où s'appliquent ces apports (le seuil ou le jet), de
     combien à combien. */
  const shown = rows.reduce((t, r) => t + r.val, 0);
  const onGoal = lowIsGood && hasCmp;
  const to = onGoal ? goal : rt;
  const modsSpec = { rows, on: onGoal ? "goal" : "roll", from: Math.round((to - shown) * 1000) / 1000, to };
  const mods = ChatCards.modsHtml(rows, modsSpec);

  /* Avantage : seul le jet gardé est montré, étiqueté ; les autres
     sont sous sa flèche. */
  const adv = count > 1 ? (pick.adv > 0 ? "adv" : "dis") : "";
  const dropped = count > 1 ? all.filter(r => r !== advKept) : [];
  /* Sans carte (opposition : c'est la demande qui publie une carte
     commune) : on rend tout ce qu'il faut pour la construire. */
  if (!post) {
    return { roll, outcome, cardOutcome, detail, adv, dropped, mods: modsSpec,
      afterHtml: after ? await afterHtml(after, doc, roll, ast, { diceHtml: (r) => ChatCards.diceHtml(r) }) : "",
      /* De quoi reprendre ce jet plus tard (relance depuis une carte d'attaque). */
      resumeData: { pick, count, roll: roll.toJSON(), all: all.map(r => r.toJSON()), st: ast },
      total: rt, margin, hasCmp, messageMode: pick.mode, options: pick.options ?? {} };
  }

  /* Le jet d'un OBJET porté parle au nom de son porteur. */
  const speakerActor = doc.documentName === "Actor" ? doc
    : (doc.parent?.documentName === "Actor" ? doc.parent : null);
  /* Après le jet, en mode « carte » : les boutons, et de quoi reprendre
     le jet au clic (mêmes choix, mêmes dés, l'état des relances). */
  const onCard = !!after && (afterMode === "card" || !!resume);
  const afterBlock = after ? await afterHtml(after, doc, roll, ast, { diceHtml: (r) => ChatCards.diceHtml(r), buttons: onCard }) : "";
  const card = {
    type: "roll",
    title: title || cfg.label || el?.label || key,
    subtitle: [doc.documentName === "Item" ? doc.name : "", note].filter(Boolean).join(" · "),
    body: saved + applied,
    outcome: cardOutcome,
    detail,
    /* Le bloc acteur (portrait + nom) au-dessus de la ligne du jet. */
    /* Le nom n'est jamais écrit : la référence suffit, l'identité
       affichée est décidée à l'affichage (module d'identité). */
    sides: [{
      ...(speakerActor ? { ref: Identity.refOf(speakerActor) } : { img: doc.img || "", name: doc.name || "" }),
      rolls: [roll], adv, dropped, after: mods + afterBlock
    }]
  };
  const flags = onCard ? { [SYSTEM_ID]: { after: {
    doc: doc.uuid, key: key ?? "", pick, count, roll: roll.toJSON(), all: all.map(r => r.toJSON()), st: ast,
    own0: resume ? resume.own0 : own,
    args: { difficulty, goal: goalOverride, bonuses, title, note, spec, vis: visOverride }
  } } } : null;
  if (resume?.message) {
    const { content } = await ChatCards.build(card);
    await resume.message.update({ content, [`flags.${SYSTEM_ID}.after`]: flags[SYSTEM_ID].after,
      [`flags.${SYSTEM_ID}.outcome`]: cardOutcome || null });
  } else {
    await ChatCards.post({ ...card, ...(flags ? { flags } : {}), speaker: ChatMessage.getSpeaker({ actor: speakerActor }), messageMode: pick.mode });
  }

  return { roll, outcome, total: rt, margin, hasCmp, options: pick.options ?? {} };
}

/**
 * FENÊTRE DE JET seule, ouverte AVANT la visée d'une attaque (comme
 * l'ancien système : on règle avantage, modificateur et options, puis
 * on vise). Le jet reprend ces choix (option `preset` de rollField).
 * @param {boolean} optionsOnly  seulement les options (zone sans jet)
 * @param {Array}   preview      lignes d'aperçu [{ label, text }] : les
 *                               {formules} du texte se recalculent avec
 *                               les options, le modificateur et l'avantage
 * @param {Object}  scope        portée de ces formules (objet, porteur…)
 * @returns {Promise<{adv,mod,goal,mode,options}|null>} null = annulé
 */
export async function askRollWindow(doc, key, options = [], { title = "", optionsOnly = false, preview = [], scope = {}, noGoal = false, vis: visOverride = null } = {}) {
  const el = [...walkElements(doc?.system?.template?.system?.elements ?? [])].find(e => e?.key === key);
  const cfg = el?.config?.roll ?? {};
  const extra = Array.isArray(options) ? options.filter(o => o?.key) : [];
  /* noGoal : le seuil vient d'ailleurs (attaque : la défense de la
     cible) — pas de ligne « Seuil à atteindre ». */
  const dlg = optionsOnly ? {} : { ...(cfg.dialog ?? {}), ...(noGoal ? { target: false } : {}) };
  /* Visibilité imposée par l'appelant (règles de combat) : c'est elle
     qui décide de la liste, même sans la case du jet. */
  const vis = visOverride ?? cleanVis(cfg.vis);
  if (visOverride) dlg.mode = visOptions(vis).list.length > 1;
  else if (dlg.mode) dlg.mode = visOptions(vis).list.length > 1;
  const hasCmp = !!(cfg.compare && cfg.compare !== "none");
  const base = { adv: 0, mod: 0, goal: null, mode: visDefaultMode(vis), options: defaultOptionValues(extra) };
  const lines = (Array.isArray(preview) ? preview : []).filter(l => String(l?.label ?? "").trim() || String(l?.text ?? "").trim());
  if (!(dlg.adv || dlg.mod || (dlg.target && hasCmp) || dlg.mode || extra.length || lines.length)) return base;
  const raw = String(cfg.target ?? "").trim();
  const goal = Number.isFinite(Number(raw)) ? Number(raw) : 0;
  const forced = optionsOnly ? null : imposedAdv(buildScope(doc.system.template.system.elements ?? [], doc.system.values ?? {}, docContext(doc)), imposedIds(key, cfg));
  return askRollOptions(dlg, { title: title || cfg.label || el?.label || key, hasCmp, goal, extra, preview: lines, scope, vis, forced });
}

/** Valeurs par défaut des options (case = 0/1, nombre, liste). */
export function defaultOptionValues(list) {
  const out = {};
  for (const o of list ?? []) {
    if (!o?.key) continue;
    if (o.type === "number") out[o.key] = Number(o.default) || 0;
    else if (o.type === "select") out[o.key] = String(o.default ?? (o.choices?.[0] ?? ""));
    else out[o.key] = o.default ? 1 : 0;
  }
  return out;
}


/* ============================================================ */
/*  Fenêtre de jet                                               */
/* ============================================================ */

/* Visibilités : builder/roll-visibility.mjs (une seule source). */
export { messageModeChoices };

/** Une borne ou une condition : nombre écrit, sinon formule ; null = aucune. */
function ruleNum(f, sc) {
  const s = String(f ?? "").trim();
  if (!s) return null;
  const n = Number.isFinite(Number(s)) ? Number(s) : Number(evalExpression(s, sc));
  return Number.isFinite(n) ? n : null;
}

/** Les règles des options (montrée, minimum, maximum) pour des valeurs données. */
function optionRules(extra, scope = {}) {
  return (vals) => {
    const sc = { ...(scope ?? {}), ...vals };
    const out = new Map();
    for (const o of extra) {
      const vis = String(o.visibleIf ?? "").trim();
      let shown = true;
      if (vis) { const r = evalExpression(vis, sc); shown = r !== null && r !== undefined && !!r; }
      out.set(o.key, { shown, min: o.type === "number" ? ruleNum(o.min, sc) : null, max: o.type === "number" ? ruleNum(o.max, sc) : null });
    }
    return out;
  };
}

/** Un nombre gardé entre ses bornes. */
function clampNum(v, { min = null, max = null } = {}) {
  let n = Number(v) || 0;
  if (max !== null) n = Math.min(n, max);
  if (min !== null) n = Math.max(n, min);
  return n;
}

/**
 * Demande les options du jet. Seules les lignes cochées par le MJ
 * apparaissent. @returns {Promise<{adv,mod,goal,mode}|null>}
 */
async function askRollOptions(dlg, { title, hasCmp, goal, extra = [], preview = [], scope = {}, vis = null, forced = null }) {
  const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);
  const esc = (v) => foundry.utils.escapeHTML(String(v ?? ""));
  const rows = [];
  if (dlg.adv) {
    const n = Math.max(2, Math.min(10, Number(dlg.advCount) || 2));
    /* Trois touches : désavantage (rouge), normal, avantage (vert). */
    /* Imposé par un effet : la touche est choisie d'office, les autres grisées. */
    const cur = forced ?? 0;
    const off = forced !== null && advLocked() ? "disabled" : "";
    const btn = (v, cls, label, tip) => `<label class="sbe-roll-adv-btn ${cls}" data-tooltip-text="${esc(tip)}">
        <input type="radio" name="adv" value="${v}" ${v === cur ? "checked" : ""} ${off}><span>${esc(label)}</span></label>`;
    rows.push(`<div class="form-group sbe-roll-advrow"><label>${L("SBE.Roll.DlgAdv")}</label>
      <div class="sbe-roll-adv">
        ${btn(-1, "is-dis", L("SBE.Roll.DlgDis"), L("SBE.Roll.DlgDisN", { n }))}
        ${btn(0, "is-normal", L("SBE.Roll.DlgNormal"), L("SBE.Roll.DlgNormal"))}
        ${btn(1, "is-adv", L("SBE.Roll.DlgAdvShort"), L("SBE.Roll.DlgAdvN", { n }))}
      </div>${forced !== null ? `<p class="notes">${esc(L(advLocked() ? "SBE.Roll.DlgAdvForced" : "SBE.Roll.DlgAdvPreset"))}</p>` : ""}</div>`);
  }
  if (dlg.mod) {
    rows.push(`<div class="form-group"><label>${L("SBE.Roll.DlgMod")}</label>
      <input type="number" name="mod" value="0" step="1"></div>`);
  }
  if (dlg.target && hasCmp) {
    rows.push(`<div class="form-group"><label>${L("SBE.Roll.DlgGoal")}</label>
      <input type="number" name="goal" value="${Number(goal) || 0}" step="1"></div>`);
  }
  /* Visibilité : seulement celles que le MJ permet, celle par défaut
     choisie d'avance ; une seule permise = imposée (pas de liste). */
  if (dlg.mode) {
    const { list, selected } = visOptions(vis ?? {});
    if (list.length > 1) rows.push(`<div class="form-group"><label>${L("SBE.Roll.DlgMode")}</label>
      <select name="mode">${list.map(m => `<option value="${esc(m.value)}" ${m.value === selected ? "selected" : ""}>${esc(m.label)}</option>`).join("")}</select></div>`);
  }
  /* Options d'attaque : libellé AU-DESSUS (case : libellé à côté).
     « Visible si », minimum et maximum : formules lues avec la portée
     de l'appelant et les options en cours, recalculées en direct. */
  const defaults = defaultOptionValues(extra);
  const rules = optionRules(extra, scope);
  const first = rules({ ...defaults });
  for (const o of extra) {
    const nm = `opt_${esc(o.key)}`;
    const r = first.get(o.key);
    const wrap = (inner) => `<div class="form-group sbe-roll-opt" data-opt-key="${esc(o.key)}"${r.shown ? "" : " hidden"}>${inner}</div>`;
    if (o.type === "number") {
      const b = `${r.min !== null ? ` min="${r.min}"` : ""}${r.max !== null ? ` max="${r.max}"` : ""}`;
      rows.push(wrap(`<label>${esc(o.label || o.key)}</label>
        <input type="number" name="${nm}" value="${clampNum(Number(o.default) || 0, r)}" step="any"${b}>`));
    } else if (o.type === "select") {
      const ch = Array.isArray(o.choices) ? o.choices : [];
      rows.push(wrap(`<label>${esc(o.label || o.key)}</label>
        <select name="${nm}">${ch.map(c => `<option value="${esc(c)}" ${c === o.default ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>`));
    } else {
      rows.push(wrap(`<label style="display:flex;align-items:center;gap:6px;">
        <input type="checkbox" name="${nm}" ${o.default ? "checked" : ""}> ${esc(o.label || o.key)}</label>`));
    }
  }
  /* APERÇU : lignes « libellé : texte », recalculées à chaque réglage. */
  const readRaw = (f) => Object.fromEntries(extra.map(o => {
    const el = f[`opt_${o.key}`];
    if (o.type === "number") return [o.key, Number(el?.value) || 0];
    if (o.type === "select") return [o.key, String(el?.value ?? "")];
    return [o.key, el?.checked ? 1 : 0];
  }));
  /* Valeurs retenues : une option masquée vaut sa valeur par défaut ; un
     nombre reste entre son minimum et son maximum. */
  const settle = (raw) => {
    const r = rules(raw);
    const out = {};
    for (const o of extra) {
      const x = r.get(o.key);
      if (!x.shown) out[o.key] = defaults[o.key];
      else out[o.key] = o.type === "number" ? clampNum(raw[o.key], x) : raw[o.key];
    }
    return { out, r };
  };
  const readForm = (form) => {
    const f = form?.elements ?? {};
    return {
      adv: Number(f.adv?.value) || 0,
      mod: Math.trunc(Number(f.mod?.value) || 0),
      options: settle(readRaw(f)).out
    };
  };
  /* Affichage : options montrées / masquées, bornes des nombres. */
  const applyRules = (form) => {
    if (!extra.length || !form) return;
    const { r } = settle(readRaw(form.elements ?? {}));
    for (const o of extra) {
      const x = r.get(o.key);
      const row = form.querySelector(`[data-opt-key="${CSS.escape(o.key)}"]`);
      if (row) row.hidden = !x.shown;
      const input = o.type === "number" ? form.elements?.[`opt_${o.key}`] : null;
      if (!input) continue;
      if (x.min !== null) input.min = String(x.min); else input.removeAttribute("min");
      if (x.max !== null) input.max = String(x.max); else input.removeAttribute("max");
      const v = Number(input.value) || 0;
      const c = clampNum(v, x);
      if (c !== v) input.value = String(c);
    }
  };
  const previewHtml = (pick) => {
    /* Les options valent comme des clés ; « mod » et « adv » aussi,
       sauf si le modèle a déjà des clés de ce nom. */
    const sc = { ...scope, ...pick.options };
    if (!("mod" in sc)) sc.mod = pick.mod;
    if (!("adv" in sc)) sc.adv = pick.adv;
    const fmt = (v) => {
      if (v === null || v === undefined || v === "") return "—";
      if (typeof v === "boolean") return v ? "✔" : "—";
      const n = Number(v);
      return Number.isFinite(n) && String(v).trim() !== "" ? String(Math.round(n * 100) / 100) : String(v);
    };
    const fill = (t) => String(t ?? "").replace(/\{([^{}]+)\}/g, (_m, ex) => fmt(evalExpression(ex.trim(), sc)));
    return preview.map(l => `<div class="sbe-roll-pv-row"><span class="sbe-roll-pv-l">${esc(l.label)}</span><span class="sbe-roll-pv-v">${esc(fill(l.text))}</span></div>`).join("");
  };
  if (preview.length) {
    rows.push(`<div class="sbe-roll-pv">${previewHtml({ adv: 0, mod: 0, options: Object.fromEntries(extra.map(o => [o.key,
      o.type === "number" ? (Number(o.default) || 0) : o.type === "select" ? String(o.default ?? "") : (o.default ? 1 : 0)])) })}</div>`);
  }
  const res = await foundry.applications.api.DialogV2.wait({
    /* Le titre est écrit tel quel par Foundry (jamais d'échappement en
       plus : « Jet d'agilité » et non « Jet d&#x27;agilité »). */
    window: { title: String(title ?? ""), icon: "fa-solid fa-dice-d20" },
    classes: ["sbe-roll-dialog"],
    content: rows.join(""),
    render: (_ev, dialog) => {
      const root = dialog instanceof HTMLElement ? dialog : (dialog?.element ?? _ev?.target?.element);
      const form = root?.tagName === "FORM" ? root : (root?.querySelector("form") ?? root);
      const box = root?.querySelector(".sbe-roll-pv");
      if (!form) return;
      const redraw = () => {
        applyRules(form);
        if (box) box.innerHTML = previewHtml(readForm(form));
      };
      form.addEventListener("input", redraw);
      form.addEventListener("change", redraw);
      redraw();
    },
    buttons: [{
      action: "roll", label: L("SBE.Roll.DlgRoll"), icon: "fa-solid fa-dice", default: true,
      callback: (_ev, button) => {
        const f = button.form.elements;
        return {
          ...readForm(button.form),
          goal: f.goal ? (Number(f.goal.value) || 0) : null,
          mode: f.mode?.value || visDefaultMode(vis ?? {}),
          /* Avantage imposé seulement pré-coché : le choix du joueur reste. */
          ...(dlg.adv && forced !== null && !advLocked() ? { advChosen: true } : {})
        };
      }
    }],
    rejectClose: false
  }).catch(() => null);
  return res && typeof res === "object" ? res : null;
}

/* ============================================================ */
/*  Boutons « après le jet » sur la carte                        */
/* ============================================================ */

/** Un clic sur un bouton de relance ou de bonus d'une carte de jet. */
export function initAfterButtons() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const data = message.getFlag(SYSTEM_ID, "after");
    const root = html instanceof HTMLElement ? html : html?.[0];
    const btns = root?.querySelectorAll?.("[data-sbe-after]") ?? [];
    if (!data || !btns.length) return;
    const docP = fromUuid(data.doc).catch(() => null);
    for (const b of btns) {
      b.disabled = true;
      docP.then(doc => {
        const tpl = doc?.system?.template;
        const el = data.key ? [...walkElements(tpl?.system?.elements ?? [])].find(e => e?.key === data.key) : null;
        const cfg = data.args?.spec ?? el?.config?.roll;
        const after = afterFor(cleanAfter(cfg?.after), "roll");
        if (!doc || !after || !afterCanClick(after, doc)) { b.style.display = "none"; return; }
        if (!b.dataset.tooltipText) b.disabled = false;
        b.addEventListener("click", async (ev) => {
          ev.preventDefault();
          for (const x of btns) x.disabled = true;
          const fresh = message.getFlag(SYSTEM_ID, "after") ?? data;
          await rollField(doc, fresh.key, { ...fresh.args, post: true, after: "card",
            resume: { ...fresh, action: b.dataset.sbeAfter, message } });
        });
      });
    }
  });
}
