import { Dimensions, StyleSheet, View } from 'react-native';
import { ActionCard } from './ActionCard';

const { width } = Dimensions.get('window');
const PAD = 20;
const GAP = 16;
const CARD_WIDTH = (width - PAD * 2 - GAP) / 2;

const ACTIONS = [
  { icon: 'calendar' as const, label: 'Reservar', xpBonus: '+50 XP', variant: 'cyan' as const },
  { icon: 'people' as const, label: 'Partidos', xpBonus: '+100 XP', variant: 'blue' as const },
  { icon: 'school' as const, label: 'Clases', xpBonus: '+150 XP', variant: 'green' as const },
  { icon: 'trophy' as const, label: 'Torneos', xpBonus: '+300 XP', variant: 'cyan' as const },
];

export function ActionGrid() {
  return (
    <View style={styles.grid}>
      {ACTIONS.map((a) => (
        <View key={a.label} style={[styles.cardWrap, { width: CARD_WIDTH }]}>
          <ActionCard
            icon={a.icon}
            label={a.label}
            xpBonus={a.xpBonus}
            variant={a.variant}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: PAD,
    marginBottom: 32,
    gap: GAP,
  },
  cardWrap: {},
});
