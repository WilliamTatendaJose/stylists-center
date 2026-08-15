import { useMutation } from '@tanstack/react-query';
import type { ImagePickerAsset } from 'expo-image-picker';
import { File } from 'expo-file-system';
import type { UploadedImageDto } from '@sc/shared';
import { apiFetch } from '../client.js';

function uploadPart(asset: ImagePickerAsset): FormData {
  const form = new FormData();
  const mimeType = asset.mimeType ?? 'image/jpeg';
  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const name = asset.fileName ?? `photo.${extension}`;

  if (asset.file) {
    form.append('image', asset.file, name);
  } else {
    // Expo's File implements the Blob contract and reads the picker URI on the
    // native side. A plain `{ uri, name, type }` FormData part is rejected by
    // expo/fetch before it can reach the API.
    form.append('image', new File(asset.uri), name);
  }
  return form;
}

export function useUploadImage(endpoint = '/v1/provider/images') {
  return useMutation({
    mutationFn: (asset: ImagePickerAsset) =>
      apiFetch<UploadedImageDto>(endpoint, {
        method: 'POST',
        body: uploadPart(asset),
      }),
  });
}

export function useUploadProviderImage() {
  return useUploadImage();
}
