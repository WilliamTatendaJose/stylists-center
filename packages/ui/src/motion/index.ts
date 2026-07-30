import { Keyframe } from 'react-native-reanimated';
import { motion } from '@sc/tokens';

/**
 * scIn — screen enter (handoff: opacity 0->1 + translateY(10px)->0, 280ms
 * ease). Built fresh on every call rather than as a module-level singleton:
 * Reanimated Keyframe instances are consumed by the `entering` prop and are
 * not meant to be shared across mounts.
 */
export function scIn() {
  return new Keyframe({
    0: { opacity: 0, transform: [{ translateY: motion.screenIn.translateY }] },
    100: { opacity: 1, transform: [{ translateY: 0 }] },
  }).duration(motion.screenIn.duration);
}

/**
 * scOffer — an accepted-stylist card sliding in on the smart-match screen
 * (opacity 0->1 + translateX(-14px)->0, 350ms). Lives here now, ahead of the
 * Tier 3 OfferCard component that will use it, so every future entrance
 * animation in the app shares this one definition instead of a per-screen copy.
 */
export function scOffer() {
  return new Keyframe({
    0: { opacity: 0, transform: [{ translateX: motion.offerIn.translateX }] },
    100: { opacity: 1, transform: [{ translateX: 0 }] },
  }).duration(motion.offerIn.duration);
}
