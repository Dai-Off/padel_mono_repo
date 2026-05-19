import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  /** Mensaje del banner. Ej: "Descubre tu nivel para desbloquear cursos". */
  message: string;
  /** Icono identificador de la sección (a la izquierda). */
  icon: keyof typeof Ionicons.glyphMap;
  /** Tap en el botón "Completar" → abre el perfil con el cuestionario. */
  onPress: () => void;
  /** Texto del CTA. Default: "Completar". */
  ctaLabel?: string;
};

/**
 * Banner inline (no sticky) que aparece al inicio de pantallas con contenido
 * gated por el cuestionario de nivelación (Cursos, Torneos, ...).
 *
 * Centralizado para garantizar consistencia visual entre todas las apariciones
 * — solo varían el icono y el copy. Patrón: borde naranja tenue, texto naranja
 * y CTA pill a la derecha que abre el perfil con el cuestionario.
 */
export function OnboardingInlineBanner({
  message,
  icon,
  onPress,
  ctaLabel = 'Completar',
}: Props) {
  return (
    <View style={styles.banner}>
      <Ionicons name={icon} size={20} color="#F18F34" />
      <Text style={styles.text}>{message}</Text>
      <Pressable onPress={onPress} hitSlop={6} style={styles.cta}>
        <Text style={styles.ctaText}>{ctaLabel}</Text>
        <Ionicons name="arrow-forward" size={12} color="#F18F34" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    marginBottom: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(241,143,52,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(241,143,52,0.2)',
  },
  text: {
    flex: 1,
    color: '#FB923C',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(241,143,52,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(241,143,52,0.5)',
  },
  ctaText: {
    color: '#F18F34',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
