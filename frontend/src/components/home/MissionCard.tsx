import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export function MissionCard() {
  return (
    <Pressable style={({ pressed }) => [styles.wrapper, pressed && styles.pressed]}>
      <View style={styles.card}>
        <View style={styles.bg} />
        <Image
          source={{ uri: 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&q=80' }}
          style={styles.img}
          resizeMode="cover"
        />
        <View style={styles.overlay} />
        <View style={styles.badge}>
          <Ionicons name="school" size={20} color="#fff" />
          <Text style={styles.badgeText}>Misión activa</Text>
        </View>
        <View style={styles.footer}>
          <View style={styles.row}>
            <View>
              <Text style={styles.title}>Curso M3 Miércoles</Text>
              <View style={styles.dateRow}>
                <Ionicons name="calendar" size={16} color="#4ade80" />
                <Text style={styles.date}>Hoy 20:00</Text>
              </View>
            </View>
            <View style={styles.priceWrap}>
              <Text style={styles.price}>58€</Text>
              <View style={styles.xpBadge}>
                <Text style={styles.xpText}>+150 XP</Text>
              </View>
            </View>
          </View>
          <View style={styles.btn}>
            <Ionicons name="locate" size={20} color="#fff" />
            <Text style={styles.btnText}>Iniciar misión</Text>
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
    height: 208,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: 'rgba(34, 197, 94, 0.4)',
    overflow: 'hidden',
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
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
  },
  badge: {
    position: 'absolute',
    top: 16,
    left: 16,
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
  badgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#fff',
    textTransform: 'uppercase',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fff',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  date: {
    fontSize: 14,
    fontWeight: '700',
    color: '#d1d5db',
  },
  priceWrap: { alignItems: 'flex-end' },
  price: {
    fontSize: 28,
    fontWeight: '900',
    color: '#4ade80',
    marginBottom: 4,
  },
  xpBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.5)',
  },
  xpText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#86efac',
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
