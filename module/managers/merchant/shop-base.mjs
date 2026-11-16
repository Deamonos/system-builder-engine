/**
 * SBE — Le modèle de boutique de base
 *
 * Intégré au système (merchant-model `builtinShop`, jamais un acteur du
 * monde) ; le MJ peut en faire une copie modifiable dans l'atelier
 * (manager « Marchands et monnaies », onglet Boutiques). La bourse
 * de l'acheteur et la caisse du marchand, puis trois onglets : Acheter
 * (l'Étal en liste sur 2 colonnes, un onglet par famille), Vendre
 * (l'inventaire à vendre et la zone de dépôt), Historique.
 */

const L = (k) => game.i18n.localize(k);
const id = () => foundry.utils.randomID();

/** Les composants du modèle de base. */
export function baseShopElements() {
  const el = (kind, label, config = {}, extra = {}) => ({ id: id(), kind, key: "", label, playerVisible: true, config, style: {}, ...extra });
  const tab = (label, icon, children) => el("tab", label, { icon }, { children });
  return [
    el("shopPurse", L("SBE.Shop.BasePurse")),
    el("shopCash", L("SBE.Shop.BaseCash")),
    el("nav", "", {}, { children: [
      tab(L("SBE.Shop.TabBuy"), "fa-solid fa-cart-shopping", [
        el("shopStall", L("SBE.Shop.BaseStall"), { view: "list", cols: 2, tabs: "family", showQty: true })
      ]),
      tab(L("SBE.Shop.TabSell"), "fa-solid fa-hand-holding-dollar", [
        el("shopSellList", L("SBE.Shop.BaseSellList")),
        el("shopSell", L("SBE.Shop.BaseSell"))
      ]),
      tab(L("SBE.Shop.TabHistory"), "fa-solid fa-clock-rotate-left", [
        el("shopHistory", L("SBE.Shop.BaseHistory"))
      ])
    ] })
  ];
}

/** Une copie modifiable de la boutique de base, dans l'atelier (choix du MJ). */
export async function createBaseShop() {
  return Actor.implementation.create({
    name: L("SBE.Shop.BaseName"),
    type: "template",
    img: "icons/svg/coins.svg",
    system: { genre: "shop", elements: baseShopElements(), structVersion: 1 }
  });
}

/** Un modèle de boutique vide, à construire dans l'atelier. */
export async function createEmptyShop() {
  return Actor.implementation.create({
    name: L("SBE.Shop.NewName"),
    type: "template",
    img: "icons/svg/coins.svg",
    system: { genre: "shop" }
  });
}
