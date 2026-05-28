import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SkillPolarChart } from './SkillPolarChart';

import { CoachAssessment } from '../../api/coachAssessment';
import { PeerFeedbackInsight } from '../../api/peerFeedbackInsight';
import { generateFigmaWeeklyPlan, SkillCategory } from '../../lib/coachPlanContent';

interface AICoachSectionProps {
  assessment: CoachAssessment;
  peerInsight: PeerFeedbackInsight | null;
}

const CATEGORY_COLORS: Record<SkillCategory, string> = {
  technical: '#F18F34',
  physical: '#10B981',
  mental: '#EC4899',
  tactical: '#3B82F6',
};

const DIFFICULTY_COLORS = {
  Bajo: { bg: 'rgba(16, 185, 129, 0.1)', text: '#10B981', border: 'rgba(16, 185, 129, 0.2)' },
  Medio: { bg: 'rgba(245, 158, 11, 0.1)', text: '#F59E0B', border: 'rgba(245, 158, 11, 0.2)' },
  Alto: { bg: 'rgba(239, 68, 68, 0.1)', text: '#EF4444', border: 'rgba(239, 68, 68, 0.2)' },
};

const ICON_MAP: Record<string, string> = {
  'target': 'locate-outline',
  'zap': 'flash-outline',
  'book-open': 'book-outline',
  'trophy': 'trophy-outline',
};

export const AICoachSection: React.FC<AICoachSectionProps> = ({ assessment, peerInsight }) => {
  const [activeTab, setActiveTab] = useState<'today' | 'plan'>(
    peerInsight && !peerInsight.empty ? 'today' : 'plan'
  );

  const isToday = activeTab === 'today';
  
  // Decide what to show
  const showPeerData = isToday && peerInsight && !peerInsight.empty;
  
  const recommendation = showPeerData 
    ? peerInsight.recommendation_ia 
    : assessment.recommendation;

  const strengths = showPeerData 
    ? peerInsight.fortalezas 
    : assessment.strengths;

  const improvements = showPeerData 
    ? peerInsight.a_mejorar 
    : assessment.improvements;

  const sourceLabel = showPeerData
    ? (peerInsight.insight_source === 'openai' ? 'IA' : 'Feedback')
    : 'Evaluación';

  // Generar plan con fidelidad de Figma
  const plan = generateFigmaWeeklyPlan(assessment);

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
        <Pressable 
          style={[styles.tab, activeTab === 'today' && styles.tabActive]}
          onPress={() => setActiveTab('today')}
        >
          {activeTab === 'today' && (
            <LinearGradient colors={['#F18F34', '#E95F32']} style={styles.tabGradient} />
          )}
          <Text style={[styles.tabText, activeTab === 'today' && styles.tabTextActive]}>
            Resumen de Hoy
          </Text>
        </Pressable>
        <Pressable 
          style={[styles.tab, activeTab === 'plan' && styles.tabActive]}
          onPress={() => setActiveTab('plan')}
        >
          {activeTab === 'plan' && (
            <LinearGradient colors={['#F18F34', '#E95F32']} style={styles.tabGradient} />
          )}
          <Text style={[styles.tabText, activeTab === 'plan' && styles.tabTextActive]}>Plan</Text>
        </Pressable>
      </View>

      {/* TAB RESUMEN DE HOY */}
      {activeTab === 'today' && (
        <>
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
                <Ionicons name={showPeerData ? "chatbubbles-outline" : "sparkles-outline"} size={12} color="#fff" />
              </View>
              <View style={styles.recContent}>
                <View style={styles.recHeaderRow}>
                  <Text style={styles.recTitle}>Recomendación {sourceLabel}:</Text>
                  {showPeerData && peerInsight.feedback_created_at && (
                    <Text style={styles.recDate}>
                      {new Date(peerInsight.feedback_created_at).toLocaleDateString()}
                    </Text>
                  )}
                </View>
                <Text style={styles.recText}>
                  {recommendation || 'Continúa entrenando para mejorar tus habilidades.'}
                </Text>
                {showPeerData && (
                  <Text style={styles.peerCountText}>
                    Basado en el feedback de {peerInsight.peer_count} compañero{peerInsight.peer_count !== 1 ? 's' : ''}
                  </Text>
                )}
                {!showPeerData && activeTab === 'today' && (
                    <Text style={styles.emptyText}>
                      Cuando juegues un partido con feedback, veremos aquí un resumen claro para tu próximo paso.
                    </Text>
                )}
              </View>
            </View>
          </View>

          {/* Percepción de Compañeros (Solo si hay datos de hoy) */}
          {showPeerData && peerInsight.distribution && (
            <View style={styles.analysisCard}>
                <View style={styles.analysisHeader}>
                  <View style={[styles.analysisIconBox, { backgroundColor: 'rgba(59, 130, 246, 0.1)', borderColor: 'rgba(59, 130, 246, 0.2)' }]}>
                    <Ionicons name="people-outline" size={14} color="#3B82F6" />
                  </View>
                  <Text style={styles.analysisTitle}>Percepción de tus Compañeros</Text>
                </View>
                
                <View style={styles.perceivedBadgeRow}>
                    <View style={[
                        styles.perceivedBadge, 
                        peerInsight.last_perceived === 1 ? styles.badgeHigh : 
                        peerInsight.last_perceived === -1 ? styles.badgeLow : styles.badgeMid
                    ]}>
                        <Text style={styles.perceivedBadgeText}>
                            {peerInsight.last_perceived === 1 ? 'Nivel Superior' : 
                             peerInsight.last_perceived === -1 ? 'Bajo lo Esperado' : 'Nivel Acertado'}
                        </Text>
                    </View>
                    <Text style={styles.perceivedSubtext}>Última tendencia</Text>
                </View>

                <View style={styles.distributionContainer}>
                    <View style={styles.distItem}>
                        <Text style={styles.distLabel}>Alto</Text>
                        <View style={styles.distBarTrack}>
                            <View style={[styles.distBarFill, { width: `${(peerInsight.distribution.high / peerInsight.peer_count) * 100}%`, backgroundColor: '#10B981' }]} />
                        </View>
                        <Text style={styles.distValue}>{peerInsight.distribution.high}</Text>
                    </View>
                    <View style={styles.distItem}>
                        <Text style={styles.distLabel}>Normal</Text>
                        <View style={styles.distBarTrack}>
                            <View style={[styles.distBarFill, { width: `${(peerInsight.distribution.mid / peerInsight.peer_count) * 100}%`, backgroundColor: '#F97316' }]} />
                        </View>
                        <Text style={styles.distValue}>{peerInsight.distribution.mid}</Text>
                    </View>
                    <View style={styles.distItem}>
                        <Text style={styles.distLabel}>Bajo</Text>
                        <View style={styles.distBarTrack}>
                            <View style={[styles.distBarFill, { width: `${(peerInsight.distribution.low / peerInsight.peer_count) * 100}%`, backgroundColor: '#EF4444' }]} />
                        </View>
                        <Text style={styles.distValue}>{peerInsight.distribution.low}</Text>
                    </View>
                </View>
            </View>
          )}

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
                {strengths.map((strength, index) => (
                  <View key={index} style={styles.listItem}>
                    <Ionicons name="checkmark-circle" size={12} color="#10B981" />
                    <Text style={styles.listItemText}>{strength}</Text>
                  </View>
                ))}
                {strengths.length === 0 && (
                    <Text style={styles.emptySmallText}>Sin datos aún</Text>
                )}
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
                {improvements.map((improvement, index) => (
                  <View key={index} style={styles.listItem}>
                    <Ionicons name="alert-circle" size={12} color="#F97316" />
                    <Text style={styles.listItemText}>{improvement}</Text>
                  </View>
                ))}
                {improvements.length === 0 && (
                    <Text style={styles.emptySmallText}>Sin datos aún</Text>
                )}
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
        </>
      )}

      {/* TAB PLAN CON ALTA FIDELIDAD FIGMA */}
      {activeTab === 'plan' && (
        <View style={styles.planFigmaContainer}>
          {/* Plan de Esta Semana */}
          <View style={styles.analysisCard}>
            <View style={styles.glow} />
            <View style={styles.analysisHeader}>
              <View style={[styles.analysisIconBox, { backgroundColor: 'rgba(241, 143, 52, 0.1)' }]}>
                <Ionicons name="calendar-outline" size={14} color="#F18F34" />
              </View>
              <View style={styles.planHeaderTitleWrap}>
                <Text style={styles.analysisTitle}>Plan de Esta Semana</Text>
                <View style={styles.personalizedBadge}>
                  <Text style={styles.personalizedBadgeText}>Personalizado</Text>
                </View>
              </View>
            </View>

            <View style={styles.goalsContainer}>
              {plan.weeklyProgress.map((item) => {
                const percentage = Math.min(100, Math.round((item.actual / item.target) * 100));
                return (
                  <View key={item.key} style={styles.figmaGoalCard}>
                    <View style={styles.figmaGoalHeader}>
                      <View style={styles.figmaGoalTitleRow}>
                        <Ionicons name={ICON_MAP[item.icon] as any} size={14} color="#F18F34" style={styles.goalIcon} />
                        <Text style={styles.figmaGoalLabel}>{item.label}</Text>
                      </View>
                      <Text style={styles.figmaGoalValue}>{item.actual}/{item.target}</Text>
                    </View>
                    <View style={styles.figmaProgressTrack}>
                      <LinearGradient
                        colors={['#F18F34', '#E95F32']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[styles.figmaProgressFill, { width: `${percentage}%` }]}
                      />
                    </View>
                    <View style={styles.figmaGoalFooter}>
                      <Text style={styles.figmaGoalFooterText}>
                        Actual: <Text style={styles.figmaGoalFooterStrong}>{item.actual}</Text>
                      </Text>
                      <Text style={styles.figmaGoalFooterText}>
                        Meta: <Text style={styles.figmaGoalFooterStrong}>{item.target}</Text>
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Plan Mensual */}
          <View style={styles.analysisCard}>
            <View style={styles.glow} />
            <View style={styles.analysisHeader}>
              <View style={[styles.analysisIconBox, { backgroundColor: 'rgba(245, 158, 11, 0.1)' }]}>
                <Ionicons name="trophy-outline" size={14} color="#F59E0B" />
              </View>
              <Text style={styles.analysisTitle}>Plan Mensual</Text>
            </View>

            <View style={styles.goalsContainer}>
              {plan.monthlyProgress.map((item) => {
                const percentage = Math.min(100, Math.round((item.actual / item.target) * 100));
                return (
                  <View key={item.key} style={styles.figmaGoalCard}>
                    <View style={styles.figmaGoalHeader}>
                      <View style={styles.figmaGoalTitleRow}>
                        <Ionicons name={ICON_MAP[item.icon] as any} size={14} color="#F18F34" style={styles.goalIcon} />
                        <Text style={styles.figmaGoalLabel}>{item.label}</Text>
                      </View>
                      <Text style={styles.figmaGoalValue}>{item.actual}/{item.target}</Text>
                    </View>
                    <View style={styles.figmaProgressTrack}>
                      <LinearGradient
                        colors={['#F18F34', '#E95F32']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[styles.figmaProgressFill, { width: `${percentage}%` }]}
                      />
                    </View>
                    <View style={styles.figmaGoalFooter}>
                      <Text style={styles.figmaGoalFooterText}>
                        Actual: <Text style={styles.figmaGoalFooterStrong}>{item.actual}</Text>
                      </Text>
                      <Text style={styles.figmaGoalFooterText}>
                        Meta: <Text style={styles.figmaGoalFooterStrong}>{item.target}</Text>
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Ejercicios Recomendados */}
          <View style={styles.analysisCard}>
            <View style={styles.analysisHeader}>
              <View style={[styles.analysisIconBox, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
                <Ionicons name="fitness-outline" size={14} color="#3B82F6" />
              </View>
              <Text style={styles.analysisTitle}>Ejercicios Recomendados</Text>
            </View>

            <View style={styles.figmaDrillsList}>
              {plan.drills.map((drill, idx) => {
                const diffColor = DIFFICULTY_COLORS[drill.difficulty];
                return (
                  <View key={idx} style={styles.figmaDrillCard}>
                    <View style={styles.figmaDrillHeader}>
                      <Text style={styles.figmaDrillName}>{drill.name}</Text>
                      <View style={[styles.diffBadge, { backgroundColor: diffColor.bg, borderColor: diffColor.border }]}>
                        <Text style={[styles.diffBadgeText, { color: diffColor.text }]}>
                          {drill.difficulty}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.figmaDrillFooter}>
                      <View style={styles.figmaDrillMetaItem}>
                        <Ionicons name="time-outline" size={12} color="#9CA3AF" />
                        <Text style={styles.figmaDrillMetaText}>{drill.duration}</Text>
                      </View>
                      <View style={styles.figmaDrillMetaItem}>
                        <Ionicons name="locate-outline" size={12} color="#9CA3AF" />
                        <Text style={styles.figmaDrillMetaText}>{drill.sets}</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      )}
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
    position: 'relative',
    overflow: 'hidden',
  },
  analysisHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    zIndex: 10,
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
    fontSize: 13,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 2,
  },
  recText: {
    fontSize: 13,
    color: '#D1D5DB',
    lineHeight: 18,
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
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
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
  recHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  recDate: {
    fontSize: 10,
    color: '#6B7280',
    fontWeight: '500',
  },
  peerCountText: {
    fontSize: 10,
    fontStyle: 'italic',
    color: '#F18F34',
    marginTop: 6,
    fontWeight: '500',
  },
  emptyText: {
    fontSize: 11,
    color: '#6B7280',
    fontStyle: 'italic',
    marginTop: 4,
  },
  emptySmallText: {
    fontSize: 9,
    color: '#4B5563',
    marginLeft: 6,
  },
  perceivedBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  perceivedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgeHigh: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  badgeMid: {
    backgroundColor: 'rgba(249, 115, 22, 0.1)',
    borderColor: 'rgba(249, 115, 22, 0.2)',
  },
  badgeLow: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  perceivedBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
  },
  perceivedSubtext: {
    fontSize: 10,
    color: '#6B7280',
  },
  distributionContainer: {
    gap: 12,
  },
  distItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  distLabel: {
    fontSize: 10,
    color: '#9CA3AF',
    width: 45,
  },
  distBarTrack: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  distBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  distValue: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
    width: 15,
    textAlign: 'right',
  },

  // HIGH FIDELITY FIGMA PLAN STYLES
  planFigmaContainer: {
    gap: 16,
    zIndex: 1,
  },
  planHeaderTitleWrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flex: 1,
  },
  personalizedBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  personalizedBadgeText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#34D399',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  goalsContainer: {
    gap: 10,
    zIndex: 10,
  },
  figmaGoalCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    padding: 12,
  },
  figmaGoalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  figmaGoalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  goalIcon: {
    width: 16,
  },
  figmaGoalLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  figmaGoalValue: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#F59E0B',
  },
  figmaProgressTrack: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  figmaProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  figmaGoalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  figmaGoalFooterText: {
    fontSize: 10,
    color: '#6B7280',
  },
  figmaGoalFooterStrong: {
    color: '#D1D5DB',
    fontWeight: '600',
  },
  figmaDrillsList: {
    gap: 10,
    zIndex: 10,
  },
  figmaDrillCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 14,
    padding: 12,
  },
  figmaDrillHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  figmaDrillName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  diffBadge: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  diffBadgeText: {
    fontSize: 9,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  figmaDrillFooter: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  figmaDrillMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  figmaDrillMetaText: {
    fontSize: 11,
    color: '#9CA3AF',
  },
});
