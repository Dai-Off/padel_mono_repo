import { getCurrentMapCoords } from './getCurrentPlaceLabel';

export type SearchCoordinates = { lat: number; lng: number };

export type ResolveSearchCoordsResult =
  | { ok: true; coords: SearchCoordinates }
  | { ok: false; error: string };

/** Ubicación del dispositivo para búsqueda por distancia (producción). */
export async function resolveDeviceSearchCoordinates(): Promise<ResolveSearchCoordsResult> {
  const res = await getCurrentMapCoords();
  if (!res.ok) return res;
  return {
    ok: true,
    coords: { lat: res.coords.latitude, lng: res.coords.longitude },
  };
}
