import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../theme';

type Variant = 'primary' | 'ghost';

type Props = {
  label: string;
  loading: boolean;
  disabled?: boolean;
  variant?: Variant;
  onPress: () => void;
};

/** El texto reserva el ancho; el spinner se superpone sin mover el layout. */
export function LoadingButton({ label, loading, disabled, variant = 'primary', onPress }: Props) {
  const isDisabled = loading || disabled;
  const isGhost = variant === 'ghost';
  return (
    <Pressable
      style={[
        styles.btn,
        isGhost ? styles.ghost : styles.primary,
        isDisabled && (isGhost ? styles.ghostBusy : styles.primaryBusy),
      ]}
      disabled={isDisabled}
      onPress={onPress}
    >
      <View style={styles.inner}>
        <Text
          style={[
            isGhost ? styles.ghostLabel : styles.primaryLabel,
            loading && styles.labelHidden,
          ]}
        >
          {label}
        </Text>
        {loading ? (
          <View style={styles.spinner} pointerEvents="none">
            <ActivityIndicator color="#fff" size="small" />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

/** @deprecated Usa LoadingButton con variant="primary". */
export function PrimaryLoadingButton(props: Omit<Props, 'variant'>) {
  return <LoadingButton {...props} variant="primary" />;
}

const styles = StyleSheet.create({
  btn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  inner: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  labelHidden: { opacity: 0 },
  spinner: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: theme.auth.accent },
  primaryBusy: { opacity: 0.88 },
  primaryLabel: { color: '#fff', fontSize: 14, fontWeight: '700' },
  ghost: { backgroundColor: '#262626' },
  ghostBusy: { opacity: 0.88 },
  ghostLabel: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
