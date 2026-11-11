import { ShopScreen } from '../(provider)/shop';

/**
 * "Sell on StylistsCenter", reached from the client Market tab: the same shop
 * screen the stylist's Shop tab shows, for anyone without the stylist tabs.
 */
export default function VendorShop() {
  return <ShopScreen standalone />;
}
