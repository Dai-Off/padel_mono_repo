import type { IPaymentProvider } from './types';

/**
 * Stub de Alipay para el despliegue en China.
 *
 * Pendiente de implementación (flujo real):
 *  - Crear orden (alipay.trade.precreate / page.pay según canal) con el SDK de Alipay.
 *  - Manejar el callback asíncrono (notify_url) para confirmar el pago y
 *    recién ahí marcar la reserva como `confirmed` + registrar la transacción.
 *  - Env vars esperadas:
 *      ALIPAY_APP_ID, ALIPAY_PRIVATE_KEY, ALIPAY_PUBLIC_KEY,
 *      ALIPAY_GATEWAY (opcional), ALIPAY_NOTIFY_URL.
 *
 * Se activa solo con PAYMENT_PROVIDER=alipay.
 */
export class AlipayProvider implements IPaymentProvider {
  async recordPayment(_bookingId: string): Promise<{ ok: boolean; error?: string }> {
    return {
      ok: false,
      error: 'Alipay no implementado todavía. Configurar credenciales y flujo de notificación.',
    };
  }
}
