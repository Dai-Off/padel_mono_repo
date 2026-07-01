import { useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import { acceptPairInvite, rejectPairInvite, type PairInvite } from '../../api/matchmaking';

const ACCENT = theme.auth.accent;

type Props = {
  invites: PairInvite[];
  /** Tras cualquier acción, refrescar el estado (re-poll). */
  onChanged: () => void;
  /** Tras aceptar, llevar al usuario a buscar partido con ese compañero. */
  onAcceptAndSearch?: (invite: PairInvite) => void;
};

/**
 * Banner en Home: invitaciones de pareja RECIBIDAS pendientes (entrega in-app por polling).
 * Tarjeta oscura con acento naranja (icono/borde + CTA "Aceptar"), para no chocar con el
 * banner naranja de búsqueda activa.
 */
export function PairInviteBanner({ invites, onChanged, onAcceptAndSearch }: Props) {
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

  // Aceptar y, si va bien, llevar a buscar partido con ese compañero.
  const acceptAndSearch = async () => {
    if (busy) return;
    setBusy(true);
    const res = await acceptPairInvite(invite.id, token);
    setBusy(false);
    if (!res.ok) {
      if (res.error) Alert.alert(t('competitive.common.couldNot'), res.error);
      onChanged();
      return;
    }
    onAcceptAndSearch?.(invite);
    onChanged();
  };

  return (
    <View style={styles.card}>
      {pending.length > 1 ? (
        <Text style={styles.countNote}>{t('competitive.banner.count', { n: pending.length })}</Text>
      ) : null}
      <View style={styles.row}>
        {invite.other_player_avatar ? (
          <Image source={{ uri: invite.other_player_avatar }} style={styles.avatarImg} />
        ) : (
          <View style={styles.iconWrap}>
            <Ionicons name="people" size={18} color={ACCENT} />
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
        {busy ? <ActivityIndicator color={ACCENT} /> : null}
      </View>

      <View style={styles.actions}>
        <Pressable
          style={[styles.btn, styles.btnGhost]}
          disabled={busy}
          onPress={() => void run(() => rejectPairInvite(invite.id, token))}
        >
          <Text style={styles.btnGhostText}>{t('competitive.banner.reject')}</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.btnPrimary]} disabled={busy} onPress={() => void acceptAndSearch()}>
          <Text style={styles.btnPrimaryText}>{t('competitive.banner.acceptSearch')}</Text>
        </Pressable>
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
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  btn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  btnGhost: { backgroundColor: '#262626' },
  btnGhostText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  btnPrimary: { backgroundColor: ACCENT },
  btnPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
