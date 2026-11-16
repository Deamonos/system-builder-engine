/**
 * SBE — LE CIEL DESSINÉ (horloge, calendrier)
 *
 * Un dôme : dégradé de ciel selon l'heure et la météo, soleil ou lune
 * sur leur arc, étoiles, collines, et des COUCHES de météo (nuages,
 * pluie, neige, éclairs, brume, aurores…) allumées par les mots du type
 * de météo (data-w) et colorées par ses couleurs (variables CSS).
 * Tout est en CSS (styles/managers/calendar.css) : ici, le balisage et
 * la peinture d'un instant.
 */

import { WEATHER_COLORS } from "./calendar-model.mjs";

const rng = (n, f) => Array.from({ length: n }, (_, i) => f(i)).join("");

/* Bouffées d'un nuage : [x, y, rayon] — trois silhouettes. */
const PUFFS = [
  [[22, 40, 13], [42, 31, 18], [68, 25, 23], [94, 35, 16], [108, 43, 9]],
  [[18, 43, 11], [36, 34, 16], [60, 28, 21], [82, 31, 18], [102, 41, 12]],
  [[26, 39, 15], [52, 27, 22], [78, 33, 17], [98, 42, 10]]
];

/** Un nuage en deux tons, bords nets, base plate. */
function cloud(n, puffs) {
  const xs = puffs.flatMap(([x, , r]) => [x - r, x + r]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const bottom = Math.max(...puffs.map(([, y, r]) => y + r * 0.55));
  const shape = puffs.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join("") + `<rect x="${x0}" y="${bottom - 14}" width="${x1 - x0}" height="14" rx="7"/>`;
  const lobes = puffs.map(([x, y, r]) => `<circle cx="${x + r * 0.3}" cy="${y + r * 0.45}" r="${r * 0.75}" fill="var(--sbe-wx-c2)" opacity=".5"/>`).join("");
  return `<svg viewBox="0 0 120 56"><defs><clipPath id="sbe-cl-${n}">${shape}</clipPath></defs><g fill="var(--sbe-wx-c2)">${shape}</g>`
    + `<g clip-path="url(#sbe-cl-${n})"><rect x="0" y="0" width="120" height="${bottom - 10}" fill="var(--sbe-wx-c1)"/>${lobes}</g></svg>`;
}

const BOLT = '<svg viewBox="0 0 20 50"><path d="M12 0 L3 24 L10 24 L5 50 L18 18 L11 18 L16 0 Z"/></svg>';
const ARC = '<svg viewBox="0 0 40 20"><path d="M2 10 L8 4 L12 14 L18 2 L23 16 L29 6 L34 12 L38 8" fill="none" stroke-width="1.5"/></svg>';

/** Le balisage du dôme (une fois par fenêtre ; `uid` évite les ids SVG en double). */
export function skyHtml(uid = "k") {
  const stars = rng(26, i => `<i style="left:${(i * 37) % 100}%;top:${(i * 53) % 60}%;animation-delay:${(i % 7) * 0.4}s"></i>`);
  const drops = rng(54, i => `<i style="left:${(i * 13) % 104 - 2}%;animation-delay:-${((i * 0.137) % 1).toFixed(2)}s;animation-duration:${(0.55 + (i % 4) * 0.09).toFixed(2)}s;opacity:${(0.35 + (i % 3) * 0.22).toFixed(2)};height:${9 + (i % 3) * 4}px"></i>`);
  const splash = rng(18, i => `<b style="left:${(i * 23) % 100}%;animation-delay:-${((i * 0.19) % 0.9).toFixed(2)}s"></b>`);
  const fall = rng(36, i => `<i style="left:${(i * 17) % 100}%;animation-delay:-${((i * 0.71) % 5).toFixed(2)}s;animation-duration:calc(var(--sbe-wx-fd) * ${(0.8 + (i % 5) * 0.12).toFixed(2)});--k:${(0.6 + (i % 4) * 0.3).toFixed(1)};opacity:${(0.55 + (i % 3) * 0.2).toFixed(2)}"></i>`);
  const clouds = rng(5, i => `<i style="top:${-12 + (i * 13) % 28}%;animation-delay:-${i * 8.3}s;animation-duration:${28 + (i % 3) * 9}s;--s:${(0.45 + (i % 3) * 0.2).toFixed(2)};opacity:${0.85 + (i % 2) * 0.15}">${cloud(`${uid}-${i}`, PUFFS[i % 3])}</i>`);
  const fog = [[5, 26, 0.55], [30, 34, 0.7], [52, 22, 0.6], [70, 40, 0.8]].map(([t, d, o]) => `<i style="top:${t}%;animation-duration:${d}s;animation-delay:-${(d / 3).toFixed(1)}s;opacity:${o}"></i>`).join("");
  const sparks = rng(22, i => `<i style="left:${(i * 29) % 100}%;top:${(i * 41) % 80}%;animation-delay:${(i % 9) * 0.3}s"></i>`);
  const dust = rng(26, i => `<i style="left:${(i * 19) % 100}%;animation-delay:-${((i * 1.3) % 9).toFixed(1)}s;animation-duration:${7 + (i % 4) * 2}s;--z:${(1.5 + (i % 3) * 0.8).toFixed(1)}px"></i>`);
  const wind = rng(28, i => `<i style="top:${(i * 23) % 90}%;animation-delay:-${((i * 0.37) % 2.4).toFixed(2)}s;animation-duration:${(1.6 + (i % 4) * 0.4).toFixed(1)}s;--k:${(0.5 + (i % 3) * 0.4).toFixed(1)}"></i>`);
  const meteors = rng(7, i => `<i style="left:${(i * 31) % 100}%;top:${(i * 17) % 40}%;animation-delay:${((i * 1.7) % 6).toFixed(1)}s"></i>`);
  const floats = rng(14, i => `<i style="left:${(i * 27) % 100}%;top:${20 + (i * 31) % 60}%;animation-delay:-${((i * 0.9) % 6).toFixed(1)}s;--z:${3 + (i % 4) * 2}px"></i>`);
  return `<div class="sbe-sky" data-w="">
    <div class="sbe-sky-stars">${stars}</div>
    <svg class="sbe-sky-arc" viewBox="0 0 300 52" preserveAspectRatio="none" aria-hidden="true"><path d="M8 50 Q150 -22 292 50" fill="none" stroke-dasharray="3 5"/></svg>
    <i class="sbe-sky-sun"></i><i class="sbe-sky-moon"><b></b></i>
    <div class="sbe-wl sbe-wl-aurora"><i></i><i></i><i></i></div><div class="sbe-wl sbe-wl-haze"><i></i><i></i></div>
    <div class="sbe-wl sbe-wl-clouds">${clouds}</div><div class="sbe-wl sbe-wl-fog">${fog}</div>
    <div class="sbe-wl sbe-wl-rain">${drops}<span class="sbe-wl-splash">${splash}</span></div>
    <div class="sbe-wl sbe-wl-fall">${fall}</div><div class="sbe-wl sbe-wl-wind">${wind}</div>
    <div class="sbe-wl sbe-wl-dust">${dust}</div><div class="sbe-wl sbe-wl-float">${floats}</div><div class="sbe-wl sbe-wl-meteor">${meteors}</div>
    <div class="sbe-wl sbe-wl-flash"><span class="sbe-bolt b1">${BOLT}</span><span class="sbe-bolt b2">${BOLT}</span><span class="sbe-arc a1">${ARC}</span><span class="sbe-arc a2">${ARC}</span><span class="sbe-arc a3">${ARC}</span></div>
    <div class="sbe-wl sbe-wl-spark">${sparks}</div><div class="sbe-wl sbe-wl-heat"></div><div class="sbe-wl sbe-wl-corona"></div>
    <svg class="sbe-sky-hills" viewBox="0 0 300 20" preserveAspectRatio="none" aria-hidden="true"><path d="M0 20 L0 14 C20 9 40 8 62 12 S104 7 130 10 S180 14 205 9 S262 6 300 11 L300 20Z"/></svg>
  </div>`;
}

/** Le dégradé de ciel d'un instant sans météo particulière. */
function naturalSky(hour, sunrise, sunset) {
  const up = hour >= sunrise && hour < sunset;
  if (!up) return "linear-gradient(#03050f, #0d1433 60%, #1b2347)";
  const d = (hour - sunrise) / Math.max(0.01, sunset - sunrise);
  if (d < 0.1 || d > 0.9) return "linear-gradient(#2c3a6e 0%, #8a5a8c 45%, #f0905a 85%, #ffcf8a 100%)";
  const k = Math.sin(d * Math.PI);
  return `linear-gradient(hsl(212 ${45 + k * 15}% ${30 + k * 28}%), hsl(200 55% ${55 + k * 22}%))`;
}

/**
 * Peint un dôme pour un instantané du calendrier.
 * @param {HTMLElement} sky   l'élément .sbe-sky
 * @param {object} snap       CalendarManager.snapshot()
 * @param {object} [o]        { hourOf: heure décimale, hoursPerDay }
 */
export function paintSky(sky, snap, { hour, hoursPerDay = 24 } = {}) {
  if (!sky) return;
  const type = snap.wx?.type ?? null;
  const { sunrise, sunset } = snap.sun;
  const h = hour ?? ((snap.comp.hour ?? 0) + (snap.comp.minute ?? 0) / 60);
  const up = h >= sunrise && h < sunset;
  const night = !up;
  /* Position sur l'arc : soleil de lever à coucher, lune de coucher à lever. */
  const p = up ? (h - sunrise) / Math.max(0.01, sunset - sunrise)
    : (((h - sunset) + hoursPerDay) % hoursPerDay) / Math.max(0.01, hoursPerDay - (sunset - sunrise));
  const sun = sky.querySelector(".sbe-sky-sun"), moon = sky.querySelector(".sbe-sky-moon");
  const orb = up ? sun : moon;
  if (sun) sun.style.opacity = up ? 1 : 0;
  if (moon) moon.style.opacity = up ? 0 : 1;
  if (orb) { orb.style.left = `${5 + p * 90}%`; orb.style.top = `${90 - Math.sin(p * Math.PI) * 70}%`; }
  /* La lune montre sa phase (ombre glissée). */
  const shade = moon?.querySelector("b");
  const m0 = snap.moons?.[0];
  if (shade) {
    /* Croissante : l'ombre glisse vers la gauche ; décroissante : elle revient par la droite. */
    const f = m0?.frac ?? 0.5;
    shade.style.transform = `translateX(${Math.round(f < 0.5 ? -f * 200 : 200 - f * 200)}%)`;
  }

  let grad = naturalSky(h, sunrise, sunset);
  if (type?.sky) { const [a, b] = night ? type.sky.night : type.sky.day; grad = `linear-gradient(${a}, ${b})`; }
  sky.style.setProperty("--sbe-sky", grad);
  const layers = type?.layers ?? [];
  sky.dataset.w = layers.join(" ");
  const colors = { ...WEATHER_COLORS, ...(type?.colors ?? {}) };
  for (const [k, v] of Object.entries(colors)) sky.style.setProperty(`--sbe-wx-${k}`, v);
  /* Nuages : cinq tons à partir d'un seul, plus sombres si « dark ». */
  const dark = layers.includes("dark");
  sky.style.setProperty("--sbe-wx-c1", dark ? `color-mix(in srgb, ${colors.cloud} 60%, #4a5260)` : colors.cloud);
  sky.style.setProperty("--sbe-wx-c2", dark ? `color-mix(in srgb, ${colors.cloud} 35%, #363c46)` : `color-mix(in srgb, ${colors.cloud} 78%, #8d9db2)`);
  /* Étoiles : la nuit, ciel dégagé. */
  const starry = night && !type?.sky && !layers.includes("clouds") && !layers.includes("fog");
  sky.style.setProperty("--sbe-st", starry ? 0.9 : (layers.includes("meteor") || layers.includes("eclipse") ? 0.8 : 0));
  sky.classList.toggle("is-night", night);
}
