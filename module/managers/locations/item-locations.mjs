/**
 * SBE — REGISTRE DES EMPLACEMENTS D'OBJETS
 *
 * UNE seule source de vérité pour répondre à « où peut se trouver un
 * objet ? ». Chaque endroit capable d'héberger un objet s'inscrit ici
 * une fois, en disant comment on y trouve les objets, comment on les
 * retire, et comment on les met à jour.
 *
 * Tout ce qui doit parcourir « tous les objets du monde » passe par
 * ce registre, et uniquement par lui :
 *   - la suppression en cascade (modèles d'atelier, modèles d'objets) ;
 *   - la propagation d'un modèle vers ses exemplaires ;
 *   - l'examen des orphelins au chargement du monde.
 *
 * Le jour où un nouvel emplacement apparaît — objets posés au sol,
 * tourelles déployées, marchands, pièges — il s'inscrit ici, et les
 * trois mécaniques ci-dessus le couvrent sans qu'on y touche. Avant ce
 * registre, la liste des endroits était recopiée à trois endroits du
 * code, et c'est en oubliant une copie qu'un objet devenait orphelin.
 *
 * FORME D'UN EMPLACEMENT :
 *   {
 *     id:        identifiant unique,
 *     order:     ordre de traitement des suppressions (petit = d'abord),
 *     collect(predicate) → [Trouvaille],
 *     removeMany?(trouvailles)   (sinon : chaque trouvaille.remove())
 *   }
 * FORME D'UNE TROUVAILLE :
 *   {
 *     view:   { id, name, img, type, system: { templateId, modelId,
 *               values, description, carry } } — la même forme pour
 *             tous les emplacements : c'est ce que lit le prédicat ;
 *     label:  où (« Jack », « Monde », « Coffre (Entrepôt) ») ;
 *     qty:    nombre d'exemplaires représentés (1 par défaut) ;
 *     item:   le document Foundry, s'il y en a un ;
 *     carried: vrai si porté par un personnage ;
 *     remove(): supprime ;
 *     update(changes): applique { name?, img?, description?, values? }
 *   }
 */

const REGISTRY = new Map();

/** Une collection Foundry (ou un simple tableau), en tableau. */
export function asArray(coll) {
  if (!coll) return [];
  if (Array.isArray(coll.contents)) return coll.contents;
  if (typeof coll[Symbol.iterator] === "function") return [...coll];
  return [];
}

/** Inscrit (ou remplace) un emplacement. */
export function registerItemLocation(loc) {
  if (!loc?.id || typeof loc.collect !== "function") return;
  REGISTRY.set(loc.id, loc);
}

/** Tous les objets, de tous les emplacements, qui répondent au critère. */
export function findItems(predicate) {
  const out = [];
  for (const loc of REGISTRY.values()) {
    try {
      for (const hit of loc.collect(predicate) ?? []) out.push({ ...hit, location: loc.id });
    } catch (err) {
      console.warn(`SBE | Emplacement « ${loc.id} » : recensement en échec`, err);
    }
  }
  return out;
}

/** Supprime une liste de trouvailles, emplacement par emplacement. */
export async function removeItems(hits) {
  const byLoc = new Map();
  for (const h of hits) {
    if (!byLoc.has(h.location)) byLoc.set(h.location, []);
    byLoc.get(h.location).push(h);
  }
  const locs = [...byLoc.keys()].map(id => REGISTRY.get(id)).filter(Boolean)
    .sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
  let done = 0;
  for (const loc of locs) {
    const list = byLoc.get(loc.id);
    try {
      if (typeof loc.removeMany === "function") { await loc.removeMany(list); done += list.length; continue; }
      for (const h of list) {
        try { await h.remove(); done++; }
        catch (err) { console.warn(`SBE | Emplacement « ${loc.id} » : suppression en échec`, err); }
      }
    } catch (err) {
      console.warn(`SBE | Emplacement « ${loc.id} » : suppression groupée en échec`, err);
    }
  }
  return done;
}

/** Nombre d'exemplaires représentés (une pile de coffre compte sa quantité). */
export function countUnits(hits) {
  return hits.reduce((n, h) => n + (Number(h.qty) || 1), 0);
}

/** Résumé lisible : « Jack ×2, Garde (Entrepôt), Monde ». */
export function summarize(hits, max = 6) {
  const by = new Map();
  for (const h of hits) by.set(h.label, (by.get(h.label) ?? 0) + (Number(h.qty) || 1));
  const parts = [...by.entries()].slice(0, max).map(([who, n]) => (n > 1 ? `${who} ×${n}` : who));
  if (by.size > max) parts.push(`+${by.size - max}`);
  return parts.join(", ");
}

/* ============================================================ */
/*  Emplacements du socle                                        */
/* ============================================================ */

/** Vue commune d'un objet-document. */
function docView(it) {
  return {
    id: it.id, name: it.name, img: it.img, type: it.type,
    system: {
      templateId: it.system?.templateId ?? "",
      modelId: it.system?.modelId ?? "",
      values: it.system?.values ?? {},
      description: it.system?.description ?? "",
      carry: it.system?.carry ?? {}
    }
  };
}

/** Trouvaille pour un objet-document. */
function docHit(it, label, carried) {
  return {
    view: docView(it),
    label,
    qty: 1,
    item: it,
    carried,
    remove: () => it.delete({ sbeCascade: true }),
    update: (c) => {
      const upd = {};
      if (c.name !== undefined) upd.name = c.name;
      if (c.img !== undefined) upd.img = c.img;
      if (c.description !== undefined) upd["system.description"] = c.description;
      for (const [k, v] of Object.entries(c.values ?? {})) upd[`system.values.${k}`] = v;
      return Object.keys(upd).length ? it.update(upd, { sbePropagation: true }) : null;
    }
  };
}

/** Les objets PORTÉS d'une fiche. */
function actorHits(actor, label, predicate) {
  const out = [];
  for (const it of actor?.items ?? []) {
    if (it.type !== "objet") continue;
    if (predicate(docView(it), it)) out.push(docHit(it, label, true));
  }
  return out;
}

/* Les objets portés partent en PREMIER : leur contenu se range au
   passage (une arme chargée rend ses balles), avant que les modèles
   dont ils dépendent ne disparaissent. */
registerItemLocation({
  id: "actors",
  order: 10,
  collect(predicate) {
    return asArray(game.actors).flatMap(a => actorHits(a, a.name, predicate));
  }
});

registerItemLocation({
  id: "tokens",
  order: 10,
  collect(predicate) {
    const out = [];
    for (const scene of asArray(game.scenes)) {
      for (const tok of asArray(scene.tokens)) {
        if (tok.actorLink) continue;            /* lié → déjà dans « actors » */
        let actor = null;
        try { actor = tok.actor; } catch (_e) { /* acteur synthétique indisponible */ }
        if (actor) out.push(...actorHits(actor, `${tok.name} (${scene.name})`, predicate));
      }
    }
    return out;
  }
});

/* Les objets du monde (modèles compris) passent en DERNIER. */
registerItemLocation({
  id: "world",
  order: 90,
  collect(predicate) {
    const label = game.i18n.localize("SBE.Propag.World");
    return asArray(game.items)
      .filter(it => it.type === "objet" && predicate(docView(it), it))
      .map(it => docHit(it, label, false));
  }
});
