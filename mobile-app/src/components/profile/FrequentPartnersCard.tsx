import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AvatarWithFrame } from './AvatarWithFrame';
import type { FrequentPartner } from '../../api/profileSocial';

interface Props {
  title: string;
  partners: FrequentPartner[];
  loading?: boolean;
  onOpenPlayer?: (playerId: string) => void;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? '';
  const b = parts[1]?.[0] ?? '';
  return (a + b).toUpperCase() || '?';
}

/** Card horizontal de personas con las que el jugador suele jugar (avatar + nombre + nº). */
export const FrequentPartnersCard: React.FC<Props> = ({ title, partners, loading, onOpenPlayer }) => {
  if (!loading && partners.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Ionicons name="people-outline" size={16} color="#F18F34" />
        <Text style={styles.title}>{title}</Text>
      </View>
      {loading && partners.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator color="#F18F34" />
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {partners.map((p) => (
            <Pressable key={p.id} style={styles.cardItem} onPress={() => onOpenPlayer?.(p.id)}>
              <AvatarWithFrame avatarUrl={p.avatarUrl} initials={initialsOf(p.name)} size={56} frame={p.frame ?? null} animate={false} />
              <Text style={styles.name} numberOfLines={1}>
                {p.name}
              </Text>
              <Text style={styles.count}>{p.count} {p.count === 1 ? 'partido' : 'partidos'}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginTop: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginBottom: 10 },
  title: { fontSize: 14, fontWeight: 'bold', color: '#fff' },
  loading: { height: 110, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 16, gap: 12 },
  cardItem: {
    width: 92,
    alignItems: 'center',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  name: { fontSize: 12, fontWeight: '700', color: '#fff', marginTop: 8, maxWidth: 80, textAlign: 'center' },
  count: { fontSize: 10, color: '#6B7280', marginTop: 2 },
});
