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

function coordsFromPosition(pos: Location.LocationObject): MapCoords {
  return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
}

export async function getCurrentMapCoords(): Promise<
  { ok: true; coords: MapCoords } | { ok: false; error: string }
> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') {
    return { ok: false, error: 'Activa el permiso de ubicación.' };
  }

  const servicesOn = await Location.hasServicesEnabledAsync();
  if (!servicesOn) {
    return { ok: false, error: 'Activa la ubicación (GPS) en los ajustes del dispositivo.' };
  }

  try {
    const last = await Location.getLastKnownPositionAsync({ maxAge: 300_000 });
    if (last?.coords && Number.isFinite(last.coords.latitude) && Number.isFinite(last.coords.longitude)) {
      return { ok: true, coords: coordsFromPosition(last) };
    }
  } catch {
    /* seguir con fix actual */
  }

  const attempts: Location.LocationOptions[] = [
    { accuracy: Location.Accuracy.Balanced },
    { accuracy: Location.Accuracy.Low },
  ];

  for (const options of attempts) {
    try {
      const pos = await Location.getCurrentPositionAsync(options);
      if (Number.isFinite(pos.coords.latitude) && Number.isFinite(pos.coords.longitude)) {
        return { ok: true, coords: coordsFromPosition(pos) };
      }
    } catch {
      /* siguiente intento */
    }
  }

  return {
    ok: false,
    error:
      'No se pudo obtener tu ubicación. Probá de nuevo en unos segundos o elegí clubes preferidos.',
  };
}

/** Ciudad/región a partir de GPS (atajo sin mapa). */
export async function getCurrentPlaceLabel(): Promise<CurrentPlaceResult> {
  const coords = await getCurrentMapCoords();
  if (!coords.ok) return coords;
  return placeLabelFromCoords(coords.coords.latitude, coords.coords.longitude);
}

export { DEFAULT_COORDS };
