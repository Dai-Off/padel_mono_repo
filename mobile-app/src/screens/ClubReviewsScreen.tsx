import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  fetchEligibleClubReviews,
  type EligibleClubReviewItem,
  type MyClubReview,
} from '../api/clubReviews';
import { ClubReviewModal } from '../components/clubs/ClubReviewModal';
import { MenuScreenHeader } from '../components/menuScreen/MenuScreenHeader';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../i18n';
import { theme } from '../theme';

type Props = {
  onBack: () => void;
};

export function ClubReviewsScreen({ onBack }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const token = session?.access_token;
  const [loading, setLoading] = useState(true);
  const [clubs, setClubs] = useState<EligibleClubReviewItem[]>([]);
  const [selectedClub, setSelectedClub] = useState<EligibleClubReviewItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const loadClubs = useCallback(async () => {
    if (!token) {
      setClubs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const data = await fetchEligibleClubReviews(token);
    setClubs(data);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    void loadClubs();
  }, [loadClubs]);

  const openClub = (club: EligibleClubReviewItem) => {
    if (!token) {
      Alert.alert(t('alerts.login.titleAlt'), t('search.clubReviewsLogin'));
      return;
    }
    if (!club.can_review && !club.review) {
      Alert.alert(
        t('alerts.clubReviews.notYet.title'),
        t('search.clubReviewsNotYetBody'),
      );
      return;
    }
    setSelectedClub(club);
    setModalOpen(true);
  };

  const handleSaved = (review: MyClubReview | null) => {
    if (!selectedClub) return;
    setClubs((prev) =>
      prev.map((c) =>
        c.club_id === selectedClub.club_id
          ? { ...c, review, can_review: review != null || c.can_review }
          : c,
      ),
    );
    void loadClubs();
  };

  return (
    <View style={styles.container}>
      <MenuScreenHeader title={t('search.reviewRate')} onBack={onBack} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 + (insets.bottom ?? 0) }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.intro}>{t('search.clubReviewsNotYetBody')}</Text>

        {loading ? (
          <ActivityIndicator color={theme.auth.accent} style={styles.loader} />
        ) : clubs.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="star-outline" size={32} color="#6b7280" />
            <Text style={styles.emptyTitle}>{t('search.clubReviewsNotYet')}</Text>
            <Text style={styles.emptyText}>{t('search.clubReviewsNotYetBody')}</Text>
          </View>
        ) : (
          clubs.map((club) => (
            <Pressable
              key={club.club_id}
              onPress={() => openClub(club)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <View style={styles.rowIcon}>
                <Ionicons name="business-outline" size={20} color={theme.auth.accent} />
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>{club.name}</Text>
                {club.city ? <Text style={styles.rowSub}>{club.city}</Text> : null}
              </View>
              <View style={styles.rowEnd}>
                {club.review ? (
                  <Text style={styles.stars}>{'★'.repeat(club.review.rating)}</Text>
                ) : club.can_review ? (
                  <Text style={styles.pending}>{t('search.reviewRate')}</Text>
                ) : null}
                <Ionicons name="chevron-forward" size={16} color="#6b7280" />
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>

      {selectedClub ? (
        <ClubReviewModal
          visible={modalOpen}
          clubId={selectedClub.club_id}
          clubName={selectedClub.name}
          accessToken={token}
          existingReview={selectedClub.review}
          onClose={() => {
            setModalOpen(false);
            setSelectedClub(null);
          }}
          onSaved={handleSaved}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 12 },
  intro: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 20,
    marginBottom: 16,
  },
  loader: { marginTop: 32 },
  empty: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.auth.text,
  },
  emptyText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 16,
    marginBottom: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  rowPressed: { opacity: 0.85 },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(241,143,52,0.15)',
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: theme.auth.text },
  rowSub: { fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 2 },
  rowEnd: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stars: { fontSize: 12, color: '#fbbf24' },
  pending: { fontSize: 12, fontWeight: '600', color: theme.auth.accent },
});
