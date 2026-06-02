import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme';

export const FRIENDLY_ELO_MIN = 0;
export const FRIENDLY_ELO_MAX = 7;
export const FRIENDLY_ELO_STEP = 0.5;

export function snapFriendlyElo(value: number): number {
  const snapped = Math.round(value / FRIENDLY_ELO_STEP) * FRIENDLY_ELO_STEP;
  return Math.round(Math.min(FRIENDLY_ELO_MAX, Math.max(FRIENDLY_ELO_MIN, snapped)) * 10) / 10;
}

export function formatFriendlyElo(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ',');
}

export function defaultFriendlyRange(organizerElo: number | null | undefined): {
  eloMin: number;
  eloMax: number;
} {
  const elo = organizerElo != null && Number.isFinite(organizerElo) ? organizerElo : 3.5;
  return {
    eloMin: snapFriendlyElo(elo - 1),
    eloMax: snapFriendlyElo(elo + 1),
  };
}

type FriendlyLevelRangeSectionProps = {
  restrictByLevel: boolean;
  onRestrictByLevelChange: (value: boolean) => void;
  eloMin: number;
  eloMax: number;
  onEloMinChange: (value: number) => void;
  onEloMaxChange: (value: number) => void;
};

function LevelStepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  const canDec = value > FRIENDLY_ELO_MIN + 1e-9;
  const canInc = value < FRIENDLY_ELO_MAX - 1e-9;

  return (
    <View style={styles.stepperBlock}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperRow}>
        <Pressable
          onPress={() => canDec && onChange(snapFriendlyElo(value - FRIENDLY_ELO_STEP))}
          style={[styles.stepBtn, !canDec && styles.stepBtnDisabled]}
          disabled={!canDec}
        >
          <Ionicons name="remove" size={18} color={canDec ? '#fff' : '#6b7280'} />
        </Pressable>
        <Text style={styles.stepValue}>{formatFriendlyElo(value)}</Text>
        <Pressable
          onPress={() => canInc && onChange(snapFriendlyElo(value + FRIENDLY_ELO_STEP))}
          style={[styles.stepBtn, !canInc && styles.stepBtnDisabled]}
          disabled={!canInc}
        >
          <Ionicons name="add" size={18} color={canInc ? '#fff' : '#6b7280'} />
        </Pressable>
      </View>
    </View>
  );
}

export function FriendlyLevelRangeSection({
  restrictByLevel,
  onRestrictByLevelChange,
  eloMin,
  eloMax,
  onEloMinChange,
  onEloMaxChange,
}: FriendlyLevelRangeSectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>Nivel de jugadores</Text>
          <Text style={styles.sectionSub}>
            {restrictByLevel
              ? `Solo nivel ${formatFriendlyElo(eloMin)} – ${formatFriendlyElo(eloMax)}`
              : 'Cualquier nivel puede unirse'}
          </Text>
        </View>
        <Switch
          value={restrictByLevel}
          onValueChange={onRestrictByLevelChange}
          trackColor={{ false: '#e5e7eb', true: theme.auth.accent }}
          thumbColor="#fff"
        />
      </View>

      {restrictByLevel ? (
        <View style={styles.steppers}>
          <LevelStepper
            label="Nivel mínimo"
            value={eloMin}
            onChange={(next) => {
              onEloMinChange(next);
              if (next > eloMax) onEloMaxChange(next);
            }}
          />
          <LevelStepper
            label="Nivel máximo"
            value={eloMax}
            onChange={(next) => {
              onEloMaxChange(next);
              if (next < eloMin) onEloMinChange(next);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  sectionSub: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  steppers: { flexDirection: 'row', gap: 12 },
  stepperBlock: { flex: 1, gap: 8 },
  stepperLabel: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: theme.auth.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnDisabled: { backgroundColor: '#e5e7eb' },
  stepValue: { fontSize: 18, fontWeight: '700', color: '#111827', minWidth: 48, textAlign: 'center' },
});
