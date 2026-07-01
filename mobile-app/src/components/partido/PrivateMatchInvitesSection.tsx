import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  dismissMatchInvite,
  fetchMatchInvites,
  resendMatchInvite,
  sendMatchPlayerInvites,
  skipReasonLabel,
  type MatchInviteRow,
} from '../../api/matchInvites';
import {
  inviteOccupiesGuestSlot,
  invitePlayerLabel,
  inviteStatusMeta,
  mergeInviteLists,
  mergeServerInvitesWithOptimistic,
  optimisticInviteFromPlayer,
} from '../../lib/matchInviteDisplay';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import { theme } from '../../theme';
import { LoadingButton } from '../ui/PrimaryLoadingButton';
import { PrivateInvitePlayerPicker, type SelectedInvitePlayer } from './PrivateInvitePlayerPicker';

type Props = {
  matchId: string;
  organizerPlayerId: string;
  playerIdsInMatch: string[];
  onSearchFocus?: () => void;
};

function inviteIcon(inv: MatchInviteRow): { name: keyof typeof Ionicons.glyphMap; color: string } {
  if (inv.joined_slot_index != null) {
    return { name: 'checkmark-circle', color: '#22c55e' };
  }
  if (inv.status === 'rejected') {
    return { name: 'close-circle', color: '#f87171' };
  }
  if (inv.status === 'expired') {
    return { name: 'time-outline', color: '#fbbf24' };
  }
  if (inv.status === 'pending') {
    return { name: 'notifications-outline', color: theme.auth.accent };
  }
  if (inv.status === 'accepted') {
    return { name: 'card-outline', color: '#60a5fa' };
  }
  return { name: 'help-circle-outline', color: theme.auth.textMuted };
}

export function PrivateMatchInvitesSection({
  matchId,
  organizerPlayerId,
  playerIdsInMatch,
  onSearchFocus,
}: Props) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const [invites, setInvites] = useState<MatchInviteRow[]>([]);
  const [capacityRemaining, setCapacityRemaining] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [selected, setSelected] = useState<SelectedInvitePlayer[]>([]);
  const [sending, setSending] = useState(false);
  const [actionInviteId, setActionInviteId] = useState<string | null>(null);

  const loadInvites = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setInitialLoading(true);
      const res = await fetchMatchInvites(matchId, session?.access_token);
      if (res.ok) {
        setInvites((prev) => mergeServerInvitesWithOptimistic(prev, res.invites));
        setCapacityRemaining(res.capacity_remaining ?? 0);
      }
      if (!opts?.silent) setInitialLoading(false);
    },
    [matchId, session?.access_token],
  );

  useEffect(() => {
    void loadInvites();
  }, [loadInvites]);

  const excludePlayerIds = useMemo(() => {
    const ids = new Set<string>([organizerPlayerId, ...playerIdsInMatch]);
    for (const inv of invites) {
      if (inv.status === 'pending' || inv.status === 'accepted') {
        if (inv.invited_player_id) ids.add(inv.invited_player_id);
      }
    }
    return [...ids];
  }, [organizerPlayerId, playerIdsInMatch, invites]);

  const canAddMore = capacityRemaining > 0;

  const runInviteAction = async (
    invite: MatchInviteRow,
    kind: 'resend' | 'dismiss' | 'revoke',
  ) => {
    if (actionInviteId) return;
    if (invite.id.startsWith('pending-')) {
      Alert.alert(t('alerts.error.title'), t('partidos.privateInviteErrStillSending'));
      return;
    }

    const snapshot = { invites, capacityRemaining };
    setActionInviteId(invite.id);

    if (kind === 'dismiss' || kind === 'revoke') {
      setInvites((prev) => prev.filter((i) => i.id !== invite.id));
      if (inviteOccupiesGuestSlot(invite)) {
        setCapacityRemaining((c) => c + 1);
      }
    } else {
      setInvites((prev) =>
        prev.map((i) =>
          i.id === invite.id
            ? {
                ...i,
                status: 'pending',
                can_resend: false,
                can_revoke: true,
                can_dismiss: false,
              }
            : i,
        ),
      );
    }

    const token = session?.access_token;
    const res =
      kind === 'resend'
        ? await resendMatchInvite(matchId, invite.id, token)
        : await dismissMatchInvite(matchId, invite.id, token);

    if (!res.ok) {
      setActionInviteId(null);
      setInvites(snapshot.invites);
      setCapacityRemaining(snapshot.capacityRemaining);
      Alert.alert(t('alerts.error.title'), res.error);
      return;
    }

    await loadInvites({ silent: true });
    setActionInviteId(null);
  };

  const handleSend = async () => {
    if (!selected.length || sending) return;

    const playersToSend = [...selected];
    const snapshot = { invites, capacityRemaining, selected: playersToSend };

    const optimisticRows = playersToSend.map((p) => optimisticInviteFromPlayer(matchId, p));
    setInvites((prev) => mergeInviteLists(prev, optimisticRows));
    setCapacityRemaining((c) => Math.max(0, c - playersToSend.length));
    setSelected([]);
    setSending(true);

    const res = await sendMatchPlayerInvites(
      matchId,
      playersToSend.map((p) => p.id),
      session?.access_token,
    );
    setSending(false);

    if (!res.ok) {
      setInvites(snapshot.invites);
      setCapacityRemaining(snapshot.capacityRemaining);
      setSelected(snapshot.selected);
      Alert.alert(t('alerts.error.title'), res.error);
      return;
    }

    if (res.invites && res.invites.length > 0) {
      setInvites((prev) => {
        const merged = mergeInviteLists(prev, res.invites!);
        const confirmedPlayerIds = new Set(
          res.invites!
            .map((i) => i.invited_player_id)
            .filter((id): id is string => Boolean(id)),
        );
        return merged.filter(
          (inv) =>
            !inv.id.startsWith('pending-') ||
            !confirmedPlayerIds.has(inv.invited_player_id ?? ''),
        );
      });
    }

    void loadInvites({ silent: true });

    const skippedMsg = res.skipped.map((s) => `${s.target}: ${skipReasonLabel(s.reason, t)}`).join('\n');
    const parts = [
      res.created > 0 ? t('partidos.privateInviteSentSummary', { count: res.created }) : null,
      (res.reactivated ?? 0) > 0
        ? t('partidos.privateInviteReactivatedSummary', { count: res.reactivated ?? 0 })
        : null,
      skippedMsg || null,
    ].filter(Boolean) as string[];
    if (parts.length > 0) {
      Alert.alert(t('partidos.privateInviteSentTitle'), parts.join('\n'));
    }
  };

  const showEmptyHint = !initialLoading && invites.length === 0;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{t('partidos.createPrivateInvitesSection')}</Text>
      <Text style={styles.hint}>{t('partidos.privateInviteManageInDetail')}</Text>

      {initialLoading ? (
        <ActivityIndicator color={theme.auth.accent} style={styles.loader} />
      ) : (
        <>
          {showEmptyHint ? (
            <Text style={styles.empty}>{t('partidos.privateInviteNoneYet')}</Text>
          ) : null}
          {invites.map((inv) => {
            const icon = inviteIcon(inv);
            const rowBusy = actionInviteId === inv.id;
            const actionsDisabled = actionInviteId != null;
            return (
              <View key={inv.id} style={[styles.inviteRow, rowBusy && styles.inviteRowBusy]}>
                {rowBusy ? (
                  <ActivityIndicator size="small" color={theme.auth.accent} style={styles.rowSpinner} />
                ) : (
                  <Ionicons name={icon.name} size={20} color={icon.color} />
                )}
                <View style={styles.inviteMain}>
                  <Text style={styles.inviteName}>{invitePlayerLabel(inv)}</Text>
                  <Text style={styles.inviteMeta}>{inviteStatusMeta(inv, t)}</Text>
                  {(inv.can_resend || inv.can_revoke || inv.can_dismiss) && (
                    <View style={styles.inviteActions}>
                      {inv.can_resend ? (
                        <Pressable
                          style={styles.linkBtn}
                          disabled={actionsDisabled}
                          onPress={() => void runInviteAction(inv, 'resend')}
                        >
                          <Text style={[styles.linkBtnText, actionsDisabled && styles.linkDisabled]}>
                            {t('partidos.privateInviteResend')}
                          </Text>
                        </Pressable>
                      ) : null}
                      {inv.can_revoke ? (
                        <Pressable
                          style={styles.linkBtn}
                          disabled={actionsDisabled}
                          onPress={() => void runInviteAction(inv, 'revoke')}
                        >
                          <Text style={[styles.linkBtnMuted, actionsDisabled && styles.linkDisabled]}>
                            {t('partidos.privateInviteRevoke')}
                          </Text>
                        </Pressable>
                      ) : null}
                      {inv.can_dismiss ? (
                        <Pressable
                          style={styles.linkBtn}
                          disabled={actionsDisabled}
                          onPress={() => void runInviteAction(inv, 'dismiss')}
                        >
                          <Text style={[styles.linkBtnMuted, actionsDisabled && styles.linkDisabled]}>
                            {t('partidos.privateInviteDismiss')}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </>
      )}

      {canAddMore ? (
        <>
          <PrivateInvitePlayerPicker
            selected={selected}
            onSelectedChange={setSelected}
            accessToken={session?.access_token}
            excludePlayerIds={excludePlayerIds}
            onSearchFocus={onSearchFocus}
          />
          {selected.length > 0 ? (
            <LoadingButton
              variant="primary"
              label={t('partidos.privateInviteSendBtn')}
              loading={sending}
              disabled={actionInviteId != null}
              onPress={() => void handleSend()}
            />
          ) : null}
        </>
      ) : (
        <Text style={styles.fullHint}>{t('partidos.privateInviteAllSlots')}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 6,
  },
  hint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 18,
    marginBottom: 12,
  },
  loader: { marginVertical: 12 },
  empty: { fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 8 },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  inviteRowBusy: { opacity: 0.7 },
  rowSpinner: { width: 20, height: 20 },
  inviteMain: { flex: 1, minWidth: 0 },
  inviteName: { fontSize: 14, fontWeight: '600', color: '#fff' },
  inviteMeta: { fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 2, lineHeight: 17 },
  inviteActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  linkBtn: { paddingVertical: 2 },
  linkBtnText: { fontSize: 13, fontWeight: '700', color: theme.auth.accent },
  linkBtnMuted: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.55)' },
  linkDisabled: { opacity: 0.35 },
  fullHint: { fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 8 },
});
