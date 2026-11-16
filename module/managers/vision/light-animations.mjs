/**
 * SBE — ANIMATIONS DE LUMIÈRE
 *
 * Six animations maison ajoutées à CONFIG.Canvas.lightAnimations : elles
 * deviennent disponibles PARTOUT, exactement comme les animations de
 * Foundry (flamme, pulsation…) — lumières de scène, lumières des pions,
 * lumière des effets, lumière personnelle des visions.
 *
 * Chaque animation = { label, animation, colorationShader } :
 *   - animation : `animateTime` de Foundry (il n'alimente que les
 *     uniforms `time` et `intensity`) ;
 *   - colorationShader : un shader de coloration qui dessine l'effet en
 *     étendant AdaptiveColorationShader. La couleur reste celle de la
 *     lumière : le MJ choisit la teinte, l'animation fait le motif.
 *
 * Tout est calculé sur `time` (et le bruit natif de Foundry pour le
 * grain) : aucun motif ne dépend de la carte graphique.
 */

/** Les clés enregistrées (ordre d'affichage). */
export const SBE_LIGHT_ANIMATIONS = ["sbeScanline", "sbeAlert", "sbeNightGrain", "sbeRadar", "sbeNeon", "sbeShortCircuit"];

export class LightAnimations {

  static _done = false;

  /** À appeler dans « init ». */
  static init() {
    if (this._done) return;
    this._done = true;
    try { this._register(); }
    catch (err) { console.error("SBE | Animations de lumière : enregistrement en échec", err); }
  }

  static _register() {
    const Base = foundry.canvas?.rendering?.shaders?.AdaptiveColorationShader;
    const anims = CONFIG?.Canvas?.lightAnimations;
    if (!Base || !anims) {
      console.warn("SBE | Animations de lumière : API de Foundry introuvable");
      return;
    }
    /* `animateTime` : repris d'une animation native qui l'utilise. */
    const animateTime = anims.fog?.animation ?? CONFIG.Canvas.lightSourceClass?.prototype?.animateTime;
    if (typeof animateTime !== "function") {
      console.warn("SBE | Animations de lumière : animateTime introuvable");
      return;
    }

    /** Fabrique un shader de coloration autour d'un corps GLSL. */
    const shader = (body, { noise = false } = {}) => class extends Base {
      static _createFragmentShader() {
        return `
        ${this.SHADER_HEADER}
        ${this.PERCEIVED_BRIGHTNESS}
        ${noise ? this.PRNG : ""}
        ${noise ? this.NOISE : ""}

        void main() {
          ${this.FRAGMENT_BEGIN}
          ${body}
          ${this.COLORATION_TECHNIQUES}
          ${this.ADJUSTMENTS}
          ${this.FALLOFF}
          ${this.FRAGMENT_END}
        }`;
      }
    };

    /* Balayage d'écran : lignes horizontales + bande de rafraîchissement
       qui descend et reboucle. */
    const Scanline = shader(`
          float scan = 0.5 + 0.5 * sin(vUvs.y * 180.0);
          scan = mix(0.55, 1.0, scan);
          float sweepY = fract(time * 0.15);
          float sweep  = smoothstep(0.05, 0.0, abs(vUvs.y - sweepY));
          float b = scan + sweep * (0.4 + intensity * 0.08);
          finalColor = color * b * colorationAlpha;`);

    /* Alerte : battement nerveux, extinction courte, jamais noir. */
    const Alert = shader(`
          float beat = abs(sin(time * (3.0 + intensity * 0.5)));
          beat = pow(beat, 3.0);
          float b = mix(0.25, 1.4, beat);
          finalColor = color * b * colorationAlpha;`);

    /* Grain de vision nocturne : points ronds qui scintillent (clairs
       et sombres), trame fine de capteur, vignette douce. */
    const NightGrain = shader(`
          float frame = floor(time * 14.0);
          vec2  uvS   = vUvs * 42.0;
          vec2  cellS = floor(uvS);
          vec2  fracS = fract(uvS);
          float onS   = step(0.72, random(cellS + vec2(frame * 1.7, frame * 2.3)));
          float jxS   = 0.3 + 0.4 * random(cellS + vec2(11.0, 0.0) + frame * 0.13);
          float jyS   = 0.3 + 0.4 * random(cellS + vec2(0.0, 23.0) + frame * 0.13);
          float sel   = onS * smoothstep(0.06, 0.004, distance(fracS, vec2(jxS, jyS)));
          vec2  uvP   = vUvs * 46.0;
          vec2  cellP = floor(uvP + 13.0);
          vec2  fracP = fract(uvP + 13.0);
          float onP   = step(0.74, random(cellP + vec2(frame * 3.1 + 5.0, frame * 1.9 + 11.0)));
          float jxP   = 0.3 + 0.4 * random(cellP + vec2(7.0, 0.0) + frame * 0.17);
          float jyP   = 0.3 + 0.4 * random(cellP + vec2(0.0, 17.0) + frame * 0.17);
          float dark  = onP * smoothstep(0.06, 0.004, distance(fracP, vec2(jxP, jyP)));
          float fond  = (random(floor(vUvs * 150.0 + 7.0) + vec2(frame * 0.9, frame * 1.3)) - 0.5) * 0.15;
          float vignette = smoothstep(1.2, 0.1, dist);
          float baseB = clamp(0.55 + fond - dark * 0.7, 0.0, 1.0);
          vec3  col   = color * baseB;
          col = mix(col, vec3(1.0), clamp(sel * 1.3, 0.0, 1.0));
          col *= vignette;
          finalColor = col * colorationAlpha;`, { noise: true });

    /* Radar : un anneau fin part du centre, s'estompe et reboucle. */
    const Radar = shader(`
          float wave = fract(time * 0.4);
          float ring = smoothstep(0.03, 0.0, abs(dist - wave));
          ring *= (1.0 - wave);
          float b = 0.2 + ring * (1.0 + intensity * 0.2);
          finalColor = color * b * colorationAlpha;`);

    /* Néon défaillant : bégaie à l'allumage, se stabilise, coupe parfois. */
    const Neon = shader(`
          float t = time;
          float cyc  = fract(t * 0.27);
          float warm = smoothstep(0.0, 0.35, cyc);
          float buzz = 0.5 + 0.5 * sin(t * 47.0);
          float stut = mix(buzz, 1.0, warm);
          float dropS = sin(t * 1.7) * sin(t * 0.9 + 1.3);
          float drop  = smoothstep(-0.9, -0.7, dropS);
          float jitter = 0.92 + 0.08 * sin(t * 11.0 + sin(t * 2.3));
          float b = clamp(stut * drop * jitter, 0.04, 1.0);
          finalColor = color * b * colorationAlpha;`);

    /* Court-circuit : presque éteint, flashs blancs brefs et irréguliers. */
    const ShortCircuit = shader(`
          float t = time;
          float f1 = pow(max(0.0, sin(t * 2.3)),       40.0);
          float f2 = pow(max(0.0, sin(t * 3.7 + 1.1)), 60.0);
          float f3 = pow(max(0.0, sin(t * 5.1 + 2.7)), 80.0);
          float crackle = pow(max(0.0, sin(t * 37.0)), 6.0);
          float flash = max(f1, max(f2, f3));
          flash = max(flash, f2 * crackle);
          float b = 0.03 + flash * (1.6 + intensity * 0.1);
          vec3 col = color * b;
          col = mix(col, vec3(1.0), clamp(flash * 0.8, 0.0, 1.0));
          finalColor = col * colorationAlpha;`);

    const list = {
      sbeScanline: Scanline,
      sbeAlert: Alert,
      sbeNightGrain: NightGrain,
      sbeRadar: Radar,
      sbeNeon: Neon,
      sbeShortCircuit: ShortCircuit
    };
    for (const [key, colorationShader] of Object.entries(list)) {
      anims[key] = { label: `SBE.LightAnim.${key}`, animation: animateTime, colorationShader };
    }
  }
}
