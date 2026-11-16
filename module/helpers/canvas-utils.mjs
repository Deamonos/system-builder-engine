/**
 * SBE — Utilitaires canvas partagés
 *
 * Repris du premier système (éprouvés en jeu) :
 * - bouton d'annulation flottant unifié (Échap / clic droit / bouton) ;
 * - attente d'un clic de placement sur la scène ;
 * - phase d'orientation d'une tuile à la souris ;
 * - contrôle de distance acteur ↔ tuile en feet.
 */

/** Bouton d'annulation flottant (apparence unifiée SBE). */
export function createTargetingCancelButton(onCancel) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "sbe-target-cancel";
  btn.innerHTML = `<i class="fa-solid fa-xmark"></i> ${game.i18n.localize("SBE.Common.Cancel")}`;
  btn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    try { onCancel?.(); } catch (_e) { /* rien */ }
  });
  document.body.appendChild(btn);
  return () => { try { btn.remove(); } catch (_e) { /* rien */ } };
}

/**
 * Annulation unifiée d'une action de ciblage/placement :
 * Échap, clic droit sur le canvas, ou bouton flottant.
 * Usage : const cancel = createCancelHandle();
 *         cancel.setOnAbort(() => {...}); ... cancel.dispose();
 */
export function createCancelHandle() {
  let onAbort = null;
  let removeBtn = null;

  const cleanup = () => {
    window.removeEventListener("keydown", keyHandler, true);
    document.removeEventListener("keydown", keyHandler, true);
    document.removeEventListener("contextmenu", ctxHandler, true);
    if (removeBtn) { try { removeBtn(); } catch (_e) { /* rien */ } removeBtn = null; }
  };

  const trigger = (reason) => {
    if (onAbort) {
      const cb = onAbort;
      onAbort = null;
      cleanup();
      cb(reason);
    }
  };

  const keyHandler = (ev) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      trigger("escape");
    }
  };

  const ctxHandler = (ev) => {
    const canvasEl = canvas?.app?.view;
    if (!canvasEl) return;
    if (ev.target !== canvasEl && !canvasEl.contains(ev.target)) return;
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();
    trigger("rightclick");
  };

  window.addEventListener("keydown", keyHandler, true);
  document.addEventListener("keydown", keyHandler, true);
  document.addEventListener("contextmenu", ctxHandler, true);
  removeBtn = createTargetingCancelButton(() => trigger("button"));

  return {
    setOnAbort(cb) { onAbort = cb; },
    dispose: cleanup
  };
}

/**
 * Curseur de visée (cible) sur le plateau : on sait qu'on est prêt à
 * lancer, tirer ou frapper. Compté : plusieurs visées ne se gênent pas.
 */
let aimDepth = 0;
export function setAimCursor(on) {
  aimDepth = Math.max(0, aimDepth + (on ? 1 : -1));
  document.body.classList.toggle("sbe-aiming", aimDepth > 0);
}

/**
 * Attend un clic gauche sur la scène et renvoie sa position exacte
 * (sans snap). Annulable (Échap / clic droit / bouton) → null.
 */
export function awaitCanvasClick({ aim = false } = {}) {
  return new Promise((resolve) => {
    const stage = canvas.stage;
    if (!stage) { resolve(null); return; }
    if (aim) setAimCursor(true);

    const cleanup = () => {
      stage.off("mousedown", onClick);
      cancel.dispose();
      if (aim) setAimCursor(false);
    };
    const cancel = createCancelHandle();
    cancel.setOnAbort(() => { cleanup(); resolve(null); });

    const onClick = (event) => {
      const b = event?.data?.originalEvent?.button ?? event?.data?.button ?? 0;
      if (b !== 0) return;
      const p = (canvas.mousePosition && Number.isFinite(canvas.mousePosition?.x))
        ? { x: canvas.mousePosition.x, y: canvas.mousePosition.y }
        : ((typeof event.getLocalPosition === "function")
          ? event.getLocalPosition(canvas.stage)
          : event.data.getLocalPosition(canvas.stage));
      cleanup();
      resolve({ x: p.x, y: p.y });
    };
    stage.on("mousedown", onClick);
  });
}

/**
 * Phase d'orientation d'une tuile fraîchement posée : la tuile suit
 * le curseur en rotation ; molette = ajustement fin (Shift = 15°),
 * clic = valider, Échap / clic droit = garder l'orientation actuelle.
 */
export function chooseTileOrientation(tile) {
  return new Promise((resolve) => {
    const stage = canvas.stage;
    if (!stage) { resolve(); return; }

    const tileDoc = tile.document ?? tile;
    const cx = tileDoc.x;
    const cy = tileDoc.y;

    ui.notifications.info(game.i18n.localize("SBE.Canvas.OrientHint"));

    let lastUpdate = 0;
    let pendingRotation = null;
    let currentRotation = tileDoc.rotation ?? 0;
    let wheelMode = false;
    let lastMouseX = null, lastMouseY = null;

    const applyUpdate = (rotation, force = false) => {
      currentRotation = rotation;
      pendingRotation = rotation;
      const now = Date.now();
      if (force || now - lastUpdate > 120) {
        lastUpdate = now;
        const target = pendingRotation;
        pendingRotation = null;
        tileDoc.update({ rotation: target }).catch(() => {});
      }
    };

    const getPos = () => (canvas.mousePosition && Number.isFinite(canvas.mousePosition.x))
      ? { x: canvas.mousePosition.x, y: canvas.mousePosition.y }
      : (canvas.app?.renderer?.events?.pointer?.global
        ? stage.toLocal(canvas.app.renderer.events.pointer.global)
        : null);

    const onMove = () => {
      const pos = getPos();
      if (!pos) return;
      if (wheelMode) {
        if (lastMouseX !== null && lastMouseY !== null) {
          const dx = pos.x - lastMouseX, dy = pos.y - lastMouseY;
          if (dx * dx + dy * dy < 25) return;
        }
        wheelMode = false;
      }
      lastMouseX = pos.x; lastMouseY = pos.y;
      const dx = pos.x - cx, dy = pos.y - cy;
      const angleMath = Math.atan2(dy, dx) * 180 / Math.PI;
      const angleFoundry = (angleMath + 90 + 360) % 360;
      applyUpdate(Math.round(angleFoundry));
    };

    const onWheel = (event) => {
      event.preventDefault(); event.stopPropagation();
      wheelMode = true;
      const step = event.shiftKey ? 15 : 1;
      const delta = event.deltaY > 0 ? step : -step;
      applyUpdate(((currentRotation + delta) % 360 + 360) % 360, true);
    };

    const cleanup = () => {
      stage.off("mousemove", onMove);
      stage.off("mousedown", onClick);
      stage.off("rightdown", onCancel);
      const board = canvas.app?.view ?? document.getElementById("board");
      if (board) board.removeEventListener("wheel", onWheel, true);
      document.removeEventListener("keydown", onKey, true);
      removeCancelBtn();
      if (pendingRotation !== null) tileDoc.update({ rotation: pendingRotation }).catch(() => {});
    };

    const onClick = () => { cleanup(); resolve(); };
    const onCancel = () => { cleanup(); resolve(); };
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cleanup(); resolve(); }
    };
    const removeCancelBtn = createTargetingCancelButton(onCancel);

    stage.on("mousemove", onMove);
    stage.on("mousedown", onClick);
    stage.on("rightdown", onCancel);
    const board = canvas.app?.view ?? document.getElementById("board");
    if (board) board.addEventListener("wheel", onWheel, { capture: true, passive: false });
    document.addEventListener("keydown", onKey, true);
  });
}

/**
 * L'acteur a-t-il un token à moins de maxFeet (en feet) du centre de
 * la tuile ? 0 = sans limite. Le MJ passe toujours.
 */
export function isActorWithinFeet(actor, tileDoc, maxFeet) {
  if (game.user.isGM) return true;
  const max = Number(maxFeet ?? 0);
  if (max <= 0) return true;
  if (!actor) return false;

  const tokens = actor.getActiveTokens(true, true);
  if (!tokens?.length) return false;

  const scene = tileDoc.parent ?? canvas.scene;
  const gridSize = scene?.grid?.size ?? canvas.grid.size;
  const feetPerCell = scene?.grid?.distance ?? canvas.scene?.grid?.distance ?? 5;
  const maxPx = (max / feetPerCell) * gridSize;

  const c = { x: tileDoc.x, y: tileDoc.y };
  for (const t of tokens) {
    const tc = { x: t.x + (t.w ?? t.width ?? gridSize) / 2, y: t.y + (t.h ?? t.height ?? gridSize) / 2 };
    const dx = tc.x - c.x, dy = tc.y - c.y;
    if (Math.sqrt(dx * dx + dy * dy) <= maxPx) return true;
  }
  return false;
}


/**
 * Le pion d'un personnage sur la scène affichée. Un personnage de pion
 * NON LIÉ (créature posée, objet posé) est ce pion-là :
 * getActiveTokens(true) de Foundry ne rend que les pions liés.
 */
export function activeTokenOf(actor) {
  if (!actor) return null;
  if (actor.isToken) return actor.token?.object ?? null;
  return actor.getActiveTokens?.(true)?.[0] ?? null;
}

/**
 * Qui est concerné, par rapport à celui qui agit (zones persistantes,
 * étape « Choisir une cible ») : la même règle partout.
 *   all, notSelf, allies (lui compris), alliesNotSelf, enemies
 * Allié = même disposition ; ennemi = amical contre hostile.
 * `who` = { tokenId, actorUuid, disposition } de celui qui agit.
 */
export const TOUCH_MODES = ["all", "notSelf", "allies", "alliesNotSelf", "enemies"];
export function touchesBy(mode, who, tokenDoc) {
  if (!mode || mode === "all") return true;
  const isSelf = (!!who?.tokenId && tokenDoc?.id === who.tokenId) || (!!who?.actorUuid && tokenDoc?.actor?.uuid === who.actorUuid);
  if (mode === "notSelf") return !isSelf;
  const D = CONST.TOKEN_DISPOSITIONS;
  const me = Number(who?.disposition ?? D.NEUTRAL);
  const d = Number(tokenDoc?.disposition);
  const ally = isSelf || d === me;
  const enemy = !isSelf && ((me === D.FRIENDLY && d === D.HOSTILE) || (me === D.HOSTILE && d === D.FRIENDLY));
  if (mode === "allies") return ally;
  if (mode === "alliesNotSelf") return ally && !isSelf;
  if (mode === "enemies") return enemy;
  return true;
}
