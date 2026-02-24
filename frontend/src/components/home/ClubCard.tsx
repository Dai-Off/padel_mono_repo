import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export function ClubCard() {
  return (
    <Pressable style={({ pressed }) => [styles.wrapper, pressed && styles.pressed]}>
      <View style={styles.card}>
        <Image
          source={{ uri: 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&q=80' }}
          style={styles.img}
          resizeMode="cover"
        />
        <View style={styles.overlay} />
        <View style={styles.header}>
          <View style={styles.badge}>
            <Ionicons name="ribbon" size={20} color="#fff" />
            <Text style={styles.badgeText}>Legendary</Text>
          </View>
          <View style={styles.rating}>
            <Ionicons name="star" size={16} color="#60a5fa" />
            <Text style={styles.ratingText}>4.8</Text>
          </View>
        </View>
        <View style={styles.footer}>
          <Text style={styles.title}>
            Pádel Y Tenis{'\n'}San Martín
          </Text>
          <View style={styles.tags}>
            <View style={styles.tag}>
              <Ionicons name="location" size={16} color="#60a5fa" />
              <Text style={styles.tagText}>7km</Text>
            </View>
            <View style={styles.tag}>
              <Ionicons name="locate" size={16} color="#22d3ee" />
              <Text style={styles.tagText}>18 Pistas</Text>
            </View>
          </View>
          <View style={styles.btn}>
            <Ionicons name="medal" size={20} color="#fff" />
            <Text style={styles.btnText}>Explorar club</Text>
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
    height: 256,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: 'rgba(59, 130, 246, 0.6)',
    overflow: 'hidden',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 25,
    elevation: 10,
  },
  img: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
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
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#67e8f9',
    overflow: 'hidden',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  rating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.5)',
  },
  ratingText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#fff',
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
    gap: 16,
    marginBottom: 16,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  tagText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: '#2563eb',
  },
  btnText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#fff',
    textTransform: 'uppercase',
  },
});
