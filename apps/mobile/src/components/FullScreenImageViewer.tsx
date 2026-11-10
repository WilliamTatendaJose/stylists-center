import { Image, Modal, StatusBar, StyleSheet, View } from 'react-native';
import { ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { radius, space } from '@sc/tokens';
import { Pressable, Text, useTheme } from '@sc/ui';

const styles = StyleSheet.create({
  viewer: { flex: 1, padding: space.l },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageArea: { flex: 1, justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  navigation: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space.s,
  },
  navigationButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: { textAlign: 'center', marginTop: space.s },
});

interface FullScreenImageViewerProps {
  urls: string[];
  initialIndex: number | null;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
}

/** Full-screen portfolio viewer. URLs must already be resolved API media URLs. */
export function FullScreenImageViewer({
  urls,
  initialIndex,
  onClose,
  onPrevious,
  onNext,
}: FullScreenImageViewerProps) {
  const { colors } = useTheme();
  const selectedUrl = initialIndex === null ? undefined : urls[initialIndex];
  const canGoPrevious = initialIndex !== null && initialIndex > 0;
  const canGoNext = initialIndex !== null && initialIndex < urls.length - 1;

  return (
    <Modal
      visible={selectedUrl !== undefined}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <StatusBar barStyle="light-content" />
      <View style={[styles.viewer, { backgroundColor: colors.neutral900 }]}>
        <View style={styles.topBar}>
          <Text variant="meta" color={colors.onDark.body}>
            {initialIndex === null ? '' : `${String(initialIndex + 1)} of ${String(urls.length)}`}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close image viewer"
            onPress={onClose}
            style={[styles.closeButton, { backgroundColor: colors.neutral800 }]}
          >
            <X size={21} color={colors.bg} />
          </Pressable>
        </View>

        <View style={styles.imageArea}>
          {selectedUrl ? (
            <Image
              source={{ uri: selectedUrl }}
              accessibilityLabel={`Work photo ${String((initialIndex ?? 0) + 1)}`}
              resizeMode="contain"
              style={styles.image}
            />
          ) : null}
          {initialIndex !== null && urls.length > 1 ? (
            <View style={styles.navigation} pointerEvents="box-none">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous work photo"
                accessibilityState={{ disabled: !canGoPrevious }}
                disabled={!canGoPrevious}
                onPress={onPrevious}
                style={[styles.navigationButton, { backgroundColor: colors.neutral800 }]}
              >
                <ChevronLeft size={24} color={canGoPrevious ? colors.bg : colors.neutral600} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next work photo"
                accessibilityState={{ disabled: !canGoNext }}
                disabled={!canGoNext}
                onPress={onNext}
                style={[styles.navigationButton, { backgroundColor: colors.neutral800 }]}
              >
                <ChevronRight size={24} color={canGoNext ? colors.bg : colors.neutral600} />
              </Pressable>
            </View>
          ) : null}
        </View>
        <Text variant="metaSmall" color={colors.onDark.body} style={styles.caption}>
          Use the arrows to browse all work photos.
        </Text>
      </View>
    </Modal>
  );
}
