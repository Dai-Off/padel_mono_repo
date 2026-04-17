import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SkillPolarChart } from './SkillPolarChart';

import { CoachAssessment } from '../../api/coachAssessment';

interface AICoachSectionProps {
  assessment: CoachAssessment;
}

export const AICoachSection: React.FC<AICoachSectionProps> = ({ assessment }) => {
  return (
    <View style={styles.container}>
      {/* Resumen Card */}
      <View style={styles.card}>
        <View style={styles.glow} />
        <View style={styles.cardHeader}>
          <LinearGradient colors={['#F18F34', '#E95F32']} style={styles.iconContainer}>
            <Ionicons name="bulb-outline" size={20} color="#fff" />
          </LinearGradient>
          <View style={styles.titleContainer}>
            <Text style={styles.title}>Coach Virtual IA</Text>
            <Text style={styles.subtitle}>Tu entrenador personal 24/7</Text>
          </View>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <View style={styles.statIconWrapper}>
              <Ionicons name="trending-up-outline" size={16} color="#F18F34" />
            </View>
            <Text style={styles.statValue}>
              +{assessment.stats?.improvementPercentage ?? 0}%
            </Text>
            <Text style={styles.statLabel}>Mejora</Text>
          </View>
          <View style={styles.statBox}>
            <View style={styles.statIconWrapper}>
              <Ionicons name="locate-outline" size={16} color="#F18F34" />
            </View>
            <Text style={styles.statValue}>
              {assessment.stats?.completedObjectives ?? 0}/{assessment.stats?.totalObjectives ?? 10}
            </Text>
            <Text style={styles.statLabel}>Objetivos</Text>
          </View>
          <View style={styles.statBox}>
            <View style={styles.statIconWrapper}>
              <Ionicons name="flame-outline" size={16} color="#F18F34" />
            </View>
            <Text style={styles.statValue}>
              {assessment.stats?.matchCount ?? 0}
            </Text>
            <Text style={styles.statLabel}>Partidos</Text>
          </View>
        </View>
      </View>

      {/* Tabs Menu */}
      <View style={styles.tabsContainer}>
        <Pressable style={[styles.tab, styles.tabActive]}>
          <LinearGradient colors={['#F18F34', '#E95F32']} style={styles.tabGradient} />
          <Text style={[styles.tabText, styles.tabTextActive]}>Resumen de Hoy</Text>
        </Pressable>
        <Pressable style={styles.tab}>
          <Text style={styles.tabText}>Plan</Text>
        </Pressable>
      </View>

      {/* Análisis Level Card */}
      <View style={styles.analysisCard}>
        <View style={styles.analysisHeader}>
          <View style={styles.analysisIconBox}>
            <Ionicons name="analytics-outline" size={14} color="#F18F34" />
          </View>
          <Text style={styles.analysisTitle}>Análisis de tu Nivel Actual</Text>
        </View>
        
        <SkillPolarChart 
          skills={{
            technical: assessment.skills.technical,
            physical: assessment.skills.physical,
            mental: assessment.skills.mental,
            tactical: assessment.skills.tactical
          }}
        />

        {/* Recomendación IA */}
        <View style={styles.recommendationBox}>
          <View style={styles.recIconContainer}>
            <Ionicons name="sparkles-outline" size={12} color="#fff" />
          </View>
          <View style={styles.recContent}>
            <Text style={styles.recTitle}>Recomendación IA:</Text>
            <Text style={styles.recText}>
              {assessment.recommendation || 'Continúa entrenando para mejorar tus habilidades.'}
            </Text>
          </View>
        </View>
      </View>

      {/* Fortalezas y Áreas de Mejora */}
      <View style={styles.listsGrid}>
        <View style={styles.listCard}>
          <View style={styles.listHeader}>
            <View style={[styles.listIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
              <Ionicons name="checkmark-circle" size={12} color="#10B981" />
            </View>
            <Text style={styles.listTitle}>Fortalezas</Text>
          </View>
          <View style={styles.listItems}>
            {assessment.strengths.map((strength, index) => (
              <View key={index} style={styles.listItem}>
                <Ionicons name="checkmark-circle" size={12} color="#10B981" />
                <Text style={styles.listItemText}>{strength}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.listCard}>
          <View style={styles.listHeader}>
            <View style={[styles.listIconBox, { backgroundColor: 'rgba(249, 115, 22, 0.1)' }]}>
              <Ionicons name="alert-circle" size={12} color="#F97316" />
            </View>
            <Text style={styles.listTitle}>A mejorar</Text>
          </View>
          <View style={styles.listItems}>
            {assessment.improvements.map((improvement, index) => (
              <View key={index} style={styles.listItem}>
                <Ionicons name="alert-circle" size={12} color="#F97316" />
                <Text style={styles.listItemText}>{improvement}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Progreso Chart Mockup */}
      <View style={styles.card}>
        <View style={styles.analysisHeader}>
          <View style={[styles.analysisIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
            <Ionicons name="stats-chart-outline" size={14} color="#10B981" />
          </View>
          <Text style={styles.analysisTitle}>Progreso Últimos 3 Meses</Text>
        </View>
        <View style={styles.progressRow}>
          <Text style={styles.monthLabel}>Noviembre</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: '40%' }]} />
          </View>
          <Text style={styles.progressValue}>+5%</Text>
        </View>
        <View style={styles.progressRow}>
          <Text style={styles.monthLabel}>Diciembre</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: '64%' }]} />
          </View>
          <Text style={styles.progressValue}>+8%</Text>
        </View>
        <View style={styles.progressRow}>
          <Text style={styles.monthLabel}>Enero</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: '96%' }]} />
          </View>
          <Text style={styles.progressValue}>+12%</Text>
        </View>
      </View>
    </View>
  );
};


const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    gap: 16,
    marginTop: 16,
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 140,
    height: 140,
    backgroundColor: '#F18F34',
    borderRadius: 70,
    opacity: 0.08,
    pointerEvents: 'none',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F18F34',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 11,
    color: '#6B7280',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  statBox: {
    flex: 1,
    backgroundColor: 'rgba(241, 143, 82, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(241, 143, 52, 0.15)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  statIconWrapper: {
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  statLabel: {
    fontSize: 9,
    color: '#6B7280',
    textTransform: 'uppercase',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  tabsContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 4,
    flexDirection: 'row',
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
    position: 'relative',
  },
  tabActive: {
    backgroundColor: 'transparent',
  },
  tabGradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 8,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  tabTextActive: {
    color: '#fff',
  },
  analysisCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 16,
  },
  analysisHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  analysisIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(241, 143, 52, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(241, 143, 52, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  analysisTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
  },
  recommendationBox: {
    marginTop: 16,
    padding: 12,
    backgroundColor: 'rgba(241, 143, 52, 0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(241, 143, 52, 0.12)',
    flexDirection: 'row',
    gap: 8,
  },
  recIconContainer: {
    width: 24,
    height: 24,
    backgroundColor: '#F18F34',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recContent: {
    flex: 1,
  },
  recTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 2,
  },
  recText: {
    fontSize: 11,
    color: '#9CA3AF',
    lineHeight: 16,
  },
  listsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  listCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 20,
    padding: 14,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  listIconBox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  listTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
  },
  listItems: {
    gap: 8,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 8,
  },
  listItemText: {
    fontSize: 10,
    color: '#D1D5DB',
    flex: 1,
    lineHeight: 14,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.02)',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  monthLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9CA3AF',
    width: 65,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 4,
  },
  progressValue: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#10B981',
    width: 40,
    textAlign: 'right',
  },
});
