import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { ImagePickerAsset } from 'expo-image-picker';

export async function createHistoryThumbnail(image: ImagePickerAsset): Promise<string> {
  const context = ImageManipulator.manipulate(image.uri);
  const longestSide = Math.max(image.width, image.height);
  if (longestSide > 360) {
    context.resize(image.width >= image.height ? { width: 360 } : { height: 360 });
  }
  const rendered = await context.renderAsync();
  try {
    const result = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.55, base64: true });
    if (!result.base64 || result.base64.length > 90_000) throw new Error('Preview is too large.');
    // Store the compressed bytes, never a temporary picker URI or full photo.
    return `data:image/jpeg;base64,${result.base64}`;
  } finally {
    rendered.release();
    context.release();
  }
}
