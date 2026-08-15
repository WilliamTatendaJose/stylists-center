import { StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { X } from 'lucide-react-native';
import { color, radius, space } from '@sc/tokens';
import { Button, ImagePlaceholder, Pressable, Text } from '@sc/ui';
import { apiAssetUrl } from '../api/client.js';
import { describeError } from '../api/errorMessage.js';
import { useUploadImage } from '../api/hooks/useUploads.js';

const styles = StyleSheet.create({
  label: { marginBottom: space.s },
  help: { marginBottom: space.m },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s, marginBottom: space.m },
  photoWrap: { width: 100, height: 100 },
  photo: { width: 100, height: 100 },
  remove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: color.neutral900,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

interface PhotoPickerProps {
  label: string;
  urls: string[];
  onChange: (urls: string[]) => void;
  onError: (message: string) => void;
  disabled?: boolean;
  maxPhotos?: number;
  helpText?: string;
  uploadEndpoint?: string;
}

export function PhotoPicker({
  label,
  urls,
  onChange,
  onError,
  disabled = false,
  maxPhotos = 5,
  helpText,
  uploadEndpoint,
}: PhotoPickerProps) {
  const upload = useUploadImage(uploadEndpoint);
  const remaining = maxPhotos - urls.length;

  const choose = async () => {
    onError('');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      onError('Photo access is needed to choose pictures from your phone.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.7,
    });
    if (result.canceled) return;

    try {
      const uploaded: string[] = [];
      for (const asset of result.assets.slice(0, remaining)) {
        const image = await upload.mutateAsync(asset);
        uploaded.push(image.url);
      }
      onChange([...urls, ...uploaded]);
    } catch (error) {
      onError(
        describeError(error, "Couldn't upload that photo. Choose another photo and try again."),
      );
    }
  };

  return (
    <View>
      <Text variant="sectionLabel" style={styles.label}>
        {label}
      </Text>
      <Text variant="meta" color="neutral600" style={styles.help}>
        {helpText ??
          (maxPhotos === 1
            ? 'Choose one clear photo.'
            : `Add up to ${String(maxPhotos)} photos. The first is used as the thumbnail.`)}
      </Text>
      {urls.length ? (
        <View style={styles.grid}>
          {urls.map((url, index) => (
            <View key={url} style={styles.photoWrap}>
              <ImagePlaceholder uri={apiAssetUrl(url)} radius={12} style={styles.photo} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove photo ${String(index + 1)}`}
                disabled={disabled || upload.isPending}
                onDark
                onPress={() => {
                  onChange(urls.filter((item) => item !== url));
                }}
                style={styles.remove}
              >
                <X size={16} color={color.bg} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      <Button
        label={
          upload.isPending
            ? 'Uploading…'
            : remaining > 0
              ? maxPhotos === 1
                ? 'Choose photo'
                : 'Add photos'
              : maxPhotos === 1
                ? 'Photo added'
                : `${String(maxPhotos)} photos added`
        }
        variant="secondary"
        block
        loading={upload.isPending}
        disabled={disabled || remaining <= 0}
        onPress={() => void choose()}
      />
    </View>
  );
}
