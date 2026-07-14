import { useEffect } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { BookingConfirmationScreen } from '../screens/BookingConfirmationScreen';
import { PrivateReservationModal } from '../components/partido/PrivateReservationModal';
import { useBookingSuccess } from '../contexts/BookingSuccessContext';

/**
 * Overlays globales renderizados como hermanos del stack (dentro del
 * NavigationContainer): cubren cualquier ruta, incluida la que los dispara.
 */
export function GlobalOverlaysHost() {
  const { data, clear } = useBookingSuccess();

  // Con la confirmacion visible, el back de Android la cierra antes de tocar
  // la navegacion (el listener se registra el ultimo, asi que gana).
  useEffect(() => {
    if (data == null) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      clear();
      return true;
    });
    return () => sub.remove();
  }, [data, clear]);

  if (data == null) return null;

  if (data.confirmationKind === 'reservation' || data.matchVisibility === 'private') {
    return <PrivateReservationModal visible data={data} onClose={clear} />;
  }

  return (
    <View style={styles.bookingSuccessOverlay} accessibilityViewIsModal>
      <BookingConfirmationScreen data={data} onClose={clear} />
    </View>
  );
}

const styles = StyleSheet.create({
  /** Por encima del navigator completo: la confirmación no puede quedar recortada. */
  bookingSuccessOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2000,
    elevation: 2000,
  },
});
