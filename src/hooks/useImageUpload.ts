import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../services/supabase/client';
import * as FileSystem from 'expo-file-system';

export function useImageUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickImage = async (): Promise<string | null> => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });

      if (result.canceled) return null;

      return result.assets[0].uri;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  };

  const uploadImage = async (uri: string, bucket: string = 'images'): Promise<string | null> => {
    setIsUploading(true);
    setError(null);

    try {
      const fileExt = uri.split('.').pop() || 'jpg';
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `uploads/${fileName}`;

      // Read file as base64
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Convert base64 to Uint8Array
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const { data, error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, bytes, {
          contentType: `image/${fileExt}`,
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(filePath);

      setIsUploading(false);
      return publicUrl;
    } catch (err: any) {
      setError(err.message || 'Upload failed');
      setIsUploading(false);
      return null;
    }
  };

  const deleteImage = async (url: string, bucket: string = 'images'): Promise<boolean> => {
    try {
      const path = url.split(`${bucket}/`)[1];
      if (!path) return false;

      const { error: deleteError } = await supabase.storage.from(bucket).remove([path]);
      if (deleteError) throw deleteError;
      return true;
    } catch {
      return false;
    }
  };

  return {
    pickImage,
    uploadImage,
    deleteImage,
    isUploading,
    error,
  };
}
