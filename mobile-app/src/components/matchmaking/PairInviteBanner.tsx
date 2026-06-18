import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import {
  acceptPairInvite,
  acceptAndSearchPairInvite,
  rejectPairInvite,
  startSearchPairInvite,
  type PairInvite,
} from '../../api/matchmaking';

const ACCENT = theme.auth.accent;

function ligaLabel(l?: string): string {
  return l ? l.charAt(0).toUpperCase() + l.slice(1) : 'el jugador superior';
}

type Props = {
  invites: PairInvite[];
  /** Tras cualquier acción, refrescar el estado (re-poll). */
  onChanged: () => void;
};

/** Banner en Home: invitaciones de pareja accionables (entrega in-app por polling). */
export function PairInviteBanner({ invites, onChanged }: Props) {
  const { session } = useAuth();
  const token = session?.access_token ?? null;
  const [busy, setBusy] = useState(false);

  // Prioriza una invitación recibida pendiente; si no, una mía ya aceptada.
  const invite =
    invites.find((i) => i.role === 'invitee' && i.status === 'pending') ??
    invites.find((i) => i.role === 'inviter' && i.status === 'accepted');
  if (!invite) return null;

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    if (busy) return;
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok && res.error) Alert.alert('No se pudo', res.error);
    onChanged();
  };

  // Antes de buscar, si hay >1 de diferencia de nivel, avisar que se busca al nivel del superior.
  const confirmSearch = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    if ((invite.level_gap ?? 0) > 1) {
      Alert.alert(
        'Partido exigente',
        `Tú y ${invite.other_player_name} tenéis más de un nivel de diferencia. El partido se buscará al nivel de ${ligaLabel(invite.target_liga)} (el del jugador de mayor nivel).`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Buscar igualmente', onPress: () => void run(fn) },
        ],
      );
      return;
    }
    void run(fn);
  };

  const isInvitee = invite.role === 'invitee';

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.iconWrap}>
          <Ionicons name="people" size={18} color={ACCENT} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={2}>
            {isInvitee
              ? `${invite.other_player_name} te invita a competitiva`
              : `${invite.other_player_name} aceptó tu invitación`}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {isInvitee ? 'Jugaríais juntos como pareja' : 'Tocá buscar para encontrar partido juntos'}
          </Text>
        </View>
        {busy ? <ActivityIndicator color={ACCENT} /> : null}
      </View>

      <View style={styles.actions}>
        {isInvitee ? (
          <>
            <Pressable
              style={[styles.btn, styles.btnGhost]}
              disabled={busy}
              onPress={() => void run(() => rejectPairInvite(invite.id, token))}
            >
              <Text style={styles.btnGhostText}>Rechazar</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.btnSecondary]}
              disabled={busy}
              onPress={() => void run(() => acceptPairInvite(invite.id, token))}
            >
              <Text style={styles.btnSecondaryText}>Aceptar</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.btnPrimary]}
              disabled={busy}
              onPress={() => confirmSearch(() => acceptAndSearchPairInvite(invite.id, token))}
            >
              <Text style={styles.btnPrimaryText}>Aceptar y buscar</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            style={[styles.btn, styles.btnPrimary]}
            disabled={busy}
            onPress={() => confirmSearch(() => startSearchPairInvite(invite.id, token))}
          >
            <Text style={styles.btnPrimaryText}>Buscar partido</Text>
          </Pressable>
        )}
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
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' },
  btn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  btnGhost: { backgroundColor: 'transparent' },
  btnGhostText: { color: '#9CA3AF', fontSize: 13, fontWeight: '600' },
  btnSecondary: { backgroundColor: '#262626' },
  btnSecondaryText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  btnPrimary: { backgroundColor: ACCENT },
  btnPrimaryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
