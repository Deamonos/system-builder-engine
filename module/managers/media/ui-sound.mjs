/**
 * SBE — SONS D'INTERFACE des fiches
 *
 * Trois moments, réglés dans le modèle :
 *   - ouverture de la fiche   (system.theme.sounds.open)
 *   - fermeture de la fiche   (system.theme.sounds.close)
 *   - clic sur un onglet      (config.clickSound de l'élément Onglet)
 *
 * Même langage que les médias : une ligne = { sound, volume 0-100 }.
 * Ce sont des sons d'INTERFACE : seul celui qui clique les entend
 * (jamais diffusés), sur le canal « Interface » de Foundry — chaque
 * joueur règle ou coupe leur volume depuis ses propres paramètres.
 */

import { isAudioPath, audioFormatsHint, AUDIO_EXTENSIONS, soundGain } from "../../helpers/constants.mjs";


/* Foundry, au premier chargement d'un son court, crée un élément <audio>
   pour mesurer sa durée puis le décharge avec src = "" — Firefox écrit
   alors « Invalid URI. Load of media resource failed. » en console, pour
   rien (le son joue). On décode donc le fichier NOUS-MÊMES et on le range
   dans le cache de Foundry : il le trouve et saute l'élément <audio>. */
const PRIME_MAX_BYTES = 4 * 1024 * 1024;
const _priming = new Map();
export async function primeSound(src, channel = "interface") {
  try {
    const cache = game.audio?.buffers;
    const ctx = game.audio?.[channel];
    if (!src || !cache || !ctx?.decodeAudioData || cache.getBuffer(src)) return;
    if (!_priming.has(src)) {
      _priming.set(src, (async () => {
        const res = await foundry.utils.fetchWithTimeout(src);
        if (!res.ok) return;
        const data = await res.arrayBuffer();
        if (data.byteLength > PRIME_MAX_BYTES) return;
        const buffer = await ctx.decodeAudioData(data);
        if (!cache.getBuffer(src)) cache.setBuffer(src, buffer);
      })().catch(() => { /* Foundry retentera et dira l'erreur */ }).finally(() => _priming.delete(src)));
    }
    await _priming.get(src);
  } catch (_e) { /* sans gravité : lecture normale */ }
}

/**
 * ÉCOUTE D'ESSAI (bouton ▶ de tous les sons du système).
 * Foundry ne signale RIEN quand un fichier ne se lit pas (simple ligne
 * en console) : ici, chaque cause est dite à l'écran.
 * @param {string} path     chemin du fichier
 * @param {number} volume   réglage 0 à 1 (courbe de Foundry appliquée ici)
 * @returns {Promise<boolean>} true = le son joue
 */
export async function testSound(path, volume = 0.8) {
  const L = (k, d) => d ? game.i18n.format(k, d) : game.i18n.localize(k);
  const src = String(path ?? "").trim();
  if (!src) { ui.notifications.warn(L("SBE.Media.NoSound")); return false; }
  if (!isAudioPath(src)) {
    ui.notifications.error(L("SBE.Media.BadFormat", { formats: AUDIO_EXTENSIONS.join(", ") }));
    return false;
  }
  if (Number(volume) <= 0) { ui.notifications.warn(L("SBE.Media.VolumeZero")); return false; }
  let snd = null;
  await primeSound(src);
  try {
    snd = await foundry.audio.AudioHelper.play({ src, volume: soundGain(Number(volume) * 100), autoplay: true, loop: false, channel: "interface" }, false);
  } catch (err) {
    console.warn("SBE | Écoute d'essai en échec", src, err);
  }
  if (!snd || snd.failed) {
    ui.notifications.error(L("SBE.Media.LoadFailed", { file: src.split("/").pop() }));
    return false;
  }
  /* Le son joue, mais le curseur « Interface » du joueur est à zéro. */
  if (Number(game.settings.get("core", "globalInterfaceVolume")) <= 0) {
    ui.notifications.warn(L("SBE.Media.InterfaceMuted"));
  }
  return true;
}

/** Ligne vide. */
export function uiSoundDefaults() {
  return { sound: "", volume: 80 };
}

/** Normalise une ligne stockée (défauts compris). */
export function uiSoundOf(raw) {
  const d = uiSoundDefaults();
  const v = Number(raw?.volume);
  return {
    sound: String(raw?.sound ?? d.sound).trim(),
    volume: Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : d.volume
  };
}

/** Sons d'ouverture / fermeture d'un MODÈLE (défauts compris). */
export function sheetSoundsOf(templateDoc) {
  const s = templateDoc?.system?.theme?.sounds ?? {};
  return { open: uiSoundOf(s.open), close: uiSoundOf(s.close) };
}

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const L = (k) => game.i18n.localize(k);

export class UiSound {

  /** Son en cours par « emplacement » (ex. un onglet par fiche). */
  static #current = new Map();
  static #token = new Map();

  /**
   * Joue une ligne pour CE client seulement.
   * @param {object} entry            { sound, volume }
   * @param {string} [slot]           emplacement : le son précédent du
   *                                  même emplacement est coupé (clics
   *                                  rapides d'onglet en onglet)
   */
  static async play(entry, slot = null) {
    const e = uiSoundOf(entry);
    if (!e.sound || e.volume <= 0) return;
    let tok = 0;
    if (slot) {
      this.stop(slot);
      tok = (this.#token.get(slot) ?? 0) + 1;
      this.#token.set(slot, tok);
    }
    try {
      await primeSound(e.sound);
      const snd = await foundry.audio.AudioHelper.play({
        src: e.sound, volume: soundGain(e.volume), autoplay: true, loop: false, channel: "interface"
      }, false);
      if (snd?.failed) console.warn("SBE | Son d'interface illisible", e.sound);
      if (!slot || !snd) return;
      /* Un clic plus récent est passé entre-temps : ce son-ci se tait. */
      if (this.#token.get(slot) !== tok) { try { snd.stop(); } catch (_e) { /* déjà fini */ } return; }
      this.#current.set(slot, snd);
    } catch (err) {
      console.warn("SBE | Son d'interface : lecture en échec", e.sound, err);
    }
  }

  /** Coupe le son d'un emplacement. */
  static stop(slot) {
    const snd = this.#current.get(slot);
    if (!snd) return;
    this.#current.delete(slot);
    try { snd.stop(); } catch (_e) { /* déjà fini */ }
  }

  /* ---------------- formulaire (même bloc partout) ---------------- */

  /**
   * Champs d'une ligne : texte au-dessus, fichier + ▶, puis volume.
   * @param {string} name    préfixe des champs (ex. "sounds.open")
   * @param {object} entry   ligne actuelle
   * @param {string} label   clé de traduction du titre
   * @param {string} [hint]  clé de traduction de l'aide
   */
  static fieldsHtml(name, entry, label, hint = "") {
    const e = uiSoundOf(entry);
    return `
      <div class="sbe-uisound">
        <div class="sbe-uisound-title">${L(label)}</div>
        <div class="sbe-uisound-row">
          <file-picker name="${name}.sound" type="audio" value="${esc(e.sound)}"></file-picker>
          <button type="button" class="sbe-uisound-test" data-uisound-test="${name}" title="${L("SBE.Media.Test")}">
            <i class="fa-solid fa-play"></i>
          </button>
        </div>
        <div class="sbe-uisound-row">
          <span class="sbe-uisound-vlabel">${L("SBE.Media.Volume")}</span>
          <range-picker name="${name}.volume" value="${e.volume}" min="0" max="100" step="5"></range-picker>
        </div>
        <p class="notes">${esc(audioFormatsHint())}</p>
        ${hint ? `<p class="notes">${L(hint)}</p>` : ""}
      </div>`;
  }

  /**
   * Bloc complet ouverture + fermeture — le même pour les fiches et
   * les coffres ; seuls les textes changent.
   */
  static sheetBlockHtml(sounds, {
    hint = "SBE.UiSound.SheetHint", open = "SBE.UiSound.Open", close = "SBE.UiSound.Close"
  } = {}) {
    const s = sounds ?? {};
    return `
      <div class="sbe-uisound-block">
        <p class="hint notes">${L(hint)}</p>
        ${this.fieldsHtml("sounds.open", s.open, open)}
        ${this.fieldsHtml("sounds.close", s.close, close)}
      </div>`;
  }

  /** Sons d'ouverture / fermeture d'un objet libre (coffre…). */
  static pairOf(raw) {
    return { open: uiSoundOf(raw?.open), close: uiSoundOf(raw?.close) };
  }

  /** Relit une ligne depuis le formulaire. */
  static read(root, name) {
    const q = (n) => root.querySelector(`[name="${n}"]`);
    return uiSoundOf({ sound: q(`${name}.sound`)?.value ?? "", volume: q(`${name}.volume`)?.value ?? 80 });
  }

  /** Relit le bloc « Sons de la fiche ». */
  static readSheet(root) {
    return { open: this.read(root, "sounds.open"), close: this.read(root, "sounds.close") };
  }

  /** Boutons ▶ : écoute de la ligne telle que saisie (non enregistrée). */
  static wire(root) {
    for (const btn of root.querySelectorAll("[data-uisound-test]")) {
      if (btn.dataset.uisoundWired) continue;
      btn.dataset.uisoundWired = "1";
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        const line = this.read(root, btn.dataset.uisoundTest);
        testSound(line.sound, line.volume / 100);
      });
    }
  }

  /* ---------------- onglets ---------------- */

  /**
   * Clic sur un onglet de nav : joue son son s'il CHANGE d'onglet.
   * @param {Application} app     fiche ou atelier
   * @param {HTMLElement} target  le lien cliqué
   * @param {object} tabEl        l'élément Onglet
   */
  static onTabClick(app, target, tabEl) {
    const wasActive = target.classList.contains("active")
      || target.closest(".sbe-navtab")?.classList.contains("active");
    if (wasActive) return;
    /* Le son de l'onglet, sinon celui du thème (onglet Médias). */
    const own = uiSoundOf(tabEl?.config?.clickSound);
    const snd = own.sound ? own : uiSoundOf(game.settings.get("system-builder-engine", "theme")?.sounds?.tab);
    if (snd.sound) this.play(snd, `tab-${app.id}`);
  }
}
