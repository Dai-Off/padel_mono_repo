import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDebouncedSearch } from '../../hooks/useDebouncedSearch';
import { searchPlayers, type PlayerSearchHit } from '../../api/players';
import { AvatarWithFrame } from '../profile/AvatarWithFrame';
import { useTranslation } from '../../i18n';
import { theme } from '../../theme';
import { formatPlayerLabel } from '../../lib/username';
import { API_URL } from '../../config';
import { fetchFollowing } from '../../api/playerFollows';

interface CommunitySearchProps {
  token: string | null | undefined;
  onSelectPlayer: (playerId: string) => void;
  onClose: () => void;
  myPlayerId?: string;
}

export const CommunitySearch: React.FC<CommunitySearchProps> = ({
  token,
  onSelectPlayer,
  onClose,
  myPlayerId,
}) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  const [searchLoading, setSearchLoading] = useState(false);
  const [searchHits, setSearchHits] = useState<PlayerSearchHit[]>([]);
  const [followingList, setFollowingList] = useState<any[]>([]);

  // 1. Cargar lista de seguidos del usuario logueado en segundo plano
  React.useEffect(() => {
    let cancelled = false;
    const loadFollowing = async () => {
      // Necesitamos el id de jugador del token o del endpoint me
      if (!token) return;
      try {
        const meRes = await fetch(`${API_URL}/players/me/follow-counts`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const counts = await meRes.json();
        // Si tiene seguidos, podemos llamar a fetchFollowing con su propio id (que se puede obtener de la API o usar 'me')
        const followRes = await fetchFollowing(token, 'me'); // El backend ya soporta 'me' en sus endpoints de follow
        if (!cancelled && followRes.ok) {
          setFollowingList(followRes.following);
          setSearchHits(followRes.following.slice(0, 10)); // Límite inicial de 10 seguidos
        }
      } catch (err) {
        console.error('Error fetching following in search:', err);
      }
    };
    void loadFollowing();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // 2. Filtrado y consulta global combinada
  React.useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      setSearchHits(followingList.slice(0, 10));
      return;
    }

    let cancelled = false;

    // Buscar coincidencia en seguidos
    const localMatches = followingList.filter((p) => {
      const username = (p.username ?? '').toLowerCase();
      const firstName = (p.first_name ?? '').toLowerCase();
      const lastName = (p.last_name ?? '').toLowerCase();
      return (
        username.includes(q) ||
        firstName.includes(q) ||
        lastName.includes(q)
      );
    });

    if (q.length < 2) {
      setSearchHits(localMatches);
      return;
    }

    setSearchLoading(true);

    const timer = setTimeout(async () => {
      try {
        const res = await searchPlayers(q, token);
        if (cancelled) return;

        if (res.ok) {
          const combinedMap = new Map<string, PlayerSearchHit>();
          
          // Primero seguidos
          localMatches.forEach((m) => combinedMap.set(m.id, { ...m }));

          // Luego globales
          res.players.forEach((g) => {
            if (!combinedMap.has(g.id)) {
              combinedMap.set(g.id, g);
            }
          });

          setSearchHits(Array.from(combinedMap.values()));
        } else {
          setSearchHits(localMatches);
        }
      } catch {
        if (!cancelled) setSearchHits(localMatches);
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, followingList, token]);

  const clearSearch = () => {
    setQuery('');
  };

  const getInitials = (item: PlayerSearchHit) => {
    const fn = item.first_name ?? '';
    const ln = item.last_name ?? '';
    const initialChars = `${fn.slice(0, 1)}${ln.slice(0, 1)}`.toUpperCase();
    return initialChars || '?';
  };

  return (
    <View style={styles.overlay}>
      {/* Search Header Bar */}
      <View style={styles.headerBar}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color="rgba(255,255,255,0.4)" style={styles.searchIcon} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('community.searchPlaceholder')}
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
            autoFocus
          />
          {query.length > 0 ? (
            <TouchableOpacity onPress={clearSearch} style={styles.clearBtn}>
              <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity onPress={onClose} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>{t('community.createPostCancel')}</Text>
        </TouchableOpacity>
      </View>

      {/* Results / Spinner */}
      {searchLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#F18F34" size="large" />
        </View>
      ) : (
        <FlatList
          data={searchHits}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const fullName = `${item.first_name ?? ''} ${item.last_name ?? ''}`.trim();
            const label = formatPlayerLabel(item, '');
            return (
              <Pressable
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={() => onSelectPlayer(item.id)}
              >
                <AvatarWithFrame
                  avatarUrl={item.avatar_url ?? null}
                  initials={getInitials(item)}
                  size={44}
                  frame={item.frame ?? null}
                  animate={false}
                />
                <View style={styles.rowInfo}>
                  <Text style={styles.username} numberOfLines={1}>
                    {label || fullName || t('common.playerFallback')}
                  </Text>
                  {label && fullName ? (
                    <Text style={styles.fullName} numberOfLines={1}>
                      {fullName}
                    </Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" />
              </Pressable>
            );
          }}
          ListEmptyComponent={() => {
            if (query.trim().length < 2) {
              return null;
            }
            return (
              <View style={styles.emptyContainer}>
                <Ionicons name="people-outline" size={48} color="rgba(255,255,255,0.1)" />
                <Text style={styles.emptyText}>{t('community.searchNoResults')}</Text>
              </View>
            );
          }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0F0F0F',
    zIndex: 999,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 38,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#FFF',
    fontSize: 14,
    padding: 0,
    height: '100%',
    fontFamily: 'Outfit_400Regular',
  },
  clearBtn: {
    padding: 4,
  },
  cancelBtn: {
    marginLeft: 12,
    paddingVertical: 8,
  },
  cancelText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Outfit_600SemiBold',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingVertical: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  rowPressed: {
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  rowInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  username: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Outfit_600SemiBold',
  },
  fullName: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontFamily: 'Outfit_400Regular',
    marginTop: 2,
  },
  emptyContainer: {
    paddingTop: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 15,
    fontFamily: 'Outfit_400Regular',
    marginTop: 12,
  },
});
