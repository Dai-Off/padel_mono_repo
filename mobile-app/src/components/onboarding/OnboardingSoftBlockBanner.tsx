import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  /** Si false el banner no se renderiza. */
  visible: boolean;
  /** Tap en "Completar ahora" → abre el perfil con el modal del cuestionario. */
  onPress: () => void;
  /**
   * Mensaje principal. Default: "Completa tu nivel para participar".
   * Permite personalizar por sección (cursos, torneos, etc.).
   */
  message?: string;
  /** Texto del CTA. Default: "Completar ahora". */
  ctaLabel?: string;
  /**
   * Espacio extra a sumar al `safeArea.bottom`. Útil cuando el banner se monta
   * sobre la tab bar — la tab bar normalmente ocupa unos 56-64 px sobre el
   * safe area inset.
   */
  bottomOffset?: number;
};

/**
 * Banner sticky para soft blocks. Se ancla encima de la tab bar (`position:
 * absolute` con `bottom = insets.bottom + bottomOffset`) y muestra un mensaje
 * con CTA para completar el cuestionario de nivelación.
 *
 * Se renderiza dentro del contenido de cada pantalla (no en MainApp) para
 * tener control sobre cuándo aparece. El padre lo conecta a
 * `openOnboardingFromSection(returnTo)` para que al completar el usuario
 * vuelva a la sección de origen.
 */
export function OnboardingSoftBlockBanner({
  visible,
  onPress,
  message = 'Completa tu nivel para participar',
  ctaLabel = 'Completar ahora',
  bottomOffset = 72,
}: Props) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.host, { bottom: insets.bottom + bottomOffset }]}
    >
      <View style={styles.banner}>
        <View style={styles.iconWrap}>
          <Ionicons name="lock-closed" size={16} color="#F18F34" />
        </View>
        <Text style={styles.message} numberOfLines={2}>
          {message}
        </Text>
        <Pressable onPress={onPress} hitSlop={6} style={styles.ctaWrap}>
          <LinearGradient
            colors={['#F18F34', '#C46A20']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.ctaGradient}
          >
            <Text style={styles.ctaText}>{ctaLabel}</Text>
            <Ionicons name="arrow-forward" size={13} color="#FFFFFF" />
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 50,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(15,15,15,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(241,143,52,0.45)',
    // Sombra para despegar del contenido y dejar claro que está por encima.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(241,143,52,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(241,143,52,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  ctaWrap: {
    borderRadius: 999,
    overflow: 'hidden',
  },
  ctaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
