import {
  Dimensions,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../theme';
import type { PartidoItem } from '../../screens/PartidosScreen';

const DEFAULT_VENUE_IMAGE = 'https://images.unsplash.com/photo-1622163642998-1ea32b0bbc67?w=400';

type ClubInfoSheetProps = {
  visible: boolean;
  onClose: () => void;
  partido: PartidoItem;
};

function openInMaps(venue: string, venueAddress?: string, location?: string) {
  const address = venueAddress
    ? `${venue}, ${venueAddress}`
    : `${venue}, ${location ?? ''}`;
  const encoded = encodeURIComponent(address.trim());
  const url =
    Platform.OS === 'ios'
      ? `maps:0,0?q=${encoded}`
      : `https://www.google.com/maps/search/?api=1&query=${encoded}`;
  Linking.openURL(url).catch(() => {
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encoded}`).catch(() => {});
  });
}

export function ClubInfoSheet({ visible, onClose, partido }: ClubInfoSheetProps) {
  const insets = useSafeAreaInsets();
  const venueAddress = partido.venueAddress ?? partido.location;

  const handleOpenMaps = () => {
    openInMaps(partido.venue, partido.venueAddress, partido.location);
  };

  const sheetHeight = Dimensions.get('window').height * 0.5;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Cerrar" />
        <View style={[styles.sheet, { height: sheetHeight, paddingBottom: Math.max(insets.bottom, 24) }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
          >
            <Ionicons name="arrow-back" size={20} color="#1A1A1A" />
          </Pressable>
          <Text style={styles.headerTitle}>Info del Club</Text>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.clubCard}>
            <Image
              source={{ uri: partido.venueImage ?? DEFAULT_VENUE_IMAGE }}
              style={styles.clubImage}
              resizeMode="cover"
            />
            <View style={styles.clubInfo}>
              <Text style={styles.clubName} numberOfLines={1}>{partido.venue}</Text>
              <Text style={styles.clubAddress} numberOfLines={2}>{venueAddress || '—'}</Text>
            </View>
            <Pressable
              onPress={handleOpenMaps}
              style={({ pressed }) => [styles.mapBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Abrir en mapa"
            >
              <Ionicons name="location" size={20} color="#fff" />
            </Pressable>
          </View>

          <Text style={styles.sectionTitle}>Información</Text>
          <View style={styles.infoList}>
            <View style={styles.infoRow}>
              <View style={styles.infoIcon}>
                <Ionicons name="information-circle-outline" size={20} color="#6b7280" />
              </View>
              <View style={styles.infoBody}>
                <Text style={styles.infoLabel}>Nombre de pista</Text>
                <Text style={styles.infoValue}>{partido.courtName || '—'}</Text>
              </View>
            </View>
            <View style={styles.infoRow}>
              <View style={styles.infoIcon}>
                <Text style={styles.infoEmoji}>🎾</Text>
              </View>
              <View style={styles.infoBody}>
                <Text style={styles.infoLabel}>Tipo de pista</Text>
                <Text style={styles.infoValue}>{partido.courtType || '—'}</Text>
              </View>
            </View>
            <View style={styles.infoRow}>
              <View style={styles.infoIcon}>
                <Ionicons name="calendar-outline" size={20} color="#6b7280" />
              </View>
              <View style={styles.infoBody}>
                <Text style={styles.infoLabel}>Fecha y hora</Text>
                <Text style={styles.infoValue}>{partido.dateTime}</Text>
              </View>
            </View>
          </View>

        </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e5e7eb',
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#f9fafb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  pressed: { opacity: 0.9 },
  scroll: { flex: 1 },
  content: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
  },
  clubCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    marginBottom: 24,
  },
  clubImage: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: '#e5e7eb',
  },
  clubInfo: {
    flex: 1,
    minWidth: 0,
  },
  clubName: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  clubAddress: {
    fontSize: theme.fontSize.xs,
    color: '#6b7280',
  },
  mapBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#E31E24',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 16,
  },
  infoList: {
    gap: 16,
    marginBottom: 24,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#f9fafb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoEmoji: {
    fontSize: 16,
  },
  infoBody: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 10,
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: theme.fontSize.sm,
    fontWeight: '500',
    color: '#1A1A1A',
  },
});
