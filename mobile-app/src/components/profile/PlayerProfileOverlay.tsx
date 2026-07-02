import { useEffect } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { PublicProfileScreen } from '../../screens/PublicProfileScreen';

type Props = {
  /** Jugador a mostrar; null oculta el overlay. */
  playerId: string | null;
  onClose: () => void;
  /** Navegar a otro jugador dentro del mismo overlay (p. ej. compañeros frecuentes). */
  onOpenPlayer?: (playerId: string) => void;
};

/**
 * Muestra la PublicProfileScreen (perfil ajeno) como overlay a pantalla completa
 * SOBRE la pantalla actual, sin depender del enrutado de MainApp. Útil cuando la
 * pantalla origen ya está dentro de un Modal (detalle de torneo) o tiene
 * precedencia de navegación sobre el perfil (chat): evita Modales anidados, que
 * RN no presenta de forma fiable. Intercepta el botón atrás de Android.
 */
export function PlayerProfileOverlay({ playerId, onClose, onOpenPlayer }: Props) {
  useEffect(() => {
    if (!playerId) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [playerId, onClose]);

  if (!playerId) return null;
  return (
    <View style={styles.overlay}>
      <PublicProfileScreen playerId={playerId} onBack={onClose} onOpenPlayer={onOpenPlayer} />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    backgroundColor: '#0A0A0A',
  },
});
