import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'wematch_preferred_club_ids_v1';

export async function loadStoredPreferredClubIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
  } catch {
    return [];
  }
}

export async function saveStoredPreferredClubIds(ids: string[]): Promise<void> {
  const unique = [...new Set(ids.filter((id) => id.trim().length > 0))];
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(unique));
}
