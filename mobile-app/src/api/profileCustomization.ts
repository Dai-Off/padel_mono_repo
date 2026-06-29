import { API_URL } from '../config';
import type { AchievementRarity } from '../design/rarity';

export type UnlockableKind = 'trophy' | 'badge' | 'course' | 'title' | 'frame';

/** Ítem del catálogo (título/marco/logro) con el estado de desbloqueo del jugador. */
export interface CatalogItem {
  id: string;
  kind: UnlockableKind;
  title: string;
  description: string;
  rarity: AchievementRarity;
  icon: string | null;
  /** Solo marcos: movimiento (preset en código). */
  animationType: string | null;
  /** Solo marcos: geometría (preset en código). */
  style: string | null;
  /** Solo marcos: override de color/paleta; si null, color por rareza. */
  colors: string[] | null;
  unlockType: string;
  unlockValue: string | null;
  unlocked: boolean;
}

export interface ProfileCustomization {
  titleId: string | null;
  frameId: string | null;
  pinnedBadgeIds: string[];
}

function asRarity(raw: string): AchievementRarity {
  return raw === 'rare' || raw === 'epic' || raw === 'legendary' ? raw : 'common';
}

/** Catálogo de desbloqueables filtrado por kind (p.ej. ['title','frame']). */
export async function fetchUnlockables(
  token: string | null | undefined,
  kinds: UnlockableKind[],
): Promise<CatalogItem[]> {
  if (!token) return [];
  try {
    const q = kinds.length ? `?kind=${kinds.join(',')}` : '';
    const res = await fetch(`${API_URL}/players/me/unlockables${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as { ok?: boolean; items?: Record<string, unknown>[] };
    if (!res.ok || !json.ok) return [];
    return (json.items ?? []).map((raw) => {
      const i = raw as Omit<CatalogItem, 'rarity' | 'colors'> & { rarity: string; colors: unknown };
      return {
        id: i.id,
        kind: i.kind as UnlockableKind,
        title: i.title,
        description: i.description ?? '',
        rarity: asRarity(i.rarity),
        icon: i.icon ?? null,
        animationType: i.animationType ?? null,
        style: i.style ?? null,
        colors: Array.isArray(i.colors) ? (i.colors as string[]) : null,
        unlockType: i.unlockType,
        unlockValue: i.unlockValue ?? null,
        unlocked: Boolean(i.unlocked),
      };
    });
  } catch {
    return [];
  }
}

/** Lo equipado por el jugador. */
export async function fetchCustomization(
  token: string | null | undefined,
): Promise<ProfileCustomization | null> {
  if (!token) return null;
  try {
    const res = await fetch(`${API_URL}/players/me/profile-customization`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as { ok?: boolean; customization?: ProfileCustomization };
    if (!res.ok || !json.ok || !json.customization) return null;
    return {
      titleId: json.customization.titleId ?? null,
      frameId: json.customization.frameId ?? null,
      pinnedBadgeIds: json.customization.pinnedBadgeIds ?? [],
    };
  } catch {
    return null;
  }
}

/** Guarda lo equipado. Devuelve la personalización guardada o null si falla/invalida. */
export async function saveCustomization(
  token: string | null | undefined,
  customization: ProfileCustomization,
): Promise<ProfileCustomization | null> {
  if (!token) return null;
  try {
    const res = await fetch(`${API_URL}/players/me/profile-customization`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(customization),
    });
    const json = (await res.json()) as { ok?: boolean; customization?: ProfileCustomization; error?: string };
    if (!res.ok || !json.ok || !json.customization) return null;
    return json.customization;
  } catch {
    return null;
  }
}
