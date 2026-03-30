import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type TextStyle,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { BookingConfirmationData } from '../../screens/BookingConfirmationScreen';

const ORANGE = '#F18F34';
const ORANGE_END = '#C46A20';
const SHEET_BG = '#1A1A1A';

type Props = {
  visible: boolean;
  data: BookingConfirmationData;
  onClose: () => void;
};

function androidLabel(base: TextStyle): TextStyle {
  if (Platform.OS !== 'android') return base;
  return {
    ...base,
    includeFontPadding: false,
    textBreakStrategy: 'simple',
  } as TextStyle;
}

function PrivateInfoRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.iconBox}>
        <Ionicons name={icon} size={20} color="#fff" />
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowLabel, androidLabel({})]}>{label}</Text>
        <Text style={[styles.rowValue, androidLabel({})]}>{value}</Text>
      </View>
    </View>
  );
}

/**
 * Bottom sheet modal para confirmación de reserva privada (diseño Figma: header check + filas + email + Entendido).
 */
export function PrivateReservationModal({ visible, data, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const titleLine = `${data.courtName} - ${data.clubName}`;
  const sheetMaxH = Math.round(screenH * 0.9);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlayRoot}>
        <Pressable style={styles.backdropPress} onPress={onClose} accessibilityLabel="Cerrar fondo">
          <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.backdropDim} />
        </Pressable>

        <View style={[styles.sheet, { maxHeight: sheetMaxH }]}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={styles.scrollInner}
            style={styles.scroll}
          >
            <LinearGradient
              colors={['rgba(241, 143, 52, 0.14)', 'rgba(241, 143, 52, 0.06)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.headerGradient, { paddingTop: Math.max(insets.top, 12) + 8 }]}
            >
              <Pressable
                onPress={onClose}
                style={[styles.closeFab, { top: Math.max(insets.top, 12) + 4 }]}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Cerrar"
              >
                <Ionicons name="close" size={22} color="#4b5563" />
              </Pressable>

              <View style={styles.checkCircle}>
                <Ionicons name="checkmark" size={40} color="#fff" />
              </View>

              <Text style={[styles.headerTitle, androidLabel({})]}>¡Reserva Confirmada!</Text>
              <Text style={[styles.headerSub, androidLabel({})]}>Tu plaza ha sido reservada con éxito</Text>
            </LinearGradient>

            <View style={styles.body}>
              <View style={styles.badgeRow}>
                <View style={styles.badge}>
                  <Text style={styles.badgeEmoji}>🎾</Text>
                  <Text style={[styles.badgeText, androidLabel({})]}>Partido</Text>
                </View>
              </View>

              <Text style={[styles.title, androidLabel({})]}>{titleLine}</Text>

              <View style={styles.rows}>
                <PrivateInfoRow icon="calendar-outline" label="Fecha y hora" value={data.dateTimeFormatted} />
                <PrivateInfoRow icon="time-outline" label="Duración" value={data.duration} />
                <PrivateInfoRow icon="location-outline" label="Club" value={data.clubName} />
                <PrivateInfoRow icon="cash-outline" label="Precio" value={data.priceFormatted} />
              </View>

              <View style={styles.emailBox}>
                <Text style={[styles.emailText, androidLabel({})]}>
                  📧 Recibirás un email de confirmación con todos los detalles
                </Text>
              </View>
            </View>
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Pressable onPress={onClose} style={({ pressed }) => [styles.ctaOuter, pressed && styles.pressed]}>
              <View style={styles.ctaSolid}>
                <Text style={[styles.ctaText, androidLabel({})]}>Entendido</Text>
              </View>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdropPress: {
    ...StyleSheet.absoluteFillObject,
  },
  backdropDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    width: '100%',
    backgroundColor: SHEET_BG,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  scrollInner: {
    paddingBottom: 8,
  },
  headerGradient: {
    paddingHorizontal: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    position: 'relative',
  },
  closeFab: {
    position: 'absolute',
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  checkCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: ORANGE,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  headerSub: {
    fontSize: 14,
    fontWeight: '500',
    color: '#9ca3af',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  body: {
    paddingHorizontal: 24,
    paddingTop: 20,
    gap: 16,
  },
  badgeRow: {
    alignItems: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: ORANGE,
    ...Platform.select({
      ios: {
        shadowColor: ORANGE,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  badgeEmoji: {
    fontSize: 18,
  },
  badgeText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 4,
  },
  rows: {
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: ORANGE,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 6,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9ca3af',
    marginBottom: 2,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
  emailBox: {
    marginTop: 8,
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  emailText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#60a5fa',
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(26,26,26,0.98)',
  },
  ctaOuter: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  ctaSolid: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ORANGE,
    ...Platform.select({
      ios: {
        shadowColor: ORANGE,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
  pressed: { opacity: 0.9 },
});
