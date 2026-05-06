import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../contexts/AuthContext';
import { fetchPublicPlayerProfile, type PublicPlayerProfile } from '../api/players';
import { theme } from '../theme';
import { AICoachSection } from '../components/profile/AICoachSection';

type PublicProfileScreenProps = {
  playerId: string;
  onBack: () => void;
  onChatPress?: (playerId: string, name: string) => void;
};

function getInitials(firstName?: string | null, lastName?: string | null): string {
  if (firstName && lastName) return (firstName[0] + lastName[0]).toUpperCase();
  if (firstName) return firstName.substring(0, 2).toUpperCase();
  return '??';
}

export function PublicProfileScreen({ playerId, onBack, onChatPress }: PublicProfileScreenProps) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [profile, setProfile] = useState<PublicPlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchPublicPlayerProfile(playerId, session?.access_token)
      .then((p) => {
        setProfile(p);
      })
      .finally(() => setLoading(false));
  }, [playerId, session?.access_token]);

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color="#F18F34" size="large" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>No se pudo cargar el perfil.</Text>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Volver</Text>
        </Pressable>
      </View>
    );
  }

  const initials = getInitials(profile.firstName, profile.lastName);
  const displayName = `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim() || 'Jugador';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.headerContent}>
          <Pressable onPress={onBack} style={styles.headerIconBtn}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>Perfil de {profile.firstName}</Text>
          <Pressable 
            onPress={() => onChatPress?.(profile.id, displayName)} 
            style={styles.headerIconBtn}
          >
            <Ionicons name="chatbubble-outline" size={24} color="#fff" />
          </Pressable>
        </View>
      </View>

      <ScrollView 
        style={styles.scroll} 
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Cover Photo */}
        <View style={styles.coverWrap}>
          <Image 
            source={{ uri: 'https://images.unsplash.com/photo-1657704358775-ed705c7388d2?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwYWRlbCUyMHNwb3J0JTIwcmFja2V0JTIwY291cnR8ZW58MXx8fHwxNzczNjEwMzA3fDA&ixlib=rb-4.1.0&q=80&w=1080' }} 
            style={styles.coverImg} 
          />
          <LinearGradient 
            colors={['rgba(15,15,15,0.6)', 'transparent', '#0F0F0F']} 
            style={StyleSheet.absoluteFill} 
          />
        </View>

        {/* Profile Card */}
        <View style={styles.profileCardWrap}>
          <View style={styles.profileCard}>
            <View style={styles.eloBadge}>
              <Text style={styles.eloLabel}>NIVEL</Text>
              <Text style={styles.eloValue}>
                {profile.eloRating?.toFixed(2) ?? '--'}
              </Text>
            </View>
            <View style={styles.profileHeader}>
              <View style={styles.avatarContainer}>
                {profile.avatarUrl ? (
                  <Image source={{ uri: profile.avatarUrl }} style={styles.avatarImg} />
                ) : (
                  <LinearGradient colors={['#F18F34', '#E95F32']} style={styles.avatar}>
                    <Text style={styles.avatarText}>{initials}</Text>
                  </LinearGradient>
                )}
              </View>
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{displayName}</Text>
                <View style={styles.genderRow}>
                  <Ionicons 
                    name={profile.gender === 'female' ? 'woman-outline' : 'man-outline'} 
                    size={12} 
                    color="#6B7280" 
                  />
                  <Text style={styles.genderText}>
                    {profile.gender === 'female' ? 'Jugadora' : 'Jugador'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Stats Row */}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{profile.mmWins + profile.mmLosses + profile.mmDraws}</Text>
                <Text style={styles.statLabel}>PARTIDOS</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{profile.mmWins}</Text>
                <Text style={styles.statLabel}>VICTORIAS</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{profile.sp}</Text>
                <Text style={styles.statLabel}>SP</Text>
              </View>
            </View>

            {/* Liga MM */}
            {profile.liga && (
              <View style={styles.ligaBox}>
                <LinearGradient 
                  colors={['rgba(241,143,52,0.1)', 'transparent']} 
                  style={styles.ligaGradient}
                  start={{x:0, y:0.5}} end={{x:1, y:0.5}}
                />
                <Ionicons name="trophy-outline" size={16} color="#F18F34" />
                <Text style={styles.ligaText}>
                  Liga Matchmaking: <Text style={styles.ligaName}>{profile.liga.toUpperCase()}</Text>
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* AI Coach / Radar Section */}
        {profile.coachAssessment ? (
          <AICoachSection 
            assessment={profile.coachAssessment} 
            peerInsight={null} // Only show base assessment for others
          />
        ) : (
          <View style={styles.emptyCardContainer}>
            <View style={styles.emptyCard}>
              <Ionicons name="analytics-outline" size={24} color="#374151" />
              <Text style={styles.emptyCardText}>Este jugador aún no ha completado su nivelación de Coach IA.</Text>
            </View>
          </View>
        )}

        {/* Recent Matches */}
        {profile.recentMatches?.length > 0 && (
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>Últimos Partidos</Text>
            {profile.recentMatches.map((m: any, idx: number) => (
              <View key={m.match_id} style={[styles.matchItem, idx === profile.recentMatches.length -1 && { borderBottomWidth: 0 }]}>
                <View style={styles.matchInfo}>
                  <Text style={styles.matchDate}>
                    {new Date(m.matches.start_at).toLocaleDateString()}
                  </Text>
                  <Text style={styles.matchType}>
                    {m.matches.match_type === 'matchmaking' ? 'Competición' : 'Amistoso'}
                  </Text>
                </View>
                <View style={[
                  styles.resultBadge, 
                  m.result === 'win' ? styles.resultWin : m.result === 'loss' ? styles.resultLoss : styles.resultDraw
                ]}>
                  <Text style={styles.resultText}>
                    {m.result === 'win' ? 'VICTORIA' : m.result === 'loss' ? 'DERROTA' : 'EMPATE'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    zIndex: 100,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerIconBtn: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginHorizontal: 10,
  },
  scroll: {
    flex: 1,
  },
  coverWrap: {
    position: 'relative',
    height: 140,
  },
  coverImg: {
    width: '100%',
    height: '100%',
  },
  profileCardWrap: {
    paddingHorizontal: 16,
    marginTop: -40,
    zIndex: 10,
  },
  profileCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 20,
    position: 'relative',
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 20,
  },
  avatarContainer: {
    // No margin top needed here if card is relative
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: {
    width: 72,
    height: 72,
    borderRadius: 20,
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  genderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  genderText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  eloBadge: {
    position: 'absolute',
    top: -20,
    right: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#F18F34',
    alignItems: 'center',
    shadowColor: '#F18F34',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  eloLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    opacity: 0.8,
  },
  eloValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  statLabel: {
    fontSize: 10,
    color: '#6B7280',
    fontWeight: '600',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  ligaBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: 'rgba(241,143,52,0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(241,143,52,0.1)',
    overflow: 'hidden',
  },
  ligaGradient: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 100,
  },
  ligaText: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  ligaName: {
    color: '#F18F34',
    fontWeight: '700',
  },
  emptyCardContainer: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  emptyCard: {
    padding: 30,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    gap: 12,
  },
  emptyCardText: {
    color: '#4B5563',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  sectionContainer: {
    paddingHorizontal: 16,
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  matchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  matchInfo: {
    gap: 2,
  },
  matchDate: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
  matchType: {
    fontSize: 12,
    color: '#6B7280',
  },
  resultBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  resultWin: { backgroundColor: 'rgba(16, 185, 129, 0.15)' },
  resultLoss: { backgroundColor: 'rgba(239, 68, 68, 0.15)' },
  resultDraw: { backgroundColor: 'rgba(107, 114, 128, 0.15)' },
  resultText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  errorText: {
    color: '#EF4444',
    marginBottom: 20,
  },
  backBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: '#F18F34',
    borderRadius: 10,
  },
  backBtnText: {
    color: '#fff',
    fontWeight: '600',
  },
});
