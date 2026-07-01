import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { FrequentClub } from '../../api/profileSocial';

interface Props {
  title: string;
  clubs: FrequentClub[];
  loading?: boolean;
}

/** Card horizontal de clubs donde el jugador suele jugar (imagen + nombre + nº de partidos). */
export const FrequentClubsCard: React.FC<Props> = ({ title, clubs, loading }) => {
  if (!loading && clubs.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Ionicons name="business-outline" size={16} color="#F18F34" />
        <Text style={styles.title}>{title}</Text>
      </View>
      {loading && clubs.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator color="#F18F34" />
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {clubs.map((c) => (
            <View key={c.id} style={styles.cardItem}>
              {c.image ? (
                <Image source={{ uri: c.image }} style={styles.image} resizeMode="cover" />
              ) : (
                <LinearGradient colors={['#2A2A2A', '#1A1A1A']} style={styles.image}>
                  <Ionicons name="business" size={26} color="#4B5563" />
                </LinearGradient>
              )}
              <View style={styles.info}>
                <Text style={styles.name} numberOfLines={1}>
                  {c.name}
                </Text>
                <Text style={styles.count}>{c.count} {c.count === 1 ? 'partido' : 'partidos'}</Text>
              </View>
            </View>
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
  loading: { height: 120, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 16, gap: 12 },
  cardItem: {
    width: 168,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  image: { width: '100%', height: 96, alignItems: 'center', justifyContent: 'center' },
  info: { padding: 12 },
  name: { fontSize: 14, fontWeight: 'bold', color: '#fff' },
  count: { fontSize: 11, color: '#6B7280', marginTop: 2 },
});
