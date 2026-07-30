import { useEffect, useRef, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { color, radius, space } from '@sc/tokens';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

const styles = StyleSheet.create({
  background: { backgroundColor: color.bg, borderRadius: 0 },
  handle: { backgroundColor: color.divider, width: 38 },
  content: { paddingHorizontal: space.xxl, paddingBottom: space.l + 20, paddingTop: space.s },
});

const BORDER_RADIUS = { borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet };

function renderBackdrop(props: BottomSheetBackdropProps) {
  // The handoff's scrim is `color-mix(in srgb,#2d2b2b 55%, transparent)`
  // (color.scrim) rather than the library's default black-at-50%.
  return (
    <BottomSheetBackdrop
      {...props}
      appearsOnIndex={0}
      disappearsOnIndex={-1}
      opacity={1}
      pressBehavior="close"
      style={[props.style, { backgroundColor: color.scrim }]}
    />
  );
}

/**
 * The one bottom-sheet system for the role switcher and report-a-problem
 * sheets — full-screen scrim, radius 24 top corners, scSheet-equivalent
 * translate-in (the library's own spring, not a custom Reanimated preset:
 * BottomSheetModal owns its entrance animation and re-implementing it would
 * just fight the library's gesture-driven dismiss).
 */
export function Sheet({ open, onClose, children }: SheetProps) {
  const ref = useRef<BottomSheetModal>(null);

  useEffect(() => {
    if (open) ref.current?.present();
    else ref.current?.dismiss();
  }, [open]);

  return (
    <BottomSheetModal
      ref={ref}
      onDismiss={onClose}
      enableDynamicSizing
      backdropComponent={renderBackdrop}
      backgroundStyle={[styles.background, BORDER_RADIUS]}
      handleIndicatorStyle={styles.handle}
    >
      <BottomSheetView style={styles.content}>{children}</BottomSheetView>
    </BottomSheetModal>
  );
}
