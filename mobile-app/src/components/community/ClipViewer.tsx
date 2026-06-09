import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Pressable,
  Dimensions,
  Animated,
  Easing,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CommunityPost, fetchReelsFeed, toggleLike, toggleBookmark } from '../../api/community';
import { formatPlayerLabel } from '../../lib/username';
import { CommentSheet } from './CommentSheet';

const { width, height } = Dimensions.get('window');

interface ClipViewerProps {
  isVisible: boolean;
  seedClip: CommunityPost | null;
  token?: string | null;
  onClose: () => void;
}

/**
 * Visor inmersivo de Clips (estilo TikTok): feed vertical recomendado,
 * con reproducción del clip activo, doble-tap like, mute y acciones.
 * Los botones "Seguir" y "Compartir" son solo visuales por ahora.
 */
export const ClipViewer: React.FC<ClipViewerProps> = ({ isVisible, seedClip, token, onClose }) => {
  const insets = useSafeAreaInsets();
  const [clips, setClips] = useState<CommunityPost[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [commentsClip, setCommentsClip] = useState<CommunityPost | null>(null);

  // Al abrir: mostramos la semilla al instante y cargamos el feed recomendado.
  useEffect(() => {
    if (isVisible && seedClip) {
      setClips([seedClip]);
      setActiveIndex(0);
      setNextCursor(null);
      (async () => {
        const res = await fetchReelsFeed(token, seedClip.id);
        if (res.ok && res.reels.length > 0) {
          setClips(res.reels);
          setNextCursor(res.next_cursor);
        }
      })();
    }
  }, [isVisible, seedClip, token]);

  const loadMore = async () => {
    if (loadingMore || !nextCursor || !seedClip) return;
    setLoadingMore(true);
    const res = await fetchReelsFeed(token, seedClip.id, nextCursor);
    if (res.ok) {
      setClips(prev => [...prev, ...res.reels]);
      setNextCursor(res.next_cursor);
    }
    setLoadingMore(false);
  };

  const onViewRef = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) setActiveIndex(viewableItems[0].index ?? 0);
  });
  const viewConfigRef = useRef({ itemVisiblePercentThreshold: 80 });

  if (!isVisible || !seedClip) return null;

  return (
    <Modal visible={isVisible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.container}>
        <FlatList
          data={clips}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <ClipCell
              clip={item}
              isActive={index === activeIndex}
              muted={muted}
              token={token}
              onOpenComments={() => setCommentsClip(item)}
            />
          )}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, i) => ({ length: height, offset: height * i, index: i })}
          onViewableItemsChanged={onViewRef.current}
          viewabilityConfig={viewConfigRef.current}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          windowSize={3}
          maxToRenderPerBatch={3}
          removeClippedSubviews
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ padding: 20 }} color="#FFF" /> : null}
        />

        {/* Barra superior fija */}
        <View style={[styles.topBar, { top: insets.top + 8 }]} pointerEvents="box-none">
          <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
            <Ionicons name="close" size={22} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.topTitle}>Clips</Text>
          <TouchableOpacity onPress={() => setMuted(m => !m)} style={styles.iconBtn}>
            <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={20} color={muted ? '#FFF' : '#F18F34'} />
          </TouchableOpacity>
        </View>

        <CommentSheet
          isVisible={!!commentsClip}
          onClose={() => setCommentsClip(null)}
          post={commentsClip}
        />
      </View>
    </Modal>
  );
};

// ─── Celda de un Clip ────────────────────────────────────────────────────────

interface ClipCellProps {
  clip: CommunityPost;
  isActive: boolean;
  muted: boolean;
  token?: string | null;
  onOpenComments: () => void;
}

const ClipCell: React.FC<ClipCellProps> = ({ clip, isActive, muted, token, onOpenComments }) => {
  const insets = useSafeAreaInsets();
  const url = clip.images?.[0]?.media_url ?? null;

  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
  });

  const [liked, setLiked] = useState(clip.has_liked);
  const [likesCount, setLikesCount] = useState(clip.likes_count ?? 0);
  const [bookmarked, setBookmarked] = useState(clip.has_bookmarked);

  // Reproducir solo el clip activo.
  useEffect(() => {
    try {
      if (isActive) player.play();
      else { player.pause(); player.currentTime = 0; }
    } catch {}
  }, [isActive, player]);

  useEffect(() => {
    try { player.muted = muted; } catch {}
  }, [muted, player]);

  // Animación del corazón (doble-tap).
  const heartScale = useRef(new Animated.Value(0)).current;
  const popHeart = () => {
    heartScale.setValue(0);
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1, friction: 4, useNativeDriver: true }),
      Animated.timing(heartScale, { toValue: 0, delay: 400, duration: 300, useNativeDriver: true }),
    ]).start();
  };

  // Disco de música girando.
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 5000, easing: Easing.linear, useNativeDriver: true })
    );
    anim.start();
    return () => anim.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const handleLike = async () => {
    if (!token) return;
    const was = liked;
    setLiked(!was);
    setLikesCount(c => (was ? c - 1 : c + 1));
    const res = await toggleLike(token, clip.id);
    if (!res.ok) {
      setLiked(was);
      setLikesCount(c => (was ? c + 1 : c - 1));
    }
  };

  const handleBookmark = async () => {
    if (!token) return;
    const was = bookmarked;
    setBookmarked(!was);
    const res = await toggleBookmark(token, clip.id);
    if (!res.ok) setBookmarked(was);
  };

  const lastTap = useRef(0);
  const onVideoTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      if (!liked) handleLike();
      popHeart();
    }
    lastTap.current = now;
  };

  return (
    <View style={styles.cell}>
      {url ? (
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.noVideo]} />
      )}

      {/* Captura del doble-tap */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onVideoTap} />

      {/* Corazón del doble-tap */}
      <Animated.View
        pointerEvents="none"
        style={[styles.bigHeart, { opacity: heartScale, transform: [{ scale: heartScale }] }]}
      >
        <Ionicons name="heart" size={120} color="#FF3B30" />
      </Animated.View>

      {/* Degradados */}
      <LinearGradient
        colors={['rgba(0,0,0,0.5)', 'transparent', 'rgba(0,0,0,0.85)']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Sidebar de acciones */}
      <View style={[styles.sidebar, { bottom: insets.bottom + 90 }]}>
        <View style={styles.authorAvatarWrap}>
          {clip.player.avatar_url ? (
            <Animated.Image source={{ uri: clip.player.avatar_url }} style={styles.authorAvatar} />
          ) : (
            <View style={[styles.authorAvatar, styles.authorAvatarFallback]}>
              <Ionicons name="person" size={18} color="#FFF" />
            </View>
          )}
          {/* "Seguir" — solo visual */}
          <View style={styles.followBadge}>
            <Ionicons name="add" size={12} color="#FFF" />
          </View>
        </View>

        <TouchableOpacity style={styles.action} onPress={handleLike}>
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={32} color={liked ? '#FF3B30' : '#FFF'} />
          <Text style={styles.actionText}>{likesCount.toLocaleString()}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.action} onPress={onOpenComments}>
          <Ionicons name="chatbubble-outline" size={30} color="#FFF" />
          <Text style={styles.actionText}>{(clip.comments_count ?? 0).toLocaleString()}</Text>
        </TouchableOpacity>

        {/* "Compartir" — solo visual */}
        <View style={styles.action}>
          <Ionicons name="arrow-redo-outline" size={30} color="#FFF" />
        </View>

        <TouchableOpacity style={styles.action} onPress={handleBookmark}>
          <Ionicons name={bookmarked ? 'bookmark' : 'bookmark-outline'} size={28} color={bookmarked ? '#F18F34' : '#FFF'} />
        </TouchableOpacity>

        <Animated.View style={[styles.musicDisc, { transform: [{ rotate }] }]}>
          <Ionicons name="musical-notes" size={16} color="#FFF" />
        </Animated.View>
      </View>

      {/* Info inferior (solo visual: no bloquea el doble-tap) */}
      <View style={[styles.bottom, { bottom: insets.bottom + 24 }]} pointerEvents="none">
        <View style={styles.authorRow}>
          <Text style={styles.author}>{formatPlayerLabel(clip.player)}</Text>
          {/* "Seguir" — solo visual */}
          <View style={styles.followBtn}>
            <Text style={styles.followBtnText}>Seguir</Text>
          </View>
        </View>
        {!!clip.caption && <Text style={styles.caption} numberOfLines={2}>{clip.caption}</Text>}
        <View style={styles.soundRow}>
          <Ionicons name="musical-notes" size={12} color="rgba(255,255,255,0.7)" />
          <Text style={styles.soundText}>Sonido original</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  cell: {
    width,
    height,
    backgroundColor: '#000',
  },
  noVideo: {
    backgroundColor: '#111',
  },
  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  topTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Outfit_700Bold',
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bigHeart: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sidebar: {
    position: 'absolute',
    right: 10,
    alignItems: 'center',
    gap: 18,
  },
  authorAvatarWrap: {
    marginBottom: 4,
  },
  authorAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    borderColor: '#FFF',
  },
  authorAvatarFallback: {
    backgroundColor: '#F18F34',
    justifyContent: 'center',
    alignItems: 'center',
  },
  followBadge: {
    position: 'absolute',
    bottom: -8,
    alignSelf: 'center',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#F18F34',
    justifyContent: 'center',
    alignItems: 'center',
  },
  action: {
    alignItems: 'center',
    gap: 4,
  },
  actionText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Outfit_600SemiBold',
  },
  musicDisc: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(60,60,60,0.9)',
    borderWidth: 4,
    borderColor: 'rgba(120,120,120,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottom: {
    position: 'absolute',
    left: 16,
    right: 90,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  author: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Outfit_700Bold',
  },
  followBtn: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  followBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Outfit_600SemiBold',
  },
  caption: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 14,
    marginBottom: 6,
    fontFamily: 'Outfit_400Regular',
  },
  soundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  soundText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontFamily: 'Outfit_400Regular',
  },
});
