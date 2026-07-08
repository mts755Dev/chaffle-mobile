import { useState } from 'react';
import { Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../services/supabase/client';
import { invokeEdgeFunction } from '../services/supabase/invokeFunction';
import { STORAGE_BUCKET } from '../constants';

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB — matches web

const BASE64_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64ToUint8Array(base64: string): Uint8Array {
  const cleaned = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const padding = cleaned.endsWith('==') ? 2 : cleaned.endsWith('=') ? 1 : 0;
  const outputLength = (cleaned.length * 3) / 4 - padding;
  const bytes = new Uint8Array(outputLength);

  let byteIndex = 0;
  for (let i = 0; i < cleaned.length; i += 4) {
    const enc1 = BASE64_CHARS.indexOf(cleaned[i]);
    const enc2 = BASE64_CHARS.indexOf(cleaned[i + 1]);
    const enc3 = BASE64_CHARS.indexOf(cleaned[i + 2]);
    const enc4 = BASE64_CHARS.indexOf(cleaned[i + 3]);

    const bitmap =
      (enc1 << 18) | (enc2 << 12) | ((enc3 & 63) << 6) | (enc4 & 63);

    if (byteIndex < outputLength) bytes[byteIndex++] = (bitmap >> 16) & 255;
    if (byteIndex < outputLength) bytes[byteIndex++] = (bitmap >> 8) & 255;
    if (byteIndex < outputLength) bytes[byteIndex++] = bitmap & 255;
  }

  return bytes;
}

function guessContentType(uri: string, mimeType?: string | null): string {
  if (mimeType && mimeType.startsWith('image/')) return mimeType;
  const ext = uri.split('?')[0].split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'svg') return 'image/svg+xml';
  return 'image/jpeg';
}

function extensionFromContentType(contentType: string, uri: string): string {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  if (contentType.includes('svg')) return 'svg';
  const fromUri = uri.split('?')[0].split('.').pop()?.toLowerCase();
  if (fromUri && /^[a-z0-9]+$/.test(fromUri) && fromUri.length <= 5) {
    return fromUri === 'jpeg' ? 'jpg' : fromUri;
  }
  return 'jpg';
}

export function useImageUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickImage = async (): Promise<{
    uri: string;
    mimeType?: string | null;
  } | null> => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        const message =
          Platform.OS === 'ios'
            ? 'Photo library access is required to upload a background image. Enable it in Settings.'
            : 'Photo library access is required to upload a background image.';
        setError(message);
        Alert.alert('Permission needed', message);
        return null;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]?.uri) return null;

      const asset = result.assets[0];
      return { uri: asset.uri, mimeType: asset.mimeType };
    } catch (err: any) {
      const message = err?.message || 'Failed to open photo library';
      setError(message);
      Alert.alert('Image picker error', message);
      return null;
    }
  };

  /**
   * Uploads to the same storage layout as web:
   *   /public/<raffleId>/background/<filename>
   * Prefers the upload-raffle-image edge function; falls back to direct storage.
   */
  const uploadImage = async (
    uri: string,
    options: {
      raffleId: string;
      isBackground?: boolean;
      mimeType?: string | null;
    },
  ): Promise<string | null> => {
    setIsUploading(true);
    setError(null);

    try {
      const { raffleId, isBackground = true, mimeType } = options;
      if (!raffleId) {
        throw new Error('Save the raffle first, then upload a background image.');
      }

      const contentType = guessContentType(uri, mimeType);
      const fileExt = extensionFromContentType(contentType, uri);
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `public/${raffleId}/${
        isBackground ? 'background' : 'images'
      }/${fileName}`;

      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const bytes = base64ToUint8Array(base64);

      if (bytes.byteLength > MAX_BYTES) {
        throw new Error('Image must be under 2 MB');
      }
      if (bytes.byteLength === 0) {
        throw new Error('Failed to read image file');
      }

      // Prefer service-role edge function (matches web; bypasses storage RLS).
      let edgePath: string | null = null;
      try {
        const data = await invokeEdgeFunction<{ path?: string }>(
          'upload-raffle-image',
          {
            raffleId,
            isBackground,
            fileName,
            contentType,
            base64,
          },
          'Upload failed',
        );
        if (data?.path) {
          edgePath = data.path;
        }
      } catch (invokeErr: any) {
        // Fall through to direct storage upload below.
        if (!invokeErr?.message?.toLowerCase().includes('not signed in')) {
          console.warn('upload-raffle-image:', invokeErr?.message);
        }
      }

      if (edgePath) {
        setIsUploading(false);
        return edgePath;
      }

      // Fallback: direct client upload (works if bucket policies allow authenticated writes).
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(filePath, bytes, {
          contentType,
          upsert: true,
        });

      if (uploadError) {
        throw new Error(uploadError.message || 'Upload failed');
      }

      setIsUploading(false);
      return `/${filePath}`;
    } catch (err: any) {
      const message = err?.message || 'Upload failed';
      setError(message);
      setIsUploading(false);
      Alert.alert('Upload failed', message);
      return null;
    }
  };

  return {
    pickImage,
    uploadImage,
    isUploading,
    error,
  };
}
