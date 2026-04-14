const { API_URL } = require('../utils/config');
const { request } = require('../utils/request');

function login(email, password) {
  return request({
    url: `${API_URL}/auth/login`,
    method: 'POST',
    data: { email, password },
  }).then((res) => {
    if (res.statusCode !== 200 || !res.data) {
      return { ok: false, error: 'Error de red' };
    }
    return res.data;
  });
}

function register(email, password, name) {
  return request({
    url: `${API_URL}/auth/register`,
    method: 'POST',
    data: {
      email,
      password,
      name: name || undefined,
      source: 'wechat-mini',
    },
  }).then((res) => {
    if (res.statusCode !== 200 || !res.data) {
      return { ok: false, error: 'Error de red' };
    }
    return res.data;
  });
}

module.exports = { login, register };
