const { API_URL } = require('../utils/config');
const { request } = require('../utils/request');

/**
 * Pago simulado (sin pasarela). Backend: POST /payments/simulate-turn-payment
 * @param {{ booking_id: string, amount_cents: number, participant_id?: string, currency?: string }} body
 * @param {string|null} token
 */
function simulateTurnPayment(body, token) {
  if (!token) return Promise.resolve({ ok: false, error: 'Token requerido' });
  const url = `${API_URL}/payments/simulate-turn-payment`;
  return request({
    url,
    method: 'POST',
    needAuth: true,
    data: Object.assign(
      {
        currency: 'EUR',
        payment_method: 'card',
        always_paid: true,
      },
      body
    ),
  }).then((res) => {
    const json = res.data || {};
    if (res.statusCode === 200 && json.ok && json.paid) {
      return { ok: true, data: json };
    }
    return { ok: false, error: json.error || 'No se pudo simular el pago' };
  });
}

module.exports = { simulateTurnPayment };
