const { API_URL } = require('../utils/config');
const { request } = require('../utils/request');

function fetchClubById(id, accessToken) {
  if (!accessToken) return Promise.resolve(null);
  return request({
    url: `${API_URL}/clubs/${id}`,
    method: 'GET',
    needAuth: true,
  }).then((res) => {
    if (res.statusCode !== 200) return null;
    const json = res.data || {};
    return json.club || null;
  });
}

module.exports = { fetchClubById };
