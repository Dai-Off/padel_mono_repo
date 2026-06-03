import { Pressable, StyleSheet, Text, View } from 'react-native';

const ACCENT = '#F18F34';

type Props = {
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
};

/**
 * Interruptor de visibilidad en las búsquedas de la IA de afinidad. Diseño
 * compartido para que se vea igual en todas las pantallas donde aparece
 * (Preferencias y el modal de afinidad).
 */
export function AffinityVisibilityToggle({ value, onChange, disabled }: Props) {
  return (
    <Pressable
      onPress={() => {
        if (!disabled) onChange(!value);
      }}
      style={styles.row}
      disabled={disabled}
    >
      <View style={styles.textWrap}>
        <Text style={styles.title}>Visible en búsquedas de afinidad</Text>
        <Text style={styles.subtitle}>
          Otros jugadores pueden encontrarte al buscar compañero con la IA. Es
          necesario para poder buscar tú también.
        </Text>
      </View>
      <View style={[styles.track, value && styles.trackOn]}>
        <View style={[styles.thumb, value && styles.thumbOn]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  textWrap: { flex: 1 },
  title: { color: '#fff', fontSize: 14, fontWeight: '500' },
  subtitle: { color: '#9CA3AF', fontSize: 12, marginTop: 2, lineHeight: 16 },
  track: {
    position: 'relative',
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  trackOn: { backgroundColor: ACCENT },
  thumb: {
    position: 'absolute',
    top: 2,
    left: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  thumbOn: { transform: [{ translateX: 20 }] },
});
