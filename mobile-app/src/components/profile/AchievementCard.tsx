import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RARITY_CONFIG } from '../../design/rarity';
import { RarityBadge } from './RarityBadge';
import type { Achievement } from '../../design/achievements';

interface AchievementCardProps {
  achievement: Achievement;
  /** Muestra el botón de ojo (visibilidad pública). */
  editable?: boolean;
  onToggleVisibility?: (id: string) => void;
  /** Variante reducida (sin descripción/acciones). */
  compact?: boolean;
}

/**
 * Tarjeta reutilizable de logro (trofeo/insignia/curso) con estilo por rareza.
 * Usada en la Vitrina de Logros (Fase 2) y el modal de personalización (Fase 3).
 */
export const AchievementCard: React.FC<AchievementCardProps> = ({
  achievement,
  editable = false,
  onToggleVisibility,
  compact = false,
}) => {
  const conf = RARITY_CONFIG[achievement.rarity];
  const inProgress = achievement.progress != null && achievement.progress < 100;
  const isHigh = achievement.rarity === 'legendary' || achievement.rarity === 'epic';

  if (compact) {
    return (
      <View style={[styles.compact, { backgroundColor: conf.bg, borderColor: conf.border }]}>
        <View style={[styles.iconBoxSm, { backgroundColor: conf.bg, borderColor: conf.border }]}>
          <Ionicons name={achievement.icon as any} size={16} color={conf.color} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.titleSm} numberOfLines={1}>{achievement.title}</Text>
          {achievement.date ? <Text style={styles.metaSm}>{achievement.date}</Text> : null}
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: conf.bg, borderColor: conf.border },
        !(achievement.isPublic ?? true) && styles.dimmed,
      ]}
    >
      <View style={[styles.iconBox, { backgroundColor: conf.bg, borderColor: conf.border }]}>
        <Ionicons name={achievement.icon as any} size={20} color={conf.color} />
      </View>

      <View style={styles.flex}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>{achievement.title}</Text>
          {isHigh ? <RarityBadge rarity={achievement.rarity} /> : null}
        </View>
        <Text style={styles.desc} numberOfLines={2}>{achievement.description}</Text>
        <View style={styles.metaRow}>
          {achievement.date ? <Text style={styles.meta}>{achievement.date}</Text> : null}
          {achievement.sport ? (
            <View style={styles.sportChip}>
              <Text style={styles.sportText}>{achievement.sport}</Text>
            </View>
          ) : null}
          {inProgress ? (
            <View style={styles.progressWrap}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${achievement.progress ?? 0}%` }]} />
              </View>
              <Text style={styles.progressText}>{achievement.progress}%</Text>
            </View>
          ) : null}
        </View>
      </View>

      {editable && onToggleVisibility ? (
        <Pressable
          onPress={() => onToggleVisibility(achievement.id)}
          style={[styles.eyeBtn, (achievement.isPublic ?? true) && { backgroundColor: 'rgba(241,143,52,0.15)' }]}
          accessibilityLabel={(achievement.isPublic ?? true) ? 'Ocultar logro' : 'Mostrar logro'}
        >
          <Ionicons
            name={(achievement.isPublic ?? true) ? 'eye-outline' : 'eye-off-outline'}
            size={16}
            color={(achievement.isPublic ?? true) ? '#F18F34' : '#6B7280'}
          />
        </Pressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  dimmed: {
    opacity: 0.6,
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxSm: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  desc: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  meta: {
    fontSize: 10,
    color: '#6B7280',
  },
  sportChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  sportText: {
    fontSize: 9,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  progressWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  progressTrack: {
    flex: 1,
    maxWidth: 70,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#F18F34',
  },
  progressText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#F18F34',
  },
  eyeBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // compact
  compact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  titleSm: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  metaSm: {
    fontSize: 9,
    color: '#6B7280',
    marginTop: 1,
  },
});
