import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from '../../../i18n';
import { ScalePressable } from './ScalePressable';

type Props = {
  /** Tap en la card. */
  onPress: () => void;
  variant?: 'onboarding' | 'matchmaking-searching' | 'matchmaking-matched' | 'matchmaking-timeout';
};

const BANNER_STYLES: Record<
  NonNullable<Props['variant']>,
  {
    titleKey: string;
    subtitleKey: string;
    iconName: keyof typeof Ionicons.glyphMap;
    colors: [string, string];
  }
> = {
  onboarding: {
    titleKey: 'home.onboardingBanner.discoverLevel',
    subtitleKey: 'home.onboardingBanner.unlockContent',
    iconName: 'compass',
    colors: ['#F18F34', '#C46A20'],
  },
  'matchmaking-searching': {
    titleKey: 'home.onboardingBanner.matchmakingSearching',
    subtitleKey: 'home.onboardingBanner.matchmakingSearchingSub',
    iconName: 'radio-outline',
    colors: ['#F18F34', '#C46A20'],
  },
  'matchmaking-matched': {
    titleKey: 'home.onboardingBanner.matchmakingMatched',
    subtitleKey: 'home.onboardingBanner.matchmakingMatchedSub',
    iconName: 'checkmark-circle',
    colors: ['#16A34A', '#15803D'],
  },
  'matchmaking-timeout': {
    titleKey: 'home.onboardingBanner.matchmakingTimeout',
    subtitleKey: 'home.onboardingBanner.matchmakingTimeoutSub',
    iconName: 'time-outline',
    colors: ['#F59E0B', '#D97706'],
  },
};

/**
 * Banner proactivo del Home para jugadores sin cuestionario de nivelación
 * completado. Visible arriba de todo, naranja para destacar respecto al resto
 * del Home. Tap → abre el perfil con el modal de onboarding.
 */
export function OnboardingBanner({ onPress, variant = 'onboarding' }: Props) {
  const { t } = useTranslation();
  const copy = BANNER_STYLES[variant];
  return (
    <ScalePressable onPress={onPress} pressedScale={0.985} style={styles.wrap}>
      <LinearGradient
        colors={copy.colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.iconWrap}>
          <View style={styles.iconGlow} />
          <View style={styles.iconCircle}>
            <Ionicons name={copy.iconName} size={18} color="#FFFFFF" />
          </View>
        </View>

        <View style={styles.textWrap}>
          <Text style={styles.title} numberOfLines={1}>
            {t(copy.titleKey)}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {t(copy.subtitleKey)}
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
  title: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
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
