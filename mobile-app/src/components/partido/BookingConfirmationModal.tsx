import React from 'react';
import { Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme';

export type BookingConfirmationData = {
  courtName: string;
  clubName: string;
  dateTimeFormatted: string;
  duration: string;
  priceFormatted: string;
};

type BookingConfirmationModalProps = {
  visible: boolean;
  data: BookingConfirmationData | null;
  onClose: () => void;
};

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={20} color="#fff" />
      </View>
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

export function BookingConfirmationModal({ visible, data, onClose }: BookingConfirmationModalProps) {
  const insets = useSafeAreaInsets();
  if (!data) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Cerrar" />
        <View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, theme.spacing.lg),
              maxHeight: Dimensions.get('window').height * 0.88,
            },
          ]}
        >
          <View style={styles.handle} />
          <Pressable style={styles.closeIconBtn} onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={24} color="#1A1A1A" />
          </Pressable>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
          >
            <View style={styles.successIconWrap}>
              <View style={styles.successIcon}>
                <Ionicons name="checkmark" size={40} color="#fff" />
              </View>
            </View>

            <Text style={styles.mainTitle}>¡Reserva Confirmada!</Text>
            <Text style={styles.subtitle}>Tu plaza ha sido reservada con éxito</Text>

            <View style={styles.badgeWrap}>
              <View style={styles.badge}>
                <Text style={styles.badgeEmoji}>🎾</Text>
                <Text style={styles.badgeText}>Partido</Text>
              </View>
            </View>

            <Text style={styles.matchTitle}>
              {data.courtName} - {data.clubName}
            </Text>

            <View style={styles.infoWrap}>
              <InfoRow icon="calendar-outline" label="Fecha y hora" value={data.dateTimeFormatted} />
              <InfoRow icon="time-outline" label="Duración" value={data.duration} />
              <InfoRow icon="location-outline" label="Club" value={data.clubName} />
              <InfoRow icon="cash-outline" label="Precio" value={data.priceFormatted} />
            </View>

            <View style={styles.emailNote}>
              <Text style={styles.emailNoteText}>
                📧 Recibirás un email de confirmación con todos los detalles
              </Text>
            </View>

            <Pressable
              style={({ pressed }) => [styles.ctaBtn, pressed && styles.pressed]}
              onPress={onClose}
            >
              <Text style={styles.ctaBtnText}>Entendido</Text>
            </Pressable>
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
    width: '100%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    paddingHorizontal: theme.spacing.lg,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e5e7eb',
    alignSelf: 'center',
    marginTop: 2,
    marginBottom: 0,
  },
  closeIconBtn: {
    alignSelf: 'flex-end',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f9fafb',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: -16,
  },
  content: {
    paddingBottom: theme.spacing.xl,
  },
  successIconWrap: {
    alignItems: 'center',
    marginTop: -4,
    marginBottom: theme.spacing.md,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E31E24',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainTitle: {
    fontSize: theme.fontSize.xl,
    fontWeight: '800',
    color: '#1A1A1A',
    textAlign: 'center',
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  badgeWrap: {
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#E31E24',
  },
  badgeEmoji: {
    fontSize: 18,
  },
  badgeText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: '#fff',
  },
  matchTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: '#1A1A1A',
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  infoWrap: {
    gap: theme.spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#E31E24',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  emailNote: {
    marginTop: theme.spacing.lg,
    padding: theme.spacing.md,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  emailNoteText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#2563eb',
    textAlign: 'center',
  },
  ctaBtn: {
    marginTop: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: 16,
    backgroundColor: '#E31E24',
    alignItems: 'center',
  },
  ctaBtnText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: '#fff',
  },
  pressed: { opacity: 0.8 },
});
