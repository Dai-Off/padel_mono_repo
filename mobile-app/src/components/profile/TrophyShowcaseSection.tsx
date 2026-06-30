import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../contexts/AuthContext';
import { AchievementCard } from './AchievementCard';
import type { Achievement, AchievementType } from '../../design/achievements';
import { fetchAchievements, toggleAchievementVisibility } from '../../api/unlockables';

type TabKey = 'trophy' | 'badge' | 'course';
const TABS: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'trophy', label: 'Trofeos', icon: 'trophy-outline' },
  { key: 'badge', label: 'Insignias', icon: 'medal-outline' },
  { key: 'course', label: 'Cursos', icon: 'school-outline' },
];

const PREVIEW_COUNT = 4;

export const TrophyShowcaseSection: React.FC = () => {
  const { session } = useAuth();
  const token = session?.access_token ?? null;

  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('trophy');
  const [expanded, setExpanded] = useState(false);
  // Botón-ojo: si está activo, solo muestra los logros visibles (públicos).
  const [onlyVisible, setOnlyVisible] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchAchievements(token)
      .then((list) => {
        if (!cancelled) setAchievements(list);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const counts = useMemo(() => {
    const by = (t: AchievementType) => achievements.filter((a) => a.type === t).length;
    return { trophy: by('trophy'), badge: by('badge'), course: by('course') };
  }, [achievements]);

  const filtered = useMemo(() => {
    let list = achievements.filter((a) => a.type === activeTab);
    if (onlyVisible) list = list.filter((a) => a.isPublic ?? true);
    return list;
  }, [achievements, activeTab, onlyVisible]);
  const displayed = expanded ? filtered : filtered.slice(0, PREVIEW_COUNT);

  const handleToggleVisibility = async (id: string) => {
    // Cursos derivados no tienen estado de visibilidad (siempre públicos).
    if (id.startsWith('course_')) return;
    const current = achievements.find((a) => a.id === id);
    if (!current) return;
    const optimistic = !(current.isPublic ?? true);
    setAchievements((prev) => prev.map((a) => (a.id === id ? { ...a, isPublic: optimistic } : a)));
    const result = await toggleAchievementVisibility(token, id);
    if (result != null && result !== optimistic) {
      setAchievements((prev) => prev.map((a) => (a.id === id ? { ...a, isPublic: result } : a)));
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.titleGroup}>
            <LinearGradient colors={['#F18F34', '#E95F32']} style={styles.trophyIconBox}>
              <Ionicons name="trophy-outline" size={16} color="#fff" />
            </LinearGradient>
            <View>
              <Text style={styles.title}>Vitrina de Logros</Text>
              <Text style={styles.count}>{achievements.length} logros conseguidos</Text>
            </View>
          </View>
          {achievements.length > 0 ? (
            <Pressable
              onPress={() => {
                setOnlyVisible((v) => !v);
                setExpanded(false);
              }}
              style={[styles.eyeBtn, onlyVisible && styles.eyeBtnActive]}
              accessibilityLabel="Mostrar solo los logros visibles"
              accessibilityState={{ selected: onlyVisible }}
            >
              <Ionicons name={onlyVisible ? 'eye' : 'eye-outline'} size={16} color={onlyVisible ? '#F18F34' : '#6B7280'} />
            </Pressable>
          ) : null}
        </View>

        {/* Resumen por categoría */}
        <View style={styles.grid}>
          {[
            { emoji: '🏆', val: counts.trophy, lab: 'Trofeos' },
            { emoji: '🎖️', val: counts.badge, lab: 'Insignias' },
            { emoji: '📚', val: counts.course, lab: 'Cursos' },
          ].map((g) => (
            <View key={g.lab} style={styles.gridItem}>
              <Text style={styles.gridEmoji}>{g.emoji}</Text>
              <Text style={styles.gridVal}>{g.val}</Text>
              <Text style={styles.gridLab}>{g.lab}</Text>
            </View>
          ))}
        </View>

        {/* Tabs de categoría (3, repartidas sin scroll) */}
        <View style={styles.tabsRow}>
          {TABS.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => {
                  setActiveTab(tab.key);
                  setExpanded(false);
                }}
                style={[styles.tabBtn, active && styles.tabBtnActive]}
              >
                <Ionicons name={tab.icon} size={14} color={active ? '#F18F34' : '#6B7280'} />
                <Text style={[styles.tabText, active ? styles.tabTextActive : styles.tabTextInactive]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Lista / estados */}
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color="#F18F34" />
          </View>
        ) : achievements.length === 0 ? (
          <View style={styles.centered}>
            <Ionicons name="trophy-outline" size={24} color="#6B7280" />
            <Text style={styles.emptyText}>Aún no has conseguido logros. ¡Juega partidos y completa lecciones!</Text>
          </View>
        ) : (
          <>
            <View style={styles.list}>
              {displayed.map((a) => (
                <AchievementCard
                  key={a.id}
                  achievement={a}
                  editable={a.type !== 'course'}
                  onToggleVisibility={handleToggleVisibility}
                />
              ))}
            </View>
            {filtered.length > PREVIEW_COUNT ? (
              <Pressable style={styles.viewAllBtn} onPress={() => setExpanded((v) => !v)}>
                <Text style={styles.viewAllText}>{expanded ? 'Ver menos' : `Ver todos (${filtered.length})`}</Text>
                <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color="#9CA3AF" />
              </Pressable>
            ) : null}
          </>
        )}

        <View style={styles.disclaimer}>
          <Ionicons name="lock-closed" size={12} color="#4B5563" />
          <Text style={styles.disclaimerText}>
            Los logros marcados como <Text style={styles.disclaimerBold}>públicos</Text> serán visibles para otros jugadores.
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, marginTop: 16 },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 16,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  titleGroup: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  trophyIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F18F34',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  title: { fontSize: 14, fontWeight: 'bold', color: '#fff' },
  count: { fontSize: 10, color: '#6B7280', marginTop: 1 },
  eyeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  eyeBtnActive: { backgroundColor: 'rgba(241, 143, 52, 0.15)', borderColor: 'rgba(241, 143, 52, 0.35)' },
  grid: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  gridItem: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 14,
    padding: 10,
    alignItems: 'center',
  },
  gridEmoji: { fontSize: 18, marginBottom: 4 },
  gridVal: { fontSize: 15, fontWeight: 'bold', color: '#fff' },
  gridLab: { fontSize: 9, color: '#6B7280', fontWeight: '600' },
  tabsRow: { flexDirection: 'row', gap: 6, backgroundColor: 'rgba(255, 255, 255, 0.03)', borderRadius: 12, marginBottom: 16, padding: 4 },
  tabBtn: { flex: 1, paddingHorizontal: 8, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 8 },
  tabBtnActive: { backgroundColor: 'rgba(241, 143, 52, 0.15)', borderWidth: 1, borderColor: 'rgba(241, 143, 52, 0.2)' },
  tabText: { fontSize: 10, fontWeight: 'bold' },
  tabTextActive: { color: '#F18F34' },
  tabTextInactive: { color: '#6B7280' },
  list: { gap: 10 },
  centered: { minHeight: 96, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16 },
  emptyText: { fontSize: 12, color: '#9CA3AF', textAlign: 'center' },
  viewAllBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, paddingVertical: 8 },
  viewAllText: { fontSize: 11, fontWeight: '600', color: '#9CA3AF' },
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 12,
  },
  disclaimerText: { fontSize: 9, color: '#4B5563', flex: 1 },
  disclaimerBold: { color: '#F18F34', fontWeight: 'bold' },
});
