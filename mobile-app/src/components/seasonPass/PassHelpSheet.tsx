import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from '../../i18n';
import { FilterBottomSheet } from '../filters/FilterBottomSheet';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Subtítulo de la temporada (fechas), p. ej. "Jun – Sep 2026". */
  period: string;
  daysLeft: number;
  spPerLevel: number;
  levelMax: number;
};

/** Ayuda conceptual del pase de temporada (bottomsheet estándar), abierta desde
 *  el (?) de la cabecera. Explica qué es, cómo se sube (en breve) y las
 *  recompensas — sin repetir la lista de misiones ni el boost al detalle. */
export function PassHelpSheet({ visible, onClose, period, daysLeft, spPerLevel, levelMax }: Props) {
  const { t } = useTranslation();
  return (
    <FilterBottomSheet visible={visible} title={t('alerts.seasonPass.passHelpTitle')} onClose={onClose}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🏆 {t('alerts.seasonPass.passHelpAboutTitle')}</Text>
        <Text style={styles.sectionBody}>
          {t('alerts.seasonPass.passHelpAboutBody', {
            period,
            sp: spPerLevel.toLocaleString('es-ES'),
            max: levelMax,
            days: daysLeft,
          })}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>⚡ {t('alerts.seasonPass.passHelpEarnTitle')}</Text>
        <Text style={styles.sectionBody}>{t('alerts.seasonPass.passHelpEarnBody')}</Text>
      </View>

      <View style={styles.sectionLast}>
        <Text style={styles.sectionTitle}>🎁 {t('alerts.seasonPass.passHelpRewardsTitle')}</Text>
        <Text style={styles.sectionBody}>{t('alerts.seasonPass.passHelpRewardsBody')}</Text>
      </View>
    </FilterBottomSheet>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 20 },
  sectionLast: { marginBottom: 4 },
  sectionTitle: { color: '#fff', fontSize: 15, fontWeight: '800', marginBottom: 6 },
  sectionBody: { color: '#9ca3af', fontSize: 13, lineHeight: 20 },
});
