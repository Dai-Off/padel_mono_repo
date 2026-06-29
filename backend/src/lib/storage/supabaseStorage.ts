import { getSupabaseServiceRoleClient } from '../supabase';
import type {
  IStorageProvider,
  SignedUrlResult,
  StorageBody,
  StorageResult,
  UploadOptions,
} from './types';

/**
 * Implementación por defecto sobre Supabase Storage.
 * Replica el comportamiento que hoy usan las rutas, centralizado en un solo lugar.
 */
export class SupabaseStorageProvider implements IStorageProvider {
  async upload(
    bucket: string,
    path: string,
    body: StorageBody,
    options?: UploadOptions,
  ): Promise<StorageResult> {
    const supabase = getSupabaseServiceRoleClient();
    const { error } = await supabase.storage.from(bucket).upload(path, body as never, {
      contentType: options?.contentType,
      upsert: options?.upsert ?? false,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  getPublicUrl(bucket: string, path: string): string {
    const supabase = getSupabaseServiceRoleClient();
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }

  async createSignedUrl(
    bucket: string,
    path: string,
    expiresInSeconds: number,
  ): Promise<SignedUrlResult> {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresInSeconds);
    if (error) return { ok: false, error: error.message };
    return { ok: true, url: data.signedUrl };
  }

  async remove(bucket: string, paths: string[]): Promise<StorageResult> {
    const supabase = getSupabaseServiceRoleClient();
    const { error } = await supabase.storage.from(bucket).remove(paths);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }
}
