import { API_URL } from '../config';
import { withLangQuery } from './backendLang';
import type { AppLocale } from '../i18n/constants';
import { mapAchievements, type AchievementsResponse } from './unlockables';
import { mapUnlockables, type CatalogItem, type ProfileCustomization } from './profileCustomization';
import type { Achievement } from '../design/achievements';
import type { CoachAssessment } from './coachAssessment';
import type { PeerFeedbackInsight } from './peerFeedbackInsight';

/**
 * Bundle above-the-fold del perfil: personalización, marcos, logros, radar del
 * Coach y peer-insight en 1 round-trip. NO trae stats/level-history/social (van
 * aparte) ni el `profile` base (ya cacheado en HomeDataContext).
 */
export type ProfileBundle = {
  customization: ProfileCustomization;
  frames: CatalogItem[];
  achievements: Achievement[];
  coachRadar: CoachAssessment | null;
  peerInsight: PeerFeedbackInsight | null;
};

type ProfileBundleResponse = {
  ok?: boolean;
  customization?: ProfileCustomization;
  frames?: Record<string, unknown>[];
  achievements?: AchievementsResponse['achievements'];
  coachRadar?: CoachAssessment | null;
  peerInsight?: PeerFeedbackInsight | null;
};

export async function fetchProfileBundle(
  token: string | null | undefined,
  locale?: AppLocale,
): Promise<ProfileBundle | null> {
  if (!token) return null;
  try {
    const res = await fetch(withLangQuery(`${API_URL}/players/me/profile-bundle`, locale), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as ProfileBundleResponse;
    if (!res.ok || !json.ok) return null;
    return {
      customization: {
        titleId: json.customization?.titleId ?? null,
        frameId: json.customization?.frameId ?? null,
        pinnedBadgeIds: json.customization?.pinnedBadgeIds ?? [],
      },
      frames: mapUnlockables(json.frames ?? []),
      achievements: mapAchievements({ achievements: json.achievements }),
      coachRadar: json.coachRadar ?? null,
      peerInsight: json.peerInsight ?? null,
    };
  } catch {
    return null;
  }
}
