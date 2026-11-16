/**
 * SBE — TIRER DANS UNE TABLE ALÉATOIRE, pour tout le monde
 *
 * Une table « sans remise » note ses tirages sur elle-même : un joueur
 * n'a pas le droit de l'écrire (Foundry refusait, le bouton s'arrêtait).
 * Le tirage est donc fait par le MJ principal, une table à la fois (deux
 * joueurs qui tirent ensemble ne reçoivent jamais le même résultat), et
 * le résultat revient au joueur. Sans MJ : tirage simple, sans noter.
 */

import { onSocketMessage, emitSocket, isPrimaryGM, gmQueue } from "./socket.mjs";

const WAITING = new Map();
const TIMEOUT = 5000;

/** Branche les tirages demandés au MJ (appelé au démarrage, chez tous). */
export function initTableDraw() {
  onSocketMessage(onMessage);
}

async function onMessage(p) {
  if (p?.type === "sbeTableDone") {
    if (p.to === game.user.id && game.users.get(p._from)?.isGM) WAITING.get(p.nonce)?.(p);
    return;
  }
  if (p?.type !== "sbeTableDraw" || !isPrimaryGM()) return;
  const table = game.tables?.get(p.table);
  const user = game.users.get(p._from);
  const out = { type: "sbeTableDone", nonce: p.nonce, to: p._from, ids: [], roll: null };
  if (table && user && table.testUserPermission(user, "LIMITED")) {
    const d = await gmQueue(`table:${table.id}`, () => table.draw({ displayChat: !!p.chat })).catch(() => null);
    out.ids = (d?.results ?? []).map(r => r.id);
    out.roll = d?.roll?.toJSON?.() ?? null;
  }
  emitSocket(out);
}

/**
 * Tire dans une table.
 * @returns {Promise<{roll: Roll|null, results: TableResult[]}>}
 */
export async function drawTable(table, { chat = false } = {}) {
  if (!table) return { roll: null, results: [] };
  if (table.isOwner) {
    if (isPrimaryGM()) return gmQueue(`table:${table.id}`, () => table.draw({ displayChat: chat }));
    return table.draw({ displayChat: chat });
  }
  if (!game.users.activeGM) {
    const d = await table.roll();
    return { roll: d?.roll ?? null, results: d?.results ?? [] };
  }
  const nonce = foundry.utils.randomID();
  const reply = await new Promise((resolve) => {
    const timer = setTimeout(() => { WAITING.delete(nonce); resolve(null); }, TIMEOUT);
    WAITING.set(nonce, (p) => { clearTimeout(timer); WAITING.delete(nonce); resolve(p); });
    emitSocket({ type: "sbeTableDraw", nonce, table: table.id, chat: !!chat });
  });
  if (!reply) return { roll: null, results: [] };
  return {
    roll: reply.roll ? Roll.fromData(reply.roll) : null,
    results: (reply.ids ?? []).map(id => table.results.get(id)).filter(Boolean)
  };
}
