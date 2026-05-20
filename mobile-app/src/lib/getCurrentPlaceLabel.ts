import * as Location from 'expo-location';

export type CurrentPlaceResult =
  | { ok: true; label: string }
  | { ok: false; error: string };

export type MapCoords = { latitude: number; longitude: number };

const DEFAULT_COORDS: MapCoords = { latitude: 40.4168, longitude: -3.7038 };

/** Texto legible (ciudad, región) para unas coordenadas. */
export async function placeLabelFromCoords(
  latitude: number,
  longitude: number,
): Promise<CurrentPlaceResult> {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (!results.length) {
      return { ok: false, error: 'No se pudo determinar el lugar en el mapa.' };
    }

    const r = results[0];
    const parts = [
      r.name,
      r.street,
      r.city ?? r.subregion ?? r.district,
      r.region ?? r.country,
    ]
      .map((p) => (p ? String(p).trim() : ''))
      .filter(Boolean);
    const label = [...new Set(parts)].join(', ');
    if (!label) {
      return { ok: false, error: 'No hay nombre para este punto del mapa.' };
    }
    return { ok: true, label: label.slice(0, 200) };
  } catch {
    return { ok: false, error: 'No se pudo leer la dirección del mapa.' };
  }
}

export async function getCurrentMapCoords(): Promise<
  { ok: true; coords: MapCoords } | { ok: false; error: string }
> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') {
    return { ok: false, error: 'Activa el permiso de ubicación.' };
  }
  try {
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      ok: true,
      coords: {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      },
    };
  } catch {
    return { ok: false, error: 'No se pudo obtener tu ubicación.' };
  }
}

/** Ciudad/región a partir de GPS (atajo sin mapa). */
export async function getCurrentPlaceLabel(): Promise<CurrentPlaceResult> {
  const coords = await getCurrentMapCoords();
  if (!coords.ok) return coords;
  return placeLabelFromCoords(coords.coords.latitude, coords.coords.longitude);
}

export { DEFAULT_COORDS };
