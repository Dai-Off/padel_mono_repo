const SESSION_KEY = 'wematch_session';
const LOCAL_BOOKINGS_KEY = 'wematch_local_bookings';
const SEARCH_DATE_KEY = 'wematch_search_date';

function getSession() {
  try {
    const raw = wx.getStorageSync(SESSION_KEY);
    if (raw == null || raw === '') return null;
    if (typeof raw === 'object') return raw;
    return JSON.parse(String(raw));
  } catch (_) {
    return null;
  }
}

function setSession(data) {
  wx.setStorageSync(SESSION_KEY, data);
}

function clearSession() {
  wx.removeStorageSync(SESSION_KEY);
}

function getLocalBookings() {
  try {
    const raw = wx.getStorageSync(LOCAL_BOOKINGS_KEY);
    if (!raw) return [];
    return Array.isArray(raw) ? raw : [];
  } catch (_) {
    return [];
  }
}

function addLocalBooking(booking) {
  const list = getLocalBookings();
  list.unshift({ ...booking, id: `local_${Date.now()}`, createdAt: new Date().toISOString() });
  wx.setStorageSync(LOCAL_BOOKINGS_KEY, list);
}

function getSearchDate() {
  try {
    return wx.getStorageSync(SEARCH_DATE_KEY) || '';
  } catch (_) {
    return '';
  }
}

function setSearchDate(yyyyMmDd) {
  wx.setStorageSync(SEARCH_DATE_KEY, yyyyMmDd);
}

module.exports = {
  SESSION_KEY,
  getSession,
  setSession,
  clearSession,
  LOCAL_BOOKINGS_KEY,
  getLocalBookings,
  addLocalBooking,
  getSearchDate,
  setSearchDate,
};
