import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '../../i18n';
import { SkillPolarChart } from './SkillPolarChart';

interface SkillRadarCardProps {
  skills: {
    technical: number;
    physical: number;
    mental: number;
    tactical: number;
  };
  /** Nombre del nivel (ej. "Avanzado"); opcional, se muestra como chip. */
  levelName?: string | null;
}

/**
 * Tarjeta del radar de habilidades. Presentational puro y reutilizable en el
 * perfil propio y en el ajeno (identidad del jugador, sin coaching).
 */
export const SkillRadarCard: React.FC<SkillRadarCardProps> = ({ skills, levelName }) => {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.iconBox}>
            <Ionicons name="analytics-outline" size={14} color="#F18F34" />
          </View>
          <Text style={styles.title}>{t('profile.skillRadarTitle')}</Text>
          {levelName ? (
            <View style={styles.levelBadge}>
              <Text style={styles.levelBadgeText}>{levelName}</Text>
            </View>
          ) : null}
        </View>
        <SkillPolarChart max={70} skills={skills} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  iconBox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: 'rgba(241, 143, 52, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(241, 143, 52, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
  },
  levelBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(241, 143, 52, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(241, 143, 52, 0.3)',
  },
  levelBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F18F34',
  },
});
