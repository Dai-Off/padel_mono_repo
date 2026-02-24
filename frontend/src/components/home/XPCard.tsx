import { useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

type XPCardProps = {
  level?: number;
  rankLabel?: string;
  xp?: number;
  progressPercent?: number;
};

const DEFAULT_PROPS = {
  level: 47,
  rankLabel: 'Legend Rank',
  xp: 2847,
  progressPercent: 67,
};

export function XPCard({
  level = DEFAULT_PROPS.level,
  rankLabel = DEFAULT_PROPS.rankLabel,
  xp = DEFAULT_PROPS.xp,
  progressPercent = DEFAULT_PROPS.progressPercent,
}: XPCardProps) {
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progressPercent / 100,
      duration: 1000,
      useNativeDriver: false,
    }).start();
  }, [progressPercent]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.left}>
          <View style={styles.iconWrap}>
            <Ionicons name="shield" size={32} color="#22d3ee" />
          </View>
          <View>
            <Text style={styles.level}>Nivel {level}</Text>
            <Text style={styles.rank}>{rankLabel}</Text>
          </View>
        </View>
        <View style={styles.right}>
          <View style={styles.xpRow}>
            <Text style={styles.xpValue}>{xp.toLocaleString()}</Text>
            <Ionicons name="flash" size={16} color="#3b82f6" />
          </View>
          <Text style={styles.xpLabel}>XP Points</Text>
        </View>
      </View>
      <View style={styles.barBg}>
        <Animated.View style={[styles.barFill, { width: progressWidth }]}>
          <LinearGradient
            colors={['#0891b2', '#3b82f6', '#22c55e']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginBottom: 32,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    backgroundColor: 'rgba(6, 182, 212, 0.08)',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconWrap: {
    width: 36,
    height: 36,
  },
  level: {
    fontSize: 12,
    fontWeight: '700',
    color: '#22d3ee',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  rank: {
    fontSize: 11,
    color: '#9ca3af',
  },
  right: {
    alignItems: 'flex-end',
  },
  xpRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  xpValue: {
    fontSize: 24,
    fontWeight: '900',
    color: '#22d3ee',
  },
  xpLabel: {
    fontSize: 11,
    color: '#9ca3af',
  },
  barBg: {
    height: 8,
    backgroundColor: '#27272a',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
    overflow: 'hidden',
  },
});
