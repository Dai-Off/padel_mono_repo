import { API_URL } from '../config';
import type { AchievementRarity } from '../design/rarity';
import type { FrameAttrs } from '../components/profile/AvatarWithFrame';

export type UnlockableKind = 'trophy' | 'badge' | 'course' | 'title' | 'frame' | 'name_color' | 'theme';

/** Color de nombre resuelto: paleta (1 = sólido, 2+ = gradiente) + rareza (glow). */
export interface NameColorAttrs {
  id: string;
  rarity: AchievementRarity;
  colors: string[] | null;
}

/** Tema de perfil resuelto: paleta [top, bottom, accent] + motor de animación. */
export interface ThemeAttrs {
  id: string;
  rarity: AchievementRarity;
  colors: string[] | null;
  animationType: string | null;
}

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
  nameColorId: string | null;
  themeId: string | null;
  pinnedBadgeIds: string[];
  /** Color de nombre resuelto (solo lectura, para pintar el nombre propio). */
  nameColor?: NameColorAttrs | null;
  /** Tema resuelto (solo lectura, para pintar el fondo del perfil propio). */
  theme?: ThemeAttrs | null;
}

export function asNameColor(raw: unknown): NameColorAttrs | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { id?: string; rarity?: string; colors?: unknown };
  if (!r.id) return null;
  return {
    id: r.id,
    rarity: asRarity(String(r.rarity ?? 'common')),
    colors: Array.isArray(r.colors) ? (r.colors as string[]) : null,
  };
}

export function asTheme(raw: unknown): ThemeAttrs | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { id?: string; rarity?: string; colors?: unknown; animationType?: unknown };
  if (!r.id) return null;
  return {
    id: r.id,
    rarity: asRarity(String(r.rarity ?? 'common')),
    colors: Array.isArray(r.colors) ? (r.colors as string[]) : null,
    animationType: typeof r.animationType === 'string' ? r.animationType : null,
  };
}

function asRarity(raw: string): AchievementRarity {
  return raw === 'rare' || raw === 'epic' || raw === 'legendary' ? raw : 'common';
}

/** Mapea los `items` crudos del backend (catálogo de desbloqueables) a CatalogItem[]. */
export function mapUnlockables(items: Record<string, unknown>[]): CatalogItem[] {
  return (items ?? []).map((raw) => {
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
    return mapUnlockables(json.items ?? []);
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
    const json = (await res.json()) as {
      ok?: boolean;
      customization?: ProfileCustomization & { nameColor?: unknown; theme?: unknown };
    };
    if (!res.ok || !json.ok || !json.customization) return null;
    return {
      titleId: json.customization.titleId ?? null,
      frameId: json.customization.frameId ?? null,
      nameColorId: json.customization.nameColorId ?? null,
      nameColor: asNameColor(json.customization.nameColor),
      themeId: json.customization.themeId ?? null,
      theme: asTheme(json.customization.theme),
      pinnedBadgeIds: json.customization.pinnedBadgeIds ?? [],
    };
  } catch {
    return null;
  }
}

/** Insignia fijada de un jugador (resuelta), para el hero del perfil ajeno. */
export interface PublicPinnedBadge {
  id: string;
  type: 'trophy' | 'badge';
  title: string;
  icon: string;
  rarity: AchievementRarity;
}

/** Personalización equipada de otro jugador, ya resuelta (marco + título + color + tema + fijadas). */
export interface PublicProfileCustomization {
  titleId: string | null;
  frame: FrameAttrs | null;
  nameColor: NameColorAttrs | null;
  theme: ThemeAttrs | null;
  pinnedBadges: PublicPinnedBadge[];
}

/** Personalización pública de otro jugador (perfil ajeno). Público (sin token). */
export async function fetchPlayerPublicCustomization(
  playerId: string,
): Promise<PublicProfileCustomization | null> {
  if (!playerId) return null;
  try {
    const res = await fetch(`${API_URL}/players/${playerId}/public-customization`);
    const json = (await res.json()) as {
      ok?: boolean;
      customization?: {
        titleId: string | null;
        frame: { rarity: string; style: string | null; animationType: string | null; colors: string[] | null } | null;
        nameColor?: unknown;
        theme?: unknown;
        pinnedBadges: { id: string; type: string; title: string; icon: string; rarity: string }[];
      };
    };
    if (!res.ok || !json.ok || !json.customization) return null;
    const c = json.customization;
    return {
      titleId: c.titleId ?? null,
      frame: c.frame
        ? { rarity: asRarity(c.frame.rarity), style: c.frame.style, animationType: c.frame.animationType, colors: c.frame.colors ?? null }
        : null,
      nameColor: asNameColor(c.nameColor),
      theme: asTheme(c.theme),
      pinnedBadges: (c.pinnedBadges ?? []).map((b) => ({
        id: b.id,
        type: b.type === 'trophy' ? 'trophy' : 'badge',
        title: b.title,
        icon: b.icon,
        rarity: asRarity(b.rarity),
      })),
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
      body: JSON.stringify({
        titleId: customization.titleId,
        frameId: customization.frameId,
        nameColorId: customization.nameColorId,
        themeId: customization.themeId,
        pinnedBadgeIds: customization.pinnedBadgeIds,
      }),
    });
    const json = (await res.json()) as { ok?: boolean; customization?: ProfileCustomization; error?: string };
    if (!res.ok || !json.ok || !json.customization) return null;
    return {
      titleId: json.customization.titleId ?? null,
      frameId: json.customization.frameId ?? null,
      nameColorId: json.customization.nameColorId ?? null,
      themeId: json.customization.themeId ?? null,
      pinnedBadgeIds: json.customization.pinnedBadgeIds ?? [],
    };
  } catch {
    return null;
  }
}
