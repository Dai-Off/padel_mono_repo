import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '../../i18n';

type Props = {
  icon: string;
  title: string;
  spGranted: number;
  /** Retraso de la animación de entrada (stagger cuando hay varias en stack). */
  delay?: number;
  /** Modo "ya completada hoy": estado apagado sin animar el SP como nuevo (al
   *  repasar/reabrir una lección ya hecha). No representa un grant nuevo. */
  alreadyDone?: boolean;
};

/**
 * Tarjeta "✅ Misión completada — {título}: +{SP} SP" (plan §6.7).
 * Mismo componente para el canal instantáneo (pantalla de resultados de
 * lección, confirmaciones de acción) y para la cola diferida del Home.
 */
export function MissionCelebrationCard({ icon, title, spGranted, delay = 0, alreadyDone = false }: Props) {
  const { t } = useTranslation();
  const scale = useRef(new Animated.Value(0.85)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, delay, friction: 6, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, delay, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [scale, opacity, delay]);

  return (
    <Animated.View style={[styles.card, { opacity, transform: [{ scale }] }]}>
      <View style={styles.checkWrap}>
        <Ionicons name="checkmark" size={16} color="#10B981" />
      </View>
      <View style={styles.info}>
        <Text style={styles.kicker}>{t('home.seasonPass.missionCompleted')}</Text>
        <Text style={styles.title} numberOfLines={2}>
          {icon} {title}
        </Text>
      </View>
      <View style={styles.spBadge}>
        {alreadyDone ? (
          <Text style={styles.doneText}>{t('home.seasonPass.missionAlreadyDone')}</Text>
        ) : (
          <Text style={styles.spText}>{t('home.seasonPass.spGained', { sp: spGranted })}</Text>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderColor: 'rgba(16,185,129,0.35)',
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  checkWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(16,185,129,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1 },
  kicker: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  title: { color: '#F9FAFB', fontSize: 14, fontWeight: '600' },
  spBadge: {
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  spText: { color: '#10B981', fontSize: 13, fontWeight: '800' },
  doneText: { color: 'rgba(16,185,129,0.7)', fontSize: 12, fontWeight: '700' },
});
