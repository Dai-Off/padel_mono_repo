import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme';

const ACCENT = theme.auth.accent;

type Props = {
  /** Mensaje a mostrar; null/'' = oculto. */
  message: string | null;
  /** Se llama al auto-ocultarse. */
  onHide: () => void;
  durationMs?: number;
  variant?: 'success' | 'error';
};

/** Aviso breve no bloqueante con estilo WeMatch (reemplaza Alert.alert para feedback simple). */
export function Toast({ message, onHide, durationMs = 2800, variant = 'success' }: Props) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onHide, durationMs);
    return () => clearTimeout(t);
  }, [message, durationMs, onHide]);

  if (!message) return null;
  const icon = variant === 'error' ? 'alert-circle' : 'checkmark-circle';
  const color = variant === 'error' ? '#F87171' : ACCENT;

  return (
    <View pointerEvents="none" style={styles.wrap}>
      <View style={styles.toast}>
        <Ionicons name={icon} size={18} color={color} />
        <Text style={styles.text} numberOfLines={3}>
          {message}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 40,
    alignItems: 'center',
    paddingHorizontal: 24,
    zIndex: 1000,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: 440,
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  text: { color: '#fff', fontSize: 14, fontWeight: '600', flexShrink: 1 },
});
