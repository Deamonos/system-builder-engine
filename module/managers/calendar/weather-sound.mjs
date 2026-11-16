/**
 * SBE — MÉTÉO : les SONS
 *
 * Chaque client joue les sons du type de météo porté par la scène
 * active (une scène en intérieur n'en porte pas). Ils passent par le
 * canal « Environnement » de Foundry : chaque joueur règle son volume,
 * et peut tout couper (réglage « Sons météo »).
 *
 *   boucle    en continu ; fondu à l'arrivée et au départ (changement
 *             de météo : l'ancienne s'efface pendant que la nouvelle monte)
 *   aléatoire revient de temps en temps (entre min et max secondes)
 *   éclair    part avec l'éclair de la scène : l'éclair suit l'heure du
 *             serveur, le son part donc au même instant chez tous
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { sceneWeatherType } from "./scene-weather.mjs";
import { soundFiles, seeded } from "./calendar-model.mjs";

export const SOUND_SETTING = "weatherSounds";
const FADE_IN = 3000;       /* ms : une boucle qui arrive */
const FADE_OUT = 2000;      /* ms : tout ce qui joue encore quand la météo change */
const THUNDER_GAP = 2;      /* s : deux tonnerres ne se chevauchent pas plus vite */

const pick = (list) => list[Math.floor(Math.random() * list.length)];

export class WeatherSound {
  static #key = "";
  static #gen = 0;          /* change à chaque météo : les sons en retard sont jetés */
  static #loops = [];
  static #shots = new Set();  /* sons ponctuels en cours (tonnerre, météore…) */
  static #timers = [];
  static #flash = [];
  static #lastFlash = -Infinity;
  static #lastSecond = null;

  static init() {
    Hooks.on("canvasReady", () => this.refresh());
    Hooks.on("updateScene", (scene, changes) => { if (scene.id === canvas?.scene?.id && "weather" in changes) this.refresh(); });
    Hooks.on("sbeWeatherFlash", ({ second } = {}) => this.#onFlash(second));
  }

  static enabled() {
    try { return game.settings.get(SYSTEM_ID, SOUND_SETTING) !== false; } catch (_e) { return true; }
  }

  /** Relit la météo de la scène ; change les sons si elle a changé. */
  static refresh(force = false) {
    const type = this.enabled() && canvas?.ready ? sceneWeatherType() : null;
    const rows = type?.sounds ?? [];
    const key = rows.length ? JSON.stringify([type.id, rows]) : "";
    if (!force && key === this.#key) return;
    this.#key = key;
    this.#stop();
    const gen = ++this.#gen;
    this.#flash = rows.filter(r => r.mode === "flash");
    /* Sons ponctuels chargés d'avance : le tonnerre part avec l'éclair, sans attente de chargement. */
    for (const r of rows) {
      if (r.mode === "loop") continue;
      for (const src of soundFiles(r.src)) game.audio.preload?.(src)?.catch?.(() => null);
    }
    for (const r of rows) {
      if (r.mode === "loop") this.#loop(r, gen);
      else if (r.mode === "random") this.#schedule(r, gen);
    }
  }

  static #stop() {
    for (const t of this.#timers) clearTimeout(t);
    this.#timers = [];
    /* Tout s'efface en 2 s, y compris un long tonnerre en cours. */
    for (const s of [...this.#loops, ...this.#shots]) {
      try { s.stop({ fade: FADE_OUT }); } catch (_e) { /* déjà arrêté */ }
    }
    this.#loops = [];
    this.#shots.clear();
    this.#flash = [];
  }

  /** Joue un fichier sur le canal Environnement (attend que le navigateur autorise le son). */
  static async #play(src, { loop = false, volume = 1 } = {}) {
    if (!src) return null;
    try {
      if (game.audio.locked) await game.audio.unlock;
      return await game.audio.play(src, { loop, volume, context: game.audio.environment });
    } catch (err) {
      console.warn(`SBE | Son météo « ${src} » introuvable ou illisible`, err);
      return null;
    }
  }

  static async #loop(r, gen) {
    const sound = await this.#play(pick(soundFiles(r.src)), { loop: true, volume: 0 });
    if (!sound) return;
    if (gen !== this.#gen) { sound.stop(); return; }
    this.#loops.push(sound);
    sound.fade(r.volume, { duration: FADE_IN });
  }

  /** Un son ponctuel : suivi tant qu'il joue, pour pouvoir le couper. */
  static async #shot(r, gen) {
    const sound = await this.#play(pick(soundFiles(r.src)), { volume: r.volume });
    if (!sound) return;
    if (gen !== this.#gen) { sound.stop({ fade: FADE_OUT }); return; }
    this.#shots.add(sound);
    try { sound.addEventListener("end", () => this.#shots.delete(sound), { once: true }); } catch (_e) { /* sans événement : retiré au prochain changement */ }
  }

  static #schedule(r, gen) {
    const wait = (r.min + Math.random() * (r.max - r.min)) * 1000;
    const t = setTimeout(() => {
      this.#timers = this.#timers.filter(x => x !== t);
      if (gen !== this.#gen) return;
      this.#shot(r, gen);
      this.#schedule(r, gen);
    }, wait);
    this.#timers.push(t);
  }

  /**
   * Un éclair : sa distance (0 = tout près, 1 = au loin) est tirée sur la seconde
   * partagée, la même chez tous. Les lignes de cette distance sont candidates ;
   * le son arrive après un retard et baisse avec la distance.
   */
  static #onFlash(second) {
    if (!this.#flash.length || second === this.#lastSecond) return;
    this.#lastSecond = second;
    const now = performance.now() / 1000;
    if (now - this.#lastFlash < THUNDER_GAP) return;
    this.#lastFlash = now;
    const d = seeded(`thunder-d:${second}`);
    const far = d >= 0.5;
    const fits = this.#flash.filter(r => r.dist === "all" || r.dist === (far ? "far" : "near"));
    const list = fits.length ? fits : this.#flash;
    const r = list[Math.floor(seeded(`thunder-r:${second}`) * list.length) % list.length];
    const row = { ...r, volume: r.volume * (1 - d * r.fade / 100) };
    const wait = d * r.delay * 1000;
    if (wait < 30) { this.#shot(row, this.#gen); return; }
    const gen = this.#gen;
    const t = setTimeout(() => { this.#timers = this.#timers.filter(x => x !== t); if (gen === this.#gen) this.#shot(row, gen); }, wait);
    this.#timers.push(t);
  }
}
