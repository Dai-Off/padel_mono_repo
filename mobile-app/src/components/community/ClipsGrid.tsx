import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchReels, CommunityPost } from '../../api/community';

const { width } = Dimensions.get('window');
const COLUMNS = 3;
const GAP = 2;
const CELL_W = (width - GAP * (COLUMNS - 1)) / COLUMNS;
const CELL_H = CELL_W * (16 / 9); // formato vertical 9:16

interface ClipsGridProps {
  token?: string | null;
  ListHeaderComponent?: React.ReactElement;
  onPressClip: (clips: CommunityPost[], index: number) => void;
}

export const ClipsGrid: React.FC<ClipsGridProps> = ({ token, ListHeaderComponent, onPressClip }) => {
  const [clips, setClips] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (isRefreshing = false) => {
    if (isRefreshing) setRefreshing(true);
    else setLoading(true);

    const res = await fetchReels(token);
    if (res.ok) {
      setClips(res.reels);
      setNextCursor(res.next_cursor);
    }
    setLoading(false);
    setRefreshing(false);
  }, [token]);

  useEffect(() => {
    if (token) load();
  }, [load, token]);

  const loadMore = async () => {
    if (loadingMore || !nextCursor || !token) return;
    setLoadingMore(true);
    const res = await fetchReels(token, nextCursor);
    if (res.ok) {
      setClips(prev => [...prev, ...res.reels]);
      setNextCursor(res.next_cursor);
    }
    setLoadingMore(false);
  };

  const renderItem = ({ item, index }: { item: CommunityPost; index: number }) => {
    const media = item.images?.[0];
    const thumb = media?.thumbnail_url || media?.media_url;
    return (
      <TouchableOpacity
        style={styles.cell}
        activeOpacity={0.85}
        onPress={() => onPressClip(clips, index)}
      >
        {thumb ? (
          <Image source={{ uri: thumb }} style={styles.thumb} resizeMode="cover" />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback]}>
            <Ionicons name="videocam" size={26} color="rgba(255,255,255,0.4)" />
          </View>
        )}
        <View style={styles.likes}>
          <Ionicons name="heart" size={12} color="#FFF" />
          <Text style={styles.likesText}>{(item.likes_count ?? 0).toLocaleString()}</Text>
        </View>
        <View style={styles.playBadge}>
          <Ionicons name="play" size={12} color="#FFF" />
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={{ flex: 1 }}>
        {ListHeaderComponent}
        <ActivityIndicator style={{ marginTop: 40 }} color="#F18F34" />
      </View>
    );
  }

  return (
    <FlatList
      data={clips}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      numColumns={COLUMNS}
      columnWrapperStyle={{ gap: GAP }}
      contentContainerStyle={{ gap: GAP, paddingBottom: 24 }}
      ListHeaderComponent={ListHeaderComponent}
      ListEmptyComponent={() => (
        <View style={styles.empty}>
          <Ionicons name="play-circle-outline" size={48} color="rgba(255,255,255,0.1)" />
          <Text style={styles.emptyText}>No hay clips todavía</Text>
        </View>
      )}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#F18F34" />
      }
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
      ListFooterComponent={loadingMore ? <ActivityIndicator style={{ padding: 20 }} color="#F18F34" /> : null}
    />
  );
};

const styles = StyleSheet.create({
  cell: {
    width: CELL_W,
    height: CELL_H,
    backgroundColor: '#1A1A1A',
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  thumbFallback: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  likes: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  likesText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'Outfit_600SemiBold',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 4,
  },
  playBadge: {
    position: 'absolute',
    right: 6,
    top: 6,
    opacity: 0.85,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 16,
    fontFamily: 'Outfit_400Regular',
    marginTop: 12,
  },
});
