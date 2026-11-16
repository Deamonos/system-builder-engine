/**
 * SBE — Constantes partagées
 * Point unique pour les identifiants du système (évite les imports circulaires).
 */

export const SYSTEM_ID = "system-builder-engine";
export const SYSTEM_PATH = `systems/${SYSTEM_ID}`;

/* Formats de fichiers autorisés (partagés par les managers). */
/* Audio : la liste de FOUNDRY fait foi (une seule source de vérité),
   moins le MIDI qu'un navigateur ne sait pas jouer. Repli si absente. */
const AUDIO_FALLBACK = ["aac", "flac", "m4a", "mp3", "ogg", "opus", "wav", "webm"];
export const AUDIO_EXTENSIONS = (() => {
  const list = Object.keys(globalThis.CONST?.AUDIO_FILE_EXTENSIONS ?? {})
    .map(e => e.toLowerCase()).filter(e => e !== "mid" && e !== "midi");
  return list.length ? list : AUDIO_FALLBACK;
})();
export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"];
export const VIDEO_EXTENSIONS = ["mp4", "webm", "ogv", "m4v"];

/** Extension (minuscule) d'un chemin de fichier. */
export function fileExtension(path) {
  return String(path ?? "").split("?")[0].split(".").pop()?.toLowerCase() ?? "";
}

export function isImagePath(path) { return IMAGE_EXTENSIONS.includes(fileExtension(path)); }
export function isVideoPath(path) { return VIDEO_EXTENSIONS.includes(fileExtension(path)); }
export function isAudioPath(path) { return AUDIO_EXTENSIONS.includes(fileExtension(path)); }

/**
 * Réglage de volume (0-100 %) → gain réellement joué, avec la MÊME
 * courbe que les curseurs de volume de Foundry (inputToVolume). Notre
 * oreille n'entend pas les volumes en ligne droite : en linéaire,
 * 60 % et 80 % sonnaient presque pareil. Un seul endroit pour tous
 * les sons du système.
 */
export function soundGain(pct) {
  const x = Math.max(0, Math.min(1, (Number(pct) || 0) / 100));
  const fn = globalThis.foundry?.audio?.AudioHelper?.inputToVolume;
  return typeof fn === "function" ? fn.call(foundry.audio.AudioHelper, x) : Math.pow(x, 1.5);
}

/** « Formats acceptés : … » — affiché sous chaque champ de son. */
export function audioFormatsHint() {
  return game.i18n.format("SBE.Media.Formats", { formats: AUDIO_EXTENSIONS.join(", ") });
}

/**
 * Polices disponibles dans Foundry : natives (CONFIG.fontDefinitions)
 * + celles installées par l'utilisateur (Configuration → Polices).
 */
export function getFontFamilies() {
  const families = new Set(Object.keys(CONFIG.fontDefinitions ?? {}));
  try {
    const FontConfig = foundry.applications?.settings?.menus?.FontConfig ?? globalThis.FontConfig;
    for (const f of FontConfig?.getAvailableFonts?.() ?? []) families.add(f);
  } catch (_e) { /* API indisponible : on garde CONFIG.fontDefinitions */ }
  return [...families].sort((a, b) => a.localeCompare(b, game.i18n.lang));
}
