/**
 * SBE — Couleur de l'icône d'un effet
 *
 * Une icône blanche (les icônes de Foundry, la plupart des packs) prend
 * la couleur choisie par le MJ : le blanc devient la couleur, le noir et
 * les ombres restent (mélange « produit »).
 *
 * Pour que la couleur se voie PARTOUT (HUD du pion, icônes sur le pion,
 * fiches, info-bulles, chat, gestionnaire), SBE fabrique une COPIE
 * colorée de l'icône — un petit SVG qui contient l'image d'origine et un
 * filtre de couleur — rangée dans le dossier du monde :
 *   worlds/<monde>/sbe-icons/<empreinte>.svg
 * La copie remplace l'icône d'origine partout où l'effet s'affiche ;
 * l'originale n'est jamais touchée. Même icône + même couleur = même
 * fichier (jamais fabriqué deux fois).
 *
 * Fabriqué par le MJ (lui seul peut écrire des fichiers), à
 * l'enregistrement de la définition.
 */

const HEX_RE = /^#[0-9a-f]{6}$/i;

/** Dossier des icônes colorées du monde. */
export function paintDir() {
  return `worlds/${game.world?.id ?? "world"}/sbe-icons`;
}

/** Empreinte courte et stable d'un texte. */
function hashOf(s) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 + c, 2246822519) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

/** Le chemin de la copie colorée (qu'elle existe ou non). */
export function paintedPath(src, color) {
  return `${paintDir()}/${hashOf(`${src}|${String(color).toLowerCase()}`)}.svg`;
}

/** Couleur d'icône valide, ou "". */
export function cleanIconColor(v) {
  const s = String(v ?? "").trim();
  return HEX_RE.test(s) ? s.toLowerCase() : "";
}

/** L'icône à montrer pour `src` : la copie colorée si elle est prête. */
export function paint(def, src) {
  if (!src || !def?.iconColor) return src;
  return def.iconPainted?.[src] || src;
}

/** Aperçu instantané (fenêtres SBE) : l'icône teinte par CSS, sans
    attendre la copie colorée. Attributs à poser sur une balise <img>. */
export function tintAttrs(src, color) {
  const c = cleanIconColor(color);
  if (!c || !src) return "";
  return `data-sbe-tint style="${tintStyle(src, c)}"`;
}

/** Adresse absolue d'une icône (une adresse relative dans un masque CSS
    serait lue depuis le dossier de la feuille de style : icône vide). */
export function absoluteURL(src) {
  if (/^(https?:|data:|blob:)/i.test(String(src))) return String(src);
  try { return new URL(foundry.utils.getRoute(String(src)), window.location.origin).href; }
  catch (_e) { return String(src); }
}

/** Le style d'aperçu : la couleur passe par la forme de l'icône. */
export function tintStyle(src, color) {
  const u = absoluteURL(src).replace(/['"\\()\s]/g, (m) => `%${m.charCodeAt(0).toString(16).padStart(2, "0")}`);
  const m = `url('${u}') center / contain no-repeat`;
  return `background-color:${color};-webkit-mask:${m};mask:${m}`;
}

/** Un fichier → adresse « data: » (pour l'enfermer dans le SVG). */
async function dataURIOf(src) {
  const url = /^(https?:|data:|blob:)/i.test(src) ? src : foundry.utils.getRoute(src);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${src}`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Le SVG coloré : l'image d'origine + un filtre « produit ». */
function paintedSVG(data, color) {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512" width="512" height="512">
<defs><filter id="sbe-paint" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
<feFlood flood-color="${esc(color)}" result="c"/>
<feBlend in="c" in2="SourceGraphic" mode="multiply" result="m"/>
<feComposite in="m" in2="SourceAlpha" operator="in"/>
</filter></defs>
<image x="0" y="0" width="512" height="512" preserveAspectRatio="xMidYMid meet" filter="url(#sbe-paint)" href="${esc(data)}" xlink:href="${esc(data)}"/>
</svg>`;
}

let dirReady = false;

/** Une étape réseau ne bloque jamais plus de 15 s. */
function timed(promise, what) {
  return Promise.race([promise, new Promise((_r, reject) => { setTimeout(() => reject(new Error(`${what}: timed out`)), 15000); })]);
}

/** Fabrique (MJ) la copie colorée d'une icône ; renvoie son chemin. */
export async function makePainted(src, color) {
  const path = paintedPath(src, color);
  const FP = foundry.applications.apps.FilePicker.implementation;
  if (!dirReady) {
    try { await timed(FP.createDirectory("data", paintDir(), {}), "directory"); } catch (_e) { /* déjà là */ }
    dirReady = true;
  }
  const svg = paintedSVG(await timed(dataURIOf(src), "icon read"), color);
  const name = path.split("/").pop();
  const file = new File([svg], name, { type: "image/svg+xml" });
  const res = await timed(FP.upload("data", paintDir(), file, {}, { notify: false }), "upload");
  if (!res?.path) throw new Error(res?.message || "upload refused");
  return path;
}

/**
 * Prépare les copies colorées d'une définition (MJ) : son icône, celles
 * de ses paliers et de ses phases. Renvoie la carte { icône → copie }.
 * @param {object} def
 * @param {string[]} sources  toutes les icônes de la définition
 */
export async function preparePainted(def, sources) {
  const color = def?.iconColor;
  if (!color || !game.user?.isGM) return def?.iconPainted ?? {};
  const out = {};
  for (const src of [...new Set(sources.filter(Boolean))]) {
    const want = paintedPath(src, color);
    if (def.iconPainted?.[src] === want) { out[src] = want; continue; }
    try { out[src] = await makePainted(src, color); }
    catch (err) {
      console.warn(`SBE | Effets : icône colorée en échec (${src})`, err);
      ui.notifications.warn(game.i18n.format("SBE.Effects.IconPaintFailed", { src, err: err?.message ?? err }));
    }
  }
  return out;
}
