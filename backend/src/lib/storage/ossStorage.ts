import type {
  IStorageProvider,
  SignedUrlResult,
  StorageBody,
  StorageResult,
  UploadOptions,
} from './types';

/**
 * Stub de Aliyun OSS (Object Storage Service) para el despliegue en China.
 *
 * Pendiente de implementación:
 *  - Agregar dependencia `ali-oss` (npm i ali-oss) cuando se confirme el proveedor.
 *  - Env vars esperadas:
 *      OSS_REGION, OSS_BUCKET, OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET,
 *      OSS_ENDPOINT (opcional), OSS_PUBLIC_BASE_URL (CDN).
 *  - Mapear buckets lógicos (player-avatars, tournament-posters, etc.) a
 *    carpetas/prefijos dentro de un bucket OSS o a buckets dedicados.
 *  - getPublicUrl: construir desde OSS_PUBLIC_BASE_URL + path.
 *  - createSignedUrl: usar `client.signatureUrl(path, { expires })`.
 *
 * Se activa solo cuando STORAGE_PROVIDER=oss; en producción global nunca se usa.
 */
export class OssStorageProvider implements IStorageProvider {
  private notImplemented(method: string): never {
    throw new Error(
      `[OssStorageProvider] ${method} no implementado todavía. ` +
        'Configurar el SDK de Aliyun OSS antes de usar STORAGE_PROVIDER=oss.',
    );
  }

  async upload(
    _bucket: string,
    _path: string,
    _body: StorageBody,
    _options?: UploadOptions,
  ): Promise<StorageResult> {
    this.notImplemented('upload');
  }

  getPublicUrl(_bucket: string, _path: string): string {
    this.notImplemented('getPublicUrl');
  }

  async createSignedUrl(
    _bucket: string,
    _path: string,
    _expiresInSeconds: number,
  ): Promise<SignedUrlResult> {
    this.notImplemented('createSignedUrl');
  }

  async remove(_bucket: string, _paths: string[]): Promise<StorageResult> {
    this.notImplemented('remove');
  }
}
