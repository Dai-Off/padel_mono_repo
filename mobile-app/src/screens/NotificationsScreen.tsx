import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchReceivedMatchInvites,
  rejectReceivedMatchInvite,
  type ReceivedMatchInvite,
} from '../api/matchInvites';
import { BackHeader } from '../components/layout/BackHeader';
import { LoadingButton } from '../components/ui/PrimaryLoadingButton';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../i18n';
import { theme } from '../theme';

type Props = {
  onBack: () => void;
  onOpenMatch?: (invite: ReceivedMatchInvite) => void | Promise<void>;
};

export function NotificationsScreen({ onBack, onOpenMatch }: Props) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const token = session?.access_token ?? null;
  const [invites, setInvites] = useState<ReceivedMatchInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setInvites([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const res = await fetchReceivedMatchInvites(token);
    if (res.ok) setInvites(res.invites);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const reject = async (invite: ReceivedMatchInvite) => {
    if (!token || busyId || openingId) return;
    setBusyId(invite.id);
    const res = await rejectReceivedMatchInvite(invite.id, token);
    setBusyId(null);
    if (!res.ok) Alert.alert(t('alerts.error.title'), res.error);
    await load();
  };

  const viewMatch = async (invite: ReceivedMatchInvite) => {
    if (!onOpenMatch || openingId) return;
    setOpeningId(invite.id);
    try {
      await onOpenMatch(invite);
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom }]}>
      <BackHeader title={t('partidos.notificationsTitle')} onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator color={theme.auth.accent} style={{ marginTop: 24 }} />
        ) : invites.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="notifications-off-outline" size={40} color={theme.auth.textMuted} />
            <Text style={styles.emptyTitle}>{t('partidos.notificationsEmpty')}</Text>
          </View>
        ) : (
          invites.map((invite) => (
            <View key={invite.id} style={styles.card}>
              <View style={styles.cardTop}>
                {invite.inviter_avatar_url ? (
                  <Image source={{ uri: invite.inviter_avatar_url }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Ionicons name="person" size={18} color="#9ca3af" />
                  </View>
                )}
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle}>
                    {t('partidos.matchInviteBannerTitle', { name: invite.inviter_name })}
                  </Text>
                  <Text style={styles.cardSub}>
                    {t('partidos.matchInviteBannerSub', {
                      when: invite.match_when,
                      club: invite.club_name,
                    })}
                  </Text>
                  <Text style={styles.cardMeta}>
                    {t('partidos.privateInviteMetaPending')}
                  </Text>
                </View>
              </View>
              <View style={styles.actions}>
                <LoadingButton
                  variant="ghost"
                  label={t('partidos.matchInviteReject')}
                  loading={busyId === invite.id}
                  disabled={busyId === invite.id || openingId === invite.id}
                  onPress={() => void reject(invite)}
                />
                <LoadingButton
                  variant="primary"
                  label={t('partidos.matchInviteViewMatch')}
                  loading={openingId === invite.id}
                  disabled={busyId === invite.id || openingId === invite.id}
                  onPress={() => void viewMatch(invite)}
                />
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0F0F0F' },
  content: { padding: theme.spacing.lg, gap: 12 },
  empty: { alignItems: 'center', paddingTop: 48, gap: 12 },
  emptyTitle: { color: theme.auth.textMuted, fontSize: 15 },
  card: {
    backgroundColor: '#141414',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 14,
    gap: 12,
  },
  cardTop: { flexDirection: 'row', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1, minWidth: 0 },
  cardTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cardSub: { color: '#9CA3AF', fontSize: 12, marginTop: 4 },
  cardMeta: { color: theme.auth.accent, fontSize: 12, fontWeight: '600', marginTop: 6 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
});
