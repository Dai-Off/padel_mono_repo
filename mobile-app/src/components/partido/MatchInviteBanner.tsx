import { useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { rejectReceivedMatchInvite, type ReceivedMatchInvite } from '../../api/matchInvites';
import { receivedMatchInviteBannerTitle } from '../../lib/matchInviteDisplay';
import { LoadingButton } from '../ui/PrimaryLoadingButton';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import { theme } from '../../theme';

const ACCENT = theme.auth.accent;

type Props = {
  invites: ReceivedMatchInvite[];
  onChanged: () => void;
  /** Abre el detalle del partido (sin aceptar aún; la plaza se confirma al pagar). */
  onViewMatch?: (invite: ReceivedMatchInvite) => void | Promise<void>;
};

export function MatchInviteBanner({ invites, onChanged, onViewMatch }: Props) {
  const { session } = useAuth();
  const { t } = useTranslation();
  const token = session?.access_token ?? null;
  const [opening, setOpening] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const busy = opening || rejecting;

  const invite = invites[0];
  if (!invite) return null;

  const reject = async () => {
    if (busy || !token) return;
    setRejecting(true);
    try {
      const res = await rejectReceivedMatchInvite(invite.id, token);
      if (!res.ok && res.error) Alert.alert(t('alerts.error.title'), res.error);
      onChanged();
    } finally {
      setRejecting(false);
    }
  };

  const viewMatch = async () => {
    if (!onViewMatch || busy) return;
    setOpening(true);
    try {
      await onViewMatch(invite);
    } finally {
      setOpening(false);
    }
  };

  return (
    <View style={styles.card}>
      {invites.length > 1 ? (
        <Text style={styles.countNote}>{t('partidos.matchInviteBannerCount', { n: invites.length })}</Text>
      ) : null}
      <View style={styles.row}>
        {invite.inviter_avatar_url ? (
          <Image source={{ uri: invite.inviter_avatar_url }} style={styles.avatarImg} />
        ) : (
          <View style={styles.iconWrap}>
            <Ionicons name="tennisball" size={18} color={ACCENT} />
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={2}>
            {receivedMatchInviteBannerTitle(invite, t)}
          </Text>
          <Text style={styles.sub} numberOfLines={2}>
            {t('partidos.matchInviteBannerSub', {
              when: invite.match_when,
              club: invite.club_name,
            })}
          </Text>
          {invite.has_schedule_conflict ? (
            <Text style={styles.conflictNote} numberOfLines={3}>
              {t('partidos.matchInviteScheduleConflict')}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.actions}>
        <LoadingButton
          variant="ghost"
          label={t('partidos.matchInviteReject')}
          loading={rejecting}
          disabled={busy}
          onPress={() => void reject()}
        />
        <LoadingButton
          variant="primary"
          label={t('partidos.matchInviteViewMatch')}
          loading={opening}
          disabled={busy}
          onPress={() => void viewMatch()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#141414',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(241,143,52,0.45)',
    padding: 14,
    gap: 12,
  },
  countNote: { alignSelf: 'flex-start', color: ACCENT, fontSize: 12, fontWeight: '800' },
  avatarImg: { width: 40, height: 40, borderRadius: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(241,143,52,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: '#fff', fontSize: 15, fontWeight: '700' },
  sub: { color: '#9CA3AF', fontSize: 12, marginTop: 2 },
  conflictNote: { color: '#fbbf24', fontSize: 12, marginTop: 6, lineHeight: 16 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
});
