import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { playerInviteLabel } from '../../api/matchInvites';
import { searchPlayers, type PlayerSearchHit } from '../../api/players';
import { useDebouncedSearch } from '../../hooks/useDebouncedSearch';
import { fetchInviteSuggestions } from '../../lib/inviteSuggestions';
import { useTranslation } from '../../i18n';
import { theme } from '../../theme';

export const PRIVATE_INVITE_MAX_PLAYERS = 3;

export type SelectedInvitePlayer = PlayerSearchHit;

type Props = {
  selected: SelectedInvitePlayer[];
  onSelectedChange: (players: SelectedInvitePlayer[]) => void;
  accessToken?: string | null;
  excludePlayerIds?: string[];
  onSearchFocus?: () => void;
  /** Id del usuario actual, para cargar sugerencias (compañeros frecuentes). */
  currentPlayerId?: string;
};

const MIN_SEARCH_CHARS = 2;
const SUGGESTIONS_LIMIT = 5;

export function PrivateInvitePlayerPicker({
  selected,
  onSelectedChange,
  accessToken,
  excludePlayerIds = [],
  onSearchFocus,
  currentPlayerId,
}: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<PlayerSearchHit[]>([]);

  // Búsqueda con debounce (300 ms, 2 chars); el backend excluye al propio usuario.
  const { items: rawResults, loading } = useDebouncedSearch(
    query,
    (q) => searchPlayers(q, accessToken, { excludeSelf: true }).then((r) => (r.ok ? r.players : [])),
    { delay: 300, minChars: MIN_SEARCH_CHARS },
  );

  // Sugerencias por defecto (hoy: compañeros frecuentes + seguidos).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const s = await fetchInviteSuggestions(currentPlayerId, SUGGESTIONS_LIMIT, accessToken);
      if (!cancelled) setSuggestions(s);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentPlayerId, accessToken]);

  const excludedIds = useMemo(
    () => new Set([...excludePlayerIds, ...selected.map((p) => p.id)]),
    [excludePlayerIds, selected],
  );
  const suggestionIds = useMemo(() => new Set(suggestions.map((s) => s.id)), [suggestions]);
  const searching = query.trim().length >= MIN_SEARCH_CHARS;

  // Sin texto → sugerencias (solo tras tocar el input). Con texto → resultados, con las sugerencias que casen arriba.
  const results = useMemo(() => {
    if (!searching) return focused ? suggestions.filter((p) => !excludedIds.has(p.id)) : [];
    const filtered = rawResults.filter((p) => !excludedIds.has(p.id));
    const matched = filtered.filter((p) => suggestionIds.has(p.id));
    const others = filtered.filter((p) => !suggestionIds.has(p.id));
    return [...matched, ...others];
  }, [searching, focused, suggestions, rawResults, excludedIds, suggestionIds]);

  const addPlayer = (player: PlayerSearchHit) => {
    if (selected.length >= PRIVATE_INVITE_MAX_PLAYERS) return;
    if (selected.some((p) => p.id === player.id)) return;
    onSelectedChange([...selected, player]);
    setQuery('');
  };

  const removePlayer = (playerId: string) => {
    onSelectedChange(selected.filter((p) => p.id !== playerId));
  };

  return (
    <View>
      {selected.map((player) => (
        <View key={player.id} style={styles.chip}>
          {player.avatar_url ? (
            <Image source={{ uri: player.avatar_url }} style={styles.chipAvatar} />
          ) : (
            <View style={styles.chipAvatarPlaceholder}>
              <Ionicons name="person" size={14} color="#9ca3af" />
            </View>
          )}
          <Text style={styles.chipText} numberOfLines={1}>
            {playerInviteLabel(player)}
          </Text>
          <Pressable
            onPress={() => removePlayer(player.id)}
            hitSlop={8}
            style={({ pressed }) => [pressed && styles.pressed]}
          >
            <Ionicons name="close-circle" size={20} color="#9ca3af" />
          </Pressable>
        </View>
      ))}

      {selected.length < PRIVATE_INVITE_MAX_PLAYERS ? (
        <>
          <View style={styles.inputWrap}>
            <TextInput
              style={[styles.input, loading && styles.inputWithSpinner]}
              value={query}
              onChangeText={setQuery}
              onFocus={() => {
                setFocused(true);
                onSearchFocus?.();
              }}
              placeholder={t('partidos.privateInviteSearchPlaceholder')}
              placeholderTextColor="#6b7280"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {loading ? (
              <ActivityIndicator
                size="small"
                color={theme.auth.accent}
                style={styles.inputSpinner}
              />
            ) : null}
          </View>
          {results.length > 0 ? (
            <>
              {!searching ? (
                <Text style={styles.suggestionsHeader}>{t('partidos.privateInviteSuggestions')}</Text>
              ) : null}
              <View style={styles.results}>
                {results.map((item) => {
                  const isSuggestion = suggestionIds.has(item.id);
                  return (
                    <Pressable
                      key={item.id}
                      style={({ pressed }) => [styles.resultRow, pressed && styles.pressed]}
                      onPress={() => addPlayer(item)}
                    >
                      {item.avatar_url ? (
                        <Image source={{ uri: item.avatar_url }} style={styles.resultAvatar} />
                      ) : (
                        <View style={styles.resultAvatarPlaceholder}>
                          <Ionicons name="person" size={16} color="#9ca3af" />
                        </View>
                      )}
                      <Text style={styles.resultText}>{playerInviteLabel(item)}</Text>
                      {isSuggestion ? (
                        <Ionicons name="star" size={13} color={theme.auth.accent} style={styles.suggestionStar} />
                      ) : null}
                      <Ionicons name="add-circle-outline" size={20} color={theme.auth.accent} />
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : searching && !loading ? (
            <Text style={styles.hint}>{t('partidos.privateInviteSearchEmpty')}</Text>
          ) : !searching ? (
            <Text style={styles.hint}>{t('partidos.privateInviteSearchHint')}</Text>
          ) : null}
        </>
      ) : (
        <Text style={styles.hint}>{t('partidos.privateInviteAllSlots')}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  chipAvatar: { width: 28, height: 28, borderRadius: 14 },
  chipAvatarPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { flex: 1, color: theme.auth.text, fontSize: 14, fontWeight: '600' },
  inputWrap: {
    position: 'relative',
    marginTop: 4,
    justifyContent: 'center',
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.auth.text,
    fontSize: 15,
  },
  inputWithSpinner: {
    paddingRight: 40,
  },
  inputSpinner: {
    position: 'absolute',
    right: 12,
  },
  results: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  resultAvatar: { width: 32, height: 32, borderRadius: 16 },
  resultAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultText: { flex: 1, color: theme.auth.text, fontSize: 14 },
  suggestionStar: { marginRight: 4 },
  suggestionsHeader: {
    marginTop: 10,
    marginBottom: 2,
    fontSize: 11,
    fontWeight: '700',
    color: theme.auth.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  hint: { marginTop: 8, fontSize: 12, color: theme.auth.textMuted, lineHeight: 18 },
  pressed: { opacity: 0.88 },
});
