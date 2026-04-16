const { API_URL } = require('../utils/config');
const { request } = require('../utils/request');

/**
 * @param {{ dateFrom?: string, dateTo?: string, indoor?: boolean, glassType?: string }} options
 */
function fetchSearchCourts(options) {
  const o = options || {};
  const parts = [];
  if (o.dateFrom) parts.push(`date_from=${encodeURIComponent(o.dateFrom)}`);
  if (o.dateTo) parts.push(`date_to=${encodeURIComponent(o.dateTo)}`);
  if (o.indoor !== undefined) parts.push(`indoor=${encodeURIComponent(String(o.indoor))}`);
  if (o.glassType) parts.push(`glass_type=${encodeURIComponent(o.glassType)}`);
  const qs = parts.length ? `?${parts.join('&')}` : '';
  const url = `${API_URL}/search/courts${qs}`;

  return request({ url, method: 'GET' }).then((res) => {
    if (res.statusCode !== 200) return [];
    const json = res.data || {};
    if (!Array.isArray(json.results)) return [];
    return json.results;
  });
}

module.exports = { fetchSearchCourts };
