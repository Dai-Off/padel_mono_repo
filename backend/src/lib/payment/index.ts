import type { IPaymentProvider } from './types';
import { MockPaymentProvider } from './mockProvider';

let provider: IPaymentProvider | null = null;

function getProvider(): IPaymentProvider {
  if (!provider) {
    provider = new MockPaymentProvider();
    // Futuro: PAYMENT_PROVIDER=alipay|wechatpay → instanciar otro provider
  }
  return provider;
}

/**
 * Registra un pago para una reserva pendiente.
 * Admin cobró en mostrador → simulación o pasarela china.
 */
export async function recordPayment(bookingId: string): Promise<{ ok: boolean; error?: string }> {
  return getProvider().recordPayment(bookingId);
}
