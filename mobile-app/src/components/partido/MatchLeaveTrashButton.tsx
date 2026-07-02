import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  loading: boolean;
  disabled?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
};

/** Botón de salida/cancelar: icono fijo + spinner superpuesto (sin cambiar tamaño). */
export function MatchLeaveTrashButton({ loading, disabled, onPress, accessibilityLabel }: Props) {
  const isDisabled = loading || disabled;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.btn,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Ionicons
        name="exit-outline"
        size={22}
        color="#f87171"
        style={loading ? styles.iconHidden : undefined}
      />
      {loading ? (
        <View style={styles.spinner} pointerEvents="none">
          <ActivityIndicator color="#f87171" size="small" />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconHidden: { opacity: 0 },
  spinner: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.45 },
});
