const { API_URL } = require('../utils/config');
const { request } = require('../utils/request');

function fetchMyPlayerId(token) {
  if (!token) return Promise.resolve(null);
  return request({
    url: `${API_URL}/players/me`,
    method: 'GET',
    needAuth: true,
  }).then((res) => {
    if (res.statusCode !== 200) return null;
    const json = res.data || {};
    if (json.ok && json.player && json.player.id) return json.player.id;
    return null;
  });
}

function fetchMyPlayerProfile(token) {
  if (!token) return Promise.resolve(null);
  return request({
    url: `${API_URL}/players/me`,
    method: 'GET',
    needAuth: true,
  }).then((res) => {
    if (res.statusCode !== 200) return null;
    const json = res.data || {};
    if (!json.ok || !json.player) return null;
    const p = json.player;
    return {
      id: p.id,
      firstName: p.first_name ?? null,
      lastName: p.last_name ?? null,
      email: p.email ?? null,
      phone: p.phone ?? null,
      eloRating: p.elo_rating ?? null,
      status: p.status ?? null,
    };
  });
}

module.exports = { fetchMyPlayerId, fetchMyPlayerProfile };
