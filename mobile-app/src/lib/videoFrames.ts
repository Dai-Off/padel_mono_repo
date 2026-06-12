import * as VideoThumbnails from 'expo-video-thumbnails';

export type MediaFile = { uri: string; name: string; type: string };

// Nº de frames a moderar según la duración del vídeo (mín 3, máx 5).
// Acordado: ≤15s → 3 · 16–40s → 4 · 41–60s → 5.
export function framesForDuration(durationMs: number): number {
  const s = durationMs / 1000;
  if (s <= 15) return 3;
  if (s <= 40) return 4;
  return 5;
}

// Tiempos (ms) repartidos uniformemente por la duración, incluyendo 0 y el final.
export function sampleTimes(durationMs: number, count: number): number[] {
  if (count <= 1 || durationMs <= 0) return [0];
  const step = durationMs / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(i * step));
}

// Extrae un frame del vídeo como imagen lista para subir.
export async function extractFrame(videoUri: string, timeMs: number, idx: number): Promise<MediaFile> {
  const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, { time: timeMs, quality: 0.7 });
  return { uri, name: `frame-${Date.now()}-${idx}.jpg`, type: 'image/jpeg' };
}

// Genera portada (primer frame) + frames de moderación de un vídeo.
// Si la portada es la automática (frame 0), no se repite en los frames.
export async function buildVideoCoverAndFrames(
  videoUri: string,
  durationMs: number,
  coverIsAuto: boolean,
): Promise<{ cover: MediaFile; moderationFrames: MediaFile[] }> {
  const cover = await extractFrame(videoUri, 0, 0);
  const count = framesForDuration(durationMs);
  const times = sampleTimes(durationMs, count);
  const frameTimes = coverIsAuto ? times.slice(1) : times;
  const moderationFrames = await Promise.all(frameTimes.map((t, i) => extractFrame(videoUri, t, i + 1)));
  return { cover: { ...cover, name: `cover-${Date.now()}.jpg` }, moderationFrames };
}
