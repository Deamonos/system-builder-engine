/**
 * SBE — OPTIONS D'ATTAQUE : l'éditeur commun
 *
 * Une option s'affiche dans la fenêtre de jet d'une attaque, et sa
 * CLÉ devient une valeur utilisable dans toutes les formules du
 * bouton (défense ignorée, dégâts, zone, étapes suivantes…) :
 *   case à cocher → 1 / 0, nombre → le nombre, liste → le texte choisi.
 *
 *   option = { key, label, type: "check"|"number"|"select", default, choices?,
 *              visibleIf?, min?, max? }
 *   visibleIf : formule (clés de l'arme, carrier(), autres options),
 *   recalculée en direct ; masquée, l'option vaut sa valeur par défaut.
 *   min / max (nombre) : nombre ou formule, lus de la même façon.
 *
 * Le même éditeur sert au profil (manager Combat) et à l'arme (étape
 * « Attaquer », volet Avancé).
 */

const L = (k) => game.i18n.localize(k);
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const OPTION_TYPES = ["check", "number", "select"];

/** Option nettoyée (lecture, import). null = inutilisable. */
export function cleanOption(o) {
  const key = String(o?.key ?? "").trim();
  if (!KEY_RE.test(key)) return null;
  const type = OPTION_TYPES.includes(o?.type) ? o.type : "check";
  const out = { key, label: String(o?.label ?? "").trim(), type };
  if (type === "number") out.default = Number(o?.default) || 0;
  else if (type === "select") {
    out.choices = (Array.isArray(o?.choices) ? o.choices : String(o?.choices ?? "").split(","))
      .map(c => String(c).trim()).filter(Boolean);
    out.default = out.choices.includes(String(o?.default ?? "")) ? String(o.default) : (out.choices[0] ?? "");
  } else out.default = !!o?.default && o.default !== "0";
  const vis = String(o?.visibleIf ?? "").trim();
  if (vis) out.visibleIf = vis;
  if (type === "number") {
    for (const b of ["min", "max"]) {
      const v = String(o?.[b] ?? "").trim();
      if (v) out[b] = v;
    }
  }
  return out;
}

function rowHtml(o = {}) {
  const t = OPTION_TYPES.includes(o.type) ? o.type : "check";
  const def = t === "check" ? "" : (t === "select" ? (o.default ?? "") : (o.default ?? 0));
  return `
    <div class="sbe-aopt-row">
      <label class="sbe-aopt-f"><span>${L("SBE.AtkOpt.Label")}</span>
        <input type="text" class="sbe-aopt-label" value="${esc(o.label)}" placeholder="${esc(L("SBE.AtkOpt.LabelPh"))}"></label>
      <label class="sbe-aopt-f"><span>${L("SBE.AtkOpt.Key")}</span>
        <input type="text" class="sbe-aopt-key" value="${esc(o.key)}" placeholder="${esc(L("SBE.AtkOpt.KeyPh"))}"></label>
      <label class="sbe-aopt-f"><span>${L("SBE.AtkOpt.Type")}</span>
        <select class="sbe-aopt-type">${OPTION_TYPES.map(x => `<option value="${x}" ${x === t ? "selected" : ""}>${L(`SBE.AtkOpt.Type_${x}`)}</option>`).join("")}</select></label>
      <label class="sbe-aopt-f sbe-aopt-defbox"><span>${L("SBE.AtkOpt.Default")}</span>
        <input type="checkbox" class="sbe-aopt-defchk" ${t === "check" && o.default ? "checked" : ""}>
        <input type="text" class="sbe-aopt-def" value="${esc(def)}"></label>
      <label class="sbe-aopt-f sbe-aopt-choicesbox"><span>${L("SBE.AtkOpt.Choices")}</span>
        <input type="text" class="sbe-aopt-choices" value="${esc((o.choices ?? []).join(", "))}" placeholder="${esc(L("SBE.AtkOpt.ChoicesPh"))}"></label>
      <label class="sbe-aopt-f sbe-aopt-boundbox"><span>${L("SBE.AtkOpt.Min")}</span>
        <input type="text" class="sbe-aopt-min" list="sbe-stepkeys" value="${esc(o.min)}" placeholder="—"></label>
      <label class="sbe-aopt-f sbe-aopt-boundbox"><span>${L("SBE.AtkOpt.Max")}</span>
        <input type="text" class="sbe-aopt-max" list="sbe-stepkeys" value="${esc(o.max)}" placeholder="${esc(L("SBE.AtkOpt.MaxPh"))}"></label>
      <label class="sbe-aopt-f"><span>${L("SBE.AtkOpt.VisibleIf")}</span>
        <input type="text" class="sbe-aopt-vis" list="sbe-stepkeys" value="${esc(o.visibleIf)}" placeholder="${esc(L("SBE.AtkOpt.VisibleIfPh"))}"></label>
      <a class="sbe-aopt-del" title="${esc(L("SBE.AtkOpt.Delete"))}"><i class="fa-solid fa-trash"></i></a>
    </div>`;
}

/** Le bloc complet (titre géré par l'appelant). */
export function optionsEditorHtml(list = []) {
  return `<div class="sbe-aopt">
    <div class="sbe-aopt-rows">${(list ?? []).map(rowHtml).join("")}</div>
    <button type="button" class="sbe-aopt-add"><i class="fa-solid fa-plus"></i> ${L("SBE.AtkOpt.Add")}</button>
  </div>`;
}

/** Affiche les champs utiles au type de chaque ligne. */
function sync(row) {
  const t = row.querySelector(".sbe-aopt-type")?.value ?? "check";
  row.querySelector(".sbe-aopt-defchk").style.display = t === "check" ? "" : "none";
  row.querySelector(".sbe-aopt-def").style.display = t === "check" ? "none" : "";
  row.querySelector(".sbe-aopt-choicesbox").style.display = t === "select" ? "" : "none";
  for (const b of row.querySelectorAll(".sbe-aopt-boundbox")) b.style.display = t === "number" ? "" : "none";
}

/* ============================================================ */
/*  APERÇU dans la fenêtre de jet : lignes « libellé : texte »    */
/*  dont les {formules} se recalculent pendant que le joueur      */
/*  règle ses options (« Dégâts : 1d8+{bonus} × {rafale ? 3 : 1} »)*/
/* ============================================================ */

function previewRowHtml(r = {}) {
  return `
    <div class="sbe-apv-row">
      <label class="sbe-aopt-f"><span>${L("SBE.AtkPrev.Label")}</span>
        <input type="text" class="sbe-apv-label" value="${esc(r.label)}" placeholder="${esc(L("SBE.AtkPrev.LabelPh"))}"></label>
      <label class="sbe-aopt-f sbe-apv-textbox"><span>${L("SBE.AtkPrev.Text")}</span>
        <input type="text" class="sbe-apv-text" value="${esc(r.text)}" placeholder="${esc(`{${L("SBE.Ph.AtkDamage")}} × {${L("SBE.Ph.AtkBurst")} ? 3 : 1}`)}"></label>
      <a class="sbe-apv-del" title="${esc(L("SBE.AtkOpt.Delete"))}"><i class="fa-solid fa-trash"></i></a>
    </div>`;
}

/** L'éditeur des lignes d'aperçu (titre géré par l'appelant). */
export function previewEditorHtml(list = []) {
  return `<div class="sbe-apv">
    <div class="sbe-apv-rows">${(list ?? []).map(previewRowHtml).join("")}</div>
    <button type="button" class="sbe-apv-add"><i class="fa-solid fa-plus"></i> ${L("SBE.AtkPrev.Add")}</button>
  </div>`;
}

/** Ligne d'aperçu nettoyée (lecture, import). null = vide. */
export function cleanPreviewLine(r) {
  const label = String(r?.label ?? "").trim();
  const text = String(r?.text ?? "").trim();
  return (label || text) ? { label, text } : null;
}

export function readPreviewEditor(box) {
  return [...(box?.querySelectorAll(".sbe-apv-row") ?? [])].map(row => cleanPreviewLine({
    label: row.querySelector(".sbe-apv-label")?.value,
    text: row.querySelector(".sbe-apv-text")?.value
  })).filter(Boolean);
}

/** Branche un éditeur d'options (ajouter, supprimer, changer de type)
    ou de lignes d'aperçu (ajouter, supprimer). */
export function wireOptionsEditor(box) {
  if (!box || box.dataset.wired) return;
  if (box.classList.contains("sbe-apv")) {
    box.dataset.wired = "1";
    box.querySelector(".sbe-apv-add")?.addEventListener("click", () => {
      box.querySelector(".sbe-apv-rows").insertAdjacentHTML("beforeend", previewRowHtml({}));
    });
    box.addEventListener("click", (ev) => {
      const del = ev.target.closest(".sbe-apv-del");
      if (del) del.closest(".sbe-apv-row")?.remove();
    });
    return;
  }
  box.dataset.wired = "1";
  for (const row of box.querySelectorAll(".sbe-aopt-row")) sync(row);
  box.querySelector(".sbe-aopt-add")?.addEventListener("click", () => {
    const rows = box.querySelector(".sbe-aopt-rows");
    rows.insertAdjacentHTML("beforeend", rowHtml({}));
    sync(rows.lastElementChild);
  });
  box.addEventListener("click", (ev) => {
    const del = ev.target.closest(".sbe-aopt-del");
    if (del) del.closest(".sbe-aopt-row")?.remove();
  });
  box.addEventListener("change", (ev) => {
    if (ev.target.classList.contains("sbe-aopt-type")) sync(ev.target.closest(".sbe-aopt-row"));
  });
}

/**
 * Lit un éditeur. @returns {{list:object[], error:string|null}}
 * Une ligne entièrement vide est ignorée ; une clé invalide ou en
 * double est une erreur (rien n'est renommé en silence).
 */
export function readOptionsEditor(box, validate = null) {
  const list = [];
  const seen = new Set();
  for (const row of box?.querySelectorAll(".sbe-aopt-row") ?? []) {
    const key = row.querySelector(".sbe-aopt-key")?.value.trim() ?? "";
    const label = row.querySelector(".sbe-aopt-label")?.value.trim() ?? "";
    if (!key && !label) continue;
    if (!KEY_RE.test(key)) return { list, error: game.i18n.format("SBE.AtkOpt.BadKey", { key: key || label }) };
    if (seen.has(key)) return { list, error: game.i18n.format("SBE.AtkOpt.DupKey", { key }) };
    seen.add(key);
    const type = row.querySelector(".sbe-aopt-type")?.value ?? "check";
    const o = cleanOption({
      key, label, type,
      default: type === "check" ? row.querySelector(".sbe-aopt-defchk")?.checked : row.querySelector(".sbe-aopt-def")?.value,
      choices: row.querySelector(".sbe-aopt-choices")?.value ?? "",
      visibleIf: row.querySelector(".sbe-aopt-vis")?.value ?? "",
      min: row.querySelector(".sbe-aopt-min")?.value ?? "",
      max: row.querySelector(".sbe-aopt-max")?.value ?? ""
    });
    if (validate) {
      for (const [f, k] of [["visibleIf", "VisibleIf"], ["min", "Min"], ["max", "Max"]]) {
        const err = o[f] && !/^-?\d+(\.\d+)?$/.test(o[f]) ? validate(o[f]) : null;
        if (err) return { list, error: `${key} · ${L(`SBE.AtkOpt.${k}`)} : ${err}` };
      }
    }
    if (type === "select" && !o.choices.length) return { list, error: game.i18n.format("SBE.AtkOpt.NoChoices", { key }) };
    list.push(o);
  }
  return { list, error: null };
}

/* ============================================================ */
/*  Les réglages d'un PROFIL d'attaque (le même bloc sert au      */
/*  profil, dans le manager Combat, et au volet Avancé de l'arme) */
/* ============================================================ */

const TEXT_FIELDS = [
  ["defense", "Defense"], ["ignoreDefenseIf", "IgnoreDef"], ["sureHitIf", "SureHit"], ["dmgType", "DmgType"]
];
/* Recul : de combien de cases la cible est repoussée (formule), et ce
   que fait une sauvegarde réussie (formule ou texte : aucun, moitié,
   complet). */
const PUSH_FIELDS = [["push", "Push"], ["pushSave", "PushSave"]];
/* Sauvegarde des cibles (cible seule ET zone) : le champ à jet de leur
   fiche, et ce que vaut une réussite (moitié / aucun, ou une clé). */
const SAVE_FIELDS = [["save", "Save"], ["saveMode", "SaveMode"]];
/* Localisation des coups : d'où vient la zone touchée (formule du jet à
   part, ou lue sur le jet d'attaque), et combien de zones pour une
   attaque de zone « plusieurs au hasard ». */
const LOC_FIELDS = [["locFormula", "LocFormula"]];
const LOC_COUNT = [["locCount", "LocCount"]];
/* Dégâts non létaux : la condition (souvent une option de la fenêtre),
   la valeur gardée sur la cible. L'effet posé a sa propre liste. */
const NL_FIELDS = [["nonLethalIf", "NonLethalIf"], ["nonLethalKeep", "NonLethalKeep"]];
const ZONE_FIELDS = [
  ["zone", "Zone"], ["zRadius", "ZRadius"], ["zLength", "ZLength"], ["zAngle", "ZAngle"],
  ["zWidth", "ZWidth"], ["zScale", "ZScale"], ["traverseLimit", "TraverseLimit"]
];

/**
 * @param d        valeurs
 * @param inherit  true = dans l'arme : une case vide reprend le profil
 *                 (les listes proposent « comme le profil »)
 */
export function profileFieldsHtml(d = {}, { inherit = false } = {}) {
  const field = ([f, k]) => `
    <label class="sbe-step-atk-field">
      <span>${L(`SBE.Steps.Atk.${k}`)}</span>
      <input type="text" class="sbe-pf-${f}" list="sbe-stepkeys" value="${esc(d[f])}" placeholder="${esc(L(inherit ? "SBE.Steps.Atk.FromProfile" : `SBE.Steps.Atk.${k}Ph`))}">
    </label>`;
  const sel = (f, k, opts) => `
    <label class="sbe-step-atk-field">
      <span>${L(`SBE.Steps.Atk.${k}`)}</span>
      <select class="sbe-pf-${f}">
        ${inherit ? `<option value="" ${!d[f] ? "selected" : ""}>${L("SBE.Steps.Atk.FromProfile")}</option>` : ""}
        ${opts.map(([v, lk]) => `<option value="${v}" ${(d[f] || (inherit ? "" : opts[0][0])) === v ? "selected" : ""}>${L(lk)}</option>`).join("")}
      </select>
    </label>`;
  return `
    <div class="sbe-step-atk">${TEXT_FIELDS.map(field).join("")}
      ${sel("unblockable", "Unblockable", [["no", "SBE.Steps.Atk.UnblockNo"], ["ask", "SBE.Steps.Atk.UnblockAsk"], ["always", "SBE.Steps.Atk.UnblockAlways"]])}</div>
    <p class="notes">${L("SBE.Steps.Atk.UnblockHint")}</p>
    <fieldset class="sbe-step-zone">
      <legend>${L("SBE.Steps.Atk.SaveGroup")}</legend>
      <p class="notes">${L("SBE.Steps.Atk.SaveHint")}</p>
      <div class="sbe-step-atk">${SAVE_FIELDS.map(field).join("")}
        ${sel("saveVs", "SaveVs", [["field", "SBE.Steps.Atk.SaveVsField"], ["defense", "SBE.Steps.Atk.SaveVsDefense"]])}</div>
    </fieldset>
    <fieldset class="sbe-step-zone">
      <legend>${L("SBE.Steps.Atk.ZoneGroup")}</legend>
      <p class="notes">${L("SBE.Steps.Atk.ZoneHint")}</p>
      <div class="sbe-step-atk">
        ${ZONE_FIELDS.map(field).join("")}
        ${sel("traverse", "Traverse", [["all", "SBE.Steps.Atk.TraverseAll"], ["ordered", "SBE.Steps.Atk.TraverseOrdered"]])}
      </div>
    </fieldset>
    <fieldset class="sbe-step-zone">
      <legend>${L("SBE.Steps.Atk.LocGroup")}</legend>
      <p class="notes">${L("SBE.Steps.Atk.LocHint")}</p>
      <div class="sbe-step-atk">
        ${sel("loc", "Loc", [["none", "SBE.Steps.Atk.Loc_none"], ["roll", "SBE.Steps.Atk.Loc_roll"], ["attack", "SBE.Steps.Atk.Loc_attack"]])}
        ${LOC_FIELDS.map(field).join("")}
        ${sel("locAim", "LocAim", [["no", "SBE.Steps.Atk.LocAim_no"], ["yes", "SBE.Steps.Atk.LocAim_yes"]])}
        ${sel("locArea", "LocArea", [["each", "SBE.Steps.Atk.LocArea_each"], ["all", "SBE.Steps.Atk.LocArea_all"], ["some", "SBE.Steps.Atk.LocArea_some"], ["none", "SBE.Steps.Atk.LocArea_none"]])}
        ${LOC_COUNT.map(field).join("")}
        ${sel("locSplit", "LocSplit", [["full", "SBE.Steps.Atk.LocSplit_full"], ["split", "SBE.Steps.Atk.LocSplit_split"]])}
      </div>
    </fieldset>
    <fieldset class="sbe-step-zone">
      <legend>${L("SBE.Steps.Atk.NonLethalGroup")}</legend>
      <p class="notes">${L("SBE.Steps.Atk.NonLethalHint")}</p>
      <div class="sbe-step-atk">${NL_FIELDS.map(field).join("")}
        <label class="sbe-step-atk-field">
          <span>${L("SBE.Steps.Atk.NonLethalEffect")}</span>
          <input type="text" class="sbe-pf-nonLethalEffect" list="sbe-stepfx" value="${esc(d.nonLethalEffect)}" placeholder="${esc(L(inherit ? "SBE.Steps.Atk.FromProfile" : "SBE.Steps.Atk.NonLethalEffectPh"))}">
        </label></div>
    </fieldset>
    <fieldset class="sbe-step-zone">
      <legend>${L("SBE.Steps.Atk.PushGroup")}</legend>
      <p class="notes">${L("SBE.Steps.Atk.PushHint")}</p>
      <div class="sbe-step-atk">${PUSH_FIELDS.map(field).join("")}</div>
    </fieldset>
    <fieldset class="sbe-step-zone">
      <legend>${L("SBE.AtkOpt.Group")}</legend>
      <p class="notes">${L(inherit ? "SBE.AtkOpt.HintWeapon" : "SBE.AtkOpt.Hint")}</p>
      ${optionsEditorHtml(d.options ?? [])}
    </fieldset>
    <fieldset class="sbe-step-zone">
      <legend>${L("SBE.AtkPrev.Group")}</legend>
      <p class="notes">${esc(inherit ? L("SBE.AtkPrev.HintWeapon") : game.i18n.format("SBE.AtkPrev.Hint", { ex: "1d8+{bonus} × {hits}" }))}</p>
      ${previewEditorHtml(d.preview ?? [])}
    </fieldset>`;
}

/** Valide une formule de nombre (portée, tailles…) — null si bonne. */
export function readProfileFields(box, validate = null) {
  const out = {};
  const ALL = [...TEXT_FIELDS, ...SAVE_FIELDS, ...ZONE_FIELDS, ...PUSH_FIELDS, ...LOC_FIELDS, ...LOC_COUNT, ...NL_FIELDS, ["nonLethalEffect", "NonLethalEffect"]];
  for (const [f] of ALL) {
    const v = box.querySelector(`.sbe-pf-${f}`)?.value.trim() ?? "";
    if (!v) continue;
    if (validate && ["zRadius", "zLength", "zAngle", "zWidth", "zScale", "traverseLimit", "ignoreDefenseIf", "sureHitIf", "push", "locCount", "nonLethalIf", "nonLethalKeep"].includes(f)) {
      const err = validate(v);
      if (err) return { values: out, error: `${L(`SBE.Steps.Atk.${ALL.find(x => x[0] === f)[1]}`)} : ${err}` };
    }
    out[f] = v;
  }
  for (const f of ["traverse", "unblockable", "saveVs", "loc", "locAim", "locArea", "locSplit"]) {
    const v = box.querySelector(`.sbe-pf-${f}`)?.value ?? "";
    if (v) out[f] = v;
  }
  const o = readOptionsEditor(box.querySelector(".sbe-aopt"), validate);
  if (o.error) return { values: out, error: o.error };
  if (o.list.length) out.options = o.list;
  const pv = readPreviewEditor(box.querySelector(".sbe-apv"));
  if (pv.length) out.preview = pv;
  return { values: out, error: null };
}
