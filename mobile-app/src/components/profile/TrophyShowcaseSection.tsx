import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

interface Achievement {
  id: string;
  title: string;
  description: string;
  tier: 'LEGENDARIO' | 'ÉPICO' | 'NORMAL';
  icon: keyof typeof Ionicons.glyphMap;
  date: string;
  sport?: string;
  color: string;
  isPublic: boolean;
}

const ACHIEVEMENTS: Achievement[] = [
  {
    id: '1',
    title: 'Campeón Torneo Verano',
    description: '1er puesto en el Torneo de Verano 2025',
    tier: 'LEGENDARIO',
    icon: 'trophy-outline',
    date: 'Ago 2025',
    sport: 'Pádel',
    color: '#F18F34',
    isPublic: true,
  },
  {
    id: '2',
    title: 'Imparable',
    description: 'Completaste la lección diaria 7 días seguidos',
    tier: 'ÉPICO',
    icon: 'flame-outline',
    date: 'Jul 2025',
    sport: 'Pádel',
    color: '#A855F7',
    isPublic: true,
  },
  {
    id: '3',
    title: 'Muro de la Red',
    description: 'Completaste tu primer curso de volea',
    tier: 'NORMAL',
    icon: 'ribbon-outline',
    date: 'Jun 2025',
    color: '#6B7280',
    isPublic: true,
  },
];

export const TrophyShowcaseSection: React.FC = () => {
  const [activeTab, setActiveTab] = useState('Todos');

  const renderAchievement = (item: Achievement) => {
    const isLegendary = item.tier === 'LEGENDARIO';
    const isEpic = item.tier === 'ÉPICO';

    return (
      <View 
        key={item.id} 
        style={[
          styles.achItem, 
          isLegendary && styles.achItemLegendary,
          isEpic && styles.achItemEpic
        ]}
      >
        <View style={[styles.achIconBox, { backgroundColor: `${item.color}15`, borderColor: `${item.color}30` }]}>
          <Ionicons name={item.icon} size={20} color={item.color} />
        </View>
        <View style={styles.achContent}>
          <View style={styles.achTitleRow}>
            <Text style={styles.achTitle} numberOfLines={1}>{item.title}</Text>
            {isLegendary && (
              <View style={styles.tierBadgeLegendary}>
                <Text style={styles.tierBadgeTextLegendary}>✦ LEGENDARIO</Text>
              </View>
            )}
            {isEpic && (
              <View style={styles.tierBadgeEpic}>
                <Text style={styles.tierBadgeTextEpic}>ÉPICO</Text>
              </View>
            )}
          </View>
          <Text style={styles.achDesc} numberOfLines={1}>{item.description}</Text>
          <View style={styles.achFooter}>
            <Text style={styles.achDate}>{item.date}</Text>
            {item.sport && (
              <View style={styles.sportBadge}>
                <Text style={styles.sportBadgeText}>{item.sport}</Text>
              </View>
            )}
          </View>
        </View>
        <Pressable style={styles.eyeBtn}>
          <Ionicons name="eye-outline" size={14} color="#F18F34" />
        </Pressable>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.titleGroup}>
            <LinearGradient colors={['#F18F34', '#E95F32']} style={styles.trophyIconBox}>
              <Ionicons name="trophy-outline" size={16} color="#fff" />
            </LinearGradient>
            <View>
              <Text style={styles.title}>Vitrina de Logros</Text>
              <Text style={styles.count}>10 logros conseguidos</Text>
            </View>
          </View>
          <View style={styles.publicBadge}>
            <Ionicons name="eye-outline" size={12} color="#F18F34" />
            <Text style={styles.publicBadgeText}>8 públicos</Text>
          </View>
        </View>

        {/* Categories Grid */}
        <View style={styles.grid}>
          <View style={styles.gridItem}>
            <Text style={styles.gridEmoji}>🏆</Text>
            <Text style={styles.gridVal}>5</Text>
            <Text style={styles.gridLab}>Trofeos</Text>
          </View>
          <View style={styles.gridItem}>
            <Text style={styles.gridEmoji}>🎖️</Text>
            <Text style={styles.gridVal}>2</Text>
            <Text style={styles.gridLab}>Insignias</Text>
          </View>
          <View style={styles.gridItem}>
            <Text style={styles.gridEmoji}>📚</Text>
            <Text style={styles.gridVal}>3</Text>
            <Text style={styles.gridLab}>Cursos</Text>
          </View>
        </View>

        {/* Filter Tabs */}
        <View style={styles.tabsRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
            {['Todos', 'Trofeos', 'Insignias', 'Cursos'].map(tab => (
              <Pressable 
                key={tab} 
                onPress={() => setActiveTab(tab)}
                style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]}
              >
                <Ionicons 
                  name={
                    tab === 'Todos' ? 'star-outline' : 
                    tab === 'Trofeos' ? 'trophy-outline' : 
                    tab === 'Insignias' ? 'medal-outline' : 'school-outline'
                  } 
                  size={14} 
                  color={activeTab === tab ? '#F18F34' : '#6B7280'} 
                />
                <Text style={[styles.tabText, activeTab === tab ? styles.tabTextActive : styles.tabTextInactive]}>
                  {tab}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* List */}
        <View style={styles.list}>
          {ACHIEVEMENTS.map(renderAchievement)}
        </View>

        <Pressable style={styles.viewAllBtn}>
          <Text style={styles.viewAllText}>Ver todos (10)</Text>
          <Ionicons name="chevron-down" size={14} color="#9CA3AF" />
        </Pressable>

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
  container: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
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
  title: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
  },
  count: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 1,
  },
  publicBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(241, 143, 52, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: 'rgba(241, 143, 52, 0.2)',
  },
  publicBadgeText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#F18F34',
  },
  grid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  gridItem: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 14,
    padding: 10,
    alignItems: 'center',
  },
  gridEmoji: {
    fontSize: 18,
    marginBottom: 4,
  },
  gridVal: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#fff',
  },
  gridLab: {
    fontSize: 9,
    color: '#6B7280',
    fontWeight: '600',
  },
  tabsRow: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    marginBottom: 16,
    padding: 4,
  },
  tabsScroll: {
    gap: 6,
  },
  tabBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 8,
  },
  tabBtnActive: {
    backgroundColor: 'rgba(241, 143, 52, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(241, 143, 52, 0.2)',
  },
  tabText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  tabTextActive: {
    color: '#F18F34',
  },
  tabTextInactive: {
    color: '#6B7280',
  },
  list: {
    gap: 10,
  },
  achItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  achItemLegendary: {
    backgroundColor: 'rgba(241, 143, 52, 0.08)',
    borderColor: 'rgba(241, 143, 52, 0.2)',
  },
  achItemEpic: {
    backgroundColor: 'rgba(168, 85, 247, 0.08)',
    borderColor: 'rgba(168, 85, 247, 0.2)',
  },
  achIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  achContent: {
    flex: 1,
    marginLeft: 12,
  },
  achTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  achTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
    maxWidth: '60%',
  },
  tierBadgeLegendary: {
    backgroundColor: 'rgba(241, 143, 52, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(241, 143, 52, 0.3)',
  },
  tierBadgeTextLegendary: {
    fontSize: 8,
    fontWeight: '900',
    color: '#F18F34',
  },
  tierBadgeEpic: {
    backgroundColor: 'rgba(168, 85, 247, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.3)',
  },
  tierBadgeTextEpic: {
    fontSize: 8,
    fontWeight: '900',
    color: '#A855F7',
  },
  achDesc: {
    fontSize: 10,
    color: '#9CA3AF',
  },
  achFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  achDate: {
    fontSize: 9,
    color: '#4B5563',
  },
  sportBadge: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sportBadgeText: {
    fontSize: 8,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  eyeBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(241, 143, 52, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 8,
  },
  viewAllText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 12,
  },
  disclaimerText: {
    fontSize: 9,
    color: '#4B5563',
    flex: 1,
  },
  disclaimerBold: {
    color: '#F18F34',
    fontWeight: 'bold',
  },
});
