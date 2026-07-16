import React, { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '../../i18n';
import { useAckCelebrations, useSeasonPassMe } from '../../queries/seasonPass';
import { MissionCelebrationCard } from './MissionCelebrationCard';

/**
 * Cola diferida de celebraciones (plan §6.7): misiones que se completaron
 * "fuera" (el rival confirmó el marcador, cayó una semanal…). Se alimenta de
 * `pending_celebrations` del /season-pass/me (query compartida) y se ackea al
 * cerrar. Mismo patrón que UnlockModalHost: montado global en MainApp — eso
 * mantiene la query siempre activa, así que el refetch por foco cubre el
 * antiguo refresh de background de HomeDataContext.
 */
export function SeasonPassCelebrationHost() {
  const { t } = useTranslation();
  const { data: seasonPassMe } = useSeasonPassMe();
  const ackMutation = useAckCelebrations();

  const pending = useMemo(
    () => seasonPassMe?.pending_celebrations ?? [],
    [seasonPassMe?.pending_celebrations],
  );

  if (pending.length === 0) return null;

  const totalSp = pending.reduce((sum, c) => sum + (c.sp_granted ?? 0), 0);

  const dismiss = () => {
    ackMutation.mutate(pending.map((c) => c.assignment_id));
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.headerIcon}>
            <Ionicons name="trophy" size={26} color="#F18F34" />
          </View>
          <Text style={styles.title}>
            {pending.length === 1
              ? t('home.seasonPass.missionCompleted')
              : t('home.seasonPass.missionsCompletedMany', { count: pending.length })}
          </Text>
          <Text style={styles.subtitle}>{t('home.seasonPass.spGained', { sp: totalSp })}</Text>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {pending.map((c, i) => (
              <MissionCelebrationCard
                key={c.assignment_id}
                icon={c.icon}
                title={c.title}
                spGranted={c.sp_granted}
                delay={i * 120}
              />
            ))}
          </ScrollView>

          <Pressable style={styles.cta} onPress={dismiss}>
            <Text style={styles.ctaText}>{t('home.seasonPass.celebrationCta')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '75%',
    backgroundColor: '#111827',
    borderColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderRadius: 24,
    padding: 20,
    alignItems: 'center',
  },
  headerIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(241,143,52,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  title: { color: '#F9FAFB', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: '#10B981', fontSize: 15, fontWeight: '700', marginTop: 4, marginBottom: 14 },
  list: { alignSelf: 'stretch', flexGrow: 0 },
  listContent: { gap: 10 },
  cta: {
    marginTop: 16,
    alignSelf: 'stretch',
    backgroundColor: '#F18F34',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  ctaText: { color: '#0B1120', fontSize: 15, fontWeight: '800' },
});
