/**
 * Contrato de almacenamiento de objetos.
 *
 * Abstrae las operaciones que hoy se hacen directo contra Supabase Storage
 * (`supabase.storage.from(bucket)...`) para poder cambiar a Aliyun OSS en
 * China sin tocar las rutas. La firma sigue el uso real del backend:
 * upload(path, buffer, { contentType, upsert }), getPublicUrl, createSignedUrl, remove.
 */

export type StorageBody = Buffer | Uint8Array | ArrayBuffer | Blob | string;

export interface UploadOptions {
  contentType?: string;
  /** Si true, sobreescribe el objeto existente. */
  upsert?: boolean;
}

export interface StorageResult {
  ok: boolean;
  error?: string;
}

export interface SignedUrlResult extends StorageResult {
  url?: string;
}

export interface IStorageProvider {
  /** Sube un objeto a `bucket/path`. */
  upload(
    bucket: string,
    path: string,
    body: StorageBody,
    options?: UploadOptions,
  ): Promise<StorageResult>;

  /** URL pública (para buckets públicos). No hace I/O. */
  getPublicUrl(bucket: string, path: string): string;

  /** URL firmada temporal (para buckets privados). */
  createSignedUrl(
    bucket: string,
    path: string,
    expiresInSeconds: number,
  ): Promise<SignedUrlResult>;

  /** Elimina uno o más objetos del bucket. */
  remove(bucket: string, paths: string[]): Promise<StorageResult>;
}
