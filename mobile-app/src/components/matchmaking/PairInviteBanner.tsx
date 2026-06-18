import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { acceptPairInvite, rejectPairInvite, type PairInvite } from '../../api/matchmaking';

const ACCENT = theme.auth.accent;

type Props = {
  invites: PairInvite[];
  /** Tras cualquier acción, refrescar el estado (re-poll). */
  onChanged: () => void;
};

/**
 * Banner en Home: invitaciones de pareja RECIBIDAS pendientes (entrega in-app por polling).
 * Aceptar/Rechazar; tras aceptar, la pareja queda lista y se busca desde "Jugar con un amigo".
 */
export function PairInviteBanner({ invites, onChanged }: Props) {
  const { session } = useAuth();
  const token = session?.access_token ?? null;
  const [busy, setBusy] = useState(false);

  const invite = invites.find((i) => i.role === 'invitee' && i.status === 'pending');
  if (!invite) return null;

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    if (busy) return;
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok && res.error) Alert.alert('No se pudo', res.error);
    onChanged();
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.iconWrap}>
          <Ionicons name="people" size={18} color={ACCENT} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={2}>
            {invite.other_player_name} te invita a competitiva
          </Text>
          <Text style={styles.sub} numberOfLines={2}>
            Si aceptas, podréis buscar partido juntos desde "Jugar con un amigo"
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
          <Text style={styles.btnGhostText}>Rechazar</Text>
        </Pressable>
        <Pressable
          style={[styles.btn, styles.btnPrimary]}
          disabled={busy}
          onPress={() => void run(() => acceptPairInvite(invite.id, token))}
        >
          <Text style={styles.btnPrimaryText}>Aceptar</Text>
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
