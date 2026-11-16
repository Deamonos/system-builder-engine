/**
 * SBE — Étapes en phrases : les BLOCS
 *
 *   { type: "if", formula, then: [étapes], else: [étapes] }
 *       « Si… alors… sinon… » (la formule se compose en phrases) ;
 *   { type: "result", crit: [], success: [], fail: [], fumble: [] }
 *       « Selon le résultat du jet » : le dernier jet ou la dernière
 *       attaque (réussite critique, réussite, échec, échec critique).
 * Deux niveaux d'imbrication au plus (un bloc dans un bloc).
 *
 * À l'exécution, les blocs sont COMPILÉS en une liste plate avec des
 * sauts (_if, _switch, _jump) : l'exécuteur reste une boucle simple, et
 * une reprise après « Attendre » (un rang dans la liste) reste juste,
 * même à l'intérieur d'un bloc.
 */

export const BLOCK_TYPES = ["if", "result"];
/* Branches de chaque bloc, dans l'ordre. */
export const BLOCK_BRANCHES = { if: ["then", "else"], result: ["crit", "success", "fail", "fumble"] };
/* Issue d'un jet → branche de « Selon le résultat ». */
export const OUTCOME_BRANCH = { critSuccess: "crit", success: "success", done: "success", failure: "fail", critFailure: "fumble" };

const listOf = (x) => (Array.isArray(x) ? x : []).filter(st => st?.type);

/** Toutes les étapes, blocs ouverts (pour chercher une attaque, une cible…). */
export function flatSteps(list) {
  const out = [];
  for (const st of listOf(list)) {
    out.push(st);
    for (const b of BLOCK_BRANCHES[st.type] ?? []) out.push(...flatSteps(st[b]));
  }
  return out;
}

/**
 * Liste plate exécutable. Les étapes dans un bloc portent `_inBlock`
 * (elles ne grisent pas le bouton d'avance : on ne sait pas si elles
 * seront jouées).
 */
export function compileSteps(list, out = [], inBlock = false) {
  for (const st of listOf(list)) {
    if (st.type === "if") {
      const head = { type: "_if", formula: st.formula ?? "", onlyIf: st.onlyIf, _inBlock: inBlock };
      out.push(head);
      compileSteps(st.then, out, true);
      const jump = { type: "_jump", _inBlock: true };
      out.push(jump);
      head.else = out.length;
      compileSteps(st.else, out, true);
      jump.to = head.end = out.length;
    } else if (st.type === "result") {
      const head = { type: "_switch", targets: {}, onlyIf: st.onlyIf, _inBlock: inBlock };
      out.push(head);
      const jumps = [];
      for (const b of BLOCK_BRANCHES.result) {
        head.targets[b] = out.length;
        compileSteps(st[b], out, true);
        const j = { type: "_jump", _inBlock: true };
        out.push(j);
        jumps.push(j);
      }
      head.end = out.length;
      for (const j of jumps) j.to = out.length;
    } else out.push(inBlock ? { ...st, _inBlock: true } : st);
  }
  return out;
}
