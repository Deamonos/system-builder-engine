/**
 * SBE — MARCHANDS : branchements
 *
 * - Fiche d'un marchand (MJ) : bouton « boutique ouverte / fermée »
 *   dans la barre de la fenêtre, à côté de l'œil d'identité, et
 *   « Ouvrir la boutique » juste après le titre.
 * - Les fiches ouvertes suivent le réglage (ouvert / fermé, marchand ou non).
 * - Double-clic d'un joueur sur le jeton d'un marchand (qui n'est pas à
 *   lui) : la boutique, si elle est ouverte et assez proche.
 * - Marchand objet de scène (étal, distributeur…) : un objet posé de la
 *   sorte « merchant » (bouton des contrôles de jetons, MJ), dont le pion
 *   porte les réglages, le stock et l'historique ; double-clic = boutique.
 */

import { SYSTEM_ID } from "../../helpers/constants.mjs";
import { isActorWithinFeet } from "../../helpers/canvas-utils.mjs";
import { UiSound } from "../media/ui-sound.mjs";
import { MERCHANT_FLAG, merchantOf, merchantHost, isMerchant, cleanMerchant } from "./merchant-model.mjs";
import { PropManager } from "../props/prop-manager.mjs";
import { SBEMerchantApp } from "./merchant-app.mjs";
import { SBEShopApp } from "./shop-app.mjs";
import { ShopTrade } from "./shop-trade.mjs";
import { ShopHaggle } from "./shop-haggle.mjs";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const KIND = "merchant";
const DEFAULT_IMG = "icons/svg/coins.svg";

export class MerchantManager {

  static init() {
    ShopTrade.init();
    ShopHaggle.init();
    /* Objet posé « marchand » : double-clic = boutique (le MJ aussi). */
    PropManager.registerKind(KIND, {
      cfg: (td) => ({ visibility: "all", use: "all", take: "none", range: 0, showName: !!td.flags?.[SYSTEM_ID]?.showName, ignoreCombat: true }),
      open: (td) => this.openShop(td.actor, td.object)
    });
    /* Double-clic sur un jeton : un joueur ouvre la boutique d'un marchand. */
    const M = this;
    const Base = CONFIG.Token.objectClass;
    class SBEMerchantToken extends Base {
      _onClickLeft2(event) {
        const actor = this.actor;
        if (actor && !game.user.isGM && !actor.isOwner && isMerchant(actor)) {
          M.openShop(actor, this).catch(err => console.warn("SBE | Boutique : ouverture en échec", err));
          return;
        }
        return super._onClickLeft2(event);
      }
    }
    CONFIG.Token.objectClass = SBEMerchantToken;

    Hooks.on("updateActor", (actor, changes) => {
      if (!foundry.utils.hasProperty(changes, `flags.${SYSTEM_ID}.${MERCHANT_FLAG}`)) return;
      for (const app of foundry.applications.instances.values()) {
        if (app.rendered && merchantHost(app.document) === actor) this.headerButton(app);
      }
    });
  }

  /** L'acheteur : le personnage du joueur, sinon un jeton qu'il contrôle. */
  static buyerOf(user = game.user) {
    return user.character ?? canvas?.tokens?.controlled?.find(t => t.actor?.isOwner)?.actor ?? null;
  }

  /**
   * Ouvre la boutique d'un marchand pour l'utilisateur.
   * Joueur : boutique ouverte et assez proche ; le MJ ouvre toujours
   * (l'acheteur : le jeton qu'il contrôle, s'il y en a un).
   */
  static async openShop(merchant, token = null) {
    const m = merchantOf(merchant);
    if (!m.enabled) return null;
    const buyer = this.buyerOf();
    if (!game.user.isGM) {
      if (!m.open) { ui.notifications.warn(L("SBE.Shop.IsClosed", { name: token?.document?.name ?? merchant.name })); return null; }
      if (!buyer) { ui.notifications.warn(L("SBE.Shop.NeedCharacter")); return null; }
      const t = token ?? merchant.getActiveTokens?.(true)?.[0] ?? null;
      if (t && m.distance > 0) {
        const d = t.document;
        const center = { x: d.x + (d.width * canvas.grid.size) / 2, y: d.y + (d.height * canvas.grid.size) / 2, parent: d.parent };
        if (!isActorWithinFeet(buyer, center, m.distance)) { ui.notifications.warn(L("SBE.Shop.TooFar")); return null; }
      }
    }
    if (m.sounds.open.sound) UiSound.play(m.sounds.open);
    return SBEShopApp.open(merchant, buyer);
  }

  /** MJ : pose un marchand objet de scène (nom, image), puis ouvre ses réglages. */
  static async createSceneMerchant() {
    if (!game.user.isGM) return null;
    if (!canvas?.scene) { ui.notifications.warn(L("SBE.Chest.NoActiveScene")); return null; }
    const res = await foundry.applications.api.DialogV2.wait({
      window: { title: L("SBE.Merchant.PlaceTitle"), icon: "fa-solid fa-store" },
      position: { width: 420 },
      content: `<div class="sbe-shopdlg">
        <label class="sbe-shopdlg-f"><span>${esc(L("SBE.Merchant.PlaceName"))}</span>
          <input type="text" name="name" value="${esc(L("SBE.Merchant.PlaceDefault"))}"></label>
        <div class="sbe-shopdlg-f"><span>${esc(L("SBE.Merchant.PlaceImg"))}</span>
          <div class="sbe-shopdlg-row"><input type="text" name="img" value="${DEFAULT_IMG}">
          <button type="button" data-pick class="sbe-shopdlg-pick"><i class="fa-solid fa-file-import"></i></button></div></div>
        <p class="notes">${esc(L("SBE.Merchant.PlaceHint"))}</p>
      </div>`,
      render: (_ev, dlg) => {
        const root = dlg instanceof HTMLElement ? dlg : dlg?.element;
        root?.querySelector("[data-pick]")?.addEventListener("click", () => {
          const input = root.querySelector('[name="img"]');
          new foundry.applications.apps.FilePicker.implementation({ type: "image", current: input.value, callback: (p) => { input.value = p; } }).render(true);
        });
      },
      buttons: [
        { action: "ok", label: L("SBE.Merchant.PlaceGo"), icon: "fa-solid fa-location-crosshairs", default: true,
          callback: (_e, btn) => ({ name: btn.form.elements.name.value.trim(), img: btn.form.elements.img.value.trim() }) },
        { action: "cancel", label: L("SBE.Common.Cancel"), icon: "fa-solid fa-xmark" }
      ],
      rejectClose: false
    }).catch(() => null);
    if (!res || typeof res !== "object") return null;
    const img = res.img || DEFAULT_IMG;
    const name = res.name || L("SBE.Merchant.PlaceDefault");
    const at = await PropManager.aim(img, 1, 1, true);
    if (!at) return null;
    const td = await PropManager.createToken({
      scene: canvas.scene, center: { x: at.x, y: at.y }, rotation: at.rotation,
      name, img, size: { w: 1, h: 1 }, cfg: { showName: true }, items: [], prop: { kind: KIND }, flags: { showName: true }
    });
    if (!td?.actor) { ui.notifications.error(L("SBE.Merchant.PlaceFailed")); return null; }
    await td.actor.setFlag(SYSTEM_ID, MERCHANT_FLAG, cleanMerchant({ enabled: true, open: true }));
    SBEMerchantApp.open(td.actor);
    return td;
  }

  /** Ouvre ou ferme la boutique d'un marchand. */
  static async setOpen(actor, open) {
    const host = merchantHost(actor);
    if (!game.user.isGM || !host) return;
    await host.setFlag(SYSTEM_ID, MERCHANT_FLAG, { ...merchantOf(host), open: !!open });
    ui.notifications.info(L(open ? "SBE.Merchant.OpenedMsg" : "SBE.Merchant.ClosedMsg", { name: host.name }));
  }

  /** MJ : bouton « boutique ouverte / fermée » dans la barre de la fiche. */
  static headerButton(app) {
    try {
      const header = app?.element?.querySelector?.(".window-header");
      header?.querySelector(".sbe-merchant-toggle")?.remove();
      header?.querySelector(".sbe-merchant-shop")?.remove();
      const actor = app?.document;
      if (!game.user?.isGM || !header || actor?.documentName !== "Actor") return;
      const m = merchantOf(actor);
      if (!m.enabled) return;
      const title = L(m.open ? "SBE.Merchant.CloseShop" : "SBE.Merchant.OpenShop");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `header-control icon sbe-merchant-toggle ${m.open ? "is-open" : "is-closed"}`;
      btn.innerHTML = `<i class="fa-solid ${m.open ? "fa-store" : "fa-store-slash"}"></i>`;
      btn.dataset.tooltip = title;
      btn.setAttribute("aria-label", title);
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.setOpen(app.document, !merchantOf(app.document).open);
      });
      const after = header.querySelector(".sbe-identity-toggle") ?? header.querySelector(".window-title");
      if (after) after.after(btn); else header.prepend(btn);
      /* « Ouvrir la boutique » : juste après le titre. */
      const shopTitle = L("SBE.Shop.OpenAsGM");
      const shop = document.createElement("button");
      shop.type = "button";
      shop.className = "header-control icon sbe-merchant-shop";
      shop.innerHTML = `<i class="fa-solid fa-cart-shopping"></i>`;
      shop.dataset.tooltip = shopTitle;
      shop.setAttribute("aria-label", shopTitle);
      shop.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.openShop(app.document);
      });
      const near = header.querySelector(".window-title");
      if (near) near.after(shop); else header.prepend(shop);
    } catch (_e) { /* injection non bloquante */ }
  }
}

/* Bouton des contrôles de jetons (MJ) : poser un marchand objet de scène.
   getSceneControlButtons se déclenche avant « ready » : posé à l'import. */
Hooks.on("getSceneControlButtons", (controls) => {
  try {
    const group = controls?.tokens;
    if (!group?.tools) return;
    group.tools.sbePlaceMerchant = {
      name: "sbePlaceMerchant",
      title: game.i18n.localize("SBE.Merchant.PlaceTitle"),
      icon: "fa-solid fa-store",
      order: Object.keys(group.tools).length,
      button: true,
      visible: game.user.isGM,
      onChange: () => { MerchantManager.createSceneMerchant(); }
    };
  } catch (err) {
    console.warn("SBE | Marchand : bouton de contrôle en échec", err);
  }
});
