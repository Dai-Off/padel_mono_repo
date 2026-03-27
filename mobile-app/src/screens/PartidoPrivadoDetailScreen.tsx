import React, { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ClubInfoSheet } from '../components/partido/ClubInfoSheet';
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
  const [clubInfoVisible, setClubInfoVisible] = useState(false);
  const venueAddress = partido.venueAddress ?? partido.location;
  const venueImage = partido.venueImage;

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
              <Text style={styles.sportDate}>{partido.dateTime}</Text>
            </View>
          </View>
          <View style={styles.infoGrid}>
            <View style={styles.infoCell}>
              <Text style={styles.infoCellLabel}>GÉNERO</Text>
              <Text style={styles.infoCellValue}>{partido.typeLabel}</Text>
            </View>
            <View style={styles.infoCell}>
              <Text style={styles.infoCellLabel}>NIVEL</Text>
              <Text style={styles.infoCellValue}>{partido.levelRange}</Text>
            </View>
            <View style={styles.infoCell}>
              <Text style={styles.infoCellLabel}>PRECIO</Text>
              <Text style={styles.infoCellValue}>{partido.price}</Text>
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
                const org = partido.players.find((p) => !p.isFree);
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
                {partido.players.find((p) => !p.isFree)?.name ?? 'Tú'}
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
            <Text style={styles.venueName}>{partido.venue}</Text>
            <Text style={styles.venueAddress} numberOfLines={1}>{venueAddress}</Text>
          </View>
          <View style={styles.venueMapBtn}>
            <Ionicons name="location" size={16} color="#fff" />
          </View>
        </Pressable>

        <ClubInfoSheet
          visible={clubInfoVisible}
          onClose={() => setClubInfoVisible(false)}
          partido={partido}
        />
      </ScrollView>
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
});
