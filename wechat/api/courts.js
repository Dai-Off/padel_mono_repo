const { API_URL } = require('../utils/config');
const { request } = require('../utils/request');

function fetchCourtsByClubId(clubId) {
  const url = `${API_URL}/courts?club_id=${encodeURIComponent(clubId)}`;
  return request({ url, method: 'GET' }).then((res) => {
    if (res.statusCode !== 200) return [];
    const json = res.data || {};
    return Array.isArray(json.courts) ? json.courts : [];
  });
}

module.exports = { fetchCourtsByClubId };
