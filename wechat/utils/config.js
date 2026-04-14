/**
 * Base URL del backend (misma convención que mobile-app/src/config.ts).
 * En producción: configurar vía ext.json del mini programa o reemplazar aquí antes del build.
 */
const API_URL = 'http://localhost:3000'.replace(/\/+$/, '');

/** Webhook n8n IA (opcional). Misma URL que EXPO_PUBLIC_AI_MATCH_WEBHOOK_URL en mobile-app. */
const AI_MATCH_WEBHOOK_URL = '';

/**
 * Mismo proyecto que el backend (Dashboard → Settings → API).
 * Necesarios para renovar el JWT cuando expira, sin endpoint propio en el backend.
 * Añadir `https://<ref>.supabase.co` a dominios válidos de request en WeChat.
 */
const SUPABASE_URL = ''.replace(/\/+$/, '');
const SUPABASE_ANON_KEY = '';

module.exports = { API_URL, AI_MATCH_WEBHOOK_URL, SUPABASE_URL, SUPABASE_ANON_KEY };
