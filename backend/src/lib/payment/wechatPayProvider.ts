import type { IPaymentProvider } from './types';

/**
 * Stub de WeChat Pay para el despliegue en China.
 *
 * Pendiente de implementación (flujo real, distinto al cobro en mostrador):
 *  - Crear orden de prepago (Unified Order / JSAPI o Native) contra la API de WeChat Pay v3.
 *  - Devolver los parámetros para invocar el pago desde el cliente (WeChat/JSAPI).
 *  - Manejar el callback de notificación (webhook) para confirmar el pago y
 *    recién ahí marcar la reserva como `confirmed` + registrar la transacción.
 *  - Env vars esperadas:
 *      WECHATPAY_MCH_ID, WECHATPAY_APP_ID, WECHATPAY_API_V3_KEY,
 *      WECHATPAY_CERT_SERIAL, WECHATPAY_PRIVATE_KEY, WECHATPAY_NOTIFY_URL.
 *
 * Se activa solo con PAYMENT_PROVIDER=wechatpay.
 */
export class WeChatPayProvider implements IPaymentProvider {
  async recordPayment(_bookingId: string): Promise<{ ok: boolean; error?: string }> {
    return {
      ok: false,
      error: 'WeChat Pay no implementado todavía. Configurar credenciales y flujo de notificación.',
    };
  }
}
