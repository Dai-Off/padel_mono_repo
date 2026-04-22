import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { androidReadableText } from './textStyles';

type IAAfinidadCardProps = {
  onPress?: () => void;
};

export function IAAfinidadCard({ onPress }: IAAfinidadCardProps) {
  return (
    <Pressable style={({ pressed }) => [styles.wrap, pressed && styles.pressed]} onPress={onPress}>
      <View style={styles.blob} />
      <LinearGradient
        colors={['rgba(147,51,234,0.15)', 'rgba(236,72,153,0.12)', 'rgba(225,29,72,0.1)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.inner}>
        <LinearGradient
          colors={['#a855f7', '#ec4899']}
          style={styles.iconBox}
        >
          <Ionicons name="sparkles" size={26} color="#fff" />
        </LinearGradient>
        <View style={styles.textCol}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>IA Afinidad</Text>
            <Ionicons name="arrow-up" size={22} color="#c084fc" style={styles.arrow} />
          </View>
          <Text style={styles.desc}>
            Descubre jugadores afines a tu estilo, nivel y disponibilidad
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.35)',
    width: '100%',
  },
  pressed: { opacity: 0.94 },
  blob: {
    position: 'absolute',
    top: -48,
    right: -48,
    width: 256,
    height: 256,
    borderRadius: 128,
    backgroundColor: 'rgba(168,85,247,0.2)',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 24,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: { flex: 1, minWidth: 0 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  title: androidReadableText({
    fontSize: 20,
    fontWeight: '900',
    color: '#fff',
  }),
  arrow: { transform: [{ rotate: '45deg' }] },
  desc: androidReadableText({
    fontSize: 14,
    color: '#9ca3af',
    lineHeight: 20,
  }),
});
