const { AI_MATCH_WEBHOOK_URL } = require('../utils/config');

const AI_MATCH_SESSION_KEY = 'ai_match_session_id';

function getSessionId() {
  try {
    let id = wx.getStorageSync(AI_MATCH_SESSION_KEY);
    if (id) return String(id);
    id = `wechat-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    wx.setStorageSync(AI_MATCH_SESSION_KEY, id);
    return id;
  } catch (_) {
    return `wechat-${Date.now()}`;
  }
}

function extractTextFromUnknown(payload) {
  if (typeof payload === 'string') return payload;
  if (Array.isArray(payload)) {
    for (let i = 0; i < payload.length; i += 1) {
      const text = extractTextFromUnknown(payload[i]);
      if (text) return text;
    }
    return null;
  }
  if (payload && typeof payload === 'object') {
    const record = payload;
    const directCandidates = [
      record.output,
      record.response,
      record.answer,
      record.text,
      record.message,
      record.content,
    ];
    for (let i = 0; i < directCandidates.length; i += 1) {
      const parsed = extractTextFromUnknown(directCandidates[i]);
      if (parsed) return parsed;
    }
    if (record.data) {
      const parsed = extractTextFromUnknown(record.data);
      if (parsed) return parsed;
    }
  }
  return null;
}

function searchAiMatch(chatInput) {
  const urlBase = (AI_MATCH_WEBHOOK_URL || '').trim();
  if (!urlBase) {
    return Promise.resolve({
      ok: false,
      error: 'Configura AI_MATCH_WEBHOOK_URL en utils/config.js (como EXPO_PUBLIC_AI_MATCH_WEBHOOK_URL).',
    });
  }

  const sessionId = getSessionId();
  let url = urlBase;
  try {
    const u = new URL(urlBase);
    u.searchParams.set('sessionId', sessionId);
    url = u.toString();
  } catch (_) {
    const sep = urlBase.indexOf('?') >= 0 ? '&' : '?';
    url = `${urlBase}${sep}sessionId=${encodeURIComponent(sessionId)}`;
  }

  return new Promise((resolve) => {
    wx.request({
      url,
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: {
        action: 'sendMessage',
        sessionId,
        chatInput,
      },
      success(res) {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          resolve({ ok: false, error: 'La IA no respondió correctamente.' });
          return;
        }
        let rawText = '';
        if (typeof res.data === 'string') {
          rawText = res.data;
        } else if (res.data != null) {
          try {
            rawText = JSON.stringify(res.data);
          } catch (_) {
            rawText = String(res.data);
          }
        }
        if (!rawText || !String(rawText).trim()) {
          resolve({ ok: false, error: 'La IA devolvió una respuesta vacía.' });
          return;
        }
        let text = null;
        try {
          const parsed = JSON.parse(rawText);
          text = extractTextFromUnknown(parsed);
        } catch (_) {
          text = String(rawText).trim();
        }
        if (!text) {
          resolve({ ok: false, error: 'No se pudo leer la respuesta de la IA.' });
          return;
        }
        if (/service refused the connection|perhaps it is offline/i.test(text)) {
          resolve({
            ok: false,
            error: 'El servicio de IA está temporalmente no disponible. Intenta de nuevo en unos minutos.',
          });
          return;
        }
        resolve({ ok: true, text });
      },
      fail() {
        resolve({ ok: false, error: 'Error de conexión con el servicio de IA.' });
      },
    });
  });
}

module.exports = { searchAiMatch };
