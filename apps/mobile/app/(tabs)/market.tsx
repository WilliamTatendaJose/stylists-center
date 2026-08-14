import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Package, ShoppingBag } from 'lucide-react-native';
import { color, space } from '@sc/tokens';
import { Screen, ScreenHeader, Pressable, Badge } from '@sc/ui';
import { MarketBrowse } from '../../src/components/MarketBrowse.js';
import { cartItemCount, useCartStore } from '../../src/state/index.js';

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', gap: space.s },
  cartButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: color.neutral900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ordersButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: color.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartCount: { position: 'absolute', top: -4, right: -6 },
});

/**
 * Marketplace (handoff screens 15-18). Stylists sell the hair, wigs and
 * supplies they already work with; buyers collect in person, which is why
 * every row leads with the seller and the distance to them.
 */
export default function Market() {
  const lines = useCartStore((s) => s.lines);
  const itemCount = cartItemCount(lines);

  return (
    <Screen
      hasTabBar
      header={
        <ScreenHeader
          title="Market"
          showBack={false}
          right={
            <View style={styles.headerActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="My orders"
                onPress={() => {
                  router.push('/market/orders');
                }}
                style={styles.ordersButton}
              >
                <Package size={18} strokeWidth={1.7} color={color.text} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  itemCount > 0 ? `Cart, ${String(itemCount)} items` : 'Cart, empty'
                }
                onPress={() => {
                  router.push('/market/cart');
                }}
                style={styles.cartButton}
              >
                <ShoppingBag size={18} strokeWidth={1.7} color={color.bg} />
                {itemCount > 0 ? (
                  <View style={styles.cartCount}>
                    <Badge label={String(itemCount)} tone="accent" size="sm" />
                  </View>
                ) : null}
              </Pressable>
            </View>
          }
        />
      }
    >
      <MarketBrowse />
    </Screen>
  );
}
