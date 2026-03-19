/**
 * Contrato para proveedores de pago.
 * Por ahora solo Mock. En el futuro: Alipay, WeChat Pay, etc.
 */
export interface IPaymentProvider {
  /**
   * Registra un pago (cobro en mostrador por admin).
   * Simula o delega en la pasarela real.
   */
  recordPayment(bookingId: string): Promise<{ ok: boolean; error?: string }>;
}
