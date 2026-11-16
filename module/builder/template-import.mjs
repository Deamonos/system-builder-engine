/**
 * SBE — Importer un modèle depuis la barre latérale
 *
 * Un bouton « Importer un modèle » en tête des onglets Objets et Acteurs
 * (et le glisser-déposer de fichiers .json sur ces onglets) : chaque
 * fichier exporté par l'atelier devient directement un NOUVEAU modèle —
 * plus besoin de créer le modèle puis d'importer dedans. Le type (objet
 * ou personnage) se lit dans le fichier ; un fichier déposé sur un
 * dossier du bon type y est rangé.
 *
 * Même chemin d'écriture que l'import dans un modèle ouvert
 * (jsonToTemplate + applyImported) : une seule source de vérité.
 */

import { jsonToTemplate, applyImported, reportHTML } from "./template-io.mjs";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/** Fichiers .json d'un dépôt (ou d'un choix de fichiers). */
const jsonFiles = (list) => [...(list ?? [])].filter(f => /\.json$/i.test(f.name) || f.type === "application/json");

/**
 * Crée un modèle par fichier.
 * @param {File[]} files
 * @param {Folder|null} folder  dossier visé (s'il est du bon type)
 */
export async function importTemplateFiles(files, folder = null) {
  if (!game.user.isGM) return;
  const reports = [];
  let made = 0;
  for (const file of files) {
    let json = null;
    try { json = JSON.parse(await file.text()); } catch (_e) { /* illisible */ }
    if (json?.sbe !== "template") {
      ui.notifications.error(L("SBE.IO.DirNotTemplate", { file: file.name }));
      continue;
    }
    const isItem = json.for === "item";
    const cls = CONFIG[isItem ? "Item" : "Actor"].documentClass;
    const docName = isItem ? "Item" : "Actor";
    const name = String(json.name ?? "").trim() || file.name.replace(/\.json$/i, "");
    const data = { name, type: "template" };
    if (folder?.type === docName) data.folder = folder.id;
    const doc = await cls.create(data);
    if (!doc) continue;
    const res = jsonToTemplate(json, doc, { replace: true });
    if (!res.ok) {
      await doc.delete();
      ui.notifications.error(`${file.name} : ${res.error ?? L("SBE.IO.NotATemplate")}`);
      continue;
    }
    await applyImported(doc, res);
    made++;
    reports.push(reportHTML(res.report, { name }));
  }
  if (!made) return;
  ui.notifications.info(L("SBE.IO.DirDone", { n: made }));
  /* Le compte rendu (clés absentes, composants placés…), pour information. */
  if (reports.some(r => r && r.replace(/<[^>]*>/g, "").trim())) {
    await foundry.applications.api.DialogV2.prompt({
      window: { title: L("SBE.IO.DirReportTitle"), icon: "fa-solid fa-file-import" },
      position: { width: 520 },
      content: `<div class="sbe-io-report">${reports.join("<hr>")}</div>`,
      ok: { label: L("SBE.Common.Validate") },
      rejectClose: false
    }).catch(() => null);
  }
}

/** Le choix de fichiers (plusieurs à la fois). */
function pickFiles(folder = null) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.multiple = true;
  input.addEventListener("change", () => {
    const files = jsonFiles(input.files);
    if (files.length) importTemplateFiles(files, folder);
  });
  input.click();
}

function wire(_app, html) {
  if (!game.user?.isGM) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;
  /* Le bouton, à côté de « Créer ». */
  const actions = root.querySelector(".directory-header .header-actions");
  if (actions && !actions.querySelector(".sbe-import-template")) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sbe-import-template";
    btn.dataset.tooltipText = L("SBE.IO.DirHint");
    btn.innerHTML = `<i class="fa-solid fa-file-import" inert></i><span>${esc(L("SBE.IO.DirButton"))}</span>`;
    btn.addEventListener("click", (ev) => { ev.preventDefault(); pickFiles(); });
    actions.appendChild(btn);
  }
  /* Glisser des fichiers .json sur l'onglet (sur un dossier : rangés dedans). */
  if (root.dataset.sbeTplDrop) return;
  root.dataset.sbeTplDrop = "1";
  const hasFiles = (ev) => [...(ev.dataTransfer?.types ?? [])].includes("Files");
  root.addEventListener("dragover", (ev) => { if (hasFiles(ev)) ev.preventDefault(); }, true);
  root.addEventListener("drop", (ev) => {
    if (!hasFiles(ev)) return;
    const files = jsonFiles(ev.dataTransfer.files);
    if (!files.length) return;
    ev.preventDefault();
    ev.stopPropagation();
    const fid = ev.target?.closest?.("[data-folder-id]")?.dataset.folderId;
    importTemplateFiles(files, fid ? game.folders?.get(fid) ?? null : null);
  }, true);
}

export function initTemplateImport() {
  Hooks.on("renderItemDirectory", wire);
  Hooks.on("renderActorDirectory", wire);
}
