import type { ReactNode } from 'react';

type StripeProviderProps = {
  children: ReactNode;
  publishableKey?: string;
  urlScheme?: string;
};

export function StripeProvider({ children }: StripeProviderProps) {
  return <>{children}</>;
}

const WEB_PAY_MSG =
  'Los pagos con tarjeta solo están disponibles en la app en iOS o Android, no en el navegador.';

export function useStripe() {
  return {
    initPaymentSheet: async () => ({
      error: { code: 'Failed', message: WEB_PAY_MSG } as { code: string; message: string },
    }),
    presentPaymentSheet: async () => ({
      error: { code: 'Canceled', message: WEB_PAY_MSG } as { code: string; message: string },
    }),
  };
}
