import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ScalePressable } from './ScalePressable';

type Props = {
  /** Tap en la card → abre el cuestionario de nivelación en perfil. */
  onPress: () => void;
};

/**
 * Banner proactivo del Home para jugadores sin cuestionario de nivelación
 * completado. Visible arriba de todo, naranja para destacar respecto al resto
 * del Home. Tap → abre el perfil con el modal de onboarding.
 */
export function OnboardingBanner({ onPress }: Props) {
  return (
    <ScalePressable onPress={onPress} pressedScale={0.985} style={styles.wrap}>
      <LinearGradient
        colors={['#F18F34', '#C46A20']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.iconWrap}>
          <View style={styles.iconGlow} />
          <View style={styles.iconCircle}>
            <Ionicons name="compass" size={18} color="#FFFFFF" />
          </View>
        </View>

        <View style={styles.textWrap}>
          <Text style={styles.title} numberOfLines={1}>
            Descubre tu nivel
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            Desbloquea todo el contenido
          </Text>
        </View>

        <View style={styles.cta}>
          <Ionicons name="arrow-forward" size={12} color="#FFFFFF" />
        </View>
      </LinearGradient>
    </ScalePressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  gradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  iconWrap: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGlow: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    opacity: 0.12,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  textWrap: {
    flex: 1,
    gap: 1,
  },
  // Mismas medidas que `title` de DailyLessonCard (14/900) para que el banner
  // no domine el home — es un CTA secundario, no el contenido principal.
  title: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  // Mismas medidas que `subtitle` de DailyLessonCard (10/600 más opaco).
  subtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '600',
  },
  cta: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
