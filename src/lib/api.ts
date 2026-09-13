import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { ImagePickerAsset } from 'expo-image-picker';
import { Platform } from 'react-native';

export type Usage = { remaining: number; limit: number; resetsAt: string; sharedLimitReached: boolean };
const configured = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
const host = Constants.expoConfig?.hostUri?.split(':')[0];
const base = configured || (__DEV__ ? (Platform.OS === 'web' ? 'http://localhost:8787' : `http://${host || 'localhost'}:8787`) : '');
let devicePromise: Promise<string> | undefined;
function deviceId() {
  return devicePromise ??= (async () => {
    const key = '@explain-this/device-id';
    const existing = await AsyncStorage.getItem(key);
    if (existing) return existing;
    // An installation identifier, not an authentication credential.
    const id = `device-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    await AsyncStorage.setItem(key, id);
    return id;
  })().catch(error => { devicePromise = undefined; throw error; });
}
export async function api(path: string, body?: object, onUsage?: (usage: Usage) => void) {
  if (!base) throw new Error('The online server address has not been configured.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 65000);
  try {
    const response = await fetch(base + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', 'X-Device-Id': await deviceId() },
      body: body ? JSON.stringify(body) : undefined, signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (data.usage && typeof data.usage.remaining === 'number' && Number.isFinite(Date.parse(data.usage.resetsAt))) onUsage?.(data.usage);
    if (!response.ok) throw new Error(data.error || 'The server could not complete this request.');
    return data;
  } catch (error) {
    if (error instanceof Error && (error.name === 'AbortError' || error instanceof TypeError)) throw new Error('Could not reach the server. Check your connection and try again.');
    throw error;
  } finally { clearTimeout(timer); }
}
let prepared: { uri: string; result: Promise<{ imageBase64: string; mimeType: string }> } | undefined;
export function prepareImage(image: ImagePickerAsset) {
  if (prepared?.uri === image.uri) return prepared.result;
  const result = (async () => {
    const context = ImageManipulator.manipulate(image.uri);
    try {
      if (Math.max(image.width, image.height) > 1600) context.resize(image.width >= image.height ? { width: 1600 } : { height: 1600 });
      const rendered = await context.renderAsync();
      try {
        const output = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
        if (!output.base64 || output.base64.length > 2_000_000) throw new Error('This image is too large. Crop it or choose a smaller image.');
        return { imageBase64: output.base64, mimeType: 'image/jpeg' };
      } finally { rendered.release(); }
    } finally { context.release(); }
  })();
  prepared = { uri: image.uri, result };
  void result.catch(() => { if (prepared?.result === result) prepared = undefined; });
  return result;
}
