const { API_URL } = require('../utils/config');
const { request } = require('../utils/request');

function fetchMatches(options) {
  const expand = options.expand !== false;
  const activeOnly = options.activeOnly !== false;
  const token = options.token;
  const parts = [];
  if (expand) parts.push('expand=1');
  if (activeOnly) parts.push('active_only=1');
  const qs = parts.length ? `?${parts.join('&')}` : '';
  const url = `${API_URL}/matches${qs}`;

  return request({
    url,
    method: 'GET',
    needAuth: !!token,
  }).then((res) => {
    if (res.statusCode !== 200) return [];
    const json = res.data || {};
    if (Array.isArray(json.matches)) return json.matches;
    return [];
  });
}

function fetchMatchById(matchId, token) {
  const url = `${API_URL}/matches/${encodeURIComponent(matchId)}?expand=1`;
  return request({
    url,
    method: 'GET',
    needAuth: !!token,
  }).then((res) => {
    if (res.statusCode !== 200) return null;
    const json = res.data || {};
    if (json.ok && json.match) return json.match;
    return null;
  });
}

function prepareJoin(matchId, slotIndex, token) {
  if (!token) return Promise.resolve({ ok: false, error: 'Token requerido' });
  const url = `${API_URL}/matches/${encodeURIComponent(matchId)}/prepare-join`;
  return request({
    url,
    method: 'POST',
    needAuth: true,
    data: { slot_index: slotIndex },
  }).then((res) => {
    const json = res.data || {};
    if (res.statusCode === 200 && json.ok && json.participant_id && json.booking_id) {
      return {
        participantId: json.participant_id,
        bookingId: json.booking_id,
        shareAmountCents: json.share_amount_cents != null ? Number(json.share_amount_cents) : null,
      };
    }
    return { ok: false, error: json.error || 'No se pudo preparar' };
  });
}

/**
 * @param {object} params
 * @param {string} params.court_id
 * @param {string} params.organizer_player_id
 * @param {string} params.start_at ISO
 * @param {string} params.end_at ISO
 * @param {number} params.total_price_cents
 * @param {string} [params.timezone]
 * @param {'public'|'private'} [params.visibility]
 * @param {boolean} [params.competitive]
 * @param {string|null} [params.gender]
 * @param {string} [params.source_channel]
 * @param {string|null} token
 */
function createMatchWithBooking(params, token) {
  if (!token) return Promise.resolve(null);
  const url = `${API_URL}/matches/create-with-booking`;
  const body = {
    court_id: params.court_id,
    organizer_player_id: params.organizer_player_id,
    start_at: params.start_at,
    end_at: params.end_at,
    total_price_cents: params.total_price_cents,
    timezone: params.timezone || 'Europe/Madrid',
    visibility: params.visibility === 'private' ? 'private' : 'public',
    competitive: params.competitive !== false,
    gender: params.gender != null ? params.gender : 'any',
    source_channel: params.source_channel || 'mobile',
  };
  return request({
    url,
    method: 'POST',
    needAuth: true,
    data: body,
  }).then((res) => {
    const json = res.data || {};
    if ((res.statusCode === 201 || res.statusCode === 200) && json.ok && json.match && json.booking) {
      const b = json.booking;
      return {
        ok: true,
        match: json.match,
        bookingId: b.id,
        organizerParticipantId: b.organizer_participant_id || b.organizerParticipantId,
      };
    }
    return { ok: false, error: json.error || 'No se pudo crear el partido' };
  });
}

module.exports = { fetchMatches, fetchMatchById, prepareJoin, createMatchWithBooking };
