/**
 * SBE — Démo « Brumeval » : OBJETS et PERSONNAGES
 *
 * Les objets du monde (modèles d'objets), puis les fiches. Les valeurs sont
 * écrites par clé (K) ; `tpl` désigne le modèle d'atelier par son id interne
 * à la démo (voir demo-build.mjs).
 */

const A = "systems/system-builder-engine/assets/demo";

export function demoItems(L) {
  const { T, K, V } = L;
  const it = (id, tpl, name, img, values = {}, extra = {}) => ({ id, tpl, name, img, values, ...extra });
  const desc = (fr, en) => `<p>${T(fr, en)}</p>`;
  /* Taille dans un sac en grille spatiale (largeur × hauteur, en cases). */
  const SIZE = {
    epee: [1, 3], dague: [1, 2], hache: [2, 3], masse: [1, 3], baton: [1, 4], arc: [1, 4],
    fleches: [1, 2], fleches_feu: [1, 2], cuir: [2, 2], mailles: [2, 3], bouclier_bois: [2, 2], bouclier_fer: [2, 2],
    torche: [1, 2], os: [1, 2]
  };
  return [
    /* Armes */
    it("epee", "weapon", T("Épée longue", "Longsword"), "icons/weapons/swords/sword-guard-brass-worn.webp",
      { [K.categorie]: V.weaponCats[0], [K.degats]: "1d8", [K.type_degats]: V.dmgTypes[0], [K.portee]: 1, [K.poids]: 1.5, [K.prix]: 1500 },
      { description: desc("Une lame droite, bien équilibrée. Le choix de tout aventurier.", "A straight, well-balanced blade. Every adventurer's choice.") }),
    it("dague", "weapon", T("Dague", "Dagger"), "icons/weapons/daggers/dagger-simple-black.webp",
      { [K.categorie]: V.weaponCats[0], [K.degats]: "1d4", [K.type_degats]: V.dmgTypes[1], [K.bonus_toucher]: 1, [K.portee]: 1, [K.poids]: 0.5, [K.prix]: 200 },
      { description: desc("Courte et facile à cacher. Elle touche plus facilement (+1).", "Short and easy to hide. It hits more easily (+1).") }),
    it("hache", "weapon", T("Hache de bataille", "Battle axe"), "icons/weapons/axes/axe-battle-blackened.webp",
      { [K.categorie]: V.weaponCats[0], [K.degats]: "1d10", [K.type_degats]: V.dmgTypes[0], [K.portee]: 1, [K.poids]: 2.5, [K.prix]: 2000, [K.rarete]: V.rarities[1] },
      { description: desc("Lourde et brutale, elle fend boucliers et armures.", "Heavy and brutal, it splits shields and armor.") }),
    it("masse", "weapon", T("Masse d'armes", "Mace"), "icons/weapons/maces/mace-round-steel.webp",
      { [K.categorie]: V.weaponCats[0], [K.degats]: "1d6", [K.type_degats]: V.dmgTypes[2], [K.portee]: 1, [K.poids]: 2, [K.prix]: 800 },
      { description: desc("Une tête d'acier ronde montée sur un manche ferré.", "A round steel head on an iron-shod haft.") }),
    it("baton", "weapon", T("Bâton de mage", "Mage's staff"), "icons/weapons/staves/staff-ornate-blue-jewel.webp",
      { [K.categorie]: V.weaponCats[0], [K.degats]: "1d6", [K.type_degats]: V.dmgTypes[2], [K.portee]: 1, [K.poids]: 1.5, [K.prix]: 500, [K.rarete]: V.rarities[1] },
      { description: desc("Un bâton de frêne serti d'un cristal bleu, qui tient à distance autant qu'il canalise.", "An ash staff set with a blue crystal, as good for keeping foes away as for channeling.") }),
    it("arc", "weapon", T("Arc long", "Longbow"), "icons/weapons/bows/longbow-recurve-brown.webp",
      { [K.categorie]: V.weaponCats[1], [K.degats]: "1d8", [K.type_degats]: V.dmgTypes[1], [K.portee]: 12, [K.poids]: 1, [K.prix]: 2500 },
      { description: desc("Tire jusqu'à 12 cases. Chaque tir consomme une flèche portée.", "Shoots up to 12 squares. Each shot uses up a carried arrow.") }),
    /* Munitions */
    it("fleches", "ammo", T("Flèches", "Arrows"), "icons/weapons/ammunition/arrow-broadhead.webp",
      { quantity: 20, [K.degats]: 0, [K.poids]: 0.05, [K.prix]: 5 },
      { description: desc("Des flèches à pointe large, en carquois de vingt.", "Broadhead arrows, in a quiver of twenty.") }),
    it("fleches_feu", "ammo", T("Flèches enflammées", "Fire arrows"), "icons/weapons/ammunition/arrow-broadhead-glowing-orange.webp",
      { quantity: 10, [K.degats]: 2, [K.poids]: 0.05, [K.prix]: 25, [K.rarete]: V.rarities[1] },
      { description: desc("Enduites de poix : elles ajoutent 2 dégâts de feu au tir.", "Coated in pitch: they add 2 fire damage to the shot.") }),
    /* Armures et boucliers */
    it("cuir", "armor", T("Armure de cuir", "Leather armor"), "icons/equipment/chest/breastplate-banded-simple-leather-brown.webp",
      { [K.type_armure]: V.armorTypes[0], [K.bonus_defense]: 2, [K.poids]: 5, [K.prix]: 1000 },
      { description: desc("Du cuir bouilli, souple et silencieux.", "Boiled leather, supple and quiet.") }),
    it("mailles", "armor", T("Cotte de mailles", "Chain mail"), "icons/equipment/chest/breastplate-scale-grey.webp",
      { [K.type_armure]: V.armorTypes[1], [K.bonus_defense]: 4, [K.poids]: 12, [K.prix]: 5000 },
      { description: desc("Des milliers d'anneaux d'acier. Solide, mais lourde.", "Thousands of steel rings. Sturdy, but heavy.") }),
    it("bouclier_bois", "shield", T("Bouclier en bois", "Wooden shield"), "icons/equipment/shield/buckler-wooden-boss-brown.webp",
      { [K.bonus_defense]: 1, [K.poids]: 3, [K.prix]: 500 },
      { description: desc("Un rond de chêne cerclé de fer.", "A round of oak rimmed with iron.") }),
    it("bouclier_fer", "shield", T("Bouclier de fer", "Iron shield"), "icons/equipment/shield/buckler-iron-cross-gray.webp",
      { [K.bonus_defense]: 2, [K.res_feu]: 2, [K.poids]: 5, [K.prix]: 1800, [K.rarete]: V.rarities[1] },
      { description: desc("Plaque de fer martelé. Il protège aussi des flammes.", "Hammered iron plate. It also shields from flames.") }),
    /* Consommables */
    it("potion_soin", "consumable", T("Potion de soin", "Healing potion"), "icons/consumables/potions/bottle-round-corked-red.webp",
      { quantity: 1, [K.effet_conso]: V.consoEffects[0], [K.soin]: "2d4 + 2", [K.poids]: 0.3, [K.prix]: 500 },
      { description: desc("Un liquide rouge et tiède qui referme les plaies.", "A warm red liquid that closes wounds.") }),
    it("potion_mana", "consumable", T("Potion de mana", "Mana potion"), "icons/consumables/potions/bottle-corked-blue.webp",
      { quantity: 1, [K.effet_conso]: V.consoEffects[1], [K.mana_rendue]: "1d6 + 2", [K.poids]: 0.3, [K.prix]: 600 },
      { description: desc("Un liquide bleu qui pétille sur la langue et rend des forces magiques.", "A blue liquid that fizzes on the tongue and restores magical strength.") }),
    it("antidote", "consumable", T("Antidote", "Antidote"), "icons/consumables/potions/bottle-corked-green.webp",
      { quantity: 1, [K.effet_conso]: V.consoEffects[2], [K.poids]: 0.3, [K.prix]: 400, [K.rarete]: V.rarities[1] },
      { description: desc("Amer et vert. Il chasse le poison du corps.", "Bitter and green. It drives poison from the body.") }),
    /* Sorts */
    it("boule_feu", "spell", T("Boule de feu", "Fireball"), "icons/magic/fire/explosion-fireball-large-red-orange.webp",
      { [K.ecole]: V.schools[0], [K.nature]: T("Dégâts", "Damage"), [K.niveau_sort]: 2, [K.cout_mana]: 4, [K.degats]: "3d6", [K.portee]: 10, [K.gabarit]: V.shapes[0] },
      { description: desc("Une sphère de flammes qui éclate au point visé. Les créatures prises dedans font un jet d'agilité pour n'en subir que la moitié.", "A sphere of flame that bursts at the chosen point. Creatures caught inside make an agility roll to take only half.") }),
    it("eclair", "spell", T("Éclair", "Lightning bolt"), "icons/magic/lightning/bolt-forked-blue.webp",
      { [K.ecole]: V.schools[1], [K.nature]: T("Dégâts", "Damage"), [K.niveau_sort]: 2, [K.cout_mana]: 3, [K.degats]: "2d8", [K.portee]: 8, [K.gabarit]: V.shapes[1] },
      { description: desc("Un trait de foudre en ligne droite, depuis le lanceur.", "A straight line of lightning, from the caster.") }),
    it("soin", "spell", T("Soins", "Cure wounds"), "icons/magic/life/heart-cross-green.webp",
      { [K.ecole]: V.schools[2], [K.nature]: T("Soin", "Healing"), [K.niveau_sort]: 1, [K.cout_mana]: 3, [K.degats]: "2d4 + 2", [K.portee]: 1 },
      { description: desc("Le clerc impose les mains : la cible regagne des points de vie.", "The cleric lays on hands: the target regains hit points.") }),
    it("benediction", "spell", T("Bénédiction", "Blessing"), "icons/magic/holy/prayer-hands-glowing-yellow.webp",
      { [K.ecole]: V.schools[2], [K.nature]: T("Bénédiction", "Blessing"), [K.niveau_sort]: 1, [K.cout_mana]: 2, [K.degats]: "0", [K.portee]: 6 },
      { description: desc("Les alliés proches reçoivent la bénédiction : un bonus à leurs jets pendant le combat.", "Nearby allies receive the blessing: a bonus to their rolls during the fight.") }),
    it("bouclier_magique", "spell", T("Bouclier magique", "Magic shield"), "icons/magic/defensive/shield-barrier-blue.webp",
      { [K.ecole]: V.schools[3], [K.nature]: T("Bouclier", "Shield"), [K.niveau_sort]: 1, [K.cout_mana]: 2, [K.degats]: "1d6 + 4", [K.portee]: 0 },
      { description: desc("Une barrière de lumière bleue qui absorbe les prochains coups.", "A barrier of blue light that soaks up the next blows.") }),
    it("lumiere", "spell", T("Lumière sacrée", "Holy light"), "icons/magic/light/beam-rays-yellow.webp",
      { [K.ecole]: V.schools[2], [K.nature]: T("Lumière sacrée", "Holy light"), [K.niveau_sort]: 1, [K.cout_mana]: 2, [K.degats]: "2d6", [K.portee]: 6 },
      { description: desc("Un rayon de lumière de l'Aube. Il ne blesse que les morts-vivants.", "A ray of Dawn's light. It only harms the undead.") }),
    /* Classes */
    it("guerrier", "class", T("Guerrier", "Warrior"), "icons/sundries/books/book-backed-silver-red.webp",
      { [K.bonus_pv]: 6, [K.bonus_attaque]: 2 }, { description: desc("Le combattant de première ligne.", "The front-line fighter.") }),
    it("mage", "class", T("Mage", "Mage"), "icons/sundries/books/book-backed-blue-gold.webp",
      { [K.bonus_mana]: 8 }, { description: desc("Maître des arcanes.", "Master of the arcane.") }),
    it("voleur", "class", T("Voleur", "Rogue"), "icons/sundries/books/book-backed-silver-gold.webp",
      { [K.bonus_pv]: 2, [K.crochetage]: 2 }, { description: desc("Discret et adroit de ses doigts.", "Stealthy and nimble-fingered.") }),
    it("clerc", "class", T("Clerc", "Cleric"), "icons/magic/holy/chalice-glowing-gold.webp",
      { [K.bonus_pv]: 4, [K.bonus_mana]: 4 }, { description: desc("Serviteur de la lumière.", "Servant of the light.") }),
    /* Outils */
    it("crochets", "tool", T("Outils de crochetage", "Thieves' tools"), "icons/tools/hand/lockpicks-steel-grey.webp",
      { [K.crochetage]: 2, [K.duree]: 0, [K.poids]: 0.5, [K.prix]: 2500 },
      { description: desc("Crochets et tendeurs. Ils ouvrent la porte de la maison, et ajoutent leur bonus au jet.", "Picks and tension wrenches. They open the house door, and add their bonus to the roll.") }),
    it("torche", "tool", T("Torche", "Torch"), "icons/sundries/lights/torch-brown.webp",
      { [K.duree]: 60, [K.autonomie]: 60, [K.allume]: false, [K.poids]: 1, [K.prix]: 10 },
      { description: desc("Allumée et portée, elle éclaire autour de vous pendant une heure de jeu.", "Lit and carried, it lights up your surroundings for one hour of game time.") }),
    /* Divers */
    it("cle", "misc", T("Clé de la maison", "House key"), "icons/sundries/misc/key-brass.webp",
      { quantity: 1, [K.poids]: 0.1, [K.prix]: 0 }, { description: desc("Elle ouvre la porte de la maison, sans jet. Mère Grisonne la garde sur elle.", "It opens the house door, without a roll. Mother Greyhair keeps it on her.") }),
    it("lettre", "misc", T("Lettre scellée", "Sealed letter"), "icons/sundries/documents/document-sealed-brown-red.webp",
      { quantity: 1, [K.poids]: 0.1, [K.prix]: 0 }, { description: desc("Scellée à la cire rouge, adressée à Mère Grisonne.", "Sealed with red wax, addressed to Mother Greyhair.") }),
    it("gemme", "misc", T("Saphir", "Sapphire"), "icons/commodities/gems/gem-faceted-asscher-blue.webp",
      { quantity: 1, [K.poids]: 0.1, [K.prix]: 5000, [K.rarete]: V.rarities[2] },
      { description: desc("Une pierre taillée d'un bleu profond. Un marchand en donnera un bon prix.", "A cut stone of deep blue. A merchant will pay well for it.") }),
    /* Objets de scène */
    it("levier", "mechanism", T("Levier de la maison", "House lever"), `${A}/tokens/levier-haut.webp`, { [K.abaisse]: false },
      { description: desc("Un vieux levier rouillé. Il commande la porte de la cave, dans la maison.", "An old rusty lever. It works the cellar door, inside the house.") }),
    it("piege", "trap", T("Piège à pointes", "Spike trap"), `${A}/tokens/piege.webp`, { [K.degats]: "2d6" },
      { description: desc("Une plaque de pression cachée dans l'herbe : des pointes jaillissent.", "A pressure plate hidden in the grass: spikes shoot up.") }),
    it("os", "misc", T("Vieil os", "Old bone"), "icons/commodities/bones/bone-simple-white.webp",
      { quantity: 1, [K.poids]: 0.2, [K.prix]: 1 },
      { description: desc("Un os rongé, ramassé dans la crypte.", "A gnawed bone, picked up in the crypt.") })
  ].map(d => SIZE[d.id] ? { ...d, spatial: { w: SIZE[d.id][0], h: SIZE[d.id][1] } } : d);
}

/* ------------------------------------------------------------ */
/*  Personnages                                                   */
/* ------------------------------------------------------------ */

/**
 * Une fiche : modèle, valeurs, objets portés [idObjet, où, quantité].
 * `where` = clé d'un slot ou d'un conteneur de la fiche.
 */
export function demoActors(L) {
  const { T, K, V } = L;
  const at = (f, a, c, i, s, ch) => ({ [K.force]: f, [K.agilite]: a, [K.constitution]: c, [K.intelligence]: i, [K.sagesse]: s, [K.charisme]: ch });
  return [
    { id: "elara", tpl: "adventurer", name: "Elara", img: `${A}/tokens/elara.webp`, pc: true,
      values: { ...at(8, 12, 10, 16, 13, 11), [K.race]: V.races[1], [K.elfique]: 100, [K.arcanes]: 3, [K.perception]: 1, [K.or]: 3, [K.argent]: 5, [K.cuivre]: 12,
        [K.age]: T("127 ans", "127 years old"), [K.origine]: T("Les bois d'Argentfeuille", "The Silverleaf woods"), [K.ideal]: T("Le savoir protège mieux que l'acier.", "Knowledge protects better than steel."),
        [K.apparence]: T("Cheveux d'argent, robe bleu nuit étoilée.", "Silver hair, midnight-blue robe stitched with stars."),
        [K.histoire]: T("<p>Partie des bois d'Argentfeuille pour retrouver un grimoire volé à son ordre, Elara a suivi la piste jusqu'à Brumeval. Elle soupçonne la vieille crypte d'en cacher les dernières pages.</p>", "<p>Elara left the Silverleaf woods to recover a grimoire stolen from her order, and followed the trail to Brumeval. She suspects the old crypt hides its last pages.</p>"),
        [K.notes]: T('<p>Inscription relevée sur la porte de la crypte :</p><p><span class="sbe-lang" data-sbe-lang="demo-elfique" data-sbe-lang-id="noteelara1">Le levier près de la maison ouvre le chemin de la cave.</span></p>', '<p>Inscription copied from the crypt door:</p><p><span class="sbe-lang" data-sbe-lang="demo-elfique" data-sbe-lang-id="noteelara1">The lever by the house opens the way to the cellar.</span></p>') },
      items: [["mage", K.classe], ["baton", K.main_droite], ["boule_feu", K.grimoire], ["eclair", K.grimoire], ["bouclier_magique", K.grimoire], ["potion_mana", K.sac, 2], ["torche", K.sac]] },
    { id: "brann", tpl: "adventurer", name: "Brann", img: `${A}/tokens/brann.webp`, pc: true,
      values: { ...at(16, 10, 15, 8, 11, 9), [K.race]: V.races[2], [K.nain]: true, [K.athletisme]: 2, [K.survie]: 1, [K.or]: 5, [K.argent]: 2, [K.cuivre]: 0,
        [K.age]: T("64 ans", "64 years old"), [K.origine]: T("Les forges de Gronde-Roche", "The Rumblestone forges"), [K.ideal]: T("Un serment se tient jusqu'au bout.", "An oath is kept to the very end."),
        [K.apparence]: T("Barbe rousse tressée, cicatrice sur la joue gauche.", "Braided red beard, scar on the left cheek."),
        [K.histoire]: T("<p>Ancien garde des forges de Gronde-Roche, Brann a juré de protéger Elara après qu'elle lui a sauvé la vie. Il parle peu, mais ne recule jamais.</p>", "<p>A former guard of the Rumblestone forges, Brann swore to protect Elara after she saved his life. He says little, but never steps back.</p>") },
      items: [["guerrier", K.classe], ["hache", K.main_droite], ["bouclier_bois", K.main_gauche], ["mailles", K.armure], ["potion_soin", K.sac, 2]] },
    { id: "lys", tpl: "adventurer", name: "Lys", img: `${A}/tokens/lys.webp`, pc: true,
      values: { ...at(9, 16, 11, 12, 12, 14), [K.race]: V.races[3], [K.crochetage]: 3, [K.discretion]: 3, [K.perception]: 2, [K.or]: 1, [K.argent]: 8, [K.cuivre]: 40,
        [K.age]: T("31 ans", "31 years old"), [K.origine]: T("Les collines de Brumeval", "The Brumeval hills"), [K.ideal]: T("Ce qui est caché finit toujours par se trouver.", "What is hidden is always found in the end."),
        [K.apparence]: T("Capuche grise, gants sans doigts, sourire en coin.", "Grey hood, fingerless gloves, crooked smile."),
        [K.histoire]: T("<p>Née à Brumeval, Lys connaît chaque toit et chaque serrure du village. Elle sait que la maison du bas cache une cave fermée à clé.</p>", "<p>Born in Brumeval, Lys knows every roof and every lock in the village. She knows the lower house hides a locked cellar.</p>") },
      items: [["voleur", K.classe], ["dague", K.main_droite], ["cuir", K.armure], ["arc", K.sac], ["fleches", K.sac, 20], ["crochets", K.sac]] },
    { id: "aldric", tpl: "adventurer", name: "Aldric", img: `${A}/tokens/aldric.webp`, pc: true,
      values: { ...at(13, 9, 13, 10, 16, 12), [K.race]: V.races[0], [K.perception]: 2, [K.persuasion]: 2, [K.or]: 2, [K.argent]: 0, [K.cuivre]: 25,
        [K.age]: T("42 ans", "42 years old"), [K.origine]: T("Le temple de l'Aube", "The Temple of Dawn"), [K.ideal]: T("Nul ne mérite d'être laissé dans l'ombre.", "No one deserves to be left in the dark."),
        [K.apparence]: T("Crâne rasé, tabard blanc frappé d'un soleil levant.", "Shaved head, white tabard bearing a rising sun."),
        [K.histoire]: T("<p>Envoyé par le temple de l'Aube, Aldric enquête sur les morts qui ne reposent plus dans la crypte de Brumeval.</p>", "<p>Sent by the Temple of Dawn, Aldric investigates the dead who no longer rest in the Brumeval crypt.</p>") },
      items: [["clerc", K.classe], ["masse", K.main_droite], ["bouclier_fer", K.main_gauche], ["soin", K.grimoire], ["benediction", K.grimoire], ["lumiere", K.grimoire], ["antidote", K.sac], ["potion_soin", K.sac]] },
    /* PNJ */
    { id: "bertrand", tpl: "adventurer", name: T("Bertrand le forgeron", "Bertrand the smith"), img: `${A}/tokens/bertrand.webp`,
      values: { ...at(15, 10, 14, 10, 11, 12), [K.race]: V.races[0], [K.persuasion]: 3, [K.or]: 20, [K.argent]: 10, [K.cuivre]: 50 },
      items: [["masse", K.main_droite]] },
    { id: "grisonne", tpl: "adventurer", name: T("Mère Grisonne", "Mother Greyhair"), img: `${A}/tokens/grisonne.webp`,
      values: { ...at(9, 9, 11, 13, 15, 14), [K.race]: V.races[0], [K.perception]: 3 }, items: [["cle", K.sac]] },
    /* Créatures */
    { id: "gobelin", tpl: "creature", name: T("Gobelin", "Goblin"), img: `${A}/tokens/gobelin.webp`,
      values: { [K.pv_maximum]: 9, [K.pv]: 9, [K.defense]: 12, [K.attaque]: 3, [K.initiative]: 2, [K.degats_naturels]: "1d6", [K.perception]: 2, sight: 12 },
      items: [["dague", K.sac], ["gemme", K.sac]] },
    { id: "squelette", tpl: "creature", name: T("Squelette", "Skeleton"), img: `${A}/tokens/squelette.webp`,
      values: { [K.pv_maximum]: 13, [K.pv]: 13, [K.defense]: 13, [K.attaque]: 4, [K.initiative]: 1, [K.degats_naturels]: "1d6 + 1", [K.mort_vivant]: true, [K.res_poison]: 10, [K.perception]: 1, sight: 8 },
      items: [["epee", K.sac], ["os", K.sac]] },
    { id: "loup", tpl: "beast", name: T("Loup", "Wolf"), img: `${A}/tokens/loup.webp`,
      values: { [K.pv_maximum]: 11, [K.pv]: 11, [K.defense]: 12, [K.attaque]: 4, [K.initiative]: 3, [K.degats_naturels]: "2d4", [K.perception]: 4, sight: 12 },
      items: [] }
  ];
}
