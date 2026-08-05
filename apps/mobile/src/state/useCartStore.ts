import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MAX_ORDER_ITEM_QUANTITY, orderTotalUsdCents } from '@sc/shared';

export interface CartLine {
  productId: string;
  name: string;
  priceUsdCents: number;
  quantity: number;
  /** Stock at the time it was added — a local guard only; the server re-checks under a lock at checkout. */
  stockQty: number;
  /**
   * The seller this specific line belongs to. Per-line rather than one
   * cart-level seller: a cart can now hold items from several stylists at
   * once (checkout still places one order per seller — collection only ever
   * happens at a single place — the cart itself just no longer forces that
   * split on the shopper before they are ready for it).
   */
  providerId: string;
  providerName: string;
}

export interface CartState {
  lines: CartLine[];
  add: (
    seller: { providerId: string; providerName: string },
    line: Omit<CartLine, 'quantity' | 'providerId' | 'providerName'>,
    quantity?: number,
  ) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  /** Removes every line for one seller — used after that seller's order is placed, leaving any other sellers' lines untouched. */
  removeSeller: (providerId: string) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],

      add: (seller, line, quantity = 1) => {
        const state = get();
        const existing = state.lines.find((l) => l.productId === line.productId);

        // Clamped rather than rejected: a user bumping "+" past the limit
        // wants as many as they can have, not an error.
        const nextQuantity = Math.min(
          (existing?.quantity ?? 0) + quantity,
          line.stockQty,
          MAX_ORDER_ITEM_QUANTITY,
        );

        set({
          lines: existing
            ? state.lines.map((l) =>
                l.productId === line.productId ? { ...l, quantity: nextQuantity } : l,
              )
            : [
                ...state.lines,
                {
                  ...line,
                  quantity: nextQuantity,
                  providerId: seller.providerId,
                  providerName: seller.providerName,
                },
              ],
        });
      },

      setQuantity: (productId, quantity) => {
        const lines = get()
          .lines.map((l) =>
            l.productId === productId
              ? { ...l, quantity: Math.min(quantity, l.stockQty, MAX_ORDER_ITEM_QUANTITY) }
              : l,
          )
          .filter((l) => l.quantity > 0);
        set({ lines });
      },

      remove: (productId) => {
        get().setQuantity(productId, 0);
      },

      removeSeller: (providerId) => {
        set({ lines: get().lines.filter((l) => l.providerId !== providerId) });
      },

      clear: () => {
        set({ lines: [] });
      },
    }),
    {
      // Persisted: a cart lost to an app restart on a flaky connection is a
      // lost sale, and this market's users restart often.
      name: 'sc-cart',
      storage: createJSONStorage(() => AsyncStorage),
      version: 2,
      // v1 carried one cart-level providerId/providerName and would crash
      // reading its lines as the new per-line shape; a mixed cart is not
      // recoverable from that old shape, so it starts empty instead of
      // throwing on the first launch after the update.
      migrate: () => ({ lines: [] }),
    },
  ),
);

export interface CartGroup {
  providerId: string;
  providerName: string;
  lines: CartLine[];
}

/** Every seller currently in the cart, each with just their own lines — what the cart screen and checkout both render off. */
export function groupCartBySeller(lines: readonly CartLine[]): CartGroup[] {
  const order: string[] = [];
  const groups = new Map<string, CartGroup>();

  for (const line of lines) {
    let group = groups.get(line.providerId);
    if (!group) {
      group = { providerId: line.providerId, providerName: line.providerName, lines: [] };
      groups.set(line.providerId, group);
      order.push(line.providerId);
    }
    group.lines.push(line);
  }

  return order.map((id) => groups.get(id)!);
}

/** Uses the shared total so the cart, the checkout summary and the server all agree. */
export function cartTotalUsdCents(lines: readonly CartLine[]): number {
  return orderTotalUsdCents(lines);
}

export function cartItemCount(lines: readonly CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}
