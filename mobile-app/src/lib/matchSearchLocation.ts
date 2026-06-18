import * as Location from 'expo-location';
import { getCurrentMapCoords, type TranslateFn } from './getCurrentPlaceLabel';

export type SearchCoordinates = { lat: number; lng: number };

export type ResolveSearchCoordsResult =
  | { ok: true; coords: SearchCoordinates }
  | { ok: false; error: string };

export type LocationIssueAction = 'request_permission' | 'open_settings' | 'retry';

export type LocationIssue = {
  message: string;
  action: LocationIssueAction;
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

/** Comprueba permiso y GPS sin esperar fix (respuesta inmediata). */
export async function probeDeviceLocationIssue(t: TranslateFn): Promise<LocationIssue | null> {
  const perm = await Location.getForegroundPermissionsAsync();
  if (perm.status === 'undetermined') {
    return {
      message: t('common.locationNeedForDistance'),
      action: 'request_permission',
    };
  }
  if (perm.status !== 'granted') {
    return {
      message: t('common.locationPermissionForDistance'),
      action: 'open_settings',
    };
  }
  const servicesOn = await Location.hasServicesEnabledAsync();
  if (!servicesOn) {
    return {
      message: t('common.locationGpsForDistance'),
      action: 'open_settings',
    };
  }
  return null;
}

/** Ubicación con timeout corto: evita esperas largas cuando el GPS no responde. */
export async function resolveDeviceSearchCoordinatesFast(
  timeoutMs: number,
  t: TranslateFn,
): Promise<ResolveSearchCoordsResult> {
  const issue = await probeDeviceLocationIssue(t);
  if (issue) return { ok: false, error: issue.message };

  try {
    const last = await Location.getLastKnownPositionAsync({ maxAge: 300_000 });
    if (
      last?.coords &&
      Number.isFinite(last.coords.latitude) &&
      Number.isFinite(last.coords.longitude)
    ) {
      return { ok: true, coords: { lat: last.coords.latitude, lng: last.coords.longitude } };
    }
  } catch {
    /* seguir con fix actual */
  }

  const pos = await withTimeout(
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }),
    timeoutMs,
  );
  if (
    pos?.coords &&
    Number.isFinite(pos.coords.latitude) &&
    Number.isFinite(pos.coords.longitude)
  ) {
    return { ok: true, coords: { lat: pos.coords.latitude, lng: pos.coords.longitude } };
  }

  return {
    ok: false,
    error: t('common.locationCouldNotGetPickClubs'),
  };
}

/** Ubicación del dispositivo para búsqueda por distancia (producción). */
export async function resolveDeviceSearchCoordinates(t: TranslateFn): Promise<ResolveSearchCoordsResult> {
  const res = await getCurrentMapCoords(t);
  if (!res.ok) return res;
  return {
    ok: true,
    coords: { lat: res.coords.latitude, lng: res.coords.longitude },
  };
}
