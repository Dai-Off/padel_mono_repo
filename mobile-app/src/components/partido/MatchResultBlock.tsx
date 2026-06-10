import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  classifyPartidoOutcome,
  formatSetsScore,
  outcomeColor,
  outcomeLabel,
} from '../../domain/matchOutcome';
import type { PartidoItem } from '../../screens/PartidosScreen';

type MatchResultBlockProps = {
  partido: PartidoItem;
  compact?: boolean;
};

export function MatchResultBlock({ partido, compact = false }: MatchResultBlockProps) {
  const outcome = classifyPartidoOutcome(partido);
  const hasScore = Array.isArray(partido.sets) && partido.sets.length > 0;
  const scoreText = hasScore ? formatSetsScore(partido.sets!, partido.myTeam) : null;
  const color = outcomeColor(outcome);

  if (outcome === 'cancelled') {
    return (
      <View style={[styles.row, compact && styles.rowCompact]}>
        <Ionicons name="close-circle-outline" size={compact ? 14 : 16} color={color} />
        <Text style={[styles.label, compact && styles.labelCompact, { color }]}>Partido cancelado</Text>
      </View>
    );
  }

  if (!hasScore && outcome === 'incomplete') {
    if (partido.matchPhase !== 'past') return null;
    return (
      <View style={[styles.row, compact && styles.rowCompact]}>
        <Ionicons name="help-circle-outline" size={compact ? 14 : 16} color={color} />
        <Text style={[styles.label, compact && styles.labelCompact, { color }]}>
          Resultado pendiente
        </Text>
      </View>
    );
  }

  if (!scoreText) return null;

  return (
    <View style={[styles.block, compact && styles.blockCompact]}>
      <View style={styles.row}>
        <Ionicons
          name={outcome === 'won' ? 'trophy' : outcome === 'lost' ? 'remove-circle-outline' : 'ellipse-outline'}
          size={compact ? 14 : 16}
          color={color}
        />
        <Text style={[styles.label, compact && styles.labelCompact, { color }]}>
          {outcomeLabel(outcome)}
        </Text>
      </View>
      <Text style={[styles.score, compact && styles.scoreCompact]}>{scoreText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 6,
  },
  blockCompact: { marginTop: 0, padding: 0, backgroundColor: 'transparent', borderWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowCompact: { marginTop: 8, paddingLeft: 52 },
  label: { fontSize: 14, fontWeight: '600', color: '#fff' },
  labelCompact: { fontSize: 12 },
  score: { fontSize: 22, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
  scoreCompact: { fontSize: 14, fontWeight: '600', paddingLeft: 52, marginTop: 2 },
});
