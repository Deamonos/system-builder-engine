/**
 * SBE — GRAIN D'IMAGE d'un mode de vision
 *
 * Quand le pion à travers lequel on regarde a un mode de vision avec du
 * grain, un voile de bruit animé couvre la scène (pas l'interface).
 * Chaque client le dessine pour lui-même ; rien n'est écrit.
 */

const ID = "sbe-vision-grain";

export class VisionScreen {

  static _tex = null;

  /** Une petite texture de bruit, fabriquée une fois. */
  static _noise() {
    if (this._tex) return this._tex;
    const n = 128;
    const cnv = document.createElement("canvas");
    cnv.width = cnv.height = n;
    const ctx = cnv.getContext("2d");
    const img = ctx.createImageData(n, n);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.floor(Math.random() * 256);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    this._tex = cnv.toDataURL("image/png");
    return this._tex;
  }

  /** Grain de 0 (aucun) à 1. */
  static update(grain) {
    let el = document.getElementById(ID);
    if (!(grain > 0)) { el?.remove(); return; }
    if (!el) {
      const board = document.getElementById("board");
      if (!board) return;
      el = document.createElement("div");
      el.id = ID;
      el.style.backgroundImage = `url("${this._noise()}")`;
      board.after(el);
    }
    el.style.setProperty("--sbe-grain", String(Math.min(1, grain) * 0.35));
  }
}
