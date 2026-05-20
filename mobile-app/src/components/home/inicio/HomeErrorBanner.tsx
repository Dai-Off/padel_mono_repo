import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  /** CTA principal: reintentar fetch de todos los datasets. */
  onRetry: () => void;
  /** Indica si el retry está en vuelo (para deshabilitar y mostrar feedback). */
  retrying?: boolean;
};

/**
 * Banner discreto que se muestra en el Home cuando la PRIMERA carga falla
 * y no hay datos en cache. Política silenciosa: las revalidaciones
 * posteriores con datos previos NO muestran error (stale-while-error).
 *
 * Diseñado para no ser intrusivo: tarjeta gris con borde sutil, texto
 * compacto e icono pequeño. Solo destaca por el color del CTA.
 */
export function HomeErrorBanner({ onRetry, retrying = false }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconWrap}>
        <Ionicons name="cloud-offline-outline" size={18} color="#9CA3AF" />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.title}>No se pudo cargar el inicio</Text>
        <Text style={styles.subtitle}>Comprueba tu conexión e inténtalo de nuevo.</Text>
      </View>
      <Pressable
        onPress={onRetry}
        disabled={retrying}
        hitSlop={8}
        style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed, retrying && styles.ctaDisabled]}
      >
        <Text style={styles.ctaText}>{retrying ? 'Reintentando…' : 'Reintentar'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: { flex: 1, gap: 2 },
  title: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  subtitle: { color: '#9CA3AF', fontSize: 11 },
  cta: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(241,143,52,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(241,143,52,0.45)',
  },
  ctaPressed: { opacity: 0.7 },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { color: '#F18F34', fontSize: 11, fontWeight: '800', letterSpacing: 0.2 },
});
