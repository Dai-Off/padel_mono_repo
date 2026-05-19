import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  visible: boolean;
  /** Icono feature (pequeño, naranja debajo del candado). Identifica la sección. */
  featureIcon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  bullets: string[];
  /** Cerrar el modal sin avanzar (secundario "Ahora no" o cerrar arriba). */
  onClose: () => void;
  /** Continuar al cuestionario (CTA primario "Descubrir mi nivel"). */
  onStart: () => void;
};

/**
 * Modal único reutilizable para todos los hard blocks (Lección Diaria, IA
 * Afinidad, Liga Competitiva). Mismo lenguaje visual — candado gris arriba +
 * icono feature naranja debajo + título + subtítulo + bullets + CTA — solo
 * cambia el copy y el icono feature por sección.
 *
 * Se renderiza como Modal fullscreen sobre el contenido actual: no remonta el
 * Home, así "Ahora no" cierra el modal y el Home queda visible al instante
 * (sin reload). Reemplaza al patrón anterior de pantalla independiente.
 */
export function OnboardingHardBlockModal({
  visible,
  featureIcon,
  title,
  subtitle,
  bullets,
  onClose,
  onStart,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
          <Ionicons name="close" size={20} color="rgba(255,255,255,0.85)" />
        </Pressable>

        <View style={[styles.container, { paddingBottom: insets.bottom + 24 }]}>
          {/* Doble círculo gris/apagado con candado: señala "bloqueado"
              sin gritar. */}
          <View style={styles.lockOuterCircle}>
            <View style={styles.lockInnerCircle}>
              <Ionicons name="lock-closed" size={42} color="#9CA3AF" />
            </View>
          </View>

          {/* Badge feature: el único toque de color de marca. Identifica la
              sección (flame, people, trophy...). */}
          <View style={styles.featureIconBadge}>
            <Ionicons name={featureIcon} size={14} color="#F18F34" />
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          <View style={styles.bullets}>
            {bullets.map((b) => (
              <View key={b} style={styles.bullet}>
                <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                <Text style={styles.bulletText}>{b}</Text>
              </View>
            ))}
          </View>

          <Pressable onPress={onStart} style={styles.cta}>
            <LinearGradient
              colors={['#F18F34', '#C46A20']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.ctaGradient}
            >
              <Ionicons name="compass" size={18} color="#fff" />
              <Text style={styles.ctaText}>Descubrir mi nivel</Text>
            </LinearGradient>
          </Pressable>

          <Pressable onPress={onClose} hitSlop={8} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>Ahora no</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0F0F0F' },
  closeBtn: {
    position: 'absolute',
    top: 56,
    left: 20,
    zIndex: 5,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  lockOuterCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(156,163,175,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(156,163,175,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  lockInnerCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(31,41,55,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(156,163,175,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(241,143,52,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(241,143,52,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    color: '#D1D5DB',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 24,
  },
  bullets: {
    alignSelf: 'stretch',
    gap: 10,
    marginBottom: 28,
  },
  bullet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bulletText: {
    color: '#E5E7EB',
    fontSize: 13,
    flex: 1,
  },
  cta: {
    width: '100%',
    maxWidth: 320,
    marginBottom: 12,
  },
  ctaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    gap: 8,
  },
  ctaText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  cancelBtn: { paddingVertical: 8 },
  cancelText: { color: '#6B7280', fontSize: 14, fontWeight: '500' },
});
