const { API_URL } = require('../utils/config');
const { request } = require('../utils/request');

/** Mismo contrato que mobile-app/src/api/home.ts: recuentos por longitud de arrays. */
function parseJsonBody(data) {
  if (data == null) return {};
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return {};
    }
  }
  return data;
}

function fetchCount(url, key, token) {
  return request({
    url,
    method: 'GET',
    needAuth: !!token,
  }).then((res) => {
    if (res.statusCode !== 200) return 0;
    const json = parseJsonBody(res.data);
    const arr = json[key];
    return Array.isArray(arr) ? arr.length : 0;
  });
}

/**
 * courtsFree = |GET /courts| (lista de pistas expuesta por API; no es disponibilidad en vivo).
 * tournaments/classesToday siguen en 0 hasta que exista endpoint (igual que RN).
 */
function fetchHomeStats(token) {
  return Promise.all([
    fetchCount(`${API_URL}/courts`, 'courts', token),
    fetchCount(`${API_URL}/players`, 'players', token),
  ]).then(([courtsFree, playersLooking]) => ({
    courtsFree,
    playersLooking,
    classesToday: 0,
    tournaments: 0,
  }));
}

module.exports = { fetchHomeStats };
