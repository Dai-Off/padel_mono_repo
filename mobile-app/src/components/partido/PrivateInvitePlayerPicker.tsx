import { useEffect, useRef, useState } from 'react';
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
};

const MIN_SEARCH_CHARS = 2;

export function PrivateInvitePlayerPicker({
  selected,
  onSelectedChange,
  accessToken,
  excludePlayerIds = [],
  onSearchFocus,
}: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlayerSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const selectedRef = useRef(selected);
  const excludeRef = useRef(excludePlayerIds);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    excludeRef.current = excludePlayerIds;
  }, [excludePlayerIds]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_SEARCH_CHARS) {
      setResults([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      setLoading(true);
      void (async () => {
        const res = await searchPlayers(trimmed, accessToken);
        if (cancelled) return;
        setLoading(false);
        if (res.ok) {
          const exclude = new Set([...excludeRef.current, ...selectedRef.current.map((p) => p.id)]);
          setResults(res.players.filter((p) => !exclude.has(p.id)));
        } else {
          setResults([]);
        }
      })();
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      setLoading(false);
    };
  }, [query, accessToken]);

  const addPlayer = (player: PlayerSearchHit) => {
    if (selected.length >= PRIVATE_INVITE_MAX_PLAYERS) return;
    if (selected.some((p) => p.id === player.id)) return;
    onSelectedChange([...selected, player]);
    setQuery('');
    setResults([]);
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
              onFocus={() => onSearchFocus?.()}
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
            <View style={styles.results}>
              {results.map((item) => (
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
                  <Ionicons name="add-circle-outline" size={20} color={theme.auth.accent} />
                </Pressable>
              ))}
            </View>
          ) : query.trim().length >= MIN_SEARCH_CHARS && !loading ? (
            <Text style={styles.hint}>{t('partidos.privateInviteSearchEmpty')}</Text>
          ) : (
            <Text style={styles.hint}>{t('partidos.privateInviteSearchHint')}</Text>
          )}
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
  hint: { marginTop: 8, fontSize: 12, color: theme.auth.textMuted, lineHeight: 18 },
  pressed: { opacity: 0.88 },
});
