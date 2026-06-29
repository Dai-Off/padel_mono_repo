import { getStorageProvider } from '../config/providers';
import type { IStorageProvider } from './types';
import { SupabaseStorageProvider } from './supabaseStorage';
import { OssStorageProvider } from './ossStorage';

let instance: IStorageProvider | null = null;

/**
 * Devuelve el proveedor de storage según `STORAGE_PROVIDER`.
 * Default: Supabase (producción actual). `oss` → Aliyun OSS (China).
 */
export function getStorage(): IStorageProvider {
  if (instance) return instance;
  instance = getStorageProvider() === 'oss'
    ? new OssStorageProvider()
    : new SupabaseStorageProvider();
  return instance;
}

export type {
  IStorageProvider,
  StorageBody,
  StorageResult,
  SignedUrlResult,
  UploadOptions,
} from './types';
