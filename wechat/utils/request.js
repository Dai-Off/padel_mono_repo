const { API_URL, SUPABASE_URL, SUPABASE_ANON_KEY } = require('./config');
const { getSession, setSession, clearSession } = require('./storage');

function parseBody(data) {
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

let refreshInFlight = null;

function supabaseConfigured() {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/**
 * GoTrue: POST /auth/v1/token?grant_type=refresh_token (mismo flujo que supabase-js en web-app).
 * @returns {Promise<boolean>}
 */
function refreshAccessToken() {
  if (refreshInFlight) return refreshInFlight;

  const s = getSession();
  if (!s || !s.refresh_token) {
    return Promise.resolve(false);
  }
  if (!supabaseConfigured()) {
    return Promise.resolve(false);
  }

  const url = `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`;
  refreshInFlight = new Promise((resolve) => {
    wx.request({
      url,
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      data: { refresh_token: s.refresh_token },
      success(res) {
        const json = parseBody(res.data);
        if (res.statusCode !== 200 || !json.access_token) {
          clearSession();
          resolve(false);
          return;
        }
        setSession({
          access_token: json.access_token,
          refresh_token: json.refresh_token || s.refresh_token,
          expires_at: json.expires_at,
          user: s.user,
        });
        resolve(true);
      },
      fail() {
        clearSession();
        resolve(false);
      },
    });
  }).finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

function reLaunchLogin() {
  try {
    wx.reLaunch({ url: '/pages/login/login' });
  } catch (_) {
    /* ignore */
  }
}

/**
 * @param {{ url: string, method?: string, data?: object, header?: object, needAuth?: boolean }} opts
 * @param {boolean} [didRefresh]
 */
function request(opts, didRefresh) {
  const { url, method = 'GET', data, header = {}, needAuth = false } = opts;
  return new Promise((resolve, reject) => {
    const h = Object.assign({ 'Content-Type': 'application/json' }, header);
    if (needAuth) {
      const s = getSession();
      if (s && s.access_token) {
        h.Authorization = `Bearer ${s.access_token}`;
      }
    }
    wx.request({
      url,
      method,
      data,
      header: h,
      success(res) {
        if (res.statusCode === 401 && needAuth && !didRefresh) {
          refreshAccessToken().then((ok) => {
            if (ok) {
              request(opts, true).then(resolve).catch(reject);
            } else {
              clearSession();
              reLaunchLogin();
              resolve(res);
            }
          });
          return;
        }
        resolve(res);
      },
      fail(err) {
        reject(err);
      },
    });
  });
}

module.exports = { request, refreshAccessToken, supabaseConfigured };
