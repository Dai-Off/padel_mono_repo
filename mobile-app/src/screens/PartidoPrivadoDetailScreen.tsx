import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cancelMatchAsOrganizer, fetchMatchById } from '../api/matches';
import { mapMatchToPartido } from '../api/mapMatchToPartido';
import { fetchMyPlayerId } from '../api/players';
import { ClubInfoSheet } from '../components/partido/ClubInfoSheet';
import { useAuth } from '../contexts/AuthContext';
import { theme } from '../theme';
import type { PartidoItem } from './PartidosScreen';

type PartidoPrivadoDetailScreenProps = {
  partido: PartidoItem;
  onBack: () => void;
};

function StatusDot({ color }: { color: string }) {
  return (
    <View style={[styles.statusDot, { backgroundColor: color }]} />
  );
}

/** Pantalla de detalle para partidos privados. Flujo aparte: sin join, sin chat, solo reserva. */
export function PartidoPrivadoDetailScreen({ partido, onBack }: PartidoPrivadoDetailScreenProps) {
  const { session } = useAuth();
  const [clubInfoVisible, setClubInfoVisible] = useState(false);
  const [partidoLocal, setPartidoLocal] = useState(partido);
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
  const [cancelOverlay, setCancelOverlay] = useState({ open: false, message: '' });

  const venueAddress = partidoLocal.venueAddress ?? partidoLocal.location;
  const venueImage = partidoLocal.venueImage;

  useEffect(() => {
    setPartidoLocal(partido);
  }, [partido.id, partido.dateTime, partido.matchPhase]);

  useEffect(() => {
    if (!session?.access_token) {
      setCurrentPlayerId(null);
      return;
    }
    fetchMyPlayerId(session.access_token)
      .then(setCurrentPlayerId)
      .catch(() => setCurrentPlayerId(null));
  }, [session?.access_token]);

  useEffect(() => {
    const token = session?.access_token;
    if (!token) return;
    fetchMatchById(partido.id, token).then((m) => {
      if (!m) return;
      const mapped = mapMatchToPartido(m);
      if (!mapped) return;
      setPartidoLocal((prev) => ({
        ...mapped,
        organizerPlayerId: mapped.organizerPlayerId ?? prev.organizerPlayerId,
      }));
    });
  }, [partido.id, session?.access_token]);

  const userIsOrganizer =
    currentPlayerId != null &&
    partidoLocal.organizerPlayerId != null &&
    currentPlayerId === partidoLocal.organizerPlayerId;
  const matchPhase = partidoLocal.matchPhase ?? 'upcoming';
  const canCancelPrivate =
    Boolean(session?.access_token) && userIsOrganizer && matchPhase !== 'past';

  const handleCancelReserva = useCallback(() => {
    const token = session?.access_token;
    if (!token) {
      Alert.alert('Iniciar sesión', 'Necesitas iniciar sesión para cancelar la reserva.');
      return;
    }
    Alert.alert(
      '¿Cancelar reserva?',
      'Se anulará la pista y el partido privado. Si pagaste con tarjeta en la app, se procesará el reembolso.',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí, cancelar',
          style: 'destructive',
          onPress: async () => {
            setCancelOverlay({ open: true, message: 'Cancelando reserva…' });
            try {
              const r = await cancelMatchAsOrganizer(partidoLocal.id, token);
              if (r.ok) {
                Alert.alert('Listo', 'La reserva quedó cancelada.');
                onBack();
                return;
              }
              const extra =
                r.refund_errors?.length ? `\n\n${r.refund_errors.slice(0, 3).join('\n')}` : '';
              Alert.alert('No se pudo cancelar', `${r.error}${extra}`);
            } finally {
              setCancelOverlay({ open: false, message: '' });
            }
          },
        },
      ]
    );
  }, [session?.access_token, partidoLocal.id, onBack]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <Ionicons name="arrow-back" size={20} color={theme.auth.text} />
        </Pressable>
        <View style={styles.headerRight}>
          <Pressable style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}>
            <Ionicons name="share-social-outline" size={16} color={theme.auth.text} />
          </Pressable>
          <Pressable style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}>
            <Ionicons name="ellipsis-horizontal" size={16} color={theme.auth.text} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.infoCard}>
          <View style={styles.infoTop}>
            <View style={styles.sportIconWrap}>
              <Text style={styles.sportEmoji}>🎾</Text>
            </View>
            <View style={styles.infoTopBody}>
              <Text style={styles.sportTitle}>PÁDEL</Text>
              <Text style={styles.sportDate}>{partidoLocal.dateTime}</Text>
            </View>
          </View>
          <View style={styles.infoGrid}>
            <View style={styles.infoCell}>
              <Text style={styles.infoCellLabel}>GÉNERO</Text>
              <Text style={styles.infoCellValue}>{partidoLocal.typeLabel}</Text>
            </View>
            <View style={styles.infoCell}>
              <Text style={styles.infoCellLabel}>NIVEL</Text>
              <Text style={styles.infoCellValue}>{partidoLocal.levelRange}</Text>
            </View>
            <View style={styles.infoCell}>
              <Text style={styles.infoCellLabel}>PRECIO</Text>
              <Text style={styles.infoCellValue}>{partidoLocal.price}</Text>
            </View>
          </View>
        </View>

        <View style={styles.statusRow}>
          <View style={styles.statusBadge}>
            <StatusDot color="#6b7280" />
            <Text style={styles.statusText}>Partido Privado</Text>
          </View>
          <View style={styles.statusBadge}>
            <StatusDot color="#22c55e" />
            <Text style={styles.statusText}>Pista reservada</Text>
          </View>
        </View>

        <View style={styles.playersCard}>
          <Text style={styles.playersTitle}>Reserva</Text>
          <View style={styles.privateReservadoRow}>
            <View style={styles.privateReservadoAvatar}>
              {(() => {
                const org = partidoLocal.players.find((p) => !p.isFree);
                if (!org) return <Text style={styles.privateReservadoIcon}>✓</Text>;
                return org.avatar ? (
                  <Image source={{ uri: org.avatar }} style={styles.privateReservadoImg} />
                ) : (
                  <View style={styles.privateReservadoInitialWrap}>
                    <Text style={styles.privateReservadoInitial}>{org.initial ?? org.name[0] ?? '?'}</Text>
                  </View>
                );
              })()}
            </View>
            <View>
              <Text style={styles.privateReservadoName}>
                {partidoLocal.players.find((p) => !p.isFree)?.name ?? 'Tú'}
              </Text>
              <Text style={styles.privateReservadoSub}>Organizador · Pista reservada</Text>
            </View>
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [styles.venueBtn, pressed && styles.pressed]}
          onPress={() => setClubInfoVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Info del club"
        >
          {venueImage ? (
            <Image source={{ uri: venueImage }} style={styles.venueImage} />
          ) : (
            <View style={[styles.venueImage, styles.venueImagePlaceholder]} />
          )}
          <View style={styles.venueBody}>
            <Text style={styles.venueName}>{partidoLocal.venue}</Text>
            <Text style={styles.venueAddress} numberOfLines={1}>{venueAddress}</Text>
          </View>
          <View style={styles.venueMapBtn}>
            <Ionicons name="location" size={16} color="#fff" />
          </View>
        </Pressable>

        {canCancelPrivate ? (
          <Pressable
            style={({ pressed }) => [styles.cancelReservaBtn, pressed && styles.pressed]}
            onPress={handleCancelReserva}
            disabled={cancelOverlay.open}
            accessibilityRole="button"
            accessibilityLabel="Cancelar reserva"
          >
            <Ionicons name="close-circle-outline" size={20} color="#f87171" />
            <Text style={styles.cancelReservaBtnText}>Cancelar reserva</Text>
          </Pressable>
        ) : session?.access_token && !userIsOrganizer ? (
          <Text style={styles.cancelHint}>Solo el organizador puede cancelar esta reserva.</Text>
        ) : null}

        <ClubInfoSheet
          visible={clubInfoVisible}
          onClose={() => setClubInfoVisible(false)}
          partido={partidoLocal}
        />
      </ScrollView>

      <Modal visible={cancelOverlay.open} transparent animationType="fade">
        <View style={styles.cancelModalRoot}>
          <View style={styles.cancelModalCard}>
            <ActivityIndicator size="large" color={theme.auth.accent} />
            <Text style={styles.cancelModalText}>{cancelOverlay.message}</Text>
            <Text style={styles.cancelModalHint}>Puede tardar unos segundos si hay reembolso.</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.auth.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    ...theme.headerPadding,
    backgroundColor: theme.auth.bg,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRight: { flexDirection: 'row', gap: 8 },
  pressed: { opacity: 0.9 },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.scrollBottomPadding,
    gap: theme.spacing.md,
  },
  infoCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: theme.spacing.lg,
  },
  infoTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  sportIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(241, 143, 52, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sportEmoji: { fontSize: 24 },
  infoTopBody: { flex: 1 },
  sportTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: theme.auth.text,
  },
  sportDate: {
    fontSize: 12,
    color: theme.auth.textSecondary,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  infoGrid: { flexDirection: 'row', gap: 12 },
  infoCell: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 12,
  },
  infoCellLabel: {
    fontSize: 10,
    color: theme.auth.label,
    letterSpacing: 1,
    marginBottom: 2,
  },
  infoCellValue: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.auth.text,
  },
  statusRow: { flexDirection: 'row', gap: 8 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '500', color: theme.auth.textSecondary },
  playersCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: theme.spacing.lg,
  },
  playersTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: theme.auth.text,
    marginBottom: theme.spacing.md,
  },
  privateReservadoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
  },
  privateReservadoAvatar: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(241, 143, 52, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  privateReservadoImg: { width: 48, height: 48, borderRadius: 12 },
  privateReservadoInitialWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  privateReservadoInitial: { fontSize: 16, fontWeight: '700', color: theme.auth.text },
  privateReservadoIcon: { fontSize: 20, fontWeight: '700', color: theme.auth.accent },
  privateReservadoName: { fontSize: 14, fontWeight: '700', color: theme.auth.text },
  privateReservadoSub: { fontSize: 12, color: theme.auth.textSecondary, marginTop: 2 },
  venueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    padding: theme.spacing.md,
  },
  venueImage: {
    width: 56,
    height: 56,
    borderRadius: 12,
  },
  venueImagePlaceholder: { backgroundColor: 'rgba(255,255,255,0.08)' },
  venueBody: { flex: 1, marginLeft: 16, minWidth: 0 },
  venueName: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: theme.auth.text,
  },
  venueAddress: {
    fontSize: 12,
    color: theme.auth.textMuted,
    marginTop: 2,
  },
  venueMapBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: theme.auth.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelReservaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: theme.spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.45)',
    backgroundColor: 'rgba(248,113,113,0.08)',
  },
  cancelReservaBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f87171',
  },
  cancelHint: {
    fontSize: 12,
    color: theme.auth.textMuted,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
    paddingHorizontal: 8,
  },
  cancelModalRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  cancelModalCard: {
    backgroundColor: 'rgba(28,28,30,0.98)',
    borderRadius: 16,
    paddingVertical: 24,
    paddingHorizontal: 22,
    alignItems: 'center',
    gap: 12,
    maxWidth: 300,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  cancelModalText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  cancelModalHint: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
});
