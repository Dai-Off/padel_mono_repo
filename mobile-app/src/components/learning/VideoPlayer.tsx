import { useEffect, useRef, useState } from 'react';

import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  videoUrl: string;
  area: string;
  counter: string;
  clubName?: string | null;
  clubCity?: string | null;
  isReview?: boolean;
  onVideoEnd: () => void;
  onSkip: () => void;
  onClose: () => void;
};

const AREA_BADGE: Record<string, { label: string; color: string; bg: string; border: string }> = {
  technique: { label: 'TECNICA', color: '#F18F34', bg: 'rgba(241,143,52,0.15)', border: 'rgba(241,143,52,0.25)' },
  tactics: { label: 'TACTICA', color: '#A855F7', bg: 'rgba(168,85,247,0.15)', border: 'rgba(168,85,247,0.25)' },
  physical: { label: 'FISICO', color: '#22C55E', bg: 'rgba(34,197,94,0.15)', border: 'rgba(34,197,94,0.25)' },
  mental_vocabulary: { label: 'VOCABULARIO', color: '#F59E0B', bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.25)' },
};

export function VideoPlayer({ videoUrl, area, counter, clubName, clubCity, isReview, onVideoEnd, onSkip, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [ended, setEnded] = useState(false);
  const fadeIn = useRef(new Animated.Value(0)).current;

  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = false;
    p.play();
  });

  useEffect(() => {
    Animated.timing(fadeIn, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [fadeIn]);

  const dismissed = useRef(false);

  useEffect(() => {
    dismissed.current = false;
    const sub = player.addListener('playToEnd', () => {
      if (dismissed.current) return;
      dismissed.current = true;
      setEnded(true);
      onVideoEnd();
    });
    return () => sub.remove();
  }, [player, onVideoEnd]);

  const badge = AREA_BADGE[area];

  return (
    <Animated.View style={[styles.root, { opacity: fadeIn }]}>
      <VideoView
        player={player}
        style={styles.video}
        nativeControls={false}
        contentFit="cover"
      />

      <LinearGradient
        colors={['rgba(0,0,0,0.5)', 'transparent', 'rgba(0,0,0,0.7)']}
        locations={[0, 0.4, 1]}
        style={styles.overlay}
        pointerEvents="box-none"
      >
        {/* Top bar */}
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
            <Ionicons name="close" size={16} color="rgba(255,255,255,0.8)" />
          </Pressable>

          <View style={styles.topRight}>
            {isReview && (
              <View style={styles.reviewBadge}>
                <Ionicons name="reload" size={12} color="#F18F34" />
                <Text style={styles.reviewText}>Repaso</Text>
              </View>
            )}
            <Text style={styles.counter}>{counter}</Text>
          </View>
        </View>

        {/* Bottom info */}
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
          {/* Club info */}
          {clubName && (
            <View style={styles.clubRow}>
              <View style={styles.clubAvatar}>
                <LinearGradient
                  colors={['#F18F34', '#FFB347']}
                  style={styles.clubAvatarGradient}
                >
                  <Ionicons name="shield" size={18} color="#fff" />
                </LinearGradient>
              </View>
              <View style={styles.clubInfo}>
                <Text style={styles.clubName} numberOfLines={1}>{clubName}</Text>
                {clubCity && <Text style={styles.clubCity} numberOfLines={1}>{clubCity}</Text>}
              </View>
            </View>
          )}

          {/* Area badge */}
          {badge && (
            <View style={[styles.areaBadge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
              <Text style={[styles.areaBadgeText, { color: badge.color }]}>{badge.label}</Text>
            </View>
          )}

          {/* Skip / Continuar */}
          <Pressable
            onPress={() => {
              if (dismissed.current) return;
              dismissed.current = true;
              if (ended) onVideoEnd();
              else onSkip();
            }}
            hitSlop={8}
            style={({ pressed }) => [styles.skipBtn, pressed && styles.skipPressed]}
          >
            <Text style={styles.skipText}>{ended ? 'Continuar' : 'Saltar video'}</Text>
            <Ionicons name="arrow-forward" size={14} color="rgba(255,255,255,0.6)" />
          </Pressable>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 20,
  },
  video: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  counter: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  reviewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(249,115,22,0.3)',
  },
  reviewText: {
    color: '#FB923C',
    fontSize: 11,
    fontWeight: '700',
  },
  bottomBar: {
    paddingHorizontal: 20,
    gap: 12,
  },
  clubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  clubAvatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    overflow: 'hidden',
  },
  clubAvatarGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clubInfo: {
    flex: 1,
  },
  clubName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  clubCity: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 1,
  },
  areaBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  areaBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  skipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  skipPressed: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  skipText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '600',
  },
});
