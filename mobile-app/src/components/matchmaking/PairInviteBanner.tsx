import { useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import { acceptPairInvite, rejectPairInvite, type PairInvite } from '../../api/matchmaking';

type Props = {
  invites: PairInvite[];
  /** Tras cualquier acción, refrescar el estado (re-poll). */
  onChanged: () => void;
};

/**
 * Banner en Home: invitaciones de pareja RECIBIDAS pendientes (entrega in-app por polling).
 * Naranja para destacar como el resto de banners del Home (búsqueda/onboarding).
 */
export function PairInviteBanner({ invites, onChanged }: Props) {
  const { session } = useAuth();
  const { t } = useTranslation();
  const token = session?.access_token ?? null;
  const [busy, setBusy] = useState(false);

  const pending = invites.filter((i) => i.role === 'invitee' && i.status === 'pending');
  const invite = pending[0];
  if (!invite) return null;

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    if (busy) return;
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok && res.error) Alert.alert(t('competitive.common.couldNot'), res.error);
    onChanged();
  };

  return (
    <LinearGradient
      colors={['#F18F34', '#C46A20']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      {pending.length > 1 ? (
        <Text style={styles.countNote}>{t('competitive.banner.count', { n: pending.length })}</Text>
      ) : null}
      <View style={styles.row}>
        {invite.other_player_avatar ? (
          <Image source={{ uri: invite.other_player_avatar }} style={styles.avatarImg} />
        ) : (
          <View style={styles.iconWrap}>
            <Ionicons name="people" size={18} color="#fff" />
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={2}>
            {t('competitive.banner.invitesYou', { name: invite.other_player_name })}
          </Text>
          <Text style={styles.sub} numberOfLines={2}>
            {t('competitive.banner.sub')}
          </Text>
        </View>
        {busy ? <ActivityIndicator color="#fff" /> : null}
      </View>

      <View style={styles.actions}>
        <Pressable
          style={[styles.btn, styles.btnGhost]}
          disabled={busy}
          onPress={() => void run(() => rejectPairInvite(invite.id, token))}
        >
          <Text style={styles.btnGhostText}>{t('competitive.banner.reject')}</Text>
        </Pressable>
        <Pressable
          style={[styles.btn, styles.btnPrimary]}
          disabled={busy}
          onPress={() => void run(() => acceptPairInvite(invite.id, token))}
        >
          <Text style={styles.btnPrimaryText}>{t('competitive.banner.accept')}</Text>
        </Pressable>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    padding: 14,
    gap: 12,
  },
  countNote: {
    alignSelf: 'flex-start',
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  avatarImg: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: '#fff', fontSize: 15, fontWeight: '800' },
  sub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  btn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  btnGhost: {
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  btnGhostText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  btnPrimary: { backgroundColor: '#fff' },
  btnPrimaryText: { color: '#C46A20', fontSize: 14, fontWeight: '800' },
});
