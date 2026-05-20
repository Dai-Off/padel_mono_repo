import { File } from 'expo-file-system';

/** Lee una URI local de ImagePicker como bytes (fetch+blob falla en RN con file://). */
export async function readImageBytesFromUri(uri: string): Promise<Uint8Array> {
  const file = new File(uri);
  const bytes = await file.bytes();
  if (!bytes || bytes.byteLength < 100) {
    throw new Error('No se pudo leer la imagen seleccionada');
  }
  return bytes;
}
