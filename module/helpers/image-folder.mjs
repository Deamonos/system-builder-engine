/**
 * SBE — Images d'un dossier (Data)
 *
 * listImages(folder) : les fichiers image du dossier (sans les sous-
 * dossiers), triés. Il faut le droit de parcourir les fichiers : c'est
 * le MJ qui lit, puis on garde la liste (traces, apparences…).
 */

export async function listImages(folder) {
  if (!folder) return [];
  const FP = foundry.applications.apps.FilePicker.implementation;
  const exts = Object.keys(CONST.IMAGE_FILE_EXTENSIONS ?? {}).map(x => `.${x}`);
  const res = await FP.browse("data", folder, exts.length ? { extensions: exts } : {});
  return (res?.files ?? [])
    .filter(f => !exts.length || exts.some(x => f.toLowerCase().endsWith(x)))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}
