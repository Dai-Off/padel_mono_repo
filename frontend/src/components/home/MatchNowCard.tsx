import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

export function MatchNowCard() {
  return (
    <Pressable style={({ pressed }) => [styles.wrapper, pressed && styles.pressed]}>
      <View style={styles.card}>
        <LinearGradient
          colors={['#0891b2', '#2563eb', '#15803d']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.grid} />
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>AI Powered</Text>
            </View>
            <Ionicons name="sparkles" size={24} color="#22d3ee" />
          </View>
          <View style={styles.footer}>
            <Text style={styles.title}>
              ENCUENTRA{'\n'}
              <Text style={styles.highlight}>TU RIVAL</Text>
            </Text>
            <View style={styles.actions}>
              <View style={styles.cta}>
                <Ionicons name="flash" size={20} color="#fff" />
                <Text style={styles.ctaText}>Match Now</Text>
              </View>
              <View style={styles.xpBadge}>
                <Ionicons name="locate" size={20} color="#67e8f9" />
                <Text style={styles.xpText}>+250 XP</Text>
              </View>
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 20,
    marginBottom: 32,
  },
  pressed: { opacity: 0.9 },
  card: {
    height: 280,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: 'rgba(6, 182, 212, 0.5)',
    overflow: 'hidden',
    shadowColor: '#06b6d4',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 8,
  },
  grid: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.15,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#06b6d4',
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  badge: {
    backgroundColor: 'rgba(6, 182, 212, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.5)',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#67e8f9',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  footer: {},
  title: {
    fontSize: 40,
    fontWeight: '900',
    color: '#fff',
    lineHeight: 44,
    marginBottom: 12,
    textShadowColor: 'rgba(6, 182, 212, 0.8)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  highlight: {
    color: '#22d3ee',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(6, 182, 212, 0.8)',
    shadowColor: '#06b6d4',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
  },
  ctaText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#fff',
    textTransform: 'uppercase',
  },
  xpBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  xpText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#67e8f9',
  },
});
