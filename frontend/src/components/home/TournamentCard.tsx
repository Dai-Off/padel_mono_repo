import { Image } from 'react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export function TournamentCard() {
  return (
    <Pressable style={({ pressed }) => [styles.wrapper, pressed && styles.pressed]}>
      <View style={styles.card}>
        <View style={styles.bg} />
        <Image
          source={{ uri: 'https://images.unsplash.com/photo-1622163642998-1ea32b0bbc67?w=800&q=80' }}
          style={styles.img}
          resizeMode="cover"
        />
        <View style={styles.overlay} />
        <View style={styles.header}>
          <View style={styles.liveBadge}>
            <View style={styles.dot} />
            <Text style={styles.liveText}>EN VIVO</Text>
          </View>
          <Ionicons name="flame" size={32} color="#22c55e" />
        </View>
        <View style={styles.footer}>
          <Text style={styles.title}>
            RANKING{'\n'}DE PADEL
          </Text>
          <View style={styles.tags}>
            <View style={styles.tag}>
              <Ionicons name="people" size={16} color="#22c55e" />
              <Text style={styles.tagText}>15 equipos</Text>
            </View>
            <View style={styles.tag}>
              <Ionicons name="trophy" size={16} color="#22c55e" />
              <Text style={styles.tagText}>+500 XP</Text>
            </View>
          </View>
          <View style={styles.btn}>
            <Ionicons name="swap-horizontal" size={20} color="#fff" />
            <Text style={styles.btnText}>Unirse a batalla</Text>
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
  pressed: { opacity: 0.95 },
  card: {
    minHeight: 280,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: 'rgba(34, 197, 94, 0.5)',
    overflow: 'hidden',
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 8,
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#18181b',
  },
  img: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.2,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    // gradient simulada con overlay
  },
  header: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#16a34a',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#4ade80',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  liveText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#fff',
    lineHeight: 32,
    marginBottom: 12,
  },
  tags: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  tagText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#16a34a',
    paddingVertical: 12,
    borderRadius: 999,
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
  },
  btnText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#fff',
    textTransform: 'uppercase',
  },
});
