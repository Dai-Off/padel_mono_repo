import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { BookingConfirmationData } from '../screens/BookingConfirmationScreen';

type BookingSuccessValue = {
  data: BookingConfirmationData | null;
  /** Muestra la confirmacion de reserva/partido por encima de toda la app. */
  show: (data: BookingConfirmationData) => void;
  clear: () => void;
};

const BookingSuccessContext = createContext<BookingSuccessValue | null>(null);

/**
 * Estado global de la confirmacion post-reserva (antes bookingSuccessData en
 * MainApp). Vive por encima del navigator: un flujo puede cerrarse (pop) y la
 * confirmacion sigue visible sobre la pantalla a la que se vuelve.
 */
export function BookingSuccessProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<BookingConfirmationData | null>(null);

  const show = useCallback((next: BookingConfirmationData) => setData(next), []);
  const clear = useCallback(() => setData(null), []);

  const value = useMemo(() => ({ data, show, clear }), [data, show, clear]);

  return (
    <BookingSuccessContext.Provider value={value}>{children}</BookingSuccessContext.Provider>
  );
}

export function useBookingSuccess(): BookingSuccessValue {
  const ctx = useContext(BookingSuccessContext);
  if (!ctx) {
    throw new Error('useBookingSuccess must be used within BookingSuccessProvider');
  }
  return ctx;
}
