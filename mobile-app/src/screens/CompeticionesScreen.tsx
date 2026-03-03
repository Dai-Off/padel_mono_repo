import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme';

type CompeticionTab = 'disponibles' | 'inscritas';

type CompeticionItem = {
  id: string;
  type: string;
  sport: string;
  title: string;
  price: string;
  date: string;
  location: string;
  filled: number;
  total: number;
  level: string;
  accentColor: string;
};

function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function CompeticionesScreen() {
  const [activeTab, setActiveTab] = useState<CompeticionTab>('disponibles');

  // TODO: reemplazar por datos de API (ej. useCompetitions)
  const disponiblesItems: CompeticionItem[] = [];
  const inscritasItems: CompeticionItem[] = [];

  const items = activeTab === 'disponibles' ? disponiblesItems : inscritasItems;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.segmented}>
        <Pressable
          style={({ pressed }) => [
            styles.segmentedBtn,
            activeTab === 'disponibles' && styles.segmentedBtnActive,
            pressed && styles.pressed,
          ]}
          onPress={() => setActiveTab('disponibles')}
        >
          <Text
            style={[
              styles.segmentedText,
              activeTab === 'disponibles' && styles.segmentedTextActive,
            ]}
          >
            Disponibles ({disponiblesItems.length})
          </Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.segmentedBtn,
            activeTab === 'inscritas' && styles.segmentedBtnActive,
            pressed && styles.pressed,
          ]}
          onPress={() => setActiveTab('inscritas')}
        >
          <Text
            style={[
              styles.segmentedText,
              activeTab === 'inscritas' && styles.segmentedTextActive,
            ]}
          >
            Inscritas ({inscritasItems.length})
          </Text>
        </Pressable>
      </View>

      <View style={styles.list}>
        {items.length > 0 ? (
          items.map((item) => (
            <Pressable
              key={item.id}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <View style={[styles.cardBar, { backgroundColor: item.accentColor }]} />
              <View style={styles.cardContent}>
                <View style={styles.cardHeader}>
                  <View style={[styles.cardIcon, { backgroundColor: withAlpha(item.accentColor, 0.08) }]}>
                    <Ionicons name="trophy" size={24} color={item.accentColor} />
                  </View>
                  <View style={styles.cardHeaderBody}>
                    <View style={styles.cardMeta}>
                      <View
                        style={[
                          styles.cardTypeBadge,
                          { backgroundColor: withAlpha(item.accentColor, 0.08) },
                        ]}
                      >
                        <Text
                          style={[styles.cardTypeText, { color: item.accentColor }]}
                        >
                          {item.type}
                        </Text>
                      </View>
                      <Text style={styles.cardSport}>{item.sport}</Text>
                    </View>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                  </View>
                  <Text style={[styles.cardPrice, { color: item.accentColor }]}>
                    {item.price}
                  </Text>
                </View>
                <View style={styles.cardInfo}>
                  <View style={styles.cardInfoItem}>
                    <Ionicons name="calendar-outline" size={12} color="#9ca3af" />
                    <Text style={styles.cardInfoText}>{item.date}</Text>
                  </View>
                  <View style={styles.cardInfoItem}>
                    <Ionicons name="location-outline" size={12} color="#9ca3af" />
                    <Text style={styles.cardInfoText} numberOfLines={1}>
                      {item.location}
                    </Text>
                  </View>
                </View>
                <View style={styles.cardProgress}>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${(item.filled / item.total) * 100}%`,
                          backgroundColor: item.accentColor,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.progressText}>
                    {item.filled}/{item.total}
                  </Text>
                  <View style={styles.levelBadge}>
                    <Text style={styles.levelText}>{item.level}</Text>
                  </View>
                </View>
              </View>
            </Pressable>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              {activeTab === 'disponibles'
                ? 'No hay competiciones disponibles'
                : 'No tienes competiciones inscritas'}
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  content: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.scrollBottomPadding,
  },
  segmented: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    marginBottom: theme.spacing.md,
  },
  segmentedBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentedBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  segmentedText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    color: '#6b7280',
  },
  segmentedTextActive: {
    color: '#1A1A1A',
  },
  pressed: { opacity: 0.9 },
  list: {
    gap: theme.spacing.sm,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    overflow: 'hidden',
  },
  cardBar: {
    height: 4,
  },
  cardContent: {
    padding: theme.spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderBody: {
    flex: 1,
    minWidth: 0,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  cardTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  cardTypeText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  cardSport: {
    fontSize: 10,
    color: '#9ca3af',
  },
  cardTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  cardPrice: {
    fontSize: theme.fontSize.base,
    fontWeight: '700',
  },
  cardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  cardInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardInfoText: {
    fontSize: theme.fontSize.xs,
    color: '#9ca3af',
  },
  cardProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    backgroundColor: '#f3f4f6',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 10,
    color: '#9ca3af',
    fontWeight: '500',
  },
  levelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#f9fafb',
    borderRadius: 6,
  },
  levelText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#6b7280',
  },
  emptyState: {
    paddingVertical: theme.spacing.xxl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: theme.fontSize.sm,
    color: '#9ca3af',
  },
});
