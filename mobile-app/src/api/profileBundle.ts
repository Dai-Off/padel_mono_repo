import { API_URL } from '../config';
import { mapAchievements, type AchievementsResponse } from './unlockables';
import { asNameColor, mapUnlockables, type CatalogItem, type ProfileCustomization } from './profileCustomization';
import type { Achievement } from '../design/achievements';

/**
 * Bundle del HERO: personalización + marcos + logros en 1 round-trip. Es lo
 * ÚNICO que bloquea el hero. El radar, el peer, las stats, la evolución y el
 * social van por su cuenta y rellenan su card con skeleton. El `profile` base
 * llega ya cacheado de HomeDataContext.
 */
export type ProfileBundle = {
  customization: ProfileCustomization;
  frames: CatalogItem[];
  achievements: Achievement[];
};

type ProfileBundleResponse = {
  ok?: boolean;
  customization?: ProfileCustomization & { nameColor?: unknown };
  frames?: Record<string, unknown>[];
  achievements?: AchievementsResponse['achievements'];
};

export async function fetchProfileBundle(
  token: string | null | undefined,
): Promise<ProfileBundle | null> {
  if (!token) return null;
  try {
    const res = await fetch(`${API_URL}/players/me/profile-bundle`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as ProfileBundleResponse;
    if (!res.ok || !json.ok) return null;
    return {
      customization: {
        titleId: json.customization?.titleId ?? null,
        frameId: json.customization?.frameId ?? null,
        nameColorId: json.customization?.nameColorId ?? null,
        nameColor: asNameColor(json.customization?.nameColor),
        pinnedBadgeIds: json.customization?.pinnedBadgeIds ?? [],
      },
      frames: mapUnlockables(json.frames ?? []),
      achievements: mapAchievements({ achievements: json.achievements }),
    };
  } catch {
    return null;
  }
}
